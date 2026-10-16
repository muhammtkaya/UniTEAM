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
    });

    // Oturum değişince (giriş/çıkış/token yenileme) arayüzü güncelle.
    this.client.auth.onAuthStateChange((_event, session) => {
      this.user = session ? session.user : null;
      this._renderButton();
      this._closePopover();
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
      const name = this.user.email || "Hesabım";
      btn.innerHTML = `<span class="acct-dot"></span><span class="acct-label">${XL.esc(name)}</span>`;
      btn.title = "Hesap: " + name;
      btn.classList.add("signed-in");
    } else {
      btn.innerHTML = `👤 Giriş`;
      btn.title = "Giriş yap / Kayıt ol";
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
      <div class="ap-email" title="${XL.esc(this.user.email || "")}">${XL.esc(this.user.email || "Hesabım")}</div>
      <div class="ap-sub">Giriş yapıldı</div>
      <hr>
      <button id="ap-signout" class="ap-item">Çıkış yap</button>`;
    document.body.appendChild(pop);
    // Düğmenin altına hizala
    const r = btn.getBoundingClientRect();
    pop.style.top = r.bottom + 6 + "px";
    pop.style.right = Math.max(8, window.innerWidth - r.right) + "px";
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
          <button class="auth-tab${tab === "signin" ? " active" : ""}" data-auth-tab="signin">Giriş Yap</button>
          <button class="auth-tab${tab === "signup" ? " active" : ""}" data-auth-tab="signup">Kayıt Ol</button>
        </div>
        <form id="auth-form">
          <label class="auth-field">
            <span>E-posta</span>
            <input type="email" id="auth-email" autocomplete="email" required placeholder="ornek@eposta.com">
          </label>
          <label class="auth-field">
            <span>Parola</span>
            <input type="password" id="auth-pass" autocomplete="${tab === "signup" ? "new-password" : "current-password"}" required minlength="6" placeholder="En az 6 karakter">
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
    document.getElementById("auth-submit").textContent = isSignup ? "Kayıt Ol" : "Giriş Yap";
    document.getElementById("auth-hint").textContent = isSignup
      ? "Zaten hesabın var mı? Yukarıdan “Giriş Yap”a geç."
      : "Hesabın yok mu? Yukarıdan “Kayıt Ol”a geç.";
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
    if (!email || pass.length < 6) return this._msg("Geçerli bir e-posta ve en az 6 karakterli parola girin.");
    if (!this.client) return this._msg("Bağlantı kurulamadı (Supabase yüklü değil).");

    this._busy(true);
    this._msg("");
    try {
      if (this._modalMode === "signup") {
        const { data, error } = await this.client.auth.signUp({ email, password: pass });
        if (error) throw error;
        // Yerel kurulumda e-posta onayı kapalı → oturum hemen gelir.
        if (data.session) {
          this._msg("Hesap oluşturuldu, giriş yapıldı.", "ok");
          setTimeout(() => this.closeModal(), 700);
        } else {
          // Onay açıksa (ör. bulut) — e-posta doğrulaması beklenir.
          this._msg("Hesap oluşturuldu. E-postanı doğrula, sonra giriş yap.", "ok");
        }
      } else {
        const { error } = await this.client.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        this._msg("Giriş yapıldı.", "ok");
        setTimeout(() => this.closeModal(), 500);
      }
    } catch (err) {
      this._msg(this._friendlyError(err));
    } finally {
      this._busy(false);
    }
  },

  // Supabase hata mesajlarını Türkçeleştir / sadeleştir.
  _friendlyError(err) {
    const m = (err && err.message) || "Bilinmeyen hata";
    if (/invalid login credentials/i.test(m)) return "E-posta veya parola hatalı.";
    if (/user already registered/i.test(m)) return "Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.";
    if (/password should be at least/i.test(m)) return "Parola en az 6 karakter olmalı.";
    if (/unable to validate email|invalid email/i.test(m)) return "Geçersiz e-posta adresi.";
    if (/fetch|network|failed to fetch/i.test(m)) return "Sunucuya ulaşılamadı. Supabase çalışıyor mu? (supabase start)";
    return m;
  },

  async signOut() {
    this._closePopover();
    try { if (this.client) await this.client.auth.signOut(); } catch (e) { console.error(e); }
  },
};

window.addEventListener("DOMContentLoaded", () => XL.auth.init());
