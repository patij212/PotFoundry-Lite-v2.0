// Fidelity gate: flag-off (per-style surface_normal) vs flag-on (instant eval path)
// must render the pot the same. Captures via Playwright canvas.screenshot() (reliable
// for WebGPU), then diffs by loading the PNGs as <img> in a blank page (getImageData
// works on decoded PNGs, unlike drawImage on a live WebGPU canvas).
// Prereq: dev server on 3057.  node e2e/_preview_instant_fidelity.mjs
import { chromium } from 'playwright';

const APP = 'http://localhost:3057/?renderer=webgpu';
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('pf-preferred-renderer', 'webgpu'); } catch { /* ignore */ } });

  // 1) flag OFF (per-style baseline)
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(22000);
  const offPng = (await (await page.$('canvas')).screenshot()).toString('base64');

  // 2) flag ON (instant path)
  await page.evaluate(() => { try { localStorage.setItem('pf-preview-eval', '1'); } catch { /* ignore */ } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  while (Date.now() - t0 < 50000) {
    const s = await page.evaluate(() => (window.__pfInstant ?? null));
    if (s && (s.ready || s.error)) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => (window.__pfInstant ?? null));
  const onPng = (await (await page.$('canvas')).screenshot()).toString('base64');

  // 3) diff the two decoded PNGs
  const diff = await page.evaluate(async ({ a64, b64 }) => {
    const load = (b) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/png;base64,' + b; });
    const [a, b] = await Promise.all([load(a64), load(b64)]);
    const cv = document.createElement('canvas'); cv.width = a.width; cv.height = a.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(a, 0, 0); const da = ctx.getImageData(0, 0, a.width, a.height).data;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(b, 0, 0); const db = ctx.getImageData(0, 0, b.width, b.height).data;
    let maxCh = 0, sum = 0, nDiff = 0; const nPix = da.length / 4;
    let brightA = 0;
    for (let i = 0; i < da.length; i += 4) {
      brightA += da[i] + da[i + 1] + da[i + 2];
      for (let k = 0; k < 3; k++) { const d = Math.abs(da[i + k] - db[i + k]); if (d > maxCh) maxCh = d; sum += d; }
      if (Math.abs(da[i] - db[i]) > 12 || Math.abs(da[i + 1] - db[i + 1]) > 12 || Math.abs(da[i + 2] - db[i + 2]) > 12) nDiff++;
    }
    return { w: a.width, h: a.height, maxCh, meanCh: sum / (nPix * 3), pctDiff: 100 * nDiff / nPix, brightA: brightA / (nPix * 3) };
  }, { a64: offPng, b64: onPng });

  console.log('\n=== INSTANT FIDELITY (off vs on) ===');
  console.log('instant state:', JSON.stringify(state));
  console.log(`image ${diff.w}x${diff.h}, baseline brightness ${diff.brightA.toFixed(1)} (>10 = real render)`);
  console.log(`max channel diff:  ${diff.maxCh}/255`);
  console.log(`mean channel diff: ${diff.meanCh.toFixed(3)}/255`);
  console.log(`pixels differing >12/255: ${diff.pctDiff.toFixed(2)}%`);
  const pass = state?.ready && diff.brightA > 10 && diff.maxCh <= 40 && diff.pctDiff <= 2.0;
  console.log(pass ? 'PASS: instant render matches per-style baseline' : 'REVIEW: diff above threshold');
  console.log('====================================\n');
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
