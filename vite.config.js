import { defineConfig } from "vite";

// Vite yapılandırması
// - root: proje kökü (index.html burada)
// - base: "./" → çıktı göreli yollarla çalışır (herhangi bir alt dizinden sunulabilir)
// - build.outDir: "dist" → `npm run build` çıktısı
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
