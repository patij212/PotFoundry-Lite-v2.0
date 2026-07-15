import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  parseCanonicalCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION } from './completeMappedGeometryTargetDefinition';
import { sha256Utf8 } from './incrementalSha256';
import { TARGET_SOLID_SPECIFICATION_SHA256 } from './targetSolidSpecification';

export const TARGET_SURFACE_COMPLEX_DEFINITION_VERSION =
  'potfoundry.target-surface-complex-definition/v2' as const;
export const TARGET_SURFACE_COMPLEX_BINDING_VERSION =
  'potfoundry.target-surface-complex-binding/v2' as const;
export const TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE =
  'abstract-cell-complex-only-no-evaluator-image-regularity' as const;
export const TARGET_SURFACE_COMPLEX_PROOF_SHA256 = sha256Utf8(
  [
    TARGET_SURFACE_COMPLEX_BINDING_VERSION,
    'strict canonical number-free unit-square patch complex bound to one authenticated canonical target input',
    'every oriented patch side occurs exactly once in one two-incident edge class',
    'incident induced directions are opposite and exactly one incident owns each edge',
    'every corner equivalence class has one connected degree-two vertex-link cycle',
    `implementation-scope=${TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE}`,
    'the abstract quotient complex is connected, closed, orientable, and has the drain-selected genus',
    'base and feature-host roles form one component each and obey the complete pot-junction grammar',
    'allowed cross-role junctions = outer/top-rim, outer/bottom-under, inner/top-rim, inner/bottom-top, and with drain bottom-top/drain plus bottom-under/drain',
    'no-drain classified boundary cycles = outer{rim,under}, inner{rim,bottom-top}, rim{outer,inner}, bottom-top{inner}, bottom-under{outer}',
    'drain classified boundary cycles additionally = bottom-top{inner,drain}, bottom-under{outer,drain}, drain{bottom-top,bottom-under}',
    'each effective role subcomplex has connected edge adjacency, degree-two classified boundary cycles, and Euler genus zero',
    'feature-closure boundary edges have exactly one named closure incident and one base incident',
    'vertex pinches are excluded constructionally because corner equivalence is induced only by paired side endpoints and every vertex link is one degree-two cycle',
    'patch evaluator-program hashes are declarations; executable evaluator authenticity is a later registered-kernel obligation',
    'the proof accessor rederives and exposes immutable authenticated adjacency and feature records',
    'periodic seams and feature/crease edges are declarations whose geometric equality remains a validated evaluator obligation',
    'geometricImageManifoldProven is always false at this layer',
    'scope is abstract target combinatorics and provenance, not evaluator regularity, geometry distance, thickness, dimensions, or artifact certification',
  ].join('\n')
);

export type TargetSurfaceBasePatchRole =
  | 'outer-wall'
  | 'inner-wall'
  | 'top-rim'
  | 'bottom-top'
  | 'bottom-under'
  | 'drain-wall';
export type TargetSurfacePatchRole =
  | TargetSurfaceBasePatchRole
  | 'feature-curtain'
  | 'feature-side';

export type TargetSurfacePatchSide = 'u0' | 'u1' | 'v0' | 'v1';
export type TargetSurfaceEdgeDirection = 'forward' | 'reverse';
export type TargetSurfaceEdgeSemantics =
  | 'smooth-adjacency'
  | 'crease-adjacency'
  | 'periodic-identification'
  | 'feature-closure-adjacency';
export type TargetSurfaceFeatureKind = 'crease' | 'discontinuity';

export interface TargetSurfacePatchSummary {
  readonly patchId: string;
  readonly role: TargetSurfacePatchRole;
  readonly declaredEvaluatorProgramSha256: string;
}

export interface TargetSurfaceEdgeIncidentSummary {
  readonly direction: TargetSurfaceEdgeDirection;
  readonly patchId: string;
  readonly side: TargetSurfacePatchSide;
}

export interface TargetSurfaceEdgeSummary {
  readonly edgeId: string;
  readonly incidents: readonly [TargetSurfaceEdgeIncidentSummary, TargetSurfaceEdgeIncidentSummary];
  readonly owner: Readonly<{ patchId: string; side: TargetSurfacePatchSide }>;
  readonly semantics: TargetSurfaceEdgeSemantics;
}

export interface TargetSurfaceFeatureSummary {
  readonly featureId: string;
  readonly kind: TargetSurfaceFeatureKind;
  readonly hostRole: TargetSurfaceBasePatchRole;
  readonly edgeIds: readonly string[];
  readonly closurePatchIds: readonly string[];
}

export interface TargetSurfaceComplexTopology {
  readonly componentCount: '1';
  readonly genus: '0' | '1';
  readonly abstractOrientable: true;
  readonly abstractClosedTwoManifold: true;
  readonly geometricImageManifoldProven: false;
  readonly eulerCharacteristic: string;
  readonly vertexCount: string;
  readonly edgeCount: string;
  readonly faceCount: string;
}

declare const targetSurfaceComplexBindingBrand: unique symbol;

export interface TargetSurfaceComplexBinding {
  readonly schemaVersion: typeof TARGET_SURFACE_COMPLEX_BINDING_VERSION;
  readonly proofMethodSha256: string;
  readonly targetSurfaceComplexSha256: string;
  readonly surfaceDefinitionSha256: string;
  readonly patchManifestSha256: string;
  readonly canonicalInputSha256: string;
  readonly targetSolidSpecificationSha256: string;
  readonly implementationScope: typeof TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE;
  readonly bindingCanonicalJson: string;
  readonly surfaceDefinitionCanonicalJson: string;
  readonly patches: readonly TargetSurfacePatchSummary[];
  readonly edges: readonly TargetSurfaceEdgeSummary[];
  readonly features: readonly TargetSurfaceFeatureSummary[];
  readonly topology: TargetSurfaceComplexTopology;
  readonly [targetSurfaceComplexBindingBrand]: true;
}

export interface TargetSurfaceComplexProofSnapshot {
  readonly targetSurfaceComplexSha256: string;
  readonly surfaceDefinitionSha256: string;
  readonly canonicalInputSha256: string;
  readonly targetSolidSpecificationSha256: string;
  readonly implementationScope: typeof TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE;
  readonly surfaceDefinitionCanonicalJson: string;
  readonly patches: readonly TargetSurfacePatchSummary[];
  readonly edges: readonly TargetSurfaceEdgeSummary[];
  readonly features: readonly TargetSurfaceFeatureSummary[];
  readonly topology: TargetSurfaceComplexTopology;
}

export type TargetSurfaceComplexErrorCode =
  | 'INVALID_INPUT'
  | 'PATCH_SET_INVALID'
  | 'EDGE_SET_INVALID'
  | 'FEATURE_SET_INVALID'
  | 'ROLE_SET_INVALID'
  | 'TOPOLOGY_INVALID'
  | 'BINDING_INVALID';

