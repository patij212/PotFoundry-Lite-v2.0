// GPU LEVER RE-GATING — CERTIFIED fidelity delta per production mesh lever.
//
// Adapted from gpuFidelity.mjs (same isolation pattern: one Playwright browser
// CONTEXT per style, own renderer/device/event loop, run CONCURRENTLY). Where
// gpuFidelity.mjs compares referenceSource auto-vs-gpu for a single (flag-off)
// build, this script holds referenceSource:'auto' FIXED and instead sweeps
// THREE dev-lever conditions per style, sequentially within each style's own
// page (flip globalThis flag -> setStyle again to force the next generateMesh
// to read it -> diagnoseSurfaceFidelity):
//
//   (a) baseline — every lever explicitly OFF (not just relying on defaults)
//   (b) verdict  — window.__pfConformingVerdictRefine = true
//   (c) analytic — the STYLE-APPROPRIATE analytic-surface lever(s). These are
//       NOT one universal flag — reading ParametricExportComputer.ts +
//       tierC/index.ts + AnalyticCurvatureFloor.ts establishes:
//         SpiralRidges   -> __pfConformingAnalyticFloor=true (SpiralRidges-only
//                           closed-form curvature FLOOR on the sizing field;
//                           buildAnalyticCurvatureFloor returns null for every
//                           other style => byte-identical no-op elsewhere).
//         GothicArches   -> __pfPerfectMesher=true AND __pfTierCAnalyticSurface=true
//                           (BOTH required: isTierCAnalyticSurfaceEnabled() is
//                           only even CONSULTED inside buildTierCOuterWall's
//                           flag-on branch, which itself requires
//                           isPerfectMesherEnabled() AND the style being in the
//                           COUNT_UNSTABLE_STYLES allow-list {GothicArches,
//                           GeometricStar} (countUnstable.ts). __pfTierCAnalyticSurface
//                           ALONE, without __pfPerfectMesher, is a pure no-op.)
//         GyroidManifold / SuperformulaBlossom -> NEITHER lever's precondition
//                           is met (not SpiralRidges; not in the count-unstable
//                           allow-list) => the "analytic" condition sets ALL
//                           THREE flags together, to POSITIVELY demonstrate
//                           zero effect rather than merely skip the condition.
//
// Usage: node research/spike-raycast-oracle/gpuLeverRegating.mjs  (dev server on :3000)
//   PF_BASE_URL, PF_TARGET_TRIS, PF_REF_RES, PF_TOL_MM, PF_DIAG_TIMEOUT,
//   PF_STYLE_TIMEOUT env overrides (same meaning as gpuFidelity.mjs).
//   PF_STYLES=SpiralRidges,GothicArches  — comma list to restrict which styles run.
//   Results MERGE into research/lab/spike-gpu-regating.json keyed by style (new
//   fields win) so a targeted re-run doesn't discard already-good rows.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.PF_BASE_URL || 'http://localhost:3000/?fidelity=1';
const TARGET_TRIS = Number(process.env.PF_TARGET_TRIS || 1500000);
const REF_RES = Number(process.env.PF_REF_RES || 512);
const TOL_MM = Number(process.env.PF_TOL_MM || 0.01);
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 1800000); // 30min/call
const STYLE_TIMEOUT = Number(process.env.PF_STYLE_TIMEOUT || 90000);
const READY_TIMEOUT = 95000;

const ALL_STYLES = ['SpiralRidges', 'GothicArches', 'GyroidManifold', 'SuperformulaBlossom'];
const STYLES = process.env.PF_STYLES
  ? process.env.PF_STYLES.split(',').map((s) => s.trim()).filter(Boolean)
  : ALL_STYLES;

const OUT_JSON = path.resolve(__dirname, '../lab/spike-gpu-regating.json');

// Every lever this harness touches, all OFF — applied at the start of every
// condition, so each setFlags() call is absolute (no cross-condition leakage).
const ALL_LEVERS_OFF = {
  __pfConformingVerdictRefine: false,
  __pfConformingAnalyticFloor: false,
  __pfPerfectMesher: false,
  __pfTierCAnalyticSurface: false,
};

function analyticFlagsFor(style) {
  switch (style) {
    case 'SpiralRidges':
      return { __pfConformingAnalyticFloor: true };
    case 'GothicArches':
      return { __pfPerfectMesher: true, __pfTierCAnalyticSurface: true };
    default:
      // No known analytic lever's precondition is met for this style. Set ALL
      // THREE anyway, together, to POSITIVELY demonstrate zero effect.
      return { __pfConformingAnalyticFloor: true, __pfPerfectMesher: true, __pfTierCAnalyticSurface: true };
  }
}

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

function fmtRow(r) {
  if (!r) return 'null (gate refused / error)';
  const mode = r.referenceMode === 'gpu-grid' ? `gpu-grid@${r.referenceRes}` : r.referenceMode;
  return (
    `chordMax=${r.chordMaxMm?.toFixed(4)}mm p99=${r.p99DevMm?.toFixed(4)} rms=${r.rmsDevMm?.toFixed(4)} ` +
    `vertexMax=${r.vertexMaxMm?.toFixed(4)} mode=${mode} trusted=${r.referenceTrusted} ` +
    `nAbove=${r.nAbove}/${r.samples} tris=${r.triangleCount}`
  );
}

