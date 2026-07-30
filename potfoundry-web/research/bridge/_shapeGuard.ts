// research/bridge/_shapeGuard.ts — the SHAPE TERM the bisection driver never had.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS (2026-07-29 blade diagnosis, research/lab/2026-07-29-strata-perf-convergence-worklog.md)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// A VISUAL inspection of the D51 mesh found thin flat "blade" facets protruding from the surface, many
// back-facing. Census on that mesh: 48,130 of 1,433,982 facets (3.356 %) with aspect ratio > 50, and
// 31,842 (2.22 %) INVERTED in (theta,z) — the parametrisation folds and the surface overlaps itself.
// Every blade vertex is ON the analytic surface to <= 9 nm, so it is a SHAPE defect, not a placement one.
//
// THE ARITHMETIC. `bisectAt(a,b,t)` gives children that keep the parent's height over ab and take bases
// t|ab| and (1-t)|ab|, so   childAR / parentAR ~= 1 / min(t, 1-t).
// That is bounded ONLY under Rivara's two hypotheses — (i) split the LONGEST edge, (ii) at t = 1/2 — and
// the driver's two headline levers delete both on purpose (DIRECTED splits the max-SAG edge; SNAP splits
// at the located crossing, t in [0.12, 0.88]). MEASURED per-split amplification, geometric mean over
// 58,880 splits: longest+midpoint x0.99 (the Rivara case, neutral) | middle edge x2.31 | shortest edge
// x4.00 | SNAP x1.77, peaks x214. It compounds: the blade fraction climbs monotonically 0.58 % -> 4.27 %
// within one run and a blade's children are blades.
//
// NOTHING IN THE PIPELINE COULD SEE IT: no shape check existed anywhere; the driver's plane ruler REWARDS
// blades (p50 0.63 um on the 2,000 worst — below acceptTol, because near-collinear vertices on the surface
// make any plane through them hug it); a folded sheet is still a consistently-oriented 2-manifold so
// incidence / orientation / Euler all pass; and the cleanup pass cannot reach them (collapse fires below
// 0.2 um, needle min-edge p05 is 0.471 um; CAPs have all edges long by construction).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY *THIS* METRIC — `aspect3`, and not min-altitude or min-angle
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// `aspect3` is EXACTLY the quantity research/tools/_bladeCensus.mjs computes:
//        AR = longestEdge * perimeter / (4 * area)   ( == longestEdge / (2 * inradius) )
// and that identity is the whole point. The lab's standing lesson from the sag ruler
// (research memory: "validate the sag ruler before trusting any mesh verdict") is that THE REFINEMENT
// RULER MUST EQUAL THE AUDIT RULER; a guard scored on a quantity the census does not compute could refuse
// the wrong facets and still leave the census reading blades. With this identity the guard's claim is
// checkable in one line: after the fix the census's own AR > threshold count must be zero.
// Two further reasons it is the right family:
//   * it is SCALE-INVARIANT (a pure ratio), so one constant serves a mesh whose edges span 1.9 um .. 8 mm;
//   * it bounds BOTH measured blade families at once — CAP (62 %: all three edges long, min altitude
//     p50 4.8 um) and NEEDLE (37.6 %: two vertices nearly coincident, min edge p50 3.08 um). A min-EDGE
//     test sees only needles; a min-ALTITUDE test in mm is not scale-invariant. min-ANGLE is monotone with
//     AR in the degenerate regime and would work, but it costs three transcendentals per child and is not
//     what the instrument reports.
//
// EVERYTHING HERE IS PURE. No mesh, no globals, no I/O — so it is unit-testable (_shapeGuard.test.ts) and
// can be reused by an offline census without dragging the driver in.

