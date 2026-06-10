// Quality LEVER experiment: which existing mechanism actually reduces the
// min-angle band on feature-dense styles? Measures diagnoseTriangleQuality
// (pctBelow20/median) under forced uBias / directional-refine settings, to pick
// the Tier-2 direction with data before committing to the watertight core.
// Usage: node e2e/_quality_lever_probe.cjs   (run from potfoundry-web/, dev :3003)
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const STYLES = (process.env.PF_STYLES || 'HexagonalHive,GyroidManifold,GothicArches').split(',').map((s) => s.trim());
const CONFIGS = [
  { name: 'ubias1', ubias: 1, directional: false },
  { name: 'ubias2', ubias: 2, directional: false },
];

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
      for (const cfg of CONFIGS) {
        try {
          await page.evaluate((c) => {
            if (c.ubias === null) { delete window.__pfConformingUBias; } else { window.__pfConformingUBias = c.ubias; }
            window.__pfConformingDirectional = c.directional;
          }, cfg);
          await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
          const topo = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTopoQuality()), 180000, 'topo');
          const qual = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTriangleQuality()), 180000, 'qual');
          const row = { style, cfg: cfg.name, pctBelow20: qual.pctBelow20, median: qual.medianMinAngleDeg, min: qual.minAngleDeg,
            sliver: topo.sliverCount, bnd: topo.boundaryEdges, nonMan: topo.nonManifoldEdges, tris: topo.triangleCount };
          rows.push(row); console.log(JSON.stringify(row));
        } catch (e) {
          const row = { style, cfg: cfg.name, error: String(e.message || e).slice(0, 100) };
          rows.push(row); console.log(JSON.stringify(row));
        }
      }
    }
    fs.writeFileSync('C:/Users/patij212/AppData/Local/Temp/pf_lever.json', JSON.stringify(rows, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
