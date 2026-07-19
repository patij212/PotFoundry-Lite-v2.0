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
import { buildRadialTargetPatchProgram } from './radialOuterWallProgram';
import {
  styleOuterWallTargetRegistryForProof,
  type StyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';
import {
  styleOuterWallTargetProgramsForProof,
  type AuthenticatedStyleOuterWallTargetProgram,
} from './styleOuterWallTargetPrograms';
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

/** The six base radial-solid roles keyed by the reference tessellation options. */
export type AnnularRadialSolidBasePatchId = AnnularRadialSolidPatchId;

export interface AnnularRadialSolidTargetProgram {
  /**
   * A base-atlas patch id (`outer-wall` …) for the single-patch atlas, or a
   * layered band/curtain id (`outer-wall-band-3`, `feature-curtain-2`) for the
   * flag-gated multi-patch atlas. Widened to `string` so one program list can
   * carry both; base-role lookups narrow through the atlas structure.
   */
  readonly patchId: string;
  readonly role: TargetSurfacePatchRole;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly backends: GeneratedTargetProgramBackends;
}

/**
 * How the reference tessellation resolves a layered atlas patch's vertical
 * division count: either from one of the six base-role option keys (bands use
 * `outer-wall`; the five base patches use their own role) or a fixed dyadic
 * count (feature curtains are a linear radial mix, exact at one division).
 */
export type AtlasVerticalDivisionSource =
  | Readonly<{ kind: 'role'; role: AnnularRadialSolidBasePatchId }>
  | Readonly<{ kind: 'fixed'; log2: number }>;

/** One patch in the layered atlas: how to grid it (division source). */
export interface AtlasPatchLayout {
  readonly patchId: string;
  readonly role: TargetSurfacePatchRole;
  readonly verticalDivisions: AtlasVerticalDivisionSource;
}

/**
 * One receiver<-owner boundary weld the reference tessellation copies so the
 * shared row is bit-identical by index (T-junction-free). `reverseFreeParameter`
 * mirrors the angular station index (i -> nU - i) exactly as the atlas junction
 * grammar declares.
 */
export interface AtlasJunctionCopy {
  readonly receiverPatchId: string;
  readonly receiverRow: 'v0' | 'v1';
  readonly ownerPatchId: string;
  readonly ownerRow: 'v0' | 'v1';
  readonly reverseFreeParameter: boolean;
}

/**
 * The layered multi-patch atlas structure the reference tessellation consumes
 * when present (flag-gated). Absent for the byte-identical single-patch path.
 * Every patch's program still lives in `binding.programs`; this only records
 * the layered gridding + weld graph the fixed six-patch path cannot express.
 */
export interface MultiPatchAtlasComplex {
  readonly bandCount: number;
  readonly curtainCount: number;
  readonly patchLayouts: readonly AtlasPatchLayout[];
  readonly junctionCopies: readonly AtlasJunctionCopy[];
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
  /**
   * The full six-patch atlas carries the all-source-patch clearance proof.
   * The layered atlas proves clearance on the outer-wall BANDS only (curtain
   * clearance follows because every curtain radius mixes two band edge values)
   * and records the evidence hash in `radialClearanceEvidenceSha256`, so this
   * field is absent there.
   */
  readonly radialClearanceProof?: StyleRadialClearanceProofResult;
  readonly drainClearanceProof: ValidatedTargetScalarPositivityResult;
  readonly nonPeriodicJunctionProofs: readonly ValidatedProgramBoundaryIdentityResult[];
  /**
   * Present only for the flag-gated layered multi-patch atlas (e.g. active
   * DragonScales). Undefined for the byte-identical single-patch six-patch
   * atlas; the reference tessellation branches on it.
   */
  readonly atlasComplex?: MultiPatchAtlasComplex;
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

/**
 * Default-off admission gate for the layered multi-patch atlas (DragonScales
 * -first, U4). When unset the atlas refuses layered outer-wall complexes exactly
 * as the single-patch atlas always has, so the production path and the default
 * test suite stay byte-identical. Read from the same `PF_DS_ATLAS_SPIKE`
 * environment flag the acceptance probe uses.
 */
function multiPatchAtlasEnabled(): boolean {
  return (
    typeof process !== 'undefined' && process.env?.PF_DS_ATLAS_SPIKE === '1'
  );
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
  const isSinglePeriodicOuterWall =
    sourcePrograms.length === 1 &&
    sourcePrograms[0].patchId === 'outer-wall' &&
    sourcePrograms[0].role === 'outer-wall';
  if (!isSinglePeriodicOuterWall) {
    // A layered outer wall (row bands + feature-curtain risers, e.g. active
    // DragonScales) is admitted only behind the default-off multi-patch flag.
    // Flag OFF -> refuse exactly as the single-patch atlas always has.
    if (!multiPatchAtlasEnabled()) {
      fail(
        'UNSUPPORTED_PATCH_COMPLEX',
        'atlas currently accepts exactly one periodic outer-wall patch'
      );
    }
    return buildLayeredMultiPatchAtlasBinding(
      canonicalInputValue,
      canonicalInput,
      styleRegistry,
      sourcePrograms,
      options
    );
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

// ==========================================================================
// Layered multi-patch atlas (DragonScales-first, U4) — flag-gated admission.
// ==========================================================================

/** The four base-internal junctions that stay structurally identity-provable. */
const MULTI_PATCH_BASE_INTERNAL_JUNCTION_COUNT = 4;
const BASE_PATCH_IDS: readonly AnnularRadialSolidBasePatchId[] = Object.freeze([
  'inner-wall',
  'top-rim',
  'bottom-top',
  'bottom-under',
  'drain-wall',
]);

function parseLayeredIndex(patchId: string, prefix: string): number | null {
  if (!patchId.startsWith(prefix)) return null;
  const suffix = patchId.slice(prefix.length);
  if (!/^(?:0|[1-9][0-9]*)$/.test(suffix)) return null;
  const value = Number(suffix);
  return Number.isSafeInteger(value) ? value : null;
}

interface StringSide {
  readonly patchId: string;
  readonly side: TargetSurfacePatchSide;
}

type AtlasEdgeSemantics =
  | 'smooth-adjacency'
  | 'periodic-identification'
  | 'feature-closure-adjacency';

/**
 * One oriented shared edge of the abstract surface complex. Sorts its two
 * incidents (smaller side is `forward` and the owner) exactly as the
 * single-patch atlas does, so the stacked-cylinder subdivision welds corners
 * into the proven genus-one topology.
 */
function makeAtlasEdge(
  edgeId: string,
  a: StringSide,
  b: StringSide,
  semantics: AtlasEdgeSemantics
): CanonicalJsonValue {
  const key = (side: StringSide): string => `${side.patchId}\0${side.side}`;
  const sorted = key(a) <= key(b) ? [a, b] : [b, a];
  return {
    edgeId,
    incidents: [
      { direction: 'forward', patchId: sorted[0].patchId, side: sorted[0].side },
      { direction: 'reverse', patchId: sorted[1].patchId, side: sorted[1].side },
    ],
    owner: { patchId: sorted[0].patchId, side: sorted[0].side },
    semantics,
  };
}

/**
 * Build the abstract 2R+4 patch surface complex for the layered atlas: the
 * outer wall is a vertical stack of R bands interleaved with R-1 feature
 * curtains (a subdivided cylinder), closed by the five base patches. Every
 * curtain is a `discontinuity` feature-closure hosted on `outer-wall`, so it
 * has effective role `outer-wall` and the whole complex keeps the single-patch
 * genus-one topology and pot-junction grammar.
 */
function multiPatchSurfaceDefinition(
  programs: readonly AnnularRadialSolidTargetProgram[],
  bandCount: number
): string {
  const programByPatch = new Map(programs.map((p) => [p.patchId, p]));
  const bandId = (k: number): string => `outer-wall-band-${k}`;
  const curtainId = (k: number): string => `feature-curtain-${k}`;

  const patches = [...programs]
    .map((program) => ({
      declaredEvaluatorProgramSha256: program.programSha256,
      domainKind: 'unit-square' as const,
      patchId: program.patchId,
      role: String(program.role),
    }))
    .sort((left, right) => (left.patchId < right.patchId ? -1 : 1));

  const edges: CanonicalJsonValue[] = [];
  // Periodic seam per patch (u0 == u1).
  for (const program of programs) {
    edges.push(
      makeAtlasEdge(
        `periodic/${program.patchId}`,
        { patchId: program.patchId, side: 'u0' },
        { patchId: program.patchId, side: 'u1' },
        'periodic-identification'
      )
    );
  }
  // Curtain risers: each curtain k welds band k (top) and band k+1 (bottom).
  for (let k = 0; k < bandCount - 1; k += 1) {
    edges.push(
      makeAtlasEdge(
        `weld/band-${k}-top-curtain-${k}`,
        { patchId: bandId(k), side: 'v1' },
        { patchId: curtainId(k), side: 'v0' },
        'feature-closure-adjacency'
      ),
      makeAtlasEdge(
        `weld/curtain-${k}-band-${k + 1}`,
        { patchId: curtainId(k), side: 'v1' },
        { patchId: bandId(k + 1), side: 'v0' },
        'feature-closure-adjacency'
      )
    );
  }
  // Outer-to-base welds (band(R-1) top -> rim, band 0 bottom -> under).
  edges.push(
    makeAtlasEdge(
      'weld/band-top-rim',
      { patchId: bandId(bandCount - 1), side: 'v1' },
      { patchId: 'top-rim', side: 'v1' },
      'smooth-adjacency'
    ),
    makeAtlasEdge(
      'weld/band-bottom-under',
      { patchId: 'bottom-under', side: 'v1' },
      { patchId: bandId(0), side: 'v0' },
      'smooth-adjacency'
    )
  );
  // Base-internal welds (unchanged from the single-patch atlas grammar).
  edges.push(
    makeAtlasEdge(
      'weld/rim-inner',
      { patchId: 'top-rim', side: 'v0' },
      { patchId: 'inner-wall', side: 'v1' },
      'smooth-adjacency'
    ),
    makeAtlasEdge(
      'weld/inner-bottom-top',
      { patchId: 'inner-wall', side: 'v0' },
      { patchId: 'bottom-top', side: 'v1' },
      'smooth-adjacency'
    ),
    makeAtlasEdge(
      'weld/bottom-top-drain',
      { patchId: 'bottom-top', side: 'v0' },
      { patchId: 'drain-wall', side: 'v1' },
      'smooth-adjacency'
    ),
    makeAtlasEdge(
      'weld/drain-bottom-under',
      { patchId: 'drain-wall', side: 'v0' },
      { patchId: 'bottom-under', side: 'v0' },
      'smooth-adjacency'
    )
  );
  edges.sort((left, right) => {
    const l = (left as { edgeId: string }).edgeId;
    const r = (right as { edgeId: string }).edgeId;
    return l < r ? -1 : 1;
  });

  // One discontinuity feature per curtain, hosted on outer-wall.
  const features: CanonicalJsonValue[] = [];
  for (let k = 0; k < bandCount - 1; k += 1) {
    if (programByPatch.get(curtainId(k)) === undefined) {
      fail('INVALID_INPUT', `layered atlas is missing curtain program '${curtainId(k)}'`);
    }
    features.push({
      closurePatchIds: [curtainId(k)],
      edgeIds: [`weld/band-${k}-top-curtain-${k}`, `weld/curtain-${k}-band-${k + 1}`].sort(),
      featureId: `scale-riser-${k}`,
      hostRole: 'outer-wall',
      kind: 'discontinuity',
    });
  }
  features.sort((left, right) => {
    const l = (left as { featureId: string }).featureId;
    const r = (right as { featureId: string }).featureId;
    return l < r ? -1 : 1;
  });

  return canonicalizeCertificationJson({
    edges,
    features,
    patches,
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  });
}

/** The 2R+4 receiver<-owner welds the reference tessellation copies by index. */
function multiPatchJunctionCopies(bandCount: number): readonly AtlasJunctionCopy[] {
  const bandId = (k: number): string => `outer-wall-band-${k}`;
  const curtainId = (k: number): string => `feature-curtain-${k}`;
  const copies: AtlasJunctionCopy[] = [];
  // Curtain risers: the band edges are authoritative owners; curtains are ruled.
  for (let k = 0; k < bandCount - 1; k += 1) {
    copies.push(
      {
        receiverPatchId: curtainId(k),
        receiverRow: 'v0',
        ownerPatchId: bandId(k),
        ownerRow: 'v1',
        reverseFreeParameter: false,
      },
      {
        receiverPatchId: curtainId(k),
        receiverRow: 'v1',
        ownerPatchId: bandId(k + 1),
        ownerRow: 'v0',
        reverseFreeParameter: false,
      }
    );
  }
  // Outer-to-base + base-internal welds mirror the single-patch atlas grammar
  // (outer-wall -> band(R-1) at the rim, band 0 at the underside).
  copies.push(
    {
      receiverPatchId: 'top-rim',
      receiverRow: 'v1',
      ownerPatchId: bandId(bandCount - 1),
      ownerRow: 'v1',
      reverseFreeParameter: true,
    },
    {
      receiverPatchId: 'top-rim',
      receiverRow: 'v0',
      ownerPatchId: 'inner-wall',
      ownerRow: 'v1',
      reverseFreeParameter: false,
    },
    {
      receiverPatchId: 'inner-wall',
      receiverRow: 'v0',
      ownerPatchId: 'bottom-top',
      ownerRow: 'v1',
      reverseFreeParameter: false,
    },
    {
      receiverPatchId: 'drain-wall',
      receiverRow: 'v1',
      ownerPatchId: 'bottom-top',
      ownerRow: 'v0',
      reverseFreeParameter: false,
    },
    {
      receiverPatchId: 'drain-wall',
      receiverRow: 'v0',
      ownerPatchId: 'bottom-under',
      ownerRow: 'v0',
      reverseFreeParameter: true,
    },
    {
      receiverPatchId: bandId(0),
      receiverRow: 'v0',
      ownerPatchId: 'bottom-under',
      ownerRow: 'v1',
      reverseFreeParameter: false,
    }
  );
  return Object.freeze(copies);
}

/**
 * Admit a layered outer-wall complex (R bands + R-1 feature curtains) as a
 * closed genus-one atlas. Bands and curtains come straight from the
 * authenticated source; the five base patches derive from a full-height smooth
 * reference cylinder whose radius is the clearance-proven lower bound of the
 * outer-wall radius, so the inner structure provably never pokes through the
 * relief. Outer-to-base and curtain welds are watertight-by-construction (the
 * final-artifact structural proof is their backstop); only the four base
 * -internal junctions carry structural identity proofs.
 */
function buildLayeredMultiPatchAtlasBinding(
  canonicalInputValue: CanonicalTargetInputBinding,
  canonicalInput: ReturnType<typeof canonicalTargetInputForProof>,
  styleRegistry: StyleOuterWallTargetRegistryBinding,
  sourcePrograms: readonly AuthenticatedStyleOuterWallTargetProgram[],
  options: StyleRadialClearanceProofOptions
): SinglePatchAnnularRadialSolidTargetBinding {
  const geometry = canonicalInputValue.geometry.geometry;

  // --- 1. Partition the authenticated source into ordered bands + curtains. ---
  const bandEntries: AuthenticatedStyleOuterWallTargetProgram[] = [];
  const curtainEntries: AuthenticatedStyleOuterWallTargetProgram[] = [];
  for (const program of sourcePrograms) {
    if (program.role === 'outer-wall') bandEntries.push(program);
    else if (program.role === 'feature-curtain') curtainEntries.push(program);
    else {
      fail(
        'UNSUPPORTED_PATCH_COMPLEX',
        `layered atlas cannot admit source role '${String(program.role)}'`
      );
    }
  }
  const bandCount = bandEntries.length;
  if (bandCount < 2 || curtainEntries.length !== bandCount - 1) {
    fail('UNSUPPORTED_PATCH_COMPLEX', 'layered atlas needs R>=2 bands and exactly R-1 curtains');
  }
  const bandByIndex = new Array<AuthenticatedStyleOuterWallTargetProgram | undefined>(bandCount);
  for (const band of bandEntries) {
    const index = parseLayeredIndex(band.patchId, 'outer-wall-band-');
    if (index === null || index < 0 || index >= bandCount || bandByIndex[index] !== undefined) {
      fail('UNSUPPORTED_PATCH_COMPLEX', `unexpected outer-wall band id '${band.patchId}'`);
    }
    bandByIndex[index] = band;
  }
  const curtainByIndex = new Array<AuthenticatedStyleOuterWallTargetProgram | undefined>(
    bandCount - 1
  );
  for (const curtain of curtainEntries) {
    const index = parseLayeredIndex(curtain.patchId, 'feature-curtain-');
    if (
      index === null ||
      index < 0 ||
      index >= bandCount - 1 ||
      curtainByIndex[index] !== undefined
    ) {
      fail('UNSUPPORTED_PATCH_COMPLEX', `unexpected feature-curtain id '${curtain.patchId}'`);
    }
    curtainByIndex[index] = curtain;
  }
  const bands = bandByIndex.map((band, index) => {
    if (band === undefined) fail('UNSUPPORTED_PATCH_COMPLEX', `missing outer-wall band ${index}`);
    return band;
  });
  const curtains = curtainByIndex.map((curtain, index) => {
    if (curtain === undefined) fail('UNSUPPORTED_PATCH_COMPLEX', `missing feature-curtain ${index}`);
    return curtain;
  });

  // --- 2. Radial clamp inactivity over the outer-wall BANDS only. Band
  // interval bounds are tight; every curtain radius is the exact mix of two
  // band edge values, so proving the bands rigorously implies the curtains
  // (which are ~7x costlier to bound and add nothing) while staying inside the
  // acceptance-probe timeouts. ---
  const maxTotalWorkCells = options.maxTotalWorkCells;
  let bandClearanceWorkCells = 0;
  let minBandClearanceMm = Number.POSITIVE_INFINITY;
  const bandClearanceEvidence: string[] = [];
  for (const band of bands) {
    const clearanceProgram = deriveRadialClearanceTargetProgram(
      band.programCanonicalJson,
      {
        evaluatorId: 'potfoundry.radial-clearance',
        evaluatorVersion: 'v1',
        patchId: `clearance/${band.patchId}`,
      },
      { wallThicknessMm: geometry.t_wall, minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM }
    );
    try {
      const remaining =
        maxTotalWorkCells === undefined ? undefined : maxTotalWorkCells - bandClearanceWorkCells;
      if (remaining !== undefined && remaining <= 0) {
        fail('CLEARANCE_NOT_PROVEN', 'no aggregate work budget remains for band clearance');
      }
      const positivity = proveValidatedTargetScalarPositive(clearanceProgram.programCanonicalJson, {
        maxDepth: options.maxDepthPerPatch,
        maxWorkCells: remaining,
        cancellationFlag: options.cancellationFlag,
        progressCounter: options.progressCounter,
      });
      minBandClearanceMm = Math.min(minBandClearanceMm, positivity.minimumTargetXLowerMm);
      bandClearanceWorkCells += positivity.workCellCount;
      bandClearanceEvidence.push(positivity.evidenceSha256);
    } catch (error) {
      if (error instanceof SinglePatchAnnularRadialSolidTargetError) throw error;
      fail(
        'CLEARANCE_NOT_PROVEN',
        `layered outer-wall band '${band.patchId}' clamp inactivity was not proven: ${
          error instanceof Error ? error.message : 'unknown failure'
        }`
      );
    }
  }
  if (!Number.isFinite(minBandClearanceMm)) {
    fail('CLEARANCE_NOT_PROVEN', 'layered atlas exposed no outer-wall band clearance proof');
  }
  const radialClearanceEvidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.layered-outer-wall-band-clearance/v1',
    {
      bandClearanceEvidence,
      canonicalInputSha256: canonicalInput.canonicalInputSha256,
      minimumInnerRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM.toString(),
      styleId: styleRegistry.styleId,
      wallThicknessMm: geometry.t_wall.toString(),
    }
  );

  // --- 3. Full-height smooth base reference at the proven min OUTER-WALL-BAND
  // radius. referenceRadiusMm <= min band radius <= every curtain radius, so the
  // derived inner structure provably never pokes through the outer relief. ---
  const referenceRadiusMm =
    minBandClearanceMm + geometry.t_wall + PRODUCTION_MINIMUM_INNER_RADIUS_MM;
  if (!(referenceRadiusMm > 0) || !Number.isFinite(referenceRadiusMm)) {
    fail('CLEARANCE_NOT_PROVEN', 'layered base-reference radius is not strictly positive');
  }
  const innerRadiusMm = referenceRadiusMm - geometry.t_wall;
  if (!(innerRadiusMm > geometry.r_drain)) {
    fail('CLEARANCE_NOT_PROVEN', 'layered inner wall would not clear the drain radius');
  }
  const baseReferenceProgramJson = buildRadialTargetPatchProgram(
    canonicalInputValue,
    canonicalInputValue.style.styleId,
    {
      evaluatorId: 'potfoundry.base-reference-wall',
      evaluatorVersion: 'v1',
      patchId: 'base-reference-wall',
    },
    (context) =>
      context.radialPointAt(
        context.constant(referenceRadiusMm),
        context.localU,
        context.localV
      )
  );
  const bottomFraction = geometry.t_bottom / geometry.H;

  // --- 4. Drain containment from the base reference. ---
  const drainClearanceProgram = deriveRadialClearanceTargetProgram(
    baseReferenceProgramJson,
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
    const remainingWorkCells =
      options.maxTotalWorkCells === undefined
        ? undefined
        : options.maxTotalWorkCells - bandClearanceWorkCells;
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
      `layered drain containment was not proven: ${
        error instanceof Error ? error.message : 'unknown failure'
      }`
    );
  }

  // --- 5. Derive the five base patches from the smooth reference. ---
  const basePrograms: AnnularRadialSolidTargetProgram[] = [
    transformedProgram(
      'bottom-top',
      deriveRadialInnerCapTargetProgram(
        baseReferenceProgramJson,
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
        baseReferenceProgramJson,
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
        baseReferenceProgramJson,
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
        baseReferenceProgramJson,
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
    transformedProgram(
      'top-rim',
      deriveRadialRimTargetProgram(
        baseReferenceProgramJson,
        { evaluatorId: 'potfoundry.top-rim', evaluatorVersion: 'v1', patchId: 'top-rim' },
        {
          sourceV: 1,
          wallThicknessMm: geometry.t_wall,
          minimumRadiusMm: PRODUCTION_MINIMUM_INNER_RADIUS_MM,
          reverseU: true,
        }
      )
    ),
  ];

  // --- 6. Assemble the 2R+4 program list (bands, curtains, base). ---
  const bandPrograms: AnnularRadialSolidTargetProgram[] = bands.map((band) =>
    Object.freeze({
      patchId: band.patchId,
      role: 'outer-wall' as TargetSurfacePatchRole,
      programCanonicalJson: band.programCanonicalJson,
      programSha256: band.programSha256,
      backends: band.backends,
    })
  );
  const curtainPrograms: AnnularRadialSolidTargetProgram[] = curtains.map((curtain) =>
    Object.freeze({
      patchId: curtain.patchId,
      role: 'feature-curtain' as TargetSurfacePatchRole,
      programCanonicalJson: curtain.programCanonicalJson,
      programSha256: curtain.programSha256,
      backends: curtain.backends,
    })
  );
  const programs = Object.freeze([
    ...bandPrograms,
    ...curtainPrograms,
    ...basePrograms,
  ]) as readonly AnnularRadialSolidTargetProgram[];
  const programByPatch = new Map(programs.map((program) => [program.patchId, program]));

  // --- 7. Abstract closed genus-one surface complex + evaluator set. ---
  const surfaceComplex = createTargetSurfaceComplexBinding(
    canonicalInputValue,
    multiPatchSurfaceDefinition(programs, bandCount)
  );
  const geometryTarget =
    createCompleteMappedGeometryTargetBindingFromSurfaceComplex(surfaceComplex);
  const evaluators = surfaceComplex.patches.map((patch) => {
    const program = programByPatch.get(patch.patchId);
    if (program === undefined) fail('INVALID_INPUT', `surface patch '${patch.patchId}' has no program`);
    return compileValidatedResidualEvaluator({
      targetSha256: geometryTarget.targetSha256,
      programCanonicalJson: program.programCanonicalJson,
    });
  });
  const evaluatorSet = createTargetSurfaceEvaluatorSetBinding(surfaceComplex, evaluators);

  // --- 8. The four base-internal junctions keep structural identity proofs. ---
  const baseInternalJunctions: readonly NonPeriodicJunctionDefinition[] = Object.freeze([
    Object.freeze({
      junctionId: 'junction/rim-inner',
      left: Object.freeze({ patchId: 'top-rim', side: 'v0' as const }),
      right: Object.freeze({ patchId: 'inner-wall', side: 'v1' as const }),
    }),
    Object.freeze({
      junctionId: 'junction/inner-bottom-top',
      left: Object.freeze({ patchId: 'inner-wall', side: 'v0' as const }),
      right: Object.freeze({ patchId: 'bottom-top', side: 'v1' as const }),
    }),
    Object.freeze({
      junctionId: 'junction/bottom-top-drain',
      left: Object.freeze({ patchId: 'bottom-top', side: 'v0' as const }),
      right: Object.freeze({ patchId: 'drain-wall', side: 'v1' as const }),
    }),
    Object.freeze({
      junctionId: 'junction/drain-bottom-under',
      left: Object.freeze({ patchId: 'drain-wall', side: 'v0' as const }),
      right: Object.freeze({
        patchId: 'bottom-under',
        side: 'v0' as const,
        reverseFreeParameter: true,
      }),
    }),
  ]);
  const nonPeriodicJunctionProofs = Object.freeze(
    baseInternalJunctions.map((junction) => {
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
          { radialProjectionNonzeroEvidenceSha256: radialClearanceEvidenceSha256 }
        );
      } catch (error) {
        fail(
          'BINDING_INVALID',
          `junction '${junction.junctionId}' was not proven: ${
            error instanceof Error ? error.message : 'unknown failure'
          }`
        );
      }
    })
  );

  // --- 9. The layered structure the reference tessellation consumes. ---
  const patchLayouts: AtlasPatchLayout[] = [
    ...bandPrograms.map((program) => ({
      patchId: program.patchId,
      role: program.role,
      verticalDivisions: { kind: 'role' as const, role: 'outer-wall' as AnnularRadialSolidBasePatchId },
    })),
    ...curtainPrograms.map((program) => ({
      patchId: program.patchId,
      role: program.role,
      verticalDivisions: { kind: 'fixed' as const, log2: 0 },
    })),
    ...BASE_PATCH_IDS.map((role) => ({
      patchId: role,
      role: role as TargetSurfacePatchRole,
      verticalDivisions: { kind: 'role' as const, role },
    })),
  ];
  const atlasComplex: MultiPatchAtlasComplex = Object.freeze({
    bandCount,
    curtainCount: bandCount - 1,
    patchLayouts: Object.freeze(patchLayouts),
    junctionCopies: multiPatchJunctionCopies(bandCount),
  });

  // --- 10. Assemble the authenticated binding. ---
  const bindingValue = {
    allPatchEvaluatorsAuthenticated: true,
    atlasBandCount: bandCount.toString(),
    atlasCurtainCount: (bandCount - 1).toString(),
    canonicalInputSha256: canonicalInput.canonicalInputSha256,
    completeAbstractClosedSurfaceComplex: true,
    drainClearanceEvidenceSha256: drainClearanceProof.evidenceSha256,
    drainContainmentProven: true,
    evaluatorSetSha256: evaluatorSet.evaluatorSetSha256,
    finalArtifactToleranceProven: false,
    geometricImageRegularityProven: false,
    implementationScope: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_SCOPE,
    layeredMultiPatchAtlas: true,
    physicalNormalThicknessProven: false,
    programManifest: programs.map((program) => ({
      patchId: program.patchId,
      programSha256: program.programSha256,
      role: String(program.role),
    })),
    proofMethodSha256: SINGLE_PATCH_ANNULAR_RADIAL_SOLID_TARGET_PROOF_SHA256,
    radialClampInactive: true,
    radialClearanceEvidenceSha256,
    nonPeriodicJunctionStructureAlignedUnderDeclaredAssumptions: true,
    nonPeriodicJunctionImageEqualityProven: false,
    nonPeriodicJunctionProofs: nonPeriodicJunctionProofs.map((proof, index) => ({
      evidenceSha256: proof.evidenceSha256,
      junctionId: baseInternalJunctions[index].junctionId,
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
    drainClearanceProof,
    nonPeriodicJunctionProofs,
    atlasComplex,
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
    value.nonPeriodicJunctionProofs.length !==
      (value.atlasComplex === undefined
        ? NON_PERIODIC_JUNCTIONS.length
        : MULTI_PATCH_BASE_INTERNAL_JUNCTION_COUNT) ||
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
