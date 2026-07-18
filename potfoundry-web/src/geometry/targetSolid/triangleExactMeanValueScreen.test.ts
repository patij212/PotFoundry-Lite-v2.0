import { describe, expect, it } from 'vitest';

import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import { sha256Utf8 } from './incrementalSha256';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  getLastScreenClarkeFired,
  setScreenJacobianPartition,
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
