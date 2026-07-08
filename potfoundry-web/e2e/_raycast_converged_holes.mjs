// CONVERGED-image hole check: after full 16-sample accumulation (march-phase
// jittered per sample), a pixel is a REAL converged hole only if ground truth
// (no-skip dense march) hits but ALL 16 production samples missed (mean == -1).
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
const W = 560, Hh = 560;
async function readField(opts) {
  return page.evaluate(async ({ W, Hh, opts }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(opts.mode);
    c.setQuality(opts.quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x = Math.floor(canvas.width / 2 - W / 2);
    const y = Math.floor(canvas.height / 2 - Hh / 2);
    // Stability: heavy GPU passes can leave a flaky first frame; require two
    // consecutive reads with matching hit-count checksums (spec A3 pattern).
    const sum = (arr) => { let n = 0; for (let i = 0; i < arr.length; i += 4) if (arr[i] >= 0) n++; return n; };
    let prev = Array.from(await c.readbackPixels(x, y, W, Hh));
    for (let r = 0; r < 6; r++) {
      c.setQuality({});
      const t1 = performance.now();
      while (c.needsFrame() && performance.now() - t1 < 60000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x, y, W, Hh));
      if (sum(cur) === sum(prev)) return cur;
      prev = cur;
    }
    return prev;
  }, { W, Hh, opts });
}
for (const [id, key] of [[0, 'SuperformulaBlossom'], [9, 'DragonScales'], [5, 'GothicArches'], [12, 'GyroidManifold']]) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), key);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 180_000 });
  const truth = await readField({ mode: 1, quality: { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 } });
  const conv = await readField({ mode: 1, quality: { stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 } });
  let convHoles = 0, partial = 0;
  const spots = [];
  for (let yy = 1; yy < Hh - 1; yy++) {
    for (let xx = 1; xx < W - 1; xx++) {
      const i = yy * W + xx;
      if (truth[i * 4] <= -0.5) continue;         // truth misses: opening/background
      const mean = conv[i * 4];                   // accumulated mean of hit.t (miss = -1)
      if (mean <= -0.9999) {                      // ALL 16 samples missed
        convHoles++;
        if (spots.length < 5) spots.push(`(${xx},${yy})`);
      } else if (mean < 0) {
        partial++;                                // some samples hit (AA edge pixel)
      }
    }
  }
  console.log(`style ${id}: convergedHoles=${convHoles} partialEdgePixels=${partial}${spots.length ? '  at ' + spots.join(' ') : ''}`);
}
await browser.close();
