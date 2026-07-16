import { describe, expect, it } from 'vitest';

import {
  ExactDyadicDomainPartitionError,
  HARD_DYADIC_PARTITION_MAX_BUILD_WORK,
  HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
  HARD_DYADIC_PARTITION_MAX_BVH_NODES,
  HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS,
  HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
  HARD_DYADIC_PARTITION_MAX_TRIANGLES,
  snapshotExactDyadicDomainPartitionInputForProof,
  verifyExactDyadicRectanglePartition,
  type ExactDyadicDomainPartitionInput,
  type ExactDyadicMappedTriangle,
  type ExactDyadicPoint2,
} from './exactDyadicDomainPartition';

const point = (u: number, v: number): ExactDyadicPoint2 => ({
  uNumerator: u.toString(),
  vNumerator: v.toString(),
});

const triangle = (
  artifactTriangleIndex: number,
  a: ExactDyadicPoint2,
  b: ExactDyadicPoint2,
  c: ExactDyadicPoint2
): ExactDyadicMappedTriangle => ({ artifactTriangleIndex, vertices: [a, b, c] });

function input(triangles: readonly ExactDyadicMappedTriangle[]): ExactDyadicDomainPartitionInput {
  return {
    patchId: 'outer-wall',
    fractionBits: 4,
    domain: {
      minUNumerator: '0',
      maxUNumerator: '16',
      minVNumerator: '0',
      maxVNumerator: '16',
    },
    artifactTriangleCount: 32,
    triangles,
  };
}

