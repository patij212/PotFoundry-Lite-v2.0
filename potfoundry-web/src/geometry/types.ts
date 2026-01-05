/**
 * Geometry Types - Core type definitions for pot mesh generation
 * 
 * These types define the data structures used throughout the geometry
 * generation system, matching the Python potfoundry/geometry.py module.
 */

// ============================================================================
// Constants
// ============================================================================

/** Two times PI - full circle in radians */
export const TAU = 2.0 * Math.PI;

/** Minimum allowed value to prevent division by zero */
export const EPSILON = 1e-9;

/** Default mesh quality settings */
export const DEFAULT_N_THETA = 168;
export const DEFAULT_N_Z = 84;

// ============================================================================
// Basic Geometry Types
// ============================================================================

/** 3D vertex coordinates */
export type Vec3 = [number, number, number];

/** Triangle face defined by 3 vertex indices */
export type Face = [number, number, number];

/** 2D point for profile calculations */
export type Vec2 = [number, number];

// ============================================================================
// Pot Parameters
// ============================================================================

/**
 * Core pot dimension parameters (in millimeters)
 */
export interface PotDimensions {
  /** Total height of the pot */
  H: number;
  /** Top radius (not diameter) */
  Rt: number;
  /** Bottom radius (not diameter) */
  Rb: number;
  /** Wall thickness */
  tWall: number;
  /** Bottom slab thickness */
  tBottom: number;
  /** Drain hole radius */
  rDrain: number;
  /** Flare exponent (>1 flares near top, <1 near base) */
  expn: number;
}

/**
 * Mesh resolution settings
 */
export interface MeshQuality {
  /** Angular divisions around the pot circumference */
  nTheta: number;
  /** Vertical divisions along the height */
  nZ: number;
  /** Seam blend zone in degrees (0 = disabled) */
  seamAngle?: number;
}

/**
 * Spin/twist parameters applied to the pot geometry
 */
export interface SpinParams {
  /** Total revolutions from base to rim */
  spinTurns: number;
  /** Constant phase offset in degrees */
  spinPhaseDeg: number;
  /** Easing exponent for twist vs height (>=0.1) */
  spinCurveExp: number;
}

/**
 * Bell/flare profile modifiers
 */
export interface ProfileParams {
  /** Flare center position (0-1, default 0.5) */
  flareCenter: number;
  /** Flare sharpness factor */
  flareSharp: number;
  /** Mid-height bell amplitude */
  bellAmp: number;
  /** Bell center position (0-1) */
  bellCenter: number;
  /** Bell width factor */
  bellWidth: number;
}

// ============================================================================
// Style Types
// ============================================================================

/** Available style identifiers matching WGSL shader constants */
export type StyleId =
  | 'SuperformulaBlossom'
  | 'FourierBloom'
  | 'SpiralRidges'
  | 'SuperellipseMorph'
  | 'HarmonicRipple';

/** Style ID numeric values matching shader */
export const STYLE_IDS: Record<StyleId, number> = {
  SuperformulaBlossom: 0,
  FourierBloom: 1,
  SpiralRidges: 2,
  SuperellipseMorph: 3,
  HarmonicRipple: 4,
};

/**
 * Superformula Blossom style parameters
 * Based on Gielis superformula for petal variations
 */
export interface SuperformulaBlossomParams {
  sfMBase: number;      // Base symmetry factor
  sfMTop: number;       // Top symmetry factor
  sfMCurveExp: number;  // Curve exponent for m interpolation
  sfN1: number;         // n1 parameter at base
  sfN1Top: number;      // n1 parameter at top
  sfN2: number;         // n2 parameter at base
  sfN2Top: number;      // n2 parameter at top
  sfN3: number;         // n3 parameter at base
  sfN3Top: number;      // n3 parameter at top
  sfA: number;          // a scaling factor
  sfB: number;          // b scaling factor
}

/**
 * Fourier Bloom style parameters
 * Floral profile from blended harmonics
 */
