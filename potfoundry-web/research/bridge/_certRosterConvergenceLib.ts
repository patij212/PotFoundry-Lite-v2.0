/**
 * Convergence probe — shared lab library (2026-07-22).
 *
 * The refine-vs-redesign signal. Chord error (flat mesh vs the curved analytic
 * surface) scales ~ h^2 where the surface is smooth, so DOUBLING density should
 * cut the worst residual ~4x. Where a feature is under-resolvable by the current
 * tessellation, the error barely drops. Measuring the worst per-patch residual
 * at TWO densities and taking coarseMax/fineMax is the decision:
 *   ratio ~4  -> DENSITY-RESPONSIVE (just refine)
 *   ratio ~1  -> STRUCTURALLY IRREDUCIBLE (redesign the mesher)
 *
 * This is a CHEAP estimate, NOT the certifies-at ladder. Per artifact triangle
 * we uniformly subdivide to a SHALLOW FIXED depth and take the max enclosure
 * UPPER bound across subcells — a guaranteed (conservative) per-triangle sup.
 * The full adaptive ladder is the expensive thing we are avoiding; a fixed
 * depth that CALIBRATES (fine-max within ~2x of the pot's committed certified
 * max) is enough to trust the ratio.
 *
 * The surface itself is NOT re-implemented: the enclosure reuses the exact
 * proven machinery — `compileValidatedResidualEvaluator` + its
 * `encloseResidualFastNumeric` (decimal `encloseResidual` fallback), identical
 * to `_certifiesAtBakeLib`'s per-triangle `enclose`. Only the ladder walk is
 * replaced by a uniform depth-d max-upper.
 */

