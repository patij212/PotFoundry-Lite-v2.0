// _dsChordGuard.test.ts — E-2026-07-13-DS-CHORDGUARD (PF_DSCHORD=1).
//
// QUESTION (measured): does turning the DIRECT facet→surface chord-sag guard (`chordTolMm`, already exposed by
// buildInhouseMetricMesh — OFF in E-2026-07-13-MSURF-INHOUSE) ON close the DragonScales BODY fidelity residual that
// the M=g/h² κ_max sizing leaves open? Registry baseline (E-2026-07-13-MSURF-INHOUSE, guarded, tol0.01):
//   DS body p99 0.02818, bodyMax 1.128, bodyOut 81644/500374, tris 717196, %<20° 3.1%, nonMan 0.
// The M-tensor's κ_max CHORD sizing h₃D=√(8·tol/κ) UNDER-resolves the DS θ-periodic near-vertical SCALE-edge relief
// (a directional feature), so the body p99 sits at 0.028 (>TOL 0.01) with a 1.13 bodyMax tail.
//
// KEY ALIGNMENT: the mesher's chordSag uses the SAME radial lift (liftP = rA(θ,z)) that the body ruler
// (radialBoundAt, dense-45) measures against ⇒ chordTolMm=0.01 targets EXACTLY the body-ruler residual. So this is a
// clean, direct test of "is the body residual a SIZING gap (chord guard closes it) or a feature-EDGE / C0-step class
// (chord splitting cannot converge → needs a conforming edge)?".
//
// ARMS (all tol0.01, guardManifoldAlways=true, matched msurf settings SIZE_RES 192 / hMin0.05 / hMax8 / gradeBeta0.2,
//       MAX_POINTS 2.5M = SAME budget as the baseline for a fair A/B):
//   • off      — recorded baseline (no arm run; the registry row above is the control).
//   • ctol     — chordTolMm=0.01, default 4-pt sag detect, longest-edge split.
//   • ctolDense— chordTolMm=0.01, chordSampleN=8 (dense-45 sag detect = the acceptance ruler's basis), longest-edge.
//   • ctolStein— chordTolMm=0.01, chordSampleN=8, chordSteiner=true (Steiner at worst-sag; converges interior bulges
//                a longest-edge split cannot).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   DIRECTIONAL-GUARD-CLOSES iff any chord arm drives DS BODY p99 ≤ 0.01 AND bodyMax closes the 1.13 tail (≤ ~0.05)
//   WITHOUT regressing slivers (%<20° stays ≤ ~3.5%) or watertight (nonMan stays 0), within the 2.5M-vert budget
//   (hitBudget=false — if it must exceed budget to close, that is a density-cost finding not a clean close).
//   REFUTED (feature-EDGE class) iff every chord arm either hits budget with body p99 still >0.01 OR floors body p99
//   above 0.01 at budget → the scale-edge relief is a C0 discontinuity needing a conforming EDGE, not sizing.
//
// DEV-ONLY; research/ only; never edits src/. Resumable: each arm checkpointed the instant computed; skip-if-recorded.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, nonManRawBig, liftUtToRadial,
} from './labkit';
import type { InhouseMeshOpts } from './inhouseMetricMesh';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreRingBandFacets, dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

const SIZE_RES = 192, HMIN_3D = 0.05, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 2_500_000;        // SAME budget as the E-2026-07-13-MSURF-INHOUSE baseline (fair A/B)
const TOLMM = 0.01;                  // both the metric chord target AND the chord-guard target
const CTOL = 0.01;                   // chordTolMm target = body ruler TOL

const OUT_DIR = join('research', 'exchange', '_dsChordGuard');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');

interface Arm { tag: string; extra: Partial<InhouseMeshOpts>; }
const ARMS: Arm[] = [
  { tag: 'ctol', extra: { chordTolMm: CTOL } },
  { tag: 'ctolDense', extra: { chordTolMm: CTOL, chordSampleN: 8 } },
  { tag: 'ctolStein', extra: { chordTolMm: CTOL, chordSampleN: 8, chordSteiner: true } },
];
const SELECT = (process.env.PF_DSCHORD_ARMS ?? 'ctol,ctolDense,ctolStein').split(',');

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

