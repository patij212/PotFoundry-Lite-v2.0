/**
 * ADVERSARIAL probe of the Step-2 junction-fan de-risk conclusion.
 *
 * Three questions the reviewer must settle empirically:
 *  (a) HONEST COVERAGE: what fraction of ALL detected junction nodes (deg>=3) does
 *      the primitive handle cleanly end-to-end? The headline "2-4% acute among
 *      well-formed" is computed over a 60%-of-deg3 / ~50%-of-all-junctions subset.
 *  (b) IS REFLEX UNPAVEABLE BY paveJunction, OR JUST UNTRIED? The original spike's
 *      measureFlat() early-returns on reflex BEFORE calling paveJunction. The corner
 *      formula buildFlatArms() is what fails (corner on the bisector at d=halfW/sin),
 *      not paveJunction. Try paveJunction directly on reflex layouts via a corner
 *      builder that DOES place corners for reflex wedges (true ribbon-edge
 *      intersection, the same construction junction.test.ts:buildUnequalWidthArms
 *      uses) and see whether paveJunction itself welds/cleans them.
 *  (c) DEGREE-4+: the spike paves ZERO of them. Quantify the node mass.
 *
 * Throwaway probe. Touches NO production code.
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

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;

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

function samplerRadius(s: SurfaceSampler, u: number, t: number): number {
  const [x, y] = s.position(u, t);
  return Math.hypot(x, y);
}
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t);
    if (cached !== undefined) return cached;
    let sum = 0;
    const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t);
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
    return Math.abs(samplerRadius(s, u, t) - mean) - floor;
  };
}
function globalOpts(s: SurfaceSampler): DetectFeaturesOptions {
  return { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(s) };
}

// ── geometry helpers ──
function sub3(a: Vec3, b: Vec3): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len3(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
function norm3(a: Vec3): [number, number, number] { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function triMinAngle(A: Vec3, B: Vec3, C: Vec3): number {
  const a = len3(sub3(B, C)), b = len3(sub3(C, A)), c = len3(sub3(A, B));
  const ang = (x: number, y: number, o: number): number => {
    if (x <= 0 || y <= 0) return 0;
    const cos = Math.max(-1, Math.min(1, (x * x + y * y - o * o) / (2 * x * y)));
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}
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

interface Junction {
  wedges: [number, number, number];
  azims: [number, number, number]; // sorted arm azimuths (rad)
  minWedge: number;
  maxWedge: number;
  reflex: boolean;
}

function utDistMm(au: number, at: number, bu: number, bt: number): number {
  let d = Math.abs(au - bu) % 1;
  if (d > 0.5) d = 1 - d;
  return Math.hypot(d * U_TO_MM, (at - bt) * T_TO_MM);
}

interface IncidentArm { azim: number; }

function extractJunctions(graph: FeatureGraph, sampler: SurfaceSampler): {
  junctions: Junction[];
  degreeHist: Map<number, number>;
  deg3WithArms: number;
} {
  const degree = new Map<number, number>();
  for (const e of graph.edges) for (const idx of e.endpoints) degree.set(idx, (degree.get(idx) ?? 0) + 1);
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
    arr.push({ azim });
    incident.set(nodeIdx, arr);
  };

  for (const e of graph.edges) {
    const poly = e.polyline;
    if (poly.length < 2) continue;
    const [ia, ib] = e.endpoints;
    if (ia === ib) continue;
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
  for (const arms of incident.values()) {
    if (arms.length !== 3) continue;
    deg3WithArms++;
    const sorted = [...arms].sort((p, q) => p.azim - q.azim);
    const w: number[] = [];
    for (let i = 0; i < 3; i++) {
      let gap = sorted[(i + 1) % 3].azim - sorted[i].azim;
      if (gap <= 0) gap += 2 * Math.PI;
      w.push((gap * 180) / Math.PI);
    }
    const wedges: [number, number, number] = [w[0], w[1], w[2]];
    const azims: [number, number, number] = [sorted[0].azim, sorted[1].azim, sorted[2].azim];
    const minWedge = Math.min(...wedges);
    const maxWedge = Math.max(...wedges);
    junctions.push({ wedges, azims, minWedge, maxWedge, reflex: maxWedge > 180 });
  }
  return { junctions, degreeHist, deg3WithArms };
}

const FLAT: SurfaceSampler = { position: (u: number, t: number): Vec3 => [u, t, 0] };
const TARGET_W_MM = 4.0;
const TARGET_L_MM = 16.0;
const TARGET_EDGE_MM = 3.0;

/**
 * REFLEX-CAPABLE corner builder. Places each arm's two junction-end corners at the
 * TRUE intersection of adjacent ribbon edges (offset lines), exactly the
 * construction junction.test.ts:buildUnequalWidthArms uses — which is well-defined
 * for reflex wedges (the corner simply moves to the OTHER side of the center).
 * Uses the REAL per-arm azimuths (not just the sector wedge), so it works for any
 * azimuth configuration including reflex (one sector > 180°).
 */
