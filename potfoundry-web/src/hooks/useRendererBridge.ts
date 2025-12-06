/**
 * Bridge hook connecting Zustand state to the WebGPU renderer.
 * 
 * This hook subscribes to relevant state changes and translates them
 * into WebGPU controller commands. It handles debouncing to prevent
 * excessive re-renders during rapid slider adjustments.
 * 
 * @module hooks/useRendererBridge
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore, LIGHTING_PRESETS } from '../state';
import type { WebGPUController } from '../webgpu_core';
import type { GeometryParams, StyleState, AppearanceState, MeshQuality, StyleName } from '../state';

// ============================================================================
// Types
// ============================================================================

export interface RendererBridgeOptions {
  /** Debounce delay for geometry changes in ms */
  geometryDebounce?: number;
  /** Debounce delay for style changes in ms */
  styleDebounce?: number;
  /** Debounce delay for appearance changes in ms */
  appearanceDebounce?: number;
  /** Whether to enable debug logging */
  debug?: boolean;
}

const DEFAULT_OPTIONS: Required<RendererBridgeOptions> = {
  geometryDebounce: 16, // ~60fps
  styleDebounce: 16,
  appearanceDebounce: 0, // Immediate for visual feedback
  debug: false,
};

// ============================================================================
// Style ID Mapping
// ============================================================================

/**
 * Map StyleName strings to numeric style IDs used by the WebGPU shader.
 * These IDs match the WGSL constants (STYLE_SUPERFORMULA=0, etc.)
 * 
 * Python STYLES (potfoundry/core/styles/__init__.py):
 * - SuperformulaBlossom, FourierBloom, SpiralRidges, SuperellipseMorph, HarmonicRipple, LowPolyFacet
 */
const STYLE_NAME_TO_ID: Record<string, number> = {
  SuperformulaBlossom: 0,  // STYLE_SUPERFORMULA
  FourierBloom: 1,         // STYLE_FOURIER
  SpiralRidges: 2,         // STYLE_SPIRAL
  SuperellipseMorph: 3,    // STYLE_SUPERELLIPSE
  HarmonicRipple: 4,       // STYLE_HARMONIC
  LowPolyFacet: 4,         // Maps to HARMONIC (uses petals as facets)
};

// ============================================================================
// Param Conversion Helpers
// ============================================================================

/**
 * Convert Zustand geometry state to WebGPU params format.
 * The WebGPU controller expects specific param names.
 */
function geometryToParams(geometry: GeometryParams): Record<string, unknown> {
  return {
    H: geometry.H,
    top_od: geometry.top_od,
    bottom_od: geometry.bottom_od,
    t_wall: geometry.t_wall,
    t_bottom: geometry.t_bottom,
    r_drain: geometry.r_drain,
    expn: geometry.expn,
    // Derived values
    Rt: geometry.top_od / 2,
    Rb: geometry.bottom_od / 2,
  };
}

/**
 * Helper to safely extract a numeric value from style opts.
 * Returns the default if the value is boolean or undefined.
 */
function getNum(val: number | boolean | undefined, defaultVal: number): number {
  if (typeof val === 'number') return val;
  return defaultVal;
}

/**
 * Convert Zustand style state to WebGPU params format.
 * 
 * Maps StyleName to numeric styleId and style options to the 
 * styleParams array based on each style's expected parameter layout.
 * 
 * Parameter names MUST match the STYLE_SCHEMAS in state/slices/style.ts exactly!
 */
