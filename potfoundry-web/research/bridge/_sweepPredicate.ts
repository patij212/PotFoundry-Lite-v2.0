// _sweepPredicate.ts — THE ONE DEFINITION of the sweep driver's per-edge predicate. RESEARCH ONLY.
//
// WHY THIS FILE EXISTS, and it is the same reason _facetTruthH1.ts exists. The Phase-1 FIFO sweep driver
// (_strataConformBisect.test.ts, PF_CB_DRIVER=sweep) spends essentially 100 % of its wall clock inside
// `triangleNeed`, which is `edgeSag` + `locateKink` + one crossing-point solve per edge — ~130 rA evals.
// Those are READ-ONLY against the mesh and against rA, and independent per edge, so they parallelise
// exactly. But a worker thread cannot receive a closure: it has to rebuild rA from (style, params, dims)
// and re-run the SAME arithmetic. If the parent kept its inline copy of `edgeSag`/`locateKink` and the
// worker carried a second one, a one-character divergence would silently produce two different predicates,
// the pooled mesh would be refined against a surface the serial mesh never used, and NOTHING in the report
// would say so. This repo has already paid for exactly that failure mode once (the Voronoi hash desync:
// a partial int-hash swap left 2 of 4 copies stale).
//
// So there is ONE body. The test file's `canon` / `dTh` / `edgeSag` / `locateKink` are thin wrappers that
// bind the mesh arrays to these functions; the worker binds a SharedArrayBuffer view to the same functions.
// Bit-identity is therefore true BY CONSTRUCTION. It is ALSO checked at runtime two ways, because "by
// construction" is an argument and this campaign runs on measurements:
//   * _sweepRA.ts's lattice proves the REBUILT rA is bit-identical before a single edge is measured;
//   * PF_CB_SWEEP_VERIFY=1 re-measures every prefetched edge on the main thread and Object.is-compares
//     all seven fields, refusing the run on any deviation.
//
// NOTHING HERE IS NEW MATHS. Every line below is a transcription of the body that was inline in
// _strataConformBisect.test.ts as of 2026-07-29, with the closed-over mesh arrays turned into parameters
// and the closed-over env constants turned into one options object. The heap driver calls the same
// wrappers, so `PF_CB_DRIVER=heap` — the control for every comparison in the campaign — must produce a
// byte-identical STL across this refactor. That is verified, not assumed.

const TWO_PI = 2 * Math.PI;

/** rA as the driver consults it: RAW theta (canonicalisation is applied at the call sites, exactly as before). */
export type SweepRadiusFn = (th: number, z: number) => number;

/** Every env-derived constant the predicate reads. Plain JSON so it crosses a thread boundary unchanged. */
export interface SweepPredConst {
  /** PF_CB_ESN — floor on edgeSag's sample count (the old fixed count) */
  esN: number;
  /** PF_CB_REF_HS — absolute sampling pitch in mm */
  refHs: number;
  /** PF_CB_REF_NMAX — ceiling on edgeSag's sample count */
  refNmax: number;
  /** PF_CB_KINK_SCAN — coarse-scan bin count */
  kinkScan: number;
  /** PF_CB_KINK_HALVINGS — bracket halvings */
  kinkHalvings: number;
  /** PF_CB_KINK_RATIO — small/big above this is crease-or-jump */
  kinkRatio: number;
  /** PF_CB_JUMP_RATIO — small/big above this is a C0 JUMP */
  jumpRatio: number;
  /** PF_CB_SNAP — 0 is the ablation arm: no kink probe at all */
  snap: boolean;
  /** PF_CB_CONF_UM / 1000 — the ABSOLUTE conformance radius, in mm */
  confMm: number;
}

export interface SweepKink { t: number; big: number; ratio: number; jump: boolean }

/**
 * The PURE half of the driver's `computeVerdict`: everything that is a function of the two endpoints'
 * coordinates and of rA, and nothing that is driver state. `jumpConfirmed` is DELIBERATELY absent — it is
 * produced by the §3.3 stickiness rule, which reads and writes a cross-sweep site map, so it is not a
 * measurement and must stay on the main thread. See the long note in _sweepPool.ts.
 */
export interface SweepRawVerdict {
  sag: number;
  kink: SweepKink | null;
  conformed: boolean;
  px: number; py: number; pz: number;
}

/** theta canonicalised into [0,2pi). Transcribed verbatim from the driver's `canon`. */
export function canonTheta(t: number): number {
  let x = t % TWO_PI;
  if (x < 0) x += TWO_PI;
  return x;
}

/** shortest-arc theta delta from a to b (handles the theta=0=2pi seam). Verbatim from the driver's `dTh`. */
export function dThRaw(tha: number, thb: number): number {
  let d = thb - tha;
  if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
  return d;
}

