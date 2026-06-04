/**
 * ParametricExportComputer.corridorFlags.test.ts
 *
 * Export-level regression coverage for corridor feature-flag threading.
 * These tests run the real compute() entrypoint with a fake device and
 * intercept the outer-wall build call at the handoff boundary.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GPUBufferDescriptor } from '@webgpu/types';
import type {
    ParametricExportParams,
    ParametricExportResult,
    ValidationSummary,
} from './parametric/types';

const OUTER_WALL_SENTINEL = new Error('outer-wall-sentinel');
const CHAIN_STRIP_SENTINEL = new Error('chain-strip-sentinel');
const CAD_CLOSURE_TARGET_TRIANGLES = 1_200;
const CAD_CLOSURE_NUM_STRIPS = 4;
const CAD_CLOSURE_CURVATURE_SAMPLES = 128;
const CAD_CLOSURE_ROW_PROBE_SAMPLES = 256;
const CAD_CLOSURE_MIN_CHAIN_COUNT = 2;
const CAD_CLOSURE_MIN_CHAIN_POINTS = 12;
const CAD_QUALITY_WARNING_PATTERN = /boundary edges|non-manifold|degenerate|normal|triangle quality|fidelity|seam|distortion/i;
const {
    buildCDTOuterWallMock,
    optimizeChainStripsMock,
    linkFeatureChainsByKindMock,
    filterLowConfidenceChainsMock,
    generateCDFAdaptivePositionsMock,
    detectAllRowFeaturesMock,
} = vi.hoisted(() => ({
    buildCDTOuterWallMock: vi.fn(),
    optimizeChainStripsMock: vi.fn(),
    linkFeatureChainsByKindMock: vi.fn(),
    filterLowConfidenceChainsMock: vi.fn(),
    generateCDFAdaptivePositionsMock: vi.fn(),
    detectAllRowFeaturesMock: vi.fn(),
}));

vi.mock('./parametric/OuterWallTessellator', async () => {
    const actual = await vi.importActual<typeof import('./parametric/OuterWallTessellator')>('./parametric/OuterWallTessellator');
    return {
        ...actual,
        buildCDTOuterWall: (...args: Parameters<typeof actual.buildCDTOuterWall>) => {
            if (buildCDTOuterWallMock.getMockImplementation()) {
                return buildCDTOuterWallMock(...args);
            }
            return actual.buildCDTOuterWall(...args);
        },
    };
});

vi.mock('./parametric/ChainStripOptimizer', async () => {
    const actual = await vi.importActual<typeof import('./parametric/ChainStripOptimizer')>('./parametric/ChainStripOptimizer');
    return {
        ...actual,
        optimizeChainStrips: (...args: Parameters<typeof actual.optimizeChainStrips>) => {
            if (optimizeChainStripsMock.getMockImplementation()) {
                return optimizeChainStripsMock(...args);
            }
            return actual.optimizeChainStrips(...args);
        },
    };
});

vi.mock('./parametric/ChainLinker', async () => {
    const actual = await vi.importActual<typeof import('./parametric/ChainLinker')>('./parametric/ChainLinker');
    return {
        ...actual,
        linkFeatureChainsByKind: (...args: Parameters<typeof actual.linkFeatureChainsByKind>) => {
            if (linkFeatureChainsByKindMock.getMockImplementation()) {
                return linkFeatureChainsByKindMock(...args);
            }
            return actual.linkFeatureChainsByKind(...args);
        },
        filterLowConfidenceChains: (...args: Parameters<typeof actual.filterLowConfidenceChains>) => {
            if (filterLowConfidenceChainsMock.getMockImplementation()) {
                return filterLowConfidenceChainsMock(...args);
            }
            return actual.filterLowConfidenceChains(...args);
        },
    };
});

vi.mock('./parametric/GridBuilder', async () => {
    const actual = await vi.importActual<typeof import('./parametric/GridBuilder')>('./parametric/GridBuilder');
    return {
        ...actual,
        generateCDFAdaptivePositions: (...args: Parameters<typeof actual.generateCDFAdaptivePositions>) => {
            if (generateCDFAdaptivePositionsMock.getMockImplementation()) {
                return generateCDFAdaptivePositionsMock(...args);
            }
            return actual.generateCDFAdaptivePositions(...args);
        },
    };
});

vi.mock('./parametric/FeatureDetection', async () => {
    const actual = await vi.importActual<typeof import('./parametric/FeatureDetection')>('./parametric/FeatureDetection');
    return {
        ...actual,
        detectAllRowFeatures: (...args: Parameters<typeof actual.detectAllRowFeatures>) => {
            if (detectAllRowFeaturesMock.getMockImplementation()) {
                return detectAllRowFeaturesMock(...args);
            }
            return actual.detectAllRowFeatures(...args);
        },
    };
});

import {
    getLastChainDebugData,
    getLastPeakDebugData,
    ParametricExportComputer,
} from './ParametricExportComputer';

type FakeBuffer = {
    readonly label: string;
    readonly destroy: ReturnType<typeof vi.fn>;
};

type AnalyticSurface = (
    uCoord: number,
    tCoord: number,
    surfaceId: number,
) => readonly [number, number, number];

const defaultAnalyticSurface: AnalyticSurface = (uCoord, tCoord) => {
    const theta = uCoord * Math.PI * 2;
    const radius = 30 + 4 * Math.cos(theta * 4) + tCoord * 2;
    return [
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        tCoord * 120,
    ];
};

function signedCircularDelta(uCoord: number, centerU: number): number {
    let delta = uCoord - centerU;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    return delta;
}

function gaussianAtU(uCoord: number, centerU: number, sigma: number): number {
    const delta = signedCircularDelta(uCoord, centerU);
    return Math.exp(-0.5 * (delta / sigma) * (delta / sigma));
}

const zeroInterceptionOverlapSurface: AnalyticSurface = (uCoord, tCoord, surfaceId) => {
    const theta = uCoord * Math.PI * 2;
    const peakCenter = 0.195 + 0.010 * tCoord;
    const valleyCenter = 0.245 + 0.010 * tCoord;
    const peak = gaussianAtU(uCoord, peakCenter, 0.010);
    const valley = gaussianAtU(uCoord, valleyCenter, 0.010);
    const secondaryPeak = 0.35 * gaussianAtU(uCoord, 0.62 - 0.012 * tCoord, 0.020);
    const surfaceOffset = surfaceId === 0 ? 0 : -1.5 * surfaceId;
    const radius = 32 + surfaceOffset + tCoord * 1.5 + peak * 5.0 - valley * 4.0 + secondaryPeak;
    return [
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        tCoord * 120,
    ];
};

function createFakeDevice(): GPUDevice {
    const queue = {
        writeBuffer: vi.fn(),
        submit: vi.fn(),
    };

    const createBuffer = vi.fn((descriptor: GPUBufferDescriptor) => {
        const label = typeof descriptor.label === 'string' ? descriptor.label : 'buffer';
        return {
            label,
            destroy: vi.fn(),
        } satisfies FakeBuffer as unknown as GPUBuffer;
    });

    return {
        createBuffer,
        queue,
    } as unknown as GPUDevice;
}

function createParams(overrides?: Partial<ParametricExportParams>): ParametricExportParams {
    return {
        dimensions: {
            H: 120,
            Rt: 40,
            Rb: 28,
            tWall: 3,
            tBottom: 4,
            rDrain: 2,
            expn: 1,
        },
        styleId: 'FourierBloom',
        styleOpts: {},
        styleIndex: 1,
        targetTriangles: 2_000,
        relaxIterations: 0,
        qualityProfile: 'draft',
        pipelineConfig: {
            numStrips: 2,
            curvatureSamples: 16,
            detectHorizontalFeatures: false,
            rowProbeSamples: 32,
            gpuResnap: false,
            resnapCandidates: 8,
            featureBudgetMB: 0,
            chainStripMode: 'sweep',
            chainStripDensity: 1,
            chainStripExpansion: 1,
            chainStripAdaptiveRefine: false,
            bandMergeFactor: 1,
            chainDirectedFlip: false,
            edgeFlip3D: false,
            chainStripOptimizer: false,
            boundaryDiagOpt: false,
            gpuSubdivision: false,
        },
        ...overrides,
    };
}

function createComputer(surface: AnalyticSurface = defaultAnalyticSurface): ParametricExportComputer {
    const computer = new ParametricExportComputer(createFakeDevice());
    (computer as unknown as { initialized: boolean }).initialized = true;
    (computer as unknown as {
        evaluatePoints: (
            vertices: Float32Array,
            ...rest: unknown[]
        ) => Promise<Float32Array>;
    }).evaluatePoints = vi.fn(async (vertices: Float32Array) => {
        const positions = new Float32Array(vertices.length);
        for (let i = 0; i < vertices.length; i += 3) {
            const [x, y, z] = surface(vertices[i], vertices[i + 1], vertices[i + 2]);
            positions[i] = x;
            positions[i + 1] = y;
            positions[i + 2] = z;
        }
        return positions;
    });
    return computer;
}

function extractBoundaryEdgeWarningCount(result: { validationSummary?: { warnings: string[] } } | undefined): number | undefined {
    const warning = result?.validationSummary?.warnings.find(entry => entry.includes('boundary edges'));
    if (!warning) return undefined;
    const match = warning.match(/(\d+) boundary edges/);
    return match ? Number(match[1]) : undefined;
}

function requireValidationSummary(result: ParametricExportResult): ValidationSummary {
    expect(result.validationSummary).toBeDefined();
    return result.validationSummary as ValidationSummary;
}

function expectCadQualityClosure(result: ParametricExportResult): void {
    const summary = requireValidationSummary(result);
    const warnings = summary.warnings.join('\n');

    const tolerances = result.effectiveTolerances;
    if (!tolerances) {
        throw new Error('missing effective tolerances');
    }

    expect.soft(summary.valid, warnings).toBe(true);
    expect.soft(summary.manifoldOk, warnings).toBe(true);
    expect.soft(summary.degeneratesOk, warnings).toBe(true);
    expect.soft(summary.normalsOk, warnings).toBe(true);
    expect.soft(summary.triangleQualityOk, warnings).toBe(true);
    expect.soft(summary.fidelityOk, warnings).toBe(true);
    expect.soft(summary.seamOk, warnings).toBe(true);
    expect.soft(summary.distortionOk, warnings).toBe(true);
    expect.soft(summary.minAngleDeg, warnings).toBeGreaterThanOrEqual(tolerances.minTriangleAngleDeg);
    expect.soft(summary.maxAspectRatio, warnings).toBeLessThanOrEqual(tolerances.maxAspectRatio);
    expect.soft(summary.p95PosErrorMm, warnings).toBeLessThanOrEqual(tolerances.epsPosMm);
    expect.soft(summary.p999PosErrorMm, warnings).toBeLessThanOrEqual(tolerances.epsPosMm * 2);
    expect.soft(summary.maxFeatureDriftMm ?? 0, warnings).toBeLessThanOrEqual(tolerances.epsFeatureMm);
    expect.soft(summary.seamMaxGapMm ?? 0, warnings).toBeLessThanOrEqual(tolerances.epsPosMm);
    expect.soft(summary.warnings.filter(message => CAD_QUALITY_WARNING_PATTERN.test(message))).toEqual([]);
}

describe('ParametricExportComputer corridor flag threading', () => {
    beforeEach(() => {
        buildCDTOuterWallMock.mockReset();
        optimizeChainStripsMock.mockReset();
        linkFeatureChainsByKindMock.mockReset();
        filterLowConfidenceChainsMock.mockReset();
        generateCDFAdaptivePositionsMock.mockReset();
        detectAllRowFeaturesMock.mockReset();
    });

    it('passes corridor flags as disabled by default', async () => {
        const computer = createComputer();
        buildCDTOuterWallMock.mockImplementation(() => {
            throw OUTER_WALL_SENTINEL;
        });

        await expect(computer.compute(createParams())).rejects.toBe(OUTER_WALL_SENTINEL);

        expect(buildCDTOuterWallMock).toHaveBeenCalledTimes(1);
        const outerWallOptions = buildCDTOuterWallMock.mock.calls[0]?.[8] as {
            corridorPlanning?: boolean;
            corridorDiagnostics?: boolean;
            metricAspect?: number;
        };
        // Use toMatchObject so the Bug #5 metricAspect field (always present,
        // computed from pot geometry) doesn't fail this flag-threading test.
        expect(outerWallOptions).toMatchObject({
            corridorPlanning: false,
            corridorDiagnostics: false,
        });
        expect(typeof outerWallOptions.metricAspect).toBe('number');
        expect(outerWallOptions.metricAspect).toBeGreaterThan(0);
        expect(outerWallOptions.metricAspect).toBeLessThanOrEqual(10);
    });

    it('threads corridor planning and diagnostics into the outer-wall build', async () => {
        const computer = createComputer();
        buildCDTOuterWallMock.mockImplementation(() => {
            throw OUTER_WALL_SENTINEL;
        });

        await expect(
            computer.compute(
                createParams({
                    pipelineFeatureFlags: {
                        outerWallCorridorPlanning: true,
                        outerWallCorridorDiagnostics: true,
                    },
                }),
            ),
        ).rejects.toBe(OUTER_WALL_SENTINEL);

        expect(buildCDTOuterWallMock).toHaveBeenCalledTimes(1);
        const outerWallOptions = buildCDTOuterWallMock.mock.calls[0]?.[8] as {
            corridorPlanning?: boolean;
            corridorDiagnostics?: boolean;
            metricAspect?: number;
        };
        // Use toMatchObject so the Bug #5 metricAspect field doesn't break
        // this flag-threading assertion.
        expect(outerWallOptions).toMatchObject({
            corridorPlanning: true,
            corridorDiagnostics: true,
        });
    });

    it('rejects diagnostics without planning before outer-wall construction', async () => {
        const computer = createComputer();

        await expect(
            computer.compute(
                createParams({
                    pipelineFeatureFlags: {
                        outerWallCorridorDiagnostics: true,
                    },
                }),
            ),
        ).rejects.toThrow(/outerWallCorridorDiagnostics requires outerWallCorridorPlanning/);

        expect(buildCDTOuterWallMock).not.toHaveBeenCalled();
    });

    it('changes corridor-enabled outer-wall output on the optimizer path when a supported simple span reuses owned super-cell machinery', async () => {
        const computer = createComputer();
        const capturedIdxs: number[][] = [];
        const capturedAdjacencySizes: number[] = [];

        linkFeatureChainsByKindMock.mockImplementation((_, __, numRows: number) => {
            const band = Math.max(1, Math.floor(numRows / 3));
            return [
                {
                    kind: 'peak',
                    points: [
                        { row: band, u: 0.28 },
                        { row: band + 1, u: 0.33 },
                    ],
                },
            ];
        });
        filterLowConfidenceChainsMock.mockImplementation((chains) => chains);
        optimizeChainStripsMock.mockImplementation((params) => {
            capturedIdxs.push(Array.from(params.combinedIdxs));
            capturedAdjacencySizes.push(params.chainAdjacentVertices?.size ?? 0);
            throw CHAIN_STRIP_SENTINEL;
        });

        const baseParams = createParams({
            pipelineConfig: {
                ...createParams().pipelineConfig,
                chainStripOptimizer: true,
            },
        });

        await expect(computer.compute(baseParams)).rejects.toBe(CHAIN_STRIP_SENTINEL);
        await expect(
            computer.compute({
                ...baseParams,
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            }),
        ).rejects.toBe(CHAIN_STRIP_SENTINEL);

        expect(capturedIdxs).toHaveLength(2);
        expect(capturedAdjacencySizes[0]).toBeGreaterThan(0);
        expect(capturedAdjacencySizes[1]).toBeGreaterThan(0);
        expect(capturedIdxs[1]).not.toEqual(capturedIdxs[0]);
    });

    it('changes overlap corridor output on the optimizer path when an exact-match two-chain span reuses owned super-cell machinery', async () => {
        const computer = createComputer();
        const capturedIdxs: number[][] = [];
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;

        linkFeatureChainsByKindMock.mockImplementation((_, __, numRows: number) => {
            const band = Math.max(1, Math.floor(numRows / 3));
            return [
                {
                    kind: 'peak',
                    points: [
                        { row: band, u: 0.35 },
                        { row: band + 1, u: 0.42 },
                    ],
                },
                {
                    kind: 'valley',
                    points: [
                        { row: band, u: 0.4 },
                        { row: band + 1, u: 0.44 },
                    ],
                },
            ];
        });
        filterLowConfidenceChainsMock.mockImplementation((chains) => chains);
        optimizeChainStripsMock.mockImplementation((params) => {
            capturedIdxs.push(Array.from(params.combinedIdxs));
            throw CHAIN_STRIP_SENTINEL;
        });

        const baseParams = createParams({
            pipelineConfig: {
                ...createParams().pipelineConfig,
                chainStripOptimizer: true,
            },
        });

        try {
            await expect(computer.compute(baseParams)).rejects.toBe(CHAIN_STRIP_SENTINEL);
            await expect(
                computer.compute({
                    ...baseParams,
                    pipelineFeatureFlags: {
                        outerWallCorridorPlanning: true,
                        outerWallCorridorDiagnostics: true,
                    },
                }),
            ).rejects.toBe(CHAIN_STRIP_SENTINEL);
            sawCorridorDiagnostic = logSpy.mock.calls.some(call =>
                typeof call[0] === 'string' &&
                call[0].includes('Corridor dry-run:') &&
                call[0].includes('supported=')
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(capturedIdxs).toHaveLength(2);
        expect(capturedIdxs[1]).not.toEqual(capturedIdxs[0]);
        expect(sawCorridorDiagnostic).toBe(true);
    });

    it('changes the real compute() mesh for a bounded overlap corridor that crosses internal boundaries', async () => {
        const computer = createComputer();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;

        linkFeatureChainsByKindMock.mockImplementation((_, __, numRows: number) => {
            const band = Math.max(1, Math.floor(numRows / 3));
            return [
                {
                    kind: 'peak',
                    points: [
                        { row: band, u: 0.35 },
                        { row: band + 1, u: 0.42 },
                    ],
                },
                {
                    kind: 'valley',
                    points: [
                        { row: band, u: 0.4 },
                        { row: band + 1, u: 0.44 },
                    ],
                },
            ];
        });
        filterLowConfidenceChainsMock.mockImplementation((chains) => chains);

        const baseParams = createParams({
            targetTriangles: 500,
            pipelineConfig: {
                ...createParams().pipelineConfig,
                chainDirectedFlip: false,
                edgeFlip3D: false,
                chainStripOptimizer: false,
                boundaryDiagOpt: false,
                gpuSubdivision: false,
            },
        });

        try {
            const legacy = await computer.compute(baseParams);
            const planned = await computer.compute({
                ...baseParams,
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            });

            expect(legacy.mesh.indices.length).toBeGreaterThan(0);
            expect(planned.mesh.indices.length).toBeGreaterThan(0);
            expect(Array.from(planned.mesh.indices)).not.toEqual(Array.from(legacy.mesh.indices));
            sawCorridorDiagnostic = logSpy.mock.calls.some(call =>
                typeof call[0] === 'string' &&
                call[0].includes('Corridor dry-run:') &&
                call[0].includes('supported=')
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(sawCorridorDiagnostic).toBe(true);
    });

    it('changes the real compute() mesh for a seam-supported corridor when planning is enabled', async () => {
        const computer = createComputer();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;

        linkFeatureChainsByKindMock.mockImplementation(() => [{
            kind: 'peak',
            points: [
                { row: 0, u: 0.5 },
                { row: 1, u: 0.5 },
            ],
        }]);
        filterLowConfidenceChainsMock.mockImplementation((chains) => chains);
        generateCDFAdaptivePositionsMock.mockImplementation(() => new Float32Array([0, 0.1, 0.2, 0.3, 0.7]));

        const baseParams = createParams({
            pipelineConfig: {
                ...createParams().pipelineConfig,
                chainDirectedFlip: false,
                edgeFlip3D: false,
                chainStripOptimizer: false,
                boundaryDiagOpt: false,
                gpuSubdivision: false,
            },
        });

        try {
            const legacy = await computer.compute(baseParams);
            const planned = await computer.compute({
                ...baseParams,
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            });

            expect(legacy.mesh.indices.length).toBeGreaterThan(0);
            expect(planned.mesh.indices.length).toBeGreaterThan(0);
            expect(Array.from(planned.mesh.indices)).not.toEqual(Array.from(legacy.mesh.indices));
            expect(Array.from(planned.mesh.vertices)).not.toEqual(Array.from(legacy.mesh.vertices));
            expect(planned.mesh.vertexCount).toBeGreaterThan(0);
            expect(planned.mesh.triangleCount).toBe(planned.mesh.indices.length / 3);
            sawCorridorDiagnostic = logSpy.mock.calls.some(call =>
                typeof call[0] === 'string' &&
                call[0].includes('Corridor dry-run:') &&
                call[0].includes('supported=')
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(sawCorridorDiagnostic).toBe(true);
    });

    it('changes max-strength SuperformulaBlossom export when natural corridors use chain-cell emission', async () => {
        const computer = createComputer();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;
        let sawChainCellDiagnostic = false;

        const baseParams = createParams({
            styleId: 'SuperformulaBlossom',
            styleIndex: 0,
            styleOpts: {
                sf_strength: 1,
                sf_m_base: 6,
                sf_m_top: 10,
                sf_n1: 0.35,
                sf_n1_top: 0.5,
                sf_m_curve_exp: 1.2,
                sf_n2: 0.8,
                sf_n2_top: 1.4,
                sf_n3: 0.8,
                sf_n3_top: 0.8,
                sf_a: 1,
                sf_b: 1,
            },
            targetTriangles: 20_000,
            pipelineConfig: {
                ...createParams().pipelineConfig,
                numStrips: 8,
                curvatureSamples: 512,
                rowProbeSamples: 1024,
                gpuResnap: true,
                resnapCandidates: 32,
                chainStripDensity: 8,
                chainStripExpansion: 4,
                chainStripAdaptiveRefine: true,
                chainDirectedFlip: false,
                edgeFlip3D: false,
                chainStripOptimizer: false,
                boundaryDiagOpt: false,
                gpuSubdivision: false,
            },
        });

        try {
            const legacy = await computer.compute(baseParams);
            const plannedLogStart = logSpy.mock.calls.length;
            const planned = await computer.compute({
                ...baseParams,
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            });

            const plannedMessages = logSpy.mock.calls
                .slice(plannedLogStart)
                .map(call => typeof call[0] === 'string' ? call[0] : '')
                .filter(Boolean);

            expect(legacy.mesh.indices.length).toBeGreaterThan(0);
            expect(planned.mesh.indices.length).toBeGreaterThan(0);
            expect(Array.from(planned.mesh.indices)).not.toEqual(Array.from(legacy.mesh.indices));
            expect(planned.mesh.vertexCount).toBeGreaterThan(0);
            expect(planned.mesh.triangleCount).toBeGreaterThan(0);

            sawCorridorDiagnostic = plannedMessages.some(message =>
                message.includes('Corridor dry-run:') && /supported=[1-9]\d*/.test(message),
            );
            sawChainCellDiagnostic = plannedMessages.some(message =>
                message.includes('R35 Chain edges:') &&
                /chain cells: [1-9]\d*/.test(message) &&
                /missing=0/.test(message),
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(sawCorridorDiagnostic).toBe(true);
        expect(sawChainCellDiagnostic).toBe(true);
    });

    it('threads a detection-driven bounded overlap fixture through real chain linking before outer-wall build', async () => {
        const computer = createComputer();
        let capturedChains: Array<{
            kind: 'peak' | 'valley';
            points: Array<{ row: number; u: number }>;
        }> = [];

        detectAllRowFeaturesMock.mockImplementation((rowProbeData: Float32Array[]) => {
            const rowCount = rowProbeData.length;
            const allRowFeatures = Array.from({ length: rowCount }, () => [0.355, 0.363]);
            const allRowTypedFeatures = Array.from({ length: rowCount }, () => [
                { u: 0.355, kind: 'peak' as const, radius: 1, prominence: 1, confidence: 1 },
                { u: 0.363, kind: 'valley' as const, radius: 1, prominence: 1, confidence: 1 },
            ]);
            return {
                allRowFeatures,
                allRowTypedFeatures,
                totalRejected: 0,
            };
        });
        buildCDTOuterWallMock.mockImplementation((chains) => {
            capturedChains = chains.map(chain => ({
                kind: chain.kind,
                points: chain.points.map(point => ({ row: point.row, u: point.u })),
            }));
            throw OUTER_WALL_SENTINEL;
        });

        await expect(
            computer.compute({
                ...createParams(),
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            }),
        ).rejects.toBe(OUTER_WALL_SENTINEL);

        expect(capturedChains).toHaveLength(2);
        expect(capturedChains.map(chain => chain.kind).sort()).toEqual(['peak', 'valley']);
        expect(capturedChains.every(chain => chain.points.length === 20)).toBe(true);
        expect(capturedChains.every(chain =>
            chain.points.every(point => point.u === 0.355 || point.u === 0.363),
        )).toBe(true);
    });

    it('changes the real compute() mesh for a planner-supported overlap that later reuses owned-span super-cell machinery', async () => {
        const computer = createComputer();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;
        let sawOwnedSpanDiagnostic = false;

        detectAllRowFeaturesMock.mockImplementation((rowProbeData: Float32Array[]) => {
            const rowCount = rowProbeData.length;
            const band = Math.max(1, Math.floor(rowCount / 2));
            const allRowFeatures = Array.from({ length: rowCount }, (_, row) => {
                if (row === band) return [0.195, 0.245];
                if (row === band + 1) return [0.205, 0.255];
                return [];
            });
            const allRowTypedFeatures = Array.from({ length: rowCount }, (_, row) => {
                if (row === band) {
                    return [
                        { u: 0.195, kind: 'peak' as const, radius: 1, prominence: 1, confidence: 1 },
                        { u: 0.245, kind: 'valley' as const, radius: 1, prominence: 1, confidence: 1 },
                    ];
                }
                if (row === band + 1) {
                    return [
                        { u: 0.205, kind: 'peak' as const, radius: 1, prominence: 1, confidence: 1 },
                        { u: 0.255, kind: 'valley' as const, radius: 1, prominence: 1, confidence: 1 },
                    ];
                }
                return [];
            });
            return {
                allRowFeatures,
                allRowTypedFeatures,
                totalRejected: 0,
            };
        });
        filterLowConfidenceChainsMock.mockImplementation((chains) => chains);
        generateCDFAdaptivePositionsMock.mockImplementation(() => new Float32Array([0.0, 0.15, 0.2, 0.25, 0.3, 0.45]));

        const baseParams = createParams({
            targetTriangles: 500,
            pipelineConfig: {
                ...createParams().pipelineConfig,
                chainDirectedFlip: false,
                edgeFlip3D: false,
                chainStripOptimizer: false,
                boundaryDiagOpt: false,
                gpuSubdivision: false,
            },
        });

        try {
            const legacy = await computer.compute(baseParams);
            const plannedLogStart = logSpy.mock.calls.length;
            const planned = await computer.compute({
                ...baseParams,
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            });

            expect(legacy.mesh.indices.length).toBeGreaterThan(0);
            expect(planned.mesh.indices.length).toBeGreaterThan(0);
            expect(Array.from(planned.mesh.indices)).not.toEqual(Array.from(legacy.mesh.indices));
            const plannedMessages = logSpy.mock.calls
                .slice(plannedLogStart)
                .map(call => typeof call[0] === 'string' ? call[0] : '')
                .filter(Boolean);
            sawCorridorDiagnostic = plannedMessages.some(message =>
                message.includes('Corridor dry-run:') && message.includes('supported='),
            );
            sawOwnedSpanDiagnostic = plannedMessages.some(message =>
                message.includes('R37 Phantom vertices:') && /band-split owned spans: [1-9]\d*/.test(message),
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(sawCorridorDiagnostic).toBe(true);
        expect(sawOwnedSpanDiagnostic).toBe(true);
    });

    it('derives a corridor-supported overlap from real detection, linking, grid generation, and tessellation', async () => {
        const computer = createComputer(zeroInterceptionOverlapSurface);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;
        let sawOuterWallEmissionDiagnostic = false;

        const baseParams = createParams({
            targetTriangles: CAD_CLOSURE_TARGET_TRIANGLES,
            pipelineConfig: {
                ...createParams().pipelineConfig,
                numStrips: CAD_CLOSURE_NUM_STRIPS,
                curvatureSamples: CAD_CLOSURE_CURVATURE_SAMPLES,
                rowProbeSamples: CAD_CLOSURE_ROW_PROBE_SAMPLES,
                gpuResnap: false,
                chainDirectedFlip: false,
                edgeFlip3D: false,
                chainStripOptimizer: false,
                boundaryDiagOpt: false,
                gpuSubdivision: false,
            },
        });

        try {
            const legacy = await computer.compute(baseParams);
            const plannedLogStart = logSpy.mock.calls.length;
            const planned = await computer.compute({
                ...baseParams,
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                },
            });

            const chainDebug = getLastChainDebugData();
            const peakDebug = getLastPeakDebugData();
            const plannedMessages = logSpy.mock.calls
                .slice(plannedLogStart)
                .map(call => typeof call[0] === 'string' ? call[0] : '')
                .filter(Boolean);

            expect(peakDebug?.peakCount).toBeGreaterThan(0);
            expect(peakDebug?.valleyCount).toBeGreaterThan(0);
            expect(chainDebug?.chainCount).toBeGreaterThanOrEqual(CAD_CLOSURE_MIN_CHAIN_COUNT);
            expect(planned.pipelineDiagnostics?.chainCount).toBeGreaterThanOrEqual(CAD_CLOSURE_MIN_CHAIN_COUNT);
            expect(planned.pipelineDiagnostics?.chainPoints).toBeGreaterThan(CAD_CLOSURE_MIN_CHAIN_POINTS);
            expect(legacy.mesh.indices.length).toBeGreaterThan(0);
            expect(planned.mesh.indices.length).toBeGreaterThan(0);
            expect(Array.from(planned.mesh.indices)).not.toEqual(Array.from(legacy.mesh.indices));
            expect(planned.validationSummary?.degeneratesOk).toBe(true);

            sawCorridorDiagnostic = plannedMessages.some(message =>
                message.includes('Corridor dry-run:') && /supported=[1-9]\d*/.test(message),
            );
            sawOuterWallEmissionDiagnostic = plannedMessages.some(message =>
                message.includes('R35 Chain edges:') && /chain cells: [1-9]\d*/.test(message),
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(sawCorridorDiagnostic).toBe(true);
        expect(sawOuterWallEmissionDiagnostic).toBe(true);
    });

    it.fails('proves detection-driven corridor export is fully CAD-quality closed', async () => {
        const computer = createComputer(zeroInterceptionOverlapSurface);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        try {
            const plannedLogStart = logSpy.mock.calls.length;
            const planned = await computer.compute({
                ...createParams({
                    targetTriangles: CAD_CLOSURE_TARGET_TRIANGLES,
                    pipelineConfig: {
                        ...createParams().pipelineConfig,
                        numStrips: CAD_CLOSURE_NUM_STRIPS,
                        curvatureSamples: CAD_CLOSURE_CURVATURE_SAMPLES,
                        rowProbeSamples: CAD_CLOSURE_ROW_PROBE_SAMPLES,
                        gpuResnap: false,
                        chainDirectedFlip: false,
                        edgeFlip3D: false,
                        chainStripOptimizer: false,
                        boundaryDiagOpt: false,
                        gpuSubdivision: false,
                    },
                }),
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                    gpuFidelityCheck: true,
                    distortionGating: true,
                },
            });

            const chainDebug = getLastChainDebugData();
            const peakDebug = getLastPeakDebugData();
            const plannedMessages = logSpy.mock.calls
                .slice(plannedLogStart)
                .map(call => typeof call[0] === 'string' ? call[0] : '')
                .filter(Boolean);

            expect(peakDebug?.peakCount).toBeGreaterThan(0);
            expect(peakDebug?.valleyCount).toBeGreaterThan(0);
            expect(chainDebug?.chainCount).toBeGreaterThanOrEqual(CAD_CLOSURE_MIN_CHAIN_COUNT);
            expect(planned.pipelineDiagnostics?.chainPoints).toBeGreaterThan(CAD_CLOSURE_MIN_CHAIN_POINTS);
            expect(plannedMessages.some(message =>
                message.includes('Corridor dry-run:') && /supported=[1-9]\d*/.test(message),
            )).toBe(true);
            expectCadQualityClosure(planned);
        } finally {
            logSpy.mockRestore();
        }
    });

    it.fails('proves natural feature corridors use owned-span topology before CAD closure is accepted', async () => {
        const computer = createComputer(zeroInterceptionOverlapSurface);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        try {
            const plannedLogStart = logSpy.mock.calls.length;
            const planned = await computer.compute({
                ...createParams({
                    targetTriangles: CAD_CLOSURE_TARGET_TRIANGLES,
                    pipelineConfig: {
                        ...createParams().pipelineConfig,
                        numStrips: CAD_CLOSURE_NUM_STRIPS,
                        curvatureSamples: CAD_CLOSURE_CURVATURE_SAMPLES,
                        rowProbeSamples: CAD_CLOSURE_ROW_PROBE_SAMPLES,
                        gpuResnap: false,
                        chainDirectedFlip: false,
                        edgeFlip3D: false,
                        chainStripOptimizer: false,
                        boundaryDiagOpt: false,
                        gpuSubdivision: false,
                    },
                }),
                pipelineFeatureFlags: {
                    outerWallCorridorPlanning: true,
                    outerWallCorridorDiagnostics: true,
                    gpuFidelityCheck: true,
                    distortionGating: true,
                },
            });

            const plannedMessages = logSpy.mock.calls
                .slice(plannedLogStart)
                .map(call => typeof call[0] === 'string' ? call[0] : '')
                .filter(Boolean);

            expect.soft(plannedMessages.some(message =>
                message.includes('Corridor dry-run:') && /supported=[1-9]\d*/.test(message),
            )).toBe(true);
            expect.soft(plannedMessages.some(message =>
                message.includes('R35 Chain edges:') && /super-cells: [1-9]\d*/.test(message),
            )).toBe(true);
            expect.soft(plannedMessages.some(message =>
                message.includes('R37 Phantom vertices:') && /band-split owned spans: [1-9]\d*/.test(message),
            )).toBe(true);
            expectCadQualityClosure(planned);
        } finally {
            logSpy.mockRestore();
        }
    });
});
