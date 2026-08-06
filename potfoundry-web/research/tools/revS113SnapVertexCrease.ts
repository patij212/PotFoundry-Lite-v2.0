// revS113SnapVertexCrease.ts — REVIEW PROBE for the S113 "snap" REFUTED verdict.
//
// WHAT IS BEING CHECKED, AND WHY IT IS THE ONLY THING THAT CAN OVERTURN THE VERDICT
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// s113opSnap.ts reports the snap operator REFUTED. Two of its three legs are arm-measurements that cannot
// be rescued by any locator fix (the safety bars break 4-6x). The THIRD leg — "the operator's precondition
// fails, 43.13% of the target AREA is a NO-OP because a vertex is ALREADY on the crease" — rests entirely
// on `locateTurnAdaptive` returning s at a bisection ENDPOINT for 60.9% of located crossings. That locator
// carries a KNOWN UNPATCHED TIE-BREAK DEFECT (orientRuler.ts:529) whose signature is exactly "walk to an
// end". If the pinning is the defect and not the geometry, then the operator was UNDER-APPLIED: its plans
// were ~0 mm moves and its measured efficacy is an artefact. That is the one pathway that flips REFUTED.
//
// THE INDEPENDENT INSTRUMENT (no bisection anywhere in it)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Around a point p in the (rRef*theta, z) arclength plane, sample the ANALYTIC normal at M points on a
// CIRCLE of radius rho. A crease is a curve; if it passes within rho of p the circle crosses it and the
// sampled normals split into two clusters with two large CONSECUTIVE jumps. If it does not, the normals
// vary only by curvature (O(rho/R) ~ 0.1 deg here). SWEEPING rho down therefore brackets the distance from
// p to the nearest crease from ABOVE: the smallest rho whose jumpMax clears the bar is an upper bound on it.
// This is a FOOTPRINT probe (a full circle at 8 radii), not a 2-point probe — this project has been
// under-read 13x by 2-point probes before.
//
// CONTROLS (a one-sided instrument is satisfied by a degenerate answer, so both ends are asserted)
//   POSITIVE: the REAL class's own located crossing points. Must SPLIT at the smallest rho.
//   NEGATIVE: random ordinary mesh vertices. Must NOT split at the largest rho.
//   REPRO   : the NONE / NO-OP / REAL three-way split must reproduce s113opSnap's printed counts+areas.
// If the positive control does not fire or the negative control does, THIS run is VOID and says so.
//
// Also censused, from data s113opSnap already computes but did not print: for every NO-OP facet, WHERE the
// crease crossings sit (which edges, which end), which is the direct test of its mechanism claim ("the
// crease runs from that vertex ACROSS THE INTERIOR").
//
// Usage: bash research/tools/run-rev-s113-vertexcrease.sh
import { mkdirSync, readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormalsCentral, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJSON = process.env.PF_S113_SET
  ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const TURN_THR_DEG = envF('PF_S113_TURN', 30);
const MOVE_EPS = envF('PF_S113_MOVE_EPS_UM', 1) / 1000;
const M_SAMP = Math.round(envF('PF_REV_M', 64));
const JUMP_BAR = envF('PF_REV_JUMPBAR', 30);          // deg — same bar as the turn threshold
const RHO_UM = (process.env.PF_REV_RHOS ?? '100,30,10,3,1,0.3,0.1,0.03').split(',').map(Number);
const NCTL = Math.round(envF('PF_REV_NCTL', 800));
const DIMS: StyleDims = { H: envF('PF_S113_H', 120), Rb: envF('PF_S113_RB', 40), Rt: envF('PF_S113_RT', 50), expn: 1 };
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

log('===== REV-S113 — INDEPENDENT TEST OF THE "CREASE PASSES THROUGH THE VERTEX" INFERENCE =====');
log(`style ${STYLE}  turnThr ${TURN_THR_DEG} deg  noopCut ${MOVE_EPS * 1000} um  circle M ${M_SAMP}  jumpBar ${JUMP_BAR} deg`);
log(`rho ladder (um): ${RHO_UM.join(' ')}`);
log('');

// ── mesh + PRECOND ───────────────────────────────────────────────────────────────────────────────────
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
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];

interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number; locs: Loc[] }
const rows: Row[] = readFileSync(NDJSON, 'utf8').trim().split('\n').map((L) => JSON.parse(L) as Row);
const uniqF: number[] = [...new Set(rows.flatMap((r) => [r.f1, r.f2]))].sort((a, b) => a - b);
let targetArea0 = 0;
for (const f of uniqF) targetArea0 += d0.areaMm2[f];
log(`mesh ${nTri} facets ${meshArea0.toFixed(1)} mm2 | target ${rows.length} pairs / ${uniqF.length} facets / AREA ${targetArea0.toFixed(3)} mm2 (${((targetArea0 / meshArea0) * 100).toFixed(4)}%)  ${el()}`);

// CONTROL A — pinned edge identity (same as s113opSnap; if the set drifted nothing below is comparable)
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

// ── geometry helpers (byte-identical to s113opSnap's, so the split can be compared) ─────────────────
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
  f: number; vi: number; th: number; z: number; move: number; move3d: number; L: number; nCross: number;
}
function planFor(a: Float64Array, f: number, thrDeg: number, refine: boolean): Plan | null {
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
  let best: Plan | null = null;
  for (const cd of cands) {
    let bx = cd.x; let by = cd.y;
    let dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
    if (refine && dd > 1e-12) {
      const ux = (bx - px[cd.m]) / dd; const uy = (by - py[cd.m]) / dd;
      const dl = Math.max(1e-6, 0.5 * dd);
      const lt = locateTurnAdaptive(rA, H, (bx - ux * dl) / rRef, by - uy * dl, (bx + ux * dl) / rRef, by + uy * dl, rRef, 16);
      if ((lt.turn * 180) / Math.PI > thrDeg) {
        bx = bx - ux * dl + 2 * ux * dl * lt.s; by = by - uy * dl + 2 * uy * dl * lt.s;
        dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
      }
    }
    const nth = bx / rRef;
    const nz = by < 0 ? 0 : by > H ? H : by;
    const nr = rA(nth, nz);
    const o = f * 9 + cd.m * 3;
    const m3 = Math.hypot(nr * Math.cos(nth) - a[o], nr * Math.sin(nth) - a[o + 1], nz - a[o + 2]);
    if (best === null || m3 < best.move3d) best = { f, vi: cd.m, th: nth, z: nz, move: dd, move3d: m3, L, nCross: cross.length };
  }
  return best;
}

