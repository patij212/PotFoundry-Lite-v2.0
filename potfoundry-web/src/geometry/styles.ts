/**
 * Style Functions - Outer radius modulation for each artistic style
 * 
 * Each style function modulates the base radius to create decorative patterns.
 * These match the WGSL shader implementations and Python potfoundry/geometry.py.
 */

import {
  TAU,
  EPSILON,
  StyleId,
  StyleOptions,
  SuperformulaBlossomParams,
  FourierBloomParams,
  SpiralRidgesParams,
  SuperellipseMorphParams,
  HarmonicRippleParams,
  DEFAULT_SUPERFORMULA,
  DEFAULT_FOURIER,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
} from './types';

// ============================================================================
// Style Function Type
// ============================================================================

/**
 * Style function signature - computes modulated radius
 * 
 * @param theta - Angular position (radians)
 * @param z - Height position
 * @param r0 - Base radius at this height
 * @param H - Total pot height
 * @param opts - Style-specific parameters
 * @returns Modulated outer radius
 */
export type StyleFunction = (
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
) => number;

/**
 * Vectorized style function for computing multiple theta values at once
 */
export type VectorizedStyleFunction = (
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
) => Float32Array;

// ============================================================================
// Superformula (Gielis) Functions
// ============================================================================

/**
 * Gielis superformula - creates petal/star shapes
 * 
 * The superformula is a generalization of the superellipse that can produce
 * a wide variety of natural and geometric shapes including flowers, leaves,
 * and starfish.
 */
function superformulaValue(
  theta: number,
  m: number,
  n1: number,
  n2: number,
  n3: number,
  a: number = 1.0,
  b: number = 1.0
): number {
  const c = Math.pow(Math.abs(Math.cos(m * theta / 4.0) / Math.max(a, EPSILON)), n2);
  const s = Math.pow(Math.abs(Math.sin(m * theta / 4.0) / Math.max(b, EPSILON)), n3);
  const denom = Math.pow(c + s, 1.0 / Math.max(n1, EPSILON));
  
  if (denom <= EPSILON) {
    return 0.0;
  }
  return Math.min(1.0 / denom, 4.0); // Clamp to prevent extreme values
}

/**
 * Superformula Blossom style - petals via Gielis superformula
 * 
 * Creates organic petal shapes that sharpen toward the rim.
 * The number of petals and their shape vary with height.
 */
export function rOuterSuperformulaBlossom(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<SuperformulaBlossomParams>;

  // Interpolate parameters from base to top
  const mBase = params.sfMBase ?? DEFAULT_SUPERFORMULA.sfMBase;
  const mTop = params.sfMTop ?? DEFAULT_SUPERFORMULA.sfMTop;
  const mCurve = params.sfMCurveExp ?? DEFAULT_SUPERFORMULA.sfMCurveExp;
  const m = mBase + (mTop - mBase) * Math.pow(t, mCurve);

  const n1Base = params.sfN1 ?? DEFAULT_SUPERFORMULA.sfN1;
  const n1Top = params.sfN1Top ?? DEFAULT_SUPERFORMULA.sfN1Top;
  const n2Base = params.sfN2 ?? DEFAULT_SUPERFORMULA.sfN2;
  const n2Top = params.sfN2Top ?? DEFAULT_SUPERFORMULA.sfN2Top;
  const n3Base = params.sfN3 ?? DEFAULT_SUPERFORMULA.sfN3;
  const n3Top = params.sfN3Top ?? DEFAULT_SUPERFORMULA.sfN3Top;

  const n1 = n1Base + (n1Top - n1Base) * t;
  const n2 = n2Base + (n2Top - n2Base) * t;
  const n3 = n3Base + (n3Top - n3Base) * t;

  const a = params.sfA ?? DEFAULT_SUPERFORMULA.sfA;
  const b = params.sfB ?? DEFAULT_SUPERFORMULA.sfB;

  const rf = superformulaValue(theta, m, n1, n2, n3, a, b);
  return r0 * (0.90 + 0.35 * rf);
}

/**
 * Vectorized Superformula Blossom for performance
 */
export function rOuterSuperformulaBlossomVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<SuperformulaBlossomParams>;

  const mBase = params.sfMBase ?? DEFAULT_SUPERFORMULA.sfMBase;
  const mTop = params.sfMTop ?? DEFAULT_SUPERFORMULA.sfMTop;
  const mCurve = params.sfMCurveExp ?? DEFAULT_SUPERFORMULA.sfMCurveExp;
  const m = mBase + (mTop - mBase) * Math.pow(t, mCurve);

  const n1 = (params.sfN1 ?? DEFAULT_SUPERFORMULA.sfN1) + 
             ((params.sfN1Top ?? DEFAULT_SUPERFORMULA.sfN1Top) - (params.sfN1 ?? DEFAULT_SUPERFORMULA.sfN1)) * t;
  const n2 = (params.sfN2 ?? DEFAULT_SUPERFORMULA.sfN2) + 
             ((params.sfN2Top ?? DEFAULT_SUPERFORMULA.sfN2Top) - (params.sfN2 ?? DEFAULT_SUPERFORMULA.sfN2)) * t;
  const n3 = (params.sfN3 ?? DEFAULT_SUPERFORMULA.sfN3) + 
             ((params.sfN3Top ?? DEFAULT_SUPERFORMULA.sfN3Top) - (params.sfN3 ?? DEFAULT_SUPERFORMULA.sfN3)) * t;
  const a = params.sfA ?? DEFAULT_SUPERFORMULA.sfA;
  const b = params.sfB ?? DEFAULT_SUPERFORMULA.sfB;

  for (let i = 0; i < n; i++) {
    const rf = superformulaValue(thetas[i], m, n1, n2, n3, a, b);
    result[i] = r0 * (0.90 + 0.35 * rf);
  }

  return result;
}

// ============================================================================
// Fourier Bloom Functions
// ============================================================================

/**
 * Fourier Bloom style - floral profile from blended harmonics
 * 
 * Uses multiple sine/cosine harmonics blended from base to top
 * with an optional wobble modulation.
 */
export function rOuterFourierBloom(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<FourierBloomParams>;

  // Base harmonics
  const bc8 = params.fbBaseCos8Amp ?? DEFAULT_FOURIER.fbBaseCos8Amp;
  const bc8p = params.fbBaseCos8Phase ?? DEFAULT_FOURIER.fbBaseCos8Phase;
  const bs4 = params.fbBaseSin4Amp ?? DEFAULT_FOURIER.fbBaseSin4Amp;
  const bs4p = params.fbBaseSin4Phase ?? DEFAULT_FOURIER.fbBaseSin4Phase;
  const bc12 = params.fbBaseCos12Amp ?? DEFAULT_FOURIER.fbBaseCos12Amp;
  const bc12p = params.fbBaseCos12Phase ?? DEFAULT_FOURIER.fbBaseCos12Phase;

  // Top harmonics
  const tc11 = params.fbTopCos11Amp ?? DEFAULT_FOURIER.fbTopCos11Amp;
  const tc11p = params.fbTopCos11Phase ?? DEFAULT_FOURIER.fbTopCos11Phase;
  const ts7 = params.fbTopSin7Amp ?? DEFAULT_FOURIER.fbTopSin7Amp;
  const ts7p = params.fbTopSin7Phase ?? DEFAULT_FOURIER.fbTopSin7Phase;
  const tc22 = params.fbTopCos22Amp ?? DEFAULT_FOURIER.fbTopCos22Amp;
  const tc22p = params.fbTopCos22Phase ?? DEFAULT_FOURIER.fbTopCos22Phase;

  // Wobble
  const wobAmp = params.fbWobbleAmp ?? DEFAULT_FOURIER.fbWobbleAmp;
  const wobFreq = params.fbWobbleFreq ?? DEFAULT_FOURIER.fbWobbleFreq;
  const wobZgain = params.fbWobbleZgain ?? DEFAULT_FOURIER.fbWobbleZgain;
  const strength = params.fbStrength ?? DEFAULT_FOURIER.fbStrength;

  // Compute base and top profiles
  const base = 1.0 + 
    bc8 * Math.cos(8 * theta + bc8p) + 
    bs4 * Math.sin(4 * theta + bs4p) + 
    bc12 * Math.cos(12 * theta + bc12p);

  const top = 1.0 + 
    tc11 * Math.cos(11 * theta + tc11p) + 
    ts7 * Math.sin(7 * theta + ts7p) + 
    tc22 * Math.cos(22 * theta + tc22p);

  // Blend and apply wobble
  let f = (1 - t) * base + t * top;
  f *= 1.0 + wobAmp * Math.sin(wobFreq * theta + TAU * wobZgain * t);

  return r0 * (1.0 + (f - 1.0) * strength);
}

/**
 * Vectorized Fourier Bloom
 */
