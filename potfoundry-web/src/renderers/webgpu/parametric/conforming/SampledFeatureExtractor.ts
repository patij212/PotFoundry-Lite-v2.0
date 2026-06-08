/**
 * SampledFeatureExtractor.ts — extract crease feature lines from a sampled
 * scalar field via marching squares + polyline tracing.
 *
 * Many relief styles place their sharp creases on the ZERO SET of a closed-form
 * (u,t) scalar (HexagonalHive: `len_a − len_b`, the hex Voronoi boundary;
 * Voronoi: `f2 − f1 − thickness`; Gyroid: the TPMS level value). This module
 * traces that zero set into ordered (u,t) polylines (`general-curve`
 * {@link FeatureLine}s) that feed the local-CDT insertion engine + the
 * feature-resolution metric.
 *
 * `marchingSquaresZero` is the standard 16-case contouring of a regular grid,
 * PERIODIC in u (the right neighbour of the last column wraps to the first, at
 * u=1). `segmentsToPolylines` welds the unordered segments into connected,
 * ordered polylines (closed loops stay closed).
 *
 * @module conforming/SampledFeatureExtractor
 */

import type { FeatureLine, FeatureLinePoint } from './FeatureLineGraph';

/** An undirected (u,t) segment of a contour. */
export interface ContourSegment {
  a: FeatureLinePoint;
  b: FeatureLinePoint;
}

/**
 * Marching-squares zero-contour of `field` sampled on a `resU × resT` grid.
 * Rows are t=j/(resT-1), columns u=i/resU. When `periodicU` is set, a wrap
 * column at u=1 (values from column 0) closes seam-crossing contours; leave it
 * off for patterns that do NOT tile at the u-seam (e.g. HexagonalHive, whose
 * `u·TAU·scale` is non-integer) so no spurious seam contour is fabricated.
 * Returns the contour as unordered (u,t) segments.
 */
export function marchingSquaresZero(
  field: (u: number, t: number) => number,
  resU: number,
  resT: number,
  periodicU = false,
): ContourSegment[] {
  const cols = periodicU ? resU + 1 : resU;
  const f = new Float64Array(cols * resT);
  const uOf = (i: number): number => i / resU; // column i (wrap column i=resU → u=1)
  const tOf = (j: number): number => j / (resT - 1);
  for (let j = 0; j < resT; j++) {
    for (let i = 0; i < cols; i++) {
      // The wrap column reuses column 0's field values (periodic) at u=1.
      f[j * cols + i] = field(i === resU ? 0 : i / resU, tOf(j));
    }
  }
  const iMax = periodicU ? resU : resU - 1; // last cell's left column

  const segs: ContourSegment[] = [];
  // Linear interpolation of the zero crossing between two corners.
  const cross = (
    ua: number, ta: number, fa: number, ub: number, tb: number, fb: number,
  ): FeatureLinePoint => {
    const denom = fa - fb;
    const s = Math.abs(denom) < 1e-300 ? 0.5 : fa / denom;
    return { u: ua + (ub - ua) * s, t: ta + (tb - ta) * s };
  };

  for (let j = 0; j < resT - 1; j++) {
    for (let i = 0; i < iMax; i++) {
      const i1 = i + 1;
      const u0 = uOf(i);
      const u1 = uOf(i1);
      const t0 = tOf(j);
      const t1 = tOf(j + 1);
      const f00 = f[j * cols + i];
      const f10 = f[j * cols + i1];
      const f11 = f[(j + 1) * cols + i1];
      const f01 = f[(j + 1) * cols + i];

      let c = 0;
      if (f00 > 0) c |= 1;
      if (f10 > 0) c |= 2;
      if (f11 > 0) c |= 4;
      if (f01 > 0) c |= 8;
      if (c === 0 || c === 15) continue;

      // Edge crossings (only those whose corners differ in sign are valid).
      const eB = (): FeatureLinePoint => cross(u0, t0, f00, u1, t0, f10); // bottom
      const eR = (): FeatureLinePoint => cross(u1, t0, f10, u1, t1, f11); // right
      const eT = (): FeatureLinePoint => cross(u0, t1, f01, u1, t1, f11); // top
      const eL = (): FeatureLinePoint => cross(u0, t0, f00, u0, t1, f01); // left

      const push = (a: FeatureLinePoint, b: FeatureLinePoint): void => {
        segs.push({ a, b });
      };

      switch (c) {
        case 1: case 14: push(eL(), eB()); break;
        case 2: case 13: push(eB(), eR()); break;
        case 3: case 12: push(eL(), eR()); break;
        case 4: case 11: push(eR(), eT()); break;
        case 6: case 9: push(eB(), eT()); break;
        case 7: case 8: push(eL(), eT()); break;
        case 5: // saddle: two segments
          push(eL(), eB());
          push(eR(), eT());
          break;
        case 10: // saddle: two segments
          push(eB(), eR());
          push(eL(), eT());
          break;
        default: break;
      }
    }
  }
  return segs;
}

