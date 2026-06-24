/**
 * rails.ts — foot+crest rail extraction for the bandRemesh module (Phase 0 spike).
 *
 * Extracts two polyline sets that bound the visible Voronoi web relief band:
 *   - foot  (f2−f1 = th·footFrac,  default frac=1.0)  — outer wall edge where relief
 *     returns to the base radius; corresponds to the production crease locus.
 *   - crest (f2−f1 = th·crestFrac, default frac=0.15) — inner offset toward the web
 *     centerline, bounding the raised ridge core.
 *
 * Mirrors the pattern from `extractVoronoi` in FeatureLineGraph.ts:
 *   marchingSquaresZero((u,t) => voronoiSdf(u,t,p) - th*frac, resU, resT, true)
 *   + segmentsToPolylines('rail', minPoints=3, dpTol)
 *
 * Phase 0: pure CPU, no DOM/GPU dependencies. Production wiring (flag-gated) in Phase 1.
 */

import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  marchingSquaresZero,
  segmentsToPolylines,
} from '../../renderers/webgpu/parametric/conforming/SampledFeatureExtractor';
import { voronoiSdf } from './voronoiField';

/** Options for {@link extractRails}. */
export interface RailOpts {
  /** Level-set fraction for the foot rail (default 1.0 = outer wall edge). */
  footFrac: number;
  /** Level-set fraction for the crest rail (default 0.15 = ridge interior). */
  crestFrac: number;
  /** Marching-squares resolution in u (periodic). */
  resU: number;
  /** Marching-squares resolution in t. */
  resT: number;
  /** Douglas-Peucker simplification tolerance (in (u,t) units). 3e-4 = production default. */
  dpTol: number;
}

/** Result of {@link extractRails}. */
export interface Rails {
  /** Foot-level polylines — the outer edge of the Voronoi web band. */
  foot: FeatureLine[];
  /** Crest-level polylines — the inner offset toward the web-ridge centerline. */
  crest: FeatureLine[];
}

/**
 * Extracts foot and crest rails for the Voronoi web style from the signed
 * `f2−f1 − th·frac` field via marching squares.
 *
 * @param p   Packed parameter array (slot 0=scale, 1=jitter, 2=thickness, 5=stretch, 6=pulse).
 * @param opts Resolution, fractions, and DP tolerance.
 */
export function extractRails(p: Float32Array, opts: RailOpts): Rails {
  const { footFrac, crestFrac, resU, resT, dpTol } = opts;
  const th = p[2] > 0 ? p[2] : 0.1;

  const extractLevel = (frac: number, label: string): FeatureLine[] => {
    const level = th * frac;
    const segs = marchingSquaresZero(
      (u: number, t: number) => voronoiSdf(u, t, p) - level,
      resU,
      resT,
      true, // periodic in u
    );
    return segmentsToPolylines(segs, label, 3, dpTol);
  };

  return {
    foot: extractLevel(footFrac, 'rail-foot'),
    crest: extractLevel(crestFrac, 'rail-crest'),
  };
}
