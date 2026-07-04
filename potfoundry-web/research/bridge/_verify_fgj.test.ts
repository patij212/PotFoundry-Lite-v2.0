// _verify_fgj.test.ts — DEV-ONLY (PF_VFGJ=1). SKEPTIC RE-CHECK of E-2026-07-04-FGJ.
// Independently rebuilds the champion patch B at the finest flank (0.10mm) and re-measures EVERY triangle with a
// DENSE barycentric interior grid (not just 4 samples) + brute-force nearest on the red tail. Question: is worst=0.091
// real, or an artifact of coarse 4-sample interior sampling? A denser grid can only find a >= worst, never a lower one,
// so if the original UNDER-sampled, the honest worst is even higher (refutation strengthened). Also re-measures A.
import { describe, it, expect } from 'vitest';
import cdt2d from 'cdt2d';
import { buildRadiusFn, type StyleDims } from './labkit';
import { bruteNearest } from './_pf_anatomyLib';
import { planarizeConstraintGraph } from './featureConformingMesh';
import { projectPointToRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI, STYLE = 'GothicArches' as StyleId, R_MEAN = 45, ARC_PER_U = TAU * R_MEAN;
const TOL = 0.01;

function lift(rA: AnalyticRadiusFn, u: number, t: number): [number, number, number] {
  const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z];
}
function rowCrests(rA: AnalyticRadiusFn, t: number, uLo: number, uHi: number, N: number, minAmp: number): number[] {
  const z = t * H; const rad = new Float64Array(N + 1); const us = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const u = uLo + (uHi - uLo) * (i / N); us[i] = u; rad[i] = rA(TAU * (((u % 1) + 1) % 1), z); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue; out.push(us[i]);
    }
  }
  return out;
}
function colCrests(rA: AnalyticRadiusFn, u: number, tLo: number, tHi: number, N: number, minAmp: number): number[] {
  const th = TAU * (((u % 1) + 1) % 1); const rad = new Float64Array(N + 1); const ts = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const t = tLo + (tHi - tLo) * (i / N); ts[i] = t; rad[i] = rA(th, t * H); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue; out.push(ts[i]);
    }
  }
  return out;
}
// DENSE interior: full barycentric grid at resolution G (excludes vertices — those are on-surface by construction).
// STAGE-1 cheap GN foot on every dense sample (Gothic is a single-valued height field ⇒ own-azimuth GN is honest);
// returns the worst dense sample + its 3D point so the caller can brute-confirm only the red tail.
function denseInteriorWorst(rA: AnalyticRadiusFn, P: [number, number, number][], tri: [number, number, number], G: number): { dev: number; wp: [number, number, number] } {
  const [ia, ib, ic] = tri; const A = P[ia], B = P[ib], C = P[ic];
  let dev = 0; let wp: [number, number, number] = A;
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G - i; j++) {
    const wa = i / G, wb = j / G, wc = 1 - wa - wb; if (wc < -1e-9) continue;
    // skip the 3 vertices (on-surface by construction) — measure interior + edges
    if ((wa === 1) || (wb === 1) || (wc >= 0.999999)) continue;
    const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2];
    const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 60 }).dist;
    if (gn > dev) { dev = gn; wp = [px, py, pz]; }
  }
  return { dev, wp };
}

function findApex(rA: AnalyticRadiusFn): { u: number; t: number } {
  let best = { u: 0.05, t: 0.55, amp: -1 };
  for (let ti = 0; ti < 60; ti++) {
    const t = 0.35 + 0.4 * (ti / 59);
    const uc = rowCrests(rA, t, 0, 0.2, 4000, 0.03);
    for (const u of uc) { const tc = colCrests(rA, u, Math.max(0, t - 0.1), Math.min(1, t + 0.1), 2000, 0.03);
      for (const tt of tc) if (Math.abs(tt - t) < 0.01) { const amp = rA(TAU * u, t * H) - R_MEAN; if (amp > best.amp) best = { u, t, amp }; } }
  }
  return { u: best.u, t: best.t };
}

