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
  DEFAULT_SUPERFORMULA,
  DEFAULT_FOURIER,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
  DEFAULT_GOTHIC_ARCHES,
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
// Gothic Arches v3 - Tiered Cathedral Relief with Plateau Ridges
// ============================================================================

// Helper functions for Gothic Arches v3
const sat = (x: number): number => Math.min(1, Math.max(0, x));
const bump = (x: number): number => x * x * (3 - 2 * x);

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = sat((x - e0) / Math.max(EPSILON, e1 - e0));
  return t * t * (3 - 2 * t);
};

// Saturating union - prevents peak stacking at intersections
const uni = (a: number, b: number): number => a + b - a * b;

// Flat-top ridge: wide printable ribs, no needle peaks
const ridgePlateau = (d: number, wIn: number, firm: number): number => {
  const w = Math.max(EPSILON, wIn);
  const core = 0.55 * w; // plateau half-width
  const u = (Math.abs(d) - core) / Math.max(EPSILON, w - core);
  const s = 1 - bump(sat(u));
  return Math.pow(s, firm);
};

// Plateau ridge around sin(phi)=0 lines (for lattice diagonals)
const ridgeSinPlateau = (phi: number, wIn: number, firm: number): number => {
  const d = Math.abs(Math.sin(phi));
  const w = Math.max(EPSILON, wIn);
  const core = 0.35 * w;
  const u = (d - core) / Math.max(EPSILON, w - core);
  const s = 1 - bump(sat(u));
  return Math.pow(s, firm);
};

/**
 * Gothic Arches v3 - Two-tier cathedral relief with plateau ridges
 * 
 * Key improvements over v2:
 * - Plateau ridges: flat-topped ribs, no needle peaks with thick ribs
 * - Saturating union: prevents intersection peak stacking
 * - Explicit tier separation: Tracery Start control for clean division
 * - Panel recess: "finished" look even with soft edges
 * 
 * @param theta - Angular position around pot (radians)
 * @param z - Height position (mm)
 * @param r0 - Base radius at this height (mm)
 * @param H - Total pot height (mm)
 * @param opts - Style parameters (GothicArchesParams v3)
 * @returns Modified radius (mm) = r0 + amp * pattern
 */
