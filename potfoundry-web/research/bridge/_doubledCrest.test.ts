// _doubledCrest.test.ts — DEV-ONLY (env PF_DCREST=1). PHASE-1 proof of the STRUCTURED DOUBLED-CREST primitive on
// two CONTRASTING targets: LowPolyFacet (flat faces, straight-ish dihedral crests) + GothicArches (curved rib
// lattice, the prior spike floored at 0.11). Each target is its OWN env-gated `it` + CHECKPOINTS the scorecard
// row (ndjson) + heatmap bins the INSTANT computed (resumable).
//
// HONEST RULERS (labkit, wiring cloned from _tangled2 + _prodMeasureScore):
//   TRUE-3D    = bruteAnchoredRedPerp(...).trustedP99  (brute-anchor corrects GN steep-overstatement)
//   QUALITY    = triangleQualityDistribution.pctBelow20
//   WATERTIGHT = auditNonManRaw (RAW-index, NOT weld)
//   SERRATION  = measureSerration (feature-crest-curve -> nearest MESH-EDGE distance; the NEW critical gate)
//
// KILL-CRITERION per style: REACHES iff trustedP99<=0.012 AND serration<=0.001 AND rawNonMan 0 AND %<20<10.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, liftUtToRadial, triangleQualityDistribution,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildDoubledCrestMesh, measureSerration, rowExtremaU, trackCrestSlots, msquareRowsDC, type DoubledCrestOpts } from './_doubledCrestLib';

const TAU_2PI = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_dcrest');
const LEDGER = join(DIR, 'scorecard.ndjson');

/** Raw-index non-manifold (NOT weld) — the watertight gate the brief mandates. SHARDED numeric-key maps: a single
 * JS Map caps ~2^24 entries (a 3.7M-tri mesh => ~11M edges exceeds it → "Map maximum size exceeded"). Shard by the
 * low bits of the min endpoint (mirrors labkit.auditNonManByIndex). Count is identical to the single-Map version. */
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
  // SERRATION: crest curve -> nearest mesh edge.
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
    // LOCALIZE the worst radial facets: classify each as near-crest (u within lipTol of a crest slot) vs body,
    // report min-dist-to-crest + facet width, so we know whether the residual is a crest-flank straddle or body chord.
    const order = Array.from({ length: radial.faceErr.length }, (_, f) => f).sort((a, b) => radial.faceErr[b] - radial.faceErr[a]).slice(0, 20);
    const crestUs = build.featureSlots.filter((s) => s.sharp && s.sign > 0);
    const info: string[] = [];
    for (const f of order.slice(0, 8)) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, ctv = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const rr = Math.floor(ctv * (build.ts.length - 1));
      let dCrest = 1; for (const s of crestUs) { let d = Math.abs(cu - s.u[rr]); if (d > 0.5) d = 1 - d; if (d < dCrest) dCrest = d; }
      // facet u-width
      const uw = Math.max(ut[2 * a], ut[2 * b], ut[2 * c]) - Math.min(ut[2 * a], ut[2 * b], ut[2 * c]);
      info.push(`err=${radial.faceErr[f].toFixed(3)}@u${cu.toFixed(3)},t${ctv.toFixed(2)} dCrest=${dCrest.toFixed(4)} uw=${uw.toFixed(4)}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  [localize ${label}] worst radial facets: ${info.join(' | ')}`);
  }
  return row;
}

