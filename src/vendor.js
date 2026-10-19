/* src/vendor.js — dış kütüphaneler → window global'leri
 *
 * Neden böyle? Mevcut kod (js/*) bu kütüphaneleri CDN'den gelen GLOBAL adlarla
 * (XLSX, Chart, mammoth, docx, JSZip, PptxGenJS, supabase) kullanıyordu. Artık
 * CDN yerine npm'den geliyorlar ve Vite bunları tek pakete bundle ediyor. Geriye
 * dönük uyumluluk için burada aynı global adlara atıyoruz; böylece js/* dosyaları
 * TEK SATIR bile değişmeden çalışmaya devam eder. (İleride js/* kademeli olarak
 * import/export modüllerine geçince bu köprü kalkacak.)
 */
/* --- Başlangıçta yüklenen (küçük/yaygın/erken gereken) --- */
import * as XLSX from "xlsx";
import Chart from "chart.js/auto";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";

// `import * as XLSX` bir salt-okunur ES modül namespace'idir. Eski CDN UMD global'i
// ise düz/yazılabilir bir nesneydi; bazı kodlar (ör. testler writeFile'ı geçici
// override ediyor) buna güvenir. Yazılabilir sığ kopya ile eski davranışı koru.
window.XLSX = { ...XLSX };     // okuma + CSV + korpus oracle (SheetJS)
window.Chart = Chart;
window.JSZip = JSZip;
// auth.js `supabase.createClient(...)` bekliyor → aynı şekle sok.
window.supabase = { createClient };
window.Y = Y;  // Yjs (gerçek zamanlı CRDT) — realtime.js kullanır

/* --- TEMBEL yüklenen (A3 / code-splitting) ---
 * exceljs/docx/pptxgenjs/mammoth paketin en ağır kısmıdır ve YALNIZ dosya
 * kaydet/aç sırasında gerekir. Statik import'tan çıkarıldılar → Vite her birini
 * ayrı bir async chunk'a böler. İlk çağrıda dinamik import edilir, eski global
 * ada köprülenir ve söz önbelleğe alınır (ikinci çağrı anında döner). Böylece
 * ilk açılış paketi belirgin küçülür; js/* çağrı yerleri yalnız `await ensure()`
 * ekler, global kullanımları aynen kalır. */
const _lazy = {};
window.__lazyVendor = {
  ensure(name) {
    if (_lazy[name]) return _lazy[name];
    let p;
    switch (name) {
      case "exceljs":   p = import("exceljs").then((m) => { window.ExcelJS = m.default || m; }); break;
      case "docx":      p = import("docx").then((m) => { window.docx = m.default && m.default.Document ? m.default : m; }); break;
      case "pptxgenjs": p = import("pptxgenjs").then((m) => { window.PptxGenJS = m.default || m; }); break;
      case "mammoth":   p = import("mammoth/mammoth.browser.js").then((m) => { window.mammoth = m.default || m; }); break;
      default:          p = Promise.reject(new Error("bilinmeyen kütüphane: " + name));
    }
    _lazy[name] = p;
    return p;
  },
};

// --- Ortam değişkenleri (.env → tarayıcı) ---
// Vite, import.meta.env.VITE_* değerlerini derleme anında koda gömer.
// config.js bunları window.__ENV__ üzerinden okur (yoksa yerel varsayılana düşer).
window.__ENV__ = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  WORKER_URL: import.meta.env.VITE_WORKER_URL || "",
  // Gözlemlenebilirlik (Faz 7). Boşsa yerel-yalnız (ağ isteği yok).
  OBSERVABILITY_DSN: import.meta.env.VITE_OBSERVABILITY_DSN || "",
  APP_ENV: import.meta.env.VITE_APP_ENV || "",
  OBS_SAMPLE_RATE: import.meta.env.VITE_OBS_SAMPLE_RATE || "",
};
