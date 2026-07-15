// E-2026-07-09-PROD-ARTIFACT-TRUTH — capture arm.
// Drives the REAL production default export per style (ParametricExportComputer
// .compute on real WebGPU, conforming branch, default 'high' profile + CAD floor)
// via the dev-only window.__pfFidelity harness, and persists the artifact meshes
// for the Node honest-ruler probe (research/bridge/_prod_truth.test.ts).
//
// Two meshes per style, BOTH from the production compute (deterministic, two
// generates): the FULL-POT mesh (watertight/zeroArea audits run on this) and the
// production OUTER-WALL submesh via _debugOuterMesh (production's own surfaceId
// mask; the fidelity/coverage rulers run on this).
//
// Dims are pinned to the terminal-scorecard reference shape (TANGLED_BASE):
// H120 / Rt50 / Rb40 (top_od 100, bottom_od 80), expn 1 (store default is 1.1!),
// bell 0, spin 0 — spin=0 makes the per-vertex radial check exact (no helix).
//
// Usage:  node e2e/_prod_truth_capture.mjs [StyleName ...]
// Needs:  npm run dev on :3000; real-WebGPU chromium (headless:false — repo
//         precedent from the raycast harnesses).
// Writes: research/exchange/_prod_truth/<style>/{full,outer}.{xyz,idx}.bin + meta.json
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PILOT = ['HarmonicRipple', 'SpiralRidges', 'GyroidManifold', 'DragonScales', 'Voronoi'];
const styles = process.argv.slice(2).length ? process.argv.slice(2) : PILOT;
const OUT_ROOT = 'research/exchange/_prod_truth';
const DIMS = { H: 120, top_od: 100, bottom_od: 80, expn: 1, bellAmp: 0, spinTurns: 0 };
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
await page.goto(process.env.PF_PT_URL ?? 'http://localhost:3000/');
await page.waitForFunction(() => Boolean(window.__pfFidelity), null, { timeout: 60_000 });

/** Persist a typed array stashed on window.__prodTruth[kind] via a Blob download
 *  (no evaluate-serialization of multi-hundred-MB buffers; same anchor-click
 *  mechanism the production downloadSTL uses). */
async function saveBuffer(kind, name, destPath) {
  const dl = page.waitForEvent('download', { timeout: 300_000 });
  await page.evaluate(
    ({ kind, name }) => {
      const buf = window.__prodTruth[kind];
      const blob = new Blob([buf], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    },
    { kind, name },
  );
  const d = await dl;
  await d.saveAs(destPath);
}

let failures = 0;
for (const style of styles) {
  const t0 = Date.now();
  const dir = join(OUT_ROOT, style);
  mkdirSync(dir, { recursive: true });
  const meta = { style, dims: DIMS, startedAt: new Date().toISOString() };
  try {
    await page.evaluate(async (s) => {
      await window.__pfFidelity.setStyle(s);
    }, style);
    await page.evaluate(async (d) => {
      await window.__pfFidelity.setDimensions(d);
    }, DIMS);

    // FULL-POT artifact — the production default profile (generateMesh(undefined,
    // {returnInvalidMesh:true}) inside the hook: HEAD output even if the
    // production validator rejects it; rejection is itself recorded by the probe).
    const tFull0 = Date.now();
    const full = await page.evaluate(async () => {
      const m = await window.__pfFidelity.getMeshForRender();
      if (!m) return null;
      window.__prodTruth = { fullXyz: m.vertices, fullIdx: m.indices };
      return { verts: m.vertices.length / 3, tris: m.indices.length / 3 };
    });
    if (!full) throw new Error('getMeshForRender returned null (generate failed)');
    meta.full = { ...full, generateMs: Date.now() - tFull0 };
    await saveBuffer('fullXyz', `${style}.full.xyz.bin`, join(dir, 'full.xyz.bin'));
    await saveBuffer('fullIdx', `${style}.full.idx.bin`, join(dir, 'full.idx.bin'));

    // OUTER-WALL submesh — production's own surfaceId mask (second generate).
    const tOuter0 = Date.now();
    const outer = await page.evaluate(async () => {
      const m = await window.__pfFidelity._debugOuterMesh();
      if (!m) return null;
      window.__prodTruth = { outerXyz: m.vertices, outerIdx: m.indices };
      return { verts: m.vertices.length / 3, tris: m.indices.length / 3 };
    });
    if (!outer) throw new Error('_debugOuterMesh returned null');
    meta.outer = { ...outer, generateMs: Date.now() - tOuter0 };
    await saveBuffer('outerXyz', `${style}.outer.xyz.bin`, join(dir, 'outer.xyz.bin'));
    await saveBuffer('outerIdx', `${style}.outer.idx.bin`, join(dir, 'outer.idx.bin'));

    await page.evaluate(() => {
      delete window.__prodTruth;
    });
    meta.ok = true;
  } catch (e) {
    // A throwing default export is a first-class finding — record verbatim, continue.
    meta.ok = false;
    meta.error = String(e).slice(0, 1000);
    failures++;
  }
  meta.totalMs = Date.now() - t0;
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(
    `${style}: ${meta.ok ? 'OK' : 'FAIL'} full=${meta.full ? `${meta.full.tris}t/${(meta.full.generateMs / 1000).toFixed(1)}s` : '-'} ` +
      `outer=${meta.outer ? `${meta.outer.tris}t/${(meta.outer.generateMs / 1000).toFixed(1)}s` : '-'} total=${(meta.totalMs / 1000).toFixed(1)}s` +
      (meta.error ? ` error=${meta.error.slice(0, 200)}` : ''),
  );
}

console.log(`CAPTURE TOTAL: ${((Date.now() - t00) / 1000).toFixed(1)}s — ${failures === 0 ? 'ALL OK' : failures + ' style(s) failed'}`);
await browser.close();
process.exitCode = 0; // per pre-registration, capture failures are findings, not harness failures
