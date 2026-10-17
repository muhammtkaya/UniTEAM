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

    // ---------------- XLSX ----------------
    const xlsx = await page.evaluate(() => {
      const data = { rows: 100, cols: 26, activeSheet: 0, sheets: [{ name: "S1",
        cells: { "0,0": "Ad", "1,0": "Ali", "2,0": "Ayşe", "0,1": "Puan", "1,1": "90", "2,1": "85", "3,1": "=SUM(B2:B3)" }, formats: {} }] };
      XL.engine.load(data);
      // Sayfa düzeni: birleştirme (A1:B1) + sütun genişliği (B=140px) + satır yüksekliği (1=30px)
      const sid = XL.state.sheets[0].id;
      XL.state.layout[sid] = { colWidths: { 1: 140 }, rowHeights: { 0: 30 }, merges: [[0, 0, 0, 1]] };
      const ser = XL.engine.serialize();
      let cap = null; const orig = XLSX.writeFile; XLSX.writeFile = (wb) => { cap = wb; };
      XL.io.save(ser, "t.xlsx"); XLSX.writeFile = orig;
      const out = XLSX.write(cap, { type: "array", bookType: "xlsx" });
      const wb2 = XLSX.read(out, { type: "array", cellFormula: true, cellStyles: true });
      const d2 = XL.io.workbookToData(wb2); const s = d2.sheets[0];
      return { name: s.name, a2: s.cells["1,0"], b2: s.cells["1,1"], formula: s.cells["3,1"],
        mergeCount: (s.merges || []).length, merge0: JSON.stringify((s.merges || [])[0] || null),
        colW: (s.colWidths || {})["1"], rowH: (s.rowHeights || {})["0"] };
    });
    console.log("  XLSX:", JSON.stringify(xlsx));
    check("Sayfa adı korundu (S1)", xlsx.name === "S1", xlsx);
    check("Metin hücresi korundu (A2=Ali)", xlsx.a2 === "Ali", xlsx);
    check("Sayı hücresi korundu (B2=90)", xlsx.b2 === "90", xlsx);
    check("Formül korundu (=SUM(B2:B3))", xlsx.formula === "=SUM(B2:B3)", xlsx);
    check("Birleştirme korundu (A1:B1)", xlsx.mergeCount === 1 && xlsx.merge0 === "[0,0,0,1]", xlsx);
    check("Sütun genişliği korundu (~140px)", Math.abs((xlsx.colW || 0) - 140) <= 8, xlsx);
    check("Satır yüksekliği korundu (~30px)", Math.abs((xlsx.rowH || 0) - 30) <= 8, xlsx);

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

    // ---------------- PPTX ----------------
    const pptx = await page.evaluate(async () => {
      const mode = XL.modes.pptx;
      const data = mode.createData();
      data.slides[0].elements[0].html = "Sunu Başlığı";
      data.slides[0].elements[1].html = "Alt satır metni";
      const blob = await XL.pptxIO.exportBlob(data, mode);
      const buf = await blob.arrayBuffer();
      const back = await XL.pptxIO.importArrayBuffer(buf);
      const texts = [];
      back.slides.forEach((s) => s.elements.forEach((e) => { if (e.html) { const d = document.createElement("div"); d.innerHTML = e.html; texts.push(d.textContent.trim()); } }));
      return { slides: back.slides.length, joined: texts.join(" | ") };
    });
    console.log("  PPTX:", JSON.stringify(pptx));
    check("Slayt sayısı korundu (1)", pptx.slides === 1, pptx);
    check("Başlık metni korundu", /Sunu Başlığı/.test(pptx.joined), pptx);
    check("Alt satır metni korundu", /Alt satır metni/.test(pptx.joined), pptx);

    check("Sayfa hatası yok", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  return counts();
}

module.exports = { name: "Sentetik round-trip sadakati", run };
