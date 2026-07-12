// _tierc_p2_0.test.ts — Curved-Element Phase-2 program, arm P2.0 (FEASIBILITY DISCRIMINATOR).
// Charter: research/lab/2026-07-12-curved-element-phase2-charter.md §P2.0. Companion:
// research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md Addenda 13+14 (Gyroid knee =
// edge-class-localized to ~166 hot arcs; Newton-worst 0.02491654414922634 at facets
// 1336851/1336852, u=0.29138268584834043 t=0.719970703125; curve already sits AT the exact
// analytic curvature-peak locus (median |peak-nominal| 8.47e-6); MECHANISM (precise):
// featureLevel=11 fixes the CROSS-BAND quadtree cell size independent of along-curve point
// placement — a vertex sits exactly on the analytic C1-not-C2 knee, but the flat facet spanning
// AWAY from it chords the curvature spike; GLOBAL cross-band refine (featureLevel 11->12) made it
// WORSE via relief-chord-cliff (outer tris +1.57%, survivors +134%); LOCAL cross-band refinement
// at just the hot cells was explicitly left UNTESTED — this file tests it).
//
// HYPOTHESIS: does LOCAL across-band subdivision AT the hot knee cells/facets (not a global
// density escalation) drop the residual <=0.01 (=> cell-scoped refinement is the answer, curved
// elements UNNEEDED — build the P2.1 kernel primitive), or does the residual persist even with
// smaller flat facets (=> curved elements REQUIRED — the C1-not-C2 discontinuity is a genuine
// curvature-following need no flat facet at any finite size resolves)?
//
// METHOD (cheapest-decisive-first; reuses the committed band-edge twin plumbing; builds NO new
// mechanism/instrument — only a thin, honest composition of already-exported primitives):
//  S1 (single-facet, decisive, seconds once the twin is built): rebuild the EXACT champion
//     fanRepair band-edge twin via buildFanRepairOuterFromCurves (_tierc_a3_reloc_lib.ts —
//     byte-identical to _tierc_a3_char.test.ts's own buildFanRepairOuter), assert the hash
//     reproduces the A1/A3-char banked value (non-vacuity: this IS the champion mesh). Pull the
//     single worst knee facet (f=1336851, twin f=1336852). Classify its "on-knee" vertex — the one
//     with smallest dEdge = min(||val|-inner|,||val|-outer|) via gyroidVal/wallIsolevels (closed
//     form, no Newton) — versus the other two "across-band" vertices. ACROSS-BAND-bisect the
//     LONGER of the on-knee vertex's two incident edges at its midpoint, the midpoint LIFTED to
//     the exact analytic surface (rA(theta,z) evaluated at the interpolated (u,t) — not a linear
//     xyz average). Recurse once more on each child (2 levels: 2 sub-facets, then 4, each child
//     re-classified the same way). Re-score every sub-facet's Newton-worst: worst-radial point via
//     denseBary(8) (_gyroid_truthLib.ts — the SAME 45-point lattice gpcPrescreenDetail uses via
//     _pf_rebaselineRuler.ts's byte-identical denseBary), Newton-CONFIRMED via newtonNearest ONLY
//     when radial>tol (radial is a PROVEN safe upper bound on the true Newton-nearest — a facet
//     whose worst-radial point already sits <=tol needs no Newton call at all: the "converged mesh
//     screens green cheaply" trick, C2-full-patch-verdict).
//  S2 (scaled, gated on S1 showing subdivision helps): apply the IDENTICAL recipe to the full
//     Newton-CONFIRMED hot-facet population banked by armA3_char
//     (research/exchange/tierc/armA3_char_confirmed.json, topK+stride sources only — 1,890 unique
//     facet indices, the champion's own Newton-validated unbiased sample of the ~166 hot arcs,
//     REUSED not re-derived). Reports population Newton-worst / outlier-count before vs after
//     1-split vs after 2-split, plus the ACTUAL triangle-count delta (bounded — only touched
//     facets gain triangles) and an honest, clearly-labelled extrapolation to the banked ~31,114
//     full-population estimate. Time-budgeted (a deadline, not a fixed count — the established
//     resilience pattern), shuffled processing order (any truncated prefix stays an unbiased
//     domain sample), breadcrumbed + checkpointed every <=30s.
//  S3 (T-junction cost, folded into S2, cheap/exact, ZERO Newton calls): for the same hot-facet
//     population, the level-1 bisected edge is a REAL, original shared-by-index mesh edge; a
//     single pass over the full outer-wall index buffer (packed sorted/hashed key, matches
//     classifyNonManLoci's proven-safe 2^27 convention) finds, for each such edge, whether its
//     other incident facet is ALSO in the hot set. If not, that is exactly the T-junction a
//     cell-scoped level-override kernel primitive (P2.1) would have to resolve under 2:1
//     quadtree-balance propagation.
//
// VERDICT (pre-registered, per the charter):
//  PASS iff (a) S1's 2-split Newton-worst <=0.01 for the single worst facet AND (b) S2's
//  population closes to <=0.01 (or a large characterized reduction) at bounded (<=+10%) triangle
//  cost => CELL-SCOPED REFINEMENT is the answer; curved elements UNNEEDED; build P2.1.
//  FAIL iff the subdivided sub-facets do NOT drop <=0.01 even at 2-split => CURVED ELEMENTS
//  REQUIRED; characterize whether the reduction ratio is consistent with chord~extent^2 (a
//  resolvable numerical/discretization floor — subdivide further) or plateaus/violates that
//  scaling (a genuine C1-not-C2 slope discontinuity no flat facet at any finite size follows).
//
// RULES: NEW FILE ONLY. READ-ONLY on all committed code — reuses buildFanRepairOuterFromCurves,
// extractBandedgeContours/contoursToFeatureLines/gyroidVal/wallIsolevels, newtonNearest/denseBary
// BY IMPORT. NO kernel edit, NO src/ edit. DEV-ONLY, research/ never imported by src/. Commit
// nothing (P2.0 is a research-side discriminator feeding the coordinator's own registry entry).
// Resilience: TWO independently env-gated tests (S1 fast, S2 long/background-safe) so a kill only
// loses the unfinished one; breadcrumb every <=30s; partial-population checkpoint flushed during
// the S2 loop; self-bumps AboveNormal priority (Windows EcoQoS mitigation).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import type { AnalyticRadiusFn } from './labkit';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  GBE_EXTRACT_DEFAULT, GBE_FIELD, extractBandedgeContours, contoursToFeatureLines,
} from './_gyroid_bandedge_lib';
import { gyroidVal, wallIsolevels } from './_gyroidContourLib';
import { newtonNearest, denseBary, type NewtonOpts } from './_gyroid_truthLib';
import { buildFanRepairOuterFromCurves } from './_tierc_a3_reloc_lib';

