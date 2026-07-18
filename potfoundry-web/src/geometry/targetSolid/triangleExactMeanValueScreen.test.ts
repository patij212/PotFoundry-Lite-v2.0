import { describe, expect, it } from 'vitest';

import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import { sha256Utf8 } from './incrementalSha256';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  getLastScreenClarkeFired,
  getLastScreenSecondOrderUsed,
  setScreenJacobianPartition,
  setScreenSecondOrder,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
  VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_TEXT,
  VALIDATED_RESIDUAL_PROGRAM_VERSION,
  type ValidatedResidualEnclosureRequest,
} from './validatedResidualProgram';

type Expression = Record<string, unknown>;

const U: Expression = { op: 'u' };
const V: Expression = { op: 'v' };
const constant = (value: string): Expression => ({ op: 'constant', value });
const mul = (left: Expression, right: Expression): Expression => ({
  op: 'multiply',
  left,
  right,
});
const sub = (left: Expression, right: Expression): Expression => ({
  op: 'subtract',
  left,
  right,
});
const add = (left: Expression, right: Expression): Expression => ({
  op: 'add',
  left,
  right,
});
const abs = (arg: Expression): Expression => ({ op: 'absolute', arg });
const square = (arg: Expression): Expression => ({ op: 'square', arg });
const maxOf = (left: Expression, right: Expression): Expression => ({ op: 'maximum', left, right });
const minOf = (left: Expression, right: Expression): Expression => ({ op: 'minimum', left, right });
const neg = (arg: Expression): Expression => ({ op: 'negate', arg });
const sin = (arg: Expression): Expression => ({ op: 'sin', arg });
const cos = (arg: Expression): Expression => ({ op: 'cos', arg });
const sqrtOf = (arg: Expression): Expression => ({ op: 'sqrt', arg });
const expOf = (arg: Expression): Expression => ({ op: 'exp', arg });
const lnOf = (arg: Expression): Expression => ({ op: 'ln', arg });
const divOf = (left: Expression, right: Expression): Expression => ({ op: 'divide', left, right });
const powOf = (left: Expression, right: Expression): Expression => ({ op: 'power', left, right });
const floorOf = (arg: Expression): Expression => ({ op: 'floor', arg });

function evaluatorFor(z: Expression) {
  return compileValidatedResidualEvaluator({
    targetSha256: sha256Utf8('triangle-exact mean-value screen test target'),
    programCanonicalJson: canonicalizeCertificationJson({
      evaluatorId: 'test-triangle-exact-screen',
      evaluatorVersion: 'test-v1',
      patchId: 'outer-wall',
      schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      target: { x: U, y: V, z },
    }),
  });
}

type Corner = readonly [number, number];

