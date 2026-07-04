// _doubledCrestSfb.test.ts — DEV-ONLY (env PF_DCREST_SFB=1). PHASE-2 of E-2026-07-04-DCREST: apply the STRUCTURED
// doubled-crest feature-conforming primitive (research/bridge/_doubledCrestLib.ts, built + proven in Phase 1 on
// LowPolyFacet: trueP99 0.0072, serration 0, watertight) to SuperformulaBlossom.
//
// WHY SFB: it is a RISER-class petal style (featConform RISERS_4). Body is already CAD-grade (0.0033). The prior
// CDT-reroute spike (_ct_sfbwater*) fixed WATERTIGHT but left the θ-seam radius-discontinuity as a LOSSY
// constraint recovery: seam serration ~9.5mm, recovery 73/200. The doubled-crest primitive is exactly the fix —
// it embeds the petal crest/valley feature curves (and hence the seam cliff) as EXPLICIT mesh-edge chains BY
// CONSTRUCTION (zero-recovery-loss), so serration → 0.
//
// CAVEAT SFB is quasi-periodic: petal count m varies with height (mBase 6 → mTop 10, mCurveExp 1.2). So the crest
// count is NOT constant across rows (Gothic-class instability). The tracker anchors to the MAX-count row and pins
// collapsed slots. The decisive gate is SERRATION (must be a mesh-edge chain) + true-3D + watertight + quality.
//
// HONEST RULERS (labkit; wiring cloned verbatim from _doubledCrest.test.ts / _tangled2 / _prodMeasureScore):
//   TRUE-3D    = bruteAnchoredRedPerp(...).trustedP99  (brute-anchor corrects GN steep-overstatement)
//   QUALITY    = triangleQualityDistribution.pctBelow20
//   WATERTIGHT = auditNonManRaw (RAW-index, NOT weld)
//   SERRATION  = measureSerration (feature-crest-curve -> nearest MESH-EDGE distance; the NEW critical gate)
//
// KILL-CRITERION: REACHES iff trustedP99<=0.012 AND serration<=0.001 AND rawNonMan 0 AND %<20<10.
//
// RESILIENCE: env-gated; each variant is its OWN `it`; CHECKPOINTS the ndjson row + heatmap bins the INSTANT
// computed so a killed run resumes by re-running only the unfinished variant. Reuses lib + labkit READ-ONLY.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, liftUtToRadial, triangleQualityDistribution,
  perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildDoubledCrestMesh, measureSerration, rowExtremaU, trackCrestSlots, msquareRowsDC, type DoubledCrestOpts } from './_doubledCrestLib';

const TAU_2PI = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_dcrest_sfb');
const LEDGER = join(DIR, 'scorecard.ndjson');

