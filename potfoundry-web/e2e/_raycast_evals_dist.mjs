// Eval-budget forensics over the SAME 48x48 center region the A10 gate test
// uses: for each style, single-sample production-interactive march (mode 3),
// report the evals distribution and capped/coarse fraction, to check whether
// the A10 median-delta regression correlates with budget exhaustion.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

async function scan(mode, quality, w, h) {
  return page.evaluate(async ({ mode, quality, w, h }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality({ ...quality, maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x = Math.floor(canvas.width / 2 - w / 2);
    const y = Math.floor(canvas.height / 2 - h / 2);
    return Array.from(await c.readbackPixels(x, y, w, h));
  }, { mode, quality, w, h });
}

for (const [id, key] of [[0, 'SuperformulaBlossom'], [9, 'DragonScales'], [5, 'GothicArches']]) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), key);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 180_000 });

  const field = await scan(3, { stepCapInteractive: 224, stepCapAccum: 224, featureFloorInteractive: 0.6, featureFloor: 0.6 }, 48, 48);
  let hits = 0, misses = 0, capped = 0, evalsSum = 0, near224 = 0, maxEvals = 0;
  for (let i = 0; i < field.length; i += 4) {
    const [t, evals, cap] = [field[i], field[i + 1], field[i + 2]];
    if (t >= 0) hits++; else misses++;
    if (cap > 0.5) capped++;
    if (evals >= 200) near224++;
    evalsSum += evals;
    maxEvals = Math.max(maxEvals, evals);
  }
  const n = field.length / 4;
  console.log(`style ${id}: hits=${hits} misses=${misses} cappedFlag=${capped} evals>=200(of224)=${near224} meanEvals=${(evalsSum / n).toFixed(1)} maxEvals=${maxEvals}`);
}
await browser.close();
