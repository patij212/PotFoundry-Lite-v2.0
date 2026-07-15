import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { domainSeparatedCanonicalJsonSha256 } from './canonicalCertificationJson';
import {
  certifyCompleteMappedArtifactGeometry,
  completeMappedGeometryTargetBindingForProof,
  type CompleteMappedArtifactGeometryOptions,
  type CompleteMappedArtifactGeometryResult,
  type CompleteMappedGeometryTargetBinding,
  type MappedPatchProofJob,
} from './completeMappedArtifactGeometry';
import type { FinalArtifactProofSession } from './finalArtifactProofSession';
import { sha256Utf8 } from './incrementalSha256';
import type { ParsedSelfIntersectionOptions } from './parsedArtifactSelfIntersection';
import type { ParsedTopologyOptions } from './parsedArtifactTopology';
import {
  assessParsedArtifactHeightIntegrity,
  type ParsedArtifactHeightIntegrityResult,
} from './parsedArtifactHeightIntegrity';
import {
  assessProofSessionStructuralIntegrity,
  type ProofSessionStructuralIntegrityResult,
} from './proofSessionStructuralIntegrity';
import { TARGET_SOLID_SPECIFICATION_SHA256 } from './targetSolidSpecification';

export const FINAL_STL_PARTIAL_CERTIFICATION_VERSION =
  'potfoundry.final-stl-partial-certification/v3' as const;
export const FINAL_STL_PARTIAL_CERTIFICATION_PROOF_SHA256 = sha256Utf8(
  [
    FINAL_STL_PARTIAL_CERTIFICATION_VERSION,
    'one authenticated final binary-STL byte session feeds both structural and mapped-geometry proofs',
    'the mapped target must be rederived from an authenticated abstract target-surface-complex capability; raw target JSON refuses',
    'abstract-complex provenance does not prove that caller-declared evaluator programs are the canonical style target',
    'expected boundary genus is derived from the canonical drain input: absent=0, present=1',
    'requested tolerance is at most 10000000 pm and geometric budget equals requested minus a caller-declared nongeometric reserve',
    'success requires exact topology, complete self-intersection scan, complete patch/triangle coverage, and continuous two-sided mapped-program distance',
    'final parsed binary32 z extrema are compared to authenticated target endpoints with exact outward integer-picometre arithmetic',
    'scope is intentionally partial: canonical target construction/geometric validity, generated evaluator parity, features, radial/drain/rim dimensions, and physical thickness remain unproven',
    'there is no certified=true result in this module',
  ].join('\n')
);

type TopologyResourceOptions = Omit<
  ParsedTopologyOptions,
  'cancellationFlag' | 'progressCounter'
>;
type SelfIntersectionResourceOptions = Omit<
  ParsedSelfIntersectionOptions,
  'cancellationFlag' | 'progressCounter'
>;

export interface FinalStlPartialCertificationOptions {
  readonly requestedTolerancePm: bigint;
  readonly reservedNonGeometricMarginPm: bigint;
  readonly maximumHeightErrorPm?: bigint;
  readonly maxAssignmentBytes?: number;
  readonly maxTotalWorkCells?: number;
  readonly maxTotalEvaluatorWorkUnits?: number;
  readonly maxTotalPartitionWorkUnits?: number;
  readonly maxElapsedMilliseconds?: number;
  readonly maxStructuralBytes?: number;
  readonly maxStructuralWorkUnits?: number;
  readonly patchProof?: CompleteMappedArtifactGeometryOptions['patchProof'];
  readonly topology?: TopologyResourceOptions;
  readonly selfIntersection?: SelfIntersectionResourceOptions;
  readonly cancellationFlag?: Int32Array;
}

export type FinalStlPartialCertificationErrorCode =
  | 'INVALID_INPUT'
  | 'BUDGET_INVALID'
  | 'STRUCTURAL_REFUSED'
  | 'STRUCTURAL_INVALID'
  | 'GEOMETRY_REFUSED'
  | 'DIMENSION_REFUSED'
  | 'TARGET_BINDING_INVALID'
  | 'EVIDENCE_INCONSISTENT';

export class FinalStlPartialCertificationError extends Error {
  readonly code: FinalStlPartialCertificationErrorCode;

