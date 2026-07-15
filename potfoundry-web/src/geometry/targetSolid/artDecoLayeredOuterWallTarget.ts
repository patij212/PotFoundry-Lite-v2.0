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

export const ART_DECO_LAYERED_OUTER_WALL_TARGET_VERSION =
  'potfoundry.art-deco-layered-outer-wall-target/v1' as const;
export const ART_DECO_LAYERED_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-art-deco-one-sided-outer-wall-bands-and-physical-radial-curtains-only-no-inner-rim-bottom-surface-complex-regularity-artifact-distance-or-device-conformance-proof' as const;

export const ART_DECO_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    ART_DECO_LAYERED_OUTER_WALL_TARGET_VERSION,
    `scope=${ART_DECO_LAYERED_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'fan count, step count, and chevron frequency are authenticated integral style parameters',
    'every tier is partitioned into depressed [0,0.1], normal [0.1,0.9], and depressed [0.9,1] one-sided bands when step depth is active',
    'each 0.1 and 0.9 discontinuity receives a radial curtain interpolating the exact one-sided radius programs at identical material angle, placement twist, and height',
    'zero step depth emits one continuous full-height wall patch and no degenerate curtains',
    'band endpoint and curtain constants are the same exact binary64 values reused from one deterministic partition construction',
    'fan-sector floors, chevron absolute-sine zeros, modulation clamps, and curtain degeneracy remain declared regularity obligations',
    'this layer proves neither curtain nondegeneracy nor a closed full-pot surface complex',
  ].join('\n')
);

export interface ArtDecoOuterWallBandPatch {
  readonly kind: 'outer-wall-band';
  readonly role: 'outer-wall';
  readonly patchId: string;
  readonly tStart: number;
  readonly tEnd: number;
  readonly tStartExact: string;
  readonly tEndExact: string;
  readonly stepFactor: number;
  readonly stepFactorExact: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface ArtDecoFeatureCurtainPatch {
  readonly kind: 'feature-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: string;
  readonly t: number;
  readonly tExact: string;
  readonly leftBandPatchId: string;
  readonly rightBandPatchId: string;
  readonly leftStepFactor: number;
  readonly rightStepFactor: number;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type ArtDecoLayeredPatch = ArtDecoOuterWallBandPatch | ArtDecoFeatureCurtainPatch;

declare const artDecoLayeredOuterWallTargetBrand: unique symbol;

export interface ArtDecoLayeredOuterWallTargetBinding {
  readonly schemaVersion: typeof ART_DECO_LAYERED_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof ART_DECO_LAYERED_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'ArtDeco';
  readonly stepDiscontinuitiesActive: boolean;
  readonly periodicIdentificationAdmissible: true;
  readonly bandCount: number;
  readonly curtainCount: number;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly ArtDecoLayeredPatch[];
  readonly [artDecoLayeredOuterWallTargetBrand]: true;
}

interface ArtDecoParameters {
  readonly fanCount: number;
  readonly fanExponent: number;
  readonly stepCount: number;
  readonly stepDepth: number;
  readonly chevronAmplitude: number;
  readonly chevronFrequency: number;
  readonly blend: number;
}

interface BandDefinition {
  readonly patchId: string;
  readonly tStart: number;
  readonly tEnd: number;
  readonly stepFactor: number;
}

interface CurtainDefinition {
  readonly patchId: string;
  readonly t: number;
  readonly leftBandPatchId: string;
  readonly rightBandPatchId: string;
  readonly leftStepFactor: number;
  readonly rightStepFactor: number;
}

interface RegisteredBinding {
  readonly binding: ArtDecoLayeredOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Art Deco layered outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): ArtDecoParameters {
  const fanCount = Math.max(styleNumber(input, 'adFanCount'), 1);
  const fanSpread = Math.max(styleNumber(input, 'adFanSpread'), 0.1);
  const stepCount = Math.max(styleNumber(input, 'adStepCount'), 1);
  const chevronFrequency = styleNumber(input, 'adChevronFreq');
  if (
    !Number.isInteger(fanCount) ||
    !Number.isInteger(stepCount) ||
    !Number.isInteger(chevronFrequency)
  ) {
    fail('fan count, step count, and chevron frequency must be integral');
  }
  return Object.freeze({
    fanCount,
    fanExponent: Math.max(0.1, Math.min(10, 1 / fanSpread)),
    stepCount,
    stepDepth: styleNumber(input, 'adStepDepth'),
    chevronAmplitude: styleNumber(input, 'adChevronAmp'),
    chevronFrequency,
    blend: styleNumber(input, 'adGeometricBlend'),
  });
}

function definePartition(params: ArtDecoParameters): {
  readonly bands: readonly BandDefinition[];
  readonly curtains: readonly CurtainDefinition[];
} {
  if (params.stepDepth === 0) {
    return Object.freeze({
      bands: Object.freeze([
        Object.freeze({
          patchId: 'outer-wall-band-0',
          tStart: 0,
          tEnd: 1,
          stepFactor: 1,
        }),
      ]),
      curtains: Object.freeze([]),
    });
  }
  const depressed = 1 - params.stepDepth;
  const bands: BandDefinition[] = [];
  const curtains: CurtainDefinition[] = [];
  for (let tier = 0; tier < params.stepCount; tier += 1) {
    const tierStart = tier / params.stepCount;
    const firstJump = (tier + 0.1) / params.stepCount;
    const secondJump = (tier + 0.9) / params.stepCount;
    const tierEnd = (tier + 1) / params.stepCount;
    const lowerId = `outer-wall-band-${bands.length}`;
    bands.push(Object.freeze({
      patchId: lowerId,
      tStart: tierStart,
      tEnd: firstJump,
      stepFactor: depressed,
    }));
    const middleId = `outer-wall-band-${bands.length}`;
    bands.push(Object.freeze({
      patchId: middleId,
      tStart: firstJump,
      tEnd: secondJump,
      stepFactor: 1,
    }));
    curtains.push(Object.freeze({
      patchId: `feature-curtain-${curtains.length}`,
      t: firstJump,
      leftBandPatchId: lowerId,
      rightBandPatchId: middleId,
      leftStepFactor: depressed,
      rightStepFactor: 1,
    }));
    const upperId = `outer-wall-band-${bands.length}`;
    bands.push(Object.freeze({
      patchId: upperId,
      tStart: secondJump,
      tEnd: tierEnd,
      stepFactor: depressed,
    }));
    curtains.push(Object.freeze({
      patchId: `feature-curtain-${curtains.length}`,
      t: secondJump,
      leftBandPatchId: middleId,
      rightBandPatchId: upperId,
      leftStepFactor: 1,
      rightStepFactor: depressed,
    }));
  }
  return Object.freeze({
    bands: Object.freeze(bands),
    curtains: Object.freeze(curtains),
  });
}

function artDecoRadius(
  context: RadialTargetPatchContext,
  params: ArtDecoParameters,
  t: TargetExpressionReference,
  thetaMaterial: TargetExpressionReference,
  stepFactor: number
): TargetExpressionReference {
  const { builder, tau, one, constant } = context;
  const fanFraction = builder.fractionalPart(
    builder.divide(
      builder.multiply(thetaMaterial, constant(params.fanCount)),
      tau
    )
  );
  const fanPhase = builder.multiply(fanFraction, tau);
  const fanRay = builder.power(
    builder.maximum(
      builder.absolute(builder.cos(builder.multiply(fanPhase, constant(0.5)))),
      constant(0.001)
    ),
    constant(params.fanExponent)
  );
  const chevron = builder.absolute(
    builder.sin(
      builder.add(
        builder.multiply(thetaMaterial, constant(params.chevronFrequency)),
        builder.multiply(builder.multiply(t, tau), constant(2))
      )
    )
  );
  const fanModulation = builder.add(
    one,
    builder.multiply(
      builder.multiply(
        constant(0.1),
        builder.subtract(fanRay, constant(0.5))
      ),
      constant(1 - params.blend)
    )
  );
  const chevronModulation = builder.multiply(
    builder.multiply(constant(params.chevronAmplitude), chevron),
    constant(params.blend)
  );
  const modulation = builder.multiply(
    builder.multiply(fanModulation, constant(stepFactor)),
    builder.add(one, chevronModulation)
  );
  return builder.multiply(
    context.baseRadiusAt(t),
    builder.clamp(modulation, constant(0.5), constant(2))
  );
}

function compileBand(
  input: CanonicalTargetInputBinding,
  params: ArtDecoParameters,
  definition: BandDefinition
): ArtDecoOuterWallBandPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'ArtDeco',
    {
      evaluatorId: `potfoundry.art-deco.${definition.patchId}`,
      evaluatorVersion: 'v1',
      patchId: definition.patchId,
    },
    (context) => {
      const t = context.builder.add(
        context.constant(definition.tStart),
        context.builder.multiply(
          context.constant(definition.tEnd - definition.tStart),
          context.localV
        )
      );
      const thetaMaterial = context.thetaMaterialAt(context.localU);
      const radius = artDecoRadius(
        context,
        params,
        t,
        thetaMaterial,
        definition.stepFactor
      );
      return context.radialPointAt(radius, context.localU, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'outer-wall-band',
    role: 'outer-wall',
    patchId: definition.patchId,
    tStart: definition.tStart,
    tEnd: definition.tEnd,
    tStartExact: exactFloat64Decimal(definition.tStart),
    tEndExact: exactFloat64Decimal(definition.tEnd),
    stepFactor: definition.stepFactor,
    stepFactorExact: exactFloat64Decimal(definition.stepFactor),
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function compileCurtain(
  input: CanonicalTargetInputBinding,
  params: ArtDecoParameters,
  definition: CurtainDefinition
): ArtDecoFeatureCurtainPatch {
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'ArtDeco',
    {
      evaluatorId: `potfoundry.art-deco.${definition.patchId}`,
      evaluatorVersion: 'v1',
      patchId: definition.patchId,
    },
    (context) => {
      const t = context.constant(definition.t);
      const thetaMaterial = context.thetaMaterialAt(context.localU);
      const leftRadius = artDecoRadius(
        context,
        params,
        t,
        thetaMaterial,
        definition.leftStepFactor
      );
      const rightRadius = artDecoRadius(
        context,
        params,
        t,
        thetaMaterial,
        definition.rightStepFactor
      );
      const radius = context.builder.mix(leftRadius, rightRadius, context.localV);
      return context.radialPointAt(radius, context.localU, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'feature-curtain',
    role: 'feature-curtain',
    patchId: definition.patchId,
    t: definition.t,
    tExact: exactFloat64Decimal(definition.t),
    leftBandPatchId: definition.leftBandPatchId,
    rightBandPatchId: definition.rightBandPatchId,
    leftStepFactor: definition.leftStepFactor,
    rightStepFactor: definition.rightStepFactor,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function regularityValue(params: ArtDecoParameters): CanonicalJsonValue {
  return {
    obligations: [
      {
        condition: 'fractionalPart(thetaMaterial*fanCount/(2*pi))=0 or abs(cos(fanPhase/2))=0.001',
        id: 'fan-sector-and-floor-boundaries',
      },
      {
        condition: 'sin(thetaMaterial*chevronFrequency+4*pi*t)=0 when chevronAmplitude*blend!=0',
        id: 'chevron-absolute-sine-creases',
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
    stepDepthActive: params.stepDepth !== 0,
    styleId: 'ArtDeco',
  };
}

function patchSetValue(patches: readonly ArtDecoLayeredPatch[]): CanonicalJsonValue {
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
            stepFactorExact: patch.stepFactorExact,
            tEndExact: patch.tEndExact,
            tStartExact: patch.tStartExact,
          }
        : {
            leftBandPatchId: patch.leftBandPatchId,
            leftStepFactorExact: exactFloat64Decimal(patch.leftStepFactor),
            rightBandPatchId: patch.rightBandPatchId,
            rightStepFactorExact: exactFloat64Decimal(patch.rightStepFactor),
            tExact: patch.tExact,
          }),
    })),
  };
}

function derive(input: CanonicalTargetInputBinding): ArtDecoLayeredOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'ArtDeco') {
    fail(`expected ArtDeco but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const partition = definePartition(params);
  const bands = partition.bands.map((definition) => compileBand(input, params, definition));
  const curtains = partition.curtains.map((definition) =>
    compileCurtain(input, params, definition)
  );
  const patches = Object.freeze([...bands, ...curtains]) as readonly ArtDecoLayeredPatch[];
  const patchValue = patchSetValue(patches);
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.art-deco-layered-outer-wall-target/patch-set/v1',
    patchValue
  );
  const obligationsValue = regularityValue(params);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(obligationsValue);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.art-deco-layered-outer-wall-target/regularity-obligations/v1',
    obligationsValue
  );
  const bindingValue = {
    bandCount: bands.length.toString(),
    canonicalInputSha256: inputProof.canonicalInputSha256,
    curtainCount: curtains.length.toString(),
    implementationScope: ART_DECO_LAYERED_OUTER_WALL_TARGET_SCOPE,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: true,
    proofMethodSha256: ART_DECO_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    schemaVersion: ART_DECO_LAYERED_OUTER_WALL_TARGET_VERSION,
    stepDiscontinuitiesActive: params.stepDepth !== 0,
    styleId: 'ArtDeco',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.art-deco-layered-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: ART_DECO_LAYERED_OUTER_WALL_TARGET_VERSION,
    implementationScope: ART_DECO_LAYERED_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: ART_DECO_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'ArtDeco',
    stepDiscontinuitiesActive: params.stepDepth !== 0,
    periodicIdentificationAdmissible: true,
    bandCount: bands.length,
    curtainCount: curtains.length,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as ArtDecoLayeredOuterWallTargetBinding;
}

export function createArtDecoLayeredOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): ArtDecoLayeredOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function artDecoLayeredOuterWallTargetForProof(
  value: ArtDecoLayeredOuterWallTargetBinding
): ArtDecoLayeredOuterWallTargetBinding {
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
    value.stepDiscontinuitiesActive !== derived.stepDiscontinuitiesActive ||
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
