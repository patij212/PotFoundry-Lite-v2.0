// s120DriverLib.ts — S120 TASK C. OFFLINE TRANSCRIPTION of the STRATA-001 driver's SPLIT PREDICATE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// It is NOT a mesher and it never writes a mesh. It reads a mesh the DRIVER produced (a binary STL from
// research/bridge/_strataConformBisectL.test.ts) and answers ONE question per facet, using the driver's
// own arithmetic:
//
//        *** IF THE DRIVER POPPED THIS FACET RIGHT NOW, COULD IT SPLIT IT AT ALL? ***
//
// The predicate is `refineDirected`'s LAST-RESORT loop (driver :2291) composed with `splitEdge` (:1963)
// and `bisectAt` (:1778):
//
//   for e in 0..2:  if eLen(e) >= FLOOR_MM  and  splitEdge(a,b)  -> LEGAL
//   splitEdge(a,b): for tPar in NUDGE_LADDER: bisectAt(a, b, placeAt(a,b,tPar), feat) -> true?
//   bisectAt      : shapeAdmits(a,b, liftAt(a,b,tPar))  &&  weld-guards
//   shapeAdmits   : for every LIVE incident triangle, BOTH children aspect3 <= SHAPE_AR
//                   and both children keep the parent's (theta,z) signed-area SIGN
//
// The last-resort loop is what makes this the right predicate: `refineDirected` first tries its ORDERED
// candidates and then, on refusal, RE-TRIES ALL THREE EDGES WITH THE ASPECT GUARD DROPPED. So the only
// surviving legality test is FLOOR_MM + whatever `bisectAt` refuses. Ordering (S119's lever) cannot
// change whether a facet is blocked, only which split it gets — which is exactly why S119's reordering
// could not close the class and why this session asks a different question.
//
// ── THE INSTRUMENT SCARS THIS FILE DECLARES ──────────────────────────────────────────────────────────
//  * f32 REBUILD. An STL stores f32. Every (theta,z) here is RECOVERED from f32 Cartesian coordinates,
//    so it differs from the driver's f64 (theta,z) by ~1e-7 relative. `arBarSensitivity` counts the
//    facets whose verdict could flip under that perturbation; quote it with every legality number.
//  * WELD GRID IS THE FINAL MESH'S. The driver's `gcell` also holds vertices from killed triangles, so
//    it is a SUPERSET of this one and could refuse a weld this does not. On both baselines the driver
//    reports `welded-splits 0 (REFUSED)`, i.e. the weld branch never fired, so the gap is measured at 0.
//  * SNAP. `splitEdge`'s SNAP branch is skipped here. It is OFF on CelticTriquetra (`snaps 0` in the
//    driver log). It is ON for GothicArches and IS transcribed, via locateKinkRaw, when snapOn is set.
//  * NO CAPS, NO STRIDES. Every facet of the mesh is adjudicated. There is no sampling anywhere in the
//    legality predicate.
import { readMeshF32 } from './s118MeshIo';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { aspect3, signedAreaParam, chordParam, type LiftedPoint } from '../bridge/_shapeGuard';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { buildRadiusFn, type StyleDims } from '../bridge/labkit';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleId } from '../../src/geometry/types';

export type RadiusFn = (th: number, z: number) => number;

// ─────────────────────────────── the driver's own defaults, verbatim ───────────────────────────────
export interface DriverConst {
  TOL: number; acceptTol: number;
  AR: number; SHAPE_AR: number;
  FLOOR_MM: number; WELD_MM: number;
  MID3D: boolean; MID3D_ITERS: number; MID3D_MAXSHIFT: number;
  NUDGE_LADDER: number[];
  REF_HS: number; REF_NMIN: number; REF_NMAX: number;
  NOWELD: boolean; SHAPE: boolean; SHAPE_FOLD: boolean;
  SNAP: boolean; SNAP_ALPHA: number;
  H: number;
}
/** driver :147-190 defaults; acceptTol is per-arm and passed in. */
export function driverDefaults(acceptTol: number, snap: boolean): DriverConst {
  return {
    TOL: 0.01, acceptTol,
    AR: 8, SHAPE_AR: 50,
    FLOOR_MM: 1.5 / 1000, WELD_MM: 0.05 / 1000,
    MID3D: true, MID3D_ITERS: 24, MID3D_MAXSHIFT: 0.25,
    NUDGE_LADDER: [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72, 0.21, 0.79, 0.15, 0.85],
    REF_HS: 0.03, REF_NMIN: 12, REF_NMAX: 64,
    NOWELD: true, SHAPE: true, SHAPE_FOLD: true,
    SNAP: snap, SNAP_ALPHA: 0.12,
    H: 120,
  };
}
export const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
/** driver :130-138, verbatim — so the params JSON this prints must equal the driver log's `params` line. */
export function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
export function styleRadius(style: string): { rA: RadiusFn; paramsJson: string } {
  const p = registryDefaults(style);
  return { rA: buildRadiusFn(style as StyleId, p, DIMS) as RadiusFn, paramsJson: JSON.stringify(p) };
}