export class TargetSurfaceComplexError extends Error {
  readonly code: TargetSurfaceComplexErrorCode;
  readonly subjectId?: string;

  constructor(code: TargetSurfaceComplexErrorCode, message: string, subjectId?: string) {
    super(message);
    this.name = 'TargetSurfaceComplexError';
    this.code = code;
    this.subjectId = subjectId;
  }
}

interface ParsedPatch extends TargetSurfacePatchSummary {
  readonly index: number;
}

type ParsedIncident = TargetSurfaceEdgeIncidentSummary;

type ParsedEdge = TargetSurfaceEdgeSummary;

type ParsedFeature = TargetSurfaceFeatureSummary;

interface SideAssignment {
  readonly direction: TargetSurfaceEdgeDirection;
  readonly edgeId: string;
}

interface DerivedSurfaceComplex {
  readonly canonicalInputSha256: string;
  readonly surfaceDefinitionSha256: string;
  readonly patchManifestSha256: string;
  readonly targetSurfaceComplexSha256: string;
  readonly bindingCanonicalJson: string;
  readonly surfaceDefinitionCanonicalJson: string;
  readonly patches: readonly TargetSurfacePatchSummary[];
  readonly edges: readonly TargetSurfaceEdgeSummary[];
  readonly features: readonly TargetSurfaceFeatureSummary[];
  readonly topology: TargetSurfaceComplexTopology;
}

interface RegisteredSurfaceComplex {
  readonly binding: TargetSurfaceComplexBinding;
  readonly canonicalInput: CanonicalTargetInputBinding;
  readonly canonicalDefinitionJson: string;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[a-z0-9](?:[a-z0-9._:/-]{0,127})$/;
const MAX_PATCHES = 1_024;
const MAX_EDGES = 2_048;
const MAX_FEATURES = 1_024;

const PATCH_ROLES = new Set<TargetSurfacePatchRole>([
  'outer-wall',
  'inner-wall',
  'top-rim',
  'bottom-top',
  'bottom-under',
  'drain-wall',
  'feature-curtain',
  'feature-side',
]);
const BASE_PATCH_ROLES = new Set<TargetSurfaceBasePatchRole>([
  'outer-wall',
  'inner-wall',
  'top-rim',
  'bottom-top',
  'bottom-under',
  'drain-wall',
]);
const PATCH_SIDES = new Set<TargetSurfacePatchSide>(['u0', 'u1', 'v0', 'v1']);
const EDGE_DIRECTIONS = new Set<TargetSurfaceEdgeDirection>(['forward', 'reverse']);
const EDGE_SEMANTICS = new Set<TargetSurfaceEdgeSemantics>([
  'smooth-adjacency',
  'crease-adjacency',
  'periodic-identification',
  'feature-closure-adjacency',
]);
const FEATURE_KINDS = new Set<TargetSurfaceFeatureKind>(['crease', 'discontinuity']);
const REQUIRED_BASE_ROLES: readonly TargetSurfacePatchRole[] = Object.freeze([
  'outer-wall',
  'inner-wall',
  'top-rim',
  'bottom-top',
  'bottom-under',
]);

const SIDE_CORNERS: Readonly<Record<TargetSurfacePatchSide, readonly [number, number]>> =
  Object.freeze({
    v0: Object.freeze([0, 1] as const),
    u1: Object.freeze([1, 2] as const),
    v1: Object.freeze([2, 3] as const),
    u0: Object.freeze([3, 0] as const),
  });
const CORNER_SIDES: readonly (readonly [TargetSurfacePatchSide, TargetSurfacePatchSide])[] =
  Object.freeze([
    Object.freeze(['u0', 'v0'] as const),
    Object.freeze(['v0', 'u1'] as const),
    Object.freeze(['u1', 'v1'] as const),
    Object.freeze(['v1', 'u0'] as const),
  ]);

const surfaceComplexRegistry = new WeakMap<object, RegisteredSurfaceComplex>();

class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_unused, index) => index);
    this.rank = new Array<number>(size).fill(0);
  }

  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    let cursor = value;
    while (this.parent[cursor] !== cursor) {
      const next = this.parent[cursor];
      this.parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    if (this.rank[leftRoot] < this.rank[rightRoot]) {
      this.parent[leftRoot] = rightRoot;
    } else if (this.rank[leftRoot] > this.rank[rightRoot]) {
      this.parent[rightRoot] = leftRoot;
    } else {
      this.parent[rightRoot] = leftRoot;
      this.rank[leftRoot] += 1;
    }
  }
}

function fail(
  code: TargetSurfaceComplexErrorCode,
  message: string,
  subjectId?: string
): never {
  throw new TargetSurfaceComplexError(code, message, subjectId);
}

function canonicalRecord(
  value: CanonicalJsonValue,
  label: string
): { readonly [key: string]: CanonicalJsonValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a canonical JSON object`);
  }
  return value as { readonly [key: string]: CanonicalJsonValue };
}

function exactKeys(
  value: { readonly [key: string]: CanonicalJsonValue },
  expected: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('INVALID_INPUT', `${label} has unknown or missing fields`);
  }
}

function id(value: CanonicalJsonValue, label: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    fail('INVALID_INPUT', `${label} is not a canonical identifier`);
  }
  return value;
}

function sortedIds(
  value: CanonicalJsonValue,
  label: string,
  allowEmpty: boolean
): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail('INVALID_INPUT', `${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  const result = value.map((entry, index) => id(entry, `${label}[${index}]`));
  if (result.some((entry, index) => index > 0 && result[index - 1] >= entry)) {
    fail('INVALID_INPUT', `${label} must be unique and sorted`);
  }
  return Object.freeze(result);
}

function sideKey(patchId: string, side: TargetSurfacePatchSide): string {
  return `${patchId}\0${side}`;
}

function incidentKey(incident: ParsedIncident): string {
  return sideKey(incident.patchId, incident.side);
}

function cornerIndex(patchIndex: number, corner: number): number {
  return patchIndex * 4 + corner;
}

function parsePatches(value: CanonicalJsonValue): readonly ParsedPatch[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PATCHES) {
    fail('PATCH_SET_INVALID', `Surface complex must contain 1..${MAX_PATCHES} patches`);
  }
  const patches: ParsedPatch[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const record = canonicalRecord(value[index], `Patch ${index}`);
    exactKeys(
      record,
      ['declaredEvaluatorProgramSha256', 'domainKind', 'patchId', 'role'],
      `Patch ${index}`
    );
    const patchId = id(record.patchId, `Patch ${index} patchId`);
    if (index > 0 && patches[index - 1].patchId >= patchId) {
      fail('PATCH_SET_INVALID', 'Patch ids must be unique and sorted', patchId);
    }
    if (record.domainKind !== 'unit-square') {
      fail('PATCH_SET_INVALID', 'Every certified mapped patch must use unit-square domain', patchId);
    }
    if (typeof record.role !== 'string' || !PATCH_ROLES.has(record.role as TargetSurfacePatchRole)) {
      fail('PATCH_SET_INVALID', 'Patch role is unsupported', patchId);
    }
    if (
      typeof record.declaredEvaluatorProgramSha256 !== 'string' ||
      !SHA256_RE.test(record.declaredEvaluatorProgramSha256)
    ) {
      fail('PATCH_SET_INVALID', 'Declared patch evaluator-program hash is invalid', patchId);
    }
    patches.push(
      Object.freeze({
        index,
        patchId,
        role: record.role as TargetSurfacePatchRole,
        declaredEvaluatorProgramSha256: record.declaredEvaluatorProgramSha256,
      })
    );
  }
  return Object.freeze(patches);
}

