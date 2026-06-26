/**
 * SYNTHESIS-JUDGE VERIFICATION PROBE (throwaway). Reproduces the disputed
 * "real curved surface" claim that two skeptics attributed to repo files that do
 * NOT exist (junctionWedge.realsurface.arclen.test.ts / .adversarial.test.ts).
 *
 * It builds, for each REAL well-formed degree-3 Voronoi junction, three
 * constant-3D-WIDTH ribbons anchored at the real node (u,t) and radiating along
 * the REAL incident edge directions, ON THE REAL curved/anisotropic Voronoi
 * surface (styleSampler), then paves with the REAL paveJunction and measures
 * worst 3D min-angle (whole patch + fan) and watertightness. Compares directly to
 * the flat-isotropic result of the original spike.
 *
 * Width and reach are converted mm -> (u,t) via the LOCAL metric at the node
 * (|position_u|, |position_t|), so the ribbon is ~constant 3D width regardless of
 * anisotropy — a faithful model of a real feature-aligned strip.
 *
 * Throwaway. No production code touched.
 */

import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { SurfaceSampler, Vec3 } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import { auditWatertight } from './audit';
import type { Mesh3 } from './audit';
import { paveJunction } from './junction';
import type { JunctionArm } from './junction';
import type { StationPoint } from './stations';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  uToMm: U_TO_MM, tToMm: T_TO_MM,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};
const RELIEF_MEAN_SAMPLES = 256, RELIEF_ALPHA = 0.5, RELIEF_ABS_FLOOR_MM = 1e-3;

function samplerRadius(s: SurfaceSampler, u: number, t: number): number {
  const [x, y] = s.position(u, t); return Math.hypot(x, y);
}
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t); if (cached !== undefined) return cached;
    let sum = 0; const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t); rs[i] = r; sum += r; }
    const mean = sum / RELIEF_MEAN_SAMPLES; let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const d = rs[i] - mean; sq += d * d; }
    const rms = Math.sqrt(sq / RELIEF_MEAN_SAMPLES);
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * rms) };
    rowStats.set(t, stats); return stats;
  };
  return (u, t) => { const { mean, floor } = statsAtT(t); return Math.abs(samplerRadius(s, u, t) - mean) - floor; };
}
function globalOpts(s: SurfaceSampler): DetectFeaturesOptions { return { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(s) }; }

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
  const { positions, indices } = mesh; let worst = Infinity;
  const P = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || c === a) continue;
    const m = triMinAngle(P(a), P(b), P(c)); if (m < worst) worst = m;
  }
  return worst === Infinity ? 0 : worst;
}
const METRIC_EPS = 1e-4;

interface IncidentArm { du: number; dt: number; azim: number; }
interface Junction { nodeIdx: number; arms: IncidentArm[]; wedges: [number, number, number]; minWedge: number; maxWedge: number; reflex: boolean; }

function utDistMm(au: number, at: number, bu: number, bt: number): number {
  let d = Math.abs(au - bu) % 1; if (d > 0.5) d = 1 - d;
  return Math.hypot(d * U_TO_MM, (at - bt) * T_TO_MM);
}

function extractJunctions(graph: FeatureGraph, sampler: SurfaceSampler): Junction[] {
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
    arr.push({ du: dirUT.du, dt: dirUT.dt, azim });
    incident.set(nodeIdx, arr);
  };
  for (const e of graph.edges) {
    const poly = e.polyline; if (poly.length < 2) continue;
    const [ia, ib] = e.endpoints; if (ia === ib) continue;
    const dirFromEnd = (nodeIdx: number): { du: number; dt: number } | null => {
      const node = graph.nodes[nodeIdx];
      const dHead = utDistMm(node.u, node.t, poly[0].u, poly[0].t);
      const dTail = utDistMm(node.u, node.t, poly[poly.length - 1].u, poly[poly.length - 1].t);
      const seq = dHead <= dTail ? poly : [...poly].reverse();
      for (let k = 1; k < seq.length; k++) {
        let su = (seq[k].u - node.u) % 1; if (su > 0.5) su -= 1; if (su < -0.5) su += 1;
        const dt = seq[k].t - node.t;
        if (utDistMm(node.u, node.t, seq[k].u, seq[k].t) > 0.5) {
          const l = Math.hypot(su, dt) || 1; return { du: su / l, dt: dt / l };
        }
      }
      return null;
    };
    addIncident(ia, dirFromEnd(ia)); addIncident(ib, dirFromEnd(ib));
  }
  const out: Junction[] = [];
  for (const [nodeIdx, arms] of incident) {
    if (arms.length !== 3) continue;
    const sorted = [...arms].sort((p, q) => p.azim - q.azim);
    const w: number[] = [];
    for (let i = 0; i < 3; i++) { let gap = sorted[(i + 1) % 3].azim - sorted[i].azim; if (gap <= 0) gap += 2 * Math.PI; w.push((gap * 180) / Math.PI); }
    const wedges: [number, number, number] = [w[0], w[1], w[2]];
    const minWedge = Math.min(...wedges), maxWedge = Math.max(...wedges);
    out.push({ nodeIdx, arms: sorted, wedges, minWedge, maxWedge, reflex: maxWedge > 180 });
  }
  return out;
}

