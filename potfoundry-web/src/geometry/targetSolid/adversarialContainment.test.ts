import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  certifyCompleteMappedArtifactGeometry,
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type CompleteMappedGeometryTargetBinding,
  type MappedPatchProofJob,
} from './completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import {
  FinalStlPartialCertificationError,
  proveFinalStlMappedGeometryAndStructure,
} from './finalStlPartialCertification';
import { assessProofSessionStructuralIntegrity } from './proofSessionStructuralIntegrity';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import {
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
  type AnnularSolidReferenceTessellationOptions,
} from './annularSolidReferenceTessellation';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

// Containment #4 (audit 9bec055d): each test below CONSTRUCTS one of the
// failure modes the old sampled/percentile export rulers admitted, and pins
// that the certification chain refuses it. Every adversarial case first shows
// the untouched artifact PASSING at the same budget, so the refusal is
// attributable to the attack alone, never to fixture slack.

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
const SMALL_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 40,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
const GENTLE_HARMONIC_RIPPLE = Object.freeze({
  hr_petal_amp: 0.01,
  hr_ripple_amp: 0,
  hr_bell: 0,
});
// Cheap always-on grid: enough stations that the gentle pot passes a 100 um
// geometry budget with margin, small enough to build in a few seconds.
const CHEAP_DIVISIONS: AnnularSolidReferenceTessellationOptions = Object.freeze({
  angularDivisionsLog2: 7,
  verticalDivisionsLog2ByPatch: Object.freeze({
    'outer-wall': 3,
    'inner-wall': 3,
    'top-rim': 2,
    'bottom-top': 3,
    'bottom-under': 3,
    'drain-wall': 1,
  }),
});
// The G2-certified small-pot grid (see annularSolidReferenceTessellation.test.ts)
// used by the gated single-vertex case at the real 9.5 um geometric budget.
const CERTIFIED_DIVISIONS: AnnularSolidReferenceTessellationOptions = Object.freeze({
  angularDivisionsLog2: 8,
  verticalDivisionsLog2ByPatch: Object.freeze({
    'outer-wall': 3,
    'inner-wall': 3,
    'top-rim': 3,
    'bottom-top': 4,
    'bottom-under': 4,
    'drain-wall': 0,
  }),
});

interface Fixture {
  readonly binding: SinglePatchAnnularRadialSolidTargetBinding;
  readonly canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
  readonly tessellation: AnnularSolidReferenceTessellation;
  readonly target: CompleteMappedGeometryTargetBinding;
  readonly jobs: readonly MappedPatchProofJob[];
}

function jobsFor(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  tessellation: AnnularSolidReferenceTessellation,
  targetSha256: string
): readonly MappedPatchProofJob[] {
  const programByPatch = new Map(
    binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
  );
  return tessellation.partitions.map((partition) => {
    const programCanonicalJson = programByPatch.get(
      partition.patchId as (typeof binding.programs)[number]['patchId']
    );
    if (programCanonicalJson === undefined) {
      throw new Error(`missing program for partition patch '${partition.patchId}'`);
    }
    return {
      partition,
      evaluator: compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson }),
    };
  });
}

const fixtureCache = new Map<string, Fixture>();
function fixture(
  geometry: typeof SMALL_POT_GEOMETRY,
  styleParams: Readonly<Record<string, number>>,
  divisions: AnnularSolidReferenceTessellationOptions
): Fixture {
  const key = JSON.stringify([geometry, styleParams, divisions]);
  const cached = fixtureCache.get(key);
  if (cached !== undefined) return cached;
  const canonicalInput = createCanonicalTargetInputBinding(
    geometry,
    'HarmonicRipple',
    styleParams,
    TARGET_CONTROLS
  );
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, divisions);
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
    binding.surfaceComplex
  );
  const built: Fixture = {
    binding,
    canonicalInput,
    tessellation,
    target,
    jobs: jobsFor(binding, tessellation, target.targetSha256),
  };
  fixtureCache.set(key, built);
  return built;
}

// Run the geometry-layer proof and report pass/refusal. Any thrown module
// error (they all carry a string `code`) is a refusal; anything else is a
// genuine bug and propagates.
function geometryOutcome(
  stlBytes: Uint8Array,
  target: CompleteMappedGeometryTargetBinding,
  jobs: readonly MappedPatchProofJob[],
  budgetPm: bigint
): { passed: boolean; code?: string; message?: string } {
  try {
    const session = createFinalArtifactProofSession(stlBytes);
    certifyCompleteMappedArtifactGeometry(session, target, jobs, {
      maximumGeometricUpperPm: budgetPm,
      maxElapsedMilliseconds: 100_000,
    });
    return { passed: true };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (error instanceof Error && typeof code === 'string') {
      return { passed: false, code, message: error.message };
    }
    throw error;
  }
}

