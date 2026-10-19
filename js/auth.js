/* auth.js — kimlik doğrulama (Supabase Auth)
 *
 * Bu modül uygulamaya "hesap" katmanını ekler: kayıt ol, giriş yap, çıkış yap.
 * Supabase Auth, kimlik/parola/oturum işlerini kendi "auth.users" tablosunda
 * yönetir; bir kullanıcı kaydolduğunda veritabanındaki trigger otomatik olarak
 * "profiles" tablosuna bir satır ekler (db/schema.sql → handle_new_user).
 *
 * Mimari not: Oturum (JWT) tarayıcıda localStorage'da saklanır; sayfa yenilense
 * de giriş korunur. İleride belge senkronu/paylaşım bu oturumun kimliğini
 * (auth.uid()) kullanacak ve RLS politikaları buna göre erişimi sınırlayacak.
 *
 * ÖNEMLİ: Bu aşamada giriş ZORUNLU DEĞİL. Uygulama hesapsız da (yerel) çalışır.
 * Auth şimdilik eklemeli bir katman; bulut senkronu geldikçe özellikler oturuma
 * bağlanacak.
 */
XL.auth = {
  client: null,     // Supabase istemcisi
  user: null,       // giriş yapılmışsa kullanıcı nesnesi, yoksa null
  _ready: false,

  init() {
    // Kütüphane veya config yoksa sessizce devre dışı kal (uygulama yine çalışır).
    if (typeof supabase === "undefined" || !supabase.createClient) {
      console.warn("Supabase kütüphanesi yüklenemedi — hesap özellikleri devre dışı.");
      this._renderButton();
      return;
    }
    if (!XL.config || !XL.config.supabase || !XL.config.supabase.url) {
      console.warn("XL.config.supabase tanımlı değil — hesap özellikleri devre dışı.");
      this._renderButton();
      return;
    }

    const { url, anonKey } = XL.config.supabase;
    this.client = supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    // Mevcut oturumu yükle (sayfa yenilendiyse giriş korunur).
    this.client.auth.getSession().then(({ data }) => {
      this.user = data.session ? data.session.user : null;
      this._ready = true;
      this._renderButton();
      if (XL.cloud) { XL.cloud.handleUrlLink(); XL.cloud.flushOutbox(); }  // ?link + bekleyen kuyruk
      if (XL.org) XL.org.handleUrlInvite();    // ?invite=<token> varsa kabul et
    });

    // Oturum değişince (giriş/çıkış/token yenileme) arayüzü güncelle.
    this.client.auth.onAuthStateChange((event, session) => {
      this.user = session ? session.user : null;
      this._renderButton();
      this._closePopover();
      if (XL.cloud) XL.cloud.handleUrlLink();  // giriş sonrası bekleyen linki aç
      if (XL.org) XL.org.handleUrlInvite();    // giriş sonrası bekleyen daveti kabul et
      // Yalnız TAZE girişte giriş olayını kaydet (sayfa yenileme/token tazeleme değil).
      if (event === "SIGNED_IN" && XL.security) XL.security.recordLogin();
    });

    this._wireButton();
  },

  /* ---------- Üst çubuktaki hesap düğmesi ---------- */
  _wireButton() {
    const btn = document.getElementById("btn-account");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.user) this._togglePopover();   // girişliyse menü (çıkış vb.)
      else this.openModal();                   // değilse giriş/kayıt modalı
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#account-popover") && !e.target.closest("#btn-account")) this._closePopover();
    });
  },

  _renderButton() {
    const btn = document.getElementById("btn-account");
    if (!btn) return;
    if (this.user) {
      const name = this.user.email || XL.t("Hesabım", "My account");
      btn.innerHTML = `<span class="acct-dot"></span><span class="acct-label">${XL.esc(name)}</span>`;
      btn.title = XL.t("Hesap: ", "Account: ") + name;
      btn.classList.add("signed-in");
    } else {
      btn.innerHTML = `👤 ${XL.t("Giriş", "Sign in")}`;
      btn.title = XL.t("Giriş yap / Kayıt ol", "Sign in / Sign up");
      btn.classList.remove("signed-in");
    }
  },

  /* ---------- Girişli kullanıcı menüsü (popover) ---------- */
  _togglePopover() {
    const existing = document.getElementById("account-popover");
    if (existing) return this._closePopover();
    const btn = document.getElementById("btn-account");
    const pop = document.createElement("div");
    pop.id = "account-popover";
    pop.innerHTML = `
      <div class="ap-email" title="${XL.esc(this.user.email || "")}">${XL.esc(this.user.email || XL.t("Hesabım", "My account"))}</div>
      <div class="ap-sub">${XL.t("Giriş yapıldı", "Signed in")}</div>
      <hr>
      <button id="ap-cloud-save" class="ap-item ap-action">${XL.t("☁ Buluta kaydet", "☁ Save to cloud")}</button>
      <button id="ap-cloud-list" class="ap-item ap-action">${XL.t("📥 Bulut belgelerim", "📥 My cloud documents")}</button>
      <button id="ap-orgs" class="ap-item ap-action">${XL.t("🏢 Organizasyonlarım", "🏢 My organizations")}</button>
      <button id="ap-billing" class="ap-item ap-action">${XL.t("💳 Plan ve Faturalandırma", "💳 Plan & Billing")}</button>
      <button id="ap-security" class="ap-item ap-action">${XL.t("🔐 Güvenlik", "🔐 Security")}</button>
      <button id="ap-privacy" class="ap-item ap-action">${XL.t("🔏 Gizlilik ve Verilerim", "🔏 Privacy & My Data")}</button>
      <hr>
      <button id="ap-signout" class="ap-item">${XL.t("Çıkış yap", "Sign out")}</button>`;
    document.body.appendChild(pop);
    // Düğmenin altına hizala
    const r = btn.getBoundingClientRect();
    pop.style.top = r.bottom + 6 + "px";
    pop.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    document.getElementById("ap-cloud-save").addEventListener("click", () => { this._closePopover(); XL.cloud.saveActive(); });
    document.getElementById("ap-cloud-list").addEventListener("click", () => { this._closePopover(); XL.cloud.openPicker(); });
    document.getElementById("ap-orgs").addEventListener("click", () => { this._closePopover(); XL.org.openPanel(); });
    document.getElementById("ap-billing").addEventListener("click", () => { this._closePopover(); XL.billing.openPanel(); });
    document.getElementById("ap-security").addEventListener("click", () => { this._closePopover(); XL.security.openPanel(); });
    document.getElementById("ap-privacy").addEventListener("click", () => { this._closePopover(); XL.privacy.openPanel(); });
    document.getElementById("ap-signout").addEventListener("click", () => this.signOut());
  },
  _closePopover() {
    const p = document.getElementById("account-popover");
    if (p) p.remove();
  },

  /* ---------- Giriş / Kayıt modalı ---------- */
  openModal(mode) {
    this.closeModal();
    const tab = mode === "signup" ? "signup" : "signin";
    const ov = document.createElement("div");
    ov.id = "auth-overlay";
    ov.innerHTML = `
      <div id="auth-modal" role="dialog" aria-modal="true">
        <button class="auth-x" title="Kapat" data-auth-close>✕</button>
        <div class="auth-brand">${XL.esc(XL.APP_NAME)}</div>
        <div class="auth-tabs">
          <button class="auth-tab${tab === "signin" ? " active" : ""}" data-auth-tab="signin">${XL.t("Giriş Yap", "Sign In")}</button>
          <button class="auth-tab${tab === "signup" ? " active" : ""}" data-auth-tab="signup">${XL.t("Kayıt Ol", "Sign Up")}</button>
        </div>
        <form id="auth-form">
          <label class="auth-field">
            <span>${XL.t("E-posta", "Email")}</span>
            <input type="email" id="auth-email" autocomplete="email" required placeholder="${XL.t("ornek@eposta.com", "name@email.com")}">
          </label>
          <label class="auth-field">
            <span>${XL.t("Parola", "Password")}</span>
            <input type="password" id="auth-pass" autocomplete="${tab === "signup" ? "new-password" : "current-password"}" required minlength="6" placeholder="${XL.t("En az 6 karakter", "At least 6 characters")}">
          </label>
          <div id="auth-msg" class="auth-msg hidden"></div>
          <button type="submit" id="auth-submit" class="auth-submit"></button>
        </form>
        <p class="auth-hint" id="auth-hint"></p>
      </div>`;
    document.body.appendChild(ov);

    this._modalMode = tab;
    this._syncModal();

    // Olaylar
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-auth-close]")) this.closeModal(); });
    ov.querySelectorAll("[data-auth-tab]").forEach((b) =>
      b.addEventListener("click", () => { this._modalMode = b.dataset.authTab; this._syncModal(); }));
    document.getElementById("auth-form").addEventListener("submit", (e) => { e.preventDefault(); this._submit(); });
    document.addEventListener("keydown", this._escHandler = (e) => { if (e.key === "Escape") this.closeModal(); });
    setTimeout(() => { const el = document.getElementById("auth-email"); if (el) el.focus(); }, 50);
  },

  // Sekmeye göre buton/başlık metinlerini güncelle
  _syncModal() {
    const isSignup = this._modalMode === "signup";
    document.querySelectorAll("#auth-modal [data-auth-tab]").forEach((b) =>
      b.classList.toggle("active", b.dataset.authTab === this._modalMode));
    document.getElementById("auth-submit").textContent = isSignup ? XL.t("Kayıt Ol", "Sign Up") : XL.t("Giriş Yap", "Sign In");
    document.getElementById("auth-hint").textContent = isSignup
      ? XL.t("Zaten hesabın var mı? Yukarıdan “Giriş Yap”a geç.", "Already have an account? Switch to “Sign In” above.")
      : XL.t("Hesabın yok mu? Yukarıdan “Kayıt Ol”a geç.", "No account? Switch to “Sign Up” above.");
    document.getElementById("auth-pass").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
    this._msg("");
  },

  closeModal() {
    const ov = document.getElementById("auth-overlay");
    if (ov) ov.remove();
    if (this._escHandler) { document.removeEventListener("keydown", this._escHandler); this._escHandler = null; }
  },

  _msg(text, kind) {
    const el = document.getElementById("auth-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (text ? " " + (kind || "error") : " hidden");
  },

  _busy(on) {
    const btn = document.getElementById("auth-submit");
    if (btn) { btn.disabled = on; btn.classList.toggle("busy", on); }
  },

  async _submit() {
    const email = document.getElementById("auth-email").value.trim();
    const pass = document.getElementById("auth-pass").value;
    if (!email || pass.length < 6) return this._msg(XL.t("Geçerli bir e-posta ve en az 6 karakterli parola girin.", "Enter a valid email and a password of at least 6 characters."));
    if (!this.client) return this._msg(XL.t("Bağlantı kurulamadı (Supabase yüklü değil).", "Could not connect (Supabase not loaded)."));

    this._busy(true);
    this._msg("");
    try {
      if (this._modalMode === "signup") {
        const { data, error } = await this.client.auth.signUp({ email, password: pass });
        if (error) throw error;
        // Yerel kurulumda e-posta onayı kapalı → oturum hemen gelir.
        if (data.session) {
          this._msg(XL.t("Hesap oluşturuldu, giriş yapıldı.", "Account created, signed in."), "ok");
          setTimeout(() => this.closeModal(), 700);
        } else {
          // Onay açıksa (ör. bulut) — e-posta doğrulaması beklenir.
          this._msg(XL.t("Hesap oluşturuldu. E-postanı doğrula, sonra giriş yap.", "Account created. Verify your email, then sign in."), "ok");
        }
      } else {
        const { error } = await this.client.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        // İki adımlı doğrulama (2FA) açıksa ikinci faktörü sor (aal1 → aal2).
        this.closeModal();
        if (XL.security) {
          const ok = await XL.security.maybeChallenge();
          if (!ok) return;  // iptal → maybeChallenge zaten signOut etti
        }
        XL.status(XL.t("Giriş yapıldı.", "Signed in."));
      }
    } catch (err) {
      this._msg(this._friendlyError(err));
    } finally {
      this._busy(false);
    }
  },

  // Supabase hata mesajlarını Türkçeleştir / sadeleştir.
  _friendlyError(err) {
    const m = (err && err.message) || XL.t("Bilinmeyen hata", "Unknown error");
    if (/invalid login credentials/i.test(m)) return XL.t("E-posta veya parola hatalı.", "Incorrect email or password.");
    if (/user already registered/i.test(m)) return XL.t("Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.", "This email is already registered. Try signing in.");
    if (/password should be at least/i.test(m)) return XL.t("Parola en az 6 karakter olmalı.", "Password must be at least 6 characters.");
    if (/unable to validate email|invalid email/i.test(m)) return XL.t("Geçersiz e-posta adresi.", "Invalid email address.");
    if (/fetch|network|failed to fetch/i.test(m)) return XL.t("Sunucuya ulaşılamadı. Supabase çalışıyor mu? (supabase start)", "Could not reach the server. Is Supabase running? (supabase start)");
    return m;
  },

  async signOut() {
    this._closePopover();
    try { if (this.client) await this.client.auth.signOut(); } catch (e) { console.error(e); }
  },
};

window.addEventListener("DOMContentLoaded", () => XL.auth.init());
