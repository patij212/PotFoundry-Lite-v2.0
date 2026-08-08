// _s120RetriKernel.ts — S120 TASK D. THE LEGAL MOVE THE DRIVER NEVER HAD.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MECHANISM THIS EXISTS TO REPAIR (S120 Task A measured it, Task C named it)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `bisectAt`'s own arithmetic is  childAR / parentAR ~= 1 / min(t, 1-t) >= 2, minimised at t = 1/2. So a
// facet whose `aspect3` already exceeds PF_CB_SHAPE_AR / 2 (= 25 at the shipped cap of 50) has NO legal
// split on ANY of its three edges at ANY placement: every child the guard would have to admit is over the
// same cap the parent was admitted under. The driver ADMITS up to 50 and can SPLIT only up to ~25, so it
// manufactures its own trap — and Task A's census confirms the escape hatch S119 inferred does not exist
// (|cand| is never 0 or 1 in 1,060,746 pops; FLOOR_MM refuses an edge in 30 of them).
//
// A trapped facet is then STRANDED at its birth fidelity while its neighbours keep refining, which is the
// positive-feedback cascade (pole count ~ N^1.992 control / N^1.810 param-metric — both >> 1).
//
// NO EMIT-SITE GUARD CAN FIX THIS. S118 tried and cleared the class only by making the headline MAX 2.18x
// WORSE: refusing the emit deletes the illegal move, it does not supply a legal one. What is missing is a
// MOVE — an operator that changes the CONNECTIVITY of the trapped patch so the trapped SHAPE stops
// existing, at zero net triangles and zero new vertices.
//
// THE OPERATOR. Take the trapped facet and its three edge-neighbours: four triangles, one hexagonal
// boundary, six ring vertices, no interior vertex. Delete them; re-fill the hexagon with the triangulation
// that MINIMISES THE MAXIMUM 3-D `aspect3` over all of its triangulations. 4 in, 4 out.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TWO METRICS, DELIBERATELY DIFFERENT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   * SHAPE is scored in 3-D by `_shapeGuard.aspect3` — VERBATIM the driver's own emit-guard metric and
//     VERBATIM the census's own metric. That identity is the point: a repair scored here is checkable by
//     the instrument that judges the mesh, exactly the discipline `_shapeGuard`'s header sets out.
//   * ORIENTATION is scored in the (theta, z) PARAMETER plane, by the same cross product
//     `_shapeGuard.signedAreaParam` computes. A triangulation can be fine in 3-D and still FOLD the
//     parametrisation, and a folded sheet passes incidence, Euler and orientation checks alike. Every ear
//     the DP will consider must carry the RING's own sign or it is refused outright (cost = Infinity).
//
// PURE. No mesh, no globals, no I/O, no `process.env` — so it is unit-testable against closed forms
// (_s120RetriKernel.test.ts) and the driver's wiring is the only thing left to argue about.
//
// COST. n = 6 always in the 1-ring case: the DP is O(n^3) = 216 inner steps at most, and it evaluates
// `aspect3` at most n^3/6 = 36 times. It runs ONLY on a facet the driver has already decided to strand,
// which Task C measured at 687 (Gothic) / 3,052 (CelticTriquetra) facets of a ~1.2 M mesh.

import { aspect3 } from './_shapeGuard';

export type RetriReason = 'ok' | 'ring-degenerate' | 'no-valid-triangulation' | 'over-cap';

export interface RetriOut {
  /** true iff a triangulation was found AND its max 3-D aspect3 is <= capAr. */
  ok: boolean;
  reason: RetriReason;
  /** flat triples of RING POSITIONS (0..n-1), CCW in ring order — 3*(n-2) entries. Empty when !ok. */
  tri: number[];
  /** the achievable min-max 3-D aspect3. REPORTED EVEN WHEN REFUSED, so a caller can price the refusal. */
  maxAr: number;
}

/**
 * max 3-D `aspect3` over a flat triple list, indexing into the ring's coordinate arrays.
 * THE RULER IS `_shapeGuard.aspect3`, unwrapped and unmodified — see the header on why that identity is
 * load-bearing rather than incidental.
 */
export function maxArOfTri(
  tri: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>,
): number {
  let m = 0;
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i]; const b = tri[i + 1]; const c = tri[i + 2];
    const v = aspect3(x[a], y[a], z[a], x[b], y[b], z[b], x[c], y[c], z[c]);
    if (v > m) m = v;
  }
  return m;
}

/**
 * Does EVERY triangle carry `sgn`, the ring's own parameter-plane orientation?
 * A zero (exactly collinear in parameter space) is a FAILURE, not a pass: `signedAreaParam === 0` is the
 * driver's own fold refusal in `tryLocusMoveH`, and admitting it here would let the operator emit a facet
 * the driver's other movers would refuse to touch.
 */
