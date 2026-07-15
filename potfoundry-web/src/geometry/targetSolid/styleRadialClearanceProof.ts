import {
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { sha256Utf8 } from './incrementalSha256';
import {
  deriveRadialClearanceTargetProgram,
  RADIAL_SOLID_PROGRAM_TRANSFORM_PROOF_SHA256,
  RADIAL_SOLID_PROGRAM_TRANSFORM_VERSION,
} from './radialSolidProgramTransform';
import {
  styleOuterWallTargetRegistryForProof,
  type OuterWallTargetPatchRole,
  type StyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';
import { styleOuterWallTargetProgramsForProof } from './styleOuterWallTargetPrograms';
import {
  proveValidatedTargetScalarPositive,
  VALIDATED_TARGET_SCALAR_POSITIVITY_PROOF_SHA256,
  type ValidatedTargetScalarPositivityError,
} from './validatedTargetScalarPositivity';

export const STYLE_RADIAL_CLEARANCE_PROOF_VERSION =
  'potfoundry.style-radial-clearance-proof/v1' as const;
export const STYLE_RADIAL_CLEARANCE_PROOF_SCOPE =
  'all-authenticated-outer-and-feature-source-patches-radial-clamp-inactivity-only' as const;
export const PRODUCTION_MINIMUM_INNER_RADIUS_MM = 0.5 as const;
export const STYLE_RADIAL_CLEARANCE_PROOF_SHA256 = sha256Utf8(
  [
    STYLE_RADIAL_CLEARANCE_PROOF_VERSION,
    `scope=${STYLE_RADIAL_CLEARANCE_PROOF_SCOPE}`,
    `radial-transform=${RADIAL_SOLID_PROGRAM_TRANSFORM_VERSION}`,
    `radial-transform-proof=${RADIAL_SOLID_PROGRAM_TRANSFORM_PROOF_SHA256}`,
    `scalar-positivity-proof=${VALIDATED_TARGET_SCALAR_POSITIVITY_PROOF_SHA256}`,
    `production-minimum-inner-radius-mm=${PRODUCTION_MINIMUM_INNER_RADIUS_MM}`,
    'canonical target input and all-style target registry are runtime-authenticated and must share one identity hash',
    'every authenticated outer-wall, feature-curtain, and feature-side program is transformed to sourceRadius-wallThickness-minimumInnerRadius',
    'each transformed clearance program must prove strict positivity continuously over its complete unit-square patch domain',
    'success proves the production max(sourceRadius-wallThickness,minimumInnerRadius) clamp is inactive on every declared source patch',
    'composition blockers, undeclared feature-side graphs, source regularity, physical normal thickness, device conformance, and artifact distance remain separate obligations',
    'per-patch or aggregate resource exhaustion, cancellation, numeric uncertainty, and any nonpositive cell refuse',
  ].join('\n')
);

export interface StyleRadialClearanceProofOptions {
  readonly maxDepthPerPatch?: number;
  readonly maxTotalWorkCells?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export interface StyleRadialClearancePatchProof {
  readonly patchId: string;
  readonly role: OuterWallTargetPatchRole;
  readonly kind: string;
  readonly sourceProgramSha256: string;
  readonly clearanceProgramSha256: string;
  readonly positivityEvidenceSha256: string;
  readonly minimumClearanceLowerMm: number;
  readonly minimumClearanceLowerPm: string;
  readonly workCellCount: number;
  readonly maximumDepthReached: number;
}

export interface StyleRadialClearanceProofResult {
  readonly proofVersion: typeof STYLE_RADIAL_CLEARANCE_PROOF_VERSION;
  readonly proofMethodSha256: string;
  readonly implementationScope: typeof STYLE_RADIAL_CLEARANCE_PROOF_SCOPE;
  readonly evidenceSha256: string;
  readonly canonicalInputSha256: string;
  readonly styleRegistrySha256: string;
  readonly styleId: string;
  readonly wallThicknessMm: number;
  readonly minimumInnerRadiusMm: typeof PRODUCTION_MINIMUM_INNER_RADIUS_MM;
  readonly patchProofs: readonly StyleRadialClearancePatchProof[];
  readonly minimumClearanceLowerMm: number;
  readonly minimumClearanceLowerPm: string;
  readonly totalWorkCellCount: number;
  readonly allDeclaredSourcePatchesCovered: true;
  readonly radialClampInactive: true;
  readonly outerWallCompositionAdmissible: boolean;
}

export type StyleRadialClearanceProofErrorCode =
  | 'INVALID_INPUT'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED'
  | 'CLEARANCE_NOT_PROVEN';

export class StyleRadialClearanceProofError extends Error {
  readonly code: StyleRadialClearanceProofErrorCode;
  readonly patchId?: string;

  constructor(
    code: StyleRadialClearanceProofErrorCode,
    message: string,
    patchId?: string
  ) {
    super(message);
    this.name = 'StyleRadialClearanceProofError';
    this.code = code;
    this.patchId = patchId;
  }
}

const DEFAULT_MAX_TOTAL_WORK_CELLS = 1_000_000;
const MAX_TOTAL_WORK_CELLS = 4_000_000;

function invalid(message: string): never {
  throw new StyleRadialClearanceProofError('INVALID_INPUT', message);
}

function totalWorkLimit(value: number | undefined): number {
  const resolved = value ?? DEFAULT_MAX_TOTAL_WORK_CELLS;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0 ||
    resolved > MAX_TOTAL_WORK_CELLS
  ) {
    invalid(`maxTotalWorkCells must be a positive integer <= ${MAX_TOTAL_WORK_CELLS}`);
  }
  return resolved;
}

function mappedErrorCode(
  error: ValidatedTargetScalarPositivityError
): StyleRadialClearanceProofErrorCode {
  if (error.code === 'CANCELLED') return 'CANCELLED';
  if (error.code === 'RESOURCE_LIMIT') return 'RESOURCE_LIMIT';
  return 'CLEARANCE_NOT_PROVEN';
}

/**
 * Prove that the radial inner-wall floor is inactive on every declared style
 * source patch. This is a G0 validity sub-proof, never an artifact certificate.
 */
export function proveStyleRadialClearance(
  canonicalInputValue: CanonicalTargetInputBinding,
  registryValue: StyleOuterWallTargetRegistryBinding,
  options: StyleRadialClearanceProofOptions = {}
): StyleRadialClearanceProofResult {
  const canonicalInput = canonicalTargetInputForProof(canonicalInputValue);
  const styleRegistry = styleOuterWallTargetRegistryForProof(registryValue);
  if (
    styleRegistry.canonicalInputSha256 !== canonicalInput.canonicalInputSha256 ||
    styleRegistry.styleId !== canonicalInputValue.style.styleId
  ) {
    invalid('canonical target input and style registry do not describe the same target');
  }
  const maxTotalWorkCells = totalWorkLimit(options.maxTotalWorkCells);
  if (
    options.maxDepthPerPatch !== undefined &&
    (!Number.isSafeInteger(options.maxDepthPerPatch) ||
      options.maxDepthPerPatch <= 0 ||
      options.maxDepthPerPatch > 30)
  ) {
    invalid('maxDepthPerPatch must be a positive integer <= 30');
  }
  const wallThicknessMm = canonicalInputValue.geometry.geometry.t_wall;
  const sourcePrograms = styleOuterWallTargetProgramsForProof(styleRegistry);
  const patchProofs: StyleRadialClearancePatchProof[] = [];
  let totalWorkCellCount = 0;
  let minimumClearanceLowerMm = Number.POSITIVE_INFINITY;
  let minimumClearanceLowerPm: bigint | undefined;

  for (const source of sourcePrograms) {
    const remainingWorkCells = maxTotalWorkCells - totalWorkCellCount;
    if (remainingWorkCells <= 0) {
      throw new StyleRadialClearanceProofError(
        'RESOURCE_LIMIT',
        `Style radial clearance exceeded maxTotalWorkCells=${maxTotalWorkCells}`,
        source.patchId
      );
    }
    const clearance = deriveRadialClearanceTargetProgram(
      source.programCanonicalJson,
      {
        evaluatorId: 'potfoundry.radial-clearance',
        evaluatorVersion: 'v1',
        patchId: `clearance/${source.patchId}`,
      },
      {
        wallThicknessMm,
        minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
      }
    );
    try {
      const positivity = proveValidatedTargetScalarPositive(
        clearance.programCanonicalJson,
        {
          maxDepth: options.maxDepthPerPatch,
          maxWorkCells: remainingWorkCells,
          cancellationFlag: options.cancellationFlag,
          progressCounter: options.progressCounter,
        }
      );
      const lowerPm = BigInt(positivity.minimumTargetXLowerPm);
      totalWorkCellCount += positivity.workCellCount;
      minimumClearanceLowerMm = Math.min(
        minimumClearanceLowerMm,
        positivity.minimumTargetXLowerMm
      );
      minimumClearanceLowerPm = minimumClearanceLowerPm === undefined
        ? lowerPm
        : minimumClearanceLowerPm < lowerPm
          ? minimumClearanceLowerPm
          : lowerPm;
      patchProofs.push(Object.freeze({
        patchId: source.patchId,
        role: source.role,
        kind: source.kind,
        sourceProgramSha256: source.programSha256,
        clearanceProgramSha256: clearance.programSha256,
        positivityEvidenceSha256: positivity.evidenceSha256,
        minimumClearanceLowerMm: positivity.minimumTargetXLowerMm,
        minimumClearanceLowerPm: positivity.minimumTargetXLowerPm,
        workCellCount: positivity.workCellCount,
        maximumDepthReached: positivity.maximumDepthReached,
      }));
    } catch (error) {
      const positivityError = error as ValidatedTargetScalarPositivityError;
      throw new StyleRadialClearanceProofError(
        mappedErrorCode(positivityError),
        `Style '${styleRegistry.styleId}' radial clearance was not proven for '${source.patchId}': ${
          error instanceof Error ? error.message : 'unknown proof failure'
        }`,
        source.patchId
      );
    }
  }

  if (
    patchProofs.length !== sourcePrograms.length ||
    !Number.isFinite(minimumClearanceLowerMm) ||
    minimumClearanceLowerPm === undefined
  ) {
    invalid('style radial clearance did not cover every declared source patch');
  }
  const evidenceValue = {
    allDeclaredSourcePatchesCovered: true,
    canonicalInputSha256: canonicalInput.canonicalInputSha256,
    implementationScope: STYLE_RADIAL_CLEARANCE_PROOF_SCOPE,
    minimumClearanceLowerPm: minimumClearanceLowerPm.toString(),
    minimumInnerRadiusMm: '0.5',
    outerWallCompositionAdmissible: styleRegistry.outerWallCompositionAdmissible,
    patchProofs: patchProofs.map((patch) => ({
      clearanceProgramSha256: patch.clearanceProgramSha256,
      kind: patch.kind,
      maximumDepthReached: patch.maximumDepthReached.toString(),
      minimumClearanceLowerPm: patch.minimumClearanceLowerPm,
      patchId: patch.patchId,
      positivityEvidenceSha256: patch.positivityEvidenceSha256,
      role: patch.role,
      sourceProgramSha256: patch.sourceProgramSha256,
      workCellCount: patch.workCellCount.toString(),
    })),
    proofMethodSha256: STYLE_RADIAL_CLEARANCE_PROOF_SHA256,
    proofVersion: STYLE_RADIAL_CLEARANCE_PROOF_VERSION,
    radialClampInactive: true,
    styleId: styleRegistry.styleId,
    styleRegistrySha256: styleRegistry.bindingSha256,
    totalWorkCellCount: totalWorkCellCount.toString(),
  } satisfies CanonicalJsonValue;
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.style-radial-clearance-proof/evidence/v1',
    evidenceValue
  );
  return Object.freeze({
    proofVersion: STYLE_RADIAL_CLEARANCE_PROOF_VERSION,
    proofMethodSha256: STYLE_RADIAL_CLEARANCE_PROOF_SHA256,
    implementationScope: STYLE_RADIAL_CLEARANCE_PROOF_SCOPE,
    evidenceSha256,
    canonicalInputSha256: canonicalInput.canonicalInputSha256,
    styleRegistrySha256: styleRegistry.bindingSha256,
    styleId: styleRegistry.styleId,
    wallThicknessMm,
    minimumInnerRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
    patchProofs: Object.freeze(patchProofs),
    minimumClearanceLowerMm,
    minimumClearanceLowerPm: minimumClearanceLowerPm.toString(),
    totalWorkCellCount,
    allDeclaredSourcePatchesCovered: true,
    radialClampInactive: true,
    outerWallCompositionAdmissible: styleRegistry.outerWallCompositionAdmissible,
  });
}
