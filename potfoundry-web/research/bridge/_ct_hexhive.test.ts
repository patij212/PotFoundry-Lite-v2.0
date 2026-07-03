// _ct_hexhive.test.ts — DEV-ONLY (env PF_CT_HEXHIVE=1). Close HexagonalHive to honest true-3D fl-chord p99 <=0.01
// under the CONFIRMED tangled CDT-under-M recipe, by EXTENDING the chordTolMm sweep past 0.015 -> 0.010 -> 0.008
// (with a BINDING budget) to see whether the fl-chord floor found in E-2026-07-03-GAP-GOTHHEX (0.0171->0.0139->0.0115,
// mesh SATURATES ~910k) truly floors or continues its monotone descent across the bar.
//
// CONTEXT: HexHive has ZERO red facets at every density (nRed 0 => true-3D verdict == fl-chord; pure under-density,
// no steep tail to fight). Prior sweep stopped at chordTolMm 0.015 (fl-chord 0.0115, ~2x over the 0.01 bar). The open
// question: does 0.010/0.008 keep shrinking fl-chord (density-responsive across the bar) or does the mesh saturate
// (addPoint dedup / worst-bary-sample sag drops below tol => split stops) and floor near ~0.011?
//
// RECIPE (EXACT mirror of the confirmed _gap_gothhex HexHive path, READ-ONLY reuse): buildInhouseMetricMesh(rA,H,
//   {...BASE, optimizeSweeps:2, guardManifoldAlways:true, chordTolMm:<0.015->0.012->0.010->0.008>, chordSteiner:true}).
//
// DISCIPLINE: TWO densities per (recipe) so density-fragility is explicit (both p99s reported). CHECKPOINT one ndjson
// row the INSTANT each is scored (resumable, env-kill safe). Honest rulers (labkit READ-ONLY): fl-chord
// featureLineChord3D on INTERIOR loci (true-3D nearest-surface) + STEEP brute-anchor bruteAnchoredRedPerp -> trustedP99
// (gnOver reports GN overstatement); quality triangleQualityDistribution.pctBelow20; watertight auditNonManRaw.
// ISOLATED: reuses labkit rulers + committed byte-identical-off kernel hooks READ-ONLY; edits NOTHING in src/ or kernel.
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
const DIR = join('research', 'exchange', '_ct_hexhive');
const LEDGER = join(DIR, 'scorecard.ndjson');

// Same BASE the confirmed tangled recon/close used. chordSteiner splits until either chordTolMm is met or the
// budget is hit; sweep chordTolMm to push the fl-chord floor. Budget raised to 12M so it is NOT binding (isolate the
// chordTolMm lever from a budget clip; prior run saturated the mesh at ~910k well under 6M => budget was never the cap).
const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;

interface Row {
  style: string; recipe: string; density: string;
  tris: number; maxPoints: number; chordTolMm: number;
  flChordP99: number; flMax: number;
  trustedP99: number; gnP99: number; gnOver: number; nSample: number; nRed: number;
  radialMax: number;
  minA: number; p5: number; median: number; mean: number; pctB10: number; pctB20: number;
  rawNonMan: number; weldNonMan: number; ms: number;
}

/** RAW-index non-manifold (the shipping bar): undirected edges by literal index shared by >2 tris. */
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
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, H, 0.05, 0, 4);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, H).vertices, indices: mesh.indices });
  const rawNonMan = auditNonManRaw(idx);
  const weldNonMan = auditNonManByIndex(meshUt.xyz, idx);
  const radial = perFaceChordSag(ut, idx, rA, H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.1, sampleN: 40, radial });
  const row: Row = {
    style, recipe, density, tris: idx.length / 3, maxPoints, chordTolMm,
    flChordP99: +fl3.p99Mm.toFixed(4), flMax: +fl3.maxMm.toFixed(3),
    trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver,
    nSample: anchored.nSample, nRed: anchored.nRed, radialMax: +radial.worstMm.toFixed(3),
    minA: q.minAngleDeg, p5: q.p5MinAngleDeg, median: q.medianMinAngleDeg, mean: q.meanMinAngleDeg,
    pctB10: q.pctBelow10, pctB20: q.pctBelow20,
    rawNonMan, weldNonMan, ms: Math.round(ms),
  };
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${style}/${recipe}/${density} tris=${String(row.tris).padStart(8)} flP99=${row.flChordP99} flMax=${row.flMax} worstRed(trust)=${row.trustedP99}(gn ${row.gnP99},over ${row.gnOver},red ${row.nRed}) radialMax=${row.radialMax} minA=${row.minA} p5=${row.p5} med=${row.median} %<10=${row.pctB10} %<20=${row.pctB20} rawNM=${row.rawNonMan} weldNM=${weldNonMan} ${row.ms}ms`);
  if (dumpVisual) {
    dumpHeatmap(DIR, `ct_${style}_${recipe}_${density}_chord`, meshUt.xyz, ut, idx, rA, H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
  }
  return row;
}

function runTangled(rA: ReturnType<typeof buildRadiusFn>, chordTolMm: number, maxPoints: number): ReturnType<typeof buildInhouseMetricMesh> {
  return buildInhouseMetricMesh(rA, H, { ...BASE, maxPoints, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm, chordSteiner: true });
}

// Sweep plan: EXTEND past the prior 0.015 floor. 0.015 (reproduce the confirmed point) -> 0.012 -> 0.010 -> 0.008.
// TWO densities per chordTol tier: budget 6M (mirrors prior) + budget 12M (non-binding, isolates chordTol from budget).
describe('CT HexagonalHive — extend chordTolMm sweep past the 0.0115 floor toward <=0.01', () => {
  it.skipIf(process.env.PF_CT_HEXHIVE !== '1')('HexagonalHive: chordSteiner 0.015->0.008 density sweep', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'HexagonalHive' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const plan: Array<{ recipe: string; chordTol: number; maxPoints: number; density: string; visual: boolean }> = [
      { recipe: 'steiner0.015', chordTol: 0.015, maxPoints: 6_000_000, density: 'd6M', visual: false },
      { recipe: 'steiner0.012', chordTol: 0.012, maxPoints: 6_000_000, density: 'd6M', visual: false },
      { recipe: 'steiner0.012', chordTol: 0.012, maxPoints: 12_000_000, density: 'd12M', visual: false },
      { recipe: 'steiner0.010', chordTol: 0.010, maxPoints: 6_000_000, density: 'd6M', visual: false },
      { recipe: 'steiner0.010', chordTol: 0.010, maxPoints: 12_000_000, density: 'd12M', visual: true },
      { recipe: 'steiner0.008', chordTol: 0.008, maxPoints: 12_000_000, density: 'd12M', visual: true },
    ];
    for (const p of plan) {
      const t0 = Date.now(); const mesh = runTangled(rA, p.chordTol, p.maxPoints); const ms = Date.now() - t0;
      measure(STYLE, p.recipe, p.density, p.chordTol, p.maxPoints, mesh, rA, truth, ms, p.visual);
    }
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
