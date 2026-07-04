// _pf_sfbseam2.test.ts — DEV-ONLY (PF_SFBSEAM2=1). E-2026-07-04-SFB-SEAM builder + HONEST decomposition.
// Diagnostic (_pf_sfbseam) PROVED: the θ=0 seam is a GENUINE radius-discontinuity cliff wall (step max 8.98mm,
// mean 2.09mm) that is NOT part of the parametric surface rA(θ,z). A point on the mid seam wall reads true-3D
// 1.94mm against the FULL-AZIMUTH brute ruler ⇒ the parametric-surface ruler is BLIND to the seam wall (a real
// object feature). ⇒ true-3D ≤0.01 measured against rA on seam-WALL facets is UNACHIEVABLE-BY-CONSTRUCTION.
//
// This probe builds the DOUBLED seam-edge + RUNG ladder (buildSeamLadderWatertight = two explicit lip edges vL@r1
// + vR@r0 as mesh edges + interior rung strip on the wall) and scores it with the HONEST decomposition:
//   (1) BODY true-3D p99  — brute-anchored, EXCLUDING the θ=0 seam band (the fidelity of the object surface).
//   (2) SEAM-LIP serration — max radial residual of the u=0+ and u=1- LIP vertices vs rA(0,z)/rA(2π⁻,z)
//       (the true feature edges), NOT interior rungs (which sit ON the wall, off the parametric surface by design).
//   (3) rawNonMan (RAW index) + (4) %<20 (min-angle).
//   (5) SEAM-WALL true-3D (rungs vs rA) — reported to SHOW the ruler blind-spot magnitude, NOT as a defect.
// Two densities. Checkpoint every row the instant it is scored.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildFeatureTruth, buildMeshUt, buildLocator,
  featureLineChord3D, liftUtToRadial, triangleQualityDistribution, perFaceChordSag,
  bruteAnchoredRedPerp,
} from './labkit';
import { findBirths } from './_scaleColDriver';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { buildSeamLadderWatertight } from './_ct_sfbwaterLib';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SFBSEAM2 === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_sfbseam');
const LEDGER = join(DIR, 'scorecard.ndjson');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI;
const STYLE = 'SuperformulaBlossom' as StyleId;

/** RAW-index non-manifold count, SHARDED (a single Map caps at ~16.7M entries — mirrors labkit.auditNonManByIndex).
 * No 3D weld: literal-index edges shared by >2 tris. Numeric key (p*EK+q) sharded by low bits of the min endpoint. */
function auditNonManRaw(indices: ArrayLike<number>, nV: number): number {
  const EK = nV + 1, NSHARD = 64;
  const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (p: number, q: number): void => { const key = p < q ? p * EK + q : q * EK + p; const m = ecs[(p < q ? p : q) & (NSHARD - 1)]; m.set(key, (m.get(key) ?? 0) + 1); };
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    bump(a, b); bump(b, c); bump(c, a);
  }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}

/** SEAM-LIP serration: max radial residual of ONLY the two explicit lip edges (u=1-1e-9 at r1; u=0+ NON-rung at r0).
 * A lip vertex is a body-boundary column vertex on the seam (u<seamEps or u>1-seamEps). Interior rungs also carry
 * u≈0 but sit at y=0 with a MID radius; we separate them by requiring the vertex radius match rA(0,z) or rA(2π⁻,z)
 * within a wide bracket first, then report the residual — i.e. we measure whether the LIPS landed exactly on the
 * true feature loci. (The interior rung residual vs rA is the ruler blind-spot, reported separately.) */
function seamLipSerration(ut: number[], xyz: Float64Array, rA: (th: number, z: number) => number): { lipSerr: number; wallMax: number; nLip: number; nWall: number } {
  let lipSerr = 0, wallMax = 0, nLip = 0, nWall = 0; const nV = ut.length / 2;
  for (let i = 0; i < nV; i++) {
    const u = ((ut[2 * i] % 1) + 1) % 1;
    if (!(u < 3e-3 || u > 1 - 3e-3)) continue;
    const z = ut[2 * i + 1] * H;
    const r0 = rA(1e-9, z), r1 = rA((1 - 1e-9) * TAU, z);
    const rx = Math.hypot(xyz[3 * i], xyz[3 * i + 1]); // actual radial distance of the vertex from axis
    const dLip = Math.min(Math.abs(rx - r0), Math.abs(rx - r1));
    // classify: within 1e-3 of a lip radius ⇒ it's a LIP; else it's an interior wall rung.
    if (dLip < 1e-3) { nLip++; if (dLip > lipSerr) lipSerr = dLip; }
    else { nWall++; const dWall = Math.min(Math.abs(rx - r0), Math.abs(rx - r1)); if (dWall > wallMax) wallMax = dWall; }
  }
  return { lipSerr, wallMax, nLip, nWall };
}

