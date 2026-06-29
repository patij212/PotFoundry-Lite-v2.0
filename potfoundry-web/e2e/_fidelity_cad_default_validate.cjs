// PRODUCTION-DEFAULT VALIDATION — sets NO mesher tuning levers, so the export uses the
// new CAD-fidelity floor baked into the 'high' profile path. Confirms the default export
// now reaches CAD-grade perp-3D chord AND stays watertight on the tangled styles + a smooth
// control. (This is the real "did the production change work" gate.)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const STYLES = (process.env.PF_STYLES || 'GyroidManifold,GothicArches,CelticKnot,HarmonicRipple').split(',').map((s) => s.trim());
const TARGET = Number(process.env.PF_TARGET_TRIS || 20000000);
const DENSE_N = 6;
const DIAG_TIMEOUT = 600000;

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runStyle(browser, style) {
  const page = await browser.newPage();
  try {
    // ONLY the conforming path — NO maxSag/maxLevel/nRing/cellSamples overrides, so the
    // production CAD-fidelity floor (high profile) is what gets exercised.
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    const perp = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'perp');
    const topo = await withTimeout(page.evaluate(([t]) => window.__pfFidelity.diagnoseTopology({ targetTriangles: t }), [TARGET]), DIAG_TIMEOUT, 'topo').catch((e) => ({ err: String(e.message).slice(0, 30) }));
    return { perp, topo };
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  console.log(`=== CAD-DEFAULT VALIDATION (production default, no levers, denseN=${DENSE_N}, tol=0.1mm) ===`);
  console.log('style             | perp_p99 | nAbove%  | vtxMax  | bnd | nonMan | wallTris | verdict');
  for (const style of STYLES) {
    let r = null, err = null;
    try { r = await runStyle(browser, style); } catch (e) { err = String(e.message).slice(0, 50); }
    if (err || !r || !r.perp) { console.log(`${style.padEnd(17)} | ERROR ${err || 'null'}`); continue; }
    const p = r.perp, topo = r.topo || {};
    const naPct = (100 * (p.nAbove || 0) / Math.max(1, p.samples)).toFixed(3);
    const bnd = topo.boundaryEdgeCount ?? topo.boundaryEdges ?? '?';
    const nm = topo.nonManifoldEdgeCount ?? topo.nonManifoldEdges ?? '?';
    const watertight = (bnd === 0 || bnd === '0') && (nm === 0 || nm === '0');
    const cad = p.p99DevMm <= 0.1;
    const verdict = cad && watertight ? 'PASS' : (cad ? 'chord-ok/leak?' : 'OVER-TOL');
    console.log(`${style.padEnd(17)} | ${p.p99DevMm.toFixed(4)} | ${naPct.padStart(7)}% | ${(p.vertexMaxMm ?? -1).toFixed(4)} | ${String(bnd).padStart(3)} | ${String(nm).padStart(6)} | ${String(p.wallTriangles).padStart(8)} | ${verdict}`);
  }
  await browser.close(); console.log('done');
})();
