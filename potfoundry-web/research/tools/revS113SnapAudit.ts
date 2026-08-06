// revS113SnapAudit.ts — ADVERSARIAL AUDIT of s113opSnap's "snap is REFUTED" result.
// Three independent checks, none of which reuse the claim's own reasoning:
//
//  CHECK 1 — INDEPENDENT CREASE LOCATOR (no bisection at all). The claim's load-bearing caveat is that
//    60.9% of located crossings sit at a bisection ENDPOINT and it read that as "the crease passes through
//    a mesh vertex", while conceding the competing explanation is locateTurnAdaptive's known unpatched
//    tie-break defect (orientRuler.ts:529) walking the bracket to an end. Here every edge of a sampled
//    facet is scanned with a UNIFORM DENSE SWEEP of the analytic normal (N samples, argmax of the
//    consecutive-normal turn). A uniform sweep cannot "walk left": it has no bracket. If the dense argmax
//    agrees with the bisection s, the NO-OP class is real; if the dense scan puts the kink in the middle of
//    an edge where the bisection said s=0, the NO-OP class is an artefact and the operator was never
//    applied to 43% of the target area (=> the pricing would be VOID, not REFUTED).
//
//  CHECK 2 — IS THE "AREA REDUCTION" A REPAIR OR A SHRINKAGE? s113opSnap's kill-line metric sums
//    g.ar[f] over the AFTER geometry. A vertex snap changes facet AREAS. So a facet that is still over the
//    bar but has been squashed contributes less area, and the metric improves without the defect going
//    away. This check re-applies rung 1.00 RAW and reports the same population measured BOTH ways:
//    with AFTER areas (the claim's ruler) and with the SAME facets' BEFORE areas (shrink-immune), plus
//    unique-facet COUNTS, so the count/area/shrinkage decomposition is explicit.
//
//  CHECK 3 — SILENT SKIPS. Every plan that never becomes a move is enumerated by REASON: out of budget,
//    lost a vertex conflict, no crossing found, zero-length move (NO-OP). And the candidate-selection rule
//    is re-examined: planFor still MINIMISES move3d over its candidate list, which is exactly the rule the
//    tool header says produced a false null in its first cut. Here the 1-crossing and 3-crossing branches
//    are counted separately, since those are the branches where more than one candidate exists.
//
// DISCIPLINE: never a bare count, never a bare max; COUNT + AREA + MAX together. inset EXPLICIT.
// Reads only. Nothing under src/ or the driver is touched.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, fdNormalsCentral, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_REV_STYLE ?? 'GothicArches';
const STL = process.env.PF_REV_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJSON = process.env.PF_REV_SET
  ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const TAG = process.env.PF_REV_TAG ?? 'GOTH';
const K = Math.round(envF('PF_REV_K', 8));
const TURN_THR_DEG = envF('PF_REV_TURN', 30);
const HI_DEG = envF('PF_REV_HI_DEG', 45);
const RUNG = envF('PF_REV_RUNG', 1.0);
const SCAN_N = Math.round(envF('PF_REV_SCANN', 512));
const SCAN_SUB = Math.round(envF('PF_REV_SCANSUB', 300));
const MOVE_EPS = envF('PF_REV_MOVE_EPS_UM', 1) / 1000;
const REFINE = (process.env.PF_REV_REFINE ?? '1') === '1';
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; };

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== REV-S113 — ADVERSARIAL AUDIT OF THE VERTEX-SNAP REFUTATION =====');
log(`style ${STYLE}  tag ${TAG}  K ${K}  turnThr ${TURN_THR_DEG}  rung ${RUNG}  scanN ${SCAN_N}  scanSub ${SCAN_SUB}`);

