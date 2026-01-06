/**
 * Style state slice for Zustand store.
 * 
 * Manages the currently selected decorative style and its parameters.
 * Includes schema definitions for each style's configurable options.
 * 
 * NOTE: These styles MUST match the Python STYLES dictionary in
 * potfoundry/core/styles/__init__.py exactly.
 * 
 * @module state/slices/style
 */

import { StateCreator } from 'zustand';
import {
  StyleState,
  StyleOpts,
  StyleSchema,
  StyleName,
  DEFAULT_STYLE,
} from '../types';

// ============================================================================
// Style Schemas - Must match Python STYLES exactly:
// SuperformulaBlossom, FourierBloom, SpiralRidges, 
// SuperellipseMorph, HarmonicRipple, LowPolyFacet
// ============================================================================

/**
 * Schema definitions for all available styles.
 * These schemas drive the dynamic UI generation.
 * Parameter names match the Python schema keys for consistency.
 * 
 * Each style has "basic" params shown by default and "advanced" params
 * shown in a collapsible Advanced section.
 */
export const STYLE_SCHEMAS: Record<StyleName, StyleSchema> = {
  SuperformulaBlossom: {
    name: 'Superformula Blossom',
    description: 'Petals via Gielis superformula; sharpen toward rim.',
    params: {
      // Basic parameters
      sf_strength: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.0,
        label: 'Blossom Strength',
        description: 'Blend from base shape (0) to blossom-modulated profile (1)',
      },
      sf_m_base: {
        type: 'float',
        min: 2,
        max: 14,
        step: 0.5,
        default: 6.0,
        label: 'Symmetry @ Base',
        description: 'Superformula symmetry count near base',
      },
      sf_m_top: {
        type: 'float',
        min: 2,
        max: 18,
        step: 0.5,
        default: 10.0,
        label: 'Symmetry @ Top',
        description: 'Superformula symmetry count near rim',
      },
      sf_n1: {
        type: 'float',
        min: 0.1,
        max: 4,
        step: 0.05,
        default: 0.35,
        label: 'Sharpness @ Base',
        description: 'Higher = sharper corners at the base',
      },
      sf_n1_top: {
        type: 'float',
        min: 0.1,
        max: 4,
        step: 0.05,
        default: 0.50,
        label: 'Sharpness @ Top',
        description: 'Higher = sharper corners near the rim',
      },
    },
    advancedParams: {
      sf_m_curve_exp: {
        type: 'float',
        min: 0.6,
        max: 2,
        step: 0.05,
        default: 1.2,
        label: 'Symmetry Morph Curve',
        description: 'Exponent controlling how symmetry morphs along height',
      },
      sf_a: {
        type: 'float',
        min: 0.4,
        max: 2.5,
        step: 0.05,
        default: 1.0,
        label: 'Radius Scale (a)',
        description: 'Superformula parameter a',
      },
      sf_b: {
        type: 'float',
        min: 0.4,
        max: 2.5,
        step: 0.05,
        default: 1.0,
        label: 'Radius Scale (b)',
        description: 'Superformula parameter b',
      },
      sf_n2: {
        type: 'float',
        min: 0.2,
        max: 4,
        step: 0.05,
        default: 0.8,
        label: 'Cos Power @ Base (n2)',
        description: 'Exponent on cosine term at base',
      },
      sf_n2_top: {
        type: 'float',
        min: 0.2,
        max: 4,
        step: 0.05,
        default: 1.4,
        label: 'Cos Power @ Top (n2)',
        description: 'Exponent on cosine term near rim',
      },
      sf_n3: {
        type: 'float',
        min: 0.2,
        max: 4,
        step: 0.05,
        default: 0.8,
        label: 'Sin Power @ Base (n3)',
        description: 'Exponent on sine term at base',
      },
      sf_n3_top: {
        type: 'float',
        min: 0.2,
        max: 4,
        step: 0.05,
        default: 0.8,
        label: 'Sin Power @ Top (n3)',
        description: 'Exponent on sine term near rim',
      },
    },
  },
  
  FourierBloom: {
    name: 'Fourier Bloom',
    description: 'Floral ridges from Fourier series; twist offset for helix.',
    params: {
      // Basic parameters
      fb_strength: {
        type: 'float',
        min: 0,
        max: 2,
        step: 0.05,
        default: 1.0,
        label: 'Harmonic Strength',
        description: 'Intensity of the blended Fourier detail',
      },
      fb_base_cos8_amp: {
        type: 'float',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0.12,
        label: 'Base cos(8θ) Amp',
        description: '8-fold modulation at base',
      },
      fb_top_cos11_amp: {
        type: 'float',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0.18,
        label: 'Top cos(11θ) Amp',
        description: '11-fold modulation at top',
      },
      fb_wobble_amp: {
        type: 'float',
        min: 0,
        max: 0.4,
        step: 0.01,
        default: 0.06,
        label: 'Wobble Amplitude',
        description: 'Gentle wobble across height',
      },
      fb_wobble_freq: {
        type: 'int',
        min: 1,
        max: 16,
        step: 1,
        default: 5,
        label: 'Wobble Frequency',
        description: 'Wobble cycles around circumference',
      },
    },
    advancedParams: {
      fb_base_cos8_phase: {
        type: 'float',
        min: -3.14,
        max: 3.14,
        step: 0.01,
        default: 0.0,
        label: 'Base cos(8θ) Phase',
        description: 'Phase for base cos(8θ) in radians',
      },
      fb_base_sin4_amp: {
        type: 'float',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0.05,
        label: 'Base sin(4θ) Amp',
        description: '4-fold modulation at base',
      },
      fb_base_sin4_phase: {
        type: 'float',
        min: -3.14,
        max: 3.14,
        step: 0.01,
        default: 0.6,
        label: 'Base sin(4θ) Phase',
        description: 'Phase for base sin(4θ) in radians',
      },
      fb_base_cos12_amp: {
        type: 'float',
        min: -1,
        max: 1,
        step: 0.01,
        default: -0.04,
        label: 'Base cos(12θ) Amp',
        description: '12-fold modulation at base',
      },
      fb_base_cos12_phase: {
        type: 'float',
        min: -3.14,
        max: 3.14,
        step: 0.01,
        default: 1.3,
        label: 'Base cos(12θ) Phase',
        description: 'Phase for base cos(12θ) in radians',
      },
      fb_top_cos11_phase: {
        type: 'float',
        min: -3.14,
        max: 3.14,
        step: 0.01,
        default: 0.5,
        label: 'Top cos(11θ) Phase',
        description: 'Phase for top cos(11θ) in radians',
      },
      fb_top_sin7_amp: {
        type: 'float',
        min: -1,
        max: 1,
        step: 0.01,
        default: -0.07,
        label: 'Top sin(7θ) Amp',
        description: '7-fold modulation at top',
      },
      fb_top_sin7_phase: {
        type: 'float',
        min: -3.14,
        max: 3.14,
        step: 0.01,
        default: 0.0,
        label: 'Top sin(7θ) Phase',
        description: 'Phase for top sin(7θ) in radians',
      },
      fb_top_cos22_amp: {
        type: 'float',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0.05,
        label: 'Top cos(22θ) Amp',
        description: '22-fold modulation at top',
      },
      fb_top_cos22_phase: {
        type: 'float',
        min: -3.14,
        max: 3.14,
        step: 0.01,
        default: 0.9,
        label: 'Top cos(22θ) Phase',
        description: 'Phase for top cos(22θ) in radians',
      },
      fb_wobble_zgain: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5,
        label: 'Wobble Z-Gain',
        description: 'How wobble evolves with height',
      },
    },
  },
  
  SpiralRidges: {
    name: 'Spiral Ridges',
    description: 'Helical ridges spiraling around the pot.',
    params: {
      // Basic parameters
      spiral_k: {
        type: 'int',
        min: 3,
        max: 24,
        step: 1,
        default: 9,
        label: 'Ridge Count',
        description: 'Number of spiral ridges',
      },
      spiral_turns: {
        type: 'float',
        min: 0.2,
        max: 3,
        step: 0.05,
        default: 1.15,
        label: 'Helix Turns',
        description: 'Total helical turns from base to rim',
      },
      spiral_amp_min: {
        type: 'float',
        min: 0,
        max: 0.7,
        step: 0.01,
        default: 0.15,
        label: 'Amplitude @ Base',
        description: 'Ridge height near the base (fraction of radius)',
      },
      spiral_amp_max: {
        type: 'float',
        min: 0,
        max: 0.8,
        step: 0.01,
        default: 0.25,
        label: 'Amplitude @ Top',
        description: 'Ridge height near the rim (fraction of radius)',
      },
      spiral_groove_amp: {
        type: 'float',
        min: 0,
        max: 0.12,
        step: 0.005,
        default: 0.04,
        label: 'Fine Groove Amp',
        description: 'Adds fine grooves on top of ridges',
      },
    },
    advancedParams: {
      spiral_amp_curve: {
        type: 'float',
        min: 0.6,
        max: 2,
        step: 0.05,
        default: 1.3,
        label: 'Amplitude Curve',
        description: 'Exponent controlling how ridge amplitude grows with height',
      },
      spiral_groove_mult: {
        type: 'float',
        min: 1,
        max: 5,
        step: 0.1,
        default: 3.0,
        label: 'Groove Freq × k',
        description: 'Frequency multiplier for grooves relative to ridge count',
      },
      spiral_phase_mult: {
        type: 'float',
        min: 0,
        max: 3,
        step: 0.1,
        default: 1.7,
        label: 'Groove Phase × turns',
        description: 'Phase multiplier for grooves relative to helix turns',
      },
    },
  },
  
  SuperellipseMorph: {
    name: 'Superellipse Morph',
    description: 'Circle → rounded square → soft diamond vs height.',
    params: {
      // Basic parameters
      se_m_base: {
        type: 'float',
        min: 1,
        max: 6,
        step: 0.1,
        default: 2.0,
        label: 'Power @ Base',
        description: 'Lamé exponent near base; 2=circle, higher=squarer',
      },
      se_m_top: {
        type: 'float',
        min: 1,
        max: 8,
        step: 0.1,
        default: 5.5,
        label: 'Power @ Top',
        description: 'Lamé exponent near the rim',
      },
      se_c4_amp: {
        type: 'float',
        min: 0,
        max: 0.25,
        step: 0.005,
        default: 0.08,
        label: 'cos(4θ) Amplitude',
        description: 'Amplitude for 4-fold modulation (square-like)',
      },
      se_c4_phase_deg: {
        type: 'int',
        min: -180,
        max: 180,
        step: 1,
        default: 23,
        label: 'cos(4θ) Phase',
        description: 'Phase for 4-fold modulation',
        unit: '°',
      },
      se_c8_amp: {
        type: 'float',
        min: 0,
        max: 0.25,
        step: 0.005,
        default: 0.03,
        label: 'cos(8θ) Amplitude',
        description: 'Amplitude for 8-fold modulation (star-like)',
      },
    },
    advancedParams: {
      se_m_curve_exp: {
        type: 'float',
        min: 0.6,
        max: 2,
        step: 0.05,
        default: 1.1,
        label: 'Power Morph Curve',
        description: 'Exponent controlling how the power morphs along height',
      },
      se_c8_phase_deg: {
        type: 'int',
        min: -180,
        max: 180,
        step: 1,
        default: 0,
        label: 'cos(8θ) Phase',
        description: 'Phase for 8-fold modulation',
        unit: '°',
      },
    },
  },
  
  HarmonicRipple: {
    name: 'Harmonic Ripple',
    description: 'Petals + ripples + gentle mid-height bell.',
    params: {
      // Basic parameters
      hr_petals: {
        type: 'int',
        min: 3,
        max: 24,
        step: 1,
        default: 7,
        label: 'Petal Count',
        description: 'Number of large lobes (petals) around the pot',
      },
      hr_petal_amp: {
        type: 'float',
        min: 0,
        max: 0.4,
        step: 0.01,
        default: 0.16,
        label: 'Petal Amplitude',
        description: 'How prominent the petal lobes are',
      },
      hr_ripple_freq: {
        type: 'int',
        min: 5,
        max: 60,
        step: 1,
        default: 31,
        label: 'Ripple Frequency',
        description: 'Number of fine ripples around the circumference',
      },
      hr_ripple_amp: {
        type: 'float',
        min: 0,
        max: 0.12,
        step: 0.005,
        default: 0.03,
        label: 'Ripple Amplitude',
        description: 'Height of fine ripples',
      },
      hr_bell: {
        type: 'float',
        min: 0,
        max: 0.25,
        step: 0.005,
        default: 0.05,
        label: 'Mid-Height Boost',
        description: 'Extra bell-like bulge around mid-height',
      },
    },
    advancedParams: {
      hr_petal_phase_deg: {
        type: 'int',
        min: -180,
        max: 180,
        step: 1,
        default: 17,
        label: 'Petal Phase',
        description: 'Rotational phase offset for petals',
        unit: '°',
      },
      hr_petal_zgain: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.6,
        label: 'Petal Z-Gain',
        description: 'How petal pattern evolves with height',
      },
      hr_ripple_phase_deg: {
        type: 'int',
        min: -180,
        max: 180,
        step: 1,
        default: 0,
        label: 'Ripple Phase',
        description: 'Rotational phase offset for ripples',
        unit: '°',
      },
      hr_ripple_zgain: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 1.0,
        label: 'Ripple Z-Gain',
        description: 'How ripple pattern evolves with height',
      },
    },
  },
  
  LowPolyFacet: {
    name: 'Low Poly Facet',
    description: 'Piecewise-flat facets for low-poly aesthetic.',
    params: {
      // Basic parameters
      lp_facets: {
        type: 'int',
        min: 3,
        max: 72,
        step: 1,
        default: 12,
        label: 'Facet Count',
        description: 'Number of flat facets around the pot',
      },
      lp_tiers: {
        type: 'int',
        min: 1,
        max: 12,
        step: 1,
        default: 1,
        label: 'Vertical Tiers',
        description: 'Segment height into tiers with phase shifts',
      },
      lp_amp: {
        type: 'float',
        min: 0,
        max: 0.4,
        step: 0.005,
        default: 0.12,
        label: 'Facet Amplitude',
        description: 'How deep edges cut in (fraction of radius)',
      },
      lp_bevel: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.15,
        label: 'Bevel Softness',
        description: 'Higher = more rounded edges; 0 = sharp',
      },
      lp_jitter: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.15,
        label: 'Tier Phase Jitter',
        description: 'Phase offset between tiers',
      },
    },
    advancedParams: {
      lp_phase_deg: {
        type: 'int',
        min: -180,
        max: 180,
        step: 1,
        default: 0,
        label: 'Facet Phase',
        description: 'Global rotational offset in degrees',
        unit: '°',
      },
    },
  },

  GothicArches: {
    name: 'Gothic Arches',
    description: 'Watertight cathedral relief with pointed arches, columns & tracery.',
    params: {
      // Basic parameters (shown by default)
      ga_counts: {
        type: 'int',
        min: 4,
        max: 20,
        step: 1,
        default: 8,
        label: 'Arch Count',
        description: 'Number of pointed arches around circumference',
      },
      ga_amp: {
        type: 'float',
        min: 0,
        max: 5,
        step: 0.1,
        default: 2.5,
        label: 'Relief Depth',
        description: 'Pattern relief amplitude in mm',
        unit: 'mm',
      },
      ga_pointiness: {
        type: 'float',
        min: 0.6,
        max: 2.5,
        step: 0.1,
        default: 1.2,
        label: 'Pointiness',
        description: 'Arch shape: lower=pointier lancet, higher=rounder',
      },
      ga_overlap: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.6,
        label: 'Diamond Tracery',
        description: 'Crossing ogive strength for diamond patterns',
      },
      ga_tracery: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.4,
        label: 'X-Tracery',
        description: 'Diagonal cross-bracing inside arch bays',
      },
    },
    advancedParams: {
      ga_z0: {
        type: 'float',
        min: 0.02,
        max: 0.4,
        step: 0.01,
        default: 0.12,
        label: 'Spring Line',
        description: 'Where arches begin (normalized height)',
      },
      ga_zh: {
        type: 'float',
        min: 0.3,
        max: 1.0,
        step: 0.05,
        default: 0.75,
        label: 'Arch Height',
        description: 'How much of remaining height arches fill',
      },
      ga_rib_width: {
        type: 'float',
        min: 0.01,
        max: 0.08,
        step: 0.005,
        default: 0.035,
        label: 'Rib Thickness',
        description: 'Thickness of arch ribs (normalized)',
      },
      ga_col_width: {
        type: 'float',
        min: 0.05,
        max: 0.3,
        step: 0.01,
        default: 0.15,
        label: 'Column Width',
        description: 'Width of columns at bay edges',
      },
      ga_sharpness: {
        type: 'float',
        min: 1,
        max: 10,
        step: 0.5,
        default: 4.0,
        label: 'Sharpness',
        description: 'Ridge crispness exponent',
      },
      ga_band: {
        type: 'float',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5,
        label: 'Base/Rim Bands',
        description: 'Strength of plinth and cornice bands',
      },
      ga_band_width: {
        type: 'float',
        min: 0.02,
        max: 0.15,
        step: 0.01,
        default: 0.05,
        label: 'Band Width',
        description: 'Width of base/rim bands',
      },
    },
  },
};

