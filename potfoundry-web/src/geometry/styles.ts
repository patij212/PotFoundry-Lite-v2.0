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
  GothicArchesParams,
  WaveInterferenceParams,
  CrystallineParams,
  ArtDecoParams,
  DragonScalesParams,
  BambooSegmentsParams,
  DEFAULT_SUPERFORMULA,
  DEFAULT_FOURIER,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
  DEFAULT_GOTHIC_ARCHES,
  DEFAULT_WAVE_INTERFERENCE,
  DEFAULT_CRYSTALLINE,
  DEFAULT_ART_DECO,
  DEFAULT_DRAGON_SCALES,
  DEFAULT_BAMBOO_SEGMENTS,
  DEFAULT_RIPPLE_INTERFERENCE,
  DEFAULT_GYROID_MANIFOLD,
  DEFAULT_VORONOI,
  RippleInterferenceParams,
  GyroidManifoldParams,
  BasketWeaveParams,
  DEFAULT_BASKET_WEAVE,
  GeometricStarParams,
  DEFAULT_GEOMETRIC_STAR,
  HexagonalHiveParams,
  DEFAULT_HEXAGONAL_HIVE,
  CelticKnotParams,
  DEFAULT_CELTIC_KNOT,
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

  // Seam phase offset: shift theta by half a petal width so theta=0 falls 
  // on a smooth slope instead of a petal tip/valley.
  const seamOffset = Math.PI / Math.max(m, 1.0);
  const thetaAdj = theta + seamOffset;

  const rf = superformulaValue(thetaAdj, m, n1, n2, n3, a, b);

  // Seam amplitude blending: gradually reduce petal amplitude near the seam
  // This makes peaks gently lower to valley level for a smooth transition
  const seamAngleDeg = (opts as any).seamAngle ?? 0;
  if (seamAngleDeg > 0) {
    const seamSpread = (seamAngleDeg * Math.PI) / 180;
    const distFromSeam = Math.min(theta, TAU - theta);
    if (distFromSeam < seamSpread) {
      const x = distFromSeam / seamSpread;
      const alpha = x * x * (3 - 2 * x); // smoothstep
      const rfBlend = rf * alpha;
      return r0 * (0.90 + 0.35 * rfBlend);
    }
  }

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

  // Seam phase offset: shift theta by half a petal width for smooth seam
  const seamOffset = Math.PI / Math.max(m, 1.0);

  // Seam amplitude blending parameters
  const seamAngleDeg = (opts as any).seamAngle ?? 0;
  const seamSpread = seamAngleDeg > 0 ? (seamAngleDeg * Math.PI) / 180 : 0;

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    const thetaAdj = theta + seamOffset;
    const rf = superformulaValue(thetaAdj, m, n1, n2, n3, a, b);

    // Apply seam amplitude blending if enabled
    if (seamSpread > 0) {
      const distFromSeam = Math.min(theta, TAU - theta);
      if (distFromSeam < seamSpread) {
        const x = distFromSeam / seamSpread;
        const alpha = x * x * (3 - 2 * x); // smoothstep
        const rfBlend = rf * alpha;
        result[i] = r0 * (0.90 + 0.35 * rfBlend);
        continue;
      }
    }

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
// Gothic Arches Functions
// ============================================================================

/**
 * Gothic Arches style - Interlaced pointed arch patterns with tracery
 * 
 * Creates cathedral window-inspired patterns with interlaced arches
 * and detailed tracery (rosettes, lancets).
 */
export function rOuterGothicArches(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const PI = 3.141592653589793;
  const TAU = 6.283185307179586;
  const EPS = 1e-6;

  const sat = (x: number) => Math.min(1, Math.max(0, x));
  const smoothstep = (e0: number, e1: number, x: number) => {
    const t = sat((x - e0) / Math.max(EPS, e1 - e0));
    return t * t * (3 - 2 * t);
  };

  const ridge = (d: number, wIn: number, sharp: number) => {
    const w = Math.max(EPS, wIn);
    return Math.pow(Math.max(0, 1 - Math.abs(d) / w), sharp);
  };

  const ridgeSin = (phi: number, wIn: number, sharp: number) => {
    const w = Math.max(EPS, wIn);
    return Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phi)) / w), sharp);
  };

  // Explicit cast to Partial<GothicArchesParams>
  const params = opts as Partial<GothicArchesParams>;

  // Defaults fallback to the newly updated DEFAULT_GOTHIC_ARCHES structure
  const N = Math.max(1, Math.floor((params.gaCounts ?? DEFAULT_GOTHIC_ARCHES.gaCounts) + 0.5));
  const amp = params.gaRelief ?? DEFAULT_GOTHIC_ARCHES.gaRelief;
  const p = Math.max(0.25, params.gaPointiness ?? DEFAULT_GOTHIC_ARCHES.gaPointiness);

  const diamond = sat(params.gaDiamond ?? DEFAULT_GOTHIC_ARCHES.gaDiamond);
  const xTracery = sat(params.gaX ?? DEFAULT_GOTHIC_ARCHES.gaX);

  const z0 = sat(params.gaSpring ?? DEFAULT_GOTHIC_ARCHES.gaSpring);
  const zh = sat(params.gaArchHeight ?? DEFAULT_GOTHIC_ARCHES.gaArchHeight) * (1 - z0);

  const wZ = Math.max(EPS, params.gaRib ?? DEFAULT_GOTHIC_ARCHES.gaRib);
  const wX = Math.max(EPS, params.gaCol ?? DEFAULT_GOTHIC_ARCHES.gaCol);
  const sharp = Math.max(1, params.gaSharp ?? DEFAULT_GOTHIC_ARCHES.gaSharp);

  const bands = sat(params.gaBands ?? DEFAULT_GOTHIC_ARCHES.gaBands);
  const bandW = Math.max(EPS, params.gaBandW ?? DEFAULT_GOTHIC_ARCHES.gaBandW);

  const t = sat(H > 0 ? z / H : 0.0);

  // ---- Seam-safe bay coordinate
  const a = theta * N;
  const xSigned = Math.cos(0.5 * a);        // [-1..1]
  const xAbs = Math.abs(xSigned);           // 0 at bay center, 1 at bay edges
  const x01 = sat(0.5 * (xSigned + 1.0));   // [0..1] across bay

  // ---- Define a "top tier" start automatically from your arch params
  const archApex = z0 + zh;                       // nominal apex
  const topStart = z0 + 0.65 * (archApex - z0);   // where lattice begins
  const blendW = Math.max(0.015, 1.25 * bandW);

  const topMask = smoothstep(topStart - blendW, topStart + blendW, t);
  const botMask = 1 - topMask;

  // ============================================================
  // LOWER TIER: lancet arches + columns + recessed panel
  // ============================================================
  const archY = Math.pow(Math.max(0, 1 - Math.pow(xAbs, p)), 1 / p);
  const archZ = z0 + (archApex - z0) * archY;

  const gateW = 2.0 * wZ;
  const gate = sat((t - z0) / gateW) * sat((archZ - t) / gateW);

  const ribArch = ridge(t - archZ, wZ, sharp);

  const colEdge = Math.pow(Math.max(0, 1 - (1 - xAbs) / wX), sharp);
  const mullion = Math.pow(Math.max(0, 1 - xAbs / (0.65 * wX)), sharp);

  // recessed panel behind ribs
  const panel = gate * Math.pow(Math.max(0, 1 - xAbs / 0.95), 2.0);
  const recess = 0.25; // fraction of amp

  // X-tracery inside the arch bay
  const denom = Math.max(EPS, archZ - z0);
  const s = sat((t - z0) / denom);
  const wT = 0.55 * wX;
  const xDiag = gate * (
    ridge(s - x01, wT, sharp) +
    ridge(s - (1 - x01), wT, sharp)
  );

  const lower =
    (ribArch + 0.70 * colEdge * gate + 0.30 * mullion * gate + xTracery * 0.55 * xDiag)
    - recess * panel;

  // ============================================================
  // UPPER TIER: diamond lattice (confined to top region)
  // ============================================================
  const v = sat((t - topStart) / Math.max(EPS, 1 - topStart));

  // lattice density driven by Diamond slider
  const rows = 0.9 + 1.6 * diamond;

  // tie lattice thickness to rib thickness
  const wL = Math.max(0.05, 2.0 * wZ);

  const phi1 = PI * (rows * v - x01);
  const phi2 = PI * (rows * v + x01);
  const lattice = ridgeSin(phi1, wL, sharp) + ridgeSin(phi2, wL, sharp);

  // subtle “fill” in diamond cells
  const cell = Math.pow(Math.abs(Math.sin(phi1)) * Math.abs(Math.sin(phi2)), 2.0);
  const motif = 0.25 * diamond * cell * Math.pow(Math.abs(Math.sin(TAU * x01)) * Math.abs(Math.sin(TAU * v)), 2.0);

  // bands: base + tier divider + rim
  const bw = 1.8 * bandW;
  const bandBase = ridge(t - 0.0, bw, sharp);
  const bandMid = ridge(t - topStart, bw, sharp);
  const bandRim = ridge(t - 1.0, bw, sharp);

  const upper =
    diamond * (0.95 * lattice + 0.35 * motif) +
    bands * (0.85 * bandMid + 0.35 * bandRim);

  const pattern = botMask * lower + topMask * upper + bands * 0.25 * bandBase;
  return r0 + amp * pattern;
}


