import { domainSeparatedCanonicalJsonSha256 } from './canonicalCertificationJson';
import {
  assessExactPicometreArtifactSelfIntersections,
  DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
  DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
  DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
  DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
  DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
  type ExactPicometreArtifactSelfIntersectionResult,
  type ExactPicometreSelfIntersectionOptions,
} from './exactPicometreArtifactSelfIntersection';
import {
  assessExactPicometreArtifactTopology,
  DEFAULT_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
  DEFAULT_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
  DEFAULT_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
  DEFAULT_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
  DEFAULT_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
  HARD_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
  HARD_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
  HARD_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
  HARD_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
  HARD_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
  type ExactPicometreArtifactTopology,
  type ExactPicometreTopologyOptions,
} from './exactPicometreArtifactTopology';
import { sha256Utf8 } from './incrementalSha256';
import {
  parsedMappedArtifactForProofSession,
  type MappedArtifactProofSession,
} from './mappedArtifactProofSession';
import {
  assessParsedArtifactSelfIntersections,
  DEFAULT_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
  DEFAULT_SELF_INTERSECTION_MAX_BUILD_WORK,
  DEFAULT_SELF_INTERSECTION_MAX_BVH_BYTES,
  DEFAULT_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
  DEFAULT_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
  HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
  HARD_SELF_INTERSECTION_MAX_BUILD_WORK,
  HARD_SELF_INTERSECTION_MAX_BVH_BYTES,
  HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
  HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
  type ParsedArtifactSelfIntersectionResult,
  type ParsedSelfIntersectionOptions,
} from './parsedArtifactSelfIntersection';
import {
  assessParsedArtifactTopology,
  DEFAULT_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
  DEFAULT_TOPOLOGY_MAX_LINK_UNION_BYTES,
  DEFAULT_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
  DEFAULT_TOPOLOGY_MAX_UNIQUE_VERTICES,
  DEFAULT_TOPOLOGY_MAX_WORK_UNITS,
  HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
  HARD_TOPOLOGY_MAX_LINK_UNION_BYTES,
  HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
  HARD_TOPOLOGY_MAX_UNIQUE_VERTICES,
  HARD_TOPOLOGY_MAX_WORK_UNITS,
  type ParsedArtifactTopology,
  type ParsedTopologyOptions,
} from './parsedArtifactTopology';

export const MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION =
  'potfoundry.mapped-proof-session-structural-integrity/v2' as const;
export const MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_PROOF_SHA256 = sha256Utf8(
  [
    MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION,
    'input is an unforgeable final-byte binary-STL, 3MF, or OBJ parser session',
    'binary STL uses exact IEEE-754 binary32 topology and robust intersection predicates',
    '3MF and OBJ use exact signed-integer-picometre topology and robust intersection predicates',
    'success requires expected component/genus, closed manifold, consistent orientation, positive volume, no degenerates, and a complete self-intersection-free scan',
    'format-specific resource options are snapshotted own data properties and never weaken a verdict',
    'one aggregate byte ceiling accounts typed buffers plus conservative vertex-interner growth; one aggregate work ceiling is split before execution',
    'one non-raiseable absolute elapsed-time deadline is shared by topology and self-intersection proofs',
    'scope excludes target distance, feature correspondence, dimensional validity, and thickness',
  ].join('\n')
);

export interface MappedProofSessionExpectedTopology {
  readonly componentCount: 1;
  readonly genus: 0 | 1;
}

export interface MappedProofSessionStructuralOptions {
  readonly cancellationFlag?: Int32Array;
  readonly maxTotalBytes?: number;
  readonly maxTotalWorkUnits?: number;
  readonly maxElapsedMilliseconds?: number;
  readonly stl?: Readonly<{
    topology?: ParsedTopologyOptions;
    selfIntersection?: ParsedSelfIntersectionOptions;
  }>;
  readonly exactPicometre?: Readonly<{
    topology?: ExactPicometreTopologyOptions;
    selfIntersection?: ExactPicometreSelfIntersectionOptions;
  }>;
}

