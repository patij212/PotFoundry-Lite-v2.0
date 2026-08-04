import { aspect3 } from './_shapeGuard';

export interface FanCavityMesh {
  theta: number[];
  z: number[];
  x: number[];
  y: number[];
  feature: boolean[];
  a: number[];
  b: number[];
  c: number[];
  alive: boolean[];
  edgeKey: (a: number, b: number) => number;
  edgeIncidents: (a: number, b: number) => readonly number[];
  edgeLength: (a: number, b: number) => number;
  killTriangle: (triangle: number) => void;
  addTriangle: (a: number, b: number, c: number) => number;
  onRemoveTriangle?: (triangle: number) => void;
}

export interface FanCavityLocus {
  pts: Array<[number, number]>;
}

export interface FanCavityOptions {
  H: number;
  candidateMode: 'fan' | 'visual';
  shapeAR: number;
  fanDegree: number;
  fanLongMm: number;
  maxHubs: number;
  maxDegree: number;
  locusRadiusMm: number;
  visualThresholdMm: number;
  minimumVisualGain: number;
  visualFlipPasses: number;
  visualFlipBudget: number;
  visualCollapseBudget: number;
  visualCollapseMaxEdgeMm: number;
}

export interface FanCavityCallbacks {
  radius: (theta: number, z: number) => number;
  canonTheta: (theta: number) => number;
  deltaTheta: (a: number, b: number) => number;
  crossesFeature: (a: number, b: number) => boolean;
  edgeOnLocus: (a: number, b: number) => boolean;
  triangleAdmitted: (a: number, b: number, c: number) => boolean;
  triangleIsShard: (a: number, b: number, c: number) => boolean;
  isShard: (triangle: number) => boolean;
}

export interface FanCavityResult {
  candidates: number;
  nearLocus: number;
  visualCandidates: number;
  tried: number;
  committed: number;
  removedFaces: number;
  addedFaces: number;
  fansBefore: number;
  fansAfter: number;
  shardsBefore: number;
  shardsAfter: number;
  refused: {
    featureHub: number;
    locusSpoke: number;
    overlap: number;
    star: number;
    degree: number;
    boundary: number;
    topology: number;
    triangulation: number;
    shape: number;
    admission: number;
    visual: number;
    fan: number;
  };
  committedVisual: {
    oldWorstMm: number;
    newWorstMm: number;
    oldOver: number;
    newOver: number;
  };
  visualFlips: {
    passes: number;
    candidates: number;
    tried: number;
    committed: number;
    oldWorstMm: number;
    newWorstMm: number;
    oldOver: number;
    newOver: number;
    refusedLocus: number;
    refusedTopology: number;
    refusedShape: number;
    refusedAdmission: number;
    refusedVisual: number;
    refusedFan: number;
  };
  visualCollapses: {
    candidates: number;
    tried: number;
    committed: number;
    removedFaces: number;
    addedFaces: number;
    oldWorstMm: number;
    newWorstMm: number;
    oldOver: number;
    newOver: number;
    refusedFeature: number;
    refusedLocus: number;
    refusedTopology: number;
    refusedShape: number;
    refusedAdmission: number;
    refusedVisual: number;
    refusedFan: number;
  };
}

interface CandidateTriangle {
  a: number;
  b: number;
  c: number;
  visual: number;
  ar: number;
  longest: number;
  longAr20: boolean;
  shard: boolean;
}

type EarPriority = 'visual' | 'shape' | 'length';

/**
 * Delete a residual non-feature hub and retriangulate its complete one-ring
 * polygon. `fan` mode reproduces the original S33 selector; `visual` mode
 * starts from every vertex incident to an independently bad facet. Boundary
 * vertices and edges are immutable. The independent four-sample
 * mesh-to-surface proxy is the commit quantity.
 */