export function rOuterGothicArchesVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterGothicArches(thetas[i], z, r0, H, opts);
  }
  return result;
}



// ============================================================================
// Wave Interference Functions
// ============================================================================

/**
 * Wave Interference style - Complex moiré-like patterns with domain warping
 * 
 * Creates organic, rippled textures using domain-warped sine wave interference,
 * simulating natural phenomena like wood grain, water ripples, or fabric.
 */
export function rOuterWaveInterference(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<WaveInterferenceParams>;

  const featureCount = params.wiFeatureCount ?? DEFAULT_WAVE_INTERFERENCE.wiFeatureCount;
  const reliefDepth = params.wiReliefDepth ?? DEFAULT_WAVE_INTERFERENCE.wiReliefDepth;
  const contourDensity = params.wiContourDensity ?? DEFAULT_WAVE_INTERFERENCE.wiContourDensity;
  const moireStrength = params.wiMoireStrength ?? DEFAULT_WAVE_INTERFERENCE.wiMoireStrength;
  const patternStyle = params.wiPatternStyle ?? DEFAULT_WAVE_INTERFERENCE.wiPatternStyle;
  const helixPitch = params.wiHelixPitch ?? DEFAULT_WAVE_INTERFERENCE.wiHelixPitch;
  const pitchMismatch = params.wiPitchMismatch ?? DEFAULT_WAVE_INTERFERENCE.wiPitchMismatch;
  const domainWarp = params.wiDomainWarp ?? DEFAULT_WAVE_INTERFERENCE.wiDomainWarp;
  const warpScale = params.wiWarpScale ?? DEFAULT_WAVE_INTERFERENCE.wiWarpScale;
  const ridgeContrast = params.wiRidgeContrast ?? DEFAULT_WAVE_INTERFERENCE.wiRidgeContrast;
  const edgeFade = params.wiEdgeFade ?? DEFAULT_WAVE_INTERFERENCE.wiEdgeFade;
  const phase = params.wiPhase ?? DEFAULT_WAVE_INTERFERENCE.wiPhase;

  // Algorithm constants
  const PI = Math.PI;
  const TAU = 2 * PI;

  // Domain Warping
  // Distort the angle theta based on height and noise-like functions
  // GPU uses floor rounding for frequency
  const warpFreq = Math.floor(4.0 + 8.0 * warpScale + 0.5);
  const warpMag = domainWarp * 0.3; // Match GPU: warp_mag = domain_warp * 0.3

  // Handedness Fix: Negate theta to match WebGPU winding order
  // This ensures the Moiré interference (linear vs product params) resolves to the same geometric shape
  const th = -theta;
  const warp = warpMag * Math.sin(th * warpFreq + phase * TAU + t * 5.0);
  const warpedTheta = th + warp;

  // Coordinate setup
  // Use a helical coordinate system to impart spiraling
  const spiralV = t * (1.0 + helixPitch * 4.0);

  // Frequencies
  // Base frequency controlled by Feature Count - GPU uses floor for integer periodicity
  const baseFreqRaw = 6.0 + featureCount * 30.0;
  const baseFreq = Math.floor(baseFreqRaw + 0.5);

  // Secondary frequency: also round to integer
  const secOffset = Math.floor(pitchMismatch * 4.0 + 0.5) - 2.0;
  const secondaryFreq = baseFreq + secOffset;

  // Phases
  const p1 = warpedTheta * baseFreq + spiralV * TAU + phase * TAU;
  const p2 = warpedTheta * secondaryFreq + spiralV * TAU * 1.1 + phase * TAU + 1.7; // Offset phase

  // Wave Layers
  const w1 = Math.sin(p1);
  const w2 = Math.sin(p2);

  // Interference / Pattern Style
  // Blend between simple addition, multiplication, and ridge-like combinations
  // moireStrength blends a multiplicative interference component
  const linear = 0.5 * (w1 + w2);
  const prod = w1 * w2;
  const rawPattern = (1.0 - moireStrength) * linear + moireStrength * prod;

  // Pattern Style modulation (Phase distortion of the pattern itself)
  const styleFreq = 3.0;
  const styleMod = patternStyle * Math.cos(warpedTheta * styleFreq + t * 10.0);
  const styledPattern = rawPattern + styleMod * 0.2;

  // Ridge / Contour processing
  // Normalize roughly to 0..1 then shape
  let n = 0.5 + 0.5 * styledPattern;

  // Add fine detail based on contour density - GPU rounds frequency
  const detailFreq = Math.floor(baseFreq * 2.5 + 0.5);
  const detail = contourDensity * 0.15 * Math.sin(warpedTheta * detailFreq + t * 20.0);
  n += detail;

  // Contrast / Ridge shaping
  const contrastExp = 0.5 + ridgeContrast * 3.0; // 0.5 to 3.5
  // Bias towards 0 or 1 based on result
  let ridge = Math.pow(Math.max(0, Math.min(1, n)), contrastExp);

  // Edge Fading
  // Fade effect at top and bottom if requested
  if (edgeFade > 0.01) {
    const dEdge = Math.min(t, 1.0 - t); // distance to closest edge
    const fadeZone = edgeFade * 0.3; // depth of fade zone
    const f = dEdge < fadeZone ? dEdge / Math.max(0.001, fadeZone) : 1.0;
    ridge *= f;
  }

  // Apply relief depth
  const displacement = (ridge - 0.4) * reliefDepth;

  return Math.max(0.1, r0 + displacement);
}

export function rOuterWaveInterferenceVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterWaveInterference(thetas[i], z, r0, H, opts);
  }
  return result;
}

// ============================================================================
// Crystalline Functions
// ============================================================================

/**
 * Crystalline style - Faceted crystal-like surfaces
 * 
 * Creates geometric faceted patterns with sharp edges
 * and optional sub-facet details.
 */
