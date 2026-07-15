import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from './completeMappedArtifactGeometry';
import type { ValidatedResidualEnclosureRequest } from './continuousMappedPatchDistance';
import { createSinglePatchAnnularRadialSolidTargetBinding } from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  fastResidualScreenRefusalHistogram,
  VALIDATED_RESIDUAL_PROGRAM_VERSION,
} from './validatedResidualProgram';
import { canonicalizeCertificationJson } from './canonicalCertificationJson';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

// Deterministic PRNG so the sampling property is reproducible.
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

function requestForGridCell(
  uCell: number,
  vCell: number,
  divisionsLog2: number,
  evaluateFloat64: (u: number, v: number) => readonly [number, number, number],
  lower: boolean
): ValidatedResidualEnclosureRequest {
  const divisions = 1 << divisionsLog2;
  const corners = lower
    ? ([
        [uCell, vCell],
        [uCell + 1, vCell],
        [uCell + 1, vCell + 1],
      ] as const)
    : ([
        [uCell, vCell],
        [uCell + 1, vCell + 1],
        [uCell, vCell + 1],
      ] as const);
  const vertices = corners.map(([u, v]) => ({
    uNumerator: u.toString(),
    vNumerator: v.toString(),
  })) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
  const verticesMm = corners.map(([u, v]) => {
    const point = evaluateFloat64(u / divisions, v / divisions);
    return [Math.fround(point[0]), Math.fround(point[1]), Math.fround(point[2])] as const;
  }) as unknown as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
  return {
    patchId: 'outer-wall',
    artifactTriangleIndex: 0,
    artifactTriangleVerticesMm: verticesMm,
    originalDomainTriangle: vertices,
    cell: {
      fractionBits: divisionsLog2,
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

describe('fast residual screen', () => {
  it('encloses densely sampled true residuals on a styled outer wall', { timeout: 60_000 }, () => {
    const { program, evaluator } = outerWallFixture();
    const random = mulberry32(0x5eed);
    const divisionsLog2 = 6;
    const divisions = 1 << divisionsLog2;
    let screened = 0;
    for (let trial = 0; trial < 40; trial += 1) {
      const uCell = Math.floor(random() * divisions);
      const vCell = Math.floor(random() * divisions);
      const lower = random() < 0.5;
      const request = requestForGridCell(
        uCell,
        vCell,
        divisionsLog2,
        program.backends.evaluateFloat64,
        lower
      );
      const enclosure = evaluator.encloseResidualFast(request);
      if (enclosure === null) continue;
      screened += 1;
      const triangle = request.artifactTriangleVerticesMm;
      for (let sample = 0; sample < 25; sample += 1) {
        const wa = random();
        const wb = random() * (1 - wa);
        const wc = 1 - wa - wb;
        // Sample the SAME barycentric point on the parameter cell and the
        // affine artifact triangle; the residual must lie in the enclosure.
        const cellVertices = request.cell.vertices;
        const u =
          (wa * Number(cellVertices[0].uNumerator) +
            wb * Number(cellVertices[1].uNumerator) +
            wc * Number(cellVertices[2].uNumerator)) /
          divisions;
        const v =
          (wa * Number(cellVertices[0].vNumerator) +
            wb * Number(cellVertices[1].vNumerator) +
            wc * Number(cellVertices[2].vNumerator)) /
          divisions;
        const targetPoint = program.backends.evaluateFloat64(u, v);
        const residual = [0, 1, 2].map(
          (axis) =>
            targetPoint[axis] -
            (wa * triangle[0][axis] + wb * triangle[1][axis] + wc * triangle[2][axis])
        );
        // Allow one float64 rounding of the sampling arithmetic itself.
        const slack = 1e-9;
        expect(residual[0]).toBeGreaterThanOrEqual(enclosure.xMm.lower - slack);
        expect(residual[0]).toBeLessThanOrEqual(enclosure.xMm.upper + slack);
        expect(residual[1]).toBeGreaterThanOrEqual(enclosure.yMm.lower - slack);
        expect(residual[1]).toBeLessThanOrEqual(enclosure.yMm.upper + slack);
        expect(residual[2]).toBeGreaterThanOrEqual(enclosure.zMm.lower - slack);
        expect(residual[2]).toBeLessThanOrEqual(enclosure.zMm.upper + slack);
      }
    }
    // The property is vacuous if the screen never answered.
    expect(screened).toBeGreaterThan(30);
  });

  it('refuses discontinuous operations instead of guessing a bound', () => {
    const evaluator = compileValidatedResidualEvaluator({
      targetSha256: 'a'.repeat(64),
      programCanonicalJson: canonicalizeCertificationJson({
        evaluatorId: 'screen-test:floor',
        evaluatorVersion: 'v1',
        patchId: 'screen-floor',
        schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
        target: {
          x: { op: 'floor', arg: { op: 'u' } },
          y: { op: 'v' },
          z: { op: 'constant', value: '0' },
        },
      }),
    });
    const request: ValidatedResidualEnclosureRequest = {
      patchId: 'screen-floor',
      artifactTriangleIndex: 0,
      artifactTriangleVerticesMm: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      originalDomainTriangle: [
        { uNumerator: '0', vNumerator: '0' },
        { uNumerator: '1', vNumerator: '0' },
        { uNumerator: '1', vNumerator: '1' },
      ],
      cell: {
        fractionBits: 0,
        barycentricFractionBits: 0,
        vertices: [
          { uNumerator: '0', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '1' },
        ],
        barycentricVertices: [
          { aNumerator: '1', bNumerator: '0', cNumerator: '0' },
          { aNumerator: '0', bNumerator: '1', cNumerator: '0' },
          { aNumerator: '0', bNumerator: '0', cNumerator: '1' },
        ],
      },
    };
    expect(evaluator.encloseResidualFast(request)).toBeNull();
    expect(fastResidualScreenRefusalHistogram().get('op-floor')).toBeGreaterThanOrEqual(1);
    // The validated decimal enclosure still answers the same request.
    const decimal = evaluator.encloseResidual(request);
    expect(Number.isFinite(decimal.xMm.lower)).toBe(true);
  });

  it('keeps a power base exactly zero decidable (constant-folded profile term)', () => {
    const evaluator = compileValidatedResidualEvaluator({
      targetSha256: 'b'.repeat(64),
      programCanonicalJson: canonicalizeCertificationJson({
        evaluatorId: 'screen-test:power-zero',
        evaluatorVersion: 'v1',
        patchId: 'screen-power-zero',
        schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
        target: {
          // x = 0^1.1 * u + u : constant-zero power base must not refuse.
          x: {
            op: 'add',
            left: {
              op: 'multiply',
              left: {
                op: 'power',
                left: { op: 'constant', value: '0' },
                right: { op: 'constant', value: '1.100000000000000088817841970012523233890533447265625' },
              },
              right: { op: 'u' },
            },
            right: { op: 'u' },
          },
          y: { op: 'v' },
          z: { op: 'constant', value: '0' },
        },
      }),
    });
    const request: ValidatedResidualEnclosureRequest = {
      patchId: 'screen-power-zero',
      artifactTriangleIndex: 0,
      artifactTriangleVerticesMm: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      originalDomainTriangle: [
        { uNumerator: '0', vNumerator: '0' },
        { uNumerator: '1', vNumerator: '0' },
        { uNumerator: '1', vNumerator: '1' },
      ],
      cell: {
        fractionBits: 0,
        barycentricFractionBits: 0,
        vertices: [
          { uNumerator: '0', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '1' },
        ],
        barycentricVertices: [
          { aNumerator: '1', bNumerator: '0', cNumerator: '0' },
          { aNumerator: '0', bNumerator: '1', cNumerator: '0' },
          { aNumerator: '0', bNumerator: '0', cNumerator: '1' },
        ],
      },
    };
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure !== null) {
      // x = u exactly matches the affine artifact; residual is ~0.
      expect(Math.abs(enclosure.xMm.lower)).toBeLessThan(1e-9);
      expect(Math.abs(enclosure.xMm.upper)).toBeLessThan(1e-9);
    }
  });
});
