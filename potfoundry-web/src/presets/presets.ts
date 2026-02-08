/**
 * Presets Module - Pre-configured pot designs
 * 
 * Provides curated preset configurations for quick starting points.
 * Each preset is structured to be compatible with the LibraryDesign interface
 * for easy reuse of the WebGPU thumbnail renderer.
 */

import {
  StyleId,
  DEFAULT_SUPERFORMULA,
  DEFAULT_SPIRAL,
  DEFAULT_SUPERELLIPSE,
  DEFAULT_HARMONIC,
  DEFAULT_WAVE_INTERFERENCE,
  DEFAULT_CRYSTALLINE,
  DEFAULT_BAMBOO_SEGMENTS,
  DEFAULT_LOW_POLY_FACET,
  DEFAULT_GYROID_MANIFOLD,
  DEFAULT_VORONOI,
  DEFAULT_CELTIC_KNOT,

} from '../geometry';

// ============================================================================
// Types
// ============================================================================

export type PresetCategory =
  | 'Classic'
  | 'Modern'
  | 'Organic'
  | 'Geometric'
  | 'Experimental';

/**
 * PotPreset definition.
 * 
 * Intentionally designed to share structure with LibraryDesign
 * from LibraryContext.tsx to allow sharing the ThumbnailRenderer.
 */
export interface PotPreset {
  id: string;
  title: string;
  description: string;
  category: PresetCategory;

  // Core Design Properties (Matches LibraryDesign structure)
  style: StyleId;

  /** Dimensions in mm - Snake_case to match LibraryDesign/Python backend */
  size: {
    height: number;
    top_od: number;
    bottom_od: number;
    wall_thickness: number;
    bottom_thickness: number;
    drain_radius: number;
    flare_exp: number;
  };

  /** Style-specific parameters + spin/bell modifiers */
  opts: Record<string, number | boolean>;

  /** Visual appearance settings */
  appearance: {
    primaryColor: string;
    midColor: string;
    secondaryColor: string;
    gradient: [string, string];
    gradientAngle?: number;
    lightingPreset?: string;
  };
}

// ============================================================================
// Helper: Configuration Builder
// ============================================================================

/**
 * Type-safe helper to build opts object
 */
function buildOpts(
  styleParams: Record<string, number | boolean>,
  modifiers: {
    spin_turns?: number;
    spin_phase?: number;
    spin_curve?: number;
    bell_amp?: number;
    bell_center?: number;
    bell_width?: number;
  } = {}
): Record<string, number | boolean> {
  return { ...styleParams, ...modifiers };
}

// ============================================================================
// Preset Definitions
// ============================================================================

