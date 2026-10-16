// UniTEAM test altyapısı — paylaşılan yardımcılar.
// Bağımlılık: puppeteer-core (test/package.json) + yerel Chrome.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, ".."); // proje kökü (package.json, vite.config.js)
const DIST = path.join(ROOT, "dist");     // Vite derleme çıktısı (sunulan kök)

// Testler artık DERLENMİŞ uygulamayı sunar: index.html ES modül + bare import
// kullandığı için ham dosyalar düz statik sunucuda çalışmaz; önce `vite build`.
function buildApp() {
  execSync("npx vite build", { cwd: ROOT, stdio: "inherit" });
}

// Chrome yürütülebilir yolunu çöz: önce ortam değişkeni, sonra bilinen yollar.
function resolveChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA + "/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
  throw new Error("Chrome bulunamadı. CHROME_PATH ortam değişkenini ayarlayın.");
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

// Proje kökünü servis eden statik HTTP sunucusu başlat. {url, close} döner.
function startServer(root = DIST) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end("404"); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// Basit test toplayıcı.
function createChecker() {
  let pass = 0, fail = 0;
  const check = (label, cond, extra) => {
    if (cond) pass++; else fail++;
    console.log(`  ${cond ? "✓" : "✗"} ${label}${!cond && extra !== undefined ? "  → " + JSON.stringify(extra) : ""}`);
  };
  return { check, result: () => ({ pass, get fail() { return fail; } }), counts: () => ({ pass, fail }) };
}

// Uygulamanın yüklenmesini bekle.
async function waitReady(page) {
  await page.waitForFunction(
    () => typeof XL !== "undefined" && XL.ws && XL.ws.docs && XL.ws.docs.length && document.querySelector("#grid"),
    { timeout: 15000 }
  );
}

module.exports = { ROOT, DIST, buildApp, resolveChrome, startServer, createChecker, waitReady };
