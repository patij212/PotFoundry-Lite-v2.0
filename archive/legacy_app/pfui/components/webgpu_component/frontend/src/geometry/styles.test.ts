/**
 * Style Functions Tests
 *
 * Comprehensive tests for the 5 artistic style functions:
 * - SuperformulaBlossom: Gielis superformula petals
 * - FourierBloom: Harmonic blend floral profiles
 * - SpiralRidges: Helical rib patterns
 * - SuperellipseMorph: Circle → square → diamond transitions
 * - HarmonicRipple: Petals + ripples + bell
 *
 * @module geometry/styles.test
 */

import { describe, it, expect } from 'vitest';
import {
  rOuterSuperformulaBlossom,
  rOuterFourierBloom,
  rOuterSpiralRidges,
  rOuterSuperellipseMorph,
  rOuterHarmonicRipple,
  rOuterSuperformulaBlossomVec,
  rOuterFourierBloomVec,
  rOuterSpiralRidgesVec,
  rOuterSuperellipseMorphVec,
  rOuterHarmonicRippleVec,
  STYLE_FUNCTIONS,
  STYLE_FUNCTIONS_VEC,
  STYLE_DESCRIPTIONS,
  getStyleFunction,
  getStyleFunctionVec,
  StyleFunction,
  VectorizedStyleFunction,
} from './styles';
import {
  TAU,
  DEFAULT_SUPERFORMULA,
  DEFAULT_FOURIER,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
} from './types';

// ============================================================================
// Test Constants
// ============================================================================

const TEST_HEIGHT = 100.0;
const TEST_RADIUS = 40.0;
const TOLERANCE = 1e-5;

// Test theta positions
const THETA_0 = 0;
const THETA_45 = Math.PI / 4;
const THETA_90 = Math.PI / 2;
const THETA_180 = Math.PI;

// Test z positions
const Z_BOTTOM = 0;
const Z_MIDDLE = 50;
const Z_TOP = 100;

// ============================================================================
// Superformula Blossom Tests
// ============================================================================

describe('rOuterSuperformulaBlossom', () => {
  it('should return positive radius for all inputs', () => {
    const r = rOuterSuperformulaBlossom(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    expect(r).toBeGreaterThan(0);
  });

  it('should be periodic with period determined by m parameter', () => {
    // Default m at z=0 is mBase (from DEFAULT_SUPERFORMULA)
    const mBase = DEFAULT_SUPERFORMULA.sfMBase;
    const period = TAU / mBase;

    const r1 = rOuterSuperformulaBlossom(0, Z_BOTTOM, TEST_RADIUS, TEST_HEIGHT, {});
    const r2 = rOuterSuperformulaBlossom(period, Z_BOTTOM, TEST_RADIUS, TEST_HEIGHT, {});

    // Should be approximately equal (period repeat)
    expect(Math.abs(r1 - r2)).toBeLessThan(TOLERANCE * TEST_RADIUS);
  });

  it('should scale with base radius', () => {
    const r1 = rOuterSuperformulaBlossom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    const r2 = rOuterSuperformulaBlossom(THETA_45, Z_MIDDLE, TEST_RADIUS * 2, TEST_HEIGHT, {});

    // Should roughly scale linearly (within style modulation)
    expect(r2 / r1).toBeCloseTo(2.0, 0);
  });

  it('should produce different results at different heights', () => {
    const rBot = rOuterSuperformulaBlossom(THETA_45, Z_BOTTOM, TEST_RADIUS, TEST_HEIGHT, {});
    const rMid = rOuterSuperformulaBlossom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    const rTop = rOuterSuperformulaBlossom(THETA_45, Z_TOP, TEST_HEIGHT, TEST_HEIGHT, {});

    // Results should differ due to m interpolation
    expect(rBot).not.toEqual(rMid);
    expect(rMid).not.toEqual(rTop);
  });

  it('should respect custom m parameters', () => {
    const opts1 = { sfMBase: 4, sfMTop: 4 };
    const opts2 = { sfMBase: 8, sfMTop: 8 };

    const r1 = rOuterSuperformulaBlossom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts1);
    const r2 = rOuterSuperformulaBlossom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts2);

    expect(r1).not.toEqual(r2);
  });

  it('should handle zero height gracefully', () => {
    const r = rOuterSuperformulaBlossom(THETA_45, 0, TEST_RADIUS, 0, {});
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });
});

// ============================================================================
// Fourier Bloom Tests
// ============================================================================

