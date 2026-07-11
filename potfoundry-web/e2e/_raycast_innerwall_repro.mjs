// Reproduce the residual inner-wall dash rows + silhouette serration
// (user screenshot #2, 2026-07-10, post wall-guard fix): SpiralRidges at an
// ELEVATED camera looking down into the bowl, zoomed. Census vs banded-ultra
// truth at BOTH tiers, then classify every interactive miss: evals spent,
// capped/coarse flag, and the truth hit's z/rho/band (mode 4) — testing H1:
// misses cluster in cap-exhausted (coarse) rays at near-tangent surfaces.
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
    const cc = window.__pf_webgpu_camera_controller;
    if (cc?.state) { cc.state.autoRotate = false; }
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality(quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x0 = Math.floor(canvas.width / 2 - W / 2);
    const y0 = Math.floor(canvas.height / 2 - Hh / 2);
    const sum = (arr) => { let n = 0; for (let i = 0; i < arr.length; i += 4) if (arr[i] >= 0) n++; return n; };
    let prev = Array.from(await c.readbackPixels(x0, y0, W, Hh));
    for (let r = 0; r < 6; r++) {
      c.setQuality({});
      const t1 = performance.now();
      while (c.needsFrame() && performance.now() - t1 < 120000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x0, y0, W, Hh));
      if (sum(cur) === sum(prev)) return cur;
      prev = cur;
    }
    return prev;
  }, { mode, quality, W, Hh });
}
async function centerRdZ() {
  return page.evaluate(async () => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(7);
    c.setQuality({ maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 30));
    const canvas = document.querySelector('canvas');
    return (await c.readbackPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1))[2];
  });
}

await page.evaluate(() => {
  const s = window.__POTFOUNDRY_STORE__.getState();
  s.setStyle('SpiralRidges'); // 9 helical ridges, 1.15 turns — the user's pot
  // kill the idle auto-rotate turntable: it resumes mid-census (30s+ readback
  // sequences) and a rotating camera fabricates phantom misses vs the truth
  // mask taken minutes earlier (measured 161-253mm drift = 5% phantom rate)
  const cc = window.__pf_webgpu_camera_controller;
  if (cc?.state) { cc.state.autoRotate = false; }
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(2), null, { timeout: 180_000 });

// Elevate the camera with a FIXED drag sequence (deterministic pose across
// runs — the old gain-feedback loop landed at slightly different pitches per
// run, making pre/post-fix censuses incomparable).
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
async function drag(dy) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(1400);
}
await drag(-12);
console.log('center rd.z after drag1 =', (await centerRdZ()).toFixed(3));
await drag(-6);
await page.waitForTimeout(6000); // full inertia decay — drift invalidates the census
console.log('center rd.z =', (await centerRdZ()).toFixed(3));
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(1500);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(6000); // zoom inertia decay before any readback

// converged shaded screenshot at shipped quality
await page.evaluate(() => {
  const rc = window.__pfRaycast.controller;
  rc.setDebugMode(0);
  rc.setQuality({ stepCapInteractive: 224, stepCapAccum: 1536, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });
});
await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 90_000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/innerwall-spiralridges-converged.png` });

// camera-drift guard: a drifting camera between the truth and production
// readbacks fabricates phantom holes at silhouettes (CLAUDE.md probe trap)
async function cameraSig() {
  return page.evaluate(async () => {
    // re-kill auto-rotate every probe: something re-enables it after the
    // early setStyle-time kill (persisted camera payload re-application),
    // and a rotating camera invalidates the whole census
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
// wait until the camera actually STOPS (inertia/easing outlasts fixed waits)
let camBefore = await cameraSig();
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2500);
  const cur = await cameraSig();
  const d = Math.hypot(cur[0] - camBefore[0], cur[1] - camBefore[1], cur[2] - camBefore[2]);
  camBefore = cur;
  if (d < 0.01) break;
  if (i === 29) console.log('WARNING: camera never stabilized, last delta', d.toFixed(3), 'mm');
}

const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 };
const truth = await readField(1, TRUTH);
const band4 = await readField(4, TRUTH); // truth z/rho + production band at that z

// converged census (16-sample means)
const conv = await readField(1, { stepCapInteractive: 224, stepCapAccum: 1536, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });
let hardHoles = 0, majorityMiss = 0, contaminated = 0, truthHits = 0;
for (let i = 0; i < truth.length; i += 4) {
  if (truth[i] <= -0.5) continue;
  truthHits++;
  const mean = conv[i];
  if (mean <= -0.9999) hardHoles++;
  else if (mean < 0) majorityMiss++;
  else if (mean < truth[i] - 5.0) contaminated++;
}
console.log(`CONVERGED: truthHits=${truthHits} hardHoles=${hardHoles} majorityMiss=${majorityMiss} contaminated=${contaminated} (${(100 * (hardHoles + majorityMiss + contaminated) / Math.max(1, truthHits)).toFixed(2)}% defective)`);

// interactive single-sample forensics + per-miss classification
const f3 = await readField(3, { stepCapInteractive: 224, stepCapAccum: 224, featureFloorInteractive: 0.6, featureFloor: 0.6, maxSamples: 1 });
let miss = 0, cappedMiss = 0, cappedAll = 0;
const evalsOfMisses = [];
const examples = [];
for (let yy = 0; yy < Hh; yy++) {
  for (let xx = 0; xx < W; xx++) {
    const i = (yy * W + xx) * 4;
    if (f3[i + 2] > 0.5) cappedAll++;
    if (truth[i] <= -0.5) continue;
    if (f3[i] < 0) {
      miss++;
      evalsOfMisses.push(f3[i + 1]);
      if (f3[i + 2] > 0.5) cappedMiss++;
      if (examples.length < 10) {
        examples.push(`(${xx},${yy}) evals=${f3[i + 1]} capped=${f3[i + 2]} truthZ=${band4[i].toFixed(1)} truthRho=${band4[i + 1].toFixed(1)} band=[${band4[i + 2].toFixed(1)},${band4[i + 3].toFixed(1)}]`);
      }
    }
  }
}
evalsOfMisses.sort((a, b) => a - b);
const pct = (f) => (evalsOfMisses.length ? evalsOfMisses[Math.min(evalsOfMisses.length - 1, Math.floor(f * evalsOfMisses.length))] : 0);
console.log(`INTERACTIVE(224/0.6): missWhereTruthHits=${miss} of ${truthHits} (${(100 * miss / Math.max(1, truthHits)).toFixed(2)}%) cappedMisses=${cappedMiss} cappedRaysTotal=${cappedAll}`);
console.log(`  miss evals percentiles: p10=${pct(0.1)} p50=${pct(0.5)} p90=${pct(0.9)} (soft_cap=176)`);
if (examples.length) console.log('  examples:\n   ' + examples.join('\n   '));

const camAfter = await cameraSig();
const drift = Math.hypot(camAfter[0] - camBefore[0], camAfter[1] - camBefore[1], camAfter[2] - camBefore[2]);
console.log(`camera drift across census: ${drift.toFixed(4)}mm ${drift > 0.01 ? '— READBACKS INVALID (inertia), rerun' : '(stable)'}`);
await browser.close();
