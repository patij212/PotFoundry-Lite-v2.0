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

vi.mock('../renderers/webgpu/ParametricExportComputer', () => {
    class FakeParametricExportComputer {
        constructor(_device: unknown) {}
        async init(_src: string): Promise<void> {}
        isReady(): boolean {
            return true;
        }
        async compute(_params: unknown) {
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
