// Invariant du classement (Vue d'ensemble) : pour CHAQUE ville du registre,
// étiquettes de noms (axe) = étiquettes de valeur (LabelList) = barres = nb de
// zones. Échoue si Recharts décime quoi que ce soit (générique à la taille de
// la ville : 15 à Gaia, 24 à Lisbonne). Vérifie aussi la troncature propre
// (jamais d'espace traînant avant l'ellipse).
const { chromium } = require("playwright-core");

const EXPECTED = { gaia: 15, lisbonne: 24 };

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  let failures = 0;
  for (const [city, expected] of Object.entries(EXPECTED)) {
    const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
    await p.goto("http://localhost:3000/vue-ensemble", { waitUntil: "networkidle" });
    await p.waitForTimeout(2200);
    if (city !== "gaia") {
      await p.locator("header select").first().selectOption(city);
      await p.waitForTimeout(3500);
    }
    const m = await p.evaluate(() => {
      const ticks = [...document.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick text")];
      return {
        ticks: ticks.length,
        labels: document.querySelectorAll(".recharts-bar .recharts-label-list text").length,
        bars: document.querySelectorAll(".recharts-bar-rectangle").length,
        badTrunc: ticks.map((t) => t.textContent || "").filter((x) => / …$/.test(x)),
      };
    });
    const ok = m.ticks === expected && m.labels === expected && m.bars === expected && m.badTrunc.length === 0;
    if (!ok) failures++;
    console.log(`${ok ? "✓" : "✗"} ${city}: ${m.ticks} noms, ${m.labels} valeurs, ${m.bars} barres (attendu ${expected})` +
      (m.badTrunc.length ? ` | troncature sale: ${m.badTrunc}` : ""));
    await p.close();
  }
  await b.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
