// Reproduce the straight-angle failure: level the camera to pitch ~0 using the
// shader's ray-direction dump (debug mode 7) as feedback, then screenshot and
// census holes at that exact view.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), 'DragonScales');
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });

async function centerRdZ() {
  return page.evaluate(async () => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(7);
    c.setQuality({ maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 30));
    const canvas = document.querySelector('canvas');
    const px = await c.readbackPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1);
    return px[2]; // rd.z
  });
}
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
let rdz = await centerRdZ();
console.log('initial rd.z =', rdz.toFixed(4));
for (let i = 0; i < 12 && Math.abs(rdz) > 0.005; i++) {
  const dy = -Math.sign(rdz) * Math.max(2, Math.min(60, Math.abs(rdz) * 140)); // drag to level
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  rdz = await centerRdZ();
  console.log(`iter ${i}: rd.z = ${rdz.toFixed(4)}`);
}
console.log('leveled. rd.z =', rdz.toFixed(5));
await page.waitForTimeout(3000); // inertia decay before measuring
// march forensics at the level view (single sample, accum settings)
const stats = await page.evaluate(async () => {
  const c = window.__pfRaycast.controller;
  c.setDebugMode(3);
  c.setQuality({ stepCapInteractive: 768, stepCapAccum: 768, featureFloorInteractive: 0.25, featureFloor: 0.25, maxSamples: 1 });
  const t0 = performance.now();
  while (c.needsFrame() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
  const canvas = document.querySelector('canvas');
  const W = 480, Hh = 480;
  const px = await c.readbackPixels(Math.floor(canvas.width / 2 - W / 2), Math.floor(canvas.height / 2 - Hh / 2), W, Hh);
  let hits = 0, miss = 0, capped = 0, evalsSum = 0, evalsMax = 0;
  const evalHist = {};
  for (let i = 0; i < px.length; i += 4) {
    const hit = px[i] >= 0; const ev = px[i + 1]; const cap = px[i + 2];
    if (hit) hits++; else miss++;
    if (cap > 0.5) capped++;
    evalsSum += ev; evalsMax = Math.max(evalsMax, ev);
    const bucket = ev < 50 ? '<50' : ev < 150 ? '50-150' : ev < 400 ? '150-400' : ev < 700 ? '400-700' : '>=700';
    evalHist[bucket] = (evalHist[bucket] || 0) + 1;
  }
  return { hits, miss, capped, evalsAvg: evalsSum / (px.length / 4), evalsMax, evalHist };
});
console.log('level-view forensics:', JSON.stringify(stats));
// single-sample shaded vs 16-sample shaded
const shot = async (label, n) => {
  await page.evaluate((nn) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: nn });
  }, n);
  await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/artifacts/raycast-quality-diag/level-9-${label}.png` });
};
await shot('16spp', 16);
// reference-quality at the same view: decides real-geometry vs march artifact
await page.evaluate(() => {
  const c = window.__pfRaycast.controller;
  c.setDebugMode(0);
  c.setQuality({ stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 16 });
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: 'e2e/artifacts/raycast-quality-diag/level-9-reference.png' });
console.log('screenshots saved');
await browser.close();
