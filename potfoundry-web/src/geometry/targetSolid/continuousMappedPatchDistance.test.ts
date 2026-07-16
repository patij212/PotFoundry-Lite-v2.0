import { describe, expect, it } from 'vitest';

import { exportTo3MF } from '../exporters/export3MF';
import type { MeshData } from '../types';
import {
  certifyContinuousMappedPatchDistance,
  ContinuousMappedPatchDistanceError,
  type RegisteredValidatedResidualEvaluator,
} from './continuousMappedPatchDistance';
import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import type { ExactDyadicDomainPartitionInput } from './exactDyadicDomainPartition';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import { sha256Utf8 } from './incrementalSha256';
import { createObjFinalArtifactProofSession } from './objArtifact';
import { createThreeMfFinalArtifactProofSession } from './threeMfArtifact';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import { VALIDATED_RESIDUAL_PROGRAM_VERSION } from './validatedResidualProgram';

type Point3 = readonly [number, number, number];
type Triangle3 = readonly [Point3, Point3, Point3];

function binaryStl(triangles: readonly Triangle3[]): Uint8Array {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, triangleIndex) => {
    const base = 84 + triangleIndex * 50;
    for (let normalCoordinate = 0; normalCoordinate < 3; normalCoordinate += 1) {
      view.setFloat32(base + normalCoordinate * 4, 0, true);
    }
    triangle.forEach((point, vertexIndex) => {
      point.forEach((coordinate, coordinateIndex) => {
        view.setFloat32(base + 12 + (vertexIndex * 3 + coordinateIndex) * 4, coordinate, true);
      });
    });
  });
  return bytes;
}

function partition(): ExactDyadicDomainPartitionInput {
  return {
    patchId: 'outer-wall',
    fractionBits: 0,
    domain: {
      minUNumerator: '0',
      maxUNumerator: '1',
      minVNumerator: '0',
      maxVNumerator: '1',
    },
    artifactTriangleCount: 2,
    triangles: [
      {
        artifactTriangleIndex: 0,
        vertices: [
          { uNumerator: '0', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '1' },
        ],
      },
      {
        artifactTriangleIndex: 1,
        vertices: [
          { uNumerator: '0', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '1' },
          { uNumerator: '0', vNumerator: '1' },
        ],
      },
    ],
  };
}

function artifact(z = 0) {
  return createFinalArtifactProofSession(
    binaryStl([
      [
        [0, 0, z],
        [1, 0, z],
        [1, 1, z],
      ],
      [
        [0, 0, z],
        [1, 1, z],
        [0, 1, z],
      ],
    ])
  );
}

function exactObjArtifact() {
  return createObjFinalArtifactProofSession(
    new TextEncoder().encode([
      'o Proof',
      'v 0.000000000 0.000000000 0.000000000',
      'v 1.000000000 0.000000000 0.000000000',
      'v 1.000000000 1.000000000 0.000000000',
      'v 0.000000000 1.000000000 0.000000000',
      'f 1 2 3',
      'f 1 3 4',
    ].join('\n'))
  );
}

async function exactThreeMfArtifact() {
  const mesh: MeshData = {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    vertexCount: 4,
    triangleCount: 2,
  };
  const blob = await exportTo3MF(mesh, { name: 'Proof', unit: 'millimeter' });
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return createThreeMfFinalArtifactProofSession(bytes);
}

type Expression = Readonly<Record<string, unknown>>;

function constant(value: string): Expression {
  return { op: 'constant', value };
}

function evaluator(
  residualZ: Expression,
  targetSha256: unknown = sha256Utf8('test target')
): RegisteredValidatedResidualEvaluator {
  return compileValidatedResidualEvaluator({
    targetSha256: targetSha256 as string,
    programCanonicalJson: canonicalizeCertificationJson({
      evaluatorId: 'test-validated-residual',
      evaluatorVersion: 'test-v1',
      patchId: 'outer-wall',
      schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      target: { x: { op: 'u' }, y: { op: 'v' }, z: residualZ },
    }),
  });
}

function constantZResidual(z: number): RegisteredValidatedResidualEvaluator {
  return evaluator(constant(z.toString()));
}

