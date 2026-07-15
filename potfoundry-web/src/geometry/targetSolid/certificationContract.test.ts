import { describe, expect, it } from 'vitest';

import {
  BINARY_STL_PARSER_PROOF_SHA256,
  BINARY_STL_PARSER_VERSION,
} from './binaryStlArtifact';
import {
  assessUnverifiedCertificationManifestJson,
  canonicalCertificationManifestJson,
  CERTIFICATION_ARTIFACT_MANIFEST_VERSION,
  CERTIFICATION_CLAIM_METHOD_REGISTRY,
  CERTIFICATION_MANIFEST_VERSION,
  CERTIFICATION_TARGET_MANIFEST_VERSION,
  CERTIFICATION_NUMERICAL_COMPONENT_REGISTRY,
  computeCertificationArtifactManifestSha256,
  computeCertificationBundleSha256,
  computeCertificationClaimSha256,
  computeCertificationTargetSha256,
  computePatchSubsetManifestSha256,
  computeVerifiedClaimSetSha256,
  EXACT_STL_VERTEX_IDENTITY_POLICY,
  FEATURE_SURFACE_ASSIGNMENT_SEMANTICS,
  PICOMETRES_PER_MILLIMETRE,
  SELF_INTERSECTION_ADJACENCY_SEMANTICS,
  SELF_INTERSECTION_COPLANAR_SEMANTICS,
  TRUE_TOLERANCE_PM,
  type CertificationArtifactManifest,
  type CertificationClaimKind,
  type CertificationProofClaim,
  type CertificationTargetManifest,
  type UnverifiedCertificationManifest,
} from './certificationContract';
import { EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256 } from './exactTriangleIntersection';
import { sha256Utf8 } from './incrementalSha256';
import {
  PARSED_SELF_INTERSECTION_PROOF_SHA256,
  PARSED_SELF_INTERSECTION_PROOF_VERSION,
} from './parsedArtifactSelfIntersection';
import {
  PARSED_TOPOLOGY_PROOF_SHA256,
  PARSED_TOPOLOGY_PROOF_VERSION,
} from './parsedArtifactTopology';
import { TARGET_SOLID_SPECIFICATION_SHA256 } from './targetSolidSpecification';

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

const digest = (label: string): string => sha256Utf8(`certification-contract-test:${label}`);

const PATCH_SPECS = [
  ['bottom-top', 'bottom-top'],
  ['bottom-under', 'bottom-under'],
  ['inner-wall', 'inner-wall'],
  ['outer-wall', 'outer-wall'],
  ['top-rim', 'top-rim'],
] as const;

function makeClaim(
  claimKind: CertificationClaimKind,
  outputs: CertificationProofClaim['outputs'],
  bindings: {
    targetSha256: string;
    artifactManifestSha256: string;
    artifactByteSha256: string;
    parsedTriangleSetSha256: string;
  },
  options: {
    claimId?: string;
    patchId?: string;
    methodId?: string;
    methodVersion?: string;
    proofArtifactSha256?: string;
  } = {}
): CertificationProofClaim {
  const registered = CERTIFICATION_CLAIM_METHOD_REGISTRY[claimKind];
  const claim = {
    claimId: options.claimId ?? claimKind,
    claimKind,
    verdict: 'pass',
    evidenceSchemaVersion: registered.evidenceSchemaVersion,
    methodId: options.methodId ?? registered.methodId,
    methodVersion: options.methodVersion ?? registered.methodVersion,
    verifierBuildSha256: digest('verifier-build'),
    verifierSourceSha256: digest(`verifier-source:${claimKind}`),
    proofArtifact: {
      format: 'canonical-json',
      byteLength: '1024',
      sha256: options.proofArtifactSha256 ?? digest(`proof-artifact:${options.claimId ?? claimKind}`),
    },
    inputs: {
      ...bindings,
      patchId: options.patchId ?? null,
    },
    outputs,
    claimSha256: '',
  } satisfies CertificationProofClaim;
  return {
    ...claim,
    claimSha256: computeCertificationClaimSha256(claim),
  };
}