// ── REPRO CONTROL: the three-way split must match s113opSnap's printed numbers ───────────────────────
const plans: Plan[] = [];
let noneCount = 0; let noneArea = 0;
for (const f of uniqF) {
  const p = planFor(xyz0, f, TURN_THR_DEG, true);
  if (p === null) { noneCount += 1; noneArea += d0.areaMm2[f]; continue; }
  plans.push(p);
}
const noop = plans.filter((p) => p.move3d < MOVE_EPS);
const real = plans.filter((p) => p.move3d >= MOVE_EPS);
const ar = (ps: Plan[]): number => ps.reduce((s, p) => s + d0.areaMm2[p.f], 0);
const noopA = ar(noop); const realA = ar(real);
log('');
log('══ REPRO CONTROL — the three-way split (s113opSnap printed 2215/10.836/15.52%, 2479/30.119/43.13%, 1499/28.870/41.35%) ══');
log(`  NONE  COUNT ${noneCount}  AREA ${noneArea.toFixed(3)} mm2 (${((noneArea / targetArea0) * 100).toFixed(2)}%)`);
log(`  NO-OP COUNT ${noop.length}  AREA ${noopA.toFixed(3)} mm2 (${((noopA / targetArea0) * 100).toFixed(2)}%)  move3d p90 ${(q(noop.map((p) => p.move3d), 0.9) * 1e6).toFixed(1)} nm`);
log(`  REAL  COUNT ${real.length}  AREA ${realA.toFixed(3)} mm2 (${((realA / targetArea0) * 100).toFixed(2)}%)  move3d p50 ${(q(real.map((p) => p.move3d), 0.5) * 1000).toFixed(1)} um  p90 ${(q(real.map((p) => p.move3d), 0.9) * 1000).toFixed(1)} um`);
log(`  ${el()}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INDEPENDENT INSTRUMENT — circular normal probe, no bisection
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const scP = new Float64Array(12);
const angOf = (p: number[], qv: number[]): number => {
  let d = p[0] * qv[0] + p[1] * qv[1] + p[2] * qv[2];
  d = d > 1 ? 1 : d < -1 ? -1 : d; return (Math.acos(d) * 180) / Math.PI;
};
/** max angle between CONSECUTIVE normals on a circle of arclength radius rho about (th0,z0). */
function circleJumpDeg(th0: number, z0: number, rRef: number, rhoMm: number): number {
  const h = Math.max(1e-9, rhoMm / 16);
  const ns = fdNormalsCentral(rA, H, h, h);
  const N: number[][] = [];
  for (let i = 0; i < M_SAMP; i += 1) {
    const a = (2 * Math.PI * i) / M_SAMP;
    const th = th0 + (rhoMm * Math.cos(a)) / rRef;
    const z = z0 + rhoMm * Math.sin(a);
    ns(th, z, scP);
    N.push([scP[0], scP[1], scP[2]]);
  }
  let jm = 0;
  for (let i = 0; i < M_SAMP; i += 1) {
    const a = angOf(N[i], N[(i + 1) % M_SAMP]);
    if (a > jm) jm = a;
  }
  return jm;
}
/** smallest rho on the ladder whose jump clears the bar; +Inf if none does. Returns mm. */
function dUpperMm(th0: number, z0: number, rRef: number): { d: number; jumps: number[] } {
  const jumps = RHO_UM.map((u) => circleJumpDeg(th0, z0, rRef, u / 1000));
  let best = Infinity;
  for (let i = 0; i < RHO_UM.length; i += 1) if (jumps[i] > JUMP_BAR) best = Math.min(best, RHO_UM[i] / 1000);
  return { d: best, jumps };
}

// ── POSITIVE CONTROL: the REAL class's OWN located crossing points must split at the smallest rho ────
// (If the instrument cannot see a crease where the locator says one certainly is, it is broken.)
const stride = (n: number, want: number): number => Math.max(1, Math.floor(n / want));
{
  const sub = real.filter((_, i) => i % stride(real.length, NCTL) === 0).slice(0, NCTL);
  const res = sub.map((p) => dUpperMm(p.th, p.z, rRefOf(xyz0, p.f)));
  const fired = res.filter((r) => Number.isFinite(r.d));
  const tiniest = res.filter((r) => r.d <= RHO_UM[RHO_UM.length - 1] / 1000);
  const a = sub.filter((_, i) => Number.isFinite(res[i].d)).reduce((s, p) => s + d0.areaMm2[p.f], 0);
  const subA = sub.reduce((s, p) => s + d0.areaMm2[p.f], 0);
  log('');
  log(`══ POSITIVE CONTROL — circle probe at the REAL class's own crease targets (n=${sub.length}) ══`);
  log(`  splits at SOME rho: COUNT ${fired.length} (${((fired.length / sub.length) * 100).toFixed(1)}%)  AREA ${a.toFixed(3)} of ${subA.toFixed(3)} mm2 (${((a / subA) * 100).toFixed(1)}%)  MAX jump at rho=${RHO_UM[RHO_UM.length - 1]}um ${mx(res.map((r) => r.jumps[r.jumps.length - 1])).toFixed(2)} deg`);
  log(`  splits at the SMALLEST rho (${RHO_UM[RHO_UM.length - 1]} um): COUNT ${tiniest.length} (${((tiniest.length / sub.length) * 100).toFixed(1)}%)`);
  for (let i = 0; i < RHO_UM.length; i += 1) {
    const v = res.map((r) => r.jumps[i]);
    const over = v.filter((x) => x > JUMP_BAR).length;
    log(`    rho ${String(RHO_UM[i]).padStart(6)} um: jump p50 ${q(v, 0.5).toFixed(2)}  p90 ${q(v, 0.9).toFixed(2)}  MAX ${mx(v).toFixed(2)} deg   over-bar COUNT ${over} (${((over / v.length) * 100).toFixed(1)}%)`);
  }
  if (fired.length < 0.5 * sub.length) log('  *** POSITIVE CONTROL FAILED: the instrument cannot see a known crease. THIS RUN IS VOID. ***');
  log(`  ${el()}`);
}

