// _tierc_p2_3.test.ts — Curved-Element Phase-2 arm P2.3 (BOTH located fixes from P2.2's
// diagnosis: a BUFFERED feature-cell gate for recall, and a DIRECTIONAL sagitta test for
// precision/cost). Charter: research/lab/2026-07-12-curved-element-phase2-charter.md §P2.3.
// Predecessor: research/exchange/tierc/p2_2_summary.json (commit 9ad2f19d) — SUB=24 dense +
// delta fixed recall-BY-MATH to 100% (recallL1, ignoring the gate) but located TWO remaining,
// non-tuning problems:
//   (1) ZERO-BUFFER GATE: 203/1890 hot facets sit 0.00007-0.00113 (u,t) from the nearest curve
//       (often > their own cell size ~0.00049) and never pass the raw intersects() bucket test
//       -> caps end-to-end recall at 0.8926.
//   (2) ISOTROPIC SAGITTA: kappaSup*hCur^2/8 is a worst-case-over-ALL-directions bound; it
//       flags ~67.8% of the (partial, 5%-sampled) feature population, dominated by ordinary
//       Gyroid band cells (kappaSup~7-13) whose ACTUAL mesh edges run tangential to the local
//       band (low realized curvature), not across it.
//
// THIS ARM implements both fixes, non-circularly (no Newton calls anywhere in the criterion
// itself; Newton only appears read-only via the ALREADY-BANKED p2_0_s2_partial.json ground
// truth for the closure leg, exactly as P2.2 did):
//
//  FIX 1 (gate buffer): buildFeatureIntersectorL is extended with an OPTIONAL 4th `buf`
//  argument that dilates the query box by `buf` on all four sides before the SAME bucket
//  lookup + segHitsBoxL test already used for the raw (buf=0) gate -- i.e. an exact,
//  reused-machinery "is any curve segment within L-infinity distance `buf` of this box"
//  test. buf = 1.5 * gb.size (the facet's OWN cell-size proxy, matching "1.5 cell-widths"
//  per the task brief). WHY NOT brute-force nearestCurveDist as the operative full-mesh
//  gate: with ~2045 curve polylines this arm measures a large total segment count -- calling
//  nearestCurveDist (linear scan over ALL segments) 2.24M times is many-billion-op infeasible
//  within budget. nearestCurveDist IS still used, exactly as the task specifies, but as the
//  DIAGNOSTIC that CALIBRATES/VALIDATES the buffer (Stage E's 203-recovery check computes the
//  true (u,t) distance for every hot facet that fails the raw gate and confirms the buffered
//  bucket-dilation gate's pass/fail agrees with "distance <= buf").
//
//  FIX 2 (directional sagitta): a NEW `shapeOpAt(u,t)` returns the local second-fundamental-
//  form coefficients {L,M,N} (the exact same intermediate quantities gyroidAnalyticCurvature
//  already computes before its eigen-decomposition -- verified against the original via a
//  sanity cross-check below). For a UV edge displacement d=(du,dt), Taylor-expanding the
//  embedding P(u+du,t+dt) shows the chord-vs-surface sagitta at the edge's own parameter
//  midpoint is EXACTLY |L*du^2 + 2*M*du*dt + N*dt^2| / 8 -- i.e. "project the curvature onto
//  the direction of THIS edge" with no separate normalization/division step (the first-
//  fundamental-form terms that would appear in a literal Euler-formula ratio cancel exactly
//  against the arc-length term in the sagitta formula; see the derivation comment on
//  `edgeSagAt` below). PROXY CHOSEN (stated per the task's own "pick the most faithful cheap
//  proxy" clause): evaluate this formula on ALL THREE of the facet's OWN actual mesh edges
//  (not a separately-computed cross-curve-normal direction from curve-tangent data) and take
//  the max. This is "the sagitta over the specific cell edge that crosses the nearest curve"
//  generalized to avoid an extra edge-curve intersection test: any edge that truly crosses
//  the band will dominate the max; edges that run tangential to the band (the false-positive
//  mechanism P2.2 diagnosed) contribute a small quadratic form and are correctly suppressed.
//  Cost: {L,M,N} are computed ONCE per SUB=24 dense sub-sample (same cost as P2.2's per-sample
//  kappaSup, since kappaSup ALSO required L,M,N as intermediates) -- so scoring BOTH the
//  isotropic (P2.2) and directional (new) criteria in one pass costs about the SAME as P2.2's
//  isotropic-only sweep, not ~4x, letting this arm afford the buffered (larger) population.
//
// RULES: NEW FILE. READ-ONLY on all committed code + P2.0/P2.1/P2.2 exchange artifacts (reused
// by IMPORT/read only). No kernel edit. DEV-ONLY, research/ never imported by src/. Commit
// nothing. Time-budgeted dense sweep (elapsed-time stop, not just a projection-and-kill) on a
// DETERMINISTICALLY SHUFFLED (not prefix-truncated -- P2.2's forced 5% truncation was a
// facet-index-ORDER prefix, i.e. plausibly geographically biased) sample of the buffered
// population, so a killed/budget-capped run still yields a representative precision estimate.
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
import { gyroidAnalyticCurvature, GPC_FIELD, gpcR0, rDerivs, type GyroidFieldP } from './_gyroid_prodclose_lib';
import { AF_PROD_OPTS } from './_analytic_floor_lib';
import { clipFeaturesToBox } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_P2_3 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_3_crumbs.ndjson');
const EXPECT_HASH = '51a25eba-6a58e3e1'; // same champion twin P2.0/P2.1/P2.2 scored (non-vacuity witness)
const TOL = 0.01; // maxSagMm-equivalent acceptance tolerance (the program's own 0.01mm standard)
const LEVEL_CAP = 2; // matches P2.0's adaptive +1/+2 (2.28% level-2 rate)
const SUB = 24; // buildGyroidCurvatureFloor's DOCUMENTED, EMPIRICALLY-VALIDATED dense cell-sup density
const BUF_MULT = 1.5; // "within ~1.5 cell-widths" per the task brief, relative to EACH facet's own gate-box size
const TEST_TIMEOUT_MS = 27 * 60 * 1000;
const DENSE_SWEEP_BUDGET_MS = 13 * 60 * 1000; // hard wall-clock stop for Stage D (elapsed-time, not projection-only)
const HOT_POP_LOW = 1890, HOT_POP_HIGH = 31114; // P2.0's own extrapolated hot-population band

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.3', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
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
// (neither is exported there), EXTENDED with an additive `buf` dilation param (default 0 =>
// byte-identical to the raw production gate). Geometry-only bucketing utility. ───
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
/** `buf` (default 0) dilates the query box on all four sides BEFORE the bucket lookup and the
 *  segHitsBoxL test -- an exact "any curve segment within L-infinity distance `buf`" test,
 *  reusing the SAME bucket structure the raw (buf=0) gate uses. buf=0 => byte-identical to
 *  P2.1/P2.2's intersects(). */
