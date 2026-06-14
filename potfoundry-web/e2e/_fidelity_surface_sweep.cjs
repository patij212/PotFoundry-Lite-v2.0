// B5 CROSS-STYLE — ABSOLUTE surface-fidelity baseline across ALL 20 styles.
//
// Generalizes _fidelity_surface_validate.cjs (SFB+ArtDeco only) to the whole
// registry. For each style it runs the REAL GPU export with the
// surfaceFidelityExact flag ON and reports __pfFidelity.diagnoseSurfaceFidelity():
// the exported 3D outer wall mapped back to (theta,z) and compared against the
// CONFIG-TRUE analytic radius (NO GPU-grid reference). Seam + ArtDeco riser
// t-bands excluded.
//
// Two channels per style: vertexMaxMm (exact placement — the headline "mesh lies
// on the true surface" claim) and chordMaxMm (flat-facet, slicer-seen). Plus the
// honest-null reason for styles the gate refuses (twist, legacy path, decimation
// broke parallelism, missing taper config).
//
// This is the AUDIT-FIRST data foundation for the remaining Task-9 items
// (per-style density-to-tol, B5-gate refusal trigger, decimation re-gate): it
// tells us which styles already lie on the true surface and which need a fix.
//
// Usage: node e2e/_fidelity_surface_sweep.cjs            (dev server up, ?fidelity=1)
//        PF_TARGET_TRIS=2000000 node e2e/_fidelity_surface_sweep.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const VERTEX_TOL_MM = Number(process.env.PF_VERTEX_TOL_MM || 0.5); // placement gate
const CHORD_TOL_MM = Number(process.env.PF_CHORD_TOL_MM || 0.3); // slicer-seen gate

// All 20 registry styles (registry.ts key names — what setStyle expects).
const STYLES = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph',
  'HarmonicRipple', 'LowPolyFacet', 'GothicArches', 'WaveInterference',
  'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments',
  'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra',
];

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfSurfaceFidelityExact = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    // SFB default is the smooth strength-0 pot; force petals so there is a real
    // feature surface to certify (matches _fidelity_surface_validate.cjs). All
    // other styles use their registry defaults (the honest "what ships" config).
    if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');
    const d = await withTimeout(page.evaluate((tgt) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt }), TARGET), 300000, 'diag');
    return d; // FidelitySurfaceFidelityDiagnostics | null
  } finally {
    await page.close();
  }
}

function classify(d) {
  if (!d) return 'NULL'; // gate refused (twist / legacy / decimation / missing taper)
  if (d.nonFiniteCount > 0) return 'NONFINITE';
  // REFERENCE PARITY FIRST: vertices are GPU-placed-exact, so a large vertex
  // channel means the CPU reference (styles.ts) drifted from the WGSL shader, NOT
  // that the mesh is off-surface. The chord number is then measured against the
  // WRONG surface and is uninterpretable — report REF-UNTRUSTED, never FAIL.
  if (d.referenceTrusted === false || d.vertexMaxMm >= VERTEX_TOL_MM) return 'REF-UNTRUSTED';
  const cOk = d.chordMaxMm < CHORD_TOL_MM;
  if (cOk) return 'CERTIFIED'; // vertices on true surface + slicer-clean
  return 'PARTIAL(chord)'; // vertices on-surface, facets too coarse (real density gap)
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== B5 CROSS-STYLE absolute surface-fidelity baseline (real GPU, flag ON, targetTris=${TARGET}) ===`);
  console.log(`gates: vertexMax<${VERTEX_TOL_MM}mm (placement)  chordMax<${CHORD_TOL_MM}mm (slicer-seen)`);
  console.log('style                | verdict          | vertexMax | chordMax | p99    | nAbove/samples | wallTris | seam  | riser | mode');
  const rows = [];
  for (const style of STYLES) {
    let d = null, err = null;
    try { d = await runStyle(browser, style); }
    catch (e) { err = String(e.message).slice(0, 60); }
    const verdict = err ? `ERROR` : classify(d);
    rows.push({ style, verdict, d, err });
    if (err) {
      console.log(`${style.padEnd(20)} | ${verdict.padEnd(16)} | ${err}`);
    } else if (!d) {
      console.log(`${style.padEnd(20)} | ${verdict.padEnd(16)} | gate refused (twist / legacy path / decimation broke parallelism / missing taper config)`);
    } else {
      console.log(
        `${style.padEnd(20)} | ${verdict.padEnd(16)} | ${String(d.vertexMaxMm?.toFixed(4)).padStart(9)} | ${String(d.chordMaxMm?.toFixed(4)).padStart(8)} | `
        + `${String(d.p99DevMm?.toFixed(4)).padStart(6)} | ${String(`${d.nAbove}/${d.samples}`).padStart(14)} | ${String(d.triangleCount).padStart(8)} | `
        + `${String(d.seamBandMaxMm?.toFixed(2)).padStart(5)} | ${String(d.riserBandMaxMm?.toFixed(2)).padStart(5)} | ${d.referenceMode}`,
      );
    }
  }
  // Summary roll-up.
  const tally = {};
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  console.log('\n=== SUMMARY ===');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)}: ${v}`);
  const certified = rows.filter((r) => r.verdict === 'CERTIFIED').map((r) => r.style);
  const partial = rows.filter((r) => r.verdict.startsWith('PARTIAL')).map((r) => r.style);
  const untrusted = rows.filter((r) => r.verdict === 'REF-UNTRUSTED').map((r) => `${r.style}(${r.d?.vertexMaxMm?.toFixed(2)})`);
  const nul = rows.filter((r) => r.verdict === 'NULL').map((r) => r.style);
  console.log(`  CERTIFIED (on true surface, slicer-clean):  ${certified.join(', ') || '(none)'}`);
  console.log(`  PARTIAL  (vertices on-surface, chord>tol):  ${partial.join(', ') || '(none)'}`);
  console.log(`  REF-UNTRUSTED (styles.ts↔WGSL drift; mesh OK, metric can't judge — vertexMax mm): ${untrusted.join(', ') || '(none)'}`);
  console.log(`  NULL     (gate refuses — twist/legacy):     ${nul.join(', ') || '(none)'}`);
  await browser.close();
})();
