// Per-style default-dims mesh hashes — the Stage-0 byte-identity tripwire.
// Valid same-machine only. No Vulkan flag.
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'e2e/baselines/mesh-hashes-default-2026-06.json';
const STYLES = (process.env.PF_STYLES || [
  'SuperformulaBlossom', 'SuperellipseMorph', 'LowPolyFacet', 'ArtDeco', 'Crystalline',
  'BambooSegments', 'RippleInterference', 'WaveInterference', 'HarmonicRipple', 'GeometricStar',
  'BasketWeave', 'GyroidManifold', 'GothicArches', 'DragonScales', 'SpiralRidges',
  'FourierBloom', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'Voronoi',
].join(',')).split(',');
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
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
        const h = await wt(page.evaluate((t) => window.__pfFidelity._debugMeshHash(t), TARGET), 220000, 'hash');
        rows.push({ style, ...h });
      } catch (e) { rows.push({ style, error: String(e.message || e).slice(0, 120) }); }
      console.log(JSON.stringify(rows[rows.length - 1]));
      fs.writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-06', dims: 'default', rows }, null, 2));
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