export function triSignsOk(tri: ArrayLike<number>, u: ArrayLike<number>, v: ArrayLike<number>, sgn: number): boolean {
  if (sgn === 0) return false;
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i]; const b = tri[i + 1]; const c = tri[i + 2];
    const s = (u[b] - u[a]) * (v[c] - v[a]) - (u[c] - u[a]) * (v[b] - v[a]);
    if (Math.sign(s) !== sgn) return false;
  }
  return true;
}

/**
 * THE COST-MATCHED PLACEBO'S PATCH: a fan from ring position `a0`.
 * It is a STRUCTURALLY IDENTICAL triangulation of the same hexagon — same triangle count, same ring-edge
 * use, same chord use (K9 asserts all three) — so the only thing that differs between the treatment and
 * the placebo is WHICH triangulation is chosen. That is what makes the placebo able to kill the operator:
 * an improvement a random valid fan also delivers is not the DP's improvement.
 */
export function retriFan(n: number, a0: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < n - 1; i += 1) out.push(a0 % n, (a0 + i) % n, (a0 + i + 1) % n);
  return out;
}

/**
 * MIN-MAX-ASPECT TRIANGULATION of a simple ring, by the classical O(n^3) interval DP.
 *
 * cost[i][j] = min over k in (i,j) of max( cost[i][k], cost[k][j], aspect3(ring i, k, j) ),
 * with an ear whose PARAMETER-PLANE sign disagrees with the ring's scored Infinity so it can never be
 * selected. The answer is cost[0][n-1] because (0, n-1) is a ring edge, not a chord.
 *
 * WHY min-MAX and not min-sum: the quantity that traps the driver is a MAXIMUM (one facet over ~25 is one
 * facet that can never be split again), so the objective has to be the same maximum. A min-sum
 * triangulation is free to keep one terrible facet in exchange for three good ones and would leave the
 * trap exactly where it was.
 *
 * `capAr` IS A REFUSAL, NOT A CLAMP. The DP is run to completion and `maxAr` is reported either way; the
 * caller decides. That lets the driver set capAr = min(SHAPE_AR, incumbentMax * (1 - gain)) and get both
 * the "would not have helped" and the "would have broken the cap" cases named by one call.
 *
 * @param n number of ring vertices (6 for a triangle's 1-ring, 4 for an edge's)
 * @param x,y,z ring vertex coordinates in 3-D  — SHAPE
 * @param u,v   ring vertex coordinates in the (theta, z) parameter plane, THETA ALREADY UNWRAPPED
 *              against a single anchor — ORIENTATION
 * @param capAr refuse (ok = false, reason 'over-cap') if the achievable min-max exceeds this
 */
export function retriMinMaxAr(
  n: number,
  x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>,
  u: ArrayLike<number>, v: ArrayLike<number>,
  capAr: number,
): RetriOut {
  if (n < 3) return { ok: false, reason: 'ring-degenerate', tri: [], maxAr: Infinity };
  // the ring's own orientation, from its signed area in the parameter plane.
  let a2 = 0;
  for (let i = 0; i < n; i += 1) { const j = (i + 1) % n; a2 += u[i] * v[j] - u[j] * v[i]; }
  const sgn = Math.sign(a2);
  if (sgn === 0) return { ok: false, reason: 'ring-degenerate', tri: [], maxAr: Infinity };

  const ear = (i: number, k: number, j: number): number => {
    const s = (u[k] - u[i]) * (v[j] - v[i]) - (u[j] - u[i]) * (v[k] - v[i]);
    if (Math.sign(s) !== sgn) return Infinity;                       // folds the parametrisation — never
    return aspect3(x[i], y[i], z[i], x[k], y[k], z[k], x[j], y[j], z[j]);
  };

  const cost: Float64Array = new Float64Array(n * n);
  const cut = new Int32Array(n * n).fill(-1);
  for (let len = 2; len < n; len += 1) {
    for (let i = 0; i + len < n; i += 1) {
      const j = i + len;
      let best = Infinity; let bk = -1;
      for (let k = i + 1; k < j; k += 1) {
        const e = ear(i, k, j);
        // `Math.max` with an Infinity propagates, which is exactly the refusal we want; `<` then never
        // selects it unless every k is Infinity, and that case is caught by the finiteness test below.
        const w = Math.max(cost[i * n + k], cost[k * n + j], e);
        if (w < best) { best = w; bk = k; }
      }
      cost[i * n + j] = best; cut[i * n + j] = bk;
    }
  }
  const maxAr = cost[0 * n + (n - 1)];
  if (!Number.isFinite(maxAr)) return { ok: false, reason: 'no-valid-triangulation', tri: [], maxAr };

  const tri: number[] = [];
  const emit = (i: number, j: number): void => {
    if (j - i < 2) return;
    const k = cut[i * n + j];
    tri.push(i, k, j);
    emit(i, k); emit(k, j);
  };
  emit(0, n - 1);
  if (maxAr > capAr) return { ok: false, reason: 'over-cap', tri: [], maxAr };
  return { ok: true, reason: 'ok', tri, maxAr };
}
