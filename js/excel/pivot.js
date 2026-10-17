/* excel/pivot.js — özet tablo (seçili aralık, ilk satır başlık) */
XL.pivot = {
  open() {
    const s = XL.state.sel;
    const r1 = Math.min(s.r1, s.r2), c1 = Math.min(s.c1, s.c2);
    const r2 = Math.max(s.r1, s.r2), c2 = Math.max(s.c1, s.c2);
    if (r2 - r1 < 2 || c2 - c1 < 1) {
      alert(XL.t("Pivot için başlık satırı + en az 2 veri satırı ve 2 sütun seçin.", "Select a header row + at least 2 data rows and 2 columns for the pivot."));
      return;
    }
    const data = XL.engine.getRangeValues(r1, c1, r2, c2);
    const headers = data[0].map((h) => XL.charts.text(h) || XL.t("Sütun", "Column"));
    const body = data.slice(1);

    const opts = headers.map((h, i) => `<option value="${i}">${h}</option>`).join("");
    XL.showPanel(XL.t("Özet Tablo (Pivot)", "PivotTable"), `
      <label>${XL.t("Satır:", "Row:")} <select id="pv-row">${opts}</select></label>
      <label>${XL.t("Sütun:", "Column:")} <select id="pv-col"><option value="-1">${XL.t("(yok)", "(none)")}</option>${opts}</select></label>
      <label>${XL.t("Değer:", "Value:")} <select id="pv-val">${opts}</select></label>
      <label>${XL.t("İşlev:", "Function:")}
        <select id="pv-agg">
          <option value="sum">${XL.t("Topla", "Sum")}</option>
          <option value="count">${XL.t("Say", "Count")}</option>
          <option value="avg">${XL.t("Ortalama", "Average")}</option>
          <option value="max">${XL.t("Maks", "Max")}</option>
          <option value="min">${XL.t("Min", "Min")}</option>
        </select>
      </label>
      <button id="pv-build">${XL.t("Oluştur", "Build")}</button>
      <button id="pv-sheet">${XL.t("Yeni sayfaya yaz", "Write to new sheet")}</button>
      <div id="pv-out"></div>
    `);
    document.getElementById("pv-sheet").onclick = () => this.writeToSheet();
    document.getElementById("pv-col").value = headers.length > 1 ? "1" : "-1";
    document.getElementById("pv-val").value = headers.length > 2 ? "2" : "0";

    const build = () => this.build(headers, body);
    document.getElementById("pv-build").onclick = build;
    build();
  },

  build(headers, body) {
    const rowF = +document.getElementById("pv-row").value;
    const colF = +document.getElementById("pv-col").value;
    const valF = +document.getElementById("pv-val").value;
    const agg = document.getElementById("pv-agg").value;

    const rowKeys = [], colKeys = [];
    const buckets = {}; // "row||col" -> sayı dizisi

    body.forEach((row) => {
      const rk = XL.charts.text(row[rowF]);
      const ck = colF >= 0 ? XL.charts.text(row[colF]) : XL.t("Toplam", "Total");
      if (!rowKeys.includes(rk)) rowKeys.push(rk);
      if (!colKeys.includes(ck)) colKeys.push(ck);
      const key = rk + "||" + ck;
      (buckets[key] = buckets[key] || []).push(XL.charts.num(row[valF]));
    });

    const calc = (arr) => {
      if (!arr || !arr.length) return "";
      switch (agg) {
        case "count": return arr.length;
        case "avg": return (arr.reduce((a, b) => a + b, 0) / arr.length);
        case "max": return Math.max(...arr);
        case "min": return Math.min(...arr);
        default: return arr.reduce((a, b) => a + b, 0);
      }
    };
    const loc = XL.i18n && XL.i18n.locale === "en" ? "en-US" : "tr-TR";
    const fmt = (v) => typeof v === "number" ? v.toLocaleString(loc, { maximumFractionDigits: 2 }) : XL.esc(v);
    const GT = XL.t("Genel Toplam", "Grand Total");

    // Sayfaya yazmak için ham matris
    const matrix = [[headers[rowF] + " \\ " + (colF >= 0 ? headers[colF] : ""), ...colKeys, GT]];
    rowKeys.forEach((rk) => {
      let all = [];
      const line = [rk];
      colKeys.forEach((ck) => {
        const arr = buckets[rk + "||" + ck] || [];
        all = all.concat(arr);
        line.push(calc(arr));
      });
      line.push(calc(all));
      matrix.push(line);
    });
    this.lastMatrix = matrix;

    let html = "<table><thead><tr><th></th>";
    colKeys.forEach((ck) => html += `<th>${XL.esc(ck)}</th>`);
    html += `<th>${GT}</th></tr></thead><tbody>`;

    rowKeys.forEach((rk) => {
      html += `<tr><th>${XL.esc(rk)}</th>`;
      let rowAll = [];
      colKeys.forEach((ck) => {
        const arr = buckets[rk + "||" + ck] || [];
        rowAll = rowAll.concat(arr);
        html += `<td style="text-align:right">${fmt(calc(arr))}</td>`;
      });
      html += `<td style="text-align:right"><b>${fmt(calc(rowAll))}</b></td></tr>`;
    });

    // Genel toplam satırı
    html += `<tr><th>${GT}</th>`;
    let grand = [];
    colKeys.forEach((ck) => {
      let colAll = [];
      rowKeys.forEach((rk) => { colAll = colAll.concat(buckets[rk + "||" + ck] || []); });
      grand = grand.concat(colAll);
      html += `<td style="text-align:right"><b>${fmt(calc(colAll))}</b></td>`;
    });
    html += `<td style="text-align:right"><b>${fmt(calc(grand))}</b></td></tr>`;
    html += "</tbody></table>";

    document.getElementById("pv-out").innerHTML = html;
  },

  // Son pivot sonucunu yeni bir sayfaya değer olarak yaz
  writeToSheet() {
    if (!this.lastMatrix) return;
    const id = XL.engine.addSheet("Pivot");
    this.lastMatrix.forEach((row, r) => {
      row.forEach((v, c) => {
        if (v === "" || v == null) return;
        XL.engine.setCell(r, c, String(v), id);
        if (r === 0 || c === 0) XL.setFormat(r, c, { bold: true, bg: "#e2efda" }, id);
      });
    });
    XL.hidePanel();
    XL.modes.xlsx.switchSheet(id);
  },
};
