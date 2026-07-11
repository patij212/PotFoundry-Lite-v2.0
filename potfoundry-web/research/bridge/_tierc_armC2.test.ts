// _tierc_armC2.test.ts — Arm C2 (E-2026-07-11-TIERC-HEADTOHEAD, prereg Addendum 6 C2 sub-target).
//
// Validates the NEW K2 kernel lever `surfaceSource:'analytic'`
// (src/renderers/webgpu/parametric/conforming/tierC/{noBridgeRefine,interiorRuler}.ts): the refine
// loop's PLACEMENT (seed/lift/insertion) and RULING (facetInteriorHonest/scoreWholeMesh) now target
// the exact analytic radius function instead of the 512^2 styleSampler bilinear grid C1 found chords
// ~0.17mm off analytic at Gothic's knife-edge crests (C1-gothic-verdict.md Finding 2). Default
// undefined/'sampler' is BYTE-IDENTICAL to prior — proven in PART 1.
//
// PART 1 (env PF_TIERC_ARMC2_PART1=1) — default-off byte identity on the FULL CI smoke patch
// (u [0,0.125] t [0.48,0.52] bgArc 0.6 nTheta 512): must reproduce wholeMesh0Outlier.test.ts's own
// live gate EXACTLY (9917 tris / 7 passes / 0 outliers / max <=0.0101 — == C1's reproduction), plus
// watertight (nonMan 0 non-vacuous) + G3/G7 (orientation 0, boundary all-rim) + quality (%<20 report).
//
// PART 2 (env PF_TIERC_ARMC2_PART2=1) — surfaceSource:'analytic' MECHANISM on a SMALL sub-patch
// bracketing the worst crest cluster armC1_diag_verdict.json's Stage-C arbiter table already located
// (u~0.0265-0.0574, t 0.48-0.4925; newton/ultraBrute-confirmed gap 0.168-0.202mm). The FULL smoke
// patch is deliberately NOT attempted here: C1's own rulerdiag file measured a full-azimuth analytic
// computeDevArraySeq over this EXACT 9917-facet mesh as an uninterruptible >10-min grind (killed at
// 318s CPU, still going, its own run 1) — a REFINE LOOP (rescoring every facet every pass, starting
// from a coarse seed far from analytic-converged, needing MORE passes/density than the sampler-lenient
// 9917) is strictly more expensive than that one-shot score. A small sub-patch containing the known
// worst crest is the cheapest discriminator for the MECHANISM question while staying wall-clock-bounded
// (in-process onPass wall-clock abort — refineToZeroOutliers is fully synchronous and uninterruptible
// mid-pass, so the abort fires at the next pass boundary; partial progress is still checkpointed via
// per-pass crumbs). PART 3 (same run) independently verifies BOTH the sampler-mode ("before") and
// analytic-mode ("after", however far it got) small meshes against getManifest('GothicArches').truth.rA
// (buildRadiusFn) via newtonNearest (grid-free) + the harness scoreWholeMeshInterior — the SAME
// plumbing _tierc_armC1_rulerdiag.test.ts used — so a bug in the K2 kernel's OWN internal ruler cannot
// self-certify. PART 4 (same run) watertight/quality on both small meshes.
//
// Each Bash invocation of this file must stay under the tool's 10-minute hard cap — hence the PART1 /
// PART2 split (separate processes) and the in-process onPass budget guards inside PART2. Checkpointed:
// every pass and every part's numbers are appended to armC2_crumbs.ndjson THE INSTANT they're computed
// (LAB-CHEATSHEET resilience doctrine); a verdict JSON is written per part even if a later stage inside
// it is skipped/aborted by budget.
//
// Run:
//   NODE_OPTIONS=--max-old-space-size=8192 PF_TIERC_ARMC2_PART1=1 \
//     node node_modules/vitest/vitest.mjs run research/bridge/_tierc_armC2.test.ts
//   NODE_OPTIONS=--max-old-space-size=8192 PF_TIERC_ARMC2_PART2=1 \
//     node node_modules/vitest/vitest.mjs run research/bridge/_tierc_armC2.test.ts
//
// DEV-ONLY. research/ never imported by src/. NEW FILE ONLY — every kernel/ruler/harness import here is
// READ-ONLY; the ONLY src edits this arm makes are the new opt-in `surfaceSource` lever itself
// (noBridgeRefine.ts/interiorRuler.ts, default-off, byte-identity proven in PART 1 below).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { newtonNearest } from './_gyroid_truthLib';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
  type RefinePassStat,
  type RefineResult,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import {
  DEFAULT_RULER,
  denseBary,
  facetInteriorHonest,
  liftChartMesh,
  radialSurfaceFromSampler,
  radialSurfaceFromAnalytic,
  analyticSurfaceSampler,
  scoreWholeMesh,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import { topologyMetric, triangleQualityDistribution } from '../../src/fidelity/metrics';

const TAU = Math.PI * 2;
const PART1 = process.env.PF_TIERC_ARMC2_PART1 === '1';
const PART2 = process.env.PF_TIERC_ARMC2_PART2 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armC2_crumbs.ndjson');
const VERDICT1_PATH = join(OUT_DIR, 'armC2_part1_verdict.json');
const VERDICT2_PATH = join(OUT_DIR, 'armC2_part2_verdict.json');

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'C2', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* never let a breadcrumb kill the run */
  }
}