/**
 * Border contouring of a CATEGORICAL field (integer labels) — for cellular
 * patterns whose crease is the boundary between regions (Voronoi cells), not a
 * smooth zero set. For each grid cell the border crosses the edges whose two
 * endpoints have DIFFERENT labels (crossing at the edge midpoint); two crossings
 * are joined directly, 3+ (triple/quad junctions) are joined through the cell
 * centre. Periodic-optional in u, same as {@link marchingSquaresZero}.
 */
export function marchingSquaresLabels(
  label: (u: number, t: number) => number,
  resU: number,
  resT: number,
  periodicU = false,
): ContourSegment[] {
  const cols = periodicU ? resU + 1 : resU;
  const lab = new Int32Array(cols * resT);
  const tOf = (j: number): number => j / (resT - 1);
  for (let j = 0; j < resT; j++) {
    for (let i = 0; i < cols; i++) {
      lab[j * cols + i] = label(i === resU ? 0 : i / resU, tOf(j));
    }
  }
  const iMax = periodicU ? resU : resU - 1;
  const segs: ContourSegment[] = [];
  for (let j = 0; j < resT - 1; j++) {
    for (let i = 0; i < iMax; i++) {
      const u0 = i / resU;
      const u1 = (i + 1) / resU;
      const t0 = tOf(j);
      const t1 = tOf(j + 1);
      const lSW = lab[j * cols + i];
      const lSE = lab[j * cols + i + 1];
      const lNE = lab[(j + 1) * cols + i + 1];
      const lNW = lab[(j + 1) * cols + i];
      if (lSW === lSE && lSE === lNE && lNE === lNW) continue;
      const cr: FeatureLinePoint[] = [];
      if (lSW !== lSE) cr.push({ u: (u0 + u1) / 2, t: t0 });
      if (lSE !== lNE) cr.push({ u: u1, t: (t0 + t1) / 2 });
      if (lNW !== lNE) cr.push({ u: (u0 + u1) / 2, t: t1 });
      if (lSW !== lNW) cr.push({ u: u0, t: (t0 + t1) / 2 });
      // Only the clean 2-crossing case (a border passing straight through) is
      // emitted. Triple/quad junction cells are skipped — joining them through
      // the cell centre injects short zig-zag spurs that the insertion turns into
      // needles/cracks; the tiny gap left at a junction does not drop a line below
      // the coverage threshold.
      if (cr.length === 2) segs.push({ a: cr[0], b: cr[1] });
    }
  }
  return segs;
}

const WELD = 1e-6;

/** Perpendicular distance from p to the line through a,b (in (u,t)). */
function perpDist(p: FeatureLinePoint, a: FeatureLinePoint, b: FeatureLinePoint): number {
  const dx = b.u - a.u;
  const dy = b.t - a.t;
  const len = Math.hypot(dx, dy);
  if (len < 1e-300) return Math.hypot(p.u - a.u, p.t - a.t);
  return Math.abs((p.u - a.u) * dy - (p.t - a.t) * dx) / len;
}

