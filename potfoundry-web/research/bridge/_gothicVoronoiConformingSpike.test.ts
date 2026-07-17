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
  maxElapsedMilliseconds: number
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

const RIB_OFFSETS = [0.003, 0.0065, 0.0105, 0.015, 0.021, 0.028, 0.036] as const;

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
  // Arch-base angular spike (columnEdge^4): geometric refinement toward
  // every base column k/12 — stations at k/12 ± j/2048 (j = 1, 2, 4, 8).
  for (let k = 0; k < 12; k += 1) {
    for (const j of [1, 2, 4, 8]) {
      for (const sign of [-1, 1]) {
        const value = k / 12 + (sign * j) / 2048;
        const wrapped = value - Math.floor(value);
        const numerator = Math.round(wrapped * 6144);
        if (numerator > 0 && numerator < 6144) angularFractions.push([numerator, 6144]);
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
  const curves: { offset: number; tMin: number; tMax: number }[] = [
    { offset: 0, tMin: GOTHIC.spring, tMax: GOTHIC.apex },
    {
      offset: GOTHIC.gateWidth,
      tMin: GOTHIC.spring,
      tMax: GOTHIC.apex - GOTHIC.gateWidth,
    },
  ];
  for (const ribOffset of RIB_OFFSETS) {
    // t = archZ - o (below the kink) and t = archZ + o (above): full-period
    // smooth offset curves resolving the quartic rib stripe.
    curves.push({
      offset: ribOffset,
      tMin: Math.max(1 / 8192, GOTHIC.spring - ribOffset),
      tMax: GOTHIC.apex - ribOffset,
    });
    curves.push({
      offset: -ribOffset,
      tMin: GOTHIC.spring + ribOffset,
      tMax: Math.min(1 - 1 / 8192, GOTHIC.apex + ribOffset),
    });
  }
  for (const curve of curves) {
    for (let halfArch = 0; halfArch < 24; halfArch += 1) {
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
      // Column crossings: every angular station strictly inside the half-arch.
      for (const angularNumerator of angularLadder.numerators) {
        const uP = angularNumerator / angularDen;
        const uS = styleU(uP);
        const inside =
          uS > halfArch / 24 + 1e-12 && uS < (halfArch + 1) / 24 - 1e-12;
        if (!inside) continue;
        const t = GOTHIC.archZ(uS) - curve.offset;
        if (t < curve.tMin - 1e-12 || t > curve.tMax + 1e-12) continue;
        const vP = patchV(Math.min(curve.tMax, Math.max(curve.tMin, t)));
        if (vP < -1e-12 || vP > 1 + 1e-12) continue;
        add(angularNumerator * uScale, Math.round(vP * denominator));
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
      crossings.sort((left, right) => left.uNumerator - right.uNumerator);
      pushChain(crossings);
    }
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
        './continuousMappedPatchDistance'
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

  it.skipIf(!process.env.PF_SLICE11_GO_PP)(
    'Gothic PER-PATCH isolation + failing-cell UV',
    { timeout: 900_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        './continuousMappedPatchDistance'
      );
      const ladders = gothicLadderFractions();
      const angularLadder = rationalStationLadder(8, ladders.angularFractions);
      const outerVertical = rationalStationLadder(6, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(6, ladders.innerVerticalFractions);
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
          'outer-wall': 8,
          'inner-wall': 8,
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
              deadlineEpochMilliseconds: Date.now() + 90_000,
            }
          );
          console.log(
            `[probe:gopp] ${job.partition.patchId} OK upperPm=${result.targetToMeshUpperPm}` +
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
      const outerVertical = rationalStationLadder(6, ladders.outerVerticalFractions);
      const innerVertical = rationalStationLadder(6, ladders.innerVerticalFractions);
      const outerChords = gothicChordsForPatch('outer', angularLadder, outerVertical);
      const innerChords = gothicChordsForPatch('inner', angularLadder, innerVertical);
      console.log(
        `[probe:gothic] chords outer=${outerChords.length} inner=${innerChords.length}` +
          ` angularStations=${angularLadder.numerators.length}`
      );
      runComposed(
        'gothic-p1-a8w6',
        'GothicArches',
        { gaPointiness: 1, gaDiamond: 0, gaRelief: 0.2 },
        {
          angularDivisionsLog2: 8,
          angularStations: angularLadder,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': 6,
            'inner-wall': 6,
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
        235_000
      );
      expect(true).toBe(true);
    }
  );

  it.skipIf(!process.env.PF_SLICE11_GY_PP)(
    'Gyroid PER-PATCH isolation + failing-cell UV',
    { timeout: 900_000 },
    async () => {
      const { certifyContinuousMappedPatchDistance } = await import(
        './continuousMappedPatchDistance'
      );
      const { dyadicEdgeLadder } = await import('./annularSolidReferenceTessellation');
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
      const { dyadicEdgeLadder } = await import('./annularSolidReferenceTessellation');
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
