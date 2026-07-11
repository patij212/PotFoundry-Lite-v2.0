// E-2026-07-09-EXPORT-STAGE-TIMING — capture arm.
// Drives ONE production-default conforming export per pilot style via the
// dev-only window.__pfFidelity.diagnoseStageTimings() harness (real WebGPU),
// using the SAME TANGLED_BASE dims + style list as e2e/_prod_truth_capture.mjs
// so results are apples-to-apples against the E-2026-07-09-PROD-ARTIFACT-TRUTH
// pilot totals (research/exchange/_prod_truth/<style>/meta.json).
//
// ONE generateMesh call per style (diagnoseStageTimings reads counts + a
// meshHash from the SAME build it times — no second regenerate needed, unlike
// the full+outer capture arm this mirrors).
//
// Measurement only: the timing instrument is import.meta.env.DEV-gated inside
// ParametricExportComputer.compute() itself and never runs in production; this
// script does not touch src/ behavior.
//
// Usage:  node e2e/_export_stage_timing_capture.mjs [StyleName ...]
// Needs:  npm run dev on :3000; real-WebGPU chromium (headless:false — repo
//         precedent from the raycast/prod-truth harnesses).
// Writes: research/exchange/_export_stage_timing/<style>.json + _summary.json
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PILOT = ['HarmonicRipple', 'SpiralRidges', 'GyroidManifold', 'DragonScales', 'Voronoi'];
const styles = process.argv.slice(2).length ? process.argv.slice(2) : PILOT;
const OUT_DIR = 'research/exchange/_export_stage_timing';
const DIMS = { H: 120, top_od: 100, bottom_od: 80, expn: 1, bellAmp: 0, spinTurns: 0 };
mkdirSync(OUT_DIR, { recursive: true });
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
await page.goto('http://localhost:3001/');
await page.waitForFunction(() => Boolean(window.__pfFidelity), null, { timeout: 60_000 });

let failures = 0;
const summary = [];
for (const style of styles) {
  const t0 = Date.now();
  console.log(`--- ${style} starting (wall clock, real production default export) ---`);
  try {
    await page.evaluate(async (s) => {
      await window.__pfFidelity.setStyle(s);
    }, style);
    await page.evaluate(async (d) => {
      await window.__pfFidelity.setDimensions(d);
    }, DIMS);

    const result = await page.evaluate(async () => window.__pfFidelity.diagnoseStageTimings());
    const wallMs = Date.now() - t0;
    if (!result) {
      throw new Error('diagnoseStageTimings returned null (legacy path, or not a dev build)');
    }
    const row = { style, dims: DIMS, wallMs, ...result, ok: true };
    writeFileSync(join(OUT_DIR, `${style}.json`), JSON.stringify(row, null, 2));
    summary.push(row);
    console.log(
      `${style}: OK tris=${result.triangleCount} verts=${result.vertexCount} ` +
        `totalMs=${result.totalMs.toFixed(0)} wallMs=${wallMs} ` +
        `[samplerGrids=${result.samplerGridsMs.toFixed(0)} extractFeatures=${result.extractFeaturesMs.toFixed(0)} ` +
        `assembleWatertight=${result.assembleWatertightMs.toFixed(0)} warps=${result.warpsMs.toFixed(0)} ` +
        `gpuVertexEval=${result.gpuVertexEvalMs.toFixed(0)} measureFeatureResolution=${result.measureFeatureResolutionMs.toFixed(0)} ` +
        `decimation=${result.decimationMs.toFixed(0)} summarizeValidation=${result.summarizeValidationMs.toFixed(0)} ` +
        `other=${result.otherMs.toFixed(0)}]`,
    );
  } catch (e) {
    failures++;
    const msg = String(e).slice(0, 1000);
    writeFileSync(join(OUT_DIR, `${style}.json`), JSON.stringify({ style, ok: false, error: msg }, null, 2));
    console.log(`${style}: FAIL ${msg}`);
  }
}
writeFileSync(join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
console.log(
  `CAPTURE TOTAL: ${((Date.now() - t00) / 1000).toFixed(1)}s — ${failures === 0 ? 'ALL OK' : failures + ' style(s) failed'}`,
);
await browser.close();
process.exitCode = 0; // per _prod_truth_capture.mjs precedent: capture failures are findings, not harness failures
