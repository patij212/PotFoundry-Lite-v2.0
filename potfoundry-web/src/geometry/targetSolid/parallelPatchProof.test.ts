import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import {
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
  type AnnularSolidReferenceTessellationOptions,
} from './annularSolidReferenceTessellation';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from './completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import {
  FinalStlPartialCertificationError,
  proveFinalStlMappedGeometryAndStructure,
  type FinalStlPartialCertificationOptions,
} from './finalStlPartialCertification';
import {
  proveFinalStlWithPatchWorkers,
  type ParallelMappedPatchProofJob,
} from './parallelPatchProofPool';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

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
// The proven certifying fixture scale (see annularSolidReferenceTessellation
// test rationale: ~4x angular sag margin, bottoms sized for the ruled-surface
// twist term).
const CERTIFYING_DIVISIONS: AnnularSolidReferenceTessellationOptions = Object.freeze({
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
// Bottoms at one v-cell carry a ~31 um ruled-surface twist error: refuses the
// 0.01 mm budget deterministically (the adversarial budget-coarsening fixture).
const REFUSING_DIVISIONS: AnnularSolidReferenceTessellationOptions = Object.freeze({
  angularDivisionsLog2: 8,
  verticalDivisionsLog2ByPatch: Object.freeze({
    'outer-wall': 3,
    'inner-wall': 3,
    'top-rim': 3,
    'bottom-top': 0,
    'bottom-under': 0,
    'drain-wall': 0,
  }),
});

interface Fixture {
  readonly stlBytes: Uint8Array;
  readonly canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
  readonly target: ReturnType<
    typeof createCompleteMappedGeometryTargetBindingFromSurfaceComplex
  >;
  readonly jobs: readonly ParallelMappedPatchProofJob[];
}

function fixture(divisions: AnnularSolidReferenceTessellationOptions): Fixture {
  const canonicalInput = createCanonicalTargetInputBinding(
    SMALL_POT_GEOMETRY,
    'HarmonicRipple',
    GENTLE_HARMONIC_RIPPLE,
    TARGET_CONTROLS
  );
  const binding: SinglePatchAnnularRadialSolidTargetBinding =
    createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput)
    );
  const tessellation: AnnularSolidReferenceTessellation =
    tessellateAnnularRadialSolidTargetForCertification(binding, divisions);
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
    binding.surfaceComplex
  );
  const programByPatch = new Map(
    binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
  );
  const jobs = tessellation.partitions.map((partition) => {
    const programCanonicalJson = programByPatch.get(
      partition.patchId as (typeof binding.programs)[number]['patchId']
    );
    if (programCanonicalJson === undefined) {
      throw new Error(`missing program for partition patch '${partition.patchId}'`);
    }
    return {
      partition,
      evaluator: compileValidatedResidualEvaluator({
        targetSha256: target.targetSha256,
        programCanonicalJson,
      }),
      programCanonicalJson,
    };
  });
  return { stlBytes: tessellation.stlBytes, canonicalInput, target, jobs };
}

const PROOF_OPTIONS: FinalStlPartialCertificationOptions = Object.freeze({
  requestedTolerancePm: 10_000_000n,
  reservedNonGeometricMarginPm: 500_000n,
  maxElapsedMilliseconds: 180_000,
});

// The sequential prover's job snapshot is strict: it refuses the extra
// programCanonicalJson key the parallel jobs carry.
function sequentialJobs(
  jobs: readonly ParallelMappedPatchProofJob[]
): { partition: ParallelMappedPatchProofJob['partition']; evaluator: ParallelMappedPatchProofJob['evaluator'] }[] {
  return jobs.map(({ partition, evaluator }) => ({ partition, evaluator }));
}

function refusalOf(run: () => unknown): { code: string; message: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof FinalStlPartialCertificationError) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
  throw new Error('expected the proof to refuse');
}

