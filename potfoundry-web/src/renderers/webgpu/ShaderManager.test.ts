
import { describe, it, expect, vi } from 'vitest';
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

            // Must verify twist_theta is called
            expect(wgsl).toContain('twist_theta(');

            // Must verify that projection uses the twisted theta
            expect(wgsl).toMatch(/let\s+theta_final\s*=\s*twist_theta\(/);
            expect(wgsl).toMatch(/cos\(theta_final\)/);
            expect(wgsl).toMatch(/sin\(theta_final\)/);
        });

        it('should center the Z height', () => {
            const wgsl = manager.getDebugLinesWGSL(0);
            // Verify (t - 0.5) * H logic
            expect(wgsl).toContain('let H = getf(0u)');
            expect(wgsl).toContain('(t - 0.5) * H');
        });
    });
});
