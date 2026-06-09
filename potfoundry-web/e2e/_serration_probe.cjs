// Serration / CAD-fidelity probe — sweep a style's STRENGTH and measure the
// mesh's deviation from the analytic model (sag) + topology. Reproduces the
// "cuts/serrations in ridges at high strength" defect quantitatively.
// Usage: PF_STYLE=SuperformulaBlossom PF_PARAM=sf_strength node e2e/_serration_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 400000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 180000);
const style = process.env.PF_STYLE || 'SuperformulaBlossom';
const param = process.env.PF_PARAM || 'sf_strength';
const values = (process.env.PF_VALUES || '0,0.25,0.5,0.75,1.0').split(',').map(Number);
// Optional extra style params held fixed across the sweep (JSON), e.g. sharper corners.
const FIXED = process.env.PF_FIXED ? JSON.parse(process.env.PF_FIXED) : {};
const DIM = process.env.PF_DIM ? JSON.parse(process.env.PF_DIM) : null;

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    const DENSERES = process.env.PF_DENSERES ? Number(process.env.PF_DENSERES) : 0; // 0 → default 256
    await page.addInitScript((dr) => {
      window.__pfConforming = true;
      if (dr > 0) window.__pfConformingDenseRes = dr;
    }, DENSERES);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, `${style} setStyle`);
    if (DIM) await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIM), 30000, 'setDims');
    console.log(`style=${style} param=${param} fixed=${JSON.stringify(FIXED)} target=${targetTriangles}${DIM ? ' dim=' + JSON.stringify(DIM) : ''}`);
    for (const v of values) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), { ...FIXED, [param]: v }), 30000, `set ${param}=${v}`);
        const sr = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseSerration({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `serration ${v}`,
        );
        const q = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `topo ${v}`,
        );
        const srStr = sr
          ? `serr=${sr.serrationScore.toFixed(2)} crestRms=${sr.crestBandRmsMm.toFixed(4)}mm maxCrest=${sr.maxCrestDevMm.toFixed(3)}mm ` +
            `wallRms=${sr.rmsDevMm.toFixed(4)}mm loci=${sr.crestLoci} crestSamp=${sr.crestSamples}`
          : 'serr=NULL(legacy)';
        console.log(
          `${param}=${String(v).padEnd(5)} ${srStr} ` +
          `| sliver=${q.sliverCount} maxAspect=${q.maxAspect3D.toFixed(1)} bnd=${q.boundaryEdges} nonMan=${q.nonManifoldEdges} ` +
          `orient=${q.orientationMismatches} tris=${q.triangleCount} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
      } catch (e) {
        console.log(`${param}=${String(v).padEnd(5)} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 90)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
