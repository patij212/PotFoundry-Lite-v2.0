// s117VisBarKernel.test.ts — S117 P5. THE VISIBILITY KERNEL, VALIDATED TWO-SIDED BEFORE ANY MESH NUMBER.
//
// The kernel converts an ADJACENT-FACET DIHEDRAL into the thing a viewer actually detects: the WEBER
// CONTRAST of the shading step across the shared edge. It is the quantity the campaign's inherited 45 deg
// bar was standing in for and never checked against.
//
// FLOORS AS WELL AS CEILINGS everywhere (feedback_one_sided_bars_are_vacuous): a kernel that returns 0
// for everything would satisfy any "<= threshold" assertion, so every case that must be VISIBLE asserts a
// lower bound too.
//
//   npx vitest run --config vitest.s117visbar.config.ts
import { describe, it, expect } from 'vitest';
import {
  lumLambert, weber, contrastOfPair, dihedralForContrast, rotAboutAxis, prismDihedralRad,
  CLAY_SH, contrastClay,
} from './s117VisBarKernel';

const DEG = 180 / Math.PI;

describe('S117 P5 — luminance and contrast primitives', () => {
  it('Lambert luminance hits its floor and its ceiling exactly', () => {
    expect(lumLambert(1, 0.12)).toBeCloseTo(1, 15);
    expect(lumLambert(0, 0.12)).toBeCloseTo(0.12, 15);
    expect(lumLambert(-0.5, 0.12)).toBeCloseTo(0.12, 15); // clamped, not negative
    expect(lumLambert(0.5, 0)).toBeCloseTo(0.5, 15);
  });

  it('Weber contrast is 0 for equal luminances and 2 for a black/white step', () => {
    expect(weber(0.4, 0.4)).toBe(0);
    expect(weber(1, 0)).toBeCloseTo(2, 15);   // |1-0| / 0.5 = 2, the definitional max
    expect(weber(0.51, 0.49)).toBeCloseTo(0.04, 12);
  });
});

describe('S117 P5 — contrastOfPair is EXACT, not a small-angle approximation', () => {
  // Two facets sharing an edge along +z, normals symmetric about +x, half-angle delta/2.
  const pairAbout = (dihRad: number): { n1: [number, number, number]; n2: [number, number, number] } => {
    const h = dihRad / 2;
    return { n1: [Math.cos(h), Math.sin(h), 0], n2: [Math.cos(h), -Math.sin(h), 0] };
  };

  it('agrees with the direct Lambert evaluation at 30 arbitrary dihedrals and view directions', () => {
    const a = 0.12;
    let maxErr = 0; let sawNonZero = 0;
    for (let i = 1; i <= 30; i += 1) {
      const dih = (i * 5.7) / DEG;                 // 5.7 .. 171 deg
      const { n1, n2 } = pairAbout(dih);
      const th = (i * 11.3) / DEG; const ph = (i * 7.1) / DEG;
      const d: [number, number, number] = [Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)];
      const lam1 = n1[0] * d[0] + n1[1] * d[1] + n1[2] * d[2];
      const lam2 = n2[0] * d[0] + n2[1] * d[1] + n2[2] * d[2];
      if (lam1 <= 0 || lam2 <= 0) continue;        // pair not both front-facing: kernel returns NaN
      const direct = weber(lumLambert(lam1, a), lumLambert(lam2, a));
      const got = contrastOfPair(n1, n2, d, a);
      maxErr = Math.max(maxErr, Math.abs(got - direct));
      if (direct > 1e-6) sawNonZero += 1;
    }
    expect(sawNonZero).toBeGreaterThan(5);          // FLOOR: the sweep actually exercised the kernel
    expect(maxErr).toBeLessThan(1e-14);
  });

  it('returns NaN when either facet of the pair is back-facing (a crease you cannot see both sides of)', () => {
    const { n1, n2 } = pairAbout(120 / DEG);
    const d: [number, number, number] = [0, 1, 0];  // n2 . d < 0
    expect(Number.isNaN(contrastOfPair(n1, n2, d, 0.12))).toBe(true);
  });

  it('*** THE SAME DIHEDRAL SPANS >= 30x IN CONTRAST ACROSS VIEW DIRECTIONS *** (H4 fixture)', () => {
    const a = 0.12;
    const { n1, n2 } = pairAbout(2 / DEG);          // a fixed 2 deg crease
    let lo = Infinity; let hi = 0;
    for (let i = 0; i < 2000; i += 1) {
      const th = ((i / 2000) * 180 - 90) / DEG;     // rotate the headlight in the plane of the pair
      const d: [number, number, number] = [Math.cos(th), Math.sin(th), 0];
      const c = contrastOfPair(n1, n2, d, a);
      if (!Number.isFinite(c) || c <= 0) continue;
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    expect(lo).toBeGreaterThan(0);                  // FLOOR
    expect(hi / lo).toBeGreaterThan(30);
  });
});

