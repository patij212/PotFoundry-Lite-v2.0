import type { GeometryParams } from '../../state/types';
import { DEFAULT_GEOMETRY } from '../../state/types';
import {
  STYLE_CERTIFICATION_SCHEMA_SNAPSHOT,
  type CertificationParamSchema,
} from '../../styles/certificationSchemaSnapshot';
import { STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256 } from '../../styles/styleEvaluatorSourceContract';
import {
  STYLE_PARAMETER_LAYOUT_CONTROL_COUNT,
  STYLE_PARAMETER_LAYOUT_SPEC_SHA256,
  STYLE_PARAMETER_LAYOUT_STYLE_COUNT,
} from '../../styles/styleParameterLayoutSpec';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  CanonicalTargetInputError,
  createCanonicalTargetInputBinding,
} from './canonicalTargetInput';
import {
  CERTIFIED_GEOMETRY_DOMAIN_ENTRIES,
  TARGET_SOLID_SPECIFICATION_SHA256,
} from './targetSolidSpecification';

export const CERTIFICATION_MATRIX_COVERAGE_SPEC_VERSION =
  'potfoundry.certification-matrix-coverage-spec/v3' as const;
export const CERTIFICATION_MATRIX_CASE_VERSION =
  'potfoundry.certification-matrix-case/v3' as const;
export const CERTIFICATION_MATRIX_PLAN_VERSION =
  'potfoundry.certification-matrix-plan/v3' as const;

export type CertificationMatrixCaseFamily =
  | 'style-default'
  | 'style-single-boundary'
  | 'style-pairwise-boundary'
  | 'target-control-boundary'
  | 'target-control-validity'
  | 'geometry-single-boundary'
  | 'geometry-relational-boundary'
  | 'geometry-interaction';

export type CertificationMatrixEndpoint =
  | 'minimum'
  | 'maximum'
  | 'equality'
  | 'previous-representable'
  | 'previous-binary32'
  | 'next-representable'
  | 'interior'
  | 'transition-absent'
  | 'transition-present'
  | 'positive-binary32-collapse';

export interface CertificationMatrixMutation {
  readonly domain: 'geometry' | 'style' | 'target-control';
  readonly parameter: string;
  readonly endpoint: CertificationMatrixEndpoint;
  readonly valueExact: string | boolean;
}

export type CertificationMatrixPreflight =
  | Readonly<{
      kind: 'canonical-input';
      canonicalInputSha256: string;
      certifiedGeometryPayloadSha256: string;
      certifiedTargetControlPayloadSha256: string;
      styleCertificationPayloadSha256: string;
    }>
  | Readonly<{
      kind: 'preflight-refusal';
      component: CanonicalTargetInputError['component'];
      details: readonly string[];
      detailsSha256: string;
    }>;

export interface CertificationMatrixCase {
  readonly schemaVersion: typeof CERTIFICATION_MATRIX_CASE_VERSION;
  readonly certificationAllowed: false;
  readonly status: 'plan-case-only-not-artifact-evidence';
  readonly caseId: string;
  readonly family: CertificationMatrixCaseFamily;
  readonly styleId: string;
  readonly geometry: Readonly<GeometryParams>;
  readonly targetControls: Readonly<{ superformulaSeamBlendDegrees: number }>;
  readonly styleOptions: Readonly<Record<string, unknown>>;
  readonly mutations: readonly CertificationMatrixMutation[];
  readonly preflight: CertificationMatrixPreflight;
  readonly canonicalJson: string;
  readonly sha256: string;
}

export interface CertificationMatrixPlan {
  readonly schemaVersion: typeof CERTIFICATION_MATRIX_PLAN_VERSION;
  readonly certificationAllowed: false;
  readonly status: 'plan-only-not-artifact-evidence';
  readonly cases: readonly CertificationMatrixCase[];
  readonly caseSequenceSha256: string;
  readonly manifestCanonicalJson: string;
  readonly manifestSha256: string;
}

