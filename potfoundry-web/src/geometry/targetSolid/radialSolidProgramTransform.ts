import {
  parseCanonicalCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import { sha256Utf8 } from './incrementalSha256';
import {
  compileGeneratedTargetProgramBackends,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';
import {
  type TargetBinaryOperation,
  type TargetExpressionReference,
  type TargetUnaryOperation,
  ValidatedTargetProgramBuilder,
  type ValidatedTargetCoordinates,
  type ValidatedTargetProgramMetadata,
} from './validatedTargetProgramBuilder';

export const RADIAL_SOLID_PROGRAM_TRANSFORM_VERSION =
  'potfoundry.radial-solid-program-transform/v10' as const;
export const RADIAL_SOLID_PROGRAM_TRANSFORM_PROOF_SHA256 = sha256Utf8(
  [
    RADIAL_SOLID_PROGRAM_TRANSFORM_VERSION,
    'source is first accepted by the pinned validated target-program compiler',
    'the accepted forward SSA graph is replayed operation-for-operation into a fresh opaque builder',
    'source u maps to targetU or exact 1-targetU; source v maps to start+(end-start)*targetV with start/end emitted independently as exact binary64 decimals, or to one exact constant',
    'affine endpoint differences are target-program operations and are never pre-rounded in host binary64, so both endpoints retain exact expression identity',
    'orientation-sensitive solid patches may map source u to exact 1-targetU so geometric normals can follow the closed-solid orientation',
    'source x/y must have the generated radial form radius*cos(angle),radius*sin(angle) with one structurally identical radius SSA node',
    'the exact source radius node is replayed directly; no interval-dependent sqrt(x^2+y^2) reconstruction is admitted',
    'the authenticated source cos(angle) and sin(angle) SSA references are retained explicitly',
    'transformed xy is emitted directly as newRadius*cos(angle),newRadius*sin(angle); no radius division, r/r cancellation, or interval dependency is introduced',
    'clearance scalar = sourceRadius-wallThickness-minimumRadius and is emitted separately for validated strict-positivity proof',
    'inner offset radius = max(sourceRadius-wallThickness,minimumRadius)',
    'fixed-radius cylinder maps an affine source-v interval while preserving source placement angle and z',
    'rim radius = mix(innerOffsetRadius,sourceRadius,targetV)',
    'outer cap radius = mix(sourceRadius,endRadius,targetV)',
    'inner cap radius = mix(innerOffsetRadius,endRadius,targetV)',
    'cap radial parameter may use targetV or exact 1-targetV to match the oriented complex atlas',
    'cap z may reuse the exact replayed source-boundary expression so adjacent clipped patches have no binary64 ratio seam',
    'every transformed program is recompiled into shared CPU-f64/WGSL-f32/validated-interval backends',
    'this proves deterministic program derivation and provenance only; source/offset regularity, clamp inactivity, junction equality, and geometric validity remain separate obligations',
  ].join('\n')
);

export interface TransformedRadialSolidProgram {
  readonly transformVersion: typeof RADIAL_SOLID_PROGRAM_TRANSFORM_VERSION;
  readonly transformProofSha256: string;
  readonly sourceProgramSha256: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

export interface RadialOffsetTransformOptions {
  readonly sourceVStart: number;
  readonly sourceVEnd: number;
  readonly wallThicknessMm: number;
  readonly minimumRadiusMm: number;
  readonly reverseU?: boolean;
}

export interface RadialBoundaryTransformOptions {
  readonly sourceV: number;
  readonly wallThicknessMm: number;
  readonly minimumRadiusMm: number;
  readonly reverseU?: boolean;
}

export interface RadialClearanceTransformOptions {
  readonly wallThicknessMm: number;
  readonly minimumRadiusMm: number;
  readonly sourceVStart?: number;
  readonly sourceVEnd?: number;
}

export interface RadialFixedRadiusTransformOptions {
  readonly sourceVStart: number;
  readonly sourceVEnd: number;
  readonly radiusMm: number;
  readonly reverseU?: boolean;
}

export interface RadialCapTransformOptions extends RadialBoundaryTransformOptions {
  readonly endRadiusMm: number;
  readonly zMode?: 'constant' | 'source-boundary';
  readonly zMm?: number;
  readonly reverseRadialParameter?: boolean;
}

type ParsedNode = Readonly<{
  readonly op: string;
  readonly arg?: string;
  readonly left?: string;
  readonly right?: string;
  readonly value?: string;
}>;

const UNARY_OPERATIONS = new Set<TargetUnaryOperation>([
  'negate',
  'absolute',
  'square',
  'sqrt',
  'exp',
  'ln',
  'sin',
  'cos',
  'floor',
  'ceiling',
  'round',
  'fractional-part',
  'sign',
]);
const BINARY_OPERATIONS = new Set<TargetBinaryOperation>([
  'add',
  'subtract',
  'multiply',
  'divide',
  'minimum',
  'maximum',
  'power',
  'step',
  'atan2',
  'pcg2d-unit-x',
  'pcg2d-unit-y',
]);

function fail(message: string): never {
  throw new TypeError(`Radial solid program transform refused: ${message}`);
}

function finite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function nonnegative(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved < 0) fail(`${label} must be nonnegative`);
  return resolved;
}

function booleanOption(value: boolean | undefined, label: string): boolean {
  if (value !== undefined && typeof value !== 'boolean') fail(`${label} must be boolean`);
  return value ?? false;
}

function mapSourceU(
  builder: ValidatedTargetProgramBuilder,
  targetU: TargetExpressionReference,
  reverseU: boolean
): TargetExpressionReference {
  return reverseU
    ? builder.subtract(builder.constantDecimal('1'), targetU)
    : targetU;
}

function canonicalRecord(
  value: CanonicalJsonValue,
  label: string
): { readonly [key: string]: CanonicalJsonValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as { readonly [key: string]: CanonicalJsonValue };
}

function canonicalIndex(
  value: CanonicalJsonValue | undefined,
  upperExclusive: number,
  label: string
): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail(`${label} must be a canonical index`);
  }
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0 || index >= upperExclusive) {
    fail(`${label} is out of range`);
  }
  return index;
}

