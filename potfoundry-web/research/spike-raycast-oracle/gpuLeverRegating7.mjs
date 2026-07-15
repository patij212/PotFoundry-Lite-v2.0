// GPU LEVER RE-GATING v2 — TIGHTENED 7-CONDITION SCOPE (2026-07-12).
//
// Measures the CERTIFIED fidelity delta the production mesh dev-levers buy,
// via window.__pfFidelity.diagnoseSurfaceFidelity (the app's real gate — same
// mechanism gpuFidelity.mjs uses). The prior attempt (gpuLeverRegating.mjs,
// same dir) FAILED by backgrounding itself and never being polled to
// completion; this version exists specifically to make partial progress
// durable and pollable: ONE sequential loop over exactly 7 (style, condition)
// pairs, a FRESH browser context per condition (no cross-condition page-hang
// cascade — see the v1-cascade postmortem in gpuFidelity.mjs's header), a
// 15-minute watchdog per condition, and an IMMEDIATE JSON write to disk after
// EVERY condition (success, timeout, OR error) before moving to the next.
//
// SCOPE (pre-registered, do not expand without re-reading the brief):
//   baseline (all levers off):        SpiralRidges, GothicArches, GyroidManifold
//   analytic-surface lever on:        SpiralRidges, GothicArches, GyroidManifold
//   verdict-refine lever on:          GyroidManifold ONLY (see FLAG NOTES)
//   = 7 diagnoseSurfaceFidelity calls, fixed targetTriangles=500000 (not the
//     1.5M the sibling spike used — this run trades precision for a MUCH
//     faster on/off DELTA at a constant, still-meaningful budget).
//
// FLAG NOTES (verified 2026-07-12 by reading source, not assumed):
//   __pfConformingAnalyticFloor (ParametricExportComputer.ts:2849) is the ONLY
//   analytic-surface lever that is live on the path diagnoseSurfaceFidelity
//   actually exercises (generateMesh -> ParametricExportComputer.compute's
//   MAIN assembly, which this flag gates directly, line ~2830-2864).
//   buildAnalyticCurvatureFloor (AnalyticCurvatureFloor.ts:70) returns null
//   for every styleId other than 'SpiralRidges', so the SAME flag is a
//   proven-real lever for SpiralRidges and a confirmed BYTE-IDENTICAL no-op
//   for GothicArches/GyroidManifold — which IS itself the finding for those
//   two styles, not a reason to skip measuring them.
//
//   __pfTierCAnalyticSurface + __pfPerfectMesher (tierC/index.ts) are DEAD for
//   this measurement: buildTierCOuterWall's only non-test call site
//   (ParametricExportComputer.ts:2306) sits inside the `__pfConformingProbe`
//   early-return block (starts line 2257), which diagnoseSurfaceFidelity's
//   generateMesh never sets/reaches. Setting them would do nothing to the
//   measured mesh, so they are NOT toggled here (toggling a flag the code
//   never reads on this path adds no information, only confusion in the
//   flags-used log).
//
//   __pfConformingVerdictRefine (ConformingWall.ts:339-340, consulted by the
//   production entry buildConformingWall at line ~1176) IS genuinely live on
//   the main path, but only fires for an outer wall with featureLines and no
//   caller-supplied featureLevelAt. The brief scopes measurement to
//   GyroidManifold only (recent T1-T3 "Gyroid-knee ship" commits target
//   exactly this lever for exactly this style); SpiralRidges/GothicArches are
//   excluded by the brief as structurally inert for it and not measured here.
//
// Usage: node research/spike-raycast-oracle/gpuLeverRegating7.mjs  (dev server on :3000)
//   PF_BASE_URL, PF_TARGET_TRIS, PF_TOL_MM, PF_REF_RES, PF_COND_TIMEOUT env overrides.
// Output: research/lab/spike-gpu-regating.json — OVERWRITTEN at start with a
//   fresh 0/7 skeleton (the pre-existing file on disk was a stale prior-
//   attempt / different-schema partial run at 1.5M tris), then updated in
//   place after EVERY condition (never batched to the end).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.PF_BASE_URL || 'http://localhost:3000/?fidelity=1';
const TARGET_TRIS = Number(process.env.PF_TARGET_TRIS || 500000);
const REF_RES = Number(process.env.PF_REF_RES || 512);
const TOL_MM = Number(process.env.PF_TOL_MM || 0.01);
const COND_TIMEOUT = Number(process.env.PF_COND_TIMEOUT || 900000); // 15min/condition watchdog
const READY_TIMEOUT = 95000;

