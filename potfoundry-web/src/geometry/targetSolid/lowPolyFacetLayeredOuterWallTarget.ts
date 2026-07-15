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

export const LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_VERSION =
  'potfoundry.low-poly-facet-layered-outer-wall-target/v1' as const;
export const LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-low-poly-fixed-tier-bands-conditional-radial-curtains-and-corrected-rim-only-no-inner-rim-bottom-surface-complex-regularity-artifact-distance-or-device-conformance-proof' as const;

export const LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_VERSION,
    `scope=${LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'integral facet and tier counts are authenticated before static program emission',
    'strictly interior jitter (0<jitter<1) emits one fixed-tier band per tier and a radial curtain at every internal tier boundary',
    'jitter zero is phase-invariant and jitter one advances by exactly one polygon sector, so both emit one continuous wall patch without degenerate curtains',
    'the last real tier is extended to v=1; the zero-height extra tier selected by floor(t*tiers) at the exact rim is an implementation defect',
    'all tier bands and curtains reuse the shared exact-pi material angle, profile, placement twist, and radial projection',
    'facet folds, smoothing-clamp transitions, curtain nondegeneracy, and positive radius remain proof obligations',
    'current CPU and WGSL must be migrated at the rim before they can claim this target identity',
  ].join('\n')
);

export interface LowPolyOuterWallBandPatch {
  readonly kind: 'outer-wall-band';
  readonly role: 'outer-wall';
  readonly patchId: string;
  readonly tierIndex: number;
  readonly tStart: number;
  readonly tEnd: number;
  readonly tStartExact: string;
  readonly tEndExact: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface LowPolyFeatureCurtainPatch {
  readonly kind: 'feature-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: string;
  readonly t: number;
  readonly tExact: string;
  readonly leftBandPatchId: string;
  readonly rightBandPatchId: string;
  readonly leftTierIndex: number;
  readonly rightTierIndex: number;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type LowPolyLayeredPatch = LowPolyOuterWallBandPatch | LowPolyFeatureCurtainPatch;

declare const lowPolyFacetLayeredOuterWallTargetBrand: unique symbol;

export interface LowPolyFacetLayeredOuterWallTargetBinding {
  readonly schemaVersion: typeof LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'LowPolyFacet';
  readonly tierDiscontinuitiesActive: boolean;
  readonly correctedRimSemantics: true;
  readonly periodicIdentificationAdmissible: true;
  readonly bandCount: number;
  readonly curtainCount: number;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly LowPolyLayeredPatch[];
  readonly [lowPolyFacetLayeredOuterWallTargetBrand]: true;
}

interface LowPolyParameters {
  readonly facets: number;
  readonly tiers: number;
  readonly amplitude: number;
  readonly bevel: number;
  readonly jitter: number;
  readonly phaseDegrees: number;
}

interface RegisteredBinding {
  readonly binding: LowPolyFacetLayeredOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Low Poly Facet layered outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): LowPolyParameters {
  const facets = Math.max(3, Math.floor(styleNumber(input, 'lpFacets') + 0.5));
  const tiers = Math.max(1, Math.floor(styleNumber(input, 'lpTiers') + 0.5));
  return Object.freeze({
    facets,
    tiers,
    amplitude: styleNumber(input, 'lpAmp'),
    bevel: styleNumber(input, 'lpBevel'),
    jitter: styleNumber(input, 'lpJitter'),
    phaseDegrees: styleNumber(input, 'lpPhaseDeg'),
  });
}

function facetRadius(
  context: RadialTargetPatchContext,
  params: LowPolyParameters,
  t: TargetExpressionReference,
  tierIndex: number
): TargetExpressionReference {
  const { builder, tau, one, constant } = context;
  const thetaMaterial = context.thetaMaterialAt(context.localU);
  const sectorAngle = builder.divide(tau, constant(params.facets));
  const tierPhase = builder.multiply(
    constant(tierIndex * params.jitter),
    sectorAngle
  );
  const phaseOffset = builder.multiply(
    builder.divide(tau, constant(2)),
    constant(params.phaseDegrees / 180)
  );
  const shiftedTheta = builder.add(builder.add(thetaMaterial, tierPhase), phaseOffset);
  const wrapped = builder.subtract(
    builder.fractionalPart(
      builder.add(builder.divide(shiftedTheta, sectorAngle), constant(0.5))
    ),
    constant(0.5)
  );
  const localAngle = builder.multiply(wrapped, sectorAngle);
  const baseRadius = context.baseRadiusAt(t);
  const faceDistance = builder.multiply(baseRadius, constant(1 - params.amplitude));
  const faceRadius = builder.divide(
    faceDistance,
    builder.maximum(builder.cos(localAngle), constant(0.001))
  );
  const smoothingRadius = builder.maximum(
    constant(0.001),
    builder.multiply(
      builder.multiply(constant(params.bevel), constant(0.2)),
      baseRadius
    )
  );
  const blend = builder.clamp(
    builder.add(
      constant(0.5),
      builder.multiply(
        constant(0.5),
        builder.divide(builder.subtract(faceRadius, baseRadius), smoothingRadius)
      )
    ),
    constant(0),
    one
  );
  return builder.subtract(
    builder.add(
      faceRadius,
      builder.multiply(builder.subtract(baseRadius, faceRadius), blend)
    ),
    builder.multiply(
      builder.multiply(smoothingRadius, blend),
      builder.subtract(one, blend)
    )
  );
}

function compileBand(
  input: CanonicalTargetInputBinding,
  params: LowPolyParameters,
  tierIndex: number,
  tStart: number,
  tEnd: number
): LowPolyOuterWallBandPatch {
  const patchId = `outer-wall-band-${tierIndex}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'LowPolyFacet',
    {
      evaluatorId: `potfoundry.low-poly-facet.${patchId}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const t = context.builder.add(
        context.constant(tStart),
        context.builder.multiply(context.constant(tEnd - tStart), context.localV)
      );
      return context.radialPointAt(
        facetRadius(context, params, t, tierIndex),
        context.localU,
        t
      );
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'outer-wall-band',
    role: 'outer-wall',
    patchId,
    tierIndex,
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
  params: LowPolyParameters,
  boundaryIndex: number
): LowPolyFeatureCurtainPatch {
  const leftTierIndex = boundaryIndex - 1;
  const rightTierIndex = boundaryIndex;
  const tValue = boundaryIndex / params.tiers;
  const patchId = `feature-curtain-${boundaryIndex - 1}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'LowPolyFacet',
    {
      evaluatorId: `potfoundry.low-poly-facet.${patchId}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const t = context.constant(tValue);
      const leftRadius = facetRadius(context, params, t, leftTierIndex);
      const rightRadius = facetRadius(context, params, t, rightTierIndex);
      return context.radialPointAt(
        context.builder.mix(leftRadius, rightRadius, context.localV),
        context.localU,
        t
      );
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'feature-curtain',
    role: 'feature-curtain',
    patchId,
    t: tValue,
    tExact: exactFloat64Decimal(tValue),
    leftBandPatchId: `outer-wall-band-${leftTierIndex}`,
    rightBandPatchId: `outer-wall-band-${rightTierIndex}`,
    leftTierIndex,
    rightTierIndex,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function regularityValue(active: boolean): CanonicalJsonValue {
  return {
    obligations: [
      {
        condition: 'fractionalPart(shiftedTheta/sectorAngle+0.5)=0',
        id: 'polygon-facet-folds',
      },
      {
        condition: '0.5+0.5*(faceRadius-baseRadius)/smoothingRadius in {0,1}',
        id: 'smooth-min-clamp-transitions',
      },
      {
        condition: 'leftRadius=rightRadius anywhere on an emitted curtain',
        id: 'curtain-jacobian-degeneracy',
      },
    ],
    correctedRimSemantics: true,
    styleId: 'LowPolyFacet',
    tierDiscontinuitiesActive: active,
  };
}

function patchSetValue(patches: readonly LowPolyLayeredPatch[]): CanonicalJsonValue {
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
            tEndExact: patch.tEndExact,
            tierIndex: patch.tierIndex.toString(),
            tStartExact: patch.tStartExact,
          }
        : {
            leftBandPatchId: patch.leftBandPatchId,
            leftTierIndex: patch.leftTierIndex.toString(),
            rightBandPatchId: patch.rightBandPatchId,
            rightTierIndex: patch.rightTierIndex.toString(),
            tExact: patch.tExact,
          }),
    })),
  };
}

function derive(input: CanonicalTargetInputBinding): LowPolyFacetLayeredOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'LowPolyFacet') {
    fail(`expected LowPolyFacet but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const active = params.jitter > 0 && params.jitter < 1;
  const bandDefinitions = active
    ? Array.from({ length: params.tiers }, (_, tierIndex) => ({
        tierIndex,
        tStart: tierIndex / params.tiers,
        tEnd: (tierIndex + 1) / params.tiers,
      }))
    : [{ tierIndex: 0, tStart: 0, tEnd: 1 }];
  const bands = bandDefinitions.map(({ tierIndex, tStart, tEnd }) =>
    compileBand(input, params, tierIndex, tStart, tEnd)
  );
  const curtains = active
    ? Array.from({ length: params.tiers - 1 }, (_, index) =>
        compileCurtain(input, params, index + 1)
      )
    : [];
  const patches = Object.freeze([...bands, ...curtains]) as readonly LowPolyLayeredPatch[];
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.low-poly-facet-layered-outer-wall-target/patch-set/v1',
    patchSetValue(patches)
  );
  const obligationsValue = regularityValue(active);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(obligationsValue);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.low-poly-facet-layered-outer-wall-target/regularity-obligations/v1',
    obligationsValue
  );
  const bindingValue = {
    bandCount: bands.length.toString(),
    canonicalInputSha256: inputProof.canonicalInputSha256,
    correctedRimSemantics: true,
    curtainCount: curtains.length.toString(),
    implementationScope: LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_SCOPE,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: true,
    proofMethodSha256: LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    schemaVersion: LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_VERSION,
    styleId: 'LowPolyFacet',
    tierDiscontinuitiesActive: active,
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.low-poly-facet-layered-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_VERSION,
    implementationScope: LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: LOW_POLY_FACET_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'LowPolyFacet',
    tierDiscontinuitiesActive: active,
    correctedRimSemantics: true,
    periodicIdentificationAdmissible: true,
    bandCount: bands.length,
    curtainCount: curtains.length,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as LowPolyFacetLayeredOuterWallTargetBinding;
}

export function createLowPolyFacetLayeredOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): LowPolyFacetLayeredOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function lowPolyFacetLayeredOuterWallTargetForProof(
  value: LowPolyFacetLayeredOuterWallTargetBinding
): LowPolyFacetLayeredOuterWallTargetBinding {
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
    value.tierDiscontinuitiesActive !== derived.tierDiscontinuitiesActive ||
    value.correctedRimSemantics !== derived.correctedRimSemantics ||
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