function replaySourceProgram(
  sourceProgramCanonicalJson: string,
  builder: ValidatedTargetProgramBuilder,
  mappedU: TargetExpressionReference,
  mappedV: TargetExpressionReference
): Readonly<{
  sourceProgramSha256: string;
  coordinates: ValidatedTargetCoordinates;
  radius: TargetExpressionReference;
  cosine: TargetExpressionReference;
  sine: TargetExpressionReference;
}> {
  const sourceBackends = compileGeneratedTargetProgramBackends(sourceProgramCanonicalJson);
  const parsed = parseCanonicalCertificationJson(sourceProgramCanonicalJson);
  if (!parsed.ok) fail(`source program canonical JSON is unavailable: ${parsed.reason}`);
  const root = canonicalRecord(parsed.value, 'source program');
  if (!Array.isArray(root.nodes)) fail('source program nodes are unavailable');
  const nodes = root.nodes;
  const references: TargetExpressionReference[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = canonicalRecord(nodes[index], `source node ${index}`) as ParsedNode;
    let reference: TargetExpressionReference;
    if (node.op === 'constant') {
      if (typeof node.value !== 'string') fail(`source constant ${index} has no value`);
      reference = builder.constantDecimal(node.value);
    } else if (node.op === 'u') {
      reference = mappedU;
    } else if (node.op === 'v') {
      reference = mappedV;
    } else if (node.op === 'pi') {
      reference = builder.pi();
    } else if (UNARY_OPERATIONS.has(node.op as TargetUnaryOperation)) {
      const argument = canonicalIndex(node.arg, index, `source node ${index} argument`);
      reference = builder.unary(node.op as TargetUnaryOperation, references[argument]);
    } else if (BINARY_OPERATIONS.has(node.op as TargetBinaryOperation)) {
      const left = canonicalIndex(node.left, index, `source node ${index} left`);
      const right = canonicalIndex(node.right, index, `source node ${index} right`);
      reference = builder.binary(
        node.op as TargetBinaryOperation,
        references[left],
        references[right]
      );
    } else {
      fail(`source node ${index} operation '${node.op}' is unsupported`);
    }
    references.push(reference);
  }
  const target = canonicalRecord(root.target, 'source target');
  const targetX = canonicalIndex(target.x, references.length, 'source target x');
  const targetY = canonicalIndex(target.y, references.length, 'source target y');
  const targetZ = canonicalIndex(target.z, references.length, 'source target z');
  const nodeAt = (index: number): ParsedNode =>
    canonicalRecord(nodes[index], `source node ${index}`) as ParsedNode;
  const multiplyOperands = (index: number): readonly [number, number] | undefined => {
    const node = nodeAt(index);
    if (node.op !== 'multiply') return undefined;
    return Object.freeze([
      canonicalIndex(node.left, index, `source node ${index} left`),
      canonicalIndex(node.right, index, `source node ${index} right`),
    ] as const);
  };
  const xOperands = multiplyOperands(targetX);
  const yOperands = multiplyOperands(targetY);
  let radiusNodeIndex: number | undefined;
  let cosineNodeIndex: number | undefined;
  let sineNodeIndex: number | undefined;
  if (xOperands !== undefined && yOperands !== undefined) {
    for (const candidate of xOperands) {
      if (!yOperands.includes(candidate)) continue;
      const xAngleNodeIndex = xOperands[0] === candidate ? xOperands[1] : xOperands[0];
      const yAngleNodeIndex = yOperands[0] === candidate ? yOperands[1] : yOperands[0];
      const xAngleNode = nodeAt(xAngleNodeIndex);
      const yAngleNode = nodeAt(yAngleNodeIndex);
      if (
        xAngleNode.op === 'cos' &&
        yAngleNode.op === 'sin' &&
        xAngleNode.arg === yAngleNode.arg
      ) {
        radiusNodeIndex = candidate;
        cosineNodeIndex = xAngleNodeIndex;
        sineNodeIndex = yAngleNodeIndex;
        break;
      }
    }
  }
  if (
    radiusNodeIndex === undefined ||
    cosineNodeIndex === undefined ||
    sineNodeIndex === undefined
  ) {
    fail('source target is not an authenticated generated radial Cartesian projection');
  }
  return Object.freeze({
    sourceProgramSha256: sourceBackends.programSha256,
    coordinates: Object.freeze({
      x: references[targetX],
      y: references[targetY],
      z: references[targetZ],
    }),
    radius: references[radiusNodeIndex],
    cosine: references[cosineNodeIndex],
    sine: references[sineNodeIndex],
  });
}