const TARGET_W_MM = 4.0, TARGET_L_MM = 16.0, TARGET_EDGE_MM = 3.0;

/**
 * Arc-length-correct rail densifier (the STEELMAN the skeptics describe). Unlike
 * stitch.ts densifyRail (sizes nSub by the original 3D segment length then splits
 * by equal PARAMETER — under-resolves relief), this measures the ACTUAL 3D
 * sub-segment spacing and recursively subdivides until every consecutive 3D gap
 * is <= maxSpacingMm. Endpoints/interior original vertices preserved.
 */
function densifyRailArcLen(
  rail: readonly StationPoint[], sampler: SurfaceSampler, maxSpacingMm: number,
): StationPoint[] {
  if (rail.length < 2) return rail.map((p) => ({ u: p.u, t: p.t }));
  const out: StationPoint[] = [{ u: rail[0].u, t: rail[0].t }];
  const p = (s: StationPoint): Vec3 => sampler.position(s.u, s.t);
  const seg3 = (a: StationPoint, b: StationPoint): number => {
    const pa = p(a), pb = p(b); return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
  };
  for (let i = 1; i < rail.length; i++) {
    const a = rail[i - 1], b = rail[i];
    // oversample by parameter, then keep only points whose 3D spacing stays under cap
    let n = Math.max(1, Math.ceil(seg3(a, b) / maxSpacingMm));
    // iteratively raise n until max 3D sub-gap <= cap (handles relief in the middle)
    for (let iter = 0; iter < 12; iter++) {
      let maxGap = 0; let prevPt = a;
      for (let k = 1; k <= n; k++) {
        const al = k / n; const cur = { u: a.u + (b.u - a.u) * al, t: a.t + (b.t - a.t) * al };
        maxGap = Math.max(maxGap, seg3(prevPt, cur)); prevPt = cur;
      }
      if (maxGap <= maxSpacingMm) break;
      n = Math.ceil(n * (maxGap / maxSpacingMm) * 1.05) + 1;
      if (n > 20000) break;
    }
    for (let k = 1; k < n; k++) {
      const al = k / n; out.push({ u: a.u + (b.u - a.u) * al, t: a.t + (b.t - a.t) * al });
    }
    out.push({ u: b.u, t: b.t });
  }
  return out;
}

/**
 * Build 3 real-surface arms anchored at node (nodeU,nodeT). Each arm runs
 * OUTER->junction. Corners placed on each sector bisector at 3D radius
 * halfW/sin(wedge/2), converted to (u,t) via the LOCAL metric so 3D width
 * ~= 2*halfW. Same corner-placement law as the flat spike (buildFlatArms) — only
 * the surface differs.
 */
