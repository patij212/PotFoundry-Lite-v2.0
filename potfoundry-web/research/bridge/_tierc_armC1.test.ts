// _tierc_armC1.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm C1 (region layer + manifest integration
// proof for GothicArches, K2/R-REFINE patch scope). Env-gated PF_TIERC_ARMC1=1.
// Prereg: research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md, "Arm C — Gothic (patch scope,
// decision A5)" / C1 bullet.
//
// QUESTION 1 (reproduction): does buildRegionOuterWall(getManifest('GothicArches'), dims) — the
// region layer's R-REFINE dispatch (buildSingleRRefineRegion) — reproduce the LIVE production CI
// gate exactly (wholeMesh0Outlier.test.ts's unconditional smoke test:
// runPatchGate('GothicArches', {uLo:0,uHi:0.125,tLo:0.48,tHi:0.52}, 0.6, 512))? The R-REFINE
// dispatch path has NEVER been build-tested before this file — confirmed by direct read of
// tierc_regionLayer.test.ts's own "R-REFINE dispatch (validation only, no kernel invocation)"
// describe block BEFORE this file was written: its one test only asserts that a missing-domain
// region throws BEFORE buildProtectedComplex/refineToZeroOutliers are ever called. No prior probe
// has run buildSingleRRefineRegion's kernel calls to completion.
//
// QUESTION 2 (cross-style seam/boundary defect): does the composite gates harness's G3
// (orientation) + G7 (boundary) coverage — which the CI gate does NOT check (it only asserts G1
// fidelity + a raw-index non-manifold count) — come out clean 0/0 on the Gothic K2 patch, or does
// it carry a seam/boundary defect like Gyroid's doubled band-edge CDT (A1/A4 findings:
// research/lab/tierc/A1-gyroid-reproduction-verdict.md / A4-diagnosis.md — 360 boundary edges +
// 652 orientation mismatches, PRE-EXISTING, real by index, invisible to every prior Gyroid
// verdict)? A rectangular OPEN patch is EXPECTED to carry boundary edges around its own (u,t)
// domain perimeter — that is not a defect. The genuine question is whether any boundary/mismatch
// edges sit STRICTLY INTERIOR to the patch (the Gyroid signature) rather than on the domain rim.
// This file adds a small by-INDEX boundary-edge domain classifier (reusing labkit's own
// `nonManRawBigStats`, not re-deriving its edge-counting logic) to answer that directly.
//
// BUILD-PATH STRATEGY: `buildRegionOuterWall`'s public `RegionBuildResult` does not expose the
// (u,t) chart array or the refine-loop's own `passes`/`capped` fields for an R-REFINE region (only
// `outer.xyz`/`outer.idx`, already lifted to 3D, plus `meta` — verified by direct read of
// `buildSingleRRefineRegion`'s return statement). So this file builds via TWO paths and
// cross-checks them by content hash (fnvHash, the same instrument the Arm A1 probe used):
//   (1) NATIVE — buildRegionOuterWall(getManifest('GothicArches'), TIERC_COMMON_DIMS): the actual
//       mission target. If it throws, that is a first-class dispatch-bug FINDING, reported
//       verbatim (this file does not edit tierc_regionLayer.ts to work around it).
//   (2) K2-DIRECT — styleSampler + buildProtectedComplex + refineToZeroOutliers, called with the
//       EXACT SAME config wholeMesh0Outlier.test.ts's runPatchGate uses (verified identical to what
//       buildSingleRRefineRegion resolves via pickNum from GothicArches' manifest anatomy — see
//       tierc_manifest.ts's gothicArchesAnatomy doc comment: "kernelOpts values are the exact
//       config runPatchGate passes"). This path exposes `uv`/`tris`/`passes`/`capped` directly and
//       carries the CI's OWN full-azimuth `scoreWholeMesh` guard (reproducing the CI assertion
//       exactly, independent of the harness's own G1 ruler) — the boundary classifier and the
//       patch-scoped G2 supplementary check both run against this path's `uv`.
// When both paths' hashes match, the K2-direct analyses transfer to the native result exactly (same
// mesh, bit-for-bit); any divergence is reported as its own named finding, never silently resolved.
//
// scoreAllGates is run on whichever mesh is authoritative (native if it built; K2-direct fallback,
// LABELED, if native threw — per the mission's explicit permission). A patch has no full-pot
// concept (manifest gates.g7scope:'patch-NA'; GOTHIC_ARCHES_BUDGET sets maxOuterTris==maxFullTris
// for exactly this reason) — `full` and `outer` are the SAME patch mesh in the `bins` argument,
// labeled throughout.
//
// Run: NODE_OPTIONS=--max-old-space-size=8192 PF_TIERC_ARMC1=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_armC1.config.ts
//
// Budget: pre-registered 15min external ceiling; this file self-enforces a 12-minute CUMULATIVE
// budget guard before each heavy stage (native build / K2-direct build / scoreAllGates / patch-G2)
// — if already over budget, the remaining stages are SKIPPED and a TRUNCATED verdict is written
// with whatever was computed, rather than risking an unbounded run. Every stage's result is
// breadcrumbed the INSTANT it is computed (LAB-CHEATSHEET resilience rule) so a killed run's
// progress is never lost even if the budget guard itself never gets to fire.
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE ONLY — manifest, region layer,
// gates harness, labkit, and every tierC/ production kernel file are READ-ONLY imports; none edited
// by this file. Commits nothing (per mission RULES).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, toHarnessManifest, type RegionBuildResult } from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth } from './tierc_gatesHarness';
import { fnvHash } from './_analytic_floor_lib';
import { nonManRawBigStats } from './labkit';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import {
  DEFAULT_RULER,
  liftChartMesh,
  radialSurfaceFromSampler,
  scoreWholeMesh,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import type { StyleId } from '../../src/geometry/types';

const TAU = Math.PI * 2;
const TOL = 0.01;
const ON = process.env.PF_TIERC_ARMC1 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const GATES_OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'armC1_crumbs.ndjson');
const VERDICT_PATH = join(OUT_DIR, 'armC1_verdict.json');
const ARMC1_TIMEOUT_MS = 15 * 60 * 1000; // the mission's own external budget
const BUDGET_MS = 12 * 60 * 1000; // "kill+report if a stage exceeds 12 min"

