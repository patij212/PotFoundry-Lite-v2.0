import { describe, it, expect } from 'vitest';
import {
  buildPreviewEvalIndexBuffers,
  FLAG_CAP_UP,
  FLAG_CAP_DOWN,
  FLAG_INNER,
} from './previewEvalIndex';

const counts = { cellsX: 8, cellsOuterY: 3, innerY: 2, bottomRings: 2, rimRings: 1 };
const segY = [3, 2, 2, 2, 1, 2]; // outer, inner, bottom-top, bottom-under, rim, drain
const wrap = (x: number) => { let w = x % 1; if (w < 0) w += 1; return w; };

describe('buildPreviewEvalIndexBuffers', () => {
  const r = buildPreviewEvalIndexBuffers(counts);

  it('vertexCount = sum(cellsX * segY) * 6, arrays sized to match', () => {
    const cells = segY.reduce((a, y) => a + counts.cellsX * y, 0);
    expect(r.vertexCount).toBe(cells * 6);
    expect(r.seg.length).toBe(r.vertexCount);
    expect(r.uv.length).toBe(r.vertexCount * 2);
    expect(r.nbr.length).toBe(r.vertexCount * 6);
  });

  it('segments appear in order with the right vertex spans', () => {
    let base = 0;
    for (let s = 0; s < 6; s++) {
      const span = counts.cellsX * segY[s] * 6;
      expect(r.seg[base]).toBe(s);
      expect(r.seg[base + span - 1]).toBe(s);
      base += span;
    }
  });

  it('flags encode surface_normal special-casing per segment', () => {
    for (let i = 0; i < r.vertexCount; i++) {
      const seg = r.seg[i];
      const flags = r.nbr[i * 6 + 4];
      if (seg === 1) expect(flags & FLAG_INNER).toBe(FLAG_INNER);
      else if (seg === 2 || seg === 4) expect(flags & FLAG_CAP_UP).toBe(FLAG_CAP_UP);
      else if (seg === 3) expect(flags & FLAG_CAP_DOWN).toBe(FLAG_CAP_DOWN);
      else expect(flags).toBe(0); // seg 0, 5 => finite diff
    }
  });

  it('neighbour indices sit on the central-difference stencil (u wraps, v clamps)', () => {
    const du = 1 / counts.cellsX;
    for (let i = 0; i < r.vertexCount; i++) {
      const seg = r.seg[i];
      if (seg !== 0 && seg !== 5) continue; // caps short-circuit in the shader
      const dv = 1 / segY[seg];
      const u = r.uv[i * 2];
      const v = r.uv[i * 2 + 1];
      const iL = r.nbr[i * 6 + 0];
      const iR = r.nbr[i * 6 + 1];
      const iD = r.nbr[i * 6 + 2];
      const iU = r.nbr[i * 6 + 3];

      // right / left: u +/- du (periodic), same row
      expect(wrap(r.uv[iR * 2])).toBeCloseTo(wrap(u + du), 5);
      expect(r.uv[iR * 2 + 1]).toBeCloseTo(v, 5);
      expect(wrap(r.uv[iL * 2])).toBeCloseTo(wrap(u - du), 5);
      expect(r.uv[iL * 2 + 1]).toBeCloseTo(v, 5);

      // up / down: v +/- dv clamped to [0,1], same column
      expect(r.uv[iU * 2 + 1]).toBeCloseTo(Math.min(v + dv, 1), 5);
      expect(r.uv[iD * 2 + 1]).toBeCloseTo(Math.max(v - dv, 0), 5);
      expect(wrap(r.uv[iU * 2])).toBeCloseTo(wrap(u), 5);
      expect(wrap(r.uv[iD * 2])).toBeCloseTo(wrap(u), 5);
    }
  });

  it('all neighbour indices are in range', () => {
    for (let i = 0; i < r.nbr.length; i += 6) {
      for (let k = 0; k < 4; k++) {
        expect(r.nbr[i + k]).toBeGreaterThanOrEqual(0);
        expect(r.nbr[i + k]).toBeLessThan(r.vertexCount);
      }
    }
  });
});
