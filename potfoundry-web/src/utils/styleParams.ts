/**
 * Style parameter packing utilities for WebGPU renderer.
 * 
 * This mirrors the Python implementation in pfui/preview/style_params.py
 * to enable frontend-only design loading without requiring a round-trip
 * to Python.
 * 
 * IMPORTANT: When adding new styles or parameters, update BOTH this file
 * and the Python version to maintain parity.
 * 
 * @module utils/styleParams
 */

// ============================================================================
// Constants
// ============================================================================

/** Total capacity of the style param buffer (must match WGSL shader) */
export const STYLE_PARAM_CAPACITY = 48;

/** Degrees to radians conversion factor */
const DEG2RAD = Math.PI / 180.0;

/** Style name to numeric ID mapping (must match WGSL shader constants) */
import { STYLE_ID_MAP_FROM_KEYS as STYLE_ID_MAP_REGISTRY } from '../styles/registry';

// Re-export for compatibility
export const STYLE_ID_MAP = STYLE_ID_MAP_REGISTRY;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely convert values to numbers, defaulting to 0 for invalid inputs.
 */
function clamp(values: (number | unknown)[]): number[] {
  return values.map(v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0.0;
  });
}

/**
 * Pad array to STYLE_PARAM_CAPACITY length.
 */
function pad(values: number[]): number[] {
  const padded = new Array(STYLE_PARAM_CAPACITY).fill(0);
  for (let i = 0; i < values.length && i < STYLE_PARAM_CAPACITY; i++) {
    padded[i] = values[i];
  }
  return padded;
}

/**
 * Flatten a nested array of numbers.
 * Because standard library support varies in some environments.
 */
function flatten(arr: any[]): number[] {
  return arr.flat(Infinity) as number[];
}


/**
 * Get a numeric value from opts with a default fallback.
 */
function getOpt(opts: Record<string, unknown>, key: string, defaultValue: number): number {
  const v = opts[key];
  if (v === undefined || v === null) return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

// ============================================================================
// Style-Specific Packers
// ============================================================================

/**
 * Pack SuperformulaBlossom parameters.
 */
function packSuperformula(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'sf_m_base', 6.0),
    getOpt(opts, 'sf_m_top', 10.0),
    getOpt(opts, 'sf_m_curve_exp', 1.2),
    getOpt(opts, 'sf_n1', 0.35),
    getOpt(opts, 'sf_n1_top', 0.50),
    getOpt(opts, 'sf_n2', 0.8),
    getOpt(opts, 'sf_n2_top', 1.4),
    getOpt(opts, 'sf_n3', 0.8),
    getOpt(opts, 'sf_n3_top', 0.8),
    getOpt(opts, 'sf_a', 1.0),
    getOpt(opts, 'sf_b', 1.0),
  ]));
}

/**
 * Pack FourierBloom parameters.
 */
function packFourier(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'fb_base_cos8_amp', 0.12),
    getOpt(opts, 'fb_base_cos8_phase', 0.0),
    getOpt(opts, 'fb_base_sin4_amp', 0.05),
    getOpt(opts, 'fb_base_sin4_phase', 0.6),
    getOpt(opts, 'fb_base_cos12_amp', -0.04),
    getOpt(opts, 'fb_base_cos12_phase', 1.3),
    getOpt(opts, 'fb_top_cos11_amp', 0.18),
    getOpt(opts, 'fb_top_cos11_phase', 0.5),
    getOpt(opts, 'fb_top_sin7_amp', -0.07),
    getOpt(opts, 'fb_top_sin7_phase', 0.0),
    getOpt(opts, 'fb_top_cos22_amp', 0.05),
    getOpt(opts, 'fb_top_cos22_phase', 0.9),
    getOpt(opts, 'fb_wobble_amp', 0.06),
    getOpt(opts, 'fb_wobble_freq', 5.0),
    getOpt(opts, 'fb_wobble_zgain', 0.5),
    getOpt(opts, 'fb_strength', 1.0),
  ]));
}

/**
 * Pack SpiralRidges parameters.
 */
function packSpiral(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'spiral_k', 9),
    getOpt(opts, 'spiral_turns', 1.15),
    getOpt(opts, 'spiral_amp_min', 0.15),
    getOpt(opts, 'spiral_amp_max', 0.25),
    getOpt(opts, 'spiral_amp_curve', 1.3),
    getOpt(opts, 'spiral_groove_amp', 0.04),
    getOpt(opts, 'spiral_groove_mult', 3.0),
    getOpt(opts, 'spiral_phase_mult', 1.7),
  ]));
}

/**
 * Pack SuperellipseMorph parameters.
 */
