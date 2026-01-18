/**
 * Mesh Slice Tests
 * Tests for mesh quality state and QUALITY_PRESETS.
 */
import { describe, it, expect } from 'vitest';
import { QUALITY_PRESETS } from './mesh';

describe('QUALITY_PRESETS', () => {
    it('should have draft preset', () => {
        expect(QUALITY_PRESETS.draft).toBeDefined();
        expect(QUALITY_PRESETS.draft.preview_n_theta).toBe(256);
        expect(QUALITY_PRESETS.draft.preview_n_z).toBe(128);
    });

    it('should have standard preset', () => {
        expect(QUALITY_PRESETS.standard).toBeDefined();
        expect(QUALITY_PRESETS.standard.preview_n_theta).toBe(512);
        expect(QUALITY_PRESETS.standard.preview_n_z).toBe(256);
    });

    it('should have high preset', () => {
        expect(QUALITY_PRESETS.high).toBeDefined();
        expect(QUALITY_PRESETS.high.preview_n_theta).toBe(1024);
        expect(QUALITY_PRESETS.high.preview_n_z).toBe(512);
    });

    it('should have ultra preset', () => {
        expect(QUALITY_PRESETS.ultra).toBeDefined();
        expect(QUALITY_PRESETS.ultra.preview_n_theta).toBe(2048);
        expect(QUALITY_PRESETS.ultra.preview_n_z).toBe(1024);
    });

    it('should have 4 presets', () => {
        expect(Object.keys(QUALITY_PRESETS).length).toBe(4);
    });

    it('should have increasing preview_n_theta from draft to ultra', () => {
        expect(QUALITY_PRESETS.draft.preview_n_theta).toBeLessThan(QUALITY_PRESETS.standard.preview_n_theta);
        expect(QUALITY_PRESETS.standard.preview_n_theta).toBeLessThan(QUALITY_PRESETS.high.preview_n_theta);
        expect(QUALITY_PRESETS.high.preview_n_theta).toBeLessThanOrEqual(QUALITY_PRESETS.ultra.preview_n_theta);
    });

    it('should have export resolution >= preview resolution', () => {
        for (const preset of Object.values(QUALITY_PRESETS)) {
            expect(preset.export_n_theta).toBeGreaterThanOrEqual(preset.preview_n_theta);
            expect(preset.export_n_z).toBeGreaterThanOrEqual(preset.preview_n_z);
        }
    });
});