function parseIncident(
  value: CanonicalJsonValue,
  edgeId: string,
  index: number,
  patchById: ReadonlyMap<string, ParsedPatch>
): ParsedIncident {
  const record = canonicalRecord(value, `Edge ${edgeId} incident ${index}`);
  exactKeys(record, ['direction', 'patchId', 'side'], `Edge ${edgeId} incident ${index}`);
  const patchId = id(record.patchId, `Edge ${edgeId} incident ${index} patchId`);
  if (!patchById.has(patchId)) {
    fail('EDGE_SET_INVALID', 'Edge incident names an unknown patch', edgeId);
  }
  if (
    typeof record.side !== 'string' ||
    !PATCH_SIDES.has(record.side as TargetSurfacePatchSide)
  ) {
    fail('EDGE_SET_INVALID', 'Edge incident side is invalid', edgeId);
  }
  if (
    typeof record.direction !== 'string' ||
    !EDGE_DIRECTIONS.has(record.direction as TargetSurfaceEdgeDirection)
  ) {
    fail('EDGE_SET_INVALID', 'Edge incident direction is invalid', edgeId);
  }
  return Object.freeze({
    direction: record.direction as TargetSurfaceEdgeDirection,
    patchId,
    side: record.side as TargetSurfacePatchSide,
  });
}

function parseEdges(
  value: CanonicalJsonValue,
  patches: readonly ParsedPatch[],
  cornerUnion: UnionFind,
  patchUnion: UnionFind,
  sideAssignments: Map<string, SideAssignment>
): readonly ParsedEdge[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EDGES) {
    fail('EDGE_SET_INVALID', `Surface complex must contain 1..${MAX_EDGES} edges`);
  }
  const patchById = new Map(patches.map((patch) => [patch.patchId, patch]));
  const edges: ParsedEdge[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const record = canonicalRecord(value[index], `Edge ${index}`);
    exactKeys(record, ['edgeId', 'incidents', 'owner', 'semantics'], `Edge ${index}`);
    const edgeId = id(record.edgeId, `Edge ${index} edgeId`);
    if (index > 0 && edges[index - 1].edgeId >= edgeId) {
      fail('EDGE_SET_INVALID', 'Edge ids must be unique and sorted', edgeId);
    }
    if (!Array.isArray(record.incidents) || record.incidents.length !== 2) {
      fail('EDGE_SET_INVALID', 'Every closed-manifold edge needs exactly two incidents', edgeId);
    }
    const left = parseIncident(record.incidents[0], edgeId, 0, patchById);
    const right = parseIncident(record.incidents[1], edgeId, 1, patchById);
    if (incidentKey(left) >= incidentKey(right)) {
      fail('EDGE_SET_INVALID', 'Edge incidents must be distinct and sorted', edgeId);
    }
    if (left.direction === right.direction) {
      fail('EDGE_SET_INVALID', 'Oriented edge incidents must have opposite directions', edgeId);
    }
    for (const incident of [left, right]) {
      const key = incidentKey(incident);
      if (sideAssignments.has(key)) {
        fail('EDGE_SET_INVALID', 'A patch side occurs in more than one edge', edgeId);
      }
      sideAssignments.set(
        key,
        Object.freeze({ direction: incident.direction, edgeId })
      );
    }

    const ownerRecord = canonicalRecord(record.owner, `Edge ${edgeId} owner`);
    exactKeys(ownerRecord, ['patchId', 'side'], `Edge ${edgeId} owner`);
    const owner = Object.freeze({
      patchId: id(ownerRecord.patchId, `Edge ${edgeId} owner patchId`),
      side: ownerRecord.side as TargetSurfacePatchSide,
    });
    if (!PATCH_SIDES.has(owner.side)) {
      fail('EDGE_SET_INVALID', 'Edge owner side is invalid', edgeId);
    }
    if (![left, right].some((incident) => incidentKey(incident) === sideKey(owner.patchId, owner.side))) {
      fail('EDGE_SET_INVALID', 'Edge owner must name exactly one incident', edgeId);
    }
    if (
      typeof record.semantics !== 'string' ||
      !EDGE_SEMANTICS.has(record.semantics as TargetSurfaceEdgeSemantics)
    ) {
      fail('EDGE_SET_INVALID', 'Edge semantics are unsupported', edgeId);
    }

    const leftPatch = patchById.get(left.patchId)!;
    const rightPatch = patchById.get(right.patchId)!;
    const [leftStart, leftEnd] = SIDE_CORNERS[left.side];
    const [rightStart, rightEnd] = SIDE_CORNERS[right.side];
    const leftGlobal = left.direction === 'forward' ? [leftStart, leftEnd] : [leftEnd, leftStart];
    const rightGlobal =
      right.direction === 'forward' ? [rightStart, rightEnd] : [rightEnd, rightStart];
    cornerUnion.union(
      cornerIndex(leftPatch.index, leftGlobal[0]),
      cornerIndex(rightPatch.index, rightGlobal[0])
    );
    cornerUnion.union(
      cornerIndex(leftPatch.index, leftGlobal[1]),
      cornerIndex(rightPatch.index, rightGlobal[1])
    );
    patchUnion.union(leftPatch.index, rightPatch.index);

    edges.push(
      Object.freeze({
        edgeId,
        incidents: Object.freeze([left, right]) as readonly [ParsedIncident, ParsedIncident],
        owner,
        semantics: record.semantics as TargetSurfaceEdgeSemantics,
      })
    );
  }
  if (sideAssignments.size !== patches.length * 4 || edges.length * 2 !== patches.length * 4) {
    fail('EDGE_SET_INVALID', 'Every patch side must occur exactly once in the closed complex');
  }
  return Object.freeze(edges);
}

