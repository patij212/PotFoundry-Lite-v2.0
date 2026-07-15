import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { exactFloat64Decimal } from './decimalInterval';
import { INTEGER_PCG2D_HASH_PROOF_SHA256 } from './integerPcg2dHash';
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

export const VORONOI_OUTER_WALL_TARGET_VERSION =
  'potfoundry.voronoi-outer-wall-target/v1' as const;
export const VORONOI_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-voronoi-outer-wall-and-conditional-physical-seam-curtain-only-no-inner-rim-bottom-complete-feature-graph-regularity-artifact-distance-or-device-conformance-proof' as const;
export const VORONOI_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    VORONOI_OUTER_WALL_TARGET_VERSION,
    `scope=${VORONOI_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    `integer-pcg2d-proof=${INTEGER_PCG2D_HASH_PROOF_SHA256}`,
    'the production CPU period is max(1,floor(scale+0.5)); it is emitted as one authenticated integer constant rather than recomputed in floating point',
    'nine neighbor candidates use exact integer Euclidean x wrapping, the exact biased PCG2D unit hash, and the production y-then-x loop order',
    'the first and second distances use the equivalent branch-free recurrence f1=min(f1,d), f2=min(f2,max(oldF1,d))',
    'web, bubble, morph, edge fade, and relief preserve production CPU operation order through the shared SSA builder',
    'integer scale shifts the cellular coordinate by exactly its integer hash period and admits periodic seam identification',
    'noninteger active-relief scale emits a physical radial seam curtain joining the complete u=0 and u=1 one-sided traces',
    'zero relief proves the cellular state position-dead and therefore omits a geometrically degenerate seam curtain',
    'WGSL round-to-even differs from CPU Math.round at half-integers above an even integer; that current production mismatch is authenticated and not hidden',
    'cell floors, distance ties, smoothstep pieces, zero distances, radius positivity, and curtain nondegeneracy remain explicit regularity obligations',
  ].join('\n')
);

export interface VoronoiOuterWallPatch {
  readonly kind: 'outer-wall';
  readonly role: 'outer-wall';
  readonly patchId: 'outer-wall';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface VoronoiSeamCurtainPatch {
  readonly kind: 'seam-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: 'seam-curtain';
  readonly leftMaterialUExact: '0';
  readonly rightMaterialUExact: '1';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type VoronoiOuterWallTargetPatch =
  | VoronoiOuterWallPatch
  | VoronoiSeamCurtainPatch;

declare const voronoiOuterWallTargetBrand: unique symbol;

export interface VoronoiOuterWallTargetBinding {
  readonly schemaVersion: typeof VORONOI_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof VORONOI_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'Voronoi';
  readonly scaleExact: string;
  readonly cpuPeriodX: number;
  readonly wgslRoundPeriodX: number;
  readonly currentCpuWgslPeriodMismatch: boolean;
  readonly seamCurtainActive: boolean;
  readonly periodicIdentificationAdmissible: boolean;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly VoronoiOuterWallTargetPatch[];
  readonly [voronoiOuterWallTargetBrand]: true;
}

interface VoronoiParameters {
  readonly scale: number;
  readonly jitter: number;
  readonly thickness: number;
  readonly relief: number;
  readonly morph: number;
  readonly zStretch: number;
  readonly pulse: number;
  readonly edgeFade: number;
  readonly cpuPeriodX: number;
  readonly wgslRoundPeriodX: number;
}

interface RegisteredBinding {
  readonly binding: VoronoiOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Voronoi outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function roundTiesToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function parameters(input: CanonicalTargetInputBinding): VoronoiParameters {
  const rawScale = styleNumber(input, 'vScale');
  const rawStretch = styleNumber(input, 'vZStretch');
  const scale = rawScale > 0 ? rawScale : 8;
  const zStretch = rawStretch > 0 ? rawStretch : 1;
  const cpuPeriodX = Math.max(1, Math.floor(scale + 0.5));
  const wgslRoundPeriodX = Math.max(1, roundTiesToEven(Math.fround(scale)));
  return Object.freeze({
    scale,
    jitter: styleNumber(input, 'vJitter'),
    thickness: styleNumber(input, 'vThickness'),
    relief: styleNumber(input, 'vRelief'),
    morph: styleNumber(input, 'vMorph'),
    zStretch,
    pulse: styleNumber(input, 'vPulse'),
    edgeFade: styleNumber(input, 'vEdgeFade'),
    cpuPeriodX,
    wgslRoundPeriodX,
  });
}

function voronoiRadius(
  context: RadialTargetPatchContext,
  params: VoronoiParameters,
  t: TargetExpressionReference,
  materialU: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const zero = constant(0);
  const uAnimated = builder.add(
    builder.multiply(materialU, constant(params.scale)),
    constant(params.pulse * params.scale)
  );
  const vCell = builder.multiply(
    builder.multiply(t, constant(params.scale)),
    constant(params.zStretch)
  );
  const cellX = builder.floor(uAnimated);
  const cellY = builder.floor(vCell);
  const cellUvX = builder.fractionalPart(uAnimated);
  const cellUvY = builder.fractionalPart(vCell);
  const period = constant(params.cpuPeriodX);
  let f1 = constant(999);
  let f2 = constant(999);

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const neighborX = builder.add(cellX, constant(offsetX));
      const neighborY = builder.add(cellY, constant(offsetY));
      const wrappedX = builder.subtract(
        neighborX,
        builder.multiply(builder.floor(builder.divide(neighborX, period)), period)
      );
      const hashX = builder.pcg2dUnitX(wrappedX, neighborY);
      const hashY = builder.pcg2dUnitY(wrappedX, neighborY);
      const centerX = builder.add(
        constant(offsetX),
        builder.multiply(hashX, constant(params.jitter))
      );
      const centerY = builder.add(
        constant(offsetY),
        builder.multiply(hashY, constant(params.jitter))
      );
      const differenceX = builder.subtract(centerX, cellUvX);
      const differenceY = builder.subtract(centerY, cellUvY);
      const distance = builder.sqrt(
        builder.add(builder.square(differenceX), builder.square(differenceY))
      );
      const oldF1 = f1;
      const oldF2 = f2;
      f1 = builder.minimum(oldF1, distance);
      f2 = builder.minimum(oldF2, builder.maximum(oldF1, distance));
    }
  }

  const cellSdf = builder.subtract(f2, f1);
  const web = builder.subtract(
    one,
    builder.smoothstep(zero, constant(params.thickness), cellSdf)
  );
  const bubble = builder.smoothstep(one, zero, f1);
  const pattern = builder.mix(bubble, web, constant(params.morph));
  const fadeLimit = Math.min(params.edgeFade, 0.49);
  let fade = one;
  if (fadeLimit > 0) {
    fade = builder.multiply(
      builder.smoothstep(zero, constant(fadeLimit), t),
      builder.subtract(
        one,
        builder.smoothstep(constant(1 - fadeLimit), one, t)
      )
    );
  }
  return builder.add(
    context.baseRadiusAt(t),
    builder.multiply(
      constant(params.relief),
      builder.multiply(pattern, fade)
    )
  );
}

function compileOuterWall(
  input: CanonicalTargetInputBinding,
  params: VoronoiParameters
): VoronoiOuterWallPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'Voronoi',
    {
      evaluatorId: 'potfoundry.voronoi.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    (context) => {
      const radius = voronoiRadius(
        context,
        params,
        context.localV,
        context.localU
      );
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
  params: VoronoiParameters
): VoronoiSeamCurtainPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'Voronoi',
    {
      evaluatorId: 'potfoundry.voronoi.seam-curtain',
      evaluatorVersion: 'v1',
      patchId: 'seam-curtain',
    },
    (context) => {
      const zero = context.constant(0);
      const materialOne = context.constant(1);
      const t = context.localU;
      const leftRadius = voronoiRadius(context, params, t, zero);
      const rightRadius = voronoiRadius(context, params, t, materialOne);
      const radius = context.builder.mix(leftRadius, rightRadius, context.localV);
      return context.radialPointAt(radius, zero, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'seam-curtain',
    role: 'feature-curtain',
    patchId: 'seam-curtain',
    leftMaterialUExact: '0',
    rightMaterialUExact: '1',
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function patchSetValue(
  patches: readonly VoronoiOuterWallTargetPatch[]
): CanonicalJsonValue {
  return {
    patches: patches.map((patch) => ({
      backendSha256: patch.backends.backendSha256,
      kind: patch.kind,
      nodeCount: patch.nodeCount.toString(),
      patchId: patch.patchId,
      programSha256: patch.programSha256,
      role: patch.role,
      ...(patch.kind === 'seam-curtain'
        ? {
            leftMaterialUExact: patch.leftMaterialUExact,
            rightMaterialUExact: patch.rightMaterialUExact,
          }
        : {}),
    })),
  };
}

function regularityValue(
  params: VoronoiParameters,
  seamCurtainActive: boolean
): CanonicalJsonValue {
  return {
    obligations: [
      {
        condition: 'u*scale+pulse*scale or v*scale*zStretch is an integer',
        id: 'cell-floor-and-hash-partition-lines',
      },
      {
        condition: 'any two of the nine candidate squared distances are equal',
        id: 'f1-f2-order-statistic-bisectors',
      },
      {
        condition: 'a selected candidate distance is zero',
        id: 'distance-square-root-origin',
      },
      {
        condition: '(f2-f1)/thickness or (f1-1)/(0-1) is 0 or 1',
        id: 'web-and-bubble-smoothstep-pieces',
      },
      {
        condition: 'v/fadeLimit or (v-(1-fadeLimit))/fadeLimit is 0 or 1',
        id: 'edge-fade-smoothstep-pieces',
      },
      {
        condition: 'outer radius is nonpositive or the radial surface Jacobian vanishes',
        id: 'outer-wall-regularity',
      },
      ...(seamCurtainActive
        ? [{
            condition: 'u=0 and u=1 seam radii coincide at any height',
            id: 'seam-curtain-jacobian-degeneracy',
          }]
        : []),
    ],
    cpuPeriodX: params.cpuPeriodX.toString(),
    scaleExact: exactFloat64Decimal(params.scale),
    seamCurtainActive,
    styleId: 'Voronoi',
  };
}

function derive(input: CanonicalTargetInputBinding): VoronoiOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'Voronoi') {
    fail(`expected Voronoi but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const seamCurtainActive = params.relief !== 0 && !Number.isInteger(params.scale);
  const outerWall = compileOuterWall(input, params);
  const patches = Object.freeze([
    outerWall,
    ...(seamCurtainActive ? [compileSeamCurtain(input, params)] : []),
  ]) as readonly VoronoiOuterWallTargetPatch[];
  const patchValue = patchSetValue(patches);
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.voronoi-outer-wall-target/patch-set/v1',
    patchValue
  );
  const regularity = regularityValue(params, seamCurtainActive);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(regularity);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.voronoi-outer-wall-target/regularity-obligations/v1',
    regularity
  );
  const currentCpuWgslPeriodMismatch =
    params.cpuPeriodX !== params.wgslRoundPeriodX;
  const bindingValue = {
    canonicalInputSha256: inputProof.canonicalInputSha256,
    cpuPeriodX: params.cpuPeriodX.toString(),
    currentCpuWgslPeriodMismatch,
    implementationScope: VORONOI_OUTER_WALL_TARGET_SCOPE,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: !seamCurtainActive,
    proofMethodSha256: VORONOI_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    scaleExact: exactFloat64Decimal(params.scale),
    schemaVersion: VORONOI_OUTER_WALL_TARGET_VERSION,
    seamCurtainActive,
    styleId: 'Voronoi',
    wgslRoundPeriodX: params.wgslRoundPeriodX.toString(),
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.voronoi-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: VORONOI_OUTER_WALL_TARGET_VERSION,
    implementationScope: VORONOI_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: VORONOI_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'Voronoi',
    scaleExact: exactFloat64Decimal(params.scale),
    cpuPeriodX: params.cpuPeriodX,
    wgslRoundPeriodX: params.wgslRoundPeriodX,
    currentCpuWgslPeriodMismatch,
    seamCurtainActive,
    periodicIdentificationAdmissible: !seamCurtainActive,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as VoronoiOuterWallTargetBinding;
}

export function createVoronoiOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): VoronoiOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function voronoiOuterWallTargetForProof(
  value: VoronoiOuterWallTargetBinding
): VoronoiOuterWallTargetBinding {
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
    value.scaleExact !== derived.scaleExact ||
    value.cpuPeriodX !== derived.cpuPeriodX ||
    value.wgslRoundPeriodX !== derived.wgslRoundPeriodX ||
    value.currentCpuWgslPeriodMismatch !== derived.currentCpuWgslPeriodMismatch ||
    value.seamCurtainActive !== derived.seamCurtainActive ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
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
