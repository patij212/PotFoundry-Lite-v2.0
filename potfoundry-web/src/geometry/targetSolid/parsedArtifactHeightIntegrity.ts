import { domainSeparatedCanonicalJsonSha256 } from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import {
  binary32MillimetresToPicometres,
  binary64MillimetresToPicometres,
  exactIntervalAbsoluteUpper,
  exactIntervalDifference,
  EXACT_IEEE754_PICOMETRE_INTERVAL_PROOF_SHA256,
  type ExactPicometreInterval,
} from './exactIeee754Picometres';
import { sha256Utf8 } from './incrementalSha256';
import {
  parsedMappedArtifactForProofSession,
  type MappedArtifactProofSession,
} from './mappedArtifactProofSession';

export const PARSED_ARTIFACT_HEIGHT_INTEGRITY_VERSION =
  'potfoundry.parsed-artifact-height-integrity/v2' as const;
export const PARSED_ARTIFACT_HEIGHT_INTEGRITY_PROOF_SHA256 = sha256Utf8(
  [
    PARSED_ARTIFACT_HEIGHT_INTEGRITY_VERSION,
    `ieee754-pm-proof=${EXACT_IEEE754_PICOMETRE_INTERVAL_PROOF_SHA256}`,
    'input artifact must be an authenticated exact final-byte parser session',
    'intended height comes only from the authenticated canonical target input',
    'piecewise-linear triangle z extrema occur at vertices, so parsed AABB z bounds are continuous artifact extrema',
    'binary-STL extrema use exact binary32-to-picometre outward conversion; 3MF/OBJ extrema retain their exact parsed integer picometres',
    'binary64 target endpoints are converted from exact bit patterns to outward integer-picometre intervals',
    'bottom endpoint, top endpoint, and total height absolute errors must all fit the caller budget',
    'this proves only vertical dimensional integrity and not radial dimensions, drain, rim, feature, thickness, or target validity',
  ].join('\n')
);

export interface ParsedArtifactHeightIntegrityResult {
  readonly proofVersion: typeof PARSED_ARTIFACT_HEIGHT_INTEGRITY_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly artifactFormat: 'stl' | '3mf' | 'obj';
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly canonicalInputSha256: string;
  readonly requestedMaximumErrorPm: string;
  readonly artifactMinimumZPm: Readonly<{ lower: string; upper: string }>;
  readonly artifactMaximumZPm: Readonly<{ lower: string; upper: string }>;
  readonly artifactHeightPm: Readonly<{ lower: string; upper: string }>;
  readonly targetMinimumZPm: Readonly<{ lower: string; upper: string }>;
  readonly targetMaximumZPm: Readonly<{ lower: string; upper: string }>;
  readonly targetHeightPm: Readonly<{ lower: string; upper: string }>;
  readonly bottomEndpointErrorUpperPm: string;
  readonly topEndpointErrorUpperPm: string;
  readonly heightErrorUpperPm: string;
  readonly maximumErrorUpperPm: string;
  readonly scanComplete: true;
  readonly heightDimensionProven: true;
  readonly implementationScope: 'height-only-no-radial-drain-rim-feature-or-thickness-proof';
}

const TRUE_TOLERANCE_PM = 10_000_000n;

function intervalStrings(interval: Readonly<{ lowerPm: bigint; upperPm: bigint }>) {
  return Object.freeze({ lower: interval.lowerPm.toString(), upper: interval.upperPm.toString() });
}

function maximum(values: readonly bigint[]): bigint {
  return values.reduce((current, value) => (value > current ? value : current), 0n);
}

function exactPicometrePoint(value: string): ExactPicometreInterval {
  if (!/^(?:0|-?[1-9][0-9]*)$/.test(value)) {
    throw new TypeError('Parsed artifact picometre bound is not a canonical integer');
  }
  const picometres = BigInt(value);
  return Object.freeze({
    lowerPm: picometres,
    upperPm: picometres,
    exactIntegralPicometres: true,
  });
}