// ── NEGATIVE CONTROL: random ordinary mesh vertices must NOT split, even at the largest rho ──────────
{
  let seed = 987654321;
  const pts: Array<{ th: number; z: number; rRef: number }> = [];
  for (let i = 0; i < NCTL; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const f = seed % nTri; const k = seed % 3;
    const o = f * 9 + k * 3;
    pts.push({ th: Math.atan2(xyz0[o + 1], xyz0[o]), z: xyz0[o + 2], rRef: rRefOf(xyz0, f) });
  }
  const res = pts.map((p) => dUpperMm(p.th, p.z, p.rRef));
  const fired = res.filter((r) => Number.isFinite(r.d));
  log('');
  log(`══ NEGATIVE CONTROL — circle probe at ${NCTL} RANDOM ordinary mesh vertices ══`);
  for (let i = 0; i < RHO_UM.length; i += 1) {
    const v = res.map((r) => r.jumps[i]);
    const over = v.filter((x) => x > JUMP_BAR).length;
    log(`    rho ${String(RHO_UM[i]).padStart(6)} um: jump p50 ${q(v, 0.5).toFixed(3)}  p90 ${q(v, 0.9).toFixed(3)}  MAX ${mx(v).toFixed(2)} deg   over-bar COUNT ${over} (${((over / v.length) * 100).toFixed(1)}%)`);
  }
  log(`  splits at SOME rho: COUNT ${fired.length} (${((fired.length / pts.length) * 100).toFixed(1)}%)  <- the base rate of "a crease is near an ordinary vertex"`);
  log(`  ${el()}`);
}

// ── THE MEASUREMENT: is the crease really AT the NO-OP vertices? ─────────────────────────────────────
{
  const sub = noop.filter((_, i) => i % stride(noop.length, NCTL) === 0).slice(0, NCTL);
  const res = sub.map((p) => {
    const o = p.f * 9 + p.vi * 3;
    return dUpperMm(Math.atan2(xyz0[o + 1], xyz0[o]), xyz0[o + 2], rRefOf(xyz0, p.f));
  });
  const subA = sub.reduce((s, p) => s + d0.areaMm2[p.f], 0);
  log('');
  log(`══ THE TEST — circle probe AT THE NO-OP VERTICES (n=${sub.length}, AREA ${subA.toFixed(3)} mm2) ══`);
  log('   The claim under test: "a vertex is ALREADY on the crease". That predicts a split that SURVIVES');
  log('   to the smallest rho. The competing explanation (locator tie-break artefact) predicts NO split.');
  for (let i = 0; i < RHO_UM.length; i += 1) {
    const v = res.map((r) => r.jumps[i]);
    const overIdx = sub.filter((_, j) => res[j].jumps[i] > JUMP_BAR);
    const overA = overIdx.reduce((s, p) => s + d0.areaMm2[p.f], 0);
    log(`    rho ${String(RHO_UM[i]).padStart(6)} um: jump p50 ${q(v, 0.5).toFixed(2)}  p90 ${q(v, 0.9).toFixed(2)}  MAX ${mx(v).toFixed(2)} deg   over-bar COUNT ${overIdx.length} (${((overIdx.length / v.length) * 100).toFixed(1)}%)  AREA ${overA.toFixed(3)} mm2 (${((overA / subA) * 100).toFixed(1)}% of probed)`);
  }
  const dv = res.map((r) => r.d).filter((x) => Number.isFinite(x));
  log(`  d_upper (upper bound on vertex->crease distance) over the ${dv.length} that fired: p50 ${(q(dv, 0.5) * 1000).toFixed(3)} um  p90 ${(q(dv, 0.9) * 1000).toFixed(3)} um  MAX ${(mx(dv) * 1000).toFixed(3)} um`);
  log(`  never fired at any rho: COUNT ${sub.length - dv.length} (${(((sub.length - dv.length) / sub.length) * 100).toFixed(1)}%)  AREA ${sub.filter((_, j) => !Number.isFinite(res[j].d)).reduce((s, p) => s + d0.areaMm2[p.f], 0).toFixed(3)} mm2`);
  log(`  ${el()}`);
}

