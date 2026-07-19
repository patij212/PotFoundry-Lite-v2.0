// _geoStarCreaseConform.test.ts — EXPERIMENT E-2026-07-19-GEOSTAR-CREASE-CDT-BYCONSTRUCTION.
//
// [PRESERVED ARTIFACT on refactor/core-migration; NO-GO — registry b32110ac.] This imports the
// double-valued CREASE path (../../src/geometry/doubleValued/*), which is ACTIVELY MOVING under a
// parallel effort — RUN IT AGAINST PIN commit 731e0592 (e.g. `git worktree add --detach
// .worktrees/gs 731e0592`), NOT HEAD, or the crease-path behavior/signature will differ. Gated by
// PF_GS_CONFORM_PLAIN / PF_GS_CONFORM_CONF, so it never runs in the default suite. VERDICT:
// IRREDUCIBLE — CDT-by-construction embeds 100% + closes the BULK (p99 0.773->0.020) but the chevron
// V-corner true-3D MAX is density-flat (~1.24mm); the MAX needs an anisotropic flank kernel, not
// edge-conforming. See [[project_feature_conforming_reuse_map]].
//
// HYPOTHESIS: routing GeometricStar's chevron as a CREASES-ONLY complex through the double-valued
// mesher's constrained-CDT-BY-CONSTRUCTION path (cdt2d inserts each crease as a hard constraint edge;
// recovery CANNOT fail) closes GeoStar's true-3D MAX outlier toward 0.01mm — where the M=g/h² region
// kernel's POST-HOC edge RECOVERY embedded only ~81% of the interleaved chevron edges and REGRESSED the
// true-3D MAX 0.367→1.250mm / watertight 0→93 nonMan (E-2026-07-19-GEOSTAR-CHEVRON-CONFORM).
//
// KILL-CRITERION (pre-registered, BEFORE measuring):
//   CLOSES-MEANINGFULLY iff conform true-3D MAX ≤ 0.5×plain MAX AND < 0.108mm (beat the general
//     buildFeatureConformingMeshB 0.108 stall the prior experiment also could not beat) AND nonMan == 0.
//   IRREDUCIBLE-BY-CONSTRUCTION iff conform true-3D MAX ≥ 0.9×plain MAX (by-construction ALSO fails).
//   PARTIAL otherwise (report the residual locus + whether it is a crease-sampling/seam artifact vs
//     genuine near-vertical-cliff sag).
// Ruler: perFaceTrue3DSag (facet→nearest analytic surface, whole mesh) — GeoStar is a RISER not a tangled
// lattice ⇒ single-seed GN is honest here (prior experiment: gnOver=0 both arms). Radial (perFaceChordSag)
// reported only as the overstating screen. Slivers by triangleQualityDistribution minAngle. Watertight by
// auditNonManByIndex (3D-weld, by index).
//
// ARMS (SAME buildDoubleValuedMesh + SAME opts; ONLY `creases` differ):
//   plain   — creases:[]              (no chevron; refine-only, the by-construction baseline)
//   conform — creases: 16 planarized chevron chains (dStrap=0 & dStrap=edge level curves, arc-length CreaseLike)
//
// RESILIENCE: one env-gated probe PER ARM (PF_GS_CONFORM_PLAIN / _CONF) so a killed run resumes by
// re-running only the unfinished arm; each arm appends its scorecard row + dumps heatmap bins the INSTANT
// it is computed. Budget is env-parameterized (BG_U/BG_T/TOL/PASSES/PCAP) so a tiny smoke precedes the screen.

import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDoubleValuedMesh } from '../../src/geometry/doubleValued/doubleValuedMesh';
import { auditManifold } from '../../src/geometry/doubleValued/verify';
import type { BuildStats, CreaseLike, MeshBuildOptions } from '../../src/geometry/doubleValued/types';
import { buildRadiusFn } from './runStyle';
import { buildGeometricStarConformingGraph } from './geoStarFeatureEdges';
import { creasesFromGraph } from './geoStarCreasePlanarize';
import {
  perFaceTrue3DSag, perFaceChordSag, auditNonManByIndex, triangleQualityDistribution, dumpHeatmap,
} from './labkit';

