// research/bridge/_s118EmitAdmit.test.ts — S118. The TRANSCRIPTION PROOF for the emit-time admission core.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS TEST IS THE POINT OF THE MODULE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// `_s118EmitAdmit.ts` is a TRANSCRIPTION of the zero-evaluation core (T1 degeneracy / T2 fold / T3 blade) of
// `src/renderers/webgpu/parametric/conforming/emitInvariant.ts` (S117 P1). The driver may not import `src/`
// — that is a session rule, and a good one: the driver is a research instrument on a fork and an import
// would couple it to a shipping module that another agent may edit underneath it. But a transcription that
// is not proved equal to its original is a SECOND implementation with its own bugs, and every campaign scar
// in this repo is some version of "two copies of the arithmetic drifted".
//
// So the DRIVER does not import src/, and THIS TEST DOES. §BRIDGE below runs both implementations over
// 4,000 randomised triangles — well-shaped, folded, collinear, needle, and non-finite — and asserts that
// `reason`, `qP`, `apSMm2`, `minAltMm` and `a3Mm2` are BIT-IDENTICAL (Object.is, so NaN === NaN and
// -0 !== +0). That is the only statement that makes "transcribed" mean something.
import { describe, it, expect } from 'vitest';
import {
  checkS118Admit, makeS118Verdict, unwrapTheta3, S118_DEFENSIBLE,
} from './_s118EmitAdmit';
import { checkEmitInvariant, makeEmitVerdict } from '../../src/renderers/webgpu/parametric/conforming/emitInvariant';

/** Lift a (theta, z) point onto a cylinder of radius r — the driver's own lift with rA = const. */
const lift = (th: number, z: number, r: number): [number, number, number] => [r * Math.cos(th), r * Math.sin(th), z];

describe('S118 emit-admission core — the three zero-evaluation terms', () => {
  it('accepts a well-shaped triangle and reports qP near 3 for an arc-space equilateral', () => {
    const R = 45;
    // equilateral of side L in ARC space (rbar*theta, z), centred so rbar === R exactly
    const L = 1.0;
    const A = lift(-L / (2 * R), 0, R);
    const B = lift(L / (2 * R), 0, R);
    const C = lift(0, (L * Math.sqrt(3)) / 2, R);
    const v = checkS118Admit(
      A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2],
      -L / (2 * R), L / (2 * R), 0,
      { sigma: 1, tauQ: 0.005, minAltMm: 2e-3 },
    );
    expect(v.ok).toBe(true);
    expect(v.reason).toBe('ok');
    expect(v.qP).toBeGreaterThan(2.9);
    expect(v.qP).toBeLessThan(3.1);
  });

  it('T2 refuses the SAME triangle wound the other way, and calls it a fold not a degeneracy', () => {
    const R = 45;
    const L = 1.0;
    const A = lift(-L / (2 * R), 0, R);
    const B = lift(L / (2 * R), 0, R);
    const C = lift(0, (L * Math.sqrt(3)) / 2, R);
    // swap B and C -> reversed winding
    const v = checkS118Admit(
      A[0], A[1], A[2], C[0], C[1], C[2], B[0], B[1], B[2],
      -L / (2 * R), 0, L / (2 * R),
      { sigma: 1, tauQ: 0.005, minAltMm: 2e-3 },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('fold');
  });

  it('T1 refuses a COLLINEAR parameter triangle as degenerate, before T2 can call it a fold', () => {
    const R = 45;
    const A = lift(0, 0, R); const B = lift(0.01, 0.45, R); const C = lift(0.02, 0.9, R);
    const v = checkS118Admit(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], 0, 0.01, 0.02,
      { sigma: 1, tauQ: 0.005, minAltMm: 0 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('degenerate');
  });

  it('T3 is an ABSOLUTE bar: a 1 um needle passes at bar 0 and is refused at bar 2 um', () => {
    const R = 45;
    // base 2 mm of arc along z, apex offset 1 um of arc in theta => minAlt = 1 um
    const dth = 1e-3 / R;
    const A = lift(0, 0, R); const B = lift(0, 2, R); const C = lift(dth, 1, R);
    const off = checkS118Admit(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], 0, 0, dth,
      { sigma: -1, tauQ: 0, minAltMm: 0 });
    expect(off.reason).toBe('ok');
    expect(off.minAltMm).toBeGreaterThan(0.9e-3);
    expect(off.minAltMm).toBeLessThan(1.1e-3);
    const on = checkS118Admit(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], 0, 0, dth,
      { sigma: -1, tauQ: 0, minAltMm: 2e-3 });
    expect(on.ok).toBe(false);
    expect(on.reason).toBe('blade');
  });

  it('a triangle with ZERO 3-D area is degenerate even when its parameter footprint is fat', () => {
    // three points at the same 3-D location but different declared theta — the weld pathology
    const v = checkS118Admit(1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.1, 0.2, S118_DEFENSIBLE);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('degenerate');
  });

  it('a NON-FINITE coordinate is degenerate, never ok', () => {
    const v = checkS118Admit(0, 0, 0, 1, 0, 0, 0, Number.NaN, 1, 0, 0.1, 0.2, S118_DEFENSIBLE);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('degenerate');
  });

  it('reuses a scratch verdict without leaving a stale field from the previous call', () => {
    const scratch = makeS118Verdict();
    const R = 45;
    const L = 1.0;
    const A = lift(-L / (2 * R), 0, R);
    const B = lift(L / (2 * R), 0, R);
    const C = lift(0, (L * Math.sqrt(3)) / 2, R);
    // first: an OK triangle, so every scalar holds a live value
    const r1 = checkS118Admit(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2],
      -L / (2 * R), L / (2 * R), 0, S118_DEFENSIBLE, scratch);
    expect(r1).toBe(scratch);
    expect(scratch.ok).toBe(true);
    const okQ = scratch.qP;
    // second: an exactly degenerate one through the SAME scratch — every scalar must be rewritten
    checkS118Admit(1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.1, 0.2, S118_DEFENSIBLE, scratch);
    expect(scratch.ok).toBe(false);
    expect(scratch.reason).toBe('degenerate');
    expect(scratch.a3Mm2).toBe(0);
    expect(scratch.qP).not.toBe(okQ);
  });
});

