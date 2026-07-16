import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from './completeMappedArtifactGeometry';
import type { ValidatedResidualEnclosureRequest } from './continuousMappedPatchDistance';
import { createSinglePatchAnnularRadialSolidTargetBinding } from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

// U3b: cells whose coordinate denominator carries an odd factor, so rational
// feature stations k/N (N not a power of two) sit EXACTLY on cell boundaries.
// These tests pin the evaluator's three channels on such cells: soundness
// (containment of densely sampled true residuals), exactness where the odd
// factor divides the numerator, and canonical-encoding refusals.

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function outerWallFixture() {
  const canonicalInput = createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, H: 40, top_od: 30, bottom_od: 30, r_drain: 6 },
    'HarmonicRipple',
    { hr_petal_amp: 0.05, hr_ripple_amp: 0.01, hr_bell: 0.02 },
    TARGET_CONTROLS
  );
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
    binding.surfaceComplex
  );
  const program = binding.programs.find((candidate) => candidate.patchId === 'outer-wall');
  if (program === undefined) throw new Error('missing outer-wall program');
  const evaluator = compileValidatedResidualEvaluator({
    targetSha256: target.targetSha256,
    programCanonicalJson: program.programCanonicalJson,
  });
  return { program, evaluator };
}

function rationalRequest(
  uCell: number,
  vCell: number,
  divisionsLog2: number,
  oddFactor: number,
  evaluateFloat64: (u: number, v: number) => readonly [number, number, number],
  lower: boolean,
  span = 1
): ValidatedResidualEnclosureRequest {
  const denominator = oddFactor * (1 << divisionsLog2);
  const corners = lower
    ? ([
        [uCell, vCell],
        [uCell + span, vCell],
        [uCell + span, vCell + span],
      ] as const)
    : ([
        [uCell, vCell],
        [uCell + span, vCell + span],
        [uCell, vCell + span],
      ] as const);
  const vertices = corners.map(([u, v]) => ({
    uNumerator: u.toString(),
    vNumerator: v.toString(),
  })) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
  const verticesMm = corners.map(([u, v]) => {
    const point = evaluateFloat64(u / denominator, v / denominator);
    return [Math.fround(point[0]), Math.fround(point[1]), Math.fround(point[2])] as const;
  }) as unknown as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
  return {
    patchId: 'outer-wall',
    artifactTriangleIndex: 0,
    artifactTriangleVerticesMm: verticesMm,
    originalDomainTriangle: vertices,
    cell: {
      fractionBits: divisionsLog2,
      oddDenominatorFactor: oddFactor.toString(),
      barycentricFractionBits: 0,
      vertices,
      barycentricVertices: [
        { aNumerator: '1', bNumerator: '0', cNumerator: '0' },
        { aNumerator: '0', bNumerator: '1', cNumerator: '0' },
        { aNumerator: '0', bNumerator: '0', cNumerator: '1' },
      ],
    },
  };
}

function expectContainment(
  enclosure: { xMm: { lower: number; upper: number }; yMm: { lower: number; upper: number }; zMm: { lower: number; upper: number } },
  request: ValidatedResidualEnclosureRequest,
  evaluateFloat64: (u: number, v: number) => readonly [number, number, number],
  denominator: number,
  random: () => number
): void {
  const triangle = request.artifactTriangleVerticesMm;
  const cellVertices = request.cell.vertices;
  for (let sample = 0; sample < 25; sample += 1) {
    const wa = random();
    const wb = random() * (1 - wa);
    const wc = 1 - wa - wb;
    const u =
      (wa * Number(cellVertices[0].uNumerator) +
        wb * Number(cellVertices[1].uNumerator) +
        wc * Number(cellVertices[2].uNumerator)) /
      denominator;
    const v =
      (wa * Number(cellVertices[0].vNumerator) +
        wb * Number(cellVertices[1].vNumerator) +
        wc * Number(cellVertices[2].vNumerator)) /
      denominator;
    const targetPoint = evaluateFloat64(u, v);
    const residual = [0, 1, 2].map(
      (axis) =>
        targetPoint[axis] -
        (wa * triangle[0][axis] + wb * triangle[1][axis] + wc * triangle[2][axis])
    );
    const slack = 1e-9;
    expect(residual[0]).toBeGreaterThanOrEqual(enclosure.xMm.lower - slack);
    expect(residual[0]).toBeLessThanOrEqual(enclosure.xMm.upper + slack);
    expect(residual[1]).toBeGreaterThanOrEqual(enclosure.yMm.lower - slack);
    expect(residual[1]).toBeLessThanOrEqual(enclosure.yMm.upper + slack);
    expect(residual[2]).toBeGreaterThanOrEqual(enclosure.zMm.lower - slack);
    expect(residual[2]).toBeLessThanOrEqual(enclosure.zMm.upper + slack);
  }
}

