// GENERALITY CHECK — does the deep crease-refinement config that CAD-graded Gyroid
// also collapse the perp-3D chord on the OTHER tangled styles, while leaving SMOOTH
// styles cheap (proving the density is ADAPTIVE, not a uniform bloat)? One fixed config.
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 16000000);
const DENSE_N = 6;
const DIAG_TIMEOUT = 600000;

const STYLES = (process.env.PF_STYLES ||
  'GyroidManifold,BasketWeave,GothicArches,CelticKnot,CelticTriquetra,HarmonicRipple')
  .split(',').map((s) => s.trim());
// The near-tol config from the Gyroid sweep (adaptive: only crease cells densify).
const CFG = { cells: 4, maxSag: 0.005, maxLevel: 15, nRing: 2048 };

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript((c) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfConformingCellSamples = c.cells;
      window.__pfConformingMaxSag = c.maxSag;
      window.__pfConformingMaxLevel = c.maxLevel;
      window.__pfConformingNRing = c.nRing;
    }, CFG);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    const perp = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    return perp;
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  console.log(`=== CREASE GENERALITY (cfg cells4/maxSag0.005/L15/nR2048, denseN=${DENSE_N}, tol=0.1mm) ===`);
  console.log('style             | chordMax | perp_p99 | nAbove%  | vtxMax  | wallTris | trusted');
  for (const style of STYLES) {
    let p = null, err = null;
    try { p = await runStyle(browser, style); } catch (e) { err = String(e.message).slice(0, 60); }
    if (err || !p) { console.log(`${style.padEnd(17)} | ERROR ${err || 'null'}`); continue; }
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    const cross = p.p99DevMm <= 0.1 ? ' <=TOL' : '';
    const trusted = (p.vertexMaxMm !== undefined && p.vertexMaxMm <= 0.05) ? 'yes' : 'NO';
    console.log(`${style.padEnd(17)} | ${p.chordMaxMm.toFixed(4)} | ${p.p99DevMm.toFixed(4)} | ${naPct.padStart(7)}% | ${(p.vertexMaxMm ?? -1).toFixed(4)} | ${String(p.wallTriangles).padStart(8)} | ${trusted}${cross}`);
  }
  await browser.close(); console.log('done');
})();
