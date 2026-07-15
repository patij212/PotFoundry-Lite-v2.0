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

export const CELTIC_TRIQUETRA_OUTER_WALL_TARGET_VERSION =
  'potfoundry.celtic-triquetra-outer-wall-target/v1' as const;
export const CELTIC_TRIQUETRA_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-celtic-triquetra-continuous-piecewise-outer-wall-with-declared-tile-band-medallion-rim-obligations-only-no-complete-regularity-partition-inner-rim-bottom-artifact-distance-or-device-conformance-proof' as const;
export const CELTIC_TRIQUETRA_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    CELTIC_TRIQUETRA_OUTER_WALL_TARGET_VERSION,
    `scope=${CELTIC_TRIQUETRA_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'integral horizontal and vertical repeat counts are resolved from authenticated normalized controls before emission',
    'upper/lower masks, rotated braid tile parity, bend arcs, crossing carve, edge caps, medallion, and three rim ridges share one SSA graph',
    'all tile branches are statically combined with exact integer parity masks; no callback, dynamic loop, or bitwise host state enters the target program',
    'the medallion sector fold uses the shared principal atan2(y,x) operation and exact mathematical pi interval semantics',
    'material u is reduced by fractionalPart before every style consumer, so u=0 and u=1 have identical style traces and admit periodic identification',
    'band masks and medallion presence go continuously to zero; maxima and smooth maxima are continuous, while tile/sector joins remain regularity obligations',
    'this layer does not claim the complete root-isolated partition, image regularity, full solid, artifact tolerance, or device transcendental conformance',
  ].join('\n')
);

declare const celticTriquetraOuterWallTargetBrand: unique symbol;

export interface CelticTriquetraOuterWallTargetBinding {
  readonly schemaVersion: typeof CELTIC_TRIQUETRA_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof CELTIC_TRIQUETRA_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly styleId: 'CelticTriquetra';
  readonly patchId: 'outer-wall';
  readonly columnCount: number;
  readonly rowCount: number;
  readonly continuitySemantics: 'continuous-piecewise-defined-target';
  readonly periodicIdentificationAdmissible: true;
  readonly completeRegularityPartitionEmitted: false;
  readonly regularityObligationsCanonicalJson: string;
  readonly regularityObligationsSha256: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
  readonly [celticTriquetraOuterWallTargetBrand]: true;
}

interface CelticTriquetraParameters {
  readonly columns: number;
  readonly rows: number;
  readonly halfWidth: number;
  readonly relief: number;
  readonly medallionRadius: number;
  readonly medallionY: number;
  readonly gap: number;
}

interface RegisteredBinding {
  readonly binding: CelticTriquetraOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();
const ROUNDNESS = 0.85;

function fail(message: string): never {
  throw new TypeError(`Celtic Triquetra outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function parameters(input: CanonicalTargetInputBinding): CelticTriquetraParameters {
  return Object.freeze({
    columns: Math.max(1, Math.floor(styleNumber(input, 'ctScaleX') + 0.5)),
    rows: Math.max(2, Math.floor(styleNumber(input, 'ctRows') + 0.5)),
    halfWidth: styleNumber(input, 'ctWidth'),
    relief: styleNumber(input, 'ctRelief'),
    medallionRadius: styleNumber(input, 'ctMedScale'),
    medallionY: styleNumber(input, 'ctMedY'),
    gap: styleNumber(input, 'ctGap'),
  });
}

function ribbonHeight(
  context: RadialTargetPatchContext,
  distance: TargetExpressionReference,
  halfWidth: number
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const normalized = builder.clamp(
    builder.divide(distance, constant(Math.max(halfWidth, 1e-5))),
    constant(0),
    one
  );
  const linear = builder.subtract(one, normalized);
  const cosine = builder.cos(
    builder.multiply(normalized, builder.divide(builder.pi(), constant(2)))
  );
  return builder.mix(linear, cosine, constant(ROUNDNESS));
}

function ribbonPresence(
  context: RadialTargetPatchContext,
  distance: TargetExpressionReference,
  width: number,
  antialias: number
): TargetExpressionReference {
  return context.builder.smoothstep(
    context.constant(width + antialias),
    context.constant(width - antialias),
    distance
  );
}