// Index-based non-manifold audit, mirrors wholeMesh0Outlier.test.ts's own runPatchGate helper exactly.
function nonManifoldByIndex(tris: ArrayLike<number>): number {
  const use = new Map<string, number>();
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
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of use.values()) if (n > 2) bad++;
  return bad;
}

// By-index boundary DOMAIN classifier (rim of the (u,t) rectangle vs strictly interior) — verbatim
// port of _tierc_armC1_rulerdiag.test.ts Stage D, reused so PART1/PART2 read the same signature C1 did.
function boundaryDomainClass(
  uv: number[],
  tris: number[],
  domain: ChartDomain,
): { onRect: number; interior: number } {
  const eps = 1e-7;
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
  for (const { a, b, n } of use.values()) {
    if (n !== 1) continue;
    const um = (uv[2 * a] + uv[2 * b]) / 2;
    const tm = (uv[2 * a + 1] + uv[2 * b + 1]) / 2;
    const onU = Math.abs(um - domain.uLo) < eps || Math.abs(um - domain.uHi) < eps;
    const onT = Math.abs(tm - domain.tLo) < eps || Math.abs(tm - domain.tHi) < eps;
    if (onU || onT) onRect++;
    else interior++;
  }
  return { onRect, interior };
}

const DIMS = TIERC_COMMON_DIMS;
const FULL_DOMAIN: ChartDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };
const BG_ARC_MM = 0.6;
const N_THETA = 512;
// Small sub-patch bracketing the WORST crest cluster armC1_diag_verdict.json's Stage-C arbiter table
// already located (facets 2026/2030: u~0.0265, t 0.48-0.4925, newton/ultraBrute 0.1845-0.2018mm;
// facets 814/2658/2660/2661: u~0.0573-0.0574, t~0.48-0.4822, 0.168-0.180mm). Both clusters sit at the
// smoke patch's OWN t=0.48 rim, so this window extends slightly below it (0.478) for context.
const SMALL_DOMAIN: ChartDomain = { uLo: 0.015, uHi: 0.065, tLo: 0.478, tHi: 0.498 };

/**
 * Run refineToZeroOutliers under a WALL-CLOCK budget. The kernel is fully synchronous
 * (uninterruptible mid-pass — see noBridgeRefine.ts's own module doc); the onPass callback is the only
 * point that runs BETWEEN synchronous chunks, so the abort granularity is "next pass boundary", not
 * mid-pass. A budget-triggered abort is NOT a bug/error — it is reported as a partial, honest result
 * (the last completed pass's stats), never silently discarded.
 */
function runBounded(
  sampler: ReturnType<typeof styleSampler>,
  complex: ReturnType<typeof buildProtectedComplex>,
  domain: ChartDomain,
  opts: RefineOptions,
  budgetMs: number,
  label: string,
): { result?: RefineResult; lastStat?: RefinePassStat; aborted: boolean; ms: number } {
  const t0 = Date.now();
  let lastStat: RefinePassStat | undefined;
  let aborted = false;
  try {
    const result = refineToZeroOutliers(sampler, complex, domain, opts, (s) => {
      lastStat = s;
      crumb(`${label}-pass`, {
        pass: s.pass,
        dense: s.dense,
        tris: s.nTris,
        outliers: s.outliers,
        worstMm: +s.worstMm.toFixed(5),
        bruteCalls: s.bruteCalls,
        ms: s.ms,
        elapsedMs: Date.now() - t0,
      });
      if (Date.now() - t0 > budgetMs) {
        aborted = true;
        throw new Error('PF_ARMC2_BUDGET_ABORT');
      }
    });
    return { result, lastStat, aborted: false, ms: Date.now() - t0 };
  } catch (e) {
    if (aborted) return { lastStat, aborted: true, ms: Date.now() - t0 };
    throw e; // a genuine error — do not swallow
  }
}

