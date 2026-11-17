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
        // İşletim sistemi dosya ilişkilendirmesi: kurulu PWA, çift tıklanan
        // Office dosyalarını açan varsayılan uygulama olabilir (Chrome/Edge).
        // İlgili tüketici js/workspace.js içindeki wireFileHandler() → launchQueue.
        file_handlers: [
          {
            action: "./",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              "application/vnd.ms-excel": [".xls"],
              "text/csv": [".csv"],
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
            },
          },
        ],
        // NOT: launch_handler'ı KASITLI olarak belirtmiyoruz. Linux/Chrome'da
        // "focus-existing" modunda, zaten açık bir pencereye yönlendirilen
        // dosya launchQueue'ya BOŞ (files:0) düşüyordu → dosya açılmıyordu.
        // Varsayılan davranış (navigate-new) her dosyayı yeni pencerede ve
        // dosyayı gerçekten ileterek açar; en güvenilir ve test edilmiş yol.
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