function styleToParams(style: StyleState): Record<string, unknown> {
  const styleId = STYLE_NAME_TO_ID[style.name] ?? 0;
  const styleParams = new Array(48).fill(0);
  const opts = style.opts;
  
  // Set the activation flag (last element) to enable style params
  if (styleId >= 0) {
    styleParams[47] = 1.0; // style_params_active() checks this
  }
  
  // Map parameters based on style type
  // Each style has its own parameter layout in the shader
  // Parameter names MUST match STYLE_SCHEMAS exactly
  switch (style.name) {
    case 'HarmonicRipple': {
      // STYLE_SCHEMAS params: hr_petals, hr_petal_amp, hr_ripple_freq, hr_ripple_amp, hr_bell
      // Advanced: hr_petal_phase_deg, hr_petal_zgain, hr_ripple_phase_deg, hr_ripple_zgain
      // Shader expects: petals[0], pet_amp[1], pet_ph[2], pet_zg[3],
      //                 rip_freq[4], rip_amp[5], rip_ph[6], rip_zg[7], bell[8]
      const petals = getNum(opts.hr_petals, 7);
      const petalAmp = getNum(opts.hr_petal_amp, 0.16);
      const petalPhaseDeg = getNum(opts.hr_petal_phase_deg, 17);
      const petalZgain = getNum(opts.hr_petal_zgain, 0.6);
      const rippleFreq = getNum(opts.hr_ripple_freq, 31);
      const rippleAmp = getNum(opts.hr_ripple_amp, 0.03);
      const ripplePhaseDeg = getNum(opts.hr_ripple_phase_deg, 0);
      const rippleZgain = getNum(opts.hr_ripple_zgain, 1.0);
      const bell = getNum(opts.hr_bell, 0.05);
      
      styleParams[0] = petals;                              // petals count
      styleParams[1] = petalAmp;                            // petal amplitude (0-0.4 range)
      styleParams[2] = petalPhaseDeg * Math.PI / 180;       // pet_ph (phase in radians)
      styleParams[3] = petalZgain;                          // pet_zg (z gain)
      styleParams[4] = rippleFreq;                          // ripple frequency
      styleParams[5] = rippleAmp;                           // ripple amplitude (0-0.12 range)
      styleParams[6] = ripplePhaseDeg * Math.PI / 180;      // rip_ph (phase in radians)
      styleParams[7] = rippleZgain;                         // rip_zg (z gain)
      styleParams[8] = bell;                                // mid-height bell boost
      break;
    }
      
    case 'SuperformulaBlossom': {
      // STYLE_SCHEMAS params: sf_strength, sf_m_base, sf_m_top, sf_n1, sf_n1_top
      // Advanced: sf_m_curve_exp, sf_a, sf_b, sf_n2, sf_n2_top, sf_n3, sf_n3_top
      // Shader expects: m_base[0], m_top[1], m_curve[2], n1_base[3], n1_top[4],
      //                 n2_base[5], n2_top[6], n3_base[7], n3_top[8], a[9], b[10], strength[11]
      const strength = getNum(opts.sf_strength, 0.0);
      const mBase = getNum(opts.sf_m_base, 6.0);
      const mTop = getNum(opts.sf_m_top, 10.0);
      const mCurve = getNum(opts.sf_m_curve_exp, 1.2);
      const n1Base = getNum(opts.sf_n1, 0.35);
      const n1Top = getNum(opts.sf_n1_top, 0.50);
      const n2Base = getNum(opts.sf_n2, 0.8);
      const n2Top = getNum(opts.sf_n2_top, 1.4);
      const n3Base = getNum(opts.sf_n3, 0.8);
      const n3Top = getNum(opts.sf_n3_top, 0.8);
      const a = getNum(opts.sf_a, 1.0);
      const b = getNum(opts.sf_b, 1.0);
      
      styleParams[0] = mBase;                              // m_base
      styleParams[1] = mTop;                               // m_top
      styleParams[2] = mCurve;                             // m_curve
      styleParams[3] = n1Base;                             // n1_base
      styleParams[4] = n1Top;                              // n1_top
      styleParams[5] = n2Base;                             // n2_base
      styleParams[6] = n2Top;                              // n2_top
      styleParams[7] = n3Base;                             // n3_base
      styleParams[8] = n3Top;                              // n3_top
      styleParams[9] = a;                                  // a
      styleParams[10] = b;                                 // b
      styleParams[11] = strength;                          // strength/blend
      break;
    }
      
    case 'FourierBloom': {
      // STYLE_SCHEMAS params: fb_strength, fb_base_cos8_amp, fb_top_cos11_amp, fb_wobble_amp, fb_wobble_freq
      // Advanced: fb_base_cos8_phase, fb_base_sin4_amp/phase, fb_base_cos12_amp/phase,
      //           fb_top_cos11_phase, fb_top_sin7_amp/phase, fb_top_cos22_amp/phase, fb_wobble_zgain
      // Shader expects: bc8[0], bc8p[1], bs4[2], bs4p[3], bc12[4], bc12p[5],
      //                 tc11[6], tc11p[7], ts7[8], ts7p[9], tc22[10], tc22p[11],
      //                 wob_amp[12], wob_freq[13], wob_zgain[14], strength[15]
      const strength = getNum(opts.fb_strength, 1.0);
      const baseCos8Amp = getNum(opts.fb_base_cos8_amp, 0.12);
      const baseCos8Phase = getNum(opts.fb_base_cos8_phase, 0.0);
      const baseSin4Amp = getNum(opts.fb_base_sin4_amp, 0.05);
      const baseSin4Phase = getNum(opts.fb_base_sin4_phase, 0.6);
      const baseCos12Amp = getNum(opts.fb_base_cos12_amp, -0.04);
      const baseCos12Phase = getNum(opts.fb_base_cos12_phase, 1.3);
      const topCos11Amp = getNum(opts.fb_top_cos11_amp, 0.18);
      const topCos11Phase = getNum(opts.fb_top_cos11_phase, 0.5);
      const topSin7Amp = getNum(opts.fb_top_sin7_amp, -0.07);
      const topSin7Phase = getNum(opts.fb_top_sin7_phase, 0.0);
      const topCos22Amp = getNum(opts.fb_top_cos22_amp, 0.05);
      const topCos22Phase = getNum(opts.fb_top_cos22_phase, 0.9);
      const wobbleAmp = getNum(opts.fb_wobble_amp, 0.06);
      const wobbleFreq = getNum(opts.fb_wobble_freq, 5);
      const wobbleZgain = getNum(opts.fb_wobble_zgain, 0.5);
      
      styleParams[0] = baseCos8Amp;         // bc8 amplitude
      styleParams[1] = baseCos8Phase;       // bc8 phase
      styleParams[2] = baseSin4Amp;         // bs4 amplitude
      styleParams[3] = baseSin4Phase;       // bs4 phase
      styleParams[4] = baseCos12Amp;        // bc12 amplitude
      styleParams[5] = baseCos12Phase;      // bc12 phase
      styleParams[6] = topCos11Amp;         // tc11 amplitude
      styleParams[7] = topCos11Phase;       // tc11 phase
      styleParams[8] = topSin7Amp;          // ts7 amplitude
      styleParams[9] = topSin7Phase;        // ts7 phase
      styleParams[10] = topCos22Amp;        // tc22 amplitude
      styleParams[11] = topCos22Phase;      // tc22 phase
      styleParams[12] = wobbleAmp;          // wob_amp
      styleParams[13] = wobbleFreq;         // wob_freq
      styleParams[14] = wobbleZgain;        // wob_zgain
      styleParams[15] = strength;           // overall strength
      break;
    }
      
    case 'SpiralRidges': {
      // STYLE_SCHEMAS params: spiral_k, spiral_turns, spiral_amp_min, spiral_amp_max, spiral_groove_amp
      // Advanced: spiral_amp_curve, spiral_groove_mult, spiral_phase_mult
      // Shader expects: k[0], turns[1], amp_min[2], amp_max[3], amp_curve[4],
      //                 groove_amp[5], groove_mult[6], phase_mult[7]
      const k = getNum(opts.spiral_k, 9);
      const turns = getNum(opts.spiral_turns, 1.15);
      const ampMin = getNum(opts.spiral_amp_min, 0.15);
      const ampMax = getNum(opts.spiral_amp_max, 0.25);
      const ampCurve = getNum(opts.spiral_amp_curve, 1.3);
      const grooveAmp = getNum(opts.spiral_groove_amp, 0.04);
      const grooveMult = getNum(opts.spiral_groove_mult, 3.0);
      const phaseMult = getNum(opts.spiral_phase_mult, 1.7);
      
      styleParams[0] = k;             // ridge count
      styleParams[1] = turns;         // helix turns
      styleParams[2] = ampMin;        // amplitude at base
      styleParams[3] = ampMax;        // amplitude at top
      styleParams[4] = ampCurve;      // amp_curve (sharpness)
      styleParams[5] = grooveAmp;     // fine groove amplitude
      styleParams[6] = grooveMult;    // groove_mult
      styleParams[7] = phaseMult;     // phase_mult
      break;
    }
      
    case 'SuperellipseMorph': {
      // STYLE_SCHEMAS params: se_m_base, se_m_top, se_c4_amp, se_c4_phase_deg, se_c8_amp
      // Advanced: se_m_curve_exp, se_c8_phase_deg
      // Shader expects: m_base[0], m_top[1], m_curve[2],
      //                 c4a[3], c4p[4], c8a[5], c8p[6]
      const mBase = getNum(opts.se_m_base, 2.0);
      const mTop = getNum(opts.se_m_top, 5.5);
      const mCurve = getNum(opts.se_m_curve_exp, 1.1);
      const c4Amp = getNum(opts.se_c4_amp, 0.08);
      const c4PhaseDeg = getNum(opts.se_c4_phase_deg, 23);
      const c8Amp = getNum(opts.se_c8_amp, 0.03);
      const c8PhaseDeg = getNum(opts.se_c8_phase_deg, 0);
      
      styleParams[0] = mBase;                           // m_base (Lamé exponent)
      styleParams[1] = mTop;                            // m_top
      styleParams[2] = mCurve;                          // m_curve
      styleParams[3] = c4Amp;                           // c4a (4-fold amp)
      styleParams[4] = c4PhaseDeg * Math.PI / 180;      // c4p (phase in radians)
      styleParams[5] = c8Amp;                           // c8a (8-fold amp)
      styleParams[6] = c8PhaseDeg * Math.PI / 180;      // c8p (8-fold phase in radians)
      break;
    }
    
    case 'LowPolyFacet': {
      // LowPolyFacet needs a dedicated shader implementation.
      // For now, we map to STYLE_HARMONIC (ID 4) with facet-like parameters
      // to approximate the low-poly look using the harmonic function.
      // 
      // STYLE_SCHEMAS params: lp_facets, lp_tiers, lp_amp, lp_bevel, lp_jitter
      // Advanced: lp_phase_deg
      const facets = getNum(opts.lp_facets, 12);
      const tiers = getNum(opts.lp_tiers, 1);
      const amp = getNum(opts.lp_amp, 0.12);
      const bevel = getNum(opts.lp_bevel, 0.15);
      const jitter = getNum(opts.lp_jitter, 0.15);
      const phaseDeg = getNum(opts.lp_phase_deg, 0);
      
      // Map to harmonic shader (ID 4) for a faceted look:
      // petals = facets, with high z-gain to make facets uniform across height
      // ripple can add tier-like variation
      styleParams[0] = facets;                         // petals = facet count
      styleParams[1] = amp * (1 - bevel * 0.5);        // petal amp, reduced by bevel
      styleParams[2] = phaseDeg * Math.PI / 180;       // petal phase
      styleParams[3] = 0.0;                            // pet_zg = 0 (uniform across height)
      styleParams[4] = facets * tiers;                 // ripple freq = facets * tiers
      styleParams[5] = jitter * 0.02;                  // small ripple for tier jitter
      styleParams[6] = 0;                              // ripple phase
      styleParams[7] = tiers > 1 ? 1.0 : 0.0;          // ripple z-gain if tiers > 1
      styleParams[8] = 0;                              // no bell
      break;
    }
      
    default:
      // No style parameters - leave all zeros
      styleParams[47] = 0; // Disable style params
      break;
  }
  
  return {
    styleId,
    styleParams,
  };
}