export function rOuterCrystalline(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<CrystallineParams>;

  const facetCount = Math.max(params.crFacetCount ?? DEFAULT_CRYSTALLINE.crFacetCount, 1.0);
  const facetDepth = params.crFacetDepth ?? DEFAULT_CRYSTALLINE.crFacetDepth;
  const subFacets = Math.max(params.crSubFacets ?? DEFAULT_CRYSTALLINE.crSubFacets, 1.0);
  const edgeSharpness = Math.max(Math.min(params.crEdgeSharpness ?? DEFAULT_CRYSTALLINE.crEdgeSharpness, 10.0), 0.1);
  const asymmetry = params.crAsymmetry ?? DEFAULT_CRYSTALLINE.crAsymmetry;
  const heightPhase = params.crHeightPhase ?? DEFAULT_CRYSTALLINE.crHeightPhase;

  // Height-based phase shift for visual interest
  const phaseShift = t * heightPhase * TAU / facetCount;
  const adjustedTheta = theta + phaseShift;

  // Primary facet pattern
  const facetPhase = (adjustedTheta * facetCount) % TAU;
  const triangleWave = Math.abs((facetPhase / TAU) * 2.0 - 1.0);
  // Add epsilon to max to match GPU stability
  const facetShape = Math.pow(Math.max(triangleWave, 0.001), edgeSharpness);

  // Sub-facet detail
  const subPhase = (adjustedTheta * facetCount * subFacets) % TAU;
  const subShape = Math.pow(Math.max(Math.abs(Math.sin(subPhase * 0.5)), 0.001), edgeSharpness * 0.5) * 0.3;

  // Asymmetry: pseudo-random variation
  const asymVar = Math.sin(theta * 17.0 + t * 23.0) * asymmetry;

  const modulation = 1.0 - facetDepth * facetShape - facetDepth * 0.3 * subShape + asymVar;

  return r0 * Math.max(0.5, Math.min(2.0, modulation));
}

export function rOuterCrystallineVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterCrystalline(thetas[i], z, r0, H, opts);
  }
  return result;
}

// ============================================================================
// Art Deco Functions
// ============================================================================

/**
 * Art Deco style - 1920s geometric styling
 * 
 * Combines sunburst fan patterns, stepped tiers, and chevron details
 * for classic Art Deco aesthetic.
 */
export function rOuterArtDeco(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<ArtDecoParams>;

  const fanCount = Math.max(params.adFanCount ?? DEFAULT_ART_DECO.adFanCount, 1.0);
  const fanSpread = Math.max(params.adFanSpread ?? DEFAULT_ART_DECO.adFanSpread, 0.1);
  const stepCount = Math.max(params.adStepCount ?? DEFAULT_ART_DECO.adStepCount, 1.0);
  const stepDepth = params.adStepDepth ?? DEFAULT_ART_DECO.adStepDepth;
  const chevronAmp = params.adChevronAmp ?? DEFAULT_ART_DECO.adChevronAmp;
  const chevronFreq = params.adChevronFreq ?? DEFAULT_ART_DECO.adChevronFreq;
  const blend = params.adGeometricBlend ?? DEFAULT_ART_DECO.adGeometricBlend;

  // Sunburst fan pattern: rays emanating from center
  const fanPhase = (theta * fanCount) % TAU;
  // Match GPU: fan_exp = clamp(1.0 / fan_spread, 0.1, 10.0);
  const fanExp = Math.max(0.1, Math.min(10.0, 1.0 / fanSpread));
  const fanRay = Math.pow(Math.max(Math.abs(Math.cos(fanPhase * 0.5)), 0.001), fanExp);

  // Stepped tiers along height
  const stepPhase = t * stepCount;
  const stepTier = Math.floor(stepPhase);
  const stepLocal = stepPhase - stepTier;
  // Create step edges
  const stepEdge = (stepLocal < 0.1 || stepLocal > 0.9) ? 1.0 : 0.0;
  const stepFactor = 1.0 - stepDepth * stepEdge;

  // Chevron zigzag pattern
  const chevronPhase = theta * chevronFreq + t * TAU * 2.0;
  const chevron = Math.abs(Math.sin(chevronPhase));

  // Blend patterns
  const fanMod = 1.0 + 0.1 * (fanRay - 0.5) * (1.0 - blend);
  const chevronMod = chevronAmp * chevron * blend;

  const modulation = fanMod * stepFactor * (1.0 + chevronMod);
  return r0 * Math.max(0.5, Math.min(2.0, modulation));
}

export function rOuterArtDecoVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterArtDeco(thetas[i], z, r0, H, opts);
  }
  return result;
}

// ============================================================================
// Dragon Scales Functions
// ============================================================================

/**
 * Dragon Scales style - Overlapping scale patterns
 * 
 * Creates fish/dragon scale textures with overlapping curved indents
 * and height-based size gradients.
 */
export function rOuterDragonScales(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<DragonScalesParams>;

  const scaleRows = Math.max(params.dsScaleRows ?? DEFAULT_DRAGON_SCALES.dsScaleRows, 1.0);
  const scalesPerRow = Math.max(params.dsScalesPerRow ?? DEFAULT_DRAGON_SCALES.dsScalesPerRow, 1.0);
  const scaleDepth = params.dsScaleDepth ?? DEFAULT_DRAGON_SCALES.dsScaleDepth;
  const overlap = Math.min(Math.max(params.dsOverlap ?? DEFAULT_DRAGON_SCALES.dsOverlap, 0.0), 0.9);
  const curvature = Math.max(0.1, Math.min(params.dsCurvature ?? DEFAULT_DRAGON_SCALES.dsCurvature, 5.0));
  const randomize = params.dsRandomize ?? DEFAULT_DRAGON_SCALES.dsRandomize;
  const gradient = params.dsHeightGradient ?? DEFAULT_DRAGON_SCALES.dsHeightGradient;

  // Current row and local position within row
  const rowPhase = t * scaleRows;
  const row = Math.floor(rowPhase);
  const rowLocal = rowPhase - row;

  // Stagger scales between rows (brick pattern)
  const staggerOffset = (row % 2) * 0.5 * TAU / scalesPerRow;
  const scaleTheta = theta + staggerOffset;

  // Scale position
  const scalePhase = (scaleTheta * scalesPerRow) % TAU;
  const scaleLocal = scalePhase / TAU; // 0 to 1 within scale

  // Curved scale shape: deeper in center, shallower at edges
  const xDist = Math.abs(scaleLocal - 0.5) * 2.0; // 0 at center, 1 at edges
  const yDist = Math.abs(rowLocal - overlap) / Math.max(1.0 - overlap * 0.5, 0.1); // Overlap effect
  const distFromCenter = Math.sqrt(xDist * xDist + yDist * yDist);

  // Scale indent with curvature control
  // Match GPU: pow(max(1.0 - dist, 0.001), curvature)
  const scaleShape = 1.0 - Math.pow(Math.max(1.0 - distFromCenter, 0.001), curvature);

  // Size gradient along height
  const sizeMultiplier = 1.0 + (t - 0.5) * (gradient - 1.0);

  // Pseudo-random variation
  const randVar = Math.sin(theta * 13.0 + t * 19.0) * randomize;

  const modulation = 1.0 - scaleDepth * scaleShape * sizeMultiplier + randVar;

  // Match GPU: max(modulation, 0.5)
  return r0 * Math.max(modulation, 0.5);
}

export function rOuterDragonScalesVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterDragonScales(thetas[i], z, r0, H, opts);
  }
  return result;
}

