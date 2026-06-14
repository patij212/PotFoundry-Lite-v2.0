// "Trust all 20" de-risk: does the GPU-truth reference (decoupled high-res outer
// grid, bicubic) read SMALL chord error on the styles the CPU-analytic B5 gate
// flagged REF-UNTRUSTED? diagnoseSerration measures |hypot(P.xy) - R_true(theta,z)|
// where R_true = sampleTrueRadius(bicubic GPU sampler) — GPU-vs-GPU, so it is
// faithful for ANY style regardless of styles.ts drift.
//
// PREDICTION: GyroidManifold/Crystalline (analytic vertexMax 1.5 / 45mm = pure
// styles.ts<->WGSL drift) read a SMALL serration chord here (mesh IS on the GPU
// surface). SFB@1 (trusted) should roughly match its B5 chord ~0.87 (born-petal
// seam zone) at the body. If Gyroid reads ~1.5 here too, that would be a REAL
// mesh chord gap, not drift — so this check is decisive.
//
// Usage: node e2e/_fidelity_gpuref_check.cjs   (dev server up, ?fidelity=1)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const REF_RES = Number(process.env.PF_REF_RES || 512);

const STYLES = ['SuperformulaBlossom', 'GyroidManifold', 'Crystalline', 'BasketWeave', 'FourierBloom'];

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    await page.addInitScript((refRes) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfReferenceDenseRes = refRes; // decouple the reference grid from the mesh grid
      window.__pfReferenceBicubic = true;    // C1 sampler (de-noise the Newton inversion)
    }, REF_RES);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');
    // GPU-truth chord error (serration metric, decoupled bicubic reference).
    const ser = await withTimeout(page.evaluate((tgt) => window.__pfFidelity.diagnoseSerration({ targetTriangles: tgt }), TARGET), 300000, 'serration');
    // CPU-analytic B5 (for side-by-side; shows the drift it cannot judge).
    const b5 = await withTimeout(page.evaluate((tgt) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: tgt }), TARGET), 300000, 'b5');
    return { ser, b5 };
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== GPU-truth reference check (decoupled bicubic ref res=${REF_RES}, flag ON, targetTris=${TARGET}) ===`);
  console.log('style                | GPUref max | GPUref p99 | GPUref rms | refRes | ANA vtxMax | ANA chord | ANA trusted');
  for (const style of STYLES) {
    try {
      const { ser, b5 } = await runStyle(browser, style);
      const sMax = ser ? ser.maxDevMm : NaN;
      const sP99 = ser ? ser.p99DevMm : NaN;
      const sRms = ser ? ser.rmsDevMm : NaN;
      const refRes = ser ? ser.referenceRes : NaN;
      const aV = b5 ? b5.vertexMaxMm : NaN;
      const aC = b5 ? b5.chordMaxMm : NaN;
      const aT = b5 ? b5.referenceTrusted : 'n/a';
      console.log(
        `${style.padEnd(20)} | ${String(sMax.toFixed(4)).padStart(10)} | ${String(sP99.toFixed(4)).padStart(10)} | ${String(sRms.toFixed(4)).padStart(10)} | ${String(refRes).padStart(6)} | `
        + `${String(aV.toFixed(4)).padStart(10)} | ${String(aC.toFixed(4)).padStart(9)} | ${aT}`,
      );
    } catch (e) {
      console.log(`${style.padEnd(20)} | ERROR: ${String(e.message).slice(0, 70)}`);
    }
  }
  console.log('\nIf GPUref max/p99 is SMALL on Gyroid/Crystalline/BasketWeave (ANA trusted=false) => the analytic FAIL was styles.ts drift; the GPU reference trusts all 20.');
  await browser.close();
})();
