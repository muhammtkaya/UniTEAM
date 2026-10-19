/* i18n.js — çoklu dil altyapısı (uluslararasılaştırma)  [Faz 5: derinleştirildi]
 *
 * Yaklaşım — iki dilli satır + sözlük katmanı:
 *     XL.t("Kaydet", "Save")
 *   • locale 'tr' → tr (kanonik/anahtar)   • locale 'en' → en (yoksa tr)
 *   • diğer diller → DICT[locale][tr] (yoksa en, o da yoksa tr) → kademeli güvenli:
 *     çevrilmemiş dize İngilizce'ye düşer, hiçbir şey kırılmaz. Yeni bir dil
 *     eklemek = LOCALES'e satır + DICT'e sözlük (artımlı doldurulabilir).
 *
 * RTL: Arapça/İbranice gibi diller için <html dir="rtl"> otomatik ayarlanır.
 * Statik HTML: data-i18n / -title / -ph="TR|EN" (sözlük katmanından geçer).
 */
XL.i18n = {
  locale: "tr",
  LOCALES: { tr: "Türkçe", en: "English", de: "Deutsch", es: "Español", ar: "العربية" },
  RTL: { ar: true, he: true, fa: true, ur: true },
  KEY: "uniteam-locale",
  _listeners: [],

  // Bölgesel formül biçimi: ondalık ayracı virgül olan dillerde argüman ayracı ";".
  // Gerçek Excel'in davranışı (Türkçe/Almanca/İspanyolca Excel =TOPLA(A1;A2) kullanır).
  // ar v1'de kanonik (nokta/virgül) bırakıldı — RTL+ondalık ileride.
  FORMULA_FMT: {
    tr: { sep: ";", dec: "," }, de: { sep: ";", dec: "," }, es: { sep: ";", dec: "," },
    en: { sep: ",", dec: "." }, ar: { sep: ",", dec: "." },
  },
  formulaSep() { return (this.FORMULA_FMT[this.locale] || this.FORMULA_FMT.en).sep; },
  formulaDec() { return (this.FORMULA_FMT[this.locale] || this.FORMULA_FMT.en).dec; },

  // Ek dil sözlükleri (anahtar = kanonik Türkçe dize). Artımlı doldurulur;
  // eksik dizeler İngilizce'ye düşer. Çekirdek kabuk terimleriyle başlar.
  // Not: "Giriş" bilinçli yok — hem "Home" (şerit sekmesi) hem "Login" (hesap)
  // anlamına geldiğinden ve sözlük yalnız TR-anahtarlı olduğundan tek çeviri yanlış
  // anlam verirdi (en yedeği "Home" ribbon'da doğru; auth tek-arg → TR görünür).
  DICT: {
    de: {
      // Hesap / bulut (mevcut)
      "👤 Giriş": "👤 Anmelden", "Kaydet": "Speichern", "Aç": "Öffnen", "Yeni": "Neu",
      "Çıkış yap": "Abmelden", "🔐 Güvenlik": "🔐 Sicherheit",
      "🏢 Organizasyonlarım": "🏢 Meine Organisationen", "Paylaş": "Teilen",
      "Bulut Belgelerim": "Meine Cloud-Dokumente", "Hazır": "Bereit", "Yükleniyor…": "Lädt…",
      "☁ Buluta kaydet": "☁ In Cloud speichern", "📥 Bulut belgelerim": "📥 Meine Cloud-Dokumente",
      "💾 Kaydet": "💾 Speichern", "📂 Aç": "📂 Öffnen",
      // Şerit sekmeleri
      "Ekle": "Einfügen", "Düzen": "Layout", "Gözden Geçir": "Überprüfen", "Görünüm": "Ansicht",
      "Formüller": "Formeln", "Veri": "Daten", "Tasarım": "Entwurf", "Geçişler": "Übergänge",
      "Slayt Gösterisi": "Bildschirmpräsentation",
      // Ortak eylem / düğme / terim
      "Kapat": "Schließen", "Oluştur": "Erstellen", "Gönder": "Senden", "Vazgeç": "Abbrechen",
      "Sil": "Löschen", "Yönet": "Verwalten", "Katıl": "Beitreten", "Doğrula": "Bestätigen",
      "Kopyala": "Kopieren", "Hata: ": "Fehler: ", "Üye": "Mitglied", "Yönetici": "Administrator",
      "Belgelerim": "Meine Dokumente", "Çöp kutusu": "Papierkorb", "Sürümler": "Versionen",
      "Geri yükle": "Wiederherstellen", "Kalıcı sil": "Endgültig löschen",
      "Giriş Yap": "Anmelden", "Kayıt Ol": "Registrieren", "E-posta": "E-Mail", "Parola": "Passwort",
      "Hesabım": "Mein Konto", "Üyeler": "Mitglieder", "Belgeler": "Dokumente", "Denetim": "Prüfprotokoll",
      "Erişimi kaldır": "Zugriff entfernen", "Bağlantıyı kopyala": "Link kopieren",
      "Tümünü okundu işaretle": "Alle als gelesen markieren", "Bildirimler": "Benachrichtigungen",
      "Gönderiliyor…": "Wird gesendet…",
    },
    es: {
      "👤 Giriş": "👤 Entrar", "Kaydet": "Guardar", "Aç": "Abrir", "Yeni": "Nuevo",
      "Çıkış yap": "Cerrar sesión", "🔐 Güvenlik": "🔐 Seguridad",
      "🏢 Organizasyonlarım": "🏢 Mis organizaciones", "Paylaş": "Compartir",
      "Bulut Belgelerim": "Mis documentos en la nube", "Hazır": "Listo", "Yükleniyor…": "Cargando…",
      "☁ Buluta kaydet": "☁ Guardar en la nube", "📥 Bulut belgelerim": "📥 Mis documentos en la nube",
      "💾 Kaydet": "💾 Guardar", "📂 Aç": "📂 Abrir",
      "Ekle": "Insertar", "Düzen": "Disposición", "Gözden Geçir": "Revisar", "Görünüm": "Vista",
      "Formüller": "Fórmulas", "Veri": "Datos", "Tasarım": "Diseño", "Geçişler": "Transiciones",
      "Slayt Gösterisi": "Presentación con diapositivas",
      "Kapat": "Cerrar", "Oluştur": "Crear", "Gönder": "Enviar", "Vazgeç": "Cancelar",
      "Sil": "Eliminar", "Yönet": "Gestionar", "Katıl": "Unirse", "Doğrula": "Verificar",
      "Kopyala": "Copiar", "Hata: ": "Error: ", "Üye": "Miembro", "Yönetici": "Administrador",
      "Belgelerim": "Mis documentos", "Çöp kutusu": "Papelera", "Sürümler": "Versiones",
      "Geri yükle": "Restaurar", "Kalıcı sil": "Eliminar permanentemente",
      "Giriş Yap": "Iniciar sesión", "Kayıt Ol": "Registrarse", "E-posta": "Correo electrónico", "Parola": "Contraseña",
      "Hesabım": "Mi cuenta", "Üyeler": "Miembros", "Belgeler": "Documentos", "Denetim": "Auditoría",
      "Erişimi kaldır": "Quitar acceso", "Bağlantıyı kopyala": "Copiar enlace",
      "Tümünü okundu işaretle": "Marcar todo como leído", "Bildirimler": "Notificaciones",
      "Gönderiliyor…": "Enviando…",
    },
    ar: {
      "👤 Giriş": "👤 تسجيل الدخول", "Kaydet": "حفظ", "Aç": "فتح", "Yeni": "جديد",
      "Çıkış yap": "تسجيل الخروج", "🔐 Güvenlik": "🔐 الأمان",
      "🏢 Organizasyonlarım": "🏢 مؤسساتي", "Paylaş": "مشاركة",
      "Bulut Belgelerim": "مستنداتي السحابية", "Hazır": "جاهز", "Yükleniyor…": "جار التحميل…",
      "☁ Buluta kaydet": "☁ حفظ في السحابة", "📥 Bulut belgelerim": "📥 مستنداتي السحابية",
      "💾 Kaydet": "💾 حفظ", "📂 Aç": "📂 فتح",
      "Ekle": "إدراج", "Düzen": "تخطيط", "Gözden Geçir": "مراجعة", "Görünüm": "عرض",
      "Formüller": "الصيغ", "Veri": "البيانات", "Tasarım": "تصميم", "Geçişler": "الانتقالات",
      "Slayt Gösterisi": "عرض الشرائح",
      "Kapat": "إغلاق", "Oluştur": "إنشاء", "Gönder": "إرسال", "Vazgeç": "إلغاء",
      "Sil": "حذف", "Yönet": "إدارة", "Katıl": "انضمام", "Doğrula": "تحقق",
      "Kopyala": "نسخ", "Hata: ": "خطأ: ", "Üye": "عضو", "Yönetici": "مسؤول",
      "Belgelerim": "مستنداتي", "Çöp kutusu": "سلة المحذوفات", "Sürümler": "الإصدارات",
      "Geri yükle": "استعادة", "Kalıcı sil": "حذف نهائي",
      "Giriş Yap": "تسجيل الدخول", "Kayıt Ol": "إنشاء حساب", "E-posta": "البريد الإلكتروني", "Parola": "كلمة المرور",
      "Hesabım": "حسابي", "Üyeler": "الأعضاء", "Belgeler": "المستندات", "Denetim": "سجل التدقيق",
      "Erişimi kaldır": "إزالة الوصول", "Bağlantıyı kopyala": "نسخ الرابط",
      "Tümünü okundu işaretle": "تحديد الكل كمقروء", "Bildirimler": "الإشعارات",
      "Gönderiliyor…": "جارٍ الإرسال…",
    },
  },

  init() {
    let saved = null;
    try { saved = localStorage.getItem(this.KEY) || localStorage.getItem("weboffice-locale"); } catch (e) {}
    if (saved && this.LOCALES[saved]) this.locale = saved;
    else {
      const nav = (navigator.language || "").toLowerCase().slice(0, 2);
      this.locale = this.LOCALES[nav] ? nav : "tr";
    }
    this._applyDir();
  },

  isRTL() { return !!this.RTL[this.locale]; },
  _applyDir() {
    document.documentElement.lang = this.locale;
    document.documentElement.dir = this.isRTL() ? "rtl" : "ltr";
  },

  set(loc) {
    if (!this.LOCALES[loc] || loc === this.locale) return;
    this.locale = loc;
    try { localStorage.setItem(this.KEY, loc); } catch (e) {}
    this._applyDir();
    this.applyStatic();
    this._listeners.forEach((fn) => { try { fn(loc); } catch (e) { console.error(e); } });
  },

  onChange(fn) { this._listeners.push(fn); },

  // İki dilli satır + sözlük. Sıra: tr → en → DICT[locale].
  t(tr, en) {
    if (this.locale === "tr") return tr;
    if (this.locale === "en") return en != null ? en : tr;
    const d = this.DICT[this.locale];
    if (d && d[tr] != null) return d[tr];
    return en != null ? en : tr;
  },

  // "TR|EN" biçimli attribute'u geçerli dile çöz.
  _pair(v) { const i = v.indexOf("|"); return i < 0 ? this.t(v, v) : this.t(v.slice(0, i), v.slice(i + 1)); },

  applyStatic(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = this._pair(el.getAttribute("data-i18n")); });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = this._pair(el.getAttribute("data-i18n-title")); });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = this._pair(el.getAttribute("data-i18n-ph")); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", this._pair(el.getAttribute("data-i18n-aria"))); });
  },

  // Üst çubuktaki dil düğmesi — birden çok dil için açılır menü.
  bindButton() {
    const btn = document.getElementById("btn-lang");
    if (!btn) return;
    const codeLbl = { tr: "TR", en: "EN", de: "DE", es: "ES", ar: "AR" };
    const label = () => {
      btn.textContent = "🌐 " + (codeLbl[this.locale] || this.locale.toUpperCase());
      btn.title = this.t("Dil (değiştir)", "Language (change)");
      btn.setAttribute("aria-label", this.t("Dil seçimi", "Language selection"));
    };
    label();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.getElementById("lang-menu");
      if (existing) { existing.remove(); return; }
      const menu = document.createElement("div");
      menu.id = "lang-menu"; menu.setAttribute("role", "menu");
      menu.innerHTML = Object.entries(this.LOCALES).map(([code, name]) =>
        `<button role="menuitemradio" aria-checked="${code === this.locale}" class="lang-opt${code === this.locale ? " active" : ""}" data-loc="${code}">${name}</button>`).join("");
      document.body.appendChild(menu);
      const r = btn.getBoundingClientRect();
      menu.style.top = r.bottom + 6 + "px";
      menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
      menu.querySelectorAll("[data-loc]").forEach((b) => b.addEventListener("click", () => { this.set(b.dataset.loc); label(); menu.remove(); }));
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#lang-menu") && !e.target.closest("#btn-lang")) {
        const m = document.getElementById("lang-menu"); if (m) m.remove();
      }
    });
  },
};

// Kısayol: XL.t(tr, en)
XL.t = function (tr, en) { return XL.i18n.t(tr, en); };

window.addEventListener("DOMContentLoaded", () => {
  XL.i18n.init();
  XL.i18n.applyStatic();
  XL.i18n.bindButton();
});
