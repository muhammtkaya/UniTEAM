// UniTEAM test orkestratörü.
// Statik sunucuyu bir kez başlatır, tüm spec'leri sırayla çalıştırır, özet verir.
// Kullanım:  node test/run.js            (hepsi)
//            node test/run.js corpus     (sadece eşleşen spec'ler)
const { startServer } = require("./lib");

const SPECS = [
  require("./e2e"),
  require("./fidelity"),
  require("./corpus"),
];

(async () => {
  const filter = (process.argv[2] || "").toLowerCase();
  const fileNames = ["e2e", "fidelity", "corpus"];
  const chosen = filter
    ? SPECS.filter((s, i) => fileNames[i].includes(filter) || s.name.toLowerCase().includes(filter))
    : SPECS;

  const server = await startServer();
  console.log("Statik sunucu:", server.url, "\n");
  let totalPass = 0, totalFail = 0;
  try {
    for (const spec of chosen) {
      console.log("══ " + spec.name + " ══");
      try {
        const { pass, fail } = await spec.run({ baseURL: server.url });
        totalPass += pass; totalFail += fail;
        console.log(`  → ${pass} geçti, ${fail} kaldı\n`);
      } catch (e) {
        totalFail++;
        console.log("  ✗ SPEC ÇÖKTÜ:", e.message, "\n");
      }
    }
  } finally {
    await server.close();
  }
  console.log("═".repeat(40));
  console.log(`TOPLAM: ${totalPass} geçti, ${totalFail} kaldı`);
  process.exitCode = totalFail ? 1 : 0;
})();
