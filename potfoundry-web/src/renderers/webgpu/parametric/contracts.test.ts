/**
 * contracts.test.ts — Tests for pipeline stage contracts.
 *
 * Verifies:
 * 1. Feature flag resolution, validation, and defaults
 * 2. Stage registry type-guard
 * 3. Contract composition: stages can be plugged in with mock implementations
 * 4. Immutability of default feature flags
 * 5. Interface compatibility: mock stages satisfy the contract types
 *
 * @module contracts.test
 */

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_FEATURE_FLAGS,
    resolveFeatureFlags,
    validateFeatureFlags,
    isValidStageRegistry,
    type PipelineFeatureFlags,
    type FeatureConstraintStage,
    type TessellationStage,
    type RefinementStage,
    type ValidationStage,
    type StageRegistry,
    type StageMeshData,
    type StageMetrics,
    type FeatureConstraintInput,
    type FeatureConstraintOutput,
    type TessellationInput,
    type TessellationOutput,
    type RefinementInput,
    type RefinementOutput,
    type ValidationInput,
    type ValidationOutput,
    type PipelineConfig,
    type PipelineResult,
    type FeatureChainRef,
} from './contracts';

// ---------------------------------------------------------------------------
// Helper: make a minimal StageMeshData (6 verts → 2 triangles)
// ---------------------------------------------------------------------------
function makeMiniMesh(): StageMeshData {
    const positions = new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const uvs = new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
    return { positions, uvs, indices, outerIdxCount: 6, vertexCount: 6 };
}

function makeMetrics(name: string): StageMetrics {
    return { stageName: name, timeMs: 5.0 };
}

// ---------------------------------------------------------------------------
// Mock stage implementations (satisfy the interface contracts)
// ---------------------------------------------------------------------------

const mockFeatureConstraint: FeatureConstraintStage = {
    name: 'MockFeatureConstraint',
    async execute(input: FeatureConstraintInput): Promise<FeatureConstraintOutput> {
        return {
            featureIndices: [0, 10, 20],
            featureCount: 3,
            chains: [
                { id: 0, pointCount: 5, kind: 'peak' },
                { id: 1, pointCount: 3, kind: 'valley' },
            ],
            metrics: makeMetrics('MockFeatureConstraint'),
        };
    },
};

const mockTessellation: TessellationStage = {
    name: 'MockTessellation',
    async execute(input: TessellationInput): Promise<TessellationOutput> {
        const mesh = makeMiniMesh();
        return {
            mesh,
            gridU: 32,
            gridT: 16,
            triangleCount: 2,
            metrics: makeMetrics('MockTessellation'),
        };
    },
};

const mockRefinement: RefinementStage = {
    name: 'MockRefinement',
    async execute(input: RefinementInput): Promise<RefinementOutput> {
        return {
            mesh: input.mesh,
            tolerancesPassed: true,
            iterationsPerformed: 2,
            stopReason: 'tolerances_passed',
            maxPosErrorMm: 0.01,
            maxNormalErrorDeg: 0.5,
            metrics: makeMetrics('MockRefinement'),
        };
    },
};

const mockValidation: ValidationStage = {
    name: 'MockValidation',
    async execute(input: ValidationInput): Promise<ValidationOutput> {
        return {
            valid: true,
            manifoldOk: true,
            degeneratesOk: true,
            normalsOk: true,
            triangleQualityOk: true,
            fidelityOk: true,
            distortionOk: true,
            warnings: [],
            metrics: makeMetrics('MockValidation'),
        };
    },
};

// ============================================================================
// Tests
// ============================================================================