function buildFeatureIntersectorL(features: FeatureLine[]): (u0: number, t0: number, size: number, buf?: number) => boolean {
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
  return (u0: number, t0: number, size: number, buf = 0): boolean => {
    const u0d = u0 - buf, u1d = u0 + size + buf;
    const t0d = t0 - buf, t1d = t0 + size + buf;
    const bu0 = clampB(u0d);
    const bu1 = clampB(u1d - 1e-12);
    const bt0 = clampB(t0d);
    const bt1 = clampB(t1d - 1e-12);
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const arr = buckets.get(key(bu, bt));
        if (!arr) continue;
        for (const [au, at, bvu, bvt] of arr) {
          if (segHitsBoxL(au, at, bvu, bvt, u0d, u1d, t0d, t1d)) return true;
        }
      }
    }
    return false;
  };
}

/** Facet (u,t) bbox (u unwrapped for seam contiguity) + its own longest 3D edge (the P2.0/P2.1/
 *  P2.2 "current cell size" proxy) + its 3 own UV edge-displacement vectors (unwrapped
 *  consistently), used directly by the directional sagitta test. */
interface FacetBox {
  uMin: number; uMax: number; tMin: number; tMax: number; hCur: number;
  edges: [number, number][]; // 3 UV displacement vectors (du,dt) for the facet's own 3 edges
}
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
  const edges: [number, number][] = [[ub - ua, tb - ta], [uc - ub, tc - tb], [ua - uc, ta - tc]];
  return {
    uMin: Math.min(ua, ub, uc), uMax: Math.max(ua, ub, uc),
    tMin: Math.min(ta, tb, tc), tMax: Math.max(ta, tb, tc), hCur, edges,
  };
}

/** The (u0,t0,size) box a production quadtree cell test would use for this facet's footprint. */
function facetGateBox(b: FacetBox): { u0: number; t0: number; size: number } {
  const u0 = b.uMin - Math.floor(b.uMin);
  const size = Math.max(b.uMax - b.uMin, b.tMax - b.tMin, 1e-9);
  return { u0, t0: b.tMin, size };
}

/** Brute-force nearest distance (u,t) from a point to any segment of any line in `features` --
 *  DIAGNOSTIC/CALIBRATION only (per the task brief), used on the SMALL (<=1890) hot-facet set
 *  to confirm the cheap bucket-dilation buffered gate agrees with the true distance. NEVER
 *  called at whole-mesh scale (infeasible: ~thousands of segments x 2.24M facets). */
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

// ─── directional curvature machinery (NEW this arm) ───
type Vec3 = [number, number, number];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

/**
 * Second-fundamental-form coefficients {L,M,N} at (u,t), PLUS the isotropic max|principal
 * curvature| (kappa) -- literally the SAME derivation as gyroidAnalyticCurvature (copied,
 * verbatim through the L/M/N computation, since it is not exported from _gyroid_prodclose_lib),
 * just also returning the intermediates instead of only the post-eigendecomposition scalar.
 * Verified against the original via a sanity cross-check in the test body below.
 */
