// Invariant « zéro négatif » : aucun « -0% » / « -0.0% » / « -0,0 % » rendu
// dans le DOM, sur les 10 pages × 2 villes (classe par défaut), plus les 4
// autres classes sur les pages denses en chiffres réactives à la classe.
// Relève aussi la phrase de bannière de /prix-marge (gabarit « marché
// sélectif » à Lisbonne, gabarit historique intact à Gaia).
const { chromium } = require("playwright-core");

const PAGES = ["/gaia", "/vue-ensemble", "/comparer", "/prix-marge", "/rendement",
  "/arbitrage", "/foncier", "/fiscalite", "/energie", "/ia-analyste"];
const CLASS_PAGES = ["/vue-ensemble", "/prix-marge", "/rendement", "/arbitrage"];
const CLASSES = ["Bureaux", "Hôtellerie", "Logistique", "Commerce"]; // + Résidentiel (défaut)
const CITIES = ["gaia", "lisbonne"];
// « -0% », « -0.0% », « -0,00 % »… mais pas « -0,3% » (valeur légitime).
const MINUS_ZERO = /-0([.,]0+)?\s*%/;

async function open(browser, route, city) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await p.goto("http://localhost:3000" + route, { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(1500);
  if (city !== "gaia") {
    await p.locator("header select").first().selectOption(city);
    await p.waitForTimeout(2200);
  }
  return p;
}

function scan(text, label, failures) {
  const m = text.match(MINUS_ZERO);
  if (m) {
    const i = text.indexOf(m[0]);
    failures.push(`${label}: « …${text.slice(Math.max(0, i - 60), i + 20).replace(/\n/g, " ")}… »`);
    console.log(`✗ ${label}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];
  const banners = [];
  for (const city of CITIES) {
    for (const route of PAGES) {
      const p = await open(browser, route, city);
      scan(await p.evaluate(() => document.body.innerText), `${city} ${route}`, failures);
      if (route === "/prix-marge") {
        const line = await p.evaluate(() => {
          const m = document.body.innerText.match(/La promotion [^\n]+|Aucune freguesia ne porte[^\n]+/);
          return m ? m[0] : "(bannière absente)";
        });
        banners.push(`${city}: ${line}`);
      }
      if (CLASS_PAGES.includes(route)) {
        for (const cls of CLASSES) {
          await p.getByRole("button", { name: cls, exact: true }).click();
          await p.waitForTimeout(1900);
          scan(await p.evaluate(() => document.body.innerText), `${city} ${route} [${cls}]`, failures);
        }
      }
      await p.close();
    }
  }
  await browser.close();
  console.log("\n--- Bannières Prix & marge (résidentiel) ---");
  for (const b of banners) console.log(b);
  if (failures.length) {
    console.log(`\n${failures.length} occurrence(s) de zéro négatif :`);
    for (const f of failures) console.log("  " + f);
    process.exit(1);
  }
  console.log("\nOK : aucun zéro négatif rendu (" + (CITIES.length * PAGES.length + CITIES.length * CLASS_PAGES.length * CLASSES.length) + " vues).");
})();
