const { chromium } = require("playwright-core");
const W = 1440;
async function fitAndShoot(p, path) {
  const h = await p.evaluate(() => {
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    return Math.ceil((header?.offsetHeight || 0) + (main?.scrollHeight || 0)) + 8;
  });
  await p.setViewportSize({ width: W, height: h });
  await p.waitForTimeout(400);
  await p.screenshot({ path });
}
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: W, height: 1024 }, deviceScaleFactor: 2 });
  await p.goto("http://localhost:3000/energie", { waitUntil: "networkidle" });
  await p.waitForSelector("table tbody tr", { timeout: 15000 });
  await p.waitForTimeout(1800);
  await fitAndShoot(p, "shots/energie.png");
  console.log("shot energie done");
  await p.close();
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