function requestFor(
  artifactZ: (u: number, v: number) => number,
  corners: readonly [Corner, Corner, Corner],
  fractionBits: number
): ValidatedResidualEnclosureRequest {
  const denominator = 2 ** fractionBits;
  const vertices = corners.map(([cu, cv]) => ({
    uNumerator: cu.toString(),
    vNumerator: cv.toString(),
  })) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
  const verticesMm = corners.map(([cu, cv]) => {
    const u = cu / denominator;
    const v = cv / denominator;
    return [Math.fround(u), Math.fround(v), Math.fround(artifactZ(u, v))] as const;
  }) as unknown as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
  return {
    patchId: 'outer-wall',
    artifactTriangleIndex: 0,
    artifactTriangleVerticesMm: verticesMm,
    originalDomainTriangle: vertices,
    cell: {
      fractionBits,
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
  zMm: { lower: number; upper: number };
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expectContainment(
  enclosure: Enclosure,
  request: ValidatedResidualEnclosureRequest,
  zAt: (u: number, v: number) => number,
  denominator: number,
  random: () => number
): void {
  const triangle = request.artifactTriangleVerticesMm;
  const cellVertices = request.cell.vertices;
  for (let sample = 0; sample < 60; sample += 1) {
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
    const residual = zAt(u, v) - (wa * triangle[0][2] + wb * triangle[1][2] + wc * triangle[2][2]);
    const slack = 1e-9;
    expect(residual).toBeGreaterThanOrEqual(enclosure.zMm.lower - slack);
    expect(residual).toBeLessThanOrEqual(enclosure.zMm.upper + slack);
  }
}

describe('triangle-exact centered mean-value screen', () => {
  it('hulls the mean-value term over the exact cell-vertex offsets, not the axis-aligned box', () => {
    // Linear target z = 0.25u - 0.25v (mixed-sign Jacobian) against a FLAT
    // zero artifact on the right-triangle cell (0,0)-(1/4,0)-(1/4,1/4).
    // True residual range over the triangle = [0, 0.0625] (attained at the
    // vertices; every value is exactly f32-representable, so there is no
    // rounding excuse). The axis-aligned-box mean-value form pays the
    // mixed-sign corner the triangle cannot reach and returns width 0.125 —
    // exactly 2x. The vertex-offset hull is exact for linear fields.
    const evaluator = evaluatorFor(sub(mul(constant('0.25'), U), mul(constant('0.25'), V)));
    const request = requestFor(
      () => 0,
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      2
    );
    const enclosure = evaluator.encloseResidualFast(request) as Enclosure | null;
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectContainment(enclosure, request, (u, v) => 0.25 * u - 0.25 * v, 4, mulberry32(0x7e));
    const width = enclosure.zMm.upper - enclosure.zMm.lower;
    expect(width).toBeLessThanOrEqual(0.0625 * (1 + 1e-6));
  });

  it('stays sound on a kinked nonlinear field over a skewed cell', () => {
    // z = 0.02*|8u - 8v - 0.5| + 0.01*(u+v): an absolute-value crease
    // crossing the skewed cell (1/8,0)-(3/8,1/8)-(2/8,3/8) plus a linear
    // drift. The enclosure must contain 60 random interior residuals.
    const zAt = (u: number, v: number): number =>
      0.02 * Math.abs(8 * u - 8 * v - 0.5) + 0.01 * (u + v);
    const evaluator = evaluatorFor(
      add(
        mul(
          constant('0.02'),
          abs(sub(sub(mul(constant('8'), U), mul(constant('8'), V)), constant('0.5')))
        ),
        mul(constant('0.01'), add(U, V))
      )
    );
    const request = requestFor(
      () => 0.001,
      [
        [1, 0],
        [3, 1],
        [2, 3],
      ],
      3
    );
    const enclosure = evaluator.encloseResidualFast(request) as Enclosure | null;
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expectContainment(enclosure, request, zAt, 8, mulberry32(0x51));
  });

  it('sub-box partition tightens the Jacobian below the AABB Clarke bound and stays sound', () => {
    // z = |u - v + 0.6|: the kink u - v = -0.6 lies OUTSIDE the lower-right
    // triangle (0,0)-(1,0)-(1,1) (there u >= v => arg >= 0.6 > 0) but INSIDE its
    // [0,1]^2 axis-aligned box (arg reaches -0.4 at the upper-left corner). The
    // single-box Jacobian pass straddles the kink and pays the two-sided Clarke
    // subgradient hull; a sub-box partition fine enough that every triangle-
    // covering cell stays one-sided removes that spurious hull. Both enclosures
    // must still contain the true residual.
    const evaluator = evaluatorFor(abs(add(sub(U, V), constant('0.6'))));
    const request = requestFor(
      () => 0,
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      0
    );
    const zAt = (u: number, v: number): number => Math.abs(u - v + 0.6);
    try {
      setScreenJacobianPartition(0);
      const aabb = evaluator.encloseResidualFast(request) as Enclosure | null;
      setScreenJacobianPartition(4);
      const partitioned = evaluator.encloseResidualFast(request) as Enclosure | null;
      expect(aabb).not.toBeNull();
      expect(partitioned).not.toBeNull();
      if (aabb === null || partitioned === null) return;
      expectContainment(aabb, request, zAt, 1, mulberry32(0x11));
      expectContainment(partitioned, request, zAt, 1, mulberry32(0x22));
      const aabbWidth = aabb.zMm.upper - aabb.zMm.lower;
      const partWidth = partitioned.zMm.upper - partitioned.zMm.lower;
      expect(partWidth).toBeLessThan(aabbWidth * 0.9);
    } finally {
      setScreenJacobianPartition(0);
    }
  });

  it('reports whether the Clarke subgradient hull fired on the last screened cell', () => {
    // Smooth linear field (no kink node) => Clarke never fires.
    const smooth = evaluatorFor(sub(mul(constant('0.25'), U), mul(constant('0.25'), V)));
    smooth.encloseResidualFast(
      requestFor(
        () => 0,
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        2
      )
    );
    expect(getLastScreenClarkeFired()).toBe(false);
    // |u - v|: the kink u = v crosses the cell (0,0)-(1,0)-(0,1), so the value
    // interval straddles zero and the abs node takes its Clarke branch.
    const kinked = evaluatorFor(abs(sub(U, V)));
    kinked.encloseResidualFast(
      requestFor(
        () => 0,
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        2
      )
    );
    expect(getLastScreenClarkeFired()).toBe(true);
  });
});

describe('second-order Hessian-interval screen', () => {
  // Every second-order test enables the flag and restores it in a finally so a
  // failing assertion can never leak the OFF-by-default (byte-identical) mode.
  function firstThenSecond(
    z: Expression,
    artifactZ: (u: number, v: number) => number,
    corners: readonly [Corner, Corner, Corner],
    fractionBits: number
  ): { first: Enclosure; second: Enclosure; request: ValidatedResidualEnclosureRequest } {
    const evaluator = evaluatorFor(z);
    const request = requestFor(artifactZ, corners, fractionBits);
    setScreenSecondOrder(false);
    const first = evaluator.encloseResidualFast(request) as Enclosure | null;
    setScreenSecondOrder(true);
    const second = evaluator.encloseResidualFast(request) as Enclosure | null;
    if (first === null || second === null) {
      throw new Error('screen returned null for a supported smooth cell');
    }
    return { first, second, request };
  }

  function width(enclosure: Enclosure): number {
    return enclosure.zMm.upper - enclosure.zMm.lower;
  }

  it('encloses z = u^2 vs its affine chord soundly and tighter than first order', () => {
    // Residual = u^2 - (affine interpolant of u^2 through the cell vertices) —
    // exactly the sag the screen sees against a flat mesh chord. The first-order
    // mean-value form pays the full curvature tax; the sound second-order
    // Lagrange form (thin centroid gradient + 1/2 delta^T H(cell) delta) keeps
    // only the genuine quadratic sag, which is materially narrower.
    const zAt = (u: number): number => u * u;
    try {
      const { first, second, request } = firstThenSecond(
        square(U),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x2a));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x2b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('adds second-derivative channels: z = u^2 + v^2 bowl, sound and tighter', () => {
    const zAt = (u: number, v: number): number => u * u + v * v;
    try {
      const { first, second, request } = firstThenSecond(
        add(square(U), square(V)),
        zAt,
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, zAt, 16, mulberry32(0x3a));
      expectContainment(second, request, zAt, 16, mulberry32(0x3b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('subtracts second-derivative channels: z = u^2 - v^2 saddle, sound and tighter', () => {
    const zAt = (u: number, v: number): number => u * u - v * v;
    try {
      const { first, second, request } = firstThenSecond(
        sub(square(U), square(V)),
        zAt,
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, zAt, 16, mulberry32(0x4a));
      expectContainment(second, request, zAt, 16, mulberry32(0x4b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('negates second-derivative channels: z = -(u^2), sound and tighter', () => {
    const zAt = (u: number): number => -(u * u);
    try {
      const { first, second, request } = firstThenSecond(
        neg(square(U)),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x5a));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x5b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('product rule (cross term): z = u*v saddle, sound and tighter', () => {
    // Bilinear: Huu = Hvv = 0, Huv = 1. Exercises the a_u*b_v + a_v*b_u cross
    // terms of the product rule and the off-diagonal Hessian remainder.
    const zAt = (u: number, v: number): number => u * v;
    try {
      const { first, second, request } = firstThenSecond(
        mul(U, V),
        zAt,
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, zAt, 16, mulberry32(0x6a));
      expectContainment(second, request, zAt, 16, mulberry32(0x6b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.85);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('product rule (curved factors): z = u^2*v^2 stays sound with the second-order form', () => {
    // Exercises the diagonal a''*b and a*b'' product-rule terms (auu*b = 2v^2,
    // a*bvv = 2u^2) plus the au*bv cross term. Soundness on 60 interior samples
    // is the correctness property for those terms; the tightness win is field-
    // dependent and already shown by the square/bowl/saddle cases, so here we
    // only assert the second-order form is exercised and stays sound.
    const zAt = (u: number, v: number): number => u * u * v * v;
    try {
      const { first, second, request } = firstThenSecond(
        mul(square(U), square(V)),
        zAt,
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, zAt, 16, mulberry32(0x7a));
      expectContainment(second, request, zAt, 16, mulberry32(0x7b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('sin second-derivative rule: z = sin(6u), sound and tighter', () => {
    // f'' = -sin = -(node value). 6u spans 1.5 rad over the cell, so the field
    // has real curvature and the second-order form removes most of the tax.
    const zAt = (u: number): number => Math.sin(6 * u);
    try {
      const { first, second, request } = firstThenSecond(
        sin(mul(constant('6'), U)),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x8a));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x8b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('cos second-derivative rule: z = cos(6u), sound and tighter', () => {
    const zAt = (u: number): number => Math.cos(6 * u);
    try {
      const { first, second, request } = firstThenSecond(
        cos(mul(constant('6'), U)),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x9a));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x9b));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.9);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('sqrt second-derivative rule: z = sqrt(1 + 4u), sound and tighter', () => {
    // f'' = -1/4 g^(-3/2); domain-guarded (1 + 4u >= 1 > 0 over the cell).
    const zAt = (u: number): number => Math.sqrt(1 + 4 * u);
    try {
      const { first, second, request } = firstThenSecond(
        sqrtOf(add(constant('1'), mul(constant('4'), U))),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0xa1));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0xa2));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.9);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('exp second-derivative rule: z = exp(3u), sound and tighter', () => {
    // f' = f'' = e^g = node value.
    const zAt = (u: number): number => Math.exp(3 * u);
    try {
      const { first, second, request } = firstThenSecond(
        expOf(mul(constant('3'), U)),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0xb1));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0xb2));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.9);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('ln second-derivative rule: z = ln(4 + u), sound and tighter', () => {
    // f'' = -1/g^2; domain-guarded (4 + u >= 4 > 0 over the cell).
    const zAt = (u: number): number => Math.log(4 + u);
    try {
      const { first, second, request } = firstThenSecond(
        lnOf(add(constant('4'), U)),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0xc1));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0xc2));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.9);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  function expectFallbackMatchesFirstOrder(
    enclosureFirst: Enclosure,
    enclosureSecond: Enclosure
  ): void {
    // Falling back to the first-order screen must return that screen's exact
    // bounds, and the observational flag must report the fall-back.
    expect(getLastScreenSecondOrderUsed()).toBe(false);
    expect(enclosureSecond.zMm.lower).toBe(enclosureFirst.zMm.lower);
    expect(enclosureSecond.zMm.upper).toBe(enclosureFirst.zMm.upper);
  }

  it('one-sided abs (positive branch): z = |1 + u^2| engages second order, sound and tighter', () => {
    // 1 + u^2 >= 1 > 0 over the cell: abs is the smooth identity branch, so the
    // second-order pass passes through the argument Hessian instead of refusing.
    const zAt = (u: number): number => Math.abs(1 + u * u);
    try {
      const { first, second, request } = firstThenSecond(
        abs(add(constant('1'), square(U))),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x201));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x202));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('one-sided abs (negative branch): z = |u^2 - 2| = 2 - u^2, sound and tighter', () => {
    // u^2 - 2 < 0 over the cell: abs is the smooth -g branch, so the Hessian
    // negates the argument Hessian.
    const zAt = (u: number): number => Math.abs(u * u - 2);
    try {
      const { first, second, request } = firstThenSecond(
        abs(sub(square(U), constant('2'))),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x211));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x212));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('one-sided max: z = max(0.5, 1 + u^2) selects the smooth branch, sound and tighter', () => {
    // 1 + u^2 >= 1 > 0.5 over the cell: max provably selects the curved right
    // argument, so the second-order pass uses that branch's Hessian.
    const zAt = (u: number): number => Math.max(0.5, 1 + u * u);
    try {
      const { first, second, request } = firstThenSecond(
        maxOf(constant('0.5'), add(constant('1'), square(U))),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x221));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x222));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('one-sided min: z = min(3, 1 + u^2) selects the smooth branch, sound and tighter', () => {
    // 1 + u^2 <= 1.0625 < 3 over the cell: min provably selects the curved right
    // argument.
    const zAt = (u: number): number => Math.min(3, 1 + u * u);
    try {
      const { first, second, request } = firstThenSecond(
        minOf(constant('3'), add(constant('1'), square(U))),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x231));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x232));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.8);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('straddling kink (abs) falls back to the first-order form, sound and identical', () => {
    // Same crossing absolute-value crease as the first-order kink test: the
    // abs node straddles zero, so no bounded Hessian exists and the second-order
    // pass must fall back to the first-order mean-value bound verbatim.
    const zAt = (u: number, v: number): number =>
      0.02 * Math.abs(8 * u - 8 * v - 0.5) + 0.01 * (u + v);
    try {
      const { first, second, request } = firstThenSecond(
        add(
          mul(
            constant('0.02'),
            abs(sub(sub(mul(constant('8'), U), mul(constant('8'), V)), constant('0.5')))
          ),
          mul(constant('0.01'), add(U, V))
        ),
        () => 0.001,
        [
          [1, 0],
          [3, 1],
          [2, 3],
        ],
        3
      );
      expectFallbackMatchesFirstOrder(first, second);
      expectContainment(second, request, zAt, 8, mulberry32(0xd1));
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('divide second-derivative rule: z = u/(2+v), sound and tighter', () => {
    // Quotient rule; domain-guarded (2 + v >= 2 > 0 over the cell).
    const zAt = (u: number, v: number): number => u / (2 + v);
    try {
      const { first, second, request } = firstThenSecond(
        divOf(U, add(constant('2'), V)),
        zAt,
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, zAt, 16, mulberry32(0xe1));
      expectContainment(second, request, zAt, 16, mulberry32(0xe2));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.9);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('power second-derivative rule (constant exponent): z = (1+u)^3, sound and tighter', () => {
    // Constant exponent p=3, base 1+u >= 1 > 0: f'(a)=p a^(p-1), f''(a)=p(p-1) a^(p-2).
    const zAt = (u: number): number => (1 + u) ** 3;
    try {
      const { first, second, request } = firstThenSecond(
        powOf(add(constant('1'), U), constant('3')),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x1b1));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x1b2));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      expect(width(second)).toBeLessThan(width(first) * 0.9);
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('power with base touching zero (exp>=2): z = u^4 engages second order, sound and tighter', () => {
    // base = u reaches 0 on the cell; f'' = 12 u^2 is finite at 0, so exp>=2
    // must engage rather than fall back.
    const zAt = (u: number): number => u ** 4;
    try {
      const { first, second, request } = firstThenSecond(
        powOf(U, constant('4')),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectContainment(first, request, (u) => zAt(u), 16, mulberry32(0x1d1));
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x1d2));
      expect(getLastScreenSecondOrderUsed()).toBe(true);
      // 12 u^2 is a wide Hessian over [0, 0.25], so the gain is modest; the point
      // is that base-touching-zero with exp>=2 engages and stays sound/tighter.
      expect(width(second)).toBeLessThan(width(first));
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('power with base touching zero and 1<exp<2 falls back (unbounded second derivative)', () => {
    // p(p-1) u^(p-2) blows up as u -> 0 for 1 < p < 2, so this must fall
    // back to the first-order form and stay sound.
    const zAt = (u: number): number => u ** 1.5;
    try {
      const { first, second, request } = firstThenSecond(
        powOf(U, constant('1.5')),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectFallbackMatchesFirstOrder(first, second);
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0x1d3));
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('power with a varying exponent falls back to the first-order form', () => {
    // Exponent depends on v (not constant), so no unary a^p rule applies: the
    // pass must fall back to the first-order form and stay sound.
    const zAt = (u: number, v: number): number => (1 + u) ** (2 + v);
    try {
      const { first, second, request } = firstThenSecond(
        powOf(add(constant('1'), U), add(constant('2'), V)),
        zAt,
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectFallbackMatchesFirstOrder(first, second);
      expectContainment(second, request, zAt, 16, mulberry32(0x1c1));
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('jump op (floor) falls back to the first-order form, sound and identical', () => {
    // floor(0.5 + 0.1u) is locally constant on the cell but still has no
    // second-order rule, so the second-order pass falls back to first order.
    const zAt = (u: number): number => Math.floor(0.5 + 0.1 * u) + u;
    try {
      const { first, second, request } = firstThenSecond(
        add(floorOf(add(constant('0.5'), mul(constant('0.1'), U))), U),
        (u) => zAt(u),
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        4
      );
      expectFallbackMatchesFirstOrder(first, second);
      expectContainment(second, request, (u) => zAt(u), 16, mulberry32(0xf1));
    } finally {
      setScreenSecondOrder(false);
    }
  });

  it('keeps the certified first-order compiler proof byte-identical (flag OFF by default)', () => {
    // The second-order pass is flag-gated OFF, so the certified method text and
    // its hash must be untouched; this pin is the canary that no second-order
    // work leaked into the default certificate. Changing it is a deliberate
    // re-proof, not an incidental edit.
    expect(VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION).toBe(
      'potfoundry.validated-target-program-compiler/v14'
    );
    expect(VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256).toBe(
      '8e79440a0ea37d5d5dfd68d8bc8f4db3c56ba617d23b4bee07ce92df8f2dee65'
    );
  });

  it('pins the prepared second-order Lagrange-remainder proof text', () => {
    expect(VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_TEXT).toContain(
      'second-order Lagrange remainder'
    );
    expect(VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_TEXT).toContain(
      'falls back to the sound first-order mean-value enclosure'
    );
    expect(VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_TEXT).toContain('acceptance-only');
    expect(VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_SHA256).toBe(
      'b26a7de68e7d597d75c86ad7b3b6a6dfb85c5f6d290f95f14c6cc1624feee52d'
    );
  });

  it('stays sound on a composed smooth field across many diverse cells', () => {
    // z = 0.3 sin(5u) + 0.2 cos(4v) + 0.5 u v + 0.1 u^2 composes every
    // implemented smooth op with mixed-sign curvature; each cell's second-order
    // enclosure must contain interior residuals. A soundness fuzz over cells of
    // varied position and size guards against cross-op Hessian sign/pairing bugs
    // the single-op tests could miss.
    const zAt = (u: number, v: number): number =>
      0.3 * Math.sin(5 * u) + 0.2 * Math.cos(4 * v) + 0.5 * u * v + 0.1 * u * u;
    const z = add(
      add(
        mul(constant('0.3'), sin(mul(constant('5'), U))),
        mul(constant('0.2'), cos(mul(constant('4'), V)))
      ),
      add(mul(constant('0.5'), mul(U, V)), mul(constant('0.1'), square(U)))
    );
    const cells: Array<{ corners: readonly [Corner, Corner, Corner]; fb: number; seed: number }> = [
      { corners: [[0, 0], [4, 0], [4, 4]], fb: 4, seed: 0x111 },
      { corners: [[8, 8], [12, 8], [10, 14]], fb: 5, seed: 0x222 },
      { corners: [[20, 4], [28, 4], [24, 12]], fb: 6, seed: 0x333 },
      { corners: [[1, 1], [5, 2], [3, 6]], fb: 4, seed: 0x444 },
      { corners: [[16, 16], [24, 18], [20, 28]], fb: 6, seed: 0x555 },
    ];
    let secondOrderCells = 0;
    try {
      for (const { corners, fb, seed } of cells) {
        const evaluator = evaluatorFor(z);
        const request = requestFor(zAt, corners, fb);
        const denom = 2 ** fb;
        setScreenSecondOrder(false);
        const first = evaluator.encloseResidualFast(request) as Enclosure | null;
        setScreenSecondOrder(true);
        const second = evaluator.encloseResidualFast(request) as Enclosure | null;
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        if (first === null || second === null) continue;
        if (getLastScreenSecondOrderUsed()) secondOrderCells += 1;
        expectContainment(first, request, zAt, denom, mulberry32(seed));
        expectContainment(second, request, zAt, denom, mulberry32(seed ^ 0x9e3779b9));
      }
    } finally {
      setScreenSecondOrder(false);
    }
    // The composed field is smooth everywhere, so the second-order form must
    // actually engage (not silently fall back on every cell).
    expect(secondOrderCells).toBe(cells.length);
  });
});
