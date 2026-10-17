/* excel/layout.js — sayfa düzeni: sütun genişliği, satır yüksekliği, birleştirilmiş hücreler
 *
 * Bu üç özellik .xlsx dosyalarında bulunur (ws['!cols'], ws['!rows'], ws['!merges'])
 * ama uygulama modelinde yoktu → içe aktarımda SESSİZCE KAYBOLUYORDU (sadakat boşluğu).
 * Artık belge verisine iliştirilip (engine.load/serialize) round-trip ile korunur ve
 * ızgarada çizilir; kullanıcı da sütun/satır kenarını sürükleyip birleştirebilir.
 *
 * Depo (etkin sayfaya göre):
 *   XL.state.layout[sheetId] = { colWidths:{c:px}, rowHeights:{r:px}, merges:[[r1,c1,r2,c2]] }
 * merges = üst-sol/alt-sağ köşe (dahil) olarak dört sayı.
 */
XL.sheetLayout = {
  DEF_COL: 80, DEF_ROW: 22,   // css #grid td varsayılanlarıyla uyumlu

  of(id) {
    id = id ?? XL.state.activeSheetId;
    const all = XL.state.layout || (XL.state.layout = {});
    return all[id] || (all[id] = { colWidths: {}, rowHeights: {}, merges: [] });
  },

  colWidth(c, id) { return this.of(id).colWidths[c] || this.DEF_COL; },
  rowHeight(r, id) { return this.of(id).rowHeights[r] || this.DEF_ROW; },
  setColWidth(c, px, id) { this.of(id).colWidths[c] = Math.max(24, Math.round(px)); },
  setRowHeight(r, px, id) { this.of(id).rowHeights[r] = Math.max(16, Math.round(px)); },

  /* ---- Birleştirme sorguları ---- */
  // (r,c)'yi kapsayan birleştirme aralığı [r1,c1,r2,c2] ya da null.
  mergeAt(r, c, id) {
    for (const m of this.of(id).merges) if (r >= m[0] && r <= m[2] && c >= m[1] && c <= m[3]) return m;
    return null;
  },
  // (r,c) bir birleşmenin ÜST-SOL köşesi (çizilen hücre) mi?
  isAnchor(r, c, id) { const m = this.mergeAt(r, c, id); return !!m && m[0] === r && m[1] === c; },
  // (r,c) bir birleşmenin kapsanan (gizli) hücresi mi?
  isCovered(r, c, id) { const m = this.mergeAt(r, c, id); return !!m && !(m[0] === r && m[1] === c); },
  _overlap(m, b) { return !(m[2] < b.r1 || m[0] > b.r2 || m[3] < b.c1 || m[1] > b.c2); },
  hasMerge() { const b = XL.modes.xlsx.bounds(); return this.of().merges.some((m) => this._overlap(m, b)); },

  /* ---- Birleştir / çöz (şerit: "Birleştir ve Ortala") ---- */
  toggleMerge() {
    if (XL.ws && XL.ws.isReadonly && XL.ws.isReadonly()) return;
    const b = XL.modes.xlsx.bounds();
    const lay = this.of();
    const existing = lay.merges.filter((m) => this._overlap(m, b));
    if (existing.length) {
      lay.merges = lay.merges.filter((m) => !this._overlap(m, b));   // çöz
    } else {
      if (b.r1 === b.r2 && b.c1 === b.c2) return;                    // tek hücre birleştirilmez
      for (let r = b.r1; r <= b.r2; r++)
        for (let c = b.c1; c <= b.c2; c++)
          if (!(r === b.r1 && c === b.c1)) XL.engine.setCell(r, c, "");   // üst-sol dışındakini temizle
      lay.merges.push([b.r1, b.c1, b.r2, b.c2]);
      XL.setFormat(b.r1, b.c1, { align: "center" });                // Excel "birleştir ve ortala"
    }
    XL.grid.build();
    XL.modes.xlsx.applyView();
    XL.state.active = { r: b.r1, c: b.c1 };
    XL.state.sel = { r1: b.r1, c1: b.c1, r2: b.r2, c2: b.c2 };
    XL.grid.updateSelection();
    XL.ws.changed();
  },

  /* ---- Izgaraya uygula (build sonrası) ---- */
  applyToGrid() {
    const t = XL.grid.table;
    if (!t) return;
    const lay = this.of();
    // Sütun genişlikleri: table-layout:fixed → thead th genişliği sütunu belirler.
    Object.entries(lay.colWidths).forEach(([c, px]) => {
      const th = t.querySelector(`thead th[data-c="${c}"]`);
      if (th) th.style.cssText += `;width:${px}px;min-width:${px}px;max-width:${px}px`;
    });
    // Satır yükseklikleri: tbody tr'ye yükseklik ver.
    Object.entries(lay.rowHeights).forEach(([r, px]) => {
      const tr = t.querySelectorAll("tbody tr")[+r];
      if (tr) tr.style.height = px + "px";
    });
    // Birleştirmeler: üst-sol hücre span alır, kapsananlar gizlenir (CSS sınıfı → render'da silinmez).
    for (const m of lay.merges) {
      const [r1, c1, r2, c2] = m;
      const anchor = XL.grid.cells[r1] && XL.grid.cells[r1][c1];
      if (!anchor) continue;
      anchor.colSpan = c2 - c1 + 1;
      anchor.rowSpan = r2 - r1 + 1;
      anchor.classList.add("merged");
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) {
          if (r === r1 && c === c1) continue;
          const td = XL.grid.cells[r] && XL.grid.cells[r][c];
          if (td) { td.classList.add("merged-cover"); td.colSpan = 1; td.rowSpan = 1; }
        }
    }
  },

  /* ---- Satır/sütun ekle-sil sonrası kaydır (veri bozulmasın) ---- */
  shift(axis, at, delta, id) {
    const lay = this.of(id);
    const key = axis === "row" ? "rowHeights" : "colWidths";
    const sized = {};
    Object.entries(lay[key]).forEach(([k, px]) => {
      let v = +k;
      if (delta < 0 && v >= at && v < at - delta) return;   // silinen
      if (v >= at) v += delta;
      sized[v] = px;
    });
    lay[key] = sized;
    lay.merges = lay.merges.map((m) => {
      let [r1, c1, r2, c2] = m;
      if (axis === "row") {
        if (delta < 0 && r1 >= at && r2 < at - delta) return null;   // tümü silindi
        if (r1 >= at) r1 += delta; if (r2 >= at) r2 += delta;
      } else {
        if (delta < 0 && c1 >= at && c2 < at - delta) return null;
        if (c1 >= at) c1 += delta; if (c2 >= at) c2 += delta;
      }
      return (r2 > r1 || c2 > c1) ? [r1, c1, r2, c2] : null;   // dejenere birleşmeyi at
    }).filter(Boolean);
  },
};
