import { describe, expect, it } from 'vitest';

import {
  assembleVoronoiConformingChords,
  type VoronoiChordOptions,
} from './voronoiConformingChords';
import {
  voronoiBisectorSegmentsUv,
  type UvSegment,
  type VoronoiLatticeParams,
} from './voronoiBisectorGuides';

/*
 * STRATA-001 S2 Task 2.2 — chord-chain assembly for conformingChordsByPatch.
 *
 * The chords are an UNTRUSTED BUDGET LEVER (spec §4 authority split): a wrong
 * chord costs triangles, never soundness — the validated screen remains the
 * only authority. So these tests check the tessellator's structural contract
 * (endpoints ON grid lines, exact rationals, chained without T-junctions) and
 * that the emitted polyline actually TRACKS the exact bisector, not that it is
 * bit-exact on it.
 *
 * Registry defaults are v_scale 8 / v_jitter 0.8 (voronoiOuterWallTarget), so
 * the lattice below is the real one; relief/morph do not affect the site
 * lattice and therefore do not affect the bisector geometry.
 */

const LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};

const OPTIONS: VoronoiChordOptions = {
  angularDivisionsLog2: 8,
  verticalDivisionsLog2: 7,
  chordFractionBits: 16,
};

function pointSegmentDistance(
  px: number,
  py: number,
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return Math.hypot(px - a[0], py - a[1]);
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function distanceToGraph(u: number, v: number, segs: readonly UvSegment[]): number {
  let best = Infinity;
  for (const s of segs) {
    const d = pointSegmentDistance(u, v, s.a, s.b);
    if (d < best) best = d;
  }
  return best;
}

describe('assembleVoronoiConformingChords', () => {
  it('emits chords for the default bubble lattice', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    expect(chords.length).toBeGreaterThan(0);
  });

  it('uses one exact dyadic denominator that both grids divide', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    for (const chord of chords) {
      expect(chord.denominator).toBe(String(denominator));
      for (const point of [chord.start, chord.end]) {
        // Exact integers, in range.
        const u = Number(point.uNumerator);
        const v = Number(point.vNumerator);
        expect(Number.isSafeInteger(u)).toBe(true);
        expect(Number.isSafeInteger(v)).toBe(true);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(denominator);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(denominator);
      }
    }
  });

  it('places every endpoint ON a grid line (tessellator contract)', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const uStep = denominator / 2 ** OPTIONS.angularDivisionsLog2;
    const vStep = denominator / 2 ** OPTIONS.verticalDivisionsLog2;
    for (const chord of chords) {
      for (const point of [chord.start, chord.end]) {
        const onColumn = Number(point.uNumerator) % uStep === 0;
        const onRow = Number(point.vNumerator) % vStep === 0;
        expect(
          onColumn || onRow,
          `endpoint (${point.uNumerator},${point.vNumerator}) lies on no grid line`
        ).toBe(true);
      }
    }
  });

  it('never emits a chord that runs along a grid line or is degenerate', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    for (const chord of chords) {
      const sameU = chord.start.uNumerator === chord.end.uNumerator;
      const sameV = chord.start.vNumerator === chord.end.vNumerator;
      expect(sameU && sameV, 'degenerate chord').toBe(false);
      expect(sameU || sameV, 'chord lies along a grid line').toBe(false);
    }
  });

  it('tracks the exact bisector graph within the snap tolerance', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const segs = voronoiBisectorSegmentsUv(LATTICE);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    // A snapped endpoint moves by at most half a chord-grid step on the free
    // axis; the midpoint of a chord therefore stays within a few steps of the
    // true bisector. Generous by 8x and still ~1e-3 of a lattice cell.
    const tolerance = (8 / denominator) * Math.SQRT2;
    let worst = 0;
    for (const chord of chords) {
      const mu =
        (Number(chord.start.uNumerator) + Number(chord.end.uNumerator)) / (2 * denominator);
      const mv =
        (Number(chord.start.vNumerator) + Number(chord.end.vNumerator)) / (2 * denominator);
      worst = Math.max(worst, distanceToGraph(mu, mv, segs));
    }
    expect(worst, `worst chord-midpoint offset ${worst} exceeds ${tolerance}`).toBeLessThan(
      tolerance
    );
  });

  it('shares chain vertices verbatim — no near-miss T-junctions', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const keys = new Set<string>();
    const points: Array<readonly [number, number]> = [];
    for (const chord of chords) {
      for (const point of [chord.start, chord.end]) {
        const key = `${point.uNumerator},${point.vNumerator}`;
        if (!keys.has(key)) {
          keys.add(key);
          points.push([Number(point.uNumerator), Number(point.vNumerator)]);
        }
      }
    }
    // Any two DISTINCT chain vertices must be separated by more than one
    // chord-grid step; otherwise they are a snap-collision that the exact
    // partition kernel would see as a T-junction.
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i + 1 < points.length; i += 1) {
      for (let j = i + 1; j < points.length && points[j][0] - points[i][0] <= 1; j += 1) {
        const du = points[j][0] - points[i][0];
        const dv = Math.abs(points[j][1] - points[i][1]);
        expect(
          du === 0 && dv === 0,
          `duplicate vertex slipped into the distinct set`
        ).toBe(false);
        if (du <= 1 && dv <= 1) {
          throw new Error(
            `near-miss chain vertices ${points[i]} and ${points[j]} (snap collision)`
          );
        }
      }
    }
    expect(points.length).toBeGreaterThan(0);
  });

  it('keeps endpoints out of the periodic seam interior', () => {
    const chords = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const uStep = denominator / 2 ** OPTIONS.angularDivisionsLog2;
    for (const chord of chords) {
      for (const point of [chord.start, chord.end]) {
        const u = Number(point.uNumerator);
        // Strictly inside the first or last angular column is refused by the
        // tessellator (seam-column rule); u must be 0, denominator, or land on
        // a column line, or sit in a non-seam column.
        const inFirstColumnInterior = u > 0 && u < uStep;
        const inLastColumnInterior = u > denominator - uStep && u < denominator;
        expect(
          inFirstColumnInterior || inLastColumnInterior,
          `endpoint u=${u} sits strictly inside a seam column`
        ).toBe(false);
      }
    }
  });
});
