// _perp_guard.test.ts — DEV-ONLY (env PF_PERP_GUARD=1). E-2026-07-03-PERP-GUARD.
//
// HYPOTHESIS: a TRUE-3D-PERPENDICULAR-driven refinement guard (outer loop reusing buildInhouseMetricMesh's
// injectedPoints hook) drives GothicArches below the chordSteiner FLOOR. chordSteiner splits by CHORD sag
// (facet -> same-(u,t) plane), which is BLIND to the true-3D perpendicular under-shoot on the near-vertical
// rib crests. The E-CLOSE-THETA baseline floors GothicArches at brute-anchored trustedP99 ~= 0.057-0.067 even
// as fl-chord keeps dropping. This probe makes the REFINEMENT CRITERION the true-3D perpendicular itself:
//   1. mesh with the CONFIRMED tangled recipe (chordSteiner + guardManifoldAlways + optimizeSweeps:2)
//   2. per-facet PERPENDICULAR field. SELECTOR = the same-(u,t) radial perFaceChordSag faceErr, which is a
//      guaranteed UPPER BOUND on the true-3D perpendicular (never MISSES a red facet, cheap, no projection) —
//      the honest true-3D VERDICT stays bruteAnchoredRedPerp. For every facet whose radial perp > perpTolMm,
//      project the facet centroid to the true surface (projectPointToRadialSurface) and ADD the surface FOOT
//      (u,t) to injectedPoints (pinned).
//   3. re-mesh with the grown injectedPoints; repeat until brute-anchored trustedP99 <= perpTolMm OR budget hit
//
// KILL-CRITERION (pre-registered):
//  - CONFIRMED (chord-guard-blindness, general lever): brute-anchored trustedP99 <= 0.012mm at <=6M tris,
//    rawNonMan 0, %<20 <5%. leverMovesFloor=true.
//  - REFUTED (genuine steep-EXCLUDE cliff): guard CANNOT drive trustedP99 below 0.02 even when every high-perp
//    facet is refined => rib crest is a genuine near-vertical designed cliff. leverMovesFloor=false.
//  - PARTIAL: moves the floor (e.g. 0.06->0.02) but not to <=0.012.
// leverMovesFloor=true iff AFTER trustedP99 is >= 2x better than BEFORE.
//
// Each env-gated `it` CHECKPOINTS (ndjson row per iteration) the INSTANT computed, so a killed run resumes.
// ISOLATED: reuses labkit rulers + committed byte-identical-off kernel hooks READ-ONLY; edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth,
  buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, bruteAnchoredRedPerp,
  projectPointToRadialSurface, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_perp_guard');
const LEDGER = join(DIR, 'pg_rows.ndjson');

// Base tangled recipe (E-2026-07-03-TANGLED confirmed): metric-Delaunay under M=g/h^2 + deep sag chordSteiner.
const BASE = {
  tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
  splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true,
} as const;

interface Row {
  label: string; iter: number; tris: number; injected: number; addedThisIter: number;
  flChordP99: number; flMax: number;
  radialMax: number; radialRedCount: number; // radial selector (upper bound on true-3D; drives the guard)
  trustedP99: number; anchGnP99: number; gnOver: number; nRed: number; // brute-anchored VERDICT
  minA: number; median: number; pctB20: number;
  nonMan: number; ms: number;
}

/** injectedPoints flat [u,t,...] with coarse (u,t) de-dup so we never re-add the same foot. */
class InjectSet {
  pts: number[] = [];
  seen = new Set<string>();
  key(u: number, t: number): string { return `${Math.round(u * 8192)}:${Math.round(t * 8192)}`; }
  add(u: number, t: number): boolean {
    const k = this.key(u, t);
    if (this.seen.has(k)) return false;
    this.seen.add(k); this.pts.push(u, t); return true;
  }
}

interface Measured { row: Row; radialFaceErr: Float64Array; }

/**
 * Measure + checkpoint. The RADIAL faceErr (perFaceChordSag) is returned so the guard can select red facets
 * WITHOUT a second whole-mesh projection (radial >= true-3D perpendicular always, so it is a conservative
 * selector). The VERDICT number is the honest brute-anchored true-3D trustedP99.
 */
