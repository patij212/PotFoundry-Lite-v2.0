// Decisive SpiralRidges/SFB sliver-mechanism sweep: vary the global uBias override
// (which amplifies the helix-shear skew by 2^B) and watch sliver/worst/below-15.
// If SpiralRidges slivers GROW with uBias → shear×uBias interaction (helix-shear).
// No Vulkan.
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const CASES = [
  { tag: 'SpiralRidges', style: 'SpiralRidges', params: null },
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
];
const BIASES = (process.env.PF_BIAS || '-1,0,1,2,3').split(',').map(Number); // -1 = auto
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' to')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const c of CASES) {
      await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), c.style), 60000, 'setStyle');
      if (c.params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), c.params), 30000, 'setParams');
      for (const b of BIASES) {
        try {
          await page.evaluate((bb) => { if (bb < 0) delete window.__pfConformingUBias; else window.__pfConformingUBias = bb; }, b);
          const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 200000, 'cq');
          const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 200000, 'tq');
          console.log(JSON.stringify({
            tag: c.tag, uBias: b < 0 ? 'auto' : b,
            tris: cq && cq.triangleCount, wallBelow15: cq && cq.pctBelow15, worst: cq && cq.worstMinAngleDeg, p1: cq && cq.p1MinAngleDeg,
            sliver: tq && tq.sliverCount, nonMan: tq && tq.nonManifoldEdges, bnd: tq && tq.boundaryEdges, orient: tq && tq.orientationMismatches,
            maxAspect: tq && Math.round(tq.maxAspect3D),
          }));
        } catch (e) { console.log(`${c.tag} b=${b}: ${String(e.message || e).slice(0, 120)}`); }
      }
      await page.evaluate(() => { delete window.__pfConformingUBias; });
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
