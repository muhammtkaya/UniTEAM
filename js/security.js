/* security.js — Hesap güvenliği (2FA/MFA, giriş geçmişi, oturum yönetimi)  [Faz 2]
 *
 * Üç parça:
 *   1) MFA (TOTP): Supabase Auth'un YERLEŞİK mfa.* API'si — kaydet (QR), doğrula,
 *      kaldır; girişte ikinci faktör sorma (aal1 → aal2).
 *   2) Giriş geçmişi + ŞÜPHELİ GİRİŞ: her girişte record_login_event RPC'si
 *      (yeni cihaz tespiti + bildirim); geçmiş login_events'ten okunur.
 *   3) Oturum sertleştirme: "diğer cihazlardan çık" / "her yerden çık"
 *      (supabase signOut scope 'others' / 'global').
 *
 * UI: XL.showPanel ile "🔐 Güvenlik" paneli. Tüm yetki Supabase/RLS'te.
 */
XL.security = {
  client() { return XL.auth && XL.auth.client; },
  _mfa() { const c = this.client(); return c && c.auth && c.auth.mfa; },
  enabled() { return !!(this.client() && XL.auth.user); },

  /* ---------- Cihaz etiketi (kabaca tarayıcı · OS) ---------- */
  deviceLabel() {
    const ua = navigator.userAgent || "";
    let br = "Tarayıcı";
    if (/Edg\//.test(ua)) br = "Edge";
    else if (/OPR\/|Opera/.test(ua)) br = "Opera";
    else if (/Firefox\//.test(ua)) br = "Firefox";
    else if (/Chrome\//.test(ua)) br = "Chrome";
    else if (/Safari\//.test(ua)) br = "Safari";
    let os = "";
    if (/Windows NT 10/.test(ua)) os = "Windows";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    return os ? `${br} · ${os}` : br;
  },

  /* ---------- MFA (TOTP) ---------- */
  async mfaFactors() {
    const mfa = this._mfa(); if (!mfa) return [];
    const { data, error } = await mfa.listFactors();
    if (error) throw error;
    // Yalnız doğrulanmış TOTP faktörleri (kayıt yarıda kalan 'unverified' hariç).
    return ((data && data.totp) || []).filter((f) => f.status === "verified");
  },
  async aal() {
    const mfa = this._mfa(); if (!mfa) return null;
    const { data, error } = await mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data; // { currentLevel, nextLevel, ... }
  },
  // Kaydı başlat → QR + secret döner (verifyEnroll ile tamamlanır).
  async enrollStart() {
    const mfa = this._mfa(); if (!mfa) throw new Error("MFA kullanılamıyor.");
    const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: this.deviceLabel() + " · " + Date.now() });
    if (error) throw error;
    return data; // { id, totp: { qr_code, secret, uri } }
  },
  async verifyEnroll(factorId, code) {
    const mfa = this._mfa();
    const ch = await mfa.challenge({ factorId });
    if (ch.error) throw ch.error;
    const { error } = await mfa.verify({ factorId, challengeId: ch.data.id, code });
    if (error) throw error;
  },
  async unenroll(factorId) {
    const mfa = this._mfa();
    const { error } = await mfa.unenroll({ factorId });
    if (error) throw error;
  },

  // Girişten sonra ikinci faktör gerekiyor mu? Gerekiyorsa modal ile sorar.
  // Döner: true = geçildi/gereksiz, false = başarısız (çağıran oturumu kapatmalı).
  async maybeChallenge() {
    try {
      const lvl = await this.aal();
      if (!lvl || lvl.nextLevel !== "aal2" || lvl.currentLevel === "aal2") return true;
      const factors = await this.mfaFactors();
      if (!factors.length) return true; // faktör yoksa zorlanmaz
      return await this._challengeModal(factors[0].id);
    } catch (e) { console.warn("MFA challenge atlandı:", e); return true; }
  },

  _challengeModal(factorId) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.id = "auth-overlay";
      ov.innerHTML = `
        <div id="auth-modal" role="dialog" aria-modal="true">
          <div class="auth-brand">${XL.t("İki Adımlı Doğrulama", "Two-Factor Authentication")}</div>
          <p class="auth-hint">${XL.t("Kimlik doğrulayıcı uygulamandaki 6 haneli kodu gir.", "Enter the 6-digit code from your authenticator app.")}</p>
          <form id="mfa-form">
            <input type="text" id="mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" style="letter-spacing:6px;text-align:center;font-size:20px">
            <div id="mfa-msg" class="auth-msg hidden"></div>
            <button type="submit" class="auth-submit">${XL.t("Doğrula", "Verify")}</button>
          </form>
          <button class="auth-x" title="İptal" data-mfa-cancel>✕</button>
        </div>`;
      document.body.appendChild(ov);
      const msg = (t) => { const e = document.getElementById("mfa-msg"); if (e) { e.textContent = t || ""; e.className = "auth-msg" + (t ? " error" : " hidden"); } };
      const done = (ok) => { ov.remove(); resolve(ok); };
      setTimeout(() => { const el = document.getElementById("mfa-code"); if (el) el.focus(); }, 50);
      ov.querySelector("[data-mfa-cancel]").addEventListener("click", async () => { try { await this.client().auth.signOut(); } catch {} done(false); });
      document.getElementById("mfa-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const code = document.getElementById("mfa-code").value.trim();
        if (code.length < 6) return msg(XL.t("6 haneli kod gerekli.", "6-digit code required."));
        msg("");
        try { await this.verifyEnroll(factorId, code); done(true); }
        catch (err) { msg(XL.t("Kod hatalı veya süresi dolmuş.", "Code incorrect or expired.")); }
      });
    });
  },

  /* ---------- Giriş geçmişi + şüpheli giriş ---------- */
  // Girişte bir kez: olayı kaydet, yeni cihazsa kullanıcıyı bilgilendir.
  async recordLogin() {
    if (!this.enabled()) return;
    try {
      const { data, error } = await this.client().rpc("record_login_event", {
        p_device_label: this.deviceLabel(), p_user_agent: navigator.userAgent || "",
      });
      if (error) throw error;
      if (data && data.is_new_device && !data.is_first) {
        XL.status(XL.t("🔐 Yeni bir cihazdan giriş algılandı: ", "🔐 Sign-in from a new device detected: ") + this.deviceLabel());
      }
    } catch (e) { console.warn("record_login_event:", e.message || e); }
  },
  async listLogins() {
    const { data, error } = await this.client().from("login_events")
      .select("id, device_label, user_agent, is_new_device, created_at")
      .order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return data;
  },

  /* ---------- Oturum sertleştirme ---------- */
  async signOutOthers() { const { error } = await this.client().auth.signOut({ scope: "others" }); if (error) throw error; },
  async signOutEverywhere() { const { error } = await this.client().auth.signOut({ scope: "global" }); if (error) throw error; },

  /* ---------- UI: Güvenlik paneli ---------- */
  async openPanel() {
    if (!this.enabled()) return alert(XL.t("Önce giriş yapın (👤 Giriş).", "Sign in first (👤 Sign in)."));
    XL.showPanel(XL.t("🔐 Güvenlik", "🔐 Security"), `<p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p>`);
    this._render();
  },

  async _render() {
    const body = document.getElementById("panel-body");
    if (!body) return;
    let factors = [], logins = [];
    try { factors = await this.mfaFactors(); } catch (e) { /* MFA kapalıysa boş */ }
    try { logins = await this.listLogins(); } catch (e) { /* tablo yoksa boş */ }
    const on = factors.length > 0;

    const loginHtml = logins.length
      ? logins.map((l) => `<div class="org-row">
          <span class="or-email">${XL.esc(l.device_label || XL.t("bilinmeyen cihaz", "unknown device"))}
            ${l.is_new_device ? ` <small class="or-susp">${XL.t("yeni cihaz", "new device")}</small>` : ""}
            <small class="oi-meta">${new Date(l.created_at).toLocaleString()}</small></span>
        </div>`).join("")
      : `<p class="muted">${XL.t("Henüz giriş kaydı yok.", "No sign-in history yet.")}</p>`;

    body.innerHTML = `
      <div class="org-ui sec-ui">
        <div class="sec-card">
          <div class="sec-head"><b>${XL.t("İki Adımlı Doğrulama (2FA)", "Two-Factor Auth (2FA)")}</b>
            <span class="sec-pill ${on ? "sec-on" : "sec-off"}">${on ? XL.t("Açık", "On") : XL.t("Kapalı", "Off")}</span></div>
          <p class="muted">${XL.t("Kimlik doğrulayıcı uygulama (Google Authenticator, Authy…) ile TOTP kodu.", "TOTP code via an authenticator app (Google Authenticator, Authy…).")}</p>
          <div id="sec-mfa-body"></div>
        </div>

        <div class="sec-card">
          <div class="sec-head"><b>${XL.t("Oturumlar", "Sessions")}</b></div>
          <p class="muted">${XL.t("Parolanı değiştirdiysen veya şüpheli giriş gördüysen diğer oturumları kapat.", "If you changed your password or saw a suspicious sign-in, close other sessions.")}</p>
          <div class="share-form">
            <button id="sec-others" class="share-add">${XL.t("Diğer cihazlardan çık", "Sign out other devices")}</button>
            <button id="sec-global" class="oi-manage">${XL.t("Her yerden çık", "Sign out everywhere")}</button>
          </div>
        </div>

        <div class="sec-card">
          <div class="sec-head"><b>${XL.t("Son girişler", "Recent sign-ins")}</b></div>
          <div class="org-members">${loginHtml}</div>
        </div>
        <div id="sec-msg" class="share-msg hidden"></div>
      </div>`;

    this._renderMfa(on ? factors : null);

    const msg = (t, kind) => { const e = document.getElementById("sec-msg"); if (!e) return; e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (kind || "error") : " hidden"); };
    document.getElementById("sec-others").addEventListener("click", async () => {
      if (!confirm(XL.t("Bu cihaz hariç tüm oturumlar kapatılsın mı?", "Sign out all sessions except this device?"))) return;
      msg("");
      try { await this.signOutOthers(); msg(XL.t("Diğer oturumlar kapatıldı.", "Other sessions signed out."), "ok"); }
      catch (e) { msg(e.message || String(e)); }
    });
    document.getElementById("sec-global").addEventListener("click", async () => {
      if (!confirm(XL.t("Bu cihaz dahil her yerden çıkılsın mı?", "Sign out everywhere, including this device?"))) return;
      try { await this.signOutEverywhere(); } catch (e) { msg(e.message || String(e)); }
    });
  },

  _renderMfa(factors) {
    const el = document.getElementById("sec-mfa-body");
    if (!el) return;
    if (factors && factors.length) {
      el.innerHTML = `<button id="mfa-disable" class="oi-manage">${XL.t("2FA'yı kapat", "Disable 2FA")}</button>`;
      document.getElementById("mfa-disable").addEventListener("click", async () => {
        if (!confirm(XL.t("İki adımlı doğrulama kapatılsın mı?", "Disable two-factor authentication?"))) return;
        try { for (const f of factors) await this.unenroll(f.id); this._render(); }
        catch (e) { alert(e.message || String(e)); }
      });
      return;
    }
    el.innerHTML = `<button id="mfa-enroll" class="share-add">${XL.t("2FA'yı etkinleştir", "Enable 2FA")}</button>`;
    document.getElementById("mfa-enroll").addEventListener("click", () => this._enrollFlow(el));
  },

  async _enrollFlow(el) {
    el.innerHTML = `<p class="muted">${XL.t("Hazırlanıyor…", "Preparing…")}</p>`;
    let enroll;
    try { enroll = await this.enrollStart(); }
    catch (e) { el.innerHTML = `<p class="muted">${XL.t("MFA başlatılamadı: ", "Could not start MFA: ")}${XL.esc(e.message || "")}</p>`; this._renderMfa(null); return; }
    const qr = enroll.totp && enroll.totp.qr_code;   // SVG data-URI
    const secret = enroll.totp && enroll.totp.secret;
    el.innerHTML = `
      <div class="mfa-enroll">
        <p>${XL.t("1) Kimlik doğrulayıcı uygulamanla QR'ı tara (veya anahtarı gir):", "1) Scan the QR with your authenticator app (or enter the key):")}</p>
        ${qr ? `<img class="mfa-qr" alt="QR" src="${XL.esc(qr)}">` : ""}
        <code class="mfa-secret">${XL.esc(secret || "")}</code>
        <p>${XL.t("2) Uygulamadaki 6 haneli kodu gir:", "2) Enter the 6-digit code from the app:")}</p>
        <div class="share-form">
          <input type="text" id="mfa-en-code" inputmode="numeric" maxlength="6" placeholder="123456" style="letter-spacing:4px;text-align:center">
          <button id="mfa-en-verify" class="share-add">${XL.t("Doğrula ve aç", "Verify & enable")}</button>
          <button id="mfa-en-cancel" class="oi-manage">${XL.t("Vazgeç", "Cancel")}</button>
        </div>
        <div id="mfa-en-msg" class="share-msg hidden"></div>
      </div>`;
    const m = (t, k) => { const e = document.getElementById("mfa-en-msg"); if (e) { e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (k || "error") : " hidden"); } };
    document.getElementById("mfa-en-cancel").addEventListener("click", async () => { try { await this.unenroll(enroll.id); } catch {} this._renderMfa(null); });
    document.getElementById("mfa-en-verify").addEventListener("click", async () => {
      const code = document.getElementById("mfa-en-code").value.trim();
      if (code.length < 6) return m(XL.t("6 haneli kod gerekli.", "6-digit code required."));
      m("");
      try { await this.verifyEnroll(enroll.id, code); XL.status(XL.t("✅ 2FA etkinleştirildi.", "✅ 2FA enabled.")); this._render(); }
      catch (e) { m(XL.t("Kod hatalı veya süresi dolmuş.", "Code incorrect or expired.")); }
    });
  },
};
