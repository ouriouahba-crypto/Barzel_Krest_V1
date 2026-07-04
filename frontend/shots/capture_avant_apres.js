// Captures avant/après du lot design final : vue-ensemble, rendement,
// ia-analyste (état vide + état conversation, vrai appel API).
// Usage : node shots/capture_avant_apres.js avant|apres
const { chromium } = require("playwright-core");

const PREFIX = process.argv[2] || "avant";
const W = 1440;

async function fitAndShoot(p, path) {
  const h = await p.evaluate(() => {
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    return Math.ceil((header?.offsetHeight || 0) + (main?.scrollHeight || 0)) + 8;
  });
  await p.setViewportSize({ width: W, height: Math.max(900, h) });
  await p.waitForTimeout(500);
  await p.screenshot({ path });
  console.log(path, "ok");
}

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });

  // 1) Vue d'ensemble
  const p1 = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p1.goto("http://localhost:3000/vue-ensemble", { waitUntil: "networkidle" });
  await p1.waitForTimeout(2200);
  await fitAndShoot(p1, `shots/${PREFIX}_vue_ensemble.png`);
  await p1.close();

  // 2) Rendement
  const p2 = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p2.goto("http://localhost:3000/rendement", { waitUntil: "networkidle" });
  await p2.waitForSelector("table tbody tr", { timeout: 15000 });
  await p2.waitForTimeout(1800);
  await fitAndShoot(p2, `shots/${PREFIX}_rendement.png`);
  await p2.close();

  // 3) IA Analyste : état vide
  const p3 = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p3.goto("http://localhost:3000/ia-analyste", { waitUntil: "networkidle" });
  await p3.waitForTimeout(1500);
  await p3.screenshot({ path: `shots/${PREFIX}_ia_analyste_vide.png` });
  console.log(`shots/${PREFIX}_ia_analyste_vide.png ok`);

  // 4) IA Analyste : état conversation (vrai appel, 1re question suggérée)
  await p3.locator("button", { hasText: "Où lancer une promotion résidentielle" }).first().click();
  await p3.waitForFunction(
    () => document.body.innerText.includes("ANALYSTE BARZEL") || document.body.innerText.toLowerCase().includes("analyste barzel"),
    { timeout: 60000 }
  );
  // attendre la fin de la rédaction (les 3 points disparaissent, la réponse est rendue)
  await p3.waitForFunction(
    () => !document.querySelector(".animate-bounce") && document.body.innerText.length > 1500,
    { timeout: 90000 }
  );
  await p3.waitForTimeout(800);
  await fitAndShoot(p3, `shots/${PREFIX}_ia_analyste_conversation.png`);
  await p3.close();

  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
