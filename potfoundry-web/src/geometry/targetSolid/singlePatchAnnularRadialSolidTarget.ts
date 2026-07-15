import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
} from './completeMappedArtifactGeometry';
import { sha256Utf8 } from './incrementalSha256';
import {
  deriveRadialClearanceTargetProgram,
  deriveRadialFixedRadiusTargetProgram,
  deriveRadialInnerCapTargetProgram,
  deriveRadialOffsetTargetProgram,
  deriveRadialOuterCapTargetProgram,
  deriveRadialRimTargetProgram,
  RADIAL_SOLID_PROGRAM_TRANSFORM_PROOF_SHA256,
  type TransformedRadialSolidProgram,
} from './radialSolidProgramTransform';
import {
  proveStyleRadialClearance,
  PRODUCTION_MINIMUM_INNER_RADIUS_MM,
  type StyleRadialClearanceProofOptions,
  type StyleRadialClearanceProofResult,
} from './styleRadialClearanceProof';
import {
  styleOuterWallTargetRegistryForProof,
  type StyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';
import { styleOuterWallTargetProgramsForProof } from './styleOuterWallTargetPrograms';
import {
  createTargetSurfaceComplexBinding,
  TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  targetSurfaceComplexForProof,
  type TargetSurfaceComplexBinding,
  type TargetSurfacePatchRole,
  type TargetSurfacePatchSide,
} from './targetSurfaceComplex';
import {
  createTargetSurfaceEvaluatorSetBinding,
  targetSurfaceEvaluatorSetForProof,
  type TargetSurfaceEvaluatorSetBinding,
} from './targetSurfaceEvaluatorSet';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  proveValidatedTargetScalarPositive,
  type ValidatedTargetScalarPositivityResult,
} from './validatedTargetScalarPositivity';
import type { GeneratedTargetProgramBackends } from './validatedResidualProgram';
import {
  proveValidatedProgramBoundaryIdentity,
  VALIDATED_PROGRAM_BOUNDARY_IDENTITY_PROOF_SHA256,
  type TargetProgramBoundarySide,
  type ValidatedProgramBoundaryIdentityResult,
} from './validatedProgramBoundaryIdentity';

export const SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_VERSION =
  'potfoundry.single-patch-annular-radial-solid-target/v3' as const;
export const SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE =
  'authenticated-six-patch-positive-drain-radial-atlas-with-conditional-junction-structure-no-image-closure-regularity-or-artifact-certificate' as const;
export const SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_VERSION,
    `scope=${SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE}`,
    `radial-transform-proof=${RADIAL_SOLID_PROGRAM_TRANSFORM_PROOF_SHA256}`,
    'input and all-style outer target registry are authenticated and identity-equal',
    'only one composition-admissible periodic outer-wall program with no feature closure patches is accepted',
    'only a strictly positive authenticated drain radius is accepted; zero-drain central atlases remain a separate implementation',
    'all declared source patches prove the production radial floor inactive before inner/cap derivation',
    'the bottom inner radius minus authenticated drain radius proves strictly positive over the complete angular boundary',
    `nonperiodic-junction-proof=${VALIDATED_PROGRAM_BOUNDARY_IDENTITY_PROOF_SHA256}`,
    'all six non-periodic patch junction programs align structurally after exact boundary substitution and conditional radial cancellation',
    'the junction check does not authenticate its nonzero declaration or prove total definedness, so exact junction-image equality remains false',
    'floor caps reuse the exact source-boundary z expression and affine clipping retains exact endpoint expressions',
    'outer, orientation-reversed inner, orientation-reversed top rim, two oriented annuli, and orientation-reversed drain wall form one abstract closed genus-one six-patch complex',
    'all six evaluators compile from exact canonical target programs and bind to the complete mapped target hash',
    'the surface complex and evaluator set are runtime capabilities; structural copies refuse',
    'this proves target identity, abstract closure, evaluator provenance, and radial/drain clearance only',
    'nonperiodic and periodic seam image equality, total evaluator definedness, Jacobian regularity, injectivity, physical normal thickness, device conformance, target self-intersection, and final-artifact distance remain false obligations',
  ].join('\n')
);

