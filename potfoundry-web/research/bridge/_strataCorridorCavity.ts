/**
 * Research-only, immutable feature-corridor cavity transaction.
 *
 * The caller supplies an indexed surface patch, named feature chains and one or
 * more bad triangles. This module grows a complete triangle-ring cavity, freezes
 * its directed boundary, constructs a planar constrained fill in scratch space,
 * and optionally closes residual AR violations with conforming longest-edge
 * bisection. Nothing mutates the caller; a proposal is returned only after the
 * complete final certificate passes.
 */
import { corridorPaveMulti, type ChainAnchor, type FeatureChainInput } from '../../src/fidelity/bandRemesh/corridorPave';
import type { HoleBoundary } from '../../src/fidelity/bandRemesh/seamFill';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { aspect3 } from './_shapeGuard';

export interface CorridorVertex {
  theta: number;
  z: number;
  x: number;
  y: number;
}

export interface CorridorTriangle {
  v: [number, number, number];
}

/** Stable feature identity. Consecutive ids are required mesh-edge obligations. */
export interface CorridorConstraint {
  id: string;
  vertices: number[];
  closed?: boolean;
}

export interface CorridorCavityMesh {
  vertices: readonly CorridorVertex[];
  triangles: readonly CorridorTriangle[];
  constraints: readonly CorridorConstraint[];
}

export interface CorridorCavityOptions {
  rings: number;
  maxParents: number;
  maxNewVertices: number;
  maxLongestEdgeSplits: number;
  rRefMm: number;
  hardAr: number;
  preferredAr: number;
  weldMm: number;
  visualThresholdMm: number;
  minimumVisualGain: number;
  targetEdgeScales: readonly number[];
  /** Optional explicit starting cavity for adaptive-front retries. */
  initialParents?: readonly number[];
}

export interface CorridorCavityCallbacks {
  canonTheta: (theta: number) => number;
  deltaTheta: (from: number, to: number) => number;
  /** Lift a new scratch point. `constraintIds` is non-empty for an on-feature point. */
  lift: (theta: number, z: number, constraintIds: readonly string[]) => CorridorVertex;
  admitted: (a: CorridorVertex, b: CorridorVertex, c: CorridorVertex) => boolean;
  visualError: (a: CorridorVertex, b: CorridorVertex, c: CorridorVertex) => number;
}

export type CorridorRefusal =
  | 'none'
  | 'invalid-seed'
  | 'parent-cap'
  | 'open-boundary'
  | 'feature-on-boundary'
  | 'truncated-feature'
  | 'cdt-failure'
  | 'vertex-cap'
  | 'longest-edge-boundary'
  | 'longest-edge-cap'
  | 'weld'
  | 'missing-constraint'
  | 'proper-crossing'
  | 'boundary-change'
  | 'topology'
  | 'aspect'
  | 'admission'
  | 'visual';

export interface CorridorCertificate {
  boundaryHashBefore: string;
  boundaryHashAfter: string;
  boundaryUnchanged: boolean;
  oldEuler: number;
  newEuler: number;
  nonManifoldEdges: number;
  constraintObligations: number;
  recoveredConstraintObligations: number;
  missingConstraintEdges: number;
  properCrossings: number;
  oldWorstAr: number;
  newWorstAr: number;
  preferredArMet: boolean;
  admissionFailures: number;
  oldWorstVisualMm: number;
  newWorstVisualMm: number;
  oldVisualOver: number;
  newVisualOver: number;
  longestEdgeSplits: number;
  visualLongestEdgeSplits: number;
  maximumInterimAr: number;
  deterministicHash: string;
}

export interface CorridorProposal {
  removeTriangles: number[];
  /** New vertices are assigned ids `mesh.vertices.length + index`. */
  addVertices: CorridorVertex[];
  addTriangles: Array<[number, number, number]>;
  /** Named feature fragments after planarization and any on-feature bisection. */
  featureChains: Array<{ obligationId: string; vertices: number[] }>;
  certificate: CorridorCertificate;
}

export interface CorridorAttempt {
  scale: number;
  accepted: boolean;
  refusal: CorridorRefusal;
  targetEdgeUT?: number;
  existingVertexCount?: number;
  generatedVertexCount?: number;
  certificate?: CorridorCertificate;
  longestEdgeSplits?: number;
  initialCandidateAr?: number;
  maximumInterimAr?: number;
  blockingAr?: number;
  blockingVisualMm?: number;
  blockingEdgeLengthMm?: number;
  blockingTriangle?: {
    vertices: number[];
    chart: Array<[number, number]>;
    vertexKinds: Array<'boundary' | 'feature' | 'steiner' | 'bisection'>;
    featureIdsByEdge: string[][];
  };
  initialBlockingTriangle?: CorridorAttempt['blockingTriangle'];
  boundaryPinches?: Array<{
    vertices: [number, number];
    chart: [[number, number], [number, number]];
  }>;
  initialBlockingBoundaryVertices?: number[];
  terminalBlockingBoundaryVertices?: number[];
}

export interface CorridorCavityResult {
  accepted: boolean;
  refusal: CorridorRefusal;
  selectedParents: number;
  selectedTriangles?: number[];
  attempts: CorridorAttempt[];
  proposal?: CorridorProposal;
}

interface EdgeUse {
  triangles: number[];
  directions: Array<[number, number]>;
}

