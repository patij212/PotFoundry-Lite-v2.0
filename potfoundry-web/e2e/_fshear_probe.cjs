// F-shear root-cause probe — classifies WHY the short-wide residual slivers
// exist on the REAL GPU surface: anisotropy (axis-scaling fixes) vs area-collapse
// shear (only a rotated/metric-aligned cell fixes). Decides the GAP-1 fix.
// Usage: PF_STYLES=Crystalline,ArtDeco node e2e/_fshear_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const RES = Number(process.env.PF_RES || 0); // 0 → classifier default (192)
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 180000);
const styles = (process.env.PF_STYLES || 'Crystalline,ArtDeco')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Default short-wide (H40/OD300) — the GAP 1 dominant blocker. Override via env JSON.
const DIM = process.env.PF_DIM ? JSON.parse(process.env.PF_DIM) : { H: 40, top_od: 300, bottom_od: 280, r_drain: 20 };

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    console.log(`dims=${JSON.stringify(DIM)}`);
    for (const s of styles) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIM), 30000, `${s} setDims`);
        const r = await withTimeout(
          page.evaluate(
            (a) => window.__pfFidelity.diagnoseFShear(
              a.res > 0 ? { targetTriangles: a.t, resU: a.res, resT: a.res } : { targetTriangles: a.t },
            ),
            { t: targetTriangles, res: RES },
          ),
          PER_OP_MS, `${s} fshear`,
        );
        if (!r) { console.log(`${s.padEnd(18)} NULL (not on conforming path?)`); continue; }
        // irreducibleByAxisFrac → fraction of square slivers needing ROTATION (shear);
        // 1−that → fraction fixable by axis refinement (anisotropy).
        const verdict = r.sliverCountSquare === 0
          ? 'no-square-slivers'
          : (r.irreducibleByAxisFrac > 0.5 ? 'SHEAR(rotation)'
            : (r.irreducibleByAxisFrac < 0.05 ? 'ANISO(axis-fix)' : 'MIXED'));
        console.log(
          `${s.padEnd(18)} sqSliv=${r.sliverCountSquare}/${r.latticePoints} ` +
          `irredAxis=${(r.irreducibleByAxisFrac * 100).toFixed(1)}% (${r.irreducibleByAxisCount}) ` +
          `maxSqAsp=${r.maxSquareAspect.toFixed(0)} maxBestAxis=${r.maxBestAxisAspect.toFixed(0)} ` +
          `maxRot=${r.maxRotatedAspect.toFixed(2)} | cosA(sliv)=${r.meanCosAlphaSliver.toFixed(4)} ` +
          `maxCosA=${r.maxCosAlpha.toFixed(4)} ratioEG(sliv)=${r.meanRatioEGSliver.toFixed(1)} ` +
          `uLong=${(r.uLongFracSliver * 100).toFixed(0)}% => ${verdict} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
      } catch (e) {
        console.log(`${s.padEnd(18)} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 80)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