export interface FourierBloomParams {
  fbBaseCos8Amp: number;
  fbBaseCos8Phase: number;
  fbBaseSin4Amp: number;
  fbBaseSin4Phase: number;
  fbBaseCos12Amp: number;
  fbBaseCos12Phase: number;
  fbTopCos11Amp: number;
  fbTopCos11Phase: number;
  fbTopSin7Amp: number;
  fbTopSin7Phase: number;
  fbTopCos22Amp: number;
  fbTopCos22Phase: number;
  fbWobbleAmp: number;
  fbWobbleFreq: number;
  fbWobbleZgain: number;
  fbStrength: number;
}

/**
 * Spiral Ridges style parameters
 * Rising helical ribs with fine grooves
 */
export interface SpiralRidgesParams {
  spiralK: number;         // Number of spiral ridges
  spiralTurns: number;     // Total turns from base to top
  spiralAmpMin: number;    // Amplitude at base
  spiralAmpMax: number;    // Amplitude at top
  spiralAmpCurve: number;  // Curve exponent for amplitude
  spiralGrooveAmp: number; // Secondary groove amplitude
  spiralGrooveMult: number;// Groove frequency multiplier
  spiralPhaseMult: number; // Phase multiplier
}

/**
 * Superellipse Morph style parameters
 * Circle → rounded square → soft diamond vs height
 */
export interface SuperellipseMorphParams {
  seMBase: number;      // Exponent at base (2=circle)
  seMTop: number;       // Exponent at top (>2=rounded square)
  seMCurveExp: number;  // Curve for exponent interpolation
  seC4Amp: number;      // 4-fold harmonic amplitude
  seC4PhaseDeg: number; // 4-fold phase in degrees
  seC8Amp: number;      // 8-fold harmonic amplitude
  seC8PhaseDeg: number; // 8-fold phase in degrees
}

/**
 * Harmonic Ripple style parameters
 * Petals + ripples + gentle mid-height bell
 */
export interface HarmonicRippleParams {
  hrPetals: number;         // Number of petals
  hrPetalAmp: number;       // Petal amplitude
  hrPetalPhaseDeg: number;  // Petal phase in degrees
  hrPetalZgain: number;     // Petal Z-gain
  hrRippleFreq: number;     // Ripple frequency
  hrRippleAmp: number;      // Ripple amplitude
  hrRipplePhaseDeg: number; // Ripple phase in degrees
  hrRippleZgain: number;    // Ripple Z-gain
  hrBell: number;           // Bell amplitude at mid-height
}

/** Union type for all style parameters */
export type StyleParams =
  | SuperformulaBlossomParams
  | FourierBloomParams
  | SpiralRidgesParams
  | SuperellipseMorphParams
  | HarmonicRippleParams;

/**
 * Combined style options passed to mesh generation
 */
export interface StyleOptions extends Partial<SpinParams>, Partial<ProfileParams> {
  [key: string]: number | undefined;
}

// ============================================================================
// Mesh Output Types
// ============================================================================

/**
 * Generated mesh data
 */
export interface MeshData {
  /** Vertex positions as flat Float32Array [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Triangle indices as Uint32Array [i0,i1,i2, i3,i4,i5, ...] */
  indices: Uint32Array;
  /** Number of vertices */
  vertexCount: number;
  /** Number of triangles */
  triangleCount: number;
}

/**
 * Mesh generation diagnostics and statistics
 */
export interface MeshDiagnostics {
  /** Ratio of inner vertices clamped at drain boundary */
  clampRatioAtBottom: number;
  /** Estimated top outer diameter in mm */
  estimatedTopOdMm: number;
  /** Estimated bottom outer diameter in mm */
  estimatedBottomOdMm: number;
  /** Total vertex count */
  vertexCount: number;
  /** Total face/triangle count */
  faceCount: number;
  /** Mesh generation time in milliseconds */
  generationTimeMs?: number;
  /** Estimated volume in cubic mm */
  estimatedVolumeMm3?: number;
}

/**
 * Complete mesh generation result
 */
export interface MeshResult {
  mesh: MeshData;
  diagnostics: MeshDiagnostics;
}

// ============================================================================
// STL Export Types
// ============================================================================

/**
 * STL export options
 */
export interface STLExportOptions {
  /** Model name embedded in STL file */
  name: string;
  /** Use binary format (recommended) vs ASCII */
  binary: boolean;
}

/**
 * STL triangle with normal
 */
export interface STLTriangle {
  normal: Vec3;
  v1: Vec3;
  v2: Vec3;
  v3: Vec3;
}

