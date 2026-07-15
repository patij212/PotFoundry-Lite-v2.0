import type { GeometryParams } from '../../state/types';
import { GEOMETRY_BOUNDS } from '../../state/types';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';

export const TARGET_SOLID_SPECIFICATION_VERSION =
  'potfoundry.target-solid-specification/v2' as const;
export const CERTIFIED_GEOMETRY_PAYLOAD_VERSION =
  'potfoundry.certified-geometry-payload/v2' as const;
export const CERTIFIED_TARGET_CONTROL_PAYLOAD_VERSION =
  'potfoundry.certified-target-control-payload/v1' as const;
export const CERTIFIED_EXPORT_REFUSAL_POLICY_VERSION =
  'potfoundry.certified-export-refusal-policy/v2' as const;

const GEOMETRY_KEYS = [
  'H',
  'bellAmp',
  'bellCenter',
  'bellWidth',
  'bottom_od',
  'expn',
  'r_drain',
  'spinCurve',
  'spinPhase',
  'spinTurns',
  't_bottom',
  't_wall',
  'top_od',
] as const satisfies readonly (keyof GeometryParams)[];

type GeometryKey = (typeof GEOMETRY_KEYS)[number];

export interface CertifiedGeometryDomainEntry {
  readonly key: GeometryKey;
  readonly min: number;
  readonly max: number;
}

/** Deep-frozen executable domain shared by G0 validation and G3 planning. */
export const CERTIFIED_GEOMETRY_DOMAIN_ENTRIES = Object.freeze(
  GEOMETRY_KEYS.map((key) =>
    Object.freeze({ key, min: GEOMETRY_BOUNDS[key].min, max: GEOMETRY_BOUNDS[key].max })
  )
) as readonly CertifiedGeometryDomainEntry[];

const CERTIFIED_GEOMETRY_BOUNDS = Object.freeze(
  Object.fromEntries(
    CERTIFIED_GEOMETRY_DOMAIN_ENTRIES.map(({ key, min, max }) => [
      key,
      Object.freeze({ min, max }),
    ])
  )
) as Readonly<Record<GeometryKey, Omit<CertifiedGeometryDomainEntry, 'key'>>>;

const MINIMUM_HEIGHT_ABOVE_BOTTOM_MM = 10;

export type CertifiedGeometryPayloadErrorCode =
  | 'INVALID_PAYLOAD'
  | 'MISSING_PARAMETER'
  | 'UNKNOWN_PARAMETER'
  | 'PARAMETER_TYPE'
  | 'PARAMETER_NON_FINITE'
  | 'PARAMETER_OUT_OF_RANGE'
  | 'REPRESENTATION_TOPOLOGY_CHANGE'
  | 'REPRESENTATION_VALIDITY_CHANGE'
  | 'RELATION_INVALID';

export interface CertifiedGeometryPayloadError {
  readonly code: CertifiedGeometryPayloadErrorCode;
  readonly message: string;
  readonly key?: string;
}

export interface CertifiedGeometryPayload {
  readonly schemaVersion: typeof CERTIFIED_GEOMETRY_PAYLOAD_VERSION;
  readonly geometry: Readonly<GeometryParams>;
  readonly canonicalJson: string;
  readonly sha256: string;
}

export type NormalizeCertifiedGeometryPayloadResult =
  | Readonly<{ ok: true; value: CertifiedGeometryPayload }>
  | Readonly<{ ok: false; errors: readonly CertifiedGeometryPayloadError[] }>;

const TARGET_CONTROL_KEYS = ['superformulaSeamBlendDegrees'] as const;
export type CertifiedTargetControlKey = (typeof TARGET_CONTROL_KEYS)[number];

export interface CertifiedTargetControls {
  readonly superformulaSeamBlendDegrees: number;
}

export interface CertifiedTargetControlPayload {
  readonly schemaVersion: typeof CERTIFIED_TARGET_CONTROL_PAYLOAD_VERSION;
  readonly controls: CertifiedTargetControls;
  readonly canonicalJson: string;
  readonly sha256: string;
}

