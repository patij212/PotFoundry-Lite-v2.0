// Reproduce the user-reported stripe-hole breakup (2026-07-10 screenshot):
// twisted style, zoomed-in view. The shipped gate only covers default camera +
// default params (no twist) so it never sees this. For each case:
//   1. converged shaded screenshot (visual proof)
//   2. hole census vs banded-ultra truth (mode 1): hard holes (all 16 samples
//      miss), majority-miss, and mean-contaminated (some samples miss) pixels
//   3. mode-3 forensics: evals histogram + capped fraction + single-sample miss
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = 'artifacts/raycast-user-repro';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const W = 480, Hh = 480;
async function readField(mode, quality) {
  return page.evaluate(async ({ mode, quality, W, Hh }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality(quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x0 = Math.floor(canvas.width / 2 - W / 2);
    const y0 = Math.floor(canvas.height / 2 - Hh / 2);
    const sum = (arr) => { let n = 0; for (let i = 0; i < arr.length; i += 4) if (arr[i] >= 0) n++; return n; };
    let prev = Array.from(await c.readbackPixels(x0, y0, W, Hh));
    for (let r = 0; r < 6; r++) {
      c.setQuality({});
      const t1 = performance.now();
      while (c.needsFrame() && performance.now() - t1 < 90000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x0, y0, W, Hh));
      if (sum(cur) === sum(prev)) return cur;
      prev = cur;
    }
    return prev;
  }, { mode, quality, W, Hh });
}

const SHIPPED = { stepCapInteractive: 224, stepCapAccum: 1536, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 };
const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 };

const CASES = [
  { id: 0, key: 'SuperformulaBlossom', opts: { sf_strength: 1.0 }, spinTurns: 0.4, label: 'sfb-strength1-twist' },
  { id: 9, key: 'DragonScales', opts: {}, spinTurns: 0.4, label: 'dragonscales-twist' },
  { id: 0, key: 'SuperformulaBlossom', opts: { sf_strength: 1.0 }, spinTurns: 0.0, label: 'sfb-strength1-notwist' },
];

for (const c of CASES) {
  await page.evaluate(({ key, opts, spinTurns }) => {
    const s = window.__POTFOUNDRY_STORE__.getState();
    s.setStyle(key);
    s.setStyleOpts(opts);
    s.setGeometryParams({ spinTurns });
  }, c);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), c.id, { timeout: 180_000 });

  // zoom in close like the user's screenshot (wheel over canvas center), let inertia settle
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(3000); // inertia settle — stationary camera before any readback

  // 1. converged shaded screenshot
  await page.evaluate((q) => {
    const rc = window.__pfRaycast.controller;
    rc.setDebugMode(0);
    rc.setQuality(q);
  }, SHIPPED);
  await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 60_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${c.label}-converged.png` });

  // 2. hole census vs banded-ultra truth
  const truth = await readField(1, TRUTH);
  const conv = await readField(1, SHIPPED);
  let hardHoles = 0, majorityMiss = 0, contaminated = 0, cleanHits = 0;
  for (let yy = 1; yy < Hh - 1; yy++) {
    for (let xx = 1; xx < W - 1; xx++) {
      const i = (yy * W + xx) * 4;
      const tTruth = truth[i];
      if (tTruth <= -0.5) continue; // background/opening in truth
      const mean = conv[i];
      if (mean <= -0.9999) hardHoles++;
      else if (mean < 0) majorityMiss++;
      else if (mean < tTruth - 5.0) contaminated++; // one miss drags mean by ~(t+1)/16
      else cleanHits++;
    }
  }
  const total = hardHoles + majorityMiss + contaminated + cleanHits;
  console.log(`${c.label}: truthHits=${total} hardHoles=${hardHoles} majorityMiss=${majorityMiss} meanContaminated=${contaminated} clean=${cleanHits} (${(100 * (hardHoles + majorityMiss + contaminated) / Math.max(1, total)).toFixed(1)}% defective)`);

  // 3. mode-3 forensics at shipped ACCUM config, single sample
  const f3 = await readField(3, { stepCapInteractive: 768, stepCapAccum: 768, featureFloorInteractive: 0.25, featureFloor: 0.25, maxSamples: 1 });
  let miss = 0, capped = 0, evalsMax = 0, evalsSum = 0, n = 0, hi = 0;
  for (let i = 0; i < f3.length; i += 4) {
    n++;
    if (f3[i] < 0) miss++;
    if (f3[i + 2] > 0.5) capped++;
    evalsSum += f3[i + 1];
    evalsMax = Math.max(evalsMax, f3[i + 1]);
    if (f3[i + 1] >= 700) hi++;
  }
  console.log(`  forensics(accum768/0.25 s0): miss=${miss} capped=${capped} evals>=700=${hi} meanEvals=${(evalsSum / n).toFixed(1)} maxEvals=${evalsMax}`);
}
await browser.close();
