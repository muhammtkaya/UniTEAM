/* excel/grid.js — ızgara oluşturma, seçim, düzenleme ve klavye gezinmesi */
XL.grid = {
  cells: [],       // cells[r][c] -> td DOM referansı
  table: null,
  editInput: null,
  editing: null,   // {r,c}
  dragging: false,
  globalsBound: false,

  // Excel modu etkin mi? (global dinleyiciler başka modlarda çalışmasın)
  isActive() {
    return document.body.dataset.mode === "xlsx" && this.table && document.body.contains(this.table);
  },

  build() {
    const table = document.getElementById("grid");
    this.table = table;
    this.editing = null;
    this.editInput = null;
    table.innerHTML = "";
    this.cells = [];

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "corner rowhead";
    htr.appendChild(corner);
    for (let c = 0; c < XL.COLS; c++) {
      const th = document.createElement("th");
      th.textContent = XL.colLetter(c);
      th.dataset.c = c;
      const grip = document.createElement("div");
      grip.className = "col-resizer";
      th.appendChild(grip);
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let r = 0; r < XL.ROWS; r++) {
      const tr = document.createElement("tr");
      const rh = document.createElement("th");
      rh.className = "rowhead";
      rh.textContent = r + 1;
      rh.dataset.r = r;
      const rgrip = document.createElement("div");
      rgrip.className = "row-resizer";
      rh.appendChild(rgrip);
      tr.appendChild(rh);
      const rowCells = [];
      for (let c = 0; c < XL.COLS; c++) {
        const td = document.createElement("td");
        td.dataset.r = r;
        td.dataset.c = c;
        tr.appendChild(td);
        rowCells.push(td);
      }
      this.cells.push(rowCells);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    this.attachTableEvents();
    this.bindGlobals();
    XL.sheetLayout.applyToGrid();   // sütun genişliği / satır yüksekliği / birleştirme
    this.render();
    this.updateSelection();
  },

  render() {
    for (let r = 0; r < XL.ROWS; r++)
      for (let c = 0; c < XL.COLS; c++) this.renderCell(r, c);
  },

  renderCell(r, c) {
    const td = this.cells[r] && this.cells[r][c];
    if (!td || (this.editing && this.editing.r === r && this.editing.c === c)) return;
    const val = XL.engine.getValue(r, c);
    const showFormulas = XL.modes.xlsx.view.showFormulas;
    const raw = showFormulas ? XL.engine.getRaw(r, c) : "";
    td.textContent = showFormulas && raw.startsWith("=") ? raw : XL.format.display(val, r, c);
    td.classList.toggle("err", XL.isError(val));
    td.style.cssText = "";
    XL.format.styleCell(td, r, c);
    const f = XL.getFormat(r, c);
    td.classList.toggle("num", XL.format.isNumeric(val) && !f.align);
  },

  // Tablo her kurulduğunda yeniden oluşturulur, bu yüzden dinleyicileri ona bağlamak güvenli
  attachTableEvents() {
    const table = this.table;

    // Sütun / satır kenarını sürükleyerek yeniden boyutlandırma
    table.addEventListener("mousedown", (e) => {
      const cr = e.target.closest(".col-resizer");
      if (cr) { e.preventDefault(); e.stopPropagation(); this.startColResize(+cr.parentElement.dataset.c, e.clientX); return; }
      const rr = e.target.closest(".row-resizer");
      if (rr) { e.preventDefault(); e.stopPropagation(); this.startRowResize(+rr.parentElement.dataset.r, e.clientY); return; }
    });

    table.addEventListener("mousedown", (e) => {
      const td = e.target.closest("td");
      if (!td || e.target.tagName === "INPUT") return;
      const r = +td.dataset.r, c = +td.dataset.c;
      if (this.editing) this.commitEdit();
      if (e.shiftKey) {
        XL.state.sel.r2 = r; XL.state.sel.c2 = c;
      } else {
        XL.state.active = { r, c };
        XL.state.sel = { r1: r, c1: c, r2: r, c2: c };
      }
      this.dragging = true;
      this.updateSelection();
      e.preventDefault(); // metin seçimi olmasın
      this.focusSink();
    });

    table.addEventListener("mouseover", (e) => {
      if (!this.dragging) return;
      const td = e.target.closest("td");
      if (!td) return;
      XL.state.sel.r2 = +td.dataset.r;
      XL.state.sel.c2 = +td.dataset.c;
      this.updateSelection();
    });

    table.addEventListener("dblclick", (e) => {
      const td = e.target.closest("td");
      if (td) this.startEdit(+td.dataset.r, +td.dataset.c);
    });

    // Sütun / satır başlığı = tamamını seç
    table.addEventListener("click", (e) => {
      if (this._justResized) { this._justResized = false; return; }  // boyutlandırma sonrası seçme
      const th = e.target.closest("th");
      if (!th || th.classList.contains("corner")) return;
      if (th.dataset.c !== undefined) {
        const c = +th.dataset.c;
        XL.state.active = { r: 0, c };
        XL.state.sel = { r1: 0, c1: c, r2: XL.ROWS - 1, c2: c };
      } else if (th.dataset.r !== undefined) {
        const r = +th.dataset.r;
        XL.state.active = { r, c: 0 };
        XL.state.sel = { r1: r, c1: 0, r2: r, c2: XL.COLS - 1 };
      }
      this.updateSelection(false);
    });
  },

  /* ---- Sütun / satır yeniden boyutlandırma (sürükle) ---- */
  startColResize(c, startX) {
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;
    const startW = XL.sheetLayout.colWidth(c);
    const th = this.table.querySelector(`thead th[data-c="${c}"]`);
    const move = (e) => {
      const w = Math.max(24, startW + (e.clientX - startX));
      XL.sheetLayout.setColWidth(c, w);
      if (th) th.style.cssText += `;width:${w}px;min-width:${w}px;max-width:${w}px`;
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      this._justResized = true;
      XL.ws.changed();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  },
  startRowResize(r, startY) {
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;
    const startH = XL.sheetLayout.rowHeight(r);
    const tr = this.table.querySelectorAll("tbody tr")[r];
    const move = (e) => {
      const h = Math.max(16, startH + (e.clientY - startY));
      XL.sheetLayout.setRowHeight(r, h);
      if (tr) tr.style.height = h + "px";
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      this._justResized = true;
      XL.ws.changed();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  },

  // Belge düzeyindeki dinleyiciler yalnızca bir kez bağlanır
  bindGlobals() {
    if (this.globalsBound) return;
    this.globalsBound = true;
    document.addEventListener("mouseup", () => { this.dragging = false; });
    document.addEventListener("keydown", (e) => this.onKey(e));
  },

  /* ---- Klavye yakalayıcı ----
   * Gizli, her zaman odakta duran bir giriş kutusu. Bazı karakterler keydown üretmeden gelir
   * (Türkçe/aksanlı harfler, IME, Android klavyeleri "Unidentified" bildirir); bunları "input"
   * olayıyla yakalayıp hücre düzenlemesini başlatırız. Kopyala/yapıştır da yerel olaylarla çalışır. */
  sink() { return document.getElementById("xl-keysink"); },

  focusSink() {
    const k = this.sink();
    if (k && !this.editing && document.activeElement !== k) k.focus({ preventScroll: true });
  },

  bindSink() {
    const k = this.sink();
    if (!k) return;
    const begin = () => {
      const v = k.value;
      k.value = "";
      if (v && !this.editing) this.startEdit(XL.state.active.r, XL.state.active.c, v);
    };
    k.addEventListener("input", (e) => { if (!e.isComposing) begin(); });
    k.addEventListener("compositionend", begin);
    k.addEventListener("copy", (e) => { e.preventDefault(); e.clipboardData.setData("text/plain", this.copySelection()); });
    k.addEventListener("cut", (e) => {
      e.preventDefault();
      e.clipboardData.setData("text/plain", this.copySelection());
      this.clearSelection();
    });
    k.addEventListener("paste", (e) => {
      e.preventDefault();
      this.pasteText(e.clipboardData.getData("text/plain"));
    });
  },

  updateSelection(scroll = true) {
    if (!this.table) return;
    const { active, sel } = XL.state;
    const r1 = Math.min(sel.r1, sel.r2), r2 = Math.max(sel.r1, sel.r2);
    const c1 = Math.min(sel.c1, sel.c2), c2 = Math.max(sel.c1, sel.c2);

    for (let r = 0; r < XL.ROWS; r++) {
      for (let c = 0; c < XL.COLS; c++) {
        const td = this.cells[r][c];
        td.classList.toggle("selected", r >= r1 && r <= r2 && c >= c1 && c <= c2);
        td.classList.toggle("active", r === active.r && c === active.c);
      }
    }
    this.table.querySelectorAll("th.active-head").forEach((th) => th.classList.remove("active-head"));
    const colH = this.table.querySelector(`thead th[data-c="${active.c}"]`);
    if (colH) colH.classList.add("active-head");
    const rowH = this.table.querySelector(`tbody th[data-r="${active.r}"]`);
    if (rowH) rowH.classList.add("active-head");

    XL.modes.xlsx.syncFormulaBar();
    if (scroll) this.ensureVisible();
  },

  ensureVisible() {
    const td = this.cells[XL.state.active.r][XL.state.active.c];
    if (td && td.scrollIntoView) td.scrollIntoView({ block: "nearest", inline: "nearest" });
  },

  /* ---- Düzenleme ---- */
  startEdit(r, c, initial) {
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;  // salt görüntüleme
    this.editing = { r, c };
    const td = this.cells[r][c];
    const raw = initial !== undefined ? initial : XL.engine.getRaw(r, c);
    td.textContent = "";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = raw;
    td.appendChild(inp);
    this.editInput = inp;
    inp.focus();
    if (initial !== undefined) inp.setSelectionRange(raw.length, raw.length);
    else inp.select();

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.commitEdit(); this.move(1, 0); }
      else if (e.key === "Tab") { e.preventDefault(); this.commitEdit(); this.move(0, e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); this.cancelEdit(); }
      e.stopPropagation();
    });
    inp.addEventListener("input", () => XL.modes.xlsx.setFormulaBar(inp.value));
    inp.addEventListener("blur", () => { if (this.editInput === inp) this.commitEdit(); });
  },

  commitEdit() {
    if (!this.editing) return;
    const { r, c } = this.editing;
    const val = this.editInput.value;
    this.editing = null;
    this.editInput = null;
    XL.engine.setCell(r, c, val);
    this.render();
    this.updateSelection();
    XL.ws.changed();
    // Odak başka bir denetime (ör. şerit) geçmediyse yakalayıcıya dön
    setTimeout(() => {
      if (!this.table) return;
      const ae = document.activeElement;
      if (!ae || ae === document.body || this.table.contains(ae)) this.focusSink();
    }, 0);
  },

  cancelEdit() {
    if (!this.editing) return;
    const { r, c } = this.editing;
    this.editing = null;
    this.editInput = null;
    this.renderCell(r, c);
    this.focusSink();
  },

  move(dr, dc) {
    const a = XL.state.active;
    const r = Math.max(0, Math.min(XL.ROWS - 1, a.r + dr));
    const c = Math.max(0, Math.min(XL.COLS - 1, a.c + dc));
    XL.state.active = { r, c };
    XL.state.sel = { r1: r, c1: c, r2: r, c2: c };
    this.updateSelection();
  },

  onKey(e) {
    if (!this.isActive() || this.editing) return;
    // Başka bir girişte (formül çubuğu, panel, ad kutusu) yazılıyorsa karışma
    const ae = document.activeElement;
    const inSink = ae && ae.id === "xl-keysink";
    if (!inSink && ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
    if (e.isComposing) return;

    const a = XL.state.active;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (ctrl && k === "z") { e.preventDefault(); XL.modes.xlsx.undo(); return; }
    if (ctrl && k === "y") { e.preventDefault(); XL.modes.xlsx.redo(); return; }
    // Yakalayıcı odaktaysa kopyala/kes/yapıştır yerel olaylarla işlenir (bkz. bindSink)
    if (ctrl && (k === "c" || k === "x" || k === "v") && inSink) return;
    if (ctrl && k === "c") { this.copySelection(); return; }
    if (ctrl && k === "x") { this.copySelection(); this.clearSelection(); return; }
    if (ctrl && k === "v") { e.preventDefault(); this.pasteSelection(); return; }
    if (ctrl && k === "b") { e.preventDefault(); XL.format.apply("bold"); return; }
    if (ctrl && k === "i") { e.preventDefault(); XL.format.apply("italic"); return; }
    if (ctrl && k === "u") { e.preventDefault(); XL.format.apply("underline"); return; }
    if (ctrl && k === "a") {
      e.preventDefault();
      XL.state.sel = { r1: 0, c1: 0, r2: XL.ROWS - 1, c2: XL.COLS - 1 };
      this.updateSelection(false);
      return;
    }

    switch (e.key) {
      case "ArrowUp":    e.preventDefault(); this.arrow(-1, 0, e.shiftKey); break;
      case "ArrowDown":  e.preventDefault(); this.arrow(1, 0, e.shiftKey); break;
      case "ArrowLeft":  e.preventDefault(); this.arrow(0, -1, e.shiftKey); break;
      case "ArrowRight": e.preventDefault(); this.arrow(0, 1, e.shiftKey); break;
      case "Enter":      e.preventDefault(); this.move(e.shiftKey ? -1 : 1, 0); break;
      case "Tab":        e.preventDefault(); this.move(0, e.shiftKey ? -1 : 1); break;
      case "F2":         e.preventDefault(); this.startEdit(a.r, a.c); break;
      case "Delete":
      case "Backspace":  e.preventDefault(); this.clearSelection(); break;
      default:
        // Yakalayıcı odaktaysa karakter onun "input" olayından gelir; değilse doğrudan başla
        if (!inSink && e.key.length === 1 && !ctrl && !e.altKey) {
          e.preventDefault();
          this.startEdit(a.r, a.c, e.key);
        }
    }
  },

  arrow(dr, dc, shift) {
    if (shift) {
      const s = XL.state.sel;
      s.r2 = Math.max(0, Math.min(XL.ROWS - 1, s.r2 + dr));
      s.c2 = Math.max(0, Math.min(XL.COLS - 1, s.c2 + dc));
      this.updateSelection();
    } else {
      this.move(dr, dc);
    }
  },

  clearSelection() {
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;  // salt görüntüleme
    XL.forEachInSelection((r, c) => XL.engine.setCell(r, c, ""));
    this.render();
    this.updateSelection();
    XL.ws.changed();
  },

  /* ---- Kopyala / yapıştır ---- */
  copySelection() {
    const s = XL.state.sel;
    const r1 = Math.min(s.r1, s.r2), c1 = Math.min(s.c1, s.c2);
    const r2 = Math.max(s.r1, s.r2), c2 = Math.max(s.c1, s.c2);
    const grid = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) row.push(XL.engine.getRaw(r, c));
      grid.push(row);
    }
    this.clipboard = grid;
    const text = grid.map((row) => row.join("\t")).join("\n");
    this.clipboardText = text;
    return text;
  },

  // Şerit düğmesi: Clipboard API ile (tarayıcı izin isteyebilir)
  async copyToSystem() {
    const text = this.copySelection();
    try { await navigator.clipboard.writeText(text); } catch (e) { /* iç pano yine de dolu */ }
  },

  async pasteSelection() {
    let text = null;
    try { if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText(); } catch (e) {}
    this.pasteText(text || this.clipboardText || "");
  },

  // Sekmeyle ayrılmış metni (Excel/Sheets'ten kopyalanan biçim) etkin hücreden itibaren yapıştır
  pasteText(text) {
    if (!text) return;
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;  // salt görüntüleme
    // Kendi kopyaladığımız aralıksa ham içeriği (formüller dahil) kullan
    const grid = text === this.clipboardText && this.clipboard
      ? this.clipboard
      : text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));

    const { r, c } = XL.state.active;
    grid.forEach((row, dr) => {
      row.forEach((val, dc) => {
        if (r + dr < XL.ROWS && c + dc < XL.COLS) XL.engine.setCell(r + dr, c + dc, val);
      });
    });
    this.render();
    this.updateSelection();
    XL.ws.changed();
  },
};