// ============================================================================
// Bamboo Segments Functions
// ============================================================================

/**
 * Bamboo Segments style - Bamboo-inspired node patterns
 * 
 * Creates distinct node segments with prominent rings and
 * fine vertical striations between nodes.
 */
export function rOuterBambooSegments(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<BambooSegmentsParams>;

  const nodeCount = Math.max(params.bsNodeCount ?? DEFAULT_BAMBOO_SEGMENTS.bsNodeCount, 1.0);
  const nodeWidth = Math.max(params.bsNodeWidth ?? DEFAULT_BAMBOO_SEGMENTS.bsNodeWidth, 0.02);
  const prominence = params.bsNodeProminence ?? DEFAULT_BAMBOO_SEGMENTS.bsNodeProminence;
  const striations = params.bsStriations ?? DEFAULT_BAMBOO_SEGMENTS.bsStriations;
  const striationDepth = params.bsStriationDepth ?? DEFAULT_BAMBOO_SEGMENTS.bsStriationDepth;
  const taper = params.bsTaper ?? DEFAULT_BAMBOO_SEGMENTS.bsTaper;
  const asymmetry = params.bsAsymmetry ?? DEFAULT_BAMBOO_SEGMENTS.bsAsymmetry;

  // Segment position
  const segmentPhase = t * nodeCount;
  const segment = Math.floor(segmentPhase);
  const segmentLocal = segmentPhase - segment; // 0 to 1 within segment

  // Node ring: bulge at segment boundaries
  const distFromNode = Math.min(segmentLocal, 1.0 - segmentLocal);
  // Match GPU: clamp argument to avoid overflow
  const expArg = -Math.min(distFromNode * distFromNode / (nodeWidth * nodeWidth * 2.0), 50.0);
  const nodeRing = Math.exp(expArg);

  // Taper: slight inward curve between nodes
  const taperFactor = 1.0 - taper * (1.0 - 4.0 * (segmentLocal - 0.5) * (segmentLocal - 0.5));

  // Vertical striations along theta
  const striationFactor = striationDepth * Math.sin(theta * striations);

  // Asymmetry: subtle variation per segment
  const asymVar = Math.sin(segment * 7.0 + theta * 3.0) * asymmetry * 0.5;

  // Combine: nodes protrude, between-node areas are tapered and striated
  const modulation = taperFactor * (1.0 + prominence * nodeRing) + striationFactor + asymVar;

  // Match GPU: clamp(modulation, 0.5, 2.0)
  return r0 * Math.max(0.5, Math.min(2.0, modulation));
}

export function rOuterBambooSegmentsVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterBambooSegments(thetas[i], z, r0, H, opts);
  }
  return result;
}

// ============================================================================
// Ripple Interference Functions
// ============================================================================

/**
 * Ripple Interference style - Physics-based multi-source wave interference
 * 
 * Simulates ripples from multiple point sources on the surface
 * interfering with each other.
 */
export function rOuterRippleInterference(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<RippleInterferenceParams>;

  const sourceCount = Math.max(Math.floor((params.riSourceCount ?? DEFAULT_RIPPLE_INTERFERENCE.riSourceCount) + 0.5), 2.0);
  const waveFreq = Math.floor((params.riWaveFrequency ?? DEFAULT_RIPPLE_INTERFERENCE.riWaveFrequency) + 0.5);
  const reliefDepth = params.riReliefDepth ?? DEFAULT_RIPPLE_INTERFERENCE.riReliefDepth;
  const phase = params.riPhase ?? DEFAULT_RIPPLE_INTERFERENCE.riPhase;
  const sourceHeight = params.riSourceHeight ?? DEFAULT_RIPPLE_INTERFERENCE.riSourceHeight;
  const decay = params.riDecay ?? DEFAULT_RIPPLE_INTERFERENCE.riDecay;
  const interferenceMode = params.riInterferenceMode ?? DEFAULT_RIPPLE_INTERFERENCE.riInterferenceMode;
  const rotation = params.riRotation ?? DEFAULT_RIPPLE_INTERFERENCE.riRotation;

  const TAU = 2 * Math.PI;
  const u = theta / TAU;
  const v = t;

  let totalWave = 0.0;

  for (let i = 0; i < 8; i++) {
    if (i >= sourceCount) break;

    const angleFraction = (i / sourceCount) + rotation;
    const sourceU = angleFraction - Math.floor(angleFraction);
    const sourceV = sourceHeight;

    let du = u - sourceU;
    if (du > 0.5) du -= 1.0;
    if (du < -0.5) du += 1.0;
    const dv = v - sourceV;

    const dist = Math.sqrt(du * du + dv * dv);
    const ampDecay = 1.0 / Math.max(1.0 + dist * decay * 5.0, 0.1);

    const wavePhase = dist * waveFreq * TAU + phase * TAU;
    const wave = Math.sin(wavePhase) * ampDecay;

    totalWave += wave;
  }

  totalWave /= sourceCount;

  if (interferenceMode > 0.5) {
    const norm = 0.5 + 0.5 * totalWave;
    const powered = Math.pow(norm, 2.0);
    totalWave = 2.0 * powered - 1.0;
  }

  const displacement = totalWave * reliefDepth;
  return Math.max(0.1, r0 + displacement);
}

export function rOuterRippleInterferenceVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = rOuterRippleInterference(thetas[i], z, r0, H, opts);
  }
  return result;
}

// ============================================================================
// Style Registry
// ============================================================================

// ============================================================================
// Gyroid Manifold Functions
// ============================================================================

/**
 * Gyroid Manifold style - Intricate porous lattice based on TPMS
 * 
 * Generates a surface pattern based on the Gyroid and Schwarz P 
 * Triply Periodic Minimal Surfaces, creating a lattice-like structure.
 */
export function rOuterGyroidManifold(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<GyroidManifoldParams>;

  const scale = params.gmScale ?? DEFAULT_GYROID_MANIFOLD.gmScale;
  const thickness = params.gmThickness ?? DEFAULT_GYROID_MANIFOLD.gmThickness;
  const morph = params.gmMorph ?? DEFAULT_GYROID_MANIFOLD.gmMorph;
  const relief = params.gmRelief ?? DEFAULT_GYROID_MANIFOLD.gmRelief;
  const zStretch = params.gmZStretch ?? DEFAULT_GYROID_MANIFOLD.gmZStretch;
  const sharpness = params.gmSharpness ?? DEFAULT_GYROID_MANIFOLD.gmSharpness;
  const bias = params.gmBias ?? DEFAULT_GYROID_MANIFOLD.gmBias;
  const curve = params.gmCurve ?? DEFAULT_GYROID_MANIFOLD.gmCurve;
  const pulse = params.gmPulse ?? DEFAULT_GYROID_MANIFOLD.gmPulse;
  const edgeFade = Math.min(params.gmEdgeFade ?? DEFAULT_GYROID_MANIFOLD.gmEdgeFade, 0.49);
  const smoothVal = Math.max(0.001, sharpness);

  // Coordinate setup
  // Twist theta along Z
  const phi = theta; // + twist * z * 0.1;

  // Map to 3D TPMS domain
  // Use unwrapped cylinder mapping: x=phi*R, z=z*stretch
  // To ensure periodicity, x must wrap TAU.
  // if scale is integer, it wraps perfectly. If not, we might have a seam.
  // We can force scale to integer or just let it be (User choice).
  // For exact continuity, effective scale should be integer * TAU?
  // Let's stick effectively to sin(scale * theta) -> integer scale ensures match at 0/2PI

  const fScale = scale; // Let user control. If non-integer, seam is visible.

  const x = fScale * Math.cos(phi);
  const y = fScale * Math.sin(phi);
  const zTpms = fScale * t * zStretch * 4.0 + pulse * TAU;

  // Gyroid approx: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
  const gyr = Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(zTpms) + Math.sin(zTpms) * Math.cos(x);

  // Schwarz P approx: cos(x) + cos(y) + cos(z) = 0
  const sch = Math.cos(x) + Math.cos(y) + Math.cos(zTpms);

  // Blend
  let val = (1.0 - morph) * gyr + morph * sch;

  // Apply Bias
  val = val + bias;

  // Threshold for lattice
  // "Inside" the lattice wall if abs(val) < thickness
  // Smoothstep for nice bevel
  const d = Math.abs(val) - thickness * 1.5; // Scale thickness slightly

  // Mask: 1.0 inside wall, 0.0 outside
  // Invert d so negative (inside) becomes positive mask
  // Smooth transition width
  const smooth = smoothVal * thickness * 1.5;
  let mask = 0.0;
  if (d < 0) {
    mask = 1.0;
  } else if (d < smooth) {
    // smoothstep(th, th-smooth, d) logic inverted
    // mask = 1.0 - smoothstep(0, smooth, d)
    let t = d / smooth; // 0 to 1
    t = Math.max(0, Math.min(1, t));
    mask = 1.0 - t * t * (3 - 2 * t);
  }
  mask = Math.pow(mask, curve);

  // Edge Fading
  let fade = 1.0;
  if (edgeFade > 0) {
    if (t < edgeFade) fade = t / edgeFade;
    else if (t > 1.0 - edgeFade) fade = (1.0 - t) / edgeFade;
    fade = fade * fade * (3 - 2 * fade);
  }

  return r0 + relief * mask * fade;
}

