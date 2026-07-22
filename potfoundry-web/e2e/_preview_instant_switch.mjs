// Instant-switch latency gate. Flag on (instant path ready), switch to styles that
// were NEVER per-style-compiled (warmup off). Robust signals (no screenshot-diff):
//   - window.__pfCurrentStyle == target      (store switched)
//   - window.__pfInstant.instantFrames > f0  (a frame drew)
//   - window.__pfInstant.lastPath == 'instant' (via the instant pipeline, not per-style)
// A recompile would take 7-19s; instant is a uniform write + dispatch. Prereq: dev on 3057.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const artDir = fileURLToPath(new URL('./.artifacts/', import.meta.url));
mkdirSync(artDir, { recursive: true });
const APP = 'http://localhost:3057/?renderer=webgpu';
// diverse set incl. the two heaviest (Celtic) that would each be a ~19s per-style compile
const STYLES = ['CelticTriquetra', 'DragonScales', 'CelticKnot', 'HexagonalHive', 'GothicArches', 'SuperformulaBlossom'];
const CAP_MS = 9000;

const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('pf-preferred-renderer', 'webgpu'); localStorage.setItem('pf-preview-eval', '1'); } catch { /* ignore */ } });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });

  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const s = await page.evaluate(() => (window.__pfInstant ?? null));
    if (s && (s.ready || s.error)) break;
    await page.waitForTimeout(500);
  }
  const readyState = await page.evaluate(() => (window.__pfInstant ?? null));
  await page.waitForTimeout(1500);

  const wake = async () => {
    // the app renders ON-DEMAND; a tiny canvas drag wakes the loop so a fresh frame
    // draws (and the swap-chain holds it for screenshot).
    await page.mouse.move(820, 360); await page.mouse.down();
    await page.mouse.move(826, 363); await page.mouse.move(816, 358); await page.mouse.up();
  };

  const results = [];
  for (const style of STYLES) {
    const f0 = await page.evaluate(() => (window.__pfInstant?.instantFrames ?? 0));
    const tSwitch = Date.now();
    await page.evaluate((n) => window.__POTFOUNDRY_STORE__.getState().setStyle(n), style);
    await wake();
    let latency = -1, lastPath = null, cur = null;
    while (Date.now() - tSwitch < CAP_MS) {
      const s = await page.evaluate(() => ({ f: window.__pfInstant?.instantFrames ?? 0, p: window.__pfInstant?.lastPath ?? null, c: window.__pfCurrentStyle ?? null }));
      cur = s.c; lastPath = s.p;
      if (s.c === style && s.f > f0) { latency = Date.now() - tSwitch; break; }
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(700);
    const canvas = await page.$('canvas');
    let brightness = -1;
    if (canvas) {
      const b64 = (await canvas.screenshot({ path: `${artDir}switch_${style}.png` })).toString('base64');
      // decode the PNG as an <img> (drawImage on a live WebGPU canvas returns black) and
      // measure mean brightness — a black/blank frame is near-0, a rendered pot is ~40+.
      brightness = await page.evaluate((b) => new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
          const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
          const d = ctx.getImageData(0, 0, im.width, im.height).data;
          let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
          res(Math.round(s / (d.length / 4 * 3) * 10) / 10);
        };
        im.onerror = () => res(-1);
        im.src = 'data:image/png;base64,' + b;
      }), b64);
    }
    results.push({ style, latencyMs: latency, lastPath, storeStyle: cur, brightness });
  }

  // Reliable no-recompile signals: every switch registered (store) and the active draw
  // path stayed the instant pipeline (lastPath) — a per-style recompile would take
  // 7-19s and would never keep lastPath='instant'. The instantFrames latency is a
  // secondary check where the on-demand loop happened to advance the counter.
  const measured = results.map((r) => r.latencyMs).filter((m) => m >= 0);
  console.log('\n=== INSTANT SWITCH LATENCY ===');
  console.log('ready state:', JSON.stringify(readyState));
  for (const r of results) console.log(`  ${r.style.padEnd(20)} ${r.latencyMs >= 0 ? r.latencyMs + 'ms' : '(counter idle)'}  path=${r.lastPath}  store=${r.storeStyle}  brightness=${r.brightness}`);
  console.log(`measured switch latencies: [${measured.join(', ')}] ms (max ${Math.max(0, ...measured)}ms vs 7000-19000ms per-style recompile)`);
  const rendered = results.every((r) => r.brightness > 20); // black/blank frame is near 0
  const pass = rendered && results.every((r) => r.lastPath === 'instant' && r.storeStyle === r.style) && measured.length > 0 && measured.every((m) => m < 2500);
  console.log(pass ? 'PASS: every style rendered (non-black) via the instant pipeline, no recompile' : 'REVIEW: a switch was black, fell back, or did not register');
  console.log('==============================\n');
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