function buildRealArmsAt(nodeU: number, nodeT: number, j: Junction, sampler: SurfaceSampler): JunctionArm[] | null {
  const p0 = sampler.position(nodeU, nodeT);
  const pu = sub3(sampler.position(nodeU + METRIC_EPS, nodeT), sampler.position(nodeU - METRIC_EPS, nodeT));
  const pt = sub3(sampler.position(nodeU, nodeT + METRIC_EPS), sampler.position(nodeU, nodeT - METRIC_EPS));
  const uMmPerUnit = len3(pu) / (2 * METRIC_EPS); // |position_u|
  const tMmPerUnit = len3(pt) / (2 * METRIC_EPS); // |position_t|
  if (!(uMmPerUnit > 1e-6) || !(tMmPerUnit > 1e-6)) return null;
  void p0;
  const deg = Math.PI / 180;
  const wedges = j.wedges;
  const a: number[] = [0, wedges[0] * deg, (wedges[0] + wedges[1]) * deg];
  // arm azimuths are tangent-plane angles relative to the (eu,evn) frame the
  // detector used; we reconstruct arm UV directions from each arm's actual du/dt.
  const armDir = j.arms.map((arm) => ({ du: arm.du, dt: arm.dt }));
  // sector corner i sits between arm i and arm i+1, on the bisector at 3D radius dR.
  const corner: StationPoint[] = [];
  for (let i = 0; i < 3; i++) {
    const half = (wedges[i] * deg) / 2; const s = Math.sin(half);
    if (!(s > 1e-4)) return null;
    const dR = TARGET_W_MM / s; if (!(dR < 1e4)) return null;
    // bisector UV direction = normalized sum of arm i and arm i+1 UV dirs (scaled to ~equal 3D length)
    const d0 = armDir[i], d1 = armDir[(i + 1) % 3];
    // scale each to unit 3D first
    const scl = (d: { du: number; dt: number }): { du: number; dt: number } => {
      const mm = Math.hypot(d.du * uMmPerUnit, d.dt * tMmPerUnit) || 1;
      return { du: d.du / mm, dt: d.dt / mm };
    };
    const s0 = scl(d0), s1 = scl(d1);
    let bu = s0.du + s1.du, bt = s0.dt + s1.dt;
    const bmm = Math.hypot(bu * uMmPerUnit, bt * tMmPerUnit) || 1;
    bu /= bmm; bt /= bmm; // unit-3D bisector
    corner.push({ u: nodeU + bu * dR, t: nodeT + bt * dR });
  }
  void a;
  const arms: JunctionArm[] = [];
  for (let i = 0; i < 3; i++) {
    const d = armDir[i];
    const mm = Math.hypot(d.du * uMmPerUnit, d.dt * tMmPerUnit) || 1;
    const axu = d.du / mm, axt = d.dt / mm; // unit-3D arm dir in uv
    // perp in uv (approx): rotate the unit-3D dir by 90deg in the metric — use (-axt*tScale.., ) simple approx
    // Build perp via tangent-plane: perp3D ~ cross(normal, armDir3D). Simpler: use the
    // metric-orthogonal uv perp = (-axt * (tMm/uMm), axu * (uMm/tMm)) then renormalize 3D.
    let pUu = -axt * (tMmPerUnit / uMmPerUnit);
    let pUt = axu * (uMmPerUnit / tMmPerUnit);
    const pmm = Math.hypot(pUu * uMmPerUnit, pUt * tMmPerUnit) || 1;
    pUu /= pmm; pUt /= pmm;
    const footCorner = corner[(i + 2) % 3];
    const crestCorner = corner[i];
    const dFoot = Math.hypot((footCorner.u - nodeU) * uMmPerUnit, (footCorner.t - nodeT) * tMmPerUnit);
    const dCrest = Math.hypot((crestCorner.u - nodeU) * uMmPerUnit, (crestCorner.t - nodeT) * tMmPerUnit);
    const outerDist = Math.max(dFoot, dCrest) + TARGET_L_MM;
    arms.push({
      footRail: [
        { u: nodeU + axu * outerDist - TARGET_W_MM * pUu, t: nodeT + axt * outerDist - TARGET_W_MM * pUt },
        footCorner,
      ],
      crestRail: [
        { u: nodeU + axu * outerDist + TARGET_W_MM * pUu, t: nodeT + axt * outerDist + TARGET_W_MM * pUt },
        crestCorner,
      ],
      junctionFoot: footCorner,
      junctionCrest: crestCorner,
    });
  }
  return arms;
}