const H = 120;
const DIMS = { H, Rb: 40, Rt: 50, expn: 1 };
const rA = buildRadiusFn('GeometricStar', {}, DIMS);
const surface = (u: number, t: number): number => rA(2 * Math.PI * u, t * H);

const OUT = join('research', 'exchange', '_geoStarCreaseConform');
mkdirSync(OUT, { recursive: true });

const envN = (k: string, d: number): number => (process.env[k] ? Number(process.env[k]) : d);
function budget(): MeshBuildOptions {
  return {
    baseGridU: envN('BG_U', 160),
    baseGridT: envN('BG_T', 200),
    chordTolMm: envN('TOL', 0.01),
    maxRefinePasses: envN('PASSES', 20),
    pointCap: envN('PCAP', 500000),
    domain: { uMin: 0, uMax: 1, tLo: 0, tHi: 1 }, // EXPLICIT — empty-segments fallback is +Inf/−Inf
    analyticChord: true,
    refineCreases: true,
    periodicU: envN('PERIODIC', 1) === 1,
    weldSoftCliffs: false, // ⇒ straddleGuard=false (unset) ⇒ refine metric skips NOTHING on the ramp
  };
}

function pctl(sorted: Float64Array, q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
}

function runArm(name: string, creases: CreaseLike[]): Record<string, unknown> {
  const opts = budget();
  const complex = { segments: [] as [], junctions: [] as [], creases };
  const stats: BuildStats = {
    refinePasses: 0, addedSheetPoints: 0, splitCliffEdges: 0, unwalledCliffEdges: 0,
    maxAnalyticChordMm: 0, pointCapHit: 0, voteFreeRegions: 0, tieCliffRegions: 0,
  };
  const t0 = Date.now();
  const mesh = buildDoubleValuedMesh(complex, surface, { H }, opts, stats);
  const buildMs = Date.now() - t0;
  const tris = mesh.triangles.length / 3;
  const verts = mesh.positions.length / 3;
  // ut per vertex (from the mesher's own source (u,t)); perFaceTrue3DSag re-lifts via rA (identical lift).
  const ut: number[] = [];
  for (let i = 0; i < verts; i++) ut.push(mesh.vertexU[i], mesh.vertexT[i]);
  const idx = mesh.triangles;
  // true-3D (honest ruler) + radial (overstating screen)
  const t3 = perFaceTrue3DSag(ut, idx, rA, H);
  const rad = perFaceChordSag(ut, idx, rA, H);
  const sortedT = Float64Array.from(t3.faceErr).sort();
  const nonMan = auditNonManByIndex(mesh.positions, idx);
  const nonMan1e6 = auditNonManByIndex(mesh.positions, idx, 1e-6);
  const am = auditManifold(mesh); // mesher's OWN index-based audit (genuine topology, no 3D re-weld)
  const tq = triangleQualityDistribution({ vertices: mesh.positions, indices: idx });
  const row = {
    arm: name, tris, verts, buildMs,
    true3dMax: t3.worstMm, true3dP999: pctl(sortedT, 0.999), true3dP99: pctl(sortedT, 0.99),
    over01: t3.fracOver(0.01), over03: t3.fracOver(0.03),
    radialMax: rad.worstMm,
    nonMan, nonMan1e6,
    amNonManifold: am.nonManifold, amBoundary: am.boundary, amCliffBoundary: am.cliffBoundary, amBoundaryNonRim: am.boundaryNonRim,
    pctBelow20: tq.pctBelow20,
    minAngle: tq.minAngleDeg,
    refinePasses: stats.refinePasses, pointCapHit: stats.pointCapHit,
    maxAnalyticChordMm: stats.maxAnalyticChordMm, addedSheetPoints: stats.addedSheetPoints,
    unwalledCliffEdges: stats.unwalledCliffEdges,
    budget: { BG_U: opts.baseGridU, BG_T: opts.baseGridT, TOL: opts.chordTolMm, PASSES: opts.maxRefinePasses, PCAP: opts.pointCap },
    creaseCount: creases.length,
    ts: new Date().toISOString(),
  };
  // CHECKPOINT immediately (resilience)
  appendFileSync(join(OUT, 'scorecard.ndjson'), JSON.stringify(row) + '\n');
  dumpHeatmap(OUT, `geoStar_${name}`, mesh.positions, ut, idx, rA, H, { stl: false, meta: { arm: name } });
  // eslint-disable-next-line no-console
  console.log(`[${name}] tris=${tris} true3dMAX=${t3.worstMm.toFixed(4)} p99=${pctl(sortedT, 0.99).toFixed(4)} over0.01=${(100 * t3.fracOver(0.01)).toFixed(1)}% radialMAX=${rad.worstMm.toFixed(3)} nonMan(1e-4)=${nonMan} nonMan(1e-6)=${nonMan1e6} amNonMan=${am.nonManifold} amBndNonRim=${am.boundaryNonRim} <20deg=${tq.pctBelow20}% passes=${stats.refinePasses} capHit=${stats.pointCapHit} maxChord=${stats.maxAnalyticChordMm.toFixed(4)} ${buildMs}ms`);
  return row;
}