/**
 * Convert Zustand mesh quality to WebGPU params format.
 */
function meshToParams(mesh: MeshQuality): Record<string, unknown> {
  return {
    nTheta: mesh.preview_n_theta,
    nZ: mesh.preview_n_z,
    // Export values are handled separately during STL export
  };
}

/**
 * Parse a hex color string to RGBA array [0-1].
 * Supports #RGB, #RRGGBB, and #RRGGBBAA formats.
 */
function hexToRgba(hex: string): [number, number, number, number] {
  // Remove # prefix if present
  const h = hex.replace(/^#/, '');
  
  let r = 0, g = 0, b = 0, a = 1;
  
  if (h.length === 3) {
    // #RGB format
    r = parseInt(h[0] + h[0], 16) / 255;
    g = parseInt(h[1] + h[1], 16) / 255;
    b = parseInt(h[2] + h[2], 16) / 255;
  } else if (h.length === 6) {
    // #RRGGBB format
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
  } else if (h.length === 8) {
    // #RRGGBBAA format
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
    a = parseInt(h.slice(6, 8), 16) / 255;
  }
  
  return [r, g, b, a];
}

/**
 * Convert Zustand appearance state to WebGPU params format.
 * Resolves lighting preset ID to actual numeric values.
 * Maps primary/secondary colors to the pot surface gradient.
 * Converts background gradient to solid background color.
 */
function appearanceToParams(appearance: AppearanceState): Record<string, unknown> {
  // Resolve lighting preset to actual values
  const preset = LIGHTING_PRESETS.find((p) => p.id === appearance.lightingPreset);
  const defaultPreset = LIGHTING_PRESETS[0]; // studio
  const lighting = preset || defaultPreset;
  
  // Convert shininess to roughness (inverse relationship)
  // shininess 8 -> roughness ~0.8, shininess 128 -> roughness ~0.1
  const roughness = Math.max(0.02, Math.min(1.0, 1.0 - (lighting.shininess / 150)));
  
  // Create pot color gradient from primary/mid/secondary colors
  // The shader expects 3 color stops: bottom (uC1), middle (uC2), top (uC3)
  const potGradient = [
    appearance.primaryColor,
    appearance.midColor,
    appearance.secondaryColor,
  ];
  
  // Convert background gradient first color to RGBA for WebGPU clear color
  // Note: WebGPU only supports solid backgrounds, so we use the first gradient color
  const bgColor = hexToRgba(appearance.gradient[0]);
  
  return {
    // Pot surface color gradient (maps to uC1, uC2, uC3 in shader)
    gradient: potGradient,
    // Resolved lighting values
    ambient: lighting.ambient,
    diffuse: lighting.diffuse,
    specular: lighting.specular,
    roughness: roughness,
    // Display toggles - these need to be handled by render logic
    // NOTE: showWireframe and showInner are not yet implemented in the WebGPU shader
    showWireframe: appearance.showWireframe,
    showInner: appearance.showInner,
    // Background color (solid) - WebGPU clear color expects [r,g,b,a] in 0-1 range
    __pf_bg_rgba: bgColor,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Bridge Zustand state to WebGPU controller.
 * 
 * @param controller - The WebGPU controller instance (or null if not mounted)
 * @param options - Configuration options for the bridge
 * 
 * @example
 * ```tsx
 * function Renderer() {
 *   const controllerRef = useRef<WebGPUController | null>(null);
 *   
 *   useRendererBridge(controllerRef.current, {
 *     geometryDebounce: 16,
 *     debug: true,
 *   });
 *   
 *   // ... rest of component
 * }
 * ```
 */
export function useRendererBridge(
  controller: WebGPUController | null,
  options: RendererBridgeOptions = {}
): void {
  // Memoize options to prevent unnecessary re-subscriptions
  const geometryDebounce = options.geometryDebounce ?? DEFAULT_OPTIONS.geometryDebounce;
  const styleDebounce = options.styleDebounce ?? DEFAULT_OPTIONS.styleDebounce;
  const appearanceDebounce = options.appearanceDebounce ?? DEFAULT_OPTIONS.appearanceDebounce;
  const debug = options.debug ?? DEFAULT_OPTIONS.debug;
  
  // Use ref for debug to avoid recreating callbacks
  const debugRef = useRef(debug);
  debugRef.current = debug;
  
  // Refs for debounce timers
  const geometryTimerRef = useRef<number | null>(null);
  const styleTimerRef = useRef<number | null>(null);
  const appearanceTimerRef = useRef<number | null>(null);
  
  // Track last sent values to avoid redundant updates
  const lastGeometryRef = useRef<string>('');
  const lastStyleRef = useRef<string>('');
  const lastAppearanceRef = useRef<string>('');
  
  // Debug logger - uses ref to avoid dependency issues
  const log = useCallback(
    (msg: string, data?: unknown) => {
      if (debugRef.current) {
        console.debug(`[RendererBridge] ${msg}`, data);
      }
    },
    [] // Empty deps - uses ref
  );
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (geometryTimerRef.current) clearTimeout(geometryTimerRef.current);
      if (styleTimerRef.current) clearTimeout(styleTimerRef.current);
      if (appearanceTimerRef.current) clearTimeout(appearanceTimerRef.current);
    };
  }, []);
  
  // Subscribe to geometry changes
  useEffect(() => {
    if (!controller) return;
    
    // Send initial geometry state immediately
    const initialGeometry = useAppStore.getState().geometry;
    const initialParams = geometryToParams(initialGeometry);
    log('geometry initial sync', initialParams);
    controller.updateParams(initialParams);
    lastGeometryRef.current = JSON.stringify(initialGeometry);
    
    const unsubscribe = useAppStore.subscribe(
      (state) => state.geometry,
      (geometry) => {
        const json = JSON.stringify(geometry);
        if (json === lastGeometryRef.current) return;
        
        // Clear existing timer
        if (geometryTimerRef.current) {
          clearTimeout(geometryTimerRef.current);
        }
        
        // Debounce the update
        geometryTimerRef.current = window.setTimeout(() => {
          lastGeometryRef.current = json;
          const params = geometryToParams(geometry);
          log('geometry update', params);
          controller.updateParams(params);
        }, geometryDebounce);
      }
    );
    
    return unsubscribe;
  }, [controller, geometryDebounce, log]);
  
  // Subscribe to style changes
  useEffect(() => {
    if (!controller) return;
    
    // Send initial style state immediately
    const initialStyle = useAppStore.getState().style;
    const initialParams = styleToParams(initialStyle);
    log('style initial sync', initialParams);
    controller.updateParams(initialParams);
    lastStyleRef.current = JSON.stringify(initialStyle);
    
    const unsubscribe = useAppStore.subscribe(
      (state) => state.style,
      (style) => {
        const json = JSON.stringify(style);
        if (json === lastStyleRef.current) return;
        
        if (styleTimerRef.current) {
          clearTimeout(styleTimerRef.current);
        }
        
        styleTimerRef.current = window.setTimeout(() => {
          lastStyleRef.current = json;
          const params = styleToParams(style);
          log('style update', params);
          controller.updateParams(params);
        }, styleDebounce);
      }
    );
    
    return unsubscribe;
  }, [controller, styleDebounce, log]);
  
  // Subscribe to mesh quality changes
  useEffect(() => {
    if (!controller) return;
    
    // Send initial mesh state immediately
    const initialMesh = useAppStore.getState().mesh;
    const initialParams = meshToParams(initialMesh);
    log('mesh initial sync', initialParams);
    controller.updateParams(initialParams);
    
    const unsubscribe = useAppStore.subscribe(
      (state) => state.mesh,
      (mesh) => {
        const params = meshToParams(mesh);
        log('mesh quality update', params);
        controller.updateParams(params);
      }
    );
    
    return unsubscribe;
  }, [controller, log]);
  
  // Subscribe to appearance changes
  useEffect(() => {
    if (!controller) return;
    
    // Send initial appearance state immediately
    const initialAppearance = useAppStore.getState().appearance;
    const initialParams = appearanceToParams(initialAppearance);
    log('appearance initial sync', initialParams);
    controller.updateParams(initialParams);
    lastAppearanceRef.current = JSON.stringify(initialAppearance);
    
    const unsubscribe = useAppStore.subscribe(
      (state) => state.appearance,
      (appearance) => {
        const json = JSON.stringify(appearance);
        if (json === lastAppearanceRef.current) return;
        
        if (appearanceTimerRef.current) {
          clearTimeout(appearanceTimerRef.current);
        }
        
        appearanceTimerRef.current = window.setTimeout(() => {
          lastAppearanceRef.current = json;
          const params = appearanceToParams(appearance);
          log('appearance update', params);
          controller.updateParams(params);
        }, appearanceDebounce);
      }
    );
    
    return unsubscribe;
  }, [controller, appearanceDebounce, log]);
}

