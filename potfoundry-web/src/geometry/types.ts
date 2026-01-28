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
  /** Whether to apply adaptive mesh optimization (GPU) */
  optimize?: boolean;
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
  | 'HarmonicRipple'
  | 'GothicArches'
  | 'WaveInterference'
  | 'Crystalline'
  | 'ArtDeco'
  | 'DragonScales'
  | 'BambooSegments'
  | 'RippleInterference'
  | 'GyroidManifold'
  | 'Voronoi'
  | 'BasketWeave'
  | 'GeometricStar'
  | 'HexagonalHive'
  | 'CelticKnot'
  | 'CelticTriquetra'
  | 'LowPolyFacet';



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

/**
 * Gothic Arches style parameters
 * Medieval pointed arch patterns with vertical ribs
 */
export interface GothicArchesParams {
  gaCounts: number;      // 0: Arches around
  gaRelief: number;      // 1: Depth (mm)
  gaPointiness: number;  // 2: Arch shape (0.25-2.0)
  gaDiamond: number;     // 3: Diamond tracery (0-1)
  gaX: number;           // 4: X-tracery (0-1)
  gaSpring: number;      // 5: Spring line (0-1)
  gaArchHeight: number;  // 6: Arch height (0-1)
  gaRib: number;         // 7: Rib width (0-1)
  gaCol: number;         // 8: Column width (0-1)
  gaSharp: number;       // 9: Sharpness
  gaBands: number;       // 10: Bands presence
  gaBandW: number;       // 11: Band width
}

/**
 * Wave Interference style parameters
 * Complex moiré-like patterns with domain warping
 */
export interface WaveInterferenceParams {
  wiFeatureCount: number;   // 0-1: Frequency/Scale of features
  wiReliefDepth: number;    // 0-5mm: Depth of the pattern
  wiContourDensity: number; // 0-1: Density of ridges/contours
  wiMoireStrength: number;  // 0-1: Strength of interference pattern
  wiPatternStyle: number;   // 0-1: Blend between styles
  wiHelixPitch: number;     // 0-1: Vertical spiral pitch
  wiPitchMismatch: number;  // 0-1: Offset between wave layers
  wiDomainWarp: number;     // 0-1: Strength of coordinate warping
  wiWarpScale: number;      // 0-1: Scale of the warp noise
  wiRidgeContrast: number;  // 0-1: Sharpness of ridges
  wiEdgeFade: number;       // 0-1: Fade out at top/bottom
  wiPhase: number;          // 0-1: Animation phase
}

/**
 * Crystalline style parameters
 * Faceted crystal-like surfaces with geometric complexity
 */
export interface CrystallineParams {
  crFacetCount: number;     // Number of primary facets (4-24)
  crFacetDepth: number;     // Depth of facet cuts (0-0.3)
  crSubFacets: number;      // Secondary facet subdivisions (1-4)
  crEdgeSharpness: number;  // Sharpness of edges (0.5-5)
  crAsymmetry: number;      // Irregular facet variation (0-0.5)
  crHeightPhase: number;    // Phase shift along height (0-1)
}

/**
 * Art Deco style parameters
 * 1920s geometric styling with stepped patterns
 */
export interface ArtDecoParams {
  adFanCount: number;       // Number of sunburst fans (4-16)
  adFanSpread: number;      // Fan ray spread angle (0.1-0.8)
  adStepCount: number;      // Stepped tier count (2-8)
  adStepDepth: number;      // Step indent depth (0-0.2)
  adChevronAmp: number;     // Chevron pattern amplitude (0-0.15)
  adChevronFreq: number;    // Chevron frequency (2-12)
  adGeometricBlend: number; // Blend between patterns (0-1)
}

/**
 * Dragon Scales style parameters
 * Overlapping scale patterns like dragon or fish scales
 */
export interface DragonScalesParams {
  dsScaleRows: number;      // Rows of scales along height (3-20)
  dsScalesPerRow: number;   // Scales around circumference (8-36)
  dsScaleDepth: number;     // Scale indent depth (0-0.25)
  dsOverlap: number;        // Scale overlap amount (0.2-0.8)
  dsCurvature: number;      // Scale curvature (0.5-3)
  dsRandomize: number;      // Randomization/jitter (0-0.3)
  dsHeightGradient: number; // Scale size gradient along height (0.5-2)
}