export interface MappedProofSessionStructuralChecks {
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

export interface MappedProofSessionStructuralIntegrityResult {
  readonly proofVersion: typeof MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly artifactFormat: 'stl' | '3mf' | 'obj';
  readonly artifactByteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly triangleCount: number;
  readonly expectedTopology: Readonly<MappedProofSessionExpectedTopology>;
  readonly topology: ParsedArtifactTopology | ExactPicometreArtifactTopology;
  readonly selfIntersection:
    | ParsedArtifactSelfIntersectionResult
    | ExactPicometreArtifactSelfIntersectionResult;
  readonly checks: Readonly<MappedProofSessionStructuralChecks>;
  readonly scanComplete: boolean;
  readonly structurallyValid: boolean;
  readonly configuredByteCeiling: number;
  readonly structuralWorkUnitCount: number;
  readonly maxElapsedMilliseconds: number;
  readonly implementationScope: 'structural-only-no-distance-feature-or-thickness-proof';
}

const TOP_LEVEL_KEYS = new Set([
  'cancellationFlag',
  'exactPicometre',
  'maxElapsedMilliseconds',
  'maxTotalBytes',
  'maxTotalWorkUnits',
  'stl',
]);
const GROUP_KEYS = new Set(['topology', 'selfIntersection']);
const STL_TOPOLOGY_KEYS = new Set([
  'maxUniqueVertices',
  'maxEdgeRecordBytes',
  'maxTriangleVertexBytes',
  'maxLinkUnionBytes',
  'maxWorkUnits',
  'deadlineEpochMilliseconds',
  'progressCounter',
]);
const STL_INTERSECTION_KEYS = new Set([
  'maxBvhBytes',
  'maxBuildWork',
  'maxTraversalVisits',
  'maxBroadPhasePairChecks',
  'maxCandidatePairs',
  'maxFoundPairs',
  'leafSize',
  'deadlineEpochMilliseconds',
  'progressCounter',
]);
const EXACT_TOPOLOGY_KEYS = STL_TOPOLOGY_KEYS;
const EXACT_INTERSECTION_KEYS = new Set([
  ...STL_INTERSECTION_KEYS,
  'maxBuildWork',
]);

function snapshotRecord<T extends object>(
  value: T,
  allowedKeys: ReadonlySet<string>,
  label: string
): Readonly<T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain own-data-property record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have Object or null prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) {
      throw new TypeError(`${label} contains unknown property '${String(key)}'`);
    }
    const descriptor = descriptors[key];
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as Readonly<T>;
}

function snapshotOptions(
  value: MappedProofSessionStructuralOptions
): Readonly<MappedProofSessionStructuralOptions> {
  const top = snapshotRecord(value, TOP_LEVEL_KEYS, 'mapped structural options');
  const snapshotGroup = <T extends object>(
    group: T | undefined,
    topologyKeys: ReadonlySet<string>,
    intersectionKeys: ReadonlySet<string>,
    label: string
  ): Readonly<T> | undefined => {
    if (group === undefined) return undefined;
    const outer = snapshotRecord(group, GROUP_KEYS, label) as Readonly<{
      topology?: object;
      selfIntersection?: object;
    }>;
    return Object.freeze({
      topology:
        outer.topology === undefined
          ? undefined
          : snapshotRecord(outer.topology, topologyKeys, `${label}.topology`),
      selfIntersection:
        outer.selfIntersection === undefined
          ? undefined
          : snapshotRecord(
              outer.selfIntersection,
              intersectionKeys,
              `${label}.selfIntersection`
            ),
    }) as Readonly<T>;
  };
  return Object.freeze({
    cancellationFlag: top.cancellationFlag,
    maxTotalBytes: top.maxTotalBytes,
    maxTotalWorkUnits: top.maxTotalWorkUnits,
    maxElapsedMilliseconds: top.maxElapsedMilliseconds,
    stl: snapshotGroup(top.stl, STL_TOPOLOGY_KEYS, STL_INTERSECTION_KEYS, 'stl options'),
    exactPicometre: snapshotGroup(
      top.exactPicometre,
      EXACT_TOPOLOGY_KEYS,
      EXACT_INTERSECTION_KEYS,
      'exact picometre options'
    ),
  });
}

const DEFAULT_STRUCTURAL_MAX_TOTAL_BYTES = 768 * 1024 * 1024;
const HARD_STRUCTURAL_MAX_TOTAL_BYTES = 768 * 1024 * 1024;
const DEFAULT_STRUCTURAL_MAX_TOTAL_WORK_UNITS = 300_000_000;
const HARD_STRUCTURAL_MAX_TOTAL_WORK_UNITS = 400_000_000;
const DEFAULT_STRUCTURAL_MAX_ELAPSED_MILLISECONDS = 15_000;
const HARD_STRUCTURAL_MAX_ELAPSED_MILLISECONDS = 240_000;
// Covers old+new hash tables during growth, union arrays, and alignment overhead.
const CONSERVATIVE_VERTEX_INTERNER_BYTES_PER_VERTEX = 160;

function boundedPositive(
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  if (resolved > hardMaximum) {
    throw new RangeError(`${label} exceeds hard limit ${hardMaximum}`);
  }
  return resolved;
}

