// _lockBlockProbe.test.ts — DEV-ONLY (env PF_LOCKBLOCK=1). Discriminator for E-2026-07-01-PUREGREEN P2:
// is the yellow-band residual capped by the LOCKED constraint edges (Steiner can't fold into a locked face) or by
// SIZING/sampling? Build GothicArches HD chordSteiner + chordTolMm 0.01 WITHOUT any conforming/locks (F) and
// compare its per-face chord sag to the t10 conf+planarize build (worst 0.191, YEL 0.044%). If F.worst << 0.19
// => the locks are the cap (fix = unlock / soft-constrain). If F.worst ~ 0.19 => not the locks (fix = sizing).
// MEASURE-ONLY; no src/ edits.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt } from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

function sagStats(ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number): { worst: number; red: number; yel: number; tris: number } {
  const m = buildMeshUt(ut, indices, rA, H); const xyz = m.xyz; const nF = indices.length / 3;
  let worst = 0, red = 0, yel = 0;
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let e = 0;
    for (const [w0, w1, w2] of BARY) {
      const um = w0 * ua + w1 * ub + w2 * uc, tm = w0 * ta + w1 * tb + w2 * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > e) e = d;
    }
    if (e > worst) worst = e; if (e > 0.15) red++; if (e > 0.05) yel++;
  }
  return { worst, red: 100 * red / nF, yel: 100 * yel / nF, tris: nF };
}

describe('lock-block discriminator', () => {
  it.skipIf(process.env.PF_LOCKBLOCK !== '1')('plain kernel + steiner + chord0.01 (NO locks) HD', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const OPTS: InhouseMeshOpts = {
      tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
      maxPoints: 8_000_000, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
      chordTolMm: 0.01, chordSteiner: true, guardManifoldAlways: true,
    };
    const F = buildInhouseMetricMesh(rA, H, OPTS);
    const s = sagStats(F.ut, Uint32Array.from(F.indices), rA, H);
    // eslint-disable-next-line no-console
    console.log(`F: plain+steiner+chord0.01 (NO conforming/locks) tris=${s.tris} worst=${s.worst.toFixed(3)}mm RED=${s.red.toFixed(4)}% YEL=${s.yel.toFixed(4)}%`);
    // eslint-disable-next-line no-console
    console.log(`   compare t10 (conf+planarize+steiner+chord0.01): worst=0.191 RED=0.0005% YEL=0.044% tris=3.15M`);
    // eslint-disable-next-line no-console
    console.log(s.worst < 0.12 ? '   => VERDICT: locks are the CAP (F worst << 0.19) — fix = unlock/soft-constrain' : '   => VERDICT: NOT the locks (F worst ~ 0.19) — fix = sizing-field aliasing (Bet 2)');
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
