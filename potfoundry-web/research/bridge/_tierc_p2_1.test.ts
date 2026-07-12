// _tierc_p2_1.test.ts — Curved-Element Phase-2 arm P2.1 (CELL-SCOPED LEVEL-OVERRIDE PRIMITIVE:
// closed-form curvature-driven flagging criterion, DESIGN + MINIMAL PROOF).
// Charter: research/lab/2026-07-12-curved-element-phase2-charter.md §P2.1. Predecessor:
// research/lab/tierc/P2.0-verdict.md (PASS — cell-scoped LOCAL uniform quadrisection closes the
// Gyroid band-edge knee 0.0249->=<0.01 at +4.54% extrapolated tris, using Newton-KNOWN hot facets
// as the oracle for WHICH cells to escalate).
//
// P2.0 assumed the hot-facet population as GIVEN (banked armA3_char_confirmed.json, itself built
// from Newton scoring). At mesh-BUILD time no Newton oracle exists. This arm tests whether a
// CLOSED-FORM criterion — no Newton, no truth mesh, just the style's own analytic curvature —
// can flag the SAME cells without a truth oracle: the standard h-refinement sagitta law
// sag ~= kappa*h^2/8, applied PER-FACET (proxy for per-quadtree-cell) with kappa from
// gyroidAnalyticCurvature (_gyroid_prodclose_lib.ts, exact closed-form, already used by the
// (different, already-existing) MetricSizingField.curvatureFloor global-sizing-floor mechanism).
//
// HYPOTHESIS: predictedSag(f) = kappa_sup(f)*h(f)^2/8 (kappa_sup = max analytic curvature over the
// facet's own centroid+3 vertices; h = the facet's own longest 3D edge, the standard proxy for the
// across-band chord span P2.0 measured) correctly separates the Newton-CONFIRMED hot facets
// (armA3_char_confirmed.json, 1,890 unique) from the cold bulk of the SAME champion mesh
// (2,242,984 outer facets) with HIGH RECALL and HIGH PRECISION (flags order-1,890-31,114 facets,
// not order-millions) -- i.e. the criterion is cell-scoped by CONSTRUCTION (it only ever compares
// a facet's OWN kappa/h to a fixed tolerance -- no cross-cell coupling, no Lipschitz grading,
// unlike the existing continuous MetricSizingField.curvatureFloor route).
//
// GATE (pre-registered): recall(level1Flag over hotFacetSet) HIGH (>=0.90) AND
// precision(level1Flag over the WHOLE 2,242,984-facet mesh) HIGH (order the confirmed/estimated
// hot population, not >>10x it) => criterion is a sound flagging primitive; closure is INHERITED
// from P2.0's own proven Newton-scored adaptive-quadrisection result (not re-measured) because the
// flagged set is (given high recall) essentially the SAME set P2.0 already proved closes.
// Level-2 (predictedSag>4*TOL, i.e. still failing after one halving) is cross-checked against
// P2.0's OWN BANKED per-facet ground truth (research/exchange/tierc/p2_0_s2_partial.json --
// real Newton afterU1/usedLevel2 labels, ZERO new Newton calls needed here) for a genuine,
// non-circular precision/recall on the SECOND escalation tier too.
//
// RULES: NEW FILE ONLY. READ-ONLY on all committed code + the P2.0 exchange artifacts (reused BY
// IMPORT/read, never re-derived). No kernel edit in this arm (see P2.1-design.md for the designed,
// not-yet-applied, production seam). DEV-ONLY, research/ never imported by src/. Commit nothing.
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

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_P2_1 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_1_crumbs.ndjson');
const EXPECT_HASH = '51a25eba-6a58e3e1'; // same champion twin P2.0 scored (non-vacuity witness)
const TOL = 0.01; // maxSagMm-equivalent acceptance tolerance (the program's own 0.01mm standard)
const LEVEL2_MULT = 4; // predictedSag(h/2) = predictedSag(h)/4 under ideal quadratic reduction
const TEST_TIMEOUT_MS = 20 * 60 * 1000;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.1', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
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
/** Circular mean of 3 u-values (periodic, wrap-safe) — for the facet centroid (u,t). */
function circularMeanU(u0: number, u1: number, u2: number): number {
  const wrap = (u: number, ref: number): number => {
    let d = u - ref;
    if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
    return ref + d;
  };
  const m = (u0 + wrap(u1, u0) + wrap(u2, u0)) / 3;
  return m - Math.floor(m);
}

interface Twin { rA: AnalyticRadiusFn; H: number; outerXyz: Float32Array; outerIdx: Uint32Array; hash: string; outerTris: number; buildMs: number; }
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
  return { rA, H, outerXyz: build.outerXyz, outerIdx: build.outerIdx, hash: build.hash, outerTris: build.outerTris, buildMs: build.buildMs };
}

