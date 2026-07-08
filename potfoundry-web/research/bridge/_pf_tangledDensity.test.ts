// _pf_tangledDensity.test.ts — DEV-ONLY (env-gated). E-2026-07-08-TANGLED-DENSITY-CLOSE (spec §V11r).
//
// Follow-up to E-2026-07-08-TANGLED-CONTINUATION (§V11i): the Newton true-3D ruler adjudicated 4 tangled styles as
// DENSITY-FLOOR class on the persisted _best20 reaching meshes (HexHive ~26,262 @0.041 / Crystalline ~14,263 @0.134
// / Voronoi ~115,816 @0.137 / CelticKnot ~61,551 @0.300). But density-closability was INFERRED from slope/scatter,
// never DEMONSTRATED — V11i is a SINGLE density anchor, not a trajectory.
//
// THIS ARM supplies the missing demonstration: drive the deep-sag buildTangled kernel (chordTolMm the density lever)
// across an increasing-density sweep and measure the HONEST NEWTON true-3D outlier count at EACH level. The radial
// bound DRIVES refinement (SOUND-but-overstating ⇒ over-refining is a budget cost, not a correctness bug — it is a
// fine refinement driver); the VERDICT at each level is Newton on the worst-radial sample per radial-flagged facet
// (the V11i runTruthFloor recipe: worst-1500 full + stratified tail → honest scaled count).
//
// VERDICT per style: CLOSED (Newton 0 under 6M) / FRONTIER (monotone but plateaus over 6M) / re-classify (NON-monotone
// = Gyroid §V11b density-invariant floor ⇒ hidden cliff-class).
//
// PROBES (each its own env gate + per-pass ndjson checkpoint → resume/env-kill safe):
//   PF_TDC=<Style>   — density sweep: buildTangled at each chordTolMm level → radial screen + Newton verdict.
//
// ISOLATION: NEW file. Imports _pf_tangledKernelLib + _gyroid_truthLib + labkit READ-ONLY. NO src/ edit; NO edit to
// _ds_conforming*, tierC/**, _gyroid_truth*, or the concurrent agents' _tierc_topology/_gyroid_polish files.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTangled, wholeMeshGuardRadialBound, auditNonManRaw, radiusFn,
  type TangledBuild, type SoundScore,
} from './_pf_tangledKernelLib';
import { worstFacetsByRadial, newtonNearest } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_tangled_density');
const HRS = 60 * 60 * 1000;

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const ln of readFileSync(path, 'utf8').split('\n')) { if (!ln.trim()) continue; try { rows.push(JSON.parse(ln)); } catch { /* skip */ } }
  return rows;
}
function projFullPot(outerTris: number): number { return 2 * outerTris; }

// ── triangle-quality min-angle distribution (%<20°) — reported at the CLOSING level, honest depth-invariant basis ──
function pctBelow20(ut: number[], idx: Uint32Array, rA: (th: number, z: number) => number, H: number): number {
  const TAU = 2 * Math.PI; const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const nF = idx.length / 3; let below = 0, counted = 0;
  const ang = (px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number): number => {
    const ux = qx - px, uy = qy - py, uz = qz - pz, vx = rx - px, vy = ry - py, vz = rz - pz;
    const nu = Math.hypot(ux, uy, uz), nv = Math.hypot(vx, vy, vz); if (nu < 1e-12 || nv < 1e-12) return 180;
    const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (nu * nv))); return Math.acos(c) * 180 / Math.PI;
  };
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    const A = ang(ax, ay, az, bx, by, bz, cx, cy, cz);
    const B = ang(bx, by, bz, ax, ay, az, cx, cy, cz);
    const C = 180 - A - B; const minA = Math.min(A, B, C);
    counted++; if (minA < 20) below++;
  }
  return counted ? (100 * below) / counted : 0;
}

