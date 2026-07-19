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

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

function atlas(
  styleId: string,
  styleParams: Readonly<Record<string, number>>
): {
  binding: SinglePatchAnnularRadialSolidTargetBinding;
  canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
} {
  const canonicalInput = createCanonicalTargetInputBinding(
    H32_POT_GEOMETRY,
    styleId,
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

function runComposed(
  label: string,
  styleId: string,
  styleParams: Readonly<Record<string, number>>,
  divisions: AnnularSolidReferenceTessellationOptions,
  maxElapsedMilliseconds: number,
  generousCells = false
): void {
  const startedAt = Date.now();
  try {
    const { binding, canonicalInput } = atlas(styleId, styleParams);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(
      binding,
      divisions
    );
    const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
      binding.surfaceComplex
    );
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const result = proveFinalStlMappedGeometryAndStructure(
      session,
      canonicalInput,
      target,
      jobsFor(binding, tessellation, target.targetSha256),
      {
        requestedTolerancePm: 10_000_000n,
        reservedNonGeometricMarginPm: 500_000n,
        maxElapsedMilliseconds,
        ...(generousCells
          ? {
              maxTotalWorkCells: 16_000_000,
              patchProof: { maxWorkCells: 6_000_000, maxDepth: 30 },
            }
          : {}),
      }
    );
    console.log(
      `[probe:${label}] CONVERGED tris=${tessellation.triangleCount}` +
        ` upperPm=${result.geometricTwoSidedUpperPm}` +
        ` plusReservedPm=${result.geometryPlusReservedUpperPm}` +
        ` structural=${result.structural.structurallyValid}` +
        ` elapsedMs=${Date.now() - startedAt}`
    );
  } catch (error) {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(
      `[probe:${label}] REFUSED after ${Date.now() - startedAt}ms -> ${detail.slice(0, 500)}`
    );
  }
}

/** runComposed twin driving the per-patch WORKER pool (wall-clock = max patch). */
async function runComposedParallel(
  label: string,
  styleId: string,
  styleParams: Readonly<Record<string, number>>,
  divisions: AnnularSolidReferenceTessellationOptions,
  maxElapsedMilliseconds: number,
  generousCells = false
): Promise<void> {
  const startedAt = Date.now();
  try {
    const { binding, canonicalInput } = atlas(styleId, styleParams);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(
      binding,
      divisions
    );
    const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
      binding.surfaceComplex
    );
    const programByPatch = new Map(
      binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
    );
    const jobs: ParallelMappedPatchProofJob[] = tessellation.partitions.map(
      (partition) => {
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
      }
    );
    const result = await proveFinalStlWithPatchWorkers(
      tessellation.stlBytes,
      canonicalInput,
      target,
      jobs,
      {
        requestedTolerancePm: 10_000_000n,
        reservedNonGeometricMarginPm: 500_000n,
        maxElapsedMilliseconds,
        ...(generousCells
          ? {
              maxTotalWorkCells: 16_000_000,
              patchProof: { maxWorkCells: 6_000_000, maxDepth: 30 },
            }
          : {}),
        patchWorkerCount: 6,
      }
    );
    console.log(
      `[probe:${label}] CONVERGED tris=${tessellation.triangleCount}` +
        ` upperPm=${result.geometricTwoSidedUpperPm}` +
        ` plusReservedPm=${result.geometryPlusReservedUpperPm}` +
        ` structural=${result.structural.structurallyValid}` +
        ` elapsedMs=${Date.now() - startedAt}`
    );
  } catch (error) {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(
      `[probe:${label}] REFUSED after ${Date.now() - startedAt}ms -> ${detail.slice(0, 500)}`
    );
  }
}

// ---------- Gothic conforming-chord generator (pointiness 1, diamond 0, X 0) ----------
const GOTHIC = (() => {
  const spring = 0.15;
  const archHeight = 0.7 * (1 - spring);
  const apex = spring + archHeight;
  const gateWidth = 2 * 0.04;
  const tau = 2 * Math.PI;
  const archZ = (uStyle: number): number =>
    spring + archHeight * (1 - Math.abs(Math.cos(6 * tau * uStyle)));
  // Solve archZ(u) = t on the half-arch [k/24, (k+1)/24] (monotone piece).
  const invArch = (t: number, halfArch: number): number => {
    const c = Math.min(1, Math.max(0, 1 - (t - spring) / archHeight));
    const x = Math.acos(c); // in [0, pi/2]
    const yLow = (halfArch * Math.PI) / 2;
    const yHigh = ((halfArch + 1) * Math.PI) / 2;
    for (const m of [Math.floor(halfArch / 2), Math.ceil(halfArch / 2)]) {
      for (const candidate of [m * Math.PI + x, m * Math.PI - x]) {
        if (candidate >= yLow - 1e-12 && candidate <= yHigh + 1e-12) {
          return candidate / (6 * tau);
        }
      }
    }
    throw new Error(`invArch missed t=${t} halfArch=${halfArch}`);
  };
  return { spring, archHeight, apex, gateWidth, archZ, invArch };
})();

// Eight graded offsets per side (hour-3-proven). A six-per-side regrade was
// measured 2026-07-17 and REVERTED: removing the 0.028 curve's row stacked
// the widened cross-strip sag on base-profile sag to 9,500,010 pm
// (u 0.0039..0.0078, t 0.171..0.185) while saving too few cells to matter —
// the wall volume driver was the k/64 row band, not the strip count.
const RIB_OFFSETS = [0.002, 0.0045, 0.0075, 0.011, 0.0155, 0.021, 0.028, 0.036] as const;

interface GothicLadders {
  readonly angularFractions: (readonly [number, number])[];
  readonly outerVerticalFractions: (readonly [number, number])[];
  readonly innerVerticalFractions: (readonly [number, number])[];
}

