// Task-9 decisive measurement: is SFB's residual ~0.87mm absolute chord
// DENSITY/BUDGET-limited (more triangles close it -> budget honesty closes it) or
// IRREDUCIBLE (cusp/clip-margin -> budget honesty = honest refusal, not closure)?
//
// Sweeps the density/budget dev levers on a REAL GPU SFB@1 export with the flag ON
// and measures the B5 absolute chord (__pfFidelity.diagnoseSurfaceFidelity).
// Levers: __pfFidelityFeatureLevel (crest density), __pfConformingMaxLevel (depth),
// __pfConformingMaxSag (sizing), __pfConformingBudget (decouple the 6M cap).
//
// Usage: node e2e/_fidelity_density_sweep.cjs   (dev server up)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

const CONFIGS = [
  { name: 'baseline (featL11,maxL12,sag0.05,bud6M)', featL: 11, maxL: 12, sag: 0.05, bud: 6000000 },
  { name: 'crest density (featL13,maxL14,sag0.05,bud12M)', featL: 13, maxL: 14, sag: 0.05, bud: 12000000 },
  { name: 'finer sizing (featL13,maxL14,sag0.03,bud12M)', featL: 13, maxL: 14, sag: 0.03, bud: 12000000 },
];

async function run(browser, c) {
  const page = await browser.newPage();
  await page.addInitScript((cfg) => {
    window.__pfConforming = true;
    window.__pfSurfaceFidelityExact = true;
    window.__pfFidelityFeatureLevel = cfg.featL;
    window.__pfConformingMaxLevel = cfg.maxL;
    window.__pfConformingMaxSag = cfg.sag;
    window.__pfConformingBudget = cfg.bud;
  }, c);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), 'SuperformulaBlossom'), 60000, 'setStyle');
  await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');
  const d = await withTimeout(page.evaluate((bud) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: bud }), c.bud), 480000, 'diagnose');
  await page.close();
  return d;
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  try {
    console.log('=== Task-9 SFB@1 density/budget sweep (real GPU, B5 absolute chord, seam+riser excl) ===');
    let prev = null;
    for (const c of CONFIGS) {
      try {
        const d = await run(browser, c);
        if (!d) { console.log(`  ${c.name}: NULL (decimation/parallelism or config refusal)`); continue; }
        const drop = prev ? ` (chord ${prev.toFixed(3)}->${d.chordMaxMm.toFixed(3)})` : '';
        console.log(`  ${c.name}: chordMax=${d.chordMaxMm.toFixed(3)}mm p99=${d.p99DevMm.toFixed(3)} vertexMax=${d.vertexMaxMm.toFixed(4)} tris=${d.triangleCount} nAbove=${d.nAbove}/${d.samples}${drop}`);
        prev = d.chordMaxMm;
      } catch (e) { console.log(`  ${c.name}: ERROR ${String(e.message).slice(0, 80)}`); }
    }
    console.log('=> If chordMax falls toward tol (0.05) as density rises, the 0.87mm is DENSITY/BUDGET-limited (Task 9 budget-decouple closes it). If it PLATEAUS, it is irreducible (cusp/clip) -> Task 9 = honest refusal.');
  } finally { await browser.close(); }
})();
