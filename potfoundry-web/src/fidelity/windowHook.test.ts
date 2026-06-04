import { describe, expect, it } from 'vitest';
import { createFidelityApi } from './windowHook';

describe('createFidelityApi diagnostics', () => {
  it('exposes worst-triangle quality diagnostics for the generated mesh', async () => {
    (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle = 'QualityProbe';
    const api = createFidelityApi({
      setStyle: () => {},
      isAvailable: () => true,
      isReferenceAvailable: () => true,
      generateReference: async () => null,
      generateMesh: async () => ({
        vertices: new Float32Array([
          0, 0, 0,
          1, 0, 0,
          0.5, Math.sqrt(3) / 2, 0,
          0, 0, 1,
          100, 0, 1,
          50, 0.05, 1,
        ]),
        indices: new Uint32Array([
          0, 1, 2,
          3, 4, 5,
        ]),
        vertexCount: 6,
        triangleCount: 2,
      }),
    });

    const out = await api.diagnoseQuality({ targetTriangles: 500_000, sampleLimit: 1 });

    expect(out.styleId).toBe('QualityProbe');
    expect(out.worst).toHaveLength(1);
    expect(out.worst[0].triangleIndex).toBe(1);
    expect(out.worst[0].indices).toEqual([3, 4, 5]);
  });
});
