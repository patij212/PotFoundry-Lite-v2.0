// Where do the dt=0.23 and dt=0.1 marches land on disagreeing pixels?
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), 'DragonScales');
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });

const read = async (floor, cap) => page.evaluate(async ({ floor, cap }) => {
  const c = window.__pfRaycast.controller;
  c.setDebugMode(1);
  c.setQuality({ stepCapInteractive: cap, stepCapAccum: cap, featureFloor: floor, featureFloorInteractive: floor, maxSamples: 1 });
  const t0 = performance.now();
  while (c.needsFrame() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
  const canvas = document.querySelector('canvas');
  const x = Math.floor(canvas.width / 2 - 180);
  const y = Math.floor(canvas.height / 2 - 180);
  return Array.from(await c.readbackPixels(x, y, 360, 360));
}, { floor, cap });

const A = await read(0.25, 768);   // shipped-ish
const B = await read(0.1, 8192);   // reference
let shown = 0;
const summary = { aDeeper: 0, bDeeper: 0 };
for (let i = 0; i < A.length / 4 && true; i++) {
  const [ta, za, ra] = [A[i * 4], A[i * 4 + 1], A[i * 4 + 2]];
  const [tb, zb, rb] = [B[i * 4], B[i * 4 + 1], B[i * 4 + 2]];
  if (ta >= 0 && tb >= 0 && Math.abs(ta - tb) > 2.0) {
    if (ta > tb) summary.aDeeper++; else summary.bDeeper++;
    if (shown < 12) {
      console.log(`px${i}: A(t=${ta.toFixed(2)}, z=${za.toFixed(2)}, rho=${ra.toFixed(2)})  B(t=${tb.toFixed(2)}, z=${zb.toFixed(2)}, rho=${rb.toFixed(2)})  dt=${(ta - tb).toFixed(2)}`);
      shown++;
    }
  }
}
console.log('disagreeing: A deeper =', summary.aDeeper, ' B deeper =', summary.bDeeper);
await browser.close();
