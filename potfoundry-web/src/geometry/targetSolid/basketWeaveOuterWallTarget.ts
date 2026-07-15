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

export const BASKET_WEAVE_OUTER_WALL_TARGET_VERSION =
  'potfoundry.basket-weave-outer-wall-target/v1' as const;
export const BASKET_WEAVE_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-basket-weave-outer-wall-and-conditional-physical-seam-curtain-with-declared-checker-jumps-only-no-complete-internal-curtain-graph-inner-rim-bottom-regularity-artifact-distance-or-device-conformance-proof' as const;
export const BASKET_WEAVE_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    BASKET_WEAVE_OUTER_WALL_TARGET_VERSION,
    `scope=${BASKET_WEAVE_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'integral strand count and all normalized weave controls are authenticated before program emission',
    'effective layer density, material u, vertical coordinate, twist, phase, floor cells, integer parity, local profiles, over/under maximum, noise, and depth share one SSA graph',
    'checker changes are real radial discontinuities: at a cell edge one local top profile is zero while the newly selected orthogonal top profile is generally positive',
    'the current axis-aligned feature extractor naming these loci creases is therefore insufficient for a closed target image and emits nothing for twist or vertical gradient',
    'even strand count with zero noise is seam-periodic; odd strand count flips checker parity and nonzero noise is nonperiodic because its phase advances by 50*strands radians',
    'every active nonperiodic seam receives a physical radial curtain; zero depth proves every weave contribution position-dead',
    'helical u-cell lines, nonlinear v-cell roots, their intersections, profile pieces, maximum ties, positive radius, and curtain nondegeneracy remain explicit obligations',
  ].join('\n')
);

export interface BasketWeaveOuterWallPatch {
  readonly kind: 'outer-wall';
  readonly role: 'outer-wall';
  readonly patchId: 'outer-wall';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface BasketWeaveSeamCurtainPatch {
  readonly kind: 'seam-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: 'seam-curtain';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type BasketWeaveOuterWallTargetPatch =
  | BasketWeaveOuterWallPatch
  | BasketWeaveSeamCurtainPatch;

declare const basketWeaveOuterWallTargetBrand: unique symbol;

export interface BasketWeaveOuterWallTargetBinding {
  readonly schemaVersion: typeof BASKET_WEAVE_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof BASKET_WEAVE_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'BasketWeave';
  readonly strands: number;
  readonly seamCurtainActive: boolean;
  readonly periodicIdentificationAdmissible: boolean;
  readonly internalCheckerDiscontinuitiesActive: boolean;
  readonly currentCreaseClassificationIsInsufficient: boolean;
  readonly axisAlignedFeatureLinesOnly: boolean;
  readonly completeInternalCurtainGraphEmitted: false;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly BasketWeaveOuterWallTargetPatch[];
  readonly [basketWeaveOuterWallTargetBrand]: true;
}

interface BasketWeaveParameters {
  readonly strands: number;
  readonly layers: number;
  readonly ratio: number;
  readonly depth: number;
  readonly twist: number;
  readonly profile: number;
  readonly unders: number;
  readonly noise: number;
  readonly verticalGradient: number;
  readonly phase: number;
}

interface RegisteredBinding {
  readonly binding: BasketWeaveOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Basket Weave outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): BasketWeaveParameters {
  const strands = styleNumber(input, 'bwStrands');
  if (!Number.isInteger(strands)) fail('strand count must be integral');
  return Object.freeze({
    strands,
    layers: styleNumber(input, 'bwLayers'),
    ratio: Math.max(0.01, styleNumber(input, 'bwRatio')),
    depth: styleNumber(input, 'bwDepth'),
    twist: styleNumber(input, 'bwTwist'),
    profile: styleNumber(input, 'bwProfile'),
    unders: styleNumber(input, 'bwUnders'),
    noise: styleNumber(input, 'bwNoise'),
    verticalGradient: styleNumber(input, 'bwVerticalGrad'),
    phase: styleNumber(input, 'bwPhase'),
  });
}

function basketRadius(
  context: RadialTargetPatchContext,
  params: BasketWeaveParameters,
  t: TargetExpressionReference,
  materialU: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const half = constant(0.5);
  const two = constant(2);
  const effectiveLayers = builder.multiply(
    constant(params.layers),
    builder.add(
      one,
      builder.multiply(
        constant(params.verticalGradient),
        builder.subtract(t, half)
      )
    )
  );
  const u = builder.multiply(materialU, constant(params.strands));
  const v = builder.multiply(
    builder.multiply(t, effectiveLayers),
    constant(params.ratio)
  );
  const uTwisted = builder.add(
    builder.add(
      u,
      builder.multiply(
        builder.multiply(constant(params.twist), t),
        constant(params.strands)
      )
    ),
    constant(params.phase)
  );
  const uCell = builder.floor(uTwisted);
  const vCell = builder.floor(v);
  const absoluteCellSum = builder.absolute(builder.add(uCell, vCell));
  const checker = builder.subtract(
    absoluteCellSum,
    builder.multiply(
      builder.floor(builder.divide(absoluteCellSum, two)),
      two
    )
  );
  const uLocal = builder.subtract(
    builder.multiply(builder.fractionalPart(uTwisted), two),
    one
  );
  const vLocal = builder.subtract(
    builder.multiply(builder.fractionalPart(v), two),
    one
  );
  const halfPi = builder.divide(context.tau, constant(4));
  const shapeU = builder.cos(builder.multiply(uLocal, halfPi));
  const shapeV = builder.cos(builder.multiply(vLocal, halfPi));
  const squareU = builder.smoothstep(one, constant(0.9), builder.absolute(uLocal));
  const squareV = builder.smoothstep(one, constant(0.9), builder.absolute(vLocal));
  const profileU = builder.mix(shapeU, squareU, constant(params.profile));
  const profileV = builder.mix(shapeV, squareV, constant(params.profile));
  const verticalTop = builder.maximum(
    profileU,
    builder.subtract(builder.multiply(profileV, constant(params.unders)), half)
  );
  const horizontalTop = builder.maximum(
    profileV,
    builder.subtract(builder.multiply(profileU, constant(params.unders)), half)
  );
  let height = builder.mix(horizontalTop, verticalTop, checker);
  if (params.noise > 0) {
    height = builder.add(
      height,
      builder.multiply(
        builder.multiply(
          builder.sin(builder.multiply(u, constant(50))),
          builder.sin(builder.multiply(v, constant(50)))
        ),
        constant(params.noise * 0.1)
      )
    );
  }
  return builder.add(
    context.baseRadiusAt(t),
    builder.multiply(height, constant(params.depth))
  );
}

function compileOuterWall(
  input: CanonicalTargetInputBinding,
  params: BasketWeaveParameters
): BasketWeaveOuterWallPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'BasketWeave',
    {
      evaluatorId: 'potfoundry.basket-weave.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    (context) => {
      const radius = basketRadius(context, params, context.localV, context.localU);
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
  params: BasketWeaveParameters
): BasketWeaveSeamCurtainPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'BasketWeave',
    {
      evaluatorId: 'potfoundry.basket-weave.seam-curtain',
      evaluatorVersion: 'v1',
      patchId: 'seam-curtain',
    },
    (context) => {
      const zero = context.constant(0);
      const materialOne = context.constant(1);
      const t = context.localU;
      const leftRadius = basketRadius(context, params, t, zero);
      const rightRadius = basketRadius(context, params, t, materialOne);
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
  patches: readonly BasketWeaveOuterWallTargetPatch[]
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
  params: BasketWeaveParameters,
  seamCurtainActive: boolean,
  internalCheckerDiscontinuitiesActive: boolean
): CanonicalJsonValue {
  return {
    axisAlignedFeatureLinesOnly:
      params.twist === 0 && params.verticalGradient === 0,
    completeInternalCurtainGraphEmitted: false,
    currentCreaseClassificationIsInsufficient:
      internalCheckerDiscontinuitiesActive,
    internalCheckerDiscontinuitiesActive,
    obligations: [
      {
        condition: 'materialU*strands+twist*t*strands+phase is an integer',
        id: 'helical-u-cell-radial-jumps',
      },
      {
        condition: 't*layers*(1+verticalGradient*(t-0.5))*ratio is an integer',
        id: 'nonuniform-v-cell-radial-jumps',
      },
      {
        condition: 'abs(uLocal) or abs(vLocal) is 0, 0.9, or 1',
        id: 'profile-cusp-and-smoothstep-pieces',
      },
      {
        condition: 'top profile equals recessed under profile minus 0.5',
        id: 'over-under-maximum-ties',
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
    strands: params.strands.toString(),
    styleId: 'BasketWeave',
  };
}

function derive(input: CanonicalTargetInputBinding): BasketWeaveOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'BasketWeave') {
    fail(`expected BasketWeave but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const internalCheckerDiscontinuitiesActive = params.depth !== 0;
  const seamCurtainActive =
    params.depth !== 0 && (params.strands % 2 !== 0 || params.noise !== 0);
  const axisAlignedFeatureLinesOnly =
    params.twist === 0 && params.verticalGradient === 0;
  const patches = Object.freeze([
    compileOuterWall(input, params),
    ...(seamCurtainActive ? [compileSeamCurtain(input, params)] : []),
  ]) as readonly BasketWeaveOuterWallTargetPatch[];
  const patchValue = patchSetValue(patches);
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.basket-weave-outer-wall-target/patch-set/v1',
    patchValue
  );
  const regularity = regularityValue(
    params,
    seamCurtainActive,
    internalCheckerDiscontinuitiesActive
  );
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(regularity);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.basket-weave-outer-wall-target/regularity-obligations/v1',
    regularity
  );
  const bindingValue = {
    axisAlignedFeatureLinesOnly,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    completeInternalCurtainGraphEmitted: false,
    currentCreaseClassificationIsInsufficient:
      internalCheckerDiscontinuitiesActive,
    implementationScope: BASKET_WEAVE_OUTER_WALL_TARGET_SCOPE,
    internalCheckerDiscontinuitiesActive,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: !seamCurtainActive,
    proofMethodSha256: BASKET_WEAVE_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    schemaVersion: BASKET_WEAVE_OUTER_WALL_TARGET_VERSION,
    seamCurtainActive,
    strands: params.strands.toString(),
    styleId: 'BasketWeave',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.basket-weave-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: BASKET_WEAVE_OUTER_WALL_TARGET_VERSION,
    implementationScope: BASKET_WEAVE_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: BASKET_WEAVE_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'BasketWeave',
    strands: params.strands,
    seamCurtainActive,
    periodicIdentificationAdmissible: !seamCurtainActive,
    internalCheckerDiscontinuitiesActive,
    currentCreaseClassificationIsInsufficient:
      internalCheckerDiscontinuitiesActive,
    axisAlignedFeatureLinesOnly,
    completeInternalCurtainGraphEmitted: false,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as BasketWeaveOuterWallTargetBinding;
}

export function createBasketWeaveOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): BasketWeaveOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function basketWeaveOuterWallTargetForProof(
  value: BasketWeaveOuterWallTargetBinding
): BasketWeaveOuterWallTargetBinding {
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
    value.strands !== derived.strands ||
    value.seamCurtainActive !== derived.seamCurtainActive ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.internalCheckerDiscontinuitiesActive !==
      derived.internalCheckerDiscontinuitiesActive ||
    value.currentCreaseClassificationIsInsufficient !==
      derived.currentCreaseClassificationIsInsufficient ||
    value.axisAlignedFeatureLinesOnly !== derived.axisAlignedFeatureLinesOnly ||
    value.completeInternalCurtainGraphEmitted !==
      derived.completeInternalCurtainGraphEmitted ||
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