describe('S117 P5 — dihedralForContrast inverts contrastOfPair exactly', () => {
  it('round-trips to 1e-12 rad over a decade of contrasts and orientations', () => {
    const a = 0.12;
    let n = 0; let maxErr = 0;
    for (let i = 1; i <= 40; i += 1) {
      const dih = (i * 0.37) / DEG;                 // 0.37 .. 14.8 deg
      const h = dih / 2;
      const n1: [number, number, number] = [Math.cos(h), Math.sin(h), 0];
      const n2: [number, number, number] = [Math.cos(h), -Math.sin(h), 0];
      const th = (i * 3.3 - 40) / DEG;
      const d: [number, number, number] = [Math.cos(th), Math.sin(th), 0];
      const lam1 = n1[0] * d[0] + n1[1] * d[1];
      const lam2 = n2[0] * d[0] + n2[1] * d[1];
      if (lam1 <= 0 || lam2 <= 0) continue;
      const C = contrastOfPair(n1, n2, d, a);
      if (!(C > 0)) continue;
      // uHat = (n1-n2)/|n1-n2|; lamMean = (lam1+lam2)/2
      const ux = n1[0] - n2[0]; const uy = n1[1] - n2[1];
      const ul = Math.hypot(ux, uy);
      const cosPsi = (ux / ul) * d[0] + (uy / ul) * d[1];
      const back = dihedralForContrast(C, a, (lam1 + lam2) / 2, cosPsi);
      maxErr = Math.max(maxErr, Math.abs(back - dih));
      n += 1;
    }
    expect(n).toBeGreaterThan(20);                  // FLOOR: the loop ran
    expect(maxErr).toBeLessThan(1e-12);
  });
});

describe('S117 P5 — prism fixture: dihedral is exactly 360/N (V1)', () => {
  it('reports 360/N to 1e-12 rad for N = 6..720, with a non-zero floor', () => {
    for (const N of [6, 12, 24, 48, 96, 180, 360, 720]) {
      const got = prismDihedralRad(N);
      expect(got).toBeGreaterThan(0);
      expect(Math.abs(got - (2 * Math.PI) / N)).toBeLessThan(1e-12);
    }
  });
});

describe('S117 P5 — rotAboutAxis is a rotation (used to build fold fixtures)', () => {
  it('preserves length and produces the requested angle', () => {
    const v: [number, number, number] = [1, 0, 0];
    const ax: [number, number, number] = [0, 0, 1];
    const r = rotAboutAxis(v, ax, Math.PI / 3);
    expect(Math.hypot(r[0], r[1], r[2])).toBeCloseTo(1, 14);
    expect(Math.acos(v[0] * r[0] + v[1] * r[1] + v[2] * r[2])).toBeCloseTo(Math.PI / 3, 12);
  });
});

describe('S117 P5 — the clay shading law is the RENDERER\'s, verbatim (V2 half 1)', () => {
  it('matches s116Render sh = 0.12 + 0.88*lam^0.85 at its endpoints and midpoint', () => {
    expect(CLAY_SH(0)).toBeCloseTo(0.12, 15);
    expect(CLAY_SH(1)).toBeCloseTo(1.0, 15);
    expect(CLAY_SH(0.5)).toBeCloseTo(0.12 + 0.88 * Math.pow(0.5, 0.85), 15);
  });

  it('contrastClay is the Weber contrast of the RENDERER\'s 8-bit grey, floor and ceiling', () => {
    // identical facets => 0 ; a 90 deg fold seen head-on by one side => large
    const n: [number, number, number] = [0, 0, 1];
    expect(contrastClay(n, n, [0, 0, 1])).toBe(0);
    const n1: [number, number, number] = [0, 0, 1];
    const n2: [number, number, number] = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const c = contrastClay(n1, n2, [0, 0, 1]);
    expect(c).toBeGreaterThan(0.2);
    expect(c).toBeLessThan(2);
  });
});