const ANALYTIC_FLAG = '__pfConformingAnalyticFloor';
const VERDICT_FLAG = '__pfConformingVerdictRefine';
const DEAD_FLAGS = ['__pfTierCAnalyticSurface', '__pfPerfectMesher'];
const DEAD_FLAGS_REASON =
  "buildTierCOuterWall's only non-test call site (ParametricExportComputer.ts:2306) is inside " +
  'the __pfConformingProbe early-return block (line 2257) — diagnoseSurfaceFidelity/generateMesh ' +
  'never sets __pfConformingProbe, so that call site is unreachable on the measured path and these ' +
  'two flags are never even read. Not toggled in this run (see script header FLAG NOTES).';

// Every lever this harness knows about, forced OFF before every condition, so
// each condition's ON-set below is absolute (no cross-condition leakage).
const ALL_LEVERS_OFF = {
  [ANALYTIC_FLAG]: false,
  [VERDICT_FLAG]: false,
  __pfTierCAnalyticSurface: false,
  __pfPerfectMesher: false,
};

// The exact 7-condition plan, in run order (grouped by style only incidentally
// — each item gets its OWN fresh browser context regardless of grouping).
const PLAN = [
  { style: 'SpiralRidges', condition: 'baseline', flags: {} },
  { style: 'SpiralRidges', condition: 'analytic', flags: { [ANALYTIC_FLAG]: true } },
  { style: 'GothicArches', condition: 'baseline', flags: {} },
  { style: 'GothicArches', condition: 'analytic', flags: { [ANALYTIC_FLAG]: true } },
  { style: 'GyroidManifold', condition: 'baseline', flags: {} },
  { style: 'GyroidManifold', condition: 'analytic', flags: { [ANALYTIC_FLAG]: true } },
  { style: 'GyroidManifold', condition: 'verdict', flags: { [VERDICT_FLAG]: true } },
];

const OUT_JSON = path.resolve(__dirname, '../lab/spike-gpu-regating.json');

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

function freshState() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'running',
    baseUrl: BASE_URL,
    targetTriangles: TARGET_TRIS,
    referenceDenseRes: REF_RES,
    referenceBicubic: true,
    tolMm: TOL_MM,
    metric: 'perpendicular',
    referenceSource: 'auto',
    levers: {
      analyticSurface: ANALYTIC_FLAG,
      verdictRefine: VERDICT_FLAG,
      deadFlags: DEAD_FLAGS,
      deadFlagsReason: DEAD_FLAGS_REASON,
    },
    plan: PLAN.map((p) => ({ style: p.style, condition: p.condition, flagsUsed: Object.keys(p.flags) })),
    conditions: [],
  };
}

function saveState(state) {
  state.generatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(state, null, 2));
}

