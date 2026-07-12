// PHASE-2 GPU FIDELITY CERTIFICATION — Raycast-Oracle Fidelity Spike.
//
// The Phase-1 CPU spine (buildSolidCPU/sagScorer/scorecard in this same directory)
// measured a PROVISIONAL max chord-sag per style against a CPU-side analytic/brute
// twin. This probe certifies those numbers against the REAL exported GPU mesh vs the
// REAL GPU surface, using the app's OWN dev fidelity harness (window.__pfFidelity,
// see src/fidelity/windowHook.ts) — no new measurement code, no src/ edits.
//
// diagnoseSurfaceFidelity(metric:'perpendicular') is the honest "every triangle
// faithful" gate: shortest 3D distance from each flat facet to the TRUE surface.
// referenceSource:'auto' uses the CPU analytic truth (styles.ts) unless it has
// drifted from the WGSL shader (vertexMaxMm > 0.05mm), in which case it falls back
// to the decoupled GPU outer-wall grid; referenceSource:'gpu' FORCES that GPU grid
// (the shader's own eval) regardless — the ground truth we actually want certified
// against, since GyroidManifold's CPU radius fn is known to have drifted.
//
// v2 design note: a v1 single-page serial loop (setStyle -> auto -> gpu -> next
// style, all on ONE page) cascaded into total failure. page.evaluate() has no
// cancellation: when the Node-side withTimeout() "gives up" on a call, the page's
// JS keeps running synchronously in that tab, so the NEXT page.evaluate() (the next
// style's setStyle) just queues behind the still-executing prior script and times
// out too — a false-negative cascade, not a real per-style failure. Fix: one
// isolated browser CONTEXT per style (own renderer, own event loop, own WebGPU
// device), run CONCURRENTLY — this also uses the machine's idle cores instead of
// serializing potentially 8 multi-minute calls. Each diagnose call is awaited/
// logged/stashed independently so a slow 'gpu' call can never erase an
// already-succeeded 'auto' result for the same style (the v1 bug).
//
// Launch pattern mirrors e2e/_raycast_lut_dump.mjs. Reference-lever convention
// (__pfReferenceDenseRes / __pfReferenceBicubic / __pfConforming /
// __pfSurfaceFidelityExact via addInitScript) mirrors every e2e/_fidelity_*.cjs
// probe in this repo (e.g. _fidelity_perp3d_baseline.cjs, one page per style).
//
// Usage: node research/spike-raycast-oracle/gpuFidelity.mjs   (dev server up on :3000)
//   PF_BASE_URL, PF_TARGET_TRIS, PF_REF_RES, PF_TOL_MM, PF_DIAG_TIMEOUT,
//   PF_STYLE_TIMEOUT env overrides.
//   PF_STYLES=SFB,Gothic  — comma list to restrict which styles run (default: all 4).
//   PF_SKIP_AUTO=1        — skip the 'auto' call (targeted 'gpu'-only re-run/cross-
//                           check once 'auto' already succeeded for a style).
//   PF_DENSE_N=6          — override the chord barycentric sub-sample density (gate
//                           default 12). Only matters for 'gpu' (forced Newton-
//                           inversion against the sampled grid): 'auto' on a
//                           reference-trusted style is a cheap direct closed-form
//                           evaluation per sample, so its cost barely moves with
//                           denseN — the entire cost of a slow 'gpu' call is the
//                           O(denseN^2) grid-inversion, not the mesh itself.
//                           Same targetTriangles ⇒ same mesh as 'auto', so the
//                           comparison stays apples-to-apples; only the reference
//                           SAMPLING density (not the measured mesh) is lighter.
//   Results MERGE into an existing research/lab/spike-gpu-fidelity.json (new
//   fields win per-style) so a targeted re-run doesn't discard prior good rows.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.PF_BASE_URL || 'http://localhost:3000/?fidelity=1';
const TARGET_TRIS = Number(process.env.PF_TARGET_TRIS || 1500000);
const REF_RES = Number(process.env.PF_REF_RES || 512);
const TOL_MM = Number(process.env.PF_TOL_MM || 0.01);
const DENSE_N = process.env.PF_DENSE_N ? Number(process.env.PF_DENSE_N) : undefined;
const SKIP_AUTO = process.env.PF_SKIP_AUTO === '1';
// Forced GPU-grid Newton-inversion sampling is FAR more expensive than the fast
// closed-form/analytic path 'auto' takes when the style is reference-trusted — a
// v1 run needed >600000ms for a single 'gpu' call at 1.5M triangles. Budget
// generously; concurrency (below) keeps total wall-clock bounded by the slowest
// single call, not the sum.
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 1800000); // 30min/call
const STYLE_TIMEOUT = Number(process.env.PF_STYLE_TIMEOUT || 90000);
const READY_TIMEOUT = 95000;