// ────────────────────────────────────── the rebuilt mesh ──────────────────────────────────────
export interface Mesh {
  nV: number; nT: number;
  vx: Float64Array; vy: Float64Array; vz: Float64Array; vth: Float64Array;
  ta: Int32Array; tb: Int32Array; tc: Int32Array;
  alive: Uint8Array;
  /** eKey -> incident triangle ids */
  edge: Map<number, number[]>;
  area3: number;
  /** |hypot(x,y) - rA(theta,z)| per vertex, in mm */
  rResid: Float64Array;
  BIG: number;
}
export const eKeyOf = (BIG: number, a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);

/**
 * Re-allocate the mesh arrays with headroom so an OFFLINE operator can add vertices and triangles without
 * touching the driver. `nV`/`nT` stay the USED counts; capacity is nV+extraV / nT+extraT.
 */
export function growMesh(M: Mesh, extraV: number, extraT: number): Mesh {
  const cV = M.nV + extraV; const cT = M.nT + extraT;
  const g = (src: Float64Array, n: number): Float64Array => { const d = new Float64Array(n); d.set(src); return d; };
  const gi = (src: Int32Array, n: number): Int32Array => { const d = new Int32Array(n); d.set(src); return d; };
  const gu = (src: Uint8Array, n: number): Uint8Array => { const d = new Uint8Array(n); d.set(src); return d; };
  return {
    ...M,
    vx: g(M.vx, cV), vy: g(M.vy, cV), vz: g(M.vz, cV), vth: g(M.vth, cV), rResid: g(M.rResid, cV),
    ta: gi(M.ta, cT), tb: gi(M.tb, cT), tc: gi(M.tc, cT), alive: gu(M.alive, cT),
  };
}

/**
 * Rebuild the driver's vertex/triangle/edge state from a binary STL.
 *
 * WELD RULE: EXACT f32 bit equality on all three coordinates. That is the right rule and not an
 * approximation of the driver's 50 nm ball: an f32 at |x| ~ 50 mm has a quantum of 50*2^-23 = 6 nm, so
 * two driver vertices further apart than the 50 nm weld radius cannot land on the same f32 triple, and
 * two vertices closer than it were already welded to ONE vertex by the driver. `weldCollisions` counts
 * the pairs of DISTINCT f32 triples that are nonetheless within WELD_MM — if that is non-zero the rule
 * has a gap and the number says how big.
 */
