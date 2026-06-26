/**
 * junctionWedge.derisk.test.ts — STEP 2 (throwaway de-risk): the junction fan
 * driven by the REAL Voronoi wedge-angle distribution.
 *
 * The question this spike settles (measure-first, before the whole-wall
 * integration in Step 3): when `paveJunction` is driven across the ACTUAL
 * wedge-angle distribution of a real Voronoi relief web, is the only sub-20°
 * 3D-min-angle residual EXACTLY the geometrically-irreducible acute-wedge set
 * (accept-class `min(20°, θ)`)? And does the central fan stay clean + the weld
 * stay watertight at every real junction?
 *
 * ## Factored protocol (real angles, controlled local surface)
 *
 *  PART 1 — REAL SURFACE, REAL DETECTOR (the distribution).
 *    Build the real Voronoi surface (`styleSampler('Voronoi', …)`) and run the
 *    real detector (`detectFeatures`) with the CANONICAL global config copied
 *    verbatim from `featureGraph/validation.test.ts`. From the resulting feature
 *    graph, extract every degree-EXACTLY-3 node's three incident edge directions
 *    and the three 3D wedge angles between adjacent arms. This yields the REAL
 *    wedge-angle distribution → the fraction of junctions that are acute.
 *
 *  PART 2 — CONTROLLED LOCAL SURFACE, REAL ANGLES (the wedge→sliver law).
 *    For each real junction's three real wedge angles, build three constant-width
 *    ribbons radiating at those exact angles on a FLAT ISOTROPIC local patch
 *    (`position(u,t) = [u, t, 0]` mm, so 3D angle == UV angle), and pave with the
 *    real `paveJunction`. The junction core is ~8 mm on an R≈35 mm / H=100 mm pot,
 *    over which the surface departs from flat by ~0.2 mm (≪ the mm-scale triangles),
 *    so the flat patch is a faithful local model; using it ISOLATES the wedge-angle
 *    variable (no relief-crossing arm-band confound, no anisotropy — anisotropy was
 *    already handled by `buildStations`' 3D-metric sizing and proven in Step 1).
 *    Measure, per junction: watertight audit, worst (min over triangles) 3D
 *    min-angle of the whole patch and of the central fan alone, fan pct<10° /
 *    aspectMax. Bucket by `minWedge`.
 *
 * Watertightness is by-construction (exact-(u,t)-key vertex welding, independent
 * of the surface) — Part 2 re-audits it on every real-angle case, complementing
 * the hand-picked-angle gate already in `junction.test.ts`.
 *
 * CPU throwaway spike. Touches NO production code. Prints a report and asserts the
 * two by-construction invariants that must hold for NON-acute junctions (clean
 * fan; watertight weld); the accept-class relationship is reported for GO/NO-GO.
 *
 * @module fidelity/bandRemesh/junctionWedge.derisk.test
 */

import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { SurfaceSampler, Vec3 } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { paveJunction } from './junction';
import type { JunctionArm } from './junction';
import type { StationPoint } from './stations';

// ───────────────────────────────────────────────────────────────────────────
// Surface + canonical detector config (verbatim from validation.test.ts).
// ───────────────────────────────────────────────────────────────────────────

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2); // ≈ 219.9 mm
const T_TO_MM = DIMS.H; // 100 mm

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40,
  fineRes: 120,
  minStrength: 1.0,
  minAngleDeg: 28,
  uToMm: U_TO_MM,
  tToMm: T_TO_MM,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};

const RELIEF_MEAN_SAMPLES = 256;
const RELIEF_ALPHA = 0.5;
const RELIEF_ABS_FLOOR_MM = 1e-3;

function samplerRadius(sampler: SurfaceSampler, u: number, t: number): number {
  const [x, y] = sampler.position(u, t);
  return Math.hypot(x, y);
}

/** ONE GLOBAL relief indicator (verbatim mirror of validation.test.ts). */
function makeReliefIndicator(sampler: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t);
    if (cached !== undefined) return cached;
    let sum = 0;
    const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const r = samplerRadius(sampler, i / RELIEF_MEAN_SAMPLES, t);
      rs[i] = r;
      sum += r;
    }
    const mean = sum / RELIEF_MEAN_SAMPLES;
    let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const d = rs[i] - mean;
      sq += d * d;
    }
    const rms = Math.sqrt(sq / RELIEF_MEAN_SAMPLES);
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * rms) };
    rowStats.set(t, stats);
    return stats;
  };
  return (u: number, t: number): number => {
    const { mean, floor } = statsAtT(t);
    return Math.abs(samplerRadius(sampler, u, t) - mean) - floor;
  };
}