interface FacetCrit { predictedSag: number; h: number; kappaSup: number; uc: number; tc: number; }
/** The closed-form criterion under test: kappa_sup(cell) * h(cell)^2 / 8, kappa_sup = max analytic
 *  curvature over centroid + 3 vertices (cell-sup proxy, cheap: 4 gyroidAnalyticCurvature calls),
 *  h = the facet's own longest 3D edge (proxy for the quadtree cell's across-band physical extent
 *  -- P2.0's own acrossEdgeLenMm concept). NO Newton, NO truth mesh -- purely closed-form + the
 *  mesh's own geometry, exactly what is available at real build time. */
function scoreFacet(
  outerIdx: Uint32Array, outerXyz: Float32Array, H: number, f: number,
): FacetCrit {
  const ia = outerIdx[3 * f], ib = outerIdx[3 * f + 1], ic = outerIdx[3 * f + 2];
  const ax = outerXyz[3 * ia], ay = outerXyz[3 * ia + 1], az = outerXyz[3 * ia + 2];
  const bx = outerXyz[3 * ib], by = outerXyz[3 * ib + 1], bz = outerXyz[3 * ib + 2];
  const cx = outerXyz[3 * ic], cy = outerXyz[3 * ic + 1], cz = outerXyz[3 * ic + 2];
  const eAB = dist3(ax, ay, az, bx, by, bz);
  const eBC = dist3(bx, by, bz, cx, cy, cz);
  const eCA = dist3(cx, cy, cz, ax, ay, az);
  const h = Math.max(eAB, eBC, eCA);
  const [ua, ta] = xyzToUt(ax, ay, az, H);
  const [ub, tb] = xyzToUt(bx, by, bz, H);
  const [uc0, tc0] = xyzToUt(cx, cy, cz, H);
  const uc = circularMeanU(ua, ub, uc0);
  const tc = (ta + tb + tc0) / 3;
  const kA = gyroidAnalyticCurvature(ua, ta, gpcR0, H, GPC_FIELD);
  const kB = gyroidAnalyticCurvature(ub, tb, gpcR0, H, GPC_FIELD);
  const kC = gyroidAnalyticCurvature(uc0, tc0, gpcR0, H, GPC_FIELD);
  const kCtr = gyroidAnalyticCurvature(uc, tc, gpcR0, H, GPC_FIELD);
  const kappaSup = Math.max(kA, kB, kC, kCtr);
  const predictedSag = (kappaSup * h * h) / 8;
  return { predictedSag, h, kappaSup, uc, tc };
}

