// Re-baseline matrix probe — build each style at its DEFAULT params through the
// conforming mesher (auto uBias path: __pfConforming on, NO __pfConformingUBias
// override) and report the real built-mesh topology + the surface anisotropy that
// drives the new relief gate. Verifies the relief-gated GLOBAL uBias fix:
//   - low-relief styles (maxURatio<6) → B=0 → unchanged (byte-identical defaults)
//   - re-baseline styles (maxURatio>6) → B>0 → still watertight + sliver-free
// Usage: PF_STYLES=ArtDeco,Crystalline,... node e2e/_rebaseline_matrix.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 400000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 180000);
const styles = (process.env.PF_STYLES
  || 'ArtDeco,GothicArches,Crystalline,DragonScales,HarmonicRipple,SpiralRidges,FourierBloom')
  .split(',').map((s) => s.trim()).filter(Boolean);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    console.log(`matrix (conforming, AUTO uBias) target=${targetTriangles} styles=${styles.length}`);
    for (const style of styles) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, `${style} setStyle`);
        const fs = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseFShear({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `fshear ${style}`,
        );
        const q = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `topo ${style}`,
        );
        console.log(
          `${style.padEnd(18)} maxURatio=${fs.maxURatio.toFixed(1)} maxTRatio=${fs.maxTRatio.toFixed(1)} ` +
          `| sliver=${q.sliverCount} maxAspect=${q.maxAspect3D.toFixed(1)} bnd=${q.boundaryEdges} ` +
          `nonMan=${q.nonManifoldEdges} orient=${q.orientationMismatches} tris=${q.triangleCount} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
      } catch (e) {
        console.log(`${style.padEnd(18)} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 90)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
