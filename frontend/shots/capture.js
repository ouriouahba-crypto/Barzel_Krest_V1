const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1460 }, // tall enough for the dense one-page view
    deviceScaleFactor: 1,
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/.test(m.text())) console.log("PAGE ERR:", m.text());
  });

  await page.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await page.getByText("Scores par mode").waitFor();
  await page.getByText("Classement des freguesias").waitFor();
  await page.waitForTimeout(3200); // map polygons + Recharts + all-mode prefetch

  await page.screenshot({ path: "shots/gaia_promotion.png", fullPage: true });
  console.log("shot 1 (promotion, full page) done");

  // Detail panel (Haya), preserved, capture for reference
  await page.locator('button:has-text("Santa Marinha")').first().click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "shots/gaia_detail.png", fullPage: true });
  console.log("shot 2 (detail) done");

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
