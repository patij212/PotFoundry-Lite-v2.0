// _frontierBet1EmbedProbe.test.ts — DEV-ONLY (env PF_BET1=1). FRONTIER Bet 1 discriminator: does a features-FIRST
// mesher (gmsh embedded skeleton) beat the in-house recover-after ceiling on GothicArches, and does embedding
// TRUE-EXTREMUM-REFINED loci (vs raw bilinear-sampler loci) close the fidelity gap?
// Isolated (new files + the oracle embed mode; NO kernel/conforming edit). Pipeline: extract GothicArches loci ->
// [raw | refined-to-crest] -> planarize to a PSLG -> gmsh mesh.embed -> lift -> measure. A/B at equal budget over a
// FIXED interior truth. Pre-registered: recovery >= 99% (both) AND refined p99 materially < raw (0.51) toward 0.112.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildRadiusFn, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial,
  auditNonManByIndex, triangleQualityDistribution, type StyleDims, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import { writeOracleInput, readOracleOutput } from './exchange';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_bet1embed');
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const SEG_CAP = Number(process.env.PF_BET1_SEGCAP ?? 12000);
const UNIFORM_H = Number(process.env.PF_BET1_H ?? 0.003);
const SEAM = 0.01;

/** fraction of PSLG edges whose midpoint lies on a mesh edge (grid-accelerated) — the recovery metric. */
function recovery(P: number[], E: number[], ut: number[], indices: number[], eps = 1e-4): number {
  const cell = 0.01; const grid = new Map<string, number[]>(); const me: number[] = []; const seen = new Set<string>();
  for (let f = 0; f < indices.length; f += 3) {
    const tri = [indices[f], indices[f + 1], indices[f + 2]];
    for (const [i, j] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`; if (seen.has(k)) continue; seen.add(k);
      me.push(ut[2 * i], ut[2 * i + 1], ut[2 * j], ut[2 * j + 1]);
    }
  }
  const nE = me.length / 4;
  for (let e = 0; e < nE; e++) {
    const gx = Math.floor(((me[4 * e] + me[4 * e + 2]) / 2) / cell), gy = Math.floor(((me[4 * e + 1] + me[4 * e + 3]) / 2) / cell);
    const key = `${gx},${gy}`; const arr = grid.get(key); if (arr) arr.push(e); else grid.set(key, [e]);
  }
  const d2seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1e-20; let s = ((px - ax) * dx + (py - ay) * dy) / L2; s = Math.min(1, Math.max(0, s));
    return Math.hypot(px - (ax + s * dx), py - (ay + s * dy));
  };
  let ok = 0, tot = 0;
  for (let k = 0; k < E.length; k += 2) {
    const i = E[k], j = E[k + 1]; const mx = (P[2 * i] + P[2 * j]) / 2, my = (P[2 * i + 1] + P[2 * j + 1]) / 2; tot++;
    let best = Infinity; const gx = Math.floor(mx / cell), gy = Math.floor(my / cell);
    for (let ax = gx - 1; ax <= gx + 1; ax++) for (let ay = gy - 1; ay <= gy + 1; ay++) {
      const arr = grid.get(`${ax},${ay}`); if (!arr) continue;
      for (const e of arr) { const d = d2seg(mx, my, me[4 * e], me[4 * e + 1], me[4 * e + 2], me[4 * e + 3]); if (d < best) best = d; }
    }
    if (best < eps) ok++;
  }
  return tot ? ok / tot : 0;
}

describe('FRONTIER Bet 1 — embedded skeleton: recovery + raw-vs-refined loci fidelity', () => {
  it.skipIf(process.env.PF_BET1 !== '1')('GothicArches: 100% recovery + refined-loci closes p99', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const interiorTruth: FeatureTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };

    const buildPslg = (lines: ReadonlyArray<{ points: ReadonlyArray<{ u: number; t: number }> }>): { points: number[]; edges: number[] } => {
      let s = segmentsFromLines(lines, SEAM);
      if (s.length > SEG_CAP) { const k = Math.ceil(s.length / SEG_CAP); s = s.filter((_, i) => i % k === 0); }
      return planarizeSegments(s);
    };
    const runEmbed = (label: string, pslg: { points: number[]; edges: number[] }): { rec: number; p99: number } => {
      writeOracleInput(DIR, { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: false }, sizing: { resU: 2, resT: 2, h: [UNIFORM_H, UNIFORM_H, UNIFORM_H, UNIFORM_H] }, embed: pslg, ours: null });
      execFileSync(PY, [ORACLE, 'mesh', '--in', DIR, '--engine', 'gmsh'], { stdio: 'pipe' });
      const out = readOracleOutput(join(DIR, 'out_gmsh.json'));
      const meshUt = buildMeshUt(out.ut, out.indices, rA, DIMS.H);
      const fl3 = featureLineChord3D(interiorTruth, buildLocator(meshUt, 256), meshUt, rA, DIMS.H, 0.05, 0, 4);
      const nonMan = auditNonManByIndex(meshUt.xyz, out.indices);
      const rec = recovery(pslg.points, pslg.edges, out.ut, out.indices);
      const lifted = liftUtToRadial(out.ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: Uint32Array.from(out.indices) });
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(13)} pslg=${pslg.edges.length / 2}e tris=${out.indices.length / 3} recovery=${(100 * rec).toFixed(1)}% p99=${fl3.p99Mm.toFixed(4)} max=${fl3.maxMm.toFixed(3)} minA=${q.minAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan}`);
      return { rec, p99: fl3.p99Mm };
    };

    const raw = runEmbed('RAW loci', buildPslg(truth.lines));
    const refined = runEmbed('REFINED loci', buildPslg(refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6)));
    // eslint-disable-next-line no-console
    console.log(`BET1 fidelity A/B: RAW p99 ${raw.p99.toFixed(4)} -> REFINED p99 ${refined.p99.toFixed(4)} | recovery ${(100 * raw.rec).toFixed(0)}%/${(100 * refined.rec).toFixed(0)}% (vs in-house recover-after ~90%) | target p99<=0.112`);
    expect(refined.rec).toBeGreaterThan(0.9);
  }, 30 * 60 * 1000);
});
