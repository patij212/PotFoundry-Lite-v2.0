// _pf_tangledTargeted.test.ts — DEV-ONLY (env-gated). E-2026-07-08-TANGLED-TARGETED (spec §V11u).
//
// Follow-up to E-2026-07-08-TANGLED-DENSITY-CLOSE (§V11r): uniform density sweeps DEMONSTRATED monotone Newton
// trajectories but hit the 10M budget before literal 0 because the uniform curvature-sizing field OVER-REFINES the
// flat bulk (HexHive is 93.5% flat, yet chord0.0009 spent the whole 2.5M-pt cap = 9.99M full-pot and STILL left 21
// Newton outliers; chord0.00125 already had 100 radial / 60 Newton @ 7.24M). The residual is a SPARSE population.
//
// THIS ARM: LOCAL refinement of ONLY the flagged residual facets, NOT another global density step. Mechanism:
//   (1) rebuild the best V11r sweep config's mesh deterministically (buildTangled, recorded chord/base config);
//   (2) radial-flag → Newton-confirm the residual population (worstFacetsByRadial → newtonNearest, the V11i recipe);
//   (3) LOCAL pass = inject a dense (u,t) micro-cluster at each Newton-confirmed facet's worst-sag bary point
//       (+ the facet's edge-midpoints) as FORCED Steiner points, pinned against the smoothing sweeps (pinInjected),
//       keeping the SAME loose global chord so the flat bulk stays coarse;
//   (4) re-verdict Newton on the FINAL EMITTED mesh (post optimizeSweeps — the §V11a trap: score the emitted mesh);
//   (5) iterate ≤5 local passes.
//
// VERDICT per style: CLOSED (Newton 0 @ ≤10M) / FRONTIER (trajectory + residual scatter classification) /
// RECLASSIFY (a local pass makes Newton GROW = hidden cliff sub-population, the CelticKnot §V11r-4 lesson).
//
// PROBES (each its own env gate + per-pass ndjson checkpoint → resume/env-kill safe):
//   PF_TT=<Style>   — base rebuild → radial/Newton residual → ≤5 LOCAL injected-Steiner passes → Newton re-verdict.
//
// ISOLATION: NEW file. Imports _pf_tangledKernelLib + _gyroid_truthLib + labkit READ-ONLY. NO src/ edit; NO edit to
// _ds_conforming*, tierC/**, _gyroid_truth*, _pf_tangledDensity.test.ts, or the concurrent agents' files.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TANGLED_BASE, wholeMeshGuardRadialBound, auditNonManRaw, radiusFn as tangledRadiusFn,
} from './_pf_tangledKernelLib';
import { worstFacetsByRadial, newtonNearest, facetTrue3D, denseBary } from './_gyroid_truthLib';
import { buildInhouseMetricMesh, buildRadiusFn, type StyleDims, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_tangled_targeted');
const HRS = 60 * 60 * 1000;
const TAU = 2 * Math.PI;
const TOL = 0.01;

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const ln of readFileSync(path, 'utf8').split('\n')) { if (!ln.trim()) continue; try { rows.push(JSON.parse(ln)); } catch { /* skip */ } }
  return rows;
}
function projFullPot(outerTris: number): number { return 2 * outerTris; }

// ── Newton nearest wrapper (the validated §V11j radial-anchor multi-start) ───────────────────────────────────────
function makeNearest(rA: AnalyticRadiusFn, H: number): (px: number, py: number, pz: number) => number {
  return (px, py, pz) => newtonNearest(rA, H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 5, nZSeeds: 5, maxIter: 40 }).dist;
}