async function refusalOfAsync(
  run: () => Promise<unknown>
): Promise<{ code: string; message: string }> {
  try {
    await run();
  } catch (error) {
    if (error instanceof FinalStlPartialCertificationError) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
  throw new Error('expected the parallel proof to refuse');
}

describe('parallel per-patch proof workers', () => {
  it(
    'certifies byte-identically to the sequential prover',
    { timeout: 600_000 },
    async () => {
      const { stlBytes, canonicalInput, target, jobs } = fixture(CERTIFYING_DIVISIONS);
      const session = createFinalArtifactProofSession(stlBytes);
      const sequential = proveFinalStlMappedGeometryAndStructure(
        session,
        canonicalInput,
        target,
        sequentialJobs(jobs),
        PROOF_OPTIONS
      );
      const parallel = await proveFinalStlWithPatchWorkers(
        stlBytes,
        canonicalInput,
        target,
        jobs,
        { ...PROOF_OPTIONS, patchWorkerCount: 6 }
      );
      // Per-patch evidence hashes are the RUN-STABLE identity anchors (their
      // binding carries no wall-clock): they must match exactly.
      expect(parallel.geometry.patchProofs.length).toBe(
        sequential.geometry.patchProofs.length
      );
      for (let index = 0; index < sequential.geometry.patchProofs.length; index += 1) {
        expect(parallel.geometry.patchProofs[index].evidenceSha256).toBe(
          sequential.geometry.patchProofs[index].evidenceSha256
        );
      }
      // The COMPOSED evidence hashes and the recorded per-stage
      // maxElapsedMilliseconds bind the remaining elapsed-time envelope by
      // pre-existing design (finalStl hands each stage its remaining
      // deadline), so they differ between ANY two runs — including two
      // sequential ones. Every other field must be deeply equal.
      const normalizeTimeSensitiveEvidence = (value: unknown): unknown =>
        JSON.parse(
          JSON.stringify(value, (key, nested: unknown) =>
            key === 'evidenceSha256' || key === 'maxElapsedMilliseconds'
              ? 'time-sensitive-normalized'
              : nested
          )
        );
      expect(normalizeTimeSensitiveEvidence(parallel)).toEqual(
        normalizeTimeSensitiveEvidence(sequential)
      );
    }
  );

  it(
    'refuses identically to the sequential prover on a geometry refusal',
    { timeout: 600_000 },
    async () => {
      const { stlBytes, canonicalInput, target, jobs } = fixture(REFUSING_DIVISIONS);
      const session = createFinalArtifactProofSession(stlBytes);
      const sequential = refusalOf(() =>
        proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          sequentialJobs(jobs),
          PROOF_OPTIONS
        )
      );
      const parallel = await refusalOfAsync(() =>
        proveFinalStlWithPatchWorkers(stlBytes, canonicalInput, target, jobs, {
          ...PROOF_OPTIONS,
          patchWorkerCount: 6,
        })
      );
      expect(parallel.code).toBe(sequential.code);
      expect(parallel.message).toBe(sequential.message);
    }
  );

  it(
    'replays aggregate pool refusals identically',
    { timeout: 600_000 },
    async () => {
      const { stlBytes, canonicalInput, target, jobs } = fixture(CERTIFYING_DIVISIONS);
      const session = createFinalArtifactProofSession(stlBytes);
      const cappedOptions: FinalStlPartialCertificationOptions = {
        ...PROOF_OPTIONS,
        maxTotalWorkCells: 60_000,
      };
      const sequential = refusalOf(() =>
        proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          sequentialJobs(jobs),
          cappedOptions
        )
      );
      const parallel = await refusalOfAsync(() =>
        proveFinalStlWithPatchWorkers(stlBytes, canonicalInput, target, jobs, {
          ...cappedOptions,
          patchWorkerCount: 6,
        })
      );
      expect(parallel.code).toBe(sequential.code);
      expect(parallel.message).toBe(sequential.message);
    }
  );

  it('refuses forged parallel proof containers', () => {
    const { stlBytes, canonicalInput, target, jobs } = fixture(REFUSING_DIVISIONS);
    const session = createFinalArtifactProofSession(stlBytes);
    const forged = new Map<string, unknown>([['outer-wall', { fake: true }]]);
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(
        session,
        canonicalInput,
        target,
        sequentialJobs(jobs),
        {
          ...PROOF_OPTIONS,
          parallelPatchProofs: forged,
        } as unknown as FinalStlPartialCertificationOptions
      )
    ).toThrow(/minted/);
  });
});
