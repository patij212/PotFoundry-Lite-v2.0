// utScatter.cjs — DEV-ONLY. Render an (u,t) outlier scatter (dev-colored) to PNG via a headless canvas.
// Usage: NODE_PATH="$(pwd)/node_modules" node research/render/utScatter.cjs <out.png> <ndjson> [devMax] [title]
//   ndjson rows: {uc,tc,radial|dev|trueDev}. Colors low→high dev blue→red. u on X (0..1), t on Y (0..1, up).
const fs = require('fs');
const { chromium } = require('@playwright/test');

(async () => {
  const [, , outPng, ndjson, devMaxArg, title] = process.argv;
  const rows = fs.readFileSync(ndjson, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x));
  const dev = (r) => (r.trueDev ?? r.dev ?? r.radial);
  const devMax = devMaxArg ? Number(devMaxArg) : Math.max(...rows.map(dev));
  const W = 1200, H = 1200, M = 70;
  const pts = rows.map((r) => ({ x: r.uc, y: r.tc, d: dev(r) }));
  const html = `<!doctype html><html><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas>
  <script>
  const pts=${JSON.stringify(pts)}; const devMax=${devMax}; const W=${W},H=${H},M=${M};
  const c=document.getElementById('c'); const g=c.getContext('2d');
  g.fillStyle='#111'; g.fillRect(0,0,W,H);
  // axes box
  g.strokeStyle='#555'; g.strokeRect(M,M,W-2*M,H-2*M);
  const px=(u)=>M+u*(W-2*M); const py=(t)=>H-M-t*(H-2*M); // t up
  // color ramp blue->cyan->yellow->red
  function col(f){ f=Math.max(0,Math.min(1,f)); const r=Math.round(255*Math.min(1,Math.max(0,1.5-Math.abs(4*f-3)))); const gr=Math.round(255*Math.min(1,Math.max(0,1.5-Math.abs(4*f-2)))); const b=Math.round(255*Math.min(1,Math.max(0,1.5-Math.abs(4*f-1)))); return 'rgb('+r+','+gr+','+b+')'; }
  for(const p of pts){ g.fillStyle=col(p.d/devMax); g.fillRect(px(p.x)-1.2,py(p.y)-1.2,2.4,2.4); }
  g.fillStyle='#ddd'; g.font='22px sans-serif';
  g.fillText(${JSON.stringify(title || 'outlier (u,t) scatter')},M,40);
  g.font='16px sans-serif'; g.fillText('u (azimuth) →',W/2-40,H-20);
  g.save(); g.translate(24,H/2+40); g.rotate(-Math.PI/2); g.fillText('t (height) →',0,0); g.restore();
  // legend
  for(let i=0;i<200;i++){ g.fillStyle=col(i/200); g.fillRect(W-M-20,M+i,16,1); }
  g.fillStyle='#ddd'; g.fillText('dev='+devMax.toFixed(3)+'mm',W-M-120,M-6); g.fillText('0',W-M-14,M+214);
  g.fillText('n='+pts.length,M,H-40);
  </script></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.locator('#c').screenshot({ path: outPng });
  await browser.close();
  console.log('wrote', outPng, 'n=', rows.length, 'devMax=', devMax);
})();
