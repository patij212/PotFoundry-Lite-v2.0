/**
 * verify_sfbMetricFlip.derisk.test.ts — does the research lab's metric (3D-angle-max)
 * edge-flip fix our SFB valley-seam folds, and does it stay watertight + feature-safe?
 *
 * The research lab (research/bridge/surfaceMetricField.ts + spike/metricDelaunayRefine
 * `metricFlipPasses`) showed: a Lawson flip that maximises the TRUE 3D min-angle
 * (not the flat-(u,t) one) gives surface-even triangles and kills steep-crease slivers
 * (Gyroid/BasketWeave %<20° 14→2%). Our 243-305 valley folds are the per-cell CDT
 * picking the (u,t)-Delaunay diagonal that maps 3D-inward — the SAME class.
 *
 * This applies that flip (ported, indexed by precomputed exact 3D positions) to the
 * EXACT-eval SFB wall and measures, before/after: 3D folds, watertightness (boundary +
 * non-manifold edge counts), min-angle distribution, and FEATURE-edge preservation
 * (does it flip a petal ridge/valley line = re-serrate?). Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../geometry/types';

const H = 120, R0 = 40, FL = 11;
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');
type V3 = [number, number, number];
const RAD2DEG = 180 / Math.PI;

function minAngle3D(a: V3, b: V3, c: V3): number {
  const d = (p: V3, q: V3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const lab = d(a, b), lbc = d(b, c), lca = d(c, a);
  if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0;
  const law = (a1: number, a2: number, op: number): number => Math.acos(Math.max(-1, Math.min(1, (a1 * a1 + a2 * a2 - op * op) / (2 * a1 * a2))));
  return Math.min(law(lca, lab, lbc), law(lab, lbc, lca), law(lbc, lca, lab)) * RAD2DEG;
}

/** Ported metricFlipPasses (spike/metricDelaunayRefine.ts), indexed by precomputed P[]. */
function metricFlip(uv: Float64Array, triIn: Uint32Array, P: V3[], maxPasses: number): { tris: Uint32Array; flips: number } {
  const T = Array.from(triIn);
  const MULT = 100000000;
  let total = 0;
  const validFlip = (a: number, b: number, r: number, s: number): boolean => {
    const ru = uv[r * 2], rt = uv[r * 2 + 1], su = uv[s * 2], st = uv[s * 2 + 1];
    const side = (p: number): number => (su - ru) * (uv[p * 2 + 1] - rt) - (st - rt) * (uv[p * 2] - ru);
    return side(a) * side(b) < 0;
  };
  for (let pass = 0; pass < maxPasses; pass++) {
    const edges = new Map<number, Array<{ tri: number; opp: number }>>();
    const nt = T.length / 3;
    const add = (a: number, b: number, tri: number, opp: number): void => {
      const k = a < b ? a * MULT + b : b * MULT + a;
      const l = edges.get(k); if (l) l.push({ tri, opp }); else edges.set(k, [{ tri, opp }]);
    };
    for (let t = 0; t < nt; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; add(a, b, t, c); add(b, c, t, a); add(c, a, t, b); }
    let flips = 0; const touched = new Set<number>();
    for (const [k, list] of edges) {
      if (list.length !== 2) continue;
      const t0 = list[0].tri, t1 = list[1].tri, r = list[0].opp, s = list[1].opp;
      if (touched.has(t0) || touched.has(t1)) continue;
      const a = Math.floor(k / MULT), b = k % MULT;
      const curMin = Math.min(minAngle3D(P[a], P[b], P[r]), minAngle3D(P[a], P[b], P[s]));
      const flpMin = Math.min(minAngle3D(P[a], P[r], P[s]), minAngle3D(P[b], P[r], P[s]));
      if (flpMin > curMin + 1e-6 && validFlip(a, b, r, s)) {
        T[3 * t0] = a; T[3 * t0 + 1] = r; T[3 * t0 + 2] = s;
        T[3 * t1] = b; T[3 * t1 + 1] = r; T[3 * t1 + 2] = s;
        touched.add(t0); touched.add(t1); flips++;
      }
    }
    total += flips;
    if (flips === 0) break;
  }
  return { tris: Uint32Array.from(T), flips: total };
}

