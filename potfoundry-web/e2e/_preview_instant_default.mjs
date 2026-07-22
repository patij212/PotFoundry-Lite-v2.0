// Verifies the default flip: with NO flag set, the instant path engages by default
// (desktop mesh preview) and renders; with pf-preview-eval='0' it opts out to the
// per-style path and still renders. Prereq: dev server on 3057.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const artDir = fileURLToPath(new URL('./.artifacts/', import.meta.url));
mkdirSync(artDir, { recursive: true });
const APP = 'http://localhost:3057/?renderer=webgpu';

const brightnessOf = async (page, tag) => {
  const canvas = await page.$('canvas');
  if (!canvas) return -1;
  const b64 = (await canvas.screenshot({ path: `${artDir}default_${tag}.png` })).toString('base64');
  return page.evaluate((b) => new Promise((res) => {
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
};
const wake = async (page) => { await page.mouse.move(820, 360); await page.mouse.down(); await page.mouse.move(828, 364); await page.mouse.move(814, 356); await page.mouse.up(); };

const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
try {
  const page = await browser.newPage();
  // renderer only — do NOT touch the flag (it must survive the phase-2 reload)
  await page.addInitScript(() => { try { localStorage.setItem('pf-preferred-renderer', 'webgpu'); } catch { /* ignore */ } });

  // Phase 1: NO flag => default ON
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  let t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const s = await page.evaluate(() => (window.__pfInstant ?? null));
    if (s && (s.ready || s.error)) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500); await wake(page); await page.waitForTimeout(1500);
  const defState = await page.evaluate(() => (window.__pfInstant ?? null));
  const defBright = await brightnessOf(page, 'on');

  // Phase 2: flag='0' => opt out to per-style
  await page.evaluate(() => { try { localStorage.setItem('pf-preview-eval', '0'); } catch { /* ignore */ } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(22000); // per-style initial compile + warmup
  await wake(page); await page.waitForTimeout(1500);
  const offState = await page.evaluate(() => (window.__pfInstant ?? null));
  const offBright = await brightnessOf(page, 'off');

  console.log('\n=== DEFAULT-FLIP VERIFICATION ===');
  console.log('phase 1 (no flag):  __pfInstant=', JSON.stringify(defState), ' brightness=', defBright);
  console.log('phase 2 (flag=0):   __pfInstant=', JSON.stringify(offState), ' brightness=', offBright);
  const pass = defState && defState.ready === true && defBright > 20 && offState === null && offBright > 20;
  console.log(pass ? 'PASS: default ON (instant engaged) + opt-out works (per-style renders)' : 'REVIEW: default or opt-out behaviour wrong');
  console.log('=================================\n');
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
