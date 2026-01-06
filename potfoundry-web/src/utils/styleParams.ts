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
export const STYLE_ID_MAP: Record<string, number> = {
  SuperformulaBlossom: 0,
  FourierBloom: 1,
  SpiralRidges: 2,
  SuperellipseMorph: 3,
  HarmonicRipple: 4,
  LowPolyFacet: 4, // Alias for HarmonicRipple
  GothicArches: 5,
};

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
  const buf = [...values];
  while (buf.length < STYLE_PARAM_CAPACITY) {
    buf.push(0.0);
  }
  return buf.slice(0, STYLE_PARAM_CAPACITY);
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
 * Pack Gothic Arches v2 parameters.
 * 
 * Cathedral-inspired relief with true tracery and seamless wrap.
 * 12 parameters packed in order matching WGSL shader expectations.
 */
function packGothicArches(opts: Record<string, unknown>): number[] {
  return pad(clamp([
    getOpt(opts, 'ga_counts', 8),           // [0] Arches around circumference
    getOpt(opts, 'ga_amp', 2.5),            // [1] Relief amplitude (mm)
    getOpt(opts, 'ga_z0', 0.12),            // [2] Spring line (normalized height)
    getOpt(opts, 'ga_zh', 0.75),            // [3] Arch height fraction
    getOpt(opts, 'ga_pointiness', 1.2),     // [4] Superellipse exponent p
    getOpt(opts, 'ga_rib_width', 0.035),    // [5] Rib thickness
    getOpt(opts, 'ga_col_width', 0.15),     // [6] Column width
    getOpt(opts, 'ga_sharpness', 4.0),      // [7] Ridge sharpness
    getOpt(opts, 'ga_overlap', 0.6),        // [8] Half-offset ogive weight
    getOpt(opts, 'ga_band', 0.5),           // [9] Base/rim band strength
    getOpt(opts, 'ga_band_width', 0.05),    // [10] Band width
    getOpt(opts, 'ga_tracery', 0.4),        // [11] In-bay X tracery
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
  return STYLE_ID_MAP[styleName] ?? 0;
}
