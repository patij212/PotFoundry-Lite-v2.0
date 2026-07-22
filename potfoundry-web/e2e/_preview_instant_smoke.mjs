// In-app smoke for the instant-switch preview. Reads window.__pfInstant (the app's
// ConsolePatch swallows console.*). PF_FLAG=off runs the per-style baseline.
//   Prereq: dev server on 3057. Then: node e2e/_preview_instant_smoke.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const artDir = fileURLToPath(new URL('./.artifacts/', import.meta.url));
mkdirSync(artDir, { recursive: true });
const APP = 'http://localhost:3057/?renderer=webgpu';
const flagOn = process.env.PF_FLAG !== 'off';
const tag = flagOn ? 'on' : 'off';

const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
try {
  const page = await browser.newPage();
  await page.addInitScript((on) => {
    try {
      localStorage.setItem('pf-preferred-renderer', 'webgpu');
      if (on) localStorage.setItem('pf-preview-eval', '1');
      else localStorage.removeItem('pf-preview-eval');
    } catch { /* ignore */ }
  }, flagOn);
  await page.goto(APP, { waitUntil: 'domcontentloaded' });

  // Poll window state + status-bar vert count until settled.
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < 50000) {
    state = await page.evaluate(() => (window.__pfInstant ?? null));
    if (state && (state.ready || state.error)) break;
    if (!flagOn && Date.now() - t0 > 25000) break; // baseline: no instant path
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3500);
  state = await page.evaluate(() => (window.__pfInstant ?? null));

  const canvas = await page.$('canvas');
  if (canvas) await canvas.screenshot({ path: `${artDir}render_${tag}.png` });

  // Read the on-screen vert/tri counter text if present.
  const counter = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => /verts?/i.test(e.textContent || '') && (e.textContent || '').length < 40);
    return el ? el.textContent.trim() : '(counter not found)';
  });

  console.log(`\n=== INSTANT SMOKE (flag ${tag}) ===`);
  console.log('elapsed:', Math.round((Date.now() - t0) / 1000) + 's');
  console.log('window.__pfInstant:', JSON.stringify(state));
  console.log('status counter:', counter);
  console.log('screenshot:', `${artDir}render_${tag}.png`);
  console.log('==============================\n');
} finally {
  await browser.close();
}