describe.skipIf(!process.env.PF_DERISK)('SFB metric-flip — does the research 3D flip fix our folds, watertight?', () => {
  it('applies metricFlipPasses to the exact-eval wall and audits folds/watertight/features', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
    const featLines: FeatureLine[] = graph.lines.filter((l) => l.kind === 'general-curve').map((c, i) => ({ kind: 'general-curve', label: `c${i}`, points: c.points.map((p) => ({ u: p.u, t: p.t })) }));
    const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, { H, Rt: R0, Rb: R0, expn: 1 });
    const w = buildConformingWall(sampler, {
      maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12,
      resU: 128, resT: 128, nRing: 1 << FL, surfaceId: 0, featureLines: featLines, featureLevel: FL,
      targetTriangles: 6_000_000, budgetMode: 'cap', uBias: 2,
    });

    const radiusFn = STYLE_FUNCTIONS['SuperformulaBlossom'];
    const opts = { ...DEFAULT_STYLE_PARAMS['SuperformulaBlossom'], sf_strength: 1 };
    const exactPos = (u: number, t: number): V3 => { const z = t * H, r0 = baseRadius(z, H, R0, R0, 1, opts), th = 2 * Math.PI * u, r = radiusFn(th, z, r0, H, opts); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const nV = w.vertices.length / 3;
    const uv = new Float64Array(nV * 2);
    const P: V3[] = new Array(nV);
    for (let i = 0; i < nV; i++) { const u = w.vertices[i * 3], t = w.vertices[i * 3 + 1]; uv[i * 2] = u; uv[i * 2 + 1] = t; P[i] = exactPos(u, t); }
    const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const analyticN = (u: number, t: number): V3 => {
      const h = 1e-3, tu = Math.min(0.999, Math.max(0.001, t));
      let n = norm(cross(sub(exactPos(u + h, tu), exactPos(u - h, tu)), sub(exactPos(u, Math.min(1, tu + h)), exactPos(u, Math.max(0, tu - h)))));
      const th = 2 * Math.PI * u; if (n[0] * Math.cos(th) + n[1] * Math.sin(th) < 0) n = [-n[0], -n[1], -n[2]];
      return n;
    };

    // Feature-edge set (by vertex-id pairs): segments of the inserted feature curves
    // matched to mesh vertices via quantized (u,t) key (so we can see if a flip kills one).
    const QK = (u: number, t: number): string => `${Math.round(u * 4096)},${Math.round(t * 4096)}`;
    const idByKey = new Map<string, number>();
    for (let i = 0; i < nV; i++) idByKey.set(QK(uv[i * 2], uv[i * 2 + 1]), i);
    const featEdges = new Set<number>();
    const MULT = 100000000;
    for (const fl of featLines) {
      for (let i = 0; i + 1 < fl.points.length; i++) {
        const a = idByKey.get(QK(fl.points[i].u, fl.points[i].t)); const b = idByKey.get(QK(fl.points[i + 1].u, fl.points[i + 1].t));
        if (a !== undefined && b !== undefined) featEdges.add(a < b ? a * MULT + b : b * MULT + a);
      }
    }
    const audit = (tris: Uint32Array, label: string): void => {
      const edge = new Map<number, number>();
      let folds = 0, lt20 = 0, lt5 = 0, outer = 0;
      for (let f = 0; f < tris.length; f += 3) {
        const a = tris[f], b = tris[f + 1], c = tris[f + 2];
        for (const [i, j] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) { const k = i < j ? i * MULT + j : j * MULT + i; edge.set(k, (edge.get(k) ?? 0) + 1); }
        const cx = (P[a][0] + P[b][0] + P[c][0]) / 3, cy = (P[a][1] + P[b][1] + P[c][1]) / 3, cz = (P[a][2] + P[b][2] + P[c][2]) / 3;
        const cr = Math.hypot(cx, cy);
        if (!(cr > 42 && cz >= 8 && cz <= 112)) continue;
        outer++;
        const uc = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, tc = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
        const nF = norm(cross(sub(P[b], P[a]), sub(P[c], P[a])));
        if (dot(nF, analyticN(uc, tc)) < 0) folds++;
        const ang = minAngle3D(P[a], P[b], P[c]);
        if (ang < 20) lt20++; if (ang < 5) lt5++;
      }
      let bnd = 0, nonman = 0, featKilled = 0;
      for (const [k, cnt] of edge) { if (cnt === 1) bnd++; else if (cnt > 2) nonman++; }
      for (const fe of featEdges) if (!edge.has(fe)) featKilled++;
      /* eslint-disable no-console */
      console.log(`[${label}] outerTris=${outer} folds=${folds} %<20=${(100 * lt20 / outer).toFixed(2)} %<5=${(100 * lt5 / outer).toFixed(2)} | bnd=${bnd} nonMan=${nonman} | featEdges=${featEdges.size} killed=${featKilled}`);
      /* eslint-enable no-console */
    };

    audit(w.indices as unknown as Uint32Array, 'BEFORE');
    const t0 = Date.now ? 0 : 0; void t0;
    const flipped = metricFlip(uv, w.indices as unknown as Uint32Array, P, 12);
    // eslint-disable-next-line no-console
    console.log(`[metric-flip] total flips=${flipped.flips}`);
    audit(flipped.tris, 'AFTER ');

    // Write the flipped exact-eval STL.
    const nT = flipped.tris.length / 3;
    const buf = Buffer.alloc(80 + 4 + nT * 50);
    buf.write('SFB sf1 EXACT + metric-flip', 0, 'ascii'); buf.writeUInt32LE(nT, 80);
    let off = 84;
    for (let f = 0; f < nT; f++) {
      const a = flipped.tris[f * 3], b = flipped.tris[f * 3 + 1], c = flipped.tris[f * 3 + 2];
      const n = norm(cross(sub(P[b], P[a]), sub(P[c], P[a])));
      buf.writeFloatLE(n[0], off); buf.writeFloatLE(n[1], off + 4); buf.writeFloatLE(n[2], off + 8);
      for (let k = 0; k < 3; k++) { const pp = [P[a], P[b], P[c]][k]; buf.writeFloatLE(pp[0], off + 12 + k * 12); buf.writeFloatLE(pp[1], off + 16 + k * 12); buf.writeFloatLE(pp[2], off + 20 + k * 12); }
      buf.writeUInt16LE(0, off + 48); off += 50;
    }
    fs.writeFileSync(path.join(OUT, 'SuperformulaBlossom_sf1_metricflip.stl'), buf);
    // eslint-disable-next-line no-console
    console.log('  wrote export-deliverables/SuperformulaBlossom_sf1_metricflip.stl');
    expect(nT).toBeGreaterThan(0);
  }, 600000);
});
