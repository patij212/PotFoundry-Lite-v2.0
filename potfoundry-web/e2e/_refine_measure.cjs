// A/B measure the Tier-2 interior refinement (window.__pfConformingRefine) on the
// CDT-insertion styles: crest-band min-angle + topology + wall-clock build time,
// refine OFF vs ON. SFB@1 is forced to the clean B=2. No Vulkan.
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const CASES = [
  { tag: 'SFB_s1@B2', style: 'SuperformulaBlossom', params: { sf_strength: 1 }, uBias: 2 },
  { tag: 'Voronoi', style: 'Voronoi', params: null, uBias: -1 },
  { tag: 'HexagonalHive', style: 'HexagonalHive', params: null, uBias: -1 },
  { tag: 'CelticKnot', style: 'CelticKnot', params: null, uBias: -1 },
];
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
      for (const refine of [false, true]) {
        try {
          await page.evaluate((args) => {
            window.__pfConformingRefine = args.refine;
            if (args.b < 0) delete window.__pfConformingUBias; else window.__pfConformingUBias = args.b;
          }, { refine, b: c.uBias });
          const t0 = Date.now();
          const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 300000, 'cq');
          const buildMs = Date.now() - t0;
          const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 300000, 'tq');
          console.log(JSON.stringify({
            tag: c.tag, refine, buildMs,
            tris: cq && cq.triangleCount, wallBelow15: cq && cq.pctBelow15, bandBelow15: cq && cq.bandPctBelow15,
            worst: cq && cq.worstMinAngleDeg, p1: cq && cq.p1MinAngleDeg,
            sliver: tq && tq.sliverCount, bnd: tq && tq.boundaryEdges, nonMan: tq && tq.nonManifoldEdges,
            orient: tq && tq.orientationMismatches, maxAspect: tq && Math.round(tq.maxAspect3D),
          }));
        } catch (e) { console.log(`${c.tag} refine=${refine}: ${String(e.message || e).slice(0, 140)}`); }
      }
      await page.evaluate(() => { delete window.__pfConformingUBias; delete window.__pfConformingRefine; });
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
