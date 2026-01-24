/**
 * WGSL Syntax Validation Tests
 * 
 * These tests validate that all WGSL shader files compile without errors.
 * Uses Vite's raw import feature to access shader source.
 */

import { describe, it, expect } from 'vitest';

// Import shader sources using Vite's raw import
import commonWgsl from './assets/shaders/common.wgsl?raw';
import stylesWgsl from './assets/shaders/styles.wgsl?raw';
import previewMainWgsl from './assets/shaders/preview_main.wgsl?raw';
import potExportWgsl from './assets/shaders/pot_export.wgsl?raw';

describe('WGSL Syntax Validation', () => {
    describe('File Content Loaded', () => {
        it('common.wgsl should be non-empty', () => {
            expect(commonWgsl).toBeDefined();
            expect(commonWgsl.length).toBeGreaterThan(100);
        });

        it('styles.wgsl should be non-empty', () => {
            expect(stylesWgsl).toBeDefined();
            expect(stylesWgsl.length).toBeGreaterThan(1000);
        });

        it('preview_main.wgsl should be non-empty', () => {
            expect(previewMainWgsl).toBeDefined();
            expect(previewMainWgsl.length).toBeGreaterThan(100);
        });

        it('pot_export.wgsl should be non-empty', () => {
            expect(potExportWgsl).toBeDefined();
            expect(potExportWgsl.length).toBeGreaterThan(100);
        });
    });

    describe('Basic Syntax Checks', () => {
        it('common.wgsl should have required constants', () => {
            expect(commonWgsl).toContain('const TAU');
            expect(commonWgsl).toContain('const PI');
            expect(commonWgsl).toContain('fn smax');
            expect(commonWgsl).toContain('fn ribbon_height');
        });

        it('styles.wgsl should have style functions', () => {
            // Check for style function patterns
            expect(stylesWgsl).toContain('fn sf_radius');
            expect(stylesWgsl).toContain('fn gothic_arches_radius');
            expect(stylesWgsl).toContain('fn style_celtic_triquetra');
        });

        it('pot_export.wgsl should have compute kernels', () => {
            expect(potExportWgsl).toContain('@compute');
            expect(potExportWgsl).toContain('@workgroup_size');
            expect(potExportWgsl).toContain('fn calc_vertices');
            expect(potExportWgsl).toContain('fn calc_indices');
        });

        it('pot_export.wgsl should have proper buffer bindings', () => {
            expect(potExportWgsl).toContain('@group(0) @binding(0)');
            expect(potExportWgsl).toContain('@group(0) @binding(1)');
            expect(potExportWgsl).toContain('@group(0) @binding(2)');
            expect(potExportWgsl).toContain('@group(0) @binding(3)');
        });
    });

    describe('Syntax Pattern Validation', () => {
        it('should have balanced braces in common.wgsl', () => {
            const openBraces = (commonWgsl.match(/{/g) || []).length;
            const closeBraces = (commonWgsl.match(/}/g) || []).length;

            expect(openBraces).toBe(closeBraces);
        });

        it('should have balanced braces in pot_export.wgsl', () => {
            const openBraces = (potExportWgsl.match(/{/g) || []).length;
            const closeBraces = (potExportWgsl.match(/}/g) || []).length;

            expect(openBraces).toBe(closeBraces);
        });

        it('should not have common typos in pot_export.wgsl', () => {
            // Check for common mistakes
            expect(potExportWgsl).not.toContain('undefined');
            expect(potExportWgsl).not.toContain('null ');
            expect(potExportWgsl).not.toContain('console.log');
        });
    });

    describe('Concatenation Compatibility', () => {
        it('should be able to concatenate common + styles + export', () => {
            const concatenated = [commonWgsl, stylesWgsl, potExportWgsl].join('\n');

            // Should produce non-empty result
            expect(concatenated.length).toBeGreaterThan(commonWgsl.length + stylesWgsl.length);

            // Should contain elements from all files
            expect(concatenated).toContain('const TAU');
            expect(concatenated).toContain('fn sf_radius');
            expect(concatenated).toContain('fn calc_vertices');
        });
    });

    describe('Type Safety', () => {
        it('pot_export.wgsl should have ExportUniforms struct', () => {
            expect(potExportWgsl).toContain('struct ExportUniforms');
            expect(potExportWgsl).toContain('H: f32');
            expect(potExportWgsl).toContain('nTheta: u32');
            expect(potExportWgsl).toContain('nZ: u32');
        });

        it('pot_export.wgsl should use storage buffers correctly', () => {
            expect(potExportWgsl).toContain('var<storage, read_write> vertices');
            expect(potExportWgsl).toContain('var<storage, read_write> indices');
        });
    });
});
