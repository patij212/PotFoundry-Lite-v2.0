// Focused residual probe: (1) ArtDeco + remaining styles at SHORT-WIDE (the
// timeout/sliver suspects), (2) faithful SERRATION numbers for smooth styles at
// default (refRes=512 decoupled reference → the CAD-grade number, not the
// inflated mesh-own-grid one). Writes a JSON summary. No rendering (fast-ish).
// Usage: node e2e/_residual_probe.cjs   (run from potfoundry-web/, dev server up)
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const OUT = process.env.PF_OUT || 'C:/Users/patij212/AppData/Local/Temp/pf_residual';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const SHORTWIDE = { H: 40, Rt: 150, Rb: 150 };
const SW_STYLES = ['ArtDeco', 'DragonScales', 'GothicArches', 'SpiralRidges', 'HexagonalHive', 'FourierBloom', 'BasketWeave', 'CelticTriquetra'];
const SERR_STYLES = ['SuperformulaBlossom', 'FourierBloom', 'Crystalline', 'DragonScales', 'HarmonicRipple'];

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  const out = { shortwide: [], serration: [] };
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 512; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });

    // (1) SHORT-WIDE topology for the remaining suspects (ArtDeco = the timeout case).
    for (const style of SW_STYLES) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), SHORTWIDE), 60000, 'setDimensions');
        const topo = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTopoQuality()), 150000, 'topo');
        const row = { style, buildMs: Date.now() - t0, ok: topo.boundaryEdges === 0 && topo.nonManifoldEdges === 0 && topo.orientationMismatches === 0 && topo.sliverCount === 0, topo };
        out.shortwide.push(row); console.log('SW', JSON.stringify(row));
      } catch (e) {
        const row = { style, buildMs: Date.now() - t0, ok: false, error: String(e.message || e).slice(0, 120) };
        out.shortwide.push(row); console.log('SW', JSON.stringify(row));
      }
    }

    // (2) Faithful SERRATION (refRes=512) for smooth styles at DEFAULT dims.
    await withTimeout(page.evaluate(() => window.__pfFidelity.setDimensions({ H: 120, Rt: 70, Rb: 45 })), 60000, 'resetDims').catch(() => {});
    for (const style of SERR_STYLES) {
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        // drive style strength to full where applicable (sf_strength is SFB; harmless elsewhere)
        await page.evaluate(() => { try { window.__pfFidelity.setStyleParams({ sf_strength: 1 }); } catch (e) { /* not all styles */ } });
        const serr = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 150000, 'serr');
        const row = { style, serrationScore: serr && serr.serrationScore, crestBandRmsMm: serr && serr.crestBandRmsMm, maxCrestDevMm: serr && serr.maxCrestDevMm, p99: serr && serr.p99DevMm, raw: serr };
        out.serration.push(row); console.log('SERR', JSON.stringify({ style: row.style, serrationScore: row.serrationScore, crestBandRmsMm: row.crestBandRmsMm, maxCrestDevMm: row.maxCrestDevMm }));
      } catch (e) {
        const row = { style, error: String(e.message || e).slice(0, 120) };
        out.serration.push(row); console.log('SERR', JSON.stringify(row));
      }
    }
    fs.writeFileSync(`${OUT}/residual.json`, JSON.stringify(out, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
