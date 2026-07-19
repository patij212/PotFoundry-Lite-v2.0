// geoStarFeatureEdges.ts — GeometricStar chevron-strap feature-conforming edge graph (research PROTOTYPE).
//
// The DEDICATED analog of tierC/dsFeatureEdges.ts `buildDragonScalesConformingGraph`, for GeometricStar.
//
// GeoStar's relief is a strapwork field dStrap(u,t) = geometricStarStrapField(...).field (analyticSurfaceGate.ts:671),
// with the near-VERTICAL chevron CLIFF occupying the band dStrap ∈ [0, edge] (edge=0.02 at registry defaults). The
// relief is `1 − smoothstep(0, edge, dStrap)`, so the two crease loci bounding the cliff are the LEVEL CURVES
//   • dStrap = 0    — the strap-top edge (relief=1, plateau side), and
//   • dStrap = edge — the gap-floor edge (relief=0, flat-gap side).
// Conforming BOTH puts a mesh edge on each end of the steep ramp so no facet chords across the near-vertical wall.
//
// This module traces BOTH level sets with marchingSquaresZero + segmentsToPolylines (the SAME extractor
// FeatureLineGraph.ts:117 uses), resamples each polyline by arc length, snaps every point exactly onto its level
// curve (Newton on the field), and chains them into a FeatureGraph { pts (flat u,t), edges (point-index PAIRS) } —
// the SAME shape dsFeatureEdges.ts emits — for injection into buildInhouseMetricMesh as injectedPoints +
// constraintEdges (+ pinInjected + recoverySubdivideCollinear).
//
// DEV/LAB ONLY (research/). src/ must never import this. Seam: periodicU=true tracing (the extractor closes
// seam-crossing contours via the u=1 wrap column); points stay in [0,1] and u≈0 / u≈1 seam duplicates are welded by
// the kernel's own 3D position weld at audit time (same as the seed grid's u=0 and u=1 columns).

import { marchingSquaresZero, segmentsToPolylines } from '../../src/renderers/webgpu/parametric/conforming/SampledFeatureExtractor';
import { geometricStarStrapField } from '../../src/fidelity/analyticSurfaceGate';

export interface FeatureGraph {
  pts: number[];
  edges: number[];
}

interface UtPoint { u: number; t: number; }

/** GeometricStar strap-field params (registry.ts:394 + windowHook.ts:1018 defaults). */
export interface GeoStarStrapParams {
  points?: number;
  gap?: number;
  detail?: number;
  layers?: number;
  roundness?: number;
  zoom?: number;
  shift?: number;
}

/** DEFAULT GeometricStar strap params ⇒ edge = 0.02 + roundness·0.2 = 0.02. */
export const DEFAULT_GEOSTAR_STRAP: Required<GeoStarStrapParams> = {
  points: 8, gap: 0.05, detail: 0.5, layers: 4, roundness: 0, zoom: 1, shift: 0,
};

export interface GeoStarGraphOpts {
  strap?: GeoStarStrapParams;
  /** marching-squares grid resolution (default 512×512 — fine; the field is piecewise-linear so this is plenty). */
  resU?: number;
  resT?: number;
  /** uniform arc-length resample spacing in (u,t) for the emitted constraint edges (default 0.005). 0 = keep raw. */
  segLen?: number;
  /** Newton snap iterations projecting each point exactly onto its level curve (default 16). */
  snapIters?: number;
  /** minPoints for segmentsToPolylines (stubs shorter than this are dropped; default 3). */
  minPoints?: number;
}

/**
 * Newton-project (u,t) exactly onto the level curve field=c, stepping along the field gradient
 * (numerical central difference). The strap field is piecewise-LINEAR between its abs-folds, so a couple of steps
 * nail it; the step is clamped to a few grid cells so a fold-straddling start cannot bolt off. The two conformed
 * level sets (|L|=gap and |L|=gap+edge) sit ≥ gap=0.05 away from the outer fold L=0, so the gradient never vanishes
 * on them.
 */
