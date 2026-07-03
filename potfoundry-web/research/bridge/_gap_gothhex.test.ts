// _gap_gothhex.test.ts — DEV-ONLY (env PF_GAP_GOTHHEX=1). Close GothicArches + HexagonalHive to honest true-3D <=0.01
// via the TANGLED CDT-under-M primitive (the one that CONFIRMED Gyroid — E-2026-07-03-TANGLED).
//
// CONTEXT (E-2026-07-03-CLOSE-THETA / VERIFY-THETA): BOTH styles were REFUTED-AXIS for the ridge-graph — they are
// dense NETWORKS, not vertical theta-chains. GothicArches = z-localized 2D rib lattice (ridge-graph 29.9mm/%<20 30.7%);
// HexagonalHive = staggered 2D hex grid (ridge-graph 33.5mm bridge, gnOver 0 = genuine). The CORRECT primitive is
// metric-Delaunay under the surface metric M + deep sag (chordSteiner), NO injected network, NO extra sweeps.
//
// RECIPE (mirror of _tangled2 rawSteiner + measure): buildInhouseMetricMesh(rA,H,{...BASE, optimizeSweeps:2,
//   guardManifoldAlways:true, chordTolMm:<sweep 0.03->0.02->0.015>, chordSteiner:true}).
//
// DISCIPLINE: measure at TWO densities per style/recipe (report both p99s => density-fragility explicit). Screen
// <=1.5M tris; HD-confirm the winner <=6M. CHECKPOINT one ndjson row the INSTANT it is scored (resumable, env-kill safe).
// ISOLATED — reuses labkit rulers + committed byte-identical-off kernel hooks READ-ONLY; edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth,
  buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_gap_gothhex');
const LEDGER = join(DIR, 'scorecard.ndjson');

// Same BASE the tangled recon/close used (Gyroid-equivalent screening budget). The density lever is maxPoints
// (chordSteiner splits until either chordTolMm is met or the budget is hit) — sweep it per (style,recipe).
const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;

interface Row {
  style: string; recipe: string; density: string;
  tris: number; maxPoints: number; chordTolMm: number;
  flChordP99: number; flMax: number;
  trustedP99: number; gnP99: number; gnOver: number; nSample: number; nRed: number;
  radialMax: number;
  minA: number; p5: number; median: number; mean: number; pctB10: number; pctB20: number;
  rawNonMan: number; ms: number;
}

/** RAW-index non-manifold (the shipping bar per prod scorecard): undirected edges by literal index shared by >2 tris. */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