function radialCoordinates(
  builder: ValidatedTargetProgramBuilder,
  source: Readonly<{
    coordinates: ValidatedTargetCoordinates;
    cosine: TargetExpressionReference;
    sine: TargetExpressionReference;
  }>,
  radius: TargetExpressionReference,
  z: TargetExpressionReference = source.coordinates.z
): ValidatedTargetCoordinates {
  return Object.freeze({
    x: builder.multiply(radius, source.cosine),
    y: builder.multiply(radius, source.sine),
    z,
  });
}

function innerRadius(
  builder: ValidatedTargetProgramBuilder,
  sourceRadius: TargetExpressionReference,
  wallThicknessMm: number,
  minimumRadiusMm: number
): TargetExpressionReference {
  return builder.maximum(
    builder.subtract(sourceRadius, builder.constantFloat64(wallThicknessMm)),
    builder.constantFloat64(minimumRadiusMm)
  );
}

/**
 * Derive the scalar clearance whose strict positivity proves that the
 * production inner-radius floor is inactive over the complete source patch.
 * The clearance is emitted in x; y and z are exact zero.
 */
export function deriveRadialClearanceTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialClearanceTransformOptions
): TransformedRadialSolidProgram {
  const wallThicknessMm = nonnegative(options.wallThicknessMm, 'wallThicknessMm');
  const minimumRadiusMm = nonnegative(options.minimumRadiusMm, 'minimumRadiusMm');
  const sourceVStart = finite(options.sourceVStart ?? 0, 'sourceVStart');
  const sourceVEnd = finite(options.sourceVEnd ?? 1, 'sourceVEnd');
  const builder = new ValidatedTargetProgramBuilder();
  const targetV = builder.v();
  const sourceVStartExpression = builder.constantFloat64(sourceVStart);
  const sourceVEndExpression = builder.constantFloat64(sourceVEnd);
  const mappedV = builder.add(
    sourceVStartExpression,
    builder.multiply(
      builder.subtract(sourceVEndExpression, sourceVStartExpression),
      targetV
    )
  );
  const replayed = replaySourceProgram(
    sourceProgramCanonicalJson,
    builder,
    builder.u(),
    mappedV
  );
  const clearance = builder.subtract(
    builder.subtract(
      replayed.radius,
      builder.constantFloat64(wallThicknessMm)
    ),
    builder.constantFloat64(minimumRadiusMm)
  );
  const zero = builder.constantDecimal('0');
  return compileTransformed(
    replayed.sourceProgramSha256,
    builder,
    metadata,
    Object.freeze({ x: clearance, y: zero, z: zero })
  );
}

