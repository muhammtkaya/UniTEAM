/* excel/charts.js — seçili aralıktan grafik (Chart.js) */
XL.charts = {
  current: null,

  open() {
    const s = XL.state.sel;
    const r1 = Math.min(s.r1, s.r2), c1 = Math.min(s.c1, s.c2);
    const r2 = Math.max(s.r1, s.r2), c2 = Math.max(s.c1, s.c2);
    if (r1 === r2 && c1 === c2) {
      alert("Grafik için önce veri aralığı seçin (örn. A1:B6).");
      return;
    }
    const data = XL.engine.getRangeValues(r1, c1, r2, c2);

    XL.showPanel("Grafik", `
      <label>Tür:
        <select id="chart-type">
          <option value="bar">Çubuk</option>
          <option value="line">Çizgi</option>
          <option value="pie">Pasta</option>
          <option value="doughnut">Halka</option>
          <option value="radar">Radar</option>
          <option value="polarArea">Kutupsal alan</option>
          <option value="scatter">Dağılım (XY)</option>
          <option value="area">Alan</option>
          <option value="hbar">Yatay çubuk</option>
        </select>
      </label>
      <label><input type="checkbox" id="chart-hasheader" checked> İlk satır başlık</label>
      <button id="chart-draw">Çiz</button>
      <button id="chart-png">PNG indir</button>
      <div style="margin-top:10px;height:300px;position:relative;">
        <canvas id="chart-canvas"></canvas>
      </div>
    `);

    const draw = () => this.draw(data);
    document.getElementById("chart-draw").onclick = draw;
    document.getElementById("chart-type").onchange = draw;
    document.getElementById("chart-hasheader").onchange = draw;
    document.getElementById("chart-png").onclick = () => {
      if (!this.current) return;
      const a = document.createElement("a");
      a.href = this.current.toBase64Image();
      a.download = "grafik.png";
      a.click();
    };
    draw();
  },

  draw(data) {
    const choice = document.getElementById("chart-type").value;
    // Chart.js'te ayrı tür olmayan seçenekleri eşle
    const type = choice === "area" ? "line" : choice === "hbar" ? "bar" : choice;
    const hasHeader = document.getElementById("chart-hasheader").checked;

    let rows = data.slice();
    let headers = null;
    if (hasHeader && rows.length > 1) { headers = rows[0]; rows = rows.slice(1); }

    // İlk sütun = etiketler, kalan sütunlar = seriler
    const labels = rows.map((r) => this.text(r[0]));
    const seriesCount = Math.max(1, (rows[0] ? rows[0].length : 1) - 1);

    const palette = ["#107c41","#2e75b6","#c55a11","#7030a0","#bf9000","#548235"];
    const perPoint = type === "pie" || type === "doughnut" || type === "polarArea";
    const datasets = [];
    for (let si = 0; si < seriesCount; si++) {
      const color = palette[si % palette.length];
      datasets.push({
        label: headers ? this.text(headers[si + 1]) : "Seri " + (si + 1),
        // Dağılımda ilk sütun X, diğerleri Y
        data: type === "scatter"
          ? rows.map((r) => ({ x: this.num(r[0]), y: this.num(r[si + 1]) }))
          : rows.map((r) => this.num(r[si + 1])),
        backgroundColor: perPoint
          ? labels.map((_, i) => palette[i % palette.length])
          : choice === "area" ? color + "55" : color,
        borderColor: color,
        borderWidth: perPoint ? 1 : 2,
        fill: choice === "area",
        tension: 0.25,
      });
    }

    if (this.current) this.current.destroy();
    const ctx = document.getElementById("chart-canvas").getContext("2d");
    this.current = new Chart(ctx, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: choice === "hbar" ? "y" : "x",
      },
    });
  },

  text(v) { return XL.isError(v) ? "" : (v == null ? "" : String(v)); },
  num(v) { return typeof v === "number" ? v : (XL.isError(v) ? 0 : (parseFloat(v) || 0)); },
};
