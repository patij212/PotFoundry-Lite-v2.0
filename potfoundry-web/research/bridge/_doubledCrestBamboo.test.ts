// _doubledCrestBamboo.test.ts — DEV-ONLY (env PF_DCRESTBS=1). PHASE-2: apply the PROVEN structured doubled-crest
// primitive (research/bridge/_doubledCrestLib.ts, reused VERBATIM — buildDoubledCrestMesh + measureSerration) to
// BambooSegments. Bamboo relief = HORIZONTAL node-ring cliffs (near-vertical flanks in t, |dr/dz|≈26) + fine
// striations/asym in u; brief calls this "the closest to the proven doubled-RINGS special case".
//
// HONEST RULERS (labkit; wiring cloned VERBATIM from _doubledCrest.test.ts / _tangled2 / _prodMeasureScore):
//   TRUE-3D    = bruteAnchoredRedPerp(...).trustedP99  (brute-anchor corrects GN steep-overstatement)
//   QUALITY    = triangleQualityDistribution.pctBelow20
//   WATERTIGHT = auditNonManRaw (RAW-index, NOT weld)
//   SERRATION  = measureSerration (feature-crest-curve -> nearest MESH-EDGE distance; the NEW critical gate)
//
// KILL-CRITERION: REACHES iff trustedP99<=0.012 AND serration<=0.001 AND rawNonMan 0 AND %<20<10.
// Measured at >=2 densities. Each density is its OWN scoreAndCheckpoint (ndjson appended INSTANTLY -> resumable).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, liftUtToRadial, triangleQualityDistribution,
  perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildDoubledCrestMesh, measureSerration, type DoubledCrestOpts } from './_doubledCrestLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_dcrest_bamboo');
const LEDGER = join(DIR, 'scorecard.ndjson');

/** Raw-index non-manifold (NOT weld) — the watertight gate the brief mandates. Cloned VERBATIM from
 * _doubledCrest.test.ts / _prodMeasureScore. SHARDED to survive >2^24 edges on dense meshes. */
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
  nCrest: number; nValley: number; nCol: number; nRow: number; stable: boolean;
  reaches: boolean; ms: number;
}

