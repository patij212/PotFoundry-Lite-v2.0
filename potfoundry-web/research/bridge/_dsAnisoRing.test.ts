// _dsAnisoRing.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/). E-2026-07-14-DS-ANISO-RING.
//
// THE DECISIVE ACHIEVABILITY EXPERIMENT for DragonScales continuous exact-perp worst-case (MAX/Hausdorff) ≤ 0.01.
// Prior finding E-2026-07-14-DS-PERP-MAX (8af880ac): DS FAILS MAX≤0.01 with the ISOTROPIC density paradigm —
// two real failing classes: RINGS (t=k/8 row boundaries, composite MAX 0.251) + BODY flanks (mid-row scale apex,
// exact-perp MAX 0.0675 @3.26M, isotropic PLATEAUS ~0.02-0.04 with %<20°=14, sliver trap on the near-vertical flank).
//
// This probe tests THE RECIPE (both parts), and answers: is MAX≤0.01 ACHIEVABLE at all, at what tri cost — or a floor?
//   UNIT RING (PF_DSANISO_RING=1): the rings are a genuine STEP (confirmed analytically: jump 0.88-1.21mm stable as
//     eps->0, yDist continuous => pure azimuthal stagger flip). A single-valued (u,t) mesh CANNOT represent a step.
//     Build the SHARP3D DOUBLED-RINGS structured wall (buildStructuredWall: two rows at each z=k/8, one-sided radii
//     below/above => the connecting TREAD is a first-class tessellated strip). Score ring-band + body with the V11g
//     certified composite ruler (buildConformRuler) under MAX (not p99). Does ring-band MAX collapse to <=0.01?
//   UNIT BODY (PF_DSANISO_BODY=1): the isotropic buildInhouseMetricMesh sizes with a SCALAR h3D (+1 global anisotropy
//     scalar) => isotropic-on-surface => sliver-traps on the near-vertical flank. Test the ANISOTROPIC crease-aligned
//     mesher (buildCreaseAlignedMesh + onDemand creaseMetricAt: fine ACROSS the flank / coarse ALONG it, chord<=tol by
//     construction). Body-only (ring-band excluded) exact-perp MAX (perFaceTrue3DSag + composite) + slivers (iso AND
//     metric min-angle) + nonMan. Does anisotropy break the isotropic plateau to <=0.01 without the sliver trap?
//
// Reuses READ-ONLY: _ds_prodtruth_lib (V11g composite ruler + dsRadiusFn + dragonRings + classifyRingBand +
// scoreBodyFacets/scoreRingBandFacets), _sharp3dMesh (buildStructuredWall/evenThetas), creaseAlignedMesh
// (buildCreaseAlignedMesh/metricMinAngleDeg), onDemandMetric (creaseMetricAt), buildInhouseMetricMesh (iso control),
// labkit (perFaceTrue3DSag/triangleQualityDistribution/auditNonManByIndex). NO src/ edit, NO flag, NO commit.
import { describe, it } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  perFaceTrue3DSag, triangleQualityDistribution, auditNonManByIndex, buildInhouseMetricMesh,
} from './labkit';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';
import { buildCreaseAlignedMesh, metricMinAngleDeg } from './creaseAlignedMesh';
import { creaseMetricAt } from './onDemandMetric';
import {
  DIMS, H, TOL, dsRadiusFn, dragonRings, buildConformRuler, classifyRingBand,
  scoreBodyFacets, scoreRingBandFacets,
} from './_ds_prodtruth_lib';