async function setFlags(page, flags) {
  await page.evaluate(
    ([offFlags, onFlags]) => {
      const g = globalThis;
      for (const [k, v] of Object.entries(offFlags)) g[k] = v;
      for (const [k, v] of Object.entries(onFlags)) g[k] = v;
    },
    [ALL_LEVERS_OFF, flags],
  );
}

async function measureOnce(page, style, label, styleParams) {
  console.log(`[${style}] [${label}] setStyle (settle + force next build to read current flags)...`);
  await withTimeout(
    page.evaluate((s) => window.__pfFidelity.setStyle(s), style),
    STYLE_TIMEOUT,
    `${style} ${label} setStyle`,
  );
  if (styleParams) {
    await withTimeout(
      page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), styleParams),
      60000,
      `${style} ${label} setStyleParams`,
    );
  }
  const t0 = Date.now();
  const result = await withTimeout(
    page.evaluate(
      ([tgt, tol]) =>
        window.__pfFidelity.diagnoseSurfaceFidelity({
          referenceSource: 'auto',
          metric: 'perpendicular',
          targetTriangles: tgt,
          tolMm: tol,
        }),
      [TARGET_TRIS, TOL_MM],
    ),
    DIAG_TIMEOUT,
    `${style} ${label} diagnose`,
  );
  const ms = Date.now() - t0;
  console.log(`[${style}] [${label}] done (${ms}ms): ${fmtRow(result)}`);
  return { result, ms };
}

async function checkWebGpuAdapter(browser) {
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
  const styleParams = style === 'SuperformulaBlossom' ? { sf_strength: 1 } : undefined;
  try {
    // Same reference-lever convention as gpuFidelity.mjs, set BEFORE navigation
    // (live for the very first build) and left untouched for the rest of the
    // run — these build the DECOUPLED dense GPU grid that referenceSource
    // 'auto' falls back to on a drifted style; they are orthogonal to the
    // dev levers under test here.
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
    console.log(`[${style}] ready.`);

    // (a) BASELINE — every lever explicitly off.
    await setFlags(page, {});
    try {
      const { result, ms } = await measureOnce(page, style, 'baseline', styleParams);
      row.baseline = result;
      row.baselineMs = ms;
    } catch (e) {
      row.baselineError = String((e && e.message) || e).slice(0, 500);
      console.log(`[${style}] [baseline] ERROR: ${row.baselineError}`);
    }

    // (b) VERDICT-REFINE on.
    await setFlags(page, { __pfConformingVerdictRefine: true });
    try {
      const { result, ms } = await measureOnce(page, style, 'verdict', styleParams);
      row.verdict = result;
      row.verdictMs = ms;
    } catch (e) {
      row.verdictError = String((e && e.message) || e).slice(0, 500);
      console.log(`[${style}] [verdict] ERROR: ${row.verdictError}`);
    }

    // (c) ANALYTIC-LEVER on (style-appropriate flag set — see analyticFlagsFor).
    const aFlags = analyticFlagsFor(style);
    row.analyticFlagsUsed = Object.keys(aFlags);
    await setFlags(page, aFlags);
    try {
      const { result, ms } = await measureOnce(page, style, 'analytic', styleParams);
      row.analytic = result;
      row.analyticMs = ms;
    } catch (e) {
      row.analyticError = String((e && e.message) || e).slice(0, 500);
      console.log(`[${style}] [analytic] ERROR: ${row.analyticError}`);
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
      `=== GPU LEVER RE-GATING (targetTris=${TARGET_TRIS}, tolMm=${TOL_MM}, metric=perpendicular, ` +
        `referenceSource=auto, diagTimeout=${DIAG_TIMEOUT}ms, ${STYLES.length}-way concurrent) ===`,
    );

    const hasAdapter = await checkWebGpuAdapter(browser);
    console.log('WebGPU adapter present:', hasAdapter);
    if (!hasAdapter) {
      console.log('STATUS: BLOCKED');
      console.log('REASON: navigator.gpu.requestAdapter() returned null/undefined in this browser context.');
      process.exitCode = 1;
      return;
    }

    const results = await Promise.all(STYLES.map((style) => runStyle(browser, style)));

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
          referenceSource: 'auto',
          levers: {
            verdictRefine: '__pfConformingVerdictRefine',
            analyticPerStyle: {
              SpiralRidges: ['__pfConformingAnalyticFloor'],
              GothicArches: ['__pfPerfectMesher', '__pfTierCAnalyticSurface'],
              GyroidManifold: ['none apply (not SpiralRidges; not in COUNT_UNSTABLE_STYLES) — all 3 flags set together to prove no-op'],
              SuperformulaBlossom: ['none apply (same reasoning as GyroidManifold)'],
            },
          },
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
      console.log(`  baseline: ${r.baseline ? fmtRow(r.baseline) : r.baselineError || r.error || '(missing)'}`);
      console.log(`  verdict:  ${r.verdict ? fmtRow(r.verdict) : r.verdictError || r.error || '(missing)'}`);
      console.log(
        `  analytic: ${r.analytic ? fmtRow(r.analytic) : r.analyticError || r.error || '(missing)'} [flags: ${(r.analyticFlagsUsed || []).join(',')}]`,
      );
    }
    console.log('STATUS: DONE');
  } finally {
    await browser.close();
  }
})();