function scoreAndCheckpoint(style: StyleId, label: string, opts: DoubledCrestOpts, dumpVisual: boolean): Row {
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const build = buildDoubledCrestMesh(rA, DIMS.H, opts); // VERBATIM primitive
  const { mesh } = build;
  const ut = mesh.ut; const idx = mesh.idx;
  const ms = Date.now() - t0;

  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
  const lift = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const q = triangleQualityDistribution({ vertices: lift, indices: idx });
  const rawNonMan = auditNonManRaw(idx, mesh.nV);
  const serr = measureSerration(build.featureSlots, build.ts, mesh.xyz, idx, rA, DIMS.H, 1); // VERBATIM ruler

  const reaches = anchored.trustedP99 <= 0.012 && serr.p99Mm <= 0.001 && rawNonMan === 0 && q.pctBelow20 < 10;
  const row: Row = {
    style, label, tris: idx.length / 3,
    trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(4), gnOver: anchored.gnOver, nRed: anchored.nRed,
    serrP99: +serr.p99Mm.toFixed(5), serrMax: +serr.maxMm.toFixed(5), serrN: serr.nSample,
    minA: +q.minAngleDeg.toFixed(2), pctB20: +q.pctBelow20.toFixed(2), pctB10: +q.pctBelow10.toFixed(2),
    rawNonMan,
    nCrest: build.nCrest, nValley: build.nValley, nCol: build.nCol, nRow: build.ts.length,
    stable: build.countStableCrest && build.countStableValley,
    reaches, ms: Math.round(ms),
  };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${style}/${label} tris=${row.tris} trustedP99=${row.trustedP99}(gn ${row.gnP99},red ${row.nRed},over ${row.gnOver}) serrP99=${row.serrP99} serrMax=${row.serrMax}(n${row.serrN}) minA=${row.minA} %<20=${row.pctB20} %<10=${row.pctB10} rawNM=${row.rawNonMan} nCrest=${row.nCrest} nVal=${row.nValley} nCol=${row.nCol} nRow=${row.nRow} stable=${row.stable} REACHES=${row.reaches} ${row.ms}ms`);
  if (dumpVisual) {
    dumpHeatmap(DIR, `dcrest_${style}_${label}`, mesh.xyz, ut, idx, rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
    const order = Array.from({ length: radial.faceErr.length }, (_, f) => f).sort((a, b) => radial.faceErr[b] - radial.faceErr[a]);
    const info: string[] = [];
    for (const f of order.slice(0, 8)) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, ctv = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const uw = Math.max(ut[2 * a], ut[2 * b], ut[2 * c]) - Math.min(ut[2 * a], ut[2 * b], ut[2 * c]);
      const tw = Math.max(ut[2 * a + 1], ut[2 * b + 1], ut[2 * c + 1]) - Math.min(ut[2 * a + 1], ut[2 * b + 1], ut[2 * c + 1]);
      info.push(`err=${radial.faceErr[f].toFixed(3)}@u${cu.toFixed(3)},t${ctv.toFixed(3)} uw=${uw.toFixed(4)} tw=${tw.toFixed(4)}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  [localize ${label}] worst radial facets: ${info.join(' | ')}`);
  }
  return row;
}

describe('E-2026-07-04-DCREST-BAMBOO — structured doubled-crest primitive on BambooSegments', () => {
  // ── SCREEN (moderate budget): node-ring horizontal cliffs (|dr/dz|~26) resolved by msquareRowsDC balanced-speed
  //    rows; u-crests = striation/asym ridges get doubled lips. 3 densities (screen -> HD confirm).
  it.skipIf(process.env.PF_DCRESTBS !== '1')('BambooSegments: doubled-crest density sweep', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'BambooSegments' as StyleId;
    // Bamboo node ring is a steep flank in t (not a hard C0 step) => the chord in the ROW/vertical direction is the
    // dominant residual; FINE rows (small hRowMm) drive it down. Lip resolves the u striation/asym ridges.
    const variants: Array<[string, DoubledCrestOpts]> = [
      ['h012_w014_lip05_f1', { hRowMm: 0.12, wTargetMm: 0.14, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: true }],
      ['h006_w010_lip05_f1', { hRowMm: 0.06, wTargetMm: 0.10, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: true }],
    ];
    for (const [label, opts] of variants) scoreAndCheckpoint(STYLE, label, opts, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── BOUNDARY DIAGNOSTIC: the true3d heatmap shows the ONLY red is two thin lines at the OPEN top/bottom rim
  //    (t->0,1), where a facet centroid sits off the (uncapped) true surface => spuriously large facet->surface
  //    distance. This unit re-runs the brute-anchored trusted-p99 on the SAME worst-red set but EXCLUDES facets whose
  //    centroid t is in the open-boundary band, isolating the INTERIOR true-3D (the honest fidelity number for a
  //    wall that will be capped in production).
  it.skipIf(process.env.PF_DCRESTBS_BND !== '1')('BambooSegments: interior-only true-3D (exclude open rim)', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'BambooSegments' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const opts: DoubledCrestOpts = { hRowMm: 0.06, wTargetMm: 0.10, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: true };
    const build = buildDoubledCrestMesh(rA, DIMS.H, opts);
    const { mesh } = build; const ut = mesh.ut, idx = mesh.idx;
    const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
    // build a filtered index set excluding open-boundary facets (centroid t in [BAND, 1-BAND]).
    const BAND = 0.02;
    const keep: number[] = [];
    for (let f = 0; f < idx.length / 3; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ct = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      if (ct >= BAND && ct <= 1 - BAND) { keep.push(a, b, c); }
    }
    const keepIdx = Uint32Array.from(keep);
    const radialK = perFaceChordSag(ut, keepIdx, rA, DIMS.H);
    const anchoredAll = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
    const anchoredInt = bruteAnchoredRedPerp(ut, keepIdx, rA, DIMS.H, { radial: radialK, sampleN: 40 });
    const serr = measureSerration(build.featureSlots, build.ts, mesh.xyz, idx, rA, DIMS.H, 1);
    const row = {
      style: STYLE, label: 'interior_h006', tris: idx.length / 3, trisInterior: keepIdx.length / 3,
      trustedP99_all: +anchoredAll.trustedP99.toFixed(4), nRed_all: anchoredAll.nRed,
      trustedP99_interior: +anchoredInt.trustedP99.toFixed(4), trustedMax_interior: +anchoredInt.trustedMax.toFixed(4), nRed_interior: anchoredInt.nRed,
      serrP99: +serr.p99Mm.toFixed(5),
      note: 'interior excludes open-rim band |t-{0,1}|<0.02 (production wall is capped); serration/wt from full mesh',
    };
    appendFileSync(LEDGER, JSON.stringify(row) + '\n');
    // eslint-disable-next-line no-console
    console.log(`BND-DIAG: all trustedP99=${row.trustedP99_all}(nRed ${row.nRed_all}) | INTERIOR trustedP99=${row.trustedP99_interior} trustedMax=${row.trustedMax_interior}(nRed ${row.nRed_interior}) serrP99=${row.serrP99}`);
    expect(anchoredInt.nRed).toBeGreaterThanOrEqual(0);
  }, 60 * 60 * 1000);

  // ── HD CONFIRM (only run if screen flags close-to-reaching): finest rows.
  it.skipIf(process.env.PF_DCRESTBS_HD !== '1')('BambooSegments: HD confirm', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'BambooSegments' as StyleId;
    scoreAndCheckpoint(STYLE, 'h003_w007_lip05_f2', { hRowMm: 0.03, wTargetMm: 0.07, lipMm: 0.05, nFlank: 2, wrapU: true, includeValleys: true }, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