const STL_HEADER_BYTES = 84;
const STL_TRIANGLE_BYTES = 50;
function pokeVertexComponent(
  stlBytes: Uint8Array,
  triangleIndex: number,
  deltaMm: number
): Uint8Array {
  const poked = Uint8Array.from(stlBytes);
  const view = new DataView(poked.buffer);
  // 12 bytes of normal, then vertex 0's x component.
  const base = STL_HEADER_BYTES + triangleIndex * STL_TRIANGLE_BYTES + 12;
  view.setFloat32(base, view.getFloat32(base, true) + deltaMm, true);
  return poked;
}

describe('adversarial containment regressions (audit containment #4)', () => {
  // The audit's core complaint: percentile rulers accept any artifact whose
  // defects are RARE. One vertex displaced 0.05 mm among ~18.9k triangles is
  // invisible to p99 (and to any sampled max that misses the facet), yet it
  // violates the 0.01 mm claim 5x over. The continuous chain must refuse.
  // Rides the PF_G2_POT gate because it runs two full certified-pot proofs.
  it.skipIf(!process.env.PF_G2_POT)(
    'p99-pass/max-fail: one displaced vertex among ~18.9k triangles refuses',
    { timeout: 240_000 },
    () => {
      const { tessellation, target, jobs } = fixture(
        SMALL_POT_GEOMETRY,
        GENTLE_HARMONIC_RIPPLE,
        CERTIFIED_DIVISIONS
      );
      expect(
        geometryOutcome(tessellation.stlBytes, target, jobs, 9_500_000n).passed
      ).toBe(true);

      const poked = pokeVertexComponent(tessellation.stlBytes, 100, 0.05);
      const outcome = geometryOutcome(poked, target, jobs, 9_500_000n);
      expect(outcome.passed).toBe(false);
      // Caught by the continuous residual itself — and the reported bound is
      // the TRUE violation (~0.05 mm = 50,000,000 pm), not a marginal
      // budget-edge artifact: the ruler measures the defect, p99 never sees it.
      expect(outcome.code).toBe('PATCH_PROOF_REFUSED');
      const reported = Number(/Residual upper (\d+) pm/.exec(outcome.message ?? '')?.[1]);
      expect(reported).toBeGreaterThan(45_000_000);
      expect(reported).toBeLessThan(55_000_000);
    }
  );

  it('post-check mutation: any byte change re-binds every artifact hash', () => {
    const { tessellation } = fixture(
      SMALL_POT_GEOMETRY,
      GENTLE_HARMONIC_RIPPLE,
      CHEAP_DIVISIONS
    );
    const original = createFinalArtifactProofSession(tessellation.stlBytes);
    const mutated = pokeVertexComponent(tessellation.stlBytes, 7, 0.001);
    const reparsed = createFinalArtifactProofSession(mutated);
    expect(reparsed.byteSha256).not.toBe(original.byteSha256);
    expect(reparsed.parsedTriangleSetSha256).not.toBe(original.parsedTriangleSetSha256);
  });

  it('budget coarsening (claim layer): tolerances looser than 0.01 mm are refused outright', () => {
    const { canonicalInput, tessellation, target, jobs } = fixture(
      SMALL_POT_GEOMETRY,
      GENTLE_HARMONIC_RIPPLE,
      CHEAP_DIVISIONS
    );
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    // There is no knob that weakens the claim: requesting 0.05 mm is not a
    // coarser certificate, it is BUDGET_INVALID.
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(session, canonicalInput, target, jobs, {
        requestedTolerancePm: 50_000_000n,
        reservedNonGeometricMarginPm: 500_000n,
        maxElapsedMilliseconds: 30_000,
      })
    ).toThrow(FinalStlPartialCertificationError);
  });

  it('budget coarsening (geometry layer): a coarse artifact passes loose and refuses tight', { timeout: 120_000 }, () => {
    // Strong ripple on a deliberately coarse grid: real sag far above 0.01 mm.
    const coarse = fixture(
      SMALL_POT_GEOMETRY,
      { hr_petal_amp: 0.16, hr_ripple_amp: 0.03, hr_bell: 0.05 },
      {
        angularDivisionsLog2: 6,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 2,
          'inner-wall': 2,
          'top-rim': 1,
          'bottom-top': 2,
          'bottom-under': 2,
          'drain-wall': 1,
        },
      }
    );
    const loose = geometryOutcome(coarse.tessellation.stlBytes, coarse.target, coarse.jobs, 2_000_000_000n);
    expect(loose.passed).toBe(true);
    const tight = geometryOutcome(coarse.tessellation.stlBytes, coarse.target, coarse.jobs, 9_500_000n);
    expect(tight.passed).toBe(false);
    expect(tight.code).toBe('PATCH_PROOF_REFUSED');
    expect(tight.message).toMatch(/Residual upper \d+ pm exceeds 9500000 pm/);
  });

  it('decimation bridging: a collapsed (degenerate) facet refuses fail-closed', { timeout: 120_000 }, () => {
    const { tessellation, target, jobs } = fixture(
      SMALL_POT_GEOMETRY,
      GENTLE_HARMONIC_RIPPLE,
      CHEAP_DIVISIONS
    );
    const budget = 100_000_000n;
    expect(geometryOutcome(tessellation.stlBytes, target, jobs, budget).passed).toBe(true);

    // A bad decimator's signature move: collapse a triangle's vertices onto
    // one point (zero area), bridging its parameter cell away.
    const poked = Uint8Array.from(tessellation.stlBytes);
    const view = new DataView(poked.buffer);
    const triangleCount = (poked.length - STL_HEADER_BYTES) / STL_TRIANGLE_BYTES;
    const victimBase =
      STL_HEADER_BYTES + Math.floor(triangleCount / 2) * STL_TRIANGLE_BYTES + 12;
    for (let component = 0; component < 3; component += 1) {
      const value = view.getFloat32(victimBase + component * 4, true);
      view.setFloat32(victimBase + 12 + component * 4, value, true);
      view.setFloat32(victimBase + 24 + component * 4, value, true);
    }

    const outcome = geometryOutcome(poked, target, jobs, budget);
    expect(outcome.passed).toBe(false);
    // The collapsed facet leaves its parameter cell uncovered, so the
    // continuous residual (surface -> triangle side) explodes past budget.
    expect(outcome.code).toBe('PATCH_PROOF_REFUSED');
    expect(outcome.message).toMatch(/Residual upper \d+ pm exceeds 100000000 pm/);

    // The structural gate refuses the same artifact independently of geometry.
    let structuralRefused = false;
    try {
      const structural = assessProofSessionStructuralIntegrity(
        createFinalArtifactProofSession(poked),
        { componentCount: 1, genus: 1 }
      );
      structuralRefused = !structural.structurallyValid;
    } catch {
      structuralRefused = true;
    }
    expect(structuralRefused).toBe(true);
  });

  it('non-default parameters: an artifact meshed for one parameter point refuses against another', { timeout: 120_000 }, () => {
    const budget = 100_000_000n;
    const meshedFor = fixture(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE, CHEAP_DIVISIONS);
    expect(
      geometryOutcome(meshedFor.tessellation.stlBytes, meshedFor.target, meshedFor.jobs, budget)
        .passed
    ).toBe(true);

    // Same style, different petal amplitude: the true surfaces differ by up
    // to 0.14 mm at the crests. Proving A's bytes against B's target must
    // refuse — silently certifying the wrong parameter point was exactly the
    // audit's "defaults only" escape hatch.
    const provedAgainst = fixture(
      SMALL_POT_GEOMETRY,
      { hr_petal_amp: 0.15, hr_ripple_amp: 0, hr_bell: 0 },
      CHEAP_DIVISIONS
    );
    const outcome = geometryOutcome(
      meshedFor.tessellation.stlBytes,
      provedAgainst.target,
      jobsFor(
        provedAgainst.binding,
        meshedFor.tessellation,
        provedAgainst.target.targetSha256
      ),
      budget
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.code).toBe('PATCH_PROOF_REFUSED');
    expect(outcome.message).toMatch(/Residual upper \d+ pm exceeds 100000000 pm/);
  });

  it('twist: an unspun artifact refuses against a spun target', { timeout: 120_000 }, () => {
    const budget = 100_000_000n;
    const unspun = fixture(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE, CHEAP_DIVISIONS);
    expect(
      geometryOutcome(unspun.tessellation.stlBytes, unspun.target, unspun.jobs, budget).passed
    ).toBe(true);

    // spinTurns is part of analytic truth (radialOuterWallProgram bakes
    // 2*pi*spinTurns*v^spinCurve into theta placement). The audit's G1
    // complaint was pipelines certifying the UNSPUN surface for a spun pot —
    // so the unspun artifact against the spun target must refuse loudly.
    const spun = fixture(
      { ...SMALL_POT_GEOMETRY, spinTurns: 0.25 },
      GENTLE_HARMONIC_RIPPLE,
      CHEAP_DIVISIONS
    );
    const outcome = geometryOutcome(
      unspun.tessellation.stlBytes,
      spun.target,
      jobsFor(spun.binding, unspun.tessellation, spun.target.targetSha256),
      budget
    );
    expect(outcome.passed).toBe(false);
    // The residual sees the tangential rotation as real distance: the
    // reported bound is macroscopic (~0.7 mm on this pot), not budget-edge.
    expect(outcome.code).toBe('PATCH_PROOF_REFUSED');
    const reported = Number(/Residual upper (\d+) pm/.exec(outcome.message ?? '')?.[1]);
    expect(reported).toBeGreaterThan(500_000_000);
  });
});
