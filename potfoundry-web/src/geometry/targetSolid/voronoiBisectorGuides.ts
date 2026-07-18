import { integerPcg2dUnitHash } from './integerPcg2dHash';

/*
 * Voronoi F1-kink (bisector) guide-curve generator for the bubble-mode Voronoi
 * outer wall. The certified target (voronoiOuterWallTarget.voronoiRadius) is
 *   wall = base + relief * smoothstep(1, 0, f1),
 *   f1   = min over the 3x3 neighbour window of dist(cellUv, center),
 *   center(cellX, cellY) = cell + jitter * pcg2dUnit(wrap(cellX, period), cellY),
 * in cellular coordinates (uAnimated, vCell) = (u*scale + pulse*scale, v*scale*zStretch).
 * f1 (hence the wall) kinks along the Voronoi edges of those centers — the C0
 * lines the mean-value screen pays genuine Clarke slack on. This module emits
 * those edges as (u,v) segments so a conforming tessellation can put cell
 * boundaries ON them (one-sided min per cell => no Clarke => tight bound).
 *
 * Scope: geometry only (segments), unit-verified against the exact target
 * center formula. Grid-station snapping and chord-chain assembly for
 * conformingChordsByPatch are the next increment.
 */

export interface VoronoiLatticeParams {
  readonly scale: number;
  readonly jitter: number;
  readonly pulse: number;
  readonly zStretch: number;
  /** Integer cellular period in X (cpuPeriodX = max(1, floor(scale + 0.5))). */
  readonly period: number;
}

export interface UvSegment {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
}

interface Point {
  x: number;
  y: number;
}

function wrap(value: number, period: number): number {
  return value - Math.floor(value / period) * period;
}

/**
 * Id of the nearest center to a cellular point (over the same 3x3-plus-margin
 * window the target's f1 sees). A cell whose three corners return different ids
 * straddles a Voronoi bisector — the exact case where the target's `min` kinks
 * and the screen pays Clarke slack; a conforming cell shares one id and is
 * one-sided (tight).
 */
export function voronoiNearestCenterId(
  params: VoronoiLatticeParams,
  cellularX: number,
  cellularY: number
): string {
  const baseX = Math.floor(cellularX);
  const baseY = Math.floor(cellularY);
  let bestId = '';
  let bestDistance = Infinity;
  for (let oy = -2; oy <= 2; oy += 1) {
    for (let ox = -2; ox <= 2; ox += 1) {
      const cellX = baseX + ox;
      const cellY = baseY + oy;
      const [x, y] = voronoiCenterCellular(params, cellX, cellY);
      const d = Math.hypot(x - cellularX, y - cellularY);
      if (d < bestDistance) {
        bestDistance = d;
        bestId = `${cellX},${cellY}`;
      }
    }
  }
  return bestId;
}

/** Absolute cellular-coordinate center of lattice cell (cellX, cellY). */
export function voronoiCenterCellular(
  params: VoronoiLatticeParams,
  cellX: number,
  cellY: number
): readonly [number, number] {
  const [hx, hy] = integerPcg2dUnitHash(wrap(cellX, params.period), cellY);
  return [cellX + params.jitter * hx, cellY + params.jitter * hy];
}