export type AnnularRadialSolidPatchId =
  | 'outer-wall'
  | 'inner-wall'
  | 'top-rim'
  | 'bottom-top'
  | 'bottom-under'
  | 'drain-wall';

export interface AnnularRadialSolidTargetProgram {
  readonly patchId: AnnularRadialSolidPatchId;
  readonly role: TargetSurfacePatchRole;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly backends: GeneratedTargetProgramBackends;
}

declare const singlePatchAnnularRadialSolidTargetBrand: unique symbol;

export interface SinglePatchAnnularRadialSolidTargetBinding {
  readonly schemaVersion: typeof SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_VERSION;
  readonly implementationScope: typeof SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly styleRegistrySha256: string;
  readonly styleId: string;
  readonly programs: readonly AnnularRadialSolidTargetProgram[];
  readonly surfaceComplex: TargetSurfaceComplexBinding;
  readonly evaluatorSet: TargetSurfaceEvaluatorSetBinding;
  readonly radialClearanceProof: StyleRadialClearanceProofResult;
  readonly drainClearanceProof: ValidatedTargetScalarPositivityResult;
  readonly nonPeriodicJunctionProofs: readonly ValidatedProgramBoundaryIdentityResult[];
  readonly completeAbstractClosedSurfaceComplex: true;
  readonly allPatchEvaluatorsAuthenticated: true;
  readonly radialClampInactive: true;
  readonly drainContainmentProven: true;
  readonly nonPeriodicJunctionStructureAlignedUnderDeclaredAssumptions: true;
  readonly nonPeriodicJunctionImageEqualityProven: false;
  readonly periodicSeamImageEqualityProven: false;
  readonly geometricImageRegularityProven: false;
  readonly physicalNormalThicknessProven: false;
  readonly finalArtifactToleranceProven: false;
  readonly [singlePatchAnnularRadialSolidTargetBrand]: true;
}

export type SinglePatchAnnularRadialSolidTargetErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_TOPOLOGY'
  | 'UNSUPPORTED_PATCH_COMPLEX'
  | 'CLEARANCE_NOT_PROVEN'
  | 'BINDING_INVALID';

export class SinglePatchAnnularRadialSolidTargetError extends Error {
  readonly code: SinglePatchAnnularRadialSolidTargetErrorCode;

  constructor(code: SinglePatchAnnularRadialSolidTargetErrorCode, message: string) {
    super(message);
    this.name = 'SinglePatchAnnularRadialSolidTargetError';
    this.code = code;
  }
}

interface EdgeDefinition {
  readonly edgeId: string;
  readonly incidents: readonly [
    Readonly<{ direction: 'forward' | 'reverse'; patchId: string; side: TargetSurfacePatchSide }>,
    Readonly<{ direction: 'forward' | 'reverse'; patchId: string; side: TargetSurfacePatchSide }>,
  ];
  readonly owner: Readonly<{ patchId: string; side: TargetSurfacePatchSide }>;
  readonly semantics: 'smooth-adjacency' | 'periodic-identification';
}