const TAU = Math.PI * 2;
const ON_S1 = process.env.PF_TIERC_P2_0_S1 === '1';
const ON_S2 = process.env.PF_TIERC_P2_0_S2 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_0_crumbs.ndjson');
/** A1/A3-char proven fanRepair band-edge FULL-mesh hash — non-vacuity witness that this run IS
 *  the exact champion construction the banked Newton-worst 0.02491654414922634 was measured on. */
const EXPECT_HASH = '51a25eba-6a58e3e1';
const TOL = 0.01;
const NEWTON_OPTS: NewtonOpts = { seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
const F_WORST = 1336851;
const F_WORST_TWIN = 1336852;
const BANKED_NEWTON_WORST = 0.02491654414922634;
const DENSE8 = denseBary(8);
const S1_TEST_TIMEOUT_MS = 9 * 60 * 1000;
const S2_TEST_TIMEOUT_MS = 29 * 60 * 1000;
const S2_POP_BUDGET_MS = 9 * 60 * 1000;
/** Addendum13/14 banked stratified estimate of the TRUE full band-edge outlier population — used
 *  ONLY to label an honest extrapolation of the measured tri-cost; never treated as measured here. */
const ESTIMATED_FULL_HOT_POPULATION = 31114;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.0', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}
function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}
function bumpPriority(): void {
  try {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    // eslint-disable-next-line no-console
    console.log('[p2.0] note: could not self-bump priority (EcoQoS throttle risk remains)');
  }
}

