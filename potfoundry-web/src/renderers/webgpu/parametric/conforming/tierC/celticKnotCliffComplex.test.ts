// celticKnotCliffComplex.test.ts — P1 of the snaking-C0 double-valued wall spec
// (docs/superpowers/specs/2026-07-17-snaking-c0-double-valued-wall-design.md).
// The four assertions port the guarantees proven by the committed research probes
// (_wallSpike 8d146d50, _wallJunction 86311aba) onto the production declaration:
//   1. structure + determinism (pure)
//   2. lip-weld: segment lips == the production one-sided surface limits
//   3. junction-pinch: every crossing pinches to the shared {r0, r0-jump} vertex
//   4. wall-fidelity: a double-valued wall from a segment chords <0.01mm true-3D
import { describe, it, expect } from 'vitest';
import {
  buildCelticKnotCliffComplex,
  type CelticKnotCliffParams,
  type CliffDims,
  type CliffSegment,
} from './celticKnotCliffComplex';
import { buildAnalyticRadiusFn } from '../../../../../geometry/analyticRadius';
import { baseRadius } from '../../../../../geometry/profile';

const TAU = 2 * Math.PI;
const DIMS: CliffDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
// CelticKnot defaults, derived exactly as celticKnotOuterWallTarget.parameters().
const PARAMS: CelticKnotCliffParams = {
  columnCount: 3,          // floor(ckScale=3)
  strandWidth: 0.15 * 0.15, // ckWidth·0.15 = 0.0225
  strandCount: 3,          // clamp(floor(ckStrands+0.5),2,8)
  tightness: 0.5,          // max(0.5, ckTwist=0 + 0.5)
  relief: 2.0,             // ckRelief
  gap: 0.02,               // ckGap
  roundness: 0.5,          // ckRoundness
};

type Vec3 = [number, number, number];
const lift = (theta: number, t: number, r: number): Vec3 => [r * Math.cos(theta), t * DIMS.H, r * Math.sin(theta)];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** squared point→triangle distance (Ericson). */
function distPtTri2(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const q = add(a, ab, v); const d = sub(p, q); return dot(d, d); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const q = add(a, ac, w); const d = sub(p, q); return dot(d, d); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const q = add(b, sub(c, b), w); const d = sub(p, q); return dot(d, d); }
  const denom = 1 / (va + vb + vc); const v = vb * denom, w = vc * denom;
  const q: Vec3 = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  const d = sub(p, q); return dot(d, d);
}

/** Build a double-valued wall from a segment over N samples; Hausdorff to its ruled face. */
function wallHausdorff(seg: CliffSegment, N: number, M: number): number {
  const up: Vec3[] = [], lo: Vec3[] = [];
  for (let s = 0; s < N; s++) {
    const f = s / (N - 1); const { u, t } = seg.at(f); const { upper, lower } = seg.lipsAt(f);
    up.push(lift(u, t, upper)); lo.push(lift(u, t, lower));
  }
  const tris: [Vec3, Vec3, Vec3][] = [];
  for (let s = 0; s + 1 < N; s++) { tris.push([up[s], up[s + 1], lo[s + 1]]); tris.push([up[s], lo[s + 1], lo[s]]); }
  let maxD = 0;
  for (let j = 0; j <= M; j++) {
    const f = j / M; const { u, t } = seg.at(f); const { upper, lower } = seg.lipsAt(f);
    for (const lam of [0, 0.5, 1]) {
      const p = lift(u, t, lower + (upper - lower) * lam);
      let best = Infinity;
      for (const [a, b, c] of tris) { const dd = distPtTri2(p, a, b, c); if (dd < best) best = dd; }
      maxD = Math.max(maxD, Math.sqrt(best));
    }
  }
  return maxD;
}

/** distinct radius levels around a small ring at (theta,t) in the production field. */
function ringLevels(rA: (th: number, z: number) => number, theta: number, t: number, rhoTheta: number, rhoT: number): number {
  const NA = 360; const vals: number[] = [];
  for (let k = 0; k < NA; k++) { const phi = TAU * (k / NA); vals.push(rA(theta + rhoTheta * Math.cos(phi), (t + rhoT * Math.sin(phi)) * DIMS.H)); }
  vals.sort((a, b) => a - b);
  const lv: number[] = [];
  for (const v of vals) if (!lv.length || v - lv[lv.length - 1] > 0.03) lv.push(v);
  return lv.length;
}

