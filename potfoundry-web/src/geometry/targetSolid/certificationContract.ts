/**
 * G0 manifest-consistency contract for future literal-tolerance certificates.
 *
 * A successful result from this module is explicitly NOT a certificate: proof
 * artifacts are identified and structurally bound, but are not executed here.
 * Only a separate G2 verifier may return a certified result.
 */

import {
  BINARY_STL_PARSER_PROOF_SHA256,
  BINARY_STL_PARSER_VERSION,
} from './binaryStlArtifact';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  parseCanonicalCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import { EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256 } from './exactTriangleIntersection';
import { EXACT_DYADIC_DOMAIN_PARTITION_VERSION } from './exactDyadicDomainPartition';
import {
  PARSED_SELF_INTERSECTION_PROOF_SHA256,
  PARSED_SELF_INTERSECTION_PROOF_VERSION,
} from './parsedArtifactSelfIntersection';
import {
  PARSED_TOPOLOGY_PROOF_SHA256,
  PARSED_TOPOLOGY_PROOF_VERSION,
} from './parsedArtifactTopology';
import { OUTWARD_FLOAT64_INTERVAL_VERSION } from './outwardFloat64Interval';
import { TARGET_SOLID_SPECIFICATION_SHA256 } from './targetSolidSpecification';

export const CERTIFICATION_MANIFEST_VERSION = 'potfoundry.certification-manifest/v2' as const;
export const CERTIFICATION_TARGET_MANIFEST_VERSION =
  'potfoundry.certification-target-manifest/v3' as const;
export const CERTIFICATION_ARTIFACT_MANIFEST_VERSION =
  'potfoundry.certification-artifact-manifest/v2' as const;
export const TRUE_TOLERANCE_PM = '10000000' as const;
export const TRUE_TOLERANCE_MM = 0.01 as const;
export const PICOMETRES_PER_MILLIMETRE = '1000000000' as const;
export const CERTIFICATION_CONSISTENCY_STATUS =
  'unverified-manifest-consistency-only' as const;
export const EXACT_STL_VERTEX_IDENTITY_POLICY =
  'exact-f32-coordinate-bits-with-signed-zero-canonicalization' as const;
export const SELF_INTERSECTION_ADJACENCY_SEMANTICS =
  'allow-only-exact-common-vertex-or-complete-common-edge' as const;
export const SELF_INTERSECTION_COPLANAR_SEMANTICS =
  'reject-duplicate-contained-t-junction-partial-collinear-and-interior-overlap' as const;
export const FEATURE_SURFACE_ASSIGNMENT_SEMANTICS =
  'one-assignment-record-per-declared-feature-patches-may-aggregate-records' as const;

export type TargetSurfaceRole =
  | 'outer-wall'
  | 'inner-wall'
  | 'top-rim'
  | 'bottom-under'
  | 'bottom-top'
  | 'drain-wall'
  | 'feature-curtain'
  | 'feature-side';

export type CertificationClaimKind =
  | 'schema-validity'
  | 'target-validity'
  | 'evaluator-support'
  | 'artifact-parse'
  | 'patch-distance'
  | 'artifact-coverage'
  | 'topology'
  | 'self-intersection'
  | 'patch-adjacency'
  | 'feature-correspondence'
  | 'thickness'
  | 'numerical-budget'
  | 'resource-completion';

export interface CertificationTargetPatchManifest {
  id: string;
  role: TargetSurfaceRole;
  branchId: string;
  evaluatorSha256: string;
  domainSha256: string;
  adjacencySha256: string;
  featurePartitionSha256: string;
}

export interface CertificationTargetManifest {
  schemaVersion: typeof CERTIFICATION_TARGET_MANIFEST_VERSION;
  units: 'millimeter';
  targetSolidSpecificationSha256: string;
  styleSpecSha256: string;
  canonicalInputSha256: string;
  patchAdjacencySha256: string;
  featurePartitionSha256: string;
  hasDrain: boolean;
  wallThicknessSemantics: 'radial' | 'surface-normal';
  requiredMinimumThicknessPm: string;
  expectedTopology: {
    componentCount: '1';
    genus: '0' | '1';
    closed: true;
    orientable: true;
  };
  featureManifest: {
    status: 'empty-proven' | 'present-proven';
    featureCount: string;
    creaseOnlyFeatureCount: string;
    curtainFeatureCount: string;
    sideFeatureCount: string;
    curtainAndSideFeatureCount: string;
    featureCurtainPatchCount: string;
    featureSidePatchCount: string;
    featureGraphSha256: string;
    featureSurfaceAssignmentManifestSha256: string;
  };
  patches: readonly CertificationTargetPatchManifest[];
}

export interface CertificationTargetBinding {
  manifest: CertificationTargetManifest;
  targetSha256: string;
}

export interface CertificationArtifactManifest {
  schemaVersion: typeof CERTIFICATION_ARTIFACT_MANIFEST_VERSION;
  format: 'stl';
  units: 'millimeter';
  unitScalePm: typeof PICOMETRES_PER_MILLIMETRE;
  transformStackSha256: string;
  byteLength: string;
  byteSha256: string;
  parserMethod: 'binary-stl-f32-exact';
  parserVersion: typeof BINARY_STL_PARSER_VERSION;
  parserProofSha256: string;
  parserEvidenceSha256: string;
  parserOutputSha256: string;
  parsedTriangleSetSha256: string;
  triangleCount: string;
  serializationRoundTripVerified: true;
  finalMutationEpoch: string;
  proofMutationEpoch: string;
}

export interface CertificationArtifactBinding {
  manifest: CertificationArtifactManifest;
  artifactManifestSha256: string;
}

export interface CertificationProofClaim {
  claimId: string;
  claimKind: CertificationClaimKind;
  verdict: 'pass' | 'fail' | 'inconclusive';
  evidenceSchemaVersion: string;
  methodId: string;
  methodVersion: string;
  verifierBuildSha256: string;
  verifierSourceSha256: string;
  proofArtifact: {
    format: 'canonical-json' | 'cbor' | 'binary';
    byteLength: string;
    sha256: string;
  };
  inputs: {
    targetSha256: string;
    artifactManifestSha256: string;
    artifactByteSha256: string;
    parsedTriangleSetSha256: string;
    patchId: string | null;
  };
  outputs: Readonly<Record<string, CanonicalJsonValue>>;
  claimSha256: string;
}

export interface UnverifiedCertificationManifest {
  schemaVersion: typeof CERTIFICATION_MANIFEST_VERSION;
  requestedTolerancePm: string;
  target: CertificationTargetBinding;
  artifact: CertificationArtifactBinding;
  claims: readonly CertificationProofClaim[];
  bundleSha256: string;
}

export type CertificationManifestFailureCode =
  | 'NON_CANONICAL_JSON'
  | 'SCHEMA_INVALID'
  | 'HASH_MISMATCH'
  | 'TARGET_INVALID'
  | 'ARTIFACT_INVALID'
  | 'CLAIM_SET_INVALID'
  | 'CLAIM_FAILED'
  | 'PATCH_COVERAGE_INVALID'
  | 'TOPOLOGY_INVALID'
  | 'SELF_INTERSECTION_INVALID'
  | 'FEATURE_MAPPING_INVALID'
  | 'THICKNESS_INVALID'
  | 'NUMERICAL_BUDGET_INVALID'
  | 'RESOURCE_INCOMPLETE'
  | 'TOLERANCE_EXCEEDED';

export interface CertificationManifestFailure {
  readonly code: CertificationManifestFailureCode;
  readonly message: string;
  readonly claimId?: string;
}

export type CertificationManifestDecision =
  | Readonly<{
      status: 'unverified-structurally-consistent';
      certified: false;
      proofsVerified: false;
      implementationStatus: typeof CERTIFICATION_CONSISTENCY_STATUS;
      bundleSha256: string;
      targetSha256: string;
      artifactManifestSha256: string;
      requestedTolerancePm: string;
      declaredGeometricUpperPm: string;
      declaredNumericalUpperPm: string;
      declaredCombinedUpperPm: string;
    }>
  | Readonly<{
      status: 'refused';
      certified: false;
      proofsVerified: false;
      implementationStatus: typeof CERTIFICATION_CONSISTENCY_STATUS;
      failures: readonly CertificationManifestFailure[];
    }>;

type JsonRecord = Record<string, CanonicalJsonValue>;