// 3 frontier styles under certification + SuperformulaBlossom as an established
// (non-frontier) reference point, per the spike brief. Run concurrently — one
// isolated browser context each.
const ALL_STYLES = ['SuperformulaBlossom', 'SpiralRidges', 'GothicArches', 'GyroidManifold'];
const STYLES = process.env.PF_STYLES
  ? process.env.PF_STYLES.split(',').map((s) => s.trim()).filter(Boolean)
  : ALL_STYLES;

// Phase-1 CPU-spine provisional numbers (max chord-sag, mm @ 0.01mm target) — for
// the printed side-by-side comparison only; not used in the measurement itself.
const CPU_SPINE_MM = { SpiralRidges: 0.61, GothicArches: 1.49, GyroidManifold: 0.46 };

const OUT_JSON = path.resolve(__dirname, '../lab/spike-gpu-fidelity.json');

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

function fmtRow(r) {
  if (!r) return 'null (gate refused — legacy path / twist / missing taper config / parallelism broke)';
  const mode = r.referenceMode === 'gpu-grid' ? `gpu-grid@${r.referenceRes}` : r.referenceMode;
  return (
    `chordMax=${r.chordMaxMm?.toFixed(4)}mm p99=${r.p99DevMm?.toFixed(4)} rms=${r.rmsDevMm?.toFixed(4)} ` +
    `vertexMax=${r.vertexMaxMm?.toFixed(4)} mode=${mode} trusted=${r.referenceTrusted} ` +
    `nAbove=${r.nAbove}/${r.samples} nonFinite=${r.nonFiniteCount} tris=${r.triangleCount}`
  );
}

async function checkWebGpuAdapter(browser) {
  // NOTE: navigator.gpu is unavailable on an un-navigated about:blank page in this
  // Chromium build (verified: WebGPU works once actually navigated) — the check
  // MUST run after a real goto(), not on a fresh newPage(). Reuses BASE_URL so this
  // is a faithful pre-flight for the exact page the real probes will run on.
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    return await page.evaluate(async () => {
      try {
        if (!navigator.gpu) return false;
        const a = await navigator.gpu.requestAdapter();
        return !!a;
      } catch {
        return false;
      }
    });
  } finally {
    await page.close();
  }
}

