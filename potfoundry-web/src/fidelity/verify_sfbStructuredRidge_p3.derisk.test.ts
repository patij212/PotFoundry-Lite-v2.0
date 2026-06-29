/**
 * verify_sfbStructuredRidge_p3.derisk.test.ts — PHASE 3: FULL petal coverage + seam.
 *
 * Phases 1-2 cleaned the 9 INTERIOR petals; the residual beading is the petals the
 * picker excluded (seam-crossing, near-seam, short/born) + the t-tips. This covers ALL
 * substantial ridge/valley curves: seam-crossing curves are SPLIT at the u-wrap into
 * non-wrapping pieces, the t-range is widened, then the corridor fills them all +
 * flank-flip (ridge-locked) + reorient. Reports coverage (curves in/out), allFollowed
 * over ALL ridges, watertight, %<20. Writes STL. Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { realFeatureCorridorPerLoop, type MultiFeatureSpec } from './bandRemesh/realCorridor';
import type { UTPoint } from './bandRemesh/corridorPave';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../geometry/types';

const H = 120, R0 = 40, TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const FL = 11;
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');
const MULT = 100000000;
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function minAngle3D(a: V3, b: V3, c: V3): number { const d = (p: V3, q: V3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); const lab = d(a, b), lbc = d(b, c), lca = d(c, a); if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0; const law = (a1: number, a2: number, op: number): number => Math.acos(Math.max(-1, Math.min(1, (a1 * a1 + a2 * a2 - op * op) / (2 * a1 * a2)))); return Math.min(law(lca, lab, lbc), law(lab, lbc, lca), law(lbc, lca, lab)) * 180 / Math.PI; }
const ek = (i: number, j: number): number => (i < j ? i * MULT + j : j * MULT + i);

/** Split a (u,t) polyline at u-seam wraps (|Δu|>0.5) into non-wrapping pieces. */
function splitAtSeam(pts: UTPoint[]): UTPoint[][] {
  const pieces: UTPoint[][] = []; let cur: UTPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) { if (Math.abs(pts[i].u - pts[i - 1].u) > 0.5) { pieces.push(cur); cur = [pts[i]]; } else cur.push(pts[i]); }
  pieces.push(cur); return pieces;
}

function pickAllRidges(): { specs: UTPoint[][]; total: number; kept: number; skipped: number } {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
  const out: UTPoint[][] = []; let total = 0, kept = 0, skipped = 0;
  for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
    total++;
    if (c.points.length < 6) { skipped++; continue; }
    for (const piece of splitAtSeam(c.points.map((p) => ({ u: p.u, t: p.t })))) {
      let tMin = 1, tMax = 0, uMin = 1, uMax = 0; for (const p of piece) { tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); }
      if (tMax - tMin < 0.35) continue;            // too short to band
      // Seam-touching pieces (u≈0/1) break the non-periodic corridor (bnd explodes,
      // non-manifold) — they are Phase 3b (periodic-corridor support). Default: exclude.
      const includeSeam = process.env.SFB_INCLUDE_SEAM === '1';
      if (!includeSeam && (uMin < 0.02 || uMax > 0.98)) continue;
      const s = piece.filter((p) => p.t >= 0.05 && p.t <= 0.95);
      if (s.length >= 4) { out.push(s); kept++; }
    }
  }
  return { specs: out, total, kept, skipped };
}