function snapToLevel(field: (u: number, t: number) => number, u: number, t: number, c: number, iters: number, resU: number): UtPoint {
  const h = 1e-6;
  const lim = 4 / resU;
  let uu = u, tt = t;
  for (let k = 0; k < iters; k++) {
    const f = field(uu, tt) - c;
    if (Math.abs(f) < 1e-12) break;
    const gu = (field(uu + h, tt) - field(uu - h, tt)) / (2 * h);
    const gt = (field(uu, tt + h) - field(uu, tt - h)) / (2 * h);
    const g2 = gu * gu + gt * gt;
    if (g2 < 1e-18) break;
    let du = -f * gu / g2, dt = -f * gt / g2;
    const s = Math.hypot(du, dt);
    if (s > lim) { du *= lim / s; dt *= lim / s; }
    uu += du; tt += dt;
  }
  return { u: uu, t: tt };
}

/** Uniform arc-length resample of a (u,t) polyline to ~segLen spacing (keeps endpoints; closed loops re-close via dedup). */
function resampleByArcLen(poly: UtPoint[], segLen: number): UtPoint[] {
  const n = poly.length;
  if (n < 2) return poly.slice();
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(poly[i].u - poly[i - 1].u, poly[i].t - poly[i - 1].t);
  const total = cum[n - 1];
  if (total < 1e-12) return [poly[0]];
  const nSeg = Math.max(1, Math.round(total / segLen));
  const out: UtPoint[] = [];
  let seg = 1;
  for (let k = 0; k <= nSeg; k++) {
    const sTarget = (total * k) / nSeg;
    while (seg < n - 1 && cum[seg] < sTarget) seg++;
    const i0 = seg - 1, i1 = seg;
    const segL = cum[i1] - cum[i0];
    const w = segL > 1e-15 ? (sTarget - cum[i0]) / segL : 0;
    out.push({ u: poly[i0].u + (poly[i1].u - poly[i0].u) * w, t: poly[i0].t + (poly[i1].t - poly[i0].t) * w });
  }
  return out;
}

/**
 * Trace the TWO GeometricStar cliff level curves (dStrap=0 strap-top, dStrap=edge gap-floor) into a constraint
 * FeatureGraph { pts (flat u,t), edges (point-index PAIRS) } for injection into buildInhouseMetricMesh. Each level
 * set is contoured by marchingSquaresZero (periodic-u), welded into polylines, arc-length-resampled to ~segLen, and
 * each point snapped exactly onto its level curve. Chains split at the t-rims (t∈[tEps,1−tEps]) and the u-seam
 * (distinct u≈0 / u≈1 nodes) so no long boundary-spanning constraint edge is emitted.
 */
export function buildGeometricStarConformingGraph(opts: GeoStarGraphOpts = {}): FeatureGraph {
  const sp = { ...DEFAULT_GEOSTAR_STRAP, ...(opts.strap ?? {}) };
  const resU = opts.resU ?? 512, resT = opts.resT ?? 512;
  const segLen = opts.segLen ?? 0.005;
  const snapIters = opts.snapIters ?? 20;
  const minPoints = opts.minPoints ?? 3;
  const tEps = 1e-3;

  const { field, hi: edge } = geometricStarStrapField(sp.points, sp.gap, sp.detail, sp.layers, sp.roundness, sp.zoom, sp.shift);
  const levels = [0, edge];

  const pts: number[] = [];
  const edges: number[] = [];
  const inDomain = (p: UtPoint): boolean => p.t >= tEps && p.t <= 1 - tEps && p.u >= -1e-9 && p.u <= 1 + 1e-9;

  for (const c of levels) {
    const field2 = (u: number, t: number): number => field(u, t) - c;
    const segs = marchingSquaresZero(field2, resU, resT, true);
    const lines = segmentsToPolylines(segs, `dStrap=${c}`, minPoints, 0);
    for (const line of lines) {
      const raw = line.points.map((p) => ({ u: p.u, t: p.t }));
      const rs = segLen > 0 ? resampleByArcLen(raw, segLen) : raw;
      let prevIdx = -1;
      for (const p0 of rs) {
        const p = snapToLevel(field, p0.u, p0.t, c, snapIters, resU);
        if (!inDomain(p)) { prevIdx = -1; continue; } // split the chain at a boundary drop
        const idx = pts.length / 2;
        pts.push(p.u, p.t);
        if (prevIdx >= 0) edges.push(prevIdx, idx);
        prevIdx = idx;
      }
    }
  }
  return { pts, edges };
}
