/**
 * integration.test.ts — End-to-end integration tests for the parametric pipeline.
 *
 * Tests the full flow: curvature → features → chains → grid → tessellation,
 * verifying that modules compose correctly.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { computeRawCurvature, normalizeProfile, smoothProfile } from './CurvatureAnalysis';
import { detectFeatureEdges } from './FeatureDetection';
import { computeGridDimensions } from './GridBuilder';
import { buildCDTOuterWall } from './OuterWallTessellator';
import {
    buildConstraintEdgeSet,
    computeBoundaryDiagnostic,
    edgeKey,
    optimizeBoundaryDiagonals,
    optimizeChainStrips,
} from './ChainStripOptimizer';
import { buildDowngradeLadder, profileForAttempt } from './QualityProfiles';
import {
    isValidStageRegistry,
    resolveFeatureFlags,
    validateFeatureFlags,
    type FeatureConstraintStage,
    type TessellationStage,
    type RefinementStage,
    type ValidationStage,
    type StageRegistry,
} from './contracts';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate synthetic circular positions with radial modulation.
 * Simulates a style with n lobes (like Superformula).
 */
function generateLobePositions(numSamples: number, lobes: number, baseRadius: number = 50, amplitude: number = 5): Float32Array {
    const positions = new Float32Array(numSamples * 3);
    for (let i = 0; i < numSamples; i++) {
        const theta = (i / numSamples) * 2 * Math.PI;
        const r = baseRadius + amplitude * Math.cos(lobes * theta);
        positions[i * 3 + 0] = r * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(theta);
        positions[i * 3 + 2] = 0;
    }
    return positions;
}

function makeSupportedCorridorFixture(): {
    chains: Array<{
        kind: 'peak';
        points: Array<{ row: number; u: number }>;
    }>;
    rowMapping: number[];
    tPositions: Float32Array;
    unionU: Float32Array;
} {
    const unionU = new Float32Array(8);
    for (let i = 0; i < unionU.length; i++) {
        unionU[i] = i / (unionU.length - 1);
    }

    const tPositions = new Float32Array(4);
    for (let i = 0; i < tPositions.length; i++) {
        tPositions[i] = i / (tPositions.length - 1);
    }

    return {
        chains: [
            {
                kind: 'peak',
                points: [
                    { row: 1, u: 0.28 },
                    { row: 2, u: 0.34 },
                ],
            },
        ],
        rowMapping: Array.from({ length: tPositions.length }, (_, i) => i),
        tPositions,
        unionU,
    };
}

function makeSeamCorridorFixture(): {
    chains: Array<{
        kind: 'peak';
        points: Array<{ row: number; u: number }>;
    }>;
    rowMapping: number[];
    tPositions: Float32Array;
    unionU: Float32Array;
} {
    return {
        chains: [
            {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.5 },
                    { row: 1, u: 0.5 },
                ],
            },
        ],
        rowMapping: [0, 1, 2],
        tPositions: new Float32Array([0, 0.5, 1.0]),
        unionU: new Float32Array([0, 0.1, 0.2, 0.3, 0.7]),
    };
}

function makeSupportedOverlapCorridorFixture(): {
    chains: Array<{
        kind: 'peak' | 'valley';
        points: Array<{ row: number; u: number }>;
    }>;
    rowMapping: number[];
    tPositions: Float32Array;
    unionU: Float32Array;
} {
    const unionU = new Float32Array(10);
    for (let i = 0; i < unionU.length; i++) {
        unionU[i] = i / (unionU.length - 1);
    }

    const tPositions = new Float32Array(5);
    for (let i = 0; i < tPositions.length; i++) {
        tPositions[i] = i / (tPositions.length - 1);
    }

    return {
        chains: [
            {
                kind: 'peak',
                points: [
                    { row: 1, u: 0.35 },
                    { row: 2, u: 0.42 },
                ],
            },
            {
                kind: 'valley',
                points: [
                    { row: 1, u: 0.40 },
                    { row: 2, u: 0.44 },
                ],
            },
        ],
        rowMapping: Array.from({ length: tPositions.length }, (_, i) => i),
        tPositions,
        unionU,
    };
}