export function rebuildFromStl(path: string): Mesh {
  const { xyz, nTri } = readMeshF32(path);
  const key = new Map<string, number>();
  const vxA: number[] = []; const vyA: number[] = []; const vzA: number[] = [];
  const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
  const idOf = (b: number): number => {
    const x = xyz[b]; const y = xyz[b + 1]; const z = xyz[b + 2];
    const k = `${x},${y},${z}`;
    const got = key.get(k);
    if (got !== undefined) return got;
    const id = vxA.length;
    vxA.push(x); vyA.push(y); vzA.push(z);
    key.set(k, id);
    return id;
  };
  let area3 = 0;
  for (let f = 0; f < nTri; f += 1) {
    const b = f * 9;
    ta[f] = idOf(b); tb[f] = idOf(b + 3); tc[f] = idOf(b + 6);
    const ux = xyz[b + 3] - xyz[b]; const uy = xyz[b + 4] - xyz[b + 1]; const uz = xyz[b + 5] - xyz[b + 2];
    const wx = xyz[b + 6] - xyz[b]; const wy = xyz[b + 7] - xyz[b + 1]; const wz = xyz[b + 8] - xyz[b + 2];
    area3 += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  const nV = vxA.length;
  const vx = Float64Array.from(vxA); const vy = Float64Array.from(vyA); const vz = Float64Array.from(vzA);
  const vth = new Float64Array(nV);
  for (let i = 0; i < nV; i += 1) vth[i] = canonTheta(Math.atan2(vy[i], vx[i]));
  const BIG = 1 << 27;
  if (nV >= BIG) throw new Error(`vertex count ${nV} exceeds the driver's BIG=${BIG} edge-key radix`);
  const edge = new Map<number, number[]>();
  const push = (a: number, b: number, t: number): void => {
    const k = eKeyOf(BIG, a, b);
    const l = edge.get(k); if (l === undefined) edge.set(k, [t]); else l.push(t);
  };
  for (let f = 0; f < nTri; f += 1) { push(ta[f], tb[f], f); push(tb[f], tc[f], f); push(tc[f], ta[f], f); }
  return {
    nV, nT: nTri, vx, vy, vz, vth, ta, tb, tc,
    alive: new Uint8Array(nTri).fill(1), edge, area3, rResid: new Float64Array(nV), BIG,
  };
}

/** Fill `rResid` and return the on-surface statistics. One rA eval per vertex. */
export function measureSurfaceResidual(M: Mesh, rA: RadiusFn): { p50: number; p99: number; max: number } {
  const v: number[] = [];
  for (let i = 0; i < M.nV; i += 1) {
    const d = Math.abs(Math.hypot(M.vx[i], M.vy[i]) - rA(M.vth[i], M.vz[i]));
    M.rResid[i] = d; v.push(d);
  }
  v.sort((a, b) => a - b);
  return { p50: v[Math.floor(v.length * 0.5)], p99: v[Math.floor(v.length * 0.99)], max: v[v.length - 1] };
}

// ───────────────────────────── the driver's per-facet quantities ─────────────────────────────
export const eLen = (M: Mesh, a: number, b: number): number =>
  Math.hypot(M.vx[a] - M.vx[b], M.vy[a] - M.vy[b], M.vz[a] - M.vz[b]);
export const dTh = (M: Mesh, a: number, b: number): number => dThRaw(M.vth[a], M.vth[b]);
export const triArea = (M: Mesh, t: number): number => {
  const a = M.ta[t]; const b = M.tb[t]; const c = M.tc[t];
  const ux = M.vx[b] - M.vx[a]; const uy = M.vy[b] - M.vy[a]; const uz = M.vz[b] - M.vz[a];
  const wx = M.vx[c] - M.vx[a]; const wy = M.vy[c] - M.vy[a]; const wz = M.vz[c] - M.vz[a];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
export const arOf = (M: Mesh, t: number): number => {
  const a = M.ta[t]; const b = M.tb[t]; const c = M.tc[t];
  return aspect3(M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], M.vx[c], M.vy[c], M.vz[c]);
};
export const eVerts = (M: Mesh, t: number, e: number): [number, number] =>
  (e === 0 ? [M.ta[t], M.tb[t]] : e === 1 ? [M.tb[t], M.tc[t]] : [M.tc[t], M.ta[t]]);

// ───────────────────────────── the placement machinery, verbatim ─────────────────────────────
/** driver :616 `edgeParam` */
export const edgeParam = (M: Mesh, a: number, b: number, t: number): [number, number] =>
  [M.vth[a] + dTh(M, a, b) * t, M.vz[a] + (M.vz[b] - M.vz[a]) * t];
/** driver :1487 `liftAt` — canon FIRST, rA at the canonical theta, cos/sin of that same theta. */
export function liftAt(M: Mesh, rA: RadiusFn, a: number, b: number, s: number): LiftedPoint {
  const [th, z] = edgeParam(M, a, b, s);
  const theta = canonTheta(th);
  const r = rA(theta, z);
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), z, th: theta };
}
/** driver :1497 `placeAt` with PF_CB_MID3D=1 (the default, and what both baselines ran). */
export function placeAt(M: Mesh, rA: RadiusFn, C: DriverConst, a: number, b: number, frac: number): number {
  if (!C.MID3D) return frac;
  const s = chordParam(
    (u) => liftAt(M, rA, a, b, u),
    M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], frac, C.MID3D_ITERS,
  );
  const shift = Math.abs(s - frac);
  if (shift <= C.MID3D_MAXSHIFT) return s;
  return s > frac ? frac + C.MID3D_MAXSHIFT : frac - C.MID3D_MAXSHIFT;
}
/** driver :1479 `orientedEnds` */
export function orientedEnds(M: Mesh, t: number, a: number, b: number): [number, number] {
  const seq = [M.ta[t], M.tb[t], M.tc[t]];
  for (let i = 0; i < 3; i += 1) {
    if (seq[i] === a && seq[(i + 1) % 3] === b) return [a, b];
    if (seq[i] === b && seq[(i + 1) % 3] === a) return [b, a];
  }
  return [a, b];
}

