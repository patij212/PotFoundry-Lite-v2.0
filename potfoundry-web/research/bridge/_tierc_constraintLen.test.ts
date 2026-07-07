// _tierc_constraintLen.test.ts — DEV-ONLY (PF_TIERC_DIAG=1). Confirms the
// full-gate stall mechanism BEFORE a multi-hour run: measure the 3D LENGTH of
// the protected complex's constraint edges. If p50 ≫ 0.1mm, crest-adjacent
// facets are floored by the long locked edge (cdt2d can't split it) ⇒ the
// constraint-subdivision fix is indicated. The research kernel's analytic
// crest chains were ~0.1mm; the detector's are fine-cell pitch (~2.4mm).
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';

describe('tierC diag — constraint edge 3D lengths', () => {
  it.skipIf(process.env.PF_TIERC_DIAG !== '1')('Gothic constraint lengths', () => {
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const { uToMm, tToMm } = complex;
    const pos = (u: number, t: number): [number, number, number] =>
      sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
    const lens: number[] = [];
    for (const [a, b] of complex.edges) {
      const A = pos(complex.vertices[2 * a] / uToMm, complex.vertices[2 * a + 1] / tToMm);
      const B = pos(complex.vertices[2 * b] / uToMm, complex.vertices[2 * b + 1] / tToMm);
      lens.push(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]));
    }
    lens.sort((x, y) => x - y);
    const pc = (q: number): number => lens.length ? lens[Math.min(lens.length - 1, Math.floor(q * lens.length))] : -1;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      nConstraintEdges: lens.length,
      lenP50mm: +pc(0.5).toFixed(4),
      lenP90mm: +pc(0.9).toFixed(4),
      lenMaxMm: lens.length ? +lens[lens.length - 1].toFixed(4) : -1,
      // chord sag of a p90 edge on a rib of curvature ~κ (worst-facet floor ≈ L²κ/8):
      note: 'if lenP50 >> 0.1mm the long locked edge floors crest-adjacent facets',
    }));
    expect(lens.length).toBeGreaterThan(0);
  }, 10 * 60 * 1000);
});
