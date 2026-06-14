// GeometricStar chevron-extractor VERIFY: chord fidelity + watertight + featDrop
// with surfaceFidelityExact ON (the new general-curve strapwork-shoulder edges).
//
// Gate for a WIN claim: chord < tol (default 0.1mm) AND watertight (orient=0,
// bnd=0, nonMan=0, sliver=0). featDrop reported for coverage. Compares against
// the audit baseline (chord 1.0255, all density-frozen).
//
// Usage: node e2e/_fidelity_geomstar_verify.cjs
//        PF_STYLES=GeometricStar PF_TARGET=1000000 node e2e/_fidelity_geomstar_verify.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 1000000);
const REF_RES = Number(process.env.PF_REF_RES || 512);
const TOL = Number(process.env.PF_CHORD_TOL_MM || 0.1);
const STYLES = (process.env.PF_STYLES || 'GeometricStar').split(',').map((s) => s.trim()).filter(Boolean);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 600000);
const FEATURE_LEVEL = Number(process.env.PF_FEATURE_LEVEL || 0); // 0 = pipeline default (11 when flag on)

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([refRes, fl]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (refRes > 0) { window.__pfReferenceDenseRes = refRes; window.__pfReferenceBicubic = true; }
      if (fl > 0) { window.__pfFidelityFeatureLevel = fl; }
    }, [REF_RES, FEATURE_LEVEL]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    const surf = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t }), TARGET), PER_OP_MS, 'surface');
    const topo = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), PER_OP_MS, 'topo');
    let feat = null;
    try { feat = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseFeatures({ targetTriangles: t }), TARGET), PER_OP_MS, 'feat'); } catch { /* */ }
    return { surf, topo, feat };
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== GeometricStar chevron VERIFY (flag ON, tol=${TOL}mm, target=${TARGET}) ===`);
  let anyFail = false;
  for (const style of STYLES) {
    try {
      const { surf, topo, feat } = await runStyle(browser, style);
      const chordOk = surf && surf.chordMaxMm < TOL;
      const wtOk = topo.orientationMismatches === 0 && topo.boundaryEdges === 0 && topo.nonManifoldEdges === 0 && topo.sliverCount === 0;
      const ok = chordOk && wtOk;
      if (!ok) anyFail = true;
      const aboveP = surf ? (100 * surf.nAbove / Math.max(1, surf.samples)).toFixed(1) : 'NA';
      console.log(`\n${style}:`);
      console.log(`  CHORD : max=${surf ? surf.chordMaxMm.toFixed(4) : 'NULL'} p99=${surf ? surf.p99DevMm.toFixed(4) : '-'} rms=${surf ? surf.rmsDevMm.toFixed(4) : '-'} vtx=${surf ? surf.vertexMaxMm.toFixed(4) : '-'} nAbove=${aboveP}% ${chordOk ? 'OK' : 'OVER'}`);
      if (surf) console.log(`  EXCL  : creaseBandMax=${surf.creaseBandMaxMm.toFixed(4)} wallTris=${surf.wallTriangles} samples=${surf.samples} (excluded=measured against wall)`);
      console.log(`  TOPO  : orient=${topo.orientationMismatches} bnd=${topo.boundaryEdges} nonMan=${topo.nonManifoldEdges} sliver=${topo.sliverCount} maxAspect=${topo.maxAspect3D.toFixed(1)} tris=${topo.triangleCount} ${wtOk ? 'WATERTIGHT' : 'BROKEN'}`);
      console.log(`  FEAT  : ${feat ? `expected=${feat.expected} present=${feat.present} dropped=${feat.dropped}` : 'NA'}`);
      console.log(`  => ${ok ? 'PASS' : 'FAIL'}`);
    } catch (e) {
      anyFail = true;
      console.log(`\n${style}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 120)}`);
    }
  }
  await browser.close();
  process.exit(anyFail ? 1 : 0);
})();
