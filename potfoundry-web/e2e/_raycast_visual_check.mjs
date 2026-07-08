import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = 'e2e/artifacts/raycast-quality-diag';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
for (const [id, key] of [[0, 'SuperformulaBlossom'], [5, 'GothicArches'], [9, 'DragonScales'], [12, 'GyroidManifold']]) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), key);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 180_000 });
  await page.evaluate(() => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });
  });
  await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/final-${id}-converged.png` });
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 - 30, { steps: 5 });
  await page.screenshot({ path: `${OUT}/final-${id}-dragging.png` });
  await page.mouse.up();
  await page.waitForTimeout(2500);
}
await browser.close();
console.log('done');
