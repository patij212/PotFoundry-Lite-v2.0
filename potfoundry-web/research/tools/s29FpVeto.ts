// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// s29FpVeto.ts — THE FOOT-POINT ACCEPT-SIDE VETO. RESEARCH ONLY.
// Nothing under src/, no untouchable, no judge, no mesher kernel.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// ── WHAT THIS CHANGES, AND WHAT IT DOES NOT ─────────────────────────────────────────────────────────────
// S29's rule is kept VERBATIM:
//     accept(t)  <=>  blindAccept(t)  AND  ( listed(t) ? perp(t) <= bar : true )
// The plane ruler still RANKS. The heap key, `acceptTol`, the escalation, the conformance-first ordering and
// the h-0 jump routing are untouched, and a rejected facet is re-pushed at the BLIND key — so the heap
// ordering is the same object it was with the lever off. The membership gate is unchanged: this runs at the
// ~14k LISTED facets, never at all 1.26M.
//
// THE ONLY THING THAT CHANGES IS THE POINT RULER UNDERNEATH. S29 died on COST — ~2,844 rA evaluations per
// honest accept test, and iteration 1 spent its entire 5,400 s budget without producing a mesh. Its point
// ruler is `s29PerpAt`: a registered-density sweep (>= 81 evals), damped Newton from three seeds (~600) and
// a 40-iteration coordinate descent (~360) — ~1,241 rA evaluations for ONE point. This file replaces that
// with `FootPointMetric.footPointDistance`: Gauss-Newton on ||S(u,v) - P||^2, ~5 rA evaluations an
// iteration, ~41 for a whole foot-point.
//
// ── THREE DESIGN CONSTRAINTS THAT ARE NOT NEGOTIABLE ────────────────────────────────────────────────────
//
// 1. GAUSS-NEWTON ONLY. `footPointDistance` switches to FULL Newton when second derivatives are supplied,
//    and its Hessian then carries the curvature terms r . S_uu etc. with NO damping and NO descent check.
//    An indefinite Hessian there steps UPHILL, and the case where it goes indefinite is exactly the
//    high-curvature case this arm exists to measure (Gothic crest bends). No d2S callbacks are passed from
//    here, and none should be until someone adds a Levenberg term to that file.
//
// 2. THE SEED IS THE FACET'S PARAMETER-SPACE CENTROID. `FootPointMetric`'s own docstring: "a far-off guess
//    on a multi-valued surface will find the WRONG foot-point". Gothic is that surface. The centroid is in
//    the facet's own patch by construction. `uBounds`/`vBounds` — the facet's (theta,z) footprint, padded —
//    then stop an undamped step from leaving the patch it was seeded in.
//
// 3. EVERY READING IS AN UPPER BOUND, AND THE MIN OVER CANDIDATES IS ALWAYS CORRECT. `_facetTruthLib`'s own
//    rule. `footPointDistance` returns the distance at its FINAL iterate, not at the best one visited, so a
//    stalled or bound-pinned solve can return something WORSE than the seed. That is safe — it can only
//    over-state — but it is not free, so the reading is taken as min(radial, foot-point): both are genuine
//    surface points, so the min is still an upper bound, and a bad solve can no longer manufacture a reject.
//    UNDER-statement is the failure that would matter (it accepts what the certificate rejects) and it is
//    structurally impossible here.
//
// ── THE MAX-DRIVEN SKIP IS EXACT, NOT A HEURISTIC ───────────────────────────────────────────────────────
// radial >= perpendicular POINTWISE. So a lattice point whose cheap RADIAL reading is already at or below
// the running max cannot raise that max however hard it is tightened. Tightening in descending radial order
// and stopping at that point returns the SAME `witnessed` as tightening everything — `tightenAll` exists so
// that equality is a test and not a claim.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import { footPointDistance, type SurfaceVec3Fn } from '../bridge/FootPointMetric';
import { covRadius, distRadial, S29_DTHETA_MAX, S29_DZ_MAX, type RadiusFn } from './s29Perp';

const TWO_PI = 2 * Math.PI;

/** Gauss-Newton iteration cap. 8 is `FootPointMetric`'s own default; it prices the ruler at ~41 rA evals. */
export const FP_MAX_ITER = 8;

export interface FpPointOpts {
  /** pot height — the z domain is [0,H] and every rA read is clamped into it */
  H: number;
  maxIter?: number;
  /** convergence tolerance on ||delta(u,v)|| per step */
  tol?: number;
  uBounds?: readonly [number, number];
  vBounds?: readonly [number, number];
}