interface FeatureFragment {
  obligationId: string;
  sourceId: string;
  vertices: number[];
  closed: boolean;
  startBoundary?: number;
  endBoundary?: number;
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

function triangleEdges(v: readonly [number, number, number]): Array<[number, number]> {
  return [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]];
}

function buildEdges(triangles: readonly CorridorTriangle[]): Map<string, EdgeUse> {
  const edges = new Map<string, EdgeUse>();
  for (let triangle = 0; triangle < triangles.length; triangle += 1) {
    for (const direction of triangleEdges(triangles[triangle].v)) {
      const key = edgeKey(direction[0], direction[1]);
      const use = edges.get(key);
      if (use === undefined) edges.set(key, { triangles: [triangle], directions: [direction] });
      else { use.triangles.push(triangle); use.directions.push(direction); }
    }
  }
  return edges;
}

function growRings(
  triangles: readonly CorridorTriangle[],
  edges: ReadonlyMap<string, EdgeUse>,
  seeds: readonly number[],
  rings: number,
  maxParents: number,
): Set<number> | null {
  const selected = new Set(seeds);
  let frontier = [...selected].sort((a, b) => a - b);
  for (let ring = 0; ring < rings; ring += 1) {
    const next = new Set<number>();
    for (const triangle of frontier) {
      for (const [a, b] of triangleEdges(triangles[triangle].v)) {
        for (const neighbour of edges.get(edgeKey(a, b))?.triangles ?? []) {
          if (!selected.has(neighbour)) next.add(neighbour);
        }
      }
    }
    if (selected.size + next.size > maxParents) return null;
    for (const triangle of next) selected.add(triangle);
    frontier = [...next].sort((a, b) => a - b);
  }
  return selected;
}

/**
 * Turn an edge-grown set into a topological cavity: a boundary vertex may have
 * exactly two boundary edges, and no unselected triangle island may be enclosed
 * by the selection. High-valence feature fans otherwise create pinched loops
 * that a polygon CDT cannot interpret as one region.
 */
function regularizeCavity(
  triangles: readonly CorridorTriangle[],
  edges: ReadonlyMap<string, EdgeUse>,
  initial: ReadonlySet<number>,
  maxParents: number,
): Set<number> | null {
  const selected = new Set(initial);
  const incidentByVertex = new Map<number, Set<number>>();
  for (let triangle = 0; triangle < triangles.length; triangle += 1) {
    for (const vertex of triangles[triangle].v) {
      const incident = incidentByVertex.get(vertex);
      if (incident === undefined) incidentByVertex.set(vertex, new Set([triangle]));
      else incident.add(triangle);
    }
  }
  const meshBoundaryTriangles = new Set<number>();
  for (const use of edges.values()) if (use.triangles.length === 1) meshBoundaryTriangles.add(use.triangles[0]);
  for (let pass = 0; pass < 32; pass += 1) {
    const add = new Set<number>();
    const boundaryDegree = new Map<number, number>();
    for (const [key, use] of edges) {
      if (use.triangles.filter((triangle) => selected.has(triangle)).length !== 1) continue;
      const [a, b] = key.split(':').map(Number);
      boundaryDegree.set(a, (boundaryDegree.get(a) ?? 0) + 1);
      boundaryDegree.set(b, (boundaryDegree.get(b) ?? 0) + 1);
    }
    for (const [vertex, degree] of boundaryDegree) {
      if (degree === 2) continue;
      for (const triangle of incidentByVertex.get(vertex) ?? []) if (!selected.has(triangle)) add.add(triangle);
    }
    if (selected.size + add.size > maxParents) return null;
    for (const triangle of add) selected.add(triangle);
    if (add.size > 0) continue;

    // Flood the unselected complement from the cropped mesh's true boundary.
    // Anything not reached is a hole enclosed by the cavity and belongs in it.
    const exterior = new Set<number>();
    const queue = [...meshBoundaryTriangles].filter((triangle) => !selected.has(triangle));
    for (const triangle of queue) exterior.add(triangle);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const triangle = queue[cursor];
      for (const [a, b] of triangleEdges(triangles[triangle].v)) {
        for (const neighbour of edges.get(edgeKey(a, b))?.triangles ?? []) {
          if (selected.has(neighbour) || exterior.has(neighbour)) continue;
          exterior.add(neighbour); queue.push(neighbour);
        }
      }
    }
    for (let triangle = 0; triangle < triangles.length; triangle += 1) {
      if (!selected.has(triangle) && !exterior.has(triangle)) add.add(triangle);
    }
    if (add.size === 0) return selected;
    if (selected.size + add.size > maxParents) return null;
    for (const triangle of add) selected.add(triangle);
  }
  return null;
}

function orderDirectedLoops(directions: readonly (readonly [number, number])[]): number[][] | null {
  const next = new Map<number, number>();
  const indegree = new Map<number, number>();
  for (const [a, b] of directions) {
    if (a === b || next.has(a)) return null;
    next.set(a, b);
    indegree.set(b, (indegree.get(b) ?? 0) + 1);
  }
  if ([...indegree.values()].some((degree) => degree !== 1)) return null;
  const loops: number[][] = [];
  const unseen = new Set(next.keys());
  while (unseen.size > 0) {
    const start = Math.min(...unseen);
    const loop: number[] = [];
    let current = start;
    while (unseen.has(current)) {
      unseen.delete(current);
      loop.push(current);
      const following = next.get(current);
      if (following === undefined) return null;
      current = following;
    }
    if (current !== start || loop.length < 3) return null;
    loops.push(loop);
  }
  return loops.sort((a, b) => a[0] - b[0]);
}