function buildManifest(): UnverifiedCertificationManifest {
  const featurePartitionSha256 = digest('feature-partition');
  const patches = PATCH_SPECS.map(([id, role]) => ({
    id,
    role,
    branchId: `branch:${id}`,
    evaluatorSha256: digest(`evaluator:${id}`),
    domainSha256: digest(`domain:${id}`),
    adjacencySha256: digest(`adjacency:${id}`),
    featurePartitionSha256,
  }));
  const targetManifest: CertificationTargetManifest = {
    schemaVersion: CERTIFICATION_TARGET_MANIFEST_VERSION,
    units: 'millimeter',
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    styleSpecSha256: digest('style-spec'),
    canonicalInputSha256: digest('canonical-input'),
    patchAdjacencySha256: digest('target-adjacency'),
    featurePartitionSha256,
    hasDrain: false,
    wallThicknessSemantics: 'radial',
    requiredMinimumThicknessPm: '1000000000',
    expectedTopology: {
      componentCount: '1',
      genus: '0',
      closed: true,
      orientable: true,
    },
    featureManifest: {
      status: 'empty-proven',
      featureCount: '0',
      creaseOnlyFeatureCount: '0',
      curtainFeatureCount: '0',
      sideFeatureCount: '0',
      curtainAndSideFeatureCount: '0',
      featureCurtainPatchCount: '0',
      featureSidePatchCount: '0',
      featureGraphSha256: digest('empty-feature-graph'),
      featureSurfaceAssignmentManifestSha256: digest('empty-feature-surface-assignments'),
    },
    patches,
  };
  const targetSha256 = computeCertificationTargetSha256(targetManifest);

  const artifactManifest: CertificationArtifactManifest = {
    schemaVersion: CERTIFICATION_ARTIFACT_MANIFEST_VERSION,
    format: 'stl',
    units: 'millimeter',
    unitScalePm: PICOMETRES_PER_MILLIMETRE,
    transformStackSha256: digest('transform-stack'),
    byteLength: '1084',
    byteSha256: digest('artifact-bytes'),
    parserMethod: 'binary-stl-f32-exact',
    parserVersion: BINARY_STL_PARSER_VERSION,
    parserProofSha256: BINARY_STL_PARSER_PROOF_SHA256,
    parserEvidenceSha256: digest('parser-evidence'),
    parserOutputSha256: digest('parser-output'),
    parsedTriangleSetSha256: digest('parsed-triangle-set'),
    triangleCount: '20',
    serializationRoundTripVerified: true,
    finalMutationEpoch: '7',
    proofMutationEpoch: '7',
  };
  const artifactManifestSha256 = computeCertificationArtifactManifestSha256(artifactManifest);
  const bindings = {
    targetSha256,
    artifactManifestSha256,
    artifactByteSha256: artifactManifest.byteSha256,
    parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
  };

  const patchSubsetEntries = patches.map((patch) => ({
    artifactBoundarySetSha256: digest(`artifact-boundary:${patch.id}`),
    artifactTriangleSubsetCount: '4',
    artifactTriangleSubsetSha256: digest(`artifact-subset:${patch.id}`),
    boundarySubdomainSha256: digest(`boundary-subdomain:${patch.id}`),
    patchId: patch.id,
  }));
  const patchClaims = patches.map((patch, index) =>
    makeClaim(
      'patch-distance',
      {
        ...patchSubsetEntries[index],
        boundaryCorrespondenceComplete: true,
        domainCoverageComplete: true,
        domainSha256: patch.domainSha256,
        evaluatorSha256: patch.evaluatorSha256,
        featureCorrespondenceComplete: true,
        featurePartitionSha256: patch.featurePartitionSha256,
        geometricBoundsIncludeNumericalErrors: false,
        meshToTargetUpperPm: '4000000',
        patchAdjacencySha256: patch.adjacencySha256,
        scanComplete: true,
        targetToMeshUpperPm: '4500000',
      },
      bindings,
      {
        claimId: `patch-distance:${patch.id}`,
        patchId: patch.id,
      }
    )
  );

  const topologyEvidenceSha256 = digest('topology-evidence');
  const selfIntersectionEvidenceSha256 = digest('self-intersection-evidence');
  const numericalSourceByKind = {
    target: targetSha256,
    'parser-proof': artifactManifest.parserProofSha256,
    'artifact-bytes': artifactManifest.byteSha256,
    'transform-stack': artifactManifest.transformStackSha256,
  } as const;
  const numericalComponents = Object.values(CERTIFICATION_NUMERICAL_COMPONENT_REGISTRY).map(
    (registered) => ({
      appliesToHausdorff: registered.appliesToHausdorff,
      appliesToThickness: registered.appliesToThickness,
      componentId: registered.componentId,
      methodId: registered.methodId,
      methodVersion: registered.methodVersion,
      sourceSha256: numericalSourceByKind[registered.sourceKind],
      upperPm: '1000',
    })
  );

  const claims: CertificationProofClaim[] = [
    makeClaim(
      'schema-validity',
      {
        aliasConflictCount: '0',
        canonicalInputSha256: targetManifest.canonicalInputSha256,
        nonFiniteParameterCount: '0',
        nonIntegralIntegerCount: '0',
        outOfBoundsParameterCount: '0',
        unknownParameterCount: '0',
        valid: true,
      },
      bindings
    ),
    makeClaim(
      'target-validity',
      {
        adjacencyClosed: true,
        branchPartitionComplete: true,
        featureCurtainsComplete: true,
        featurePartitionSha256,
        geometryEmbedded: true,
        minimumFeatureSeparationLowerPm: null,
        minimumFeatureSeparationStatus: 'not-applicable',
        minimumFeatureSeparationWitnessSha256: digest('no-feature-pairs'),
        minimumThicknessLowerPm: '1200000000',
        noUnintendedSelfIntersections: true,
        patchDomainsRegular: true,
        scanComplete: true,
        status: 'proven-valid',
        topologyRegimeMatches: true,
      },
      bindings
    ),
    makeClaim(
      'evaluator-support',
      {
        canonicalInputSha256: targetManifest.canonicalInputSha256,
        continuousCorrespondenceAvailable: true,
        convergenceSupportedForInput: true,
        cpuEvaluatorSha256: digest('cpu-evaluator'),
        evaluatorParityProven: true,
        maxParityErrorUpperPm: '100',
        scanComplete: true,
        styleSemanticsComplete: true,
        styleSpecSha256: targetManifest.styleSpecSha256,
        validatedEvaluatorAvailable: true,
        validatedEvaluatorSha256: digest('validated-evaluator'),
        wgslEvaluatorSha256: digest('wgsl-evaluator'),
      },
      bindings
    ),
    makeClaim(
      'artifact-parse',
      {
        artifactManifestSha256,
        byteLength: artifactManifest.byteLength,
        byteSha256: artifactManifest.byteSha256,
        parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        parserEvidenceSha256: artifactManifest.parserEvidenceSha256,
        parserOutputSha256: artifactManifest.parserOutputSha256,
        roundTripVerified: true,
        scanComplete: true,
        transformStackSha256: artifactManifest.transformStackSha256,
        triangleCount: artifactManifest.triangleCount,
        units: artifactManifest.units,
      },
      bindings,
      {
        methodId: artifactManifest.parserMethod,
        methodVersion: artifactManifest.parserVersion,
        proofArtifactSha256: artifactManifest.parserEvidenceSha256,
      }
    ),
    ...patchClaims,
    makeClaim(
      'artifact-coverage',
      {
        artifactTriangleCount: artifactManifest.triangleCount,
        continuouslyCoveredTriangleCount: artifactManifest.triangleCount,
        coveredTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        duplicateTriangleAssignmentCount: '0',
        geometricBoundsIncludeNumericalErrors: false,
        meshToTargetUpperPm: '4000000',
        parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        patchSubsetManifestSha256: computePatchSubsetManifestSha256(patchSubsetEntries),
        scanComplete: true,
        unassignedTriangleCount: '0',
      },
      bindings
    ),
    makeClaim(
      'topology',
      {
        boundaryEdgeCount: '0',
        closed: true,
        componentCount: '1',
        consistentlyOriented: true,
        degenerateTriangleCount: '0',
        edgeSetSha256: digest('edge-set'),
        eulerCharacteristic: '2',
        evidenceSha256: topologyEvidenceSha256,
        faceSetSha256: digest('face-set'),
        genus: '0',
        kernelProofSha256: PARSED_TOPOLOGY_PROOF_SHA256,
        kernelVersion: PARSED_TOPOLOGY_PROOF_VERSION,
        manifold: true,
        nonManifoldEdgeCount: '0',
        nonManifoldVertexCount: '0',
        orientationMismatchCount: '0',
        outwardFacing: true,
        parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        scanComplete: true,
        triangleCount: artifactManifest.triangleCount,
        uniqueEdgeCount: '30',
        uniqueVertexCount: '12',
        validTriangleCount: artifactManifest.triangleCount,
        vertexIdentityPolicy: EXACT_STL_VERTEX_IDENTITY_POLICY,
        vertexSetSha256: digest('vertex-set'),
        volumeSign: 'positive-proven',
      },
      bindings,
      {
        methodId: 'parsed-artifact-topology',
        methodVersion: PARSED_TOPOLOGY_PROOF_VERSION,
        proofArtifactSha256: topologyEvidenceSha256,
      }
    ),
    makeClaim(
      'self-intersection',
      {
        adjacencyExclusionSemantics: SELF_INTERSECTION_ADJACENCY_SEMANTICS,
        candidatePairCount: '40',
        candidatePairSetSha256: digest('candidate-pair-set'),
        coplanarOverlapSemantics: SELF_INTERSECTION_COPLANAR_SEMANTICS,
        evidenceSha256: selfIntersectionEvidenceSha256,
        intersectionPairCountLowerBound: '0',
        kernelProofSha256: PARSED_SELF_INTERSECTION_PROOF_SHA256,
        kernelVersion: PARSED_SELF_INTERSECTION_PROOF_VERSION,
        narrowPhaseProofSha256: EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256,
        parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        scanComplete: true,
        selfIntersectionFree: true,
        triangleCount: artifactManifest.triangleCount,
      },
      bindings,
      {
        methodId: 'parsed-artifact-self-intersection',
        methodVersion: PARSED_SELF_INTERSECTION_PROOF_VERSION,
        proofArtifactSha256: selfIntersectionEvidenceSha256,
      }
    ),
    makeClaim(
      'patch-adjacency',
      {
        artifactAdjacencyGraphSha256: digest('artifact-adjacency'),
        artifactToTargetMappingSha256: digest('artifact-target-adjacency-map'),
        complete: true,
        parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        scanComplete: true,
        targetAdjacencySha256: targetManifest.patchAdjacencySha256,
      },
      bindings
    ),
    makeClaim(
      'feature-correspondence',
      {
        duplicateFeatureMappingCount: '0',
        expectedCreaseOnlyFeatureCount: '0',
        expectedCurtainAndSideFeatureCount: '0',
        expectedCurtainFeatureCount: '0',
        expectedFeatureCount: '0',
        expectedSideFeatureCount: '0',
        featurePartitionSha256,
        mappedFeatureCount: '0',
        mappingSetSha256: digest('empty-feature-mapping'),
        scanComplete: true,
        satisfiedCreaseOnlyFeatureCount: '0',
        satisfiedCurtainAndSideFeatureCount: '0',
        satisfiedCurtainFeatureCount: '0',
        satisfiedSideFeatureCount: '0',
        surfaceAssignmentManifestSha256:
          targetManifest.featureManifest.featureSurfaceAssignmentManifestSha256,
        surfaceAssignmentSemantics: FEATURE_SURFACE_ASSIGNMENT_SEMANTICS,
        unmappedFeatureCount: '0',
      },
      bindings
    ),
    makeClaim(
      'thickness',
      {
        certifiedMinimumLowerPm: '1100000000',
        geometricMinimumLowerPm: '1100005000',
        numericalUncertaintyUpperPm: '5000',
        parsedTriangleSetSha256: artifactManifest.parsedTriangleSetSha256,
        scanComplete: true,
        semantics: targetManifest.wallThicknessSemantics,
      },
      bindings
    ),
    makeClaim(
      'numerical-budget',
      {
        components: numericalComponents,
        compositionModel: 'additive-conservative-no-independence',
        geometricBoundsIncludeNumericalErrors: false,
        hausdorffNumericalUpperPm: '5000',
        thicknessNumericalUncertaintyUpperPm: '5000',
      },
      bindings
    ),
  ];
  claims.sort((left, right) => left.claimId.localeCompare(right.claimId));
  const claimSetSha256 = computeVerifiedClaimSetSha256(
    claims.map((claim) => ({ claimId: claim.claimId, claimSha256: claim.claimSha256 }))
  );
  claims.push(
    makeClaim(
      'resource-completion',
      {
        cancelled: false,
        claimSetSha256,
        constraintRecoveryFailed: false,
        featuresDropped: '0',
        memoryLimitExceeded: false,
        proofInconclusive: false,
        scanComplete: true,
        timeLimitExceeded: false,
        triangleLimitExceeded: false,
        workUnitCount: '1000',
      },
      bindings
    )
  );
  claims.sort((left, right) => left.claimId.localeCompare(right.claimId));

  const manifest = {
    schemaVersion: CERTIFICATION_MANIFEST_VERSION,
    requestedTolerancePm: TRUE_TOLERANCE_PM,
    target: { manifest: targetManifest, targetSha256 },
    artifact: { manifest: artifactManifest, artifactManifestSha256 },
    claims,
    bundleSha256: '',
  } satisfies UnverifiedCertificationManifest;
  return {
    ...manifest,
    bundleSha256: computeCertificationBundleSha256(manifest),
  };
}

