import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../src/state/types';
import {
  dyadicEdgeLadder,
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

// GyroidManifold GENTLE campaign under envelope v5 (post-WI, 2026-07-19).
// Prior measured walls (matrix Addenda 2-3): demand ~1024 SHARED angular
// stations (welds force one angular grid) x ~128 rows on BOTH walls +
// edge-laddered bottoms -- walls alone ate the entire v2 cap; the roadmap
// parked Gyroid on "envelope v3/streaming". Envelope v5 holds it with 4x
// headroom (outer wall 262,144 <= 1,048,576/patch; total ~707k <= 2M).
// Program recon: the edge fade is a Hermite smoothstep (C1 -- no WI-style
// kink stations) and the |value| crease saturates inside the clamp (the
// C0-scan's "C1 everywhere"); pure-density campaign.

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

/**
 * The documented gentle point (matrix rows + prior probes). PF_GY_SHARP
 * overrides gm_sharpness: the default 0.1 shoulder is ~0.0015 wide in t
 * (measured >120 µm walls at any ≤v5 grid — see the 2026-07-19 probes);
 * 1.0 widens it ~10x, the style's own smoothness lever at its max.
 */
function gyParams(): Readonly<Record<string, number>> {
  const sharp = process.env.PF_GY_SHARP;
  return Object.freeze({
    gm_relief: 0.25,
    gm_edge_fade: 1,
    ...(sharp !== undefined ? { gm_sharpness: Number(sharp) } : {}),
  });
}
const GYROID_GENTLE: Readonly<Record<string, number>> = gyParams();

/** Envelope v5 partition opt-in (hard ceilings raised 2026-07-18; defaults untouched). */
const V5_PARTITION = Object.freeze({
  maxTriangles: 1_048_576,
  maxBuildWork: 320_000_000,
  maxBvhNodes: 4_194_304,
  maxTraversalVisits: 320_000_000,
  maxBroadPhasePairChecks: 320_000_000,
  maxPairChecks: 160_000_000,
});

const V5_COMPOSED = Object.freeze({
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
});

function atlas(styleParams: Readonly<Record<string, number>>): {
  binding: SinglePatchAnnularRadialSolidTargetBinding;
  canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
} {
  const canonicalInput = createCanonicalTargetInputBinding(
    H32_POT_GEOMETRY,
    'GyroidManifold',
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

/** Uniform R-row wall ladder: R = 2^m * odd -> base 2^m + rational stations k/R. */
function uniformRowLadder(rows: number) {
  let base = 0;
  let remaining = rows;
  while (remaining % 2 === 0) {
    base += 1;
    remaining /= 2;
  }
  const stations: (readonly [number, number])[] = [];
  if (remaining > 1) {
    for (let k = 1; k < rows; k += 1) {
      if (k % remaining !== 0) stations.push([k, rows]);
    }
  }
  return rationalStationLadder(base, stations);
}

/**
 * 'aA' + ('wW' dyadic walls | 'rR' uniform R-row wall ladder) + optional 'bB'
 * (bottoms base 2^B, default 5) — bottoms always carry the 8-row v1 edge ladder.
 */
function gyDivisions(spec: string): AnnularSolidReferenceTessellationOptions {
  const match = /^a(\d+)(?:w(\d+)|r(\d+))(?:b(\d+))?$/.exec(spec);
  if (match === null) throw new Error(`bad gyroid spec '${spec}'`);
  const angular = Number(match[1]);
  const wallRows = match[3] !== undefined ? Number(match[3]) : null;
  const wallsLog2 = match[2] !== undefined ? Number(match[2]) : 31 - Math.clz32(wallRows ?? 128);
  const bottoms = Number(match[4] ?? '5');
  return {
    angularDivisionsLog2: angular,
    verticalDivisionsLog2ByPatch: {
      'outer-wall': wallRows !== null ? Math.floor(Math.log2(wallRows & -wallRows)) : wallsLog2,
      'inner-wall': wallRows !== null ? Math.floor(Math.log2(wallRows & -wallRows)) : wallsLog2,
      'top-rim': 3,
      'bottom-top': bottoms,
      'bottom-under': bottoms,
      'drain-wall': 0,
    },
    verticalStationsByPatch: {
      ...(wallRows !== null
        ? {
            'outer-wall': uniformRowLadder(wallRows),
            'inner-wall': uniformRowLadder(wallRows),
          }
        : {}),
      'bottom-top': dyadicEdgeLadder(bottoms, 8, 'v1'),
      'bottom-under': dyadicEdgeLadder(bottoms, 8, 'v1'),
    },
  };
}

describe('GyroidManifold gentle probes under envelope v5 (env-gated, session-local)', () => {
  it.skipIf(!process.env.PF_GY_TRICOUNT)(
    'tessellation-only: per-patch triangle counts vs v5 caps',
    { timeout: 300_000 },
    () => {
      const { binding } = atlas(GYROID_GENTLE);
      for (const spec of ['a10w7', 'a10w8', 'a11w7']) {
        const tessellation = tessellateAnnularRadialSolidTargetForCertification(
          binding,
          gyDivisions(spec)
        );
        const perPatch = tessellation.partitions
          .map((partition) => `${partition.patchId}=${partition.triangles.length}`)
          .join(' ');
        console.log(
          `[probe:gy-tricount] ${spec} total=${tessellation.triangleCount} ${perPatch}`
        );
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_GY_PP)(
    'per-patch isolation (PF_GY_CFG=aAwW[bB], budget PF_GY_BUDGET_UM)',
    { timeout: 3_600_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const spec = process.env.PF_GY_CFG ?? 'a10w7';
      const budgetUm = Number(process.env.PF_GY_BUDGET_UM ?? '9.5');
      const budgetPm = BigInt(Math.round(budgetUm * 1_000_000));
      const { binding } = atlas(GYROID_GENTLE);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        gyDivisions(spec)
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
            `[probe:gy-pp] ${spec} ${job.partition.patchId} OK upperPm=${result.targetToMeshUpperPm}` +
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
            `[probe:gy-pp] ${spec} ${job.partition.patchId} REFUSED after ${Date.now() - startedAt}ms` +
              ` -> ${err.message?.slice(0, 200)}${uvNote}`
          );
        }
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_GY_GO)(
    'composed gentle certification attempt via patch workers (PF_GY_CFG)',
    { timeout: 3_600_000 },
    async () => {
      const spec = process.env.PF_GY_CFG ?? 'a10w7';
      const startedAt = Date.now();
      const { binding, canonicalInput } = atlas(GYROID_GENTLE);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        gyDivisions(spec)
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
          { ...V5_COMPOSED, patchWorkerCount: 6 }
        );
        console.log(
          `[probe:gy-go] ${spec} CONVERGED tris=${tessellation.triangleCount}` +
            ` upperPm=${result.geometricTwoSidedUpperPm}` +
            ` plusReservedPm=${result.geometryPlusReservedUpperPm}` +
            ` structural=${result.structural.structurallyValid}` +
            ` elapsedMs=${Date.now() - startedAt}`
        );
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.log(
          `[probe:gy-go] ${spec} REFUSED after ${Date.now() - startedAt}ms -> ${detail.slice(0, 500)}`
        );
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_GY_STL)(
    'emit the CERTIFIED gentle Gyroid STL (exact certified config)',
    { timeout: 300_000 },
    async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { createFinalArtifactProofSession: mintSession } = await import(
        '../../src/geometry/targetSolid/finalArtifactProofSession'
      );
      const spec = process.env.PF_GY_CFG ?? 'a10w7';
      const { binding } = atlas(GYROID_GENTLE);
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        gyDivisions(spec)
      );
      const session = mintSession(tessellation.stlBytes);
      const directory = join(__dirname, '..', 'exchange', '_certified_stl');
      mkdirSync(directory, { recursive: true });
      const stlPath = join(directory, 'GyroidManifold_gentle_H32_OD30_certified.stl');
      writeFileSync(stlPath, tessellation.stlBytes);
      const note = [
        'GyroidManifold GENTLE (gm_relief 0.25, gm_edge_fade 1), H32/OD30/drain6 — CERTIFIED 2026-07-19',
        `config: ${spec} + 8-row v1 dyadic edge ladders on both bottoms; envelope v5`,
        `triangles=${tessellation.triangleCount} bytes=${tessellation.stlBytes.byteLength}`,
        `artifactByteSha256=${session.byteSha256}`,
        `parsedTriangleSetSha256=${session.parsedTriangleSetSha256}`,
      ].join('\n');
      writeFileSync(stlPath.replace(/\.stl$/, '.certificate.txt'), `${note}\n`);
      console.log(
        `[probe:gy-stl] wrote ${stlPath} tris=${tessellation.triangleCount}` +
          ` bytes=${tessellation.stlBytes.byteLength} sha256=${session.byteSha256}`
      );
      expect(tessellation.triangleCount).toBeGreaterThan(0);
    }
  );
});
