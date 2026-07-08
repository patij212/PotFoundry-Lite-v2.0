// PHASE-1/4 DIAGNOSIS + FIX VERIFICATION: raycast preview quality.
// Post-fix (banded march): step caps bound FIELD EVALS; sampling density is
// set by the feature floor, applied only inside the surface band. This probe
// compares shipped-quality hit fields against a dense reference and captures
// screenshots. PRE-FIX BASELINE (uniform march, 2026-07-08): DragonScales
// wrongSurface(>2mm) = 32.45% at shipped accum settings; interacting frame
// showed moiré striping.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'e2e/artifacts/raycast-quality-diag';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('console', (m) => { const t = m.text(); if (/SHADER ERROR|error/i.test(t) && t.includes('[WebGPU]')) console.log('PAGE:', t); });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

async function selectStyle(key) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), key);
}
async function waitReady(id) {
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 60_000 });
}
async function converge() {
  await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
}

async function readHitField(cap, floor, region = 360) {
  return page.evaluate(async ({ cap, floor, region }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(1);
    c.setQuality({ stepCapInteractive: cap, stepCapAccum: cap, featureFloor: floor, featureFloorInteractive: floor, maxSamples: 1 });
    // Deterministic wait: the idle-throttled loop may take >300ms to run the
    // dirty frame; needsFrame() goes false only after the new sample landed.
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 30000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (c.needsFrame()) throw new Error('probe: dirty frame never landed');
    const canvas = document.querySelector('canvas');
    const x = Math.floor(canvas.width / 2 - region / 2);
    const y = Math.floor(canvas.height / 2 - region / 2);
    const px = await c.readbackPixels(x, y, region, region);
    const t = [];
    for (let i = 0; i < px.length; i += 4) t.push(px[i]);
    return t;
  }, { cap, floor, region });
}

function compare(a, b, label) {
  let mutual = 0, flips = 0, blendables = 0, misses_a = 0;
  const deltas = [];
  for (let i = 0; i < a.length; i++) {
    const ha = a[i] >= 0, hb = b[i] >= 0;
    if (a[i] < 0) misses_a++;
    if (ha !== hb) { flips++; continue; }
    if (ha && hb) {
      mutual++;
      const d = Math.abs(a[i] - b[i]);
      deltas.push(d);
      if (d > 2.0) blendables++;
    }
  }
  deltas.sort((x, y) => x - y);
  const pct = (q) => deltas.length ? deltas[Math.min(deltas.length - 1, Math.floor(q * deltas.length))] : 0;
  const n = a.length;
  console.log(`${label}: missRate=${(misses_a / n * 100).toFixed(1)}% ` +
    `hitMissFlips=${(flips / n * 100).toFixed(2)}% wrongSurface(>2mm)=${(blendables / n * 100).toFixed(2)}% ` +
    `p50=${pct(0.5).toFixed(3)} p95=${pct(0.95).toFixed(3)} p99=${pct(0.99).toFixed(3)} max=${(deltas.at(-1) ?? 0).toFixed(2)}mm`);
}

for (const [id, key] of [[0, 'SuperformulaBlossom'], [9, 'DragonScales'], [5, 'GothicArches']]) {
  await selectStyle(key); await waitReady(id);
  await page.evaluate(() => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloor: 0.25, featureFloorInteractive: 0.6, maxSamples: 16 });
  });
  await converge();
  // MEASURE FIRST, with a stationary camera: a preceding drag leaves decaying
  // camera INERTIA that shifts the view between readbacks and fabricates huge
  // phantom "wrong surface" rates (the 2026-07-08 32%/89% readings were this).
  const ref = await readHitField(8192, 0.1);
  const accum = await readHitField(768, 0.25);
  const inter = await readHitField(224, 0.6);
  compare(accum, ref, `style ${id} shippedAccum(768/0.25)-vs-ref(8192/0.1)`);
  compare(inter, ref, `style ${id} shippedInteractive(224/0.6)-vs-ref`);
  await page.evaluate(() => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloor: 0.25, featureFloorInteractive: 0.6, maxSamples: 16 });
  });
  await converge();
  await page.screenshot({ path: `${OUT}/style-${id}-converged-fixed.png` });
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
  await page.screenshot({ path: `${OUT}/style-${id}-interacting-fixed.png` });
  await page.mouse.up();
  await page.waitForTimeout(2500); // let inertia fully decay before the next style
  await page.evaluate(() => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality({ stepCapInteractive: 224, stepCapAccum: 768, featureFloor: 0.25, featureFloorInteractive: 0.6, maxSamples: 16 });
  });
}
await browser.close();
console.log(`screenshots in ${OUT}`);