function buildArmsByEdgeIntersection(azims: [number, number, number]): JunctionArm[] | null {
  const w = TARGET_W_MM;
  // For arm i: direction d_i = (cos a, sin a); perp p_i = (-sin a, cos a).
  // Its crest edge is offset +w along p_i; foot edge offset -w along p_i.
  // Corner k = intersection of arm (k-1)'s crest edge (+w) and arm k's foot edge (-w).
  const d = azims.map((a) => ({ u: Math.cos(a), t: Math.sin(a) }));
  const p = azims.map((a) => ({ u: -Math.sin(a), t: Math.cos(a) }));
  const cornerAt = (k: number): StationPoint | null => {
    const i = (k + 2) % 3; // previous arm
    const j = k;           // this arm
    // Point on arm i crest edge: through (w*p_i) along d_i.
    const q1u = w * p[i].u, q1t = w * p[i].t;
    // Point on arm j foot edge: through (-w*p_j) along d_j.
    const q2u = -w * p[j].u, q2t = -w * p[j].t;
    // Solve q1 + s*d_i = q2 + r*d_j.
    const det = d[i].u * -d[j].t - d[i].t * -d[j].u;
    if (Math.abs(det) < 1e-9) return null;
    const bx = q2u - q1u, by = q2t - q1t;
    const s = (bx * -d[j].t - by * -d[j].u) / det;
    const cu = q1u + s * d[i].u, ct = q1t + s * d[i].t;
    if (!(Math.hypot(cu, ct) < 1e4)) return null;
    return { u: cu, t: ct };
  };
  const corner: StationPoint[] = [];
  for (let k = 0; k < 3; k++) {
    const c = cornerAt(k);
    if (!c) return null;
    corner.push(c);
  }
  const arms: JunctionArm[] = [];
  for (let i = 0; i < 3; i++) {
    const axu = d[i].u, axt = d[i].t;
    const pu = p[i].u, pt = p[i].t;
    const footCorner = corner[i];
    const crestCorner = corner[(i + 1) % 3];
    const dFoot = Math.hypot(footCorner.u, footCorner.t);
    const dCrest = Math.hypot(crestCorner.u, crestCorner.t);
    const outerDist = Math.max(dFoot, dCrest) + TARGET_L_MM;
    arms.push({
      footRail: [
        { u: axu * outerDist - w * pu, t: axt * outerDist - w * pt },
        footCorner,
      ],
      crestRail: [
        { u: axu * outerDist + w * pu, t: axt * outerDist + w * pt },
        crestCorner,
      ],
      junctionFoot: footCorner,
      junctionCrest: crestCorner,
    });
  }
  return arms;
}

interface PaveOutcome {
  ok: boolean;
  watertight: boolean;
  worstAll: number;
  worstFan: number;
  reason?: string;
}

function tryPave(azims: [number, number, number]): PaveOutcome {
  const arms = buildArmsByEdgeIntersection(azims);
  if (!arms) return { ok: false, watertight: false, worstAll: 0, worstFan: 0, reason: 'corner-build-fail' };
  let res;
  try {
    res = paveJunction(arms, FLAT, TARGET_EDGE_MM);
  } catch (err) {
    return { ok: false, watertight: false, worstAll: 0, worstFan: 0, reason: `pave-throw:${String((err as Error).message).slice(0, 40)}` };
  }
  const audit = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
  const wt = audit.nonManifoldEdges === 0 && audit.tJunctions === 0;
  return {
    ok: true,
    watertight: wt,
    worstAll: worstMinAngle3D(res.mesh),
    worstFan: worstMinAngle3D(res.junctionMesh),
  };
}

const LATTICE_STYLES = ['Voronoi', 'GyroidManifold', 'HexagonalHive', 'CelticTriquetra', 'CelticKnot', 'BasketWeave', 'GothicArches'];