/** Prove final parsed STL/3MF/OBJ bottom, top, and total height against the G0 input. */
export function assessParsedArtifactHeightIntegrity(
  session: MappedArtifactProofSession,
  canonicalInput: CanonicalTargetInputBinding,
  requestedMaximumErrorPm: bigint
): ParsedArtifactHeightIntegrityResult {
  if (
    typeof requestedMaximumErrorPm !== 'bigint' ||
    requestedMaximumErrorPm < 0n ||
    requestedMaximumErrorPm > TRUE_TOLERANCE_PM
  ) {
    throw new TypeError('Height error budget must be between 0 and 10000000 pm');
  }
  const artifact = parsedMappedArtifactForProofSession(session);
  const input = canonicalTargetInputForProof(canonicalInput);
  const artifactMinimumZ = artifact.format === 'stl'
    ? binary32MillimetresToPicometres(artifact.bounds.minZ)
    : exactPicometrePoint(artifact.boundsPm.minZ);
  const artifactMaximumZ = artifact.format === 'stl'
    ? binary32MillimetresToPicometres(artifact.bounds.maxZ)
    : exactPicometrePoint(artifact.boundsPm.maxZ);
  const artifactHeight = exactIntervalDifference(artifactMaximumZ, artifactMinimumZ);
  const targetMinimumZ = binary64MillimetresToPicometres(0);
  const targetMaximumZ = binary64MillimetresToPicometres(
    canonicalInput.geometry.geometry.H
  );
  const targetHeight = exactIntervalDifference(targetMaximumZ, targetMinimumZ);
  const bottomEndpointErrorUpperPm = exactIntervalAbsoluteUpper(
    exactIntervalDifference(artifactMinimumZ, targetMinimumZ)
  );
  const topEndpointErrorUpperPm = exactIntervalAbsoluteUpper(
    exactIntervalDifference(artifactMaximumZ, targetMaximumZ)
  );
  const heightErrorUpperPm = exactIntervalAbsoluteUpper(
    exactIntervalDifference(artifactHeight, targetHeight)
  );
  const maximumErrorUpperPm = maximum([
    bottomEndpointErrorUpperPm,
    topEndpointErrorUpperPm,
    heightErrorUpperPm,
  ]);
  if (maximumErrorUpperPm > requestedMaximumErrorPm) {
    throw new RangeError(
      `Final artifact height error ${maximumErrorUpperPm} pm exceeds ${requestedMaximumErrorPm} pm`
    );
  }
  const evidenceValue = {
    artifactByteSha256: artifact.byteSha256,
    artifactFormat: artifact.format,
    artifactHeightPm: intervalStrings(artifactHeight),
    artifactMaximumZPm: intervalStrings(artifactMaximumZ),
    artifactMinimumZPm: intervalStrings(artifactMinimumZ),
    bottomEndpointErrorUpperPm: bottomEndpointErrorUpperPm.toString(),
    canonicalInputSha256: input.canonicalInputSha256,
    heightErrorUpperPm: heightErrorUpperPm.toString(),
    heightDimensionProven: true,
    maximumErrorUpperPm: maximumErrorUpperPm.toString(),
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    proofMethodSha256: PARSED_ARTIFACT_HEIGHT_INTEGRITY_PROOF_SHA256,
    proofVersion: PARSED_ARTIFACT_HEIGHT_INTEGRITY_VERSION,
    requestedMaximumErrorPm: requestedMaximumErrorPm.toString(),
    scanComplete: true,
    targetHeightPm: intervalStrings(targetHeight),
    targetMaximumZPm: intervalStrings(targetMaximumZ),
    targetMinimumZPm: intervalStrings(targetMinimumZ),
    topEndpointErrorUpperPm: topEndpointErrorUpperPm.toString(),
  } as const;
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.parsed-artifact-height-integrity/evidence/v1',
    evidenceValue
  );
  return Object.freeze({
    proofVersion: PARSED_ARTIFACT_HEIGHT_INTEGRITY_VERSION,
    proofMethodSha256: PARSED_ARTIFACT_HEIGHT_INTEGRITY_PROOF_SHA256,
    evidenceSha256,
    artifactFormat: artifact.format,
    artifactByteSha256: artifact.byteSha256,
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    canonicalInputSha256: input.canonicalInputSha256,
    requestedMaximumErrorPm: requestedMaximumErrorPm.toString(),
    artifactMinimumZPm: intervalStrings(artifactMinimumZ),
    artifactMaximumZPm: intervalStrings(artifactMaximumZ),
    artifactHeightPm: intervalStrings(artifactHeight),
    targetMinimumZPm: intervalStrings(targetMinimumZ),
    targetMaximumZPm: intervalStrings(targetMaximumZ),
    targetHeightPm: intervalStrings(targetHeight),
    bottomEndpointErrorUpperPm: bottomEndpointErrorUpperPm.toString(),
    topEndpointErrorUpperPm: topEndpointErrorUpperPm.toString(),
    heightErrorUpperPm: heightErrorUpperPm.toString(),
    maximumErrorUpperPm: maximumErrorUpperPm.toString(),
    scanComplete: true,
    heightDimensionProven: true,
    implementationScope: 'height-only-no-radial-drain-rim-feature-or-thickness-proof',
  });
}