import {
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
  type AnnularSolidReferenceTessellationOptions,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import type { SinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { compileValidatedResidualEvaluator } from '../../src/geometry/targetSolid/validatedResidualEvaluatorRegistry';
import { atlas, type CertifiedPot } from './_certRoster';

/** Floors the coarse transform clamps division log2 counts to (inclusive). */
export interface CoarsenFloors {
  readonly angular: number;
  readonly vertical: number;
}

export const DEFAULT_COARSEN_FLOORS: CoarsenFloors = Object.freeze({ angular: 2, vertical: 0 });

/**
 * PURE transform: the COARSE variant of a division spec. Reduce the shared
 * `angularDivisionsLog2` and every `verticalDivisionsLog2ByPatch` entry by
 * `coarseStep`, clamped at the floors. All other keys (station ladders,
 * angular stations, conforming lines/chords) pass through UNCHANGED, so a patch
 * pinned by a `verticalStationsByPatch` ladder coarsens only ANGULARLY — the
 * uniform vertical knob is inert under a ladder (see resolveStations). This is
 * exactly the task's scope: touch only the two uniform knobs.
 */
export function coarsenDivisions(
  divisions: AnnularSolidReferenceTessellationOptions,
  coarseStep: number,
  floors: CoarsenFloors = DEFAULT_COARSEN_FLOORS
): AnnularSolidReferenceTessellationOptions {
  if (!Number.isSafeInteger(coarseStep) || coarseStep < 1) {
    throw new RangeError(`coarsenDivisions: coarseStep must be a positive integer, got ${coarseStep}`);
  }
  const verticalDivisionsLog2ByPatch = Object.fromEntries(
    Object.entries(divisions.verticalDivisionsLog2ByPatch).map(([patchId, log2]) => [
      patchId,
      Math.max(floors.vertical, log2 - coarseStep),
    ])
  ) as AnnularSolidReferenceTessellationOptions['verticalDivisionsLog2ByPatch'];
  return {
    ...divisions,
    angularDivisionsLog2: Math.max(floors.angular, divisions.angularDivisionsLog2 - coarseStep),
    verticalDivisionsLog2ByPatch,
  };
}

/**
 * PURE: the full uniform 4-way subdivision of the reference triangle to `depth`,
 * as barycentric weight triples. Each returned entry is 9 integers (three
 * subcell-vertex barycentric rows over the fine triangle's corners), every row
 * summing to 2^depth. depth 0 -> the root triangle (identity); depth d -> 4^d
 * subcells. The split matches `_certifiesAtBakeLib`'s child construction so
 * enclosures are identical cell-for-cell.
 */
export function uniformSubcellWeights(depth: number): readonly (readonly number[])[] {
  if (!Number.isSafeInteger(depth) || depth < 0 || depth > 8) {
    throw new RangeError(`uniformSubcellWeights: depth must be an integer in [0, 8], got ${depth}`);
  }
  let cells: number[][] = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  for (let level = 0; level < depth; level += 1) {
    const next: number[][] = [];
    for (const w of cells) {
      const a = [w[0], w[1], w[2]];
      const b = [w[3], w[4], w[5]];
      const c = [w[6], w[7], w[8]];
      const ab = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
      const bc = [b[0] + c[0], b[1] + c[1], b[2] + c[2]];
      const ac = [a[0] + c[0], a[1] + c[1], a[2] + c[2]];
      const a2 = [2 * a[0], 2 * a[1], 2 * a[2]];
      const b2 = [2 * b[0], 2 * b[1], 2 * b[2]];
      const c2 = [2 * c[0], 2 * c[1], 2 * c[2]];
      next.push(
        [...a2, ...ab, ...ac],
        [...ab, ...b2, ...bc],
        [...ac, ...bc, ...c2],
        [...ab, ...bc, ...ac]
      );
    }
    cells = next;
  }
  return cells;
}

/** Per-patch worst-residual estimate (mm) keyed by patch id. */
export type PerPatchWorstResidual = Record<string, number>;

/**
 * For each partition/triangle, uniformly subdivide to `depth` and take the max
 * enclosure UPPER bound across subcells — a per-triangle sup ESTIMATE. Return
 * the max over all triangles per patch. Reuses the exact residual evaluator; the
 * `enclose` glue mirrors `_certifiesAtBakeLib` (fast numeric + decimal fallback).
 * `fallbackCount` is the number of subcells that fell through to the (slower,
 * exact) decimal enclosure — expected ~0 at shallow depth on small pots.
 */
export function sampleWorstResidualByPatch(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  tessellation: AnnularSolidReferenceTessellation,
  targetSha256: string,
  depth: number
): { readonly perPatchMaxMm: PerPatchWorstResidual; readonly enclosureCount: number; readonly fallbackCount: number } {
  const stl = Buffer.from(
    tessellation.stlBytes.buffer,
    tessellation.stlBytes.byteOffset,
    tessellation.stlBytes.byteLength
  );
  const subcells = uniformSubcellWeights(depth);
  const programByPatch = new Map(
    binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
  );
  const perPatchMaxMm: PerPatchWorstResidual = {};
  let enclosureCount = 0;
  let fallbackCount = 0;
  const artifact = new Float64Array(9);
  const uN = new Float64Array(3);
  const vN = new Float64Array(3);
  const bary = new Float64Array(9);
  for (const partition of tessellation.partitions) {
    const programCanonicalJson = programByPatch.get(partition.patchId);
    if (programCanonicalJson === undefined) {
      throw new Error(`missing program for partition patch '${partition.patchId}'`);
    }
    const evaluator = compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson });
    const oddFactor = partition.oddDenominatorFactor ?? '1';
    const oddNumeric = Number(oddFactor);
    let patchMax = perPatchMaxMm[partition.patchId] ?? 0;
    for (const mapping of partition.triangles) {
      const at = 84 + mapping.artifactTriangleIndex * 50 + 12;
      for (let i = 0; i < 9; i += 1) artifact[i] = stl.readFloatLE(at + i * 4);
      const uBase = mapping.vertices.map((vertex) => Number(vertex.uNumerator));
      const vBase = mapping.vertices.map((vertex) => Number(vertex.vNumerator));
      for (const weights of subcells) {
        for (let vtx = 0; vtx < 3; vtx += 1) {
          let u = 0;
          let v = 0;
          for (let k = 0; k < 3; k += 1) {
            const weight = weights[vtx * 3 + k];
            u += weight * uBase[k];
            v += weight * vBase[k];
            bary[vtx * 3 + k] = weight;
          }
          uN[vtx] = u;
          vN[vtx] = v;
        }
        enclosureCount += 1;
        let enclosure = evaluator.encloseResidualFastNumeric(
          uN,
          vN,
          partition.fractionBits + depth,
          bary,
          depth,
          artifact,
          oddNumeric === 1 ? undefined : oddNumeric
        );
        if (enclosure === null) {
          fallbackCount += 1;
          const cellVertices = [0, 1, 2].map((vtx) => {
            let u = 0n;
            let v = 0n;
            for (let k = 0; k < 3; k += 1) {
              const weight = BigInt(weights[vtx * 3 + k]);
              u += weight * BigInt(mapping.vertices[k].uNumerator);
              v += weight * BigInt(mapping.vertices[k].vNumerator);
            }
            return { uNumerator: u.toString(), vNumerator: v.toString() };
          }) as [
            (typeof mapping.vertices)[number],
            (typeof mapping.vertices)[number],
            (typeof mapping.vertices)[number],
          ];
          enclosure = evaluator.encloseResidual({
            patchId: partition.patchId,
            artifactTriangleIndex: mapping.artifactTriangleIndex,
            artifactTriangleVerticesMm: [
              [artifact[0], artifact[1], artifact[2]],
              [artifact[3], artifact[4], artifact[5]],
              [artifact[6], artifact[7], artifact[8]],
            ],
            originalDomainTriangle: mapping.vertices,
            cell: {
              fractionBits: partition.fractionBits + depth,
              ...(oddFactor === '1' ? {} : { oddDenominatorFactor: oddFactor }),
              barycentricFractionBits: depth,
              vertices: cellVertices,
              barycentricVertices: [0, 1, 2].map((vtx) => ({
                aNumerator: String(weights[vtx * 3]),
                bNumerator: String(weights[vtx * 3 + 1]),
                cNumerator: String(weights[vtx * 3 + 2]),
              })) as unknown as never,
            },
          });
        }
        const ax = Math.max(Math.abs(enclosure.xMm.lower), Math.abs(enclosure.xMm.upper));
        const ay = Math.max(Math.abs(enclosure.yMm.lower), Math.abs(enclosure.yMm.upper));
        const az = Math.max(Math.abs(enclosure.zMm.lower), Math.abs(enclosure.zMm.upper));
        const upper = Math.hypot(ax, ay, az);
        if (upper > patchMax) patchMax = upper;
      }
    }
    perPatchMaxMm[partition.patchId] = patchMax;
  }
  return { perPatchMaxMm, enclosureCount, fallbackCount };
}

