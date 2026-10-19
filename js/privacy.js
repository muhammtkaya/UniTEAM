/* privacy.js — XL.privacy: gizlilik, veri hakları, yasal metinler (Faz 8, A4)
 *
 * KVKK / GDPR / CCPA veri hakları — KOD tarafı:
 *   • "Verilerimi indir" (yerel): tamamen istemci; IndexedDB belgeleri + tercihler
 *     + dil tek bir JSON'a. HESAP/AĞ GEREKMEZ, çevrimdışı çalışır (veri taşınabilirliği).
 *   • "Hesap/bulut verimi indir" + "Hesabımı sil": Supabase RPC'leri çağırır
 *     (export_my_account_data / request_account_deletion). CANLI çalışma = Faz 9
 *     (yığın kapalıyken giriş yapılmadığı için düğmeler yalnız girişliyken görünür).
 *   • Yasal metin İSKELETLERİ (Gizlilik / Koşullar / Veri İşleme / KVKK aydınlatma):
 *     TASLAK — bağlayıcı hukuki metin değildir; canlıya çıkmadan avukat onayı gerekir.
 *
 * UI: giriş gerektirmeyen "❔ Yardım" panelinden ve (girişliyse) hesap menüsünden açılır.
 */
XL.privacy = {
  /* ---------------- Yerel veri dışa aktarımı (hesapsız) ---------------- */
  async collectLocal() {
    const out = { app: XL.APP_NAME, version: XL.APP_VERSION, exportedAt: new Date().toISOString(), kind: "local", docs: [], prefs: null, meta: null, locale: (XL.i18n && XL.i18n.locale) || "tr" };
    try { if (XL.store && XL.store.available()) { const all = await XL.store.loadAll(); out.docs = all.docs || []; out.meta = all.meta || null; } } catch (e) { out.error = String(e && e.message || e); }
    try { if (XL.store) out.prefs = await XL.store.loadPrefs(); } catch (e) {}
    return out;
  },
  async exportLocal() {
    XL.status(XL.t("Verileriniz hazırlanıyor…", "Preparing your data…"));
    const data = await this.collectLocal();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const date = new Date().toISOString().slice(0, 10);
    XL.download(blob, "uniteam-verilerim-" + date + ".json");
    XL.status(XL.t("✅ Verileriniz indirildi (yerel).", "✅ Your data was downloaded (local)."));
    if (XL.obs) XL.obs.breadcrumb("privacy", "local export", { docs: data.docs.length });
  },

  /* ---------------- Bulut/hesap verisi (RPC; canlı = Faz 9) ---------------- */
  _client() { return (XL.auth && XL.auth.client) || null; },
  _authed() { try { return !!(XL.auth && XL.auth.user); } catch (e) { return false; } },

  async exportCloud() {
    const c = this._client();
    if (!this._authed() || !c) { XL.status(XL.t("Önce giriş yapın (👤 Giriş).", "Sign in first (👤 Sign in).")); return; }
    XL.status(XL.t("Hesap verileriniz hazırlanıyor…", "Preparing your account data…"));
    try {
      const { data, error } = await c.rpc("export_my_account_data");
      if (error) throw error;
      const payload = { app: XL.APP_NAME, version: XL.APP_VERSION, exportedAt: new Date().toISOString(), kind: "account", data };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      XL.download(blob, "uniteam-hesap-verim-" + new Date().toISOString().slice(0, 10) + ".json");
      XL.status(XL.t("✅ Hesap verileriniz indirildi.", "✅ Your account data was downloaded."));
    } catch (e) {
      if (XL.obs) XL.obs.captureException(e, { op: "exportCloud" });
      XL.status(XL.t("İndirilemedi: ", "Could not download: ") + (e && e.message || e));
    }
  },

  async deleteAccount() {
    const c = this._client();
    if (!this._authed() || !c) { XL.status(XL.t("Önce giriş yapın (👤 Giriş).", "Sign in first (👤 Sign in).")); return; }
    const warn = XL.t(
      "Hesabınız ve bulut belgeleriniz KALICI olarak silinsin mi? Bu geri alınamaz. (Yerel belgeleriniz tarayıcıda kalır — önce “Verilerimi indir” ile yedekleyin.)",
      "Permanently delete your account and cloud documents? This cannot be undone. (Local documents stay in your browser — back up first with “Download my data”.)");
    if (!confirm(warn)) return;
    XL.status(XL.t("Hesap siliniyor…", "Deleting account…"));
    try {
      const { error } = await c.rpc("request_account_deletion");
      if (error) throw error;
      XL.status(XL.t("✅ Hesabınız silindi.", "✅ Your account was deleted."));
      try { await XL.auth.signOut(); } catch (e) {}
    } catch (e) {
      if (XL.obs) XL.obs.captureException(e, { op: "deleteAccount" });
      // Son yönetici gibi engeller anlaşılır mesajla döner.
      XL.status(XL.t("Silinemedi: ", "Could not delete: ") + (e && e.message || e));
    }
  },

  /* ---------------- Yasal metin iskeletleri (TASLAK) ---------------- */
  LEGAL: {
    privacy: {
      title: ["Gizlilik Politikası (TASLAK)", "Privacy Policy (DRAFT)"],
      body: [
        "UniTEAM belge içeriğinizi KALICI olarak saklamaz. Belgeler varsayılan olarak yalnızca tarayıcınızda (IndexedDB) tutulur. Buluta kaydettiğinizde yalnızca gerçek zamanlı belge durumu (CRDT) ve küçük paylaşım/izin meta verisi işlenir; belge byte'ları sizin kendi depolamanızda veya geçici relay'de bulunur.",
        "İşlenen kişisel veriler: e-posta adresi (kimlik), oturum/giriş kayıtları (güvenlik), paylaşım ilişkileri. Çerezler/benzeri teknolojiler oturum yönetimi için kullanılır.",
        "Haklarınız (KVKK m.11 / GDPR): verilerinize erişme, düzeltme, silme, taşınabilirlik ve işlemeye itiraz. Bu haklar uygulama içindeki “Verilerimi indir” ve “Hesabımı sil” ile kullanılabilir.",
      ],
      bodyEn: [
        "UniTEAM does not permanently store your document content. Documents are kept only in your browser (IndexedDB) by default. When you save to the cloud, only real-time document state (CRDT) and small sharing/permission metadata are processed; document bytes live in your own storage or a temporary relay.",
        "Personal data processed: email address (identity), session/login records (security), sharing relationships. Cookies/similar technologies are used for session management.",
        "Your rights (GDPR / KVKK art. 11): access, rectification, erasure, portability and objection. These can be exercised in-app via “Download my data” and “Delete my account”.",
      ],
    },
    terms: {
      title: ["Kullanım Koşulları (TASLAK)", "Terms of Service (DRAFT)"],
      body: [
        "Hizmet “olduğu gibi” sunulur; kesintisizlik veya hatasızlık garanti edilmez. Yüklediğiniz dosyaların içeriğinden ve paylaşımından siz sorumlusunuz.",
        "Hizmeti yasa dışı amaçlarla, başkalarının haklarını ihlal edecek şekilde veya altyapıya zarar verecek biçimde kullanamazsınız.",
        "Bu koşullar canlıya çıkmadan önce güncellenecek ve yürürlük tarihi eklenecektir.",
      ],
      bodyEn: [
        "The service is provided “as is”; no guarantee of uninterrupted or error-free operation. You are responsible for the content and sharing of the files you upload.",
        "You may not use the service for unlawful purposes, to infringe others’ rights, or to harm the infrastructure.",
        "These terms will be updated with an effective date before going live.",
      ],
    },
    dpa: {
      title: ["Veri İşleme Sözleşmesi / DPA (TASLAK)", "Data Processing Agreement / DPA (DRAFT)"],
      body: [
        "Kurumsal kullanımda UniTEAM “veri işleyen”, müşteri “veri sorumlusu” sıfatıyla hareket eder. İşleme yalnızca müşterinin talimatlarıyla ve hizmetin sağlanması amacıyla yapılır.",
        "Alt işleyenler (ör. barındırma/relay sağlayıcıları) listelenecek; uygun teknik ve idari tedbirler (şifreleme, erişim kontrolü) uygulanır.",
        "Bu belge örnek bir iskelettir; imzalı DPA canlı dağıtımdan (Faz 9) önce hazırlanır.",
      ],
      bodyEn: [
        "For enterprise use, UniTEAM acts as “processor” and the customer as “controller”. Processing occurs only on the customer’s instructions and to provide the service.",
        "Sub-processors (e.g. hosting/relay providers) will be listed; appropriate technical and organizational measures (encryption, access control) are applied.",
        "This is a sample skeleton; a signed DPA will be prepared before live deployment (Phase 9).",
      ],
    },
  },

  /* ---------------- Panel ---------------- */
  openPanel() {
    const authed = this._authed();
    const sec = (key) => {
      const L = this.LEGAL[key];
      const body = (XL.i18n && XL.i18n.locale === "en" ? L.bodyEn : L.body).map((p) => `<p>${XL.esc(p)}</p>`).join("");
      return `<details class="pv-legal"><summary>${XL.esc(XL.t(L.title[0], L.title[1]))}</summary>${body}</details>`;
    };
    XL.showPanel(XL.t("🔏 Gizlilik ve Verileriniz", "🔏 Privacy & Your Data"), `
      <div class="pv-ui">
        <div class="help-sec">
          <h4>${XL.t("Verileriniz", "Your data")}</h4>
          <p class="muted">${XL.t("Verileriniz varsayılan olarak yalnızca bu tarayıcıda tutulur. İstediğiniz an indirin veya hesabınızı silin.", "Your data is kept only in this browser by default. Download it any time, or delete your account.")}</p>
          <div class="pv-actions">
            <button id="pv-export-local" class="pv-btn">${XL.t("⬇ Verilerimi indir (yerel)", "⬇ Download my data (local)")}</button>
            ${authed ? `<button id="pv-export-cloud" class="pv-btn">${XL.t("⬇ Hesap verimi indir", "⬇ Download account data")}</button>
            <button id="pv-delete" class="pv-btn pv-danger">${XL.t("🗑 Hesabımı sil", "🗑 Delete my account")}</button>` :
            `<span class="muted">${XL.t("(Hesap verisi indirme / hesap silme için giriş yapın.)", "(Sign in to download account data / delete account.)")}</span>`}
          </div>
        </div>
        <div class="help-sec">
          <h4>${XL.t("Yasal", "Legal")}</h4>
          <p class="muted">${XL.t("Aşağıdaki metinler TASLAK'tır; canlıya çıkmadan önce hukuki onaydan geçecektir.", "The texts below are DRAFTS; they will undergo legal review before going live.")}</p>
          ${sec("privacy")}${sec("terms")}${sec("dpa")}
        </div>
      </div>`);
    const b = (id) => document.getElementById(id);
    if (b("pv-export-local")) b("pv-export-local").addEventListener("click", () => this.exportLocal());
    if (b("pv-export-cloud")) b("pv-export-cloud").addEventListener("click", () => this.exportCloud());
    if (b("pv-delete")) b("pv-delete").addEventListener("click", () => this.deleteAccount());
  },
};