describe('ADVERSARIAL — honest coverage + reflex-paveability of the junction primitive', () => {
  it('(a)+(c) HONEST END-TO-END COVERAGE across ALL junction nodes', () => {
    /* eslint-disable no-console */
    console.log('\n=== HONEST COVERAGE: fraction of ALL detected junctions handled clean by the primitive ===');
    console.log(
      'style'.padEnd(16) + 'allJxn'.padEnd(8) + 'deg3'.padEnd(7) + 'deg4+'.padEnd(7) +
      'reflex'.padEnd(8) + 'wf'.padEnd(6) + 'wf&clean'.padEnd(10) + 'clean/allJxn',
    );
    let totAll = 0, totClean = 0;
    for (const id of LATTICE_STYLES) {
      const s = styleSampler(id as Parameters<typeof styleSampler>[0], {}, DIMS);
      const g = detectFeatures(s, globalOpts(s));
      const { junctions, degreeHist } = extractJunctions(g, s);
      const deg3 = degreeHist.get(3) ?? 0;
      const deg4plus = [...degreeHist.entries()].filter(([d]) => d >= 4).reduce((a, [, n]) => a + n, 0);
      const allJxn = [...degreeHist.entries()].filter(([d]) => d >= 3).reduce((a, [, n]) => a + n, 0);
      const reflex = junctions.filter((j) => j.reflex).length;
      const wf = junctions.filter((j) => !j.reflex);
      // "clean" = well-formed AND paves watertight AND worstAll>=20 (open-wedge clean,
      // i.e. not even the acute accept-class). This is the strict "no defect at all" set.
      let wfClean = 0;
      for (const j of wf) {
        const o = tryPave(j.azims);
        if (o.ok && o.watertight && o.worstAll >= 20) wfClean++;
      }
      totAll += allJxn;
      totClean += wfClean;
      console.log(
        id.padEnd(16) + String(allJxn).padEnd(8) + String(deg3).padEnd(7) + String(deg4plus).padEnd(7) +
        String(reflex).padEnd(8) + String(wf.length).padEnd(6) + String(wfClean).padEnd(10) +
        `${((wfClean / allJxn) * 100).toFixed(0)}%`,
      );
    }
    console.log(`\nTOTAL across 7 lattice styles: cleanly-handled / all-junctions = ${totClean}/${totAll} = ${((totClean / totAll) * 100).toFixed(1)}%`);
    console.log('(clean = well-formed deg3 that paves watertight with worstAll>=20; excludes acute accept-class, reflex, and ALL deg4+)');
    /* eslint-enable no-console */
    expect(totAll).toBeGreaterThan(0);
  }, 120000);

  it('(b) IS REFLEX UNPAVEABLE BY paveJunction, OR JUST UNTRIED BY THE SPIKE?', () => {
    /* eslint-disable no-console */
    console.log('\n=== REFLEX PAVEABILITY: drive paveJunction on the 137 reflex Voronoi junctions ===');
    const s = styleSampler('Voronoi', {}, DIMS);
    const g = detectFeatures(s, globalOpts(s));
    const { junctions } = extractJunctions(g, s);
    const reflex = junctions.filter((j) => j.reflex);
    let built = 0, paved = 0, wt = 0, fanClean = 0;
    const reasons = new Map<string, number>();
    const worstAlls: number[] = [];
    const worstFans: number[] = [];
    for (const j of reflex) {
      const arms = buildArmsByEdgeIntersection(j.azims);
      if (!arms) { reasons.set('corner-fail', (reasons.get('corner-fail') ?? 0) + 1); continue; }
      built++;
      const o = tryPave(j.azims);
      if (!o.ok) { reasons.set(o.reason ?? 'pave-fail', (reasons.get(o.reason ?? 'pave-fail') ?? 0) + 1); continue; }
      paved++;
      if (o.watertight) wt++;
      if (o.worstFan >= 10) fanClean++;
      worstAlls.push(o.worstAll);
      worstFans.push(o.worstFan);
    }
    const pct = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const ss = [...arr].sort((a, b) => a - b);
      return ss[Math.min(ss.length - 1, Math.floor(ss.length * p))];
    };
    console.log(`reflex junctions: ${reflex.length}`);
    console.log(`  corner built (edge-intersection): ${built}`);
    console.log(`  paveJunction returned: ${paved}  watertight: ${wt}  fan worst>=10: ${fanClean}`);
    if (reasons.size > 0) console.log(`  failure reasons: ${[...reasons.entries()].map(([r, n]) => `${r}=${n}`).join('  ')}`);
    if (worstAlls.length > 0) {
      console.log(`  worstAll over paved reflex: min=${Math.min(...worstAlls).toFixed(1)} p10=${pct(worstAlls, 0.1).toFixed(1)} p50=${pct(worstAlls, 0.5).toFixed(1)}`);
      console.log(`  worstFan over paved reflex: min=${Math.min(...worstFans).toFixed(1)} p10=${pct(worstFans, 0.1).toFixed(1)} p50=${pct(worstFans, 0.5).toFixed(1)}`);
      const fanBelow10 = worstFans.filter((x) => x < 10).length;
      console.log(`  reflex fans with a sub-10 sliver IN THE FAN ITSELF: ${fanBelow10}/${worstFans.length}`);
    }
    console.log('\nINTERPRETATION:');
    console.log('  If watertight==paved and most reflex fans are clean => reflex is PAVEABLE by paveJunction;');
    console.log('  the spike EXCLUDED them via measureFlat early-return, NOT because the primitive fails.');
    console.log('  If reflex fans carry sub-10 slivers / non-watertight => reflex is a genuine primitive limit.');
    /* eslint-enable no-console */
    expect(reflex.length).toBeGreaterThan(0);
  }, 120000);
});