/** Per-patch triangle counts keyed by patch id. */
export function trianglesByPatch(tessellation: AnnularSolidReferenceTessellation): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const partition of tessellation.partitions) {
    counts[partition.patchId] = (counts[partition.patchId] ?? 0) + partition.triangles.length;
  }
  return counts;
}

/** How a per-patch coarse/fine ratio reads for the refine-vs-redesign call. */
export type ConvergenceVerdict = 'responsive' | 'partial' | 'irreducible';

/**
 * PURE: map a coarse/fine worst-residual ratio to a verdict. h^2 convergence is
 * a ratio of ~4 (doubling density quarters the error); ~1 means the error did
 * not drop with density. Thresholds are deliberately generous — the ratio is a
 * signal to a human, not an automated gate.
 */
export function classifyRatio(ratio: number): ConvergenceVerdict {
  if (!Number.isFinite(ratio)) return 'responsive';
  if (ratio >= 2.5) return 'responsive';
  if (ratio <= 1.5) return 'irreducible';
  return 'partial';
}

/** One patch's convergence record. */
export interface PatchConvergence {
  readonly fineMaxMm: number;
  readonly coarseMaxMm: number;
  readonly ratio: number;
  readonly verdict: ConvergenceVerdict;
  readonly fineTris: number;
  readonly coarseTris: number;
}

