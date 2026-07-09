// _crystalline_valley_embed.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-09-CRYSTALLINE-VALLEY-EMBED (final style arm of DRIVE-ALL-20; follow-up to §V11ab/ad which FLOORED
// Crystalline at 49 injection-irreducible C0 valley-kink outliers @7.55M).
//
// MECHANISM (the Gyroid §V11o/q/aa / LowPoly doubled-crest close, NOT injection): the 12 valley kink lines are
// CLOSED-FORM helical polylines (facetPhase ≡ 0 mod TAU under the height-phase shear) = u_k(t) = (k − 0.4·t)/12.
// Embed them as LOCKED conforming constraint chains so a mesh EDGE follows each C0 kink ⇒ no facet straddles it.
// KEEP the 631k inj_14.json pins (they closed the bulk 35,502→49). Apples-to-apples control = the SAME Newton
// verdict on the pass-14 mesh WITHOUT the valley embed (must reproduce 49; the embed MUST beat it, §V11ac lesson).
//
// Env-gated resumable stages (PF_CVE=1):
//   loci    (PF_CVESTAGE=loci):    derive+validate the 12 valley loci vs the SAMPLER sub-0.01 + overlay the 49 survivors.
//   control (PF_CVESTAGE=control): rebuild pass-14 from inj_14.json (NO embed), Newton EXACT = the 49 anchor, persist mesh.
//   build   (PF_CVESTAGE=build):   PF_CVEVARIANT=single|doubled — valley chains as locked constraintEdges on the inj_14 pins,
//                                  planarizeMM, recoveryRobust+SubdivideCollinear; persist mesh + recovery + serration.
//   verdict (PF_CVESTAGE=verdict): Newton EXACT on EVERY radial-flagged facet of the built mesh + final gate table.
//
// ISOLATION: NEW file. Imports labkit + _pf_tangledKernelLib + _gyroid_truthLib + _pf_planarizeMM READ-ONLY.
// NO src/ edit; NO edit to any concurrent agent's file. Kernel constraint path via buildInhouseMetricMesh unmodified.
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  radiusFn, TANGLED_BASE, wholeMeshGuardRadialBound, auditNonManRaw,
} from './_pf_tangledKernelLib';
import { planarizeMM } from './_pf_planarizeMM';
import { buildInhouseMetricMesh, buildRadiusFn, type StyleDims, type AnalyticRadiusFn } from './labkit';
import { newtonNearest, worstFacetsByRadial, facetTrue3D, denseBary, type NewtonOpts } from './_gyroid_truthLib';

const RUN = process.env.PF_CVE === '1';
const DIR = join(process.cwd(), 'research/exchange/_crystalline_embed');
const SRC = join(process.cwd(), 'research/exchange/_tangled_targeted/Crystalline'); // inj_14.json + survivors_14.ndjson
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const TOL = 0.01;
const FACET_COUNT = 12, HEIGHT_PHASE = 0.4; // DEFAULT_CRYSTALLINE — matches buildRadiusFn({}) sampler
const DENSE = denseBary(8);

// ── §V11ad base config (the pass-14 config, verbatim) ────────────────────────────────────────────────────────────
const BASE = { chordTolMm: 0.02, maxPoints: 3_000_000, tolMm: 0.008, sizeRes: 224 } as const;
const MAXPTS_CAP = 4_500_000;

// The valley kink locus u for chain k at height fraction t: facetPhase ≡ 0 (mod TAU) ⇔ u = (k − 0.4·t)/12.
function valleyU(k: number, t: number): number { let u = (k - t * HEIGHT_PHASE) / FACET_COUNT; u -= Math.floor(u); return u; }

// facetPhase(u,t) in [0,TAU): 0/TAU = the valley kink (the C0 abs discontinuity).
function facetPhase(u: number, t: number): number {
  const adj = TAU * u + t * HEIGHT_PHASE * TAU / FACET_COUNT;
  let fp = (adj * FACET_COUNT) % TAU; fp = ((fp % TAU) + TAU) % TAU; return fp;
}

