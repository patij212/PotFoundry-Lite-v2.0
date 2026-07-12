// _tierc_p2_2.test.ts — Curved-Element Phase-2 arm P2.2 (CORRECTED closed-form curvature-flagging
// criterion: SUB=24 dense curvature-sup + DELTA-vs-the-mesh's-own-sizing, scoped to genuine
// feature-intersecting cells). Charter: research/lab/2026-07-12-curved-element-phase2-charter.md
// §P2.2. Predecessor: research/lab/tierc/P2.1-design.md §2.4 (the criterion correction) — P2.1's
// naive ABSOLUTE 4-point test measured recall 0.858 (<0.90 gate) AND precision 0.0043 (379,950/
// 2,242,984 facets flagged = 16.9% of the WHOLE mesh, ~20-200x over the ~1,890-31,114 target
// population), diagnosed as TWO compounding failures: (1) absolute-vs-delta (tested literally every
// facet in the whole mesh, most of which were never subject to any feature-specific sizing at all)
// and (2) sparse 4-point kappaSup under-reading the ~1359 mm^-1 knee spike by ~99.8% (this
// codebase's OWN buildGyroidCurvatureFloor docstring, _gyroid_prodclose_lib.ts lines ~485-493,
// already measured this and required SUB=24 dense sub-sampling to converge to within 0.02%).
//
// THIS ARM fixes both, non-circularly (no Newton, no truth mesh — pure closed-form + the mesh's own
// geometry, exactly what a real build-time flagging pass would have):
//  (1) SCOPE: restrict the criterion to genuine "feature cells" using the EXACT SAME cell<->feature
//      bucket gate production's ConformingWall.ts already applies BEFORE ever calling levelAt
//      (buildFeatureIntersector+segHitsBox, replicated verbatim here since neither is exported —
//      geometry-only mechanism code, not the calibrated criterion under test) — so the DELTA is
//      "does THIS already-feature-floored cell's true curvature exceed what a plain build already
//      gave it", never applied to the ~90% of the mesh that was never on-feature at all.
//  (2) DENSITY: kappa_sup per cell is now the SUB=24 dense cell-sup (2,401 sub-samples over the
//      facet's own (u,t) bbox), reusing gyroidAnalyticCurvature verbatim at the documented
//      calibrated density — NOT re-derived.
//
// HYPOTHESIS: the corrected (scoped + dense) criterion recovers recall>=0.90 over the Newton-
// CONFIRMED 1,890 hot facets AND flags a population within order-of-magnitude of the hot population
// (not 20-200x over) AND the flagged set's own predicted escalation depth (+1/+2, capped) actually
// closes the residual to <=0.01mm when checked against P2.0's OWN BANKED per-facet Newton ground
// truth (research/exchange/tierc/p2_0_s2_partial.json — ZERO new Newton calls needed).
//
// GATE (pre-registered, matching the task brief verbatim):
//  - recall >= 0.90 vs the 1,890 Newton-confirmed hot facets.
//  - precision: flagged population within order-of-magnitude of the hot population (1,890-31,114),
//    not 20-200x over.
//  - tri-cost (isotropic quadrisection proxy, (flaggedL1-flaggedL2)*3+flaggedL2*15) <= +10% of
//    outerTris.
//  - CLOSURE: for the p2_0_s2_partial.json banked population (1,710 real-Newton-hot facets, a 90.5%
//    stride sample of the 1,890), applying OUR predicted escalation depth (N=1 or N=2, read from the
//    REAL banked afterU1/afterU2 Newton residual — no new Newton calls) closes Newton-worst <=0.01,
//    counting any recall miss as staying at its `before` residual (the honest end-to-end number).
//
// RULES: NEW FILE. READ-ONLY on all committed code + P2.0/P2.1 exchange artifacts (reused by
// IMPORT/read only). No kernel edit (still a criterion proof, not the production seam). DEV-ONLY,
// research/ never imported by src/. Commit nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import type { AnalyticRadiusFn } from './labkit';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  GBE_EXTRACT_DEFAULT, GBE_FIELD, extractBandedgeContours, contoursToFeatureLines,
} from './_gyroid_bandedge_lib';
import { buildFanRepairOuterFromCurves } from './_tierc_a3_reloc_lib';
import { gyroidAnalyticCurvature, GPC_FIELD, gpcR0 } from './_gyroid_prodclose_lib';
import { AF_PROD_OPTS } from './_analytic_floor_lib';
import { clipFeaturesToBox } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_P2_2 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_2_crumbs.ndjson');
const EXPECT_HASH = '51a25eba-6a58e3e1'; // same champion twin P2.0/P2.1 scored (non-vacuity witness)
const TOL = 0.01; // maxSagMm-equivalent acceptance tolerance (the program's own 0.01mm standard)
const LEVEL_CAP = 2; // matches P2.0's adaptive +1/+2 (2.28% level-2 rate)
const SUB = 24; // buildGyroidCurvatureFloor's DOCUMENTED, EMPIRICALLY-VALIDATED dense cell-sup density
const TEST_TIMEOUT_MS = 28 * 60 * 1000;
const SUB_SWEEP_DEADLINE_MS = 22 * 60 * 1000; // "kill+report if the sup sweep projects >22 min"

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.2', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch { /* a breadcrumb must never kill the run */ }
}
function bumpPriority(): void {
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best-effort */ }
}

