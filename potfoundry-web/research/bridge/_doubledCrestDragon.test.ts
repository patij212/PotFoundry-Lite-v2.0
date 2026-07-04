// _doubledCrestDragon.test.ts — DEV-ONLY (env PF_DCREST_DS=1). PHASE-2: apply the STRUCTURED doubled-crest
// feature-conforming primitive (research/bridge/_doubledCrestLib.ts, REUSED VERBATIM) to DragonScales.
//
// GOAL (pre-registered kill-criterion). DragonScales REACHES iff, at >=2 densities, a doubled-crest config gives
//   true-3D brute-anchored trustedP99 <= 0.012mm  AND  serration <= 0.001mm  AND  rawNonMan 0  AND  %<20 < 10%.
// If it floors, CLASSIFY (structured-only / accept) with evidence.
//
// PRIOR ART it must beat: plain doubled-rings (_gap_treadsq) → true-3D p99 DENSITY-INVARIANT floor ~0.013,
// serration ~0.0099 (the linear-blend tread lip), %<20 0.4-1.8% (tread-lip slivers). The doubled-crest primitive's
// promise is BY-CONSTRUCTION feature edges (serration→0) — this probe tests whether that promise HOLDS on
// DragonScales, whose feature TOPOLOGY (theta-crest count) is UNSTABLE (13→18 per band, staggered scales split by
// 7 horizontal C0 risers at t=m/8). The lib's constant-column-count invariant is the thing under test.
//
// RULERS (honest, per LAB-CHEATSHEET + _tangled2 / _prodMeasureScore wiring):
//   TRUE-3D  = bruteAnchoredRedPerp(...).trustedP99  (brute-anchor corrects GN steep-overstatement)
//   QUALITY  = triangleQualityDistribution.pctBelow20  (on the radial-lifted mesh)
//   WATERTIGHT = auditNonManRaw (raw index, NOT weld)
//   SERRATION  = feature-crest-sample → nearest MESH-EDGE distance (measureSerration from _doubledCrestLib)
//
// ISOLATION: NEW files only. Reuses labkit rulers + _doubledCrestLib READ-ONLY. Edits NOTHING in src/. Each density
// is its OWN env-gated sub-check that CHECKPOINTS its row to scorecard.ndjson the INSTANT computed (resumable).
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, bruteAnchoredRedPerp, perFaceChordSag,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildDoubledCrestMesh, measureSerration } from './_doubledCrestLib';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = 'DragonScales' as StyleId;
const DIR = join('research', 'exchange', '_dcrest_dragon');
const NDJSON = join(DIR, 'scorecard.ndjson');

const keyExists = (k: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`);
};

// RAW-index non-manifold (shared-vertex-by-index; the honest watertight gate for a structured mesh built with
// explicit shared row vertices — NOT the 3D weld). >2 incidences on an undirected edge = non-manifold.
function auditNonManRaw(idx: ArrayLike<number>): number {
  const ec = new Map<number, number>();
  const nV = 1 << 26; // key packing headroom (structured meshes here are < ~7M verts)
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? p * nV + q : q * nV + p; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

// Full measure of one doubled-crest build → checkpoint row. TRUE-3D via bruteAnchoredRedPerp on the (u,t) mesh.
function scoreBuild(key: string, label: string, opts: Parameters<typeof buildDoubledCrestMesh>[2]): void {
  if (keyExists(key)) { /* eslint-disable-next-line no-console */ console.log(`${key} exists — skip`); return; }
  const rA = buildRadiusFn(STYLE, {}, DIMS);
  const t0 = Date.now();
  const b = buildDoubledCrestMesh(rA, H, opts);
  const buildMs = Date.now() - t0;
  const ut = Array.from(b.mesh.ut);
  const idx = b.mesh.idx;

  // QUALITY (radial-lifted mesh — the mesh's own 3D positions ARE already radial-lifted; use xyz directly).
  const q = triangleQualityDistribution({ vertices: b.mesh.xyz, indices: idx });
  // WATERTIGHT (raw index).
  const rawNM = auditNonManRaw(idx);
  // SERRATION (feature-crest sample → nearest mesh edge; the by-construction gate).
  const ser = measureSerration(b.featureSlots, b.ts, b.mesh.xyz, idx, rA, H, 2);
  // TRUE-3D (brute-anchored red perp). Red set from radial per-face sag; sheet cusps + riser lips are the red set.
  const radial = perFaceChordSag(ut, idx, rA, H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, H, { radial, sampleN: 40 });

  const true3d = +anchored.trustedP99.toFixed(4);
  const serMm = +ser.p99Mm.toFixed(5);
  const pctB20 = +q.pctBelow20.toFixed(2);
  const reaches = true3d <= 0.012 && serMm <= 0.001 && rawNM === 0 && pctB20 < 10;
  checkpoint({
    key, label, tris: idx.length / 3, nCol: b.nCol, rows: b.ts.length,
    nCrest: b.nCrest, nValley: b.nValley, countStableCrest: b.countStableCrest, countStableValley: b.countStableValley,
    true3dTrustedP99Mm: true3d, gnP99: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver, nRed: anchored.nRed, nSampleAnchored: anchored.nSample,
    serrationP99Mm: serMm, serrationMaxMm: +ser.maxMm.toFixed(5), serrationMeanMm: +ser.meanMm.toFixed(5), serrNSample: ser.nSample,
    pctBelow20: pctB20, pctBelow10: +q.pctBelow10.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, buildMs, opts: opts as Record<string, unknown>,
    reaches,
  });
}

describe('E-2026-07-04-DCREST-DRAGONSCALES', () => {
  // SCREEN density (moderate budget ~0.8-1.2M target via hRowMm/wTargetMm).
  it.skipIf(process.env.PF_DCREST_DS !== '1')('DragonScales doubled-crest: SCREEN density', () => {
    scoreBuild('ds_dc_screen', 'screen hRow0.22 w0.22 lip0.05 nFlank1', {
      hRowMm: 0.22, wTargetMm: 0.22, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: true, reliefFloorMm: 0.02,
    });
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // HD density (finer, confirms density-response of the true-3D floor).
  it.skipIf(process.env.PF_DCREST_DS !== '1')('DragonScales doubled-crest: HD density', () => {
    scoreBuild('ds_dc_hd', 'hd hRow0.13 w0.13 lip0.04 nFlank1', {
      hRowMm: 0.13, wTargetMm: 0.13, lipMm: 0.04, nFlank: 1, wrapU: true, includeValleys: true, reliefFloorMm: 0.02,
    });
    expect(true).toBe(true);
  }, 40 * 60 * 1000);

  // VALLEYS-OFF variant (crests only) — is the sliver/serration tail from the valley slots (which the unstable
  // count blows up), or intrinsic? Cheaper and isolates the feature-embedding contribution.
  it.skipIf(process.env.PF_DCREST_DS !== '1')('DragonScales doubled-crest: crests-only SCREEN', () => {
    scoreBuild('ds_dc_crestOnly', 'crestOnly hRow0.22 w0.22 lip0.05', {
      hRowMm: 0.22, wTargetMm: 0.22, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: false, reliefFloorMm: 0.02,
    });
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