export function rOuterGothicArches(
  theta: number,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): number {
  const PI = Math.PI;
  const params = opts as Partial<GothicArchesParams>;

  // --- Parameters (indices 0-11 match UI/packer/shader v3)
  const N = Math.max(1, Math.floor((params.gaCounts ?? DEFAULT_GOTHIC_ARCHES.gaCounts) + 0.5));
  const amp = params.gaRelief ?? DEFAULT_GOTHIC_ARCHES.gaRelief;
  
  const p = Math.max(0.25, params.gaPointiness ?? DEFAULT_GOTHIC_ARCHES.gaPointiness);
  const topAmt = sat(params.gaDiamond ?? DEFAULT_GOTHIC_ARCHES.gaDiamond);
  const xAmt = sat(params.gaX ?? DEFAULT_GOTHIC_ARCHES.gaX);
  
  const z0 = sat(params.gaSpring ?? DEFAULT_GOTHIC_ARCHES.gaSpring);
  const zh = sat(params.gaArchHeight ?? DEFAULT_GOTHIC_ARCHES.gaArchHeight) * (1 - z0);
  
  const wZ = Math.max(EPSILON, params.gaRib ?? DEFAULT_GOTHIC_ARCHES.gaRib);
  const wX = Math.max(EPSILON, params.gaCol ?? DEFAULT_GOTHIC_ARCHES.gaCol);
  
  // Keep edge firmness LOW as requested (1-2 range)
  const firm = Math.min(2.0, Math.max(1.0, params.gaSharp ?? DEFAULT_GOTHIC_ARCHES.gaSharp));
  
  // New v3: explicit tier split + panel recess
  const topStart = sat(params.gaTopStart ?? DEFAULT_GOTHIC_ARCHES.gaTopStart);
  const recess = sat(params.gaRecess ?? DEFAULT_GOTHIC_ARCHES.gaRecess) * 0.6; // scale so 1.0 isn't insane

  const t = sat(z / Math.max(EPSILON, H));

  // --- Robust bay coordinate (perfect "N arches" control)
  // f is 0..1 within each bay
  const u = (theta * N) / TAU;
  const f = u - Math.floor(u);
  const xSigned = 2 * f - 1;      // -1..1
  const xAbs = Math.abs(xSigned); // 0 center, 1 edges
  const x01 = f;                  // 0..1 across bay

  // Blend width tied to thickness (keeps chunky)
  const blendW = Math.max(0.02, 1.5 * wZ);
  const topMask = smoothstep(topStart - blendW, topStart + blendW, t);
  const botMask = 1 - topMask;

  // ============================================================
  // LOWER TIER: lancet arches + columns + recessed panel
  // ============================================================
  const archApex = Math.min(z0 + zh, topStart - 0.6 * wZ);
  const archH = Math.max(EPSILON, archApex - z0);

  const archY = Math.pow(Math.max(0, 1 - Math.pow(xAbs, p)), 1 / p);
  const archZ = z0 + archH * archY;

  const gateW = 2.0 * wZ;
  const gate = sat((t - z0) / gateW) * sat((archZ - t) / gateW);

  const ribArch = ridgePlateau(t - archZ, wZ, firm);

  // Big readable columns / mullion
  const colEdge = ridgePlateau(1 - xAbs, wX, firm) * gate;
  const mullion = ridgePlateau(xAbs, 0.65 * wX, firm) * gate;

  // In-arch X tracery (confined inside the arch)
  const denom = Math.max(EPSILON, archZ - z0);
  const s = sat((t - z0) / denom);
  const wT = 0.75 * wX;
  const xDiag = gate * uni(
    ridgePlateau(s - x01, wT, firm),
    ridgePlateau(s - (1 - x01), wT, firm)
  );

  // Combine without peak stacking
  let lower = 0.0;
  lower = uni(lower, ribArch);
  lower = uni(lower, 0.90 * colEdge);
  lower = uni(lower, 0.45 * mullion);
  lower = uni(lower, xAmt * 0.65 * xDiag);

  // Recess panel behind ribs (keeps it "finished")
  const panel = gate * Math.pow(Math.max(0, 1 - xAbs / 0.95), 2.0);
  lower = Math.max(0, lower - recess * panel * (1 - lower));

  // Strong separator band at tier boundary (matches picture)
  const midBand = ridgePlateau(t - topStart, 2.2 * wZ, firm);
  lower = uni(lower, 0.55 * midBand);

  // ============================================================
  // UPPER TIER: big X / diamond tracery confined to top
  // ============================================================
  const v = sat((t - topStart) / Math.max(EPSILON, 1 - topStart));

  // Make density grow with Top Tracery slider
  const rows = 1.0 + 2.0 * topAmt;

  // Lattice width derived from rib thickness (print-safe)
  const wL = Math.max(0.08, 1.8 * wZ);

  const phi1 = PI * (rows * v - x01);
  const phi2 = PI * (rows * v + x01);

  let lattice = 0.0;
  lattice = uni(lattice, ridgeSinPlateau(phi1, wL, firm));
  lattice = uni(lattice, ridgeSinPlateau(phi2, wL, firm));

  // Soft "cell fill" (gives the ornamental look without tiny details)
  const cell = Math.pow(Math.abs(Math.sin(phi1)) * Math.abs(Math.sin(phi2)), 2.0);
  lattice = uni(lattice, 0.25 * cell);

  let upper = topAmt * lattice;
  upper = uni(upper, 0.60 * midBand);

  // Final blend + clamp
  const pattern = sat(botMask * lower + topMask * upper);
  return r0 + amp * pattern;
}

/**
 * Vectorized Gothic Arches v3 for GPU-like parallelism and performance
 * 
 * @param thetas - Array of angular positions (radians)
 * @param z - Height position (mm)
 * @param r0 - Base radius at this height (mm)
 * @param H - Total pot height (mm)
 * @param opts - Style parameters (GothicArchesParams v3)
 * @returns Float32Array of modified radii (mm)
 */
