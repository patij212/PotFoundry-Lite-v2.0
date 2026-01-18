/**
 * Style Schema Tests
 * Tests for style definitions, schema validation, and default values.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_SCHEMAS, getDefaultStyleOpts } from './style';

// Derive style names from STYLE_SCHEMAS keys
const STYLE_NAMES = Object.keys(STYLE_SCHEMAS);

describe('Style Names', () => {
    it('should have all expected styles', () => {
        const expectedStyles = [
            'SuperformulaBlossom',
            'FourierBloom',
            'SpiralRidges',
            'SuperellipseMorph',
            'GothicArches',
            'HarmonicRipple',
        ];
        for (const style of expectedStyles) {
            expect(STYLE_NAMES).toContain(style);
        }
    });

    it('should have at least 6 styles', () => {
        expect(STYLE_NAMES.length).toBeGreaterThanOrEqual(6);
    });
});

describe('Style Schemas', () => {
    it('should have schemas for all style names', () => {
        for (const styleName of STYLE_NAMES) {
            expect(STYLE_SCHEMAS).toHaveProperty(styleName);
        }
    });

    it('should have name property for each schema', () => {
        for (const [, schema] of Object.entries(STYLE_SCHEMAS)) {
            expect(schema).toHaveProperty('name');
            expect(typeof schema.name).toBe('string');
        }
    });

    it('should have description for each schema', () => {
        for (const [, schema] of Object.entries(STYLE_SCHEMAS)) {
            expect(schema).toHaveProperty('description');
            expect(typeof schema.description).toBe('string');
        }
    });

    it('should have params object for each schema', () => {
        for (const [, schema] of Object.entries(STYLE_SCHEMAS)) {
            expect(schema).toHaveProperty('params');
            expect(typeof schema.params).toBe('object');
        }
    });
});

describe('Style Parameter Definitions', () => {
    describe('SuperformulaBlossom', () => {
        it('should have sf_strength parameter', () => {
            expect(STYLE_SCHEMAS.SuperformulaBlossom.params).toHaveProperty('sf_strength');
        });

        it('should have valid bounds for sf_strength', () => {
            const param = STYLE_SCHEMAS.SuperformulaBlossom.params.sf_strength;
            expect(param.min).toBeDefined();
            expect(param.max).toBeDefined();
            expect(param.min).toBeLessThan(param.max!);
        });

        it('should have default value within bounds', () => {
            const param = STYLE_SCHEMAS.SuperformulaBlossom.params.sf_strength;
            expect(param.default).toBeGreaterThanOrEqual(param.min!);
            expect(param.default).toBeLessThanOrEqual(param.max!);
        });
    });

    describe('SpiralRidges', () => {
        it('should have spiral_k parameter', () => {
            expect(STYLE_SCHEMAS.SpiralRidges.params).toHaveProperty('spiral_k');
        });

        it('should have valid integer bounds for spiral_k', () => {
            const param = STYLE_SCHEMAS.SpiralRidges.params.spiral_k;
            expect(param.type).toBe('int');
            expect(param.min).toBeGreaterThanOrEqual(1);
        });
    });

    describe('GothicArches', () => {
        it('should have arch parameters', () => {
            expect(STYLE_SCHEMAS.GothicArches.params).toHaveProperty('gaCounts');
        });
    });
});

describe('getDefaultStyleOpts', () => {
    it('should return default options for SuperformulaBlossom', () => {
        const opts = getDefaultStyleOpts('SuperformulaBlossom');
        expect(opts).toBeDefined();
        expect(typeof opts).toBe('object');
    });

    it('should include basic params with defaults', () => {
        const opts = getDefaultStyleOpts('SuperformulaBlossom');
        const schema = STYLE_SCHEMAS.SuperformulaBlossom;

        for (const [paramName, paramDef] of Object.entries(schema.params)) {
            if (paramDef.default !== undefined) {
                expect(opts).toHaveProperty(paramName);
            }
        }
    });

    it('should return valid opts for all styles', () => {
        for (const styleName of STYLE_NAMES) {
            const opts = getDefaultStyleOpts(styleName as any);
            expect(opts).toBeDefined();
            expect(typeof opts).toBe('object');
        }
    });
});

describe('Parameter Type Validation', () => {
    it('should have valid types for all parameters', () => {
        const validTypes = ['float', 'int', 'bool'];

        for (const [, schema] of Object.entries(STYLE_SCHEMAS)) {
            for (const [, param] of Object.entries(schema.params)) {
                expect(validTypes).toContain((param as any).type);
            }
            if (schema.advancedParams) {
                for (const [, param] of Object.entries(schema.advancedParams)) {
                    expect(validTypes).toContain((param as any).type);
                }
            }
        }
    });

    it('should have step values for float params', () => {
        for (const [, schema] of Object.entries(STYLE_SCHEMAS)) {
            for (const [, param] of Object.entries(schema.params)) {
                if ((param as any).type === 'float') {
                    expect((param as any).step).toBeDefined();
                    expect((param as any).step).toBeGreaterThan(0);
                }
            }
        }
    });
});