function parseFeatures(
  value: CanonicalJsonValue,
  patches: readonly ParsedPatch[],
  edges: readonly ParsedEdge[]
): readonly ParsedFeature[] {
  if (!Array.isArray(value) || value.length > MAX_FEATURES) {
    fail('FEATURE_SET_INVALID', `Feature manifest must contain 0..${MAX_FEATURES} entries`);
  }
  const patchById = new Map(patches.map((patch) => [patch.patchId, patch]));
  const edgeById = new Map(edges.map((edge) => [edge.edgeId, edge]));
  const edgeReferenceCount = new Map<string, number>();
  const closurePatchReferenceCount = new Map<string, number>();
  const featureOwnerByEdge = new Map<string, string>();
  const featureOwnerByClosurePatch = new Map<string, string>();
  const features: ParsedFeature[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const record = canonicalRecord(value[index], `Feature ${index}`);
    exactKeys(
      record,
      ['closurePatchIds', 'edgeIds', 'featureId', 'hostRole', 'kind'],
      `Feature ${index}`
    );
    const featureId = id(record.featureId, `Feature ${index} featureId`);
    if (index > 0 && features[index - 1].featureId >= featureId) {
      fail('FEATURE_SET_INVALID', 'Feature ids must be unique and sorted', featureId);
    }
    if (typeof record.kind !== 'string' || !FEATURE_KINDS.has(record.kind as TargetSurfaceFeatureKind)) {
      fail('FEATURE_SET_INVALID', 'Feature kind is unsupported', featureId);
    }
    const kind = record.kind as TargetSurfaceFeatureKind;
    if (
      typeof record.hostRole !== 'string' ||
      !BASE_PATCH_ROLES.has(record.hostRole as TargetSurfaceBasePatchRole)
    ) {
      fail('FEATURE_SET_INVALID', 'Feature host role is unsupported', featureId);
    }
    const hostRole = record.hostRole as TargetSurfaceBasePatchRole;
    const edgeIds = sortedIds(record.edgeIds, `Feature ${featureId} edgeIds`, false);
    const closurePatchIds = sortedIds(
      record.closurePatchIds,
      `Feature ${featureId} closurePatchIds`,
      kind === 'crease'
    );
    if (kind === 'crease' && closurePatchIds.length !== 0) {
      fail('FEATURE_SET_INVALID', 'Creases cannot name closure patches', featureId);
    }
    if (kind === 'discontinuity' && closurePatchIds.length === 0) {
      fail('FEATURE_SET_INVALID', 'Discontinuities require explicit closure patches', featureId);
    }

    for (const edgeId of edgeIds) {
      const edge = edgeById.get(edgeId);
      if (edge === undefined) {
        fail('FEATURE_SET_INVALID', 'Feature names an unknown edge', featureId);
      }
      const expectedSemantics =
        kind === 'crease' ? 'crease-adjacency' : 'feature-closure-adjacency';
      if (edge.semantics !== expectedSemantics) {
        fail('FEATURE_SET_INVALID', 'Feature edge semantics do not match feature kind', featureId);
      }
      if (kind === 'discontinuity') {
        const closureIncidents = edge.incidents.filter((incident) => {
          const role = patchById.get(incident.patchId)!.role;
          return role === 'feature-curtain' || role === 'feature-side';
        });
        if (closureIncidents.length !== 1) {
          fail(
            'FEATURE_SET_INVALID',
            'Discontinuity boundary edge must have exactly one explicit closure incident',
            edgeId
          );
        }
        if (
          closureIncidents.some(
            (incident) => !closurePatchIds.includes(incident.patchId)
          )
        ) {
          fail(
            'FEATURE_SET_INVALID',
            'Discontinuity edge is cross-wired to a closure patch owned elsewhere',
            edgeId
          );
        }
      }
      edgeReferenceCount.set(edgeId, (edgeReferenceCount.get(edgeId) ?? 0) + 1);
      featureOwnerByEdge.set(edgeId, featureId);
    }
    for (const patchId of closurePatchIds) {
      const patch = patchById.get(patchId);
      if (
        patch === undefined ||
        (patch.role !== 'feature-curtain' && patch.role !== 'feature-side')
      ) {
        fail('FEATURE_SET_INVALID', 'Closure patch is missing or has a non-closure role', featureId);
      }
      if (
        !edgeIds.some((edgeId) =>
          edgeById
            .get(edgeId)!
            .incidents.some((incident) => incident.patchId === patchId)
        )
      ) {
        fail('FEATURE_SET_INVALID', 'Closure patch is not incident to any feature edge', featureId);
      }
      closurePatchReferenceCount.set(
        patchId,
        (closurePatchReferenceCount.get(patchId) ?? 0) + 1
      );
      featureOwnerByClosurePatch.set(patchId, featureId);
    }
    features.push(Object.freeze({ featureId, kind, hostRole, edgeIds, closurePatchIds }));
  }

  for (const edge of edges) {
    const requiresFeature =
      edge.semantics === 'crease-adjacency' || edge.semantics === 'feature-closure-adjacency';
    const references = edgeReferenceCount.get(edge.edgeId) ?? 0;
    if ((requiresFeature && references !== 1) || (!requiresFeature && references !== 0)) {
      fail('FEATURE_SET_INVALID', 'Feature-bearing edges require exactly one manifest owner', edge.edgeId);
    }
  }
  for (const patch of patches) {
    const isClosure = patch.role === 'feature-curtain' || patch.role === 'feature-side';
    const references = closurePatchReferenceCount.get(patch.patchId) ?? 0;
    if ((isClosure && references !== 1) || (!isClosure && references !== 0)) {
      fail(
        'FEATURE_SET_INVALID',
        'Feature closure patches require exactly one discontinuity owner',
        patch.patchId
      );
    }
  }
  for (const edge of edges) {
    const closurePatchIds = edge.incidents
      .filter((incident) => {
        const role = patchById.get(incident.patchId)!.role;
        return role === 'feature-curtain' || role === 'feature-side';
      })
      .map((incident) => incident.patchId);
    const closureOwners = new Set(
      closurePatchIds.map((patchId) => featureOwnerByClosurePatch.get(patchId))
    );
    if (closureOwners.has(undefined)) {
      fail('FEATURE_SET_INVALID', 'Closure patch has no discontinuity owner', edge.edgeId);
    }
    if (closureOwners.size > 1) {
      fail(
        'FEATURE_SET_INVALID',
        'One edge cannot join closure patches owned by different discontinuities',
        edge.edgeId
      );
    }
    if (edge.semantics === 'feature-closure-adjacency' && closurePatchIds.length !== 1) {
      fail(
        'FEATURE_SET_INVALID',
        'Feature-closure adjacency requires exactly one closure and one base incident',
        edge.edgeId
      );
    }
    if (closurePatchIds.length === 1) {
      const closureOwner = [...closureOwners][0];
      if (
        edge.semantics !== 'feature-closure-adjacency' ||
        featureOwnerByEdge.get(edge.edgeId) !== closureOwner
      ) {
        fail(
          'FEATURE_SET_INVALID',
          'Every closure-to-base edge must be owned by its discontinuity feature',
          edge.edgeId
        );
      }
    }
    if (
      closurePatchIds.length === 2 &&
      edge.semantics !== 'smooth-adjacency' &&
      edge.semantics !== 'crease-adjacency' &&
      edge.semantics !== 'periodic-identification'
    ) {
      fail(
        'FEATURE_SET_INVALID',
        'Closure tiling edges must be smooth, periodic, or explicit creases',
        edge.edgeId
      );
    }
  }
  return Object.freeze(features);
}

