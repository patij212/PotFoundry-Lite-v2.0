// _kernel_noop.test.ts — DEV-ONLY (env PF_NOOP=1). Fingerprints DEFAULT kernel output to prove
// the injectedPoints option is byte-identical when absent. Run BEFORE and AFTER the kernel edit.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OPTS = { tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 200_000, splitThresh: 1.5, optimizeSweeps: 2 };

describe('kernel no-op fingerprint', () => {
  it.skipIf(!process.env.PF_NOOP)('fingerprint default GothicArches', () => {
    const rA = buildRadiusFn('GothicArches' as StyleId, {}, DIMS);
    const m = buildInhouseMetricMesh(rA, DIMS.H, OPTS);
    const n = m.ut.length;
    const head = m.ut.slice(0, 6).map(x => x.toFixed(12)).join(',');
    const tail = m.ut.slice(n - 6).map(x => x.toFixed(12)).join(',');
    let s = 0; for (let i = 0; i < m.indices.length; i++) s = (s * 31 + m.indices[i]) >>> 0;
    // eslint-disable-next-line no-console
    console.log('FINGERPRINT ' + JSON.stringify({ tris: m.indices.length / 3, pts: m.ut.length / 2, rounds: m.rounds, head, tail, idxHash: s }));
    expect(m.indices.length).toBeGreaterThan(0);
  }, 10 * 60 * 1000);
});
