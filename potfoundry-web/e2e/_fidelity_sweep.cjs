// Fidelity sweep: how low does the CHORD ERROR (mesh vs true surface) go as we
// tighten the conforming quality knobs (maxSag / minEdge / maxLevel / budget)?
// Goal: max/p99 wall deviation WELL below printer resolution (~0.02mm) with no
// visible facet, watertight, features intact. Reports tris + build time so we can
// pick a feasible ultra profile. Usage: node e2e/_fidelity_sweep.cjs (dev :3003)
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const STYLES = (process.env.PF_STYLES || 'SuperformulaBlossom,Crystalline,GyroidManifold').split(',').map((s) => s.trim());
const CONFIGS = [
  { name: 'current', sag: null, minEdge: null, level: null, budget: null },
  { name: 'hi',      sag: 0.05, minEdge: 0.1,  level: 11, budget: 8000000 },
  { name: 'ultra',   sag: 0.03, minEdge: 0.05, level: 12, budget: 20000000 },
  { name: 'max',     sag: 0.02, minEdge: 0.03, level: 12, budget: 40000000 },
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
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 512; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of STYLES) {
      for (const c of CONFIGS) {
        const t0 = Date.now();
        try {
          await page.evaluate((cfg) => {
            const set = (k, v) => { if (v === null) { delete window[k]; } else { window[k] = v; } };
            set('__pfConformingMaxSag', cfg.sag); set('__pfConformingMinEdge', cfg.minEdge);
            set('__pfConformingMaxLevel', cfg.level); set('__pfConformingBudget', cfg.budget);
          }, c);
          await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 90000, 'setStyle');
          const topo = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTopoQuality()), 300000, 'topo');
          const wall = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseWallFidelity()), 300000, 'wall').catch((e) => ({ err: String(e.message || e).slice(0, 60) }));
          const serr = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 300000, 'serr').catch(() => null);
          const r3 = (x) => (x != null ? Math.round(x * 1000) / 1000 : undefined);
          const row = { style, cfg: c.name, tris: topo.triangleCount, sliver: topo.sliverCount, bnd: topo.boundaryEdges,
            maxDevMm: wall.maxMm != null ? r3(wall.maxMm) : wall.err, p99DevMm: r3(wall.p99Mm),
            crestRmsMm: serr ? r3(serr.crestBandRmsMm) : undefined, crestMaxMm: serr ? r3(serr.maxCrestDevMm) : undefined,
            buildS: Math.round((Date.now() - t0) / 100) / 10 };
          rows.push(row); console.log(JSON.stringify(row));
        } catch (e) {
          const row = { style, cfg: c.name, error: String(e.message || e).slice(0, 90), buildS: Math.round((Date.now() - t0) / 100) / 10 };
          rows.push(row); console.log(JSON.stringify(row));
        }
      }
    }
    fs.writeFileSync('C:/Users/patij212/AppData/Local/Temp/pf_fidelity_sweep.json', JSON.stringify(rows, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
