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
  type VerticalStationLadder,
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
 * The COARSE variant of a station ladder: drop alternate INTERIOR stations
 * (stride 2 by index), keeping the two endpoints and the SAME denominator
 * (`log2Denominator` + `oddDenominatorFactor` verbatim), so the result is still
 * a valid `VerticalStationLadder` the tessellator's `resolveStations` accepts —
 * a genuinely lower-resolution vertical grid, not a re-scaled one. `step`
 * halvings; a no-op once only the two endpoints remain (nothing safe to drop).
 * This is the v2 fix so ladder-pinned patches coarsen VERTICALLY too, not
 * angular-only. The dropped subsequence stays strictly increasing because it is
 * a subsequence of the (strictly increasing) input with both endpoints pinned.
 */
export function coarsenLadder(ladder: VerticalStationLadder, step: number): VerticalStationLadder {
  let nums = [...ladder.numerators];
  for (let s = 0; s < step; s += 1) {
    if (nums.length <= 2) break; // only endpoints left — nothing safe to drop
    const last = nums.length - 1;
    const kept: number[] = [nums[0]]; // bottom endpoint
    for (let i = 2; i < last; i += 2) kept.push(nums[i]); // keep even interior indices
    kept.push(nums[last]); // top endpoint (=== denominator, unchanged)
    nums = kept;
  }
  return {
    log2Denominator: ladder.log2Denominator,
    numerators: nums,
    ...(ladder.oddDenominatorFactor !== undefined
      ? { oddDenominatorFactor: ladder.oddDenominatorFactor }
      : {}),
  };
}

/**
 * Per-patch report of which axes the coarse variant actually reduced, so a
 * verdict never over-claims: 'angular+vertical' when the uniform vertical knob
 * dropped OR the patch's station ladder shrank; 'angular' otherwise (a patch
 * whose ladder could not be coarsened — e.g. already at its two endpoints — or
 * whose uniform vertical knob was already at the floor). Keyed by every patch in
 * `fine.verticalDivisionsLog2ByPatch`.
 */
export function coarsenedAxesReport(
  fine: AnnularSolidReferenceTessellationOptions,
  coarse: AnnularSolidReferenceTessellationOptions
): Record<string, 'angular' | 'angular+vertical'> {
  const out: Record<string, 'angular' | 'angular+vertical'> = {};
  const fineLadders = (fine.verticalStationsByPatch ?? {}) as Record<
    string,
    VerticalStationLadder | undefined
  >;
  const coarseLadders = (coarse.verticalStationsByPatch ?? {}) as Record<
    string,
    VerticalStationLadder | undefined
  >;
  const coarseUniform = coarse.verticalDivisionsLog2ByPatch as Record<string, number>;
  for (const [patchId, fineLog2] of Object.entries(fine.verticalDivisionsLog2ByPatch)) {
    const fineLadder = fineLadders[patchId];
    if (fineLadder === undefined) {
      // No ladder: the uniform vertical knob governs — did it drop?
      out[patchId] = coarseUniform[patchId] < fineLog2 ? 'angular+vertical' : 'angular';
    } else {
      const coarseLadder = coarseLadders[patchId];
      out[patchId] =
        coarseLadder !== undefined &&
        coarseLadder.numerators.length < fineLadder.numerators.length
          ? 'angular+vertical'
          : 'angular';
    }
  }
  return out;
}

/**
 * PURE transform: the COARSE variant of a division spec. Reduce the shared
 * `angularDivisionsLog2` and every `verticalDivisionsLog2ByPatch` entry by
 * `coarseStep`, clamped at the floors, AND (v2) coarsen every
 * `verticalStationsByPatch` ladder via `coarsenLadder` so a patch pinned by a
 * station ladder coarsens VERTICALLY too — not angular-only (the uniform
 * vertical knob is inert under a ladder, so before v2 such a patch never lost
 * vertical resolution). Angular stations and conforming lines/chords still pass
 * through UNCHANGED. Pure: `divisions` is never mutated.
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
  const verticalStationsByPatch =
    divisions.verticalStationsByPatch === undefined
      ? undefined
      : (Object.fromEntries(
          Object.entries(divisions.verticalStationsByPatch).map(([patchId, ladder]) => [
            patchId,
            ladder === undefined ? ladder : coarsenLadder(ladder, coarseStep),
          ])
        ) as AnnularSolidReferenceTessellationOptions['verticalStationsByPatch']);
  return {
    ...divisions,
    angularDivisionsLog2: Math.max(floors.angular, divisions.angularDivisionsLog2 - coarseStep),
    verticalDivisionsLog2ByPatch,
    ...(verticalStationsByPatch === undefined ? {} : { verticalStationsByPatch }),
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

/**
 * PURE: per-patch verdict equality between two convergence results. Keyed by the
 * patches of `a`; a patch absent from `b` reads as disagreement (its verdict is
 * `undefined`, which never equals a real verdict). This is the stability signal
 * `convergePotSelfCalibrated` compares across a one-depth step.
 */