describe('rational cell coordinates (odd denominator factor)', () => {
  it('fast screen encloses densely sampled residuals on denominator-96 cells', { timeout: 60_000 }, () => {
    const { program, evaluator } = outerWallFixture();
    const random = mulberry32(0x0dd);
    const divisionsLog2 = 5;
    const oddFactor = 3;
    const denominator = oddFactor * (1 << divisionsLog2);
    let screened = 0;
    for (let trial = 0; trial < 30; trial += 1) {
      const request = rationalRequest(
        Math.floor(random() * denominator),
        Math.floor(random() * denominator),
        divisionsLog2,
        oddFactor,
        program.backends.evaluateFloat64,
        random() < 0.5
      );
      const enclosure = evaluator.encloseResidualFast(request);
      if (enclosure === null) continue;
      screened += 1;
      expectContainment(enclosure, request, program.backends.evaluateFloat64, denominator, random);
    }
    expect(screened).toBeGreaterThan(20);
  });

  it('validated decimal authority encloses sampled residuals on rational cells', { timeout: 120_000 }, () => {
    const { program, evaluator } = outerWallFixture();
    const random = mulberry32(0xdec);
    const divisionsLog2 = 5;
    const oddFactor = 3;
    const denominator = oddFactor * (1 << divisionsLog2);
    for (let trial = 0; trial < 6; trial += 1) {
      const request = rationalRequest(
        Math.floor(random() * denominator),
        Math.floor(random() * denominator),
        divisionsLog2,
        oddFactor,
        program.backends.evaluateFloat64,
        random() < 0.5
      );
      const enclosure = evaluator.encloseResidual(request);
      expectContainment(enclosure, request, program.backends.evaluateFloat64, denominator, random);
    }
  });

  it('coordinates the odd factor divides stay EXACT: q=3 cells on 3k numerators match the dyadic cell bit-for-bit', () => {
    const { program, evaluator } = outerWallFixture();
    const divisionsLog2 = 5;
    // Cell [3k, 3k+3] x [3m, 3m+3] over 3*2^5 is the same real cell as
    // [k, k+1] x [m, m+1] over 2^5. Both channels must produce identical
    // float enclosures — proving no widening was introduced on the
    // divisible (dyadic-compatible) path.
    const random = mulberry32(0xe4ac7);
    let compared = 0;
    for (let trial = 0; trial < 10; trial += 1) {
      const uCell = Math.floor(random() * (1 << divisionsLog2));
      const vCell = Math.floor(random() * (1 << divisionsLog2));
      const lower = random() < 0.5;
      const rational = rationalRequest(
        uCell * 3,
        vCell * 3,
        divisionsLog2,
        3,
        program.backends.evaluateFloat64,
        lower,
        3
      );
      // Same real cell, canonical dyadic encoding. Scale numerators down and
      // drop the factor; reuse the rational request's artifact triangle so
      // the two requests describe the identical residual problem.
      const scaled = rational.cell.vertices.map((vertex) => ({
        uNumerator: (Number(vertex.uNumerator) / 3).toString(),
        vNumerator: (Number(vertex.vNumerator) / 3).toString(),
      })) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
      // The rational corners land on numerators 3k..3k+3 whose thirds are
      // NOT all integers for the interior corner offsets — only multiples of
      // 3 divide. Corner offsets here are 0 or 3, so all divide exactly.
      const dyadic: ValidatedResidualEnclosureRequest = {
        ...rational,
        cell: {
          fractionBits: divisionsLog2,
          barycentricFractionBits: 0,
          vertices: scaled,
          barycentricVertices: rational.cell.barycentricVertices,
        },
      };
      const rationalEnclosure = evaluator.encloseResidualFast(rational);
      const dyadicEnclosure = evaluator.encloseResidualFast(dyadic);
      expect(rationalEnclosure === null).toBe(dyadicEnclosure === null);
      if (rationalEnclosure !== null && dyadicEnclosure !== null) {
        compared += 1;
        expect(rationalEnclosure.xMm.lower).toBe(dyadicEnclosure.xMm.lower);
        expect(rationalEnclosure.xMm.upper).toBe(dyadicEnclosure.xMm.upper);
        expect(rationalEnclosure.yMm.lower).toBe(dyadicEnclosure.yMm.lower);
        expect(rationalEnclosure.yMm.upper).toBe(dyadicEnclosure.yMm.upper);
        expect(rationalEnclosure.zMm.lower).toBe(dyadicEnclosure.zMm.lower);
        expect(rationalEnclosure.zMm.upper).toBe(dyadicEnclosure.zMm.upper);
      }
    }
    expect(compared).toBeGreaterThan(5);
  });

  it('numeric channel with the odd factor matches the string channel bit-for-bit', () => {
    const { program, evaluator } = outerWallFixture();
    const random = mulberry32(0x9a7);
    const divisionsLog2 = 5;
    const oddFactor = 3;
    const denominator = oddFactor * (1 << divisionsLog2);
    let compared = 0;
    for (let trial = 0; trial < 15; trial += 1) {
      const request = rationalRequest(
        Math.floor(random() * denominator),
        Math.floor(random() * denominator),
        divisionsLog2,
        oddFactor,
        program.backends.evaluateFloat64,
        random() < 0.5
      );
      const stringEnclosure = evaluator.encloseResidualFast(request);
      const uNumerators = Float64Array.from(request.cell.vertices, (vertex) =>
        Number(vertex.uNumerator)
      );
      const vNumerators = Float64Array.from(request.cell.vertices, (vertex) =>
        Number(vertex.vNumerator)
      );
      const barycentric = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const artifact = new Float64Array(9);
      request.artifactTriangleVerticesMm.forEach((vertex, index) => {
        artifact[index * 3] = vertex[0];
        artifact[index * 3 + 1] = vertex[1];
        artifact[index * 3 + 2] = vertex[2];
      });
      const numericEnclosure = evaluator.encloseResidualFastNumeric(
        uNumerators,
        vNumerators,
        divisionsLog2,
        barycentric,
        0,
        artifact,
        oddFactor
      );
      expect(numericEnclosure === null).toBe(stringEnclosure === null);
      if (stringEnclosure !== null && numericEnclosure !== null) {
        compared += 1;
        expect(numericEnclosure.xMm.lower).toBe(stringEnclosure.xMm.lower);
        expect(numericEnclosure.xMm.upper).toBe(stringEnclosure.xMm.upper);
        expect(numericEnclosure.yMm.lower).toBe(stringEnclosure.yMm.lower);
        expect(numericEnclosure.yMm.upper).toBe(stringEnclosure.yMm.upper);
        expect(numericEnclosure.zMm.lower).toBe(stringEnclosure.zMm.lower);
        expect(numericEnclosure.zMm.upper).toBe(stringEnclosure.zMm.upper);
      }
    }
    expect(compared).toBeGreaterThan(10);
  });

  it('refuses every non-canonical odd factor on both channels', () => {
    const { program, evaluator } = outerWallFixture();
    const base = rationalRequest(5, 7, 5, 3, program.backends.evaluateFloat64, true);
    for (const bad of ['2', '1', '0', '-3', '03', '4503599627370497']) {
      const request: ValidatedResidualEnclosureRequest = {
        ...base,
        cell: { ...base.cell, oddDenominatorFactor: bad },
      };
      expect(evaluator.encloseResidualFast(request)).toBeNull();
      expect(() => evaluator.encloseResidual(request)).toThrow();
    }
    const uNumerators = Float64Array.from([5, 6, 6]);
    const vNumerators = Float64Array.from([7, 7, 8]);
    const barycentric = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const artifact = new Float64Array(9);
    for (const bad of [2, 1.5, 0, -3, 4503599627370497]) {
      expect(
        evaluator.encloseResidualFastNumeric(
          uNumerators,
          vNumerators,
          5,
          barycentric,
          0,
          artifact,
          bad
        )
      ).toBeNull();
    }
  });
});