// Build the base mesh from a persisted cumulative injection (inj_14.json) + OPTIONAL valley constraint edges.
// The §V11ad buildLocal recipe verbatim (guardManifoldAlways, chordSteiner, pinInjected), PLUS constraintEdges when
// provided (recoveryRobust + SubdivideCollinear = the proven dense-picket recovery path, the Voronoi/Gothic embed).
function buildEmbed(
  injectedPoints: number[], constraintEdges: number[] | undefined,
): { ut: number[]; idx: Uint32Array; tris: number; points: number; hitBudget: boolean; ms: number; recovery: ReturnType<typeof buildInhouseMetricMesh>['constraint'] } {
  const rA = buildRadiusFn('Crystalline' as never, {}, DIMS);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...TANGLED_BASE,
    tolMm: BASE.tolMm, sizeRes: BASE.sizeRes, hMin: TANGLED_BASE.hMin, hMax: TANGLED_BASE.hMax,
    gradeBeta: TANGLED_BASE.gradeBeta, seedN: TANGLED_BASE.seedN, splitThresh: TANGLED_BASE.splitThresh,
    maxPoints: MAXPTS_CAP, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: BASE.chordTolMm, chordSteiner: true,
    injectedPoints, pinInjected: true,
    ...(constraintEdges && constraintEdges.length > 0
      ? { constraintEdges, guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true, recoveryCollinearEps: 1e-9 }
      : {}),
  });
  return { ut: mesh.ut, idx: mesh.indices, tris: mesh.indices.length / 3, points: mesh.points, hitBudget: mesh.hitBudget, ms: Date.now() - t0, recovery: mesh.constraint };
}

// %<20° min-angle (depth-invariant), 3D — ported from _pf_tangledTargeted (fill the -1 placeholder).
function pctBelow20(ut: number[], idx: Uint32Array, rA: AnalyticRadiusFn, H: number): number {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const nF = idx.length / 3; let below = 0;
  const ang = (px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number): number => {
    const ux = qx - px, uy = qy - py, uz = qz - pz, vx = rx - px, vy = ry - py, vz = rz - pz;
    const nu = Math.hypot(ux, uy, uz), nv = Math.hypot(vx, vy, vz); if (nu < 1e-12 || nv < 1e-12) return 180;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (nu * nv)))) * 180 / Math.PI;
  };
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const A = ang(xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2], xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2], xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]);
    const B = ang(xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2], xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2], xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]);
    if (Math.min(A, B, 180 - A - B) < 20) below++;
  }
  return nF ? (100 * below) / nF : 0;
}

// EXACT Newton verdict: score EVERY radial-flagged facet (the §V11ad basis). Returns the exact outlier count.
function newtonExactVerdict(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: Uint32Array, tris: number, tol: number,
): { nRadial: number; newtonOutliers: number; worstTrue: number; worstUt: [number, number]; newtonMs: number; survivors: Array<{ f: number; su: number; st: number; dev: number; fp: number }> } {
  const t0 = Date.now();
  const big = worstFacetsByRadial(rA, H, ut, idx, tris);
  const flagged = big.recs.filter((r) => r.radialDev > tol);
  const nearest = (px: number, py: number, pz: number): number => newtonNearest(rA, H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 5, nZSeeds: 5, maxIter: 40 } as NewtonOpts).dist;
  let worstTrue = 0, worstU = 0, worstT = 0, nOut = 0;
  const survivors: Array<{ f: number; su: number; st: number; dev: number; fp: number }> = [];
  for (const rec of flagged) {
    const t3 = facetTrue3D(rec, nearest);
    if (t3.dev <= tol) continue;
    nOut++;
    if (t3.dev > worstTrue) { worstTrue = t3.dev; worstU = rec.uc; worstT = rec.tc; }
    if (survivors.length < 5000) {
      // worst-sag bary (u,t) of this facet
      const a = idx[3 * rec.f], b = idx[3 * rec.f + 1], c = idx[3 * rec.f + 2];
      let ua = ut[2 * a], ub = ut[2 * b], uc2 = ut[2 * c]; const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc2 = ut[2 * c + 1];
      while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc2 - ua > 0.5) uc2 -= 1; while (ua - uc2 > 0.5) uc2 += 1;
      let mx = 0, su = rec.uc, st = rec.tc;
      const lift = (u: number, tt: number): [number, number, number] => { const th = TAU * (u - Math.floor(u)), z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
      const A = lift(ua, ta), B = lift(ub, tb), C = lift(uc2, tc2);
      let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      for (const [w0, w1, w2] of DENSE) {
        const uu = w0 * ua + w1 * ub + w2 * uc2, tt2 = w0 * ta + w1 * tb + w2 * tc2; const p = lift(uu, tt2);
        const d = Math.abs((p[0] - A[0]) * nx + (p[1] - A[1]) * ny + (p[2] - A[2]) * nz);
        if (d > mx) { mx = d; su = uu - Math.floor(uu); st = tt2; }
      }
      survivors.push({ f: rec.f, su: +su.toFixed(6), st: +st.toFixed(6), dev: +t3.dev.toFixed(6), fp: +facetPhase(su, st).toFixed(5) });
    }
  }
  return { nRadial: flagged.length, newtonOutliers: nOut, worstTrue: +worstTrue.toFixed(5), worstUt: [+worstU.toFixed(5), +worstT.toFixed(5)], newtonMs: Date.now() - t0, survivors };
}