describe('DS chord-sag guard (chordTolMm) ON — closes body fidelity or reveals feature-edge class?', () => {
  it.skipIf(process.env.PF_DSCHORD !== '1')('DragonScales tol0.01 chord-guard arms', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const rA = dsRadiusFn();
    const H = DS_H;
    const t0r = Date.now();
    const dsLoc = buildConformRuler(rA);
    const ringZs = dragonRings().map((r) => r.z);
    plog(`built DS composite ruler in ${((Date.now() - t0r) / 1000).toFixed(1)}s`);

    for (const arm of ARMS) {
      if (!SELECT.includes(arm.tag)) continue;
      const key = `DragonScales|${arm.tag}|0.01`;
      if (keyExists(key)) { plog(`[skip] ${key} already recorded`); continue; }
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, {
        tolMm: TOLMM, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
        maxPoints: MAX_POINTS, guardManifoldAlways: true, ...arm.extra,
      });
      const meshMs = Date.now() - t0;
      const idx = mesh.indices;
      const lifted = liftUtToRadial(mesh.ut, rA, H);
      const xyz = lifted.vertices;
      const tris = idx.length / 3, verts = xyz.length / 3;
      plog(`[${arm.tag}] meshed ${tris} tris / ${verts} verts in ${(meshMs / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}`);

      const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
      // auditNonManByIndex Map-based → dies ~5.6M tris; use the raw-big scan above that.
      const nonMan = tris <= 5_000_000 ? auditNonManByIndex(xyz, idx) : nonManRawBig(idx);

      const row: Record<string, unknown> = {
        key, style: 'DragonScales', arm: arm.tag, tol: 0.01, tris, verts, meshMs,
        rounds: mesh.rounds, hitBudget: mesh.hitBudget,
        minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(3),
        medianMinAngleDeg: +q.medianMinAngleDeg.toFixed(2),
        pctBelow20: +q.pctBelow20.toFixed(2), pctBelow30: +q.pctBelow30.toFixed(2),
        degenerate: q.degenerateCount, nonMan,
      };

      // BODY / RING fidelity — SAME rulers as E-2026-07-13-MSURF-INHOUSE (body = radialBoundAt dense-45; ring = BVH).
      const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
      const bodyAll: number[] = [], ring: number[] = [];
      for (let f = 0; f < tris; f++) (cls(f) === 'ringBand' ? ring : bodyAll).push(f);
      const bDevs: number[] = []; let bWorst = 0, bOut = 0;
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
        bDevs.push(dv); if (dv > bWorst) bWorst = dv; if (dv > TOL) bOut++;
      }
      const bSorted = Float64Array.from(bDevs).sort();
      row.bodyFacets = bodyAll.length; row.ringFacets = ring.length;
      row.bodyP50 = pctFrom(bSorted, 0.5); row.bodyP99 = pctFrom(bSorted, 0.99); row.bodyMax = +bWorst.toFixed(6); row.bodyOut = bOut;
      // BODY is the deliverable (radialBoundAt dense-45 = cheap). RING = composite-BVH, ~30min at doubled tri count
      // ⇒ OPT-IN only (PF_DSCHORD_RING=1). Off ⇒ ring facet count only. Body row checkpoints the instant computed.
      plog(`[${arm.tag}] BODY p50=${row.bodyP50} p99=${row.bodyP99} max=${row.bodyMax} out=${row.bodyOut}/${bodyAll.length} | %<20=${row.pctBelow20} nonMan=${nonMan} hitBudget=${mesh.hitBudget}`);
      if (process.env.PF_DSCHORD_RING === '1') {
        const r = scoreRingBandFacets(xyz, idx, ring, dsLoc, TOL);
        row.ringP99 = r.p99; row.ringMax = r.maxMm; row.ringOut = r.outliers; row.ringP50 = r.p50;
      }
      checkpoint(row);
    }
    plog('DONE — all selected arms checkpointed');
  }, 6_000_000);
});