describe('S118 unwrapTheta3 — the seam', () => {
  it('unwraps a seam-spanning triple onto one branch anchored at A', () => {
    const [a, b, c] = unwrapTheta3(6.28, 0.01, 6.27);
    expect(a).toBe(6.28);
    expect(b).toBeGreaterThan(6.2);        // 0.01 must come back as ~6.293, not 0.01
    expect(Math.abs(b - 6.2932)).toBeLessThan(1e-3);
    expect(c).toBeCloseTo(6.27, 12);
  });

  it('is the identity on a triple that is already on one branch', () => {
    const [a, b, c] = unwrapTheta3(1.0, 1.1, 0.9);
    expect(a).toBe(1.0);
    expect(b).toBeCloseTo(1.1, 15);
    expect(c).toBeCloseTo(0.9, 15);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// §BRIDGE — THE TRANSCRIPTION PROOF
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('S118 §BRIDGE — bit-identical to src/ emitInvariant on the zero-evaluation core', () => {
  it('agrees on reason and all four scalars over 4,000 randomised triangles', () => {
    // deterministic LCG so a failure is reproducible
    let s = 0x2f6e2b1;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const mine = makeS118Verdict();
    const theirs = makeEmitVerdict();
    let nFold = 0; let nDeg = 0; let nBlade = 0; let nOk = 0;
    for (let i = 0; i < 4000; i += 1) {
      const R = 30 + 30 * rnd();
      // theta spans from 1e-9 (needle) to 0.2 rad (fat) so every class is populated
      const scale = 10 ** (-9 + 8.5 * rnd());
      const th0 = -Math.PI + 2 * Math.PI * rnd();
      const th1 = th0 + scale * (rnd() - 0.5);
      const th2 = th0 + scale * (rnd() - 0.5);
      const z0 = 60 * rnd(); const z1 = z0 + 2 * (rnd() - 0.5); const z2 = z0 + 2 * (rnd() - 0.5);
      let ax = R * Math.cos(th0); let ay = R * Math.sin(th0);
      const bx = R * Math.cos(th1); const by = R * Math.sin(th1);
      const cx = R * Math.cos(th2); const cy = R * Math.sin(th2);
      if (i % 97 === 0) { ax = bx; ay = by; }                 // plant an exactly degenerate 3-D triangle
      const opts = { sigma: (i % 2 === 0 ? 1 : -1) as 1 | -1, tauQ: 0.005, minAltMm: 2e-3 };
      checkS118Admit(ax, ay, z0, bx, by, z1, cx, cy, z2, th0, th1, th2, opts, mine);
      checkEmitInvariant(ax, ay, z0, bx, by, z1, cx, cy, z2, th0, th1, th2, opts, theirs);
      expect(mine.reason).toBe(theirs.reason);
      expect(mine.ok).toBe(theirs.ok);
      expect(Object.is(mine.qP, theirs.qP)).toBe(true);
      expect(Object.is(mine.apSMm2, theirs.apSMm2)).toBe(true);
      expect(Object.is(mine.minAltMm, theirs.minAltMm)).toBe(true);
      expect(Object.is(mine.a3Mm2, theirs.a3Mm2)).toBe(true);
      if (mine.reason === 'fold') nFold += 1;
      else if (mine.reason === 'degenerate') nDeg += 1;
      else if (mine.reason === 'blade') nBlade += 1;
      else nOk += 1;
    }
    // A bridge test that only ever exercised one branch would be vacuous — assert every class fired.
    expect(nOk).toBeGreaterThan(50);
    expect(nFold).toBeGreaterThan(50);
    expect(nDeg).toBeGreaterThan(10);
    expect(nBlade).toBeGreaterThan(50);
  });
});