function expectCode(operation: () => unknown, code: ExactDyadicDomainPartitionError['code']): void {
  try {
    operation();
    throw new Error('Expected operation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ExactDyadicDomainPartitionError);
    expect((error as ExactDyadicDomainPartitionError).code).toBe(code);
  }
}

describe('verifyExactDyadicRectanglePartition', () => {
  it('proves a complete two-triangle unit-square partition with exact arithmetic', () => {
    const result = verifyExactDyadicRectanglePartition(
      input([
        triangle(3, point(0, 0), point(16, 0), point(16, 16)),
        triangle(9, point(0, 0), point(16, 16), point(0, 16)),
      ])
    );

    expect(result).toEqual(
      expect.objectContaining({
        exactPartition: true,
        scanComplete: true,
        triangleCount: 2,
        pairCheckCount: 1,
        doubledDomainAreaNumerator: '512',
        doubledTriangleAreaSumNumerator: '512',
      })
    );
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects a gap even when every individual triangle is valid and inside', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(8, 8)),
            triangle(1, point(0, 0), point(8, 8), point(0, 16)),
          ])
        ),
      'INVALID_PARTITION'
    );
  });

  it('rejects overlap instead of allowing area cancellation to hide a gap', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(16, 16)),
            triangle(1, point(0, 0), point(16, 16), point(0, 16)),
            triangle(2, point(0, 0), point(16, 0), point(8, 8)),
          ])
        ),
      'INVALID_PARTITION'
    );
  });

  it('rejects distinct artifact assignments with identical positive-area geometry', () => {
    // Each copy is exactly half the rectangle. Counting the duplicate twice
    // makes the aggregate area look complete while the other half is absent.
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(16, 16)),
            triangle(1, point(0, 0), point(16, 0), point(16, 16)),
          ])
        ),
      'INVALID_PARTITION'
    );
  });

  it('rejects two positive triangles whose interiors are on the same side of a shared edge', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(12, 12)),
            triangle(1, point(0, 0), point(16, 0), point(4, 12)),
          ])
        ),
      'INVALID_PARTITION'
    );
  });

  it('rejects a conforming-looking T-junction', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(16, 16)),
            triangle(1, point(0, 0), point(8, 8), point(0, 16)),
            triangle(2, point(0, 16), point(8, 8), point(16, 16)),
          ])
        ),
      'INVALID_PARTITION'
    );
  });

  it('rejects clockwise, degenerate, duplicate, and unsorted assignments', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([triangle(0, point(0, 0), point(0, 16), point(16, 16))])
        ),
      'INVALID_PARTITION'
    );
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([triangle(0, point(0, 0), point(8, 8), point(16, 16))])
        ),
      'INVALID_PARTITION'
    );
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(3, point(0, 0), point(16, 0), point(16, 16)),
            triangle(3, point(0, 0), point(16, 16), point(0, 16)),
          ])
        ),
      'INVALID_INPUT'
    );
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(9, point(0, 0), point(16, 0), point(16, 16)),
            triangle(3, point(0, 0), point(16, 16), point(0, 16)),
          ])
        ),
      'INVALID_INPUT'
    );
  });

  it('refuses artifact indices outside the uint32 evidence encoding envelope', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition({
          ...input([
            triangle(0, point(0, 0), point(16, 0), point(16, 16)),
            triangle(1, point(0, 0), point(16, 16), point(0, 16)),
          ]),
          artifactTriangleCount: 0x1_0000_0002,
        }),
      'INVALID_INPUT'
    );
  });

  it('refuses when the complete pair audit exceeds its declared work cap', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(8, 8)),
            triangle(1, point(16, 0), point(16, 16), point(8, 8)),
            triangle(2, point(16, 16), point(0, 16), point(8, 8)),
            triangle(3, point(0, 16), point(0, 0), point(8, 8)),
          ]),
          { maxPairChecks: 1 }
        ),
      'RESOURCE_LIMIT'
    );

    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(3, point(0, 0), point(16, 0), point(16, 16)),
            triangle(9, point(0, 0), point(16, 16), point(0, 16)),
          ]),
          { maxPairChecks: 0 }
        ),
      'INVALID_INPUT'
    );
  });

  it('completes a 3,200-triangle grid without a quadratic all-pairs audit', () => {
    const side = 40;
    const triangles: ExactDyadicMappedTriangle[] = [];
    let artifactTriangleIndex = 0;
    for (let v = 0; v < side; v += 1) {
      for (let u = 0; u < side; u += 1) {
        triangles.push(
          triangle(
            artifactTriangleIndex++,
            point(u, v),
            point(u + 1, v),
            point(u + 1, v + 1)
          ),
          triangle(
            artifactTriangleIndex++,
            point(u, v),
            point(u + 1, v + 1),
            point(u, v + 1)
          )
        );
      }
    }
    const result = verifyExactDyadicRectanglePartition({
      patchId: 'outer-wall',
      fractionBits: 0,
      domain: {
        minUNumerator: '0',
        maxUNumerator: side.toString(),
        minVNumerator: '0',
        maxVNumerator: side.toString(),
      },
      artifactTriangleCount: triangles.length,
      triangles,
    });

    expect(result.triangleCount).toBe(3_200);
    expect(result.exactPartition).toBe(true);
    expect(result.pairCheckCount).toBeLessThan(200_000);
    expect(result.broadPhasePairCheckCount).toBeLessThan(500_000);
  });

  it('streams evidence for more triangles than canonical JSON can place in one array', () => {
    const side = 65;
    const triangles: ExactDyadicMappedTriangle[] = [];
    let artifactTriangleIndex = 0;
    for (let v = 0; v < side; v += 1) {
      for (let u = 0; u < side; u += 1) {
        triangles.push(
          triangle(
            artifactTriangleIndex++,
            point(u, v),
            point(u + 1, v),
            point(u + 1, v + 1)
          ),
          triangle(
            artifactTriangleIndex++,
            point(u, v),
            point(u + 1, v + 1),
            point(u, v + 1)
          )
        );
      }
    }

    const result = verifyExactDyadicRectanglePartition({
      patchId: 'large-grid',
      fractionBits: 0,
      domain: {
        minUNumerator: '0',
        maxUNumerator: side.toString(),
        minVNumerator: '0',
        maxVNumerator: side.toString(),
      },
      artifactTriangleCount: triangles.length,
      triangles,
    });

    expect(result.triangleCount).toBe(8_450);
    expect(result.triangleEvidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.artifactTriangleAssignmentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('supports cancellation only through bounded shared atomic state', () => {
    const cancellationFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.store(cancellationFlag, 0, 1);
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(3, point(0, 0), point(16, 0), point(16, 16)),
            triangle(9, point(0, 0), point(16, 16), point(0, 16)),
          ]),
          { cancellationFlag }
        ),
      'CANCELLED'
    );
  });

  it('reuses one authenticated immutable input snapshot across proof layers', () => {
    const source = input([
      triangle(0, point(0, 0), point(16, 0), point(16, 16)),
      triangle(1, point(0, 0), point(16, 16), point(0, 16)),
    ]);
    const first = snapshotExactDyadicDomainPartitionInputForProof(source, 2);
    const second = snapshotExactDyadicDomainPartitionInputForProof(first, 2);
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.triangles)).toBe(true);
  });

  it('fails closed when the shared elapsed-time deadline is already exhausted', () => {
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          input([
            triangle(0, point(0, 0), point(16, 0), point(16, 16)),
            triangle(1, point(0, 0), point(16, 16), point(0, 16)),
          ]),
          { deadlineEpochMilliseconds: Date.now() - 1_000 }
        ),
      'RESOURCE_LIMIT'
    );
  });

  it('refuses accessors and every caller attempt to raise a hard resource ceiling', () => {
    let accessorInvoked = false;
    const accessorInput = Object.defineProperty(
      {
        ...input([]),
        triangles: undefined,
      },
      'triangles',
      {
        enumerable: true,
        get() {
          accessorInvoked = true;
          return [];
        },
      }
    );
    expectCode(
      () =>
        verifyExactDyadicRectanglePartition(
          accessorInput as unknown as ExactDyadicDomainPartitionInput
        ),
      'INVALID_INPUT'
    );
    expect(accessorInvoked).toBe(false);

    const valid = input([
      triangle(0, point(0, 0), point(16, 0), point(16, 16)),
      triangle(1, point(0, 0), point(16, 16), point(0, 16)),
    ]);
    const overHardLimits = [
      { maxTriangles: HARD_DYADIC_PARTITION_MAX_TRIANGLES + 1 },
      { maxBuildWork: HARD_DYADIC_PARTITION_MAX_BUILD_WORK + 1 },
      { maxBvhNodes: HARD_DYADIC_PARTITION_MAX_BVH_NODES + 1 },
      { maxTraversalVisits: HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS + 1 },
      {
        maxBroadPhasePairChecks:
          HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS + 1,
      },
      { maxPairChecks: HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS + 1 },
    ] as const;
    for (const options of overHardLimits) {
      expectCode(
        () => verifyExactDyadicRectanglePartition(valid, options),
        'RESOURCE_LIMIT'
      );
    }
  });
});