export type CertifiedTargetControlPayloadErrorCode =
  | 'INVALID_PAYLOAD'
  | 'MISSING_PARAMETER'
  | 'UNKNOWN_PARAMETER'
  | 'PARAMETER_TYPE'
  | 'PARAMETER_NON_FINITE'
  | 'PARAMETER_OUT_OF_RANGE'
  | 'REPRESENTATION_VALIDITY_CHANGE';

export interface CertifiedTargetControlPayloadError {
  readonly code: CertifiedTargetControlPayloadErrorCode;
  readonly message: string;
  readonly key?: string;
}

export type NormalizeCertifiedTargetControlPayloadResult =
  | Readonly<{ ok: true; value: CertifiedTargetControlPayload }>
  | Readonly<{ ok: false; errors: readonly CertifiedTargetControlPayloadError[] }>;

export const CERTIFIED_TARGET_CONTROL_DOMAIN = Object.freeze({
  superformulaSeamBlendDegrees: Object.freeze({ min: 0, max: 60 }),
});

const float64Bytes = new Uint8Array(8);
const float64View = new DataView(float64Bytes.buffer);
const float32Bytes = new Uint8Array(4);
const float32View = new DataView(float32Bytes.buffer);

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function exactFloat64Hex(value: number): string {
  float64View.setFloat64(0, value, false);
  return `ieee754-binary64:${bytesToHex(float64Bytes)}`;
}