export const PRESETS: PotPreset[] = [
  // --------------------------------------------------------------------------
  // CLASSIC
  // --------------------------------------------------------------------------
  {
    id: 'classic-terracotta',
    title: 'Terracotta Classic',
    description: 'Timeless garden pot design',
    category: 'Classic',
    style: 'SuperformulaBlossom',
    size: {
      height: 120, top_od: 160, bottom_od: 90,
      wall_thickness: 4, bottom_thickness: 4, drain_radius: 12, flare_exp: 1.1
    },
    opts: buildOpts({
      ...DEFAULT_SUPERFORMULA,
      sfMBase: 0, sfMTop: 0, // Perfectly round
    }),
    appearance: {
      primaryColor: '#8B4513',
      midColor: '#CD853F',
      secondaryColor: '#DEB887',
      gradient: ['#2F1B10', '#5D4037'],
    }
  },
  {
    id: 'classic-planter',
    title: 'Round Planter',
    description: 'Simple, stout planter for easy potting',
    category: 'Classic',
    style: 'SuperformulaBlossom',
    size: {
      height: 100, top_od: 140, bottom_od: 100,
      wall_thickness: 3.5, bottom_thickness: 4, drain_radius: 10, flare_exp: 1.05
    },
    opts: buildOpts({
      ...DEFAULT_SUPERFORMULA,
      sfMBase: 0, sfMTop: 0,
    }),
    appearance: {
      primaryColor: '#5D4037',
      midColor: '#8D6E63',
      secondaryColor: '#BCAAA4',
      gradient: ['#1A1A1A', '#2C2C2C'],
    }
  },
  {
    id: 'classic-vase',
    title: 'Elegant Vase',
    description: 'Tall, slender form for floral arrangements',
    category: 'Classic',
    style: 'HarmonicRipple',
    size: {
      height: 180, top_od: 90, bottom_od: 70,
      wall_thickness: 2.5, bottom_thickness: 3, drain_radius: 8, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_HARMONIC,
      hrPetals: 0, // Disable petals for smooth roundness
      hrRippleAmp: 0.01, // Very subtle texture
      hrBell: 0.15, // Nice curve
    }, { bell_amp: 0.1, bell_center: 0.6 }),
    appearance: {
      primaryColor: '#1A237E',
      midColor: '#303F9F',
      secondaryColor: '#3949AB',
      gradient: ['#000000', '#1A237E'],
    }
  },

  // --------------------------------------------------------------------------
  // MODERN
  // --------------------------------------------------------------------------
  {
    id: 'modern-cylinder',
    title: 'Minimal Cylinder',
    description: 'Clean straight lines, perfect for modern interiors',
    category: 'Modern',
    style: 'SuperellipseMorph',
    size: {
      height: 140, top_od: 120, bottom_od: 120,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_SUPERELLIPSE,
      seMBase: 2, seMTop: 2, // Circle
      seC4Amp: 0,
    }),
    appearance: {
      primaryColor: '#212121',
      midColor: '#424242',
      secondaryColor: '#616161',
      gradient: ['#ECEFF1', '#CFD8DC'],
      gradientAngle: 45
    }
  },
  {
    id: 'modern-twist',
    title: 'Architectural Twist',
    description: 'Square profile with a sharp 90-degree twist',
    category: 'Modern',
    style: 'SuperellipseMorph',
    size: {
      height: 150, top_od: 110, bottom_od: 110,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_SUPERELLIPSE,
      seMBase: 10, seMTop: 10, // Square-ish
      seC4Amp: 0,
    }, { spin_turns: 0.25, spin_curve: 1.0 }), // 90 degree twist
    appearance: {
      primaryColor: '#263238',
      midColor: '#37474F',
      secondaryColor: '#455A64',
      gradient: ['#FFFFFF', '#ECEFF1'],
    }
  },
  {
    id: 'modern-hex',
    title: 'Hexagonal Tower',
    description: 'Sharp hexagonal geometry',
    category: 'Modern',
    style: 'Crystalline',
    size: {
      height: 130, top_od: 120, bottom_od: 100,
      wall_thickness: 2.5, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_CRYSTALLINE,
      crFacetCount: 6,
      crFacetDepth: 0.2,
      crEdgeSharpness: 4.0,
      crSubFacets: 1,
    }),
    appearance: {
      primaryColor: '#1B5E20',
      midColor: '#2E7D32',
      secondaryColor: '#388E3C',
      gradient: ['#E8F5E9', '#C8E6C9'],
    }
  },

  // --------------------------------------------------------------------------
  // ORGANIC
  // --------------------------------------------------------------------------
  {
    id: 'organic-ripple',
    title: 'Ripple Vase',
    description: 'Flowing water ripples frozen in time',
    category: 'Organic',
    style: 'HarmonicRipple',
    size: {
      height: 140, top_od: 130, bottom_od: 80,
      wall_thickness: 2.5, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.1
    },
    opts: buildOpts({
      ...DEFAULT_HARMONIC,
      hrPetals: 7,
      hrPetalAmp: 0.15,
      hrRippleFreq: 15,
      hrRippleAmp: 0.05,
      hrBell: 0.1,
    }),
    appearance: {
      primaryColor: '#006064',
      midColor: '#00838F',
      secondaryColor: '#0097A7',
      gradient: ['#E0F7FA', '#B2EBF2'],
    }
  },
  {
    id: 'organic-bloom',
    title: 'Tulip Bloom',
    description: 'Opens up like a flower at the rim',
    category: 'Organic',
    style: 'SuperformulaBlossom',
    size: {
      height: 120, top_od: 150, bottom_od: 70,
      wall_thickness: 2.5, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.4
    },
    opts: buildOpts({
      ...DEFAULT_SUPERFORMULA,
      sfMBase: 3, sfMTop: 6,
      sfN1: 0.3, sfN1Top: 0.5,
    }),
    appearance: {
      primaryColor: '#880E4F',
      midColor: '#AD1457',
      secondaryColor: '#C2185B',
      gradient: ['#FCE4EC', '#F8BBD0'],
    }
  },
  {
    id: 'organic-bamboo',
    title: 'Bamboo Stalk',
    description: 'Segmented natural growth pattern',
    category: 'Organic',
    style: 'BambooSegments',
    size: {
      height: 160, top_od: 90, bottom_od: 85,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 8, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_BAMBOO_SEGMENTS,
      bsNodeCount: 5,
      bsNodeProminence: 0.1,
    }),
    appearance: {
      primaryColor: '#33691E',
      midColor: '#558B2F',
      secondaryColor: '#689F38',
      gradient: ['#F1F8E9', '#DCEDC8'],
    }
  },

  // --------------------------------------------------------------------------
  // GEOMETRIC
  // --------------------------------------------------------------------------
  {
    id: 'geo-lowpoly',
    title: 'Low Poly Gem',
    description: 'Faceted, crystalline aesthetic',
    category: 'Geometric',
    style: 'LowPolyFacet',
    size: {
      height: 110, top_od: 130, bottom_od: 90,
      wall_thickness: 2.8, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.1
    },
    opts: buildOpts({
      ...DEFAULT_LOW_POLY_FACET,
      lpFacets: 8,
      lpTiers: 2,
      lpAmp: 0.15,
      lpJitter: 0.05
    }),
    appearance: {
      primaryColor: '#4A148C',
      midColor: '#6A1B9A',
      secondaryColor: '#7B1FA2',
      gradient: ['#F3E5F5', '#E1BEE7'],
    }
  },
  {
    id: 'geo-voronoi',
    title: 'Voronoi Lantern',
    description: 'Cellular organic pattern (Requires performance check)',
    category: 'Geometric',
    style: 'Voronoi',
    size: {
      height: 130, top_od: 110, bottom_od: 110,
      wall_thickness: 2.5, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_VORONOI,
      vScale: 6,
      vRelief: 2.5,
      vThickness: 0.15,
    }),
    appearance: {
      primaryColor: '#BF360C',
      midColor: '#D84315',
      secondaryColor: '#E64A19',
      gradient: ['#FFF3E0', '#FFE0B2'],
    }
  },
  {
    id: 'geo-spiral',
    title: 'Extreme Twist',
    description: 'Aggressive spiral ridges',
    category: 'Geometric',
    style: 'SpiralRidges',
    size: {
      height: 140, top_od: 100, bottom_od: 80,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.1
    },
    opts: buildOpts({
      ...DEFAULT_SPIRAL,
      spiralK: 6,
      spiralTurns: 1.5,
      spiralAmpMin: 0.2,
      spiralAmpMax: 0.3,
    }),
    appearance: {
      primaryColor: '#0D47A1',
      midColor: '#1565C0',
      secondaryColor: '#1976D2',
      gradient: ['#E3F2FD', '#BBDEFB'],
    }
  },

  // --------------------------------------------------------------------------
  // EXPERIMENTAL
  // --------------------------------------------------------------------------
  {
    id: 'exp-gyroid',
    title: 'Gyroid Structure',
    description: 'Mathematical minimal surface',
    category: 'Experimental',
    style: 'GyroidManifold',
    size: {
      height: 120, top_od: 120, bottom_od: 120,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.0
    },
    opts: buildOpts({
      ...DEFAULT_GYROID_MANIFOLD,
      gmScale: 3,
      gmRelief: 2,
    }),
    appearance: {
      primaryColor: '#004D40',
      midColor: '#00695C',
      secondaryColor: '#00796B',
      gradient: ['#E0F2F1', '#B2DFDB'],
    }
  },
  {
    id: 'exp-celtic',
    title: 'Celtic Chalice',
    description: 'Interwoven knotwork patterns',
    category: 'Experimental',
    style: 'CelticKnot',
    size: {
      height: 140, top_od: 100, bottom_od: 80,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.2
    },
    opts: buildOpts({
      ...DEFAULT_CELTIC_KNOT,
      ckScale: 3,
      ckRelief: 1.5,
    }),
    appearance: {
      primaryColor: '#3E2723',
      midColor: '#4E342E',
      secondaryColor: '#5D4037',
      gradient: ['#EFEBE9', '#D7CCC8'],
    }
  },
  {
    id: 'exp-interference',
    title: 'Wave Interference',
    description: 'Complex moire patterns',
    category: 'Experimental',
    style: 'WaveInterference',
    size: {
      height: 130, top_od: 110, bottom_od: 90,
      wall_thickness: 3, bottom_thickness: 3, drain_radius: 10, flare_exp: 1.1
    },
    opts: buildOpts({
      ...DEFAULT_WAVE_INTERFERENCE,
      wiReliefDepth: 2,
      wiMoireStrength: 0.8,
    }),
    appearance: {
      primaryColor: '#1A237E',
      midColor: '#283593',
      secondaryColor: '#303F9F',
      gradient: ['#E8EAF6', '#C5CAE9'],
    }
  }
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
  // Ordered list of categories for the UI
  const categories: PresetCategory[] = ['Classic', 'Modern', 'Organic', 'Geometric', 'Experimental'];

  return categories.map((category) => ({
    category,
    count: PRESETS.filter((p) => p.category === category).length,
    label: category, // Category name is already user-friendly
  }));
}