function edgeEndpointToken(
  patchId: string,
  side: TargetSurfacePatchSide,
  corner: number,
  assignment: SideAssignment
): string {
  const [start, end] = SIDE_CORNERS[side];
  if (corner !== start && corner !== end) {
    fail('TOPOLOGY_INVALID', 'Corner is not incident to its declared patch side', patchId);
  }
  const inducedEndpoint = corner === start ? 0 : 1;
  const globalEndpoint =
    assignment.direction === 'forward' ? inducedEndpoint : 1 - inducedEndpoint;
  return `${assignment.edgeId}\0${globalEndpoint}`;
}

function validateVertexLinks(
  patches: readonly ParsedPatch[],
  cornerUnion: UnionFind,
  sideAssignments: ReadonlyMap<string, SideAssignment>
): number {
  const arcsByVertex = new Map<number, Array<readonly [string, string]>>();
  for (const patch of patches) {
    for (let corner = 0; corner < 4; corner += 1) {
      const root = cornerUnion.find(cornerIndex(patch.index, corner));
      const [leftSide, rightSide] = CORNER_SIDES[corner];
      const leftAssignment = sideAssignments.get(sideKey(patch.patchId, leftSide));
      const rightAssignment = sideAssignments.get(sideKey(patch.patchId, rightSide));
      if (leftAssignment === undefined || rightAssignment === undefined) {
        fail('TOPOLOGY_INVALID', 'Patch corner is missing an incident edge', patch.patchId);
      }
      const arc = Object.freeze([
        edgeEndpointToken(patch.patchId, leftSide, corner, leftAssignment),
        edgeEndpointToken(patch.patchId, rightSide, corner, rightAssignment),
      ]) as readonly [string, string];
      const bucket = arcsByVertex.get(root) ?? [];
      bucket.push(arc);
      arcsByVertex.set(root, bucket);
    }
  }

  for (const [root, arcs] of arcsByVertex) {
    const degree = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();
    for (const [left, right] of arcs) {
      degree.set(left, (degree.get(left) ?? 0) + (left === right ? 2 : 1));
      if (left !== right) degree.set(right, (degree.get(right) ?? 0) + 1);
      const leftNeighbors = adjacency.get(left) ?? new Set<string>();
      leftNeighbors.add(right);
      adjacency.set(left, leftNeighbors);
      const rightNeighbors = adjacency.get(right) ?? new Set<string>();
      rightNeighbors.add(left);
      adjacency.set(right, rightNeighbors);
    }
    if ([...degree.values()].some((value) => value !== 2)) {
      fail('TOPOLOGY_INVALID', `Vertex ${root} link is not degree two`);
    }
    const nodes = [...degree.keys()];
    const visited = new Set<string>();
    const stack = nodes.length === 0 ? [] : [nodes[0]];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const neighbor of adjacency.get(node) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (visited.size !== nodes.length) {
      fail('TOPOLOGY_INVALID', `Vertex ${root} link is disconnected or pinched`);
    }
  }
  return arcsByVertex.size;
}

function deriveTopology(
  patches: readonly ParsedPatch[],
  edges: readonly ParsedEdge[],
  cornerUnion: UnionFind,
  patchUnion: UnionFind,
  sideAssignments: ReadonlyMap<string, SideAssignment>,
  expectedGenus: 0 | 1
): TargetSurfaceComplexTopology {
  const vertexCount = validateVertexLinks(patches, cornerUnion, sideAssignments);
  const componentRoots = new Set(patches.map((patch) => patchUnion.find(patch.index)));
  if (componentRoots.size !== 1) {
    fail('TOPOLOGY_INVALID', 'Target surface complex must have exactly one component');
  }
  const eulerCharacteristic = vertexCount - edges.length + patches.length;
  const genusNumerator = 2 - eulerCharacteristic;
  if (genusNumerator < 0 || genusNumerator % 2 !== 0) {
    fail('TOPOLOGY_INVALID', 'Closed orientable complex has an invalid Euler characteristic');
  }
  const genus = genusNumerator / 2;
  if (genus !== expectedGenus) {
    fail(
      'TOPOLOGY_INVALID',
      `Target genus ${genus} does not match drain-selected genus ${expectedGenus}`
    );
  }
  return Object.freeze({
    componentCount: '1',
    genus: expectedGenus.toString() as '0' | '1',
    abstractOrientable: true,
    abstractClosedTwoManifold: true,
    geometricImageManifoldProven: false,
    eulerCharacteristic: eulerCharacteristic.toString(),
    vertexCount: vertexCount.toString(),
    edgeCount: edges.length.toString(),
    faceCount: patches.length.toString(),
  });
}

const REQUIRED_ROLE_JUNCTIONS_WITHOUT_DRAIN = Object.freeze([
  Object.freeze(['bottom-under', 'outer-wall'] as const),
  Object.freeze(['bottom-top', 'inner-wall'] as const),
  Object.freeze(['inner-wall', 'top-rim'] as const),
  Object.freeze(['outer-wall', 'top-rim'] as const),
]);
const REQUIRED_DRAIN_ROLE_JUNCTIONS = Object.freeze([
  Object.freeze(['bottom-top', 'drain-wall'] as const),
  Object.freeze(['bottom-under', 'drain-wall'] as const),
]);

function rolePairKey(
  left: TargetSurfaceBasePatchRole,
  right: TargetSurfaceBasePatchRole
): string {
  return left < right ? `${left}\0${right}` : `${right}\0${left}`;
}

