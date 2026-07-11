// Baseline at the user's screenshot-#3 pose: inner wall at razor grazing
// (camera near rim height, looking across the bowl interior), SpiralRidges.
// Measures BOTH open defects: (1) angle-dependent inner-wall hole bands
// (miss census vs banded-ultra truth at both tiers), (2) the "few FPS"
// perf collapse (per-sample accumulation frame time at shipped quality).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = 'artifacts/raycast-user-repro';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1240 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const W = 640, Hh = 640;
async function readField(mode, quality) {
  return page.evaluate(async ({ mode, quality, W, Hh }) => {
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
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1500);
    const cur = await cameraSig();
    const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
    prev = cur;
    if (d < 0.01) return prev;
  }
  console.log('WARNING: camera never stabilized');
  return prev;
}

await page.evaluate(() => {
  const s = window.__POTFOUNDRY_STORE__.getState();
  s.setStyle('SpiralRidges');
  const cc = window.__pf_webgpu_camera_controller;
  if (cc?.state) cc.state.autoRotate = false;
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(2), null, { timeout: 180_000 });

// Pose: mild elevation (looking slightly down across the interior), then zoom
// deep so the far inner wall fills the frame at grazing incidence.
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx, cy - 9, { steps: 3 });
await page.mouse.up();
await page.waitForTimeout(1500);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(1500);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(1500);
const camStart = await waitStill();

// (1) PERF: time a full 16-sample shipped accumulation, report per-sample ms.
const SHIPPED = { stepCapInteractive: 224, stepCapAccum: 1536, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 };
const perf = await page.evaluate(async (q) => {
  const c = window.__pfRaycast.controller;
  c.setDebugMode(0);
  c.setQuality(q); // restarts accumulation
  const t0 = performance.now();
  while (c.needsFrame() && performance.now() - t0 < 180000) await new Promise((r) => requestAnimationFrame(r));
  const total = performance.now() - t0;
  return { total, perSample: total / q.maxSamples };
}, SHIPPED);
console.log(`PERF shipped 16-sample accumulation: total=${perf.total.toFixed(0)}ms perSample=${perf.perSample.toFixed(1)}ms (~${(1000 / perf.perSample).toFixed(1)} fps equivalent)`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/grazing-spiralridges-converged.png` });

// (2) CENSUS at both tiers vs banded-ultra truth
const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 };
const truth = await readField(1, TRUTH);
const inter = await readField(3, { stepCapInteractive: 224, stepCapAccum: 224, featureFloorInteractive: 0.6, featureFloor: 0.6, maxSamples: 1 });
const conv = await readField(1, SHIPPED);
let truthHits = 0, interMiss = 0, interCapped = 0, hardHoles = 0, contaminated = 0, evalsSum = 0, evalsMax = 0;
for (let i = 0; i < truth.length; i += 4) {
  evalsSum += inter[i + 1];
  evalsMax = Math.max(evalsMax, inter[i + 1]);
  if (inter[i + 2] > 0.5) interCapped++;
  if (truth[i] <= -0.5) continue;
  truthHits++;
  if (inter[i] < 0) interMiss++;
  const mean = conv[i];
  if (mean <= -0.9999) hardHoles++;
  else if (mean < truth[i] - 5.0) contaminated++;
}
const n = truth.length / 4;
console.log(`INTERACTIVE(224/0.6): missWhereTruthHits=${interMiss} of ${truthHits} (${(100 * interMiss / Math.max(1, truthHits)).toFixed(2)}%) capped=${interCapped} (${(100 * interCapped / n).toFixed(1)}%) meanEvals=${(evalsSum / n).toFixed(0)} maxEvals=${evalsMax}`);
console.log(`CONVERGED(16spp): hardHoles=${hardHoles} contaminated=${contaminated} (${(100 * (hardHoles + contaminated) / Math.max(1, truthHits)).toFixed(2)}% defective)`);

const camEnd = await cameraSig();
const drift = Math.hypot(camEnd[0] - camStart[0], camEnd[1] - camStart[1], camEnd[2] - camStart[2]);
console.log(`camera drift: ${drift.toFixed(4)}mm ${drift > 0.01 ? '— READBACKS INVALID' : '(stable)'}`);
await browser.close();