function measure(
  style: StyleId, recipe: string, density: string, chordTolMm: number, maxPoints: number,
  mesh: { ut: number[]; indices: Uint32Array },
  rA: ReturnType<typeof buildRadiusFn>, truth: ReturnType<typeof buildFeatureTruth>,
  ms: number, dumpVisual: boolean,
): Row {
  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const meshUt = buildMeshUt(ut, idx, rA, H);
  const loc = buildLocator(meshUt, 256);
  // fl-chord on INTERIOR feature loci (exclude the u/t seam belt so the seam cliff does not dominate the verdict).
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, H, 0.05, 0, 4);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, H).vertices, indices: mesh.indices });
  const rawNonMan = auditNonManRaw(idx);
  const weldNonMan = auditNonManByIndex(meshUt.xyz, idx);
  const radial = perFaceChordSag(ut, idx, rA, H);
  // STEEP: brute-anchor the worst-red facets for the honest verdict (GN overstates steep up to 7x).
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.1, sampleN: 40, radial });
  const row: Row = {
    style, recipe, density, tris: idx.length / 3, maxPoints, chordTolMm,
    flChordP99: +fl3.p99Mm.toFixed(4), flMax: +fl3.maxMm.toFixed(3),
    trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver,
    nSample: anchored.nSample, nRed: anchored.nRed, radialMax: +radial.worstMm.toFixed(3),
    minA: q.minAngleDeg, p5: q.p5MinAngleDeg, median: q.medianMinAngleDeg, mean: q.meanMinAngleDeg,
    pctB10: q.pctBelow10, pctB20: q.pctBelow20,
    rawNonMan, ms: Math.round(ms),
  };
  (row as Record<string, unknown>).weldNonMan = weldNonMan;
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${style}/${recipe}/${density} tris=${String(row.tris).padStart(8)} flP99=${row.flChordP99} flMax=${row.flMax} worstRed(trust)=${row.trustedP99}(gn ${row.gnP99},over ${row.gnOver},red ${row.nRed}) radialMax=${row.radialMax} minA=${row.minA} p5=${row.p5} med=${row.median} %<10=${row.pctB10} %<20=${row.pctB20} rawNM=${row.rawNonMan} weldNM=${weldNonMan} ${row.ms}ms`);
  if (dumpVisual) {
    dumpHeatmap(DIR, `gh_${style}_${recipe}_${density}_chord`, meshUt.xyz, ut, idx, rA, H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
  }
  return row;
}

/** run the tangled CDT-under-M recipe at one (chordTolMm, maxPoints). */
function runTangled(rA: ReturnType<typeof buildRadiusFn>, chordTolMm: number, maxPoints: number): ReturnType<typeof buildInhouseMetricMesh> {
  return buildInhouseMetricMesh(rA, H, { ...BASE, maxPoints, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm, chordSteiner: true });
}

// Sweep plan per style: chordTolMm 0.03 (screen, ~lo density) -> 0.02 (screen, mid) -> 0.015 (HD confirm the winner).
// Two densities = the two maxPoints tiers per chordTol so density-fragility is explicit.
describe('GAP GothicArches + HexagonalHive — tangled CDT-under-M + deep sag', () => {
  // ── HexagonalHive: prod raw-kernel already ~0.0197 => expected to CLOSE fast. Screen then HD. ──
  it.skipIf(process.env.PF_GAP_GOTHHEX !== '1')('HexagonalHive: chordSteiner sweep', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'HexagonalHive' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const plan: Array<{ recipe: string; chordTol: number; maxPoints: number; density: string; visual: boolean }> = [
      { recipe: 'steiner0.03', chordTol: 0.03, maxPoints: 900_000, density: 'lo', visual: false },
      { recipe: 'steiner0.03', chordTol: 0.03, maxPoints: 1_500_000, density: 'hi', visual: false },
      { recipe: 'steiner0.02', chordTol: 0.02, maxPoints: 1_500_000, density: 'lo', visual: false },
      { recipe: 'steiner0.02', chordTol: 0.02, maxPoints: 3_000_000, density: 'hi', visual: true },
      { recipe: 'steiner0.015', chordTol: 0.015, maxPoints: 6_000_000, density: 'hd', visual: true },
    ];
    for (const p of plan) {
      const t0 = Date.now(); const mesh = runTangled(rA, p.chordTol, p.maxPoints); const ms = Date.now() - t0;
      measure(STYLE, p.recipe, p.density, p.chordTol, p.maxPoints, mesh, rA, truth, ms, p.visual);
    }
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── GothicArches: prod 0.199 (steep z-localized ribs) => needs the deep-sag depth. Same sweep.
  //    NB: chordSteiner OVER-SPLITS Gothic's steep ribs (0.03 already 1.8M tris @900k budget) → the finer tiers are
  //    HEAVY. Split per-tier into OWN env-gated `it`s (below) so each checkpoints + a kill resumes the unfinished tier.
  it.skipIf(process.env.PF_GAP_GOTHHEX !== '1')('GothicArches: steiner0.03 lo', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GothicArches' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now(); const mesh = runTangled(rA, 0.03, 900_000); const ms = Date.now() - t0;
    measure(STYLE, 'steiner0.03', 'lo', 0.03, 900_000, mesh, rA, truth, ms, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_GAP_GOTHHEX !== '1')('GothicArches: steiner0.02 (density-response)', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GothicArches' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now(); const mesh = runTangled(rA, 0.02, 3_000_000); const ms = Date.now() - t0;
    measure(STYLE, 'steiner0.02', 'mid', 0.02, 3_000_000, mesh, rA, truth, ms, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_GAP_GOTHHEX !== '1')('GothicArches: steiner0.015 HD (density-response)', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GothicArches' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now(); const mesh = runTangled(rA, 0.015, 6_000_000); const ms = Date.now() - t0;
    measure(STYLE, 'steiner0.015', 'hd', 0.015, 6_000_000, mesh, rA, truth, ms, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
