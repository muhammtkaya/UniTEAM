/* word/mode.js — Word modu: sayfa düzenleyici, şerit ve komutlar */
XL.modes.docx = {
  type: "docx",
  label: "Word",
  icon: "📄",
  ext: ".docx",
  docPrefix: "Belge",
  accept: [".docx"],
  editor: null,
  savedRange: null,
  globalsBound: false,
  zoom: 1,

  FONTS: ["Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Verdana", "Tahoma",
    "Segoe UI", "Trebuchet MS", "Garamond", "Courier New", "Comic Sans MS"],
  SIZES: [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72],

  createData() {
    return { html: "<p><br></p>", page: { size: "A4", orientation: "portrait", margin: "normal",
      header: { on: false, html: "" }, footer: { on: false, html: "" } } };
  },

  // page nesnesini eksik alanlar için tamamla (eski belgeler header/footer içermez)
  normalizePage(p) {
    const page = Object.assign({ size: "A4", orientation: "portrait", margin: "normal" }, p);
    page.header = Object.assign({ on: false, html: "" }, page.header);
    page.footer = Object.assign({ on: false, html: "" }, page.footer);
    return page;
  },

  /* ---------- Şerit ---------- */
  ribbon() {
    const fonts = this.FONTS.map((f) => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join("");
    const sizes = this.SIZES.map((s) => `<option value="${s}">${s}</option>`).join("");
    const t = XL.t;
    return [
      { name: t("Giriş", "Home"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="undo" title="${t("Geri al (Ctrl+Z)", "Undo (Ctrl+Z)")}">↶</button>
          <button data-cmd="redo" title="${t("İleri al (Ctrl+Y)", "Redo (Ctrl+Y)")}">↷</button>
        </div><label>${t("Geri Al", "Undo")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="cut" title="${t("Kes (Ctrl+X)", "Cut (Ctrl+X)")}">✂</button>
          <button data-cmd="copy" title="${t("Kopyala (Ctrl+C)", "Copy (Ctrl+C)")}">⧉</button>
          <button data-cmd="paste" title="${t("Yapıştır (Ctrl+V)", "Paste (Ctrl+V)")}">📋</button>
          <button data-cmd="paste-plain" title="${t("Yalnızca metni yapıştır", "Paste text only")}">📋ᵀ</button>
        </div><label>${t("Pano", "Clipboard")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="fontName" id="wd-font" title="${t("Yazı tipi", "Font")}" style="width:130px">${fonts}</select>
          <select data-cmd="fontSize" id="wd-size" title="${t("Yazı tipi boyutu", "Font size")}">${sizes}</select>
          <button data-cmd="grow" title="${t("Büyüt", "Grow")}">A⁺</button>
          <button data-cmd="shrink" title="${t("Küçült", "Shrink")}">A⁻</button>
        </div><div class="rrow">
          <button data-cmd="bold" data-state="bold" title="${t("Kalın (Ctrl+B)", "Bold (Ctrl+B)")}"><b>K</b></button>
          <button data-cmd="italic" data-state="italic" title="${t("İtalik (Ctrl+I)", "Italic (Ctrl+I)")}"><i>T</i></button>
          <button data-cmd="underline" data-state="underline" title="${t("Altı çizili (Ctrl+U)", "Underline (Ctrl+U)")}"><u>A</u></button>
          <button data-cmd="strikeThrough" data-state="strikeThrough" title="${t("Üstü çizili", "Strikethrough")}"><s>abc</s></button>
          <button data-cmd="superscript" data-state="superscript" title="${t("Üst simge", "Superscript")}">x²</button>
          <button data-cmd="subscript" data-state="subscript" title="${t("Alt simge", "Subscript")}">x₂</button>
          <label class="swatch" title="${t("Yazı rengi", "Font color")}">A<input type="color" data-cmd="foreColor" value="#c00000"></label>
          <label class="swatch" title="${t("Vurgu rengi", "Highlight color")}">🖍<input type="color" data-cmd="hiliteColor" value="#ffff00"></label>
          <button data-cmd="removeFormat" title="${t("Biçimlendirmeyi temizle", "Clear formatting")}">⌫</button>
        </div><label>${t("Yazı Tipi", "Font")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="insertUnorderedList" data-state="insertUnorderedList" title="${t("Madde işaretleri", "Bullets")}">• ≡</button>
          <button data-cmd="insertOrderedList" data-state="insertOrderedList" title="${t("Numaralandırma", "Numbering")}">1. ≡</button>
          <button data-cmd="outdent" title="${t("Girintiyi azalt", "Decrease indent")}">⇤</button>
          <button data-cmd="indent" title="${t("Girintiyi artır", "Increase indent")}">⇥</button>
          <select data-cmd="lineHeight" title="${t("Satır aralığı", "Line spacing")}">
            <option value="">${t("Aralık", "Spacing")}</option><option value="1">1,0</option><option value="1.15">1,15</option>
            <option value="1.5">1,5</option><option value="2">2,0</option><option value="2.5">2,5</option><option value="3">3,0</option>
          </select>
        </div><div class="rrow">
          <button data-cmd="justifyLeft" data-state="justifyLeft" title="${t("Sola hizala (Ctrl+L)", "Align left (Ctrl+L)")}">⯇≡</button>
          <button data-cmd="justifyCenter" data-state="justifyCenter" title="${t("Ortala (Ctrl+E)", "Center (Ctrl+E)")}">≡</button>
          <button data-cmd="justifyRight" data-state="justifyRight" title="${t("Sağa hizala (Ctrl+R)", "Align right (Ctrl+R)")}">≡⯈</button>
          <button data-cmd="justifyFull" data-state="justifyFull" title="${t("İki yana yasla (Ctrl+J)", "Justify (Ctrl+J)")}">☰</button>
        </div><label>${t("Paragraf", "Paragraph")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="formatBlock" id="wd-style" title="${t("Stiller", "Styles")}">
            <option value="P">${t("Normal", "Normal")}</option>
            <option value="H1">${t("Başlık 1", "Heading 1")}</option>
            <option value="H2">${t("Başlık 2", "Heading 2")}</option>
            <option value="H3">${t("Başlık 3", "Heading 3")}</option>
            <option value="H4">${t("Başlık 4", "Heading 4")}</option>
            <option value="BLOCKQUOTE">${t("Alıntı", "Quote")}</option>
            <option value="PRE">${t("Kod", "Code")}</option>
          </select>
        </div><label>${t("Stiller", "Styles")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="find" title="${t("Bul ve değiştir (Ctrl+H)", "Find & replace (Ctrl+H)")}">🔍 ${t("Bul", "Find")}</button>
          <button data-cmd="selectAll" title="${t("Tümünü seç (Ctrl+A)", "Select all (Ctrl+A)")}">⬚ ${t("Tümü", "All")}</button>
        </div><label>${t("Düzenleme", "Editing")}</label></div>` },

      { name: t("Ekle", "Insert"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="page-break" class="big">⤓<span>${t("Sayfa Sonu", "Page Break")}</span></button>
        </div><label>${t("Sayfalar", "Pages")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="ins-header" data-state="header" class="big" title="${t("Üst bilgi alanını aç/kapat", "Toggle header area")}">▔<span>${t("Üst Bilgi", "Header")}</span></button>
          <button data-cmd="ins-footer" data-state="footer" class="big" title="${t("Alt bilgi alanını aç/kapat", "Toggle footer area")}">▁<span>${t("Alt Bilgi", "Footer")}</span></button>
          <button data-cmd="ins-pagenum" class="big" title="${t("İmlecin bulunduğu üst/alt bilgiye sayfa numarası ekle", "Insert page number in header/footer at cursor")}">#<span>${t("Sayfa No", "Page No")}</span></button>
        </div><label>${t("Üst Bilgi ve Alt Bilgi", "Header & Footer")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="table" class="big">▦<span>${t("Tablo", "Table")}</span></button>
          <div class="rcol">
            <button data-cmd="tbl-row" title="${t("İmlecin altına satır ekle", "Insert row below cursor")}">+ ${t("Satır", "Row")}</button>
            <button data-cmd="tbl-col" title="${t("İmlecin sağına sütun ekle", "Insert column right of cursor")}">+ ${t("Sütun", "Col")}</button>
          </div>
          <div class="rcol">
            <button data-cmd="tbl-delrow" title="${t("Satırı sil", "Delete row")}">− ${t("Satır", "Row")}</button>
            <button data-cmd="tbl-delcol" title="${t("Sütunu sil", "Delete column")}">− ${t("Sütun", "Col")}</button>
          </div>
        </div><label>${t("Tablolar", "Tables")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="image" class="big">🖼<span>${t("Resim", "Picture")}</span></button>
          <select data-cmd="img-size" title="${t("Seçili resmin genişliği", "Selected picture width")}">
            <option value="">${t("Resim boyutu", "Picture size")}</option><option value="25%">%25</option><option value="50%">%50</option>
            <option value="75%">%75</option><option value="100%">%100</option>
          </select>
        </div><label>${t("Çizimler", "Illustrations")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="link" class="big">🔗<span>${t("Bağlantı", "Link")}</span></button>
          <button data-cmd="unlink" class="big">⛓<span>${t("Bağlantıyı Kaldır", "Remove Link")}</span></button>
        </div><label>${t("Bağlantılar", "Links")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="hr" class="big">―<span>${t("Yatay Çizgi", "Horizontal Line")}</span></button>
          <button data-cmd="date" class="big">📅<span>${t("Tarih", "Date")}</span></button>
          <button data-cmd="symbol" class="big">Ω<span>${t("Simge", "Symbol")}</span></button>
        </div><label>${t("Metin & Simgeler", "Text & Symbols")}</label></div>` },

      { name: t("Düzen", "Layout"), html: `
        <div class="rgroup"><div class="rrow">
          <select data-cmd="page-margin" id="wd-margin" title="${t("Kenar boşlukları", "Margins")}">
            <option value="normal">${t("Normal (2,54 cm)", "Normal (2.54 cm)")}</option>
            <option value="narrow">${t("Dar (1,27 cm)", "Narrow (1.27 cm)")}</option>
            <option value="wide">${t("Geniş (5,08 cm yanlar)", "Wide (5.08 cm sides)")}</option>
            <option value="none">${t("Yok (0 — tam sayfa)", "None (0 — full page)")}</option>
            <option value="custom">${t("Özel…", "Custom…")}</option>
          </select>
        </div><label>${t("Kenar Boşlukları", "Margins")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="page-orient" id="wd-orient" title="${t("Yönlendirme", "Orientation")}">
            <option value="portrait">${t("Dikey", "Portrait")}</option>
            <option value="landscape">${t("Yatay", "Landscape")}</option>
          </select>
        </div><label>${t("Yönlendirme", "Orientation")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="page-size" id="wd-psize" title="${t("Kağıt boyutu", "Paper size")}">
            <option value="A4">A4 (21 × 29,7 cm)</option>
            <option value="Letter">Letter (21,6 × 27,9 cm)</option>
            <option value="A5">A5 (14,8 × 21 cm)</option>
          </select>
        </div><label>${t("Boyut", "Size")}</label></div>` },

      { name: t("Gözden Geçir", "Review"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="wordcount" class="big">🔢<span>${t("Sözcük Sayısı", "Word Count")}</span></button>
          <button data-cmd="spellcheck" data-state="spellcheck" class="big">✔<span>${t("Yazım Denetimi", "Spell Check")}</span></button>
        </div><label>${t("Yazım Denetleme", "Proofing")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="footnote" class="big" title="${t("İmlecin olduğu yere dipnot ekle", "Insert a footnote at the cursor")}">🔖<span>${t("Dipnot Ekle", "Insert Footnote")}</span></button>
        </div><label>${t("Dipnotlar", "Footnotes")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="track-changes" data-state="track" class="big" title="${t("Eklemeleri/silmeleri işaretleyerek izle", "Track insertions/deletions")}">📝<span>${t("Değişiklikleri İzle", "Track Changes")}</span></button>
        </div><div class="rrow">
          <button data-cmd="tc-accept-all" title="${t("Tüm değişiklikleri kabul et", "Accept all changes")}">✓ ${t("Tümünü Kabul", "Accept All")}</button>
          <button data-cmd="tc-reject-all" title="${t("Tüm değişiklikleri reddet", "Reject all changes")}">✗ ${t("Tümünü Reddet", "Reject All")}</button>
        </div><label>${t("Değişiklik İzleme", "Tracking")}</label></div>` },

      { name: t("Görünüm", "View"), html: `
        <div class="rgroup"><div class="rrow">
          <select data-cmd="zoom" id="wd-zoom">
            <option value="0.5">%50</option><option value="0.75">%75</option><option value="1" selected>%100</option>
            <option value="1.25">%125</option><option value="1.5">%150</option><option value="2">%200</option>
          </select>
        </div><label>${t("Yakınlaştır", "Zoom")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="page-view" data-state="pageview" class="big" title="${t("Sayfaları ayrı sayfalar halinde göster", "Show content split into pages")}">📄<span>${t("Sayfa Görünümü", "Page View")}</span></button>
        </div><label>${t("Sayfa Düzeni", "Layout")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="print" class="big">🖨<span>${t("Yazdır / PDF", "Print / PDF")}</span></button>
        </div><label>${t("Çıktı", "Output")}</label></div>` },
    ];
  },

  /* ---------- Bağlama / ayırma ---------- */
  mount(doc) {
    document.getElementById("subbar").innerHTML = "";
    document.getElementById("workarea").innerHTML = `
      <div id="wd-scroll"><div id="wd-page">
        <div id="wd-header-wrap" class="wd-hf-wrap">
          <button class="wd-hf-x" data-hf="header" contenteditable="false" title="${XL.t("Üst bilgiyi kaldır", "Remove header")}">✕ ${XL.t("Kaldır", "Remove")}</button>
          <div id="wd-header" class="wd-hf wd-header" data-label="${XL.t("Üst Bilgi", "Header")}" contenteditable="true" spellcheck="true"></div>
        </div>
        <div id="wd-body" contenteditable="true" spellcheck="true"></div>
        <div id="wd-footnotes" class="wd-footnotes" contenteditable="false"></div>
        <div id="wd-footer-wrap" class="wd-hf-wrap">
          <button class="wd-hf-x" data-hf="footer" contenteditable="false" title="${XL.t("Alt bilgiyi kaldır", "Remove footer")}">✕ ${XL.t("Kaldır", "Remove")}</button>
          <div id="wd-footer" class="wd-hf wd-footer" data-label="${XL.t("Alt Bilgi", "Footer")}" contenteditable="true" spellcheck="true"></div>
        </div>
      </div></div>`;
    this.doc = doc;
    this.pageEl = document.getElementById("wd-page");
    this.body = document.getElementById("wd-body");
    this.header = document.getElementById("wd-header");
    this.footer = document.getElementById("wd-footer");
    this.headerWrap = document.getElementById("wd-header-wrap");
    this.footerWrap = document.getElementById("wd-footer-wrap");
    this.pageEl.querySelectorAll(".wd-hf-x").forEach((b) =>
      b.addEventListener("click", () => this.toggleHF(b.dataset.hf)));
    this.editor = this.body; // o an düzenlenen etkin alan (body/header/footer)
    this.page = this.normalizePage(doc.data.page);
    this.footnotesEl = document.getElementById("wd-footnotes");
    this.trackChanges = false;          // değişiklik izleme (track changes)
    this.tcAuthor = this.tcAuthorName();
    if (this.pageView === undefined) this.pageView = true;   // gerçek sayfalama (sayfa görünümü)
    this.body.innerHTML = doc.data.html || "<p><br></p>";
    this.header.innerHTML = this.page.header.html || "<p><br></p>";
    this.footer.innerHTML = this.page.footer.html || "<p><br></p>";
    this.savedRange = null;
    this.applyPage();
    this.applyHF();
    this.renderFootnotes();

    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand("styleWithCSS", false, true);
    } catch (e) {}

    [this.body, this.header, this.footer].forEach((ed) => {
      ed.addEventListener("input", () => { this.ensureParagraph(); this.normalize(); this.saveRange(); this.updateCount(); this.renderFootnotes(); this._scheduleReflow(); XL.ws.changed(); });
      ed.addEventListener("keydown", (e) => this.onKey(e));
      // selectionchange'e ek olarak: imleç her hareket ettiğinde seçimi sakla
      ed.addEventListener("keyup", () => this.saveRange());
      ed.addEventListener("mouseup", () => this.saveRange());
      ed.addEventListener("focus", () => { this.editor = ed; });
      ed.addEventListener("click", (e) => {
        // Ctrl+tık bağlantıyı açar (Word'deki gibi)
        const a = e.target.closest("a");
        if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, "_blank", "noopener");
        // Dipnot işaretçisine tıklama → metni düzenle
        const fn = e.target.closest(".wd-fn");
        if (fn) { e.preventDefault(); this.editFootnote(fn); return; }
        // İzlenen değişikliğe tıklama → kabul/reddet açılır kutusu
        const tc = e.target.closest(".tc");
        if (tc && ed === this.body) { this._tcClick(tc); return; }
        this._tcPopHide();
        // Resim seçimi
        ed.querySelectorAll("img.sel").forEach((i) => i.classList.remove("sel"));
        if (e.target.tagName === "IMG") { e.target.classList.add("sel"); this.selectedImg = e.target; }
        else this.selectedImg = null;
      });
      ed.addEventListener("paste", (e) => this.onPaste(e));
    });
    // Değişiklik izleme: yalnız gövdede giriş/silmeyi yakala (track changes).
    this.body.addEventListener("beforeinput", (e) => this.onBeforeInput(e));
    this.bindGlobals();
    this.updateCount();
    setTimeout(() => {
      this.body.focus();
      // İmleci başa koy
      const r = document.createRange();
      r.setStart(this.body, 0); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      this.saveRange();
      this.reflowPages();   // gerçek sayfalama
    }, 0);
  },

  unmount(doc) {
    doc.data = this.serialize();
    this.editor = this.body = this.header = this.footer = this.pageEl = this.headerWrap = this.footerWrap = null;
  },

  // Bir düzenleme alanının temizlenmiş innerHTML'ini döndür
  cleanField(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("img.sel").forEach((i) => i.classList.remove("sel"));
    // Sayfalama itmeleri yalnız görünümdür → serialize'da kaldır
    clone.querySelectorAll("[data-tc-push]").forEach((b) => {
      b.style.marginTop = b.getAttribute("data-tc-mt0") || "";
      if (!b.getAttribute("style")) b.removeAttribute("style");
      b.removeAttribute("data-tc-push"); b.removeAttribute("data-tc-mt0");
    });
    clone.querySelectorAll('[class=""]').forEach((e) => e.removeAttribute("class"));
    return clone.innerHTML;
  },

  serialize() {
    if (!this.body) return this.doc ? this.doc.data : this.createData();
    const page = Object.assign({}, this.page);
    // Kapalı olsa bile içeriği sakla (tekrar açınca gelsin)
    page.header = { on: this.page.header.on, html: this.header ? this.cleanField(this.header) : this.page.header.html };
    page.footer = { on: this.page.footer.on, html: this.footer ? this.cleanField(this.footer) : this.page.footer.html };
    return { html: this.cleanField(this.body), page };
  },

  async importFile(file) {
    const buf = await XL.readAsArrayBuffer(file);
    return XL.docxIO.importArrayBuffer(buf);
  },

  async save(doc) {
    const data = this.serialize();
    // Dönüştürücü gerçek DOM ölçülerine (resim boyutları) ihtiyaç duyar: canlı gövdeyi kullan
    const root = this.body || Object.assign(document.createElement("div"), { innerHTML: data.html });
    const blob = await XL.docxIO.exportBlob(root, data.page);
    XL.download(blob, doc.name + ".docx");
  },

  bindGlobals() {
    if (this.globalsBound) return;
    this.globalsBound = true;
    window.addEventListener("resize", () => { if (document.body.dataset.mode === "docx") this._scheduleReflow(); });
    document.addEventListener("selectionchange", () => {
      if (!this.body || document.body.dataset.mode !== "docx") return;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      // Seçim hangi alandaysa (gövde/üst bilgi/alt bilgi) etkin editör odur
      const zone = [this.body, this.header, this.footer].find((z) => z && z.contains(sel.anchorNode));
      if (zone) {
        this.editor = zone;
        this.saveRange();
        this.syncToolbar();
      }
    });
  },

  /* ---------- Seçim koruma ---------- */
  saveRange() {
    const sel = window.getSelection();
    if (sel.rangeCount && this.editor && this.editor.contains(sel.anchorNode)) {
      this.savedRange = sel.getRangeAt(0).cloneRange();
    }
  },
  // Şeride tıklanmadan hemen önce (workspace çağırır): seçim hâlâ editördeyken sakla
  beforeRibbon() {
    this.saveRange();
  },

  restoreRange() {
    if (!this.editor) return;
    const sel = window.getSelection();
    // Odak ve seçim zaten editördeyse en güncel seçim odur; eski kaydı geri yükleme
    if (document.activeElement === this.editor && sel.rangeCount && this.editor.contains(sel.anchorNode)) return;
    this.editor.focus({ preventScroll: true });
    if (this.savedRange && this.editor.contains(this.savedRange.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(this.savedRange.cloneRange());
    }
  },

  // Editör hiç blok içermiyorsa bir paragraf aç (çıplak metin olmasın)
  ensureParagraph() {
    const ed = this.editor;
    if (!ed.firstChild || (ed.childNodes.length === 1 && ed.firstChild.nodeName === "BR")) {
      ed.innerHTML = "<p><br></p>";
      const r = document.createRange();
      r.setStart(ed.firstChild, 0);
      r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  },

  /* ---------- Komutlar ---------- */
  exec(cmd, value = null) {
    this.restoreRange();
    document.execCommand(cmd, false, value);
    this.saveRange();
    this.afterChange();
  },

  afterChange() {
    this.normalize();
    this.syncToolbar();
    this.updateCount();
    XL.ws.changed();
  },

  // Tarayıcı düzenleme komutları bazen geçersiz iç içe yapı üretir (<p><ul>…</ul></p>, <p><p>…</p></p>).
  // Blok içeren paragrafları aç; imleci koru (düğümler taşınır, yeniden oluşturulmaz).
  normalize() {
    const ed = this.editor;
    if (!ed) return;
    const bad = [...ed.querySelectorAll("p")].filter((p) => p.querySelector(":scope > p, :scope > ul, :scope > ol, :scope > table, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > blockquote, :scope > pre, :scope > div"));
    if (!bad.length) return;
    const sel = window.getSelection();
    const saved = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
    bad.reverse().forEach((p) => {
      // Satır içi çocukları kendi paragraflarına topla, blokları olduğu gibi yukarı taşı
      let inlineBuf = null;
      const align = p.style.textAlign;
      [...p.childNodes].forEach((n) => {
        const isBlock = n.nodeType === 1 && /^(P|UL|OL|TABLE|H[1-6]|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName);
        if (isBlock) {
          inlineBuf = null;
          if (align && !n.style.textAlign && n.tagName !== "TABLE") n.style.textAlign = align;
          p.before(n);
        } else {
          if (n.nodeType === 3 && !n.nodeValue.trim() && !inlineBuf) { n.remove(); return; }
          if (!inlineBuf) {
            inlineBuf = document.createElement("p");
            if (align) inlineBuf.style.textAlign = align;
            p.before(inlineBuf);
          }
          inlineBuf.appendChild(n);
        }
      });
      p.remove();
    });
    if (saved && saved[0] && ed.contains(saved[0])) {
      try { sel.setBaseAndExtent(saved[0], saved[1], saved[2], saved[3]); } catch (e) {}
    }
    this.saveRange();
  },

  // Tablo / çizgi / sayfa sonu gibi blokları imlecin bulunduğu üst düzey bloğun ardına DOM ile ekle.
  // (insertHTML geçersiz iç içe yapıların içinde tabloları parçalayabiliyor.)
  insertBlock(html, caretSelector) {
    this.restoreRange();
    const ed = this.editor;
    const sel = window.getSelection();
    let node = sel.rangeCount ? sel.getRangeAt(0).endContainer : null;
    if (node && !ed.contains(node)) node = null;
    while (node && node.parentNode !== ed) node = node.parentNode;
    if (node === ed) node = null;

    const holder = document.createElement("div");
    holder.innerHTML = html;
    const nodes = [...holder.childNodes];
    const frag = document.createDocumentFragment();
    nodes.forEach((n) => frag.appendChild(n));

    if (!node) ed.appendChild(frag);
    else if (node.nodeType === 1 && !node.textContent.trim() && !node.querySelector("img,table,hr")) node.replaceWith(frag);
    else node.after(frag);

    // İmleci istenen yere (ör. tablonun ilk hücresi) koy
    const target = nodes.map((n) => (n.nodeType === 1 && n.matches(caretSelector) ? n : n.nodeType === 1 && n.querySelector(caretSelector))).find(Boolean);
    if (target) {
      const r = document.createRange();
      r.selectNodeContents(target);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    this.saveRange();
    this.afterChange();
  },

  command(cmd, value) {
    const simple = ["bold", "italic", "underline", "strikeThrough", "superscript", "subscript",
      "insertUnorderedList", "insertOrderedList", "outdent", "indent",
      "justifyLeft", "justifyCenter", "justifyRight", "justifyFull", "removeFormat", "unlink", "selectAll"];
    if (simple.includes(cmd)) return this.exec(cmd);

    switch (cmd) {
      case "undo": return this.exec("undo");
      case "redo": return this.exec("redo");
      case "cut": return this.exec("cut");
      case "copy": return this.exec("copy");
      case "paste": return this.pasteFromClipboard(false);
      case "paste-plain": return this.pasteFromClipboard(true);
      case "fontName": return this.exec("fontName", value);
      case "fontSize": return this.setFontSize(parseFloat(value));
      case "grow": return this.setFontSize(this.nextSize(1));
      case "shrink": return this.setFontSize(this.nextSize(-1));
      case "foreColor": return this.exec("foreColor", value);
      case "hiliteColor": return this.exec("hiliteColor", value);
      case "formatBlock": return this.exec("formatBlock", value);
      case "lineHeight": return this.setLineHeight(value);
      case "find": return this.findReplace();
      case "page-break": return this.insertPageBreak();
      case "ins-header": return this.toggleHF("header");
      case "ins-footer": return this.toggleHF("footer");
      case "ins-pagenum": return this.insertPageNumber();
      case "table": return this.insertTableDialog();
      case "tbl-row": return this.tableOp("row");
      case "tbl-col": return this.tableOp("col");
      case "tbl-delrow": return this.tableOp("delrow");
      case "tbl-delcol": return this.tableOp("delcol");
      case "image": return this.insertImage();
      case "img-size":
        if (this.selectedImg && value) { this.selectedImg.style.width = value; this.selectedImg.style.height = "auto"; XL.ws.changed(); }
        else if (value) alert(XL.t("Önce belgede bir resme tıklayın.", "Click an image in the document first."));
        document.querySelector('#ribbon select[data-cmd="img-size"]').value = "";
        return;
      case "link": {
        this.restoreRange();
        const url = prompt(XL.t("Bağlantı adresi (URL):", "Link address (URL):"), "https://");
        if (!url || url === "https://") return;
        const sel = window.getSelection();
        if (sel.isCollapsed) this.exec("insertHTML", `<a href="${XL.esc(url)}">${XL.esc(url)}</a>`);
        else this.exec("createLink", url);
        return;
      }
      case "hr": return this.insertBlock("<hr><p><br></p>", "p");
      case "date": return this.exec("insertText", new Date().toLocaleDateString(XL.i18n && XL.i18n.locale === "en" ? "en-US" : "tr-TR", { day: "numeric", month: "long", year: "numeric" }));
      case "symbol": return this.symbolDialog();
      case "page-margin":
        if (value === "custom") return this.marginDialog();
        this.page.margin = value; this.applyPage(); return XL.ws.changed();
      case "page-orient": this.page.orientation = value; this.applyPage(); return XL.ws.changed();
      case "page-size": this.page.size = value; this.applyPage(); return XL.ws.changed();
      case "footnote": return this.insertFootnote();
      case "track-changes":
        this.trackChanges = !this.trackChanges;
        XL.ws.syncRibbonState();
        XL.status(this.trackChanges ? XL.t("Değişiklik izleme açık", "Track changes on") : XL.t("Değişiklik izleme kapalı", "Track changes off"));
        return;
      case "tc-accept-all": return this.acceptRejectAll(true);
      case "tc-reject-all": return this.acceptRejectAll(false);
      case "wordcount": {
        const c = this.counts();
        return alert(XL.t(
          `Sayfalar (yaklaşık): ${c.pages}\nSözcükler: ${c.words}\nKarakterler (boşluklu): ${c.chars}\nKarakterler (boşluksuz): ${c.charsNoSpace}\nParagraflar: ${c.paras}`,
          `Pages (approx.): ${c.pages}\nWords: ${c.words}\nCharacters (with spaces): ${c.chars}\nCharacters (no spaces): ${c.charsNoSpace}\nParagraphs: ${c.paras}`));
      }
      case "spellcheck": this.editor.spellcheck = !this.editor.spellcheck; return XL.ws.syncRibbonState();
      case "zoom": this.zoom = parseFloat(value) || 1; return this.applyPage();
      case "page-view":
        this.pageView = !this.pageView;
        XL.ws.syncRibbonState();
        this.reflowPages();
        return XL.status(this.pageView ? XL.t("Sayfa görünümü açık", "Page view on") : XL.t("Sayfa görünümü kapalı", "Page view off"));
      case "print": return this.print();
    }
  },

  isOn(state) {
    if (state === "header") return !!(this.page && this.page.header && this.page.header.on);
    if (state === "footer") return !!(this.page && this.page.footer && this.page.footer.on);
    if (!this.editor) return false;
    if (state === "spellcheck") return this.editor.spellcheck;
    if (state === "track") return !!this.trackChanges;
    if (state === "pageview") return !!this.pageView;
    try { return document.queryCommandState(state); } catch (e) { return false; }
  },

  // Şeritteki yazı tipi / boyut / stil seçicilerini imlecin bulunduğu yere göre güncelle
  syncToolbar() {
    XL.ws.syncRibbonState();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentElement;
    if (!node || !this.editor.contains(node)) return;
    const cs = getComputedStyle(node);
    const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const fEl = document.getElementById("wd-font");
    if (fEl && this.FONTS.includes(fam)) fEl.value = fam;
    const sEl = document.getElementById("wd-size");
    if (sEl) {
      const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
      if (![...sEl.options].some((o) => +o.value === pt)) {
        const o = document.createElement("option");
        o.value = pt; o.textContent = pt; o.dataset.temp = "1";
        sEl.querySelectorAll("option[data-temp]").forEach((x) => x.remove());
        sEl.appendChild(o);
      }
      sEl.value = pt;
    }
    const block = node.closest("h1,h2,h3,h4,blockquote,pre,p,li");
    const stEl = document.getElementById("wd-style");
    if (stEl && block) {
      const t = block.tagName;
      stEl.value = ["H1", "H2", "H3", "H4", "BLOCKQUOTE", "PRE"].includes(t) ? t : "P";
    }
  },

  /* ---------- Yazı boyutu ---------- */
  setFontSize(pt) {
    if (!pt) return;
    this.restoreRange();
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      // İmleçte: yeni yazılacak metin için boş bir span aç
      const span = document.createElement("span");
      span.style.fontSize = pt + "pt";
      span.appendChild(document.createTextNode("​"));
      const r = sel.getRangeAt(0);
      r.insertNode(span);
      r.setStart(span.firstChild, 1);
      r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    } else {
      // execCommand fontSize yalnızca 1-7 bilir: 7 ile işaretleyip gerçek punto ile değiştir
      document.execCommand("styleWithCSS", false, false);
      document.execCommand("fontSize", false, "7");
      document.execCommand("styleWithCSS", false, true);
      const spans = [];
      this.editor.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement("span");
        span.style.fontSize = pt + "pt";
        while (f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
        spans.push(span);
      });
      // execCommand bazen CSS ile "xxx-large" üretir; onları da düzelt
      this.editor.querySelectorAll('span[style*="xxx-large"]').forEach((s) => { s.style.fontSize = pt + "pt"; spans.push(s); });
      // Değişim seçimi bozar: yeni metni yeniden seç ki ardından renk vb. uygulanabilsin
      if (spans.length) {
        const r = document.createRange();
        r.setStartBefore(spans[0]);
        r.setEndAfter(spans[spans.length - 1]);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    this.saveRange();
    this.afterChange();
  },

  nextSize(dir) {
    const cur = parseFloat(document.getElementById("wd-size").value) || 11;
    if (dir > 0) return this.SIZES.find((s) => s > cur) || cur + 8;
    return [...this.SIZES].reverse().find((s) => s < cur) || Math.max(1, cur - 1);
  },

  // Seçimin kapsadığı blokları bul
  selectedBlocks() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const blocks = [...this.editor.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div:not(.page-break)")]
      .filter((b) => range.intersectsNode(b) && !b.querySelector("p,h1,h2,h3,h4,li,blockquote,pre"));
    if (!blocks.length) {
      let n = range.startContainer;
      if (n.nodeType === 3) n = n.parentElement;
      const b = n.closest && n.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre");
      if (b && this.editor.contains(b)) blocks.push(b);
    }
    return blocks;
  },

  setLineHeight(v) {
    if (!v) return;
    this.restoreRange();
    this.selectedBlocks().forEach((b) => (b.style.lineHeight = v));
    document.querySelector('#ribbon select[data-cmd="lineHeight"]').value = "";
    this.afterChange();
  },

  /* ---------- Klavye ---------- */
  onKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === "e") { e.preventDefault(); return this.exec("justifyCenter"); }
    if (ctrl && k === "l") { e.preventDefault(); return this.exec("justifyLeft"); }
    if (ctrl && k === "r") { e.preventDefault(); return this.exec("justifyRight"); }
    if (ctrl && k === "j") { e.preventDefault(); return this.exec("justifyFull"); }
    if (ctrl && k === "h") { e.preventDefault(); return this.findReplace(); }
    if (ctrl && k === "p") { e.preventDefault(); return this.print(); }
    if (ctrl && e.key === "Enter") { e.preventDefault(); return this.insertPageBreak(); }
    if (ctrl && (e.key === "]" || e.key === "[")) { e.preventDefault(); return this.setFontSize(this.nextSize(e.key === "]" ? 1 : -1)); }
    if (e.key === "Tab") {
      e.preventDefault();
      const sel = window.getSelection();
      let n = sel.anchorNode;
      if (n && n.nodeType === 3) n = n.parentElement;
      if (n && n.closest("li")) return this.exec(e.shiftKey ? "outdent" : "indent");
      if (n && n.closest("td,th")) return this.moveCell(n.closest("td,th"), e.shiftKey ? -1 : 1);
      return this.exec("insertText", "  ");
    }
  },

  // Tabloda Tab ile hücreler arası gezin; son hücrede yeni satır aç
  moveCell(cell, dir) {
    const table = cell.closest("table");
    const cells = [...table.querySelectorAll("td,th")];
    let i = cells.indexOf(cell) + dir;
    if (i >= cells.length) { this.tableOp("row"); i = cells.length; }
    const target = table.querySelectorAll("td,th")[Math.max(0, i)];
    if (!target) return;
    const r = document.createRange();
    r.selectNodeContents(target);
    r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    this.saveRange();
  },

  /* ---------- Yapıştırma ---------- */
  onPaste(e) {
    const html = e.clipboardData.getData("text/html");
    if (!html) return; // düz metin: tarayıcı halletsin
    e.preventDefault();
    this.exec("insertHTML", this.cleanHTML(html));
  },

  async pasteFromClipboard(plain) {
    this.restoreRange();
    try {
      if (!plain && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          if (it.types.includes("text/html")) {
            const html = await (await it.getType("text/html")).text();
            return this.exec("insertHTML", this.cleanHTML(html));
          }
        }
      }
      const text = await navigator.clipboard.readText();
      this.exec("insertText", text);
    } catch (err) {
      alert(XL.t("Tarayıcı panoya erişime izin vermedi. Ctrl+V kullanın.", "The browser denied clipboard access. Use Ctrl+V."));
    }
  },

  // Dışarıdan yapıştırılan HTML'den script, stil blokları ve olay özniteliklerini temizle
  cleanHTML(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    tmp.querySelectorAll("script,style,meta,link,title,xml,o\\:p").forEach((n) => n.remove());
    tmp.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((a) => {
        const n = a.name.toLowerCase();
        if (n.startsWith("on") || n === "class" || n === "id" || (n === "href" && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      });
    });
    return tmp.innerHTML;
  },

  /* ---------- Ekle ---------- */
  insertPageBreak() {
    this.insertBlock('<div class="page-break" contenteditable="false"></div><p><br></p>', "p");
  },

  insertTableDialog() {
    this.saveRange();
    let html = '<div class="tbl-picker" id="tbl-picker">';
    for (let r = 1; r <= 8; r++)
      for (let c = 1; c <= 10; c++) html += `<span data-r="${r}" data-c="${c}"></span>`;
    html += "</div>";
    XL.showPanel(XL.t("Tablo Ekle", "Insert Table"), `
      <p style="margin-top:0">${XL.t("Boyutu seçin:", "Choose size:")} <b id="tbl-lbl">1 × 1</b></p>${html}
      <p>${XL.t("veya:", "or:")} <input id="tbl-r" type="number" min="1" max="100" value="3" style="width:60px"> ${XL.t("satır", "rows")} ×
      <input id="tbl-c" type="number" min="1" max="30" value="3" style="width:60px"> ${XL.t("sütun", "cols")}
      <button id="tbl-ok">${XL.t("Ekle", "Insert")}</button></p>
      <label><input id="tbl-head" type="checkbox" checked> ${XL.t("İlk satır başlık", "First row is header")}</label>`);
    const picker = document.getElementById("tbl-picker");
    picker.onmouseover = (e) => {
      const s = e.target.closest("span"); if (!s) return;
      const R = +s.dataset.r, C = +s.dataset.c;
      document.getElementById("tbl-lbl").textContent = `${R} × ${C}`;
      picker.querySelectorAll("span").forEach((x) => x.classList.toggle("on", +x.dataset.r <= R && +x.dataset.c <= C));
    };
    picker.onclick = (e) => {
      const s = e.target.closest("span"); if (!s) return;
      this.insertTable(+s.dataset.r, +s.dataset.c);
    };
    document.getElementById("tbl-ok").onclick = () =>
      this.insertTable(+document.getElementById("tbl-r").value || 3, +document.getElementById("tbl-c").value || 3);
  },

  insertTable(rows, cols) {
    const head = document.getElementById("tbl-head") && document.getElementById("tbl-head").checked;
    XL.hidePanel();
    let html = "<table><tbody>";
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) html += head && r === 0 ? '<td style="font-weight:bold;background-color:#dde6f3"><br></td>' : "<td><br></td>";
      html += "</tr>";
    }
    html += "</tbody></table><p><br></p>";
    this.insertBlock(html, "td");
  },

  currentCell() {
    const sel = window.getSelection();
    let n = (this.savedRange && this.savedRange.startContainer) || (sel.rangeCount && sel.anchorNode);
    if (n && n.nodeType === 3) n = n.parentElement;
    return n && n.closest ? n.closest("td,th") : null;
  },

  tableOp(op) {
    const cell = this.currentCell();
    if (!cell || !this.editor.contains(cell)) return alert(XL.t("Önce imleci bir tablo hücresine yerleştirin.", "Place the cursor in a table cell first."));
    const tr = cell.parentElement, table = cell.closest("table");
    const ci = [...tr.cells].indexOf(cell);
    if (op === "row") {
      const nr = tr.cloneNode(true);
      [...nr.cells].forEach((c) => { c.innerHTML = "<br>"; c.removeAttribute("style"); });
      tr.after(nr);
    } else if (op === "col") {
      [...table.rows].forEach((row) => {
        const ref = row.cells[Math.min(ci, row.cells.length - 1)];
        const nc = document.createElement(ref.tagName);
        nc.innerHTML = "<br>";
        ref.after(nc);
      });
    } else if (op === "delrow") {
      if (table.rows.length <= 1) table.remove(); else tr.remove();
    } else if (op === "delcol") {
      if (tr.cells.length <= 1) table.remove();
      else [...table.rows].forEach((row) => row.cells[ci] && row.cells[ci].remove());
    }
    this.afterChange();
  },

  insertImage() {
    this.saveRange();
    XL.pickFile("image/png,image/jpeg,image/gif,image/bmp", (file) => this.insertImageFile(file));
  },

  async insertImageFile(file) {
    const url = await XL.readAsDataURL(file);
    this.exec("insertHTML", `<img src="${url}" style="max-width:100%">`);
  },

  symbolDialog() {
    this.saveRange();
    const chars = "©®™€£$¥₺§¶•…–—«»“”‘’±×÷≤≥≠≈∞√∑∏∫∂πΩμ°‰αβγδελσφωΔ←→↑↓↔⇒⇔✓✗★☆♥♦♣♠☺☎✉♪";
    XL.showPanel(XL.t("Simge", "Symbol"), `<div class="sym-grid">${[...chars].map((c) => `<button data-ch="${c}">${c}</button>`).join("")}</div>`);
    document.querySelector(".sym-grid").onclick = (e) => {
      const b = e.target.closest("button[data-ch]");
      if (b) this.exec("insertText", b.dataset.ch);
    };
  },

  /* ---------- Bul / Değiştir ---------- */
  findReplace() {
    this.saveRange();
    XL.showPanel(XL.t("Bul ve Değiştir", "Find and Replace"), `
      <label>${XL.t("Aranan:", "Find:")} <input id="wf-find" type="text"></label><br>
      <label>${XL.t("Yeni:", "Replace:")} <input id="wf-repl" type="text"></label><br>
      <label><input id="wf-case" type="checkbox"> ${XL.t("Büyük/küçük harf duyarlı", "Case sensitive")}</label><br>
      <button id="wf-next">${XL.t("Sonrakini Bul", "Find Next")}</button>
      <button id="wf-all">${XL.t("Tümünü Değiştir", "Replace All")}</button>
      <div id="wf-msg" style="margin-top:8px;color:#555"></div>`);
    const $ = (id) => document.getElementById(id);
    $("wf-find").focus();
    $("wf-next").onclick = () => {
      const q = $("wf-find").value;
      if (!q) return;
      this.editor.focus();
      // window.find standart değil ama Chrome/Edge/Firefox destekliyor
      const ok = window.find && window.find(q, $("wf-case").checked, false, true);
      $("wf-msg").textContent = ok ? "" : XL.t("Bulunamadı.", "Not found.");
    };
    $("wf-all").onclick = () => {
      const q = $("wf-find").value, rep = $("wf-repl").value;
      if (!q) return;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $("wf-case").checked ? "g" : "gi");
      let n = 0;
      const walker = document.createTreeWalker(this.editor, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((t) => {
        const m = t.nodeValue.match(re);
        if (m) { n += m.length; t.nodeValue = t.nodeValue.replace(re, rep); }
      });
      $("wf-msg").textContent = n + XL.t(" eşleşme değiştirildi.", " matches replaced.");
      this.afterChange();
    };
  },

  /* ---------- Sayfa düzeni ---------- */
  applyPage() {
    if (!this.pageEl) return;
    const ed = this.pageEl;
    const sizes = { A4: [21, 29.7], Letter: [21.59, 27.94], A5: [14.8, 21] };
    let [w, h] = sizes[this.page.size] || sizes.A4;
    if (this.page.orientation === "landscape") [w, h] = [h, w];
    ed.style.width = w + "cm";
    ed.style.minHeight = h + "cm";
    if (this.page.margin && typeof this.page.margin === "object") {
      const o = this.page.margin; // {t,r,b,l} cm
      ed.style.padding = `${o.t}cm ${o.r}cm ${o.b}cm ${o.l}cm`;
    } else {
      const m = { normal: [2.54, 2.54], narrow: [1.27, 1.27], wide: [2.54, 5.08], none: [0, 0] }[this.page.margin] || [2.54, 2.54];
      ed.style.padding = `${m[0]}cm ${m[1]}cm`;
    }
    ed.style.zoom = this.zoom;
    ed.style.setProperty("--page-h", h + "cm");
    // Yazdırma için @page kuralı
    let st = document.getElementById("print-page-style");
    if (!st) { st = document.createElement("style"); st.id = "print-page-style"; document.head.appendChild(st); }
    st.textContent = `@page { size: ${this.page.size === "Letter" ? "letter" : this.page.size} ${this.page.orientation}; margin: 0; }`;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set("wd-margin", typeof this.page.margin === "object" ? "custom" : this.page.margin);
    set("wd-orient", this.page.orientation);
    set("wd-psize", this.page.size);
    set("wd-zoom", String(this.zoom));
    this._scheduleReflow();   // sayfa boyutu/kenar boşluğu/zoom değişti → sayfalamayı yeniden hesapla
  },

  /* ---------- Gerçek sayfalama (sayfa görünümü) (Faz 6) ----------
   * İçerik tek akışta düzenlenir; ama blok öğeler, bir sayfa sınırını aşacaklarsa
   * bir sonraki sayfanın üstüne itilir (margin-top) → metin gri oluğa denk gelmez.
   * Sayfalar gri oluklarla ayrılmış beyaz kâğıtlar gibi görünür. Bu itmeler yalnız
   * GÖRÜNÜMdür; serialize/.docx'e taşınmaz (cleanField temizler).
   */
  _scheduleReflow() { clearTimeout(this._reflowT); this._reflowT = setTimeout(() => this.reflowPages(), 120); },

  reflowPages() {
    const pageEl = this.pageEl, body = this.body;
    if (!pageEl || !body) return;
    // Önceki itmeleri geri al
    body.querySelectorAll("[data-tc-push]").forEach((b) => {
      b.style.marginTop = b.getAttribute("data-tc-mt0") || "";
      if (!b.getAttribute("style")) b.removeAttribute("style");
      b.removeAttribute("data-tc-push"); b.removeAttribute("data-tc-mt0");
    });
    if (!this.pageView) { pageEl.classList.remove("paged"); this.updateCount(); return; }
    pageEl.classList.add("paged");

    const PXCM = 96 / 2.54;
    const sizes = { A4: [21, 29.7], Letter: [21.59, 27.94], A5: [14.8, 21] };
    let [, hC] = sizes[this.page.size] || sizes.A4;
    if (this.page.orientation === "landscape") hC = (sizes[this.page.size] || sizes.A4)[0];
    const pageH = hC * PXCM;
    const cs = getComputedStyle(pageEl);
    const mT = parseFloat(cs.paddingTop) || 0, mB = parseFloat(cs.paddingBottom) || 0;
    const GUT = 28;                 // sayfalar arası gri oluk (px)
    const period = pageH + GUT;
    const usableH = pageH - mT - mB;
    pageEl.style.setProperty("--page-h", pageH + "px");
    pageEl.style.setProperty("--page-gut", GUT + "px");

    let maxBottom = 0;
    const blocks = [...body.children].filter((n) => n.nodeType === 1 && n.offsetParent !== null);
    blocks.forEach((block) => {
      const top = block.offsetTop;                 // pageEl'e göre (pageEl position:relative)
      const h = block.offsetHeight;
      const pageIdx = Math.floor(top / period);
      const usableBottom = pageIdx * period + (pageH - mB);
      if (h <= usableH && top + h > usableBottom + 0.5) {
        const nextTop = (pageIdx + 1) * period + mT;
        const push = nextTop - top;
        if (push > 0) {
          block.setAttribute("data-tc-mt0", block.style.marginTop || "");
          block.setAttribute("data-tc-push", "1");
          const curMt = parseFloat(getComputedStyle(block).marginTop) || 0;
          block.style.marginTop = (curMt + push) + "px";
        }
      }
      maxBottom = Math.max(maxBottom, block.offsetTop + block.offsetHeight);
    });
    this._pageCount = Math.max(1, Math.floor(maxBottom / period) + 1);
    this.updateCount();
  },

  // Özel kenar boşluğu iletişim kutusu (cm, 4 kenar)
  marginDialog() {
    const cur = typeof this.page.margin === "object"
      ? this.page.margin
      : { normal: { t: 2.54, r: 2.54, b: 2.54, l: 2.54 }, narrow: { t: 1.27, r: 1.27, b: 1.27, l: 1.27 },
          wide: { t: 2.54, r: 5.08, b: 2.54, l: 5.08 }, none: { t: 0, r: 0, b: 0, l: 0 } }[this.page.margin]
        || { t: 2.54, r: 2.54, b: 2.54, l: 2.54 };
    const inp = (id, v) => `<input id="${id}" type="number" min="0" max="10" step="0.1" value="${v}" style="width:70px"> cm`;
    XL.showPanel(XL.t("Özel Kenar Boşlukları", "Custom Margins"), `
      <div class="margin-dialog" style="display:grid;grid-template-columns:auto auto;gap:8px 10px;align-items:center">
        <label>${XL.t("Üst", "Top")}</label>${inp("mg-t", cur.t)}
        <label>${XL.t("Alt", "Bottom")}</label>${inp("mg-b", cur.b)}
        <label>${XL.t("Sol", "Left")}</label>${inp("mg-l", cur.l)}
        <label>${XL.t("Sağ", "Right")}</label>${inp("mg-r", cur.r)}
      </div>
      <p style="margin-top:12px"><button id="mg-ok">${XL.t("Uygula", "Apply")}</button>
      <button id="mg-cancel" class="btn-secondary">${XL.t("Vazgeç", "Cancel")}</button></p>`);
    const num = (id, d) => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? d : Math.max(0, Math.min(10, v)); };
    document.getElementById("mg-ok").onclick = () => {
      this.page.margin = { t: num("mg-t", 2.54), r: num("mg-r", 2.54), b: num("mg-b", 2.54), l: num("mg-l", 2.54) };
      this.applyPage(); XL.ws.changed(); XL.hidePanel();
    };
    document.getElementById("mg-cancel").onclick = () => { XL.hidePanel(); this.applyPage(); };
  },

  /* ---------- Üst / Alt bilgi ---------- */
  // Alanların görünürlüğünü page.header/footer.on'a göre uygula
  applyHF() {
    if (!this.headerWrap) return;
    this.headerWrap.style.display = this.page.header.on ? "" : "none";
    this.footerWrap.style.display = this.page.footer.on ? "" : "none";
    this.pageEl.classList.toggle("has-header", this.page.header.on);
    this.pageEl.classList.toggle("has-footer", this.page.footer.on);
  },

  // Üst/alt bilgiyi aç/kapat. Kapalıyken gövde tüm sayfayı kullanır.
  toggleHF(which) {
    const zone = this.page[which];
    zone.on = !zone.on;
    const el = which === "header" ? this.header : this.footer;
    if (zone.on && !el.textContent.trim() && !el.querySelector("img,table")) el.innerHTML = "<p><br></p>";
    this.applyHF();
    XL.ws.syncRibbonState();
    XL.ws.changed();
    if (zone.on) {
      // Açınca o alana odaklan
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      this.editor = el;
      this.saveRange();
    } else if (this.editor === el) {
      this.editor = this.body;
      this.body.focus();
    }
    this.updateCount();
  },

  // İmlecin bulunduğu üst/alt bilgiye sayfa numarası alanı ekle
  insertPageNumber() {
    if (this.editor !== this.header && this.editor !== this.footer) {
      return alert(XL.t("Sayfa numarası yalnızca üst bilgi veya alt bilgi alanına eklenebilir.\nÖnce üst/alt bilgiyi açıp imleci oraya yerleştirin.", "Page numbers can only be inserted into the header or footer area.\nOpen the header/footer and place the cursor there first."));
    }
    this.restoreRange();
    // data-field ile işaretli, dışa aktarımda gerçek sayfa numarası alanına çevrilir
    this.exec("insertHTML", '<span class="wd-field" data-field="page" contenteditable="false">1</span>&#8203;');
  },

  /* ---------- Dipnotlar (Faz 6) ----------
   * Gövdede satır içi işaretçi: <sup class="wd-fn" data-text="…" contenteditable="false">N</sup>
   * Metin data-text'te saklanır (gövde HTML'iyle birlikte kalıcılaşır); numara render'da
   * belge sırasına göre yeniden hesaplanır. Sayfa altındaki liste türetilir (serialize edilmez).
   */
  insertFootnote() {
    if (this.editor !== this.body) {
      // Dipnot gövdeye eklenir; imleç gövdede değilse gövdeye al
      this.body.focus(); this.editor = this.body;
    }
    this.restoreRange();
    const text = prompt(XL.t("Dipnot metni:", "Footnote text:"), "");
    if (text == null) return;
    const html = `<sup class="wd-fn" data-text="${XL.esc(text)}" contenteditable="false" title="${XL.esc(text)}">0</sup>&#8203;`;
    this.exec("insertHTML", html);
    this.renderFootnotes();
    XL.ws.changed();
  },

  editFootnote(sup) {
    const cur = sup.getAttribute("data-text") || "";
    const text = prompt(XL.t("Dipnot metni (boş = sil):", "Footnote text (empty = delete):"), cur);
    if (text == null) return;
    if (text === "") sup.remove();
    else { sup.setAttribute("data-text", text); sup.setAttribute("title", text); }
    this.renderFootnotes();
    XL.ws.changed();
  },

  // İşaretçileri belge sırasına göre yeniden numaralandır + alt listeyi çiz
  renderFootnotes() {
    if (!this.body || !this.footnotesEl) return;
    const marks = [...this.body.querySelectorAll("sup.wd-fn")];
    marks.forEach((m, i) => { m.textContent = String(i + 1); });
    if (!marks.length) { this.footnotesEl.innerHTML = ""; this.footnotesEl.style.display = "none"; return; }
    this.footnotesEl.style.display = "";
    this.footnotesEl.innerHTML = marks.map((m, i) =>
      `<div class="wd-fn-item"><sup>${i + 1}</sup> <span>${XL.esc(m.getAttribute("data-text") || "")}</span></div>`).join("");
  },

  /* ---------- Değişiklik izleme (track changes) (Faz 6) ----------
   * Açıkken gövdedeki giriş/silme doğrudan uygulanmaz; işaretlenir:
   *   ekleme → <ins class="tc tc-ins" data-author data-ts>…</ins>
   *   silme  → <del class="tc tc-del" …>…</del>  (içerik korunur, üstü çizili gösterilir)
   * Kabul: ins aç (metni bırak) + del sil.  Reddet: ins sil + del aç.
   * .docx'e InsertedTextRun / DeletedTextRun (w:ins / w:del) olarak yazılır.
   */
  tcAuthorName() {
    return (XL.auth && XL.auth.user && XL.auth.user.email && XL.auth.user.email.split("@")[0]) || XL.t("Siz", "You");
  },

  onBeforeInput(e) {
    if (!this.trackChanges) return;
    const it = e.inputType || "";
    const sel = window.getSelection();
    if (!sel.rangeCount || !this.body.contains(sel.anchorNode)) return;

    if (it === "insertText" || it === "insertReplacementText" || it === "insertCompositionText") {
      e.preventDefault();
      const range = sel.getRangeAt(0);
      if (!range.collapsed) this._tcDeleteRange(range);
      this._tcInsert(e.data != null ? e.data : "");
      this._afterTc();
    } else if (it.startsWith("delete")) {
      e.preventDefault();
      let range = sel.getRangeAt(0);
      if (range.collapsed) {
        const fwd = it.toLowerCase().includes("forward");
        const gran = it.toLowerCase().includes("word") ? "word" : it.toLowerCase().includes("line") ? "lineboundary" : "character";
        try { sel.modify("extend", fwd ? "forward" : "backward", gran); } catch (err) {}
        range = sel.getRangeAt(0);
        if (range.collapsed) return; // belge sınırı
      }
      this._tcDeleteRange(range);
      this._afterTc();
    }
    // insertParagraph / biçimlendirme / vb. v1'de izlenmez (varsayılan davranış)
  },

  _tcInsert(text) {
    if (text === "") return;
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const sc = range.startContainer;
    // İmleç zaten aynı yazarın ins'inin içindeyse metni oraya ekle (tek ins sürsün)
    const inIns = sc.nodeType === 3 && sc.parentElement && sc.parentElement.closest(".tc-ins");
    if (inIns && inIns.dataset.author === this.tcAuthor && sc.nodeType === 3) {
      const off = range.startOffset;
      sc.insertData(off, text);
      const r = document.createRange(); r.setStart(sc, off + text.length); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      return;
    }
    const ins = document.createElement("ins");
    ins.className = "tc tc-ins"; ins.dataset.author = this.tcAuthor; ins.dataset.ts = String(Date.now());
    ins.textContent = text;
    range.insertNode(ins);
    // İmleci ins metninin SONUNA koy → sonraki tuş aynı ins'e eklenir
    const r = document.createRange(); r.setStart(ins.firstChild, ins.firstChild.length); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  },

  _tcDeleteRange(range) {
    const sel = window.getSelection();
    // Tamamen aynı yazarın (kabul edilmemiş) eklentisi içindeyse → gerçekten sil
    const anc = range.commonAncestorContainer;
    const ancEl = anc.nodeType === 3 ? anc.parentElement : anc;
    const wholeIns = ancEl && ancEl.closest(".tc-ins");
    if (wholeIns) {
      const r0 = range.cloneRange();
      range.deleteContents();
      if (!wholeIns.textContent) wholeIns.remove();
      const r = document.createRange(); r.setStart(r0.startContainer, r0.startOffset); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      return;
    }
    const frag = range.extractContents();
    frag.querySelectorAll && frag.querySelectorAll(".tc-ins").forEach((i) => i.remove()); // eklentiler yok olur
    if (!frag.textContent) {
      const r = document.createRange(); r.setStart(range.startContainer, range.startOffset); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      return;
    }
    const del = document.createElement("del");
    del.className = "tc tc-del"; del.dataset.author = this.tcAuthor; del.dataset.ts = String(Date.now());
    del.appendChild(frag);
    range.insertNode(del);
    const r = document.createRange(); r.setStartAfter(del); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  },

  _afterTc() {
    this.saveRange();
    this.updateCount();
    this.renderFootnotes();
    this._scheduleReflow();
    XL.ws.changed();
  },

  _unwrap(el) {
    const p = el.parentNode; if (!p) return;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  },

  acceptReject(el, accept) {
    const isIns = el.classList.contains("tc-ins");
    if ((isIns && accept) || (!isIns && !accept)) this._unwrap(el); else el.remove();
    this._tcPopHide();
    this.afterChange();
    this._scheduleReflow();
  },

  acceptRejectAll(accept) {
    this._tcPopHide();
    this.body.querySelectorAll(".tc-ins").forEach((el) => { if (accept) this._unwrap(el); else el.remove(); });
    this.body.querySelectorAll(".tc-del").forEach((el) => { if (accept) el.remove(); else this._unwrap(el); });
    this.afterChange();
    this._scheduleReflow();
    XL.status(accept ? XL.t("Tüm değişiklikler kabul edildi.", "All changes accepted.") : XL.t("Tüm değişiklikler reddedildi.", "All changes rejected."));
  },

  _tcClick(el) {
    this._tcPopHide();
    const isIns = el.classList.contains("tc-ins");
    const pop = document.createElement("div");
    pop.id = "tc-pop";
    const who = el.dataset.author ? " · " + XL.esc(el.dataset.author) : "";
    pop.innerHTML = `<span class="tc-pop-label">${isIns ? XL.t("Ekleme", "Insertion") : XL.t("Silme", "Deletion")}${who}</span>
      <button data-a="1" title="${XL.t("Kabul et", "Accept")}">✓</button>
      <button data-a="0" title="${XL.t("Reddet", "Reject")}">✗</button>`;
    document.body.appendChild(pop);
    const rect = el.getBoundingClientRect();
    pop.style.left = Math.max(6, rect.left) + "px";
    pop.style.top = (rect.top - pop.offsetHeight - 6 < 4 ? rect.bottom + 6 : rect.top - pop.offsetHeight - 6) + "px";
    pop.querySelector('[data-a="1"]').onclick = () => this.acceptReject(el, true);
    pop.querySelector('[data-a="0"]').onclick = () => this.acceptReject(el, false);
  },

  _tcPopHide() { const p = document.getElementById("tc-pop"); if (p) p.remove(); },

  print() {
    window.print();
  },

  /* ---------- Sayımlar ---------- */
  counts() {
    const body = this.body;
    const text = body.innerText || "";
    const words = (text.match(/\S+/g) || []).length;
    const pageH = this.pageEl ? parseFloat(getComputedStyle(this.pageEl).minHeight) || 1123 : 1123;
    const breaks = body.querySelectorAll(".page-break").length;
    return {
      words,
      chars: text.replace(/\n/g, "").length,
      charsNoSpace: text.replace(/\s/g, "").length,
      paras: body.querySelectorAll("p,h1,h2,h3,h4,li,blockquote,pre").length,
      // Sayfa görünümü açıksa itmelerle hesaplanan gerçek sayfa sayısı; değilse yükseklikten tahmin
      pages: (this.pageView && this._pageCount) ? this._pageCount : Math.max(1, Math.ceil((body.scrollHeight - 4) / pageH) + breaks),
    };
  },

  updateCount() {
    if (!this.editor) return;
    const c = this.counts();
    XL.status(XL.t(`Sayfa ${c.pages}   ·   ${c.words} sözcük   ·   ${c.chars} karakter`,
      `Page ${c.pages}   ·   ${c.words} words   ·   ${c.chars} characters`));
  },
};