// ── honest-Newton verdict on an IN-MEMORY mesh (the V11i/V11r runTruthFloor recipe) ─────────────────────────────
// ARCHITECTURE (correcting the naive "Newton every flagged facet"): Newton is ~3s/facet, so on a large residual
// scoring every radial-flagged facet is infeasible. Instead:
//   - the CHEAP radial flag drives INJECTION (over-injecting is a budget cost, not a correctness bug — the V11r
//     "radial drives refinement" principle); the injection TARGETS = ALL radial-flagged facets (their indices).
//   - Newton is the VERDICT only: score the worst-`topWorst` radial-flagged facets EXHAUSTIVELY + a stratified tail
//     → honest scaled true-3D outlier count (V11r). When the flagged population ≤ topWorst it is EXACT (no scaling).
// The literal-0 CLOSE claim requires the flagged population to be SMALL enough to score EXHAUSTIVELY (nRadial ≤
// topWorst) so newtonOutliers is exact — which is exactly the state a converged local refinement reaches.
const DENSE = denseBary(8);
interface NewtonVerdict {
  nRadial: number; newtonOutliers: number; newtonExact: boolean; worstTrue: number; worstUt: [number, number]; newtonMs: number;
  flaggedFacetIdx: number[]; // ALL radial-flagged facet indices — the LOCAL injection targets (cheap superset).
}
function newtonVerdict(
  style: StyleId, ut: number[], idx: Uint32Array, tris: number, tol: number, topWorst: number, nStrat: number,
): NewtonVerdict {
  const rA = tangledRadiusFn(style, DIMS); const H = DIMS.H;
  const t0 = Date.now();
  const big = worstFacetsByRadial(rA, H, ut, idx, tris); // full ranked list (by radial bound, descending)
  const radialFlagged = big.recs.filter((r) => r.radialDev > tol);
  const nRadial = radialFlagged.length;
  const nearest = makeNearest(rA, H);
  let worstTrue = 0, worstU = 0, worstT = 0;
  const worstSet = radialFlagged.slice(0, Math.min(topWorst, nRadial));
  const rest = radialFlagged.slice(worstSet.length);
  const stratIdx: number[] = [];
  if (rest.length > 0) { const step = Math.max(1, Math.floor(rest.length / Math.max(1, nStrat))); for (let i = 0; i < rest.length; i += step) stratIdx.push(i); }
  const scoreOne = (rec: (typeof radialFlagged)[number]): number => {
    const t3 = facetTrue3D(rec, nearest);
    if (t3.dev > worstTrue) { worstTrue = t3.dev; worstU = rec.uc; worstT = rec.tc; }
    return t3.dev;
  };
  let worstTrueOut = 0; for (const rec of worstSet) { if (scoreOne(rec) > tol) worstTrueOut++; }
  let stratTrueOut = 0, stratScored = 0; for (const i of stratIdx) { if (scoreOne(rest[i]) > tol) stratTrueOut++; stratScored++; }
  const stratFrac = stratScored ? stratTrueOut / stratScored : 0;
  const newtonExact = rest.length === 0; // scored every flagged facet ⇒ exact count
  const honest = newtonExact ? worstTrueOut : Math.round(worstTrueOut + rest.length * stratFrac);
  return {
    nRadial, newtonOutliers: honest, newtonExact, worstTrue: +worstTrue.toFixed(5),
    worstUt: [+worstU.toFixed(5), +worstT.toFixed(5)], newtonMs: Date.now() - t0,
    flaggedFacetIdx: radialFlagged.map((r) => r.f),
  };
}

// ── worst-sag (u,t) of a facet at high bary resolution (the injection anchor) ────────────────────────────────────
// FacetRec carries the 3 vertex xyz + centroid ut. To place a Steiner at the worst-sag INTERIOR point we need the
// (u,t) of the worst-sag bary. We recompute the facet's 3 vertex ut from idx/ut and evaluate chord-sag over a dense
// bary, returning the worst-sag (u,t). This is the same worst-sag target the kernel's chordWorstBary uses.
function facetWorstSagUt(
  rA: AnalyticRadiusFn, H: number, ut: number[], a: number, b: number, c: number,
): { su: number; st: number; sag: number } {
  let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c]; const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const A = lift(ua, ta), B = lift(ub, tb), C = lift(uc, tc);
  let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
  let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
  let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  let mx = 0, su = (ua + ub + uc) / 3, st = (ta + tb + tc) / 3;
  for (const [w0, w1, w2] of DENSE) {
    const uu = w0 * ua + w1 * ub + w2 * uc, tt = w0 * ta + w1 * tb + w2 * tc;
    const p = lift(uu, tt);
    const d = Math.abs((p[0] - A[0]) * nx + (p[1] - A[1]) * ny + (p[2] - A[2]) * nz);
    if (d > mx) { mx = d; su = uu; st = tt; }
  }
  return { su, st, sag: mx };
}

