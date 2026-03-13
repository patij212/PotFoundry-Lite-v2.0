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
import type { RendererController } from '../renderers/types';
import type { GeometryParams, StyleState, AppearanceState, MeshQuality, StyleName } from '../state';
import { buildStyleParamPayload } from '../utils/styleParams';

/** Controller type union accepted by the renderer bridge */
export type BridgeController = WebGPUController | RendererController;

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
    // Bell/bulge parameters
    bellAmp: geometry.bellAmp,
    bellCenter: geometry.bellCenter,
    bellWidth: geometry.bellWidth,
    // Spin/twist parameters  
    spinTurns: geometry.spinTurns,
    spinPhase: (geometry.spinPhase ?? 0) * Math.PI / 180, // Convert degrees to radians
    spinCurve: geometry.spinCurve,
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
  // Special case: LowPolyFacet
  // Ideally this should be moved to a custom packer in styleParams.ts, but due to
  // the parameter re-mapping logic (lp_facets -> hr_petals), we keep it here to
  // maintain behavior without altering the shared utility.
  if (style.name === 'LowPolyFacet') {
    const opts = style.opts;
    // STYLE_SCHEMAS params: lp_facets, lp_tiers, lp_amp, lp_bevel, lp_jitter
    // Advanced: lp_phase_deg
    const facets = getNum(opts.lp_facets, 12);
    const tiers = getNum(opts.lp_tiers, 1);
    const amp = getNum(opts.lp_amp, 0.12);
    const bevel = getNum(opts.lp_bevel, 0.15);
    const jitter = getNum(opts.lp_jitter, 0.15);
    const phaseDeg = getNum(opts.lp_phase_deg, 0);

    const styleParams = new Array(48).fill(0);
    // Map to harmonic shader (ID 4) for a faceted look:
    // petals = facets, with high z-gain to make facets uniform across height
    styleParams[0] = facets;                         // petals = facet count
    styleParams[1] = amp * (1 - bevel * 0.5);        // petal amp, reduced by bevel
    styleParams[2] = phaseDeg * Math.PI / 180;       // petal phase
    styleParams[3] = 0.0;                            // pet_zg = 0 (uniform across height)
    styleParams[4] = facets * tiers;                 // ripple freq = facets * tiers
    styleParams[5] = jitter * 0.02;                  // small ripple for tier jitter
    styleParams[6] = 0;                              // ripple phase
    styleParams[7] = tiers > 1 ? 1.0 : 0.0;          // ripple z-gain if tiers > 1
    styleParams[8] = 0;                              // no bell

    // Set active flag
    styleParams[47] = 1.0;

    return {
      styleId: 4, // ID for HarmonicRipple
      styleParams,
    };
  }

  // For all other styles (standard + new ones), use the shared packer utility
  const [styleId, styleParams] = buildStyleParamPayload(style.name, style.opts as Record<string, unknown>);

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
    seamAngle: mesh.seamAngle ?? 0, // Seam blend angle in degrees
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

  // Background gradient colors (2 colors for vertical gradient)
  const bgColor1 = hexToRgba(appearance.gradient[0]);
  const bgColor2 = hexToRgba(appearance.gradient[1]);

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
    // Background gradient - both colors for fullscreen gradient
    background_gradient: appearance.gradient,
    gradient_angle: (appearance.gradientAngle ?? 0) * Math.PI / 180,
    __pf_bg_gradient: [bgColor1, bgColor2],
    // Legacy: first color for clear color fallback
    __pf_bg_rgba: bgColor1,
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
  controller: BridgeController | null,
  options: RendererBridgeOptions = {}
): void {
  // Memoize options to prevent unnecessary re-subscriptions
  const geometryDebounce = options.geometryDebounce ?? DEFAULT_OPTIONS.geometryDebounce;
  const styleDebounce = options.styleDebounce ?? DEFAULT_OPTIONS.styleDebounce;
  const appearanceDebounce = options.appearanceDebounce ?? DEFAULT_OPTIONS.appearanceDebounce;
  const debug = options.debug ?? DEFAULT_OPTIONS.debug;

  if (import.meta.env.DEV) console.log('useRendererBridge controller:', controller ? 'PRESENT' : 'NULL');

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
  5: 'GothicArches',
  6: 'WaveInterference',
  7: 'Crystalline',
  8: 'ArtDeco',
  9: 'DragonScales',
  10: 'BambooSegments',
  11: 'RippleInterference',
  12: 'GyroidManifold',
  13: 'Voronoi',
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

/**
 * Immediately send ALL current Zustand store state to the WebGPU controller.
 * 
 * This function eliminates the "grey state" that occurs between mount() and
 * useRendererBridge activation. Call this right after mount() completes.
 * 
 * NOTE: A small delay is added to allow the GPU instance to stabilize after
 * initialization before receiving rapid state updates. This prevents device loss
 * crashes on some drivers.
 * 
 * @param controller - The WebGPU controller instance
 */
export function sendFullStoreToController(controller: BridgeController): void {
  // Delay to allow GPU instance to stabilize after initialization
  // This prevents "Instance reference no longer exists" crashes on Windows
  setTimeout(() => {
    try {
      const store = useAppStore.getState();

      // Send geometry
      const geometryParams = geometryToParams(store.geometry);
      controller.updateParams(geometryParams);

      // Send style  
      const styleParams = styleToParams(store.style);
      controller.updateParams(styleParams);

      // Send appearance
      const appearanceParams = appearanceToParams(store.appearance);
      controller.updateParams(appearanceParams);

      // Send mesh quality
      const meshParams = meshToParams(store.mesh);
      controller.updateParams(meshParams);

      if (import.meta.env.DEV) console.log('[RendererBridge] Sent full store state after stabilization delay');
    } catch (err) {
      console.warn('[RendererBridge] Failed to send store state:', err);
    }
  }, 100); // 100ms delay for GPU stabilization
}