function gothicLadderFractions(): GothicLadders {
  const angularFractions: (readonly [number, number])[] = [];
  const Q = 3 * 2 ** 20;
  for (let k = 1; k < 24; k += 1) angularFractions.push([k, 24]);
  // Gate-curve termination stations u = k/12 ± uStar (archZ = spring + gateWidth)
  const uStar =
    Math.acos(1 - GOTHIC.gateWidth / GOTHIC.archHeight) / (12 * Math.PI);
  for (let k = 0; k < 12; k += 1) {
    for (const sign of [-1, 1]) {
      const value = k / 12 + sign * uStar;
      const wrapped = value - Math.floor(value);
      const numerator = Math.round(wrapped * Q);
      if (numerator > 0 && numerator < Q) angularFractions.push([numerator, Q]);
    }
  }
  // Angular spikes: columnEdge^4 at every base column k/12 AND mullion^4 at
  // every apex column (2k+1)/24 — geometric stations around every k/24.
  for (let k = 0; k < 24; k += 1) {
    for (const j of [1, 2, 4, 8]) {
      for (const sign of [-1, 1]) {
        const value = k / 24 + (sign * j) / 2048;
        const wrapped = value - Math.floor(value);
        const numerator = Math.round(wrapped * 6144);
        if (numerator > 0 && numerator < 6144) angularFractions.push([numerator, 6144]);
      }
    }
  }
  // PF_GOTHIC_H3_BASELINE=1 reproduces the hour-3 configuration exactly
  // (rows here are already hour-3; the flag disables the interior-chain
  // collar injection in gothicChordsForPatch) — the bare-baseline A/B for
  // the measured lattice. PF_GOTHIC_COLLAR=1 adds the superseded station
  // experiment on top.
  // CREASE-COLLAR stations at every base column k/12: the arch kink's
  // crossing density in du in [0.009, 0.020] is otherwise row-pitch-limited
  // (gap ~ (1/32)/slope ~ 0.0023) and the ridge slope-jump (8A/w) turns
  // that chord sag into ~9.5 um. Every razor measured this session sits in
  // that window: 9,500,004 (inner, the hour-3 +4 pm) and 9,500,096 (outer)
  // at delta 0.009..0.0125 / t 0.186..0.207; 9,500,409 same place; and the
  // k/64-band configs' 9,541,416 at delta 0.0156..0.0181 / t 0.25..0.28125.
  // Model R[um] ~ 2500 kappa g^2, kappa = 845 cos(12 pi du), verified ~5%.
  // Below delta 0.009 the spring+-o row crossings are dense enough
  // (no razor ever measured there); above 0.0198 slope growth re-densifies
  // 1/32-row crossings (R ~ 8.0 um falling). Stations — not rows: a
  // horizontal row across the strip band is cut ~768x per wall
  // (~190k cells/row measured); a station crosses each curve once (~18).
  // Interior chain vertices are NOT an option (tessellator contract:
  // chord endpoints must lie on grid lines). Pitch 0.0018 -> worst-case
  // crease chord R ~ 6.5 + ~1.5 stacked = ~8.0 um.
  // MEASURED VERDICT (2026-07-17, single-variable vs the hour-3 baseline):
  // these 168 stations cost ~9k work cells EACH (~+1.5M/wall — baseline
  // walls are ~460-500k) and BOTH walls exhaust the 2M cMPD pool. Kept
  // env-gated for reproducibility of the measured lattice; the shipped
  // collar mechanism is the interior-chain-vertex injection in
  // gothicChordsForPatch (splitter support landed 2026-07-17).
  const collarStations = process.env.PF_GOTHIC_COLLAR === '1';
  if (collarStations) {
    for (let k = 0; k < 12; k += 1) {
      for (const sign of [-1, 1]) {
        for (let m = 0; m <= 6; m += 1) {
          const value = k / 12 + sign * (0.009 + m * 0.0018);
          const wrapped = value - Math.floor(value);
          const numerator = Math.round(wrapped * Q);
          if (numerator > 0 && numerator < Q) angularFractions.push([numerator, Q]);
        }
      }
    }
  }
  // topStart = 0.53675 = 2147/4000; gate rows 3/20 and 23/100
  const outerVerticalFractions: (readonly [number, number])[] = [
    [3, 20],
    [23, 100],
    [2147, 4000],
    [149, 200],
    [133, 200],
  ];
  // Inner wall remap v = (32 t - 3)/29
  const innerVerticalFractions: (readonly [number, number])[] = [
    [9, 145],
    [109, 725],
    [1772, 3625],
    [521, 725],
    [457, 725],
  ];
  // Rib-stripe offset curves: their seam/base/apex crossings need station
  // rows; snap every special row to k/8192 (pure dyadic, smooth regions —
  // the sub-1e-4 snap sliver is quartic-smooth and certifies).
  const snapRow = (
    target: (readonly [number, number])[],
    tValue: number,
    remap: boolean
  ): void => {
    const value = remap ? (32 * tValue - 3) / 29 : tValue;
    if (value <= 0 || value >= 1) return;
    const numerator = Math.round(value * 8192);
    if (numerator > 0 && numerator < 8192) target.push([numerator, 8192]);
  };
  // TIER-BLEND rows: the topMask smoothstep swaps lower-tier relief for the
  // upper lattice across topStart +- blendW = 0.53675 +- 0.05 (blendW =
  // max(0.015, 1.25*gaBandW) at defaults). At ridge-crest columns the swap
  // delta is maximal (colEdge 0.70 / mullion 0.30 coefficients) and the
  // smoothstep curvature peaks at the BLEND ENDS (+-600/t^2): measured
  // razors 9,500,052 (outer, base column 0, t 0.500..0.531) and 9,519,144
  // (inner, apex column 23/24, t 0.490..0.519) at 1/32 pitch — the
  // 84,000 um/t^2 * (1/32)^2 / 8 ~ 10.3 um class. Halving the pitch across
  // both ends prices ~2.6-3.6 um. First razors ever found PAST the collar:
  // envelope v4 let the sweeps reach this zone for the first time.
  for (const numerator of [31, 33, 37]) {
    snapRow(outerVerticalFractions, numerator / 64, false);
    snapRow(innerVerticalFractions, numerator / 64, true);
  }
  // bandMid RIDGE FLANK rows: the tier divider is itself a quartic ridge
  // crest AT topStart (ridge(t - topStart, 1.8*gaBandW = 0.072, 4)); the
  // crest is a conforming named row, but its flanks (f'' ~ 104k um/t^2 at
  // the measured amplitudes) over the remaining 0.016-0.026 row gaps price
  // the two depth-30 razors 9,500,001 (inner, seam column, t 0.519..0.537)
  // and 9,500,045 (outer, delta 0.032, t 0.516..0.531). One row per flank
  // halves the pitch: ~1.4-2.9 um.
  for (const tValue of [0.5265, 0.5495]) {
    snapRow(outerVerticalFractions, tValue, false);
    snapRow(innerVerticalFractions, tValue, true);
  }
  // bandMid upper-flank continuation + bandRim flank (v14-screen pins):
  // t = 0.5625 exists as a dyadic row on the OUTER wall but not in the
  // inner's remapped ladder — its absence prices 9,500,002 pm at
  // delta 0.034, t 0.5495..0.5752 (inner). The RIM band ridge (crest at
  // t = 1.0, same 1.8*gaBandW quartic) needs its flank split: 63/64 kills
  // the 9,500,001 pm seam-column cell at t 31/32..1; the symmetric base
  // band is inert under topMask ~ 0. The rim row crosses no strips
  // (curves end at apex+0.036 = 0.781) — near-zero cell cost.
  for (const tValue of [0.5625, 63 / 64]) {
    snapRow(outerVerticalFractions, tValue, false);
    snapRow(innerVerticalFractions, tValue, true);
  }
  // Hour-3 row set, unconditional: spring AND apex +-o rows. This is the
  // proven-cheap base (walls ~460-500k cells); the collar deficit it leaves
  // is carried by interior CHAIN vertices on the kink curve (see
  // gothicChordsForPatch), not by rows — every row/station collar mechanism
  // was measured at >= 3x the envelope headroom (matrix Addendum 16).
  for (const offset of RIB_OFFSETS) {
    for (const tValue of [
      GOTHIC.spring - offset,
      GOTHIC.spring + offset,
      GOTHIC.apex - offset,
      GOTHIC.apex + offset,
    ]) {
      snapRow(outerVerticalFractions, tValue, false);
      snapRow(innerVerticalFractions, tValue, true);
    }
  }
  // NO k/64 row bands. Both the hour-4 base-sag band (k = 4..16) and the
  // collar band (k = 13..20) were measured 2026-07-17 as the
  // breadth-x-breadth cell driver: any global 1/64 row crossing the strip
  // zone costs 300k+ work cells/wall and exhausts the 2M cMPD pool.
  // The crease-collar resolution those rows carried lives in the kink
  // CHAIN itself now (interior collar vertices in gothicChordsForPatch).
  return { angularFractions, outerVerticalFractions, innerVerticalFractions };
}

interface LadderLike {
  readonly log2Denominator: number;
  readonly numerators: readonly number[];
  readonly oddDenominatorFactor?: number;
}

