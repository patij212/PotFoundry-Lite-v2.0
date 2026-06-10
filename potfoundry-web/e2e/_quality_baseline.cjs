// Triangle-quality BASELINE: for all 20 styles at default dims, capture the
// min-angle distribution (the clean-CAD instrument) via the new
// __pfFidelity.diagnoseTriangleQuality hook. Committed as the "before" number
// the feature-region quality fix is driven against.
// Usage: node e2e/_quality_baseline.cjs   (run from potfoundry-web/, dev server up)
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const OUT = process.env.PF_OUT || 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/e2e/baselines/triangle-quality-2026-06-10.json';
const STYLES = (process.env.PF_STYLES ||
  'SuperformulaBlossom,FourierBloom,SuperellipseMorph,HarmonicRipple,LowPolyFacet,GothicArches,WaveInterference,Crystalline,ArtDeco,DragonScales,BambooSegments,RippleInterference,GyroidManifold,Voronoi,BasketWeave,GeometricStar,HexagonalHive,CelticKnot,CelticTriquetra,SpiralRidges')
  .split(',').map((s) => s.trim());

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of STYLES) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        const q = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTriangleQuality()), 180000, 'quality');
        const row = { ...q, buildMs: Date.now() - t0 };
        rows.push(row); console.log(JSON.stringify(row));
      } catch (e) {
        const row = { styleId: style, error: String(e.message || e).slice(0, 140), buildMs: Date.now() - t0 };
        rows.push(row); console.log(JSON.stringify(row));
      }
    }
    fs.mkdirSync(require('path').dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-06-10', dims: 'default H120/Rt70/Rb45', bar: 'clean-CAD min-angle>=20deg', rows }, null, 2));
    console.log('WROTE', OUT);
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
