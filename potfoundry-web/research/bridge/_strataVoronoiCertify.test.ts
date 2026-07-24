import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../src/state/types';
import {
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type MappedPatchProofJob,
} from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from '../../src/geometry/targetSolid/finalArtifactProofSession';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import { compileValidatedResidualEvaluator } from '../../src/geometry/targetSolid/validatedResidualEvaluatorRegistry';

/*
 * STRATA-001 S0 root-cause arm (E-2026-07-23-STRATA001-S0-BASELINE, increment 2).
 *
 * QUESTION: the spec's motivating [MEASURED] fact is "raising the triangle budget
 * does not terminate the Voronoi screen (certification hangs)". S0 increment 1
 * showed the FAST SCREEN terminates (2.7e5 cells) and that its only hard failures
 * are 128 REFUSALS at the site cones. Since cMPD:983-987 escalates a null fast
 * screen to the EXACT evaluator rather than stopping, the hang — if real — should
 * appear in the REAL certifier, and its ERROR CODE says which mechanism it is:
 *
 *   EVALUATOR_REFUSED -> the cone refusal propagates (cusp is the blocker)
 *   RESOURCE_LIMIT    -> the b&b blows up on cell/work-unit budget (the spec's
 *                        Clarke-hull subdivision story)
 *   deadline/CANCELLED-> wall-clock starvation
 *   OK                -> no hang at this configuration
 *
 * Runs the same per-patch isolation as _gothicVoronoiConformingSpike's
 * PF_SLICE11_VOR_PP probe, but parameterized over v_morph so WEB mode (morph=1,
 * the spec's P2 order-2-edge prediction) can be measured against BUBBLE mode.
 *
 * Gated PF_STRATA_CERTIFY=1. No kernel code is modified by this file.
 */

const RUN = process.env.PF_STRATA_CERTIFY === '1';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

const MORPH = envFloat('PF_STRATA_MORPH', 0);
const RELIEF = envFloat('PF_STRATA_RELIEF', 0.04);
const DEADLINE_MS = envInt('PF_STRATA_DEADLINE_MS', 90_000);
const ALOG2 = envInt('PF_STRATA_ALOG2', 8);
const VLOG2 = envInt('PF_STRATA_VLOG2', 7);
// Depth cap. cMPD DEFAULT_MAX_DEPTH=24, MAX_SUBDIVISION_DEPTH=30. This is the
// DIRECT test of spec §3's central claim: on a straddling cell the Clarke hull
// makes the residual bound H-INDEPENDENT, so subdivision cannot close it. If a
// web-mode INCONCLUSIVE at depth 24 still reports the SAME residual at depth 30
// (64x finer), §3 is confirmed; if the residual falls, §3 is refuted.
const MAXDEPTH = envInt('PF_STRATA_MAXDEPTH', 0);
// Working budget. NOTE 9_500_000 pm is an INTERNAL working budget (0.5um reserved
// below the real 0.01mm = 10_000_000 pm goal), and
// tessellateAnnularRadialSolidTargetForCertification SIZES THE MESH TO IT — so a
// marginal cell sitting within a few pm of the line is expected by construction.
// Raising it within the 10_000_000 pm goal separates "screen too slack" from
// "tessellation tuned exactly to the line".
const BUDGET_PM = BigInt(envInt('PF_STRATA_BUDGET_PM', 9_500_000));
// cMPD DEFAULT_MAX_WORK_CELLS=1e6, HARD_MAX=6e6. A denser reference tessellation
// trips the default before any work happens (RESOURCE_LIMIT after 0ms).
const MAXCELLS = envInt('PF_STRATA_MAXCELLS', 0);