function upsert(state, entry) {
  const idx = state.conditions.findIndex((c) => c.style === entry.style && c.condition === entry.condition);
  if (idx >= 0) state.conditions[idx] = entry;
  else state.conditions.push(entry);
  saveState(state);
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

// Runs exactly ONE (style, condition) measurement in its OWN fresh browser
// context (own renderer/device/event loop) — never shared with any other
// condition, so a wedged page.evaluate() (which Playwright cannot cancel; see
// gpuFidelity.mjs header) can never cascade into a later condition's setStyle
// queuing behind still-executing script — the documented v1 bug.
async function runCondition(browser, item) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.addInitScript((refRes) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfReferenceDenseRes = refRes;
      window.__pfReferenceBicubic = true;
    }, REF_RES);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, {
      timeout: READY_TIMEOUT - 5000,
    });
    await setFlags(page, item.flags);
    await page.evaluate((s) => window.__pfFidelity.setStyle(s), item.style);
    const t0 = Date.now();
    const result = await page.evaluate(
      ([tgt, tol]) =>
        window.__pfFidelity.diagnoseSurfaceFidelity({
          referenceSource: 'auto',
          metric: 'perpendicular',
          targetTriangles: tgt,
          tolMm: tol,
        }),
      [TARGET_TRIS, TOL_MM],
    );
    const ms = Date.now() - t0;
    return { result, ms };
  } finally {
    await context.close().catch(() => {});
  }
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
    });
  } catch (e) {
    const state = freshState();
    state.status = 'blocked';
    state.blockedReason = 'browser launch failed: ' + String((e && e.message) || e).slice(0, 400);
    saveState(state);
    console.log('STATUS: BLOCKED — browser launch failed');
    process.exitCode = 1;
    return;
  }

  // Fresh skeleton on disk immediately — before the first condition even
  // starts — so a poller reading the file right after launch sees 0/7
  // (running), never "file doesn't exist yet" or stale prior-schema content.
  const state = freshState();
  saveState(state);

  try {
    console.log(
      `=== GPU LEVER RE-GATING (7 conditions, targetTris=${TARGET_TRIS}, tolMm=${TOL_MM}, ` +
        `metric=perpendicular, referenceSource=auto, condTimeout=${COND_TIMEOUT}ms, SEQUENTIAL) ===`,
    );

    const hasAdapter = await checkWebGpuAdapter(browser);
    console.log('WebGPU adapter present:', hasAdapter);
    if (!hasAdapter) {
      state.status = 'blocked';
      state.blockedReason = 'navigator.gpu.requestAdapter() returned null/undefined in this browser context.';
      saveState(state);
      console.log('STATUS: BLOCKED — no WebGPU adapter');
      process.exitCode = 1;
      return;
    }

    for (const item of PLAN) {
      const label = `${item.style}/${item.condition}`;
      const flagsUsed = Object.keys(item.flags);
      console.log(`\n[${label}] starting (flags: ${flagsUsed.join(',') || '(none — baseline)'})...`);
      const startedAt = new Date().toISOString();
      try {
        const { result, ms } = await withTimeout(runCondition(browser, item), COND_TIMEOUT, label);
        upsert(state, {
          style: item.style,
          condition: item.condition,
          flagsUsed,
          status: 'done',
          startedAt,
          completedAt: new Date().toISOString(),
          ms,
          result,
        });
        console.log(`[${label}] DONE (${ms}ms): ${fmtRow(result)}`);
      } catch (e) {
        const msg = String((e && e.message) || e).slice(0, 500);
        const isTimeout = /timeout \d+ms/.test(msg);
        upsert(state, {
          style: item.style,
          condition: item.condition,
          flagsUsed,
          status: isTimeout ? 'timeout' : 'error',
          startedAt,
          completedAt: new Date().toISOString(),
          error: msg,
        });
        console.log(`[${label}] ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${msg}`);
      }
      console.log(`[progress] ${state.conditions.length}/${PLAN.length} conditions recorded -> ${OUT_JSON}`);
    }

    state.status = 'done';
    saveState(state);
    console.log('\n=== SUMMARY ===');
    for (const c of state.conditions) {
      console.log(`${c.style}/${c.condition}: ${c.status === 'done' ? fmtRow(c.result) : `${c.status}: ${c.error}`}`);
    }
    console.log('STATUS: DONE');
  } catch (e) {
    state.status = 'crashed';
    state.crashError = String((e && e.message) || e).slice(0, 500);
    saveState(state);
    console.log('STATUS: CRASHED', state.crashError);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();