function smoothMaximum(
  context: RadialTargetPatchContext,
  left: TargetExpressionReference,
  right: TargetExpressionReference,
  smoothing: number
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const h = builder.clamp(
    builder.add(
      constant(0.5),
      builder.divide(
        builder.multiply(constant(0.5), builder.subtract(left, right)),
        constant(smoothing)
      )
    ),
    constant(0),
    one
  );
  return builder.add(
    builder.mix(right, left, h),
    builder.multiply(
      constant(smoothing),
      builder.multiply(h, builder.subtract(one, h))
    )
  );
}

function parity(
  context: RadialTargetPatchContext,
  integer: TargetExpressionReference
): TargetExpressionReference {
  const { builder, constant } = context;
  const absolute = builder.absolute(integer);
  return builder.subtract(
    absolute,
    builder.multiply(
      builder.floor(builder.divide(absolute, constant(2))),
      constant(2)
    )
  );
}

function crossingHeight(
  context: RadialTargetPatchContext,
  tileX: TargetExpressionReference,
  tileY: TargetExpressionReference,
  verticalOnTop: TargetExpressionReference,
  params: CelticTriquetraParameters,
  vBand: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const dVertical = builder.absolute(builder.subtract(tileX, constant(0.5)));
  const dHorizontal = builder.absolute(builder.subtract(tileY, constant(0.5)));
  const verticalHeight = ribbonHeight(context, dVertical, params.halfWidth);
  const horizontalHeight = ribbonHeight(context, dHorizontal, params.halfWidth);
  const distanceToEdge = builder.minimum(vBand, builder.subtract(one, vBand));
  const edgeFactor = builder.subtract(
    one,
    builder.smoothstep(constant(0), constant(0.45), distanceToEdge)
  );
  const antialias = Math.max(0.006, params.halfWidth * 0.25);
  const verticalPresence = ribbonPresence(
    context,
    dVertical,
    params.halfWidth,
    antialias
  );
  const horizontalPresence = ribbonPresence(
    context,
    dHorizontal,
    params.halfWidth,
    antialias
  );
  const coreWidth = Math.min(
    Math.max(
      params.halfWidth * (0.55 + params.gap * 1.5),
      params.halfWidth * 0.45
    ),
    params.halfWidth * 0.9
  );
  const carve = builder.multiply(
    constant(Math.min(Math.max(params.gap * 35, 0), 1)),
    builder.subtract(one, edgeFactor)
  );
  const verticalCore = ribbonPresence(context, dVertical, coreWidth, antialias);
  const horizontalCore = ribbonPresence(context, dHorizontal, coreWidth, antialias);
  const horizontalUnder = builder.multiply(
    horizontalHeight,
    builder.subtract(
      one,
      builder.multiply(
        carve,
        builder.multiply(horizontalPresence, verticalCore)
      )
    )
  );
  const verticalUnder = builder.multiply(
    verticalHeight,
    builder.subtract(
      one,
      builder.multiply(carve, builder.multiply(verticalPresence, horizontalCore))
    )
  );
  const verticalTopHeight = builder.maximum(verticalHeight, horizontalUnder);
  const horizontalTopHeight = builder.maximum(verticalUnder, horizontalHeight);
  return builder.mix(horizontalTopHeight, verticalTopHeight, verticalOnTop);
}

