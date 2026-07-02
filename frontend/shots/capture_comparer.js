const { chromium } = require("playwright-core");

const URL = "http://localhost:3000/comparer";
const W = 1440;

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
  const p = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForSelector("section h3", { timeout: 15000 });
  await p.waitForTimeout(1800); // 4 modes prefetch + dials settle
  await fitAndShoot(p, "shots/comparer_residentiel.png");
  console.log("shot comparer done");
  await p.close();
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