function makePlanarPositions(vertices: Float32Array): Float32Array {
    const positions = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
        positions[i] = vertices[i];
        positions[i + 1] = vertices[i + 1];
        positions[i + 2] = 0;
    }
    return positions;
}

// ============================================================================
// Curvature → Features pipeline
// ============================================================================

describe('Parametric Pipeline Integration', () => {
    describe('curvature → features → chains', () => {
        it('detects features and produces chains for 6-lobe pattern', () => {
            const n = 4096;
            const positions = generateLobePositions(n, 6);

            const curvature = computeRawCurvature(positions, n);
            expect(curvature.length).toBe(n);

            const normalized = normalizeProfile(curvature);
            expect(normalized.length).toBe(n);

            const smoothed = smoothProfile(normalized, 2);
            expect(smoothed.length).toBe(n);

            const features = detectFeatureEdges(curvature, n, positions);
            // 6 lobes → should detect features (peaks + valleys + harmonics)
            expect(features.length).toBeGreaterThanOrEqual(6);
            expect(features.length).toBeLessThanOrEqual(36);
        });

        it('smoothProfile reduces noise without destroying features', () => {
            const n = 1024;
            const positions = generateLobePositions(n, 4);
            const curvature = computeRawCurvature(positions, n);
            const normalized = normalizeProfile(curvature);

            const smoothed = smoothProfile(normalized, 3);

            // Smoothed profile should have similar range but less noise
            let rawMax = 0, smoothMax = 0;
            for (let i = 0; i < n; i++) {
                rawMax = Math.max(rawMax, normalized[i]);
                smoothMax = Math.max(smoothMax, smoothed[i]);
            }
            // Smoothing shouldn't amplify signal
            expect(smoothMax).toBeLessThanOrEqual(rawMax + 1e-6);
            // But shouldn't completely flatten it either
            expect(smoothMax).toBeGreaterThan(rawMax * 0.1);
        });
    });

    // ========================================================================
    // Grid dimensions
    // ========================================================================

    describe('grid dimensions', () => {
        it('respects triangle budget for all surface configs', () => {
            const targetTris = 500_000;
            const surfaceConfigs = [
                { budgetFrac: 0.72, aspect: 3.0 }, // outer wall
                { budgetFrac: 0.14, aspect: 3.0 }, // inner wall
                { budgetFrac: 0.04, aspect: 1.0 }, // rim
            ];

            let totalTris = 0;
            for (const config of surfaceConfigs) {
                const { w, h } = computeGridDimensions(targetTris, config.budgetFrac, config.aspect);
                totalTris += 2 * (w - 1) * (h - 1); // quads → tris
                expect(w).toBeGreaterThanOrEqual(8);
                expect(h).toBeGreaterThanOrEqual(4);
            }

            // Total should not exceed target by more than 10%
            expect(totalTris).toBeLessThan(targetTris * 1.1);
        });

        it('returns larger grid for higher triangle budgets', () => {
            const low = computeGridDimensions(100_000, 0.72, 3.0);
            const high = computeGridDimensions(1_000_000, 0.72, 3.0);

            expect(high.w * high.h).toBeGreaterThan(low.w * low.h);
        });

        it('aspect ratio affects w/h proportions', () => {
            const square = computeGridDimensions(500_000, 0.5, 1.0);
            const wide = computeGridDimensions(500_000, 0.5, 4.0);

            // Wide should have larger w/h ratio
            expect(wide.w / wide.h).toBeGreaterThan(square.w / square.h);
        });
    });

    // ========================================================================
    // Grid → Tessellation
    // ========================================================================

    describe('grid → tessellation', () => {
        it('produces valid mesh from uniform grid with no chains', () => {
            const numU = 20;
            const numT = 10;

            const unionU = new Float32Array(numU);
            for (let i = 0; i < numU; i++) unionU[i] = i / (numU - 1);

            const tPositions = new Float32Array(numT);
            for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

            const rowMapping = Array.from({ length: numT }, (_, i) => i);

            const result = buildCDTOuterWall([], rowMapping, tPositions, unionU, 1000, 0);

            // Basic mesh validity
            expect(result.vertices.length).toBe(numU * numT * 3);
            expect(result.indices.length).toBeGreaterThan(0);
            expect(result.indices.length % 3).toBe(0);

            // All indices valid
            for (let i = 0; i < result.indices.length; i++) {
                expect(result.indices[i]).toBeLessThan(result.gridVertexCount);
            }

            // No degenerate triangles
            for (let i = 0; i < result.indices.length; i += 3) {
                const a = result.indices[i], b = result.indices[i + 1], c = result.indices[i + 2];
                expect(a !== b && b !== c && a !== c).toBe(true);
            }
        });

        it('chain vertices are added as CDT free points (no UV-snapping)', () => {
            const numU = 20;
            const numT = 5;

            const unionU = new Float32Array(numU);
            for (let i = 0; i < numU; i++) unionU[i] = i / (numU - 1);

            const tPositions = new Float32Array(numT);
            for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

            const rowMapping = Array.from({ length: numT }, (_, i) => i);

            // Chain at u=0.33 (between columns 6 and 7 for 20 columns)
            const chains = [{
                kind: 'peak' as const,
                points: [
                    { row: 1, u: 0.33 },
                    { row: 2, u: 0.33 },
                    { row: 3, u: 0.33 },
                ],
            }];

            const result = buildCDTOuterWall(chains, rowMapping, tPositions, unionU, 1000, 0);

            // Chain vertices appear in the mesh as additional vertices beyond the grid
            const gridVertexCount = numU * numT;
            expect(result.vertices.length / 3).toBeGreaterThan(gridVertexCount);
        });

        it('keeps corridor-enabled output compatible with downstream outer-wall optimizers', () => {
            const { chains, rowMapping, tPositions, unionU } = makeSupportedCorridorFixture();
            const result = buildCDTOuterWall(
                chains,
                rowMapping,
                tPositions,
                unionU,
                1000,
                0,
                undefined,
                undefined,
                { corridorPlanning: true, corridorDiagnostics: true },
            );

            const supportedCandidate = result.corridorPlan?.candidates.find(candidate => candidate.supported);
            expect(supportedCandidate).toBeDefined();
            const cellsPerRow = unionU.length - 1;
            const quadIndex = supportedCandidate!.band * cellsPerRow + supportedCandidate!.colStart;
            expect(result.quadMap[quadIndex]).toBe(-1);
            expect(result.chainAdjacentVertices.size).toBeGreaterThan(0);

            const combinedIdxs = new Uint32Array(result.indices);
            const positions = makePlanarPositions(result.vertices);
            const constraintEdgeSet = buildConstraintEdgeSet(result.chainEdges);
            for (const [v0, v1] of result.fanDiagonalEdges) {
                constraintEdgeSet.add(edgeKey(v0, v1));
            }

            const chainResult = optimizeChainStrips({
                combinedIdxs,
                positions,
                combinedVerts: result.vertices,
                constraintEdgeSet,
                outerGridVertexCount: result.gridVertexCount,
                outerIdxCount: combinedIdxs.length,
                finalT: tPositions,
                chainAdjacentVertices: result.chainAdjacentVertices,
                protectedVertices: result.protectedStripVertices,
            });

            const boundaryResult = optimizeBoundaryDiagonals({
                combinedIdxs,
                positions,
                outerW: unionU.length,
                outerH: tPositions.length,
                outerQuadMap: result.quadMap,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: result.gridVertexCount,
                chainAdjacentVertices: result.chainAdjacentVertices,
                protectedVertices: result.protectedStripVertices,
            });

            const boundaryDiagnostic = computeBoundaryDiagnostic({
                indices: combinedIdxs,
                positions,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: result.gridVertexCount,
                chainAdjacentVertices: result.chainAdjacentVertices,
            });

            expect(chainResult.chainStripTriCount).toBeGreaterThan(0);
            expect(boundaryResult.checked).toBeGreaterThan(0);
            expect(boundaryDiagnostic.boundaryEdgeCount).toBeGreaterThan(0);
            expect(Number.isFinite(boundaryDiagnostic.dihedralAvg)).toBe(true);
            expect(result.interpolatedChainVertices).toBeDefined();

            const vertexCount = result.vertices.length / 3;
            for (let i = 0; i < combinedIdxs.length; i++) {
                expect(combinedIdxs[i]).toBeLessThan(vertexCount);
            }

            for (let i = 0; i < combinedIdxs.length; i += 3) {
                const a = combinedIdxs[i];
                const b = combinedIdxs[i + 1];
                const c = combinedIdxs[i + 2];
                if (a === 0 && b === 0 && c === 0) {
                    continue;
                }
                expect(a !== b && b !== c && a !== c).toBe(true);
            }
        });

        it('keeps seam-supported corridor output compatible with downstream outer-wall optimizers', () => {
            const { chains, rowMapping, tPositions, unionU } = makeSeamCorridorFixture();
            const result = buildCDTOuterWall(
                chains,
                rowMapping,
                tPositions,
                unionU,
                1000,
                0,
                undefined,
                undefined,
                { corridorPlanning: true, corridorDiagnostics: true },
            );

            const supportedCandidate = result.corridorPlan?.candidates.find(candidate =>
                candidate.supported && candidate.ownershipSegments.some(segment => segment.periodicSeam),
            );
            expect(supportedCandidate).toBeDefined();
            const cellsPerRow = unionU.length - 1;
            const quadIndex = supportedCandidate!.band * cellsPerRow + supportedCandidate!.colStart;
            expect(result.quadMap[quadIndex]).toBe(-1);

            const combinedIdxs = new Uint32Array(result.indices);
            const positions = makePlanarPositions(result.vertices);
            const constraintEdgeSet = buildConstraintEdgeSet(result.chainEdges);
            for (const [v0, v1] of result.fanDiagonalEdges) {
                constraintEdgeSet.add(edgeKey(v0, v1));
            }

            const chainResult = optimizeChainStrips({
                combinedIdxs,
                positions,
                combinedVerts: result.vertices,
                constraintEdgeSet,
                outerGridVertexCount: result.gridVertexCount,
                outerIdxCount: combinedIdxs.length,
                finalT: tPositions,
                chainAdjacentVertices: result.chainAdjacentVertices,
                protectedVertices: result.protectedStripVertices,
            });

            const boundaryResult = optimizeBoundaryDiagonals({
                combinedIdxs,
                positions,
                outerW: unionU.length,
                outerH: tPositions.length,
                outerQuadMap: result.quadMap,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: result.gridVertexCount,
                chainAdjacentVertices: result.chainAdjacentVertices,
                protectedVertices: result.protectedStripVertices,
            });

            const boundaryDiagnostic = computeBoundaryDiagnostic({
                indices: combinedIdxs,
                positions,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: result.gridVertexCount,
                chainAdjacentVertices: result.chainAdjacentVertices,
            });

            expect(chainResult.chainStripTriCount).toBeGreaterThan(0);
            expect(boundaryResult.checked).toBeGreaterThan(0);
            expect(boundaryDiagnostic.boundaryEdgeCount).toBeGreaterThan(0);
            expect(Number.isFinite(boundaryDiagnostic.dihedralAvg)).toBe(true);
            expect(result.interpolatedChainVertices).toBeDefined();

            const vertexCount = result.vertices.length / 3;
            for (let i = 0; i < combinedIdxs.length; i++) {
                expect(combinedIdxs[i]).toBeLessThan(vertexCount);
            }

            for (let i = 0; i < combinedIdxs.length; i += 3) {
                const a = combinedIdxs[i];
                const b = combinedIdxs[i + 1];
                const c = combinedIdxs[i + 2];
                expect(a !== b && b !== c && a !== c).toBe(true);
            }
        });

        it('keeps overlap-supported corridor output compatible with downstream outer-wall optimizers', () => {
            const { chains, rowMapping, tPositions, unionU } = makeSupportedOverlapCorridorFixture();
            const result = buildCDTOuterWall(
                chains,
                rowMapping,
                tPositions,
                unionU,
                1000,
                0,
                undefined,
                undefined,
                { corridorPlanning: true, corridorDiagnostics: true },
            );

            const supportedCandidate = result.corridorPlan?.candidates.find(candidate =>
                candidate.supported && candidate.ownershipSegments.some(segment => segment.chainIds.length === 2),
            );
            expect(supportedCandidate).toBeDefined();
            const cellsPerRow = unionU.length - 1;
            const quadIndex = supportedCandidate!.band * cellsPerRow + supportedCandidate!.colStart;
            expect(result.quadMap[quadIndex]).toBe(-1);

            const combinedIdxs = new Uint32Array(result.indices);
            const positions = makePlanarPositions(result.vertices);
            const constraintEdgeSet = buildConstraintEdgeSet(result.chainEdges);
            for (const [v0, v1] of result.fanDiagonalEdges) {
                constraintEdgeSet.add(edgeKey(v0, v1));
            }

            const chainResult = optimizeChainStrips({
                combinedIdxs,
                positions,
                combinedVerts: result.vertices,
                constraintEdgeSet,
                outerGridVertexCount: result.gridVertexCount,
                outerIdxCount: combinedIdxs.length,
                finalT: tPositions,
                chainAdjacentVertices: result.chainAdjacentVertices,
                protectedVertices: result.protectedStripVertices,
            });

            const boundaryResult = optimizeBoundaryDiagonals({
                combinedIdxs,
                positions,
                outerW: unionU.length,
                outerH: tPositions.length,
                outerQuadMap: result.quadMap,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: result.gridVertexCount,
                chainAdjacentVertices: result.chainAdjacentVertices,
                protectedVertices: result.protectedStripVertices,
            });

            const boundaryDiagnostic = computeBoundaryDiagnostic({
                indices: combinedIdxs,
                positions,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: result.gridVertexCount,
                chainAdjacentVertices: result.chainAdjacentVertices,
            });

            expect(chainResult.chainStripTriCount).toBeGreaterThan(0);
            expect(boundaryResult.checked).toBeGreaterThan(0);
            expect(boundaryDiagnostic.boundaryEdgeCount).toBeGreaterThan(0);
            expect(Number.isFinite(boundaryDiagnostic.dihedralAvg)).toBe(true);
        });
    });

    // ========================================================================
    // Full pipeline smoke test
    // ========================================================================

    describe('full pipeline smoke test', () => {
        it('curvature → features → grid dimensions are consistent', () => {
            const n = 2048;
            const positions = generateLobePositions(n, 8);
            const curvature = computeRawCurvature(positions, n);
            const features = detectFeatureEdges(curvature, n, positions);

            // Features should be in valid range [0, n)
            for (const f of features) {
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThan(n);
            }

            // Grid dimensions based on typical budget
            const { w, h } = computeGridDimensions(200_000, 0.72, 3.0);
            expect(w).toBeGreaterThanOrEqual(8);
            expect(h).toBeGreaterThanOrEqual(4);

            // Tessellation with computed dimensions
            const unionU = new Float32Array(w);
            for (let i = 0; i < w; i++) unionU[i] = i / (w - 1);
            const tPositions = new Float32Array(h);
            for (let i = 0; i < h; i++) tPositions[i] = i / (h - 1);
            const rowMapping = Array.from({ length: h }, (_, i) => i);

            const result = buildCDTOuterWall([], rowMapping, tPositions, unionU, 200_000, 0);
            expect(result.gridVertexCount).toBe(w * h);
            expect(result.indices.length / 3).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // Task 23 compatibility checks (contracts + downgrade determinism)
    // ========================================================================

    describe('contract compatibility and fallback determinism', () => {
        it('accepts stage registry implementations through stable interfaces', async () => {
            const featureStage: FeatureConstraintStage = {
                name: 'feature',
                async execute() {
                    return {
                        featureIndices: [10, 20],
                        featureCount: 2,
                        metrics: { stageName: 'feature', timeMs: 1 },
                    };
                },
            };

            const tessellationStage: TessellationStage = {
                name: 'tess',
                async execute() {
                    return {
                        mesh: {
                            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                            uvs: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                            indices: new Uint32Array([0, 1, 2]),
                            outerIdxCount: 3,
                            vertexCount: 3,
                        },
                        gridU: 3,
                        gridT: 1,
                        triangleCount: 1,
                        metrics: { stageName: 'tess', timeMs: 1 },
                    };
                },
            };

            const refinementStage: RefinementStage = {
                name: 'refine',
                async execute(input) {
                    return {
                        mesh: input.mesh,
                        tolerancesPassed: true,
                        iterationsPerformed: 0,
                        stopReason: 'zero_iterations',
                        maxPosErrorMm: 0,
                        maxNormalErrorDeg: 0,
                        metrics: { stageName: 'refine', timeMs: 1 },
                    };
                },
            };

            const validationStage: ValidationStage = {
                name: 'validate',
                async execute() {
                    return {
                        valid: true,
                        manifoldOk: true,
                        degeneratesOk: true,
                        normalsOk: true,
                        triangleQualityOk: true,
                        fidelityOk: true,
                        distortionOk: true,
                        warnings: [],
                        metrics: { stageName: 'validate', timeMs: 1 },
                    };
                },
            };

            const registry: StageRegistry = {
                featureConstraint: featureStage,
                tessellation: tessellationStage,
                refinement: refinementStage,
                validation: validationStage,
            };

            expect(isValidStageRegistry(registry)).toBe(true);

            const featureOut = await registry.featureConstraint.execute({
                positions3D: new Float32Array(30),
                numSamples: 10,
                profileName: 'high',
            });
            expect(featureOut.featureCount).toBe(2);
        });

        it('downgrade ladder is deterministic across repeated runs', () => {
            const runA = buildDowngradeLadder('ultra');
            const runB = buildDowngradeLadder('ultra');
            expect(runA).toEqual(runB);
            expect(runA).toEqual(['ultra', 'high', 'standard', 'draft']);
            expect(profileForAttempt('ultra', 0)).toBe('ultra');
            expect(profileForAttempt('ultra', 1)).toBe('high');
            expect(profileForAttempt('ultra', 2)).toBe('standard');
            expect(profileForAttempt('ultra', 3)).toBe('draft');
            expect(profileForAttempt('ultra', 4)).toBe('draft');
        });

        it('feature flags remain backward-safe by default', () => {
            const flags = resolveFeatureFlags(undefined);
            expect(flags.metricAwareRefinement).toBe(false);
            expect(flags.distortionGating).toBe(false);
            expect(flags.gpuFidelityCheck).toBe(false);
            expect(flags.seamHealing).toBe(false);
            expect(flags.outerWallCorridorPlanning).toBe(false);
            expect(flags.outerWallCorridorDiagnostics).toBe(false);

            expect(() => validateFeatureFlags(flags)).not.toThrow();
            expect(() => validateFeatureFlags(resolveFeatureFlags({ mdcIsosurface: true }))).toThrow();
        });
    });
});
