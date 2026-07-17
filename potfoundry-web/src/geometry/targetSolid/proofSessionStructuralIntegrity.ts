import { domainSeparatedCanonicalJsonSha256 } from './canonicalCertificationJson';
import {
  parsedArtifactForProofSession,
  type FinalArtifactProofSession,
} from './finalArtifactProofSession';
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
import { sha256Utf8 } from './incrementalSha256';

export const PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION =
  'potfoundry.proof-session-structural-integrity/v3' as const;
export const PROOF_SESSION_STRUCTURAL_INTEGRITY_PROOF_SHA256 = sha256Utf8(
  [
    PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION,
    'input must be an unforgeable proof session minted by the exact final-byte binary-STL parser',
    'topology = complete exact binary32 vertex/edge/link/volume proof',
    'embeddedness = complete BVH candidate enumeration plus exact robust-predicate triangle intersection',
    'success requires expected component/genus, closed manifold, consistent orientation, positive volume, no degenerates, and no self-intersections',
    'plain own-data options, aggregate byte/work ceilings, and one shared non-raiseable elapsed-time deadline govern both proof phases',
    'scope excludes target distance, feature correspondence, dimensional validity, and thickness',
  ].join('\n')
);

export interface ProofSessionExpectedTopology {
  readonly componentCount: 1;
  readonly genus: 0 | 1;
}

export interface ProofSessionStructuralOptions {
  readonly topology?: ParsedTopologyOptions;
  readonly selfIntersection?: ParsedSelfIntersectionOptions;
  readonly maxTotalBytes?: number;
  readonly maxTotalWorkUnits?: number;
  readonly maxElapsedMilliseconds?: number;
}

export interface ProofSessionStructuralChecks {
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

export interface ProofSessionStructuralIntegrityResult {
  readonly proofVersion: typeof PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly triangleCount: number;
  readonly expectedTopology: Readonly<ProofSessionExpectedTopology>;
  readonly topology: ParsedArtifactTopology;
  readonly selfIntersection: ParsedArtifactSelfIntersectionResult;
  readonly checks: Readonly<ProofSessionStructuralChecks>;
  readonly scanComplete: boolean;
  readonly structurallyValid: boolean;
  readonly configuredByteCeiling: number;
  readonly structuralWorkUnitCount: number;
  readonly maxElapsedMilliseconds: number;
  readonly implementationScope: 'structural-only-no-distance-feature-or-thickness-proof';
}

const DEFAULT_STRUCTURAL_MAX_TOTAL_BYTES = 768 * 1024 * 1024;
const HARD_STRUCTURAL_MAX_TOTAL_BYTES = 768 * 1024 * 1024;
const DEFAULT_STRUCTURAL_MAX_TOTAL_WORK_UNITS = 300_000_000;
const HARD_STRUCTURAL_MAX_TOTAL_WORK_UNITS = 400_000_000;
const DEFAULT_STRUCTURAL_MAX_ELAPSED_MILLISECONDS = 15_000;
const HARD_STRUCTURAL_MAX_ELAPSED_MILLISECONDS = 600_000;
const CONSERVATIVE_VERTEX_INTERNER_BYTES_PER_VERTEX = 160;
const TOP_KEYS = new Set([
  'maxElapsedMilliseconds',
  'maxTotalBytes',
  'maxTotalWorkUnits',
  'selfIntersection',
  'topology',
]);
const TOPOLOGY_KEYS = new Set([
  'cancellationFlag',
  'deadlineEpochMilliseconds',
  'maxEdgeRecordBytes',
  'maxLinkUnionBytes',
  'maxTriangleVertexBytes',
  'maxUniqueVertices',
  'maxWorkUnits',
  'progressCounter',
]);
const INTERSECTION_KEYS = new Set([
  'cancellationFlag',
  'deadlineEpochMilliseconds',
  'leafSize',
  'maxBroadPhasePairChecks',
  'maxBuildWork',
  'maxBvhBytes',
  'maxCandidatePairs',
  'maxFoundPairs',
  'maxTraversalVisits',
  'progressCounter',
]);

function snapshotRecord(
  value: object,
  allowed: ReadonlySet<string>,
  label: string
): Readonly<Record<string, unknown>> {
  if (Array.isArray(value)) throw new TypeError(`${label} must be a plain data record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have Object or null prototype`);
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`${label} contains an unknown property`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function snapshotOptions(
  options: ProofSessionStructuralOptions
): Readonly<ProofSessionStructuralOptions> {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Structural options must be a plain data record');
  }
  const top = snapshotRecord(options, TOP_KEYS, 'structural options');
  const topology = top.topology === undefined
    ? undefined
    : snapshotRecord(top.topology as object, TOPOLOGY_KEYS, 'topology options');
  const selfIntersection = top.selfIntersection === undefined
    ? undefined
    : snapshotRecord(
        top.selfIntersection as object,
        INTERSECTION_KEYS,
        'self-intersection options'
      );
  return Object.freeze({
    topology: topology as ParsedTopologyOptions | undefined,
    selfIntersection: selfIntersection as ParsedSelfIntersectionOptions | undefined,
    maxTotalBytes: top.maxTotalBytes as number | undefined,
    maxTotalWorkUnits: top.maxTotalWorkUnits as number | undefined,
    maxElapsedMilliseconds: top.maxElapsedMilliseconds as number | undefined,
  });
}

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
  if (resolved > hardMaximum) throw new RangeError(`${label} exceeds hard limit ${hardMaximum}`);
  return resolved;
}

