// Feasibility probe for the surfaceFidelityExact e2e gate (Task 11): does this
// environment provide a real WebGPU adapter in headed Chromium, and does a real
// conforming export complete? If yes, the analytic OFF-vs-ON gate is buildable.
//
// Usage: node e2e/_fidelity_flag_feasibility.cjs   (dev server must be running)
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  } catch (e) {
    console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 200));
    console.log('VERDICT: headed Chromium cannot launch here (no display) — e2e gate needs a GPU/display runner.');
    process.exit(0);
  }
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { const t = m.text(); if (/adapter|webgpu|fallback|WebGL|conforming/i.test(t)) console.log('  [page] ' + t.slice(0, 140)); });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const adapter = await page.evaluate(async () => {
      const g = navigator.gpu; if (!g) return 'NO navigator.gpu';
      try { const a = await g.requestAdapter(); return a ? 'ADAPTER_OK' : 'NO_ADAPTER'; } catch (e) { return 'ADAPTER_ERR:' + String(e).slice(0, 80); }
    });
    console.log('navigator.gpu adapter: ' + adapter);
    await withTimeout(page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 60000 }), 65000, 'hook-present');
    await withTimeout(page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 }), 95000, 'hook-ready');
    console.log('__pfFidelity ready: YES');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), 'SuperformulaBlossom'), 60000, 'setStyle');
    const t0 = Date.now();
    const m = await withTimeout(page.evaluate(() => window.__pfFidelity.measure({ targetTriangles: 200000 })), 300000, 'measure');
    console.log(`measure() completed in ${Date.now() - t0}ms: maxSagMm=${m && m.maxSagMm}, tris(reported via metrics present)`);
    console.log('VERDICT: GPU export path WORKS here — the analytic OFF-vs-ON gate is buildable.');
    await page.close();
  } catch (e) {
    console.log('PROBE_ERROR: ' + String(e.message).slice(0, 200));
    console.log('VERDICT: export path did not complete — inspect (adapter/timeout). Gate may need a GPU runner.');
  } finally {
    await browser.close();
  }
})();
