// _msurf_inhouseVsGmsh.test.ts — E-2026-07-13-MSURF-INHOUSE (PF_MSURFIH=1).
//
// ADJUDICATE (measured): is the BROWSER-CAPABLE in-house M=g/h² mesher (buildInhouseMetricMesh, pure JS —
// Delaunator + surfaceMetricField, NO gmsh/node/child_process) able to REPRODUCE the sliver + fidelity wins
// that E-2026-07-13-MSURF-ISOVSSURF measured for the gmsh BAMG surf arm? If yes, the M=g/h² acceleration can
// productionize as a browser region kernel WITHOUT the Node/gmsh dependency the prior measurement used.
//
// ISOLATION (clean A/B, SAME metric field, SAME chord target): both this probe and the msurf `surf` arm consume
// the identical M = g/h₃D² tensor from buildSurfaceMetricField (CHORD mode, gradeBeta 0.2, SIZE_RES 192, same
// hMin/hMax 3D clamp, same tolMm). The ONLY difference is the MESHER:
//   • gmsh surf (baseline, from the registry) = gmsh BAMG (Algorithm 7) consumes the M tensor → anisotropic Delaunay.
//   • in-house (this probe)                   = buildInhouseMetricMesh: initial Euclidean Delaunay in globally-
//     anisotropy-scaled coords, metric-edge midpoint refinement under the SAME M field, true-3D max-min-angle
//     Lawson flips + on-surface smoothing sweeps. Pure JS, browser-capable.
// Same tolMm/hMin/hMax/gradeBeta/SIZE_RES ⇒ the internal buildSurfaceMetricField call is byte-identical to the
// msurf surf arm's field ⇒ this is a pure MESHER A/B on one shared metric.
//
// BASELINE (gmsh BAMG surf, E-2026-07-13-MSURF-ISOVSSURF, DIMS H120/Rb40/Rt50, SIZE_RES 192, gradeBeta 0.2):
//   DS   tol0.02 surf: 282366 tris, pctBelow20 1.8%, minAng 7.4, med 49, body p99 0.109, ring p99 0.189
//   DS   tol0.01 surf: 566234 tris, pctBelow20 2.3%, minAng 5.1, med 49, body p99 0.0305, ring p99 0.141
//   GeoS tol0.02 surf: 164815 tris, pctBelow20 5.4%, minAng 5.4, true3d p99 0.218
//   GeoS tol0.01 surf: 330268 tris, pctBelow20 5.8%, minAng 5.0, true3d p99 0.104
//
// INSTRUMENTS (labkit + the VALIDATED DS composite ruler — SAME rulers the msurf probe used, one ruler both meshers):
//   • SLIVERS  = triangleQualityDistribution (minAngleDeg + pctBelow20). • DS FIDELITY = §V11g composite ruler
//     (_ds_prodtruth_lib body dense-45 radial-bound + ring-band composite BVH). • GeoStar FIDELITY = perFaceTrue3DSag.
//   • watertight = auditNonManByIndex (u=0/u=1 lift to same xyz → seam welded-by-position).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring — see registry row):
//   BROWSER-KERNEL-REPRODUCES iff on BOTH styles at matched tolMm (tris within ~1.5× of the gmsh surf baseline):
//   in-house pctBelow20 ≤ 1.5× the gmsh surf pctBelow20 (i.e. still ≤ ~3.5% DS / ~8.7% GeoStar — decisively under
//   the ISO 22.7%/18.2% it must beat) AND in-house minAngle > 0 (non-degenerate) AND DS body/ring true-3D p99 not
//   worse than the gmsh surf baseline by >0.01mm at adequate density (tol0.01). PARTIAL iff slivers reproduce but a
//   fidelity ruler regresses >0.01mm. NEEDS-PORT iff in-house pctBelow20 ≥ the ISO baseline (the JS mesher fails to
//   exploit the metric the way BAMG does).
//
// DEV-ONLY; research/ only; never edits src/. Resumable: each (style,tol) row checkpointed the instant computed.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, perFaceTrue3DSag, liftUtToRadial } from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreRingBandFacets, dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES = (process.env.PF_MSURFIH_STYLES ?? 'DragonScales,GeometricStar').split(',') as StyleId[];
const TOLS = (process.env.PF_MSURFIH_TOLS ?? '0.02,0.01').split(',').map(Number);
const SIZE_RES = 192;                      // MATCH msurf surf arm (metric grid res)
const HMIN_3D = 0.05, HMAX_3D = 8;         // MATCH msurf surf arm (3D mm clamp)
const GRADE_BETA = 0.2;                    // MATCH msurf surf arm
const MAX_POINTS = 2_500_000;              // budget cap (DS tol0.01 baseline ≈ 283k verts, well under)
const MAX_SCORE_TRIS = 1_400_000;

