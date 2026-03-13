/**
 * Style Params Tests
 * Tests for style parameter packing utilities.
 */
import { describe, it, expect } from 'vitest';
import {
    buildStyleParamPayload,
    getStyleId,
    STYLE_ID_MAP,
    STYLE_PARAM_CAPACITY,
} from './styleParams';

describe('STYLE_ID_MAP', () => {
    it('should have SuperformulaBlossom mapped to 0', () => {
        expect(STYLE_ID_MAP.SuperformulaBlossom).toBe(0);
    });

    it('should have FourierBloom mapped to 1', () => {
        expect(STYLE_ID_MAP.FourierBloom).toBe(1);
    });

    it('should have GothicArches mapped to 5', () => {
        expect(STYLE_ID_MAP.GothicArches).toBe(5);
    });

    it('should have all style IDs be non-negative', () => {
        for (const [, id] of Object.entries(STYLE_ID_MAP)) {
            expect(id).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('getStyleId', () => {
    it('should return correct ID for SuperformulaBlossom', () => {
        expect(getStyleId('SuperformulaBlossom')).toBe(0);
    });

    it('should return correct ID for SpiralRidges', () => {
        expect(getStyleId('SpiralRidges')).toBe(2);
    });

    it('should return 0 for unknown style', () => {
        expect(getStyleId('UnknownStyle')).toBe(0);
    });

    it('should handle empty string', () => {
        expect(getStyleId('')).toBe(0);
    });
});

describe('buildStyleParamPayload', () => {
    it('should return styleId and params array', () => {
        const [styleId, params] = buildStyleParamPayload('SuperformulaBlossom', {});
        expect(styleId).toBe(0);
        expect(Array.isArray(params)).toBe(true);
    });

    it('should return array of STYLE_PARAM_CAPACITY length', () => {
        const [, params] = buildStyleParamPayload('FourierBloom', {});
        expect(params.length).toBe(STYLE_PARAM_CAPACITY);
    });

    it('should handle null opts', () => {
        const [styleId, params] = buildStyleParamPayload('SpiralRidges', null);
        expect(styleId).toBe(2);
        expect(params).toHaveLength(STYLE_PARAM_CAPACITY);
    });

    it('should handle undefined opts', () => {
        const [styleId, params] = buildStyleParamPayload('SuperellipseMorph', undefined);
        expect(styleId).toBe(3);
        expect(params).toHaveLength(STYLE_PARAM_CAPACITY);
    });

    it('should pack SuperformulaBlossom parameters', () => {
        const opts = {
            sf_strength: 0.5,
            sf_m_base: 6,
            sf_m_top: 10,
        };
        const [styleId, params] = buildStyleParamPayload('SuperformulaBlossom', opts);
        expect(styleId).toBe(0);
        expect(params[0]).toBe(0.5);
        expect(params[1]).toBe(6);
        expect(params[2]).toBe(10);
    });

    it('should pack GothicArches parameters', () => {
        const opts = {
            ga_counts: 12,
            ga_sharpness: 1.5,
        };
        const [styleId, params] = buildStyleParamPayload('GothicArches', opts);
        expect(styleId).toBe(5);
        expect(params.length).toBe(STYLE_PARAM_CAPACITY);
    });

    it('should set sentinel value at end of params', () => {
        const [styleId, params] = buildStyleParamPayload('SpiralRidges', {});
        // Sentinel = styleId + 1
        expect(params[STYLE_PARAM_CAPACITY - 1]).toBe(styleId + 1);
    });

    it('should pack WaveInterference parameters', () => {
        const [styleId, params] = buildStyleParamPayload('WaveInterference', { wi_feature_count: 5 });
        expect(styleId).toBe(6);
        expect(params[0]).toBe(5);
    });

    it('should pack Crystalline parameters', () => {
        const [styleId, params] = buildStyleParamPayload('Crystalline', { cr_facet_count: 8 });
        expect(styleId).toBe(7);
        expect(params[0]).toBe(8);
    });

    it('should pack ArtDeco parameters', () => {
        const [styleId, params] = buildStyleParamPayload('ArtDeco', { ad_fan_count: 10 });
        expect(styleId).toBe(8);
        expect(params[0]).toBe(10);
    });

    it('should pack DragonScales parameters', () => {
        const [styleId, params] = buildStyleParamPayload('DragonScales', { ds_scale_rows: 12 });
        expect(styleId).toBe(9);
        expect(params[0]).toBe(12);
    });

    it('should pack HarmonicRipple parameters', () => {
        const [styleId, params] = buildStyleParamPayload('HarmonicRipple', { hr_petals: 9 });
        expect(styleId).toBe(4);
        expect(params[0]).toBe(9);
    });

    it('should pack BambooSegments parameters', () => {
        const [styleId, params] = buildStyleParamPayload('BambooSegments', { bs_node_count: 4 });
        expect(styleId).toBe(10);
        expect(params[0]).toBe(4);
    });
});

describe('STYLE_PARAM_CAPACITY', () => {
    it('should be 48', () => {
        expect(STYLE_PARAM_CAPACITY).toBe(48);
    });

    it('should be a multiple of 4 (for WGSL alignment)', () => {
        expect(STYLE_PARAM_CAPACITY % 4).toBe(0);
    });
});
