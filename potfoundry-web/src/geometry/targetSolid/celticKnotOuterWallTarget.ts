import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { sha256Utf8 } from './incrementalSha256';
import {
  buildRadialTargetPatchProgram,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
  RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256,
  type RadialTargetPatchContext,
} from './radialOuterWallProgram';
import {
  compileGeneratedTargetProgramBackends,
  generatedTargetProgramBackendsForProof,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';
import type { TargetExpressionReference } from './validatedTargetProgramBuilder';

export const CELTIC_KNOT_OUTER_WALL_TARGET_VERSION =
  'potfoundry.celtic-knot-outer-wall-target/v2' as const;
export const CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-celtic-knot-outer-wall-and-conditional-physical-seam-curtain-with-declared-ribbon-and-occlusion-jumps-only-no-complete-feature-side-graph-inner-rim-bottom-regularity-artifact-distance-or-device-conformance-proof' as const;
export const CELTIC_KNOT_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    CELTIC_KNOT_OUTER_WALL_TARGET_VERSION,
    `scope=${CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'column count and two-to-eight strand count are resolved from authenticated normalized controls before static unrolling',
    'column tiling, sine braid distances, parity-selected z oscillation, strict closest-strand search, strict z-buffer occlusion, profile, and depth share one SSA graph',
    'strict comparisons use step complements so equality ownership matches production: earlier closest strand wins, current best z wins, and minDistance=strandWidth is foreground',
    'the foreground-only normalized distance is clamped to its production-branch invariant [0,1], which is identity whenever foreground is selected and inert otherwise',
    'the final binary branch is emitted as background+selector*(foreground-background), preserving exact real 0/1 selection while retaining the shared lower bound under interval evaluation',
    'the foreground profile is exactly zero at minDistance=strandWidth while the exterior branch is baseRadius-0.3*relief, proving a finite support-boundary jump whenever relief is active',
    'column phase advances by columnId*pi*binary64(0.333), so active relief is conservatively closed by an explicit physical seam curtain',
    'support curves, closest-distance ties, occlusion z ties, column boundaries, profile pieces, positive radius, and curtain nondegeneracy remain explicit obligations',
    'the internal ribbon and occlusion discontinuity graph is declared but not yet emitted as a complete clipped feature-side complex',
  ].join('\n')
);

export interface CelticKnotOuterWallPatch {
  readonly kind: 'outer-wall';
  readonly role: 'outer-wall';
  readonly patchId: 'outer-wall';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface CelticKnotSeamCurtainPatch {
  readonly kind: 'seam-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: 'seam-curtain';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type CelticKnotOuterWallTargetPatch =
  | CelticKnotOuterWallPatch
  | CelticKnotSeamCurtainPatch;

declare const celticKnotOuterWallTargetBrand: unique symbol;

export interface CelticKnotOuterWallTargetBinding {
  readonly schemaVersion: typeof CELTIC_KNOT_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'CelticKnot';
  readonly columnCount: number;
  readonly strandCount: number;
  readonly seamCurtainActive: boolean;
  readonly periodicIdentificationAdmissible: boolean;
  readonly internalRibbonDiscontinuitiesActive: boolean;
  readonly completeInternalFeatureSideGraphEmitted: false;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly CelticKnotOuterWallTargetPatch[];
  readonly [celticKnotOuterWallTargetBrand]: true;
}

interface CelticKnotParameters {
  readonly columnCount: number;
  readonly strandWidth: number;
  readonly relief: number;
  readonly gap: number;
  readonly roundness: number;
  readonly tightness: number;
  readonly strandCount: number;
}

interface RegisteredBinding {
  readonly binding: CelticKnotOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Celtic Knot outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): CelticKnotParameters {
  const strandCount = Math.max(
    2,
    Math.min(8, Math.floor(styleNumber(input, 'ckStrands') + 0.5))
  );
  return Object.freeze({
    columnCount: Math.max(1, Math.floor(styleNumber(input, 'ckScale'))),
    strandWidth: styleNumber(input, 'ckWidth') * 0.15,
    relief: styleNumber(input, 'ckRelief'),
    gap: styleNumber(input, 'ckGap'),
    roundness: styleNumber(input, 'ckRoundness'),
    tightness: Math.max(0.5, styleNumber(input, 'ckTwist') + 0.5),
    strandCount,
  });
}

function celticKnotRadius(
  context: RadialTargetPatchContext,
  params: CelticKnotParameters,
  t: TargetExpressionReference,
  materialU: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const half = constant(0.5);
  const scaledU = builder.multiply(materialU, constant(params.columnCount));
  const columnId = builder.floor(scaledU);
  const localU = builder.multiply(
    builder.subtract(builder.fractionalPart(scaledU), half),
    constant(2)
  );
  const vertical = builder.multiply(
    builder.multiply(
      builder.multiply(t, constant(params.tightness)),
      context.tau
    ),
    constant(3)
  );
  const basePhase = builder.multiply(
    builder.multiply(columnId, builder.pi()),
    constant(0.333)
  );
  const phaseStep = builder.divide(context.tau, constant(params.strandCount));
  const weaveDensity = Math.max(1, params.strandCount - 1);
  const distances: TargetExpressionReference[] = [];
  const zHeights: TargetExpressionReference[] = [];
  for (let strand = 0; strand < params.strandCount; strand += 1) {
    const phase = builder.add(
      basePhase,
      builder.multiply(phaseStep, constant(strand))
    );
    const argument = builder.add(vertical, phase);
    const strandX = builder.multiply(constant(0.4), builder.sin(argument));
    distances.push(builder.absolute(builder.subtract(localU, strandX)));
    const oscillation = builder.multiply(argument, constant(weaveDensity));
    zHeights.push(
      params.strandCount % 2 !== 0
        ? builder.sin(oscillation)
        : builder.cos(oscillation)
    );
  }

  let minimumDistance = constant(999);
  let closestZ = constant(0);
  for (let strand = 0; strand < params.strandCount; strand += 1) {
    const chooseNew = builder.subtract(
      one,
      builder.step(minimumDistance, distances[strand])
    );
    minimumDistance = builder.mix(
      minimumDistance,
      distances[strand],
      chooseNew
    );
    closestZ = builder.mix(closestZ, zHeights[strand], chooseNew);
  }

  let bestZ = closestZ;
  let finalDistance = minimumDistance;
  for (let strand = 0; strand < params.strandCount; strand += 1) {
    const inside = builder.subtract(
      one,
      builder.step(constant(params.strandWidth), distances[strand])
    );
    const above = builder.subtract(
      one,
      builder.step(zHeights[strand], bestZ)
    );
    const choose = builder.multiply(inside, above);
    bestZ = builder.mix(bestZ, zHeights[strand], choose);
    finalDistance = builder.mix(finalDistance, distances[strand], choose);
  }

  const normalizedDistance = builder.clamp(
    builder.divide(finalDistance, constant(params.strandWidth)),
    constant(0),
    one
  );
  const linearProfile = builder.subtract(one, normalizedDistance);
  const cosineProfile = builder.cos(
    builder.multiply(normalizedDistance, builder.divide(builder.pi(), constant(2)))
  );
  const profile = builder.add(
    linearProfile,
    builder.multiply(
      builder.subtract(cosineProfile, linearProfile),
      constant(params.roundness)
    )
  );
  const normalizedZ = builder.add(builder.multiply(bestZ, half), half);
  const lowDepth = 0.3 + params.gap * 0.2;
  const depthFactor = builder.add(
    constant(lowDepth),
    builder.multiply(constant(1 - lowDepth), normalizedZ)
  );
  const baseRadius = context.baseRadiusAt(t);
  const foregroundRadius = builder.add(
    baseRadius,
    builder.multiply(
      builder.multiply(profile, constant(params.relief)),
      depthFactor
    )
  );
  const backgroundRadius = builder.subtract(
    baseRadius,
    constant(params.relief * 0.3)
  );
  const foreground = builder.step(
    minimumDistance,
    constant(params.strandWidth)
  );
  return builder.add(
    backgroundRadius,
    builder.multiply(
      foreground,
      builder.subtract(foregroundRadius, backgroundRadius)
    )
  );
}

function compileOuterWall(
  input: CanonicalTargetInputBinding,
  params: CelticKnotParameters
): CelticKnotOuterWallPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'CelticKnot',
    {
      evaluatorId: 'potfoundry.celtic-knot.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    (context) => {
      const radius = celticKnotRadius(context, params, context.localV, context.localU);
      return context.radialPointAt(radius, context.localU, context.localV);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'outer-wall',
    role: 'outer-wall',
    patchId: 'outer-wall',
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function compileSeamCurtain(
  input: CanonicalTargetInputBinding,
  params: CelticKnotParameters
): CelticKnotSeamCurtainPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'CelticKnot',
    {
      evaluatorId: 'potfoundry.celtic-knot.seam-curtain',
      evaluatorVersion: 'v1',
      patchId: 'seam-curtain',
    },
    (context) => {
      const zero = context.constant(0);
      const materialOne = context.constant(1);
      const t = context.localU;
      const leftRadius = celticKnotRadius(context, params, t, zero);
      const rightRadius = celticKnotRadius(context, params, t, materialOne);
      const radius = context.builder.mix(leftRadius, rightRadius, context.localV);
      return context.radialPointAt(radius, zero, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'seam-curtain',
    role: 'feature-curtain',
    patchId: 'seam-curtain',
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function patchSetValue(
  patches: readonly CelticKnotOuterWallTargetPatch[]
): CanonicalJsonValue {
  return {
    patches: patches.map((patch) => ({
      backendSha256: patch.backends.backendSha256,
      kind: patch.kind,
      nodeCount: patch.nodeCount.toString(),
      patchId: patch.patchId,
      programSha256: patch.programSha256,
      role: patch.role,
    })),
  };
}

function regularityValue(
  params: CelticKnotParameters,
  seamCurtainActive: boolean
): CanonicalJsonValue {
  return {
    completeInternalFeatureSideGraphEmitted: false,
    internalRibbonDiscontinuitiesActive: params.relief !== 0,
    obligations: [
      {
        condition: 'minimum strand distance equals strandWidth',
        id: 'foreground-background-radial-jump',
      },
      {
        condition: 'two strand distances are equal during strict closest selection',
        id: 'closest-strand-ownership-ties',
      },
      {
        condition: 'two in-support strand z heights are equal during strict occlusion selection',
        id: 'z-buffer-occlusion-ties',
      },
      {
        condition: 'materialU*columnCount is an integer',
        id: 'column-phase-and-local-coordinate-boundaries',
      },
      {
        condition: 'outer radius is nonpositive or radial surface Jacobian vanishes',
        id: 'outer-wall-regularity',
      },
      ...(seamCurtainActive
        ? [{
            condition: 'the u=0 and u=1 seam radii coincide at any height',
            id: 'seam-curtain-jacobian-degeneracy',
          }]
        : []),
    ],
    seamCurtainActive,
    strandCount: params.strandCount.toString(),
    styleId: 'CelticKnot',
  };
}

function derive(input: CanonicalTargetInputBinding): CelticKnotOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'CelticKnot') {
    fail(`expected CelticKnot but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const seamCurtainActive = params.relief !== 0;
  const internalRibbonDiscontinuitiesActive = params.relief !== 0;
  const patches = Object.freeze([
    compileOuterWall(input, params),
    ...(seamCurtainActive ? [compileSeamCurtain(input, params)] : []),
  ]) as readonly CelticKnotOuterWallTargetPatch[];
  const patchValue = patchSetValue(patches);
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.celtic-knot-outer-wall-target/patch-set/v1',
    patchValue
  );
  const regularity = regularityValue(params, seamCurtainActive);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(regularity);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.celtic-knot-outer-wall-target/regularity-obligations/v1',
    regularity
  );
  const bindingValue = {
    canonicalInputSha256: inputProof.canonicalInputSha256,
    columnCount: params.columnCount.toString(),
    completeInternalFeatureSideGraphEmitted: false,
    implementationScope: CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE,
    internalRibbonDiscontinuitiesActive,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: !seamCurtainActive,
    proofMethodSha256: CELTIC_KNOT_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    schemaVersion: CELTIC_KNOT_OUTER_WALL_TARGET_VERSION,
    seamCurtainActive,
    strandCount: params.strandCount.toString(),
    styleId: 'CelticKnot',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.celtic-knot-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: CELTIC_KNOT_OUTER_WALL_TARGET_VERSION,
    implementationScope: CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: CELTIC_KNOT_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'CelticKnot',
    columnCount: params.columnCount,
    strandCount: params.strandCount,
    seamCurtainActive,
    periodicIdentificationAdmissible: !seamCurtainActive,
    internalRibbonDiscontinuitiesActive,
    completeInternalFeatureSideGraphEmitted: false,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as CelticKnotOuterWallTargetBinding;
}

