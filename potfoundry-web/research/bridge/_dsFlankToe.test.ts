// _dsFlankToe.test.ts — E-2026-07-13-DS-FLANKTOE (PF_DSFLANKTOE=1).
//
// STEP 1 — CONFIRM the worst-locus of the DS body true-3D residual before building the wrong edge.
// ESTABLISHED (E-2026-07-13-DS-THETAEDGE, committed 6d6df80f): the straight θ-tile-boundary constraint graph pulled
// composite body p99 0.01725→0.01282 (%<20° 3.10→1.60, nonMan 0, 100% recovery) but MISSED 0.01 and left the WITNESS
// worst body facet (perFaceTrue3DSag max 0.847) UNCHANGED. Diagnosis to test: the worst residual is the per-scale
// FLANK-TOE contour distFromCenter=1 (the rounded-diamond around each scale center), NOT the straight θ-boundary
// (scaleLocal=0 / xDist=1) — the two coincide ONLY at mid-row (yDist=0).
//
// DS scale geometry (rOuterDragonScales, src/geometry/styles.ts, DEFAULTS scaleRows 8, scalesPerRow 16, overlap 0.5,
// curvature 1.5, scaleDepth 0.12):
//   rowPhase=t·8; row=floor; rowLocal=rowPhase−row; stagger=(row odd)?0.5·TAU/16:0; scaleTheta=theta+stagger;
//   scaleLocal=((scaleTheta·16)%TAU)/TAU; xDist=|scaleLocal−0.5|·2 (0 center → 1 θ-edge);
//   yDist=|rowLocal−overlap|/max(1−overlap·0.5,0.1)=|rowLocal−0.5|/0.75; distFromCenter=√(xDist²+yDist²).
//   scaleShape=1−max(1−dist,0.001)^curv ⇒ the radius has a C1 CREASE at dist=1 (max() clamp kicks in) = the
//   FLANK-TOE where the steep scale flank meets the flat valley floor. The θ-tile-boundary is xDist=1 ⇒ dist≥1,
//   coincident with the toe ONLY at yDist=0.
//
// TEST: dump the top-K worst-witness (perFaceTrue3DSag) BODY facets (ring-band bandMm 1.0 excluded, same as
// DS-THETAEDGE) → per facet compute centroid (u,t) [seam-aware], centroid distFromCenter/xDist/yDist, and the
// TOE-STRADDLE test (min vertex dist < 1 < max vertex dist ⇒ the dist=1 crease passes THROUGH the facet) + the
// TILE-STRADDLE test (does scaleLocal=0 pass through it — the ALREADY-embedded θ edge). Classify + report the
// scatter verdict. If the worst facets are NOT the flank toe, STOP — do not build the wrong edge (STEP 2).
//
// DEV-ONLY; research/ only; never edits src/. Reuses buildInhouseMetricMesh + perFaceTrue3DSag + labkit + the
// DS-TRUE3D/DS-THETAEDGE OFF config verbatim. Resumable: checkpointed ndjson.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
  dumpHeatmap,
} from './labkit';
import type { InhouseMeshOpts } from './labkit';
import {
  buildConformRuler, scoreBodyFacets, dragonRings, classifyRingBand, dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

const SIZE_RES = 192, HMIN_3D = 0.05, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 2_500_000, TOLMM = 0.01;
const SCALE_ROWS = 8, SCALES_PER_ROW = 16, OVERLAP = 0.5;
const TAU = 2 * Math.PI;

const OUT_DIR = join('research', 'exchange', '_dsFlankToe');
const NDJSON = join(OUT_DIR, 'worstFacets.ndjson');
const SUMMARY = join(OUT_DIR, 'summary.json');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(k: string): boolean {
  if (!existsSync(SUMMARY)) return false;
  try { return (JSON.parse(readFileSync(SUMMARY, 'utf8')) as { key?: string }).key === k; } catch { return false; }
}

/** Analytic scale-lattice distFromCenter (+ components) at a single (u,t). Matches rOuterDragonScales exactly. */
function scaleGeom(u: number, t: number): { dist: number; xDist: number; yDist: number; scaleLocal: number; rowLocal: number } {
  const theta = ((u % 1) + 1) % 1 * TAU;
  const rowPhase = t * SCALE_ROWS;
  const row = Math.floor(rowPhase);
  const rowLocal = rowPhase - row;
  const stagger = (Math.trunc(row) % 2 === 1) ? (0.5 * TAU / SCALES_PER_ROW) : 0;
  const scaleTheta = theta + stagger;
  const scalePhase = (((scaleTheta * SCALES_PER_ROW) % TAU) + TAU) % TAU;
  const scaleLocal = scalePhase / TAU;
  const xDist = Math.abs(scaleLocal - 0.5) * 2;
  const yDist = Math.abs(rowLocal - OVERLAP) / Math.max(1 - OVERLAP * 0.5, 0.1);
  return { dist: Math.sqrt(xDist * xDist + yDist * yDist), xDist, yDist, scaleLocal, rowLocal };
}

/**
 * STEP 2 — build the per-scale FLANK-TOE contour (distFromCenter=1) as constraint arcs.
 * Per row band k and per valley boundary u_v=(mV−s_k)/16 (mV=0..15), the two toe creases bounding the valley are the
 * two flank arcs u(rowLocal)=u_v ± (1−w)/32, w=√(1−yDist²), yDist=|rowLocal−0.5|/0.75 (they touch at u_v ONLY at
 * mid-row w=1, diverge to ±(1−0.745)/32 at the band edges — exactly where the straight θ-line at u_v MISSES the toe).
 * The two arcs meeting at each valley SHARE a single mid-row vertex M ⇒ a clean PSLG node (no edge crossing). Arcs run
 * the FULL band in t at the POT boundaries (rows 0/7 reach t≈0 / t≈1 — the rim, where the worst facets live) and are
 * ring-inset at interior band boundaries (t=k/8 risers = the separate tread class). REPLACES the straight θ-graph
 * (the toe arcs are the real feature edge; the straight valley line is only the toe at mid-row).
 */
function buildFlankToeGraph(nHalf: number, ringInsetMm: number, tEndEps: number): {
  injectedPoints: number[]; constraintEdges: number[]; arcs: number; midpts: number;
} {
  const injectedPoints: number[] = [];
  const constraintEdges: number[] = [];
  const insRL = (ringInsetMm / DS_H) * SCALE_ROWS;      // ring-band inset in rowLocal units
  const endRL = (tEndEps / DS_H) * SCALE_ROWS;          // pot-boundary inset in rowLocal units
  const uOf = (u: number): number => { const f = u - Math.floor(u); return f; };
  const wOf = (rowLocal: number): number => {
    const yDist = Math.abs(rowLocal - OVERLAP) / Math.max(1 - OVERLAP * 0.5, 0.1);
    return Math.sqrt(Math.max(0, 1 - yDist * yDist));
  };
  let arcs = 0, midpts = 0;
  for (let k = 0; k < SCALE_ROWS; k++) {
    const s_k = (k % 2 === 1) ? 0.5 : 0;
    const loRL = (k === 0) ? endRL : insRL;
    const hiRL = (k === SCALE_ROWS - 1) ? (1 - endRL) : (1 - insRL);
    // rowLocal sample ladders: lower [loRL,0.5), upper (0.5,hiRL], midpoint at 0.5.
    const lower: number[] = [], upper: number[] = [];
    for (let s = 0; s < nHalf; s++) {
      const fr = s / nHalf;                        // 0 .. <1
      lower.push(loRL + (0.5 - loRL) * fr);        // ascending toward 0.5 (excludes 0.5)
      upper.push(0.5 + (hiRL - 0.5) * ((s + 1) / nHalf)); // (0.5 .. hiRL]
    }
    for (let mV = 0; mV < SCALES_PER_ROW; mV++) {
      const u_v = uOf((mV - s_k) / SCALES_PER_ROW);
      const tMid = (k + 0.5) / SCALE_ROWS;
      const Mpos = injectedPoints.length / 2;
      injectedPoints.push(u_v, tMid);
      midpts++;
      for (const sign of [-1, 1] as const) {
        // one polyline: lower(ascending) → M → upper(ascending); u = u_v + sign*(1−w)/32
        let prev = -1;
        const emit = (rowLocal: number): number => {
          const w = wOf(rowLocal);
          const u = uOf(u_v + sign * (1 - w) / 32);
          const t = (k + rowLocal) / SCALE_ROWS;
          const pos = injectedPoints.length / 2;
          injectedPoints.push(u, t);
          if (prev >= 0) constraintEdges.push(prev, pos);
          prev = pos;
          return pos;
        };
        for (const rl of lower) emit(rl);
        if (prev >= 0) constraintEdges.push(prev, Mpos); // connect last lower → shared M
        prev = Mpos;
        for (const rl of upper) emit(rl);
        arcs++;
      }
    }
  }
  return { injectedPoints, constraintEdges, arcs, midpts };
}

function scoreMeshFull(
  arm: string, key: string, opts: InhouseMeshOpts, extraMeta: Record<string, unknown>,
): void {
  const rA = dsRadiusFn();
  const H = DS_H;
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, opts);
  const idx = mesh.indices, ut = mesh.ut;
  const lifted = liftUtToRadial(ut, rA, H);
  const xyz = lifted.vertices;
  const tris = idx.length / 3, verts = xyz.length / 3;
  plog(`[${arm}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}${mesh.constraint ? ` constraint{req=${mesh.constraint.requested} present=${mesh.constraint.alreadyPresent} recovered=${mesh.constraint.recovered} failed=${mesh.constraint.failed} subdivSplits=${mesh.constraint.subdivSplits ?? 0}}` : ''}`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);
  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
  const bodyAll: number[] = [];
  for (let f = 0; f < tris; f++) if (cls(f) === 'body') bodyAll.push(f);
  plog(`[${arm}] body facets=${bodyAll.length}; %<20=${q.pctBelow20.toFixed(2)} p5minAng=${q.p5MinAngleDeg.toFixed(2)} nonMan=${nonMan}`);

  // RADIAL screen
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
  const radialP99 = rSorted.length ? +rSorted[Math.floor(0.99 * rSorted.length)].toFixed(6) : 0;
  plog(`[${arm}][RADIAL] body p99=${radialP99} max=${rWorst.toFixed(6)} out=${rOut}/${bodyAll.length}`);

  // TRUE-3D composite (V11g verdict ruler)
  const loc = buildConformRuler(rA);
  const tS = Date.now();
  const bodyT3 = scoreBodyFacets(xyz as unknown as Float32Array, idx, bodyAll, loc, rA, TOL,
    (done, total) => { if (done % Math.max(1, Math.floor(total / 4)) === 0) plog(`  [${arm}][true3d] ${done}/${total}`); });
  plog(`[${arm}][TRUE-3D composite] p50=${bodyT3.p50} p90=${bodyT3.p90} p99=${bodyT3.p99} max=${bodyT3.maxMm} out=${bodyT3.outliers}/${bodyAll.length} in ${((Date.now() - tS) / 1000).toFixed(1)}s`);

  // WITNESS perFaceTrue3DSag on body subset
  const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
  let wWorst = 0, wOut = 0; const wDevs: number[] = [];
  for (const f of bodyAll) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
  const wSorted = Float64Array.from(wDevs).sort();
  const witP99 = wSorted.length ? +wSorted[Math.floor(0.99 * wSorted.length)].toFixed(6) : 0;
  plog(`[${arm}][WITNESS] body p99=${witP99} max=${wWorst.toFixed(6)} out=${wOut}/${bodyAll.length}`);

  const row = {
    key, arm, tris, verts, rounds: mesh.rounds, hitBudget: mesh.hitBudget,
    constraint: mesh.constraint ?? null,
    pctBelow20: +q.pctBelow20.toFixed(2), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2), nonMan,
    bodyFacets: bodyAll.length, radialP99, radialMax: +rWorst.toFixed(6),
    t3P50: bodyT3.p50, t3P90: bodyT3.p90, t3P99: bodyT3.p99, t3Max: bodyT3.maxMm, t3Out: bodyT3.outliers,
    witP99, witMax: +wWorst.toFixed(6), witOut: wOut, ...extraMeta,
  };
  appendFileSync(join(OUT_DIR, 'step2.ndjson'), JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${key}] ${JSON.stringify(row)}`);
  plog(`[${arm}] DONE`);
}

function step2KeyExists(k: string): boolean {
  const p = join(OUT_DIR, 'step2.ndjson');
  if (!existsSync(p)) return false;
  return readFileSync(p, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}

describe('DS flank-toe locus confirmation — are the worst body witness facets on distFromCenter=1?', () => {
  const baseOpts: InhouseMeshOpts = {
    tolMm: TOLMM, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints: MAX_POINTS, guardManifoldAlways: true,
  };
  const K = 200; // top-K worst body facets to scatter

  it.skipIf(process.env.PF_DSFLANKTOE !== '1')('STEP 1 — OFF baseline worst-locus scatter', () => {
    const key = 'DragonScales|OFF|flankToeLocus';
    if (keyExists(key)) { plog(`[skip] ${key} already recorded`); return; }
    const rA = dsRadiusFn();
    const H = DS_H;
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, H, baseOpts);
    const idx = mesh.indices, ut = mesh.ut;
    const lifted = liftUtToRadial(ut, rA, H);
    const xyz = lifted.vertices;
    const tris = idx.length / 3, verts = xyz.length / 3;
    plog(`[OFF] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
    const nonMan = auditNonManByIndex(xyz, idx);
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(xyz, idx, ringZs, 1.0);

    // witness: perFaceTrue3DSag (GN facet→analytic radial surface; DS not tangled ⇒ honest)
    const tW = Date.now();
    const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
    plog(`[OFF] perFaceTrue3DSag in ${((Date.now() - tW) / 1000).toFixed(1)}s; worstMm(all)=${sag.worstMm.toFixed(6)}`);

    // body facets + rank by witness faceErr
    const body: number[] = [];
    for (let f = 0; f < tris; f++) if (cls(f) === 'body') body.push(f);
    body.sort((a, b) => sag.faceErr[b] - sag.faceErr[a]);
    const worst = body.slice(0, K);
    plog(`[OFF] body facets=${body.length}; witness worst body=${sag.faceErr[body[0]].toFixed(6)}`);

    // ring z's for margin reporting
    const ringZsSorted = [...ringZs].sort((a, b) => a - b);
    const ringMarginMm = (zc: number): number => {
      let m = Infinity; for (const rz of ringZsSorted) m = Math.min(m, Math.abs(zc - rz)); return m;
    };

    let toeStraddleN = 0, tileStraddleN = 0, nearToeCentroidN = 0, ringLeakN = 0, otherN = 0;
    const distsCentroid: number[] = [];
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(NDJSON, ''); // fresh
    for (let r = 0; r < worst.length; r++) {
      const f = worst[r];
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      // seam-aware centroid (u,t) — mirror perFaceChordSag's wrap rule
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
      const uC = (ua + ub + uc) / 3, tC = (ta + tb + tc) / 3;
      const zC = tC * H;
      const gC = scaleGeom(uC, tC);
      const gA = scaleGeom(ua, ta), gB = scaleGeom(ub, tb), gCc = scaleGeom(uc, tc);
      const dMin = Math.min(gA.dist, gB.dist, gCc.dist), dMax = Math.max(gA.dist, gB.dist, gCc.dist);
      // toe-straddle: the dist=1 crease passes through the facet
      const toeStraddle = dMin < 1.0 && dMax > 1.0;
      // tile-straddle: scaleLocal=0 (the ALREADY-embedded straight θ edge) passes through the facet.
      // scaleLocal wraps [0,1); a facet across the valley boundary has one vertex near 0 and one near 1.
      const sMin = Math.min(gA.scaleLocal, gB.scaleLocal, gCc.scaleLocal), sMax = Math.max(gA.scaleLocal, gB.scaleLocal, gCc.scaleLocal);
      const tileStraddle = (sMin < 0.05 && sMax > 0.95) || (sMin < 0.5 && sMax > 0.5 && (sMax - sMin) < 0.5 && Math.min(sMin, 1 - sMax) < 0.03);
      const ringM = ringMarginMm(zC);
      distsCentroid.push(gC.dist);

      let klass: string;
      if (ringM <= 1.0) { klass = 'RING-LEAK'; ringLeakN++; }
      else if (toeStraddle) { klass = 'TOE-STRADDLE'; toeStraddleN++; }
      else if (Math.abs(gC.dist - 1) < 0.15) { klass = 'NEAR-TOE-CENTROID'; nearToeCentroidN++; }
      else { klass = 'OTHER'; otherN++; }
      if (tileStraddle) tileStraddleN++;

      appendFileSync(NDJSON, JSON.stringify({
        rank: r, face: f, witnessMm: +sag.faceErr[f].toFixed(6),
        uC: +uC.toFixed(5), tC: +tC.toFixed(5), zC: +zC.toFixed(3),
        distC: +gC.dist.toFixed(4), xDistC: +gC.xDist.toFixed(4), yDistC: +gC.yDist.toFixed(4),
        scaleLocalC: +gC.scaleLocal.toFixed(4), rowLocalC: +gC.rowLocal.toFixed(4),
        vDistMin: +dMin.toFixed(4), vDistMax: +dMax.toFixed(4),
        toeStraddle, tileStraddle, ringMarginMm: +ringM.toFixed(3), klass,
      }) + '\n');
    }
    distsCentroid.sort((x, y) => x - y);
    const med = distsCentroid[Math.floor(distsCentroid.length / 2)];

    const summary = {
      key, tris, verts, bodyFacets: body.length, nonMan,
      pctBelow20: +q.pctBelow20.toFixed(2), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2),
      witnessWorstBodyMm: +sag.faceErr[body[0]].toFixed(6), witnessWorstAllMm: +sag.worstMm.toFixed(6),
      K: worst.length,
      toeStraddleN, nearToeCentroidN, tileStraddleN, ringLeakN, otherN,
      toeOrNearFrac: +((toeStraddleN + nearToeCentroidN) / worst.length).toFixed(3),
      centroidDistMedian: +med.toFixed(4),
      centroidDistMin: +distsCentroid[0].toFixed(4), centroidDistMax: +distsCentroid[distsCentroid.length - 1].toFixed(4),
    };
    writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
    plog(`[OFF] SUMMARY ${JSON.stringify(summary)}`);
  }, 6_000_000);

  const baseOptsFull: InhouseMeshOpts = {
    tolMm: TOLMM, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints: MAX_POINTS, guardManifoldAlways: true,
  };

  it.skipIf(process.env.PF_DSFLANKTOE !== '1')('STEP 2 OFF-full — same-run A/B composite+witness baseline', () => {
    const key = 'DragonScales|OFF|full';
    if (step2KeyExists(key)) { plog(`[skip] ${key} already recorded`); return; }
    scoreMeshFull('OFF-full', key, baseOptsFull, {});
  }, 6_000_000);

  it.skipIf(process.env.PF_DSFLANKTOE !== '1')('STEP 2 ON — flank-toe contour embedded (REPLACE θ-graph)', () => {
    const key = 'DragonScales|ON|flankToe';
    if (step2KeyExists(key)) { plog(`[skip] ${key} already recorded`); return; }
    const g = buildFlankToeGraph(14, 1.3, 0.04); // 14 samples/half, 1.3mm ring inset, 0.04mm pot-boundary inset
    plog(`[ON] flank-toe graph: ${g.arcs} arcs, ${g.midpts} shared midpts, ${g.injectedPoints.length / 2} injected pts, ${g.constraintEdges.length / 2} constraint edges`);
    scoreMeshFull('ON', key, {
      ...baseOptsFull,
      injectedPoints: g.injectedPoints,
      constraintEdges: g.constraintEdges,
      pinInjected: true,
      recoverySubdivideCollinear: true,
    }, { arcs: g.arcs, midpts: g.midpts, injectedPts: g.injectedPoints.length / 2, requestedEdges: g.constraintEdges.length / 2 });
  }, 6_000_000);

  // Cheap VISUAL evidence (true-3D heatmap, fast witness — NOT the 20-min composite). Shows whether the flank WALLS
  // stay red despite the embedded dist=1 toe contour (⇒ contour insufficient, wall-strip meshing needed).
  it.skipIf(process.env.PF_DSFLANKTOE_RENDER !== '1')('RENDER — OFF vs ON flank-toe true-3D heatmap bins', () => {
    const rA = dsRadiusFn(); const H = DS_H;
    const g = buildFlankToeGraph(14, 1.3, 0.04);
    const arms: Array<[string, InhouseMeshOpts]> = [
      ['dsOFF', baseOptsFull],
      ['dsONflankToe', { ...baseOptsFull, injectedPoints: g.injectedPoints, constraintEdges: g.constraintEdges, pinInjected: true, recoverySubdivideCollinear: true }],
    ];
    for (const [name, opts] of arms) {
      const mesh = buildInhouseMetricMesh(rA, H, opts);
      const xyz = liftUtToRadial(mesh.ut, rA, H).vertices;
      const sag = dumpHeatmap(OUT_DIR, name, xyz, mesh.ut, mesh.indices, rA, H, { scaleMm: 0.15, preFilterMm: 0.01, stl: false, meta: { arm: name } });
      plog(`[RENDER ${name}] tris=${mesh.indices.length / 3} heatmap worst=${sag.worstMm.toFixed(4)} p99>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)}%`);
    }
  }, 6_000_000);
});
