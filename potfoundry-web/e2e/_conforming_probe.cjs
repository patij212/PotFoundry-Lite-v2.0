// Isolated conforming outer-wall probe. Sets window.__pfConformingProbe so the
// gated branch in ParametricExportComputer builds the conforming outer wall on
// the REAL style surface and measures it in isolation (before optimization /
// repair / assembly). Reads back globalThis.__pfConformingResult per style.
//
// Usage: PF_STYLES=SuperformulaBlossom node e2e/_conforming_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const styles = (process.env.PF_STYLES || 'SuperformulaBlossom').split(',').map((s) => s.trim()).filter(Boolean);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 200000);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    for (const s of styles) {
      const t0 = Date.now();
      let page;
      try {
        page = await browser.newPage();
        await page.addInitScript(() => { window.__pfConformingProbe = true; });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        // diagnoseTopoQuality triggers a compute() → the gated probe branch returns the conforming mesh.
        await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles), PER_OP_MS, `${s} probe`);
        const r = await page.evaluate(() => globalThis.__pfConformingResult);
        if (!r) {
          console.log(`${s}: ERROR no __pfConformingResult (probe branch did not run) (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        } else {
          console.log(`${s} ringExclBoundary=${r.ringExclBoundary} totalBoundary=${r.totalBoundary} nonMan=${r.nonManifoldEdges} orient=${r.orientationMismatches} sliver=${r.sliverCount} maxAspect=${r.maxAspect3D.toFixed(1)} tris=${r.triangleCount} verts=${r.vertexCount} buildMs=${r.buildMs.toFixed(0)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
      } catch (e) {
        console.log(`${s}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 90)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } finally { if (page) { try { await page.close(); } catch { /* */ } } }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
