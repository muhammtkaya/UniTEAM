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

  /* ---------- Paylaşım ---------- */

  // Belgeyi e-posta ile paylaş (SECURITY DEFINER fonksiyon üzerinden).
  async shareByEmail(docId, email, role) {
    this._assert();
    const { data, error } = await this.client().rpc("share_document", {
      p_document_id: docId, p_email: email, p_role: role,
    });
    if (error) throw error;
    return data;
  },

  // Belgenin paylaşımlarını listele (e-posta + rol) — yalnız sahibi.
  async listShares(docId) {
    this._assert();
    const { data, error } = await this.client().rpc("list_document_shares", { p_document_id: docId });
    if (error) throw error;
    return data;
  },

  // Bir paylaşımı kaldır (owner RLS ile doğrudan silme).
  async revokeShare(docId, userId) {
    this._assert();
    const { error } = await this.client().from("document_shares").delete()
      .eq("document_id", docId).eq("user_id", userId);
    if (error) throw error;
  },

  /* ---------- Link ile paylaşım ---------- */

  async createLink(docId, role, expiresAt = null) {
    this._assert();
    // Tahmin edilemez token (iki UUID, tirelersiz).
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { data, error } = await this.client().from("share_links")
      .insert({ document_id: docId, token, role, is_public: false, expires_at: expiresAt, created_by: XL.auth.user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async listLinks(docId) {
    this._assert();
    const { data, error } = await this.client().from("share_links")
      .select("id, token, role, expires_at, created_at").eq("document_id", docId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async revokeLink(linkId) {
    this._assert();
    const { error } = await this.client().from("share_links").delete().eq("id", linkId);
    if (error) throw error;
  },

  // Token'ı bozdur → erişim ver, document_id döner.
  async redeemLink(token) {
    this._assert();
    const { data, error } = await this.client().rpc("redeem_share_link", { p_token: token });
    if (error) throw error;
    return data;
  },

  // Bir token için paylaşılabilir tam URL.
  linkUrl(token) { return location.origin + location.pathname + "?link=" + token; },

  // Sayfa açılışında ?link=<token> varsa: giriş varsa bozdur+aç, yoksa giriş iste.
  async handleUrlLink() {
    const token = new URLSearchParams(location.search).get("link");
    if (!token) return;
    if (!this.enabled()) {
      if (XL.auth && !XL.auth.user) XL.auth.openModal();  // giriş sonrası tekrar denenir
      return;
    }
    // URL'yi temizle (tekrar bozdurmayı önle)
    history.replaceState(null, "", location.origin + location.pathname);
    XL.status("Paylaşılan belge açılıyor…");
    try {
      const docId = await this.redeemLink(token);
      await this.openDoc(docId);
    } catch (e) {
      console.error(e);
      alert("Bağlantı açılamadı: " + (e.message || e));
      XL.status("");
    }
  },

  /* ---------- UI (workspace ile köprü) ---------- */

  // Etkin belgeyi buluta kaydet (yeni ise oluştur, varsa güncelle).
  async saveActive() {
    if (!this.enabled()) return alert("Önce giriş yapın (👤 Giriş).");
    const doc = XL.ws.active();
    if (!doc) return;
    XL.ws.persistNow(); // doc.data güncel olsun
    XL.status("Buluta kaydediliyor…");
    try {
      const id = await this.saveFull({ cloudId: doc.cloudId, type: doc.type, name: doc.name, data: doc.data });
      doc.cloudId = id;
      XL.ws._save(doc); // cloudId'yi yerelde de kalıcılaştır
      XL.status("☁ Buluta kaydedildi: " + doc.name);
    } catch (e) {
      console.error(e);
      alert("Buluta kaydedilemedi: " + (e.message || e));
      XL.status("");
    }
  },

  // Bulut belgeleri panelini aç.
  async openPicker() {
    if (!this.enabled()) return alert("Önce giriş yapın (👤 Giriş).");
    XL.showPanel("Bulut Belgelerim", '<p class="muted">Yükleniyor…</p>');
    const body = document.getElementById("panel-body");
    let rows;
    try { rows = await this.list(); }
    catch (e) { body.innerHTML = '<p class="muted">Hata: ' + XL.esc(e.message || String(e)) + "</p>"; return; }
    if (!rows.length) {
      body.innerHTML = '<p class="muted">Henüz bulut belgen yok. Bir belgeyi “☁ Buluta kaydet” ile yükle.</p>';
      return;
    }
    const icon = { xlsx: "📊", docx: "📄", pptx: "📙" };
    const me = XL.auth.user.id;
    body.innerHTML = '<div class="cloud-list">' + rows.map((r) => {
      const mine = r.owner_id === me;
      return `<div class="cloud-item" data-id="${r.id}" data-name="${XL.esc(r.name)}" title="Aç">
         <span class="ci-ic">${icon[r.type] || "📄"}</span>
         <span class="ci-name">${XL.esc(r.name)}${mine ? "" : ' <small class="ci-shared">paylaşılan</small>'}</span>
         ${mine ? `<button class="ci-share" data-share="${r.id}" title="Paylaş">👥</button>
                   <button class="ci-del" data-del="${r.id}" title="Buluttan sil">🗑</button>` : ""}
       </div>`;
    }).join("") + "</div>";

    body.querySelectorAll(".cloud-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]") || e.target.closest("[data-share]")) return;
        this.openDoc(el.dataset.id);
      });
    });
    body.querySelectorAll("[data-share]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = b.closest(".cloud-item");
        this.openShare(b.dataset.share, item.dataset.name);
      });
    });
    body.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Bu belge BULUTTAN silinsin mi? (yereldeki kopya kalır)")) return;
        try { await this.remove(b.dataset.del); this.openPicker(); }
        catch (err) { alert("Silinemedi: " + (err.message || err)); }
      });
    });
  },

  // Bir belgenin paylaşım panelini aç (e-posta ile paylaş + mevcut paylaşımlar).
  async openShare(docId, docName) {
    if (!this.enabled()) return alert("Önce giriş yapın.");
    const roles = [["viewer", "Görüntüleyen"], ["commenter", "Yorumcu"], ["editor", "Düzenleyen"]];
    XL.showPanel("Paylaş — " + (docName || ""), `
      <div class="share-ui">
        <button class="share-back" id="sh-back">← Belgelerim</button>
        <div class="share-form">
          <input type="email" id="sh-email" placeholder="kullanici@eposta.com">
          <select id="sh-role">${roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <button id="sh-add" class="share-add">Paylaş</button>
        </div>
        <div id="sh-msg" class="share-msg hidden"></div>
        <div class="share-sub">Erişimi olanlar</div>
        <div id="sh-list"><p class="muted">Yükleniyor…</p></div>
        <div class="share-sub">Bağlantıyla paylaş</div>
        <div class="share-form">
          <select id="lk-role">${roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <button id="lk-add" class="share-add">🔗 Oluştur</button>
        </div>
        <div id="lk-list"><p class="muted">Yükleniyor…</p></div>
      </div>`);

    const roleName = Object.fromEntries(roles);
    const msg = (t, kind) => { const e = document.getElementById("sh-msg"); if (!e) return; e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (kind || "error") : " hidden"); };

    const refresh = async () => {
      const list = document.getElementById("sh-list");
      try {
        const shares = await this.listShares(docId);
        list.innerHTML = shares.length
          ? shares.map((s) => `<div class="share-row">
               <span class="sr-email">${XL.esc(s.email)}</span>
               <span class="sr-role">${roleName[s.role] || s.role}</span>
               <button class="sr-del" data-uid="${s.user_id}" title="Erişimi kaldır">✕</button>
             </div>`).join("")
          : '<p class="muted">Henüz kimseyle paylaşılmadı.</p>';
        list.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", async () => {
          try { await this.revokeShare(docId, b.dataset.uid); refresh(); }
          catch (e) { msg(e.message || String(e)); }
        }));
      } catch (e) { list.innerHTML = '<p class="muted">Hata: ' + XL.esc(e.message || String(e)) + "</p>"; }
    };

    const refreshLinks = async () => {
      const list = document.getElementById("lk-list");
      try {
        const links = await this.listLinks(docId);
        list.innerHTML = links.length
          ? links.map((lk) => `<div class="share-row link-row" data-token="${lk.token}">
               <span class="sr-role">${roleName[lk.role] || lk.role}</span>
               <button class="lk-copy" data-token="${lk.token}" title="Bağlantıyı kopyala">📋 Kopyala</button>
               <button class="sr-del" data-lid="${lk.id}" title="Bağlantıyı iptal et">✕</button>
             </div>`).join("")
          : '<p class="muted">Henüz bağlantı yok.</p>';
        list.querySelectorAll(".lk-copy").forEach((b) => b.addEventListener("click", async () => {
          const url = this.linkUrl(b.dataset.token);
          try { await navigator.clipboard.writeText(url); msg("Bağlantı kopyalandı", "ok"); }
          catch { prompt("Bağlantıyı kopyalayın:", url); }
        }));
        list.querySelectorAll("[data-lid]").forEach((b) => b.addEventListener("click", async () => {
          try { await this.revokeLink(b.dataset.lid); refreshLinks(); }
          catch (e) { msg(e.message || String(e)); }
        }));
      } catch (e) { list.innerHTML = '<p class="muted">Hata: ' + XL.esc(e.message || String(e)) + "</p>"; }
    };

    document.getElementById("sh-back").addEventListener("click", () => this.openPicker());
    document.getElementById("sh-add").addEventListener("click", async () => {
      const email = document.getElementById("sh-email").value.trim();
      const role = document.getElementById("sh-role").value;
      if (!email) return msg("E-posta girin.");
      msg("");
      try {
        await this.shareByEmail(docId, email, role);
        document.getElementById("sh-email").value = "";
        msg("Paylaşıldı: " + email, "ok");
        refresh();
      } catch (e) {
        msg(this._shareError(e));
      }
    });
    document.getElementById("lk-add").addEventListener("click", async () => {
      const role = document.getElementById("lk-role").value;
      msg("");
      try {
        const lk = await this.createLink(docId, role);
        const url = this.linkUrl(lk.token);
        try { await navigator.clipboard.writeText(url); msg("Bağlantı oluşturuldu ve kopyalandı", "ok"); }
        catch { msg("Bağlantı oluşturuldu", "ok"); }
        refreshLinks();
      } catch (e) { msg(e.message || String(e)); }
    });
    refresh();
    refreshLinks();
  },

  _shareError(e) {
    const m = (e && e.message) || String(e);
    if (/kayıtlı kullanıcı yok/i.test(m)) return "Bu e-posta ile kayıtlı kullanıcı yok. Önce o kişi hesap açmalı.";
    if (/Kendinizle/i.test(m)) return "Kendinizle paylaşamazsınız.";
    if (/sahibi paylaşabilir/i.test(m)) return "Yalnızca belge sahibi paylaşabilir.";
    return m;
  },

  // Bir bulut belgesini yeni sekmede aç.
  async openDoc(id) {
    XL.status("Bulut belgesi açılıyor…");
    try {
      const full = await this.loadFull(id);
      const d = XL.ws.create(full.type, full.data, full.name);
      d.cloudId = full.cloudId;
      XL.ws._save(d);
      XL.hidePanel();
      XL.status("Açıldı: " + full.name);
    } catch (e) {
      console.error(e);
      alert("Açılamadı: " + (e.message || e));
      XL.status("");
    }
  },
};