export function runFanCavities(
  mesh: FanCavityMesh,
  loci: readonly FanCavityLocus[],
  options: FanCavityOptions,
  callbacks: FanCavityCallbacks,
): FanCavityResult {
  const refused = {
    featureHub: 0, locusSpoke: 0, overlap: 0, star: 0, degree: 0, boundary: 0,
    topology: 0, triangulation: 0, shape: 0, admission: 0, visual: 0, fan: 0,
  };
  const result: FanCavityResult = {
    candidates: 0, nearLocus: 0, visualCandidates: 0, tried: 0,
    committed: 0, removedFaces: 0, addedFaces: 0,
    fansBefore: 0, fansAfter: 0, shardsBefore: 0, shardsAfter: 0,
    refused,
    committedVisual: { oldWorstMm: 0, newWorstMm: 0, oldOver: 0, newOver: 0 },
    visualFlips: {
      passes: 0, candidates: 0, tried: 0, committed: 0,
      oldWorstMm: 0, newWorstMm: 0, oldOver: 0, newOver: 0,
      refusedLocus: 0, refusedTopology: 0, refusedShape: 0,
      refusedAdmission: 0, refusedVisual: 0, refusedFan: 0,
    },
    visualCollapses: {
      candidates: 0, tried: 0, committed: 0, removedFaces: 0, addedFaces: 0,
      oldWorstMm: 0, newWorstMm: 0, oldOver: 0, newOver: 0,
      refusedFeature: 0, refusedLocus: 0, refusedTopology: 0,
      refusedShape: 0, refusedAdmission: 0, refusedVisual: 0, refusedFan: 0,
    },
  };
  const f32 = Math.fround;
  const twoPi = Math.PI * 2;
  const jumpEpsilon = 1e-6;

  const pointError = (x: number, y: number, z: number): number => {
    const theta = callbacks.canonTheta(Math.atan2(y, x));
    const r = Math.hypot(x, y);
    if (r < 1e-6) return 0;
    const jm = callbacks.radius(callbacks.canonTheta(theta - jumpEpsilon), z);
    const jp = callbacks.radius(callbacks.canonTheta(theta + jumpEpsilon), z);
    const centre = callbacks.radius(theta, z);
    if (Math.abs(jp - jm) > 0.05) {
      const jumpDistance = Math.min(Math.abs(r - jm), Math.abs(r - jp));
      if (jumpDistance < Math.abs(r - centre)) return jumpDistance;
    }
    const dz = 0.002;
    const dtheta = 2e-5;
    const rz = (
      callbacks.radius(theta, Math.min(options.H, z + dz))
      - callbacks.radius(theta, Math.max(0, z - dz))
    ) / (2 * dz);
    const rt = (
      callbacks.radius(callbacks.canonTheta(theta + dtheta), z)
      - callbacks.radius(callbacks.canonTheta(theta - dtheta), z)
    ) / (2 * dtheta);
    return Math.abs(r - centre) / Math.sqrt(1 + rz * rz + (rt / r) * (rt / r));
  };

  const triangleVisual = (a: number, b: number, c: number): number => {
    const p = [a, b, c].map((v) => [f32(mesh.x[v]), f32(mesh.y[v]), f32(mesh.z[v])] as const);
    const samples: Array<readonly [number, number, number]> = [[
      (p[0][0] + p[1][0] + p[2][0]) / 3,
      (p[0][1] + p[1][1] + p[2][1]) / 3,
      (p[0][2] + p[1][2] + p[2][2]) / 3,
    ]];
    for (let i = 0; i < 3; i += 1) {
      const q = p[i];
      const s = p[(i + 1) % 3];
      samples.push([(q[0] + s[0]) / 2, (q[1] + s[1]) / 2, (q[2] + s[2]) / 2]);
    }
    let worst = 0;
    for (const sample of samples) {
      const error = pointError(sample[0], sample[1], sample[2]);
      if (error > worst) worst = error;
    }
    return worst;
  };

  const makeTriangle = (a: number, b: number, c: number): CandidateTriangle => {
    const ar = aspect3(
      mesh.x[a], mesh.y[a], mesh.z[a],
      mesh.x[b], mesh.y[b], mesh.z[b],
      mesh.x[c], mesh.y[c], mesh.z[c],
    );
    const longest = Math.max(
      mesh.edgeLength(a, b), mesh.edgeLength(b, c), mesh.edgeLength(c, a),
    );
    return {
      a, b, c, ar, longest,
      visual: triangleVisual(a, b, c),
      longAr20: longest >= 1 && ar >= 20,
      shard: callbacks.triangleIsShard(a, b, c),
    };
  };

  const isFanLong = (a: number, b: number, c: number): boolean => Math.max(
    mesh.edgeLength(a, b), mesh.edgeLength(b, c), mesh.edgeLength(c, a),
  ) >= options.fanLongMm;

  const fanCensus = (): Map<number, number> => {
    const degree = new Map<number, number>();
    for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
      if (!mesh.alive[triangle] || !isFanLong(mesh.a[triangle], mesh.b[triangle], mesh.c[triangle])) continue;
      for (const vertex of [mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]]) {
        degree.set(vertex, (degree.get(vertex) ?? 0) + 1);
      }
    }
    for (const [vertex, value] of degree) if (value < options.fanDegree) degree.delete(vertex);
    return degree;
  };

  const shardCensus = (): number => {
    let count = 0;
    for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
      if (mesh.alive[triangle] && callbacks.isShard(triangle)) count += 1;
    }
    return count;
  };

  const nearestLocusDistance = (hub: number): number => {
    const theta = mesh.theta[hub];
    const z = mesh.z[hub];
    const radius = Math.max(1e-6, callbacks.radius(theta, z));
    let best = Infinity;
    for (const locus of loci) for (let i = 0; i + 1 < locus.pts.length; i += 1) {
      const a = locus.pts[i];
      const b = locus.pts[i + 1];
      const midpoint = 0.5 * (a[0] + b[0]);
      const thetaNear = theta + Math.round((midpoint - theta) / twoPi) * twoPi;
      const ax = radius * (a[0] - thetaNear); const ay = a[1] - z;
      const bx = radius * (b[0] - thetaNear); const by = b[1] - z;
      const ux = bx - ax; const uy = by - ay; const length2 = ux * ux + uy * uy;
      let t = length2 <= 1e-18 ? 0 : -(ax * ux + ay * uy) / length2;
      t = Math.max(0, Math.min(1, t));
      const distance = Math.hypot(ax + t * ux, ay + t * uy);
      if (distance < best) best = distance;
    }
    return best;
  };

  const liveIncident = (hub: number): number[] => {
    return (incidentByVertex.get(hub) ?? []).filter((triangle) => mesh.alive[triangle]);
  };

  const starCycle = (hub: number, incident: readonly number[]): number[] | null => {
    const next = new Map<number, number>();
    const indegree = new Map<number, number>();
    for (const triangle of incident) {
      let u: number;
      let v: number;
      if (mesh.a[triangle] === hub) { u = mesh.b[triangle]; v = mesh.c[triangle]; }
      else if (mesh.b[triangle] === hub) { u = mesh.c[triangle]; v = mesh.a[triangle]; }
      else if (mesh.c[triangle] === hub) { u = mesh.a[triangle]; v = mesh.b[triangle]; }
      else return null;
      if (u === v || next.has(u)) return null;
      next.set(u, v);
      indegree.set(v, (indegree.get(v) ?? 0) + 1);
    }
    if (next.size !== incident.length || [...indegree.values()].some((value) => value !== 1)) return null;
    const start = [...next.keys()].sort((a, b) => a - b)[0];
    const cycle: number[] = [];
    const seen = new Set<number>();
    let current = start;
    while (!seen.has(current) && cycle.length <= incident.length) {
      seen.add(current);
      cycle.push(current);
      const following = next.get(current);
      if (following === undefined) return null;
      current = following;
    }
    return current === start && cycle.length === incident.length ? cycle : null;
  };

  const longDegree = new Int32Array(mesh.theta.length);
  const incidentByVertex = new Map<number, number[]>();
  const addIncident = (vertex: number, triangle: number): void => {
    const incident = incidentByVertex.get(vertex);
    if (incident === undefined) incidentByVertex.set(vertex, [triangle]);
    else incident.push(triangle);
  };
  for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
    if (!mesh.alive[triangle]) continue;
    addIncident(mesh.a[triangle], triangle);
    addIncident(mesh.b[triangle], triangle);
    addIncident(mesh.c[triangle], triangle);
    if (isFanLong(mesh.a[triangle], mesh.b[triangle], mesh.c[triangle])) {
      longDegree[mesh.a[triangle]] += 1;
      longDegree[mesh.b[triangle]] += 1;
      longDegree[mesh.c[triangle]] += 1;
    }
  }

  result.fansBefore = fanCensus().size;
  result.shardsBefore = shardCensus();
  let hubs: number[];
  const initialVisual = new Float64Array(mesh.a.length);
  if (options.candidateMode === 'visual') {
    const scores = new Map<number, { worst: number; bad: number }>();
    for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
      if (!mesh.alive[triangle]) continue;
      const visual = triangleVisual(mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]);
      initialVisual[triangle] = visual;
      if (visual <= options.visualThresholdMm) continue;
      for (const vertex of [mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]]) {
        const score = scores.get(vertex);
        if (score === undefined) scores.set(vertex, { worst: visual, bad: 1 });
        else {
          score.bad += 1;
          if (visual > score.worst) score.worst = visual;
        }
      }
    }
    hubs = [...scores.entries()]
      .sort((x, y) => y[1].worst - x[1].worst || y[1].bad - x[1].bad || x[0] - y[0])
      .map(([vertex]) => vertex);
  } else {
    hubs = [...fanCensus().entries()]
      .sort((x, y) => y[1] - x[1] || x[0] - y[0])
      .map(([vertex]) => vertex);
  }
  result.candidates = hubs.length;
  const claimedVertices = new Set<number>();

  for (const hub of hubs) {
    if (result.tried >= options.maxHubs) break;
    if (mesh.feature[hub]) { refused.featureHub += 1; continue; }
    if (nearestLocusDistance(hub) > options.locusRadiusMm) continue;
    result.nearLocus += 1;
    const incident = liveIncident(hub);
    if (incident.length < 3) { refused.star += 1; continue; }
    if (incident.length > options.maxDegree) { refused.degree += 1; continue; }
    const cycle = starCycle(hub, incident);
    if (cycle === null) { refused.star += 1; continue; }
    if ([hub, ...cycle].some((vertex) => claimedVertices.has(vertex))) {
      refused.overlap += 1;
      continue;
    }

    const boundary = new Set<number>();
    const incidentSet = new Set(incident);
    let spokeBlocked = false;
    let boundaryBlocked = false;
    for (let i = 0; i < cycle.length; i += 1) {
      const u = cycle[i];
      const v = cycle[(i + 1) % cycle.length];
      boundary.add(mesh.edgeKey(u, v));
      if (mesh.edgeIncidents(hub, u).filter((triangle) => mesh.alive[triangle]).length !== 2
        || callbacks.edgeOnLocus(hub, u)) spokeBlocked = true;
      const boundaryIncident = mesh.edgeIncidents(u, v).filter((triangle) => mesh.alive[triangle]);
      if (boundaryIncident.length !== 2
        || boundaryIncident.filter((triangle) => incidentSet.has(triangle)).length !== 1) boundaryBlocked = true;
    }
    if (spokeBlocked) { refused.locusSpoke += 1; continue; }
    if (boundaryBlocked) { refused.boundary += 1; continue; }

    const old = incident.map((triangle) => {
      const candidate = makeTriangle(mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]);
      if (options.candidateMode === 'visual') candidate.visual = initialVisual[triangle];
      return candidate;
    });
    const oldWorst = old.reduce((maximum, triangle) => Math.max(maximum, triangle.visual), 0);
    const oldOver = old.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
    if (oldOver === 0) continue;
    result.visualCandidates += 1;
    result.tried += 1;
    const oldWorstAR = old.reduce((maximum, triangle) => Math.max(maximum, triangle.ar), 0);
    const oldOverAR = old.filter((triangle) => triangle.ar > options.shapeAR).length;
    const oldLongAr20 = old.filter((triangle) => triangle.longAr20).length;
    const oldShards = old.filter((triangle) => triangle.shard).length;
    const radiusAtHub = Math.max(1e-6, callbacks.radius(mesh.theta[hub], mesh.z[hub]));
    const point2 = (vertex: number): [number, number] => [
      radiusAtHub * callbacks.deltaTheta(hub, vertex), mesh.z[vertex] - mesh.z[hub],
    ];
    const cross2 = (a: number, b: number, c: number): number => {
      const p = point2(a); const q = point2(b); const r = point2(c);
      return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    };
    const polygonOrientation = (polygon: readonly number[]): number => {
      let area2 = 0;
      for (let i = 0; i < polygon.length; i += 1) {
        const p = point2(polygon[i]); const q = point2(polygon[(i + 1) % polygon.length]);
        area2 += p[0] * q[1] - p[1] * q[0];
      }
      return Math.sign(area2);
    };
    const orientation = polygonOrientation(cycle);
    if (orientation === 0) { refused.star += 1; continue; }
    const pointInTriangle = (p: number, a: number, b: number, c: number, orient: number): boolean => {
      const s0 = orient * cross2(a, b, p);
      const s1 = orient * cross2(b, c, p);
      const s2 = orient * cross2(c, a, p);
      return s0 >= -1e-12 && s1 >= -1e-12 && s2 >= -1e-12;
    };
    const properCross = (a: number, b: number, c: number, d: number): boolean => {
      const s0 = cross2(a, b, c); const s1 = cross2(a, b, d);
      const s2 = cross2(c, d, a); const s3 = cross2(c, d, b);
      return s0 * s1 < -1e-18 && s2 * s3 < -1e-18;
    };
    let sawShape = false;
    let sawAdmission = false;

    const earClipPolygon = (
      priority: EarPriority,
      polygon: readonly number[],
    ): CandidateTriangle[] | null => {
      const active = polygon.slice();
      const orient = polygonOrientation(active);
      if (active.length < 3 || orient !== orientation) return null;
      const polygonBoundary = new Set<number>();
      for (let i = 0; i < active.length; i += 1) {
        polygonBoundary.add(mesh.edgeKey(active[i], active[(i + 1) % active.length]));
      }
      const triangles: CandidateTriangle[] = [];
      while (active.length > 3) {
        const ears: Array<{ index: number; triangle: CandidateTriangle }> = [];
        for (let i = 0; i < active.length; i += 1) {
          const a = active[(i + active.length - 1) % active.length];
          const b = active[i];
          const c = active[(i + 1) % active.length];
          if (orient * cross2(a, b, c) <= 1e-12) continue;
          if (active.some((p) => p !== a && p !== b && p !== c && pointInTriangle(p, a, b, c, orient))) continue;
          if (!polygonBoundary.has(mesh.edgeKey(a, c))) {
            if (mesh.edgeIncidents(a, c).some((triangle) => mesh.alive[triangle])
              || callbacks.crossesFeature(a, c)) continue;
            let crosses = false;
            for (let j = 0; j < active.length; j += 1) {
              const u = active[j]; const v = active[(j + 1) % active.length];
              if (u === a || u === c || v === a || v === c) continue;
              if (properCross(a, c, u, v)) { crosses = true; break; }
            }
            if (crosses) continue;
          }
          const triangle = makeTriangle(a, b, c);
          if (triangle.ar > Math.max(options.shapeAR, oldWorstAR)) { sawShape = true; continue; }
          if (!callbacks.triangleAdmitted(a, b, c)) { sawAdmission = true; continue; }
          ears.push({ index: i, triangle });
        }
        if (ears.length === 0) return null;
        ears.sort((x, y) => {
          if (priority === 'shape') {
            return x.triangle.ar - y.triangle.ar
              || x.triangle.visual - y.triangle.visual
              || x.triangle.longest - y.triangle.longest;
          }
          if (priority === 'length') {
            return x.triangle.longest - y.triangle.longest
              || x.triangle.visual - y.triangle.visual
              || x.triangle.ar - y.triangle.ar;
          }
          return x.triangle.visual - y.triangle.visual
            || x.triangle.ar - y.triangle.ar
            || x.triangle.longest - y.triangle.longest;
        });
        triangles.push(ears[0].triangle);
        active.splice(ears[0].index, 1);
      }
      const last = makeTriangle(active[0], active[1], active[2]);
      if (orient * cross2(last.a, last.b, last.c) <= 1e-12) return null;
      if (last.ar > Math.max(options.shapeAR, oldWorstAR)) { sawShape = true; return null; }
      if (!callbacks.triangleAdmitted(last.a, last.b, last.c)) { sawAdmission = true; return null; }
      triangles.push(last);
      return triangles;
    };

    const earClip = (priority: EarPriority): CandidateTriangle[] | null => {
      return earClipPolygon(priority, cycle);
    };

    const proposals = (['visual', 'shape', 'length'] as const)
      .map((priority) => earClip(priority))
      .filter((proposal): proposal is CandidateTriangle[] => proposal !== null);
    if (proposals.length === 0) {
      if (sawAdmission) refused.admission += 1;
      else if (sawShape) refused.shape += 1;
      else refused.triangulation += 1;
      continue;
    }

    let chosen: CandidateTriangle[] | null = null;
    let chosenScore: readonly number[] | null = null;
    let sawVisualPass = false;
    let sawShapePass = false;
    let sawFanRefusal = false;
    let sawTopologyRefusal = false;
    const oldSum = old.reduce((sum, triangle) => sum + triangle.visual, 0);
    for (const proposal of proposals) {
      const edgeUse = new Map<number, { a: number; b: number; count: number }>();
      for (const triangle of proposal) {
        for (const [a, b] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]] as Array<[number, number]>) {
          const key = mesh.edgeKey(a, b);
          const entry = edgeUse.get(key);
          if (entry === undefined) edgeUse.set(key, { a, b, count: 1 }); else entry.count += 1;
        }
      }
      let topologyValid = true;
      for (const key of boundary) if (edgeUse.get(key)?.count !== 1) { topologyValid = false; break; }
      if (topologyValid) for (const [key, entry] of edgeUse) {
        if (boundary.has(key)) continue;
        if (entry.count !== 2 || mesh.edgeIncidents(entry.a, entry.b).some((triangle) => mesh.alive[triangle])) {
          topologyValid = false;
          break;
        }
      }
      if (!topologyValid) { sawTopologyRefusal = true; continue; }
      const newWorst = proposal.reduce((maximum, triangle) => Math.max(maximum, triangle.visual), 0);
      const newOver = proposal.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
      const newSum = proposal.reduce((sum, triangle) => sum + triangle.visual, 0);
      if (newWorst > oldWorst * (1 - options.minimumVisualGain)
        || newOver > oldOver || newSum >= oldSum) continue;
      sawVisualPass = true;
      const newWorstAR = proposal.reduce((maximum, triangle) => Math.max(maximum, triangle.ar), 0);
      const newOverAR = proposal.filter((triangle) => triangle.ar > options.shapeAR).length;
      const newLongAr20 = proposal.filter((triangle) => triangle.longAr20).length;
      const newShards = proposal.filter((triangle) => triangle.shard).length;
      if (newWorstAR > Math.max(options.shapeAR, oldWorstAR)
        || newOverAR > oldOverAR || newLongAr20 > oldLongAr20 || newShards > oldShards) continue;
      sawShapePass = true;
      const delta = new Map<number, number>();
      for (const triangle of old) if (triangle.longest >= options.fanLongMm) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) {
          delta.set(vertex, (delta.get(vertex) ?? 0) - 1);
        }
      }
      for (const triangle of proposal) if (triangle.longest >= options.fanLongMm) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) {
          delta.set(vertex, (delta.get(vertex) ?? 0) + 1);
        }
      }
      let newFan = false;
      for (const [vertex, change] of delta) {
        if (longDegree[vertex] < options.fanDegree
          && longDegree[vertex] + change >= options.fanDegree) { newFan = true; break; }
      }
      if (newFan || longDegree[hub] + (delta.get(hub) ?? 0) >= options.fanDegree) {
        sawFanRefusal = true;
        continue;
      }
      const score = [newOver, newWorst, newLongAr20, newWorstAR] as const;
      const better = chosenScore === null || score.some((value, i) => (
        score.slice(0, i).every((prefix, j) => prefix === chosenScore?.[j]) && value < (chosenScore?.[i] ?? Infinity)
      ));
      if (better) { chosen = proposal; chosenScore = score; }
    }
    if (chosen === null) {
      if (sawTopologyRefusal && !sawVisualPass) refused.topology += 1;
      else if (!sawVisualPass) refused.visual += 1;
      else if (!sawShapePass) refused.shape += 1;
      else if (sawFanRefusal) refused.fan += 1;
      else refused.triangulation += 1;
      continue;
    }

    const newWorst = chosen.reduce((maximum, triangle) => Math.max(maximum, triangle.visual), 0);
    const newOver = chosen.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
    for (const triangle of incident) {
      mesh.killTriangle(triangle);
      mesh.onRemoveTriangle?.(triangle);
    }
    for (const triangle of chosen) {
      const made = mesh.addTriangle(triangle.a, triangle.b, triangle.c);
      if (made < 0) throw new Error('PF_CB_FAN_CAVITY: preflight emitted a degenerate cavity triangle.');
    }
    for (const triangle of chosen) {
      for (const [a, b] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]] as Array<[number, number]>) {
        if (mesh.edgeIncidents(a, b).filter((candidate) => mesh.alive[candidate]).length > 2) {
          throw new Error('PF_CB_FAN_CAVITY: post-commit edge incidence exceeded two despite topology preflight.');
        }
      }
    }
    for (const triangle of old) if (triangle.longest >= options.fanLongMm) {
      for (const vertex of [triangle.a, triangle.b, triangle.c]) longDegree[vertex] -= 1;
    }
    for (const triangle of chosen) if (triangle.longest >= options.fanLongMm) {
      for (const vertex of [triangle.a, triangle.b, triangle.c]) longDegree[vertex] += 1;
    }
    result.committed += 1;
    result.removedFaces += incident.length;
    result.addedFaces += chosen.length;
    result.committedVisual.oldWorstMm = Math.max(result.committedVisual.oldWorstMm, oldWorst);
    result.committedVisual.newWorstMm = Math.max(result.committedVisual.newWorstMm, newWorst);
    result.committedVisual.oldOver += oldOver;
    result.committedVisual.newOver += newOver;
    claimedVertices.add(hub);
    for (const vertex of cycle) claimedVertices.add(vertex);
  }

  // A feature hub is immutable, but the off-locus diagonals in its surrounding
  // corridor are not. Greedily flip only complete two-triangle quads whose
  // replacement diagonal is feature-free and whose exact local censuses all
  // improve or hold. This reaches the protected motifs that hub deletion must
  // reject without weakening feature ownership.
  const flips = result.visualFlips;
  for (let pass = 0; pass < options.visualFlipPasses
    && flips.committed < options.visualFlipBudget; pass += 1) {
    const candidates = new Map<number, { a: number; b: number; worst: number }>();
    for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
      if (!mesh.alive[triangle]) continue;
      const visual = triangleVisual(mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]);
      if (visual <= options.visualThresholdMm) continue;
      for (const [a, b] of [
        [mesh.a[triangle], mesh.b[triangle]],
        [mesh.b[triangle], mesh.c[triangle]],
        [mesh.c[triangle], mesh.a[triangle]],
      ] as Array<[number, number]>) {
        const key = mesh.edgeKey(a, b);
        const prior = candidates.get(key);
        if (prior === undefined) candidates.set(key, { a, b, worst: visual });
        else if (visual > prior.worst) prior.worst = visual;
      }
    }
    const ordered = [...candidates.values()].sort((a, b) => b.worst - a.worst
      || mesh.edgeKey(a.a, a.b) - mesh.edgeKey(b.a, b.b));
    flips.passes += 1;
    flips.candidates += ordered.length;
    let committedThisPass = 0;

    for (const candidate of ordered) {
      if (flips.committed >= options.visualFlipBudget) break;
      const pv = candidate.a; const qv = candidate.b;
      const incident = mesh.edgeIncidents(pv, qv).filter((triangle) => mesh.alive[triangle]);
      if (incident.length !== 2) { flips.refusedTopology += 1; continue; }
      if (callbacks.edgeOnLocus(pv, qv)) { flips.refusedLocus += 1; continue; }
      const apexOf = (triangle: number): number => (
        mesh.a[triangle] !== pv && mesh.a[triangle] !== qv ? mesh.a[triangle]
          : mesh.b[triangle] !== pv && mesh.b[triangle] !== qv ? mesh.b[triangle]
            : mesh.c[triangle]
      );
      const runsPvQv = (triangle: number): boolean => {
        const vertices = [mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]];
        for (let i = 0; i < 3; i += 1) {
          if (vertices[i] === pv && vertices[(i + 1) % 3] === qv) return true;
        }
        return false;
      };
      const forward0 = runsPvQv(incident[0]);
      if (forward0 === runsPvQv(incident[1])) { flips.refusedTopology += 1; continue; }
      const r0 = apexOf(forward0 ? incident[0] : incident[1]);
      const s0 = apexOf(forward0 ? incident[1] : incident[0]);
      if (r0 === s0
        || [pv, qv, r0, s0].some((vertex) => claimedVertices.has(vertex))
        || mesh.edgeIncidents(r0, s0).some((triangle) => mesh.alive[triangle])
        || callbacks.crossesFeature(r0, s0)) {
        flips.refusedTopology += 1;
        continue;
      }
      const point = (vertex: number): [number, number] => [
        callbacks.deltaTheta(pv, vertex), mesh.z[vertex] - mesh.z[pv],
      ];
      const cross = (a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): number => (
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      );
      const pp = point(pv); const pq = point(qv); const pr = point(r0); const ps = point(s0);
      const reference = cross(pp, pq, pr);
      const sign1 = cross(pr, pp, ps); const sign2 = cross(ps, pq, pr);
      if (reference === 0 || sign1 === 0 || sign2 === 0
        || Math.sign(sign1) !== Math.sign(reference) || Math.sign(sign2) !== Math.sign(reference)) {
        flips.refusedTopology += 1;
        continue;
      }

      flips.tried += 1;
      const old = incident.map((triangle) => makeTriangle(
        mesh.a[triangle], mesh.b[triangle], mesh.c[triangle],
      ));
      const proposal = [makeTriangle(r0, pv, s0), makeTriangle(s0, qv, r0)];
      const oldWorst = Math.max(old[0].visual, old[1].visual);
      const newWorst = Math.max(proposal[0].visual, proposal[1].visual);
      const oldOver = old.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
      const newOver = proposal.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
      const oldSum = old[0].visual + old[1].visual;
      const newSum = proposal[0].visual + proposal[1].visual;
      if (newWorst > oldWorst * (1 - options.minimumVisualGain)
        || newOver > oldOver || newSum >= oldSum) {
        flips.refusedVisual += 1;
        continue;
      }
      const oldWorstAR = Math.max(old[0].ar, old[1].ar);
      const newWorstAR = Math.max(proposal[0].ar, proposal[1].ar);
      const oldOverAR = old.filter((triangle) => triangle.ar > options.shapeAR).length;
      const newOverAR = proposal.filter((triangle) => triangle.ar > options.shapeAR).length;
      const oldLongAr20 = old.filter((triangle) => triangle.longAr20).length;
      const newLongAr20 = proposal.filter((triangle) => triangle.longAr20).length;
      const oldShards = old.filter((triangle) => triangle.shard).length;
      const newShards = proposal.filter((triangle) => triangle.shard).length;
      if (newWorstAR > Math.max(options.shapeAR, oldWorstAR)
        || newOverAR > oldOverAR || newLongAr20 > oldLongAr20 || newShards > oldShards) {
        flips.refusedShape += 1;
        continue;
      }
      if (!callbacks.triangleAdmitted(r0, pv, s0)
        || !callbacks.triangleAdmitted(s0, qv, r0)) {
        flips.refusedAdmission += 1;
        continue;
      }
      const degreeDelta = new Map<number, number>();
      for (const triangle of old) if (triangle.longest >= options.fanLongMm) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) {
          degreeDelta.set(vertex, (degreeDelta.get(vertex) ?? 0) - 1);
        }
      }
      for (const triangle of proposal) if (triangle.longest >= options.fanLongMm) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) {
          degreeDelta.set(vertex, (degreeDelta.get(vertex) ?? 0) + 1);
        }
      }
      if ([...degreeDelta].some(([vertex, change]) => (
        longDegree[vertex] < options.fanDegree
        && longDegree[vertex] + change >= options.fanDegree
      ))) {
        flips.refusedFan += 1;
        continue;
      }

      for (const triangle of incident) {
        mesh.killTriangle(triangle);
        mesh.onRemoveTriangle?.(triangle);
      }
      const made = [mesh.addTriangle(r0, pv, s0), mesh.addTriangle(s0, qv, r0)];
      if (made.some((triangle) => triangle < 0)) {
        throw new Error('PF_CB_FAN_CAVITY: visual flip emitted a degenerate triangle after preflight.');
      }
      for (const [a, b] of [[r0, pv], [pv, s0], [s0, r0], [s0, qv], [qv, r0]] as Array<[number, number]>) {
        if (mesh.edgeIncidents(a, b).filter((triangle) => mesh.alive[triangle]).length > 2) {
          throw new Error('PF_CB_FAN_CAVITY: visual flip exceeded two edge incidences after preflight.');
        }
      }
      for (const triangle of old) if (triangle.longest >= options.fanLongMm) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) longDegree[vertex] -= 1;
      }
      for (const triangle of proposal) if (triangle.longest >= options.fanLongMm) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) longDegree[vertex] += 1;
      }
      flips.committed += 1;
      committedThisPass += 1;
      flips.oldWorstMm = Math.max(flips.oldWorstMm, oldWorst);
      flips.newWorstMm = Math.max(flips.newWorstMm, newWorst);
      flips.oldOver += oldOver;
      flips.newOver += newOver;
    }
    if (committedThisPass === 0) break;
  }

  // The remaining extreme visual pairs can be locked around a micron-scale
  // edge: neither diagonal of the adjacent quad is admissible, and deleting a
  // whole feature hub is forbidden. Collapse only a NON-feature endpoint of
  // such an edge. This is a full-star transaction (the edge link condition,
  // every replacement face and every changed incidence are preflighted), not
  // a coordinate weld. Feature vertices and locus edges are immutable.
  const collapses = result.visualCollapses;
  if (options.visualCollapseBudget > 0 && options.visualCollapseMaxEdgeMm > 0) {
    const candidateEdges = new Map<number, { a: number; b: number; worst: number; length: number }>();
    for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
      if (!mesh.alive[triangle]) continue;
      const visual = triangleVisual(mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]);
      if (visual <= options.visualThresholdMm) continue;
      for (const [a, b] of [
        [mesh.a[triangle], mesh.b[triangle]],
        [mesh.b[triangle], mesh.c[triangle]],
        [mesh.c[triangle], mesh.a[triangle]],
      ] as Array<[number, number]>) {
        const length = mesh.edgeLength(a, b);
        if (length > options.visualCollapseMaxEdgeMm) continue;
        const key = mesh.edgeKey(a, b);
        const prior = candidateEdges.get(key);
        if (prior === undefined) candidateEdges.set(key, { a, b, worst: visual, length });
        else if (visual > prior.worst) prior.worst = visual;
      }
    }
    const ordered = [...candidateEdges.values()].sort((a, b) => b.worst - a.worst
      || a.length - b.length || mesh.edgeKey(a.a, a.b) - mesh.edgeKey(b.a, b.b));
    collapses.candidates = ordered.length;

    // Rebuild after the star and flip phases. Lists retain dead ids after a
    // commit, exactly like the driver's edge map, and are filtered on read.
    const collapseIncident = new Map<number, number[]>();
    const indexIncident = (vertex: number, triangle: number): void => {
      const list = collapseIncident.get(vertex);
      if (list === undefined) collapseIncident.set(vertex, [triangle]);
      else list.push(triangle);
    };
    for (let triangle = 0; triangle < mesh.a.length; triangle += 1) {
      if (!mesh.alive[triangle]) continue;
      indexIncident(mesh.a[triangle], triangle);
      indexIncident(mesh.b[triangle], triangle);
      indexIncident(mesh.c[triangle], triangle);
    }
    const liveAt = (vertex: number): number[] => (
      collapseIncident.get(vertex) ?? []
    ).filter((triangle) => mesh.alive[triangle]);
    const signedParam = (a: number, b: number, c: number): number => (
      callbacks.deltaTheta(a, b) * (mesh.z[c] - mesh.z[a])
      - (mesh.z[b] - mesh.z[a]) * callbacks.deltaTheta(a, c)
    );
    const triangleKey = (a: number, b: number, c: number): string => (
      [a, b, c].sort((x, y) => x - y).join(',')
    );

    interface CollapseProposal {
      remove: number;
      keep: number;
      incident: number[];
      old: CandidateTriangle[];
      triangles: CandidateTriangle[];
      oldWorst: number;
      newWorst: number;
      oldOver: number;
      newOver: number;
      score: readonly number[];
      degreeDelta: Map<number, number>;
    }

    for (const candidate of ordered) {
      if (collapses.committed >= options.visualCollapseBudget) break;
      const edgeIncident = mesh.edgeIncidents(candidate.a, candidate.b)
        .filter((triangle) => mesh.alive[triangle]);
      if (edgeIncident.length !== 2
        || [candidate.a, candidate.b].some((vertex) => claimedVertices.has(vertex))) {
        collapses.refusedTopology += 1;
        continue;
      }
      if (callbacks.edgeOnLocus(candidate.a, candidate.b)
        || callbacks.crossesFeature(candidate.a, candidate.b)) {
        collapses.refusedLocus += 1;
        continue;
      }
      if (mesh.feature[candidate.a] && mesh.feature[candidate.b]) {
        collapses.refusedFeature += 1;
        continue;
      }
      const directions: Array<[number, number]> = mesh.feature[candidate.a]
        ? [[candidate.b, candidate.a]]
        : mesh.feature[candidate.b]
          ? [[candidate.a, candidate.b]]
          : [[candidate.a, candidate.b], [candidate.b, candidate.a]];
      let chosen: CollapseProposal | null = null;
      let sawLocus = false;
      let sawTopology = false;
      let sawShape = false;
      let sawAdmission = false;
      let sawVisual = false;
      let sawFan = false;

      for (const [remove, keep] of directions) {
        if (mesh.feature[remove]) continue;
        const incident = liveAt(remove);
        if (incident.length < 3 || incident.length > options.maxDegree) {
          sawTopology = true;
          continue;
        }
        const incidentSet = new Set(incident);
        const dying = incident.filter((triangle) => (
          mesh.a[triangle] === keep || mesh.b[triangle] === keep || mesh.c[triangle] === keep
        ));
        if (dying.length !== 2 || dying.some((triangle) => !edgeIncident.includes(triangle))) {
          sawTopology = true;
          continue;
        }
        const removeNeighbors = new Set<number>();
        let localLocus = false;
        let completeStar = true;
        for (const triangle of incident) {
          for (const vertex of [mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]]) {
            if (vertex !== remove) removeNeighbors.add(vertex);
          }
        }
        for (const neighborVertex of removeNeighbors) {
          const live = mesh.edgeIncidents(remove, neighborVertex)
            .filter((triangle) => mesh.alive[triangle]);
          if (live.length !== 2) completeStar = false;
          if (callbacks.edgeOnLocus(remove, neighborVertex)) localLocus = true;
        }
        if (localLocus) { sawLocus = true; continue; }
        if (!completeStar) { sawTopology = true; continue; }

        // Classical manifold edge-collapse link condition: the endpoint links
        // may intersect only at the two apices of the collapsing edge.
        const keepNeighbors = new Set<number>();
        for (const triangle of liveAt(keep)) {
          for (const vertex of [mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]]) {
            if (vertex !== keep) keepNeighbors.add(vertex);
          }
        }
        const common = [...removeNeighbors].filter((vertex) => keepNeighbors.has(vertex));
        const edgeApex = new Set(edgeIncident.map((triangle) => (
          mesh.a[triangle] !== remove && mesh.a[triangle] !== keep ? mesh.a[triangle]
            : mesh.b[triangle] !== remove && mesh.b[triangle] !== keep ? mesh.b[triangle]
              : mesh.c[triangle]
        )));
        if (edgeApex.size !== 2 || common.length !== 2
          || common.some((vertex) => !edgeApex.has(vertex))) {
          sawTopology = true;
          continue;
        }

        const old = incident.map((triangle) => makeTriangle(
          mesh.a[triangle], mesh.b[triangle], mesh.c[triangle],
        ));
        const proposal: CandidateTriangle[] = [];
        const proposalKeys = new Set<string>();
        const oldEdges = new Set<number>();
        for (const triangle of incident) for (const [a, b] of [
          [mesh.a[triangle], mesh.b[triangle]],
          [mesh.b[triangle], mesh.c[triangle]],
          [mesh.c[triangle], mesh.a[triangle]],
        ] as Array<[number, number]>) oldEdges.add(mesh.edgeKey(a, b));
        let proposalValid = true;
        for (const triangle of incident) {
          if (dying.includes(triangle)) continue;
          const original = [mesh.a[triangle], mesh.b[triangle], mesh.c[triangle]];
          const vertices = original.map((vertex) => (vertex === remove ? keep : vertex));
          if (new Set(vertices).size !== 3
            || signedParam(original[0], original[1], original[2])
              * signedParam(vertices[0], vertices[1], vertices[2]) <= 1e-20) {
            proposalValid = false;
            break;
          }
          const key = triangleKey(vertices[0], vertices[1], vertices[2]);
          if (proposalKeys.has(key)
            || liveAt(vertices[0]).some((other) => !incidentSet.has(other)
              && triangleKey(mesh.a[other], mesh.b[other], mesh.c[other]) === key)) {
            proposalValid = false;
            break;
          }
          proposalKeys.add(key);
          for (const [a, b] of [
            [vertices[0], vertices[1]], [vertices[1], vertices[2]], [vertices[2], vertices[0]],
          ] as Array<[number, number]>) {
            if (!oldEdges.has(mesh.edgeKey(a, b)) && callbacks.crossesFeature(a, b)) {
              proposalValid = false;
              break;
            }
          }
          if (!proposalValid) break;
          proposal.push(makeTriangle(vertices[0], vertices[1], vertices[2]));
        }
        if (!proposalValid || proposal.length !== incident.length - 2) {
          sawTopology = true;
          continue;
        }

        const edgeDelta = new Map<number, { a: number; b: number; old: number; added: number }>();
        const addEdgeDelta = (a: number, b: number, field: 'old' | 'added'): void => {
          const key = mesh.edgeKey(a, b);
          const entry = edgeDelta.get(key);
          if (entry === undefined) edgeDelta.set(key, {
            a, b, old: field === 'old' ? 1 : 0, added: field === 'added' ? 1 : 0,
          });
          else entry[field] += 1;
        };
        for (const triangle of incident) for (const [a, b] of [
          [mesh.a[triangle], mesh.b[triangle]],
          [mesh.b[triangle], mesh.c[triangle]],
          [mesh.c[triangle], mesh.a[triangle]],
        ] as Array<[number, number]>) addEdgeDelta(a, b, 'old');
        for (const triangle of proposal) for (const [a, b] of [
          [triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a],
        ] as Array<[number, number]>) addEdgeDelta(a, b, 'added');
        if ([...edgeDelta.values()].some((entry) => {
          const current = mesh.edgeIncidents(entry.a, entry.b)
            .filter((triangle) => mesh.alive[triangle]).length;
          const final = current - entry.old + entry.added;
          return final < 0 || final > 2;
        })) {
          sawTopology = true;
          continue;
        }

        const oldWorst = old.reduce((maximum, triangle) => Math.max(maximum, triangle.visual), 0);
        const newWorst = proposal.reduce((maximum, triangle) => Math.max(maximum, triangle.visual), 0);
        const oldOver = old.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
        const newOver = proposal.filter((triangle) => triangle.visual > options.visualThresholdMm).length;
        const oldSum = old.reduce((sum, triangle) => sum + triangle.visual, 0);
        const newSum = proposal.reduce((sum, triangle) => sum + triangle.visual, 0);
        if (newWorst > oldWorst * (1 - options.minimumVisualGain)
          || newOver > oldOver || newSum >= oldSum) {
          sawVisual = true;
          continue;
        }
        const oldWorstAR = old.reduce((maximum, triangle) => Math.max(maximum, triangle.ar), 0);
        const newWorstAR = proposal.reduce((maximum, triangle) => Math.max(maximum, triangle.ar), 0);
        const oldOverAR = old.filter((triangle) => triangle.ar > options.shapeAR).length;
        const newOverAR = proposal.filter((triangle) => triangle.ar > options.shapeAR).length;
        const oldLongAr20 = old.filter((triangle) => triangle.longAr20).length;
        const newLongAr20 = proposal.filter((triangle) => triangle.longAr20).length;
        const oldShards = old.filter((triangle) => triangle.shard).length;
        const newShards = proposal.filter((triangle) => triangle.shard).length;
        if (newWorstAR > Math.max(options.shapeAR, oldWorstAR)
          || newOverAR > oldOverAR || newLongAr20 > oldLongAr20 || newShards > oldShards) {
          sawShape = true;
          continue;
        }
        if (proposal.some((triangle) => !callbacks.triangleAdmitted(
          triangle.a, triangle.b, triangle.c,
        ))) {
          sawAdmission = true;
          continue;
        }
        const degreeDelta = new Map<number, number>();
        for (const triangle of old) if (triangle.longest >= options.fanLongMm) {
          for (const vertex of [triangle.a, triangle.b, triangle.c]) {
            degreeDelta.set(vertex, (degreeDelta.get(vertex) ?? 0) - 1);
          }
        }
        for (const triangle of proposal) if (triangle.longest >= options.fanLongMm) {
          for (const vertex of [triangle.a, triangle.b, triangle.c]) {
            degreeDelta.set(vertex, (degreeDelta.get(vertex) ?? 0) + 1);
          }
        }
        if ([...degreeDelta].some(([vertex, change]) => (
          longDegree[vertex] < options.fanDegree
          && longDegree[vertex] + change >= options.fanDegree
        ))) {
          sawFan = true;
          continue;
        }
        const score = [newOver, newWorst, newSum, newLongAr20, newWorstAR] as const;
        const better = chosen === null || score.some((value, index) => (
          score.slice(0, index).every((prefix, prior) => prefix === chosen?.score[prior])
          && value < (chosen?.score[index] ?? Infinity)
        ));
        if (better) chosen = {
          remove, keep, incident, old, triangles: proposal,
          oldWorst, newWorst, oldOver, newOver, score, degreeDelta,
        };
      }

      collapses.tried += 1;
      if (chosen === null) {
        if (sawLocus) collapses.refusedLocus += 1;
        else if (sawTopology) collapses.refusedTopology += 1;
        else if (sawShape) collapses.refusedShape += 1;
        else if (sawAdmission) collapses.refusedAdmission += 1;
        else if (sawVisual) collapses.refusedVisual += 1;
        else if (sawFan) collapses.refusedFan += 1;
        else collapses.refusedFeature += 1;
        continue;
      }

      for (const triangle of chosen.incident) {
        mesh.killTriangle(triangle);
        mesh.onRemoveTriangle?.(triangle);
      }
      for (const triangle of chosen.triangles) {
        const made = mesh.addTriangle(triangle.a, triangle.b, triangle.c);
        if (made < 0) {
          throw new Error('PF_CB_FAN_CAVITY: visual collapse emitted a degenerate triangle after preflight.');
        }
        indexIncident(triangle.a, made);
        indexIncident(triangle.b, made);
        indexIncident(triangle.c, made);
      }
      for (const [vertex, change] of chosen.degreeDelta) longDegree[vertex] += change;
      collapses.committed += 1;
      collapses.removedFaces += chosen.incident.length;
      collapses.addedFaces += chosen.triangles.length;
      collapses.oldWorstMm = Math.max(collapses.oldWorstMm, chosen.oldWorst);
      collapses.newWorstMm = Math.max(collapses.newWorstMm, chosen.newWorst);
      collapses.oldOver += chosen.oldOver;
      collapses.newOver += chosen.newOver;
      claimedVertices.add(chosen.remove);
      claimedVertices.add(chosen.keep);
      for (const triangle of chosen.old) {
        claimedVertices.add(triangle.a);
        claimedVertices.add(triangle.b);
        claimedVertices.add(triangle.c);
      }
    }
  }

  result.fansAfter = fanCensus().size;
  result.shardsAfter = shardCensus();
  return result;
}