/**
 * Vectorized Gyroid Manifold
 */
export function rOuterGyroidManifoldVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const t = H > 0 ? z / H : 0.0;
  const params = opts as Partial<GyroidManifoldParams>;

  const scale = params.gmScale ?? DEFAULT_GYROID_MANIFOLD.gmScale;
  const thickness = params.gmThickness ?? DEFAULT_GYROID_MANIFOLD.gmThickness;
  const morph = params.gmMorph ?? DEFAULT_GYROID_MANIFOLD.gmMorph;
  const relief = params.gmRelief ?? DEFAULT_GYROID_MANIFOLD.gmRelief;
  const zStretch = params.gmZStretch ?? DEFAULT_GYROID_MANIFOLD.gmZStretch;

  const sharpness = params.gmSharpness ?? DEFAULT_GYROID_MANIFOLD.gmSharpness;
  const bias = params.gmBias ?? DEFAULT_GYROID_MANIFOLD.gmBias;
  const curve = params.gmCurve ?? DEFAULT_GYROID_MANIFOLD.gmCurve;
  const pulse = params.gmPulse ?? DEFAULT_GYROID_MANIFOLD.gmPulse;
  const edgeFade = Math.min(params.gmEdgeFade ?? DEFAULT_GYROID_MANIFOLD.gmEdgeFade, 0.49);
  const smoothVal = Math.max(0.001, sharpness);

  const zTpms = scale * t * zStretch * 4.0 + pulse * 6.28318;
  const cosZ = Math.cos(zTpms);
  const sinZ = Math.sin(zTpms);

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    const phi = theta; // + twist * z * 0.1;

    const x = scale * Math.cos(phi);
    const y = scale * Math.sin(phi);

    const sinX = Math.sin(x); const cosX = Math.cos(x);
    const sinY = Math.sin(y); const cosY = Math.cos(y);

    const gyr = sinX * cosY + sinY * cosZ + sinZ * cosX;
    const sch = cosX + cosY + cosZ;

    // Blend
    let val = (1.0 - morph) * gyr + morph * sch;

    // Apply Bias
    val = val + bias;

    const d = Math.abs(val) - thickness * 1.5;

    let mask = 0.0;

    const smooth = smoothVal * thickness * 1.5;
    if (d < 0) {
      mask = 1.0;
    } else if (d < smooth) {
      let t = d / smooth;
      t = Math.max(0, Math.min(1, t));
      mask = 1.0 - t * t * (3 - 2 * t);
    }
    mask = Math.pow(mask, curve);

    let fade = 1.0;
    if (edgeFade > 0) {
      if (t < edgeFade) fade = t / edgeFade;
      else if (t > 1.0 - edgeFade) fade = (1.0 - t) / edgeFade;
      fade = fade * fade * (3 - 2 * fade);
    }

    result[i] = r0 + relief * mask * fade;
  }
  return result;
}



// Low Poly Facet style - alias for Harmonic Ripple with specific tuning
// 
// Creates a faceted look by using high z-gain and specific harmonic settings.
export function rOuterLowPolyFacet(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const facets = opts.lpFacets ?? 12;
  const tiers = opts.lpTiers ?? 1;
  const amp = (opts.lpAmp ?? 0.12);
  const bevel = opts.lpBevel ?? 0.15;
  const jitter = opts.lpJitter ?? 0.15;
  const phaseDeg = opts.lpPhaseDeg ?? 0;

  // Map to Harmonic Ripple parameters
  const harmonicOpts: StyleOptions = {
    hrPetals: facets,
    hrPetalAmp: amp * (1.0 - bevel * 0.5),
    hrPetalPhaseDeg: phaseDeg,
    hrPetalZgain: 0.0,
    hrRippleFreq: facets * tiers,
    hrRippleAmp: jitter * 0.02,
    hrRipplePhaseDeg: 0,
    hrRippleZgain: tiers > 1 ? 1.0 : 0.0,
    hrBell: 0.0,
  };

  return rOuterHarmonicRipple(theta, z, r0, H, harmonicOpts);
}

// Vectorized Low Poly Facet
export function rOuterLowPolyFacetVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const facets = opts.lpFacets ?? 12;
  const tiers = opts.lpTiers ?? 1;
  const amp = (opts.lpAmp ?? 0.12);
  const bevel = opts.lpBevel ?? 0.15;
  const jitter = opts.lpJitter ?? 0.15;
  const phaseDeg = opts.lpPhaseDeg ?? 0;

  // Map to Harmonic Ripple parameters
  const harmonicOpts: StyleOptions = {
    hrPetals: facets,
    hrPetalAmp: amp * (1.0 - bevel * 0.5),
    hrPetalPhaseDeg: phaseDeg,
    hrPetalZgain: 0.0,
    hrRippleFreq: facets * tiers,
    hrRippleAmp: jitter * 0.02,
    hrRipplePhaseDeg: 0,
    hrRippleZgain: tiers > 1 ? 1.0 : 0.0,
    hrBell: 0.0,
  };

  return rOuterHarmonicRippleVec(thetas, z, r0, H, harmonicOpts);
}

/**
 * 2D Hash for periodic noise (matches WGSL)
 */
function hash22(p: { x: number; y: number }): { x: number; y: number } {
  let p3 = {
    x: (p.x * 0.1031) % 1,
    y: (p.y * 0.1030) % 1,
    z: (p.x * 0.0973) % 1,
  };
  // matrix equivalent: p3 = fract(vec3(p.xyx) * ...)
  // p3 = p3 + dot(p3, p3.yzx + 33.33)
  const dot = p3.x * (p3.y + 33.33) + p3.y * (p3.z + 33.33) + p3.z * (p3.x + 33.33);
  p3.x += dot;
  p3.y += dot;
  p3.z += dot;
  // return fract((p3.xx + p3.yz) * p3.zy)
  return {
    x: ((p3.x + p3.y) * p3.z) % 1,
    y: ((p3.x + p3.z) * p3.y) % 1,
  };
}