/**
 * Bamboo Segments style parameters
 * Bamboo-inspired node segments with striations
 */
export interface BambooSegmentsParams {
  bsNodeCount: number;      // Number of segment nodes (2-12)
  bsNodeWidth: number;      // Width of node ring (0.02-0.15)
  bsNodeProminence: number; // Node bulge amount (0-0.2)
  bsStriations: number;     // Fine vertical lines (0-24)
  bsStriationDepth: number; // Striation groove depth (0-0.05)
  bsTaper: number;          // Inter-node taper (0-0.15)
  bsAsymmetry: number;      // Irregular node spacing (0-0.3)
}

/**
 * Ripple Interference style parameters
 * Physics-based wave interference from multiple point sources
 */
export interface RippleInterferenceParams {
  riSourceCount: number;      // Number of wave sources (2-8)
  riWaveFrequency: number;    // Wave frequency (4-24)
  riReliefDepth: number;      // Relief depth in mm
  riPhase: number;            // Animation phase (0-1)
  riSourceHeight: number;     // Source height position (0-1)
  riDecay: number;            // Amplitude decay with distance (0-1)
  riInterferenceMode: number; // Interference type (0=add, 1=multiply)
  riRotation: number;         // Source rotation offset (0-1)
}

/**
 * Low Poly Facet style parameters
 * Piecewise-flat facets for low-poly aesthetic.
 */
export interface LowPolyFacetParams {
  lpFacets: number;
  lpTiers: number;
  lpAmp: number;
  lpBevel: number;
  lpJitter: number;
  lpPhaseDeg: number;
}

/**
 * Gyroid Manifold style parameters
 * Triply Periodic Minimal Surfaces (TPMS)
 */
export interface GyroidManifoldParams {
  gmScale: number;          // Lattice scale
  gmThickness: number;      // Wall thickness threshold
  gmMorph: number;          // Blend: Gyroid <-> Schwarz P
  gmRelief: number;         // Depth of relief
  gmZStretch: number;       // Vertical cell stretching
  gmSharpness: number;      // Relief edge sharpness (Smoothstep)
  gmBias: number;           // Isovalue bias (Surface Offset)
  gmCurve: number;          // Relief profile power
  gmPulse: number;          // Animation phase
  gmEdgeFade: number;       // Fade at top/bottom
}

export interface VoronoiParams {
  vScale: number;           // Cell density (cells around circumference)
  vJitter: number;          // Randomness (0=Grid, 1=Chaos)
  vThickness: number;       // Wall thickness
  vRelief: number;          // Relief depth
  vMorph: number;           // Blend: 0=Bubbles(Worley), 1=Cells(Voronoi borders)
  vZStretch: number;        // Vertical elongation
  vPulse: number;           // Animation/Offset
  vEdgeFade: number;        // Fade at top/bottom
}

export interface BasketWeaveParams {
  bwStrands: number;        // Vertical strands
  bwLayers: number;         // Horizontal layers
  bwDepth: number;          // Relief depth
  bwTwist: number;          // Twist
  bwRatio: number;          // Cell ratio
  bwProfile: number;        // Round (0) <-> Flat (1)
  bwUnders: number;         // Under strand visibility
  bwNoise: number;          // Surface noise
  bwVerticalGrad: number;   // Vertical density gradient
  bwPhase: number;          // Phase shift
}

export interface GeometricStarParams {
  gsPoints: number;         // Star points
  gsGap: number;            // Strap width
  gsDetail: number;         // Star size
  gsLayers: number;         // Layers
  gsInterlace: number;      // Weaving
  gsRelief: number;         // Depth
  gsRoundness: number;      // Smoothing
  gsZoom: number;           // Scale
  gsShift: number;          // Offset
}

export interface HexagonalHiveParams {
  hhScale: number;          // Cell Density
  hhGap: number;            // Wall Thickness
  hhRelief: number;         // Depth
  hhDetail: number;         // Inner Detail
  hhConcave: number;        // Concavity
  hhNoise: number;          // Noise
}

export interface CelticKnotParams {
  ckScale: number;          // Scale
  ckWidth: number;          // Band Width
  ckRelief: number;         // Depth
  ckGap: number;            // Gap
  ckRoundness: number;      // Roundness
  ckTwist: number;          // Twist
  ckStrands: number;        // Number of strands (2-8)
}