export function rOuterFourierBloomVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<FourierBloomParams>;

  const bc8 = params.fbBaseCos8Amp ?? DEFAULT_FOURIER.fbBaseCos8Amp;
  const bc8p = params.fbBaseCos8Phase ?? DEFAULT_FOURIER.fbBaseCos8Phase;
  const bs4 = params.fbBaseSin4Amp ?? DEFAULT_FOURIER.fbBaseSin4Amp;
  const bs4p = params.fbBaseSin4Phase ?? DEFAULT_FOURIER.fbBaseSin4Phase;
  const bc12 = params.fbBaseCos12Amp ?? DEFAULT_FOURIER.fbBaseCos12Amp;
  const bc12p = params.fbBaseCos12Phase ?? DEFAULT_FOURIER.fbBaseCos12Phase;
  const tc11 = params.fbTopCos11Amp ?? DEFAULT_FOURIER.fbTopCos11Amp;
  const tc11p = params.fbTopCos11Phase ?? DEFAULT_FOURIER.fbTopCos11Phase;
  const ts7 = params.fbTopSin7Amp ?? DEFAULT_FOURIER.fbTopSin7Amp;
  const ts7p = params.fbTopSin7Phase ?? DEFAULT_FOURIER.fbTopSin7Phase;
  const tc22 = params.fbTopCos22Amp ?? DEFAULT_FOURIER.fbTopCos22Amp;
  const tc22p = params.fbTopCos22Phase ?? DEFAULT_FOURIER.fbTopCos22Phase;
  const wobAmp = params.fbWobbleAmp ?? DEFAULT_FOURIER.fbWobbleAmp;
  const wobFreq = params.fbWobbleFreq ?? DEFAULT_FOURIER.fbWobbleFreq;
  const wobZgain = params.fbWobbleZgain ?? DEFAULT_FOURIER.fbWobbleZgain;
  const strength = params.fbStrength ?? DEFAULT_FOURIER.fbStrength;

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    const base = 1.0 + bc8 * Math.cos(8 * theta + bc8p) + bs4 * Math.sin(4 * theta + bs4p) + bc12 * Math.cos(12 * theta + bc12p);
    const top = 1.0 + tc11 * Math.cos(11 * theta + tc11p) + ts7 * Math.sin(7 * theta + ts7p) + tc22 * Math.cos(22 * theta + tc22p);
    let f = (1 - t) * base + t * top;
    f *= 1.0 + wobAmp * Math.sin(wobFreq * theta + TAU * wobZgain * t);
    result[i] = r0 * (1.0 + (f - 1.0) * strength);
  }

  return result;
}

// ============================================================================
// Spiral Ridges Functions
// ============================================================================

/**
 * Spiral Ridges style - rising helical ribs with fine grooves
 * 
 * Creates a spiral pattern that wraps around the pot with secondary
 * groove details for added texture.
 */
export function rOuterSpiralRidges(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<SpiralRidgesParams>;

  const k = params.spiralK ?? DEFAULT_SPIRAL.spiralK;
  const turns = params.spiralTurns ?? DEFAULT_SPIRAL.spiralTurns;
  const ampMin = params.spiralAmpMin ?? DEFAULT_SPIRAL.spiralAmpMin;
  const ampMax = params.spiralAmpMax ?? DEFAULT_SPIRAL.spiralAmpMax;
  const ampCurve = params.spiralAmpCurve ?? DEFAULT_SPIRAL.spiralAmpCurve;
  const grooveAmp = params.spiralGrooveAmp ?? DEFAULT_SPIRAL.spiralGrooveAmp;
  const grooveMult = params.spiralGrooveMult ?? DEFAULT_SPIRAL.spiralGrooveMult;
  const phaseMult = params.spiralPhaseMult ?? DEFAULT_SPIRAL.spiralPhaseMult;

  const phase = TAU * turns * t;
  const amp = ampMin + (ampMax - ampMin) * Math.pow(t, ampCurve);
  
  let f = 1.0 + amp * Math.sin(k * theta + phase);
  f += grooveAmp * Math.sin(grooveMult * k * theta + phaseMult * phase);

  return r0 * f;
}

/**
 * Vectorized Spiral Ridges
 */
export function rOuterSpiralRidgesVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<SpiralRidgesParams>;

  const k = params.spiralK ?? DEFAULT_SPIRAL.spiralK;
  const turns = params.spiralTurns ?? DEFAULT_SPIRAL.spiralTurns;
  const ampMin = params.spiralAmpMin ?? DEFAULT_SPIRAL.spiralAmpMin;
  const ampMax = params.spiralAmpMax ?? DEFAULT_SPIRAL.spiralAmpMax;
  const ampCurve = params.spiralAmpCurve ?? DEFAULT_SPIRAL.spiralAmpCurve;
  const grooveAmp = params.spiralGrooveAmp ?? DEFAULT_SPIRAL.spiralGrooveAmp;
  const grooveMult = params.spiralGrooveMult ?? DEFAULT_SPIRAL.spiralGrooveMult;
  const phaseMult = params.spiralPhaseMult ?? DEFAULT_SPIRAL.spiralPhaseMult;

  const phase = TAU * turns * t;
  const amp = ampMin + (ampMax - ampMin) * Math.pow(t, ampCurve);

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    let f = 1.0 + amp * Math.sin(k * theta + phase);
    f += grooveAmp * Math.sin(grooveMult * k * theta + phaseMult * phase);
    result[i] = r0 * f;
  }

  return result;
}

