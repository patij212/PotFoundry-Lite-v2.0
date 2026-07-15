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

export const DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_VERSION =
  'potfoundry.dragon-scales-layered-outer-wall-target/v1' as const;
export const DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-dragon-scales-one-sided-row-bands-and-physical-radial-curtains-only-no-inner-rim-bottom-surface-complex-regularity-artifact-distance-or-device-conformance-proof' as const;

export const DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_VERSION,
    `scope=${DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'integral row and scale counts are authenticated before static program emission',
    'active scale depth emits one fixed-row wall band per row and one radial curtain at every internal row boundary',
    'the final row extends continuously to v=1, preserving the production rim-row correction rather than creating a spurious extra row',
    'curtain endpoints evaluate row k-1 at local height one and row k at local height zero at the same exact global height',
    'zero scale depth proves row state dead and emits one continuous full-height wall program without degenerate curtains',
    'scale cell creases, centre norm singularity, compact-support floor, modulation clamp, and curtain nondegeneracy remain explicit obligations',
    'this layer does not prove a closed full-pot surface complex or geometric regularity',
  ].join('\n')
);

export interface DragonScalesOuterWallBandPatch {
  readonly kind: 'outer-wall-band';
  readonly role: 'outer-wall';
  readonly patchId: string;
  readonly rowIndex: number;
  readonly tStart: number;
  readonly tEnd: number;
  readonly tStartExact: string;
  readonly tEndExact: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface DragonScalesFeatureCurtainPatch {
  readonly kind: 'feature-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: string;
  readonly t: number;
  readonly tExact: string;
  readonly leftBandPatchId: string;
  readonly rightBandPatchId: string;
  readonly leftRowIndex: number;
  readonly rightRowIndex: number;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type DragonScalesLayeredPatch =
  | DragonScalesOuterWallBandPatch
  | DragonScalesFeatureCurtainPatch;

declare const dragonScalesLayeredOuterWallTargetBrand: unique symbol;

export interface DragonScalesLayeredOuterWallTargetBinding {
  readonly schemaVersion: typeof DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'DragonScales';
  readonly rowDiscontinuitiesActive: boolean;
  readonly periodicIdentificationAdmissible: true;
  readonly bandCount: number;
  readonly curtainCount: number;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly DragonScalesLayeredPatch[];
  readonly [dragonScalesLayeredOuterWallTargetBrand]: true;
}

interface DragonScalesParameters {
  readonly rowCount: number;
  readonly scalesPerRow: number;
  readonly scaleDepth: number;
  readonly overlap: number;
  readonly curvature: number;
  readonly randomize: number;
  readonly gradient: number;
}

interface RegisteredBinding {
  readonly binding: DragonScalesLayeredOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Dragon Scales layered outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): DragonScalesParameters {
  const rowCount = Math.max(styleNumber(input, 'dsScaleRows'), 1);
  const scalesPerRow = Math.max(styleNumber(input, 'dsScalesPerRow'), 1);
  if (!Number.isInteger(rowCount) || !Number.isInteger(scalesPerRow)) {
    fail('row and scale counts must be integral');
  }
  return Object.freeze({
    rowCount,
    scalesPerRow,
    scaleDepth: styleNumber(input, 'dsScaleDepth'),
    overlap: Math.min(Math.max(styleNumber(input, 'dsOverlap'), 0), 0.9),
    curvature: Math.max(0.1, Math.min(styleNumber(input, 'dsCurvature'), 5)),
    randomize: styleNumber(input, 'dsRandomize'),
    gradient: styleNumber(input, 'dsHeightGradient'),
  });
}

function dragonRadius(
  context: RadialTargetPatchContext,
  params: DragonScalesParameters,
  t: TargetExpressionReference,
  rowIndex: number,
  rowLocal: TargetExpressionReference
): TargetExpressionReference {
  const { builder, tau, one, constant } = context;
  const thetaMaterial = context.thetaMaterialAt(context.localU);
  const staggerOffset = rowIndex % 2 === 1
    ? builder.divide(builder.multiply(constant(0.5), tau), constant(params.scalesPerRow))
    : constant(0);
  const scaleTheta = builder.add(thetaMaterial, staggerOffset);
  const scaleFraction = builder.fractionalPart(
    builder.divide(
      builder.multiply(scaleTheta, constant(params.scalesPerRow)),
      tau
    )
  );
  const scalePhase = builder.multiply(scaleFraction, tau);
  const scaleLocal = builder.divide(scalePhase, tau);
  const xDistance = builder.multiply(
    builder.absolute(builder.subtract(scaleLocal, constant(0.5))),
    constant(2)
  );
  const yDistance = builder.divide(
    builder.absolute(builder.subtract(rowLocal, constant(params.overlap))),
    constant(Math.max(1 - params.overlap * 0.5, 0.1))
  );
  const distanceFromCenter = builder.length2(xDistance, yDistance);
  const scaleShape = builder.subtract(
    one,
    builder.power(
      builder.maximum(
        builder.subtract(one, distanceFromCenter),
        constant(0.001)
      ),
      constant(params.curvature)
    )
  );
  const sizeMultiplier = builder.add(
    one,
    builder.multiply(
      builder.subtract(t, constant(0.5)),
      constant(params.gradient - 1)
    )
  );
  const randomVariation = builder.multiply(
    builder.sin(
      builder.add(
        builder.multiply(thetaMaterial, constant(13)),
        builder.multiply(t, constant(19))
      )
    ),
    constant(params.randomize)
  );
  const modulation = builder.add(
    builder.subtract(
      one,
      builder.multiply(
        builder.multiply(constant(params.scaleDepth), scaleShape),
        sizeMultiplier
      )
    ),
    randomVariation
  );
  return builder.multiply(
    context.baseRadiusAt(t),
    builder.clamp(modulation, constant(0.5), constant(2))
  );
}

function compileBand(
  input: CanonicalTargetInputBinding,
  params: DragonScalesParameters,
  rowIndex: number,
  tStart: number,
  tEnd: number
): DragonScalesOuterWallBandPatch {
  const patchId = `outer-wall-band-${rowIndex}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'DragonScales',
    {
      evaluatorId: `potfoundry.dragon-scales.${patchId}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const t = context.builder.add(
        context.constant(tStart),
        context.builder.multiply(context.constant(tEnd - tStart), context.localV)
      );
      const rowLocal = params.scaleDepth === 0
        ? context.constant(0)
        : context.builder.subtract(
            context.builder.multiply(t, context.constant(params.rowCount)),
            context.constant(rowIndex)
          );
      const radius = dragonRadius(context, params, t, rowIndex, rowLocal);
      return context.radialPointAt(radius, context.localU, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'outer-wall-band',
    role: 'outer-wall',
    patchId,
    rowIndex,
    tStart,
    tEnd,
    tStartExact: exactFloat64Decimal(tStart),
    tEndExact: exactFloat64Decimal(tEnd),
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function compileCurtain(
  input: CanonicalTargetInputBinding,
  params: DragonScalesParameters,
  boundaryIndex: number
): DragonScalesFeatureCurtainPatch {
  const leftRowIndex = boundaryIndex - 1;
  const rightRowIndex = boundaryIndex;
  const tValue = boundaryIndex / params.rowCount;
  const patchId = `feature-curtain-${boundaryIndex - 1}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'DragonScales',
    {
      evaluatorId: `potfoundry.dragon-scales.${patchId}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const t = context.constant(tValue);
      const leftRadius = dragonRadius(
        context,
        params,
        t,
        leftRowIndex,
        context.constant(1)
      );
      const rightRadius = dragonRadius(
        context,
        params,
        t,
        rightRowIndex,
        context.constant(0)
      );
      const radius = context.builder.mix(leftRadius, rightRadius, context.localV);
      return context.radialPointAt(radius, context.localU, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'feature-curtain',
    role: 'feature-curtain',
    patchId,
    t: tValue,
    tExact: exactFloat64Decimal(tValue),
    leftBandPatchId: `outer-wall-band-${leftRowIndex}`,
    rightBandPatchId: `outer-wall-band-${rightRowIndex}`,
    leftRowIndex,
    rightRowIndex,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function regularityValue(params: DragonScalesParameters): CanonicalJsonValue {
  return {
    obligations: [
      {
        condition: 'fractionalPart((thetaMaterial+staggerOffset)*scalesPerRow/(2*pi)) in {0,0.5}',
        id: 'scale-cell-wrap-and-centre-creases',
      },
      {
        condition: 'rowLocal=overlap or xDistance=yDistance=0',
        id: 'scale-centre-absolute-and-norm-loci',
      },
      {
        condition: '1-distanceFromCenter=0.001',
        id: 'scale-compact-support-floor',
      },
      {
        condition: 'unclampedModulation=0.5 or unclampedModulation=2',
        id: 'modulation-clamp-contacts',
      },
      {
        condition: 'leftRadius=rightRadius anywhere on an emitted curtain',
        id: 'curtain-jacobian-degeneracy',
      },
    ],
    rowDiscontinuitiesActive: params.scaleDepth !== 0,
    styleId: 'DragonScales',
  };
}

function patchSetValue(patches: readonly DragonScalesLayeredPatch[]): CanonicalJsonValue {
  return {
    patches: patches.map((patch) => ({
      backendSha256: patch.backends.backendSha256,
      kind: patch.kind,
      nodeCount: patch.nodeCount.toString(),
      patchId: patch.patchId,
      programSha256: patch.programSha256,
      role: patch.role,
      ...(patch.kind === 'outer-wall-band'
        ? {
            rowIndex: patch.rowIndex.toString(),
            tEndExact: patch.tEndExact,
            tStartExact: patch.tStartExact,
          }
        : {
            leftBandPatchId: patch.leftBandPatchId,
            leftRowIndex: patch.leftRowIndex.toString(),
            rightBandPatchId: patch.rightBandPatchId,
            rightRowIndex: patch.rightRowIndex.toString(),
            tExact: patch.tExact,
          }),
    })),
  };
}

function derive(input: CanonicalTargetInputBinding): DragonScalesLayeredOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'DragonScales') {
    fail(`expected DragonScales but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const bandDefinitions = params.scaleDepth === 0
    ? [{ rowIndex: 0, tStart: 0, tEnd: 1 }]
    : Array.from({ length: params.rowCount }, (_, rowIndex) => ({
        rowIndex,
        tStart: rowIndex / params.rowCount,
        tEnd: (rowIndex + 1) / params.rowCount,
      }));
  const bands = bandDefinitions.map(({ rowIndex, tStart, tEnd }) =>
    compileBand(input, params, rowIndex, tStart, tEnd)
  );
  const curtains = params.scaleDepth === 0
    ? []
    : Array.from({ length: params.rowCount - 1 }, (_, index) =>
        compileCurtain(input, params, index + 1)
      );
  const patches = Object.freeze([...bands, ...curtains]) as readonly DragonScalesLayeredPatch[];
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.dragon-scales-layered-outer-wall-target/patch-set/v1',
    patchSetValue(patches)
  );
  const obligationsValue = regularityValue(params);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(obligationsValue);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.dragon-scales-layered-outer-wall-target/regularity-obligations/v1',
    obligationsValue
  );
  const bindingValue = {
    bandCount: bands.length.toString(),
    canonicalInputSha256: inputProof.canonicalInputSha256,
    curtainCount: curtains.length.toString(),
    implementationScope: DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_SCOPE,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: true,
    proofMethodSha256: DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    rowDiscontinuitiesActive: params.scaleDepth !== 0,
    schemaVersion: DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_VERSION,
    styleId: 'DragonScales',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.dragon-scales-layered-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_VERSION,
    implementationScope: DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: DRAGON_SCALES_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'DragonScales',
    rowDiscontinuitiesActive: params.scaleDepth !== 0,
    periodicIdentificationAdmissible: true,
    bandCount: bands.length,
    curtainCount: curtains.length,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as DragonScalesLayeredOuterWallTargetBinding;
}

export function createDragonScalesLayeredOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): DragonScalesLayeredOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function dragonScalesLayeredOuterWallTargetForProof(
  value: DragonScalesLayeredOuterWallTargetBinding
): DragonScalesLayeredOuterWallTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('binding is not an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('binding is not an authenticated capability');
  }
  for (const patch of value.patches) generatedTargetProgramBackendsForProof(patch.backends);
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
    value.rowDiscontinuitiesActive !== derived.rowDiscontinuitiesActive ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.bandCount !== derived.bandCount ||
    value.curtainCount !== derived.curtainCount ||
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
