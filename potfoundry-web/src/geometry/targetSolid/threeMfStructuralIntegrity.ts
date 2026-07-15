import {
  assessExactPicometreArtifactSelfIntersections,
  type ExactPicometreArtifactSelfIntersectionResult,
  type ExactPicometreSelfIntersectionOptions,
} from './exactPicometreArtifactSelfIntersection';
import {
  assessExactPicometreArtifactTopology,
  type ExactPicometreArtifactTopology,
  type ExactPicometreTopologyOptions,
} from './exactPicometreArtifactTopology';
import { sha256Utf8 } from './incrementalSha256';
import {
  parseThreeMfArtifact,
  type ParseThreeMfArtifactOptions,
} from './threeMfArtifact';

export const THREE_MF_STRUCTURAL_INTEGRITY_VERSION =
  'potfoundry.final-3mf-structural-integrity/v1' as const;
export const THREE_MF_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS =
  'structural-only-no-thickness-feature-target-distance-or-tolerance-proof' as const;

export interface ExpectedThreeMfTopology {
  readonly componentCount: 1;
  readonly genus: 0 | 1;
}

export interface ThreeMfStructuralIntegrityOptions {
  readonly parser?: ParseThreeMfArtifactOptions;
  readonly topology?: ExactPicometreTopologyOptions;
  readonly selfIntersection?: ExactPicometreSelfIntersectionOptions;
}

export interface ThreeMfStructuralChecks {
  readonly proofBindingsMatch: boolean;
  readonly closed: boolean;
  readonly manifold: boolean;
  readonly consistentlyOriented: boolean;
  readonly outwardFacing: boolean;
  readonly componentCountMatches: boolean;
  readonly genusMatches: boolean;
  readonly noDegenerateTriangles: boolean;
  readonly selfIntersectionScanComplete: boolean;
  readonly noSelfIntersections: boolean;
}

export interface ThreeMfStructuralIntegrity {
  readonly version: typeof THREE_MF_STRUCTURAL_INTEGRITY_VERSION;
  readonly implementationStatus: typeof THREE_MF_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS;
  readonly evidenceSha256: string;
  readonly artifact: Readonly<{
    byteLength: number;
    byteSha256: string;
    modelXmlByteSha256: string;
    parsedArtifactSha256: string;
    parsedTriangleSetSha256: string;
    parserVersion: string;
    parserProofSha256: string;
    modelUnit: 'millimeter' | 'centimeter' | 'inch';
    triangleCount: number;
    vertexCount: number;
  }>;
  readonly expectedTopology: Readonly<ExpectedThreeMfTopology>;
  readonly topology: ExactPicometreArtifactTopology;
  readonly selfIntersection: ExactPicometreArtifactSelfIntersectionResult;
  readonly checks: ThreeMfStructuralChecks;
  readonly structurallyValid: boolean;
}

const OUTER_OPTION_NAMES = new Set(['parser', 'topology', 'selfIntersection']);
const PARSER_OPTION_NAMES = new Set([
  'maxArchiveBytes',
  'maxCentralDirectoryEntries',
  'maxTotalDeclaredUncompressedBytes',
  'maxModelXmlBytes',
  'maxVertices',
  'maxTriangles',
  'maxParsedGeometryBytes',
  'maxAbsoluteCoordinatePm',
  'cancellationFlag',
  'progressCounter',
]);
const TOPOLOGY_OPTION_NAMES = new Set([
  'maxUniqueVertices',
  'maxEdgeRecordBytes',
  'maxTriangleVertexBytes',
  'maxLinkUnionBytes',
  'cancellationFlag',
  'progressCounter',
]);
const SELF_INTERSECTION_OPTION_NAMES = new Set([
  'maxBvhBytes',
  'maxBuildWork',
  'maxTraversalVisits',
  'maxBroadPhasePairChecks',
  'maxCandidatePairs',
  'maxFoundPairs',
  'leafSize',
  'cancellationFlag',
  'progressCounter',
]);