export interface AdmitStat { arRefusals: number; foldRefusals: number; worstChildAr: number }
/**
 * driver :1621 `shapeAdmits`, ADMIT_NORMAL_SPLIT off (S118 default) — both children of every LIVE
 * incident triangle, aspect3 <= SHAPE_AR and (theta,z) signed-area sign preserved.
 */
export function shapeAdmits(
  M: Mesh, C: DriverConst, a: number, b: number, p: LiftedPoint, st?: AdmitStat,
): boolean {
  if (!C.SHAPE) return true;
  const list = M.edge.get(eKeyOf(M.BIG, a, b));
  if (list === undefined) return true;
  for (const t of list) {
    if (M.alive[t] === 0) continue;
    const apex = M.ta[t] !== a && M.ta[t] !== b ? M.ta[t] : M.tb[t] !== a && M.tb[t] !== b ? M.tb[t] : M.tc[t];
    const [oa, ob] = orientedEnds(M, t, a, b);
    const ar1 = aspect3(M.vx[oa], M.vy[oa], M.vz[oa], p.x, p.y, p.z, M.vx[apex], M.vy[apex], M.vz[apex]);
    const ar2 = aspect3(p.x, p.y, p.z, M.vx[ob], M.vy[ob], M.vz[ob], M.vx[apex], M.vy[apex], M.vz[apex]);
    if (st !== undefined) { if (ar1 > st.worstChildAr) st.worstChildAr = ar1; if (ar2 > st.worstChildAr) st.worstChildAr = ar2; }
    if (ar1 > C.SHAPE_AR || ar2 > C.SHAPE_AR) { if (st !== undefined) st.arRefusals += 1; return false; }
    if (!C.SHAPE_FOLD) continue;
    const sPar = signedAreaParam(M.vth[apex], M.vz[apex], M.vth[oa], M.vz[oa], M.vth[ob], M.vz[ob]);
    const s1 = signedAreaParam(M.vth[apex], M.vz[apex], M.vth[oa], M.vz[oa], p.th, p.z);
    const s2 = signedAreaParam(M.vth[apex], M.vz[apex], p.th, p.z, M.vth[ob], M.vz[ob]);
    if (Math.sign(s1) !== Math.sign(sPar) || Math.sign(s2) !== Math.sign(sPar)) {
      if (st !== undefined) st.foldRefusals += 1; return false;
    }
  }
  return true;
}

// ───────────────────────────── the WELD grid (driver :596 `addV`) ─────────────────────────────
export interface WeldGrid { cell: Map<string, number[]>; h: number }
export function buildWeldGrid(M: Mesh, C: DriverConst): WeldGrid {
  const cell = new Map<string, number[]>();
  const gi = (v: number): number => Math.floor(v / C.WELD_MM);
  for (let i = 0; i < M.nV; i += 1) {
    const k = `${gi(M.vx[i])},${gi(M.vy[i])},${gi(M.vz[i])}`;
    const l = cell.get(k); if (l === undefined) cell.set(k, [i]); else l.push(i);
  }
  return { cell, h: C.WELD_MM };
}
/** the vertex `addV` would WELD onto, or -1 for a genuinely new vertex. */
export function weldHit(M: Mesh, G: WeldGrid, x: number, y: number, z: number): number {
  const gi = (v: number): number => Math.floor(v / G.h);
  const cx = gi(x); const cy = gi(y); const cz = gi(z);
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
    const l = G.cell.get(`${cx + dx},${cy + dy},${cz + dz}`);
    if (l === undefined) continue;
    for (const j of l) if (Math.hypot(M.vx[j] - x, M.vy[j] - y, M.vz[j] - z) <= G.h) return j;
  }
  return -1;
}

// ───────────────────────────── THE PREDICATE ─────────────────────────────
export interface SplitProbe {
  legal: boolean;
  /** first ladder rung index that was admitted, -1 if none */
  rung: number;
  /** worst child AR seen across the rungs tried (the evidence for "how far from legal") */
  worstChildAr: number;
  refusedAr: number; refusedFold: number; refusedWeld: number; refusedApex: number;
  rAEvals: number;
}
/**
 * driver :1963 `splitEdge` composed with :1778 `bisectAt`, for the NUDGE-LADDER route.
 * SNAP is applied first when C.SNAP is set (GothicArches), exactly as `splitEdge` does.
 */
