/* i18n.js — çoklu dil altyapısı (uluslararasılaştırma)
 *
 * Amaç: arayüz artık yalnız Türkçe sabit değil. İki dil (TR/EN) + dil seçici.
 *
 * Yaklaşım — iki dilli satır: çağrı yerinde her iki metin de verilir:
 *     XL.t("Kaydet", "Save")
 *   Bir dize henüz İngilizce'ye çevrilmemişse (en === undefined) Türkçe döner →
 *   kademeli çeviri güvenli, hiçbir şey kırılmaz. Ayrı bir anahtar kaydı yok;
 *   Türkçe metin hem anahtar hem yedektir.
 *
 * Statik HTML (index.html): data-i18n / data-i18n-title / data-i18n-ph="TR|EN".
 * Dinamik JS metinleri: XL.t("TR","EN").
 *
 * Dil değişince kalıcı arayüz (şerit, sekmeler, statik metinler) yeniden çizilir;
 * onChange dinleyicileri tetiklenir.
 */
XL.i18n = {
  locale: "tr",
  LOCALES: { tr: "Türkçe", en: "English" },
  KEY: "uniteam-locale",
  _listeners: [],

  init() {
    let saved = null;
    try { saved = localStorage.getItem(this.KEY) || localStorage.getItem("weboffice-locale"); } catch (e) {}
    if (saved && this.LOCALES[saved]) this.locale = saved;
    else this.locale = (navigator.language || "").toLowerCase().startsWith("en") ? "en" : "tr";
    document.documentElement.lang = this.locale;
  },

  set(loc) {
    if (!this.LOCALES[loc] || loc === this.locale) return;
    this.locale = loc;
    try { localStorage.setItem(this.KEY, loc); } catch (e) {}
    document.documentElement.lang = loc;
    this.applyStatic();
    this._listeners.forEach((fn) => { try { fn(loc); } catch (e) { console.error(e); } });
  },

  onChange(fn) { this._listeners.push(fn); },

  // İki dilli satır. en verilmezse (henüz çevrilmedi) tr döner.
  t(tr, en) { return this.locale === "en" && en != null ? en : tr; },

  // "TR|EN" biçimli attribute'u geçerli dile çöz.
  _pair(v) { const i = v.indexOf("|"); return i < 0 ? v : this.t(v.slice(0, i), v.slice(i + 1)); },

  // Statik HTML metinlerini uygula (data-i18n / -title / -ph).
  applyStatic(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = this._pair(el.getAttribute("data-i18n")); });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = this._pair(el.getAttribute("data-i18n-title")); });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = this._pair(el.getAttribute("data-i18n-ph")); });
  },

  // Üst çubuktaki dil düğmesini kur (TR ⇄ EN).
  bindButton() {
    const btn = document.getElementById("btn-lang");
    if (!btn) return;
    const label = () => { btn.textContent = this.locale === "en" ? "🌐 EN" : "🌐 TR"; btn.title = this.t("Dil: Türkçe (değiştir)", "Language: English (change)"); };
    label();
    btn.addEventListener("click", () => { this.set(this.locale === "en" ? "tr" : "en"); label(); });
  },
};

// Kısayol: XL.t(tr, en)
XL.t = function (tr, en) { return XL.i18n.t(tr, en); };

window.addEventListener("DOMContentLoaded", () => {
  XL.i18n.init();
  XL.i18n.applyStatic();
  XL.i18n.bindButton();
});
