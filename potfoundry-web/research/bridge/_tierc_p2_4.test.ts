// _tierc_p2_4.test.ts — Curved-Element Phase-2 arm P2.4: REFRAME the flagging criterion as a
// TRUE DELTA against the REAL production base sizing field, instead of an absolute test against
// raw hCur. Charter: research/lab/2026-07-12-curved-element-phase2-charter.md (P2.4 accelerator
// task). Predecessor: research/exchange/tierc/p2_3_summary.json (commit 95481afe) — gate-buffer
// (buf=1.5*cell) SOLVED recall (89.3%->100%), directional 2nd-fundamental-form sagitta helped
// precision directionally (-23% tri-cost) but a THIRD mechanism dominated: COARSE BACKGROUND
// CELLS (hCur 0.6-1.4mm, ordinary Gyroid saddle curvature kappaSup~7-13) trip ANY absolute
// `sag = kappa*hCur^2/8 > TOL` test via generic-curvature x LARGE-edge, independent of genuine
// knee proximity -- criterion still FAILED gate2/gate3 by 13x/22x.
//
// THIS ARM implements the named fix (mission accelerator): production ALREADY has a curvature-
// driven sizing field -- MetricSizingField.ts (`h = sqrt(8*maxSagMm/kappa)` from
// principalCurvatureMax, SurfaceMetricTensor.ts). Instead of testing raw hCur against an absolute
// tolerance, ask "does the DENSE/DIRECTIONAL curvature demand a FINER edge than what the REAL
// (un-floored, byte-faithful) production field ALREADY assigns this exact (u,t)?":
//   h_base(u,t)    = a REAL `MetricSizingField` instantiated the PRODUCTION way (AF_PROD_OPTS:
//                    resU=resT=128, maxSagMm=0.003, minEdge=0.1, maxEdge=1, grade=2) over the
//                    twin's REAL outer-wall SurfaceSampler (buildRegionWallGridCPU, 256x256 --
//                    the EXACT sampler buildFanRepairOuterFromCurves feeds assembleWatertight
//                    with, i.e. this genuinely reproduces what built this exact twin). NO
//                    curvatureFloor (Gyroid has none in production -- confirmed empirically below
//                    via buildAnalyticCurvatureFloor returning null, not assumed).
//   h_feature(u,t) = hCur * sqrt(maxSagMm / sagDir(hCur))  -- inverts the SAME sagitta law
//                    (sag ~ h^2, quadratic in edge length holding direction/shape fixed -- the
//                    same scaling P2.0-P2.3's `levelFor` already uses) using P2.3's OWN densely-
//                    sampled (SUB=24) DIRECTIONAL 2nd-fundamental-form sagitta `sagDir` computed
//                    over the facet's OWN actual edges -- reused VERBATIM, zero new curvature
//                    machinery. maxSagMm is the SAME AF_PROD_OPTS.maxSagMm=0.003 h_base targets,
//                    so h_feature and h_base are genuinely comparable (same target standard,
//                    different curvature ESTIMATE: band-limited-FD-on-256-sampler vs dense-exact).
//   escalate iff h_feature < h_base (accurate curvature demands finer than the field's OWN
//   promise) ; N = ceil(log2(h_base/h_feature)), capped at LEVEL_CAP=2.
// A SEPARATE diagnostic field h_base_floored is ALSO built by literally wiring
// buildGyroidCurvatureFloor's SUB=24 dense ISOTROPIC cell-sup kappa (the research analog of
// AnalyticCurvatureFloor.ts's buildSpiralRidgesFloor, purpose-built for Gyroid, resolution-
// matched to the SAME 128x128 sizing grid) into a SECOND MetricSizingField via the SAME
// `curvatureFloor` hook AnalyticCurvatureFloor.ts already ships for SpiralRidges -- answering
// "would simply wiring the ALREADY-EXISTING per-style-floor MECHANISM (if a Gyroid closed form
// were registered) alone already shrink the coarse-background population, even without going
// per-facet-directional?" -- reported, not gating.
//
// RULES: NEW FILE. READ-ONLY on all committed code + P2.0-P2.3 exchange artifacts (import/read
// only). No kernel edit. DEV-ONLY, research/ never imported by src/. Commit nothing. P2.3's OWN
// gate-buffer + dense-curvature plumbing (segHitsBoxL/buildFeatureIntersectorL/facetBox/
// facetGateBox/shapeOpAt/edgeSagAt/denseCellStats/scoreFullDelta/mulberry32/shuffleInPlace) is
// copied VERBATIM (this lineage's own established pattern -- P2.3 copied P2.1/P2.2 the same way)
// -- ONLY the escalation DECISION (delta vs absolute) is new. Time-budgeted dense sweep
// (elapsed-time stop) on the SAME deterministically-shuffled (seed 20260712) buffered population
// P2.3 sampled, so results are drawn from directly comparable facets.
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
import {
  gyroidAnalyticCurvature, GPC_FIELD, gpcR0, rDerivs, buildGyroidCurvatureFloor, type GyroidFieldP,
} from './_gyroid_prodclose_lib';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM } from './_analytic_floor_lib';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import { clipFeaturesToBox } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { MetricSizingField } from '../../src/renderers/webgpu/parametric/conforming/MetricSizingField';
import { metricStepsForSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceMetricTensor';
import { buildAnalyticCurvatureFloor } from '../../src/renderers/webgpu/parametric/conforming/AnalyticCurvatureFloor';
import type { StyleOptions } from '../../src/geometry/types';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_P2_4 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_4_crumbs.ndjson');
const EXPECT_HASH = '51a25eba-6a58e3e1'; // same champion twin P2.0-P2.3 scored (non-vacuity witness)
const TOL = 0.01; // maxSagMm-equivalent ACCEPTANCE tolerance (closure leg only -- unchanged from P2.0-P2.3)
const LEVEL_CAP = 2; // matches P2.0's adaptive +1/+2 (2.28% level-2 rate)
const SUB = 24; // buildGyroidCurvatureFloor's DOCUMENTED, EMPIRICALLY-VALIDATED dense cell-sup density
const BUF_MULT = 1.5; // "within ~1.5 cell-widths" -- P2.3's SOLVED recall gate-buffer, reused unchanged
const CB_HCUR_THRESHOLD_MM = 0.5; // PRE-REGISTERED "coarse background" cutoff (P2.3 diagnosed 0.6-1.4mm)
const TEST_TIMEOUT_MS = 16 * 60 * 1000;
const DENSE_SWEEP_BUDGET_MS = 8 * 60 * 1000; // hard wall-clock stop for Stage D
const HOT_POP_LOW = 1890, HOT_POP_HIGH = 31114; // P2.0's own extrapolated hot-population band

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.4', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch { /* a breadcrumb must never kill the run */ }
}
function bumpPriority(): void {
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best-effort */ }
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