function mutableManifest(): DeepMutable<UnverifiedCertificationManifest> {
  return structuredClone(buildManifest()) as DeepMutable<UnverifiedCertificationManifest>;
}

function claimOf(
  manifest: DeepMutable<UnverifiedCertificationManifest>,
  kind: CertificationClaimKind
): DeepMutable<CertificationProofClaim> {
  const claim = manifest.claims.find((candidate) => candidate.claimKind === kind);
  if (claim === undefined) throw new Error(`Missing fixture claim: ${kind}`);
  return claim;
}

function rehashClaimsAndBundle(manifest: DeepMutable<UnverifiedCertificationManifest>): void {
  for (const claim of manifest.claims) {
    if (claim.claimKind !== 'resource-completion') {
      claim.claimSha256 = computeCertificationClaimSha256(claim);
    }
  }
  const resource = claimOf(manifest, 'resource-completion');
  resource.outputs.claimSetSha256 = computeVerifiedClaimSetSha256(
    manifest.claims
      .filter((claim) => claim.claimKind !== 'resource-completion')
      .map((claim) => ({ claimId: claim.claimId, claimSha256: claim.claimSha256 }))
  );
  resource.claimSha256 = computeCertificationClaimSha256(resource);
  manifest.bundleSha256 = computeCertificationBundleSha256(manifest);
}

