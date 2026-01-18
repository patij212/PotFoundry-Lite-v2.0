/**
 * Profile Functions - Base radius and twist calculations
 * 
 * These functions compute the base outer radius profile and twist angle
 * at any height along the pot. They match the Python implementations in
 * potfoundry/geometry.py.
 */

import { TAU, StyleOptions } from './types';

// ============================================================================
// Base Radius Profile
// ============================================================================

/**
 * Calculate the unmodulated base outer radius at height z.
 * 
 * This implements the flare profile with optional mid-height bell.
 * The flare is controlled by a logistic remap of the height parameter,
 * creating smooth, organic transitions.
 * 
 * @param z - Current height (0 to H)
 * @param H - Total pot height
 * @param Rb - Bottom radius
 * @param Rt - Top radius  
 * @param expn - Flare exponent (>1 flares near top, <1 near base)
 * @param opts - Style options including bell/flare parameters
 * @returns Base outer radius at height z
 */
export function baseRadius(
  z: number,
  H: number,
  Rb: number,
  Rt: number,
  expn: number,
  opts: StyleOptions = {}
): number {
  if (H <= 0) {
    return Rb;
  }

  // Normalized height t ∈ [0, 1]
  const t = Math.max(0.0, Math.min(1.0, z / H));

  // Flare center warp using logistic sigmoid remap
  // GPU UPDATE: The current shader uses simple power law, not sigmoid.
  // Matching GPU logic: r = Rb + (Rt - Rb) * pow(t, expn)
  let r = Rb + (Rt - Rb) * Math.pow(t, expn);

  // Optional mid-height bell modification
  const bellAmp = opts.bellAmp ?? 0.0;
  if (bellAmp !== 0.0) {
    const mu = opts.bellCenter ?? 0.5;
    const width = Math.max(0.05, opts.bellWidth ?? 0.22);
    const sigma = Math.max(1e-3, width); // Match GPU: sigma = width (was width * 0.5)
    const g = Math.exp(-0.5 * Math.pow((t - mu) / sigma, 2));
    r *= 1.0 + bellAmp * g;
  }

  return r;
}

/**
 * Simple base radius without flare center warp (legacy compatibility)
 * 
 * @param z - Current height
 * @param H - Total height
 * @param Rb - Bottom radius
 * @param Rt - Top radius
 * @param expn - Flare exponent
 * @returns Base outer radius
 */
export function rBaseOut(
  z: number,
  H: number,
  Rb: number,
  Rt: number,
  expn: number
): number {
  const t = H <= 0 ? 0.0 : z / H;
  return Rb + (Rt - Rb) * Math.pow(t, expn);
}

// ============================================================================
// Spin/Twist Functions
// ============================================================================

/**
 * Calculate the twist angle (in radians) at height z.
 * 
 * The twist creates a spiral effect where the pot profile rotates
 * as you move up the height. This is applied globally to all styles.
 * 
 * @param z - Current height
 * @param H - Total height
 * @param opts - Style options containing spin parameters
 * @returns Twist angle in radians
 */
export function spinTwistRadians(
  z: number,
  H: number,
  opts: StyleOptions = {}
): number {
  if (H <= 0) {
    return 0.0;
  }

  const turns = opts.spinTurns ?? 0.0;
  const phaseDeg = opts.spinPhaseDeg ?? 0.0;
  const curve = Math.max(0.1, opts.spinCurveExp ?? 1.0);

  if (turns === 0.0 && phaseDeg === 0.0) {
    return 0.0;
  }

  const t = Math.max(0.0, Math.min(1.0, z / H));
  // Calculate the twist angle (in radians) at height z.
  // Negated to match WebGPU preview direction
  return -((phaseDeg * Math.PI / 180.0) + (turns * TAU) * Math.pow(t, curve));
}

// ============================================================================
// Vectorized Versions (for performance)
// ============================================================================