export function rOuterGothicArchesVec(
  thetas: Float32Array,
  z: number,
  r0: number,
  H: number,
  opts: StyleOptions
): Float32Array {
  const n = thetas.length;
  const result = new Float32Array(n);
  const PI = Math.PI;
  const params = opts as Partial<GothicArchesParams>;

  // --- Parameters (indices 0-11 match UI/packer/shader v3)
  const N = Math.max(1, Math.floor((params.gaCounts ?? DEFAULT_GOTHIC_ARCHES.gaCounts) + 0.5));
  const amp = params.gaRelief ?? DEFAULT_GOTHIC_ARCHES.gaRelief;
  
  const p = Math.max(0.25, params.gaPointiness ?? DEFAULT_GOTHIC_ARCHES.gaPointiness);
  const topAmt = sat(params.gaDiamond ?? DEFAULT_GOTHIC_ARCHES.gaDiamond);
  const xAmt = sat(params.gaX ?? DEFAULT_GOTHIC_ARCHES.gaX);
  
  const z0 = sat(params.gaSpring ?? DEFAULT_GOTHIC_ARCHES.gaSpring);
  const zh = sat(params.gaArchHeight ?? DEFAULT_GOTHIC_ARCHES.gaArchHeight) * (1 - z0);
  
  const wZ = Math.max(EPSILON, params.gaRib ?? DEFAULT_GOTHIC_ARCHES.gaRib);
  const wX = Math.max(EPSILON, params.gaCol ?? DEFAULT_GOTHIC_ARCHES.gaCol);
  
  const firm = Math.min(2.0, Math.max(1.0, params.gaSharp ?? DEFAULT_GOTHIC_ARCHES.gaSharp));
  
  const topStart = sat(params.gaTopStart ?? DEFAULT_GOTHIC_ARCHES.gaTopStart);
  const recess = sat(params.gaRecess ?? DEFAULT_GOTHIC_ARCHES.gaRecess) * 0.6;

  const t = sat(z / Math.max(EPSILON, H));

  // Pre-compute height-dependent values
  const blendW = Math.max(0.02, 1.5 * wZ);
  const topMask = smoothstep(topStart - blendW, topStart + blendW, t);
  const botMask = 1 - topMask;

  const archApex = Math.min(z0 + zh, topStart - 0.6 * wZ);
  const archH = Math.max(EPSILON, archApex - z0);
  const gateW = 2.0 * wZ;
  const wT = 0.75 * wX;
  const rows = 1.0 + 2.0 * topAmt;
  const wL = Math.max(0.08, 1.8 * wZ);
  const midBand = ridgePlateau(t - topStart, 2.2 * wZ, firm);
  const v = sat((t - topStart) / Math.max(EPSILON, 1 - topStart));
  const invP = 1 / p;

  for (let i = 0; i < n; i++) {
    const theta = thetas[i];
    
    // Robust bay coordinate
    const u = (theta * N) / TAU;
    const f = u - Math.floor(u);
    const xSigned = 2 * f - 1;
    const xAbs = Math.abs(xSigned);
    const x01 = f;

    // LOWER TIER
    const archY = Math.pow(Math.max(0, 1 - Math.pow(xAbs, p)), invP);
    const archZ = z0 + archH * archY;
    const gate = sat((t - z0) / gateW) * sat((archZ - t) / gateW);

    const ribArch = ridgePlateau(t - archZ, wZ, firm);
    const colEdge = ridgePlateau(1 - xAbs, wX, firm) * gate;
    const mullion = ridgePlateau(xAbs, 0.65 * wX, firm) * gate;

    const denom = Math.max(EPSILON, archZ - z0);
    const s = sat((t - z0) / denom);
    const xDiag = gate * uni(
      ridgePlateau(s - x01, wT, firm),
      ridgePlateau(s - (1 - x01), wT, firm)
    );

    // Combine with saturating union
    let lower = 0.0;
    lower = uni(lower, ribArch);
    lower = uni(lower, 0.90 * colEdge);
    lower = uni(lower, 0.45 * mullion);
    lower = uni(lower, xAmt * 0.65 * xDiag);

    const panel = gate * Math.pow(Math.max(0, 1 - xAbs / 0.95), 2.0);
    lower = Math.max(0, lower - recess * panel * (1 - lower));
    lower = uni(lower, 0.55 * midBand);

    // UPPER TIER
    const phi1 = PI * (rows * v - x01);
    const phi2 = PI * (rows * v + x01);

    let lattice = 0.0;
    lattice = uni(lattice, ridgeSinPlateau(phi1, wL, firm));
    lattice = uni(lattice, ridgeSinPlateau(phi2, wL, firm));

    const cell = Math.pow(Math.abs(Math.sin(phi1)) * Math.abs(Math.sin(phi2)), 2.0);
    lattice = uni(lattice, 0.25 * cell);

    let upper = topAmt * lattice;
    upper = uni(upper, 0.60 * midBand);

    const pattern = sat(botMask * lower + topMask * upper);
    result[i] = r0 + amp * pattern;
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
  GothicArches: rOuterGothicArches,
};

/** Map of style IDs to their vectorized functions */
export const STYLE_FUNCTIONS_VEC: Record<StyleId, VectorizedStyleFunction> = {
  SuperformulaBlossom: rOuterSuperformulaBlossomVec,
  FourierBloom: rOuterFourierBloomVec,
  SpiralRidges: rOuterSpiralRidgesVec,
  SuperellipseMorph: rOuterSuperellipseMorphVec,
  HarmonicRipple: rOuterHarmonicRippleVec,
  GothicArches: rOuterGothicArchesVec,
};

/** Style descriptions for UI */
export const STYLE_DESCRIPTIONS: Record<StyleId, string> = {
  SuperformulaBlossom: 'Petals via Gielis superformula; sharpen toward rim.',
  FourierBloom: 'Floral profile from blended harmonics.',
  SpiralRidges: 'Rising helical ribs with fine grooves.',
  SuperellipseMorph: 'Circle → rounded square → soft diamond vs height.',
  HarmonicRipple: 'Petals + ripples + gentle mid-height bell.',
  GothicArches: 'Cathedral-inspired pointed arches, buttresses, tracery & rose windows.',
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