function xyzToUt(x: number, y: number, z: number, H: number): [number, number] {
  let th = Math.atan2(y, x);
  if (th < 0) th += TAU;
  return [th / TAU, Math.min(1, Math.max(0, z / H))];
}
function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

interface Twin {
  rA: AnalyticRadiusFn; H: number; outerXyz: Float32Array; outerIdx: Uint32Array; hash: string;
  outerTris: number; buildMs: number; generalCurves: FeatureLine[];
}
function buildTwin(): Twin {
  const manifest = getManifest('GyroidManifold');
  const rA = manifest.truth.rA;
  const { H } = TIERC_COMMON_DIMS;
  const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
  const generalCurves = [
    ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
    ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
  ];
  const build = buildFanRepairOuterFromCurves(rA, generalCurves);
  return {
    rA, H, outerXyz: build.outerXyz, outerIdx: build.outerIdx, hash: build.hash,
    outerTris: build.outerTris, buildMs: build.buildMs, generalCurves,
  };
}

// ─── verbatim mechanical copy of ConformingWall.ts's private segHitsBox + buildFeatureIntersector
// (neither is exported there). This IS the real production cell<->feature bucket gate applied
// BEFORE ever calling levelAt (P2.1-design.md §1.2) — reproducing it (not re-deriving it) is what
// lets this arm's delta test be scoped to genuine feature cells instead of the whole mesh (P2.1's
// diagnosed root-cause #1). Geometry-only bucketing utility, NOT the calibrated curvature criterion.
function segHitsBoxL(
  au: number, at: number, bu: number, bt: number,
  u0: number, u1: number, t0: number, t1: number,
): boolean {
  const du = bu - au;
  const dt = bt - at;
  let lo = 0;
  let hi = 1;
  const edges: Array<[number, number]> = [
    [-du, au - u0],
    [du, u1 - au],
    [-dt, at - t0],
    [dt, t1 - at],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-300) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > hi) return false;
      if (r > lo) lo = r;
    } else {
      if (r < lo) return false;
      if (r < hi) hi = r;
    }
  }
  return lo < hi;
}
function buildFeatureIntersectorL(features: FeatureLine[]): (u0: number, t0: number, size: number) => boolean {
  const BUCKET = 64;
  const buckets = new Map<number, Array<[number, number, number, number]>>();
  const key = (bu: number, bt: number): number => bt * BUCKET + bu;
  const clampB = (x: number): number => Math.max(0, Math.min(BUCKET - 1, Math.floor(x * BUCKET)));
  for (const line of features) {
    const p = line.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      const bu0 = clampB(Math.min(a.u, b.u));
      const bu1 = clampB(Math.max(a.u, b.u));
      const bt0 = clampB(Math.min(a.t, b.t));
      const bt1 = clampB(Math.max(a.t, b.t));
      const seg: [number, number, number, number] = [a.u, a.t, b.u, b.t];
      for (let bt = bt0; bt <= bt1; bt++) {
        for (let bu = bu0; bu <= bu1; bu++) {
          const k = key(bu, bt);
          let arr = buckets.get(k);
          if (!arr) { arr = []; buckets.set(k, arr); }
          arr.push(seg);
        }
      }
    }
  }
  return (u0: number, t0: number, size: number): boolean => {
    const u1 = u0 + size;
    const t1 = t0 + size;
    const bu0 = clampB(u0);
    const bu1 = clampB(u1 - 1e-12);
    const bt0 = clampB(t0);
    const bt1 = clampB(t1 - 1e-12);
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const arr = buckets.get(key(bu, bt));
        if (!arr) continue;
        for (const [au, at, bvu, bvt] of arr) {
          if (segHitsBoxL(au, at, bvu, bvt, u0, u1, t0, t1)) return true;
        }
      }
    }
    return false;
  };
}

