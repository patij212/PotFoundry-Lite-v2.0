// Zoom/resolution scaling probe: the fine march step is min(pixel_footprint,
// feature_floor) while the eval caps are FIXED — hypothesis: zooming in makes
// per-crossing cost explode, rays exhaust the cap, and the coarse-finish
// (remaining/32 per step) strides over 3mm walls -> the user's stripe holes.
// Sweep zoom levels at a large viewport; at each: fp, evals stats, capped
// fraction, hard-hole count vs banded-ultra truth, screenshot.
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

const SHIPPED = { stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 };
const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 };

await page.evaluate(() => {
  const s = window.__POTFOUNDRY_STORE__.getState();
  s.setStyle('DragonScales');
  s.setGeometryParams({ spinTurns: 0.4 });
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

for (let zoomStep = 0; zoomStep <= 4; zoomStep++) {
  if (zoomStep > 0) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(2500); // settle
  }
  // pixel footprint via debug mode 2 (fp_near, fp_far channels)
  const fpF = await readField(2, { ...SHIPPED, maxSamples: 1 });
  const ci = (Math.floor(Hh / 2) * W + Math.floor(W / 2)) * 4;
  const fpNear = fpF[ci], fpFar = fpF[ci + 1];

  // forensics at shipped accum cap
  const f3 = await readField(3, { stepCapInteractive: 768, stepCapAccum: 768, featureFloorInteractive: 0.25, featureFloor: 0.25, maxSamples: 1 });
  let miss = 0, capped = 0, evalsMax = 0, evalsSum = 0, n = 0;
  for (let i = 0; i < f3.length; i += 4) {
    n++;
    if (f3[i] < 0) miss++;
    if (f3[i + 2] > 0.5) capped++;
    evalsSum += f3[i + 1];
    evalsMax = Math.max(evalsMax, f3[i + 1]);
  }

  // hard-hole census vs truth at this zoom
  const truth = await readField(1, TRUTH);
  const conv = await readField(1, SHIPPED);
  let hardHoles = 0, contaminated = 0, truthHits = 0;
  for (let i = 0; i < truth.length; i += 4) {
    if (truth[i] <= -0.5) continue;
    truthHits++;
    const mean = conv[i];
    if (mean <= -0.9999) hardHoles++;
    else if (mean < truth[i] - 5.0) contaminated++;
  }

  console.log(
    `zoom${zoomStep}: fp=[${fpNear.toFixed(3)},${fpFar.toFixed(3)}]mm | s0(768/0.25): miss=${miss} capped=${capped} (${(100 * capped / n).toFixed(1)}%) meanEvals=${(evalsSum / n).toFixed(0)} maxEvals=${evalsMax} | vs truth: truthHits=${truthHits} hardHoles=${hardHoles} contaminated=${contaminated} (${(100 * (hardHoles + contaminated) / Math.max(1, truthHits)).toFixed(1)}% defective)`
  );

  await page.evaluate((q) => {
    const rc = window.__pfRaycast.controller;
    rc.setDebugMode(0);
    rc.setQuality(q);
  }, SHIPPED);
  await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 90_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/zoom${zoomStep}-dragonscales-twist.png` });
}
await browser.close();