function snapshotDataRecord<T extends object>(
  value: T,
  allowedNames: ReadonlySet<string>,
  label: string
): Readonly<T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain own-data-property record`);
  }
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    throw new TypeError(`${label} could not be inspected safely`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have Object or null prototype`);
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowedNames.has(key)) {
      throw new TypeError(`${label} contains unknown property '${String(key)}'`);
    }
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) {
      throw new TypeError(`${label} property '${key}' must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as Readonly<T>;
}

function snapshotOptions(
  options: ThreeMfStructuralIntegrityOptions
): Readonly<ThreeMfStructuralIntegrityOptions> {
  const outer = snapshotDataRecord(options, OUTER_OPTION_NAMES, '3MF structural options');
  return Object.freeze({
    parser:
      outer.parser === undefined
        ? undefined
        : snapshotDataRecord(outer.parser, PARSER_OPTION_NAMES, '3MF parser options'),
    topology:
      outer.topology === undefined
        ? undefined
        : snapshotDataRecord(outer.topology, TOPOLOGY_OPTION_NAMES, '3MF topology options'),
    selfIntersection:
      outer.selfIntersection === undefined
        ? undefined
        : snapshotDataRecord(
            outer.selfIntersection,
            SELF_INTERSECTION_OPTION_NAMES,
            '3MF self-intersection options'
          ),
  });
}

function snapshotExpectedTopology(
  expected: ExpectedThreeMfTopology
): Readonly<ExpectedThreeMfTopology> {
  const snapshot = snapshotDataRecord(
    expected,
    new Set(['componentCount', 'genus']),
    'expected 3MF topology'
  );
  if (snapshot.componentCount !== 1 || (snapshot.genus !== 0 && snapshot.genus !== 1)) {
    throw new TypeError('expected 3MF topology must declare componentCount 1 and genus 0 or 1');
  }
  return Object.freeze({ componentCount: 1, genus: snapshot.genus });
}

/**
 * Parse exact final 3MF bytes and bind combinatorial topology plus embeddedness.
 * This verdict intentionally does not imply the 0.01 mm target contract.
 */
export async function assessThreeMfStructuralIntegrity(
  source: ArrayBuffer | Uint8Array,
  expectedTopology: ExpectedThreeMfTopology,
  options: ThreeMfStructuralIntegrityOptions = {}
): Promise<ThreeMfStructuralIntegrity> {
  const optionSnapshot = snapshotOptions(options);
  const frozenExpected = snapshotExpectedTopology(expectedTopology);
  const parsed = await parseThreeMfArtifact(source, optionSnapshot.parser);
  const topology = assessExactPicometreArtifactTopology(parsed, optionSnapshot.topology);
  const selfIntersection = assessExactPicometreArtifactSelfIntersections(
    parsed,
    optionSnapshot.selfIntersection
  );
  const proofBindingsMatch =
    topology.artifactByteSha256 === parsed.byteSha256 &&
    topology.parsedArtifactSha256 === parsed.parsedArtifactSha256 &&
    topology.parsedTriangleSetSha256 === parsed.parsedTriangleSetSha256 &&
    selfIntersection.artifactByteSha256 === parsed.byteSha256 &&
    selfIntersection.parsedArtifactSha256 === parsed.parsedArtifactSha256 &&
    selfIntersection.parsedTriangleSetSha256 === parsed.parsedTriangleSetSha256;
  const checks = Object.freeze({
    proofBindingsMatch,
    closed: topology.closed,
    manifold: topology.manifold,
    consistentlyOriented: topology.consistentlyOriented,
    outwardFacing: topology.outwardFacing,
    componentCountMatches: topology.componentCount === frozenExpected.componentCount,
    genusMatches: topology.genus === frozenExpected.genus,
    noDegenerateTriangles: topology.degenerateTriangleCount === 0,
    selfIntersectionScanComplete: selfIntersection.scanComplete,
    noSelfIntersections: selfIntersection.selfIntersectionFree,
  });
  const structurallyValid = Object.values(checks).every((value) => value === true);
  const artifact = Object.freeze({
    byteLength: parsed.byteLength,
    byteSha256: parsed.byteSha256,
    modelXmlByteSha256: parsed.modelXmlByteSha256,
    parsedArtifactSha256: parsed.parsedArtifactSha256,
    parsedTriangleSetSha256: parsed.parsedTriangleSetSha256,
    parserVersion: parsed.parserVersion,
    parserProofSha256: parsed.parserProofSha256,
    modelUnit: parsed.modelUnit,
    triangleCount: parsed.triangleCount,
    vertexCount: parsed.vertexCount,
  });
  const evidenceSha256 = sha256Utf8(
    JSON.stringify([
      THREE_MF_STRUCTURAL_INTEGRITY_VERSION,
      THREE_MF_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS,
      artifact,
      frozenExpected,
      topology.evidenceSha256,
      selfIntersection.evidenceSha256,
      checks,
      structurallyValid,
    ])
  );
  return Object.freeze({
    version: THREE_MF_STRUCTURAL_INTEGRITY_VERSION,
    implementationStatus: THREE_MF_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS,
    evidenceSha256,
    artifact,
    expectedTopology: frozenExpected,
    topology,
    selfIntersection,
    checks,
    structurallyValid,
  });
}