describe('rOuterFourierBloom', () => {
  it('should return positive radius for all inputs', () => {
    const r = rOuterFourierBloom(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    expect(r).toBeGreaterThan(0);
  });

  it('should be continuous across theta', () => {
    const step = 0.01;
    let prevR = rOuterFourierBloom(0, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});

    for (let theta = step; theta < TAU; theta += step) {
      const r = rOuterFourierBloom(theta, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
      // Check continuity - change shouldn't be too large
      expect(Math.abs(r - prevR)).toBeLessThan(TEST_RADIUS * 0.1);
      prevR = r;
    }
  });

  it('should blend base and top harmonics based on height', () => {
    // At z=0 (t=0), should be purely base harmonics
    // At z=H (t=1), should be purely top harmonics
    const rBot = rOuterFourierBloom(THETA_45, 0, TEST_RADIUS, TEST_HEIGHT, {});
    const rTop = rOuterFourierBloom(THETA_45, TEST_HEIGHT, TEST_RADIUS, TEST_HEIGHT, {});

    // They should differ due to different harmonic composition
    expect(rBot).not.toEqual(rTop);
  });

  it('should respect strength parameter', () => {
    const optsWeak = { fbStrength: 0.1 };
    const optsStrong = { fbStrength: 1.0 };

    const rWeak = rOuterFourierBloom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsWeak);
    const rStrong = rOuterFourierBloom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsStrong);

    // Weaker strength should be closer to base radius
    const diffWeak = Math.abs(rWeak - TEST_RADIUS);
    const diffStrong = Math.abs(rStrong - TEST_RADIUS);

    expect(diffWeak).toBeLessThan(diffStrong);
  });

  it('should apply wobble modulation', () => {
    const optsNoWobble = { fbWobbleAmp: 0 };
    const optsWobble = { fbWobbleAmp: 0.1, fbWobbleFreq: 3 };

    const r1 = rOuterFourierBloom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsNoWobble);
    const r2 = rOuterFourierBloom(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsWobble);

    // With wobble, result should differ
    expect(r1).not.toEqual(r2);
  });
});

// ============================================================================
// Spiral Ridges Tests
// ============================================================================