/** shortest-arc theta delta from a to b (the theta = 0 == 2*pi seam). Same body as _bladeCensus.mjs. */
export function dThShort(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * 3-D aspect ratio of a triangle: longestEdge * perimeter / (4 * area).
 * Equilateral = 1.732, right-isoceles (the initial grid's cells) = 2.414, a b-by-h sliver ~= b/h.
 * Returns Infinity for an exactly degenerate facet (area 0) so a caller's `> cap` test refuses it.
 * VERBATIM the formula in research/tools/_bladeCensus.mjs — see the header for why that matters.
 */
export function aspect3(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  const L = Math.max(e0, e1, e2);
  return (L * (e0 + e1 + e2)) / (4 * area);
}

/**
 * TWICE the signed area of a triangle in the (theta, z) parameter plane, with shortest-arc theta deltas
 * anchored at the FIRST vertex — verbatim `sPar` from _bladeCensus.mjs.
 *
 * The driver lifts every vertex from (theta, z) by r = rA(theta, z), so the mesh IS a triangulation of the
 * (theta, z) cylinder and a sign change is a FOLD by construction, not an opinion. In exact arithmetic a
 * child of a split can never flip: the new vertex lies ON segment ab, so area(a, m, apex) = t * area(a, b,
 * apex). A flip therefore means the parent was already so close to degenerate that rounding decided the
 * sign — which is exactly the regime `aspect3` is there to keep the mesh out of. Testing it directly costs
 * ~10 flops per child and catches the 2.22 % inverted population at its birth.
 */
export function signedAreaParam(
  thA: number, zA: number, thB: number, zB: number, thC: number, zC: number,
): number {
  const dB = dThShort(thA, thB);
  const dC = dThShort(thA, thC);
  return dB * (zC - zA) - (zB - zA) * dC;
}

/** A point on a lifted edge, as produced by a caller's radius evaluator. */
export interface LiftedPoint { x: number; y: number; z: number; th: number }

/**
 * THE 3-D MIDPOINT SOLVER (fix 2 of the blade repair).
 *
 * The driver SELECTS an edge by its 3-D length (`eLen`) but PLACES the new vertex at the parametric
 * midpoint of (theta, z) and lifts it. On 1.5 mm relief those are different points: measured on the D51
 * run, the parametric midpoint lands at 3-D chord fraction ~0.41/0.59 (geometric mean of the amplification
 * 1/min(f,1-f) = 0.819 in log terms), i.e. a "midpoint" split is systematically OFF-CENTRE in the metric
 * the print actually has — and childAR/parentAR ~= 1/min(f, 1-f) is a function of exactly that fraction.
 *
 * `chordParam` returns the parameter s whose lifted point P(s) sits at chord fraction `frac` between the
 * endpoints, i.e. solves   (1 - frac) * |P(s) - A|  =  frac * |P(s) - B|.
 * g(s) = (1-frac)|P(s)-A| - frac|P(s)-B| runs from -frac*|AB| at s=0 to +(1-frac)*|AB| at s=1, so a root
 * always exists and plain bisection finds one in `iters` halvings (24 => ~6e-8 of the edge) with no
 * derivative, no line search and no failure mode. Each halving costs ONE radius evaluation.
 *
 * NOT USED FOR SNAP. A crossing placement must land ON the locus — that is its entire purpose — so the
 * conform route keeps the located t untouched. This solver serves the SIZE route and the nudge ladder,
 * where the target is "the middle" and nothing else.
 */
export function chordParam(
  lift: (s: number) => LiftedPoint,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  frac: number,
  iters: number,
): number {
  let lo = 0; let hi = 1;
  for (let i = 0; i < iters; i += 1) {
    const s = 0.5 * (lo + hi);
    const p = lift(s);
    const dA = Math.hypot(p.x - ax, p.y - ay, p.z - az);
    const dB = Math.hypot(p.x - bx, p.y - by, p.z - bz);
    if ((1 - frac) * dA <= frac * dB) lo = s; else hi = s;
  }
  return 0.5 * (lo + hi);
}

/**
 * The chord fraction the PARAMETRIC parameter `s` actually lands at, in 3-D. This is the quantity the
 * diagnosis measured (gmean amplification 0.819); it is exported so a probe can report the bias the
 * solver above removes, rather than asserting that it removed it.
 */
export function chordFractionOf(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): number {
  const dA = Math.hypot(px - ax, py - ay, pz - az);
  const dB = Math.hypot(px - bx, py - by, pz - bz);
  const tot = dA + dB;
  return tot > 0 ? dA / tot : 0.5;
}
