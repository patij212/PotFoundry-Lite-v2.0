// _gsStandalone.ts — standalone (esbuild-bundled) runner for the GeoStar crease CDT-by-construction
// experiment, to bypass the vitest worker-fork crash and get direct per-phase timing + error visibility.
// DEV/LAB ONLY. Env: ARM=plain|conform, BG_U,BG_T,TOL,PASSES,PCAP,PERIODIC, WINU0/WINU1/WINT0/WINT1 (window).
//
// [PRESERVED ARTIFACT on refactor/core-migration; NO-GO — registry b32110ac.] Imports the double-valued
// mesher, which is ACTIVELY MOVING — RUN AGAINST PIN commit 731e0592, NOT HEAD. Verdict: IRREDUCIBLE
// (bulk closed, chevron V-corner MAX density-flat ~1.24mm → needs an anisotropic flank kernel).
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDoubleValuedMesh } from '../../src/geometry/doubleValued/doubleValuedMesh';
import { auditManifold } from '../../src/geometry/doubleValued/verify';
import type { BuildStats, CreaseLike, MeshBuildOptions } from '../../src/geometry/doubleValued/types';
import { STYLE_FUNCTIONS } from '../../src/geometry/styles';
import { baseRadius } from '../../src/geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../../src/geometry/types';
import { buildGeometricStarConformingGraph } from './geoStarFeatureEdges';
import { creasesFromGraph } from './geoStarCreasePlanarize';
import { perFaceTrue3DSag, perFaceChordSag, auditNonManByIndex, dumpHeatmap } from './labkit';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';

const H = 120;
const gsFn = STYLE_FUNCTIONS.GeometricStar;
const gsParams = DEFAULT_STYLE_PARAMS.GeometricStar;
const rA = (theta: number, z: number): number => gsFn(theta, z, baseRadius(z, H, 40, 50, 1, gsParams), H, gsParams);
const surface = (u: number, t: number): number => rA(2 * Math.PI * u, t * H);

const OUT = join('research', 'exchange', '_geoStarCreaseConform');
mkdirSync(OUT, { recursive: true });
const envN = (k: string, d: number): number => (process.env[k] ? Number(process.env[k]) : d);
const pctl = (s: Float64Array, q: number): number => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0);
const log = (m: string): void => { process.stdout.write(m + '\n'); };