  constructor(code: FinalStlPartialCertificationErrorCode, message: string) {
    super(message);
    this.name = 'FinalStlPartialCertificationError';
    this.code = code;
  }
}

export interface FinalStlPartialCertificationResult {
  readonly proofVersion: typeof FINAL_STL_PARTIAL_CERTIFICATION_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly certified: false;
  readonly implementationStatus: 'partial-final-stl-proof-not-a-complete-certificate';
  readonly canonicalInputSha256: string;
  readonly targetSha256: string;
  readonly targetSolidSpecificationSha256: string;
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly requestedTolerancePm: string;
  readonly reservedNonGeometricMarginPm: string;
  readonly geometricBudgetPm: string;
  readonly geometricTwoSidedUpperPm: string;
  readonly geometryPlusReservedUpperPm: string;
  readonly structural: ProofSessionStructuralIntegrityResult;
  readonly geometry: CompleteMappedArtifactGeometryResult;
  readonly height: ParsedArtifactHeightIntegrityResult;
  readonly provenClaims: readonly [
    'artifact-parse',
    'artifact-coverage',
    'patch-distance',
    'topology',
    'self-intersection',
    'height-dimension',
  ];
  readonly missingClaims: readonly [
    'canonical-target-construction-and-geometric-validity',
    'generated-evaluator-parity',
    'feature-correspondence',
    'radial-drain-rim-and-feature-dimensions',
    'physical-thickness',
    'verified-nongeometric-budget',
  ];
}

const TRUE_TOLERANCE_PM = 10_000_000n;
const HARD_FINAL_ELAPSED_MILLISECONDS = 30_000;

function refuse(code: FinalStlPartialCertificationErrorCode, message: string): never {
  throw new FinalStlPartialCertificationError(code, message);
}

