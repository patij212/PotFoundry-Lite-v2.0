// B5 — ABSOLUTE surface-fidelity validation on the REAL GPU export.
//
// Unlike _fidelity_flag_validate.cjs (which proves the surfaceFidelityExact flag
// is WIRED: features/tris up + watertight via measure()), this probe reports the
// ABSOLUTE "mesh lies on the true analytic surface" number via the new
// __pfFidelity.diagnoseSurfaceFidelity(), which uses NO GPU-grid reference — it
// maps each exported 3D outer-wall vertex back to (theta,z) and compares against
// the CONFIG-TRUE analytic radius (SFB packed sf_strength mix; ArtDeco
// STYLE_FUNCTIONS; tapered r0(t)). Seam + ArtDeco riser t-bands excluded.
//
// Two channels: vertexMaxMm (exact placement — the headline B5 claim) and
// chordMaxMm (flat-facet, slicer-seen). OFF vs ON: ON must NOT regress the wall
// fidelity (features add edges, not error), and ON must be within a CAD-ish tol.
//
// Usage: PF_STYLE=ArtDeco node e2e/_fidelity_surface_validate.cjs   (dev server up)
//        (default PF_STYLE=SuperformulaBlossom; SFB sets sf_strength=1 ON & OFF.)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const style = process.env.PF_STYLE || 'SuperformulaBlossom';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
// CAD-ish tolerance for the in-memory wall (vertex channel). Riser/seam excluded.
const CAD_TOL_MM = Number(process.env.PF_CAD_TOL_MM || 0.5);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runOnce(browser, fidelityOn) {
  const page = await browser.newPage();
  if (fidelityOn) await page.addInitScript(() => { window.__pfConforming = true; window.__pfSurfaceFidelityExact = true; });
  else await page.addInitScript(() => { window.__pfConforming = true; });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
  // SFB default is the smooth strength-0 pot; force the petals so there is a real
  // feature surface to certify (matches _fidelity_flag_validate.cjs).
  if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');
  const d = await withTimeout(page.evaluate((tgt) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt }), TARGET), 300000, 'diag');
  await page.close();
  return d; // FidelitySurfaceFidelityDiagnostics | null
}

function fmt(d) {
  if (!d) return 'null (legacy path / twist / missing config / decimation broke parallelism)';
  return `vertexMax=${d.vertexMaxMm?.toFixed(4)} chordMax=${d.chordMaxMm?.toFixed(4)} p99=${d.p99DevMm?.toFixed(4)} `
    + `nAbove=${d.nAbove}/${d.samples} wallTris=${d.triangleCount} seamBand=${d.seamBandMaxMm?.toFixed(3)} `
    + `riserBand=${d.riserBandMaxMm?.toFixed(3)} nonFinite=${d.nonFiniteCount} mode=${d.referenceMode}`;
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  try {
    console.log(`=== B5 ABSOLUTE surface-fidelity validation (real GPU, ${style}, targetTris=${TARGET}) ===`);
    const off = await runOnce(browser, false);
    console.log(`OFF: ${fmt(off)}`);
    const on = await runOnce(browser, true);
    console.log(`ON : ${fmt(on)}`);

    // The absolute claim. ON must be non-null (gate applies), nonFinite-free, the
    // vertex channel within CAD tol, and must NOT regress the wall vs OFF (features
    // add EDGES that REDUCE straddle, never raise placement error).
    const measured = !!on && on.nonFiniteCount === 0;
    const cad = !!on && on.vertexMaxMm < CAD_TOL_MM; // vertices exact (absolute — covers the vertex channel)
    // ON must not regress the wall CHORD. NOTE: do NOT ratio-compare the vertex
    // channel — both OFF and ON sit at the f32 floor (~1e-3mm), where a 1.05x ratio
    // is pure noise; `cad` already bounds it absolutely.
    const noRegress = !!off && !!on && on.chordMaxMm <= off.chordMaxMm * 1.05 + 1e-6;
    console.log(`=> measured=${measured}  vertexMax<${CAD_TOL_MM}mm=${cad}  noWallRegression=${noRegress}`);
    console.log(`VERDICT: ${measured && cad && noRegress ? 'ABSOLUTE FIDELITY CERTIFIED (in-memory) + ON does not regress the wall' : 'investigate'}`);
    console.log('NOTE: in-memory GPU-f32 number. The binary-STL round-trip (re-weld 0.001mm + f32 quantize) is a SEPARATE follow-up gate.');
  } catch (e) {
    console.log('PROBE_ERROR: ' + String(e.message).slice(0, 200));
  } finally { await browser.close(); }
})();
