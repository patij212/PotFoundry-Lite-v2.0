import { describe, expect, it } from 'vitest';
import { createFidelityApi, buildRAFromStyleState } from './windowHook';
import type { MeshData } from '../geometry/types';

describe('buildRAFromStyleState', () => {
  it('builds a finite analytic radius closure for a smooth style at production dims', () => {
    const rA = buildRAFromStyleState('HarmonicRipple', {
      opts: {},
      H: 120,
      Rt: 70,
      Rb: 45,
      expn: 1.1,
    });
    const r = rA(0, 60);
    expect(Number.isFinite(r)).toBe(true);
    // Sane band for a 45..70mm radius pot at mid-height (relief is a small fraction).
    expect(r).toBeGreaterThan(30);
    expect(r).toBeLessThan(90);
  });
});

describe('diagnoseExportTruth', () => {
  it('reports watertight + real download gate, and honest NaN fidelity when the (u,t) stash is absent', async () => {
    (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle = 'ExportTruthProbe';
    // An open 2-triangle quad (y=0 plane): the closed check MUST fail (4 boundary edges),
    // so the real production download gate returns ok=false — exactly the signal the audit
    // needs to trust (a non-watertight emitter mesh would block a user's export).
    const mesh: MeshData = {
      vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10, 10, 0, 10]),
      indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
      vertexCount: 4,
      triangleCount: 2,
    } as MeshData;
    const api = createFidelityApi({
      setStyle: () => {},
      setDimensions: () => {},
      setStyleParams: () => {},
      isAvailable: () => true,
      isReferenceAvailable: () => true,
      generateReference: async () => null,
      generateMesh: async () => mesh,
    });

    const r = await api.diagnoseExportTruth({ targetTriangles: 100 });

    expect(r.styleId).toBe('ExportTruthProbe');
    expect(r.triangleCount).toBe(2);
    expect(r.vertexCount).toBe(4);
    // Fidelity is honestly NaN (no ut stash / no getStyleState) — never a fake 0.
    expect(Number.isNaN(r.maxMm)).toBe(true);
    expect(r.referenceTrusted).toBe(false);
    // Topology + the REAL exportValidation gate are computed on the mesh.
    expect(r.boundaryEdges).toBeGreaterThan(0);
    expect(typeof r.downloadOk).toBe('boolean');
    expect(Array.isArray(r.downloadErrors)).toBe(true);
    expect(r.downloadOk).toBe(false); // an open patch is not export-ready
  });
});
