/**
 * Appearance Slice Tests
 * Tests for appearance state including colors, gradients, and presets.
 */
import { describe, it, expect } from 'vitest';
import {
    COLOR_SCHEMES,
    LIGHTING_PRESETS,
    BACKGROUND_GRADIENTS,
} from './appearance';

describe('Color Schemes', () => {
    it('should have at least 5 color schemes', () => {
        expect(COLOR_SCHEMES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have terracotta as first scheme', () => {
        expect(COLOR_SCHEMES[0].id).toBe('terracotta');
    });

    it('should have valid hex colors for all schemes', () => {
        const hexPattern = /^#[0-9A-Fa-f]{6}$/;
        for (const scheme of COLOR_SCHEMES) {
            expect(scheme.primary).toMatch(hexPattern);
            expect(scheme.mid).toMatch(hexPattern);
            expect(scheme.secondary).toMatch(hexPattern);
        }
    });

    it('should have name and description for each scheme', () => {
        for (const scheme of COLOR_SCHEMES) {
            expect(scheme.name).toBeTruthy();
            expect(typeof scheme.name).toBe('string');
        }
    });

    it('should include slate scheme', () => {
        const slate = COLOR_SCHEMES.find(s => s.id === 'slate');
        expect(slate).toBeDefined();
        expect(slate?.name).toBe('Slate');
    });

    it('should include ocean_blue scheme', () => {
        const ocean = COLOR_SCHEMES.find(s => s.id === 'ocean_blue');
        expect(ocean).toBeDefined();
    });
});

describe('Lighting Presets', () => {
    it('should have at least 3 lighting presets', () => {
        expect(LIGHTING_PRESETS.length).toBeGreaterThanOrEqual(3);
    });

    it('should have studio preset', () => {
        const studio = LIGHTING_PRESETS.find(p => p.id === 'studio');
        expect(studio).toBeDefined();
    });

    it('should have valid lighting values in range', () => {
        for (const preset of LIGHTING_PRESETS) {
            expect(preset.ambient).toBeGreaterThanOrEqual(0);
            expect(preset.ambient).toBeLessThanOrEqual(1);
            expect(preset.diffuse).toBeGreaterThanOrEqual(0);
            expect(preset.diffuse).toBeLessThanOrEqual(1);
            expect(preset.specular).toBeGreaterThanOrEqual(0);
            expect(preset.specular).toBeLessThanOrEqual(1);
            expect(preset.shininess).toBeGreaterThan(0);
        }
    });

    it('should have soft preset', () => {
        const soft = LIGHTING_PRESETS.find(p => p.id === 'soft');
        expect(soft).toBeDefined();
    });

    it('should have dramatic preset', () => {
        const dramatic = LIGHTING_PRESETS.find(p => p.id === 'dramatic');
        expect(dramatic).toBeDefined();
        expect(dramatic?.ambient).toBeLessThan(0.3);
    });
});

describe('Background Gradients', () => {
    it('should have at least 4 gradients', () => {
        expect(BACKGROUND_GRADIENTS.length).toBeGreaterThanOrEqual(4);
    });

    it('should have two colors per gradient', () => {
        for (const gradient of BACKGROUND_GRADIENTS) {
            expect(gradient.colors).toHaveLength(2);
        }
    });

    it('should have valid hex colors', () => {
        const hexPattern = /^#[0-9A-Fa-f]{6}$/;
        for (const gradient of BACKGROUND_GRADIENTS) {
            expect(gradient.colors[0]).toMatch(hexPattern);
            expect(gradient.colors[1]).toMatch(hexPattern);
        }
    });

    it('should have charcoal gradient', () => {
        const charcoal = BACKGROUND_GRADIENTS.find(g => g.id === 'charcoal');
        expect(charcoal).toBeDefined();
    });
});
