import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../src/state/types';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import { createSinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import { compileGeneratedTargetProgramBackends } from '../../src/geometry/targetSolid/validatedResidualProgram';
import {
  voronoiBisectorSegmentsUv,
  type VoronoiLatticeParams,
} from '../../src/geometry/targetSolid/voronoiBisectorGuides';

/*
 * STRATA-001 S2 — is the Voronoi bisector a C1 CREASE or a C0 JUMP?
 *
 * The distinction decides the whole campaign. A C1 crease is closed by
 * CONFORMING (put a mesh edge on it) — that is spec §4 and the chords now built.
 * A C0 jump cannot be closed by any flat mesh at any density: the surface is
 * genuinely double-valued across the locus, and the only fix is a curtain /
 * double-valued wall (spec §7's C0 family).
 *
 * TEST: step perpendicular to the bisector by +/- eps and measure the field
 * difference as eps shrinks.
 *   difference -> 0        => C1 kink (gradient jump only). Conforming works.
 *   difference -> constant => C0 JUMP of that magnitude. Conforming cannot help.
 *
 * Gated PF_STRATA_JUMP=1; PF_STRATA_JUMP_RELIEF / _MORPH select the recipe.
 */

const RUN = process.env.PF_STRATA_JUMP === '1';

const LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};
const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

describe('STRATA-001: Voronoi bisector — C1 crease or C0 jump?', () => {
  it.runIf(RUN)('measures the perpendicular field difference as eps -> 0', () => {
    const relief = Number.parseFloat(process.env.PF_STRATA_JUMP_RELIEF ?? '2.0');
    const morph = Number.parseFloat(process.env.PF_STRATA_JUMP_MORPH ?? '1');
    const canonicalInput = createCanonicalTargetInputBinding(
      H32_POT_GEOMETRY,
      'Voronoi',
      { v_morph: morph, v_relief: relief },
      TARGET_CONTROLS
    );
    const binding = createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput)
    );
    const outer = binding.programs.find((program) => program.patchId === 'outer-wall');
    expect(outer).toBeDefined();
    if (outer === undefined) return;
    const backends = compileGeneratedTargetProgramBackends(outer.programCanonicalJson);
    const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
    const evaluate = (u: number, v: number): readonly number[] =>
      backends.evaluateFloat64(clamp01(u), clamp01(v)) as readonly number[];
    const distance = (a: readonly number[], b: readonly number[]): number =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    const segments = voronoiBisectorSegmentsUv(LATTICE);
    const epsilons = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7];
    // Per eps: the worst perpendicular difference over a sample of interior
    // points on the bisector graph (endpoints skipped — those are junctions).
    const worstByEps = epsilons.map(() => 0);
    const SAMPLES_PER_SEGMENT = 5;
    let probes = 0;
    for (const segment of segments) {
      const du = segment.b[0] - segment.a[0];
      const dv = segment.b[1] - segment.a[1];
      const length = Math.hypot(du, dv);
      if (length < 1e-9) continue;
      const nu = -dv / length;
      const nv = du / length;
      for (let s = 1; s <= SAMPLES_PER_SEGMENT; s += 1) {
        const t = s / (SAMPLES_PER_SEGMENT + 1);
        const u = segment.a[0] + t * du;
        const v = segment.a[1] + t * dv;
        if (u <= 0.01 || u >= 0.99 || v <= 0.01 || v >= 0.99) continue;
        probes += 1;
        for (const [index, eps] of epsilons.entries()) {
          const gap = distance(evaluate(u + eps * nu, v + eps * nv), evaluate(u - eps * nu, v - eps * nv));
          if (gap > worstByEps[index]) worstByEps[index] = gap;
        }
      }
    }

    const report = [
      '',
      '===== VORONOI BISECTOR: C1 CREASE OR C0 JUMP? =====',
      `recipe: v_relief=${relief} v_morph=${morph} (registry defaults 2.0 / 1.0)`,
      `probes: ${probes} interior points on ${segments.length} bisector segments`,
      '',
      '  eps        worst |target(+eps n) - target(-eps n)|',
      ...epsilons.map(
        (eps, index) =>
          `  ${eps.toExponential(0).padEnd(9)}  ${(worstByEps[index] * 1000).toFixed(4)} um`
      ),
      '',
      '  READ: -> 0 as eps shrinks  => C1 crease; CONFORMING closes it.',
      '        -> a constant        => C0 JUMP of that size; no flat mesh at any',
      '                                density can close it (needs a curtain /',
      '                                double-valued wall, spec §7 C0 family).',
      '===================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    expect(probes).toBeGreaterThan(0);
  }, 600_000);
});