// The CI gate's EXACT pinned domain/config (wholeMesh0Outlier.test.ts:109-114,
// champion-spec-gothic.md §5 "REPRODUCE-TARGETS / Primary target").
const DOMAIN: ChartDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };
const BG_ARC_MM = 0.6;
const N_THETA = 512;

// CI gate reference numbers (research/exchange/_rebaseline20_final/FINDINGS.md:4;
// champion-spec-gothic.md table row "production-ported smoke (CI, unconditional)").
const CI_REF = { tris: 9917, passes: 7, maxMm: 0.0101 };
// Banked sliver concession — from the LARGER 2-bay RESEARCH build (30,323 tris), NOT this smaller
// CI smoke patch (9,917 tris). Different scale; reported per the mission's explicit instruction,
// labeled honestly (champion-spec-gothic.md §1(b): "best-measured Gothic sliver figure holding
// fidelity is 19.0% ... minAngle=0° exactly", "This has never been re-measured on the
// PRODUCTION-PORTED kernel's output" — gap #1). This arm is the first such re-measurement, at a
// SMALLER, different-scale patch.
const BANKED_SLIVER = {
  pctBelow20: 19.0,
  minAngleDeg: 0,
  scaleNote: '2-bay RESEARCH build, 30,323 tris (gap #1 in champion-spec-gothic.md) — NOT this CI-smoke patch scale (9,917 tris)',
};

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({
        arm: 'C1',
        style: 'GothicArches',
        stage,
        pid: process.pid,
        at: new Date().toISOString(),
        ...extra,
      }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

/**
 * Boundary-edge DOMAIN classifier: for every by-INDEX boundary edge (used by exactly 1 triangle —
 * same definition `nonManRawBigStats` already counts, reused here rather than re-derived), is its
 * midpoint within `epsUT` of one of the (u,t) rectangle DOMAIN's 4 sides? Distinguishes the
 * EXPECTED open-patch rim from a genuine interior hole (the Gyroid A1/A4 defect signature — see
 * file header QUESTION 2). `epsUT` default 1e-7 is ~4 orders of magnitude below the mesh's own
 * finest feature spacing (the refine loop's dedupe-cell floor is 0.004mm in mm-space, which in
 * u-fraction is ~1.3e-5 at Gothic's ~301.6mm mean circumference) — tight enough that a genuine
 * interior point cannot be misclassified as on-rectangle, loose enough to absorb ordinary
 * floating-point roundoff from the refine loop's own boundary-clip arithmetic (`pu + s*(qu-pu)`).
 */
function classifyBoundaryEdges(
  tris: ArrayLike<number>,
  uv: ArrayLike<number>,
  domain: ChartDomain,
  epsUT = 1e-7,
): { total: number; onRect: number; interior: number; interiorSamples: Array<{ u: number; t: number }> } {
  const use = new Map<string, { a: number; b: number; n: number }>();
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      const hit = use.get(k);
      if (hit) hit.n++;
      else use.set(k, { a: i, b: j, n: 1 });
    }
  }
  let onRect = 0;
  let interior = 0;
  const interiorSamples: Array<{ u: number; t: number }> = [];
  for (const { a, b, n } of use.values()) {
    if (n !== 1) continue; // not a boundary edge
    const um = (uv[2 * a] + uv[2 * b]) / 2;
    const tm = (uv[2 * a + 1] + uv[2 * b + 1]) / 2;
    const onU = Math.abs(um - domain.uLo) < epsUT || Math.abs(um - domain.uHi) < epsUT;
    const onT = Math.abs(tm - domain.tLo) < epsUT || Math.abs(tm - domain.tHi) < epsUT;
    if (onU || onT) onRect++;
    else {
      interior++;
      if (interiorSamples.length < 20) interiorSamples.push({ u: um, t: tm });
    }
  }
  return { total: onRect + interior, onRect, interior, interiorSamples };
}

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm C1 -- Gothic K2/R-REFINE region-layer integration', () => {
  it(
    'buildRegionOuterWall native attempt -> K2-direct CI reproduction -> scoreAllGates -> G3/G7 seam-defect check',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const tStart = Date.now();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(
        heapMB,
        'NODE_OPTIONS=--max-old-space-size=8192 must propagate to the fork child -- relaunch with the env var exported',
      ).toBeGreaterThanOrEqual(6000);

      function overBudget(stage: string): boolean {
        const elapsed = Date.now() - tStart;
        if (elapsed > BUDGET_MS) {
          crumb('BUDGET-GUARD-FIRED', { stage, elapsedMs: elapsed });
          // eslint-disable-next-line no-console
          console.warn(`[armC1] BUDGET GUARD FIRED before "${stage}" (${(elapsed / 1000).toFixed(0)}s elapsed) -- skipping remaining stages.`);
          return true;
        }
        return false;
      }

      const manifest = getManifest('GothicArches');
      const rA = manifest.truth.rA;
      const { H, Rt, Rb, expn } = TIERC_COMMON_DIMS;

      // ── Stage 1: NATIVE attempt via buildRegionOuterWall -- the actual mission target, never
      // build-tested before this file (see file header). ──────────────────────────────────────────
      let nativeResult: RegionBuildResult | null = null;
      let nativeError: string | null = null;
      let nativeHash: string | null = null;
      if (!overBudget('native-build')) {
        try {
          const tNative0 = Date.now();
          nativeResult = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
          const buildMs = Date.now() - tNative0;
          nativeHash = fnvHash(nativeResult.outer.xyz, nativeResult.outer.idx);
          crumb('native-build-done', {
            ms: buildMs,
            tris: nativeResult.outer.idx.length / 3,
            dispatch: nativeResult.meta.dispatch,
            warnings: nativeResult.meta.warnings,
            hash: nativeHash,
          });
        } catch (err) {
          nativeError = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
          crumb('native-build-THREW', { error: nativeError });
          // eslint-disable-next-line no-console
          console.warn(`[armC1] NATIVE buildRegionOuterWall THREW -- falling back to K2-direct. ${nativeError}`);
        }
      }

      // ── Stage 2: K2-DIRECT build, mirroring wholeMesh0Outlier.test.ts's runPatchGate EXACTLY
      // (same sampler construction, same buildProtectedComplex call, same refine config). Always
      // built regardless of Stage 1's outcome: it is the ONLY path that exposes (u,t) `uv` (needed
      // by the boundary classifier + patch-scoped G2 below) and the CI's own full-azimuth guard. ──
      let k2: { uv: number[]; tris: number[]; passes: number; capped: boolean; xyz: Float32Array; idx: Uint32Array; hash: string } | null = null;
      let ciGuard: { outliers: number; maxMm: number; nFacetsMatch: boolean } | null = null;
      let k2NonMan: { nonMan: number; boundary: number; controlMoved: boolean } | null = null;
      if (!overBudget('k2-direct-build')) {
        const tSampler0 = Date.now();
        const sampler = styleSampler('GothicArches' as StyleId, {}, { H, Rt, Rb, expn });
        const complex = buildProtectedComplex(sampler, 'GothicArches');
        crumb('complex-built', {
          ms: Date.now() - tSampler0,
          residualCrossings: complex.residualCrossings,
          junctions: complex.junctions.length,
          recoveryPct: complex.recoveryPct,
        });
        expect(complex.residualCrossings).toBe(0);

        const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
        const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
        const refineOpts: RefineOptions = { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: BG_ARC_MM, ruler: loopRuler };
        const tRefine0 = Date.now();
        const refined = refineToZeroOutliers(sampler, complex, DOMAIN, refineOpts, (s) => {
          crumb('refine-pass', {
            pass: s.pass,
            dense: s.dense,
            tris: s.nTris,
            outliers: s.outliers,
            worstMm: +s.worstMm.toFixed(5),
            inserted: s.inserted,
            ms: s.ms,
          });
        });
        crumb('refine-done', { ms: Date.now() - tRefine0, passes: refined.passes, capped: refined.capped, tris: refined.tris.length / 3 });

        // MANDATORY whole-mesh guard: EVERY facet, dense 45-pt honest ruler at FULL azimuth -- the
        // CI's own trusted verdict (wholeMesh0Outlier.test.ts:88-94), reproduced exactly here,
        // independent of scoreAllGates' own (different) G1 ruler.
        const surface = radialSurfaceFromSampler(sampler);
        const tGuard0 = Date.now();
        const score = scoreWholeMesh(sampler, surface, refined, TOL, guardRuler);
        crumb('ci-guard-done', { ms: Date.now() - tGuard0, outliers: score.outliers, maxMm: score.maxMm, nFacets: score.nFacets });
        ciGuard = { outliers: score.outliers, maxMm: score.maxMm, nFacetsMatch: score.nFacets === refined.tris.length / 3 };

        const xyz64 = liftChartMesh(sampler, refined.uv);
        const xyz = Float32Array.from(xyz64);
        const idx = Uint32Array.from(refined.tris);
        const hash = fnvHash(xyz, idx);
        k2 = { uv: refined.uv, tris: refined.tris, passes: refined.passes, capped: refined.capped, xyz, idx, hash };
        crumb('k2direct-hash', { hash, tris: idx.length / 3, passes: refined.passes, capped: refined.capped });

        // Watertight, non-vacuous (labkit's own raw-index instrument -- reused, not re-derived).
        const baseStats = nonManRawBigStats(idx);
        const cracked = new Uint32Array(idx.length + 3);
        cracked.set(idx);
        cracked.set([idx[0], idx[1], idx[2]], idx.length);
        const crackedStats = nonManRawBigStats(cracked);
        k2NonMan = { nonMan: baseStats.nonMan, boundary: baseStats.boundary, controlMoved: crackedStats.nonMan > baseStats.nonMan };
        crumb('k2direct-nonman', k2NonMan);
      }

      const nativeMatchesK2Direct = nativeResult !== null && k2 !== null && nativeHash === k2.hash && nativeResult.outer.idx.length === k2.idx.length;

      // Authoritative mesh for scoreAllGates: native if it built (the mission's literal target),
      // else the K2-direct fallback -- LABELED, per the mission's explicit permission.
      let scoredXyz: Float32Array;
      let scoredIdx: Uint32Array;
      let scoredPath: string;
      if (nativeResult) {
        scoredXyz = nativeResult.outer.xyz;
        scoredIdx = nativeResult.outer.idx;
        scoredPath = nativeMatchesK2Direct
          ? 'region-layer-native (buildRegionOuterWall R-REFINE dispatch; hash-verified BIT-IDENTICAL to K2-direct)'
          : 'region-layer-native (buildRegionOuterWall R-REFINE dispatch; DIVERGES from K2-direct -- see nativeVsK2Direct in the verdict)';
      } else if (k2) {
        scoredXyz = k2.xyz;
        scoredIdx = k2.idx;
        scoredPath = `K2-direct-fallback (native buildRegionOuterWall THREW: ${nativeError ?? 'unknown error'})`;
      } else {
        // Both stages skipped by the budget guard before either could run.
        scoredXyz = new Float32Array(0);
        scoredIdx = new Uint32Array(0);
        scoredPath = 'NONE -- budget guard fired before any build stage ran';
      }

      // ── Stage 3: scoreAllGates -- the MANDATED composite-harness row. A patch has no full-pot
      // concept (manifest gates.g7scope:'patch-NA'; GOTHIC_ARCHES_BUDGET sets
      // maxOuterTris==maxFullTris for exactly this reason) -- `full` and `outer` are the SAME patch
      // mesh, labeled. ──────────────────────────────────────────────────────────────────────────
      let row: Awaited<ReturnType<typeof scoreAllGates>> | null = null;
      if (scoredIdx.length > 0 && !overBudget('scoreAllGates')) {
        const styleTruth: StyleTruth = { styleId: 'GothicArches', rA, H, Rb, Rt, expn };
        const manifestRow = toHarnessManifest(manifest);
        crumb('score-start', { tris: scoredIdx.length / 3, scoredPath });
        const tScore0 = Date.now();
        row = scoreAllGates(
          { full: { xyz: scoredXyz, idx: scoredIdx }, outer: { xyz: scoredXyz, idx: scoredIdx } },
          styleTruth,
          manifestRow,
          {
            tolMm: TOL,
            stride: 1,
            prescreen: true,
            breadcrumbPath: CRUMB_PATH,
            outputPath: GATES_OUT,
            runId: `armC1-Gothic-${Date.now()}`,
          },
        );
        crumb('score-done', { scoreMs: Date.now() - tScore0, totalMs: row.totalMs });

        // non-vacuity witnesses (mandatory, hard-asserted -- prereg "a row without them is VOID")
        expect(row.g3_watertight.nonManControlMoved).toBe(true);
        expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
        expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);
      }

      // ── Stage 4: boundary-edge DOMAIN classification (QUESTION 2) -- always runs against the
      // K2-direct build's own (u,t) `uv` (the only path exposing it); transfers exactly to the
      // native/scored mesh when hashes match. ─────────────────────────────────────────────────────
      let boundaryClass: ReturnType<typeof classifyBoundaryEdges> | null = null;
      if (k2) {
        boundaryClass = classifyBoundaryEdges(k2.tris, k2.uv, DOMAIN);
        crumb('boundary-classify', boundaryClass);
      }

      // ── Stage 5: PATCH-SCOPED G2 reverse coverage (supplementary; scoreAllGates' own G2 scans the
      // FULL [0,2π]x[0,H] surface -- semantically mismatched for a locator built from a tiny patch,
      // see the caveat attached in the verdict below). Reuses the SAME proven `buildRefLocator`
      // instrument the harness itself uses, restricted to the patch's own domain -- the first
      // genuinely meaningful G2-style number for Gothic at patch scope. ──────────────────────────
      let patchG2: {
        maxMm: number; worstU: number; worstT: number; p99Mm: number; p50Mm: number; overCount: number; n: number; cellMm: number; selfCheckMaxMm: number; ms: number;
      } | null = null;
      if (k2 && !overBudget('patch-g2')) {
        const tPg0 = Date.now();
        const refMesh: RefMesh = { xyz: Float64Array.from(k2.xyz), idx: k2.idx, nV: k2.xyz.length / 3, nF: k2.idx.length / 3 };
        let edgeSum = 0;
        const eSamples = Math.min(2000, refMesh.nF);
        for (let s = 0; s < eSamples; s++) {
          const tIdx = Math.floor((s / eSamples) * refMesh.nF) * 3;
          const a = refMesh.idx[tIdx] * 3;
          const b = refMesh.idx[tIdx + 1] * 3;
          edgeSum += Math.hypot(refMesh.xyz[b] - refMesh.xyz[a], refMesh.xyz[b + 1] - refMesh.xyz[a + 1], refMesh.xyz[b + 2] - refMesh.xyz[a + 2]);
        }
        const cell = Math.max(0.05, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
        const patchLoc = buildRefLocator(refMesh, cell);
        const NU_P = 400;
        const NT_P = 48;
        const cov = new Float64Array(NU_P * NT_P);
        let pn = 0;
        let worstD = -1;
        let worstU = 0;
        let worstT = 0;
        for (let j = 0; j < NT_P; j++) {
          const t = DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * (j / (NT_P - 1));
          const z = t * H;
          for (let i = 0; i < NU_P; i++) {
            const u = DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * (i / (NU_P - 1));
            const th = TAU * u;
            const r = rA(th, z);
            const d = patchLoc.dist(r * Math.cos(th), r * Math.sin(th), z);
            cov[pn++] = d;
            if (d > worstD) {
              worstD = d;
              worstU = u;
              worstT = t;
            }
          }
        }
        const sorted = Float64Array.from(cov.subarray(0, pn)).sort();
        // Self-check (non-vacuity witness for THIS supplementary locator, mirroring the harness's
        // own g2_reverse.locatorSelfCheckMaxMm convention): dist() vs bruteDist() on a few points.
        let selfCheckMax = 0;
        for (let s = 0; s < 12; s++) {
          const u = DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * (((s * 79) % 97) / 97);
          const t = DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * (((s * 131) % 89) / 89);
          const th = TAU * u;
          const z = t * H;
          const r = rA(th, z);
          const px = r * Math.cos(th);
          const py = r * Math.sin(th);
          selfCheckMax = Math.max(selfCheckMax, Math.abs(patchLoc.dist(px, py, z) - patchLoc.bruteDist(px, py, z)));
        }
        patchG2 = {
          maxMm: worstD,
          worstU,
          worstT,
          p99Mm: sorted[Math.min(pn - 1, Math.floor(0.99 * pn))],
          p50Mm: sorted[Math.floor(0.5 * pn)],
          overCount: sorted.reduce((n, d) => n + (d > TOL ? 1 : 0), 0),
          n: pn,
          cellMm: cell,
          selfCheckMaxMm: selfCheckMax,
          ms: Date.now() - tPg0,
        };
        crumb('patch-g2-done', patchG2);
        expect(selfCheckMax).toBeLessThan(1e-6); // non-vacuity: the locator's fast path matches brute
      }

      // ── ADJUDICATE (prereg Arm C1) -- computed + logged, NEVER tuned to pass. ────────────────────
      const scoredTris = scoredIdx.length / 3;
      const gates = row
        ? {
            g1Clean: row.g1_forward.outliers === 0 && row.g1_forward.maxMm <= 0.0101,
            watertightNonVacuous: row.g3_watertight.nonManRaw === 0 && row.g3_watertight.nonManControlMoved === true,
            trisWithinRef: scoredTris <= CI_REF.tris,
            passesWithinRef: k2 !== null && k2.passes <= CI_REF.passes,
          }
        : { g1Clean: false, watertightNonVacuous: false, trisWithinRef: false, passesWithinRef: false };
      const verdict = row && Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';

      const g3OrientationClean = row ? row.g3_watertight.orientationMismatches === 0 : null;
      const g7BoundaryCleanOfInteriorDefect = boundaryClass ? boundaryClass.interior === 0 : null;
      const seamDefectLikeGyroid =
        g3OrientationClean === false || g7BoundaryCleanOfInteriorDefect === false;

      const summary = {
        verdict,
        verdictNote: row ? undefined : 'FAIL by construction -- scoreAllGates never ran (see buildPath/budget fields)',
        gates,
        budget: { budgetMs: BUDGET_MS, elapsedAtEndMs: Date.now() - tStart, guardFired: Date.now() - tStart > BUDGET_MS },
        buildPath: {
          scoredPath,
          native: nativeResult
            ? { tris: nativeResult.outer.idx.length / 3, dispatch: nativeResult.meta.dispatch, buildMs: nativeResult.meta.buildMs, warnings: nativeResult.meta.warnings, hash: nativeHash }
            : null,
          nativeError,
          k2Direct: k2 ? { tris: k2.idx.length / 3, passes: k2.passes, capped: k2.capped, hash: k2.hash } : null,
          nativeMatchesK2Direct,
        },
        ciReproduction: {
          note: 'reproduces wholeMesh0Outlier.test.ts runPatchGate(GothicArches, {0,0.125,0.48,0.52}, 0.6, 512) exactly, via the K2-direct build',
          capped: k2?.capped ?? null,
          passes: k2?.passes ?? null,
          passesRef: CI_REF.passes,
          tris: k2 ? k2.idx.length / 3 : null,
          trisRef: CI_REF.tris,
          fullAzimuthGuard: ciGuard, // the CI's OWN trusted verdict (outliers, maxMm) -- not scoreAllGates' ruler
          maxMmRef: CI_REF.maxMm,
          watertight: k2NonMan,
        },
        harnessRow: row
          ? {
              g1_forward: { outliers: row.g1_forward.outliers, maxMm: row.g1_forward.maxMm, newtonWorstMm: row.g1_forward.newtonWorstMm, basis: row.g1_forward.basis, nFacets: row.g1_forward.nFacets, survivors: row.g1_forward.survivors, scannedFacets: row.g1_forward.scannedFacets },
              g2_reverse: {
                ...row.g2_reverse,
                CAVEAT: 'scoreAllGates default G2 scans the FULL [0,2*pi]x[0,H] pot surface against a locator built ONLY from this tiny patch -- semantically mismatched denominator for a patch (most query points are far outside the patch entirely). See patchG2 below for the meaningful patch-scoped reading.',
              },
              g3_watertight: row.g3_watertight,
              g4_zeroDefect: row.g4_zeroDefect,
              g6_budget: row.g6_budget,
              g7_assembly: row.g7_assembly,
              quality: row.quality,
            }
          : null,
        patchG2, // the meaningful, patch-scoped supplementary reverse-coverage reading (QUESTION on G2)
        boundaryClassification: boundaryClass,
        crossStyleSeamDefectFinding: {
          question: 'is the K2 Gothic patch clean 0/0 on G3 orientation + G7 boundary, or does it carry a seam/boundary defect like Gyroid (A1/A4: 360 boundary edges + 652 orientation mismatches, real by index)?',
          g3_orientationMismatches: row ? row.g3_watertight.orientationMismatches : null,
          g3_orientationClean: g3OrientationClean,
          g7_wholeMeshBoundaryEdges_topologyMetric: row ? row.g7_assembly.wholeMeshBoundaryEdges : null,
          g7_boundaryEdges_byIndex_k2Direct: k2NonMan ? k2NonMan.boundary : null,
          boundaryEdges_onDomainRect_expected: boundaryClass ? boundaryClass.onRect : null,
          boundaryEdges_STRICTLY_INTERIOR_unexpected: boundaryClass ? boundaryClass.interior : null,
          interiorSamples: boundaryClass ? boundaryClass.interiorSamples : null,
          g7CleanOfInteriorDefect: g7BoundaryCleanOfInteriorDefect,
          SEAM_DEFECT_LIKE_GYROID: seamDefectLikeGyroid,
        },
        sliverQuality: row
          ? {
              measured: { pctBelow20: row.quality.pctBelow20, minAngleDeg: row.quality.minAngleDeg, p5MinAngleDeg: row.quality.p5MinAngleDeg, needleCount: row.quality.needleCount, sliverCount: row.quality.sliverCount },
              banked: BANKED_SLIVER,
            }
          : null,
        wallTimes: { totalMs: Date.now() - tStart },
      };
      writeFileSync(VERDICT_PATH, JSON.stringify(summary, null, 2));
      crumb('verdict', { verdict, gates, seamDefectLikeGyroid, elapsedMs: Date.now() - tStart });
      // eslint-disable-next-line no-console
      console.log(`[armC1] VERDICT=${verdict}\n${JSON.stringify(summary, null, 2)}`);
    },
    ARMC1_TIMEOUT_MS,
  );
});
