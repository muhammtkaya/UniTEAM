/* excel/mode.js — Excel modu: şerit, formül çubuğu, sayfa sekmeleri, komutlar */
XL.modes.xlsx = {
  type: "xlsx",
  label: "Excel",
  icon: "📊",
  ext: ".xlsx",
  docPrefix: "Kitap",
  accept: [".xlsx", ".xls", ".csv"],
  hiddenRows: new Set(),

  createData() {
    return { rows: 100, cols: 26, activeSheet: 0, page: this.defaultPage(), sheets: [{ name: "Sayfa1", cells: {}, formats: {} }] };
  },

  // Yazdırma düzeni varsayılanı: kenar boşluğu ön ayarı + üst/alt bilgi (sol/orta/sağ)
  defaultPage() {
    return { margins: "normal", header: { l: "", c: "", r: "" }, footer: { l: "", c: "", r: "" } };
  },

  // Kenar boşluğu ön ayarları (inç) — Excel ile aynı değerler
  MARGINS: {
    normal: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    narrow: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    wide:   { left: 1, right: 1, top: 1, bottom: 1, header: 0.5, footer: 0.5 },
    none:   { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 },
  },

  /* ---------- Şerit ---------- */
  ribbon() {
    const fnOpts = ["SUM", "AVERAGE", "COUNT", "COUNTA", "MAX", "MIN", "IF", "IFS", "AND", "OR",
      "VLOOKUP", "HLOOKUP", "XLOOKUP", "INDEX", "MATCH", "SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS",
      "AVERAGEIF", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "SQRT", "POWER", "MOD",
      "CONCATENATE", "TEXTJOIN", "LEFT", "RIGHT", "MID", "LEN", "TRIM", "UPPER", "LOWER", "PROPER",
      "SUBSTITUTE", "TEXT", "TODAY", "NOW", "DATE", "YEAR", "MONTH", "DAY", "NETWORKDAYS",
      "PMT", "FV", "PV", "NPV", "IRR", "IFERROR", "ISBLANK", "ISNUMBER", "FILTER", "SORT", "UNIQUE"]
      .map((f) => `<option value="${f}">${f}</option>`).join("");

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
        </div><label>${t("Pano", "Clipboard")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="bold" data-state="bold" title="${t("Kalın (Ctrl+B)", "Bold (Ctrl+B)")}"><b>K</b></button>
          <button data-cmd="italic" data-state="italic" title="${t("İtalik (Ctrl+I)", "Italic (Ctrl+I)")}"><i>T</i></button>
          <button data-cmd="underline" data-state="underline" title="${t("Altı çizili (Ctrl+U)", "Underline (Ctrl+U)")}"><u>A</u></button>
          <label class="swatch" title="${t("Yazı rengi", "Font color")}">A<input type="color" data-cmd="color" value="#c00000"></label>
          <label class="swatch" title="${t("Dolgu rengi", "Fill color")}">🖌<input type="color" data-cmd="bg" value="#ffff00"></label>
        </div><label>${t("Yazı Tipi", "Font")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="align-left" title="${t("Sola hizala", "Align left")}">⯇</button>
          <button data-cmd="align-center" title="${t("Ortala", "Center")}">≡</button>
          <button data-cmd="align-right" title="${t("Sağa hizala", "Align right")}">⯈</button>
          <button data-cmd="merge-center" data-state="merge" title="${t("Hücreleri birleştir ve ortala / çöz", "Merge & center / unmerge")}">⬌ ${t("Birleştir", "Merge")}</button>
        </div><label>${t("Hizalama", "Alignment")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="numfmt" id="numfmt" title="${t("Sayı biçimi", "Number format")}">
            <option value="general">${t("Genel", "General")}</option>
            <option value="number">${t("Sayı", "Number")}</option>
            <option value="currency">${t("Para (₺)", "Currency (₺)")}</option>
            <option value="percent">${t("Yüzde", "Percent")}</option>
            <option value="date">${t("Tarih", "Date")}</option>
          </select>
          <button data-cmd="clear-format" title="${t("Biçimi temizle", "Clear formatting")}">⌫</button>
        </div><label>${t("Sayı", "Number")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="insert-row" title="${t("Üste satır ekle", "Insert row above")}">+${t("Satır", "Row")}</button>
          <button data-cmd="delete-row" title="${t("Satırları sil", "Delete rows")}">−${t("Satır", "Row")}</button>
          <button data-cmd="insert-col" title="${t("Sola sütun ekle", "Insert column left")}">+${t("Sütun", "Col")}</button>
          <button data-cmd="delete-col" title="${t("Sütunları sil", "Delete columns")}">−${t("Sütun", "Col")}</button>
        </div><label>${t("Hücreler", "Cells")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="autosum" title="${t("Otomatik Toplam", "AutoSum")}">Σ ${t("Topla", "Sum")}</button>
          <button data-cmd="sort-asc" title="${t("Artan sırala", "Sort ascending")}">A→Z</button>
          <button data-cmd="sort-desc" title="${t("Azalan sırala", "Sort descending")}">Z→A</button>
          <button data-cmd="find" title="${t("Bul ve değiştir (Ctrl+H)", "Find & replace (Ctrl+H)")}">🔍</button>
        </div><label>${t("Düzenleme", "Editing")}</label></div>` },

      { name: t("Ekle", "Insert"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="chart" class="big">📈<span>${t("Grafik", "Chart")}</span></button>
          <button data-cmd="pivot" class="big">📋<span>${t("Özet Tablo", "PivotTable")}</span></button>
        </div><label>${t("Grafikler & Tablolar", "Charts & Tables")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="add-sheet" class="big">🗎<span>${t("Yeni Sayfa", "New Sheet")}</span></button>
        </div><label>${t("Sayfa", "Sheet")}</label></div>` },

      { name: t("Formüller", "Formulas"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="autosum" class="big">Σ<span>${t("Otomatik Toplam", "AutoSum")}</span></button>
          <button data-cmd="fn-library" class="big">ƒx<span>${t("Fonksiyon Kitaplığı", "Function Library")}</span></button>
        </div><label>${t("Fonksiyonlar", "Functions")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="insert-fn" title="${t("Hızlı fonksiyon ekle", "Quick insert function")}">
            <option value="">${t("Fonksiyon ekle…", "Add function…")}</option>${fnOpts}
          </select>
        </div><label>${t("Hızlı Ekle", "Quick Insert")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="show-formulas" data-state="showFormulas" title="${t("Hücrelerde formülleri göster", "Show formulas in cells")}">⟨=⟩ ${t("Formülleri Göster", "Show Formulas")}</button>
        </div><label>${t("Denetim", "Auditing")}</label></div>` },

      { name: t("Veri", "Data"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="sort-asc" class="big">A→Z<span>${t("Artan", "Ascending")}</span></button>
          <button data-cmd="sort-desc" class="big">Z→A<span>${t("Azalan", "Descending")}</span></button>
        </div><label>${t("Sırala", "Sort")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="filter" class="big">⏷<span>${t("Filtre", "Filter")}</span></button>
          <button data-cmd="clear-filter" class="big">✕<span>${t("Filtreyi Temizle", "Clear Filter")}</span></button>
        </div><label>${t("Filtre", "Filter")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="dedupe" class="big">⧉✕<span>${t("Yinelenenleri Kaldır", "Remove Duplicates")}</span></button>
          <button data-cmd="csv" class="big">⇩<span>${t("CSV İndir", "Download CSV")}</span></button>
        </div><label>${t("Veri Araçları", "Data Tools")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="cond-format" class="big">🎨<span>${t("Koşullu Biçim", "Conditional Fmt")}</span></button>
          <button data-cmd="data-validation" class="big">✔<span>${t("Veri Doğrulama", "Data Validation")}</span></button>
        </div><label>${t("Kurallar", "Rules")}</label></div>` },

      { name: t("Görünüm", "View"), html: `
        <div class="rgroup"><div class="rrow">
          <button data-cmd="freeze-row" data-state="freezeRow">${t("Üst Satırı Dondur", "Freeze Top Row")}</button>
          <button data-cmd="freeze-col" data-state="freezeCol">${t("İlk Sütunu Dondur", "Freeze First Column")}</button>
        </div><label>${t("Bölmeler", "Panes")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="gridlines" data-state="gridlines">${t("Kılavuz Çizgileri", "Gridlines")}</button>
        </div><label>${t("Göster", "Show")}</label></div>
        <div class="rgroup"><div class="rrow">
          <select data-cmd="zoom" id="xl-zoom">
            <option value="0.5">%50</option><option value="0.75">%75</option>
            <option value="1" selected>%100</option><option value="1.25">%125</option>
            <option value="1.5">%150</option>
          </select>
        </div><label>${t("Yakınlaştır", "Zoom")}</label></div>` },

      { name: t("Düzen", "Layout"), html: `
        <div class="rgroup"><div class="rrow">
          <select data-cmd="print-margin" id="xl-pmargin" title="${t("Yazdırma kenar boşlukları", "Print margins")}">
            <option value="normal">${t("Normal", "Normal")}</option>
            <option value="narrow">${t("Dar", "Narrow")}</option>
            <option value="wide">${t("Geniş", "Wide")}</option>
            <option value="none">${t("Yok", "None")}</option>
            <option value="custom">${t("Özel…", "Custom…")}</option>
          </select>
        </div><label>${t("Kenar Boşlukları", "Margins")}</label></div>
        <div class="rgroup"><div class="rrow">
          <button data-cmd="print-hf" class="big">🔢<span>${t("Üst/Alt Bilgi", "Header/Footer")}</span></button>
        </div><label>${t("Yazdırma", "Print")}</label></div>` },
    ];
  },

  view: { showFormulas: false, freezeRow: false, freezeCol: false, gridlines: true, zoom: 1 },

  /* ---------- Bağlama / ayırma ---------- */
  mount(doc) {
    document.getElementById("subbar").innerHTML = `
      <div id="formula-bar">
        <div id="namebox" contenteditable="true" spellcheck="false" title="${XL.t("Ad kutusu", "Name box")}">A1</div>
        <div class="fx">ƒx</div>
        <input id="formula-input" type="text" spellcheck="false" placeholder="${XL.t("Değer veya =FORMÜL", "Value or =FORMULA")}" />
      </div>`;
    document.getElementById("workarea").innerHTML = `
      <div id="xl-wrap">
        <input id="xl-keysink" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Hücre girişi" />
        <div id="grid-scroll"><table id="grid"></table></div>
        <div id="sheetbar">
          <button id="add-sheet" title="${XL.t("Sayfa ekle", "Add sheet")}">＋</button>
          <div id="sheettabs"></div>
        </div>
      </div>`;

    this.hiddenRows = new Set();
    XL.engine.load(doc.data);
    XL.grid.build();
    XL.grid.bindSink();
    this.applyView();
    this.renderSheetTabs();
    this.wireFormulaBar();
    document.getElementById("add-sheet").onclick = () => this.command("add-sheet");
    if (!XL.state.page) XL.state.page = this.defaultPage();
    this.syncPageUI();
    setTimeout(() => XL.grid.focusSink(), 0);
  },

  // Şeritteki kenar boşluğu seçicisini geçerli ayara göre güncelle
  syncPageUI() {
    const sel = document.getElementById("xl-pmargin");
    const p = XL.state.page || this.defaultPage();
    if (sel) sel.value = typeof p.margins === "object" ? "custom" : p.margins;
  },

  unmount(doc) {
    if (XL.grid.editing) XL.grid.commitEdit();
    doc.data = XL.engine.serialize();
    XL.grid.table = null;
  },

  serialize() {
    return XL.engine.serialize();
  },

  async importFile(file) {
    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: "string" });
      return XL.io.workbookToData(wb);
    }
    return XL.io.readFile(file);
  },

  async save(doc) {
    await XL.io.save(this.serialize(), doc.name + ".xlsx");
  },

  /* ---------- Komutlar (şerit) ---------- */
  command(cmd, value) {
    const r = this.runCommand(cmd, value);
    // Açılır liste / renk seçici odağı aldıysa, klavye yeniden ızgaraya dönsün
    if (!XL.grid.editing && document.getElementById("panel").classList.contains("hidden")) {
      setTimeout(() => XL.grid.focusSink(), 0);
    }
    return r;
  },

  runCommand(cmd, value) {
    if (XL.grid.editing && !["insert-fn"].includes(cmd)) XL.grid.commitEdit();
    const fmtCmds = ["bold", "italic", "underline", "color", "bg", "align-left", "align-center", "align-right", "numfmt"];
    if (fmtCmds.includes(cmd)) return XL.format.apply(cmd, value);

    switch (cmd) {
      case "undo": return this.undo();
      case "redo": return this.redo();
      case "cut": XL.grid.copyToSystem(); return XL.grid.clearSelection();
      case "copy": return XL.grid.copyToSystem();
      case "paste": return XL.grid.pasteSelection();
      case "clear-format": return XL.format.apply("clear");
      case "insert-row": return this.insertRows();
      case "delete-row": return this.deleteRows();
      case "insert-col": return this.insertCols();
      case "delete-col": return this.deleteCols();
      case "autosum": return this.autoSum();
      case "sort-asc": return this.sort(true);
      case "sort-desc": return this.sort(false);
      case "find": return this.findReplace();
      case "chart": return XL.charts.open();
      case "pivot": return XL.pivot.open();
      case "add-sheet": {
        const id = XL.engine.addSheet("Sayfa" + (XL.state.sheets.length + 1));
        return this.switchSheet(id);
      }
      case "fn-library": return this.functionLibrary();
      case "insert-fn": {
        if (!value) return;
        const a = XL.state.active;
        XL.grid.startEdit(a.r, a.c, "=" + value + "(");
        const sel = document.querySelector('#ribbon select[data-cmd="insert-fn"]');
        if (sel) sel.value = "";
        return;
      }
      case "show-formulas": this.view.showFormulas = !this.view.showFormulas; XL.grid.render(); return this.syncFormulaBar();
      case "cond-format": return XL.condfmt.openPanel();
      case "data-validation": return XL.validation.openPanel();
      case "filter": return this.filter();
      case "clear-filter": this.hiddenRows.clear(); return this.applyHidden();
      case "dedupe": return this.dedupe();
      case "csv": return XL.io.saveCSV((XL.ws.active().name || "veri") + ".csv");
      case "freeze-row": this.view.freezeRow = !this.view.freezeRow; return this.applyView();
      case "freeze-col": this.view.freezeCol = !this.view.freezeCol; return this.applyView();
      case "gridlines": this.view.gridlines = !this.view.gridlines; return this.applyView();
      case "zoom": this.view.zoom = parseFloat(value) || 1; return this.applyView();
      case "print-margin": return this.setPrintMargin(value);
      case "print-hf": return this.printHFDialog();
      case "merge-center": return XL.sheetLayout.toggleMerge();
    }
  },

  /* ---------- Yazdırma düzeni (kenar boşluğu + üst/alt bilgi) ---------- */
  setPrintMargin(value) {
    if (!XL.state.page) XL.state.page = this.defaultPage();
    if (value === "custom") return this.marginDialog();
    XL.state.page.margins = value;
    XL.ws.changed();
    XL.status(XL.t("Yazdırma kenar boşluğu: ", "Print margin: ") + value);
  },

  // Özel kenar boşluğu (cm, 4 kenar) — dışa aktarımda inç'e çevrilir
  marginDialog() {
    const p = XL.state.page;
    const cm = (inch) => +(inch * 2.54).toFixed(2);
    const cur = typeof p.margins === "object"
      ? { t: cm(p.margins.top), b: cm(p.margins.bottom), l: cm(p.margins.left), r: cm(p.margins.right) }
      : { t: cm(this.MARGINS.normal.top), b: cm(this.MARGINS.normal.bottom), l: cm(this.MARGINS.normal.left), r: cm(this.MARGINS.normal.right) };
    const inp = (id, v) => `<input id="${id}" type="number" min="0" max="10" step="0.1" value="${v}" style="width:70px"> cm`;
    XL.showPanel(XL.t("Özel Kenar Boşlukları", "Custom Margins"), `
      <div style="display:grid;grid-template-columns:auto auto;gap:8px 10px;align-items:center">
        <label>${XL.t("Üst", "Top")}</label>${inp("xm-t", cur.t)}
        <label>${XL.t("Alt", "Bottom")}</label>${inp("xm-b", cur.b)}
        <label>${XL.t("Sol", "Left")}</label>${inp("xm-l", cur.l)}
        <label>${XL.t("Sağ", "Right")}</label>${inp("xm-r", cur.r)}
      </div>
      <p style="margin-top:12px"><button id="xm-ok">${XL.t("Uygula", "Apply")}</button>
      <button id="xm-cancel" class="btn-secondary">${XL.t("Vazgeç", "Cancel")}</button></p>`);
    const num = (id, d) => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? d : Math.max(0, Math.min(10, v)); };
    const toInch = (c) => +(c / 2.54).toFixed(3);
    document.getElementById("xm-ok").onclick = () => {
      XL.state.page.margins = {
        top: toInch(num("xm-t", 1.9)), bottom: toInch(num("xm-b", 1.9)),
        left: toInch(num("xm-l", 1.8)), right: toInch(num("xm-r", 1.8)), header: 0.3, footer: 0.3,
      };
      XL.ws.changed(); this.syncPageUI(); XL.hidePanel();
    };
    document.getElementById("xm-cancel").onclick = () => { this.syncPageUI(); XL.hidePanel(); };
  },

  // Yazdırma üst/alt bilgisi (sol / orta / sağ alanlar)
  printHFDialog() {
    if (!XL.state.page) XL.state.page = this.defaultPage();
    const p = XL.state.page;
    const row = (label, obj, pre) => `
      <fieldset style="border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:0">
        <legend style="padding:0 4px">${label}</legend>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
          <label style="font-size:12px">${XL.t("Sol", "Left")}<br><input id="${pre}-l" value="${XL.esc(obj.l || "")}" style="width:100%"></label>
          <label style="font-size:12px">${XL.t("Orta", "Center")}<br><input id="${pre}-c" value="${XL.esc(obj.c || "")}" style="width:100%"></label>
          <label style="font-size:12px">${XL.t("Sağ", "Right")}<br><input id="${pre}-r" value="${XL.esc(obj.r || "")}" style="width:100%"></label>
        </div>
      </fieldset>`;
    XL.showPanel(XL.t("Yazdırma Üst/Alt Bilgisi", "Print Header/Footer"), `
      <div style="display:grid;gap:12px;min-width:360px">
        ${row(XL.t("Üst Bilgi", "Header"), p.header, "xh")}
        ${row(XL.t("Alt Bilgi", "Footer"), p.footer, "xf")}
        <p style="margin:0;font-size:12px;opacity:.75">${XL.t("İpucu: sayfa numarası için", "Tip: for page number use")} <code>&amp;P</code>, ${XL.t("toplam sayfa için", "total pages")} <code>&amp;N</code>, ${XL.t("tarih için", "date")} <code>&amp;D</code>.</p>
      </div>
      <p style="margin-top:12px"><button id="xhf-ok">${XL.t("Uygula", "Apply")}</button>
      <button id="xhf-cancel" class="btn-secondary">${XL.t("Vazgeç", "Cancel")}</button></p>`);
    const v = (id) => document.getElementById(id).value;
    document.getElementById("xhf-ok").onclick = () => {
      XL.state.page.header = { l: v("xh-l"), c: v("xh-c"), r: v("xh-r") };
      XL.state.page.footer = { l: v("xf-l"), c: v("xf-c"), r: v("xf-r") };
      XL.ws.changed(); XL.hidePanel();
      XL.status(XL.t("Yazdırma üst/alt bilgisi güncellendi", "Print header/footer updated"));
    };
    document.getElementById("xhf-cancel").onclick = () => XL.hidePanel();
  },

  // Şeritteki açık/kapalı düğmelerin durumu
  isOn(state) {
    if (state === "merge") return XL.sheetLayout.hasMerge();
    const a = XL.state.active;
    const f = XL.getFormat(a.r, a.c);
    if (state in f) return !!f[state];
    return !!this.view[state];
  },

  undo() { XL.engine.undo(); this.afterStructureChange(); },
  redo() { XL.engine.redo(); this.afterStructureChange(); },

  afterStructureChange() {
    const dims = XL.state.hf.getSheetDimensions(XL.state.activeSheetId);
    if (dims.height > XL.ROWS || dims.width > XL.COLS) {
      XL.ROWS = Math.max(XL.ROWS, dims.height + 20);
      XL.COLS = Math.max(XL.COLS, dims.width + 3);
      XL.grid.build();
      this.applyView();
    } else {
      // Birleştirme/özel boyut varsa DOM'u yeniden kur (colspan/gizleme temiz uygulansın).
      const lay = XL.sheetLayout.of();
      if (lay.merges.length || Object.keys(lay.colWidths).length || Object.keys(lay.rowHeights).length) {
        XL.grid.build();
        this.applyView();
      } else {
        XL.grid.render();
        XL.grid.updateSelection();
      }
    }
    XL.ws.changed();
  },

  applyView() {
    const t = document.getElementById("grid");
    if (!t) return;
    t.classList.toggle("freeze-row", this.view.freezeRow);
    t.classList.toggle("freeze-col", this.view.freezeCol);
    t.classList.toggle("no-grid", !this.view.gridlines);
    t.style.zoom = this.view.zoom;
    this.applyHidden();
    XL.ws.syncRibbonState();
  },

  /* ---------- Formül çubuğu ---------- */
  wireFormulaBar() {
    const inp = document.getElementById("formula-input");
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const a = XL.state.active;
        XL.engine.setCell(a.r, a.c, inp.value);
        XL.grid.render(); XL.grid.move(1, 0); XL.ws.changed();
        XL.grid.focusSink();
      } else if (e.key === "Escape") {
        this.syncFormulaBar(); XL.grid.focusSink();
      }
    });
    inp.addEventListener("change", () => {
      const a = XL.state.active;
      if (inp.value !== XL.engine.getRaw(a.r, a.c)) {
        XL.engine.setCell(a.r, a.c, inp.value);
        XL.grid.render(); XL.grid.updateSelection(); XL.ws.changed();
      }
    });

    const nb = document.getElementById("namebox");
    nb.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      // "B3" veya "A1:C5" kabul et
      const [from, to] = nb.textContent.split(":");
      const p = XL.parseAddr(from || ""), q = to ? XL.parseAddr(to) : p;
      if (p && q && p.r < XL.ROWS && p.c < XL.COLS && q.r < XL.ROWS && q.c < XL.COLS) {
        XL.state.active = { r: p.r, c: p.c };
        XL.state.sel = { r1: p.r, c1: p.c, r2: q.r, c2: q.c };
        XL.grid.updateSelection();
      }
      XL.grid.focusSink();
    });
  },

  setFormulaBar(v) {
    const inp = document.getElementById("formula-input");
    if (inp) inp.value = v;
  },

  syncFormulaBar() {
    const nb = document.getElementById("namebox");
    if (!nb) return;
    const a = XL.state.active, s = XL.state.sel;
    const multi = s.r1 !== s.r2 || s.c1 !== s.c2;
    nb.textContent = multi
      ? XL.addrLabel(Math.min(s.r1, s.r2), Math.min(s.c1, s.c2)) + ":" + XL.addrLabel(Math.max(s.r1, s.r2), Math.max(s.c1, s.c2))
      : XL.addrLabel(a.r, a.c);
    this.setFormulaBar(XL.engine.getRaw(a.r, a.c));

    const nf = document.getElementById("numfmt");
    if (nf) nf.value = XL.getFormat(a.r, a.c).numfmt || "general";
    XL.ws.syncRibbonState();
    this.updateStats();
  },

  // Excel'deki gibi: seçimdeki sayıların toplam/ortalama/sayısı
  updateStats() {
    const s = XL.state.sel;
    if (s.r1 === s.r2 && s.c1 === s.c2) return XL.status(XL.t("Hazır", "Ready"));
    let sum = 0, n = 0, count = 0;
    XL.forEachInSelection((r, c) => {
      const v = XL.engine.getValue(r, c);
      if (v !== null && v !== "" && v !== undefined) count++;
      if (typeof v === "number") { sum += v; n++; }
    });
    const loc = XL.i18n ? XL.i18n.locale : "tr";
    const f = (x) => x.toLocaleString(loc === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 4 });
    const L = { avg: XL.t("Ortalama", "Average"), cnt: XL.t("Sayı", "Count"), sum: XL.t("Toplam", "Sum") };
    XL.status(n ? `${L.avg}: ${f(sum / n)}   ${L.cnt}: ${count}   ${L.sum}: ${f(sum)}` : `${L.cnt}: ${count}`);
  },

  /* ---------- Sayfa sekmeleri (belge içi) ---------- */
  renderSheetTabs() {
    const wrap = document.getElementById("sheettabs");
    if (!wrap) return;
    wrap.innerHTML = "";
    XL.state.sheets.forEach((s) => {
      const tab = document.createElement("div");
      tab.className = "sheettab" + (s.id === XL.state.activeSheetId ? " active" : "");
      tab.textContent = s.name;
      tab.title = XL.t("Çift tık: yeniden adlandır · Sağ tık: sil", "Double-click: rename · Right-click: delete");
      tab.onclick = () => this.switchSheet(s.id);
      tab.ondblclick = () => {
        const n = prompt(XL.t("Sayfa adı:", "Sheet name:"), s.name);
        if (n && n.trim() && XL.engine.renameSheet(s.id, n.trim())) { this.renderSheetTabs(); XL.ws.changed(); }
      };
      tab.oncontextmenu = (e) => {
        e.preventDefault();
        if (XL.state.sheets.length <= 1) return alert(XL.t("Son sayfa silinemez.", "Cannot delete the last sheet."));
        if (!confirm(XL.t(`"${s.name}" sayfası silinsin mi?`, `Delete sheet "${s.name}"?`))) return;
        XL.engine.removeSheet(s.id);
        if (s.id === XL.state.activeSheetId) this.switchSheet(XL.state.sheets[0].id);
        else { this.renderSheetTabs(); XL.grid.render(); }
        XL.ws.changed();
      };
      wrap.appendChild(tab);
    });
  },

  switchSheet(id) {
    if (XL.grid.editing) XL.grid.commitEdit();
    XL.state.activeSheetId = id;
    XL.state.active = { r: 0, c: 0 };
    XL.state.sel = { r1: 0, c1: 0, r2: 0, c2: 0 };
    this.hiddenRows.clear();
    this.afterStructureChange();
    this.applyHidden();
    this.renderSheetTabs();
  },

  /* ---------- Yardımcı: seçim sınırları ---------- */
  bounds() {
    const s = XL.state.sel;
    return {
      r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2),
      c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2),
    };
  },

  // Etkin sayfada biçim anahtarlarını kaydır (satır/sütun ekle-sil sonrası)
  shiftFormats(axis, at, delta) {
    const id = XL.state.activeSheetId;
    const prefix = id + ":";
    const next = {};
    Object.entries(XL.state.formats).forEach(([key, fmt]) => {
      if (!key.startsWith(prefix)) { next[key] = fmt; return; }
      let [, r, c] = key.split(":").map(Number);
      const v = axis === "row" ? r : c;
      if (delta < 0 && v >= at && v < at - delta) return; // silinen bölge
      if (v >= at) { if (axis === "row") r += delta; else c += delta; }
      next[id + ":" + r + ":" + c] = fmt;
    });
    XL.state.formats = next;
  },

  insertRows() {
    const b = this.bounds(), n = b.r2 - b.r1 + 1;
    XL.state.hf.addRows(XL.state.activeSheetId, [b.r1, n]);
    this.shiftFormats("row", b.r1, n);
    XL.sheetLayout.shift("row", b.r1, n);
    this.afterStructureChange();
  },
  deleteRows() {
    const b = this.bounds(), n = b.r2 - b.r1 + 1;
    XL.state.hf.removeRows(XL.state.activeSheetId, [b.r1, n]);
    this.shiftFormats("row", b.r1, -n);
    XL.sheetLayout.shift("row", b.r1, -n);
    this.afterStructureChange();
  },
  insertCols() {
    const b = this.bounds(), n = b.c2 - b.c1 + 1;
    XL.state.hf.addColumns(XL.state.activeSheetId, [b.c1, n]);
    this.shiftFormats("col", b.c1, n);
    XL.sheetLayout.shift("col", b.c1, n);
    this.afterStructureChange();
  },
  deleteCols() {
    const b = this.bounds(), n = b.c2 - b.c1 + 1;
    XL.state.hf.removeColumns(XL.state.activeSheetId, [b.c1, n]);
    this.shiftFormats("col", b.c1, -n);
    XL.sheetLayout.shift("col", b.c1, -n);
    this.afterStructureChange();
  },

  /* ---------- Otomatik Toplam ---------- */
  autoSum() {
    const a = XL.state.active;
    const isNum = (r, c) => typeof XL.engine.getValue(r, c) === "number";
    let formula = null;
    // Üstteki ardışık sayılar
    let r = a.r - 1;
    while (r >= 0 && isNum(r, a.c)) r--;
    if (r < a.r - 1) formula = `=SUM(${XL.addrLabel(r + 1, a.c)}:${XL.addrLabel(a.r - 1, a.c)})`;
    // Yoksa soldaki ardışık sayılar
    if (!formula) {
      let c = a.c - 1;
      while (c >= 0 && isNum(a.r, c)) c--;
      if (c < a.c - 1) formula = `=SUM(${XL.addrLabel(a.r, c + 1)}:${XL.addrLabel(a.r, a.c - 1)})`;
    }
    XL.grid.startEdit(a.r, a.c, formula || "=SUM(");
  },

  /* ---------- Sıralama ---------- */
  sort(asc) {
    const id = XL.state.activeSheetId;
    const dims = XL.state.hf.getSheetDimensions(id);
    if (!dims.height) return;
    let { r1, r2 } = this.bounds();
    const col = XL.state.active.c;

    // Tek hücre seçiliyse: tüm kullanılan alan; ilk satır başlığa benziyorsa hariç tut
    if (r1 === r2) {
      r1 = 0; r2 = dims.height - 1;
      if (this.rowLooksLikeHeader(dims.width)) r1 = 1;
    }
    r2 = Math.min(r2, dims.height - 1);
    if (r2 <= r1) return;

    const rows = [];
    for (let r = r1; r <= r2; r++) rows.push(r);
    const key = (r) => {
      const v = XL.engine.getValue(r, col);
      return v === null || v === undefined || v === "" || XL.isError(v) ? null : v;
    };
    rows.sort((x, y) => {
      const a = key(x), b = key(y);
      if (a === null && b === null) return x - y;
      if (a === null) return 1;      // boşlar her zaman sonda
      if (b === null) return -1;
      let cmp;
      if (typeof a === "number" && typeof b === "number") cmp = a - b;
      else if (typeof a === "number") cmp = -1;   // sayılar metinden önce
      else if (typeof b === "number") cmp = 1;
      else cmp = String(a).localeCompare(String(b), "tr");
      return asc ? cmp : -cmp;
    });

    // setRowOrder: order[eskiSatır] = yeniSatır
    const order = Array.from({ length: dims.height }, (_, i) => i);
    rows.forEach((oldR, k) => { order[oldR] = r1 + k; });
    XL.state.hf.setRowOrder(id, order);

    // Biçimler satırla birlikte taşınsın
    const prefix = id + ":";
    const next = {};
    Object.entries(XL.state.formats).forEach(([k, f]) => {
      if (!k.startsWith(prefix)) { next[k] = f; return; }
      const [, r, c] = k.split(":").map(Number);
      next[prefix + (r < order.length ? order[r] : r) + ":" + c] = f;
    });
    XL.state.formats = next;
    this.afterStructureChange();
    XL.status(XL.t(
      `${rows.length} satır sıralandı (${XL.colLetter(col)} sütunu, ${asc ? "artan" : "azalan"})`,
      `${rows.length} rows sorted (column ${XL.colLetter(col)}, ${asc ? "ascending" : "descending"})`));
  },

  // Başlık sezgisi: 1. satırda hiç sayı yok ve 2. satırda en az bir sayı var
  // ya da sıralanan sütunda 1. satır metin, 2. satır sayı.
  rowLooksLikeHeader(width) {
    let row0HasNum = false, row1HasNum = false;
    for (let c = 0; c < width; c++) {
      if (typeof XL.engine.getValue(0, c) === "number") row0HasNum = true;
      if (typeof XL.engine.getValue(1, c) === "number") row1HasNum = true;
    }
    return !row0HasNum && row1HasNum;
  },

  /* ---------- Filtre ---------- */
  filter() {
    const col = XL.state.active.c;
    const dims = XL.state.hf.getSheetDimensions(XL.state.activeSheetId);
    const values = new Set();
    for (let r = 1; r < dims.height; r++) {
      const v = XL.engine.getValue(r, col);
      values.add(XL.isError(v) ? v.value : String(v ?? ""));
    }
    const list = [...values].sort((a, b) => a.localeCompare(b, "tr"));
    XL.showPanel(XL.t(`Filtre — ${XL.colLetter(col)} sütunu`, `Filter — column ${XL.colLetter(col)}`), `
      <p style="margin-top:0">${XL.t("1. satır başlık kabul edilir. Gösterilecek değerleri seçin:", "Row 1 is treated as a header. Choose values to show:")}</p>
      <label><input type="checkbox" id="flt-all" checked> <b>${XL.t("(Tümünü seç)", "(Select all)")}</b></label>
      <div id="flt-list" style="max-height:240px;overflow:auto;border:1px solid #ddd;padding:6px;margin:6px 0">
        ${list.map((v, i) => `<label style="display:block"><input type="checkbox" data-i="${i}" checked> ${XL.esc(v === "" ? XL.t("(Boş)", "(Blank)") : v)}</label>`).join("")}
      </div>
      <label>${XL.t("veya metin içerir:", "or contains text:")} <input id="flt-text" type="text" placeholder="${XL.t("aranan…", "search…")}"></label>
      <div style="margin-top:8px"><button id="flt-apply">${XL.t("Uygula", "Apply")}</button></div>
    `);
    const boxes = () => [...document.querySelectorAll("#flt-list input")];
    document.getElementById("flt-all").onchange = (e) => boxes().forEach((b) => (b.checked = e.target.checked));
    document.getElementById("flt-apply").onclick = () => {
      const keep = new Set(boxes().filter((b) => b.checked).map((b) => list[+b.dataset.i]));
      const txt = document.getElementById("flt-text").value.trim().toLocaleLowerCase("tr");
      this.hiddenRows.clear();
      for (let r = 1; r < dims.height; r++) {
        const v = XL.engine.getValue(r, col);
        const s = XL.isError(v) ? v.value : String(v ?? "");
        const ok = keep.has(s) && (!txt || s.toLocaleLowerCase("tr").includes(txt));
        if (!ok) this.hiddenRows.add(r);
      }
      this.applyHidden();
      XL.hidePanel();
      XL.status(XL.t(`${this.hiddenRows.size} satır gizlendi`, `${this.hiddenRows.size} rows hidden`));
    };
  },

  applyHidden() {
    const t = document.getElementById("grid");
    if (!t) return;
    t.querySelectorAll("tbody tr").forEach((tr, r) => {
      tr.style.display = this.hiddenRows.has(r) ? "none" : "";
    });
  },

  /* ---------- Yinelenenleri kaldır ---------- */
  dedupe() {
    const id = XL.state.activeSheetId;
    const dims = XL.state.hf.getSheetDimensions(id);
    let { r1, r2, c1, c2 } = this.bounds();
    if (r1 === r2 && c1 === c2) { r1 = 0; r2 = dims.height - 1; c1 = 0; c2 = dims.width - 1; }
    r2 = Math.min(r2, dims.height - 1);
    const seen = new Set(), dup = [];
    for (let r = r1; r <= r2; r++) {
      const key = [];
      for (let c = c1; c <= c2; c++) key.push(XL.engine.getRaw(r, c));
      const k = JSON.stringify(key);
      if (key.every((v) => v === "")) continue;
      if (seen.has(k)) dup.push(r); else seen.add(k);
    }
    if (!dup.length) return alert(XL.t("Yinelenen satır bulunamadı.", "No duplicate rows found."));
    // Aşağıdan yukarı sil ki indeksler kaymasın
    dup.reverse().forEach((r) => {
      XL.state.hf.removeRows(id, [r, 1]);
      this.shiftFormats("row", r, -1);
      XL.sheetLayout.shift("row", r, -1, id);
    });
    this.afterStructureChange();
    alert(XL.t(`${dup.length} yinelenen satır kaldırıldı.`, `${dup.length} duplicate rows removed.`));
  },

  /* ---------- Bul / Değiştir ---------- */
  findReplace() {
    XL.showPanel(XL.t("Bul ve Değiştir", "Find and Replace"), `
      <label>${XL.t("Aranan:", "Find:")} <input id="fr-find" type="text"></label><br>
      <label>${XL.t("Yeni:", "Replace:")} <input id="fr-repl" type="text"></label><br>
      <label><input id="fr-case" type="checkbox"> ${XL.t("Büyük/küçük harf duyarlı", "Case sensitive")}</label><br>
      <button id="fr-next">${XL.t("Sonrakini Bul", "Find Next")}</button>
      <button id="fr-one">${XL.t("Değiştir", "Replace")}</button>
      <button id="fr-all">${XL.t("Tümünü Değiştir", "Replace All")}</button>
      <div id="fr-msg" style="margin-top:8px;color:#555"></div>`);
    const $ = (id) => document.getElementById(id);
    $("fr-find").focus();
    const matches = (raw, needle) => $("fr-case").checked
      ? raw.includes(needle) : raw.toLocaleLowerCase("tr").includes(needle.toLocaleLowerCase("tr"));
    const display = (r, c) => XL.format.display(XL.engine.getValue(r, c), r, c);

    const findNext = () => {
      const needle = $("fr-find").value;
      if (!needle) return false;
      const dims = XL.state.hf.getSheetDimensions(XL.state.activeSheetId);
      const total = dims.height * dims.width;
      const a = XL.state.active;
      let start = a.r * dims.width + a.c;
      for (let i = 1; i <= total; i++) {
        const idx = (start + i) % total;
        const r = Math.floor(idx / dims.width), c = idx % dims.width;
        if (matches(XL.engine.getRaw(r, c), needle) || matches(display(r, c), needle)) {
          XL.state.active = { r, c };
          XL.state.sel = { r1: r, c1: c, r2: r, c2: c };
          XL.grid.updateSelection();
          $("fr-msg").textContent = XL.t("Bulundu: ", "Found: ") + XL.addrLabel(r, c);
          return true;
        }
      }
      $("fr-msg").textContent = XL.t("Bulunamadı.", "Not found.");
      return false;
    };
    const replaceIn = (raw, needle, repl) => {
      const flags = $("fr-case").checked ? "g" : "gi";
      return raw.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags), repl);
    };

    $("fr-next").onclick = findNext;
    $("fr-one").onclick = () => {
      const needle = $("fr-find").value, a = XL.state.active;
      const raw = XL.engine.getRaw(a.r, a.c);
      if (needle && matches(raw, needle)) {
        XL.engine.setCell(a.r, a.c, replaceIn(raw, needle, $("fr-repl").value));
        XL.grid.render(); XL.ws.changed();
      }
      findNext();
    };
    $("fr-all").onclick = () => {
      const needle = $("fr-find").value;
      if (!needle) return;
      const dims = XL.state.hf.getSheetDimensions(XL.state.activeSheetId);
      let n = 0;
      XL.state.hf.batch(() => {
        for (let r = 0; r < dims.height; r++)
          for (let c = 0; c < dims.width; c++) {
            const raw = XL.engine.getRaw(r, c);
            if (raw && matches(raw, needle)) { XL.engine.setCell(r, c, replaceIn(raw, needle, $("fr-repl").value)); n++; }
          }
      });
      XL.grid.render(); XL.grid.updateSelection(); XL.ws.changed();
      $("fr-msg").textContent = n + XL.t(" hücre değiştirildi.", " cells replaced.");
    };
  },

  /* ---------- Fonksiyon kitaplığı ---------- */
  functionLibrary() {
    const names = HyperFormula.getRegisteredFunctionNames("enGB").slice().sort();
    XL.showPanel(XL.t(`Fonksiyon Kitaplığı (${names.length} fonksiyon)`, `Function Library (${names.length} functions)`), `
      <input id="fn-search" type="text" placeholder="${XL.t("Ara… (ör. LOOKUP, DATE)", "Search… (e.g. LOOKUP, DATE)")}" style="width:100%;padding:6px">
      <div id="fn-list" class="fn-list"></div>
      <p style="color:#666;font-size:12px">${XL.t("Tıklayınca etkin hücreye eklenir.", "Click to insert into the active cell.")}</p>`);
    const list = document.getElementById("fn-list");
    const draw = (q) => {
      q = (q || "").toUpperCase();
      list.innerHTML = names.filter((n) => n.includes(q))
        .map((n) => `<button data-fn="${n}">${n}</button>`).join("");
    };
    draw("");
    document.getElementById("fn-search").oninput = (e) => draw(e.target.value);
    list.onclick = (e) => {
      const b = e.target.closest("button[data-fn]");
      if (!b) return;
      XL.hidePanel();
      const a = XL.state.active;
      XL.grid.startEdit(a.r, a.c, "=" + b.dataset.fn + "(");
    };
  },
};
