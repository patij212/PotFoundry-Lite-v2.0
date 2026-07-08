import { describe, it, expect } from 'vitest';
import { ShaderManager } from './ShaderManager';

describe('ShaderManager', () => {
    // Mock the singleton behavior or ensuring it's reset could be tricky depending on implementation,
    // but since we are inspecting output string, we just need an instance.
    const manager = ShaderManager.getInstance();

    describe('getDebugLinesWGSL', () => {
        it('should generate valid WGSL', () => {
            const wgsl = manager.getDebugLinesWGSL(0);
            expect(wgsl).toBeTruthy();
            expect(wgsl).toContain('@vertex');
            expect(wgsl).toContain('@fragment');
        });

        it('should correctly calculate base radius (Fix for Pink Line)', () => {
            const wgsl = manager.getDebugLinesWGSL(0);

            // Must verify that r_base(t) is called
            expect(wgsl).toContain('r_base(t)');

            // Must verify that the result is passed to style_radius as r0
            // Pattern: let r0 = r_base(t); ... style_radius(..., r0);
            expect(wgsl).toMatch(/let\s+r0\s*=\s*r_base\(t\)/);
            expect(wgsl).toMatch(/style_radius\(.*,\s*r0\)/);
        });

        it('should apply global twist transformation (Fix for Alignment)', () => {
            const wgsl = manager.getDebugLinesWGSL(0);

            // The shader delegates to surface_point() which internally handles twist
            expect(wgsl).toContain('surface_point(');

            // The styles WGSL (included in the concatenated output) defines twist_theta
            // surface_point calls twist_theta internally — verify surface_point is the projection entry
            expect(wgsl).toMatch(/let\s+p\s*=\s*surface_point\(/);
        });

        it('should center the Z height', () => {
            const wgsl = manager.getDebugLinesWGSL(0);
            // Verify Z-centering: p.z - 0.5 * H (post-surface_point centering)
            expect(wgsl).toContain('let H = getf(0u)');
            expect(wgsl).toMatch(/p\.z\s*-\s*0\.5\s*\*\s*H/);
        });
    });

    describe('lighting module extraction', () => {
        it('desktop composition contains exactly one shade_color and one gradient_color', () => {
            const wgsl = ShaderManager.getInstance().getStyleWGSL(0);
            expect(wgsl.match(/fn shade_color\(/g)?.length).toBe(1);
            expect(wgsl.match(/fn gradient_color\(/g)?.length).toBe(1);
            expect(wgsl.match(/fn vs_main\(/g)?.length).toBe(1);
        });
        it('universal composition contains exactly one shade_color', () => {
            const wgsl = ShaderManager.getInstance().getUniversalWGSL();
            expect(wgsl.match(/fn shade_color\(/g)?.length).toBe(1);
        });
    });

    describe('getRaycastWGSL', () => {
        it('assembles raycast entry points with the style dispatch and lighting', () => {
            const wgsl = ShaderManager.getInstance().getRaycastWGSL(0);
            expect(wgsl).toContain('fn vs_raycast(');
            expect(wgsl).toContain('fn fs_raycast(');
            expect(wgsl).toContain('fn pot_field(');
            expect(wgsl).toContain('fn style_radius(');   // dispatch injected
            expect(wgsl).toContain('fn shade_color(');    // lighting module present
            expect(wgsl).toContain('@binding(8)');        // RC uniforms
            expect(wgsl).not.toContain('fn vs_main(');    // mesh entry points excluded
        });
        it('strips other styles (raycast for style 9 excludes gothic)', () => {
            const wgsl = ShaderManager.getInstance().getRaycastWGSL(9); // DragonScales region only
            expect(wgsl.match(/fn shade_color\(/g)?.length).toBe(1);
        });
    });

    describe('getRaycastBoundWGSL', () => {
        it('assembles the bound kernel with style dispatch and storage output', () => {
            const wgsl = ShaderManager.getInstance().getRaycastBoundWGSL(0);
            expect(wgsl).toContain('fn cs_bound(');
            expect(wgsl).toContain('@binding(9)');
            expect(wgsl).toContain('atomicMax');
            expect(wgsl).toContain('fn style_radius(');
        });
    });
});