function packSuperellipse(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'se_m_base', 2.0),
    getOpt(opts, 'se_m_top', 5.5),
    getOpt(opts, 'se_m_curve_exp', 1.1),
    getOpt(opts, 'se_c4_amp', 0.08),
    getOpt(opts, 'se_c4_phase_deg', 23) * DEG2RAD,
    getOpt(opts, 'se_c8_amp', 0.03),
    getOpt(opts, 'se_c8_phase_deg', 0) * DEG2RAD,
  ]));
}

/**
 * Pack HarmonicRipple parameters.
 */
function packHarmonic(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'hr_petals', 7),
    getOpt(opts, 'hr_petal_amp', 0.16),
    getOpt(opts, 'hr_petal_phase_deg', 17) * DEG2RAD,
    getOpt(opts, 'hr_petal_zgain', 0.6),
    getOpt(opts, 'hr_ripple_freq', 31),
    getOpt(opts, 'hr_ripple_amp', 0.03),
    getOpt(opts, 'hr_ripple_phase_deg', 0) * DEG2RAD,
    getOpt(opts, 'hr_ripple_zgain', 1.0),
    getOpt(opts, 'hr_bell', 0.05),
  ]));
}

/**
 * Pack GothicArches parameters.
 * Must match GothicArchesParams interface in geometry/types.ts
 */
function packGothicArches(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'gaCounts', 12),       // 0: Arches around
    getOpt(opts, 'gaRelief', 1.5),      // 1: Depth (mm)
    getOpt(opts, 'gaPointiness', 1.2),  // 2: Arch shape (0.25-2.0)
    getOpt(opts, 'gaDiamond', 0.5),     // 3: Diamond tracery (0-1)
    getOpt(opts, 'gaX', 0.0),           // 4: X-tracery (0-1)
    getOpt(opts, 'gaSpring', 0.15),     // 5: Spring line (0-1)
    getOpt(opts, 'gaArchHeight', 0.7),  // 6: Arch height (0-1)
    getOpt(opts, 'gaRib', 0.04),        // 7: Rib width (0-1)
    getOpt(opts, 'gaCol', 0.15),        // 8: Column width (0-1)
    getOpt(opts, 'gaSharp', 4.0),       // 9: Sharpness
    getOpt(opts, 'gaBands', 1.0),       // 10: Bands presence
    getOpt(opts, 'gaBandW', 0.04),      // 11: Band width
  ]));
}

/**
 * Pack WaveInterference parameters.
 * Must match STYLE_SCHEMAS.WaveInterference in state/slices/style.ts
 * Note: Uses snake_case to match the schema definition
 */
function packWaveInterference(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'wi_feature_count', 0.0),   // 0: Frequency/Scale of features
    getOpt(opts, 'wi_relief_depth', 2.3),    // 1: Depth of the pattern (mm)
    getOpt(opts, 'wi_contour_density', 0.45),// 2: Density of ridges/contours
    getOpt(opts, 'wi_moire_strength', 0.7),  // 3: Strength of interference
    getOpt(opts, 'wi_pattern_style', 0.1),   // 4: Blend between styles
    getOpt(opts, 'wi_helix_pitch', 0.4),     // 5: Vertical spiral pitch
    getOpt(opts, 'wi_pitch_mismatch', 0.5),  // 6: Offset between wave layers
    getOpt(opts, 'wi_domain_warp', 0.45),    // 7: Strength of coordinate warping
    getOpt(opts, 'wi_warp_scale', 0.5),      // 8: Scale of the warp noise
    getOpt(opts, 'wi_ridge_contrast', 0.45), // 9: Sharpness of ridges
    getOpt(opts, 'wi_edge_fade', 0.5),       // 10: Fade out at top/bottom
    getOpt(opts, 'wi_phase', 0.3),           // 11: Animation phase
  ]));
}

/**
 * Pack Crystalline parameters.
 */
function packCrystalline(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'cr_facet_count', 12),
    getOpt(opts, 'cr_facet_depth', 0.15),
    getOpt(opts, 'cr_sub_facets', 2),
    getOpt(opts, 'cr_edge_sharpness', 2.5),
    getOpt(opts, 'cr_asymmetry', 0.15),
    getOpt(opts, 'cr_height_phase', 0.4),
  ]));
}

/**
 * Pack ArtDeco parameters.
 */
function packArtDeco(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'ad_fan_count', 8),
    getOpt(opts, 'ad_fan_spread', 0.4),
    getOpt(opts, 'ad_step_count', 4),
    getOpt(opts, 'ad_step_depth', 0.08),
    getOpt(opts, 'ad_chevron_amp', 0.06),
    getOpt(opts, 'ad_chevron_freq', 6),
    getOpt(opts, 'ad_geometric_blend', 0.5),
  ]));
}

/**
 * Pack DragonScales parameters.
 */
