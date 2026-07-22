// High-res verification: with the flag on, crank quality to 'ultra' (preview_n_theta=2048,
// ~10M+ verts, past the old 65535-workgroup / 4.19M-vertex clamp) and confirm the pot
// still renders fully (not cut). Prereq: dev server on 3057.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const artDir = fileURLToPath(new URL('./.artifacts/', import.meta.url));
mkdirSync(artDir, { recursive: true });
const APP = 'http://localhost:3057/?renderer=webgpu';

const brightnessOf = async (page, tag) => {
  const canvas = await page.$('canvas');
  const b64 = (await canvas.screenshot({ path: `${artDir}highres_${tag}.png` })).toString('base64');
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
  await page.addInitScript(() => { try { localStorage.setItem('pf-preferred-renderer', 'webgpu'); localStorage.setItem('pf-preview-eval', '1'); } catch { /* ignore */ } });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });

  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const s = await page.evaluate(() => (window.__pfInstant ?? null));
    if (s && (s.ready || s.error)) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  await wake(page);
  await page.waitForTimeout(1000);
  const defQ = await page.evaluate(() => window.__POTFOUNDRY_STORE__.getState().mesh);
  const defBright = await brightnessOf(page, 'default');

  // crank to ultra
  await page.evaluate(() => window.__POTFOUNDRY_STORE__.getState().setQualityPreset('ultra'));
  await page.waitForTimeout(6000); // resize + big CPU index build + eval dispatch
  await wake(page);
  await page.waitForTimeout(3000);
  const ultraQ = await page.evaluate(() => window.__POTFOUNDRY_STORE__.getState().mesh);
  const ultraBright = await brightnessOf(page, 'ultra');
  const state = await page.evaluate(() => (window.__pfInstant ?? null));

  console.log('\n=== HIGH-RES VERIFICATION ===');
  console.log('default mesh:', JSON.stringify({ n_theta: defQ.preview_n_theta, n_z: defQ.preview_n_z }), 'brightness', defBright);
  console.log('ultra   mesh:', JSON.stringify({ n_theta: ultraQ.preview_n_theta, n_z: ultraQ.preview_n_z }), 'brightness', ultraBright);
  console.log('instant state:', JSON.stringify(state));
  const pass = defBright > 20 && ultraBright > 20 && Math.abs(defBright - ultraBright) < 20;
  console.log(pass ? 'PASS: ultra-res pot renders (brightness comparable to default — not cut)' : 'REVIEW: ultra render brightness diverged (possible cut)');
  console.log('=============================\n');
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