// ── NEWTON verdict on an IN-MEMORY mesh (the V11i runTruthFloor recipe, in-memory instead of _best20 load) ─────────
// worst-radial-sample-per-radial-flagged-facet basis: rank facets by SOUND radial bound → Newton-score the worst
// point of the worst-N + a stratified tail → honest scaled true-3D outlier count. Newton grid-free (VALIDATED §V11j).
const DENSE_TF = ((): Array<[number, number, number]> => { const B: Array<[number, number, number]> = []; const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]); return B; })();
function facetTrue3DWorstPoint(
  rec: { verts: [number, number, number][] }, rA: (th: number, z: number) => number, H: number,
  nearest: (px: number, py: number, pz: number) => number,
): { tru: number; uw: number; tw: number } {
  const [A, B, C] = rec.verts; const TAU2 = 2 * Math.PI;
  const radBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; const th = Math.atan2(py, px); return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + TAU2 : th, pz)); };
  let bwa = 1, bwb = 0, bwc = 0, bB = -1;
  for (const [wa, wb, wc] of DENSE_TF) {
    const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2];
    const b = radBound(px, py, pz); if (b > bB) { bB = b; bwa = wa; bwb = wb; bwc = wc; }
  }
  const px = bwa * A[0] + bwb * B[0] + bwc * C[0], py = bwa * A[1] + bwb * B[1] + bwc * C[1], pz = bwa * A[2] + bwb * B[2] + bwc * C[2];
  return { tru: nearest(px, py, pz), uw: bwa, tw: bwc };
}
interface NewtonVerdict {
  nRadialOutliers: number; worstNscored: number; worstTrueOutliers: number; stratScored: number; stratTrueOutliers: number;
  stratFrac: number; honestTrueOutliers: number; worstTrueMax: number; worstTrueUt: [number, number]; slopeMed: number; slopeP90: number; newtonMs: number;
}
function newtonVerdict(
  style: StyleId, ut: number[], idx: Uint32Array, tris: number, tol: number, topWorst: number, nStrat: number,
): NewtonVerdict {
  const rA = radiusFn(style, DIMS);
  const t0 = Date.now();
  const big = worstFacetsByRadial(rA, DIMS.H, ut, idx, tris); // topN=tris ⇒ full ranked list
  const radialOutliers = big.recs.filter((r) => r.radialDev > tol);
  const nRadial = radialOutliers.length;
  const nearest = (px: number, py: number, pz: number): number => newtonNearest(rA, DIMS.H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 5, nZSeeds: 5, maxIter: 40 }).dist;
  const worstSet = radialOutliers.slice(0, Math.min(topWorst, nRadial));
  const rest = radialOutliers.slice(worstSet.length);
  const stratIdx: number[] = [];
  if (rest.length > 0) { const step = Math.max(1, Math.floor(rest.length / Math.max(1, nStrat))); for (let i = 0; i < rest.length; i += step) stratIdx.push(i); }
  let worstTrue = 0, worstU = 0, worstT = 0;
  const trueSlopes: number[] = [];
  const scoreOne = (rec: (typeof radialOutliers)[number]): number => {
    const { tru } = facetTrue3DWorstPoint(rec, rA, DIMS.H, nearest);
    const th = 2 * Math.PI * rec.uc, z = rec.tc * DIMS.H; const dz = 0.02;
    const slope = Math.abs((rA(th, Math.min(DIMS.H, z + dz)) - rA(th, Math.max(0, z - dz))) / (2 * dz));
    if (tru > worstTrue) { worstTrue = tru; worstU = rec.uc; worstT = rec.tc; }
    if (tru > tol) trueSlopes.push(slope);
    return tru;
  };
  let worstTrueOut = 0;
  for (const rec of worstSet) { if (scoreOne(rec) > tol) worstTrueOut++; }
  let stratTrueOut = 0, stratScored = 0;
  for (const i of stratIdx) { if (scoreOne(rest[i]) > tol) stratTrueOut++; stratScored++; }
  const stratFrac = stratScored ? stratTrueOut / stratScored : 0;
  const honestTrueOutliers = Math.round(worstTrueOut + rest.length * stratFrac);
  trueSlopes.sort((a, b) => a - b);
  const slopeMed = trueSlopes.length ? trueSlopes[Math.floor(trueSlopes.length / 2)] : 0;
  const slopeP90 = trueSlopes.length ? trueSlopes[Math.floor(trueSlopes.length * 0.9)] : 0;
  return {
    nRadialOutliers: nRadial, worstNscored: worstSet.length, worstTrueOutliers: worstTrueOut,
    stratScored, stratTrueOutliers: stratTrueOut, stratFrac: +stratFrac.toFixed(4),
    honestTrueOutliers, worstTrueMax: +worstTrue.toFixed(5), worstTrueUt: [+worstU.toFixed(5), +worstT.toFixed(5)],
    slopeMed: +slopeMed.toFixed(3), slopeP90: +slopeP90.toFixed(3), newtonMs: Date.now() - t0,
  };
}

