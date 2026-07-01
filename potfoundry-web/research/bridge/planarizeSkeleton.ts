// planarizeSkeleton.ts — DEV-ONLY. Turn feature-line segments in (u,t) into a PSLG (planar straight-line graph):
// split every PROPER crossing and T-junction into a SHARED node, dedupe coincident points. This is what makes a
// feature skeleton legally embeddable (gmsh mesh.embed forbids crossing constraints — they must meet at a node).
// Feeds the Bet 1 gmsh embedded-skeleton proxy. research/ only; imported by nothing in src/.

export interface PSLG {
  /** flat [u0,t0,u1,t1,...] unique points. */
  points: number[];
  /** flat [i,j,...] index pairs into points; no crossings (shared at junctions). */
  edges: number[];
}

const EPS_ON = 1e-7; // point-on-segment tolerance (u,t units)

/** Proper crossing / T-junction of segment A=(a0,a1) and B=(b0,b1): returns [tA, tB] params if they meet with at
 *  least one param strictly interior (a shared ENDPOINT needs no split → null). Parallel/collinear → null. */
function crossParams(
  ax0: number, ay0: number, ax1: number, ay1: number,
  bx0: number, by0: number, bx1: number, by1: number,
): [number, number] | null {
  const rx = ax1 - ax0, ry = ay1 - ay0, sx = bx1 - bx0, sy = by1 - by0;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-14) return null; // parallel or collinear
  const qpx = bx0 - ax0, qpy = by0 - ay0;
  const tA = (qpx * sy - qpy * sx) / denom;
  const tB = (qpx * ry - qpy * rx) / denom;
  if (tA < -1e-9 || tA > 1 + 1e-9 || tB < -1e-9 || tB > 1 + 1e-9) return null;
  const interior = (x: number): boolean => x > 1e-6 && x < 1 - 1e-6;
  if (!(interior(tA) || interior(tB))) return null; // only a shared endpoint — no split needed
  return [Math.min(1, Math.max(0, tA)), Math.min(1, Math.max(0, tB))];
}

/**
 * Planarize a set of (u,t) segments into a PSLG. O(n²) crossing scan (fine for the few-thousand-segment skeletons
 * we embed; cap upstream if larger). Points deduped by snapping to a `snapEps` grid so junctions become shared.
 */
export function planarizeSegments(segs: ReadonlyArray<readonly [number, number, number, number]>, snapEps = 1e-5): PSLG {
  const n = segs.length;
  const cuts: number[][] = Array.from({ length: n }, () => [0, 1]); // split params per segment (endpoints always)
  for (let i = 0; i < n; i++) {
    const [ax0, ay0, ax1, ay1] = segs[i];
    for (let j = i + 1; j < n; j++) {
      const [bx0, by0, bx1, by1] = segs[j];
      const hit = crossParams(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1);
      if (hit) { cuts[i].push(hit[0]); cuts[j].push(hit[1]); }
    }
  }
  const pointIdx = new Map<string, number>(); const points: number[] = [];
  const key = (u: number, t: number): string => `${Math.round(u / snapEps)}_${Math.round(t / snapEps)}`;
  const addPt = (u: number, t: number): number => {
    const k = key(u, t); let id = pointIdx.get(k);
    if (id === undefined) { id = points.length / 2; pointIdx.set(k, id); points.push(u, t); }
    return id;
  };
  const edgeSeen = new Set<string>(); const edges: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ax0, ay0, ax1, ay1] = segs[i];
    const ps = [...new Set(cuts[i].map((s) => Math.min(1, Math.max(0, s))))].sort((a, b) => a - b);
    for (let k = 0; k + 1 < ps.length; k++) {
      const s0 = ps[k], s1 = ps[k + 1];
      if (s1 - s0 < 1e-9) continue;
      const a = addPt(ax0 + (ax1 - ax0) * s0, ay0 + (ay1 - ay0) * s0);
      const b = addPt(ax0 + (ax1 - ax0) * s1, ay0 + (ay1 - ay0) * s1);
      if (a === b) continue;
      const ek = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (edgeSeen.has(ek)) continue;
      edgeSeen.add(ek); edges.push(a, b);
    }
  }
  return { points, edges };
}

/** Convenience: extract embeddable (u,t) segments from feature-line polylines, dropping seam-wrap + boundary-band
 *  segments (the proxy meshes the unit square NON-periodically; seam handling is a documented caveat). */
export function segmentsFromLines(
  lines: ReadonlyArray<{ points: ReadonlyArray<{ u: number; t: number }> }>, seamBand = 0.01,
): Array<[number, number, number, number]> {
  const segs: Array<[number, number, number, number]> = [];
  const inInterior = (u: number, t: number): boolean => u > seamBand && u < 1 - seamBand && t > seamBand && t < 1 - seamBand;
  for (const line of lines) {
    const pl = line.points;
    for (let i = 0; i + 1 < pl.length; i++) {
      const u0 = pl[i].u, u1 = pl[i + 1].u, t0 = pl[i].t, t1 = pl[i + 1].t;
      if (Math.abs(u1 - u0) > 0.5) continue;              // seam-wrapping segment → skip (non-periodic proxy)
      if (!inInterior(u0, t0) || !inInterior(u1, t1)) continue; // boundary band → skip
      if (Math.hypot(u1 - u0, t1 - t0) < 1e-9) continue;
      segs.push([u0, t0, u1, t1]);
    }
  }
  return segs;
}