// ============================================================================
// Superellipse Morph Functions
// ============================================================================

/**
 * Superellipse Morph style - circle → rounded square → soft diamond
 * 
 * The superellipse exponent varies with height, morphing the cross-section
 * from circular at the base to more angular at the top.
 */
export function rOuterSuperellipseMorph(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<SuperellipseMorphParams>;

  const mBase = params.seMBase ?? DEFAULT_SUPERELLIPSE.seMBase;
  const mTop = params.seMTop ?? DEFAULT_SUPERELLIPSE.seMTop;
  const mCurve = params.seMCurveExp ?? DEFAULT_SUPERELLIPSE.seMCurveExp;
  const mExp = mBase + (mTop - mBase) * Math.pow(t, mCurve);

  const c4a = params.seC4Amp ?? DEFAULT_SUPERELLIPSE.seC4Amp;
  const c4p = (params.seC4PhaseDeg ?? DEFAULT_SUPERELLIPSE.seC4PhaseDeg) * Math.PI / 180.0;
  const c8a = params.seC8Amp ?? DEFAULT_SUPERELLIPSE.seC8Amp;
  const c8p = (params.seC8PhaseDeg ?? DEFAULT_SUPERELLIPSE.seC8PhaseDeg) * Math.PI / 180.0;

  const c = Math.pow(Math.abs(Math.cos(theta)), mExp);
  const s = Math.pow(Math.abs(Math.sin(theta)), mExp);
  const base = Math.pow(c + s, -1.0 / Math.max(mExp, EPSILON));
  const rf = base * (1.0 + c4a * Math.cos(4 * theta + c4p) + c8a * Math.cos(8 * theta + c8p));

  return r0 * rf;
}

/**
 * Vectorized Superellipse Morph
 */
export function rOuterSuperellipseMorphVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<SuperellipseMorphParams>;

  const mBase = params.seMBase ?? DEFAULT_SUPERELLIPSE.seMBase;
  const mTop = params.seMTop ?? DEFAULT_SUPERELLIPSE.seMTop;
  const mCurve = params.seMCurveExp ?? DEFAULT_SUPERELLIPSE.seMCurveExp;
  const mExp = mBase + (mTop - mBase) * Math.pow(t, mCurve);

  const c4a = params.seC4Amp ?? DEFAULT_SUPERELLIPSE.seC4Amp;
  const c4p = (params.seC4PhaseDeg ?? DEFAULT_SUPERELLIPSE.seC4PhaseDeg) * Math.PI / 180.0;
  const c8a = params.seC8Amp ?? DEFAULT_SUPERELLIPSE.seC8Amp;
  const c8p = (params.seC8PhaseDeg ?? DEFAULT_SUPERELLIPSE.seC8PhaseDeg) * Math.PI / 180.0;

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    const c = Math.pow(Math.abs(Math.cos(theta)), mExp);
    const s = Math.pow(Math.abs(Math.sin(theta)), mExp);
    const base = Math.pow(c + s, -1.0 / Math.max(mExp, EPSILON));
    const rf = base * (1.0 + c4a * Math.cos(4 * theta + c4p) + c8a * Math.cos(8 * theta + c8p));
    result[i] = r0 * rf;
  }

  return result;
}

// ============================================================================
// Harmonic Ripple Functions
// ============================================================================

/**
 * Harmonic Ripple style - petals + ripples + gentle mid-height bell
 * 
 * Combines petal-like undulations with fine ripple details and
 * a subtle bell bulge at mid-height.
 */
