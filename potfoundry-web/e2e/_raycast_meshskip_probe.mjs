// Probe: in ?preview=raycast mode, style switches must NOT kick mesh pipeline
// compiles ("Style change detected! ... Initiating compilation" / SceneManager
// compile logs), and the mesh-path Dawn-hang style (18) must become
// raycast-ready without a 30s stall. Run from potfoundry-web/ with dev server up.
// Mirrors raycast-preview.spec.ts A1/A2: wait for controller, select via store.
import { chromium } from '@playwright/test';

const STYLES = [[0, 'SuperformulaBlossom'], [5, 'GothicArches'], [9, 'DragonScales'], [18, 'CelticTriquetra']];

// Headless Chromium exposes NO WebGPU adapter on Windows (see playwright.config.ts)
const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage();
const meshCompileLogs = [];
page.on('console', (msg) => {
  const t = msg.text();
  if (t.includes('Initiating compilation') || t.includes('[SceneManager] Compiling Style')) {
    meshCompileLogs.push(t);
  }
});

await page.goto('http://localhost:3000/?preview=raycast');
await page.waitForFunction(() => Boolean(window.__pfRaycast?.controller), null, { timeout: 60_000 });
console.log(`controller up; mesh-compile logs at mount (allowed): ${meshCompileLogs.length}`);
const mountLogs = meshCompileLogs.length;

for (const [id, key] of STYLES) {
  const t0 = Date.now();
  await page.evaluate((k) => { window.__POTFOUNDRY_STORE__.getState().setStyle(k); }, key);
  await page.waitForFunction((sid) => Boolean(window.__pfRaycast?.controller?.isReady(sid)), id, { timeout: 60_000 });
  console.log(`style ${id} (${key}) raycast-ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const switchLogs = meshCompileLogs.length - mountLogs;
console.log(`mesh-compile kicks during style switches: ${switchLogs}`);
if (switchLogs > 0) {
  console.log('OFFENDING LOGS:', meshCompileLogs.slice(mountLogs));
  process.exitCode = 1;
} else {
  console.log('PASS: no mesh pipeline compiles kicked in raycast mode');
}
await browser.close();
