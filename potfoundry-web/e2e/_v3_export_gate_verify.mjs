// E-2026-07-09-EXPORT-PERF gate-fix verification.
//
// DragonScales' default export used to THROW inside generateMesh (409
// finite-area sliver triangles -> summarizeConformingValidation.valid=false
// -> hard gate) while the v3 UI swallowed the failure silently (exportSTL
// returned void either way -> fire() fell through to recordExport(),
// burning a free-tier quota slot on an export that never happened, with no
// visible error). After the fix:
//   - finite-area slivers (aspect>100, positive area) no longer gate `valid`
//     (only a true zero-area/degenerate triangle or a topology defect does)
//   - exportSTL resolves false (not void) when generateMesh produces no mesh
//   - fire() skips recordExport() on a false result
//   - the specific reason (progress.message) renders once progress.status
//     is 'error', not only while firing
//
// This script drives the REAL production path end-to-end (NOT
// window.__pfFidelity, which forces generateMesh's `returnInvalidMesh: true`
// escape hatch for research measurement — see FidelityHookMount.tsx — and so
// cannot observe this gate at all): real v3 UI, real ExportFooter.fire(),
// real useParametricExport.exportSTL/generateMesh, real WebGPU.
//
// Usage:  node e2e/_v3_export_gate_verify.mjs [BaseURL]
// Needs:  a running dev server (default http://localhost:3001/); real-WebGPU
//         chromium (repo precedent: e2e/_prod_truth_capture.mjs).
import { chromium } from '@playwright/test';

const baseURL = process.argv[2] || 'http://localhost:3001/';
const t00 = Date.now();

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  if (m.type() === 'error') console.log(`[page:error] ${m.text().slice(0, 300)}`);
});

await page.addInitScript(() => {
  localStorage.setItem('pf2-ui-theme', 'v3');
  localStorage.setItem('pf3-hint-dismissed', '1');
});
await page.goto(baseURL);
await page.evaluate(() => {
  window.__POTFOUNDRY_STORE__?.getState().setUITheme('v3');
});
await page.waitForSelector('.pf3-root', { timeout: 30_000 });
console.log(`[setup] v3 shell up (${((Date.now() - t00) / 1000).toFixed(1)}s)`);

console.log('[setup] selecting DragonScales (default geometry — no dimension overrides)...');
await page.evaluate(() => {
  window.__POTFOUNDRY_STORE__.getState().setStyle('DragonScales');
});

// A style switch tears down and rebuilds the WebGPU parametric pipeline
// (useParametricExport's [style.name] effect) — wait for the export CTA to
// report ready (isAvailable, not just mounted) before firing.
console.log('[setup] waiting for the parametric pipeline to report ready...');
await page.waitForFunction(
  () => {
    const btn = document.querySelector('[data-testid="pf3-export-cta"]');
    return btn instanceof HTMLButtonElement && !btn.disabled;
  },
  { timeout: 60_000 },
);
console.log(`[setup] export CTA ready (${((Date.now() - t00) / 1000).toFixed(1)}s)`);
// Prior run: firing immediately after isAvailable flips true raced the OLD
// style's device/buffer teardown (AbortError: "Buffer was unmapped before
// mapping was resolved") and a separate live-preview SceneManager shader
// compile ("possible Dawn compiler hang") — neither related to the
// validation gate under test. Let both fully settle before firing.
console.log('[setup] settling 20s to let the prior style teardown + preview shader compile fully drain...');
await page.waitForTimeout(20_000);

console.log('[fire] dispatching pf3:download — the REAL ExportFooter.fire() path (registry precedent: e2e/ui-v3-smoke.spec.ts mobile M7)...');
const tFire0 = Date.now();
// DragonScales default exports have run 4-19 minutes in prior measurement
// (project_prod_artifact_truth); budget generously. Prior attempt (no error,
// no download) left it unclear whether the build was progressing or stalled
// — poll the live progress bar text so a long wait carries diagnostic value
// either way.
const downloadPromise = page.waitForEvent('download', { timeout: 40 * 60_000 });
const progressPoll = setInterval(async () => {
  const msg = await page
    .locator('.pf3-export-footer__progress .pf3-mono')
    .first()
    .textContent()
    .catch(() => null);
  console.log(`[progress @${((Date.now() - tFire0) / 1000).toFixed(0)}s] ${msg ?? '(no progress element — firing may have ended)'}`);
}, 30_000);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('pf3:download'));
});

let outcome;
try {
  const dl = await downloadPromise;
  const savedPath = 'test-results/_v3_export_gate_verify.stl';
  await dl.saveAs(savedPath);
  outcome = {
    ok: true,
    suggestedFilename: dl.suggestedFilename(),
    savedPath,
    elapsedS: (Date.now() - tFire0) / 1000,
  };
} catch (e) {
  outcome = { ok: false, error: String(e).slice(0, 500), elapsedS: (Date.now() - tFire0) / 1000 };
} finally {
  clearInterval(progressPoll);
}

// Cross-check against the visible UI regardless of download outcome — the
// alert (if any) should carry the SPECIFIC reason on failure (the other half
// of this fix), never a silent no-op.
const alertText = await page.locator('[role="alert"]').first().textContent().catch(() => null);
const certificateVisible = await page.getByText(/watertight/).isVisible().catch(() => false);

console.log('');
console.log('=== RESULT ===');
console.log(JSON.stringify(outcome, null, 2));
console.log('alert text (if any):', alertText);
console.log('certificate visible:', certificateVisible);
console.log(`total: ${((Date.now() - t00) / 1000).toFixed(1)}s`);

await browser.close();
process.exitCode = outcome.ok ? 0 : 1;
