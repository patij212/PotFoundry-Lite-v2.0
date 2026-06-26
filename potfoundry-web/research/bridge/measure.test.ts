// potfoundry-web/research/bridge/measure.test.ts
import { describe, it, expect } from 'vitest';
import { liftUtToRadial, measureOracleMesh } from './measure';
import type { OracleOutput } from './exchange';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const grid = (n: number): OracleOutput => {
  const ut: number[] = [], idx: number[] = [];
  const nv = n + 1;
  for (let it = 0; it <= n; it++) for (let iu = 0; iu <= n; iu++) ut.push(iu / n, it / n);
  for (let it = 0; it < n; it++) for (let iu = 0; iu < n; iu++) {
    const a = it * nv + iu, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  return { engine: 'grid', config: {}, ut, indices: idx, engineMs: 0, engineVersion: 't' };
};

describe('measureOracleMesh', () => {
  const rA: AnalyticRadiusFn = () => 50; // cylinder
  it('vertices lifted onto the analytic surface read ~0 vertex deviation', () => {
    const row = measureOracleMesh(grid(24), rA, 120, { tolMm: 0.1, seamExclU: 0, denseN: 6 });
    expect(row.vertexMaxMm).toBeLessThan(1e-3);
    expect(row.chordMaxMm).toBeGreaterThanOrEqual(0);
    expect(row.tris).toBe(24 * 24 * 2);
  });
  it('a curved wall: finer mesh → lower chord', () => {
    const fluted: AnalyticRadiusFn = (th) => 50 + 3 * Math.cos(8 * th);
    const coarse = measureOracleMesh(grid(16), fluted, 120, { tolMm: 0.1, seamExclU: 0, denseN: 6 });
    const fine = measureOracleMesh(grid(64), fluted, 120, { tolMm: 0.1, seamExclU: 0, denseN: 6 });
    expect(fine.chordP99Mm).toBeLessThan(coarse.chordP99Mm);
  });
});
