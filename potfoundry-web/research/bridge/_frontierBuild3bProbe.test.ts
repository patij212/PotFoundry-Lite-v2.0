// _frontierBuild3bProbe.test.ts — DEV-ONLY (env PF_BUILD3B=1). FRONTIER BUILD #3b: drive the heatmap FULLY GREEN via
// SAG-DRIVEN RE-INJECTION (worst-sag Steiner, the RIGHT lever). Build #3 showed chordTolMm (longest-edge split)
// BEADS the ribs — it splits the flank, never lands a vertex ON the thin rib. Fix: each round, find every facet whose
// chord sag > TOL, take the (u,t) of its worst BARY sample (which lies ON the rib), and ADD those to the pinned
// injection set; re-mesh. Vertices land on the beads → the over-spanning facets split → green. Isolated: CALLS the
// kernel; edits nothing. Reports the per-round trajectory + renders the final heatmap.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, liftTrue,
  liftUtToRadial, triangleQualityDistribution, auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins,
  type StyleDims, type AnalyticRadiusFn,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_build3b');
const SEAM = 0.01, TAU = 2 * Math.PI;
const TOL = Number(process.env.PF_B3B_TOL ?? 0.03);      // green target: facet sag <= this
const ROUNDS = Number(process.env.PF_B3B_ROUNDS ?? 5);
const OPTS = { tolMm: 0.004, hMin: 0.003, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 5_000_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;
const BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

/** per-face worst-sag: returns worst overall, fraction>TOL, and the (u,t) of each over-TOL face's worst BARY sample. */
function sagAnalyze(ut: number[], idx: number[], rA: AnalyticRadiusFn, H: number, tol: number): { worst: number; overFrac: number; addPts: Array<{ u: number; t: number }> } {
  const n = ut.length / 2; const xyz = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const [x, y, z] = liftTrue(ut[2 * i], ut[2 * i + 1], rA, H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const nF = idx.length / 3; let worst = 0, over = 0; const addPts: Array<{ u: number; t: number }> = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let fErr = 0, wu = 0, wt = 0;
    for (const [wa, wb, wc] of BARY) {
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > fErr) { fErr = d; wu = ((um % 1) + 1) % 1; wt = Math.min(1, Math.max(0, tm)); }
    }
    if (fErr > worst) worst = fErr;
    if (fErr > tol) { over++; addPts.push({ u: wu, t: wt }); }
  }
  return { worst, overFrac: nF ? over / nF : 0, addPts };
}

describe('FRONTIER BUILD #3b — fully green via sag-driven re-injection', () => {
  it.skipIf(process.env.PF_BUILD3B !== '1')('GothicArches: iterate worst-sag Steiner until green', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const injected: number[] = [...planarizeSegments(segmentsFromLines(refined, SEAM)).points];
    const seen = new Set<string>();
    const SNAP = 0.0015; const key = (u: number, t: number): string => `${Math.round(u / SNAP)}_${Math.round(t / SNAP)}`;
    for (let i = 0; i < injected.length; i += 2) seen.add(key(injected[i], injected[i + 1]));

    let lastUt: number[] = [], lastIdx: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, injectedPoints: injected, pinInjected: true, guardManifoldAlways: true });
      const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
      lastUt = ut; lastIdx = idx;
      const { worst, overFrac, addPts } = sagAnalyze(ut, idx, rA, DIMS.H, TOL);
      let added = 0;
      for (const p of addPts) { const k = key(p.u, p.t); if (!seen.has(k)) { seen.add(k); injected.push(p.u, p.t); added++; } }
      // eslint-disable-next-line no-console
      console.log(`round ${round}: tris=${idx.length / 3} injected=${injected.length / 2} worstSag=${worst.toFixed(4)}mm over${TOL}=${(100 * overFrac).toFixed(3)}% +added=${added}`);
      if (worst < 0.035 || added === 0) { console.log(`CONVERGED at round ${round}: worst ${worst.toFixed(4)}mm`); break; } // eslint-disable-line no-console
    }
    const sag = perFaceChordSag(lastUt, lastIdx, rA, DIMS.H);
    const meshUt = buildMeshUt(lastUt, lastIdx, rA, DIMS.H);
    const q = triangleQualityDistribution({ vertices: liftUtToRadial(lastUt, rA, DIMS.H).vertices, indices: Uint32Array.from(lastIdx) });
    const nonMan = auditNonManByIndex(meshUt.xyz, lastIdx);
    dumpRenderBins(DIR, 'build3b_green', meshUt.xyz, lastIdx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { worst: sag.worstMm, nonMan }, stl: true });
    // eslint-disable-next-line no-console
    console.log(`BUILD3b FINAL: tris=${lastIdx.length / 3} worstSag=${sag.worstMm.toFixed(4)}mm RED(>0.1)=${(100 * sag.fracOver(0.1)).toFixed(4)}% >0.05=${(100 * sag.fracOver(0.05)).toFixed(4)}% >0.03=${(100 * sag.fracOver(0.03)).toFixed(3)}% | minA=${q.minAngleDeg.toFixed(2)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan} | FULLY GREEN=${sag.worstMm < 0.05 ? 'near' : 'no'}`);
    expect(lastIdx.length).toBeGreaterThan(0);
  }, 90 * 60 * 1000);
});