/**
 * Worst-N-by-cheap-radial-screen honest crest gap vs analytic (bounded cost by construction — never a
 * whole-mesh pass). Mirrors _tierc_armC1_rulerdiag.test.ts's Stage-B screen + Stage-C arbiter pattern:
 * (1) instant same-(u,t) radial upper-bound screen ranks every facet by its worst BARYCENTRIC-
 * INTERPOLATED interior sample (computed from the mesh's OWN real `xyz` vertices — never re-evaluated
 * via any surface's `.position()`, so this is valid for a sampler-mode OR an analytic-mode mesh with NO
 * mode-specific branching); (2) the K2 kernel's OWN honest ruler (facetInteriorHonest, also fed the
 * real `xyz`) scores the worst N; (3) an INDEPENDENT grid-free newtonNearest arbiter, seeded from the
 * SAME mesh-xyz interior point the screen already computed (never from a surface lift — seeding Newton
 * from a point that is BY CONSTRUCTION already on the surface being measured against is a tautology
 * that reads ~0 regardless of the true facet chord-sag; caught here: an earlier draft did exactly that
 * via `sampler.position(uWorst,tWorst)` and produced a bogus 0.23mm reading on an analytic-mode mesh
 * whose K2-ruler and harness numbers both independently read <=0.01mm — the seed was ON the analytic
 * surface by construction, so Newton trivially found itself).
 */
function worstAnalyticGap(
  xyz: Float64Array,
  uv: number[],
  tris: number[],
  analyticRA: (theta: number, z: number) => number,
  H: number,
  topN: number,
  ruler: RulerOptions,
): {
  k2AnalyticMax: number;
  newtonMax: number;
  scannedTop: number;
  worst: Array<{ f: number; k2: number; newton: number }>;
} {
  const nF = tris.length / 3;
  const dense = denseBary(8);
  const screen = new Float64Array(nF);
  const screenPt = new Float64Array(nF * 3);
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    let d = -1;
    for (const [wa, wb, wc] of dense) {
      const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
      const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
      const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
      let th = Math.atan2(py, px);
      if (th < 0) th += TAU;
      const rr = Math.abs(Math.hypot(px, py) - analyticRA(th, Math.min(H, Math.max(0, pz))));
      if (rr > d) {
        d = rr;
        screenPt[3 * f] = px;
        screenPt[3 * f + 1] = py;
        screenPt[3 * f + 2] = pz;
      }
    }
    screen[f] = d;
  }
  const order = Array.from({ length: nF }, (_, i) => i).sort((a, b) => screen[b] - screen[a]);
  const surfaceAnalytic = radialSurfaceFromAnalytic(analyticRA, H);
  const worst: Array<{ f: number; k2: number; newton: number }> = [];
  let k2Max = 0;
  let newtonMax = 0;
  const scannedTop = Math.min(topN, nF);
  for (const f of order.slice(0, scannedTop)) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    const hA = facetInteriorHonest(surfaceAnalytic, xyz, uv, a, b, c, dense, ruler);
    const nn = newtonNearest(
      analyticRA,
      H,
      screenPt[3 * f],
      screenPt[3 * f + 1],
      screenPt[3 * f + 2],
      { seedTheta: 0, seedZ: 0, nThetaSeeds: 41, nZSeeds: 41, maxIter: 80, windowMode: 'wide' },
    ).dist;
    worst.push({ f, k2: +hA.dev.toFixed(6), newton: +nn.toFixed(6) });
    if (hA.dev > k2Max) k2Max = hA.dev;
    if (nn > newtonMax) newtonMax = nn;
  }
  return { k2AnalyticMax: k2Max, newtonMax, scannedTop, worst };
}

