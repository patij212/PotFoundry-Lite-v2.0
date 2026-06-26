// potfoundry-web/research/bridge/measure.ts
import { perpendicular3DDeviation, type AnalyticRadiusFn, type AnalyticDevOpts } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { OracleOutput } from './exchange';

const TAU = 2 * Math.PI;

export interface ScoreRow {
  engine: string; tris: number; chordP99Mm: number; chordMaxMm: number;
  vertexMaxMm: number; pctUnder20deg: number; minAngleDeg: number; engineMs: number;
}

export function liftUtToRadial(ut: number[], rA: AnalyticRadiusFn, H: number):
  { vertices: Float32Array; utFlat: Float32Array } {
  const n = ut.length / 2;
  const v = new Float32Array(n * 3), uf = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = ut[2 * i], t = ut[2 * i + 1];
    const th = TAU * u, z = t * H, r = rA(th, z);
    v[3 * i] = r * Math.cos(th); v[3 * i + 1] = r * Math.sin(th); v[3 * i + 2] = z;
    uf[3 * i] = u; uf[3 * i + 1] = t; uf[3 * i + 2] = 0;
  }
  return { vertices: v, utFlat: uf };
}

export function measureOracleMesh(
  out: OracleOutput, rA: AnalyticRadiusFn, H: number, opts: Partial<AnalyticDevOpts>,
): ScoreRow {
  const { vertices, utFlat } = liftUtToRadial(out.ut, rA, H);
  const indices = Uint32Array.from(out.indices);
  const full: AnalyticDevOpts = { H, tolMm: opts.tolMm ?? 0.1, seamExclU: opts.seamExclU ?? 0,
    denseN: opts.denseN ?? 8, ...opts };
  const dev = perpendicular3DDeviation({ vertices, indices }, utFlat, rA, full);
  const q = triangleQualityDistribution({ vertices, indices });
  return {
    engine: out.engine, tris: indices.length / 3,
    chordP99Mm: dev.p99DevMm, chordMaxMm: dev.chordMaxMm, vertexMaxMm: dev.vertexMaxMm,
    pctUnder20deg: q.pctBelow20, minAngleDeg: q.minAngleDeg,
    engineMs: out.engineMs,
  };
}
