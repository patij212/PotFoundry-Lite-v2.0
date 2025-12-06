/**
 * Presets Tests
 *
 * Tests for preset definitions and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  getPresetsByCategory,
  getPresetById,
  getCategories,
  presetStyleToId,
  type PresetCategory,
} from './presets';

describe('PRESETS', () => {
  it('should have at least 10 presets', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('should have unique IDs', () => {
    const ids = PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have unique names', () => {
    const names = PRESETS.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  describe('preset structure', () => {
    it('should have required properties', () => {
      PRESETS.forEach((preset) => {
        expect(preset.id).toBeDefined();
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.category).toBeDefined();
        expect(preset.color).toBeDefined();
        expect(preset.config).toBeDefined();
      });
    });

    it('should have valid category', () => {
      const validCategories: PresetCategory[] = [
        'classic',
        'organic',
        'geometric',
        'decorative',
        'minimal',
      ];

      PRESETS.forEach((preset) => {
        expect(validCategories).toContain(preset.category);
      });
    });

    it('should have valid color (hex format)', () => {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

      PRESETS.forEach((preset) => {
        expect(preset.color).toMatch(hexColorRegex);
      });
    });
  });

  describe('config structure', () => {
    it('should have geometry config', () => {
      PRESETS.forEach((preset) => {
        const { geometry } = preset.config;
        expect(geometry.H).toBeGreaterThan(0);
        expect(geometry.topOd).toBeGreaterThan(0);
        expect(geometry.bottomOd).toBeGreaterThan(0);
        expect(geometry.tWall).toBeGreaterThan(0);
        expect(geometry.tBottom).toBeGreaterThan(0);
        expect(geometry.rDrain).toBeGreaterThanOrEqual(0);
        expect(geometry.expn).toBeGreaterThan(0);
      });
    });

    it('should have style config', () => {
      PRESETS.forEach((preset) => {
        const { style } = preset.config;
        expect(style.type).toBeDefined();
        expect(style.params).toBeDefined();
        expect(typeof style.params).toBe('object');
      });
    });

    it('should have valid style type', () => {
      const validStyleTypes = [
        'superformula_blossom',
        'fourier_bloom',
        'spiral_ridges',
        'superellipse_morph',
        'harmonic_ripple',
      ];

      PRESETS.forEach((preset) => {
        expect(validStyleTypes).toContain(preset.config.style.type);
      });
    });

    it('should have wall thickness less than radius', () => {
      PRESETS.forEach((preset) => {
        const { geometry } = preset.config;
        const minRadius = Math.min(geometry.topOd, geometry.bottomOd) / 2;
        expect(geometry.tWall).toBeLessThan(minRadius);
      });
    });

    it('should have drain hole smaller than inner radius', () => {
      PRESETS.forEach((preset) => {
        const { geometry } = preset.config;
        if (geometry.rDrain > 0) {
          const innerBottomRadius = geometry.bottomOd / 2 - geometry.tWall;
          expect(geometry.rDrain).toBeLessThan(innerBottomRadius);
        }
      });
    });
  });
});

describe('getPresetsByCategory', () => {
  it('should return presets for classic category', () => {
    const classic = getPresetsByCategory('classic');
    expect(classic.length).toBeGreaterThan(0);
    classic.forEach((p) => expect(p.category).toBe('classic'));
  });

  it('should return presets for organic category', () => {
    const organic = getPresetsByCategory('organic');
    expect(organic.length).toBeGreaterThan(0);
    organic.forEach((p) => expect(p.category).toBe('organic'));
  });

  it('should return presets for geometric category', () => {
    const geometric = getPresetsByCategory('geometric');
    expect(geometric.length).toBeGreaterThan(0);
    geometric.forEach((p) => expect(p.category).toBe('geometric'));
  });

  it('should return presets for decorative category', () => {
    const decorative = getPresetsByCategory('decorative');
    expect(decorative.length).toBeGreaterThan(0);
    decorative.forEach((p) => expect(p.category).toBe('decorative'));
  });

  it('should return presets for minimal category', () => {
    const minimal = getPresetsByCategory('minimal');
    expect(minimal.length).toBeGreaterThan(0);
    minimal.forEach((p) => expect(p.category).toBe('minimal'));
  });

  it('should return all presets when summed', () => {
    const categories: PresetCategory[] = [
      'classic',
      'organic',
      'geometric',
      'decorative',
      'minimal',
    ];
    
    const totalFromCategories = categories.reduce(
      (sum, cat) => sum + getPresetsByCategory(cat).length,
      0
    );

    expect(totalFromCategories).toBe(PRESETS.length);
  });
});

describe('getPresetById', () => {
  it('should return preset by ID', () => {
    const firstPreset = PRESETS[0];
    const found = getPresetById(firstPreset.id);

    expect(found).toBe(firstPreset);
  });

  it('should return undefined for unknown ID', () => {
    const found = getPresetById('nonexistent-id');
    expect(found).toBeUndefined();
  });

  it('should find all presets by ID', () => {
    PRESETS.forEach((preset) => {
      const found = getPresetById(preset.id);
      expect(found).toBe(preset);
    });
  });
});

describe('getCategories', () => {
  it('should return all 5 categories', () => {
    const categories = getCategories();
    expect(categories.length).toBe(5);
  });

  it('should include category, count, and label', () => {
    const categories = getCategories();

    categories.forEach((cat) => {
      expect(cat.category).toBeDefined();
      expect(cat.count).toBeGreaterThan(0);
      expect(cat.label).toBeDefined();
    });
  });

  it('should have correct counts', () => {
    const categories = getCategories();

    categories.forEach((cat) => {
      const actualCount = getPresetsByCategory(cat.category).length;
      expect(cat.count).toBe(actualCount);
    });
  });

  it('should have human-readable labels', () => {
    const categories = getCategories();
    const labels = categories.map((c) => c.label);

    expect(labels).toContain('Classic');
    expect(labels).toContain('Organic');
    expect(labels).toContain('Geometric');
    expect(labels).toContain('Decorative');
    expect(labels).toContain('Minimal');
  });
});

describe('presetStyleToId', () => {
  it('should map superformula_blossom', () => {
    expect(presetStyleToId('superformula_blossom')).toBe('SuperformulaBlossom');
  });

  it('should map fourier_bloom', () => {
    expect(presetStyleToId('fourier_bloom')).toBe('FourierBloom');
  });

  it('should map spiral_ridges', () => {
    expect(presetStyleToId('spiral_ridges')).toBe('SpiralRidges');
  });

  it('should map superellipse_morph', () => {
    expect(presetStyleToId('superellipse_morph')).toBe('SuperellipseMorph');
  });

  it('should map harmonic_ripple', () => {
    expect(presetStyleToId('harmonic_ripple')).toBe('HarmonicRipple');
  });

  it('should return SuperformulaBlossom for unknown type', () => {
    expect(presetStyleToId('unknown_style')).toBe('SuperformulaBlossom');
  });
});