function expectCode(operation: () => unknown, code: ContinuousMappedPatchDistanceError['code']): void {
  try {
    operation();
    throw new Error('Expected operation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ContinuousMappedPatchDistanceError);
    expect((error as ContinuousMappedPatchDistanceError).code).toBe(code);
  }
}

describe('certifyContinuousMappedPatchDistance', () => {
  it('executes a continuous two-sided shared-parameter proof over final parsed triangles', () => {
    const result = certifyContinuousMappedPatchDistance(
      artifact(),
      partition(),
      constantZResidual(0),
      { maximumGeometricUpperPm: 10_000_000n }
    );

    expect(result).toEqual(
      expect.objectContaining({
        artifactTriangleSubsetCount: 2,
        workCellCount: 2,
        acceptedLeafCellCount: 2,
        targetToMeshUpperPm: '1',
        meshToTargetUpperPm: '1',
        scanComplete: true,
        continuousCorrespondenceProven: true,
      })
    );
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('uses the same continuous proof over exact-picometre OBJ and 3MF final bytes', async () => {
    const [obj, threeMf] = await Promise.all([
      Promise.resolve(exactObjArtifact()),
      exactThreeMfArtifact(),
    ]);
    const results = [obj, threeMf].map((session) =>
      certifyContinuousMappedPatchDistance(
        session,
        partition(),
        constantZResidual(0),
        { maximumGeometricUpperPm: 10_000_000n }
      )
    );
    expect(results.map((result) => result.artifactFormat)).toEqual(['obj', '3mf']);
    expect(
      results.every((result) => result.artifactCoordinateEncoding === 'exact-integer-pm')
    ).toBe(true);
    expect(results.every((result) => BigInt(result.targetToMeshUpperPm) <= 1n)).toBe(true);
    expect(results[0].artifactTriangleSubsetSha256).not.toBe(
      results[1].artifactTriangleSubsetSha256
    );
  });

  it('passes a 0.009 mm continuous residual under a literal 0.01 mm budget', () => {
    const result = certifyContinuousMappedPatchDistance(
      artifact(),
      partition(),
      constantZResidual(0.009),
      { maximumGeometricUpperPm: 10_000_000n }
    );

    expect(BigInt(result.targetToMeshUpperPm)).toBeLessThanOrEqual(10_000_000n);
  });

  it('refuses a one-micrometre-over-tolerance residual instead of reporting a percentile', () => {
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(
          artifact(),
          partition(),
          constantZResidual(0.010001),
          { maximumGeometricUpperPm: 10_000_000n, maxDepth: 1 }
        ),
      'INCONCLUSIVE'
    );
  });

  it('finds a hidden interior bump even though all artifact vertices remain on the target plane', () => {
    const pi = constant(Math.PI.toString());
    const sinPiU: Expression = {
      op: 'sin',
      arg: { op: 'multiply', left: pi, right: { op: 'u' } },
    };
    const sinPiV: Expression = {
      op: 'sin',
      arg: { op: 'multiply', left: pi, right: { op: 'v' } },
    };
    const hiddenBump = evaluator({
      op: 'multiply',
      left: constant('0.02'),
      right: { op: 'multiply', left: sinPiU, right: sinPiV },
    });

    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(artifact(), partition(), hiddenBump, {
          maximumGeometricUpperPm: 10_000_000n,
          maxDepth: 4,
        }),
      'INCONCLUSIVE'
    );
  });

  it('refuses invalid evaluator programs and work exhaustion', () => {
    expect(() =>
      evaluator({
        op: 'divide',
        left: constant('1'),
        right: { op: 'subtract', left: { op: 'u' }, right: { op: 'u' } },
      })
    ).toThrow(/division through zero/i);
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(
          artifact(),
          partition(),
          constantZResidual(0.02),
          { maximumGeometricUpperPm: 10_000_000n, maxWorkCells: 1 }
        ),
      'RESOURCE_LIMIT'
    );
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(
          artifact(),
          partition(),
          constantZResidual(0),
          { maximumGeometricUpperPm: 10_000_000n, maxEvaluatorWorkUnits: 1 }
        ),
      'RESOURCE_LIMIT'
    );
  });

  it('derives target-minus-artifact internally instead of trusting a supplied residual', () => {
    const zero = { op: 'constant', value: '0' };
    const allZeroTarget = compileValidatedResidualEvaluator({
      targetSha256: sha256Utf8('all-zero semantic regression target'),
      programCanonicalJson: canonicalizeCertificationJson({
        evaluatorId: 'all-zero-target-regression',
        evaluatorVersion: 'v1',
        patchId: 'outer-wall',
        schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
        target: { x: zero, y: zero, z: zero },
      }),
    });

    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(artifact(), partition(), allZeroTarget, {
          maximumGeometricUpperPm: 10_000_000n,
          maxDepth: 0,
        }),
      'INCONCLUSIVE'
    );
  });

  it('binds patch evidence to the exact parsed artifact triangle bytes', () => {
    const flat = certifyContinuousMappedPatchDistance(
      artifact(0),
      partition(),
      constantZResidual(0),
      { maximumGeometricUpperPm: 10_000_000n }
    );
    const shifted = certifyContinuousMappedPatchDistance(
      artifact(0.001),
      partition(),
      constantZResidual(0),
      { maximumGeometricUpperPm: 10_000_000n }
    );

    expect(flat.artifactTriangleSubsetSha256).not.toBe(shifted.artifactTriangleSubsetSha256);
    expect(flat.evidenceSha256).not.toBe(shifted.evidenceSha256);
  });

  it('honours shared-memory cancellation before invoking proof work', () => {
    const cancellationFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.store(cancellationFlag, 0, 1);
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(
          artifact(),
          partition(),
          constantZResidual(0),
          { maximumGeometricUpperPm: 10_000_000n, cancellationFlag }
        ),
      'CANCELLED'
    );
  });

  it('rejects a frozen structural evaluator copy that was never registered', () => {
    const genuine = constantZResidual(0);
    const lookalike = Object.freeze({ ...genuine }) as unknown as RegisteredValidatedResidualEvaluator;
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(artifact(), partition(), lookalike, {
          maximumGeometricUpperPm: 10_000_000n,
        }),
      'INVALID_INPUT'
    );
  });

  it('refuses coercible objects for target hashes before program execution', () => {
    const coercibleHash = Object.defineProperty({}, Symbol.toPrimitive, {
      value: () => 'a'.repeat(64),
    });
    expect(() =>
      evaluator(constant('0'), coercibleHash)
    ).toThrow(/compilation refused/i);
  });

  it('refuses an accessor-backed tolerance without invoking it', () => {
    let budgetReads = 0;
    const unstableOptions = Object.defineProperty(
      { maxDepth: 0 },
      'maximumGeometricUpperPm',
      {
        enumerable: true,
        get() {
          budgetReads += 1;
          return budgetReads === 1 ? 10_000_000n : 1_000_000_000_000_000_000n;
        },
      }
    );

    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(
          artifact(),
          partition(),
          constantZResidual(0.02),
          unstableOptions as { maximumGeometricUpperPm: bigint; maxDepth: number }
        ),
      'INVALID_INPUT'
    );
    expect(budgetReads).toBe(0);
  });
});

