const { chromium } = require("playwright-core");

const URL = "http://localhost:3000/prix-marge";
const W = 1440;

async function ready(p) {
  await p.waitForSelector("table tbody tr", { timeout: 15000 });
  await p.waitForFunction(
    () => document.querySelectorAll("table tbody tr").length >= 5,
    { timeout: 15000 }
  );
  await p.waitForTimeout(1600); // chart + bar animations settle
}

// The app scrolls inside <main>, not the document, so fullPage won't work.
// Grow the viewport to the full content height, then shoot the whole thing.
async function fitAndShoot(p, path) {
  const h = await p.evaluate(() => {
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    return Math.ceil((header?.offsetHeight || 0) + (main?.scrollHeight || 0)) + 8;
  });
  await p.setViewportSize({ width: W, height: h });
  await p.waitForTimeout(500);
  await p.screenshot({ path });
}

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });

  // 1) Résidentiel, Afurada sélectionnée (défaut)
  const p1 = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p1.goto(URL, { waitUntil: "networkidle" });
  await ready(p1);
  await fitAndShoot(p1, "shots/prixmarge_residentiel_afurada.png");
  console.log("shot résidentiel done");
  await p1.close();

  // 2) Bureaux
  const p2 = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p2.goto(URL, { waitUntil: "networkidle" });
  await ready(p2);
  await p2.getByRole("button", { name: "Bureaux", exact: true }).click();
  await p2.waitForTimeout(1800); // refetch office class + re-render
  await ready(p2);
  await fitAndShoot(p2, "shots/prixmarge_bureaux.png");
  console.log("shot bureaux done");
  await p2.close();

  // 3) Logistique
  const p3 = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p3.goto(URL, { waitUntil: "networkidle" });
  await ready(p3);
  await p3.getByRole("button", { name: "Logistique", exact: true }).click();
  await p3.waitForTimeout(1800);
  await ready(p3);
  await fitAndShoot(p3, "shots/prixmarge_logistique.png");
  console.log("shot logistique done");
  await p3.close();

  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