/**
 * Get default options for a style based on its schema.
 * Includes both basic and advanced parameters.
 * 
 * @param styleName - Name of the style
 * @returns Default option values
 */
export function getDefaultStyleOpts(styleName: StyleName): StyleOpts {
  const schema = STYLE_SCHEMAS[styleName];
  if (!schema) return {};
  
  const defaults: StyleOpts = {};
  
  // Add basic params
  for (const [key, param] of Object.entries(schema.params)) {
    defaults[key] = param.default;
  }
  
  // Add advanced params if present
  if (schema.advancedParams) {
    for (const [key, param] of Object.entries(schema.advancedParams)) {
      defaults[key] = param.default;
    }
  }
  
  return defaults;
}

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * Style slice state and actions.
 */
export interface StyleSlice {
  /** Current style configuration */
  style: StyleState;
  
  /**
   * Change the active style.
   * Resets style options to the new style's defaults.
   * 
   * @param name - New style name
   */
  setStyle: (name: StyleName) => void;
  
  /**
   * Update a single style option.
   * 
   * @param key - Option name
   * @param value - New value
   */
  setStyleOpt: (key: string, value: number | boolean) => void;
  
  /**
   * Update multiple style options at once.
   * 
   * @param opts - Options to merge
   */
  setStyleOpts: (opts: StyleOpts) => void;
  
