/* pptx/mode.js — PowerPoint modu: slaytlar, öğe düzenleme, temalar, slayt gösterisi
 *
 * Koordinat sistemi: slayt 960 × 540 mantıksal piksel (= 10 × 5,625 inç, 16:9).
 * Öğeler bu koordinatlarda saklanır; ekranda ölçeklenerek gösterilir.
 */
XL.modes.pptx = {
  type: "pptx",
  label: "PowerPoint",
  icon: "📙",
  ext: ".pptx",
  docPrefix: "Sunu",
  accept: [".pptx"],
  W: 960,
  H: 540,

  // Slayt boyutu (en-boy oranı). Genişlik sabit 960, yükseklik orana göre değişir.
  ASPECTS: {
    "16:9":  { name: "Geniş ekran (16:9)", w: 960, h: 540 },
    "16:10": { name: "16:10",              w: 960, h: 600 },
    "4:3":   { name: "Standart (4:3)",     w: 960, h: 720 },
  },

  THEMES: {
    office:    { name: "Klasik",    bg: "#ffffff", title: "#1f1f1f", text: "#404040", accent: "#c55a11", font: "Calibri" },
    gece:      { name: "Gece",      bg: "#1e2235", title: "#ffffff", text: "#cfd3e6", accent: "#7aa2f7", font: "Segoe UI" },
    okyanus:   { name: "Okyanus",   bg: "#0f4c81", title: "#ffffff", text: "#dbeafe", accent: "#fbbf24", font: "Segoe UI" },
    doga:      { name: "Doğa",      bg: "#f1f7ee", title: "#2e7d32", text: "#33502f", accent: "#66bb6a", font: "Georgia" },
    gunbatimi: { name: "Gün Batımı", bg: "#fff4e6", title: "#c2410c", text: "#7c2d12", accent: "#fb923c", font: "Trebuchet MS" },
    mor:       { name: "Mor",       bg: "#2d1b4e", title: "#f5e9ff", text: "#d8c4f0", accent: "#c084fc", font: "Verdana" },
  },

  LAYOUTS: {
    title: "Başlık Slaytı",
    titleContent: "Başlık ve İçerik",
    twoContent: "İki İçerik",
    section: "Bölüm Başlığı",
    titleOnly: "Yalnızca Başlık",
    blank: "Boş",
  },

  SHAPES: {
    rect: "Dikdörtgen", roundRect: "Yuvarlatılmış Dikdörtgen", ellipse: "Elips", triangle: "Üçgen",
    diamond: "Elmas", rightArrow: "Sağ Ok", star5: "Yıldız",
  },

  createData() {
    const d = {
      theme: "office",
      aspect: "16:9",
      footer: { on: false, date: false, number: false, text: "" },
      slides: [],
    };
    d.slides.push(this.newSlide("title"));
    return d;
  },

  // Etkin belgenin slayt boyutunu çöz ve this.W/H'yi ayarla
  applyAspect() {
    const a = this.ASPECTS[this.data && this.data.aspect] || this.ASPECTS["16:9"];
    this.W = a.w;
    this.H = a.h;
    return a;
  },

  newSlide(layout) {
    const T = (role, ph, x, y, w, h, fontSize, extra = {}) => Object.assign({
      id: XL.uid(), type: "text", role, ph, x, y, w, h, html: "", fontSize,
    }, extra);
    const els = [];
    switch (layout) {
      case "title":
        els.push(T("title", "Başlık eklemek için tıklayın", 80, 150, 800, 130, 44, { align: "center", valign: "bottom" }));
        els.push(T("body", "Alt başlık eklemek için tıklayın", 80, 295, 800, 80, 24, { align: "center" }));
        break;
      case "titleContent":
        els.push(T("title", "Başlık eklemek için tıklayın", 50, 25, 860, 95, 36));
        els.push(T("body", "Metin eklemek için tıklayın", 50, 130, 860, 380, 22, { html: "", bullets: true }));
        break;
      case "twoContent":
        els.push(T("title", "Başlık eklemek için tıklayın", 50, 25, 860, 95, 36));
        els.push(T("body", "Metin eklemek için tıklayın", 50, 130, 420, 380, 20, { bullets: true }));
        els.push(T("body", "Metin eklemek için tıklayın", 490, 130, 420, 380, 20, { bullets: true }));
        break;
      case "section":
        els.push(T("title", "Bölüm başlığı eklemek için tıklayın", 70, 200, 820, 110, 40));
        els.push(T("body", "Metin eklemek için tıklayın", 70, 315, 820, 60, 20));
        break;
      case "titleOnly":
        els.push(T("title", "Başlık eklemek için tıklayın", 50, 25, 860, 95, 36));
        break;
    }
    return { id: XL.uid(), layout, bg: null, transition: "none", notes: "", elements: els };
  },

  /* ---------- Şerit ---------- */
  ribbon() {
    const layouts = Object.entries(this.LAYOUTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    const fonts = XL.modes.docx.FONTS.map((f) => `<option value="${f}">${f}</option>`).join("");
    const sizes = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72, 96].map((s) => `<option value="${s}">${s}</option>`).join("");
    const shapes = Object.entries(this.SHAPES).map(([k, v]) =>
      `<button data-cmd="shape" data-value="${k}" title="${v}" class="shape-btn">${this.shapeSVG(k, "#c55a11", "#843c0c", 22, 16, "shape-ico")}</button>`).join("");
    const themes = Object.entries(this.THEMES).map(([k, t]) =>
      `<button data-cmd="theme" data-value="${k}" class="theme-btn" title="${t.name}" style="background:${t.bg};color:${t.title};font-family:'${t.font}'">
         <b>Aa</b><span style="background:${t.accent}"></span><small>${t.name}</small></button>`).join("");

    const tt = XL.t;
    return [
      { name: tt("Giriş", "Home"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="undo" title="${tt("Geri al (Ctrl+Z)", "Undo (Ctrl+Z)")}">↶</button>
          <button data-cmd="redo" title="${tt("İleri al (Ctrl+Y)", "Redo (Ctrl+Y)")}">↷</button>
        </div><label>${tt("Geri Al", "Undo")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="new-slide" class="big">🗍<span>${tt("Yeni Slayt", "New Slide")}</span></button>
          <div class="rcol">
            <select data-cmd="new-slide-layout" title="${tt("Düzenle yeni slayt", "New slide layout")}"><option value="">${tt("Düzen seç…", "Choose layout…")}</option>${layouts}</select>
            <select data-cmd="set-layout" title="${tt("Geçerli slaydın düzenini değiştir", "Change current slide layout")}"><option value="">${tt("Düzeni değiştir…", "Change layout…")}</option>${layouts}</select>
          </div>
          <div class="rcol">
            <button data-cmd="dup-slide" title="${tt("Slaydı çoğalt", "Duplicate slide")}">⧉ ${tt("Çoğalt", "Duplicate")}</button>
            <button data-cmd="del-slide" title="${tt("Slaydı sil", "Delete slide")}">🗑 ${tt("Sil", "Delete")}</button>
          </div>
        </div><label>${tt("Slaytlar", "Slides")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="fontName" style="width:120px" title="${tt("Yazı tipi", "Font")}"><option value="">${tt("Yazı tipi", "Font")}</option>${fonts}</select>
          <select data-cmd="fontSize" id="pp-size" title="${tt("Boyut", "Size")}"><option value="">${tt("Boyut", "Size")}</option>${sizes}</select>
          <button data-cmd="grow" title="${tt("Büyüt", "Grow")}">A⁺</button>
          <button data-cmd="shrink" title="${tt("Küçült", "Shrink")}">A⁻</button>
        </div><div class="rrow">
          <button data-cmd="bold" data-state="bold" title="${tt("Kalın", "Bold")}"><b>K</b></button>
          <button data-cmd="italic" data-state="italic" title="${tt("İtalik", "Italic")}"><i>T</i></button>
          <button data-cmd="underline" data-state="underline" title="${tt("Altı çizili", "Underline")}"><u>A</u></button>
          <button data-cmd="strikeThrough" data-state="strikeThrough" title="${tt("Üstü çizili", "Strikethrough")}"><s>ab</s></button>
          <label class="swatch" title="${tt("Yazı rengi", "Font color")}">A<input type="color" data-cmd="foreColor" value="#c00000"></label>
        </div><label>${tt("Yazı Tipi", "Font")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="insertUnorderedList" title="${tt("Madde işaretleri", "Bullets")}">• ≡</button>
          <button data-cmd="insertOrderedList" title="${tt("Numaralandırma", "Numbering")}">1. ≡</button>
        </div><div class="rrow">
          <button data-cmd="align" data-value="left" title="${tt("Sola", "Left")}">⯇≡</button>
          <button data-cmd="align" data-value="center" title="${tt("Ortala", "Center")}">≡</button>
          <button data-cmd="align" data-value="right" title="${tt("Sağa", "Right")}">≡⯈</button>
          <select data-cmd="valign" title="${tt("Dikey hizalama", "Vertical align")}">
            <option value="">${tt("Dikey", "Vertical")}</option><option value="top">${tt("Üst", "Top")}</option><option value="middle">${tt("Orta", "Middle")}</option><option value="bottom">${tt("Alt", "Bottom")}</option>
          </select>
        </div><label>${tt("Paragraf", "Paragraph")}</label></div>
        <div class="rgroup"><div class="rrow">
          <label class="swatch" title="${tt("Şekil dolgusu", "Shape fill")}">🪣<input type="color" data-cmd="fill" value="#c55a11"></label>
          <label class="swatch" title="${tt("Şekil ana hattı", "Shape outline")}">▭<input type="color" data-cmd="stroke" value="#843c0c"></label>
          <button data-cmd="no-fill" title="${tt("Dolgu yok", "No fill")}">⊘</button>
        </div><div class="rrow">
          <button data-cmd="front" title="${tt("Öne getir", "Bring forward")}">⬆ ${tt("Öne", "Front")}</button>
          <button data-cmd="back" title="${tt("Arkaya gönder", "Send backward")}">⬇ ${tt("Arkaya", "Back")}</button>
        </div><label>${tt("Çizim", "Drawing")}</label></div>` },

      { name: tt("Ekle", "Insert"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="new-slide" class="big">🗍<span>${tt("Yeni Slayt", "New Slide")}</span></button>
        </div><label>${tt("Slaytlar", "Slides")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="textbox" class="big">🅰<span>${tt("Metin Kutusu", "Text Box")}</span></button>
          <button data-cmd="image" class="big">🖼<span>${tt("Resim", "Picture")}</span></button>
          <button data-cmd="table" class="big">▦<span>${tt("Tablo", "Table")}</span></button>
        </div><label>${tt("Ekle", "Insert")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="hf-dialog" class="big">🔢<span>${tt("Üst/Alt Bilgi", "Header/Footer")}</span></button>
        </div><label>${tt("Metin", "Text")}</label></div>
        <div class="rgroup"><div class="rrow shapes-row">${shapes}</div><label>${tt("Şekiller", "Shapes")}</label></div>` },

      { name: tt("Tasarım", "Design"), html: `
        <div class="rgroup"><div class="rrow">
          <select data-cmd="aspect" id="pp-aspect" title="${tt("Slayt boyutu (en-boy oranı)", "Slide size (aspect ratio)")}">
            ${Object.entries(this.ASPECTS).map(([k, a]) => `<option value="${k}">${a.name}</option>`).join("")}
          </select>
        </div><label>${tt("Slayt Boyutu", "Slide Size")}</label></div>
        <div class="rgroup"><div class="rrow themes-row">${themes}</div><label>${tt("Temalar", "Themes")}</label></div>
        <div class="rgroup"><div class="rrow">
          <label class="swatch" title="${tt("Bu slaydın arka planı", "This slide's background")}">${tt("Arka plan", "Background")}<input type="color" data-cmd="bg" value="#ffffff"></label>
          <button data-cmd="bg-reset" title="${tt("Temanın arka planına dön", "Revert to theme background")}">↺</button>
          <button data-cmd="bg-all" title="${tt("Bu arka planı tüm slaytlara uygula", "Apply this background to all slides")}">${tt("Tümüne uygula", "Apply to all")}</button>
        </div><label>${tt("Arka Plan", "Background")}</label></div>` },

      { name: tt("Geçişler", "Transitions"), html: `
        <div class="rgroup"><div class="rrow">
          <select data-cmd="transition" id="pp-trans">
            <option value="none">${tt("Yok", "None")}</option><option value="fade">${tt("Solma", "Fade")}</option>
            <option value="push">${tt("İtme", "Push")}</option><option value="zoom">${tt("Yakınlaştırma", "Zoom")}</option><option value="flip">${tt("Çevirme", "Flip")}</option>
          </select>
          <button data-cmd="transition-all">${tt("Tümüne uygula", "Apply to all")}</button>
          <button data-cmd="preview-transition">▶ ${tt("Önizle", "Preview")}</button>
        </div><label>${tt("Bu Slayda Geçiş", "Transition to This Slide")}</label></div>` },

      { name: tt("Slayt Gösterisi", "Slide Show"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="show-start" class="big">▶<span>${tt("Baştan (F5)", "From Start (F5)")}</span></button>
          <button data-cmd="show-current" class="big">▷<span>${tt("Geçerli Slayttan (Shift+F5)", "From Current Slide (Shift+F5)")}</span></button>
        </div><label>${tt("Gösteriyi Başlat", "Start Show")}</label></div>` },
    ];
  },

  /* ---------- Bağlama / ayırma ---------- */
  mount(doc) {
    this.doc = doc;
    this.data = doc.data;
    if (!this.data.slides || !this.data.slides.length) this.data.slides = [this.newSlide("title")];
    if (!this.THEMES[this.data.theme]) this.data.theme = "office";
    if (!this.ASPECTS[this.data.aspect]) this.data.aspect = "16:9";
    if (!this.data.footer) this.data.footer = { on: false, date: false, number: false, text: "" };
    this.applyAspect();
    this.cur = Math.min(this.data.cur || 0, this.data.slides.length - 1);
    this.selId = null;
    this.editingId = null;
    this.history = [this.snap()];
    this.future = [];

    document.getElementById("subbar").innerHTML = "";
    document.getElementById("workarea").innerHTML = `
      <div id="pp-wrap">
        <aside id="pp-thumbs"></aside>
        <section id="pp-main">
          <div id="pp-stage-wrap"><div id="pp-stage"></div></div>
          <textarea id="pp-notes" placeholder="${XL.t("Konuşmacı notlarını eklemek için tıklayın", "Click to add speaker notes")}"></textarea>
        </section>
      </div>`;
    document.getElementById("pp-notes").addEventListener("input", (e) => {
      this.slide().notes = e.target.value;
      clearTimeout(this.notesTimer);
      this.notesTimer = setTimeout(() => this.commit(), 700);
      XL.ws.changed();
    });
    this.bindGlobals();
    this.renderAll();
  },

  unmount(doc) {
    this.stopEditing();
    this.data.cur = this.cur;
    doc.data = this.data;
  },

  serialize() {
    this.data.cur = this.cur;
    return this.data;
  },

  async importFile(file) {
    const buf = await XL.readAsArrayBuffer(file);
    return XL.pptxIO.importArrayBuffer(buf);
  },

  async save(doc) {
    this.stopEditing();
    const blob = await XL.pptxIO.exportBlob(this.data, this);
    XL.download(blob, doc.name + ".pptx");
  },

  slide() { return this.data.slides[this.cur]; },
  theme() { return this.THEMES[this.data.theme] || this.THEMES.office; },
  el(id) { return this.slide().elements.find((e) => e.id === id); },

  /* ---------- Geçmiş (geri al / ileri al) ---------- */
  // Anlık görüntü tema + slaytları kapsar (notlar slaytların içinde)
  snap() {
    return JSON.stringify({ theme: this.data.theme, slides: this.data.slides });
  },
  applySnap(s) {
    const d = JSON.parse(s);
    this.data.theme = d.theme;
    this.data.slides = d.slides;
    this.cur = Math.min(this.cur, this.data.slides.length - 1);
    this.selId = null;
    this.renderAll();
    XL.ws.changed();
  },
  commit() {
    clearTimeout(this.notesTimer);
    const snap = this.snap();
    if (snap === this.history[this.history.length - 1]) return;
    this.history.push(snap);
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    XL.ws.changed();
  },
  undo() {
    if (this.editingId) return document.execCommand("undo");
    this.commit(); // henüz geçmişe yazılmamış değişiklikler (ör. notlar) kaybolmasın
    if (this.history.length < 2) return;
    this.future.push(this.history.pop());
    this.applySnap(this.history[this.history.length - 1]);
  },
  redo() {
    if (this.editingId) return document.execCommand("redo");
    if (!this.future.length) return;
    const snap = this.future.pop();
    this.history.push(snap);
    this.applySnap(snap);
  },

  /* ---------- Çizim ---------- */
  renderAll() {
    this.renderThumbs();
    this.renderStage();
    const notes = document.getElementById("pp-notes");
    if (notes) notes.value = this.slide().notes || "";
    const tr = document.getElementById("pp-trans");
    if (tr) tr.value = this.slide().transition || "none";
    const asp = document.getElementById("pp-aspect");
    if (asp) asp.value = this.data.aspect || "16:9";
    XL.status(XL.t(`Slayt ${this.cur + 1} / ${this.data.slides.length}   ·   Tema: ${this.theme().name}`,
      `Slide ${this.cur + 1} / ${this.data.slides.length}   ·   Theme: ${this.theme().name}`));
  },

  // Slayt boyutunu değiştir (tüm sunum). this.W/H güncellenir, sahne + küçük resimler yeniden çizilir.
  setAspect(value) {
    if (!this.ASPECTS[value] || value === this.data.aspect) return;
    this.data.aspect = value;
    this.applyAspect();
    XL.ws.changed(); // boyut snap() dışında; kalıcılığı doğrudan tetikle
    this.renderAll();
    XL.status(XL.t("Slayt boyutu: ", "Slide size: ") + this.ASPECTS[value].name);
  },

  // Üst/alt bilgi iletişim kutusu (sunum geneli: tarih / slayt no / alt bilgi metni)
  footerDialog() {
    const f = this.data.footer;
    const chk = (id, on) => `<input type="checkbox" id="${id}"${on ? " checked" : ""}>`;
    XL.showPanel(XL.t("Üst Bilgi ve Alt Bilgi", "Header and Footer"), `
      <div style="display:grid;gap:10px;max-width:340px">
        <label>${chk("pf-on", f.on)} ${XL.t("Alt bilgiyi göster (tüm slaytlarda)", "Show footer (on all slides)")}</label>
        <label>${chk("pf-date", f.date)} ${XL.t("Tarih (otomatik) — sol", "Date (automatic) — left")}</label>
        <label>${chk("pf-num", f.number)} ${XL.t("Slayt numarası — sağ", "Slide number — right")}</label>
        <label>${XL.t("Alt bilgi metni — orta", "Footer text — center")}<br>
          <input type="text" id="pf-text" value="${XL.esc(f.text || "")}" style="width:100%;margin-top:4px" placeholder="${XL.t("Örn. Şirket adı", "e.g. Company name")}"></label>
      </div>
      <p style="margin-top:12px"><button id="pf-ok">${XL.t("Tümüne Uygula", "Apply to All")}</button>
      <button id="pf-cancel" class="btn-secondary">${XL.t("Vazgeç", "Cancel")}</button></p>`);
    document.getElementById("pf-ok").onclick = () => {
      this.data.footer = {
        on: document.getElementById("pf-on").checked,
        date: document.getElementById("pf-date").checked,
        number: document.getElementById("pf-num").checked,
        text: document.getElementById("pf-text").value,
      };
      XL.ws.changed(); // alt bilgi snap() dışında; kalıcılığı doğrudan tetikle
      this.renderAll(); XL.hidePanel();
    };
    document.getElementById("pf-cancel").onclick = () => XL.hidePanel();
  },

  // Bir slaydı verilen kapsayıcıya çiz (editör, küçük resim veya gösteri için)
  buildSlide(slide, interactive) {
    const t = this.theme();
    const root = document.createElement("div");
    root.className = "pp-slide" + (interactive ? " editing-stage" : "");
    root.style.width = this.W + "px";
    root.style.height = this.H + "px";
    root.style.background = slide.bg || t.bg;
    root.style.fontFamily = `'${t.font}', Calibri, sans-serif`;
    slide.elements.forEach((e) => root.appendChild(this.buildElement(e, interactive)));
    const foot = this.buildFooter(slide);
    if (foot) root.appendChild(foot);
    return root;
  },

  // Sunum geneli alt bilgi şeridi (tarih / metin / slayt no). Düzenlenemez yer paylaşımı.
  buildFooter(slide) {
    const f = this.data && this.data.footer;
    if (!f || !f.on) return null;
    const t = this.theme();
    const idx = this.data.slides.indexOf(slide);
    const band = document.createElement("div");
    band.className = "pp-footer";
    band.style.color = t.text;
    const cell = (cls, text) => {
      const d = document.createElement("div");
      d.className = "pp-foot-" + cls;
      d.textContent = text;
      return d;
    };
    band.appendChild(cell("l", f.date ? this.footerDate() : ""));
    band.appendChild(cell("c", f.text || ""));
    band.appendChild(cell("r", f.number ? String(idx + 1) : ""));
    return band;
  },

  footerDate() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  },

  buildElement(e, interactive) {
    const t = this.theme();
    const box = document.createElement("div");
    // Not: "pp-text" iç metin alanının sınıfı; kap için ayrı önek kullan (çakışırsa konumlandırma bozulur)
    box.className = "pp-el pp-t-" + e.type;
    box.dataset.id = e.id;
    Object.assign(box.style, { left: e.x + "px", top: e.y + "px", width: e.w + "px", height: e.h + "px" });

    if (e.type === "image") {
      const img = document.createElement("img");
      img.src = e.src;
      img.draggable = false;
      box.appendChild(img);
    } else {
      if (e.type === "shape") {
        box.innerHTML = this.shapeSVG(e.shape, e.fill === "none" ? "none" : (e.fill || t.accent), e.stroke || "none", "100%", "100%");
      } else {
        if (e.fill && e.fill !== "none") box.style.background = e.fill;
        if (e.stroke && e.stroke !== "none") box.style.outline = `2px solid ${e.stroke}`;
      }
      const txt = document.createElement("div");
      txt.className = "pp-text" + (e.bullets ? " bullets" : "");
      txt.innerHTML = e.html || "";
      const valign = e.valign || (e.type === "shape" ? "middle" : "top");
      box.style.justifyContent = { top: "flex-start", middle: "center", bottom: "flex-end" }[valign];
      Object.assign(txt.style, {
        fontSize: (e.fontSize || 18) + "pt",
        color: e.color || (e.role === "title" ? t.title : e.type === "shape" ? "#ffffff" : t.text),
        textAlign: e.align || (e.type === "shape" ? "center" : "left"),
        fontFamily: e.font ? `'${e.font}'` : "",
      });
      if (interactive && e.ph && this.isEmpty(e.html)) {
        box.classList.add("empty");
        txt.dataset.ph = e.ph;
      }
      box.appendChild(txt);
    }
    if (interactive && e.id === this.selId) {
      box.classList.add("selected");
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((d) => {
        const h = document.createElement("div");
        h.className = "pp-h pp-h-" + d;
        h.dataset.dir = d;
        box.appendChild(h);
      });
    }
    return box;
  },

  isEmpty(html) {
    return !html || !html.replace(/<br\s*\/?>|<\/?(p|div|ul|ol|li|span)[^>]*>|&nbsp;|\s/gi, "");
  },

  // cls: slayttaki şekiller "pp-svg" (mutlak, kutuyu doldurur); şerit ikonları "shape-ico" (satır içi)
  shapeSVG(shape, fill, stroke, w, h, cls = "pp-svg") {
    const sw = stroke === "none" ? 0 : 2;
    const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"`;
    const paths = {
      rect: `<rect x="1" y="1" width="98" height="98" ${common}/>`,
      roundRect: `<rect x="1" y="1" width="98" height="98" rx="12" ry="12" ${common}/>`,
      ellipse: `<ellipse cx="50" cy="50" rx="49" ry="49" ${common}/>`,
      triangle: `<polygon points="50,1 99,99 1,99" ${common}/>`,
      diamond: `<polygon points="50,1 99,50 50,99 1,50" ${common}/>`,
      rightArrow: `<polygon points="1,28 62,28 62,1 99,50 62,99 62,72 1,72" ${common}/>`,
      star5: `<polygon points="50,2 61,38 98,38 68,60 79,96 50,74 21,96 32,60 2,38 39,38" ${common}/>`,
    };
    return `<svg class="${cls}" viewBox="0 0 100 100" preserveAspectRatio="none" width="${w}" height="${h}">${paths[shape] || paths.rect}</svg>`;
  },

  renderStage() {
    const stage = document.getElementById("pp-stage");
    if (!stage) return;
    stage.innerHTML = "";
    const s = this.buildSlide(this.slide(), true);
    stage.appendChild(s);
    this.stageSlide = s;
    this.fitStage();
    if (this.editingId) {
      const id = this.editingId;
      this.editingId = null;
      this.startEditing(id);
    }
  },

  fitStage() {
    const wrap = document.getElementById("pp-stage-wrap");
    const stage = document.getElementById("pp-stage");
    if (!wrap || !stage) return;
    const scale = Math.max(0.1, Math.min((wrap.clientWidth - 40) / this.W, (wrap.clientHeight - 30) / this.H));
    this.scale = scale;
    stage.style.width = this.W * scale + "px";
    stage.style.height = this.H * scale + "px";
    if (this.stageSlide) this.stageSlide.style.transform = `scale(${scale})`;
  },

  renderThumbs() {
    const box = document.getElementById("pp-thumbs");
    if (!box) return;
    box.innerHTML = "";
    this.data.slides.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "pp-thumb" + (i === this.cur ? " active" : "");
      item.draggable = true;
      item.dataset.i = i;
      const num = document.createElement("span");
      num.className = "pp-num";
      num.textContent = i + 1;
      const frame = document.createElement("div");
      frame.className = "pp-thumb-frame";
      frame.style.height = Math.round(this.H * 0.18) + "px"; // slayt oranına uy
      const sl = this.buildSlide(s, false);
      sl.style.transform = "scale(0.18)";
      frame.appendChild(sl);
      item.append(num, frame);
      item.onclick = () => this.goTo(i);
      item.ondragstart = (e) => { e.dataTransfer.setData("text/plain", i); item.classList.add("dragging"); };
      item.ondragend = () => item.classList.remove("dragging");
      item.ondragover = (e) => { e.preventDefault(); item.classList.add("drop"); };
      item.ondragleave = () => item.classList.remove("drop");
      item.ondrop = (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain"), to = i;
        if (from === to || isNaN(from)) return;
        const [m] = this.data.slides.splice(from, 1);
        this.data.slides.splice(to, 0, m);
        this.cur = to;
        this.commit();
        this.renderAll();
      };
      box.appendChild(item);
    });
  },

  // Yalnızca geçerli slaydın küçük resmini yenile (yazarken hızlı kalsın)
  refreshThumb() {
    const item = document.querySelector(`#pp-thumbs .pp-thumb[data-i="${this.cur}"] .pp-thumb-frame`);
    if (!item) return;
    item.innerHTML = "";
    const sl = this.buildSlide(this.slide(), false);
    sl.style.transform = "scale(0.18)";
    item.appendChild(sl);
  },

  goTo(i) {
    this.stopEditing();
    this.cur = Math.max(0, Math.min(this.data.slides.length - 1, i));
    this.selId = null;
    this.renderAll();
    const t = document.querySelector(`#pp-thumbs .pp-thumb[data-i="${this.cur}"]`);
    if (t) t.scrollIntoView({ block: "nearest" });
  },

  /* ---------- Etkileşim ---------- */
  bindGlobals() {
    if (this.globalsBound) return;
    this.globalsBound = true;
    const active = () => document.body.dataset.mode === "pptx" && document.getElementById("pp-stage");

    document.addEventListener("mousedown", (e) => {
      if (!active() || this.show) return;
      const stage = document.getElementById("pp-stage");
      if (!stage.contains(e.target)) return;
      const handle = e.target.closest(".pp-h");
      const box = e.target.closest(".pp-el");

      if (box && this.editingId === box.dataset.id && !handle) return; // metin içinde imleç konumlandırma
      if (!box) { this.stopEditing(); this.select(null); return; }

      const id = box.dataset.id;
      if (this.editingId && this.editingId !== id) this.stopEditing();
      if (this.selId !== id) this.select(id);
      if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;  // salt görüntüleme: seç ama taşıma/boyut yok
      const el = this.el(id);
      this.drag = {
        id, dir: handle ? handle.dataset.dir : null,
        sx: e.clientX, sy: e.clientY,
        o: { x: el.x, y: el.y, w: el.w, h: el.h }, moved: false,
      };
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.drag) return;
      const d = this.drag, el = this.el(d.id);
      if (!el) return;
      const dx = (e.clientX - d.sx) / this.scale, dy = (e.clientY - d.sy) / this.scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (!d.moved) return;
      if (!d.dir) {
        el.x = Math.round(d.o.x + dx);
        el.y = Math.round(d.o.y + dy);
        // Slayt ortasına yapışma kılavuzu
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
        if (Math.abs(cx - this.W / 2) < 6) el.x = Math.round(this.W / 2 - el.w / 2);
        if (Math.abs(cy - this.H / 2) < 6) el.y = Math.round(this.H / 2 - el.h / 2);
      } else {
        let { x, y, w, h } = d.o;
        if (d.dir.includes("e")) w = Math.max(20, d.o.w + dx);
        if (d.dir.includes("s")) h = Math.max(20, d.o.h + dy);
        if (d.dir.includes("w")) { w = Math.max(20, d.o.w - dx); x = d.o.x + d.o.w - w; }
        if (d.dir.includes("n")) { h = Math.max(20, d.o.h - dy); y = d.o.y + d.o.h - h; }
        // Köşeden tutup Shift: oranı koru
        if (e.shiftKey && d.dir.length === 2) { h = w * (d.o.h / d.o.w); if (d.dir.includes("n")) y = d.o.y + d.o.h - h; }
        Object.assign(el, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      }
      const box = this.stageSlide.querySelector(`.pp-el[data-id="${d.id}"]`);
      if (box) Object.assign(box.style, { left: el.x + "px", top: el.y + "px", width: el.w + "px", height: el.h + "px" });
    });

    document.addEventListener("mouseup", () => {
      if (!this.drag) return;
      const moved = this.drag.moved;
      this.drag = null;
      if (moved) { this.commit(); this.refreshThumb(); }
    });

    document.addEventListener("dblclick", (e) => {
      if (!active() || this.show) return;
      const box = e.target.closest("#pp-stage .pp-el");
      if (box && box.querySelector(".pp-text")) this.startEditing(box.dataset.id, e);
    });

    document.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("resize", () => { if (active()) this.fitStage(); if (this.show) this.fitShow(); });

    // Düzenlenen metin kutusundaki seçimi sakla (şeritteki açılır liste odağı alınca kaybolmasın)
    document.addEventListener("selectionchange", () => {
      if (!active() || !this.editingId) return;
      const sel = window.getSelection();
      const txt = this.editTxt();
      if (txt && sel.rangeCount && txt.contains(sel.anchorNode)) this.editRange = sel.getRangeAt(0).cloneRange();
    });
  },

  editTxt() {
    return this.editingId && this.stageSlide
      ? this.stageSlide.querySelector(`.pp-el[data-id="${this.editingId}"] .pp-text`) : null;
  },

  // Şeride tıklanmadan hemen önce (workspace çağırır): seçim hâlâ metin kutusundayken sakla
  beforeRibbon() {
    const txt = this.editTxt();
    const sel = window.getSelection();
    if (txt && sel.rangeCount && txt.contains(sel.anchorNode)) this.editRange = sel.getRangeAt(0).cloneRange();
  },

  restoreEditRange() {
    const txt = this.editTxt();
    if (!txt) return;
    const sel = window.getSelection();
    // Odak ve seçim zaten metin kutusundaysa en güncel seçim odur; dokunma
    if (document.activeElement === txt && sel.rangeCount && txt.contains(sel.anchorNode)) return;
    txt.focus({ preventScroll: true });
    if (this.editRange && txt.contains(this.editRange.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(this.editRange.cloneRange());
    }
  },

  select(id) {
    this.selId = id;
    this.renderStage();
    XL.ws.syncRibbonState();
    const el = id && this.el(id);
    const sz = document.getElementById("pp-size");
    if (sz) sz.value = el && el.fontSize ? String(el.fontSize) : "";
  },

  startEditing(id, evt) {
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;  // salt görüntüleme
    const box = this.stageSlide.querySelector(`.pp-el[data-id="${id}"]`);
    if (!box) return;
    const txt = box.querySelector(".pp-text");
    if (!txt) return;
    this.editingId = id;
    this.editRange = null;
    this.selId = id;
    box.classList.add("editing");
    box.classList.remove("empty");
    txt.contentEditable = "true";
    txt.focus();
    try { document.execCommand("styleWithCSS", false, true); } catch (e) {}
    const el = this.el(id);
    if (el.bullets && this.isEmpty(el.html)) {
      txt.innerHTML = "<ul><li><br></li></ul>";
    }
    // İmleci tıklanan yere veya sona koy
    const sel = window.getSelection();
    let range = null;
    if (evt && document.caretRangeFromPoint) range = document.caretRangeFromPoint(evt.clientX, evt.clientY);
    if (!range || !txt.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(txt);
      range.collapse(false);
      if (txt.querySelector("li")) { range.selectNodeContents(txt.querySelector("li:last-child")); range.collapse(false); }
    }
    sel.removeAllRanges();
    sel.addRange(range);

    txt.oninput = () => {
      el.html = txt.innerHTML;
      clearTimeout(this.thumbTimer);
      this.thumbTimer = setTimeout(() => this.refreshThumb(), 300);
      XL.ws.changed();
    };
  },

  stopEditing() {
    if (!this.editingId) return;
    const id = this.editingId;
    this.editingId = null;
    const el = this.el(id);
    const box = this.stageSlide && this.stageSlide.querySelector(`.pp-el[data-id="${id}"]`);
    if (el && box) {
      const txt = box.querySelector(".pp-text");
      el.html = this.isEmpty(txt.innerHTML) ? "" : txt.innerHTML;
      txt.contentEditable = "false";
    }
    this.commit();
    this.renderStage();
    this.refreshThumb();
  },

  onKey(e) {
    if (document.body.dataset.mode !== "pptx") return;
    if (this.show) return this.onShowKey(e);
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || (ae.isContentEditable && !this.editingId));
    if (typing) return;
    const ctrl = e.ctrlKey || e.metaKey;

    // Salt görüntüleme: yalnız gezinme + slayt gösterisi; düzenleme/silme/taşıma yok.
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) {
      if (e.key === "F5") { e.preventDefault(); this.startShow(e.shiftKey ? this.cur : 0); }
      else if (e.key === "PageDown" || (e.key === "ArrowDown" && !this.selId)) { e.preventDefault(); this.goTo(this.cur + 1); }
      else if (e.key === "PageUp" || (e.key === "ArrowUp" && !this.selId)) { e.preventDefault(); this.goTo(this.cur - 1); }
      else if (e.key === "Escape") { this.select(null); }
      return;
    }

    if (e.key === "F5") { e.preventDefault(); return this.startShow(e.shiftKey ? this.cur : 0); }
    if (this.editingId) {
      if (e.key === "Escape") { e.preventDefault(); this.stopEditing(); }
      return; // metin düzenlerken tarayıcının varsayılanları
    }
    if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); return this.undo(); }
    if (ctrl && e.key.toLowerCase() === "y") { e.preventDefault(); return this.redo(); }
    if (ctrl && e.key.toLowerCase() === "m") { e.preventDefault(); return this.command("new-slide"); }
    if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); return this.duplicateElement(); }
    if (ctrl && e.key.toLowerCase() === "c" && this.selId) { this.clip = JSON.stringify(this.el(this.selId)); return; }
    if (ctrl && e.key.toLowerCase() === "v" && this.clip) {
      e.preventDefault();
      const c = JSON.parse(this.clip); c.id = XL.uid(); c.x += 20; c.y += 20;
      this.slide().elements.push(c); this.selId = c.id; this.commit(); this.renderStage(); this.refreshThumb();
      return;
    }
    if (!this.selId) {
      if (e.key === "PageDown" || e.key === "ArrowDown") { e.preventDefault(); this.goTo(this.cur + 1); }
      if (e.key === "PageUp" || e.key === "ArrowUp") { e.preventDefault(); this.goTo(this.cur - 1); }
      return;
    }
    const el = this.el(this.selId);
    if (!el) return;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "Delete": case "Backspace":
        e.preventDefault();
        this.slide().elements = this.slide().elements.filter((x) => x.id !== this.selId);
        this.selId = null; this.commit(); this.renderStage(); this.refreshThumb();
        return;
      case "Escape": this.select(null); return;
      case "Enter": case "F2": e.preventDefault(); if (el.type !== "image") this.startEditing(el.id); return;
      case "ArrowLeft": el.x -= step; break;
      case "ArrowRight": el.x += step; break;
      case "ArrowUp": el.y -= step; break;
      case "ArrowDown": el.y += step; break;
      default:
        // Seçili kutuda yazmaya başlamak düzenlemeyi açar
        if (e.key.length === 1 && !ctrl && !e.altKey && el.type !== "image") {
          this.startEditing(el.id);
        }
        return;
    }
    e.preventDefault();
    this.renderStage();
    clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => { this.commit(); this.refreshThumb(); }, 400);
  },

  duplicateElement() {
    if (!this.selId) return;
    const c = JSON.parse(JSON.stringify(this.el(this.selId)));
    c.id = XL.uid(); c.x += 20; c.y += 20;
    this.slide().elements.push(c);
    this.selId = c.id;
    this.commit(); this.renderStage(); this.refreshThumb();
  },

  /* ---------- Komutlar ---------- */
  isOn(state) {
    if (!this.editingId) return false;
    try { return document.queryCommandState(state); } catch (e) { return false; }
  },

  // Metin biçimi: düzenleniyorsa seçime, değilse seçili kutunun tamamına uygula
  textExec(cmd, value = null) {
    if (this.editingId) {
      this.restoreEditRange();
      document.execCommand(cmd, false, value);
      const el = this.el(this.editingId);
      const txt = this.stageSlide.querySelector(`.pp-el[data-id="${el.id}"] .pp-text`);
      el.html = txt.innerHTML;
      XL.ws.changed();
      this.refreshThumb();
      return;
    }
    if (!this.selId) return alert(XL.t("Önce bir metin kutusu veya şekil seçin.", "Select a text box or shape first."));
    const el = this.el(this.selId);
    if (el.type === "image") return;
    const txt = this.stageSlide.querySelector(`.pp-el[data-id="${el.id}"] .pp-text`);
    if (this.isEmpty(el.html)) return;
    txt.contentEditable = "true";
    txt.focus();
    const r = document.createRange();
    r.selectNodeContents(txt);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(cmd, false, value);
    el.html = txt.innerHTML;
    txt.contentEditable = "false";
    s.removeAllRanges();
    this.commit(); this.renderStage(); this.refreshThumb();
  },

  setProp(patch, needSel = true) {
    const id = this.editingId || this.selId;
    if (!id) { if (needSel) alert(XL.t("Önce bir öğe seçin.", "Select an element first.")); return; }
    const el = this.el(id);
    if (this.editingId) {
      const txt = this.stageSlide.querySelector(`.pp-el[data-id="${id}"] .pp-text`);
      el.html = txt.innerHTML;
    }
    Object.assign(el, patch);
    this.commit(); this.renderStage(); this.refreshThumb();
  },

  command(cmd, value) {
    const textCmds = ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "foreColor", "fontName"];
    if (textCmds.includes(cmd)) {
      if (cmd === "fontName" && !value) return;
      if (cmd === "fontName" && !this.editingId && this.selId) return this.setProp({ font: value });
      if (cmd === "foreColor" && !this.editingId && this.selId) return this.setProp({ color: value });
      return this.textExec(cmd, value);
    }
    const resetSelect = (c) => { const s = document.querySelector(`#ribbon select[data-cmd="${c}"]`); if (s) s.value = ""; };

    switch (cmd) {
      case "undo": return this.undo();
      case "redo": return this.redo();
      case "new-slide": return this.addSlide(this.slide().layout === "title" ? "titleContent" : this.slide().layout || "titleContent");
      case "new-slide-layout": resetSelect(cmd); return value && this.addSlide(value);
      case "set-layout": {
        resetSelect(cmd);
        if (!value) return;
        // Mevcut metni yeni düzenin yer tutucularına taşı
        const old = this.slide();
        const fresh = this.newSlide(value);
        const oldTexts = old.elements.filter((e) => e.ph);
        fresh.elements.forEach((e, i) => { if (oldTexts[i]) e.html = oldTexts[i].html; });
        const extras = old.elements.filter((e) => !e.ph);
        Object.assign(old, { layout: value, elements: [...fresh.elements, ...extras] });
        this.selId = null; this.commit(); return this.renderAll();
      }
      case "dup-slide": {
        this.stopEditing();
        const c = JSON.parse(JSON.stringify(this.slide()));
        c.id = XL.uid();
        c.elements.forEach((e) => (e.id = XL.uid()));
        this.data.slides.splice(this.cur + 1, 0, c);
        this.cur++; this.commit(); return this.renderAll();
      }
      case "del-slide":
        this.stopEditing();
        if (this.data.slides.length <= 1) return alert(XL.t("Sunuda en az bir slayt olmalı.", "The presentation must have at least one slide."));
        this.data.slides.splice(this.cur, 1);
        this.cur = Math.min(this.cur, this.data.slides.length - 1);
        this.selId = null; this.commit(); return this.renderAll();
      case "fontSize": {
        const pt = parseFloat(value);
        if (!pt) return;
        if (this.editingId) this.restoreEditRange();
        if (this.editingId && !window.getSelection().isCollapsed) {
          // Seçili metin: geçici işaretle sonra gerçek puntoya çevir
          document.execCommand("styleWithCSS", false, false);
          document.execCommand("fontSize", false, "7");
          document.execCommand("styleWithCSS", false, true);
          const spans = [];
          this.stageSlide.querySelectorAll('font[size="7"]').forEach((f) => {
            const sp = document.createElement("span"); sp.style.fontSize = pt + "pt";
            while (f.firstChild) sp.appendChild(f.firstChild);
            f.replaceWith(sp);
            spans.push(sp);
          });
          // Değişim seçimi bozar: yeni metni yeniden seç ki ardından renk vb. uygulanabilsin
          if (spans.length) {
            const r = document.createRange();
            r.setStartBefore(spans[0]); r.setEndAfter(spans[spans.length - 1]);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
            this.editRange = r.cloneRange();
          }
          const el = this.el(this.editingId);
          el.html = this.stageSlide.querySelector(`.pp-el[data-id="${el.id}"] .pp-text`).innerHTML;
          XL.ws.changed(); this.refreshThumb();
          return;
        }
        return this.setProp({ fontSize: pt });
      }
      case "grow": case "shrink": {
        const id = this.editingId || this.selId;
        if (!id) return;
        const el = this.el(id);
        const f = cmd === "grow" ? 1.15 : 1 / 1.15;
        return this.setProp({ fontSize: Math.max(6, Math.round((el.fontSize || 18) * f)) });
      }
      case "align": return this.setProp({ align: value });
      case "valign": resetSelect(cmd); return value && this.setProp({ valign: value });
      case "fill": return this.setProp({ fill: value });
      case "stroke": return this.setProp({ stroke: value });
      case "no-fill": return this.setProp({ fill: "none" });
      case "front": case "back": {
        if (!this.selId) return;
        const arr = this.slide().elements;
        const i = arr.findIndex((e) => e.id === this.selId);
        const [m] = arr.splice(i, 1);
        if (cmd === "front") arr.push(m); else arr.unshift(m);
        this.commit(); this.renderStage(); return this.refreshThumb();
      }
      case "textbox": return this.addElement({ type: "text", x: 300, y: 220, w: 360, h: 80, fontSize: 20, html: "" , ph: "Metin yazın" }, true);
      case "shape": return this.addElement({ type: "shape", shape: value, x: 380, y: 170, w: 200, h: value === "rightArrow" ? 120 : 200, fontSize: 18, html: "" });
      case "image":
        return XL.pickFile("image/png,image/jpeg,image/gif", (file) => this.insertImageFile(file));
      case "table": {
        const r = parseInt(prompt(XL.t("Satır sayısı:", "Number of rows:"), "3"), 10), c = parseInt(prompt(XL.t("Sütun sayısı:", "Number of columns:"), "3"), 10);
        if (!r || !c) return;
        let html = '<table class="pp-table">';
        for (let i = 0; i < r; i++) {
          html += "<tr>";
          for (let j = 0; j < c; j++) html += i === 0 ? `<th>${XL.t("Başlık", "Header")}</th>` : "<td>&nbsp;</td>";
          html += "</tr>";
        }
        html += "</table>";
        return this.addElement({ type: "text", x: 80, y: 140, w: 800, h: 40 * r, fontSize: 16, html });
      }
      case "theme": this.data.theme = value; this.commit(); return this.renderAll();
      case "aspect": return this.setAspect(value);
      case "hf-dialog": return this.footerDialog();
      case "bg": this.slide().bg = value; this.commit(); this.renderStage(); return this.refreshThumb();
      case "bg-reset": this.slide().bg = null; this.commit(); this.renderStage(); return this.refreshThumb();
      case "bg-all": {
        const bg = this.slide().bg;
        this.data.slides.forEach((s) => (s.bg = bg));
        this.commit(); return this.renderAll();
      }
      case "transition": this.slide().transition = value; return this.commit();
      case "transition-all": {
        const t = this.slide().transition || "none";
        this.data.slides.forEach((s) => (s.transition = t));
        this.commit(); return XL.status(XL.t("Geçiş tüm slaytlara uygulandı: ", "Transition applied to all slides: ") + t);
      }
      case "preview-transition": return this.startShow(this.cur, true);
      case "show-start": return this.startShow(0);
      case "show-current": return this.startShow(this.cur);
    }
  },

  async insertImageFile(file) {
    const src = await XL.readAsDataURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const k = Math.min(1, 700 / w, 420 / h);
      w = Math.round(w * k); h = Math.round(h * k);
      this.addElement({ type: "image", src, x: Math.round((this.W - w) / 2), y: Math.round((this.H - h) / 2), w, h });
    };
    img.src = src;
  },

  addSlide(layout) {
    this.stopEditing();
    const s = this.newSlide(layout);
    s.transition = this.slide().transition || "none";
    this.data.slides.splice(this.cur + 1, 0, s);
    this.cur++;
    this.selId = null;
    this.commit();
    this.renderAll();
    const t = document.querySelector(`#pp-thumbs .pp-thumb[data-i="${this.cur}"]`);
    if (t) t.scrollIntoView({ block: "nearest" });
  },

  addElement(props, edit) {
    this.stopEditing();
    const el = Object.assign({ id: XL.uid() }, props);
    this.slide().elements.push(el);
    this.selId = el.id;
    this.commit();
    this.renderStage();
    this.refreshThumb();
    if (edit) this.startEditing(el.id);
  },

  /* ---------- Slayt gösterisi ---------- */
  startShow(from, previewOnly) {
    this.stopEditing();
    const ov = document.createElement("div");
    ov.id = "pp-show";
    ov.innerHTML = `<div id="pp-show-stage"></div><div id="pp-show-hint">← → gezin · Esc çıkış</div>`;
    document.body.appendChild(ov);
    this.show = { i: from, ov, previewOnly };
    ov.addEventListener("click", (e) => { if (e.button === 0) this.showNext(); });
    ov.addEventListener("contextmenu", (e) => { e.preventDefault(); this.showPrev(); });
    if (!previewOnly && ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
    document.addEventListener("fullscreenchange", this.onFsChange = () => {
      if (!document.fullscreenElement && this.show && !this.show.previewOnly) this.endShow();
    });
    this.renderShow(true);
  },

  renderShow(animate) {
    const st = document.getElementById("pp-show-stage");
    if (!st) return;
    const { i } = this.show;
    st.innerHTML = "";
    if (i >= this.data.slides.length) {
      st.innerHTML = '<div class="pp-show-end">Slayt gösterisinin sonu. Çıkmak için tıklayın.</div>';
      return;
    }
    const slide = this.data.slides[i];
    const s = this.buildSlide(slide, false);
    st.appendChild(s);
    this.showSlide = s;
    this.fitShow();
    if (animate && slide.transition && slide.transition !== "none") {
      s.classList.add("tr-" + slide.transition);
    }
    if (this.show.previewOnly) setTimeout(() => this.show && this.show.previewOnly && this.endShow(), 1200);
  },

  fitShow() {
    if (!this.showSlide) return;
    const k = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
    const st = document.getElementById("pp-show-stage");
    st.style.width = this.W * k + "px";
    st.style.height = this.H * k + "px";
    this.showSlide.style.transform = `scale(${k})`;
  },

  showNext() {
    if (!this.show) return;
    if (this.show.i >= this.data.slides.length) return this.endShow();
    this.show.i++;
    this.renderShow(true);
  },
  showPrev() {
    if (!this.show || this.show.i === 0) return;
    this.show.i--;
    this.renderShow(false);
  },

  onShowKey(e) {
    const k = e.key;
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(k)) { e.preventDefault(); this.showNext(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(k)) { e.preventDefault(); this.showPrev(); }
    else if (k === "Home") { this.show.i = 0; this.renderShow(false); }
    else if (k === "End") { this.show.i = this.data.slides.length - 1; this.renderShow(false); }
    else if (k === "Escape") { e.preventDefault(); this.endShow(); }
  },

  endShow() {
    if (!this.show) return;
    const last = Math.min(this.show.i, this.data.slides.length - 1);
    this.show.ov.remove();
    document.removeEventListener("fullscreenchange", this.onFsChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.show = null;
    this.showSlide = null;
    this.goTo(last);
  },
};
