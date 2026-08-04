/**
 * IN-LOOP CONSTRAINED-CAVITY ESCALATION for the Strata conforming-bisection driver.
 *
 * WHY THIS EXISTS. The driver's only refinement move is *bisect one edge of one triangle at one
 * point*. The 2026-08-03 jam census measured what that costs at a feature corridor
 * (`research/exchange/_strataJamCensus/JAM_S40VFC.report.txt`): 97.7 % of jammed facets have NO legal
 * single-edge split on ANY of their three edges at ANY of 2,049 positions, and the best achievable
 * worst-AR clusters at p50 51.9 against a cap of 50. The S46 A/B then showed that even a perfect
 * placement search only converts 1,280 rescues into 409 fewer unresolved facets — **the children
 * inherit the corner and jam in their parents' place**. Refinement over a FIXED CONNECTIVITY cannot
 * reach a conforming anisotropic mesh at a crease; the reachable set is empty.
 *
 * THE TARGET MESH EXISTS AND IS CHEAPER. S44's post-hoc corridor cavities resolved the same regions to
 * <=10 um at AR<50 using FEWER triangles (target 642596: 56 -> 12 at 3.09 um; 209529: 123 -> 37 at
 * 9.26 um). So the defect is REACHABILITY, and the fix is to give the generator the move that works —
 * at the moment it jams, not as a repair pass over a finished mesh.
 *
 * WHAT THIS MODULE DOES. Given the driver's live arrays and one jammed triangle, it extracts a local
 * patch, unwraps it coherently in theta, recovers the feature-edge subgraph as named PSLG constraints,
 * and hands the whole thing to the ALREADY-CERTIFIED `planAtomicCorridorCavity`. It returns a
 * proposal in GLOBAL driver terms, or a refusal. It mutates nothing — the driver applies the edit with
 * its own `killT`/`addV`/`addT` so every born triangle still goes through the driver's own book-keeping.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not relax a gate, change a heap key, or change acceptance.
 * A cavity is committed only when the planner's full certificate passes: every named edge recovered,
 * zero proper crossings, AR <= hard cap, zero admission failures, zero non-manifold edges, equal Euler
 * characteristic, identical frozen boundary, and a strict visual improvement.
 *
 * KNOWN LIMITATION, STATED. Feature identity here is the driver's OWN proxy `vFeat[a] && vFeat[b]`
 * (both endpoints sit on a detected locus), minus edges with an interior kink crossing. That is
 * weaker than the S44 harness's named-locus ledger: two vertices on DIFFERENT loci can still form a
 * false constraint. S44 measured this exact class ("loose feature proximity classification") and
 * tightened its tolerances to 2/4 um. Treat the constraint set as a lower bound on feature ownership.
 */
import {
  planAtomicCorridorCavity,
  type CorridorCavityMesh,
  type CorridorAttempt,
  type CorridorCavityOptions,
  type CorridorConstraint,
  type CorridorRefusal,
  type CorridorTriangle,
  type CorridorVertex,
} from './_strataCorridorCavity';

/** Read-only window onto the driver's live mesh arrays. */
export interface DriverMeshView {
  ta: ArrayLike<number>;
  tb: ArrayLike<number>;
  tc: ArrayLike<number>;
  vx: ArrayLike<number>;
  vy: ArrayLike<number>;
  vz: ArrayLike<number>;
  vth: ArrayLike<number>;
  alive: ArrayLike<boolean>;
  vFeat: ArrayLike<boolean>;
  /**
   * eKey(a,b) -> triangle ids that have ever used the edge (dead ones included). Structural, not
   * `Map`: the driver's edge map is a sharded wrapper, because one flat Map hits V8's ~2^24 cap.
   */
  edgeMap: { get: (key: number) => number[] | undefined };
  eKey: (a: number, b: number) => number;
  /** Shortest-arc theta delta, the driver's own. */
  dTh: (from: number, to: number) => number;
  canonTheta: (theta: number) => number;
  /** Analytic radius, the driver's own audit function. */
  R: (theta: number, z: number) => number;
  /**
   * True only when the edge RUNS ALONG a locus, not merely when both endpoints happen to sit on one.
   *
   * This distinction is the whole ballgame. The driver's own `vFeat[a] && vFeat[b]` proxy declared
   * ~456 constraint chains inside a 4,000-triangle patch — roughly a third of all edges — because any
   * chord between two on-locus vertices qualifies, including chords that cut clean across a cell. A
   * cavity criss-crossed by false constraints has nowhere legal to put a Steiner point, which is why
   * every early escalation refused with `longest-edge-boundary` despite never reaching the patch rim.
   */
  edgeAlongLocus: (a: number, b: number) => boolean;
}

