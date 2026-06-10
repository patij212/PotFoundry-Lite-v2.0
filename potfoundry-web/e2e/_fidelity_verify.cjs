// Ship verification for the profile-driven fidelity change: at the NEW DEFAULT
// (conforming export now defaults to 'high' profile — sag 0.05), confirm across
// all 20 styles the goal vector still holds (watertight + featDrop=0 + min-angle)
// at the higher resolution, plus chord-error (serration) on a subset to prove the
// facets are below printer resolution. Reports tris (memory) + build time.
// Usage: node e2e/_fidelity_verify.cjs   (dev :3003, NO quality overrides)
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const STYLES = (process.env.PF_STYLES ||
  'SuperformulaBlossom,FourierBloom,SuperellipseMorph,HarmonicRipple,LowPolyFacet,GothicArches,WaveInterference,Crystalline,ArtDeco,DragonScales,BambooSegments,RippleInterference,GyroidManifold,Voronoi,BasketWeave,GeometricStar,HexagonalHive,CelticKnot,CelticTriquetra,SpiralRidges')
  .split(',').map((s) => s.trim());
const SERR = new Set((process.env.PF_SERR || 'SuperformulaBlossom,Crystalline,GyroidManifold,GothicArches,Voronoi').split(',').map((s) => s.trim()));
function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 512; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    const r3 = (x) => (x != null ? Math.round(x * 1000) / 1000 : undefined);
    for (const style of STYLES) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 120000, 'setStyle');
        const topo = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTopoQuality()), 300000, 'topo');
        const feat = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseFeatures()), 120000, 'feat').catch(() => null);
        const qual = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTriangleQuality()), 300000, 'qual').catch(() => null);
        let serr = null;
        if (SERR.has(style)) serr = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 300000, 'serr').catch(() => null);
        const row = { style, tris: topo.triangleCount, sliver: topo.sliverCount, bnd: topo.boundaryEdges, nonMan: topo.nonManifoldEdges, orient: topo.orientationMismatches,
          featDrop: feat ? feat.dropped : null, featExp: feat ? feat.expected : null,
          pctBelow20: qual ? qual.pctBelow20 : null, medAngle: qual ? qual.medianMinAngleDeg : null,
          crestRmsMm: serr ? r3(serr.crestBandRmsMm) : undefined, crestMaxMm: serr ? r3(serr.maxCrestDevMm) : undefined,
          buildS: Math.round((Date.now() - t0) / 100) / 10 };
        rows.push(row); console.log(JSON.stringify(row));
      } catch (e) {
        const row = { style, error: String(e.message || e).slice(0, 100), buildS: Math.round((Date.now() - t0) / 100) / 10 };
        rows.push(row); console.log(JSON.stringify(row));
      }
    }
    fs.writeFileSync('C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/e2e/baselines/fidelity-verify-2026-06-10.json', JSON.stringify(rows, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