/** Union type for all style parameters */
export type StyleParams =
  | SuperformulaBlossomParams
  | FourierBloomParams
  | SpiralRidgesParams
  | SuperellipseMorphParams
  | HarmonicRippleParams
  | GothicArchesParams
  | WaveInterferenceParams
  | CrystallineParams
  | ArtDecoParams
  | DragonScalesParams
  | BambooSegmentsParams
  | RippleInterferenceParams
  | GyroidManifoldParams
  | GyroidManifoldParams
  | VoronoiParams
  | BasketWeaveParams
  | GeometricStarParams
  | HexagonalHiveParams
  | CelticKnotParams
  | CelticTriquetraParams
  | LowPolyFacetParams;

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

/** Default Gothic Arches parameters */
export const DEFAULT_GOTHIC_ARCHES: GothicArchesParams = {
  gaCounts: 12,        // 0
  gaRelief: 1.5,       // 1 (mm)
  gaPointiness: 1.2,   // 2
  gaDiamond: 0.5,      // 3
  gaX: 0.0,            // 4
  gaSpring: 0.15,      // 5
  gaArchHeight: 0.7,   // 6
  gaRib: 0.04,         // 7
  gaCol: 0.15,         // 8
  gaSharp: 4.0,        // 9
  gaBands: 1.0,        // 10
  gaBandW: 0.04,       // 11
};

/** Default Wave Interference parameters */
export const DEFAULT_WAVE_INTERFERENCE: WaveInterferenceParams = {
  wiFeatureCount: 0.0,
  wiReliefDepth: 2.3,
  wiContourDensity: 0.45,
  wiMoireStrength: 0.7,
  wiPatternStyle: 0.1,
  wiHelixPitch: 0.4,
  wiPitchMismatch: 0.5,
  wiDomainWarp: 0.45,
  wiWarpScale: 0.5,
  wiRidgeContrast: 0.45,
  wiEdgeFade: 0.5,
  wiPhase: 0.3,
};

/** Default Crystalline parameters */
export const DEFAULT_CRYSTALLINE: CrystallineParams = {
  crFacetCount: 12,
  crFacetDepth: 0.15,
  crSubFacets: 2,
  crEdgeSharpness: 2.5,
  crAsymmetry: 0.15,
  crHeightPhase: 0.4,
};

/** Default Art Deco parameters */
export const DEFAULT_ART_DECO: ArtDecoParams = {
  adFanCount: 8,
  adFanSpread: 0.4,
  adStepCount: 4,
  adStepDepth: 0.08,
  adChevronAmp: 0.06,
  adChevronFreq: 6,
  adGeometricBlend: 0.5,
};

/** Default Dragon Scales parameters */
export const DEFAULT_DRAGON_SCALES: DragonScalesParams = {
  dsScaleRows: 8,
  dsScalesPerRow: 16,
  dsScaleDepth: 0.12,
  dsOverlap: 0.5,
  dsCurvature: 1.5,
  dsRandomize: 0.1,
  dsHeightGradient: 1.2,
};

/** Default Bamboo Segments parameters */
export const DEFAULT_BAMBOO_SEGMENTS: BambooSegmentsParams = {
  bsNodeCount: 5,
  bsNodeWidth: 0.06,
  bsNodeProminence: 0.08,
  bsStriations: 12,
  bsStriationDepth: 0.015,
  bsTaper: 0.05,
  bsAsymmetry: 0.1,
};

/** Default Ripple Interference parameters */
export const DEFAULT_RIPPLE_INTERFERENCE: RippleInterferenceParams = {
  riSourceCount: 4,
  riWaveFrequency: 12,
  riReliefDepth: 1.5,
  riPhase: 0,
  riSourceHeight: 0.5,
  riDecay: 0.5,
  riInterferenceMode: 0,
  riRotation: 0,
};

/** Default Low Poly Facet parameters */
export const DEFAULT_LOW_POLY_FACET: LowPolyFacetParams = {
  lpFacets: 12,
  lpTiers: 1,
  lpAmp: 0.12,
  lpBevel: 0.15,
  lpJitter: 0.15,
  lpPhaseDeg: 0,
};