// ── DENSITY SWEEP: buildTangled at each level → radial screen + Newton verdict. Resumable per-pass. ──────────────
interface Pass {
  style: string; label: string; chordTolMm: number; maxPoints: number; tris: number; points: number; hitBudget: boolean;
  projFullPot: number; radialOutliers: number; radialMax: number; radialP99: number; zeroArea: number; nonMan: number;
  honestTrueOutliers: number; worstTrueMax: number; worstTrueUt: [number, number]; slopeMed: number; slopeP90: number;
  stratFrac: number; nRadialOutliers: number; buildMs: number; scoreMs: number; newtonMs: number; pctBelow20?: number;
}
function runDensitySweep(
  style: StyleId, chordSweep: number[], maxPointsSweep: number[], topWorst = 1500, nStrat = 1500, tol = 0.01,
): void {
  mkdirSync(join(DIR, style), { recursive: true });
  const passPath = join(DIR, style, 'passes.ndjson');
  const finalPath = join(DIR, style, 'final.ndjson');
  const donePasses = new Map(readNdjson(passPath).map((r) => [String(r.label), r as unknown as Pass]));
  const traj: number[] = []; let converged = false; let killedNonMono = false; let killedBudget = false;
  let prevNewton = Infinity; let lastPass: Pass | null = null; let closingLevelPct = -1;
  for (let k = 0; k < chordSweep.length; k++) {
    const chordTolMm = chordSweep[k]; const maxPoints = maxPointsSweep[k];
    const label = `chord${chordTolMm}_mp${Math.round(maxPoints / 1000)}k`;
    if (donePasses.has(label)) {
      const prior = donePasses.get(label)!;
      traj.push(prior.honestTrueOutliers); prevNewton = prior.honestTrueOutliers; lastPass = prior;
      process.stderr.write(`  SKIP ${style}/${label} (done newton=${prior.honestTrueOutliers} radial=${prior.radialOutliers})\n`);
      if (prior.honestTrueOutliers === 0 && prior.projFullPot <= 6_000_000) { converged = true; break; }
      continue;
    }
    // ── build (ONE at a time; prior arm stalled under 3-agent saturation) ──
    const bT0 = Date.now();
    const b: TangledBuild = buildTangled(style, DIMS, { chordTolMm, maxPoints });
    const buildMs = Date.now() - bT0;
    // ── radial screen (cheap, SOUND upper bound + zeroArea) ──
    const scoreT0 = Date.now();
    const sound: SoundScore = wholeMeshGuardRadialBound(radiusFn(style, DIMS), DIMS.H, b.ut, b.idx, tol);
    const nonMan = auditNonManRaw(b.idx);
    const scoreMs = Date.now() - scoreT0;
    // ── Newton verdict (the honest true-3D count for THIS level) ──
    const nv = newtonVerdict(style, b.ut, b.idx, b.tris, tol, topWorst, nStrat);
    const proj = projFullPot(b.tris);
    const pass: Pass = {
      style, label, chordTolMm, maxPoints, tris: b.tris, points: b.points, hitBudget: b.hitBudget, projFullPot: proj,
      radialOutliers: sound.outliers, radialMax: sound.maxMm, radialP99: sound.p99, zeroArea: sound.zeroArea, nonMan,
      honestTrueOutliers: nv.honestTrueOutliers, worstTrueMax: nv.worstTrueMax, worstTrueUt: nv.worstTrueUt,
      slopeMed: nv.slopeMed, slopeP90: nv.slopeP90, stratFrac: nv.stratFrac, nRadialOutliers: nv.nRadialOutliers,
      buildMs, scoreMs, newtonMs: nv.newtonMs,
    };
    // %<20 only at a converged/near-converged level (cheap but adds a pass; report at close)
    if (nv.honestTrueOutliers === 0) { pass.pctBelow20 = +pctBelow20(b.ut, b.idx, radiusFn(style, DIMS), DIMS.H).toFixed(3); closingLevelPct = pass.pctBelow20; }
    appendFileSync(passPath, JSON.stringify(pass) + '\n');
    // scatter of Newton-scored worst outliers (for plateau localization if FRONTIER)
    traj.push(nv.honestTrueOutliers); lastPass = pass;
    // eslint-disable-next-line no-console
    console.log(`PASS ${style}/${label}: tris=${b.tris} pts=${b.points} proj=${proj} hitBudget=${b.hitBudget} | radialOut=${sound.outliers}(max ${sound.maxMm}) → NEWTON=${nv.honestTrueOutliers}(worstTrue ${nv.worstTrueMax}@${JSON.stringify(nv.worstTrueUt)} slopeMed ${nv.slopeMed}) | zeroArea=${sound.zeroArea} nonMan=${nonMan}${pass.pctBelow20 !== undefined ? ` %<20=${pass.pctBelow20}` : ''} | build=${buildMs}ms score=${scoreMs}ms newton=${nv.newtonMs}ms`);
    // ── verdict logic ──
    if (nv.honestTrueOutliers === 0 && proj <= 6_000_000) { converged = true; break; }
    // NON-MONOTONE = Gyroid §V11b signature: Newton count GROWS with density ⇒ re-classify (hidden cliff-class).
    if (nv.honestTrueOutliers > prevNewton * 1.10 && k > 0) { killedNonMono = true; process.stderr.write(`  KILL ${style}: Newton NON-monotone (${prevNewton}→${nv.honestTrueOutliers}) — Gyroid §V11b density-invariant-floor signature, re-classify\n`); break; }
    prevNewton = nv.honestTrueOutliers;
    if (proj > 6_000_000) { killedBudget = true; process.stderr.write(`  KILL ${style}: projFullPot ${proj} > 6M before Newton 0 — FRONTIER (report density-vs-outlier curve)\n`); break; }
  }
  const verdict = converged ? 'CLOSED' : killedNonMono ? 'RECLASSIFY' : killedBudget ? 'FRONTIER' : 'FRONTIER-INCOMPLETE';
  appendFileSync(finalPath, JSON.stringify({
    label: 'final', style, verdict, converged, killedNonMono, killedBudget, trajectory: traj,
    finalTris: lastPass?.tris ?? 0, finalProjFullPot: lastPass?.projFullPot ?? 0, closingPctBelow20: closingLevelPct,
    finalNewton: lastPass?.honestTrueOutliers ?? -1, finalWorstTrue: lastPass?.worstTrueMax ?? -1,
    finalNonMan: lastPass?.nonMan ?? -1, finalZeroArea: lastPass?.zeroArea ?? -1,
  }) + '\n');
  // eslint-disable-next-line no-console
  console.log(`FINAL ${style}: verdict=${verdict} newtonTrajectory=[${traj.join(',')}] finalTris=${lastPass?.tris ?? 0} proj=${lastPass?.projFullPot ?? 0}`);
}

