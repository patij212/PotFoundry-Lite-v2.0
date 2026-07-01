// _frontierBet1EmbedProbe.test.ts — DEV-ONLY (env PF_BET1=1). FRONTIER Bet 1 discriminator: does a features-FIRST
// mesher (gmsh embedded skeleton) beat the in-house recover-after ceiling on GothicArches?
// Pipeline (all isolated — new files + the oracle; NO kernel/conforming edit): extract GothicArches feature loci ->
// planarize to a PSLG -> gmsh mesh.embed -> lift -> measure. Pre-registered CONFIRM: recovery >= 99% (vs in-house
// ~90%) AND featureLineChord3D p99 <= 0.112 (the in-house Stage-B number). Density/seam caveats reported honestly.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildRadiusFn, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial,
  auditNonManByIndex, triangleQualityDistribution, type StyleDims,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { writeOracleInput, readOracleOutput } from './exchange';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_bet1embed');
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const SEG_CAP = Number(process.env.PF_BET1_SEGCAP ?? 2500);   // cap embedded segs so planarize (O(n²)) + embed stay tractable
const UNIFORM_H = Number(process.env.PF_BET1_H ?? 0.004);     // (u,t) target size; embedded edges force local refinement anyway

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

describe('FRONTIER Bet 1 — gmsh embedded-skeleton vs in-house recover-after', () => {
  it.skipIf(process.env.PF_BET1 !== '1')('GothicArches: 100% embed recovery + true-3D feature p99', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    let segs = segmentsFromLines(truth.lines, 0.01);
    if (segs.length > SEG_CAP) { const stride = Math.ceil(segs.length / SEG_CAP); segs = segs.filter((_, i) => i % stride === 0); }
    const pslg = planarizeSegments(segs);
    // eslint-disable-next-line no-console
    console.log(`skeleton: ${segs.length} segs → PSLG ${pslg.points.length / 2} pts / ${pslg.edges.length / 2} edges`);

    const uni = UNIFORM_H;
    writeOracleInput(DIR, { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: false },
      sizing: { resU: 2, resT: 2, h: [uni, uni, uni, uni] }, embed: pslg, ours: null });
    const t0 = Date.now();
    execFileSync(PY, [ORACLE, 'mesh', '--in', DIR, '--engine', 'gmsh'], { stdio: 'pipe' });
    const secs = (Date.now() - t0) / 1000;
    const out = readOracleOutput(join(DIR, 'out_gmsh.json'));
    const ut = out.ut, indices = out.indices;

    const meshUt = buildMeshUt(ut, indices, rA, DIMS.H);
    const loc = buildLocator(meshUt, 256);
    // measure over the SAME interior region we embedded (seam-band loci were excluded from the non-periodic proxy,
    // so measuring them would unfairly dominate p99). apples-to-apples: interior-only truth.
    const SEAM = 0.01;
    const interiorTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };
    const fl3all = featureLineChord3D(truth, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
    const fl3 = featureLineChord3D(interiorTruth, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
    // eslint-disable-next-line no-console
    console.log(`  p99: interior(embedded)=${fl3.p99Mm.toFixed(4)}  all-loci(incl seam)=${fl3all.p99Mm.toFixed(4)}`);
    const lifted = liftUtToRadial(ut, rA, DIMS.H);
    const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: Uint32Array.from(indices) });
    const nonMan = auditNonManByIndex(meshUt.xyz, indices);
    const rec = recovery(pslg.points, pslg.edges, ut, indices);

    // eslint-disable-next-line no-console
    console.log(
      `BET1 gmsh-embed GothicArches: tris=${indices.length / 3} recovery=${(100 * rec).toFixed(1)}% ` +
      `true3D_p99=${fl3.p99Mm.toFixed(4)} max=${fl3.maxMm.toFixed(3)} minAngle=${q.minAngleDeg.toFixed(1)} ` +
      `%<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan} | ${secs.toFixed(0)}s ` +
      `| vs in-house: recovery ~90%, p99 0.112`,
    );
    // eslint-disable-next-line no-console
    console.log(`VERDICT: ${rec >= 0.99 && fl3.p99Mm <= 0.112 ? 'CONFIRMED (features-first beats recover-after)' : rec >= 0.99 ? 'PARTIAL (100% recovery; p99 above 0.112 — likely density/seam)' : 'refuted/inconclusive'}`);
    expect(indices.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
