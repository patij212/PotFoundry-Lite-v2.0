// TRUE-instrument forced-B sweep over the 9 slivered styles + SFB@1.
// Decides the hasFeatures B<=2 containment cap (pre-registered rule in
// docs/superpowers/plans/2026-06-10-export-endgame-stage0-instruments-baseline.md
// Task 7 Step 3). Decoupled chord reference via __pfReferenceDenseRes=1024.
// Run from potfoundry-web/ with the dev server up; set PF_BASE_URL explicitly.
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'e2e/baselines/b-sweep-2026-06.json';
const CASES = [
  { tag: 'ArtDeco', style: 'ArtDeco' }, { tag: 'Crystalline', style: 'Crystalline' },
  { tag: 'DragonScales', style: 'DragonScales' }, { tag: 'BasketWeave', style: 'BasketWeave' },
  { tag: 'GeometricStar', style: 'GeometricStar' }, { tag: 'BambooSegments', style: 'BambooSegments' },
  { tag: 'CelticTriquetra', style: 'CelticTriquetra' }, { tag: 'SpiralRidges', style: 'SpiralRidges' },
  { tag: 'Voronoi', style: 'Voronoi' },
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
];
const BS = [0, 1, 2, 3, 'auto'];
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const rows = [];
  const save = () => fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 1024; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const c of CASES) {
      await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), c.style), 60000, 'setStyle');
      if (c.params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), c.params), 30000, 'setParams');
      for (const b of BS) {
        try {
          await page.evaluate((bb) => {
            if (bb === 'auto') delete window.__pfConformingUBias;
            else window.__pfConformingUBias = bb;
          }, b);
          const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 240000, 'cq');
          const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 240000, 'tq');
          const cdt = await wt(page.evaluate(() => window.__pfFidelity.diagnoseCdtHealth()), 60000, 'cdt').catch(() => null);
          const attr = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSliverAttribution()), 60000, 'attr').catch(() => null);
          const serr = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 240000, 'serr').catch(() => null);
          const ceil = c.style === 'SpiralRidges'
            ? await wt(page.evaluate(() => window.__pfFidelity.diagnoseCellCeiling()), 120000, 'ceil').catch(() => null) : null;
          rows.push({
            tag: c.tag, B: b,
            sliver: tq && tq.sliverCount, bnd: tq && tq.boundaryEdges, nonMan: tq && tq.nonManifoldEdges,
            orient: tq && tq.orientationMismatches, maxAspect: tq && Math.round(tq.maxAspect3D),
            bandPctBelow15: cq && cq.bandPctBelow15, wallPctBelow15: cq && cq.pctBelow15,
            worst: cq && cq.worstMinAngleDeg,
            inversions: cdt && cdt.inversions, drops: cdt && cdt.drops,
            attribution: attr && attr.byTag,
            crestBandRmsMm: serr && serr.crestBandRmsMm, serrationScore: serr && serr.serrationScore,
            ceiling: ceil && { minCornerDeg: ceil.minCornerDeg, pctBelow15: ceil.pctCornerBelow15, warped: ceil.warped },
          });
        } catch (e) { rows.push({ tag: c.tag, B: b, error: String(e.message || e).slice(0, 120) }); }
        console.log(JSON.stringify(rows[rows.length - 1]));
        save();
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
