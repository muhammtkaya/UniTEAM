/* core.js — ortak ad alanı, mod kaydı ve yardımcılar */
const XL = {
  APP_NAME: "UniTEAM",   // ürün adı — tek kaynak; başlık/çıktı meta verisinde kullanılır
  modes: {},     // "xlsx" | "docx" | "pptx" -> mod nesnesi (her mod kendini kaydeder)

  // --- Excel modunun çalışma durumu (yalnızca Excel belgesi açıkken anlamlı) ---
  ROWS: 100,
  COLS: 26,
  state: {
    hf: null,            // HyperFormula örneği
    sheets: [],          // [{id, name}]
    activeSheetId: null,
    active: { r: 0, c: 0 },
    sel: { r1: 0, c1: 0, r2: 0, c2: 0 },
    formats: {},         // "sheetId:r:c" -> {bold,italic,underline,color,bg,align,numfmt}
    layout: {},          // sheetId -> { colWidths:{c:px}, rowHeights:{r:px}, merges:[[r1,c1,r2,c2]] }
    condfmt: {},         // sheetId -> [ koşullu biçim kuralları ]  (Faz 6)
    validations: {},     // sheetId -> { "r:c": veri doğrulama kuralı }  (Faz 6)
  },
};
// Bundle köprüsü: diğer dosyalar (artık modül) XL'e global olarak erişsin.
// (Vite/Rollup her dosyayı modül kapsamında derler; bu satır olmadan XL paylaşılmaz.)
window.XL = XL;

/* --- Koordinat yardımcıları (Excel) --- */
XL.colLetter = function (c) {
  let s = "";
  c += 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
};

XL.letterToCol = function (letters) {
  let c = 0;
  for (const ch of letters.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
};

XL.addrLabel = function (r, c) {
  return XL.colLetter(c) + (r + 1);
};

XL.parseAddr = function (label) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(label.trim());
  if (!m) return null;
  return { c: XL.letterToCol(m[1]), r: parseInt(m[2], 10) - 1 };
};

/* --- Biçim deposu (Excel) --- */
XL.fmtKey = function (r, c, sheetId) {
  return (sheetId ?? XL.state.activeSheetId) + ":" + r + ":" + c;
};
XL.getFormat = function (r, c, sheetId) {
  return XL.state.formats[XL.fmtKey(r, c, sheetId)] || {};
};
XL.setFormat = function (r, c, patch, sheetId) {
  const k = XL.fmtKey(r, c, sheetId);
  XL.state.formats[k] = Object.assign({}, XL.state.formats[k], patch);
};

XL.forEachInSelection = function (fn) {
  const s = XL.state.sel;
  const r1 = Math.min(s.r1, s.r2), r2 = Math.max(s.r1, s.r2);
  const c1 = Math.min(s.c1, s.c2), c2 = Math.max(s.c1, s.c2);
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) fn(r, c);
};

/* --- Genel yardımcılar --- */
XL.status = function (msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg || "";
};

XL.esc = function (s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
};

XL.uid = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

// Blob'u dosya olarak indir
XL.download = function (blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

// Kullanıcıdan dosya seçtir (resim eklemek vb. için)
XL.pickFile = function (accept, cb) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = accept;
  inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); };
  inp.click();
};

// Güvenlik: kullanıcının yüklediği dosyalar güvensiz girdidir. Çözümlemeden önce
// boyut tavanı uygula → aşırı büyük/zip-bomb dosyalarla kaynak tüketimini (DoS) sınırla.
XL.MAX_FILE_BYTES = 75 * 1024 * 1024;   // 75 MB
XL.checkFileSize = function (file) {
  if (file && typeof file.size === "number" && file.size > XL.MAX_FILE_BYTES) {
    const mb = Math.round(XL.MAX_FILE_BYTES / (1024 * 1024));
    throw new Error(XL.t(`Dosya çok büyük (en çok ${mb} MB).`, `File too large (max ${mb} MB).`));
  }
};

XL.readAsDataURL = function (file) {
  return new Promise((res, rej) => {
    try { XL.checkFileSize(file); } catch (e) { return rej(e); }
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
};

XL.readAsArrayBuffer = function (file) {
  return new Promise((res, rej) => {
    try { XL.checkFileSize(file); } catch (e) { return rej(e); }
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
};

/* --- Tema (kullanıcının seçtiği vurgu rengi) --- */
XL.theme = {
  // "#rrggbb" → {r,g,b}
  _rgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },
  _hex(r, g, b) {
    const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b);
  },
  // Rengi koyulaştır (f<0) — vurgu-dark için
  _shade(hex, f) {
    const c = this._rgb(hex); if (!c) return hex;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    return this._hex(c.r + (t - c.r) * p, c.g + (t - c.g) * p, c.b + (t - c.b) * p);
  },
  // Beyazla karıştır (açık ton) — vurgu-soft için
  _tint(hex, p) {
    const c = this._rgb(hex); if (!c) return hex;
    return this._hex(c.r + (255 - c.r) * p, c.g + (255 - c.g) * p, c.b + (255 - c.b) * p);
  },

  // "#rrggbb" + alfa → "rgba(...)"
  _rgba(hex, a) {
    const c = this._rgb(hex); if (!c) return null;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${a == null ? 1 : a})`;
  },

  // color null/boş → kullanıcı override kaldırılır (mod rengine dönülür)
  apply(color) {
    const b = document.body;
    if (!color || !this._rgb(color)) {
      ["--accent", "--accent-dark", "--accent-soft"].forEach((v) => b.style.removeProperty(v));
      return;
    }
    b.style.setProperty("--accent", color);
    b.style.setProperty("--accent-dark", this._shade(color, -0.3));
    b.style.setProperty("--accent-soft", this._tint(color, 0.82));
  },

  // Uygulama (mod) başına görünüm: {accent, box:{color,alpha}, ctrl:{color,alpha}}.
  // Saydamlık yalnızca ARKA PLANI etkiler (yazı/ikon tam opak kalır).
  applyApp(style) {
    style = style || {};
    this.apply(style.accent);
    const b = document.body;
    const setVar = (name, val) => { if (val) b.style.setProperty(name, val); else b.style.removeProperty(name); };
    const box = style.box;
    if (box && this._rgb(box.color)) {
      const a = box.alpha == null ? 1 : box.alpha;
      setVar("--rgroup-bg", this._rgba(box.color, a));
      setVar("--rgroup-bg-hover", this._rgba(box.color, Math.min(1, a + 0.08)));
    } else { setVar("--rgroup-bg", null); setVar("--rgroup-bg-hover", null); }
    const ctrl = style.ctrl;
    if (ctrl && this._rgb(ctrl.color)) {
      setVar("--rctrl-bg", this._rgba(ctrl.color, ctrl.alpha == null ? 1 : ctrl.alpha));
    } else { setVar("--rctrl-bg", null); }
  },
};

// Paylaşılan panel (grafik, pivot, tablo ekleme vb.)
XL.showPanel = function (title, html) {
  document.getElementById("panel-title").textContent = title;
  document.getElementById("panel-body").innerHTML = html;
  document.getElementById("panel").classList.remove("hidden");
};
XL.hidePanel = function () {
  if (XL.charts && XL.charts.current) { XL.charts.current.destroy(); XL.charts.current = null; }
  document.getElementById("panel").classList.add("hidden");
};
