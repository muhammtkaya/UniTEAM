/* word/docx-io.js — .docx içe aktarma (JSZip ile doğrudan OOXML) ve dışa aktarma (docx kütüphanesi)
 *
 * Neden kendi okuyucumuz: mammoth renk, punto, yazı tipi ve hizalamayı bilinçli olarak atıyor.
 * Kendi okuyucumuz bunları koruyor; bir şey ters giderse mammoth'a düşüyoruz.
 */
XL.docxIO = {
  // Sayfa boyutları (twip; 1 inç = 1440 twip, 1 px = 15 twip)
  PAGE: { A4: [11906, 16838], Letter: [12240, 15840], A5: [8391, 11906] },
  MARGIN: {
    normal: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    narrow: { top: 720, right: 720, bottom: 720, left: 720 },
    wide:   { top: 1440, right: 2880, bottom: 1440, left: 2880 },
    none:   { top: 0, right: 0, bottom: 0, left: 0 },
  },

  // page.margin: preset adı ("normal"…) veya {t,r,b,l} cm nesnesi → twip
  resolveMargin(margin) {
    if (margin && typeof margin === "object") {
      const cm = (v) => Math.round((parseFloat(v) || 0) * 567); // 1 cm ≈ 567 twip
      return { top: cm(margin.t), right: cm(margin.r), bottom: cm(margin.b), left: cm(margin.l) };
    }
    return this.MARGIN[margin] || this.MARGIN.normal;
  },

  /* =====================================================================
   *  DIŞA AKTARMA: HTML (editör DOM'u) → .docx
   * ===================================================================== */
  async exportBlob(root, page) {
    const D = docx;
    this.D = D;
    this.listInstance = 0;
    this.footnotes = {};      // dipnotlar (Faz 6): id → { children:[Paragraph] }
    this.footnoteId = 0;
    const [pw, ph] = this.PAGE[page.size] || this.PAGE.A4;
    const m = this.resolveMargin(page.margin);
    const contentTw = (page.orientation === "landscape" ? ph : pw) - m.left - m.right;
    this.maxImgPx = Math.floor(contentTw / 15);

    const children = this.blocks(root, {});
    if (!children.length) children.push(new D.Paragraph(""));

    // Üst / alt bilgi (açıksa)
    const hf = (spec) => {
      if (!spec || !spec.on) return null;
      const div = document.createElement("div");
      div.innerHTML = spec.html || "";
      const kids = this.blocks(div, {});
      return kids.length ? kids : [new D.Paragraph("")];
    };
    const headKids = hf(page.header);
    const footKids = hf(page.footer);
    const headers = headKids ? { default: new D.Header({ children: headKids }) } : undefined;
    const footers = footKids ? { default: new D.Footer({ children: footKids }) } : undefined;

    const levels = (fmtFn) => Array.from({ length: 9 }, (_, l) => ({
      level: l,
      format: fmtFn(l),
      text: fmtFn(l) === D.LevelFormat.BULLET ? ["•", "◦", "▪"][l % 3] : `%${l + 1}.`,
      alignment: D.AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
    }));

    const doc = new D.Document({
      creator: XL.APP_NAME,
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      footnotes: Object.keys(this.footnotes).length ? this.footnotes : undefined,
      numbering: {
        config: [
          { reference: "num", levels: levels(() => D.LevelFormat.DECIMAL) },
          { reference: "bul", levels: levels(() => D.LevelFormat.BULLET) },
        ],
      },
      sections: [{
        properties: {
          page: {
            size: {
              width: pw, height: ph,
              orientation: page.orientation === "landscape" ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT,
            },
            margin: m,
          },
        },
        headers,
        footers,
        children,
      }],
    });
    return D.Packer.toBlob(doc);
  },

  INLINE: new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "INS", "SUP", "SUB", "SPAN",
    "FONT", "A", "BR", "IMG", "CODE", "MARK", "SMALL", "BIG", "LABEL", "ABBR", "CITE", "Q"]),

  isInline(n) { return n.nodeType === 3 || (n.nodeType === 1 && this.INLINE.has(n.tagName)); },

  // Bir kapsayıcının çocuklarını blok listesine (Paragraph | Table) çevir
  blocks(parent, pctx) {
    const D = this.D;
    const out = [];
    let buf = [];
    const flush = () => {
      if (buf.some((n) => n.nodeType === 1 || n.nodeValue.trim())) out.push(this.paragraph(buf, null, pctx));
      buf = [];
    };

    for (const n of parent.childNodes) {
      if (this.isInline(n)) { buf.push(n); continue; }
      if (n.nodeType !== 1) continue;
      flush();
      const tag = n.tagName;

      if (/^H[1-6]$/.test(tag)) {
        const lvl = Math.min(+tag[1], 6);
        out.push(this.paragraph([...n.childNodes], n, pctx, { heading: D.HeadingLevel["HEADING_" + lvl] }));
      } else if (tag === "P") {
        out.push(this.paragraph([...n.childNodes], n, pctx));
      } else if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") {
        if (n.classList.contains("page-break")) out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
        else if ([...n.childNodes].some((c) => !this.isInline(c) && c.nodeType === 1)) out.push(...this.blocks(n, pctx));
        else out.push(this.paragraph([...n.childNodes], n, pctx));
      } else if (tag === "UL" || tag === "OL") {
        out.push(...this.list(n, 0, pctx));
      } else if (tag === "TABLE") {
        out.push(this.table(n));
      } else if (tag === "TBODY" || tag === "THEAD" || tag === "TFOOT" || tag === "TR") {
        // Tablosu kopmuş satırlar: geçici bir tabloya sarıp tablo olarak aktar
        const t = document.createElement("table");
        t.appendChild(n.cloneNode(true));
        out.push(this.table(t));
      } else if (tag === "BLOCKQUOTE") {
        out.push(...this.blocks(n, Object.assign({}, pctx, { indent: (pctx.indent || 0) + 720, italics: true })));
      } else if (tag === "PRE") {
        n.textContent.split("\n").forEach((line) =>
          out.push(new D.Paragraph({ children: [new D.TextRun({ text: line, font: "Courier New", size: 20 })] })));
      } else if (tag === "HR") {
        out.push(new D.Paragraph({ border: { bottom: { color: "999999", space: 1, style: D.BorderStyle.SINGLE, size: 6 } } }));
      } else {
        out.push(...this.blocks(n, pctx));
      }
    }
    flush();
    return out;
  },

  list(listEl, level, pctx) {
    const D = this.D;
    const ordered = listEl.tagName === "OL";
    const instance = ++this.listInstance; // her liste numaralandırmayı yeniden başlatır
    const out = [];
    for (const li of listEl.children) {
      if (li.tagName !== "LI") continue;
      const inline = [], nested = [];
      for (const c of li.childNodes) {
        if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) nested.push(c);
        else inline.push(c);
      }
      out.push(this.paragraph(inline, li, pctx, {
        numbering: { reference: ordered ? "num" : "bul", level: Math.min(level, 8), instance },
      }));
      nested.forEach((sub) => out.push(...this.list(sub, level + 1, pctx)));
    }
    return out;
  },

  table(tbl) {
    const D = this.D;
    // Hücresiz satırlar / boş tablolar Word dosyasını bozar: atla
    const trs = [...tbl.rows].filter((tr) => tr.cells.length);
    if (!trs.length) return new D.Paragraph("");
    const rows = trs.map((tr) => new D.TableRow({
      children: [...tr.cells].map((td) => {
        let kids = this.blocks(td, {});
        if (!kids.length) kids = [new D.Paragraph("")];
        const bg = this.hex(td.style.backgroundColor);
        return new D.TableCell({
          children: kids,
          columnSpan: td.colSpan > 1 ? td.colSpan : undefined,
          shading: bg ? { type: D.ShadingType.CLEAR, fill: bg, color: "auto" } : undefined,
        });
      }),
    }));
    return new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } });
  },

  paragraph(nodes, el, pctx, extra = {}) {
    const D = this.D;
    const base = { italics: pctx.italics };
    if (el) Object.assign(base, this.inlineFmt(el, {}));
    const runs = [];
    nodes.forEach((n) => this.runs(n, base, runs));

    const st = el ? el.style : null;
    const alignName = st && (st.textAlign || el.getAttribute("align"));
    const alignment = {
      left: D.AlignmentType.LEFT, start: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER,
      right: D.AlignmentType.RIGHT, end: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED,
    }[alignName];

    const opts = Object.assign({ children: runs }, extra);
    if (alignment) opts.alignment = alignment;
    const lh = st && parseFloat(st.lineHeight);
    if (lh && lh < 5) opts.spacing = { line: Math.round(lh * 240) };
    const indentPx = st ? parseFloat(st.marginLeft) || parseFloat(st.paddingLeft) || 0 : 0;
    const indent = (pctx.indent || 0) + Math.round(indentPx * 15);
    if (indent && !extra.numbering) opts.indent = { left: indent };
    return new D.Paragraph(opts);
  },

  runs(node, fmt, out) {
    const D = this.D;
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/[\r\n\t]+/g, " ").replace(/ /g, " ");
      if (text) out.push(new D.TextRun(Object.assign({ text }, this.runOpts(fmt))));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (node.dataset && node.dataset.field === "page") {
      out.push(new D.TextRun(Object.assign({ children: [D.PageNumber.CURRENT] }, this.runOpts(fmt))));
      return;
    }
    // Dipnot işaretçisi (Faz 6): gerçek OOXML dipnotuna çevir
    if (node.classList && node.classList.contains("wd-fn")) {
      const id = ++this.footnoteId;
      const text = node.getAttribute("data-text") || "";
      this.footnotes[id] = { children: [new D.Paragraph({ children: [new D.TextRun(text)] })] };
      out.push(new D.FootnoteReferenceRun(id));
      return;
    }
    if (tag === "BR") { out.push(new D.TextRun({ text: "", break: 1 })); return; }
    if (tag === "IMG") { const img = this.image(node); if (img) out.push(img); return; }
    if (tag === "A" && node.getAttribute("href")) {
      const inner = [];
      const f = Object.assign(this.inlineFmt(node, fmt), { color: fmt.color || "0563C1", underline: true });
      node.childNodes.forEach((c) => this.runs(c, f, inner));
      out.push(new D.ExternalHyperlink({ children: inner, link: node.getAttribute("href") }));
      return;
    }
    const f = this.inlineFmt(node, fmt);
    node.childNodes.forEach((c) => this.runs(c, f, out));
  },

  inlineFmt(el, parent) {
    const f = Object.assign({}, parent);
    switch (el.tagName) {
      case "B": case "STRONG": f.bold = true; break;
      case "I": case "EM": case "CITE": f.italics = true; break;
      case "U": case "INS": f.underline = true; break;
      case "S": case "STRIKE": case "DEL": f.strike = true; break;
      case "SUP": f.sup = true; break;
      case "SUB": f.sub = true; break;
      case "CODE": f.font = "Courier New"; break;
      case "MARK": f.bg = "FFFF00"; break;
      case "FONT":
        if (el.getAttribute("color")) f.color = this.hex(el.getAttribute("color")) || f.color;
        if (el.getAttribute("face")) f.font = el.getAttribute("face").split(",")[0].replace(/["']/g, "").trim();
        break;
    }
    const s = el.style;
    if (!s) return f;
    if (s.fontWeight) f.bold = s.fontWeight === "bold" || parseInt(s.fontWeight, 10) >= 600;
    if (s.fontStyle) f.italics = s.fontStyle === "italic";
    const deco = (s.textDecorationLine || s.textDecoration || "");
    if (deco.includes("underline")) f.underline = true;
    if (deco.includes("line-through")) f.strike = true;
    if (s.color) f.color = this.hex(s.color) || f.color;
    if (s.backgroundColor) f.bg = this.hex(s.backgroundColor) || f.bg;
    if (s.fontFamily) f.font = s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    if (s.fontSize) { const pt = this.toPt(s.fontSize); if (pt) f.size = Math.round(pt * 2); }
    if (s.verticalAlign === "super") f.sup = true;
    if (s.verticalAlign === "sub") f.sub = true;
    return f;
  },

  runOpts(f) {
    const D = this.D;
    const o = {};
    if (f.bold) o.bold = true;
    if (f.italics) o.italics = true;
    if (f.underline) o.underline = {};
    if (f.strike) o.strike = true;
    if (f.color) o.color = f.color;
    if (f.size) o.size = f.size;
    if (f.font) o.font = f.font;
    if (f.bg) o.shading = { type: D.ShadingType.CLEAR, fill: f.bg, color: "auto" };
    if (f.sup) o.superScript = true;
    if (f.sub) o.subScript = true;
    return o;
  },

  image(img) {
    const src = img.getAttribute("src") || "";
    const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src);
    if (!m) return null; // dış bağlantılı resimler gömülemez
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const nw = img.naturalWidth || parseFloat(img.getAttribute("width")) || 300;
    const nh = img.naturalHeight || parseFloat(img.getAttribute("height")) || 200;
    let w = parseFloat(img.style.width) || img.width || nw;
    if (String(img.style.width).endsWith("%")) w = this.maxImgPx * parseFloat(img.style.width) / 100;
    w = Math.min(w, this.maxImgPx);
    const h = Math.round(w * (nh / nw));
    return new this.D.ImageRun({ data: bytes, transformation: { width: Math.round(w), height: h } });
  },

  NAMED: { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF",
    yellow: "FFFF00", gray: "808080", grey: "808080", orange: "FFA500", purple: "800080" },

  // CSS rengini "RRGGBB" yap; şeffafsa null
  hex(css) {
    if (!css) return null;
    css = String(css).trim().toLowerCase();
    if (css === "transparent" || css === "inherit" || css === "initial") return null;
    let m = /^#([0-9a-f]{6})$/.exec(css);
    if (m) return m[1].toUpperCase();
    m = /^#([0-9a-f]{3})$/.exec(css);
    if (m) return m[1].split("").map((c) => c + c).join("").toUpperCase();
    m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(css);
    if (m) {
      if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
      return [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, "0")).join("").toUpperCase();
    }
    return this.NAMED[css] || null;
  },

  toPt(size) {
    const named = { "xx-small": 7, "x-small": 7.5, small: 10, medium: 12, large: 13.5, "x-large": 18, "xx-large": 24, "xxx-large": 36 };
    if (named[size]) return named[size];
    const v = parseFloat(size);
    if (!v) return null;
    if (size.endsWith("px")) return v * 0.75;
    if (size.endsWith("em") || size.endsWith("rem")) return v * 11;
    return v; // pt
  },

  /* =====================================================================
   *  İÇE AKTARMA: .docx → HTML
   * ===================================================================== */
  async importArrayBuffer(buf) {
    try {
      return await this.readOOXML(buf);
    } catch (err) {
      console.warn("Yerel .docx okuyucu başarısız, mammoth'a geçiliyor:", err);
      const res = await mammoth.convertToHtml({ arrayBuffer: buf }, {
        styleMap: ["u => u", "strike => s", "p[style-name='Quote'] => blockquote:fresh"],
      });
      return { html: res.value || "<p><br></p>", page: { size: "A4", orientation: "portrait", margin: "normal" } };
    }
  },

  async readOOXML(buf) {
    const zip = await JSZip.loadAsync(buf);
    const read = async (p) => (zip.file(p) ? zip.file(p).async("string") : null);
    const docXml = await read("word/document.xml");
    if (!docXml) throw new Error("word/document.xml yok");
    const parse = (s) => new DOMParser().parseFromString(s, "application/xml");

    const doc = parse(docXml);
    // Güvenlik: dosyadan gelen (güvensiz) Id/anahtarlarla kurulan sözlükler prototip
    // zincirinden yalıtılır (Object.create(null)) → "__proto__" vb. anahtarlarla
    // prototype pollution engellenir.
    const rels = Object.create(null);
    const relsXml = await read("word/_rels/document.xml.rels");
    if (relsXml) {
      for (const r of parse(relsXml).getElementsByTagName("Relationship")) {
        rels[r.getAttribute("Id")] = { target: r.getAttribute("Target"), type: r.getAttribute("Type") || "", mode: r.getAttribute("TargetMode") };
      }
    }

    // Resimleri önceden data URL olarak yükle
    const media = Object.create(null);
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml" };
    await Promise.all(Object.entries(rels).map(async ([id, r]) => {
      if (!r.type.endsWith("/image")) return;
      const path = r.target.startsWith("/") ? r.target.slice(1) : "word/" + r.target.replace(/^\.\//, "");
      const ext = path.split(".").pop().toLowerCase();
      const f = zip.file(path);
      if (!f || !mime[ext]) return;
      media[id] = "data:" + mime[ext] + ";base64," + (await f.async("base64"));
    }));

    // Stil adları (başlık tespiti için: "heading 1", "Title" — dilden bağımsız)
    const styleNames = Object.create(null);
    const stylesXml = await read("word/styles.xml");
    if (stylesXml) {
      for (const s of this.all(parse(stylesXml), "style")) {
        const nameEl = this.kid(s, "name");
        styleNames[this.a(s, "styleId")] = nameEl ? this.a(nameEl, "val").toLowerCase() : "";
      }
    }

    // Numaralandırma: numId -> (ilvl -> numFmt)
    const numFmt = Object.create(null);
    const numXml = await read("word/numbering.xml");
    if (numXml) {
      const nd = parse(numXml);
      const abs = Object.create(null);
      for (const an of this.all(nd, "abstractNum")) {
        const lv = Object.create(null);
        for (const l of this.kids(an, "lvl")) {
          const f = this.kid(l, "numFmt");
          lv[this.a(l, "ilvl")] = f ? this.a(f, "val") : "decimal";
        }
        abs[this.a(an, "abstractNumId")] = lv;
      }
      for (const n of this.all(nd, "num")) {
        const ref = this.kid(n, "abstractNumId");
        if (ref) numFmt[this.a(n, "numId")] = abs[this.a(ref, "val")] || {};
      }
    }

    this.ctx = { rels, media, styleNames, numFmt };
    const body = this.all(doc, "body")[0];
    const out = document.createElement("div");
    this.convertBody(body, out);

    // Sayfa ayarları
    const page = { size: "A4", orientation: "portrait", margin: "normal", header: { on: false, html: "" }, footer: { on: false, html: "" } };
    const sect = this.kid(body, "sectPr");
    if (sect) {
      // Üst / alt bilgi referanslarını çöz (varsayılan tür önceliklidir)
      const readHF = async (refName) => {
        const refs = this.kids(sect, refName);
        const ref = refs.find((r) => this.a(r, "type") === "default") || refs[0];
        if (!ref) return { on: false, html: "" };
        const rel = rels[this.a(ref, "id")];
        if (!rel) return { on: false, html: "" };
        const target = rel.target.startsWith("/") ? rel.target.slice(1) : "word/" + rel.target.replace(/^\.\//, "");
        const xml = await read(target);
        if (!xml) return { on: false, html: "" };
        const div = document.createElement("div");
        this.convertBody(parse(xml).documentElement, div);
        const html = div.innerHTML.trim();
        return html ? { on: true, html } : { on: false, html: "" };
      };
      page.header = await readHF("headerReference");
      page.footer = await readHF("footerReference");

      const sz = this.kid(sect, "pgSz");
      if (sz) {
        const w = +this.a(sz, "w"), h = +this.a(sz, "h");
        const short = Math.min(w, h), long = Math.max(w, h);
        if (Math.abs(short - 12240) < 200 && Math.abs(long - 15840) < 200) page.size = "Letter";
        else if (Math.abs(short - 8391) < 200) page.size = "A5";
        page.orientation = this.a(sz, "orient") === "landscape" || w > h ? "landscape" : "portrait";
      }
      const mar = this.kid(sect, "pgMar");
      if (mar) {
        const left = +this.a(mar, "left");
        page.margin = left <= 60 ? "none" : left <= 900 ? "narrow" : left >= 2500 ? "wide" : "normal";
      }
    }
    return { html: out.innerHTML || "<p><br></p>", page };
  },

  /* --- XML yardımcıları (ad alanından bağımsız, localName ile) --- */
  kids(el, name) { return el ? [...el.children].filter((c) => c.localName === name) : []; },
  kid(el, name) { return this.kids(el, name)[0] || null; },
  all(el, name) { return [...el.getElementsByTagNameNS("*", name)]; },
  a(el, name) {
    if (!el) return "";
    return el.getAttribute("w:" + name) ?? el.getAttribute("r:" + name) ?? el.getAttribute(name) ?? "";
  },
  on(el) { // <w:b/> veya <w:b w:val="1"/> açık; val="0"/"false" kapalı
    if (!el) return false;
    const v = this.a(el, "val");
    return v === "" || !["0", "false", "none"].includes(v);
  },

  convertBody(body, out) {
    let stack = []; // açık listeler: [{el, level, tag}]
    for (const child of body.children) {
      if (child.localName === "p") {
        const info = this.paraInfo(child);
        if (info.list) {
          this.appendListItem(out, stack, info, child);
        } else {
          stack = [];
          out.appendChild(this.pToEl(child, info));
          if (info.pageBreakAfter) out.appendChild(this.pageBreakEl());
        }
      } else if (child.localName === "tbl") {
        stack = [];
        out.appendChild(this.tblToEl(child));
      } else if (child.localName === "sdt") {
        const content = this.kid(child, "sdtContent");
        if (content) this.convertBody(content, out);
      }
    }
  },

  paraInfo(p) {
    const pPr = this.kid(p, "pPr");
    const info = { align: null, heading: 0, list: null, lineHeight: null, indent: 0, pageBreakBefore: false, pageBreakAfter: false };
    if (!pPr) return this.scanBreaks(p, info);
    const style = this.kid(pPr, "pStyle");
    if (style) {
      const id = this.a(style, "val");
      const name = this.ctx.styleNames[id] || id.toLowerCase();
      const m = /heading\s*(\d)/.exec(name);
      if (m) info.heading = Math.min(+m[1], 6);
      else if (name === "title") info.heading = 1;
      else if (name === "subtitle") info.heading = 2;
      else if (name.includes("quote")) info.quote = true;
    }
    const jc = this.kid(pPr, "jc");
    if (jc) info.align = { left: "left", start: "left", center: "center", right: "right", end: "right", both: "justify", distribute: "justify" }[this.a(jc, "val")] || null;
    const numPr = this.kid(pPr, "numPr");
    if (numPr) {
      const numId = this.a(this.kid(numPr, "numId"), "val");
      const ilvl = +this.a(this.kid(numPr, "ilvl"), "val") || 0;
      if (numId && numId !== "0") {
        const fmt = (this.ctx.numFmt[numId] || {})[ilvl] || "decimal";
        info.list = { level: ilvl, tag: fmt === "bullet" ? "UL" : "OL" };
      }
    }
    const sp = this.kid(pPr, "spacing");
    if (sp && this.a(sp, "line") && (this.a(sp, "lineRule") || "auto") === "auto") {
      const lh = +this.a(sp, "line") / 240;
      if (lh && Math.abs(lh - 1) > 0.05) info.lineHeight = lh.toFixed(2);
    }
    const ind = this.kid(pPr, "ind");
    if (ind) info.indent = (+this.a(ind, "left") || +this.a(ind, "start") || 0) / 15;
    info.pageBreakBefore = this.on(this.kid(pPr, "pageBreakBefore"));
    return this.scanBreaks(p, info);
  },

  scanBreaks(p, info) {
    for (const br of this.all(p, "br")) if (this.a(br, "type") === "page") info.pageBreakAfter = true;
    return info;
  },

  pageBreakEl() {
    const d = document.createElement("div");
    d.className = "page-break";
    d.contentEditable = "false";
    return d;
  },

  pToEl(p, info) {
    const tag = info.heading ? "H" + info.heading : info.quote ? "BLOCKQUOTE" : "P";
    const el = document.createElement(tag);
    if (info.align) el.style.textAlign = info.align;
    if (info.lineHeight) el.style.lineHeight = info.lineHeight;
    if (info.indent && !info.list) el.style.marginLeft = Math.round(info.indent) + "px";
    this.inlineInto(p, el);
    if (!el.childNodes.length || !el.textContent.trim() && !el.querySelector("img")) {
      if (!el.querySelector("img")) el.innerHTML = "<br>";
    }
    if (info.pageBreakBefore) {
      const wrap = document.createDocumentFragment();
      wrap.appendChild(this.pageBreakEl());
      wrap.appendChild(el);
      return wrap;
    }
    return el;
  },

  appendListItem(out, stack, info, p) {
    const { level, tag } = info.list;
    while (stack.length > level + 1) stack.pop();
    if (stack.length === level + 1 && stack[level].tag !== tag) stack.pop();
    while (stack.length < level + 1) {
      const list = document.createElement(tag);
      if (stack.length === 0) out.appendChild(list);
      else {
        const parent = stack[stack.length - 1].el;
        let li = parent.lastElementChild;
        if (!li) { li = document.createElement("LI"); parent.appendChild(li); }
        li.appendChild(list);
      }
      stack.push({ el: list, tag });
    }
    const li = document.createElement("LI");
    if (info.align) li.style.textAlign = info.align;
    this.inlineInto(p, li);
    if (!li.childNodes.length) li.innerHTML = "<br>";
    stack[stack.length - 1].el.appendChild(li);
  },

  // Paragraf içindeki koşuları (run) ve bağlantıları hedef elemana ekle
  inlineInto(container, target) {
    for (const c of container.children) {
      const n = c.localName;
      if (n === "r") this.runInto(c, target);
      else if (n === "hyperlink") {
        const a = document.createElement("A");
        const rel = this.ctx.rels[this.a(c, "id")];
        a.href = rel ? rel.target : "#" + this.a(c, "anchor");
        this.inlineInto(c, a);
        target.appendChild(a);
      } else if (["ins", "smartTag", "fldSimple", "customXml", "sdt", "sdtContent"].includes(n)) {
        this.inlineInto(c, target);
      }
      // del (silinmiş metin), bookmark, proofErr vb. atlanır
    }
  },

  runInto(r, target) {
    const rPr = this.kid(r, "rPr");
    const css = [];
    const wrap = [];
    if (rPr) {
      if (this.on(this.kid(rPr, "b"))) wrap.push("B");
      if (this.on(this.kid(rPr, "i"))) wrap.push("I");
      const u = this.kid(rPr, "u");
      if (u && this.a(u, "val") !== "none") wrap.push("U");
      if (this.on(this.kid(rPr, "strike")) || this.on(this.kid(rPr, "dstrike"))) wrap.push("S");
      const va = this.kid(rPr, "vertAlign");
      if (va) {
        const v = this.a(va, "val");
        if (v === "superscript") wrap.push("SUP");
        if (v === "subscript") wrap.push("SUB");
      }
      const color = this.kid(rPr, "color");
      if (color && /^[0-9A-Fa-f]{6}$/.test(this.a(color, "val"))) css.push("color:#" + this.a(color, "val"));
      const sz = this.kid(rPr, "sz");
      if (sz && this.a(sz, "val")) css.push("font-size:" + (+this.a(sz, "val") / 2) + "pt");
      const fonts = this.kid(rPr, "rFonts");
      if (fonts) {
        const f = this.a(fonts, "ascii") || this.a(fonts, "hAnsi");
        if (f) css.push(`font-family:'${f.replace(/'/g, "")}'`);
      }
      const hl = this.kid(rPr, "highlight");
      const HL = { yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff",
        red: "#ff0000", darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080",
        darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000" };
      if (hl && HL[this.a(hl, "val")]) css.push("background-color:" + HL[this.a(hl, "val")]);
      const shd = this.kid(rPr, "shd");
      if (!hl && shd && /^[0-9A-Fa-f]{6}$/.test(this.a(shd, "fill"))) css.push("background-color:#" + this.a(shd, "fill"));
    }

    // İçeriği oluştur
    const frag = document.createDocumentFragment();
    for (const c of r.children) {
      switch (c.localName) {
        case "t": frag.appendChild(document.createTextNode(c.textContent)); break;
        case "tab": frag.appendChild(document.createTextNode("  ")); break;
        case "br": case "cr":
          if (this.a(c, "type") !== "page") frag.appendChild(document.createElement("BR"));
          break;
        case "noBreakHyphen": frag.appendChild(document.createTextNode("‑")); break;
        case "drawing": case "pict": {
          const img = this.drawingToImg(c);
          if (img) frag.appendChild(img);
          break;
        }
      }
    }
    if (!frag.childNodes.length) return;

    let node = frag;
    if (css.length) {
      const span = document.createElement("SPAN");
      span.setAttribute("style", css.join(";"));
      span.appendChild(node);
      node = span;
    }
    for (const tag of wrap.reverse()) {
      const w = document.createElement(tag);
      w.appendChild(node);
      node = w;
    }
    target.appendChild(node);
  },

  drawingToImg(d) {
    const blip = this.all(d, "blip")[0] || this.all(d, "imagedata")[0];
    if (!blip) return null;
    const id = blip.getAttribute("r:embed") || blip.getAttribute("r:id") || this.a(blip, "embed");
    const src = this.ctx.media[id];
    if (!src) return null;
    const img = document.createElement("IMG");
    img.src = src;
    const ext = this.all(d, "extent")[0];
    if (ext) {
      const w = Math.round(+ext.getAttribute("cx") / 9525); // EMU → px
      if (w) img.style.width = w + "px";
    }
    return img;
  },

  tblToEl(tbl) {
    const table = document.createElement("TABLE");
    const tbody = document.createElement("TBODY");
    table.appendChild(tbody);
    for (const tr of this.kids(tbl, "tr")) {
      const row = document.createElement("TR");
      for (const tc of this.kids(tr, "tc")) {
        const tcPr = this.kid(tc, "tcPr");
        const vMerge = tcPr && this.kid(tcPr, "vMerge");
        const td = document.createElement("TD");
        const span = tcPr && this.kid(tcPr, "gridSpan");
        if (span) td.colSpan = +this.a(span, "val") || 1;
        const shd = tcPr && this.kid(tcPr, "shd");
        if (shd && /^[0-9A-Fa-f]{6}$/.test(this.a(shd, "fill"))) td.style.backgroundColor = "#" + this.a(shd, "fill");
        // Dikey birleştirmenin devam hücreleri boş bırakılır
        if (!(vMerge && this.a(vMerge, "val") !== "restart")) this.convertBody(tc, td);
        if (!td.childNodes.length) td.innerHTML = "<br>";
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    return table;
  },
};
