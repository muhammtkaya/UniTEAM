/* excel/io.js — .xlsx / .csv içe-dışa aktarma
 * OKUMA: değer/formül/düzen = SheetJS; font/dolgu/hizalama STİLİ = ExcelJS katmanı.
 *   (SheetJS community bu stilleri okumuyordu → içe aktarımda sessizce kaybolurdu.
 *    Değer okuması SheetJS'te bırakıldı → corpus/fidelity sadakati aynen korunur;
 *    ExcelJS yalnız metni ETKİLEMEYEN görsel stilleri ekler = sıfır metin riski.)
 * CSV: SheetJS. YAZMA: ExcelJS. */
XL.io = {
  // Dosyayı oku → Excel belge verisi döndür
  async readFile(file) {
    const buf = await XL.readAsArrayBuffer(file);
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellFormula: true, cellStyles: true });
    const data = this.workbookToData(wb);
    // Aynı buffer'ı ExcelJS ile de aç → font/dolgu/hizalama stillerini formats'a birleştir.
    try { await this._readStyles(buf, data); } catch (e) { /* stil okunamazsa değerler yine gelir */ }
    return data;
  },

  /* =====================================================================
   *  STİL OKUMA (ExcelJS) — font / dolgu / hizalama
   *  SheetJS'in kurduğu `formats` haritasının ÜSTÜNE eklenir; mevcut anahtarlar
   *  (örn. SheetJS'ten gelen numfmt) korunur. Yalnız metni etkilemeyen görsel
   *  alanlar (bold/italic/underline/color/bg/align) yazılır.
   * ===================================================================== */
  async _readStyles(buf, data) {
    if (typeof ExcelJS === "undefined" || !ExcelJS.Workbook) return;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    wb.worksheets.forEach((ws, idx) => {
      const sheet = data.sheets[idx];
      if (!sheet) return;
      const formats = sheet.formats || (sheet.formats = {});
      ws.eachRow({ includeEmpty: false }, (row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const f = this._styleFromCell(cell);
          if (!f) return;
          const key = (rn - 1) + ":" + (cn - 1);
          // f'yi önce koy, mevcut (SheetJS) alanları üstüne yaz → numfmt vb. korunur.
          formats[key] = Object.assign({}, f, formats[key]);
        });
      });
    });
  },

  // ExcelJS renk nesnesi → #rrggbb. Yalnız açık ARGB desteklenir (theme/indexed v1'de atlanır).
  _hexFromColor(color) {
    if (!color || typeof color.argb !== "string") return null;
    const h = color.argb;
    if (/^[0-9a-fA-F]{8}$/.test(h)) return "#" + h.slice(2).toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
    return null;
  },

  // ExcelJS hücresinden görsel biçim nesnesi ({bold,italic,underline,color,bg,align}) çıkar
  _styleFromCell(cell) {
    const f = {};
    const font = cell.font;
    if (font) {
      if (font.bold) f.bold = true;
      if (font.italic) f.italic = true;
      if (font.underline) f.underline = true;      // string ('single') veya true olabilir
      const col = this._hexFromColor(font.color);
      if (col && col !== "#000000") f.color = col;  // varsayılan siyah metni gürültü yapmamak için atla
    }
    const fill = cell.fill;
    if (fill && fill.type === "pattern" && fill.pattern === "solid") {
      const bg = this._hexFromColor(fill.fgColor);
      if (bg) f.bg = bg;
    }
    const al = cell.alignment;
    if (al && /^(left|center|right)$/.test(al.horizontal || "")) f.align = al.horizontal;
    return Object.keys(f).length ? f : null;
  },

  workbookToData(wb) {
    let maxRows = 0, maxCols = 0;
    const sheets = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const cells = {}, formats = {};
      if (ws["!ref"]) {
        const range = XLSX.utils.decode_range(ws["!ref"]);
        maxRows = Math.max(maxRows, range.e.r + 1);
        maxCols = Math.max(maxCols, range.e.c + 1);
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell) continue;
            let raw;
            if (cell.f) raw = "=" + cell.f;
            else if (cell.t === "n") raw = String(cell.v);
            else if (cell.t === "b") raw = cell.v ? "TRUE" : "FALSE";
            else if (cell.t === "d") raw = cell.w || String(cell.v);
            else raw = cell.v != null ? String(cell.v) : "";
            if (raw !== "") cells[r + "," + c] = raw;

            // Basit sayı biçimi tahmini
            const z = cell.z || "";
            if (cell.t === "n" && z) {
              if (z.includes("%")) formats[r + ":" + c] = { numfmt: "percent" };
              else if (/[dmy]{1,4}/i.test(z) && !/[#0]/.test(z)) formats[r + ":" + c] = { numfmt: "date" };
              else if (/[₺$€£]|TL/.test(z)) formats[r + ":" + c] = { numfmt: "currency" };
            }
          }
        }
      }
      // Sayfa düzeni: sütun genişliği (px) / satır yüksekliği (px) / birleştirmeler.
      // (Daha önce okunmuyordu → içe aktarımda kaybolurdu.)
      const colWidths = {}, rowHeights = {};
      (ws["!cols"] || []).forEach((col, c) => {
        if (!col) return;
        const px = col.wpx != null ? col.wpx : (col.width != null ? col.width * 7 : null);
        if (px) colWidths[c] = Math.round(px);
      });
      (ws["!rows"] || []).forEach((row, r) => {
        if (!row) return;
        const px = row.hpx != null ? row.hpx : (row.hpt != null ? row.hpt * 96 / 72 : null);
        if (px) rowHeights[r] = Math.round(px);
      });
      const merges = (ws["!merges"] || []).map((m) => [m.s.r, m.s.c, m.e.r, m.e.c]);

      return { name, cells, formats, colWidths, rowHeights, merges };
    });

    // Yazdırma kenar boşluğunu geri oku (ilk sayfadan); üst/alt bilgi metni SheetJS'te taşınmaz
    let page = null;
    const m0 = wb.Sheets[wb.SheetNames[0]] && wb.Sheets[wb.SheetNames[0]]["!margins"];
    if (m0) {
      const mode = XL.modes.xlsx;
      const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.02;
      const preset = Object.keys(mode.MARGINS).find((k) => {
        const p = mode.MARGINS[k];
        return near(p.left, m0.left) && near(p.right, m0.right) && near(p.top, m0.top) && near(p.bottom, m0.bottom);
      });
      page = Object.assign(mode.defaultPage(), {
        margins: preset || { left: m0.left, right: m0.right, top: m0.top, bottom: m0.bottom, header: m0.header || 0.3, footer: m0.footer || 0.3 },
      });
    }

    const out = {
      rows: Math.min(Math.max(maxRows + 20, 100), 1000),
      cols: Math.min(Math.max(maxCols + 3, 26), 100),
      activeSheet: 0,
      sheets: sheets.length ? sheets : [{ name: "Sayfa1", cells: {}, formats: {} }],
    };
    if (page) out.page = page;
    return out;
  },

  /* =====================================================================
   *  DIŞA AKTARMA (.xlsx) — ExcelJS
   *  SheetJS community font/dolgu/hizalama stillerini YAZAMIYORDU; ExcelJS yazar.
   *  Değer/formül/sayı biçimi + birleştirme + sütun/satır boyutu + kenar boşluğu +
   *  üst/alt bilgi + KALIN/İTALİK/ALTI ÇİZİLİ/RENK/DOLGU/HİZALAMA aktarılır.
   * ===================================================================== */

  // #rrggbb / #rgb → ExcelJS ARGB ("FFRRGGBB")
  argb(hex) {
    let h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "FF" + h.toUpperCase();
    return "FF000000";
  },

  _numFmtString(numfmt) {
    return { number: "#,##0.00", currency: '#,##0.00 "₺"', percent: "0.00%", date: "dd.mm.yyyy" }[numfmt] || null;
  },

  // Bir biçim nesnesini ({bold,italic,underline,color,bg,align,numfmt}) ExcelJS hücresine uygula
  applyCellStyle(cell, f) {
    if (!f) return;
    const font = {};
    if (f.bold) font.bold = true;
    if (f.italic) font.italic = true;
    if (f.underline) font.underline = true;
    if (f.color) font.color = { argb: this.argb(f.color) };
    if (Object.keys(font).length) cell.font = font;
    if (f.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: this.argb(f.bg) } };
    if (f.align) cell.alignment = Object.assign({}, cell.alignment, { horizontal: f.align });
    if (f.numfmt) { const z = this._numFmtString(f.numfmt); if (z) cell.numFmt = z; }
  },

  // Belge verisinden ExcelJS Workbook kur (saf; indirmez — test de kullanır)
  async buildWorkbook(data) {
    const wb = new ExcelJS.Workbook();
    wb.creator = XL.APP_NAME || "UniTEAM";
    wb.created = new Date();
    const pg = data.page || null;
    const mode = XL.modes.xlsx;
    const margins = pg ? (typeof pg.margins === "object" ? pg.margins : (mode.MARGINS[pg.margins] || mode.MARGINS.normal)) : null;

    data.sheets.forEach((s, idx) => {
      const ws = wb.addWorksheet((s.name || ("Sayfa" + (idx + 1))).substring(0, 31));
      const sheetId = XL.state.sheets[idx] ? XL.state.sheets[idx].id : null;

      Object.entries(s.cells).forEach(([key, raw]) => {
        const [r, c] = key.split(",").map(Number);
        const cell = ws.getCell(r + 1, c + 1);   // ExcelJS 1-tabanlı
        if (raw.startsWith("=")) {
          const val = sheetId !== null ? XL.engine.getValue(r, c, sheetId) : null;
          const result = XL.isError(val) ? { error: val.value } : (val == null ? null : val);
          cell.value = { formula: raw.slice(1), result };
        } else if (raw.trim() !== "" && !isNaN(raw)) {
          cell.value = Number(raw);
        } else if (raw === "TRUE" || raw === "FALSE") {
          cell.value = raw === "TRUE";
        } else {
          cell.value = raw;
        }
        this.applyCellStyle(cell, (s.formats || {})[r + ":" + c]);
      });

      // Değeri olmayan ama biçimli (boş ama stilli) hücreler de stillensin
      Object.entries(s.formats || {}).forEach(([fk, f]) => {
        const [r, c] = fk.split(":").map(Number);
        if (!(s.cells && s.cells[r + "," + c])) this.applyCellStyle(ws.getCell(r + 1, c + 1), f);
      });

      // Sütun genişliği (px → ~Excel karakter genişliği) / satır yüksekliği (px → punto)
      if (s.colWidths) Object.entries(s.colWidths).forEach(([c, px]) => { ws.getColumn(+c + 1).width = Math.round((px / 7) * 100) / 100; });
      if (s.rowHeights) Object.entries(s.rowHeights).forEach(([r, px]) => { ws.getRow(+r + 1).height = Math.round((px * 72 / 96) * 100) / 100; });
      if (Array.isArray(s.merges)) s.merges.forEach(([r1, c1, r2, c2]) => { try { ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1); } catch (e) {} });

      if (margins) ws.pageSetup = Object.assign({}, ws.pageSetup, {
        margins: { left: margins.left, right: margins.right, top: margins.top, bottom: margins.bottom, header: margins.header || 0.3, footer: margins.footer || 0.3 },
      });
      // Üst/alt bilgi (&L/&C/&R bölüm kodları) — ExcelJS yerel olarak yazar
      const hf = (o) => `&L${o.l || ""}&C${o.c || ""}&R${o.r || ""}`;
      if (pg && pg.header && (pg.header.l || pg.header.c || pg.header.r)) ws.headerFooter.oddHeader = hf(pg.header);
      if (pg && pg.footer && (pg.footer.l || pg.footer.c || pg.footer.r)) ws.headerFooter.oddFooter = hf(pg.footer);
    });
    return wb;
  },

  // Belge verisinden .xlsx Blob
  async buildBlob(data) {
    const wb = await this.buildWorkbook(data);
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  },

  // Belge verisinden .xlsx indir (önce motordaki canlı durum serialize edilmiş olmalı)
  async save(data, filename) {
    XL.download(await this.buildBlob(data), filename);
  },

  // Etkin sayfayı CSV olarak indir
  saveCSV(filename) {
    const dims = XL.state.hf.getSheetDimensions(XL.state.activeSheetId);
    const lines = [];
    for (let r = 0; r < dims.height; r++) {
      const row = [];
      for (let c = 0; c < dims.width; c++) {
        let v = XL.engine.getValue(r, c);
        v = XL.isError(v) ? v.value : (v ?? "");
        v = String(v);
        row.push(/[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
      }
      lines.push(row.join(","));
    }
    XL.download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), filename);
  },
};
