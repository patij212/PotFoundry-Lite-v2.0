/**
 * verify_sfbMetricRetrofit.derisk.test.ts — option (a): retrofit the research lab's
 * metric (3D-angle-max) edge-flip onto our conforming SFB wall, WITH a feature lock so
 * it can't flatten the sharp petal ridges (re-serration), + outward re-orientation so
 * the slicer sees consistent normals (no red backfaces). Produces a clean printable STL.
 *
 * Pipeline: buildConformingWall → EXACT per-vertex positions (radiusFn, like production
 * GPU evaluate_vertices) → metricFlip(angle-max, FEATURE-LOCKED) → orient-outward.
 * Audits: 3D %<20°/%<5°, watertight (boundary/non-manifold), feature-edge survival,
 * and the post-orient inward-face count. Pure CPU, PF_DERISK.
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
const MULT = 100000000;
type V3 = [number, number, number];
const RAD2DEG = 180 / Math.PI;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function minAngle3D(a: V3, b: V3, c: V3): number {
  const d = (p: V3, q: V3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const lab = d(a, b), lbc = d(b, c), lca = d(c, a);
  if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0;
  const law = (a1: number, a2: number, op: number): number => Math.acos(Math.max(-1, Math.min(1, (a1 * a1 + a2 * a2 - op * op) / (2 * a1 * a2))));
  return Math.min(law(lca, lab, lbc), law(lab, lbc, lca), law(lbc, lca, lab)) * RAD2DEG;
}
function ekey(i: number, j: number): number { return i < j ? i * MULT + j : j * MULT + i; }

describe.skipIf(!process.env.PF_DERISK)('SFB metric retrofit (a): feature-locked flip + reorient → clean STL', () => {
  it('builds, flips (feature-locked), reorients, audits, writes STL', () => {
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
    const analyticN = (u: number, t: number): V3 => {
      const h = 1e-3, tu = Math.min(0.999, Math.max(0.001, t));
      let n = norm(cross(sub(exactPos(u + h, tu), exactPos(u - h, tu)), sub(exactPos(u, Math.min(1, tu + h)), exactPos(u, Math.max(0, tu - h)))));
      const th = 2 * Math.PI * u; if (n[0] * Math.cos(th) + n[1] * Math.sin(th) < 0) n = [-n[0], -n[1], -n[2]];
      return n;
    };
    const nV = w.vertices.length / 3;
    const uv = new Float64Array(nV * 2);
    const P: V3[] = new Array(nV);
    for (let i = 0; i < nV; i++) { const u = w.vertices[i * 3], t = w.vertices[i * 3 + 1]; uv[i * 2] = u; uv[i * 2 + 1] = t; P[i] = exactPos(u, t); }

    // ── on-feature marking: a vertex within EPS_UT of any feature polyline (u,t). ──
    const EPS_UT = 6e-4;
    const onFeat = new Uint8Array(nV);
    for (const fl of featLines) {
      let uMin = 1, uMax = 0, tMin = 1, tMax = 0;
      for (const p of fl.points) { uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); }
      for (let v = 0; v < nV; v++) {
        const u = uv[v * 2], t = uv[v * 2 + 1];
        if (u < uMin - EPS_UT || u > uMax + EPS_UT || t < tMin - EPS_UT || t > tMax + EPS_UT) continue;
        for (let s = 0; s + 1 < fl.points.length; s++) {
          const ax = fl.points[s].u, ay = fl.points[s].t, bx = fl.points[s + 1].u, by = fl.points[s + 1].t;
          if (Math.abs(bx - ax) > 0.5) continue; // skip seam-wrap segment
          const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
          let h = ((u - ax) * dx + (t - ay) * dy) / L2; h = Math.max(0, Math.min(1, h));
          const px = ax + h * dx, py = ay + h * dy;
          if (Math.hypot(u - px, t - py) < EPS_UT) { onFeat[v] = 1; break; }
        }
      }
    }
    let nFeatV = 0; for (let v = 0; v < nV; v++) nFeatV += onFeat[v];

    // ── metric flip (3D-angle-max Lawson), FEATURE-LOCKED (never flip an edge with
    //    both endpoints on a feature crease → ridges/valleys preserved). ──
    const T = Array.from(w.indices);
    const validFlip = (a: number, b: number, r: number, s: number): boolean => {
      const ru = uv[r * 2], rt = uv[r * 2 + 1], su = uv[s * 2], st = uv[s * 2 + 1];
      const side = (p: number): number => (su - ru) * (uv[p * 2 + 1] - rt) - (st - rt) * (uv[p * 2] - ru);
      return side(a) * side(b) < 0;
    };
    let totalFlips = 0;
    for (let pass = 0; pass < 16; pass++) {
      const edges = new Map<number, Array<{ tri: number; opp: number }>>();
      const nt = T.length / 3;
      const add = (a: number, b: number, tri: number, opp: number): void => { const k = ekey(a, b); const l = edges.get(k); if (l) l.push({ tri, opp }); else edges.set(k, [{ tri, opp }]); };
      for (let t = 0; t < nt; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; add(a, b, t, c); add(b, c, t, a); add(c, a, t, b); }
      let flips = 0; const touched = new Set<number>();
      for (const [k, list] of edges) {
        if (list.length !== 2) continue;
        const a = Math.floor(k / MULT), b = k % MULT;
        if (onFeat[a] && onFeat[b]) continue; // FEATURE LOCK
        const t0 = list[0].tri, t1 = list[1].tri, r = list[0].opp, s = list[1].opp;
        if (touched.has(t0) || touched.has(t1)) continue;
        const curMin = Math.min(minAngle3D(P[a], P[b], P[r]), minAngle3D(P[a], P[b], P[s]));
        const flpMin = Math.min(minAngle3D(P[a], P[r], P[s]), minAngle3D(P[b], P[r], P[s]));
        if (flpMin > curMin + 1e-6 && validFlip(a, b, r, s)) {
          T[3 * t0] = a; T[3 * t0 + 1] = r; T[3 * t0 + 2] = s;
          T[3 * t1] = b; T[3 * t1 + 1] = r; T[3 * t1 + 2] = s;
          touched.add(t0); touched.add(t1); flips++;
        }
      }
      totalFlips += flips;
      if (flips === 0) break;
    }

    // ── orient outward: per-face, flip winding if its normal opposes the analytic. ──
    let reoriented = 0;
    const nT = T.length / 3;
    for (let f = 0; f < nT; f++) {
      const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
      const nF = norm(cross(sub(P[b], P[a]), sub(P[c], P[a])));
      const uc = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, tc = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
      if (dot(nF, analyticN(uc, tc)) < 0) { T[3 * f + 1] = c; T[3 * f + 2] = b; reoriented++; }
    }

    // ── feature-edge survival: mesh edges (BEFORE) with both endpoints on-feature. ──
    const featEdgesBefore = new Set<number>();
    for (let f = 0; f < w.indices.length; f += 3) { const tri = [w.indices[f], w.indices[f + 1], w.indices[f + 2]]; for (let e = 0; e < 3; e++) { const i = tri[e], j = tri[(e + 1) % 3]; if (onFeat[i] && onFeat[j]) featEdgesBefore.add(ekey(i, j)); } }
    const edgesAfter = new Set<number>();
    for (let f = 0; f < T.length; f += 3) { const tri = [T[f], T[f + 1], T[f + 2]]; for (let e = 0; e < 3; e++) edgesAfter.add(ekey(tri[e], tri[(e + 1) % 3])); }
    let featKilled = 0; for (const fe of featEdgesBefore) if (!edgesAfter.has(fe)) featKilled++;

    // ── audit: %<20/%<5 (3D), watertight, inward faces (post-orient). ──
    const audit = (tris: number[] | Uint32Array, label: string): void => {
      const edge = new Map<number, number>(); let lt20 = 0, lt5 = 0, inward = 0, outer = 0;
      for (let f = 0; f < tris.length; f += 3) {
        const a = tris[f], b = tris[f + 1], c = tris[f + 2];
        for (let e = 0; e < 3; e++) { const i = [a, b, c][e], j = [a, b, c][(e + 1) % 3]; const k = ekey(i, j); edge.set(k, (edge.get(k) ?? 0) + 1); }
        const cr = Math.hypot((P[a][0] + P[b][0] + P[c][0]) / 3, (P[a][1] + P[b][1] + P[c][1]) / 3);
        const cz = (P[a][2] + P[b][2] + P[c][2]) / 3;
        if (!(cr > 42 && cz >= 8 && cz <= 112)) continue;
        outer++;
        const ang = minAngle3D(P[a], P[b], P[c]); if (ang < 20) lt20++; if (ang < 5) lt5++;
        const nF = norm(cross(sub(P[b], P[a]), sub(P[c], P[a])));
        const uc = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, tc = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
        if (dot(nF, analyticN(uc, tc)) < 0) inward++;
      }
      let bnd = 0, nonman = 0; for (const [, cnt] of edge) { if (cnt === 1) bnd++; else if (cnt > 2) nonman++; }
      /* eslint-disable no-console */
      console.log(`[${label}] outer=${outer} %<20=${(100 * lt20 / outer).toFixed(2)} %<5=${(100 * lt5 / outer).toFixed(2)} inwardFaces=${inward} | bnd=${bnd} nonMan=${nonman}`);
      /* eslint-enable no-console */
    };
    /* eslint-disable no-console */
    console.log(`[retrofit] nV=${nV} onFeatV=${nFeatV} flips=${totalFlips} reorientedFaces=${reoriented} | featEdges=${featEdgesBefore.size} killed=${featKilled}`);
    /* eslint-enable no-console */
    audit(w.indices, 'BEFORE');
    audit(T, 'AFTER ');

    // ── write STL (exact positions, flipped+reoriented connectivity). ──
    const buf = Buffer.alloc(80 + 4 + nT * 50);
    buf.write('SFB sf1 EXACT + metric-flip(locked) + reorient', 0, 'ascii'); buf.writeUInt32LE(nT, 80);
    let off = 84;
    for (let f = 0; f < nT; f++) {
      const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
      const n = norm(cross(sub(P[b], P[a]), sub(P[c], P[a])));
      buf.writeFloatLE(n[0], off); buf.writeFloatLE(n[1], off + 4); buf.writeFloatLE(n[2], off + 8);
      for (let k = 0; k < 3; k++) { const pp = [P[a], P[b], P[c]][k]; buf.writeFloatLE(pp[0], off + 12 + k * 12); buf.writeFloatLE(pp[1], off + 16 + k * 12); buf.writeFloatLE(pp[2], off + 20 + k * 12); }
      buf.writeUInt16LE(0, off + 48); off += 50;
    }
    fs.writeFileSync(path.join(OUT, 'SuperformulaBlossom_sf1_retrofit.stl'), buf);
    // eslint-disable-next-line no-console
    console.log('  wrote export-deliverables/SuperformulaBlossom_sf1_retrofit.stl');
    expect(nT).toBeGreaterThan(0);
  }, 600000);
});