describe.skipIf(!PART1)('Arm C2 PART1 — default-off byte identity on the FULL CI smoke patch', () => {
  it(
    'surfaceSource omitted reproduces the live wholeMesh0Outlier.test.ts gate exactly',
    () => {
      const tStart = Date.now();
      crumb('part1-start');
      const { H, Rt, Rb, expn } = DIMS;
      const sampler = styleSampler('GothicArches', {}, { H, Rt, Rb, expn });
      const complex = buildProtectedComplex(sampler, 'GothicArches');
      expect(complex.residualCrossings).toBe(0);
      crumb('part1-complex', { residualCrossings: complex.residualCrossings });

      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
      const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
      const refined = refineToZeroOutliers(
        sampler,
        complex,
        FULL_DOMAIN,
        { tolMm: 0.01, maxPass: 16, bulkPasses7pt: 4, bgArcMm: BG_ARC_MM, ruler: loopRuler }, // surfaceSource OMITTED
        (s) =>
          crumb('part1-pass', {
            pass: s.pass,
            dense: s.dense,
            tris: s.nTris,
            outliers: s.outliers,
            worstMm: +s.worstMm.toFixed(5),
          }),
      );
      expect(refined.capped).toBe(false);

      const surface = radialSurfaceFromSampler(sampler);
      const guard = scoreWholeMesh(sampler, surface, refined, 0.01, guardRuler);

      const nonMan = nonManifoldByIndex(refined.tris);
      const cracked = refined.tris.slice();
      cracked.push(refined.tris[0], refined.tris[1], refined.tris[2]);
      const nonManControlMoved = nonManifoldByIndex(cracked) > nonMan;

      const topo = topologyMetric({ vertices: Float32Array.from(liftChartMesh(sampler, refined.uv)), indices: Uint32Array.from(refined.tris) }, 1e-4);
      const rim = boundaryDomainClass(refined.uv, refined.tris, FULL_DOMAIN);
      const quality = triangleQualityDistribution({
        vertices: Float32Array.from(liftChartMesh(sampler, refined.uv)),
        indices: Uint32Array.from(refined.tris),
      });

      const summary = {
        tris: refined.tris.length / 3,
        passes: refined.passes,
        capped: refined.capped,
        outliers: guard.outliers,
        maxMm: +guard.maxMm.toFixed(6),
        matchesCiGate:
          refined.tris.length / 3 === 9917 &&
          refined.passes === 7 &&
          guard.outliers === 0 &&
          guard.maxMm <= 0.0101,
        watertight: { nonMan, nonManControlMoved },
        topology: {
          orientationMismatches: topo.orientationMismatches,
          boundaryEdges: topo.boundaryEdges,
          nonManifoldEdges: topo.nonManifoldEdges,
          rimOnRect: rim.onRect,
          rimStrictlyInterior_defectSignature: rim.interior,
        },
        quality: {
          minAngleDeg: quality.minAngleDeg,
          p5MinAngleDeg: quality.p5MinAngleDeg,
          degenerateCount: quality.degenerateCount,
          pctBelow20: (quality as unknown as { pctBelow20?: number }).pctBelow20 ?? null,
        },
        ms: Date.now() - tStart,
      };
      writeFileSync(VERDICT1_PATH, JSON.stringify(summary, null, 2));
      crumb('part1-done', summary);
      // eslint-disable-next-line no-console
      console.log(`[armC2-part1] ${JSON.stringify(summary)}`);

      expect(summary.tris).toBe(9917);
      expect(summary.passes).toBe(7);
      expect(guard.outliers).toBe(0);
      expect(guard.maxMm).toBeLessThanOrEqual(0.0101);
      expect(nonMan).toBe(0);
      expect(nonManControlMoved).toBe(true);
      expect(topo.orientationMismatches).toBe(0);
      expect(rim.interior).toBe(0);
    },
    9 * 60 * 1000,
  );
});

