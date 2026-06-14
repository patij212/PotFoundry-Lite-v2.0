// nRing (tangential/theta ring resolution) discriminator for the DragonScales
// cap-junction residual. maxSag (t-density) was density-invariant; nRing refines
// the THETA direction of every ring incl. the t=0/1 boundary rings. If the
// residual DROPS with nRing => theta-under-sampling at the boundary (refinable);
// if FLAT => the t=0/1 junction is irreducible in theta-density (exclude / or a
// t-direction boundary-refine issue).
// Usage: PF_STYLE=DragonScales PF_NRINGS=1024,2048 node e2e/_fidelity_nring_audit.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'DragonScales';
const NRINGS = (process.env.PF_NRINGS || '1024,2048').split(',').map(Number);
const TARGET = Number(process.env.PF_TARGET || 2000000);
const DENSE_N = Number(process.env.PF_DENSE_N || 8);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  console.log(`=== ${STYLE} nRing (theta) scaling — target=${TARGET}, denseN=${DENSE_N} ===`);
  console.log('nRing |  wallTris | chordMax | p99    | rms    | nAbove%  | worst(theta_deg, z, mm)');
  let prev = null;
  for (const nr of NRINGS) {
    const page = await browser.newPage();
    try {
      await page.addInitScript(([nring]) => {
        window.__pfConforming = true;
        window.__pfSurfaceFidelityExact = true;
        window.__pfConformingNRing = nring;
      }, [nr]);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
      await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
      const d = await withTimeout(page.evaluate(([t, dn]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: dn || undefined }), [TARGET, DENSE_N]), 600000, 'diag');
      if (!d) { console.log(`${String(nr).padStart(5)} | NULL`); continue; }
      const aboveP = (100 * d.nAbove / Math.max(1, d.samples)).toFixed(1);
      const wTh = (d.worst.theta * 180 / Math.PI).toFixed(1);
      const ratio = prev ? ` [chord x${(prev.chordMaxMm / d.chordMaxMm).toFixed(2)}, tris x${(d.triangleCount / prev.triangleCount).toFixed(2)}]` : '';
      console.log(`${String(nr).padStart(5)} | ${String(d.triangleCount).padStart(9)} | ${String(d.chordMaxMm.toFixed(4)).padStart(8)} | ${String(d.p99DevMm.toFixed(4)).padStart(6)} | ${String(d.rmsDevMm.toFixed(4)).padStart(6)} | ${String(aboveP).padStart(7)}% | (${wTh}, ${d.worst.z.toFixed(2)}, ${d.worst.mm.toFixed(3)})${ratio}`);
      prev = d;
    } catch (e) { console.log(`${String(nr).padStart(5)} | ERROR ${String(e.message).slice(0, 80)}`); }
    finally { await page.close(); }
  }
  await browser.close();
})();
