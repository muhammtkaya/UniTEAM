/* excel/formula.js — UniTEAM kendi formül/hesap motoru (HyperFormula yerine)
 *
 * Neden: HyperFormula GPL-3.0 lisanslıydı ve ürünü GPL'e zorluyordu. Bu motor
 * tamamen projeye ait, bağımlılıksız bir yeniden yazımdır ve HyperFormula'nın
 * kullandığımız API alt kümesini birebir karşılar; böylece engine.js / mode.js /
 * io.js değişmeden çalışır (global `HyperFormula` olarak yayımlanır).
 *
 * Tasarım:
 *   - Tokenizer → precedence-climbing parser → AST.
 *   - Tembel, sürüm-önbellekli değerlendirme: her mutasyonda version++ ; formül
 *     hücresi yalnızca eski sürümdeyse yeniden hesaplanır. Ziyaret yığınıyla
 *     döngü (#CYCLE!) yakalanır. Explicit bağımlılık grafiği yok.
 *   - Yapısal düzenlemede (satır/sütun ekle-sil) AST referansları kaydırılır ve
 *     ham formül metni AST'den yeniden üretilir.
 *
 * v1 sınırı: dinamik diziler (FILTER/UNIQUE/SORT/SEQUENCE spill) henüz yok.
 */