describe('rational partitions and the unit-square domain gate (U3b)', () => {
  // Unit square over denominator 3: the line u = 1/3 is exactly a cell
  // boundary. The artifact plane carries matching binary32 vertices.
  function rationalPartition(): ExactDyadicDomainPartitionInput {
    const p = (u: string, v: string) => ({ uNumerator: u, vNumerator: v });
    return {
      patchId: 'outer-wall',
      fractionBits: 0,
      oddDenominatorFactor: '3',
      domain: {
        minUNumerator: '0',
        maxUNumerator: '3',
        minVNumerator: '0',
        maxVNumerator: '3',
      },
      artifactTriangleCount: 4,
      triangles: [
        { artifactTriangleIndex: 0, vertices: [p('0', '0'), p('1', '0'), p('1', '3')] },
        { artifactTriangleIndex: 1, vertices: [p('0', '0'), p('1', '3'), p('0', '3')] },
        { artifactTriangleIndex: 2, vertices: [p('1', '0'), p('3', '0'), p('3', '3')] },
        { artifactTriangleIndex: 3, vertices: [p('1', '0'), p('3', '3'), p('1', '3')] },
      ],
    };
  }

  function rationalArtifact() {
    const third = 1 / 3;
    return createFinalArtifactProofSession(
      binaryStl([
        [
          [0, 0, 0],
          [third, 0, 0],
          [third, 1, 0],
        ],
        [
          [0, 0, 0],
          [third, 1, 0],
          [0, 1, 0],
        ],
        [
          [third, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [third, 0, 0],
          [1, 1, 0],
          [third, 1, 0],
        ],
      ])
    );
  }

  it('proves a continuous correspondence over a denominator-3 partition', () => {
    const result = certifyContinuousMappedPatchDistance(
      rationalArtifact(),
      rationalPartition(),
      constantZResidual(0),
      { maximumGeometricUpperPm: 10_000_000n }
    );
    expect(result).toEqual(
      expect.objectContaining({
        artifactTriangleSubsetCount: 4,
        scanComplete: true,
        continuousCorrespondenceProven: true,
      })
    );
    // The only residual is the binary32 rounding of 1/3 (~10 pm) plus
    // enclosure widening — the rational station itself is exact.
    expect(BigInt(result.targetToMeshUpperPm)).toBeLessThan(1_000n);
  });

  it('subdivides rational cells without losing the odd factor', () => {
    // A hidden interior bump forces depth-limited refusal: every consulted
    // cell at depth >= 1 carries fractionBits+depth with the inherited odd
    // factor through the numeric, screen, and decimal channels.
    const pi = constant(Math.PI.toString());
    const bump = evaluator({
      op: 'multiply',
      left: constant('0.02'),
      right: {
        op: 'multiply',
        left: { op: 'sin', arg: { op: 'multiply', left: pi, right: { op: 'u' } } },
        right: { op: 'sin', arg: { op: 'multiply', left: pi, right: { op: 'v' } } },
      },
    });
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(rationalArtifact(), rationalPartition(), bump, {
          maximumGeometricUpperPm: 10_000_000n,
          maxDepth: 2,
        }),
      'INCONCLUSIVE'
    );
  });

  it('refuses a partition whose declared rectangle is not the full unit square', () => {
    // Same exact triangles and a VALID kernel partition proof — but declared
    // over denominator 2, so the rectangle is [0, 1/2]^2 in absolute UV. The
    // two-sided bound would silently cover a quarter of the target patch;
    // the complete-parametrization gate must refuse.
    expectCode(
      () =>
        certifyContinuousMappedPatchDistance(
          artifact(),
          { ...partition(), fractionBits: 1 },
          constantZResidual(0),
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'INVALID_INPUT'
    );
  });
});
