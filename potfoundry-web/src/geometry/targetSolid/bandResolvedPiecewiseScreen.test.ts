import { describe, expect, it } from 'vitest';

import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import type { ValidatedResidualEnclosureRequest } from './continuousMappedPatchDistance';
import { sha256Utf8 } from './incrementalSha256';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import { VALIDATED_RESIDUAL_PROGRAM_VERSION } from './validatedResidualProgram';

// U3b slice 4: band-resolved piecewise nodes. A fractional-part/floor node
// whose ARGUMENT is compiler-proven affine in u/v with point-exact decimal
// coefficients can be resolved per cell: exact integer arithmetic on the
// cell's rational vertex numerators decides the band k with arg(cell)
// contained in [k, k+1], and the node then evaluates as the smooth shift
// arg - k (fract) or the constant k (floor) instead of downgrading the run
// to a width-1 value hull. Cells whose exact argument range spans a jump
// keep today's hull fallback. The certificate this enables bounds distance
// to the CLOSED graph of the program: on a value-discontinuous jump line the
// band formula evaluates the one-sided closure limit, which is sound for
// distance-to-set claims; any solid-boundary curtain at a declared jump
// remains a G0 surface-complex obligation outside this proof.

type Expression = Readonly<Record<string, unknown>>;

const U: Expression = { op: 'u' };
const V: Expression = { op: 'v' };
const constant = (value: string): Expression => ({ op: 'constant', value });
const mul = (left: Expression, right: Expression): Expression => ({
  op: 'multiply',
  left,
  right,
});
const add = (left: Expression, right: Expression): Expression => ({ op: 'add', left, right });
const sub = (left: Expression, right: Expression): Expression => ({
  op: 'subtract',
  left,
  right,
});
const abs = (arg: Expression): Expression => ({ op: 'absolute', arg });
const fract = (arg: Expression): Expression => ({ op: 'fractional-part', arg });
const floorOf = (arg: Expression): Expression => ({ op: 'floor', arg });

function bandEvaluator(z: Expression) {
  return compileValidatedResidualEvaluator({
    targetSha256: sha256Utf8('band-resolved piecewise test target'),
    programCanonicalJson: canonicalizeCertificationJson({
      evaluatorId: 'test-band-resolved',
      evaluatorVersion: 'test-v1',
      patchId: 'outer-wall',
      schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      target: { x: U, y: V, z },
    }),
  });
}

// z = 0.02 * |2*fract(3u) - 1| — continuous triangle wave, jumps of the
// inner fract at u = k/3, derivative kinks at u = (2k+1)/6.
const TRIANGLE_WAVE_Z = mul(
  constant('0.02'),
  abs(sub(mul(constant('2'), fract(mul(constant('3'), U))), constant('1')))
);
const triangleWaveZ = (u: number): number =>
  0.02 * Math.abs(2 * (3 * u - Math.floor(3 * u)) - 1);

// z = 0.01 * floor(3u) — piecewise constant (value-discontinuous).
const FLOOR_Z = mul(constant('0.01'), floorOf(mul(constant('3'), U)));
const floorZ = (u: number): number => 0.01 * Math.floor(3 * u);

// z = 0.02 * fract(3u + 1.5v) — diagonal jump lines 3u + 1.5v = k.
const DIAGONAL_Z = mul(
  constant('0.02'),
  fract(add(mul(constant('3'), U), mul(constant('1.5'), V)))
);
const diagonalZ = (u: number, v: number): number => {
  const argument = 3 * u + 1.5 * v;
  return 0.02 * (argument - Math.floor(argument));
};

type Corner = readonly [number, number];