// ── build the base mesh + collect injected points, deterministic ────────────────────────────────────────────────
interface BaseCfg { chordTolMm: number; maxPoints: number; tolMm?: number; sizeRes?: number; hMin?: number }
function buildLocal(
  style: StyleId, cfg: BaseCfg, injectedPoints: number[],
): { ut: number[]; idx: Uint32Array; tris: number; points: number; hitBudget: boolean; ms: number } {
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...TANGLED_BASE,
    tolMm: cfg.tolMm ?? TANGLED_BASE.tolMm, sizeRes: cfg.sizeRes ?? TANGLED_BASE.sizeRes,
    hMin: cfg.hMin ?? TANGLED_BASE.hMin, hMax: TANGLED_BASE.hMax, gradeBeta: TANGLED_BASE.gradeBeta,
    seedN: TANGLED_BASE.seedN, splitThresh: TANGLED_BASE.splitThresh,
    maxPoints: cfg.maxPoints, optimizeSweeps: 2,
    guardManifoldAlways: true, chordTolMm: cfg.chordTolMm, chordSteiner: true,
    ...(injectedPoints.length >= 2 ? { injectedPoints, pinInjected: true } : {}),
  });
  return { ut: mesh.ut, idx: mesh.indices, tris: mesh.indices.length / 3, points: mesh.points, hitBudget: mesh.hitBudget, ms: Date.now() - t0 };
}

// %<20° min-angle (depth-invariant) — reported at the closing level
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

// ── the targeted local-refinement run: base rebuild → ≤5 local injected-Steiner passes → Newton re-verdict ───────
interface Pass {
  style: string; pass: number; label: string; injectedPts: number; tris: number; points: number; hitBudget: boolean;
  projFullPot: number; radialOutliers: number; radialMax: number; newtonOutliers: number; newtonExact: boolean;
  worstTrue: number; worstUt: [number, number]; nonMan: number; zeroArea: number; buildMs: number; newtonMs: number;
  pctBelow20?: number;
}
// Around each flagged facet's worst-sag (u,t), inject a MICRO-CLUSTER of Steiner points: the worst-sag point plus a
// small ring of satellites at radius `spread` in (u,t), so the local Delaunay places fine vertices ON the bulge and
// the kernel's own chord-Steiner (loose global chord unchanged) further refines only these locally-dense cells. The
// satellites break the "single point can't converge an interior bulge" failure (the kernel comment's rationale).
function buildInjectionCluster(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: Uint32Array, flaggedFacetIdx: number[],
  spread: number, nRing: number,
): number[] {
  const inj: number[] = [];
  const seen = new Set<string>();
  const push = (u: number, t: number): void => {
    const cu = u - Math.floor(u); // wrap u into [0,1)
    const ct = Math.min(1, Math.max(0, t));
    const k = `${Math.round(cu / 5e-6)},${Math.round(ct / 5e-6)}`;
    if (seen.has(k)) return; seen.add(k); inj.push(cu, ct);
  };
  for (const f of flaggedFacetIdx) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const w = facetWorstSagUt(rA, H, ut, a, b, c);
    push(w.su, w.st);
    for (let r = 0; r < nRing; r++) {
      const ang = (r / nRing) * TAU;
      push(w.su + spread * Math.cos(ang), w.st + spread * Math.sin(ang));
    }
  }
  return inj;
}

