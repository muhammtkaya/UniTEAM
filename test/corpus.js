// GERÇEK MS Office dosyalarıyla sadakat testi (asıl risk burada).
// test/corpus/ içine gerçek .xlsx/.docx/.pptx koyun; bu test onları okur.
//
// Yöntem: Her dosya için BAĞIMSIZ bir "ground truth" (JSZip + ham OOXML'den
// metin çıkarımı — bizim parser'ımızdan bağımsız) üretir, sonra bizim
// okuyucumuzun (XL.io / XL.docxIO / XL.pptxIO) bu metnin ne kadarını
// yakaladığını ölçer. docx/pptx için ayrıca round-trip (oku→yaz→oku).
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const { resolveChrome, waitReady, createChecker } = require("./lib");

const CORPUS_DIR = path.join(__dirname, "corpus");
const COVERAGE_THRESHOLD = 0.9; // ground-truth metin token'larının en az %90'ı yakalanmalı

// Tarayıcıya enjekte edilecek yardımcılar (string olarak page.evaluate'e gider).
const BROWSER_HELPERS = `
function decodeEntities(s){return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");}
function tokenize(text){return new Set((text||"").toLowerCase().split(/\\s+/).map(t=>t.replace(/[.,;:!?()\\[\\]"']/g,"")).filter(t=>t.length>=2));}
// Blok-duyarlı metin: öğeyi geçici olarak DOM'a ekleyip innerText okur
// (textContent blok sınırlarına boşluk koymaz → yanlış bitişik token'lar).
function blockText(html){const h=document.createElement("div");h.innerHTML=html;document.body.appendChild(h);const t=h.innerText;h.remove();return t;}
function coverage(truthSet,got){const gotSet=tokenize(got);let hit=0;const miss=[];for(const t of truthSet){if(gotSet.has(t))hit++;else if(miss.length<12)miss.push(t);}return{total:truthSet.size,hit,ratio:truthSet.size?hit/truthSet.size:1,miss};}
// Ham XML'den <TAG>...</TAG> içeriklerini toplar (bağımsız ground truth).
async function groundTruth(zip,ext){
  let texts=[];
  const addFrom=(xml,tag)=>{const re=new RegExp("<"+tag+"[^>]*>([\\\\s\\\\S]*?)</"+tag+">","g");let m;while((m=re.exec(xml))){texts.push(decodeEntities(m[1].replace(/<[^>]+>/g,"")));}};
  const files=Object.keys(zip.files);
  if(ext==="xlsx"){
    for(const f of files){if(/xl\\/sharedStrings\\.xml$/.test(f)){addFrom(await zip.files[f].async("string"),"t");}}
    for(const f of files){if(/xl\\/worksheets\\/sheet\\d+\\.xml$/.test(f)){const xml=await zip.files[f].async("string");addFrom(xml,"t");/* inline + <v> sayı metinleri */const vs=xml.match(/<v>([\\s\\S]*?)<\\/v>/g)||[];vs.forEach(v=>texts.push(decodeEntities(v.replace(/<[^>]+>/g,""))));}}
  }else if(ext==="docx"){
    for(const f of files){if(/word\\/(document|header\\d*|footer\\d*)\\.xml$/.test(f)){addFrom(await zip.files[f].async("string"),"w:t");}}
  }else if(ext==="pptx"){
    for(const f of files){if(/ppt\\/slides\\/slide\\d+\\.xml$/.test(f)){addFrom(await zip.files[f].async("string"),"a:t");}}
  }
  return tokenize(texts.join(" "));
}
// Bizim okuyucumuzun ürettiği düz metin.
async function ourText(bytes,ext){
  if(ext==="xlsx"){
    const wb=XLSX.read(bytes,{type:"array",cellFormula:true,cellStyles:true});
    const data=XL.io.workbookToData(wb);let out=[];
    data.sheets.forEach(s=>{out.push(s.name);Object.values(s.cells).forEach(v=>out.push(String(v)));});
    return out.join(" ");
  }else if(ext==="docx"){
    const res=await XL.docxIO.importArrayBuffer(bytes.buffer||bytes);
    return blockText(res.html);
  }else if(ext==="pptx"){
    const back=await XL.pptxIO.importArrayBuffer(bytes.buffer||bytes);let out=[];
    back.slides.forEach(s=>s.elements.forEach(e=>{if(e.html){out.push(blockText(e.html));}if(e.rows){e.rows.forEach(r=>r.forEach(c=>out.push(typeof c==="string"?c:(c&&c.text)||"")));}}));
    return out.join(" ");
  }
}
// docx/pptx round-trip: oku→yaz→tekrar oku, metin korunuyor mu.
async function roundTripText(bytes,ext){
  if(ext==="docx"){
    const res=await XL.docxIO.importArrayBuffer(bytes.buffer||bytes);
    const root=document.createElement("div");root.innerHTML=res.html;
    const blob=await XL.docxIO.exportBlob(root,{size:"A4",orientation:"portrait",margin:"normal"});
    const buf=await blob.arrayBuffer();const res2=await XL.docxIO.importArrayBuffer(buf);
    return blockText(res2.html);
  }else if(ext==="pptx"){
    const back=await XL.pptxIO.importArrayBuffer(bytes.buffer||bytes);
    const blob=await XL.pptxIO.exportBlob(back,XL.modes.pptx);
    const buf=await blob.arrayBuffer();const back2=await XL.pptxIO.importArrayBuffer(buf);let out=[];
    back2.slides.forEach(s=>s.elements.forEach(e=>{if(e.html){out.push(blockText(e.html));}}));
    return out.join(" ");
  }
  return null;
}
`;