function assess(manifest: UnverifiedCertificationManifest | DeepMutable<UnverifiedCertificationManifest>) {
  return assessUnverifiedCertificationManifestJson(canonicalCertificationManifestJson(manifest));
}

function failureCodes(
  decision: ReturnType<typeof assessUnverifiedCertificationManifestJson>
): readonly string[] {
  return decision.status === 'refused' ? decision.failures.map((failure) => failure.code) : [];
}

describe('unverified certification manifest consistency boundary', () => {
  it('accepts a fully cross-bound manifest but explicitly refuses to call it certified', () => {
    const decision = assess(buildManifest());

    expect(decision).toEqual(
      expect.objectContaining({
        status: 'unverified-structurally-consistent',
        certified: false,
        proofsVerified: false,
        requestedTolerancePm: '10000000',
        declaredGeometricUpperPm: '4500000',
        declaredNumericalUpperPm: '5000',
        declaredCombinedUpperPm: '4505000',
      })
    );
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it('refuses object and Proxy inputs without invoking reflection traps', () => {
    let trapCount = 0;
    const hostile = new Proxy(buildManifest(), {
      get() {
        trapCount += 1;
        throw new Error('must not execute');
      },
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });

    const decision = assessUnverifiedCertificationManifestJson(hostile);
    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('NON_CANONICAL_JSON');
    expect(trapCount).toBe(0);
  });

  it('rejects additional certification-like fields at every canonical object boundary', () => {
    const root = JSON.parse(canonicalCertificationManifestJson(buildManifest())) as Record<string, unknown>;
    root.certified = true;
    const decision = assessUnverifiedCertificationManifestJson(canonicalCertificationManifestJson(root));

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('SCHEMA_INVALID');
  });

  it('rejects JSON numbers, including a rounded value near one', () => {
    const canonical = canonicalCertificationManifestJson(buildManifest());
    const hostile = canonical.replace(
      '"requestedTolerancePm":"10000000"',
      '"requestedTolerancePm":0.9999999999999999'
    );
    const decision = assessUnverifiedCertificationManifestJson(hostile);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('NON_CANONICAL_JSON');
  });

  it('recomputes claim and bundle digests instead of trusting correlation tokens', () => {
    const manifest = mutableManifest();
    claimOf(manifest, 'schema-validity').outputs.valid = false;
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('HASH_MISMATCH');
    expect(failureCodes(decision)).toContain('CLAIM_FAILED');
  });

  it('rejects a fully rehashed target bound to any other target-solid policy', () => {
    const manifest = mutableManifest();
    manifest.target.manifest.targetSolidSpecificationSha256 = digest('wrong-target-policy');
    manifest.target.targetSha256 = computeCertificationTargetSha256(manifest.target.manifest);
    for (const claim of manifest.claims) {
      claim.inputs.targetSha256 = manifest.target.targetSha256;
    }
    rehashClaimsAndBundle(manifest);

    const decision = assess(manifest);
    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('TARGET_INVALID');
    expect(failureCodes(decision)).not.toContain('HASH_MISMATCH');
  });

  it('rejects a fully rehashed but incomplete artifact-to-patch partition', () => {
    const manifest = mutableManifest();
    const coverage = claimOf(manifest, 'artifact-coverage');
    coverage.outputs.continuouslyCoveredTriangleCount = '19';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('PATCH_COVERAGE_INVALID');
    expect(failureCodes(decision)).not.toContain('HASH_MISMATCH');
  });

  it('rejects missing continuous patch evidence even after all remaining hashes are rebuilt', () => {
    const manifest = mutableManifest();
    const index = manifest.claims.findIndex(
      (claim) => claim.claimId === 'patch-distance:outer-wall'
    );
    manifest.claims.splice(index, 1);
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('PATCH_COVERAGE_INVALID');
  });

  it('rejects a rehashed incomplete self-intersection traversal', () => {
    const manifest = mutableManifest();
    claimOf(manifest, 'self-intersection').outputs.scanComplete = false;
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('SELF_INTERSECTION_INVALID');
  });

  it('rejects inward orientation and inconsistent Euler evidence', () => {
    const manifest = mutableManifest();
    const topology = claimOf(manifest, 'topology');
    topology.outputs.outwardFacing = false;
    topology.outputs.eulerCharacteristic = '1';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('TOPOLOGY_INVALID');
  });

  it('requires an explicit and exact feature manifest mapping, including the empty case', () => {
    const manifest = mutableManifest();
    claimOf(manifest, 'feature-correspondence').outputs.mappedFeatureCount = '1';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('FEATURE_MAPPING_INVALID');
  });

  it('rejects thickness without exact conservative numerical erosion', () => {
    const manifest = mutableManifest();
    const thickness = claimOf(manifest, 'thickness');
    thickness.outputs.certifiedMinimumLowerPm = '1100000001';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('THICKNESS_INVALID');
  });

  it('rejects reordered, under-counted, or unbound numerical components', () => {
    const manifest = mutableManifest();
    const numerical = claimOf(manifest, 'numerical-budget');
    const components = numerical.outputs.components;
    if (!Array.isArray(components)) throw new Error('Fixture numerical components are absent');
    components.reverse();
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('NUMERICAL_BUDGET_INVALID');
  });

  it('rejects parser version drift even when artifact, claim-set, and bundle hashes are coordinated', () => {
    const manifest = mutableManifest();
    manifest.artifact.manifest.parserVersion = 'potfoundry.binary-stl-f32-exact/v999' as typeof BINARY_STL_PARSER_VERSION;
    manifest.artifact.artifactManifestSha256 = computeCertificationArtifactManifestSha256(
      manifest.artifact.manifest
    );
    for (const claim of manifest.claims) {
      claim.inputs.artifactManifestSha256 = manifest.artifact.artifactManifestSha256;
    }
    const parse = claimOf(manifest, 'artifact-parse');
    parse.methodVersion = manifest.artifact.manifest.parserVersion;
    parse.outputs.artifactManifestSha256 = manifest.artifact.artifactManifestSha256;
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('ARTIFACT_INVALID');
  });

  it('is total for an unknown claim kind in otherwise canonical exact-shape input', () => {
    const manifest = mutableManifest();
    const patch = manifest.claims.find((claim) => claim.claimKind === 'patch-distance');
    if (patch === undefined) throw new Error('Missing patch fixture');
    patch.claimKind = 'unknown-proof-kind' as CertificationClaimKind;
    rehashClaimsAndBundle(manifest);

    expect(() => assess(manifest)).not.toThrow();
    const decision = assess(manifest);
    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('SCHEMA_INVALID');
  });

  it('is total for an invalid target genus that reaches semantic validation', () => {
    const manifest = mutableManifest();
    manifest.target.manifest.expectedTopology.genus = 'x' as '0';
    manifest.target.targetSha256 = computeCertificationTargetSha256(manifest.target.manifest);
    for (const claim of manifest.claims) claim.inputs.targetSha256 = manifest.target.targetSha256;
    rehashClaimsAndBundle(manifest);

    expect(() => assess(manifest)).not.toThrow();
    const decision = assess(manifest);
    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('TARGET_INVALID');
  });

  it('rejects a fully rehashed STL whose byte length contradicts its facet count', () => {
    const manifest = mutableManifest();
    manifest.artifact.manifest.byteLength = '0';
    manifest.artifact.artifactManifestSha256 = computeCertificationArtifactManifestSha256(
      manifest.artifact.manifest
    );
    for (const claim of manifest.claims) {
      claim.inputs.artifactManifestSha256 = manifest.artifact.artifactManifestSha256;
    }
    const parse = claimOf(manifest, 'artifact-parse');
    parse.outputs.artifactManifestSha256 = manifest.artifact.artifactManifestSha256;
    parse.outputs.byteLength = '0';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('ARTIFACT_INVALID');
    expect(failureCodes(decision)).not.toContain('HASH_MISMATCH');
  });

  it('does not let a manifest omit every numerical thickness component', () => {
    const manifest = mutableManifest();
    const numerical = claimOf(manifest, 'numerical-budget');
    const components = numerical.outputs.components;
    if (!Array.isArray(components)) throw new Error('Fixture numerical components are absent');
    for (const component of components) {
      if (typeof component !== 'object' || component === null || Array.isArray(component)) {
        throw new Error('Fixture numerical component is malformed');
      }
      component.appliesToThickness = false;
    }
    numerical.outputs.thicknessNumericalUncertaintyUpperPm = '0';
    const thickness = claimOf(manifest, 'thickness');
    thickness.outputs.numericalUncertaintyUpperPm = '0';
    thickness.outputs.certifiedMinimumLowerPm = thickness.outputs.geometricMinimumLowerPm;
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('NUMERICAL_BUDGET_INVALID');
  });

  it('rejects arbitrary nested numerical methods under a registered wrapper claim', () => {
    const manifest = mutableManifest();
    const numerical = claimOf(manifest, 'numerical-budget');
    const components = numerical.outputs.components;
    if (!Array.isArray(components)) throw new Error('Fixture numerical components are absent');
    for (const component of components) {
      if (typeof component !== 'object' || component === null || Array.isArray(component)) {
        throw new Error('Fixture numerical component is malformed');
      }
      component.methodId = 'guess';
      component.methodVersion = 'v0';
    }
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('NUMERICAL_BUDGET_INVALID');
  });

  it('requires present features to declare an explicit surface obligation', () => {
    const manifest = mutableManifest();
    const featureManifest = manifest.target.manifest.featureManifest;
    featureManifest.status = 'present-proven';
    featureManifest.featureCount = '1';
    featureManifest.curtainFeatureCount = '1';
    manifest.target.targetSha256 = computeCertificationTargetSha256(manifest.target.manifest);
    for (const claim of manifest.claims) claim.inputs.targetSha256 = manifest.target.targetSha256;
    const feature = claimOf(manifest, 'feature-correspondence');
    feature.outputs.expectedFeatureCount = '1';
    feature.outputs.expectedCurtainFeatureCount = '1';
    feature.outputs.mappedFeatureCount = '1';
    feature.outputs.satisfiedCurtainFeatureCount = '1';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('TARGET_INVALID');
  });

  it('requires one satisfied assignment record for every feature even when patches aggregate', () => {
    const manifest = mutableManifest();
    const featureManifest = manifest.target.manifest.featureManifest;
    featureManifest.status = 'present-proven';
    featureManifest.featureCount = '100';
    featureManifest.curtainFeatureCount = '100';
    featureManifest.featureCurtainPatchCount = '1';
    featureManifest.featureSurfaceAssignmentManifestSha256 = digest('100-curtain-assignments');
    manifest.target.manifest.patches.push({
      id: 'feature-curtain',
      role: 'feature-curtain',
      branchId: 'branch:feature-curtain',
      evaluatorSha256: digest('evaluator:feature-curtain'),
      domainSha256: digest('domain:feature-curtain'),
      adjacencySha256: digest('adjacency:feature-curtain'),
      featurePartitionSha256: manifest.target.manifest.featurePartitionSha256,
    });
    manifest.target.manifest.patches.sort((left, right) => left.id.localeCompare(right.id));
    manifest.target.targetSha256 = computeCertificationTargetSha256(manifest.target.manifest);
    for (const claim of manifest.claims) claim.inputs.targetSha256 = manifest.target.targetSha256;
    const targetValidity = claimOf(manifest, 'target-validity');
    targetValidity.outputs.minimumFeatureSeparationStatus = 'proven';
    targetValidity.outputs.minimumFeatureSeparationLowerPm = '1';
    const feature = claimOf(manifest, 'feature-correspondence');
    feature.outputs.expectedFeatureCount = '100';
    feature.outputs.expectedCurtainFeatureCount = '100';
    feature.outputs.mappedFeatureCount = '100';
    feature.outputs.satisfiedCurtainFeatureCount = '99';
    feature.outputs.surfaceAssignmentManifestSha256 =
      featureManifest.featureSurfaceAssignmentManifestSha256;
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('FEATURE_MAPPING_INVALID');
  });

  it('rejects sampled percentile methods even when every digest is rebuilt', () => {
    const manifest = mutableManifest();
    const patch = manifest.claims.find((claim) => claim.claimKind === 'patch-distance');
    if (patch === undefined) throw new Error('Missing patch fixture');
    patch.methodId = 'sampled-p99';
    rehashClaimsAndBundle(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('CLAIM_FAILED');
  });

  it('binds the resource completion result to the exact non-resource claim set', () => {
    const manifest = mutableManifest();
    const resource = claimOf(manifest, 'resource-completion');
    resource.outputs.claimSetSha256 = digest('different-claim-set');
    resource.claimSha256 = computeCertificationClaimSha256(resource);
    manifest.bundleSha256 = computeCertificationBundleSha256(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('RESOURCE_INCOMPLETE');
  });

  it('enforces the requested tolerance with exact integer arithmetic', () => {
    const manifest = mutableManifest();
    manifest.requestedTolerancePm = '4504999';
    manifest.bundleSha256 = computeCertificationBundleSha256(manifest);
    const decision = assess(manifest);

    expect(decision.status).toBe('refused');
    expect(failureCodes(decision)).toContain('TOLERANCE_EXCEEDED');
  });

  it('freezes refusal evidence returned across the public boundary', () => {
    const decision = assessUnverifiedCertificationManifestJson('{}');

    expect(decision.status).toBe('refused');
    if (decision.status !== 'refused') throw new Error('Expected refusal');
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.failures)).toBe(true);
    expect(Object.isFrozen(decision.failures[0])).toBe(true);
  });

  it('never throws for canonical or noncanonical primitive input classes', () => {
    const hostileInputs: unknown[] = [
      null,
      undefined,
      1,
      true,
      {},
      [],
      '',
      'null',
      '[]',
      '{}',
      '{"a":"b"}',
      '{"a":0}',
      '{',
    ];
    for (const source of hostileInputs) {
      expect(() => assessUnverifiedCertificationManifestJson(source)).not.toThrow();
      expect(assessUnverifiedCertificationManifestJson(source).status).toBe('refused');
    }
  });
});
