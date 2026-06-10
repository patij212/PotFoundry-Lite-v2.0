// Full 20-style DEFAULT-param baseline (current conforming path) — the regression
// gate the crest fix must not degrade. Per style: reference-free crest-band
// min-angle (diagnoseCrestQuality) + topology (diagnoseTopoQuality). Auto uBias.
// Writes JSON + streams rows. No Vulkan.
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'C:/Users/patij212/AppData/Local/Temp/pf_crest0/baseline-20.json';
const STYLES = (process.env.PF_STYLES || [
  'SuperformulaBlossom', 'SuperellipseMorph', 'LowPolyFacet', 'ArtDeco', 'Crystalline',
  'BambooSegments', 'RippleInterference', 'WaveInterference', 'HarmonicRipple', 'GeometricStar',
  'BasketWeave', 'GyroidManifold', 'GothicArches', 'DragonScales', 'SpiralRidges',
  'FourierBloom', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'Voronoi',
].join(',')).split(',');
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' to')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of STYLES) {
      try {
        await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 220000, 'cq');
        const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 220000, 'tq');
        const row = {
          style, tris: cq && cq.triangleCount,
          wallBelow15: cq && cq.pctBelow15, bandBelow15: cq && cq.bandPctBelow15, crestLoci: cq && cq.crestLoci,
          worst: cq && cq.worstMinAngleDeg, p1: cq && cq.p1MinAngleDeg,
          sliver: tq && tq.sliverCount, bnd: tq && tq.boundaryEdges, nonMan: tq && tq.nonManifoldEdges,
          orient: tq && tq.orientationMismatches, maxAspect: tq && Math.round(tq.maxAspect3D),
        };
        rows.push(row); console.log(JSON.stringify(row));
        fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
      } catch (e) { const row = { style, error: String(e.message || e).slice(0, 120) }; rows.push(row); console.log(JSON.stringify(row)); fs.writeFileSync(OUT, JSON.stringify(rows, null, 2)); }
    }
  } finally { await browser.close(); }
  console.log('baseline →', OUT);
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
