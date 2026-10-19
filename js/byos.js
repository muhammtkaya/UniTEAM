/* byos.js — Belge BYTE deposu: sağlayıcı soyutlaması (BYOS)  [Faz 4]
 *
 * İlke (ship-checklist / BYOS kararı): belge byte'larını KALICI biz saklamayız;
 * kullanıcının kendi bulutunda (Google Drive / OneDrive) durur. Oraya canlı
 * bağlanmak OAuth + domain gerektirir → bilinçli olarak Faz 9'a (deploy) bırakıldı.
 *
 * Bu modül, o güne hazır **sağlayıcı arayüzünü** tanımlar ve bugün çalışan tek
 * sağlayıcıyı (`relay` = Supabase Storage ara deposu) uygular. Drive/OneDrive
 * adaptörleri "iskelet"tir: aynı arayüzü vaat eder, çağrıldığında net bir
 * "henüz yapılandırılmadı (Faz 9)" hatası verir. Böylece cloud.js tek bir
 * arayüze konuşur; gerçek BYOS gelince yalnız bu adaptörlerin içi doldurulur.
 *
 * Arayüz (her sağlayıcı): { id, label, available(), putBytes(ref,obj),
 *   getBytes(ref), copy(fromRef,toRef), remove(ref) }.  "ref" = sağlayıcıya özel
 *   nesne anahtarı (relay'de "<docId>.json"); byte'lar JSON serileştirilir.
 */
XL.byos = {
  // Sürüm nesne adı sözleşmesi: "<docId>.v.<versionId>.json".
  // doc_id_from_object_name ilk '.'a kadarını aldığı için sürüm nesnesi, ana
  // belgenin Storage RLS'ine otomatik bağlanır (ayrı politika gerekmez).
  mainRef(docId) { return `${docId}.json`; },
  versionRef(docId, versionId) { return `${docId}.v.${versionId}.json`; },

  // Etkin sağlayıcı (bir belgenin storage_provider'ına göre; varsayılan relay).
  provider(name) { return this.providers[name] || this.providers.relay; },

  providers: {
    /* ----- relay: Supabase Storage (bugünkü ara çözüm) ----- */
    relay: {
      id: "relay",
      label: "UniTEAM (relay)",
      available() { return !!(XL.auth && XL.auth.client && XL.auth.user); },
      _bucket() { return XL.auth.client.storage.from("documents"); },

      async putBytes(ref, dataObj) {
        const blob = new Blob([JSON.stringify(dataObj)], { type: "application/json" });
        const { error } = await this._bucket().upload(ref, blob, { upsert: true, contentType: "application/json" });
        if (error) throw error;
      },
      async getBytes(ref) {
        const { data, error } = await this._bucket().download(ref);
        if (error) throw error;
        return JSON.parse(await data.text());
      },
      async copy(fromRef, toRef) {
        // Sunucu-içi kopya (indirip yüklemeden) — sürüm anlık görüntüsü için ucuz.
        const { error } = await this._bucket().copy(fromRef, toRef);
        if (error) throw error;
      },
      async remove(ref) {
        const { error } = await this._bucket().remove(Array.isArray(ref) ? ref : [ref]);
        if (error) throw error;
      },
    },

    /* ----- gdrive: Google Drive (İSKELET — Faz 9'da doldurulacak) -----
     * Canlı plan: Google Cloud Console'da OAuth client (ücretsiz) → tarayıcıda
     * PKCE ile yetki (scope: drive.file — yalnız uygulamanın oluşturduğu dosyalar),
     * access_token ile Drive REST (files.create/get/update, appProperties'te docId).
     * "ref" = Drive fileId. Token'lar güvenli saklanır; yenileme refresh ile.
     */
    gdrive: {
      id: "gdrive",
      label: "Google Drive",
      _live: false, // canlı adaptör Faz 9'da yazılacak (akış hazır değil)
      // Önkoşul: Google Cloud hesabı + OAuth client id (VITE_GOOGLE_OAUTH_CLIENT_ID).
      // Hesap yoksa hiç görünmez; hesap girilse bile canlı akış Faz 9. Bkz. docs/accounts.md.
      available() { return XL.config.serviceConfigured("googleCloud") && this._live; },
      async putBytes() { throw new Error(XL.t("Google Drive henüz yapılandırılmadı (Google Cloud hesabı + Faz 9).", "Google Drive not configured yet (Google Cloud account + Phase 9).")); },
      async getBytes() { throw new Error(XL.t("Google Drive henüz yapılandırılmadı (Google Cloud hesabı + Faz 9).", "Google Drive not configured yet (Google Cloud account + Phase 9).")); },
      async copy() { throw new Error("gdrive: Faz 9"); },
      async remove() { throw new Error("gdrive: Faz 9"); },
    },

    /* ----- onedrive: Microsoft OneDrive (İSKELET — Faz 9) -----
     * Canlı plan: Azure/Entra uygulama kaydı (ücretsiz) → MSAL/PKCE yetki
     * (scope: Files.ReadWrite.AppFolder), Microsoft Graph /me/drive ile
     * upload/download. "ref" = Graph item id.
     */
    onedrive: {
      id: "onedrive",
      label: "OneDrive",
      _live: false, // canlı adaptör Faz 9'da yazılacak (akış hazır değil)
      // Önkoşul: Microsoft Entra/Azure hesabı + OAuth client id (VITE_MS_OAUTH_CLIENT_ID).
      available() { return XL.config.serviceConfigured("microsoft") && this._live; },
      async putBytes() { throw new Error(XL.t("OneDrive henüz yapılandırılmadı (Microsoft hesabı + Faz 9).", "OneDrive not configured yet (Microsoft account + Phase 9).")); },
      async getBytes() { throw new Error(XL.t("OneDrive henüz yapılandırılmadı (Microsoft hesabı + Faz 9).", "OneDrive not configured yet (Microsoft account + Phase 9).")); },
      async copy() { throw new Error("onedrive: Faz 9"); },
      async remove() { throw new Error("onedrive: Faz 9"); },
    },
  },
};
