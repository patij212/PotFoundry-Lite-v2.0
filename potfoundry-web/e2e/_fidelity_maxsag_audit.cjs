// FORCED-DENSITY discriminator: does a style's chord residual DROP when the mesh
// is forced denser (lower maxSag)? target-triangle scaling fails for sag-saturated
// styles (the 'cap' budget keeps the sag-tight count), so override maxSag directly
// via __pfConformingMaxSag to actually add resolution.
//   - chord drops ~with maxSag  => SMOOTH steep relief, sizing/density-fixable
//     (the sag sizer under-refines it; lever = curvature-aware sizing / lower sag)
//   - chord ~flat across maxSag  => near-VERTICAL cliff, radial-chord-irreducible
//     => EXCLUDE (creaseStraddle), like GeometricStar / ArtDeco riser.
// Usage: PF_STYLE=DragonScales PF_MAXSAGS=0.1,0.05,0.025 node e2e/_fidelity_maxsag_audit.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'DragonScales';
const MAXSAGS = (process.env.PF_MAXSAGS || '0.1,0.05,0.025').split(',').map(Number);
const TARGET = Number(process.env.PF_TARGET || 4000000);
const REF_RES = Number(process.env.PF_REF_RES || 0);
const DENSE_N = Number(process.env.PF_DENSE_N || 0); // 0 = gate default (12); lower = faster scan

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  console.log(`=== ${STYLE} FORCED-density (maxSag) scaling — target=${TARGET} ===`);
  console.log('maxSag |  wallTris | chordMax | p99    | rms    | nAbove%  | worst(theta_deg, z, mm)');
  let prev = null;
  for (const sag of MAXSAGS) {
    const page = await browser.newPage();
    try {
      await page.addInitScript(([refRes, s]) => {
        window.__pfConforming = true;
        window.__pfSurfaceFidelityExact = true;
        window.__pfConformingMaxSag = s;
        if (refRes > 0) { window.__pfReferenceDenseRes = refRes; window.__pfReferenceBicubic = true; }
      }, [REF_RES, sag]);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
      await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
      const d = await withTimeout(page.evaluate(([t, dn]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: dn || undefined }), [TARGET, DENSE_N]), 600000, 'diag');
      if (!d) { console.log(`${String(sag).padStart(6)} | NULL`); continue; }
      const aboveP = (100 * d.nAbove / Math.max(1, d.samples)).toFixed(1);
      const wTh = (d.worst.theta * 180 / Math.PI).toFixed(1);
      const ratio = prev ? ` [chord x${(prev.chordMaxMm / d.chordMaxMm).toFixed(2)}, tris x${(d.triangleCount / prev.triangleCount).toFixed(2)}]` : '';
      console.log(`${String(sag).padStart(6)} | ${String(d.triangleCount).padStart(9)} | ${String(d.chordMaxMm.toFixed(4)).padStart(8)} | ${String(d.p99DevMm.toFixed(4)).padStart(6)} | ${String(d.rmsDevMm.toFixed(4)).padStart(6)} | ${String(aboveP).padStart(7)}% | (${wTh}, ${d.worst.z.toFixed(2)}, ${d.worst.mm.toFixed(3)})${ratio}`);
      prev = d;
    } catch (e) { console.log(`${String(sag).padStart(6)} | ERROR ${String(e.message).slice(0, 80)}`); }
    finally { await page.close(); }
  }
  await browser.close();
})();