function percentiles(arr: number[]): {
  min: number; p25: number; p50: number; p75: number; p90: number; p99: number; max: number; mean: number;
} {
  if (arr.length === 0) return { min: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, max: 0, mean: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const pct = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { min: s[0], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), p99: pct(0.99), max: s[s.length - 1], mean };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

function xyzToUt(x: number, y: number, z: number, H: number): [number, number] {
  let th = Math.atan2(y, x);
  if (th < 0) th += TAU;
  return [th / TAU, Math.min(1, Math.max(0, z / H))];
}

// ═══════════════════════════════ geometry: across-band bisection, analytic-lifted ═══════════════════════════════

interface VUt { u: number; t: number; x: number; y: number; z: number; origIdx: number; }
interface Tri3 { v: [VUt, VUt, VUt]; }

function liftUt(u: number, t: number, rA: AnalyticRadiusFn, H: number, origIdx = -1): VUt {
  const uu = u - Math.floor(u);
  const tt = Math.min(1, Math.max(0, t));
  const th = TAU * uu, z = tt * H;
  const r = rA(th, z);
  return { u: uu, t: tt, x: r * Math.cos(th), y: r * Math.sin(th), z, origIdx };
}
function midpointLifted(a: VUt, b: VUt, rA: AnalyticRadiusFn, H: number): VUt {
  let du = b.u - a.u;
  if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
  const um = a.u + du / 2;
  const tm = (a.t + b.t) / 2;
  return liftUt(um, tm, rA, H, -1);
}
function dist3(a: VUt, b: VUt): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

const ISO = wallIsolevels(GBE_FIELD);
function dEdgeAt(u: number, t: number): number {
  const av = Math.abs(gyroidVal(u, t, GBE_FIELD));
  return Math.min(Math.abs(av - ISO.inner), Math.abs(av - ISO.outer));
}

interface BisectResult {
  children: [Tri3, Tri3];
  kneeIdx: number; farIdx: number; nearIdx: number; // indices into the INPUT tri.v
  midpoint: VUt;
}
/** ACROSS-BAND bisection: find the vertex nearest the isolevel (cheap dEdge, no Newton) — the
 *  "on-knee" vertex; bisect the LONGER of its two incident edges at the analytic-lifted midpoint.
 *  Applying this recursively to a child re-classifies knee-nearest from THAT child's own vertices
 *  (a level-1 child not containing the original on-knee vertex gets a fresh, locally-valid one).
 *  CAVEAT (found by S1 run 1): EVERY mesh vertex — contour-injected or plain quadtree-grid — is
 *  independently already ~1e-6mm from the analytic surface (outerXyz is built by evaluating rA at
 *  EVERY vertex's (u,t), not just contour ones), so dEdge does not mark "the one vertex that's on
 *  the surface" (all three already are); it only marks "nearest the val=isolevel locus". This
 *  method is KEPT for comparison against the isolevel-agnostic bisectUniform below — see the S1
 *  summary for which one actually reduces the chord. */
function bisectAcrossBand(tri: Tri3, rA: AnalyticRadiusFn, H: number): BisectResult {
  const dE = tri.v.map((v) => dEdgeAt(v.u, v.t));
  let k = 0; for (let i = 1; i < 3; i++) if (dE[i] < dE[k]) k = i;
  const iA = (k + 1) % 3, iB = (k + 2) % 3;
  const dA = dist3(tri.v[k], tri.v[iA]), dB = dist3(tri.v[k], tri.v[iB]);
  const iFar = dA >= dB ? iA : iB, iNear = dA >= dB ? iB : iA;
  const mid = midpointLifted(tri.v[k], tri.v[iFar], rA, H);
  const children: [Tri3, Tri3] = [
    { v: [tri.v[k], mid, tri.v[iNear]] },
    { v: [mid, tri.v[iFar], tri.v[iNear]] },
  ];
  return { children, kneeIdx: k, farIdx: iFar, nearIdx: iNear, midpoint: mid };
}

/** UNIFORM "red" quadrisection — the standard, assumption-free local-refinement primitive: bisect
 *  ALL THREE edges at their analytic-lifted midpoints, producing 4 similar sub-triangles each at
 *  HALF the linear extent (in both parametric directions at once). This is the most faithful
 *  proxy for what a REAL cell-scoped quadtree featureLevel+1 escalation actually does to the CDT
 *  triangles inside a flagged cell (a quadtree level bump is an unconditional 2x2 parametric
 *  split, not a heuristic single-edge bisection) — no vertex-classification assumption at all. */
function bisectUniform(tri: Tri3, rA: AnalyticRadiusFn, H: number): [Tri3, Tri3, Tri3, Tri3] {
  const m01 = midpointLifted(tri.v[0], tri.v[1], rA, H);
  const m12 = midpointLifted(tri.v[1], tri.v[2], rA, H);
  const m20 = midpointLifted(tri.v[2], tri.v[0], rA, H);
  return [
    { v: [tri.v[0], m01, m20] },
    { v: [m01, tri.v[1], m12] },
    { v: [m20, m12, tri.v[2]] },
    { v: [m01, m12, m20] },
  ];
}

// ═══════════════════════════════ scoring: worst-radial -> Newton-confirm-only-if-needed ═══════════════════════════════

function radialDevAt(x: number, y: number, z: number, rA: AnalyticRadiusFn, H: number): number {
  if (z < -1e-9 || z > H + 1e-9) return Infinity;
  let th = Math.atan2(y, x);
  if (th < 0) th += TAU;
  return Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
}
/** Worst RADIAL sample over denseBary(8) — the SAME lattice + SAME formula gpcPrescreenDetail uses
 *  (_gyroid_prodclose_lib.ts, via _pf_rebaselineRuler.ts's byte-identical denseBary(8)). */
function worstRadialInTri(tri: Tri3, rA: AnalyticRadiusFn, H: number): { x: number; y: number; z: number; radial: number } {
  let worst = -1, wx = 0, wy = 0, wz = 0;
  for (const [wa, wb, wc] of DENSE8) {
    const x = wa * tri.v[0].x + wb * tri.v[1].x + wc * tri.v[2].x;
    const y = wa * tri.v[0].y + wb * tri.v[1].y + wc * tri.v[2].y;
    const z = wa * tri.v[0].z + wb * tri.v[1].z + wc * tri.v[2].z;
    const d = radialDevAt(x, y, z, rA, H);
    if (d > worst) { worst = d; wx = x; wy = y; wz = z; }
  }
  return { x: wx, y: wy, z: wz, radial: worst };
}

let newtonCallCount = 0;
let newtonTimeMs = 0;
/** min(radial, Newton) — radial is a PROVEN safe upper bound (newtonNearest minimises over ALL
 *  (theta,z); radial evaluates only the query's OWN (theta,z)), so a facet whose worst-radial point
 *  is already <=tol needs NO Newton call (the "converged mesh screens green cheaply" trick,
 *  C2-full-patch-verdict). Matches the champion's own `Math.min(r.radial, newtonNearest(...).dist)`
 *  pattern (_tierc_a3_char.test.ts) exactly. */
function newtonWorstOfTri(
  tri: Tri3, rA: AnalyticRadiusFn, H: number, tol: number,
): { nd: number; usedNewton: boolean; radial: number } {
  const w = worstRadialInTri(tri, rA, H);
  if (w.radial <= tol) return { nd: w.radial, usedNewton: false, radial: w.radial };
  const t0 = Date.now();
  const nd = Math.min(w.radial, newtonNearest(rA, H, w.x, w.y, w.z, NEWTON_OPTS).dist);
  newtonTimeMs += Date.now() - t0; newtonCallCount++;
  return { nd, usedNewton: true, radial: w.radial };
}

// ═══════════════════════════════ shared: rebuild the exact champion twin ═══════════════════════════════

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
function getTri(outerIdx: Uint32Array, outerXyz: Float32Array, H: number, f: number): Tri3 {
  const ia = outerIdx[3 * f], ib = outerIdx[3 * f + 1], ic = outerIdx[3 * f + 2];
  const mk = (i: number): VUt => {
    const x = outerXyz[3 * i], y = outerXyz[3 * i + 1], z = outerXyz[3 * i + 2];
    const [u, t] = xyzToUt(x, y, z, H);
    return { u, t, x, y, z, origIdx: i };
  };
  return { v: [mk(ia), mk(ib), mk(ic)] };
}

// ═══════════════════════════════ S1 — single-facet decisive test ═══════════════════════════════

interface FacetResult {
  f: number; u: number; t: number;
  vertexDEdge: number[]; perVertexNewton: number[];
  before: number; beforeUsedNewton: boolean; beforeRadial: number; bankedBefore: number | null;
  kneeIdx: number; farIdx: number; nearIdx: number;
  acrossEdgeLenMm: [number, number]; midpointNewtonSelfDist: number;
  after1: number; after1Detail: Array<{ nd: number; usedNewton: boolean; radial: number }>;
  after2: number; after2Detail: Array<{ nd: number; usedNewton: boolean; radial: number }>;
  ratio1: number | null; ratio2: number | null;
  // uniform "red" quadrisection (isolevel-agnostic, most faithful proxy for a real quadtree
  // featureLevel+1/+2 cell escalation) — reported alongside the dEdge-anchored method above.
  afterU1: number; afterU1Detail: Array<{ nd: number; usedNewton: boolean; radial: number }>;
  afterU2: number; afterU2OutlierCount: number;
  ratioU1: number | null; ratioU2: number | null;
}

describe.skipIf(!ON_S1)('P2.0 S1 — single-facet decisive across-band subdivision (Gyroid band-edge knee)', () => {
  it(
    'bisects the single worst knee facet across-band (2 then 4 sub-facets), lifted to the exact analytic surface',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('s1-start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const { rA, H, outerXyz, outerIdx, hash, outerTris, buildMs } = buildTwin();
      crumb('s1-build-done', { hash, outerTris, buildMs });
      expect(hash, 'must reproduce the exact A1/A3-char banked champion mesh (non-vacuity)').toBe(EXPECT_HASH);

      const results: Record<string, FacetResult> = {};
      for (const f of [F_WORST, F_WORST_TWIN]) {
        const tri0 = getTri(outerIdx, outerXyz, H, f);
        const dE = tri0.v.map((v) => dEdgeAt(v.u, v.t));
        const perVertexNewton = tri0.v.map((v) => newtonNearest(rA, H, v.x, v.y, v.z, NEWTON_OPTS).dist);
        const before = newtonWorstOfTri(tri0, rA, H, TOL);

        const lvl1 = bisectAcrossBand(tri0, rA, H);
        const midpointNewton = newtonNearest(rA, H, lvl1.midpoint.x, lvl1.midpoint.y, lvl1.midpoint.z, NEWTON_OPTS).dist;
        const s1c0 = newtonWorstOfTri(lvl1.children[0], rA, H, TOL);
        const s1c1 = newtonWorstOfTri(lvl1.children[1], rA, H, TOL);
        const after1 = Math.max(s1c0.nd, s1c1.nd);

        const lvl2a = bisectAcrossBand(lvl1.children[0], rA, H);
        const lvl2b = bisectAcrossBand(lvl1.children[1], rA, H);
        const s2 = [lvl2a.children[0], lvl2a.children[1], lvl2b.children[0], lvl2b.children[1]]
          .map((tri) => newtonWorstOfTri(tri, rA, H, TOL));
        const after2 = Math.max(...s2.map((s) => s.nd));

        const acrossEdgeLenMm: [number, number] = [
          dist3(tri0.v[lvl1.kneeIdx], tri0.v[lvl1.farIdx]),
          dist3(tri0.v[lvl1.kneeIdx], tri0.v[lvl1.nearIdx]),
        ];

        // uniform "red" quadrisection: 1 level -> 4 children (featureLevel+1 proxy), 2 levels ->
        // 16 (featureLevel+2 proxy, each of the 4 quadrisected again).
        const u1 = bisectUniform(tri0, rA, H);
        const u1Scored = u1.map((tri) => newtonWorstOfTri(tri, rA, H, TOL));
        const afterU1 = Math.max(...u1Scored.map((s) => s.nd));
        const u2: Tri3[] = [];
        for (const child of u1) u2.push(...bisectUniform(child, rA, H));
        const u2Scored = u2.map((tri) => newtonWorstOfTri(tri, rA, H, TOL));
        const afterU2 = Math.max(...u2Scored.map((s) => s.nd));
        const afterU2OutlierCount = u2Scored.filter((s) => s.nd > TOL).length;

        const rec: FacetResult = {
          f, u: tri0.v[0].u, t: tri0.v[0].t,
          vertexDEdge: dE, perVertexNewton,
          before: before.nd, beforeUsedNewton: before.usedNewton, beforeRadial: before.radial,
          bankedBefore: f === F_WORST ? BANKED_NEWTON_WORST : null,
          kneeIdx: lvl1.kneeIdx, farIdx: lvl1.farIdx, nearIdx: lvl1.nearIdx,
          acrossEdgeLenMm, midpointNewtonSelfDist: midpointNewton,
          after1, after1Detail: [s1c0, s1c1],
          after2, after2Detail: s2,
          ratio1: before.nd > 0 ? after1 / before.nd : null,
          ratio2: before.nd > 0 ? after2 / before.nd : null,
          afterU1, afterU1Detail: u1Scored,
          afterU2, afterU2OutlierCount,
          ratioU1: before.nd > 0 ? afterU1 / before.nd : null,
          ratioU2: before.nd > 0 ? afterU2 / before.nd : null,
        };
        crumb('s1-facet-done', { f, before: before.nd, after1, after2, afterU1, afterU2 });
        results[`f_${f}`] = rec;
      }

      const newtonCalib = {
        newtonCallCount, newtonTimeMs,
        msPerCall: newtonCallCount > 0 ? newtonTimeMs / newtonCallCount : null,
      };
      crumb('s1-newton-calib', newtonCalib);
      const summary = {
        experiment: 'P2.0-S1', at: new Date().toISOString(), hash, outerTris, results, newtonCalib,
        elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_0_s1_summary.json'), JSON.stringify(summary, null, 2));
      crumb('s1-DONE', { elapsedMs: Date.now() - t0 });
      // eslint-disable-next-line no-console
      console.log(`[P2.0-S1] DONE\n${JSON.stringify(summary, null, 2)}`);

      expect(results[`f_${F_WORST}`].before, 'must reproduce the banked Newton-worst (non-vacuity)')
        .toBeCloseTo(BANKED_NEWTON_WORST, 6);
    },
    S1_TEST_TIMEOUT_MS,
  );
});

// ═══════════════════════════════ S2 — scaled population + T-junction cost ═══════════════════════════════

describe.skipIf(!ON_S2)('P2.0 S2 — scaled population across-band subdivision + T-junction cost', () => {
  it(
    'applies the S1 recipe to the full Newton-confirmed hot-facet population and estimates the T-junction cost',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('s2-start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const { rA, H, outerXyz, outerIdx, hash, outerTris, buildMs } = buildTwin();
      crumb('s2-build-done', { hash, outerTris, buildMs });
      expect(hash, 'must reproduce the exact A1/A3-char banked champion mesh (non-vacuity)').toBe(EXPECT_HASH);

      const confirmedPath = join(OUT_DIR, 'armA3_char_confirmed.json');
      expect(existsSync(confirmedPath), `banked hot-facet population missing: ${confirmedPath}`).toBe(true);
      const confirmedRaw = JSON.parse(readFileSync(confirmedPath, 'utf8')) as Array<
        { f: number; u: number; t: number; newton: number; source: string }
      >;
      const seen = new Set<number>();
      const hot: Array<{ f: number; newton: number }> = [];
      for (const c of confirmedRaw) {
        if (c.f < 0 || seen.has(c.f)) continue; // f=-1 is the bankedScatter source (no facet index)
        seen.add(c.f);
        hot.push({ f: c.f, newton: c.newton });
      }
      crumb('s2-hotset-loaded', { totalConfirmedRaw: confirmedRaw.length, uniqueHotFacets: hot.length });
      expect(hot.length, 'hot population must be non-vacuous').toBeGreaterThan(0);

      // ── S3: T-JUNCTION COST (cheap, exact, ZERO Newton calls) ─────────────────────────────
      // S1 showed bisectAcrossBand (dEdge-anchored, only 1-of-3 edges) is NOT the right proxy —
      // EVERY mesh vertex is already ~1e-6mm from the analytic surface (outerXyz evaluates rA at
      // every vertex, contour or grid), so "on-knee vertex" does not mark a special anchor; the
      // isolevel-agnostic bisectUniform (ALL 3 edges, matching a real quadtree featureLevel bump)
      // is what S2 uses below — so ALL 3 of a hot facet's ORIGINAL edges are T-junction candidates
      // (a real cell-scoped level escalation splits the whole cell boundary, not one edge).
      const PACK = 134217728; // 2^27 — matches classifyNonManLoci's proven-safe packed-key convention
      const hotOrigEdges: Array<[number, number, number]> = new Array(hot.length); // 3 packed keys per hot facet
      for (let i = 0; i < hot.length; i++) {
        const f = hot[i].f;
        const a = outerIdx[3 * f], b = outerIdx[3 * f + 1], c = outerIdx[3 * f + 2];
        const k0 = Math.min(a, b) * PACK + Math.max(a, b);
        const k1 = Math.min(b, c) * PACK + Math.max(b, c);
        const k2 = Math.min(c, a) * PACK + Math.max(c, a);
        hotOrigEdges[i] = [k0, k1, k2];
      }
      const hotFacetSet = new Set(hot.map((h) => h.f));
      const targetKeySet = new Set<number>();
      for (const [k0, k1, k2] of hotOrigEdges) { targetKeySet.add(k0); targetKeySet.add(k1); targetKeySet.add(k2); }
      const edgeFacets = new Map<number, number[]>();
      for (const k of targetKeySet) edgeFacets.set(k, []);
      const nF = outerIdx.length / 3;
      const tScan = Date.now();
      for (let f = 0; f < nF; f++) {
        const a = outerIdx[3 * f], b = outerIdx[3 * f + 1], c = outerIdx[3 * f + 2];
        if (a === b || b === c || a === c) continue;
        const e0lo = Math.min(a, b), e0hi = Math.max(a, b), k0 = e0lo * PACK + e0hi;
        if (targetKeySet.has(k0)) edgeFacets.get(k0)!.push(f);
        const e1lo = Math.min(b, c), e1hi = Math.max(b, c), k1 = e1lo * PACK + e1hi;
        if (targetKeySet.has(k1)) edgeFacets.get(k1)!.push(f);
        const e2lo = Math.min(c, a), e2hi = Math.max(c, a), k2 = e2lo * PACK + e2hi;
        if (targetKeySet.has(k2)) edgeFacets.get(k2)!.push(f);
      }
      crumb('s2-tjunction-scan-done', { ms: Date.now() - tScan, nF, targetKeys: targetKeySet.size });

      let tJunctionEdges = 0, boundaryNoPartner = 0, bothHotEdges = 0, facetsWithAnyTJunction = 0;
      for (let i = 0; i < hot.length; i++) {
        let anyT = false;
        for (const key of hotOrigEdges[i]) {
          const facetsOnEdge = edgeFacets.get(key) ?? [];
          const others = facetsOnEdge.filter((ff) => ff !== hot[i].f);
          if (others.length === 0) { boundaryNoPartner++; tJunctionEdges++; anyT = true; continue; }
          const nonHotPartner = others.some((ff) => !hotFacetSet.has(ff));
          if (nonHotPartner) { tJunctionEdges++; anyT = true; } else bothHotEdges++;
        }
        if (anyT) facetsWithAnyTJunction++;
      }
      crumb('s2-tjunction-done', { tJunctionEdges, boundaryNoPartner, bothHotEdges, facetsWithAnyTJunction, totalHot: hot.length });

      // ── S2: SCALED POPULATION RESCORE, uniform quadrisection, ADAPTIVE 2nd level ──────────
      // (time-budgeted, shuffled/unbiased order): score afterU1 (4 children) for every facet;
      // recurse to afterU2 (16 children total) ONLY for facets still >tol after U1 — exactly what
      // a real cell-scoped primitive would do (escalate again only where the first bump is
      // insufficient), and it bounds Newton-call cost to the genuinely hard residual.
      shuffleInPlace(hot, mulberry32(0x9a3feed));
      const deadline = Date.now() + S2_POP_BUDGET_MS;
      let lastCrumbTs = Date.now();
      let processed = 0, truncated = false, neededLevel2 = 0;
      const rows: Array<{ f: number; before: number; afterU1: number; afterU2: number; usedLevel2: boolean; outlierAfterU2: boolean }> = [];
      const loopStart = Date.now();
      for (let i = 0; i < hot.length; i++) {
        if (Date.now() > deadline) { truncated = true; break; }
        const c = hot[i];
        const tri0 = getTri(outerIdx, outerXyz, H, c.f);
        const u1 = bisectUniform(tri0, rA, H);
        const u1Scored = u1.map((tri) => newtonWorstOfTri(tri, rA, H, TOL));
        const afterU1 = Math.max(...u1Scored.map((s) => s.nd));
        let afterU2 = afterU1, usedLevel2 = false;
        if (afterU1 > TOL) {
          usedLevel2 = true; neededLevel2++;
          const u2: Tri3[] = [];
          for (const child of u1) u2.push(...bisectUniform(child, rA, H));
          const u2Scored = u2.map((tri) => newtonWorstOfTri(tri, rA, H, TOL));
          afterU2 = Math.max(...u2Scored.map((s) => s.nd));
        }
        rows.push({ f: c.f, before: c.newton, afterU1, afterU2, usedLevel2, outlierAfterU2: afterU2 > TOL });
        processed++;
        if (Date.now() - lastCrumbTs > 30000) {
          crumb('s2-progress', { processed, total: hot.length, neededLevel2, elapsedMs: Date.now() - loopStart, newtonCallCount, newtonTimeMs });
          writeFileSync(join(OUT_DIR, 'p2_0_s2_partial.json'), JSON.stringify(rows));
          lastCrumbTs = Date.now();
        }
      }
      crumb('s2-pop-loop-done', { processed, total: hot.length, truncated, neededLevel2, elapsedMs: Date.now() - loopStart });
      writeFileSync(join(OUT_DIR, 'p2_0_s2_partial.json'), JSON.stringify(rows));

      const beforeArr = rows.map((r) => r.before);
      const afterU1Arr = rows.map((r) => r.afterU1);
      const afterU2Arr = rows.map((r) => r.afterU2);
      const outliersBefore = beforeArr.filter((v) => v > TOL).length;
      const outliersAfterU1 = afterU1Arr.filter((v) => v > TOL).length;
      const outliersAfterU2 = afterU2Arr.filter((v) => v > TOL).length;

      // tri cost: facets that closed at U1 replace 1 -> 4 (net +3); facets needing U2 replace
      // 1 -> 16 (net +15). Only HOT (touched) facets gain triangles — untouched facets unchanged.
      const closedAtU1 = processed - neededLevel2;
      const triAddMeasured = closedAtU1 * 3 + neededLevel2 * 15;
      const pctTriAddMeasured = 100 * triAddMeasured / outerTris;
      // honest extrapolation to the banked full-population ESTIMATE, using the MEASURED
      // level-2-need RATE from this sample (not assuming worst-case-everywhere-needs-U2).
      const level2Rate = processed > 0 ? neededLevel2 / processed : 0;
      const extrapClosedAtU1 = Math.round(ESTIMATED_FULL_HOT_POPULATION * (1 - level2Rate));
      const extrapNeededU2 = ESTIMATED_FULL_HOT_POPULATION - extrapClosedAtU1;
      const extrapTriAdd = extrapClosedAtU1 * 3 + extrapNeededU2 * 15;
      const extrapPctTriAdd = 100 * extrapTriAdd / outerTris;

      const newtonCalib = {
        newtonCallCount, newtonTimeMs,
        msPerCall: newtonCallCount > 0 ? newtonTimeMs / newtonCallCount : null,
      };
      const summary = {
        experiment: 'P2.0-S2', at: new Date().toISOString(), hash, outerTris,
        method: 'bisectUniform (isolevel-agnostic 2x2 quadrisection, adaptive U1-then-U2-if-needed)',
        hotPopulation: { uniqueConfirmed: hot.length, processed, truncated, budgetMs: S2_POP_BUDGET_MS, neededLevel2, level2Rate },
        tJunction: {
          tJunctionEdges, boundaryNoPartner, bothHotEdges, facetsWithAnyTJunction, totalHot: hot.length,
          note: 'ALL 3 of each hot facet\'s ORIGINAL edges (by shared vertex-index) are candidates — '
            + 'matches bisectUniform touching every edge, the faithful proxy for a real quadtree-cell '
            + 'featureLevel bump (which affects the whole cell boundary). facetsWithAnyTJunction is '
            + 'the practical count a 2:1-balance propagation pass would have to resolve.',
        },
        fidelity: {
          before: percentiles(beforeArr), afterU1: percentiles(afterU1Arr), afterU2: percentiles(afterU2Arr),
          outliersBefore, outliersAfterU1, outliersAfterU2, nProcessed: processed,
        },
        triCost: {
          measured: {
            processed, closedAtU1, neededLevel2, triAdd: triAddMeasured, pctOfOuterTris: pctTriAddMeasured,
          },
          extrapolatedToFullEstimatedPopulation: {
            estimatedFullPop: ESTIMATED_FULL_HOT_POPULATION, level2RateUsed: level2Rate,
            extrapClosedAtU1, extrapNeededU2, triAdd: extrapTriAdd, pctOfOuterTris: extrapPctTriAdd,
            note: 'EXTRAPOLATION — the ~31,114 figure is the Addendum13/14 banked STRATIFIED ESTIMATE '
              + 'of the true full outlier population, not exhaustively re-measured here (would need '
              + 'Newton-confirming all 236,185 radial candidates); the U2-need RATE is measured on '
              + 'THIS sample and applied to the estimate.',
          },
        },
        newtonCalib,
        elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_0_s2_summary.json'), JSON.stringify(summary, null, 2));
      crumb('s2-DONE', { elapsedMs: Date.now() - t0, outliersAfterU2, processed, truncated });
      // eslint-disable-next-line no-console
      console.log(`[P2.0-S2] DONE\n${JSON.stringify(summary, null, 2)}`);

      expect(processed, 'population loop must process at least one facet').toBeGreaterThan(0);
    },
    S2_TEST_TIMEOUT_MS,
  );
});
