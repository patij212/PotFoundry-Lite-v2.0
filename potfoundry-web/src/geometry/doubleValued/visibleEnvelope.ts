// visibleEnvelope.ts — P3b Task 1: pure visible-envelope clipping for CelticKnot cliffs.
//
// Standalone (src/geometry/doubleValued/) pure-function stage: for each declared
// ribbon<->background cliff (column, strand, side), compute the maximal t-intervals
// where the strand's edge is the z-buffer TOP (visible) vs occluded by another,
// higher strand, plus the boundary t-values where visibility flips (dives under /
// emerges). No meshing here — this is the deterministic geometric precursor that
// Task 2's mesher will feed to the CDT as constraints instead of full-band cliffs.
//
// Re-derives the CelticKnot strand geometry (centerline/zHeight closed form) locally
// from the read-only P1 types, rather than importing P1 internals (Global Constraints:
// `celticKnotCliffComplex.ts` stays untouched).

import type {
  CelticKnotCliffParams,
  CliffDims,
} from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';

/** One maximal visible (non-occluded) t-sub-arc of a single ribbon<->background cliff edge. */
export interface VisibleSubArc {
  strand: number;
  side: 1 | -1;
  column: number;
  tRange: [number, number];
}

/**
 * A t-value where a cliff edge's visibility flips (the strand dives under / emerges
 * from another strand). `overStrand` is the OTHER strand on top at/around this boundary.
 */
export interface OcclusionBoundary {
  strand: number;
  side: 1 | -1;
  column: number;
  t: number;
  overStrand: number;
}

export interface VisibleEnvelope {
  visibleCliffs: VisibleSubArc[];
  occlusionBoundaries: OcclusionBoundary[];
}

const TAU = 2 * Math.PI;
const T_LO = 0.02;
const T_HI = 0.98;
const SCAN = 0.0005;

/** Same closed form P1 (celticKnotCliffComplex.ts) and the mesher use; re-derived read-only. */
function arg(p: CelticKnotCliffParams, col: number, s: number, t: number): number {
  return t * p.tightness * TAU * 3 + col * Math.PI * 0.333 + s * (TAU / p.strandCount);
}

function centerline(p: CelticKnotCliffParams, col: number, s: number, t: number): number {
  return 0.4 * Math.sin(arg(p, col, s, t));
}

function zHeight(p: CelticKnotCliffParams, col: number, s: number, t: number): number {
  const weave = Math.max(1, p.strandCount - 1);
  const o = arg(p, col, s, t) * weave;
  return p.strandCount % 2 !== 0 ? Math.sin(o) : Math.cos(o);
}

/**
 * Index of the strand occluding strand `s`'s `side` edge at `t` — the OTHER strand
 * whose centerline passes within `strandWidth` of the edge's local-u position AND
 * sits at a higher z there — or -1 if no strand occludes it (the edge is visible).
 */
function occluderAt(
  p: CelticKnotCliffParams,
  column: number,
  s: number,
  side: 1 | -1,
  t: number
): number {
  const localUEdge = centerline(p, column, s, t) + side * p.strandWidth;
  let best = -1;
  let bestZ = zHeight(p, column, s, t);
  for (let k = 0; k < p.strandCount; k += 1) {
    if (k === s) continue;
    if (
      Math.abs(localUEdge - centerline(p, column, k, t)) < p.strandWidth &&
      zHeight(p, column, k, t) > bestZ
    ) {
      bestZ = zHeight(p, column, k, t);
      best = k;
    }
  }
  return best;
}

/**
 * Whether strand `s`'s `side` cliff edge at `t` is occluded by some other, higher
 * strand (`occluderAt(...) >= 0`). Exported so callers — and the test — can assert the
 * visibility invariant directly instead of re-deriving the z-buffer comparison.
 */
export function occludedAt(
  p: CelticKnotCliffParams,
  column: number,
  strand: number,
  side: 1 | -1,
  t: number
): boolean {
  return occluderAt(p, column, strand, side, t) >= 0;
}

/**
 * Clip every declared ribbon<->background cliff `(column, strand, side)` to its
 * maximal visible (non-occluded) t-sub-arcs, plus the t-values where visibility flips
 * (an occlusion boundary, paired with the strand that is on top there).
 *
 * Pure and deterministic: a fixed forward scan (`SCAN` step) detects each visibility
 * flip, then a fixed 40-iteration bisection refines it to a clean boundary t. No
 * Date/Math.random/DOM.
 */
export function clipCliffsToVisibleEnvelope(
  p: CelticKnotCliffParams,
  _dims: CliffDims
): VisibleEnvelope {
  const { columnCount, strandCount } = p;
  const visibleCliffs: VisibleSubArc[] = [];
  const occlusionBoundaries: OcclusionBoundary[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    for (let strand = 0; strand < strandCount; strand += 1) {
      for (const side of [1, -1] as const) {
        let runStart: number | null = null;
        let prevOcc = occluderAt(p, column, strand, side, T_LO);
        if (prevOcc < 0) runStart = T_LO;
        for (let t = T_LO + SCAN; t <= T_HI + 1e-9; t += SCAN) {
          const occ = occluderAt(p, column, strand, side, t);
          const wasVisible = prevOcc < 0;
          const nowVisible = occ < 0;
          if (wasVisible !== nowVisible) {
            // bisect the flip for a clean boundary t
            let lo = t - SCAN;
            let hi = t;
            for (let b = 0; b < 40; b += 1) {
              const m = 0.5 * (lo + hi);
              if ((occluderAt(p, column, strand, side, m) < 0) === wasVisible) lo = m;
              else hi = m;
            }
            const tb = 0.5 * (lo + hi);
            const over = wasVisible ? occ : prevOcc; // the strand that starts/stops occluding
            occlusionBoundaries.push({ strand, side, column, t: tb, overStrand: Math.max(0, over) });
            if (wasVisible && runStart !== null) {
              visibleCliffs.push({ strand, side, column, tRange: [runStart, tb] });
              runStart = null;
            }
            if (nowVisible) runStart = tb;
          }
          prevOcc = occ;
        }
        if (runStart !== null) {
          visibleCliffs.push({ strand, side, column, tRange: [runStart, T_HI] });
        }
      }
    }
  }
  return { visibleCliffs, occlusionBoundaries };
}
