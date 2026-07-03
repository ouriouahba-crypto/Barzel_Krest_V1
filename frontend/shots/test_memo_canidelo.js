// QA point 1 : depuis la Vue d'ensemble SANS sélection préalable de freguesia,
// ouvrir la modal Mémo, choisir Canidelo au menu déroulant, angle Note
// d'acquisition, rédiger, et capturer la relecture. Sort la synthèse exécutive
// sur stdout (JSON) pour le rapport.
const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto("http://localhost:3000/vue-ensemble", { waitUntil: "networkidle" });

  // Ouvre la modal depuis la Sidebar (aucune freguesia sélectionnée sur la page).
  await page.getByText("Mémo d'investissement").click();
  await page.waitForSelector("select");

  // Le menu doit être utilisable tel quel : périmètre par défaut "ville".
  const placeholder = await page.$eval("select", (s) => s.value);
  const nOptions = await page.$$eval("select option", (o) => o.length);

  await page.selectOption("select", "canidelo");
  await page.getByText("Note d'acquisition", { exact: true }).click();
  await page.screenshot({ path: "shots/memo_modal_canidelo_form.png" });

  await page.getByText("Rédiger le mémo").click();
  await page.waitForSelector("textarea:not([placeholder])", { timeout: 180000 });
  // La relecture est affichée : lit la synthèse exécutive (1er textarea de section).
  await page.waitForTimeout(500);
  const exec = await page.$$eval("textarea", (t) => t[0]?.value ?? "");
  await page.screenshot({ path: "shots/memo_modal_canidelo_review.png" });

  console.log(JSON.stringify({ placeholder, nOptions, exec }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
