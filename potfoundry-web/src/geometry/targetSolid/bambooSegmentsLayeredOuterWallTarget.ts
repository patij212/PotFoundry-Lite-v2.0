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

export const BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_VERSION =
  'potfoundry.bamboo-segments-layered-outer-wall-target/v1' as const;
export const BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-bamboo-fixed-segment-bands-conditional-radial-curtains-and-corrected-rim-only-no-inner-rim-bottom-surface-complex-regularity-artifact-distance-or-device-conformance-proof' as const;

export const BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_VERSION,
    `scope=${BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'integral node and striation counts are authenticated before static program emission',
    'one fixed-segment band is emitted per physical segment, isolating every node line even when its position trace is continuous',
    'nonzero segment-index asymmetry emits a radial curtain at every internal node boundary from left local height one to right local height zero',
    'zero asymmetry omits position-degenerate curtains while retaining node partitions for derivative regularity',
    'the last real segment is extended to v=1; the zero-height extra segment selected by the legacy floor expression at exactly t=1 is rejected as an implementation defect',
    'node-line crease regularity, compact exponential clamp, output clamp, and curtain nondegeneracy remain obligations',
    'current CPU and WGSL must be migrated at the rim before they can claim this target identity',
  ].join('\n')
);

export interface BambooOuterWallBandPatch {
  readonly kind: 'outer-wall-band';
  readonly role: 'outer-wall';
  readonly patchId: string;
  readonly segmentIndex: number;
  readonly tStart: number;
  readonly tEnd: number;
  readonly tStartExact: string;
  readonly tEndExact: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface BambooFeatureCurtainPatch {
  readonly kind: 'feature-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: string;
  readonly t: number;
  readonly tExact: string;
  readonly leftBandPatchId: string;
  readonly rightBandPatchId: string;
  readonly leftSegmentIndex: number;
  readonly rightSegmentIndex: number;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export type BambooLayeredPatch = BambooOuterWallBandPatch | BambooFeatureCurtainPatch;

declare const bambooSegmentsLayeredOuterWallTargetBrand: unique symbol;

export interface BambooSegmentsLayeredOuterWallTargetBinding {
  readonly schemaVersion: typeof BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'BambooSegments';
  readonly positionDiscontinuitiesActive: boolean;
  readonly correctedRimSemantics: true;
  readonly periodicIdentificationAdmissible: true;
  readonly bandCount: number;
  readonly curtainCount: number;
  readonly patchCount: number;
  readonly patchSetSha256: string;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly patches: readonly BambooLayeredPatch[];
  readonly [bambooSegmentsLayeredOuterWallTargetBrand]: true;
}

interface BambooParameters {
  readonly segmentCount: number;
  readonly nodeWidth: number;
  readonly prominence: number;
  readonly striations: number;
  readonly striationDepth: number;
  readonly taper: number;
  readonly asymmetry: number;
}

interface RegisteredBinding {
  readonly binding: BambooSegmentsLayeredOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Bamboo Segments layered outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): BambooParameters {
  const segmentCount = Math.max(styleNumber(input, 'bsNodeCount'), 1);
  const striations = styleNumber(input, 'bsStriations');
  if (!Number.isInteger(segmentCount) || !Number.isInteger(striations)) {
    fail('node and striation counts must be integral');
  }
  return Object.freeze({
    segmentCount,
    nodeWidth: Math.max(styleNumber(input, 'bsNodeWidth'), 0.02),
    prominence: styleNumber(input, 'bsNodeProminence'),
    striations,
    striationDepth: styleNumber(input, 'bsStriationDepth'),
    taper: styleNumber(input, 'bsTaper'),
    asymmetry: styleNumber(input, 'bsAsymmetry'),
  });
}

function bambooRadius(
  context: RadialTargetPatchContext,
  params: BambooParameters,
  t: TargetExpressionReference,
  segmentIndex: number,
  segmentLocal: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const thetaMaterial = context.thetaMaterialAt(context.localU);
  const distanceFromNode = builder.minimum(
    segmentLocal,
    builder.subtract(one, segmentLocal)
  );
  const normalizedSquareDistance = builder.divide(
    builder.square(distanceFromNode),
    constant(params.nodeWidth * params.nodeWidth * 2)
  );
  const nodeRing = builder.exp(
    builder.negate(builder.minimum(normalizedSquareDistance, constant(50)))
  );
  const centred = builder.subtract(segmentLocal, constant(0.5));
  const taperFactor = builder.subtract(
    one,
    builder.multiply(
      constant(params.taper),
      builder.subtract(one, builder.multiply(constant(4), builder.square(centred)))
    )
  );
  const striationFactor = builder.multiply(
    constant(params.striationDepth),
    builder.sin(builder.multiply(thetaMaterial, constant(params.striations)))
  );
  const asymmetryVariation = builder.multiply(
    builder.multiply(
      builder.sin(
        builder.add(
          constant(segmentIndex * 7),
          builder.multiply(thetaMaterial, constant(3))
        )
      ),
      constant(params.asymmetry)
    ),
    constant(0.5)
  );
  const modulation = builder.add(
    builder.add(
      builder.multiply(
        taperFactor,
        builder.add(one, builder.multiply(constant(params.prominence), nodeRing))
      ),
      striationFactor
    ),
    asymmetryVariation
  );
  return builder.multiply(
    context.baseRadiusAt(t),
    builder.clamp(modulation, constant(0.5), constant(2))
  );
}

function compileBand(
  input: CanonicalTargetInputBinding,
  params: BambooParameters,
  segmentIndex: number
): BambooOuterWallBandPatch {
  const tStart = segmentIndex / params.segmentCount;
  const tEnd = (segmentIndex + 1) / params.segmentCount;
  const patchId = `outer-wall-band-${segmentIndex}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'BambooSegments',
    {
      evaluatorId: `potfoundry.bamboo-segments.${patchId}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const t = context.builder.add(
        context.constant(tStart),
        context.builder.multiply(context.constant(tEnd - tStart), context.localV)
      );
      const segmentLocal = context.builder.subtract(
        context.builder.multiply(t, context.constant(params.segmentCount)),
        context.constant(segmentIndex)
      );
      const radius = bambooRadius(context, params, t, segmentIndex, segmentLocal);
      return context.radialPointAt(radius, context.localU, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: 'outer-wall-band',
    role: 'outer-wall',
    patchId,
    segmentIndex,
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
  params: BambooParameters,
  boundaryIndex: number
): BambooFeatureCurtainPatch {
  const leftSegmentIndex = boundaryIndex - 1;
  const rightSegmentIndex = boundaryIndex;
  const tValue = boundaryIndex / params.segmentCount;
  const patchId = `feature-curtain-${boundaryIndex - 1}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'BambooSegments',
    {
      evaluatorId: `potfoundry.bamboo-segments.${patchId}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const t = context.constant(tValue);
      const leftRadius = bambooRadius(
        context,
        params,
        t,
        leftSegmentIndex,
        context.constant(1)
      );
      const rightRadius = bambooRadius(
        context,
        params,
        t,
        rightSegmentIndex,
        context.constant(0)
      );
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
    leftBandPatchId: `outer-wall-band-${leftSegmentIndex}`,
    rightBandPatchId: `outer-wall-band-${rightSegmentIndex}`,
    leftSegmentIndex,
    rightSegmentIndex,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

function regularityValue(params: BambooParameters): CanonicalJsonValue {
  return {
    obligations: [
      {
        condition: 'segmentLocal in {0,0.5,1}',
        id: 'node-and-midsegment-piecewise-lines',
      },
      {
        condition: 'distanceFromNode^2/(2*nodeWidth^2)=50',
        id: 'node-exponential-clamp-transition',
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
    correctedRimSemantics: true,
    positionDiscontinuitiesActive: params.asymmetry !== 0,
    styleId: 'BambooSegments',
  };
}

function patchSetValue(patches: readonly BambooLayeredPatch[]): CanonicalJsonValue {
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
            segmentIndex: patch.segmentIndex.toString(),
            tEndExact: patch.tEndExact,
            tStartExact: patch.tStartExact,
          }
        : {
            leftBandPatchId: patch.leftBandPatchId,
            leftSegmentIndex: patch.leftSegmentIndex.toString(),
            rightBandPatchId: patch.rightBandPatchId,
            rightSegmentIndex: patch.rightSegmentIndex.toString(),
            tExact: patch.tExact,
          }),
    })),
  };
}

function derive(input: CanonicalTargetInputBinding): BambooSegmentsLayeredOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'BambooSegments') {
    fail(`expected BambooSegments but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const bands = Array.from({ length: params.segmentCount }, (_, segmentIndex) =>
    compileBand(input, params, segmentIndex)
  );
  const curtains = params.asymmetry === 0
    ? []
    : Array.from({ length: params.segmentCount - 1 }, (_, index) =>
        compileCurtain(input, params, index + 1)
      );
  const patches = Object.freeze([...bands, ...curtains]) as readonly BambooLayeredPatch[];
  const patchSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.bamboo-segments-layered-outer-wall-target/patch-set/v1',
    patchSetValue(patches)
  );
  const obligationsValue = regularityValue(params);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(obligationsValue);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.bamboo-segments-layered-outer-wall-target/regularity-obligations/v1',
    obligationsValue
  );
  const bindingValue = {
    bandCount: bands.length.toString(),
    canonicalInputSha256: inputProof.canonicalInputSha256,
    correctedRimSemantics: true,
    curtainCount: curtains.length.toString(),
    implementationScope: BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_SCOPE,
    patchCount: patches.length.toString(),
    patchSetSha256,
    periodicIdentificationAdmissible: true,
    positionDiscontinuitiesActive: params.asymmetry !== 0,
    proofMethodSha256: BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    schemaVersion: BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_VERSION,
    styleId: 'BambooSegments',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.bamboo-segments-layered-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_VERSION,
    implementationScope: BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: BAMBOO_SEGMENTS_LAYERED_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'BambooSegments',
    positionDiscontinuitiesActive: params.asymmetry !== 0,
    correctedRimSemantics: true,
    periodicIdentificationAdmissible: true,
    bandCount: bands.length,
    curtainCount: curtains.length,
    patchCount: patches.length,
    patchSetSha256,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    patches,
  }) as BambooSegmentsLayeredOuterWallTargetBinding;
}

export function createBambooSegmentsLayeredOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): BambooSegmentsLayeredOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function bambooSegmentsLayeredOuterWallTargetForProof(
  value: BambooSegmentsLayeredOuterWallTargetBinding
): BambooSegmentsLayeredOuterWallTargetBinding {
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
    value.positionDiscontinuitiesActive !== derived.positionDiscontinuitiesActive ||
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
