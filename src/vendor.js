/* src/vendor.js — dış kütüphaneler → window global'leri
 *
 * Neden böyle? Mevcut kod (js/*) bu kütüphaneleri CDN'den gelen GLOBAL adlarla
 * (XLSX, Chart, mammoth, docx, JSZip, PptxGenJS, supabase) kullanıyordu. Artık
 * CDN yerine npm'den geliyorlar ve Vite bunları tek pakete bundle ediyor. Geriye
 * dönük uyumluluk için burada aynı global adlara atıyoruz; böylece js/* dosyaları
 * TEK SATIR bile değişmeden çalışmaya devam eder. (İleride js/* kademeli olarak
 * import/export modüllerine geçince bu köprü kalkacak.)
 */
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import Chart from "chart.js/auto";
import mammoth from "mammoth/mammoth.browser.js";
import * as docx from "docx";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";

// `import * as XLSX` bir salt-okunur ES modül namespace'idir. Eski CDN UMD global'i
// ise düz/yazılabilir bir nesneydi; bazı kodlar (ör. testler writeFile'ı geçici
// override ediyor) buna güvenir. Yazılabilir sığ kopya ile eski davranışı koru.
window.XLSX = { ...XLSX };     // okuma + CSV + korpus oracle (SheetJS)
window.ExcelJS = ExcelJS;      // .xlsx YAZIMI (font/dolgu/hizalama stilleri — SheetJS yazamaz)
window.Chart = Chart;
window.mammoth = mammoth;
window.docx = docx;
window.JSZip = JSZip;
window.PptxGenJS = PptxGenJS;
// auth.js `supabase.createClient(...)` bekliyor → aynı şekle sok.
window.supabase = { createClient };
window.Y = Y;  // Yjs (gerçek zamanlı CRDT) — realtime.js kullanır

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
