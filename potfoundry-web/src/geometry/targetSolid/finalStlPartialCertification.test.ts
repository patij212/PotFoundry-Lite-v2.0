import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { exportTo3MF } from '../exporters/export3MF';
import type { MeshData } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import {
  createCompleteMappedGeometryTargetBinding,
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type CompleteMappedGeometryTargetBinding,
  type MappedPatchProofJob,
} from './completeMappedArtifactGeometry';
import type { ExactDyadicDomainPartitionInput } from './exactDyadicDomainPartition';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import { proveFinalMappedArtifactGeometryAndStructure } from './finalMappedArtifactPartialCertification';
import {
  FinalStlPartialCertificationError,
  proveFinalStlMappedGeometryAndStructure,
  type FinalStlPartialCertificationOptions,
} from './finalStlPartialCertification';
import { createObjFinalArtifactProofSession } from './objArtifact';
import { createThreeMfFinalArtifactProofSession } from './threeMfArtifact';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  computeValidatedResidualProgramSha256,
  VALIDATED_RESIDUAL_PROGRAM_VERSION,
} from './validatedResidualProgram';
import {
  completeMappedTargetDefinitionJsonForSurfaceComplex,
  createTargetSurfaceComplexBinding,
  TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  type TargetSurfacePatchRole,
  type TargetSurfacePatchSide,
} from './targetSurfaceComplex';

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
type Triangle3 = readonly [Point3, Point3, Point3];
type Expression = Readonly<Record<string, unknown>>;

const FACE_IDS = ['back', 'bottom', 'front', 'left', 'right', 'top'] as const;
const FACE_PATCH_COUNTS = [5, 1, 5, 5, 5, 1] as const;
const UV_TRIANGLES: readonly [readonly [Point2, Point2, Point2], readonly [Point2, Point2, Point2]] = [
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [1, 1], [0, 1]],
];

interface AbstractFaceFixture {
  readonly patchId: string;
  readonly role: TargetSurfacePatchRole;
  readonly corners: readonly [string, string, string, string];
}

interface SurfaceDefinitionFixture {
  readonly edges: readonly {
    readonly edgeId: string;
    readonly incidents: readonly {
      readonly direction: 'forward' | 'reverse';
      readonly patchId: string;
      readonly side: TargetSurfacePatchSide;
    }[];
    readonly owner: Readonly<{ patchId: string; side: TargetSurfacePatchSide }>;
    readonly semantics: 'smooth-adjacency';
  }[];
  readonly features: readonly [];
  readonly patches: readonly {
    readonly domainKind: 'unit-square';
    readonly patchId: string;
    readonly role: TargetSurfacePatchRole;
    readonly declaredEvaluatorProgramSha256: string;
  }[];
  readonly schemaVersion: typeof TARGET_SURFACE_COMPLEX_DEFINITION_VERSION;
}

interface CubePatchAssignment {
  readonly patchId: string;
  readonly faceId: (typeof FACE_IDS)[number];
  readonly uStart: number;
  readonly uWidth: number;
  readonly vStart: number;
  readonly vWidth: number;
}

const SIDE_CORNERS: Readonly<
  Record<TargetSurfacePatchSide, readonly [number, number]>
> = {
  v0: [0, 1],
  u1: [1, 2],
  v1: [2, 3],
  u0: [3, 0],
};

function ring(prefix: string, index: number): string {
  return `${prefix}${((index % 4) + 4) % 4}`;
}

function abstractNoDrainPotFaces(): readonly AbstractFaceFixture[] {
  const faces: AbstractFaceFixture[] = [];
  for (let index = 0; index < 4; index += 1) {
    const next = index + 1;
    faces.push(
      {
        patchId: `outer-wall/${index}`,
        role: 'outer-wall',
        corners: [ring('ob', index), ring('ob', next), ring('ot', next), ring('ot', index)],
      },
      {
        patchId: `inner-wall/${index}`,
        role: 'inner-wall',
        corners: [ring('ib', next), ring('ib', index), ring('it', index), ring('it', next)],
      },
      {
        patchId: `top-rim/${index}`,
        role: 'top-rim',
        corners: [ring('it', index), ring('ot', index), ring('ot', next), ring('it', next)],
      },
      {
        patchId: `bottom-top/sector-${index}`,
        role: 'bottom-top',
        corners: [ring('ct', index), ring('ib', index), ring('ib', next), ring('ct', next)],
      },
      {
        patchId: `bottom-under/sector-${index}`,
        role: 'bottom-under',
        corners: [ring('cu', index), ring('cu', next), ring('ob', next), ring('ob', index)],
      }
    );
  }
  faces.push(
    {
      patchId: 'bottom-top/center',
      role: 'bottom-top',
      corners: [ring('ct', 0), ring('ct', 1), ring('ct', 2), ring('ct', 3)],
    },
    {
      patchId: 'bottom-under/center',
      role: 'bottom-under',
      corners: [ring('cu', 0), ring('cu', 3), ring('cu', 2), ring('cu', 1)],
    }
  );
  return Object.freeze(faces);
}