export function createCelticKnotOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): CelticKnotOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function celticKnotOuterWallTargetForProof(
  value: CelticKnotOuterWallTargetBinding
): CelticKnotOuterWallTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('binding is not an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('binding is not an authenticated capability');
  }
  for (const patch of value.patches) {
    generatedTargetProgramBackendsForProof(patch.backends);
  }
  const derived = derive(registered.input);
  if (
    value.schemaVersion !== derived.schemaVersion ||
    value.implementationScope !== derived.implementationScope ||
    value.proofMethodSha256 !== derived.proofMethodSha256 ||
    value.bindingSha256 !== derived.bindingSha256 ||
    value.bindingCanonicalJson !== derived.bindingCanonicalJson ||
    value.canonicalInputSha256 !== derived.canonicalInputSha256 ||
    value.radialSemanticsSha256 !== derived.radialSemanticsSha256 ||
    value.styleId !== derived.styleId ||
    value.columnCount !== derived.columnCount ||
    value.strandCount !== derived.strandCount ||
    value.seamCurtainActive !== derived.seamCurtainActive ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.internalRibbonDiscontinuitiesActive !==
      derived.internalRibbonDiscontinuitiesActive ||
    value.completeInternalFeatureSideGraphEmitted !==
      derived.completeInternalFeatureSideGraphEmitted ||
    value.patchCount !== derived.patchCount ||
    value.patchSetSha256 !== derived.patchSetSha256 ||
    value.regularityObligationsCanonicalJson !==
      derived.regularityObligationsCanonicalJson ||
    value.regularityObligationsSha256 !== derived.regularityObligationsSha256 ||
    value.patches !== registered.binding.patches
  ) {
    fail('binding capability fields are inconsistent');
  }
  return value;
}