function fnvHash(parts: readonly (string | number)[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function boundaryHash(keys: Iterable<string>): string {
  return fnvHash([...keys].sort());
}

function featureDegree(constraints: readonly CorridorConstraint[]): Map<number, number> {
  const neighbours = new Map<number, Set<number>>();
  const add = (a: number, b: number): void => {
    const set = neighbours.get(a);
    if (set === undefined) neighbours.set(a, new Set([b])); else set.add(b);
  };
  for (const constraint of constraints) {
    const count = constraint.closed === true ? constraint.vertices.length : constraint.vertices.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = constraint.vertices[i];
      const b = constraint.vertices[(i + 1) % constraint.vertices.length];
      add(a, b); add(b, a);
    }
  }
  return new Map([...neighbours].map(([vertex, adjacent]) => [vertex, adjacent.size]));
}

function activeFeatureFragments(
  constraints: readonly CorridorConstraint[],
  selectedEdges: ReadonlySet<string>,
  boundaryEdges: ReadonlySet<string>,
  boundaryVertices: ReadonlySet<number>,
): { fragments: FeatureFragment[]; refusal: CorridorRefusal } {
  const degree = featureDegree(constraints);
  const fragments: FeatureFragment[] = [];
  for (const constraint of constraints) {
    const n = constraint.vertices.length;
    if (n < 2) continue;
    const edgeCount = constraint.closed === true ? n : n - 1;
    const active = new Array<boolean>(edgeCount).fill(false);
    for (let edge = 0; edge < edgeCount; edge += 1) {
      const a = constraint.vertices[edge];
      const b = constraint.vertices[(edge + 1) % n];
      const key = edgeKey(a, b);
      if (!selectedEdges.has(key)) continue;
      // A feature edge on the frozen perimeter is already an exact, named
      // boundary obligation. Do not resample it inside the cavity; its key is
      // covered by the byte-identical boundary certificate instead.
      if (boundaryEdges.has(key)) continue;
      active[edge] = true;
    }
    if (!active.some(Boolean)) continue;
    if (constraint.closed === true && active.every(Boolean)) {
      fragments.push({
        obligationId: `${constraint.id}#0`, sourceId: constraint.id,
        vertices: [...constraint.vertices], closed: true,
      });
      continue;
    }
    let order = [...Array(edgeCount).keys()];
    if (constraint.closed === true) {
      const inactive = active.findIndex((value) => !value);
      order = [...Array(edgeCount).keys()].map((offset) => (inactive + 1 + offset) % edgeCount);
    }
    let run: number[] = [];
    const finish = (): CorridorRefusal | null => {
      if (run.length === 0) return null;
      const firstEdge = run[0];
      const vertices = [constraint.vertices[firstEdge]];
      for (const edge of run) vertices.push(constraint.vertices[(edge + 1) % n]);
      const start = vertices[0];
      const end = vertices[vertices.length - 1];
      const endpointAllowed = (vertex: number): boolean => boundaryVertices.has(vertex)
        || (degree.get(vertex) ?? 0) !== 2;
      if (!endpointAllowed(start) || !endpointAllowed(end)) return 'truncated-feature';
      fragments.push({
        obligationId: `${constraint.id}#${fragments.filter((f) => f.sourceId === constraint.id).length}`,
        sourceId: constraint.id,
        vertices,
        closed: false,
        startBoundary: boundaryVertices.has(start) ? start : undefined,
        endBoundary: boundaryVertices.has(end) ? end : undefined,
      });
      run = [];
      return null;
    };
    for (const edge of order) {
      if (active[edge]) run.push(edge);
      else {
        const refusal = finish();
        if (refusal !== null) return { fragments: [], refusal };
      }
    }
    const refusal = finish();
    if (refusal !== null) return { fragments: [], refusal };
  }
  return { fragments, refusal: 'none' };
}

function properIntersection(
  a: readonly [number, number], b: readonly [number, number],
  c: readonly [number, number], d: readonly [number, number],
): boolean {
  const orient = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): number => (
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  );
  const abC = orient(a, b, c); const abD = orient(a, b, d);
  const cdA = orient(c, d, a); const cdB = orient(c, d, b);
  const eps = 1e-12;
  return abC * abD < -eps && cdA * cdB < -eps;
}

function patchEuler(triangles: readonly (readonly [number, number, number])[]): number {
  const vertices = new Set<number>();
  const edges = new Set<string>();
  for (const triangle of triangles) {
    for (const vertex of triangle) vertices.add(vertex);
    for (const [a, b] of triangleEdges(triangle)) edges.add(edgeKey(a, b));
  }
  return vertices.size - edges.size + triangles.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? 0.5 * (values[middle - 1] + values[middle]) : values[middle];
}

/**
 * Build a bounded scratch proposal. An accepted result is still only a proposal:
 * the integration layer owns the single atomic commit after any wider mesh gates.
 */