  /**
   * Reset style options to defaults for the current style.
   */
  resetStyleOpts: () => void;
  
  /**
   * Get the schema for the current style.
   * 
   * @returns Current style's schema
   */
  getStyleSchema: () => StyleSchema;
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the style slice.
 */
export const createStyleSlice: StateCreator<
  StyleSlice,
  [],
  [],
  StyleSlice
> = (set, get) => ({
  style: { ...DEFAULT_STYLE },
  
  setStyle: (name) => {
    set({
      style: {
        name,
        opts: getDefaultStyleOpts(name),
      },
    });
  },
  
  setStyleOpt: (key, value) => {
    set((state) => ({
      style: {
        ...state.style,
        opts: {
          ...state.style.opts,
          [key]: value,
        },
      },
    }));
  },
  
  setStyleOpts: (opts) => {
    set((state) => ({
      style: {
        ...state.style,
        opts: {
          ...state.style.opts,
          ...opts,
        },
      },
    }));
  },
  
  resetStyleOpts: () => {
    const currentStyle = get().style.name as StyleName;
    set((state) => ({
      style: {
        ...state.style,
        opts: getDefaultStyleOpts(currentStyle),
      },
    }));
  },
  
  getStyleSchema: () => {
    const currentStyle = get().style.name as StyleName;
    return STYLE_SCHEMAS[currentStyle] || STYLE_SCHEMAS.HarmonicRipple;
  },
});
