// STAGE 0: localize the SFB@1 non-manifold edge at uBias=3 (the committed-claim
// contradiction). Dumps diagnoseTopology edge samples (3D coords + edge length +
// involved triangles) at B=2 (clean) and B=3 (broken) for contrast. No Vulkan.
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' to')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    await wt(page.evaluate(() => window.__pfFidelity.setStyle('SuperformulaBlossom')), 60000, 'setStyle');
    await wt(page.evaluate(() => window.__pfFidelity.setStyleParams({ sf_strength: 1 })), 30000, 'setParams');
    for (const b of [2, 3]) {
      await page.evaluate((bb) => { window.__pfConformingUBias = bb; }, b);
      const topo = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopology({ targetTriangles: t, sampleLimit: 24 }), TARGET), 220000, 'topo');
      const round = (a) => Array.isArray(a) ? a.map((v) => Math.round(v * 100) / 100) : a;
      console.log(`\n=== SFB@1 uBias=${b}: bnd=${topo.boundaryEdges} nonMan=${topo.nonManifoldEdges} orient=${topo.orientationMismatches} tris=${topo.triangleCount} ===`);
      for (const s of (topo.samples || [])) {
        const r = Math.round(Math.hypot(s.midpoint[0], s.midpoint[1]) * 10) / 10;
        const z = Math.round(s.midpoint[2] * 10) / 10;
        console.log(`  ${s.kind} len=${(s.edgeLengthMm || 0).toFixed(4)}mm fwd=${s.forward} rev=${s.reverse} total=${s.total} mid(r=${r},z=${z}) a=${JSON.stringify(round(s.a))} b=${JSON.stringify(round(s.b))} tris=[${s.firstForwardTriangle},${s.secondForwardTriangle},${s.firstReverseTriangle},${s.secondReverseTriangle}]`);
      }
    }
    await page.evaluate(() => { delete window.__pfConformingUBias; });
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