describe('rOuterSpiralRidges', () => {
  it('should return positive radius for all inputs', () => {
    const r = rOuterSpiralRidges(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    expect(r).toBeGreaterThan(0);
  });

  it('should create spiral pattern (phase shifts with height)', () => {
    // At the same theta, radius should change with height due to phase shift
    const r1 = rOuterSpiralRidges(THETA_90, Z_BOTTOM, TEST_RADIUS, TEST_HEIGHT, {});
    const r2 = rOuterSpiralRidges(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    const r3 = rOuterSpiralRidges(THETA_90, Z_TOP, TEST_RADIUS, TEST_HEIGHT, {});

    // Pattern should shift with height
    const vals = [r1, r2, r3];
    const unique = new Set(vals.map((v) => v.toFixed(4)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('should have adjustable number of ridges via spiralK', () => {
    const opts4 = { spiralK: 4 };
    const opts8 = { spiralK: 8 };

    // Test periodicity
    const periodK4 = TAU / 4;
    const periodK8 = TAU / 8;

    const rK4_0 = rOuterSpiralRidges(0, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts4);
    const rK4_period = rOuterSpiralRidges(periodK4, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts4);
    const rK8_0 = rOuterSpiralRidges(0, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts8);
    const rK8_period = rOuterSpiralRidges(periodK8, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts8);

    // Should repeat at period
    expect(Math.abs(rK4_0 - rK4_period)).toBeLessThan(TOLERANCE);
    expect(Math.abs(rK8_0 - rK8_period)).toBeLessThan(TOLERANCE);
  });

  it('should have amplitude that varies with height', () => {
    // Default: ampMin at bottom, ampMax at top
    const opts = { spiralAmpMin: 0.02, spiralAmpMax: 0.15 };

    // Measure variation at bottom vs top
    const bottomVals: number[] = [];
    const topVals: number[] = [];

    for (let theta = 0; theta < TAU; theta += 0.1) {
      bottomVals.push(rOuterSpiralRidges(theta, 0, TEST_RADIUS, TEST_HEIGHT, opts));
      topVals.push(rOuterSpiralRidges(theta, TEST_HEIGHT, TEST_RADIUS, TEST_HEIGHT, opts));
    }

    const bottomRange = Math.max(...bottomVals) - Math.min(...bottomVals);
    const topRange = Math.max(...topVals) - Math.min(...topVals);

    // Top should have larger amplitude variation
    expect(topRange).toBeGreaterThan(bottomRange);
  });

  it('should include groove detail', () => {
    const optsNoGroove = { spiralGrooveAmp: 0 };
    const optsGroove = { spiralGrooveAmp: 0.03 };

    const r1 = rOuterSpiralRidges(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsNoGroove);
    const r2 = rOuterSpiralRidges(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsGroove);

    expect(r1).not.toEqual(r2);
  });
});

// ============================================================================
// Superellipse Morph Tests
// ============================================================================

describe('rOuterSuperellipseMorph', () => {
  it('should return positive radius for all inputs', () => {
    const r = rOuterSuperellipseMorph(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    expect(r).toBeGreaterThan(0);
  });

  it('should be 4-fold symmetric for default parameters', () => {
    // Superellipse with cosine terms should have 4-fold symmetry
    const r0 = rOuterSuperellipseMorph(0, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    const r90 = rOuterSuperellipseMorph(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    const r180 = rOuterSuperellipseMorph(THETA_180, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    const r270 = rOuterSuperellipseMorph((3 * Math.PI) / 2, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});

    // All cardinal directions should be similar
    expect(Math.abs(r0 - r90)).toBeLessThan(TOLERANCE * TEST_RADIUS * 10);
    expect(Math.abs(r0 - r180)).toBeLessThan(TOLERANCE * TEST_RADIUS * 10);
    expect(Math.abs(r90 - r270)).toBeLessThan(TOLERANCE * TEST_RADIUS * 10);
  });

  it('should morph shape with height (mExp changes)', () => {
    // Lower mExp = rounder, higher = more angular
    const rBot = rOuterSuperellipseMorph(THETA_45, Z_BOTTOM, TEST_RADIUS, TEST_HEIGHT, {});
    const rTop = rOuterSuperellipseMorph(THETA_45, Z_TOP, TEST_RADIUS, TEST_HEIGHT, {});

    // Results should differ due to mExp interpolation
    expect(rBot).not.toEqual(rTop);
  });

  it('should respect m exponent parameters', () => {
    // High exponent = more angular
    const optsRound = { seMBase: 2.0, seMTop: 2.0 };
    const optsAngular = { seMBase: 4.0, seMTop: 4.0 };

    // At 45 degrees, angular should differ from round
    const rRound = rOuterSuperellipseMorph(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsRound);
    const rAngular = rOuterSuperellipseMorph(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsAngular);

    expect(rRound).not.toEqual(rAngular);
  });

  it('should apply c4 and c8 amplitude modulation', () => {
    const optsNoMod = { seC4Amp: 0, seC8Amp: 0 };
    const optsMod = { seC4Amp: 0.1, seC8Amp: 0.05 };

    const r1 = rOuterSuperellipseMorph(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsNoMod);
    const r2 = rOuterSuperellipseMorph(THETA_45, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsMod);

    expect(r1).not.toEqual(r2);
  });
});

// ============================================================================
// Harmonic Ripple Tests
// ============================================================================

describe('rOuterHarmonicRipple', () => {
  it('should return positive radius for all inputs', () => {
    const r = rOuterHarmonicRipple(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
    expect(r).toBeGreaterThan(0);
  });

  it('should have petal count matching hrPetals parameter', () => {
    const petals = 6;
    const period = TAU / petals;
    const opts = { hrPetals: petals, hrPetalAmp: 0.1, hrRippleAmp: 0 };

    const r0 = rOuterHarmonicRipple(0, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts);
    const rPeriod = rOuterHarmonicRipple(period, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, opts);

    // Should repeat at period
    expect(Math.abs(r0 - rPeriod)).toBeLessThan(TOLERANCE);
  });

  it('should add ripple detail', () => {
    const optsNoRipple = { hrRippleAmp: 0, hrPetalAmp: 0 };
    const optsRipple = { hrRippleAmp: 0.1, hrRippleFreq: 24, hrPetalAmp: 0 };

    // Sample at multiple thetas and find max difference
    let maxDiff = 0;
    for (let i = 0; i < 48; i++) {
      const theta = (i / 48) * TAU;
      const r1 = rOuterHarmonicRipple(theta, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsNoRipple);
      const r2 = rOuterHarmonicRipple(theta, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsRipple);
      maxDiff = Math.max(maxDiff, Math.abs(r2 - r1));
    }

    // With ripple amplitude, there should be measurable difference at some theta
    expect(maxDiff).toBeGreaterThan(0);
  });

  it('should have bell bulge at mid-height', () => {
    const opts = { hrBell: 0.1, hrPetalAmp: 0, hrRippleAmp: 0 };

    const rBot = rOuterHarmonicRipple(THETA_90, 0, TEST_RADIUS, TEST_HEIGHT, opts);
    const rMid = rOuterHarmonicRipple(THETA_90, TEST_HEIGHT / 2, TEST_RADIUS, TEST_HEIGHT, opts);
    const rTop = rOuterHarmonicRipple(THETA_90, TEST_HEIGHT, TEST_RADIUS, TEST_HEIGHT, opts);

    // Mid-height should have largest radius due to bell
    expect(rMid).toBeGreaterThan(rBot);
    expect(rMid).toBeGreaterThan(rTop);
  });

  it('should shift pattern with z-gain parameters', () => {
    const optsNoZgain = { hrPetalZgain: 0, hrRippleZgain: 0 };
    const optsZgain = { hrPetalZgain: 1.0, hrRippleZgain: 0.5 };

    // With z-gain, pattern should rotate with height
    const r1 = rOuterHarmonicRipple(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsNoZgain);
    const r2 = rOuterHarmonicRipple(THETA_90, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, optsZgain);

    expect(r1).not.toEqual(r2);
  });
});

// ============================================================================
// Vectorized Function Tests
// ============================================================================

describe('Vectorized Style Functions', () => {
  const testVectorized = (
    scalarFn: StyleFunction,
    vectorFn: VectorizedStyleFunction,
    fnName: string
  ) => {
    it(`${fnName}Vec should match scalar version`, () => {
      const nTheta = 64;
      const thetas = new Float32Array(nTheta);
      for (let i = 0; i < nTheta; i++) {
        thetas[i] = (i / nTheta) * TAU;
      }

      const vectorResult = vectorFn(thetas, Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});

      for (let i = 0; i < nTheta; i++) {
        const scalarResult = scalarFn(thetas[i], Z_MIDDLE, TEST_RADIUS, TEST_HEIGHT, {});
        expect(Math.abs(vectorResult[i] - scalarResult)).toBeLessThan(TOLERANCE);
      }
    });
  };

  testVectorized(rOuterSuperformulaBlossom, rOuterSuperformulaBlossomVec, 'SuperformulaBlossom');
  testVectorized(rOuterFourierBloom, rOuterFourierBloomVec, 'FourierBloom');
  testVectorized(rOuterSpiralRidges, rOuterSpiralRidgesVec, 'SpiralRidges');
  testVectorized(rOuterSuperellipseMorph, rOuterSuperellipseMorphVec, 'SuperellipseMorph');
  testVectorized(rOuterHarmonicRipple, rOuterHarmonicRippleVec, 'HarmonicRipple');
});

// ============================================================================
// Registry Tests
// ============================================================================

describe('STYLE_FUNCTIONS', () => {
  it('should have all 5 styles registered', () => {
    expect(Object.keys(STYLE_FUNCTIONS)).toHaveLength(5);
    expect(STYLE_FUNCTIONS.SuperformulaBlossom).toBe(rOuterSuperformulaBlossom);
    expect(STYLE_FUNCTIONS.FourierBloom).toBe(rOuterFourierBloom);
    expect(STYLE_FUNCTIONS.SpiralRidges).toBe(rOuterSpiralRidges);
    expect(STYLE_FUNCTIONS.SuperellipseMorph).toBe(rOuterSuperellipseMorph);
    expect(STYLE_FUNCTIONS.HarmonicRipple).toBe(rOuterHarmonicRipple);
  });
});

describe('STYLE_FUNCTIONS_VEC', () => {
  it('should have all 5 vectorized styles registered', () => {
    expect(Object.keys(STYLE_FUNCTIONS_VEC)).toHaveLength(5);
    expect(STYLE_FUNCTIONS_VEC.SuperformulaBlossom).toBe(rOuterSuperformulaBlossomVec);
    expect(STYLE_FUNCTIONS_VEC.FourierBloom).toBe(rOuterFourierBloomVec);
    expect(STYLE_FUNCTIONS_VEC.SpiralRidges).toBe(rOuterSpiralRidgesVec);
    expect(STYLE_FUNCTIONS_VEC.SuperellipseMorph).toBe(rOuterSuperellipseMorphVec);
    expect(STYLE_FUNCTIONS_VEC.HarmonicRipple).toBe(rOuterHarmonicRippleVec);
  });
});

describe('STYLE_DESCRIPTIONS', () => {
  it('should have descriptions for all 5 styles', () => {
    expect(Object.keys(STYLE_DESCRIPTIONS)).toHaveLength(5);
    expect(STYLE_DESCRIPTIONS.SuperformulaBlossom).toBeTruthy();
    expect(STYLE_DESCRIPTIONS.FourierBloom).toBeTruthy();
    expect(STYLE_DESCRIPTIONS.SpiralRidges).toBeTruthy();
    expect(STYLE_DESCRIPTIONS.SuperellipseMorph).toBeTruthy();
    expect(STYLE_DESCRIPTIONS.HarmonicRipple).toBeTruthy();
  });

  it('should have non-empty descriptions', () => {
    for (const desc of Object.values(STYLE_DESCRIPTIONS)) {
      expect(desc.length).toBeGreaterThan(10);
    }
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('getStyleFunction', () => {
  it('should return the correct function for valid style IDs', () => {
    expect(getStyleFunction('SuperformulaBlossom')).toBe(rOuterSuperformulaBlossom);
    expect(getStyleFunction('FourierBloom')).toBe(rOuterFourierBloom);
    expect(getStyleFunction('SpiralRidges')).toBe(rOuterSpiralRidges);
    expect(getStyleFunction('SuperellipseMorph')).toBe(rOuterSuperellipseMorph);
    expect(getStyleFunction('HarmonicRipple')).toBe(rOuterHarmonicRipple);
  });

  it('should return SuperformulaBlossom as fallback for unknown IDs', () => {
    // @ts-expect-error - testing invalid input
    const fn = getStyleFunction('UnknownStyle');
    expect(fn).toBe(rOuterSuperformulaBlossom);
  });
});

describe('getStyleFunctionVec', () => {
  it('should return the correct vectorized function for valid style IDs', () => {
    expect(getStyleFunctionVec('SuperformulaBlossom')).toBe(rOuterSuperformulaBlossomVec);
    expect(getStyleFunctionVec('FourierBloom')).toBe(rOuterFourierBloomVec);
    expect(getStyleFunctionVec('SpiralRidges')).toBe(rOuterSpiralRidgesVec);
    expect(getStyleFunctionVec('SuperellipseMorph')).toBe(rOuterSuperellipseMorphVec);
    expect(getStyleFunctionVec('HarmonicRipple')).toBe(rOuterHarmonicRippleVec);
  });

  it('should return SuperformulaBlossom as fallback for unknown IDs', () => {
    // @ts-expect-error - testing invalid input
    const fn = getStyleFunctionVec('UnknownStyle');
    expect(fn).toBe(rOuterSuperformulaBlossomVec);
  });
});

// ============================================================================
// Default Constants Tests
// ============================================================================

describe('Default Style Constants', () => {
  it('DEFAULT_SUPERFORMULA should have valid defaults', () => {
    expect(DEFAULT_SUPERFORMULA.sfMBase).toBeGreaterThan(0);
    expect(DEFAULT_SUPERFORMULA.sfMTop).toBeGreaterThan(0);
    expect(DEFAULT_SUPERFORMULA.sfN1).toBeGreaterThan(0);
    expect(DEFAULT_SUPERFORMULA.sfA).toBeGreaterThan(0);
    expect(DEFAULT_SUPERFORMULA.sfB).toBeGreaterThan(0);
  });

  it('DEFAULT_FOURIER should have valid defaults', () => {
    expect(DEFAULT_FOURIER.fbStrength).toBeGreaterThan(0);
    expect(DEFAULT_FOURIER.fbStrength).toBeLessThanOrEqual(1);
  });

  it('DEFAULT_SPIRAL should have valid defaults', () => {
    expect(DEFAULT_SPIRAL.spiralK).toBeGreaterThan(0);
    expect(DEFAULT_SPIRAL.spiralTurns).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SPIRAL.spiralAmpMax).toBeGreaterThan(DEFAULT_SPIRAL.spiralAmpMin);
  });

  it('DEFAULT_SUPERELLIPSE should have valid defaults', () => {
    expect(DEFAULT_SUPERELLIPSE.seMBase).toBeGreaterThan(0);
    expect(DEFAULT_SUPERELLIPSE.seMTop).toBeGreaterThan(0);
  });

  it('DEFAULT_HARMONIC should have valid defaults', () => {
    expect(DEFAULT_HARMONIC.hrPetals).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_HARMONIC.hrPetals)).toBe(true);
    expect(DEFAULT_HARMONIC.hrPetalAmp).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_HARMONIC.hrRippleAmp).toBeGreaterThanOrEqual(0);
  });
});