/** Sutherland-Hodgman clip of a convex polygon to the half-plane nx*x+ny*y <= d. */
function clipHalfPlane(poly: readonly Point[], nx: number, ny: number, d: number): Point[] {
  const out: Point[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const da = nx * a.x + ny * a.y - d;
    const db = nx * b.x + ny * b.y - d;
    const aIn = da <= 0;
    const bIn = db <= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

/** Clip cellular segment (a,b) to the box, returning null if it leaves nothing. */
function clipSegmentToBox(
  a: Point,
  b: Point,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): { a: Point; b: Point } | null {
  // Liang-Barsky.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // parallel: inside iff q>=0
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (
    clip(-dx, a.x - xMin) &&
    clip(dx, xMax - a.x) &&
    clip(-dy, a.y - yMin) &&
    clip(dy, yMax - a.y)
  ) {
    if (t1 < t0) return null;
    return {
      a: { x: a.x + t0 * dx, y: a.y + t0 * dy },
      b: { x: a.x + t1 * dx, y: a.y + t1 * dy },
    };
  }
  return null;
}

/**
 * Voronoi-edge segments of the bubble lattice, in (u,v) over the unit square.
 * Each returned segment is a maximal F1 kink line inside the wall domain.
 */
export function voronoiBisectorSegmentsUv(params: VoronoiLatticeParams): UvSegment[] {
  const { scale, pulse, zStretch, jitter, period } = params;
  const cxMin = pulse * scale;
  const cxMax = (1 + pulse) * scale;
  const cyMin = 0;
  const cyMax = scale * zStretch;
  const iLo = Math.floor(cxMin) - 1;
  const iHi = Math.ceil(cxMax) + 1;
  const jLo = Math.floor(cyMin) - 1;
  const jHi = Math.ceil(cyMax) + 1;

  interface Center {
    id: string;
    x: number;
    y: number;
  }
  const centers: Center[] = [];
  for (let i = iLo - 1; i <= iHi + 1; i += 1) {
    for (let j = jLo - 1; j <= jHi + 1; j += 1) {
      const [x, y] = voronoiCenterCellular(params, i, j);
      centers.push({ id: `${i},${j}`, x, y });
    }
  }

  const boxRadius = Math.max(2.5, 2 * jitter + 1.5);
  const neighborRadius = 2 * boxRadius;
  const segments = new Map<string, UvSegment>();

  for (const ci of centers) {
    // Only cells whose center could own domain area matter.
    if (ci.x < cxMin - 1.5 || ci.x > cxMax + 1.5 || ci.y < cyMin - 1.5 || ci.y > cyMax + 1.5) {
      continue;
    }
    let poly: Point[] = [
      { x: ci.x - boxRadius, y: ci.y - boxRadius },
      { x: ci.x + boxRadius, y: ci.y - boxRadius },
      { x: ci.x + boxRadius, y: ci.y + boxRadius },
      { x: ci.x - boxRadius, y: ci.y + boxRadius },
    ];
    for (const cj of centers) {
      if (cj === ci) continue;
      if (Math.hypot(cj.x - ci.x, cj.y - ci.y) > neighborRadius) continue;
      const nx = cj.x - ci.x;
      const ny = cj.y - ci.y;
      const mx = (ci.x + cj.x) / 2;
      const my = (ci.y + cj.y) / 2;
      poly = clipHalfPlane(poly, nx, ny, nx * mx + ny * my);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;

    for (let e = 0; e < poly.length; e += 1) {
      const a = poly[e];
      const b = poly[(e + 1) % poly.length];
      const emx = (a.x + b.x) / 2;
      const emy = (a.y + b.y) / 2;
      const dI = Math.hypot(emx - ci.x, emy - ci.y);
      // Identify the equidistant neighbour that owns this edge.
      let owner: Center | null = null;
      let bestDiff = Infinity;
      for (const cj of centers) {
        if (cj === ci) continue;
        const diff = Math.abs(Math.hypot(emx - cj.x, emy - cj.y) - dI);
        if (diff < bestDiff) {
          bestDiff = diff;
          owner = cj;
        }
      }
      if (owner === null || bestDiff > 1e-7) continue; // box remnant, not a bisector
      const clipped = clipSegmentToBox(a, b, cxMin, cxMax, cyMin, cyMax);
      if (clipped === null) continue;
      if (Math.hypot(clipped.b.x - clipped.a.x, clipped.b.y - clipped.a.y) < 1e-9) continue;
      const key = ci.id < owner.id ? `${ci.id}|${owner.id}` : `${owner.id}|${ci.id}`;
      const toUv = (p: Point): readonly [number, number] => [
        (p.x - pulse * scale) / scale,
        p.y / (scale * zStretch),
      ];
      segments.set(key, { a: toUv(clipped.a), b: toUv(clipped.b) });
    }
  }

  return [...segments.values()];
}