function gothicChordsForPatch(
  patch: 'outer' | 'inner',
  angularLadder: LadderLike,
  verticalLadder: LadderLike
): { denominator: string; start: { uNumerator: string; vNumerator: string }; end: { uNumerator: string; vNumerator: string } }[] {
  const angularDen =
    (angularLadder.oddDenominatorFactor ?? 1) * 2 ** angularLadder.log2Denominator;
  const verticalDen =
    (verticalLadder.oddDenominatorFactor ?? 1) * 2 ** verticalLadder.log2Denominator;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const denominator = (angularDen / gcd(angularDen, verticalDen)) * verticalDen;
  const uScale = denominator / angularDen;
  const vScale = denominator / verticalDen;
  // Patch-coordinate transforms: outer wall is identity (v = t); inner wall
  // reverses u and remaps t = (3 + 29 v)/32  =>  v = (32 t - 3)/29.
  const styleU = (uPatch: number): number => (patch === 'outer' ? uPatch : 1 - uPatch);
  const patchU = (uStyle: number): number => (patch === 'outer' ? uStyle : 1 - uStyle);
  const patchV = (t: number): number => (patch === 'outer' ? t : (32 * t - 3) / 29);
  const tOf = (vPatch: number): number =>
    patch === 'outer' ? vPatch : (3 + 29 * vPatch) / 32;
  const chords: {
    denominator: string;
    start: { uNumerator: string; vNumerator: string };
    end: { uNumerator: string; vNumerator: string };
  }[] = [];
  interface Crossing {
    readonly uPatch: number;
    readonly vPatch: number;
    /** exact numerators over `denominator` */
    readonly uNumerator: number;
    readonly vNumerator: number;
  }
  const isCorner = (point: Crossing): boolean =>
    Number.isInteger((point.uNumerator / uScale)) &&
    angularLadder.numerators.includes(point.uNumerator / uScale) &&
    Number.isInteger((point.vNumerator / vScale)) &&
    verticalLadder.numerators.includes(point.vNumerator / vScale);
  const collapseRuns = (points: Crossing[]): Crossing[] => {
    // Near the flat arch base several consecutive crossings share one station
    // row (the curve runs along it): keep ONE representative per run
    // (preferring a grid corner) so the chain jumps diagonally and leaves no
    // hanging mid-edge vertices.
    const result: Crossing[] = [];
    let index = 0;
    while (index < points.length) {
      let runEnd = index;
      while (
        runEnd + 1 < points.length &&
        (points[runEnd + 1].vNumerator === points[index].vNumerator ||
          points[runEnd + 1].uNumerator === points[index].uNumerator)
      ) {
        runEnd += 1;
      }
      let representative = points[index];
      for (let cursor = index; cursor <= runEnd; cursor += 1) {
        if (isCorner(points[cursor])) representative = points[cursor];
      }
      result.push(representative);
      index = runEnd + 1;
    }
    return result;
  };
  const pushChain = (rawPoints: Crossing[]): void => {
    const points = collapseRuns(rawPoints);
    for (let index = 0; index + 1 < points.length; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (a.uNumerator === b.uNumerator && a.vNumerator === b.vNumerator) continue;
      if (a.uNumerator === b.uNumerator || a.vNumerator === b.vNumerator) continue;
      chords.push({
        denominator: denominator.toString(),
        start: { uNumerator: a.uNumerator.toString(), vNumerator: a.vNumerator.toString() },
        end: { uNumerator: b.uNumerator.toString(), vNumerator: b.vNumerator.toString() },
      });
    }
  };
  const curves: { offset: number; tMin: number; tMax: number; fullPeriod: boolean }[] = [
    { offset: 0, tMin: GOTHIC.spring, tMax: GOTHIC.apex, fullPeriod: true },
    {
      offset: GOTHIC.gateWidth,
      tMin: GOTHIC.spring,
      tMax: GOTHIC.apex - GOTHIC.gateWidth,
      fullPeriod: false,
    },
  ];
  for (const ribOffset of RIB_OFFSETS) {
    // t = archZ - o (below the kink) and t = archZ + o (above): full-period
    // smooth offset curves resolving the quartic rib stripe.
    curves.push({
      offset: ribOffset,
      tMin: Math.max(1 / 8192, GOTHIC.spring - ribOffset),
      tMax: GOTHIC.apex - ribOffset,
      fullPeriod: true,
    });
    curves.push({
      offset: -ribOffset,
      tMin: GOTHIC.spring + ribOffset,
      tMax: Math.min(1 - 1 / 8192, GOTHIC.apex + ribOffset),
      fullPeriod: true,
    });
  }
  for (const curve of curves) {
    const crossings: Crossing[] = [];
    const seen = new Set<string>();
    const add = (uNumerator: number, vNumerator: number): void => {
      const key = `${uNumerator},${vNumerator}`;
      if (seen.has(key)) return;
      seen.add(key);
      crossings.push({
        uPatch: uNumerator / denominator,
        vPatch: vNumerator / denominator,
        uNumerator,
        vNumerator,
      });
    };
    if (curve.fullPeriod) {
      // Explicit seam corners: the curve value at the seam is a snapped
      // station row, so (0, row) and (1, row) are grid corners that anchor
      // the global chain (legal seam endpoints per the corner exemption).
      const tSeam = GOTHIC.archZ(0) - curve.offset;
      const vSeam = patchV(tSeam);
      const seamNumerator = Math.round(vSeam * denominator);
      const snapToVertical = (raw: number): number => {
        let best = verticalLadder.numerators[0] * vScale;
        for (const stationNumerator of verticalLadder.numerators) {
          const scaled = stationNumerator * vScale;
          if (Math.abs(scaled - raw) < Math.abs(best - raw)) best = scaled;
        }
        return best;
      };
      const seamRow = snapToVertical(seamNumerator);
      add(0, seamRow);
      add(denominator, seamRow);
    }
    for (let halfArch = 0; halfArch < 24; halfArch += 1) {
      // Column crossings: every angular station inside the half-arch. For
      // full-period curves the LEFT boundary station is included too (the
      // curve's base minimum / apex sits on half-arch boundaries and the
      // global chain must pivot through that column).
      for (const angularNumerator of angularLadder.numerators) {
        const uP = angularNumerator / angularDen;
        const uS = styleU(uP);
        const inside = curve.fullPeriod
          ? uS >= halfArch / 24 - 1e-12 &&
            uS < (halfArch + 1) / 24 - 1e-12 &&
            angularNumerator > 0 &&
            angularNumerator < angularDen
          : uS > halfArch / 24 + 1e-12 && uS < (halfArch + 1) / 24 - 1e-12;
        if (!inside) continue;
        const t = GOTHIC.archZ(uS) - curve.offset;
        if (t < curve.tMin - 1e-12 || t > curve.tMax + 1e-12) continue;
        const vP = patchV(Math.min(curve.tMax, Math.max(curve.tMin, t)));
        if (vP < -1e-12 || vP > 1 + 1e-12) continue;
        add(angularNumerator * uScale, Math.round(vP * denominator));
      }
      // INTERIOR CHAIN COLLAR VERTICES (kink curve AND near-kink offset
      // curves |o| <= 0.0075, base columns only): crossing density in du in
      // [0.0039, 0.0231] is otherwise row-pitch-limited (g ~ 0.0023-0.003)
      // and both mechanisms razor-fail there — the kink via its slope jump
      // 8A/w (R ~ 2500 kappa g^2; cells 9,500,004/9,500,096) and the near-
      // kink offsets via the quartic flank slope f'(o) = (4A/w)(1-o/w)^3
      // (R ~ kappa g^2/8 * f'; kink-only injection measured 9,500,182/
      // 9,500,597 on cells bounded by the 0.002 curve's coarse chords).
      // The window marches outward with the flank slope: at |o| = 0.011 the
      // measured collar row-crossing gaps reach ~0.0038 and price at
      // ~9.5 um (probe: 9,500,159 pm between the +0.0075 and +0.011
      // curves) => 0.011 is inside the window. A |o| <= 0.016 window
      // (adding 0.0155 too) was measured 2026-07-17 to balloon the walls
      // past the 2M pool (outer ~0.4M -> >2M) — the injection's cost is
      // steeply nonlinear in overlapping windows, so the window stops at
      // 0.0112 and the 0.0155 curve rides its row crossings
      // (f' ~ 4,596 um/unit-t => ~7 um at the measured gaps).
      // Apex corners have LINEAR flanks and need nothing. Interior degree-2
      // pass-through vertices — legal since the splitter extension — carry
      // this at zero grid breadth: pitch 0.0012 => worst chord ~3 um.
      // ASYMMETRIC window: above-kink curves (offset <= 0, t >= archZ) get
      // the wider 0.0112 window — every razor ever measured is above-kink
      // or on-kink (t >= 0.186), where rows are sparse. Below-kink curves
      // ride the dense spring-o row band (the tongue): injecting them at
      // |o| = 0.011 was measured to double-cover that band into a work-cell
      // explosion (outer ~0.4M -> >2M).
      if (
        (curve.offset <= 0
          ? curve.offset >= -0.0112
          : curve.offset <= 0.0076) &&
        curve.fullPeriod &&
        process.env.PF_GOTHIC_H3_BASELINE !== '1'
      ) {
        for (const sign of [-1, 1]) {
          const boundary = sign === 1 ? halfArch : halfArch + 1;
          if (boundary % 2 !== 0) continue;
          for (let m = 0; m <= 16; m += 1) {
            const uRaw =
              boundary / 24 + sign * (0.0039 + m * 0.0012);
            const uS = uRaw - Math.floor(uRaw);
            const inside =
              uS >= halfArch / 24 - 1e-12 && uS < (halfArch + 1) / 24 - 1e-12;
            if (!inside) continue;
            const t = GOTHIC.archZ(uS) - curve.offset;
            if (t < curve.tMin - 1e-12 || t > curve.tMax + 1e-12) continue;
            const uP = patchU(uS);
            if (uP <= 1e-12 || uP >= 1 - 1e-12) continue;
            add(Math.round(uP * denominator), Math.round(patchV(t) * denominator));
          }
        }
      }
      // Row crossings: every vertical station whose t lies in the curve range.
      for (const verticalNumerator of verticalLadder.numerators) {
        const vP = verticalNumerator / verticalDen;
        const t = tOf(vP);
        const tCurve = t + curve.offset; // archZ value at the crossing
        if (
          tCurve < GOTHIC.spring - 1e-12 ||
          tCurve > GOTHIC.apex + 1e-12 ||
          t < curve.tMin - 1e-12 ||
          t > curve.tMax + 1e-12
        ) {
          continue;
        }
        const uS = GOTHIC.invArch(Math.min(GOTHIC.apex, Math.max(GOTHIC.spring, tCurve)), halfArch);
        const uP = patchU(uS);
        let uNumerator = Math.round(uP * denominator);
        // Chain terminations (the spring row) must land on grid corners:
        // snap u to the nearest angular station so the chain ends cleanly.
        if (Math.abs(t - curve.tMin) < 1e-9) {
          let best = angularLadder.numerators[0];
          for (const stationNumerator of angularLadder.numerators) {
            if (
              Math.abs(stationNumerator / angularDen - uP) <
              Math.abs(best / angularDen - uP)
            ) {
              best = stationNumerator;
            }
          }
          uNumerator = best * uScale;
        }
        add(uNumerator, verticalNumerator * vScale);
      }
    }
    crossings.sort((left, right) => left.uNumerator - right.uNumerator);
    pushChain(crossings);
  }
  return chords;
}

