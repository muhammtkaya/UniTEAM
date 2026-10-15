// Kalıcılık (IndexedDB) uçtan uca testi.
// Veri gir → kaydet → sayfayı yeniden yükle → veri hâlâ duruyor mu?
const puppeteer = require("puppeteer-core");
const os = require("os");
const fs = require("fs");
const { resolveChrome, waitReady, createChecker } = require("./lib");

async function run({ baseURL }) {
  const profile = os.tmpdir() + "/wo-e2e-" + Date.now();
  const browser = await puppeteer.launch({
    executablePath: resolveChrome(), headless: "new", userDataDir: profile, args: ["--no-sandbox"],
  });
  const { check, counts } = createChecker();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

    // --- 1. tur: veri gir + kaydet
    await page.goto(baseURL + "/index.html", { waitUntil: "networkidle0" });
    await waitReady(page);
    const info = await page.evaluate(async () => {
      XL.engine.setCell(0, 0, "5");           // A1
      XL.engine.setCell(1, 0, "7");           // A2
      XL.engine.setCell(2, 0, "=A1+A2");      // A3
      XL.engine.setCell(3, 0, "=SUM(A1:A3)"); // A4
      XL.grid.render();
      const doc = XL.ws.active();
      doc.data = XL.ws.modeOf(doc).serialize();
      await XL.store.saveDoc(doc);
      await XL.store.saveMeta({ order: XL.ws.docs.map((d) => d.id), activeId: XL.ws.activeId });
      return {
        usesIDB: XL.store.available(), lsEmpty: !localStorage.getItem("weboffice-v2"),
        a3: XL.engine.getValue(2, 0), a4: XL.engine.getValue(3, 0), docName: doc.name,
      };
    });

    // --- 2. tur: yeniden yükle, veri kalıcı mı?
    await page.reload({ waitUntil: "networkidle0" });
    await waitReady(page);
    const after = await page.evaluate(() => ({
      docCount: XL.ws.docs.length, a3: XL.engine.getValue(2, 0),
      a4: XL.engine.getValue(3, 0), rawA3: XL.engine.getRaw(2, 0),
    }));

    console.log("  1. tur:", JSON.stringify(info));
    console.log("  2. tur:", JSON.stringify(after));
    check("IndexedDB kullanılıyor (localStorage değil)", info.usesIDB && info.lsEmpty, info);
    check("A3 = 12 (formül)", info.a3 === 12, info);
    check("A4 = 24 (SUM)", info.a4 === 24, info);
    check("Yeniden yükleme sonrası A3 hâlâ 12 (kalıcılık)", after.a3 === 12, after);
    check("Yeniden yükleme sonrası A4 hâlâ 24", after.a4 === 24, after);
    check("Formül metni korunmuş (=A1+A2)", after.rawA3 === "=A1+A2", after);
    check("Konsol/sayfa hatası yok", errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return counts();
}

module.exports = { name: "Kalıcılık (IndexedDB)", run };