// Per-style density-close sweep. chordTolMm coarse→fine with matched maxPoints budget (≤3M outer = ≤6M full-pot).
// Cheapest first: HexHive (0.94M @ V11i anchor, 93.5% flat, purest density case) → Crystalline → Voronoi → CelticKnot.
describe('E-2026-07-08-TANGLED-DENSITY-CLOSE — Newton-verdict density sweep (§V11r)', () => {
  it.skipIf(process.env.PF_TDC !== 'HexagonalHive')('HexagonalHive', () => {
    // Newton 56364→26436→3847→1429 monotone at proj≤3.49M (V11r); headroom to 6M ⇒ extend finer to reach 0 / plateau.
    runDensitySweep('HexagonalHive' as StyleId, [0.02, 0.01, 0.005, 0.0025, 0.00125, 0.0006], [900_000, 1_400_000, 2_200_000, 3_000_000, 3_000_000, 3_000_000]);
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TDC !== 'Crystalline')('Crystalline', () => {
    runDensitySweep('Crystalline' as StyleId, [0.02, 0.01, 0.005, 0.0025], [900_000, 1_400_000, 2_200_000, 3_000_000]);
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TDC !== 'Voronoi')('Voronoi', () => {
    runDensitySweep('Voronoi' as StyleId, [0.02, 0.01, 0.005, 0.0025], [900_000, 1_600_000, 2_400_000, 3_000_000]);
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TDC !== 'CelticKnot')('CelticKnot', () => {
    runDensitySweep('CelticKnot' as StyleId, [0.02, 0.01, 0.005, 0.0025], [900_000, 1_600_000, 2_400_000, 3_000_000]);
    expect(true).toBe(true);
  }, 6 * HRS);
});
