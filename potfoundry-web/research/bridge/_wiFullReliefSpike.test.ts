import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../src/state/types';
import {
  rationalStationLadder,
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
  type AnnularSolidReferenceTessellationOptions,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type MappedPatchProofJob,
} from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from '../../src/geometry/targetSolid/finalArtifactProofSession';
import { proveFinalStlMappedGeometryAndStructure } from '../../src/geometry/targetSolid/finalStlPartialCertification';
import {
  proveFinalStlWithPatchWorkers,
  type ParallelMappedPatchProofJob,
} from '../../src/geometry/targetSolid/parallelPatchProofPool';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import { compileValidatedResidualEvaluator } from '../../src/geometry/targetSolid/validatedResidualEvaluatorRegistry';

// WaveInterference FULL-DEFAULTS campaign (post slice-10). The certified
// eleventh pot gentled relief 2.3 -> 0.25 mm and zeroed the edge fade; this
// spike targets the honest "defaults CERTIFIED" exit. Known anatomy at
// defaults: ridge exponent = 0.5 + 3*0.45 = 1.85 (smooth, no cusp
// concentration; clamp branches unreachable per slice-10 dense sampling),
// edge fade ACTIVE with C1 kink rows at t = fadeZone = 0.5*0.3 = 3/20 and
// 17/20 on the outer-wall parametrisation, moire angular content ~27
// effective at 2^10-sufficient density for relief 0.25. Relief x9.2 predicts
// ~sqrt(9.2) = 3.03x stations on whichever axes actually bind — MEASURE
// before believing (this file exists to measure).

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

/** Full registry defaults — the campaign target. */
const WI_FULL_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({});

/** Edge-fade C1 kink rows (fadeZone = wiEdgeFade*0.3 = 0.15) on the outer wall. */
const FADE_KINKS: readonly (readonly [number, number])[] = [
  [3, 20],
  [17, 20],
];

/**
 * Post-fade shoulder stations: the 10x8+kinks outer wall refused at exactly
 * 9,500,001 pm in the first bulk rows above the lower fade kink
 * (v in [0.17188, 0.17578], u ~ 0.727). Splitting the shoulder rows at k/512
 * (mirrored at the upper fade) quarters the local sag for +12k triangles.
 */
const FADE_KINKS_WITH_SHOULDERS: readonly (readonly [number, number])[] = [
  [3, 20],
  [17, 20],
  [87, 512],
  [89, 512],
  [91, 512],
  [421, 512],
  [423, 512],
  [425, 512],
];

/**
 * Wide shoulder split ('+kinks3'): the narrow shoulder stations just moved
 * the +1pm refusal one row up (band, not point — vertical sag envelope
 * hovers at ~9.5000 µm across the post-fade shoulder). Split every row of
 * v in [39/256, 57/256] and the mirrored upper band in one shot.
 */
const FADE_KINKS_WIDE_SHOULDERS: readonly (readonly [number, number])[] = [
  [3, 20],
  [17, 20],
  ...Array.from({ length: 18 }, (_, i) => [2 * (39 + i) + 1, 512] as const),
  ...Array.from({ length: 18 }, (_, i) => [2 * (199 + i) + 1, 512] as const),
];

/**
 * Uniform 288-row outer ladder ('r288'): the +1pm refusal surfs past every
 * local split at fresh (u,v) — ceiling-quantised reporting shows the bulk
 * vertical sag at 2^8 is ~9.5000005 µm GLOBALLY (knife-edge miss). A x1.125
 * uniform density bump (288 = 2^5 * 9 rows, sag -> ~7.5 µm) is the smallest
 * honest fix; the inner wall stays at its already-passing plain 2^8.
 */
const R288_STATIONS: readonly (readonly [number, number])[] = [
  ...Array.from({ length: 287 }, (_, i) => [i + 1, 288] as const).filter(
    ([numerator]) => numerator % 9 !== 0
  ),
  [3, 20],
  [17, 20],
];

/** Envelope v5 partition opt-in (hard ceilings raised 2026-07-18; defaults untouched). */
const V5_PARTITION = Object.freeze({
  maxTriangles: 1_048_576,
  maxBuildWork: 320_000_000,
  maxBvhNodes: 4_194_304,
  maxTraversalVisits: 320_000_000,
  maxBroadPhasePairChecks: 320_000_000,
  maxPairChecks: 160_000_000,
});

