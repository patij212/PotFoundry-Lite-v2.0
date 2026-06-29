// CREASE-CHORD CONVERGENCE — does density CLOSE the perpendicular-3D (true) chord error
// at the steep relief crease (the staircasing), accepting whatever slivers result?
// Tests blunt (uniform level) vs TARGETED (maxSag down = refine where chord is large +
// nRing up = let the curvature-grid sampler actually SEE the crease between samples).
// Decisive q: does perp p99 cross the 0.1mm CAD tolerance? denseN FIXED (no confound).
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GyroidManifold';
const TARGET = Number(process.env.PF_TARGET_TRIS || 6000000);
const DENSE_N = 6;          // FIXED sampling resolution (never vary with mesh density)
const DIAG_TIMEOUT = 600000;

// label, and the levers each sets (undefined = leave at default). NOTE: the quadtree
// DEPTH cap follows the PROFILE sag (resolveQuadtreeMaxLevel(0.1)=10), NOT the maxSag
// lever — so targeted maxSag configs MUST raise maxLevel or the refiner is depth-clamped
// at L10 and can't reach the crease. Uniform configs kept <= target (6M) to avoid the
// budget-decimation confound that would corrupt the chord reading.
const CONFIGS = [
  // ADAPTIVE TEST: does a HIGHER sizing-grid resolution let a MODERATE maxSag reach
  // CAD-grade with FEWER tris than the blunt-deep reference (i.e. density only at the
  // crease)? Reference = the proven blunt-deep (sizingRes 128, maxSag 0.003).
  { label: 'BLUNT maxSag0.003+L16+sz128 ', maxSag: 0.003, maxLevel: 16, nRing: 2048 },
  { label: 'ADAPT maxSag0.02+L15+sz512  ', maxSag: 0.02, maxLevel: 15, nRing: 2048, sizingRes: 512 },
  { label: 'ADAPT maxSag0.02+L15+sz1024 ', maxSag: 0.02, maxLevel: 15, nRing: 2048, sizingRes: 1024 },
  { label: 'ADAPT maxSag0.01+L15+sz1024 ', maxSag: 0.01, maxLevel: 15, nRing: 2048, sizingRes: 1024 },
];

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runCfg(browser, cfg) {
  const page = await browser.newPage();
  try {
    await page.addInitScript((c) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (c.level && c.level > 0) window.__pfConformingUniformLevel = c.level;
      if (c.maxSag !== undefined) window.__pfConformingMaxSag = c.maxSag;
      if (c.maxLevel !== undefined) window.__pfConformingMaxLevel = c.maxLevel;
      if (c.nRing !== undefined) window.__pfConformingNRing = c.nRing;
      if (c.cells !== undefined) window.__pfConformingCellSamples = c.cells;
      if (c.sizingRes !== undefined) window.__pfConformingSizingRes = c.sizingRes;
    }, cfg);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    const perp = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    const qual = await withTimeout(page.evaluate(([t]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 20 }), [TARGET]), DIAG_TIMEOUT, 'qual').catch(() => null);
    return { perp, qual };
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  console.log(`=== CREASE CONVERGENCE ${STYLE} (denseN=${DENSE_N}, target=${TARGET}, tol=0.1mm) ===`);
  console.log('config             | chordMax | perp_p99 | nAbove%  | worstAng | %<20  | wallTris');
  for (const cfg of CONFIGS) {
    let r = null, err = null;
    try { r = await runCfg(browser, cfg); } catch (e) { err = String(e.message).slice(0, 70); }
    if (err || !r || !r.perp) { console.log(`${cfg.label} | ERROR ${err || 'null'}`); continue; }
    const p = r.perp, q = r.qual || {};
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    const cross = p.p99DevMm <= 0.1 ? ' <= TOL' : '';
    console.log(`${cfg.label} | ${p.chordMaxMm.toFixed(4)} | ${p.p99DevMm.toFixed(4)} | ${naPct.padStart(7)}% | ${(q.worstMinAngleDeg ?? -1).toFixed(2).padStart(7)} | ${(q.pctBelow15 ?? -1).toFixed(1).padStart(4)}% | ${p.wallTriangles}${cross}`);
  }
  await browser.close(); console.log('done');
})();
