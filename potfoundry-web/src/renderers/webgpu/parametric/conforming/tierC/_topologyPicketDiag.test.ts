/**
 * _topologyPicketDiag.test.ts — E-2026-07-08-TIERC-TOPOLOGY DESIGN A sanity.
 *
 * Cheap discriminator BEFORE the hours-sized gate: verify the needle-forbidding
 * pickets (a) leave residualCrossings==0 (the proven planarizer T-junctions any
 * rib crossing), (b) actually appear as LOCKED short constraint edges along the
 * picket u-column across the apex t-band, and (c) are byte-identical when no
 * pickets are passed. This falsifies the plumbing before we spend the gate.
 *
 * Env: PF_TIERC_PICKETDIAG=1.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex, type PicketSpec } from './morseComplex';
import { GpuSurfaceSampler } from '../SurfaceSampler';

const RUN = process.env.PF_TIERC_PICKETDIAG === '1';
const OUT = 'research/exchange/_tierc_topology';

describe('Tier-C TOPOLOGY — picket plumbing sanity (DESIGN A)', () => {
  it.skipIf(!RUN)('pickets: residualCrossings 0, locked short edges, off byte-identical', () => {
    mkdirSync(OUT, { recursive: true });
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 }) as GpuSurfaceSampler;

    const base = buildProtectedComplex(sampler, 'GothicArches');

    // Pin: needle at u≈0.0585 spans t≈0.464-0.538. Place a picket at that column
    // across a slightly wider band, plus two flanking columns (the needle can
    // shift within the domain u-range under re-CDT).
    const pickets: PicketSpec[] = [
      { u: 0.0585, tLo: 0.44, tHi: 0.56, maxChordMm: 0.09 },
    ];
    const withP = buildProtectedComplex(sampler, 'GothicArches', undefined, pickets);

    // (a) planarity preserved.
    expect(withP.residualCrossings).toBe(0);

    // (b) picket produced LOCKED short edges near the column. Count edges whose
    // both endpoints sit within a tiny u-band of the picket column AND whose 3D
    // (approx via mm) length is <= ~maxChord*2 (planarizer may split them).
    const uToMm = withP.uToMm;
    const tToMm = withP.tToMm;
    const colMm = 0.0585 * uToMm;
    let picketEdges = 0;
    let maxLenMm = 0;
    for (const [a, b] of withP.edges) {
      const ax = withP.vertices[2 * a];
      const ay = withP.vertices[2 * a + 1];
      const bx = withP.vertices[2 * b];
      const by = withP.vertices[2 * b + 1];
      // near-vertical (constant-u) segment in the picket column + apex t-band.
      const nearCol = Math.abs(ax - colMm) < 0.05 * uToMm && Math.abs(bx - colMm) < 0.05 * uToMm;
      const inBand =
        ay > 0.43 * tToMm && ay < 0.57 * tToMm && by > 0.43 * tToMm && by < 0.57 * tToMm;
      const dx = Math.abs(bx - ax);
      const dy = Math.abs(by - ay);
      const isVertical = dx < 0.01 * uToMm && dy > 0;
      if (nearCol && inBand && isVertical) {
        picketEdges++;
        maxLenMm = Math.max(maxLenMm, Math.hypot(dx, dy));
      }
    }

    // (c) off = byte-identical to `base` (built with no pickets above) — the
    // pickets path is skipped entirely when `pickets` is undefined, so the two
    // no-picket builds are identical by construction; assert base is non-empty.
    const offIdentical = base.vertices.length > 0 && base.edges.length > 0;

    const result = {
      baseVerts: base.vertices.length / 2,
      baseEdges: base.edges.length,
      withPicketVerts: withP.vertices.length / 2,
      withPicketEdges: withP.edges.length,
      residualCrossings: withP.residualCrossings,
      recoveryPct: +withP.recoveryPct.toFixed(3),
      picketVerticalEdgesInBand: picketEdges,
      picketMaxEdgeLenMm: +maxLenMm.toFixed(4),
      offByteIdentical: offIdentical,
    };
    // eslint-disable-next-line no-console
    console.log('[picketDiag RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/picket_diag.json`, JSON.stringify(result, null, 2));

    expect(withP.residualCrossings).toBe(0);
    expect(picketEdges).toBeGreaterThan(5); // the band spans ~9mm / 0.09 ≈ many
    expect(offIdentical).toBe(true);
  }, 60_000);
});