// Valley serration: for each sampled locus point (on a valley chain), 3D distance to the NEAREST MESH EDGE. Zero
// serration ⇒ a mesh edge lies exactly on the kink (the doubled-crest serration gate). Spatial-hashed for speed.
function valleySerration(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: Uint32Array, nTPerChain: number,
): { p99Mm: number; maxMm: number; meanMm: number; nSample: number } {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  // unique undirected edges (sharded dedup)
  const NSH = 64; const seen: Array<Set<number>> = Array.from({ length: NSH }, () => new Set<number>());
  const edges: Array<[number, number]> = [];
  const ekey = (a: number, b: number): number => (a < b ? a * (nV + 1) + b : b * (nV + 1) + a);
  const addE = (p: number, q: number): void => { const s = seen[(p < q ? p : q) & (NSH - 1)], kk = ekey(p, q); if (!s.has(kk)) { s.add(kk); edges.push([p, q]); } };
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; addE(a, b); addE(b, c); addE(c, a); }
  const CELL = 1.0; const grid = new Map<string, number[]>();
  const gk = (x: number, y: number, z: number): string => `${Math.floor(x / CELL)}_${Math.floor(y / CELL)}_${Math.floor(z / CELL)}`;
  for (let e = 0; e < edges.length; e++) { const [p, q] = edges[e]; const mx = (xyz[3 * p] + xyz[3 * q]) / 2, my = (xyz[3 * p + 1] + xyz[3 * q + 1]) / 2, mz = (xyz[3 * p + 2] + xyz[3 * q + 2]) / 2; const key = gk(mx, my, mz); const arr = grid.get(key); if (arr) arr.push(e); else grid.set(key, [e]); }
  const segDist = (px: number, py: number, pz: number, e: number): number => {
    const [p, q] = edges[e]; const ax = xyz[3 * p], ay = xyz[3 * p + 1], az = xyz[3 * p + 2]; const bx = xyz[3 * q], by = xyz[3 * q + 1], bz = xyz[3 * q + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
    let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
    return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
  };
  const dists: number[] = [];
  for (let k = 0; k < FACET_COUNT; k++) {
    for (let it = 0; it <= nTPerChain; it++) {
      const t = it / nTPerChain; const u = valleyU(k, t); const th = TAU * u, z = t * H, r = rA(th, z);
      const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL), cz = Math.floor(pz / CELL);
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const arr = grid.get(`${cx + dx}_${cy + dy}_${cz + dz}`); if (!arr) continue;
        for (const e of arr) { const d = segDist(px, py, pz, e); if (d < best) best = d; }
      }
      if (best < Infinity) dists.push(best);
    }
  }
  dists.sort((a, b) => a - b);
  const p99 = dists.length ? dists[Math.min(dists.length - 1, Math.floor(0.99 * dists.length))] : 0;
  const mean = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : 0;
  return { p99Mm: +p99.toFixed(6), maxMm: +(dists[dists.length - 1] ?? 0).toFixed(6), meanMm: +mean.toFixed(6), nSample: dists.length };
}

