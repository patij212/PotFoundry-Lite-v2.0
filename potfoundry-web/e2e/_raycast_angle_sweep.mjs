// Angle sweep for the "bands of holes dependent on the viewing angle" class:
// several elevations x deep zoom on SpiralRidges, census + perf at each.
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
    // re-kill auto-rotate every readback — it re-enables itself after the
    // setStyle-time kill and a rotating camera invalidates the census
    const cc = window.__pf_webgpu_camera_controller;
    if (cc?.state) { cc.state.autoRotate = false; }
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality(quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 180000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x0 = Math.floor(canvas.width / 2 - W / 2);
    const y0 = Math.floor(canvas.height / 2 - Hh / 2);
    const sum = (arr) => { let n = 0; for (let i = 0; i < arr.length; i += 4) if (arr[i] >= 0) n++; return n; };
    let prev = Array.from(await c.readbackPixels(x0, y0, W, Hh));
    for (let r = 0; r < 6; r++) {
      c.setQuality({});
      const t1 = performance.now();
      while (c.needsFrame() && performance.now() - t1 < 180000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x0, y0, W, Hh));
      if (sum(cur) === sum(prev)) return cur;
      prev = cur;
    }
    return prev;
  }, { mode, quality, W, Hh });
}
async function cameraSig() {
  return page.evaluate(async () => {
    const cc = window.__pf_webgpu_camera_controller;
    if (cc?.state) { cc.state.autoRotate = false; }
    const c = window.__pfRaycast.controller;
    c.setDebugMode(6);
    c.setQuality({ maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 30));
    const px = await c.readbackPixels(4, 4, 1, 1);
    return [px[0], px[1], px[2]];
  });
}
async function waitStill() {
  let prev = await cameraSig();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1200);
    const cur = await cameraSig();
    const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
    prev = cur;
    if (d < 0.01) return;
  }
}

await page.evaluate(() => {
  const s = window.__POTFOUNDRY_STORE__.getState();
  s.setStyle('SpiralRidges');
  const cc = window.__pf_webgpu_camera_controller;
  if (cc?.state) cc.state.autoRotate = false;
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(2), null, { timeout: 180_000 });

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

// zoom deep once, then step elevation between censuses
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(1200);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(1200);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(1200);

const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 };
const SHIPPED = { stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 };

for (let step = 0; step < 5; step++) {
  if (step > 0) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 4, { steps: 2 }); // small elevation increments
    await page.mouse.up();
  }
  await waitStill();
  const camA = await cameraSig();
  const truth = await readField(1, TRUTH);
  const inter = await readField(3, { stepCapInteractive: 224, stepCapAccum: 224, featureFloorInteractive: 0.6, featureFloor: 0.6, maxSamples: 1 });
  const conv = await readField(1, SHIPPED);
  let truthHits = 0, interMiss = 0, hardHoles = 0, contaminated = 0, capped = 0;
  for (let i = 0; i < truth.length; i += 4) {
    if (inter[i + 2] > 0.5) capped++;
    if (truth[i] <= -0.5) continue;
    truthHits++;
    if (inter[i] < 0) interMiss++;
    const mean = conv[i];
    if (mean <= -0.9999) hardHoles++;
    else if (mean < truth[i] - 5.0) contaminated++;
  }
  const perf = await page.evaluate(async (q) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality(q);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 180000) await new Promise((r) => requestAnimationFrame(r));
    return (performance.now() - t0) / q.maxSamples;
  }, SHIPPED);
  const camB = await cameraSig();
  const drift = Math.hypot(camB[0] - camA[0], camB[1] - camA[1], camB[2] - camA[2]);
  console.log(`elev${step}: interMiss=${interMiss}/${truthHits} capped=${(100 * capped / (W * Hh)).toFixed(0)}% | conv hardHoles=${hardHoles} contam=${contaminated} | perSample=${perf.toFixed(1)}ms | drift=${drift.toFixed(3)}mm${drift > 0.01 ? ' INVALID' : ''}`);
  await page.screenshot({ path: `${OUT}/sweep-elev${step}.png` });
}
await browser.close();