const SHA256_RE = /^[0-9a-f]{64}$/;
const ASCII_ID_RE = /^[a-z0-9](?:[a-z0-9._:/-]{0,127})$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const INT_RE = /^(?:0|-?[1-9][0-9]*)$/;
const MAX_COUNT = 1_000_000_000n;
const MAX_PM = 1_000_000_000_000_000_000n;
const REQUIRED_GLOBAL_CLAIMS: readonly CertificationClaimKind[] = [
  'artifact-coverage',
  'artifact-parse',
  'evaluator-support',
  'feature-correspondence',
  'numerical-budget',
  'patch-adjacency',
  'resource-completion',
  'schema-validity',
  'self-intersection',
  'target-validity',
  'thickness',
  'topology',
];
const REQUIRED_NUMERICAL_COMPONENTS = [
  'interval-arithmetic',
  'parser',
  'serialization',
  'target-evaluator',
  'transform',
] as const;
type RequiredNumericalComponentId = (typeof REQUIRED_NUMERICAL_COMPONENTS)[number];

interface RegisteredNumericalComponentMethod {
  readonly componentId: RequiredNumericalComponentId;
  readonly methodId: string;
  readonly methodVersion: string;
  readonly sourceKind: 'target' | 'parser-proof' | 'artifact-bytes' | 'transform-stack';
  readonly appliesToHausdorff: true;
  readonly appliesToThickness: true;
}

export const CERTIFICATION_NUMERICAL_COMPONENT_REGISTRY: Readonly<
  Record<RequiredNumericalComponentId, RegisteredNumericalComponentMethod>
> = Object.freeze({
  'interval-arithmetic': Object.freeze({
    componentId: 'interval-arithmetic',
    methodId: 'outward-float64-interval',
    methodVersion: OUTWARD_FLOAT64_INTERVAL_VERSION,
    sourceKind: 'target',
    appliesToHausdorff: true,
    appliesToThickness: true,
  }),
  parser: Object.freeze({
    componentId: 'parser',
    methodId: 'binary-stl-f32-exact',
    methodVersion: BINARY_STL_PARSER_VERSION,
    sourceKind: 'parser-proof',
    appliesToHausdorff: true,
    appliesToThickness: true,
  }),
  serialization: Object.freeze({
    componentId: 'serialization',
    methodId: 'binary-stl-roundtrip-exact',
    methodVersion: 'potfoundry.binary-stl-roundtrip/v1',
    sourceKind: 'artifact-bytes',
    appliesToHausdorff: true,
    appliesToThickness: true,
  }),
  'target-evaluator': Object.freeze({
    componentId: 'target-evaluator',
    methodId: 'generated-semantic-parity',
    methodVersion: 'potfoundry.generated-semantic-parity/v1',
    sourceKind: 'target',
    appliesToHausdorff: true,
    appliesToThickness: true,
  }),
  transform: Object.freeze({
    componentId: 'transform',
    methodId: 'exact-transform-stack',
    methodVersion: 'potfoundry.exact-transform-stack/v1',
    sourceKind: 'transform-stack',
    appliesToHausdorff: true,
    appliesToThickness: true,
  }),
});

export const CERTIFICATION_EVIDENCE_SCHEMA_VERSION =
  'potfoundry.certification-proof-evidence/v2' as const;

interface RegisteredCertificationClaimMethod {
  readonly evidenceSchemaVersion: typeof CERTIFICATION_EVIDENCE_SCHEMA_VERSION;
  readonly methodId: string;
  readonly methodVersion: string;
  readonly proofFormat: CertificationProofClaim['proofArtifact']['format'];
}

const registeredMethod = (
  methodId: string,
  methodVersion: string
): RegisteredCertificationClaimMethod =>
  Object.freeze({
    evidenceSchemaVersion: CERTIFICATION_EVIDENCE_SCHEMA_VERSION,
    methodId,
    methodVersion,
    proofFormat: 'canonical-json',
  });

/** Exact proof-method allowlist for a certificate-capable v2 evidence bundle. */
export const CERTIFICATION_CLAIM_METHOD_REGISTRY: Readonly<
  Record<CertificationClaimKind, RegisteredCertificationClaimMethod>
> = Object.freeze({
  'schema-validity': registeredMethod(
    'strict-runtime-contract',
    'potfoundry.strict-runtime-contract/v2'
  ),
  'target-validity': registeredMethod(
    'validated-target-solid',
    'potfoundry.validated-target-solid/v1'
  ),
  'evaluator-support': registeredMethod(
    'generated-semantic-parity',
    'potfoundry.generated-semantic-parity/v1'
  ),
  'artifact-parse': registeredMethod('binary-stl-f32-exact', BINARY_STL_PARSER_VERSION),
  'patch-distance': registeredMethod(
    'validated-continuous-patch-correspondence',
    'potfoundry.continuous-mapped-patch-distance/v1'
  ),
  'artifact-coverage': registeredMethod(
    'exact-dyadic-domain-partition',
    EXACT_DYADIC_DOMAIN_PARTITION_VERSION
  ),
  topology: registeredMethod('parsed-artifact-topology', PARSED_TOPOLOGY_PROOF_VERSION),
  'self-intersection': registeredMethod(
    'parsed-artifact-self-intersection',
    PARSED_SELF_INTERSECTION_PROOF_VERSION
  ),
  'patch-adjacency': registeredMethod(
    'exact-patch-adjacency',
    'potfoundry.exact-patch-adjacency/v1'
  ),
  'feature-correspondence': registeredMethod(
    'exact-feature-correspondence',
    'potfoundry.exact-feature-correspondence/v1'
  ),
  thickness: registeredMethod(
    'validated-continuous-thickness',
    'potfoundry.validated-continuous-thickness/v1'
  ),
  'numerical-budget': registeredMethod(
    'conservative-numerical-budget',
    'potfoundry.conservative-numerical-budget/v1'
  ),
  'resource-completion': registeredMethod(
    'complete-proof-run',
    'potfoundry.complete-proof-run/v1'
  ),
});
const BASE_ROLES: readonly TargetSurfaceRole[] = [
  'bottom-top',
  'bottom-under',
  'inner-wall',
  'outer-wall',
  'top-rim',
];

const ROOT_KEYS = [
  'artifact',
  'bundleSha256',
  'claims',
  'requestedTolerancePm',
  'schemaVersion',
  'target',
] as const;
const TARGET_BINDING_KEYS = ['manifest', 'targetSha256'] as const;
const TARGET_KEYS = [
  'canonicalInputSha256',
  'expectedTopology',
  'featureManifest',
  'featurePartitionSha256',
  'hasDrain',
  'patchAdjacencySha256',
  'patches',
  'requiredMinimumThicknessPm',
  'schemaVersion',
  'styleSpecSha256',
  'targetSolidSpecificationSha256',
  'units',
  'wallThicknessSemantics',
] as const;
const TOPOLOGY_DECLARATION_KEYS = ['closed', 'componentCount', 'genus', 'orientable'] as const;
const FEATURE_MANIFEST_KEYS = [
  'creaseOnlyFeatureCount',
  'curtainAndSideFeatureCount',
  'curtainFeatureCount',
  'featureCount',
  'featureCurtainPatchCount',
  'featureGraphSha256',
  'featureSidePatchCount',
  'featureSurfaceAssignmentManifestSha256',
  'sideFeatureCount',
  'status',
] as const;
const PATCH_KEYS = [
  'adjacencySha256',
  'branchId',
  'domainSha256',
  'evaluatorSha256',
  'featurePartitionSha256',
  'id',
  'role',
] as const;
const ARTIFACT_BINDING_KEYS = ['artifactManifestSha256', 'manifest'] as const;
const ARTIFACT_KEYS = [
  'byteLength',
  'byteSha256',
  'finalMutationEpoch',
  'format',
  'parsedTriangleSetSha256',
  'parserEvidenceSha256',
  'parserMethod',
  'parserOutputSha256',
  'parserProofSha256',
  'parserVersion',
  'proofMutationEpoch',
  'schemaVersion',
  'serializationRoundTripVerified',
  'transformStackSha256',
  'triangleCount',
  'unitScalePm',
  'units',
] as const;
const CLAIM_KEYS = [
  'claimId',
  'claimKind',
  'claimSha256',
  'evidenceSchemaVersion',
  'inputs',
  'methodId',
  'methodVersion',
  'outputs',
  'proofArtifact',
  'verdict',
  'verifierBuildSha256',
  'verifierSourceSha256',
] as const;
const PROOF_ARTIFACT_KEYS = ['byteLength', 'format', 'sha256'] as const;
const CLAIM_INPUT_KEYS = [
  'artifactByteSha256',
  'artifactManifestSha256',
  'parsedTriangleSetSha256',
  'patchId',
  'targetSha256',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function hashValid(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

function idValid(value: unknown): value is string {
  return typeof value === 'string' && ASCII_ID_RE.test(value);
}

function uint(value: unknown, maximum = MAX_PM): bigint | null {
  if (typeof value !== 'string' || value.length > 19 || !UINT_RE.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= maximum ? parsed : null;
}

function integer(value: unknown, maximumAbsolute = MAX_COUNT): bigint | null {
  if (typeof value !== 'string' || value.length > 20 || !INT_RE.test(value)) return null;
  const parsed = BigInt(value);
  return parsed >= -maximumAbsolute && parsed <= maximumAbsolute ? parsed : null;
}

function exactBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function omitHash(record: JsonRecord, key: string): JsonRecord {
  const result: JsonRecord = {};
  for (const [entryKey, value] of Object.entries(record)) {
    if (entryKey !== key) result[entryKey] = value;
  }
  return result;
}

/** Trusted-builder helper. The untrusted assessment API accepts canonical JSON text only. */
export function computeCertificationTargetSha256(manifest: unknown): string {
  return domainSeparatedCanonicalJsonSha256('potfoundry.certification/target-manifest/v3', manifest);
}

/** Trusted-builder helper. */
export function computeCertificationArtifactManifestSha256(manifest: unknown): string {
  return domainSeparatedCanonicalJsonSha256('potfoundry.certification/artifact-manifest/v2', manifest);
}

/** Trusted-builder helper. */
export function computeCertificationClaimSha256(claimWithoutOrWithHash: unknown): string {
  if (!isRecord(claimWithoutOrWithHash)) throw new TypeError('Claim must be an inert record');
  return domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification/proof-claim/v2',
    omitHash(claimWithoutOrWithHash, 'claimSha256')
  );
}

/** Trusted-builder helper. */
export function computeCertificationBundleSha256(manifestWithoutOrWithHash: unknown): string {
  if (!isRecord(manifestWithoutOrWithHash)) throw new TypeError('Manifest must be an inert record');
  return domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification/bundle/v2',
    omitHash(manifestWithoutOrWithHash, 'bundleSha256')
  );
}

export function computePatchSubsetManifestSha256(entries: unknown): string {
  return domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification/patch-subset-manifest/v2',
    entries
  );
}

