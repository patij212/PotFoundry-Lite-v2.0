// voronoiFeatureEdges.ts — Voronoi order-1 bisector feature-conforming edge graph (research PROTOTYPE).
//
// The DEDICATED analog of tierC/dsFeatureEdges.ts `buildDragonScalesConformingGraph` and
// research/bridge/geoStarFeatureEdges.ts `buildGeometricStarConformingGraph`, for the Voronoi cellular style.
//
// Voronoi's relief kinks along the order-1 bisector graph — the perpendicular bisectors of neighbouring jittered
// site pairs (a C1 crease, measured: _strataFieldJump, the perpendicular field difference → 0 linearly in ε). Unlike
// GeoStar/DS this locus is EXACT and closed-form (sites are dyadic points; the metric is Euclidean in cellular
// coords; cellular→UV is affine), so no marching-squares trace is needed: voronoiBisectorSegmentsUv already emits the
// exact edges, unit-verified against the target's centre formula.
//
// This module converts those exact segments into a FeatureGraph { pts (flat u,t), edges (point-index PAIRS) } — the
// SAME shape dsFeatureEdges emits — for injection into buildInhouseMetricMesh as injectedPoints + constraintEdges
// (+ pinInjected + recoverySubdivideCollinear). The KEY property a Voronoi graph must have and the reference
// tessellator's chords could NOT: a triple-JUNCTION where three bisectors meet is welded to ONE shared vertex, so the
// CDT gets a degree-3 vertex there and can fan the junction (E-2026-07-24-STRATA001-S2-CONVERGENCE established the
// reference tessellator's degree-2 interior-vertex rule forbids exactly this).
//
// DEV/LAB ONLY (research/). src/ must never import this.

import {
  voronoiBisectorSegmentsUv,
  type VoronoiLatticeParams,
} from '../../src/geometry/targetSolid/voronoiBisectorGuides';

/** A constraint graph in (u,t) space: flat `pts` (u0,t0,u1,t1,…) + `edges` (vertex-index PAIRS into `pts`). */
export interface FeatureGraph {
  pts: number[];
  edges: number[];
}

/** DEFAULT bubble/web lattice (registry defaults v_scale 8 / v_jitter 0.8 / v_z_stretch 1). Morph/relief do not
 *  move the site lattice, so the bisector geometry is the same for both modes. */
export const DEFAULT_VORONOI_LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};

export interface VoronoiGraphOpts {
  lattice?: VoronoiLatticeParams;
  /** Uniform arc-length resample spacing in (u,t) along each bisector (default 0.01). Shorter → easier constraint
   *  recovery (the crossing walk is shorter) at more points. 0 = keep raw segment endpoints only. */
  segLen?: number;
  /** Vertex weld radius in (u,t): endpoints within this distance collapse to one shared vertex. MUST be large enough
   *  to weld a triple-junction (the same Voronoi vertex reached by 3 independently-clipped edges) yet far below the
   *  inter-junction spacing (~1/scale ≈ 0.125). Default 3e-4. */
  weldEps?: number;
}

/**
 * Build the Voronoi order-1 bisector FeatureGraph for injection into the M=g/h² region kernel.
 *
 * Junctions weld to shared vertices (degree-3 preserved), so the CDT can fan them; interior resample points are
 * degree-2 chain vertices. Points stay in [0,1]²; the kernel's own 3D-position weld handles the u=0/u=1 seam images
 * exactly as it does for the seed grid's seam columns.
 */
export function buildVoronoiConformingGraph(opts: VoronoiGraphOpts = {}): FeatureGraph {
  const lattice = opts.lattice ?? DEFAULT_VORONOI_LATTICE;
  const segLen = opts.segLen ?? 0.01;
  const weldEps = opts.weldEps ?? 3e-4;
  const segments = voronoiBisectorSegmentsUv(lattice);

  const pts: number[] = [];
  // Weld by a quantized spatial hash: any point within weldEps of an existing vertex reuses its index. A coarse cell
  // grid of side weldEps keeps the neighbour scan O(1) and bounded (no unbounded accumulation — Set-cap discipline).
  const cellSize = Math.max(weldEps, 1e-9);
  const grid = new Map<string, number[]>();
  const keyOf = (u: number, t: number): string =>
    `${Math.floor(u / cellSize)},${Math.floor(t / cellSize)}`;
  const weld = (u: number, t: number): number => {
    // Scan the 3×3 neighbourhood of cells so a point near a cell boundary still finds its partner.
    const cu = Math.floor(u / cellSize);
    const ct = Math.floor(t / cellSize);
    for (let du = -1; du <= 1; du += 1) {
      for (let dt = -1; dt <= 1; dt += 1) {
        const bucket = grid.get(`${cu + du},${ct + dt}`);
        if (bucket === undefined) continue;
        for (const index of bucket) {
          const eu = pts[index * 2];
          const et = pts[index * 2 + 1];
          if (Math.abs(eu - u) <= weldEps && Math.abs(et - t) <= weldEps) return index;
        }
      }
    }
    const index = pts.length / 2;
    pts.push(u, t);
    const key = keyOf(u, t);
    const bucket = grid.get(key);
    if (bucket === undefined) grid.set(key, [index]);
    else bucket.push(index);
    return index;
  };

  const edges: number[] = [];
  for (const segment of segments) {
    const [u0, t0] = segment.a;
    const [u1, t1] = segment.b;
    const length = Math.hypot(u1 - u0, t1 - t0);
    if (length < 1e-9) continue;
    const steps = segLen > 0 ? Math.max(1, Math.round(length / segLen)) : 1;
    let previous = weld(u0, t0);
    for (let s = 1; s <= steps; s += 1) {
      const f = s / steps;
      const current = weld(u0 + f * (u1 - u0), t0 + f * (t1 - t0));
      if (current !== previous) {
        edges.push(previous, current);
        previous = current;
      }
    }
  }

  return { pts, edges };
}
