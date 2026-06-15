// STAGE-1 DUAL-GATE BASELINE — perpendicular-3D chord AND reference-free triangle
// quality (min interior angle) per style, in ONE deterministic build each, at a
// FIXED denseN (never vary sampling within a comparison). Emits a table + JSON.
//
// Usage: node e2e/_fidelity_dualgate_baseline.cjs                  (dev server up)
//        PF_STYLES=GyroidManifold,BasketWeave node e2e/_fidelity_dualgate_baseline.cjs
//        PF_DENSE_N=6 PF_TARGET_TRIS=1000000 node e2e/_fidelity_dualgate_baseline.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const DENSE_N = Number(process.env.PF_DENSE_N || 6);   // FIXED thorough sampling
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20); // min-angle bar (deg)
const REF_RES = Number(process.env.PF_REF_RES || 512);
const OUT = process.env.PF_OUT ||
  '../../docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json';
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);
const ALL_STYLES = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph',
  'HarmonicRipple', 'LowPolyFacet', 'GothicArches', 'WaveInterference',
  'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments',
  'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra',
];
const ONLY = (process.env.PF_STYLES || '').split(',').map((s) => s.trim()).filter(Boolean);
const STYLES = ONLY.length ? ONLY : ALL_STYLES;

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([refRes]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (refRes > 0) { window.__pfReferenceDenseRes = refRes; window.__pfReferenceBicubic = true; }
    }, [REF_RES]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');
    const perp = await withTimeout(page.evaluate(([tgt, dn]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt, denseN: dn, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    const qual = await withTimeout(page.evaluate(([tgt, bar]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: tgt, angleBarDeg: bar }), [TARGET, ANGLE_BAR]), DIAG_TIMEOUT, 'quality');
    return { perp, qual };
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== STAGE-1 DUAL-GATE BASELINE (denseN=${DENSE_N}, targetTris=${TARGET}, angleBar=${ANGLE_BAR}deg) ===`);
  console.log('style                | perpChord | perp_p99 | nAbove%  | vtxMax  | worstMinAng | p1MinAng | %<bar  | wallTris');
  const rows = [];
  for (const style of STYLES) {
    let r = null, err = null;
    try { r = await runStyle(browser, style); }
    catch (e) { err = String(e.message).slice(0, 80); }
    if (err || !r || !r.perp) { console.log(`${style.padEnd(20)} | ERROR ${err || 'null'}`); rows.push({ style, error: err || 'null' }); continue; }
    const p = r.perp, q = r.qual || {};
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    console.log(
      `${style.padEnd(20)} | ${(p.chordMaxMm).toFixed(4)} | ${(p.p99DevMm).toFixed(4)} | ${naPct.padStart(7)}% | ${(p.vertexMaxMm).toFixed(4)} | ${(q.worstMinAngleDeg ?? -1).toFixed(2).padStart(10)} | ${(q.p1MinAngleDeg ?? -1).toFixed(2).padStart(7)} | ${(q.pctBelow15 ?? -1).toFixed(2).padStart(5)}% | ${p.wallTriangles}`);
    rows.push({
      style,
      perpChordMaxMm: p.chordMaxMm, perpP99Mm: p.p99DevMm, nAbove: p.nAbove, samples: p.samples,
      vertexMaxMm: p.vertexMaxMm, referenceTrusted: p.referenceTrusted, wallTriangles: p.wallTriangles,
      worstMinAngleDeg: q.worstMinAngleDeg, p1MinAngleDeg: q.p1MinAngleDeg, pctBelowBar: q.pctBelow15, angleBarDeg: q.angleBarDeg,
    });
  }
  await browser.close();
  fs.writeFileSync(path.resolve(__dirname, OUT), JSON.stringify({ target: TARGET, denseN: DENSE_N, angleBar: ANGLE_BAR, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows -> ${OUT}`);
})();