/** Execute format-appropriate exact structure proofs over one authenticated session. */
export function assessMappedProofSessionStructuralIntegrity(
  session: MappedArtifactProofSession,
  expectedTopology: MappedProofSessionExpectedTopology,
  options: MappedProofSessionStructuralOptions = {}
): MappedProofSessionStructuralIntegrityResult {
  const expected = Object.freeze({
    componentCount: expectedTopology?.componentCount,
    genus: expectedTopology?.genus,
  });
  if (
    typeof expectedTopology !== 'object' ||
    expectedTopology === null ||
    expected.componentCount !== 1 ||
    (expected.genus !== 0 && expected.genus !== 1)
  ) {
    throw new TypeError('expectedTopology must declare componentCount 1 and genus 0 or 1');
  }
  const optionSnapshot = snapshotOptions(options);
  const artifact = parsedMappedArtifactForProofSession(session);
  if (artifact.format === 'stl' && optionSnapshot.exactPicometre !== undefined) {
    throw new TypeError('exactPicometre options do not apply to binary STL');
  }
  if (artifact.format !== 'stl' && optionSnapshot.stl !== undefined) {
    throw new TypeError('stl options do not apply to exact-picometre artifacts');
  }

  const maxTotalBytes = boundedPositive(
    optionSnapshot.maxTotalBytes,
    DEFAULT_STRUCTURAL_MAX_TOTAL_BYTES,
    HARD_STRUCTURAL_MAX_TOTAL_BYTES,
    'maxTotalBytes'
  );
  const maxTotalWorkUnits = boundedPositive(
    optionSnapshot.maxTotalWorkUnits,
    DEFAULT_STRUCTURAL_MAX_TOTAL_WORK_UNITS,
    HARD_STRUCTURAL_MAX_TOTAL_WORK_UNITS,
    'maxTotalWorkUnits'
  );
  const maxElapsedMilliseconds = boundedPositive(
    optionSnapshot.maxElapsedMilliseconds,
    DEFAULT_STRUCTURAL_MAX_ELAPSED_MILLISECONDS,
    HARD_STRUCTURAL_MAX_ELAPSED_MILLISECONDS,
    'maxElapsedMilliseconds'
  );
  const deadlineEpochMilliseconds = Date.now() + maxElapsedMilliseconds;
  const perCounterWorkShare = Math.floor(maxTotalWorkUnits / 5);

  let configuredByteCeiling: number;
  let topology: ParsedArtifactTopology | ExactPicometreArtifactTopology;
  let selfIntersection:
    | ParsedArtifactSelfIntersectionResult
    | ExactPicometreArtifactSelfIntersectionResult;
  if (artifact.format === 'stl') {
    const requestedTopology = optionSnapshot.stl?.topology;
    const maxUniqueVertices = boundedPositive(
      requestedTopology?.maxUniqueVertices,
      DEFAULT_TOPOLOGY_MAX_UNIQUE_VERTICES,
      HARD_TOPOLOGY_MAX_UNIQUE_VERTICES,
      'stl.topology.maxUniqueVertices'
    );
    const maxEdgeRecordBytes = boundedPositive(
      requestedTopology?.maxEdgeRecordBytes,
      DEFAULT_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
      HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
      'stl.topology.maxEdgeRecordBytes'
    );
    const maxTriangleVertexBytes = boundedPositive(
      requestedTopology?.maxTriangleVertexBytes,
      DEFAULT_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
      HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
      'stl.topology.maxTriangleVertexBytes'
    );
    const maxLinkUnionBytes = boundedPositive(
      requestedTopology?.maxLinkUnionBytes,
      DEFAULT_TOPOLOGY_MAX_LINK_UNION_BYTES,
      HARD_TOPOLOGY_MAX_LINK_UNION_BYTES,
      'stl.topology.maxLinkUnionBytes'
    );
    const requestedSelfIntersection = optionSnapshot.stl?.selfIntersection;
    const maxBvhBytes = boundedPositive(
      requestedSelfIntersection?.maxBvhBytes,
      DEFAULT_SELF_INTERSECTION_MAX_BVH_BYTES,
      HARD_SELF_INTERSECTION_MAX_BVH_BYTES,
      'stl.selfIntersection.maxBvhBytes'
    );
    configuredByteCeiling =
      maxUniqueVertices * CONSERVATIVE_VERTEX_INTERNER_BYTES_PER_VERTEX +
      maxEdgeRecordBytes +
      maxTriangleVertexBytes +
      maxLinkUnionBytes +
      maxBvhBytes;
    if (configuredByteCeiling > maxTotalBytes) {
      throw new RangeError(
        `Configured STL structural byte ceilings total ${configuredByteCeiling}; aggregate limit is ${maxTotalBytes}`
      );
    }
    const topologyWork = boundedPositive(
      requestedTopology?.maxWorkUnits,
      DEFAULT_TOPOLOGY_MAX_WORK_UNITS,
      HARD_TOPOLOGY_MAX_WORK_UNITS,
      'stl.topology.maxWorkUnits'
    );
    const buildWork = boundedPositive(
      requestedSelfIntersection?.maxBuildWork,
      DEFAULT_SELF_INTERSECTION_MAX_BUILD_WORK,
      HARD_SELF_INTERSECTION_MAX_BUILD_WORK,
      'stl.selfIntersection.maxBuildWork'
    );
    const traversalWork = boundedPositive(
      requestedSelfIntersection?.maxTraversalVisits,
      DEFAULT_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
      HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
      'stl.selfIntersection.maxTraversalVisits'
    );
    const broadPhaseWork = boundedPositive(
      requestedSelfIntersection?.maxBroadPhasePairChecks,
      DEFAULT_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
      HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
      'stl.selfIntersection.maxBroadPhasePairChecks'
    );
    const candidateWork = boundedPositive(
      requestedSelfIntersection?.maxCandidatePairs,
      DEFAULT_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
      HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
      'stl.selfIntersection.maxCandidatePairs'
    );
    topology = assessParsedArtifactTopology(artifact, {
      ...requestedTopology,
      maxUniqueVertices,
      maxEdgeRecordBytes,
      maxTriangleVertexBytes,
      maxLinkUnionBytes,
      maxWorkUnits: Math.min(topologyWork, perCounterWorkShare),
      cancellationFlag: optionSnapshot.cancellationFlag,
      deadlineEpochMilliseconds,
    });
    selfIntersection = assessParsedArtifactSelfIntersections(artifact, {
      ...requestedSelfIntersection,
      maxBvhBytes,
      maxBuildWork: Math.min(buildWork, perCounterWorkShare),
      maxTraversalVisits: Math.min(traversalWork, perCounterWorkShare),
      maxBroadPhasePairChecks: Math.min(broadPhaseWork, perCounterWorkShare),
      maxCandidatePairs: Math.min(candidateWork, perCounterWorkShare),
      cancellationFlag: optionSnapshot.cancellationFlag,
      deadlineEpochMilliseconds,
    });
  } else {
    const requestedTopology = optionSnapshot.exactPicometre?.topology;
    const maxUniqueVertices = boundedPositive(
      requestedTopology?.maxUniqueVertices,
      DEFAULT_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
      HARD_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
      'exactPicometre.topology.maxUniqueVertices'
    );
    const maxEdgeRecordBytes = boundedPositive(
      requestedTopology?.maxEdgeRecordBytes,
      DEFAULT_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
      HARD_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
      'exactPicometre.topology.maxEdgeRecordBytes'
    );
    const maxTriangleVertexBytes = boundedPositive(
      requestedTopology?.maxTriangleVertexBytes,
      DEFAULT_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
      HARD_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
      'exactPicometre.topology.maxTriangleVertexBytes'
    );
    const maxLinkUnionBytes = boundedPositive(
      requestedTopology?.maxLinkUnionBytes,
      DEFAULT_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
      HARD_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
      'exactPicometre.topology.maxLinkUnionBytes'
    );
    const requestedSelfIntersection = optionSnapshot.exactPicometre?.selfIntersection;
    const maxBvhBytes = boundedPositive(
      requestedSelfIntersection?.maxBvhBytes,
      DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
      HARD_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
      'exactPicometre.selfIntersection.maxBvhBytes'
    );
    configuredByteCeiling =
      maxUniqueVertices * CONSERVATIVE_VERTEX_INTERNER_BYTES_PER_VERTEX +
      maxEdgeRecordBytes +
      maxTriangleVertexBytes +
      maxLinkUnionBytes +
      maxBvhBytes;
    if (configuredByteCeiling > maxTotalBytes) {
      throw new RangeError(
        `Configured exact-picometre structural byte ceilings total ${configuredByteCeiling}; aggregate limit is ${maxTotalBytes}`
      );
    }
    const topologyWork = boundedPositive(
      requestedTopology?.maxWorkUnits,
      DEFAULT_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
      HARD_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
      'exactPicometre.topology.maxWorkUnits'
    );
    const buildWork = boundedPositive(
      requestedSelfIntersection?.maxBuildWork,
      DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
      HARD_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
      'exactPicometre.selfIntersection.maxBuildWork'
    );
    const traversalWork = boundedPositive(
      requestedSelfIntersection?.maxTraversalVisits,
      DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
      HARD_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
      'exactPicometre.selfIntersection.maxTraversalVisits'
    );
    const broadPhaseWork = boundedPositive(
      requestedSelfIntersection?.maxBroadPhasePairChecks,
      DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
      HARD_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
      'exactPicometre.selfIntersection.maxBroadPhasePairChecks'
    );
    const candidateWork = boundedPositive(
      requestedSelfIntersection?.maxCandidatePairs,
      DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
      HARD_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
      'exactPicometre.selfIntersection.maxCandidatePairs'
    );
    topology = assessExactPicometreArtifactTopology(artifact, {
      ...requestedTopology,
      maxUniqueVertices,
      maxEdgeRecordBytes,
      maxTriangleVertexBytes,
      maxLinkUnionBytes,
      maxWorkUnits: Math.min(topologyWork, perCounterWorkShare),
      cancellationFlag: optionSnapshot.cancellationFlag,
      deadlineEpochMilliseconds,
    });
    selfIntersection = assessExactPicometreArtifactSelfIntersections(artifact, {
      ...requestedSelfIntersection,
      maxBvhBytes,
      maxBuildWork: Math.min(buildWork, perCounterWorkShare),
      maxTraversalVisits: Math.min(traversalWork, perCounterWorkShare),
      maxBroadPhasePairChecks: Math.min(broadPhaseWork, perCounterWorkShare),
      maxCandidatePairs: Math.min(candidateWork, perCounterWorkShare),
      cancellationFlag: optionSnapshot.cancellationFlag,
      deadlineEpochMilliseconds,
    });
  }
  const structuralWorkUnitCount =
    topology.workUnitCount +
    selfIntersection.buildWorkCount +
    selfIntersection.traversalVisitCount +
    selfIntersection.broadPhasePairCheckCount +
    selfIntersection.candidatePairCount;
  if (structuralWorkUnitCount > maxTotalWorkUnits) {
    throw new RangeError('Structural proof exceeded its aggregate work-unit ceiling');
  }
  const checks = Object.freeze({
    closed: topology.closed,
    manifold: topology.manifold,
    consistentlyOriented: topology.consistentlyOriented,
    outwardFacing: topology.outwardFacing,
    componentCountMatches: topology.componentCount === expected.componentCount,
    genusMatches: topology.genus === expected.genus,
    noDegenerateTriangles: topology.degenerateTriangleCount === 0,
    selfIntersectionScanComplete: selfIntersection.scanComplete,
    noSelfIntersections: selfIntersection.selfIntersectionFree,
  });
  const structurallyValid = Object.values(checks).every((value) => value === true);
  const scanComplete = selfIntersection.scanComplete;
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.mapped-proof-session-structural-integrity/evidence/v1',
    {
      artifactByteSha256: artifact.byteSha256,
      artifactFormat: artifact.format,
      configuredByteCeiling: configuredByteCeiling.toString(),
      checks,
      expectedTopology: {
        componentCount: expected.componentCount.toString(),
        genus: expected.genus.toString(),
      },
      parsedArtifactSha256: artifact.parsedArtifactSha256,
      parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
      proofMethodSha256: MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_PROOF_SHA256,
      proofVersion: MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION,
      scanComplete,
      structuralWorkUnitCount: structuralWorkUnitCount.toString(),
      selfIntersectionEvidenceSha256: selfIntersection.evidenceSha256,
      structurallyValid,
      topologyEvidenceSha256: topology.evidenceSha256,
      triangleCount: artifact.triangleCount.toString(),
      maxElapsedMilliseconds: maxElapsedMilliseconds.toString(),
    }
  );
  return Object.freeze({
    proofVersion: MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION,
    proofMethodSha256: MAPPED_PROOF_SESSION_STRUCTURAL_INTEGRITY_PROOF_SHA256,
    evidenceSha256,
    artifactFormat: artifact.format,
    artifactByteSha256: artifact.byteSha256,
    parsedArtifactSha256: artifact.parsedArtifactSha256,
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    triangleCount: artifact.triangleCount,
    expectedTopology: expected as Readonly<MappedProofSessionExpectedTopology>,
    topology,
    selfIntersection,
    checks,
    scanComplete,
    structurallyValid,
    configuredByteCeiling,
    structuralWorkUnitCount,
    maxElapsedMilliseconds,
    implementationScope: 'structural-only-no-distance-feature-or-thickness-proof',
  });
}