// ============================================================================
// Default Values
// ============================================================================

/** Default pot dimensions */
export const DEFAULT_DIMENSIONS: PotDimensions = {
  H: 120.0,
  Rt: 70.0,   // Top radius (140mm OD / 2)
  Rb: 45.0,   // Bottom radius (90mm OD / 2)
  tWall: 3.0,
  tBottom: 3.0,
  rDrain: 10.0,
  expn: 1.1,
};

/** Default mesh quality */
export const DEFAULT_QUALITY: MeshQuality = {
  nTheta: DEFAULT_N_THETA,
  nZ: DEFAULT_N_Z,
};

/** Default spin parameters (no twist) */
export const DEFAULT_SPIN: SpinParams = {
  spinTurns: 0.0,
  spinPhaseDeg: 0.0,
  spinCurveExp: 1.0,
};

/** Default profile parameters */
export const DEFAULT_PROFILE: ProfileParams = {
  flareCenter: 0.5,
  flareSharp: 6.0,
  bellAmp: 0.0,
  bellCenter: 0.5,
  bellWidth: 0.22,
};

/** Default Superformula Blossom parameters */
export const DEFAULT_SUPERFORMULA: SuperformulaBlossomParams = {
  sfMBase: 6.0,
  sfMTop: 10.0,
  sfMCurveExp: 1.2,
  sfN1: 0.35,
  sfN1Top: 0.50,
  sfN2: 0.8,
  sfN2Top: 1.4,
  sfN3: 0.8,
  sfN3Top: 0.8,
  sfA: 1.0,
  sfB: 1.0,
};

/** Default Fourier Bloom parameters */
export const DEFAULT_FOURIER: FourierBloomParams = {
  fbBaseCos8Amp: 0.12,
  fbBaseCos8Phase: 0.0,
  fbBaseSin4Amp: 0.05,
  fbBaseSin4Phase: 0.6,
  fbBaseCos12Amp: -0.04,
  fbBaseCos12Phase: 1.3,
  fbTopCos11Amp: 0.18,
  fbTopCos11Phase: 0.5,
  fbTopSin7Amp: -0.07,
  fbTopSin7Phase: 0.0,
  fbTopCos22Amp: 0.05,
  fbTopCos22Phase: 0.9,
  fbWobbleAmp: 0.06,
  fbWobbleFreq: 5,
  fbWobbleZgain: 0.5,
  fbStrength: 1.0,
};

/** Default Spiral Ridges parameters */
export const DEFAULT_SPIRAL: SpiralRidgesParams = {
  spiralK: 9,
  spiralTurns: 1.15,
  spiralAmpMin: 0.15,
  spiralAmpMax: 0.25,
  spiralAmpCurve: 1.3,
  spiralGrooveAmp: 0.04,
  spiralGrooveMult: 3.0,
  spiralPhaseMult: 1.7,
};

/** Default Superellipse Morph parameters */
export const DEFAULT_SUPERELLIPSE: SuperellipseMorphParams = {
  seMBase: 2.0,
  seMTop: 5.5,
  seMCurveExp: 1.1,
  seC4Amp: 0.08,
  seC4PhaseDeg: 23,
  seC8Amp: 0.03,
  seC8PhaseDeg: 0,
};

/** Default Harmonic Ripple parameters */
export const DEFAULT_HARMONIC: HarmonicRippleParams = {
  hrPetals: 7,
  hrPetalAmp: 0.16,
  hrPetalPhaseDeg: 17,
  hrPetalZgain: 0.6,
  hrRippleFreq: 31,
  hrRippleAmp: 0.03,
  hrRipplePhaseDeg: 0,
  hrRippleZgain: 1.0,
  hrBell: 0.05,
};

/** Map of style IDs to their default parameters */
export const DEFAULT_STYLE_PARAMS: Record<StyleId, StyleParams> = {
  SuperformulaBlossom: DEFAULT_SUPERFORMULA,
  FourierBloom: DEFAULT_FOURIER,
  SpiralRidges: DEFAULT_SPIRAL,
  SuperellipseMorph: DEFAULT_SUPERELLIPSE,
  HarmonicRipple: DEFAULT_HARMONIC,
};
