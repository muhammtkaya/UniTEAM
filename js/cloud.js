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
    // Önce byte'ları sil (ana + sürüm anlık görüntüleri), sonra satırı.
    // (storage ayrı; document_versions satırları FK cascade ile gider.)
    const refs = [XL.byos.mainRef(id)];
    try {
      const vers = await this.listVersions(id);
      vers.forEach((v) => { if (v.storage_external_id) refs.push(v.storage_external_id); });
    } catch (e) { /* sürüm yoksa yoksay */ }
    await this.client().storage.from("documents").remove(refs).catch(() => {});
    const { error } = await this.client().from("documents").delete().eq("id", id);
    if (error) throw error;
  },

  /* ---------- Sürüm geçmişi (document_versions) — Faz 4 ---------- */

  // Etkin belgenin anlık görüntüsünü sürüm olarak sakla (ana byte'ı kopyalayarak).
  async createVersion(docId, label) {
    this._assert();
    // 1) Sürüm satırı (id'yi DB üretir) — created_by = giriş yapan.
    const { data: row, error } = await this.client().from("document_versions")
      .insert({ document_id: docId, label: label || null, created_by: XL.auth.user.id, storage_provider: "relay" })
      .select().single();
    if (error) throw error;
    // 2) Mevcut "<id>.json"u sürüm nesnesine kopyala (sunucu-içi, ucuz).
    const ref = XL.byos.versionRef(docId, row.id);
    try { await this._provider("relay").copy(XL.byos.mainRef(docId), ref); }
    catch (e) { await this.client().from("document_versions").delete().eq("id", row.id); throw e; }
    // 3) Referansı sürüm satırına yaz.
    await this.client().from("document_versions").update({ storage_external_id: ref }).eq("id", row.id);
    return row.id;
  },

  async listVersions(docId) {
    this._assert();
    const { data, error } = await this.client().from("document_versions")
      .select("id, label, created_by, storage_external_id, created_at")
      .eq("document_id", docId).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  // Bir sürümü geri yükle: güvenlik için önce mevcut hali yeni sürüm olarak sakla,
  // sonra sürüm byte'ını ana byte'ın üzerine yaz.
  async restoreVersion(docId, version) {
    this._assert();
    if (!version.storage_external_id) throw new Error(XL.t("Sürüm içeriği yok.", "Version has no content."));
    try { await this.createVersion(docId, XL.t("geri yükleme öncesi", "before restore")); } catch (e) { /* ana byte yoksa atla */ }
    const { data, error } = await this.client().storage.from("documents").download(version.storage_external_id);
    if (error) throw error;
    const obj = JSON.parse(await data.text());
    await this.putBytes(docId, obj);
    return obj;
  },

  /* ---------- Çöp kutusu (soft delete: trashed_at) — Faz 4 ---------- */
  async trash(id)        { this._assert(); const { error } = await this.client().from("documents").update({ trashed_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
  async restoreTrash(id) { this._assert(); const { error } = await this.client().from("documents").update({ trashed_at: null }).eq("id", id); if (error) throw error; },
  async listTrash() {
    this._assert();
    const { data, error } = await this.client().from("documents")
      .select("id, owner_id, name, type, updated_at, trashed_at")
      .not("trashed_at", "is", null).order("trashed_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  /* ---------- Çevrimdışı kuyruk (outbox) — Faz 4 ---------- */
  // Bulut kaydını kuyruğa al (çevrimdışı ya da ağ hatası). Yeniden bağlanınca flush.
  async _enqueue(doc) {
    if (!XL.store || !XL.store.available) return;
    try {
      await XL.store.queueOutbox({
        key: doc.cloudId || ("local:" + doc.id), cloudId: doc.cloudId || null,
        localId: doc.id, type: doc.type, name: doc.name, data: doc.data, ts: Date.now(),
      });
    } catch (e) { console.warn("outbox kuyruğa alınamadı:", e); }
  },
  // Kuyruğu boşalt: her bekleyen kaydı buluta yaz, başarılıyı kuyruktan çıkar.
  async flushOutbox() {
    if (!this.enabled() || !XL.store || !XL.store.available()) return;
    let items = [];
    try { items = await XL.store.loadOutbox(); } catch (e) { return; }
    if (!items.length) return;
    let ok = 0;
    for (const it of items) {
      try {
        const id = await this.saveFull({ cloudId: it.cloudId, type: it.type, name: it.name, data: it.data });
        // Yerel belge hâlâ açıksa cloudId'yi eşle.
        const d = XL.ws && XL.ws.docs && XL.ws.docs.find((x) => x.id === it.localId);
        if (d && !d.cloudId) { d.cloudId = id; XL.ws._save(d); }
        await XL.store.clearOutbox(it.key);
        ok++;
      } catch (e) { /* hâlâ başarısız → kuyrukta kalsın */ }
    }
    if (ok) XL.status(XL.t("☁ Çevrimdışı değişiklikler eşitlendi: ", "☁ Offline changes synced: ") + ok);
  },

  /* ---------- İçerik (Storage byte'ları) ---------- */

  // Belgenin etkin byte sağlayıcısı (BYOS soyutlaması — varsayılan relay).
  _provider(name) { return XL.byos.provider(name || "relay"); },

  // doc.data → sağlayıcıya yaz ("<id>.json"). (BYOS: relay/gdrive/onedrive.)
  async putBytes(id, dataObj, provider) {
    this._assert();
    await this._provider(provider).putBytes(XL.byos.mainRef(id), dataObj);
  },

  // Sağlayıcıdan "<id>.json" → doc.data nesnesi.
  async getBytes(id, provider) {
    this._assert();
    return this._provider(provider).getBytes(XL.byos.mainRef(id));
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

  async createLink(docId, role, expiresAt = null, isPublic = false) {
    this._assert();
    // Tahmin edilemez token (iki UUID, tirelersiz).
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    // Herkese açık link yalnız görüntüleme (anon kullanıcı document_shares'e eklenemez).
    const effRole = isPublic ? "viewer" : role;
    const { data, error } = await this.client().from("share_links")
      .insert({ document_id: docId, token, role: effRole, is_public: isPublic, expires_at: expiresAt, created_by: XL.auth.user.id })
      .select().single();
    if (error) throw error;
    return data;
  },

  async listLinks(docId) {
    this._assert();
    const { data, error } = await this.client().from("share_links")
      .select("id, token, role, is_public, expires_at, created_at").eq("document_id", docId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  /* ---------- Anonim (giriş gerektirmeyen) herkese açık link ---------- */

  // Token'ı çöz (giriş gerekmez): { document_id, name, type, role } döner.
  async resolvePublic(token) {
    const { data, error } = await this.client().rpc("resolve_public_link", { p_token: token });
    if (error) throw error;
    if (!data || !data.length) throw new Error("Bağlantı çözülemedi.");
    return data[0];
  },

  // Byte'ı giriş yapmadan indir (anon). _assert YOK — storage anon politikası izin verir.
  async getBytesPublic(id) {
    const { data, error } = await this.client().storage.from("documents").download(`${id}.json`);
    if (error) throw error;
    return JSON.parse(await data.text());
  },

  // Public belgeyi anonim (salt görüntüleme) olarak aç — yerel kopya, buluta bağlı değil.
  async openPublic(token) {
    const info = await this.resolvePublic(token);
    const data = await this.getBytesPublic(info.document_id);
    // URL'yi temizle (başarılı çözümden sonra; giriş sonrası tekrar deneme bozulmasın diye önce değil).
    history.replaceState(null, "", location.origin + location.pathname);
    const d = XL.ws.create(info.type, data, info.name);
    d.readonly = true;              // gerçek salt-görüntüleme: düzenleme kilitli
    XL.ws.applyReadonly();
    XL.status(XL.t("👁 Salt görüntüleme — paylaşılan belgenin yerel kopyası (giriş yapılmadı).",
      "👁 View only — local copy of the shared document (not signed in)."));
    return info;
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

    // Giriş yapılmışsa: token'ı bozdur (kalıcı erişim ver) ve aç.
    if (this.enabled()) {
      history.replaceState(null, "", location.origin + location.pathname);
      XL.status(XL.t("Paylaşılan belge açılıyor…", "Opening shared document…"));
      try {
        const docId = await this.redeemLink(token);
        await this.openDoc(docId);
      } catch (e) {
        console.error(e);
        alert(XL.t("Bağlantı açılamadı: ", "Could not open link: ") + (e.message || e));
        XL.status("");
      }
      return;
    }

    // Giriş yok: herkese açık link ise anonim (salt görüntüleme) aç; değilse giriş iste.
    XL.status(XL.t("Paylaşılan belge açılıyor…", "Opening shared document…"));
    try {
      await this.openPublic(token);   // başarıda URL'yi kendi temizler
    } catch (e) {
      // Özel link (herkese açık değil) → giriş gerekir; token URL'de kalır, giriş sonrası tekrar denenir.
      XL.status("");
      if (XL.auth && !XL.auth.user) XL.auth.openModal();
    }
  },

  /* ---------- UI (workspace ile köprü) ---------- */

  // Etkin belgeyi buluta kaydet (yeni ise oluştur, varsa güncelle).
  async saveActive() {
    if (!this.enabled()) return alert(XL.t("Önce giriş yapın (👤 Giriş).", "Sign in first (👤 Sign in)."));
    const doc = XL.ws.active();
    if (!doc) return;
    XL.ws.persistNow(); // doc.data güncel olsun
    // Çevrimdışıysa doğrudan kuyruğa al (yeniden bağlanınca eşitlenir).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await this._enqueue(doc);
      XL.status(XL.t("📴 Çevrimdışı — değişiklik kuyruğa alındı, bağlanınca eşitlenecek.", "📴 Offline — change queued, will sync when reconnected."));
      return;
    }
    XL.status(XL.t("Buluta kaydediliyor…", "Saving to cloud…"));
    try {
      const id = await this.saveFull({ cloudId: doc.cloudId, type: doc.type, name: doc.name, data: doc.data });
      doc.cloudId = id;
      XL.ws._save(doc); // cloudId'yi yerelde de kalıcılaştır
      XL.status(XL.t("☁ Buluta kaydedildi: ", "☁ Saved to cloud: ") + doc.name);
    } catch (e) {
      console.error(e);
      // Ağ hatasıysa kuyruğa al; değilse gerçek hatayı göster.
      if (/fetch|network|failed to fetch|load failed/i.test(e.message || "")) {
        await this._enqueue(doc);
        XL.status(XL.t("📴 Bağlantı yok — değişiklik kuyruğa alındı.", "📴 No connection — change queued."));
      } else {
        alert(XL.t("Buluta kaydedilemedi: ", "Could not save to cloud: ") + (e.message || e));
        XL.status("");
      }
    }
  },

  // Bulut belgeleri panelini aç.
  async openPicker() {
    if (!this.enabled()) return alert(XL.t("Önce giriş yapın (👤 Giriş).", "Sign in first (👤 Sign in)."));
    XL.showPanel(XL.t("Bulut Belgelerim", "My Cloud Documents"), `<p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p>`);
    const body = document.getElementById("panel-body");
    const toolbar = `<div class="cloud-toolbar"><button id="cl-trash" class="oi-manage">🗑 ${XL.t("Çöp kutusu", "Trash")}</button></div>`;
    let rows;
    try { rows = await this.list(); }
    catch (e) { body.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}` + XL.esc(e.message || String(e)) + "</p>"; return; }
    const icon = { xlsx: "📊", docx: "📄", pptx: "📙" };
    const me = XL.auth.user.id;
    const listHtml = rows.length
      ? '<div class="cloud-list">' + rows.map((r) => {
          const mine = r.owner_id === me;
          return `<div class="cloud-item" data-id="${r.id}" data-name="${XL.esc(r.name)}" title="${XL.t("Aç", "Open")}">
             <span class="ci-ic">${icon[r.type] || "📄"}</span>
             <span class="ci-name">${XL.esc(r.name)}${mine ? "" : ` <small class="ci-shared">${XL.t("paylaşılan", "shared")}</small>`}</span>
             ${mine ? `<button class="ci-share" data-share="${r.id}" title="${XL.t("Paylaş", "Share")}">👥</button>
                       <button class="ci-ver" data-ver="${r.id}" title="${XL.t("Sürümler", "Versions")}">🕘</button>
                       <button class="ci-del" data-trash="${r.id}" title="${XL.t("Çöpe taşı", "Move to trash")}">🗑</button>` : ""}
           </div>`;
        }).join("") + "</div>"
      : `<p class="muted">${XL.t("Henüz bulut belgen yok. Bir belgeyi “☁ Buluta kaydet” ile yükle.", "No cloud documents yet. Upload one via “☁ Save to cloud”.")}</p>`;
    body.innerHTML = toolbar + listHtml;

    document.getElementById("cl-trash").addEventListener("click", () => this.openTrash());
    body.querySelectorAll(".cloud-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
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
    body.querySelectorAll("[data-ver]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = b.closest(".cloud-item");
        this.openVersions(b.dataset.ver, item.dataset.name);
      });
    });
    body.querySelectorAll("[data-trash]").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(XL.t("Bu belge çöp kutusuna taşınsın mı? (geri alınabilir)", "Move this document to trash? (reversible)"))) return;
        try { await this.trash(b.dataset.trash); this.openPicker(); }
        catch (err) { alert(XL.t("Taşınamadı: ", "Could not move: ") + (err.message || err)); }
      });
    });
  },

  // Çöp kutusu paneli: geri yükle veya KALICI sil.
  async openTrash() {
    XL.showPanel(XL.t("🗑 Çöp Kutusu", "🗑 Trash"), `<p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p>`);
    const body = document.getElementById("panel-body");
    let rows;
    try { rows = await this.listTrash(); }
    catch (e) { body.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}${XL.esc(e.message || String(e))}</p>`; return; }
    const back = `<button class="share-back" id="tr-back">← ${XL.t("Belgelerim", "My Documents")}</button>`;
    const icon = { xlsx: "📊", docx: "📄", pptx: "📙" };
    const list = rows.length
      ? '<div class="cloud-list">' + rows.map((r) => `
          <div class="cloud-item" data-id="${r.id}">
            <span class="ci-ic">${icon[r.type] || "📄"}</span>
            <span class="ci-name">${XL.esc(r.name)} <small class="oi-meta">${new Date(r.trashed_at).toLocaleString()}</small></span>
            <button class="share-add" data-restore="${r.id}">${XL.t("Geri yükle", "Restore")}</button>
            <button class="ci-del" data-purge="${r.id}" title="${XL.t("Kalıcı sil", "Delete permanently")}">✕</button>
          </div>`).join("") + "</div>"
      : `<p class="muted">${XL.t("Çöp kutusu boş.", "Trash is empty.")}</p>`;
    body.innerHTML = `<div class="org-ui">${back}${list}</div>`;
    document.getElementById("tr-back").addEventListener("click", () => this.openPicker());
    body.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
      try { await this.restoreTrash(b.dataset.restore); this.openTrash(); }
      catch (e) { alert(e.message || String(e)); }
    }));
    body.querySelectorAll("[data-purge]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(XL.t("KALICI olarak silinsin mi? Bu geri alınamaz.", "Delete PERMANENTLY? This cannot be undone."))) return;
      try { await this.remove(b.dataset.purge); this.openTrash(); }
      catch (e) { alert(e.message || String(e)); }
    }));
  },

  // Sürümler paneli: anlık görüntü oluştur / listele / geri yükle.
  async openVersions(docId, docName) {
    XL.showPanel(XL.t("🕘 Sürümler — ", "🕘 Versions — ") + (docName || ""), `<p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p>`);
    const body = document.getElementById("panel-body");
    const render = async () => {
      let rows;
      try { rows = await this.listVersions(docId); }
      catch (e) { body.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}${XL.esc(e.message || String(e))}</p>`; return; }
      const list = rows.length
        ? '<div class="cloud-list">' + rows.map((v) => `
            <div class="cloud-item" data-id="${v.id}">
              <span class="ci-ic">🕘</span>
              <span class="ci-name">${XL.esc(v.label || XL.t("Sürüm", "Version"))} <small class="oi-meta">${new Date(v.created_at).toLocaleString()}</small></span>
              <button class="share-add" data-restore="${v.id}">${XL.t("Geri yükle", "Restore")}</button>
            </div>`).join("") + "</div>"
        : `<p class="muted">${XL.t("Henüz sürüm yok.", "No versions yet.")}</p>`;
      body.innerHTML = `
        <div class="org-ui">
          <button class="share-back" id="vr-back">← ${XL.t("Belgelerim", "My Documents")}</button>
          <div class="share-form"><button id="vr-new" class="share-add">📸 ${XL.t("Şu anki hali sürüm olarak kaydet", "Save current state as version")}</button></div>
          <div id="vr-msg" class="share-msg hidden"></div>
          ${list}
        </div>`;
      const msg = (t, k) => { const e = document.getElementById("vr-msg"); if (e) { e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (k || "error") : " hidden"); } };
      document.getElementById("vr-back").addEventListener("click", () => this.openPicker());
      document.getElementById("vr-new").addEventListener("click", async () => {
        msg("");
        try { await this.createVersion(docId, new Date().toLocaleString()); msg(XL.t("Sürüm kaydedildi.", "Version saved."), "ok"); render(); }
        catch (e) { msg(this._versionError(e)); }
      });
      body.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(XL.t("Bu sürüm geri yüklensin mi? (mevcut hali önce sürüm olarak saklanır)", "Restore this version? (current state is first saved as a version)"))) return;
        const v = rows.find((x) => x.id === b.dataset.restore);
        try {
          await this.restoreVersion(docId, v);
          // Belge açıksa yeniden yükle.
          const d = XL.ws.docs.find((x) => x.cloudId === docId);
          if (d) { await this.openDoc(docId); } else { msg(XL.t("Geri yüklendi.", "Restored."), "ok"); }
        } catch (e) { msg(this._versionError(e)); }
      }));
    };
    render();
  },

  _versionError(e) {
    const m = (e && e.message) || String(e);
    if (/not found|bulunamadı|Object not found/i.test(m)) return XL.t("Önce belgeyi buluta kaydedin (☁).", "Save the document to the cloud first (☁).");
    return m;
  },

  // Bir belgenin paylaşım panelini aç (e-posta ile paylaş + mevcut paylaşımlar).
  async openShare(docId, docName) {
    if (!this.enabled()) return alert(XL.t("Önce giriş yapın.", "Sign in first."));
    const roles = [["viewer", XL.t("Görüntüleyen", "Viewer")], ["commenter", XL.t("Yorumcu", "Commenter")], ["editor", XL.t("Düzenleyen", "Editor")]];
    XL.showPanel(XL.t("Paylaş — ", "Share — ") + (docName || ""), `
      <div class="share-ui">
        <button class="share-back" id="sh-back">← ${XL.t("Belgelerim", "My Documents")}</button>
        <div class="share-form">
          <input type="email" id="sh-email" placeholder="${XL.t("kullanici@eposta.com", "user@email.com")}">
          <select id="sh-role">${roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <button id="sh-add" class="share-add">${XL.t("Paylaş", "Share")}</button>
        </div>
        <div id="sh-msg" class="share-msg hidden"></div>
        <div class="share-sub">${XL.t("Erişimi olanlar", "People with access")}</div>
        <div id="sh-list"><p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p></div>
        <div class="share-sub">${XL.t("Bağlantıyla paylaş", "Share with link")}</div>
        <div class="share-form">
          <select id="lk-role">${roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <button id="lk-add" class="share-add">🔗 ${XL.t("Oluştur", "Create")}</button>
        </div>
        <label class="lk-public"><input type="checkbox" id="lk-public"> ${XL.t("🌐 Herkese açık (giriş gerekmez, salt görüntüleme)", "🌐 Public (no sign-in, view only)")}</label>
        <div id="lk-list"><p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p></div>
        <div class="share-sub">${XL.t("Organizasyon", "Organization")}</div>
        <div class="share-form">
          <select id="org-move"><option value="">${XL.t("(kişisel — org yok)", "(personal — no org)")}</option></select>
        </div>
        <p class="muted" style="font-size:11px">${XL.t("Bir organizasyona bağlarsan org yöneticileri yönetişim erişimi kazanır.", "Linking to an org gives its admins governance access.")}</p>
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
               <button class="sr-del" data-uid="${s.user_id}" title="${XL.t("Erişimi kaldır", "Remove access")}">✕</button>
             </div>`).join("")
          : `<p class="muted">${XL.t("Henüz kimseyle paylaşılmadı.", "Not shared with anyone yet.")}</p>`;
        list.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", async () => {
          try { await this.revokeShare(docId, b.dataset.uid); refresh(); }
          catch (e) { msg(e.message || String(e)); }
        }));
      } catch (e) { list.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}` + XL.esc(e.message || String(e)) + "</p>"; }
    };

    const refreshLinks = async () => {
      const list = document.getElementById("lk-list");
      try {
        const links = await this.listLinks(docId);
        list.innerHTML = links.length
          ? links.map((lk) => `<div class="share-row link-row" data-token="${lk.token}">
               <span class="sr-role">${lk.is_public ? XL.t("🌐 herkese açık", "🌐 public") : (roleName[lk.role] || lk.role)}</span>
               <button class="lk-copy" data-token="${lk.token}" title="${XL.t("Bağlantıyı kopyala", "Copy link")}">📋 ${XL.t("Kopyala", "Copy")}</button>
               <button class="sr-del" data-lid="${lk.id}" title="${XL.t("Bağlantıyı iptal et", "Revoke link")}">✕</button>
             </div>`).join("")
          : `<p class="muted">${XL.t("Henüz bağlantı yok.", "No links yet.")}</p>`;
        list.querySelectorAll(".lk-copy").forEach((b) => b.addEventListener("click", async () => {
          const url = this.linkUrl(b.dataset.token);
          try { await navigator.clipboard.writeText(url); msg(XL.t("Bağlantı kopyalandı", "Link copied"), "ok"); }
          catch { prompt(XL.t("Bağlantıyı kopyalayın:", "Copy the link:"), url); }
        }));
        list.querySelectorAll("[data-lid]").forEach((b) => b.addEventListener("click", async () => {
          try { await this.revokeLink(b.dataset.lid); refreshLinks(); }
          catch (e) { msg(e.message || String(e)); }
        }));
      } catch (e) { list.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}` + XL.esc(e.message || String(e)) + "</p>"; }
    };

    document.getElementById("sh-back").addEventListener("click", () => this.openPicker());
    document.getElementById("sh-add").addEventListener("click", async () => {
      const email = document.getElementById("sh-email").value.trim();
      const role = document.getElementById("sh-role").value;
      if (!email) return msg(XL.t("E-posta girin.", "Enter an email."));
      msg("");
      try {
        await this.shareByEmail(docId, email, role);
        document.getElementById("sh-email").value = "";
        msg(XL.t("Paylaşıldı: ", "Shared: ") + email, "ok");
        refresh();
      } catch (e) {
        msg(this._shareError(e));
      }
    });
    document.getElementById("lk-add").addEventListener("click", async () => {
      const role = document.getElementById("lk-role").value;
      const isPublic = document.getElementById("lk-public").checked;
      msg("");
      try {
        const lk = await this.createLink(docId, role, null, isPublic);
        const url = this.linkUrl(lk.token);
        try { await navigator.clipboard.writeText(url); msg(XL.t("Bağlantı oluşturuldu ve kopyalandı", "Link created and copied"), "ok"); }
        catch { msg(XL.t("Bağlantı oluşturuldu", "Link created"), "ok"); }
        refreshLinks();
      } catch (e) { msg(e.message || String(e)); }
    });
    // Organizasyon bağlama (yalnız sahibi; XL.org RPC'leri üzerinden).
    const wireOrg = async () => {
      const sel = document.getElementById("org-move");
      if (!sel || !XL.org) return;
      try {
        const [orgs, meta] = await Promise.all([XL.org.listMine(), this.getMeta(docId).catch(() => null)]);
        const cur = meta ? meta.org_id : null;
        orgs.forEach((o) => {
          const opt = document.createElement("option");
          opt.value = o.id; opt.textContent = o.name;
          if (o.id === cur) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", async () => {
          msg("");
          try { await XL.org.moveDoc(docId, sel.value || null); msg(XL.t("Organizasyon güncellendi.", "Organization updated."), "ok"); }
          catch (e) { msg(e.message || String(e)); }
        });
      } catch { /* org yoksa/erişilemezse sessizce geç */ }
    };

    refresh();
    refreshLinks();
    wireOrg();
  },

  _shareError(e) {
    const m = (e && e.message) || String(e);
    if (/kayıtlı kullanıcı yok/i.test(m)) return XL.t("Bu e-posta ile kayıtlı kullanıcı yok. Önce o kişi hesap açmalı.", "No registered user with this email. They must create an account first.");
    if (/Kendinizle/i.test(m)) return XL.t("Kendinizle paylaşamazsınız.", "You cannot share with yourself.");
    if (/sahibi paylaşabilir/i.test(m)) return XL.t("Yalnızca belge sahibi paylaşabilir.", "Only the document owner can share.");
    return m;
  },

  // Bir bulut belgesini yeni sekmede aç.
  async openDoc(id) {
    XL.status(XL.t("Bulut belgesi açılıyor…", "Opening cloud document…"));
    try {
      const full = await this.loadFull(id);
      const d = XL.ws.create(full.type, full.data, full.name);
      d.cloudId = full.cloudId;
      XL.ws._save(d);
      XL.hidePanel();
      XL.status(XL.t("Açıldı: ", "Opened: ") + full.name);
    } catch (e) {
      console.error(e);
      alert(XL.t("Açılamadı: ", "Could not open: ") + (e.message || e));
      XL.status("");
    }
  },
};

// Yeniden çevrimiçi olunca bekleyen bulut kayıtlarını otomatik eşitle (Faz 4).
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { if (XL.cloud) XL.cloud.flushOutbox(); });
}