export interface FpPointReading {
  /** ||S(u*,v*) - P|| at the converged foot-point. An UPPER bound on d(P). */
  d: number;
  /** rA evaluations actually spent. COUNTED, not estimated. */
  cost: number;
}

/**
 * True 3D foot-point distance from P to the radial surface S(u,v) = (rA(u,v) cos u, rA(u,v) sin u, v),
 * by Gauss-Newton from (u0,v0).
 *
 * The three surface callbacks share ONE frame cache, so an iteration costs 5 rA evaluations (r, and the two
 * central differences) rather than the 6-9 three independent closures would spend, and the final evaluation
 * at the converged point costs 1 — the derivatives are computed lazily and are never asked for there.
 */
export function fpVetoAt(
  rA: RadiusFn,
  px: number, py: number, pz: number,
  u0: number, v0: number,
  opts: FpPointOpts,
): FpPointReading {
  const { H } = opts;
  let cost = 0;
  const R = (th: number, z: number): number => {
    cost += 1;
    return rA(th, z < 0 ? 0 : z > H ? H : z);
  };

  // ── ONE frame per distinct (u,v). `r` is always needed; the derivatives only when a tangent is asked for.
  let cu = NaN; let cv = NaN;
  let r = 0; let ru = 0; let rv = 0; let haveD = false;
  const at = (u: number, v: number): void => {
    if (u === cu && v === cv) return;
    cu = u; cv = v; haveD = false;
    r = R(u, v);
  };
  const derivs = (): void => {
    if (haveD) return;
    haveD = true;
    const hTh = 1e-5 / Math.max(1e-6, r);   // ~10 nm of arc — well inside f64, well outside FD noise
    const hZ = 1e-5;
    ru = (R(cu + hTh, cv) - R(cu - hTh, cv)) / (2 * hTh);
    const zc = cv < 0 ? 0 : cv > H ? H : cv;
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    rv = zp > zm ? (R(cu, zp) - R(cu, zm)) / (zp - zm) : 0;
  };

  const S: SurfaceVec3Fn = (u, v, out, o) => {
    at(u, v);
    out[o] = r * Math.cos(u); out[o + 1] = r * Math.sin(u);
    out[o + 2] = v < 0 ? 0 : v > H ? H : v;
  };
  const dS_du: SurfaceVec3Fn = (u, v, out, o) => {
    at(u, v); derivs();
    const c = Math.cos(u); const s = Math.sin(u);
    out[o] = ru * c - r * s; out[o + 1] = ru * s + r * c; out[o + 2] = 0;
  };
  const dS_dv: SurfaceVec3Fn = (u, v, out, o) => {
    at(u, v); derivs();
    const c = Math.cos(u); const s = Math.sin(u);
    out[o] = rv * c; out[o + 1] = rv * s; out[o + 2] = 1;
  };

  // NO d2S CALLBACKS. See constraint 1 in the header — full Newton here is an undamped indefinite-Hessian
  // step on exactly the high-curvature facets this arm measures.
  const d = footPointDistance(px, py, pz, u0, v0, S, dS_du, dS_dv, {
    maxIter: opts.maxIter ?? FP_MAX_ITER,
    tol: opts.tol,
    uBounds: opts.uBounds,
    vBounds: opts.vBounds,
  });
  return { d, cost };
}

export interface FpVetoOpts {
  H: number;
  /** THE ACCEPT BAR, in mm. Doubles as the tightening threshold, and that is EXACT: radial >= perpendicular
   *  pointwise, so a lattice point already at or below the bar radially can never lift the perpendicular
   *  max above it. */
  tol: number;
  nMax?: number;
  sampleCap?: number;
  /** padding of the foot-point search window beyond the facet's own (theta,z) footprint, in rad / mm */
  padTheta?: number;
  padZ?: number;
  maxIter?: number;
  /** TEST LEVER ONLY — tighten every over-bar lattice point instead of only those that can move the max.
   *  Same `witnessed`, more cost. It exists so the skip's exactness is measured rather than asserted. */
  tightenAll?: boolean;
}

export interface FpVetoReading {
  /** THE ACCEPT QUANTITY. Largest deviation over the lattice, each point at the tightest tier it needed. */
  witnessed: number;
  n: number;
  samples: number;
  /** rA evaluations spent. COUNTED — the driver's own `rEvals` sees the same calls. */
  cost: number;
  /** how many lattice points were actually tightened by Gauss-Newton */
  fpPoints: number;
}