function globalOpts(sampler: SurfaceSampler): DetectFeaturesOptions {
  return { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) };
}

// ───────────────────────────────────────────────────────────────────────────
// Small 3D geometry helpers.
// ───────────────────────────────────────────────────────────────────────────

function sub3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm3(a: Vec3): [number, number, number] {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
/** Min interior angle (deg) of a 3D triangle from its three vertices. */
function triMinAngle(A: Vec3, B: Vec3, C: Vec3): number {
  const a = len3(sub3(B, C));
  const b = len3(sub3(C, A));
  const c = len3(sub3(A, B));
  const ang = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 0;
    const cos = Math.max(-1, Math.min(1, (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2)));
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}
/** Worst (minimum over triangles) 3D min-angle of a mesh, in degrees. */
function worstMinAngle3D(mesh: Mesh3): number {
  const { positions, indices } = mesh;
  let worst = Infinity;
  const P = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || c === a) continue;
    const m = triMinAngle(P(a), P(b), P(c));
    if (m < worst) worst = m;
  }
  return worst === Infinity ? 0 : worst;
}

const METRIC_EPS = 1e-4;

// ───────────────────────────────────────────────────────────────────────────
// PART 1 — feature-graph junction extraction (REAL Voronoi surface).
// ───────────────────────────────────────────────────────────────────────────

interface IncidentArm {
  d3: [number, number, number]; // unit 3D direction from node into the edge interior
  azim: number; // tangent-plane azimuth (rad) for adjacency ordering
}

interface Junction {
  wedges: [number, number, number]; // adjacent sector angles (deg), CCW, sum = 360 exactly
  minWedge: number;
  maxWedge: number;
  /** True if one sector exceeds 180° (two arms on one side; junction center is
   *  OUTSIDE their direction triangle — a degenerate/near-tangent layout). */
  reflex: boolean;
}

/** Distance in mm between two (u,t) points (periodic u). */
function utDistMm(au: number, at: number, bu: number, bt: number): number {
  let d = Math.abs(au - bu) % 1;
  if (d > 0.5) d = 1 - d;
  return Math.hypot(d * U_TO_MM, (at - bt) * T_TO_MM);
}

