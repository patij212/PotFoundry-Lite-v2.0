/**
 * verify_sfbSliverCollapse.derisk.test.ts — sliver-cleanup pass (user-chosen fix).
 *
 * 96% of the SFB serration teeth are thin triangles ON the over-sampled crest (the
 * per-cell CDT triangulates among near-collinear crest vertices). A flip can't fix
 * spacing; this COLLAPSES the slivers: for each thin triangle, collapse its shortest
 * 3D edge (merge the two near-coincident vertices), with three hard constraints —
 *   (1) FEATURE-SAFE: never remove a crest vertex except by merging into another crest
 *       vertex (the ridge stays sharp + on the exact surface; survivors keep positions);
 *   (2) MANIFOLD: link condition (a,b share exactly the 2 opposite verts) so no crack;
 *   (3) NO-FOLD: reject if any redirected triangle would invert or go degenerate.
 * Then reorient outward. Audits %<20/%<5 (3D), watertight, crest survival; writes STL.
 * Pure CPU, PF_DERISK.
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
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const len = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function minAngle3D(a: V3, b: V3, c: V3): number {
  const lab = len(a, b), lbc = len(b, c), lca = len(c, a);
  if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0;
  const law = (a1: number, a2: number, op: number): number => Math.acos(Math.max(-1, Math.min(1, (a1 * a1 + a2 * a2 - op * op) / (2 * a1 * a2))));
  return Math.min(law(lca, lab, lbc), law(lab, lbc, lca), law(lbc, lca, lab)) * RAD2DEG;
}
function ekey(i: number, j: number): number { return i < j ? i * MULT + j : j * MULT + i; }

describe.skipIf(!process.env.PF_DERISK)('SFB sliver-collapse cleanup → clean printable ridge', () => {
  it('collapses crest slivers (feature-safe, manifold, no-fold), reorients, writes STL', () => {
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
    const uv = new Float64Array(nV * 2); const P: V3[] = new Array(nV);
    for (let i = 0; i < nV; i++) { const u = w.vertices[i * 3], t = w.vertices[i * 3 + 1]; uv[i * 2] = u; uv[i * 2 + 1] = t; P[i] = exactPos(u, t); }
    const analyticN = (u: number, t: number): V3 => { const h = 1e-3, tu = Math.min(0.999, Math.max(0.001, t)); let n = nrm(cross(sub(exactPos(u + h, tu), exactPos(u - h, tu)), sub(exactPos(u, Math.min(1, tu + h)), exactPos(u, Math.max(0, tu - h))))); const th = 2 * Math.PI * u; if (n[0] * Math.cos(th) + n[1] * Math.sin(th) < 0) n = [-n[0], -n[1], -n[2]]; return n; };

    // on-feature marking (crest band).
    const EPS_UT = 3e-4;
    const onFeat = new Uint8Array(nV);
    for (const fl of featLines) {
      let uMin = 1, uMax = 0, tMin = 1, tMax = 0; for (const p of fl.points) { uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); }
      for (let v = 0; v < nV; v++) { const u = uv[v * 2], t = uv[v * 2 + 1]; if (u < uMin - EPS_UT || u > uMax + EPS_UT || t < tMin - EPS_UT || t > tMax + EPS_UT) continue;
        for (let s = 0; s + 1 < fl.points.length; s++) { const ax = fl.points[s].u, ay = fl.points[s].t, bx = fl.points[s + 1].u, by = fl.points[s + 1].t; if (Math.abs(bx - ax) > 0.5) continue; const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12; let hh = ((u - ax) * dx + (t - ay) * dy) / L2; hh = Math.max(0, Math.min(1, hh)); if (Math.hypot(u - (ax + hh * dx), t - (ay + hh * dy)) < EPS_UT) { onFeat[v] = 1; break; } } }
    }

    // mesh state
    const T: number[] = Array.from(w.indices);
    let nT = T.length / 3;
    const triDead = new Uint8Array(nT);
    const vDead = new Uint8Array(nV);
    const triN = (t: number): V3 => nrm(cross(sub(P[T[3 * t + 1]], P[T[3 * t]]), sub(P[T[3 * t + 2]], P[T[3 * t]])));
    const triArea = (t: number): number => { const c = cross(sub(P[T[3 * t + 1]], P[T[3 * t]]), sub(P[T[3 * t + 2]], P[T[3 * t]])); return 0.5 * Math.hypot(c[0], c[1], c[2]); };
    const triAngle = (t: number): number => minAngle3D(P[T[3 * t]], P[T[3 * t + 1]], P[T[3 * t + 2]]);
    const T_DEG = 18;

    let totalCollapsed = 0;
    for (let pass = 0; pass < 24; pass++) {
      // vertex→tris + edge→tris over live tris
      const vTris: number[][] = Array.from({ length: nV }, () => []);
      const eTris = new Map<number, number[]>();
      for (let t = 0; t < nT; t++) { if (triDead[t]) continue; const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; vTris[a].push(t); vTris[b].push(t); vTris[c].push(t); for (const [i, j] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) { const k = ekey(i, j); const l = eTris.get(k); if (l) l.push(t); else eTris.set(k, [t]); } }
      // candidates: shortest edge of each thin live tri
      const cand: Array<{ l: number; a: number; b: number }> = [];
      for (let t = 0; t < nT; t++) { if (triDead[t] || triAngle(t) >= T_DEG) continue; const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; const e: Array<[number, number]> = [[a, b], [b, c], [c, a]]; let bi = 0, bl = Infinity; for (let q = 0; q < 3; q++) { const ll = len(P[e[q][0]], P[e[q][1]]); if (ll < bl) { bl = ll; bi = q; } } cand.push({ l: bl, a: e[bi][0], b: e[bi][1] }); }
      cand.sort((x, y) => x.l - y.l);
      const touched = new Uint8Array(nV);
      let collapsed = 0;
      for (const { a, b } of cand) {
        if (vDead[a] || vDead[b] || touched[a] || touched[b]) continue;
        const et = eTris.get(ekey(a, b)); if (!et || et.length !== 2) continue; // boundary/non-manifold edge
        const t0 = et[0], t1 = et[1]; if (triDead[t0] || triDead[t1]) continue;
        const opp = (t: number): number => { const x = T[3 * t], y = T[3 * t + 1], z = T[3 * t + 2]; return x !== a && x !== b ? x : y !== a && y !== b ? y : z; };
        const x = opp(t0), y = opp(t1);
        // link condition: common neighbours of a,b == {x,y}
        const nbr = (v: number): Set<number> => { const s = new Set<number>(); for (const t of vTris[v]) { if (triDead[t]) continue; for (let q = 0; q < 3; q++) { const vv = T[3 * t + q]; if (vv !== v) s.add(vv); } } return s; };
        const na = nbr(a), nb = nbr(b); let common = 0, ok = true; for (const v of na) if (nb.has(v)) { common++; if (v !== x && v !== y) ok = false; } if (!ok || common !== 2) continue;
        // keep/remove: never remove a crest vertex unless merging into another crest vertex
        let keep = a, rem = b; if (onFeat[b] && !onFeat[a]) { keep = b; rem = a; }
        // no-fold: every redirected tri keeps orientation + area
        let bad = false; for (const t of vTris[rem]) { if (triDead[t] || t === t0 || t === t1) continue; const old = triN(t); const vtx = [T[3 * t], T[3 * t + 1], T[3 * t + 2]].map((v) => (v === rem ? keep : v)); if (vtx[0] === vtx[1] || vtx[1] === vtx[2] || vtx[0] === vtx[2]) { bad = true; break; } const c2 = cross(sub(P[vtx[1]], P[vtx[0]]), sub(P[vtx[2]], P[vtx[0]])); if (0.5 * Math.hypot(c2[0], c2[1], c2[2]) < 1e-9) { bad = true; break; } if (dot(old, nrm(c2)) < 0) { bad = true; break; } }
        if (bad) continue;
        // commit
        triDead[t0] = 1; triDead[t1] = 1;
        for (const t of vTris[rem]) { if (triDead[t]) continue; for (let q = 0; q < 3; q++) if (T[3 * t + q] === rem) T[3 * t + q] = keep; }
        vDead[rem] = 1; collapsed++;
        touched[a] = 1; touched[b] = 1; touched[x] = 1; touched[y] = 1; for (const v of na) touched[v] = 1; for (const v of nb) touched[v] = 1;
      }
      totalCollapsed += collapsed;
      if (collapsed === 0) break;
    }

    // reorient outward
    let reoriented = 0;
    for (let t = 0; t < nT; t++) { if (triDead[t]) continue; const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; const uc = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, tc = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3; if (dot(triN(t), analyticN(uc, tc)) < 0) { const tmp = T[3 * t + 1]; T[3 * t + 1] = T[3 * t + 2]; T[3 * t + 2] = tmp; reoriented++; } }

    // audit
    const audit = (label: string): void => {
      const edge = new Map<number, number>(); let lt20 = 0, lt5 = 0, inward = 0, outer = 0, live = 0;
      for (let t = 0; t < nT; t++) { if (triDead[t]) continue; live++; const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; for (const [i, j] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) { const k = ekey(i, j); edge.set(k, (edge.get(k) ?? 0) + 1); }
        const cr = Math.hypot((P[a][0] + P[b][0] + P[c][0]) / 3, (P[a][1] + P[b][1] + P[c][1]) / 3), cz = (P[a][2] + P[b][2] + P[c][2]) / 3; if (!(cr > 42 && cz >= 8 && cz <= 112)) continue; outer++; const ang = minAngle3D(P[a], P[b], P[c]); if (ang < 20) lt20++; if (ang < 5) lt5++; const uc = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, tc = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3; if (dot(triN(t), analyticN(uc, tc)) < 0) inward++; }
      let bnd = 0, nonman = 0; for (const [, cnt] of edge) { if (cnt === 1) bnd++; else if (cnt > 2) nonman++; }
      /* eslint-disable no-console */
      console.log(`[${label}] liveTris=${live} outer=${outer} %<20=${(100 * lt20 / outer).toFixed(2)} %<5=${(100 * lt5 / outer).toFixed(2)} inward=${inward} | bnd=${bnd} nonMan=${nonman}`);
      /* eslint-enable no-console */
    };
    const before = Array.from(w.indices); const bt = before.length / 3; let b20 = 0, b5 = 0, bo = 0;
    for (let t = 0; t < bt; t++) { const a = before[3 * t], b = before[3 * t + 1], c = before[3 * t + 2]; const cr = Math.hypot((P[a][0] + P[b][0] + P[c][0]) / 3, (P[a][1] + P[b][1] + P[c][1]) / 3), cz = (P[a][2] + P[b][2] + P[c][2]) / 3; if (!(cr > 42 && cz >= 8 && cz <= 112)) continue; bo++; const ang = minAngle3D(P[a], P[b], P[c]); if (ang < 20) b20++; if (ang < 5) b5++; }
    let crestV = 0, crestDead = 0; for (let v = 0; v < nV; v++) if (onFeat[v]) { crestV++; if (vDead[v]) crestDead++; }
    /* eslint-disable no-console */
    console.log(`[collapse] passes done, collapsed=${totalCollapsed} reoriented=${reoriented} | crestV=${crestV} crestRemoved=${crestDead} (${(100 * crestDead / crestV).toFixed(0)}%)`);
    console.log(`[BEFORE] outer=${bo} %<20=${(100 * b20 / bo).toFixed(2)} %<5=${(100 * b5 / bo).toFixed(2)}`);
    /* eslint-enable no-console */
    audit('AFTER ');

    // write STL (live tris, exact positions)
    let live = 0; for (let t = 0; t < nT; t++) if (!triDead[t]) live++;
    const buf = Buffer.alloc(80 + 4 + live * 50); buf.write('SFB sf1 sliver-collapse (clean ridge)', 0, 'ascii'); buf.writeUInt32LE(live, 80);
    let off = 84; for (let t = 0; t < nT; t++) { if (triDead[t]) continue; const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; const n = triN(t); buf.writeFloatLE(n[0], off); buf.writeFloatLE(n[1], off + 4); buf.writeFloatLE(n[2], off + 8); for (let k = 0; k < 3; k++) { const pp = [P[a], P[b], P[c]][k]; buf.writeFloatLE(pp[0], off + 12 + k * 12); buf.writeFloatLE(pp[1], off + 16 + k * 12); buf.writeFloatLE(pp[2], off + 20 + k * 12); } buf.writeUInt16LE(0, off + 48); off += 50; }
    fs.writeFileSync(path.join(OUT, 'SuperformulaBlossom_sf1_collapsed.stl'), buf);
    // eslint-disable-next-line no-console
    console.log(`  wrote export-deliverables/SuperformulaBlossom_sf1_collapsed.stl (${live} tris)`);
    expect(live).toBeGreaterThan(0);
  }, 900000);
});