(function () {
  "use strict";

  /* ============================ Hata değerleri ============================ */
  const ERR = (value, type) => ({ value, type });
  const E = {
    DIV0: () => ERR("#DIV/0!", "DIV_BY_ZERO"),
    VALUE: () => ERR("#VALUE!", "VALUE"),
    REF: () => ERR("#REF!", "REF"),
    NAME: () => ERR("#NAME?", "NAME"),
    NUM: () => ERR("#NUM!", "NUM"),
    NA: () => ERR("#N/A", "NA"),
    NULL: () => ERR("#NULL!", "NULL"),
    CYCLE: () => ERR("#CYCLE!", "CYCLE"),
    ERROR: () => ERR("#ERROR!", "ERROR"),
  };
  const isErr = (v) => v != null && typeof v === "object" && "value" in v && "type" in v;
  const isMatrix = (v) => v != null && typeof v === "object" && v.__m === true;

  /* ======================= Sayı / metin yardımcıları ======================= */
  function parseNumber(str) {
    if (typeof str !== "string") return null;
    let t = str.trim();
    if (t === "") return null;
    let pct = false;
    if (t.endsWith("%")) { pct = true; t = t.slice(0, -1).trim(); }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    if (!isFinite(n)) return null;
    return pct ? n / 100 : n;
  }

  function numToStr(n) {
    if (Number.isInteger(n)) return String(n);
    // Kayan nokta artığını temizle
    let s = String(n);
    if (s.includes("e") || s.includes("E")) return s;
    const trimmed = parseFloat(n.toPrecision(15));
    return String(trimmed);
  }

  // Değeri sayıya zorla (operatörler için). Hata/dizi girerse onu döndürür.
  function num(v) {
    if (isErr(v)) return v;
    if (isMatrix(v)) { const s = scalarOf(v); return s === v ? E.VALUE() : num(s); }
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
      const t = v.trim();
      if (t === "") return E.VALUE();
      const n = parseNumber(t);
      return n === null ? E.VALUE() : n;
    }
    return E.VALUE();
  }

  // Değeri metne zorla ("&" ve metin fonksiyonları için)
  function text(v) {
    if (isErr(v)) return v;
    if (isMatrix(v)) { const s = scalarOf(v); return s === v ? "" : text(s); }
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return numToStr(v);
    return String(v);
  }

  // Matristen skaler: 1x1 ise tek değer, değilse matrisin kendisi (çağıran #VALUE! verir)
  function scalarOf(v) {
    if (!isMatrix(v)) return v;
    if (v.rows.length === 1 && v.rows[0].length === 1) return v.rows[0][0];
    return v;
  }
  function coerceScalar(v) {
    if (!isMatrix(v)) return v;
    const s = scalarOf(v);
    return s === v ? E.VALUE() : s;
  }

  function truthy(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const u = v.trim().toUpperCase();
      if (u === "TRUE") return true;
      if (u === "FALSE" || u === "") return false;
      const n = parseNumber(v);
      if (n !== null) return n !== 0;
      return E.VALUE();
    }
    return !!v;
  }

  /* ============================== Karşılaştırma ============================== */
  // Excel sırası: sayı < metin < FALSE < TRUE
  function typeRank(v) {
    if (typeof v === "number") return 1;
    if (typeof v === "string") return 2;
    if (typeof v === "boolean") return v ? 4 : 3;
    return 0; // null
  }
  function compare(a, b) {
    if (a === null && b === null) return 0;
    // null'ı karşıdakine göre uyarla
    if (a === null) a = typeof b === "number" ? 0 : typeof b === "string" ? "" : a;
    if (b === null) b = typeof a === "number" ? 0 : typeof a === "string" ? "" : b;
    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === "string" && typeof b === "string") {
      const la = a.toLowerCase(), lb = b.toLowerCase(); // Excel metinde harf duyarsız
      return la < lb ? -1 : la > lb ? 1 : 0;
    }
    if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
    const ra = typeRank(a), rb = typeRank(b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  }

  /* ================================ Tarih ================================ */
  // Excel seri tarihi: 1899-12-30 = 0 (1900 artık yıl hatası görmezden gelinir)
  const MS_DAY = 86400000;
  const EPOCH = Date.UTC(1899, 11, 30);
  function dateToSerial(y, m, d) {
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / MS_DAY);
  }
  function serialToDate(serial) {
    return new Date(EPOCH + Math.round(serial) * MS_DAY);
  }
  function nowSerial() {
    const now = new Date();
    const utc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    return (utc - EPOCH) / MS_DAY;
  }

  /* =============================== Tokenizer =============================== */
  const ERR_LITERALS = ["#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#NULL!", "#CYCLE!", "#ERROR!"];
  function tokenize(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    const isDigit = (c) => c >= "0" && c <= "9";
    const isAlpha = (c) => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_";
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      // Metin "..."
      if (c === '"') {
        let s = ""; i++;
        while (i < n) {
          if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        toks.push({ t: "str", v: s });
        continue;
      }
      // Sayfa adı '...'
      if (c === "'") {
        let s = ""; i++;
        while (i < n) {
          if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        toks.push({ t: "sheet", v: s });
        continue;
      }
      // Hata değişmezi
      if (c === "#") {
        const rest = src.slice(i).toUpperCase();
        const lit = ERR_LITERALS.find((L) => rest.startsWith(L));
        if (lit) { toks.push({ t: "errlit", v: lit }); i += lit.length; continue; }
        throw new Error("Geçersiz karakter: #");
      }
      // Sayı
      if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
        let j = i;
        while (j < n && isDigit(src[j])) j++;
        if (src[j] === ".") { j++; while (j < n && isDigit(src[j])) j++; }
        if (src[j] === "e" || src[j] === "E") {
          let k = j + 1;
          if (src[k] === "+" || src[k] === "-") k++;
          if (isDigit(src[k])) { j = k; while (j < n && isDigit(src[j])) j++; }
        }
        toks.push({ t: "num", v: Number(src.slice(i, j)) });
        i = j;
        continue;
      }
      // Tanımlayıcı / hücre başvurusu / fonksiyon / sayfa adı ($ dahil)
      if (isAlpha(c) || c === "$") {
        let j = i;
        while (j < n && (isAlpha(src[j]) || isDigit(src[j]) || src[j] === "$" || src[j] === ".")) j++;
        toks.push({ t: "ident", v: src.slice(i, j) });
        i = j;
        continue;
      }
      // İki karakterli operatörler
      const two = src.substr(i, 2);
      if (two === "<=" || two === ">=" || two === "<>") { toks.push({ t: "op", v: two }); i += 2; continue; }
      if ("+-*/^&=<>(),:!%".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
      throw new Error("Beklenmeyen karakter: " + c);
    }
    toks.push({ t: "eof" });
    return toks;
  }

  /* ================================ Parser ================================ */
  const CELL_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;

  // resolver: sayfa adı -> id (bilinmiyorsa null). curSheet: formülün bulunduğu sayfa.
  function parse(src, resolver) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const eat = (v) => { if (toks[p].t === "op" && toks[p].v === v) { p++; return true; } return false; };

    function parseExpr() { return parseCompare(); }

    function parseCompare() {
      let a = parseConcat();
      while (peek().t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().v)) {
        const op = next().v; const b = parseConcat();
        a = { t: "bin", op, a, b };
      }
      return a;
    }
    function parseConcat() {
      let a = parseAdd();
      while (peek().t === "op" && peek().v === "&") { next(); a = { t: "bin", op: "&", a, b: parseAdd() }; }
      return a;
    }
    function parseAdd() {
      let a = parseMul();
      while (peek().t === "op" && (peek().v === "+" || peek().v === "-")) { const op = next().v; a = { t: "bin", op, a, b: parseMul() }; }
      return a;
    }
    function parseMul() {
      let a = parsePow();
      while (peek().t === "op" && (peek().v === "*" || peek().v === "/")) { const op = next().v; a = { t: "bin", op, a, b: parsePow() }; }
      return a;
    }
    function parsePow() {
      let a = parseUnary();
      if (peek().t === "op" && peek().v === "^") { next(); return { t: "bin", op: "^", a, b: parsePow() }; } // sağ birleşir
      return a;
    }
    function parseUnary() {
      if (peek().t === "op" && (peek().v === "-" || peek().v === "+")) { const op = next().v; return { t: "un", op, x: parseUnary() }; }
      return parsePostfix();
    }
    function parsePostfix() {
      let a = parsePrimary();
      while (peek().t === "op" && peek().v === "%") { next(); a = { t: "un", op: "%", x: a }; }
      return a;
    }

    function parsePrimary() {
      const tk = peek();
      if (tk.t === "num") { next(); return { t: "num", v: tk.v }; }
      if (tk.t === "str") { next(); return { t: "str", v: tk.v }; }
      if (tk.t === "errlit") { next(); return { t: "errlit", v: tk.v }; }
      if (tk.t === "op" && tk.v === "(") { next(); const e = parseExpr(); if (!eat(")")) throw new Error(") bekleniyordu"); return e; }
      if (tk.t === "sheet") { // 'Sayfa adı'!...
        next();
        if (!eat("!")) throw new Error("! bekleniyordu");
        return parseRefWithSheet(tk.v);
      }
      if (tk.t === "ident") {
        // Fonksiyon?  (sonrasında parantez)
        if (toks[p + 1] && toks[p + 1].t === "op" && toks[p + 1].v === "(") {
          const name = next().v; next(); // ident, (
          const args = [];
          if (!(peek().t === "op" && peek().v === ")")) {
            args.push(parseExpr());
            while (eat(",")) args.push(parseExpr());
          }
          if (!eat(")")) throw new Error(") bekleniyordu");
          const up = name.toUpperCase();
          return { t: "call", name: FN_ALIASES[up] || up, args };
        }
        // Sayfa niteleyici?  ident!
        if (toks[p + 1] && toks[p + 1].t === "op" && toks[p + 1].v === "!") {
          const sheetName = next().v; next(); // ident, !
          return parseRefWithSheet(sheetName);
        }
        // TRUE / FALSE
        const up = tk.v.toUpperCase();
        if (up === "TRUE") { next(); return { t: "bool", v: true }; }
        if (up === "FALSE") { next(); return { t: "bool", v: false }; }
        // Hücre/aralık (bu sayfa)
        return parseRefWithSheet(null);
      }
      throw new Error("Beklenmeyen simge");
    }

    function readCellToken() {
      const tk = peek();
      if (tk.t !== "ident") return null;
      const m = CELL_RE.exec(tk.v);
      if (!m) return null;
      next();
      const col = XL.letterToCol(m[2]);
      const row = parseInt(m[4], 10) - 1;
      return { col, row, colAbs: m[1] === "$", rowAbs: m[3] === "$" };
    }

    function parseRefWithSheet(sheetName) {
      const sheetId = sheetName == null ? null : resolver(sheetName);
      const a = readCellToken();
      if (!a) {
        // Sayfa niteleyicili ama hücre değilse: tanımlı ad → desteklenmiyor
        throw new Error("Geçersiz başvuru");
      }
      if (peek().t === "op" && peek().v === ":") {
        next();
        const b = readCellToken();
        if (!b) throw new Error("Aralık sonu geçersiz");
        return { t: "range", sheetId, sheetName, a, b };
      }
      return { t: "ref", sheetId, sheetName, col: a.col, row: a.row, colAbs: a.colAbs, rowAbs: a.rowAbs };
    }

    const ast = parseExpr();
    if (peek().t !== "eof") throw new Error("Fazladan simge");
    return ast;
  }

  /* ========================= AST → metin (geri üretim) ========================= */
  function colLettersAbs(ref) { return (ref.colAbs ? "$" : "") + XL.colLetter(ref.col) + (ref.rowAbs ? "$" : "") + (ref.row + 1); }
  function sheetPrefix(node, engine) {
    if (node.sheetId == null) return "";
    const name = engine ? engine._nameOf(node.sheetId) : node.sheetName;
    if (name == null) return "";
    return /[^A-Za-z0-9_]/.test(name) ? "'" + name.replace(/'/g, "''") + "'!" : name + "!";
  }
  function stringify(node, engine) {
    switch (node.t) {
      case "num": return numToStr(node.v);
      case "str": return '"' + node.v.replace(/"/g, '""') + '"';
      case "bool": return node.v ? "TRUE" : "FALSE";
      case "errlit": return node.v;
      case "ref": return node.ref ? node.ref : sheetPrefix(node, engine) + colLettersAbs(node);
      case "range": return sheetPrefix(node, engine) + colLettersAbs(node.a) + ":" + colLettersAbs(node.b);
      case "un": return node.op === "%" ? stringify(node.x, engine) + "%" : node.op + stringify(node.x, engine);
      case "bin": return stringify(node.a, engine) + node.op + stringify(node.b, engine);
      case "call": return node.name + "(" + node.args.map((a) => stringify(a, engine)).join(",") + ")";
      case "referr": return "#REF!";
      default: return "";
    }
  }

  /* ======================== Referans kaydırma (yapısal) ======================== */
  // axis: "row" | "col". at: başlangıç indeksi. delta: +ekle / -sil (mutlak sayı sil).
  function shiftRefPart(ref, axis, at, delta) {
    const key = axis === "row" ? "row" : "col";
    const v = ref[key];
    if (delta > 0) { if (v >= at) ref[key] = v + delta; return true; }
    // silme: [at, at-delta)
    const count = -delta;
    if (v >= at && v < at + count) return false; // silinen bölgede
    if (v >= at + count) ref[key] = v - count;
    return true;
  }
  // Bir AST düğümündeki, hedef sayfaya (targetId) bakan başvuruları kaydır.
  // formulaSheet: formülün bulunduğu sayfa (nitelenmemiş başvurular buraya bakar).
  function shiftRefs(node, formulaSheet, targetId, axis, at, delta) {
    if (!node || typeof node !== "object") return node;
    if (node.t === "ref") {
      const eff = node.sheetId == null ? formulaSheet : node.sheetId;
      if (eff === targetId) { if (!shiftRefPart(node, axis, at, delta)) return { t: "referr" }; }
      return node;
    }
    if (node.t === "range") {
      const eff = node.sheetId == null ? formulaSheet : node.sheetId;
      if (eff === targetId) {
        const okA = shiftRefPart(node.a, axis, at, delta);
        const okB = shiftRefPart(node.b, axis, at, delta);
        if (!okA && !okB) return { t: "referr" };
        // Bir uç silindiyse aralığı daralt (silme sınırına sabitle)
        if (!okA) { node.a[axis === "row" ? "row" : "col"] = Math.max(0, at); }
        if (!okB) { node.b[axis === "row" ? "row" : "col"] = Math.max(0, at - 1 >= 0 ? at - 1 : at); }
      }
      return node;
    }
    for (const k of ["x", "a", "b"]) if (node[k]) node[k] = shiftRefs(node[k], formulaSheet, targetId, axis, at, delta);
    if (node.args) node.args = node.args.map((x) => shiftRefs(x, formulaSheet, targetId, axis, at, delta));
    return node;
  }

  /* =============================== Motor sınıfı =============================== */
  class Engine {
    constructor() {
      this.sheets = new Map();   // id -> { id, name, cells: Map("r,c" -> cell) }
      this.order = [];           // sayfa id sırası
      this.nextId = 0;
      this.version = 1;          // hesap sürümü (mutasyonda artar)
      this._visiting = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this._tx = 0;              // açık işlem derinliği
    }

    /* ---- sayfa yönetimi ---- */
    _nameOf(id) { const s = this.sheets.get(id); return s ? s.name : null; }
    _idOf(name) {
      const low = String(name).toLowerCase();
      for (const s of this.sheets.values()) if (s.name.toLowerCase() === low) return s.id;
      return null;
    }
    isItPossibleToAddSheet(name) { return this._idOf(name) == null; }
    addSheet(name) {
      const realName = name == null ? "Sheet" + (this.nextId + 1) : String(name);
      const id = this.nextId++;
      this.sheets.set(id, { id, name: realName, cells: new Map() });
      this.order.push(id);
      return realName;
    }
    getSheetId(name) { return this._idOf(name); }
    getSheetName(id) { return this._nameOf(id); }
    renameSheet(id, newName) {
      const s = this.sheets.get(id);
      if (!s) return;
      s.name = String(newName);
      this.version++;
    }
    removeSheet(id) {
      this._mutate(() => {
        this.sheets.delete(id);
        this.order = this.order.filter((x) => x !== id);
      });
    }

    _parseResolver() { return (name) => this._idOf(name); }

    _makeCell(sheetId, raw) {
      const cell = { raw, f: false, ast: null, _v: undefined, _ver: -1, _lit: undefined, _litRaw: undefined };
      if (typeof raw === "string" && raw[0] === "=") {
        cell.f = true;
        try { cell.ast = parse(raw.slice(1), this._parseResolver()); }
        catch (e) { cell.ast = { t: "perr", msg: e.message }; }
      }
      return cell;
    }

    _setRaw(sheetId, r, c, raw) {
      const sh = this.sheets.get(sheetId);
      if (!sh) return;
      const key = r + "," + c;
      if (raw === null || raw === undefined || raw === "") { sh.cells.delete(key); return; }
      sh.cells.set(key, this._makeCell(sheetId, raw));
    }

    setSheetContent(id, grid) {
      const sh = this.sheets.get(id);
      if (!sh) return;
      sh.cells.clear();
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (v === null || v === undefined || v === "") continue;
          sh.cells.set(r + "," + c, this._makeCell(id, typeof v === "string" ? v : String(v)));
        }
      }
      this.version++;
    }

    getSheetDimensions(id) {
      const sh = this.sheets.get(id);
      if (!sh) return { width: 0, height: 0 };
      let mr = -1, mc = -1;
      for (const key of sh.cells.keys()) {
        const i = key.indexOf(",");
        const r = +key.slice(0, i), c = +key.slice(i + 1);
        if (r > mr) mr = r;
        if (c > mc) mc = c;
      }
      return { height: mr + 1, width: mc + 1 };
    }

    // Bir sayfadaki FORMÜL hücrelerinin koordinatları. Motor bağımlılık grafiği
    // tutmaz (her mutasyon `version`'ı artırır → tüm formüller tembel yeniden
    // hesaplanır); dolayısıyla uzak bir hücre değişince DEĞERİ değişebilecek tek
    // şey formül hücreleridir. Artımlı render bunu hedefli repaint için kullanır.
    formulaCells(sheetId) {
      const sh = this.sheets.get(sheetId);
      const out = [];
      if (!sh) return out;
      for (const [key, cell] of sh.cells) {
        if (cell.f) { const i = key.indexOf(","); out.push({ r: +key.slice(0, i), c: +key.slice(i + 1) }); }
      }
      return out;
    }

    /* ---- hücre okuma/yazma ---- */
    getCellSerialized(addr) {
      const sh = this.sheets.get(addr.sheet);
      if (!sh) return null;
      const cell = sh.cells.get(addr.row + "," + addr.col);
      return cell ? cell.raw : null;
    }

    getCellValue(addr) { return this._eval(addr.sheet, addr.row, addr.col); }

    _eval(sheetId, r, c) {
      const sh = this.sheets.get(sheetId);
      if (!sh) return null;
      const cell = sh.cells.get(r + "," + c);
      if (!cell) return null;
      if (!cell.f) {
        if (cell._litRaw !== cell.raw) { cell._lit = this._literal(cell.raw); cell._litRaw = cell.raw; }
        return cell._lit;
      }
      if (cell._ver === this.version) return cell._v;
      const vkey = sheetId + ":" + r + "," + c;
      if (this._visiting.has(vkey)) return E.CYCLE();
      this._visiting.add(vkey);
      let v;
      if (cell.ast && cell.ast.t === "perr") v = E.ERROR();
      else {
        try { v = this.evalNode(cell.ast, { sheet: sheetId, r, c }); }
        catch (e) { v = E.VALUE(); }
      }
      this._visiting.delete(vkey);
      if (isMatrix(v)) v = v.rows.length && v.rows[0].length ? v.rows[0][0] : null;
      if (v === undefined) v = null;
      cell._v = v; cell._ver = this.version;
      return v;
    }

    _literal(raw) {
      if (typeof raw !== "string") return raw;
      if (raw === "") return null;
      const up = raw.trim().toUpperCase();
      if (up === "TRUE") return true;
      if (up === "FALSE") return false;
      const n = parseNumber(raw);
      if (n !== null) return n;
      return raw;
    }

    setCellContents(addr, contents) {
      this._mutate(() => {
        if (Array.isArray(contents)) {
          for (let i = 0; i < contents.length; i++) {
            const row = contents[i];
            if (!Array.isArray(row)) continue;
            for (let j = 0; j < row.length; j++) {
              let val = row[j];
              if (val !== null && val !== undefined && typeof val !== "string") val = String(val);
              this._setRaw(addr.sheet, addr.row + i, addr.col + j, val);
            }
          }
        } else {
          let val = contents;
          if (val !== null && val !== undefined && typeof val !== "string") val = String(val);
          this._setRaw(addr.sheet, addr.row, addr.col, val);
        }
      });
    }

    /* ---- yapısal düzenleme ---- */
    addRows(sheetId, [at, count]) { this._structural(sheetId, "row", at, count); }
    removeRows(sheetId, [at, count]) { this._structural(sheetId, "row", at, -count); }
    addColumns(sheetId, [at, count]) { this._structural(sheetId, "col", at, count); }
    removeColumns(sheetId, [at, count]) { this._structural(sheetId, "col", at, -count); }

    _structural(sheetId, axis, at, delta) {
      this._mutate(() => {
        const sh = this.sheets.get(sheetId);
        if (!sh) return;
        // 1) Hücre içeriklerini kaydır
        const moved = new Map();
        for (const [key, cell] of sh.cells) {
          const i = key.indexOf(",");
          let r = +key.slice(0, i), c = +key.slice(i + 1);
          const axv = axis === "row" ? r : c;
          if (delta < 0) {
            const count = -delta;
            if (axv >= at && axv < at + count) continue; // silinen
            if (axv >= at + count) { if (axis === "row") r -= count; else c -= count; }
          } else {
            if (axv >= at) { if (axis === "row") r += delta; else c += delta; }
          }
          moved.set(r + "," + c, cell);
        }
        sh.cells = moved;
        // 2) Tüm sayfalardaki formül başvurularını kaydır + ham metni yeniden üret
        for (const s of this.sheets.values()) {
          for (const cell of s.cells.values()) {
            if (!cell.f || !cell.ast || cell.ast.t === "perr") continue;
            cell.ast = shiftRefs(cell.ast, s.id, sheetId, axis, at, delta);
            cell.raw = "=" + stringify(cell.ast, this);
            cell._ver = -1;
          }
        }
      });
    }

    // order[eskiSatır] = yeniSatır  (sıralama için)
    setRowOrder(sheetId, order) {
      this._mutate(() => {
        const sh = this.sheets.get(sheetId);
        if (!sh) return;
        const moved = new Map();
        for (const [key, cell] of sh.cells) {
          const i = key.indexOf(",");
          const r = +key.slice(0, i), c = +key.slice(i + 1);
          const nr = r < order.length ? order[r] : r;
          moved.set(nr + "," + c, cell);
        }
        sh.cells = moved;
      });
    }

    /* ---- değerlendirme ---- */
    evalNode(node, ctx) {
      switch (node.t) {
        case "num": return node.v;
        case "str": return node.v;
        case "bool": return node.v;
        case "errlit": return ERR(node.v, "LITERAL");
        case "referr": return E.REF();
        case "ref": {
          const sid = node.sheetId == null ? ctx.sheet : node.sheetId;
          if (!this.sheets.has(sid)) return E.REF();
          return this._eval(sid, node.row, node.col);
        }
        case "range": return this._rangeMatrix(node, ctx);
        case "un": return this.evalUnary(node, ctx);
        case "bin": return this.evalBin(node, ctx);
        case "call": return this.evalCall(node, ctx);
      }
      return E.ERROR();
    }

    _rangeMatrix(node, ctx) {
      const sid = node.sheetId == null ? ctx.sheet : node.sheetId;
      if (!this.sheets.has(sid)) return E.REF();
      const r1 = Math.min(node.a.row, node.b.row), r2 = Math.max(node.a.row, node.b.row);
      const c1 = Math.min(node.a.col, node.b.col), c2 = Math.max(node.a.col, node.b.col);
      const rows = [];
      for (let r = r1; r <= r2; r++) {
        const row = [];
        for (let c = c1; c <= c2; c++) row.push(this._eval(sid, r, c));
        rows.push(row);
      }
      return { __m: true, rows, r1, c1, r2, c2, sheet: sid };
    }

    evalUnary(node, ctx) {
      const x = coerceScalar(this.evalNode(node.x, ctx));
      if (isErr(x)) return x;
      if (node.op === "%") { const n = num(x); return isErr(n) ? n : n / 100; }
      const n = num(x);
      if (isErr(n)) return n;
      return node.op === "-" ? -n : n;
    }

    evalBin(node, ctx) {
      const op = node.op;
      let a = coerceScalar(this.evalNode(node.a, ctx));
      if (isErr(a)) return a;
      let b = coerceScalar(this.evalNode(node.b, ctx));
      if (isErr(b)) return b;
      if (op === "&") { const ta = text(a); if (isErr(ta)) return ta; const tb = text(b); if (isErr(tb)) return tb; return ta + tb; }
      if (["=", "<>", "<", ">", "<=", ">="].includes(op)) {
        const cmp = compare(a, b);
        switch (op) {
          case "=": return cmp === 0;
          case "<>": return cmp !== 0;
          case "<": return cmp < 0;
          case ">": return cmp > 0;
          case "<=": return cmp <= 0;
          case ">=": return cmp >= 0;
        }
      }
      const na = num(a); if (isErr(na)) return na;
      const nb = num(b); if (isErr(nb)) return nb;
      switch (op) {
        case "+": return na + nb;
        case "-": return na - nb;
        case "*": return na * nb;
        case "/": return nb === 0 ? E.DIV0() : na / nb;
        case "^": { const r = Math.pow(na, nb); return isFinite(r) ? r : E.NUM(); }
      }
      return E.ERROR();
    }

    evalCall(node, ctx) {
      const fn = FUNCTIONS[node.name];
      if (!fn) return E.NAME();
      const H = {
        engine: this,
        ctx,
        ev: (nd) => this.evalNode(nd, ctx),
        sc: (nd) => coerceScalar(this.evalNode(nd, ctx)),
      };
      try { return fn(node.args, H); }
      catch (e) { return E.VALUE(); }
    }

    /* ---- geri al / yinele ---- */
    _snapshot() {
      const sheets = {};
      for (const s of this.sheets.values()) {
        const cells = {};
        for (const [k, cell] of s.cells) cells[k] = cell.raw;
        sheets[s.id] = { name: s.name, cells };
      }
      return { order: this.order.slice(), sheets, nextId: this.nextId };
    }
    _restore(snap) {
      this.sheets = new Map();
      this.order = snap.order.slice();
      this.nextId = snap.nextId;
      for (const id of this.order) {
        const s = snap.sheets[id];
        const cells = new Map();
        for (const k of Object.keys(s.cells)) {
          const i = k.indexOf(",");
          cells.set(k, this._makeCell(+id, s.cells[k]));
        }
        this.sheets.set(+id, { id: +id, name: s.name, cells });
      }
      this.version++;
    }
    _mutate(fn) {
      const top = this._tx === 0;
      if (top) { this.undoStack.push(this._snapshot()); this.redoStack.length = 0; }
      try { fn(); } finally { this.version++; }
    }
    batch(fn) {
      this.undoStack.push(this._snapshot());
      this.redoStack.length = 0;
      this._tx++;
      try { fn(); } finally { this._tx--; this.version++; }
    }
    isThereSomethingToUndo() { return this.undoStack.length > 0; }
    isThereSomethingToRedo() { return this.redoStack.length > 0; }
    undo() { if (!this.undoStack.length) return; this.redoStack.push(this._snapshot()); this._restore(this.undoStack.pop()); }
    redo() { if (!this.redoStack.length) return; this.undoStack.push(this._snapshot()); this._restore(this.redoStack.pop()); }
    clearUndoStack() { this.undoStack.length = 0; this.redoStack.length = 0; }
    destroy() { this.sheets.clear(); this.order = []; }
  }

  /* =============================== Fonksiyonlar =============================== */
  // Her argüman düğümü üzerinde (matris hücreleri dahil) gez. cb bir hata döndürürse kısa devre.
  function eachArg(nodes, H, cb) {
    for (const node of nodes) {
      const v = H.ev(node);
      if (isMatrix(v)) {
        for (const row of v.rows) for (const cell of row) { const e = cb(cell, true); if (e) return e; }
      } else {
        const e = cb(v, false); if (e) return e;
      }
    }
    return null;
  }
  // Toplama benzeri: sayıları topla (aralıkta metin/mantık yok sayılır, doğrudan metin/mantık çevrilir)
  function collectNumbers(nodes, H) {
    const out = [];
    const err = eachArg(nodes, H, (v, fromRange) => {
      if (isErr(v)) return v;
      if (typeof v === "number") out.push(v);
      else if (typeof v === "boolean") { if (!fromRange) out.push(v ? 1 : 0); }
      else if (typeof v === "string") { if (!fromRange) { const n = parseNumber(v); if (n === null) return E.VALUE(); out.push(n); } }
      // null / aralıktaki metin: atla
    });
    return err || out;
  }
  function matOf(v) { return isMatrix(v) ? v.rows : [[v]]; }
  function flat(v) { const o = []; for (const row of matOf(v)) for (const c of row) o.push(c); return o; }

  // Ölçüt ayrıştır (SUMIF/COUNTIF): ">5", "<=3", "<>x", "metin", joker "a*?"
  function makePredicate(crit) {
    let op = "=", rhs = crit;
    if (typeof crit === "string") {
      const m = /^(<=|>=|<>|<|>|=)(.*)$/.exec(crit);
      if (m) { op = m[1]; rhs = m[2]; }
    }
    let rhsNum = typeof rhs === "string" ? parseNumber(rhs) : (typeof rhs === "number" ? rhs : null);
    // joker (yalnızca eşitlik/eşitsizlik, metin)
    let re = null;
    if ((op === "=" || op === "<>") && typeof rhs === "string" && /[*?]/.test(rhs)) {
      re = new RegExp("^" + rhs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    }
    return (val) => {
      if (re) { const s = val == null ? "" : String(val); const hit = re.test(s); return op === "=" ? hit : !hit; }
      let cmp;
      if (rhsNum !== null && typeof val === "number") cmp = compare(val, rhsNum);
      else if (rhsNum !== null && val == null) return op === "<>";
      else {
        const a = val == null ? "" : (typeof val === "number" ? numToStr(val) : String(val));
        const b = rhs == null ? "" : String(rhs);
        cmp = compare(a.toLowerCase ? a : a, b);
      }
      switch (op) {
        case "=": return cmp === 0;
        case "<>": return cmp !== 0;
        case "<": return cmp < 0;
        case ">": return cmp > 0;
        case "<=": return cmp <= 0;
        case ">=": return cmp >= 0;
      }
      return false;
    };
  }

  const R = (n) => n;            // kolaylık
  const FUNCTIONS = {};
  function def(names, fn) { for (const n of names.split(",")) FUNCTIONS[n] = fn; }

  /* ---- Mantık ---- */
  def("IF", (A, H) => {
    if (A.length < 2) return E.VALUE();
    const cond = truthy(H.sc(A[0]));
    if (isErr(cond)) return cond;
    if (cond) return H.ev(A[1]);
    return A.length >= 3 ? H.ev(A[2]) : false;
  });
  def("IFERROR", (A, H) => { const v = H.ev(A[0]); return isErr(v) ? H.ev(A[1]) : v; });
  def("IFNA", (A, H) => { const v = H.ev(A[0]); return isErr(v) && v.type === "NA" ? H.ev(A[1]) : v; });
  def("IFS", (A, H) => {
    for (let i = 0; i + 1 < A.length; i += 2) { const c = truthy(H.sc(A[i])); if (isErr(c)) return c; if (c) return H.ev(A[i + 1]); }
    return E.NA();
  });
  def("AND", (A, H) => { let r = true; const e = eachArg(A, H, (v) => { if (isErr(v)) return v; const t = truthy(v); if (isErr(t)) return t; if (v !== null && t === false) r = false; }); return e || r; });
  def("OR", (A, H) => { let r = false; const e = eachArg(A, H, (v) => { if (isErr(v)) return v; const t = truthy(v); if (isErr(t)) return t; if (t === true) r = true; }); return e || r; });
  def("XOR", (A, H) => { let c = 0; const e = eachArg(A, H, (v) => { if (isErr(v)) return v; if (truthy(v) === true) c++; }); return e || (c % 2 === 1); });
  def("NOT", (A, H) => { const t = truthy(H.sc(A[0])); return isErr(t) ? t : !t; });
  def("TRUE", () => true);
  def("FALSE", () => false);
  def("SWITCH", (A, H) => {
    const val = H.sc(A[0]); if (isErr(val)) return val;
    let i = 1;
    for (; i + 1 < A.length; i += 2) { const t = H.sc(A[i]); if (compare(val, t) === 0) return H.ev(A[i + 1]); }
    return i < A.length ? H.ev(A[i]) : E.NA();
  });

  /* ---- Matematik / toplama ---- */
  def("SUM", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; return n.reduce((a, b) => a + b, 0); });
  def("PRODUCT", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; return n.length ? n.reduce((a, b) => a * b, 1) : 0; });
  def("AVERAGE", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; return n.length ? n.reduce((a, b) => a + b, 0) / n.length : E.DIV0(); });
  def("AVERAGEA", (A, H) => { let s = 0, c = 0, e = eachArg(A, H, (v) => { if (isErr(v)) return v; if (typeof v === "number") { s += v; c++; } else if (typeof v === "boolean") { s += v ? 1 : 0; c++; } else if (typeof v === "string" && v !== "") c++; }); return e || (c ? s / c : E.DIV0()); });
  def("MAX", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; return n.length ? Math.max(...n) : 0; });
  def("MIN", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; return n.length ? Math.min(...n) : 0; });
  def("COUNT", (A, H) => { let c = 0; const e = eachArg(A, H, (v) => { if (typeof v === "number") c++; else if (typeof v === "string") { if (parseNumber(v) !== null) c++; } }); return e, c; });
  def("COUNTA", (A, H) => { let c = 0; eachArg(A, H, (v) => { if (v !== null && v !== undefined && v !== "") c++; }); return c; });
  def("COUNTBLANK", (A, H) => { let c = 0; eachArg(A, H, (v) => { if (v === null || v === undefined || v === "") c++; }); return c; });
  def("ABS", (A, H) => un1(A, H, Math.abs));
  def("SQRT", (A, H) => un1(A, H, (x) => x < 0 ? E.NUM() : Math.sqrt(x)));
  def("INT", (A, H) => un1(A, H, Math.floor));
  def("TRUNC", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const d = A.length > 1 ? n1(A, H, 1) : 0; if (isErr(d)) return d; const f = Math.pow(10, d); return Math.trunc(x * f) / f; });
  def("SIGN", (A, H) => un1(A, H, Math.sign));
  def("EXP", (A, H) => un1(A, H, Math.exp));
  def("LN", (A, H) => un1(A, H, (x) => x <= 0 ? E.NUM() : Math.log(x)));
  def("LOG10", (A, H) => un1(A, H, (x) => x <= 0 ? E.NUM() : Math.log10(x)));
  def("LOG", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const b = A.length > 1 ? n1(A, H, 1) : 10; if (isErr(b)) return b; if (x <= 0 || b <= 0) return E.NUM(); return Math.log(x) / Math.log(b); });
  def("POWER", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const y = n1(A, H, 1); if (isErr(y)) return y; const r = Math.pow(x, y); return isFinite(r) ? r : E.NUM(); });
  def("MOD", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const y = n1(A, H, 1); if (isErr(y)) return y; if (y === 0) return E.DIV0(); return x - y * Math.floor(x / y); });
  def("ROUND", (A, H) => rnd(A, H, (x, f) => Math.round(x * f) / f));
  def("ROUNDUP", (A, H) => rnd(A, H, (x, f) => (x >= 0 ? Math.ceil(x * f) : Math.floor(x * f)) / f));
  def("ROUNDDOWN", (A, H) => rnd(A, H, (x, f) => (x >= 0 ? Math.floor(x * f) : Math.ceil(x * f)) / f));
  def("CEILING", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const s = A.length > 1 ? n1(A, H, 1) : 1; if (isErr(s)) return s; if (s === 0) return 0; return Math.ceil(x / s) * s; });
  def("FLOOR", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const s = A.length > 1 ? n1(A, H, 1) : 1; if (isErr(s)) return s; if (s === 0) return E.DIV0(); return Math.floor(x / s) * s; });
  def("PI", () => Math.PI);
  def("SQRTPI", (A, H) => un1(A, H, (x) => x < 0 ? E.NUM() : Math.sqrt(x * Math.PI)));
  def("SIN", (A, H) => un1(A, H, Math.sin));
  def("COS", (A, H) => un1(A, H, Math.cos));
  def("TAN", (A, H) => un1(A, H, Math.tan));
  def("ATAN", (A, H) => un1(A, H, Math.atan));
  def("ATAN2", (A, H) => { const x = n1(A, H, 0); if (isErr(x)) return x; const y = n1(A, H, 1); if (isErr(y)) return y; return Math.atan2(y, x); });
  def("ASIN", (A, H) => un1(A, H, (x) => x < -1 || x > 1 ? E.NUM() : Math.asin(x)));
  def("ACOS", (A, H) => un1(A, H, (x) => x < -1 || x > 1 ? E.NUM() : Math.acos(x)));
  def("DEGREES", (A, H) => un1(A, H, (x) => x * 180 / Math.PI));
  def("RADIANS", (A, H) => un1(A, H, (x) => x * Math.PI / 180));
  def("RAND", () => Math.random());
  def("RANDBETWEEN", (A, H) => { const a = n1(A, H, 0); if (isErr(a)) return a; const b = n1(A, H, 1); if (isErr(b)) return b; return Math.floor(Math.random() * (b - a + 1)) + a; });
  def("GCD", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; const g = (a, b) => b ? g(b, a % b) : a; return n.map((x) => Math.floor(Math.abs(x))).reduce((a, b) => g(a, b), 0); });
  def("LCM", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; const g = (a, b) => b ? g(b, a % b) : a; return n.map((x) => Math.floor(Math.abs(x))).reduce((a, b) => (a && b ? a / g(a, b) * b : 0), 1); });

  function un1(A, H, f) { const x = n1(A, H, 0); if (isErr(x)) return x; return f(x); }
  function n1(A, H, i) { if (i >= A.length) return E.VALUE(); return num(H.sc(A[i])); }
  function rnd(A, H, f) { const x = n1(A, H, 0); if (isErr(x)) return x; const d = A.length > 1 ? n1(A, H, 1) : 0; if (isErr(d)) return d; const fac = Math.pow(10, Math.trunc(d)); return f(x, fac); }

  /* ---- Koşullu toplama ---- */
  function sumifCore(rangeNode, crit, sumNode, H) {
    const rm = H.ev(rangeNode); const rvals = flat(rm);
    const pred = makePredicate(coerceScalar(crit));
    const sm = sumNode ? flat(H.ev(sumNode)) : rvals;
    let s = 0;
    for (let i = 0; i < rvals.length; i++) { if (isErr(rvals[i])) continue; if (pred(rvals[i])) { const v = sm[i]; if (typeof v === "number") s += v; } }
    return s;
  }
  def("SUMIF", (A, H) => sumifCore(A[0], H.sc(A[1]), A[2], H));
  def("COUNTIF", (A, H) => { const rvals = flat(H.ev(A[0])); const pred = makePredicate(H.sc(A[1])); let c = 0; for (const v of rvals) if (v !== null && pred(v)) c++; return c; });
  def("AVERAGEIF", (A, H) => {
    const rvals = flat(H.ev(A[0])); const pred = makePredicate(H.sc(A[1])); const avg = A[2] ? flat(H.ev(A[2])) : rvals;
    let s = 0, c = 0;
    for (let i = 0; i < rvals.length; i++) if (pred(rvals[i])) { const v = avg[i]; if (typeof v === "number") { s += v; c++; } }
    return c ? s / c : E.DIV0();
  });
  function ifsMatch(A, H, startValsNode) {
    // A: [ (sumRange?) , critRange1, crit1, critRange2, crit2, ... ]
    const pairsStart = startValsNode ? 1 : 0;
    const len = flat(H.ev(A[pairsStart])).length;
    const match = new Array(len).fill(true);
    for (let i = pairsStart; i + 1 < A.length; i += 2) {
      const vals = flat(H.ev(A[i])); const pred = makePredicate(H.sc(A[i + 1]));
      for (let k = 0; k < len; k++) if (!(k < vals.length && pred(vals[k]))) match[k] = false;
    }
    return match;
  }
  def("SUMIFS", (A, H) => { const sum = flat(H.ev(A[0])); const m = ifsMatch(A, H, true); let s = 0; for (let k = 0; k < m.length; k++) if (m[k] && typeof sum[k] === "number") s += sum[k]; return s; });
  def("COUNTIFS", (A, H) => { const m = ifsMatch(A, H, false); let c = 0; for (const x of m) if (x) c++; return c; });
  def("AVERAGEIFS", (A, H) => { const avg = flat(H.ev(A[0])); const m = ifsMatch(A, H, true); let s = 0, c = 0; for (let k = 0; k < m.length; k++) if (m[k] && typeof avg[k] === "number") { s += avg[k]; c++; } return c ? s / c : E.DIV0(); });
  def("SUMPRODUCT", (A, H) => {
    const mats = A.map((nd) => matOf(H.ev(nd)));
    const rows = mats[0].length, cols = mats[0][0] ? mats[0][0].length : 0;
    let s = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let p = 1;
      for (const m of mats) { const v = (m[r] && m[r][c]); const n = typeof v === "number" ? v : (typeof v === "boolean" ? (v ? 1 : 0) : 0); p *= n; }
      s += p;
    }
    return s;
  });

  /* ---- İstatistik ---- */
  def("MEDIAN", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; if (!n.length) return E.NUM(); n.sort((a, b) => a - b); const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; });
  def("MODE,MODE.SNGL", (A, H) => { const n = collectNumbers(A, H); if (isErr(n)) return n; const cnt = new Map(); let best = null, bc = 1; for (const x of n) { const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); if (c > bc) { bc = c; best = x; } } return best === null ? E.NA() : best; });
  def("STDEV,STDEV.S", (A, H) => stdev(A, H, true));
  def("STDEVP,STDEV.P", (A, H) => stdev(A, H, false));
  def("VAR,VAR.S", (A, H) => variance(A, H, true));
  def("VARP,VAR.P", (A, H) => variance(A, H, false));
  function variance(A, H, sample) { const n = collectNumbers(A, H); if (isErr(n)) return n; if (n.length < (sample ? 2 : 1)) return E.DIV0(); const m = n.reduce((a, b) => a + b, 0) / n.length; const ss = n.reduce((a, b) => a + (b - m) ** 2, 0); return ss / (n.length - (sample ? 1 : 0)); }
  function stdev(A, H, sample) { const v = variance(A, H, sample); return isErr(v) ? v : Math.sqrt(v); }
  def("LARGE", (A, H) => { const n = collectNumbers([A[0]], H); if (isErr(n)) return n; const k = num(H.sc(A[1])); if (isErr(k)) return k; n.sort((a, b) => b - a); return k >= 1 && k <= n.length ? n[k - 1] : E.NUM(); });
  def("SMALL", (A, H) => { const n = collectNumbers([A[0]], H); if (isErr(n)) return n; const k = num(H.sc(A[1])); if (isErr(k)) return k; n.sort((a, b) => a - b); return k >= 1 && k <= n.length ? n[k - 1] : E.NUM(); });
  def("RANK,RANK.EQ", (A, H) => { const x = num(H.sc(A[0])); if (isErr(x)) return x; const n = collectNumbers([A[1]], H); if (isErr(n)) return n; const asc = A.length > 2 && truthy(H.sc(A[2])) === true; n.sort((a, b) => asc ? a - b : b - a); const idx = n.indexOf(x); return idx < 0 ? E.NA() : idx + 1; });

  /* ---- Arama / başvuru ---- */
  def("ROW", (A, H) => { if (!A.length) return H.ctx.r + 1; const nd = A[0]; if (nd.t === "ref") return nd.row + 1; if (nd.t === "range") return Math.min(nd.a.row, nd.b.row) + 1; return E.VALUE(); });
  def("COLUMN", (A, H) => { if (!A.length) return H.ctx.c + 1; const nd = A[0]; if (nd.t === "ref") return nd.col + 1; if (nd.t === "range") return Math.min(nd.a.col, nd.b.col) + 1; return E.VALUE(); });
  def("ROWS", (A, H) => { const m = H.ev(A[0]); return matOf(m).length; });
  def("COLUMNS", (A, H) => { const m = H.ev(A[0]); const r = matOf(m); return r[0] ? r[0].length : 0; });
  def("CHOOSE", (A, H) => { const i = num(H.sc(A[0])); if (isErr(i)) return i; const k = Math.trunc(i); if (k < 1 || k >= A.length) return E.VALUE(); return H.ev(A[k]); });
  def("MATCH", (A, H) => {
    const look = H.sc(A[0]); const arr = flat(H.ev(A[1])); const type = A.length > 2 ? num(H.sc(A[2])) : 1;
    if (type === 0) { for (let i = 0; i < arr.length; i++) if (compare(arr[i], look) === 0) return i + 1; return E.NA(); }
    if (type === 1) { let res = -1; for (let i = 0; i < arr.length; i++) { if (arr[i] != null && compare(arr[i], look) <= 0) res = i; else if (arr[i] != null && compare(arr[i], look) > 0) break; } return res < 0 ? E.NA() : res + 1; }
    // type -1 (azalan)
    let res = -1; for (let i = 0; i < arr.length; i++) { if (arr[i] != null && compare(arr[i], look) >= 0) res = i; else break; } return res < 0 ? E.NA() : res + 1;
  });
  def("INDEX", (A, H) => {
    const m = matOf(H.ev(A[0]));
    const rowN = A.length > 1 ? num(H.sc(A[1])) : 1; if (isErr(rowN)) return rowN;
    const colN = A.length > 2 ? num(H.sc(A[2])) : 0; if (isErr(colN)) return colN;
    const singleRow = m.length === 1, singleCol = m[0] && m[0].length === 1;
    let ri = rowN, ci = colN;
    if (A.length <= 2 || colN === 0) {
      if (singleRow) { ci = rowN; ri = 1; } // tek satırda tek indeks = sütun
    }
    ri = Math.trunc(ri) - 1; ci = Math.trunc(ci || 1) - 1;
    if (rowN === 0) { // tüm sütun -> ilk hücre (dizi yok)
      if (m[0] && ci >= 0 && ci < m[0].length) return m[0][ci];
    }
    if (ri < 0 || ri >= m.length) return E.REF();
    const row = m[ri]; if (!row || ci < 0 || ci >= row.length) return E.REF();
    return row[ci];
  });
  function lookupCore(A, H, horizontal) {
    const look = H.sc(A[0]); const m = matOf(H.ev(A[1]));
    const idx = num(H.sc(A[2])); if (isErr(idx)) return idx;
    const approx = A.length <= 3 || truthy(H.sc(A[3])) === true;
    const keys = horizontal ? (m[0] || []) : m.map((r) => r[0]);
    let hit = -1;
    if (approx) { for (let i = 0; i < keys.length; i++) { if (keys[i] != null && compare(keys[i], look) <= 0) hit = i; else if (keys[i] != null && compare(keys[i], look) > 0) break; } }
    else { for (let i = 0; i < keys.length; i++) if (compare(keys[i], look) === 0) { hit = i; break; } }
    if (hit < 0) return E.NA();
    const k = Math.trunc(idx) - 1;
    if (horizontal) { const row = m[k]; return row ? row[hit] : E.REF(); }
    const row = m[hit]; return row && k >= 0 && k < row.length ? row[k] : E.REF();
  }
  def("VLOOKUP", (A, H) => lookupCore(A, H, false));
  def("HLOOKUP", (A, H) => lookupCore(A, H, true));
  def("XLOOKUP", (A, H) => {
    const look = H.sc(A[0]); const lookArr = flat(H.ev(A[1])); const retMat = matOf(H.ev(A[2]));
    const notFound = A.length > 3 ? H.ev(A[3]) : null;
    for (let i = 0; i < lookArr.length; i++) if (compare(lookArr[i], look) === 0) {
      // dönüş dizisi tek sütun/tek satır varsayımı
      if (retMat.length === lookArr.length) return retMat[i] ? retMat[i][0] : null;
      if (retMat[0] && retMat[0].length === lookArr.length) return retMat[0][i];
      return retMat[i] ? retMat[i][0] : null;
    }
    return notFound !== null ? notFound : E.NA();
  });

  /* ---- Metin ---- */
  def("CONCAT,CONCATENATE", (A, H) => { let s = ""; const e = eachArg(A, H, (v) => { if (isErr(v)) return v; const t = text(v); if (isErr(t)) return t; s += t; }); return e || s; });
  def("TEXTJOIN", (A, H) => {
    const delim = text(H.sc(A[0])); const ignore = truthy(H.sc(A[1])) === true; const parts = [];
    const e = eachArg(A.slice(2), H, (v) => { if (isErr(v)) return v; if (ignore && (v === null || v === "")) return; parts.push(text(v)); });
    return e || parts.join(delim);
  });
  def("LEN", (A, H) => { const t = text(H.sc(A[0])); return isErr(t) ? t : t.length; });
  def("LOWER", (A, H) => tstr(A, H, (s) => s.toLowerCase()));
  def("UPPER", (A, H) => tstr(A, H, (s) => s.toUpperCase()));
  def("PROPER", (A, H) => tstr(A, H, (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase())));
  def("TRIM", (A, H) => tstr(A, H, (s) => s.replace(/\s+/g, " ").trim()));
  def("LEFT", (A, H) => { const s = text(H.sc(A[0])); if (isErr(s)) return s; const n = A.length > 1 ? num(H.sc(A[1])) : 1; if (isErr(n)) return n; return s.slice(0, Math.max(0, Math.trunc(n))); });
  def("RIGHT", (A, H) => { const s = text(H.sc(A[0])); if (isErr(s)) return s; const n = A.length > 1 ? num(H.sc(A[1])) : 1; if (isErr(n)) return n; const k = Math.max(0, Math.trunc(n)); return k === 0 ? "" : s.slice(-k); });
  def("MID", (A, H) => { const s = text(H.sc(A[0])); if (isErr(s)) return s; const start = num(H.sc(A[1])); if (isErr(start)) return start; const len = num(H.sc(A[2])); if (isErr(len)) return len; if (start < 1) return E.VALUE(); return s.substr(Math.trunc(start) - 1, Math.max(0, Math.trunc(len))); });
  def("REPT", (A, H) => { const s = text(H.sc(A[0])); if (isErr(s)) return s; const n = num(H.sc(A[1])); if (isErr(n)) return n; return n > 0 ? s.repeat(Math.trunc(n)) : ""; });
  def("FIND", (A, H) => { const find = text(H.sc(A[0])); const within = text(H.sc(A[1])); const start = A.length > 2 ? Math.trunc(num(H.sc(A[2]))) : 1; const i = within.indexOf(find, start - 1); return i < 0 ? E.VALUE() : i + 1; });
  def("SEARCH", (A, H) => { const find = text(H.sc(A[0])).toLowerCase(); const within = text(H.sc(A[1])).toLowerCase(); const start = A.length > 2 ? Math.trunc(num(H.sc(A[2]))) : 1; const i = within.indexOf(find, start - 1); return i < 0 ? E.VALUE() : i + 1; });
  def("SUBSTITUTE", (A, H) => {
    let s = text(H.sc(A[0])); const old = text(H.sc(A[1])); const neu = text(H.sc(A[2]));
    if (old === "") return s;
    if (A.length > 3) { const nth = Math.trunc(num(H.sc(A[3]))); let i = -1, c = 0; while ((i = s.indexOf(old, i + 1)) >= 0) { if (++c === nth) return s.slice(0, i) + neu + s.slice(i + old.length); } return s; }
    return s.split(old).join(neu);
  });
  def("REPLACE", (A, H) => { const s = text(H.sc(A[0])); const start = Math.trunc(num(H.sc(A[1]))); const len = Math.trunc(num(H.sc(A[2]))); const neu = text(H.sc(A[3])); return s.slice(0, start - 1) + neu + s.slice(start - 1 + len); });
  def("EXACT", (A, H) => { const a = text(H.sc(A[0])); const b = text(H.sc(A[1])); return a === b; });
  def("VALUE", (A, H) => { const s = text(H.sc(A[0])); if (isErr(s)) return s; const n = parseNumber(s); return n === null ? E.VALUE() : n; });
  def("NUMBERVALUE", (A, H) => FUNCTIONS.VALUE(A, H));
  def("CHAR", (A, H) => { const n = num(H.sc(A[0])); if (isErr(n)) return n; return String.fromCharCode(Math.trunc(n)); });
  def("CODE,UNICODE", (A, H) => { const s = text(H.sc(A[0])); return s.length ? s.charCodeAt(0) : E.VALUE(); });
  def("TEXT", (A, H) => {
    const v = H.sc(A[0]); const fmt = text(H.sc(A[1]));
    const n = typeof v === "number" ? v : parseNumber(text(v));
    if (n === null) return text(v);
    if (/%/.test(fmt)) return numToStr(Math.round(n * 100 * 100) / 100) + "%";
    const dec = (fmt.split(".")[1] || "").replace(/[^0#]/g, "").length;
    let s = n.toFixed(dec);
    if (/#,##|,/.test(fmt)) { const parts = s.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); s = parts.join(","); }
    return s;
  });
  function tstr(A, H, f) { const s = text(H.sc(A[0])); return isErr(s) ? s : f(s); }

  /* ---- Bilgi ---- */
  def("ISBLANK", (A, H) => H.ev(A[0]) === null);
  def("ISNUMBER", (A, H) => typeof H.sc(A[0]) === "number");
  def("ISTEXT", (A, H) => typeof H.sc(A[0]) === "string");
  def("ISNONTEXT", (A, H) => typeof H.sc(A[0]) !== "string");
  def("ISLOGICAL", (A, H) => typeof H.sc(A[0]) === "boolean");
  def("ISERROR", (A, H) => isErr(H.ev(A[0])));
  def("ISERR", (A, H) => { const v = H.ev(A[0]); return isErr(v) && v.type !== "NA"; });
  def("ISNA", (A, H) => { const v = H.ev(A[0]); return isErr(v) && v.type === "NA"; });
  def("ISEVEN", (A, H) => { const n = num(H.sc(A[0])); if (isErr(n)) return n; return Math.trunc(n) % 2 === 0; });
  def("ISODD", (A, H) => { const n = num(H.sc(A[0])); if (isErr(n)) return n; return Math.abs(Math.trunc(n)) % 2 === 1; });
  def("NA", () => E.NA());
  def("N", (A, H) => { const v = H.sc(A[0]); if (typeof v === "number") return v; if (typeof v === "boolean") return v ? 1 : 0; if (isErr(v)) return v; return 0; });
  def("T", (A, H) => { const v = H.sc(A[0]); return typeof v === "string" ? v : ""; });
  def("IFERROR", FUNCTIONS.IFERROR);

  /* ---- Tarih / saat ---- */
  def("TODAY", () => Math.floor(nowSerial()));
  def("NOW", () => nowSerial());
  def("DATE", (A, H) => { const y = Math.trunc(num(H.sc(A[0]))); const m = Math.trunc(num(H.sc(A[1]))); const d = Math.trunc(num(H.sc(A[2]))); return dateToSerial(y, m, d); });
  def("YEAR", (A, H) => dpart(A, H, (d) => d.getUTCFullYear()));
  def("MONTH", (A, H) => dpart(A, H, (d) => d.getUTCMonth() + 1));
  def("DAY", (A, H) => dpart(A, H, (d) => d.getUTCDate()));
  def("HOUR", (A, H) => { const s = num(H.sc(A[0])); if (isErr(s)) return s; return Math.floor((s % 1) * 24 + 1e-9) % 24; });
  def("MINUTE", (A, H) => { const s = num(H.sc(A[0])); if (isErr(s)) return s; return Math.floor((s * 1440) % 60 + 1e-9) % 60; });
  def("SECOND", (A, H) => { const s = num(H.sc(A[0])); if (isErr(s)) return s; return Math.round((s * 86400) % 60) % 60; });
  def("WEEKDAY", (A, H) => { const s = num(H.sc(A[0])); if (isErr(s)) return s; const type = A.length > 1 ? Math.trunc(num(H.sc(A[1]))) : 1; const dow = serialToDate(s).getUTCDay(); if (type === 1) return dow + 1; if (type === 2) return dow === 0 ? 7 : dow; if (type === 3) return dow === 0 ? 6 : dow - 1; return dow + 1; });
  def("DAYS", (A, H) => { const e = num(H.sc(A[0])); if (isErr(e)) return e; const s = num(H.sc(A[1])); if (isErr(s)) return s; return Math.round(e - s); });
  def("EDATE", (A, H) => { const s = num(H.sc(A[0])); if (isErr(s)) return s; const mo = Math.trunc(num(H.sc(A[1]))); const d = serialToDate(s); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1 + mo, d.getUTCDate()); });
  def("EOMONTH", (A, H) => { const s = num(H.sc(A[0])); if (isErr(s)) return s; const mo = Math.trunc(num(H.sc(A[1]))); const d = serialToDate(s); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 2 + mo, 0); });
  def("DATEVALUE", (A, H) => { const s = text(H.sc(A[0])); const t = Date.parse(s); if (isNaN(t)) return E.VALUE(); const d = new Date(t); return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()); });
  function dpart(A, H, f) { const s = num(H.sc(A[0])); if (isErr(s)) return s; return f(serialToDate(s)); }

  /* ---- Finansal ---- */
  def("PMT", (A, H) => { const r = num(H.sc(A[0])); const nper = num(H.sc(A[1])); const pv = num(H.sc(A[2])); const fv = A.length > 3 ? num(H.sc(A[3])) : 0; const type = A.length > 4 ? num(H.sc(A[4])) : 0; for (const x of [r, nper, pv, fv, type]) if (isErr(x)) return x; if (r === 0) return -(pv + fv) / nper; const p = Math.pow(1 + r, nper); return -(pv * p + fv) / ((1 + r * type) * (p - 1) / r); });
  def("FV", (A, H) => { const r = num(H.sc(A[0])); const nper = num(H.sc(A[1])); const pmt = num(H.sc(A[2])); const pv = A.length > 3 ? num(H.sc(A[3])) : 0; const type = A.length > 4 ? num(H.sc(A[4])) : 0; for (const x of [r, nper, pmt, pv, type]) if (isErr(x)) return x; if (r === 0) return -(pv + pmt * nper); const p = Math.pow(1 + r, nper); return -(pv * p + pmt * (1 + r * type) * (p - 1) / r); });
  def("PV", (A, H) => { const r = num(H.sc(A[0])); const nper = num(H.sc(A[1])); const pmt = num(H.sc(A[2])); const fv = A.length > 3 ? num(H.sc(A[3])) : 0; const type = A.length > 4 ? num(H.sc(A[4])) : 0; for (const x of [r, nper, pmt, fv, type]) if (isErr(x)) return x; if (r === 0) return -(fv + pmt * nper); const p = Math.pow(1 + r, nper); return -(fv + pmt * (1 + r * type) * (p - 1) / r) / p; });
  def("NPER", (A, H) => { const r = num(H.sc(A[0])); const pmt = num(H.sc(A[1])); const pv = num(H.sc(A[2])); const fv = A.length > 3 ? num(H.sc(A[3])) : 0; const type = A.length > 4 ? num(H.sc(A[4])) : 0; for (const x of [r, pmt, pv, fv, type]) if (isErr(x)) return x; if (r === 0) return -(pv + fv) / pmt; const num_ = pmt * (1 + r * type) - fv * r, den = pv * r + pmt * (1 + r * type); return Math.log(num_ / den) / Math.log(1 + r); });

  /* ===================== Türkçe fonksiyon adları (i18n) =====================
   * Kullanıcı =TOPLA(...) yazabilsin diye Türkçe adları İngilizce karşılıklarına
   * eşleyen alias tablosu. Anahtarlar JS .toUpperCase() çıktısıdır (i ve ı → I).
   * İki yerde kullanılır: (1) parser, hesaplama alias'ı çözer; (2) canonicalize,
   * kayıttan ÖNCE formülü İngilizce'ye çevirir → saklanan/.xlsx'e yazılan hep
   * İngilizce (gerçek Excel de böyle: yerelleştirilmiş gösterir, İngilizce saklar).
   */
  const FN_ALIASES = {
    TOPLA: "SUM", ORTALAMA: "AVERAGE", "EĞER": "IF", VE: "AND", VEYA: "OR",
    "DEĞIL": "NOT", "EĞERHATA": "IFERROR", "EĞERSAY": "COUNTIF", "ÇOKEĞERSAY": "COUNTIFS",
    ETOPLA: "SUMIF", "ÇOKETOPLA": "SUMIFS", "TOPLA.ÇARPIM": "SUMPRODUCT", "ÇARPIM": "PRODUCT",
    SAY: "COUNT", "BAĞ_DEĞ_DOLU_SAY": "COUNTA", MAK: "MAX", "MIN": "MIN",
    YUVARLA: "ROUND", "AŞAĞIYUVARLA": "ROUNDDOWN", "YUKARIYUVARLA": "ROUNDUP",
    "METNEÇEVIR": "TEXT", "BIRLEŞTIR": "CONCATENATE", UZUNLUK: "LEN", SOLDAN: "LEFT",
    "SAĞDAN": "RIGHT", "PARÇAAL": "MID", "BÜYÜKHARF": "UPPER", "KÜÇÜKHARF": "LOWER",
    "DÜŞEYARA": "VLOOKUP", YATAYARA: "HLOOKUP", "INDIS": "INDEX", "KAÇINCI": "MATCH",
    "BUGÜN": "TODAY", "ŞIMDI": "NOW", YIL: "YEAR", AY: "MONTH", "GÜN": "DAY",
    MUTLAK: "ABS", "KAREKÖK": "SQRT", EBOBM: "GCD", EKOK: "LCM",
  };

  // Formüldeki Türkçe fonksiyon adlarını İngilizce'ye çevir (tırnaklı metni atlar;
  // yalnız '(' öncesi tanımlayıcıları eşler).
  function canonicalize(src) {
    if (typeof src !== "string" || src[0] !== "=") return src;
    const idchar = /[A-Za-zÇĞİÖŞÜçğıöşü0-9_.]/;
    let out = "", i = 0; const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === '"') { // metin değişmezini aynen kopyala ("" kaçışıyla)
        out += ch; i++;
        while (i < n) { out += src[i]; if (src[i] === '"') { if (src[i + 1] === '"') { out += '"'; i += 2; continue; } i++; break; } i++; }
        continue;
      }
      if (/[A-Za-zÇĞİÖŞÜçğıöşü_]/.test(ch)) {
        let j = i; while (j < n && idchar.test(src[j])) j++;
        const word = src.slice(i, j);
        let k = j; while (k < n && src[k] === " ") k++;
        out += (src[k] === "(" && FN_ALIASES[word.toUpperCase()]) ? FN_ALIASES[word.toUpperCase()] : word;
        i = j; continue;
      }
      out += ch; i++;
    }
    return out;
  }

  /* ================= Bölgesel formül ayracı / ondalık (i18n) =================
   * Motor HER ZAMAN kanonik saklar/hesaplar: argüman ayracı ",", ondalık ".".
   * Gerçek Excel gibi: yerelleştirilmiş GÖSTERİR (ör. Türkçe'de =TOPLA(A1;A2)),
   * İngilizce/kanonik SAKLAR. Dönüşüm yalnızca kullanıcı giriş/gösterim sınırında
   * yapılır (depolama/serialize'a hiç dokunmaz) → .xlsx birlikte çalışabilirliği
   * ve mevcut belgeler bozulmaz. Her iki fonksiyon da tırnaklı metni atlar.
   *
   * localizeFormula: kanonik → yerel. Belirsizlik yok — kanonikte tırnak dışı her
   *   "." ondalık, her "," argüman ayracıdır.
   * delocalizeFormula: yerel → kanonik. sep → ","; ondalık virgül yalnızca İKİ
   *   RAKAM ARASINDAysa "." olur (hücre başvurusundaki/ayraç virgülüyle karışmaz).
   *   Nokta-ondalıklı yerelde (en) her ikisi de no-op.
   */
  function _skipString(src, i, out) {
    // src[i] === '"' varsayımıyla çağrılır; kapanan tırnağa kadar ("" kaçışı) kopyalar.
    let s = src[i]; i++;
    const n = src.length;
    while (i < n) { s += src[i]; if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; } i++; }
    return { s, i };
  }
  function localizeFormula(src, sep, dec) {
    if (typeof src !== "string" || src[0] !== "=") return src;
    if (sep === "," && dec === ".") return src;
    let out = "", i = 0; const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === '"') { const r = _skipString(src, i, out); out += r.s; i = r.i; continue; }
      out += ch === "," ? sep : ch === "." ? dec : ch;
      i++;
    }
    return out;
  }
  function delocalizeFormula(src, sep, dec) {
    if (typeof src !== "string" || src[0] !== "=") return src;
    if (sep === "," && dec === ".") return src;
    const isD = (c) => c >= "0" && c <= "9";
    let out = "", i = 0; const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === '"') { const r = _skipString(src, i, out); out += r.s; i = r.i; continue; }
      if (ch === sep) { out += ","; i++; continue; }
      if (dec === "," && ch === "," && isD(src[i - 1]) && isD(src[i + 1])) { out += "."; i++; continue; }
      out += ch; i++;
    }
    return out;
  }

  /* ============================ Dışa aktarım ============================ */
  const HyperFormula = {
    buildEmpty() { return new Engine(); },
    getRegisteredFunctionNames() { return Object.keys(FUNCTIONS).sort(); },
    canonicalize,
    localizeFormula,
    delocalizeFormula,
    FN_ALIASES,
    _Engine: Engine,
  };
  window.HyperFormula = HyperFormula;
  XL.formula = HyperFormula; // iç referans
})();