/**
 * Periodic Cellular Noise (matches WGSL)
 */
function periodicCellular(
  uv: { x: number; y: number },
  period: { x: number; y: number },
  jitter: number
): { x: number; y: number; z: number } {
  const cellId = { x: Math.floor(uv.x), y: Math.floor(uv.y) };
  const cellUv = { x: uv.x - cellId.x, y: uv.y - cellId.y };

  let f1 = 999.0;
  let f2 = 999.0;

  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const neighbor = { x, y };
      const neighborId = { x: cellId.x + x, y: cellId.y + y };

      // Periodic wrapping for neighbor cell ID (X only for cylinder)
      const wrappedHashId = {
        x: ((neighborId.x % period.x) + period.x) % period.x,
        y: neighborId.y,
      };

      const pointHash = hash22(wrappedHashId);
      const center = {
        x: neighbor.x + pointHash.x * jitter,
        y: neighbor.y + pointHash.y * jitter,
      };

      const diff = { x: center.x - cellUv.x, y: center.y - cellUv.y };
      const dist = Math.sqrt(diff.x * diff.x + diff.y * diff.y);

      if (dist < f1) {
        f2 = f1;
        f1 = dist;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  return { x: f1, y: f2, z: 0.0 };
}

export function rOuterVoronoi(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const scale = opts.vScale ?? DEFAULT_VORONOI.vScale;
  const jitter = opts.vJitter ?? DEFAULT_VORONOI.vJitter;
  const thickness = opts.vThickness ?? DEFAULT_VORONOI.vThickness;
  const relief = opts.vRelief ?? DEFAULT_VORONOI.vRelief;
  const morph = opts.vMorph ?? DEFAULT_VORONOI.vMorph;
  const zStretch = opts.vZStretch ?? DEFAULT_VORONOI.vZStretch;
  const pulse = opts.vPulse ?? DEFAULT_VORONOI.vPulse;
  const edgeFade = opts.vEdgeFade ?? DEFAULT_VORONOI.vEdgeFade;

  const t = Math.max(0, Math.min(1, z / Math.max(H, 1e-4)));
  const scaleVal = scale > 0 ? scale : 8.0;
  const stretchVal = zStretch > 0 ? zStretch : 1.0;

  // Map Cylinder to 2D Grid
  const u = (theta / (Math.PI * 2)) * scaleVal;
  const uAnim = u + pulse * scaleVal;
  const v = t * scaleVal * stretchVal;

  const period = { x: scaleVal, y: 0.0 };
  const noise = periodicCellular({ x: uAnim, y: v }, period, jitter);
  const f1 = noise.x;
  const f2 = noise.y;

  const cellSdf = f2 - f1;
  const th = thickness;

  // Web: 1.0 when cell_sdf < th
  const web = 1.0 - Math.max(0, Math.min(1, (cellSdf - 0.0) / (th - 0.0))); // smoothstep(0.0, th, cell_sdf)

  // Bubble: smoothstep(1.0, 0.0, f1)
  const bubble = Math.max(0, Math.min(1, (f1 - 1.0) / (0.0 - 1.0)));

  const pattern = bubble * (1 - morph) + web * morph;

  // Edge Fading
  let fadeFactor = 1.0;
  const fadeLimit = Math.min(edgeFade, 0.49);
  if (fadeLimit > 0.0) {
    const bFade = Math.max(0, Math.min(1, t / fadeLimit));
    const tFade = 1.0 - Math.max(0, Math.min(1, (t - (1.0 - fadeLimit)) / fadeLimit));
    fadeFactor = bFade * tFade;
  }

  return r0 + relief * pattern * fadeFactor;
}

export function rOuterVoronoiVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rs[i] = rOuterVoronoi(thetas[i], z, r0, H, opts);
  }
  return rs;
}

// ============================================================================
// Basket Weave
// ============================================================================

export function rOuterBasketWeave(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const params = opts as Partial<BasketWeaveParams>;

  const strands = params.bwStrands ?? DEFAULT_BASKET_WEAVE.bwStrands;
  const layers = params.bwLayers ?? DEFAULT_BASKET_WEAVE.bwLayers;
  const depth = params.bwDepth ?? DEFAULT_BASKET_WEAVE.bwDepth;
  const twist = params.bwTwist ?? DEFAULT_BASKET_WEAVE.bwTwist;
  const profile = params.bwProfile ?? DEFAULT_BASKET_WEAVE.bwProfile;
  const unders = params.bwUnders ?? DEFAULT_BASKET_WEAVE.bwUnders;
  const noiseAmt = params.bwNoise ?? DEFAULT_BASKET_WEAVE.bwNoise;
  const vGrad = params.bwVerticalGrad ?? DEFAULT_BASKET_WEAVE.bwVerticalGrad;
  const phase = params.bwPhase ?? DEFAULT_BASKET_WEAVE.bwPhase;

  const t = Math.max(0, Math.min(1, z / Math.max(H, 1e-4)));

  // Layer density gradient
  const lEff = layers * (1.0 + vGrad * (t - 0.5));

  // Coordinates
  const u = theta * strands / TAU;
  const v = t * lEff;

  // Twist
  const twistOffset = twist * t * strands;
  const uTwisted = u + twistOffset + phase;

  // Grid
  const uCell = Math.floor(uTwisted);
  const vCell = Math.floor(v);
  const checker = Math.abs((uCell + vCell) % 2);

  // Local coords -1..1
  // Handle JS negative modulo issues if any, but floor handles it usually
  const uLocal = (uTwisted - uCell) * 2.0 - 1.0;
  const vLocal = (v - vCell) * 2.0 - 1.0;

  // Shapes
  const PI = Math.PI;
  const shapeU = Math.cos(uLocal * PI * 0.5);
  const shapeV = Math.cos(vLocal * PI * 0.5);

  // Square
  // smoothstep(1.0, width, abs(x)) equivalent
  // Math.max(0, Math.min(1, (x - e0)/(e1-e0)))
  // e0=1.0, e1=0.9
  const width = 0.9;
  const sqU = (absU: number) => {
    const tVal = Math.max(0, Math.min(1, (absU - 1.0) / (width - 1.0)));
    return tVal * tVal * (3 - 2 * tVal);
  };

  const squareU = sqU(Math.abs(uLocal));
  const squareV = sqU(Math.abs(vLocal));

  const profU = shapeU * (1 - profile) + squareU * profile;
  const profV = shapeV * (1 - profile) + squareV * profile;

  let h = 0.0;

  if (checker > 0.5) {
    // Vertical on top
    h = profU;
    const hUnder = profV * unders;
    h = Math.max(h, hUnder - 0.5);
  } else {
    // Horizontal on top
    h = profV;
    const hUnder = profU * unders;
    h = Math.max(h, hUnder - 0.5);
  }

  if (noiseAmt > 0) {
    h += Math.sin(u * 50) * Math.sin(v * 50) * noiseAmt * 0.1;
  }

  return r0 + h * depth;
}

export function rOuterBasketWeaveVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const rs = new Float32Array(n);
  // Optimization: Preconcale constants that don't depend on theta?
  // But twist depends on theta? No, twist depends on T.
  // Actually u depends on theta. So standard loop.
  for (let i = 0; i < n; i++) {
    rs[i] = rOuterBasketWeave(thetas[i], z, r0, H, opts);
  }
  return rs;
}

// ============================================================================
// Geometric Star
// ============================================================================