interface MatrixCaseSeed {
  readonly caseId: string;
  readonly family: CertificationMatrixCaseFamily;
  readonly styleId: string;
  readonly geometry: Readonly<GeometryParams>;
  readonly styleOptions: Readonly<Record<string, unknown>>;
  readonly targetControls?: Readonly<{ superformulaSeamBlendDegrees: number }>;
  readonly mutations: readonly CertificationMatrixMutation[];
}

interface ParameterEndpoint {
  readonly endpoint: CertificationMatrixEndpoint;
  readonly rawValue: number | boolean;
  readonly valueExact: string | boolean;
}

interface GeometryScenarioValue {
  readonly key: keyof GeometryParams;
  readonly value: number;
  readonly endpoint: CertificationMatrixEndpoint;
}

export class CertificationMatrixPlanError extends Error {
  constructor(message: string) {
    super(`Certification matrix plan refused: ${message}`);
    this.name = 'CertificationMatrixPlanError';
  }
}

const float64Bytes = new Uint8Array(8);
const float64View = new DataView(float64Bytes.buffer);
const BASELINE_TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

function exactFloat64Hex(value: number): string {
  float64View.setFloat64(0, Object.is(value, -0) ? 0 : value, false);
  return `ieee754-binary64:${Array.from(float64Bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

function exactInputValue(value: unknown): string | boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return exactFloat64Hex(value);
  throw new CertificationMatrixPlanError('generated input was not a finite number or boolean');
}

function parameterEndpoints(
  styleId: string,
  parameter: string,
  schema: CertificationParamSchema
): readonly [ParameterEndpoint, ParameterEndpoint] {
  if (schema.type === 'bool') {
    return Object.freeze([
      Object.freeze({ endpoint: 'minimum', rawValue: false, valueExact: false }),
      Object.freeze({ endpoint: 'maximum', rawValue: true, valueExact: true }),
    ]);
  }
  if (schema.min === undefined || schema.max === undefined) {
    throw new CertificationMatrixPlanError(
      `${styleId}.${parameter} does not declare both numeric endpoints`
    );
  }
  return Object.freeze([
    Object.freeze({
      endpoint: 'minimum',
      rawValue: schema.min,
      valueExact: exactFloat64Hex(schema.min),
    }),
    Object.freeze({
      endpoint: 'maximum',
      rawValue: schema.max,
      valueExact: exactFloat64Hex(schema.max),
    }),
  ]);
}

function styleParameters(
  styleId: string
): readonly (readonly [string, CertificationParamSchema])[] {
  const schema = STYLE_CERTIFICATION_SCHEMA_SNAPSHOT[styleId];
  if (schema === undefined) {
    throw new CertificationMatrixPlanError(`style '${styleId}' has no immutable schema`);
  }
  return Object.freeze(
    [...Object.entries(schema.params), ...Object.entries(schema.advancedParams)].sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)
    )
  );
}

const MATRIX_DEFAULT_GEOMETRY = Object.freeze({ ...DEFAULT_GEOMETRY });

const coverageSpecification = {
  caseFamilies: {
    geometryInteraction:
      'for-every-style-nontrivial-global-phase-and-nonzero-twist-times-phase-interaction',
    geometryRelationalBoundary:
      'for-every-style-height-wall-and-drain-coupled-boundaries-with-valid-near-side-and-explicit-refusal-side-plus-drain-topology-transition',
    geometrySingleBoundary:
      'for-every-style-every-certified-geometry-field-at-minimum-and-maximum-over-frozen-defaults',
    styleDefault: 'for-every-style-all-declared-style-defaults-over-frozen-default-geometry',
    stylePairwiseBoundary:
      'for-every-style-every-distinct-control-pair-at-all-four-endpoint-combinations',
    styleSingleBoundary: 'for-every-style-every-control-at-minimum-and-maximum',
    targetControlBoundary:
      'for-every-style-every-geometry-affecting-target-control-at-minimum-and-maximum',
    targetControlValidity:
      'for-every-style-positive-to-binary32-zero-refusal-plus-active-superformula-open-seam-refusal-and-integral-symmetry-admission',
  },
  claimBoundary: {
    finiteMatrixImpliesInteriorCorrectness: false,
    planIsArtifactEvidence: false,
    requiredPerExportConclusion: 'complete-proof-or-explicit-refusal',
    samplingMayCertify: false,
  },
  preflightSemantics: {
    accepted: 'authenticated-canonical-input-only-not-target-validity-or-artifact-proof',
    refused: 'record-the-exact-component-and-deterministic-reasons-never-clamp-or-omit',
  },
  relationalBoundaryObligations: {
    drainContainment:
      'previous-binary32-r_drain-below-clearance-is-canonical;-previous-binary64-that-rounds-to-equality-and-exact-equality-both-refuse',
    drainTopologyTransition:
      'exercise-r_drain-zero-and-next-representable-positive-value;-certified-preflight-must-refuse-binary32-topology-quantization',
    heightClearance:
      'representation-stable-H-equals-t_bottom-plus-ten-is-canonical;-raw64-valid-equality-that-rounds-invalid-and-previous-representable-raw64-H-both-refuse',
    wallContainment:
      'previous-binary32-wall-below-half-minimum-diameter-is-canonical;-previous-binary64-that-rounds-to-equality-and-exact-equality-both-refuse',
  },
  schemaVersion: CERTIFICATION_MATRIX_COVERAGE_SPEC_VERSION,
  seamObligations: [
    {
      id: 'periodic-target-boundary',
      requirement:
        'prove-theta-zero-and-two-pi-one-sided-target-boundaries-identical-for-every-periodic-branch',
      stations: ['theta=0-one-sided', 'theta=2pi-one-sided'],
    },
    {
      id: 'seam-discontinuity-closure',
      requirement:
        'every-seam-branch-discontinuity-has-explicit-feature-closure-and-is-never-averaged-or-bridged',
      stations: ['theta=0-minus', 'theta=0-plus', 'theta=2pi-minus', 'theta=2pi-plus'],
    },
    {
      id: 'artifact-seam-adjacency',
      requirement:
        'prove-exact-final-coordinate-edge-pairing-and-consistent-orientation-across-the-artifact-seam',
      stations: ['final-artifact-seam-edges'],
    },
    {
      id: 'fundamental-domain-coverage',
      requirement:
        'prove-patch-domains-cover-one-periodic-fundamental-domain-without-gap-or-positive-area-overlap',
      stations: ['theta-domain-start', 'theta-domain-end'],
    },
  ],
  targetControlObligations: {
    activeSuperformulaZeroBlend:
      'refuse-unless-strength-is-zero-or-base-and-top-symmetry-are-the-same-integer',
    endpointsDegrees: ['0', '60'],
    positiveBinary32Collapse:
      'every-positive-control-that-becomes-zero-in-generation-binary32-must-refuse-before-target-construction',
  },
  styleOptionSemantics: 'partial-overrides-with-immutable-schema-default-materialization',
  twistPhaseObligations: {
    nonPeriodicPhaseDegrees: '180',
    nonzeroTwistTurns: '1.25',
    requirement:
      'execute-global-phase-away-from-periodic-endpoints-and-its-interaction-with-nonzero-twist-for-every-style',
  },
  surfaceRoleObligations: [
    { condition: 'always', role: 'outer-wall' },
    { condition: 'always', role: 'inner-wall' },
    { condition: 'always', role: 'top-rim' },
    { condition: 'always', role: 'bottom-top' },
    { condition: 'always', role: 'bottom-under' },
    { condition: 'canonical-r_drain-is-positive', role: 'drain-wall' },
    { condition: 'declared-discontinuity-requires-this-closure-kind', role: 'feature-curtain' },
    { condition: 'declared-discontinuity-requires-this-closure-kind', role: 'feature-side' },
  ],
  surfaceRoleReporting:
    'every-execution-records-each-role-count-including-zero-and-proves-every-declared-discontinuity-closed',
} as const satisfies CanonicalJsonValue;

export const CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON =
  canonicalizeCertificationJson(coverageSpecification);
export const CERTIFICATION_MATRIX_COVERAGE_SPEC_SHA256 =
  domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification-matrix-coverage-spec/definition/v3',
    coverageSpecification
  );

function freezeGeometry(geometry: Readonly<GeometryParams>): Readonly<GeometryParams> {
  return Object.freeze({ ...geometry });
}

function freezeStyleOptions(
  options: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...options });
}

function buildMatrixCase(seed: MatrixCaseSeed): CertificationMatrixCase {
  const geometry = freezeGeometry(seed.geometry);
  const styleOptions = freezeStyleOptions(seed.styleOptions);
  const targetControls = Object.freeze({
    ...(seed.targetControls ?? BASELINE_TARGET_CONTROLS),
  });
  let preflight: CertificationMatrixPreflight;
  try {
    const binding = createCanonicalTargetInputBinding(
      geometry,
      seed.styleId,
      styleOptions,
      targetControls
    );
    preflight = Object.freeze({
      kind: 'canonical-input',
      canonicalInputSha256: binding.canonicalInputSha256,
      certifiedGeometryPayloadSha256: binding.certifiedGeometryPayloadSha256,
      certifiedTargetControlPayloadSha256: binding.certifiedTargetControlPayloadSha256,
      styleCertificationPayloadSha256: binding.styleCertificationPayloadSha256,
    });
  } catch (error) {
    if (!(error instanceof CanonicalTargetInputError)) throw error;
    const details = Object.freeze([...error.details]);
    preflight = Object.freeze({
      kind: 'preflight-refusal',
      component: error.component,
      details,
      detailsSha256: domainSeparatedCanonicalJsonSha256(
        'potfoundry.certification-matrix-case/refusal-details/v1',
        { component: error.component, details }
      ),
    });
  }

  const mutations = Object.freeze(seed.mutations.map((mutation) => Object.freeze({ ...mutation })));
  const canonicalValue = {
    caseId: seed.caseId,
    certificationAllowed: false,
    coverageSpecSha256: CERTIFICATION_MATRIX_COVERAGE_SPEC_SHA256,
    family: seed.family,
    geometryExact: Object.fromEntries(
      CERTIFIED_GEOMETRY_DOMAIN_ENTRIES.map(({ key }) => [
        key,
        exactFloat64Hex(geometry[key]),
      ])
    ),
    mutations: mutations.map(({ domain, endpoint, parameter, valueExact }) => ({
      domain,
      endpoint,
      parameter,
      valueExact,
    })),
    preflight,
    schemaVersion: CERTIFICATION_MATRIX_CASE_VERSION,
    styleEvaluatorSourceContractSha256: STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256,
    styleId: seed.styleId,
    styleOptionsExact: Object.fromEntries(
      Object.entries(styleOptions)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, value]) => [key, exactInputValue(value)])
    ),
    styleParameterLayoutSpecSha256: STYLE_PARAMETER_LAYOUT_SPEC_SHA256,
    targetControlsExact: {
      superformulaSeamBlendDegrees: exactFloat64Hex(
        targetControls.superformulaSeamBlendDegrees
      ),
    },
    status: 'plan-case-only-not-artifact-evidence',
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
  } satisfies CanonicalJsonValue;
  const canonicalJson = canonicalizeCertificationJson(canonicalValue);
  const sha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification-matrix-case/definition/v3',
    canonicalValue
  );
  return Object.freeze({
    schemaVersion: CERTIFICATION_MATRIX_CASE_VERSION,
    certificationAllowed: false,
    status: 'plan-case-only-not-artifact-evidence',
    caseId: seed.caseId,
    family: seed.family,
    styleId: seed.styleId,
    geometry,
    targetControls,
    styleOptions,
    mutations,
    preflight,
    canonicalJson,
    sha256,
  });
}

function styleMutation(
  parameter: string,
  endpoint: ParameterEndpoint
): CertificationMatrixMutation {
  return Object.freeze({
    domain: 'style',
    parameter,
    endpoint: endpoint.endpoint,
    valueExact: endpoint.valueExact,
  });
}

function targetControlMutation(
  value: number,
  endpoint: CertificationMatrixEndpoint
): CertificationMatrixMutation {
  return Object.freeze({
    domain: 'target-control',
    parameter: 'superformulaSeamBlendDegrees',
    endpoint,
    valueExact: exactFloat64Hex(value),
  });
}

function previousRepresentablePositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CertificationMatrixPlanError('previous-representable input must be finite and positive');
  }
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  view.setBigUint64(0, view.getBigUint64(0, false) - 1n, false);
  return view.getFloat64(0, false);
}

function previousRepresentableFloat32(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || Math.fround(value) !== value) {
    throw new CertificationMatrixPlanError(
      'previous-binary32 input must be finite, positive, and exactly binary32'
    );
  }
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  view.setFloat32(0, value, false);
  view.setUint32(0, view.getUint32(0, false) - 1, false);
  return view.getFloat32(0, false);
}

function geometryScenario(
  styleId: string,
  family: Extract<
    CertificationMatrixCaseFamily,
    'geometry-relational-boundary' | 'geometry-interaction'
  >,
  scenarioId: string,
  values: readonly GeometryScenarioValue[]
): MatrixCaseSeed {
  const overrides: Partial<Record<keyof GeometryParams, number>> = {};
  const mutations = values.map(({ key, value, endpoint }) => {
    overrides[key] = value;
    return Object.freeze({
      domain: 'geometry' as const,
      parameter: key,
      endpoint,
      valueExact: exactFloat64Hex(value),
    });
  });
  return Object.freeze({
    caseId: `${styleId}/${scenarioId}`,
    family,
    styleId,
    geometry: { ...MATRIX_DEFAULT_GEOMETRY, ...overrides },
    styleOptions: {},
    mutations: Object.freeze(mutations),
  });
}

/**
 * Builds the deterministic G3 execution plan. Its preflight outcomes prove only
 * strict input handling; every canonical case still needs full G0-G2 artifact
 * proof or an explicit execution refusal before it can appear in G5 evidence.
 */
export function buildCertificationMatrixPlan(): CertificationMatrixPlan {
  const styles = Object.entries(STYLE_CERTIFICATION_SCHEMA_SNAPSHOT).sort(
    ([leftId, left], [rightId, right]) =>
      left.id - right.id || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0)
  );
  if (styles.length.toString() !== STYLE_PARAMETER_LAYOUT_STYLE_COUNT) {
    throw new CertificationMatrixPlanError(
      `immutable style count ${styles.length} does not match committed count ${STYLE_PARAMETER_LAYOUT_STYLE_COUNT}`
    );
  }
  if (new Set(styles.map(([, schema]) => schema.id)).size !== styles.length) {
    throw new CertificationMatrixPlanError('immutable style ids are not unique');
  }

  const cases: CertificationMatrixCase[] = [];
  const familyCounts: Record<CertificationMatrixCaseFamily, number> = {
    'style-default': 0,
    'style-single-boundary': 0,
    'style-pairwise-boundary': 0,
    'target-control-boundary': 0,
    'target-control-validity': 0,
    'geometry-single-boundary': 0,
    'geometry-relational-boundary': 0,
    'geometry-interaction': 0,
  };
  let controlCount = 0;
  let canonicalInputCount = 0;
  let refusalCount = 0;

  const append = (seed: MatrixCaseSeed): void => {
    const matrixCase = buildMatrixCase(seed);
    cases.push(matrixCase);
    familyCounts[seed.family] += 1;
    if (matrixCase.preflight.kind === 'canonical-input') canonicalInputCount += 1;
    else refusalCount += 1;
  };

  for (const [styleId] of styles) {
    const parameters = styleParameters(styleId);
    controlCount += parameters.length;
    append({
      caseId: `${styleId}/default`,
      family: 'style-default',
      styleId,
      geometry: MATRIX_DEFAULT_GEOMETRY,
      styleOptions: {},
      mutations: [],
    });

    for (const [endpoint, value] of [
      ['minimum', 0],
      ['maximum', 60],
    ] as const) {
      append({
        caseId: `${styleId}/target-control/superformulaSeamBlendDegrees/${endpoint}`,
        family: 'target-control-boundary',
        styleId,
        geometry: MATRIX_DEFAULT_GEOMETRY,
        styleOptions: {},
        targetControls: Object.freeze({ superformulaSeamBlendDegrees: value }),
        mutations: [targetControlMutation(value, endpoint)],
      });
    }
    append({
      caseId: `${styleId}/target-control/superformulaSeamBlendDegrees/positive-binary32-collapse`,
      family: 'target-control-validity',
      styleId,
      geometry: MATRIX_DEFAULT_GEOMETRY,
      styleOptions: {},
      targetControls: Object.freeze({ superformulaSeamBlendDegrees: Number.MIN_VALUE }),
      mutations: [
        targetControlMutation(Number.MIN_VALUE, 'positive-binary32-collapse'),
      ],
    });
    if (styleId === 'SuperformulaBlossom') {
      append({
        caseId: `${styleId}/target-control/zero-blend/active-open-seam-refusal`,
        family: 'target-control-validity',
        styleId,
        geometry: MATRIX_DEFAULT_GEOMETRY,
        styleOptions: { sf_strength: 1 },
        targetControls: Object.freeze({ superformulaSeamBlendDegrees: 0 }),
        mutations: [
          styleMutation('sf_strength', {
            endpoint: 'maximum',
            rawValue: 1,
            valueExact: exactFloat64Hex(1),
          }),
          targetControlMutation(0, 'minimum'),
        ],
      });
      append({
        caseId: `${styleId}/target-control/zero-blend/active-integral-symmetry-valid`,
        family: 'target-control-validity',
        styleId,
        geometry: MATRIX_DEFAULT_GEOMETRY,
        styleOptions: { sf_strength: 1, sf_m_base: 8, sf_m_top: 8 },
        targetControls: Object.freeze({ superformulaSeamBlendDegrees: 0 }),
        mutations: [
          styleMutation('sf_strength', {
            endpoint: 'maximum',
            rawValue: 1,
            valueExact: exactFloat64Hex(1),
          }),
          styleMutation('sf_m_base', {
            endpoint: 'interior',
            rawValue: 8,
            valueExact: exactFloat64Hex(8),
          }),
          styleMutation('sf_m_top', {
            endpoint: 'interior',
            rawValue: 8,
            valueExact: exactFloat64Hex(8),
          }),
          targetControlMutation(0, 'minimum'),
        ],
      });
    }

    const endpointsByParameter = new Map(
      parameters.map(([parameter, schema]) => [
        parameter,
        parameterEndpoints(styleId, parameter, schema),
      ])
    );
    for (const [parameter] of parameters) {
      const endpoints = endpointsByParameter.get(parameter);
      if (endpoints === undefined) {
        throw new CertificationMatrixPlanError(`${styleId}.${parameter} endpoints disappeared`);
      }
      for (const endpoint of endpoints) {
        append({
          caseId: `${styleId}/style/${parameter}/${endpoint.endpoint}`,
          family: 'style-single-boundary',
          styleId,
          geometry: MATRIX_DEFAULT_GEOMETRY,
          styleOptions: { [parameter]: endpoint.rawValue },
          mutations: [styleMutation(parameter, endpoint)],
        });
      }
    }

    for (let leftIndex = 0; leftIndex < parameters.length; leftIndex += 1) {
      const leftParameter = parameters[leftIndex][0];
      const leftEndpoints = endpointsByParameter.get(leftParameter);
      if (leftEndpoints === undefined) {
        throw new CertificationMatrixPlanError(`${styleId}.${leftParameter} endpoints disappeared`);
      }
      for (let rightIndex = leftIndex + 1; rightIndex < parameters.length; rightIndex += 1) {
        const rightParameter = parameters[rightIndex][0];
        const rightEndpoints = endpointsByParameter.get(rightParameter);
        if (rightEndpoints === undefined) {
          throw new CertificationMatrixPlanError(
            `${styleId}.${rightParameter} endpoints disappeared`
          );
        }
        for (const leftEndpoint of leftEndpoints) {
          for (const rightEndpoint of rightEndpoints) {
            append({
              caseId: `${styleId}/style-pair/${leftParameter}/${leftEndpoint.endpoint}/${rightParameter}/${rightEndpoint.endpoint}`,
              family: 'style-pairwise-boundary',
              styleId,
              geometry: MATRIX_DEFAULT_GEOMETRY,
              styleOptions: {
                [leftParameter]: leftEndpoint.rawValue,
                [rightParameter]: rightEndpoint.rawValue,
              },
              mutations: [
                styleMutation(leftParameter, leftEndpoint),
                styleMutation(rightParameter, rightEndpoint),
              ],
            });
          }
        }
      }
    }

    for (const { key, min, max } of CERTIFIED_GEOMETRY_DOMAIN_ENTRIES) {
      for (const [endpoint, value] of [
        ['minimum', min],
        ['maximum', max],
      ] as const) {
        append({
          caseId: `${styleId}/geometry/${key}/${endpoint}`,
          family: 'geometry-single-boundary',
          styleId,
          geometry: { ...MATRIX_DEFAULT_GEOMETRY, [key]: value },
          styleOptions: {},
          mutations: [
            Object.freeze({
              domain: 'geometry',
              parameter: key,
              endpoint,
              valueExact: exactFloat64Hex(value),
            }),
          ],
        });
      }
    }

    const heightBoundary = 40;
    const maximumBottomThickness = 30;
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/height/minimum-clearance-valid',
        [
          { key: 'H', value: heightBoundary, endpoint: 'equality' },
          { key: 't_bottom', value: maximumBottomThickness, endpoint: 'maximum' },
        ]
      )
    );
    const representationChangingBottomThickness = 10.000002384185793;
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/height/raw-valid-f32-invalid-refusal',
        [
          {
            key: 'H',
            value: representationChangingBottomThickness + 10,
            endpoint: 'equality',
          },
          {
            key: 't_bottom',
            value: representationChangingBottomThickness,
            endpoint: 'interior',
          },
        ]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/height/below-next-float-refusal',
        [
          {
            key: 'H',
            value: previousRepresentablePositive(heightBoundary),
            endpoint: 'previous-representable',
          },
          { key: 't_bottom', value: maximumBottomThickness, endpoint: 'maximum' },
        ]
      )
    );

    const wallBoundary = 20;
    const wallBoundaryDiameter = 40;
    const wallBaseValues = [
      { key: 'top_od', value: wallBoundaryDiameter, endpoint: 'interior' },
      { key: 'bottom_od', value: wallBoundaryDiameter, endpoint: 'interior' },
      { key: 'r_drain', value: 0, endpoint: 'transition-absent' },
    ] as const satisfies readonly GeometryScenarioValue[];
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/wall/previous-f32-strict-valid',
        [
          ...wallBaseValues,
          {
            key: 't_wall',
            value: previousRepresentableFloat32(wallBoundary),
            endpoint: 'previous-binary32',
          },
        ]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/wall/previous-f64-representation-refusal',
        [
          ...wallBaseValues,
          {
            key: 't_wall',
            value: previousRepresentablePositive(wallBoundary),
            endpoint: 'previous-representable',
          },
        ]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/wall/equality-refusal',
        [...wallBaseValues, { key: 't_wall', value: wallBoundary, endpoint: 'equality' }]
      )
    );

    const drainBottomDiameter = 100;
    const drainWallThickness = 20;
    const drainBoundary = drainBottomDiameter / 2 - drainWallThickness;
    const drainBaseValues = [
      { key: 'bottom_od', value: drainBottomDiameter, endpoint: 'interior' },
      { key: 't_wall', value: drainWallThickness, endpoint: 'maximum' },
    ] as const satisfies readonly GeometryScenarioValue[];
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/drain/previous-f32-strict-valid',
        [
          ...drainBaseValues,
          {
            key: 'r_drain',
            value: previousRepresentableFloat32(drainBoundary),
            endpoint: 'previous-binary32',
          },
        ]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/drain/previous-f64-representation-refusal',
        [
          ...drainBaseValues,
          {
            key: 'r_drain',
            value: previousRepresentablePositive(drainBoundary),
            endpoint: 'previous-representable',
          },
        ]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/drain/equality-refusal',
        [...drainBaseValues, { key: 'r_drain', value: drainBoundary, endpoint: 'equality' }]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/drain/topology-absent',
        [{ key: 'r_drain', value: 0, endpoint: 'transition-absent' }]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/drain/topology-present-next-float',
        [{ key: 'r_drain', value: Number.MIN_VALUE, endpoint: 'transition-present' }]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-relational-boundary',
        'geometry-relation/drain/topology-present-supported-positive',
        [{ key: 'r_drain', value: 0.5, endpoint: 'transition-present' }]
      )
    );

    append(
      geometryScenario(
        styleId,
        'geometry-interaction',
        'geometry-interaction/phase/nontrivial-180',
        [{ key: 'spinPhase', value: 180, endpoint: 'interior' }]
      )
    );
    append(
      geometryScenario(
        styleId,
        'geometry-interaction',
        'geometry-interaction/twist-phase/positive-1.25-at-180',
        [
          { key: 'spinTurns', value: 1.25, endpoint: 'interior' },
          { key: 'spinPhase', value: 180, endpoint: 'interior' },
        ]
      )
    );
  }

  if (controlCount.toString() !== STYLE_PARAMETER_LAYOUT_CONTROL_COUNT) {
    throw new CertificationMatrixPlanError(
      `immutable control count ${controlCount} does not match committed count ${STYLE_PARAMETER_LAYOUT_CONTROL_COUNT}`
    );
  }
  const caseIds = new Set(cases.map((matrixCase) => matrixCase.caseId));
  if (caseIds.size !== cases.length) {
    throw new CertificationMatrixPlanError('case ids are not unique');
  }

  const frozenCases = Object.freeze([...cases]);
  const caseSequenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification-matrix-plan/case-sequence/v3',
    { caseSha256s: frozenCases.map((matrixCase) => matrixCase.sha256) }
  );
  const manifestValue = {
    canonicalInputCount: canonicalInputCount.toString(),
    caseCount: frozenCases.length.toString(),
    caseSequenceSha256,
    certificationAllowed: false,
    coverageSpecSha256: CERTIFICATION_MATRIX_COVERAGE_SPEC_SHA256,
    executionEvidenceSha256: null,
    familyCounts: Object.fromEntries(
      Object.entries(familyCounts).map(([family, count]) => [family, count.toString()])
    ),
    geometryControlCount: CERTIFIED_GEOMETRY_DOMAIN_ENTRIES.length.toString(),
    preflightRefusalCount: refusalCount.toString(),
    schemaVersion: CERTIFICATION_MATRIX_PLAN_VERSION,
    status: 'plan-only-not-artifact-evidence',
    styleControlCount: controlCount.toString(),
    styleEvaluatorSourceContractSha256: STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256,
    styleIds: styles.map(([styleId]) => styleId),
    styleParameterLayoutSpecSha256: STYLE_PARAMETER_LAYOUT_SPEC_SHA256,
    targetControlCount: '1',
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
  } as const satisfies CanonicalJsonValue;
  const manifestCanonicalJson = canonicalizeCertificationJson(manifestValue);
  const manifestSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.certification-matrix-plan/definition/v3',
    manifestValue
  );
  return Object.freeze({
    schemaVersion: CERTIFICATION_MATRIX_PLAN_VERSION,
    certificationAllowed: false,
    status: 'plan-only-not-artifact-evidence',
    cases: frozenCases,
    caseSequenceSha256,
    manifestCanonicalJson,
    manifestSha256,
  });
}
