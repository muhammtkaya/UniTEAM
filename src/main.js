/* src/main.js — uygulamanın TEK giriş noktası (Vite entry)
 *
 * Eskiden index.html'de ~20 ayrı <script> etiketi elle sıralanıyordu. Artık
 * tek modül: Vite, aşağıdaki import'ları doğru sırada çözüp tek pakete derler.
 * Sıra ÖNEMLİ (dosyalar global XL üzerine kendilerini ekliyor):
 *   1) vendor  → window.XLSX, Chart, mammoth, docx, JSZip, PptxGenJS, supabase
 *   2) core    → global XL nesnesini tanımlar
 *   3) config/auth/storage → XL'e eklenir
 *   4) excel/* → formula ÖNCE (HyperFormula'yı yayımlar), sonra engine vb.
 *   5) word/*, pptx/*, workspace (en son; DOMContentLoaded'da uygulamayı başlatır)
 */
import "./vendor.js";

// --- Ortak çekirdek ---
import "../js/core.js";
import "../js/i18n.js";
import "../js/config.js";
import "../js/observability.js";   // config'den hemen sonra: global hataları baştan yakalar (Faz 7)
import "../js/auth.js";
import "../js/byos.js";
import "../js/cloud.js";
import "../js/org.js";
import "../js/billing.js";
import "../js/security.js";
import "../js/comments.js";
import "../js/realtime.js";
import "../js/storage.js";
import "../js/privacy.js";
import "../js/macros.js";

// --- Excel modu (formula, HyperFormula'yı yayımladığı için ÖNCE) ---
import "../js/excel/formula.js";
import "../js/excel/engine.js";
import "../js/excel/layout.js";
import "../js/excel/condfmt.js";
import "../js/excel/validation.js";
import "../js/excel/format.js";
import "../js/excel/grid.js";
import "../js/excel/io.js";
import "../js/excel/charts.js";
import "../js/excel/pivot.js";
import "../js/excel/mode.js";

// --- Word modu ---
import "../js/word/docx-io.js";
import "../js/word/mode.js";

// --- PowerPoint modu ---
import "../js/pptx/pptx-io.js";
import "../js/pptx/mode.js";

// --- Çalışma alanı (belgeler + başlatma) ---
import "../js/workspace.js";

// --- Onboarding (karşılama + yardım + şablonlar) — en son ---
import "../js/onboarding.js";