export interface CavityEscalateOptions {
  /** Triangles gathered around the seed before the planner grows its own rings. */
  patchTriangles: number;
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
  /** Adaptive-front retries after a frozen-boundary refusal. 0 disables the retry entirely. */
  maxAdaptiveSteps: number;
}

export interface CavityEdit {
  /** Global driver triangle ids to kill. */
  removeTriangles: number[];
  /** New vertices as (theta, z) in the driver's own parameterisation, plus feature flag. */
  addVertices: Array<{ theta: number; z: number; feature: boolean }>;
  /**
   * Triangles to create. Each entry is a triple of GLOBAL vertex ids, except that an id of
   * `-1 - k` denotes `addVertices[k]` — resolved by the driver after it has welded them.
   */
  addTriangles: Array<[number, number, number]>;
  worstArAfter: number;
  worstVisualAfterMm: number;
  visualOverBefore: number;
  visualOverAfter: number;
}

export interface CavityEscalateResult {
  ok: boolean;
  refusal: CorridorRefusal | 'patch-too-small' | 'seed-dead' | 'seed-not-in-patch';
  edit?: CavityEdit;
  /** Parents the planner actually selected, for the run report. */
  selectedParents: number;
  /** Diagnostics — a refusal must be able to say WHY, not just that it happened. */
  patchTriangles: number;
  constraintChains: number;
  adaptiveSteps: number;
  /** False when the planner never reported a blocking witness, so the retry had nothing to grow toward. */
  sawBlockingWitness: boolean;
  /** True when the cavity's selected parents reached the extracted patch's own outer boundary. */
  hitPatchBoundary: boolean;
  /** The planner's own per-attempt record of the LAST plan, for diagnosis. */
  attempts?: readonly CorridorAttempt[];
}

const EMPTY_DIAG = {
  selectedParents: 0,
  patchTriangles: 0,
  constraintChains: 0,
  adaptiveSteps: 0,
  sawBlockingWitness: false,
  hitPatchBoundary: false,
} as const;

const DEFAULT_SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 1.1, 1.25] as const;

export function defaultCavityOptions(overrides: Partial<CavityEscalateOptions> = {}): CavityEscalateOptions {
  return {
    patchTriangles: 256,
    rings: 2,
    maxParents: 512,
    maxNewVertices: 4096,
    maxLongestEdgeSplits: 1024,
    rRefMm: 45,
    hardAr: 50,
    preferredAr: 20,
    weldMm: 0.00005,
    visualThresholdMm: 0.01,
    minimumVisualGain: 0.01,
    targetEdgeScales: DEFAULT_SCALES,
    maxAdaptiveSteps: 6,
    ...overrides,
  };
}

/** Perpendicular-ish distance from one point to the analytic surface. Same form S44 certified against. */
function pointError(R: (theta: number, z: number) => number, canonTheta: (t: number) => number,
  x: number, y: number, z: number): number {
  const theta = canonTheta(Math.atan2(y, x));
  const radial = Math.hypot(x, y);
  if (radial < 1e-6) return 0;
  const epsilon = 1e-6;
  const rm = R(theta - epsilon, z); const rp = R(theta + epsilon, z); const centre = R(theta, z);
  // Across a crease the one-sided radii disagree; take the nearest branch rather than a bogus average.
  if (Math.abs(rp - rm) > 0.05) return Math.min(Math.abs(radial - rm), Math.abs(radial - rp), Math.abs(radial - centre));
  const dz = 0.002; const dt = 2e-5;
  const rz = (R(theta, z + dz) - R(theta, z - dz)) / (2 * dz);
  const rt = (R(theta + dt, z) - R(theta - dt, z)) / (2 * dt);
  return Math.abs(radial - centre) / Math.sqrt(1 + rz * rz + (rt / radial) * (rt / radial));
}

/**
 * The FOUR-SAMPLE visual objective S44 used (centroid + three edge midpoints), reproduced verbatim so
 * the in-loop cavity is judged by the same objective the post-hoc one was certified against.
 * It is a PROXY, not the honest judge — it can miss a peak between its four samples, exactly as the
 * driver's own accept ruler can. The end-of-run auditor remains the verdict.
 */
