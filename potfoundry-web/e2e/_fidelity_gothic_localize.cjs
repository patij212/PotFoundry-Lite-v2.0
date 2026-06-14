// Localize the GothicArches chord residual by FEATURE FAMILY (the extractor
// already pins column edges u=k/N + mullions u=(k+0.5)/N + horizontal bands; the
// un-pinned families are the arch RIBS (curve archZ(theta) in t) and the upper-tier
// diamond LATTICE). Bucket above-tol samples to see which family dominates.
// Usage: node e2e/_fidelity_gothic_localize.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 1000000);
function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}
// GothicArches defaults: N=12, z0=0.15, zh=0.7*(1-z0), p=1.2.
function coords(u, t) {
  const N = 12, z0 = 0.15, p = 1.2;
  const archApex = z0 + 0.7 * (1 - z0);     // 0.745
  const topStart = z0 + 0.65 * (archApex - z0); // 0.537
  const xAbs = Math.abs(Math.cos(Math.PI * u * N));
  const f = ((u * N) % 1 + 1) % 1;           // 0 at column (u=k/N), 0.5 at mullion
  const colDist = Math.min(f, 1 - f);        // 0 at a column edge
  const mulDist = Math.abs(f - 0.5);         // 0 at a mullion
  const archY = Math.pow(Math.max(0, 1 - Math.pow(xAbs, p)), 1 / p);
  const archZ = z0 + (archApex - z0) * archY;
  return { xAbs, colDist, mulDist, ribDist: Math.abs(t - archZ), topStart, archApex, z0 };
}
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.__pfConforming = true; window.__pfSurfaceFidelityExact = true; });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate(() => window.__pfFidelity.setStyle('GothicArches')), 60000, 'setStyle');
  const d = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, collectAboveTol: 20000 }), TARGET), 600000, 'diag');
  await browser.close();
  if (!d) { console.log('NULL'); return; }
  const s = d.aboveTolSamples || [];
  console.log(`=== GothicArches localize: ${s.length} above-tol (chordMax ${d.chordMaxMm.toFixed(3)}, nAbove ${d.nAbove}/${d.samples}) ===`);
  if (!s.length) { console.log('(none)'); return; }
  let lower = 0, upper = 0, band = 0, rib = 0, col = 0, mul = 0, latticeOnly = 0, other = 0;
  let sumMm = 0, maxMm = 0;
  for (const p of s) {
    const c = coords(p.u, p.t); sumMm += p.mm; if (p.mm > maxMm) maxMm = p.mm;
    if (p.t < c.topStart) lower++; else upper++;
    const nearBand = Math.abs(p.t) < 0.04 || Math.abs(p.t - c.topStart) < 0.04 || Math.abs(p.t - 1) < 0.04;
    const nearRib = c.ribDist < 0.03 && p.t < c.archApex + 0.05;
    const nearCol = c.colDist < 0.06;
    const nearMul = c.mulDist < 0.06;
    if (nearBand) band++;
    if (nearRib) rib++;
    if (nearCol) col++;
    if (nearMul) mul++;
    if (p.t > c.topStart && !nearBand && !nearCol && !nearMul) latticeOnly++;
    if (!nearBand && !nearRib && !nearCol && !nearMul && p.t < c.topStart) other++;
  }
  const pct = (n) => `${(100 * n / s.length).toFixed(1)}%`;
  console.log(`mean ${(sumMm / s.length).toFixed(3)}mm  max ${maxMm.toFixed(3)}mm`);
  console.log(`tier:    lower(t<${(coords(0, 0).topStart).toFixed(2)}) ${pct(lower)}   upper ${pct(upper)}`);
  console.log(`family (may overlap):  arch-rib ${pct(rib)}   column ${pct(col)}   mullion ${pct(mul)}   band ${pct(band)}`);
  console.log(`upper-tier lattice (not band/col/mul): ${pct(latticeOnly)}`);
  console.log(`lower-tier OTHER (none of rib/col/mul/band): ${pct(other)}`);
})();
