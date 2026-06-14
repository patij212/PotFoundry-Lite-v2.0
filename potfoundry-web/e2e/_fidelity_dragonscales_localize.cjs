// Localize the DragonScales chord residual: collect above-tol samples and bucket
// them by the scale-coordinate (rim vs interior; scale apex/flank/groove; scale
// edge) to reveal a CLEAN exclusion band for a creaseStraddle field. The row-step
// C0 jumps are ALREADY excluded (creaseT), so this shows the REMAINING residual.
// Usage: node e2e/_fidelity_dragonscales_localize.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 1000000);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}
const TAU = 2 * Math.PI;

// DragonScales defaults (styles.wgsl dragon_scales_radius): rows=8, per_row=16, overlap=0.5.
function coords(u, t) {
  const rows = 8, perRow = 16, overlap = 0.5;
  const rowPhase = t * rows;
  const row = Math.floor(rowPhase);
  const rowLocal = rowPhase - row;
  const stagger = (row % 2 === 1) ? 0.5 * TAU / perRow : 0;
  const scaleTheta = u * TAU + stagger;
  let scalePhase = (scaleTheta * perRow) % TAU; if (scalePhase < 0) scalePhase += TAU;
  const scaleLocal = scalePhase / TAU;
  const xDist = Math.abs(scaleLocal - 0.5) * 2;
  const yDist = Math.abs(rowLocal - overlap) / Math.max(1 - overlap * 0.5, 0.1);
  const dist = Math.sqrt(xDist * xDist + yDist * yDist);
  return { rowLocal, scaleLocal, xDist, yDist, dist };
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.__pfConforming = true; window.__pfSurfaceFidelityExact = true; });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate(() => window.__pfFidelity.setStyle('DragonScales')), 60000, 'setStyle');
  const d = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, collectAboveTol: 20000 }), TARGET), 600000, 'diag');
  await browser.close();
  if (!d) { console.log('NULL'); return; }
  const s = d.aboveTolSamples || [];
  console.log(`=== DragonScales localize: ${s.length} above-tol samples (chordMax ${d.chordMaxMm.toFixed(3)}, nAbove ${d.nAbove}/${d.samples}) ===`);
  if (!s.length) { console.log('(none — already sub-tol)'); return; }
  // Buckets.
  let rim = 0, interior = 0;
  let apex = 0, flank = 0, groove = 0;
  let edge = 0, center = 0, mid = 0;
  let rowEdge = 0; // near a row boundary (rowLocal near 0/1)
  let sumMm = 0, maxMm = 0;
  for (const p of s) {
    const c = coords(p.u, p.t);
    sumMm += p.mm; if (p.mm > maxMm) maxMm = p.mm;
    if (p.t > 0.95 || p.t < 0.05) rim++; else interior++;
    if (c.dist < 0.35) apex++; else if (c.dist < 0.85) flank++; else groove++;
    if (c.xDist > 0.8) edge++; else if (c.xDist < 0.25) center++; else mid++;
    if (c.rowLocal < 0.1 || c.rowLocal > 0.9) rowEdge++;
  }
  const pct = (n) => `${(100 * n / s.length).toFixed(1)}%`;
  console.log(`mean ${(sumMm / s.length).toFixed(3)}mm  max ${maxMm.toFixed(3)}mm`);
  console.log(`t-location:  rim(t>0.95||<0.05) ${pct(rim)}   interior ${pct(interior)}`);
  console.log(`dist bucket: apex(<0.35) ${pct(apex)}   flank(0.35-0.85) ${pct(flank)}   groove(>0.85) ${pct(groove)}`);
  console.log(`xDist:       scale-edge(>0.8) ${pct(edge)}   mid(0.25-0.8) ${pct(mid)}   scale-center(<0.25) ${pct(center)}`);
  console.log(`row-edge (rowLocal<0.1||>0.9): ${pct(rowEdge)}`);
})();