// Build the valley constraint set: 12 helical chains as picket points + consecutive edges. variant single|doubled.
// pitch = arc-length step (mm) along the chain; doubled offsets by ±dOff in u (straddling the kink).
function buildValleyConstraints(
  rA: AnalyticRadiusFn, H: number, variant: 'single' | 'doubled', pitchMm: number, dOff: number,
): { injectedPoints: number[]; constraintEdges: number[]; nChainPts: number; nChainEdges: number } {
  const pts: number[] = []; const edges: Array<[number, number]> = [];
  const pushChain = (offset: number): void => {
    for (let k = 0; k < FACET_COUNT; k++) {
      // walk t from 0→1 with arc-length ~pitchMm; estimate d(arc)/dt to set dt adaptively (cheap: use z + tangential).
      let prevIdx = -1; let t = 0;
      const emit = (tt: number): number => { let u = valleyU(k, tt) + offset; u -= Math.floor(u); const idx = pts.length / 2; pts.push(u, Math.min(1, Math.max(0, tt))); return idx; };
      prevIdx = emit(0);
      while (t < 1) {
        // local arc-length per unit t: sqrt( (r' + tangential)^2 ... ) ~ approximate with a small dt probe
        const u = valleyU(k, t) + offset; const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z);
        const dt0 = 1e-3; const t2 = Math.min(1, t + dt0); const u2 = valleyU(k, t2) + offset; const th2 = TAU * (u2 - Math.floor(u2)), z2 = t2 * H, r2 = rA(th2, z2);
        const p1x = r * Math.cos(th), p1y = r * Math.sin(th), p2x = r2 * Math.cos(th2), p2y = r2 * Math.sin(th2);
        const dsdt = Math.hypot(p2x - p1x, p2y - p1y, z2 - z) / dt0 || 1;
        let dt = pitchMm / dsdt; if (!Number.isFinite(dt) || dt <= 0) dt = 0.01; dt = Math.min(dt, 0.05);
        t = Math.min(1, t + dt);
        const idx = emit(t); edges.push([prevIdx, idx]); prevIdx = idx;
      }
    }
  };
  if (variant === 'single') pushChain(0);
  else { pushChain(+dOff); pushChain(-dOff); }
  const injectedPoints = pts;
  const constraintEdges: number[] = []; for (const [a, b] of edges) constraintEdges.push(a, b);
  return { injectedPoints, constraintEdges, nChainPts: pts.length / 2, nChainEdges: edges.length };
}