describe('slice-11 probes (env-gated, session-local)', () => {
  it.skipIf(!process.env.PF_SLICE11_GO_SAG)(
    'Gothic TRUE-sag map over the actual ladder grid (outer + inner walls)',
    { timeout: 600_000 },
    () => {
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(6, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(6, ladders.innerVerticalFractions);
      const { binding } = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0.2,
      });
      const angularDen =
        (angularLadder.oddDenominatorFactor ?? 1) * 2 ** angularLadder.log2Denominator;
      const uValues = angularLadder.numerators.map((n) => n / angularDen);
      const sagMap = (patchId: string, vertical: LadderLike): void => {
        const verticalDen =
          (vertical.oddDenominatorFactor ?? 1) * 2 ** vertical.log2Denominator;
        const vValues = vertical.numerators.map((n) => n / verticalDen);
        const program = binding.programs.find((p2) => p2.patchId === patchId);
        if (program === undefined) throw new Error(`no ${patchId}`);
        const evaluate = program.backends.evaluateFloat64;
        let maxSag = 0;
        let argU = 0;
        let argV = 0;
        for (let vCell = 0; vCell + 1 < vValues.length; vCell += 1) {
          for (let uCell = 0; uCell + 1 < uValues.length; uCell += 1) {
            const u0 = uValues[uCell];
            const u1 = uValues[uCell + 1];
            const v0 = vValues[vCell];
            const v1 = vValues[vCell + 1];
            const c00 = evaluate(u0, v0);
            const c10 = evaluate(u1, v0);
            const c11 = evaluate(u1, v1);
            const c01 = evaluate(u0, v1);
            for (const [a, b, c, uS, vS] of [
              [c00, c10, c11, (u0 + u1 + u1) / 3, (v0 + v0 + v1) / 3],
              [c00, c11, c01, (u0 + u1 + u0) / 3, (v0 + v1 + v1) / 3],
            ] as const) {
              const interp = [
                (a[0] + b[0] + c[0]) / 3,
                (a[1] + b[1] + c[1]) / 3,
                (a[2] + b[2] + c[2]) / 3,
              ];
              const truePoint = evaluate(uS, vS);
              const sag = Math.hypot(
                truePoint[0] - interp[0],
                truePoint[1] - interp[1],
                truePoint[2] - interp[2]
              );
              if (sag > maxSag) {
                maxSag = sag;
                argU = uS;
                argV = vS;
              }
            }
          }
        }
        console.log(
          `[probe:go-sag] ${patchId} maxCentroidSag=${(maxSag * 1000).toFixed(2)}um at (${argU.toFixed(6)}, ${argV.toFixed(6)})`
        );
      };
      sagMap('outer-wall', outerVertical);
      sagMap('inner-wall', innerVertical);
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GO_DENSE)(
    'Gothic dense displacement + sag map in the failing seam-base box',
    { timeout: 300_000 },
    () => {
      const relief = 0.2;
      const styled = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: relief,
      }).binding;
      const flat = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0,
      }).binding;
      const program = (binding: SinglePatchAnnularRadialSolidTargetBinding) => {
        const outer = binding.programs.find((p2) => p2.patchId === 'outer-wall');
        if (outer === undefined) throw new Error('no outer');
        return outer;
      };
      const styledOuter = program(styled);
      const flatOuter = program(flat);
      const radius = (prog: ReturnType<typeof program>, u: number, v: number): number => {
        const point = prog.backends.evaluateFloat64(u, v);
        return Math.hypot(point[0], point[1]);
      };
      // displacement profile along t at u=0.002 and along u at t=0.1385
      let line = 'v-scan u=0.002:';
      for (let j = 0; j <= 20; j += 1) {
        const v = 0.128 + (0.024 * j) / 20;
        const d = (radius(styledOuter, 0.002, v) - radius(flatOuter, 0.002, v)) / relief;
        line += ` ${v.toFixed(4)}:${d.toFixed(4)}`;
      }
      console.log(`[probe:go-dense] ${line}`);
      line = 'u-scan t=0.1385:';
      for (let i = 0; i <= 20; i += 1) {
        const u = 0 + (0.006 * i) / 20;
        const d = (radius(styledOuter, u, 0.1385) - radius(flatOuter, u, 0.1385)) / relief;
        line += ` ${u.toFixed(5)}:${d.toFixed(4)}`;
      }
      console.log(`[probe:go-dense] ${line}`);
      // true sag at the failing cell scale (1/256 both axes) via mid-vs-mean
      let maxSag = 0;
      let argU = 0;
      let argV = 0;
      const h = 1 / 256;
      for (let i = 0; i <= 40; i += 1) {
        for (let j = 0; j <= 40; j += 1) {
          const u = 0 + (0.008 * i) / 40;
          const v = 0.125 + (0.03 * j) / 40;
          const mid = radius(styledOuter, u, v);
          const mean =
            (radius(styledOuter, u - h / 2, v - h / 2) +
              radius(styledOuter, u + h / 2, v + h / 2)) /
            2;
          const sag = Math.abs(mid - mean);
          if (sag > maxSag) {
            maxSag = sag;
            argU = u;
            argV = v;
          }
        }
      }
      console.log(
        `[probe:go-dense] diag-sag(h=1/256) max=${(maxSag * 1000).toFixed(2)}um at (${argU.toFixed(5)}, ${argV.toFixed(4)})`
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GY_SAG)(
    'Gyroid TRUE-sag map over outer wall + bottom-top at the probe grid',
    { timeout: 600_000 },
    () => {
      const { binding } = atlas('GyroidManifold', { gm_relief: 0.25, gm_edge_fade: 1 });
      const angular = 1024;
      const sagMap = (patchId: string, rows: number): void => {
        const program = binding.programs.find((p) => p.patchId === patchId);
        if (program === undefined) throw new Error(`no ${patchId}`);
        const evaluate = program.backends.evaluateFloat64;
        let maxSag = 0;
        let argU = 0;
        let argV = 0;
        for (let vCell = 0; vCell < rows; vCell += 1) {
          for (let uCell = 0; uCell < angular; uCell += 1) {
            const u0 = uCell / angular;
            const u1 = (uCell + 1) / angular;
            const v0 = vCell / rows;
            const v1 = (vCell + 1) / rows;
            const c00 = evaluate(u0, v0);
            const c10 = evaluate(u1, v0);
            const c11 = evaluate(u1, v1);
            const c01 = evaluate(u0, v1);
            // Sample the two triangle centroids against the true surface.
            for (const [a, b, c, uS, vS] of [
              [c00, c10, c11, (u0 + u1 + u1) / 3, (v0 + v0 + v1) / 3],
              [c00, c11, c01, (u0 + u1 + u0) / 3, (v0 + v1 + v1) / 3],
            ] as const) {
              const interp = [
                (a[0] + b[0] + c[0]) / 3,
                (a[1] + b[1] + c[1]) / 3,
                (a[2] + b[2] + c[2]) / 3,
              ];
              const truePoint = evaluate(uS, vS);
              const sag = Math.hypot(
                truePoint[0] - interp[0],
                truePoint[1] - interp[1],
                truePoint[2] - interp[2]
              );
              if (sag > maxSag) {
                maxSag = sag;
                argU = uS;
                argV = vS;
              }
            }
          }
        }
        console.log(
          `[probe:gy-sag] ${patchId} maxCentroidSag=${(maxSag * 1000).toFixed(3)}um` +
            ` at (${argU.toFixed(5)}, ${argV.toFixed(5)})`
        );
      };
      sagMap('outer-wall', 128);
      sagMap('bottom-top', 32);
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GY_DENSE)(
    'Gyroid dense sampling at the failing outer-wall cell: style vs base profile',
    { timeout: 300_000 },
    () => {
      const styled = atlas('GyroidManifold', { gm_relief: 0.25, gm_edge_fade: 1 }).binding;
      const flat = atlas('GyroidManifold', { gm_relief: 0, gm_edge_fade: 1 }).binding;
      const pick = (
        binding: SinglePatchAnnularRadialSolidTargetBinding,
        patchId: string
      ) => {
        const program = binding.programs.find((p) => p.patchId === patchId);
        if (program === undefined) throw new Error(`no ${patchId}`);
        return program;
      };
      const radius = (program: ReturnType<typeof pick>, u: number, v: number): number => {
        const point = program.backends.evaluateFloat64(u, v);
        return Math.hypot(point[0], point[1]);
      };
      const zOf = (program: ReturnType<typeof pick>, u: number, v: number): number =>
        program.backends.evaluateFloat64(u, v)[2];
      const styledOuter = pick(styled, 'outer-wall');
      const flatOuter = pick(flat, 'outer-wall');
      // Style contribution in the failing box
      let maxStyle = 0;
      for (let i = 0; i <= 60; i += 1) {
        for (let j = 0; j <= 60; j += 1) {
          const u = 0.0322 + (0.002 * i) / 60;
          const v = 0.0 + (0.05 * j) / 60;
          maxStyle = Math.max(
            maxStyle,
            Math.abs(radius(styledOuter, u, v) - radius(flatOuter, u, v))
          );
        }
      }
      // Base chord error along v at the w7 row pitch (second difference / 2),
      // in BOTH r and z, near the bottom rows.
      const h = 1 / 128;
      let maxBaseChord = 0;
      let argV = 0;
      for (let j = 1; j <= 12; j += 1) {
        const v = j * (h / 4);
        const rMid = radius(flatOuter, 0.0322, v);
        const rAvg =
          (radius(flatOuter, 0.0322, v - h / 4) + radius(flatOuter, 0.0322, v + h / 4)) / 2;
        const zMid = zOf(flatOuter, 0.0322, v);
        const zAvg =
          (zOf(flatOuter, 0.0322, v - h / 4) + zOf(flatOuter, 0.0322, v + h / 4)) / 2;
        const chord = Math.hypot(rMid - rAvg, zMid - zAvg) * 4; // scale (h/4)^2 -> h^2 is x16, /4 midpoint = x4… report raw too
        if (chord > maxBaseChord) {
          maxBaseChord = chord;
          argV = v;
        }
      }
      console.log(
        `[probe:gy-dense] maxStyleContribution=${(maxStyle * 1000).toFixed(3)}um` +
          ` baseChordProxy(h/4 pitch x4)=${(maxBaseChord * 1000).toFixed(3)}um argV=${argV.toFixed(5)}`
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_VOR_PP)(
    'Voronoi bubble PER-PATCH isolation + failing-cell UV',
    { timeout: 900_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const { binding } = atlas('Voronoi', { v_morph: 0, v_relief: 0.04 });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 7,
          'inner-wall': 7,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'inner-wall': rationalStationLadder(7, [
            [1, 29],
            [5, 29],
            [9, 29],
            [13, 29],
            [17, 29],
            [21, 29],
            [25, 29],
          ]),
        },
      });
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
              maximumGeometricUpperPm: 9_500_000n,
              deadlineEpochMilliseconds: Date.now() + 90_000,
            }
          );
          console.log(
            `[probe:vpp] ${job.partition.patchId} OK upperPm=${result.targetToMeshUpperPm}` +
              ` cells=${result.workCellCount} maxDepth=${result.maximumDepthReached}` +
              ` elapsedMs=${Date.now() - startedAt}`
          );
        } catch (error) {
          const err = error as {
            message?: string;
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
            `[probe:vpp] ${job.partition.patchId} REFUSED after ${Date.now() - startedAt}ms` +
              ` -> ${err.message?.slice(0, 160)}${uvNote}`
          );
        }
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_GOTHIC_STL)(
    'emit the CERTIFIED Gothic STL (exact certified config; bytes = the artifact)',
    { timeout: 300_000 },
    async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { sha256Utf8 } = await import(
        '../../src/geometry/targetSolid/incrementalSha256'
      );
      const { createFinalArtifactProofSession: mintSession } = await import(
        '../../src/geometry/targetSolid/finalArtifactProofSession'
      );
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(5, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(5, ladders.innerVerticalFractions);
      const outerChords = gothicChordsForPatch('outer', angularLadder, outerVertical);
      const innerChords = gothicChordsForPatch('inner', angularLadder, innerVertical);
      const { binding } = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0.2,
      });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 8,
        angularStations: angularLadder,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'outer-wall': outerVertical,
          'inner-wall': innerVertical,
        },
        conformingChordsByPatch: {
          'outer-wall': outerChords,
          'inner-wall': innerChords,
        },
      });
      const session = mintSession(tessellation.stlBytes);
      const directory = join(__dirname, '..', 'exchange', '_certified_stl');
      mkdirSync(directory, { recursive: true });
      const stlPath = join(directory, 'GothicArches_p1_H32_OD30_certified.stl');
      writeFileSync(stlPath, tessellation.stlBytes);
      const note = [
        'GothicArches p=1 (gaPointiness 1, gaDiamond 0, gaRelief 0.2), H32/OD30/drain6 — CERTIFIED 2026-07-17',
        'certificate: CONVERGED 9,499,997 pm two-sided (geometric budget 9,500,000 pm; plusReserved 9,999,997 <= 10,000,000 pm = 0.01 mm), structural TRUE',
        `triangles=${tessellation.triangleCount} bytes=${tessellation.stlBytes.byteLength}`,
        `artifactByteSha256=${session.byteSha256}`,
        `parsedTriangleSetSha256=${session.parsedTriangleSetSha256}`,
        'config: gothic-p1-a8w5-chain (spike harness) + envelope v4 + maxDepth 30 + compiler v14 triangle-exact screen; matrix Addendum 20',
        `methodNote=${sha256Utf8('emitted by PF_GOTHIC_STL from the exact certified tessellation path').slice(0, 16)}`,
      ].join('\n');
      writeFileSync(stlPath.replace(/\.stl$/, '.certificate.txt'), `${note}\n`);
      console.log(
        `[probe:stl] wrote ${stlPath} tris=${tessellation.triangleCount}` +
          ` bytes=${tessellation.stlBytes.byteLength} sha256=${session.byteSha256}`
      );
      expect(tessellation.triangleCount).toBe(304808);
      expect(tessellation.stlBytes.byteLength).toBe(84 + 304808 * 50);
    }
  );

  it.skipIf(!process.env.PF_GOTHIC_ERRORBAKE)(
    'bake per-triangle true-3D error sidecar from the certified residual programs',
    // The certified bake measured 86 min (58.9M enclosures) — the at-budget
    // checks spend prover-grade effort on razor triangles by design.
    { timeout: 10_800_000 },
    async () => {
      // Measured overlay for potscope `view --error`: per artifact triangle,
      // an upper estimate of sup ||target - flat-triangle|| (mm) obtained by
      // greedy max-refinement of residual enclosures over the SAME compiled
      // per-patch programs the certificate used. Truth stays single-source;
      // this block only orchestrates and serialises.
      // NOTE (2026-07-19): the certifies-at core was EXTRACTED verbatim to
      // `_certifiesAtBakeLib.ts` (canonical copy; the WI spike consumes it).
      // Rewire this block to the lib on its next scheduled bake and validate
      // against the recorded certified stats (max=budget, p50 2.5 um, 0
      // unconverged) — do not let the two copies drift.
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { createFinalArtifactProofSession: mintSession } = await import(
        '../../src/geometry/targetSolid/finalArtifactProofSession'
      );
      const variant =
        process.env.PF_GOTHIC_ERRORBAKE === 'coarse' ? 'coarse' : 'certified';
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(
        5,
        variant === 'coarse' ? [] : ladders.outerVerticalFractions
      );
      const innerVertical = rationalStationLadder(
        5,
        variant === 'coarse' ? [] : ladders.innerVerticalFractions
      );
      const { binding } = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0.2,
      });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 8,
        angularStations: angularLadder,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'outer-wall': outerVertical,
          'inner-wall': innerVertical,
        },
        ...(variant === 'coarse'
          ? {}
          : {
              conformingChordsByPatch: {
                'outer-wall': gothicChordsForPatch('outer', angularLadder, outerVertical),
                'inner-wall': gothicChordsForPatch('inner', angularLadder, innerVertical),
              },
            }),
      });
      const session = mintSession(tessellation.stlBytes);
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const programByPatch = new Map(
        binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
      );
      const stl = Buffer.from(
        tessellation.stlBytes.buffer,
        tessellation.stlBytes.byteOffset,
        tessellation.stlBytes.byteLength
      );
      const errors = new Float32Array(tessellation.triangleCount).fill(Number.NaN);
      // Certifies-at ladder: per triangle we bisect over these thresholds with
      // the prover's accept rule (prune any cell whose enclosure upper <= T;
      // the pointwise incumbent is a definitive fail witness when it exceeds
      // T). Direct sup estimation starves on crease-band triangles — covering
      // a crease needs O(2^depth) cells, so any split cap leaves fat uppers
      // and false hot spots. Accept-pruning is exactly what makes the real
      // certification tractable; the sidecar value is a GUARANTEE ("this
      // triangle certifies at <= T"), not a sample.
      const LADDER_MM = [0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64];
      const START_LEVEL = 2; // 0.01 mm — the export standard
      const MAX_DEPTH = 24;
      // At-or-above the budget the verdict is truth-bearing (a false 'unknown'
      // paints an over-budget colour on a certified pot) — spend prover-grade
      // effort there. Below budget the level only quantises the quiet zone —
      // spend little. The real prover needed depth up to 30 on razor cells.
      const checkSplitsFor = (thresholdMm: number): number =>
        thresholdMm >= 0.01 ? 20000 : 400;
      let enclosureCount = 0;
      let fallbackCount = 0;
      let unconvergedCount = 0;
      let unknownCheckCount = 0;
      const artifact = new Float64Array(9);
      const uN = new Float64Array(3);
      const vN = new Float64Array(3);
      const bary = new Float64Array(9);
      const startedAt = Date.now();
      for (const partition of tessellation.partitions) {
        const programCanonicalJson = programByPatch.get(
          partition.patchId as (typeof binding.programs)[number]['patchId']
        );
        if (programCanonicalJson === undefined) {
          throw new Error(`missing program for partition patch '${partition.patchId}'`);
        }
        const evaluator = compileValidatedResidualEvaluator({
          targetSha256: target.targetSha256,
          programCanonicalJson,
        });
        const oddFactor = partition.oddDenominatorFactor ?? '1';
        const oddNumeric = Number(oddFactor);
        for (const mapping of partition.triangles) {
          const at = 84 + mapping.artifactTriangleIndex * 50 + 12;
          for (let i = 0; i < 9; i += 1) artifact[i] = stl.readFloatLE(at + i * 4);
          const uBase = mapping.vertices.map((vertex) => Number(vertex.uNumerator));
          const vBase = mapping.vertices.map((vertex) => Number(vertex.vNumerator));
          const enclose = (weights: readonly number[], depth: number): number => {
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
            const distanceToZero = (interval: { lower: number; upper: number }): number =>
              interval.lower > 0 ? interval.lower : interval.upper < 0 ? -interval.upper : 0;
            const ax = Math.max(Math.abs(enclosure.xMm.lower), Math.abs(enclosure.xMm.upper));
            const ay = Math.max(Math.abs(enclosure.yMm.lower), Math.abs(enclosure.yMm.upper));
            const az = Math.max(Math.abs(enclosure.zMm.lower), Math.abs(enclosure.zMm.upper));
            return {
              upper: Math.hypot(ax, ay, az),
              lower: Math.hypot(
                distanceToZero(enclosure.xMm),
                distanceToZero(enclosure.yMm),
                distanceToZero(enclosure.zMm)
              ),
            };
          };
          const twice = (p: readonly number[]): number[] => p.map((x) => 2 * x);
          const mid = (p: readonly number[], q: readonly number[]): number[] =>
            p.map((x, i) => x + q[i]);
          // Pointwise incumbent: descend central children of a cell so the
          // probe cell shrinks 2^-k toward its medial point; the enclosure's
          // distance-to-zero norm there is a sound lower bound on the
          // triangle's residual supremum.
          const probeLower = (weights: readonly number[], depth: number): number => {
            let w = weights;
            let d = depth;
            for (let k = 0; k < 6; k += 1) {
              const a = w.slice(0, 3);
              const b = w.slice(3, 6);
              const c = w.slice(6, 9);
              w = [...mid(a, b), ...mid(b, c), ...mid(a, c)];
              d += 1;
            }
            return enclose(w, d).lower;
          };
          type BakeCell = { readonly w: readonly number[]; readonly depth: number; upper: number };
          const rootWeights = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
          let incumbent = 0;
          const certifiesAt = (thresholdMm: number): 'yes' | 'no' | 'unknown' => {
            if (incumbent > thresholdMm) return 'no';
            const cells: BakeCell[] = [
              { w: rootWeights, depth: 0, upper: enclose(rootWeights, 0).upper },
            ];
            const checkSplits = checkSplitsFor(thresholdMm);
            let splits = 0;
            while (splits < checkSplits) {
              for (let i = cells.length - 1; i >= 0; i -= 1) {
                if (cells[i].upper <= thresholdMm) {
                  cells[i] = cells[cells.length - 1];
                  cells.pop();
                }
              }
              if (cells.length === 0) return 'yes';
              let worstIndex = 0;
              for (let i = 1; i < cells.length; i += 1) {
                if (cells[i].upper > cells[worstIndex].upper) worstIndex = i;
              }
              const worst = cells[worstIndex];
              if (worst.depth >= MAX_DEPTH) return 'unknown';
              incumbent = Math.max(incumbent, probeLower(worst.w, worst.depth));
              if (incumbent > thresholdMm) return 'no';
              cells[worstIndex] = cells[cells.length - 1];
              cells.pop();
              const a = worst.w.slice(0, 3);
              const b = worst.w.slice(3, 6);
              const c = worst.w.slice(6, 9);
              const children = [
                [...twice(a), ...mid(a, b), ...mid(a, c)],
                [...mid(a, b), ...twice(b), ...mid(b, c)],
                [...mid(a, c), ...mid(b, c), ...twice(c)],
                [...mid(a, b), ...mid(b, c), ...mid(a, c)],
              ];
              for (const w of children) {
                const upper = enclose(w, worst.depth + 1).upper;
                if (upper > thresholdMm) cells.push({ w, depth: worst.depth + 1, upper });
              }
              splits += 1;
            }
            return 'unknown';
          };
          let level = START_LEVEL;
          let verdict = certifiesAt(LADDER_MM[level]);
          if (verdict === 'yes') {
            while (level > 0 && certifiesAt(LADDER_MM[level - 1]) === 'yes') level -= 1;
            errors[mapping.artifactTriangleIndex] = LADDER_MM[level];
          } else {
            if (verdict === 'unknown') unknownCheckCount += 1;
            let certified = false;
            while (level + 1 < LADDER_MM.length) {
              level += 1;
              const step = certifiesAt(LADDER_MM[level]);
              if (step === 'unknown') unknownCheckCount += 1;
              if (step === 'yes') {
                certified = true;
                break;
              }
            }
            if (certified) {
              errors[mapping.artifactTriangleIndex] = LADDER_MM[level];
            } else {
              unconvergedCount += 1;
              errors[mapping.artifactTriangleIndex] = LADDER_MM[LADDER_MM.length - 1] * 2;
            }
          }
        }
        console.log(
          `[probe:errorbake] ${partition.patchId} done tris=${partition.triangles.length}` +
            ` enclosures=${enclosureCount} elapsedMs=${Date.now() - startedAt}`
        );
      }
      for (let i = 0; i < errors.length; i += 1) {
        if (Number.isNaN(errors[i])) throw new Error(`triangle ${i} not covered by any partition`);
      }
      const sorted = Float32Array.from(errors).sort();
      const quantile = (f: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
      const maxMm = sorted[sorted.length - 1];
      const header = JSON.stringify({
        magic: 'potscope-error/v1',
        style: 'GothicArches',
        variant,
        count: errors.length,
        unitsMm: true,
        semantics: 'certifies-at-level',
        ladderMm: LADDER_MM,
        budgetMm: 0.01,
        maxDepth: MAX_DEPTH,
        checkSplits: { atOrAboveBudget: checkSplitsFor(0.01), belowBudget: checkSplitsFor(0.005) },
        unconverged: unconvergedCount,
        unknownChecks: unknownCheckCount,
        enclosures: enclosureCount,
        decimalFallbacks: fallbackCount,
        stats: { maxMm, p50Mm: quantile(0.5), p99Mm: quantile(0.99) },
        provenance: {
          targetSha256: target.targetSha256,
          artifactByteSha256: session.byteSha256,
          parsedTriangleSetSha256: session.parsedTriangleSetSha256,
        },
      });
      const payload = Buffer.concat([
        Buffer.from(`${header}\n`, 'utf8'),
        Buffer.from(errors.buffer, 0, errors.byteLength),
      ]);
      const potscopeDir = join(__dirname, '..', 'tools', 'potscope');
      mkdirSync(potscopeDir, { recursive: true });
      let sidecarPath: string;
      if (variant === 'coarse') {
        const stlPath = join(potscopeDir, 'GothicArches_coarse_reference.stl');
        writeFileSync(stlPath, tessellation.stlBytes);
        sidecarPath = `${stlPath}.error.bin`;
      } else {
        expect(tessellation.triangleCount).toBe(304808);
        const stlPath = join(
          __dirname,
          '..',
          'exchange',
          '_certified_stl',
          'GothicArches_p1_H32_OD30_certified.stl'
        );
        sidecarPath = `${stlPath}.error.bin`;
      }
      writeFileSync(sidecarPath, payload);
      console.log(
        `[probe:errorbake] ${variant} wrote ${sidecarPath} tris=${errors.length}` +
          ` maxMm=${maxMm.toFixed(6)} p99Mm=${quantile(0.99).toFixed(6)}` +
          ` p50Mm=${quantile(0.5).toFixed(6)} unconverged=${unconvergedCount}` +
          ` unknownChecks=${unknownCheckCount} enclosures=${enclosureCount}` +
          ` decimalFallbacks=${fallbackCount} elapsedMs=${Date.now() - startedAt}`
      );
      if (variant === 'certified') {
        // Independent per-triangle re-derivation of the certificate: every
        // triangle of the certified artifact must certify at <= 0.01 mm.
        expect(unconvergedCount).toBe(0);
        expect(maxMm).toBeLessThanOrEqual(0.01);
      }
    }
  );

  it.skipIf(!process.env.PF_GOTHIC_OPCENSUS)(
    'Gothic program op census: outer vs inner wall (slack audit, zero proofs)',
    { timeout: 120_000 },
    () => {
      const { binding } = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0.2,
      });
      for (const patchId of ['outer-wall', 'inner-wall'] as const) {
        const program = binding.programs.find((entry) => entry.patchId === patchId);
        if (program === undefined) throw new Error(`no ${patchId}`);
        const parsed: unknown = JSON.parse(program.programCanonicalJson);
        const opCounts = new Map<string, number>();
        let nodes = 0;
        const walk = (value: unknown): void => {
          if (Array.isArray(value)) {
            for (const entry of value) walk(entry);
            return;
          }
          if (typeof value !== 'object' || value === null) return;
          const record = value as Record<string, unknown>;
          const op = record.op ?? record.kind ?? record.type;
          if (typeof op === 'string') {
            nodes += 1;
            opCounts.set(op, (opCounts.get(op) ?? 0) + 1);
          }
          for (const key of Object.keys(record)) walk(record[key]);
        };
        walk(parsed);
        const summary = [...opCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([op, count]) => `${op}=${count}`)
          .join(' ');
        console.log(`[probe:opcensus] ${patchId} nodes=${nodes} ${summary}`);
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_GOTHIC_TRICOUNT)(
    'Gothic tessellation-only: per-patch triangle counts (no proofs)',
    { timeout: 120_000 },
    () => {
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(5, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(5, ladders.innerVerticalFractions);
      const outerChords = gothicChordsForPatch('outer', angularLadder, outerVertical);
      const innerChords = gothicChordsForPatch('inner', angularLadder, innerVertical);
      const { binding } = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0.2,
      });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 8,
        angularStations: angularLadder,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'outer-wall': outerVertical,
          'inner-wall': innerVertical,
        },
        conformingChordsByPatch: {
          'outer-wall': outerChords,
          'inner-wall': innerChords,
        },
      });
      const counts = tessellation.partitions
        .map((partition) => `${partition.patchId}=${partition.triangles.length}`)
        .join(' ');
      console.log(
        `[probe:tricount] chords outer=${outerChords.length} inner=${innerChords.length}` +
          ` totalTris=${tessellation.triangleCount} ${counts}`
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GO_PP)(
    'Gothic PER-PATCH isolation + failing-cell UV',
    { timeout: 900_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const ladders = gothicLadderFractions();
      // a8w5 both walls: the hour-3-proven base. Measured dead ends
      // (2026-07-17): a7 (-128 stations) INCREASED per-cell grind on both
      // walls (interval slack is u-extent-driven — the screen bisects to
      // narrow u anyway, so stations removed from the grid reappear as
      // work-cell splits); inner w6 likewise net-negative (44% of sweep at
      // 2M cells vs 55% at w5).
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(5, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(5, ladders.innerVerticalFractions);
      const outerChords = gothicChordsForPatch('outer', angularLadder, outerVertical);
      const innerChords = gothicChordsForPatch('inner', angularLadder, innerVertical);
      const { binding } = atlas('GothicArches', {
        gaPointiness: 1,
        gaDiamond: 0,
        gaRelief: 0.2,
      });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 8,
        angularStations: angularLadder,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'outer-wall': outerVertical,
          'inner-wall': innerVertical,
        },
        conformingChordsByPatch: {
          'outer-wall': outerChords,
          'inner-wall': innerChords,
        },
      });
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
              maximumGeometricUpperPm: 9_500_000n,
              maxWorkCells: 6_000_000,
              maxDepth: 30,
              deadlineEpochMilliseconds: Date.now() + 500_000,
            }
          );
          const decimalUnits = result.evaluatorWorkUnitCount - result.workCellCount;
          console.log(
            `[probe:gopp] ${job.partition.patchId} OK upperPm=${result.targetToMeshUpperPm}` +
              ` cells=${result.workCellCount} fast=${result.fastScreenAcceptedCellCount}` +
              ` decimalUnits=${decimalUnits} unitsPerCell=${result.evaluatorWorkUnitsPerCell}` +
              ` maxDepth=${result.maximumDepthReached} tris=${job.partition.triangles.length}` +
              ` elapsedMs=${Date.now() - startedAt}`
          );
        } catch (error) {
          const err = error as {
            message?: string;
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
                Number(job.partition.oddDenominatorFactor ?? '1') *
                2 ** job.partition.fractionBits;
              const uv = mapping.vertices
                .map(
                  (vertex) =>
                    `(${(Number(vertex.uNumerator) / denominator).toFixed(6)},${(Number(vertex.vNumerator) / denominator).toFixed(6)})`
                )
                .join(' ');
              uvNote = ` tri=${err.artifactTriangleIndex} depth=${err.depth} uv=${uv}`;
            }
          }
          console.log(
            `[probe:gopp] ${job.partition.patchId} REFUSED after ${Date.now() - startedAt}ms` +
              ` -> ${err.message?.slice(0, 160)}${uvNote}`
          );
        }
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GOTHIC)(
    'GothicArches conforming-chords certification attempt (pointiness 1)',
    { timeout: 900_000 },
    () => {
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(5, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(5, ladders.innerVerticalFractions);
      const outerChords = gothicChordsForPatch('outer', angularLadder, outerVertical);
      const innerChords = gothicChordsForPatch('inner', angularLadder, innerVertical);
      console.log(
        `[probe:gothic] chords outer=${outerChords.length} inner=${innerChords.length}` +
          ` angularStations=${angularLadder.numerators.length}`
      );
      runComposed(
        'gothic-p1-a8w5-chain',
        'GothicArches',
        { gaPointiness: 1, gaDiamond: 0, gaRelief: 0.2 },
        {
          angularDivisionsLog2: 8,
          angularStations: angularLadder,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': 5,
            'inner-wall': 5,
            'top-rim': 3,
            'bottom-top': 4,
            'bottom-under': 4,
            'drain-wall': 0,
          },
          verticalStationsByPatch: {
            'outer-wall': outerVertical,
            'inner-wall': innerVertical,
          },
          conformingChordsByPatch: {
            'outer-wall': outerChords,
            'inner-wall': innerChords,
          },
        },
        590_000,
        true
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GY_PP)(
    'Gyroid PER-PATCH isolation + failing-cell UV',
    { timeout: 900_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        '../../src/geometry/targetSolid/continuousMappedPatchDistance'
      );
      const { dyadicEdgeLadder } = await import('../../src/geometry/targetSolid/annularSolidReferenceTessellation');
      const { binding } = atlas('GyroidManifold', { gm_relief: 0.25, gm_edge_fade: 1 });
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 7,
          'inner-wall': 7,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'bottom-top': dyadicEdgeLadder(5, 8, 'v1'),
          'bottom-under': dyadicEdgeLadder(5, 8, 'v1'),
        },
      });
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
              maximumGeometricUpperPm: 9_500_000n,
              deadlineEpochMilliseconds: Date.now() + 90_000,
            }
          );
          console.log(
            `[probe:gpp] ${job.partition.patchId} OK upperPm=${result.targetToMeshUpperPm}` +
              ` cells=${result.workCellCount} maxDepth=${result.maximumDepthReached}` +
              ` elapsedMs=${Date.now() - startedAt}`
          );
        } catch (error) {
          const err = error as {
            message?: string;
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
            `[probe:gpp] ${job.partition.patchId} REFUSED after ${Date.now() - startedAt}ms` +
              ` -> ${err.message?.slice(0, 160)}${uvNote}`
          );
        }
      }
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GYROID)(
    'Gyroid gentle under envelope v3 (1M mapped cap, 1024 angular)',
    { timeout: 900_000 },
    async () => {
      const { dyadicEdgeLadder } = await import('../../src/geometry/targetSolid/annularSolidReferenceTessellation');
      runComposed(
        'gyroid-a10w7',
        'GyroidManifold',
        { gm_relief: 0.25, gm_edge_fade: 1 },
        {
          angularDivisionsLog2: 10,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': 7,
            'inner-wall': 7,
            'top-rim': 3,
            'bottom-top': 5,
            'bottom-under': 5,
            'drain-wall': 0,
          },
          verticalStationsByPatch: {
            'bottom-top': dyadicEdgeLadder(5, 8, 'v1'),
            'bottom-under': dyadicEdgeLadder(5, 8, 'v1'),
          },
        },
        235_000
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_VORONOI_PAR)(
    'Voronoi bubble via per-patch workers (wall-clock = max patch)',
    { timeout: 900_000 },
    async () => {
      await runComposedParallel(
        'voronoi-bubble-a8w6-PAR',
        'Voronoi',
        { v_morph: 0, v_relief: 0.04 },
        {
          angularDivisionsLog2: 8,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': 7,
            'inner-wall': 7,
            'top-rim': 3,
            'bottom-top': 5,
            'bottom-under': 5,
            'drain-wall': 0,
          },
          verticalStationsByPatch: {
            'inner-wall': rationalStationLadder(7, [
              [1, 29],
              [5, 29],
              [9, 29],
              [13, 29],
              [17, 29],
              [21, 29],
              [25, 29],
            ]),
          },
        },
        235_000
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GOTHIC_PAR)(
    'GothicArches chain config via per-patch workers (parallel refusal timing)',
    { timeout: 900_000 },
    async () => {
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(5, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(5, ladders.innerVerticalFractions);
      const outerChords = gothicChordsForPatch('outer', angularLadder, outerVertical);
      const innerChords = gothicChordsForPatch('inner', angularLadder, innerVertical);
      await runComposedParallel(
        'gothic-p1-a8w5-chain-PAR',
        'GothicArches',
        { gaPointiness: 1, gaDiamond: 0, gaRelief: 0.2 },
        {
          angularDivisionsLog2: 8,
          angularStations: angularLadder,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': 5,
            'inner-wall': 5,
            'top-rim': 3,
            'bottom-top': 4,
            'bottom-under': 4,
            'drain-wall': 0,
          },
          verticalStationsByPatch: {
            'outer-wall': outerVertical,
            'inner-wall': innerVertical,
          },
          conformingChordsByPatch: {
            'outer-wall': outerChords,
            'inner-wall': innerChords,
          },
        },
        590_000,
        true
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_VORONOI)(
    'Voronoi bubble under envelope v3 (composed 240s)',
    { timeout: 900_000 },
    () => {
      runComposed(
        'voronoi-bubble-a8w6',
        'Voronoi',
        { v_morph: 0, v_relief: 0.04 },
        {
          angularDivisionsLog2: 8,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': 7,
            'inner-wall': 7,
            'top-rim': 3,
            'bottom-top': 5,
            'bottom-under': 5,
            'drain-wall': 0,
          },
          verticalStationsByPatch: {
            'inner-wall': rationalStationLadder(7, [
              [1, 29],
              [5, 29],
              [9, 29],
              [13, 29],
              [17, 29],
              [21, 29],
              [25, 29],
            ]),
          },
        },
        235_000
      );
      expect(true).toBe(true);
    }
  );
});
