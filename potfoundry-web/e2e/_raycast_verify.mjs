// CONSOLIDATED fast verification harness for the ray-cast preview.
// One browser session; per style: converged-hole census (vs banded-ultra
// truth), shipped-quality screenshot, mid-drag screenshot. Plus a perf probe.
// Replaces sequential runs of _raycast_hole_hunt/_converged_holes/_visual_check/
// _perf_check (each of which relaunched a browser and recompiled pipelines).
// Usage: node e2e/_raycast_verify.mjs [styleId ...]   (default: 0 9 5 12)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const KEYS = { 0: 'SuperformulaBlossom', 5: 'GothicArches', 9: 'DragonScales', 12: 'GyroidManifold' };
const styles = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [0, 9, 5, 12];
const OUT = 'e2e/artifacts/raycast-quality-diag';
mkdirSync(OUT, { recursive: true });
const t00 = Date.now();

const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const W = 480, Hh = 480;
async function readField(mode, quality) {
  return page.evaluate(async ({ W, Hh, mode, quality }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality(quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 30));
    const canvas = document.querySelector('canvas');
    return Array.from(await c.readbackPixels(Math.floor(canvas.width / 2 - W / 2), Math.floor(canvas.height / 2 - Hh / 2), W, Hh));
  }, { W, Hh, mode, quality });
}

let failures = 0;
for (const id of styles) {
  const t0 = Date.now();
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), KEYS[id]);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 180_000 });
  const tCompile = Date.now() - t0;

  // truth = banded march at ultra density (TDR-safe; full-canvas no-skip
  // marches trip the Windows GPU watchdog — see CLAUDE.md gotchas)
  const truth = await readField(1, { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 });
  // converged production accumulation
  const conv = await readField(1, { stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });
  let holes = 0, ghost = 0;
  for (let i = 0; i < truth.length; i += 4) {
    if (truth[i] <= -0.5) continue;
    if (conv[i] <= -0.9999) holes++;        // all 16 samples missed a true surface
    else if (conv[i] < 0) ghost++;          // partial hit/miss mix (AA edge)
  }
  if (holes > 0) failures++;

  // screenshots: shipped converged + mid-drag
  await page.evaluate(() => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });
  });
  await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/verify-${id}-converged.png` });
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 - 25, { steps: 4 });
  await page.screenshot({ path: `${OUT}/verify-${id}-dragging.png` });
  await page.mouse.up();
  await page.waitForTimeout(2200); // inertia decay before the next style

  console.log(`style ${id} (${KEYS[id]}): convergedHoles=${holes} aaEdgePixels=${ghost} compile=${(tCompile / 1000).toFixed(1)}s total=${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// perf: interactive frame time on the last style
const avgMs = await page.evaluate(async () => {
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, buttons: 1, pointerId: 1, bubbles: true }));
  const times = []; let last = performance.now(); let x = cx;
  for (let i = 0; i < 50; i++) {
    x += 2;
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: cy, buttons: 1, pointerId: 1, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now(); times.push(now - last); last = now;
  }
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: cy, pointerId: 1, bubbles: true }));
  times.sort((a, b) => a - b);
  return times.slice(5, 45).reduce((s, v) => s + v, 0) / 40;
});
console.log(`interactive avg frame: ${avgMs.toFixed(1)}ms`);
console.log(`TOTAL: ${((Date.now() - t00) / 1000).toFixed(1)}s — ${failures === 0 ? 'PASS' : 'FAIL (' + failures + ' styles with converged holes)'}`);
await browser.close();
process.exitCode = failures === 0 ? 0 : 1;