function snapshotRecord(
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse('INVALID_INPUT', `${label} must be an ordinary data record`);
  }
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    refuse('INVALID_INPUT', `${label} could not be inspected safely`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    refuse('INVALID_INPUT', `${label} must not have a custom prototype`);
  }
  const allowed = new Set(allowedKeys);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      refuse('INVALID_INPUT', `${label} has an unknown field`);
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      refuse('INVALID_INPUT', `${label}.${key} could not be inspected safely`);
    }
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      refuse('INVALID_INPUT', `${label} must contain only enumerable data properties`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function optionalRecord(
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Readonly<Record<string, unknown>> | undefined {
  return value === undefined ? undefined : snapshotRecord(value, allowedKeys, label);
}

function snapshotOptions(
  value: FinalStlPartialCertificationOptions
): FinalStlPartialCertificationOptions {
  const top = snapshotRecord(
    value,
    [
      'cancellationFlag',
      'maxAssignmentBytes',
      'maxElapsedMilliseconds',
      'maxStructuralBytes',
      'maxStructuralWorkUnits',
      'maxTotalWorkCells',
      'maxTotalEvaluatorWorkUnits',
      'maxTotalPartitionWorkUnits',
      'maximumHeightErrorPm',
      'patchProof',
      'requestedTolerancePm',
      'reservedNonGeometricMarginPm',
      'selfIntersection',
      'topology',
    ],
    'partial certification options'
  );
  const patchProof = optionalRecord(
    top.patchProof,
    ['maxDepth', 'maxEvaluatorWorkUnits', 'maxWorkCells', 'partition'],
    'patchProof'
  );
  const partition = optionalRecord(
    patchProof?.partition,
    [
      'maxBroadPhasePairChecks',
      'maxBuildWork',
      'maxBvhNodes',
      'maxPairChecks',
      'maxTraversalVisits',
      'maxTriangles',
      'deadlineEpochMilliseconds',
    ],
    'patchProof.partition'
  );
  const topology = optionalRecord(
    top.topology,
    [
      'deadlineEpochMilliseconds',
      'maxEdgeRecordBytes',
      'maxLinkUnionBytes',
      'maxTriangleVertexBytes',
      'maxUniqueVertices',
      'maxWorkUnits',
    ],
    'topology'
  );
  const selfIntersection = optionalRecord(
    top.selfIntersection,
    [
      'leafSize',
      'maxBroadPhasePairChecks',
      'maxBuildWork',
      'maxBvhBytes',
      'maxCandidatePairs',
      'maxFoundPairs',
      'maxTraversalVisits',
      'deadlineEpochMilliseconds',
    ],
    'selfIntersection'
  );
  return Object.freeze({
    requestedTolerancePm: top.requestedTolerancePm as bigint,
    reservedNonGeometricMarginPm: top.reservedNonGeometricMarginPm as bigint,
    maximumHeightErrorPm: top.maximumHeightErrorPm as bigint | undefined,
    maxAssignmentBytes: top.maxAssignmentBytes as number | undefined,
    maxTotalWorkCells: top.maxTotalWorkCells as number | undefined,
    maxTotalEvaluatorWorkUnits: top.maxTotalEvaluatorWorkUnits as number | undefined,
    maxTotalPartitionWorkUnits: top.maxTotalPartitionWorkUnits as number | undefined,
    maxElapsedMilliseconds: top.maxElapsedMilliseconds as number | undefined,
    maxStructuralBytes: top.maxStructuralBytes as number | undefined,
    maxStructuralWorkUnits: top.maxStructuralWorkUnits as number | undefined,
    patchProof:
      patchProof === undefined
        ? undefined
        : (Object.freeze({
            maxDepth: patchProof.maxDepth,
            maxEvaluatorWorkUnits: patchProof.maxEvaluatorWorkUnits,
            maxWorkCells: patchProof.maxWorkCells,
            partition:
              partition === undefined ? undefined : Object.freeze({ ...partition }),
          }) as FinalStlPartialCertificationOptions['patchProof']),
    topology:
      topology === undefined
        ? undefined
        : (Object.freeze({ ...topology }) as TopologyResourceOptions),
    selfIntersection:
      selfIntersection === undefined
        ? undefined
        : (Object.freeze({ ...selfIntersection }) as SelfIntersectionResourceOptions),
    cancellationFlag: top.cancellationFlag as Int32Array | undefined,
  });
}

/**
 * Compose the strongest currently implemented final-STL checks while staying
 * honest about the claims that are still missing. This function can never
 * return a complete 0.01 mm certificate.
 */
export function proveFinalStlMappedGeometryAndStructure(
  session: FinalArtifactProofSession,
  canonicalInput: CanonicalTargetInputBinding,
  target: CompleteMappedGeometryTargetBinding,
  jobs: readonly MappedPatchProofJob[],
  options: FinalStlPartialCertificationOptions
): FinalStlPartialCertificationResult {
  const optionSnapshot = snapshotOptions(options);
  const maxElapsedMilliseconds =
    optionSnapshot.maxElapsedMilliseconds ?? HARD_FINAL_ELAPSED_MILLISECONDS;
  if (
    !Number.isSafeInteger(maxElapsedMilliseconds) ||
    maxElapsedMilliseconds <= 0 ||
    maxElapsedMilliseconds > HARD_FINAL_ELAPSED_MILLISECONDS
  ) {
    refuse(
      'BUDGET_INVALID',
      `maxElapsedMilliseconds must be in [1, ${HARD_FINAL_ELAPSED_MILLISECONDS}]`
    );
  }
  const finalDeadlineEpochMilliseconds = Date.now() + maxElapsedMilliseconds;
  const remainingElapsedMilliseconds = (): number => {
    const remaining = finalDeadlineEpochMilliseconds - Date.now();
    if (remaining <= 0) {
      refuse('BUDGET_INVALID', 'Final partial proof exceeded its hard elapsed-time deadline');
    }
    return Math.max(1, Math.floor(remaining));
  };
  const requested = optionSnapshot.requestedTolerancePm;
  const reserved = optionSnapshot.reservedNonGeometricMarginPm;
  if (
    typeof requested !== 'bigint' ||
    typeof reserved !== 'bigint' ||
    requested <= 0n ||
    requested > TRUE_TOLERANCE_PM ||
    reserved < 0n ||
    reserved >= requested
  ) {
    refuse('BUDGET_INVALID', 'Tolerance/reserve must satisfy 0 <= reserve < requested <= 10000000 pm');
  }
  const geometricBudget = requested - reserved;
  const maximumHeightError =
    optionSnapshot.maximumHeightErrorPm ?? requested;

  let inputSnapshot: ReturnType<typeof canonicalTargetInputForProof>;
  try {
    inputSnapshot = canonicalTargetInputForProof(canonicalInput);
  } catch (error) {
    refuse(
      'TARGET_BINDING_INVALID',
      error instanceof Error ? error.message : 'Canonical input binding refused'
    );
  }
  let targetSnapshot: CompleteMappedGeometryTargetBinding;
  try {
    targetSnapshot = completeMappedGeometryTargetBindingForProof(target);
  } catch (error) {
    refuse(
      'TARGET_BINDING_INVALID',
      error instanceof Error ? error.message : 'Mapped target binding refused'
    );
  }
  if (
    targetSnapshot.authenticatedSurfaceComplexProvenance !== true ||
    targetSnapshot.targetDefinitionOrigin !== 'authenticated-target-surface-complex'
  ) {
    refuse(
      'TARGET_BINDING_INVALID',
      'Partial final proof requires authenticated target-surface-complex provenance'
    );
  }
  if (
    targetSnapshot.canonicalInputSha256 !== inputSnapshot.canonicalInputSha256 ||
    targetSnapshot.targetSolidSpecificationSha256 !== TARGET_SOLID_SPECIFICATION_SHA256
  ) {
    refuse('TARGET_BINDING_INVALID', 'Mapped target does not match the canonical input/G0 policy');
  }
  const expectedGenus = canonicalInput.geometry.geometry.r_drain > 0 ? 1 : 0;

  let structural: ProofSessionStructuralIntegrityResult;
  try {
    structural = assessProofSessionStructuralIntegrity(
      session,
      { componentCount: 1, genus: expectedGenus },
      {
        topology: {
          ...optionSnapshot.topology,
          cancellationFlag: optionSnapshot.cancellationFlag,
        },
        selfIntersection: {
          ...optionSnapshot.selfIntersection,
          cancellationFlag: optionSnapshot.cancellationFlag,
        },
        maxTotalBytes: optionSnapshot.maxStructuralBytes,
        maxTotalWorkUnits: optionSnapshot.maxStructuralWorkUnits,
        maxElapsedMilliseconds: remainingElapsedMilliseconds(),
      }
    );
  } catch (error) {
    refuse(
      'STRUCTURAL_REFUSED',
      error instanceof Error ? error.message : 'Structural proof refused'
    );
  }
  if (!structural.structurallyValid || !structural.scanComplete) {
    refuse('STRUCTURAL_INVALID', 'Final STL failed complete topology/embeddedness proof');
  }

  let geometry: CompleteMappedArtifactGeometryResult;
  try {
    geometry = certifyCompleteMappedArtifactGeometry(session, target, jobs, {
      maximumGeometricUpperPm: geometricBudget,
      maxAssignmentBytes: optionSnapshot.maxAssignmentBytes,
      maxTotalWorkCells: optionSnapshot.maxTotalWorkCells,
      maxTotalEvaluatorWorkUnits: optionSnapshot.maxTotalEvaluatorWorkUnits,
      maxTotalPartitionWorkUnits: optionSnapshot.maxTotalPartitionWorkUnits,
      maxElapsedMilliseconds: remainingElapsedMilliseconds(),
      patchProof: optionSnapshot.patchProof,
      cancellationFlag: optionSnapshot.cancellationFlag,
    });
  } catch (error) {
    refuse('GEOMETRY_REFUSED', error instanceof Error ? error.message : 'Geometry proof refused');
  }
  if (
    geometry.canonicalInputSha256 !== inputSnapshot.canonicalInputSha256 ||
    geometry.targetSolidSpecificationSha256 !== TARGET_SOLID_SPECIFICATION_SHA256 ||
    geometry.authenticatedSurfaceComplexProvenance !== true ||
    geometry.targetDefinitionOrigin !== 'authenticated-target-surface-complex' ||
    geometry.targetSurfaceComplexSha256 !== targetSnapshot.targetSurfaceComplexSha256
  ) {
    refuse('TARGET_BINDING_INVALID', 'Mapped target does not match the canonical input/G0 policy');
  }
  if (
    geometry.artifactByteSha256 !== structural.artifactByteSha256 ||
    geometry.parsedTriangleSetSha256 !== structural.parsedTriangleSetSha256 ||
    geometry.artifactTriangleCount !== structural.triangleCount
  ) {
    refuse('EVIDENCE_INCONSISTENT', 'Structural and geometry proofs describe different artifacts');
  }

  let height: ParsedArtifactHeightIntegrityResult;
  try {
    remainingElapsedMilliseconds();
    height = assessParsedArtifactHeightIntegrity(
      session,
      canonicalInput,
      maximumHeightError
    );
    remainingElapsedMilliseconds();
  } catch (error) {
    refuse(
      'DIMENSION_REFUSED',
      error instanceof Error ? error.message : 'Height dimension proof refused'
    );
  }
  if (
    height.artifactByteSha256 !== structural.artifactByteSha256 ||
    height.parsedTriangleSetSha256 !== structural.parsedTriangleSetSha256 ||
    height.canonicalInputSha256 !== inputSnapshot.canonicalInputSha256
  ) {
    refuse('EVIDENCE_INCONSISTENT', 'Height proof describes different target or artifact inputs');
  }
  const geometricUpper = BigInt(geometry.geometricTwoSidedUpperPm);
  const geometryPlusReserved = geometricUpper + reserved;
  if (geometryPlusReserved > requested) {
    refuse('EVIDENCE_INCONSISTENT', 'Geometry plus reserved margin exceeds requested tolerance');
  }

  const provenClaims = Object.freeze([
    'artifact-parse',
    'artifact-coverage',
    'patch-distance',
    'topology',
    'self-intersection',
    'height-dimension',
  ] as const);
  const missingClaims = Object.freeze([
    'canonical-target-construction-and-geometric-validity',
    'generated-evaluator-parity',
    'feature-correspondence',
    'radial-drain-rim-and-feature-dimensions',
    'physical-thickness',
    'verified-nongeometric-budget',
  ] as const);
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.final-stl-partial-certification/evidence/v1',
    {
      artifactByteSha256: structural.artifactByteSha256,
      canonicalInputSha256: inputSnapshot.canonicalInputSha256,
      certified: false,
      geometricBudgetPm: geometricBudget.toString(),
      geometricTwoSidedUpperPm: geometry.geometricTwoSidedUpperPm,
      geometryEvidenceSha256: geometry.evidenceSha256,
      geometryPlusReservedUpperPm: geometryPlusReserved.toString(),
      heightEvidenceSha256: height.evidenceSha256,
      implementationStatus: 'partial-final-stl-proof-not-a-complete-certificate',
      missingClaims,
      parsedTriangleSetSha256: structural.parsedTriangleSetSha256,
      proofMethodSha256: FINAL_STL_PARTIAL_CERTIFICATION_PROOF_SHA256,
      proofVersion: FINAL_STL_PARTIAL_CERTIFICATION_VERSION,
      provenClaims,
      requestedTolerancePm: requested.toString(),
      requestedMaximumHeightErrorPm: maximumHeightError.toString(),
      reservedNonGeometricMarginPm: reserved.toString(),
      structuralEvidenceSha256: structural.evidenceSha256,
      targetSha256: geometry.targetSha256,
      targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    }
  );
  return Object.freeze({
    proofVersion: FINAL_STL_PARTIAL_CERTIFICATION_VERSION,
    proofMethodSha256: FINAL_STL_PARTIAL_CERTIFICATION_PROOF_SHA256,
    evidenceSha256,
    certified: false,
    implementationStatus: 'partial-final-stl-proof-not-a-complete-certificate',
    canonicalInputSha256: inputSnapshot.canonicalInputSha256,
    targetSha256: geometry.targetSha256,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    artifactByteSha256: structural.artifactByteSha256,
    parsedTriangleSetSha256: structural.parsedTriangleSetSha256,
    requestedTolerancePm: requested.toString(),
    reservedNonGeometricMarginPm: reserved.toString(),
    geometricBudgetPm: geometricBudget.toString(),
    geometricTwoSidedUpperPm: geometry.geometricTwoSidedUpperPm,
    geometryPlusReservedUpperPm: geometryPlusReserved.toString(),
    structural,
    geometry,
    height,
    provenClaims,
    missingClaims,
  });
}