/**
 * Compute base radii for an array of z values (vectorized)
 * 
 * @param zArray - Array of z heights
 * @param H - Total height
 * @param Rb - Bottom radius
 * @param Rt - Top radius
 * @param expn - Flare exponent
 * @param opts - Style options
 * @returns Float32Array of radii
 */
export function baseRadiusArray(
  zArray: Float32Array | number[],
  H: number,
  Rb: number,
  Rt: number,
  expn: number,
  opts: StyleOptions = {}
): Float32Array {
  const n = zArray.length;
  const result = new Float32Array(n);

  if (H <= 0) {
    result.fill(Rb);
    return result;
  }

  const bellAmp = opts.bellAmp ?? 0.0;
  const mu = opts.bellCenter ?? 0.5;
  const width = Math.max(0.05, opts.bellWidth ?? 0.22);
  const sigma = Math.max(1e-3, width); // Match GPU: sigma = width

  for (let i = 0; i < n; i++) {
    const z = zArray[i];
    const t = Math.max(0.0, Math.min(1.0, z / H));
    // GPU match: simple power law
    let r = Rb + (Rt - Rb) * Math.pow(t, expn);

    if (bellAmp !== 0.0) {
      const g = Math.exp(-0.5 * Math.pow((t - mu) / sigma, 2));
      r *= 1.0 + bellAmp * g;
    }

    result[i] = r;
  }

  return result;
}

/**
 * Compute twist angles for an array of z values (vectorized)
 * 
 * @param zArray - Array of z heights
 * @param H - Total height
 * @param opts - Style options
 * @returns Float32Array of twist angles in radians
 */
export function spinTwistArray(
  zArray: Float32Array | number[],
  H: number,
  opts: StyleOptions = {}
): Float32Array {
  const n = zArray.length;
  const result = new Float32Array(n);

  if (H <= 0) {
    result.fill(0);
    return result;
  }

  const turns = opts.spinTurns ?? 0.0;
  const phaseDeg = opts.spinPhaseDeg ?? 0.0;
  const curve = Math.max(0.1, opts.spinCurveExp ?? 1.0);

  if (turns === 0.0 && phaseDeg === 0.0) {
    result.fill(0);
    return result;
  }

  const phaseRad = phaseDeg * Math.PI / 180.0;

  for (let i = 0; i < n; i++) {
    const z = zArray[i];
    const t = Math.max(0.0, Math.min(1.0, z / H));
    // Negated to match WebGPU preview direction
    result[i] = -((phaseRad) + (turns * TAU) * Math.pow(t, curve));
  }

  return result;
}

// ============================================================================
// Theta Grid Cache
// ============================================================================

/** Cached theta grid for performance */
interface ThetaGridCache {
  nTheta: number;
  thetas: Float32Array;
  cosThetas: Float32Array;
  sinThetas: Float32Array;
}

let cachedThetaGrid: ThetaGridCache | null = null;

/**
 * Get cached theta grid (angles and their sin/cos values)
 * 
 * @param nTheta - Number of angular divisions
 * @returns Cached theta grid
 */
export function getThetaGrid(nTheta: number): ThetaGridCache {
  if (cachedThetaGrid && cachedThetaGrid.nTheta === nTheta) {
    return cachedThetaGrid;
  }

  const thetas = new Float32Array(nTheta);
  const cosThetas = new Float32Array(nTheta);
  const sinThetas = new Float32Array(nTheta);

  for (let i = 0; i < nTheta; i++) {
    const theta = (i / nTheta) * TAU;
    thetas[i] = theta;
    cosThetas[i] = Math.cos(theta);
    sinThetas[i] = Math.sin(theta);
  }

  cachedThetaGrid = { nTheta, thetas, cosThetas, sinThetas };
  return cachedThetaGrid;
}

/**
 * Clear the theta grid cache (useful when changing resolution)
 */
export function clearThetaGridCache(): void {
  cachedThetaGrid = null;
}
