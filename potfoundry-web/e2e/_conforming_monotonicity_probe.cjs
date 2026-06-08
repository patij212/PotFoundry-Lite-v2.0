// Monotonicity probe: runs one style at several conforming sampler resolutions
// and reports tris + sag at each, to confirm finer sampling reduces (or holds)
// triangles+sag together rather than spiking. Usage:
//   PF_STYLE=SuperformulaBlossom PF_RES=128,192,256,384 node e2e/_conforming_monotonicity_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const referenceTriangles = Number(process.env.PF_REF_TRIANGLES || 8000000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 200000);
const style = process.env.PF_STYLE || 'SuperformulaBlossom';
const resList = (process.env.PF_RES || '128,192,256,384').split(',').map((s) => Number(s.trim())).filter(Boolean);

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    for (const res of resList) {
      const t0 = Date.now();
      let page;
      try {
        page = await browser.newPage();
        await page.addInitScript((r) => { window.__pfConforming = true; window.__pfConformingDenseRes = r; }, res);
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), style), 60000, `${style} setStyle`);
        const r = await withTimeout(page.evaluate((args) => window.__pfFidelity.measure(args), { targetTriangles, referenceTriangles }), PER_OP_MS, `${style} measure`);
        console.log(`res=${res} tris=${r.triangleCount} maxSag=${r.maxSagMm.toFixed(3)} rmsSag=${r.rmsSagMm.toFixed(3)} sliver=${r.sliverCount} orient=${r.orientationMismatches} bnd=${r.boundaryEdges} nonMan=${r.nonManifoldEdges} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } catch (e) {
        console.log(`res=${res}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 90)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } finally { if (page) { try { await page.close(); } catch { /* */ } } }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
