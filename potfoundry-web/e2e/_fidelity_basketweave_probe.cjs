// BasketWeave holdout investigation. For the worst outer-wall vertices, compare the
// PLACED radius against the analytic reference at the RECOVERED (atan2,z) and at the
// EXACT stash (u·TAU, t·H). devExact≈0 ⇒ recovery is the problem; devExact large ⇒
// the placed radius ≠ the CPU formula at the SAME (u,t) (mesh moved the vertex, or
// CPU≠WGSL). Also dumps u/t so we can see WHERE the worst vertices sit.
//
// Usage: node e2e/_fidelity_basketweave_probe.cjs   (dev server up, ?fidelity=1)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'BasketWeave';
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  try {
    const page = await browser.newPage();
    const flagOff = process.env.PF_FLAG_OFF === '1';
    await page.addInitScript((fOff) => { window.__pfConforming = true; if (!fOff) window.__pfSurfaceFidelityExact = true; }, flagOff);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    const d = await withTimeout(page.evaluate((tgt) => window.__pfFidelity._debugRadialBreakdown({ targetTriangles: tgt, topK: 25 }), TARGET), 300000, 'breakdown');
    if (!d) { console.log('null (legacy path / missing config)'); await browser.close(); return; }
    console.log(`=== ${d.styleId} radial breakdown (outer-wall verts=${d.count}, worst 25 by devRec) ===`);
    console.log('  thetaRec  u*TAU   (Δθ)   |   z       t*H     (Δz)   | rPlaced  rRec    rExact | devRec devExact');
    for (const r of d.worst) {
      const dTheta = Math.abs(r.thetaRec - r.uTau);
      const dZ = Math.abs(r.z - r.tH);
      console.log(
        `  ${r.thetaRec.toFixed(4)} ${r.uTau.toFixed(4)} (${dTheta.toFixed(4)}) | `
        + `${r.z.toFixed(3)} ${r.tH.toFixed(3)} (${dZ.toFixed(3)}) | `
        + `${r.rPlaced.toFixed(3)} ${r.rRec.toFixed(3)} ${r.rExact.toFixed(3)} | `
        + `${r.devRec.toFixed(3)} ${r.devExact.toFixed(3)}`,
      );
    }
    // Aggregate: is devExact systematically small (recovery issue) or large (formula/mesh)?
    let maxExact = 0, maxRec = 0, sumExact = 0;
    for (const r of d.worst) { maxExact = Math.max(maxExact, r.devExact); maxRec = Math.max(maxRec, r.devRec); sumExact += r.devExact; }
    console.log(`\n=> among worst-25: maxDevRec=${maxRec.toFixed(4)}  maxDevExact=${maxExact.toFixed(4)}  meanDevExact=${(sumExact / d.worst.length).toFixed(4)}`);
    console.log('INTERPRETATION: devExact≈0 across the worst ⇒ formula matches placement, the metric RECOVERY (atan2/z→u,t) is wrong for these. devExact large ⇒ placed radius ≠ CPU formula at the same (u,t).');
    await page.close();
  } catch (e) {
    console.log('PROBE_ERROR: ' + String(e.message).slice(0, 200));
  } finally { await browser.close(); }
})();
