/* cloud.js — bulut belge veri katmanı (Supabase: documents tablosu + Storage)
 *
 * Sorumluluk: giriş yapmış kullanıcının belgelerini bulutla senkronlamak.
 *   - METADATA (ad, tür, referans) → public.documents tablosu
 *   - İÇERİK (byte'lar)            → Storage bucket "documents", ad: "<id>.json"
 *     (storage_provider = 'relay' — BYOS/Drive gelene kadar ara çözüm)
 *
 * Her işlem, giriş yapmış kullanıcının oturumu (JWT) ile yapılır; erişimi
 * veritabanındaki RLS politikaları sınırlar (başkasının belgesi görünmez/yazılmaz).
 *
 * Bu katman UI'dan BAĞIMSIZDIR: yalnız veri okur/yazar. workspace bağlanması D2'de.
 * Not: documents.id bir UUID'dir (DB üretir); uygulamanın yerel doc.id'siyle
 * eşleme D2'de yapılacak.
 */
XL.cloud = {
  client() { return XL.auth && XL.auth.client; },

  // Bulut kullanılabilir mi? (istemci var + giriş yapılmış)
  enabled() { return !!(this.client() && XL.auth.user); },

  _assert() {
    if (!this.client()) throw new Error("Supabase istemcisi yok.");
    if (!XL.auth.user) throw new Error("Giriş yapılmamış.");
  },

  /* ---------- Metadata (documents tablosu) ---------- */

  // Kullanıcının erişebildiği (sahip + paylaşılan), çöpte olmayan belgeler.
  async list() {
    this._assert();
    const { data, error } = await this.client()
      .from("documents")
      .select("id, owner_id, name, type, storage_provider, storage_external_id, storage_etag, updated_at")
      .is("trashed_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getMeta(id) {
    this._assert();
    const { data, error } = await this.client()
      .from("documents").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },

  // Yeni belge satırı oluştur (owner = giriş yapan). Oluşan satırı (id dahil) döner.
  async createMeta({ type, name, folderId = null }) {
    this._assert();
    const { data, error } = await this.client()
      .from("documents")
      .insert({ owner_id: XL.auth.user.id, type, name, folder_id: folderId, storage_provider: "relay" })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateMeta(id, patch) {
    this._assert();
    const { data, error } = await this.client()
      .from("documents").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    this._assert();
    // Önce byte'ı sil (varsa), sonra satırı (cascade değil — storage ayrı).
    await this.client().storage.from("documents").remove([`${id}.json`]).catch(() => {});
    const { error } = await this.client().from("documents").delete().eq("id", id);
    if (error) throw error;
  },

  /* ---------- İçerik (Storage byte'ları) ---------- */

  // doc.data (JS nesnesi) → JSON blob → Storage "<id>.json" (üzerine yaz).
  async putBytes(id, dataObj) {
    this._assert();
    const blob = new Blob([JSON.stringify(dataObj)], { type: "application/json" });
    const { error } = await this.client().storage
      .from("documents")
      .upload(`${id}.json`, blob, { upsert: true, contentType: "application/json" });
    if (error) throw error;
  },

  // Storage "<id>.json" → JSON → doc.data nesnesi.
  async getBytes(id) {
    this._assert();
    const { data, error } = await this.client().storage.from("documents").download(`${id}.json`);
    if (error) throw error;
    const text = await data.text();
    return JSON.parse(text);
  },

  /* ---------- Birleşik yardımcılar ---------- */

  // Tam belge kaydet: yeni ise satır+byte oluştur, varsa güncelle. Bulut id döner.
  // doc = { cloudId?, type, name, data }
  async saveFull(doc) {
    this._assert();
    let id = doc.cloudId;
    if (!id) {
      const row = await this.createMeta({ type: doc.type, name: doc.name });
      id = row.id;
    } else {
      await this.updateMeta(id, { name: doc.name });
    }
    await this.putBytes(id, doc.data);
    // Referansı metadata'ya yaz (hangi byte dosyası).
    await this.updateMeta(id, { storage_external_id: `${id}.json` });
    return id;
  },

  // Tam belge yükle: metadata + byte → { id, type, name, data }
  async loadFull(id) {
    this._assert();
    const meta = await this.getMeta(id);
    const data = await this.getBytes(id);
    return { cloudId: meta.id, type: meta.type, name: meta.name, data };
  },
};
