/**
 * _s121SeedFix.ts — S121 FIX 2: the GEOMETRIC verdict of the seed-repair 2-2 flip.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A FLIP AND NOT A SPLIT
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * S120 measured 3 of GothicArches' 254,926 aligned-seed facets BORN over the AR>50 cap, worst 85.13, and the
 * driver already prints that they are FROZEN: S1 refuses any split whose children exceed the cap, and a
 * blade's children are blades. That last clause is not rhetoric, it is arithmetic. Cut a triangle of base L
 * and altitude h into k pieces along its long edge and each child has base L/k, the same altitude h and, in
 * the worst case, an apex still L/2 away laterally, so
 *
 *     child aspect3  ≈  (L/2)*(2L) / (4 * (L/k)*h/2)  =  k*L/(4h)  ≈  k/4 * parent aspect3.
 *
 * SPLITTING A BLADE MULTIPLIES ITS ASPECT. The only local move that can LOWER the pair's worst aspect
 * without adding a vertex is to re-cut the quad's OTHER diagonal — a 2-2 flip. That is what this decides.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS HERE AND WHAT IS NOT
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Here: the three GEOMETRIC gates, which are the ones that decide whether a blade gets repaired —
 *   LOCUS   both endpoints of the edge sit on a traced feature locus. The aligned seed's entire purpose is
 *           that its edges lie ALONG the loci; re-cutting one would undo the lever the arm exists to
 *           measure, so it is refused even when the flip would improve the shape.
 *   FOLD    the quad is not convex in (θ,z), or a new triangle would invert. `signedAreaParam`'s sign
 *           convention, applied to both new triangles against the pair's own reference sign.
 *   GAIN    the flip must STRICTLY lower max(aspect3) over the pair. Without this a flip can be taken that
 *           leaves the blade exactly where it was, or moves it, and the pass would loop.
 * Not here: the topological validity (incidence 2, the two facets traversing the edge oppositely, the
 * opposite diagonal not already existing) — that needs the driver's own edge index and stays in the driver,
 * where it is a transcription of the tests `tryFlip` already makes in the same order.
 */

/** _shapeGuard.aspect3, operand for operand. */
const ar3 = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number => {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  return (Math.max(e0, e1, e2) * (e0 + e1 + e2)) / (4 * area);
};

/** one corner of the quad: 3-D position, its (θ,z) coordinates RELATIVE TO pv, and its locus flag. */
export interface FlipCorner {
  x: number; y: number; z: number;
  /** shortest-arc θ delta from pv to this vertex (0 for pv itself). */
  dth: number;
  /** z delta from pv (0 for pv itself). */
  dz: number;
  feat: boolean;
}

export type FlipRefusal = 'locus' | 'fold' | 'gain' | null;

export interface FlipVerdict {
  ok: boolean;
  why: FlipRefusal;
  before: number;
  after: number;
}

/**
 * Decide the 2-2 flip of edge (pv,qv) whose two apexes are r0 (on the pv→qv facet) and s0.
 *
 * The emitted pair is (r0, pv, s0) + (s0, qv, r0) — the winding the driver's own `tryFlip` commits to — so
 * the two `aspect3` calls below are that call site's expressions in the same operand order, and the gate
 * measures the same object the same way the guard does.
 */
export function seedFlipVerdict(pv: FlipCorner, qv: FlipCorner, r0: FlipCorner, s0: FlipCorner): FlipVerdict {
  const before = Math.max(
    ar3(pv.x, pv.y, pv.z, qv.x, qv.y, qv.z, r0.x, r0.y, r0.z),
    ar3(pv.x, pv.y, pv.z, qv.x, qv.y, qv.z, s0.x, s0.y, s0.z),
  );
  const after = Math.max(
    ar3(r0.x, r0.y, r0.z, pv.x, pv.y, pv.z, s0.x, s0.y, s0.z),
    ar3(s0.x, s0.y, s0.z, qv.x, qv.y, qv.z, r0.x, r0.y, r0.z),
  );
  if (pv.feat && qv.feat) return { ok: false, why: 'locus', before, after };
  const P = (w: FlipCorner): [number, number] => [w.dth, w.dz];
  const cr = (A: [number, number], B: [number, number], C: [number, number]): number =>
    (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  const Pp = P(pv); const Pq = P(qv); const Pr = P(r0); const Ps = P(s0);
  const s1 = cr(Pr, Pp, Ps); const s2 = cr(Ps, Pq, Pr); const ref = cr(Pp, Pq, Pr);
  if (ref === 0 || s1 === 0 || s2 === 0) return { ok: false, why: 'fold', before, after };
  if (Math.sign(s1) !== Math.sign(ref) || Math.sign(s2) !== Math.sign(ref)) return { ok: false, why: 'fold', before, after };
  if (!(after < before)) return { ok: false, why: 'gain', before, after };
  return { ok: true, why: null, before, after };
}
