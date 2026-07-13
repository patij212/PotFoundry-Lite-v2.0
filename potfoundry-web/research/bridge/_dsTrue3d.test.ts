// _dsTrue3d.test.ts — E-2026-07-13-DS-TRUE3D (PF_DSTRUE3D=1).
//
// QUESTION (measured): the E-2026-07-13-DS-CHORDGUARD refutation scored the DS M=g/h² OFF-baseline BODY under the
// RADIAL ruler (`radialBoundAt` = |hypot(x,y) − rA(atan2,z)| — the same-(u,t) chord) and found body p99 0.0282 /
// bodyMax 1.128 with a DENSITY-INVARIANT 1.13 tail. The LAB-CHEATSHEET gotcha: the RADIAL ruler OVERSTATES
// near-vertical relief 2–27×; DS scale-edges ARE near-vertical C0 risers (the EXCLUDE-risers class where "true-3D
// already CAD-grade; radial overstates"). So the "0.028 residual / 1.13 tail" may be a RULER ARTIFACT.
//
// RE-SCORE the SAME OFF-baseline mesh under the CORRECT TRUE-3D ruler:
//   • PRIMARY = the V11g-CERTIFIED composite locator (`buildConformRuler` → RefLocator.dist = nearest 3D
//     point-to-MESH distance to radial-sheet-twin ∪ riser-wall; passed the full 1a–1d metrologist battery,
//     E-2026-07-08-DS-CONFORMING-RULER). `scoreBodyFacets` uses `radialBoundAt` ONLY as a SOUND upper-bound
//     prefilter (green-proven ⇒ genuinely ≤0.7·tol) and falls to true-3D `loc.dist` for everything above margin —
//     so its p99/max ARE the true-3D body fidelity. This is the honest 0.01 acceptance ruler for DS.
//   • WITNESS  = `perFaceTrue3DSag` (labkit; facet→nearest analytic radial surface via GN) on the BODY subset — an
//     independent true-3D number. DS is a riser style, NOT a tangled lattice, so single-seed GN ≡ brute here.
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   ARTIFACT-DONE iff true-3D body p99 ≤ 0.01 AND the max tail collapses from ~1.1 to a ruler-honest value (≤ ~0.05)
//     → the DS body residual is a RADIAL-RULER ARTIFACT; the only genuine DS residual is the sliver tail (which the
//     chord guard worsens). Verdict: ACCEPT+DOCUMENT (DS body DONE).
//   REAL-NEEDS-FEATURE-EDGE iff true-3D body p99 still > 0.01 → residual is real; name the loci (scale-edge risers)
//     for a feature-conforming EDGE embedding (buildFeatureConformingMeshB constraintEdges, ring-riser mechanism).
//
// DEV-ONLY; research/ only; never edits src/. Reuses the EXACT MSURF-INHOUSE / DS-CHORDGUARD-OFF build settings so the
// mesh is byte-identical to the recorded baseline. Resumable: checkpoints the instant each score is computed.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
} from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreBodyFacets, dsRadiusFn, radialBoundAt,
  DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

// EXACT E-2026-07-13-MSURF-INHOUSE / DS-CHORDGUARD-OFF settings (fair identity: same mesh as the 0.0282 baseline).
const SIZE_RES = 192, HMIN_3D = 0.05, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 2_500_000;
const TOLMM = 0.01;

const OUT_DIR = join('research', 'exchange', '_dsTrue3d');
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

