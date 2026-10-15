/* pptx/pptx-io.js — .pptx dışa aktarma (PptxGenJS) ve içe aktarma (JSZip ile OOXML)
 *
 * Mantıksal slayt: 960 × 540 px = 10 × 5,625 inç (96 px/inç).
 */
XL.pptxIO = {
  /* =====================================================================
   *  DIŞA AKTARMA
   * ===================================================================== */
  async exportBlob(data, mode) {
    const pptx = new PptxGenJS();
    const aspect = (mode.ASPECTS && mode.ASPECTS[data.aspect]) || { w: 960, h: 540 };
    const slW = +(aspect.w / 96).toFixed(3), slH = +(aspect.h / 96).toFixed(3);
    pptx.defineLayout({ name: "WO", width: slW, height: slH });
    pptx.layout = "WO";
    const t = mode.THEMES[data.theme] || mode.THEMES.office;
    const inch = (v) => +(v / 96).toFixed(3);
    const hex = (c) => XL.docxIO.hex(c);
    const foot = data.footer && data.footer.on ? data.footer : null;

    data.slides.forEach((slide) => {
      const s = pptx.addSlide();
      s.background = { color: hex(slide.bg || t.bg) || "FFFFFF" };

      slide.elements.forEach((e) => {
        const pos = { x: inch(e.x), y: inch(e.y), w: inch(e.w), h: inch(e.h) };
        if (e.type === "image") {
          if (e.src) s.addImage(Object.assign({ data: e.src.replace(/^data:/, "") }, pos));
          return;
        }
        if (e.ph && mode.isEmpty(e.html)) return; // boş yer tutucular gösteride görünmez

        const isShape = e.type === "shape";
        const defColor = e.color || (e.role === "title" ? t.title : isShape ? "#ffffff" : t.text);
        const base = {
          fontSize: e.fontSize || 18,
          fontFace: e.font || t.font,
          color: hex(defColor) || "000000",
          align: e.align || (isShape ? "center" : "left"),
          valign: e.valign || (isShape ? "middle" : "top"),
        };

        if (/<table/i.test(e.html || "")) {
          s.addTable(this.htmlToTable(e.html, base), Object.assign({}, pos, {
            fontSize: base.fontSize, fontFace: base.fontFace, color: base.color,
            border: { type: "solid", pt: 1, color: "999999" },
          }));
          return;
        }

        const opts = Object.assign({}, pos, base);
        if (isShape) {
          opts.shape = pptx.ShapeType[e.shape] || e.shape || "rect";
          if (e.fill !== "none") opts.fill = { color: hex(e.fill || t.accent) };
          if (e.stroke && e.stroke !== "none") opts.line = { color: hex(e.stroke), width: 1.5 };
        } else {
          if (e.fill && e.fill !== "none") opts.fill = { color: hex(e.fill) };
          if (e.stroke && e.stroke !== "none") opts.line = { color: hex(e.stroke), width: 1.5 };
        }
        const runs = this.htmlToRuns(e.html || "");
        s.addText(runs.length ? runs : "", opts);
      });

      // Sunum geneli alt bilgi (tarih / metin / slayt no)
      if (foot) {
        const fy = slH - 0.42;
        if (foot.date) s.addText(mode.footerDate(), { x: 0.3, y: fy, w: 3, h: 0.3, fontSize: 10, color: "595959", align: "left" });
        if (foot.text) s.addText(foot.text, { x: (slW - 5) / 2, y: fy, w: 5, h: 0.3, fontSize: 10, color: "595959", align: "center" });
        if (foot.number) s.slideNumber = { x: slW - 1.3, y: fy, w: 1, h: 0.3, fontSize: 10, color: "595959", align: "right" };
      }

      if (slide.notes) s.addNotes(slide.notes);
    });

    return pptx.write({ outputType: "blob" });
  },

  // Metin kutusu HTML'ini PptxGenJS koşu dizisine çevir
  htmlToRuns(html) {
    const root = document.createElement("div");
    root.innerHTML = html;
    const paras = [];
    let cur = null;
    let softBreak = false; // <br> = aynı paragraf içinde yeni satır
    const newPara = (pOpts) => { cur = { runs: [], pOpts: pOpts || {} }; paras.push(cur); softBreak = false; return cur; };

    const walk = (node, fmt, list) => {
      if (node.nodeType === 3) {
        const text = node.nodeValue.replace(/ /g, " ").replace(/​/g, "");
        if (!text) return;
        if (!cur) newPara(list ? { bullet: list.type === "OL" ? { type: "number" } : true, indentLevel: list.depth } : {});
        const options = this.runOptions(fmt);
        if (softBreak && cur.runs.length) options.softBreakBefore = true;
        softBreak = false;
        cur.runs.push({ text, options });
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === "BR") { if (cur && cur.runs.length) softBreak = true; return; }
      if (tag === "UL" || tag === "OL") {
        const nl = { type: tag, depth: list ? list.depth + 1 : 0 };
        node.childNodes.forEach((c) => walk(c, fmt, nl));
        cur = null;
        return;
      }
      if (/^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/.test(tag)) {
        const pOpts = {};
        if (tag === "LI" && list) {
          pOpts.bullet = list.type === "OL" ? { type: "number" } : true;
          pOpts.indentLevel = list.depth;
        }
        if (node.style && node.style.textAlign) pOpts.align = node.style.textAlign === "justify" ? "justify" : node.style.textAlign;
        newPara(pOpts);
        const f = this.fmtFrom(node, fmt);
        node.childNodes.forEach((c) => {
          if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) walk(c, f, list);
          else walk(c, f, list);
        });
        cur = null;
        return;
      }
      const f = this.fmtFrom(node, fmt);
      node.childNodes.forEach((c) => walk(c, f, list));
    };
    root.childNodes.forEach((c) => walk(c, {}, null));

    // Düzleştir: paragraf özellikleri ilk koşuya, satır sonu son koşuya
    const out = [];
    const nonEmpty = paras.filter((p, i) => p.runs.length || i < paras.length - 1);
    nonEmpty.forEach((p, i) => {
      if (!p.runs.length) p.runs.push({ text: "", options: {} });
      Object.assign(p.runs[0].options, p.pOpts);
      if (i < nonEmpty.length - 1) p.runs[p.runs.length - 1].options.breakLine = true;
      out.push(...p.runs);
    });
    return out;
  },

  fmtFrom(el, parent) {
    const f = Object.assign({}, parent);
    switch (el.tagName) {
      case "B": case "STRONG": f.bold = true; break;
      case "I": case "EM": f.italic = true; break;
      case "U": f.underline = true; break;
      case "S": case "STRIKE": case "DEL": f.strike = true; break;
      case "FONT":
        if (el.getAttribute("color")) f.color = XL.docxIO.hex(el.getAttribute("color"));
        if (el.getAttribute("face")) f.font = el.getAttribute("face");
        break;
    }
    const s = el.style;
    if (s) {
      if (s.fontWeight) f.bold = s.fontWeight === "bold" || parseInt(s.fontWeight, 10) >= 600;
      if (s.fontStyle) f.italic = s.fontStyle === "italic";
      const deco = s.textDecorationLine || s.textDecoration || "";
      if (deco.includes("underline")) f.underline = true;
      if (deco.includes("line-through")) f.strike = true;
      if (s.color) f.color = XL.docxIO.hex(s.color) || f.color;
      if (s.fontSize) f.size = XL.docxIO.toPt(s.fontSize);
      if (s.fontFamily) f.font = s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    }
    return f;
  },

  runOptions(f) {
    const o = {};
    if (f.bold) o.bold = true;
    if (f.italic) o.italic = true;
    if (f.underline) o.underline = { style: "sng" };
    if (f.strike) o.strike = "sngStrike";
    if (f.color) o.color = f.color;
    if (f.size) o.fontSize = Math.round(f.size * 2) / 2;
    if (f.font) o.fontFace = f.font;
    return o;
  },

  htmlToTable(html, base) {
    const root = document.createElement("div");
    root.innerHTML = html;
    const table = root.querySelector("table");
    return [...table.rows].map((tr) => [...tr.cells].map((td) => ({
      text: td.innerText.replace(/ /g, " ").trim(),
      options: td.tagName === "TH" ? { bold: true, fill: { color: "D9E2F3" } } : {},
    })));
  },

  /* =====================================================================
   *  İÇE AKTARMA
   * ===================================================================== */
  async importArrayBuffer(buf) {
    const zip = await JSZip.loadAsync(buf);
    this.zip = zip;
    const parse = (s) => new DOMParser().parseFromString(s, "application/xml");
    const read = async (p) => (zip.file(p) ? zip.file(p).async("string") : null);
    this.parse = parse;
    this.read = read;

    const presXml = await read("ppt/presentation.xml");
    if (!presXml) throw new Error("Geçerli bir .pptx değil (ppt/presentation.xml yok)");
    const pres = parse(presXml);
    const sz = this.all(pres, "sldSz")[0];
    const cx = sz ? +sz.getAttribute("cx") : 9144000, cy = sz ? +sz.getAttribute("cy") : 5143500;
    // En-boy oranından en yakın ön ayarı seç (genişlik sabit 960)
    const ratio = cy / cx;
    let aspect = "16:9";
    if (Math.abs(ratio - 0.75) < 0.045) aspect = "4:3";
    else if (Math.abs(ratio - 0.625) < 0.045) aspect = "16:10";
    const targetH = { "16:9": 540, "16:10": 600, "4:3": 720 }[aspect];
    this.aspect = aspect;
    // EMU → mantıksal piksel; 960 × targetH içine sığdır ve ortala
    const k = Math.min(960 / cx, targetH / cy);
    this.k = k;
    this.offX = (960 - cx * k) / 2;
    this.offY = (targetH - cy * k) / 2;
    this.fontK = k * 9525; // slayt küçültüldüyse yazılar da aynı oranda küçülsün

    const presRels = await this.rels("ppt/presentation.xml");
    this.baseColors = await this.loadTheme(presRels);
    this.themeColors = this.baseColors;

    const slides = [];
    for (const sid of this.all(pres, "sldId")) {
      const rid = sid.getAttribute("r:id");
      const rel = presRels[rid];
      if (!rel) continue;
      try {
        slides.push(await this.readSlide(this.resolve("ppt/presentation.xml", rel.target)));
      } catch (err) {
        console.warn("Slayt okunamadı:", rel.target, err);
      }
    }
    if (!slides.length) throw new Error("Sunuda okunabilir slayt bulunamadı");
    return { theme: "office", aspect: this.aspect || "16:9", footer: { on: false, date: false, number: false, text: "" }, slides, cur: 0 };
  },

  /* --- yardımcılar --- */
  all(el, name) { return [...el.getElementsByTagNameNS("*", name)]; },
  kids(el, name) { return el ? [...el.children].filter((c) => c.localName === name) : []; },
  kid(el, name) { return this.kids(el, name)[0] || null; },
  path(el, ...names) {
    let cur = el;
    for (const n of names) { cur = this.kid(cur, n); if (!cur) return null; }
    return cur;
  },

  // Göreli hedef yolunu çöz: ("ppt/slides/slide1.xml", "../media/a.png") → "ppt/media/a.png"
  resolve(from, target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = from.split("/");
    parts.pop();
    for (const seg of target.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  },

  async rels(partPath) {
    const parts = partPath.split("/");
    const file = parts.pop();
    const relPath = parts.join("/") + "/_rels/" + file + ".rels";
    const xml = await this.read(relPath);
    const map = {};
    if (!xml) return map;
    for (const r of this.parse(xml).getElementsByTagName("Relationship")) {
      map[r.getAttribute("Id")] = { target: r.getAttribute("Target"), type: r.getAttribute("Type") || "" };
    }
    return map;
  },

  async loadTheme(presRels) {
    const colors = {};
    const rel = Object.values(presRels).find((r) => r.type.endsWith("/theme"));
    // Tema genellikle asıl slayta bağlıdır; sunuda yoksa bilinen yolu dene
    const path = rel ? this.resolve("ppt/presentation.xml", rel.target) : "ppt/theme/theme1.xml";
    const xml = await this.read(path);
    if (!xml) return colors;
    const scheme = this.all(this.parse(xml), "clrScheme")[0];
    if (!scheme) return colors;
    for (const c of scheme.children) {
      const srgb = this.kid(c, "srgbClr"), sys = this.kid(c, "sysClr");
      colors[c.localName] = srgb ? srgb.getAttribute("val") : sys ? (sys.getAttribute("lastClr") || "000000") : null;
    }
    Object.assign(colors, { tx1: colors.dk1, bg1: colors.lt1, tx2: colors.dk2, bg2: colors.lt2 });
    return colors;
  },

  // <a:solidFill> gibi bir kabın içindeki rengi "#RRGGBB" olarak çöz
  color(container) {
    if (!container) return null;
    const c = this.kid(container, "srgbClr") || this.kid(container, "schemeClr") || this.kid(container, "sysClr") || this.kid(container, "prstClr");
    if (!c) return null;
    let hex;
    if (c.localName === "srgbClr") hex = c.getAttribute("val");
    else if (c.localName === "schemeClr") hex = this.themeColors[c.getAttribute("val")];
    else if (c.localName === "sysClr") hex = c.getAttribute("lastClr") || (c.getAttribute("val") === "window" ? "FFFFFF" : "000000");
    else hex = { black: "000000", white: "FFFFFF", red: "FF0000", blue: "0000FF", green: "00FF00" }[c.getAttribute("val")];
    if (!hex) return null;
    const lumMod = this.kid(c, "lumMod"), lumOff = this.kid(c, "lumOff");
    if (lumMod || lumOff) hex = this.lum(hex, lumMod ? +lumMod.getAttribute("val") / 100000 : 1, lumOff ? +lumOff.getAttribute("val") / 100000 : 0);
    return "#" + hex.toUpperCase();
  },

  // Parlaklık değiştiricisi (HSL üzerinde)
  lum(hex, mod, off) {
    let r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    l = Math.min(1, Math.max(0, l * mod + off));
    const hue = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) r = g = b = l;
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  },

  async mediaURL(fromPart, relMap, rid) {
    const rel = relMap[rid];
    if (!rel) return null;
    const p = this.resolve(fromPart, rel.target);
    const f = this.zip.file(p);
    if (!f) return null;
    const ext = p.split(".").pop().toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml" }[ext];
    if (!mime) return null; // emf/wmf tarayıcıda gösterilemez
    return "data:" + mime + ";base64," + (await f.async("base64"));
  },

  /* --- Düzen / asıl slayt: yer tutucu konumları, varsayılan punto, arka plan --- */
  async loadLayoutChain(slidePath, slideRels) {
    const layoutRel = Object.values(slideRels).find((r) => r.type.endsWith("/slideLayout"));
    const chain = [];
    if (!layoutRel) return chain;
    const layoutPath = this.resolve(slidePath, layoutRel.target);
    const layoutXml = await this.read(layoutPath);
    if (!layoutXml) return chain;
    chain.push({ path: layoutPath, doc: this.parse(layoutXml) });
    const lRels = await this.rels(layoutPath);
    const masterRel = Object.values(lRels).find((r) => r.type.endsWith("/slideMaster"));
    if (masterRel) {
      const mPath = this.resolve(layoutPath, masterRel.target);
      const mXml = await this.read(mPath);
      if (mXml) chain.push({ path: mPath, doc: this.parse(mXml), master: true });
    }
    return chain;
  },

  phInfo(sp) {
    const nv = this.kid(sp, "nvSpPr") || this.kid(sp, "nvPicPr") || this.kid(sp, "nvGraphicFramePr");
    const ph = nv && this.path(nv, "nvPr", "ph");
    if (!ph) return null;
    return { type: ph.getAttribute("type") || "body", idx: ph.getAttribute("idx") };
  },

  // Yer tutucunun miras aldığı şekli (düzen → asıl) bul
  findInherited(chain, ph) {
    const norm = (t) => (t === "ctrTitle" ? "title" : t === "subTitle" || t === "obj" ? "body" : t);
    for (const level of chain) {
      const sps = this.all(level.doc, "sp");
      let hit = ph.idx != null && !level.master ? sps.find((s) => { const p = this.phInfo(s); return p && p.idx === ph.idx; }) : null;
      if (!hit) hit = sps.find((s) => { const p = this.phInfo(s); return p && p.type === ph.type; });
      if (!hit) hit = sps.find((s) => { const p = this.phInfo(s); return p && norm(p.type) === norm(ph.type); });
      if (hit) return hit;
    }
    return null;
  },

  xfrmOf(sp) {
    const spPr = this.kid(sp, "spPr") || this.kid(sp, "grpSpPr");
    const x = (spPr && this.kid(spPr, "xfrm")) || this.kid(sp, "xfrm");
    if (!x) return null;
    const off = this.kid(x, "off"), ext = this.kid(x, "ext");
    if (!off || !ext) return null;
    return { x: +off.getAttribute("x"), y: +off.getAttribute("y"), w: +ext.getAttribute("cx"), h: +ext.getAttribute("cy") };
  },

  defaultSize(chain, ph, inheritedSp) {
    // 1) Miras alınan şeklin kendi liste stili
    const fromSp = inheritedSp && this.all(inheritedSp, "lvl1pPr")[0];
    const r1 = fromSp && this.kid(fromSp, "defRPr");
    if (r1 && r1.getAttribute("sz")) return +r1.getAttribute("sz") / 100;
    // 2) Asıl slaydın metin stilleri
    const master = chain.find((c) => c.master);
    if (master) {
      const styleName = ph && (ph.type === "title" || ph.type === "ctrTitle") ? "titleStyle" : ph ? "bodyStyle" : "otherStyle";
      const st = this.all(master.doc, styleName)[0];
      const lvl = st && this.kid(st, "lvl1pPr");
      const d = lvl && this.kid(lvl, "defRPr");
      if (d && d.getAttribute("sz")) return +d.getAttribute("sz") / 100;
    }
    return ph ? (ph.type === "title" || ph.type === "ctrTitle" ? 44 : 24) : 18;
  },

  bgColor(doc) {
    const bg = this.all(doc, "bg")[0];
    if (!bg) return null;
    const bgPr = this.kid(bg, "bgPr");
    if (bgPr) return this.color(this.kid(bgPr, "solidFill"));
    const ref = this.kid(bg, "bgRef");
    return ref ? this.color(ref) : null;
  },

  /* --- Slayt --- */
  async readSlide(path) {
    const doc = this.parse(await this.read(path));
    const rels = await this.rels(path);
    const chain = await this.loadLayoutChain(path, rels);
    const slide = { id: XL.uid(), layout: "blank", bg: null, transition: "none", notes: "", elements: [] };

    // Asıl slaydın renk eşlemesi: koyu şablonlarda tx1 → lt1 olabilir
    this.themeColors = Object.assign({}, this.baseColors);
    const master = chain.find((c) => c.master);
    const clrMap = master && this.all(master.doc, "clrMap")[0];
    if (clrMap) {
      for (const key of ["bg1", "tx1", "bg2", "tx2"]) {
        const target = clrMap.getAttribute(key);
        if (target && this.baseColors[target]) this.themeColors[key] = this.baseColors[target];
      }
    }

    slide.bg = this.bgColor(doc) || (chain[0] && this.bgColor(chain[0].doc)) || (chain[1] && this.bgColor(chain[1].doc)) || "#FFFFFF";

    const tree = this.all(doc, "spTree")[0];
    const identity = (r) => r;
    if (tree) await this.walkTree(tree, identity, slide, path, rels, chain);

    // Konuşmacı notları
    const notesRel = Object.values(rels).find((r) => r.type.endsWith("/notesSlide"));
    if (notesRel) {
      const nx = await this.read(this.resolve(path, notesRel.target));
      if (nx) {
        const nd = this.parse(nx);
        const body = this.all(nd, "sp").find((s) => { const p = this.phInfo(s); return p && p.type === "body"; });
        if (body) slide.notes = this.all(body, "p").map((p) => this.all(p, "t").map((t) => t.textContent).join("")).join("\n").trim();
      }
    }
    return slide;
  },

  // Şekil ağacını gez; grup dönüşümlerini (chOff/chExt) uygula
  async walkTree(tree, tf, slide, path, rels, chain) {
    for (const node of tree.children) {
      const name = node.localName;
      if (name === "grpSp") {
        const gx = this.kid(this.kid(node, "grpSpPr"), "xfrm");
        let inner = tf;
        if (gx) {
          const off = this.kid(gx, "off"), ext = this.kid(gx, "ext"), chOff = this.kid(gx, "chOff"), chExt = this.kid(gx, "chExt");
          if (off && ext && chOff && chExt) {
            const sx = +ext.getAttribute("cx") / (+chExt.getAttribute("cx") || 1);
            const sy = +ext.getAttribute("cy") / (+chExt.getAttribute("cy") || 1);
            const ox = +off.getAttribute("x"), oy = +off.getAttribute("y");
            const cx = +chOff.getAttribute("x"), cy = +chOff.getAttribute("y");
            inner = (r) => tf({ x: ox + (r.x - cx) * sx, y: oy + (r.y - cy) * sy, w: r.w * sx, h: r.h * sy });
          }
        }
        await this.walkTree(node, inner, slide, path, rels, chain);
      } else if (name === "sp") {
        const el = this.readShape(node, tf, chain);
        if (el) slide.elements.push(el);
      } else if (name === "pic") {
        const blip = this.all(node, "blip")[0];
        const xf = this.xfrmOf(node);
        if (!blip || !xf) continue;
        const src = await this.mediaURL(path, rels, blip.getAttribute("r:embed"));
        if (src) slide.elements.push(Object.assign({ id: XL.uid(), type: "image", src }, this.toPx(tf(xf))));
      } else if (name === "graphicFrame") {
        const tbl = this.all(node, "tbl")[0];
        const xf = this.xfrmOf(node);
        if (!tbl || !xf) continue;
        let html = '<table class="pp-table">';
        for (const tr of this.kids(tbl, "tr")) {
          html += "<tr>";
          for (const tc of this.kids(tr, "tc")) {
            if (tc.getAttribute("hMerge") || tc.getAttribute("vMerge")) continue;
            const span = tc.getAttribute("gridSpan");
            const text = this.all(tc, "p").map((p) => XL.esc(this.all(p, "t").map((t) => t.textContent).join(""))).join("<br>");
            html += `<td${span ? ` colspan="${span}"` : ""}>${text || "&nbsp;"}</td>`;
          }
          html += "</tr>";
        }
        html += "</table>";
        slide.elements.push(Object.assign({ id: XL.uid(), type: "text", html, fontSize: Math.round(14 * this.fontK) }, this.toPx(tf(xf))));
      }
    }
  },

  toPx(r) {
    const k = this.k;
    return {
      x: Math.round(this.offX + r.x * k), y: Math.round(this.offY + r.y * k),
      w: Math.max(4, Math.round(r.w * k)), h: Math.max(4, Math.round(r.h * k)),
    };
  },

  readShape(sp, tf, chain) {
    const ph = this.phInfo(sp);
    const inherited = ph ? this.findInherited(chain, ph) : null;
    const xf = this.xfrmOf(sp) || (inherited && this.xfrmOf(inherited));
    if (!xf) return null;

    const spPr = this.kid(sp, "spPr");
    const geom = spPr && this.kid(spPr, "prstGeom");
    const prst = geom ? geom.getAttribute("prst") : "rect";
    let fill = null, stroke = null;
    if (spPr) {
      if (this.kid(spPr, "solidFill")) fill = this.color(this.kid(spPr, "solidFill"));
      else if (this.kid(spPr, "noFill")) fill = "none";
      const ln = this.kid(spPr, "ln");
      if (ln && this.kid(ln, "solidFill")) stroke = this.color(this.kid(ln, "solidFill"));
    }
    // Stil başvuruları (ör. Ekle > Şekiller ile çizilen varsayılan dolgu)
    const style = this.kid(sp, "style");
    if (style && !fill) { const fr = this.kid(style, "fillRef"); if (fr && fr.getAttribute("idx") !== "0") fill = this.color(fr); }
    if (style && !stroke && !(spPr && this.path(spPr, "ln", "noFill"))) { const lr = this.kid(style, "lnRef"); if (lr && lr.getAttribute("idx") !== "0") stroke = this.color(lr); }

    const txBody = this.kid(sp, "txBody");
    const isTextBox = !!this.path(sp, "nvSpPr", "cNvSpPr") && this.path(sp, "nvSpPr", "cNvSpPr").getAttribute("txBox") === "1";
    const SHAPES = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", rightArrow: "rightArrow", star5: "star5" };
    const visibleShape = !ph && !isTextBox && fill && fill !== "none";
    const hasText = txBody && this.all(txBody, "t").some((t) => t.textContent.trim());
    if (!visibleShape && !hasText && !(stroke && !ph)) return null; // boş yer tutucu / görünmez kutu

    const defSize = this.defaultSize(chain, ph, inherited);
    const bodyPr = txBody && this.kid(txBody, "bodyPr");
    const autofit = bodyPr && this.kid(bodyPr, "normAutofit");
    const scale = (autofit && autofit.getAttribute("fontScale") ? +autofit.getAttribute("fontScale") / 100000 : 1) * this.fontK;
    const anchor = bodyPr && bodyPr.getAttribute("anchor");
    const isTitle = ph && (ph.type === "title" || ph.type === "ctrTitle");
    const bulletDefault = ph && !isTitle && ph.type !== "subTitle" && (ph.type === "body" || ph.type === "obj");

    const el = Object.assign({
      id: XL.uid(),
      type: visibleShape ? "shape" : "text",
      role: isTitle ? "title" : ph ? "body" : undefined,
      fontSize: Math.max(6, Math.round(defSize * scale)),
      html: txBody ? this.paragraphsToHtml(txBody, bulletDefault, scale) : "",
      valign: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : undefined,
    }, this.toPx(tf(xf)));
    if (visibleShape) { el.shape = SHAPES[prst] || "rect"; el.fill = fill; if (stroke) el.stroke = stroke; }
    else if (fill && fill !== "none") el.fill = fill;
    if (!visibleShape && stroke) el.stroke = stroke;
    // Tek tip hizalama varsa kutu düzeyine taşı
    const aligns = txBody ? this.all(txBody, "pPr").map((p) => p.getAttribute("algn")).filter(Boolean) : [];
    if (aligns.length && aligns.every((a) => a === aligns[0])) el.align = { l: "left", ctr: "center", r: "right", just: "justify" }[aligns[0]];
    else if (isTitle && ph.type === "ctrTitle") el.align = "center";
    // Varsayılan metin rengi: şekillerde stilin yazı tipi rengi (genelde beyaz), diğerlerinde tema tx1.
    // Koşu düzeyindeki renkler span olarak zaten HTML'de.
    const fontRef = style && this.kid(style, "fontRef");
    if (visibleShape) el.color = (fontRef && this.color(fontRef)) || "#FFFFFF";
    else if (this.themeColors.tx1) el.color = "#" + this.themeColors.tx1;
    return el;
  },

  paragraphsToHtml(txBody, bulletDefault, scale) {
    let html = "";
    let openList = null;
    const close = () => { if (openList) { html += `</${openList}>`; openList = null; } };

    for (const p of this.kids(txBody, "p")) {
      const pPr = this.kid(p, "pPr");
      const algn = pPr && pPr.getAttribute("algn");
      const alignCss = algn ? { l: "left", ctr: "center", r: "right", just: "justify" }[algn] : null;
      let list = null;
      if (pPr && this.kid(pPr, "buAutoNum")) list = "ol";
      else if (pPr && this.kid(pPr, "buChar")) list = "ul";
      else if (bulletDefault && !(pPr && this.kid(pPr, "buNone"))) list = "ul";

      let inner = "";
      for (const c of p.children) {
        if (c.localName === "r" || c.localName === "fld") inner += this.runToHtml(c, scale);
        else if (c.localName === "br") inner += "<br>";
      }
      const hasText = inner.replace(/<[^>]+>/g, "").trim();
      if (list && !hasText) list = null; // boş satırlar madde işareti almasın

      const style = alignCss ? ` style="text-align:${alignCss}"` : "";
      if (list) {
        if (openList !== list) { close(); html += `<${list}>`; openList = list; }
        html += `<li${style}>${inner || "<br>"}</li>`;
      } else {
        close();
        html += `<div${style}>${inner || "<br>"}</div>`;
      }
    }
    close();
    return html;
  },

  runToHtml(r, scale) {
    const text = this.all(r, "t").map((t) => t.textContent).join("");
    if (!text) return "";
    let out = XL.esc(text);
    const rPr = this.kid(r, "rPr");
    if (!rPr) return out;
    const css = [];
    if (rPr.getAttribute("sz")) css.push(`font-size:${Math.round((+rPr.getAttribute("sz") / 100) * scale * 2) / 2}pt`);
    const col = this.color(this.kid(rPr, "solidFill"));
    if (col) css.push("color:" + col);
    const latin = this.kid(rPr, "latin");
    if (latin && latin.getAttribute("typeface") && !latin.getAttribute("typeface").startsWith("+")) css.push(`font-family:'${latin.getAttribute("typeface")}'`);
    if (css.length) out = `<span style="${css.join(";")}">${out}</span>`;
    if (rPr.getAttribute("b") === "1") out = `<b>${out}</b>`;
    if (rPr.getAttribute("i") === "1") out = `<i>${out}</i>`;
    if (rPr.getAttribute("u") && rPr.getAttribute("u") !== "none") out = `<u>${out}</u>`;
    if (rPr.getAttribute("strike") && rPr.getAttribute("strike") !== "noStrike") out = `<s>${out}</s>`;
    return out;
  },
};