// ─── verbatim mechanical copy of P2.3's gate-buffer machinery (ConformingWall.ts's private
// segHitsBox + buildFeatureIntersector are not exported there) -- UNCHANGED from _tierc_p2_3.test.ts. ───
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

function xyzToUt(x: number, y: number, z: number, H: number): [number, number] {
  let th = Math.atan2(y, x);
  if (th < 0) th += TAU;
  return [th / TAU, Math.min(1, Math.max(0, z / H))];
}
function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}
interface FacetBox {
  uMin: number; uMax: number; tMin: number; tMax: number; hCur: number;
  edges: [number, number][];
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
function facetGateBox(b: FacetBox): { u0: number; t0: number; size: number } {
  const u0 = b.uMin - Math.floor(b.uMin);
  const size = Math.max(b.uMax - b.uMin, b.tMax - b.tMin, 1e-9);
  return { u0, t0: b.tMin, size };
}

// ─── verbatim mechanical copy of P2.3's directional curvature machinery ───
type Vec3 = [number, number, number];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
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
function edgeSagAt(L: number, M: number, N: number, du: number, dt: number): number {
  return Math.abs(L * du * du + 2 * M * du * dt + N * dt * dt) / 8;
}
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

// ─── NEW this arm: the DELTA criterion (h_feature vs the REAL production h_base) ───
/** N = ceil(log2(hBase/hFeature)), capped, 0 when hFeature >= hBase (no escalation). */
function deltaLevel(hBase: number, hFeature: number): number {
  if (!(hFeature < hBase)) return 0;
  return Math.min(LEVEL_CAP, Math.max(1, Math.ceil(Math.log2(hBase / hFeature))));
}

describe.skipIf(!ON)('P2.4 — DELTA criterion against the REAL production base sizing field (MetricSizingField)', () => {
  it(
    'builds h_base via a real production MetricSizingField over the twin\'s real sampler, derives h_feature from P2.3\'s dense directional sagitta, escalates ONLY where h_feature<h_base, checks recall/precision/tri-cost/closure + the coarse-background reduction fraction',
    () => {
      const t0 = Date.now();
      bumpPriority();
      crumb('start');

      // ── STAGE A: build twin (byte-identical non-vacuity witness) ──
      const { H, outerXyz, outerIdx, hash, outerTris, buildMs, generalCurves } = buildTwin();
      crumb('build-done', { hash, outerTris, buildMs, generalCurvesCount: generalCurves.length });
      expect(hash, 'must reproduce the exact P2.0-P2.3 banked champion mesh (non-vacuity)').toBe(EXPECT_HASH);

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

      // ── STAGE A2 (NEW): confirm production has NO analytic curvature floor for Gyroid today
      // (only SpiralRidges is registered in AnalyticCurvatureFloor.ts) -- grounds "h_base below is
      // genuinely un-floored, exactly matching what actually built this twin" rather than assuming it. ──
      const afSpec = buildAnalyticCurvatureFloor(
        'GyroidManifold',
        {} as StyleOptions,
        { H: TIERC_COMMON_DIMS.H, Rt: TIERC_COMMON_DIMS.Rt, Rb: TIERC_COMMON_DIMS.Rb, expn: TIERC_COMMON_DIMS.expn },
        { resU: AF_PROD_OPTS.resU, resT: AF_PROD_OPTS.resT, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm },
      );
      crumb('analytic-floor-check', { afSpecIsNull: afSpec === null });
      expect(afSpec, 'production AnalyticCurvatureFloor has no Gyroid closed form -- h_base is genuinely un-floored today').toBeNull();

      // ── STAGE B (NEW): build h_base = a REAL production MetricSizingField over the twin's REAL
      // outer-wall sampler (the EXACT sampler buildFanRepairOuterFromCurves feeds assembleWatertight
      // with -- byte-faithful reproduction of what actually sized this twin). targetScale is left
      // absent (=1, "the sag floor"): AF_PROD_OPTS.budgetMode='cap' with targetTriangles=16M (8M/wall)
      // only coarsens when the scale=1 floor mesh EXCEEDS the per-wall budget; this twin's outer wall
      // is outerTris=2,242,984 << 4,000,000 leaves*2=8,000,000 tris budget, so cap mode's early-return
      // (ConformingWall.ts searchBudgetScale, floorLeaves<=targetLeaves branch) keeps scale=1 --
      // documented, not re-run (the full budget search is expensive and unnecessary: MetricSizingField
      // at targetScale=1 is EXACTLY what that early-return path builds). ──
      const stageBT0 = Date.now();
      const outerSampler = buildRegionWallGridCPU(getManifest('GyroidManifold').truth.rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256).sampler;
      const { hu, ht } = metricStepsForSampler(outerSampler);
      const sizingFieldBase = new MetricSizingField(outerSampler, {
        maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm, maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
        gradeRatio: AF_PROD_OPTS.gradeRatio, resU: AF_PROD_OPTS.resU, resT: AF_PROD_OPTS.resT,
      });
      // DIAGNOSTIC ONLY (not gating): what if Gyroid HAD a per-style analytic floor wired in, exactly
      // like AnalyticCurvatureFloor.ts's buildSpiralRidgesFloor mechanism -- via buildGyroidCurvatureFloor's
      // ALREADY-VALIDATED SUB=24 dense ISOTROPIC cell-sup kappa, resolution-matched to the SAME 128x128
      // sizing grid, wired through the SAME MetricSizingField.curvatureFloor hook production ships today.
      const gyroidFloor = buildGyroidCurvatureFloor(gpcR0, H, {
        resU: AF_PROD_OPTS.resU, resT: AF_PROD_OPTS.resT, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm,
      }, GPC_FIELD);
      const sizingFieldFloored = new MetricSizingField(outerSampler, {
        maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm, maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
        gradeRatio: AF_PROD_OPTS.gradeRatio, resU: AF_PROD_OPTS.resU, resT: AF_PROD_OPTS.resT,
        curvatureFloor: gyroidFloor.curvatureFloor, maxKappa: gyroidFloor.maxKappa,
      });
      const stageBMs = Date.now() - stageBT0;
      crumb('stageB-fields-built', { hu, ht, stageBMs });
      writeFileSync(join(OUT_DIR, 'p2_4_stageB.json'), JSON.stringify({
        hu, ht, stageBMs,
        note: 'h_base = real production MetricSizingField (no floor, byte-faithful to what built this twin, targetScale=1). h_base_floored = DIAGNOSTIC ONLY (buildGyroidCurvatureFloor SUB=24 isotropic wired via the SAME curvatureFloor hook AnalyticCurvatureFloor.ts ships for SpiralRidges).',
      }, null, 2));

      // ── STAGE C: reuse P2.3's EXACT gate-building + buffered scope sweep (unchanged) to regenerate
      // the SAME buffered feature-cell population P2.3 scored (recall is SOLVED -- reused, not re-derived). ──
      const featureLevel = AF_PROD_OPTS.featureLevel;
      const uMargin = 1.5 / (1 << featureLevel);
      const tMargin = AF_PROD_OPTS.nRing > 0 ? 1 / AF_PROD_OPTS.nRing : 1 / 64;
      const clippedFeatures = clipFeaturesToBox(generalCurves, uMargin, tMargin);
      const intersects = buildFeatureIntersectorL(clippedFeatures);
      crumb('gate-built', { clippedFeatureCount: clippedFeatures.length, uMargin, tMargin });

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
        pctOfMeshBuffered: (100 * featureCellIdxBuffered.length) / nF, scopeMs,
      });
      writeFileSync(join(OUT_DIR, 'p2_4_stageC.json'), JSON.stringify({
        bufferedCount: featureCellIdxBuffered.length, rawGateCount, nF, scopeMs,
        comparisonToP2_3BufferedCount: 1162578,
      }, null, 2));

      // ── STAGE D: single SUB=24 dense pass on a DETERMINISTICALLY SHUFFLED (seed 20260712, SAME as
      // P2.3) sample of the buffered population, hard-stopped at a wall-clock budget. Scores BOTH
      // P2.3's OLD absolute-directional criterion (nNeededDir, for direct side-by-side + the coarse-
      // background diagnostic) AND the NEW delta criterion (h_base vs h_feature) in ONE pass -- zero
      // extra curvature evaluations (h_base/h_feature reuse crit.sagDir + box.hCur + O(1) bilinear
      // MetricSizingField.edgeLength lookups). ──
      const shuffled = featureCellIdxBuffered.slice();
      shuffleInPlace(shuffled, mulberry32(20260712));
      let flaggedL1Dir = 0, flaggedL2Dir = 0, tpL1Dir = 0, n1Dir = 0, n2Dir = 0; // OLD (P2.3) absolute-directional, for reference
      let flaggedL1Delta = 0, flaggedL2Delta = 0, tpL1Delta = 0, n1Delta = 0, n2Delta = 0; // NEW delta criterion
      let cbFPTotal = 0, cbFPStillFlaggedDelta = 0; // the KEY diagnostic: coarse-background false positives, delta-killed?
      const fpSampleDelta: Array<{ f: number; hCur: number; hBase: number; hFeature: number; sagDir: number; nNeeded: number }> = [];
      const cbSample: Array<{ f: number; hCur: number; hBase: number; hFeature: number; sagDir: number; deltaFlag: boolean }> = [];
      const MAX_SAMPLE = 25;
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
        const uc = (box.uMin + box.uMax) / 2, tc = (box.tMin + box.tMax) / 2;
        const hBase = sizingFieldBase.edgeLength(uc, tc);
        const hFeature = crit.sagDir > 1e-15 ? box.hCur * Math.sqrt(AF_PROD_OPTS.maxSagMm / crit.sagDir) : Infinity;
        const nNeededDelta = deltaLevel(hBase, hFeature);
        processedSub++;
        const isHot = hotFacetSet.has(f);
        // OLD (P2.3) absolute-directional, for reference / the coarse-background diagnostic below.
        if (crit.nNeededDir >= 1) {
          flaggedL1Dir++;
          if (crit.nNeededDir >= 2) { flaggedL2Dir++; n2Dir++; } else { n1Dir++; }
          if (isHot) tpL1Dir++;
        }
        // NEW delta criterion.
        if (nNeededDelta >= 1) {
          flaggedL1Delta++;
          if (nNeededDelta >= 2) { flaggedL2Delta++; n2Delta++; } else { n1Delta++; }
          if (isHot) tpL1Delta++;
          else if (fpSampleDelta.length < MAX_SAMPLE) fpSampleDelta.push({ f, hCur: box.hCur, hBase, hFeature, sagDir: crit.sagDir, nNeeded: nNeededDelta });
        }
        // KEY DIAGNOSTIC: among P2.3's OWN (absolute-directional) false positives that are "coarse
        // background" (hCur >= CB_HCUR_THRESHOLD_MM, PRE-REGISTERED, matching P2.3's diagnosed
        // 0.6-1.4mm band) -- does the delta reframing kill the flag?
        if (crit.nNeededDir >= 1 && !isHot && box.hCur >= CB_HCUR_THRESHOLD_MM) {
          cbFPTotal++;
          if (nNeededDelta >= 1) {
            cbFPStillFlaggedDelta++;
            if (cbSample.length < MAX_SAMPLE) cbSample.push({ f, hCur: box.hCur, hBase, hFeature, sagDir: crit.sagDir, deltaFlag: true });
          } else if (cbSample.length < MAX_SAMPLE) {
            cbSample.push({ f, hCur: box.hCur, hBase, hFeature, sagDir: crit.sagDir, deltaFlag: false });
          }
        }
        if (k % 20_000 === 0 || Date.now() - lastCrumb > 30_000) {
          crumb('sub-sweep-progress', {
            k, total: shuffled.length, flaggedL1Dir, flaggedL1Delta, tpL1Dir, tpL1Delta, cbFPTotal, cbFPStillFlaggedDelta, elapsedMs: elapsed,
          });
          lastCrumb = Date.now();
        }
      }
      const subSweepMs = Date.now() - subT0;
      const precisionL1Dir = flaggedL1Dir > 0 ? tpL1Dir / flaggedL1Dir : 0;
      const precisionL1Delta = flaggedL1Delta > 0 ? tpL1Delta / flaggedL1Delta : 0;
      const extrapFactor = processedSub > 0 ? shuffled.length / processedSub : 1;
      const flaggedL1DirExtrap = Math.round(flaggedL1Dir * extrapFactor);
      const flaggedL1DeltaExtrap = Math.round(flaggedL1Delta * extrapFactor);
      const flaggedL2DeltaExtrap = Math.round(flaggedL2Delta * extrapFactor);
      const triAddDeltaExtrap = (flaggedL1DeltaExtrap - flaggedL2DeltaExtrap) * 3 + flaggedL2DeltaExtrap * 15;
      const pctTriAddDeltaExtrap = (100 * triAddDeltaExtrap) / outerTris;
      const cbReductionFraction = cbFPTotal > 0 ? 1 - cbFPStillFlaggedDelta / cbFPTotal : null;
      crumb('sub-sweep-done', {
        processedSub, total: shuffled.length, truncated, extrapFactor,
        flaggedL1Dir, flaggedL1Delta, tpL1Dir, tpL1Delta, precisionL1Dir, precisionL1Delta,
        cbFPTotal, cbFPStillFlaggedDelta, cbReductionFraction, subSweepMs,
      });
      writeFileSync(join(OUT_DIR, 'p2_4_stageD.json'), JSON.stringify({
        processedSub, total: shuffled.length, truncated, extrapFactor, subSweepMs,
        oldAbsDir: { flaggedL1: flaggedL1Dir, flaggedL2: flaggedL2Dir, tpL1: tpL1Dir, precisionL1: precisionL1Dir, n1Dir, n2Dir, flaggedL1Extrap: flaggedL1DirExtrap },
        newDelta: {
          flaggedL1: flaggedL1Delta, flaggedL2: flaggedL2Delta, tpL1: tpL1Delta, precisionL1: precisionL1Delta,
          n1Delta, n2Delta, flaggedL1Extrap: flaggedL1DeltaExtrap, flaggedL2Extrap: flaggedL2DeltaExtrap,
          triAddExtrap: triAddDeltaExtrap, pctTriAddExtrap: pctTriAddDeltaExtrap,
          n1PctOfFlagged: flaggedL1Delta > 0 ? (100 * n1Delta) / flaggedL1Delta : null,
          n2PctOfFlagged: flaggedL1Delta > 0 ? (100 * n2Delta) / flaggedL1Delta : null,
        },
        coarseBackgroundDiagnostic: {
          cbHcurThresholdMm: CB_HCUR_THRESHOLD_MM, cbFPTotal, cbFPStillFlaggedDelta, cbFPKilledByDelta: cbFPTotal - cbFPStillFlaggedDelta, cbReductionFraction,
          cbSample,
        },
        falsePositiveSampleDelta: fpSampleDelta,
      }, null, 2));

      // ── STAGE E: recall over the FULL 1,890 Newton-confirmed hot set (cheap, direct), using the
      // NEW delta criterion crossed with P2.3's SOLVED buffered gate. ──
      const hotRecMap = new Map<number, { nNeededDelta: number; nNeededDir: number; bufGate: boolean }>();
      let hotHitsBufGateDelta = 0, hotHitsBufGateDir = 0, hotMissingBufGate = 0;
      for (const f of hotFacetSet) {
        const box = facetBox(outerIdx, outerXyz, H, f);
        const gb = facetGateBox(box);
        const buf = BUF_MULT * gb.size;
        const bufGate = intersects(gb.u0, gb.t0, gb.size, buf);
        const crit = scoreFullDelta(box, gpcR0, H);
        const uc = (box.uMin + box.uMax) / 2, tc = (box.tMin + box.tMax) / 2;
        const hBase = sizingFieldBase.edgeLength(uc, tc);
        const hFeature = crit.sagDir > 1e-15 ? box.hCur * Math.sqrt(AF_PROD_OPTS.maxSagMm / crit.sagDir) : Infinity;
        const nNeededDelta = deltaLevel(hBase, hFeature);
        hotRecMap.set(f, { nNeededDelta, nNeededDir: crit.nNeededDir, bufGate });
        if (!bufGate) hotMissingBufGate++;
        if (bufGate && nNeededDelta >= 1) hotHitsBufGateDelta++;
        if (bufGate && crit.nNeededDir >= 1) hotHitsBufGateDir++;
      }
      const recallBufGateDelta = hotHitsBufGateDelta / hotFacetSet.size;
      const recallBufGateDir = hotHitsBufGateDir / hotFacetSet.size; // cross-check vs P2.3's banked 1.0
      crumb('hotset-recall-done', { hotMissingBufGate, recallBufGateDelta, recallBufGateDir });
      writeFileSync(join(OUT_DIR, 'p2_4_stageE.json'), JSON.stringify({
        hotSetSize: hotFacetSet.size, hotMissingBufGate, recallBufGateDelta, recallBufGateDir,
        comparisonToP2_3: { p2_3_recallBufGateDir: 1 },
      }, null, 2));

      // ── STAGE F: closure vs P2.0's OWN banked per-facet Newton ground truth (1,710 rows, ZERO new
      // Newton calls), using the NEW delta criterion's escalation level. ──
      let closureOkFlaggedDelta = 0, closureFailFlaggedDelta = 0;
      let worstResidualEndToEndDelta = 0, worstResidualAmongFlaggedDelta = 0;
      const closureFailSampleDelta: Array<{ f: number; ourN: number; afterOurN: number; before: number }> = [];
      let joinMisses = 0;
      for (const row of p2s2Rows) {
        const rec = hotRecMap.get(row.f);
        if (!rec) { joinMisses++; continue; }
        const { nNeededDelta, bufGate } = rec;
        const ourFlag = bufGate && nNeededDelta >= 1;
        const ourN = Math.min(LEVEL_CAP, nNeededDelta);
        const residual = ourFlag ? (ourN >= 2 ? row.afterU2 : row.afterU1) : row.before;
        if (residual > worstResidualEndToEndDelta) worstResidualEndToEndDelta = residual;
        if (ourFlag) {
          if (residual > worstResidualAmongFlaggedDelta) worstResidualAmongFlaggedDelta = residual;
          if (residual <= TOL) closureOkFlaggedDelta++;
          else {
            closureFailFlaggedDelta++;
            if (closureFailSampleDelta.length < 30) closureFailSampleDelta.push({ f: row.f, ourN, afterOurN: residual, before: row.before });
          }
        }
      }
      crumb('closure-check-done', {
        closureOkFlaggedDelta, closureFailFlaggedDelta, worstResidualEndToEndDelta, joinMisses,
      });

      // ── PRE-REGISTERED GATE evaluation (all 4, SAME thresholds as P2.3 for direct comparability) ──
      const gate1_recall = recallBufGateDelta >= 0.90;
      const ratioToHotPopHigh = flaggedL1DeltaExtrap / HOT_POP_HIGH;
      const ratioToHotPopLow = flaggedL1DeltaExtrap / HOT_POP_LOW;
      const gate2_precision = ratioToHotPopHigh <= 3;
      const gate3_triCost = pctTriAddDeltaExtrap <= 10;
      const gate4_closure = worstResidualEndToEndDelta <= TOL;
      const allPass = gate1_recall && gate2_precision && gate3_triCost && gate4_closure;

      const summary = {
        experiment: 'P2.4', at: new Date().toISOString(), hash, outerTris, nF,
        criterion: {
          hBase: 'real production MetricSizingField(outerSampler, AF_PROD_OPTS, targetScale=1) -- no floor (Gyroid has none in production, confirmed)',
          hFeature: 'hCur * sqrt(AF_PROD_OPTS.maxSagMm / sagDir) -- sagDir = P2.3\'s SUB=24 dense DIRECTIONAL 2nd-fundamental-form sagitta over the facet\'s OWN edges',
          escalate: 'iff hFeature < hBase; N = min(2, max(1, ceil(log2(hBase/hFeature))))',
        },
        scope: { bufferedCount: featureCellIdxBuffered.length, rawGateCount, nF, scopeMs, comparisonToP2_3BufferedCount: 1162578 },
        denseSweep: { processedSub, populationSampled: shuffled.length, truncated, extrapFactor, subSweepMs },
        oldAbsDirOnSample: { flaggedL1: flaggedL1Dir, tpL1: tpL1Dir, precisionL1: precisionL1Dir, flaggedL1Extrap: flaggedL1DirExtrap },
        newDeltaOnSample: {
          flaggedL1Sample: flaggedL1Delta, tpL1Sample: tpL1Delta, precisionL1: precisionL1Delta,
          flaggedL1Extrap: flaggedL1DeltaExtrap, pctFlaggedOfWholeMeshExtrap: (100 * flaggedL1DeltaExtrap) / nF,
          pctTriAddExtrap: pctTriAddDeltaExtrap, n1Delta, n2Delta,
          n1PctOfFlagged: flaggedL1Delta > 0 ? (100 * n1Delta) / flaggedL1Delta : null,
          n2PctOfFlagged: flaggedL1Delta > 0 ? (100 * n2Delta) / flaggedL1Delta : null,
        },
        coarseBackgroundDiagnostic: {
          cbHcurThresholdMm: CB_HCUR_THRESHOLD_MM, cbFPTotal, cbFPStillFlaggedDelta,
          cbFPKilledByDelta: cbFPTotal - cbFPStillFlaggedDelta, cbReductionFraction,
        },
        recall: { hotSetSize: hotFacetSet.size, hotMissingBufGate, recallBufGateDelta, recallBufGateDir },
        closure: {
          p2s2RowCount: p2s2Rows.length, joinMisses, closureOkFlaggedDelta, closureFailFlaggedDelta,
          worstResidualEndToEndDelta, worstResidualAmongFlaggedDelta, closureFailSampleDelta,
        },
        gates: {
          gate1_recall: { value: recallBufGateDelta, threshold: 0.90, pass: gate1_recall },
          gate2_precision: { flaggedL1DeltaExtrap, ratioToHotPopHigh, ratioToHotPopLow, thresholdRatio: 3, pass: gate2_precision },
          gate3_triCost: { value: pctTriAddDeltaExtrap, threshold: 10, pass: gate3_triCost },
          gate4_closure: { value: worstResidualEndToEndDelta, threshold: TOL, pass: gate4_closure },
          ALL_PASS: allPass,
        },
        falsePositiveSampleDelta: fpSampleDelta,
        comparisonToP2_3: {
          p2_3_recallBufGateDir: 1, p2_3_precisionL1Dir: 0.004927561889587206,
          p2_3_flaggedL1DirExtrap: 411029, p2_3_ratioToHotPopHigh: 13.210419746737802,
          p2_3_pctTriAddExtrap: 224.60129006716053, p2_3_closureWorstResidual: 0.009997442195647466,
          p2_3_n1PctOfFlagged: 22.862510204282355, p2_3_n2PctOfFlagged: 77.13748979571764,
        },
        elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_4_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', {
        elapsedMs: Date.now() - t0, gate1_recall, gate2_precision, gate3_triCost, gate4_closure, allPass, cbReductionFraction,
      });
      // eslint-disable-next-line no-console
      console.log(`[P2.4] DONE\n${JSON.stringify(summary, null, 2)}`);
      // eslint-disable-next-line no-console
      console.log(
        `[P2.4] VERDICT TABLE\n` +
        `  gate1 recall(bufGate+delta)  = ${recallBufGateDelta.toFixed(4)}  (>=0.90)        -> ${gate1_recall ? 'PASS' : 'FAIL'}\n` +
        `  gate2 flaggedL1(delta,extrap)= ${flaggedL1DeltaExtrap}  (ratio to 31114 hot-pop-high = ${ratioToHotPopHigh.toFixed(2)}x, target 1-3x) -> ${gate2_precision ? 'PASS' : 'FAIL'}\n` +
        `  gate3 triCost(delta,extrap)  = ${pctTriAddDeltaExtrap.toFixed(2)}%  (<=10%)         -> ${gate3_triCost ? 'PASS' : 'FAIL'}\n` +
        `  gate4 closure worst(delta)   = ${worstResidualEndToEndDelta.toFixed(6)}  (<=0.01)   -> ${gate4_closure ? 'PASS' : 'FAIL'}\n` +
        `  ALL_PASS = ${allPass}\n` +
        `  KEY DIAGNOSTIC coarse-background reduction = ${cbReductionFraction === null ? 'N/A (0 in sample)' : (100 * cbReductionFraction).toFixed(1) + '%'} (${cbFPTotal - cbFPStillFlaggedDelta}/${cbFPTotal} killed)`,
      );

      expect(hotFacetSet.size, 'sanity: non-vacuous run').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
