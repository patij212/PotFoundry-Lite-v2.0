// Interactive-tier probe at zoom: sample 0 (and any frame during/after camera
// motion) marches at stepCapInteractive=224 — at zoom the fp-driven fine step
// (~0.04mm) makes a single band crossing cost ~500 evals, so rays cap out and
// coarse-finish with multi-mm strides through 3mm walls. Measure exactly that
// tier and screenshot the screen right after a camera nudge (what users SEE).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = 'artifacts/raycast-user-repro';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1240 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const W = 560, Hh = 560;
async function readField(mode, quality) {
  return page.evaluate(async ({ mode, quality, W, Hh }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality(quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x0 = Math.floor(canvas.width / 2 - W / 2);
    const y0 = Math.floor(canvas.height / 2 - Hh / 2);
    const sum = (arr) => { let n = 0; for (let i = 0; i < arr.length; i += 4) if (arr[i] >= 0) n++; return n; };
    let prev = Array.from(await c.readbackPixels(x0, y0, W, Hh));
    for (let r = 0; r < 6; r++) {
      c.setQuality({});
      const t1 = performance.now();
      while (c.needsFrame() && performance.now() - t1 < 120000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x0, y0, W, Hh));
      if (sum(cur) === sum(prev)) return cur;
      prev = cur;
    }
    return prev;
  }, { mode, quality, W, Hh });
}

await page.evaluate(() => {
  const s = window.__POTFOUNDRY_STORE__.getState();
  s.setStyle('DragonScales');
  s.setGeometryParams({ spinTurns: 0.4 });
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(1500);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(3000);

// Truth at this camera for the census
const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 };
const truth = await readField(1, TRUTH);

// INTERACTIVE-tier forensics: exactly the shipped sample-0 config (224 / 0.6)
const f3 = await readField(3, { stepCapInteractive: 224, stepCapAccum: 224, featureFloorInteractive: 0.6, featureFloor: 0.6, maxSamples: 1 });
let missOnTruth = 0, capped = 0, evalsMax = 0, evalsSum = 0, n = 0, truthHits = 0;
for (let i = 0; i < f3.length; i += 4) {
  n++;
  if (f3[i + 2] > 0.5) capped++;
  evalsSum += f3[i + 1];
  evalsMax = Math.max(evalsMax, f3[i + 1]);
  if (truth[i] > -0.5) {
    truthHits++;
    if (f3[i] < 0) missOnTruth++;
  }
}
console.log(`INTERACTIVE(224/0.6) at zoom: truthHits=${truthHits} missWhereTruthHits=${missOnTruth} (${(100 * missOnTruth / Math.max(1, truthHits)).toFixed(1)}%) capped=${capped} (${(100 * capped / n).toFixed(1)}%) meanEvals=${(evalsSum / n).toFixed(0)} maxEvals=${evalsMax}`);

// What the user SEES right after camera motion: restore shipped quality+shaded,
// nudge the camera (restarts accumulation), screenshot within ~1-2 samples.
await page.evaluate(() => {
  const rc = window.__pfRaycast.controller;
  rc.setDebugMode(0);
  rc.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });
});
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 25, cy - 10, { steps: 3 });
await page.mouse.up();
await page.waitForTimeout(120); // 1-2 frames in — early accumulation, what the eye sees
await page.screenshot({ path: `${OUT}/interactive-early-dragonscales-twist.png` });
await page.waitForTimeout(700); // few more samples
await page.screenshot({ path: `${OUT}/interactive-mid-dragonscales-twist.png` });
await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 90_000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/interactive-converged-dragonscales-twist.png` });
await browser.close();
