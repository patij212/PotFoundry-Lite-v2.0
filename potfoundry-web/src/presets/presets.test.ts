/**
 * Presets Module Tests
 * Tests for the presets functions and data.
 */
import { describe, it, expect } from 'vitest';
import {
    PRESETS,
    getPresetsByCategory,
    getPresetById,
    getCategories,
    presetStyleToId,
} from './presets';

describe('PRESETS', () => {
    it('should be an array', () => {
        expect(Array.isArray(PRESETS)).toBe(true);
    });

    it('should have at least one preset', () => {
        expect(PRESETS.length).toBeGreaterThan(0);
    });

    it('should have valid preset structure', () => {
        const preset = PRESETS[0];
        expect(preset.id).toBeDefined();
        expect(preset.name).toBeDefined();
        expect(preset.category).toBeDefined();
        expect(preset.config).toBeDefined();
    });

    it('should have unique IDs', () => {
        const ids = PRESETS.map(p => p.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });
});

describe('getPresetsByCategory', () => {
    it('should return presets for classic category', () => {
        const presets = getPresetsByCategory('classic');
        expect(Array.isArray(presets)).toBe(true);
    });

    it('should return presets for organic category', () => {
        const presets = getPresetsByCategory('organic');
        expect(Array.isArray(presets)).toBe(true);
    });

    it('should return empty for invalid category', () => {
        const presets = getPresetsByCategory('nonexistent' as any);
        expect(presets.length).toBe(0);
    });
});

describe('getPresetById', () => {
    it('should return preset for valid ID', () => {
        const firstPreset = PRESETS[0];
        const preset = getPresetById(firstPreset.id);
        expect(preset).toBeDefined();
        expect(preset?.id).toBe(firstPreset.id);
    });

    it('should return undefined for invalid ID', () => {
        const preset = getPresetById('nonexistent-preset-id');
        expect(preset).toBeUndefined();
    });
});

describe('getCategories', () => {
    it('should return array of categories', () => {
        const categories = getCategories();
        expect(Array.isArray(categories)).toBe(true);
    });

    it('should have category, count, and label', () => {
        const categories = getCategories();
        if (categories.length > 0) {
            const cat = categories[0];
            expect(cat.category).toBeDefined();
            expect(cat.count).toBeGreaterThanOrEqual(0);
            expect(cat.label).toBeDefined();
        }
    });
});

describe('presetStyleToId', () => {
    it('should convert superformula_blossom', () => {
        const id = presetStyleToId('superformula_blossom');
        expect(id).toBe('SuperformulaBlossom');
    });

    it('should convert fourier_bloom', () => {
        const id = presetStyleToId('fourier_bloom');
        expect(id).toBe('FourierBloom');
    });

    it('should convert harmonic_ripple', () => {
        const id = presetStyleToId('harmonic_ripple');
        expect(id).toBe('HarmonicRipple');
    });

    it('should default to SuperformulaBlossom for unknown', () => {
        const id = presetStyleToId('Unknown');
        expect(id).toBe('SuperformulaBlossom');
    });
});
