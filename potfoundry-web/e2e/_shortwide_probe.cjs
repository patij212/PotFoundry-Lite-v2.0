// Focused short-wide (H40/OD300) topology probe — the GAP 1 dominant blocker.
// Usage: PF_STYLES=Crystalline,ArtDeco node e2e/_shortwide_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 180000);
const styles = (process.env.PF_STYLES || 'Crystalline,ArtDeco')
  .split(',').map((s) => s.trim()).filter(Boolean);
const DIM = { H: 40, top_od: 300, bottom_od: 280, r_drain: 20 };

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  let anyFail = false;
  try {
    const page = await browser.newPage();
    const UBIAS = process.env.PF_UBIAS; // force a specific anisotropy bias (e.g. 0) to bisect
    await page.addInitScript((ub) => {
      window.__pfConforming = true;
      if (ub !== undefined && ub !== '') window.__pfConformingUBias = Number(ub);
    }, UBIAS);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const s of styles) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIM), 30000, `${s} setDims`);
        const r = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `${s} probe`,
        );
        const ok = r.orientationMismatches === 0 && r.boundaryEdges === 0 && r.nonManifoldEdges === 0 && r.sliverCount === 0;
        if (!ok) anyFail = true;
        console.log(`${s.padEnd(20)} short-wide orient=${r.orientationMismatches} bnd=${r.boundaryEdges} nonMan=${r.nonManifoldEdges} sliver=${r.sliverCount} maxAspect=${r.maxAspect3D.toFixed(1)} tris=${r.triangleCount} -> ${ok ? 'PASS' : 'FAIL'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } catch (e) {
        anyFail = true;
        console.log(`${s.padEnd(20)} short-wide ERROR ${(e && e.message ? e.message : String(e)).slice(0, 70)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
  } finally { await browser.close(); }
  process.exit(anyFail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
