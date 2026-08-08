// s119LadderLib.ts — the S119 ladder's per-facet classifier, extracted so it can be validated on
// PLANTED DEFECTS rather than only by agreeing with a previous run (the s118ScoreLib precedent).
//
// It adds exactly two quantities to `facetGeom`, and both decide a verdict, so both are fixture-tested:
//   * thinRatio = arc min altitude / longest arc edge — the SCALE-FREE shape test. Dimensionless, so a
//     facet that merely shrinks does not cross it, which is the whole point of the S119 measurement.
//   * dRmm      = max|r_i| - min|r_i| over the facet's corners — the RADIUS-SPREAD proxy for "this facet
//     spans a cliff and is therefore not a graph over (theta, z) at all".
import { facetGeom, type FacetGeom } from './s118ScoreLib';
import { dThRaw } from '../bridge/_sweepPredicate';

export interface FacetClass extends FacetGeom {
  /** arc min altitude / longest arc edge. EQUILATERAL 0.866, right-isoceles 0.5, degenerate -> 0. */
  thinRatio: number;
  /** max|r| - min|r| over the three corners, mm */
  dRmm: number;
  /** shortest arc-space edge, mm */
  minArcEdgeMm: number;
  /** shortest 3D edge, mm */
  minEdge3Mm: number;
  /** UNWRAPPED thetas actually used (exposed so the caller can reuse them for a kink probe) */
  tha: number; thb: number; thc: number;
}

/**
 * Classify one facet from its nine raw coordinates.
 *
 * Theta is UNWRAPPED here (thb = tha + dThRaw(tha, atan2(by,bx)), likewise thc). Passing raw atan2 values
 * makes every facet straddling the -pi seam read as a giant inverted sliver — the single most common way
 * this class of measurement has been got wrong in this campaign, so the unwrapping is done INSIDE.
 */
export function classifyFacet(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): FacetClass {
  const tha = Math.atan2(ay, ax);
  const thb = tha + dThRaw(tha, Math.atan2(by, bx));
  const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
  const G = facetGeom(ax, ay, az, bx, by, bz, cx, cy, cz, tha, thb, thc);
  const ra = Math.hypot(ax, ay); const rb = Math.hypot(bx, by); const rc = Math.hypot(cx, cy);
  const rm = (ra + rb + rc) / 3;
  const e1 = Math.hypot((thb - tha) * rm, bz - az);
  const e2 = Math.hypot((thc - thb) * rm, cz - bz);
  const e3 = Math.hypot((tha - thc) * rm, az - cz);
  const emax = Math.max(e1, e2, e3);
  const d3 = Math.min(
    Math.hypot(bx - ax, by - ay, bz - az),
    Math.hypot(cx - bx, cy - by, cz - bz),
    Math.hypot(ax - cx, ay - cy, az - cz),
  );
  return {
    ...G,
    thinRatio: emax > 0 ? (G.minAltUm / 1000) / emax : 0,
    dRmm: Math.max(ra, rb, rc) - Math.min(ra, rb, rc),
    minArcEdgeMm: Math.min(e1, e2, e3),
    minEdge3Mm: d3,
    tha, thb, thc,
  };
}