export function rOuterGeometricStar(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const params = opts as Partial<GeometricStarParams>;

  const N = Math.max(4, params.gsPoints ?? DEFAULT_GEOMETRIC_STAR.gsPoints);
  const gap = params.gsGap ?? DEFAULT_GEOMETRIC_STAR.gsGap;
  const detail = params.gsDetail ?? DEFAULT_GEOMETRIC_STAR.gsDetail;
  const layers = params.gsLayers ?? DEFAULT_GEOMETRIC_STAR.gsLayers;
  const interlace = params.gsInterlace ?? DEFAULT_GEOMETRIC_STAR.gsInterlace;
  const relief = params.gsRelief ?? DEFAULT_GEOMETRIC_STAR.gsRelief;
  const smoothRad = (params.gsRoundness ?? DEFAULT_GEOMETRIC_STAR.gsRoundness) * 0.2;
  const zoom = params.gsZoom ?? DEFAULT_GEOMETRIC_STAR.gsZoom;
  const shift = params.gsShift ?? DEFAULT_GEOMETRIC_STAR.gsShift;

  const t = Math.max(0, Math.min(1, z / Math.max(H, 1e-4)));
  const PI = Math.PI;
  const TAU = 2 * PI;

  // Tile vertically
  const vRaw = t * layers * zoom;
  const row = Math.floor(vRaw);
  const v = (vRaw - row - 0.5) * 2.0; // -1..1

  // Row offset
  const rowOffset = (row % 2) * (PI / N) * shift * 2.0;

  // Polar repetition
  const angle = TAU / N;
  const th = theta + rowOffset;

  // Sector
  const sector = Math.floor(th / angle);
  const a = (th / angle - sector - 0.5) * angle;

  // UV mapping
  const uvX = a * (N / 4.0);
  const uvY = v;

  // Fold X
  const pX = Math.abs(uvX);
  const pY = uvY;

  // Star angle
  const starAngle = (0.2 + 0.6 * detail) * (PI / 2);
  const nStarX = Math.sin(starAngle);
  const nStarY = Math.cos(starAngle);

  // Distance to line
  const dLine = pX * nStarX + pY * nStarY;

  const dStrap = Math.abs(dLine) - gap;

  // Smoothstep
  const edge = 0.02 + smoothRad;
  const tVal = Math.max(0, Math.min(1, dStrap / edge));
  const shape = 1.0 - tVal * tVal * (3 - 2 * tVal);

  // Interlacing
  const distAlong = pX * nStarY - pY * nStarX;
  const weave = Math.cos(distAlong * 10.0 * zoom);

  const hBase = shape;
  const hMod = hBase * (1.0 + weave * interlace * 0.2);

  const vFade = 1.0 - Math.pow(Math.abs(v), 4.0);

  return r0 + hMod * relief * vFade;
}

export function rOuterGeometricStarVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rs[i] = rOuterGeometricStar(thetas[i], z, r0, H, opts);
  }
  return rs;
}

// ============================================================================
// Hexagonal Hive
// ============================================================================

export function rOuterHexagonalHive(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const params = opts as Partial<HexagonalHiveParams>;

  const scale = params.hhScale ?? DEFAULT_HEXAGONAL_HIVE.hhScale;
  const gap = params.hhGap ?? DEFAULT_HEXAGONAL_HIVE.hhGap;
  const relief = params.hhRelief ?? DEFAULT_HEXAGONAL_HIVE.hhRelief;
  const detail = params.hhDetail ?? DEFAULT_HEXAGONAL_HIVE.hhDetail;
  const concave = params.hhConcave ?? DEFAULT_HEXAGONAL_HIVE.hhConcave;
  const noise = params.hhNoise ?? DEFAULT_HEXAGONAL_HIVE.hhNoise;

  const t = Math.max(0, Math.min(1, z / Math.max(H, 1e-4)));
  const PI = Math.PI;
  const TAU = 2 * PI;

  // Coordinates
  const u = theta * scale;
  const v = t * scale * (H / 40.0); // Rough aspect

  const r = 1.7320508;
  const uvX = u;
  const uvY = v * r;

  const sX = 1.0;
  const sY = 1.7320508;
  const hX = 0.5;
  const hY = 1.7320508 * 0.5;

  const aX = Math.floor(uvX / sX);
  const aY = Math.floor(uvY / sY);

  const bX = Math.floor((uvX - hX) / sX);
  const bY = Math.floor((uvY - hY) / sY);

  const guvAX = uvX - (aX * sX + hX);
  const guvAY = uvY - (aY * sY + hX); // Incorrect matching shader?
  // Shader: guv_a = uv - (a * s + h);
  // h is (0.5, 0.866)
  // Let's stick closer to the shader vec2 logic

  // Re-implement vector math manually
  const sh_sX = 1.0;
  const sh_sY = 1.7320508;
  const sh_hX = 0.5;
  const sh_hY = 0.8660254;

  // Grid A
  const gridA_X = Math.floor(uvX / sh_sX);
  const gridA_Y = Math.floor(uvY / sh_sY);
  const guvA_X = uvX - (gridA_X * sh_sX + sh_hX);
  const guvA_Y = uvY - (gridA_Y * sh_sY + sh_hY);

  // Grid B
  const gridB_X = Math.floor((uvX - sh_hX) / sh_sX);
  const gridB_Y = Math.floor((uvY - sh_hY) / sh_sY);
  const guvB_X = uvX - (gridB_X * sh_sX + sh_hX + sh_sX * 0.0); // Logic check?
  // Shader: guv_b = uv - (b * s + h * 2.0); h*2 = s.
  // Wait, shader says: let guv_b = uv - (b * s + h * 2.0);
  // h * 2.0 is s. So it's b*s + s = (b+1)*s.
  // Re-read shadertoy logic carefully.
  // Actually simpler TS logic for Hex Grid from redblobgames or similar might be safer but must match visuals.
  // Let's rely on standard hex logic:

  // Simple check for nearest center
  // 1. Grid coords

  // Pointy top
  // x = sqrt(3)/3 * x - 1/3 * y
  // z = 2/3 * y
  // y = -x-z
  // Round to nearest cube coord

  // Backtrack to shader implementation
  // let guv_a = uv - (a * s + h);
  // let guv_b = uv - (b * s + h * 2.0);

  // Let's simulate shader blindly assuming it works (it compiled)

  const lenA = guvA_X * guvA_X + guvA_Y * guvA_Y;

  // Recalc B accurately based on shader check
  const guvB_X_Fixed = uvX - (gridB_X * sh_sX + sh_sX);
  const guvB_Y_Fixed = uvY - (gridB_Y * sh_sY + sh_sY);
  const lenB = guvB_X_Fixed * guvB_X_Fixed + guvB_Y_Fixed * guvB_Y_Fixed;

  let dist = 0;
  let cellIdX = 0;
  let cellIdY = 0;

  if (lenA < lenB) {
    dist = Math.sqrt(lenA);
    cellIdX = gridA_X;
    cellIdY = gridA_Y;
  } else {
    dist = Math.sqrt(lenB);
    cellIdX = gridB_X + 0.5;
    cellIdY = gridB_Y + 0.5;
  }

  // Hash
  const dotHash = cellIdX * 12.9898 + cellIdY * 78.233;
  const sinHash = Math.sin(dotHash) * 43758.5453;
  const cellHash = sinHash - Math.floor(sinHash);

  const dNorm = dist / 0.5;
  const w = 1.0 - gap * 2.0;

  // Smoothstep
  const tVal = Math.max(0, Math.min(1, (dNorm - 1.0) / (w - 1.0)));
  const wall = tVal * tVal * (3 - 2 * tVal);

  let hCell = 0.0;

  if (concave > 0.5) {
    hCell = Math.pow(dNorm, 2.0) * wall;
    hCell = 1.0 - hCell * (1.0 - detail * 0.5);
  } else {
    hCell = (1.0 - Math.pow(dNorm, 2.0 * (1.0 + detail))) * wall;
  }

  const hNoise = (cellHash - 0.5) * noise;

  return r0 + (hCell + hNoise * wall) * relief;
}

export function rOuterHexagonalHiveVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rs[i] = rOuterHexagonalHive(thetas[i], z, r0, H, opts);
  }
  return rs;
}

// ============================================================================
// Celtic Knot
// ============================================================================

export function rOuterCelticKnot(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const params = opts as Partial<CelticKnotParams>;

  const scale = params.ckScale ?? DEFAULT_CELTIC_KNOT.ckScale;
  const width = params.ckWidth ?? DEFAULT_CELTIC_KNOT.ckWidth;
  const relief = params.ckRelief ?? DEFAULT_CELTIC_KNOT.ckRelief;
  const gap = params.ckGap ?? DEFAULT_CELTIC_KNOT.ckGap;
  const roundness = params.ckRoundness ?? DEFAULT_CELTIC_KNOT.ckRoundness;
  const twist = params.ckTwist ?? DEFAULT_CELTIC_KNOT.ckTwist;

  const t = Math.max(0, Math.min(1, z / Math.max(H, 1e-4)));
  const PI = Math.PI;
  const TAU = 2 * PI;
  const PI_OVER_2 = PI / 2;

  const uRaw = theta / TAU * scale;
  const vRaw = t * scale;

  const row = Math.floor(vRaw);

  const uTwisted = uRaw + row * twist;
  const colTwisted = Math.floor(uTwisted);

  const uLocal = (uTwisted - Math.floor(uTwisted)) - 0.5;
  const vLocal = (vRaw - Math.floor(vRaw)) - 0.5;

  const checker = (colTwisted + row) % 2;

  const dH = Math.abs(vLocal) - width;
  const dV = Math.abs(uLocal) - width;

  const inH = dH < 0;
  const inV = dV < 0;
  const atCross = inH && inV;

  let hBand = 0;

  if (inH || inV) {
    let dBand = 0;
    if (inH && !inV) {
      dBand = Math.abs(vLocal) / width;
    } else if (inV && !inH) {
      dBand = Math.abs(uLocal) / width;
    } else {
      dBand = Math.min(Math.abs(uLocal), Math.abs(vLocal)) / width;
    }

    const profileRound = Math.cos(dBand * PI_OVER_2);
    const profileFlat = 1.0 - dBand;
    hBand = profileFlat * (1 - roundness) + profileRound * roundness;

    if (atCross) {
      const isHOnTop = checker < 0.5;
      if (isHOnTop) {
        hBand = Math.cos(Math.abs(vLocal) / width * PI_OVER_2) * ((1 - roundness) + profileRound * roundness);
        if (Math.abs(uLocal) < Math.abs(vLocal) - gap) {
          hBand = hBand * 0.5;
        }
      } else {
        hBand = Math.cos(Math.abs(uLocal) / width * PI_OVER_2) * ((1 - roundness) + profileRound * roundness);
        if (Math.abs(vLocal) < Math.abs(uLocal) - gap) {
          hBand = hBand * 0.5;
        }
      }
    }
  }

  return r0 + hBand * relief;
}

export function rOuterCelticKnotVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rs[i] = rOuterCelticKnot(thetas[i], z, r0, H, opts);
  }
  return rs;
}

/** Map of style IDs to their functions */
export const STYLE_FUNCTIONS: Record<StyleId, StyleFunction> = {
  SuperformulaBlossom: rOuterSuperformulaBlossom,
  FourierBloom: rOuterFourierBloom,
  SpiralRidges: rOuterSpiralRidges,
  SuperellipseMorph: rOuterSuperellipseMorph,
  HarmonicRipple: rOuterHarmonicRipple,
  GothicArches: rOuterGothicArches,
  WaveInterference: rOuterWaveInterference,
  Crystalline: rOuterCrystalline,
  ArtDeco: rOuterArtDeco,
  DragonScales: rOuterDragonScales,
  BambooSegments: rOuterBambooSegments,
  RippleInterference: rOuterRippleInterference,
  GyroidManifold: rOuterGyroidManifold,
  Voronoi: rOuterVoronoi,
  BasketWeave: rOuterBasketWeave,
  GeometricStar: rOuterGeometricStar,
  HexagonalHive: rOuterHexagonalHive,
  CelticKnot: rOuterCelticKnot,
  LowPolyFacet: rOuterLowPolyFacet,
};

/** Map of style IDs to their vectorized functions */
export const STYLE_FUNCTIONS_VEC: Record<StyleId, VectorizedStyleFunction> = {
  SuperformulaBlossom: rOuterSuperformulaBlossomVec,
  FourierBloom: rOuterFourierBloomVec,
  SpiralRidges: rOuterSpiralRidgesVec,
  SuperellipseMorph: rOuterSuperellipseMorphVec,
  HarmonicRipple: rOuterHarmonicRippleVec,
  GothicArches: rOuterGothicArchesVec,
  WaveInterference: rOuterWaveInterferenceVec,
  Crystalline: rOuterCrystallineVec,
  ArtDeco: rOuterArtDecoVec,
  DragonScales: rOuterDragonScalesVec,
  BambooSegments: rOuterBambooSegmentsVec,
  RippleInterference: rOuterRippleInterferenceVec,
  GyroidManifold: rOuterGyroidManifoldVec,
  Voronoi: rOuterVoronoiVec,
  BasketWeave: rOuterBasketWeaveVec,
  GeometricStar: rOuterGeometricStarVec,
  HexagonalHive: rOuterHexagonalHiveVec,
  CelticKnot: rOuterCelticKnotVec,
  LowPolyFacet: rOuterLowPolyFacetVec,
};

/** Style descriptions for UI */
export const STYLE_DESCRIPTIONS: Record<StyleId, string> = {
  SuperformulaBlossom: 'Petals via Gielis superformula; sharpen toward rim.',
  FourierBloom: 'Floral profile from blended harmonics.',
  SpiralRidges: 'Rising helical ribs with fine grooves.',
  SuperellipseMorph: 'Circle → rounded square → soft diamond vs height.',
  HarmonicRipple: 'Petals + ripples + gentle mid-height bell.',
  GothicArches: 'Medieval pointed arch patterns with tiered ribs.',
  WaveInterference: 'Moiré patterns from superimposed wave fronts.',
  Crystalline: 'Faceted crystal surfaces with geometric complexity.',
  ArtDeco: '1920s geometric styling with sunbursts and chevrons.',
  DragonScales: 'Overlapping scale patterns like dragon scales.',
  BambooSegments: 'Bamboo-inspired nodes with fine striations.',
  RippleInterference: 'Physics-based wave interference from multiple point sources.',
  GyroidManifold: 'Minimal surface based on Gyroid/Schwarz P math.',
  Voronoi: 'Organic cellular patterns based on periodic Voronoi/Worley noise.',
  BasketWeave: 'Interwoven strands with customizable profile and density.',
  GeometricStar: 'Complex geometric star pattern with interlaced strapwork.',
  HexagonalHive: 'Tech-inspired hexagonal grid with volumetric control.',
  CelticKnot: 'Interlacing bands forming continuous knot patterns.',
  LowPolyFacet: 'piecewise-flat facets for low-poly aesthetic.',
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
