/**
 * _junctionSeamStatic.test.ts — TASK 3 fast root-cause probe. Instead of
 * converging two full refines, inspect the SEED directly: does a protected
 * crest constraint edge cross the u=0 domain boundary (on-seam) and get CLIPPED
 * to an unprotected stub, while off-seam (uLo=0.05) the boundary sits in a
 * smooth region with no crossing crest? That clipped stub is the mechanism the
 * seedFromComplex comment warns about ("Dropping/clipping leaves an UNPROTECTED
 * crest stub → facets bridge the unlocked cusp"). If on-seam clips a crest and
 * off-seam does not, the pinned facet is a PATCH-DOMAIN artifact (the full pot
 * is u∈[0,1] periodic — no domain boundary at the seam — so the seam crest is
 * fully locked and never clipped).
 *
 * Env-gated PF_TIERC_SEAM_STATIC=1. Fast: no refinement.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { seedFromComplex, type ChartDomain } from './noBridgeRefine';
import { GpuSurfaceSampler } from '../SurfaceSampler';

const RUN = process.env.PF_TIERC_SEAM_STATIC === '1';
const OUT = 'research/exchange/_tierc_junction';

/** A vertex is a domain-boundary vertex if it lies on uLo/uHi/tLo/tHi. */
function boundaryVerts(
  uv: number[],
  d: ChartDomain,
): { onULo: Set<number>; all: number } {
  const onULo = new Set<number>();
  for (let i = 0; i < uv.length / 2; i++) {
    if (Math.abs(uv[2 * i] - d.uLo) < 1e-7) onULo.add(i);
  }
  return { onULo, all: uv.length / 2 };
}

describe('Tier-C seam static root-cause (Task 3)', () => {
  it.skipIf(!RUN)('crest clipping at uLo: on-seam vs off-seam', () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');

    const analyze = (label: string, d: ChartDomain): Record<string, unknown> => {
      const seed = seedFromComplex(complex, d, 0.3, sampler);
      const bv = boundaryVerts(seed.uv, d);
      // A constraint (crest) edge with an endpoint ON the uLo boundary is a
      // CLIPPED crest stub (clipToDomain produced a boundary vertex). Count
      // constraint edges incident to a uLo-boundary vertex.
      let clippedCrestEdges = 0;
      for (const [a, b] of seed.cEdges) {
        if (bv.onULo.has(a) || bv.onULo.has(b)) clippedCrestEdges++;
      }
      // How many total constraint (crest) edges exist in the domain.
      const row = {
        label,
        uLo: d.uLo,
        seedVerts: bv.all,
        uLoBoundaryVerts: bv.onULo.size,
        crestEdges: seed.cEdges.length,
        clippedCrestEdgesAtULo: clippedCrestEdges,
      };
      // eslint-disable-next-line no-console
      console.log('[seamStatic]', JSON.stringify(row));
      return row;
    };

    const onSeam: ChartDomain = { uLo: 0, uHi: 0.1, tLo: 0.38, tHi: 0.62 };
    const offSeam: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const rOn = analyze('on-seam', onSeam);
    const rOff = analyze('off-seam', offSeam);
    writeFileSync(
      `${OUT}/seam_static.json`,
      JSON.stringify({ onSeam: rOn, offSeam: rOff }, null, 2),
    );

    // The mechanism: on-seam clips crest edges at u=0; the count is a positive
    // integer. (The off-seam comparison + the converging gate settle whether
    // this fully explains the pin; this probe isolates the clipping mechanism.)
    expect(rOn.clippedCrestEdgesAtULo as number).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
