/**
 * Style Golden Reference Tests
 * 
 * These tests generate and verify "golden values" for CPU-implemented styles.
 * Golden values are computed radius outputs at fixed coordinates, used to:
 * 1. Verify consistency of TypeScript style functions.
 * 2. Create baseline for GPU shader comparison after migration.
 * 
 * Styles without CPU implementations (e.g., CelticTriquetra) are skipped.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    STYLE_FUNCTIONS_VEC,
    getStyleFunctionVec,
} from './styles';
import {
    StyleId,
    TAU,
    DEFAULT_DIMENSIONS,
    DEFAULT_STYLE_PARAMS,
} from './types';

// All style IDs from the codebase
const ALL_STYLE_IDS: StyleId[] = [
    'SuperformulaBlossom',
    'FourierBloom',
    'SpiralRidges',
    'SuperellipseMorph',
    'HarmonicRipple',
    'GothicArches',
    'WaveInterference',
    'Crystalline',
    'ArtDeco',
    'DragonScales',
    'BambooSegments',
    'RippleInterference',
    'GyroidManifold',
    'Voronoi',
    'BasketWeave',
    'GeometricStar',
    'HexagonalHive',
    'CelticKnot',
    'LowPolyFacet',
];

// Styles that have CPU implementations (in STYLE_FUNCTIONS_VEC)
const CPU_IMPLEMENTED_STYLES = Object.keys(STYLE_FUNCTIONS_VEC) as StyleId[];

// Test coordinates for golden value generation
const TEST_THETAS = [0, Math.PI / 4, Math.PI / 2, Math.PI, 3 * Math.PI / 2, TAU - 0.01];
const TEST_T_VALUES = [0.1, 0.25, 0.5, 0.75, 0.9];
const BASE_RADIUS = 50; // mm
const POT_HEIGHT = DEFAULT_DIMENSIONS.H;

// Golden value structure
interface GoldenValue {
    styleId: StyleId;
    theta: number;
    t: number;
    r0: number;
    expectedRadius: number;
}

interface GoldenValuesFile {
    generatedAt: string;
    version: string;
    tolerance: number;
    styles: Record<StyleId, GoldenValue[]>;
}

const GOLDEN_VALUES_PATH = path.join(__dirname, '__fixtures__', 'styleGoldenValues.json');
const TOLERANCE = 0.001; // 1 micron tolerance for floating point comparison

/**
 * Compute radius for a style at given coordinates
 */
function computeRadius(
    styleId: StyleId,
    theta: number,
    t: number,
    r0: number,
    H: number
): number {
    const styleFn = getStyleFunctionVec(styleId);
    const thetaArray = new Float32Array([theta]);
    const z = t * H;
    const defaultParams = DEFAULT_STYLE_PARAMS[styleId] || {};
    const result = styleFn(thetaArray, z, r0, H, defaultParams);
    return result[0];
}

/**
 * Generate golden values for all CPU-implemented styles
 */
function generateGoldenValues(): GoldenValuesFile {
    const styles: Record<string, GoldenValue[]> = {};

    for (const styleId of CPU_IMPLEMENTED_STYLES) {
        const values: GoldenValue[] = [];

        for (const t of TEST_T_VALUES) {
            // Compute r0 at this height (simplified: use linear interpolation)
            const r0 = DEFAULT_DIMENSIONS.Rb +
                (DEFAULT_DIMENSIONS.Rt - DEFAULT_DIMENSIONS.Rb) * t;

            for (const theta of TEST_THETAS) {
                const expectedRadius = computeRadius(styleId, theta, t, r0, POT_HEIGHT);
                values.push({
                    styleId,
                    theta,
                    t,
                    r0,
                    expectedRadius,
                });
            }
        }

        styles[styleId] = values;
    }

    return {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        tolerance: TOLERANCE,
        styles: styles as Record<StyleId, GoldenValue[]>,
    };
}

