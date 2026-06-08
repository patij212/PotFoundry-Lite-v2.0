// Measures the FULL fidelity vector (incl. maxSagMm + featuresExpected/Present/Dropped) on the
// conforming whole-mesh path. Usage: PF_STYLES=A,B node e2e/_conforming_sag_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const referenceTriangles = Number(process.env.PF_REF_TRIANGLES || 8000000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 200000);
const styles = (process.env.PF_STYLES || 'SuperformulaBlossom').split(',').map((s) => s.trim()).filter(Boolean);

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
        await page.addInitScript(() => { window.__pfConforming = true; });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        const r = await withTimeout(page.evaluate((args) => window.__pfFidelity.measure(args), { targetTriangles, referenceTriangles }), PER_OP_MS, `${s} measure`);
        console.log(`${s} maxSag=${r.maxSagMm.toFixed(3)}mm rmsSag=${r.rmsSagMm.toFixed(3)}mm sliver=${r.sliverCount} maxAspect=${r.maxAspect3D.toFixed(0)} bnd=${r.boundaryEdges} nonMan=${r.nonManifoldEdges} orient=${r.orientationMismatches} featExp=${r.featuresExpected} featPres=${r.featuresPresent} featDrop=${r.featuresDropped} tris=${r.triangleCount} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } catch (e) {
        console.log(`${s}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 90)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } finally { if (page) { try { await page.close(); } catch { /* */ } } }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