function validateRoles(
  patches: readonly ParsedPatch[],
  edges: readonly ParsedEdge[],
  features: readonly ParsedFeature[],
  cornerUnion: UnionFind,
  drainPresent: boolean
): Readonly<Record<TargetSurfacePatchRole, number>> {
  const counts = Object.fromEntries([...PATCH_ROLES].map((role) => [role, 0])) as Record<
    TargetSurfacePatchRole,
    number
  >;
  for (const patch of patches) counts[patch.role] += 1;
  for (const role of REQUIRED_BASE_ROLES) {
    if (counts[role] === 0) {
      fail('ROLE_SET_INVALID', `Target surface complex is missing required role ${role}`);
    }
  }
  if ((drainPresent && counts['drain-wall'] === 0) || (!drainPresent && counts['drain-wall'] !== 0)) {
    fail(
      'ROLE_SET_INVALID',
      drainPresent
        ? 'Positive drain radius requires a drain-wall patch'
        : 'Zero drain radius forbids drain-wall patches'
    );
  }

  const patchById = new Map(patches.map((patch) => [patch.patchId, patch]));
  const edgeById = new Map(edges.map((edge) => [edge.edgeId, edge]));
  const hostRoleByClosurePatch = new Map<string, TargetSurfaceBasePatchRole>();
  for (const feature of features) {
    if (!drainPresent && feature.hostRole === 'drain-wall') {
      fail('ROLE_SET_INVALID', 'Zero-drain targets cannot host drain-wall features', feature.featureId);
    }
    for (const patchId of feature.closurePatchIds) {
      hostRoleByClosurePatch.set(patchId, feature.hostRole);
    }
  }
  const effectiveRole = (patchId: string): TargetSurfaceBasePatchRole => {
    const patch = patchById.get(patchId)!;
    if (BASE_PATCH_ROLES.has(patch.role as TargetSurfaceBasePatchRole)) {
      return patch.role as TargetSurfaceBasePatchRole;
    }
    const hostRole = hostRoleByClosurePatch.get(patchId);
    if (hostRole === undefined) {
      fail('ROLE_SET_INVALID', 'Feature closure patch has no effective host role', patchId);
    }
    return hostRole;
  };

  for (const feature of features) {
    for (const edgeId of feature.edgeIds) {
      const edge = edgeById.get(edgeId)!;
      if (!edge.incidents.some((incident) => effectiveRole(incident.patchId) === feature.hostRole)) {
        fail(
          'ROLE_SET_INVALID',
          'Feature edge does not touch its declared host role',
          feature.featureId
        );
      }
    }
  }

  const allowedJunctions = new Set(
    [...REQUIRED_ROLE_JUNCTIONS_WITHOUT_DRAIN, ...REQUIRED_DRAIN_ROLE_JUNCTIONS].map(
      ([left, right]) => rolePairKey(left, right)
    )
  );
  const requiredJunctions = drainPresent
    ? [...REQUIRED_ROLE_JUNCTIONS_WITHOUT_DRAIN, ...REQUIRED_DRAIN_ROLE_JUNCTIONS]
    : [...REQUIRED_ROLE_JUNCTIONS_WITHOUT_DRAIN];
  const observedJunctions = new Set<string>();
  const roleUnion = new UnionFind(patches.length);
  for (const edge of edges) {
    const leftPatch = patchById.get(edge.incidents[0].patchId)!;
    const rightPatch = patchById.get(edge.incidents[1].patchId)!;
    const leftRole = effectiveRole(leftPatch.patchId);
    const rightRole = effectiveRole(rightPatch.patchId);
    if (leftRole === rightRole) {
      roleUnion.union(leftPatch.index, rightPatch.index);
      continue;
    }
    if (edge.semantics === 'periodic-identification') {
      fail('ROLE_SET_INVALID', 'Periodic edges cannot cross target surface roles', edge.edgeId);
    }
    const junction = rolePairKey(leftRole, rightRole);
    if (!allowedJunctions.has(junction)) {
      fail(
        'ROLE_SET_INVALID',
        `Unlisted target-role junction ${leftRole}<->${rightRole}`,
        edge.edgeId
      );
    }
    observedJunctions.add(junction);
  }

  for (const role of BASE_PATCH_ROLES) {
    const rolePatches = patches.filter((patch) => effectiveRole(patch.patchId) === role);
    if (rolePatches.length === 0) continue;
    const roots = new Set(rolePatches.map((patch) => roleUnion.find(patch.index)));
    if (roots.size !== 1) {
      fail('ROLE_SET_INVALID', `Effective role ${role} has disconnected patch components`, role);
    }
  }
  for (const [left, right] of requiredJunctions) {
    if (!observedJunctions.has(rolePairKey(left, right))) {
      fail('ROLE_SET_INVALID', `Required target-role junction ${left}<->${right} is missing`);
    }
  }

  const expectedBoundaryNeighbors = new Map<
    TargetSurfaceBasePatchRole,
    readonly TargetSurfaceBasePatchRole[]
  >([
    ['outer-wall', Object.freeze(['bottom-under', 'top-rim'])],
    ['inner-wall', Object.freeze(['bottom-top', 'top-rim'])],
    ['top-rim', Object.freeze(['inner-wall', 'outer-wall'])],
    [
      'bottom-top',
      Object.freeze(
        drainPresent ? ['drain-wall', 'inner-wall'] : ['inner-wall']
      ) as readonly TargetSurfaceBasePatchRole[],
    ],
    [
      'bottom-under',
      Object.freeze(
        drainPresent ? ['drain-wall', 'outer-wall'] : ['outer-wall']
      ) as readonly TargetSurfaceBasePatchRole[],
    ],
  ]);
  if (drainPresent) {
    expectedBoundaryNeighbors.set(
      'drain-wall',
      Object.freeze(['bottom-top', 'bottom-under'])
    );
  }

  for (const [role, expectedNeighbors] of expectedBoundaryNeighbors) {
    const rolePatches = patches.filter((patch) => effectiveRole(patch.patchId) === role);
    const rolePatchIds = new Set(rolePatches.map((patch) => patch.patchId));
    const roleVertexRoots = new Set<number>();
    for (const patch of rolePatches) {
      for (let corner = 0; corner < 4; corner += 1) {
        roleVertexRoots.add(cornerUnion.find(cornerIndex(patch.index, corner)));
      }
    }
    const roleEdges = edges.filter((edge) =>
      edge.incidents.some((incident) => rolePatchIds.has(incident.patchId))
    );
    const boundaryRecords: Array<
      Readonly<{
        start: number;
        end: number;
        neighborRole: TargetSurfaceBasePatchRole;
      }>
    > = [];
    for (const edge of roleEdges) {
      const incidentRoles = edge.incidents.map((incident) => effectiveRole(incident.patchId));
      if (incidentRoles[0] === incidentRoles[1]) continue;
      let incident: TargetSurfaceEdgeIncidentSummary;
      let neighborRole: TargetSurfaceBasePatchRole;
      if (incidentRoles[0] === role) {
        incident = edge.incidents[0];
        neighborRole = incidentRoles[1];
      } else if (incidentRoles[1] === role) {
        incident = edge.incidents[1];
        neighborRole = incidentRoles[0];
      } else {
        continue;
      }
      const patch = patchById.get(incident.patchId)!;
      const [startCorner, endCorner] = SIDE_CORNERS[incident.side];
      boundaryRecords.push(
        Object.freeze({
          start: cornerUnion.find(cornerIndex(patch.index, startCorner)),
          end: cornerUnion.find(cornerIndex(patch.index, endCorner)),
          neighborRole,
        })
      );
    }
    if (boundaryRecords.length === 0) {
      fail('ROLE_SET_INVALID', `Effective role ${role} has no boundary cycles`, role);
    }
    const boundaryDegree = new Map<number, number>();
    const boundaryAdjacency = new Map<number, Set<number>>();
    for (const boundary of boundaryRecords) {
      boundaryDegree.set(
        boundary.start,
        (boundaryDegree.get(boundary.start) ?? 0) + (boundary.start === boundary.end ? 2 : 1)
      );
      if (boundary.start !== boundary.end) {
        boundaryDegree.set(boundary.end, (boundaryDegree.get(boundary.end) ?? 0) + 1);
      }
      const startNeighbors = boundaryAdjacency.get(boundary.start) ?? new Set<number>();
      startNeighbors.add(boundary.end);
      boundaryAdjacency.set(boundary.start, startNeighbors);
      const endNeighbors = boundaryAdjacency.get(boundary.end) ?? new Set<number>();
      endNeighbors.add(boundary.start);
      boundaryAdjacency.set(boundary.end, endNeighbors);
    }
    if ([...boundaryDegree.values()].some((degree) => degree !== 2)) {
      fail('ROLE_SET_INVALID', `Effective role ${role} boundary is not a union of cycles`, role);
    }
    const unvisited = new Set(boundaryDegree.keys());
    const observedBoundaryNeighbors: TargetSurfaceBasePatchRole[] = [];
    while (unvisited.size > 0) {
      const seed = unvisited.values().next().value as number;
      const componentVertices = new Set<number>();
      const stack = [seed];
      while (stack.length > 0) {
        const vertex = stack.pop()!;
        if (componentVertices.has(vertex)) continue;
        componentVertices.add(vertex);
        unvisited.delete(vertex);
        for (const neighbor of boundaryAdjacency.get(vertex) ?? []) {
          if (!componentVertices.has(neighbor)) stack.push(neighbor);
        }
      }
      const neighborRoles = new Set(
        boundaryRecords
          .filter(
            (boundary) =>
              componentVertices.has(boundary.start) || componentVertices.has(boundary.end)
          )
          .map((boundary) => boundary.neighborRole)
      );
      if (neighborRoles.size !== 1) {
        fail(
          'ROLE_SET_INVALID',
          `Effective role ${role} boundary cycle mixes adjacent roles`,
          role
        );
      }
      observedBoundaryNeighbors.push([...neighborRoles][0]);
    }
    observedBoundaryNeighbors.sort();
    const sortedExpected = [...expectedNeighbors].sort();
    if (
      observedBoundaryNeighbors.length !== sortedExpected.length ||
      observedBoundaryNeighbors.some(
        (neighbor, index) => neighbor !== sortedExpected[index]
      )
    ) {
      fail(
        'ROLE_SET_INVALID',
        `Effective role ${role} has the wrong classified boundary cycles`,
        role
      );
    }
    const eulerCharacteristic = roleVertexRoots.size - roleEdges.length + rolePatches.length;
    const genusNumerator = 2 - observedBoundaryNeighbors.length - eulerCharacteristic;
    if (genusNumerator !== 0) {
      fail('ROLE_SET_INVALID', `Effective role ${role} is not genus zero`, role);
    }
  }
  return Object.freeze(counts);
}

