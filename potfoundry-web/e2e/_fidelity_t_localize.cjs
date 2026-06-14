// GENERIC t-localizer: collect above-tol samples for any style and histogram by t
// (and by u) to see if the residual is rim/base-localized (t>0.99 → rim-junction,
// excludable like DragonScales) or broad (→ accept). Reusable across the tail.
// Usage: PF_STYLE=LowPolyFacet node e2e/_fidelity_t_localize.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'LowPolyFacet';
const TARGET = Number(process.env.PF_TARGET || 1000000);
const REF_RES = Number(process.env.PF_REF_RES || 0);
function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  await page.addInitScript((rr) => {
    window.__pfConforming = true; window.__pfSurfaceFidelityExact = true;
    if (rr > 0) { window.__pfReferenceDenseRes = rr; window.__pfReferenceBicubic = true; }
  }, REF_RES);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
  const d = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, collectAboveTol: 20000 }), TARGET), 600000, 'diag');
  await browser.close();
  if (!d) { console.log(`${STYLE}: NULL`); return; }
  const s = d.aboveTolSamples || [];
  console.log(`=== ${STYLE} t-localize: ${s.length} above-tol (chordMax ${d.chordMaxMm.toFixed(3)}, vtx ${d.vertexMaxMm.toFixed(4)}, nAbove ${d.nAbove}/${d.samples}) ===`);
  if (!s.length) { console.log('(none)'); return; }
  let sumMm = 0, maxMm = 0; const bins = new Array(20).fill(0);
  let rim = 0, base = 0, interior = 0;
  for (const p of s) {
    sumMm += p.mm; if (p.mm > maxMm) maxMm = p.mm;
    bins[Math.min(19, Math.max(0, Math.floor(p.t * 20)))]++;
    if (p.t > 0.97) rim++; else if (p.t < 0.03) base++; else interior++;
  }
  const pct = (n) => `${(100 * n / s.length).toFixed(1)}%`;
  console.log(`mean ${(sumMm / s.length).toFixed(3)}mm  max ${maxMm.toFixed(3)}mm`);
  console.log(`base(t<0.03) ${pct(base)}   interior ${pct(interior)}   rim(t>0.97) ${pct(rim)}`);
  console.log('t-histogram (0.05 bins): ' + bins.map((n, i) => `${(i / 20).toFixed(2)}:${pct(n)}`).join(' '));
})();
