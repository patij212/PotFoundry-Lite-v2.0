import { describe, it, expect } from 'vitest';
import { generateStyleConstants } from './shaderGenerator';

describe('shaderGenerator', () => {
    it('should generate constants for all styles', () => {
        const wgsl = generateStyleConstants();
        expect(wgsl).toContain('const STYLE_SUPERFORMULA_BLOSSOM = 0;');
        expect(wgsl).toContain('const STYLE_FOURIER_BLOOM = 1;');
        expect(wgsl).toContain('const STYLE_VORONOI = 13;');
    });

    it('should handle PascalCase conversion correctly', () => {
        const wgsl = generateStyleConstants();
        // Check for correct macro case conversion
        expect(wgsl).toContain('STYLE_SUPERFORMULA_BLOSSOM');
        expect(wgsl).not.toContain('STYLE_SuperformulaBlossom');
        expect(wgsl).not.toContain('STYLE_SUPERFORMULABLOSSOM');
    });

    it('should act as a superset of functionality', () => {
        const wgsl = generateStyleConstants();
        // Verify it generates valid WGSL syntax (basic check)
        expect(wgsl).toMatch(/^const STYLE_[A-Z_]+ = \d+;$/m);
    });
});