function surfaceDefinition(
  faces: readonly AbstractFaceFixture[],
  programSha256ByPatch: ReadonlyMap<string, string>
): SurfaceDefinitionFixture {
  const sidesByPhysicalEdge = new Map<
    string,
    Array<{
      patchId: string;
      side: TargetSurfacePatchSide;
      start: string;
      end: string;
    }>
  >();
  for (const face of faces) {
    for (const [side, [startIndex, endIndex]] of Object.entries(SIDE_CORNERS) as Array<
      [TargetSurfacePatchSide, readonly [number, number]]
    >) {
      const start = face.corners[startIndex];
      const end = face.corners[endIndex];
      const key = [start, end].sort().join('-');
      const bucket = sidesByPhysicalEdge.get(key) ?? [];
      bucket.push({ patchId: face.patchId, side, start, end });
      sidesByPhysicalEdge.set(key, bucket);
    }
  }
  const edges = [...sidesByPhysicalEdge.entries()]
    .map(([physicalEdge, sides]) => {
      if (sides.length !== 2) throw new Error(`fixture edge ${physicalEdge} is not paired`);
      const [globalStart, globalEnd] = physicalEdge.split('-');
      const incidents = sides
        .map(({ patchId, side, start, end }) => ({
          direction:
            start === globalStart && end === globalEnd
              ? ('forward' as const)
              : ('reverse' as const),
          patchId,
          side,
        }))
        .sort((left, right) => {
          const leftKey = `${left.patchId}\0${left.side}`;
          const rightKey = `${right.patchId}\0${right.side}`;
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
      if (incidents[0].direction === incidents[1].direction) {
        throw new Error(`fixture edge ${physicalEdge} orientation is inconsistent`);
      }
      return Object.freeze({
        edgeId: `edge/${physicalEdge}`,
        incidents: Object.freeze(incidents),
        owner: Object.freeze({ patchId: incidents[0].patchId, side: incidents[0].side }),
        semantics: 'smooth-adjacency' as const,
      });
    })
    .sort((left, right) =>
      left.edgeId < right.edgeId ? -1 : left.edgeId > right.edgeId ? 1 : 0
    );
  const patches = faces
    .map(({ patchId, role }) => {
      const programSha256 = programSha256ByPatch.get(patchId);
      if (programSha256 === undefined) throw new Error(`missing program for ${patchId}`);
      return Object.freeze({
        domainKind: 'unit-square' as const,
        patchId,
        role,
        declaredEvaluatorProgramSha256: programSha256,
      });
    })
    .sort((left, right) =>
      left.patchId < right.patchId ? -1 : left.patchId > right.patchId ? 1 : 0
    );
  return Object.freeze({
    edges: Object.freeze(edges),
    features: Object.freeze([]) as readonly [],
    patches: Object.freeze(patches),
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  });
}

const constant = (value: string): Expression => ({ op: 'constant', value });
const u: Expression = { op: 'u' };
const v: Expression = { op: 'v' };
const height = (value: Expression): Expression => ({
  op: 'multiply',
  left: constant('40'),
  right: value,
});

function targetExpressions(
  faceId: (typeof FACE_IDS)[number],
  mappedU: Expression,
  mappedV: Expression
): readonly [Expression, Expression, Expression] {
  const oneMinusMappedV: Expression = {
    op: 'subtract',
    left: constant('1'),
    right: mappedV,
  };
  switch (faceId) {
    case 'back': return [mappedU, constant('1'), height(oneMinusMappedV)];
    case 'bottom': return [mappedV, mappedU, constant('0')];
    case 'front': return [mappedU, constant('0'), height(mappedV)];
    case 'left': return [constant('0'), mappedV, height(mappedU)];
    case 'right': return [constant('1'), mappedU, height(mappedV)];
    case 'top': return [mappedU, mappedV, constant('40')];
  }
}

function facePoint(faceId: (typeof FACE_IDS)[number], point: Point2): Point3 {
  const [uu, vv] = point;
  switch (faceId) {
    case 'back': return [uu, 1, 40 * (1 - vv)];
    case 'bottom': return [vv, uu, 0];
    case 'front': return [uu, 0, 40 * vv];
    case 'left': return [0, vv, 40 * uu];
    case 'right': return [1, uu, 40 * vv];
    case 'top': return [uu, vv, 40];
  }
}

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

function cubePatchAssignments(): readonly CubePatchAssignment[] {
  const patchIds = abstractNoDrainPotFaces()
    .map((face) => face.patchId)
    .sort();
  const geometricSlots = FACE_IDS.flatMap((faceId, faceIndex) => {
    const count = FACE_PATCH_COUNTS[faceIndex];
    const splitV = faceId === 'back' || faceId === 'front' || faceId === 'right';
    return Array.from({ length: count }, (_, stripIndex) =>
      splitV
        ? {
            faceId,
            uStart: 0,
            uWidth: 1,
            vStart: stripIndex / count,
            vWidth: 1 / count,
          }
        : {
            faceId,
            uStart: stripIndex / count,
            uWidth: 1 / count,
            vStart: 0,
            vWidth: 1,
          }
    );
  });
  if (patchIds.length !== geometricSlots.length) throw new Error('cube fixture slot mismatch');
  return Object.freeze(
    patchIds.map((patchId, index) => Object.freeze({ patchId, ...geometricSlots[index] }))
  );
}

function cubeTriangles(): Triangle3[] {
  return cubePatchAssignments().flatMap((assignment) =>
    UV_TRIANGLES.map((triangle) =>
      triangle.map(([localU, localV]) =>
        facePoint(assignment.faceId, [
          assignment.uStart + assignment.uWidth * localU,
          assignment.vStart + assignment.vWidth * localV,
        ])
      ) as unknown as Triangle3
    )
  );
}

function cubeMesh(): MeshData {
  const triangles = cubeTriangles();
  return {
    vertices: Float32Array.from(triangles.flatMap((triangle) => triangle.flatMap((point) => point))),
    indices: Uint32Array.from({ length: triangles.length * 3 }, (_, index) => index),
    vertexCount: triangles.length * 3,
    triangleCount: triangles.length,
  };
}

function objCubeSession() {
  const triangles = cubeTriangles();
  const vertices = triangles.flatMap((triangle) =>
    triangle.map((point) => `v ${point.map((coordinate) => coordinate.toFixed(9)).join(' ')}`)
  );
  const faces = triangles.map((_, triangleIndex) => {
    const first = triangleIndex * 3 + 1;
    return `f ${first} ${first + 1} ${first + 2}`;
  });
  return createObjFinalArtifactProofSession(
    new TextEncoder().encode(['o Proof', ...vertices, ...faces].join('\n'))
  );
}

async function threeMfCubeSession() {
  const blob = await exportTo3MF(cubeMesh(), { name: 'Proof', unit: 'millimeter' });
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return createThreeMfFinalArtifactProofSession(bytes);
}

function program(assignment: CubePatchAssignment): string {
  const remap = (source: Expression, start: number, width: number): Expression => ({
    op: 'add',
    left: constant(start.toString()),
    right: {
      op: 'multiply',
      left: constant(width.toString()),
      right: source,
    },
  });
  const mappedU = remap(u, assignment.uStart, assignment.uWidth);
  const mappedV = remap(v, assignment.vStart, assignment.vWidth);
  const [x, y, z] = targetExpressions(assignment.faceId, mappedU, mappedV);
  return canonicalizeCertificationJson({
    evaluatorId: `cube:${assignment.patchId}`,
    evaluatorVersion: 'v1',
    patchId: assignment.patchId,
    schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
    target: { x, y, z },
  });
}

function partition(
  assignment: CubePatchAssignment,
  patchIndex: number,
  artifactTriangleCount: number
): ExactDyadicDomainPartitionInput {
  return {
    patchId: assignment.patchId,
    fractionBits: 0,
    domain: {
      minUNumerator: '0',
      maxUNumerator: '1',
      minVNumerator: '0',
      maxVNumerator: '1',
    },
    artifactTriangleCount,
    triangles: UV_TRIANGLES.map((triangle, localIndex) => ({
      artifactTriangleIndex: patchIndex * 2 + localIndex,
      vertices: triangle.map(([uNumerator, vNumerator]) => ({
        uNumerator: uNumerator.toString(),
        vNumerator: vNumerator.toString(),
      })) as unknown as ExactDyadicDomainPartitionInput['triangles'][number]['vertices'],
    })),
  };
}

function cubeTarget(
  canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>
): {
  binding: CompleteMappedGeometryTargetBinding;
  jobs: readonly MappedPatchProofJob[];
  surfaceComplex: ReturnType<typeof createTargetSurfaceComplexBinding>;
} {
  const assignments = cubePatchAssignments();
  const programs = new Map(
    assignments.map((assignment) => [assignment.patchId, program(assignment)])
  );
  const programSha256ByPatch = new Map(
    assignments.map((assignment) => [
      assignment.patchId,
      computeValidatedResidualProgramSha256(programs.get(assignment.patchId)),
    ])
  );
  const surfaceComplex = createTargetSurfaceComplexBinding(
    canonicalInput,
    canonicalizeCertificationJson(
      surfaceDefinition(abstractNoDrainPotFaces(), programSha256ByPatch)
    )
  );
  const binding = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(surfaceComplex);
  const artifactTriangleCount = cubeTriangles().length;
  const jobs = assignments.map((assignment, patchIndex) => ({
    partition: partition(assignment, patchIndex, artifactTriangleCount),
    evaluator: compileValidatedResidualEvaluator({
      targetSha256: binding.targetSha256,
      programCanonicalJson: programs.get(assignment.patchId),
    }),
  }));
  return { binding, jobs, surfaceComplex };
}

function fixture() {
  const canonicalInput = createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, H: 40, r_drain: 0 },
    'WaveInterference',
    {},
    { superformulaSeamBlendDegrees: 30 }
  );
  const target = cubeTarget(canonicalInput);
  return {
    canonicalInput,
    session: createFinalArtifactProofSession(binaryStl(cubeTriangles())),
    ...target,
  };
}

