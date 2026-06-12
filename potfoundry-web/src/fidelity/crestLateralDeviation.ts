/**
 * crestLateralDeviation.ts — STAGE 2a faithful crest lateral-deviation
 * instrument (blueprint `faithfulMetricSpec` items 1–3).
 *
 * ## What this measures (the user's quantity)
 *
 * Serration amplitude in MILLIMETERS versus the ANALYTIC ridge — density-
 * independent by construction. The existing `crestBandTriangleQuality`
 * measures triangle SHAPE (min interior angle), not geometric truth; a
 * staircase that only gets DENSER as triangle density rises is invisible to a
 * shape metric but is exactly what this instrument reads: the lateral
 * (perpendicular-to-crest-tangent) offset of the mesh crest apex from the
 * analytic ridge locus,
 *
 *     d = r · wrapPi(θ_mesh − θ_true) / √(1 + (r · dθ_true/dz)²)   [mm]
 *
 * reported per crest as MAX and RMS amplitude and globally as the worst
 * crest. All numbers are absolute mm and worst-case — NO percent fields.
 *
 * ## The three parts
 *
 * 1. TRUE RIDGE — `sfClosedFormCrestLoci`/`sfClosedFormParamRidge` give the
 *    SuperformulaBlossom loci in CLOSED FORM (reference error ≈ 0 by
 *    construction); `solveParamRidgeByBisection` is the generic path: exact
 *    roots of g(u,t) = ∂r/∂u = 0 by bisection on an f64 CPU radius mirror to
 *    |du| ≤ 1e-6, seeded by a per-row zero scan (the 768×320 marching-squares
 *    class) and chained by predictor-corrector continuation along t, with
 *    fold-point branch births solved as g = 0 ∧ ∂g/∂u = 0. EVERY amplitude
 *    for a non-closed-form ridge carries its reference-error bound
 *    (`refErrBoundMm`) — an amplitude without the bound is meaningless.
 *
 * 2. MESH CREST — `crestLateralDeviation` is a z-plane slicer over the
 *    outer-wall submesh: per slice it intersects the wall triangles with
 *    z = const and takes the LOCAL radius-maximum apex within a θ-window
 *    centred on θ_true(z) (window = half the local crest spacing, carried by
 *    the ridge branches). Maxima (crests) and minima (valleys) are SEPARATE
 *    channels. Validated against synthetic meshes with KNOWN deviation
 *    (crestLateralDeviation.test.ts) before anything gates on it; u-seam wrap
 *    and crest-birth chaining are explicit test cases.
 *
 * 3. DOMAIN NOTE (the hard-won warp subtlety): the ridge is solved in the
 *    style's NATIVE (u,t) domain — the same domain the stashed conforming
 *    outer sampler consumes (ParametricExportComputer samples the GPU surface
 *    on a raw (u,t) lattice BEFORE the crease/helix warps re-parameterize the
 *    triangulation; the warps move vertices ON the surface, they do not change
 *    the surface). Mapping a style-domain ridge point through the PLAIN
 *    sampler therefore needs NO warp composition; `composedWallSampler`
 *    composition is required only for PRE-WARP-lattice quantities (cell
 *    shapes — see windowHook.diagnoseCellCeiling). Composing the helix here
 *    would DOUBLE-apply the shear to an already-helical locus.
 *
 * Pure CPU (vitest-trusted, run in-page by the fidelity window hook). The only
 * non-fidelity import is the production f64 `sfRf` mirror — the single source
 * of truth for the SuperformulaBlossom radius modulation (re-deriving it here
 * would be the divergence bug this instrument exists to prevent).
 */
import type { MeshView } from './types';
import type { PositionSampler } from './metrics';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';

const TAU = 2 * Math.PI;

/** Default z-slice spacing (mm). Spec: min(0.25mm, local cell t-extent); the
 *  local cell extent is not cheaply available in the fidelity layer, so the
 *  default is 0.25mm with an options override. */
const DEFAULT_SLICE_SPACING_MM = 0.25;

/** Mirrors FeatureLineGraph's SF_CREST_MIN_STRENGTH: below this blossom
 *  strength there is no relief — the loci are stationary points of a flat
 *  surface, so the closed-form ridge is honestly empty. */
const SF_MIN_STRENGTH = 1e-3;

/** Hard cap on the closed-form locus/branch index j. The SFB registry petal
 *  count (m) tops out in the tens; 4096 is far beyond any real configuration
 *  while bounding the locus loops against EXTERNALLY-SUPPLIED m (the window
 *  hook feeds live store opts): m = 1e8 or Infinity must terminate fast, not
 *  hang. Loci beyond the cap are truncated — the ridge is then a prefix,
 *  which is honest for an instrument (fewer branches, never wrong ones). */
const SF_MAX_LOCI = 4096;