function exactFloat32Hex(value: number): string {
  float32View.setFloat32(0, value, false);
  return `ieee754-binary32:${bytesToHex(float32Bytes)}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function refused(
  errors: readonly CertifiedGeometryPayloadError[]
): NormalizeCertifiedGeometryPayloadResult {
  return Object.freeze({
    ok: false,
    errors: Object.freeze(
      [...errors].sort(
        (left, right) =>
          compareCodeUnits(left.key ?? '', right.key ?? '') ||
          compareCodeUnits(left.code, right.code) ||
          compareCodeUnits(left.message, right.message)
      )
    ),
  });
}

function targetControlsRefused(
  errors: readonly CertifiedTargetControlPayloadError[]
): NormalizeCertifiedTargetControlPayloadResult {
  return Object.freeze({
    ok: false,
    errors: Object.freeze(
      [...errors].sort(
        (left, right) =>
          compareCodeUnits(left.key ?? '', right.key ?? '') ||
          compareCodeUnits(left.code, right.code) ||
          compareCodeUnits(left.message, right.message)
      )
    ),
  });
}

/**
 * Strict geometry-affecting control boundary. These values are deliberately
 * separate from mesh resolution: changing one changes the mathematical target
 * and therefore must change its identity.
 */
export function normalizeCertifiedTargetControlPayload(
  raw: Readonly<Record<string, unknown>> | null | undefined
): NormalizeCertifiedTargetControlPayloadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return targetControlsRefused([
      { code: 'INVALID_PAYLOAD', message: 'Target controls must be a data record' },
    ]);
  }

  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(raw);
    ownKeys = Reflect.ownKeys(raw);
  } catch {
    return targetControlsRefused([
      { code: 'INVALID_PAYLOAD', message: 'Target control record could not be inspected' },
    ]);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return targetControlsRefused([
      { code: 'INVALID_PAYLOAD', message: 'Target controls must not have a custom prototype' },
    ]);
  }

  const expected = new Set<string>(TARGET_CONTROL_KEYS);
  const values = new Map<CertifiedTargetControlKey, unknown>();
  const errors: CertifiedTargetControlPayloadError[] = [];
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expected.has(key)) {
      errors.push({
        code: 'UNKNOWN_PARAMETER',
        key: typeof key === 'string' ? key : String(key),
        message: 'Target controls contain an unknown parameter',
      });
      continue;
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(raw, key);
    } catch {
      errors.push({
        code: 'INVALID_PAYLOAD',
        key,
        message: 'Target control property could not be inspected',
      });
      continue;
    }
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      errors.push({
        code: 'INVALID_PAYLOAD',
        key,
        message: 'Target controls must contain only enumerable data properties',
      });
      continue;
    }
    values.set(key as CertifiedTargetControlKey, descriptor.value);
  }
  for (const key of TARGET_CONTROL_KEYS) {
    if (!values.has(key)) {
      errors.push({
        code: 'MISSING_PARAMETER',
        key,
        message: `Target control '${key}' is required; certified mode has no hidden defaults`,
      });
    }
  }
  if (errors.length > 0) return targetControlsRefused(errors);

  const rawAngle = values.get('superformulaSeamBlendDegrees');
  if (typeof rawAngle !== 'number') {
    return targetControlsRefused([
      {
        code: 'PARAMETER_TYPE',
        key: 'superformulaSeamBlendDegrees',
        message: 'superformulaSeamBlendDegrees must be numeric',
      },
    ]);
  }
  if (!Number.isFinite(rawAngle)) {
    return targetControlsRefused([
      {
        code: 'PARAMETER_NON_FINITE',
        key: 'superformulaSeamBlendDegrees',
        message: 'superformulaSeamBlendDegrees must be finite',
      },
    ]);
  }
  const bounds = CERTIFIED_TARGET_CONTROL_DOMAIN.superformulaSeamBlendDegrees;
  if (rawAngle < bounds.min || rawAngle > bounds.max) {
    return targetControlsRefused([
      {
        code: 'PARAMETER_OUT_OF_RANGE',
        key: 'superformulaSeamBlendDegrees',
        message: `superformulaSeamBlendDegrees=${rawAngle} is outside [${bounds.min}, ${bounds.max}]`,
      },
    ]);
  }
  const superformulaSeamBlendDegrees = Object.is(rawAngle, -0) ? 0 : rawAngle;
  const radiansFloat64 = (superformulaSeamBlendDegrees * Math.PI) / 180;
  const radiansFloat32 = Math.fround(radiansFloat64);
  if (superformulaSeamBlendDegrees > 0 && radiansFloat32 === 0) {
    return targetControlsRefused([
      {
        code: 'REPRESENTATION_VALIDITY_CHANGE',
        key: 'superformulaSeamBlendDegrees',
        message: 'Positive seam blend becomes zero in the binary32 generation representation',
      },
    ]);
  }

  const controls = Object.freeze({ superformulaSeamBlendDegrees });
  const canonicalJson = canonicalizeCertificationJson({
    derived: {
      superformulaSeamBlendRadiansFloat64Exact: exactFloat64Hex(radiansFloat64),
      superformulaSeamBlendRadiansGpuFloat32Exact: exactFloat32Hex(radiansFloat32),
    },
    rawFloat64Exact: {
      superformulaSeamBlendDegrees: exactFloat64Hex(superformulaSeamBlendDegrees),
    },
    refusalPolicyVersion: CERTIFIED_EXPORT_REFUSAL_POLICY_VERSION,
    schemaVersion: CERTIFIED_TARGET_CONTROL_PAYLOAD_VERSION,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
  });
  const sha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.certified-target-control-payload/definition/v1',
    JSON.parse(canonicalJson) as CanonicalJsonValue
  );
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: CERTIFIED_TARGET_CONTROL_PAYLOAD_VERSION,
      controls,
      canonicalJson,
      sha256,
    }),
  });
}

/**
 * Strict G0 input boundary. This proves only schema/range/basic relation
 * validity; target regularity, clearance, topology, and nonintersection remain
 * runtime proof obligations over the authoritative surface complex.
 */
export function normalizeCertifiedGeometryPayload(
  raw: Readonly<Record<string, unknown>> | null | undefined
): NormalizeCertifiedGeometryPayloadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refused([{ code: 'INVALID_PAYLOAD', message: 'Geometry must be a data record' }]);
  }

  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(raw);
    ownKeys = Reflect.ownKeys(raw);
  } catch {
    return refused([{ code: 'INVALID_PAYLOAD', message: 'Geometry record could not be inspected' }]);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return refused([
      { code: 'INVALID_PAYLOAD', message: 'Geometry must not have a custom prototype' },
    ]);
  }

  const expected = new Set<string>(GEOMETRY_KEYS);
  const values = new Map<GeometryKey, unknown>();
  const errors: CertifiedGeometryPayloadError[] = [];
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expected.has(key)) {
      errors.push({
        code: 'UNKNOWN_PARAMETER',
        key: typeof key === 'string' ? key : String(key),
        message: 'Geometry contains an unknown parameter',
      });
      continue;
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(raw, key);
    } catch {
      errors.push({
        code: 'INVALID_PAYLOAD',
        key,
        message: 'Geometry property could not be inspected',
      });
      continue;
    }
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      errors.push({
        code: 'INVALID_PAYLOAD',
        key,
        message: 'Geometry must contain only enumerable data properties',
      });
      continue;
    }
    values.set(key as GeometryKey, descriptor.value);
  }

  for (const key of GEOMETRY_KEYS) {
    if (!values.has(key)) {
      errors.push({
        code: 'MISSING_PARAMETER',
        key,
        message: `Geometry parameter '${key}' is required; certified mode has no hidden defaults`,
      });
    }
  }
  if (errors.length > 0) return refused(errors);

  const geometry = {} as Record<GeometryKey, number>;
  for (const key of GEOMETRY_KEYS) {
    const value = values.get(key);
    if (typeof value !== 'number') {
      errors.push({ code: 'PARAMETER_TYPE', key, message: `${key} must be numeric` });
      continue;
    }
    if (!Number.isFinite(value)) {
      errors.push({ code: 'PARAMETER_NON_FINITE', key, message: `${key} must be finite` });
      continue;
    }
    const bounds = CERTIFIED_GEOMETRY_BOUNDS[key];
    if (value < bounds.min || value > bounds.max) {
      errors.push({
        code: 'PARAMETER_OUT_OF_RANGE',
        key,
        message: `${key}=${value} is outside [${bounds.min}, ${bounds.max}]`,
      });
      continue;
    }
    geometry[key] = Object.is(value, -0) ? 0 : value;
  }
  if (errors.length > 0) return refused(errors);

  if (geometry.r_drain > 0 && Math.fround(geometry.r_drain) === 0) {
    errors.push({
      code: 'REPRESENTATION_TOPOLOGY_CHANGE',
      key: 'r_drain',
      message:
        'Positive drain radius becomes zero in the binary32 generation representation',
    });
  }
  if (errors.length > 0) return refused(errors);

  const smallestOuterRadius = Math.min(geometry.top_od, geometry.bottom_od) / 2;
  if (geometry.t_wall >= smallestOuterRadius) {
    errors.push({
      code: 'RELATION_INVALID',
      key: 't_wall',
      message: 'Wall thickness must be smaller than the smallest outer radius',
    });
  }
  const innerBottomRadius = geometry.bottom_od / 2 - geometry.t_wall;
  if (geometry.r_drain > 0 && geometry.r_drain >= innerBottomRadius) {
    errors.push({
      code: 'RELATION_INVALID',
      key: 'r_drain',
      message: 'Drain radius must be smaller than the nominal inner bottom radius',
    });
  }
  if (geometry.H < geometry.t_bottom + MINIMUM_HEIGHT_ABOVE_BOTTOM_MM) {
    errors.push({
      code: 'RELATION_INVALID',
      key: 'H',
      message: 'Height must leave at least 10 mm above the nominal bottom thickness',
    });
  }
  if (errors.length > 0) return refused(errors);

  const gpuHeight = Math.fround(geometry.H);
  const gpuTopRadius = Math.fround(geometry.top_od / 2);
  const gpuBottomRadius = Math.fround(geometry.bottom_od / 2);
  const gpuWallThickness = Math.fround(geometry.t_wall);
  const gpuBottomThickness = Math.fround(geometry.t_bottom);
  const gpuDrainRadius = Math.fround(geometry.r_drain);
  const gpuSmallestOuterRadius = Math.min(gpuTopRadius, gpuBottomRadius);
  if (gpuWallThickness >= gpuSmallestOuterRadius) {
    errors.push({
      code: 'REPRESENTATION_VALIDITY_CHANGE',
      key: 't_wall',
      message: 'Wall containment becomes invalid in the binary32 generation representation',
    });
  }
  const gpuInnerBottomRadius = Math.fround(gpuBottomRadius - gpuWallThickness);
  if (gpuDrainRadius > 0 && gpuDrainRadius >= gpuInnerBottomRadius) {
    errors.push({
      code: 'REPRESENTATION_VALIDITY_CHANGE',
      key: 'r_drain',
      message: 'Drain containment becomes invalid in the binary32 generation representation',
    });
  }
  const gpuMinimumHeight = Math.fround(
    gpuBottomThickness + Math.fround(MINIMUM_HEIGHT_ABOVE_BOTTOM_MM)
  );
  if (gpuHeight < gpuMinimumHeight) {
    errors.push({
      code: 'REPRESENTATION_VALIDITY_CHANGE',
      key: 'H',
      message: 'Height clearance becomes invalid in the binary32 generation representation',
    });
  }
  if (errors.length > 0) return refused(errors);

  const frozenGeometry = Object.freeze({ ...geometry }) as Readonly<GeometryParams>;
  const rawFloat64Exact = Object.fromEntries(
    GEOMETRY_KEYS.map((key) => [key, exactFloat64Hex(frozenGeometry[key])])
  );
  const gpuFloat32Exact = Object.fromEntries(
    GEOMETRY_KEYS.map((key) => [key, exactFloat32Hex(Math.fround(frozenGeometry[key]))])
  );
  const derived = {
    bottomRadiusFloat64Exact: exactFloat64Hex(frozenGeometry.bottom_od / 2),
    bottomRadiusGpuFloat32Exact: exactFloat32Hex(Math.fround(frozenGeometry.bottom_od / 2)),
    spinPhaseRadiansFloat64Exact: exactFloat64Hex((frozenGeometry.spinPhase * Math.PI) / 180),
    spinPhaseRadiansGpuFloat32Exact: exactFloat32Hex(
      Math.fround((frozenGeometry.spinPhase * Math.PI) / 180)
    ),
    topRadiusFloat64Exact: exactFloat64Hex(frozenGeometry.top_od / 2),
    topRadiusGpuFloat32Exact: exactFloat32Hex(Math.fround(frozenGeometry.top_od / 2)),
  };
  const canonicalJson = canonicalizeCertificationJson({
    derived,
    gpuFloat32Exact,
    rawFloat64Exact,
    refusalPolicyVersion: CERTIFIED_EXPORT_REFUSAL_POLICY_VERSION,
    schemaVersion: CERTIFIED_GEOMETRY_PAYLOAD_VERSION,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    units: 'millimeter',
  });
  const sha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.certified-geometry-payload/definition/v2',
    JSON.parse(canonicalJson) as CanonicalJsonValue
  );
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: CERTIFIED_GEOMETRY_PAYLOAD_VERSION,
      geometry: frozenGeometry,
      canonicalJson,
      sha256,
    }),
  });
}

const targetSolidPolicyValue = {
  adjacency: {
    boundaryOwnership: 'exactly-one-owner-per-oriented-side',
    sharedSplits: 'identical-dyadic-stations-on-both-incident-patches',
  },
  closure: {
    bottomOwnership: 'bottom-under-plus-bottom-top-plus-outer-and-inner-junctions',
    drainPresentAdditionalRole: 'drain-wall',
    featureDiscontinuityRoles: ['feature-curtain', 'feature-side'],
    topOwnership: 'top-rim-joins-outer-wall-to-inner-wall',
  },
  degeneracyExclusions: [
    'nonpositive-smooth-patch-jacobian',
    'undeclared-branch-or-topology-transition',
    'unintended-target-self-contact-or-self-intersection',
    'insufficient-inner-outer-clearance',
    'feature-separation-below-certified-resolution',
    'drain-rim-base-or-cap-containment-failure',
  ],
  discontinuities: {
    bridgingAllowed: false,
    oneSidedLimitsRequired: true,
    physicalClosure: 'explicit-feature-curtain-or-side-patches',
  },
  geometryInputValidation: {
    bounds: Object.fromEntries(
      GEOMETRY_KEYS.map((key) => [
        key,
        {
          maximumFloat64Exact: exactFloat64Hex(CERTIFIED_GEOMETRY_BOUNDS[key].max),
          minimumFloat64Exact: exactFloat64Hex(CERTIFIED_GEOMETRY_BOUNDS[key].min),
        },
      ])
    ),
    numericSemantics: 'finite-ecmascript-binary64-with-negative-zero-canonicalized-to-positive-zero',
    payloadSemantics: 'exactly-all-declared-enumerable-own-data-properties-no-defaults-no-clamping',
    relationEvaluationSemantics: 'ecmascript-binary64-operators',
    representationValidity: {
      bottomRadius: 'binary32(binary64(bottom_od/2))',
      bottomThickness: 'binary32(t_bottom)',
      drainContainment:
        'binary32(r_drain)==0 || binary32(r_drain)<binary32(binary32(bottom_od/2)-binary32(t_wall))',
      height: 'binary32(H)',
      heightClearance:
        'binary32(H)>=binary32(binary32(t_bottom)+binary32(minimumHeightAboveBottom))',
      topRadius: 'binary32(binary64(top_od/2))',
      wallContainment:
        'binary32(t_wall)<min(binary32(binary64(top_od/2)),binary32(binary64(bottom_od/2)))',
      wallThickness: 'binary32(t_wall)',
    },
    relationalValidity: {
      drainContainment: 'r_drain==0 || r_drain<(bottom_od/2-t_wall)',
      drainTopologyRepresentation: 'r_drain==0 || binary32(r_drain)>0',
      minimumHeightAboveBottomFloat64Exact: exactFloat64Hex(
        MINIMUM_HEIGHT_ABOVE_BOTTOM_MM
      ),
      minimumHeightRule: 'H>=t_bottom+minimumHeightAboveBottom',
      wallContainment: 't_wall<min(top_od,bottom_od)/2',
    },
  },
  targetControlInputValidation: {
    bounds: {
      superformulaSeamBlendDegrees: {
        maximumFloat64Exact: exactFloat64Hex(
          CERTIFIED_TARGET_CONTROL_DOMAIN.superformulaSeamBlendDegrees.max
        ),
        minimumFloat64Exact: exactFloat64Hex(
          CERTIFIED_TARGET_CONTROL_DOMAIN.superformulaSeamBlendDegrees.min
        ),
      },
    },
    geometricSemantics:
      'superformulaSeamBlendDegrees changes the mathematical SuperformulaBlossom target and is not a mesh-resolution hint',
    numericSemantics: 'finite-ecmascript-binary64-with-negative-zero-canonicalized-to-positive-zero',
    payloadSemantics: 'exactly-all-declared-enumerable-own-data-properties-no-defaults-no-clamping',
    representationValidity:
      'zero-is-exact; every-positive-degree-value-must-remain-positive-after-degree-to-radian-binary32-conversion',
  },
  requiredSurfaceRolesWithoutDrain: [
    'bottom-top',
    'bottom-under',
    'inner-wall',
    'outer-wall',
    'top-rim',
  ],
  resourcePolicy: {
    cancellationVerdict: 'refused',
    resourceExhaustionVerdict: 'refused',
    unsupportedEvaluatorOrTopologyVerdict: 'refused',
    samplingMayAccept: false,
    timeoutMayRelaxTolerance: false,
    triangleBudgetMayRelaxTolerance: false,
  },
  schemaVersion: TARGET_SOLID_SPECIFICATION_VERSION,
  seamSemantics: 'periodic-identification-with-exact-shared-boundary',
  thicknessSemantics: 'radial-target-offset-with-separate-physical-minimum-proof',
  topology: {
    drainAbsentBoundaryGenus: '0',
    oneDrainBoundaryGenus: '1',
    intendedComponentCount: '1',
    orientable: true,
  },
  units: {
    certificateIntegerUnit: 'picometre',
    targetLengthUnit: 'millimeter',
    trueTolerancePm: '10000000',
  },
} as const satisfies CanonicalJsonValue;

/** Number-free, canonical G0 semantics that every target and certificate binds. */
export const TARGET_SOLID_SPECIFICATION_CANONICAL_JSON =
  canonicalizeCertificationJson(targetSolidPolicyValue);
export const TARGET_SOLID_SPECIFICATION_SHA256 = domainSeparatedCanonicalJsonSha256(
  'potfoundry.target-solid-specification/definition/v2',
  targetSolidPolicyValue
);
