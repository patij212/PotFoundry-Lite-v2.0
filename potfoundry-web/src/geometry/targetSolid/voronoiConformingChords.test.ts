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
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    expect(chords.length).toBeGreaterThan(0);
  });

  it('uses one exact dyadic denominator that both grids divide', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
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
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
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

  it('never emits a degenerate chord, nor one lying along a grid line', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const uStep = denominator / 2 ** OPTIONS.angularDivisionsLog2;
    const vStep = denominator / 2 ** OPTIONS.verticalDivisionsLog2;
    for (const chord of chords) {
      const su = Number(chord.start.uNumerator);
      const eu = Number(chord.end.uNumerator);
      const sv = Number(chord.start.vNumerator);
      const ev = Number(chord.end.vNumerator);
      expect(su === eu && sv === ev, 'degenerate chord').toBe(false);
      // Kernel rule :1045-1050 — refused only when the shared axis is a STATION
      // on both ends. A shared SNAPPED coordinate is a legitimate cut.
      const alongColumn = su === eu && su % uStep === 0 && eu % uStep === 0;
      const alongRow = sv === ev && sv % vStep === 0 && ev % vStep === 0;
      expect(alongColumn || alongRow, 'chord lies along a grid line').toBe(false);
    }
  });

  it('emits only consecutive-crossing chords, so each bounds one common cell', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const uStep = denominator / 2 ** OPTIONS.angularDivisionsLog2;
    const vStep = denominator / 2 ** OPTIONS.verticalDivisionsLog2;
    // Both endpoints must touch the boundary of a single cell: their column
    // spans and row spans may differ by at most one step.
    for (const chord of chords) {
      const su = Number(chord.start.uNumerator);
      const eu = Number(chord.end.uNumerator);
      const sv = Number(chord.start.vNumerator);
      const ev = Number(chord.end.vNumerator);
      expect(
        Math.abs(Math.floor(su / uStep) - Math.floor(eu / uStep)),
        `chord spans more than one column: u ${su} -> ${eu}`
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(Math.floor(sv / vStep) - Math.floor(ev / vStep)),
        `chord spans more than one row: v ${sv} -> ${ev}`
      ).toBeLessThanOrEqual(1);
    }
  });

  it('tracks the exact bisector graph, with deviation confined to anchored chain ends', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const segs = voronoiBisectorSegmentsUv(LATTICE);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const uStep = denominator / 2 ** OPTIONS.angularDivisionsLog2;
    const vStep = denominator / 2 ** OPTIONS.verticalDivisionsLog2;
    // Interior chords sit on the bisector to within the snap; the FIRST and LAST
    // chord of each chain are deliberately pulled to a grid corner (kernel
    // requires chains to reach the grid at both extremes), which can move them
    // by up to half a cell. Score the two populations separately — a blended
    // number would hide whichever one regressed.
    const offsets: number[] = [];
    let anchoredWorst = 0;
    for (const chord of chords) {
      const su = Number(chord.start.uNumerator);
      const eu = Number(chord.end.uNumerator);
      const sv = Number(chord.start.vNumerator);
      const ev = Number(chord.end.vNumerator);
      const mu = (su + eu) / (2 * denominator);
      const mv = (sv + ev) / (2 * denominator);
      const offset = distanceToGraph(mu, mv, segs);
      const touchesCorner =
        (su % uStep === 0 && sv % vStep === 0) || (eu % uStep === 0 && ev % vStep === 0);
      if (touchesCorner) anchoredWorst = Math.max(anchoredWorst, offset);
      else offsets.push(offset);
    }
    const snapTolerance = (8 / denominator) * Math.SQRT2;
    const cellDiagonal = Math.hypot(uStep / denominator, vStep / denominator);
    expect(offsets.length, 'no interior chords to score').toBeGreaterThan(0);
    const worstInterior = Math.max(...offsets);
    expect(
      worstInterior,
      `worst INTERIOR chord offset ${worstInterior} exceeds the snap tolerance ${snapTolerance}`
    ).toBeLessThan(snapTolerance);
    expect(
      anchoredWorst,
      `anchored end chord offset ${anchoredWorst} exceeds half a cell diagonal ${cellDiagonal}`
    ).toBeLessThanOrEqual(cellDiagonal);
  });

  it('shares chain vertices verbatim — no near-miss T-junctions', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
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

  // The two kernel endpoint rules, verbatim from
  // annularSolidReferenceTessellation:1024-1043. Both bite because a snapped
  // coordinate is almost never a station.
  it('puts boundary-row endpoints exactly on angular stations', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const uStep = denominator / 2 ** OPTIONS.angularDivisionsLog2;
    for (const chord of chords) {
      for (const point of [chord.start, chord.end]) {
        const u = Number(point.uNumerator);
        const v = Number(point.vNumerator);
        if (v === 0 || v === denominator) {
          expect(
            u % uStep,
            `boundary-row endpoint u=${u} is off-station (weld T-junction)`
          ).toBe(0);
        }
      }
    }
  });

  it('touches the periodic seam only at grid corners', () => {
    const { chords } = assembleVoronoiConformingChords(LATTICE, OPTIONS);
    const denominator = 2 ** OPTIONS.chordFractionBits;
    const vStep = denominator / 2 ** OPTIONS.verticalDivisionsLog2;
    for (const chord of chords) {
      for (const point of [chord.start, chord.end]) {
        const u = Number(point.uNumerator);
        const v = Number(point.vNumerator);
        if ((u === 0 || u === denominator) && v !== 0 && v !== denominator) {
          expect(
            v % vStep,
            `seam-column endpoint v=${v} is not a station — the periodic weld cannot share it`
          ).toBe(0);
        }
      }
    }
  });
});