/** Execute complete structural checks over an authenticated final-artifact session. */
export function assessProofSessionStructuralIntegrity(
  session: FinalArtifactProofSession,
  expectedTopology: ProofSessionExpectedTopology,
  options: ProofSessionStructuralOptions = {}
): ProofSessionStructuralIntegrityResult {
  const frozenExpected = Object.freeze({
    componentCount: expectedTopology?.componentCount,
    genus: expectedTopology?.genus,
  });
  if (
    typeof expectedTopology !== 'object' ||
    expectedTopology === null ||
    frozenExpected.componentCount !== 1 ||
    (frozenExpected.genus !== 0 && frozenExpected.genus !== 1)
  ) {
    throw new TypeError('expectedTopology must declare componentCount 1 and genus 0 or 1');
  }
  const optionSnapshot = snapshotOptions(options);
  const parsed = parsedArtifactForProofSession(session);
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
  const requestedTopology = optionSnapshot.topology;
  const requestedIntersection = optionSnapshot.selfIntersection;
  const maxUniqueVertices = boundedPositive(
    requestedTopology?.maxUniqueVertices,
    DEFAULT_TOPOLOGY_MAX_UNIQUE_VERTICES,
    HARD_TOPOLOGY_MAX_UNIQUE_VERTICES,
    'topology.maxUniqueVertices'
  );
  const maxEdgeRecordBytes = boundedPositive(
    requestedTopology?.maxEdgeRecordBytes,
    DEFAULT_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
    HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
    'topology.maxEdgeRecordBytes'
  );
  const maxTriangleVertexBytes = boundedPositive(
    requestedTopology?.maxTriangleVertexBytes,
    DEFAULT_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
    HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
    'topology.maxTriangleVertexBytes'
  );
  const maxLinkUnionBytes = boundedPositive(
    requestedTopology?.maxLinkUnionBytes,
    DEFAULT_TOPOLOGY_MAX_LINK_UNION_BYTES,
    HARD_TOPOLOGY_MAX_LINK_UNION_BYTES,
    'topology.maxLinkUnionBytes'
  );
  const maxBvhBytes = boundedPositive(
    requestedIntersection?.maxBvhBytes,
    DEFAULT_SELF_INTERSECTION_MAX_BVH_BYTES,
    HARD_SELF_INTERSECTION_MAX_BVH_BYTES,
    'selfIntersection.maxBvhBytes'
  );
  const configuredByteCeiling =
    maxUniqueVertices * CONSERVATIVE_VERTEX_INTERNER_BYTES_PER_VERTEX +
    maxEdgeRecordBytes +
    maxTriangleVertexBytes +
    maxLinkUnionBytes +
    maxBvhBytes;
  if (configuredByteCeiling > maxTotalBytes) {
    throw new RangeError(
      `Configured structural byte ceilings total ${configuredByteCeiling}; aggregate limit is ${maxTotalBytes}`
    );
  }
  const topologyWork = boundedPositive(
    requestedTopology?.maxWorkUnits,
    DEFAULT_TOPOLOGY_MAX_WORK_UNITS,
    HARD_TOPOLOGY_MAX_WORK_UNITS,
    'topology.maxWorkUnits'
  );
  const buildWork = boundedPositive(
    requestedIntersection?.maxBuildWork,
    DEFAULT_SELF_INTERSECTION_MAX_BUILD_WORK,
    HARD_SELF_INTERSECTION_MAX_BUILD_WORK,
    'selfIntersection.maxBuildWork'
  );
  const traversalWork = boundedPositive(
    requestedIntersection?.maxTraversalVisits,
    DEFAULT_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
    HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
    'selfIntersection.maxTraversalVisits'
  );
  const broadPhaseWork = boundedPositive(
    requestedIntersection?.maxBroadPhasePairChecks,
    DEFAULT_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
    HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
    'selfIntersection.maxBroadPhasePairChecks'
  );
  const candidateWork = boundedPositive(
    requestedIntersection?.maxCandidatePairs,
    DEFAULT_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
    HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
    'selfIntersection.maxCandidatePairs'
  );
  const topology = assessParsedArtifactTopology(parsed, {
    ...requestedTopology,
    maxUniqueVertices,
    maxEdgeRecordBytes,
    maxTriangleVertexBytes,
    maxLinkUnionBytes,
    maxWorkUnits: Math.min(topologyWork, perCounterWorkShare),
    deadlineEpochMilliseconds,
  });
  const selfIntersection = assessParsedArtifactSelfIntersections(parsed, {
    ...requestedIntersection,
    maxBvhBytes,
    maxBuildWork: Math.min(buildWork, perCounterWorkShare),
    maxTraversalVisits: Math.min(traversalWork, perCounterWorkShare),
    maxBroadPhasePairChecks: Math.min(broadPhaseWork, perCounterWorkShare),
    maxCandidatePairs: Math.min(candidateWork, perCounterWorkShare),
    deadlineEpochMilliseconds,
  });
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
    componentCountMatches: topology.componentCount === frozenExpected.componentCount,
    genusMatches: topology.genus === frozenExpected.genus,
    noDegenerateTriangles: topology.degenerateTriangleCount === 0,
    selfIntersectionScanComplete: selfIntersection.scanComplete,
    noSelfIntersections: selfIntersection.selfIntersectionFree,
  });
  const structurallyValid = Object.values(checks).every((value) => value === true);
  const scanComplete = selfIntersection.scanComplete;
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.proof-session-structural-integrity/evidence/v1',
    {
      artifactByteSha256: parsed.byteSha256,
      configuredByteCeiling: configuredByteCeiling.toString(),
      checks,
      expectedTopology: {
        componentCount: frozenExpected.componentCount.toString(),
        genus: frozenExpected.genus.toString(),
      },
      parsedTriangleSetSha256: parsed.parsedTriangleSetSha256,
      proofMethodSha256: PROOF_SESSION_STRUCTURAL_INTEGRITY_PROOF_SHA256,
      proofVersion: PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION,
      selfIntersectionEvidenceSha256: selfIntersection.evidenceSha256,
      scanComplete,
      structuralWorkUnitCount: structuralWorkUnitCount.toString(),
      structurallyValid,
      topologyEvidenceSha256: topology.evidenceSha256,
      triangleCount: parsed.triangleCount.toString(),
      maxElapsedMilliseconds: maxElapsedMilliseconds.toString(),
    }
  );
  return Object.freeze({
    proofVersion: PROOF_SESSION_STRUCTURAL_INTEGRITY_VERSION,
    proofMethodSha256: PROOF_SESSION_STRUCTURAL_INTEGRITY_PROOF_SHA256,
    evidenceSha256,
    artifactByteSha256: parsed.byteSha256,
    parsedTriangleSetSha256: parsed.parsedTriangleSetSha256,
    triangleCount: parsed.triangleCount,
    expectedTopology: frozenExpected,
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