export function computeVerifiedClaimSetSha256(entries: unknown): string {
  return domainSeparatedCanonicalJsonSha256('potfoundry.certification/claim-set/v2', entries);
}

export function canonicalCertificationManifestJson(manifest: unknown): string {
  return canonicalizeCertificationJson(manifest);
}

function freezeFailure(
  code: CertificationManifestFailureCode,
  message: string,
  claimId?: string
): CertificationManifestFailure {
  return Object.freeze({ code, message, ...(claimId ? { claimId } : {}) });
}

function refused(failures: readonly CertificationManifestFailure[]): CertificationManifestDecision {
  return Object.freeze({
    status: 'refused',
    certified: false,
    proofsVerified: false,
    implementationStatus: CERTIFICATION_CONSISTENCY_STATUS,
    failures: Object.freeze([...failures]),
  });
}

function malformed(message: string): CertificationManifestDecision {
  return refused([freezeFailure('SCHEMA_INVALID', message)]);
}

const OUTPUT_KEYS: Readonly<Record<CertificationClaimKind, readonly string[]>> = {
  'schema-validity': [
    'aliasConflictCount',
    'canonicalInputSha256',
    'nonFiniteParameterCount',
    'nonIntegralIntegerCount',
    'outOfBoundsParameterCount',
    'unknownParameterCount',
    'valid',
  ],
  'target-validity': [
    'adjacencyClosed',
    'branchPartitionComplete',
    'featureCurtainsComplete',
    'featurePartitionSha256',
    'geometryEmbedded',
    'minimumFeatureSeparationLowerPm',
    'minimumFeatureSeparationStatus',
    'minimumFeatureSeparationWitnessSha256',
    'minimumThicknessLowerPm',
    'noUnintendedSelfIntersections',
    'patchDomainsRegular',
    'scanComplete',
    'status',
    'topologyRegimeMatches',
  ],
  'evaluator-support': [
    'canonicalInputSha256',
    'continuousCorrespondenceAvailable',
    'convergenceSupportedForInput',
    'cpuEvaluatorSha256',
    'evaluatorParityProven',
    'maxParityErrorUpperPm',
    'scanComplete',
    'styleSemanticsComplete',
    'styleSpecSha256',
    'validatedEvaluatorAvailable',
    'validatedEvaluatorSha256',
    'wgslEvaluatorSha256',
  ],
  'artifact-parse': [
    'artifactManifestSha256',
    'byteLength',
    'byteSha256',
    'parsedTriangleSetSha256',
    'parserEvidenceSha256',
    'parserOutputSha256',
    'roundTripVerified',
    'scanComplete',
    'transformStackSha256',
    'triangleCount',
    'units',
  ],
  'patch-distance': [
    'artifactBoundarySetSha256',
    'artifactTriangleSubsetCount',
    'artifactTriangleSubsetSha256',
    'boundaryCorrespondenceComplete',
    'boundarySubdomainSha256',
    'domainCoverageComplete',
    'domainSha256',
    'evaluatorSha256',
    'featureCorrespondenceComplete',
    'featurePartitionSha256',
    'geometricBoundsIncludeNumericalErrors',
    'meshToTargetUpperPm',
    'patchAdjacencySha256',
    'patchId',
    'scanComplete',
    'targetToMeshUpperPm',
  ],
  'artifact-coverage': [
    'artifactTriangleCount',
    'continuouslyCoveredTriangleCount',
    'coveredTriangleSetSha256',
    'duplicateTriangleAssignmentCount',
    'geometricBoundsIncludeNumericalErrors',
    'meshToTargetUpperPm',
    'parsedTriangleSetSha256',
    'patchSubsetManifestSha256',
    'scanComplete',
    'unassignedTriangleCount',
  ],
  topology: [
    'boundaryEdgeCount',
    'closed',
    'componentCount',
    'consistentlyOriented',
    'degenerateTriangleCount',
    'edgeSetSha256',
    'eulerCharacteristic',
    'evidenceSha256',
    'faceSetSha256',
    'genus',
    'kernelProofSha256',
    'kernelVersion',
    'manifold',
    'nonManifoldEdgeCount',
    'nonManifoldVertexCount',
    'orientationMismatchCount',
    'outwardFacing',
    'parsedTriangleSetSha256',
    'scanComplete',
    'triangleCount',
    'uniqueEdgeCount',
    'uniqueVertexCount',
    'validTriangleCount',
    'vertexIdentityPolicy',
    'vertexSetSha256',
    'volumeSign',
  ],
  'self-intersection': [
    'adjacencyExclusionSemantics',
    'candidatePairCount',
    'candidatePairSetSha256',
    'coplanarOverlapSemantics',
    'evidenceSha256',
    'intersectionPairCountLowerBound',
    'kernelProofSha256',
    'kernelVersion',
    'narrowPhaseProofSha256',
    'parsedTriangleSetSha256',
    'scanComplete',
    'selfIntersectionFree',
    'triangleCount',
  ],
  'patch-adjacency': [
    'artifactAdjacencyGraphSha256',
    'artifactToTargetMappingSha256',
    'complete',
    'parsedTriangleSetSha256',
    'scanComplete',
    'targetAdjacencySha256',
  ],
  'feature-correspondence': [
    'duplicateFeatureMappingCount',
    'expectedCreaseOnlyFeatureCount',
    'expectedCurtainAndSideFeatureCount',
    'expectedCurtainFeatureCount',
    'expectedFeatureCount',
    'expectedSideFeatureCount',
    'featurePartitionSha256',
    'mappedFeatureCount',
    'mappingSetSha256',
    'scanComplete',
    'satisfiedCreaseOnlyFeatureCount',
    'satisfiedCurtainAndSideFeatureCount',
    'satisfiedCurtainFeatureCount',
    'satisfiedSideFeatureCount',
    'surfaceAssignmentManifestSha256',
    'surfaceAssignmentSemantics',
    'unmappedFeatureCount',
  ],
  thickness: [
    'certifiedMinimumLowerPm',
    'geometricMinimumLowerPm',
    'numericalUncertaintyUpperPm',
    'parsedTriangleSetSha256',
    'scanComplete',
    'semantics',
  ],
  'numerical-budget': [
    'components',
    'compositionModel',
    'geometricBoundsIncludeNumericalErrors',
    'hausdorffNumericalUpperPm',
    'thicknessNumericalUncertaintyUpperPm',
  ],
  'resource-completion': [
    'cancelled',
    'claimSetSha256',
    'constraintRecoveryFailed',
    'featuresDropped',
    'memoryLimitExceeded',
    'proofInconclusive',
    'scanComplete',
    'timeLimitExceeded',
    'triangleLimitExceeded',
    'workUnitCount',
  ],
};