// ── MECHANISM CENSUS: does the crease leave the NO-OP vertex ACROSS THE INTERIOR? ────────────────────
// For each NO-OP facet, look at all three edge locators. A crossing pinned at an END of an edge incident
// on the snapped corner IS that corner. A crossing strictly inside ANY edge, or pinned at the FAR corner,
// is a second, DIFFERENT point on the crease — so the crease enters at the vertex and leaves elsewhere,
// i.e. it cuts the interior and no vertex move can remove it. That is s113opSnap's mechanism claim.
{
  let atVertexOnly = 0; let alsoInterior = 0; let alsoFarCorner = 0;
  let aAV = 0; let aAI = 0; let aAF = 0;
  const EPS_S = 1e-4;
  for (const p of noop) {
    const l3 = locsOf(xyz0, p.f);
    let interior = false; let far = false;
    for (let ei = 0; ei < 3; ei += 1) {
      if (l3[ei].turnDeg <= TURN_THR_DEG) continue;
      const s = l3[ei].s;
      const inside = s > EPS_S && s < 1 - EPS_S;
      // which corner does this crossing coincide with, if pinned?
      const corner = s <= EPS_S ? ei : (ei + 1) % 3;
      if (inside) interior = true;
      else if (corner !== p.vi) far = true;
    }
    if (interior) { alsoInterior += 1; aAI += d0.areaMm2[p.f]; } else if (far) { alsoFarCorner += 1; aAF += d0.areaMm2[p.f]; } else { atVertexOnly += 1; aAV += d0.areaMm2[p.f]; }
  }
  log('');
  log('══ MECHANISM CENSUS on the NO-OP class — where else does the crease touch the facet? ══');
  log(`  ALSO crosses an edge INTERIOR      COUNT ${alsoInterior}  AREA ${aAI.toFixed(3)} mm2 (${((aAI / noopA) * 100).toFixed(1)}% of NO-OP)`);
  log(`  ALSO pinned at a DIFFERENT corner  COUNT ${alsoFarCorner}  AREA ${aAF.toFixed(3)} mm2 (${((aAF / noopA) * 100).toFixed(1)}%)`);
  log(`  ONLY at the snapped corner         COUNT ${atVertexOnly}  AREA ${aAV.toFixed(3)} mm2 (${((aAV / noopA) * 100).toFixed(1)}%)`);
  log(`  ${el()}`);
}

// ── s-DISTRIBUTION, split by turn, so the "60.9% pinned" figure can be read against the defect ───────
{
  const bins = [0, 1e-4, 1e-3, 1e-2, 0.1, 0.5, 0.9, 0.99, 0.999, 0.9999, 1];
  const cntBig: number[] = new Array(bins.length).fill(0);
  const cntSmall: number[] = new Array(bins.length).fill(0);
  let nBig = 0; let nSmall = 0;
  for (const f of uniqF) {
    for (const l of locsOf(xyz0, f)) {
      const arr = l.turnDeg > TURN_THR_DEG ? cntBig : cntSmall;
      if (l.turnDeg > TURN_THR_DEG) nBig += 1; else nSmall += 1;
      let b = 0;
      for (let i = 0; i < bins.length; i += 1) if (l.s >= bins[i]) b = i;
      arr[b] += 1;
    }
  }
  log('');
  log('══ s DISTRIBUTION of all 3 edge locators over the 6,193 target facets ══');
  log('   The tie-break defect walks to an END and returns a SMALL turn. If the pinning were the defect,');
  log('   the SMALL-turn row would be pinned and the LARGE-turn row would not. Diff the two rows.');
  const fmt = (a: number[], n: number): string => a.map((c) => `${((c / Math.max(1, n)) * 100).toFixed(1)}%`).join(' ');
  log(`   bins  >=${bins.join(' >=')}`);
  log(`   turn > ${TURN_THR_DEG} deg (n=${nBig}):  ${fmt(cntBig, nBig)}`);
  log(`   turn <= ${TURN_THR_DEG} deg (n=${nSmall}):  ${fmt(cntSmall, nSmall)}`);
  const pinnedBig = cntBig[0] + cntBig[cntBig.length - 1];
  const pinnedSmall = cntSmall[0] + cntSmall[cntSmall.length - 1];
  log(`   pinned at an END (s<=1e-4 or >=1-1e-4): large-turn ${((pinnedBig / Math.max(1, nBig)) * 100).toFixed(1)}%   small-turn ${((pinnedSmall / Math.max(1, nSmall)) * 100).toFixed(1)}%`);
}

log('');
log(`done ${el()}`);