/**
 * The accept reading for one flat triangle, keeping `s29PerpTriangle`'s STRUCTURE and swapping its point
 * ruler:
 *   pass 1  cheap radial over the whole lattice; if nothing is above the bar the facet closes for L evals.
 *   pass 2  tighten, in DESCENDING radial order, only the points that can still move the max.
 */
export function fpVetoTriangle(
  rA: RadiusFn,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  opts: FpVetoOpts,
): FpVetoReading {
  const { H, tol } = opts;
  const nMax = opts.nMax ?? 8;
  const sampleCap = opts.sampleCap ?? 64;
  const padTheta = opts.padTheta ?? 4 * S29_DTHETA_MAX;
  const padZ = opts.padZ ?? 4 * S29_DZ_MAX;
  const maxIter = opts.maxIter ?? FP_MAX_ITER;
  let cost = 0;
  let fpPoints = 0;

  // unwrap across the branch cut so a facet straddling theta=PI does not get a 2*PI-wide window
  const ths = [Math.atan2(ay, ax), Math.atan2(by, bx), Math.atan2(cy, cx)];
  for (let i = 1; i < 3; i += 1) {
    while (ths[i] - ths[0] > Math.PI) ths[i] -= TWO_PI;
    while (ths[i] - ths[0] < -Math.PI) ths[i] += TWO_PI;
  }
  const uBounds: readonly [number, number] = [Math.min(...ths) - padTheta, Math.max(...ths) + padTheta];
  const vBounds: readonly [number, number] = [
    Math.max(0, Math.min(az, bz, cz) - padZ), Math.min(H, Math.max(az, bz, cz) + padZ),
  ];
  // THE SEED. The facet's own parameter-space centroid — in its own patch by construction.
  const u0 = (ths[0] + ths[1] + ths[2]) / 3;
  const v0 = Math.min(vBounds[1], Math.max(vBounds[0], (az + bz + cz) / 3));

  const rad = (qx: number, qy: number, qz: number): number => { cost += 1; return distRadial(rA, H, qx, qy, qz); };
  const tighten = (qx: number, qy: number, qz: number, radial: number): number => {
    fpPoints += 1;
    const fp = fpVetoAt(rA, qx, qy, qz, u0, v0, { H, maxIter, uBounds, vBounds });
    cost += fp.cost;
    // MIN OVER CANDIDATES — see constraint 3. A stalled solve returns its final iterate, which can be worse
    // than the radial foot; taking the min keeps the reading an upper bound without keeping the damage.
    return fp.d < radial ? fp.d : radial;
  };

  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (!(cov > 0)) {
    const r0 = rad(ax, ay, az);
    const d = r0 > tol ? tighten(ax, ay, az, r0) : r0;
    return { witnessed: d, n: 0, samples: 1, cost, fpPoints };
  }

  let n = Math.min(nMax, Math.max(2, Math.ceil(cov / tol)));
  if (Number.isFinite(sampleCap)) {
    const nCap = Math.max(2, Math.floor((Math.sqrt(8 * sampleCap + 1) - 3) / 2));
    n = Math.min(n, nCap);
  }
  const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
  const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
  const L = ((n + 1) * (n + 2)) / 2;

  // ── PASS 1 — cheap radial, whole lattice. Points at or below the bar KEEP this reading: they cannot lift
  //    the perpendicular max above the bar, so the accept decision is exact without tightening them.
  const lx = new Float64Array(L); const ly = new Float64Array(L); const lz = new Float64Array(L);
  const lr = new Float64Array(L);
  let m = 0;
  let best = 0;
  const over: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
    for (let j = 0; j <= n - i; j += 1) {
      const qx = rx + ubx * j; const qy = ry + uby * j; const qz = rz + ubz * j;
      const d = rad(qx, qy, qz);
      lx[m] = qx; ly[m] = qy; lz[m] = qz; lr[m] = d;
      if (d > tol) over.push(m);
      else if (d > best) best = d;
      m += 1;
    }
  }
  if (over.length === 0) return { witnessed: best, n, samples: L, cost, fpPoints };

  // ── PASS 2 — descending radial order, stopping as soon as no remaining point can raise the max.
  over.sort((p, q) => lr[q] - lr[p]);
  for (const idx of over) {
    if (!opts.tightenAll && lr[idx] <= best) break;
    const d = tighten(lx[idx], ly[idx], lz[idx], lr[idx]);
    if (d > best) best = d;
  }
  return { witnessed: best, n, samples: L, cost, fpPoints };
}