const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d0 = facetDihedrals(xyz0, new Uint32Array(nTri * 3).map((_, i) => i));
const nEdge = d0.edgeAngRad.length;
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea0.toFixed(1)} mm2  interior edges ${nEdge}  ${el()}`);

interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number; locs: Loc[] }
const rows: Row[] = readFileSync(NDJSON, 'utf8').trim().split('\n').map((L) => JSON.parse(L) as Row);
const uniqF: number[] = [...new Set(rows.flatMap((r) => [r.f1, r.f2]))].sort((a, b) => a - b);
let targetArea0 = 0;
for (const f of uniqF) targetArea0 += d0.areaMm2[f];
log(`target set ${rows.length} pairs / ${uniqF.length} facets / AREA ${targetArea0.toFixed(4)} mm2 (${((targetArea0 / meshArea0) * 100).toFixed(4)}%)`);
{
  let bad = 0; let worstD = 0;
  for (const r of rows) {
    const a = d0.edgeF1[r.e]; const b = d0.edgeF2[r.e];
    if (!((a === r.f1 && b === r.f2) || (a === r.f2 && b === r.f1))) bad += 1;
    worstD = Math.max(worstD, Math.abs((d0.edgeAngRad[r.e] * 180) / Math.PI - r.measDeg));
  }
  log(`CONTROL A (edge identity): ${bad} mismatched, max |measDeg drift| ${worstD.toExponential(3)} deg`);
  if (bad > 0 || worstD > 1e-9) { log('*** RUN VOID ***'); process.exit(5); }
}

const th3 = (a: Float64Array, f: number): [number, number, number] => {
  const t = Math.atan2(a[f * 9 + 1], a[f * 9]);
  const b = t + dThRaw(t, Math.atan2(a[f * 9 + 4], a[f * 9 + 3]));
  const c = t + dThRaw(t, Math.atan2(a[f * 9 + 7], a[f * 9 + 6]));
  return [t, b, c];
};
const rRefOf = (a: Float64Array, f: number): number => (
  Math.hypot(a[f * 9], a[f * 9 + 1]) + Math.hypot(a[f * 9 + 3], a[f * 9 + 4]) + Math.hypot(a[f * 9 + 6], a[f * 9 + 7])
) / 3;
const meanEdgeLen = (a: Float64Array, f: number): number => (
  Math.hypot(a[f * 9 + 3] - a[f * 9], a[f * 9 + 4] - a[f * 9 + 1], a[f * 9 + 5] - a[f * 9 + 2])
  + Math.hypot(a[f * 9 + 6] - a[f * 9 + 3], a[f * 9 + 7] - a[f * 9 + 4], a[f * 9 + 8] - a[f * 9 + 5])
  + Math.hypot(a[f * 9] - a[f * 9 + 6], a[f * 9 + 1] - a[f * 9 + 7], a[f * 9 + 2] - a[f * 9 + 8])
) / 3;
function normDegOf(a: Float64Array, f: number, inset: number): number {
  const [ath, bth, cth] = th3(a, f);
  return orientOfFacet(nsKink,
    a[f * 9], a[f * 9 + 1], a[f * 9 + 2], a[f * 9 + 3], a[f * 9 + 4], a[f * 9 + 5],
    a[f * 9 + 6], a[f * 9 + 7], a[f * 9 + 8], ath, bth, cth, { k: K, inset, scratch }).normDeg;
}

// ── the claim's own locator + plan, reproduced verbatim so the audit compares like with like ─────────
const edgeLoc = new Map<number, Array<{ s: number; turnDeg: number }>>();
function locsOf(a: Float64Array, f: number): Array<{ s: number; turnDeg: number }> {
  const hit = edgeLoc.get(f);
  if (hit !== undefined) return hit;
  const [ath, bth, cth] = th3(a, f);
  const ths = [ath, bth, cth];
  const zs = [a[f * 9 + 2], a[f * 9 + 5], a[f * 9 + 8]];
  const rRef = rRefOf(a, f);
  const out: Array<{ s: number; turnDeg: number }> = [];
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    const lt = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 14);
    out.push({ s: lt.s, turnDeg: (lt.turn * 180) / Math.PI });
  }
  edgeLoc.set(f, out);
  return out;
}
interface Plan {
  f: number; vi: number; th: number; z: number; move: number; move3d: number; L: number;
  nCross: number; nCand: number;
}
function planFor(a: Float64Array, f: number, thrDeg: number): Plan | null {
  const [ath, bth, cth] = th3(a, f);
  const ths = [ath, bth, cth];
  const zs = [a[f * 9 + 2], a[f * 9 + 5], a[f * 9 + 8]];
  const rRef = rRefOf(a, f);
  const px = [rRef * ths[0], rRef * ths[1], rRef * ths[2]];
  const py = [zs[0], zs[1], zs[2]];
  const el3 = locsOf(a, f);
  const cross: Array<{ ei: number; s: number; x: number; y: number }> = [];
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    if (el3[ei].turnDeg <= thrDeg) continue;
    cross.push({ ei, s: el3[ei].s, x: px[ei] + (px[j] - px[ei]) * el3[ei].s, y: py[ei] + (py[j] - py[ei]) * el3[ei].s });
  }
  if (cross.length === 0) return null;
  const L = meanEdgeLen(a, f);
  const cands: Array<{ m: number; x: number; y: number }> = [];
  for (let m = 0; m < 3; m += 1) {
    const inc = cross.filter((c) => c.ei === m || c.ei === (m + 2) % 3);
    if (inc.length < 2) continue;
    const [p1, p2] = inc;
    const ex = p2.x - p1.x; const ey = p2.y - p1.y;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((px[m] - p1.x) * ex + (py[m] - p1.y) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    cands.push({ m, x: p1.x + ex * t, y: p1.y + ey * t });
  }
  if (cands.length === 0) {
    const c = cross[0];
    const i = c.ei; const j = (c.ei + 1) % 3;
    const di = Math.hypot(px[i] - c.x, py[i] - c.y); const dj = Math.hypot(px[j] - c.x, py[j] - c.y);
    cands.push({ m: di <= dj ? i : j, x: c.x, y: c.y });
  }
  const nCand = cands.length;
  let best: Plan | null = null;
  for (const cd of cands) {
    let bx = cd.x; let by = cd.y;
    let dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
    // REFINE — copied verbatim from s113opSnap.planFor so this reproduction is the claim's operator.
    if (REFINE && dd > 1e-12) {
      const ux = (bx - px[cd.m]) / dd; const uy = (by - py[cd.m]) / dd;
      const dl = Math.max(1e-6, 0.5 * dd);
      const lt = locateTurnAdaptive(rA, H, (bx - ux * dl) / rRef, by - uy * dl, (bx + ux * dl) / rRef, by + uy * dl, rRef, 16);
      if ((lt.turn * 180) / Math.PI > thrDeg) {
        const nx2 = bx - ux * dl + 2 * ux * dl * lt.s;
        const ny2 = by - uy * dl + 2 * uy * dl * lt.s;
        bx = nx2; by = ny2;
        dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
      }
    }
    const nth = bx / rRef;
    const nz = by < 0 ? 0 : by > H ? H : by;
    const nr = rA(nth, nz);
    const o = f * 9 + cd.m * 3;
    const m3 = Math.hypot(nr * Math.cos(nth) - a[o], nr * Math.sin(nth) - a[o + 1], nz - a[o + 2]);
    if (best === null || m3 < best.move3d) {
      best = { f, vi: cd.m, th: nth, z: nz, move: dd, move3d: m3, L, nCross: cross.length, nCand };
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 1 — INDEPENDENT DENSE CREASE LOCATOR. NO BRACKET, SO NO TIE-BREAK TO WALK.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Sweep s uniformly over [0,1] on an edge; at each sample take the analytic normal with a CENTRAL FD whose
// arc step is a quarter of the sample spacing (so each sample sits on one flank), and take the angle
// between consecutive samples. A crease is a spike; a smooth edge is flat at O(kappa * ds).
function denseScan(ath: number, az: number, bth: number, bz: number, rRef: number, N: number): {
  sBest: number; turnBest: number; turnMedian: number; nSpike: number; sFirst: number; sLast: number;
} {
  const lenMm = Math.hypot(rRef * (bth - ath), bz - az);
  const hArc = Math.max(1e-9, lenMm / (4 * N));
  const ns = fdNormalsCentral(rA, H, hArc, hArc);
  const sc = new Float64Array(12);
  const nxs = new Float64Array(N + 1); const nys = new Float64Array(N + 1); const nzs = new Float64Array(N + 1);
  for (let i = 0; i <= N; i += 1) {
    const s = i / N;
    ns(ath + (bth - ath) * s, az + (bz - az) * s, sc);
    nxs[i] = sc[0]; nys[i] = sc[1]; nzs[i] = sc[2];
  }
  let best = -1; let iBest = -1; const all: number[] = [];
  let nSpike = 0; let sFirst = -1; let sLast = -1;
  for (let i = 0; i < N; i += 1) {
    let d = nxs[i] * nxs[i + 1] + nys[i] * nys[i + 1] + nzs[i] * nzs[i + 1];
    d = d > 1 ? 1 : d < -1 ? -1 : d;
    const ang = (Math.acos(d) * 180) / Math.PI;
    all.push(ang);
    if (ang > best) { best = ang; iBest = i; }
  }
  const med = q(all, 0.5);
  const spikeThr = Math.max(5, med * 20);
  for (let i = 0; i < N; i += 1) {
    if (all[i] > spikeThr) {
      nSpike += 1;
      if (sFirst < 0) sFirst = (i + 0.5) / N;
      sLast = (i + 0.5) / N;
    }
  }
  return { sBest: (iBest + 0.5) / N, turnBest: best, turnMedian: med, nSpike, sFirst, sLast };
}

// build the plans exactly as the claim does
log('');
log('══ PLANS (reproducing the claim\'s Phase 2/2b) ══');
const plans: Plan[] = [];
const noneF: number[] = [];
for (const f of uniqF) {
  const p = planFor(xyz0, f, TURN_THR_DEG);
  if (p === null) { noneF.push(f); continue; }
  plans.push(p);
}
const arOf = (fs: number[]): number => fs.reduce((s, f) => s + d0.areaMm2[f], 0);
const noop = plans.filter((p) => p.move3d < MOVE_EPS);
const real = plans.filter((p) => p.move3d >= MOVE_EPS);
const realFacetSet = new Set(real.map((p) => p.f));
log(`  NONE  COUNT ${noneF.length}  AREA ${arOf(noneF).toFixed(3)} mm2 (${((arOf(noneF) / targetArea0) * 100).toFixed(2)}%)`);
log(`  NO-OP COUNT ${noop.length}  AREA ${arOf(noop.map((p) => p.f)).toFixed(3)} mm2 (${((arOf(noop.map((p) => p.f)) / targetArea0) * 100).toFixed(2)}%)`);
log(`  REAL  COUNT ${real.length}  AREA ${arOf(real.map((p) => p.f)).toFixed(3)} mm2 (${((arOf(real.map((p) => p.f)) / targetArea0) * 100).toFixed(2)}%)`);
log(`  (claim: NONE 2215 / 10.836 / 15.52% ; NO-OP 2479 / 30.119 / 43.13% ; REAL 1499 / 28.870 / 41.35%)`);
log(`  candidate-count of the chosen plan: 1 cand ${plans.filter((p) => p.nCand === 1).length}   2 ${plans.filter((p) => p.nCand === 2).length}   3 ${plans.filter((p) => p.nCand === 3).length}`);
log(`  crossings: 1 -> ${plans.filter((p) => p.nCross === 1).length}  2 -> ${plans.filter((p) => p.nCross === 2).length}  3 -> ${plans.filter((p) => p.nCross === 3).length}`);
log(`  NO-OP by branch: nCross=1 ${noop.filter((p) => p.nCross === 1).length}   nCross=2 ${noop.filter((p) => p.nCross === 2).length}   nCross=3 ${noop.filter((p) => p.nCross === 3).length}`);
{
  const mc = plans.filter((p) => p.nCand > 1);
  const mcNull = mc.filter((p) => p.move3d < MOVE_EPS);
  log(`  multi-candidate plans whose chosen move is < ${MOVE_EPS * 1000} um (the "minimise picked a do-nothing" signature): ${mcNull.length} of ${mc.length}   AREA ${arOf(mcNull.map((p) => p.f)).toFixed(4)} mm2 (${((arOf(mcNull.map((p) => p.f)) / targetArea0) * 100).toFixed(2)}% of target)`);
}
log(`${el()}`);

log('');
log('══ CHECK 1 — DENSE UNIFORM SCAN vs THE BISECTION, ON EACH CLASS ══');
log(`   N=${SCAN_N} samples/edge, FD arc step = edgeLen/${4 * SCAN_N}. A uniform sweep has no bracket to walk.`);
const pick = <T,>(arr: T[], n: number): T[] => {
  if (arr.length <= n) return arr.slice();
  const st = arr.length / n; const o: T[] = [];
  for (let i = 0; i < n; i += 1) o.push(arr[Math.floor(i * st)]);
  return o;
};
interface ScanAgg { name: string; nEdge: number; agree: number; disagree: number; bisEnd: number; denseEnd: number; denseInterior_bisEnd: number; dsAll: number[]; strong: number }
function scanClass(name: string, fs: number[], n: number): ScanAgg {
  const sub = pick(fs, n);
  const agg: ScanAgg = { name, nEdge: 0, agree: 0, disagree: 0, bisEnd: 0, denseEnd: 0, denseInterior_bisEnd: 0, dsAll: [], strong: 0 };
  for (const f of sub) {
    const [ath, bth, cth] = th3(xyz0, f);
    const ths = [ath, bth, cth];
    const zs = [xyz0[f * 9 + 2], xyz0[f * 9 + 5], xyz0[f * 9 + 8]];
    const rRef = rRefOf(xyz0, f);
    const l3 = locsOf(xyz0, f);
    for (let ei = 0; ei < 3; ei += 1) {
      const j = (ei + 1) % 3;
      const ds = denseScan(ths[ei], zs[ei], ths[j], zs[j], rRef, SCAN_N);
      const bis = l3[ei];
      const bisHasCrease = bis.turnDeg > TURN_THR_DEG;
      const denseHasCrease = ds.turnBest > 5 && ds.turnBest > 20 * ds.turnMedian;
      if (!bisHasCrease && !denseHasCrease) continue;      // both say smooth: not an edge under test
      agg.nEdge += 1;
      if (denseHasCrease) agg.strong += 1;
      const bisEnd = bis.s <= 1e-4 || bis.s >= 1 - 1e-4;
      const denseEnd = ds.sBest <= 2.5 / SCAN_N || ds.sBest >= 1 - 2.5 / SCAN_N;
      if (bisEnd) agg.bisEnd += 1;
      if (denseEnd) agg.denseEnd += 1;
      if (bisHasCrease && denseHasCrease) {
        const d = Math.abs(ds.sBest - bis.s);
        agg.dsAll.push(d);
        if (d <= 3 / SCAN_N) agg.agree += 1; else agg.disagree += 1;
      }
      if (bisEnd && bisHasCrease && denseHasCrease && !denseEnd) agg.denseInterior_bisEnd += 1;
    }
  }
  return agg;
}
const classes: Array<[string, number[]]> = [
  ['NO-OP', noop.map((p) => p.f)],
  ['REAL', real.map((p) => p.f)],
  ['NONE', noneF],
];
const scans: ScanAgg[] = [];
for (const [nm, fs] of classes) {
  const a = scanClass(nm, fs, SCAN_SUB);
  scans.push(a);
  log(`  ${nm.padEnd(6)} edges with a crease by EITHER locator ${a.nEdge}  (dense says crease on ${a.strong})`);
  log(`         bisection s AT AN END ${a.bisEnd}   dense argmax AT AN END ${a.denseEnd}`);
  log(`         both-located edges: agree (|ds| <= ${(3 / SCAN_N).toFixed(4)}) ${a.agree}   disagree ${a.disagree}   |ds| p50 ${a.dsAll.length > 0 ? q(a.dsAll, 0.5).toExponential(2) : 'n/a'}  p90 ${a.dsAll.length > 0 ? q(a.dsAll, 0.9).toExponential(2) : 'n/a'}  MAX ${a.dsAll.length > 0 ? mx(a.dsAll).toExponential(2) : 'n/a'}`);
  log(`         *** bisection said END but dense says INTERIOR: ${a.denseInterior_bisEnd} (this is the artefact signature) ***`);
}
log(`${el()}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 2 — REPAIR OR SHRINKAGE? Re-apply rung RUNG, RAW arm, and measure the same population with
// AFTER areas (the claim's ruler) and with the SAME facets' BEFORE areas (immune to squashing).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const HASHBUF = new Float32Array(3);
const HASHU32 = new Uint32Array(HASHBUF.buffer);
const vHash = (x: number, y: number, z: number): number => {
  HASHBUF[0] = x; HASHBUF[1] = y; HASHBUF[2] = z;
  return ((HASHU32[0] * 0x9e3779b1) ^ (HASHU32[1] * 0x85ebca6b) ^ (HASHU32[2] * 0xc2b2ae35)) | 0;
};
type VKey = { key: [number, number, number]; corners: number[] };
const vertReg = new Map<number, VKey[]>();
function regVertex(x: number, y: number, z: number): VKey {
  const h = vHash(x, y, z);
  let list = vertReg.get(h);
  if (list === undefined) { list = []; vertReg.set(h, list); }
  for (const e of list) if (e.key[0] === x && e.key[1] === y && e.key[2] === z) return e;
  const e: VKey = { key: [x, y, z], corners: [] };
  list.push(e);
  return e;
}
for (const p of plans) { const o = p.f * 9 + p.vi * 3; regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]); }
{
  let hits = 0;
  for (let f = 0; f < nTri; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const o = f * 9 + k * 3;
      const list = vertReg.get(vHash(xyz0[o], xyz0[o + 1], xyz0[o + 2]));
      if (list === undefined) continue;
      for (const e of list) {
        if (e.key[0] === xyz0[o] && e.key[1] === xyz0[o + 1] && e.key[2] === xyz0[o + 2]) { e.corners.push(o); hits += 1; break; }
      }
    }
  }
  let distinct = 0;
  for (const l of vertReg.values()) distinct += l.length;
  log('');
  log(`incidence: ${distinct} candidate vertices, ${hits} incident corners  ${el()}`);
}
function facetGeom(a: Float64Array): { nx: Float64Array; ny: Float64Array; nz: Float64Array; ar: Float64Array } {
  const nx = new Float64Array(nTri); const ny = new Float64Array(nTri); const nz = new Float64Array(nTri);
  const ar = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ux = a[o + 3] - a[o]; const uy = a[o + 4] - a[o + 1]; const uz = a[o + 5] - a[o + 2];
    const wx = a[o + 6] - a[o]; const wy = a[o + 7] - a[o + 1]; const wz = a[o + 8] - a[o + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const len = Math.hypot(cx, cy, cz);
    ar[f] = 0.5 * len;
    if (len > 0) { nx[f] = cx / len; ny[f] = cy / len; nz[f] = cz / len; }
  }
  return { nx, ny, nz, ar };
}
const G0 = facetGeom(xyz0);
const workXyz = new Float64Array(xyz0);
{
  const byVert = new Map<VKey, { th: number; z: number; move3d: number }>();
  let nConflict = 0; let nInBudget = 0; let nOutBudget = 0; let outArea = 0;
  for (const p of plans) {
    if (!(p.move3d <= RUNG * p.L)) { nOutBudget += 1; outArea += d0.areaMm2[p.f]; continue; }
    nInBudget += 1;
    const o = p.f * 9 + p.vi * 3;
    const e = regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]);
    const prev = byVert.get(e);
    if (prev !== undefined) { nConflict += 1; if (p.move3d >= prev.move3d) continue; }
    byVert.set(e, { th: p.th, z: p.z, move3d: p.move3d });
  }
  // CONFLICT BIAS: applyRung keeps the SMALLEST move3d at a contested vertex. A NO-OP plan therefore
  // BEATS a REAL plan at the same vertex, i.e. the tie-break is biased toward doing nothing. Count it.
  {
    const byV = new Map<VKey, Plan[]>();
    for (const p of plans) {
      if (!(p.move3d <= RUNG * p.L)) continue;
      const o = p.f * 9 + p.vi * 3;
      const e = regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]);
      const l = byV.get(e); if (l === undefined) byV.set(e, [p]); else l.push(p);
    }
    let contested = 0; let noopBeatsReal = 0; let lostRealArea = 0;
    for (const l of byV.values()) {
      if (l.length < 2) continue;
      contested += 1;
      const minM = Math.min(...l.map((p) => p.move3d));
      const anyReal = l.some((p) => p.move3d >= MOVE_EPS);
      if (minM < MOVE_EPS && anyReal) {
        noopBeatsReal += 1;
        for (const p of l) if (p.move3d >= MOVE_EPS) lostRealArea += d0.areaMm2[p.f];
      }
    }
    log(`  CONFLICT TIE-BREAK BIAS: ${contested} contested vertices; a NO-OP plan (move<${MOVE_EPS * 1000} um) beat a REAL plan at ${noopBeatsReal} of them, silently discarding REAL plans covering AREA ${lostRealArea.toFixed(3)} mm2 (${((lostRealArea / targetArea0) * 100).toFixed(2)}% of target)`);
  }
  const touched = new Set<number>();
  let nMoved = 0; let nZeroMove = 0;
  for (const [e, v] of byVert) {
    const z = v.z < 0 ? 0 : v.z > H ? H : v.z;
    const r = rA(v.th, z);
    const nx = Math.fround(r * Math.cos(v.th)); const ny = Math.fround(r * Math.sin(v.th)); const nz = Math.fround(z);
    let moved = false;
    for (const o of e.corners) {
      if (workXyz[o] !== nx || workXyz[o + 1] !== ny || workXyz[o + 2] !== nz) moved = true;
      workXyz[o] = nx; workXyz[o + 1] = ny; workXyz[o + 2] = nz;
    }
    if (!moved) nZeroMove += 1;
    nMoved += 1;
    for (const o of e.corners) touched.add(Math.floor(o / 9));
  }
  const affected = [...touched].sort((a, b) => a - b);
  log('');
  log(`══ CHECK 2/3 — RUNG ${(RUNG * 100).toFixed(0)}% RAW re-applied ══`);
  log(`  plans ${plans.length}: in budget ${nInBudget}, OUT of budget ${nOutBudget} (AREA ${outArea.toFixed(3)} mm2 = ${((outArea / targetArea0) * 100).toFixed(2)}% of target, silently unaddressed at this rung)`);
  log(`  vertices ${nMoved} (conflicts ${nConflict}); of those, BIT-IDENTICAL after the "move" (a true no-op): ${nZeroMove} (${((nZeroMove / Math.max(1, nMoved)) * 100).toFixed(1)}%)`);
  log(`  facets touched ${affected.length}   ${el()}`);

  const G = facetGeom(workXyz);
  // the claim's kill-line instrument, plus the shrink-immune reading
  const over = (g: typeof G0): { pairs: number; fs: number[] } => {
    const uf = new Set<number>(); let n = 0;
    for (const r of rows) {
      let dd = g.nx[r.f1] * g.nx[r.f2] + g.ny[r.f1] * g.ny[r.f2] + g.nz[r.f1] * g.nz[r.f2];
      dd = dd > 1 ? 1 : dd < -1 ? -1 : dd;
      if ((Math.acos(dd) * 180) / Math.PI > HI_DEG) { n += 1; uf.add(r.f1); uf.add(r.f2); }
    }
    return { pairs: n, fs: [...uf] };
  };
  const b = over(G0); const a = over(G);
  const sum = (fs: number[], g: typeof G0): number => fs.reduce((s, f) => s + g.ar[f], 0);
  log('');
  log('  ── THE KILL-LINE POPULATION, MEASURED THREE WAYS ──');
  log(`     BEFORE  pairs ${b.pairs}  unique facets ${b.fs.length}  AREA(before geom) ${sum(b.fs, G0).toFixed(4)} mm2`);
  log(`     AFTER   pairs ${a.pairs}  unique facets ${a.fs.length}  AREA(after  geom) ${sum(a.fs, G).toFixed(4)} mm2   <= THE CLAIM'S RULER`);
  log(`     AFTER   pairs ${a.pairs}  unique facets ${a.fs.length}  AREA(BEFORE geom, same facets) ${sum(a.fs, G0).toFixed(4)} mm2   <= SHRINK-IMMUNE`);
  log(`     ratio on the claim's ruler ${(sum(b.fs, G0) / Math.max(1e-12, sum(a.fs, G))).toFixed(3)}x   ratio shrink-immune ${(sum(b.fs, G0) / Math.max(1e-12, sum(a.fs, G0))).toFixed(3)}x   facet-COUNT ratio ${(b.fs.length / Math.max(1, a.fs.length)).toFixed(3)}x   pair-COUNT ratio ${(b.pairs / Math.max(1, a.pairs)).toFixed(3)}x`);
  const stillOver = a.fs.filter((f) => b.fs.includes(f));
  log(`     facets over the bar BOTH before and after: ${stillOver.length}; their AREA ${sum(stillOver, G0).toFixed(4)} -> ${sum(stillOver, G).toFixed(4)} mm2 (shrinkage factor ${(sum(stillOver, G0) / Math.max(1e-12, sum(stillOver, G))).toFixed(3)}x)`);
  const touchedArea0 = sum(affected, G0); const touchedArea1 = sum(affected, G);
  log(`     ALL touched facets: AREA ${touchedArea0.toFixed(4)} -> ${touchedArea1.toFixed(4)} mm2 (${(touchedArea1 - touchedArea0 >= 0 ? '+' : '')}${(touchedArea1 - touchedArea0).toFixed(4)})`);
  let degen = 0; let flip = 0;
  for (const f of affected) {
    if (!(G.ar[f] > 1e-14)) degen += 1;
    if (G.nx[f] * G0.nx[f] + G.ny[f] * G0.ny[f] + G.nz[f] * G0.nz[f] < 0) flip += 1;
  }
  log(`     degenerate ${degen}   normal-flipped ${flip}`);

  // the angular ruler at inset 0.05 EXPLICIT, on the target set, count + area + max
  const bN = uniqF.map((f) => normDegOf(xyz0, f, 0.05));
  const aN = uniqF.map((f, i) => (touched.has(f) ? normDegOf(workXyz, f, 0.05) : bN[i]));
  const bOv = uniqF.filter((_, i) => bN[i] > 45); const aOv = uniqF.filter((_, i) => aN[i] > 45);
  log('');
  log('  ── ANGULAR normDeg, inset EXPLICIT 0.05, on the pinned target facets ──');
  log(`     over45 BEFORE COUNT ${bOv.length}  AREA(before) ${sum(bOv, G0).toFixed(4)} mm2  MAX ${mx(bN).toFixed(2)} deg`);
  log(`     over45 AFTER  COUNT ${aOv.length}  AREA(after)  ${sum(aOv, G).toFixed(4)} mm2  AREA(before geom, same facets) ${sum(aOv, G0).toFixed(4)} mm2  MAX ${mx(aN).toFixed(2)} deg`);
  log(`     => COUNT ${bOv.length > aOv.length ? 'DOWN' : 'UP'} (${bOv.length} -> ${aOv.length}), AREA(claim ruler) ${(sum(bOv, G0) / Math.max(1e-12, sum(aOv, G))).toFixed(3)}x, AREA(shrink-immune) ${(sum(bOv, G0) / Math.max(1e-12, sum(aOv, G0))).toFixed(3)}x`);

  writeFileSync(`${OUTDIR}/REV_S113_SNAPAUDIT_${TAG}.json`, `${JSON.stringify({
    style: STYLE, stl: STL, rung: RUNG, turnThrDeg: TURN_THR_DEG, scanN: SCAN_N, scanSub: SCAN_SUB,
    none: { n: noneF.length, area: arOf(noneF) },
    noop: { n: noop.length, area: arOf(noop.map((p) => p.f)) },
    real: { n: real.length, area: arOf(real.map((p) => p.f)) },
    realFacets: realFacetSet.size,
    scans: scans.map((s) => ({ ...s, dsAll: undefined })),
    killBefore: { pairs: b.pairs, facets: b.fs.length, area: sum(b.fs, G0) },
    killAfter: { pairs: a.pairs, facets: a.fs.length, areaAfterGeom: sum(a.fs, G), areaBeforeGeom: sum(a.fs, G0) },
    touchedArea0, touchedArea1, degen, flip, nZeroMove, nMoved, nOutBudget, outArea,
  }, null, 2)}\n`);
  log(`wrote ${OUTDIR}/REV_S113_SNAPAUDIT_${TAG}.json`);
}
log(`done ${el()}`);
