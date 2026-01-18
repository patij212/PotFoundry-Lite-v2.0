/**
 * State Types Tests
 * Tests for the state type definitions and default values.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_GEOMETRY,
    GEOMETRY_BOUNDS,
    DEFAULT_STYLE,
    DEFAULT_MESH_QUALITY,
    MESH_QUALITY_BOUNDS,
    DEFAULT_APPEARANCE,
    DEFAULT_UI_STATE,
    DEFAULT_PERFORMANCE,
    DEFAULT_EXPORT_STATE,
} from './types';

describe('DEFAULT_GEOMETRY', () => {
    it('should have reasonable height', () => {
        expect(DEFAULT_GEOMETRY.H).toBeGreaterThan(0);
        expect(DEFAULT_GEOMETRY.H).toBe(120);
    });

    it('should have positive diameters', () => {
        expect(DEFAULT_GEOMETRY.top_od).toBeGreaterThan(0);
        expect(DEFAULT_GEOMETRY.bottom_od).toBeGreaterThan(0);
    });

    it('should have top_od >= bottom_od for standard pot', () => {
        expect(DEFAULT_GEOMETRY.top_od).toBeGreaterThanOrEqual(DEFAULT_GEOMETRY.bottom_od);
    });

    it('should have positive wall thickness', () => {
        expect(DEFAULT_GEOMETRY.t_wall).toBeGreaterThan(0);
    });

    it('should have all required properties', () => {
        expect(DEFAULT_GEOMETRY).toHaveProperty('H');
        expect(DEFAULT_GEOMETRY).toHaveProperty('top_od');
        expect(DEFAULT_GEOMETRY).toHaveProperty('bottom_od');
        expect(DEFAULT_GEOMETRY).toHaveProperty('t_wall');
        expect(DEFAULT_GEOMETRY).toHaveProperty('t_bottom');
        expect(DEFAULT_GEOMETRY).toHaveProperty('r_drain');
        expect(DEFAULT_GEOMETRY).toHaveProperty('expn');
    });
});

describe('GEOMETRY_BOUNDS', () => {
    it('should have bounds for H', () => {
        expect(GEOMETRY_BOUNDS.H.min).toBeLessThan(GEOMETRY_BOUNDS.H.max);
    });

    it('should have valid step values', () => {
        for (const bound of Object.values(GEOMETRY_BOUNDS)) {
            expect(bound.step).toBeGreaterThan(0);
        }
    });

    it('should include default values within bounds', () => {
        expect(DEFAULT_GEOMETRY.H).toBeGreaterThanOrEqual(GEOMETRY_BOUNDS.H.min);
        expect(DEFAULT_GEOMETRY.H).toBeLessThanOrEqual(GEOMETRY_BOUNDS.H.max);
    });
});

describe('DEFAULT_STYLE', () => {
    it('should have a name', () => {
        expect(DEFAULT_STYLE.name).toBeDefined();
        expect(typeof DEFAULT_STYLE.name).toBe('string');
    });

    it('should have opts object', () => {
        expect(DEFAULT_STYLE.opts).toBeDefined();
        expect(typeof DEFAULT_STYLE.opts).toBe('object');
    });
});

describe('DEFAULT_MESH_QUALITY', () => {
    it('should have preview resolution', () => {
        expect(DEFAULT_MESH_QUALITY.preview_n_theta).toBeGreaterThan(0);
        expect(DEFAULT_MESH_QUALITY.preview_n_z).toBeGreaterThan(0);
    });

    it('should have export resolution >= preview', () => {
        expect(DEFAULT_MESH_QUALITY.export_n_theta).toBeGreaterThanOrEqual(DEFAULT_MESH_QUALITY.preview_n_theta);
        expect(DEFAULT_MESH_QUALITY.export_n_z).toBeGreaterThanOrEqual(DEFAULT_MESH_QUALITY.preview_n_z);
    });

    it('should have seam angle', () => {
        expect(DEFAULT_MESH_QUALITY.seamAngle).toBeDefined();
    });
});

describe('MESH_QUALITY_BOUNDS', () => {
    it('should have valid bounds', () => {
        expect(MESH_QUALITY_BOUNDS.preview_n_theta.min).toBeLessThan(MESH_QUALITY_BOUNDS.preview_n_theta.max);
    });
});

describe('DEFAULT_APPEARANCE', () => {
    it('should have color scheme', () => {
        expect(DEFAULT_APPEARANCE.colorScheme).toBeDefined();
    });

    it('should have hex colors', () => {
        expect(DEFAULT_APPEARANCE.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(DEFAULT_APPEARANCE.secondaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('should have lighting preset', () => {
        expect(DEFAULT_APPEARANCE.lightingPreset).toBeDefined();
    });

    it('should have gradient array', () => {
        expect(Array.isArray(DEFAULT_APPEARANCE.gradient)).toBe(true);
        expect(DEFAULT_APPEARANCE.gradient.length).toBe(2);
    });
});

describe('DEFAULT_UI_STATE', () => {
    it('should have panelOpen boolean', () => {
        expect(typeof DEFAULT_UI_STATE.panelOpen).toBe('boolean');
    });

    it('should have valid activeTab', () => {
        expect(['controls', 'presets', 'export', 'metrics']).toContain(DEFAULT_UI_STATE.activeTab);
    });

    it('should have modalOpen as null by default', () => {
        expect(DEFAULT_UI_STATE.modalOpen).toBeNull();
    });
});

describe('DEFAULT_PERFORMANCE', () => {
    it('should start with zero values', () => {
        expect(DEFAULT_PERFORMANCE.generationTime).toBe(0);
        expect(DEFAULT_PERFORMANCE.renderTime).toBe(0);
        expect(DEFAULT_PERFORMANCE.triangleCount).toBe(0);
        expect(DEFAULT_PERFORMANCE.vertexCount).toBe(0);
    });

    it('should not be generating by default', () => {
        expect(DEFAULT_PERFORMANCE.isGenerating).toBe(false);
    });
});

describe('DEFAULT_EXPORT_STATE', () => {
    it('should have empty queue', () => {
        expect(DEFAULT_EXPORT_STATE.queue).toEqual([]);
    });

    it('should have no current job', () => {
        expect(DEFAULT_EXPORT_STATE.current).toBeNull();
    });

    it('should have empty history', () => {
        expect(DEFAULT_EXPORT_STATE.history).toEqual([]);
    });
});
