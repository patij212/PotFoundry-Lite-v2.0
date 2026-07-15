import { describe, expect, it } from 'vitest';

import {
  certifyCompleteMappedArtifactGeometry,
  CompleteMappedArtifactGeometryError,
  COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION,
  createCompleteMappedGeometryTargetBinding,
  type CompleteMappedGeometryTargetBinding,
  type MappedPatchProofJob,
} from './completeMappedArtifactGeometry';
import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import type { RegisteredValidatedResidualEvaluator } from './continuousMappedPatchDistance';
import type { ExactDyadicDomainPartitionInput } from './exactDyadicDomainPartition';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import { sha256Utf8 } from './incrementalSha256';
import { createObjFinalArtifactProofSession } from './objArtifact';
import { TARGET_SOLID_SPECIFICATION_SHA256 } from './targetSolidSpecification';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  computeValidatedResidualProgramSha256,
  VALIDATED_RESIDUAL_PROGRAM_VERSION,
} from './validatedResidualProgram';

type Point3 = readonly [number, number, number];
type Triangle3 = readonly [Point3, Point3, Point3];

function binaryStl(triangles: readonly Triangle3[]): Uint8Array {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, triangleIndex) => {
    const base = 84 + triangleIndex * 50;
    triangle.forEach((point, vertexIndex) => {
      point.forEach((coordinate, coordinateIndex) => {
        view.setFloat32(base + 12 + (vertexIndex * 3 + coordinateIndex) * 4, coordinate, true);
      });
    });
  });
  return bytes;
}

