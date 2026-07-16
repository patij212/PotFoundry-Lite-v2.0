// _probe_gs_timing.test.ts — DEV-ONLY probe (env PF_GS_PROBE=1). U3b GeometricStar
// certification campaign: per-patch certify + work/screen histogram + elapsed, run
// BEFORE any parameter tuning (Addendum 9 mandate — the strap smoothstep edges are
// diagonal level sets, the same Clarke-kink-volume class that made Voronoi bubble
// compute-bound at ~150 s despite every patch converging individually).
// Pot: H32/OD30 (dyadic bottom fraction c = 3/32 -> inner-wall row stations at
// (8k-3)/29 via the slice-5 vertical rational ladder). Config marker printed per run.
import { describe, it, expect } from 'vitest';

import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import { createSinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import {
  rationalStationLadder,
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellationOptions,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type MappedPatchProofJob,
} from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from '../../src/geometry/targetSolid/finalArtifactProofSession';
import { proveFinalStlMappedGeometryAndStructure } from '../../src/geometry/targetSolid/finalStlPartialCertification';
import {
  certifyContinuousMappedPatchDistance,
  ContinuousMappedPatchDistanceError,
} from '../../src/geometry/targetSolid/continuousMappedPatchDistance';
import { compileValidatedResidualEvaluator } from '../../src/geometry/targetSolid/validatedResidualEvaluatorRegistry';
import { compileGeneratedTargetProgramBackends } from '../../src/geometry/targetSolid/validatedResidualProgram';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
const GS_POT_GEOMETRY: GeometryParams = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

// Gentle relief on otherwise pure registry defaults (points 8, gap 0.05,
// detail 0.5, layers 4, interlace 1, roundness 0, zoom 1, shift 0). All jump
// lines are then u = k/8 (sector), u = (2k+1)/16 (folds), t = k/4 (rows).
const GS_STYLE = { gs_relief: 0.05 };

// Inner wall spans t in [3/32, 1] (H 32, t_bottom 3): rows t = k/4 sit at
// local v = (8k-3)/29 for k = 1..3.
const INNER_ROW_STATIONS: readonly (readonly [number, number])[] = [
  [5, 29],
  [13, 29],
  [21, 29],
];

function divisions(
  angularLog2: number,
  wallsLog2: number
): AnnularSolidReferenceTessellationOptions {
  return {
    angularDivisionsLog2: angularLog2,
    verticalDivisionsLog2ByPatch: {
      'outer-wall': wallsLog2,
      'inner-wall': wallsLog2,
      'top-rim': 3,
      'bottom-top': 4,
      'bottom-under': 4,
      'drain-wall': 0,
    },
    verticalStationsByPatch: {
      'inner-wall': rationalStationLadder(wallsLog2, INNER_ROW_STATIONS),
    },
  };
}

// Matrix lesson #1: a depth-24 "9.5000x pm" refusal value is a crossing-contour
// artifact, never the region max — diagnose by dense-sampling the named triangle.
function diagnoseTriangle(
  binding: ReturnType<typeof createSinglePatchAnnularRadialSolidTargetBinding>,
  partition: { patchId: string; fractionBits: number; oddDenominatorFactor?: string; triangles: readonly { artifactTriangleIndex: number; vertices: readonly { uNumerator: string; vNumerator: string }[] }[] },
  artifactTriangleIndex: number
): void {
  const triangle = partition.triangles.find(
    (candidate) => candidate.artifactTriangleIndex === artifactTriangleIndex
  );
  if (triangle === undefined) {
    // eslint-disable-next-line no-console
    console.log(`[gs-diag] triangle ${artifactTriangleIndex} not in partition`);
    return;
  }
  const program = binding.programs.find((candidate) => candidate.patchId === partition.patchId);
  if (program === undefined) return;
  const backends = compileGeneratedTargetProgramBackends(program.programCanonicalJson);
  const denominator =
    Number(partition.oddDenominatorFactor ?? '1') * 2 ** partition.fractionBits;
  const corners = triangle.vertices.map((vertex) => [
    Number(vertex.uNumerator) / denominator,
    Number(vertex.vNumerator) / denominator,
  ]) as [number, number][];
  // eslint-disable-next-line no-console
  console.log(
    `[gs-diag] ${partition.patchId} tri=${artifactTriangleIndex} corners=` +
      corners.map(([u, v]) => `(${u.toFixed(8)},${v.toFixed(8)})`).join(' ') +
      ` rawNumerators=` +
      triangle.vertices.map((vv) => `${vv.uNumerator}/${vv.vNumerator}`).join(' ') +
      ` denom=${denominator}`
  );
  const artifactCorners = corners.map(([u, v]) => {
    const point = backends.evaluateFloat64(u, v);
    return [Math.fround(point[0]), Math.fround(point[1]), Math.fround(point[2])] as const;
  });
  let worst = 0;
  let worstAt: readonly [number, number] = [0, 0];
  const STEPS = 160;
  for (let i = 0; i <= STEPS; i += 1) {
    for (let j = 0; j <= STEPS - i; j += 1) {
      const wa = i / STEPS;
      const wb = j / STEPS;
      const wc = 1 - wa - wb;
      const u = Math.min(1, Math.max(0, wa * corners[0][0] + wb * corners[1][0] + wc * corners[2][0]));
      const v = Math.min(1, Math.max(0, wa * corners[0][1] + wb * corners[1][1] + wc * corners[2][1]));
      const point = backends.evaluateFloat64(u, v);
      const dx = point[0] - (wa * artifactCorners[0][0] + wb * artifactCorners[1][0] + wc * artifactCorners[2][0]);
      const dy = point[1] - (wa * artifactCorners[0][1] + wb * artifactCorners[1][1] + wc * artifactCorners[2][1]);
      const dz = point[2] - (wa * artifactCorners[0][2] + wb * artifactCorners[1][2] + wc * artifactCorners[2][2]);
      const distance = Math.hypot(dx, dy, dz);
      if (distance > worst) {
        worst = distance;
        worstAt = [u, v];
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[gs-diag] dense-sampled residual max=${(worst * 1e6).toFixed(0)}pm (${worst.toFixed(6)}mm) ` +
      `at (u=${worstAt[0].toFixed(8)}, v=${worstAt[1].toFixed(8)})`
  );
}

describe('GeometricStar per-patch timing probe (U3b)', () => {
  it.skipIf(!process.env.PF_GS_PROBE)('measures per-patch certify cost at gentle params', () => {
    const angularLog2 = Number(process.env.PF_GS_ANGULAR ?? 8);
    const wallsLog2 = Number(process.env.PF_GS_WALLS ?? 5);
    const relief = Number(process.env.PF_GS_RELIEF ?? GS_STYLE.gs_relief);
    const roundness = Number(process.env.PF_GS_ROUND ?? 0);
    // eslint-disable-next-line no-console
    console.log(
      `[gs-probe-config] angular=2^${angularLog2} walls=2^${wallsLog2} relief=${relief} roundness=${roundness} pot=H32/OD30`
    );
    const canonicalInput = createCanonicalTargetInputBinding(
      GS_POT_GEOMETRY,
      'GeometricStar',
      { gs_relief: relief, gs_roundness: roundness },
      TARGET_CONTROLS
    );
    const binding = createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput)
    );
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(
      binding,
      divisions(angularLog2, wallsLog2)
    );
    // eslint-disable-next-line no-console
    console.log(`[gs-probe] triangles=${tessellation.triangleCount}`);
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const programByPatch = new Map(
      binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
    );
    const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
      binding.surfaceComplex
    );
    const targetSha256 = target.targetSha256;
    if (process.env.PF_GS_COMPOSED) {
      const jobs: MappedPatchProofJob[] = tessellation.partitions.map((partition) => {
        const programCanonicalJson = programByPatch.get(
          partition.patchId as (typeof binding.programs)[number]['patchId']
        );
        if (programCanonicalJson === undefined) throw new Error(`no program: ${partition.patchId}`);
        return {
          partition,
          evaluator: compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson }),
        };
      });
      const composedStart = performance.now();
      const result = proveFinalStlMappedGeometryAndStructure(
        createFinalArtifactProofSession(tessellation.stlBytes),
        canonicalInput,
        target,
        jobs,
        {
          requestedTolerancePm: 10_000_000n,
          reservedNonGeometricMarginPm: 500_000n,
          maxElapsedMilliseconds: 110_000,
        }
      );
      // eslint-disable-next-line no-console
      console.log(
        `[gs-probe] COMPOSED: twoSidedUpper=${result.geometricTwoSidedUpperPm}pm ` +
          `plusReserved=${result.geometryPlusReservedUpperPm}pm claims=${result.provenClaims.join(',')} ` +
          `structural=${result.structural.structurallyValid} elapsed=${((performance.now() - composedStart) / 1000).toFixed(1)}s`
      );
      expect(result.provenClaims).toContain('patch-distance');
      return;
    }
    let total = 0;
    for (const partition of tessellation.partitions) {
      const programCanonicalJson = programByPatch.get(
        partition.patchId as (typeof binding.programs)[number]['patchId']
      );
      if (programCanonicalJson === undefined) throw new Error(`no program: ${partition.patchId}`);
      const evaluator = compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson });
      const start = performance.now();
      try {
        const result = certifyContinuousMappedPatchDistance(session, partition, evaluator, {
          maximumGeometricUpperPm: 9_500_000n,
        });
        const elapsed = performance.now() - start;
        total += elapsed;
        // eslint-disable-next-line no-console
        console.log(
          `[gs-probe] ${partition.patchId}: CERTIFIED upper=${result.certifiedMaximumGeometricUpperPm}pm ` +
            `elapsed=${elapsed.toFixed(0)}ms tris=${result.artifactTriangleSubsetCount} ` +
            `workCells=${result.workCellCount} fastAccepted=${result.fastScreenAcceptedCellCount} ` +
            `leaves=${result.acceptedLeafCellCount} depth=${result.maximumDepthReached}`
        );
      } catch (error) {
        const elapsed = performance.now() - start;
        total += elapsed;
        if (error instanceof ContinuousMappedPatchDistanceError) {
          // eslint-disable-next-line no-console
          console.log(
            `[gs-probe] ${partition.patchId}: REFUSED code=${error.code} ` +
              `tri=${error.artifactTriangleIndex ?? '-'} depth=${error.depth ?? '-'} ` +
              `elapsed=${elapsed.toFixed(0)}ms message=${error.message.slice(0, 160)}`
          );
          if (process.env.PF_GS_DIAG && error.artifactTriangleIndex !== undefined) {
            diagnoseTriangle(binding, partition, error.artifactTriangleIndex);
          }
        } else {
          throw error;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[gs-probe] TOTAL geometry elapsed=${(total / 1000).toFixed(1)}s`);
    expect(tessellation.triangleCount).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
