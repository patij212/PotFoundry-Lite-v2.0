// AUDIT-FIRST: GeometricStar chord-residual mechanism probe.
//
// Runs the REAL GPU export (surfaceFidelityExact ON) at several triangle budgets
// and reports the chord channel + worst sample. The KEY discriminator:
//   - smooth facet sag scales O(h^2): doubling density (4x tris) -> chord /4
//   - C1 crease-straddle scales O(h): doubling density (4x tris) -> chord /2
// If chordMax barely moves with density -> the mesh edges are NOT aligned to the
// surface's crease lines (extract them). If it falls ~quadratically -> pure
// smooth curvature (density / curvatureFloor closes it).
//
// Also prints worst{theta,z} so we can locate the residual on the strapwork.
// Usage: node e2e/_fidelity_geomstar_audit.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GeometricStar';
const TARGETS = (process.env.PF_TARGETS || '250000,1000000,4000000').split(',').map(Number);
const REF_RES = Number(process.env.PF_REF_RES || 512);
const TOL = Number(process.env.PF_CHORD_TOL_MM || 0.1);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  const page = await browser.newPage();
  await page.addInitScript((refRes) => {
    window.__pfConforming = true;
    window.__pfSurfaceFidelityExact = true;
    if (refRes > 0) { window.__pfReferenceDenseRes = refRes; window.__pfReferenceBicubic = true; }
  }, REF_RES);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');

  console.log(`=== ${STYLE} chord-residual density scaling (tol=${TOL}mm) ===`);
  console.log('targetTris |  wallTris | chordMax | p99    | rms    | nAbove%  | worst(theta_deg, z, mm)');
  let prev = null;
  for (const tgt of TARGETS) {
    const d = await withTimeout(
      page.evaluate((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t }), tgt),
      600000, 'diag');
    if (!d) { console.log(`${String(tgt).padStart(10)} | NULL (gate refused)`); continue; }
    const aboveP = (100 * d.nAbove / Math.max(1, d.samples)).toFixed(1);
    const wTh = (d.worst.theta * 180 / Math.PI).toFixed(1);
    const ratio = prev ? ` [chord x${(prev.chordMaxMm / d.chordMaxMm).toFixed(2)} for ${(d.triangleCount / prev.triangleCount).toFixed(1)}x tris]` : '';
    console.log(
      `${String(tgt).padStart(10)} | ${String(d.triangleCount).padStart(9)} | ${String(d.chordMaxMm.toFixed(4)).padStart(8)} | `
      + `${String(d.p99DevMm.toFixed(4)).padStart(6)} | ${String(d.rmsDevMm.toFixed(4)).padStart(6)} | ${String(aboveP).padStart(7)}% | `
      + `(${wTh}, ${d.worst.z.toFixed(2)}, ${d.worst.mm.toFixed(3)})${ratio}`);
    prev = d;
  }
  await browser.close();
})();