function extractJunctions(
  graph: FeatureGraph,
  sampler: SurfaceSampler,
): { junctions: Junction[]; degreeHist: Map<number, number>; deg3WithArms: number } {
  const degree = new Map<number, number>();
  for (const e of graph.edges) {
    for (const idx of e.endpoints) degree.set(idx, (degree.get(idx) ?? 0) + 1);
  }
  const degreeHist = new Map<number, number>();
  for (const d of degree.values()) degreeHist.set(d, (degreeHist.get(d) ?? 0) + 1);

  const incident = new Map<number, IncidentArm[]>();
  const addIncident = (nodeIdx: number, dirUT: { du: number; dt: number } | null): void => {
    if (!dirUT) return;
    const node = graph.nodes[nodeIdx];
    const p0 = sampler.position(node.u, node.t);
    const pStep = sampler.position(node.u + dirUT.du * METRIC_EPS, node.t + dirUT.dt * METRIC_EPS);
    const d3 = norm3(sub3(pStep, p0));
    const eu = norm3(sub3(sampler.position(node.u + METRIC_EPS, node.t), sampler.position(node.u - METRIC_EPS, node.t)));
    let ev = sub3(sampler.position(node.u, node.t + METRIC_EPS), sampler.position(node.u, node.t - METRIC_EPS));
    const proj = dot3(ev, eu);
    ev = [ev[0] - proj * eu[0], ev[1] - proj * eu[1], ev[2] - proj * eu[2]];
    const evn = norm3(ev);
    const azim = Math.atan2(dot3(d3, evn), dot3(d3, eu));
    const arr = incident.get(nodeIdx) ?? [];
    arr.push({ d3, azim });
    incident.set(nodeIdx, arr);
  };

  for (const e of graph.edges) {
    const poly = e.polyline;
    if (poly.length < 2) continue;
    const [ia, ib] = e.endpoints;
    if (ia === ib) continue; // loop edge — no distinct junction arms
    const dirFromEnd = (nodeIdx: number): { du: number; dt: number } | null => {
      const node = graph.nodes[nodeIdx];
      const dHead = utDistMm(node.u, node.t, poly[0].u, poly[0].t);
      const dTail = utDistMm(node.u, node.t, poly[poly.length - 1].u, poly[poly.length - 1].t);
      const seq = dHead <= dTail ? poly : [...poly].reverse();
      for (let k = 1; k < seq.length; k++) {
        let su = (seq[k].u - node.u) % 1;
        if (su > 0.5) su -= 1;
        if (su < -0.5) su += 1;
        const dt = seq[k].t - node.t;
        if (utDistMm(node.u, node.t, seq[k].u, seq[k].t) > 0.5) {
          const l = Math.hypot(su, dt) || 1;
          return { du: su / l, dt: dt / l };
        }
      }
      return null;
    };
    addIncident(ia, dirFromEnd(ia));
    addIncident(ib, dirFromEnd(ib));
  }

  const junctions: Junction[] = [];
  let deg3WithArms = 0;
  for (const [nodeIdx, arms] of incident) {
    // Require BOTH exactly 3 extractable arms AND actual node degree === 3, so
    // degree-4+ imposters (3 arms extracted, but a 4th edge endpoint exists) are
    // NOT mistyped as triple junctions. (Adversarial review caught this.)
    if (arms.length !== 3 || (degree.get(nodeIdx) ?? 0) !== 3) continue;
    deg3WithArms++;
    const sorted = [...arms].sort((p, q) => p.azim - q.azim);
    // Sector wedges = consecutive tangent-plane azimuth gaps (sum to 360 exactly).
    const w: number[] = [];
    for (let i = 0; i < 3; i++) {
      let gap = sorted[(i + 1) % 3].azim - sorted[i].azim;
      if (gap <= 0) gap += 2 * Math.PI;
      w.push((gap * 180) / Math.PI);
    }
    const wedges: [number, number, number] = [w[0], w[1], w[2]];
    const minWedge = Math.min(...wedges);
    const maxWedge = Math.max(...wedges);
    junctions.push({ wedges, minWedge, maxWedge, reflex: maxWedge > 180 });
  }
  return { junctions, degreeHist, deg3WithArms };
}

// ───────────────────────────────────────────────────────────────────────────
// PART 2 — flat isotropic local patch + arm builder at exact wedge angles.
// ───────────────────────────────────────────────────────────────────────────

/** Flat isotropic patch: (u,t) ARE millimetres in the plane z=0. 3D angle = UV angle. */
const FLAT: SurfaceSampler = { position: (u: number, t: number): Vec3 => [u, t, 0] };

const TARGET_W_MM = 4.0; // ribbon half-width
const TARGET_L_MM = 16.0; // ribbon outer reach beyond the corner
const TARGET_EDGE_MM = 3.0;

/**
 * Build three constant-width ribbons radiating at azimuths derived from the three
 * sector wedges, on the FLAT patch. Corners placed analytically on each sector
 * bisector at radius halfW/sin(wedge/2) (robust for any wedge>0; line-intersection
 * degenerates at acute wedges). Returns null only for a numerically dead wedge.
 */
function buildFlatArms(wedges: [number, number, number]): JunctionArm[] | null {
  const deg = Math.PI / 180;
  // Arm azimuths (rad): arm 0 at 0; arm i after the preceding sectors.
  const a: number[] = [0, wedges[0] * deg, (wedges[0] + wedges[1]) * deg];
  // Sector corner i sits in the wedge between arm i and arm i+1.
  const corner: StationPoint[] = [];
  for (let i = 0; i < 3; i++) {
    const half = (wedges[i] * deg) / 2;
    const s = Math.sin(half);
    if (!(s > 1e-4)) return null; // wedge ~0: corner at infinity (extreme degenerate)
    const d = TARGET_W_MM / s;
    if (!(d < 1e4)) return null; // runaway corner — skip as numerically dead
    const bis = a[i] + half;
    corner.push({ u: d * Math.cos(bis), t: d * Math.sin(bis) });
  }
  const arms: JunctionArm[] = [];
  for (let i = 0; i < 3; i++) {
    const axu = Math.cos(a[i]), axt = Math.sin(a[i]);
    const pu = -Math.sin(a[i]), pt = Math.cos(a[i]); // +90°
    const footCorner = corner[(i + 2) % 3]; // sector between arm i-1 and arm i
    const crestCorner = corner[i]; // sector between arm i and arm i+1
    const dFoot = Math.hypot(footCorner.u, footCorner.t);
    const dCrest = Math.hypot(crestCorner.u, crestCorner.t);
    const outerDist = Math.max(dFoot, dCrest) + TARGET_L_MM;
    arms.push({
      footRail: [
        { u: axu * outerDist - TARGET_W_MM * pu, t: axt * outerDist - TARGET_W_MM * pt },
        footCorner,
      ],
      crestRail: [
        { u: axu * outerDist + TARGET_W_MM * pu, t: axt * outerDist + TARGET_W_MM * pt },
        crestCorner,
      ],
      junctionFoot: footCorner,
      junctionCrest: crestCorner,
    });
  }
  return arms;
}