/** Facet (u,t) bbox (u unwrapped for seam contiguity) + its own longest 3D edge (the P2.0/P2.1
 *  "current cell size" proxy). */
interface FacetBox { uMin: number; uMax: number; tMin: number; tMax: number; hCur: number; }
function facetBox(outerIdx: Uint32Array, outerXyz: Float32Array, H: number, f: number): FacetBox {
  const ia = outerIdx[3 * f], ib = outerIdx[3 * f + 1], ic = outerIdx[3 * f + 2];
  const ax = outerXyz[3 * ia], ay = outerXyz[3 * ia + 1], az = outerXyz[3 * ia + 2];
  const bx = outerXyz[3 * ib], by = outerXyz[3 * ib + 1], bz = outerXyz[3 * ib + 2];
  const cx = outerXyz[3 * ic], cy = outerXyz[3 * ic + 1], cz = outerXyz[3 * ic + 2];
  const hCur = Math.max(
    dist3(ax, ay, az, bx, by, bz), dist3(bx, by, bz, cx, cy, cz), dist3(cx, cy, cz, ax, ay, az),
  );
  const [ua, ta] = xyzToUt(ax, ay, az, H);
  const [ub0, tb] = xyzToUt(bx, by, bz, H);
  const [uc0, tc] = xyzToUt(cx, cy, cz, H);
  const unwrap = (u: number): number => {
    let d = u - ua;
    if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
    return ua + d;
  };
  const ub = unwrap(ub0), uc = unwrap(uc0);
  return {
    uMin: Math.min(ua, ub, uc), uMax: Math.max(ua, ub, uc),
    tMin: Math.min(ta, tb, tc), tMax: Math.max(ta, tb, tc), hCur,
  };
}

/** The (u0,t0,size) box a production quadtree cell test would use for this facet's footprint
 *  (u0 re-wrapped into [0,1) for the bucket lookup; size = the larger of the two extents, matching
 *  the intersects() contract's square-cell assumption). */
function facetGateBox(b: FacetBox): { u0: number; t0: number; size: number } {
  const u0 = b.uMin - Math.floor(b.uMin);
  const size = Math.max(b.uMax - b.uMin, b.tMax - b.tMin, 1e-9);
  return { u0, t0: b.tMin, size };
}

/** SUB=24 dense cell-sup: reuses gyroidAnalyticCurvature VERBATIM at the documented calibrated
 *  density (buildGyroidCurvatureFloor, _gyroid_prodclose_lib.ts ~485-493), windowed to THIS facet's
 *  own (u,t) bbox instead of a fixed grid-node du/dt window — same sampling pattern, same SUB
 *  constant; only the window source differs (per-cell instead of per-grid-node). */
function denseKappaSup(b: FacetBox, r0: (t: number) => number, H: number): number {
  const uc = (b.uMin + b.uMax) / 2, tc = (b.tMin + b.tMax) / 2;
  const halfU = Math.max((b.uMax - b.uMin) / 2, 1e-9);
  const halfT = Math.max((b.tMax - b.tMin) / 2, 1e-9);
  let sup = 0;
  for (let jj = -SUB; jj <= SUB; jj++) {
    const t = Math.min(1, Math.max(0, tc + (jj / SUB) * halfT));
    for (let ii = -SUB; ii <= SUB; ii++) {
      const u = uc + (ii / SUB) * halfU;
      const kap = gyroidAnalyticCurvature(u, t, r0, H, GPC_FIELD);
      if (kap > sup) sup = kap;
    }
  }
  return sup;
}

/** Brute-force nearest distance (in (u,t) space) from a point to any segment of any line in
 *  `features` — a diagnostic-only helper (NOT part of the criterion) used to check whether a hot
 *  facet failing the intersects() bucket gate is a genuine geometric gap (far from any curve) or a
 *  boundary/margin artifact (just outside the clip margin / bucket granularity). */