function packDragonScales(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'ds_scale_rows', 8),
    getOpt(opts, 'ds_scales_per_row', 16),
    getOpt(opts, 'ds_scale_depth', 0.12),
    getOpt(opts, 'ds_overlap', 0.5),
    getOpt(opts, 'ds_curvature', 1.5),
    getOpt(opts, 'ds_randomize', 0.1),
    getOpt(opts, 'ds_height_gradient', 1.2),
  ]));
}

/**
 * Pack BambooSegments parameters.
 */
function packBambooSegments(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'bs_node_count', 5),
    getOpt(opts, 'bs_node_width', 0.06),
    getOpt(opts, 'bs_node_prominence', 0.08),
    getOpt(opts, 'bs_striations', 12),
    getOpt(opts, 'bs_striation_depth', 0.015),
    getOpt(opts, 'bs_taper', 0.05),
    getOpt(opts, 'bs_asymmetry', 0.1),
  ]));
}

/**
 * Pack RippleInterference parameters.
 * Physics-based wave interference from multiple point sources.
 */
function packRippleInterference(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'ri_source_count', 4),      // 0: Number of wave sources (2-8)
    getOpt(opts, 'ri_wave_frequency', 12),   // 1: Wave frequency (4-24)
    getOpt(opts, 'ri_relief_depth', 1.5),    // 2: Relief depth in mm
    getOpt(opts, 'ri_phase', 0),             // 3: Animation phase
    getOpt(opts, 'ri_source_height', 0.5),   // 4: Source height position (0-1)
    getOpt(opts, 'ri_decay', 0.5),           // 5: Amplitude decay with distance
    getOpt(opts, 'ri_interference_mode', 0), // 6: Interference type (0=add, 1=multiply)
    getOpt(opts, 'ri_rotation', 0),          // 7: Source rotation offset
  ]));
}

/**
 * Pack GyroidManifold parameters.
 */
function packGyroidManifold(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'gm_scale', 3.5),        // 0: Scale (Lattice density)
    getOpt(opts, 'gm_thickness', 0.2),    // 1: Thickness
    getOpt(opts, 'gm_morph', 0),          // 2: Morph (0=Gyroid, 1=Schwarz P)
    getOpt(opts, 'gm_relief', 1.0),       // 3: Relief Depth
    getOpt(opts, 'gm_sharpness', 0.1),    // 4: Sharpness
    getOpt(opts, 'gm_z_stretch', 1.0),    // 5: Z-Stretch
    getOpt(opts, 'gm_pulse', 0),          // 6: Pulse Phase
    getOpt(opts, 'gm_edge_fade', 0.15),   // 7: Edge Fade
    getOpt(opts, 'gm_bias', 0.0),         // 8: Bias
    getOpt(opts, 'gm_curve', 1.0),        // 9: Curve
  ]));
}

function packVoronoi(opts: Record<string, unknown>): number[] {
  return pad(flatten([
    getOpt(opts, 'v_scale', 8.0),       // 0: Scale
    getOpt(opts, 'v_jitter', 0.8),      // 1: Jitter
    getOpt(opts, 'v_thickness', 0.1),   // 2: Thickness
    getOpt(opts, 'v_relief', 2.0),      // 3: Relief
    getOpt(opts, 'v_morph', 1.0),       // 4: Morph
    getOpt(opts, 'v_z_stretch', 1.0),   // 5: Z-Stretch
    getOpt(opts, 'v_pulse', 0),         // 6: Pulse Phase
    getOpt(opts, 'v_edge_fade', 0.15),  // 7: Edge Fade
  ]));
}

function packBasketWeave(opts: Record<string, unknown>): number[] {
  return pad(flatten([
    getOpt(opts, 'bw_strands', 16),      // 0: Strands
    getOpt(opts, 'bw_layers', 10),       // 1: Layers
    getOpt(opts, 'bw_depth', 2.0),       // 2: Depth
    getOpt(opts, 'bw_twist', 0.0),       // 3: Twist
    getOpt(opts, 'bw_ratio', 1.0),       // 4: Ratio
    getOpt(opts, 'bw_profile', 0.5),     // 5: Profile
    getOpt(opts, 'bw_unders', 0.5),      // 6: Unders
    getOpt(opts, 'bw_noise', 0.0),       // 7: Noise
    getOpt(opts, 'bw_vertical_grad', 0.0), // 8: Vertical Gradient
    getOpt(opts, 'bw_phase', 0.0),       // 9: Phase
  ]));
}

