// SFB@1 serration ROOT-CAUSE diagnosis (lean) — is the VISIBLE serration GEOMETRIC
// (crest wobble / flank faceting in the actual surface) or SHADING noise from sliver
// triangle normals? Render-independent numbers on the production (strip-pave OFF) mesh:
//   - diagnoseCrestLateralDeviation : crest apex side-to-side wobble (mm) vs analytic ridge
//   - diagnoseSurfaceFidelity       : perpendicular 3D chord error (mm) — flank faceting
//   - diagnoseCrestQuality          : crest-band triangle min-angle (the slivers)
// Smaller target (faster build, representative character); per-call timing.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = 'SuperformulaBlossom';
const TARGET = Number(process.env.PF_TARGET || 1_500_000);
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const T = 240_000;
fs.mkdirSync(OUT, { recursive: true });
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${l} timeout`)), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const out = { style: STYLE, target: TARGET };
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (/error/i.test(t)) console.log('  [page]', t.slice(0, 140)); });
  const stamp = (l) => console.log(`  [t+${process.uptime().toFixed(0)}s] ${l}`);
  try {
    await page.addInitScript(() => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
      window.__pfConformingUBias = 3;
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wt(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    await wt(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');
    stamp('configured');

    const safe = (fn, label) => wt(page.evaluate(fn, TARGET), T, label).then((r) => { stamp(`${label} done`); return r; }).catch((e) => { stamp(`${label} ERR`); return { err: String(e.message).slice(0, 90) }; });
    out.crestLateralDeviation = await safe((t) => window.__pfFidelity.diagnoseCrestLateralDeviation({ targetTriangles: t }), 'crestLateral');
    out.surfaceFidelity = await safe((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, metric: 'perpendicular', denseN: 3 }), 'surfaceFidelity');
    out.crestQuality = await safe((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t }), 'crestQuality');
  } catch (e) {
    out.error = String(e.message).slice(0, 160);
  } finally {
    await page.close();
    await browser.close();
    console.log('browser.close() ran');
  }
  console.log('\n===== SFB@1 SERRATION ROOT-CAUSE =====');
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(OUT, '_sfb1_serration_diag.json'), JSON.stringify(out, null, 2));
})();