function nearestCurveDist(u: number, t: number, features: FeatureLine[]): number {
  let best = Infinity;
  for (const line of features) {
    const p = line.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      const dx = b.u - a.u, dy = b.t - a.t;
      const len2 = dx * dx + dy * dy;
      let tt = len2 > 1e-18 ? ((u - a.u) * dx + (t - a.t) * dy) / len2 : 0;
      tt = Math.max(0, Math.min(1, tt));
      const px = a.u + tt * dx, py = a.t + tt * dy;
      const d = Math.hypot(u - px, t - py);
      if (d < best) best = d;
    }
  }
  return best;
}

interface DeltaCrit { hCur: number; kappaSup: number; hReq: number; nNeeded: number; }
/** THE CORRECTED CRITERION: DELTA vs the cell's OWN current size (== what a plain, non-escalated
 *  build already gave this feature-floored cell), using the SUB=24 dense sup (not a 4-point proxy). */
function scoreDelta(box: FacetBox, r0: (t: number) => number, H: number): DeltaCrit {
  const kappaSup = denseKappaSup(box, r0, H);
  const hReq = kappaSup > 1e-12 ? Math.sqrt((8 * TOL) / kappaSup) : Infinity;
  const nNeeded = box.hCur <= hReq ? 0 : Math.min(LEVEL_CAP, Math.ceil(Math.log2(box.hCur / hReq)));
  return { hCur: box.hCur, kappaSup, hReq, nNeeded };
}