/**
 * Mapping from style ID (number) back to style name.
 * Inverse of STYLE_NAME_TO_ID for canonical styles only.
 * Note: LowPolyFacet (ID 4) is intentionally omitted since it shares
 * the same shader as HarmonicRipple - use styleName instead of styleId
 * when loading library designs to avoid ambiguity.
 */
const STYLE_ID_TO_NAME: Record<number, StyleName> = {
  0: 'SuperformulaBlossom',
  1: 'FourierBloom',
  2: 'SpiralRidges',
  3: 'SuperellipseMorph',
  4: 'HarmonicRipple',
  // Note: LowPolyFacet also uses ID 4 but we map to HarmonicRipple by default
  // Library designs should use styleName, not styleId, to correctly load LowPolyFacet
};

/**
 * Initialize the store with values from WebGPU initial params.
 * Call this once when the controller is first mounted, or when loading
 * a design from the library to sync the UI sliders.
 */
export function syncStoreFromParams(params: Record<string, unknown>): void {
  const store = useAppStore.getState();
  
  // Sync geometry if present
  if (params.H !== undefined || params.top_od !== undefined) {
    // Convert from radius to diameter if needed
    const top_od = params.top_od as number ?? (params.Rt !== undefined ? (params.Rt as number) * 2 : store.geometry.top_od);
    const bottom_od = params.bottom_od as number ?? (params.Rb !== undefined ? (params.Rb as number) * 2 : store.geometry.bottom_od);
    
    store.setGeometryParams({
      H: params.H as number ?? store.geometry.H,
      top_od,
      bottom_od,
      t_wall: params.t_wall as number ?? store.geometry.t_wall,
      t_bottom: params.t_bottom as number ?? store.geometry.t_bottom,
      r_drain: params.r_drain as number ?? params.drain as number ?? store.geometry.r_drain,
      expn: params.expn as number ?? store.geometry.expn,
    });
  }
  
  // Sync mesh quality if present
  if (params.nTheta !== undefined || params.nZ !== undefined) {
    store.setMeshParams({
      preview_n_theta: params.nTheta as number ?? store.mesh.preview_n_theta,
      preview_n_z: params.nZ as number ?? store.mesh.preview_n_z,
    });
  }
  
  // Sync style if present (from library design load)
  // Check for styleName (string) or styleId (number)
  const styleName = params.styleName as StyleName | undefined;
  const styleId = params.styleId as number | undefined;
  const styleOpts = params.styleOpts as Record<string, number | boolean> | undefined;
  
  if (styleName !== undefined) {
    // Set the style name (this also resets opts to defaults)
    store.setStyle(styleName);
    // Then apply custom opts if provided
    if (styleOpts) {
      store.setStyleOpts(styleOpts);
    }
  } else if (styleId !== undefined) {
    // Convert styleId to styleName
    const resolvedName = STYLE_ID_TO_NAME[styleId];
    if (resolvedName) {
      store.setStyle(resolvedName);
      if (styleOpts) {
        store.setStyleOpts(styleOpts);
      }
    }
  }
}
