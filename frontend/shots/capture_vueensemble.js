const { chromium } = require("playwright-core");

const URL = "http://localhost:3000/vue-ensemble";
const W = 1440;

async function ready(p) {
  await p.waitForSelector("svg", { timeout: 15000 });
  // wait for the podium (needs the 4-mode data resolved)
  await p.waitForFunction(() => document.body.innerText.includes("top 3 freguesias"), { timeout: 15000 });
  await p.waitForTimeout(1600);
}

// App scrolls inside <main>, not the document: grow the viewport to full content.
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

  const p1 = await b.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  await p1.goto(URL, { waitUntil: "networkidle" });
  await ready(p1);
  await fitAndShoot(p1, "shots/vue_ensemble_residentiel.png");
  console.log("shot résidentiel done");
  await p1.close();

  const p2 = await b.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  await p2.goto(URL, { waitUntil: "networkidle" });
  await ready(p2);
  await p2.getByRole("button", { name: "Bureaux", exact: true }).click();
  await p2.waitForTimeout(1800);
  await ready(p2);
  await fitAndShoot(p2, "shots/vue_ensemble_bureaux.png");
  console.log("shot bureaux done");
  await p2.close();

  // Hôtellerie : degraded arbitrage (no top-verdict freguesia)
  const p3 = await b.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  await p3.goto(URL, { waitUntil: "networkidle" });
  await ready(p3);
  await p3.getByRole("button", { name: "Hôtellerie", exact: true }).click();
  await p3.waitForTimeout(1800);
  await ready(p3);
  await fitAndShoot(p3, "shots/vue_ensemble_hotellerie.png");
  console.log("shot hôtellerie done");
  await p3.close();

  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
