// Interior-hole hunter: debug-mode-3 full-field readback; a HOLE is a miss
// pixel with >=6 of 8 neighbours hitting. Classifies holes by the march's
// capped/coarse flag to separate eval-budget exhaustion from band exclusion.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const W = 560, Hh = 560;
async function field(floorI, floorA, capI, capA) {
  return page.evaluate(async ({ W, Hh, floorI, floorA, capI, capA }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(3);
    c.setQuality({ stepCapInteractive: capI, stepCapAccum: capA, featureFloorInteractive: floorI, featureFloor: floorA, maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x = Math.floor(canvas.width / 2 - W / 2);
    const y = Math.floor(canvas.height / 2 - Hh / 2);
    // Stability: heavy GPU passes can leave a flaky first frame; require two
    // consecutive reads with matching hit-count checksums (spec A3 pattern).
    const sum = (arr) => { let n = 0; for (let i = 0; i < arr.length; i += 4) if (arr[i] >= 0) n++; return n; };
    let prev = Array.from(await c.readbackPixels(x, y, W, Hh));
    for (let r = 0; r < 6; r++) {
      c.setQuality({});
      const t1 = performance.now();
      while (c.needsFrame() && performance.now() - t1 < 60000) await new Promise((rs) => setTimeout(rs, 50));
      const cur = Array.from(await c.readbackPixels(x, y, W, Hh));
      if (sum(cur) === sum(prev)) return cur;
      prev = cur;
    }
    return prev;
  }, { W, Hh, floorI, floorA, capI, capA });
}

// truth = debug-4 field (no-skip dense march): a production miss is only a
// REAL hole if the truth march HITS there — openwork styles (Gothic, Gyroid)
// legitimately see through lattice openings.
function analyze(px, truth, label) {
  const hit = (i) => px[i * 4] >= 0;
  const truthHits = (i) => truth[i * 4] > -0.5;
  let holes = 0, seeThrough = 0, cappedHits = 0, hits = 0, maxEvals = 0;
  const holeSpots = [];
  for (let yy = 1; yy < Hh - 1; yy++) {
    for (let xx = 1; xx < W - 1; xx++) {
      const i = yy * W + xx;
      maxEvals = Math.max(maxEvals, px[i * 4 + 1]);
      if (hit(i)) { hits++; if (px[i * 4 + 2] > 0.5) cappedHits++; continue; }
      let n = 0;
      for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
        if (hit((yy + dy) * W + (xx + dx))) n++;
      }
      if (n >= 6) {
        if (!truthHits(i)) { seeThrough++; continue; }
        holes++;
        if (holeSpots.length < 6) holeSpots.push(`(${xx},${yy}) evals=${px[i*4+1]} truthZ=${truth[i*4].toFixed(1)} truthRho=${truth[i*4+1].toFixed(1)}`);
      }
    }
  }
  console.log(`${label}: hits=${hits} REAL holes=${holes} legitSeeThrough=${seeThrough} coarseFinishedHits=${cappedHits} maxEvals=${maxEvals}`);
  if (holeSpots.length) console.log('  examples:', holeSpots.join('  '));
}

for (const [id, key] of [[0, 'SuperformulaBlossom'], [9, 'DragonScales'], [5, 'GothicArches'], [12, 'GyroidManifold']]) {
  await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), key);
  await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), id, { timeout: 180_000 });
  const truth = await (async () => {
    return page.evaluate(async ({ W, Hh }) => {
      const c = window.__pfRaycast.controller;
      c.setDebugMode(1);
      c.setQuality({ stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 1 });
      const t0 = performance.now();
      while (c.needsFrame() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
      const canvas = document.querySelector('canvas');
      const x = Math.floor(canvas.width / 2 - W / 2);
      const y = Math.floor(canvas.height / 2 - Hh / 2);
      return Array.from(await c.readbackPixels(x, y, W, Hh));
    }, { W, Hh });
  })();
  analyze(await field(0.6, 0.6, 224, 224), truth, `style ${id} interactive(0.6/224)`);
  analyze(await field(0.25, 0.25, 768, 768), truth, `style ${id} accum(0.25/768)`);
}
await browser.close();
