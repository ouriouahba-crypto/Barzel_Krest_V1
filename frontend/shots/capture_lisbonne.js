// Captures Lisbonne (lot 2a) : vue d'ensemble, carte, prix & marge, IA analyste.
// La ville est basculée via le sélecteur du Header (monté dès 2 villes).
const { chromium } = require("playwright-core");
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

async function goCity(p, route) {
  await p.goto("http://localhost:3000" + route, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator("header select").first().selectOption("lisbonne");
  await p.waitForTimeout(3500);
}

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });

  await goCity(p, "/vue-ensemble");
  await fitAndShoot(p, "shots/lisbonne_vue_ensemble.png");

  await goCity(p, "/gaia");
  await p.waitForSelector(".leaflet-interactive", { timeout: 20000 });
  await p.setViewportSize({ width: W, height: 1024 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "shots/lisbonne_carte.png" });
  console.log("shots/lisbonne_carte.png ok");

  await goCity(p, "/prix-marge");
  await p.waitForSelector("table tbody tr", { timeout: 20000 });
  await fitAndShoot(p, "shots/lisbonne_prixmarge.png");

  await goCity(p, "/ia-analyste");
  await p.setViewportSize({ width: W, height: 1024 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: "shots/lisbonne_ia_analyste.png" });
  console.log("shots/lisbonne_ia_analyste.png ok");

  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