function runTargeted(
  style: StyleId, base: BaseCfg, spread: number, nRing: number, maxPasses = 5, maxPointsCap = 5_000_000,
  topWorst = 1500, nStrat = 1500,
): void {
  mkdirSync(join(DIR, style), { recursive: true });
  const passPath = join(DIR, style, 'passes.ndjson');
  const finalPath = join(DIR, style, 'final.ndjson');
  const done = new Map(readNdjson(passPath).map((r) => [Number(r.pass), r as unknown as Pass]));
  const rA = tangledRadiusFn(style, DIMS); const H = DIMS.H;
  const injPath = (p: number): string => join(DIR, style, `inj_${p}.json`);
  const traj: number[] = [];
  let converged = false, killedNonMono = false, killedBudget = false, prevNewton = Infinity, last: Pass | null = null;
  let accInjected: number[] = []; // cumulative injected points across passes (each pass adds the new residual's cluster)

  for (let p = 0; p <= maxPasses; p++) {
    const label = p === 0 ? 'base' : `local${p}`;
    if (done.has(p)) {
      const prior = done.get(p)!;
      traj.push(prior.newtonOutliers); prevNewton = prior.newtonOutliers; last = prior;
      process.stderr.write(`  SKIP ${style}/${label} (done newton=${prior.newtonOutliers} radial=${prior.radialOutliers} proj=${prior.projFullPot})\n`);
      if (prior.newtonOutliers === 0 && prior.projFullPot <= 10_000_000) { converged = true; break; }
      // RESUME: reload this pass's persisted cumulative injection so the NEXT pass continues from the right state.
      if (existsSync(injPath(p))) { accInjected = JSON.parse(readFileSync(injPath(p), 'utf8')) as number[]; }
      continue;
    }
    // BUILD (base = no injection; local = cumulative injected cluster). ONE build at a time.
    const build = buildLocal(style, { ...base, maxPoints: maxPointsCap }, accInjected);
    const sound = wholeMeshGuardRadialBound(rA, H, build.ut, build.idx, TOL);
    const nonMan = auditNonManRaw(build.idx);
    const nv = newtonVerdict(style, build.ut, build.idx, build.tris, TOL, topWorst, nStrat);
    const proj = projFullPot(build.tris);
    const pass: Pass = {
      style, pass: p, label, injectedPts: accInjected.length / 2, tris: build.tris, points: build.points,
      hitBudget: build.hitBudget, projFullPot: proj, radialOutliers: sound.outliers, radialMax: sound.maxMm,
      newtonOutliers: nv.newtonOutliers, newtonExact: nv.newtonExact, worstTrue: nv.worstTrue, worstUt: nv.worstUt,
      nonMan, zeroArea: sound.zeroArea, buildMs: build.ms, newtonMs: nv.newtonMs,
    };
    if (nv.newtonOutliers === 0) pass.pctBelow20 = +pctBelow20(build.ut, build.idx, rA, H).toFixed(3);
    appendFileSync(passPath, JSON.stringify(pass) + '\n');
    traj.push(nv.newtonOutliers); last = pass;
    // eslint-disable-next-line no-console
    console.log(`PASS ${style}/${label}: injected=${pass.injectedPts} tris=${build.tris} proj=${proj} hitBudget=${build.hitBudget} | radialOut=${sound.outliers}(max ${sound.maxMm}) → NEWTON=${nv.newtonOutliers}(worstTrue ${nv.worstTrue}@${JSON.stringify(nv.worstUt)}) | nonMan=${nonMan} zeroArea=${sound.zeroArea}${pass.pctBelow20 !== undefined ? ` %<20=${pass.pctBelow20}` : ''} | build=${build.ms}ms newton=${nv.newtonMs}ms`);
    // ── verdict logic ──
    if (nv.newtonOutliers === 0 && proj <= 10_000_000) { converged = true; break; }
    if (proj > 10_000_000) { killedBudget = true; process.stderr.write(`  KILL ${style}: projFullPot ${proj} > 10M before Newton 0 — FRONTIER\n`); break; }
    // NON-MONOTONE kill (CelticKnot §V11r-4): a LOCAL pass GROWING the count = hidden cliff sub-population. Use a
    // >10% margin (V11r) so estimator noise on a stratified (non-exact) large residual doesn't false-trip; an EXACT
    // small-residual grow trips immediately (the state where the literal-0 claim lives).
    const grew = nv.newtonExact ? nv.newtonOutliers > prevNewton : nv.newtonOutliers > prevNewton * 1.10;
    if (p > 0 && grew) { killedNonMono = true; process.stderr.write(`  KILL ${style}: Newton GREW ${prevNewton}→${nv.newtonOutliers} at a LOCAL pass — hidden cliff sub-population (CelticKnot §V11r-4 lesson), RECLASSIFY\n`); break; }
    prevNewton = nv.newtonOutliers;
    if (p === maxPasses) { process.stderr.write(`  ${style}: ${maxPasses} local passes did NOT reach 0 (newton ${nv.newtonOutliers}) — trajectory + scatter\n`); break; }
    // ── prepare the NEXT local pass: inject a cluster around THIS pass's radial-flagged residual (cheap superset) ──
    const cluster = buildInjectionCluster(rA, H, build.ut, build.idx, nv.flaggedFacetIdx, spread, nRing);
    accInjected = accInjected.concat(cluster);
    // CHECKPOINT the cumulative injection state keyed to THIS pass, so a resumed run reloads it for the next pass.
    writeFileSync(injPath(p), JSON.stringify(accInjected));
  }
  const verdict = converged ? 'CLOSED' : killedNonMono ? 'RECLASSIFY' : killedBudget ? 'FRONTIER' : 'FRONTIER-INCOMPLETE';
  appendFileSync(finalPath, JSON.stringify({
    label: 'final', style, verdict, converged, killedNonMono, killedBudget, trajectory: traj,
    finalTris: last?.tris ?? 0, finalProjFullPot: last?.projFullPot ?? 0, finalNewton: last?.newtonOutliers ?? -1,
    finalWorstTrue: last?.worstTrue ?? -1, finalNonMan: last?.nonMan ?? -1, finalZeroArea: last?.zeroArea ?? -1,
    finalPctBelow20: last?.pctBelow20 ?? -1, finalInjectedPts: last?.injectedPts ?? 0,
  }) + '\n');
  // eslint-disable-next-line no-console
  console.log(`FINAL ${style}: verdict=${verdict} newtonTrajectory=[${traj.join(',')}] finalTris=${last?.tris ?? 0} proj=${last?.projFullPot ?? 0}`);
}