function deriveSurfaceComplex(
  canonicalInput: CanonicalTargetInputBinding,
  canonicalDefinitionJson: unknown
): DerivedSurfaceComplex {
  const inputSnapshot = canonicalTargetInputForProof(canonicalInput);
  const parsed = parseCanonicalCertificationJson(canonicalDefinitionJson);
  if (!parsed.ok) {
    fail('INVALID_INPUT', `Surface-complex definition refused: ${parsed.reason}`);
  }
  const definition = canonicalRecord(parsed.value, 'Surface-complex definition');
  exactKeys(definition, ['edges', 'features', 'patches', 'schemaVersion'], 'Surface-complex definition');
  if (definition.schemaVersion !== TARGET_SURFACE_COMPLEX_DEFINITION_VERSION) {
    fail('INVALID_INPUT', 'Surface-complex definition schemaVersion is unsupported');
  }
  const patches = parsePatches(definition.patches);
  const cornerUnion = new UnionFind(patches.length * 4);
  const patchUnion = new UnionFind(patches.length);
  const sideAssignments = new Map<string, SideAssignment>();
  const edges = parseEdges(
    definition.edges,
    patches,
    cornerUnion,
    patchUnion,
    sideAssignments
  );
  const features = parseFeatures(definition.features, patches, edges);
  const drainPresent = canonicalInput.geometry.geometry.r_drain > 0;
  const topology = deriveTopology(
    patches,
    edges,
    cornerUnion,
    patchUnion,
    sideAssignments,
    drainPresent ? 1 : 0
  );
  const roleCounts = validateRoles(patches, edges, features, cornerUnion, drainPresent);
  const surfaceDefinitionSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.target-surface-complex/definition/v2',
    parsed.value
  );
  const surfaceDefinitionCanonicalJson = canonicalizeCertificationJson(parsed.value);
  const patchSummaries = Object.freeze(
    patches.map(({ patchId, role, declaredEvaluatorProgramSha256 }) =>
      Object.freeze({ patchId, role, declaredEvaluatorProgramSha256 })
    )
  );
  const patchManifestValue = {
    patches: patchSummaries,
    surfaceDefinitionSha256,
  } satisfies CanonicalJsonValue;
  const patchManifestSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.target-surface-complex/patch-manifest/v2',
    patchManifestValue
  );
  const bindingValue = {
    canonicalInputSha256: inputSnapshot.canonicalInputSha256,
    featureCount: features.length.toString(),
    implementationScope: TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE,
    patchManifestSha256,
    proofMethodSha256: TARGET_SURFACE_COMPLEX_PROOF_SHA256,
    roleCounts: Object.fromEntries(
      Object.entries(roleCounts).map(([role, count]) => [role, count.toString()])
    ),
    schemaVersion: TARGET_SURFACE_COMPLEX_BINDING_VERSION,
    surfaceDefinitionSha256,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    topology: { ...topology },
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const targetSurfaceComplexSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.target-surface-complex/binding/v2',
    bindingValue
  );
  return Object.freeze({
    canonicalInputSha256: inputSnapshot.canonicalInputSha256,
    surfaceDefinitionSha256,
    patchManifestSha256,
    targetSurfaceComplexSha256,
    bindingCanonicalJson,
    surfaceDefinitionCanonicalJson,
    patches: patchSummaries,
    edges,
    features,
    topology,
  });
}