function runStyle(styleId: string): void {
    /* eslint-disable no-console */
    const sampler = styleSampler(styleId as Parameters<typeof styleSampler>[0], {}, DIMS);
    const graph = detectFeatures(sampler, globalOpts(sampler));
    const junctions = extractJunctions(graph, sampler);
    const wf = junctions.filter((j) => !j.reflex);
    const wellCond = wf.filter((j) => j.minWedge >= 30);

    let threw = 0, paved = 0, wt = 0, slivered = 0;
    const worstAlls: number[] = [];
    const worstFans: number[] = [];
    const throwMsgs = new Map<string, number>();
    const examples: string[] = [];
    for (const j of wellCond) {
      const node = graph.nodes[j.nodeIdx];
      const arms0 = buildRealArmsAt(node.u, node.t, j, sampler);
      if (!arms0) { threw++; throwMsgs.set('arm-build', (throwMsgs.get('arm-build') ?? 0) + 1); continue; }
      // STEELMAN: pre-densify each arm rail by ARC LENGTH so paveJunction's internal
      // equal-parameter densifyRail does not trip buildStations on the relief.
      const cap = (TARGET_EDGE_MM / 2) * 0.9;
      const arms = arms0.map((arm) => ({
        footRail: densifyRailArcLen(arm.footRail, sampler, cap),
        crestRail: densifyRailArcLen(arm.crestRail, sampler, cap),
        junctionFoot: arm.junctionFoot,
        junctionCrest: arm.junctionCrest,
      }));
      let res;
      try { res = paveJunction(arms, sampler, TARGET_EDGE_MM); }
      catch (err) {
        threw++;
        const m = String((err as Error).message).slice(0, 40);
        throwMsgs.set(m, (throwMsgs.get(m) ?? 0) + 1);
        continue;
      }
      paved++;
      const audit = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
      if (audit.nonManifoldEdges === 0 && audit.tJunctions === 0) wt++;
      const wa = worstMinAngle3D(res.mesh), wfn = worstMinAngle3D(res.junctionMesh);
      worstAlls.push(wa); worstFans.push(wfn);
      if (wa < 20) slivered++;
      if (examples.length < 8 && wa < 20) examples.push(`minWedge=${j.minWedge.toFixed(1)} worstAll=${wa.toFixed(1)} worstFan=${wfn.toFixed(1)}`);
    }
    const pct = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0; const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.floor(s.length * p))];
    };
    console.log(`\n=== SYNTH-VERIFY [${styleId}]: well-formed (minWedge>=30) junctions PAVED ON THE REAL SURFACE ===`);
    console.log(`well-conditioned candidates: ${wellCond.length}`);
    console.log(`  arm-build/pave threw: ${threw}  paved: ${paved}  watertight: ${wt}`);
    if (throwMsgs.size > 0) console.log(`  throw reasons: ${[...throwMsgs.entries()].map(([m, n]) => `[${m}]=${n}`).join('  ')}`);
    if (worstAlls.length > 0) {
      console.log(`  slivered (<20deg): ${slivered}/${paved} = ${((slivered / paved) * 100).toFixed(1)}%`);
      console.log(`  worstAll on real surface: min=${Math.min(...worstAlls).toFixed(1)} p10=${pct(worstAlls, 0.1).toFixed(1)} p50=${pct(worstAlls, 0.5).toFixed(1)} p90=${pct(worstAlls, 0.9).toFixed(1)}`);
      console.log(`  worstFan on real surface: min=${Math.min(...worstFans).toFixed(1)} p10=${pct(worstFans, 0.1).toFixed(1)} p50=${pct(worstFans, 0.5).toFixed(1)}`);
      for (const e of examples) console.log(`    e.g. ${e}`);
    }
    console.log('COMPARE flat spike: well-cond worstAll p50=27.1, sliver-free ~100%.');
    /* eslint-enable no-console */
    expect(wellCond.length).toBeGreaterThan(0);
}

// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
describe.skipIf(!process.env.PF_DERISK)('SYNTH-VERIFY — re-pave well-formed junctions on the REAL surface', () => {
  it('Voronoi (high relief) vs HarmonicRipple (mild relief) control', () => {
    runStyle('Voronoi');
    runStyle('HarmonicRipple');
  }, 120000);

  it('DEGREE-TYPING: does arms.length===3 mistype deg4+ nodes / drop real deg3?', () => {
    /* eslint-disable no-console */
    const sampler = styleSampler('Voronoi', {}, DIMS);
    const graph = detectFeatures(sampler, globalOpts(sampler));
    // node degree from edge endpoints
    const degree = new Map<number, number>();
    for (const e of graph.edges) for (const idx of e.endpoints) degree.set(idx, (degree.get(idx) ?? 0) + 1);
    const junctions = extractJunctions(graph, sampler);
    // junctions[] are nodes with EXACTLY 3 extractable arms (arms.length===3)
    let fromDeg3 = 0, fromDeg4plus = 0, fromDegLe2 = 0;
    for (const j of junctions) {
      const d = degree.get(j.nodeIdx) ?? 0;
      if (d === 3) fromDeg3++; else if (d >= 4) fromDeg4plus++; else fromDegLe2++;
    }
    const deg3Nodes = [...degree.values()].filter((d) => d === 3).length;
    const measuredNodeIdx = new Set(junctions.map((j) => j.nodeIdx));
    let deg3Dropped = 0;
    for (const [idx, d] of degree) if (d === 3 && !measuredNodeIdx.has(idx)) deg3Dropped++;
    console.log('\n=== DEGREE-TYPING audit (skeptic-3 claim) ===');
    console.log(`arms.length===3 population total=${junctions.length} fromDeg3=${fromDeg3} fromDeg4+=${fromDeg4plus} fromDeg<=2=${fromDegLe2}`);
    console.log(`deg-EXACTLY-3 nodes=${deg3Nodes}  measured-as-triple(deg3)=${fromDeg3}  dropped-deg3=${deg3Dropped}`);
    /* eslint-enable no-console */
    expect(junctions.length).toBeGreaterThan(0);
  }, 120000);
});
