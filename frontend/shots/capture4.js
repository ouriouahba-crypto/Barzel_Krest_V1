const { chromium } = require("playwright-core");
async function clickMarker(page){
  const box = await page.evaluate(()=>{const ps=[...document.querySelectorAll(".leaflet-container path")];let best=null,a=1e9;for(const p of ps){const b=p.getBBox&&p.getBBox();if(!b)continue;const ar=b.width*b.height;if(ar>0&&ar<a){a=ar;best=p;}}if(!best)return null;const r=best.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  if(box) await page.mouse.click(box.x,box.y); return !!box;
}
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  // 1) default city view, wide
  const p1 = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p1.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await p1.waitForTimeout(3200);
  await p1.screenshot({ path: "shots/carte_wide_ville.png", fullPage: true });
  console.log("shot ville done");
  await p1.close();
  // 2) freguesia selected (Afurada), detail closed, wide
  const p2 = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p2.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await p2.waitForTimeout(3000);
  await clickMarker(p2);
  await p2.waitForTimeout(1200);
  const close = p2.locator("aside button", { hasText: "✕" }).first();
  if (await close.count()) await close.click();
  await p2.waitForTimeout(900);
  await p2.screenshot({ path: "shots/carte_wide_freguesia.png", fullPage: true });
  console.log("shot freguesia done");
  await p2.close();
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
