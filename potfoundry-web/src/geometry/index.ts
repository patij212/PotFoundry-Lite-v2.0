/**
 * Geometry Module - Client-side pot mesh generation and export
 * 
 * This module provides TypeScript implementations of the pot geometry
 * generation algorithms from Python potfoundry/geometry.py. It enables:
 * 
 * - Watertight mesh generation for 3D printing
 * - All 5 artistic styles (SuperformulaBlossom, FourierBloom, etc.)
 * - Binary and ASCII STL export
 * - Mesh statistics (volume, surface area, bounds)
 * 
 * The WebGPU preview uses shader-based procedural geometry for real-time
 * rendering. This module is used for STL export when the user downloads
 * their pot design.
 * 
 * @module geometry
 */

// Types
export type {
  Vec3,
  Vec2,
  Face,
  PotDimensions,
  MeshQuality,
  SpinParams,
  ProfileParams,
  StyleId,
  StyleParams,
  StyleOptions,
  SuperformulaBlossomParams,
  FourierBloomParams,
  SpiralRidgesParams,
  SuperellipseMorphParams,
  HarmonicRippleParams,
  GothicArchesParams,
  WaveInterferenceParams,
  MeshData,
  MeshDiagnostics,
  MeshResult,
  STLExportOptions,
  STLTriangle,
} from './types';

// Constants
export {
  TAU,
  EPSILON,
  DEFAULT_N_THETA,
  DEFAULT_N_Z,
  STYLE_IDS,
  DEFAULT_DIMENSIONS,
  DEFAULT_QUALITY,
  DEFAULT_SPIN,
  DEFAULT_PROFILE,
  DEFAULT_SUPERFORMULA,
  DEFAULT_FOURIER,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
  DEFAULT_GOTHIC_ARCHES,
  DEFAULT_WAVE_INTERFERENCE,
  DEFAULT_STYLE_PARAMS,
} from './types';

// Profile functions
export {
  baseRadius,
  rBaseOut,
  spinTwistRadians,
  baseRadiusArray,
  spinTwistArray,
  getThetaGrid,
  clearThetaGridCache,
} from './profile';

// Style functions
export type { StyleFunction, VectorizedStyleFunction } from './styles';
export {
  // Individual style functions
  rOuterSuperformulaBlossom,
  rOuterFourierBloom,
  rOuterSpiralRidges,
  rOuterSuperellipseMorph,
  rOuterHarmonicRipple,
  // Vectorized versions
  rOuterSuperformulaBlossomVec,
  rOuterFourierBloomVec,
  rOuterSpiralRidgesVec,
  rOuterSuperellipseMorphVec,
  rOuterHarmonicRippleVec,
  // Registry and helpers
  STYLE_FUNCTIONS,
  STYLE_FUNCTIONS_VEC,
  STYLE_DESCRIPTIONS,
  getStyleFunction,
  getStyleFunctionVec,
} from './styles';

// Mesh builder
export {
  buildPotMesh,
  calculateMeshVolume,
  calculateMeshSurfaceArea,
  getMeshBounds,
} from './meshBuilder';

// STL export
export {
  generateBinarySTL,
  generateAsciiSTL,
  downloadSTL,
  generateSTLBlob,
  estimateSTLSize,
  formatFileSize,
} from './stlExport';
