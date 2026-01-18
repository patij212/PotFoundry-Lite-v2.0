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
/**
 * Schema definitions for all available styles.
 * These schemas drive the dynamic UI generation.
 * Parameter names match the Python schema keys for consistency.
 * 
 * Each style has "basic" params shown by default and "advanced" params
 * shown in a collapsible Advanced section.
 */
import { STYLE_REGISTRY } from '../../styles/registry';

export const STYLE_SCHEMAS: Record<StyleName, StyleSchema> = Object.fromEntries(
  Object.entries(STYLE_REGISTRY).map(([key, config]) => [key, config])
) as unknown as Record<StyleName, StyleSchema>;

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