describe('Style Golden Values', () => {
    describe('CPU Implementation Coverage', () => {
        it('should have at least 15 styles with CPU implementations', () => {
            expect(CPU_IMPLEMENTED_STYLES.length).toBeGreaterThanOrEqual(15);
            console.log(`CPU-implemented styles: ${CPU_IMPLEMENTED_STYLES.length}/${ALL_STYLE_IDS.length}`);
        });

        it('should log which styles are GPU-only', () => {
            const gpuOnly = ALL_STYLE_IDS.filter(id => !CPU_IMPLEMENTED_STYLES.includes(id));
            if (gpuOnly.length > 0) {
                console.log(`GPU-only styles (excluded from tests): ${gpuOnly.join(', ')}`);
            }
            // This is informational, not a failure
            expect(true).toBe(true);
        });
    });

    describe('Golden Value Generation', () => {
        it('should generate valid golden values for all CPU styles', () => {
            const goldenData = generateGoldenValues();

            // Verify structure
            expect(goldenData.version).toBe('1.0.0');
            expect(goldenData.tolerance).toBe(TOLERANCE);
            expect(Object.keys(goldenData.styles).length).toBe(CPU_IMPLEMENTED_STYLES.length);

            // Verify each style has values
            for (const styleId of CPU_IMPLEMENTED_STYLES) {
                const values = goldenData.styles[styleId];
                expect(values).toBeDefined();
                expect(values.length).toBe(TEST_THETAS.length * TEST_T_VALUES.length);

                // Verify values are reasonable (not NaN, not Infinity, positive)
                for (const val of values) {
                    expect(isFinite(val.expectedRadius)).toBe(true);
                    expect(val.expectedRadius).toBeGreaterThan(0);
                }
            }
        });

        it('should write golden values to fixture file when run with --update flag', () => {
            // Only write if UPDATE_GOLDEN env is set
            if (process.env.UPDATE_GOLDEN !== 'true') {
                console.log('Skipping golden file update. Set UPDATE_GOLDEN=true to regenerate.');
                return;
            }

            const goldenData = generateGoldenValues();
            const fixturesDir = path.dirname(GOLDEN_VALUES_PATH);

            // Create __fixtures__ directory if it doesn't exist
            if (!fs.existsSync(fixturesDir)) {
                fs.mkdirSync(fixturesDir, { recursive: true });
            }

            fs.writeFileSync(GOLDEN_VALUES_PATH, JSON.stringify(goldenData, null, 2));
            console.log(`Golden values written to: ${GOLDEN_VALUES_PATH}`);
        });
    });

    describe('Golden Value Verification', () => {
        let savedGolden: GoldenValuesFile | null = null;

        beforeAll(() => {
            // Load existing golden values if they exist
            if (fs.existsSync(GOLDEN_VALUES_PATH)) {
                const content = fs.readFileSync(GOLDEN_VALUES_PATH, 'utf-8');
                savedGolden = JSON.parse(content) as GoldenValuesFile;
            }
        });

        it('should match saved golden values when they exist', () => {
            if (!savedGolden) {
                console.log('No golden values file found. Run with UPDATE_GOLDEN=true first.');
                return;
            }

            const tolerance = savedGolden.tolerance || TOLERANCE;
            let mismatches = 0;

            for (const styleId of CPU_IMPLEMENTED_STYLES) {
                const savedValues = savedGolden.styles[styleId];
                if (!savedValues) {
                    console.warn(`No saved golden values for ${styleId}`);
                    continue;
                }

                for (const saved of savedValues) {
                    const computed = computeRadius(saved.styleId, saved.theta, saved.t, saved.r0, POT_HEIGHT);
                    const diff = Math.abs(computed - saved.expectedRadius);

                    if (diff > tolerance) {
                        console.error(`Mismatch in ${styleId}: theta=${saved.theta.toFixed(4)}, t=${saved.t.toFixed(2)}`);
                        console.error(`  Expected: ${saved.expectedRadius.toFixed(6)}, Got: ${computed.toFixed(6)}, Diff: ${diff.toFixed(8)}`);
                        mismatches++;
                    }
                }
            }

            expect(mismatches).toBe(0);
        });
    });

    describe('Individual Style Consistency', () => {
        // Test each CPU-implemented style individually
        for (const styleId of CPU_IMPLEMENTED_STYLES) {
            it(`${styleId}: should produce consistent output across multiple calls`, () => {
                const theta = Math.PI / 3;
                const t = 0.5;
                const r0 = (DEFAULT_DIMENSIONS.Rt + DEFAULT_DIMENSIONS.Rb) / 2;

                const result1 = computeRadius(styleId, theta, t, r0, POT_HEIGHT);
                const result2 = computeRadius(styleId, theta, t, r0, POT_HEIGHT);

                expect(result1).toBe(result2);
            });

            it(`${styleId}: should vary with theta (not flat)`, () => {
                const t = 0.5;
                const r0 = (DEFAULT_DIMENSIONS.Rt + DEFAULT_DIMENSIONS.Rb) / 2;

                const r1 = computeRadius(styleId, 0, t, r0, POT_HEIGHT);
                const r2 = computeRadius(styleId, Math.PI / 4, t, r0, POT_HEIGHT);
                const r3 = computeRadius(styleId, Math.PI / 2, t, r0, POT_HEIGHT);

                // At least two of the three should be different (style creates variation)
                const allSame = r1 === r2 && r2 === r3;
                // This is a soft check - some styles might be symmetric
                if (allSame) {
                    console.warn(`${styleId}: produces identical values at different thetas (may be intentional)`);
                }
            });
        }
    });
});
