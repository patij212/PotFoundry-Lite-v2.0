/**
 * Presets Module - Pre-configured pot designs
 * 
 * Provides curated preset configurations for quick starting points.
 * Each preset includes geometry, style, and appearance settings.
 */

import {
  StyleId,
  DEFAULT_SUPERFORMULA,
  DEFAULT_FOURIER,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
} from '../geometry';

// ============================================================================
// Types
// ============================================================================

export interface PotPreset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: PresetCategory;
  /** Thumbnail color for visual identification */
  color: string;
  /** Configuration */
  config: PresetConfig;
}

export interface PresetConfig {
  geometry: {
    H: number;
    topOd: number;
    bottomOd: number;
    tWall: number;
    tBottom: number;
    rDrain: number;
    expn: number;
  };
  style: {
    type: string;
    params: Record<string, number>;
  };
  appearance?: {
    primaryColor?: string;
    gradient?: string[];
  };
}

export type PresetCategory = 
  | 'classic'      // Traditional pot shapes
  | 'organic'      // Natural, flowing forms
  | 'geometric'    // Clean, mathematical patterns
  | 'decorative'   // Ornate, detailed designs
  | 'minimal';     // Simple, elegant forms

// ============================================================================
// Preset Definitions
// ============================================================================

export const PRESETS: PotPreset[] = [
  // Classic Category
  {
    id: 'classic-round',
    name: 'Classic Round',
    description: 'Traditional rounded pot with gentle flare',
    category: 'classic',
    color: '#8B7355',
    config: {
      geometry: {
        H: 100,
        topOd: 120,
        bottomOd: 80,
        tWall: 3.0,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.2,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          sfMBase: 0,
          sfMTop: 0,
          sfN1: 1,
          sfN2: 1,
          sfN3: 1,
        },
      },
      appearance: {
        primaryColor: '#8B7355',
        gradient: ['#8B7355', '#A0826D', '#B5917F'],
      },
    },
  },
  {
    id: 'terracotta-tall',
    name: 'Terracotta Tall',
    description: 'Tall classic terracotta style',
    category: 'classic',
    color: '#CD853F',
    config: {
      geometry: {
        H: 150,
        topOd: 100,
        bottomOd: 70,
        tWall: 3.5,
        tBottom: 4.0,
        rDrain: 12,
        expn: 1.0,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          sfMBase: 0,
          sfMTop: 0,
          sfN1: 1,
          sfN2: 1,
          sfN3: 1,
        },
      },
      appearance: {
        primaryColor: '#CD853F',
        gradient: ['#8B4513', '#CD853F', '#DEB887'],
      },
    },
  },

  // Organic Category
  {
    id: 'flower-blossom',
    name: 'Flower Blossom',
    description: '8-petal flower shape that blooms at the rim',
    category: 'organic',
    color: '#FF69B4',
    config: {
      geometry: {
        H: 110,
        topOd: 140,
        bottomOd: 70,
        tWall: 2.5,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.4,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          ...DEFAULT_SUPERFORMULA,
          sfMBase: 4,
          sfMTop: 8,
          sfMCurveExp: 1.5,
          sfN1: 0.3,
          sfN1Top: 0.5,
        },
      },
      appearance: {
        primaryColor: '#FF69B4',
        gradient: ['#FF1493', '#FF69B4', '#FFB6C1'],
      },
    },
  },
  {
    id: 'ocean-wave',
    name: 'Ocean Wave',
    description: 'Flowing wave patterns inspired by the sea',
    category: 'organic',
    color: '#20B2AA',
    config: {
      geometry: {
        H: 120,
        topOd: 130,
        bottomOd: 85,
        tWall: 2.8,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.1,
      },
      style: {
        type: 'harmonic_ripple',
        params: {
          ...DEFAULT_HARMONIC,
          hrPetals: 5,
          hrPetalAmp: 0.12,
          hrRippleFreq: 25,
          hrRippleAmp: 0.04,
          hrBell: 0.08,
        },
      },
      appearance: {
        primaryColor: '#20B2AA',
        gradient: ['#008B8B', '#20B2AA', '#48D1CC'],
      },
    },
  },
  {
    id: 'spiral-shell',
    name: 'Spiral Shell',
    description: 'Nautilus-inspired spiral ridges',
    category: 'organic',
    color: '#DEB887',
    config: {
      geometry: {
        H: 100,
        topOd: 110,
        bottomOd: 75,
        tWall: 3.0,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.2,
      },
      style: {
        type: 'spiral_ridges',
        params: {
          ...DEFAULT_SPIRAL,
          spiralK: 7,
          spiralTurns: 1.5,
          spiralAmpMin: 0.10,
          spiralAmpMax: 0.20,
        },
      },
      appearance: {
        primaryColor: '#DEB887',
        gradient: ['#D2B48C', '#DEB887', '#F5DEB3'],
      },
    },
  },

  // Geometric Category
  {
    id: 'hex-morph',
    name: 'Hexagonal Morph',
    description: 'Circle to hexagon transition',
    category: 'geometric',
    color: '#4169E1',
    config: {
      geometry: {
        H: 90,
        topOd: 120,
        bottomOd: 90,
        tWall: 3.0,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.0,
      },
      style: {
        type: 'superellipse_morph',
        params: {
          ...DEFAULT_SUPERELLIPSE,
          seMBase: 2.0,
          seMTop: 4.0,
          seC4Amp: 0.0,
        },
      },
      appearance: {
        primaryColor: '#4169E1',
        gradient: ['#1E90FF', '#4169E1', '#6495ED'],
      },
    },
  },
  {
    id: 'star-burst',
    name: 'Star Burst',
    description: '6-point star pattern',
    category: 'geometric',
    color: '#FFD700',
    config: {
      geometry: {
        H: 100,
        topOd: 130,
        bottomOd: 80,
        tWall: 2.5,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.3,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          ...DEFAULT_SUPERFORMULA,
          sfMBase: 3,
          sfMTop: 6,
          sfN1: 0.25,
          sfN2: 1.2,
          sfN3: 1.2,
        },
      },
      appearance: {
        primaryColor: '#FFD700',
        gradient: ['#FFA500', '#FFD700', '#FFFF00'],
      },
    },
  },

  // Decorative Category
  {
    id: 'baroque-bloom',
    name: 'Baroque Bloom',
    description: 'Ornate multi-frequency floral pattern',
    category: 'decorative',
    color: '#800080',
    config: {
      geometry: {
        H: 130,
        topOd: 150,
        bottomOd: 90,
        tWall: 2.5,
        tBottom: 3.0,
        rDrain: 12,
        expn: 1.5,
      },
      style: {
        type: 'fourier_bloom',
        params: {
          ...DEFAULT_FOURIER,
          fbBaseCos8Amp: 0.15,
          fbTopCos11Amp: 0.22,
          fbWobbleAmp: 0.08,
          fbStrength: 1.2,
        },
      },
      appearance: {
        primaryColor: '#800080',
        gradient: ['#4B0082', '#800080', '#9932CC'],
      },
    },
  },
  {
    id: 'art-deco',
    name: 'Art Deco',
    description: 'Geometric patterns with clean lines',
    category: 'decorative',
    color: '#C0C0C0',
    config: {
      geometry: {
        H: 120,
        topOd: 110,
        bottomOd: 100,
        tWall: 3.5,
        tBottom: 4.0,
        rDrain: 10,
        expn: 0.9,
      },
      style: {
        type: 'superellipse_morph',
        params: {
          ...DEFAULT_SUPERELLIPSE,
          seMBase: 3.0,
          seMTop: 6.0,
          seC4Amp: 0.06,
          seC8Amp: 0.03,
        },
      },
      appearance: {
        primaryColor: '#C0C0C0',
        gradient: ['#808080', '#C0C0C0', '#D3D3D3'],
      },
    },
  },

  // Minimal Category
  {
    id: 'zen-bowl',
    name: 'Zen Bowl',
    description: 'Simple, wide bowl shape',
    category: 'minimal',
    color: '#F5F5DC',
    config: {
      geometry: {
        H: 60,
        topOd: 160,
        bottomOd: 100,
        tWall: 4.0,
        tBottom: 4.0,
        rDrain: 15,
        expn: 0.8,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          sfMBase: 0,
          sfMTop: 0,
          sfN1: 1,
          sfN2: 1,
          sfN3: 1,
        },
      },
      appearance: {
        primaryColor: '#F5F5DC',
        gradient: ['#EEE8CD', '#F5F5DC', '#FFFACD'],
      },
    },
  },
  {
    id: 'cylinder',
    name: 'Pure Cylinder',
    description: 'Clean cylindrical form',
    category: 'minimal',
    color: '#2F4F4F',
    config: {
      geometry: {
        H: 140,
        topOd: 100,
        bottomOd: 100,
        tWall: 3.0,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.0,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          sfMBase: 0,
          sfMTop: 0,
          sfN1: 1,
          sfN2: 1,
          sfN3: 1,
        },
      },
      appearance: {
        primaryColor: '#2F4F4F',
        gradient: ['#1C3030', '#2F4F4F', '#3D6666'],
      },
    },
  },
  {
    id: 'tapered-modern',
    name: 'Tapered Modern',
    description: 'Contemporary tapered design',
    category: 'minimal',
    color: '#696969',
    config: {
      geometry: {
        H: 110,
        topOd: 80,
        bottomOd: 120,
        tWall: 3.0,
        tBottom: 3.0,
        rDrain: 10,
        expn: 1.0,
      },
      style: {
        type: 'superformula_blossom',
        params: {
          sfMBase: 0,
          sfMTop: 0,
          sfN1: 1,
          sfN2: 1,
          sfN3: 1,
        },
      },
      appearance: {
        primaryColor: '#696969',
        gradient: ['#505050', '#696969', '#808080'],
      },
    },
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: PresetCategory): PotPreset[] {
  return PRESETS.filter((p) => p.category === category);
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): PotPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Get all categories with counts
 */
export function getCategories(): Array<{ category: PresetCategory; count: number; label: string }> {
  const categoryLabels: Record<PresetCategory, string> = {
    classic: 'Classic',
    organic: 'Organic',
    geometric: 'Geometric',
    decorative: 'Decorative',
    minimal: 'Minimal',
  };

  const categories: PresetCategory[] = ['classic', 'organic', 'geometric', 'decorative', 'minimal'];
  
  return categories.map((category) => ({
    category,
    count: PRESETS.filter((p) => p.category === category).length,
    label: categoryLabels[category],
  }));
}

/**
 * Convert preset style type to StyleId
 */
export function presetStyleToId(presetType: string): StyleId {
  const mapping: Record<string, StyleId> = {
    superformula_blossom: 'SuperformulaBlossom',
    fourier_bloom: 'FourierBloom',
    spiral_ridges: 'SpiralRidges',
    superellipse_morph: 'SuperellipseMorph',
    harmonic_ripple: 'HarmonicRipple',
  };
  return mapping[presetType] ?? 'SuperformulaBlossom';
}