export function planAtomicCorridorCavity(
  mesh: CorridorCavityMesh,
  seedTriangles: readonly number[],
  options: CorridorCavityOptions,
  callbacks: CorridorCavityCallbacks,
): CorridorCavityResult {
  if (seedTriangles.length === 0
    || seedTriangles.some((triangle) => triangle < 0 || triangle >= mesh.triangles.length)) {
    return { accepted: false, refusal: 'invalid-seed', selectedParents: 0, attempts: [] };
  }
  const allEdges = buildEdges(mesh.triangles);
  const startingParents = [...new Set([...(options.initialParents ?? []), ...seedTriangles])]
    .sort((a, b) => a - b);
  if (startingParents.some((triangle) => triangle < 0 || triangle >= mesh.triangles.length)) {
    return { accepted: false, refusal: 'invalid-seed', selectedParents: 0, attempts: [] };
  }
  const grown = growRings(mesh.triangles, allEdges, startingParents, options.rings, options.maxParents);
  if (grown === null) {
    return { accepted: false, refusal: 'parent-cap', selectedParents: 0, attempts: [] };
  }
  const selected = regularizeCavity(mesh.triangles, allEdges, grown, options.maxParents);
  if (selected === null) {
    return { accepted: false, refusal: 'parent-cap', selectedParents: grown.size, attempts: [] };
  }
  const selectedEdges = new Set<string>();
  const boundaryDirections: Array<[number, number]> = [];
  const boundaryEdges = new Set<string>();
  const complementDirection = new Map<string, [number, number]>();
  for (const triangle of [...selected].sort((a, b) => a - b)) {
    for (const direction of triangleEdges(mesh.triangles[triangle].v)) {
      const key = edgeKey(direction[0], direction[1]);
      selectedEdges.add(key);
      const use = allEdges.get(key) as EdgeUse;
      const selectedCount = use.triangles.filter((candidate) => selected.has(candidate)).length;
      if (selectedCount !== 1) continue;
      boundaryEdges.add(key);
      boundaryDirections.push(direction);
      const outside = use.triangles.findIndex((candidate) => !selected.has(candidate));
      if (outside >= 0) complementDirection.set(key, use.directions[outside]);
    }
  }
  const boundaryLoopsGlobal = orderDirectedLoops(boundaryDirections);
  if (boundaryLoopsGlobal === null) {
    return {
      accepted: false, refusal: 'open-boundary', selectedParents: selected.size,
      selectedTriangles: [...selected].sort((a, b) => a - b), attempts: [],
    };
  }
  const boundaryVertices = new Set(boundaryLoopsGlobal.flat());
  const fragmentResult = activeFeatureFragments(
    mesh.constraints, selectedEdges, boundaryEdges, boundaryVertices,
  );
  if (fragmentResult.refusal !== 'none') {
    return {
      accepted: false, refusal: fragmentResult.refusal, selectedParents: selected.size,
      selectedTriangles: [...selected].sort((a, b) => a - b), attempts: [],
    };
  }
  const fragments = fragmentResult.fragments;

  // A cavity replacement owns its unconstrained interior vertices: carrying
  // every old point into CDT preserves the very near-boundary needles the
  // transaction is meant to remove. Only the frozen perimeter and named
  // feature/junction vertices retain identity; all other interior sites are
  // regenerated by the paver.
  const participating = new Set<number>(boundaryVertices);
  for (const fragment of fragments) for (const vertex of fragment.vertices) participating.add(vertex);
  const globalOfLocal = [...participating].sort((a, b) => a - b);
  const localOfGlobal = new Map(globalOfLocal.map((global, local) => [global, local]));
  const boundaryLoops = boundaryLoopsGlobal.map((loop) => loop.map((global) => localOfGlobal.get(global) as number));
  const localComplement = new Map<string, [number, number]>();
  for (const direction of complementDirection.values()) {
    const a = localOfGlobal.get(direction[0]); const b = localOfGlobal.get(direction[1]);
    if (a !== undefined && b !== undefined) localComplement.set(edgeKey(a, b), [a, b]);
  }
  const boundary: HoleBoundary = {
    loops: boundaryLoops,
    complementDir: localComplement,
    vertexCount: new Set(boundaryLoops.flat()).size,
  };
  const thetaRef = mesh.vertices[mesh.triangles[seedTriangles[0]].v[0]].theta;
  const vertexUT: Array<[number, number]> = globalOfLocal.map((global) => {
    const vertex = mesh.vertices[global];
    return [options.rRefMm * (thetaRef + callbacks.deltaTheta(thetaRef, vertex.theta)), vertex.z];
  });
  const featureInputs: FeatureChainInput[] = [];
  const anchorFor = (vertex: number, boundaryVertex: number | undefined): ChainAnchor => {
    if (boundaryVertex !== undefined) return { kind: 'snap-boundary' };
    const degree = featureDegree(mesh.constraints).get(vertex) ?? 0;
    return degree > 1 ? { kind: 'junction', junctionKey: `v:${vertex}` } : { kind: 'free-interior' };
  };
  for (const fragment of fragments) {
    featureInputs.push({
      polyline: fragment.vertices.map((global) => {
        const local = localOfGlobal.get(global) as number;
        return { u: vertexUT[local][0], t: vertexUT[local][1] };
      }),
      closed: fragment.closed,
      start: fragment.closed ? undefined : anchorFor(fragment.vertices[0], fragment.startBoundary),
      end: fragment.closed ? undefined : anchorFor(fragment.vertices[fragment.vertices.length - 1], fragment.endBoundary),
    });
  }
  const boundaryLengths = boundaryDirections.map(([a, b]) => {
    const va = mesh.vertices[a]; const vb = mesh.vertices[b];
    return Math.hypot(options.rRefMm * callbacks.deltaTheta(va.theta, vb.theta), vb.z - va.z);
  });
  const baseTarget = median(boundaryLengths);
  if (!(baseTarget > 0)) {
    return {
      accepted: false, refusal: 'open-boundary', selectedParents: selected.size,
      selectedTriangles: [...selected].sort((a, b) => a - b), attempts: [],
    };
  }

  const oldTriangles = [...selected].sort((a, b) => a - b).map((triangle) => mesh.triangles[triangle].v);
  let oldWorstAr = 0; let oldWorstVisual = 0; let oldVisualOver = 0;
  for (const triangle of oldTriangles) {
    const a = mesh.vertices[triangle[0]]; const b = mesh.vertices[triangle[1]]; const c = mesh.vertices[triangle[2]];
    oldWorstAr = Math.max(oldWorstAr, aspect3(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z));
    const visual = callbacks.visualError(a, b, c);
    oldWorstVisual = Math.max(oldWorstVisual, visual);
    if (visual > options.visualThresholdMm) oldVisualOver += 1;
  }
  const beforeHash = boundaryHash(boundaryEdges);
  const oldEuler = patchEuler(oldTriangles);
  const attempts: CorridorAttempt[] = [];
  let best: CorridorProposal | undefined;

  for (const scale of options.targetEdgeScales) {
    let paved: ReturnType<typeof corridorPaveMulti>;
    try {
      const sampler: SurfaceSampler = { position: () => [0, 0, 0] };
      paved = corridorPaveMulti({
        boundary, vertexUT, features: featureInputs, sampler,
        targetEdgeUT: baseTarget * scale,
      });
    } catch {
      attempts.push({ scale, accepted: false, refusal: 'cdt-failure' });
      continue;
    }
    if (paved.unfillablePinches.length > 0) {
      const initialBlockingBoundaryVertices = [...new Set(
        paved.unfillablePinches.flatMap((pinch) => [pinch.a, pinch.b])
          .filter((local) => local < globalOfLocal.length)
          .map((local) => globalOfLocal[local]),
      )].sort((a, b) => a - b);
      attempts.push({
        scale,
        accepted: false,
        refusal: 'boundary-change',
        boundaryPinches: paved.unfillablePinches.map((pinch) => ({
          vertices: [globalOfLocal[pinch.a], globalOfLocal[pinch.b]],
          chart: [paved.vertexUT[pinch.a], paved.vertexUT[pinch.b]],
        })),
        initialBlockingBoundaryVertices,
      });
      continue;
    }
    if (paved.vertexUT.length - paved.existingCount > options.maxNewVertices) {
      attempts.push({ scale, accepted: false, refusal: 'vertex-cap' });
      continue;
    }
    let scratchUT = paved.vertexUT.map((point) => [point[0], point[1]] as [number, number]);
    let scratchTriangles = paved.triangles.map((triangle) => [...triangle] as [number, number, number]);
    let scratchChains = paved.featureChains.map((chain) => [...chain]);
    const idsAtVertex = new Map<number, Set<string>>();
    const addVertexConstraint = (vertex: number, id: string): void => {
      const ids = idsAtVertex.get(vertex);
      if (ids === undefined) idsAtVertex.set(vertex, new Set([id])); else ids.add(id);
    };
    for (let fi = 0; fi < scratchChains.length; fi += 1) {
      for (const vertex of scratchChains[fi]) addVertexConstraint(vertex, fragments[fi].sourceId);
    }
    let scratchVertices: CorridorVertex[] = scratchUT.map((point, local) => {
      if (local < globalOfLocal.length) return { ...mesh.vertices[globalOfLocal[local]] };
      const ids = [...(idsAtVertex.get(local) ?? [])].sort();
      return callbacks.lift(callbacks.canonTheta(point[0] / options.rRefMm), point[1], ids);
    });
    const localBoundary = new Set<string>();
    const localBoundaryVertices = new Set<number>();
    for (const loop of boundary.loops) {
      for (let i = 0; i < loop.length; i += 1) {
        localBoundaryVertices.add(loop[i]);
        localBoundary.add(edgeKey(loop[i], loop[(i + 1) % loop.length]));
      }
    }
    const featureIdsByEdge = (): Map<string, Set<string>> => {
      const out = new Map<string, Set<string>>();
      for (let fi = 0; fi < scratchChains.length; fi += 1) {
        const chain = scratchChains[fi];
        for (let i = 0; i + 1 < chain.length; i += 1) {
          const key = edgeKey(chain[i], chain[i + 1]);
          const ids = out.get(key);
          if (ids === undefined) out.set(key, new Set([fragments[fi].sourceId]));
          else ids.add(fragments[fi].sourceId);
        }
      }
      return out;
    };
    let longestEdgeSplits = 0;
    let visualLongestEdgeSplits = 0;
    let initialCandidateAr = 0;
    let maximumInterimAr = 0;
    let blockingAr = 0;
    let blockingVisualMm = 0;
    let blockingEdgeLengthMm = 0;
    let blockingTriangle: CorridorAttempt['blockingTriangle'];
    let initialBlockingTriangle: CorridorAttempt['blockingTriangle'];
    let initialBlockingBoundaryVertices: number[] | undefined;
    let terminalBlockingBoundaryVertices: number[] | undefined;
    let closureRefusal: CorridorRefusal = 'none';
    while (true) {
      let worst = -1; let worstAr = options.hardAr;
      for (let triangle = 0; triangle < scratchTriangles.length; triangle += 1) {
        const [ia, ib, ic] = scratchTriangles[triangle];
        const a = scratchVertices[ia]; const b = scratchVertices[ib]; const c = scratchVertices[ic];
        const ar = aspect3(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        maximumInterimAr = Math.max(maximumInterimAr, ar);
        if (ar > worstAr) { worstAr = ar; worst = triangle; }
      }
      if (longestEdgeSplits === 0) initialCandidateAr = Math.max(initialCandidateAr, maximumInterimAr);
      let splitForVisual = false;
      if (worst < 0) {
        let worstVisual = options.visualThresholdMm;
        for (let triangle = 0; triangle < scratchTriangles.length; triangle += 1) {
          const [ia, ib, ic] = scratchTriangles[triangle];
          const visual = callbacks.visualError(scratchVertices[ia], scratchVertices[ib], scratchVertices[ic]);
          if (visual > worstVisual) { worstVisual = visual; worst = triangle; }
        }
        if (worst < 0) break;
        const [ia, ib, ic] = scratchTriangles[worst];
        const a = scratchVertices[ia]; const b = scratchVertices[ib]; const c = scratchVertices[ic];
        worstAr = aspect3(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        splitForVisual = true;
      }
      blockingAr = worstAr;
      const worstVertices = scratchTriangles[worst];
      blockingVisualMm = callbacks.visualError(
        scratchVertices[worstVertices[0]],
        scratchVertices[worstVertices[1]],
        scratchVertices[worstVertices[2]],
      );
      const currentFeatureEdges = featureIdsByEdge();
      blockingTriangle = {
        vertices: [...worstVertices],
        chart: worstVertices.map((vertex) => [...scratchUT[vertex]] as [number, number]),
        vertexKinds: worstVertices.map((vertex) => {
          if (localBoundaryVertices.has(vertex)) return 'boundary';
          if ((idsAtVertex.get(vertex)?.size ?? 0) > 0) return 'feature';
          return vertex < paved.vertexUT.length ? 'steiner' : 'bisection';
        }),
        featureIdsByEdge: triangleEdges(worstVertices)
          .map(([a, b]) => [...(currentFeatureEdges.get(edgeKey(a, b)) ?? [])].sort()),
      };
      if (longestEdgeSplits === 0) {
        initialBlockingTriangle = blockingTriangle;
        initialBlockingBoundaryVertices = worstVertices
          .filter((vertex) => localBoundaryVertices.has(vertex) && vertex < globalOfLocal.length)
          .map((vertex) => globalOfLocal[vertex])
          .sort((a, b) => a - b);
      }
      if (longestEdgeSplits >= options.maxLongestEdgeSplits) { closureRefusal = 'longest-edge-cap'; break; }
      const tri = scratchTriangles[worst];
      const candidates = triangleEdges(tri).map(([a, b]) => ({
        a, b, key: edgeKey(a, b),
        length: Math.hypot(
          scratchVertices[b].x - scratchVertices[a].x,
          scratchVertices[b].y - scratchVertices[a].y,
          scratchVertices[b].z - scratchVertices[a].z,
        ),
      })).sort((a, b) => b.length - a.length || a.key.localeCompare(b.key));
      let split: (typeof candidates)[number] | undefined;
      let incident: number[] = [];
      let edgeFeatureIds: string[] = [];
      let u = 0; let z = 0; let point: CorridorVertex | undefined;
      let sawBoundary = false; let sawWeld = false; let sawTopology = false;
      const choices = splitForVisual ? candidates : candidates.slice(0, 1);
      for (const candidate of choices) {
        if (localBoundary.has(candidate.key)) { sawBoundary = true; continue; }
        const candidateIncident: number[] = [];
        for (let triangle = 0; triangle < scratchTriangles.length; triangle += 1) {
          if (scratchTriangles[triangle].includes(candidate.a)
            && scratchTriangles[triangle].includes(candidate.b)) candidateIncident.push(triangle);
        }
        if (candidateIncident.length === 0 || candidateIncident.length > 2) { sawTopology = true; continue; }
        const candidateFeatureIds = [...(currentFeatureEdges.get(candidate.key) ?? [])].sort();
        const va = scratchVertices[candidate.a]; const vb = scratchVertices[candidate.b];
        let lo = 0; let hi = 1;
        for (let iteration = 0; iteration < 32; iteration += 1) {
          const mid = 0.5 * (lo + hi);
          const theta = callbacks.canonTheta(scratchUT[candidate.a][0] / options.rRefMm
            + callbacks.deltaTheta(
              scratchUT[candidate.a][0] / options.rRefMm,
              scratchUT[candidate.b][0] / options.rRefMm,
            ) * mid);
          const candidateZ = scratchUT[candidate.a][1]
            + (scratchUT[candidate.b][1] - scratchUT[candidate.a][1]) * mid;
          const p = callbacks.lift(theta, candidateZ, candidateFeatureIds);
          const da = Math.hypot(p.x - va.x, p.y - va.y, p.z - va.z);
          const db = Math.hypot(vb.x - p.x, vb.y - p.y, vb.z - p.z);
          if (da < db) lo = mid; else hi = mid;
        }
        const fraction = 0.5 * (lo + hi);
        const candidateU = scratchUT[candidate.a][0]
          + (scratchUT[candidate.b][0] - scratchUT[candidate.a][0]) * fraction;
        const candidateZ = scratchUT[candidate.a][1]
          + (scratchUT[candidate.b][1] - scratchUT[candidate.a][1]) * fraction;
        const candidatePoint = callbacks.lift(
          callbacks.canonTheta(candidateU / options.rRefMm), candidateZ, candidateFeatureIds,
        );
        if (Math.hypot(candidatePoint.x - va.x, candidatePoint.y - va.y, candidatePoint.z - va.z) <= options.weldMm
          || Math.hypot(candidatePoint.x - vb.x, candidatePoint.y - vb.y, candidatePoint.z - vb.z) <= options.weldMm) {
          sawWeld = true; continue;
        }
        if (splitForVisual) {
          let childWorstAr = 0; let childWorstVisual = 0;
          for (const triangle of candidateIncident) {
            const current = scratchTriangles[triangle];
            for (let edge = 0; edge < 3; edge += 1) {
              const a = current[edge]; const b = current[(edge + 1) % 3]; const apex = current[(edge + 2) % 3];
              if (edgeKey(a, b) !== candidate.key) continue;
              for (const child of [
                [scratchVertices[a], candidatePoint, scratchVertices[apex]],
                [candidatePoint, scratchVertices[b], scratchVertices[apex]],
              ] as const) {
                childWorstAr = Math.max(childWorstAr, aspect3(
                  child[0].x, child[0].y, child[0].z,
                  child[1].x, child[1].y, child[1].z,
                  child[2].x, child[2].y, child[2].z,
                ));
                childWorstVisual = Math.max(childWorstVisual, callbacks.visualError(child[0], child[1], child[2]));
              }
              break;
            }
          }
          if (childWorstAr > options.hardAr
            || childWorstVisual >= blockingVisualMm - 1e-12) continue;
        }
        split = candidate; incident = candidateIncident; edgeFeatureIds = candidateFeatureIds;
        u = candidateU; z = candidateZ; point = candidatePoint;
        break;
      }
      if (split === undefined || point === undefined) {
        const boundaryCandidate = candidates.find((candidate) => localBoundary.has(candidate.key));
        if (sawBoundary && boundaryCandidate !== undefined) {
          terminalBlockingBoundaryVertices = [boundaryCandidate.a, boundaryCandidate.b]
            .filter((vertex) => vertex < globalOfLocal.length)
            .map((vertex) => globalOfLocal[vertex])
            .sort((a, b) => a - b);
          closureRefusal = 'longest-edge-boundary';
          blockingEdgeLengthMm = boundaryCandidate.length;
        } else if (sawWeld) closureRefusal = 'weld';
        else if (sawTopology) closureRefusal = 'topology';
        else closureRefusal = 'aspect';
        break;
      }
      blockingEdgeLengthMm = split.length;
      const midpoint = scratchVertices.length;
      scratchUT.push([u, z]); scratchVertices.push(point);
      for (const id of edgeFeatureIds) addVertexConstraint(midpoint, id);
      const incidentSet = new Set(incident);
      const nextTriangles: Array<[number, number, number]> = [];
      for (let triangle = 0; triangle < scratchTriangles.length; triangle += 1) {
        const current = scratchTriangles[triangle];
        if (!incidentSet.has(triangle)) { nextTriangles.push(current); continue; }
        for (let edge = 0; edge < 3; edge += 1) {
          const a = current[edge]; const b = current[(edge + 1) % 3]; const apex = current[(edge + 2) % 3];
          if (edgeKey(a, b) !== split.key) continue;
          nextTriangles.push([a, midpoint, apex], [midpoint, b, apex]);
          break;
        }
      }
      scratchTriangles = nextTriangles;
      for (const chain of scratchChains) {
        for (let i = 0; i + 1 < chain.length; i += 1) {
          if (edgeKey(chain[i], chain[i + 1]) !== split.key) continue;
          chain.splice(i + 1, 0, midpoint); i += 1;
        }
      }
      longestEdgeSplits += 1;
      if (splitForVisual) visualLongestEdgeSplits += 1;
      if (scratchVertices.length - globalOfLocal.length > options.maxNewVertices) {
        closureRefusal = 'vertex-cap'; break;
      }
    }
    if (closureRefusal !== 'none') {
      attempts.push({
        scale, accepted: false, refusal: closureRefusal,
        targetEdgeUT: baseTarget * scale,
        existingVertexCount: paved.existingCount,
        generatedVertexCount: paved.vertexUT.length - paved.existingCount,
        longestEdgeSplits, initialCandidateAr, maximumInterimAr, blockingAr, blockingVisualMm,
        blockingEdgeLengthMm,
        blockingTriangle, initialBlockingTriangle,
        initialBlockingBoundaryVertices, terminalBlockingBoundaryVertices,
      });
      continue;
    }

    const scratchEdgeUse = new Map<string, number>();
    for (const triangle of scratchTriangles) for (const [a, b] of triangleEdges(triangle)) {
      const key = edgeKey(a, b); scratchEdgeUse.set(key, (scratchEdgeUse.get(key) ?? 0) + 1);
    }
    let missingConstraintEdges = 0;
    for (const chain of scratchChains) for (let i = 0; i + 1 < chain.length; i += 1) {
      if (!scratchEdgeUse.has(edgeKey(chain[i], chain[i + 1]))) missingConstraintEdges += 1;
    }
    const allCandidateEdges = [...scratchEdgeUse.keys()].map((key) => key.split(':').map(Number) as [number, number]);
    const featureEdges = [...featureIdsByEdge().keys()].map((key) => key.split(':').map(Number) as [number, number]);
    let properCrossings = 0;
    for (const [fa, fb] of featureEdges) for (const [ea, eb] of allCandidateEdges) {
      if (fa === ea || fa === eb || fb === ea || fb === eb || edgeKey(fa, fb) === edgeKey(ea, eb)) continue;
      if (properIntersection(scratchUT[fa], scratchUT[fb], scratchUT[ea], scratchUT[eb])) properCrossings += 1;
    }
    let nonManifoldEdges = 0;
    for (const count of scratchEdgeUse.values()) if (count > 2) nonManifoldEdges += 1;
    const afterBoundary = new Set<string>();
    for (const key of localBoundary) {
      const [a, b] = key.split(':').map(Number);
      afterBoundary.add(edgeKey(globalOfLocal[a], globalOfLocal[b]));
    }
    const afterHash = boundaryHash(afterBoundary);
    const boundaryUnchanged = beforeHash === afterHash
      && [...localBoundary].every((key) => scratchEdgeUse.get(key) === 1);
    let newWorstAr = 0; let admissionFailures = 0; let newWorstVisual = 0; let newVisualOver = 0;
    for (const [ia, ib, ic] of scratchTriangles) {
      const a = scratchVertices[ia]; const b = scratchVertices[ib]; const c = scratchVertices[ic];
      newWorstAr = Math.max(newWorstAr, aspect3(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z));
      if (!callbacks.admitted(a, b, c)) admissionFailures += 1;
      const visual = callbacks.visualError(a, b, c);
      newWorstVisual = Math.max(newWorstVisual, visual);
      if (visual > options.visualThresholdMm) newVisualOver += 1;
    }
    const newEuler = patchEuler(scratchTriangles);
    const localToProposal = (local: number): number => (
      local < globalOfLocal.length ? globalOfLocal[local] : mesh.vertices.length + local - globalOfLocal.length
    );
    const addTriangles = scratchTriangles.map((triangle) => triangle.map(localToProposal) as [number, number, number]);
    const addVertices = scratchVertices.slice(globalOfLocal.length);
    const deterministicHash = fnvHash([
      ...addVertices.flatMap((vertex) => [vertex.x, vertex.y, vertex.z, vertex.theta]),
      ...addTriangles.flat(), ...scratchChains.flat(),
    ]);
    const recovered = fragments.length - Number(missingConstraintEdges > 0);
    const certificate: CorridorCertificate = {
      boundaryHashBefore: beforeHash, boundaryHashAfter: afterHash, boundaryUnchanged,
      oldEuler, newEuler, nonManifoldEdges,
      constraintObligations: fragments.length,
      recoveredConstraintObligations: recovered,
      missingConstraintEdges, properCrossings,
      oldWorstAr, newWorstAr, preferredArMet: newWorstAr <= options.preferredAr,
      admissionFailures,
      oldWorstVisualMm: oldWorstVisual, newWorstVisualMm: newWorstVisual,
      oldVisualOver, newVisualOver,
      longestEdgeSplits, visualLongestEdgeSplits, maximumInterimAr,
      deterministicHash,
    };
    let refusal: CorridorRefusal = 'none';
    if (missingConstraintEdges > 0) refusal = 'missing-constraint';
    else if (properCrossings > 0) refusal = 'proper-crossing';
    else if (!boundaryUnchanged) refusal = 'boundary-change';
    else if (nonManifoldEdges > 0 || newEuler !== oldEuler) refusal = 'topology';
    else if (newWorstAr > options.hardAr) refusal = 'aspect';
    else if (admissionFailures > 0) refusal = 'admission';
    // A partial reduction is not a commit certificate: every replacement
    // facet must meet the same visual budget used to identify the cavity.
    // Otherwise a stable 20-30 um remnant survives inside an "improved" patch.
    else if (newVisualOver > 0) refusal = 'visual';
    const accepted = refusal === 'none';
    attempts.push({ scale, accepted, refusal, certificate });
    if (!accepted) continue;
    const proposal: CorridorProposal = {
      removeTriangles: [...selected].sort((a, b) => a - b),
      addVertices,
      addTriangles,
      featureChains: scratchChains.map((chain, index) => ({
        obligationId: fragments[index].obligationId,
        vertices: chain.map(localToProposal),
      })),
      certificate,
    };
    if (best === undefined
      || Number(proposal.certificate.preferredArMet) > Number(best.certificate.preferredArMet)
      || (proposal.certificate.preferredArMet === best.certificate.preferredArMet
        && proposal.certificate.newWorstVisualMm < best.certificate.newWorstVisualMm)
      || (proposal.certificate.newWorstVisualMm === best.certificate.newWorstVisualMm
        && proposal.certificate.newWorstAr < best.certificate.newWorstAr)) best = proposal;
  }
  if (best !== undefined) {
    return {
      accepted: true, refusal: 'none', selectedParents: selected.size,
      selectedTriangles: [...selected].sort((a, b) => a - b), attempts, proposal: best,
    };
  }
  return {
    accepted: false,
    refusal: attempts.at(-1)?.refusal ?? 'cdt-failure',
    selectedParents: selected.size,
    selectedTriangles: [...selected].sort((a, b) => a - b),
    attempts,
  };
}
