// Localize Voronoi's residual slivers: dump the worst-aspect triangles' (u,t,s)
// UVs + 3D edge lengths so the (u,t) needle can be reproduced/fixed at unit level.
// Usage: node e2e/_voronoi_sliver_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const style = process.env.PF_STYLE || 'Voronoi';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    await page.evaluate((s) => window.__pfFidelity.setStyle(s), style);
    const r = await page.evaluate(
      (t) => window.__pfFidelity.diagnoseQuality({ targetTriangles: t, sampleLimit: 12 }),
      targetTriangles,
    );
    console.log(`${style}: maxAspect=${r.maxAspect3D.toFixed(1)} sliverCount=${r.sliverCount} tris=${r.triangleCount}`);
    for (const w of r.worst) {
      const uvs = (w.uvs || []).map((p) => `(${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(0)})`).join(' ');
      const el = (w.edgeLengthsMm || []).map((e) => e.toFixed(4)).join('/');
      console.log(`  asp=${w.aspect3D.toFixed(1)} minAng=${(w.minAngleDeg||0).toFixed(2)} edgesMm=${el} uvs=${uvs}`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