/**
 * EDGE CHORD SAG — max distance from the true surface curve over the edge's parametric span to the straight
 * 3-D edge, at ABSOLUTE pitch. Verbatim transcription; `ex/ey/ez` were `let` in the original and are never
 * reassigned, so they are `const` here (same arithmetic, quieter lint).
 *
 * NOTE THE TWO DIFFERENT THETAS, because getting them backwards is a silent 1-ULP class of bug: rA is
 * evaluated at canonTheta(th) but the CARTESIAN lift uses the RAW th. That is what the original does and it
 * matters at the seam.
 */
export function edgeSagRaw(
  R: SweepRadiusFn,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  thA: number, dth: number,
  K: SweepPredConst,
): number {
  const ex = bx - ax; const ey = by - ay; const ez = bz - az;
  const eL2 = ex * ex + ey * ey + ez * ez;
  if (eL2 < 1e-24) return 0;
  const th0 = thA; const d = dth; const z0 = az; const dz = bz - az;
  let best = 0;
  const esN = Math.max(K.esN, Math.min(K.refNmax, Math.ceil(Math.sqrt(eL2) / K.refHs)));
  for (let k = 1; k < esN; k += 1) {
    const t = k / esN;
    const th = th0 + d * t; const z = z0 + dz * t;
    const r = R(canonTheta(th), z);
    const px = r * Math.cos(th) - ax; const py = r * Math.sin(th) - ay; const pz = z - az;
    const proj = (px * ex + py * ey + pz * ez) / eL2;
    const qx = px - proj * ex; const qy = py - proj * ey; const qz = pz - proj * ez;
    const dist = Math.hypot(qx, qy, qz);
    if (dist > best) best = dist;
  }
  return best;
}

/**
 * THE GENERIC 1-D KINK LOCATOR. Segment (th0,z0) -> (th1,z1) in (theta,z); returns the parameter of the
 * gradient discontinuity plus its two-scale class. Verbatim transcription — coarse scan, bracket-halving
 * bisection (this is what buys sub-micron placement), then the two-scale class test AT the located point.
 */
export function locateKinkRaw(
  R: SweepRadiusFn,
  th0: number, z0: number, th1: number, z1: number,
  K: SweepPredConst,
): SweepKink | null {
  const dth = th1 - th0; const dz = z1 - z0;
  const at = (t: number): number => R(canonTheta(th0 + dth * t), z0 + dz * t);
  // 1. coarse scan
  const N = K.kinkScan;
  const rs = new Float64Array(N + 1);
  for (let k = 0; k <= N; k += 1) rs[k] = at(k / N);
  let bi = -1; let bv = 0;
  for (let k = 1; k < N; k += 1) { const d2 = Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]); if (d2 > bv) { bv = d2; bi = k; } }
  if (bi < 0 || bv <= 0) return null;
  // 2. bracket-halving kink bisection — keep the half with the larger |D2r|.
  let lo = (bi - 1) / N; let hi = (bi + 1) / N;
  let fLo = rs[bi - 1]; let fHi = rs[bi + 1]; let fMid = rs[bi];
  for (let it = 0; it < K.kinkHalvings; it += 1) {
    const mid = 0.5 * (lo + hi);
    const q1 = 0.5 * (lo + mid); const q3 = 0.5 * (mid + hi);
    const fq1 = at(q1); const fq3 = at(q3);
    const dL = Math.abs(fLo - 2 * fq1 + fMid);
    const dR = Math.abs(fMid - 2 * fq3 + fHi);
    if (dL >= dR) { hi = mid; fHi = fMid; fMid = fq1; } else { lo = mid; fLo = fMid; fMid = fq3; }
  }
  const tStar = 0.5 * (lo + hi);
  // 3. TWO-SCALE class test AT the located point (window = the original bracket half-width)
  const w = 1 / N;
  const c = at(tStar);
  const big = Math.abs(at(tStar + w) - 2 * c + at(tStar - w));
  const small = Math.abs(at(tStar + w / 4) - 2 * c + at(tStar - w / 4));
  if (big <= 1e-12) return null;
  const ratio = small / big;
  if (ratio < K.kinkRatio) return null; // smooth curvature peak (~1/16) — density handles it
  return { t: tStar, big, ratio, jump: ratio > K.jumpRatio };
}

/**
 * THE WHOLE PURE PREDICATE FOR ONE EDGE, in the driver's own order: sag, then (under SNAP) the kink probe,
 * then the crossing point, then the ABSOLUTE conformance test. Transcribed from `computeVerdict`, minus the
 * `jumpConfirmed` field, which the caller fills in (main thread only — see SweepRawVerdict).
 *
 * `conformed` is true in the VACUOUS sense when there is no locus on the edge; `triangleNeed` never consults
 * it in that case, exactly as before.
 */
