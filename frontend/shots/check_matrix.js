// Contrôle 10 pages × {Chrome, WebKit} × {1280, 1440, 1920} :
// rendu (contenu présent), erreurs JS (pageerror), console.error, débordement
// horizontal du document. Bruit connu ignoré : erreurs de prefetch RSC Next
// sous WebKit en dev (?_rsc=… access control checks).
const PAGES = ["/gaia", "/vue-ensemble", "/comparer", "/prix-marge", "/rendement",
  "/arbitrage", "/foncier", "/fiscalite", "/energie", "/ia-analyste"];
const WIDTHS = [1280, 1440, 1920];
const CITIES = ["gaia", "lisbonne"];
const RSC_NOISE = /_rsc=|access control checks|Failed to load resource|defaultProps/i;

(async () => {
  let failures = 0;
  for (const engine of ["chromium", "webkit"]) {
    // playwright-core lance les deux : Chrome système (channel) et le WebKit
    // du cache ms-playwright (build 2311, cf. browsers.json de playwright-core).
    const pw = require("playwright-core");
    const browser =
      engine === "chromium"
        ? await pw.chromium.launch({ channel: "chrome", headless: true })
        : await pw.webkit.launch({ headless: true });
    for (const w of WIDTHS) {
      for (const citySlug of CITIES) {
      for (const route of PAGES) {
        const p = await browser.newPage({ viewport: { width: w, height: 950 } });
        const errs = [];
        p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
        p.on("console", (m) => {
          if (m.type() === "error" && !RSC_NOISE.test(m.text())) errs.push(`console: ${m.text().slice(0, 120)}`);
        });
        try {
          await p.goto("http://localhost:3000" + route, { waitUntil: "networkidle", timeout: 45000 });
          await p.waitForTimeout(1600);
          if (citySlug !== "gaia") {
            await p.locator("header select").first().selectOption(citySlug);
          }
          await p.waitForTimeout(2200);
          const m = await p.evaluate(() => ({
            textLen: document.body.innerText.length,
            hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }));
          const bad = [];
          if (m.textLen < 200) bad.push(`peu de contenu (${m.textLen})`);
          if (m.hOverflow > 1) bad.push(`débordement horizontal ${m.hOverflow}px`);
          bad.push(...errs.filter((e, i, a) => a.indexOf(e) === i).slice(0, 3));
          if (bad.length) { failures++; console.log(`✗ ${engine} ${w} ${citySlug} ${route}: ${bad.join(" | ")}`); }
          else console.log(`✓ ${engine} ${w} ${citySlug} ${route}`);
        } catch (e) {
          failures++;
          console.log(`✗ ${engine} ${w} ${citySlug} ${route}: ${String(e).slice(0, 120)}`);
        }
        await p.close();
      }
      }
    }
    await browser.close();
  }
  console.log(failures ? `\n${failures} échec(s)` : "\nMatrice 10 pages × 2 villes × 2 navigateurs × 3 largeurs : tout est vert");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
