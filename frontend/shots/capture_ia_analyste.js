const { chromium } = require("playwright-core");
const W = 1440;
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: W, height: 1180 }, deviceScaleFactor: 2 });
  await p.goto("http://localhost:3000/ia-analyste", { waitUntil: "networkidle" });
  await p.waitForSelector("input", { timeout: 15000 });
  await p.waitForTimeout(1200);
  // Pose la 2e question suggérée et attend la réponse de l'analyste
  await p.getByRole("button", { name: /conserver ou céder/ }).click();
  await p.waitForSelector("text=Analyste Barzel", { timeout: 8000 });
  await p.waitForSelector("p.whitespace-pre-line", { timeout: 90000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: "shots/ia_analyste.png" });
  console.log("shot ia_analyste done");
  await p.close();
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
