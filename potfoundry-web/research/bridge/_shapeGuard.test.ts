// _shapeGuard.test.ts — unit tests for the SHAPE TERM's pure arithmetic. Gated PF_SHAPE=1.
//
// These are the pieces the driver's guard is built out of, tested against values that can be checked BY
// HAND. The point is the one the sag-ruler lesson keeps making in this lab: a guard whose metric has never
// been validated is not a guard, it is a second opinion of unknown quality. Every expectation below is
// either a closed-form number or an identity with research/tools/_bladeCensus.mjs.
import { describe, it, expect } from 'vitest';
import { aspect3, signedAreaParam, chordParam, chordFractionOf, dThShort, type LiftedPoint } from './_shapeGuard';

const RUN = process.env.PF_SHAPE === '1';
const TWO_PI = 2 * Math.PI;

describe('shape guard arithmetic', () => {
  it.runIf(RUN)('aspect3 reproduces the closed-form AR of reference triangles', () => {
    // EQUILATERAL, side 1: perimeter 3, area sqrt(3)/4, L 1  =>  AR = 3 / (4 * 0.4330127) = 1.7320508
    const h = Math.sqrt(3) / 2;
    expect(aspect3(0, 0, 0, 1, 0, 0, 0.5, h, 0)).toBeCloseTo(Math.sqrt(3), 12);
    // RIGHT-ISOSCELES (the initial grid's own cell shape), legs 1: AR = sqrt(2)*(2+sqrt(2)) / (4*0.5)
    const expected = (Math.SQRT2 * (2 + Math.SQRT2)) / 2;
    expect(aspect3(0, 0, 0, 1, 0, 0, 0, 1, 0)).toBeCloseTo(expected, 12);
    // SCALE INVARIANCE — the property that lets ONE constant serve edges from 1.9 um to 8 mm.
    for (const s of [1e-4, 1e-2, 1, 137]) {
      expect(aspect3(0, 0, 0, s, 0, 0, 0, s, 0)).toBeCloseTo(expected, 10);
    }
    // A "CAP" BLADE: base 1, altitude 1/500 over its middle. AR ~ base/altitude for a thin triangle.
    const cap = aspect3(0, 0, 0, 1, 0, 0, 0.5, 1 / 500, 0);
    expect(cap).toBeGreaterThan(400); expect(cap).toBeLessThan(600);
    // A "NEEDLE" BLADE: two vertices nearly coincident, third far away.
    const needle = aspect3(0, 0, 0, 1e-6, 0, 0, 0, 1, 0);
    expect(needle).toBeGreaterThan(1e5);
    // EXACTLY DEGENERATE => Infinity, so a `> cap` test refuses it rather than dividing by zero.
    expect(aspect3(0, 0, 0, 1, 0, 0, 2, 0, 0)).toBe(Infinity);
    // ROTATION/TRANSLATION INVARIANCE in 3-D (the guard scores facets in world space, not in a plane).
    const c = Math.cos(0.7); const s7 = Math.sin(0.7);
    const rot = (x: number, y: number, z: number): [number, number, number] => [x * c - z * s7 + 3, y - 2, x * s7 + z * c + 11];
    const [a1, a2, a3] = rot(0, 0, 0); const [b1, b2, b3] = rot(1, 0, 0); const [c1, c2, c3] = rot(0, 1, 0);
    expect(aspect3(a1, a2, a3, b1, b2, b3, c1, c2, c3)).toBeCloseTo(expected, 10);
  });

  it.runIf(RUN)('aspect3 is IDENTICAL to _bladeCensus.mjs on random facets (the whole point of the metric)', () => {
    // The census's body, transcribed, scoring the same facets. If these ever diverge the guard's contract
    // ("after the fix the census's blade count is 0") is unfalsifiable, so it is pinned here.
    const censusAR = (v: number[]): number => {
      const e0 = Math.hypot(v[3] - v[0], v[4] - v[1], v[5] - v[2]);
      const e1 = Math.hypot(v[6] - v[3], v[7] - v[4], v[8] - v[5]);
      const e2 = Math.hypot(v[0] - v[6], v[1] - v[7], v[2] - v[8]);
      const ux = v[3] - v[0]; const uy = v[4] - v[1]; const uz = v[5] - v[2];
      const wx = v[6] - v[0]; const wy = v[7] - v[1]; const wz = v[8] - v[2];
      const nl = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      const area = 0.5 * nl;
      const per = e0 + e1 + e2;
      const L = Math.max(e0, e1, e2);
      return area > 0 ? (L * per) / (4 * area) : Infinity;
    };
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let n = 0;
    for (let i = 0; i < 20000; i += 1) {
      // deliberately includes near-degenerate cases: one vertex is pulled onto the opposite edge.
      const v = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), 0, 0, 0];
      const lam = rnd();
      const squash = i % 3 === 0 ? 10 ** (-1 - 6 * rnd()) : 1;
      v[6] = v[0] + (v[3] - v[0]) * lam + squash * (rnd() - 0.5);
      v[7] = v[1] + (v[4] - v[1]) * lam + squash * (rnd() - 0.5);
      v[8] = v[2] + (v[5] - v[2]) * lam + squash * (rnd() - 0.5);
      expect(Object.is(aspect3(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]), censusAR(v))).toBe(true);
      n += 1;
    }
    expect(n).toBe(20000);
  });

  it.runIf(RUN)('signedAreaParam detects a (theta,z) fold, and is seam-safe', () => {
    // CCW in (theta,z) => positive; swapping two corners flips the sign.
    expect(signedAreaParam(0, 0, 0.1, 0, 0, 0.1)).toBeGreaterThan(0);
    expect(signedAreaParam(0, 0, 0, 0.1, 0.1, 0)).toBeLessThan(0);
    // ACROSS THE SEAM: the same triangle written at theta ~ 2pi and at theta ~ 0 must agree in sign, which
    // is what shortest-arc deltas buy. A naive (thB - thA) would report the mirror.
    const eps = 1e-3;
    const near0 = signedAreaParam(TWO_PI - eps, 0, eps, 0, TWO_PI - eps, 0.1);
    const shifted = signedAreaParam(-eps, 0, eps, 0, -eps, 0.1);
    expect(Math.sign(near0)).toBe(Math.sign(shifted));
    expect(near0).toBeCloseTo(shifted, 12);
    // A CHILD OF A SPLIT CANNOT FLIP IN EXACT ARITHMETIC: area(a,m,c) = t * area(a,b,c) for m on ab.
    const parent = signedAreaParam(0, 0, 1, 0, 0, 1);
    for (const t of [0.05, 0.5, 0.95]) {
      const child = signedAreaParam(0, 0, t, 0, 0, 1);
      expect(child).toBeCloseTo(t * parent, 12);
      expect(Math.sign(child)).toBe(Math.sign(parent));
    }
    expect(dThShort(TWO_PI - 0.01, 0.01)).toBeCloseTo(0.02, 12);
  });

  it.runIf(RUN)('chordParam removes the off-centre bias the diagnosis measured', () => {
    // A LIFTED EDGE WITH RELIEF. r(s) = 1 + A*s^2 makes the lifted curve's 3-D chord fraction at the
    // PARAMETRIC midpoint drift away from 0.5 — the same mechanism as 1.5 mm relief on a 40 mm pot.
    const A = 0.9;
    const lift = (s: number): LiftedPoint => {
      const th = s * 0.6; const r = 1 + A * s * s;
      return { x: r * Math.cos(th), y: r * Math.sin(th), z: 0, th };
    };
    const a = lift(0); const b = lift(1);
    const pMid = lift(0.5);
    const fracBefore = chordFractionOf(pMid.x, pMid.y, pMid.z, a.x, a.y, a.z, b.x, b.y, b.z);
    expect(Math.abs(fracBefore - 0.5)).toBeGreaterThan(0.05); // the bias is real on this fixture
    const s = chordParam(lift, a.x, a.y, a.z, b.x, b.y, b.z, 0.5, 40);
    const p = lift(s);
    const fracAfter = chordFractionOf(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z);
    expect(fracAfter).toBeCloseTo(0.5, 9);         // ... and it is gone
    expect(Math.abs(fracAfter - 0.5)).toBeLessThan(Math.abs(fracBefore - 0.5) / 100);
    // NON-HALF FRACTIONS (the nudge ladder's rungs) land where they were asked to.
    for (const f of [0.15, 0.35, 0.72, 0.85]) {
      const q = lift(chordParam(lift, a.x, a.y, a.z, b.x, b.y, b.z, f, 40));
      expect(chordFractionOf(q.x, q.y, q.z, a.x, a.y, a.z, b.x, b.y, b.z)).toBeCloseTo(f, 8);
    }
    // ON A STRAIGHT EDGE the solver must be the IDENTITY on 0.5 — no free movement, ever.
    const line = (u: number): LiftedPoint => ({ x: 3 * u, y: 4 * u, z: 12 * u, th: 0 });
    expect(chordParam(line, 0, 0, 0, 3, 4, 12, 0.5, 40)).toBeCloseTo(0.5, 12);
  });

  it.runIf(RUN)('the child-AR amplification law 1/min(t,1-t) is what the guard is bounding', () => {
    // The diagnosis's arithmetic, exercised: split a unit-base triangle of height h at parameter t and
    // watch the worse child's AR against the parent's. This is why a midpoint split of the LONGEST edge is
    // the neutral case and an off-centre split of a SHORT edge is not.
    const h = 0.25;
    const parent = aspect3(0, 0, 0, 1, 0, 0, 0.5, h, 0);
    for (const t of [0.5, 0.12, 0.88]) {
      const worse = Math.max(
        aspect3(0, 0, 0, t, 0, 0, 0.5, h, 0),
        aspect3(t, 0, 0, 1, 0, 0, 0.5, h, 0),
      );
      const amp = worse / parent;
      if (t === 0.5) expect(amp).toBeLessThan(1.6);
      else expect(amp).toBeGreaterThan(1.6);
    }
  });
});
