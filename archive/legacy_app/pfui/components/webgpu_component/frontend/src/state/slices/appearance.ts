/**
 * Appearance state slice for Zustand store.
 * 
 * Manages visual appearance settings including colors, wireframe,
 * and lighting presets.
 * 
 * @module state/slices/appearance
 */

import { StateCreator } from 'zustand';
import { AppearanceState, DEFAULT_APPEARANCE } from '../types';

// ============================================================================
// Color Schemes
// ============================================================================

/**
 * Helper to blend two hex colors.
 */
function blendHexColors(color1: string, color2: string, ratio: number = 0.5): string {
  const c1 = color1.replace('#', '');
  const c2 = color2.replace('#', '');
  const r1 = parseInt(c1.slice(0, 2), 16);
  const g1 = parseInt(c1.slice(2, 4), 16);
  const b1 = parseInt(c1.slice(4, 6), 16);
  const r2 = parseInt(c2.slice(0, 2), 16);
  const g2 = parseInt(c2.slice(2, 4), 16);
  const b2 = parseInt(c2.slice(4, 6), 16);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Predefined color schemes for pot appearance.
 */
export interface ColorScheme {
  id: string;
  name: string;
  primary: string;
  mid: string;
  secondary: string;
  description: string;
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'terracotta',
    name: 'Terracotta',
    primary: '#c75b39',
    mid: '#cf7a5c',
    secondary: '#d4a574',
    description: 'Classic terracotta pot color',
  },
  {
    id: 'slate',
    name: 'Slate',
    primary: '#4a5568',
    mid: '#5e6a7d',
    secondary: '#718096',
    description: 'Modern slate grey',
  },
  {
    id: 'ceramic_white',
    name: 'Ceramic White',
    primary: '#f5f5f5',
    mid: '#eaeaea',
    secondary: '#e0e0e0',
    description: 'Clean white ceramic',
  },
  {
    id: 'ocean_blue',
    name: 'Ocean Blue',
    primary: '#2b6cb0',
    mid: '#3680c8',
    secondary: '#4299e1',
    description: 'Deep ocean blue',
  },
  {
    id: 'forest_green',
    name: 'Forest Green',
    primary: '#276749',
    mid: '#389160',
    secondary: '#48bb78',
    description: 'Natural forest green',
  },
  {
    id: 'sunset_coral',
    name: 'Sunset Coral',
    primary: '#ed8936',
    mid: '#f19b45',
    secondary: '#f6ad55',
    description: 'Warm sunset coral',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    primary: '#805ad5',
    mid: '#9b77e4',
    secondary: '#b794f4',
    description: 'Soft lavender purple',
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    primary: '#1a202c',
    mid: '#24293a',
    secondary: '#2d3748',
    description: 'Deep charcoal black',
  },
  {
    id: 'desert_sand',
    name: 'Desert Sand',
    primary: '#d69e2e',
    mid: '#e1b33c',
    secondary: '#ecc94b',
    description: 'Warm desert sand',
  },
  {
    id: 'rose_gold',
    name: 'Rose Gold',
    primary: '#c53030',
    mid: '#df5858',
    secondary: '#fc8181',
    description: 'Elegant rose gold',
  },
];

// ============================================================================
// Lighting Presets
// ============================================================================

/**
 * Predefined lighting configurations.
 */
export interface LightingPreset {
  id: string;
  name: string;
  description: string;
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    description: 'Balanced studio lighting',
    ambient: 0.3,
    diffuse: 0.7,
    specular: 0.5,
    shininess: 32,
  },
  {
    id: 'soft',
    name: 'Soft',
    description: 'Diffused soft lighting',
    ambient: 0.5,
    diffuse: 0.5,
    specular: 0.2,
    shininess: 16,
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    description: 'High contrast dramatic lighting',
    ambient: 0.15,
    diffuse: 0.85,
    specular: 0.8,
    shininess: 64,
  },
  {
    id: 'flat',
    name: 'Flat',
    description: 'Minimal shadows for clarity',
    ambient: 0.7,
    diffuse: 0.3,
    specular: 0.1,
    shininess: 8,
  },
  {
    id: 'glossy',
    name: 'Glossy',
    description: 'Highly reflective finish',
    ambient: 0.2,
    diffuse: 0.5,
    specular: 1.0,
    shininess: 128,
  },
];

// ============================================================================
// Background Gradients
// ============================================================================

/**
 * Predefined background gradient options.
 */
export interface BackgroundGradient {
  id: string;
  name: string;
  colors: [string, string];
}