export function probeSplitEdge(
  M: Mesh, rA: RadiusFn, C: DriverConst, G: WeldGrid, a: number, b: number, PRED?: SweepPredConst,
): SplitProbe {
  const out: SplitProbe = {
    legal: false, rung: -1, worstChildAr: 0,
    refusedAr: 0, refusedFold: 0, refusedWeld: 0, refusedApex: 0, rAEvals: 0,
  };
  const st: AdmitStat = { arRefusals: 0, foldRefusals: 0, worstChildAr: 0 };
  const list = M.edge.get(eKeyOf(M.BIG, a, b)) ?? [];
  const tryAt = (sPar: number, rung: number): boolean => {
    const p = liftAt(M, rA, a, b, sPar); out.rAEvals += 1;
    if (!shapeAdmits(M, C, a, b, p, st)) return false;
    const m = weldHit(M, G, p.x, p.y, p.z);
    if (m === a || m === b) { out.refusedWeld += 1; return false; }        // weld-collapse
    if (m >= 0) { if (C.NOWELD) { out.refusedWeld += 1; return false; } }  // weld
    if (m >= 0) for (const t of list) {
      if (M.alive[t] === 0) continue;
      if (M.ta[t] === m || M.tb[t] === m || M.tc[t] === m) { out.refusedApex += 1; return false; }
    }
    let anyLive = false;
    for (const t of list) if (M.alive[t] !== 0) { anyLive = true; break; }
    if (!anyLive) return false;                                            // no-incident
    out.rung = rung; return true;
  };
  // SNAP branch (driver :1964-1994). Only when the arm ran with PF_CB_SNAP=1.
  if (C.SNAP && PRED !== undefined) {
    const k = locateKinkRaw(rA, M.vth[a], M.vz[a], M.vth[a] + dTh(M, a, b), M.vz[b], PRED);
    out.rAEvals += PRED.kinkScan + 2 * PRED.kinkHalvings + 4;
    if (k !== null && k.t > C.SNAP_ALPHA && k.t < 1 - C.SNAP_ALPHA) {
      if (tryAt(k.t, -2)) { out.legal = true; out.worstChildAr = st.worstChildAr; out.refusedAr = st.arRefusals; out.refusedFold = st.foldRefusals; return out; }
    }
  }
  for (let i = 0; i < C.NUDGE_LADDER.length; i += 1) {
    const s = placeAt(M, rA, C, a, b, C.NUDGE_LADDER[i]);
    out.rAEvals += C.MID3D ? C.MID3D_ITERS : 0;
    if (tryAt(s, i)) { out.legal = true; break; }
  }
  out.worstChildAr = st.worstChildAr; out.refusedAr = st.arRefusals; out.refusedFold = st.foldRefusals;
  return out;
}

export interface FacetLegality {
  /** at least one edge >= FLOOR_MM that `splitEdge` would succeed on */
  legal: boolean;
  /** edges >= FLOOR_MM (the last-resort loop's candidate set) */
  nAboveFloor: number;
  worstChildAr: number;
  rAEvals: number;
}
/** driver :2291 — the LAST-RESORT loop. This is the honest "can this facet be refined at all". */
export function facetLegality(
  M: Mesh, rA: RadiusFn, C: DriverConst, G: WeldGrid, t: number, PRED?: SweepPredConst,
): FacetLegality {
  let n = 0; let worst = 0; let evals = 0;
  for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e);
    if (eLen(M, a, b) < C.FLOOR_MM) continue;
    n += 1;
    const p = probeSplitEdge(M, rA, C, G, a, b, PRED);
    evals += p.rAEvals;
    if (p.worstChildAr > worst) worst = p.worstChildAr;
    if (p.legal) return { legal: true, nAboveFloor: n, worstChildAr: worst, rAEvals: evals };
  }
  return { legal: false, nAboveFloor: n, worstChildAr: worst, rAEvals: evals };
}