function tileHeight(
  context: RadialTargetPatchContext,
  tileX: TargetExpressionReference,
  tileY: TargetExpressionReference,
  indexX: TargetExpressionReference,
  indexY: TargetExpressionReference,
  params: CelticTriquetraParameters,
  vBand: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const xOdd = parity(context, indexX);
  const yOdd = parity(context, indexY);
  const tileZeroMask = builder.multiply(
    builder.subtract(one, xOdd),
    builder.subtract(one, yOdd)
  );
  const tileOneMask = builder.multiply(xOdd, yOdd);
  const tileTwoMask = builder.subtract(
    one,
    builder.add(tileZeroMask, tileOneMask)
  );
  const dTopRight = builder.absolute(
    builder.subtract(
      builder.length2(
        builder.subtract(tileX, one),
        builder.subtract(tileY, one)
      ),
      constant(0.5)
    )
  );
  const dBottomLeft = builder.absolute(
    builder.subtract(builder.length2(tileX, tileY), constant(0.5))
  );
  const tileZeroHeight = builder.maximum(
    ribbonHeight(context, dTopRight, params.halfWidth),
    ribbonHeight(context, dBottomLeft, params.halfWidth)
  );
  const dTopLeft = builder.absolute(
    builder.subtract(
      builder.length2(tileX, builder.subtract(tileY, one)),
      constant(0.5)
    )
  );
  const dBottomRight = builder.absolute(
    builder.subtract(
      builder.length2(builder.subtract(tileX, one), tileY),
      constant(0.5)
    )
  );
  const tileOneHeight = builder.maximum(
    ribbonHeight(context, dTopLeft, params.halfWidth),
    ribbonHeight(context, dBottomRight, params.halfWidth)
  );
  const verticalOnTop = builder.subtract(
    one,
    parity(context, builder.add(indexX, indexY))
  );
  const tileTwoHeight = crossingHeight(
    context,
    tileX,
    tileY,
    verticalOnTop,
    params,
    vBand
  );
  return builder.add(
    builder.multiply(tileZeroMask, tileZeroHeight),
    builder.add(
      builder.multiply(tileOneMask, tileOneHeight),
      builder.multiply(tileTwoMask, tileTwoHeight)
    )
  );
}

function edgeCaps(
  context: RadialTargetPatchContext,
  bandHeight: TargetExpressionReference,
  vBand: TargetExpressionReference,
  rows: number,
  params: CelticTriquetraParameters
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const capHalfWidth = params.halfWidth * 1.1;
  const bottomDistance = builder.absolute(builder.multiply(vBand, constant(rows)));
  const bottomCap = ribbonHeight(context, bottomDistance, capHalfWidth);
  const bottomBlend = builder.smoothstep(constant(0.3), constant(0.075), vBand);
  const bottomCandidate = smoothMaximum(
    context,
    bandHeight,
    builder.multiply(bottomCap, bottomBlend),
    0.1
  );
  const bottomActive = builder.subtract(one, builder.step(constant(0.3), vBand));
  let result = builder.mix(bandHeight, bottomCandidate, bottomActive);

  const topDistance = builder.absolute(
    builder.multiply(builder.subtract(one, vBand), constant(rows))
  );
  const topCap = ribbonHeight(context, topDistance, capHalfWidth);
  const topBlend = builder.smoothstep(constant(0.7), constant(0.925), vBand);
  const topCandidate = smoothMaximum(
    context,
    result,
    builder.multiply(topCap, topBlend),
    0.1
  );
  const topActive = builder.subtract(one, builder.step(vBand, constant(0.7)));
  result = builder.mix(result, topCandidate, topActive);
  return result;
}

function bandHeight(
  context: RadialTargetPatchContext,
  params: CelticTriquetraParameters,
  t: TargetExpressionReference,
  u: TargetExpressionReference,
  y0: number,
  y1: number,
  rows: number,
  offsetX: number
): TargetExpressionReference {
  const { builder, constant } = context;
  const vBand = builder.divide(
    builder.subtract(t, constant(y0)),
    constant(y1 - y0)
  );
  const axisX = builder.add(
    builder.multiply(u, constant(params.columns)),
    constant(offsetX)
  );
  const axisY = builder.multiply(vBand, constant(rows));
  const rotatedX = builder.add(axisX, axisY);
  const rotatedY = builder.add(builder.negate(axisX), axisY);
  const indexX = builder.floor(rotatedX);
  const indexY = builder.floor(rotatedY);
  const tileX = builder.fractionalPart(rotatedX);
  const tileY = builder.fractionalPart(rotatedY);
  return edgeCaps(
    context,
    tileHeight(context, tileX, tileY, indexX, indexY, params, vBand),
    vBand,
    rows,
    params
  );
}

function bandMask(
  context: RadialTargetPatchContext,
  t: TargetExpressionReference,
  y0: number,
  y1: number
): TargetExpressionReference {
  const { builder, one, constant } = context;
  return builder.multiply(
    builder.smoothstep(constant(y0), constant(y0 + 0.02), t),
    builder.subtract(
      one,
      builder.smoothstep(constant(y1 - 0.02), constant(y1), t)
    )
  );
}

