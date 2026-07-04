const { chromium } = require("playwright-core");

async function clickHayaMarker(page) {
  // The Haya CircleMarker is the smallest SVG path in the map: find + click it.
  const box = await page.evaluate(() => {
    const paths = [...document.querySelectorAll(".leaflet-container path")];
    let best = null, area = Infinity;
    for (const p of paths) {
      const b = p.getBBox && p.getBBox();
      if (!b) continue;
      const a = b.width * b.height;
      if (a > 0 && a < area) { area = a; best = p; }
    }
    if (!best) return null;
    const r = best.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (box) await page.mouse.click(box.x, box.y);
  return !!box;
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  // 1) CARTE : bureaux, Afurada selected
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  await p1.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await p1.waitForTimeout(2500);
  await p1.getByRole("button", { name: "Bureaux" }).click();
  await p1.waitForTimeout(2000); // class refetch + map recolor
  await clickHayaMarker(p1); // selects Afurada (opens detail)
  await p1.waitForTimeout(1200);
  // close the detail drawer so the epured map + compact panel show
  const close = p1.locator("aside button", { hasText: "✕" }).first();
  if (await close.count()) await close.click();
  await p1.waitForTimeout(800);
  await p1.screenshot({ path: "shots/carte_bureaux_afurada.png", fullPage: true });
  console.log("shot carte done");
  await p1.close();

  // 2) VUE D'ENSEMBLE : résidentiel (default)
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 1460 }, deviceScaleFactor: 1 });
  await p2.goto("http://localhost:3000/vue-ensemble", { waitUntil: "networkidle" });
  await p2.getByText("Classement des freguesias").waitFor();
  await p2.waitForTimeout(3200);
  await p2.screenshot({ path: "shots/vue_ensemble_residentiel.png", fullPage: true });
  console.log("shot vue-ensemble done");
  await p2.close();

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