function compileTransformed(
  sourceProgramSha256: string,
  builder: ValidatedTargetProgramBuilder,
  metadata: ValidatedTargetProgramMetadata,
  coordinates: ValidatedTargetCoordinates
): TransformedRadialSolidProgram {
  const programCanonicalJson = builder.buildCanonicalProgram(metadata, coordinates);
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    transformVersion: RADIAL_SOLID_PROGRAM_TRANSFORM_VERSION,
    transformProofSha256: RADIAL_SOLID_PROGRAM_TRANSFORM_PROOF_SHA256,
    sourceProgramSha256,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}

/** Derive an inner wall or an inner copy of a radial feature closure. */
export function deriveRadialOffsetTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialOffsetTransformOptions
): TransformedRadialSolidProgram {
  const sourceVStart = finite(options.sourceVStart, 'sourceVStart');
  const sourceVEnd = finite(options.sourceVEnd, 'sourceVEnd');
  const wallThicknessMm = nonnegative(options.wallThicknessMm, 'wallThicknessMm');
  const minimumRadiusMm = nonnegative(options.minimumRadiusMm, 'minimumRadiusMm');
  const reverseU = booleanOption(options.reverseU, 'reverseU');
  const builder = new ValidatedTargetProgramBuilder();
  const targetU = builder.u();
  const targetV = builder.v();
  const sourceVStartExpression = builder.constantFloat64(sourceVStart);
  const sourceVEndExpression = builder.constantFloat64(sourceVEnd);
  const mappedV = builder.add(
    sourceVStartExpression,
    builder.multiply(
      builder.subtract(sourceVEndExpression, sourceVStartExpression),
      targetV
    )
  );
  const replayed = replaySourceProgram(
    sourceProgramCanonicalJson,
    builder,
    mapSourceU(builder, targetU, reverseU),
    mappedV
  );
  const sourceRadius = replayed.radius;
  const radius = innerRadius(builder, sourceRadius, wallThicknessMm, minimumRadiusMm);
  return compileTransformed(
    replayed.sourceProgramSha256,
    builder,
    metadata,
    radialCoordinates(builder, replayed, radius)
  );
}

/** Derive a constant-radius wall while retaining the source placement twist and z map. */
export function deriveRadialFixedRadiusTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialFixedRadiusTransformOptions
): TransformedRadialSolidProgram {
  const sourceVStart = finite(options.sourceVStart, 'sourceVStart');
  const sourceVEnd = finite(options.sourceVEnd, 'sourceVEnd');
  const radiusMm = nonnegative(options.radiusMm, 'radiusMm');
  const reverseU = booleanOption(options.reverseU, 'reverseU');
  const builder = new ValidatedTargetProgramBuilder();
  const targetU = builder.u();
  const targetV = builder.v();
  const sourceVStartExpression = builder.constantFloat64(sourceVStart);
  const sourceVEndExpression = builder.constantFloat64(sourceVEnd);
  const mappedV = builder.add(
    sourceVStartExpression,
    builder.multiply(
      builder.subtract(sourceVEndExpression, sourceVStartExpression),
      targetV
    )
  );
  const replayed = replaySourceProgram(
    sourceProgramCanonicalJson,
    builder,
    mapSourceU(builder, targetU, reverseU),
    mappedV
  );
  return compileTransformed(
    replayed.sourceProgramSha256,
    builder,
    metadata,
    radialCoordinates(
      builder,
      replayed,
      builder.constantFloat64(radiusMm)
    )
  );
}

