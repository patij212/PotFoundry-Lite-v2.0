// SFB@1 uBias sliver test — does the forced __pfConformingUBias=3 (the STLs' setting)
// over-correct the anisotropy and explode the sliver count (the "brushed spike" surface
// the user sees)? Measures diagnoseCrestQuality (whole-wall + crest-band %<15deg, worst
// min-angle) at the uBias in PF_UBIAS. Run at 3 / 2 / auto and compare. One build.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = 'SuperformulaBlossom';
const TARGET = 3_000_000;
const UBIAS = process.env.PF_UBIAS || '3';
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const T = 400_000;
fs.mkdirSync(OUT, { recursive: true });
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${l} timeout`)), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const out = { style: STYLE, uBias: UBIAS };
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (/error/i.test(t)) console.log('  [page]', t.slice(0, 130)); });
  try {
    await page.addInitScript((args) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true; // the STLs' setting (crests inserted)
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
      if (args.ubias !== 'auto') window.__pfConformingUBias = Number(args.ubias);
    }, { ubias: UBIAS });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wt(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    await wt(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');
    out.crestQuality = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t }), TARGET), T, 'crestQ').catch((e) => ({ err: String(e.message).slice(0, 80) }));
    out.topology = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopology({ targetTriangles: t }), TARGET), T, 'topo').catch((e) => ({ err: String(e.message).slice(0, 80) }));
  } catch (e) {
    out.error = String(e.message).slice(0, 160);
  } finally {
    await page.close();
    await browser.close();
    console.log('browser.close() ran');
  }
  const q = out.crestQuality || {};
  console.log(`\n[SFB@1 uBias=${UBIAS}] tris=${q.triangleCount} pctBelow15(whole)=${q.pctBelow15} bandPctBelow15=${q.bandPctBelow15} worst=${q.worstMinAngleDeg} p1=${q.p1MinAngleDeg} | nonMan=${(out.topology||{}).nonManifoldEdges} bnd=${(out.topology||{}).boundaryEdges}`);
  fs.writeFileSync(path.join(OUT, `_sfb1_ubias_${UBIAS}.json`), JSON.stringify(out, null, 2));
})();