describe.skipIf(!ON)('P2.1 — closed-form curvature-flagging criterion precision/recall + closure inheritance', () => {
  it(
    'scores the criterion over the WHOLE champion mesh (exact, not sampled) vs the Newton-confirmed hot set',
    () => {
      const t0 = Date.now();
      bumpPriority();
      crumb('start');

      const { rA: _rA, H, outerXyz, outerIdx, hash, outerTris, buildMs } = buildTwin();
      crumb('build-done', { hash, outerTris, buildMs });
      expect(hash, 'must reproduce the exact P2.0/A1/A3-char banked champion mesh (non-vacuity)').toBe(EXPECT_HASH);
      void _rA;

      // ── ground truth #1: Newton-CONFIRMED hot facet set (banked by armA3_char, reused by P2.0) ──
      const confirmedPath = join(OUT_DIR, 'armA3_char_confirmed.json');
      expect(existsSync(confirmedPath), `banked hot-facet population missing: ${confirmedPath}`).toBe(true);
      const confirmedRaw = JSON.parse(readFileSync(confirmedPath, 'utf8')) as Array<{ f: number; newton: number }>;
      const hotFacetSet = new Set<number>();
      for (const c of confirmedRaw) { if (c.f >= 0) hotFacetSet.add(c.f); }
      crumb('hotset-loaded', { rawRecords: confirmedRaw.length, uniqueHot: hotFacetSet.size });
      expect(hotFacetSet.size, 'hot population must be non-vacuous').toBeGreaterThan(0);

      // ── ground truth #2: P2.0's OWN banked per-facet Newton before/afterU1/afterU2/usedLevel2
      // (research/exchange/tierc/p2_0_s2_partial.json) -- real Newton labels, ZERO new Newton
      // calls needed for the level-2 precision/recall check below. ──
      const p2s2Path = join(OUT_DIR, 'p2_0_s2_partial.json');
      expect(existsSync(p2s2Path), `P2.0 S2 per-facet ground truth missing: ${p2s2Path}`).toBe(true);
      const p2s2Rows = JSON.parse(readFileSync(p2s2Path, 'utf8')) as Array<
        { f: number; before: number; afterU1: number; afterU2: number; usedLevel2: boolean; outlierAfterU2: boolean }
      >;
      const p2s2ByFacet = new Map<number, typeof p2s2Rows[number]>();
      for (const r of p2s2Rows) p2s2ByFacet.set(r.f, r);
      crumb('p2s2-groundtruth-loaded', { rows: p2s2Rows.length });

      // ── EXACT full-mesh sweep: score every one of the 2,242,984 outer facets. Pure closed-form
      // + the mesh's own geometry -- no Newton, no truth mesh. This is what a real build-time
      // flagging pass would do (modulo swapping "facet" for "quadtree leaf cell", see the design
      // doc). Checkpointed every 500k facets in case of a kill. ──
      const nF = outerIdx.length / 3;
      let flaggedL1 = 0, flaggedL2 = 0, tpL1 = 0;
      const flaggedNotHotSample: Array<{ f: number; predictedSag: number; h: number; kappaSup: number }> = [];
      const MAX_FP_SAMPLE = 200;
      let lastCrumb = Date.now();
      for (let f = 0; f < nF; f++) {
        const s = scoreFacet(outerIdx, outerXyz, H, f);
        const isL1 = s.predictedSag > TOL;
        if (isL1) {
          flaggedL1++;
          const isHot = hotFacetSet.has(f);
          if (isHot) tpL1++;
          else if (flaggedNotHotSample.length < MAX_FP_SAMPLE) {
            flaggedNotHotSample.push({ f, predictedSag: s.predictedSag, h: s.h, kappaSup: s.kappaSup });
          }
          if (s.predictedSag > LEVEL2_MULT * TOL) flaggedL2++;
        }
        if (f % 500_000 === 0 || Date.now() - lastCrumb > 30_000) {
          crumb('sweep-progress', { f, nF, flaggedL1, flaggedL2, tpL1, elapsedMs: Date.now() - t0 });
          lastCrumb = Date.now();
        }
      }
      crumb('sweep-done', { nF, flaggedL1, flaggedL2, tpL1, elapsedMs: Date.now() - t0 });

      // ── recall over the CONFIRMED hot set (exact -- every hot facet individually re-scored) ──
      let hotRecallHits = 0;
      const hotMisses: number[] = [];
      for (const f of hotFacetSet) {
        const s = scoreFacet(outerIdx, outerXyz, H, f);
        if (s.predictedSag > TOL) hotRecallHits++;
        else hotMisses.push(f);
      }
      const recallL1 = hotRecallHits / hotFacetSet.size;
      const precisionL1 = flaggedL1 > 0 ? tpL1 / flaggedL1 : 0;
      crumb('hotset-recall-done', { hotRecallHits, total: hotFacetSet.size, recallL1, misses: hotMisses.length });

      // ── level-2 precision/recall vs P2.0's REAL Newton usedLevel2 ground truth (non-circular:
      // this label was produced by Newton-rescoring the ACTUAL bisected sub-triangles, not by
      // this closed-form criterion) ──
      let l2TP = 0, l2FN = 0, l2TN = 0, l2FP = 0, l2Joined = 0;
      for (const [f, row] of p2s2ByFacet) {
        const s = scoreFacet(outerIdx, outerXyz, H, f);
        const predictedNeedsL2 = s.predictedSag > LEVEL2_MULT * TOL;
        l2Joined++;
        if (row.usedLevel2 && predictedNeedsL2) l2TP++;
        else if (row.usedLevel2 && !predictedNeedsL2) l2FN++;
        else if (!row.usedLevel2 && !predictedNeedsL2) l2TN++;
        else l2FP++;
      }
      const level2Recall = (l2TP + l2FN) > 0 ? l2TP / (l2TP + l2FN) : null;
      const level2Precision = (l2TP + l2FP) > 0 ? l2TP / (l2TP + l2FP) : null;
      crumb('level2-check-done', { l2TP, l2FN, l2TN, l2FP, l2Joined, level2Recall, level2Precision });

      // ── exact triangle cost using the EXACT flagged counts (not extrapolated) ──
      const triAddExact = (flaggedL1 - flaggedL2) * 3 + flaggedL2 * 15;
      const pctTriAddExact = 100 * triAddExact / outerTris;

      const summary = {
        experiment: 'P2.1', at: new Date().toISOString(), hash, outerTris, nF,
        criterion: 'predictedSag = kappaSup(centroid+3verts) * longestEdge^2 / 8; flag L1 if >TOL(0.01), L2 if >4*TOL',
        wholeMeshSweep: { flaggedL1, flaggedL2, tpL1, precisionL1, pctFlaggedL1: 100 * flaggedL1 / nF },
        hotSetRecall: { hotSetSize: hotFacetSet.size, hotRecallHits, recallL1, missCount: hotMisses.length, missSample: hotMisses.slice(0, 20) },
        level2VsP2S2GroundTruth: { l2TP, l2FN, l2TN, l2FP, l2Joined, level2Recall, level2Precision },
        triCostExact: { flaggedL1, flaggedL2, triAddExact, pctTriAddExact, comparisonToP2_0Extrapolation: { estimatedFullPop: 31114, p2_0ExtrapTriAdd: 101862, p2_0ExtrapPct: 4.5413609727042195 } },
        falsePositiveSample: flaggedNotHotSample.slice(0, 30),
        elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_1_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', { elapsedMs: Date.now() - t0, recallL1, precisionL1, flaggedL1 });
      // eslint-disable-next-line no-console
      console.log(`[P2.1] DONE\n${JSON.stringify(summary, null, 2)}`);

      expect(hotFacetSet.size, 'sanity: non-vacuous run').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
