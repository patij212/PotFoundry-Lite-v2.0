// LUT staleness probe: dump the per-bin band LUT (debug mode 5) right after
// switching TO each style from a fresh load, to check whether the bound
// kernel actually recomputed for the new style or is serving a stale/prior
// style's radius bounds (RaycastController.boundInputsChanged suspect).
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

async function dumpLut() {
  return page.evaluate(async () => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(5);
    c.setQuality({ maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
    // LUT dump: pixel column i (0..63) -> [max, min, i, 1]. Read a 64x1 strip
    // at the top-left of the canvas (column index == pixel x).
    const px = await c.readbackPixels(0, 0, 64, 1);
    const out = [];
    for (let i = 0; i < 64; i++) out.push({ bin: i, max: px[i * 4], min: px[i * 4 + 1] });
    return out;
  });
}

const initialStyle = await page.evaluate(() => window.__POTFOUNDRY_STORE__.getState().style);
console.log('initial style on load:', JSON.stringify(initialStyle));

for (const [id, key] of [[0, 'SuperformulaBlossom'], [9, 'DragonScales'], [5, 'GothicArches']]) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), key);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 180_000 });
  const lut = await dumpLut();
  const maxes = lut.map((b) => b.max).filter((v) => Number.isFinite(v));
  const mins = lut.map((b) => b.min).filter((v) => Number.isFinite(v) && v < 1e6);
  console.log(`style ${id} (${key}): bin-max range [${Math.min(...maxes).toFixed(2)}, ${Math.max(...maxes).toFixed(2)}] bin-min range [${Math.min(...mins).toFixed(2)}, ${Math.max(...mins).toFixed(2)}]`);
  console.log('  first 8 bins:', lut.slice(0, 8).map((b) => `[${b.max.toFixed(1)},${b.min.toFixed(1)}]`).join(' '));
  console.log('  last 8 bins:', lut.slice(-8).map((b) => `[${b.max.toFixed(1)},${b.min.toFixed(1)}]`).join(' '));
}
await browser.close();