/** Derive the top annulus joining an authenticated outer limit to its radial offset. */
export function deriveRadialRimTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialBoundaryTransformOptions
): TransformedRadialSolidProgram {
  const sourceV = finite(options.sourceV, 'sourceV');
  const wallThicknessMm = nonnegative(options.wallThicknessMm, 'wallThicknessMm');
  const minimumRadiusMm = nonnegative(options.minimumRadiusMm, 'minimumRadiusMm');
  const reverseU = booleanOption(options.reverseU, 'reverseU');
  const builder = new ValidatedTargetProgramBuilder();
  const targetU = builder.u();
  const targetV = builder.v();
  const replayed = replaySourceProgram(
    sourceProgramCanonicalJson,
    builder,
    mapSourceU(builder, targetU, reverseU),
    builder.constantFloat64(sourceV)
  );
  const outerRadius = replayed.radius;
  const offsetRadius = innerRadius(builder, outerRadius, wallThicknessMm, minimumRadiusMm);
  const rimRadius = builder.mix(offsetRadius, outerRadius, targetV);
  return compileTransformed(
    replayed.sourceProgramSha256,
    builder,
    metadata,
    radialCoordinates(builder, replayed, rimRadius)
  );
}

function deriveRadialCapTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialCapTransformOptions,
  startAtInnerOffset: boolean
): TransformedRadialSolidProgram {
  const sourceV = finite(options.sourceV, 'sourceV');
  const wallThicknessMm = nonnegative(options.wallThicknessMm, 'wallThicknessMm');
  const minimumRadiusMm = nonnegative(options.minimumRadiusMm, 'minimumRadiusMm');
  const endRadiusMm = nonnegative(options.endRadiusMm, 'endRadiusMm');
  const zMode = options.zMode ?? 'constant';
  if (zMode !== 'constant' && zMode !== 'source-boundary') {
    fail('zMode must be constant or source-boundary');
  }
  if (zMode === 'source-boundary' && options.zMm !== undefined) {
    fail('zMm must be omitted when zMode is source-boundary');
  }
  const zMm = zMode === 'constant' ? finite(options.zMm as number, 'zMm') : undefined;
  const reverseU = booleanOption(options.reverseU, 'reverseU');
  const reverseRadialParameter = booleanOption(
    options.reverseRadialParameter,
    'reverseRadialParameter'
  );
  const builder = new ValidatedTargetProgramBuilder();
  const targetU = builder.u();
  const targetV = builder.v();
  const replayed = replaySourceProgram(
    sourceProgramCanonicalJson,
    builder,
    mapSourceU(builder, targetU, reverseU),
    builder.constantFloat64(sourceV)
  );
  const outerRadius = replayed.radius;
  const startRadius = startAtInnerOffset
    ? innerRadius(builder, outerRadius, wallThicknessMm, minimumRadiusMm)
    : outerRadius;
  const radialParameter = reverseRadialParameter
    ? builder.subtract(builder.constantDecimal('1'), targetV)
    : targetV;
  const radius = builder.mix(
    startRadius,
    builder.constantFloat64(endRadiusMm),
    radialParameter
  );
  return compileTransformed(
    replayed.sourceProgramSha256,
    builder,
    metadata,
    radialCoordinates(
      builder,
      replayed,
      radius,
      zMode === 'source-boundary'
        ? replayed.coordinates.z
        : builder.constantFloat64(zMm as number)
    )
  );
}

/** Derive the underside annulus/disc from an authenticated outer boundary. */
export function deriveRadialOuterCapTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialCapTransformOptions
): TransformedRadialSolidProgram {
  return deriveRadialCapTargetProgram(sourceProgramCanonicalJson, metadata, options, false);
}

/** Derive the floor annulus/disc from an authenticated outer boundary's inner offset. */
export function deriveRadialInnerCapTargetProgram(
  sourceProgramCanonicalJson: string,
  metadata: ValidatedTargetProgramMetadata,
  options: RadialCapTransformOptions
): TransformedRadialSolidProgram {
  return deriveRadialCapTargetProgram(sourceProgramCanonicalJson, metadata, options, true);
}
