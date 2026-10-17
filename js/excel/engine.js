/* excel/engine.js — HyperFormula sarmalayıcı (hesap motoru) */
XL.engine = {
  // Belge verisinden temiz bir motor kur.
  // data = { rows, cols, activeSheet, sheets: [{ name, cells: {"r,c": raw}, formats: {"r:c": {...}} }] }
  load(data) {
    if (XL.state.hf) { try { XL.state.hf.destroy(); } catch (e) {} }
    XL.state.hf = HyperFormula.buildEmpty({ useColumnIndex: true });
    XL.state.sheets = [];
    XL.state.formats = {};
    XL.state.layout = {};
    XL.ROWS = data.rows || 100;
    XL.COLS = data.cols || 26;

    const sheets = data.sheets && data.sheets.length ? data.sheets : [{ name: "Sayfa1", cells: {} }];

    // Önce tüm sayfaları oluştur (sayfalar arası formüller birbirini bulabilsin)
    sheets.forEach((s) => this.addSheet(s.name));

    sheets.forEach((s, i) => {
      const id = XL.state.sheets[i].id;
      const grid = [];
      Object.entries(s.cells || {}).forEach(([key, raw]) => {
        const [r, c] = key.split(",").map(Number);
        while (grid.length <= r) grid.push([]);
        grid[r][c] = raw;
      });
      // Boş delikleri null ile doldur
      const content = grid.map((row) => Array.from(row || [], (v) => (v === undefined ? null : v)));
      if (content.length) XL.state.hf.setSheetContent(id, content);

      Object.entries(s.formats || {}).forEach(([key, fmt]) => {
        XL.state.formats[id + ":" + key] = fmt;
      });

      // Sayfa düzeni (sütun genişliği / satır yüksekliği / birleştirme) — içe aktarımda korunur.
      XL.state.layout[id] = {
        colWidths: Object.assign({}, s.colWidths),
        rowHeights: Object.assign({}, s.rowHeights),
        merges: Array.isArray(s.merges) ? s.merges.map((m) => m.slice()) : [],
      };
    });

    XL.state.page = data.page || null; // yazdırma düzeni (kenar boşluğu + üst/alt bilgi)

    XL.state.hf.clearUndoStack(); // yükleme geri alınabilir bir işlem olmasın
    const idx = Math.min(data.activeSheet || 0, XL.state.sheets.length - 1);
    XL.state.activeSheetId = XL.state.sheets[idx].id;
    XL.state.active = { r: 0, c: 0 };
    XL.state.sel = { r1: 0, c1: 0, r2: 0, c2: 0 };
  },

  // Motordaki durumu belge verisine çevir
  serialize() {
    const sheets = XL.state.sheets.map((s) => {
      const cells = {};
      const dims = XL.state.hf.getSheetDimensions(s.id);
      for (let r = 0; r < dims.height; r++)
        for (let c = 0; c < dims.width; c++) {
          const raw = this.getRaw(r, c, s.id);
          if (raw !== "") cells[r + "," + c] = raw;
        }
      const formats = {};
      const prefix = s.id + ":";
      Object.entries(XL.state.formats).forEach(([key, fmt]) => {
        if (key.startsWith(prefix)) formats[key.slice(prefix.length)] = fmt;
      });
      const out = { name: s.name, cells, formats };
      const lay = (XL.state.layout && XL.state.layout[s.id]) || {};
      if (lay.colWidths && Object.keys(lay.colWidths).length) out.colWidths = lay.colWidths;
      if (lay.rowHeights && Object.keys(lay.rowHeights).length) out.rowHeights = lay.rowHeights;
      if (lay.merges && lay.merges.length) out.merges = lay.merges.map((m) => m.slice());
      return out;
    });
    const activeSheet = Math.max(0, XL.state.sheets.findIndex((s) => s.id === XL.state.activeSheetId));
    const out = { rows: XL.ROWS, cols: XL.COLS, activeSheet, sheets };
    if (XL.state.page) out.page = XL.state.page;
    return out;
  },

  addSheet(name) {
    const hf = XL.state.hf;
    let candidate = name, n = 2;
    while (!hf.isItPossibleToAddSheet(candidate)) candidate = name + " (" + n++ + ")";
    const realName = hf.addSheet(candidate);
    const id = hf.getSheetId(realName);
    XL.state.sheets.push({ id, name: realName });
    return id;
  },

  renameSheet(id, newName) {
    try { XL.state.hf.renameSheet(id, newName); } catch (e) { return false; }
    const s = XL.state.sheets.find((x) => x.id === id);
    if (s) s.name = newName;
    return true;
  },

  removeSheet(id) {
    if (XL.state.sheets.length <= 1) return false;
    XL.state.hf.removeSheet(id);
    XL.state.sheets = XL.state.sheets.filter((s) => s.id !== id);
    Object.keys(XL.state.formats).forEach((k) => {
      if (k.startsWith(id + ":")) delete XL.state.formats[k];
    });
    if (XL.state.layout) delete XL.state.layout[id];
    return true;
  },

  // Ham içerik (formül dahil) — düzenleme için
  getRaw(r, c, id) {
    const sheet = id ?? XL.state.activeSheetId;
    const v = XL.state.hf.getCellSerialized({ sheet, row: r, col: c });
    return v === null || v === undefined ? "" : String(v);
  },

  // Hesaplanmış değer — gösterim için
  getValue(r, c, id) {
    const sheet = id ?? XL.state.activeSheetId;
    return XL.state.hf.getCellValue({ sheet, row: r, col: c });
  },

  setCell(r, c, raw, id) {
    const sheet = id ?? XL.state.activeSheetId;
    const content = raw === "" ? null : raw;
    return XL.state.hf.setCellContents({ sheet, row: r, col: c }, [[content]]);
  },

  undo() { if (XL.state.hf.isThereSomethingToUndo()) XL.state.hf.undo(); },
  redo() { if (XL.state.hf.isThereSomethingToRedo()) XL.state.hf.redo(); },

  getRangeValues(r1, c1, r2, c2, id) {
    const sheet = id ?? XL.state.activeSheetId;
    const out = [];
    for (let r = r1; r <= r2; r++) {
      const row = [];
      for (let c = c1; c <= c2; c++) row.push(XL.state.hf.getCellValue({ sheet, row: r, col: c }));
      out.push(row);
    }
    return out;
  },
};

/* Hata değeri mi? (HyperFormula DetailedCellError) */
XL.isError = function (v) {
  return v && typeof v === "object" && "value" in v && "type" in v;
};
