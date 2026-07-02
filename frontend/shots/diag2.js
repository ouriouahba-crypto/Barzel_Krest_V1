const { chromium } = require("playwright-core");
async function clickMarker(page){
  const box = await page.evaluate(()=>{const ps=[...document.querySelectorAll(".leaflet-container path")];let best=null,a=1e9;for(const p of ps){const b=p.getBBox&&p.getBBox();if(!b)continue;const ar=b.width*b.height;if(ar>0&&ar<a){a=ar;best=p;}}if(!best)return null;const r=best.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  if(box) await page.mouse.click(box.x,box.y); return !!box;
}
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto("http://localhost:3000/gaia", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await clickMarker(p);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "shots/diag_selected.png", fullPage: true });
  // dump any floating text elements in the map area (x<900)
  const floats = await p.evaluate(()=>{
    const out=[]; const walk=document.querySelectorAll('.leaflet-container *');
    // capture leaflet overlay pane text + tooltips
    document.querySelectorAll('.leaflet-tooltip, .leaflet-marker-pane, .leaflet-overlay-pane text').forEach(e=>out.push((e.className||'')+':'+(e.textContent||'').slice(0,30)));
    return out;
  });
  console.log("floats:", JSON.stringify(floats));
  console.log("diag2 done");
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
