const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.getByText("Toutes les freguesias").click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: "shots/carte_search_open.png" });
  console.log("search shot done");
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