function score(label: string, density: string | number, m: { xyz: Float64Array; ut: number[]; idx: Uint32Array }, rA: ReturnType<typeof buildRadiusFn>, truth: ReturnType<typeof buildFeatureTruth>, ms: number): Record<string, unknown> {
  const ut = m.ut, idx = m.idx;
  const rawNonMan = auditNonManRaw(idx, ut.length / 2);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, H).vertices, indices: idx });
  const radial = perFaceChordSag(ut, Array.from(idx), rA, H);
  // FULL-mesh brute-anchored true-3D (includes seam wall — will be inflated by the blind-spot).
  const anchoredFull = bruteAnchoredRedPerp(ut, Array.from(idx), rA, H, { radial, redMm: 0.1, sampleN: 60 });
  // BODY-only: mask out facets that touch the θ=0 seam band, then brute-anchor the remaining red set.
  const seamBand = (i: number): boolean => { const u = ((ut[2 * i] % 1) + 1) % 1; return u < 0.02 || u > 0.98; };
  const bodyRadial = { ...radial, faceErr: Float64Array.from(radial.faceErr) };
  for (let f = 0; f < idx.length / 3; f++) { const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; if (seamBand(a) || seamBand(b) || seamBand(c)) bodyRadial.faceErr[f] = 0; }
  const anchoredBody = bruteAnchoredRedPerp(ut, Array.from(idx), rA, H, { radial: bodyRadial, redMm: 0.1, sampleN: 60 });
  // interior feature-line true-3D (body fidelity) — exclude seam/rim band
  const meshUt = buildMeshUt(ut, Array.from(idx), rA, H);
  const loc = buildLocator(meshUt, 256);
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.02 && p.u < 0.98 && p.t > 0.02 && p.t < 0.98)) };
  const fl3 = interior.lines.length ? featureLineChord3D(interior, loc, meshUt, rA, H, 0.05, 0, 4) : { p99Mm: 0, maxMm: 0 };
  const lip = seamLipSerration(ut, m.xyz, rA);
  const row = {
    label, density, tris: idx.length / 3, rawNonMan,
    bodyTrue3dP99: +anchoredBody.trustedP99.toFixed(4), bodyNRed: anchoredBody.nRed,
    fullTrue3dP99: +anchoredFull.trustedP99.toFixed(4), fullNRed: anchoredFull.nRed,
    flChordP99: +fl3.p99Mm.toFixed(4),
    lipSerration: +lip.lipSerr.toFixed(5), seamWallMax: +lip.wallMax.toFixed(3), nLip: lip.nLip, nWall: lip.nWall,
    pctB20: +q.pctBelow20.toFixed(2), p5MinA: +q.p5MinAngleDeg.toFixed(1), ms: Math.round(ms),
  };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${label}/${density} tris=${row.tris} rawNonMan=${row.rawNonMan} bodyP99=${row.bodyTrue3dP99}(red ${row.bodyNRed}) fullP99=${row.fullTrue3dP99}(red ${row.fullNRed}) flP99=${row.flChordP99} lipSerr=${row.lipSerration} wallMax=${row.seamWallMax} nLip=${row.nLip} nWall=${row.nWall} %<20=${row.pctB20} ${row.ms}ms`);
  return row;
}

describe('E-SFB-SEAM2 — doubled seam-edge + rung ladder, honest decomposition', () => {
  for (const hRow of [0.30, 0.15]) {
    it.skipIf(!RUN)(`ladder @hRow=${hRow}`, () => {
      mkdirSync(DIR, { recursive: true });
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
      const t0 = Date.now();
      const births = findBirths(rA, H, 4096);
      const ts = msquareRows(rA, H, hRow, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: hRow * 6 });
      const graph = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
      const rows = rasterizeColumnsSquare(graph, rA, H, 0.03, 2, 0.03, 0.6);
      const mesh = buildSeamLadderWatertight(rA, H, rows);
      const ms = Date.now() - t0;
      const row = score('ladder', hRow, mesh, rA, truth, ms);
      expect(row.rawNonMan).toBe(0);
    }, 45 * 60 * 1000);
  }
});