/**
 * Douglas–Peucker polyline simplification: drop points within `tol` of the
 * chord, keeping the sharp corners (hex vertices, cell-junction kinks). This
 * collapses the dense per-cell contour samples on a STRAIGHT crease down to its
 * endpoints — the insertion then reconnects them with the true straight edge,
 * slashing the inserted vertex count without losing the crease geometry.
 */
export function simplifyPolyline(points: FeatureLinePoint[], tol: number): FeatureLinePoint[] {
  const n = points.length;
  if (n < 3 || tol <= 0) return points;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx]);
      stack.push([idx, e]);
    }
  }
  const out: FeatureLinePoint[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function key(p: FeatureLinePoint): string {
  return `${Math.round(p.u / WELD)}:${Math.round(p.t / WELD)}`;
}

/**
 * Weld unordered contour segments into connected, ordered polylines. Endpoints
 * within {@link WELD} are treated as the same node; each polyline is walked
 * greedily through the segment graph. Closed loops come back closed (first
 * point ≈ last). Tiny stubs (< `minPoints`) are dropped.
 */
export function segmentsToPolylines(
  segments: ContourSegment[],
  label: string,
  minPoints = 3,
  simplifyTol = 0,
): FeatureLine[] {
  // Node table (welded) + adjacency.
  const nodePos: FeatureLinePoint[] = [];
  const nodeOf = new Map<string, number>();
  const idOf = (p: FeatureLinePoint): number => {
    const k = key(p);
    let id = nodeOf.get(k);
    if (id === undefined) {
      id = nodePos.length;
      nodePos.push(p);
      nodeOf.set(k, id);
    }
    return id;
  };
  const adj = new Map<number, number[]>();
  const edgeUsed = new Set<string>();
  const addAdj = (x: number, y: number): void => {
    let arr = adj.get(x);
    if (!arr) { arr = []; adj.set(x, arr); }
    arr.push(y);
  };
  for (const s of segments) {
    const a = idOf(s.a);
    const b = idOf(s.b);
    if (a === b) continue;
    addAdj(a, b);
    addAdj(b, a);
  }
  const ek = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

  const lines: FeatureLine[] = [];
  const takeEdge = (a: number, b: number): boolean => {
    const k = ek(a, b);
    if (edgeUsed.has(k)) return false;
    edgeUsed.add(k);
    return true;
  };

  // Walk every edge into a polyline. Prefer starting at degree-1 (open ends),
  // then sweep remaining (closed loops).
  const degree = (n: number): number => (adj.get(n) ?? []).length;
  const starts: number[] = [];
  for (let n = 0; n < nodePos.length; n++) if (degree(n) === 1) starts.push(n);
  for (let n = 0; n < nodePos.length; n++) starts.push(n); // loops afterwards

  for (const start of starts) {
    const neigh = adj.get(start) ?? [];
    for (const first of neigh) {
      if (edgeUsed.has(ek(start, first))) continue;
      const path: number[] = [start];
      let prev = start;
      let curr = first;
      takeEdge(prev, curr);
      path.push(curr);
      // Extend until no unused edge continues the path.
      // Greedy: pick any unused neighbour (prefer the one that is not `prev`).
      for (;;) {
        const ns = adj.get(curr) ?? [];
        let next = -1;
        for (const cand of ns) {
          if (cand === prev) continue;
          if (!edgeUsed.has(ek(curr, cand))) { next = cand; break; }
        }
        if (next < 0) {
          // try going back toward prev only if it closes a loop
          for (const cand of ns) {
            if (!edgeUsed.has(ek(curr, cand))) { next = cand; break; }
          }
        }
        if (next < 0) break;
        takeEdge(curr, next);
        path.push(next);
        prev = curr;
        curr = next;
        if (curr === path[0]) break; // closed loop
      }
      if (path.length >= minPoints) {
        const pts = path.map((id) => nodePos[id]);
        lines.push({
          kind: 'general-curve',
          label,
          points: simplifyTol > 0 ? simplifyPolyline(pts, simplifyTol) : pts,
        });
      }
    }
  }
  return lines;
}