export function rOuterHarmonicRipple(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<HarmonicRippleParams>;

  const petals = params.hrPetals ?? DEFAULT_HARMONIC.hrPetals;
  const petAmp = params.hrPetalAmp ?? DEFAULT_HARMONIC.hrPetalAmp;
  const petPh = (params.hrPetalPhaseDeg ?? DEFAULT_HARMONIC.hrPetalPhaseDeg) * Math.PI / 180.0;
  const petZg = params.hrPetalZgain ?? DEFAULT_HARMONIC.hrPetalZgain;

  const ripFreq = params.hrRippleFreq ?? DEFAULT_HARMONIC.hrRippleFreq;
  const ripAmp = params.hrRippleAmp ?? DEFAULT_HARMONIC.hrRippleAmp;
  const ripPh = (params.hrRipplePhaseDeg ?? DEFAULT_HARMONIC.hrRipplePhaseDeg) * Math.PI / 180.0;
  const ripZg = params.hrRippleZgain ?? DEFAULT_HARMONIC.hrRippleZgain;

  const bell = params.hrBell ?? DEFAULT_HARMONIC.hrBell;

  let f = 1.0 + petAmp * Math.cos(petals * theta + petPh + TAU * petZg * t);
  f *= 1.0 + ripAmp * Math.sin(ripFreq * theta + ripPh + TAU * ripZg * t);
  f *= 1.0 + bell * Math.exp(-Math.pow(t - 0.5, 2) / 0.04);

  return r0 * f;
}

/**
 * Vectorized Harmonic Ripple
 */
export function rOuterHarmonicRippleVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<HarmonicRippleParams>;

  const petals = params.hrPetals ?? DEFAULT_HARMONIC.hrPetals;
  const petAmp = params.hrPetalAmp ?? DEFAULT_HARMONIC.hrPetalAmp;
  const petPh = (params.hrPetalPhaseDeg ?? DEFAULT_HARMONIC.hrPetalPhaseDeg) * Math.PI / 180.0;
  const petZg = params.hrPetalZgain ?? DEFAULT_HARMONIC.hrPetalZgain;
  const ripFreq = params.hrRippleFreq ?? DEFAULT_HARMONIC.hrRippleFreq;
  const ripAmp = params.hrRippleAmp ?? DEFAULT_HARMONIC.hrRippleAmp;
  const ripPh = (params.hrRipplePhaseDeg ?? DEFAULT_HARMONIC.hrRipplePhaseDeg) * Math.PI / 180.0;
  const ripZg = params.hrRippleZgain ?? DEFAULT_HARMONIC.hrRippleZgain;
  const bell = params.hrBell ?? DEFAULT_HARMONIC.hrBell;

  const bellFactor = 1.0 + bell * Math.exp(-Math.pow(t - 0.5, 2) / 0.04);

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    let f = 1.0 + petAmp * Math.cos(petals * theta + petPh + TAU * petZg * t);
    f *= 1.0 + ripAmp * Math.sin(ripFreq * theta + ripPh + TAU * ripZg * t);
    f *= bellFactor;
    result[i] = r0 * f;
  }

  return result;
}

// ============================================================================
// Style Registry
// ============================================================================

/** Map of style IDs to their functions */
export const STYLE_FUNCTIONS: Record<StyleId, StyleFunction> = {
  SuperformulaBlossom: rOuterSuperformulaBlossom,
  FourierBloom: rOuterFourierBloom,
  SpiralRidges: rOuterSpiralRidges,
  SuperellipseMorph: rOuterSuperellipseMorph,
  HarmonicRipple: rOuterHarmonicRipple,
};

/** Map of style IDs to their vectorized functions */
export const STYLE_FUNCTIONS_VEC: Record<StyleId, VectorizedStyleFunction> = {
  SuperformulaBlossom: rOuterSuperformulaBlossomVec,
  FourierBloom: rOuterFourierBloomVec,
  SpiralRidges: rOuterSpiralRidgesVec,
  SuperellipseMorph: rOuterSuperellipseMorphVec,
  HarmonicRipple: rOuterHarmonicRippleVec,
};

/** Style descriptions for UI */
export const STYLE_DESCRIPTIONS: Record<StyleId, string> = {
  SuperformulaBlossom: 'Petals via Gielis superformula; sharpen toward rim.',
  FourierBloom: 'Floral profile from blended harmonics.',
  SpiralRidges: 'Rising helical ribs with fine grooves.',
  SuperellipseMorph: 'Circle → rounded square → soft diamond vs height.',
  HarmonicRipple: 'Petals + ripples + gentle mid-height bell.',
};

/**
 * Get the style function for a given style ID
 */
export function getStyleFunction(styleId: StyleId): StyleFunction {
  return STYLE_FUNCTIONS[styleId] ?? STYLE_FUNCTIONS.SuperformulaBlossom;
}

/**
 * Get the vectorized style function for a given style ID
 */
export function getStyleFunctionVec(styleId: StyleId): VectorizedStyleFunction {
  return STYLE_FUNCTIONS_VEC[styleId] ?? STYLE_FUNCTIONS_VEC.SuperformulaBlossom;
}