/** Mint a runtime-authenticated G0 closed target-surface-complex capability. */
export function createTargetSurfaceComplexBinding(
  canonicalInput: CanonicalTargetInputBinding,
  canonicalDefinitionJson: string
): TargetSurfaceComplexBinding {
  const derived = deriveSurfaceComplex(canonicalInput, canonicalDefinitionJson);
  const binding = Object.freeze({
    schemaVersion: TARGET_SURFACE_COMPLEX_BINDING_VERSION,
    proofMethodSha256: TARGET_SURFACE_COMPLEX_PROOF_SHA256,
    targetSurfaceComplexSha256: derived.targetSurfaceComplexSha256,
    surfaceDefinitionSha256: derived.surfaceDefinitionSha256,
    patchManifestSha256: derived.patchManifestSha256,
    canonicalInputSha256: derived.canonicalInputSha256,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    implementationScope: TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE,
    bindingCanonicalJson: derived.bindingCanonicalJson,
    surfaceDefinitionCanonicalJson: derived.surfaceDefinitionCanonicalJson,
    patches: derived.patches,
    edges: derived.edges,
    features: derived.features,
    topology: derived.topology,
  }) as TargetSurfaceComplexBinding;
  surfaceComplexRegistry.set(
    binding,
    Object.freeze({ binding, canonicalInput, canonicalDefinitionJson })
  );
  return binding;
}

/** Internal proof boundary: structural copies and stale definitions refuse. */
export function targetSurfaceComplexForProof(
  value: TargetSurfaceComplexBinding
): TargetSurfaceComplexBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('BINDING_INVALID', 'Surface-complex binding must be an authenticated capability');
  }
  const registered = surfaceComplexRegistry.get(value);
  if (registered === undefined) {
    fail('BINDING_INVALID', 'Surface-complex binding must be an authenticated capability');
  }
  const derived = deriveSurfaceComplex(
    registered.canonicalInput,
    registered.canonicalDefinitionJson
  );
  const binding = registered.binding;
  if (
    binding !== value ||
    binding.schemaVersion !== TARGET_SURFACE_COMPLEX_BINDING_VERSION ||
    binding.proofMethodSha256 !== TARGET_SURFACE_COMPLEX_PROOF_SHA256 ||
    binding.targetSolidSpecificationSha256 !== TARGET_SOLID_SPECIFICATION_SHA256 ||
    binding.implementationScope !== TARGET_SURFACE_COMPLEX_IMPLEMENTATION_SCOPE ||
    binding.targetSurfaceComplexSha256 !== derived.targetSurfaceComplexSha256 ||
    binding.surfaceDefinitionSha256 !== derived.surfaceDefinitionSha256 ||
    binding.patchManifestSha256 !== derived.patchManifestSha256 ||
    binding.canonicalInputSha256 !== derived.canonicalInputSha256 ||
    binding.bindingCanonicalJson !== derived.bindingCanonicalJson ||
    binding.surfaceDefinitionCanonicalJson !== derived.surfaceDefinitionCanonicalJson ||
    binding.patches.length !== derived.patches.length ||
    binding.patches.some(
      (patch, index) =>
        patch.patchId !== derived.patches[index].patchId ||
        patch.role !== derived.patches[index].role ||
        patch.declaredEvaluatorProgramSha256 !==
          derived.patches[index].declaredEvaluatorProgramSha256
    ) ||
    binding.edges.length !== derived.edges.length ||
    binding.edges.some(
      (edge, index) =>
        canonicalizeCertificationJson(edge as unknown as CanonicalJsonValue) !==
        canonicalizeCertificationJson(derived.edges[index] as unknown as CanonicalJsonValue)
    ) ||
    binding.features.length !== derived.features.length ||
    binding.features.some(
      (feature, index) =>
        canonicalizeCertificationJson(feature as unknown as CanonicalJsonValue) !==
        canonicalizeCertificationJson(derived.features[index] as unknown as CanonicalJsonValue)
    ) ||
    binding.topology.componentCount !== derived.topology.componentCount ||
    binding.topology.abstractOrientable !== derived.topology.abstractOrientable ||
    binding.topology.abstractClosedTwoManifold !== derived.topology.abstractClosedTwoManifold ||
    binding.topology.geometricImageManifoldProven !==
      derived.topology.geometricImageManifoldProven ||
    binding.topology.eulerCharacteristic !== derived.topology.eulerCharacteristic ||
    binding.topology.genus !== derived.topology.genus ||
    binding.topology.vertexCount !== derived.topology.vertexCount ||
    binding.topology.edgeCount !== derived.topology.edgeCount ||
    binding.topology.faceCount !== derived.topology.faceCount
  ) {
    fail('BINDING_INVALID', 'Surface-complex capability fields are inconsistent');
  }
  return binding;
}

/** Authenticated, rederived, deeply immutable structural records for proof consumers. */
export function targetSurfaceComplexSnapshotForProof(
  value: TargetSurfaceComplexBinding
): TargetSurfaceComplexProofSnapshot {
  const binding = targetSurfaceComplexForProof(value);
  return Object.freeze({
    targetSurfaceComplexSha256: binding.targetSurfaceComplexSha256,
    surfaceDefinitionSha256: binding.surfaceDefinitionSha256,
    canonicalInputSha256: binding.canonicalInputSha256,
    targetSolidSpecificationSha256: binding.targetSolidSpecificationSha256,
    implementationScope: binding.implementationScope,
    surfaceDefinitionCanonicalJson: binding.surfaceDefinitionCanonicalJson,
    patches: binding.patches,
    edges: binding.edges,
    features: binding.features,
    topology: binding.topology,
  });
}

/**
 * Derive the geometry-only patch definition consumed by the continuous mapped
 * distance kernel. Full certification must retain and separately require this
 * surface-complex capability because that older geometry schema has no roles,
 * adjacency, features, or topology fields.
 */
export function completeMappedTargetDefinitionJsonForSurfaceComplex(
  value: TargetSurfaceComplexBinding
): string {
  const binding = targetSurfaceComplexForProof(value);
  return canonicalizeCertificationJson({
    patches: binding.patches.map((patch) => ({
      patchId: patch.patchId,
      targetPatchPayload: {
        // The continuous proof later requires a registered evaluator capability
        // whose compiled program matches this declared hash.
        validatedEvaluatorProgramSha256: patch.declaredEvaluatorProgramSha256,
      },
    })),
    schemaVersion: COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION,
    targetPayload: {
      canonicalInputSha256: binding.canonicalInputSha256,
      targetSolidSpecificationSha256: binding.targetSolidSpecificationSha256,
    },
  });
}
