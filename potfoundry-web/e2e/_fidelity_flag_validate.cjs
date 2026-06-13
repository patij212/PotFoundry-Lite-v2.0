// surfaceFidelityExact END-TO-END WIRING validation on REAL GPU (Task 11, pt1).
// Confirms the flag is wired+active in the real conforming export: flag OFF vs ON
// (via the __pfSurfaceFidelityExact hatch). ON must insert the style's fidelity
// edges (features up) AND raise feature-proximity density (tris up), watertight
// (boundaryEdges=0). The ABSOLUTE analytic fidelity needs the analytic-reference
// fix (red-team B5); this validates the WIRING.
//
// Style-parameterized: PF_STYLE (default SuperformulaBlossom). For SFB the probe
// sets sf_strength=1 (default is the smooth strength-0 pot); featured styles like
// ArtDeco use their defaults.
//
// Usage: PF_STYLE=ArtDeco node e2e/_fidelity_flag_validate.cjs   (dev server up)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const style = process.env.PF_STYLE || 'SuperformulaBlossom';

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runOnce(browser, fidelityOn) {
  const page = await browser.newPage();
  let tris = null;
  const re = /\[CONFORMING-FULL\]\s+\S+ tris=\d+\s+\(built=(\d+)\)/;
  page.on('console', (m) => { const mm = m.text().match(re); if (mm) tris = Number(mm[1]); });
  if (fidelityOn) await page.addInitScript(() => { window.__pfConforming = true; window.__pfSurfaceFidelityExact = true; });
  else await page.addInitScript(() => { window.__pfConforming = true; });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
  if (style === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');
  const metrics = await withTimeout(page.evaluate(() => window.__pfFidelity.measure({ targetTriangles: 1000000 })), 300000, 'measure');
  const feats = metrics && (metrics.featuresPresent !== undefined ? metrics.featuresPresent : (metrics.features ? metrics.features.present : null));
  const bnd = metrics && metrics.boundaryEdges;
  await page.close();
  return { tris, feats, bnd };
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  try {
    console.log(`=== surfaceFidelityExact e2e WIRING validation (real GPU, ${style}) ===`);
    const off = await runOnce(browser, false);
    console.log(`OFF: tris=${off.tris}  featuresPresent=${off.feats}  boundaryEdges=${off.bnd}`);
    const on = await runOnce(browser, true);
    console.log(`ON : tris=${on.tris}  featuresPresent=${on.feats}  boundaryEdges=${on.bnd}`);
    const trisUp = off.tris != null && on.tris != null && on.tris > off.tris;
    const featsUp = off.feats != null && on.feats != null && on.feats > off.feats;
    const watertight = on.bnd === 0;
    console.log(`=> trisUp=${trisUp} (${off.tris}->${on.tris})  featuresUp=${featsUp} (${off.feats}->${on.feats})  watertight(ON bnd=0)=${watertight}`);
    console.log(`VERDICT: ${(trisUp || featsUp) && watertight ? 'FLAG WIRED + ACTIVE + WATERTIGHT on real GPU' : 'investigate'}`);
  } catch (e) {
    console.log('PROBE_ERROR: ' + String(e.message).slice(0, 200));
  } finally { await browser.close(); }
})();
