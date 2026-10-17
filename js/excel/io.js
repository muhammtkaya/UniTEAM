/* excel/io.js — .xlsx / .csv içe-dışa aktarma (SheetJS) */
XL.io = {
  // Dosyayı oku → Excel belge verisi döndür
  async readFile(file) {
    const buf = await XL.readAsArrayBuffer(file);
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellFormula: true, cellStyles: true });
    return this.workbookToData(wb);
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

  // Belge verisinden .xlsx indir (önce motordaki canlı durum serialize edilmiş olmalı)
  async save(data, filename) {
    const wb = XLSX.utils.book_new();
    const pg = data.page || null;
    const mode = XL.modes.xlsx;
    const margins = pg ? (typeof pg.margins === "object" ? pg.margins : (mode.MARGINS[pg.margins] || mode.MARGINS.normal)) : null;
    data.sheets.forEach((s, idx) => {
      const ws = {};
      let maxR = 0, maxC = 0;
      const sheetId = XL.state.sheets[idx] ? XL.state.sheets[idx].id : null;
      Object.entries(s.cells).forEach(([key, raw]) => {
        const [r, c] = key.split(",").map(Number);
        const addr = XLSX.utils.encode_cell({ r, c });
        if (raw.startsWith("=")) {
          const val = sheetId !== null ? XL.engine.getValue(r, c, sheetId) : null;
          if (typeof val === "number") ws[addr] = { t: "n", f: raw.slice(1), v: val };
          else if (typeof val === "boolean") ws[addr] = { t: "b", f: raw.slice(1), v: val };
          else ws[addr] = { t: "s", f: raw.slice(1), v: XL.isError(val) ? val.value : String(val ?? "") };
        } else if (raw.trim() !== "" && !isNaN(raw)) {
          ws[addr] = { t: "n", v: Number(raw) };
        } else if (raw === "TRUE" || raw === "FALSE") {
          ws[addr] = { t: "b", v: raw === "TRUE" };
        } else {
          ws[addr] = { t: "s", v: raw };
        }
        const f = (s.formats || {})[r + ":" + c];
        if (f && f.numfmt && ws[addr].t === "n") {
          ws[addr].z = { number: "#,##0.00", currency: '#,##0.00 "₺"', percent: "0.00%", date: "dd.mm.yyyy" }[f.numfmt];
        }
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      });

      // Sayfa düzeni: sütun genişliği / satır yüksekliği / birleştirmeler (px → SheetJS).
      if (s.colWidths && Object.keys(s.colWidths).length) {
        const cols = [];
        Object.entries(s.colWidths).forEach(([c, px]) => { cols[+c] = { wpx: px }; maxC = Math.max(maxC, +c); });
        for (let i = 0; i < cols.length; i++) if (!cols[i]) cols[i] = {};
        ws["!cols"] = cols;
      }
      if (s.rowHeights && Object.keys(s.rowHeights).length) {
        const rows = [];
        Object.entries(s.rowHeights).forEach(([r, px]) => { rows[+r] = { hpx: px }; maxR = Math.max(maxR, +r); });
        for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = {};
        ws["!rows"] = rows;
      }
      if (Array.isArray(s.merges) && s.merges.length) {
        ws["!merges"] = s.merges.map(([r1, c1, r2, c2]) => {
          maxR = Math.max(maxR, r2); maxC = Math.max(maxC, c2);
          return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } };
        });
      }

      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      if (margins) ws["!margins"] = Object.assign({}, margins);
      XLSX.utils.book_append_sheet(wb, ws, s.name.substring(0, 31));
    });

    // Üst/alt bilgi metni SheetJS ile yazılamadığından oluşan .xlsx'e doğrudan enjekte edilir
    const hasHF = pg && [pg.header, pg.footer].some((o) => o && (o.l || o.c || o.r));
    if (!hasHF) return XLSX.writeFile(wb, filename);

    const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = await this.injectHeaderFooter(ab, pg);
    XL.download(blob, filename);
  },

  // Oluşan .xlsx paketindeki her çalışma sayfasına <headerFooter> ekle (JSZip ile)
  async injectHeaderFooter(arrayBuffer, pg) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlEsc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // &L/&C/&R bölüm kodları + kullanıcı metni (ör. &P sayfa no); sonra tümü XML için kaçışlanır
    const code = (o) => xmlEsc(`&L${o.l || ""}&C${o.c || ""}&R${o.r || ""}`);
    let hf = "<headerFooter>";
    if (pg.header && (pg.header.l || pg.header.c || pg.header.r)) hf += `<oddHeader>${code(pg.header)}</oddHeader>`;
    if (pg.footer && (pg.footer.l || pg.footer.c || pg.footer.r)) hf += `<oddFooter>${code(pg.footer)}</oddFooter>`;
    hf += "</headerFooter>";

    const files = Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
    for (const p of files) {
      let xml = await zip.file(p).async("string");
      if (xml.includes("<headerFooter")) continue;
      // Şema sırası: headerFooter, pageMargins'ten sonra gelmeli
      if (/<pageMargins[^>]*\/>/.test(xml)) xml = xml.replace(/(<pageMargins[^>]*\/>)/, "$1" + hf);
      else xml = xml.replace("</worksheet>", hf + "</worksheet>");
      zip.file(p, xml);
    }
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
