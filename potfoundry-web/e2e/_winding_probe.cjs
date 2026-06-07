// Per-stage root-cause probe: enables __pfEnableWindingStageDiagnostics and captures the
// [WINDING-STAGE] / [COLLINEAR-STAGE] / [TailDiagnostic] console lines so we can see how many
// collinear/zero-area triangles and winding conflicts exist BEFORE the tail repair battery
// (proves base tessellation conformity) vs AFTER each fill (proves the battery amplifies them).
// Usage: PF_STYLES=WaveInterference [PF_BYCONSTRUCTION=1] node e2e/_winding_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const byCon = process.env.PF_BYCONSTRUCTION === '1';
const styles = (process.env.PF_STYLES || 'WaveInterference').split(',').map((s) => s.trim()).filter(Boolean);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 300000);

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
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
        await page.addInitScript(() => { window.__pfEnableWindingStageDiagnostics = true; });
        if (byCon) await page.addInitScript(() => { window.__pfByConstruction = true; });
        const interesting = /\[WINDING-STAGE\]|\[COLLINEAR-STAGE\]|\[TailDiagnostic\]|\[TAILPROBE\]/;
        page.on('console', (msg) => {
          const text = msg.text();
          if (interesting.test(text)) console.log(`  ${text}`);
        });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        console.log(`=== ${s} (byCon=${byCon}) stage trace ===`);
        const r = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles), PER_OP_MS, `${s} check`);
        console.log(`=== ${s} FINAL orient=${r.orientationMismatches} bnd=${r.boundaryEdges} nonMan=${r.nonManifoldEdges} sliver=${r.sliverCount} maxAspect=${r.maxAspect3D.toFixed(0)} tris=${r.triangleCount} (${((Date.now() - t0) / 1000).toFixed(0)}s) ===`);
      } catch (e) {
        console.log(`${s}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 120)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } finally { if (page) { try { await page.close(); } catch { /* */ } } }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
