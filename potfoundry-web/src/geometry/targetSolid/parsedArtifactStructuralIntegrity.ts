import { parseBinaryStlArtifact, type ParseBinaryStlOptions } from './binaryStlArtifact';
import { sha256Utf8 } from './incrementalSha256';
import {
  assessParsedArtifactSelfIntersections,
  type ParsedArtifactSelfIntersectionResult,
  type ParsedSelfIntersectionOptions,
} from './parsedArtifactSelfIntersection';
import {
  assessParsedArtifactTopology,
  type ParsedArtifactTopology,
  type ParsedTopologyOptions,
} from './parsedArtifactTopology';

export const PARSED_STRUCTURAL_INTEGRITY_VERSION =
  'potfoundry.parsed-artifact-structural-integrity/v2' as const;
export const PARSED_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS =
  'structural-only-no-thickness-feature-or-distance-proof' as const;

export interface ExpectedParsedTopology {
  componentCount: 1;
  genus: 0 | 1;
}

export interface ParsedStructuralIntegrityOptions {
  parser?: ParseBinaryStlOptions;
  topology?: ParsedTopologyOptions;
  selfIntersection?: ParsedSelfIntersectionOptions;
}

export interface ParsedStructuralChecks {
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

export interface ParsedArtifactStructuralIntegrity {
  readonly version: typeof PARSED_STRUCTURAL_INTEGRITY_VERSION;
  readonly implementationStatus: typeof PARSED_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS;
  readonly evidenceSha256: string;
  readonly artifact: Readonly<{
    byteSha256: string;
    parsedArtifactSha256: string;
    parsedTriangleSetSha256: string;
    parserProofSha256: string;
    triangleCount: number;
    nonZeroAttributeCount: number;
    zeroFacetNormalCount: number;
    nonPositiveFacetNormalDotCount: number;
    maximumFacetNormalLengthError: number;
    minimumFacetNormalCosine: number | null;
  }>;
  readonly expectedTopology: Readonly<ExpectedParsedTopology>;
  readonly topology: ParsedArtifactTopology;
  readonly selfIntersection: ParsedArtifactSelfIntersectionResult;
  readonly checks: ParsedStructuralChecks;
  readonly structurallyValid: boolean;
}

/**
 * Parse final binary-STL bytes and bind exact topology plus embeddedness facts.
 * This intentionally cannot claim thickness, feature correspondence, target
 * validity, continuous Hausdorff distance, or the literal 0.01 mm contract.
 */
export function assessBinaryStlStructuralIntegrity(
  source: ArrayBuffer | Uint8Array,
  expectedTopology: ExpectedParsedTopology,
  options: ParsedStructuralIntegrityOptions = {}
): ParsedArtifactStructuralIntegrity {
  if (
    expectedTopology.componentCount !== 1 ||
    (expectedTopology.genus !== 0 && expectedTopology.genus !== 1)
  ) {
    throw new TypeError('expectedTopology must declare componentCount 1 and genus 0 or 1');
  }
  const parsed = parseBinaryStlArtifact(source, options.parser);
  const topology = assessParsedArtifactTopology(parsed, options.topology);
  const selfIntersection = assessParsedArtifactSelfIntersections(parsed, options.selfIntersection);
  const frozenExpected = Object.freeze({ ...expectedTopology });
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
  const artifact = Object.freeze({
    byteSha256: parsed.byteSha256,
    parsedArtifactSha256: parsed.parsedArtifactSha256,
    parsedTriangleSetSha256: parsed.parsedTriangleSetSha256,
    parserProofSha256: parsed.parserProofSha256,
    triangleCount: parsed.triangleCount,
    nonZeroAttributeCount: parsed.nonZeroAttributeCount,
    zeroFacetNormalCount: parsed.zeroFacetNormalCount,
    nonPositiveFacetNormalDotCount: parsed.nonPositiveFacetNormalDotCount,
    maximumFacetNormalLengthError: parsed.maximumFacetNormalLengthError,
    minimumFacetNormalCosine: parsed.minimumFacetNormalCosine,
  });
  const evidenceSha256 = sha256Utf8(
    JSON.stringify([
      PARSED_STRUCTURAL_INTEGRITY_VERSION,
      PARSED_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS,
      artifact,
      frozenExpected,
      topology.evidenceSha256,
      selfIntersection.evidenceSha256,
      checks,
      structurallyValid,
    ])
  );
  return Object.freeze({
    version: PARSED_STRUCTURAL_INTEGRITY_VERSION,
    implementationStatus: PARSED_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS,
    evidenceSha256,
    artifact,
    expectedTopology: frozenExpected,
    topology,
    selfIntersection,
    checks,
    structurallyValid,
  });
}