const OUT_DIR = join('research', 'exchange', '_msurf_inhouseVsGmsh');
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

describe('in-house M=g/h² mesher vs gmsh BAMG surf — sliver + DS fidelity reproduction', () => {
  it.skipIf(process.env.PF_MSURFIH !== '1')('buildInhouseMetricMesh on DragonScales + GeometricStar', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const style of STYLES) {
      const rA = style === ('DragonScales' as StyleId) ? dsRadiusFn() : buildRadiusFn(style, {}, DIMS);
      const H = DS_H;
      let dsLoc: ReturnType<typeof buildConformRuler> | undefined;
      let ringZs: number[] | undefined;
      if (style === ('DragonScales' as StyleId)) {
        const t0 = Date.now();
        dsLoc = buildConformRuler(rA);
        ringZs = dragonRings().map((r) => r.z);
        plog(`[${style}] built DS composite ruler in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }

      // PF_MSURFIH_GUARD=1 → guardManifoldAlways (the documented universal watertight fix; byte-identical off on
      // non-buggy configs, CHANGES output only on the sharp styles whose default flips create non-manifold edges).
      const GUARD = process.env.PF_MSURFIH_GUARD === '1';
      const tag = GUARD ? 'inhouseG' : 'inhouse';
      for (const tol of TOLS) {
        const key = `${style}|${tag}|${tol}`;
        if (keyExists(key)) { plog(`[skip] ${key} already recorded`); continue; }
        const t0 = Date.now();
        // In-house M=g/h² mesher. tolMm/hMin/hMax/sizeRes/gradeBeta MATCH the msurf surf arm ⇒ the internal
        // buildSurfaceMetricField metric is byte-identical to that arm's; only the mesher differs.
        const mesh = buildInhouseMetricMesh(rA, H, {
          tolMm: tol, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
          maxPoints: MAX_POINTS, guardManifoldAlways: GUARD,
        });
        const meshMs = Date.now() - t0;
        const idx = mesh.indices;
        const lifted = liftUtToRadial(mesh.ut, rA, H);
        const xyz = lifted.vertices;
        const tris = idx.length / 3, verts = xyz.length / 3;

        const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
        const nonMan = auditNonManByIndex(xyz, idx);

        const row: Record<string, unknown> = {
          key, style: String(style), mesher: tag, tol, tris, verts, meshMs,
          rounds: mesh.rounds, hitBudget: mesh.hitBudget,
          minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(3),
          medianMinAngleDeg: +q.medianMinAngleDeg.toFixed(2),
          pctBelow10: +q.pctBelow10.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2), pctBelow30: +q.pctBelow30.toFixed(2),
          degenerate: q.degenerateCount, nonMan,
        };

        if (tris <= MAX_SCORE_TRIS) {
          if (style === ('DragonScales' as StyleId) && dsLoc && ringZs) {
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
            const r = scoreRingBandFacets(xyz, idx, ring, dsLoc, TOL);
            row.bodyFacets = bodyAll.length; row.ringFacets = ring.length;
            row.bodyP50 = pctFrom(bSorted, 0.5); row.bodyP99 = pctFrom(bSorted, 0.99); row.bodyMax = +bWorst.toFixed(6); row.bodyOut = bOut;
            row.ringP99 = r.p99; row.ringMax = r.maxMm; row.ringOut = r.outliers; row.ringP50 = r.p50;
          } else {
            const sag = perFaceTrue3DSag(mesh.ut, idx, rA, H, { preFilterMm: 0.01 });
            const fe = Float64Array.from(sag.faceErr).sort();
            row.true3dP99 = pctFrom(fe, 0.99); row.true3dP50 = pctFrom(fe, 0.5);
            row.true3dWorst = +sag.worstMm.toFixed(6); row.true3dOver01 = +sag.fracOver(0.01).toFixed(5);
          }
        } else {
          row.fidelitySkipped = `tris>${MAX_SCORE_TRIS}`;
        }
        checkpoint(row);
      }
    }
    plog('DONE — all rows checkpointed to scorecard.ndjson');
  }, 3_000_000);
});