export const BACKGROUND_GRADIENTS: BackgroundGradient[] = [
  { id: 'dark_blue', name: 'Dark Blue', colors: ['#1a1a2e', '#16213e'] },
  { id: 'charcoal', name: 'Charcoal', colors: ['#1a1a1a', '#2d2d2d'] },
  { id: 'midnight', name: 'Midnight', colors: ['#0f0f23', '#1a1a3e'] },
  { id: 'soft_grey', name: 'Soft Grey', colors: ['#2c3e50', '#4a5568'] },
  { id: 'warm_dark', name: 'Warm Dark', colors: ['#1a1512', '#2d2420'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0c2340', '#1e4d6b'] },
  { id: 'forest', name: 'Forest', colors: ['#0d1f0d', '#1a3c1a'] },
  { id: 'pure_black', name: 'Pure Black', colors: ['#000000', '#0a0a0a'] },
];

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * Appearance slice state and actions.
 */
export interface AppearanceSlice {
  /** Current appearance settings */
  appearance: AppearanceState;
  
  /**
   * Apply a color scheme.
   * 
   * @param schemeId - Color scheme identifier
   */
  setColorScheme: (schemeId: string) => void;
  
  /**
   * Set the primary mesh color directly (bottom of pot).
   * 
   * @param color - Hex color string
   */
  setPrimaryColor: (color: string) => void;
  
  /**
   * Set the mid mesh color directly (middle of pot).
   * 
   * @param color - Hex color string
   */
  setMidColor: (color: string) => void;
  
  /**
   * Set the secondary/accent color directly (top of pot).
   * 
   * @param color - Hex color string
   */
  setSecondaryColor: (color: string) => void;
  
  /**
   * Toggle wireframe overlay visibility.
   */
  toggleWireframe: () => void;
  
  /**
   * Set wireframe visibility.
   * 
   * @param show - Whether to show wireframe
   */
  setShowWireframe: (show: boolean) => void;
  
  /**
   * Toggle inner surface visibility.
   */
  toggleInner: () => void;
  
  /**
   * Set inner surface visibility.
   * 
   * @param show - Whether to show inner surface
   */
  setShowInner: (show: boolean) => void;
  
  /**
   * Apply a background gradient preset.
   * Note: WebGPU only supports solid backgrounds; first color is used.
   * 
   * @param gradientId - Gradient identifier
   */
  setBackgroundGradient: (gradientId: string) => void;
  
  /**
   * Set custom background gradient colors.
   * Note: WebGPU only supports solid backgrounds; first color is used.
   * 
   * @param colors - Tuple of two hex color strings
   */
  setCustomGradient: (colors: [string, string]) => void;
  
  /**
   * Apply a lighting preset.
   * 
   * @param presetId - Lighting preset identifier
   */
  setLightingPreset: (presetId: string) => void;
  
  /**
   * Reset appearance to defaults.
   */
  resetAppearance: () => void;
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the appearance slice.
 */
export const createAppearanceSlice: StateCreator<
  AppearanceSlice,
  [],
  [],
  AppearanceSlice
> = (set) => ({
  appearance: { ...DEFAULT_APPEARANCE },
  
  setColorScheme: (schemeId) => {
    const scheme = COLOR_SCHEMES.find((s) => s.id === schemeId);
    if (!scheme) return;
    
    set((state) => ({
      appearance: {
        ...state.appearance,
        colorScheme: schemeId,
        primaryColor: scheme.primary,
        midColor: scheme.mid,
        secondaryColor: scheme.secondary,
      },
    }));
  },
  
  setPrimaryColor: (color) => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        colorScheme: 'custom',
        primaryColor: color,
      },
    }));
  },
  
  setMidColor: (color) => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        colorScheme: 'custom',
        midColor: color,
      },
    }));
  },
  
  setSecondaryColor: (color) => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        colorScheme: 'custom',
        secondaryColor: color,
      },
    }));
  },
  
  toggleWireframe: () => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        showWireframe: !state.appearance.showWireframe,
      },
    }));
  },
  
  setShowWireframe: (show) => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        showWireframe: show,
      },
    }));
  },
  
  toggleInner: () => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        showInner: !state.appearance.showInner,
      },
    }));
  },
  
  setShowInner: (show) => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        showInner: show,
      },
    }));
  },
  
  setBackgroundGradient: (gradientId) => {
    const gradient = BACKGROUND_GRADIENTS.find((g) => g.id === gradientId);
    if (!gradient) return;
    
    set((state) => ({
      appearance: {
        ...state.appearance,
        gradient: gradient.colors,
      },
    }));
  },
  
  setCustomGradient: (colors) => {
    set((state) => ({
      appearance: {
        ...state.appearance,
        gradient: colors,
      },
    }));
  },
  
  setLightingPreset: (presetId) => {
    const preset = LIGHTING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    
    set((state) => ({
      appearance: {
        ...state.appearance,
        lightingPreset: presetId,
      },
    }));
  },
  
  resetAppearance: () => {
    set({ appearance: { ...DEFAULT_APPEARANCE } });
  },
});
