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
        usesIDB: XL.store.available(), lsEmpty: !localStorage.getItem("uniteam-v1"),
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

    // --- i18n: dil değişince kalıcı arayüz (şerit + statik düğme) güncelleniyor mu?
    const i18n = await page.evaluate(() => {
      XL.i18n.set("tr");
      const tabTR = document.querySelector('#ribbon .rtab[data-tab="0"]').textContent.trim();
      XL.i18n.set("en");
      const tabEN = document.querySelector('#ribbon .rtab[data-tab="0"]').textContent.trim();
      const saveEN = document.getElementById("btn-save").textContent.trim();
      // Derin sözlük (DE): şerit sekmesi "Ekle"→"Einfügen" + statik düğme "Kaydet"→"Speichern"
      XL.i18n.set("de");
      const tab1DE = document.querySelector('#ribbon .rtab[data-tab="1"]').textContent.trim();
      const saveDE = document.getElementById("btn-save").textContent.trim();
      XL.i18n.set("tr");
      const saveTR = document.getElementById("btn-save").textContent.trim();
      return { tabTR, tabEN, saveEN, saveTR, tab1DE, saveDE };
    });
    console.log("  i18n:", JSON.stringify(i18n));
    check("Şerit TR'de 'Giriş'", i18n.tabTR === "Giriş", i18n);
    check("Dil değişince şerit EN'e döndü ('Home')", i18n.tabEN === "Home", i18n);
    check("Statik düğme EN oldu (Save)", /Save/.test(i18n.saveEN), i18n);
    check("TR'ye dönünce düğme tekrar 'Kaydet'", /Kaydet/.test(i18n.saveTR), i18n);
    check("DE derin sözlük: sekme 'Einfügen'", i18n.tab1DE === "Einfügen", i18n);
    check("DE derin sözlük: düğme 'Speichern'", /Speichern/.test(i18n.saveDE), i18n);

    // --- i18n: Türkçe fonksiyon adı (=TOPLA) hesaplanır + İngilizce'ye kanonikleşir
    const fn = await page.evaluate(() => {
      XL.engine.setCell(10, 5, "3");            // F11
      XL.engine.setCell(11, 5, "4");            // F12
      XL.engine.setCell(12, 5, "=TOPLA(F11:F12)"); // F13 (Türkçe SUM)
      return { val: XL.engine.getValue(12, 5), raw: XL.engine.getRaw(12, 5) };
    });
    console.log("  tr-fn:", JSON.stringify(fn));
    check("Türkçe =TOPLA hesaplandı (7)", fn.val === 7, fn);
    check("=TOPLA kayıtta İngilizce'ye çevrildi (=SUM)", /=SUM\(/i.test(fn.raw), fn);

    // --- i18n: bölgesel formül ayracı/ondalık (TR ";"/"," ↔ kanonik ","/".")
    const sep = await page.evaluate(() => {
      XL.i18n.set("tr");
      // Kullanıcı girişi yerel: =TOPLA(1,5;2,5) → 4.0 (virgül ondalık, ; argüman ayracı)
      XL.engine.setCellLocalized(20, 5, "=TOPLA(1,5;2,5)");   // F21
      const trVal = XL.engine.getValue(20, 5);
      const trCanon = XL.engine.getRaw(20, 5);               // kanonik saklanmalı
      const trShown = XL.engine.getRawLocalized(20, 5);      // yerel gösterilmeli
      // Argüman ayracı (hücre başvurusu, ondalık yok): =TOPLA(G1;G2)
      XL.engine.setCell(0, 6, "10"); XL.engine.setCell(1, 6, "5"); // G1,G2
      XL.engine.setCellLocalized(21, 5, "=TOPLA(G1;G2)");    // F22
      const refVal = XL.engine.getValue(21, 5);
      const refCanon = XL.engine.getRaw(21, 5);
      // EN'de aynı mantık kanonik: =SUM(1.5,2.5)
      XL.i18n.set("en");
      XL.engine.setCellLocalized(22, 5, "=SUM(1.5,2.5)");    // F23
      const enVal = XL.engine.getValue(22, 5);
      const enShown = XL.engine.getRawLocalized(22, 5);
      XL.i18n.set("tr");
      return { trVal, trCanon, trShown, refVal, refCanon, enVal, enShown };
    });
    console.log("  sep:", JSON.stringify(sep));
    check("TR ondalık virgül + ; ayracı hesaplandı (=4)", sep.trVal === 4, sep);
    check("Kanonik saklandı (=SUM(1.5,2.5))", /=SUM\(1\.5,2\.5\)/.test(sep.trCanon), sep);
    check("TR'de yerel gösterildi (=SUM(1,5;2,5))", /=SUM\(1,5;2,5\)/.test(sep.trShown), sep);
    check("TR ; argüman ayracı başvuruyla (=15)", sep.refVal === 15, sep);
    check("Başvuru ayracı kanonik virgül (G1,G2)", /=SUM\(G1,G2\)/.test(sep.refCanon), sep);
    check("EN nokta/virgül kanonik hesaplandı (=4)", sep.enVal === 4, sep);
    check("EN'de gösterim kanonik kaldı (=SUM(1.5,2.5))", /=SUM\(1\.5,2\.5\)/.test(sep.enShown), sep);

    // --- Gözlemlenebilirlik (Faz 7): yerel-yalnız (DSN yok → ağ isteği yok)
    const obs = await page.evaluate(() => {
      const booted = !!(XL.obs && XL.obs._booted);
      const dsn = XL.config.observability.dsn;        // yerelde boş olmalı
      XL.obs._crumbs.length = 0;                       // temiz başla
      XL.status("Test durumu");                        // XL.status köprüsü breadcrumb eklemeli
      XL.obs.info("merhaba", { x: 1 });
      // captureException kasıtlı olarak console.error'a yazar (doğru davranış); test
      // harness'ı console.error'ı hata saydığından yakalama sırasında geçici sustur.
      const _ce = console.error; console.error = () => {};
      const ev = XL.obs.captureException(new Error("sentetik-hata"), { op: "test" });
      console.error = _ce;
      const m = XL.obs.metric("test.sayac", 3, { unit: "adet" });
      // Halka tamponu _max'te sınırlanmalı
      for (let i = 0; i < 80; i++) XL.obs.breadcrumb("spam", "b" + i);
      const diag = XL.obs.diagnostics();
      return {
        booted, dsn,
        evName: ev && ev.name, evMsg: ev && ev.message, evHasCtx: !!(ev && ev.context && ev.context.release),
        metricVal: m && m.value,
        capped: XL.obs._crumbs.length <= XL.obs._max,
        hasRelease: !!(diag.context && diag.context.release),
        noUid: diag.context.authed === false,          // giriş yapılmadı → PII yok
      };
    });
    console.log("  obs:", JSON.stringify(obs));
    check("Gözlemlenebilirlik başlatıldı", obs.booted === true, obs);
    check("Yerelde DSN boş (ağ isteği yok)", obs.dsn === "", obs);
    check("İstisna yakalandı (name+message+bağlam)", obs.evName === "Error" && /sentetik-hata/.test(obs.evMsg) && obs.evHasCtx, obs);
    check("Metrik kaydedildi (=3)", obs.metricVal === 3, obs);
    check("Breadcrumb halkası _max ile sınırlı", obs.capped === true, obs);
    check("Tanılama bağlamı release içerir, PII yok", obs.hasRelease && obs.noUid, obs);

    // --- A3 code-splitting: ağır kütüphaneler başta yüklü DEĞİL, talepte tembel yüklenir
    const lazy = await page.evaluate(async () => {
      const before = { exceljs: typeof window.ExcelJS, pptx: typeof window.PptxGenJS, docx: typeof window.docx };
      await XL.vendor.ensure("exceljs");
      const afterExcel = typeof window.ExcelJS;
      return { before, afterExcel };
    });
    console.log("  lazy:", JSON.stringify(lazy));
    check("Başta ExcelJS yüklü değil (tembel)", lazy.before.exceljs === "undefined", lazy);
    check("Başta PptxGenJS/docx yüklü değil (tembel)", lazy.before.pptx === "undefined" && lazy.before.docx === "undefined", lazy);
    check("ensure() ile ExcelJS tembel yüklendi", lazy.afterExcel !== "undefined", lazy);

    // --- A4 veri hakları: yerel "verilerimi indir" (hesapsız) + gizlilik paneli
    const priv = await page.evaluate(async () => {
      const d = await XL.privacy.collectLocal();
      XL.privacy.openPanel();
      const hasLocalBtn = !!document.getElementById("pv-export-local");
      const hasCloudBtn = !!document.getElementById("pv-export-cloud");   // giriş yok → olmamalı
      const legalCount = document.querySelectorAll(".pv-legal").length;
      XL.hidePanel && XL.hidePanel();
      return { app: d.app, kind: d.kind, isArr: Array.isArray(d.docs), hasLocalBtn, hasCloudBtn, legalCount };
    });
    console.log("  priv:", JSON.stringify(priv));
    check("Yerel veri toplandı (app+docs dizisi)", priv.app === "UniTEAM" && priv.kind === "local" && priv.isArr, priv);
    check("Gizlilik panelinde yerel indir düğmesi var", priv.hasLocalBtn === true, priv);
    check("Giriş yokken hesap-verisi düğmesi yok", priv.hasCloudBtn === false, priv);
    check("Yasal metin iskeletleri render edildi (3)", priv.legalCount === 3, priv);

    // --- A5 faturalandırma: plan kartları girişsiz çizilir (katalog aynası, ağsız)
    const bill = await page.evaluate(() => {
      XL.billing.openPanel();                       // giriş yok → yalnız kartlar
      const cards = document.querySelectorAll(".bill-card").length;
      const curBadge = !!document.querySelector(".bill-card.current .bc-badge");  // free = mevcut
      const proPrice = XL.billing._price(XL.billing.PLAN_META.pro);
      const freePrice = XL.billing._price(XL.billing.PLAN_META.free);
      const gb = XL.billing._mb(5120);
      const tiers = XL.billing.TIERS.length;
      XL.hidePanel && XL.hidePanel();
      return { cards, curBadge, proPrice, freePrice, gb, tiers };
    });
    console.log("  bill:", JSON.stringify(bill));
    check("Plan kartları render edildi (4)", bill.cards === 4 && bill.tiers === 4, bill);
    check("Mevcut plan (free) girişsiz işaretli", bill.curBadge === true, bill);
    check("Pro fiyatı biçimlendi ($9 / ay)", /\$9/.test(bill.proPrice), bill);
    check("Free fiyatı 'Ücretsiz/Free'", /crets|Free/i.test(bill.freePrice), bill);
    check("Depolama MB→GB biçimi (5 GB)", bill.gb === "5 GB", bill);

    // --- A6 artımlı render primitifi: formulaCells yalnız formül hücrelerini döner
    //     + renderCell hedefli repaint (büyük sayfada tam render yerine).
    const inc = await page.evaluate(() => {
      const id = XL.state.activeSheetId;
      XL.engine.setCell(10, 0, "42", id);          // K11: düz değer
      XL.engine.setCell(11, 0, "=K11*2", id);      // K12: formül
      XL.engine.setCell(12, 0, "=K12+1", id);      // K13: formül
      const fc = XL.engine.formulaCells(id).map((o) => o.r + ":" + o.c).sort();
      const hasFormulas = fc.includes("11:0") && fc.includes("12:0");
      const noLiteral = !fc.includes("10:0");      // düz değer formül sayılmamalı
      // Hedefli repaint: K11'i değiştir, yalnız o hücreyi yeniden çiz.
      XL.engine.setCell(10, 0, "100", id);
      XL.grid.renderCell(10, 0);
      const td = XL.grid.cells[10][0];
      const painted = td && td.textContent === "100";
      return { fcLen: fc.length, hasFormulas, noLiteral, painted };
    });
    console.log("  inc:", JSON.stringify(inc));
    check("formulaCells formül hücrelerini buldu (K12,K13)", inc.hasFormulas === true, inc);
    check("formulaCells düz değeri (K11) hariç tuttu", inc.noLiteral === true, inc);
    check("renderCell hedefli repaint çalıştı (100)", inc.painted === true, inc);

    // --- Hesaplar/servisler kayıt defteri (XL.config.services) — offline, env'siz
    const svc = await page.evaluate(() => {
      const nowIds = XL.config.servicesWhen("now").map((s) => s.id);
      const futureIds = XL.config.servicesWhen("future").map((s) => s.id);
      return {
        nowHasCore: nowIds.includes("supabase") && nowIds.includes("cloudflare") && nowIds.includes("domain"),
        futureHasStripe: futureIds.includes("stripe") && futureIds.includes("googleCloud"),
        // Yerelde (localhost) bulut hesapları yapılandırılmamış sayılır:
        supaLocal: XL.config.serviceConfigured("supabase") === false,
        stripeOff: XL.config.serviceConfigured("stripe") === false,
        githubOn: XL.config.serviceConfigured("github") === true,
        gdriveUnavailable: XL.byos.provider("gdrive").available() === false,
      };
    });
    console.log("  svc:", JSON.stringify(svc));
    check("Kayıt defteri 'now' çekirdek hesapları içeriyor", svc.nowHasCore === true, svc);
    check("Kayıt defteri 'future' hesapları içeriyor (stripe/google)", svc.futureHasStripe === true, svc);
    check("Yerelde Supabase bulut hesabı 'yapılandırılmamış'", svc.supaLocal === true, svc);
    check("Stripe env'siz devre dışı; GitHub hazır", svc.stripeOff === true && svc.githubOn === true, svc);
    check("gdrive hesap yokken kullanılamaz (available=false)", svc.gdriveUnavailable === true, svc);

    check("Konsol/sayfa hatası yok", errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return counts();
}

module.exports = { name: "Kalıcılık (IndexedDB)", run };