describe('contracts', () => {
    // -----------------------------------------------------------------------
    // Feature Flag Resolution
    // -----------------------------------------------------------------------
    describe('resolveFeatureFlags', () => {
        it('returns defaults when called with undefined', () => {
            const flags = resolveFeatureFlags(undefined);
            expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
        });

        it('returns defaults when called with empty object', () => {
            const flags = resolveFeatureFlags({});
            expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
        });

        it('merges overrides while keeping other defaults', () => {
            const flags = resolveFeatureFlags({ metricAwareRefinement: true });
            expect(flags.metricAwareRefinement).toBe(true);
            expect(flags.distortionGating).toBe(false);
            expect(flags.gpuFidelityCheck).toBe(false);
            expect(flags.seamHealing).toBe(true);
            expect(flags.outerWallCorridorPlanning).toBe(false);
            expect(flags.outerWallCorridorDiagnostics).toBe(false);
            expect(flags.mdcIsosurface).toBe(false);
        });

        it('handles multiple overrides at once', () => {
            const flags = resolveFeatureFlags({
                distortionGating: true,
                seamHealing: true,
                outerWallCorridorPlanning: true,
            });
            expect(flags.distortionGating).toBe(true);
            expect(flags.seamHealing).toBe(true);
            expect(flags.outerWallCorridorPlanning).toBe(true);
            expect(flags.metricAwareRefinement).toBe(false);
        });

        it('returns frozen object', () => {
            const flags = resolveFeatureFlags({ metricAwareRefinement: true });
            expect(Object.isFrozen(flags)).toBe(true);
        });

        it('surfaceFidelityExact defaults OFF and the override branch is honored', () => {
            expect(DEFAULT_FEATURE_FLAGS.surfaceFidelityExact).toBe(false);
            expect(resolveFeatureFlags(undefined).surfaceFidelityExact).toBe(false);
            expect(resolveFeatureFlags({}).surfaceFidelityExact).toBe(false);
            expect(resolveFeatureFlags({ surfaceFidelityExact: true }).surfaceFidelityExact).toBe(true);
            // override-spread must keep it set alongside other overrides
            expect(resolveFeatureFlags({ conformingMesher: true, surfaceFidelityExact: true }).surfaceFidelityExact).toBe(true);
        });

        // 2026-06-11 cutover: the conforming mesher is the production default
        // (dominance checkpoint — see the conformingMesher doc in contracts.ts).
        it('defaults conformingMesher ON (2026-06-11 dominance checkpoint)', () => {
            expect(resolveFeatureFlags(undefined).conformingMesher).toBe(true);
            expect(resolveFeatureFlags({}).conformingMesher).toBe(true);
        });

        it('keeps the conforming default when overrides omit the key', () => {
            // Regression guard: a partial-overrides caller must inherit the
            // default-on value, not have the omitted key coerced to false.
            const flags = resolveFeatureFlags({ metricAwareRefinement: true });
            expect(flags.conformingMesher).toBe(true);
        });

        it('explicit conformingMesher:false selects the legacy battery (reversibility)', () => {
            const flags = resolveFeatureFlags({ conformingMesher: false });
            expect(flags.conformingMesher).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Feature Flag Validation
    // -----------------------------------------------------------------------
    describe('validateFeatureFlags', () => {
        it('accepts all-false flags without error', () => {
            expect(() => validateFeatureFlags(DEFAULT_FEATURE_FLAGS)).not.toThrow();
        });

        it('accepts valid flag combinations', () => {
            const flags = resolveFeatureFlags({
                metricAwareRefinement: true,
                distortionGating: true,
                gpuFidelityCheck: true,
            });
            expect(() => validateFeatureFlags(flags)).not.toThrow();
        });

        it('rejects mdcIsosurface (reserved)', () => {
            const flags = resolveFeatureFlags({ mdcIsosurface: true });
            expect(() => validateFeatureFlags(flags)).toThrow(/mdcIsosurface.*reserved/);
        });

        it('allows gpuFidelityCheck without distortionGating', () => {
            const flags = resolveFeatureFlags({
                gpuFidelityCheck: true,
                distortionGating: false,
            });
            expect(() => validateFeatureFlags(flags)).not.toThrow();
        });

        it('rejects corridor diagnostics without corridor planning', () => {
            const flags = resolveFeatureFlags({ outerWallCorridorDiagnostics: true });
            expect(() => validateFeatureFlags(flags)).toThrow(/outerWallCorridorDiagnostics requires outerWallCorridorPlanning/);
        });
    });

    // -----------------------------------------------------------------------
    // DEFAULT_FEATURE_FLAGS immutability
    // -----------------------------------------------------------------------
    describe('DEFAULT_FEATURE_FLAGS', () => {
        it('is frozen', () => {
            expect(Object.isFrozen(DEFAULT_FEATURE_FLAGS)).toBe(true);
        });

        it('pins the production defaults (experimental flags off, conforming mesher on)', () => {
            expect(DEFAULT_FEATURE_FLAGS.metricAwareRefinement).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.distortionGating).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.gpuFidelityCheck).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.seamHealing).toBe(true);
            expect(DEFAULT_FEATURE_FLAGS.outerWallCorridorPlanning).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.outerWallCorridorDiagnostics).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.mdcIsosurface).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.byConstructionAssembly).toBe(false);
            // Production default since the 2026-06-11 dominance checkpoint.
            expect(DEFAULT_FEATURE_FLAGS.conformingMesher).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Stage Registry Type Guard
    // -----------------------------------------------------------------------
    describe('isValidStageRegistry', () => {
        it('returns true for a valid registry', () => {
            const registry: StageRegistry = {
                featureConstraint: mockFeatureConstraint,
                tessellation: mockTessellation,
                refinement: mockRefinement,
                validation: mockValidation,
            };
            expect(isValidStageRegistry(registry)).toBe(true);
        });

        it('returns false for null', () => {
            expect(isValidStageRegistry(null)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(isValidStageRegistry(undefined)).toBe(false);
        });

        it('returns false for a non-object', () => {
            expect(isValidStageRegistry(42)).toBe(false);
        });

        it('returns false for empty object', () => {
            expect(isValidStageRegistry({})).toBe(false);
        });

        it('returns false when a stage is missing execute', () => {
            const bad = {
                featureConstraint: { name: 'A' }, // missing execute
                tessellation: mockTessellation,
                refinement: mockRefinement,
                validation: mockValidation,
            };
            expect(isValidStageRegistry(bad)).toBe(false);
        });

        it('returns false when a stage name is not a string', () => {
            const bad = {
                featureConstraint: { name: 123, execute: () => { } },
                tessellation: mockTessellation,
                refinement: mockRefinement,
                validation: mockValidation,
            };
            expect(isValidStageRegistry(bad)).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Mock Stage Execution (contract satisfaction)
    // -----------------------------------------------------------------------
    describe('FeatureConstraintStage contract', () => {
        it('produces expected output shape', async () => {
            const input: FeatureConstraintInput = {
                positions3D: new Float32Array(30),
                numSamples: 10,
                profileName: 'high',
            };
            const output = await mockFeatureConstraint.execute(input);

            expect(output.featureCount).toBe(3);
            expect(output.featureIndices).toHaveLength(3);
            expect(output.chains).toHaveLength(2);
            expect(output.chains![0].kind).toBe('peak');
            expect(output.metrics.stageName).toBe('MockFeatureConstraint');
        });
    });

    describe('TessellationStage contract', () => {
        it('produces mesh and grid dimensions', async () => {
            const input: TessellationInput = {
                triangleBudget: 1000,
                budgetFraction: 0.8,
                aspectRatio: 2.0,
                chains: [],
                rowMapping: [0, 1, 2],
                tPositions: new Float32Array([0, 0.5, 1]),
                unionU: new Float32Array([0, 0.5, 1]),
            };
            const output = await mockTessellation.execute(input);

            expect(output.mesh.positions).toBeInstanceOf(Float32Array);
            expect(output.mesh.vertexCount).toBe(6);
            expect(output.gridU).toBe(32);
            expect(output.gridT).toBe(16);
            expect(output.triangleCount).toBe(2);
        });
    });

    describe('RefinementStage contract', () => {
        it('returns refined mesh with stop reason', async () => {
            const input: RefinementInput = {
                mesh: makeMiniMesh(),
                tolerances: { epsPosMm: 0.05, epsNormalDeg: 5.0, epsFeatureMm: 0.04, minTriangleAngleDeg: 20, maxAspectRatio: 8.0 },
                profileName: 'high',
                maxTriangles: 10000,
                evaluate: null,
            };
            const output = await mockRefinement.execute(input);

            expect(output.tolerancesPassed).toBe(true);
            expect(output.stopReason).toBe('tolerances_passed');
            expect(output.iterationsPerformed).toBe(2);
            expect(output.maxPosErrorMm).toBeLessThan(1.0);
        });

        it('all stop reasons are valid string literals', () => {
            const validReasons: RefinementOutput['stopReason'][] = [
                'tolerances_passed',
                'max_iterations',
                'budget_exhausted',
                'no_improvement',
                'zero_iterations',
                'diminishing_returns',
            ];
            expect(validReasons).toHaveLength(6);
        });
    });

    describe('ValidationStage contract', () => {
        it('returns comprehensive check results', async () => {
            const input: ValidationInput = {
                mesh: makeMiniMesh(),
                tolerances: { epsPosMm: 0.05, epsNormalDeg: 5.0, epsFeatureMm: 0.04, minTriangleAngleDeg: 20, maxAspectRatio: 8.0 },
                profileName: 'ultra',
            };
            const output = await mockValidation.execute(input);

            expect(output.valid).toBe(true);
            expect(output.manifoldOk).toBe(true);
            expect(output.degeneratesOk).toBe(true);
            expect(output.normalsOk).toBe(true);
            expect(output.fidelityOk).toBe(true);
            expect(output.distortionOk).toBe(true);
            expect(output.warnings).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    // Stage Composition / Pipeline Assembly
    // -----------------------------------------------------------------------
    describe('Pipeline composition', () => {
        it('stages compose into a linear pipeline', async () => {
            // Simulates orchestrator logic: feature → tessellate → refine → validate
            const registry: StageRegistry = {
                featureConstraint: mockFeatureConstraint,
                tessellation: mockTessellation,
                refinement: mockRefinement,
                validation: mockValidation,
            };

            // Stage 1: Feature Constraint
            const fcOut = await registry.featureConstraint.execute({
                positions3D: new Float32Array(30),
                numSamples: 10,
                profileName: 'high',
            });
            expect(fcOut.featureCount).toBeGreaterThan(0);

            // Stage 2: Tessellation (uses feature output)
            const tessOut = await registry.tessellation.execute({
                triangleBudget: 2000,
                budgetFraction: 0.8,
                aspectRatio: 2.0,
                chains: fcOut.chains ?? [],
                rowMapping: [0, 1, 2],
                tPositions: new Float32Array([0, 0.5, 1]),
                unionU: new Float32Array([0, 0.5, 1]),
            });
            expect(tessOut.mesh.vertexCount).toBeGreaterThan(0);

            // Stage 3: Refinement
            const refOut = await registry.refinement.execute({
                mesh: tessOut.mesh,
                tolerances: { epsPosMm: 0.05, epsNormalDeg: 5.0, epsFeatureMm: 0.04, minTriangleAngleDeg: 20, maxAspectRatio: 8.0 },
                profileName: 'high',
                maxTriangles: 50000,
                evaluate: null,
            });
            expect(refOut.tolerancesPassed).toBe(true);

            // Stage 4: Validation
            const valOut = await registry.validation.execute({
                mesh: refOut.mesh,
                tolerances: { epsPosMm: 0.05, epsNormalDeg: 5.0, epsFeatureMm: 0.04, minTriangleAngleDeg: 20, maxAspectRatio: 8.0 },
                profileName: 'high',
            });
            expect(valOut.valid).toBe(true);

            // Aggregate metrics
            const allMetrics = [fcOut.metrics, tessOut.metrics, refOut.metrics, valOut.metrics];
            expect(allMetrics).toHaveLength(4);
            expect(allMetrics.every(m => m.timeMs >= 0)).toBe(true);
        });

        it('replacing a stage preserves type-level compatibility', async () => {
            // Alternative refinement that always fails
            const failRefine: RefinementStage = {
                name: 'AlwaysFailRefinement',
                async execute(input: RefinementInput): Promise<RefinementOutput> {
                    return {
                        mesh: input.mesh,
                        tolerancesPassed: false,
                        iterationsPerformed: 0,
                        stopReason: 'no_improvement',
                        maxPosErrorMm: 99.9,
                        maxNormalErrorDeg: 45.0,
                        metrics: makeMetrics('AlwaysFailRefinement'),
                    };
                },
            };

            const registry: StageRegistry = {
                featureConstraint: mockFeatureConstraint,
                tessellation: mockTessellation,
                refinement: failRefine,  // SWAPPED
                validation: mockValidation,
            };

            expect(isValidStageRegistry(registry)).toBe(true);

            const refOut = await registry.refinement.execute({
                mesh: makeMiniMesh(),
                tolerances: { epsPosMm: 0.05, epsNormalDeg: 5.0, epsFeatureMm: 0.04, minTriangleAngleDeg: 20, maxAspectRatio: 8.0 },
                profileName: 'high',
                maxTriangles: 50000,
                evaluate: null,
            });
            expect(refOut.tolerancesPassed).toBe(false);
            expect(refOut.stopReason).toBe('no_improvement');
        });
    });

    // -----------------------------------------------------------------------
    // FeatureChainRef
    // -----------------------------------------------------------------------
    describe('FeatureChainRef', () => {
        it('supports peak and valley kinds', () => {
            const peak: FeatureChainRef = { id: 0, pointCount: 10, kind: 'peak' };
            const valley: FeatureChainRef = { id: 1, pointCount: 5, kind: 'valley' };
            expect(peak.kind).toBe('peak');
            expect(valley.kind).toBe('valley');
        });
    });

    // -----------------------------------------------------------------------
    // StageMeshData
    // -----------------------------------------------------------------------
    describe('StageMeshData', () => {
        it('has consistent vertex count and positions length', () => {
            const mesh = makeMiniMesh();
            expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
            expect(mesh.uvs.length).toBe(mesh.vertexCount * 3);
        });

        it('outer index count does not exceed total indices', () => {
            const mesh = makeMiniMesh();
            expect(mesh.outerIdxCount).toBeLessThanOrEqual(mesh.indices.length);
        });
    });

    // -----------------------------------------------------------------------
    // PipelineConfig / PipelineResult type compatibility
    // -----------------------------------------------------------------------
    describe('PipelineConfig', () => {
        it('can be constructed with feature flags', () => {
            const config: PipelineConfig = {
                profileName: 'ultra',
                tolerances: { epsPosMm: 0.03, epsNormalDeg: 3.0, epsFeatureMm: 0.02, minTriangleAngleDeg: 22, maxAspectRatio: 6.0 },
                totalBudget: 100000,
                flags: resolveFeatureFlags({ distortionGating: true }),
            };
            expect(config.flags.distortionGating).toBe(true);
            expect(config.flags.metricAwareRefinement).toBe(false);
        });
    });

    describe('PipelineResult', () => {
        it('can be constructed from stage outputs', () => {
            const mesh = makeMiniMesh();
            const result: PipelineResult = {
                mesh,
                valid: true,
                stageMetrics: [
                    makeMetrics('feature'),
                    makeMetrics('tessellation'),
                    makeMetrics('refinement'),
                    makeMetrics('validation'),
                ],
                totalTimeMs: 42.0,
                refinementStopReason: 'tolerances_passed',
                warnings: [],
            };
            expect(result.stageMetrics).toHaveLength(4);
            expect(result.refinementStopReason).toBe('tolerances_passed');
        });
    });
});