describe('rational partitions (odd denominator factor)', () => {
  // Unit square over denominator 3 (fractionBits 0, odd factor 3): the
  // vertical line u = 1/3 is EXACTLY a cell boundary — the U3b unlock for
  // fract-family feature lines at k/N with N not a power of two.
  const thirdSplit = (): ExactDyadicDomainPartitionInput => ({
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
      triangle(0, point(0, 0), point(1, 0), point(1, 3)),
      triangle(1, point(0, 0), point(1, 3), point(0, 3)),
      triangle(2, point(1, 0), point(3, 0), point(3, 3)),
      triangle(3, point(1, 0), point(3, 3), point(1, 3)),
    ],
  });

  it('proves a partition split exactly at u = 1/3', () => {
    const result = verifyExactDyadicRectanglePartition(thirdSplit());
    expect(result).toEqual(
      expect.objectContaining({
        exactPartition: true,
        scanComplete: true,
        triangleCount: 4,
        oddDenominatorFactor: '3',
        doubledDomainAreaNumerator: '18',
        doubledTriangleAreaSumNumerator: '18',
      })
    );
  });

  it('resolves the odd factor to 1 for dyadic partitions and binds it into evidence', () => {
    const dyadic = verifyExactDyadicRectanglePartition(
      input([
        triangle(3, point(0, 0), point(16, 0), point(16, 16)),
        triangle(9, point(0, 0), point(16, 16), point(0, 16)),
      ])
    );
    expect(dyadic.oddDenominatorFactor).toBe('1');

    // Same numerators, same rectangle, different declared denominator: the
    // partitions describe different coordinate systems and must never share
    // an evidence hash.
    const rational = verifyExactDyadicRectanglePartition(thirdSplit());
    const sameNumeratorsDyadic = verifyExactDyadicRectanglePartition({
      ...thirdSplit(),
      oddDenominatorFactor: undefined,
    } as unknown as ExactDyadicDomainPartitionInput);
    expect(rational.evidenceSha256).not.toBe(sameNumeratorsDyadic.evidenceSha256);
  });

  it('refuses every non-canonical odd factor encoding', () => {
    const withFactor = (oddDenominatorFactor: unknown): ExactDyadicDomainPartitionInput =>
      ({ ...thirdSplit(), oddDenominatorFactor } as ExactDyadicDomainPartitionInput);
    for (const bad of ['2', '1', '0', '-3', '03', '4503599627370497', 3, '9007199254740993x']) {
      expectCode(() => verifyExactDyadicRectanglePartition(withFactor(bad)), 'INVALID_INPUT');
    }
  });

  it('audits rational partitions with the same scale-free exactness (gap refused)', () => {
    const gapped: ExactDyadicDomainPartitionInput = {
      ...thirdSplit(),
      artifactTriangleCount: 3,
      triangles: [
        triangle(0, point(0, 0), point(1, 0), point(1, 3)),
        triangle(1, point(0, 0), point(1, 3), point(0, 3)),
        triangle(2, point(1, 0), point(3, 0), point(3, 3)),
      ],
    };
    expectCode(() => verifyExactDyadicRectanglePartition(gapped), 'INVALID_PARTITION');
  });
});
