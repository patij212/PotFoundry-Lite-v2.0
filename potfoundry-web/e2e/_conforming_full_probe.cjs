// Whole-mesh conforming watertight probe. Sets window.__pfConforming so the
// gated buildConformingExport branch in ParametricExportComputer builds the
// WHOLE pot (all 6 surfaces) watertight-by-construction and returns it as the
// export mesh. diagnoseTopoQuality then measures the WHOLE mesh.
//
// GATE: orient=0 AND bnd=0 AND nonMan=0 AND sliver=0 on the whole mesh.
//
// Usage: PF_STYLES=SuperformulaBlossom PF_PER_OP_MS=120000 node e2e/_conforming_full_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const styles = (process.env.PF_STYLES || 'SuperformulaBlossom').split(',').map((s) => s.trim()).filter(Boolean);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 120000);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  let anyFail = false;
  try {
    for (const s of styles) {
      const t0 = Date.now();
      let page;
      try {
        page = await browser.newPage();
        await page.addInitScript(() => { window.__pfConforming = true; });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        // diagnoseTopoQuality triggers compute() -> conforming branch returns the whole mesh,
        // then measures topology + quality on that WHOLE mesh.
        const r = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `${s} probe`,
        );
        const ok = r.orientationMismatches === 0 && r.boundaryEdges === 0 && r.nonManifoldEdges === 0 && r.sliverCount === 0;
        if (!ok) anyFail = true;
        console.log(
          `${s} orient=${r.orientationMismatches} bnd=${r.boundaryEdges} nonMan=${r.nonManifoldEdges} ` +
          `sliver=${r.sliverCount} maxAspect=${r.maxAspect3D.toFixed(1)} tris=${r.triangleCount} ` +
          `-> ${ok ? 'PASS' : 'FAIL'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
      } catch (e) {
        anyFail = true;
        console.log(`${s}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 90)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } finally { if (page) { try { await page.close(); } catch { /* */ } } }
    }
  } finally { await browser.close(); }
  process.exit(anyFail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
