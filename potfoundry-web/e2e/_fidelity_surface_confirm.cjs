// B5 CONFIRMATION — is the cross-style "FAIL(placement)" a REAL mesh defect or a
// CPU-reference (styles.ts STYLE_FUNCTIONS) parity gap vs the GPU shader truth?
//
// For each style runs BOTH metrics with the flag ON:
//   - diagnoseWallFidelity   : radial dev vs the GPU dense-grid reference (GPU-vs-GPU)
//   - diagnoseSurfaceFidelity: radial dev vs the CPU analytic STYLE_FUNCTIONS
// Vertices are GPU-evaluated EXACTLY at their (u,t) from the same WGSL that renders,
// so if a style reads SMALL under the GPU reference but LARGE under the CPU analytic
// one, the mesh IS on the true surface and the CPU analytic reference is what drifted
// (NOT a placement defect). If BOTH are large, it is a genuine mesh defect.
//
// Usage: node e2e/_fidelity_surface_confirm.cjs   (dev server up, ?fidelity=1)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);

// The 9 cross-style FAIL(placement) styles + 2 CERTIFIED controls (expect both small).
const STYLES = [
  'LowPolyFacet', 'WaveInterference', 'Crystalline', 'DragonScales', 'GyroidManifold',
  'Voronoi', 'BasketWeave', 'HexagonalHive', 'CelticKnot',
  'FourierBloom', 'SuperellipseMorph', // controls
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
    const gpu = await withTimeout(page.evaluate((tgt) => window.__pfFidelity.diagnoseWallFidelity({ targetTriangles: tgt }), TARGET), 300000, 'wall');
    const ana = await withTimeout(page.evaluate((tgt) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt }), TARGET), 300000, 'surf');
    return { gpu, ana };
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== B5 CONFIRMATION: GPU-ref vs CPU-analytic-ref (flag ON, targetTris=${TARGET}) ===`);
  console.log('hypothesis: FAILs = CPU styles.ts drift (GPU-ref small, analytic large). Controls small both.');
  console.log('style                | GPUref max | GPUref p99 | ANA vtxMax | ANA chord | verdict');
  for (const style of STYLES) {
    try {
      const { gpu, ana } = await runStyle(browser, style);
      const gMax = gpu ? gpu.maxMm : NaN;
      const gP99 = gpu ? gpu.p99Mm : NaN;
      const aV = ana ? ana.vertexMaxMm : NaN;
      const aC = ana ? ana.chordMaxMm : NaN;
      // GPU-ref small + analytic-vertex large => reference drift (mesh is on surface).
      let verdict;
      if (!ana) verdict = 'analytic-null';
      else if (gMax < 0.5 && aV > 0.5) verdict = 'REF-DRIFT (mesh OK, styles.ts wrong)';
      else if (gMax >= 0.5 && aV > 0.5) verdict = 'REAL DEFECT (both refs large)';
      else verdict = 'consistent-small';
      console.log(
        `${style.padEnd(20)} | ${String(gMax.toFixed(4)).padStart(10)} | ${String(gP99.toFixed(4)).padStart(10)} | `
        + `${String(aV.toFixed(4)).padStart(10)} | ${String(aC.toFixed(4)).padStart(9)} | ${verdict}`,
      );
    } catch (e) {
      console.log(`${style.padEnd(20)} | ERROR: ${String(e.message).slice(0, 70)}`);
    }
  }
  await browser.close();
})();