describe('E-2026-07-19 GeoStar chevron via CDT-by-construction (double-valued mesher, creases-only)', () => {
  it.skipIf(process.env.PF_GS_CONFORM_PLAIN !== '1')('ARM plain (creases:[])', () => {
    const row = runArm('plain', []);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 1800000);

  it.skipIf(process.env.PF_GS_CONFORM_CONF !== '1')('ARM conform (planarized chevron creases)', () => {
    const graph = buildGeometricStarConformingGraph(); // default segLen 0.005 (== prior recovery experiment graph)
    const { creases, planar, chains } = creasesFromGraph(graph);
    writeFileSync(join(OUT, 'graph.json'), JSON.stringify({
      rawPts: graph.pts.length / 2, rawEdges: graph.edges.length / 2,
      planarPts: planar.pts.length / 2, planarEdges: planar.edges.length / 2,
      welded: planar.stats.welded, crossingsSplit: planar.stats.crossingsSplit, iterations: planar.stats.iterations,
      chains: chains.length, creases: creases.length,
    }));
    const row = runArm('conform', creases);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 1800000);

  // SANITY (task-flagged): the straddle guard / analytic-chord SOFT_JUMP (0.05) is tuned for ~0.6mm
  // CelticKnot cliff JUMPS. GeoStar is single-valued/CONTINUOUS, but its chevron ramp is near-vertical —
  // so |surface(u+2e-4,t)−surface(u−2e-4,t)| may EXCEED 0.05 on the ramp. Report the max; confirm the
  // guard is OFF (weldSoftCliffs:false, straddleGuard unset ⇒ false) so the refine metric skips NOTHING.
  it.skipIf(process.env.PF_GS_CONFORM_SANITY !== '1')('SANITY: would the straddle guard fire on the ramp?', () => {
    const DU = 2e-4, JUMP = 0.05;
    let maxDelta = 0, nOver = 0, total = 0;
    for (let iu = 0; iu < 1000; iu++) {
      const u = iu / 1000;
      for (let it = 1; it < 200; it++) {
        const t = it / 200;
        const d = Math.abs(surface(u + DU, t) - surface(u - DU, t));
        if (d > maxDelta) maxDelta = d;
        if (d > JUMP) nOver++;
        total++;
      }
    }
    const wouldFire = nOver > 0;
    const rec = { maxRampDelta: maxDelta, guardJump: JUMP, samplesOverJump: nOver, totalSamples: total, wouldFireIfEnabled: wouldFire, guardEnabledInArms: false, note: 'weldSoftCliffs:false + straddleGuard unset ⇒ straddleGuard=false ⇒ straddles() short-circuits ⇒ refine metric skips 0 facets; perFaceTrue3DSag ruler has no skip either' };
    writeFileSync(join(OUT, 'straddleSanity.json'), JSON.stringify(rec, null, 2));
    // eslint-disable-next-line no-console
    console.log(`[sanity] maxRampDelta=${maxDelta.toFixed(4)}mm over0.05=${nOver}/${total} wouldFireIfEnabled=${wouldFire} guardEnabledInArms=false`);
    expect(total).toBeGreaterThan(0);
  }, 120000);
});