function listCorpus() {
  if (!fs.existsSync(CORPUS_DIR)) return [];
  return fs.readdirSync(CORPUS_DIR)
    .filter((f) => /\.(xlsx|docx|pptx)$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ name: f, ext: f.split(".").pop().toLowerCase(), path: path.join(CORPUS_DIR, f) }));
}

async function run({ baseURL }) {
  const files = listCorpus();
  const { check, counts } = createChecker();

  if (files.length === 0) {
    console.log("  ⚠ test/corpus/ boş — gerçek Office dosyası yok, bu test ATLANDI.");
    console.log("    Gerçek .xlsx/.docx/.pptx dosyalarını test/corpus/ içine koyup tekrar çalıştırın.");
    return counts(); // 0/0 — başarısız saymaz
  }

  const browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL + "/index.html", { waitUntil: "networkidle0" });
    await waitReady(page);
    await page.evaluate(BROWSER_HELPERS);

    console.log(`  ${files.length} gerçek dosya bulundu.`);
    for (const f of files) {
      const bytes = Array.from(fs.readFileSync(f.path));
      const r = await page.evaluate(async (b64Arr, ext) => {
        const bytes = new Uint8Array(b64Arr);
        try {
          const zip = await JSZip.loadAsync(bytes);
          const truth = await groundTruth(zip, ext);
          const got = await ourText(bytes, ext);
          const cov = coverage(truth, got);
          let rt = null;
          const rtText = await roundTripText(bytes, ext);
          if (rtText !== null) rt = coverage(truth, rtText);
          return { ok: true, cov, rt };
        } catch (e) { return { ok: false, error: e.message }; }
      }, bytes, f.ext);

      if (!r.ok) { check(`${f.name} — okunabildi`, false, r.error); continue; }
      const c = r.cov;
      check(`${f.name} — metin kapsamı ≥%${COVERAGE_THRESHOLD * 100} (${(c.ratio * 100).toFixed(1)}%, ${c.hit}/${c.total})`,
        c.ratio >= COVERAGE_THRESHOLD || c.total === 0, c.miss);
      if (r.rt) {
        check(`${f.name} — round-trip metin kapsamı ≥%${COVERAGE_THRESHOLD * 100} (${(r.rt.ratio * 100).toFixed(1)}%)`,
          r.rt.ratio >= COVERAGE_THRESHOLD || r.rt.total === 0, r.rt.miss);
      }
    }
    check("Sayfa hatası yok", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  return counts();
}

module.exports = { name: "Gerçek MS Office dosyaları", run };