describe('E-2026-07-08-TANGLED-TARGETED — LOCAL injected-Steiner refinement to Newton-0 (§V11u)', () => {
  it.skipIf(process.env.PF_TT !== 'HexagonalHive')('HexagonalHive', () => {
    // V11r: chord0.00125 = 100 radial / 60 Newton @ 7.24M proj (well under 10M, headroom for local injection). Start
    // there; inject dense clusters at the ~60 residual worst-sag points, pinned. spread 0.001 in (u,t) (~0.1% of the
    // u-period, sub-cell), 6-ring satellites break the interior-bulge failure. maxPointsCap 5M outer = 10M full-pot.
    runTargeted('HexagonalHive' as StyleId, { chordTolMm: 0.00125, maxPoints: 4_000_000 }, 0.001, 6, 5, 4_500_000);
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TT !== 'Crystalline')('Crystalline', () => {
    // V11r: base field intrinsically ~3.4M tris; finest under-6M point (b0.008/s224, 3.22M proj) = 33,535 Newton.
    // Start from that base config, inject clusters. Larger residual ⇒ may need all 5 passes / carry. Newton DOWNSIZED
    // to 500/500 (the V11r Voronoi precedent — the injection is driven by the CHEAP radial flag on ALL flagged facets;
    // Newton is ONLY the verdict, and the stratified fraction estimate stays sound while keeping each pass a tractable
    // checkpoint under the kill-cycle — a 1500/1500 base Newton on 33k residual is a ~2.5hr uninterruptible unit).
    // Once the residual shrinks below 500 the count becomes EXACT automatically (the CLOSE basis).
    runTargeted('Crystalline' as StyleId, { chordTolMm: 0.02, maxPoints: 3_000_000, tolMm: 0.008, sizeRes: 224 }, 0.001, 6, 5, 4_500_000, 500, 500);
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TT !== 'Voronoi')('Voronoi', () => {
    // V11r: largest floor; b0.008/s224 @3.92M = 65,590 Newton. Nearest-cell radiusFn is expensive (~13min/level).
    // Start from that base config; the residual is large so this likely carries — trajectory + classification.
    // Newton 500/500 (as Crystalline — cheap-radial-driven injection, Newton = verdict only, tractable checkpoints).
    runTargeted('Voronoi' as StyleId, { chordTolMm: 0.02, maxPoints: 3_000_000, tolMm: 0.008, sizeRes: 224 }, 0.001, 6, 5, 4_500_000, 500, 500);
    expect(true).toBe(true);
  }, 6 * HRS);
});
