/* onboarding.js — ilk kullanım karşılaması + yardım + şablon galerisi  [Faz 5]
 *
 * Üç parça:
 *   1) Karşılama: ilk açılışta BİR KEZ, bloklamayan ince bir banner (modal DEĞİL →
 *      otomatik testleri/akışı engellemez). "onboarded" tercihi ile tekrar çıkmaz.
 *   2) Yardım paneli (❔): hızlı başlangıç + klavye kısayolları + diller.
 *   3) Şablon galerisi: hazır belgelerle hızlı başlangıç (boş + önceden doldurulmuş).
 *
 * UI: mevcut XL.showPanel + XL.t ile; tüm metinler iki dilli.
 */
XL.onboarding = {
  KEY: "onboarded",

  init() {
    // Karşılamayı prefs yüklendikten sonra dene (bloklamaz).
    const show = () => { try { if (!XL.prefs.get(this.KEY)) this._welcome(); } catch (e) {} };
    if (XL.prefs && XL.prefs.data && Object.keys(XL.prefs.data).length) show();
    else setTimeout(show, 1200); // prefs IndexedDB'den yüklensin
    const btn = document.getElementById("btn-help");
    if (btn) btn.addEventListener("click", () => this.openHelp());
  },

  _welcome() {
    if (document.getElementById("welcome-banner")) return;
    const b = document.createElement("div");
    b.id = "welcome-banner";
    b.setAttribute("role", "status");
    b.innerHTML = `
      <span>👋 ${XL.t("UniTEAM'e hoş geldiniz! Excel, Word ve PowerPoint tek yerde.", "Welcome to UniTEAM! Excel, Word and PowerPoint in one place.")}</span>
      <button id="wb-help" class="wb-btn">${XL.t("Tura başla", "Take a tour")}</button>
      <button id="wb-close" class="wb-x" aria-label="${XL.t("Kapat", "Close")}">✕</button>`;
    document.body.appendChild(b);
    const done = () => { b.remove(); try { XL.prefs.set(this.KEY, true); } catch (e) {} };
    document.getElementById("wb-close").addEventListener("click", done);
    document.getElementById("wb-help").addEventListener("click", () => { done(); this.openHelp(); });
  },

  openHelp() {
    XL.showPanel(XL.t("❔ Yardım & Şablonlar", "❔ Help & Templates"), `
      <div class="help-ui">
        <div class="help-sec">
          <h4>${XL.t("Hızlı başlangıç", "Quick start")}</h4>
          <ul>
            <li>${XL.t("Sol alttaki ＋ ile yeni belge ekleyin (Excel / Word / PowerPoint).", "Add a new document with ＋ at bottom-left (Excel / Word / PowerPoint).")}</li>
            <li>${XL.t("📂 ile dosya açın, 💾 ile indirin. Her şey tarayıcıda otomatik kaydedilir.", "Open files with 📂, download with 💾. Everything auto-saves in the browser.")}</li>
            <li>${XL.t("👤 ile giriş yapıp ☁ Buluta kaydedin, 👥 ile paylaşın, 🟢 Canlı ile birlikte düzenleyin.", "Sign in with 👤 and ☁ save to cloud, share with 👥, co-edit with 🟢 Live.")}</li>
            <li>${XL.t("🔐 Güvenlik'ten 2FA açın; 🏢 ile organizasyon yönetin.", "Enable 2FA from 🔐 Security; manage organizations with 🏢.")}</li>
          </ul>
        </div>
        <div class="help-sec">
          <h4>${XL.t("Şablonlar", "Templates")}</h4>
          <div class="tmpl-grid" id="tmpl-grid"></div>
        </div>
        <div class="help-sec">
          <h4>${XL.t("Klavye kısayolları", "Keyboard shortcuts")}</h4>
          <table class="help-keys">
            <tr><td>Ctrl+S / Ctrl+O</td><td>${XL.t("Kaydet / Aç", "Save / Open")}</td></tr>
            <tr><td>Ctrl+Z / Ctrl+Y</td><td>${XL.t("Geri al / İleri al", "Undo / Redo")}</td></tr>
            <tr><td>Ctrl+B / I / U</td><td>${XL.t("Kalın / İtalik / Altı çizili", "Bold / Italic / Underline")}</td></tr>
            <tr><td>F2</td><td>${XL.t("Hücreyi/öğeyi düzenle", "Edit cell/item")}</td></tr>
            <tr><td>F5 / Shift+F5</td><td>${XL.t("Slayt gösterisi (PowerPoint)", "Slide show (PowerPoint)")}</td></tr>
          </table>
        </div>
        <div class="help-sec">
          <h4>${XL.t("Diller", "Languages")}</h4>
          <p class="muted">${XL.t("Üstteki 🌐 düğmesinden dil seçin. Türkçe formül adları da desteklenir: =TOPLA, =EĞER, =DÜŞEYARA…", "Pick a language from 🌐 at the top. Turkish formula names also work: =TOPLA, =EĞER, =DÜŞEYARA…")}</p>
        </div>
      </div>`);
    this._renderTemplates();
  },

  _renderTemplates() {
    const grid = document.getElementById("tmpl-grid");
    if (!grid) return;
    const tmpls = [
      { ic: "📊", t: XL.t("Boş Çalışma Kitabı", "Blank Workbook"), fn: () => XL.ws.create("xlsx") },
      { ic: "📊", t: XL.t("Aylık Bütçe", "Monthly Budget"), fn: () => this._budget() },
      { ic: "📄", t: XL.t("Boş Belge", "Blank Document"), fn: () => XL.ws.create("docx") },
      { ic: "📄", t: XL.t("Mektup", "Letter"), fn: () => this._letter() },
      { ic: "📙", t: XL.t("Boş Sunu", "Blank Presentation"), fn: () => XL.ws.create("pptx") },
    ];
    grid.innerHTML = tmpls.map((t, i) => `<button class="tmpl-card" data-i="${i}"><span class="tc-ic">${t.ic}</span><span>${XL.esc(t.t)}</span></button>`).join("");
    grid.querySelectorAll(".tmpl-card").forEach((b) => b.addEventListener("click", () => {
      tmpls[b.dataset.i].fn();
      XL.hidePanel();
    }));
  },

  // Önceden doldurulmuş Excel bütçe şablonu (data şekli createData'dan türetilir → güvenli).
  _budget() {
    const d = XL.modes.xlsx.createData();
    d.sheets[0].cells = {
      "0,0": "Kategori", "0,1": "Bütçe", "0,2": "Gerçekleşen",
      "1,0": "Kira", "1,1": "12000", "1,2": "12000",
      "2,0": "Market", "2,1": "6000", "2,2": "6450",
      "3,0": "Ulaşım", "3,1": "2000", "3,2": "1800",
      "4,0": "Eğlence", "4,1": "1500", "4,2": "2100",
      "5,0": "Toplam", "5,1": "=SUM(B2:B5)", "5,2": "=SUM(C2:C5)",
      "6,0": "Fark", "6,2": "=B6-C6",
    };
    d.sheets[0].formats = { "0:0": { bold: true }, "0:1": { bold: true }, "0:2": { bold: true }, "5:0": { bold: true } };
    return XL.ws.create("xlsx", d, XL.t("Aylık Bütçe", "Monthly Budget"));
  },

  // Önceden doldurulmuş Word mektup şablonu.
  _letter() {
    const d = XL.modes.docx.createData();
    const today = new Date().toLocaleDateString();
    d.html = `<p style="text-align:right">${today}</p>`
      + `<p>${XL.t("Sayın İlgili,", "Dear Sir or Madam,")}</p>`
      + `<p>${XL.t("Bu bir mektup şablonudur. Metni kendi içeriğinizle değiştirin.", "This is a letter template. Replace the text with your own content.")}</p>`
      + `<p>${XL.t("Saygılarımla,", "Kind regards,")}</p><p><br></p><p>[${XL.t("Adınız", "Your name")}]</p>`;
    return XL.ws.create("docx", d, XL.t("Mektup", "Letter"));
  },
};

window.addEventListener("DOMContentLoaded", () => { setTimeout(() => XL.onboarding.init(), 300); });