// ───────────────────────────── DEMAND: the driver's own accept test ─────────────────────────────
export function makeSagMesh(M: Mesh): SagMesh {
  return { ta: M.ta, tb: M.tb, tc: M.tc, vth: M.vth, vx: M.vx, vy: M.vy, vz: M.vz };
}
/** driver `consider` :3123 — RANK=plane, ADAPT on: sagAdaptive(t, 0.03, 12, 64) vs acceptTol. */
export function makeDemand(M: Mesh, rA: RadiusFn, C: DriverConst): (t: number) => number {
  const SM = makeSagMesh(M);
  const arg = makeSagArgmax();
  return (t: number) => sagAdaptiveRaw(rA, SM, t, C.REF_HS, C.REF_NMIN, C.REF_NMAX, arg);
}

// ─────────────────── EDGE CONFORMANCE — the S120 standard (Task B's quantity) ───────────────────
/**
 * max over the 3-D SEGMENT (P,Q) of dist(point, surface).
 *
 * *** THIS IS NOT `edgeSag`. *** `edgeSag` measures the surface CURVE over the edge's parameter against
 * the straight chord — a curve-to-chord distance. The conformance standard is POINT-TO-SURFACE, which
 * is smaller and is the quantity a slicer actually sees. The two are different numbers and must never
 * be swapped.
 *
 * RULER: radial distance on a lattice of `n` interior samples is a SOUND UPPER BOUND (memory: "radial is
 * a sound UPPER bound only"), so `radialMax` never under-reports. The lattice argmax is then refined by
 * a golden-section descent on the radial function and the winner is confirmed PERPENDICULARLY by the
 * caller. `n` is a declared parameter and callers publish a ladder over it.
 */
export function edgeRadialMax(
  rA: RadiusFn, H: number,
  px: number, py: number, pz: number, qx: number, qy: number, qz: number, n: number,
): { d: number; s: number } {
  let best = 0; let bs = 0;
  const at = (s: number): number => {
    const x = px + (qx - px) * s; const y = py + (qy - py) * s; const z = pz + (qz - pz) * s;
    const th = Math.atan2(y, x);
    const zc = z < 0 ? 0 : z > H ? H : z;
    const r = rA(canonTheta(th), zc);
    return Math.hypot(x - r * Math.cos(th), y - r * Math.sin(th), z - zc);
  };
  for (let i = 1; i < n; i += 1) {
    const s = i / n; const d = at(s);
    if (d > best) { best = d; bs = s; }
  }
  // golden-section refinement in the bracket around the lattice argmax
  let lo = Math.max(0, bs - 1 / n); let hi = Math.min(1, bs + 1 / n);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo); let d2 = lo + phi * (hi - lo);
  let fc = at(c); let fd = at(d2);
  for (let i = 0; i < 40; i += 1) {
    if (fc > fd) { hi = d2; d2 = c; fd = fc; c = hi - phi * (hi - lo); fc = at(c); }
    else { lo = c; c = d2; fc = fd; d2 = lo + phi * (hi - lo); fd = at(d2); }
  }
  const sm = 0.5 * (lo + hi); const dm = at(sm);
  if (dm > best) { best = dm; bs = sm; }
  return { d: best, s: bs };
}

/**
 * MAX ADJACENT |Δ rA| along the edge's PARAMETER segment, at `n` samples.
 *
 * *** WHY THIS EXISTS, AND IT IS THE INSTRUMENT SCAR THIS SESSION WOULD OTHERWISE REPEAT. ***
 * `rA` is SINGLE-VALUED in (theta,z). Where the style has a C0 radius cliff the printable surface has a
 * near-vertical RISER that rA does not contain, and the driver emits it as a TREAD through `stitchRings`.
 * A radial or perpendicular distance from a point on (or near) a riser to the single-valued rA therefore
 * reads the CLIFF HEIGHT, not a meshing error — the exact over-read recorded in
 * project_prod_export_truth_audit.md ("measureProjectorMax INFLATES riser styles"). Any edge-conformance
 * number quoted without this split is that artefact.
 *
 * A smooth segment's adjacent jump scales as |dr/ds|·L/n and is a few µm at n=256; a cliff crossing carries
 * the whole jump in ONE interval whatever n is. Callers publish the whole bar ladder, never one constant.
 */
export function edgeCliffJump(
  rA: RadiusFn, thA: number, zA: number, dth: number, dz: number, n: number,
): number {
  let prev = rA(canonTheta(thA), zA);
  let mx = 0;
  for (let i = 1; i <= n; i += 1) {
    const s = i / n;
    const r = rA(canonTheta(thA + dth * s), zA + dz * s);
    const d = Math.abs(r - prev);
    if (d > mx) mx = d;
    prev = r;
  }
  return mx;
}
