/* excel/condfmt.js — Koşullu biçimlendirme (conditional formatting)  [Faz 6]
 *
 * Değere göre hücre stilini (dolgu/yazı/kalın, renk ölçeği, veri çubuğu) dinamik
 * olarak değiştirir. Kurallar belge verisinde (per-sheet) saklanır; grid her
 * render'da bu modüle sorar. Not: SheetJS community .xlsx yazımında koşullu
 * biçimi desteklemez → kurallar UYGULAMA İÇİNDE çalışır, .xlsx'e aktarılmaz.
 *
 * Kural şekli: { id, range:[r1,c1,r2,c2], kind, ... }
 *   kind "cell":  { op:'gt'|'lt'|'eq'|'between'|'contains', v1, v2, style:{bg,color,bold} }
 *   kind "scale": 2 renk arası gradyan (min→max)         { lo, hi }  (hex renkler)
 *   kind "databar": değerle orantılı yatay çubuk           { color }
 */
XL.condfmt = {
  _sid() { return XL.state.activeSheetId; },
  rules(sid) { return (XL.state.condfmt && XL.state.condfmt[sid ?? this._sid()]) || []; },
  _ensure(sid) {
    if (!XL.state.condfmt) XL.state.condfmt = {};
    sid = sid ?? this._sid();
    if (!XL.state.condfmt[sid]) XL.state.condfmt[sid] = [];
    return XL.state.condfmt[sid];
  },

  add(rule) { const a = this._ensure(); rule.id = "cf" + Date.now() + Math.random().toString(36).slice(2, 6); a.push(rule); this._refresh(); },
  remove(id) { const a = this._ensure(); const i = a.findIndex((r) => r.id === id); if (i >= 0) a.splice(i, 1); this._refresh(); },
  _refresh() { if (XL.grid && XL.grid.render) { XL.grid.render(); XL.grid.updateSelection && XL.grid.updateSelection(); } if (XL.ws && XL.ws.changed) XL.ws.changed(); },

  _inRange(r, c, [r1, c1, r2, c2]) { return r >= Math.min(r1, r2) && r <= Math.max(r1, r2) && c >= Math.min(c1, c2) && c <= Math.max(c1, c2); },

  // Bir aralıktaki sayısal min/max (ölçek/çubuk için).
  _stats(range) {
    let min = Infinity, max = -Infinity;
    const [r1, c1, r2, c2] = range;
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const v = XL.engine.getValue(r, c);
        if (typeof v === "number" && isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
      }
    return min === Infinity ? null : { min, max };
  },

  _lerp(a, b, t) { return Math.round(a + (b - a) * t); },
  _hex(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; },
  _mix(lo, hi, t) { const a = this._hex(lo), b = this._hex(hi); return `rgb(${this._lerp(a[0], b[0], t)},${this._lerp(a[1], b[1], t)},${this._lerp(a[2], b[2], t)})`; },

  // (r,c) için koşullu stil → {bg?, color?, bold?, bar?, barColor?} veya null.
  styleFor(r, c, val) {
    const rules = this.rules();
    if (!rules.length) return null;
    let out = null;
    for (const rule of rules) {
      if (!this._inRange(r, c, rule.range)) continue;
      if (rule.kind === "cell") {
        if (this._match(rule, val)) out = Object.assign(out || {}, rule.style);
      } else if (rule.kind === "scale") {
        if (typeof val !== "number") continue;
        const st = this._stats(rule.range); if (!st || st.max === st.min) continue;
        const t = Math.max(0, Math.min(1, (val - st.min) / (st.max - st.min)));
        out = Object.assign(out || {}, { bg: this._mix(rule.lo || "#f8696b", rule.hi || "#63be7b", t) });
      } else if (rule.kind === "databar") {
        if (typeof val !== "number") continue;
        const st = this._stats(rule.range); if (!st || st.max <= 0) continue;
        const pct = Math.max(0, Math.min(100, (val / st.max) * 100));
        out = Object.assign(out || {}, { bar: pct, barColor: rule.color || "#63be7b" });
      }
    }
    return out;
  },

  _match(rule, val) {
    if (rule.op === "contains") return String(val).toLowerCase().includes(String(rule.v1).toLowerCase());
    const n = typeof val === "number" ? val : parseFloat(val);
    if (!isFinite(n)) return false;
    const a = parseFloat(rule.v1), b = parseFloat(rule.v2);
    switch (rule.op) {
      case "gt": return n > a;
      case "lt": return n < a;
      case "eq": return n === a;
      case "between": return n >= Math.min(a, b) && n <= Math.max(a, b);
      default: return false;
    }
  },

  // grid.renderCell'den çağrılır: td'ye koşullu stili uygula (styleCell'den SONRA).
  applyCell(td, r, c, val) {
    const s = this.styleFor(r, c, val);
    if (!s) return;
    if (s.bg) td.style.background = s.bg;
    if (s.color) td.style.color = s.color;
    if (s.bold) td.style.fontWeight = "700";
    if (s.bar != null) {
      td.style.background = `linear-gradient(to right, ${s.barColor} ${s.bar}%, transparent ${s.bar}%)`;
    }
  },

  /* ---------- UI ---------- */
  selRange() { const s = XL.state.sel; return [s.r1, s.c1, s.r2, s.c2]; },
  rangeLabel(rg) { return XL.addrLabel(Math.min(rg[0], rg[2]), Math.min(rg[1], rg[3])) + ":" + XL.addrLabel(Math.max(rg[0], rg[2]), Math.max(rg[1], rg[3])); },

  openPanel() {
    const rg = this.selRange();
    XL.showPanel(XL.t("Koşullu Biçimlendirme", "Conditional Formatting"), `
      <div class="cf-ui">
        <p class="muted">${XL.t("Seçili aralık", "Selected range")}: <b>${this.rangeLabel(rg)}</b></p>
        <div class="cf-form">
          <select id="cf-kind">
            <option value="cell">${XL.t("Hücre değeri kuralı", "Cell value rule")}</option>
            <option value="scale">${XL.t("Renk ölçeği (min→max)", "Color scale (min→max)")}</option>
            <option value="databar">${XL.t("Veri çubuğu", "Data bar")}</option>
          </select>
          <div id="cf-cell-opts">
            <select id="cf-op">
              <option value="gt">${XL.t("büyüktür >", "greater than >")}</option>
              <option value="lt">${XL.t("küçüktür <", "less than <")}</option>
              <option value="eq">${XL.t("eşittir =", "equal =")}</option>
              <option value="between">${XL.t("arasında", "between")}</option>
              <option value="contains">${XL.t("metin içerir", "text contains")}</option>
            </select>
            <input type="text" id="cf-v1" placeholder="${XL.t("değer", "value")}" style="width:70px">
            <input type="text" id="cf-v2" placeholder="${XL.t("üst", "upper")}" style="width:70px" class="hidden">
            <label>${XL.t("Dolgu", "Fill")} <input type="color" id="cf-bg" value="#ffe08a"></label>
            <label>${XL.t("Yazı", "Text")} <input type="color" id="cf-color" value="#7a4e00"></label>
          </div>
          <button id="cf-add" class="share-add">${XL.t("Kural ekle", "Add rule")}</button>
        </div>
        <div class="share-sub">${XL.t("Kurallar", "Rules")}</div>
        <div id="cf-list"></div>
      </div>`);

    const kind = document.getElementById("cf-kind");
    const op = document.getElementById("cf-op");
    const cellOpts = document.getElementById("cf-cell-opts");
    const v2 = document.getElementById("cf-v2");
    kind.addEventListener("change", () => cellOpts.classList.toggle("hidden", kind.value !== "cell"));
    op.addEventListener("change", () => v2.classList.toggle("hidden", op.value !== "between"));

    const list = () => {
      const box = document.getElementById("cf-list");
      const rules = this.rules();
      box.innerHTML = rules.length ? rules.map((r) => {
        const d = r.kind === "cell" ? `${r.op} ${XL.esc(r.v1)}${r.op === "between" ? "–" + XL.esc(r.v2) : ""}`
          : r.kind === "scale" ? XL.t("renk ölçeği", "color scale") : XL.t("veri çubuğu", "data bar");
        return `<div class="org-row"><span class="or-email">${this.rangeLabel(r.range)} · ${d}</span>
          <button class="sr-del" data-del="${r.id}">✕</button></div>`;
      }).join("") : `<p class="muted">${XL.t("Henüz kural yok.", "No rules yet.")}</p>`;
      box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { this.remove(b.dataset.del); list(); }));
    };

    document.getElementById("cf-add").addEventListener("click", () => {
      const k = kind.value;
      if (k === "cell") {
        const v1 = document.getElementById("cf-v1").value.trim();
        if (!v1) return;
        this.add({ range: rg, kind: "cell", op: op.value, v1, v2: v2.value.trim(),
          style: { bg: document.getElementById("cf-bg").value, color: document.getElementById("cf-color").value } });
      } else if (k === "scale") {
        this.add({ range: rg, kind: "scale", lo: "#f8696b", hi: "#63be7b" });
      } else {
        this.add({ range: rg, kind: "databar", color: "#63be7b" });
      }
      list();
    });
    list();
  },
};