/** Default Gyroid Manifold parameters */
export const DEFAULT_GYROID_MANIFOLD: GyroidManifoldParams = {
  gmScale: 4.0,
  gmThickness: 0.1,
  gmMorph: 0.0,
  gmRelief: 1.5,
  gmZStretch: 1.0,
  gmSharpness: 0.1,
  gmBias: 0.0,
  gmCurve: 1.0,
  gmPulse: 0.0,
  gmEdgeFade: 0.2,
};

export const DEFAULT_VORONOI: VoronoiParams = {
  vScale: 8.0,
  vJitter: 0.8,
  vThickness: 0.1,
  vRelief: 2.0,
  vMorph: 1.0, // Default to Voronoi Cells
  vZStretch: 1.0,
  vPulse: 0.0,
  vEdgeFade: 0.15,
};

export const DEFAULT_BASKET_WEAVE: BasketWeaveParams = {
  bwStrands: 16,
  bwLayers: 10,
  bwDepth: 2.0,
  bwTwist: 0.0,
  bwRatio: 1.0,
  bwProfile: 0.5,
  bwUnders: 0.5,
  bwNoise: 0.0,
  bwVerticalGrad: 0.0,
  bwPhase: 0.0,
};

export const DEFAULT_GEOMETRIC_STAR: GeometricStarParams = {
  gsPoints: 8,
  gsGap: 0.05,
  gsDetail: 0.5,
  gsLayers: 4.0,
  gsInterlace: 1.0,
  gsRelief: 2.0,
  gsRoundness: 0.0,
  gsZoom: 1.0,
  gsShift: 0.0,
};

export const DEFAULT_HEXAGONAL_HIVE: HexagonalHiveParams = {
  hhScale: 4.0,
  hhGap: 0.05,
  hhRelief: 2.0,
  hhDetail: 0.0,
  hhConcave: 0.0,
  hhNoise: 0.0,
};

export const DEFAULT_CELTIC_KNOT: CelticKnotParams = {
  ckScale: 3.0,
  ckWidth: 0.15,
  ckRelief: 2.0,
  ckGap: 0.02,
  ckRoundness: 0.5,
  ckTwist: 0.0,
  ckStrands: 3,
};

export interface CelticTriquetraParams {
  ctScaleX: number;
  ctRows: number;
  ctWidth: number;
  ctRelief: number;
  ctMedScale: number;
  ctMedY: number;
  ctGap: number;
}

export const DEFAULT_CELTIC_TRIQUETRA: CelticTriquetraParams = {
  ctScaleX: 14.0,
  ctRows: 6,
  ctWidth: 0.18,
  ctRelief: 2.5,
  ctMedScale: 0.22,
  ctMedY: 0.69,
  ctGap: 0.05,
};

/** Map of style IDs to their default parameters */
export const DEFAULT_STYLE_PARAMS: Record<StyleId, StyleParams> = {
  SuperformulaBlossom: DEFAULT_SUPERFORMULA,
  FourierBloom: DEFAULT_FOURIER,
  SpiralRidges: DEFAULT_SPIRAL,
  SuperellipseMorph: DEFAULT_SUPERELLIPSE,
  HarmonicRipple: DEFAULT_HARMONIC,
  GothicArches: DEFAULT_GOTHIC_ARCHES,
  WaveInterference: DEFAULT_WAVE_INTERFERENCE,
  Crystalline: DEFAULT_CRYSTALLINE,
  ArtDeco: DEFAULT_ART_DECO,
  DragonScales: DEFAULT_DRAGON_SCALES,
  BambooSegments: DEFAULT_BAMBOO_SEGMENTS,
  RippleInterference: DEFAULT_RIPPLE_INTERFERENCE,
  GyroidManifold: DEFAULT_GYROID_MANIFOLD,
  Voronoi: DEFAULT_VORONOI,
  BasketWeave: DEFAULT_BASKET_WEAVE,
  GeometricStar: DEFAULT_GEOMETRIC_STAR,
  HexagonalHive: DEFAULT_HEXAGONAL_HIVE,
  CelticKnot: DEFAULT_CELTIC_KNOT,
  CelticTriquetra: DEFAULT_CELTIC_TRIQUETRA,
  LowPolyFacet: DEFAULT_LOW_POLY_FACET,
};