const TAU = 2 * Math.PI;
const OUT = join('research', 'exchange', '_dsAnisoRing');
const NDJSON = join(OUT, 'result.ndjson');
const plog = (m: string): void => {
  mkdirSync(OUT, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
};
const cp = (row: Record<string, unknown>): void => {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key}] ${JSON.stringify(row)}`);
};
const keyDone = (k: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
};

// dense-ish barycentric percentiles helper for exact-perp over a facet subset
function pct(a: Float64Array, q: number): number { return a.length ? +a[Math.min(a.length - 1, Math.floor(q * a.length))].toFixed(6) : 0; }

/** lift (u,t) mesh to xyz for triangleQualityDistribution / audit. */
function liftXYZ(ut: number[], rA: (th: number, z: number) => number): Float64Array {
  const nV = ut.length / 2, p = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); p[3 * i] = r * Math.cos(th); p[3 * i + 1] = r * Math.sin(th); p[3 * i + 2] = z; }
  return p;
}

/** Body / ring-band split of facet indices by centroid z vs ring z's. */
function splitFacets(ut: number[], idx: ArrayLike<number>, xyz: Float64Array, ringZs: number[], bandMm: number): { body: number[]; ring: number[] } {
  const cls = classifyRingBand(xyz, idx as Uint32Array, ringZs, bandMm);
  const nF = idx.length / 3; const body: number[] = []; const ring: number[] = [];
  for (let f = 0; f < nF; f++) (cls(f) === 'ringBand' ? ring : body).push(f);
  return { body, ring };
}

describe('E-2026-07-14-DS-ANISO-RING', () => {
  // ── UNIT RING: SHARP3D doubled-rings — does embedding the step collapse the ring MAX to <=0.01? ──
  it.skipIf(process.env.PF_DSANISO_RING !== '1')('RINGS: doubled-rings structured wall, composite MAX', () => {
    const KEY = 'ring:doubled';
    if (keyDone(KEY)) { plog(`${KEY} already done — skip`); return; }
    const rA = dsRadiusFn();
    const rings = dragonRings(); // t=k/8, k=1..7
    const nTh = Number(process.env.PF_RING_NTH ?? 768);
    const nZperBand = Number(process.env.PF_RING_NZB ?? 40);
    const epsZ = 0.001; // one-sided radius offset (mm); jump stable to 6 s.f. by eps=1e-5 (dsRingChar)
    plog(`RING build: nTh=${nTh} nZperBand=${nZperBand} epsZ=${epsZ}`);

    // Build z-ordered rows: 8 bands of interior sheet rows + doubled ring pairs at each internal boundary.
    type R = RowSpec & { order: number };
    const rows: R[] = [];
    const thetas = evenThetas(nTh);
    rows.push({ z: 0, rz: 0, thetas, kind: 'sheet', order: 0 });
    for (let k = 0; k < 8; k++) {
      for (let j = 1; j < nZperBand; j++) {
        const z = ((k + j / nZperBand) / 8) * H;
        rows.push({ z, rz: z, thetas, kind: 'sheet', order: 0 });
      }
    }
    for (let k = 1; k < 8; k++) {
      const z = (k / 8) * H;
      rows.push({ z, rz: z - epsZ, thetas, kind: 'ringBelow', order: 0 }); // band k-1 limit
      rows.push({ z, rz: z + epsZ, thetas, kind: 'ringAbove', order: 1 }); // band k limit
    }
    rows.push({ z: H, rz: H, thetas, kind: 'sheet', order: 0 });
    // sort by z, then ringBelow(order0) before ringAbove(order1) at equal z
    rows.sort((a, b) => (a.z - b.z) || (a.order - b.order));
    const mesh = buildStructuredWall(rA, H, rows);
    plog(`RING mesh: nV=${mesh.nV} nF=${mesh.nF}`);

    // Score with V11g certified composite ruler (min sheet-twin + riser wall).
    const ruler = buildConformRuler(rA);
    const ringZs = rings.map((r) => r.z);
    const { body, ring } = splitFacets(mesh.ut, mesh.idx, mesh.xyz as Float64Array, ringZs, 1.0);
    plog(`RING facets: body=${body.length} ring=${ring.length} — scoring ring-band (no prefilter)...`);
    const ringStat = scoreRingBandFacets(mesh.xyz as unknown as Float32Array, mesh.idx, ring, ruler, TOL,
      (d, t) => { if (d % Math.max(1, Math.floor(t / 4)) === 0) plog(`  ring ${d}/${t}`); });
    plog(`RING ring-band: max=${ringStat.maxMm} p99=${ringStat.p99} out=${ringStat.outliers}/${ring.length}`);
    plog(`RING scoring body (composite, prefiltered)...`);
    const bodyStat = scoreBodyFacets(mesh.xyz as unknown as Float32Array, mesh.idx, body, ruler, rA, TOL,
      (d, t) => { if (d % Math.max(1, Math.floor(t / 4)) === 0) plog(`  body ${d}/${t}`); });
    plog(`RING body: max=${bodyStat.maxMm} p99=${bodyStat.p99} out=${bodyStat.outliers}/${body.length}`);

    // slivers + watertight
    const xyzF = mesh.xyz as Float64Array;
    const tq = triangleQualityDistribution({ vertices: xyzF, indices: mesh.idx });
    const nonMan = auditNonManByIndex(xyzF, mesh.idx);
    cp({
      key: KEY, mesh: 'doubled-rings', nTh, nZperBand, tris: mesh.nF, verts: mesh.nV,
      ringBand_max: ringStat.maxMm, ringBand_p99: ringStat.p99, ringBand_out: ringStat.outliers, ringBand_n: ring.length,
      body_max: bodyStat.maxMm, body_p99: bodyStat.p99, body_out: bodyStat.outliers, body_n: body.length,
      pctBelow20: tq.pctBelow20, minAngle: tq.minAngleDeg, p5MinAngle: tq.p5MinAngleDeg, nonMan,
    });
  }, 6_000_000);

  // ── UNIT RINGDIAG: disaggregate the ring-band — is the doubled TREAD strip itself green (step SOLVED),
  //    leaving the near-ring residual as the same BODY-flank class? ──
  it.skipIf(process.env.PF_DSANISO_RINGDIAG !== '1')('RINGDIAG: tread strip vs near-ring sheet', () => {
    const rA = dsRadiusFn();
    const rings = dragonRings();
    const ringZs = rings.map((r) => r.z);
    const nTh = Number(process.env.PF_RING_NTH ?? 768);
    const nZperBand = Number(process.env.PF_RING_NZB ?? 40);
    const KEY = `ringdiag:nTh${nTh}:nZB${nZperBand}`;
    if (keyDone(KEY)) { plog(`${KEY} already done — skip`); return; }
    const epsZ = 0.001;
    const thetas = evenThetas(nTh);
    type R = RowSpec & { order: number };
    const rows: R[] = [];
    rows.push({ z: 0, rz: 0, thetas, kind: 'sheet', order: 0 });
    for (let k = 0; k < 8; k++) for (let j = 1; j < nZperBand; j++) { const z = ((k + j / nZperBand) / 8) * H; rows.push({ z, rz: z, thetas, kind: 'sheet', order: 0 }); }
    for (let k = 1; k < 8; k++) { const z = (k / 8) * H; rows.push({ z, rz: z - epsZ, thetas, kind: 'ringBelow', order: 0 }); rows.push({ z, rz: z + epsZ, thetas, kind: 'ringAbove', order: 1 }); }
    rows.push({ z: H, rz: H, thetas, kind: 'sheet', order: 0 });
    rows.sort((a, b) => (a.z - b.z) || (a.order - b.order));
    const mesh = buildStructuredWall(rA, H, rows);
    const ruler = buildConformRuler(rA);
    const xyzF = mesh.xyz as Float64Array;
    // TREAD facet = all 3 verts at a ring z (centroid within 0.02mm of some ring z). Near-ring = in 1mm band, not tread.
    const nearRing = (z: number, tol: number): boolean => ringZs.some((rz) => Math.abs(z - rz) <= tol);
    const tread: number[] = []; const nearSheet: number[] = [];
    for (let f = 0; f < mesh.nF; f++) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const zc = (xyzF[3 * a + 2] + xyzF[3 * b + 2] + xyzF[3 * c + 2]) / 3;
      if (nearRing(zc, 0.02)) tread.push(f);
      else if (nearRing(zc, 1.0)) nearSheet.push(f);
    }
    plog(`RINGDIAG: tread=${tread.length} nearSheet=${nearSheet.length}`);
    const treadStat = scoreRingBandFacets(xyzF as unknown as Float32Array, mesh.idx, tread, ruler, TOL);
    plog(`RINGDIAG tread: max=${treadStat.maxMm} p99=${treadStat.p99} out=${treadStat.outliers}/${tread.length}`);
    const nearStat = scoreRingBandFacets(xyzF as unknown as Float32Array, mesh.idx, nearSheet, ruler, TOL);
    plog(`RINGDIAG nearSheet: max=${nearStat.maxMm} p99=${nearStat.p99} out=${nearStat.outliers}/${nearSheet.length}`);
    cp({
      key: KEY, nTh, nZperBand, tris: mesh.nF,
      tread_max: treadStat.maxMm, tread_p99: treadStat.p99, tread_out: treadStat.outliers, tread_n: tread.length,
      nearSheet_max: nearStat.maxMm, nearSheet_p99: nearStat.p99, nearSheet_out: nearStat.outliers, nearSheet_n: nearSheet.length,
    });
  }, 6_000_000);

  // ── UNIT BODY: anisotropic crease-aligned mesher vs the isotropic plateau ──
  it.skipIf(process.env.PF_DSANISO_BODY !== '1')('BODY: anisotropic crease-aligned mesh breaks the isotropic plateau?', () => {
    const rA = dsRadiusFn();
    const ringZs = dragonRings().map((r) => r.z);
    const ruler = buildConformRuler(rA);
    const tol = Number(process.env.PF_BODY_TOL ?? 0.008);
    const hMin = Number(process.env.PF_BODY_HMIN ?? 0.02);
    const hMax = Number(process.env.PF_BODY_HMAX ?? 8);
    const maxPoints = Number(process.env.PF_BODY_MAXPTS ?? 2_000_000);
    const fdStep = Number(process.env.PF_BODY_FDSTEP ?? 1e-3);
    const splitThresh = Number(process.env.PF_BODY_SPLIT ?? 1.5);
    const mode = process.env.PF_BODY_MODE ?? 'aniso'; // 'aniso' | 'iso' (control)
    const KEY = `body:${mode}:tol${tol}:hMin${hMin}:fd${fdStep}:split${splitThresh}:pts${maxPoints}`;
    if (keyDone(KEY)) { plog(`${KEY} already done — skip`); return; }
    plog(`BODY build mode=${mode} tol=${tol} hMin=${hMin} hMax=${hMax} fdStep=${fdStep} split=${splitThresh} maxPts=${maxPoints}`);

    let ut: number[]; let idx: Uint32Array; let rounds = 0; let hitBudget = false;
    let metricAt: ((u: number, t: number) => [number, number, number]) | undefined;
    if (mode === 'aniso') {
      metricAt = (u, t) => creaseMetricAt(rA, H, u, t, { tolMm: tol, hMin, hMax, fdStep });
      const m = buildCreaseAlignedMesh(rA, H, { tolMm: tol, hMin, hMax, maxPoints, sizeRes: 192, splitThresh, metricFn: metricAt });
      ut = m.ut; idx = m.indices; rounds = m.rounds; hitBudget = m.hitBudget;
    } else {
      const m = buildInhouseMetricMesh(rA, H, {
        tolMm: tol, hMin, hMax, sizeRes: 192, gradeBeta: 0.2, maxPoints,
        curvatureFineStep: 0.0015, guardManifoldAlways: true, chordTolMm: tol,
      });
      ut = m.ut; idx = m.indices as Uint32Array; rounds = (m as { rounds?: number }).rounds ?? 0; hitBudget = (m as { hitBudget?: boolean }).hitBudget ?? false;
    }
    const nF = idx.length / 3;
    plog(`BODY mesh: verts=${ut.length / 2} tris=${nF} rounds=${rounds} hitBudget=${hitBudget}`);

    const xyz = liftXYZ(ut, rA);
    const { body, ring } = splitFacets(ut, idx, xyz, ringZs, 1.0);
    plog(`BODY facets: body=${body.length} ring=${ring.length}`);

    // Faithful body exact-perp (perFaceTrue3DSag — facet->nearest surface; DS riser => GN honest, conservative).
    const perp = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.003 });
    const bodyPerp = Float64Array.from(body.map((f) => perp.faceErr[f])).sort();
    const perpMax = bodyPerp.length ? +bodyPerp[bodyPerp.length - 1].toFixed(6) : 0;
    const perpP99 = pct(bodyPerp, 0.99);
    let perpOut = 0; for (const d of bodyPerp) if (d > TOL) perpOut++;
    plog(`BODY exact-perp(true3d): max=${perpMax} p99=${perpP99} out=${perpOut}/${body.length}`);

    // Certified composite body (the campaign acceptance ruler).
    const comp = scoreBodyFacets(xyz as unknown as Float32Array, idx, body, ruler, rA, TOL,
      (d, t) => { if (d % Math.max(1, Math.floor(t / 4)) === 0) plog(`  comp ${d}/${t}`); });
    plog(`BODY composite: max=${comp.maxMm} p99=${comp.p99} out=${comp.outliers}/${body.length} green=${comp.greenProvenFrac}`);

    // Slivers: isotropic 3D min-angle AND (for aniso) metric min-angle.
    const tq = triangleQualityDistribution({ vertices: xyz, indices: idx });
    let metricPctBelow20 = -1, metricMinAng = -1;
    if (metricAt) {
      let below = 0, mn = 180; const N = nF;
      for (let f = 0; f < N; f++) { const ang = metricMinAngleDeg(ut, idx[3 * f], idx[3 * f + 1], idx[3 * f + 2], metricAt); if (ang < 20) below++; if (ang < mn) mn = ang; }
      metricPctBelow20 = +(100 * below / N).toFixed(1); metricMinAng = +mn.toFixed(1);
    }
    const nonMan = auditNonManByIndex(xyz, idx);
    cp({
      key: KEY, mode, tol, hMin, hMax, maxPoints, tris: nF, verts: ut.length / 2, rounds, hitBudget,
      body_perp_max: perpMax, body_perp_p99: perpP99, body_perp_out: perpOut,
      body_comp_max: comp.maxMm, body_comp_p99: comp.p99, body_comp_out: comp.outliers,
      body_n: body.length, ring_n: ring.length,
      iso_pctBelow20: tq.pctBelow20, iso_minAngle: tq.minAngleDeg, iso_p5MinAngle: tq.p5MinAngleDeg,
      metric_pctBelow20: metricPctBelow20, metric_minAngle: metricMinAng, nonMan,
    });
  }, 6_000_000);
});
