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

export const HEXAGONAL_HIVE_OUTER_WALL_TARGET_VERSION =
  'potfoundry.hexagonal-hive-outer-wall-target/v2' as const;
export const HEXAGONAL_HIVE_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-hexagonal-hive-outer-wall-and-conditional-physical-seam-curtain-with-declared-internal-cell-jumps-only-no-complete-feature-side-graph-inner-rim-bottom-regularity-artifact-distance-or-device-conformance-proof' as const;
export const HEXAGONAL_HIVE_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    HEXAGONAL_HIVE_OUTER_WALL_TARGET_VERSION,
    `scope=${HEXAGONAL_HIVE_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'the generated grid preserves production constants 1.7320508, 0.8660254, and the shader-matching hardcoded vertical factor 20/40',
    'A/B grids, strict lenA<lenB selection with B owning equality, selected cell id, sine hash, gap smoothstep, convex/concave profile, noise, and relief share one SSA graph',
    'the profile-only normalized distance is clamped to [0,1] after the unchanged gap smoothstep; this is identity wherever wall support is nonzero and inert where wall support is zero',
    'u=theta*scale advances by 2*pi*scale across the cylindrical seam; every admitted nonzero binary-rational scale therefore fails unit-grid periodicity',
    'active relief emits a physical radial seam curtain joining the exact u=0 and u=1 traces; zero relief proves all hive state position-dead',
    'when noise and relief are active, selected-cell identity changes create real radial jumps on grid and A/B ownership boundaries',
    'those internal cell jumps are declared but their complete clipped feature-side patch graph is not yet emitted by this layer',
    'all floor lines, A/B ties, hash jumps, smoothstep pieces, concave switch, power origin, radius positivity, and curtain degeneracy remain explicit obligations',
  ].join('\n')
);

export interface HexagonalHiveOuterWallPatch {
  readonly kind: 'outer-wall';
  readonly role: 'outer-wall';
  readonly patchId: 'outer-wall';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface HexagonalHiveSeamCurtainPatch {
  readonly kind: 'seam-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: 'seam-curtain';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type HexagonalHiveOuterWallTargetPatch =
  | HexagonalHiveOuterWallPatch
  | HexagonalHiveSeamCurtainPatch;

declare const hexagonalHiveOuterWallTargetBrand: unique symbol;

export interface HexagonalHiveOuterWallTargetBinding {
  readonly schemaVersion: typeof HEXAGONAL_HIVE_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof HEXAGONAL_HIVE_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'HexagonalHive';
  readonly seamCurtainActive: boolean;
  readonly periodicIdentificationAdmissible: boolean;
  readonly internalCellDiscontinuitiesActive: boolean;
  readonly completeInternalFeatureSideGraphEmitted: false;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly HexagonalHiveOuterWallTargetPatch[];
  readonly [hexagonalHiveOuterWallTargetBrand]: true;
}

interface HexagonalHiveParameters {
  readonly scale: number;
  readonly gap: number;
  readonly relief: number;
  readonly detail: number;
  readonly concave: number;
  readonly noise: number;
}

interface RegisteredBinding {
  readonly binding: HexagonalHiveOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Hexagonal Hive outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): HexagonalHiveParameters {
  return Object.freeze({
    scale: styleNumber(input, 'hhScale'),
    gap: styleNumber(input, 'hhGap'),
    relief: styleNumber(input, 'hhRelief'),
    detail: styleNumber(input, 'hhDetail'),
    concave: styleNumber(input, 'hhConcave'),
    noise: styleNumber(input, 'hhNoise'),
  });
}

function hiveRadius(
  context: RadialTargetPatchContext,
  params: HexagonalHiveParameters,
  t: TargetExpressionReference,
  materialU: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const zero = constant(0);
  const half = constant(0.5);
  const sqrtThreeApprox = constant(1.7320508);
  const uGrid = builder.multiply(
    context.thetaMaterialAt(materialU),
    constant(params.scale)
  );
  const vGrid = builder.multiply(
    builder.multiply(t, constant(params.scale * 0.5)),
    sqrtThreeApprox
  );
  const gridAX = builder.floor(uGrid);
  const gridAY = builder.floor(builder.divide(vGrid, sqrtThreeApprox));
  const guvAX = builder.subtract(builder.subtract(uGrid, gridAX), half);
  const guvAY = builder.subtract(
    vGrid,
    builder.add(builder.multiply(gridAY, sqrtThreeApprox), constant(0.8660254))
  );
  const gridBX = builder.floor(builder.subtract(uGrid, half));
  const gridBY = builder.floor(
    builder.divide(builder.subtract(vGrid, constant(0.8660254)), sqrtThreeApprox)
  );
  const guvBX = builder.subtract(uGrid, builder.add(gridBX, one));
  const guvBY = builder.subtract(
    vGrid,
    builder.multiply(builder.add(gridBY, one), sqrtThreeApprox)
  );
  const lengthA = builder.add(builder.square(guvAX), builder.square(guvAY));
  const lengthB = builder.add(builder.square(guvBX), builder.square(guvBY));
  const chooseB = builder.step(lengthB, lengthA);
  const distance = builder.sqrt(builder.minimum(lengthA, lengthB));
  const cellIdX = builder.mix(gridAX, builder.add(gridBX, half), chooseB);
  const cellIdY = builder.mix(gridAY, builder.add(gridBY, half), chooseB);
  const hashArgument = builder.add(
    builder.multiply(cellIdX, constant(12.9898)),
    builder.multiply(cellIdY, constant(78.233))
  );
  const cellHash = builder.fractionalPart(
    builder.multiply(builder.sin(hashArgument), constant(43758.5453))
  );
  const rawNormalizedDistance = builder.divide(distance, half);
  const wall = builder.smoothstep(
    one,
    constant(1 - params.gap * 2),
    rawNormalizedDistance
  );
  const normalizedDistance = builder.clamp(rawNormalizedDistance, zero, one);
  let cellHeight: TargetExpressionReference;
  if (params.concave > 0.5) {
    cellHeight = builder.subtract(
      one,
      builder.multiply(
        builder.multiply(builder.square(normalizedDistance), wall),
        constant(1 - params.detail * 0.5)
      )
    );
  } else {
    cellHeight = builder.multiply(
      builder.subtract(
        one,
        builder.power(normalizedDistance, constant(2 * (1 + params.detail)))
      ),
      wall
    );
  }
  const noiseHeight = builder.multiply(
    builder.subtract(cellHash, half),
    constant(params.noise)
  );
  const height = builder.add(cellHeight, builder.multiply(noiseHeight, wall));
  return builder.add(
    context.baseRadiusAt(t),
    builder.multiply(height, constant(params.relief))
  );
}

function compileOuterWall(
  input: CanonicalTargetInputBinding,
  params: HexagonalHiveParameters
): HexagonalHiveOuterWallPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'HexagonalHive',
    {
      evaluatorId: 'potfoundry.hexagonal-hive.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    (context) => {
      const radius = hiveRadius(context, params, context.localV, context.localU);
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
  params: HexagonalHiveParameters
): HexagonalHiveSeamCurtainPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'HexagonalHive',
    {
      evaluatorId: 'potfoundry.hexagonal-hive.seam-curtain',
      evaluatorVersion: 'v1',
      patchId: 'seam-curtain',
    },
    (context) => {
      const zero = context.constant(0);
      const materialOne = context.constant(1);
      const t = context.localU;
      const leftRadius = hiveRadius(context, params, t, zero);
      const rightRadius = hiveRadius(context, params, t, materialOne);
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
  patches: readonly HexagonalHiveOuterWallTargetPatch[]
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
  params: HexagonalHiveParameters,
  seamCurtainActive: boolean,
  internalCellDiscontinuitiesActive: boolean
): CanonicalJsonValue {
  return {
    completeInternalFeatureSideGraphEmitted: false,
    internalCellDiscontinuitiesActive,
    obligations: [
      {
        condition: 'uGrid or vGrid/sqrtThreeApprox crosses an A-grid integer line',
        id: 'a-grid-floor-lines',
      },
      {
        condition: 'uGrid-0.5 or (vGrid-0.8660254)/sqrtThreeApprox crosses a B-grid integer line',
        id: 'b-grid-floor-lines',
      },
      {
        condition: 'lengthA=lengthB',
        id: 'strict-a-versus-b-ownership-boundary',
      },
      {
        condition: 'selected cell id changes while noise*relief!=0',
        id: 'cell-hash-radial-jump',
      },
      {
        condition: '(normalizedDistance-1)/(1-2*gap-1) is 0 or 1',
        id: 'wall-smoothstep-pieces',
      },
      {
        condition: 'selected squared distance is zero or outer radius/Jacobian is nonregular',
        id: 'distance-power-and-wall-regularity',
      },
      ...(seamCurtainActive
        ? [{
            condition: 'the two seam radii coincide at any height',
            id: 'seam-curtain-jacobian-degeneracy',
          }]
        : []),
    ],
    scale: params.scale.toString(),
    seamCurtainActive,
    styleId: 'HexagonalHive',
  };
}

function derive(input: CanonicalTargetInputBinding): HexagonalHiveOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'HexagonalHive') {
    fail(`expected HexagonalHive but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const seamCurtainActive = params.relief !== 0;
  const internalCellDiscontinuitiesActive =
    params.relief !== 0 && params.noise !== 0;
  const patches = Object.freeze([
    compileOuterWall(input, params),
    ...(seamCurtainActive ? [compileSeamCurtain(input, params)] : []),
  ]) as readonly HexagonalHiveOuterWallTargetPatch[];
  const patchValue = patchSetValue(patches);
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.hexagonal-hive-outer-wall-target/patch-set/v1',
    patchValue
  );
  const regularity = regularityValue(
    params,
    seamCurtainActive,
    internalCellDiscontinuitiesActive
  );
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(regularity);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.hexagonal-hive-outer-wall-target/regularity-obligations/v1',
    regularity
  );
  const bindingValue = {
    canonicalInputSha256: inputProof.canonicalInputSha256,
    completeInternalFeatureSideGraphEmitted: false,
    implementationScope: HEXAGONAL_HIVE_OUTER_WALL_TARGET_SCOPE,
    internalCellDiscontinuitiesActive,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: !seamCurtainActive,
    proofMethodSha256: HEXAGONAL_HIVE_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    schemaVersion: HEXAGONAL_HIVE_OUTER_WALL_TARGET_VERSION,
    seamCurtainActive,
    styleId: 'HexagonalHive',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.hexagonal-hive-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: HEXAGONAL_HIVE_OUTER_WALL_TARGET_VERSION,
    implementationScope: HEXAGONAL_HIVE_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: HEXAGONAL_HIVE_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'HexagonalHive',
    seamCurtainActive,
    periodicIdentificationAdmissible: !seamCurtainActive,
    internalCellDiscontinuitiesActive,
    completeInternalFeatureSideGraphEmitted: false,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as HexagonalHiveOuterWallTargetBinding;
}

export function createHexagonalHiveOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): HexagonalHiveOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function hexagonalHiveOuterWallTargetForProof(
  value: HexagonalHiveOuterWallTargetBinding
): HexagonalHiveOuterWallTargetBinding {
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
    value.seamCurtainActive !== derived.seamCurtainActive ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.internalCellDiscontinuitiesActive !==
      derived.internalCellDiscontinuitiesActive ||
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
