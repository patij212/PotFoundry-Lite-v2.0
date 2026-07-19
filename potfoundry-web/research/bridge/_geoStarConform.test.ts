// _geoStarConform.test.ts — E-2026-07-19-GEOSTAR-CHEVRON-CONFORM (PF_GEOSTAR_CONFORM=1).
//
// QUESTION (falsifiable): does a DEDICATED GeometricStar chevron-strap feature-conforming edge graph (the exact
// dStrap=0 / dStrap=edge level curves, injected as hard constraints — the analog of DragonScales' dedicated
// buildDragonScalesConformingGraph) close GeoStar's true-3D MAX outlier toward the 0.01mm export standard, or
// confirm the near-vertical chevron cliff is true-3D-IRREDUCIBLE even with dedicated edges?
//
// PRIOR (task background): cell SIZING (iso + M=g/h²) floors GeoStar true-3D MAX at ~0.98–1.19mm (the chevron
// cliff). A GENERAL feature-conforming front-end (buildFeatureConformingMeshB) only reaches MAX ~0.108mm and STALLS.
// DragonScales, by contrast, is CLOSED to body p99 0.009 by its DEDICATED analytic graph. This probe builds + measures
// the GeoStar analog.
//
// A/B (one lever = the graph): both arms are buildInhouseMetricMesh(rA,H,·) on the SAME matched opts
// (tolMm 0.01, hMin 0.02, hMax 8, sizeRes 256, gradeBeta 0.2, maxPoints 800000, guardManifoldAlways true). The
// CONFORMING arm adds ONLY injectedPoints=graph.pts + constraintEdges=graph.edges + pinInjected +
// recoverySubdivideCollinear (exactly the _dsInteriorClose recipe). guardManifoldAlways is ON for BOTH so nonMan is a
// fair one-lever comparison (the injection path always guards regardless; matching it on PLAIN isolates the graph).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSES-MEANINGFULLY iff CONFORMING true-3D MAX ≤ 0.5 × PLAIN MAX AND CONFORMING MAX < 0.108mm (beats the general
//     front-end stall) — i.e. the dedicated edges move the worst chevron facet materially below the stall toward 0.01.
//   IRREDUCIBLE iff CONFORMING MAX ≥ 0.9 × PLAIN MAX (dedicated edges do NOT move the cliff → confirm true-3D floor).
//   PARTIAL otherwise (moves it, but not below the 0.108 stall / not halved) — report the number + the mechanism.
//   Recovery sanity: report constraint requested/recovered/failed; a recovered≪requested would confound (report it).
//
// INSTRUMENT DISCIPLINE (metric gotcha): true-3D is the verdict ruler — perFaceTrue3DSag (facet→nearest-surface).
// It uses single-seed GN which "may overstate absolute on steep chevrons" (labkit caveat / _msurf note), so the
// worst facets are ALSO cross-checked with bruteAnchoredRedPerp (full-azimuth brute-anchored TRUSTED centroid perp)
// to see the honest MAX under GN overstatement. RADIAL (perFaceChordSag) reported only as the overstating screen.
//
// DEV-ONLY; research/ only; never edits src/. Each arm is a keyExists-guarded checkpointed unit → a killed run
// RESUMES by re-running only the missing arm. Render bins dumped per arm the instant the mesh is scored.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, buildRadiusFn, liftUtToRadial,
  triangleQualityDistribution, auditNonManByIndex,
  perFaceTrue3DSag, perFaceChordSag, bruteAnchoredRedPerp,
  vertErrColors, dumpRenderBins,
} from './labkit';
import type { InhouseMeshOpts, StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildGeometricStarConformingGraph } from './geoStarFeatureEdges';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const BASE: InhouseMeshOpts = {
  tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2, maxPoints: 800_000, guardManifoldAlways: true,
};

const OUT_DIR = join('research', 'exchange', '_geoStarConform');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

interface Arm { key: string; conform: boolean; note: string; robust?: boolean; segLen?: number; anchor?: boolean; }
const ARMS: Arm[] = [
  { key: 'plain', conform: false, anchor: true, note: 'M=g/h² sizing only, no graph (baseline)' },
  { key: 'conform', conform: true, anchor: true, note: 'dedicated dStrap=0/edge level-curve graph (segLen 0.005) + pin + subdivColinear' },
  // disambiguators (anchor skipped — gnOver=0 already confirmed GN honest on GeoStar):
  { key: 'conform-robust', conform: true, robust: true, anchor: false, note: 'same graph + guardRecoveryManifold + recoveryRobust (does robust recovery fix the 93 nonMan + the failed-edge MAX?)' },
  { key: 'conform-coarse', conform: true, segLen: 0.012, anchor: false, note: 'coarser graph (segLen 0.012, fewer/more-separated edges — does lower near-parallel density lift recovery + close MAX?)' },
];