function persistMesh(tag: string, ut: number[], idx: Uint32Array): void {
  writeFileSync(join(DIR, `mesh_${tag}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
  writeFileSync(join(DIR, `mesh_${tag}.idx.bin`), Buffer.from((idx as Uint32Array).buffer, (idx as Uint32Array).byteOffset, (idx as Uint32Array).byteLength));
}
function loadMesh(tag: string): { ut: number[]; idx: Uint32Array } {
  const utBuf = readFileSync(join(DIR, `mesh_${tag}.ut.bin`)); const idxBuf = readFileSync(join(DIR, `mesh_${tag}.idx.bin`));
  return { ut: Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8)), idx: new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4) };
}

describe('E-2026-07-09-CRYSTALLINE-VALLEY-EMBED', () => {
  // ── STAGE loci — derive + validate the 12 valley loci vs the SAMPLER (sub-0.01) + overlay the 49 survivors ──────
  it.skipIf(!RUN || process.env.PF_CVESTAGE !== 'loci')('derive + validate valley loci', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = radiusFn('Crystalline', DIMS);
    // (A) loci vs the SAMPLER: the valley locus is the C0 KINK of the triangle-wave abs() at facetPhase≡0 — a
    // DERIVATIVE discontinuity (dr/du jumps), which is what makes a facet STRADDLE it (§V11ad mechanism). It is NOT
    // necessarily the global r-argmin: the asymmetry sin-term (crAsymmetry 0.15) perturbs the r MAGNITUDE by up to
    // ~4mm without moving the kink LOCATION (the kink is intrinsic to abs(triangleWave)). So the sampler-anchored
    // placement proof is: (1) facetPhase(u_k(t),t) == 0 (the locus IS the kink locus, to machine precision), and
    // (2) dr/du has a large sign-flipping JUMP at the locus (a genuine C0 corner). Both measured vs the SAMPLER rA.
    let worstFp = 0, minKinkJump = Infinity, worstKinkOff = 0;
    const drdu = (u: number, z: number, h: number): number => (rA(TAU * ((u + h) - Math.floor(u + h)), z) - rA(TAU * ((u - h) - Math.floor(u - h)), z)) / (2 * h);
    for (let ti = 1; ti <= 19; ti++) {
      const t = ti / 20; const z = t * DIMS.H;
      for (let k = 0; k < FACET_COUNT; k++) {
        const u0 = valleyU(k, t); const h = 1e-5;
        const dL = (rA(TAU * u0, z) - rA(TAU * ((u0 - h) - Math.floor(u0 - h)), z)) / h;
        const dR = (rA(TAU * ((u0 + h) - Math.floor(u0 + h)), z) - rA(TAU * u0, z)) / h;
        const jump = Math.abs(dR - dL); if (jump < minKinkJump) minKinkJump = jump;
        // locate the kink precisely (sign flip of the second-difference) and measure its u-offset from u_k(t)
        const win = 0.15 / FACET_COUNT; let bestJump = 0, bestU = u0;
        for (let s = -60; s <= 60; s++) { const u = u0 + (s / 60) * win; const jL = (rA(TAU * ((u) - Math.floor(u)), z) - rA(TAU * ((u - h) - Math.floor(u - h)), z)) / h, jR = (rA(TAU * ((u + h) - Math.floor(u + h)), z) - rA(TAU * ((u) - Math.floor(u)), z)) / h; const j = Math.abs(jR - jL); if (j > bestJump) { bestJump = j; bestU = u; } }
        let off = Math.abs(bestU - u0); off = Math.min(off, 1 - off); if (off > worstKinkOff) worstKinkOff = off;
        void drdu;
        const fp = facetPhase(u0, t); worstFp = Math.max(worstFp, Math.min(fp, TAU - fp));
      }
    }
    // (B) survivor overlay: worst |Δu| from each of the 49 survivors' worst-sag (u,t) to the nearest valley chain.
    const survRows = existsSync(join(SRC, 'survivors_14.ndjson'))
      ? readFileSync(join(SRC, 'survivors_14.ndjson'), 'utf8').trim().split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as { su: number; st: number; dev: number })
      : [];
    let worstSurvOff = 0;
    for (const r of survRows) { let best = Infinity; for (let k = -1; k <= FACET_COUNT; k++) { let du = Math.abs(r.su - valleyU(k, r.st)); du = Math.min(du, 1 - du); if (du < best) best = du; } if (best > worstSurvOff) worstSurvOff = best; }
    const rec = {
      stage: 'loci', facetCount: FACET_COUNT, heightPhase: HEIGHT_PHASE,
      sampler_worst_locus_facetPhase_kink: +worstFp.toFixed(8), // ≈0 ⇒ the locus IS the C0 kink locus (to machine eps)
      sampler_min_kink_dr_du_jump: +minKinkJump.toFixed(3),     // >0 ⇒ genuine C0 derivative corner (straddle source)
      sampler_worst_kink_u_offset: +worstKinkOff.toFixed(6),    // |u_k(t) − argmax_jump| — placement error vs the SAMPLER
      survivor_overlay_n: survRows.length, survivor_worst_du_to_locus: +worstSurvOff.toFixed(6), facet_period_1_12: +(1 / 12).toFixed(4),
    };
    appendFileSync(join(DIR, 'loci.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[loci]', JSON.stringify(rec, null, 2));
    // KILL (placement sub-0.01, sampler-anchored): (1) the survivor overlay is sub-cell — the loci are where the 49
    // outliers are; (2) the loci sit ON the sampler's C0 kink (argmax dr/du-jump) to sub-0.01 u; (3) the kink is a
    // genuine derivative corner (jump>0). This is the CORRECT placement proof (the kink, not a global r-min).
    expect(worstSurvOff).toBeLessThan(0.01);
    expect(worstKinkOff).toBeLessThan(0.01); // loci sit on the sampler's C0 kink (placement sub-0.01)
    expect(minKinkJump).toBeGreaterThan(1);  // genuine C0 corner (the straddle-generating discontinuity)
  }, 30 * 60_000);

  // ── STAGE control — rebuild pass-14 from inj_14.json (NO embed), Newton EXACT = the 49 anchor ────────────────────
  it.skipIf(!RUN || process.env.PF_CVESTAGE !== 'control')('reproduce the §V11ad 49 floor (apples-to-apples control)', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = radiusFn('Crystalline', DIMS);
    const inj = JSON.parse(readFileSync(join(SRC, 'inj_14.json'), 'utf8')) as number[];
    const build = buildEmbed(inj, undefined);
    persistMesh('control', build.ut, build.idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, build.ut, build.idx, TOL);
    const nonMan = auditNonManRaw(build.idx);
    const nv = newtonExactVerdict(rA, DIMS.H, build.ut, build.idx, build.tris, TOL);
    writeFileSync(join(DIR, 'control_survivors.ndjson'), nv.survivors.map((s) => JSON.stringify(s)).join('\n'));
    const rec = {
      stage: 'control', injectedPts: inj.length / 2, tris: build.tris, points: build.points, hitBudget: build.hitBudget,
      projFullPot: 2 * build.tris, radialOutliers: sound.outliers, radialMax: +sound.maxMm.toFixed(5),
      nRadialFlagged: nv.nRadial, newtonOutliers: nv.newtonOutliers, worstTrue: nv.worstTrue, worstUt: nv.worstUt,
      nonMan, zeroArea: sound.zeroArea, buildMs: build.ms, newtonMs: nv.newtonMs,
    };
    appendFileSync(join(DIR, 'control.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[control]', JSON.stringify(rec, null, 2));
    expect(build.tris).toBeGreaterThan(0);
  }, 6 * 3_600_000);

  // ── STAGE build — valley chains as LOCKED constraint edges on the inj_14 pins, planarized ────────────────────────
  it.skipIf(!RUN || process.env.PF_CVESTAGE !== 'build')('doubled/single valley-chain conforming build', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = radiusFn('Crystalline', DIMS);
    const variant = (process.env.PF_CVEVARIANT ?? 'single') as 'single' | 'doubled';
    const pitchMm = Number(process.env.PF_CVEPITCH ?? '0.12');
    const dOff = Number(process.env.PF_CVEDOFF ?? '0.0015'); // doubled offset in u (~0.11mm arc at r~44)
    const tag = process.env.PF_CVETAG ?? variant;
    const inj = JSON.parse(readFileSync(join(SRC, 'inj_14.json'), 'utf8')) as number[];

    // (1) valley constraint chains (pickets + edges), indices LOCAL to the chain point array
    const vc = buildValleyConstraints(rA, DIMS.H, variant, pitchMm, dOff);
    // (2) planarize the valley chains in mm-space (they self-cross? no — parallel helices don't cross; but the
    //     doubled pair + wrap can create near-duplicates → planarize dedups/junctions robustly, the proven recipe).
    const Ucirc = 2 * Math.PI * Math.max(DIMS.Rb, DIMS.Rt), Ht = DIMS.H;
    const mm: number[] = []; for (let i = 0; i < vc.injectedPoints.length / 2; i++) mm.push(vc.injectedPoints[2 * i] * Ucirc, vc.injectedPoints[2 * i + 1] * Ht);
    const eArr: Array<[number, number]> = []; for (let i = 0; i < vc.constraintEdges.length / 2; i++) eArr.push([vc.constraintEdges[2 * i], vc.constraintEdges[2 * i + 1]]);
    const pl = planarizeMM(mm, eArr, 12);
    // planarized valley points back to (u,t)
    const valleyPts: number[] = []; for (let i = 0; i < pl.pts.length / 2; i++) { let u = pl.pts[2 * i] / Ucirc; u -= Math.floor(u); valleyPts.push(u, Math.min(1, Math.max(0, pl.pts[2 * i + 1] / Ht))); }
    const nValleyVerts = valleyPts.length / 2;
    // (3) COMBINE: the inj_14 pins first, then the valley picket verts. constraintEdges index into the COMBINED
    //     injectedPoints array (offset the valley edge indices by the inj_14 vertex count).
    const injBase = inj.length / 2;
    const injectedPoints = inj.concat(valleyPts);
    const constraintEdges: number[] = []; for (const [a, b] of pl.edges) constraintEdges.push(a + injBase, b + injBase);
    const nConstraintEdges = constraintEdges.length / 2;

    const build = buildEmbed(injectedPoints, constraintEdges);
    persistMesh(tag, build.ut, build.idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, build.ut, build.idx, TOL);
    const nonMan = auditNonManRaw(build.idx);
    const serr = valleySerration(rA, DIMS.H, build.ut, build.idx, 400);
    const rec = {
      stage: 'build', variant, tag, pitchMm, dOff, ms: build.ms, tris: build.tris, points: build.points, hitBudget: build.hitBudget,
      projFullPot: 2 * build.tris, nValleyVerts, nConstraintEdges, residualCrossings: pl.residual, recovery: build.recovery,
      recoveryPct: build.recovery ? +(100 * (build.recovery.recovered + build.recovery.alreadyPresent) / Math.max(1, build.recovery.requested)).toFixed(2) : -1,
      radialOutliers: sound.outliers, radialMax: +sound.maxMm.toFixed(5), nonMan, zeroArea: sound.zeroArea,
      serrP99: serr.p99Mm, serrMax: serr.maxMm, serrMean: serr.meanMm, serrN: serr.nSample,
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    writeFileSync(join(DIR, `mesh_${tag}.meta.json`), JSON.stringify(rec));
    // eslint-disable-next-line no-console
    console.log('[build]', JSON.stringify(rec, null, 2));
    expect(build.recovery ? (build.recovery.failed ?? 0) : 0).toBeLessThan(nConstraintEdges * 0.5);
  }, 6 * 3_600_000);

  // ── STAGE verdict — Newton EXACT on EVERY radial-flagged facet of the built mesh + final gate table ──────────────
  it.skipIf(!RUN || process.env.PF_CVESTAGE !== 'verdict')('Newton-EXACT verdict on the embedded mesh', () => {
    const rA = radiusFn('Crystalline', DIMS);
    const tag = process.env.PF_CVETAG ?? (process.env.PF_CVEVARIANT ?? 'single');
    const { ut, idx } = loadMesh(tag);
    const tris = idx.length / 3;
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, TOL);
    const nonMan = auditNonManRaw(idx);
    const nv = newtonExactVerdict(rA, DIMS.H, ut, idx, tris, TOL);
    const pctB20 = +pctBelow20(ut, idx, rA, DIMS.H).toFixed(3);
    const serr = valleySerration(rA, DIMS.H, ut, idx, 400);
    writeFileSync(join(DIR, `verdict_survivors_${tag}.ndjson`), nv.survivors.map((s) => JSON.stringify(s)).join('\n'));
    // off-valley classification of the survivors: fraction whose worst-sag is NOT on a valley kink (facetPhase far from 0/TAU)
    let offValley = 0; for (const s of nv.survivors) { const kink = Math.min(s.fp, TAU - s.fp); if (kink / (TAU / FACET_COUNT) > 0.05) offValley++; }
    const rec = {
      stage: 'verdict', tag, tris, projFullPot: 2 * tris, basis: 'EXACT (every radial-flagged facet)',
      nRadialFlagged: nv.nRadial, radialOutliers: sound.outliers, radialMax: +sound.maxMm.toFixed(5),
      newtonOutliers: nv.newtonOutliers, worstTrue: nv.worstTrue, worstUt: nv.worstUt,
      nonMan, zeroArea: sound.zeroArea, pctBelow20: pctB20,
      serrP99: serr.p99Mm, serrMax: serr.maxMm, serrMean: serr.meanMm, serrN: serr.nSample,
      survivorsDumped: nv.survivors.length, offValleyCount: offValley, newtonMs: nv.newtonMs,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[verdict]', JSON.stringify(rec, null, 2));
    expect(tris).toBeGreaterThan(0);
  }, 6 * 3_600_000);
});