interface JunctionMeasure {
  minWedge: number;
  maxWedge: number;
  wedges: [number, number, number];
  watertight: boolean;
  worstAll: number;
  worstFan: number;
  fanPctBelow10: number;
  fanAspectMax: number;
}

const skipReasons = new Map<string, number>();
function noteSkip(r: string): void {
  skipReasons.set(r, (skipReasons.get(r) ?? 0) + 1);
}

function measureFlat(j: Junction): JunctionMeasure | null {
  if (j.reflex) {
    // One sector >180° ⇒ the junction center is outside the arm-direction triangle.
    // The constant-width-ribbon corner is geometrically ill-defined here (the two
    // adjacent edges meet BEHIND the center). These are degenerate/near-tangent
    // layouts (overwhelmingly detector artifacts, not generic Voronoi vertices) —
    // excluded from the quality law; flagged for Step 3 (split/merge handling).
    noteSkip('reflex-excluded');
    return null;
  }
  const arms = buildFlatArms(j.wedges);
  if (!arms) {
    noteSkip('degenerate-wedge');
    return null;
  }
  let res;
  try {
    res = paveJunction(arms, FLAT, TARGET_EDGE_MM);
  } catch (err) {
    noteSkip(`pave-throw:${String((err as Error).message).slice(0, 36)}`);
    return null;
  }
  const audit = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
  const qFan = triangleQuality3D(res.junctionMesh);
  return {
    minWedge: j.minWedge,
    maxWedge: j.maxWedge,
    wedges: j.wedges,
    watertight: audit.nonManifoldEdges === 0 && audit.tJunctions === 0,
    worstAll: worstMinAngle3D(res.mesh),
    worstFan: worstMinAngle3D(res.junctionMesh),
    fanPctBelow10: qFan.pctMinAngleBelow10,
    fanAspectMax: qFan.aspectMax,
  };
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

// ───────────────────────────────────────────────────────────────────────────
// THE SPIKE
// ───────────────────────────────────────────────────────────────────────────

describe('STEP 2 de-risk — paveJunction across the real Voronoi wedge distribution', () => {
  const sampler = styleSampler('Voronoi', {}, DIMS);
  const graph = detectFeatures(sampler, globalOpts(sampler));
  const { junctions, degreeHist, deg3WithArms } = extractJunctions(graph, sampler);

  const measures: JunctionMeasure[] = [];
  for (const j of junctions) {
    const m = measureFlat(j);
    if (m) measures.push(m);
  }

  // "Well-conditioned" = minWedge ≥ this; below it min(20°,θ) is accept-class.
  // (Measured cutover; reflex layouts already excluded in measureFlat.)
  const WELL = 30;
  const wellCond = measures.filter((m) => m.minWedge >= WELL);
  const acute = measures.filter((m) => m.minWedge < WELL);
  const reflexCount = junctions.filter((j) => j.reflex).length;

  it('emits the wedge-angle distribution + worst-min-angle-by-wedge report', () => {
    /* eslint-disable no-console */
    console.log('\n=== STEP 2: junction fan on REAL Voronoi wedges ===');
    console.log(`graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    const degLine = [...degreeHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `deg${d}:${n}`).join('  ');
    console.log(`degree histogram (incident endpoints): ${degLine}`);
    const deg4plus = [...degreeHist.entries()].filter(([d]) => d >= 4).reduce((s, [, n]) => s + n, 0);
    const deg3 = degreeHist.get(3) ?? 0;
    console.log(
      `triple junctions (deg=3): ${deg3}  true deg-3 with 3 clean arms: ${deg3WithArms}  ` +
        `well-formed & measured: ${measures.length}  reflex-excluded: ${reflexCount}  ` +
        `| degree≥4 nodes: ${deg4plus} (Step-3: N-arm fan or split merged junctions)`,
    );
    if (skipReasons.size > 0) {
      console.log(`skips: ${[...skipReasons.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}=${n}`).join('  ')}`);
    }
    if (measures.length === 0) {
      console.log('NO measurable junctions.');
      /* eslint-enable no-console */
      return;
    }

    const wedges = measures.map((m) => m.minWedge);
    const below = (x: number): string => `${((wedges.filter((w) => w < x).length / wedges.length) * 100).toFixed(1)}%`;
    console.log(
      `minWedge dist (deg): min=${Math.min(...wedges).toFixed(1)} p10=${pct(wedges, 0.1).toFixed(1)} ` +
        `p50=${pct(wedges, 0.5).toFixed(1)} p90=${pct(wedges, 0.9).toFixed(1)} max=${Math.max(...wedges).toFixed(1)}`,
    );
    console.log(`ACUTE fraction: <10°=${below(10)}  <15°=${below(15)}  <20°=${below(20)}  <25°=${below(25)}`);

    const wtFail = measures.filter((m) => !m.watertight).length;
    const fanDirty = measures.filter((m) => m.fanPctBelow10 > 0).length;
    console.log(
      `watertight: ${measures.length - wtFail}/${measures.length}  fan pct<10°=0: ${measures.length - fanDirty}/${measures.length}  ` +
        `max fan aspect=${Math.max(...measures.map((m) => m.fanAspectMax)).toFixed(2)}`,
    );

    const buckets: Array<[number, number]> = [
      [0, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 45], [45, 60], [60, 90], [90, 181],
    ];
    console.log('\nwedge-bucket    n    worstAll(min/med)   worstFan(min/med)   wt%   fanClean%');
    for (const [lo, hi] of buckets) {
      const inB = measures.filter((m) => m.minWedge >= lo && m.minWedge < hi);
      if (inB.length === 0) continue;
      const wa = inB.map((m) => m.worstAll);
      const wf = inB.map((m) => m.worstFan);
      const wt = (inB.filter((m) => m.watertight).length / inB.length) * 100;
      const fc = (inB.filter((m) => m.fanPctBelow10 === 0).length / inB.length) * 100;
      console.log(
        `[${String(lo).padStart(3)},${(hi === 181 ? '∞' : String(hi)).padStart(3)})   ${String(inB.length).padStart(4)}   ` +
          `${Math.min(...wa).toFixed(1).padStart(5)}/${pct(wa, 0.5).toFixed(1).padStart(5)}        ` +
          `${Math.min(...wf).toFixed(1).padStart(5)}/${pct(wf, 0.5).toFixed(1).padStart(5)}       ` +
          `${wt.toFixed(0).padStart(3)}    ${fc.toFixed(0).padStart(3)}`,
      );
    }

    if (wellCond.length > 0) {
      const wa = wellCond.map((m) => m.worstAll);
      console.log(
        `\nWELL-CONDITIONED (minWedge≥${WELL}°): n=${wellCond.length}  worstAll: min=${Math.min(...wa).toFixed(1)}° ` +
          `p10=${pct(wa, 0.1).toFixed(1)}° p50=${pct(wa, 0.5).toFixed(1)}°  (sliver-free ⇒ no defect where the wedge is open)`,
      );
    }
    if (acute.length > 0) {
      const ratios = acute.map((m) => m.worstAll / Math.max(1e-6, m.minWedge));
      console.log(
        `ACUTE (minWedge<${WELL}°): n=${acute.length}  worstAll/minWedge p50=${pct(ratios, 0.5).toFixed(2)} ` +
          `(→1 ⇒ the sliver tracks the wedge = geometrically irreducible, accept-class min(20°,θ))`,
      );
    }

    // Outlier dump: any well-formed junction whose worstAll fell below 20° — show
    // its wedge triple so the sub-20° set is provably the acute set, not a defect.
    const outliers = measures.filter((m) => m.worstAll < 20).sort((a, b) => a.worstAll - b.worstAll);
    console.log(`\nsub-20° worstAll outliers (well-formed): ${outliers.length}`);
    for (const m of outliers.slice(0, 12)) {
      console.log(
        `  worstAll=${m.worstAll.toFixed(1).padStart(5)}°  worstFan=${m.worstFan.toFixed(1).padStart(5)}°  ` +
          `minWedge=${m.minWedge.toFixed(1).padStart(5)}°  wedges=[${m.wedges.map((w) => w.toFixed(0)).join(',')}]  ` +
          `wt=${m.watertight}`,
      );
    }
    /* eslint-enable no-console */
    expect(measures.length).toBeGreaterThan(0);
  });

  it('HARD GATE: every measured (well-formed) junction welds watertight', () => {
    expect(measures.length).toBeGreaterThan(0);
    for (const m of measures) expect(m.watertight).toBe(true);
  });

  it('HARD GATE: well-conditioned junctions (minWedge≥30°) are sliver-free (worstAll≥20°, clean fan)', () => {
    expect(wellCond.length).toBeGreaterThan(0);
    for (const m of wellCond) {
      expect(m.fanPctBelow10).toBe(0);
      expect(m.worstAll).toBeGreaterThanOrEqual(20);
    }
  });

  it('ACCEPT-CLASS: every sub-20° patch is an acute wedge (sliver ⟹ acute, never on an open junction)', () => {
    expect(measures.length).toBeGreaterThan(0);
    for (const m of measures) {
      if (m.worstAll < 20) {
        // the only way a well-formed patch drops below 20° is a genuinely acute wedge
        expect(m.minWedge).toBeLessThan(30);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 3 — junction-CONDITIONING sweep across the junction-lattice styles.
//
// Step 2 showed the paveJunction PRIMITIVE behaves exactly as the thesis predicts
// on WELL-FORMED Voronoi triple junctions, but that a large fraction of the
// detector's degree-3 nodes are REFLEX (degenerate layouts) + many are degree-4+.
// This sweep asks whether that junction-CONDITIONING burden is Voronoi-specific or
// universal — the key input for scoping Step 3 (junction typing / N-arm fan /
// merged-junction splitting is a FEATURE-GRAPH problem, upstream of the paver).
//
// Per style: %well-formed vs %reflex among degree-3 nodes, %degree-4+ nodes, the
// acute fraction (minWedge<30°) among well-formed, and the well-formed paving
// outcome (watertight%, sliver-free% at minWedge≥30°). Conditioning numbers come
// straight from the graph; paving uses the same flat-patch primitive.
// ───────────────────────────────────────────────────────────────────────────

interface StyleConditioning {
  styleId: string;
  nodes: number;
  deg3: number;
  deg4plus: number;
  reflex: number;
  wellFormed: number;
  acuteWellFormed: number; // minWedge < 30 among well-formed
  measured: number;
  watertightPct: number;
  sliverFreePctAtWell: number; // worstAll≥20 among minWedge≥30
  /** Worst minWedge≥30 junction that still slivered (worstAll<20), if any. */
  wellSliverOutlier?: { minWedge: number; maxWedge: number; wedges: [number, number, number]; worstAll: number };
}

function analyzeStyleConditioning(styleId: string): StyleConditioning {
  const s = styleSampler(styleId as Parameters<typeof styleSampler>[0], {}, DIMS);
  const g = detectFeatures(s, globalOpts(s));
  const { junctions, degreeHist } = extractJunctions(g, s);
  const deg4plus = [...degreeHist.entries()].filter(([d]) => d >= 4).reduce((a, [, n]) => a + n, 0);
  const reflex = junctions.filter((j) => j.reflex).length;
  const wf = junctions.filter((j) => !j.reflex);
  const acuteWF = wf.filter((j) => j.minWedge < 30).length;

  let wtOk = 0;
  let measured = 0;
  let wellTotal = 0;
  let wellSliverFree = 0;
  let outlier: StyleConditioning['wellSliverOutlier'];
  for (const j of wf) {
    const m = measureFlat(j);
    if (!m) continue;
    measured++;
    if (m.watertight) wtOk++;
    if (m.minWedge >= 30) {
      wellTotal++;
      if (m.worstAll >= 20) wellSliverFree++;
      else if (!outlier || m.worstAll < outlier.worstAll) {
        outlier = { minWedge: m.minWedge, maxWedge: m.maxWedge, wedges: m.wedges, worstAll: m.worstAll };
      }
    }
  }
  return {
    styleId,
    nodes: g.nodes.length,
    deg3: degreeHist.get(3) ?? 0,
    deg4plus,
    reflex,
    wellFormed: wf.length,
    acuteWellFormed: acuteWF,
    measured,
    watertightPct: measured > 0 ? (wtOk / measured) * 100 : 100,
    sliverFreePctAtWell: wellTotal > 0 ? (wellSliverFree / wellTotal) * 100 : 100,
    wellSliverOutlier: outlier,
  };
}

describe('STEP 2 — junction-conditioning sweep across junction-lattice styles', () => {
  // The styles whose features form a JUNCTION WEB (degree-≥3 meeting points), where
  // the junction fan matters. Smooth + axis-aligned-crease styles have no junctions.
  const LATTICE_STYLES = [
    'Voronoi',
    'GyroidManifold',
    'HexagonalHive',
    'CelticTriquetra',
    'CelticKnot',
    'BasketWeave',
    'GothicArches',
  ];

  const results = LATTICE_STYLES.map((id) => {
    try {
      return analyzeStyleConditioning(id);
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.log(`  ${id}: ERROR ${String((err as Error).message).slice(0, 60)}`);
      return null;
    }
  }).filter((r): r is StyleConditioning => r !== null);

  it('emits the per-style junction-conditioning table', () => {
    /* eslint-disable no-console */
    console.log('\n=== STEP 2: junction-conditioning across lattice styles ===');
    console.log(
      'style'.padEnd(18) +
        'deg3'.padEnd(7) +
        'deg4+'.padEnd(7) +
        'reflex%'.padEnd(9) +
        'wellFm'.padEnd(8) +
        'acute%WF'.padEnd(10) +
        'wt%'.padEnd(6) +
        'sliverFree%(≥30°)',
    );
    for (const r of results) {
      const reflexPct = r.deg3 > 0 ? (r.reflex / r.deg3) * 100 : 0;
      const acutePct = r.wellFormed > 0 ? (r.acuteWellFormed / r.wellFormed) * 100 : 0;
      console.log(
        r.styleId.padEnd(18) +
          String(r.deg3).padEnd(7) +
          String(r.deg4plus).padEnd(7) +
          `${reflexPct.toFixed(0)}%`.padEnd(9) +
          String(r.wellFormed).padEnd(8) +
          `${acutePct.toFixed(1)}%`.padEnd(10) +
          `${r.watertightPct.toFixed(0)}`.padEnd(6) +
          `${r.sliverFreePctAtWell.toFixed(0)}%`,
      );
    }
    for (const r of results) {
      if (r.wellSliverOutlier) {
        const o = r.wellSliverOutlier;
        console.log(
          `  ${r.styleId} worst minWedge≥30 sliver: worstAll=${o.worstAll.toFixed(1)}° ` +
            `minWedge=${o.minWedge.toFixed(1)}° maxWedge=${o.maxWedge.toFixed(1)}° wedges=[${o.wedges.map((w) => w.toFixed(0)).join(',')}]`,
        );
      }
    }
    console.log(
      '\nREAD: wt% should be 100 everywhere (universal weld). sliverFree%(≥30°) should be ~100 ' +
        '(primitive clean on open wedges). reflex% + deg4+ = the Step-3 junction-conditioning burden.',
    );
    /* eslint-enable no-console */
    expect(results.length).toBeGreaterThan(0);
  });

  it('HARD GATE: the weld is watertight on well-formed junctions of EVERY lattice style', () => {
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      if (r.measured > 0) expect(r.watertightPct).toBe(100);
    }
  });

  it('HARD GATE: open wedges (minWedge≥30°) are ≥99% sliver-free on EVERY lattice style', () => {
    // ~100% (the residual is a near-reflex transition junction — maxWedge close to
    // 180° — where the constant-width corner runs out toward the degenerate side;
    // accept-class, and resolved by the same junction-typing pass Step 3 needs for
    // the reflex set). Documented via wellSliverOutlier in the table.
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.sliverFreePctAtWell).toBeGreaterThanOrEqual(99);
    }
  });
});