function optsFor(arm: Arm): { opts: InhouseMeshOpts; graphPts: number; graphEdges: number } {
  const opts: InhouseMeshOpts = { ...BASE };
  if (arm.conform) {
    const g = buildGeometricStarConformingGraph(arm.segLen !== undefined ? { segLen: arm.segLen } : {});
    opts.injectedPoints = g.pts;
    opts.constraintEdges = g.edges;
    opts.pinInjected = true;
    opts.recoverySubdivideCollinear = true;
    if (arm.robust) { opts.recoveryRobust = true; opts.guardRecoveryManifold = true; }
    return { opts, graphPts: g.pts.length / 2, graphEdges: g.edges.length / 2 };
  }
  return { opts, graphPts: 0, graphEdges: 0 };
}

describe('GeometricStar chevron-strap DEDICATED conforming graph — true-3D MAX close vs irreducible', () => {
  for (const arm of ARMS) {
    it.skipIf(process.env.PF_GEOSTAR_CONFORM !== '1')(`${arm.key} — ${arm.note}`, () => {
      if (keyExists(arm.key)) { plog(`[skip] ${arm.key} already recorded`); return; }
      mkdirSync(OUT_DIR, { recursive: true });
      const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
      const { opts, graphPts, graphEdges } = optsFor(arm);

      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, opts);
      const ut = mesh.ut, idx = mesh.indices;
      const xyz = liftUtToRadial(ut, rA, H).vertices; // Float32Array
      const tris = idx.length / 3, verts = xyz.length / 3;
      const c = mesh.constraint;
      plog(`[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}${c ? ` constraint{req=${c.requested} present=${c.alreadyPresent} recovered=${c.recovered} failed=${c.failed} subdivSplits=${c.subdivSplits ?? 0}}` : ''}`);

      // quality + watertight
      const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
      const nonMan = auditNonManByIndex(xyz, idx);

      // RADIAL screen (overstates; context only) — also feeds the brute-anchor red set
      const radial = perFaceChordSag(ut, idx, rA, H);
      const rSorted = Float64Array.from(radial.faceErr).sort();

      // TRUE-3D verdict ruler (perFaceTrue3DSag, GN single-seed) — whole mesh
      const tT = Date.now();
      const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
      const feSorted = Float64Array.from(sag.faceErr).sort();
      const true3dMax = +sag.worstMm.toFixed(6);
      const true3dP99 = pct(feSorted, 0.99), true3dP999 = pct(feSorted, 0.999), true3dP50 = pct(feSorted, 0.5);
      const over01 = +sag.fracOver(0.01).toFixed(6), over03 = +sag.fracOver(0.03).toFixed(6);
      plog(`[${arm.key}][TRUE3D] max=${true3dMax} p99=${true3dP99} p99.9=${true3dP999} over0.01=${over01} in ${((Date.now() - tT) / 1000).toFixed(1)}s`);

      // BRUTE-ANCHORED trusted worst-facet perp (corrects GN overstatement on the steep chevron). Skipped for the
      // disambiguator arms — arm 'conform'/'plain' already showed gnOver=0 ⇒ GN is honest on GeoStar's chevron.
      const doAnchor = arm.anchor !== false;
      const tB = Date.now();
      const anch = doAnchor
        ? bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.05, sampleN: 40, radial })
        : { nRed: 0, nSample: 0, gnP99: 0, trustedP99: 0, trustedMax: 0, gnOver: 0, bruteOver: 0 };
      if (doAnchor) plog(`[${arm.key}][ANCHOR] nRed=${anch.nRed} nSample=${anch.nSample} gnP99=${anch.gnP99.toFixed(4)} trustedP99=${anch.trustedP99.toFixed(4)} trustedMax=${anch.trustedMax.toFixed(4)} gnOver=${anch.gnOver} in ${((Date.now() - tB) / 1000).toFixed(1)}s`);

      // render bins (true-3D colours) — checkpoint the visual per arm
      dumpRenderBins(OUT_DIR, `geoStar_${arm.key}`, xyz, idx, {
        colors: vertErrColors(sag.vertErr, 0.15),
        meta: { ruler: 'true3d', arm: arm.key, worstMm: true3dMax, p99Mm: true3dP99, pctOver0_03: 100 * over03, tris },
        stl: false,
      });

      append({
        key: arm.key, note: arm.note, conform: arm.conform,
        tris, verts, rounds: mesh.rounds, hitBudget: mesh.hitBudget,
        graphPts, graphEdges, constraint: c ?? null,
        minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2),
        medianMinAngleDeg: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2), nonMan,
        true3dMax, true3dP999, true3dP99, true3dP50, over01, over03,
        radialMax: +radial.worstMm.toFixed(6), radialP99: pct(rSorted, 0.99),
        anchNRed: anch.nRed, anchNSample: anch.nSample,
        anchGnP99: +anch.gnP99.toFixed(6), anchTrustedP99: +anch.trustedP99.toFixed(6),
        anchTrustedMax: +anch.trustedMax.toFixed(6), anchGnOver: anch.gnOver,
      });
    }, 6_000_000);
  }
});
