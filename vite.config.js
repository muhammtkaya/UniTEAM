import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Vite yapılandırması
// - base "./" → çıktı göreli yollarla çalışır
// - VitePWA → manifest + service worker (Workbox) ile yüklenebilir/çevrimdışı uygulama
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: { port: 5173, open: true },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",      // yeni sürüm çıkınca sessizce güncelle
      injectRegister: "auto",           // SW kaydını otomatik ekle
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "UniTEAM",
        short_name: "UniTEAM",
        description: "Tarayıcıda Excel/Word/PowerPoint muadili ofis uygulaması",
        lang: "tr",
        theme_color: "#107c41",
        background_color: "#ffffff",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Windows'ta "Birlikte aç → UniTEAM" (varsayılan dosya açıcı). PWA yüklendikten
        // sonra bu uzantılar UniTEAM'e bağlanır; açılan dosya launchQueue ile gelir.
        // Not: .xlsm makroları tarayıcıda ÇALIŞTIRILMAZ, yalnız içerik okunur.
        file_handlers: [
          {
            action: "./",
            icons: [
              { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            ],
            accept: {
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.template": [".xltx"],
              "application/vnd.ms-excel.template.macroEnabled.12": [".xltm"],
              "application/vnd.ms-excel": [".xls"],
              "text/csv": [".csv"],
            },
          },
        ],
        // Yeni dosya açıldığında mevcut pencereyi öne getir (yeniden yükleme yok).
        launch_handler: { client_mode: "focus-existing" },
      },
      workbox: {
        // Uygulama kabuğunu (JS/CSS/HTML) çevrimdışı için önbelleğe al.
        // Ana paket ~2.4 MB olduğu için varsayılan 2 MB sınırını yükseltiyoruz.
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2,ico}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