describe('DS body TRUE-3D re-score (radial-ruler artifact or real feature-edge residual?)', () => {
  it.skipIf(process.env.PF_DSTRUE3D !== '1')('DragonScales OFF-baseline body: radial vs true-3D composite', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const key = 'DragonScales|OFF|true3d|0.01';
    if (keyExists(key)) { plog(`[skip] ${key} already recorded`); return; }
    const rA = dsRadiusFn();
    const H = DS_H;

    // 1) Rebuild the EXACT OFF-baseline M-kernel mesh (identity check via tris == 717196 expected).
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, H, {
      tolMm: TOLMM, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
      maxPoints: MAX_POINTS, guardManifoldAlways: true,
    });
    const idx = mesh.indices;
    const lifted = liftUtToRadial(mesh.ut, rA, H);
    const xyz = lifted.vertices;
    const tris = idx.length / 3, verts = xyz.length / 3;
    plog(`meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget} (baseline expects 717196 tris)`);

    const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
    const nonMan = auditNonManByIndex(xyz, idx);

    // 2) Classify body vs ring-band (bandMm 1.0 — SAME as DS-CHORDGUARD).
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
    const bodyAll: number[] = [];
    for (let f = 0; f < tris; f++) if (cls(f) === 'body') bodyAll.push(f);
    plog(`body facets=${bodyAll.length} (ring-band excluded)`);

    // 3a) RADIAL body score — reproduce the DS-CHORDGUARD baseline (identity witness; expect p99≈0.0282 max≈1.128).
    const tR = Date.now();
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
    plog(`[RADIAL] body p50=${radialP50} p99=${radialP99} max=${radialMax} out=${rOut}/${bodyAll.length} in ${((Date.now() - tR) / 1000).toFixed(1)}s`);

    // 3b) TRUE-3D body score — V11g-certified composite locator (radial-sheet twin ∪ riser-wall), point-to-mesh.
    const tL = Date.now();
    const loc = buildConformRuler(rA);
    plog(`built V11g composite ruler in ${((Date.now() - tL) / 1000).toFixed(1)}s`);
    const tS = Date.now();
    const bodyT3 = scoreBodyFacets(xyz, idx, bodyAll, loc, rA, TOL,
      (done, total) => { if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`  [true3d] ${done}/${total}`); });
    plog(`[TRUE-3D composite] body p50=${bodyT3.p50} p90=${bodyT3.p90} p99=${bodyT3.p99} max=${bodyT3.maxMm} out=${bodyT3.outliers}/${bodyAll.length} greenProven=${bodyT3.greenProvenFrac} in ${((Date.now() - tS) / 1000).toFixed(1)}s`);

    // 3c) WITNESS: perFaceTrue3DSag on the BODY subset (GN facet→analytic radial surface; DS not tangled ⇒ honest).
    const tW = Date.now();
    const sag = perFaceTrue3DSag(mesh.ut, idx, rA, H, { preFilterMm: 0.01 });
    const wDevs: number[] = []; let wWorst = 0, wOut = 0;
    for (const f of bodyAll) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
    const wSorted = Float64Array.from(wDevs).sort();
    const witP50 = pctFrom(wSorted, 0.5), witP99 = pctFrom(wSorted, 0.99), witMax = +wWorst.toFixed(6);
    plog(`[WITNESS perFaceTrue3DSag] body p50=${witP50} p99=${witP99} max=${witMax} out=${wOut}/${bodyAll.length} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

    checkpoint({
      key, style: 'DragonScales', arm: 'OFF', tol: 0.01, tris, verts,
      rounds: mesh.rounds, hitBudget: mesh.hitBudget,
      minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(3),
      pctBelow20: +q.pctBelow20.toFixed(2), nonMan, bodyFacets: bodyAll.length,
      // RADIAL (baseline reproduction)
      radialP50, radialP99, radialMax, radialOut: rOut,
      // TRUE-3D composite (certified V11g ruler)
      t3P50: bodyT3.p50, t3P90: bodyT3.p90, t3P99: bodyT3.p99, t3Max: bodyT3.maxMm, t3Out: bodyT3.outliers,
      t3GreenProvenFrac: bodyT3.greenProvenFrac,
      // WITNESS (perFaceTrue3DSag GN)
      witP50, witP99, witMax, witOut: wOut,
    });
    plog('DONE — DS body radial vs true-3D checkpointed');
  }, 6_000_000);
});
