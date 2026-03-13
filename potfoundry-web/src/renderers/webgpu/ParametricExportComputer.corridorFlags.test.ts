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
import type { ParametricExportParams } from './parametric/types';

const OUTER_WALL_SENTINEL = new Error('outer-wall-sentinel');
const CHAIN_STRIP_SENTINEL = new Error('chain-strip-sentinel');
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

import { ParametricExportComputer } from './ParametricExportComputer';

type FakeBuffer = {
    readonly label: string;
    readonly destroy: ReturnType<typeof vi.fn>;
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

function createComputer(): ParametricExportComputer {
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
            const u = vertices[i];
            const t = vertices[i + 1];
            const theta = u * Math.PI * 2;
            const radius = 30 + 4 * Math.cos(theta * 4) + t * 2;
            positions[i] = radius * Math.cos(theta);
            positions[i + 1] = radius * Math.sin(theta);
            positions[i + 2] = t * 120;
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
        };
        expect(outerWallOptions).toEqual({
            corridorPlanning: false,
            corridorDiagnostics: false,
        });
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
        };
        expect(outerWallOptions).toEqual({
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
                        { row: band + 1, u: 0.34 },
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

    it('changes max-strength SuperformulaBlossom export when corridor-supported spans reuse owned super-cell machinery', async () => {
        const computer = createComputer();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let sawCorridorDiagnostic = false;
        let sawOwnedSpanDiagnostic = false;

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
                message.includes('Corridor dry-run:') && message.includes('supported='),
            );
            sawOwnedSpanDiagnostic = plannedMessages.some(message =>
                (message.includes('R35 Chain edges:') && /super-cells: [1-9]\d*/.test(message)) ||
                (message.includes('R37 Phantom vertices:') && /band-split owned spans: [1-9]\d*/.test(message)),
            );
        } finally {
            logSpy.mockRestore();
        }

        expect(sawCorridorDiagnostic).toBe(true);
        expect(sawOwnedSpanDiagnostic).toBe(true);
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
});