function atlas(
  styleId: string,
  styleParams: Readonly<Record<string, number>>
): SinglePatchAnnularRadialSolidTargetBinding {
  const canonicalInput = createCanonicalTargetInputBinding(
    H32_POT_GEOMETRY,
    styleId,
    styleParams,
    TARGET_CONTROLS
  );
  return createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
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

describe('STRATA-001 S0 increment 2: does the REAL certifier hang on Voronoi?', () => {
  it.runIf(RUN)(
    'per-patch certification with failure-code attribution',
    { timeout: 3_000_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const mode = MORPH === 0 ? 'BUBBLE' : MORPH === 1 ? 'WEB' : `MORPH=${MORPH}`;
      const binding = atlas('Voronoi', { v_morph: MORPH, v_relief: RELIEF });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: ALOG2,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': VLOG2,
          'inner-wall': VLOG2,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 0,
        },
      });
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const session = createFinalArtifactProofSession(tessellation.stlBytes);
      const jobs = jobsFor(binding, tessellation, target.targetSha256);

      const lines: string[] = [
        '',
        '===== STRATA-001 S0/2: REAL CERTIFIER vs Voronoi =====',
        `mode: ${mode}  (v_morph=${MORPH}, v_relief=${RELIEF})`,
        `tessellation: angularLog2=${ALOG2} verticalLog2(walls)=${VLOG2}  deadline=${DEADLINE_MS}ms/patch  maxDepth=${MAXDEPTH > 0 ? MAXDEPTH : 24}`,
        `budget: ${BUDGET_PM} pm (${(Number(BUDGET_PM) / 1e6).toFixed(3)} um)`,
        '',
      ];
      let anyFailure = false;

      for (const job of jobs) {
        const startedAt = Date.now();
        try {
          const result = certifyContinuousMappedPatchDistance(session, job.partition, job.evaluator, {
            maximumGeometricUpperPm: BUDGET_PM,
            deadlineEpochMilliseconds: Date.now() + DEADLINE_MS,
            ...(MAXDEPTH > 0 ? { maxDepth: MAXDEPTH } : {}),
            ...(MAXCELLS > 0 ? { maxWorkCells: MAXCELLS } : {}),
          });
          lines.push(
            `  ${job.partition.patchId.padEnd(14)} OK       upperPm=${result.targetToMeshUpperPm}` +
              ` cells=${result.workCellCount} maxDepth=${result.maximumDepthReached}` +
              ` ${Date.now() - startedAt}ms`
          );
        } catch (error) {
          anyFailure = true;
          const err = error as {
            message?: string;
            code?: string;
            artifactTriangleIndex?: number;
            depth?: number;
          };
          let uvNote = '';
          if (typeof err.artifactTriangleIndex === 'number') {
            const mapping = job.partition.triangles.find(
              (triangle) => triangle.artifactTriangleIndex === err.artifactTriangleIndex
            );
            if (mapping !== undefined) {
              const denominator =
                Number(job.partition.oddDenominatorFactor ?? '1') * 2 ** job.partition.fractionBits;
              const uv = mapping.vertices
                .map(
                  (vertex) =>
                    `(${(Number(vertex.uNumerator) / denominator).toFixed(5)},${(Number(vertex.vNumerator) / denominator).toFixed(5)})`
                )
                .join(' ');
              uvNote = `\n      tri=${err.artifactTriangleIndex} depth=${err.depth} uv=${uv}`;
            }
          }
          lines.push(
            `  ${job.partition.patchId.padEnd(14)} ${(err.code ?? 'FAILED').padEnd(8)} after ${Date.now() - startedAt}ms` +
              `\n      ${err.message?.slice(0, 200)}${uvNote}`
          );
        }
      }

      lines.push(
        '',
        `VERDICT: ${anyFailure ? 'at least one patch FAILED — see codes above' : 'ALL PATCHES CERTIFIED — no hang at this configuration'}`,
        '======================================================',
        ''
      );
      const report = lines.join('\n');
      // eslint-disable-next-line no-console
      console.log(report);
      const outPath = process.env.PF_STRATA_CERTIFY_OUT;
      if (outPath !== undefined) writeFileSync(outPath, report, 'utf8');

      expect(jobs.length).toBeGreaterThan(0);
    }
  );
});
