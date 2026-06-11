/**
 * PullbackMetric.test.ts — closed-form pins for the warp-composed pullback
 * sampler (Stage-1 Task 1 of the export endgame).
 *
 * The RUNTIME mechanism is finite differences on the composed sampler (the
 * proven `classifyCellCeiling` pattern); these tests pin that FD metric against
 * CLOSED-FORM pullback Jacobians derived by hand, so the composition order and
 * the derivative accessors are verified independently of the production
 * pipeline:
 *
 *  - pure-shear helix u' = u − s·t on the plain cylinder
 *    P(u,t) = (R·cos2πu, R·sin2πu, t·H): Pt' = −s·Pu + Pt ⇒
 *    E' = E = (2πR)², F' = −s·E, G' = s²·E + H².
 *  - piecewise-linear u-warp φ: E' = E(φ(u),t)·φ′², F' = F(φ(u),t)·φ′,
 *    G' = G(φ(u),t) — the base metric is evaluated at the WARPED point φ(u),
 *    not u (invisible on this u-invariant cylinder where F≡0, but load-bearing
 *    on any non-separable surface) — valid INSIDE each linear segment (the FD
 *    stencil must not straddle a kink, hence sampling at segment midpoints).
 *  - piecewise-linear t-warp ψ: G' = G·ψ′², E' = E.
 *  - kink dyadicity (extraction fact #5): `chooseCreaseGrid`/`chooseCreaseTGrid`
 *    anchor sources are exact multiples of 1/2^level, so warp kinks lie ON
 *    dyadic cell boundaries and cell-center FD stencils stay inside one linear
 *    segment of the warp.
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { firstFundamentalForm } from './SurfaceMetricTensor';
import type { UWarp } from './CreaseUWarp';
import { applyUWarp, chooseCreaseGrid } from './CreaseUWarp';
import type { TWarp } from './CreaseTWarp';
import { applyTWarp, chooseCreaseTGrid } from './CreaseTWarp';
import type { HelixWarp } from './CreaseHelixWarp';
import { applyHelixWarp } from './CreaseHelixWarp';
import type { WallWarps } from './PullbackMetric';
import { uWarpDerivative, tWarpDerivative, composedWallSampler } from './PullbackMetric';

/** 2-anchor u-warp: slopes 1.2 on [0,0.25], 1.2 on [0.25,0.5], 0.8 on [0.5,1]. */
const U_WARP_2A: UWarp = {
  isIdentity: false,
  anchors: [
    { source: 0.25, target: 0.3 },
    { source: 0.5, target: 0.6 },
  ],
};
const U_IDENTITY: UWarp = { isIdentity: true, anchors: [] };

/** 1-anchor t-warp: slopes 1.4 on [0,0.5], 0.6 on [0.5,1]. */
const T_WARP_1A: TWarp = {
  isIdentity: false,
  anchors: [{ source: 0.5, target: 0.7 }],
};
const T_IDENTITY: TWarp = { isIdentity: true, anchors: [] };

const HELIX_IDENTITY: HelixWarp = {
  isIdentity: true,
  base: { isIdentity: true, anchors: [] },
  shearRate: 0,
  offset: 0,
};

/** Pure-shear helix (identity base, no offset): u_final = u − s·t. */
const pureShearHelix = (s: number): HelixWarp => ({
  isIdentity: false,
  base: { isIdentity: true, anchors: [] },
  shearRate: s,
  offset: 0,
});

const relErr = (actual: number, expected: number): number =>
  Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-30);

describe('uWarpDerivative / tWarpDerivative — piecewise segment slopes', () => {
  it('identity warps have slope 1 everywhere', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      expect(uWarpDerivative(U_IDENTITY, x)).toBe(1);
      expect(tWarpDerivative(T_IDENTITY, x)).toBe(1);
    }
  });

  it('returns the exact segment slope of the 2-anchor u-warp at segment midpoints', () => {
    // (0.3−0)/(0.25−0)=1.2, (0.6−0.3)/(0.5−0.25)=1.2, (1−0.6)/(1−0.5)=0.8.
    expect(uWarpDerivative(U_WARP_2A, 0.125)).toBeCloseTo(1.2, 10);
    expect(uWarpDerivative(U_WARP_2A, 0.375)).toBeCloseTo(1.2, 10);
    expect(uWarpDerivative(U_WARP_2A, 0.75)).toBeCloseTo(0.8, 10);
  });

  it('returns the RIGHT-segment slope exactly AT a kink (derivative undefined there)', () => {
    expect(uWarpDerivative(U_WARP_2A, 0.5)).toBeCloseTo(0.8, 10); // left slope is 1.2
    expect(tWarpDerivative(T_WARP_1A, 0.5)).toBeCloseTo(0.6, 10); // left slope is 1.4
  });

  it('is periodic in u (φ(u+1)=φ(u)+1 ⇒ φ′ periodic)', () => {
    expect(uWarpDerivative(U_WARP_2A, 1.125)).toBeCloseTo(1.2, 10);
    expect(uWarpDerivative(U_WARP_2A, -0.25)).toBeCloseTo(0.8, 10); // wraps to 0.75
  });

  it('t-warp slopes are interval-clamped with endpoint segments', () => {
    expect(tWarpDerivative(T_WARP_1A, 0.25)).toBeCloseTo(1.4, 10);
    expect(tWarpDerivative(T_WARP_1A, 0.75)).toBeCloseTo(0.6, 10);
    expect(tWarpDerivative(T_WARP_1A, 0)).toBeCloseTo(1.4, 10); // first segment
    expect(tWarpDerivative(T_WARP_1A, 1)).toBeCloseTo(0.6, 10); // last segment
  });
});