function measureAndCheckpoint(
  label: string, iter: number,
  ut: number[], idx: number[], inj: InjectSet, addedThisIter: number,
  rA: ReturnType<typeof buildRadiusFn>, truth: ReturnType<typeof buildFeatureTruth>,
  perpTolMm: number, ms: number, dumpVisual: boolean,
  anchorFine: boolean,
): Measured {
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const loc = buildLocator(meshUt, 256);
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: new Uint32Array(idx) });
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  // COST: the fine 8192x1600 tie-break grid is ~13M rA evals PER sampled red facet (~40min on GothicArches). Use it
  // ONLY for the honest FINAL/BEFORE verdict rows (anchorFine=true). Intermediate loop iterations use a COARSE-only
  // anchor (fine grid == coarse grid) for a cheap TREND signal — the loop stop still keys off trustedP99 but the
  // final honest number is re-measured fine. sampleN kept small.
  const anchored = anchorFine
    ? bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 })
    : bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 16, coarse: { nTheta: 2048, nZ: 400 }, fine: { nTheta: 2048, nZ: 400 } });
  let radialRed = 0; for (let f = 0; f < radial.faceErr.length; f++) if (radial.faceErr[f] > perpTolMm) radialRed++;
  const row: Row = {
    label, iter, tris: idx.length / 3, injected: inj.pts.length / 2, addedThisIter,
    flChordP99: +fl3.p99Mm.toFixed(4), flMax: +fl3.maxMm.toFixed(3),
    radialMax: +radial.worstMm.toFixed(4), radialRedCount: radialRed,
    trustedP99: +anchored.trustedP99.toFixed(4), anchGnP99: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver, nRed: anchored.nRed,
    minA: q.minAngleDeg, median: q.medianMinAngleDeg, pctB20: q.pctBelow20,
    nonMan, ms: Math.round(ms),
  };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${label}/it${iter} tris=${String(row.tris).padStart(8)} inj=${row.injected}(+${addedThisIter}) flP99=${row.flChordP99} | radialMax=${row.radialMax} radialRed=${radialRed} | VERDICT trustedP99=${row.trustedP99}(anchGn ${row.anchGnP99},over ${row.gnOver},red ${row.nRed}) | minA=${row.minA} med=${row.median} %<20=${row.pctB20} nonMan=${row.nonMan} ${row.ms}ms`);
  if (dumpVisual) {
    dumpHeatmap(DIR, `pg_${label}_it${iter}_chord`, meshUt.xyz, ut, idx, rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: 200 }, stl: false });
  }
  return { row, radialFaceErr: radial.faceErr };
}

/**
 * The PERP-GUARD outer loop. Meshes with the tangled recipe, then repeatedly injects the true-surface FOOT of
 * every facet whose RADIAL perpendicular (upper bound on true-3D) exceeds perpTolMm, re-meshing each round,
 * until the honest brute-anchored trustedP99 <= perpTolMm OR maxIter / tri-budget.
 */
function runPerpGuard(
  label: string,
  rA: ReturnType<typeof buildRadiusFn>, truth: ReturnType<typeof buildFeatureTruth>,
  opts: { perpTolMm: number; maxIter: number; maxPoints: number; injectCapPerIter: number },
): Row {
  const inj = new InjectSet();
  let lastRow: Row | null = null;
  let addedPrev = 0;
  for (let iter = 0; iter <= opts.maxIter; iter++) {
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      ...BASE, maxPoints: opts.maxPoints,
      injectedPoints: inj.pts.length ? inj.pts.slice() : undefined,
      pinInjected: inj.pts.length ? true : undefined,
    });
    const ms = Date.now() - t0;
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    // Cheap COARSE anchor for the trend; a FINE (honest) anchor only when we're likely at the final row (last iter,
    // budget hit, or the previous coarse trend already met tol). This bounds each intermediate iteration.
    const likelyFinal = iter === opts.maxIter || idx.length / 3 > 5_900_000 || (lastRow != null && lastRow.trustedP99 <= opts.perpTolMm * 1.5);
    const { row, radialFaceErr: fe } = measureAndCheckpoint(label, iter, ut, idx, inj, addedPrev, rA, truth, opts.perpTolMm, ms, likelyFinal, likelyFinal);
    lastRow = row;
    // STOP: honest verdict satisfied (only trust the FINE anchor for the stop).
    if (likelyFinal && row.trustedP99 <= opts.perpTolMm) { console.log(`  [${label}] VERDICT SATISFIED (trustedP99 ${row.trustedP99} <= ${opts.perpTolMm}) @it${iter}`); break; } // eslint-disable-line no-console
    if (iter === opts.maxIter) break;
    if (idx.length / 3 > 5_900_000) { console.log(`  [${label}] tri budget ~6M hit @it${iter}`); break; } // eslint-disable-line no-console
    // GROW injectedPoints: for every RADIAL-red facet, project its centroid to the true surface, inject the FOOT.
    const reds: Array<{ f: number; e: number }> = [];
    for (let f = 0; f < fe.length; f++) if (fe[f] > opts.perpTolMm) reds.push({ f, e: fe[f] });
    reds.sort((x, y) => y.e - x.e);
    let added = 0;
    for (const { f } of reds) {
      if (added >= opts.injectCapPerIter) break;
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c]; // seam-aware centroid in u
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const cu = (ua + ub + uc) / 3, ctv = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const uw = cu - Math.floor(cu); const th = TAU * uw, z = ctv * DIMS.H, r = rA(th, z);
      const foot = projectPointToRadialSurface(r * Math.cos(th), r * Math.sin(th), z, rA);
      let fu = foot.theta / TAU; fu -= Math.floor(fu); const ft = Math.min(1, Math.max(0, foot.z / DIMS.H));
      // inject BOTH the projected foot AND the on-surface centroid (they differ only for steep straddle facets).
      if (fu > 0.001 && fu < 0.999 && ft > 0.001 && ft < 0.999 && inj.add(fu, ft)) added++;
      if (added >= opts.injectCapPerIter) break;
      if (uw > 0.001 && uw < 0.999 && ctv > 0.001 && ctv < 0.999 && inj.add(uw, ctv)) added++;
    }
    addedPrev = added;
    // eslint-disable-next-line no-console
    console.log(`  [${label}] it${iter}: ${reds.length} radial-red facets>tol, injected ${added} new surface points (total ${inj.pts.length / 2})`);
    if (added === 0) { console.log(`  [${label}] no NEW points to inject (all reds already covered) — floor reached @it${iter}`); break; } // eslint-disable-line no-console
  }
  return lastRow!;
}

describe('PERP-GUARD — true-3D-perpendicular-driven refinement (GothicArches)', () => {
  // ── BEFORE: plain chordSteiner (no perp-guard) — establishes the FLOOR. One density per unit (resilience). ──
  function runBefore(maxPoints: number): void {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, maxPoints });
    const ms = Date.now() - t0;
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    // COARSE anchor: the density-trend discriminator only needs to see whether trustedP99 DROPS with density; all
    // values are ~0.15 (far from 0.01), so the coarse 2048x400 anchor is sufficient and ~40x cheaper than the fine grid.
    measureAndCheckpoint(`before_${(maxPoints / 1e6).toFixed(1)}M`, 0, ut, idx, new InjectSet(), 0, rA, truth, 0.01, ms, true, false);
  }
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('BEFORE: plain chordSteiner floor @0.9M', () => {
    runBefore(900_000); expect(true).toBe(true);
  }, 60 * 60 * 1000);
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('BEFORE: plain chordSteiner floor @2.5M', () => {
    runBefore(2_500_000); expect(true).toBe(true);
  }, 60 * 60 * 1000);
  // Equal-budget baseline for the 6M perp-guard: plain chordSteiner at the same 6M cap (density-only, no perp steer).
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('BEFORE: plain chordSteiner floor @6M', () => {
    runBefore(6_000_000); expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── AFTER: perp-guard perpTol=0.02, screening budget 0.9M cap — the PRIMARY discriminator (does perp-injection
  //    move the 0.158 floor at ALL?). Cheap: radial selector, no whole-mesh projection. ──
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('AFTER: perp-guard perpTol=0.02 @0.9M screen', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    runPerpGuard('guard_tol0.02_0.9M', rA, truth, { perpTolMm: 0.02, maxIter: 4, maxPoints: 900_000, injectCapPerIter: 6000 });
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── AFTER: perp-guard perpTol=0.01 (the target), higher budget so the guard is not budget-clipped. ──
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('AFTER: perp-guard perpTol=0.01 @up-to-6M', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    runPerpGuard('guard_tol0.01_6M', rA, truth, { perpTolMm: 0.01, maxIter: 8, maxPoints: 6_000_000, injectCapPerIter: 8000 });
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── REDUCIBILITY DISCRIMINATOR: SURPRISE from the budget sweep — @2.5M and @6M budgets give the IDENTICAL
  //    2.19M-tri mesh (trustedP99 0.0573) because chordSteiner's mesh SIZE is set by chordTolMm (0.03), NOT the point
  //    budget. So injected points at fixed chordTol cannot add crest density (it1: 6000 injected -> +729 tris). The
  //    HONEST test of "is 0.057 a reducible chord floor or a genuine steep-EXCLUDE cliff" is a chordTolMm DEPTH sweep.
  //    One tol per unit (resilience), checkpointed. Coarse anchor (values near 0.05, far from 0.01). ──
  function runChordDepth(chordTolMm: number, maxPoints: number): void {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, chordTolMm, maxPoints });
    const ms = Date.now() - t0;
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    measureAndCheckpoint(`chorddepth_${chordTolMm}`, 0, ut, idx, new InjectSet(), 0, rA, truth, chordTolMm, ms, true, false);
  }
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('DEPTH: chordTolMm=0.015', () => {
    runChordDepth(0.015, 6_000_000); expect(true).toBe(true);
  }, 60 * 60 * 1000);
  it.skipIf(process.env.PF_PERP_GUARD !== '1')('DEPTH: chordTolMm=0.008', () => {
    runChordDepth(0.008, 12_000_000); expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