function main(): void {
  const arm = process.env.ARM ?? 'plain';
  const windowed = process.env.WINU0 !== undefined;
  const domain = windowed
    ? { uMin: envN('WINU0', 0), uMax: envN('WINU1', 1), tLo: envN('WINT0', 0), tHi: envN('WINT1', 1) }
    : { uMin: 0, uMax: 1, tLo: 0, tHi: 1 };
  const periodicU = !windowed && envN('PERIODIC', 1) === 1;
  let creases: CreaseLike[] = [];
  let graphInfo: Record<string, number> = {};
  if (arm === 'conform') {
    const graph = buildGeometricStarConformingGraph();
    const r = creasesFromGraph(graph);
    creases = r.creases;
    graphInfo = { rawEdges: graph.edges.length / 2, planarEdges: r.planar.edges.length / 2, crossingsSplit: r.planar.stats.crossingsSplit, chains: r.chains.length };
    if (windowed) {
      // keep only creases with any sample inside the window (mechanism test on a sub-region)
      creases = creases.filter((c) => {
        for (let s = 0; s <= 1; s += 0.05) { const p = c.at(s); if (p.u >= domain.uMin && p.u <= domain.uMax && p.t >= domain.tLo && p.t <= domain.tHi) return true; }
        return false;
      });
    }
    log(`[graph] chains=${graphInfo.chains} creasesUsed=${creases.length} crossingsSplit=${graphInfo.crossingsSplit}`);
  }
  const opts: MeshBuildOptions = {
    baseGridU: envN('BG_U', 100), baseGridT: envN('BG_T', 80), chordTolMm: envN('TOL', 0.01),
    maxRefinePasses: envN('PASSES', 2), pointCap: envN('PCAP', 30000), domain,
    analyticChord: true, refineCreases: true, periodicU, weldSoftCliffs: false,
  };
  const stats: BuildStats = { refinePasses: 0, addedSheetPoints: 0, splitCliffEdges: 0, unwalledCliffEdges: 0, maxAnalyticChordMm: 0, pointCapHit: 0, voteFreeRegions: 0, tieCliffRegions: 0 };
  log(`[build] arm=${arm} BG=${opts.baseGridU}x${opts.baseGridT} PASSES=${opts.maxRefinePasses} PCAP=${opts.pointCap} periodicU=${periodicU} windowed=${windowed}`);
  let t0 = Date.now();
  const mesh = buildDoubleValuedMesh({ segments: [], junctions: [], creases }, surface, { H }, opts, stats);
  const buildMs = Date.now() - t0;
  const tris = mesh.triangles.length / 3, verts = mesh.positions.length / 3;
  log(`[build] done tris=${tris} verts=${verts} passes=${stats.refinePasses} capHit=${stats.pointCapHit} maxChord=${stats.maxAnalyticChordMm.toFixed(4)} ${buildMs}ms`);
  const ut: number[] = [];
  for (let i = 0; i < verts; i++) ut.push(mesh.vertexU[i], mesh.vertexT[i]);
  const idx = mesh.triangles;
  t0 = Date.now();
  const t3 = perFaceTrue3DSag(ut, idx, rA, H);
  const rad = perFaceChordSag(ut, idx, rA, H);
  const measMs = Date.now() - t0;
  const sortedT = Float64Array.from(t3.faceErr).sort();
  const nonMan = auditNonManByIndex(mesh.positions, idx);
  const am = auditManifold(mesh);
  const tq = triangleQualityDistribution({ vertices: mesh.positions, indices: idx });
  const row = {
    arm, windowed, tris, verts, buildMs, measMs,
    true3dMax: t3.worstMm, true3dP999: pctl(sortedT, 0.999), true3dP99: pctl(sortedT, 0.99),
    over01: t3.fracOver(0.01), over03: t3.fracOver(0.03), radialMax: rad.worstMm,
    nonMan, amNonManifold: am.nonManifold, amBoundaryNonRim: am.boundaryNonRim,
    pctBelow20: tq.pctBelow20, minAngle: tq.minAngleDeg,
    refinePasses: stats.refinePasses, pointCapHit: stats.pointCapHit, maxAnalyticChordMm: stats.maxAnalyticChordMm,
    creaseCount: creases.length, ...graphInfo,
    budget: { BG_U: opts.baseGridU, BG_T: opts.baseGridT, TOL: opts.chordTolMm, PASSES: opts.maxRefinePasses, PCAP: opts.pointCap, periodicU, windowed, domain },
    ts: new Date().toISOString(),
  };
  appendFileSync(join(OUT, windowed ? 'scorecard_win.ndjson' : 'scorecard.ndjson'), JSON.stringify(row) + '\n');
  try { dumpHeatmap(OUT, `geoStar_${arm}${windowed ? '_win' : ''}`, mesh.positions, ut, idx, rA, H, { stl: false, meta: { arm } }); } catch (e) { log('[heatmap skip] ' + (e as Error).message); }
  log(`[RESULT ${arm}] tris=${tris} true3dMAX=${t3.worstMm.toFixed(4)} p99=${pctl(sortedT, 0.99).toFixed(4)} over0.01=${(100 * t3.fracOver(0.01)).toFixed(1)}% radialMAX=${rad.worstMm.toFixed(3)} nonMan=${nonMan} amNonMan=${am.nonManifold} <20deg=${tq.pctBelow20}% maxChord=${stats.maxAnalyticChordMm.toFixed(4)} build=${buildMs}ms meas=${measMs}ms`);
}
main();