export function edgeVerdictRaw(
  R: SweepRadiusFn,
  thA: number, zA: number, xA: number, yA: number,
  thB: number, zB: number, xB: number, yB: number,
  K: SweepPredConst,
): SweepRawVerdict {
  const d = dThRaw(thA, thB);
  const sag = edgeSagRaw(R, xA, yA, zA, xB, yB, zB, thA, d, K);
  const kink = K.snap ? locateKinkRaw(R, thA, zA, thA + d, zB, K) : null;
  if (kink === null) return { sag, kink: null, conformed: true, px: 0, py: 0, pz: 0 };
  // crossPoint: edgeParam gives (theta,z), one R() gives r. Cartesian lift uses the CANONICAL theta here
  // (unlike edgeSag) — again verbatim, again load-bearing at the seam.
  const th = thA + d * kink.t; const z = zA + (zB - zA) * kink.t;
  const thc = canonTheta(th); const r = R(thc, z);
  const px = r * Math.cos(thc); const py = r * Math.sin(thc); const pz = z;
  const conformed = Math.min(
    Math.hypot(xA - px, yA - py, zA - pz),
    Math.hypot(xB - px, yB - py, zB - pz),
  ) <= K.confMm;
  return { sag, kink, conformed, px, py, pz };
}

// ─────────────────────────── the wire format between parent and worker ───────────────────────────
// One edge = VERT_STRIDE doubles of INPUT (read from the vertex mirror) and RES_STRIDE doubles of OUTPUT.
// `RES_STATUS` starts at 0 and is set to 1 by the worker that finishes the edge, so a slot no worker
// reached is DISTINGUISHABLE from a slot that legitimately measured zero. The parent refuses to consume a
// slot whose status is not 1 — a dropped chunk must never read as "no feature here".

/** vertex mirror stride: theta, z, x, y. Vertices are never MOVED, so the mirror is append-only. */
export const VERT_STRIDE = 4;

export const RES_STRIDE = 12;
export const RES_SAG = 0;
export const RES_HASKINK = 1;
export const RES_KT = 2;
export const RES_KBIG = 3;
export const RES_KRATIO = 4;
export const RES_KJUMP = 5;
export const RES_CONFORMED = 6;
export const RES_PX = 7;
export const RES_PY = 8;
export const RES_PZ = 9;
export const RES_STATUS = 10;
// slot 11 is reserved so the stride stays a power-of-two-friendly 12 doubles = 96 B (one and a half cache
// lines); adding a field later must not silently reinterpret an old buffer.

/** Pack one raw verdict into `out` at edge index `i`. Used by the worker only. */
export function packVerdict(out: Float64Array, i: number, v: SweepRawVerdict): void {
  const o = i * RES_STRIDE;
  out[o + RES_SAG] = v.sag;
  out[o + RES_HASKINK] = v.kink === null ? 0 : 1;
  out[o + RES_KT] = v.kink === null ? 0 : v.kink.t;
  out[o + RES_KBIG] = v.kink === null ? 0 : v.kink.big;
  out[o + RES_KRATIO] = v.kink === null ? 0 : v.kink.ratio;
  out[o + RES_KJUMP] = v.kink === null ? 0 : (v.kink.jump ? 1 : 0);
  out[o + RES_CONFORMED] = v.conformed ? 1 : 0;
  out[o + RES_PX] = v.px; out[o + RES_PY] = v.py; out[o + RES_PZ] = v.pz;
  out[o + RES_STATUS] = 1;
}

/** Unpack one raw verdict. Returns null when the slot was never written (see RES_STATUS). */
export function unpackVerdict(out: Float64Array, i: number): SweepRawVerdict | null {
  const o = i * RES_STRIDE;
  if (out[o + RES_STATUS] !== 1) return null;
  const hasKink = out[o + RES_HASKINK] === 1;
  return {
    sag: out[o + RES_SAG],
    kink: hasKink ? { t: out[o + RES_KT], big: out[o + RES_KBIG], ratio: out[o + RES_KRATIO], jump: out[o + RES_KJUMP] === 1 } : null,
    conformed: out[o + RES_CONFORMED] === 1,
    px: out[o + RES_PX], py: out[o + RES_PY], pz: out[o + RES_PZ],
  };
}

/**
 * Object.is over every measured field. Used by PF_CB_SWEEP_VERIFY to prove a worker's reading is BIT-identical
 * to the main thread's, not merely close. Object.is so a NaN/NaN pair counts as identical and +0/-0 does not.
 */
export function verdictIdentical(a: SweepRawVerdict, b: SweepRawVerdict): boolean {
  if (!Object.is(a.sag, b.sag)) return false;
  if ((a.kink === null) !== (b.kink === null)) return false;
  if (a.kink !== null && b.kink !== null) {
    if (!Object.is(a.kink.t, b.kink.t)) return false;
    if (!Object.is(a.kink.big, b.kink.big)) return false;
    if (!Object.is(a.kink.ratio, b.kink.ratio)) return false;
    if (a.kink.jump !== b.kink.jump) return false;
  }
  if (a.conformed !== b.conformed) return false;
  return Object.is(a.px, b.px) && Object.is(a.py, b.py) && Object.is(a.pz, b.pz);
}
