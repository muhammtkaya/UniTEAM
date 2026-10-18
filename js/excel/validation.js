/* excel/validation.js — Veri doğrulama (data validation)  [Faz 6]
 *
 * Hücreye girilebilecek değeri kısıtlar: açılır liste, sayı aralığı, metin uzunluğu.
 * Kurallar belge verisinde per-sheet, "r:c" anahtarıyla saklanır. grid.commitEdit
 * girişten önce check() ile doğrular; liste kuralında düzenlemede açılır seçim gösterir.
 * Not: SheetJS community .xlsx yazımında veri doğrulama desteklemez → uygulama içi.
 *
 * Kural: { type:'list'|'whole'|'decimal'|'textLength', list:[...], op:'between'|'gt'|'lt'|'ge'|'le'|'eq', min, max }
 */
XL.validation = {
  _sid() { return XL.state.activeSheetId; },
  _map(sid) { return (XL.state.validations && XL.state.validations[sid ?? this._sid()]) || {}; },
  _ensure(sid) {
    if (!XL.state.validations) XL.state.validations = {};
    sid = sid ?? this._sid();
    if (!XL.state.validations[sid]) XL.state.validations[sid] = {};
    return XL.state.validations[sid];
  },
  ruleFor(r, c, sid) { return this._map(sid)[r + ":" + c] || null; },

  setForSelection(rule) {
    const m = this._ensure();
    XL.forEachInSelection((r, c) => { m[r + ":" + c] = JSON.parse(JSON.stringify(rule)); });
    this._refresh();
  },
  clearSelection() {
    const m = this._ensure();
    XL.forEachInSelection((r, c) => { delete m[r + ":" + c]; });
    this._refresh();
  },
  _refresh() { if (XL.grid && XL.grid.render) { XL.grid.render(); XL.grid.updateSelection && XL.grid.updateSelection(); } if (XL.ws && XL.ws.changed) XL.ws.changed(); },

  options(rule) { return (rule && rule.type === "list" && Array.isArray(rule.list)) ? rule.list : []; },

  // Değer kurala uyuyor mu? → { ok, msg }
  check(r, c, value) {
    const rule = this.ruleFor(r, c);
    if (!rule) return { ok: true };
    const s = String(value);
    if (s === "") return { ok: true }; // boş değere izin (silme)
    if (rule.type === "list") {
      const ok = this.options(rule).map((x) => String(x).trim()).includes(s.trim());
      return ok ? { ok: true } : { ok: false, msg: XL.t("Değer listede yok.", "Value is not in the list.") };
    }
    if (rule.type === "textLength") {
      const n = s.length;
      return this._cmp(n, rule) ? { ok: true } : { ok: false, msg: XL.t("Metin uzunluğu kurala uymuyor.", "Text length does not meet the rule.") };
    }
    // whole / decimal
    const n = parseFloat(s.replace(",", "."));
    if (!isFinite(n)) return { ok: false, msg: XL.t("Sayı bekleniyor.", "A number is expected.") };
    if (rule.type === "whole" && !Number.isInteger(n)) return { ok: false, msg: XL.t("Tam sayı bekleniyor.", "A whole number is expected.") };
    return this._cmp(n, rule) ? { ok: true } : { ok: false, msg: XL.t("Sayı aralık/kural dışı.", "Number is out of range.") };
  },

  _cmp(n, rule) {
    const a = parseFloat(rule.min), b = parseFloat(rule.max);
    switch (rule.op) {
      case "between": return n >= Math.min(a, b) && n <= Math.max(a, b);
      case "gt": return n > a;
      case "lt": return n < a;
      case "ge": return n >= a;
      case "le": return n <= a;
      case "eq": return n === a;
      default: return true;
    }
  },

  /* ---------- UI ---------- */
  openPanel() {
    const s = XL.state.sel;
    const label = XL.addrLabel(Math.min(s.r1, s.r2), Math.min(s.c1, s.c2)) + ":" + XL.addrLabel(Math.max(s.r1, s.r2), Math.max(s.c1, s.c2));
    XL.showPanel(XL.t("Veri Doğrulama", "Data Validation"), `
      <div class="cf-ui">
        <p class="muted">${XL.t("Seçili aralık", "Selected range")}: <b>${label}</b></p>
        <div class="cf-form">
          <select id="dv-type">
            <option value="list">${XL.t("Açılır liste", "Dropdown list")}</option>
            <option value="whole">${XL.t("Tam sayı", "Whole number")}</option>
            <option value="decimal">${XL.t("Ondalık sayı", "Decimal")}</option>
            <option value="textLength">${XL.t("Metin uzunluğu", "Text length")}</option>
          </select>
          <div id="dv-list-opts">
            <input type="text" id="dv-list" placeholder="${XL.t("virgülle ayır: Düşük,Orta,Yüksek", "comma separated: Low,Medium,High")}" style="width:220px">
          </div>
          <div id="dv-num-opts" class="hidden">
            <select id="dv-op">
              <option value="between">${XL.t("arasında", "between")}</option>
              <option value="ge">≥</option><option value="le">≤</option>
              <option value="gt">&gt;</option><option value="lt">&lt;</option><option value="eq">=</option>
            </select>
            <input type="number" id="dv-min" placeholder="min" style="width:70px">
            <input type="number" id="dv-max" placeholder="max" style="width:70px">
          </div>
          <button id="dv-add" class="share-add">${XL.t("Uygula", "Apply")}</button>
          <button id="dv-clear" class="oi-manage">${XL.t("Kaldır", "Remove")}</button>
        </div>
        <div id="dv-msg" class="share-msg hidden"></div>
      </div>`);

    const type = document.getElementById("dv-type");
    const sync = () => {
      document.getElementById("dv-list-opts").classList.toggle("hidden", type.value !== "list");
      document.getElementById("dv-num-opts").classList.toggle("hidden", type.value === "list");
    };
    type.addEventListener("change", sync); sync();
    const msg = (t, k) => { const e = document.getElementById("dv-msg"); if (e) { e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (k || "ok") : " hidden"); } };

    document.getElementById("dv-add").addEventListener("click", () => {
      const t = type.value;
      let rule;
      if (t === "list") {
        const list = document.getElementById("dv-list").value.split(",").map((x) => x.trim()).filter(Boolean);
        if (!list.length) return msg(XL.t("En az bir seçenek girin.", "Enter at least one option."), "error");
        rule = { type: "list", list };
      } else {
        rule = { type: t, op: document.getElementById("dv-op").value,
          min: document.getElementById("dv-min").value, max: document.getElementById("dv-max").value };
      }
      this.setForSelection(rule);
      msg(XL.t("Doğrulama uygulandı.", "Validation applied."), "ok");
    });
    document.getElementById("dv-clear").addEventListener("click", () => { this.clearSelection(); msg(XL.t("Doğrulama kaldırıldı.", "Validation removed."), "ok"); });
  },
};
