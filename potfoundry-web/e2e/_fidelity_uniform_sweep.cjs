// STAGE-1 A-vs-C DISCRIMINATOR — force uniform quadtree density (bypassing the
// curvature-grid refiner) on the lattice/weave/braid gap styles and measure whether
// the perpendicular-3D chord drops under tol WITH acceptable triangle quality.
//   drops + quality OK  -> Option A (refiner just needs to request density)
//   flat / quality bad / tris explode -> Option C (remesh)
//
// Usage: PF_STYLE=GyroidManifold PF_LEVELS=0,7,8,9 node e2e/_fidelity_uniform_sweep.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GyroidManifold';
const LEVELS = (process.env.PF_LEVELS || '0,7,8,9').split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
const TARGET = Number(process.env.PF_TARGET_TRIS || 4000000); // generous; uniform forcing needs headroom
const DENSE_N = Number(process.env.PF_DENSE_N || 6);          // FIXED
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20);
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runLevel(browser, level) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([lvl]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (lvl > 0) window.__pfConformingUniformLevel = lvl; // 0 = profile default (baseline)
    }, [level]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    const perp = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    const qual = await withTimeout(page.evaluate(([t, b]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: b }), [TARGET, ANGLE_BAR]), DIAG_TIMEOUT, 'qual');
    return { perp, qual };
  } finally { await page.close(); }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== UNIFORM SWEEP ${STYLE} (denseN=${DENSE_N}, target=${TARGET}) ===`);
  console.log('uniformLvl | perpChord | perp_p99 | nAbove%  | worstMinAng | p1MinAng | %<bar  | wallTris');
  for (const lvl of LEVELS) {
    let r = null, err = null;
    try { r = await runLevel(browser, lvl); } catch (e) { err = String(e.message).slice(0, 60); }
    if (err || !r || !r.perp) { console.log(`${String(lvl).padStart(10)} | ERROR ${err || 'null'}`); continue; }
    const p = r.perp, q = r.qual || {};
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    console.log(`${String(lvl).padStart(10)} | ${(p.chordMaxMm).toFixed(4)} | ${(p.p99DevMm).toFixed(4)} | ${naPct.padStart(7)}% | ${(q.worstMinAngleDeg ?? -1).toFixed(2).padStart(10)} | ${(q.p1MinAngleDeg ?? -1).toFixed(2).padStart(7)} | ${(q.pctBelow15 ?? -1).toFixed(2).padStart(5)}% | ${p.wallTriangles}`);
  }
  await browser.close();
})();
