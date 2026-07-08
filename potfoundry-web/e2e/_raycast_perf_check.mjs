import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), 'DragonScales');
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });
await page.waitForTimeout(1000);
const avgMs = await page.evaluate(async () => {
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, buttons: 1, pointerId: 1, bubbles: true }));
  const times = [];
  let last = performance.now();
  let x = cx;
  for (let i = 0; i < 60; i++) {
    x += 2;
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: cy, buttons: 1, pointerId: 1, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    times.push(now - last);
    last = now;
  }
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: cy, pointerId: 1, bubbles: true }));
  times.sort((a, b) => a - b);
  return times.slice(5, 55).reduce((s, v) => s + v, 0) / 50;
});
console.log(`interactive avg frame (DragonScales, banded march): ${avgMs.toFixed(1)}ms`);
await browser.close();