/** Wrap an angle difference to (−π, π]. */
function wrapPi(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

function wrap01(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// ─────────────────────────────────────────────────────────────────────────────
// True-ridge representation (physical space: z in mm, θ in rad)
// ─────────────────────────────────────────────────────────────────────────────

/** One sample of an analytic ridge branch in physical space. */
export interface RidgeBranchPoint {
  /** Height (mm). Strictly increasing along a branch. */
  zMm: number;
  /** Ridge angle (rad), UNWRAPPED along the branch (no 2π jumps). */
  thetaRad: number;
  /** Apex-search half-window (rad) — half the local crest spacing. */
  windowRad: number;
}

/** One analytic ridge branch: a crest (radius maximum) or valley (minimum). */
export interface RidgeBranch {
  kind: 'crest' | 'valley';
  label?: string;
  /** Dense polyline ordered by strictly increasing zMm. */
  points: RidgeBranchPoint[];
}

/** The analytic ridge with its honest reference-error bound. */
export interface TrueRidge {
  branches: RidgeBranch[];
  /**
   * Upper bound (mm) on the lateral error of the REFERENCE itself (root
   * tolerance · local dθ/du · r + polyline-interpolation bound + any caller
   * term, e.g. a sampler-grid bound). ≈ 0 for a closed-form ridge. An
   * amplitude number without this bound is meaningless (blueprint item 1).
   */
  refErrBoundMm: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Param-domain ridge (style-native (u,t)) — output of the ridge solvers
// ─────────────────────────────────────────────────────────────────────────────

/** One solved ridge point in the style's native (u,t) parameter domain. */
export interface ParamRidgePoint {
  /** u in [0,1). */
  u: number;
  /** t in [0,1], ordered (strictly monotone) along the branch. */
  t: number;
  /** Apex-search half-window in u — half the local same-kind locus spacing. */
  windowU: number;
}

export interface ParamRidgeBranch {
  kind: 'crest' | 'valley';
  label?: string;
  points: ParamRidgePoint[];
}

export interface ParamRidge {
  branches: ParamRidgeBranch[];
  /** Root tolerance |du| of the solver (0 for a closed form). */
  duTol: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// (1a) SuperformulaBlossom TRUE RIDGE — closed form
// ─────────────────────────────────────────────────────────────────────────────

/** A closed-form stationary locus of the SFB radius modulation at one t. */
export interface SfCrestLocus {
  u: number;
  kind: 'crest' | 'valley';
}

/** m(t) per the packed SFB slots (sfRf slot layout, styleParams.ts order). */
function sfMOf(p: Float32Array, t: number): number {
  const tc = clamp01(t);
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

/**
 * CLOSED-FORM stationary loci of the SuperformulaBlossom radius modulation at
 * height fraction t — reference error 0 by construction.
 *
 * `sfRf` evaluates the Gielis value at θ_eff = 2π·u + π/m (the seam offset),
 * so x = m·θ_eff/4 = (π/4)(2·m·u + 1). The |cos x|/|sin x| powers are both
 * symmetric about every x = j·π/2, making rf EVEN about those points — every
 * x = j·π/2 is a stationary locus (an extremum, possibly a cusp when
 * n2/n3 < 1):  u*_j(t) = (2j − 1) / (2·m(t)),  j = 1, 2, … while u < 1.
 *
 * NOTE the spec's quoted formula u* = 4kπ/(m·2π) = 2k/m omits the production
 * seam offset π/m; the seam-aware loci above are the ones that actually
 * extremize the exported `sfRf` (cross-checked against a brute-force argmax in
 * crestLateralDeviation.test.ts). Each locus is CLASSIFIED (crest vs valley)
 * by evaluating sfRf beside it — at a=b=1 both power families are maxima; for
 * general a/b/n2/n3 a family can flip, so classification is measured, never
 * assumed. The interior extrema between these loci (the generic valleys) are
 * NOT closed-form; they belong to the bisection path.
 */
export function sfClosedFormCrestLoci(p: Float32Array, t: number): SfCrestLocus[] {
  const tc = clamp01(t);
  const m = sfMOf(p, tc);
  // Guard externally-supplied m: non-finite m has no computable loci (honestly
  // empty), and the loop below is bounded by SF_MAX_LOCI so a huge-but-finite
  // m (1e8-class) terminates fast instead of iterating ~m times.
  if (!Number.isFinite(m) || !(m > 0)) return [];
  const out: SfCrestLocus[] = [];
  const eps = 1 / (16 * m);
  for (let j = 1; j <= SF_MAX_LOCI; j++) {
    const u = (2 * j - 1) / (2 * m);
    if (u >= 1 - 1e-12) break;
    const v0 = sfRf(u, tc, p);
    const va = sfRf(u - eps, tc, p);
    const vb = sfRf(u + eps, tc, p);
    if (v0 >= va && v0 >= vb) out.push({ u, kind: 'crest' });
    else if (v0 <= va && v0 <= vb) out.push({ u, kind: 'valley' });
    // else: not a one-sided extremum (degenerate parameters) — omitted.
  }
  return out;
}

export interface SfClosedFormRidgeOptions {
  /** Polyline samples per branch (cosine-clustered in t). Default 769. */
  tSamples?: number;
}

/**
 * The full closed-form SFB ridge as param-domain branches. Branch j exists
 * where u*_j(t) < 1, i.e. m(t) > j − 0.5: as m morphs (e.g. 6→10) the higher-j
 * branches are BORN at the u-seam at the exact t where m(t) = j − 0.5 (solved
 * on the monotone closed-form m(t) — still reference-error-free). Branches are
 * sampled with COSINE clustering in t: m(t) = mix(mBase,mTop,t^c) has an
 * unbounded second derivative at t=0 for c<2, and end-clustered samples keep
 * the polyline linear-interpolation error (folded into refErrBoundMm by
 * `ridgeFromParamBranches`) in the sub-µm class.
 *
 * Returns an EMPTY ridge below the production strength gate (mirrors
 * SF_CREST_MIN_STRENGTH: a strength-0 pot has no relief, hence no ridge).
 */
export function sfClosedFormParamRidge(
  p: Float32Array,
  opts: SfClosedFormRidgeOptions = {},
): ParamRidge {
  const strength = p.length > 0 ? p[0] : 1;
  if (!(strength > SF_MIN_STRENGTH)) return { branches: [], duTol: 0 };
  const nT = Math.max(33, Math.floor(opts.tSamples ?? 769));
  const m0 = sfMOf(p, 0);
  const m1 = sfMOf(p, 1);
  const mLo = Math.min(m0, m1);
  const mHi = Math.max(m0, m1);
  // Guard externally-supplied m (window-hook live opts): non-finite m has no
  // computable branch domain (honestly empty); the branch loop is bounded by
  // SF_MAX_LOCI so a huge-but-finite m terminates fast instead of hanging.
  if (!Number.isFinite(mLo) || !Number.isFinite(mHi) || !(mHi > 0)) {
    return { branches: [], duTol: 0 };
  }

  const branches: ParamRidgeBranch[] = [];
  for (let j = 1; j <= SF_MAX_LOCI && (2 * j - 1) / (2 * mHi) < 1 - 1e-12; j++) {
    const need = j - 0.5;
    let t0 = 0;
    let t1 = 1;
    if (mLo <= need) {
      if (mHi <= need) continue; // never enters the domain
      // Exact branch endpoint: solve m(t) = j − 0.5 on the monotone m(t).
      let lo = 0;
      let hi = 1;
      for (let it = 0; it < 80; it++) {
        const mid = (lo + hi) / 2;
        const inside = sfMOf(p, mid) > need;
        // m increasing ⇒ inside for t > tBirth; decreasing ⇒ inside for t < tBirth.
        if (m1 >= m0 ? inside : !inside) hi = mid;
        else lo = mid;
      }
      const tBirth = (lo + hi) / 2;
      if (m1 >= m0) t0 = tBirth;
      else t1 = tBirth;
    }
    if (!(t1 > t0)) continue;

    const points: ParamRidgePoint[] = [];
    for (let i = 0; i < nT; i++) {
      // Cosine clustering: dense near both branch ends (the t^c kink at t=0
      // and the birth endpoint), ~π/(2n) spacing mid-branch.
      const s = (1 - Math.cos((Math.PI * i) / (nT - 1))) / 2;
      const t = t0 + (t1 - t0) * s;
      const m = sfMOf(p, t);
      let u = (2 * j - 1) / (2 * m);
      if (u >= 1) u = 1 - 1e-12; // the birth endpoint sits exactly ON the seam
      points.push({ u, t, windowU: 1 / (2 * m) });
    }
    // Classify the branch at its midpoint (one kind per branch; sfRf beside
    // the locus — at SFB defaults every closed-form locus is a crest).
    const tMid = (t0 + t1) / 2;
    const mMid = sfMOf(p, tMid);
    const uMid = (2 * j - 1) / (2 * mMid);
    const eps = 1 / (16 * mMid);
    const v0 = sfRf(uMid, tMid, p);
    const va = sfRf(uMid - eps, tMid, p);
    const vb = sfRf(uMid + eps, tMid, p);
    const kind: 'crest' | 'valley' = v0 >= va && v0 >= vb ? 'crest' : 'valley';
    branches.push({ kind, label: `sf-locus-${j}`, points });
  }
  return { branches, duTol: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// (1b) Generic TRUE RIDGE — bisection on an f64 radius field + continuation
// ─────────────────────────────────────────────────────────────────────────────

/** An f64 CPU radius mirror in the style's native (u,t) domain. */
export interface RadiusField {
  /** Radius (or any monotone-in-radius modulation) at (u, t). */
  value(u: number, t: number): number;
  /** u is periodic (default true — pottery walls wrap). */
  periodicU?: boolean;
}

export interface GenericRidgeSolveOptions {
  /** Seed-scan u resolution (default 768 — the production extractor's grid). */
  seedResU?: number;
  /** Seed-scan t rows (default 320). */
  seedResT?: number;
  /** Bisection root tolerance |du| (default 1e-6, <0.001mm physical). */
  duTol?: number;
  /** Min field swing on a row for it to be ridge-bearing (field units). */
  minProminence?: number;
}

interface RowLocus {
  u: number;
  kind: 'crest' | 'valley';
  windowU: number;
}

/**
 * Generic ridge solve: exact roots of g(u,t) = ∂r/∂u = 0 on the f64 field.
 *
 *  - SEED: per-row sign scan of g at `seedResU` nodes (the 768×320 zero-scan
 *    class the production SFB extractor uses), each sign change bracketing
 *    one extremum; the bracket is BISECTED to |du| ≤ duTol. g's sign is read
 *    as sign(r(u+δ) − r(u−δ)) with δ = 1e-8 — pure f64, no FD-step root bias.
 *  - CHAIN: predictor-corrector continuation along t — each open branch
 *    predicts its next u from its last two points and claims the nearest
 *    same-kind locus within a gate, so crossing branches never swap.
 *  - BIRTHS (fold points): when a crest+valley PAIR appears mid-row, the fold
 *    is solved as g = 0 ∧ ∂g/∂u = 0: bisection on t over "does the local
 *    u-window contain the sign-change pair", then a ∂g/∂u root solve in u at
 *    the converged t. The endpoint is prepended to BOTH branches of the pair,
 *    so branch endpoints are exact (not grid-quantized).
 *
 * The reported `duTol` is the ridge's u-space reference error; it is converted
 * to mm (and combined with the polyline interpolation bound) by
 * `ridgeFromParamBranches` into `refErrBoundMm`.
 */
export function solveParamRidgeByBisection(
  field: RadiusField,
  opts: GenericRidgeSolveOptions = {},
): ParamRidge {
  const resU = Math.max(16, Math.floor(opts.seedResU ?? 768));
  const resT = Math.max(8, Math.floor(opts.seedResT ?? 320));
  const duTol = Math.max(1e-9, opts.duTol ?? 1e-6);
  const minProm = opts.minProminence ?? 1e-6;
  const periodic = field.periodicU !== false;
  const DELTA = 1e-8;

  const evalU = (u: number, t: number): number =>
    field.value(periodic ? wrap01(u) : clamp01(u), t);
  const gSign = (u: number, t: number): number =>
    Math.sign(evalU(u + DELTA, t) - evalU(u - DELTA, t));

  /** Bisect one extremum inside (a, b) given sign(g(a)) = sa ≠ 0. */
  const bisect = (a0: number, b0: number, sa: number, t: number): number => {
    let a = a0;
    let b = b0;
    while (b - a > duTol) {
      const mid = (a + b) / 2;
      const sm = gSign(mid, t);
      if (sm === 0) return mid;
      if (sm === sa) a = mid;
      else b = mid;
    }
    return (a + b) / 2;
  };

  /** All extrema of the field on one row, bisected to duTol + windowed. */
  const rowLoci = (t: number): RowLocus[] => {
    const n = periodic ? resU : resU + 1;
    const signs = new Int8Array(n);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const u = i / resU;
      const v = field.value(u, t);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      let s = gSign(u, t);
      // A node exactly ON an extremum reads 0 — nudge so the adjacent
      // interval still brackets it.
      if (s === 0) s = gSign(u + 1e-6, t);
      signs[i] = s;
    }
    if (!(hi - lo >= minProm)) return [];
    const found: Array<{ u: number; kind: 'crest' | 'valley' }> = [];
    const intervals = periodic ? n : n - 1;
    for (let i = 0; i < intervals; i++) {
      const s0 = signs[i];
      const s1 = signs[(i + 1) % n];
      if (s0 === 0 || s1 === 0 || s0 === s1) continue;
      const a = i / resU;
      const b = (i + 1) / resU; // may exceed 1 conceptually on the wrap interval
      const u = wrap01(bisect(a, b, s0, t));
      found.push({ u, kind: s0 > 0 ? 'crest' : 'valley' });
    }
    found.sort((p, q) => p.u - q.u);
    // Window = half the local same-kind locus spacing (period-aware).
    return found.map((f) => {
      let sameGap = Infinity;
      let anyGap = Infinity;
      for (const o of found) {
        if (o === f) continue;
        let d = Math.abs(o.u - f.u);
        if (periodic && d > 0.5) d = 1 - d;
        if (d < anyGap) anyGap = d;
        if (o.kind === f.kind && d < sameGap) sameGap = d;
      }
      const windowU = Number.isFinite(sameGap)
        ? sameGap / 2
        : Number.isFinite(anyGap)
          ? anyGap // same-kind spacing ≈ 2× nearest opposite-kind gap
          : 0.25;
      return { ...f, windowU };
    });
  };

  /** ∂g/∂u sign via a wider symmetric stencil (the fold u-solve). */
  const D2 = 1e-5;
  const dgSign = (u: number, t: number): number => {
    const gp = evalU(u + D2 + 1e-6, t) - evalU(u + D2 - 1e-6, t);
    const gm = evalU(u - D2 + 1e-6, t) - evalU(u - D2 - 1e-6, t);
    return Math.sign(gp - gm);
  };

  /** True iff the crest+valley pair exists inside the window at row t. */
  const pairExists = (uMid: number, halfW: number, t: number): boolean => {
    const K = 64;
    let changes = 0;
    let prev = 0;
    for (let i = 0; i <= K; i++) {
      const s = gSign(uMid - halfW + (2 * halfW * i) / K, t);
      if (s !== 0 && prev !== 0 && s !== prev) changes++;
      if (s !== 0) prev = s;
    }
    return changes >= 2;
  };

  /** Solve the fold (g = 0 ∧ ∂g/∂u = 0) between tLo (absent) and tHi (present). */
  const refineFold = (
    uMid: number,
    halfW: number,
    tLo0: number,
    tHi0: number,
  ): { u: number; t: number } | null => {
    let tLo = tLo0;
    let tHi = tHi0;
    if (!pairExists(uMid, halfW, tHi)) return null;
    for (let it = 0; it < 30 && tHi - tLo > 1e-7; it++) {
      const mid = (tLo + tHi) / 2;
      if (pairExists(uMid, halfW, mid)) tHi = mid;
      else tLo = mid;
    }
    // ∂g/∂u = 0 in u at the converged t (scan for a sign change, then bisect).
    const K = 64;
    let prevU = uMid - halfW;
    let prevS = dgSign(prevU, tHi);
    for (let i = 1; i <= K; i++) {
      const u = uMid - halfW + (2 * halfW * i) / K;
      const s = dgSign(u, tHi);
      if (s !== 0 && prevS !== 0 && s !== prevS) {
        let a = prevU;
        let b = u;
        while (b - a > 1e-8) {
          const m = (a + b) / 2;
          const sm = dgSign(m, tHi);
          if (sm === 0) break;
          if (sm === prevS) a = m;
          else b = m;
        }
        return { u: wrap01((a + b) / 2), t: tHi };
      }
      if (s !== 0) {
        prevS = s;
        prevU = u;
      }
    }
    return { u: wrap01(uMid), t: tHi };
  };

  interface OpenBranch {
    kind: 'crest' | 'valley';
    points: ParamRidgePoint[];
    bornAtRow: number;
  }
  const open: OpenBranch[] = [];
  const closed: ParamRidgeBranch[] = [];
  const uDist = (a: number, b: number): number => {
    let d = Math.abs(a - b);
    if (periodic && d > 0.5) d = 1 - d;
    return d;
  };

  let prevT = 0;
  for (let row = 0; row <= resT; row++) {
    const t = row / resT;
    const loci = rowLoci(t);

    // Predictor-corrector matching: each open branch claims the nearest
    // same-kind locus to its predicted u, greedily by distance.
    const claims: Array<{ b: OpenBranch; li: number; d: number }> = [];
    for (const b of open) {
      const last = b.points[b.points.length - 1];
      const prev = b.points.length > 1 ? b.points[b.points.length - 2] : null;
      let pred = last.u;
      if (prev) {
        let step = last.u - prev.u;
        if (periodic) {
          if (step > 0.5) step -= 1;
          else if (step < -0.5) step += 1;
        }
        const dtPrev = Math.max(last.t - prev.t, 1e-12);
        pred = last.u + (step * (t - last.t)) / dtPrev;
      }
      for (let li = 0; li < loci.length; li++) {
        if (loci[li].kind !== b.kind) continue;
        const d = uDist(pred, loci[li].u);
        const gate = Math.max(2 / resU, 0.5 * loci[li].windowU);
        if (d <= gate) claims.push({ b, li, d });
      }
    }
    claims.sort((p, q) => p.d - q.d);
    const lociTaken = new Set<number>();
    const branchMatched = new Set<OpenBranch>();
    for (const c of claims) {
      if (lociTaken.has(c.li) || branchMatched.has(c.b)) continue;
      lociTaken.add(c.li);
      branchMatched.add(c.b);
      c.b.points.push({ u: loci[c.li].u, t, windowU: loci[c.li].windowU });
    }

    // Unmatched open branches die at this row.
    for (let i = open.length - 1; i >= 0; i--) {
      if (!branchMatched.has(open[i])) {
        const done = open.splice(i, 1)[0];
        if (done.points.length >= 2) closed.push({ kind: done.kind, points: done.points });
      }
    }

    // Unmatched loci open new branches; mid-domain crest+valley pairs are
    // fold births — refine their shared endpoint exactly.
    const newborn: Array<{ locus: RowLocus; branch: OpenBranch }> = [];
    for (let li = 0; li < loci.length; li++) {
      if (lociTaken.has(li)) continue;
      const nb: OpenBranch = {
        kind: loci[li].kind,
        points: [{ u: loci[li].u, t, windowU: loci[li].windowU }],
        bornAtRow: row,
      };
      open.push(nb);
      newborn.push({ locus: loci[li], branch: nb });
    }
    if (row > 0 && newborn.length >= 2) {
      newborn.sort((p, q) => p.locus.u - q.locus.u);
      for (let i = 0; i + 1 < newborn.length; i++) {
        const a = newborn[i];
        const b = newborn[i + 1];
        if (a.branch.points.length > 1 || b.branch.points.length > 1) continue;
        if (a.locus.kind === b.locus.kind) continue;
        const sep = uDist(a.locus.u, b.locus.u);
        if (sep > Math.max(4 / resU, a.locus.windowU)) continue;
        const uMid = a.locus.u + (b.locus.u - a.locus.u) / 2;
        const halfW = Math.max(2 / resU, sep);
        const fold = refineFold(uMid, halfW, prevT, t);
        if (fold && fold.t < t) {
          const ep = { u: fold.u, t: fold.t, windowU: a.locus.windowU };
          a.branch.points.unshift({ ...ep });
          b.branch.points.unshift({ ...ep });
        }
        i++; // the pair is consumed
      }
    }
    prevT = t;
  }
  for (const b of open) {
    if (b.points.length >= 2) closed.push({ kind: b.kind, points: b.points });
  }
  return { branches: closed, duTol };
}

// ─────────────────────────────────────────────────────────────────────────────
// Param domain → physical TrueRidge
// ─────────────────────────────────────────────────────────────────────────────

export interface RidgeMappingOptions {
  /**
   * Extra reference-error term (mm) added by the caller — e.g. the stashed
   * GPU sampler's bilinear chord-vs-arc bound when the surface map is a grid
   * sampler rather than analytic.
   */
  extraRefErrMm?: number;
}

/**
 * Map a param-domain ridge through the style-domain surface map (the PLAIN
 * conforming sampler — see the module header's warp note) into a physical
 * `TrueRidge`: z from the evaluated position, θ unwrapped along each branch,
 * windows converted u→rad via the surface's local dθ/du.
 *
 * `refErrBoundMm` = duTol·max(|dθ/du|·r)  (root tolerance in mm)
 *                 + max segment linear-interpolation bound (divided-difference
 *                   curvature estimate, non-uniform-spacing safe)
 *                 + extraRefErrMm.
 */
export function ridgeFromParamBranches(
  param: ParamRidge,
  surface: PositionSampler,
  opts: RidgeMappingOptions = {},
): TrueRidge {
  const branches: RidgeBranch[] = [];
  let duTermMm = 0;
  let interpTermMm = 0;

  for (const pb of param.branches) {
    const raw: Array<RidgeBranchPoint & { r: number }> = [];
    let prevTheta: number | null = null;
    for (const q of pb.points) {
      const u = wrap01(q.u);
      const t = clamp01(q.t);
      const P = surface.position(u, t);
      const r = Math.hypot(P[0], P[1]);
      let theta = Math.atan2(P[1], P[0]);
      if (prevTheta !== null) theta = prevTheta + wrapPi(theta - prevTheta);
      prevTheta = theta;
      // Local dθ/du for the window conversion + the duTol mm bound.
      const e = Math.max(1e-6, Math.min(1e-3, q.windowU > 0 ? q.windowU / 2 : 1e-3));
      const Pa = surface.position(wrap01(u + e), t);
      const Pb = surface.position(wrap01(u - e), t);
      const dthdu =
        Math.abs(wrapPi(Math.atan2(Pa[1], Pa[0]) - Math.atan2(Pb[1], Pb[0]))) / (2 * e);
      const windowRad = Math.min(
        Math.PI,
        q.windowU > 0 && dthdu > 0 ? q.windowU * dthdu : Math.PI / 2,
      );
      if (param.duTol * dthdu * r > duTermMm) duTermMm = param.duTol * dthdu * r;
      raw.push({ zMm: P[2], thetaRad: theta, windowRad, r });
    }
    // Enforce strictly increasing z (walls are z-monotone in t; reversed
    // parameterizations are flipped, exact duplicates dropped).
    if (raw.length >= 2 && raw[raw.length - 1].zMm < raw[0].zMm) raw.reverse();
    const pts: Array<RidgeBranchPoint & { r: number }> = [];
    for (const p of raw) {
      if (pts.length === 0 || p.zMm > pts[pts.length - 1].zMm + 1e-9) pts.push(p);
    }
    if (pts.length < 2) continue;
    // Linear-interpolation error bound per segment: (1/8)·|θ''|·Δz² · r, with
    // θ'' from divided differences (valid for non-uniform spacing).
    for (let i = 1; i + 1 < pts.length; i++) {
      const z0 = pts[i - 1].zMm;
      const z1 = pts[i].zMm;
      const z2 = pts[i + 1].zMm;
      const s0 = (pts[i].thetaRad - pts[i - 1].thetaRad) / (z1 - z0);
      const s1 = (pts[i + 1].thetaRad - pts[i].thetaRad) / (z2 - z1);
      const curv = Math.abs((2 * (s1 - s0)) / (z2 - z0));
      const dz = Math.max(z1 - z0, z2 - z1);
      const bound = (curv * dz * dz * pts[i].r) / 8;
      if (bound > interpTermMm) interpTermMm = bound;
    }
    branches.push({
      kind: pb.kind,
      label: pb.label,
      points: pts.map(({ zMm, thetaRad, windowRad }) => ({ zMm, thetaRad, windowRad })),
    });
  }

  return {
    branches,
    refErrBoundMm: duTermMm + interpTermMm + (opts.extraRefErrMm ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (2)+(3) MESH CREST + DEVIATION — the z-plane slicer
// ─────────────────────────────────────────────────────────────────────────────

/** Per-branch lateral-deviation summary (absolute mm, worst-case). */
export interface CrestBranchDeviation {
  kind: 'crest' | 'valley';
  label?: string;
  /** Branch z-domain (mm). */
  zMinMm: number;
  zMaxMm: number;
  /** Slices attempted inside the branch z-domain (coverage denominator). */
  sliceCount: number;
  /** Slices that yielded an apex sample (coverage numerator). */
  sampleCount: number;
  /** Worst |lateral deviation| (mm). */
  maxMm: number;
  /** RMS lateral deviation (mm) over the samples. */
  rmsMm: number;
}

/** Full instrument result. Absolute mm and counts only — no percent fields. */
export interface CrestLateralDeviationResult {
  sliceSpacingMm: number;
  /** Total z-slices over the mesh height. */
  sliceCount: number;
  branches: CrestBranchDeviation[];
  crestCount: number;
  valleyCount: number;
  totalCrestSamples: number;
  totalValleySamples: number;
  /** The worst crest (by maxMm) — the headline gate quantity. */
  worstCrestMaxMm: number;
  /** RMS of that same worst crest. */
  worstCrestRmsMm: number;
  worstCrestLabel: string;
  worstValleyMaxMm: number;
  worstValleyRmsMm: number;
  /** Forwarded reference-error bound (mm) of the analytic ridge. */
  refErrBoundMm: number;
  /**
   * Non-finite (NaN/Inf) mesh data REJECTED during slicing (absolute count,
   * house style): non-finite-z vertices + non-finite intersection points. The
   * harness deliberately measures validator-rejected meshes
   * (returnInvalidMesh), so pathological GPU output is in scope — a NaN point
   * would otherwise pass the θ-window filter, capture the apex, and silently
   * UNDERSTATE maxMm (false PASS). ANY nonzero value means coverage
   * understates the truth: do not gate on this result.
   */
  nonFiniteCount: number;
}

export interface CrestLateralDeviationOptions {
  /** Z-slice spacing (mm). Default 0.25 (override with the local cell t-extent
   *  when it is cheaply available — spec: min(0.25, local cell extent)). */
  sliceSpacingMm?: number;
}

interface SlicePoint {
  theta: number;
  r: number;
}

/** Interpolated branch state at one z. */
function branchAt(
  b: RidgeBranch,
  z: number,
): { theta: number; window: number; slope: number } {
  const pts = b.points;
  // Binary search for the segment containing z.
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].zMm <= z) lo = mid;
    else hi = mid;
  }
  const p0 = pts[lo];
  const p1 = pts[hi];
  const dz = Math.max(p1.zMm - p0.zMm, 1e-12);
  const w = (z - p0.zMm) / dz;
  return {
    theta: p0.thetaRad + (p1.thetaRad - p0.thetaRad) * w,
    window: p0.windowRad + (p1.windowRad - p0.windowRad) * w,
    slope: (p1.thetaRad - p0.thetaRad) / dz,
  };
}

/**
 * STAGE 2a — the faithful crest lateral-deviation instrument (z-plane slicer).
 *
 * Slices the (outer-wall) mesh with planes z = const (spacing default 0.25mm),
 * collects the triangle/plane intersection points per slice, and — per active
 * ridge branch — takes the LOCAL radius extremum apex within the branch's
 * θ-window centred on θ_true(z): maximum radius for a crest, minimum for a
 * valley (including chord-interior radial feet, where a segment's closest
 * approach to the axis falls between its endpoints). The apex's lateral
 * deviation is
 *
 *     d = r · wrapPi(θ_mesh − θ_true) / √(1 + (r · dθ_true/dz)²)
 *
 * (perpendicular to the crest tangent, mm). Branch domains gate the slices, so
 * a ridge born at z_birth contributes no phantom samples below it, and the
 * per-branch window keeps neighbouring crests from claiming each other's apex
 * (near-birth disambiguation is carried by the branch polylines themselves —
 * the continuation already chained them along t). Crests and valleys are
 * separate channels; the headline is the WORST crest's max/rms (mm).
 */
export function crestLateralDeviation(
  mesh: MeshView,
  ridge: TrueRidge,
  opts: CrestLateralDeviationOptions = {},
): CrestLateralDeviationResult {
  const spacing =
    opts.sliceSpacingMm && opts.sliceSpacingMm > 0
      ? opts.sliceSpacingMm
      : DEFAULT_SLICE_SPACING_MM;
  const { vertices, indices } = mesh;

  // Non-finite rejects (CRITICAL guard): counted LOUDLY, never silent.
  let nonFinite = 0;

  const empty = (sliceCount: number): CrestLateralDeviationResult => ({
    sliceSpacingMm: spacing,
    sliceCount,
    branches: [],
    crestCount: 0,
    valleyCount: 0,
    totalCrestSamples: 0,
    totalValleySamples: 0,
    worstCrestMaxMm: 0,
    worstCrestRmsMm: 0,
    worstCrestLabel: '',
    worstValleyMaxMm: 0,
    worstValleyRmsMm: 0,
    refErrBoundMm: ridge.refErrBoundMm,
    nonFiniteCount: nonFinite,
  });

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < vertices.length; i += 3) {
    const z = vertices[i];
    // A non-finite z silently drops every triangle touching the vertex from
    // the slice buckets — count it so the coverage loss is visible.
    if (!Number.isFinite(z)) {
      nonFinite++;
      continue;
    }
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (!(zMax > zMin) || ridge.branches.length === 0) return empty(0);

  const nSlices = Math.max(1, Math.floor((zMax - zMin) / spacing));
  // Slices at half-spacing offsets, so planes avoid exact vertex rows.
  const sliceZ = (k: number): number => zMin + (k + 0.5) * spacing;

  // Bucket triangles by the slice indices they span.
  const buckets: number[][] = Array.from({ length: nSlices }, () => []);
  for (let tIdx = 0; tIdx < indices.length; tIdx += 3) {
    const za = vertices[indices[tIdx] * 3 + 2];
    const zb = vertices[indices[tIdx + 1] * 3 + 2];
    const zc = vertices[indices[tIdx + 2] * 3 + 2];
    const lo = Math.min(za, zb, zc);
    const hi = Math.max(za, zb, zc);
    // Non-finite z range: NaN comparisons would skip every bucket silently.
    // The poisoned vertices were already counted in the scan above.
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    let k0 = Math.ceil((lo - zMin) / spacing - 0.5);
    let k1 = Math.floor((hi - zMin) / spacing - 0.5);
    if (k0 < 0) k0 = 0;
    if (k1 > nSlices - 1) k1 = nSlices - 1;
    for (let k = k0; k <= k1; k++) buckets[k].push(tIdx);
  }

  // Branch bookkeeping (only branches that span a z-range can be sliced).
  const active = ridge.branches.filter(
    (b) => b.points.length >= 2 && b.points[b.points.length - 1].zMm > b.points[0].zMm,
  );
  interface Acc {
    branch: RidgeBranch;
    z0: number;
    z1: number;
    slices: number;
    samples: number;
    maxAbs: number;
    sumSq: number;
  }
  const accs: Acc[] = active.map((b) => ({
    branch: b,
    z0: b.points[0].zMm,
    z1: b.points[b.points.length - 1].zMm,
    slices: 0,
    samples: 0,
    maxAbs: 0,
    sumSq: 0,
  }));

  const pts: SlicePoint[] = [];
  const feet: SlicePoint[] = [];

  for (let k = 0; k < nSlices; k++) {
    const z = sliceZ(k);
    let any = false;
    for (const a of accs) {
      if (z >= a.z0 && z <= a.z1) {
        any = true;
        break;
      }
    }
    if (!any) continue;

    // Collect this slice's intersection point pool once.
    pts.length = 0;
    feet.length = 0;
    for (const tIdx of buckets[k]) {
      let first: SlicePoint | null = null;
      for (let e = 0; e < 3; e++) {
        const i0 = indices[tIdx + e] * 3;
        const i1 = indices[tIdx + ((e + 1) % 3)] * 3;
        const z0 = vertices[i0 + 2];
        const z1 = vertices[i1 + 2];
        let px: number | null = null;
        let py: number | null = null;
        if ((z0 - z) * (z1 - z) < 0) {
          const s = (z - z0) / (z1 - z0);
          px = vertices[i0] + s * (vertices[i1] - vertices[i0]);
          py = vertices[i0 + 1] + s * (vertices[i1 + 1] - vertices[i0 + 1]);
        } else if (z0 === z) {
          px = vertices[i0];
          py = vertices[i0 + 1];
        }
        if (px === null || py === null) continue;
        // CRITICAL: reject non-finite intersection points LOUDLY. A NaN point
        // passes the θ-window filter (|NaN| > w is false) and can capture
        // `best` while no finite point displaces it (p.r > NaN is false) —
        // maxAbs would silently understate (false PASS) while samples++
        // claimed the slice as covered.
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          nonFinite++;
          continue;
        }
        const p: SlicePoint = { theta: Math.atan2(py, px), r: Math.hypot(px, py) };
        pts.push(p);
        // Track the chord pair for the valley interior-foot candidate.
        if (first === null) {
          first = p;
        } else {
          // Closest approach of the chord (in xy) to the axis: the radial
          // minimum of a straight segment can sit strictly inside it.
          const ax = first.r * Math.cos(first.theta);
          const ay = first.r * Math.sin(first.theta);
          const bx2 = p.r * Math.cos(p.theta);
          const by2 = p.r * Math.sin(p.theta);
          const dx = bx2 - ax;
          const dy = by2 - ay;
          const len2 = dx * dx + dy * dy;
          if (len2 > 0) {
            const s = -(ax * dx + ay * dy) / len2;
            if (s > 0 && s < 1) {
              const fx = ax + s * dx;
              const fy = ay + s * dy;
              feet.push({ theta: Math.atan2(fy, fx), r: Math.hypot(fx, fy) });
            }
          }
        }
      }
    }
    for (const f of feet) pts.push(f);

    for (const a of accs) {
      if (z < a.z0 || z > a.z1) continue;
      a.slices++;
      const st = branchAt(a.branch, z);
      const wantMax = a.branch.kind === 'crest';
      let best: SlicePoint | null = null;
      let bestD = 0;
      for (const p of pts) {
        const d = wrapPi(p.theta - st.theta);
        if (Math.abs(d) > st.window) continue;
        if (best === null || (wantMax ? p.r > best.r : p.r < best.r)) {
          best = p;
          bestD = d;
        }
      }
      if (best === null) continue;
      const denom = Math.sqrt(1 + best.r * st.slope * (best.r * st.slope));
      const dev = (best.r * bestD) / denom;
      a.samples++;
      const ad = Math.abs(dev);
      if (ad > a.maxAbs) a.maxAbs = ad;
      a.sumSq += dev * dev;
    }
  }

  const branches: CrestBranchDeviation[] = accs.map((a) => ({
    kind: a.branch.kind,
    label: a.branch.label,
    zMinMm: a.z0,
    zMaxMm: a.z1,
    sliceCount: a.slices,
    sampleCount: a.samples,
    maxMm: a.maxAbs,
    rmsMm: a.samples > 0 ? Math.sqrt(a.sumSq / a.samples) : 0,
  }));

  let worstCrest: CrestBranchDeviation | null = null;
  let worstValley: CrestBranchDeviation | null = null;
  let crestCount = 0;
  let valleyCount = 0;
  let crestSamples = 0;
  let valleySamples = 0;
  for (const b of branches) {
    if (b.kind === 'crest') {
      crestCount++;
      crestSamples += b.sampleCount;
      if (worstCrest === null || b.maxMm > worstCrest.maxMm) worstCrest = b;
    } else {
      valleyCount++;
      valleySamples += b.sampleCount;
      if (worstValley === null || b.maxMm > worstValley.maxMm) worstValley = b;
    }
  }

  return {
    sliceSpacingMm: spacing,
    sliceCount: nSlices,
    branches,
    crestCount,
    valleyCount,
    totalCrestSamples: crestSamples,
    totalValleySamples: valleySamples,
    worstCrestMaxMm: worstCrest?.maxMm ?? 0,
    worstCrestRmsMm: worstCrest?.rmsMm ?? 0,
    worstCrestLabel: worstCrest?.label ?? '',
    worstValleyMaxMm: worstValley?.maxMm ?? 0,
    worstValleyRmsMm: worstValley?.rmsMm ?? 0,
    refErrBoundMm: ridge.refErrBoundMm,
    nonFiniteCount: nonFinite,
  };
}