async function runStyle(browser, style) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const row = { style };
  try {
    // Reference-lever convention shared by every e2e/_fidelity_*.cjs probe in this
    // repo, set BEFORE navigation so it is live for the very first build.
    // __pfConforming/__pfSurfaceFidelityExact are belt-and-suspenders hatches
    // (conformingMesher already defaults true in contracts.ts; surfaceFidelityExact
    // only gates extra per-style edge EXTRACTION, not the assembly-UT stash this
    // gate needs). __pfReferenceDenseRes/__pfReferenceBicubic build the DECOUPLED
    // dense GPU outer-wall grid that referenceSource:'gpu'/'auto' fall back to —
    // required for a trustworthy 'gpu' measurement (else that grid is null and the
    // 'gpu' source request is a no-op, per FidelitySurfaceFidelityDiagnosticOptions).
    await page.addInitScript((refRes) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfReferenceDenseRes = refRes;
      window.__pfReferenceBicubic = true;
    }, REF_RES);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(
      page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, {
        timeout: READY_TIMEOUT - 5000,
      }),
      READY_TIMEOUT,
      `${style} ready`,
    );
    console.log(`[${style}] ready, setting style...`);
    await withTimeout(
      page.evaluate((s) => window.__pfFidelity.setStyle(s), style),
      STYLE_TIMEOUT,
      `${style} setStyle`,
    );
    // SuperformulaBlossom at the DEFAULT sf_strength=0 is smooth (reads ~0mm, not a
    // meaningful comparison point) — every _fidelity_*.cjs probe in this repo sets
    // sf_strength:1 (full petals) for a non-trivial SFB measurement.
    if (style === 'SuperformulaBlossom') {
      await withTimeout(
        page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }),
        60000,
        `${style} setStyleParams`,
      );
    }
    // Each diagnose call is caught INDEPENDENTLY: a slow/failed 'gpu' call must
    // never discard an already-succeeded 'auto' result (the v1 bug).
    if (!SKIP_AUTO) {
      console.log(`[${style}] style set, running diagnoseSurfaceFidelity(auto) at ${TARGET_TRIS} tris...`);
      const t0 = Date.now();
      try {
        row.auto = await withTimeout(
          page.evaluate(
            ([tgt, tol, dn]) =>
              window.__pfFidelity.diagnoseSurfaceFidelity({
                referenceSource: 'auto',
                metric: 'perpendicular',
                targetTriangles: tgt,
                tolMm: tol,
                ...(dn ? { denseN: dn } : {}),
              }),
            [TARGET_TRIS, TOL_MM, DENSE_N],
          ),
          DIAG_TIMEOUT,
          `${style} diagnose-auto`,
        );
        row.autoMs = Date.now() - t0;
        console.log(`[${style}] AUTO done (${row.autoMs}ms): ${fmtRow(row.auto)}`);
      } catch (e) {
        row.autoError = String((e && e.message) || e).slice(0, 500);
        console.log(`[${style}] AUTO ERROR: ${row.autoError}`);
      }
    } else {
      console.log(`[${style}] SKIP_AUTO set — skipping 'auto' (already have a trusted result).`);
    }

    console.log(`[${style}] running diagnoseSurfaceFidelity(gpu) at ${TARGET_TRIS} tris${DENSE_N ? `, denseN=${DENSE_N}` : ''}...`);
    const t1 = Date.now();
    try {
      row.gpu = await withTimeout(
        page.evaluate(
          ([tgt, tol, dn]) =>
            window.__pfFidelity.diagnoseSurfaceFidelity({
              referenceSource: 'gpu',
              metric: 'perpendicular',
              targetTriangles: tgt,
              tolMm: tol,
              ...(dn ? { denseN: dn } : {}),
            }),
          [TARGET_TRIS, TOL_MM, DENSE_N],
        ),
        DIAG_TIMEOUT,
        `${style} diagnose-gpu`,
      );
      row.gpuMs = Date.now() - t1;
      console.log(`[${style}] GPU done (${row.gpuMs}ms): ${fmtRow(row.gpu)}`);
    } catch (e) {
      row.gpuError = String((e && e.message) || e).slice(0, 500);
      console.log(`[${style}] GPU ERROR: ${row.gpuError}`);
    }

    if (CPU_SPINE_MM[style] !== undefined) {
      console.log(`[${style}] CPU spine (provisional, Phase 1): ${CPU_SPINE_MM[style]}mm`);
    }
  } catch (e) {
    row.error = String((e && e.message) || e).slice(0, 500);
    console.log(`[${style}] FATAL: ${row.error}`);
  } finally {
    await context.close().catch(() => {});
  }
  return row;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
    });
  } catch (e) {
    console.log('STATUS: BLOCKED');
    console.log('REASON: browser launch failed: ' + String((e && e.message) || e).slice(0, 400));
    process.exitCode = 1;
    return;
  }

  try {
    console.log(
      `=== GPU FIDELITY CERTIFICATION v2 (targetTris=${TARGET_TRIS}, refRes=${REF_RES}, tolMm=${TOL_MM}, ` +
        `metric=perpendicular, diagTimeout=${DIAG_TIMEOUT}ms, ${STYLES.length}-way concurrent) ===`,
    );

    // STEP 3 — verify WebGPU actually works in a page in THIS browser before
    // spinning up all the per-style workers. If there is no adapter, stop
    // immediately rather than spin through several parallel pipelines that can
    // never become ready.
    const hasAdapter = await checkWebGpuAdapter(browser);
    console.log('WebGPU adapter present:', hasAdapter);
    if (!hasAdapter) {
      console.log('STATUS: BLOCKED');
      console.log(
        'REASON: navigator.gpu.requestAdapter() returned null/undefined in this browser context ' +
          '(launched headless:false with --enable-unsafe-webgpu) — no WebGPU adapter available in this environment.',
      );
      process.exitCode = 1;
      return;
    }

    const results = await Promise.all(STYLES.map((style) => runStyle(browser, style)));

    // MERGE into any existing output (keyed by style) rather than clobber it — a
    // targeted PF_STYLES/PF_SKIP_AUTO re-run must not erase already-good rows for
    // styles it didn't touch, or already-good 'auto' fields for styles it re-ran
    // 'gpu'-only. New non-undefined fields win per-style.
    let merged = [];
    try {
      const prior = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
      if (Array.isArray(prior.results)) merged = prior.results;
    } catch {
      /* no prior file / unparsable — start fresh */
    }
    const byStyle = new Map(merged.map((r) => [r.style, r]));
    for (const r of results) {
      const old = byStyle.get(r.style) || { style: r.style };
      byStyle.set(r.style, { ...old, ...r });
    }
    const mergedResults = ALL_STYLES.map((s) => byStyle.get(s)).filter(Boolean);
    // Any styles present only in a prior run (not in ALL_STYLES) are dropped by
    // design — ALL_STYLES is the full fixed roster for this spike.

    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl: BASE_URL,
          targetTriangles: TARGET_TRIS,
          referenceDenseRes: REF_RES,
          referenceBicubic: true,
          tolMm: TOL_MM,
          metric: 'perpendicular',
          lastRunDenseN: DENSE_N ?? null,
          cpuSpineProvisionalMm: CPU_SPINE_MM,
          results: mergedResults,
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${mergedResults.length} rows (this run touched ${results.length}) -> ${OUT_JSON}`);
    console.log('\n=== SUMMARY ===');
    for (const r of results) {
      console.log(`${r.style}:`);
      console.log(`  auto: ${r.auto ? fmtRow(r.auto) : r.autoError || r.error || '(missing)'}`);
      console.log(`  gpu:  ${r.gpu ? fmtRow(r.gpu) : r.gpuError || r.error || '(missing)'}`);
    }
    console.log('STATUS: DONE');
  } finally {
    await browser.close();
  }
})();
