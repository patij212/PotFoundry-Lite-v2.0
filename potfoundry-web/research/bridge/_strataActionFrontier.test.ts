/**
 * Research-only shadow audit for the stable Strata S24i2 Gothic H2 motif.
 *
 * PF_STRATA_FRONTIER=1 runs the artifact-backed audit and writes a deterministic
 * JSON/text report. The default test run exercises only the pure geometry core.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { makeSagArgmax } from './_sagKernel';
import { signedAreaParam } from './_shapeGuard';
import { canonTheta, dThRaw, type SweepPredConst } from './_sweepPredicate';
import {
  auditDriverFrontier,
  chordPlacement,
  dryPlanRedGreen,
  enumerateProtectorActions,
  executeProtectorAction,
  frontierEdgeKey,
  incidentTriangles,
  sampledMinimaxPlacement,
  scoreEdgePlacement,
  type FrontierEdge,
  type FrontierMesh,
  type FrontierOptions,
  type FrontierTriangle,
  type FrontierVertex,
  type ProtectorAction,
} from './_strataActionFrontier';
import { arOf, driverAcceptQuantity, edgeLen, type Tri } from './_strataMicroLib';

const RUN = process.env.PF_STRATA_FRONTIER === '1';
const TWO_PI = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DEFAULT_NUDGE = [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72, 0.21, 0.79, 0.15, 0.85] as const;

function envF(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envI(name: string, fallback: number): number {
  return Math.round(envF(name, fallback));
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function registryDefaults(id: string): Record<string, number> {
  const config = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const group of [config?.params, config?.advancedParams]) {
    if (group === undefined) continue;
    for (const [key, value] of Object.entries(group)) {
      if (typeof value.default === 'number') out[snakeToCamel(key)] = value.default;
    }
  }
  return out;
}

function vertexKey(x: number, y: number, z: number): string {
  return `${x}|${y}|${z}`;
}

function triFromStl(xyz: Float64Array, tri: number): Tri {
  const o = tri * 9;
  const th0 = canonTheta(Math.atan2(xyz[o + 1], xyz[o]));
  const th1 = canonTheta(Math.atan2(xyz[o + 4], xyz[o + 3]));
  const th2 = canonTheta(Math.atan2(xyz[o + 7], xyz[o + 6]));
  return {
    x: [xyz[o], xyz[o + 3], xyz[o + 6]],
    y: [xyz[o + 1], xyz[o + 4], xyz[o + 7]],
    z: [xyz[o + 2], xyz[o + 5], xyz[o + 8]],
    th: [th0, th0 + dThRaw(th0, th1), th0 + dThRaw(th0, th2)],
  };
}

function centroidOf(xyz: Float64Array, tri: number): { x: number; y: number; z: number; th: number } {
  const o = tri * 9;
  const x = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
  const y = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
  const z = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
  return { x, y, z, th: canonTheta(Math.atan2(y, x)) };
}

function sortedEdges(tri: Tri): number[] {
  return [edgeLen(tri, 0), edgeLen(tri, 1), edgeLen(tri, 2)].sort((a, b) => a - b);
}

function maximumEdgeLength(xyz: Float64Array, nTri: number): number {
  let maximum = 0;
  for (let tri = 0; tri < nTri; tri += 1) {
    const o = tri * 9;
    maximum = Math.max(
      maximum,
      Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]),
      Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]),
      Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]),
    );
  }
  return maximum;
}

function pointTriangleDistance(
  point: readonly [number, number, number],
  xyz: Float64Array,
  tri: number,
): number {
  const o = tri * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const apx = point[0] - ax; const apy = point[1] - ay; const apz = point[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = point[0] - bx; const bpy = point[1] - by; const bpz = point[2] - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - abx * v, apy - aby * v, apz - abz * v);
  }
  const cpx = point[0] - cx; const cpy = point[1] - cy; const cpz = point[2] - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - acx * w, apy - acy * w, apz - acz * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    return Math.hypot(
      bpx - (cx - bx) * w,
      bpy - (cy - by) * w,
      bpz - (cz - bz) * w,
    );
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return Math.hypot(
    apx - abx * v - acx * w,
    apy - aby * v - acy * w,
    apz - abz * v - acz * w,
  );
}

interface QuarterTurnCarrier {
  sourceTri: number;
  witnessTheta: number;
  witnessZ: number;
  witnessDistanceMm: number;
  distanceCandidates: number;
}

function findQuarterTurnCarriers(
  xyz: Float64Array,
  nTri: number,
  R: (th: number, z: number) => number,
  targetTri: number,
  witnessTheta: number,
  witnessZ: number,
): QuarterTurnCarrier[] {
  const copies: QuarterTurnCarrier[] = [];
  const maximumEdge = maximumEdgeLength(xyz, nTri);
  for (let turn = 0; turn < 4; turn += 1) {
    const th = canonTheta(witnessTheta + turn * Math.PI / 2);
    const radius = R(th, witnessZ);
    const point = [radius * Math.cos(th), radius * Math.sin(th), witnessZ] as const;
    let bestTri = -1;
    let best = Infinity;
    let distanceCandidates = 0;
    for (let tri = 0; tri < nTri; tri += 1) {
      const o = tri * 9;
      const firstVertexDistance = Math.hypot(
        point[0] - xyz[o],
        point[1] - xyz[o + 1],
        point[2] - xyz[o + 2],
      );
      if (firstVertexDistance - maximumEdge > best) continue;
      distanceCandidates += 1;
      const distance = pointTriangleDistance(point, xyz, tri);
      if (distance < best) { best = distance; bestTri = tri; }
    }
    if (bestTri < 0 || best > 0.1) {
      throw new Error(`quarter-turn carrier ${turn} not found: best tri ${bestTri}, distance ${best}`);
    }
    copies.push({ sourceTri: bestTri, witnessTheta: th, witnessZ, witnessDistanceMm: best, distanceCandidates });
  }
  if (copies[0].sourceTri !== targetTri) {
    throw new Error(
      `configured target ${targetTri} is not the turn-0 H2 carrier; nearest is ${copies[0].sourceTri}`,
    );
  }
  return copies;
}

function extractLocalMesh(
  xyz: Float64Array,
  nTri: number,
  targetTri: number,
  radiusMm: number,
): { mesh: FrontierMesh; target: number } {
  const center = centroidOf(xyz, targetTri);
  const vertices: FrontierVertex[] = [];
  const triangles: FrontierTriangle[] = [];
  const ids = new Map<string, number>();
  let target = -1;
  const addVertex = (x: number, y: number, z: number): number => {
    const key = vertexKey(x, y, z);
    const prior = ids.get(key);
    if (prior !== undefined) return prior;
    const id = vertices.length;
    ids.set(key, id);
    vertices.push({ x, y, z, th: canonTheta(Math.atan2(y, x)) });
    return id;
  };
  for (let tri = 0; tri < nTri; tri += 1) {
    const c = centroidOf(xyz, tri);
    if (Math.hypot(c.x - center.x, c.y - center.y, c.z - center.z) > radiusMm) continue;
    const o = tri * 9;
    const ids3: [number, number, number] = [
      addVertex(xyz[o], xyz[o + 1], xyz[o + 2]),
      addVertex(xyz[o + 3], xyz[o + 4], xyz[o + 5]),
      addVertex(xyz[o + 6], xyz[o + 7], xyz[o + 8]),
    ];
    const rootSign = Math.sign(signedAreaParam(
      vertices[ids3[0]].th,
      vertices[ids3[0]].z,
      vertices[ids3[1]].th,
      vertices[ids3[1]].z,
      vertices[ids3[2]].th,
      vertices[ids3[2]].z,
    ));
    if (tri === targetTri) target = triangles.length;
    triangles.push({ v: ids3, sourceTri: tri, rootSign });
  }
  if (target < 0) throw new Error(`target triangle ${targetTri} missing from local patch`);
  const mesh = { vertices, triangles };
  for (const [a, b] of [
    [triangles[target].v[0], triangles[target].v[1]],
    [triangles[target].v[1], triangles[target].v[2]],
    [triangles[target].v[2], triangles[target].v[0]],
  ] as Array<[number, number]>) {
    const count = incidentTriangles(mesh, a, b).length;
    if (count !== 2) throw new Error(`target edge ${a}:${b} has ${count} local incidents, expected 2`);
  }
  return { mesh, target };
}

function closestTargetEdge(
  mesh: FrontierMesh,
  targetTriangle: number,
  point: readonly [number, number, number],
): { edgeIndex: number; edge: FrontierEdge; chordFraction: number; distanceMm: number } {
  const target = mesh.triangles[targetTriangle];
  const edges: FrontierEdge[] = [
    [target.v[0], target.v[1]],
    [target.v[1], target.v[2]],
    [target.v[2], target.v[0]],
  ];
  let best = { edgeIndex: -1, edge: edges[0], chordFraction: 0, distanceMm: Infinity };
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const a = mesh.vertices[edge[0]];
    const b = mesh.vertices[edge[1]];
    const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
    const dd = dx * dx + dy * dy + dz * dz;
    const raw = dd > 0
      ? ((point[0] - a.x) * dx + (point[1] - a.y) * dy + (point[2] - a.z) * dz) / dd
      : 0;
    const chordFraction = Math.max(0, Math.min(1, raw));
    const distanceMm = Math.hypot(
      point[0] - (a.x + chordFraction * dx),
      point[1] - (a.y + chordFraction * dy),
      point[2] - (a.z + chordFraction * dz),
    );
    if (distanceMm < best.distanceMm) best = { edgeIndex, edge, chordFraction, distanceMm };
  }
  return best;
}

function frontierMeshDistance(
  point: readonly [number, number, number],
  mesh: FrontierMesh,
): number {
  const scratch = new Float64Array(9);
  let best = Infinity;
  for (const triangle of mesh.triangles) {
    for (let i = 0; i < 3; i += 1) {
      const vertex = mesh.vertices[triangle.v[i]];
      scratch[i * 3] = vertex.x;
      scratch[i * 3 + 1] = vertex.y;
      scratch[i * 3 + 2] = vertex.z;
    }
    best = Math.min(best, pointTriangleDistance(point, scratch, 0));
  }
  return best;
}

function makeOptions(predicate: SweepPredConst): FrontierOptions {
  return {
    arCap: envF('PF_STRATA_FRONTIER_AR_CAP', 50),
    arGuard: envF('PF_STRATA_FRONTIER_AR_GUARD', 8),
    floorMm: envF('PF_STRATA_FRONTIER_FLOOR_UM', 1.5) / 1000,
    weldMm: envF('PF_STRATA_FRONTIER_WELD_UM', 0.05) / 1000,
    snapAlpha: envF('PF_STRATA_FRONTIER_SNAP_ALPHA', 0.12),
    mid3dIters: envI('PF_STRATA_FRONTIER_MID3D_ITERS', 24),
    mid3dMaxShift: envF('PF_STRATA_FRONTIER_MID3D_MAXSHIFT', 0.25),
    nudgeFractions: DEFAULT_NUDGE,
    shippedNormal: process.env.PF_STRATA_FRONTIER_SHIPPED_NORMAL !== '0',
    predicate,
  };
}

function summaryAction(action: ProtectorAction | undefined): string {
  if (action === undefined) return 'none';
  return `edge ${action.firstEdge.join(':')} s=${action.firstParameter.toFixed(8)}`
    + ` finalAR=${action.final.worstAr.toFixed(3)} legal=${String(action.legal)}`;
}

describe('Strata placement/action frontier', () => {
  it('scores both sides of a shared edge and rejects an endpoint needle', () => {
    const R = (): number => 10;
    const vertex = (th: number, z: number): FrontierVertex => ({
      x: 10 * Math.cos(th), y: 10 * Math.sin(th), z, th,
    });
    const vertices = [vertex(0, 0), vertex(0.02, 0), vertex(0.01, 0.1), vertex(0.01, -0.1)];
    const mesh: FrontierMesh = {
      vertices,
      triangles: [
        { v: [0, 1, 2], sourceTri: 0, rootSign: 1 },
        { v: [1, 0, 3], sourceTri: 1, rootSign: 1 },
      ],
    };
    const predicate: SweepPredConst = {
      esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
      kinkRatio: 0.15, jumpRatio: 0.62, snap: false, confMm: 0.0006,
    };
    const options = { ...makeOptions(predicate), shippedNormal: false, weldMm: 1e-9 };
    const middle = scoreEdgePlacement(R, mesh, [0, 1], 0.5, options);
    const endpoint = scoreEdgePlacement(R, mesh, [0, 1], 0.005, options);
    expect(middle.incidentCount).toBe(2);
    expect(middle.children).toHaveLength(4);
    expect(middle.legal).toBe(true);
    expect(endpoint.legal).toBe(false);
    expect(endpoint.reasons).toContain('aspect');
    const red = dryPlanRedGreen(R, mesh, [0, 1], options, 0, 8);
    expect(red).toHaveLength(1);
    expect(red[0].plan.redParents).toBe(2);
    expect(red[0].plan.greenParents).toBe(0);
    expect(red[0].plan.topology.eulerDelta).toBe(0);
    expect(red[0].plan.targetRecovered).toBe(true);
    expect(red[0].plan.legal).toBe(true);
  });

  it.runIf(RUN)('reconstructs the S24 motif and exhausts its shadow action frontier', () => {
    const stlPath = process.env.PF_STRATA_FRONTIER_STL
      ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.stl';
    const outDir = process.env.PF_STRATA_FRONTIER_OUT
      ?? join('research', 'exchange', '_strataActionFrontier');
    const tag = process.env.PF_STRATA_FRONTIER_TAG ?? 'S24i2';
    const targetTri = envI('PF_STRATA_FRONTIER_TRI', 135048);
    const witnessTheta = envF('PF_STRATA_FRONTIER_WITNESS_THETA', 1.358340);
    const witnessZ = envF('PF_STRATA_FRONTIER_WITNESS_Z', 76.21094);
    const localRadius = envF('PF_STRATA_FRONTIER_RADIUS_MM', 3);
    const acceptTol = envF('PF_STRATA_FRONTIER_ACCEPT_UM', 3.5) / 1000;
    const predicate: SweepPredConst = {
      esN: envI('PF_STRATA_FRONTIER_ESN', 8),
      refHs: envF('PF_STRATA_FRONTIER_REF_HS_MM', 0.03),
      refNmax: envI('PF_STRATA_FRONTIER_REF_NMAX', 64),
      kinkScan: envI('PF_STRATA_FRONTIER_KINK_SCAN', 16),
      kinkHalvings: envI('PF_STRATA_FRONTIER_KINK_HALVINGS', 24),
      kinkRatio: envF('PF_STRATA_FRONTIER_KINK_RATIO', 0.15),
      jumpRatio: envF('PF_STRATA_FRONTIER_JUMP_RATIO', 0.62),
      snap: process.env.PF_STRATA_FRONTIER_SNAP !== '0',
      confMm: envF('PF_STRATA_FRONTIER_CONF_UM', 0.6) / 1000,
    };
    const options = makeOptions(predicate);
    const styleParams = registryDefaults('GothicArches');
    const R = buildAuditRadiusFn('GothicArches', styleParams, DIMS, H).rA;
    const { xyz, nTri } = readMeshFloat64(stlPath, false);
    const copies = findQuarterTurnCarriers(xyz, nTri, R, targetTri, witnessTheta, witnessZ);
    const arg = makeSagArgmax();
    const report: {
      schema: string;
      source: string;
      targetTri: number;
      copies: Array<Record<string, unknown>>;
      targetReproduced: boolean;
      controlsStable: boolean;
      decision: string;
    } = {
      schema: 'strata-action-frontier-v1',
      source: stlPath,
      targetTri,
      copies: [],
      targetReproduced: false,
      controlsStable: true,
      decision: 'unclassified',
    };
    const lines: string[] = [
      '===== STRATA S24 ACTION FRONTIER — SHADOW ONLY =====',
      `source ${stlPath} (${nTri} facets)`,
      `target ${targetTri}; quarter-turn H2 carriers ${copies.map((copy) => copy.sourceTri).join(', ')}`,
      `AR cap ${options.arCap}; SNAP_ALPHA ${options.snapAlpha}; local radius ${localRadius} mm`,
      '',
    ];
    let anyLegalProtector = false;
    let anyLegalRedGreen = false;
    let targetReproduced = false;
    let controlsStable = true;
    for (let turn = 0; turn < copies.length; turn += 1) {
      const carrier = copies[turn];
      const sourceTri = carrier.sourceTri;
      const tri = triFromStl(xyz, sourceTri);
      const local = extractLocalMesh(xyz, nTri, sourceTri, localRadius);
      const driver = auditDriverFrontier(R, local.mesh, local.target, options);
      const acceptMm = driverAcceptQuantity(R, tri, predicate.refHs, 12, predicate.refNmax, arg);
      const target = local.mesh.triangles[local.target];
      const edges: Array<[number, number]> = [
        [target.v[0], target.v[1]], [target.v[1], target.v[2]], [target.v[2], target.v[0]],
      ];
      const minimax = edges.map((edge) => sampledMinimaxPlacement(R, local.mesh, edge, options));
      const snapAttempts = driver.attempts.filter((attempt) => attempt.kind === 'snap');
      const radius = R(carrier.witnessTheta, carrier.witnessZ);
      const witnessPoint = [
        radius * Math.cos(carrier.witnessTheta),
        radius * Math.sin(carrier.witnessTheta),
        carrier.witnessZ,
      ] as const;
      const projection = closestTargetEdge(local.mesh, local.target, witnessPoint);
      const projectionA = local.mesh.vertices[projection.edge[0]];
      const projectionB = local.mesh.vertices[projection.edge[1]];
      const projectionParameter = chordPlacement(
        R,
        projectionA,
        projectionB,
        projection.chordFraction,
        options.mid3dIters,
        options.mid3dMaxShift,
      );
      const targetCandidates = new Map<string, { parameter: number; source: string }>();
      const addTargetCandidate = (parameter: number, source: string): void => {
        const key = parameter.toPrecision(15);
        if (!targetCandidates.has(key)) targetCandidates.set(key, { parameter, source });
      };
      addTargetCandidate(projectionParameter, 'H2 chord projection');
      addTargetCandidate(minimax[projection.edgeIndex].parameter, 'sampled AR minimax');
      for (const attempt of driver.attempts) {
        if (attempt.parameter === null
          || frontierEdgeKey(attempt.edge[0], attempt.edge[1]) !== frontierEdgeKey(projection.edge[0], projection.edge[1])) continue;
        addTargetCandidate(attempt.parameter, `${attempt.kind}:${attempt.requestedFraction}`);
      }
      const protector: Array<{
        targetSource: string;
        action: ProtectorAction;
        gapAfterUm: number | null;
      }> = [];
      if (turn === 0) {
        for (const candidate of targetCandidates.values()) {
          const actions = enumerateProtectorActions(
            R,
            local.mesh,
            projection.edge,
            candidate.parameter,
            options,
          );
          for (const action of actions) {
            let gapAfterUm: number | null = null;
            if (action.legal) {
              const execution = executeProtectorAction(
                R,
                local.mesh,
                projection.edge,
                candidate.parameter,
                action.firstEdge,
                action.firstParameter,
                options,
              );
              if (execution !== null) gapAfterUm = frontierMeshDistance(witnessPoint, execution.mesh) * 1000;
            }
            protector.push({ targetSource: candidate.source, action, gapAfterUm });
          }
        }
        protector.sort((a, b) => Number(b.action.legal) - Number(a.action.legal)
          || (a.gapAfterUm ?? Infinity) - (b.gapAfterUm ?? Infinity)
          || a.action.final.worstAr - b.action.final.worstAr);
      }
      const best = protector[0];
      const redGreen = turn === 0 && !protector.some((entry) => entry.action.legal)
        ? dryPlanRedGreen(R, local.mesh, projection.edge, options, 2, 64).map((execution) => ({
          plan: execution.plan,
          gapAfterUm: frontierMeshDistance(witnessPoint, execution.mesh) * 1000,
        }))
        : [];
      redGreen.sort((a, b) => Number(b.plan.legal) - Number(a.plan.legal)
        || a.gapAfterUm - b.gapAfterUm
        || a.plan.score.worstAr - b.plan.score.worstAr);
      const bestRedGreen = redGreen[0];
      const finalAttempt = driver.attempts.at(-1);
      const normalBlocked = driver.attempts.filter((attempt) => attempt.score?.reasons.includes('normal') === true).length;
      const aspectBlocked = driver.attempts.filter((attempt) => attempt.score?.reasons.includes('aspect') === true).length;
      const reproduced = driver.selected === null
        && driver.attempts.length === DEFAULT_NUDGE.length * 3
        && driver.attempts.every((attempt) => attempt.kind === 'nudge')
        && normalBlocked === driver.attempts.length
        && finalAttempt?.score?.primaryRejection === 'aspect';
      const stableControl = driver.selected !== null && carrier.witnessDistanceMm <= 0.01;
      if (turn === 0) targetReproduced = reproduced;
      else controlsStable = controlsStable && stableControl;
      anyLegalProtector = anyLegalProtector || protector.some((entry) => entry.action.legal);
      anyLegalRedGreen = anyLegalRedGreen || redGreen.some((entry) => entry.plan.legal
        && entry.gapAfterUm < carrier.witnessDistanceMm * 1000);
      const center = centroidOf(xyz, sourceTri);
      const copyReport = {
        turn,
        sourceTri,
        witness: carrier,
        centroid: center,
        edgesUm: sortedEdges(tri).map((value) => value * 1000),
        ar: arOf(tri),
        acceptUm: acceptMm * 1000,
        classification: acceptMm <= acceptTol ? 'accepted-blind' : 'wants-split',
        reproducedDriverRefusal: turn === 0 ? reproduced : null,
        stableControl: turn === 0 ? null : stableControl,
        normalBlockedAttempts: normalBlocked,
        aspectBlockedAttempts: aspectBlocked,
        driver,
        minimax,
        h2ClosestEdge: projection,
        targetCandidateCount: targetCandidates.size,
        protectorActionCount: protector.length,
        legalProtectorCount: protector.filter((entry) => entry.action.legal).length,
        bestProtector: best,
        protector,
        redGreen,
        bestRedGreen,
      };
      report.copies.push(copyReport);
      lines.push(`COPY ${turn} tri ${sourceTri} theta=${center.th.toFixed(8)} z=${center.z.toFixed(6)}`);
      lines.push(`  H2 witness theta=${carrier.witnessTheta.toFixed(8)} z=${carrier.witnessZ.toFixed(6)}`
        + ` gap=${(carrier.witnessDistanceMm * 1000).toFixed(4)} um; exact-distance candidates=${carrier.distanceCandidates}`);
      lines.push(`  edges ${sortedEdges(tri).map((value) => (value * 1000).toFixed(3)).join('/')}`
        + ` um  AR=${arOf(tri).toFixed(4)}  accept=${(acceptMm * 1000).toFixed(4)} um`);
      lines.push(`  driver edge order ${driver.edgeOrder.join(',')}  attempts=${driver.attempts.length}`
        + `  selected=${driver.selected === null ? 'NONE' : `${driver.selected.kind}@${driver.selected.parameter?.toFixed(8)}`}`);
      lines.push(`  blocked normal=${normalBlocked}, aspect=${aspectBlocked}; final primary=`
        + `${finalAttempt?.score?.primaryRejection ?? 'none'}; target reproduced=${String(turn === 0 && reproduced)}`);
      lines.push(`  sampled edge minima AR=`
        + minimax.map((entry) => entry.score.worstAr.toFixed(3)).join('/'));
      lines.push(`  H2 closest edge ${projection.edge.join(':')} chord=${projection.chordFraction.toFixed(8)}`
        + ` distance=${(projection.distanceMm * 1000).toFixed(4)} um; target placements=${targetCandidates.size}`);
      lines.push(`  protector candidates=${protector.length}, legal=${protector.filter((entry) => entry.action.legal).length};`
        + ` best ${summaryAction(best?.action)} gapAfter=${best?.gapAfterUm?.toFixed(4) ?? 'n/a'} um`);
      lines.push(`  RED/green plans=${redGreen.length}, legal=${redGreen.filter((entry) => entry.plan.legal).length};`
        + ` best rings=${bestRedGreen?.plan.rings ?? 'n/a'} parents=`
        + `${bestRedGreen === undefined ? 'n/a' : `${bestRedGreen.plan.redParents}+${bestRedGreen.plan.greenParents}`}`
        + ` AR=${bestRedGreen?.plan.score.worstAr.toFixed(3) ?? 'n/a'}`
        + ` gapAfter=${bestRedGreen?.gapAfterUm.toFixed(4) ?? 'n/a'} um`);
      lines.push('');
    }
    report.targetReproduced = targetReproduced;
    report.controlsStable = controlsStable;
    report.decision = !targetReproduced
      ? 'STOP: shadow reconstruction did not reproduce the current refusal'
      : !controlsStable
        ? 'STOP: quarter-turn controls are not stable'
      : anyLegalProtector
        ? 'PROCEED: one-copy transactional protector A/B'
        : anyLegalRedGreen
          ? 'DRY-PLAN PASS: bounded RED/green closure is legal and improves H2; no mesh mutation performed'
          : 'STOP: ordinary frontier and bounded RED/green dry-plan exhausted';
    lines.push(`DECISION: ${report.decision}`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `FRONTIER_${tag}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(join(outDir, `FRONTIER_${tag}.report.txt`), `${lines.join('\n')}\n`, 'utf8');
    expect(copies).toHaveLength(4);
    expect(new Set(copies.map((copy) => copy.sourceTri)).size).toBe(4);
    expect(targetReproduced).toBe(true);
    expect(controlsStable).toBe(true);
  }, 600_000);
});