describe('E-2026-07-04-DCREST — structured doubled-crest feature-conforming primitive', () => {
  // ── LowPolyFacet: flat faces (radial-flat), 12 designed polygon dihedral corners — proves edge-embedding + rung.
  it.skipIf(process.env.PF_DCREST !== '1')('LowPolyFacet: doubled-crest sweep', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'LowPolyFacet' as StyleId;
    // sweep lip width + flank count + density; LowPoly bevel rounds the corner slightly so lip must resolve it.
    const variants: Array<[string, DoubledCrestOpts]> = [
      // secant face curves + a sharp corner CREST (r max) & face-center VALLEY (r min). w08_lip10_f3 hit 0.0128 —
      // AT the line. Residual = near-crest steep-flank chord (gnOver 40/40). Narrow lip → flank subs concentrate at
      // the C1 kink (tighter near-vertical chord) while a moderate body wTarget chords the gentle secant. Sweep.
      // w08_lip04_f5 hit trueP99 0.0072 + serr 0 + wt 0, ONLY %<20=10.0 (need <10) — thin flank slivers as lip
      // tightens. Widen flank cells (fewer flanks OR wider lip) + coarser rows so near-crest cells stay square.
      // TENSION found: fine rows → chord good but thin near-crest flank slivers; coarse rows → quality good, chord
      // bad (steep flank chord lives in the ROW/vertical direction). FIX: WIDE lip + FEW flanks (wide flank cells,
      // fewer slivers) + FINE rows (chord). Aim %<20<10 while holding trueP99<=0.012.
      // BREAKTHROUGH: wide lip + f2 → %<20 4.7 / %<10 0.1 (slivers GONE), but trueP99 0.026 (steep flank under-
      // resolved). Steep-flank chord lives in the VERTICAL/row direction ⇒ FINE ROWS + wide lip f2 gives BOTH.
      ['h10_lip10_f2', { hRowMm: 0.10, wTargetMm: 0.08, lipMm: 0.10, nFlank: 2, wrapU: true, includeValleys: true }],
      ['h07_lip10_f2', { hRowMm: 0.07, wTargetMm: 0.08, lipMm: 0.10, nFlank: 2, wrapU: true, includeValleys: true }],
      ['h05_lip10_f2', { hRowMm: 0.05, wTargetMm: 0.10, lipMm: 0.10, nFlank: 2, wrapU: true, includeValleys: true }],
    ];
    for (const [label, opts] of variants) scoreAndCheckpoint(STYLE, label, opts, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── RECON (cheap, no mesh): per-row crest/valley count distribution for both styles — is the count STABLE
  //    (tracker precondition) or does it change across tiers (Gothic upper lattice vs lower arches)? ──
  it.skipIf(process.env.PF_DCREST !== '1')('recon: per-row feature-count stability', () => {
    for (const STYLE of ['LowPolyFacet', 'GothicArches'] as StyleId[]) {
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
      // eslint-disable-next-line no-console
      console.log(`[recon ${STYLE}] rows=${ts.length} crestCount[min..max]=${Math.min(...cCounts)}..${Math.max(...cCounts)} valleyCount=${Math.min(...vCounts)}..${Math.max(...vCounts)} | tracker nCrest=${tr.nCrest} nVal=${tr.nValley} stableC=${tr.countStableCrest} stableV=${tr.countStableValley}`);
      // eslint-disable-next-line no-console
      console.log(`   crest counts: ${cCounts.join(',')}`);
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // ── GothicArches FAST DIAGNOSTIC (bounded, resumable): the decisive refutation evidence is SERRATION +
  //    count-instability — the CREST must be a mesh-edge chain. Gothic's 72c+84v UNSTABLE count (0..72) means the
  //    tracker collapses/pins un-matchable slots ⇒ the crest is NOT embedded ⇒ serration stays HIGH. This unit
  //    builds ONE coarse mesh (bounded rows), skips the slow whole-mesh brute anchoring, and reports serration +
  //    a cheap true-3D screen (perFaceTrue3DSag p99) + rawNonMan. Fast enough to survive the kill window.
  it.skipIf(process.env.PF_DCREST !== '1')('GothicArches: serration + floor (fast diagnostic)', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GothicArches' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const opts: DoubledCrestOpts = { hRowMm: 0.30, wTargetMm: 0.25, lipMm: 0.05, nFlank: 1, wrapU: true, includeValleys: true };
    const t0 = Date.now();
    const build = buildDoubledCrestMesh(rA, DIMS.H, opts);
    const { mesh } = build; const ut = mesh.ut, idx = mesh.idx;
    const buildMs = Date.now() - t0;
    // SERRATION — the critical gate. crest curve -> nearest mesh edge.
    const serr = measureSerration(build.featureSlots, build.ts, mesh.xyz, idx, rA, DIMS.H, 1);
    // cheap true-3D screen (GN body; steep overstatement acceptable for a screen, we only need order-of-magnitude).
    const true3d = perFaceTrue3DSag(ut, idx, rA, DIMS.H);
    const t3sorted = Float64Array.from(true3d.faceErr).sort();
    const true3dP99 = t3sorted.length ? t3sorted[Math.floor(0.99 * t3sorted.length)] : 0;
    const rawNonMan = auditNonManRaw(idx, mesh.nV);
    const lift = liftUtToRadial(ut, rA, DIMS.H).vertices;
    const q = triangleQualityDistribution({ vertices: lift, indices: idx });
    const row = {
      style: STYLE, label: 'g_fast_diag', tris: idx.length / 3,
      serrP99: +serr.p99Mm.toFixed(4), serrMax: +serr.maxMm.toFixed(4), serrMean: +serr.meanMm.toFixed(4), serrN: serr.nSample,
      screenTrue3dP99: +true3dP99.toFixed(4), screenTrue3dMax: +true3d.worstMm.toFixed(4),
      pctB20: +q.pctBelow20.toFixed(2), rawNonMan,
      nCrest: build.nCrest, nValley: build.nValley, nCol: build.nCol,
      stableC: build.countStableCrest, stableV: build.countStableValley,
      buildMs, note: 'GN-screen true3d (overstates steep); serration is the decisive gate',
    };
    appendFileSync(LEDGER, JSON.stringify(row) + '\n');
    // eslint-disable-next-line no-console
    console.log(`GOTHIC fast: tris=${row.tris} serrP99=${row.serrP99} serrMax=${row.serrMax} serrMean=${row.serrMean}(n${row.serrN}) screenT3P99=${row.screenTrue3dP99} %<20=${row.pctB20} rawNM=${row.rawNonMan} nCrest=${row.nCrest} nVal=${row.nValley} nCol=${row.nCol} stableC=${row.stableC} stableV=${row.stableV} build=${row.buildMs}ms`);
    expect(serr.nSample).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
