// _dsThetaEdge.test.ts — E-2026-07-13-DS-THETAEDGE (PF_DSTHETA=1).
//
// CLOSING LEVER for DS body fidelity. ESTABLISHED (E-2026-07-13-DS-TRUE3D, committed): the DS M=g/h² OFF baseline
// (`buildInhouseMetricMesh` tol0.01/sizeRes192/hMin0.05/hMax8/gradeBeta0.2/maxPoints2.5M/guardManifoldAlways) is
// clean+watertight (%<20° 3.1%, nonMan 0) but BODY fidelity under the TRUE-3D composite ruler is p99 0.01725 /
// max 0.1887 (6.6% > 0.01). The residual is REAL (not a ruler artifact) and localized to the θ-PERIODIC SCALE-TILE
// EDGES: the near-vertical relief valleys between adjacent scales WITHIN each z-row (distinct from the 7 z-ring
// risers, which are the CLOSED V11l tread class, excluded as ring-band). Sizing cannot converge it
// (DS-CHORDGUARD refuted chordTolMm: shreds slivers 3.1%→11%, floors p99 0.0179).
//
// HYPOTHESIS (falsifiable): embedding the DS scale-tile θ-edge graph as `constraintEdges` into the M-kernel (the
// SAME zero-serration feature-edge mechanism that embeds the z-ring risers) makes each valley an actual mesh edge
// so facets stop chording ACROSS the scale relief → true-3D composite body p99 ≤ 0.01, max tail collapses
// (~0.19→≤~0.05), WITHOUT regressing the certified sliver win (%<20° ≤ ~3.5%) and nonMan 0, within 2.5M verts.
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSES iff true-3D composite body p99 ≤ 0.01 AND t3Max ≤ ~0.05 AND %<20° ≤ ~3.5 AND nonMan 0 (2.5M budget).
//   REFUTED otherwise → report residual p99/max + remaining loci + WHY (does constraint recovery actually embed the
//   θ-walls [recovered≈requested], or do they need to be meshed as vertical strips like the risers?).
//
// θ-EDGE GRAPH DERIVATION (analytic scale-tile lattice, NOT sampled). rOuterDragonScales (src/geometry/styles.ts):
//   rowPhase = t*scaleRows; row = floor(rowPhase); staggerOffset = (row odd)? 0.5·TAU/scalesPerRow : 0;
//   scaleTheta = theta + staggerOffset; scalePhase = (scaleTheta·scalesPerRow) % TAU; scaleLocal = scalePhase/TAU;
//   xDist = |scaleLocal−0.5|·2  (0 at scale CENTER/bulge, 1 at scale EDGE/valley).
// ⇒ the valley (radius minimum, the near-vertical relief wall between adjacent scales) is at scaleLocal = 0, i.e.
//   scaleTheta·scalesPerRow = m·TAU ⇒ scaleTheta = m·TAU/scalesPerRow ⇒ theta = m·TAU/scalesPerRow − staggerOffset.
//   In u = theta/TAU units: u_edge = m/scalesPerRow (EVEN row) or (m−0.5)/scalesPerRow (ODD row, brick stagger),
//   m = 0..scalesPerRow−1, spanning t ∈ [k/scaleRows, (k+1)/scaleRows] (each vertical line lives in ONE row band;
//   the half-period stagger jump at every t=k/scaleRows is the z-ring riser, handled separately). Verified numeric:
//   k=0,t=0.0625,u=0 → scaleLocal 0, xDist 1, dist 1 = valley; bulge at u=1/32. DEFAULTS scaleRows 8, scalesPerRow 16.
//
// DEV-ONLY; research/ only; never edits src/. Reuses buildInhouseMetricMesh + _ds_prodtruth_lib (V11g ruler) +
// labkit READ-ONLY. Resumable: OFF and ON are separate checkpointed units guarded by keyExists.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
} from './labkit';
import type { InhouseMeshOpts } from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreBodyFacets, dsRadiusFn, radialBoundAt,
  DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