const NUMERICAL_COMPONENT_KEYS = [
  'appliesToHausdorff',
  'appliesToThickness',
  'componentId',
  'methodId',
  'methodVersion',
  'sourceSha256',
  'upperPm',
] as const;

function manifestHasExactShape(value: CanonicalJsonValue): value is JsonRecord {
  if (!isRecord(value) || !hasExactKeys(value, ROOT_KEYS)) return false;
  const targetBinding = value.target;
  const artifactBinding = value.artifact;
  if (
    !isRecord(targetBinding) ||
    !hasExactKeys(targetBinding, TARGET_BINDING_KEYS) ||
    !isRecord(targetBinding.manifest) ||
    !hasExactKeys(targetBinding.manifest, TARGET_KEYS) ||
    !isRecord(targetBinding.manifest.expectedTopology) ||
    !hasExactKeys(targetBinding.manifest.expectedTopology, TOPOLOGY_DECLARATION_KEYS) ||
    !isRecord(targetBinding.manifest.featureManifest) ||
    !hasExactKeys(targetBinding.manifest.featureManifest, FEATURE_MANIFEST_KEYS) ||
    !Array.isArray(targetBinding.manifest.patches) ||
    targetBinding.manifest.patches.length === 0 ||
    targetBinding.manifest.patches.length > 4_096 ||
    !targetBinding.manifest.patches.every(
      (patch) => isRecord(patch) && hasExactKeys(patch, PATCH_KEYS)
    ) ||
    !isRecord(artifactBinding) ||
    !hasExactKeys(artifactBinding, ARTIFACT_BINDING_KEYS) ||
    !isRecord(artifactBinding.manifest) ||
    !hasExactKeys(artifactBinding.manifest, ARTIFACT_KEYS) ||
    !Array.isArray(value.claims) ||
    value.claims.length === 0 ||
    value.claims.length > 8_192
  ) {
    return false;
  }
  return value.claims.every(
    (claim) =>
      isRecord(claim) &&
      hasExactKeys(claim, CLAIM_KEYS) &&
      isRecord(claim.proofArtifact) &&
      hasExactKeys(claim.proofArtifact, PROOF_ARTIFACT_KEYS) &&
      isRecord(claim.inputs) &&
      hasExactKeys(claim.inputs, CLAIM_INPUT_KEYS) &&
      isRecord(claim.outputs)
  );
}

function sortedUniqueIds(values: readonly string[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!idValid(values[index]) || (index > 0 && values[index - 1] >= values[index])) return false;
  }
  return true;
}

function add(values: readonly (bigint | null)[]): bigint | null {
  let result = 0n;
  for (const value of values) {
    if (value === null) return null;
    result += value;
    if (result > MAX_PM) return null;
  }
  return result;
}

function claimOutput(
  claims: Map<CertificationClaimKind, CertificationProofClaim[]>,
  kind: CertificationClaimKind
): JsonRecord | null {
  const entries = claims.get(kind);
  return entries?.length === 1 ? (entries[0].outputs as JsonRecord) : null;
}

function singleClaim(
  claims: Map<CertificationClaimKind, CertificationProofClaim[]>,
  kind: CertificationClaimKind
): CertificationProofClaim | null {
  const entries = claims.get(kind);
  return entries?.length === 1 ? entries[0] : null;
}

function maximum(values: readonly (bigint | null)[]): bigint | null {
  let result = 0n;
  for (const value of values) {
    if (value === null) return null;
    if (value > result) result = value;
  }
  return result;
}

/**
 * Assess canonical manifest consistency without executing any proof artifact.
 * Object inputs (including Proxies) are refused without reflection.
 */