function medallionHeight(
  context: RadialTargetPatchContext,
  params: CelticTriquetraParameters,
  t: TargetExpressionReference,
  u: TargetExpressionReference
): TargetExpressionReference {
  const { builder, one, constant } = context;
  const wrappedU = builder.subtract(builder.fractionalPart(u), constant(0.5));
  const vertical = builder.subtract(t, constant(params.medallionY));
  const pointX = builder.divide(wrappedU, constant(params.medallionRadius));
  const pointY = builder.divide(vertical, constant(params.medallionRadius));
  const pointLength = builder.length2(pointX, pointY);
  const inside = builder.subtract(
    one,
    builder.smoothstep(constant(1), constant(1.1), pointLength)
  );
  const halfWidth =
    (params.halfWidth * 0.55) / Math.max(params.medallionRadius, 1e-4);
  const angle = builder.add(
    builder.atan2(pointY, builder.negate(pointX)),
    builder.pi()
  );
  const sectorWidth = builder.divide(context.tau, constant(3));
  const sector = builder.floor(builder.divide(angle, sectorWidth));
  const rotation = builder.multiply(sector, sectorWidth);
  const cosine = builder.cos(rotation);
  const sine = builder.sin(rotation);
  const rotatedX = builder.subtract(
    builder.multiply(pointX, cosine),
    builder.multiply(pointY, sine)
  );
  const rotatedY = builder.add(
    builder.multiply(pointX, sine),
    builder.multiply(pointY, cosine)
  );
  const arcDistance = builder.absolute(
    builder.subtract(
      builder.length2(rotatedX, builder.subtract(rotatedY, constant(0.35))),
      constant(0.55)
    )
  );
  return builder.multiply(inside, ribbonHeight(context, arcDistance, halfWidth));
}

function triquetraRadius(
  context: RadialTargetPatchContext,
  params: CelticTriquetraParameters,
  t: TargetExpressionReference,
  materialU: TargetExpressionReference
): TargetExpressionReference {
  const { builder, constant } = context;
  const u = builder.fractionalPart(materialU);
  const upperMask = bandMask(context, t, 0.55, 0.88);
  const lowerMask = bandMask(context, t, 0.18, 0.48);
  const upper = builder.multiply(
    upperMask,
    bandHeight(context, params, t, u, 0.55, 0.88, params.rows, 0)
  );
  const lowerRows = Math.max(2, params.rows - 2);
  const lower = builder.multiply(
    lowerMask,
    bandHeight(context, params, t, u, 0.18, 0.48, lowerRows, 0.5)
  );
  let height = builder.maximum(upper, lower);
  height = builder.maximum(height, medallionHeight(context, params, t, u));
  const rimWidth = constant(0.008);
  const rimTop = builder.multiply(
    builder.smoothstep(rimWidth, constant(0), builder.absolute(builder.subtract(t, constant(0.9)))),
    constant(0.6)
  );
  const rimMiddle = builder.multiply(
    builder.smoothstep(rimWidth, constant(0), builder.absolute(builder.subtract(t, constant(0.52)))),
    constant(0.4)
  );
  const rimBottom = builder.multiply(
    builder.smoothstep(rimWidth, constant(0), builder.absolute(builder.subtract(t, constant(0.15)))),
    constant(0.4)
  );
  height = builder.maximum(height, rimTop);
  height = builder.maximum(height, rimMiddle);
  height = builder.maximum(height, rimBottom);
  const base = builder.subtract(
    context.baseRadiusAt(t),
    constant(params.relief * 0.15)
  );
  return builder.add(base, builder.multiply(height, constant(params.relief)));
}