function packGeometricStar(opts: Record<string, unknown>): number[] {
  return pad(flatten([
    getOpt(opts, 'gs_points', 8),        // 0: Points
    getOpt(opts, 'gs_gap', 0.05),        // 1: Gap
    getOpt(opts, 'gs_detail', 0.5),      // 2: Detail
    getOpt(opts, 'gs_layers', 4.0),      // 3: Layers
    getOpt(opts, 'gs_interlace', 1.0),   // 4: Interlace
    getOpt(opts, 'gs_relief', 2.0),      // 5: Relief
    getOpt(opts, 'gs_roundness', 0.0),   // 6: Roundness
    getOpt(opts, 'gs_zoom', 1.0),        // 7: Zoom
    getOpt(opts, 'gs_shift', 0.0),       // 8: Shift
  ]));
}

function packHexagonalHive(opts: Record<string, unknown>): number[] {
  return pad(flatten([
    getOpt(opts, 'hh_scale', 4.0),       // 0: Scale
    getOpt(opts, 'hh_gap', 0.05),        // 1: Gap
    getOpt(opts, 'hh_relief', 2.0),      // 2: Relief
    getOpt(opts, 'hh_detail', 0.0),      // 3: Detail
    getOpt(opts, 'hh_concave', 0.0),     // 4: Concave
    getOpt(opts, 'hh_noise', 0.0),       // 5: Noise
  ]));
}

function packCelticKnot(opts: Record<string, unknown>): number[] {
  return pad(flatten([
    getOpt(opts, 'ck_scale', 3.0),       // 0: Scale
    getOpt(opts, 'ck_width', 0.15),      // 1: Width
    getOpt(opts, 'ck_relief', 2.0),      // 2: Relief
    getOpt(opts, 'ck_gap', 0.02),        // 3: Gap
    getOpt(opts, 'ck_roundness', 0.5),   // 4: Roundness
    getOpt(opts, 'ck_twist', 0.0),       // 5: Twist
    getOpt(opts, 'ck_strands', 3.0),     // 6: Strands (2-8)
  ]));
}

function packCelticTriquetra(opts: Record<string, unknown>): number[] {
  return pad(flatten([
    getOpt(opts, 'ct_scale_x', 14.0),    // 0: Columns (H-Repeat)
    getOpt(opts, 'ct_rows', 6.0),        // 1: Rows (V-Repeat) - higher = denser braid
    getOpt(opts, 'ct_width', 0.18),      // 2: Ribbon Width
    getOpt(opts, 'ct_relief', 2.5),      // 3: Relief depth
    getOpt(opts, 'ct_med_scale', 0.22),  // 4: Medallion Scale
    getOpt(opts, 'ct_med_y', 0.70),      // 5: Medallion Y position
    getOpt(opts, 'ct_gap', 0.06),        // 6: Gap at crossings
  ]));
}

// ============================================================================
// Packer Registry
// ============================================================================

/** Maps style IDs to their packer functions */
const PACKERS: Record<number, (opts: Record<string, unknown>) => number[]> = {
  0: packSuperformula,
  1: packFourier,
  2: packSpiral,
  3: packSuperellipse,
  4: packHarmonic,
  5: packGothicArches,
  6: packWaveInterference,
  7: packCrystalline,
  8: packArtDeco,
  9: packDragonScales,
  10: packBambooSegments,
  11: packRippleInterference,
  12: packGyroidManifold,
  13: packVoronoi,
  14: packBasketWeave,
  15: packGeometricStar,
  16: packHexagonalHive,
  17: packCelticKnot,
  18: packCelticTriquetra,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a style parameter payload for the WebGPU renderer.
 * 
 * This function mirrors the Python build_style_param_payload() function
 * to enable frontend-only design loading.
 * 
 * @param styleName - Style name from the STYLES registry
 * @param opts - Style-specific options dict from the design
 * @returns Tuple of [styleId, paramBlock] where paramBlock is a 48-element float array
 * 
 * @example
 * ```ts
 * const [styleId, params] = buildStyleParamPayload('HarmonicRipple', { hr_petals: 9 });
 * controller.updateParams({ styleId, styleParams: params });
 * ```
 */
export function buildStyleParamPayload(
  styleName: string,
  opts: Record<string, unknown> | null | undefined
): [number, number[]] {
  // @ts-ignore - indexing by string into StyleId record
  const styleId = STYLE_ID_MAP[styleName] ?? 0;
  const packer = PACKERS[styleId] ?? packSuperformula;
  const values = packer(opts || {});

  // Set the last element to (styleId + 1) as a sentinel to indicate params are active
  // This matches the Python implementation and WGSL shader's style_params_active() check
  if (values.length > 0) {
    values[STYLE_PARAM_CAPACITY - 1] = styleId + 1;
  }

  return [styleId, values];
}

/**
 * Get the style ID for a given style name.
 * 
 * @param styleName - Style name to look up
 * @returns Numeric style ID, defaults to 0 for unknown styles
 */
export function getStyleId(styleName: string): number {
  // @ts-ignore - indexing by string into StyleId record
  return STYLE_ID_MAP[styleName] ?? 0;
}