describe('final STL partial certification composition', () => {
  it('rejects a raw target definition even when its bytes reproduce the real manifest', () => {
    const { canonicalInput, session, jobs, surfaceComplex } = fixture();
    const rawBinding = createCompleteMappedGeometryTargetBinding(
      completeMappedTargetDefinitionJsonForSurfaceComplex(surfaceComplex)
    );
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(
        session,
        canonicalInput,
        rawBinding,
        jobs,
        { requestedTolerancePm: 10_000_000n, reservedNonGeometricMarginPm: 1_000n }
      )
    ).toThrow(/surface-complex provenance/i);
  });

  it('uses the common multi-format partial-proof coordinator without minting certification', () => {
    const { canonicalInput, session, binding, jobs } = fixture();
    const result = proveFinalMappedArtifactGeometryAndStructure(
      session,
      canonicalInput,
      binding,
      jobs,
      { requestedTolerancePm: 10_000_000n, reservedNonGeometricMarginPm: 1_000n }
    );
    expect(result.artifactFormat).toBe('stl');
    expect(result.certified).toBe(false);
    expect(result.structural.structurallyValid).toBe(true);
    expect(result.geometry.continuousTwoSidedGeometryProven).toBe(true);
    expect(result.height.heightDimensionProven).toBe(true);
    expect(result.missingClaims).toContain('physical-thickness');
  });

  it('composes the same partial proof over exact-picometre OBJ and 3MF bytes', { timeout: 30_000 }, async () => {
    const { canonicalInput, binding, jobs } = fixture();
    const sessions = [objCubeSession(), await threeMfCubeSession()];
    const results = sessions.map((session) =>
      proveFinalMappedArtifactGeometryAndStructure(
        session,
        canonicalInput,
        binding,
        jobs,
        { requestedTolerancePm: 10_000_000n, reservedNonGeometricMarginPm: 1_000n }
      )
    );
    expect(results.map((result) => result.artifactFormat)).toEqual(['obj', '3mf']);
    expect(results.every((result) => result.structural.structurallyValid)).toBe(true);
    expect(results.every((result) => result.geometry.continuousTwoSidedGeometryProven)).toBe(true);
    expect(results.every((result) => result.height.maximumErrorUpperPm === '0')).toBe(true);
    expect(results.every((result) => result.certified === false)).toBe(true);
  });

  it('composes final-byte structure and continuous mapped geometry but never claims full certification', () => {
    const { canonicalInput, session, binding, jobs } = fixture();
    const result = proveFinalStlMappedGeometryAndStructure(
      session,
      canonicalInput,
      binding,
      jobs,
      { requestedTolerancePm: 10_000_000n, reservedNonGeometricMarginPm: 1_000n }
    );

    expect(result.certified).toBe(false);
    expect(result.structural.structurallyValid).toBe(true);
    expect(result.geometry.continuousTwoSidedGeometryProven).toBe(true);
    expect(result.height.heightDimensionProven).toBe(true);
    expect(result.height.maximumErrorUpperPm).toBe('0');
    expect(result.geometryPlusReservedUpperPm).toBe('1001');
    expect(result.missingClaims).toContain('physical-thickness');
    expect(result.missingClaims).toContain('radial-drain-rim-and-feature-dimensions');
    expect(result.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives and enforces a literal geometric margin below 0.01 mm', () => {
    const { canonicalInput, session, binding, jobs } = fixture();
    const result = proveFinalStlMappedGeometryAndStructure(
      session,
      canonicalInput,
      binding,
      jobs,
      { requestedTolerancePm: 10_000_000n, reservedNonGeometricMarginPm: 2_500_000n }
    );
    expect(result.geometricBudgetPm).toBe('7500000');
  });

  it('refuses a mapped target spliced to a different canonical input', () => {
    const { session, binding, jobs } = fixture();
    const otherInput = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY, r_drain: 0, bellAmp: 0.1 },
      'WaveInterference',
      {},
      { superformulaSeamBlendDegrees: 30 }
    );
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(session, otherInput, binding, jobs, {
        requestedTolerancePm: 10_000_000n,
        reservedNonGeometricMarginPm: 1_000n,
      })
    ).toThrow(/does not match the canonical input/i);
  });

  it('refuses impossible budgets and accessor options without invoking them', () => {
    const { canonicalInput, session, binding, jobs } = fixture();
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(session, canonicalInput, binding, jobs, {
        requestedTolerancePm: 10_000_001n,
        reservedNonGeometricMarginPm: 0n,
      })
    ).toThrow(FinalStlPartialCertificationError);

    let invoked = false;
    const options = { reservedNonGeometricMarginPm: 0n } as Record<string, unknown>;
    Object.defineProperty(options, 'requestedTolerancePm', {
      enumerable: true,
      get() {
        invoked = true;
        return 10_000_000n;
      },
    });
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(
        session,
        canonicalInput,
        binding,
        jobs,
        options as unknown as FinalStlPartialCertificationOptions
      )
    ).toThrow(/data properties/i);
    expect(invoked).toBe(false);

    let nestedInvoked = false;
    const structural = Object.defineProperty({}, 'stl', {
      enumerable: true,
      get() {
        nestedInvoked = true;
        return {};
      },
    });
    expect(() =>
      proveFinalMappedArtifactGeometryAndStructure(
        session,
        canonicalInput,
        binding,
        jobs,
        {
          requestedTolerancePm: 10_000_000n,
          reservedNonGeometricMarginPm: 0n,
          structural,
        }
      )
    ).toThrow(/data properties/i);
    expect(nestedInvoked).toBe(false);
  });

  it('rejects an open final artifact before attempting a geometry claim', () => {
    const { canonicalInput, binding, jobs } = fixture();
    const openSession = createFinalArtifactProofSession(binaryStl(cubeTriangles().slice(0, 10)));
    expect(() =>
      proveFinalStlMappedGeometryAndStructure(openSession, canonicalInput, binding, jobs, {
        requestedTolerancePm: 10_000_000n,
        reservedNonGeometricMarginPm: 0n,
      })
    ).toThrow(/topology\/embeddedness/i);
  });
});
