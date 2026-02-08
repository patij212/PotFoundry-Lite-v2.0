import { describe, it, expect } from 'vitest';
import { PRESETS, getPresetsByCategory, getCategories } from './presets';

describe('Presets', () => {
    it('should have unique IDs', () => {
        const ids = PRESETS.map(p => p.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
    });

    it('should have valid geometry parameters', () => {
        PRESETS.forEach(preset => {
            const { size } = preset;
            expect(size.height).toBeGreaterThan(0);
            expect(size.top_od).toBeGreaterThan(0);
            expect(size.bottom_od).toBeGreaterThan(0);
            expect(size.wall_thickness).toBeGreaterThan(0);
            expect(size.bottom_thickness).toBeGreaterThan(0);
        });
    });

    it('should have valid styles', () => {
        PRESETS.forEach(preset => {
            expect(preset.style).toBeDefined();
            expect(typeof preset.style).toBe('string');
        });
    });

    it('should be retrievable by category', () => {
        const categories = getCategories();
        categories.forEach(({ category }) => {
            const presets = getPresetsByCategory(category);
            expect(presets.length).toBeGreaterThan(0);
            presets.forEach(p => {
                expect(p.category).toBe(category);
            });
        });
    });

    it('should match LibraryDesign-like structure', () => {
        // This test ensures our "manual" compatibility with LibraryDesign doesn't drift
        PRESETS.forEach(preset => {
            expect(preset).toHaveProperty('id');
            expect(preset).toHaveProperty('title');
            expect(preset).toHaveProperty('style');
            expect(preset).toHaveProperty('size');
            expect(preset).toHaveProperty('opts');
            expect(preset).toHaveProperty('appearance');

            // Snake_case check for size
            expect(preset.size).toHaveProperty('top_od');
            expect(preset.size).toHaveProperty('bottom_od');
        });
    });
});
