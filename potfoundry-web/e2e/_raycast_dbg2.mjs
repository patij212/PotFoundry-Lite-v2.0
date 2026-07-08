// Read the shader's own view of dt_fine / band LUT / floor uniform (debug mode 2).
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), 'DragonScales');
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });

const read = async (floor) => page.evaluate(async (floor) => {
  const c = window.__pfRaycast.controller;
  c.setDebugMode(2);
  c.setQuality({ stepCapInteractive: 768, stepCapAccum: 768, featureFloor: floor, featureFloorInteractive: floor, maxSamples: 1 });
  const t0 = performance.now();
  while (c.needsFrame() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
  const canvas = document.querySelector('canvas');
  const px = await c.readbackPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 2, 2);
  return Array.from(px.slice(0, 4));
}, floor);

for (const floor of [0.25, 0.6, 2.0]) {
  const [fpNear, fpFar, bandHi, floorSeen] = await read(floor);
  console.log(`floor=${floor}: fp_near=${fpNear.toFixed(5)} fp_far=${fpFar.toFixed(4)} bandHi(mid)=${bandHi.toFixed(2)} RC.feature_floor=${floorSeen.toFixed(3)}`);
}
await browser.close();
