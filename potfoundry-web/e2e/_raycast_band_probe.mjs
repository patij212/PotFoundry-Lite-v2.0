// Self-consistent band-exclusion probe: find real converged-hole pixels for
// SuperformulaBlossom in THIS page session, then immediately probe those exact
// coordinates with debug mode 3 (march forensics) and mode 4 (independent
// no-skip truth + the production band_for_z bounds) at both quality tiers —
// avoids any cross-script/cross-run coordinate drift.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const W = 560, Hh = 560;
async function readField(mode, quality) {
  return page.evaluate(async ({ mode, quality, W, Hh }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality({ ...quality, maxSamples: quality.maxSamples ?? 1 });
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
      while (c.needsFrame() && performance.now() - t1 < 60000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x0, y0, W, Hh));
      if (sum(cur) === sum(prev)) return { field: cur, x0, y0 };
      prev = cur;
    }
    return { field: prev, x0, y0 };
  }, { mode, quality, W, Hh });
}

async function readAt(mode, quality, x0, y0, spots) {
  return page.evaluate(async ({ mode, quality, x0, y0, spots }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality({ ...quality, maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
    const out = [];
    for (const [sx, sy] of spots) {
      const px = await c.readbackPixels(x0 + sx, y0 + sy, 1, 1);
      out.push(Array.from(px.slice(0, 4)));
    }
    return out;
  }, { mode, quality, x0, y0, spots });
}

await page.evaluate(() => window.__POTFOUNDRY_STORE__.getState().setStyle('SuperformulaBlossom'));
await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), 0, { timeout: 180_000 });

// truth = dense march, no accumulation
const { field: truth, x0, y0 } = await readField(1, { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05 });
// shipped 16-sample converged accumulation
const { field: conv } = await readField(1, { stepCapInteractive: 224, stepCapAccum: 768, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 });

const spots = [];
for (let yy = 1; yy < Hh - 1 && spots.length < 8; yy++) {
  for (let xx = 1; xx < W - 1 && spots.length < 8; xx++) {
    const i = yy * W + xx;
    if (truth[i * 4] <= -0.5) continue;
    if (conv[i * 4] <= -0.9999) {
      // require an interior hole: majority of 8 neighbours in TRUTH also hit
      // (skip pixels sitting right on the silhouette edge)
      let truthNeighbors = 0;
      for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
        if (truth[((yy+dy)*W+(xx+dx))*4] > -0.5) truthNeighbors++;
      }
      if (truthNeighbors >= 7) spots.push([xx, yy]);
    }
  }
}
console.log(`Found ${spots.length} interior converged-hole spots (of up to 8 requested):`, spots);

if (spots.length) {
  const tiers = [
    ['interactive(0.6/224)', { stepCapInteractive: 224, stepCapAccum: 224, featureFloorInteractive: 0.6, featureFloor: 0.6 }],
    ['accum(0.25/768)', { stepCapInteractive: 768, stepCapAccum: 768, featureFloorInteractive: 0.25, featureFloor: 0.25 }],
  ];
  for (const [label, quality] of tiers) {
    const forensics = await readAt(3, quality, x0, y0, spots);
    const band = await readAt(4, quality, x0, y0, spots);
    console.log(`--- ${label} ---`);
    spots.forEach((s, i) => {
      const [t, evals, capped] = forensics[i];
      const [zD, rhoD, bx, by] = band[i];
      const inBand = rhoD >= bx && rhoD <= by;
      console.log(
        `(${s[0]},${s[1]}) prodHit=${t >= 0 ? t.toFixed(2) : 'MISS'} evals=${evals} capped=${capped} ` +
        `| truthZ=${zD.toFixed(2)} truthRho=${rhoD.toFixed(3)} band=[${bx.toFixed(3)},${by.toFixed(3)}] inBand=${inBand}`
      );
    });
  }
}
await browser.close();
