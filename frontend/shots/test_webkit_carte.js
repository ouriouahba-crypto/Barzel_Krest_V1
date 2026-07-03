// Repro Safari (WebKit) : clic sur une freguesia de la Carte → le DetailPanel
// promotion doit s'ouvrir. Capture console + pageerrors pour le diagnostic.
const { webkit, chromium } = require("playwright-core");

async function run(browserType, name) {
  const browser = await browserType.launch(
    name === "chrome" ? { channel: "chrome", headless: true } : { headless: true }
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await page.waitForSelector(".leaflet-interactive", { timeout: 20000 }).catch(() => logs.push("!! pas de polygone leaflet"));
  await page.waitForTimeout(1200);

  // Clique le centre d'un polygone (freguesia).
  const polys = await page.$$(".leaflet-interactive");
  logs.push(`polygones: ${polys.length}`);
  if (polys.length) {
    const box = await polys[3].boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.waitForTimeout(1500);

  // Le DetailPanel est l'aside fixé à droite (z-[1100]) ; ouvert = translate 0.
  const panel = await page.evaluate(() => {
    const asides = [...document.querySelectorAll("aside")];
    const dp = asides.find((a) => a.className.includes("fixed right-0"));
    if (!dp) return { found: false, asides: asides.map((a) => a.className.slice(0, 60)) };
    const cs = getComputedStyle(dp);
    const r = dp.getBoundingClientRect();
    return {
      found: true,
      transform: cs.transform,
      onScreen: r.left < window.innerWidth - 10,
      hasContent: !!dp.querySelector("h2"),
      title: dp.querySelector("h2")?.textContent ?? null,
      pillars: (dp.textContent || "").includes("Piliers"),
    };
  });
  await page.screenshot({ path: `shots/webkit_carte_${name}.png` });
  console.log(`=== ${name} ===`);
  console.log("panel:", JSON.stringify(panel));
  console.log(logs.join("\n"));
  await browser.close();
}

(async () => {
  await run(webkit, "webkit");
  await run(chromium, "chrome");
})().catch((e) => { console.error(e); process.exit(1); });
