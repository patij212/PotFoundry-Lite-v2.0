/**
 * useParametricExport — format-selection routing tests (Plan Task 2.3)
 *
 * Verifies that exportSTL routes through downloadMesh with the chosen format
 * (3mf/obj) and falls back to binary STL when no format is requested.
 *
 * WebGPU is unavailable in jsdom, so the ParametricExportComputer and the
 * mesh-stat helpers are mocked; only the download-routing branch is exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mock the heavy GPU computer so generateMesh() can produce a mesh ----
const fakeMesh = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    triangleCount: 1,
};

// Captures every params object passed to compute() so tests can pin the
// budget/profile plumbing (what the hook actually forwards to the pipeline).
const { computeParamsSpy } = vi.hoisted(() => ({
    computeParamsSpy: vi.fn(),
}));

vi.mock('../renderers/webgpu/ParametricExportComputer', () => {
    class FakeParametricExportComputer {
        constructor(_device: unknown) {}
        async init(_src: string): Promise<void> {}
        isReady(): boolean {
            return true;
        }
        async compute(params: unknown) {
            computeParamsSpy(params);
            return { mesh: fakeMesh, computeTimeMs: 1, validationSummary: undefined };
        }
        destroy(): void {}
    }
    return {
        ParametricExportComputer: FakeParametricExportComputer,
        getLastChainDebugData: () => null,
        getLastPeakDebugData: () => null,
    };
});

// ---- Mock geometry so download* are spies; keep stat helpers cheap ----
const { downloadMeshMock, downloadSTLMock } = vi.hoisted(() => ({
    downloadMeshMock: vi.fn(async () => {}),
    downloadSTLMock: vi.fn(() => {}),
}));

vi.mock('../geometry', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../geometry')>();
    return {
        ...actual,
        downloadMesh: downloadMeshMock,
        downloadSTL: downloadSTLMock,
        calculateMeshVolume: () => 1000,
        calculateMeshSurfaceArea: () => 100,
        estimateSTLSize: () => 84,
        formatFileSize: () => '84 B',
    };
});

import { useParametricExport } from './useParametricExport';

async function renderReadyHook() {
    const view = renderHook(() => useParametricExport());
    await waitFor(() => expect(view.result.current.isAvailable).toBe(true));
    return view;
}

describe('useParametricExport.exportSTL format routing', () => {
    beforeEach(() => {
        downloadMeshMock.mockClear();
        downloadSTLMock.mockClear();
    });

    it('routes 3mf through downloadMesh with { format: "3mf" }', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL('pot.3mf', undefined, { format: '3mf' });
        });

        expect(downloadMeshMock).toHaveBeenCalledTimes(1);
        const [, , opts] = downloadMeshMock.mock.calls[0];
        expect(opts).toMatchObject({ format: '3mf' });
        expect(downloadSTLMock).not.toHaveBeenCalled();
    });

    it('forwards colors for 3mf through downloadMesh', async () => {
        const { result } = await renderReadyHook();

        const colors = { primaryColor: '#111', midColor: '#222', secondaryColor: '#333' };
        await act(async () => {
            await result.current.exportSTL('pot.3mf', undefined, { format: '3mf', colors });
        });

        const [, , opts] = downloadMeshMock.mock.calls[0];
        expect(opts).toMatchObject({ format: '3mf', colors });
    });

    it('routes obj through downloadMesh with { format: "obj" }', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL('pot.obj', undefined, { format: 'obj' });
        });

        const [, , opts] = downloadMeshMock.mock.calls[0];
        expect(opts).toMatchObject({ format: 'obj' });
        expect(downloadSTLMock).not.toHaveBeenCalled();
    });

    it('defaults to binary STL (downloadSTL) when no format is requested', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL();
        });

        expect(downloadSTLMock).toHaveBeenCalledTimes(1);
        const [, , opts] = downloadSTLMock.mock.calls[0];
        expect(opts).toMatchObject({ binary: true });
        expect(downloadMeshMock).not.toHaveBeenCalled();
    });
});

describe('useParametricExport budget/profile plumbing', () => {
    beforeEach(() => {
        computeParamsSpy.mockClear();
    });

    it('generateMesh without a target leaves targetTriangles UNDEFINED (profile budget applies)', async () => {
        // Quality re-baseline 2026-06: the old `?? 2_000_000` fallback silently
        // overrode the profile's maxTriangleBudget for every button that did
        // not pass an explicit target. Undefined must flow through so
        // resolveTriangleBudget picks the profile budget (cap semantics).
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.generateMesh();
        });

        expect(computeParamsSpy).toHaveBeenCalledTimes(1);
        const params = computeParamsSpy.mock.calls[0][0] as {
            targetTriangles?: number;
            qualityProfile?: string;
        };
        expect(params.targetTriangles).toBeUndefined();
        // No profile override either — the computer resolves the unified
        // 'high' default (pinned in QualityProfiles.test.ts).
        expect(params.qualityProfile).toBeUndefined();
    });

    it('generateMesh forwards an explicit target unchanged', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.generateMesh(750_000);
        });

        const params = computeParamsSpy.mock.calls[0][0] as { targetTriangles?: number };
        expect(params.targetTriangles).toBe(750_000);
    });

    it('exportSTL forwards options.qualityProfile to the pipeline', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL(undefined, undefined, { qualityProfile: 'ultra' });
        });

        const params = computeParamsSpy.mock.calls[0][0] as {
            targetTriangles?: number;
            qualityProfile?: string;
        };
        expect(params.qualityProfile).toBe('ultra');
        expect(params.targetTriangles).toBeUndefined();
    });

    it('exportSTL forwards options.toleranceOverrides into compute params (quick-path slider completion)', async () => {
        // Blueprint quick win QW2: the quick exportSTL route previously
        // forwarded ONLY qualityProfile — an explicit epsPosMm override (the
        // dialog's surface-error slider) was silently dropped on this path
        // even after the 88c40c1 conforming-sizing fix.
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL(undefined, undefined, {
                qualityProfile: 'standard',
                toleranceOverrides: { epsPosMm: 0.02 },
            });
        });

        const params = computeParamsSpy.mock.calls[0][0] as {
            qualityProfile?: string;
            toleranceOverrides?: { epsPosMm?: number };
        };
        expect(params.qualityProfile).toBe('standard');
        expect(params.toleranceOverrides).toEqual({ epsPosMm: 0.02 });
    });

    it('exportSTL forwards toleranceOverrides without a qualityProfile (override-only export)', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL(undefined, undefined, {
                toleranceOverrides: { epsPosMm: 0.04, epsNormalDeg: 3 },
            });
        });

        const params = computeParamsSpy.mock.calls[0][0] as {
            qualityProfile?: string;
            toleranceOverrides?: { epsPosMm?: number; epsNormalDeg?: number };
        };
        expect(params.qualityProfile).toBeUndefined();
        expect(params.toleranceOverrides).toEqual({ epsPosMm: 0.04, epsNormalDeg: 3 });
    });
});