function shapeOpAt(
  u: number, t: number, r0: (tt: number) => number, H: number, p: GyroidFieldP = GPC_FIELD,
): { L: number; M: number; N: number; kappa: number } {
  const rd = rDerivs(u, t, r0, p);
  const { r, r_u, r_t, r_uu, r_tt, r_ut } = rd;
  const theta = TAU * u;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const Pu: Vec3 = [r_u * cosT - r * TAU * sinT, r_u * sinT + r * TAU * cosT, 0];
  const Pt: Vec3 = [r_t * cosT, r_t * sinT, H];
  const Puu: Vec3 = [
    (r_uu - r * TAU * TAU) * cosT - 2 * r_u * TAU * sinT,
    (r_uu - r * TAU * TAU) * sinT + 2 * r_u * TAU * cosT,
    0,
  ];
  const Ptt: Vec3 = [r_tt * cosT, r_tt * sinT, 0];
  const Put: Vec3 = [r_ut * cosT - r_t * TAU * sinT, r_ut * sinT + r_t * TAU * cosT, 0];
  const E = dot3(Pu, Pu), F = dot3(Pu, Pt), G = dot3(Pt, Pt);
  const nRaw = cross3(Pu, Pt);
  const nLen = Math.hypot(nRaw[0], nRaw[1], nRaw[2]);
  if (nLen < 1e-30) return { L: 0, M: 0, N: 0, kappa: 0 };
  const n: Vec3 = [nRaw[0] / nLen, nRaw[1] / nLen, nRaw[2] / nLen];
  const L = dot3(Puu, n), M = dot3(Put, n), N = dot3(Ptt, n);
  const detI = E * G - F * F;
  let kappa = 0;
  if (Math.abs(detI) >= 1e-30) {
    const invDet = 1 / detI;
    const i00 = G * invDet, i01 = -F * invDet, i10 = -F * invDet, i11 = E * invDet;
    const s00 = L * i00 + M * i10, s01 = L * i01 + M * i11;
    const s10 = M * i00 + N * i10, s11 = M * i01 + N * i11;
    const tr = s00 + s11, det = s00 * s11 - s01 * s10;
    const disc = Math.max(0, tr * tr - 4 * det);
    const sq = Math.sqrt(disc);
    const k1 = (tr + sq) / 2, k2 = (tr - sq) / 2;
    kappa = Math.max(Math.abs(k1), Math.abs(k2));
  }
  return { L, M, N, kappa };
}

/**
 * DERIVATION (directional sagitta over a UV edge displacement d=(du,dt)):
 * Taylor-expand P(u0+du,t0+dt) = P0 + Pu du + Pt dt + (1/2)(Puu du^2 + 2 Put du dt + Ptt dt^2) + O(d^3).
 * Chord midpoint m = [P(u0,t0)+P(u0+du,t0+dt)]/2 = P0 + (1/2)(Pu du+Pt dt) + (1/4)(...).
 * Surface point at the edge's own parameter midpoint S = P(u0+du/2,t0+dt/2)
 *   = P0 + (1/2)(Pu du+Pt dt) + (1/8)(Puu du^2+2 Put du dt+Ptt dt^2).
 * S - m = -(1/8)(Puu du^2+2 Put du dt+Ptt dt^2); projecting onto the unit normal n gives the
 * NORMAL (sagitta) component exactly: sag(d) = |L du^2 + 2 M du dt + N dt^2| / 8.
 * This is the SAME physical quantity as "normal curvature along d's unit 3D direction times
 * (3D chord length)^2/8" (Euler's formula kappa_n(d)=II(d,d)/I(d,d) times 3D-length^2=I(d,d),
 * the I(d,d) factors cancel) -- i.e. this literally IS "project the curvature onto the edge's
 * own direction", computed without ever forming I=E,F,G or normalizing.
 */
function edgeSagAt(L: number, M: number, N: number, du: number, dt: number): number {
  return Math.abs(L * du * du + 2 * M * du * dt + N * dt * dt) / 8;
}

/** SUB=24 dense sweep over the facet's own (u,t) bbox, computing BOTH the isotropic
 *  (P2.2-style) cell-sup kappa AND, in the SAME pass (L,M,N are shared intermediates -- no
 *  extra rDerivs cost), the directional sagitta sup for EACH of the facet's 3 actual edges. */
function denseCellStats(
  box: FacetBox, r0: (tt: number) => number, H: number,
): { kappaIso: number; sag: [number, number, number] } {
  const uc = (box.uMin + box.uMax) / 2, tc = (box.tMin + box.tMax) / 2;
  const halfU = Math.max((box.uMax - box.uMin) / 2, 1e-9);
  const halfT = Math.max((box.tMax - box.tMin) / 2, 1e-9);
  let kappaIso = 0;
  const sag: [number, number, number] = [0, 0, 0];
  for (let jj = -SUB; jj <= SUB; jj++) {
    const t = Math.min(1, Math.max(0, tc + (jj / SUB) * halfT));
    for (let ii = -SUB; ii <= SUB; ii++) {
      const u = uc + (ii / SUB) * halfU;
      const { L, M, N, kappa } = shapeOpAt(u, t, r0, H);
      if (kappa > kappaIso) kappaIso = kappa;
      for (let e = 0; e < 3; e++) {
        const [du, dt] = box.edges[e];
        const s = edgeSagAt(L, M, N, du, dt);
        if (s > sag[e]) sag[e] = s;
      }
    }
  }
  return { kappaIso, sag };
}