function regularityValue(params: CelticTriquetraParameters): CanonicalJsonValue {
  return {
    completeRegularityPartitionEmitted: false,
    obligations: [
      {
        condition: 'rotated braid q.x or q.y is an integer in either band',
        id: 'braid-tile-parity-joins',
      },
      {
        condition: 'any ribbon distance is 0, halfWidth, or a presence/core smoothstep edge',
        id: 'ribbon-cusps-support-and-carve-pieces',
      },
      {
        condition: 'vBand is 0.075, 0.3, 0.7, or 0.925',
        id: 'edge-cap-activation-and-blend-pieces',
      },
      {
        condition: 't is a band-mask edge or one of the three rim centers/support edges',
        id: 'band-and-rim-horizontal-families',
      },
      {
        condition: 'medallion length is 1 or 1.1, or atan2 lies on a sector/branch boundary',
        id: 'medallion-presence-and-sector-fold',
      },
      {
        condition: 'any maximum or smooth-maximum operands tie',
        id: 'union-and-cap-selection-ties',
      },
      {
        condition: 'outer radius is nonpositive or radial surface Jacobian vanishes',
        id: 'outer-wall-regularity',
      },
    ],
    columns: params.columns.toString(),
    rows: params.rows.toString(),
    styleId: 'CelticTriquetra',
  };
}

function derive(input: CanonicalTargetInputBinding): CelticTriquetraOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'CelticTriquetra') {
    fail(`expected CelticTriquetra but received '${input.style.styleId}'`);
  }
  const params = parameters(input);
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'CelticTriquetra',
    {
      evaluatorId: 'potfoundry.celtic-triquetra.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    (context) => {
      const radius = triquetraRadius(
        context,
        params,
        context.localV,
        context.localU
      );
      return context.radialPointAt(radius, context.localU, context.localV);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  const regularity = regularityValue(params);
  const regularityObligationsCanonicalJson = canonicalizeCertificationJson(regularity);
  const regularityObligationsSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.celtic-triquetra-outer-wall-target/regularity-obligations/v1',
    regularity
  );
  const bindingValue = {
    canonicalInputSha256: inputProof.canonicalInputSha256,
    columnCount: params.columns.toString(),
    completeRegularityPartitionEmitted: false,
    continuitySemantics: 'continuous-piecewise-defined-target',
    implementationScope: CELTIC_TRIQUETRA_OUTER_WALL_TARGET_SCOPE,
    nodeCount: backends.nodeCount.toString(),
    patchId: 'outer-wall',
    periodicIdentificationAdmissible: true,
    programSha256: backends.programSha256,
    proofMethodSha256: CELTIC_TRIQUETRA_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    regularityObligationsSha256,
    rowCount: params.rows.toString(),
    schemaVersion: CELTIC_TRIQUETRA_OUTER_WALL_TARGET_VERSION,
    styleId: 'CelticTriquetra',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.celtic-triquetra-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: CELTIC_TRIQUETRA_OUTER_WALL_TARGET_VERSION,
    implementationScope: CELTIC_TRIQUETRA_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: CELTIC_TRIQUETRA_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    styleId: 'CelticTriquetra',
    patchId: 'outer-wall',
    columnCount: params.columns,
    rowCount: params.rows,
    continuitySemantics: 'continuous-piecewise-defined-target',
    periodicIdentificationAdmissible: true,
    completeRegularityPartitionEmitted: false,
    regularityObligationsCanonicalJson,
    regularityObligationsSha256,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  }) as CelticTriquetraOuterWallTargetBinding;
}

export function createCelticTriquetraOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): CelticTriquetraOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function celticTriquetraOuterWallTargetForProof(
  value: CelticTriquetraOuterWallTargetBinding
): CelticTriquetraOuterWallTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('binding is not an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('binding is not an authenticated capability');
  }
  generatedTargetProgramBackendsForProof(value.backends);
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
    value.patchId !== derived.patchId ||
    value.columnCount !== derived.columnCount ||
    value.rowCount !== derived.rowCount ||
    value.continuitySemantics !== derived.continuitySemantics ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.completeRegularityPartitionEmitted !==
      derived.completeRegularityPartitionEmitted ||
    value.regularityObligationsCanonicalJson !==
      derived.regularityObligationsCanonicalJson ||
    value.regularityObligationsSha256 !== derived.regularityObligationsSha256 ||
    value.programCanonicalJson !== derived.programCanonicalJson ||
    value.programSha256 !== derived.programSha256 ||
    value.nodeCount !== derived.nodeCount ||
    value.backends !== registered.binding.backends
  ) {
    fail('binding capability fields are inconsistent');
  }
  return value;
}