interface RegisteredBinding {
  readonly binding: SinglePatchAnnularRadialSolidTargetBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();
const PATCH_ROLES: Readonly<Record<AnnularRadialSolidPatchId, TargetSurfacePatchRole>> =
  Object.freeze({
    'bottom-top': 'bottom-top',
    'bottom-under': 'bottom-under',
    'drain-wall': 'drain-wall',
    'inner-wall': 'inner-wall',
    'outer-wall': 'outer-wall',
    'top-rim': 'top-rim',
  });

interface NonPeriodicJunctionDefinition {
  readonly junctionId: string;
  readonly left: Readonly<{
    patchId: AnnularRadialSolidPatchId;
    side: TargetProgramBoundarySide;
    reverseFreeParameter?: boolean;
  }>;
  readonly right: Readonly<{
    patchId: AnnularRadialSolidPatchId;
    side: TargetProgramBoundarySide;
    reverseFreeParameter?: boolean;
  }>;
}

const NON_PERIODIC_JUNCTIONS: readonly NonPeriodicJunctionDefinition[] = Object.freeze([
  Object.freeze({
    junctionId: 'junction/outer-rim',
    left: Object.freeze({ patchId: 'outer-wall', side: 'v1' }),
    right: Object.freeze({ patchId: 'top-rim', side: 'v1', reverseFreeParameter: true }),
  }),
  Object.freeze({
    junctionId: 'junction/rim-inner',
    left: Object.freeze({ patchId: 'top-rim', side: 'v0' }),
    right: Object.freeze({ patchId: 'inner-wall', side: 'v1' }),
  }),
  Object.freeze({
    junctionId: 'junction/inner-bottom-top',
    left: Object.freeze({ patchId: 'inner-wall', side: 'v0' }),
    right: Object.freeze({ patchId: 'bottom-top', side: 'v1' }),
  }),
  Object.freeze({
    junctionId: 'junction/bottom-top-drain',
    left: Object.freeze({ patchId: 'bottom-top', side: 'v0' }),
    right: Object.freeze({ patchId: 'drain-wall', side: 'v1' }),
  }),
  Object.freeze({
    junctionId: 'junction/drain-bottom-under',
    left: Object.freeze({ patchId: 'drain-wall', side: 'v0' }),
    right: Object.freeze({
      patchId: 'bottom-under',
      side: 'v0',
      reverseFreeParameter: true,
    }),
  }),
  Object.freeze({
    junctionId: 'junction/bottom-under-outer',
    left: Object.freeze({ patchId: 'bottom-under', side: 'v1' }),
    right: Object.freeze({ patchId: 'outer-wall', side: 'v0' }),
  }),
]);

function fail(
  code: SinglePatchAnnularRadialSolidTargetErrorCode,
  message: string
): never {
  throw new SinglePatchAnnularRadialSolidTargetError(code, message);
}

function makeEdge(
  edgeId: string,
  left: Readonly<{ patchId: AnnularRadialSolidPatchId; side: TargetSurfacePatchSide }>,
  right: Readonly<{ patchId: AnnularRadialSolidPatchId; side: TargetSurfacePatchSide }>,
  semantics: EdgeDefinition['semantics']
): EdgeDefinition {
  const sorted = [left, right].sort((a, b) => {
    const aKey = `${a.patchId}\0${a.side}`;
    const bKey = `${b.patchId}\0${b.side}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return Object.freeze({
    edgeId,
    incidents: Object.freeze([
      Object.freeze({ ...sorted[0], direction: 'forward' as const }),
      Object.freeze({ ...sorted[1], direction: 'reverse' as const }),
    ] as const),
    owner: Object.freeze({ ...sorted[0] }),
    semantics,
  });
}

function surfaceDefinition(programs: readonly AnnularRadialSolidTargetProgram[]): string {
  const programByPatch = new Map(programs.map((program) => [program.patchId, program]));
  const patchIds = Object.keys(PATCH_ROLES).sort() as AnnularRadialSolidPatchId[];
  const edges: EdgeDefinition[] = [];
  for (const patchId of patchIds) {
    edges.push(
      makeEdge(
        `periodic/${patchId}`,
        { patchId, side: 'u0' },
        { patchId, side: 'u1' },
        'periodic-identification'
      )
    );
  }
  edges.push(
    makeEdge(
      'junction/outer-rim',
      { patchId: 'outer-wall', side: 'v1' },
      { patchId: 'top-rim', side: 'v1' },
      'smooth-adjacency'
    ),
    makeEdge(
      'junction/rim-inner',
      { patchId: 'top-rim', side: 'v0' },
      { patchId: 'inner-wall', side: 'v1' },
      'smooth-adjacency'
    ),
    makeEdge(
      'junction/inner-bottom-top',
      { patchId: 'inner-wall', side: 'v0' },
      { patchId: 'bottom-top', side: 'v1' },
      'smooth-adjacency'
    ),
    makeEdge(
      'junction/bottom-top-drain',
      { patchId: 'bottom-top', side: 'v0' },
      { patchId: 'drain-wall', side: 'v1' },
      'smooth-adjacency'
    ),
    makeEdge(
      'junction/drain-bottom-under',
      { patchId: 'drain-wall', side: 'v0' },
      { patchId: 'bottom-under', side: 'v0' },
      'smooth-adjacency'
    ),
    makeEdge(
      'junction/bottom-under-outer',
      { patchId: 'bottom-under', side: 'v1' },
      { patchId: 'outer-wall', side: 'v0' },
      'smooth-adjacency'
    )
  );
  edges.sort((left, right) =>
    left.edgeId < right.edgeId ? -1 : left.edgeId > right.edgeId ? 1 : 0
  );
  const definition = {
    edges: edges.map((edge) => ({
      edgeId: edge.edgeId,
      incidents: edge.incidents.map((incident) => ({
        direction: incident.direction,
        patchId: incident.patchId,
        side: incident.side,
      })),
      owner: { patchId: edge.owner.patchId, side: edge.owner.side },
      semantics: edge.semantics,
    })),
    features: [],
    patches: patchIds.map((patchId) => {
      const program = programByPatch.get(patchId);
      if (program === undefined) fail('INVALID_INPUT', `missing program '${patchId}'`);
      return {
        declaredEvaluatorProgramSha256: program.programSha256,
        domainKind: 'unit-square' as const,
        patchId,
        role: PATCH_ROLES[patchId],
      };
    }),
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  } satisfies CanonicalJsonValue;
  return canonicalizeCertificationJson(definition);
}

function transformedProgram(
  patchId: AnnularRadialSolidPatchId,
  transformed: TransformedRadialSolidProgram
): AnnularRadialSolidTargetProgram {
  return Object.freeze({
    patchId,
    role: PATCH_ROLES[patchId],
    programCanonicalJson: transformed.programCanonicalJson,
    programSha256: transformed.programSha256,
    backends: transformed.backends,
  });
}

/**
 * Build the first executable closed-solid target atlas. Unsupported feature
 * complexes and zero-drain topology refuse instead of receiving a false flag.
 */
export function createSinglePatchAnnularRadialSolidTargetBinding(
  canonicalInputValue: CanonicalTargetInputBinding,
  styleRegistryValue: StyleOuterWallTargetRegistryBinding,
  options: StyleRadialClearanceProofOptions = {}
): SinglePatchAnnularRadialSolidTargetBinding {
  const canonicalInput = canonicalTargetInputForProof(canonicalInputValue);
  const styleRegistry = styleOuterWallTargetRegistryForProof(styleRegistryValue);
  if (
    styleRegistry.canonicalInputSha256 !== canonicalInput.canonicalInputSha256 ||
    styleRegistry.styleId !== canonicalInputValue.style.styleId
  ) {
    fail('INVALID_INPUT', 'canonical input and style registry do not describe one target');
  }
  const geometry = canonicalInputValue.geometry.geometry;
  if (!(geometry.r_drain > 0)) {
    fail('UNSUPPORTED_TOPOLOGY', 'the single-patch annular atlas requires a positive drain radius');
  }
  if (
    !styleRegistry.outerWallCompositionAdmissible ||
    !styleRegistry.legacyProductionIntegrationAdmissible
  ) {
    fail('UNSUPPORTED_PATCH_COMPLEX', 'outer target has a composition or production-integration blocker');
  }
  const sourcePrograms = styleOuterWallTargetProgramsForProof(styleRegistry);
  if (
    sourcePrograms.length !== 1 ||
    sourcePrograms[0].patchId !== 'outer-wall' ||
    sourcePrograms[0].role !== 'outer-wall'
  ) {
    fail('UNSUPPORTED_PATCH_COMPLEX', 'atlas currently accepts exactly one periodic outer-wall patch');
  }
  const source = sourcePrograms[0];
  let radialClearanceProof: StyleRadialClearanceProofResult;
  try {
    radialClearanceProof = proveStyleRadialClearance(
      canonicalInputValue,
      styleRegistry,
      options
    );
  } catch (error) {
    fail(
      'CLEARANCE_NOT_PROVEN',
      `radial clamp inactivity was not proven: ${error instanceof Error ? error.message : 'unknown failure'}`
    );
  }
  const bottomFraction = geometry.t_bottom / geometry.H;
  const drainClearanceProgram = deriveRadialClearanceTargetProgram(
    source.programCanonicalJson,
    {
      evaluatorId: 'potfoundry.drain-clearance',
      evaluatorVersion: 'v1',
      patchId: 'validity/drain-clearance',
    },
    {
      wallThicknessMm: geometry.t_wall,
      minimumRadiusMm: geometry.r_drain,
      sourceVStart: bottomFraction,
      sourceVEnd: bottomFraction,
    }
  );
  let drainClearanceProof: ValidatedTargetScalarPositivityResult;
  try {
    const remainingWorkCells = options.maxTotalWorkCells === undefined
      ? undefined
      : options.maxTotalWorkCells - radialClearanceProof.totalWorkCellCount;
    if (remainingWorkCells !== undefined && remainingWorkCells <= 0) {
      fail('CLEARANCE_NOT_PROVEN', 'no aggregate work budget remains for drain containment');
    }
    drainClearanceProof = proveValidatedTargetScalarPositive(
      drainClearanceProgram.programCanonicalJson,
      {
        maxDepth: options.maxDepthPerPatch,
        maxWorkCells: remainingWorkCells,
        cancellationFlag: options.cancellationFlag,
        progressCounter: options.progressCounter,
      }
    );
  } catch (error) {
    if (error instanceof SinglePatchAnnularRadialSolidTargetError) throw error;
    fail(
      'CLEARANCE_NOT_PROVEN',
      `drain containment was not proven: ${error instanceof Error ? error.message : 'unknown failure'}`
    );
  }

  const outerProgram: AnnularRadialSolidTargetProgram = Object.freeze({
    patchId: 'outer-wall',
    role: 'outer-wall',
    programCanonicalJson: source.programCanonicalJson,
    programSha256: source.programSha256,
    backends: source.backends,
  });
  const programs = Object.freeze([
    transformedProgram(
      'bottom-top',
      deriveRadialInnerCapTargetProgram(
        source.programCanonicalJson,
        { evaluatorId: 'potfoundry.bottom-top', evaluatorVersion: 'v1', patchId: 'bottom-top' },
        {
          sourceV: bottomFraction,
          wallThicknessMm: geometry.t_wall,
          minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
          endRadiusMm: geometry.r_drain,
          zMode: 'source-boundary',
          reverseU: true,
          reverseRadialParameter: true,
        }
      )
    ),
    transformedProgram(
      'bottom-under',
      deriveRadialOuterCapTargetProgram(
        source.programCanonicalJson,
        { evaluatorId: 'potfoundry.bottom-under', evaluatorVersion: 'v1', patchId: 'bottom-under' },
        {
          sourceV: 0,
          wallThicknessMm: geometry.t_wall,
          minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
          endRadiusMm: geometry.r_drain,
          zMode: 'source-boundary',
          reverseRadialParameter: true,
        }
      )
    ),
    transformedProgram(
      'drain-wall',
      deriveRadialFixedRadiusTargetProgram(
        source.programCanonicalJson,
        { evaluatorId: 'potfoundry.drain-wall', evaluatorVersion: 'v1', patchId: 'drain-wall' },
        {
          sourceVStart: 0,
          sourceVEnd: bottomFraction,
          radiusMm: geometry.r_drain,
          reverseU: true,
        }
      )
    ),
    transformedProgram(
      'inner-wall',
      deriveRadialOffsetTargetProgram(
        source.programCanonicalJson,
        { evaluatorId: 'potfoundry.inner-wall', evaluatorVersion: 'v1', patchId: 'inner-wall' },
        {
          sourceVStart: bottomFraction,
          sourceVEnd: 1,
          wallThicknessMm: geometry.t_wall,
          minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
          reverseU: true,
        }
      )
    ),
    outerProgram,
    transformedProgram(
      'top-rim',
      deriveRadialRimTargetProgram(
        source.programCanonicalJson,
        { evaluatorId: 'potfoundry.top-rim', evaluatorVersion: 'v1', patchId: 'top-rim' },
        {
          sourceV: 1,
          wallThicknessMm: geometry.t_wall,
          minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
          reverseU: true,
        }
      )
    ),
  ]);
  const programByPatch = new Map(programs.map((program) => [program.patchId, program]));
  const nonPeriodicJunctionProofs = Object.freeze(
    NON_PERIODIC_JUNCTIONS.map((junction) => {
      const left = programByPatch.get(junction.left.patchId);
      const right = programByPatch.get(junction.right.patchId);
      if (left === undefined || right === undefined) {
        fail('INVALID_INPUT', `junction '${junction.junctionId}' references a missing program`);
      }
      try {
        return proveValidatedProgramBoundaryIdentity(
          {
            programCanonicalJson: left.programCanonicalJson,
            side: junction.left.side,
            reverseFreeParameter: junction.left.reverseFreeParameter,
          },
          {
            programCanonicalJson: right.programCanonicalJson,
            side: junction.right.side,
            reverseFreeParameter: junction.right.reverseFreeParameter,
          },
          {
            radialProjectionNonzeroEvidenceSha256:
              radialClearanceProof.evidenceSha256,
          }
        );
      } catch (error) {
        fail(
          'BINDING_INVALID',
          `junction '${junction.junctionId}' was not proven: ` +
            `${error instanceof Error ? error.message : 'unknown failure'}`
        );
      }
    })
  );
  const surfaceComplex = createTargetSurfaceComplexBinding(
    canonicalInputValue,
    surfaceDefinition(programs)
  );
  const geometryTarget =
    createCompleteMappedGeometryTargetBindingFromSurfaceComplex(surfaceComplex);
  const evaluators = surfaceComplex.patches.map((patch) => {
    const program = programByPatch.get(patch.patchId as AnnularRadialSolidPatchId);
    if (program === undefined) fail('INVALID_INPUT', `surface patch '${patch.patchId}' has no program`);
    return compileValidatedResidualEvaluator({
      targetSha256: geometryTarget.targetSha256,
      programCanonicalJson: program.programCanonicalJson,
    });
  });
  const evaluatorSet = createTargetSurfaceEvaluatorSetBinding(surfaceComplex, evaluators);
  const bindingValue = {
    allPatchEvaluatorsAuthenticated: true,
    canonicalInputSha256: canonicalInput.canonicalInputSha256,
    completeAbstractClosedSurfaceComplex: true,
    drainClearanceEvidenceSha256: drainClearanceProof.evidenceSha256,
    drainContainmentProven: true,
    evaluatorSetSha256: evaluatorSet.evaluatorSetSha256,
    finalArtifactToleranceProven: false,
    geometricImageRegularityProven: false,
    implementationScope: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE,
    physicalNormalThicknessProven: false,
    programManifest: programs.map((program) => ({
      patchId: program.patchId,
      programSha256: program.programSha256,
      role: program.role,
    })),
    proofMethodSha256: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_PROOF_SHA256,
    radialClampInactive: true,
    radialClearanceEvidenceSha256: radialClearanceProof.evidenceSha256,
    nonPeriodicJunctionStructureAlignedUnderDeclaredAssumptions: true,
    nonPeriodicJunctionImageEqualityProven: false,
    nonPeriodicJunctionProofs: nonPeriodicJunctionProofs.map((proof, index) => ({
      evidenceSha256: proof.evidenceSha256,
      junctionId: NON_PERIODIC_JUNCTIONS[index].junctionId,
    })),
    periodicSeamImageEqualityProven: false,
    schemaVersion: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_VERSION,
    styleId: styleRegistry.styleId,
    styleRegistrySha256: styleRegistry.bindingSha256,
    targetSurfaceComplexSha256: surfaceComplex.targetSurfaceComplexSha256,
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.single-patch-annular-radial-solid-target/binding/v1',
    bindingValue
  );
  const binding = Object.freeze({
    schemaVersion: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_VERSION,
    implementationScope: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE,
    proofMethodSha256: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: canonicalInput.canonicalInputSha256,
    styleRegistrySha256: styleRegistry.bindingSha256,
    styleId: styleRegistry.styleId,
    programs,
    surfaceComplex,
    evaluatorSet,
    radialClearanceProof,
    drainClearanceProof,
    nonPeriodicJunctionProofs,
    completeAbstractClosedSurfaceComplex: true,
    allPatchEvaluatorsAuthenticated: true,
    radialClampInactive: true,
    drainContainmentProven: true,
    nonPeriodicJunctionStructureAlignedUnderDeclaredAssumptions: true,
    nonPeriodicJunctionImageEqualityProven: false,
    periodicSeamImageEqualityProven: false,
    geometricImageRegularityProven: false,
    physicalNormalThicknessProven: false,
    finalArtifactToleranceProven: false,
  }) as SinglePatchAnnularRadialSolidTargetBinding;
  registry.set(binding, Object.freeze({ binding }));
  return binding;
}

/** Reauthenticate the closed-target capability and all nested proof boundaries. */
export function singlePatchAnnularRadialSolidTargetForProof(
  value: SinglePatchAnnularRadialSolidTargetBinding
): SinglePatchAnnularRadialSolidTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('BINDING_INVALID', 'binding must be an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('BINDING_INVALID', 'binding must be an authenticated capability');
  }
  targetSurfaceComplexForProof(value.surfaceComplex);
  targetSurfaceEvaluatorSetForProof(value.evaluatorSet);
  if (
    value.schemaVersion !== SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_VERSION ||
    value.implementationScope !== SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE ||
    value.proofMethodSha256 !== SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_PROOF_SHA256 ||
    value.completeAbstractClosedSurfaceComplex !== true ||
    value.allPatchEvaluatorsAuthenticated !== true ||
    value.radialClampInactive !== true ||
    value.drainContainmentProven !== true ||
    value.nonPeriodicJunctionStructureAlignedUnderDeclaredAssumptions !== true ||
    value.nonPeriodicJunctionImageEqualityProven !== false ||
    value.periodicSeamImageEqualityProven !== false ||
    value.nonPeriodicJunctionProofs.length !== NON_PERIODIC_JUNCTIONS.length ||
    value.nonPeriodicJunctionProofs.some(
      (proof) =>
        proof.structuralBoundaryTermsIdenticalUnderDeclaredAssumptions !== true ||
        proof.radialProjectionNonzeroEvidenceAuthenticated !== false ||
        proof.totalDefinednessProven !== false ||
        proof.exactBoundaryImageIdentityProven !== false
    ) ||
    value.geometricImageRegularityProven !== false ||
    value.physicalNormalThicknessProven !== false ||
    value.finalArtifactToleranceProven !== false
  ) {
    fail('BINDING_INVALID', 'binding fields are inconsistent');
  }
  return value;
}