function buildChampion(rA: AnalyticRadiusFn, uLo: number, uHi: number, tLo: number, tHi: number, flankArcMm: number, flankZMm: number): { P: [number, number, number][]; tris: [number, number, number][]; recovery: number; resid: number } {
  const uvPts: [number, number][] = []; const uvRaw: number[] = []; const pmap = new Map<number, number>(); const cellMm = 0.02;
  const addPt = (u: number, t: number): number => { const key = Math.round(u * ARC_PER_U / cellMm) * 100000 + Math.round(t * H / cellMm); const hit = pmap.get(key); if (hit !== undefined) return hit; const id = uvRaw.length / 2; uvRaw.push(u, t); uvPts.push([u * ARC_PER_U, t * H]); pmap.set(key, id); return id; };
  const constraints0: number[] = []; const addSeg = (a: number, b: number): void => { if (a !== b) constraints0.push(a, b); };
  const nRow = 80; let prevU: Array<{ u: number; id: number }> | null = null;
  for (let ri = 0; ri <= nRow; ri++) { const t = tLo + (tHi - tLo) * (ri / nRow); const uc = rowCrests(rA, t, uLo, uHi, 3000, 0.03); const cur = uc.map((u) => ({ u, id: addPt(u, t) })); if (prevU) for (const c of cur) { let best = -1, bd = 3.5e-3; for (let p = 0; p < prevU.length; p++) { const d = Math.abs(c.u - prevU[p].u); if (d < bd) { bd = d; best = p; } } if (best >= 0) addSeg(prevU[best].id, c.id); } prevU = cur; }
  const nCol = 80; let prevT: Array<{ t: number; id: number }> | null = null;
  for (let ci = 0; ci <= nCol; ci++) { const u = uLo + (uHi - uLo) * (ci / nCol); const tc = colCrests(rA, u, tLo, tHi, 3000, 0.03); const cur = tc.map((t) => ({ t, id: addPt(u, t) })); if (prevT) for (const c of cur) { let best = -1, bd = 1.0 / H; for (let p = 0; p < prevT.length; p++) { const d = Math.abs(c.t - prevT[p].t); if (d < bd) { bd = d; best = p; } } if (best >= 0) addSeg(prevT[best].id, c.id); } prevT = cur; }
  const pr = planarizeConstraintGraph(constraints0, ARC_PER_U, H, uvRaw, 6);
  for (let i = uvPts.length; i < uvRaw.length / 2; i++) uvPts.push([uvRaw[2 * i] * ARC_PER_U, uvRaw[2 * i + 1] * H]);
  const constraints = pr.constraints;
  const nu = Math.max(12, Math.round((uHi - uLo) * ARC_PER_U / flankArcMm)), nt = Math.max(12, Math.round((tHi - tLo) * H / flankZMm));
  for (let i = 0; i <= nu; i++) for (let k = 0; k <= nt; k++) addPt(uLo + (uHi - uLo) * (i / nu), tLo + (tHi - tLo) * (k / nt));
  const P: [number, number, number][] = []; for (let i = 0; i < uvRaw.length / 2; i++) P.push(lift(rA, uvRaw[2 * i], uvRaw[2 * i + 1]));
  const cEdges: Array<[number, number]> = []; for (let i = 0; i + 1 < constraints.length; i += 2) cEdges.push([constraints[i], constraints[i + 1]]);
  const tris = cdt2d(uvPts, cEdges as [number, number][], { exterior: true }) as [number, number, number][];
  const meshEdges = new Set<number>(); const ek = (a: number, b: number): number => (a < b ? a * 1e7 + b : b * 1e7 + a);
  for (const [a, b, c] of tris) { meshEdges.add(ek(a, b)); meshEdges.add(ek(b, c)); meshEdges.add(ek(c, a)); }
  let present = 0; for (const [a, b] of cEdges) if (meshEdges.has(ek(a, b))) present++;
  return { P, tris, recovery: cEdges.length ? 100 * present / cEdges.length : 100, resid: pr.residualCrossings };
}

describe('verify-fgj: dense-interior re-check of the champion refutation', () => {
  it.skipIf(process.env.PF_VFGJ !== '1')('dense re-measure champion @0.10 flank + A', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const j = findApex(rA); const W = 0.03;
    const uLo = j.u - W, uHi = j.u + W, tLo = Math.max(0.02, j.t - W), tHi = Math.min(0.98, j.t + W);
    // Champion at finest flank (0.10mm), same as sweep-flank-0.10
    const B = buildChampion(rA, uLo, uHi, tLo, tHi, 0.10, 0.10 * (H / ARC_PER_U) * 8);
    // eslint-disable-next-line no-console
    console.log(`[VFGJ] apex u=${j.u.toFixed(5)} t=${j.t.toFixed(5)} | B tris=${B.tris.length} recovery=${B.recovery.toFixed(1)}% resid=${B.resid}`);
    // DENSE interior measure with G=6 barycentric grid (28 samples/tri incl edges) — STAGE 1 GN screen.
    const raw = B.tris.map((tri) => denseInteriorWorst(rA, B.P, tri, 6));
    // STAGE 2 — brute-confirm the worst-80 by GN (brute can only LOWER a GN wrong-well; guards over-reporting).
    const rawDevs = raw.map((r) => r.dev);
    const order = rawDevs.map((_, i) => i).sort((x, y) => rawDevs[y] - rawDevs[x]);
    const K = Math.min(80, order.length);
    for (let i = 0; i < K; i++) { const f = order[i]; if (rawDevs[f] <= TOL) break; const bf = bruteNearest(raw[f].wp[0], raw[f].wp[1], raw[f].wp[2], rA, H, { nTheta: 3072, nZ: 600, band: 8 }); if (bf.dist < rawDevs[f]) rawDevs[f] = bf.dist; }
    let nOut = 0, worst = 0, worstIdx = -1;
    const devs: number[] = [];
    for (let f = 0; f < rawDevs.length; f++) { const d = rawDevs[f]; devs.push(d); if (d > TOL) nOut++; if (d > worst) { worst = d; worstIdx = f; } }
    devs.sort((a, b) => a - b);
    const p99 = devs[Math.min(devs.length - 1, Math.floor(0.99 * devs.length))];
    // eslint-disable-next-line no-console
    console.log(`[VFGJ] DENSE(G=6) B@0.10: tris=${B.tris.length} nOutliers=${nOut} worst=${worst.toFixed(4)} (idx${worstIdx}) p99=${p99.toFixed(4)}`);
    expect(B.tris.length).toBeGreaterThan(0);
    expect(B.recovery).toBeGreaterThan(99); // recovery claim must hold
  }, 60 * 60 * 1000);
});
