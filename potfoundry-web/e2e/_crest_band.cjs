// STAGE 0 scalar gate: the faithful REFERENCE-FREE crest-band min-angle
// (diagnoseCrestQuality) + topology (diagnoseTopoQuality) for the crest targets +
// plain-pot control. The band fraction concentrates the signal the whole-wall %
// dilutes. NO --enable-features=Vulkan.
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const CASES = [
  { tag: 'SpiralRidges', style: 'SpiralRidges', params: null },
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
  { tag: 'SFB_s0_control', style: 'SuperformulaBlossom', params: { sf_strength: 0 } },
];
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const c of CASES) {
      try {
        await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), c.style), 60000, 'setStyle');
        if (c.params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), c.params), 30000, 'setParams');
        const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 200000, 'crestQ');
        const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 200000, 'topoQ');
        console.log(JSON.stringify({
          tag: c.tag,
          tris: cq && cq.triangleCount, crestLoci: cq && cq.crestLoci,
          bandTris: cq && cq.bandTriangles,
          bandPctBelow15: cq && cq.bandPctBelow15,
          nonBandPctBelow15: cq && cq.nonBandPctBelow15,
          wallPctBelow15: cq && cq.pctBelow15,
          worst: cq && cq.worstMinAngleDeg, p1: cq && cq.p1MinAngleDeg,
          sliver: tq && tq.sliverCount, bnd: tq && tq.boundaryEdges,
          nonMan: tq && tq.nonManifoldEdges, orient: tq && tq.orientationMismatches,
          maxAspect: tq && Math.round(tq.maxAspect3D),
        }));
      } catch (e) { console.log(`${c.tag}: ${String(e.message || e).slice(0, 140)}`); }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
