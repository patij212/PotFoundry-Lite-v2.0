import { describe, it, expect } from 'vitest';
import { meshHash } from './metrics';

describe('meshHash — FNV-1a dual-lane mesh fingerprint', () => {
  const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const idx = new Uint32Array([0, 1, 2]);

  it('is deterministic', () => {
    const a = meshHash(verts, idx);
    const b = meshHash(new Float32Array(verts), new Uint32Array(idx));
    expect(a.vertexHash).toBe(b.vertexHash);
    expect(a.indexHash).toBe(b.indexHash);
    expect(a.vertexHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when a single float changes by one ULP-scale step', () => {
    const v2 = new Float32Array(verts);
    v2[4] = v2[4] + 1e-7;
    expect(meshHash(v2, idx).vertexHash).not.toBe(meshHash(verts, idx).vertexHash);
    expect(meshHash(v2, idx).indexHash).toBe(meshHash(verts, idx).indexHash);
  });

  it('changes when connectivity changes', () => {
    const i2 = new Uint32Array([0, 2, 1]);
    expect(meshHash(verts, i2).indexHash).not.toBe(meshHash(verts, idx).indexHash);
  });
});