function triangleVisual(R: (theta: number, z: number) => number, canonTheta: (t: number) => number,
  a: CorridorVertex, b: CorridorVertex, c: CorridorVertex): number {
  const f = Math.fround;
  const p = [a, b, c].map((v) => [f(v.x), f(v.y), f(v.z)] as const);
  const samples: Array<readonly [number, number, number]> = [[
    (p[0][0] + p[1][0] + p[2][0]) / 3,
    (p[0][1] + p[1][1] + p[2][1]) / 3,
    (p[0][2] + p[1][2] + p[2][2]) / 3,
  ]];
  for (let i = 0; i < 3; i += 1) {
    const u = p[i]; const v = p[(i + 1) % 3];
    samples.push([(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2]);
  }
  return Math.max(...samples.map((s) => pointError(R, canonTheta, s[0], s[1], s[2])));
}

function outwardSign(a: CorridorVertex, b: CorridorVertex, c: CorridorVertex): number {
  const aby = b.y - a.y; const abz = b.z - a.z; const abx = b.x - a.x;
  const acx = c.x - a.x; const acy = c.y - a.y; const acz = c.z - a.z;
  const nx = aby * acz - abz * acy; const ny = abz * acx - abx * acz;
  return Math.sign(nx * (a.x + b.x + c.x) + ny * (a.y + b.y + c.y));
}

/** Breadth-first gather of live triangles around `seed`, walking the driver's own edge map. */
function gatherPatch(view: DriverMeshView, seed: number, limit: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>([seed]);
  const queue = [seed];
  while (queue.length > 0 && out.length < limit) {
    const t = queue.shift() as number;
    if (!view.alive[t]) continue;
    out.push(t);
    const vs: Array<[number, number]> = [
      [view.ta[t], view.tb[t]], [view.tb[t], view.tc[t]], [view.tc[t], view.ta[t]],
    ];
    for (const [a, b] of vs) {
      for (const nb of view.edgeMap.get(view.eKey(a, b)) ?? []) {
        // The edge map retains dead triangles; only live ones are part of the current surface.
        if (!view.alive[nb] || seen.has(nb)) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return out;
}

/**
 * Link feature edges into maximal chains. Chains, not loose edges, are what the planner needs to hold
 * shared junction identity: a vertex where three feature edges meet must end three chains at ONE id,
 * not be split arbitrarily between them.
 */
function buildConstraints(
  view: DriverMeshView,
  triangles: readonly CorridorTriangle[],
  globalOfLocal: readonly number[],
): CorridorConstraint[] {
  const adjacency = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number): void => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    (adjacency.get(a) as Set<number>).add(b);
    (adjacency.get(b) as Set<number>).add(a);
  };
  for (const triangle of triangles) {
    const [a, b, c] = triangle.v;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const gu = globalOfLocal[u]; const gv = globalOfLocal[v];
      if (!view.edgeAlongLocus(gu, gv)) continue;
      addEdge(u, v);
    }
  }
  if (adjacency.size === 0) return [];
  const usedEdge = new Set<string>();
  const edgeId = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const constraints: CorridorConstraint[] = [];
  const walkFrom = (start: number): void => {
    for (const next of adjacency.get(start) as Set<number>) {
      if (usedEdge.has(edgeId(start, next))) continue;
      const chain = [start];
      let previous = start;
      let current = next;
      for (;;) {
        usedEdge.add(edgeId(previous, current));
        chain.push(current);
        const neighbours = adjacency.get(current) as Set<number>;
        // Stop at a junction or a dead end; a chain must not silently run through a degree-3 vertex.
        if (neighbours.size !== 2) break;
        let advance = -1;
        for (const candidate of neighbours) if (candidate !== previous) advance = candidate;
        if (advance < 0 || usedEdge.has(edgeId(current, advance))) break;
        previous = current;
        current = advance;
      }
      if (chain.length >= 2) constraints.push({ id: `local:${constraints.length}`, vertices: chain });
    }
  };
  // Endpoints and junctions first, so interior runs are consumed as whole chains; then any pure cycle.
  const ordered = [...adjacency.keys()].sort((a, b) => {
    const da = (adjacency.get(a) as Set<number>).size;
    const db = (adjacency.get(b) as Set<number>).size;
    return (da === 2 ? 1 : 0) - (db === 2 ? 1 : 0) || a - b;
  });
  for (const vertex of ordered) walkFrom(vertex);
  return constraints;
}

/**
 * Plan a constrained cavity around one jammed triangle. Pure: reads the driver's arrays, returns a
 * proposal in global terms, mutates nothing.
 */
export function planCavityForTriangle(
  view: DriverMeshView,
  seed: number,
  options: CavityEscalateOptions,
): CavityEscalateResult {
  if (!view.alive[seed]) return { ok: false, refusal: 'seed-dead', ...EMPTY_DIAG };
  const patch = gatherPatch(view, seed, options.patchTriangles);
  // A cavity needs a closed ring of parents around the seed; a handful of triangles cannot supply one.
  if (patch.length < 12) return { ok: false, refusal: 'patch-too-small', ...EMPTY_DIAG, patchTriangles: patch.length };

  const localOfGlobal = new Map<number, number>();
  const globalOfLocal: number[] = [];
  const vertices: CorridorVertex[] = [];
  // Unwrap the whole patch coherently from ONE reference. Independently canonicalised endpoints put a
  // short seam-straddling edge on the far side of the cylinder — the exact antipodal-branch defect S44
  // found and fixed.
  const thetaRef = view.vth[view.ta[seed]];
  const localVertex = (global: number): number => {
    const prior = localOfGlobal.get(global);
    if (prior !== undefined) return prior;
    const local = vertices.length;
    localOfGlobal.set(global, local);
    globalOfLocal.push(global);
    vertices.push({
      theta: thetaRef + view.dTh(thetaRef, view.vth[global]),
      z: view.vz[global],
      x: view.vx[global],
      y: view.vy[global],
    });
    return local;
  };
  const triangles: CorridorTriangle[] = patch.map((t) => ({
    v: [localVertex(view.ta[t]), localVertex(view.tb[t]), localVertex(view.tc[t])] as [number, number, number],
  }));
  const localSeed = patch.indexOf(seed);
  if (localSeed < 0) return { ok: false, refusal: 'seed-not-in-patch', ...EMPTY_DIAG, patchTriangles: patch.length };

  const mesh: CorridorCavityMesh = {
    vertices,
    triangles,
    constraints: buildConstraints(view, triangles, globalOfLocal),
  };
  const first = triangles[localSeed].v.map((v) => vertices[v]) as [CorridorVertex, CorridorVertex, CorridorVertex];
  const expectedOutward = outwardSign(first[0], first[1], first[2]);

  const baseOptions = {
    rings: options.rings,
    maxParents: options.maxParents,
    maxNewVertices: options.maxNewVertices,
    maxLongestEdgeSplits: options.maxLongestEdgeSplits,
    rRefMm: options.rRefMm,
    hardAr: options.hardAr,
    preferredAr: options.preferredAr,
    weldMm: options.weldMm,
    visualThresholdMm: options.visualThresholdMm,
    minimumVisualGain: options.minimumVisualGain,
    targetEdgeScales: options.targetEdgeScales,
  } satisfies CorridorCavityOptions;
  const callbacks = {
    canonTheta: view.canonTheta,
    deltaTheta: view.dTh,
    lift: (theta: number, z: number) => {
      const r = view.R(theta, z);
      return { theta: view.canonTheta(theta), z, x: r * Math.cos(theta), y: r * Math.sin(theta) };
    },
    admitted: (a: CorridorVertex, b: CorridorVertex, c: CorridorVertex) => outwardSign(a, b, c) === expectedOutward,
    visualError: (a: CorridorVertex, b: CorridorVertex, c: CorridorVertex) =>
      triangleVisual(view.R, view.canonTheta, a, b, c),
  };

  // Which triangles touch each vertex — the growth index for the adaptive front below.
  const incidentByVertex = new Map<number, number[]>();
  for (let t = 0; t < triangles.length; t += 1) {
    for (const v of triangles[t].v) {
      const prior = incidentByVertex.get(v);
      if (prior === undefined) incidentByVertex.set(v, [t]); else prior.push(t);
    }
  }

  // ADAPTIVE FRONT, transcribed from the S44 gothic harness. A first plan very often refuses with
  // `longest-edge-boundary`: shape closure needs to split an edge lying ON the frozen perimeter, which
  // it may not do. The fix is not a bigger fixed ring — it is to grow the cavity around the INITIAL
  // blocking witness and retry with rings:0. S44 measured why the initial witness and not the terminal
  // one: fifteen longest-edge splits can walk the blocker out to the true rim, and growing toward that
  // terminal pair tries to cross a boundary with no neighbour and stops.
  // A patch is a finite island cut out of an infinite mesh, so its outer rim is an ARTIFICIAL boundary.
  // If the cavity grows onto that rim, `longest-edge-boundary` means "my patch was too small", not
  // "this geometry is unfixable" — and the two must never be reported as the same thing.
  const patchRim = new Set<number>();
  {
    const edgeCount = new Map<string, number>();
    for (const triangle of triangles) {
      const [a, b, c] = triangle.v;
      for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const key = u < v ? `${u}:${v}` : `${v}:${u}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }
    for (let t = 0; t < triangles.length; t += 1) {
      const [a, b, c] = triangles[t].v;
      for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const key = u < v ? `${u}:${v}` : `${v}:${u}`;
        if ((edgeCount.get(key) ?? 0) < 2) patchRim.add(t);
      }
    }
  }

  let planned = planAtomicCorridorCavity(mesh, [localSeed], baseOptions, callbacks);
  let adaptiveParents: number[] | undefined;
  let adaptiveSteps = 0;
  let sawBlockingWitness = false;
  let hitPatchBoundary = (planned.selectedTriangles ?? []).some((t) => patchRim.has(t));
  for (let step = 0; step < options.maxAdaptiveSteps && !planned.accepted; step += 1) {
    adaptiveSteps = step + 1;
    const selected = new Set(planned.selectedTriangles ?? adaptiveParents ?? []);
    const blocking = planned.attempts.find(
      (attempt) => (attempt.initialBlockingBoundaryVertices?.length ?? 0) > 0,
    )?.initialBlockingBoundaryVertices ?? [];
    if (blocking.length === 0) break; // nothing to grow toward; this refusal is not a boundary problem
    sawBlockingWitness = true;
    if (planned.refusal === 'longest-edge-boundary' && blocking.length === 2) {
      // Exactly the pair straddling the blocked perimeter edge: take only the triangles sharing BOTH,
      // so the cavity opens across that edge rather than ballooning around two whole vertex stars.
      const across = new Set(incidentByVertex.get(blocking[0]) ?? []);
      for (const t of incidentByVertex.get(blocking[1]) ?? []) if (across.has(t)) selected.add(t);
    } else {
      for (const vertex of blocking) for (const t of incidentByVertex.get(vertex) ?? []) selected.add(t);
    }
    const priorSize = planned.selectedTriangles?.length ?? adaptiveParents?.length ?? 0;
    if (selected.size - priorSize <= 0 || selected.size > options.maxParents) break;
    adaptiveParents = [...selected].sort((a, b) => a - b);
    planned = planAtomicCorridorCavity(mesh, [localSeed], {
      ...baseOptions, rings: 0, initialParents: adaptiveParents,
    }, callbacks);
    if ((planned.selectedTriangles ?? adaptiveParents ?? []).some((t) => patchRim.has(t))) hitPatchBoundary = true;
  }
  const diagnostics = {
    patchTriangles: patch.length,
    constraintChains: mesh.constraints.length,
    adaptiveSteps,
    sawBlockingWitness,
    hitPatchBoundary,
  };

  if (!planned.accepted || planned.proposal === undefined) {
    return {
      ok: false, refusal: planned.refusal, selectedParents: planned.selectedParents,
      ...diagnostics, attempts: planned.attempts,
    };
  }
  const proposal = planned.proposal;
  const base = vertices.length;
  const featureLocalIds = new Set<number>();
  for (const chain of proposal.featureChains) for (const id of chain.vertices) featureLocalIds.add(id);
  // Local ids below `base` are existing vertices; at or above it they index `addVertices`. The driver
  // welds the new ones itself, so they are handed over as (theta, z) and referenced by negative index.
  const toGlobal = (local: number): number => (local < base ? globalOfLocal[local] : -1 - (local - base));
  return {
    ok: true,
    refusal: 'none',
    selectedParents: planned.selectedParents,
    ...diagnostics,
    edit: {
      removeTriangles: proposal.removeTriangles.map((local) => patch[local]),
      addVertices: proposal.addVertices.map((v, index) => ({
        theta: v.theta,
        z: v.z,
        // A vertex the planner placed on a named chain is a feature vertex to the driver too, so the
        // driver's own `vFeat` stays true after the cavity and later splits keep treating it as one.
        feature: featureLocalIds.has(base + index),
      })),
      addTriangles: proposal.addTriangles.map(([a, b, c]) => [toGlobal(a), toGlobal(b), toGlobal(c)] as [number, number, number]),
      worstArAfter: proposal.certificate.newWorstAr,
      worstVisualAfterMm: proposal.certificate.newWorstVisualMm,
      visualOverBefore: proposal.certificate.oldVisualOver,
      visualOverAfter: proposal.certificate.newVisualOver,
    },
  };
}