describe('celticKnotCliffComplex (P1 declaration)', () => {
  it('emits a deterministic, non-empty ribbon-background complex with the declared jump', () => {
    const a = buildCelticKnotCliffComplex(PARAMS, DIMS);
    const b = buildCelticKnotCliffComplex(PARAMS, DIMS);
    expect(a.segments.length).toBeGreaterThan(0);
    expect(a.junctions.length).toBeGreaterThan(0);
    expect(a.jumpMm).toBeCloseTo(PARAMS.relief * 0.3, 9);
    expect(a.segments.every((s) => s.kind === 'ribbon-background')).toBe(true);
    // purity: identical sampled geometry on a second call
    expect(b.segments.length).toBe(a.segments.length);
    const pa = a.segments[0].at(0.5), pb = b.segments[0].at(0.5);
    expect(pb.u).toBe(pa.u); expect(pb.t).toBe(pa.t);
    expect(b.segments[0].lipsAt(0.5).upper).toBe(a.segments[0].lipsAt(0.5).upper);
  });

  it('segment lips equal the production one-sided surface limits (watertight weld)', () => {
    const rA = buildAnalyticRadiusFn('CelticKnot', {}, DIMS);
    const cx = buildCelticKnotCliffComplex(PARAMS, DIMS);
    const dU = 1e-5;
    let validated = 0, tested = 0, worst = 0;
    for (const seg of cx.segments) {
      for (let k = 0; k <= 40; k++) {
        const f = k / 40; const { u, t } = seg.at(f); const { upper, lower } = seg.lipsAt(f);
        const z = t * DIMS.H;
        const rIn = rA(u - seg.side * dU, z);  // toward the ribbon centerline
        const rOut = rA(u + seg.side * dU, z); // toward background
        tested++;
        if (Math.abs((rIn - rOut) - cx.jumpMm) < 0.02) {
          validated++;
          worst = Math.max(worst, Math.abs(rIn - upper), Math.abs(rOut - lower));
        }
      }
    }
    expect(validated / tested).toBeGreaterThan(0.5); // most of the declared curve is a genuine cliff
    expect(worst).toBeLessThan(3e-3);                // lips == the one-sided limits
  });

  it('every junction pinches to the shared {r0, r0-jump} double-vertex', () => {
    const rA = buildAnalyticRadiusFn('CelticKnot', {}, DIMS);
    const cx = buildCelticKnotCliffComplex(PARAMS, DIMS);
    const rhoTheta = 0.003 * PARAMS.strandWidth * TAU / (2 * PARAMS.columnCount);
    const rhoT = 0.003 * PARAMS.strandWidth;
    for (const j of cx.junctions) {
      const r0 = baseRadius(j.t * DIMS.H, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1, {});
      // analytic pinch vertex
      expect(j.pinch.upper).toBeCloseTo(r0, 5);
      expect(j.pinch.lower).toBeCloseTo(r0 - cx.jumpMm, 5);
      // production field collapses to exactly 2 levels at the junction (the proven pinch)
      expect(ringLevels(rA, j.u, j.t, rhoTheta, rhoT)).toBe(2);
    }
  });

  it('a double-valued wall built from a segment chords <0.01mm to its ruled face', () => {
    const cx = buildCelticKnotCliffComplex(PARAMS, DIMS);
    const outer = cx.segments.find((s) => s.kind === 'ribbon-background');
    expect(outer).toBeDefined();
    const err = wallHausdorff(outer as CliffSegment, 256, 1200);
    expect(err).toBeLessThan(0.01);
  });

  // ---- P1-remainder: internal occlusion segments (z-buffer over/under step) ----
  it('emits occlusion segments — the internal ribbon↔ribbon over/under step', () => {
    const rA = buildAnalyticRadiusFn('CelticKnot', {}, DIMS);
    const cx = buildCelticKnotCliffComplex(PARAMS, DIMS, rA);
    const occ = cx.segments.filter((s) => s.kind === 'occlusion');
    expect(occ.length).toBeGreaterThan(0);
    // an occlusion wall is ribbon-to-ribbon: lower lip sits at the over-strand foot
    // r0 (NOT the background r0−jump), upper lip is the raised under-strand surface.
    for (const seg of occ) {
      const mid = seg.lipsAt(0.5);
      const r0 = baseRadius(seg.at(0.5).t * DIMS.H, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1, {});
      expect(mid.lower).toBeCloseTo(r0, 4);            // over-strand foot, not background
      expect(mid.upper).toBeGreaterThan(mid.lower + 0.05); // a real raised step
    }
  });

  it('occlusion lips equal the production one-sided limits (ribbon↔ribbon weld)', () => {
    const rA = buildAnalyticRadiusFn('CelticKnot', {}, DIMS);
    const cx = buildCelticKnotCliffComplex(PARAMS, DIMS, rA);
    const occ = cx.segments.filter((s) => s.kind === 'occlusion');
    const dU = 1e-5;
    let validated = 0, tested = 0, worst = 0;
    for (const seg of occ) {
      for (let k = 0; k <= 30; k++) {
        const f = k / 30; const { u, t } = seg.at(f); const { upper, lower } = seg.lipsAt(f);
        const z = t * DIMS.H;
        const rIn = rA(u - seg.side * dU, z);  // inside the over-strand band → over foot ≈ lower
        const rOut = rA(u + seg.side * dU, z); // outside → raised under-strand ≈ upper
        tested++;
        if (rOut - rIn > 0.05 && rOut > lower + 0.02) { // a genuine step UP to a ribbon
          validated++;
          worst = Math.max(worst, Math.abs(rIn - lower), Math.abs(rOut - upper));
        }
      }
    }
    expect(validated / tested).toBeGreaterThan(0.3);
    expect(worst).toBeLessThan(0.02);
  });

  it('occlusion walls taper toward the diamond-corner pinch (peak mid, small at ends)', () => {
    const rA = buildAnalyticRadiusFn('CelticKnot', {}, DIMS);
    const cx = buildCelticKnotCliffComplex(PARAMS, DIMS, rA);
    const occ = cx.segments.filter((s) => s.kind === 'occlusion');
    for (const seg of occ) {
      const h = (f: number): number => seg.lipsAt(f).upper - seg.lipsAt(f).lower;
      const hMid = h(0.5);
      const hEnd = Math.max(h(0), h(1));
      expect(hMid).toBeGreaterThan(0.1);   // a real wall mid-diamond
      expect(hMid).toBeGreaterThan(hEnd);  // tapers toward the corner pinches
    }
  });
});
