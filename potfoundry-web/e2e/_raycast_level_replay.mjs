// Replay march decisions for a miss-dash pixel at the level view.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), 'DragonScales');
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(9), null, { timeout: 180_000 });
// level the camera (feedback loop)
async function centerRdZ() {
  return page.evaluate(async () => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(7); c.setQuality({ maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 30));
    const canvas = document.querySelector('canvas');
    return (await c.readbackPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1))[2];
  });
}
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
let rdz = await centerRdZ();
for (let i = 0; i < 12 && Math.abs(rdz) > 0.02; i++) {
  const dy = -Math.sign(rdz) * Math.max(2, Math.min(60, Math.abs(rdz) * 140));
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 3 }); await page.mouse.up();
  await page.waitForTimeout(1200);
  rdz = await centerRdZ();
}
await page.waitForTimeout(3000);
console.log('rd.z =', rdz.toFixed(4));
const W = 480, Hh = 480;
async function field(mode, q) {
  return page.evaluate(async ({ W, Hh, mode, q }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode); c.setQuality(q);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    return Array.from(await c.readbackPixels(Math.floor(canvas.width / 2 - W / 2), Math.floor(canvas.height / 2 - Hh / 2), W, Hh));
  }, { W, Hh, mode, q });
}
const acc = { stepCapInteractive: 768, stepCapAccum: 768, featureFloorInteractive: 0.25, featureFloor: 0.25, maxSamples: 1 };
const f3 = await field(3, acc);
const roF = await field(6, acc);
const rdF = await field(7, acc);
const lutF = await field(5, acc);
// find an interior miss with vertical hit neighbors (a dash)
let pick = -1;
for (let yy = 60; yy < Hh - 60 && pick < 0; yy++) {
  for (let xx = 180; xx < 300 && pick < 0; xx++) {
    const i = yy * W + xx;
    if (f3[i * 4] < 0 && f3[(yy - 2) * W + xx] >= 0 && f3[(yy + 2) * W + xx] * 1 >= 0) pick = i;
  }
}
if (pick < 0) { console.log('no dash found'); await browser.close(); process.exit(0); }
const px = pick * 4;
const ro = [roF[px], roF[px + 1], roF[px + 2]];
const rd = [rdF[px], rdF[px + 1], rdF[px + 2]];
console.log(`dash px idx=${pick} (x=${pick % W}, y=${Math.floor(pick / W)}) evals=${f3[px + 1]}`);
console.log('ro=', ro.map((v) => v.toFixed(2)).join(','), ' rd=', rd.map((v) => v.toFixed(5)).join(','));
const binMax = new Array(64).fill(null), binMin = new Array(64).fill(null);
for (let x = 0; x < 256; x++) {
  const j = x * 4;
  const idx = Math.round(lutF[j + 2]);
  if (idx >= 0 && idx < 64 && binMax[idx] === null) { binMax[idx] = lutF[j]; binMin[idx] = lutF[j + 1]; }
}
const H = 120, bottom = 3, wall = 3, PAD = 2.0, PADZ = 1.0, BINS = 64;
const rBound = Math.max(...binMax) * 1.10 + 1.0;
const bandForZ = (z) => {
  const b = Math.min(63, Math.max(0, Math.floor(Math.min(0.999, Math.max(0, z / H)) * BINS)));
  const b0 = Math.max(0, b - 1), b1 = Math.min(63, b + 1);
  return [Math.max(Math.min(binMin[b], binMin[b0], binMin[b1]) - wall - PAD, 0), Math.max(binMax[b], binMax[b0], binMax[b1]) + PAD];
};
const P = (t) => [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
const rho = (t) => Math.hypot(P(t)[0], P(t)[1]);
const zAt = (t) => P(t)[2] + 0.5 * H;
let t0c = 0, t1c = 1e9;
if (Math.abs(rd[2]) > 1e-9) {
  const ta = (-0.5 * H - ro[2]) / rd[2], tb = (0.5 * H - ro[2]) / rd[2];
  t0c = Math.max(t0c, Math.min(ta, tb)); t1c = Math.min(t1c, Math.max(ta, tb));
}
const a = rd[0] ** 2 + rd[1] ** 2, b2 = ro[0] * rd[0] + ro[1] * rd[1], c0 = ro[0] ** 2 + ro[1] ** 2;
{
  const disc = b2 * b2 - a * (c0 - rBound * rBound);
  if (disc >= 0) { const s = Math.sqrt(disc); t0c = Math.max(t0c, (-b2 - s) / a); t1c = Math.min(t1c, (-b2 + s) / a); }
}
console.log(`seg=[${t0c.toFixed(2)}, ${t1c.toFixed(2)}] rhoMin=${Math.sqrt(Math.max(0, c0 - b2 * b2 / a)).toFixed(2)} z~${zAt(t0c).toFixed(2)}`);
const dt = 0.232421875;
let t = Math.min(t0c, t1c), steps = 0;
while (t < t1c && steps < 900) {
  const z = zAt(t), r = rho(t), band = bandForZ(z);
  let branch, tn;
  const inZ = (z < bottom + PADZ) || (Math.abs(z - H) < PADZ);
  if (r >= band[0] && r <= band[1]) { branch = 'FINE'; tn = t + dt; }
  else if (inZ && r <= band[1]) { branch = 'ZWIN'; tn = t + dt / Math.min(1, Math.max(0.08, Math.abs(rd[2]))); }
  else {
    branch = 'SKIP';
    let tb = t1c;
    if (Math.abs(rd[2]) > 1e-9) {
      const binH = H / BINS;
      let zt = Math.floor(z / binH) * binH;
      if (rd[2] > 0) zt += binH;
      let tbin = t + (zt - z) / rd[2];
      if (tbin <= t + 1e-5) tbin += binH / Math.abs(rd[2]);
      tb = Math.min(tb, tbin);
      const tf = t + ((bottom + PADZ) - z) / rd[2];
      if (tf > t) tb = Math.min(tb, tf);
      const tr = t + ((H - PADZ) - z) / rd[2];
      if (tr > t) tb = Math.min(tb, tr);
    }
    const r2 = r * r;
    if (r2 > band[1] * band[1]) {
      const disc = b2 * b2 - a * (c0 - band[1] * band[1]);
      if (disc >= 0) { const ti = (-b2 - Math.sqrt(disc)) / a; if (ti > t) tb = Math.min(tb, ti); }
    } else if (r2 < band[0] * band[0]) {
      const disc = b2 * b2 - a * (c0 - band[0] * band[0]);
      if (disc >= 0) { const to = (-b2 + Math.sqrt(disc)) / a; if (to > t) tb = Math.min(tb, to); }
    }
    tn = Math.max(tb, t + dt);
  }
  tn = Math.min(tn, t1c);
  if (branch !== 'FINE' || steps < 12 || Math.abs(tn - t) > dt * 1.5) {
    console.log(`t=${t.toFixed(2)} z=${z.toFixed(3)} rho=${r.toFixed(2)} band=[${band[0].toFixed(1)},${band[1].toFixed(1)}] ${branch} -> ${tn.toFixed(2)}`);
  }
  t = tn; steps++;
}
console.log(`replay steps=${steps} end t=${t.toFixed(2)}`);
await browser.close();
