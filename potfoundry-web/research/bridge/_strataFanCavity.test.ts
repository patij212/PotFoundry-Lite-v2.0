import { describe, expect, it } from 'vitest';
import {
  runFanCavities,
  type FanCavityCallbacks,
  type FanCavityMesh,
  type FanCavityOptions,
} from './_strataFanCavity';

const TWO_PI = 2 * Math.PI;

function canonTheta(theta: number): number {
  let value = theta % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
}

function deltaTheta(a: number, b: number, theta: readonly number[]): number {
  let delta = theta[b] - theta[a];
  while (delta > Math.PI) delta -= TWO_PI;
  while (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

function radius(theta: number, z: number): number {
  let signedTheta = canonTheta(theta);
  if (signedTheta > Math.PI) signedTheta -= TWO_PI;
  return 10 + 2 * Math.abs(signedTheta - 0.12 * z);
}

function makeQuad(crossesReplacement: boolean): {
  mesh: FanCavityMesh;
  callbacks: FanCavityCallbacks;
} {
  // Convex parameter-space polygon p-r-q-s. The initial p-q diagonal
  // straddles the analytic V; the replacement r-s diagonal follows it more
  // closely. These coordinates are deliberately asymmetric so this is not a
  // tie resolved by triangle order.
  const uv = [
    [-0.013553404662499796, 2.4994948634683105],
    [0.4237598279379976, 2.521788082973889],
    [0.358162843047923, 2.65137891989544],
    [0.030177918597549924, 2.6290857003898616],
  ] as const;
  const theta = uv.map(([value]) => canonTheta(value));
  const z = uv.map(([, value]) => value);
  const x = theta.map((value, index) => radius(value, z[index]) * Math.cos(value));
  const y = theta.map((value, index) => radius(value, z[index]) * Math.sin(value));
  const a = [0, 2];
  const b = [1, 3];
  const c = [2, 0];
  const alive = [true, true];
  const feature = [false, false, false, false];
  const edgeKey = (p: number, q: number): number => {
    const lo = Math.min(p, q);
    const hi = Math.max(p, q);
    return lo * 16 + hi;
  };
  const incidents = new Map<number, number[]>();
  const addIncident = (p: number, q: number, triangle: number): void => {
    const key = edgeKey(p, q);
    const list = incidents.get(key);
    if (list === undefined) incidents.set(key, [triangle]);
    else list.push(triangle);
  };
  const indexTriangle = (triangle: number): void => {
    addIncident(a[triangle], b[triangle], triangle);
    addIncident(b[triangle], c[triangle], triangle);
    addIncident(c[triangle], a[triangle], triangle);
  };
  indexTriangle(0);
  indexTriangle(1);

  const mesh: FanCavityMesh = {
    theta, z, x, y, feature, a, b, c, alive, edgeKey,
    edgeIncidents: (p, q) => incidents.get(edgeKey(p, q)) ?? [],
    edgeLength: (p, q) => Math.hypot(x[q] - x[p], y[q] - y[p], z[q] - z[p]),
    killTriangle: (triangle) => { alive[triangle] = false; },
    addTriangle: (p, q, r) => {
      const triangle = a.length;
      a.push(p); b.push(q); c.push(r); alive.push(true);
      indexTriangle(triangle);
      return triangle;
    },
  };
  const callbacks: FanCavityCallbacks = {
    radius,
    canonTheta,
    deltaTheta: (p, q) => deltaTheta(p, q, theta),
    crossesFeature: (p, q) => crossesReplacement
      && edgeKey(p, q) === edgeKey(1, 3),
    edgeOnLocus: () => false,
    triangleAdmitted: () => true,
    triangleIsShard: () => false,
    isShard: () => false,
  };
  return { mesh, callbacks };
}

function makeCollapsibleStar(edgeIsLocus: boolean): {
  mesh: FanCavityMesh;
  callbacks: FanCavityCallbacks;
} {
  // Boundary polygon k-a-b-c and an interior non-feature vertex r close to
  // k. The r-k edge creates a visually bad sliver; the link-condition-safe
  // r -> k collapse replaces the four-face star with k-a-b + k-b-c.
  const uv = [
    [0.01916167720546616, 1.2856946449073408],
    [0.4422003374307879, 1.3589034951791794],
    [0.3998964714082557, 2.5688005469418513],
    [0.061465543227998326, 2.495591696670013],
    [0.035146652409843576, 1.3297705994391378],
  ] as const;
  const theta = uv.map(([value]) => canonTheta(value));
  const z = uv.map(([, value]) => value);
  const x = theta.map((value, index) => radius(value, z[index]) * Math.cos(value));
  const y = theta.map((value, index) => radius(value, z[index]) * Math.sin(value));
  const a = [4, 4, 4, 4];
  const b = [0, 1, 2, 3];
  const c = [1, 2, 3, 0];
  const alive = [true, true, true, true];
  const feature = [false, false, false, false, false];
  const edgeKey = (p: number, q: number): number => {
    const lo = Math.min(p, q);
    const hi = Math.max(p, q);
    return lo * 16 + hi;
  };
  const incidents = new Map<number, number[]>();
  const addIncident = (p: number, q: number, triangle: number): void => {
    const key = edgeKey(p, q);
    const list = incidents.get(key);
    if (list === undefined) incidents.set(key, [triangle]);
    else list.push(triangle);
  };
  const indexTriangle = (triangle: number): void => {
    addIncident(a[triangle], b[triangle], triangle);
    addIncident(b[triangle], c[triangle], triangle);
    addIncident(c[triangle], a[triangle], triangle);
  };
  for (let triangle = 0; triangle < a.length; triangle += 1) indexTriangle(triangle);
  const mesh: FanCavityMesh = {
    theta, z, x, y, feature, a, b, c, alive, edgeKey,
    edgeIncidents: (p, q) => incidents.get(edgeKey(p, q)) ?? [],
    edgeLength: (p, q) => Math.hypot(x[q] - x[p], y[q] - y[p], z[q] - z[p]),
    killTriangle: (triangle) => { alive[triangle] = false; },
    addTriangle: (p, q, s) => {
      const triangle = a.length;
      a.push(p); b.push(q); c.push(s); alive.push(true);
      indexTriangle(triangle);
      return triangle;
    },
  };
  const callbacks: FanCavityCallbacks = {
    radius,
    canonTheta,
    deltaTheta: (p, q) => deltaTheta(p, q, theta),
    crossesFeature: () => false,
    edgeOnLocus: (p, q) => edgeIsLocus && edgeKey(p, q) === edgeKey(0, 4),
    triangleAdmitted: () => true,
    triangleIsShard: () => false,
    isShard: () => false,
  };
  return { mesh, callbacks };
}

const options: FanCavityOptions = {
  H: 10,
  candidateMode: 'fan',
  shapeAR: 1000,
  fanDegree: 99,
  fanLongMm: 100,
  maxHubs: 1,
  maxDegree: 16,
  locusRadiusMm: 1,
  visualThresholdMm: 0.01,
  minimumVisualGain: 0.01,
  visualFlipPasses: 1,
  visualFlipBudget: 1,
  visualCollapseBudget: 0,
  visualCollapseMaxEdgeMm: 0,
};

describe('Strata protected visual cavity', () => {
  it('flips an admissible bad diagonal and reduces the exact visual cohort', () => {
    const { mesh, callbacks } = makeQuad(false);
    const result = runFanCavities(mesh, [], options, callbacks);

    expect(result.visualFlips.committed).toBe(1);
    expect(result.visualFlips.newWorstMm).toBeLessThan(result.visualFlips.oldWorstMm);
    expect(result.visualFlips.newOver).toBeLessThanOrEqual(result.visualFlips.oldOver);
    expect(mesh.alive.filter(Boolean)).toHaveLength(2);
    expect(mesh.edgeIncidents(1, 3).filter((triangle) => mesh.alive[triangle])).toHaveLength(2);
  });

  it('keeps the original diagonal when the replacement crosses a feature', () => {
    const { mesh, callbacks } = makeQuad(true);
    const result = runFanCavities(mesh, [], options, callbacks);

    expect(result.visualFlips.committed).toBe(0);
    expect(result.visualFlips.refusedTopology).toBeGreaterThan(0);
    expect(mesh.edgeIncidents(0, 2).filter((triangle) => mesh.alive[triangle])).toHaveLength(2);
    expect(mesh.edgeIncidents(1, 3).filter((triangle) => mesh.alive[triangle])).toHaveLength(0);
  });

  it('collapses a short non-feature edge only after full-star visual improvement', () => {
    const { mesh, callbacks } = makeCollapsibleStar(false);
    const result = runFanCavities(mesh, [], {
      ...options,
      visualFlipPasses: 0,
      visualFlipBudget: 0,
      visualCollapseBudget: 1,
      visualCollapseMaxEdgeMm: 0.2,
    }, callbacks);

    expect(result.visualCollapses.committed).toBe(1);
    expect(result.visualCollapses.removedFaces).toBe(4);
    expect(result.visualCollapses.addedFaces).toBe(2);
    expect(result.visualCollapses.newWorstMm).toBeLessThan(result.visualCollapses.oldWorstMm);
    expect(mesh.alive.filter(Boolean)).toHaveLength(2);
  });

  it('never collapses an edge owned by a locus', () => {
    const { mesh, callbacks } = makeCollapsibleStar(true);
    const result = runFanCavities(mesh, [], {
      ...options,
      visualFlipPasses: 0,
      visualFlipBudget: 0,
      visualCollapseBudget: 1,
      visualCollapseMaxEdgeMm: 0.2,
    }, callbacks);

    expect(result.visualCollapses.committed).toBe(0);
    expect(result.visualCollapses.refusedLocus).toBeGreaterThan(0);
    expect(mesh.alive.filter(Boolean)).toHaveLength(4);
  });
});