// EXACT E-2026-07-13-MSURF-INHOUSE / DS-TRUE3D-OFF settings (fair A/B: ON adds only the θ-edge constraint graph).
const SIZE_RES = 192, HMIN_3D = 0.05, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 2_500_000;
const TOLMM = 0.01;
const SCALE_ROWS = 8, SCALES_PER_ROW = 16;

const OUT_DIR = join('research', 'exchange', '_dsThetaEdge');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function pctFrom(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

/**
 * Build the DS scale-tile θ-edge constraint graph as flat injectedPoints [(u,t)...] + constraintEdges [posA,posB...]
 * (positions into injectedPoints, consecutive pairs along each vertical valley line). Each row band gets its own
 * disjoint vertical lines at the analytic valley u positions; the lines are inset from the ring boundaries (t=k/8)
 * by insT so no point falls in the ring-band (those risers are the CLOSED tread class, not the body target).
 */
function buildThetaEdgeGraph(nTper: number, insTmm: number): { injectedPoints: number[]; constraintEdges: number[]; lines: number } {
  const injectedPoints: number[] = [];
  const constraintEdges: number[] = [];
  const insT = insTmm / DS_H; // ring-band margin in t units
  let lines = 0;
  for (let k = 0; k < SCALE_ROWS; k++) {
    const odd = (k % 2) === 1;
    const t0 = k / SCALE_ROWS + insT, t1 = (k + 1) / SCALE_ROWS - insT;
    for (let m = 0; m < SCALES_PER_ROW; m++) {
      let u = odd ? (m - 0.5) / SCALES_PER_ROW : m / SCALES_PER_ROW;
      u -= Math.floor(u); // fold into [0,1)
      let prevPos = -1;
      for (let s = 0; s < nTper; s++) {
        const t = t0 + (t1 - t0) * (s / (nTper - 1));
        const pos = injectedPoints.length / 2;
        injectedPoints.push(u, t);
        if (prevPos >= 0) constraintEdges.push(prevPos, pos);
        prevPos = pos;
      }
      lines++;
    }
  }
  return { injectedPoints, constraintEdges, lines };
}

function scoreMesh(arm: string, key: string, opts: InhouseMeshOpts, extraMeta: Record<string, unknown>): void {
  const rA = dsRadiusFn();
  const H = DS_H;
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, opts);
  const idx = mesh.indices;
  const lifted = liftUtToRadial(mesh.ut, rA, H);
  const xyz = lifted.vertices;
  const tris = idx.length / 3, verts = xyz.length / 3;
  plog(`[${arm}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}${mesh.constraint ? ` constraint{req=${mesh.constraint.requested} present=${mesh.constraint.alreadyPresent} recovered=${mesh.constraint.recovered} failed=${mesh.constraint.failed} flips=${mesh.constraint.flips} subdivSplits=${mesh.constraint.subdivSplits ?? 0}}` : ''}`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
  const bodyAll: number[] = [];
  for (let f = 0; f < tris; f++) if (cls(f) === 'body') bodyAll.push(f);
  plog(`[${arm}] body facets=${bodyAll.length} (ring-band excluded); %<20=${q.pctBelow20.toFixed(2)} p5minAng=${q.p5MinAngleDeg.toFixed(2)} nonMan=${nonMan}`);

  // RADIAL body score (identity witness / overstatement reference).
  const rDevs: number[] = []; let rWorst = 0, rOut = 0;
  for (const f of bodyAll) {
    const a = idx[3 * f], bb = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * bb], by = xyz[3 * bb + 1], bz = xyz[3 * bb + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let dv = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = radialBoundAt(rA, px, py, pz); if (d > dv) dv = d;
    }
    rDevs.push(dv); if (dv > rWorst) rWorst = dv; if (dv > TOL) rOut++;
  }
  const rSorted = Float64Array.from(rDevs).sort();
  const radialP50 = pctFrom(rSorted, 0.5), radialP99 = pctFrom(rSorted, 0.99), radialMax = +rWorst.toFixed(6);
  plog(`[${arm}][RADIAL] body p50=${radialP50} p99=${radialP99} max=${radialMax} out=${rOut}/${bodyAll.length}`);

  // TRUE-3D composite body score (V11g certified acceptance ruler — the verdict number).
  const tL = Date.now();
  const loc = buildConformRuler(rA);
  plog(`[${arm}] built V11g composite ruler in ${((Date.now() - tL) / 1000).toFixed(1)}s`);
  const tS = Date.now();
  const bodyT3 = scoreBodyFacets(xyz, idx, bodyAll, loc, rA, TOL,
    (done, total) => { if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`  [${arm}][true3d] ${done}/${total}`); });
  plog(`[${arm}][TRUE-3D composite] body p50=${bodyT3.p50} p90=${bodyT3.p90} p99=${bodyT3.p99} max=${bodyT3.maxMm} out=${bodyT3.outliers}/${bodyAll.length} greenProven=${bodyT3.greenProvenFrac} in ${((Date.now() - tS) / 1000).toFixed(1)}s`);

  // WITNESS: perFaceTrue3DSag (GN facet→analytic radial surface; DS not tangled ⇒ honest) on the body subset.
  const tW = Date.now();
  const sag = perFaceTrue3DSag(mesh.ut, idx, rA, H, { preFilterMm: 0.01 });
  const wDevs: number[] = []; let wWorst = 0, wOut = 0;
  for (const f of bodyAll) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
  const wSorted = Float64Array.from(wDevs).sort();
  const witP50 = pctFrom(wSorted, 0.5), witP99 = pctFrom(wSorted, 0.99), witMax = +wWorst.toFixed(6);
  plog(`[${arm}][WITNESS perFaceTrue3DSag] body p99=${witP99} max=${witMax} out=${wOut}/${bodyAll.length} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

  checkpoint({
    key, style: 'DragonScales', arm, tol: 0.01, tris, verts,
    rounds: mesh.rounds, hitBudget: mesh.hitBudget,
    constraint: mesh.constraint ?? null,
    minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(3),
    pctBelow20: +q.pctBelow20.toFixed(2), nonMan, bodyFacets: bodyAll.length,
    radialP50, radialP99, radialMax, radialOut: rOut,
    t3P50: bodyT3.p50, t3P90: bodyT3.p90, t3P99: bodyT3.p99, t3Max: bodyT3.maxMm, t3Out: bodyT3.outliers,
    t3GreenProvenFrac: bodyT3.greenProvenFrac,
    witP50, witP99, witMax, witOut: wOut,
    ...extraMeta,
  });
  plog(`[${arm}] DONE — checkpointed`);
}

describe('DS θ-scale-tile-edge constraint embedding — close body to 0.01 true-3D without sliver regression?', () => {
  const baseOpts: InhouseMeshOpts = {
    tolMm: TOLMM, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints: MAX_POINTS, guardManifoldAlways: true,
  };

  it.skipIf(process.env.PF_DSTHETA !== '1')('OFF baseline (same-run A/B identity to DS-TRUE3D)', () => {
    const key = 'DragonScales|OFF|thetaEdge|0.01';
    if (keyExists(key)) { plog(`[skip] ${key} already recorded`); return; }
    scoreMesh('OFF', key, baseOpts, {});
  }, 6_000_000);

  it.skipIf(process.env.PF_DSTHETA !== '1')('ON — θ-tile-edge constraint graph embedded', () => {
    const key = 'DragonScales|ON|thetaEdge|0.01';
    if (keyExists(key)) { plog(`[skip] ${key} already recorded`); return; }
    const graph = buildThetaEdgeGraph(56, 1.3); // 56 samples/valley-line (dt≈0.0018), 1.3mm ring-band inset
    plog(`[ON] θ-edge graph: ${graph.lines} valley lines, ${graph.injectedPoints.length / 2} injected pts, ${graph.constraintEdges.length / 2} constraint edges`);
    scoreMesh('ON', key, {
      ...baseOpts,
      injectedPoints: graph.injectedPoints,
      constraintEdges: graph.constraintEdges,
      pinInjected: true,
      recoverySubdivideCollinear: true, // kernel interior/Steiner verts land ON the vertical lines → subdivide, not fail
    }, { valleyLines: graph.lines, injectedPts: graph.injectedPoints.length / 2, requestedEdges: graph.constraintEdges.length / 2 });
  }, 6_000_000);
});
