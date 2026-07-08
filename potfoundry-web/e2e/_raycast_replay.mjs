// JS replay of the banded march for a hole pixel: fetch the LUT + ray, then
// re-execute the march's BRANCH DECISIONS geometrically and print every step
// near the known true hit (t ~= 282.8) to see which branch jumps past it.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
await page.evaluate((k) => window.__POTFOUNDRY_STORE__.getState().setStyle(k), 'SuperformulaBlossom');
await page.waitForFunction(() => window.__pfRaycast?.controller?.isReady(0), null, { timeout: 180_000 });
const W = 560, Hh = 560;
async function field(mode) {
  return page.evaluate(async ({ W, Hh, mode }) => {
    const c = window.__pfRaycast.controller;
    c.setDebugMode(mode);
    c.setQuality({ stepCapInteractive: 768, stepCapAccum: 768, featureFloorInteractive: 0.25, featureFloor: 0.25, maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
    const canvas = document.querySelector('canvas');
    const x = Math.floor(canvas.width / 2 - W / 2);
    const y = Math.floor(canvas.height / 2 - Hh / 2);
    return Array.from(await c.readbackPixels(x, y, W, Hh));
  }, { W, Hh, mode });
}
const lutF = await field(5);
const roF = await field(6);
const rdF = await field(7);
const px = (225 + 45 * W) * 4; // hole pixel (225,45)
const ro = [roF[px], roF[px + 1], roF[px + 2]];
const rd = [rdF[px], rdF[px + 1], rdF[px + 2]];
const binMax = [], binMin = [];
for (let i = 0; i < 64; i++) {
  // column i of the region maps: region x where (canvasX & 63) == i — region x=i works if origin aligned; just scan row 0 for f[2]==i
  binMax[i] = null;
}
for (let x = 0; x < 256; x++) {
  const j = (x + 0 * W) * 4;
  const idx = Math.round(lutF[j + 2]);
  if (idx >= 0 && idx < 64 && binMax[idx] === null) { binMax[idx] = lutF[j]; binMin[idx] = lutF[j + 1]; }
}
console.log('ro=', ro.map(v=>v.toFixed(2)).join(','), ' rd=', rd.map(v=>v.toFixed(4)).join(','));
console.log('binMax[40..63]=', binMax.slice(40).map(v=>v?.toFixed(1)).join(' '));
console.log('binMin[40..63]=', binMin.slice(40).map(v=>v?.toFixed(1)).join(' '));

// ---- march replay (geometry only; field assumed >=0 until the true hit) ----
const H = 120, bottom = 3, wall = 3, PAD = 2.0, PADZ = 1.0, BINS = 64, drainHi = 10 + PAD;
const RMAXG = Math.max(...binMax) ;
const rBound = RMAXG * 1.10 + 1.0;
function bandForZ(z) {
  let b = Math.min(63, Math.max(0, Math.floor(Math.min(0.999, Math.max(0, z / H)) * BINS)));
  const b0 = Math.max(0, b - 1), b1 = Math.min(63, b + 1);
  const hi = Math.max(binMax[b], binMax[b0], binMax[b1]);
  const lo = Math.min(binMin[b], binMin[b0], binMin[b1]);
  return [Math.max(lo - wall - PAD, 0), hi + PAD];
}
const p = (t) => [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
const rho = (t) => { const q = p(t); return Math.hypot(q[0], q[1]); };
const zAt = (t) => p(t)[2] + 0.5 * H;
// clip
let t0c = 0, t1c = 1e9;
if (Math.abs(rd[2]) > 1e-9) {
  const ta = (-0.5 * H - ro[2]) / rd[2], tb = (0.5 * H - ro[2]) / rd[2];
  t0c = Math.max(t0c, Math.min(ta, tb)); t1c = Math.min(t1c, Math.max(ta, tb));
}
const a = rd[0] * rd[0] + rd[1] * rd[1];
const b2 = ro[0] * rd[0] + ro[1] * rd[1];
const c0 = ro[0] * ro[0] + ro[1] * ro[1];
{
  const disc = b2 * b2 - a * (c0 - rBound * rBound);
  if (disc >= 0) { const s = Math.sqrt(disc); t0c = Math.max(t0c, (-b2 - s) / a); t1c = Math.min(t1c, (-b2 + s) / a); }
}
console.log(`seg=[${t0c.toFixed(2)}, ${t1c.toFixed(2)}] rBound=${rBound.toFixed(1)}`);
const dt = 0.232421875; // fp-dominated fine step observed
let t = Math.min(t0c, t1c), evals = 1, steps = [];
while (t < t1c && evals < 768 && steps.length < 400) {
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
      const tbin = t + (zt - z) / rd[2];
      if (tbin > t) tb = Math.min(tb, tbin);
      const tf = t + ((bottom + PADZ) - z) / rd[2];
      if (tf > t) tb = Math.min(tb, tf);
      const tr = t + ((H - PADZ) - z) / rd[2];
      if (tr > t) tb = Math.min(tb, tr);
    }
    if (a > 1e-12) {
      const r2 = r * r;
      if (r2 > band[1] * band[1]) {
        const disc = b2 * b2 - a * (c0 - band[1] * band[1]);
        if (disc >= 0) { const ti = (-b2 - Math.sqrt(disc)) / a; if (ti > t) tb = Math.min(tb, ti); }
      } else if (r2 < band[0] * band[0]) {
        const disc = b2 * b2 - a * (c0 - band[0] * band[0]);
        if (disc >= 0) { const to = (-b2 + Math.sqrt(disc)) / a; if (to > t) tb = Math.min(tb, to); }
      }
    }
    tn = Math.max(tb, t + dt);
  }
  tn = Math.min(tn, t1c);
  steps.push({ t, z, r, branch, tn, band });
  t = tn; evals++;
}
console.log(`replay: ${steps.length} steps, ended t=${t.toFixed(2)} evals=${evals}`);
for (const s of steps) {
  if (s.branch === 'SKIP' || (s.t > 275 && s.t < 292)) {
    console.log(`t=${s.t.toFixed(2)} z=${s.z.toFixed(2)} rho=${s.r.toFixed(2)} band=[${s.band[0].toFixed(1)},${s.band[1].toFixed(1)}] ${s.branch} -> ${s.tn.toFixed(2)}`);
  }
}
await browser.close();
