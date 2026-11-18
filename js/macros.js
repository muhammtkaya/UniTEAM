/* macros.js — kullanıcı tanımlı makrolar (klavye kısayolu ile hücreye yazma)
 *
 * Bir makro: { id, name, kind, value, sc }
 *   kind: "text" | "date" | "time" | "datetime" | "formula"
 *   value: metin/formül makrolarının içeriği (tarih/saat makrolarında kullanılmaz)
 *   sc:   kısayol → { ctrl, alt, shift, key }   (key = tek karakter, küçük harf, veya "f1".."f12")
 *
 * Makrolar XL.prefs içinde ("macros") kullanıcıya özel saklanır → oturumlar arası kalıcı
 * ve belgelerden bağımsızdır. Şu an yalnız Excel'de, etkin hücreye yazar.
 */
XL.macros = {
  _wired: false,

  list() { return XL.prefs.get("macros", []) || []; },
  _save(arr) { XL.prefs.set("macros", arr); },

  init() {
    if (this._wired) return;
    this._wired = true;
    // Yakalama evresinde dinle → ızgara/kısayollardan önce makroyu çalıştır.
    document.addEventListener("keydown", (e) => this._onKey(e), true);
  },

  /* ---------- Kısayol yakalama ---------- */
  // Olaydan bir kısayol tanımı çıkar (yalnızca değiştirici + anlamlı tuş)
  scFromEvent(e) {
    let key = (e.key || "").toLowerCase();
    if (["control", "shift", "alt", "meta", "os"].includes(key)) return null; // yalnız değiştirici
    if (key === " ") key = "space";
    // Tek karakter, rakam, veya F tuşları kabul edilir
    if (!(key.length === 1 || key === "space" || /^f([1-9]|1[0-2])$/.test(key))) return null;
    return { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key };
  },
  scLabel(sc) {
    if (!sc || !sc.key) return XL.t("(atanmadı)", "(none)");
    const parts = [];
    if (sc.ctrl) parts.push("Ctrl");
    if (sc.alt) parts.push("Alt");
    if (sc.shift) parts.push("Shift");
    parts.push(sc.key === "space" ? "Space" : sc.key.toUpperCase());
    return parts.join("+");
  },
  scEquals(a, b) {
    return a && b && a.key === b.key && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift;
  },
  // Uygulamanın yerleşik kısayollarıyla (Ctrl+S/O/Z/Y/B/I/U/A/C/X/V/H) çakışıyor mu?
  isReserved(sc) {
    if (!sc) return false;
    const reserved = ["s", "o", "z", "y", "b", "i", "u", "a", "c", "x", "v", "h"];
    return sc.ctrl && !sc.alt && !sc.shift && reserved.includes(sc.key);
  },

  _onKey(e) {
    // Kısayol yakalama sırasında veya bir diyalog (XL.modal) açıkken tetiklenme.
    if (this._capturing) return;
    if (document.querySelector(".xl-modal-overlay")) return;
    const sc = this.scFromEvent(e);
    if (!sc || (!sc.ctrl && !sc.alt)) return;   // en az bir değiştirici şart
    const m = this.list().find((mac) => this.scEquals(mac.sc, sc));
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    this.run(m);
  },

  /* ---------- Çalıştırma ---------- */
  valueFor(m) {
    const loc = (XL.i18n && XL.i18n.locale === "en") ? "en-US" : "tr-TR";
    const now = new Date();
    switch (m.kind) {
      case "date": return now.toLocaleDateString(loc);
      // Türkiye standardı: 24 saat biçimi (AM/PM yok) — hour12:false her dilde 24h verir.
      case "time": return now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
      case "datetime": return now.toLocaleDateString(loc) + " " + now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
      case "formula": {
        const v = (m.value || "").trim();
        return v.startsWith("=") ? v : "=" + v;
      }
      case "text":
      default: return m.value || "";
    }
  },

  run(m) {
    const doc = XL.ws && XL.ws.active && XL.ws.active();
    if (!doc || doc.type !== "xlsx") {
      XL.status(XL.t("Makrolar şu an yalnızca Excel'de çalışır.", "Macros currently run only in Excel."));
      return;
    }
    if (XL.ws.isReadonly && XL.ws.isReadonly()) {
      XL.status(XL.t("👁 Salt görüntüleme — makro çalışmaz.", "👁 View only — macros disabled."));
      return;
    }
    try {
      if (XL.grid && XL.grid.editing) XL.grid.commitEdit();
      const a = XL.state.active;
      XL.engine.setCell(a.r, a.c, this.valueFor(m));
      XL.grid.render();
      if (XL.grid.updateSelection) XL.grid.updateSelection();
      XL.ws.changed();
      XL.status(XL.t("Makro çalıştı: ", "Macro ran: ") + m.name);
    } catch (err) {
      console.error(err);
      XL.status(XL.t("Makro hatası: ", "Macro error: ") + (err && err.message || err));
    }
  },

  /* ---------- Yönetici (yan panel) ---------- */
  openManager() {
    this._editingId = null;
    this._draftSc = null;
    XL.showPanel(XL.t("Makrolar", "Macros"), `<div class="macro-mgr" id="macro-mgr"></div>`);
    this._render();
  },

  _render() {
    const root = document.getElementById("macro-mgr");
    if (!root) return;
    const macros = this.list();
    const kinds = [
      ["text", XL.t("Metin ekle", "Insert text")],
      ["date", XL.t("Güncel tarih", "Current date")],
      ["time", XL.t("Güncel saat", "Current time")],
      ["datetime", XL.t("Tarih + saat", "Date + time")],
      ["formula", XL.t("Formül ekle", "Insert formula")],
    ];
    const editing = this._editingId ? macros.find((m) => m.id === this._editingId) : null;
    const d = editing || { name: "", kind: "date", value: "", sc: this._draftSc || null };
    const sc = this._draftSc || d.sc || null;

    const listHtml = macros.length
      ? `<ul class="mm-list">${macros.map((m) => {
          const kindLbl = (kinds.find((k) => k[0] === m.kind) || [])[1] || m.kind;
          const extra = (m.kind === "text" || m.kind === "formula") && m.value ? " · " + XL.esc(m.value.slice(0, 24)) : "";
          return `<li class="mm-item" data-id="${m.id}">
            <span class="mm-nm">${XL.esc(m.name)}</span>
            <span class="mm-meta">${XL.esc(kindLbl)}${extra}</span>
            <span class="mm-spacer"></span>
            <span class="mm-sc">${XL.esc(this.scLabel(m.sc))}</span>
            <button data-run="${m.id}" title="${XL.t("Çalıştır", "Run")}">▶</button>
            <button data-edit="${m.id}" title="${XL.t("Düzenle", "Edit")}">✎</button>
            <button data-del="${m.id}" title="${XL.t("Sil", "Delete")}">🗑</button>
          </li>`;
        }).join("")}</ul>`
      : `<p class="mm-empty">${XL.t("Henüz makro yok. Aşağıdan ekleyin.", "No macros yet. Add one below.")}</p>`;

    const needsValue = d.kind === "text" || d.kind === "formula";
    root.innerHTML = `
      <p class="mm-hint">${XL.t(
        "Makro, atadığınız kısayola basınca etkin hücreye yazar. (Örn. güncel tarih)",
        "A macro writes to the active cell when you press its shortcut. (e.g. current date)")}</p>
      <h4>${XL.t("Makrolarım", "My macros")}</h4>
      ${listHtml}
      <div class="mm-form">
        <h4>${editing ? XL.t("Makroyu düzenle", "Edit macro") : XL.t("Yeni makro", "New macro")}</h4>
        <div class="mm-row">
          <label>${XL.t("Ad", "Name")}</label>
          <input id="mm-name" type="text" maxlength="40" placeholder="${XL.t("Örn. Bugünün tarihi", "e.g. Today's date")}" value="${XL.esc(d.name)}">
        </div>
        <div class="mm-row">
          <label>${XL.t("Tür", "Type")}</label>
          <select id="mm-kind">${kinds.map((k) => `<option value="${k[0]}"${k[0] === d.kind ? " selected" : ""}>${XL.esc(k[1])}</option>`).join("")}</select>
        </div>
        <div class="mm-row" id="mm-value-row" style="${needsValue ? "" : "display:none"}">
          <label>${d.kind === "formula" ? XL.t("Formül (örn. =TODAY())", "Formula (e.g. =TODAY())") : XL.t("Metin", "Text")}</label>
          <input id="mm-value" type="text" placeholder="${d.kind === "formula" ? "=TODAY()" : XL.t("yazılacak metin", "text to write")}" value="${XL.esc(d.value || "")}">
        </div>
        <div class="mm-row">
          <label>${XL.t("Kısayol", "Shortcut")}</label>
          <div class="mm-sc-capture">
            <button type="button" id="mm-sc-btn" class="mm-sc-btn">${XL.esc(this.scLabel(sc))}</button>
            <span class="mm-meta">${XL.t("Düğmeye tıklayıp kombinasyona basın (Ctrl/Alt + tuş).", "Click, then press the combo (Ctrl/Alt + key).")}</span>
          </div>
        </div>
        <div class="mm-actions">
          <button class="mm-save" id="mm-save">${editing ? XL.t("Güncelle", "Update") : XL.t("Ekle", "Add")}</button>
          ${editing ? `<button class="mm-cancel" id="mm-cancel">${XL.t("Vazgeç", "Cancel")}</button>` : ""}
        </div>
      </div>`;

    this._wireManager();
  },

  _wireManager() {
    const root = document.getElementById("macro-mgr");
    if (!root) return;

    // Liste eylemleri
    root.querySelectorAll("[data-run]").forEach((b) => b.addEventListener("click", () => {
      const m = this.list().find((x) => x.id === b.dataset.run);
      if (m) this.run(m);
    }));
    root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      this._editingId = b.dataset.edit;
      this._draftSc = null;
      this._render();
    }));
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      const m = this.list().find((x) => x.id === b.dataset.del);
      if (!m) return;
      const ok = await XL.modal(XL.t("Makroyu sil", "Delete macro"),
        `<p style="margin:0">${XL.t(`<b>${XL.esc(m.name)}</b> makrosu silinsin mi?`, `Delete macro <b>${XL.esc(m.name)}</b>?`)}</p>`,
        [{ value: true, label: XL.t("Sil", "Delete"), kind: "danger", default: true }, { value: false, label: XL.t("Vazgeç", "Cancel") }]);
      if (!ok) return;
      this._save(this.list().filter((x) => x.id !== m.id));
      if (this._editingId === m.id) { this._editingId = null; this._draftSc = null; }
      this._render();
    }));

    // Tür değişince metin/formül alanını göster/gizle
    const kindSel = document.getElementById("mm-kind");
    if (kindSel) kindSel.addEventListener("change", () => {
      const needsValue = kindSel.value === "text" || kindSel.value === "formula";
      const row = document.getElementById("mm-value-row");
      if (row) row.style.display = needsValue ? "" : "none";
      const lbl = row && row.querySelector("label");
      if (lbl) lbl.textContent = kindSel.value === "formula" ? XL.t("Formül (örn. =TODAY())", "Formula (e.g. =TODAY())") : XL.t("Metin", "Text");
    });

    // Kısayol yakalama
    const scBtn = document.getElementById("mm-sc-btn");
    if (scBtn) {
      const startCapture = () => {
        this._capturing = true;
        scBtn.classList.add("capturing");
        scBtn.textContent = XL.t("Tuşa basın…", "Press keys…");
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const sc = this.scFromEvent(e);
          if (!sc) return;   // yalnız değiştirici → beklemeye devam
          if (!sc.ctrl && !sc.alt) {   // en az Ctrl veya Alt gerekli
            scBtn.textContent = XL.t("Ctrl/Alt ekleyin…", "Add Ctrl/Alt…");
            return;
          }
          cleanup(sc);
        };
        const onBlur = () => cleanup(null);
        const cleanup = (sc) => {
          this._capturing = false;
          document.removeEventListener("keydown", onKey, true);
          scBtn.removeEventListener("blur", onBlur);
          scBtn.classList.remove("capturing");
          if (sc) this._draftSc = sc;
          scBtn.textContent = this.scLabel(this._draftSc);
        };
        document.addEventListener("keydown", onKey, true);
        scBtn.addEventListener("blur", onBlur);
      };
      scBtn.addEventListener("click", startCapture);
    }

    // Kaydet / Güncelle
    const saveBtn = document.getElementById("mm-save");
    if (saveBtn) saveBtn.addEventListener("click", () => this._commit());

    const cancelBtn = document.getElementById("mm-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", () => { this._editingId = null; this._draftSc = null; this._render(); });
  },

  async _commit() {
    const name = (document.getElementById("mm-name").value || "").trim();
    const kind = document.getElementById("mm-kind").value;
    const valueEl = document.getElementById("mm-value");
    const value = valueEl ? (valueEl.value || "") : "";
    const editing = this._editingId ? this.list().find((m) => m.id === this._editingId) : null;
    const sc = this._draftSc || (editing && editing.sc) || null;

    if (!name) return this._warn(XL.t("Lütfen bir ad girin.", "Please enter a name."));
    if ((kind === "text" || kind === "formula") && !value.trim())
      return this._warn(kind === "formula" ? XL.t("Lütfen bir formül girin.", "Please enter a formula.") : XL.t("Lütfen bir metin girin.", "Please enter text."));
    if (!sc) return this._warn(XL.t("Lütfen bir kısayol atayın.", "Please assign a shortcut."));
    if (this.isReserved(sc))
      return this._warn(XL.t(`${this.scLabel(sc)} uygulama tarafından kullanılıyor. Ctrl+Shift+… veya Alt+… deneyin.`,
        `${this.scLabel(sc)} is used by the app. Try Ctrl+Shift+… or Alt+…`));

    // Başka bir makroyla kısayol çakışması
    const clash = this.list().find((m) => m.id !== this._editingId && this.scEquals(m.sc, sc));
    if (clash) return this._warn(XL.t(`${this.scLabel(sc)} zaten "${clash.name}" makrosunda. Farklı bir kısayol seçin.`,
      `${this.scLabel(sc)} is already used by "${clash.name}". Pick another.`));

    const arr = this.list().slice();
    if (editing) {
      Object.assign(editing, { name, kind, value, sc });
      const i = arr.findIndex((m) => m.id === editing.id);
      if (i >= 0) arr[i] = editing;
    } else {
      arr.push({ id: XL.uid(), name, kind, value, sc });
    }
    this._save(arr);
    this._editingId = null;
    this._draftSc = null;
    this._render();
    XL.status(XL.t("Makro kaydedildi.", "Macro saved."));
  },

  _warn(msg) {
    return XL.modal(XL.t("Makro", "Macro"), `<p style="margin:0">${XL.esc(msg)}</p>`,
      [{ value: null, label: XL.t("Tamam", "OK"), kind: "primary", default: true }]);
  },
};