describe('composedWallSampler — guard map + pass-through + forwarding', () => {
  it('returns the SAME plain sampler object when every warp is identity', () => {
    const plain = new SyntheticCylinderSampler(50, 120);
    expect(composedWallSampler(plain, {})).toBe(plain);
    const allIdentity: WallWarps = {
      uWarp: U_IDENTITY,
      tWarp: T_IDENTITY,
      helix: HELIX_IDENTITY,
    };
    expect(composedWallSampler(plain, allIdentity)).toBe(plain);
  });

  it('drops a non-identity helix when the u-warp is non-identity (PEC:2604 XOR guard)', () => {
    const plain = new SyntheticCylinderSampler(50, 120);
    const composed = composedWallSampler(plain, {
      uWarp: U_WARP_2A,
      helix: pureShearHelix(0.5),
    });
    // The helix must NOT fire: P_composed(u,t) = plain(φ(u), t), no t-shear.
    for (const [u, t] of [
      [0.2, 0.3],
      [0.6, 0.8],
    ] as const) {
      expect(composed.position(u, t)).toEqual(plain.position(applyUWarp(U_WARP_2A, u), t));
    }
  });

  it('the helix reads the ALREADY-t-warped t (t-warp loop at PEC:2572 precedes the helix loop at :2604)', () => {
    const plain = new SyntheticCylinderSampler(50, 120);
    const helix = pureShearHelix(0.5);
    const composed = composedWallSampler(plain, { tWarp: T_WARP_1A, helix });
    for (const [u, t] of [
      [0.2, 0.3],
      [0.6, 0.8],
    ] as const) {
      const tEff = applyTWarp(T_WARP_1A, t);
      expect(composed.position(u, t)).toEqual(
        plain.position(applyHelixWarp(helix, u, tEff), tEff),
      );
    }
  });

  it('forwards gridResolution from the plain sampler (fact #8 — DEFAULT_H fallback trap)', () => {
    const fake: SurfaceSampler = {
      position: (u: number, t: number): Vec3 => [u, t, 0],
      gridResolution: () => ({ resU: 77, resT: 33 }),
    };
    const composed = composedWallSampler(fake, { uWarp: U_WARP_2A });
    expect(composed).not.toBe(fake);
    expect(composed.gridResolution?.()).toEqual({ resU: 77, resT: 33 });
  });

  it('does NOT invent a gridResolution for an analytic plain sampler', () => {
    const composed = composedWallSampler(new SyntheticCylinderSampler(50, 120), {
      uWarp: U_WARP_2A,
    });
    expect(composed.gridResolution).toBeUndefined();
  });
});

describe('closed-form pullback pins (FD on the composed sampler, 1% relative)', () => {
  const R = 50;
  const H = 120;
  const E = (2 * Math.PI * R) ** 2;
  const G = H * H;
  const plain = new SyntheticCylinderSampler(R, H);

  it('pure-shear helix: E\'=E, F\'=−s·E, G\'=s²E+G on the cylinder', () => {
    const s = 0.5;
    const composed = composedWallSampler(plain, { helix: pureShearHelix(s) });
    for (const [u, t] of [
      [0.1, 0.25],
      [0.45, 0.5],
      [0.8, 0.75],
    ] as const) {
      const m = firstFundamentalForm(composed, u, t, 1e-4, 1e-4);
      expect(relErr(m.E, E)).toBeLessThan(0.01);
      expect(relErr(m.F, -s * E)).toBeLessThan(0.01);
      expect(relErr(m.G, s * s * E + G)).toBeLessThan(0.01);
    }
  });

  it('2-anchor u-warp: E\'=E·φ′², F\'=φ′·F (=0), G\'=G inside each segment', () => {
    const composed = composedWallSampler(plain, { uWarp: U_WARP_2A });
    for (const [uMid, slope] of [
      [0.125, 1.2],
      [0.375, 1.2],
      [0.75, 0.8],
    ] as const) {
      const m = firstFundamentalForm(composed, uMid, 0.5, 1e-4, 1e-4);
      expect(relErr(m.E, E * slope * slope)).toBeLessThan(0.01);
      expect(Math.abs(m.F)).toBeLessThan(1e-6 * E); // separable ⇒ F'=φ′·0=0
      expect(relErr(m.G, G)).toBeLessThan(0.01);
    }
  });

  it('1-anchor t-warp: G\'=G·ψ′², E\'=E inside each segment', () => {
    const composed = composedWallSampler(plain, { tWarp: T_WARP_1A });
    for (const [tMid, slope] of [
      [0.25, 1.4],
      [0.75, 0.6],
    ] as const) {
      const m = firstFundamentalForm(composed, 0.3, tMid, 1e-4, 1e-4);
      expect(relErr(m.G, G * slope * slope)).toBeLessThan(0.01);
      expect(relErr(m.E, E)).toBeLessThan(0.01);
    }
  });
});

describe('kink dyadicity (fact #5 — kinks lie on dyadic cell boundaries)', () => {
  it('every chooseCreaseGrid anchor source is an exact multiple of 1/2^level', () => {
    const choice = chooseCreaseGrid([0.3, 0.62], 3, 6);
    expect(choice.warp.isIdentity).toBe(false); // non-vacuous: a real warp was built
    expect(choice.level).toBeGreaterThan(0);
    for (const anchor of choice.warp.anchors) {
      const g = anchor.source * (1 << choice.level);
      expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-9);
    }
  });

  it('every chooseCreaseTGrid anchor source is an exact multiple of 1/2^level', () => {
    const choice = chooseCreaseTGrid([0.37], 3, 6);
    expect(choice.warp.isIdentity).toBe(false);
    expect(choice.level).toBeGreaterThan(0);
    for (const anchor of choice.warp.anchors) {
      const g = anchor.source * (1 << choice.level);
      expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-9);
    }
  });
});