const square: readonly Triangle3[] = [
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
  ],
  [
    [0, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
];

function exactObjSquare() {
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

function partition(
  patchId: string,
  artifactTriangleCount = 2,
  firstTriangleIndex = 0
): ExactDyadicDomainPartitionInput {
  return {
    patchId,
    fractionBits: 0,
    domain: {
      minUNumerator: '0',
      maxUNumerator: '1',
      minVNumerator: '0',
      maxVNumerator: '1',
    },
    artifactTriangleCount,
    triangles: [
      {
        artifactTriangleIndex: firstTriangleIndex,
        vertices: [
          { uNumerator: '0', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '1' },
        ],
      },
      {
        artifactTriangleIndex: firstTriangleIndex + 1,
        vertices: [
          { uNumerator: '0', vNumerator: '0' },
          { uNumerator: '1', vNumerator: '1' },
          { uNumerator: '0', vNumerator: '1' },
        ],
      },
    ],
  };
}

const targetPrograms = new WeakMap<
  CompleteMappedGeometryTargetBinding,
  ReadonlyMap<string, string>
>();

function constantResidualProgram(patchId: string, zMm = '0'): string {
  return canonicalizeCertificationJson({
    evaluatorId: `test-evaluator:${patchId}`,
    evaluatorVersion: 'test-v1',
    patchId,
    schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
    target: {
      x: { op: 'u' },
      y: { op: 'v' },
      z: { op: 'constant', value: zMm },
    },
  });
}

function target(
  expectedPatchIds: readonly string[],
  residualZByPatch: Readonly<Record<string, string>> = {}
): CompleteMappedGeometryTargetBinding {
  const programs = new Map(
    expectedPatchIds.map((patchId) => [
      patchId,
      constantResidualProgram(patchId, residualZByPatch[patchId] ?? '0'),
    ])
  );
  const binding = createCompleteMappedGeometryTargetBinding(
    canonicalizeCertificationJson({
      patches: expectedPatchIds.map((patchId) => {
        const program = programs.get(patchId);
        if (program === undefined) throw new Error('test program missing');
        return {
          patchId,
          targetPatchPayload: {
            validatedEvaluatorProgramSha256:
              computeValidatedResidualProgramSha256(program),
          },
        };
      }),
      schemaVersion: COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION,
      targetPayload: {
        canonicalInputSha256: sha256Utf8('complete-mapped-artifact-geometry-test input'),
        targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
      },
    })
  );
  targetPrograms.set(binding, programs);
  return binding;
}

function evaluator(
  targetBinding: CompleteMappedGeometryTargetBinding,
  patchId: string,
  targetSha256 = targetBinding.targetSha256
): RegisteredValidatedResidualEvaluator {
  const program = targetPrograms.get(targetBinding)?.get(patchId);
  if (program === undefined) throw new Error(`test program missing for ${patchId}`);
  return compileValidatedResidualEvaluator({
    targetSha256,
    programCanonicalJson: program,
  });
}

function job(
  targetBinding: CompleteMappedGeometryTargetBinding,
  patchId: string,
  artifactTriangleCount = 2,
  firstTriangleIndex = 0
): MappedPatchProofJob {
  return {
    partition: partition(patchId, artifactTriangleCount, firstTriangleIndex),
    evaluator: evaluator(targetBinding, patchId),
  };
}

function expectCode(operation: () => unknown, code: CompleteMappedArtifactGeometryError['code']): void {
  try {
    operation();
    throw new Error('Expected operation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(CompleteMappedArtifactGeometryError);
    expect((error as CompleteMappedArtifactGeometryError).code).toBe(code);
  }
}

describe('certifyCompleteMappedArtifactGeometry', () => {
  it('proves all target patches and every parsed artifact triangle exactly once', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const targetBinding = target(['outer-wall']);
    const result = certifyCompleteMappedArtifactGeometry(
      session,
      targetBinding,
      [job(targetBinding, 'outer-wall')],
      { maximumGeometricUpperPm: 10_000_000n }
    );

    expect(result).toEqual(
      expect.objectContaining({
        artifactTriangleCount: 2,
        assignedTriangleCount: 2,
        canonicalInputSha256: sha256Utf8('complete-mapped-artifact-geometry-test input'),
        patchCount: 1,
        geometricTwoSidedUpperPm: '1',
        scanComplete: true,
        targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
        continuousTwoSidedGeometryProven: true,
        implementationScope: 'geometry-only-no-solid-certificate',
      })
    );
    expect(Object.isFrozen(result.patchProofs)).toBe(true);
  });

  it('executes complete patch/triangle coverage over an exact-picometre OBJ session', () => {
    const targetBinding = target(['outer-wall']);
    const result = certifyCompleteMappedArtifactGeometry(
      exactObjSquare(),
      targetBinding,
      [job(targetBinding, 'outer-wall')],
      { maximumGeometricUpperPm: 10_000_000n }
    );
    expect(result.artifactFormat).toBe('obj');
    expect(result.patchProofs[0].artifactCoordinateEncoding).toBe('exact-integer-pm');
    expect(result.continuousTwoSidedGeometryProven).toBe(true);
  });

  it('rejects duplicate artifact-triangle ownership across otherwise complete patches', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const targetBinding = target(['inner-wall', 'outer-wall']);
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [job(targetBinding, 'inner-wall'), job(targetBinding, 'outer-wall')],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'DUPLICATE_ASSIGNMENT'
    );
  });

  it('rejects any parsed triangle omitted from the global patch partition', () => {
    const session = createFinalArtifactProofSession(binaryStl([...square, ...square]));
    const targetBinding = target(['outer-wall']);
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [job(targetBinding, 'outer-wall', 4, 0)],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'UNASSIGNED_TRIANGLE'
    );
  });

  it('rejects target/evaluator mismatch and assignment-memory exhaustion', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const targetBinding = target(['outer-wall']);
    const baseline = job(targetBinding, 'outer-wall');
    const mismatched: MappedPatchProofJob = {
      ...baseline,
      evaluator: evaluator(
        targetBinding,
        'outer-wall',
        sha256Utf8('different target')
      ),
    };
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [mismatched],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'PATCH_SET_INVALID'
    );
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [job(targetBinding, 'outer-wall')],
          { maximumGeometricUpperPm: 10_000_000n, maxAssignmentBytes: 1 }
        ),
      'RESOURCE_LIMIT'
    );
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [job(targetBinding, 'outer-wall')],
          {
            maximumGeometricUpperPm: 10_000_000n,
            maxTotalEvaluatorWorkUnits: 1,
          }
        ),
      'RESOURCE_LIMIT'
    );
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [job(targetBinding, 'outer-wall')],
          {
            maximumGeometricUpperPm: 10_000_000n,
            maxTotalPartitionWorkUnits: 1,
          }
        ),
      'RESOURCE_LIMIT'
    );
  });

  it('rejects cheap job/evaluator mismatches before touching partition mappings', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const onePatchTarget = target(['outer-wall']);
    let trianglesAccessorInvoked = false;
    const accessorPartition = Object.defineProperty(
      { ...partition('outer-wall'), triangles: undefined },
      'triangles',
      {
        enumerable: true,
        get() {
          trianglesAccessorInvoked = true;
          return [];
        },
      }
    ) as unknown as ExactDyadicDomainPartitionInput;
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          onePatchTarget,
          [
            {
              partition: accessorPartition,
              evaluator: evaluator(
                onePatchTarget,
                'outer-wall',
                sha256Utf8('wrong target before partition copy')
              ),
            },
          ],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'PATCH_SET_INVALID'
    );
    expect(trianglesAccessorInvoked).toBe(false);

    const twoPatchTarget = target(['a', 'b']);
    let partitionAccessorInvoked = false;
    const inaccessibleJob = Object.defineProperty(
      { evaluator: evaluator(twoPatchTarget, 'a') },
      'partition',
      {
        enumerable: true,
        get() {
          partitionAccessorInvoked = true;
          return partition('a');
        },
      }
    ) as unknown as MappedPatchProofJob;
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          twoPatchTarget,
          [inaccessibleJob],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'PATCH_SET_INVALID'
    );
    expect(partitionAccessorInvoked).toBe(false);
  });

  it('propagates a patch proof refusal instead of weakening the bound', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const targetBinding = target(['outer-wall'], { 'outer-wall': '0.02' });
    const baseline = job(targetBinding, 'outer-wall');
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [baseline],
          { maximumGeometricUpperPm: 10_000_000n, patchProof: { maxDepth: 1 } }
        ),
      'PATCH_PROOF_REFUSED'
    );
  });

  it('rejects a duplicated half-domain even when every artifact index is assigned', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const targetBinding = target(['outer-wall']);
    const duplicatedHalf: ExactDyadicDomainPartitionInput = {
      ...partition('outer-wall'),
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
            { uNumerator: '1', vNumerator: '0' },
            { uNumerator: '1', vNumerator: '1' },
          ],
        },
      ],
    };
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          [
            {
              partition: duplicatedHalf,
              evaluator: evaluator(targetBinding, 'outer-wall'),
            },
          ],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'PATCH_PROOF_REFUSED'
    );
  });

  it('copies patch ids into an immutable authenticated target binding', () => {
    const ids = ['outer-wall'];
    const binding = target(ids);
    ids[0] = 'mutated-after-mint';
    expect(binding.expectedPatchIds).toEqual(['outer-wall']);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.expectedPatchIds)).toBe(true);

    const lookalike = { ...binding } as unknown as CompleteMappedGeometryTargetBinding;
    const session = createFinalArtifactProofSession(binaryStl(square));
    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          lookalike,
          [job(binding, 'outer-wall')],
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'INVALID_INPUT'
    );
  });

  it('refuses a target definition bound to any other G0 target-solid policy', () => {
    const program = constantResidualProgram('outer-wall');
    expect(() =>
      createCompleteMappedGeometryTargetBinding(
        canonicalizeCertificationJson({
          patches: [
            {
              patchId: 'outer-wall',
              targetPatchPayload: {
                validatedEvaluatorProgramSha256:
                  computeValidatedResidualProgramSha256(program),
              },
            },
          ],
          schemaVersion: COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION,
          targetPayload: {
            canonicalInputSha256: sha256Utf8('wrong-policy-test input'),
            targetSolidSpecificationSha256: sha256Utf8('wrong target-solid policy'),
          },
        })
      )
    ).toThrow(/specification binding is invalid/i);
  });

  it('refuses non-string source and invalid canonical patch identities', () => {
    const coercion = 'a'.repeat(64);
    const coercibleHash = Object.defineProperty({}, Symbol.toPrimitive, {
      value: () => coercion,
    });
    expect(() =>
      createCompleteMappedGeometryTargetBinding(coercibleHash as unknown as string)
    ).toThrow(/refused|canonical json text/i);
    const coerciblePatchId = Object.defineProperty({}, Symbol.toPrimitive, {
      value: () => 'outer-wall',
    });
    expect(() =>
      createCompleteMappedGeometryTargetBinding(
        canonicalizeCertificationJson({
          patches: [
            {
              patchId: coerciblePatchId as unknown as string,
              targetPatchPayload: { fixtureSurface: 'unit-square-plane' },
            },
          ],
          schemaVersion: COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION,
          targetPayload: { fixture: 'invalid-coercion-test' },
        })
      )
    ).toThrow();
  });

  it('cannot pair a real target hash with an incomplete caller-supplied manifest', () => {
    const complete = target(['a', 'b']);
    const incomplete = target(['a']);

    expect(incomplete.targetSha256).not.toBe(complete.targetSha256);
    expect(incomplete.targetPatchManifestSha256).not.toBe(
      complete.targetPatchManifestSha256
    );
    expect(incomplete.expectedPatchIds).toEqual(['a']);
    expect(complete.expectedPatchIds).toEqual(['a', 'b']);
  });

  it('derives expected-patch coverage only from the snapshotted job array', () => {
    const session = createFinalArtifactProofSession(binaryStl(square));
    const targetBinding = target(['a', 'b']);
    let lengthReads = 0;
    const unstableJobs = new Proxy([job(targetBinding, 'a')], {
      get(targetArray, property, receiver) {
        if (property === 'length') {
          lengthReads += 1;
          return lengthReads === 1 ? 2 : 1;
        }
        return Reflect.get(targetArray, property, receiver);
      },
    }) as readonly MappedPatchProofJob[];

    expectCode(
      () =>
        certifyCompleteMappedArtifactGeometry(
          session,
          targetBinding,
          unstableJobs,
          { maximumGeometricUpperPm: 10_000_000n }
        ),
      'INVALID_INPUT'
    );
  });
});