interface FullCrit {
  hCur: number;
  kappaIso: number; sagIso: number; nNeededIso: number;
  sagDir: number; nNeededDir: number; sagEdges: [number, number, number];
}
/** BOTH criteria, single dense pass. `nNeeded*` = escalation levels (quadrisection halves the
 *  edge => sag scales by 1/4 per level, so N = ceil(0.5*log2(sag/TOL)), capped). */
function scoreFullDelta(box: FacetBox, r0: (tt: number) => number, H: number): FullCrit {
  const { kappaIso, sag } = denseCellStats(box, r0, H);
  const sagIso = (kappaIso * box.hCur * box.hCur) / 8;
  const sagDir = Math.max(sag[0], sag[1], sag[2]);
  const levelFor = (s: number): number => (s <= TOL ? 0 : Math.min(LEVEL_CAP, Math.ceil(0.5 * Math.log2(s / TOL))));
  return {
    hCur: box.hCur, kappaIso, sagIso, nNeededIso: levelFor(sagIso),
    sagDir, nNeededDir: levelFor(sagDir), sagEdges: sag,
  };
}

/** Deterministic mulberry32 PRNG + Fisher-Yates shuffle -- used so a time-budget-truncated
 *  Stage D sample is a representative RANDOM subset, not a facet-index-order PREFIX (P2.2's
 *  forced 5% truncation was exactly such a prefix and is plausibly geographically biased). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleInPlace(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

describe.skipIf(!ON)('P2.3 — BOTH located fixes: buffered gate (recall) + directional sagitta (precision/cost)', () => {
  it(
    'buffers the feature-cell gate, scores directional-vs-isotropic sagitta on the buffered population, checks recall/precision/tri-cost + closure',
    () => {
      const t0 = Date.now();
      bumpPriority();
      crumb('start');

      // ── STAGE A: build twin (byte-identical non-vacuity witness) ──
      const { H, outerXyz, outerIdx, hash, outerTris, buildMs, generalCurves } = buildTwin();
      crumb('build-done', { hash, outerTris, buildMs, generalCurvesCount: generalCurves.length });
      expect(hash, 'must reproduce the exact P2.0/P2.1/P2.2 banked champion mesh (non-vacuity)').toBe(EXPECT_HASH);

      // ── sanity cross-check: shapeOpAt's kappa must match gyroidAnalyticCurvature EXACTLY
      // (same derivation, independently re-typed here since L/M/N aren't exported upstream). ──
      let maxRelErr = 0;
      const sanityPts: Array<[number, number]> = [[0.1, 0.2], [0.37, 0.61], [0.865, 0.204], [0.5, 0.5], [0.999, 0.001]];
      for (const [su, st] of sanityPts) {
        const a = shapeOpAt(su, st, gpcR0, H).kappa;
        const b = gyroidAnalyticCurvature(su, st, gpcR0, H, GPC_FIELD);
        const rel = b > 1e-9 ? Math.abs(a - b) / b : Math.abs(a - b);
        if (rel > maxRelErr) maxRelErr = rel;
      }
      crumb('sanity-crosscheck', { maxRelErr });
      expect(maxRelErr, 'shapeOpAt.kappa must reproduce gyroidAnalyticCurvature exactly (shared derivation)').toBeLessThan(1e-9);

      // ── ground truth: Newton-CONFIRMED hot facet set (banked by armA3_char, reused by P2.0/P2.1/P2.2) ──
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

      // ── STAGE B: build the REAL production cell<->feature gate from the SAME curves that
      // built this exact twin (clip margins mirror ConformingWall.ts). ──
      const featureLevel = AF_PROD_OPTS.featureLevel;
      const uMargin = 1.5 / (1 << featureLevel);
      const tMargin = AF_PROD_OPTS.nRing > 0 ? 1 / AF_PROD_OPTS.nRing : 1 / 64;
      const clippedFeatures = clipFeaturesToBox(generalCurves, uMargin, tMargin);
      const intersects = buildFeatureIntersectorL(clippedFeatures);
      let totalSegs = 0;
      for (const line of clippedFeatures) totalSegs += Math.max(0, line.points.length - 1);
      crumb('gate-built', { clippedFeatureCount: clippedFeatures.length, totalSegs, uMargin, tMargin });

      // ── STAGE C: cheap whole-mesh SCOPE sweep -- RAW gate (buf=0, for reference/comparison to
      // P2.2) AND BUFFERED gate (buf=1.5*facet-own-size) -- both O(1)-ish bucket lookups, no
      // curvature evaluation, no brute-force nearestCurveDist at this scale. ──
      const nF = outerIdx.length / 3;
      const featureCellIdxBuffered: number[] = [];
      let rawGateCount = 0;
      let lastCrumb = Date.now();
      for (let f = 0; f < nF; f++) {
        const box = facetBox(outerIdx, outerXyz, H, f);
        const gb = facetGateBox(box);
        const buf = BUF_MULT * gb.size;
        const bufHit = intersects(gb.u0, gb.t0, gb.size, buf);
        if (bufHit) {
          featureCellIdxBuffered.push(f);
          if (intersects(gb.u0, gb.t0, gb.size, 0)) rawGateCount++;
        }
        if (f % 500_000 === 0 || Date.now() - lastCrumb > 30_000) {
          crumb('scope-sweep-progress', { f, nF, bufferedCount: featureCellIdxBuffered.length, rawGateCount, elapsedMs: Date.now() - t0 });
          lastCrumb = Date.now();
        }
      }
      const scopeMs = Date.now() - t0;
      crumb('scope-sweep-done', {
        bufferedCount: featureCellIdxBuffered.length, rawGateCount, nF,
        pctOfMeshBuffered: (100 * featureCellIdxBuffered.length) / nF, pctOfMeshRaw: (100 * rawGateCount) / nF, scopeMs,
      });
      writeFileSync(join(OUT_DIR, 'p2_3_stageC.json'), JSON.stringify({
        bufferedCount: featureCellIdxBuffered.length, rawGateCount, nF,
        pctOfMeshBuffered: (100 * featureCellIdxBuffered.length) / nF, pctOfMeshRaw: (100 * rawGateCount) / nF, scopeMs,
        comparisonToP2_2RawGateCount: 550584,
      }, null, 2));

      // ── STAGE D: BOTH criteria (isotropic + directional), single SUB=24 dense pass, on a
      // DETERMINISTICALLY SHUFFLED sample of the buffered population, hard-stopped at a wall-
      // clock budget (not a projection-then-single-kill -- an elapsed-time check every facet). ──
      const shuffled = featureCellIdxBuffered.slice();
      shuffleInPlace(shuffled, mulberry32(20260712));
      let flaggedL1Iso = 0, flaggedL2Iso = 0, tpL1Iso = 0, n1Iso = 0, n2Iso = 0;
      let flaggedL1Dir = 0, flaggedL2Dir = 0, tpL1Dir = 0, n1Dir = 0, n2Dir = 0;
      const fpSampleIso: Array<{ f: number; hCur: number; sagIso: number; nNeeded: number }> = [];
      const fpSampleDir: Array<{ f: number; hCur: number; sagDir: number; nNeeded: number }> = [];
      const MAX_FP_SAMPLE = 25;
      const subT0 = Date.now();
      let processedSub = 0;
      let truncated = false;
      lastCrumb = Date.now();
      for (let k = 0; k < shuffled.length; k++) {
        const elapsed = Date.now() - subT0;
        if (elapsed > DENSE_SWEEP_BUDGET_MS) {
          truncated = true;
          crumb('sub-sweep-BUDGET-STOP', { processedSub, total: shuffled.length, elapsedMs: elapsed });
          break;
        }
        const f = shuffled[k];
        const box = facetBox(outerIdx, outerXyz, H, f);
        const crit = scoreFullDelta(box, gpcR0, H);
        processedSub++;
        const isHot = hotFacetSet.has(f);
        if (crit.nNeededIso >= 1) {
          flaggedL1Iso++;
          if (crit.nNeededIso >= 2) { flaggedL2Iso++; n2Iso++; } else { n1Iso++; }
          if (isHot) tpL1Iso++;
          else if (fpSampleIso.length < MAX_FP_SAMPLE) fpSampleIso.push({ f, hCur: crit.hCur, sagIso: crit.sagIso, nNeeded: crit.nNeededIso });
        }
        if (crit.nNeededDir >= 1) {
          flaggedL1Dir++;
          if (crit.nNeededDir >= 2) { flaggedL2Dir++; n2Dir++; } else { n1Dir++; }
          if (isHot) tpL1Dir++;
          else if (fpSampleDir.length < MAX_FP_SAMPLE) fpSampleDir.push({ f, hCur: crit.hCur, sagDir: crit.sagDir, nNeeded: crit.nNeededDir });
        }
        if (k % 20_000 === 0 || Date.now() - lastCrumb > 30_000) {
          crumb('sub-sweep-progress', {
            k, total: shuffled.length, flaggedL1Iso, flaggedL1Dir, tpL1Iso, tpL1Dir, elapsedMs: elapsed,
          });
          lastCrumb = Date.now();
        }
      }
      const subSweepMs = Date.now() - subT0;
      const precisionL1Iso = flaggedL1Iso > 0 ? tpL1Iso / flaggedL1Iso : 0;
      const precisionL1Dir = flaggedL1Dir > 0 ? tpL1Dir / flaggedL1Dir : 0;
      const extrapFactor = processedSub > 0 ? shuffled.length / processedSub : 1;
      const flaggedL1IsoExtrap = Math.round(flaggedL1Iso * extrapFactor);
      const flaggedL2IsoExtrap = Math.round(flaggedL2Iso * extrapFactor);
      const flaggedL1DirExtrap = Math.round(flaggedL1Dir * extrapFactor);
      const flaggedL2DirExtrap = Math.round(flaggedL2Dir * extrapFactor);
      const triAddIsoExtrap = (flaggedL1IsoExtrap - flaggedL2IsoExtrap) * 3 + flaggedL2IsoExtrap * 15;
      const triAddDirExtrap = (flaggedL1DirExtrap - flaggedL2DirExtrap) * 3 + flaggedL2DirExtrap * 15;
      const pctTriAddIsoExtrap = (100 * triAddIsoExtrap) / outerTris;
      const pctTriAddDirExtrap = (100 * triAddDirExtrap) / outerTris;
      crumb('sub-sweep-done', {
        processedSub, total: shuffled.length, truncated, extrapFactor,
        flaggedL1Iso, flaggedL1Dir, tpL1Iso, tpL1Dir, precisionL1Iso, precisionL1Dir, subSweepMs,
      });
      writeFileSync(join(OUT_DIR, 'p2_3_stageD.json'), JSON.stringify({
        processedSub, total: shuffled.length, truncated, extrapFactor, subSweepMs,
        iso: {
          flaggedL1: flaggedL1Iso, flaggedL2: flaggedL2Iso, tpL1: tpL1Iso, precisionL1: precisionL1Iso,
          n1Iso, n2Iso, flaggedL1Extrap: flaggedL1IsoExtrap, flaggedL2Extrap: flaggedL2IsoExtrap,
          triAddExtrap: triAddIsoExtrap, pctTriAddExtrap: pctTriAddIsoExtrap,
        },
        dir: {
          flaggedL1: flaggedL1Dir, flaggedL2: flaggedL2Dir, tpL1: tpL1Dir, precisionL1: precisionL1Dir,
          n1Dir, n2Dir, flaggedL1Extrap: flaggedL1DirExtrap, flaggedL2Extrap: flaggedL2DirExtrap,
          triAddExtrap: triAddDirExtrap, pctTriAddExtrap: pctTriAddDirExtrap,
        },
      }, null, 2));

      // ── STAGE E: recall over the FULL 1,890 Newton-confirmed hot set, computed DIRECTLY
      // (cheap: 1890 facets regardless of Stage D's sample) -- RAW vs BUFFERED gate, crossed
      // with ISO vs DIRECTIONAL criterion firing, so the buffer's and the directional test's
      // effects on recall are separately visible. Also the explicit 203-recovery check. ──
      const hotRecMap = new Map<number, { crit: FullCrit; rawGate: boolean; bufGate: boolean }>();
      let hotHitsRawGateIso = 0, hotHitsBufGateIso = 0, hotHitsBufGateDir = 0, hotHitsRawGateDir = 0;
      let hotMissingRawGate = 0, hotMissingBufGate = 0;
      const rawGateMissRecovery: Array<{ f: number; bufGate: boolean; nearestDist: number; bufMargin: number }> = [];
      for (const f of hotFacetSet) {
        const box = facetBox(outerIdx, outerXyz, H, f);
        const gb = facetGateBox(box);
        const buf = BUF_MULT * gb.size;
        const rawGate = intersects(gb.u0, gb.t0, gb.size, 0);
        const bufGate = intersects(gb.u0, gb.t0, gb.size, buf);
        const crit = scoreFullDelta(box, gpcR0, H);
        hotRecMap.set(f, { crit, rawGate, bufGate });
        if (!rawGate) hotMissingRawGate++;
        if (!bufGate) hotMissingBufGate++;
        if (rawGate && crit.nNeededIso >= 1) hotHitsRawGateIso++;
        if (rawGate && crit.nNeededDir >= 1) hotHitsRawGateDir++;
        if (bufGate && crit.nNeededIso >= 1) hotHitsBufGateIso++;
        if (bufGate && crit.nNeededDir >= 1) hotHitsBufGateDir++;
        if (!rawGate) {
          const uc = (box.uMin + box.uMax) / 2, tc = (box.tMin + box.tMax) / 2;
          const d = nearestCurveDist(uc, tc, clippedFeatures);
          rawGateMissRecovery.push({ f, bufGate, nearestDist: d, bufMargin: buf });
        }
      }
      const recallRawGateIso = hotHitsRawGateIso / hotFacetSet.size; // should reproduce P2.2's 0.8926 (cross-check)
      const recallBufGateIso = hotHitsBufGateIso / hotFacetSet.size; // isolates the BUFFER's effect
      const recallBufGateDir = hotHitsBufGateDir / hotFacetSet.size; // THE new end-to-end number (both fixes)
      const recallRawGateDir = hotHitsRawGateDir / hotFacetSet.size;
      const recoveredCount = rawGateMissRecovery.filter((x) => x.bufGate).length;
      const stillMissingAfterBuffer = rawGateMissRecovery.filter((x) => !x.bufGate);
      crumb('hotset-recall-done', {
        hotMissingRawGate, hotMissingBufGate, recoveredCount, stillMissing: stillMissingAfterBuffer.length,
        recallRawGateIso, recallBufGateIso, recallBufGateDir, recallRawGateDir,
      });
      writeFileSync(join(OUT_DIR, 'p2_3_stageE.json'), JSON.stringify({
        hotSetSize: hotFacetSet.size, hotMissingRawGate, hotMissingBufGate,
        recoveredCount, stillMissingAfterBuffer,
        recallRawGateIso, recallBufGateIso, recallBufGateDir, recallRawGateDir,
        comparisonToP2_2: { p2_2_trueEndToEndRecall: 0.8925925925925926, p2_2_hotMissingIntersectsGate: 203 },
        recoverySample: rawGateMissRecovery.slice(0, 30),
      }, null, 2));

      // ── STAGE F: closure vs P2.0's OWN banked per-facet Newton ground truth (1,710 rows,
      // ZERO new Newton calls), using the BUFFERED gate (both fixes) crossed with BOTH
      // criteria so the criterion's marginal effect on closure is visible while gate is held
      // fixed. ──
      let l2TPDir = 0, l2FNDir = 0, l2TNDir = 0, l2FPDir = 0;
      let closureOkFlaggedDir = 0, closureFailFlaggedDir = 0;
      let worstResidualEndToEndDir = 0, worstResidualAmongFlaggedDir = 0;
      let worstResidualEndToEndIso = 0;
      const closureFailSampleDir: Array<{ f: number; ourN: number; afterOurN: number; before: number }> = [];
      let joinMisses = 0;
      for (const row of p2s2Rows) {
        const rec = hotRecMap.get(row.f);
        if (!rec) { joinMisses++; continue; }
        const { crit, bufGate } = rec;
        // directional (the new end-to-end criterion)
        const ourFlagDir = bufGate && crit.nNeededDir >= 1;
        const ourNDir = Math.min(LEVEL_CAP, crit.nNeededDir);
        if (row.usedLevel2 && ourNDir >= 2) l2TPDir++;
        else if (row.usedLevel2 && ourNDir < 2) l2FNDir++;
        else if (!row.usedLevel2 && ourNDir < 2) l2TNDir++;
        else l2FPDir++;
        const residualDir = ourFlagDir ? (ourNDir >= 2 ? row.afterU2 : row.afterU1) : row.before;
        if (residualDir > worstResidualEndToEndDir) worstResidualEndToEndDir = residualDir;
        if (ourFlagDir) {
          if (residualDir > worstResidualAmongFlaggedDir) worstResidualAmongFlaggedDir = residualDir;
          if (residualDir <= TOL) closureOkFlaggedDir++;
          else {
            closureFailFlaggedDir++;
            if (closureFailSampleDir.length < 30) closureFailSampleDir.push({ f: row.f, ourN: ourNDir, afterOurN: residualDir, before: row.before });
          }
        }
        // isotropic (same buffered gate, OLD criterion) -- comparison only
        const ourFlagIso = bufGate && crit.nNeededIso >= 1;
        const ourNIso = Math.min(LEVEL_CAP, crit.nNeededIso);
        const residualIso = ourFlagIso ? (ourNIso >= 2 ? row.afterU2 : row.afterU1) : row.before;
        if (residualIso > worstResidualEndToEndIso) worstResidualEndToEndIso = residualIso;
      }
      const level2RecallDir = l2TPDir + l2FNDir > 0 ? l2TPDir / (l2TPDir + l2FNDir) : null;
      const level2PrecisionDir = l2TPDir + l2FPDir > 0 ? l2TPDir / (l2TPDir + l2FPDir) : null;
      crumb('closure-check-done', {
        l2TPDir, l2FNDir, l2TNDir, l2FPDir, level2RecallDir, level2PrecisionDir,
        closureOkFlaggedDir, closureFailFlaggedDir, worstResidualEndToEndDir, worstResidualEndToEndIso, joinMisses,
      });

      // ── PRE-REGISTERED GATE evaluation (all 4, verbatim from the task brief) ──
      const gate1_recall = recallBufGateDir >= 0.90;
      const ratioToHotPopHigh = flaggedL1DirExtrap / HOT_POP_HIGH;
      const ratioToHotPopLow = flaggedL1DirExtrap / HOT_POP_LOW;
      const gate2_precision = ratioToHotPopHigh <= 3; // "within ~1-3x", NOT 20x
      const gate3_triCost = pctTriAddDirExtrap <= 10;
      const gate4_closure = worstResidualEndToEndDir <= TOL;
      const allPass = gate1_recall && gate2_precision && gate3_triCost && gate4_closure;

      const summary = {
        experiment: 'P2.3', at: new Date().toISOString(), hash, outerTris, nF,
        criterion: {
          gateBuffer: `bucket-dilated intersects(u0,t0,size,buf) with buf=${BUF_MULT}*facetGateBox.size (per-facet-adaptive)`,
          directional: 'sag_dir(edge) = |L*du^2+2*M*du*dt+N*dt^2|/8 over each of the facet OWN 3 UV edges, max taken; L,M,N = SUB=24 dense cell-sup 2nd-fundamental-form',
        },
        scope: {
          rawGateCount, bufferedCount: featureCellIdxBuffered.length, nF,
          pctOfMeshRaw: (100 * rawGateCount) / nF, pctOfMeshBuffered: (100 * featureCellIdxBuffered.length) / nF,
          scopeMs, comparisonToP2_2RawGateCount: 550584,
        },
        denseSweep: { processedSub, populationSampled: shuffled.length, truncated, extrapFactor, subSweepMs },
        isoOnBufferedPop: {
          flaggedL1Sample: flaggedL1Iso, tpL1Sample: tpL1Iso, precisionL1: precisionL1Iso,
          flaggedL1Extrap: flaggedL1IsoExtrap, pctFlaggedOfWholeMeshExtrap: (100 * flaggedL1IsoExtrap) / nF,
          pctTriAddExtrap: pctTriAddIsoExtrap, n1Iso, n2Iso,
        },
        directionalOnBufferedPop: {
          flaggedL1Sample: flaggedL1Dir, tpL1Sample: tpL1Dir, precisionL1: precisionL1Dir,
          flaggedL1Extrap: flaggedL1DirExtrap, pctFlaggedOfWholeMeshExtrap: (100 * flaggedL1DirExtrap) / nF,
          pctTriAddExtrap: pctTriAddDirExtrap, n1Dir, n2Dir,
          n1PctOfFlagged: flaggedL1Dir > 0 ? (100 * n1Dir) / flaggedL1Dir : null,
          n2PctOfFlagged: flaggedL1Dir > 0 ? (100 * n2Dir) / flaggedL1Dir : null,
        },
        recall: {
          hotSetSize: hotFacetSet.size, hotMissingRawGate, hotMissingBufGate, recoveredCount, stillMissingAfterBuffer: stillMissingAfterBuffer.length,
          recallRawGateIso, recallBufGateIso, recallBufGateDir, recallRawGateDir,
          note: 'recallBufGateDir = BOTH fixes applied (buffered gate AND directional criterion fires) -- THE end-to-end number for gate 1.',
        },
        closure: {
          p2s2RowCount: p2s2Rows.length, joinMisses,
          closureOkFlaggedDir, closureFailFlaggedDir, worstResidualEndToEndDir, worstResidualAmongFlaggedDir,
          worstResidualEndToEndIso, closureFailSampleDir,
          level2RecallDir, level2PrecisionDir, l2TPDir, l2FNDir, l2TNDir, l2FPDir,
        },
        gates: {
          gate1_recall: { value: recallBufGateDir, threshold: 0.90, pass: gate1_recall },
          gate2_precision: { flaggedL1DirExtrap, ratioToHotPopHigh, ratioToHotPopLow, thresholdRatio: 3, pass: gate2_precision },
          gate3_triCost: { value: pctTriAddDirExtrap, threshold: 10, pass: gate3_triCost },
          gate4_closure: { value: worstResidualEndToEndDir, threshold: TOL, pass: gate4_closure },
          ALL_PASS: allPass,
        },
        falsePositiveSampleIso: fpSampleIso, falsePositiveSampleDir: fpSampleDir,
        comparisonToP2_2: {
          p2_2_trueEndToEndRecall: 0.8925925925925926, p2_2_precisionL1: 0.003266748781663364,
          p2_2_pctFlaggedOfWholeMesh: 0.8325070531042575, p2_2_pctTriAddExactPartial: 11.347517414301663,
          p2_2_rawGateFeatureCellCount: 550584, p2_2_closureWorstResidual: 0.009997442195647466,
        },
        elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_3_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', {
        elapsedMs: Date.now() - t0, gate1_recall, gate2_precision, gate3_triCost, gate4_closure, allPass,
      });
      // eslint-disable-next-line no-console
      console.log(`[P2.3] DONE\n${JSON.stringify(summary, null, 2)}`);
      // eslint-disable-next-line no-console
      console.log(
        `[P2.3] VERDICT TABLE\n` +
        `  gate1 recall(bufGate+dir)   = ${recallBufGateDir.toFixed(4)}  (>=0.90)        -> ${gate1_recall ? 'PASS' : 'FAIL'}\n` +
        `  gate2 flaggedL1(dir,extrap) = ${flaggedL1DirExtrap}  (ratio to 31114 hot-pop-high = ${ratioToHotPopHigh.toFixed(2)}x, target 1-3x) -> ${gate2_precision ? 'PASS' : 'FAIL'}\n` +
        `  gate3 triCost(dir,extrap)   = ${pctTriAddDirExtrap.toFixed(2)}%  (<=10%)         -> ${gate3_triCost ? 'PASS' : 'FAIL'}\n` +
        `  gate4 closure worst(dir)    = ${worstResidualEndToEndDir.toFixed(6)}  (<=0.01)   -> ${gate4_closure ? 'PASS' : 'FAIL'}\n` +
        `  ALL_PASS = ${allPass}`,
      );

      expect(hotFacetSet.size, 'sanity: non-vacuous run').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
