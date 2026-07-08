// Probe: the Preview-engine setting must disable the ray-cast option (with a
// "requires WebGPU" note) on a WebGL session, and keep it enabled on WebGPU.
// Exercises the REAL wiring (ControllerProvider around the v1/v2 header) that
// the mocked component tests cannot. Run from potfoundry-web/ with dev server up.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: false, // headless Chromium exposes no WebGPU adapter on Windows
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});

async function checkModal(url, themeNote) {
  const page = await browser.newPage();
  // Force classic theme so the v1/v2 header path (the wiring under test) renders.
  await page.addInitScript(() => {
    const raw = localStorage.getItem('potfoundry-store');
    const state = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    state.state = { ...state.state, ui: { ...(state.state.ui || {}), uiTheme: 'classic' } };
    localStorage.setItem('potfoundry-store', JSON.stringify(state));
  });
  await page.goto(url);
  // Wait for the renderer to mount (canvas ready) so rendererType is live.
  await page.waitForFunction(() => {
    const el = document.querySelector('.pf-wgpu-preview');
    return el && el.getAttribute('data-ready') === 'true';
  }, null, { timeout: 60_000 }).catch(() => { /* fall through; assert anyway */ });
  await page.click('button[aria-label="App settings"]');
  await page.waitForSelector('#pf-preview-engine', { timeout: 10_000 });
  const disabled = await page.$eval('#pf-preview-engine option[value="raycast"]', (o) => o.disabled);
  const noteVisible = await page.locator('text=/requires WebGPU/i').count();
  console.log(`${themeNote}: raycast option disabled=${disabled}, note=${noteVisible > 0}`);
  await page.close();
  return { disabled, note: noteVisible > 0 };
}

const webgl = await checkModal('http://localhost:3000/?renderer=webgl', 'WebGL session');
const webgpu = await checkModal('http://localhost:3000/', 'WebGPU session');

const pass = webgl.disabled && webgl.note && !webgpu.disabled && !webgpu.note;
console.log(pass ? 'PASS: gate behaves correctly in both renderers' : 'FAIL');
process.exitCode = pass ? 0 : 1;
await browser.close();