function assessUnverifiedCertificationManifestJsonInternal(
  source: unknown
): CertificationManifestDecision {
  const parsed = parseCanonicalCertificationJson(source);
  if (!parsed.ok) {
    return refused([freezeFailure('NON_CANONICAL_JSON', parsed.reason)]);
  }
  if (!manifestHasExactShape(parsed.value)) {
    return malformed('Manifest must match the exact v2 schema with no additional properties');
  }

  const root = parsed.value as unknown as UnverifiedCertificationManifest;
  const failures: CertificationManifestFailure[] = [];
  const fail = (
    code: CertificationManifestFailureCode,
    message: string,
    unsafeClaimId?: unknown
  ): void => {
    if (failures.length >= 64) return;
    const claimId = idValid(unsafeClaimId) ? unsafeClaimId : undefined;
    failures.push(freezeFailure(code, message, claimId));
  };

  if (root.schemaVersion !== CERTIFICATION_MANIFEST_VERSION) {
    fail('SCHEMA_INVALID', 'Manifest schema version is unsupported');
  }
  const requestedTolerance = uint(root.requestedTolerancePm);
  if (requestedTolerance === null || requestedTolerance <= 0n || requestedTolerance > BigInt(TRUE_TOLERANCE_PM)) {
    fail('SCHEMA_INVALID', 'Requested tolerance must be a canonical integer in (0, 10000000] pm');
  }

  const target = root.target.manifest;
  const expectedTargetGenus = uint(target.expectedTopology.genus, 1n);
  if (
    target.schemaVersion !== CERTIFICATION_TARGET_MANIFEST_VERSION ||
    target.units !== 'millimeter' ||
    target.targetSolidSpecificationSha256 !== TARGET_SOLID_SPECIFICATION_SHA256 ||
    !hashValid(target.styleSpecSha256) ||
    !hashValid(target.canonicalInputSha256) ||
    !hashValid(target.patchAdjacencySha256) ||
    !hashValid(target.featurePartitionSha256) ||
    !exactBoolean(target.hasDrain) ||
    (target.wallThicknessSemantics !== 'radial' &&
      target.wallThicknessSemantics !== 'surface-normal')
  ) {
    fail('TARGET_INVALID', 'Target manifest semantics or hashes are invalid');
  }
  const requiredThickness = uint(target.requiredMinimumThicknessPm);
  if (requiredThickness === null || requiredThickness <= 0n) {
    fail('TARGET_INVALID', 'Target minimum thickness must be a positive canonical pm integer');
  }
  if (
    target.expectedTopology.componentCount !== '1' ||
    target.expectedTopology.closed !== true ||
    target.expectedTopology.orientable !== true ||
    target.expectedTopology.genus !== (target.hasDrain ? '1' : '0')
  ) {
    fail('TARGET_INVALID', 'Target topology does not match the declared drain regime');
  }

  const patchIds = target.patches.map((patch) => patch.id);
  if (!sortedUniqueIds(patchIds)) {
    fail('TARGET_INVALID', 'Target patches must be uniquely sorted by bounded ASCII id');
  }
  const patchById = new Map<string, CertificationTargetPatchManifest>();
  const roles = new Map<TargetSurfaceRole, number>();
  const validRoles = new Set<TargetSurfaceRole>([
    ...BASE_ROLES,
    'drain-wall',
    'feature-curtain',
    'feature-side',
  ]);
  for (const patch of target.patches) {
    if (
      !idValid(patch.branchId) ||
      !validRoles.has(patch.role) ||
      !hashValid(patch.evaluatorSha256) ||
      !hashValid(patch.domainSha256) ||
      !hashValid(patch.adjacencySha256) ||
      patch.featurePartitionSha256 !== target.featurePartitionSha256
    ) {
      fail('TARGET_INVALID', 'A target patch has invalid semantic bindings');
    }
    patchById.set(patch.id, patch);
    roles.set(patch.role, (roles.get(patch.role) ?? 0) + 1);
  }
  for (const role of BASE_ROLES) {
    if (!roles.has(role)) fail('TARGET_INVALID', 'A required base target surface role is absent');
  }
  if ((roles.get('drain-wall') ?? 0) !== (target.hasDrain ? 1 : 0)) {
    fail('TARGET_INVALID', 'Drain-wall patch count does not match the target drain regime');
  }

  const featureCount = uint(target.featureManifest.featureCount, MAX_COUNT);
  const creaseOnlyFeatureCount = uint(
    target.featureManifest.creaseOnlyFeatureCount,
    MAX_COUNT
  );
  const curtainFeatureCount = uint(target.featureManifest.curtainFeatureCount, MAX_COUNT);
  const sideFeatureCount = uint(target.featureManifest.sideFeatureCount, MAX_COUNT);
  const curtainAndSideFeatureCount = uint(
    target.featureManifest.curtainAndSideFeatureCount,
    MAX_COUNT
  );
  const curtainCount = uint(target.featureManifest.featureCurtainPatchCount, MAX_COUNT);
  const sideCount = uint(target.featureManifest.featureSidePatchCount, MAX_COUNT);
  const featureObligationSum = add([
    creaseOnlyFeatureCount,
    curtainFeatureCount,
    sideFeatureCount,
    curtainAndSideFeatureCount,
  ]);
  const curtainObligationCount = add([curtainFeatureCount, curtainAndSideFeatureCount]);
  const sideObligationCount = add([sideFeatureCount, curtainAndSideFeatureCount]);
  const featureSurfaceObligationValid =
    featureCount !== null &&
    featureObligationSum === featureCount &&
    curtainCount !== null &&
    sideCount !== null &&
    curtainObligationCount !== null &&
    sideObligationCount !== null &&
    (curtainObligationCount > 0n ? curtainCount > 0n : curtainCount === 0n) &&
    (sideObligationCount > 0n ? sideCount > 0n : sideCount === 0n) &&
    (target.featureManifest.status === 'empty-proven'
      ? featureCount === 0n
      : target.featureManifest.status === 'present-proven' && featureCount > 0n);
  if (
    featureCount === null ||
    curtainCount === null ||
    sideCount === null ||
    !hashValid(target.featureManifest.featureGraphSha256) ||
    !hashValid(target.featureManifest.featureSurfaceAssignmentManifestSha256) ||
    curtainCount !== BigInt(roles.get('feature-curtain') ?? 0) ||
    sideCount !== BigInt(roles.get('feature-side') ?? 0) ||
    !featureSurfaceObligationValid
  ) {
    fail('TARGET_INVALID', 'Feature manifest is inconsistent with target feature patches');
  }
  const recomputedTargetSha256 = computeCertificationTargetSha256(target);
  if (!hashValid(root.target.targetSha256) || root.target.targetSha256 !== recomputedTargetSha256) {
    fail('HASH_MISMATCH', 'Target digest does not match the complete canonical target manifest');
  }

  const artifact = root.artifact.manifest;
  const artifactTriangleCount = uint(artifact.triangleCount, MAX_COUNT);
  const artifactByteLength = uint(artifact.byteLength, MAX_PM);
  const expectedArtifactByteLength =
    artifactTriangleCount === null ? null : 84n + 50n * artifactTriangleCount;
  if (
    artifact.schemaVersion !== CERTIFICATION_ARTIFACT_MANIFEST_VERSION ||
    artifact.format !== 'stl' ||
    artifact.units !== 'millimeter' ||
    artifact.unitScalePm !== PICOMETRES_PER_MILLIMETRE ||
    !hashValid(artifact.transformStackSha256) ||
    artifactByteLength === null ||
    artifactByteLength !== expectedArtifactByteLength ||
    !hashValid(artifact.byteSha256) ||
    artifact.parserMethod !== 'binary-stl-f32-exact' ||
    artifact.parserVersion !== BINARY_STL_PARSER_VERSION ||
    artifact.parserProofSha256 !== BINARY_STL_PARSER_PROOF_SHA256 ||
    !hashValid(artifact.parserEvidenceSha256) ||
    !hashValid(artifact.parserOutputSha256) ||
    !hashValid(artifact.parsedTriangleSetSha256) ||
    artifactTriangleCount === null ||
    artifactTriangleCount <= 0n ||
    artifact.serializationRoundTripVerified !== true ||
    uint(artifact.finalMutationEpoch, MAX_COUNT) === null ||
    artifact.finalMutationEpoch !== artifact.proofMutationEpoch
  ) {
    fail('ARTIFACT_INVALID', 'Artifact manifest is not a current exact binary-STL parse binding');
  }
  const recomputedArtifactSha256 = computeCertificationArtifactManifestSha256(artifact);
  if (
    !hashValid(root.artifact.artifactManifestSha256) ||
    root.artifact.artifactManifestSha256 !== recomputedArtifactSha256
  ) {
    fail('HASH_MISMATCH', 'Artifact digest does not match the complete canonical artifact manifest');
  }

  const claimIds = root.claims.map((claim) => claim.claimId);
  if (!sortedUniqueIds(claimIds)) {
    fail('CLAIM_SET_INVALID', 'Claims must be uniquely sorted by bounded ASCII claim id');
  }
  const claimsByKind = new Map<CertificationClaimKind, CertificationProofClaim[]>();
  const globalClaimKinds = new Set<CertificationClaimKind>(REQUIRED_GLOBAL_CLAIMS);
  const patchClaimsByPatch = new Map<string, CertificationProofClaim>();
  const claimKinds = new Set<CertificationClaimKind>([
    ...REQUIRED_GLOBAL_CLAIMS,
    'patch-distance',
  ]);

  for (const claim of root.claims) {
    const safeClaimId = idValid(claim.claimId) ? claim.claimId : undefined;
    if (
      !idValid(claim.claimId) ||
      !claimKinds.has(claim.claimKind) ||
      !idValid(claim.evidenceSchemaVersion) ||
      !idValid(claim.methodId) ||
      !idValid(claim.methodVersion) ||
      !hashValid(claim.verifierBuildSha256) ||
      !hashValid(claim.verifierSourceSha256) ||
      (claim.proofArtifact.format !== 'canonical-json' &&
        claim.proofArtifact.format !== 'cbor' &&
        claim.proofArtifact.format !== 'binary') ||
      uint(claim.proofArtifact.byteLength, MAX_PM) === null ||
      uint(claim.proofArtifact.byteLength, MAX_PM) === 0n ||
      !hashValid(claim.proofArtifact.sha256)
    ) {
      fail('SCHEMA_INVALID', 'Claim metadata or proof-artifact identity is invalid', safeClaimId);
    }
    if (!claimKinds.has(claim.claimKind)) {
      continue;
    }
    const registered = CERTIFICATION_CLAIM_METHOD_REGISTRY[claim.claimKind];
    if (
      claim.evidenceSchemaVersion !== registered.evidenceSchemaVersion ||
      claim.methodId !== registered.methodId ||
      claim.methodVersion !== registered.methodVersion ||
      claim.proofArtifact.format !== registered.proofFormat
    ) {
      fail(
        'CLAIM_FAILED',
        'Claim does not use the registered evidence schema, method, version, and proof format',
        safeClaimId
      );
    }
    if (claim.verdict !== 'pass') {
      fail('CLAIM_FAILED', 'Every required proof claim must have a pass verdict', safeClaimId);
    }
    if (
      claim.inputs.targetSha256 !== root.target.targetSha256 ||
      claim.inputs.artifactManifestSha256 !== root.artifact.artifactManifestSha256 ||
      claim.inputs.artifactByteSha256 !== artifact.byteSha256 ||
      claim.inputs.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256
    ) {
      fail('HASH_MISMATCH', 'Claim inputs are not bound to this target and parsed artifact', safeClaimId);
    }
    const expectedOutputKeys = OUTPUT_KEYS[claim.claimKind];
    if (!hasExactKeys(claim.outputs as JsonRecord, expectedOutputKeys)) {
      fail('SCHEMA_INVALID', 'Claim output schema has missing or additional fields', safeClaimId);
    }
    if (!hashValid(claim.claimSha256) || claim.claimSha256 !== computeCertificationClaimSha256(claim as unknown as JsonRecord)) {
      fail('HASH_MISMATCH', 'Claim digest does not cover its complete canonical content', safeClaimId);
    }

    if (claim.claimKind === 'patch-distance') {
      const patchId = claim.inputs.patchId;
      if (!idValid(patchId) || !patchById.has(patchId) || patchClaimsByPatch.has(patchId)) {
        fail('CLAIM_SET_INVALID', 'Patch-distance claim has an invalid or duplicate patch id', safeClaimId);
      } else {
        patchClaimsByPatch.set(patchId, claim);
      }
    } else if (claim.inputs.patchId !== null) {
      fail('SCHEMA_INVALID', 'Only patch-distance claims may carry a patch id', safeClaimId);
    }
    const entries = claimsByKind.get(claim.claimKind);
    if (entries) entries.push(claim);
    else claimsByKind.set(claim.claimKind, [claim]);
  }

  for (const kind of globalClaimKinds) {
    if (claimsByKind.get(kind)?.length !== 1) {
      fail('CLAIM_SET_INVALID', `Exactly one ${kind} claim is required`);
    }
  }
  if (patchClaimsByPatch.size !== patchById.size) {
    fail('PATCH_COVERAGE_INVALID', 'Every target patch requires exactly one patch-distance claim');
  }

  const schemaClaim = singleClaim(claimsByKind, 'schema-validity');
  const schema = claimOutput(claimsByKind, 'schema-validity');
  if (
    schemaClaim !== null &&
    schema !== null &&
    (schema.valid !== true ||
      schema.canonicalInputSha256 !== target.canonicalInputSha256 ||
      schema.aliasConflictCount !== '0' ||
      schema.nonFiniteParameterCount !== '0' ||
      schema.nonIntegralIntegerCount !== '0' ||
      schema.outOfBoundsParameterCount !== '0' ||
      schema.unknownParameterCount !== '0')
  ) {
    fail('CLAIM_FAILED', 'Schema-validity output does not prove the canonical input valid', schemaClaim.claimId);
  }

  const targetValidityClaim = singleClaim(claimsByKind, 'target-validity');
  const targetValidity = claimOutput(claimsByKind, 'target-validity');
  if (targetValidityClaim !== null && targetValidity !== null) {
    const minimumThicknessLower = uint(targetValidity.minimumThicknessLowerPm);
    const minimumFeatureSeparation =
      targetValidity.minimumFeatureSeparationLowerPm === null
        ? null
        : uint(targetValidity.minimumFeatureSeparationLowerPm);
    const featureSeparationValid =
      featureCount !== null && featureCount < 2n
        ? targetValidity.minimumFeatureSeparationStatus === 'not-applicable' &&
          targetValidity.minimumFeatureSeparationLowerPm === null &&
          hashValid(targetValidity.minimumFeatureSeparationWitnessSha256)
        : targetValidity.minimumFeatureSeparationStatus === 'proven' &&
          minimumFeatureSeparation !== null &&
          minimumFeatureSeparation > 0n &&
          hashValid(targetValidity.minimumFeatureSeparationWitnessSha256);
    if (
      targetValidity.status !== 'proven-valid' ||
      targetValidity.featurePartitionSha256 !== target.featurePartitionSha256 ||
      targetValidity.adjacencyClosed !== true ||
      targetValidity.branchPartitionComplete !== true ||
      targetValidity.featureCurtainsComplete !== true ||
      targetValidity.geometryEmbedded !== true ||
      targetValidity.noUnintendedSelfIntersections !== true ||
      targetValidity.patchDomainsRegular !== true ||
      targetValidity.scanComplete !== true ||
      targetValidity.topologyRegimeMatches !== true ||
      minimumThicknessLower === null ||
      requiredThickness === null ||
      minimumThicknessLower < requiredThickness ||
      !featureSeparationValid
    ) {
      fail('TARGET_INVALID', 'Target-validity output is incomplete or contradicts the target', targetValidityClaim.claimId);
    }
  }

  const evaluatorClaim = singleClaim(claimsByKind, 'evaluator-support');
  const evaluator = claimOutput(claimsByKind, 'evaluator-support');
  let evaluatorParityUpper: bigint | null = null;
  if (evaluatorClaim !== null && evaluator !== null) {
    evaluatorParityUpper = uint(evaluator.maxParityErrorUpperPm);
    if (
      evaluator.canonicalInputSha256 !== target.canonicalInputSha256 ||
      evaluator.styleSpecSha256 !== target.styleSpecSha256 ||
      !hashValid(evaluator.cpuEvaluatorSha256) ||
      !hashValid(evaluator.wgslEvaluatorSha256) ||
      !hashValid(evaluator.validatedEvaluatorSha256) ||
      evaluator.continuousCorrespondenceAvailable !== true ||
      evaluator.convergenceSupportedForInput !== true ||
      evaluator.evaluatorParityProven !== true ||
      evaluator.scanComplete !== true ||
      evaluator.styleSemanticsComplete !== true ||
      evaluator.validatedEvaluatorAvailable !== true ||
      evaluatorParityUpper === null
    ) {
      fail('CLAIM_FAILED', 'Evaluator-support output is incomplete or unbound', evaluatorClaim.claimId);
    }
  }

  const parseClaim = singleClaim(claimsByKind, 'artifact-parse');
  const parse = claimOutput(claimsByKind, 'artifact-parse');
  if (
    parseClaim !== null &&
    parse !== null &&
    (parseClaim.methodId !== artifact.parserMethod ||
      parseClaim.methodVersion !== BINARY_STL_PARSER_VERSION ||
      parseClaim.proofArtifact.sha256 !== artifact.parserEvidenceSha256 ||
      parse.artifactManifestSha256 !== root.artifact.artifactManifestSha256 ||
      parse.byteLength !== artifact.byteLength ||
      parse.byteSha256 !== artifact.byteSha256 ||
      parse.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      parse.parserEvidenceSha256 !== artifact.parserEvidenceSha256 ||
      parse.parserOutputSha256 !== artifact.parserOutputSha256 ||
      parse.transformStackSha256 !== artifact.transformStackSha256 ||
      parse.triangleCount !== artifact.triangleCount ||
      parse.units !== artifact.units ||
      parse.roundTripVerified !== true ||
      parse.scanComplete !== true)
  ) {
    fail('ARTIFACT_INVALID', 'Artifact-parse claim does not exactly bind the final parsed STL', parseClaim.claimId);
  }

  const patchSubsetEntries: JsonRecord[] = [];
  const patchSubsetCounts: (bigint | null)[] = [];
  const patchMeshToTargetBounds: (bigint | null)[] = [];
  const patchTargetToMeshBounds: (bigint | null)[] = [];
  const patchSubsetHashes = new Set<string>();
  for (const patchId of patchIds) {
    const patch = patchById.get(patchId);
    const claim = patchClaimsByPatch.get(patchId);
    if (patch === undefined || claim === undefined) continue;
    const output = claim.outputs as JsonRecord;
    const subsetCount = uint(output.artifactTriangleSubsetCount, MAX_COUNT);
    const meshToTargetUpper = uint(output.meshToTargetUpperPm);
    const targetToMeshUpper = uint(output.targetToMeshUpperPm);
    patchSubsetCounts.push(subsetCount);
    patchMeshToTargetBounds.push(meshToTargetUpper);
    patchTargetToMeshBounds.push(targetToMeshUpper);
    if (
      output.patchId !== patchId ||
      output.evaluatorSha256 !== patch.evaluatorSha256 ||
      output.domainSha256 !== patch.domainSha256 ||
      output.patchAdjacencySha256 !== patch.adjacencySha256 ||
      output.featurePartitionSha256 !== patch.featurePartitionSha256 ||
      !hashValid(output.artifactTriangleSubsetSha256) ||
      !hashValid(output.artifactBoundarySetSha256) ||
      !hashValid(output.boundarySubdomainSha256) ||
      subsetCount === null ||
      subsetCount <= 0n ||
      meshToTargetUpper === null ||
      targetToMeshUpper === null ||
      output.boundaryCorrespondenceComplete !== true ||
      output.domainCoverageComplete !== true ||
      output.featureCorrespondenceComplete !== true ||
      output.geometricBoundsIncludeNumericalErrors !== false ||
      output.scanComplete !== true
    ) {
      fail('PATCH_COVERAGE_INVALID', 'Patch-distance claim is incomplete or incorrectly bound', claim.claimId);
    }
    if (
      typeof output.artifactTriangleSubsetSha256 === 'string' &&
      patchSubsetHashes.has(output.artifactTriangleSubsetSha256)
    ) {
      fail('PATCH_COVERAGE_INVALID', 'Patch triangle-subset hashes must be unique', claim.claimId);
    } else if (typeof output.artifactTriangleSubsetSha256 === 'string') {
      patchSubsetHashes.add(output.artifactTriangleSubsetSha256);
    }
    patchSubsetEntries.push({
      artifactBoundarySetSha256: output.artifactBoundarySetSha256,
      artifactTriangleSubsetCount: output.artifactTriangleSubsetCount,
      artifactTriangleSubsetSha256: output.artifactTriangleSubsetSha256,
      boundarySubdomainSha256: output.boundarySubdomainSha256,
      patchId,
    });
  }

  const coverageClaim = singleClaim(claimsByKind, 'artifact-coverage');
  const coverage = claimOutput(claimsByKind, 'artifact-coverage');
  let coverageMeshToTargetUpper: bigint | null = null;
  if (coverageClaim !== null && coverage !== null) {
    coverageMeshToTargetUpper = uint(coverage.meshToTargetUpperPm);
    const subsetCountSum = add(patchSubsetCounts);
    const maximumPatchMeshToTarget = maximum(patchMeshToTargetBounds);
    if (
      coverage.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      coverage.coveredTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      coverage.artifactTriangleCount !== artifact.triangleCount ||
      coverage.continuouslyCoveredTriangleCount !== artifact.triangleCount ||
      coverage.unassignedTriangleCount !== '0' ||
      coverage.duplicateTriangleAssignmentCount !== '0' ||
      coverage.geometricBoundsIncludeNumericalErrors !== false ||
      coverage.scanComplete !== true ||
      coverageMeshToTargetUpper === null ||
      maximumPatchMeshToTarget === null ||
      coverageMeshToTargetUpper < maximumPatchMeshToTarget ||
      artifactTriangleCount === null ||
      subsetCountSum !== artifactTriangleCount ||
      coverage.patchSubsetManifestSha256 !==
        computePatchSubsetManifestSha256(patchSubsetEntries)
    ) {
      fail('PATCH_COVERAGE_INVALID', 'Artifact coverage is not a complete one-to-one patch partition', coverageClaim.claimId);
    }
  }

  const topologyClaim = singleClaim(claimsByKind, 'topology');
  const topology = claimOutput(claimsByKind, 'topology');
  if (topologyClaim !== null && topology !== null) {
    const triangleCount = uint(topology.triangleCount, MAX_COUNT);
    const validTriangleCount = uint(topology.validTriangleCount, MAX_COUNT);
    const vertexCount = uint(topology.uniqueVertexCount, MAX_COUNT);
    const edgeCount = uint(topology.uniqueEdgeCount, MAX_COUNT);
    const componentCount = uint(topology.componentCount, MAX_COUNT);
    const genus = uint(topology.genus, MAX_COUNT);
    const euler = integer(topology.eulerCharacteristic, MAX_COUNT);
    const expectedGenus = expectedTargetGenus;
    const combinatoricsValid =
      vertexCount !== null &&
      edgeCount !== null &&
      validTriangleCount !== null &&
      expectedGenus !== null &&
      euler !== null &&
      vertexCount > 0n &&
      edgeCount > 0n &&
      edgeCount <= 3n * validTriangleCount &&
      vertexCount <= 3n * validTriangleCount &&
      3n * validTriangleCount === 2n * edgeCount &&
      vertexCount - edgeCount + validTriangleCount === euler &&
      euler === 2n - 2n * expectedGenus;
    if (
      topologyClaim.methodId !== 'parsed-artifact-topology' ||
      topologyClaim.methodVersion !== PARSED_TOPOLOGY_PROOF_VERSION ||
      topologyClaim.proofArtifact.sha256 !== topology.evidenceSha256 ||
      topology.kernelVersion !== PARSED_TOPOLOGY_PROOF_VERSION ||
      topology.kernelProofSha256 !== PARSED_TOPOLOGY_PROOF_SHA256 ||
      topology.vertexIdentityPolicy !== EXACT_STL_VERTEX_IDENTITY_POLICY ||
      topology.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      !hashValid(topology.vertexSetSha256) ||
      !hashValid(topology.edgeSetSha256) ||
      !hashValid(topology.faceSetSha256) ||
      !hashValid(topology.evidenceSha256) ||
      triangleCount === null ||
      triangleCount !== artifactTriangleCount ||
      validTriangleCount !== artifactTriangleCount ||
      componentCount !== 1n ||
      expectedGenus === null ||
      genus !== expectedGenus ||
      topology.boundaryEdgeCount !== '0' ||
      topology.degenerateTriangleCount !== '0' ||
      topology.nonManifoldEdgeCount !== '0' ||
      topology.nonManifoldVertexCount !== '0' ||
      topology.orientationMismatchCount !== '0' ||
      topology.closed !== true ||
      topology.manifold !== true ||
      topology.consistentlyOriented !== true ||
      topology.outwardFacing !== true ||
      topology.scanComplete !== true ||
      topology.volumeSign !== 'positive-proven' ||
      !combinatoricsValid
    ) {
      fail('TOPOLOGY_INVALID', 'Topology claim does not prove the expected closed oriented manifold', topologyClaim.claimId);
    }
  }

  const selfClaim = singleClaim(claimsByKind, 'self-intersection');
  const self = claimOutput(claimsByKind, 'self-intersection');
  if (selfClaim !== null && self !== null) {
    const candidatePairCount = uint(self.candidatePairCount, MAX_COUNT);
    const intersectionPairCount = uint(self.intersectionPairCountLowerBound, MAX_COUNT);
    const maximumPairs =
      artifactTriangleCount === null
        ? null
        : (artifactTriangleCount * (artifactTriangleCount - 1n)) / 2n;
    if (
      selfClaim.methodId !== 'parsed-artifact-self-intersection' ||
      selfClaim.methodVersion !== PARSED_SELF_INTERSECTION_PROOF_VERSION ||
      selfClaim.proofArtifact.sha256 !== self.evidenceSha256 ||
      self.kernelVersion !== PARSED_SELF_INTERSECTION_PROOF_VERSION ||
      self.kernelProofSha256 !== PARSED_SELF_INTERSECTION_PROOF_SHA256 ||
      self.narrowPhaseProofSha256 !== EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256 ||
      self.adjacencyExclusionSemantics !== SELF_INTERSECTION_ADJACENCY_SEMANTICS ||
      self.coplanarOverlapSemantics !== SELF_INTERSECTION_COPLANAR_SEMANTICS ||
      self.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      self.triangleCount !== artifact.triangleCount ||
      !hashValid(self.candidatePairSetSha256) ||
      !hashValid(self.evidenceSha256) ||
      candidatePairCount === null ||
      maximumPairs === null ||
      candidatePairCount > maximumPairs ||
      intersectionPairCount !== 0n ||
      self.scanComplete !== true ||
      self.selfIntersectionFree !== true
    ) {
      fail('SELF_INTERSECTION_INVALID', 'Self-intersection claim is incomplete or uses different semantics', selfClaim.claimId);
    }
  }

  const adjacencyClaim = singleClaim(claimsByKind, 'patch-adjacency');
  const adjacency = claimOutput(claimsByKind, 'patch-adjacency');
  if (
    adjacencyClaim !== null &&
    adjacency !== null &&
    (adjacency.targetAdjacencySha256 !== target.patchAdjacencySha256 ||
      adjacency.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      !hashValid(adjacency.artifactAdjacencyGraphSha256) ||
      !hashValid(adjacency.artifactToTargetMappingSha256) ||
      adjacency.complete !== true ||
      adjacency.scanComplete !== true)
  ) {
    fail('PATCH_COVERAGE_INVALID', 'Patch adjacency is incomplete or unbound', adjacencyClaim.claimId);
  }

  const featureClaim = singleClaim(claimsByKind, 'feature-correspondence');
  const feature = claimOutput(claimsByKind, 'feature-correspondence');
  if (
    featureClaim !== null &&
    feature !== null &&
    (feature.featurePartitionSha256 !== target.featurePartitionSha256 ||
      feature.expectedFeatureCount !== target.featureManifest.featureCount ||
      feature.expectedCreaseOnlyFeatureCount !==
        target.featureManifest.creaseOnlyFeatureCount ||
      feature.expectedCurtainFeatureCount !== target.featureManifest.curtainFeatureCount ||
      feature.expectedSideFeatureCount !== target.featureManifest.sideFeatureCount ||
      feature.expectedCurtainAndSideFeatureCount !==
        target.featureManifest.curtainAndSideFeatureCount ||
      feature.mappedFeatureCount !== target.featureManifest.featureCount ||
      feature.satisfiedCreaseOnlyFeatureCount !==
        target.featureManifest.creaseOnlyFeatureCount ||
      feature.satisfiedCurtainFeatureCount !== target.featureManifest.curtainFeatureCount ||
      feature.satisfiedSideFeatureCount !== target.featureManifest.sideFeatureCount ||
      feature.satisfiedCurtainAndSideFeatureCount !==
        target.featureManifest.curtainAndSideFeatureCount ||
      feature.surfaceAssignmentManifestSha256 !==
        target.featureManifest.featureSurfaceAssignmentManifestSha256 ||
      feature.surfaceAssignmentSemantics !== FEATURE_SURFACE_ASSIGNMENT_SEMANTICS ||
      feature.unmappedFeatureCount !== '0' ||
      feature.duplicateFeatureMappingCount !== '0' ||
      !hashValid(feature.mappingSetSha256) ||
      feature.scanComplete !== true)
  ) {
    fail('FEATURE_MAPPING_INVALID', 'Feature correspondence does not map every declared feature exactly once', featureClaim.claimId);
  }

  const thicknessClaim = singleClaim(claimsByKind, 'thickness');
  const thickness = claimOutput(claimsByKind, 'thickness');
  let thicknessUncertainty: bigint | null = null;
  if (thicknessClaim !== null && thickness !== null) {
    const geometricMinimum = uint(thickness.geometricMinimumLowerPm);
    thicknessUncertainty = uint(thickness.numericalUncertaintyUpperPm);
    const certifiedMinimum = uint(thickness.certifiedMinimumLowerPm);
    if (
      thickness.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256 ||
      thickness.semantics !== target.wallThicknessSemantics ||
      thickness.scanComplete !== true ||
      geometricMinimum === null ||
      thicknessUncertainty === null ||
      certifiedMinimum === null ||
      geometricMinimum < thicknessUncertainty ||
      certifiedMinimum !== geometricMinimum - thicknessUncertainty ||
      requiredThickness === null ||
      certifiedMinimum < requiredThickness
    ) {
      fail('THICKNESS_INVALID', 'Thickness lower bound is not conservatively eroded or sufficient', thicknessClaim.claimId);
    }
  }

  const numericalClaim = singleClaim(claimsByKind, 'numerical-budget');
  const numerical = claimOutput(claimsByKind, 'numerical-budget');
  let hausdorffNumericalUpper: bigint | null = null;
  if (numericalClaim !== null && numerical !== null) {
    hausdorffNumericalUpper = uint(numerical.hausdorffNumericalUpperPm);
    const thicknessNumericalUpper = uint(numerical.thicknessNumericalUncertaintyUpperPm);
    const components = numerical.components;
    const hausdorffComponents: (bigint | null)[] = [];
    const thicknessComponents: (bigint | null)[] = [];
    let componentsValid = Array.isArray(components) && components.length === REQUIRED_NUMERICAL_COMPONENTS.length;
    if (Array.isArray(components)) {
      components.forEach((component, index) => {
        if (!isRecord(component) || !hasExactKeys(component, NUMERICAL_COMPONENT_KEYS)) {
          componentsValid = false;
          return;
        }
        const componentId = REQUIRED_NUMERICAL_COMPONENTS[index];
        const registeredComponent = CERTIFICATION_NUMERICAL_COMPONENT_REGISTRY[componentId];
        const upper = uint(component.upperPm);
        const expectedSource =
          registeredComponent.sourceKind === 'target'
            ? root.target.targetSha256
            : registeredComponent.sourceKind === 'transform-stack'
              ? artifact.transformStackSha256
              : registeredComponent.sourceKind === 'artifact-bytes'
                ? artifact.byteSha256
                : artifact.parserProofSha256;
        if (
          component.componentId !== registeredComponent.componentId ||
          component.methodId !== registeredComponent.methodId ||
          component.methodVersion !== registeredComponent.methodVersion ||
          component.sourceSha256 !== expectedSource ||
          component.appliesToHausdorff !== registeredComponent.appliesToHausdorff ||
          component.appliesToThickness !== registeredComponent.appliesToThickness ||
          upper === null
        ) {
          componentsValid = false;
        }
        hausdorffComponents.push(upper);
        if (component.appliesToThickness === true) thicknessComponents.push(upper);
      });
    }
    const recomputedHausdorff = add(hausdorffComponents);
    const recomputedThickness = add(thicknessComponents);
    const targetEvaluatorIndex = REQUIRED_NUMERICAL_COMPONENTS.indexOf('target-evaluator');
    const targetEvaluatorUpper = hausdorffComponents[targetEvaluatorIndex] ?? null;
    if (
      numerical.compositionModel !== 'additive-conservative-no-independence' ||
      numerical.geometricBoundsIncludeNumericalErrors !== false ||
      !componentsValid ||
      hausdorffNumericalUpper === null ||
      thicknessNumericalUpper === null ||
      recomputedHausdorff !== hausdorffNumericalUpper ||
      recomputedThickness !== thicknessNumericalUpper ||
      thicknessUncertainty !== thicknessNumericalUpper ||
      evaluatorParityUpper === null ||
      targetEvaluatorUpper === null ||
      targetEvaluatorUpper < evaluatorParityUpper
    ) {
      fail('NUMERICAL_BUDGET_INVALID', 'Numerical budget is incomplete or does not conservatively compose', numericalClaim.claimId);
    }
  }

  const resourceClaim = singleClaim(claimsByKind, 'resource-completion');
  const resource = claimOutput(claimsByKind, 'resource-completion');
  if (resourceClaim !== null && resource !== null) {
    const verifiedClaimSet = root.claims
      .filter((claim) => claim.claimKind !== 'resource-completion')
      .map((claim) => ({ claimId: claim.claimId, claimSha256: claim.claimSha256 }));
    const expectedClaimSetSha256 = computeVerifiedClaimSetSha256(verifiedClaimSet);
    const workUnitCount = uint(resource.workUnitCount, MAX_PM);
    if (
      resource.claimSetSha256 !== expectedClaimSetSha256 ||
      resource.cancelled !== false ||
      resource.constraintRecoveryFailed !== false ||
      resource.featuresDropped !== '0' ||
      resource.memoryLimitExceeded !== false ||
      resource.proofInconclusive !== false ||
      resource.scanComplete !== true ||
      resource.timeLimitExceeded !== false ||
      resource.triangleLimitExceeded !== false ||
      workUnitCount === null ||
      workUnitCount <= 0n
    ) {
      fail('RESOURCE_INCOMPLETE', 'Resource-completion claim does not bind a complete non-degraded proof run', resourceClaim.claimId);
    }
  }

  if (!hashValid(root.bundleSha256) || root.bundleSha256 !== computeCertificationBundleSha256(root)) {
    fail('HASH_MISMATCH', 'Bundle digest does not cover the complete canonical manifest');
  }

  const declaredGeometricUpper = maximum([
    coverageMeshToTargetUpper,
    maximum(patchTargetToMeshBounds),
  ]);
  const declaredCombinedUpper = add([declaredGeometricUpper, hausdorffNumericalUpper]);
  if (
    declaredGeometricUpper === null ||
    hausdorffNumericalUpper === null ||
    declaredCombinedUpper === null
  ) {
    fail('NUMERICAL_BUDGET_INVALID', 'Combined geometric and numerical upper bound is not representable');
  } else if (requestedTolerance === null || declaredCombinedUpper > requestedTolerance) {
    fail('TOLERANCE_EXCEEDED', 'Declared geometric plus numerical upper bound exceeds requested tolerance');
  }

  if (failures.length > 0) return refused(failures);
  if (
    requestedTolerance === null ||
    declaredGeometricUpper === null ||
    hausdorffNumericalUpper === null ||
    declaredCombinedUpper === null
  ) {
    return malformed('Manifest arithmetic could not be completed');
  }
  return Object.freeze({
    status: 'unverified-structurally-consistent',
    certified: false,
    proofsVerified: false,
    implementationStatus: CERTIFICATION_CONSISTENCY_STATUS,
    bundleSha256: root.bundleSha256,
    targetSha256: root.target.targetSha256,
    artifactManifestSha256: root.artifact.artifactManifestSha256,
    requestedTolerancePm: root.requestedTolerancePm,
    declaredGeometricUpperPm: declaredGeometricUpper.toString(),
    declaredNumericalUpperPm: hausdorffNumericalUpper.toString(),
    declaredCombinedUpperPm: declaredCombinedUpper.toString(),
  });
}

/**
 * Total hostile-input boundary. Any unexpected post-parse semantic path fails
 * closed instead of leaking an exception or returning a partial assessment.
 */
export function assessUnverifiedCertificationManifestJson(
  source: unknown
): CertificationManifestDecision {
  try {
    return assessUnverifiedCertificationManifestJsonInternal(source);
  } catch {
    return refused([
      freezeFailure(
        'SCHEMA_INVALID',
        'Certification assessment encountered invalid data and failed closed'
      ),
    ]);
  }
}