/** Raw-index non-manifold (NOT weld) — cloned from _doubledCrest.test.ts (sharded numeric-key maps for large meshes). */
function auditNonManRaw(indices: ArrayLike<number>, nV: number): number {
  const EK = nV + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const NSHARD = 64;
  const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (p: number, r: number): void => { const kk = key(p, r); const m = ecs[(p < r ? p : r) & (NSHARD - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    bump(a, b); bump(b, c); bump(c, a);
  }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}

interface Row {
  style: string; label: string; tris: number;
  trustedP99: number; gnP99: number; gnOver: number; nRed: number;
  serrP99: number; serrMax: number; serrN: number;
  minA: number; pctB20: number; pctB10: number;
  rawNonMan: number;
  nCrest: number; nValley: number; nCol: number; stable: boolean;
  reaches: boolean; ms: number;
}

function scoreAndCheckpoint(style: StyleId, label: string, opts: DoubledCrestOpts, dumpVisual: boolean): Row {
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const build = buildDoubledCrestMesh(rA, DIMS.H, opts);
  const { mesh } = build;
  const ut = mesh.ut; const idx = mesh.idx;
  const ms = Date.now() - t0;

  // TRUE-3D: brute-anchored trusted p99 on the worst-red facets.
  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
  // QUALITY on the lifted mesh.
  const lift = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const q = triangleQualityDistribution({ vertices: lift, indices: idx });
  // WATERTIGHT raw-index.
  const rawNonMan = auditNonManRaw(idx, mesh.nV);
  // SERRATION: crest curve -> nearest mesh edge (the decisive seam gate).
  const serr = measureSerration(build.featureSlots, build.ts, mesh.xyz, idx, rA, DIMS.H, 1);

  const reaches = anchored.trustedP99 <= 0.012 && serr.p99Mm <= 0.001 && rawNonMan === 0 && q.pctBelow20 < 10;
  const row: Row = {
    style, label, tris: idx.length / 3,
    trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(4), gnOver: anchored.gnOver, nRed: anchored.nRed,
    serrP99: +serr.p99Mm.toFixed(5), serrMax: +serr.maxMm.toFixed(5), serrN: serr.nSample,
    minA: +q.minAngleDeg.toFixed(2), pctB20: +q.pctBelow20.toFixed(2), pctB10: +q.pctBelow10.toFixed(2),
    rawNonMan,
    nCrest: build.nCrest, nValley: build.nValley, nCol: build.nCol, stable: build.countStableCrest && build.countStableValley,
    reaches, ms: Math.round(ms),
  };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${style}/${label} tris=${row.tris} trustedP99=${row.trustedP99}(gn ${row.gnP99},red ${row.nRed}) serrP99=${row.serrP99} serrMax=${row.serrMax}(n${row.serrN}) minA=${row.minA} %<20=${row.pctB20} rawNM=${row.rawNonMan} nCrest=${row.nCrest} nVal=${row.nValley} nCol=${row.nCol} stable=${row.stable} REACHES=${row.reaches} ${row.ms}ms`);
  if (dumpVisual) {
    dumpHeatmap(DIR, `dcrest_${style}_${label}`, mesh.xyz, ut, idx, rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
  }
  return row;
}

describe('E-2026-07-04-DCREST-SFB — doubled-crest on SuperformulaBlossom (seam-serration fix)', () => {
  // ── RECON (cheap, no mesh): SFB per-row crest/valley count series + tracker stability + seam location. Decides
  //    whether SFB is count-stable (eligible) or Gothic-class unstable, and locates the θ=0 seam feature. ──
  it.skipIf(process.env.PF_DCREST_SFB !== '1')('recon: SFB per-row feature-count stability + seam', () => {
    const STYLE = 'SuperformulaBlossom' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ts = msquareRowsDC(rA, DIMS.H, 0.4, [], 0.5);
    const cCounts: number[] = [], vCounts: number[] = [];
    for (const t of ts) {
      const z = t * DIMS.H; let sum = 0; const NM = 256; for (let i = 0; i < NM; i++) sum += rA(TAU_2PI * (i / NM), z); const mean = sum / NM;
      const cr = rowExtremaU(rA, z, +1, 2048).filter((u) => Math.abs(rA(TAU_2PI * u, z) - mean) >= 0.02);
      const va = rowExtremaU(rA, z, -1, 2048).filter((u) => Math.abs(rA(TAU_2PI * u, z) - mean) >= 0.02);
      cCounts.push(cr.length); vCounts.push(va.length);
    }
    const tr = trackCrestSlots(rA, DIMS.H, ts, { scanN: 2048, reliefFloorMm: 0.02 });
    // seam behaviour: radius + derivative discontinuity across θ=0 (compare r just below/above the seam vs interior slope)
    const seamInfo: string[] = [];
    for (const t of [0.1, 0.5, 0.9]) {
      const z = t * DIMS.H;
      const rSeamLo = rA(TAU_2PI * 0.9999, z), rSeamHi = rA(TAU_2PI * 0.0001, z);
      const rMid = rA(TAU_2PI * 0.5, z);
      seamInfo.push(`t=${t}: rSeam[${rSeamLo.toFixed(3)},${rSeamHi.toFixed(3)}] jump=${Math.abs(rSeamHi - rSeamLo).toFixed(4)} rMid=${rMid.toFixed(3)}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[recon SFB] rows=${ts.length} crestCount[min..max]=${Math.min(...cCounts)}..${Math.max(...cCounts)} valleyCount=${Math.min(...vCounts)}..${Math.max(...vCounts)} | tracker nCrest=${tr.nCrest} nVal=${tr.nValley} stableC=${tr.countStableCrest} stableV=${tr.countStableValley}`);
    // eslint-disable-next-line no-console
    console.log(`   crest counts: ${cCounts.join(',')}`);
    // eslint-disable-next-line no-console
    console.log(`   seam: ${seamInfo.join(' | ')}`);
    expect(cCounts.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // ── V1..V3: doubled-crest sweep on SFB. petals = crests (r max) + valleys (r min), 2π-periodic (wrapU). The
  //    seam θ=0 sits on a smooth slope (seamOffset=π/m) so it is NOT a separate cliff — the DISCONTINUITY the CDT
  //    spike struggled with is the quasi-periodic petal count / valley cusp, embedded here as mesh-edge chains.
  //    Sweep row height (chord in the vertical direction) + lip/flank (near-vertical petal-flank resolution). ──
  it.skipIf(process.env.PF_DCREST_SFB !== '1')('SFB V1: h012_lip05_f2', () => {
    mkdirSync(DIR, { recursive: true });
    scoreAndCheckpoint('SuperformulaBlossom' as StyleId, 'h012_lip05_f2',
      { hRowMm: 0.12, wTargetMm: 0.14, lipMm: 0.05, nFlank: 2, wrapU: true, includeValleys: true }, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_DCREST_SFB !== '1')('SFB V2: h008_lip05_f2 (finer rows)', () => {
    mkdirSync(DIR, { recursive: true });
    scoreAndCheckpoint('SuperformulaBlossom' as StyleId, 'h008_lip05_f2',
      { hRowMm: 0.08, wTargetMm: 0.12, lipMm: 0.05, nFlank: 2, wrapU: true, includeValleys: true }, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_DCREST_SFB !== '1')('SFB V3: h006_lip04_f2 (finest rows, tight lip)', () => {
    mkdirSync(DIR, { recursive: true });
    scoreAndCheckpoint('SuperformulaBlossom' as StyleId, 'h006_lip04_f2',
      { hRowMm: 0.06, wTargetMm: 0.10, lipMm: 0.04, nFlank: 2, wrapU: true, includeValleys: true }, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── V4 (DENSITY-INVARIANCE discriminator, COARSE): if the true-3D floor is STRUCTURAL (pinned collapsed columns
  //    from count 6->10 + seam wrap), it does NOT drop with density. A coarse mesh (h024) should show the SAME
  //    ~28mm floor as V1 (h012) at a fraction of the tris — confirming the floor is count-instability, not chord. ──
  it.skipIf(process.env.PF_DCREST_SFB !== '1')('SFB V4: h024_lip05_f1 (coarse density-invariance check)', () => {
    mkdirSync(DIR, { recursive: true });
    scoreAndCheckpoint('SuperformulaBlossom' as StyleId, 'h024_lip05_f1',
      { hRowMm: 0.24, wTargetMm: 0.28, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: true }, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