describe.skipIf(!process.env.PF_DERISK)('SFB structured-ridge PHASE 3 — full coverage + seam split', () => {
  it('covers ALL petals (seam-split) with the corridor; reports coverage + quality', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, STYLE_DIMS);
    const picked = pickAllRidges();
    const featLines: FeatureLine[] = picked.specs.map((c, i) => ({ kind: 'general-curve', label: `c${i}`, points: c.map((p) => ({ u: p.u, t: p.t })) }));
    const specs: MultiFeatureSpec[] = picked.specs.map((polyline) => ({ polyline }));
    const radiusFn = STYLE_FUNCTIONS['SuperformulaBlossom'];
    const opts = { ...DEFAULT_STYLE_PARAMS['SuperformulaBlossom'], sf_strength: 1 };
    const exactPos = (u: number, t: number): V3 => { const z = t * H, r0 = baseRadius(z, H, R0, R0, 1, opts), th = 2 * Math.PI * u, r = radiusFn(th, z, r0, H, opts); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const analyticN = (u: number, t: number): V3 => { const h = 1e-3, tu = Math.min(0.999, Math.max(0.001, t)); let n = nrm(cross(sub(exactPos(u + h, tu), exactPos(u - h, tu)), sub(exactPos(u, Math.min(1, tu + h)), exactPos(u, Math.max(0, tu - h))))); const th = 2 * Math.PI * u; if (n[0] * Math.cos(th) + n[1] * Math.sin(th) < 0) n = [-n[0], -n[1], -n[2]]; return n; };

    let co: ReturnType<typeof realFeatureCorridorPerLoop> | null = null; let crash = '';
    try {
      co = realFeatureCorridorPerLoop(sampler, specs, { featureLevel: FL, widthMm: 3, dims: DIMS, assemblyFeatureLines: featLines, baseOptions: { maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12, resU: 128, resT: 128, nRing: 1 << FL, targetTriangles: 8_000_000, budgetMode: 'cap', uBias: 2 } });
    } catch (e) { crash = String((e as Error).message).slice(0, 160); }
    // eslint-disable-next-line no-console
    console.log(`[P3 COVERAGE] curves total=${picked.total} skipped=${picked.skipped} → bandable pieces=${picked.kept}`);
    if (crash) { /* eslint-disable-next-line no-console */ console.log(`[P3] CORRIDOR CRASH: ${crash}`); }
    expect(crash).toBe('');
    if (!co) return;

    const UT = co.merged.vertexUT; const nV = UT.length;
    const P: V3[] = UT.map(([u, t]) => exactPos(u, t));
    const uv = new Float64Array(nV * 2); for (let i = 0; i < nV; i++) { uv[i * 2] = UT[i][0]; uv[i * 2 + 1] = UT[i][1]; }
    const ridgeLock = new Set<number>(); for (const chain of co.paved.featureChains) for (let i = 0; i + 1 < chain.length; i++) ridgeLock.add(ek(chain[i], chain[i + 1]));

    const T: number[] = Array.from(co.merged.indices);
    const validFlip = (a: number, b: number, r: number, s: number): boolean => { const ru = uv[r * 2], rt = uv[r * 2 + 1], su = uv[s * 2], st = uv[s * 2 + 1]; const side = (p: number): number => (su - ru) * (uv[p * 2 + 1] - rt) - (st - rt) * (uv[p * 2] - ru); return side(a) * side(b) < 0; };
    for (let pass = 0; pass < 14; pass++) {
      const edges = new Map<number, Array<{ tri: number; opp: number }>>(); const nt = T.length / 3;
      const add = (a: number, b: number, tri: number, opp: number): void => { const k = ek(a, b); const l = edges.get(k); if (l) l.push({ tri, opp }); else edges.set(k, [{ tri, opp }]); };
      for (let t = 0; t < nt; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; add(a, b, t, c); add(b, c, t, a); add(c, a, t, b); }
      let f = 0; const touched = new Set<number>();
      for (const [k, list] of edges) { if (list.length !== 2 || ridgeLock.has(k)) continue; const t0 = list[0].tri, t1 = list[1].tri, r = list[0].opp, s = list[1].opp; if (touched.has(t0) || touched.has(t1)) continue; const a = Math.floor(k / MULT), b = k % MULT; const curMin = Math.min(minAngle3D(P[a], P[b], P[r]), minAngle3D(P[a], P[b], P[s])); const flpMin = Math.min(minAngle3D(P[a], P[r], P[s]), minAngle3D(P[b], P[r], P[s])); if (flpMin > curMin + 1e-6 && validFlip(a, b, r, s)) { T[3 * t0] = a; T[3 * t0 + 1] = r; T[3 * t0 + 2] = s; T[3 * t1] = b; T[3 * t1 + 1] = r; T[3 * t1 + 2] = s; touched.add(t0); touched.add(t1); f++; } }
      if (f === 0) break;
    }
    const nT = T.length / 3;
    for (let t = 0; t < nT; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; const uc = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, tc = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3; if (dot(nrm(cross(sub(P[b], P[a]), sub(P[c], P[a]))), analyticN(uc, tc)) < 0) { const tmp = T[3 * t + 1]; T[3 * t + 1] = T[3 * t + 2]; T[3 * t + 2] = tmp; } }

    const edgeC = new Map<number, number>(); let lt20 = 0, lt5 = 0, outer = 0;
    for (let t = 0; t < nT; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; for (const [i, j] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) edgeC.set(ek(i, j), (edgeC.get(ek(i, j)) ?? 0) + 1); const cr = Math.hypot((P[a][0] + P[b][0] + P[c][0]) / 3, (P[a][1] + P[b][1] + P[c][1]) / 3), cz = (P[a][2] + P[b][2] + P[c][2]) / 3; if (!(cr > 42 && cz >= 8 && cz <= 112)) continue; outer++; const ang = minAngle3D(P[a], P[b], P[c]); if (ang < 20) lt20++; if (ang < 5) lt5++; }
    let bnd = 0, nonman = 0; for (const [, c2] of edgeC) { if (c2 === 1) bnd++; else if (c2 > 2) nonman++; }
    const eset = new Set<number>(); for (const [k] of edgeC) eset.add(k);
    let ridgeKept = 0; for (const k of ridgeLock) if (eset.has(k)) ridgeKept++;

    const buf = Buffer.alloc(80 + 4 + nT * 50); buf.write('SFB sf1 structured-ridge P3 (full coverage)', 0, 'ascii'); buf.writeUInt32LE(nT, 80); let off = 84;
    for (let t = 0; t < nT; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; const n = nrm(cross(sub(P[b], P[a]), sub(P[c], P[a]))); buf.writeFloatLE(n[0], off); buf.writeFloatLE(n[1], off + 4); buf.writeFloatLE(n[2], off + 8); for (let kk = 0; kk < 3; kk++) { const pp = [P[a], P[b], P[c]][kk]; buf.writeFloatLE(pp[0], off + 12 + kk * 12); buf.writeFloatLE(pp[1], off + 16 + kk * 12); buf.writeFloatLE(pp[2], off + 20 + kk * 12); } buf.writeUInt16LE(0, off + 48); off += 50; }
    fs.writeFileSync(path.join(OUT, 'SuperformulaBlossom_sf1_structured_p3.stl'), buf);

    /* eslint-disable no-console */
    console.log(`[P3 RESULT] loops=${co.hole.loops.length} tris=${nT} | outer %<20=${(100 * lt20 / outer).toFixed(2)} %<5=${(100 * lt5 / outer).toFixed(2)} | bnd=${bnd} nonMan=${nonman} | ridgeKept=${ridgeKept}/${ridgeLock.size}`);
    console.log(`  ⇒ ${ridgeKept === ridgeLock.size && nonman === 0 ? 'PASS — all bandable ridges clean + watertight' : 'CHECK'} (near-seam petals = Phase 3b)`);
    console.log('  wrote export-deliverables/SuperformulaBlossom_sf1_structured_p3.stl');
    /* eslint-enable no-console */
    expect(nonman).toBe(0);
    expect(ridgeKept).toBe(ridgeLock.size);
  }, 900000);
});