function requestFor(
  zAt: (u: number, v: number) => number,
  corners: readonly [Corner, Corner, Corner],
  fractionBits: number,
  oddFactor: number
): ValidatedResidualEnclosureRequest {
  const denominator = oddFactor * 2 ** fractionBits;
  const vertices = corners.map(([cu, cv]) => ({
    uNumerator: cu.toString(),
    vNumerator: cv.toString(),
  })) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
  const verticesMm = corners.map(([cu, cv]) => {
    const u = cu / denominator;
    const v = cv / denominator;
    return [Math.fround(u), Math.fround(v), Math.fround(zAt(u, v))] as const;
  }) as unknown as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
  return {
    patchId: 'outer-wall',
    artifactTriangleIndex: 0,
    artifactTriangleVerticesMm: verticesMm,
    originalDomainTriangle: vertices,
    cell: {
      fractionBits,
      ...(oddFactor === 1 ? {} : { oddDenominatorFactor: oddFactor.toString() }),
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

type Enclosure = {
  xMm: { lower: number; upper: number };
  yMm: { lower: number; upper: number };
  zMm: { lower: number; upper: number };
};

function zWidth(enclosure: Enclosure): number {
  return enclosure.zMm.upper - enclosure.zMm.lower;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expectZContainment(
  enclosure: Enclosure,
  request: ValidatedResidualEnclosureRequest,
  zAt: (u: number, v: number) => number,
  denominator: number,
  random: () => number
): void {
  const triangle = request.artifactTriangleVerticesMm;
  const cellVertices = request.cell.vertices;
  for (let sample = 0; sample < 40; sample += 1) {
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
    const residual =
      zAt(u, v) - (wa * triangle[0][2] + wb * triangle[1][2] + wc * triangle[2][2]);
    const slack = 1e-9;
    expect(residual).toBeGreaterThanOrEqual(enclosure.zMm.lower - slack);
    expect(residual).toBeLessThanOrEqual(enclosure.zMm.upper + slack);
  }
}

describe('band-resolved piecewise nodes (U3b slice 4)', () => {
  it('resolves a fract cell whose left edge sits exactly ON the jump station', () => {
    // q=3, f=3 (denominator 24): cell u in [8/24, 9/24] = [1/3, 3/8]. The
    // float image of 1/3 dips one ulp below the jump, so the unbanded guard
    // hulls this cell forever; the exact band check proves arg(cell) is
    // inside [1, 2] and takes the smooth 3u - 1 path.
    const evaluator = bandEvaluator(TRIANGLE_WAVE_Z);
    const request = requestFor(
      (u) => triangleWaveZ(u),
      [
        [8, 0],
        [9, 0],
        [9, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => triangleWaveZ(u), 24, mulberry32(0xb1));
    expect(zWidth(enclosure)).toBeLessThan(1e-4);
  });

  it('resolves the cell LEFT of a jump into the lower band', () => {
    // Cell u in [7/24, 8/24]: exact argument range [0.875, 1] is inside
    // band 0 with its RIGHT edge on the jump; the band formula evaluates the
    // one-sided closure limit 1 at the edge.
    const evaluator = bandEvaluator(TRIANGLE_WAVE_Z);
    const request = requestFor(
      (u) => triangleWaveZ(u),
      [
        [7, 0],
        [8, 0],
        [8, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => triangleWaveZ(u), 24, mulberry32(0xb2));
    expect(zWidth(enclosure)).toBeLessThan(1e-4);
  });

  it('resolves the last band against the periodic seam (u = 1)', () => {
    // Cell u in [21/24, 24/24]: arg range [2.625, 3] resolves to band 2.
    const evaluator = bandEvaluator(TRIANGLE_WAVE_Z);
    const request = requestFor(
      (u) => triangleWaveZ(u),
      [
        [21, 0],
        [24, 0],
        [24, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => triangleWaveZ(u), 24, mulberry32(0xb3));
    // The wave is linear on [7/8, 1] but the artifact spans three stations,
    // so only the affine-mismatch scale survives — far below the 0.02 hull.
    expect(zWidth(enclosure)).toBeLessThan(1e-3);
  });

  it('resolves floor to its exact band constant', () => {
    const evaluator = bandEvaluator(FLOOR_Z);
    const request = requestFor(
      (u) => floorZ(u),
      [
        [8, 0],
        [9, 0],
        [9, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => floorZ(u), 24, mulberry32(0xb4));
    expect(zWidth(enclosure)).toBeLessThan(1e-6);
  });

  it('resolves diagonal jump lines through the affine v coefficient', () => {
    // z = 0.02 * fract(3u + 1.5v): the exact check runs on the affine form
    // 3u + 1.5v over the triangle's rational vertices — axis alignment is
    // not required, only that the cell fits between two jump lines.
    const evaluator = bandEvaluator(DIAGONAL_Z);
    const request = requestFor(
      diagonalZ,
      [
        [0, 0],
        [18, 0],
        [0, 16],
      ],
      4,
      9
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, diagonalZ, 144, mulberry32(0xb5));
    expect(zWidth(enclosure)).toBeLessThan(1e-4);
  });

  it('keeps the hull fallback on a cell whose exact range spans a jump', () => {
    // Dyadic cell u in [1/4, 1/2] strictly contains the jump at 1/3: the
    // exact band check must refuse and the value-hull fallback must stay
    // sound (and wide) — band resolution never invents a branch.
    const evaluator = bandEvaluator(TRIANGLE_WAVE_Z);
    const request = requestFor(
      (u) => triangleWaveZ(u),
      [
        [1, 0],
        [2, 0],
        [2, 1],
      ],
      2,
      1
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => triangleWaveZ(u), 4, mulberry32(0xb6));
    expect(zWidth(enclosure)).toBeGreaterThan(0.015);
  });

  it('numeric channel band resolution matches the string channel bit-for-bit', () => {
    const evaluator = bandEvaluator(TRIANGLE_WAVE_Z);
    const cases: readonly (readonly [readonly [Corner, Corner, Corner], number, number])[] = [
      [
        [
          [8, 0],
          [9, 0],
          [9, 1],
        ],
        3,
        3,
      ],
      [
        [
          [7, 0],
          [8, 0],
          [8, 1],
        ],
        3,
        3,
      ],
      [
        [
          [21, 0],
          [24, 0],
          [24, 1],
        ],
        3,
        3,
      ],
      [
        [
          [1, 0],
          [2, 0],
          [2, 1],
        ],
        2,
        1,
      ],
    ];
    for (const [corners, fractionBits, oddFactor] of cases) {
      const request = requestFor((u) => triangleWaveZ(u), corners, fractionBits, oddFactor);
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
        fractionBits,
        barycentric,
        0,
        artifact,
        oddFactor
      );
      expect(numericEnclosure === null).toBe(stringEnclosure === null);
      if (stringEnclosure !== null && numericEnclosure !== null) {
        expect(numericEnclosure.zMm.lower).toBe(stringEnclosure.zMm.lower);
        expect(numericEnclosure.zMm.upper).toBe(stringEnclosure.zMm.upper);
      }
    }
  });

  it('validated decimal authority band-resolves jump-adjacent cells', () => {
    // The decimal kernel's outward rational conversion also overhangs the
    // jump by its rounding guard; the same exact band check restores the
    // first-order hull-subtract width instead of the width-1 fract hull.
    const evaluator = bandEvaluator(TRIANGLE_WAVE_Z);
    const request = requestFor(
      (u) => triangleWaveZ(u),
      [
        [8, 0],
        [9, 0],
        [9, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidual(request);
    expectZContainment(enclosure, request, (u) => triangleWaveZ(u), 24, mulberry32(0xb7));
    expect(zWidth(enclosure)).toBeLessThan(0.012);
  });

  it('never resolves a node whose argument is not point-exact affine', () => {
    // fract(pi * u): pi is an interval constant, so the affine coefficient
    // is not a point and the node must keep today's jump-guard behavior on
    // every cell (sound hull when straddling).
    const evaluator = bandEvaluator(
      mul(constant('0.02'), fract(mul({ op: 'pi' }, U)))
    );
    const zAt = (u: number): number => {
      const argument = Math.PI * u;
      return 0.02 * (argument - Math.floor(argument));
    };
    // Cell around u = 1/pi where the argument crosses 1.
    const request = requestFor(
      zAt,
      [
        [5, 0],
        [6, 0],
        [6, 1],
      ],
      4,
      1
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, zAt, 16, mulberry32(0xb8));
    expect(zWidth(enclosure)).toBeGreaterThan(0.015);
  });
});

// U3b slice 7: the same exact per-cell affine machinery resolves the VALUE
// jumps of sign and step. sign bands are (-inf, 0) -> -1 and (0, inf) -> +1;
// step(edge, x) keys off the combined point-affine argument x - edge with
// bands (-inf, 0) -> 0 and (0, inf) -> 1. Cells whose exact range touches
// the jump from one side evaluate that side's one-sided closure limit
// (closed-graph semantics, same doctrine as fract/floor; for step the
// right-closed branch carries the true edge <= x equality value). Cells
// whose exact range spans the jump keep the sound hull.
describe('band-resolved sign/step value jumps (U3b slice 7)', () => {
  const signOf = (arg: Expression): Expression => ({ op: 'sign', arg });
  const stepOf = (left: Expression, right: Expression): Expression => ({
    op: 'step',
    left,
    right,
  });

  // Like fract in a triangle wave, the realistic use is an INTERMEDIATE
  // jump inside a continuous composite (a genuinely discontinuous OUTPUT is
  // a curtain-class obligation no band can absorb). z = 0.02*sign(x)*x =
  // 0.02*|x| with x = 3u - 1: continuous, sign jump at u = 1/3 (never
  // dyadic). Unresolved cells hull sign to [-1, 1] and poison the product;
  // resolved cells take the exact one-sided constant.
  const SIGN_ARG = sub(mul(constant('3'), U), constant('1'));
  const SIGN_Z = mul(constant('0.02'), mul(signOf(SIGN_ARG), SIGN_ARG));
  const signZ = (u: number): number => {
    const x = 3 * u - 1;
    return 0.02 * Math.sign(x) * x;
  };

  // z = 0.02*step(1.5v + 1, 3u)*(3u - 1.5v - 1) = 0.02*max(0, x) with the
  // combined affine argument x = 3u - 1.5v - 1 along a DIAGONAL jump line —
  // continuous across the jump, step jump intermediate.
  const STEP_ARG = sub(
    mul(constant('3'), U),
    add(mul(constant('1.5'), V), constant('1'))
  );
  const STEP_Z = mul(
    constant('0.02'),
    mul(
      stepOf(add(mul(constant('1.5'), V), constant('1')), mul(constant('3'), U)),
      STEP_ARG
    )
  );
  const stepZ = (u: number, v: number): number => {
    const x = 3 * u - 1.5 * v - 1;
    return 1.5 * v + 1 <= 3 * u ? 0.02 * x : 0;
  };

  it('resolves sign to +1 on a cell whose left edge sits exactly ON the jump', () => {
    // q=3, f=3 (denominator 24): cell u in [8/24, 9/24]. The float image of
    // 1/3 dips one ulp below the jump, so the unbanded guard hulls sign to
    // [-1, 1] forever; the exact check proves the range is inside [0, inf)
    // and takes the +1 closure branch.
    const evaluator = bandEvaluator(SIGN_Z);
    const request = requestFor(
      (u) => signZ(u),
      [
        [8, 0],
        [9, 0],
        [9, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => signZ(u), 24, mulberry32(0xc1));
    expect(zWidth(enclosure)).toBeLessThan(1e-6);
  });

  it('resolves sign to the -1 closure on the cell LEFT of the jump', () => {
    const evaluator = bandEvaluator(SIGN_Z);
    const request = requestFor(
      (u) => signZ(u),
      [
        [7, 0],
        [8, 0],
        [8, 1],
      ],
      3,
      3
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => signZ(u), 24, mulberry32(0xc2));
    expect(zWidth(enclosure)).toBeLessThan(1e-6);
  });

  it('keeps the sound hull on a sign cell whose exact range spans the jump', () => {
    const evaluator = bandEvaluator(SIGN_Z);
    const request = requestFor(
      (u) => signZ(u),
      [
        [1, 0],
        [2, 0],
        [2, 1],
      ],
      2,
      1
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, (u) => signZ(u), 4, mulberry32(0xc3));
    expect(zWidth(enclosure)).toBeGreaterThan(0.004);
  });

  it('resolves step through its combined diagonal affine argument', () => {
    // q=9, f=4 (denominator 144): corners (48,0), (66,0), (66,16). The
    // argument 3u - 1.5v - 1 is 0, 0.375, and 0.375 - 1/6 at the corners —
    // inside the right-closed branch, whose constant 1 carries the true
    // edge <= x equality value at the touching corner.
    const evaluator = bandEvaluator(STEP_Z);
    const request = requestFor(
      stepZ,
      [
        [48, 0],
        [66, 0],
        [66, 16],
      ],
      4,
      9
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, stepZ, 144, mulberry32(0xc4));
    expect(zWidth(enclosure)).toBeLessThan(1e-6);
  });

  it('resolves step to the 0 closure on a cell touching the jump from below', () => {
    // Corners (30,0), (48,0), (30,16): argument -0.375, 0, and -0.375 - 1/6
    // — max is exactly 0, the left-closure branch.
    const evaluator = bandEvaluator(STEP_Z);
    const request = requestFor(
      stepZ,
      [
        [30, 0],
        [48, 0],
        [30, 16],
      ],
      4,
      9
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expect(zWidth(enclosure)).toBeLessThan(1e-6);
  });

  it('keeps the sound hull on a step cell spanning the diagonal jump', () => {
    // Corners (48,0), (66,0), (48,16): argument 0, 0.375, -1/6 — mixed
    // signs, so the exact check must refuse and the hull must stay.
    const evaluator = bandEvaluator(STEP_Z);
    const request = requestFor(
      stepZ,
      [
        [48, 0],
        [66, 0],
        [48, 16],
      ],
      4,
      9
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, stepZ, 144, mulberry32(0xc5));
    expect(zWidth(enclosure)).toBeGreaterThan(0.003);
  });

  it('never resolves sign whose argument is not point-exact affine', () => {
    // sign(pi*u - 1): the interval pi coefficient disqualifies the node;
    // the straddling cell around u = 1/pi keeps the hull.
    const evaluator = bandEvaluator(
      mul(constant('0.02'), signOf(sub(mul({ op: 'pi' }, U), constant('1'))))
    );
    const zAt = (u: number): number => 0.02 * Math.sign(Math.PI * u - 1);
    const request = requestFor(
      zAt,
      [
        [5, 0],
        [6, 0],
        [6, 1],
      ],
      4,
      1
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectZContainment(enclosure, request, zAt, 16, mulberry32(0xc6));
    expect(zWidth(enclosure)).toBeGreaterThan(0.03);
  });

  it('sign/step numeric channel band resolution matches the string channel bit-for-bit', () => {
    for (const [z, zAt, corners, fractionBits, oddFactor] of [
      [SIGN_Z, (u: number) => signZ(u), [[8, 0], [9, 0], [9, 1]], 3, 3],
      [SIGN_Z, (u: number) => signZ(u), [[7, 0], [8, 0], [8, 1]], 3, 3],
      [STEP_Z, stepZ, [[48, 0], [66, 0], [66, 16]], 4, 9],
      [STEP_Z, stepZ, [[48, 0], [66, 0], [48, 16]], 4, 9],
    ] as const) {
      const evaluator = bandEvaluator(z);
      const request = requestFor(
        zAt as (u: number, v: number) => number,
        corners as unknown as readonly [Corner, Corner, Corner],
        fractionBits,
        oddFactor
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
        fractionBits,
        barycentric,
        0,
        artifact,
        oddFactor
      );
      expect(numericEnclosure === null).toBe(stringEnclosure === null);
      if (stringEnclosure !== null && numericEnclosure !== null) {
        expect(numericEnclosure.zMm.lower).toBe(stringEnclosure.zMm.lower);
        expect(numericEnclosure.zMm.upper).toBe(stringEnclosure.zMm.upper);
      }
    }
  });

  it('validated decimal authority band-resolves sign and step jump-adjacent cells', () => {
    const signEvaluator = bandEvaluator(SIGN_Z);
    const signRequest = requestFor(
      (u) => signZ(u),
      [
        [8, 0],
        [9, 0],
        [9, 1],
      ],
      3,
      3
    );
    // The decimal kernel restores the first-order hull-subtract width (the
    // outward rational conversion carries its rounding guard), same shape
    // as the fract decimal case above.
    expect(zWidth(signEvaluator.encloseResidual(signRequest))).toBeLessThan(0.012);
    const stepEvaluator = bandEvaluator(STEP_Z);
    const stepRequest = requestFor(
      stepZ,
      [
        [48, 0],
        [66, 0],
        [66, 16],
      ],
      4,
      9
    );
    expect(zWidth(stepEvaluator.encloseResidual(stepRequest))).toBeLessThan(0.02);
  });
});
