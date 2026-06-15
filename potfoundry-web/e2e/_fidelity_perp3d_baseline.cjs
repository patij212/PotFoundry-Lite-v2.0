// PERPENDICULAR-3D RE-BASELINE — the HONEST "every triangle faithful" gate across
// all 20 styles, side-by-side with the legacy RADIAL chord.
//
// For each style it runs the REAL GPU export (surfaceFidelityExact flag ON) and
// calls __pfFidelity.diagnoseSurfaceFidelity() TWICE on the same (deterministic)
// build: once with metric:'radial' (the legacy B5 number that OVERSTATES steep
// faces) and once with metric:'perpendicular' (shortest 3D facet→surface distance
// — projectPointToRadialSurface). The vertex channel + exclusions + reference
// selection are identical; only the chord channel differs.
//
// Hypothesis under test (handoff §10.2): the steep "accept-class" styles
// (Gyroid/Gothic/Crystalline/CelticTriquetra + the DragonScales/LowPoly rims)
// collapse to ~f32-floor in 3D — proving CAD-grade — while any GENUINE 3D gap
// (facets straddling a tangled curve: lattice nodes, braid crossings) stays > tol
// and becomes the step-3 fix target.
//
// Usage: node e2e/_fidelity_perp3d_baseline.cjs                 (dev server up)
//        PF_STYLES=GyroidManifold,HarmonicRipple,GeometricStar node e2e/_fidelity_perp3d_baseline.cjs
//        PF_TARGET_TRIS=2000000 PF_CHORD_TOL_MM=0.1 node e2e/_fidelity_perp3d_baseline.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const VERTEX_TOL_MM = Number(process.env.PF_VERTEX_TOL_MM || 0.5); // placement / ref-parity gate
const CHORD_TOL_MM = Number(process.env.PF_CHORD_TOL_MM || 0.1);   // CAD/printer bar (3D)
const REF_RES = Number(process.env.PF_REF_RES || 512);            // GPU-grid fallback for drifted styles
const DENSE_N = Number(process.env.PF_DENSE_N || 0);              // 0 = gate default (12)
const MAXSAG = Number(process.env.PF_MAXSAG || 0);               // 0 = profile default; else force chord density
const NRING = Number(process.env.PF_NRING || 0);                // 0 = profile default; else force theta/relief density (2^k, >=64)

const ALL_STYLES = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph',
  'HarmonicRipple', 'LowPolyFacet', 'GothicArches', 'WaveInterference',
  'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments',
  'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra',
];
const ONLY = (process.env.PF_STYLES || '').split(',').map((s) => s.trim()).filter(Boolean);
const STYLES = ONLY.length ? ONLY : ALL_STYLES;
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([refRes, maxSag, nRing]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (refRes > 0) { window.__pfReferenceDenseRes = refRes; window.__pfReferenceBicubic = true; }
      if (maxSag > 0) window.__pfConformingMaxSag = maxSag; // force chord density
      if (nRing > 0) window.__pfConformingNRing = nRing;     // force theta/relief density
    }, [REF_RES, MAXSAG, NRING]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');
    const t0 = Date.now();
    const radial = await withTimeout(page.evaluate(([tgt, dn]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt, denseN: dn || undefined, metric: 'radial' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'diag-radial');
    const perp = await withTimeout(page.evaluate(([tgt, dn]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt, denseN: dn || undefined, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'diag-perp');
    return { radial, perp, ms: Date.now() - t0 };
  } finally {
    await page.close();
  }
}

// Verdict from the PERPENDICULAR chord (the honest gate). Reference parity first:
// a drifted CPU reference (vertexMax large) makes BOTH chords uninterpretable.
function classify(perp) {
  if (!perp) return 'NULL';
  if (perp.nonFiniteCount > 0) return 'NONFINITE';
  if (perp.referenceTrusted === false || perp.vertexMaxMm >= VERTEX_TOL_MM) return 'REF-UNTRUSTED';
  if (perp.chordMaxMm < CHORD_TOL_MM) return 'CAD-GRADE';      // 3D facet error sub-tol
  return 'GAP-3D';                                              // genuine straddle gap → step 3
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== PERP-3D RE-BASELINE (real GPU, flag ON, targetTris=${TARGET}, refRes=${REF_RES}) ===`);
  console.log(`CAD bar: perpendicular chordMax < ${CHORD_TOL_MM}mm   (vertex/ref parity < ${VERTEX_TOL_MM}mm)`);
  console.log('style                | verdict       | vtxMax  | radialChord | perpChord | ratio | perp_p99 | nAbove/samp     | wallTris | mode          | ms');
  const rows = [];
  for (const style of STYLES) {
    let r = null, err = null;
    try { r = await runStyle(browser, style); }
    catch (e) { err = String(e.message).slice(0, 60); }
    const perp = r && r.perp, radial = r && r.radial;
    const verdict = err ? 'ERROR' : classify(perp);
    rows.push({ style, verdict, radial, perp, err, ms: r && r.ms });
    if (err) {
      console.log(`${style.padEnd(20)} | ${verdict.padEnd(13)} | ${err}`);
    } else if (!perp) {
      console.log(`${style.padEnd(20)} | ${verdict.padEnd(13)} | gate refused (twist / legacy path / decimation broke parallelism / missing taper config)`);
    } else {
      const ratio = radial && radial.chordMaxMm > 0 ? (perp.chordMaxMm / radial.chordMaxMm) : NaN;
      const mode = perp.referenceMode === 'gpu-grid' ? `gpu-grid@${perp.referenceRes}` : perp.referenceMode;
      console.log(
        `${style.padEnd(20)} | ${verdict.padEnd(13)} | ${String(perp.vertexMaxMm?.toFixed(4)).padStart(7)} | ${String(radial?.chordMaxMm?.toFixed(4)).padStart(11)} | `
        + `${String(perp.chordMaxMm?.toFixed(4)).padStart(9)} | ${String(ratio.toFixed(2)).padStart(5)} | ${String(perp.p99DevMm?.toFixed(4)).padStart(8)} | `
        + `${String(`${perp.nAbove}/${perp.samples}`).padStart(15)} | ${String(perp.triangleCount).padStart(8)} | ${mode.padEnd(13)} | ${r.ms}`,
      );
    }
  }
  const tally = {};
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  console.log('\n=== SUMMARY (verdict by perpendicular 3D chord) ===');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)}: ${v}`);
  const cad = rows.filter((r) => r.verdict === 'CAD-GRADE').map((r) => r.style);
  const gap = rows.filter((r) => r.verdict === 'GAP-3D').map((r) => `${r.style}(${r.perp?.chordMaxMm?.toFixed(3)})`);
  const untrusted = rows.filter((r) => r.verdict === 'REF-UNTRUSTED').map((r) => `${r.style}(${r.perp?.vertexMaxMm?.toFixed(2)})`);
  const nul = rows.filter((r) => r.verdict === 'NULL').map((r) => r.style);
  console.log(`  CAD-GRADE (3D facet error sub-tol):          ${cad.join(', ') || '(none)'}`);
  console.log(`  GAP-3D (genuine straddle gap → step 3):      ${gap.join(', ') || '(none)'}`);
  console.log(`  REF-UNTRUSTED (styles.ts↔WGSL drift):        ${untrusted.join(', ') || '(none)'}`);
  console.log(`  NULL (gate refuses — twist/legacy):          ${nul.join(', ') || '(none)'}`);
  await browser.close();
})();