export function verdictsAgree(a: ConvergePotResult, b: ConvergePotResult): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const patchId of Object.keys(a.perPatch)) {
    out[patchId] = a.perPatch[patchId].verdict === b.perPatch[patchId]?.verdict;
  }
  return out;
}

export interface SelfCalibrateOptions {
  readonly startDepth?: number;
  readonly maxDepth?: number;
  readonly coarseStep?: number;
  readonly floors?: CoarsenFloors;
  readonly budgetMs?: number;
  readonly nowMs?: () => number;
}

export type SelfCalibratedResult = ConvergePotResult & {
  readonly selfCalibration: {
    readonly method: 'verdict-stability';
    readonly depthsRun: number[];
    readonly finalDepth: number;
    readonly perPatchStable: Record<string, boolean>;
    readonly stable: boolean;
    readonly reason: 'converged' | 'max-depth' | 'budget' | 'cannot-coarsen';
  };
};

/**
 * CERT-FREE calibration by verdict-stability. Bake the probe at successive depths
 * (via the injected `runAtDepth`, default the real `convergePot`) and stop as soon
 * as the per-patch verdicts AGREE across a one-depth step — the mesher's
 * refine-vs-redesign call has stopped moving, so the shallow depth is deep enough
 * to trust WITHOUT the expensive certifies-at ladder. Escalates `startDepth..maxDepth`
 * (default 2..5), optionally bounded by `budgetMs`.
 *
 * `finalDepth` is the UPPER depth of the first agreeing pair (the depth whose
 * result is returned). `reason`:
 *   - 'converged'      — verdicts agreed across a step;
 *   - 'max-depth'      — reached `maxDepth` without agreement (UNCALIBRATED);
 *   - 'budget'         — `budgetMs` elapsed before agreement;
 *   - 'cannot-coarsen' — the coarse mesh did not actually shrink at `startDepth`
 *                        (`coarseTrisTotal >= fineTrisTotal`, e.g. divisions already
 *                        at the floor), so the ratio would be a meaningless ~1 that
 *                        reads as a false 'irreducible'. Refuse rather than mislead.
 *
 * The `runAtDepth` seam is the whole point: the stability logic is unit-tested with
 * a stub returning scripted per-depth verdicts, no real bake.
 */
export function convergePotSelfCalibrated(
  config: CertifiedPot,
  options: SelfCalibrateOptions = {},
  runAtDepth: (cfg: CertifiedPot, depth: number) => ConvergePotResult = (cfg, depth) =>
    convergePot(cfg, { depth, coarseStep: options.coarseStep, floors: options.floors })
): SelfCalibratedResult {
  const startDepth = options.startDepth ?? 2;
  const maxDepth = options.maxDepth ?? 5;
  const now = options.nowMs ?? ((): number => Date.now());
  const t0 = now();
  const depthsRun: number[] = [startDepth];
  let prev = runAtDepth(config, startDepth);

  // cannot-coarsen guard: if the coarse mesh did not actually shrink, the ratio
  // is a meaningless ~1 — refuse rather than emit a false 'irreducible'.
  if (prev.coarseTrisTotal >= prev.fineTrisTotal) {
    return {
      ...prev,
      selfCalibration: {
        method: 'verdict-stability',
        depthsRun,
        finalDepth: startDepth,
        perPatchStable: {},
        stable: false,
        reason: 'cannot-coarsen',
      },
    };
  }

  for (let depth = startDepth + 1; depth <= maxDepth; depth += 1) {
    const cur = runAtDepth(config, depth);
    depthsRun.push(depth);
    const perPatchStable = verdictsAgree(prev, cur);
    const stable = Object.values(perPatchStable).every(Boolean);
    if (stable) {
      return {
        ...cur,
        selfCalibration: {
          method: 'verdict-stability',
          depthsRun,
          finalDepth: depth,
          perPatchStable,
          stable: true,
          reason: 'converged',
        },
      };
    }
    if (options.budgetMs !== undefined && now() - t0 > options.budgetMs) {
      return {
        ...cur,
        selfCalibration: {
          method: 'verdict-stability',
          depthsRun,
          finalDepth: depth,
          perPatchStable,
          stable: false,
          reason: 'budget',
        },
      };
    }
    prev = cur;
  }
  return {
    ...prev,
    selfCalibration: {
      method: 'verdict-stability',
      depthsRun,
      finalDepth: prev.depth,
      perPatchStable: {},
      stable: false,
      reason: 'max-depth',
    },
  };
}