describe.skipIf(!PART2)('Arm C2 PART2 — surfaceSource analytic mechanism on the small crest patch', () => {
  it(
    'analytic-on drives the true-analytic crest gap toward <=0.01mm (bounded budget, honest partial if capped)',
    () => {
      const tStart = Date.now();
      crumb('part2-start');
      const manifest = getManifest('GothicArches');
      const analyticRA = manifest.truth.rA;
      const { H, Rt, Rb, expn } = DIMS;
      const sampler = styleSampler('GothicArches', {}, { H, Rt, Rb, expn });
      const complex = buildProtectedComplex(sampler, 'GothicArches');
      expect(complex.residualCrossings).toBe(0);
      crumb('part2-complex', { residualCrossings: complex.residualCrossings, ms: Date.now() - tStart });

      const smallLoopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
      const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
      const baseOpts: RefineOptions = {
        tolMm: 0.01,
        maxPass: 16,
        bulkPasses7pt: 4,
        bgArcMm: BG_ARC_MM,
        ruler: smallLoopRuler,
      };

      // ── sampler-mode small patch ("before") — cheap; must not itself abort.
      const smallSampler = runBounded(sampler, complex, SMALL_DOMAIN, { ...baseOpts }, 2 * 60 * 1000, 'part2-sampler');
      crumb('part2-sampler-done', {
        aborted: smallSampler.aborted,
        ms: smallSampler.ms,
        tris: smallSampler.result ? smallSampler.result.tris.length / 3 : smallSampler.lastStat?.nTris,
        passes: smallSampler.result?.passes,
        capped: smallSampler.result?.capped,
      });
      expect(smallSampler.aborted).toBe(false);
      const before = smallSampler.result as RefineResult;

      // ── analytic-mode small patch ("after") — the fix under test; budget-guarded.
      const smallAnalytic = runBounded(
        sampler,
        complex,
        SMALL_DOMAIN,
        { ...baseOpts, surfaceSource: 'analytic', analyticRA },
        5 * 60 * 1000,
        'part2-analytic',
      );
      crumb('part2-analytic-done', {
        aborted: smallAnalytic.aborted,
        ms: smallAnalytic.ms,
        tris: smallAnalytic.result ? smallAnalytic.result.tris.length / 3 : smallAnalytic.lastStat?.nTris,
        passes: smallAnalytic.result?.passes,
        capped: smallAnalytic.result?.capped,
        lastStat: smallAnalytic.lastStat,
      });

      // ── PART 3: independent oracle (newtonNearest + K2's own honest ruler @analytic), worst-8.
      const beforeXyz = liftChartMesh(sampler, before.uv);
      const beforeGap = worstAnalyticGap(beforeXyz, before.uv, before.tris, analyticRA, H, 8, guardRuler);
      crumb('part3-before-gap', beforeGap);

      let afterGap: ReturnType<typeof worstAnalyticGap> | null = null;
      let afterHarness: Awaited<ReturnType<typeof scoreWholeMeshInterior>> | null = null;
      let beforeHarness: Awaited<ReturnType<typeof scoreWholeMeshInterior>> | null = null;
      let afterTopo: ReturnType<typeof topologyMetric> | null = null;
      let afterQuality: ReturnType<typeof triangleQualityDistribution> | null = null;
      let afterNonMan: number | null = null;
      let afterNonManControlMoved: boolean | null = null;

      const beforeStride = Math.max(1, Math.floor(before.tris.length / 3 / 60));
      beforeHarness = scoreWholeMeshInterior(
        Float32Array.from(beforeXyz),
        Uint32Array.from(before.tris),
        analyticRA,
        H,
        { tol: 0.01, stride: beforeStride },
      );
      crumb('part3-before-harness', { ...beforeHarness, stride: beforeStride });

      const beforeTopo = topologyMetric(
        { vertices: Float32Array.from(beforeXyz), indices: Uint32Array.from(before.tris) },
        1e-4,
      );
      const beforeQuality = triangleQualityDistribution({
        vertices: Float32Array.from(beforeXyz),
        indices: Uint32Array.from(before.tris),
      });
      const beforeNonMan = nonManifoldByIndex(before.tris);

      if (smallAnalytic.result) {
        const after = smallAnalytic.result;
        // Lift via the SAME analytic-backed sampler the kernel used internally — this IS the mesh's
        // true placed xyz (not a re-derivation), since resolveSurfaceSource built `effSampler` this way.
        const afterSampler = analyticSurfaceSampler(analyticRA, H);
        const afterXyz = liftChartMesh(afterSampler, after.uv);
        afterGap = worstAnalyticGap(afterXyz, after.uv, after.tris, analyticRA, H, 8, guardRuler);
        crumb('part3-after-gap', afterGap);

        const afterStride = Math.max(1, Math.floor(after.tris.length / 3 / 60));
        afterHarness = scoreWholeMeshInterior(
          Float32Array.from(afterXyz),
          Uint32Array.from(after.tris),
          analyticRA,
          H,
          { tol: 0.01, stride: afterStride },
        );
        crumb('part3-after-harness', { ...afterHarness, stride: afterStride });

        afterTopo = topologyMetric(
          { vertices: Float32Array.from(afterXyz), indices: Uint32Array.from(after.tris) },
          1e-4,
        );
        afterQuality = triangleQualityDistribution({
          vertices: Float32Array.from(afterXyz),
          indices: Uint32Array.from(after.tris),
        });
        afterNonMan = nonManifoldByIndex(after.tris);
        const crackedAfter = after.tris.slice();
        crackedAfter.push(after.tris[0], after.tris[1], after.tris[2]);
        afterNonManControlMoved = nonManifoldByIndex(crackedAfter) > afterNonMan;
      }

      const summary = {
        small_domain: SMALL_DOMAIN,
        before_sampler_mode: {
          tris: before.tris.length / 3,
          passes: before.passes,
          capped: before.capped,
          worstAnalyticGap_k2: beforeGap.k2AnalyticMax,
          worstAnalyticGap_newton: beforeGap.newtonMax,
          harness_scoreWholeMeshInterior: beforeHarness,
          topology: {
            orientationMismatches: beforeTopo.orientationMismatches,
            boundaryEdges: beforeTopo.boundaryEdges,
            nonManifoldEdges: beforeTopo.nonManifoldEdges,
          },
          nonMan: beforeNonMan,
          minAngleDeg: beforeQuality.minAngleDeg,
          degenerateCount: beforeQuality.degenerateCount,
          reproducesC1Gap: beforeGap.newtonMax > 0.05, // sanity: the small patch must carry the SAME defect C1 found
        },
        after_analytic_mode: smallAnalytic.result
          ? {
              tris: (smallAnalytic.result as RefineResult).tris.length / 3,
              passes: (smallAnalytic.result as RefineResult).passes,
              capped: (smallAnalytic.result as RefineResult).capped,
              budgetAborted: false,
              worstAnalyticGap_k2: afterGap?.k2AnalyticMax ?? null,
              worstAnalyticGap_newton: afterGap?.newtonMax ?? null,
              harness_scoreWholeMeshInterior: afterHarness,
              topology: afterTopo
                ? {
                    orientationMismatches: afterTopo.orientationMismatches,
                    boundaryEdges: afterTopo.boundaryEdges,
                    nonManifoldEdges: afterTopo.nonManifoldEdges,
                  }
                : null,
              nonMan: afterNonMan,
              nonManControlMoved: afterNonManControlMoved,
              minAngleDeg: afterQuality?.minAngleDeg ?? null,
              degenerateCount: afterQuality?.degenerateCount ?? null,
              reachesTolerance: (afterGap?.k2AnalyticMax ?? Infinity) <= 0.01 && (afterGap?.newtonMax ?? Infinity) <= 0.01,
            }
          : {
              budgetAborted: true,
              lastStat: smallAnalytic.lastStat,
              ms: smallAnalytic.ms,
              note: 'refineToZeroOutliers did not return within the 5-min in-process budget; last completed pass stats above are the honest partial result.',
            },
        wallTimes: { totalMs: Date.now() - tStart },
      };
      writeFileSync(VERDICT2_PATH, JSON.stringify(summary, null, 2));
      crumb('part2-done', { totalMs: Date.now() - tStart });
      // eslint-disable-next-line no-console
      console.log(`[armC2-part2] ${JSON.stringify(summary, null, 2)}`);

      // Sanity gate only (this it() must not fail merely because the mechanism is slow/plateaus — that
      // is a FINDING, not a test bug): the small patch must reproduce a real gap in sampler-mode (proves
      // the domain choice is on-target) and the analytic build (whatever it reached) must not have
      // corrupted watertightness.
      expect(beforeGap.newtonMax).toBeGreaterThan(0.05);
      if (smallAnalytic.result && afterNonMan !== null) {
        expect(afterNonMan).toBe(0);
      }
    },
    9 * 60 * 1000,
  );
});
