// Audit de contraste WCAG + tailles de police — 10 pages.
// Usage : node shots/audit_contrast.js shots/audit_avant.json
// Pour chaque élément portant du texte direct : couleur effective (fill pour les
// <text> SVG, color sinon), fond effectif (composition alpha en remontant le DOM,
// opacité des ancêtres incluse), ratio WCAG, taille de police.
const { chromium } = require("playwright-core");

const OUT = process.argv[2] || "shots/audit_contrast.json";
const PAGES = [
  "/gaia",
  "/vue-ensemble",
  "/comparer",
  "/prix-marge",
  "/rendement",
  "/arbitrage",
  "/foncier",
  "/fiscalite",
  "/energie",
  "/ia-analyste",
];

const EXTRACT = () => {
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+%?))?\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const blendOver = (top, bot) => ({
    r: top.r * top.a + bot.r * (1 - top.a),
    g: top.g * top.a + bot.g * (1 - top.a),
    b: top.b * top.a + bot.b * (1 - top.a),
    a: 1,
  });
  const opUp = (el) => {
    let p = 1;
    let n = el;
    while (n && n.nodeType === 1) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (!isNaN(o)) p *= o;
      n = n.parentElement;
    }
    return p;
  };
  // Fond effectif : couches bg des ancêtres (alpha × opacité cumulée), composées
  // sur le cream du body.
  const effBg = (el) => {
    const layers = [];
    let unknown = false;
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") unknown = true;
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) layers.push({ ...bg, a: Math.min(1, bg.a * opUp(n)) });
      n = n.parentElement;
    }
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || { r: 248, g: 245, b: 238, a: 1 };
    let out = { ...bodyBg, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blendOver(layers[i], out);
    return { color: out, unknown };
  };

  const records = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let t;
  while ((t = walk.nextNode())) {
    const txt = t.textContent.replace(/\s+/g, " ").trim();
    if (!txt || !/[A-Za-zÀ-ÿ0-9]/.test(txt)) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!r || r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const isSvgText = el.namespaceURI === "http://www.w3.org/2000/svg";
    const raw = isSvgText ? cs.fill : cs.color;
    const fg0 = parse(raw);
    if (!fg0) continue;
    const fg = { ...fg0, a: Math.min(1, fg0.a * opUp(el)) };
    const { color: bg, unknown } = effBg(el);
    const fgFlat = fg.a < 1 ? blendOver(fg, bg) : fg;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    // AA : 4.5:1, sauf « large text » (>=24px, ou >=18.66px gras) : 3:1
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    records.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") || "").slice(0, 90),
      text: txt.slice(0, 60),
      size,
      weight,
      svg: isSvgText,
      fg: `rgb(${Math.round(fgFlat.r)},${Math.round(fgFlat.g)},${Math.round(fgFlat.b)})`,
      bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      ratio: Math.round(ratio(fgFlat, bg) * 100) / 100,
      need: large ? 3 : 4.5,
      bgUnknown: unknown,
    });
  }
  return records;
};

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const all = {};
  for (const route of PAGES) {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.goto("http://localhost:3000" + route, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    all[route] = await p.evaluate(EXTRACT);
    await p.close();
    console.log(`${route}: ${all[route].length} éléments texte`);
  }
  await b.close();

  // Synthèse
  const flat = [];
  for (const [page, recs] of Object.entries(all)) for (const r of recs) flat.push({ page, ...r });
  const small = flat.filter((r) => r.size < 12);
  const fails = flat.filter((r) => !r.bgUnknown && r.ratio < r.need);
  // dédup par (page, fg, bg, size) en gardant le pire snippet
  const byKey = new Map();
  for (const f of fails) {
    const k = `${f.page}|${f.fg}|${f.bg}|${f.size}`;
    if (!byKey.has(k) || f.ratio < byKey.get(k).ratio) byKey.set(k, f);
  }
  const worst = [...byKey.values()].sort((a, b) => a.ratio - b.ratio);

  require("fs").writeFileSync(OUT, JSON.stringify({ all, summary: { small: small.length, fails: fails.length } }, null, 1));
  console.log(`\n=== ${flat.length} éléments texte, ${small.length} sous 12px, ${fails.length} sous AA (hors fonds inconnus) ===`);
  console.log("\nPires ratios (dédupliqués) :");
  for (const w of worst.slice(0, 25))
    console.log(
      ` ${w.ratio.toFixed(2)}:1 (requis ${w.need}) ${w.page} <${w.tag}> ${w.size}px ${w.fg} sur ${w.bg} — "${w.text.slice(0, 45)}"`
    );
  const sizeDist = {};
  for (const f of flat) sizeDist[f.size] = (sizeDist[f.size] || 0) + 1;
  console.log("\nDistribution des tailles :");
  for (const s of Object.keys(sizeDist).sort((a, b) => a - b)) console.log(` ${s}px × ${sizeDist[s]}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