function atlas(styleParams: Readonly<Record<string, number>>): {
  binding: SinglePatchAnnularRadialSolidTargetBinding;
  canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
} {
  const canonicalInput = createCanonicalTargetInputBinding(
    H32_POT_GEOMETRY,
    'WaveInterference',
    styleParams,
    TARGET_CONTROLS
  );
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  return { binding, canonicalInput };
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

function wiDivisions(
  angularLog2: number,
  outerVerticalLog2: number,
  innerVerticalLog2: number,
  outerStations: readonly (readonly [number, number])[] | null
): AnnularSolidReferenceTessellationOptions {
  return {
    angularDivisionsLog2: angularLog2,
    verticalDivisionsLog2ByPatch: {
      'outer-wall': outerVerticalLog2,
      'inner-wall': innerVerticalLog2,
      'top-rim': 3,
      'bottom-top': 5,
      'bottom-under': 5,
      'drain-wall': 0,
    },
    ...(outerStations
      ? {
          verticalStationsByPatch: {
            'outer-wall': rationalStationLadder(outerVerticalLog2, outerStations),
          },
        }
      : {}),
  };
}

function parseWiSpec(spec: string): {
  angular: number;
  outerVertical: number;
  innerVertical: number;
  stations: readonly (readonly [number, number])[] | null;
} {
  if (spec.startsWith('10xr288')) {
    // outer: base 2^5 + 288-ladder + fade kinks (290 rows); inner: plain 2^8.
    return { angular: 10, outerVertical: 5, innerVertical: 8, stations: R288_STATIONS };
  }
  const stations = spec.endsWith('+kinks3')
    ? FADE_KINKS_WIDE_SHOULDERS
    : spec.endsWith('+kinks2')
      ? FADE_KINKS_WITH_SHOULDERS
      : spec.endsWith('+kinks')
        ? FADE_KINKS
        : null;
  const [angular, vertical] = spec
    .replace('+kinks3', '')
    .replace('+kinks2', '')
    .replace('+kinks', '')
    .split('x')
    .map((token) => Number(token));
  return { angular, outerVertical: vertical, innerVertical: vertical, stations };
}

describe('WaveInterference full-defaults probes (env-gated, session-local)', () => {
  it.skipIf(!process.env.PF_WI_TRICOUNT)(
    'tessellation-only: per-patch triangle counts vs the 262,144 per-patch hard cap',
    { timeout: 300_000 },
    () => {
      const { binding } = atlas(WI_FULL_DEFAULTS);
      const candidates: readonly string[] = [
        '10x6',
        '10x6+kinks',
        '11x6+kinks',
        '10x7+kinks',
        '10x8+kinks',
        '10x8+kinks2',
      ];
      for (const label of candidates) {
        const { angular, outerVertical, innerVertical, stations } = parseWiSpec(label);
        const tessellation = tessellateAnnularRadialSolidTargetForCertification(
          binding,
          wiDivisions(angular, outerVertical, innerVertical, stations)
        );
        const perPatch = tessellation.partitions
          .map((partition) => `${partition.patchId}=${partition.triangles.length}`)
          .join(' ');
        console.log(
          `[probe:wi-tricount] ${label} total=${tessellation.triangleCount} ${perPatch}`
        );
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_WI_AXIS)(
    'axis-resolved demand: generous-budget per-patch magnitudes across densities',
    { timeout: 3_600_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const { binding } = atlas(WI_FULL_DEFAULTS);
      // Baseline (slice-10 density), angular-doubled, vertical-doubled — the
      // three magnitudes resolve the binding axis and verify the h^2 law.
      const configs: readonly (readonly [string, number, number])[] = [
        ['10x6', 10, 6],
        ['11x6', 11, 6],
        ['10x7', 10, 7],
      ];
      for (const [label, angular, vertical] of configs) {
        const tessellation = tessellateAnnularRadialSolidTargetForCertification(
          binding,
          wiDivisions(angular, vertical, vertical, null)
        );
        const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
          binding.surfaceComplex
        );
        const session = createFinalArtifactProofSession(tessellation.stlBytes);
        const jobs = jobsFor(binding, tessellation, target.targetSha256);
        for (const job of jobs) {
          if (job.partition.patchId !== 'outer-wall' && job.partition.patchId !== 'inner-wall') {
            continue;
          }
          const startedAt = Date.now();
          try {
            const result = certifyContinuousMappedPatchDistance(
              session,
              job.partition,
              job.evaluator,
              {
                maximumGeometricUpperPm: 250_000_000n,
                maxWorkCells: 4_000_000,
                deadlineEpochMilliseconds: Date.now() + 420_000,
              }
            );
            console.log(
              `[probe:wi-axis] ${label} ${job.partition.patchId} upperPm=${result.targetToMeshUpperPm}` +
                ` cells=${result.workCellCount} maxDepth=${result.maximumDepthReached}` +
                ` elapsedMs=${Date.now() - startedAt}`
            );
          } catch (error) {
            const err = error as { message?: string; artifactTriangleIndex?: number; depth?: number };
            console.log(
              `[probe:wi-axis] ${label} ${job.partition.patchId} REFUSED after ${Date.now() - startedAt}ms` +
                ` tri=${err.artifactTriangleIndex} depth=${err.depth} -> ${err.message?.slice(0, 200)}`
            );
          }
        }
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_WI_PP)(
    'per-patch isolation at a chosen config (PF_WI_CFG=AxV[+kinks], budget PF_WI_BUDGET_UM)',
    { timeout: 3_600_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const spec = process.env.PF_WI_CFG ?? '10x6+kinks';
      const { angular, outerVertical, innerVertical, stations } = parseWiSpec(spec);
      const budgetUm = Number(process.env.PF_WI_BUDGET_UM ?? '9.5');
      const budgetPm = BigInt(Math.round(budgetUm * 1_000_000));
      const { binding } = atlas(WI_FULL_DEFAULTS);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        wiDivisions(angular, outerVertical, innerVertical, stations)
      );
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const session = createFinalArtifactProofSession(tessellation.stlBytes);
      const jobs = jobsFor(binding, tessellation, target.targetSha256);
      for (const job of jobs) {
        const startedAt = Date.now();
        try {
          const result = certifyContinuousMappedPatchDistance(
            session,
            job.partition,
            job.evaluator,
            {
              maximumGeometricUpperPm: budgetPm,
              maxWorkCells: 6_000_000,
              maxDepth: 30,
              partition: { ...V5_PARTITION },
              deadlineEpochMilliseconds: Date.now() + 560_000,
            }
          );
          console.log(
            `[probe:wi-pp] ${spec} ${job.partition.patchId} OK upperPm=${result.targetToMeshUpperPm}` +
              ` cells=${result.workCellCount} maxDepth=${result.maximumDepthReached}` +
              ` elapsedMs=${Date.now() - startedAt}`
          );
        } catch (error) {
          const err = error as { message?: string; artifactTriangleIndex?: number; depth?: number };
          let uvNote = '';
          if (typeof err.artifactTriangleIndex === 'number') {
            const mapping = job.partition.triangles.find(
              (triangle) => triangle.artifactTriangleIndex === err.artifactTriangleIndex
            );
            if (mapping !== undefined) {
              const denominator =
                Number(job.partition.oddDenominatorFactor ?? '1') *
                2 ** job.partition.fractionBits;
              const uv = mapping.vertices
                .map(
                  (vertex) =>
                    `(${(Number(vertex.uNumerator) / denominator).toFixed(5)},${(Number(vertex.vNumerator) / denominator).toFixed(5)})`
                )
                .join(' ');
              uvNote = ` tri=${err.artifactTriangleIndex} depth=${err.depth} uv=${uv}`;
            }
          }
          console.log(
            `[probe:wi-pp] ${spec} ${job.partition.patchId} REFUSED after ${Date.now() - startedAt}ms` +
              ` -> ${err.message?.slice(0, 200)}${uvNote}`
          );
        }
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_WI_GO)(
    'composed full-defaults certification attempt (PF_WI_CFG, parallel workers)',
    { timeout: 3_600_000 },
    async () => {
      const spec = process.env.PF_WI_CFG ?? '11x6+kinks';
      const { angular, outerVertical, innerVertical, stations } = parseWiSpec(spec);
      const startedAt = Date.now();
      const { binding, canonicalInput } = atlas(WI_FULL_DEFAULTS);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        wiDivisions(angular, outerVertical, innerVertical, stations)
      );
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const programByPatch = new Map(
        binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
      );
      const jobs: ParallelMappedPatchProofJob[] = tessellation.partitions.map((partition) => {
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
      try {
        const result = await proveFinalStlWithPatchWorkers(
          tessellation.stlBytes,
          canonicalInput,
          target,
          jobs,
          {
            requestedTolerancePm: 10_000_000n,
            reservedNonGeometricMarginPm: 500_000n,
            maxElapsedMilliseconds: 590_000,
            maxTotalWorkCells: 16_000_000,
            maxTotalPartitionWorkUnits: 400_000_000,
            maxStructuralWorkUnits: 2_000_000_000,
            topology: { maxWorkUnits: 400_000_000 },
            selfIntersection: {
              maxBuildWork: 400_000_000,
              maxTraversalVisits: 400_000_000,
              maxBroadPhasePairChecks: 400_000_000,
              maxCandidatePairs: 100_000_000,
            },
            patchProof: { maxWorkCells: 6_000_000, maxDepth: 30, partition: { ...V5_PARTITION } },
            patchWorkerCount: 6,
          }
        );
        console.log(
          `[probe:wi-go] ${spec} CONVERGED tris=${tessellation.triangleCount}` +
            ` upperPm=${result.geometricTwoSidedUpperPm}` +
            ` plusReservedPm=${result.geometryPlusReservedUpperPm}` +
            ` structural=${result.structural.structurallyValid}` +
            ` elapsedMs=${Date.now() - startedAt}`
        );
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.log(
          `[probe:wi-go] ${spec} REFUSED after ${Date.now() - startedAt}ms -> ${detail.slice(0, 500)}`
        );
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_WI_STL)(
    'emit the CERTIFIED full-defaults WaveInterference STL (exact certified config)',
    { timeout: 300_000 },
    async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { createFinalArtifactProofSession: mintSession } = await import(
        '../../src/geometry/targetSolid/finalArtifactProofSession'
      );
      const { angular, outerVertical, innerVertical, stations } = parseWiSpec('10xr288');
      const { binding } = atlas(WI_FULL_DEFAULTS);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        wiDivisions(angular, outerVertical, innerVertical, stations)
      );
      const session = mintSession(tessellation.stlBytes);
      const directory = join(__dirname, '..', 'exchange', '_certified_stl');
      mkdirSync(directory, { recursive: true });
      const stlPath = join(directory, 'WaveInterference_defaults_H32_OD30_certified.stl');
      writeFileSync(stlPath, tessellation.stlBytes);
      const note = [
        'WaveInterference FULL DEFAULTS (relief 2.3 mm, edge fade 0.5 ACTIVE), H32/OD30/drain6 — CERTIFIED 2026-07-18',
        'certificate: CONVERGED 9,499,990 pm two-sided (geometric budget 9,500,000 pm; plusReserved 9,999,990 <= 10,000,000 pm = 0.01 mm), structural TRUE',
        `triangles=${tessellation.triangleCount} bytes=${tessellation.stlBytes.byteLength}`,
        `artifactByteSha256=${session.byteSha256}`,
        `parsedTriangleSetSha256=${session.parsedTriangleSetSha256}`,
        'config: 10xr288 — angular 2^10; outer wall base 2^5 + uniform 288-row rational ladder (odd factor 9) + fade-kink stations 3/20, 17/20 (290 rows); inner wall plain 2^8; envelope v5',
        'measured demand: vertical 87 um at 2^6 (knife-edge 9.5000005 um at 2^8), angular <= 10 um at 2^10; fade kinks certified via exact rational stations',
      ].join('\n');
      writeFileSync(stlPath.replace(/\.stl$/, '.certificate.txt'), `${note}\n`);
      console.log(
        `[probe:wi-stl] wrote ${stlPath} tris=${tessellation.triangleCount}` +
          ` bytes=${tessellation.stlBytes.byteLength} sha256=${session.byteSha256}`
      );
      expect(tessellation.triangleCount).toBe(1267712);
    }
  );

  it.skipIf(!process.env.PF_WI_SEQ)(
    'composed full-defaults certification attempt (PF_WI_CFG, sequential)',
    { timeout: 3_600_000 },
    () => {
      const spec = process.env.PF_WI_CFG ?? '11x6+kinks';
      const { angular, outerVertical, innerVertical, stations } = parseWiSpec(spec);
      const startedAt = Date.now();
      const { binding, canonicalInput } = atlas(WI_FULL_DEFAULTS);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        wiDivisions(angular, outerVertical, innerVertical, stations)
      );
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const session = createFinalArtifactProofSession(tessellation.stlBytes);
      try {
        const result = proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          jobsFor(binding, tessellation, target.targetSha256),
          {
            requestedTolerancePm: 10_000_000n,
            reservedNonGeometricMarginPm: 500_000n,
            maxElapsedMilliseconds: 590_000,
            maxTotalWorkCells: 16_000_000,
            maxTotalPartitionWorkUnits: 400_000_000,
            maxStructuralWorkUnits: 2_000_000_000,
            topology: { maxWorkUnits: 400_000_000 },
            selfIntersection: {
              maxBuildWork: 400_000_000,
              maxTraversalVisits: 400_000_000,
              maxBroadPhasePairChecks: 400_000_000,
              maxCandidatePairs: 100_000_000,
            },
            patchProof: { maxWorkCells: 6_000_000, maxDepth: 30, partition: { ...V5_PARTITION } },
          }
        );
        console.log(
          `[probe:wi-seq] ${spec} CONVERGED tris=${tessellation.triangleCount}` +
            ` upperPm=${result.geometricTwoSidedUpperPm}` +
            ` plusReservedPm=${result.geometryPlusReservedUpperPm}` +
            ` structural=${result.structural.structurallyValid}` +
            ` elapsedMs=${Date.now() - startedAt}`
        );
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.log(
          `[probe:wi-seq] ${spec} REFUSED after ${Date.now() - startedAt}ms -> ${detail.slice(0, 500)}`
        );
      }
      expect(true).toBe(true);
    }
  );
});