export interface ConvergePotResult {
  readonly name: string;
  readonly styleId: string;
  readonly depth: number;
  readonly coarseStep: number;
  readonly fineDivisions: AnnularSolidReferenceTessellationOptions;
  readonly coarseDivisions: AnnularSolidReferenceTessellationOptions;
  readonly perPatch: Record<string, PatchConvergence>;
  readonly fineGlobalMaxMm: number;
  readonly coarseGlobalMaxMm: number;
  readonly fineTrisTotal: number;
  readonly coarseTrisTotal: number;
  readonly fineMs: number;
  readonly coarseMs: number;
  readonly fineEnclosures: number;
  readonly coarseEnclosures: number;
  readonly fallbackCount: number;
}

export interface ConvergePotOptions {
  readonly depth: number;
  readonly coarseStep?: number;
  readonly floors?: CoarsenFloors;
}

/**
 * Run the shallow-depth worst-residual probe at the certified (FINE) divisions
 * and at a COARSE variant, returning per-patch coarse/fine ratios. The target
 * surface (and thus targetSha256) is division-independent, so binding + target
 * are built ONCE and only the tessellation is recomputed per density.
 */
export function convergePot(pot: CertifiedPot, options: ConvergePotOptions): ConvergePotResult {
  const { depth } = options;
  const coarseStep = options.coarseStep ?? 1;
  const binding = atlas(pot.geometry, pot.styleParams, pot.styleId);
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(binding.surfaceComplex);
  const targetSha256 = target.targetSha256;

  const fineDivisions = pot.divisions;
  const fineTess = tessellateAnnularRadialSolidTargetForCertification(binding, fineDivisions);
  const fineStart = Date.now();
  const fine = sampleWorstResidualByPatch(binding, fineTess, targetSha256, depth);
  const fineMs = Date.now() - fineStart;
  const fineTrisByPatch = trianglesByPatch(fineTess);

  const coarseDivisions = coarsenDivisions(fineDivisions, coarseStep, options.floors);
  const coarseTess = tessellateAnnularRadialSolidTargetForCertification(binding, coarseDivisions);
  const coarseStart = Date.now();
  const coarse = sampleWorstResidualByPatch(binding, coarseTess, targetSha256, depth);
  const coarseMs = Date.now() - coarseStart;
  const coarseTrisByPatch = trianglesByPatch(coarseTess);

  const perPatch: Record<string, PatchConvergence> = {};
  let fineGlobalMaxMm = 0;
  let coarseGlobalMaxMm = 0;
  for (const patchId of Object.keys(fine.perPatchMaxMm)) {
    const fineMaxMm = fine.perPatchMaxMm[patchId];
    const coarseMaxMm = coarse.perPatchMaxMm[patchId] ?? Number.NaN;
    const ratio = fineMaxMm > 0 ? coarseMaxMm / fineMaxMm : Number.POSITIVE_INFINITY;
    perPatch[patchId] = {
      fineMaxMm,
      coarseMaxMm,
      ratio,
      verdict: classifyRatio(ratio),
      fineTris: fineTrisByPatch[patchId] ?? 0,
      coarseTris: coarseTrisByPatch[patchId] ?? 0,
    };
    if (fineMaxMm > fineGlobalMaxMm) fineGlobalMaxMm = fineMaxMm;
    if (coarseMaxMm > coarseGlobalMaxMm) coarseGlobalMaxMm = coarseMaxMm;
  }

  return {
    name: pot.name,
    styleId: pot.styleId,
    depth,
    coarseStep,
    fineDivisions,
    coarseDivisions,
    perPatch,
    fineGlobalMaxMm,
    coarseGlobalMaxMm,
    fineTrisTotal: fineTess.triangleCount,
    coarseTrisTotal: coarseTess.triangleCount,
    fineMs,
    coarseMs,
    fineEnclosures: fine.enclosureCount,
    coarseEnclosures: coarse.enclosureCount,
    fallbackCount: fine.fallbackCount + coarse.fallbackCount,
  };
}