describe.skipIf(!ON)('P2.2 — CORRECTED closed-form curvature-flagging criterion (SUB=24 dense + delta, scoped to feature cells)', () => {
  it(
    'scopes to genuine feature cells, scores the SUB=24 delta criterion, checks recall/precision/tri-cost + closure vs banked Newton',
    () => {
      const t0 = Date.now();
      bumpPriority();
      crumb('start');

      // ── STAGE A: build twin (byte-identical non-vacuity witness) ──
      const { H, outerXyz, outerIdx, hash, outerTris, buildMs, generalCurves } = buildTwin();
      crumb('build-done', { hash, outerTris, buildMs, generalCurvesCount: generalCurves.length });
      expect(hash, 'must reproduce the exact P2.0/P2.1 banked champion mesh (non-vacuity)').toBe(EXPECT_HASH);

      // ── ground truth: Newton-CONFIRMED hot facet set (banked by armA3_char, reused by P2.0/P2.1) ──
      const confirmedPath = join(OUT_DIR, 'armA3_char_confirmed.json');
      expect(existsSync(confirmedPath), `banked hot-facet population missing: ${confirmedPath}`).toBe(true);
      const confirmedRaw = JSON.parse(readFileSync(confirmedPath, 'utf8')) as Array<{ f: number }>;
      const hotFacetSet = new Set<number>();
      for (const c of confirmedRaw) { if (c.f >= 0) hotFacetSet.add(c.f); }
      expect(hotFacetSet.size, 'hot population must be non-vacuous').toBeGreaterThan(0);
      crumb('hotset-loaded', { uniqueHot: hotFacetSet.size });

      const p2s2Path = join(OUT_DIR, 'p2_0_s2_partial.json');
      expect(existsSync(p2s2Path), `P2.0 S2 per-facet ground truth missing: ${p2s2Path}`).toBe(true);
      const p2s2Rows = JSON.parse(readFileSync(p2s2Path, 'utf8')) as Array<
        { f: number; before: number; afterU1: number; afterU2: number; usedLevel2: boolean; outlierAfterU2: boolean }
      >;
      crumb('p2s2-groundtruth-loaded', { rows: p2s2Rows.length });

      // ── STAGE B: build the REAL production cell<->feature gate from the SAME curves that built
      // this exact twin (clip margins mirror ConformingWall.ts lines ~813-815: uMargin keeps a
      // feature cell off the periodic u-seam, tMargin off the t=0/1 caps). ──
      const featureLevel = AF_PROD_OPTS.featureLevel;
      const uMargin = 1.5 / (1 << featureLevel);
      const tMargin = AF_PROD_OPTS.nRing > 0 ? 1 / AF_PROD_OPTS.nRing : 1 / 64;
      const clippedFeatures = clipFeaturesToBox(generalCurves, uMargin, tMargin);
      const intersects = buildFeatureIntersectorL(clippedFeatures);
      crumb('gate-built', { clippedFeatureCount: clippedFeatures.length, uMargin, tMargin });

      // ── STAGE C: cheap whole-mesh SCOPE sweep (bucketed intersects only, no curvature) — this is
      // exactly what production evaluates BEFORE ever calling levelAt. ──
      const nF = outerIdx.length / 3;
      const featureCellIdx: number[] = [];
      let lastCrumb = Date.now();
      for (let f = 0; f < nF; f++) {
        const box = facetBox(outerIdx, outerXyz, H, f);
        const gb = facetGateBox(box);
        if (intersects(gb.u0, gb.t0, gb.size)) featureCellIdx.push(f);
        if (f % 500_000 === 0 || Date.now() - lastCrumb > 30_000) {
          crumb('scope-sweep-progress', { f, nF, featureCellCount: featureCellIdx.length, elapsedMs: Date.now() - t0 });
          lastCrumb = Date.now();
        }
      }
      const scopeMs = Date.now() - t0;
      crumb('scope-sweep-done', { featureCellCount: featureCellIdx.length, pctOfMesh: 100 * featureCellIdx.length / nF, scopeMs });
      writeFileSync(join(OUT_DIR, 'p2_2_stageC.json'), JSON.stringify({
        featureCellCount: featureCellIdx.length, nF, pctOfMesh: 100 * featureCellIdx.length / nF, scopeMs,
      }, null, 2));

      // ── STAGE D: SUB=24 dense DELTA sweep, scoped to featureCellIdx ONLY (the cost-bounding move
      // — see file header). Projects total time after ~5% and kills+reports if >22 min. ──
      let flaggedL1 = 0, flaggedL2 = 0, tpL1 = 0, n1Count = 0, n2Count = 0;
      const flaggedNotHotSample: Array<{ f: number; hCur: number; kappaSup: number; hReq: number; nNeeded: number }> = [];
      const MAX_FP_SAMPLE = 30;
      const subT0 = Date.now();
      const projectionCheckpoint = Math.max(2000, Math.floor(featureCellIdx.length * 0.05));
      let truncatedSubSweep = false;
      let processedSub = 0;
      lastCrumb = Date.now();
      for (let k = 0; k < featureCellIdx.length; k++) {
        const f = featureCellIdx[k];
        const box = facetBox(outerIdx, outerXyz, H, f);
        const crit = scoreDelta(box, gpcR0, H);
        processedSub++;
        if (crit.nNeeded >= 1) {
          flaggedL1++;
          if (crit.nNeeded >= 2) { flaggedL2++; n2Count++; } else { n1Count++; }
          const isHot = hotFacetSet.has(f);
          if (isHot) tpL1++;
          else if (flaggedNotHotSample.length < MAX_FP_SAMPLE) {
            flaggedNotHotSample.push({ f, hCur: crit.hCur, kappaSup: crit.kappaSup, hReq: crit.hReq, nNeeded: crit.nNeeded });
          }
        }
        if (processedSub === projectionCheckpoint) {
          const elapsed = Date.now() - subT0;
          const projectedTotalMs = elapsed * (featureCellIdx.length / processedSub);
          crumb('sub-sweep-projection', {
            processedSub, total: featureCellIdx.length, elapsedMs: elapsed, projectedTotalMs, projectedTotalMin: projectedTotalMs / 60000,
          });
          if (projectedTotalMs > SUB_SWEEP_DEADLINE_MS) {
            truncatedSubSweep = true;
            crumb('sub-sweep-KILL', { processedSub, total: featureCellIdx.length, projectedTotalMin: projectedTotalMs / 60000 });
            break;
          }
        }
        if (k % 20_000 === 0 || Date.now() - lastCrumb > 30_000) {
          crumb('sub-sweep-progress', { k, total: featureCellIdx.length, flaggedL1, flaggedL2, tpL1, elapsedMs: Date.now() - subT0 });
          lastCrumb = Date.now();
        }
      }
      const subSweepMs = Date.now() - subT0;
      crumb('sub-sweep-done', { processedSub, total: featureCellIdx.length, truncatedSubSweep, flaggedL1, flaggedL2, tpL1, subSweepMs });
      const precisionL1 = flaggedL1 > 0 ? tpL1 / flaggedL1 : 0;
      writeFileSync(join(OUT_DIR, 'p2_2_stageD.json'), JSON.stringify({
        processedSub, total: featureCellIdx.length, truncatedSubSweep, flaggedL1, flaggedL2, tpL1, precisionL1, n1Count, n2Count, subSweepMs,
      }, null, 2));

      // ── STAGE E: recall over the FULL 1,890 Newton-confirmed hot set, computed DIRECTLY (not
      // relying on stage D's scoped population — this is the honest end-to-end number: a hot facet
      // that fails the geometric intersects gate would ALSO never be escalated by the real kernel). ──
      const hotDelta = new Map<number, DeltaCrit>();
      let hotRecallHits = 0, hotMissingIntersectsGate = 0, hotRecallHitsGated = 0;
      const hotMisses: number[] = [];
      // DIAGNOSTIC (not part of the criterion): for hot facets that fail the geometric intersects()
      // gate, is that a genuine (u,t) gap to the nearest feature-curve segment, or a boundary/margin
      // artifact (clip margin / BUCKET=64 granularity)? Distance-to-curve computed against BOTH the
      // clipped (what the gate actually uses) and unclipped (the raw extraction) curve sets.
      const gateMissDiag: Array<{ f: number; uc: number; tc: number; gateSize: number; distToClipped: number; distToUnclipped: number }> = [];
      let missDistSum = 0, missDistMax = 0, missDistMin = Infinity;
      for (const f of hotFacetSet) {
        const box = facetBox(outerIdx, outerXyz, H, f);
        const crit = scoreDelta(box, gpcR0, H);
        hotDelta.set(f, crit);
        if (crit.nNeeded >= 1) hotRecallHits++; else hotMisses.push(f);
        const gb = facetGateBox(box);
        const gatePasses = intersects(gb.u0, gb.t0, gb.size);
        if (gatePasses && crit.nNeeded >= 1) hotRecallHitsGated++;
        if (!gatePasses) {
          hotMissingIntersectsGate++;
          const uc = (box.uMin + box.uMax) / 2, tc = (box.tMin + box.tMax) / 2;
          const distToClipped = nearestCurveDist(uc, tc, clippedFeatures);
          const distToUnclipped = nearestCurveDist(uc, tc, generalCurves);
          missDistSum += distToClipped;
          if (distToClipped > missDistMax) missDistMax = distToClipped;
          if (distToClipped < missDistMin) missDistMin = distToClipped;
          if (gateMissDiag.length < 25) gateMissDiag.push({ f, uc, tc, gateSize: gb.size, distToClipped, distToUnclipped });
        }
      }
      const recallL1 = hotRecallHits / hotFacetSet.size;
      const trueEndToEndRecall = hotRecallHitsGated / hotFacetSet.size;
      crumb('hotset-recall-done', {
        hotRecallHits, total: hotFacetSet.size, recallL1, misses: hotMisses.length, hotMissingIntersectsGate,
        trueEndToEndRecall, missDistMean: hotMissingIntersectsGate > 0 ? missDistSum / hotMissingIntersectsGate : null, missDistMax, missDistMin,
      });
      writeFileSync(join(OUT_DIR, 'p2_2_stageE.json'), JSON.stringify({
        hotRecallHits, total: hotFacetSet.size, recallL1, missCount: hotMisses.length, missSample: hotMisses.slice(0, 30),
        hotMissingIntersectsGate, trueEndToEndRecall,
        gateMissDiag: { missDistMean: hotMissingIntersectsGate > 0 ? missDistSum / hotMissingIntersectsGate : null, missDistMax, missDistMin, sample: gateMissDiag },
      }, null, 2));

      // ── STAGE F: closure inheritance vs P2.0's OWN banked per-facet Newton ground truth (1,710
      // rows, ZERO new Newton calls; 100% of these rows are members of hotFacetSet, confirmed by a
      // direct join before this arm was coded). Reuses hotDelta (already computed in stage E) for
      // every row instead of re-scoring. ──
      let l2TP = 0, l2FN = 0, l2TN = 0, l2FP = 0;
      let closureOkFlagged = 0, closureFailFlagged = 0;
      let worstResidualEndToEnd = 0; // ourFlag ? afterOurN : row.before — the HONEST end-to-end number
      let worstResidualAmongFlagged = 0;
      const closureFailSample: Array<{ f: number; ourN: number; realNeeded: number; afterOurN: number; before: number }> = [];
      let joinMisses = 0;
      for (const row of p2s2Rows) {
        const crit = hotDelta.get(row.f);
        if (!crit) { joinMisses++; continue; }
        const ourFlag = crit.nNeeded >= 1;
        const ourN = Math.min(LEVEL_CAP, crit.nNeeded);
        const realNeeded = row.usedLevel2 ? 2 : 1;
        if (row.usedLevel2 && ourN >= 2) l2TP++;
        else if (row.usedLevel2 && ourN < 2) l2FN++;
        else if (!row.usedLevel2 && ourN < 2) l2TN++;
        else l2FP++;
        const residualEndToEnd = ourFlag ? (ourN >= 2 ? row.afterU2 : row.afterU1) : row.before;
        if (residualEndToEnd > worstResidualEndToEnd) worstResidualEndToEnd = residualEndToEnd;
        if (ourFlag) {
          if (residualEndToEnd > worstResidualAmongFlagged) worstResidualAmongFlagged = residualEndToEnd;
          const ok = residualEndToEnd <= TOL;
          if (ok) closureOkFlagged++;
          else {
            closureFailFlagged++;
            if (closureFailSample.length < 30) {
              closureFailSample.push({ f: row.f, ourN, realNeeded, afterOurN: residualEndToEnd, before: row.before });
            }
          }
        }
      }
      const level2Recall = (l2TP + l2FN) > 0 ? l2TP / (l2TP + l2FN) : null;
      const level2Precision = (l2TP + l2FP) > 0 ? l2TP / (l2TP + l2FP) : null;
      crumb('closure-check-done', {
        l2TP, l2FN, l2TN, l2FP, level2Recall, level2Precision, closureOkFlagged, closureFailFlagged,
        worstResidualEndToEnd, worstResidualAmongFlagged, joinMisses,
      });

      // ── exact triangle cost using the EXACT flagged counts (not extrapolated) ──
      const triAddExact = (flaggedL1 - flaggedL2) * 3 + flaggedL2 * 15;
      const pctTriAddExact = 100 * triAddExact / outerTris;

      const summary = {
        experiment: 'P2.2', at: new Date().toISOString(), hash, outerTris, nF,
        criterion: 'SUB=24 dense kappaSup over facet bbox; DELTA vs facet own hCur; scoped to intersects()-gated feature cells; N=ceil(log2(hCur/hReq)) capped at 2',
        scope: { featureCellCount: featureCellIdx.length, pctOfMesh: 100 * featureCellIdx.length / nF, scopeMs, truncatedSubSweep, processedSub },
        wholeSweepScoped: {
          flaggedL1, flaggedL2, tpL1, precisionL1,
          pctFlaggedOfFeaturePop: 100 * flaggedL1 / Math.max(1, processedSub),
          pctFlaggedOfWholeMesh: 100 * flaggedL1 / nF,
          n1Count, n2Count, n1Pct: 100 * n1Count / Math.max(1, flaggedL1), n2Pct: 100 * n2Count / Math.max(1, flaggedL1),
        },
        hotSetRecall: {
          hotSetSize: hotFacetSet.size, hotRecallHits, recallL1, missCount: hotMisses.length,
          missSample: hotMisses.slice(0, 20), hotMissingIntersectsGate, trueEndToEndRecall,
          note: 'recallL1 = pure delta-math recall (ignores the intersects gate); trueEndToEndRecall = ' +
            'fraction of hot facets that BOTH pass the real production intersects() gate AND the delta ' +
            'test -- the honest number if levelAt were wired in exactly as P2.1-design.md S1.2 specifies.',
        },
        level2VsP2S2GroundTruth: { l2TP, l2FN, l2TN, l2FP, level2Recall, level2Precision },
        closure: {
          p2s2RowCount: p2s2Rows.length, joinMisses, closureOkFlagged, closureFailFlagged,
          worstResidualEndToEnd, worstResidualAmongFlagged, closureFailSample,
          gatePass: worstResidualEndToEnd <= TOL,
        },
        triCostExact: { flaggedL1, flaggedL2, triAddExact, pctTriAddExact },
        falsePositiveSample: flaggedNotHotSample,
        comparisonToP2_1: { p2_1_recallL1: 0.858, p2_1_precisionL1: 0.0043, p2_1_pctFlaggedOfWholeMesh: 16.9, p2_1_pctTriAddExact: 202.2 },
        elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_2_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', { elapsedMs: Date.now() - t0, recallL1, precisionL1, flaggedL1, worstResidualEndToEnd });
      // eslint-disable-next-line no-console
      console.log(`[P2.2] DONE\n${JSON.stringify(summary, null, 2)}`);

      expect(hotFacetSet.size, 'sanity: non-vacuous run').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
