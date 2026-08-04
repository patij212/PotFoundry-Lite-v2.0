/**
 * Artifact-backed probe for a requested S40 Gothic feature-corridor component.
 * Opt in with PF_STRATA_CORRIDOR_CAVITY=1. The source STL is never mutated.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { aspect3 } from './_shapeGuard';
import {
  planAtomicCorridorCavity,
  type CorridorCavityCallbacks,
  type CorridorCavityMesh,
  type CorridorCavityOptions,
  type CorridorConstraint,
  type CorridorTriangle,
  type CorridorVertex,
} from './_strataCorridorCavity';

const RUN = process.env.PF_STRATA_CORRIDOR_CAVITY === '1';
const DISABLE_FEATURES = process.env.PF_STRATA_CORRIDOR_NO_FEATURES === '1';
const FULL_AUDIT = process.env.PF_STRATA_CORRIDOR_FULL_AUDIT !== '0';
const MAX_ADAPTIVE_STEPS = Number.parseInt(process.env.PF_STRATA_CORRIDOR_STEPS ?? '64', 10);
const ONLY_LOCI = new Set((process.env.PF_STRATA_CORRIDOR_ONLY_LOCI ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean));
const TAG = 'gothicarches_ring_DS-HT_S40VFC';
const DEFAULT_TARGET_SOURCE_TRIANGLE = 209529;
const TARGET_SOURCE_TRIANGLE = Number.parseInt(
  process.env.PF_STRATA_CORRIDOR_TARGET ?? String(DEFAULT_TARGET_SOURCE_TRIANGLE),
  10,
);
const HARD_AR = Number.parseFloat(process.env.PF_STRATA_CORRIDOR_HARD_AR ?? '50');
const PREFERRED_AR = Number.parseFloat(
  process.env.PF_STRATA_CORRIDOR_PREFERRED_AR ?? String(Math.min(45, HARD_AR * 0.9)),
);
const AR_SUFFIX = HARD_AR === 50 ? '' : `.ar-${String(HARD_AR).replace('.', '_')}`;
const TARGET_SUFFIX = TARGET_SOURCE_TRIANGLE === DEFAULT_TARGET_SOURCE_TRIANGLE
  ? AR_SUFFIX
  : `.target-${TARGET_SOURCE_TRIANGLE}${AR_SUFFIX}`;
const TWO_PI = 2 * Math.PI;
const R_REF = 45;
const LOCAL_RADIUS_MM = Number.parseFloat(process.env.PF_STRATA_CORRIDOR_RADIUS_MM ?? '1.5');
const FEATURE_VERTEX_TOL_MM = Number.parseFloat(process.env.PF_STRATA_CORRIDOR_FEATURE_VERTEX_UM ?? '2') / 1000;
const FEATURE_EDGE_TOL_MM = Number.parseFloat(process.env.PF_STRATA_CORRIDOR_FEATURE_EDGE_UM ?? '4') / 1000;

interface LocusArtifact {
  run: {
    style: string;
    params: Record<string, number>;
    dims: { H: number; Rb: number; Rt: number; expn: number };
  };
  loci: Array<{ id: number; pts: Array<[number, number]>; closed?: boolean }>;
}

interface ChartSegment {
  locusId: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function canonTheta(theta: number): number {
  let value = theta % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
}

function deltaTheta(from: number, to: number): number {
  let value = to - from;
  while (value > Math.PI) value -= TWO_PI;
  while (value < -Math.PI) value += TWO_PI;
  return value;
}

function centroid(xyz: Float64Array, triangle: number): [number, number, number] {
  const offset = triangle * 9;
  return [
    (xyz[offset] + xyz[offset + 3] + xyz[offset + 6]) / 3,
    (xyz[offset + 1] + xyz[offset + 4] + xyz[offset + 7]) / 3,
    (xyz[offset + 2] + xyz[offset + 5] + xyz[offset + 8]) / 3,
  ];
}

function vertexKey(x: number, y: number, z: number): string {
  return `${x}|${y}|${z}`;
}

function readErrorSidecar(path: string): Float32Array {
  const buffer = readFileSync(path);
  const newline = buffer.indexOf(10);
  if (newline < 0 || (buffer.length - newline - 1) % 4 !== 0) throw new Error(`invalid error sidecar ${path}`);
  const bytes = Uint8Array.from(buffer.subarray(newline + 1));
  return new Float32Array(bytes.buffer);
}

function readStl(path: string): { xyz: Float64Array; nTri: number } {
  const buffer = readFileSync(path);
  if (buffer.length < 84) throw new Error(`STL too short: ${path}`);
  const nTri = buffer.readUInt32LE(80);
  if (buffer.length !== 84 + nTri * 50) throw new Error(`STL size mismatch: ${path}`);
  const xyz = new Float64Array(nTri * 9);
  let offset = 84;
  for (let triangle = 0; triangle < nTri; triangle += 1) {
    offset += 12;
    for (let coordinate = 0; coordinate < 9; coordinate += 1) {
      xyz[triangle * 9 + coordinate] = buffer.readFloatLE(offset);
      offset += 4;
    }
    offset += 2;
  }
  return { xyz, nTri };
}

function pointSegmentDistance(
  x: number, y: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax; const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const parameter = length2 <= 1e-24 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
  return Math.hypot(x - ax - parameter * dx, y - ay - parameter * dy);
}

function localMesh(
  xyz: Float64Array,
  nTri: number,
): { mesh: CorridorCavityMesh; sourceTriangles: number[]; seeds: number[]; thetaRef: number } {
  const target = centroid(xyz, TARGET_SOURCE_TRIANGLE);
  const thetaRef = canonTheta(Math.atan2(target[1], target[0]));
  const vertices: CorridorVertex[] = [];
  const triangles: CorridorTriangle[] = [];
  const sourceTriangles: number[] = [];
  const ids = new Map<string, number>();
  const addVertex = (x: number, y: number, z: number): number => {
    const key = vertexKey(x, y, z);
    const prior = ids.get(key);
    if (prior !== undefined) return prior;
    const id = vertices.length;
    ids.set(key, id);
    vertices.push({ x, y, z, theta: canonTheta(Math.atan2(y, x)) });
    return id;
  };
  for (let triangle = 0; triangle < nTri; triangle += 1) {
    const c = centroid(xyz, triangle);
    if (Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2]) > LOCAL_RADIUS_MM) continue;
    const offset = triangle * 9;
    triangles.push({ v: [
      addVertex(xyz[offset], xyz[offset + 1], xyz[offset + 2]),
      addVertex(xyz[offset + 3], xyz[offset + 4], xyz[offset + 5]),
      addVertex(xyz[offset + 6], xyz[offset + 7], xyz[offset + 8]),
    ] });
    sourceTriangles.push(triangle);
  }
  const localTarget = sourceTriangles.indexOf(TARGET_SOURCE_TRIANGLE);
  if (localTarget < 0) throw new Error(`target triangle ${TARGET_SOURCE_TRIANGLE} missing from local crop`);
  return {
    mesh: { vertices, triangles, constraints: [] },
    sourceTriangles,
    seeds: [localTarget],
    thetaRef,
  };
}

function localLocusSegments(artifact: LocusArtifact, thetaRef: number, vertices: readonly CorridorVertex[]): ChartSegment[] {
  const chartX = vertices.map((vertex) => R_REF * (thetaRef + deltaTheta(thetaRef, vertex.theta)));
  const minX = Math.min(...chartX) - 0.1; const maxX = Math.max(...chartX) + 0.1;
  const minZ = Math.min(...vertices.map((vertex) => vertex.z)) - 0.1;
  const maxZ = Math.max(...vertices.map((vertex) => vertex.z)) + 0.1;
  const segments: ChartSegment[] = [];
  for (const locus of artifact.loci) {
    const count = locus.closed === true ? locus.pts.length : locus.pts.length - 1;
    for (let index = 0; index < count; index += 1) {
      const a = locus.pts[index]; const b = locus.pts[(index + 1) % locus.pts.length];
      const aTheta = thetaRef + deltaTheta(thetaRef, a[0]);
      // Keep each source segment coherent across the chart branch. Unwrapping b
      // independently around thetaRef turns a short segment crossing the
      // antipodal cut into a false ~2*pi chord through this local crop.
      const bTheta = aTheta + deltaTheta(a[0], b[0]);
      const ax = R_REF * aTheta;
      const bx = R_REF * bTheta;
      if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX
        || Math.max(a[1], b[1]) < minZ || Math.min(a[1], b[1]) > maxZ) continue;
      segments.push({ locusId: locus.id, ax, ay: a[1], bx, by: b[1] });
    }
  }
  return segments;
}

describe('Gothic corridor chart reconstruction', () => {
  it('keeps antipodal source segments coherent instead of creating a false 2*pi chord', () => {
    const artifact: LocusArtifact = {
      run: { style: 'GothicArches', params: {}, dims: { H: 1, Rb: 1, Rt: 1, expn: 1 } },
      loci: [{ id: 1, pts: [[Math.PI - 0.01, 0], [Math.PI + 0.01, 0]] }],
    };
    const nearReference: CorridorVertex[] = [
      { theta: 0, z: 0, x: 1, y: 0 },
      { theta: 0.01, z: 0.01, x: 1, y: 0 },
    ];
    expect(localLocusSegments(artifact, 0, nearReference)).toHaveLength(0);

    const nearAntipode: CorridorVertex[] = [
      { theta: Math.PI - 0.02, z: 0, x: -1, y: 0 },
      { theta: Math.PI - 0.005, z: 0.01, x: -1, y: 0 },
    ];
    const [segment] = localLocusSegments(artifact, 0, nearAntipode);
    expect(segment).toBeDefined();
    expect(Math.abs(segment.bx - segment.ax)).toBeCloseTo(R_REF * 0.02, 10);
  });
});

function extractConstraints(
  mesh: CorridorCavityMesh,
  thetaRef: number,
  segments: readonly ChartSegment[],
): CorridorConstraint[] {
  const chart = mesh.vertices.map((vertex) => [
    R_REF * (thetaRef + deltaTheta(thetaRef, vertex.theta)), vertex.z,
  ] as const);
  const lociAtVertex: Array<Set<number>> = chart.map(([x, z]) => {
    const found = new Set<number>();
    for (const segment of segments) {
      if (pointSegmentDistance(x, z, segment.ax, segment.ay, segment.bx, segment.by) <= FEATURE_VERTEX_TOL_MM) {
        found.add(segment.locusId);
      }
    }
    return found;
  });
  const edgesByLocus = new Map<number, Set<string>>();
  for (const triangle of mesh.triangles) {
    for (const [a, b] of [
      [triangle.v[0], triangle.v[1]], [triangle.v[1], triangle.v[2]], [triangle.v[2], triangle.v[0]],
    ] as const) {
      const shared = [...lociAtVertex[a]].filter((locus) => lociAtVertex[b].has(locus));
      if (shared.length === 0) continue;
      const mx = 0.5 * (chart[a][0] + chart[b][0]); const mz = 0.5 * (chart[a][1] + chart[b][1]);
      for (const locus of shared) {
        const close = segments.some((segment) => segment.locusId === locus
          && pointSegmentDistance(mx, mz, segment.ax, segment.ay, segment.bx, segment.by) <= FEATURE_EDGE_TOL_MM);
        if (!close) continue;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const edges = edgesByLocus.get(locus);
        if (edges === undefined) edgesByLocus.set(locus, new Set([key])); else edges.add(key);
      }
    }
  }
  const constraints: CorridorConstraint[] = [];
  for (const [locus, edgeSet] of [...edgesByLocus].sort((a, b) => a[0] - b[0])) {
    const adjacent = new Map<number, number[]>();
    for (const key of edgeSet) {
      const [a, b] = key.split(':').map(Number);
      const aa = adjacent.get(a); if (aa === undefined) adjacent.set(a, [b]); else aa.push(b);
      const bb = adjacent.get(b); if (bb === undefined) adjacent.set(b, [a]); else bb.push(a);
    }
    for (const neighbours of adjacent.values()) neighbours.sort((a, b) => a - b);
    const unused = new Set(edgeSet);
    const walk = (start: number, first: number): number[] => {
      const chain = [start];
      let previous = start; let current = first;
      unused.delete(start < first ? `${start}:${first}` : `${first}:${start}`);
      while (true) {
        chain.push(current);
        const candidates = (adjacent.get(current) ?? []).filter((next) => next !== previous
          && unused.has(current < next ? `${current}:${next}` : `${next}:${current}`));
        if (candidates.length === 0 || (adjacent.get(current)?.length ?? 0) !== 2) break;
        const next = candidates[0];
        unused.delete(current < next ? `${current}:${next}` : `${next}:${current}`);
        previous = current; current = next;
      }
      return chain;
    };
    const starts = [...adjacent].filter(([, neighbours]) => neighbours.length !== 2)
      .map(([vertex]) => vertex).sort((a, b) => a - b);
    for (const start of starts) for (const next of adjacent.get(start) ?? []) {
      const key = start < next ? `${start}:${next}` : `${next}:${start}`;
      if (!unused.has(key)) continue;
      constraints.push({ id: `locus:${locus}:${constraints.length}`, vertices: walk(start, next) });
    }
    while (unused.size > 0) {
      const key = [...unused].sort()[0];
      const [start, next] = key.split(':').map(Number);
      const vertices = walk(start, next);
      if (vertices.at(-1) === start) vertices.pop();
      constraints.push({ id: `locus:${locus}:${constraints.length}`, vertices, closed: true });
    }
  }
  return constraints.filter((constraint) => constraint.vertices.length >= 2);
}

function pointError(
  radius: (theta: number, z: number) => number,
  x: number, y: number, z: number,
): number {
  const theta = canonTheta(Math.atan2(y, x));
  const radial = Math.hypot(x, y);
  if (radial < 1e-6) return 0;
  const epsilon = 1e-6;
  const rm = radius(theta - epsilon, z); const rp = radius(theta + epsilon, z); const centre = radius(theta, z);
  if (Math.abs(rp - rm) > 0.05) return Math.min(Math.abs(radial - rm), Math.abs(radial - rp), Math.abs(radial - centre));
  const dz = 0.002; const dt = 2e-5;
  const rz = (radius(theta, z + dz) - radius(theta, z - dz)) / (2 * dz);
  const rt = (radius(theta + dt, z) - radius(theta - dt, z)) / (2 * dt);
  return Math.abs(radial - centre) / Math.sqrt(1 + rz * rz + (rt / radial) * (rt / radial));
}

function triangleVisual(
  radius: (theta: number, z: number) => number,
  a: CorridorVertex, b: CorridorVertex, c: CorridorVertex,
): number {
  const f = Math.fround;
  const points = [a, b, c].map((point) => [f(point.x), f(point.y), f(point.z)] as const);
  const samples: Array<readonly [number, number, number]> = [[
    (points[0][0] + points[1][0] + points[2][0]) / 3,
    (points[0][1] + points[1][1] + points[2][1]) / 3,
    (points[0][2] + points[1][2] + points[2][2]) / 3,
  ]];
  for (let index = 0; index < 3; index += 1) {
    const p = points[index]; const q = points[(index + 1) % 3];
    samples.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
  }
  return Math.max(...samples.map((sample) => pointError(radius, sample[0], sample[1], sample[2])));
}

function outwardSign(a: CorridorVertex, b: CorridorVertex, c: CorridorVertex): number {
  const abx = b.x - a.x; const aby = b.y - a.y; const abz = b.z - a.z;
  const acx = c.x - a.x; const acy = c.y - a.y; const acz = c.z - a.z;
  const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz;
  return Math.sign(nx * (a.x + b.x + c.x) + ny * (a.y + b.y + c.y));
}

function writeCandidateStl(
  path: string,
  xyz: Float64Array,
  nTri: number,
  mesh: CorridorCavityMesh,
  sourceTriangles: readonly number[],
  proposal: NonNullable<ReturnType<typeof planAtomicCorridorCavity>['proposal']>,
): void {
  const removed = new Set(proposal.removeTriangles.map((triangle) => sourceTriangles[triangle]));
  const candidateVertices = [...mesh.vertices, ...proposal.addVertices];
  const count = nTri - removed.size + proposal.addTriangles.length;
  const buffer = Buffer.allocUnsafe(84 + count * 50).fill(0);
  buffer.write('PotFoundry Strata S41 atomic corridor cavity', 0, 'ascii');
  buffer.writeUInt32LE(count, 80);
  let offset = 84;
  const writeTriangle = (points: readonly CorridorVertex[]): void => {
    const a = points[0]; const b = points[1]; const c = points[2];
    const abx = b.x - a.x; const aby = b.y - a.y; const abz = b.z - a.z;
    const acx = c.x - a.x; const acy = c.y - a.y; const acz = c.z - a.z;
    let nx = aby * acz - abz * acy; let ny = abz * acx - abx * acz; let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const value of [nx, ny, nz, ...points.flatMap((point) => [point.x, point.y, point.z])]) {
      buffer.writeFloatLE(value, offset); offset += 4;
    }
    buffer.writeUInt16LE(0, offset); offset += 2;
  };
  for (let triangle = 0; triangle < nTri; triangle += 1) {
    if (removed.has(triangle)) continue;
    const source = triangle * 9;
    writeTriangle([
      { x: xyz[source], y: xyz[source + 1], z: xyz[source + 2], theta: 0 },
      { x: xyz[source + 3], y: xyz[source + 4], z: xyz[source + 5], theta: 0 },
      { x: xyz[source + 6], y: xyz[source + 7], z: xyz[source + 8], theta: 0 },
    ]);
  }
  for (const triangle of proposal.addTriangles) writeTriangle(triangle.map((vertex) => candidateVertices[vertex]));
  if (offset !== buffer.length) throw new Error(`candidate STL size mismatch: wrote ${offset}, allocated ${buffer.length}`);
  writeFileSync(path, buffer);
}

function errorSummary(errors: Float32Array): Record<string, number> {
  const sorted = Float32Array.from(errors).sort();
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  const summary: Record<string, number> = {
    triangles: errors.length,
    p50Um: at(0.5) * 1000,
    p99Um: at(0.99) * 1000,
    p999Um: at(0.999) * 1000,
    maxUm: (sorted.at(-1) ?? 0) * 1000,
  };
  for (const thresholdUm of [10, 20, 30, 50, 75, 100, 125, 150]) {
    let count = 0;
    const threshold = thresholdUm / 1000;
    for (const error of errors) if (error > threshold) count += 1;
    summary[`over${thresholdUm}Um`] = count;
  }
  return summary;
}

interface TopologyAudit {
  nonManifold: number;
  boundary: number;
  orientMismatch: number;
  boundaryLoops: number;
  seamCrack: number;
  weldedDegenerate: number;
  overAr50: number;
  worstAr: number;
}

function topologyAudit(xyz: Float64Array, nTri: number, weldMm = 0.00005): TopologyAudit {
  const cells = new Map<string, number[]>();
  const positions: Array<[number, number, number]> = [];
  const grid = (value: number): number => Math.floor(value / weldMm);
  const vertexId = (x: number, y: number, z: number): number => {
    const cx = grid(x); const cy = grid(y); const cz = grid(z);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      const bucket = cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (bucket === undefined) continue;
      for (const candidate of bucket) {
        const point = positions[candidate];
        if (Math.hypot(point[0] - x, point[1] - y, point[2] - z) <= weldMm) return candidate;
      }
    }
    const id = positions.length;
    positions.push([x, y, z]);
    const key = `${cx},${cy},${cz}`;
    const bucket = cells.get(key);
    if (bucket === undefined) cells.set(key, [id]); else bucket.push(id);
    return id;
  };
  const edgeUse = new Map<number, number>();
  const keyBase = 1 << 25; const directionUnit = 65536;
  const bump = (a: number, b: number): void => {
    const key = a < b ? a * keyBase + b : b * keyBase + a;
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1 + (a < b ? directionUnit : 0));
  };
  let weldedDegenerate = 0; let overAr50 = 0; let worstAr = 0;
  for (let triangle = 0; triangle < nTri; triangle += 1) {
    const offset = triangle * 9;
    const ia = vertexId(xyz[offset], xyz[offset + 1], xyz[offset + 2]);
    const ib = vertexId(xyz[offset + 3], xyz[offset + 4], xyz[offset + 5]);
    const ic = vertexId(xyz[offset + 6], xyz[offset + 7], xyz[offset + 8]);
    if (ia === ib || ib === ic || ic === ia) weldedDegenerate += 1;
    bump(ia, ib); bump(ib, ic); bump(ic, ia);
    const ar = aspect3(
      xyz[offset], xyz[offset + 1], xyz[offset + 2],
      xyz[offset + 3], xyz[offset + 4], xyz[offset + 5],
      xyz[offset + 6], xyz[offset + 7], xyz[offset + 8],
    );
    worstAr = Math.max(worstAr, ar);
    if (ar > 50) overAr50 += 1;
  }
  let nonManifold = 0; let boundary = 0; let orientMismatch = 0;
  const boundaryAdjacent = new Map<number, number[]>();
  for (const [key, packed] of edgeUse) {
    const count = packed % directionUnit; const forward = (packed - count) / directionUnit;
    if (count === 2) { if (forward !== 1) orientMismatch += 1; continue; }
    if (count > 2) { nonManifold += 1; continue; }
    boundary += 1;
    const a = Math.floor(key / keyBase); const b = key % keyBase;
    const aa = boundaryAdjacent.get(a); if (aa === undefined) boundaryAdjacent.set(a, [b]); else aa.push(b);
    const bb = boundaryAdjacent.get(b); if (bb === undefined) boundaryAdjacent.set(b, [a]); else bb.push(a);
  }
  const seen = new Set<number>(); const loops: number[][] = [];
  for (const start of boundaryAdjacent.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = []; let current = start; let previous = -1;
    for (let guard = boundaryAdjacent.size + 5; guard > 0; guard -= 1) {
      loop.push(current); seen.add(current);
      const next = (boundaryAdjacent.get(current) ?? [])
        .find((candidate) => candidate !== previous && (!seen.has(candidate) || candidate === start));
      if (next === undefined || next === start) break;
      previous = current; current = next;
    }
    if (loop.length > 2) loops.push(loop);
  }
  let seamCrack = 0;
  for (const loop of loops) {
    const meanZ = loop.reduce((sum, vertex) => sum + positions[vertex][2], 0) / loop.length;
    if (meanZ > 0.001 && meanZ < 119.999) seamCrack += loop.length;
  }
  return {
    nonManifold, boundary, orientMismatch, boundaryLoops: loops.length,
    seamCrack, weldedDegenerate, overAr50, worstAr,
  };
}

describe.runIf(RUN)('S40 Gothic atomic corridor cavity', () => {
  it('builds a certified cavity around the requested source triangle without mutating the source mesh', () => {
    const exchange = resolve('research', 'exchange', '_strataConformBisect');
    const stlPath = join(exchange, `${TAG}.stl`);
    const lociPath = join(exchange, `${TAG}.loci.json`);
    const errors = readErrorSidecar(`${stlPath}.error.bin`);
    const { xyz, nTri } = readStl(stlPath);
    expect(errors.length).toBe(nTri);
    const artifact = JSON.parse(readFileSync(lociPath, 'utf8')) as LocusArtifact;
    const { mesh: withoutConstraints, sourceTriangles, seeds, thetaRef } = localMesh(xyz, nTri);
    const segments = localLocusSegments(artifact, thetaRef, withoutConstraints.vertices);
    const extractedConstraints = DISABLE_FEATURES ? [] : extractConstraints(withoutConstraints, thetaRef, segments);
    const constraints = ONLY_LOCI.size === 0
      ? extractedConstraints
      : extractedConstraints.filter((constraint) => ONLY_LOCI.has(constraint.id.split(':')[1]));
    const mesh: CorridorCavityMesh = { ...withoutConstraints, constraints };
    const radius = buildAuditRadiusFn(artifact.run.style, artifact.run.params, artifact.run.dims, artifact.run.dims.H).rA;
    const first = mesh.triangles[seeds[0]].v.map((vertex) => mesh.vertices[vertex]) as [CorridorVertex, CorridorVertex, CorridorVertex];
    const expectedOutward = outwardSign(first[0], first[1], first[2]);
    const callbacks: CorridorCavityCallbacks = {
      canonTheta,
      deltaTheta,
      lift: (theta, z) => {
        const r = radius(theta, z);
        return { theta: canonTheta(theta), z, x: r * Math.cos(theta), y: r * Math.sin(theta) };
      },
      admitted: (a, b, c) => outwardSign(a, b, c) === expectedOutward,
      visualError: (a, b, c) => triangleVisual(radius, a, b, c),
    };
    const options: CorridorCavityOptions = {
      rings: 2,
      maxParents: 4096,
      maxNewVertices: 16384,
      maxLongestEdgeSplits: 4096,
      rRefMm: R_REF,
      hardAr: HARD_AR,
      preferredAr: PREFERRED_AR,
      weldMm: 0.00005,
      visualThresholdMm: 0.01,
      minimumVisualGain: 0.01,
      targetEdgeScales: [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 1.1, 1.25],
    };
    const before = JSON.stringify(mesh);
    const ringResults = [2, 3, 4, 5, 6, 8].map((rings) => ({
      rings,
      result: planAtomicCorridorCavity(mesh, seeds, { ...options, rings }, callbacks),
    }));
    const incidentByVertex = new Map<number, number[]>();
    for (let triangle = 0; triangle < mesh.triangles.length; triangle += 1) {
      for (const vertex of mesh.triangles[triangle].v) {
        const incident = incidentByVertex.get(vertex);
        if (incident === undefined) incidentByVertex.set(vertex, [triangle]); else incident.push(triangle);
      }
    }
    const adaptiveResults: Array<{ step: number; addedParents: number; result: ReturnType<typeof planAtomicCorridorCavity> }> = [];
    let adaptiveParents: number[] | undefined;
    for (let step = 0; step < MAX_ADAPTIVE_STEPS; step += 1) {
      const adaptive = planAtomicCorridorCavity(mesh, seeds, {
        ...options,
        rings: step === 0 ? 2 : 0,
        initialParents: adaptiveParents,
      }, callbacks);
      const selected = new Set(adaptive.selectedTriangles ?? adaptiveParents ?? []);
      if (adaptive.accepted) {
        adaptiveResults.push({ step, addedParents: 0, result: adaptive });
        break;
      }
      const boundaryVertices = adaptive.attempts.find((attempt) => (
        (attempt.initialBlockingBoundaryVertices?.length ?? 0) > 0
      ))?.initialBlockingBoundaryVertices ?? [];
      if (adaptive.refusal === 'longest-edge-boundary' && boundaryVertices.length === 2) {
        const [a, b] = boundaryVertices;
        const across = new Set(incidentByVertex.get(a) ?? []);
        for (const triangle of incidentByVertex.get(b) ?? []) if (across.has(triangle)) selected.add(triangle);
      } else {
        for (const vertex of boundaryVertices) {
          for (const triangle of incidentByVertex.get(vertex) ?? []) selected.add(triangle);
        }
      }
      const priorSize = adaptive.selectedTriangles?.length ?? adaptiveParents?.length ?? 0;
      const addedParents = selected.size - priorSize;
      adaptiveResults.push({ step, addedParents, result: adaptive });
      if (addedParents <= 0 || selected.size > options.maxParents) break;
      adaptiveParents = [...selected].sort((a, b) => a - b);
    }
    const accepted = adaptiveResults.find((entry) => entry.result.accepted)
      ?? ringResults.find((entry) => entry.result.accepted);
    const result = accepted?.result ?? adaptiveResults.at(-1)?.result ?? ringResults.at(-1)?.result;
    if (result === undefined) throw new Error('corridor ring ladder produced no result');
    if (TARGET_SOURCE_TRIANGLE === 1100000) {
      const initialRetry = adaptiveResults[0]?.result.attempts.find(
        (attempt) => attempt.refusal === 'longest-edge-boundary',
      );
      expect(initialRetry?.initialBlockingBoundaryVertices).toHaveLength(3);
      expect(initialRetry?.terminalBlockingBoundaryVertices).toHaveLength(2);
      expect(initialRetry?.initialBlockingBoundaryVertices)
        .not.toEqual(initialRetry?.terminalBlockingBoundaryVertices);
    }
    expect(JSON.stringify(mesh)).toBe(before);
    const selectedEdges = new Set<string>();
    for (const triangle of result.selectedTriangles ?? []) {
      const [a, b, c] = mesh.triangles[triangle].v;
      for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
        selectedEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
      }
    }
    const activeConstraintIds = constraints.filter((constraint) => {
      const edgeCount = constraint.closed === true ? constraint.vertices.length : constraint.vertices.length - 1;
      for (let edge = 0; edge < edgeCount; edge += 1) {
        const a = constraint.vertices[edge]; const b = constraint.vertices[(edge + 1) % constraint.vertices.length];
        if (selectedEdges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) return true;
      }
      return false;
    }).map((constraint) => constraint.id);

    const report = {
      tag: TAG,
      targetSourceTriangle: TARGET_SOURCE_TRIANGLE,
      hardAr: HARD_AR,
      preferredAr: PREFERRED_AR,
      sourceErrorUm: errors[TARGET_SOURCE_TRIANGLE] * 1000,
      localTriangles: mesh.triangles.length,
      localVertices: mesh.vertices.length,
      segmentLocusCounts: Object.fromEntries([...new Set(segments.map((segment) => segment.locusId))]
        .sort((a, b) => a - b)
        .map((locus) => [locus, segments.filter((segment) => segment.locusId === locus).length])),
      detectedConstraintChains: constraints.length,
      detectedConstraintEdges: constraints.reduce((sum, constraint) => (
        sum + constraint.vertices.length - (constraint.closed === true ? 0 : 1)
      ), 0),
      activeConstraintIds,
      activeConstraintGeometry: constraints.filter((constraint) => activeConstraintIds.includes(constraint.id))
        .map((constraint) => ({
          id: constraint.id,
          vertices: constraint.vertices.map((vertex) => ({
            vertex,
            theta: mesh.vertices[vertex].theta,
            z: mesh.vertices[vertex].z,
          })),
        })),
      seeds: seeds.map((seed) => ({ local: seed, source: sourceTriangles[seed], errorUm: errors[sourceTriangles[seed]] * 1000 })),
      ringResults,
      adaptiveResults,
      result,
    };
    const outDir = resolve('research', 'exchange', '_strataCorridorCavity');
    mkdirSync(outDir, { recursive: true });
    if (result.proposal !== undefined) {
      const removed = new Set(result.proposal.removeTriangles.map((triangle) => sourceTriangles[triangle]));
      const candidateVertices = [...mesh.vertices, ...result.proposal.addVertices];
      const afterErrors = new Float32Array(nTri - removed.size + result.proposal.addTriangles.length);
      let cursor = 0;
      for (let triangle = 0; triangle < nTri; triangle += 1) {
        if (!removed.has(triangle)) { afterErrors[cursor] = errors[triangle]; cursor += 1; }
      }
      for (const triangle of result.proposal.addTriangles) {
        afterErrors[cursor] = triangleVisual(
          radius,
          candidateVertices[triangle[0]],
          candidateVertices[triangle[1]],
          candidateVertices[triangle[2]],
        );
        cursor += 1;
      }
      if (cursor !== afterErrors.length) throw new Error('candidate error sidecar count mismatch');
      const candidateTag = TARGET_SOURCE_TRIANGLE === DEFAULT_TARGET_SOURCE_TRIANGLE
        ? 'gothicarches_ring_DS-HT_S41ACC'
        : `gothicarches_ring_DS-HT_S41ACC-t${TARGET_SOURCE_TRIANGLE}`;
      const candidateStl = join(outDir, `${candidateTag}${AR_SUFFIX}.stl`);
      writeCandidateStl(candidateStl, xyz, nTri, mesh, sourceTriangles, result.proposal);
      const sourceTopology = FULL_AUDIT ? topologyAudit(xyz, nTri) : undefined;
      const candidateMesh = readStl(candidateStl);
      const topology = FULL_AUDIT ? topologyAudit(candidateMesh.xyz, candidateMesh.nTri) : undefined;
      const header = {
        magic: 'potscope-error/v1',
        style: 'GothicArches',
        variant: 'mesh-to-surface-local-atomic-replacement',
        count: afterErrors.length,
        unitsMm: true,
        semantics: 'S40 sidecar retained outside cavity; replacement scored over {centroid,3 edge midpoints}',
        budgetMm: 0.01,
        stats: errorSummary(afterErrors),
      };
      const headerBytes = Buffer.from(`${JSON.stringify(header)}\n`, 'utf8');
      const errorBytes = Buffer.from(afterErrors.buffer, afterErrors.byteOffset, afterErrors.byteLength);
      writeFileSync(`${candidateStl}.error.bin`, Buffer.concat([headerBytes, errorBytes]));
      Object.assign(report, {
        candidateTag,
        candidateStl,
        sourceTopology,
        topology,
        beforeGlobalError: errorSummary(errors),
        afterGlobalError: errorSummary(afterErrors),
      });
      writeFileSync(join(outDir, `${TAG}.worst-component${TARGET_SUFFIX}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      if (sourceTopology !== undefined && topology !== undefined) {
        expect(sourceTopology.nonManifold).toBe(0);
        expect(sourceTopology.orientMismatch).toBe(0);
        expect(topology.nonManifold).toBe(0);
        expect(topology.orientMismatch).toBe(0);
        expect(topology.seamCrack).toBe(0);
        expect(topology.weldedDegenerate).toBe(0);
        expect(topology.boundaryLoops).toBe(2);
        expect(topology.overAr50).toBeLessThanOrEqual(sourceTopology.overAr50);
      }
    }
    if (result.proposal === undefined) {
      writeFileSync(join(outDir, `${TAG}.worst-component${TARGET_SUFFIX}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    expect(result.selectedParents).toBeGreaterThan(0);
    expect(result.attempts.length).toBeGreaterThan(0);
    expect(result.accepted).toBe(true);
    expect(result.proposal?.certificate.boundaryUnchanged).toBe(true);
    expect(result.proposal?.certificate.missingConstraintEdges).toBe(0);
    expect(result.proposal?.certificate.properCrossings).toBe(0);
    expect(result.proposal?.certificate.newWorstAr).toBeLessThanOrEqual(50);
    expect(result.proposal?.certificate.admissionFailures).toBe(0);
  }, 600_000);
});
