// Sentetik round-trip dosya sadakati testi.
// NOT: Bizim KENDİ pipeline'ımızı sentetik içerikle sınar (yaz→oku→karşılaştır).
// Gerçek MS Office dosyalarına karşı test için corpus.js'e bakın.
const puppeteer = require("puppeteer-core");
const { resolveChrome, waitReady, createChecker } = require("./lib");

async function run({ baseURL }) {
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: "new", args: ["--no-sandbox"] });
  const { check, counts } = createChecker();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL + "/index.html", { waitUntil: "networkidle0" });
    await waitReady(page);

    // ---------------- XLSX (ExcelJS yazıcı; stiller dahil) ----------------
    const xlsx = await page.evaluate(async () => {
      const data = { rows: 100, cols: 26, activeSheet: 0, sheets: [{ name: "S1",
        cells: { "0,0": "Ad", "1,0": "Ali", "2,0": "Ayşe", "0,1": "Puan", "1,1": "90", "2,1": "85", "3,1": "=SUM(B2:B3)" }, formats: {} }] };
      XL.engine.load(data);
      const sid = XL.state.sheets[0].id;
      // Sayfa düzeni: birleştirme (A1:B1) + sütun genişliği (B=140px) + satır yüksekliği (1=30px)
      XL.state.layout[sid] = { colWidths: { 1: 140 }, rowHeights: { 0: 30 }, merges: [[0, 0, 0, 1]] };
      // Stiller (SheetJS yazamıyordu): A1 kalın+kırmızı yazı+sarı dolgu+ortalı; A2 italik
      XL.state.formats[sid + ":0:0"] = { bold: true, color: "#ff0000", bg: "#ffff00", align: "center" };
      XL.state.formats[sid + ":1:0"] = { italic: true };
      const ser = XL.engine.serialize();
      const blob = await XL.io.buildBlob(ser);
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(await blob.arrayBuffer());
      const ws = wb2.worksheets[0];
      const cv = (r, c) => { const v = ws.getCell(r, c).value; return v && typeof v === "object" ? v : v; };
      const a1 = ws.getCell(1, 1);
      const bFormula = ws.getCell(4, 2).value;
      return {
        name: ws.name,
        a2: String(cv(2, 1)), b2: String(cv(2, 2)),
        formula: bFormula && bFormula.formula ? "=" + bFormula.formula : null,
        mergeCount: (ws.model.merges || []).length, merge0: (ws.model.merges || [])[0] || null,
        colW: ws.getColumn(2).width, rowH: ws.getRow(1).height,
        bold: !!(a1.font && a1.font.bold), fontColor: a1.font && a1.font.color && a1.font.color.argb,
        fill: a1.fill && a1.fill.fgColor && a1.fill.fgColor.argb, align: a1.alignment && a1.alignment.horizontal,
        italic2: !!(ws.getCell(2, 1).font && ws.getCell(2, 1).font.italic),
      };
    });
    console.log("  XLSX:", JSON.stringify(xlsx));
    check("Sayfa adı korundu (S1)", xlsx.name === "S1", xlsx);
    check("Metin hücresi korundu (A2=Ali)", xlsx.a2 === "Ali", xlsx);
    check("Sayı hücresi korundu (B2=90)", xlsx.b2 === "90", xlsx);
    check("Formül korundu (=SUM(B2:B3))", xlsx.formula === "=SUM(B2:B3)", xlsx);
    check("Birleştirme korundu (A1:B1)", xlsx.mergeCount === 1 && xlsx.merge0 === "A1:B1", xlsx);
    check("Sütun genişliği korundu (~140px→~20)", Math.abs((xlsx.colW || 0) - 20) <= 4, xlsx);
    check("Satır yüksekliği korundu (~30px→~22.5pt)", Math.abs((xlsx.rowH || 0) - 22.5) <= 4, xlsx);
    check("Kalın stili yazıldı", xlsx.bold === true, xlsx);
    check("Yazı rengi yazıldı (kırmızı)", xlsx.fontColor === "FFFF0000", xlsx);
    check("Dolgu rengi yazıldı (sarı)", xlsx.fill === "FFFFFF00", xlsx);
    check("Hizalama yazıldı (center)", xlsx.align === "center", xlsx);
    check("İtalik stili (A2) yazıldı", xlsx.italic2 === true, xlsx);

    // --- XLSX stil OKUMA (ExcelJS): yaz→dosya→içe-aktar→stiller geri geldi mi? [Faz 6]
    // (Okuyucu artık font/dolgu/hizalamayı ExcelJS ile çıkarır; değer okuması SheetJS'te.)
    const xlsxRead = await page.evaluate(async () => {
      const data = { rows: 100, cols: 26, activeSheet: 0, sheets: [{ name: "S1",
        cells: { "0,0": "Ad", "1,0": "Ali" }, formats: {} }] };
      XL.engine.load(data);
      const sid = XL.state.sheets[0].id;
      XL.state.formats[sid + ":0:0"] = { bold: true, color: "#ff0000", bg: "#ffff00", align: "center" };
      XL.state.formats[sid + ":1:0"] = { italic: true, underline: true };
      const blob = await XL.io.buildBlob(XL.engine.serialize());
      // Tam içe-aktarma yolu (SheetJS değer + ExcelJS stil birleşimi)
      const file = new File([blob], "t.xlsx", { type: blob.type });
      const back = await XL.io.readFile(file);
      const fmt = back.sheets[0].formats || {};
      return { a1: fmt["0:0"] || null, a2: fmt["1:0"] || null, a2val: back.sheets[0].cells["1,0"] };
    });
    console.log("  XLSX-read:", JSON.stringify(xlsxRead));
    check("Okuma: değer korundu (A2=Ali)", xlsxRead.a2val === "Ali", xlsxRead);
    check("Okuma: kalın geri geldi", !!(xlsxRead.a1 && xlsxRead.a1.bold), xlsxRead);
    check("Okuma: yazı rengi geri geldi (#ff0000)", !!(xlsxRead.a1 && xlsxRead.a1.color === "#ff0000"), xlsxRead);
    check("Okuma: dolgu geri geldi (#ffff00)", !!(xlsxRead.a1 && xlsxRead.a1.bg === "#ffff00"), xlsxRead);
    check("Okuma: hizalama geri geldi (center)", !!(xlsxRead.a1 && xlsxRead.a1.align === "center"), xlsxRead);
    check("Okuma: italik+altı çizili geri geldi (A2)", !!(xlsxRead.a2 && xlsxRead.a2.italic && xlsxRead.a2.underline), xlsxRead);

    // --- Koşullu biçim + veri doğrulama: uygulama-içi round-trip (serialize→load) [Faz 6]
    const rules = await page.evaluate(() => {
      const data = { rows: 50, cols: 10, activeSheet: 0, sheets: [{ name: "R1",
        cells: { "0,0": "5", "1,0": "80", "2,0": "150" }, formats: {} }] };
      XL.engine.load(data);
      const sid = XL.state.sheets[0].id;
      XL.state.condfmt[sid] = [{ id: "cf1", range: [0, 0, 2, 0], kind: "cell", op: "gt", v1: "100", style: { bg: "#ffe08a" } }];
      XL.state.validations[sid] = { "5:0": { type: "list", list: ["Evet", "Hayır"] } };
      const ser = XL.engine.serialize();
      XL.engine.load(ser); // tekrar yükle
      const sid2 = XL.state.sheets[0].id;
      // A3=150 >100 → koşullu stil uygulanmalı; A1=5 → uygulanmamalı
      const styHigh = XL.condfmt.styleFor(2, 0, 150);
      const styLow = XL.condfmt.styleFor(0, 0, 5);
      const dv = XL.validation.ruleFor(5, 0);
      const bad = XL.validation.check(5, 0, "Belki");
      const good = XL.validation.check(5, 0, "Evet");
      return {
        cfKept: (XL.state.condfmt[sid2] || []).length, styHigh: styHigh && styHigh.bg, styLow,
        dvType: dv && dv.type, badOk: bad.ok, goodOk: good.ok,
      };
    });
    console.log("  RULES:", JSON.stringify(rules));
    check("Koşullu biçim kuralı round-trip korundu", rules.cfKept === 1, rules);
    check("Koşul sağlandığında stil uygulanıyor (>100)", !!rules.styHigh, rules);
    check("Koşul sağlanmadığında stil yok", rules.styLow === null, rules);
    check("Veri doğrulama (liste) round-trip korundu", rules.dvType === "list", rules);
    check("Geçersiz değer reddediliyor", rules.badOk === false, rules);
    check("Geçerli değer kabul ediliyor", rules.goodOk === true, rules);

    // ---------------- DOCX ----------------
    const docx = await page.evaluate(async () => {
      const root = document.createElement("div");
      root.innerHTML = '<h1>Başlık</h1><p>Normal <b>kalın</b> ve <i>italik</i> <span style="color:#ff0000">kırmızı</span> metin.</p><ul><li>bir</li><li>iki</li></ul>';
      const blob = await XL.docxIO.exportBlob(root, { size: "A4", orientation: "portrait", margin: "normal" });
      const buf = await blob.arrayBuffer();
      const res = await XL.docxIO.importArrayBuffer(buf);
      const d = document.createElement("div"); d.innerHTML = res.html;
      return {
        h1: !!d.querySelector("h1"), bold: !!d.querySelector("b,strong"), italic: !!d.querySelector("i,em"),
        red: /color\s*:\s*#?ff0000/i.test(res.html) || /color\s*:\s*rgb\(255,\s*0,\s*0\)/i.test(res.html),
        li: d.querySelectorAll("li").length, text: d.textContent.replace(/\s+/g, " ").trim(),
      };
    });
    console.log("  DOCX:", JSON.stringify(docx));
    check("Başlık (H1) korundu", docx.h1, docx);
    check("Kalın korundu", docx.bold, docx);
    check("İtalik korundu", docx.italic, docx);
    check("Renk korundu (kırmızı)", docx.red, docx);
    check("Liste 2 öğe korundu", docx.li === 2, docx);
    check("Metin içeriği korundu", /Başlık/.test(docx.text) && /kalın/.test(docx.text) && /bir/.test(docx.text), docx);

    // ---------------- DOCX dipnot (Faz 6) ----------------
    const fn = await page.evaluate(async () => {
      const root = document.createElement("div");
      root.innerHTML = '<p>Metin<sup class="wd-fn" data-text="Kaynak: 2026 raporu" contenteditable="false">1</sup> devam eder.</p>';
      const blob = await XL.docxIO.exportBlob(root, { size: "A4", orientation: "portrait", margin: "normal" });
      const buf = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const fnXml = zip.file("word/footnotes.xml") ? await zip.file("word/footnotes.xml").async("string") : "";
      const docXml = zip.file("word/document.xml") ? await zip.file("word/document.xml").async("string") : "";
      return { hasFootnotesPart: !!fnXml, textInFootnote: /Kaynak: 2026 raporu/.test(fnXml), refInBody: /footnoteReference/.test(docXml) };
    });
    console.log("  DOCX footnote:", JSON.stringify(fn));
    check("Dipnot bölümü (.docx) oluşturuldu", fn.hasFootnotesPart, fn);
    check("Dipnot metni footnotes.xml'de", fn.textInFootnote, fn);
    check("Dipnot başvurusu gövdede", fn.refInBody, fn);

    // ---------------- DOCX değişiklik izleme (Faz 6) ----------------
    const tc = await page.evaluate(async () => {
      const root = document.createElement("div");
      root.innerHTML = '<p>Kalan metin <ins class="tc tc-ins" data-author="Ali" data-ts="1760000000000">eklenen</ins> ve <del class="tc tc-del" data-author="Ali" data-ts="1760000000000">silinen</del> son.</p>';
      const blob = await XL.docxIO.exportBlob(root, { size: "A4", orientation: "portrait", margin: "normal" });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = zip.file("word/document.xml") ? await zip.file("word/document.xml").async("string") : "";
      return { wIns: /<w:ins\b/.test(xml), wDel: /<w:del\b/.test(xml), delText: /w:delText/.test(xml),
        author: /w:author="Ali"/.test(xml), insText: /eklenen/.test(xml) };
    });
    console.log("  DOCX track changes:", JSON.stringify(tc));
    check("Ekleme (w:ins) yazıldı", tc.wIns && tc.insText, tc);
    check("Silme (w:del/w:delText) yazıldı", tc.wDel && tc.delText, tc);
    check("Revizyon yazarı yazıldı", tc.author, tc);

    // ---------------- PPTX ----------------
    const pptx = await page.evaluate(async () => {
      const mode = XL.modes.pptx;
      const data = mode.createData();
      data.slides[0].elements[0].html = "Sunu Başlığı";
      data.slides[0].elements[0].rot = 30;   // döndürme (Faz 6)
      data.slides[0].elements[1].html = "Alt satır metni";
      const blob = await XL.pptxIO.exportBlob(data, mode);
      const buf = await blob.arrayBuffer();
      const back = await XL.pptxIO.importArrayBuffer(buf);
      const texts = [];
      let rot = null;
      back.slides.forEach((s) => s.elements.forEach((e) => {
        if (e.html) { const d = document.createElement("div"); d.innerHTML = e.html; const tx = d.textContent.trim(); texts.push(tx); if (/Sunu Başlığı/.test(tx)) rot = e.rot; }
      }));
      return { slides: back.slides.length, joined: texts.join(" | "), rot };
    });
    console.log("  PPTX:", JSON.stringify(pptx));
    check("Slayt sayısı korundu (1)", pptx.slides === 1, pptx);
    check("Başlık metni korundu", /Sunu Başlığı/.test(pptx.joined), pptx);
    check("Alt satır metni korundu", /Alt satır metni/.test(pptx.joined), pptx);
    check("Döndürme korundu (~30°)", Math.abs((pptx.rot || 0) - 30) <= 1, pptx);

    // ---------------- PPTX grafik (Faz 6) ----------------
    const chart = await page.evaluate(async () => {
      const mode = XL.modes.pptx;
      const data = mode.createData();
      data.slides[0].elements.push(Object.assign({ id: "c1", type: "chart", x: 180, y: 110, w: 600, h: 360 }, mode.defaultChart()));
      const blob = await XL.pptxIO.exportBlob(data, mode);
      const buf = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const parts = Object.keys(zip.files).filter((f) => /ppt\/charts\/chart\d+\.xml$/.test(f));
      // Uygulama içi SVG render de çalışmalı
      const svg = mode.chartSVG(data.slides[0].elements[data.slides[0].elements.length - 1]);
      return { parts: parts.length, svgHasRect: /<rect/.test(svg), svgHasText: /Grafik Başlığı|Chart Title/.test(svg) };
    });
    console.log("  PPTX chart:", JSON.stringify(chart));
    check("Grafik .pptx'e aktarıldı (chart part)", chart.parts >= 1, chart);
    check("Grafik SVG render edildi (bar)", chart.svgHasRect, chart);
    check("Grafik başlığı SVG'de", chart.svgHasText, chart);

    check("Sayfa hatası yok", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  return counts();
}

module.exports = { name: "Sentetik round-trip sadakati", run };
