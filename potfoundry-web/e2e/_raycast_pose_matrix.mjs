// SHADED-image pose-matrix scanner — the probe the previous gates lacked.
// Prior gates compared hit DISTANCES at a few hand-dragged poses; the user
// sees SHADED PIXELS across the whole angle space, and the artifact is
// angle-dependent. This scanner drives the turntable camera DIRECTLY through
// state (rotX/rotY/zoom — deterministic, no drag fragility, no inertia), and
// at every pose diffs the converged production SHADED frame against a
// converged high-budget SHADED reference (identical Halton ray set, only the
// eval caps differ). Any user-visible defect — misses, banding, shading noise
// — shows as color diffs. Reports defect% per pose + saves the worst pose.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = 'artifacts/raycast-user-repro';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1240 } });
await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });

const STYLE = process.env.PF_STYLE || 'SpiralRidges';
const STYLE_ID = Number(process.env.PF_STYLE_ID ?? 2);
await page.evaluate((key) => {
  const s = window.__POTFOUNDRY_STORE__.getState();
  s.setStyle(key);
}, STYLE);
await page.waitForFunction((sid) => window.__pfRaycast?.controller?.isReady(sid), STYLE_ID, { timeout: 180_000 });

const W = 480, Hh = 480;
async function setPose(rotX, rotY, zoom) {
  const rdz = await page.evaluate(async ({ rotX, rotY, zoom }) => {
    const cc = window.__pf_webgpu_camera_controller;
    const st = cc.state;
    st.autoRotate = false;
    st.inertiaActive = false;
    st.inertiaVx = 0; st.inertiaVy = 0;
    st.inertiaRotX = 0; st.inertiaRotY = 0;
    st.displayCamQuat = null; st.displayRotX = null; st.displayRotY = null;
    st.cameraMode = 'turntable';
    st.rotX = rotX; st.rotY = rotY; st.zoom = zoom;
    st.cameraDirty = true;
    // push the new pose into the uniform buffer NOW — passive state writes
    // are not picked up by the frame loop on their own
    cc.helpers.markInteraction?.(false);
    cc.helpers.writeUniformsImmediately?.();
    // verify the pose actually took: center-ray rd.z via debug mode 7
    const c = window.__pfRaycast.controller;
    c.setDebugMode(7);
    c.setQuality({ maxSamples: 1 });
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 30));
    const canvas = document.querySelector('canvas');
    const px = await c.readbackPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1);
    return px[2];
  }, { rotX, rotY, zoom });
  return rdz;
}
async function shaded(quality) {
  return page.evaluate(async ({ quality, W, Hh }) => {
    const cc = window.__pf_webgpu_camera_controller;
    if (cc?.state) { cc.state.autoRotate = false; }
    const c = window.__pfRaycast.controller;
    c.setDebugMode(0);
    c.setQuality(quality);
    const t0 = performance.now();
    while (c.needsFrame() && performance.now() - t0 < 180000) await new Promise((r) => setTimeout(r, 40));
    const dt = performance.now() - t0;
    const canvas = document.querySelector('canvas');
    const x0 = Math.floor(canvas.width / 2 - W / 2);
    const y0 = Math.floor(canvas.height / 2 - Hh / 2);
    const px = Array.from(await c.readbackPixels(x0, y0, W, Hh));
    return { px, ms: dt };
  }, { quality, W, Hh });
}

const SHIPPED = { stepCapInteractive: 224, stepCapAccum: 1536, featureFloorInteractive: 0.6, featureFloor: 0.25, maxSamples: 16 };
const TRUTH = { stepCapInteractive: 8192, stepCapAccum: 8192, featureFloorInteractive: 0.05, featureFloor: 0.05, maxSamples: 16 };

const ELEVS = [0.05, 0.2, 0.35, 0.55, 0.8, 1.1];
const ZOOMS = [2.0, 4.0];
let worst = { defectPct: -1 };
for (const zoom of ZOOMS) {
  for (const rotX of ELEVS) {
    const rdz = await setPose(rotX, 0.15, zoom);
    const prod = await shaded(SHIPPED);
    const ref = await shaded(TRUTH);
    let defects = 0, n = 0;
    const rowHist = new Array(12).fill(0);
    for (let i = 0; i < prod.px.length; i += 4) {
      const d = Math.max(
        Math.abs(prod.px[i] - ref.px[i]),
        Math.abs(prod.px[i + 1] - ref.px[i + 1]),
        Math.abs(prod.px[i + 2] - ref.px[i + 2])
      );
      n++;
      if (d > 0.06) {
        defects++;
        rowHist[Math.min(11, Math.floor(((i / 4) / W) / (Hh / 12)))]++;
      }
    }
    const defectPct = (100 * defects) / n;
    console.log(
      `rotX=${rotX.toFixed(2)} zoom=${zoom.toFixed(1)} rd.z=${rdz.toFixed(2)}: shadedDefect=${defectPct.toFixed(2)}% (${defects}px) | prodConvergeMs=${prod.ms.toFixed(0)} perSample=${(prod.ms / 16).toFixed(1)}ms | rowBands=[${rowHist.join(',')}]`
    );
    if (defectPct > worst.defectPct) worst = { defectPct, rotX, zoom };
  }
}
console.log(`WORST: rotX=${worst.rotX} zoom=${worst.zoom} defect=${worst.defectPct.toFixed(2)}%`);
await setPose(worst.rotX, 0.15, worst.zoom);
await page.evaluate((q) => {
  const c = window.__pfRaycast.controller;
  c.setDebugMode(0);
  c.setQuality(q);
}, SHIPPED);
await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 90_000 });
await page.screenshot({ path: `${OUT}/matrix-worst-prod.png` });
await page.evaluate((q) => {
  const c = window.__pfRaycast.controller;
  c.setQuality(q);
}, TRUTH);
await page.waitForFunction(() => window.__pfRaycast?.controller?.needsFrame() === false, null, { timeout: 180_000 });
await page.screenshot({ path: `${OUT}/matrix-worst-truth.png` });
await browser.close();
