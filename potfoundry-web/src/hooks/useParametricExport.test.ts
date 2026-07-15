/**
 * useParametricExport — format-selection routing tests (Plan Task 2.3)
 *
 * Verifies that exportSTL routes through downloadMesh with the chosen format
 * (3mf/obj) and falls back to binary STL when no format is requested.
 *
 * WebGPU is unavailable in jsdom, so the ParametricExportComputer and the
 * mesh-stat helpers are mocked; only the download-routing branch is exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
// computeResultRef lets a test override compute()'s resolved value (e.g. to
// simulate a validation failure) without touching the mock factory itself.
const { computeParamsSpy, computeResultRef } = vi.hoisted(() => ({
    computeParamsSpy: vi.fn(),
    computeResultRef: {
        current: null as null | { mesh: unknown; computeTimeMs: number; validationSummary: unknown },
    },
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
            return computeResultRef.current ?? { mesh: fakeMesh, computeTimeMs: 1, validationSummary: undefined };
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
import { useAppStore } from '../state';

const baselineStyle = {
    name: useAppStore.getState().style.name,
    opts: { ...useAppStore.getState().style.opts },
};

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

    it('appends .3mf when a bare filename is exported as 3MF', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL('my-pot', undefined, { format: '3mf' });
        });

        expect(downloadMeshMock.mock.calls[0][1]).toBe('my-pot.3mf');
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

    it('appends .stl when a bare filename is exported as STL', async () => {
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.exportSTL('my-pot', undefined, { format: 'stl' });
        });

        expect(downloadSTLMock.mock.calls[0][1]).toBe('my-pot.stl');
    });
});

// E-2026-07-09-EXPORT-PERF: exportSTL used to return void and silently no-op
// when generateMesh's validation guard returned null (see generateMesh's
// `Export validation failed` throw, caught internally). That swallowed the
// failure past exportSTL's caller (ExportFooter.fire) with no way to detect
// it short of re-deriving the reason from the pipeline. exportSTL now
// resolves to a success boolean so a caller can skip billing/UI-success side
// effects for a no-op export.
describe('useParametricExport.exportSTL success signalling', () => {
    beforeEach(() => {
        computeResultRef.current = null;
        downloadMeshMock.mockClear();
        downloadSTLMock.mockClear();
    });

    // computeResultRef is module-scoped mutable mock state (see vi.hoisted
    // above) — reset it on the way out too, or a failure override set here
    // leaks into sibling describe blocks that run afterward in file order.
    afterEach(() => {
        computeResultRef.current = null;
    });

    it('resolves true and downloads when generation succeeds', async () => {
        const { result } = await renderReadyHook();

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.exportSTL('pot.stl');
        });

        expect(ok).toBe(true);
        expect(downloadSTLMock).toHaveBeenCalledTimes(1);
    });

    it('resolves false and downloads nothing when export validation fails', async () => {
        computeResultRef.current = {
            mesh: fakeMesh,
            computeTimeMs: 1,
            validationSummary: {
                valid: false,
                manifoldOk: true,
                degeneratesOk: true,
                normalsOk: true,
                triangleQualityOk: false,
                warnings: ['409 sliver triangle(s) (aspect > 100, finite-area — print-usable, non-blocking)'],
                minAngleDeg: 0.02,
                maxAspectRatio: 483.1,
            },
        };
        const { result } = await renderReadyHook();

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.exportSTL('pot.stl');
        });

        expect(ok).toBe(false);
        expect(downloadSTLMock).not.toHaveBeenCalled();
        expect(downloadMeshMock).not.toHaveBeenCalled();
        // The specific reason survives into progress.message — the hook's
        // established channel for surfacing a failure to a rendering caller.
        expect(result.current.progress.status).toBe('error');
        expect(result.current.progress.message).toMatch(/sliver/i);
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

describe('useParametricExport strict style runtime boundary', () => {
    beforeEach(() => {
        computeParamsSpy.mockClear();
    });

    afterEach(() => {
        act(() => {
            useAppStore.setState({
                style: { name: baselineStyle.name, opts: { ...baselineStyle.opts } },
            });
        });
        vi.restoreAllMocks();
    });

    it('forwards one validated payload with wire and CPU evaluator aliases', async () => {
        act(() => {
            useAppStore.setState({
                style: {
                    name: 'WaveInterference',
                    opts: {
                        wi_feature_count: 2.25,
                        wi_relief_depth: 7.5,
                        wi_phase: 0.375,
                    },
                },
            });
        });
        const { result } = await renderReadyHook();

        await act(async () => {
            await result.current.generateMesh();
        });

        const params = computeParamsSpy.mock.calls[0][0] as {
            styleId: string;
            styleOpts: Record<string, number>;
        };
        expect(params.styleId).toBe('WaveInterference');
        expect(params.styleOpts.wi_feature_count).toBe(2.25);
        expect(params.styleOpts.wiFeatureCount).toBe(2.25);
        expect(params.styleOpts.wi_relief_depth).toBe(7.5);
        expect(params.styleOpts.wiReliefDepth).toBe(7.5);
        expect(params.styleOpts.wi_phase).toBe(0.375);
        expect(params.styleOpts.wiPhase).toBe(0.375);
    });

    it('rejects an out-of-range control before invoking the mesher', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        act(() => {
            useAppStore.setState({
                style: {
                    name: 'WaveInterference',
                    opts: { wi_feature_count: 999 },
                },
            });
        });
        const { result } = await renderReadyHook();

        let mesh: unknown;
        await act(async () => {
            mesh = await result.current.generateMesh();
        });

        expect(mesh).toBeNull();
        expect(computeParamsSpy).not.toHaveBeenCalled();
        expect(result.current.progress.status).toBe('error');
        expect(result.current.progress.message).toMatch(/outside \[0, 3\]/);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('rejects an unknown style during shader initialization instead of compiling style zero', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        act(() => {
            useAppStore.setState({ style: { name: 'NotAStyle', opts: {} } });
        });

        const view = renderHook(() => useParametricExport());
        await waitFor(() => expect(errorSpy).toHaveBeenCalled());

        expect(view.result.current.isAvailable).toBe(false);
        expect(errorSpy.mock.calls.flat().map(String).join(' ')).toContain(
            "Unknown style 'NotAStyle'; shader initialization never falls back"
        );
    });
});
