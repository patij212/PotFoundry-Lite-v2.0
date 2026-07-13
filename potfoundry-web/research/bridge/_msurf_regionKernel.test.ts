// _msurf_regionKernel.test.ts — PORT-FIDELITY reproduction for the SRC region kernel (PF_MSURFIH_REGION=1).
//
// ADJUDICATE (measured): does the SRC-PORTED M=g/h² region kernel (buildMetricOuterWall,
// src/renderers/webgpu/parametric/conforming/tierC/regionMetric.ts) reproduce the sliver + fidelity wins that
// E-2026-07-13-MSURF-INHOUSE measured for the RESEARCH kernel (buildInhouseMetricMesh)? This is the acceptance gate
// for the port: same rulers, same DIMS/tol/sizeRes/gradeBeta as _msurf_inhouseVsGmsh.test.ts, only the mesher path
// swapped from research → src. If the src kernel reproduces DS pctBelow20 ~3.1% / GeoStar ~0.6% + nonMan 0, the port
// is byte-faithful and the region dispatch can route sliver-heavy styles to it.
//
// The SRC builder forces guardManifoldAlways:true INTERNALLY (the MANDATORY watertight guard) — no GUARD env; it is
// always the production-correct watertight path. Reachable only under the D-1 flag, which this probe sets.
//
// TARGETS (from E-2026-07-13-MSURF-INHOUSE, research buildInhouseMetricMesh with guardManifoldAlways):
//   DS   pctBelow20 3.1% (iso 22.7 / gmsh 2.3), body p99 0.0282 @ tol0.01; nonMan 0.
//   GeoS pctBelow20 0.6% (iso 18.2 / gmsh 5.8 — BEATS gmsh), true-3D p99 0.069; nonMan 0.
//
// DEV-ONLY; research/ importing src/ is allowed (the rule is src/ never imports research/). Resumable: each
// (style,tol) row checkpointed the instant computed. Node twin.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { triangleQualityDistribution, auditNonManByIndex, perFaceTrue3DSag, liftUtToRadial } from './labkit';
import { buildMetricOuterWall } from '../../src/renderers/webgpu/parametric/conforming/tierC/regionMetric';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreRingBandFacets, dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES = (process.env.PF_MSURFIH_STYLES ?? 'DragonScales,GeometricStar').split(',') as StyleId[];
const TOLS = (process.env.PF_MSURFIH_TOLS ?? '0.02,0.01').split(',').map(Number);
const SIZE_RES = 192;                      // MATCH _msurf_inhouseVsGmsh arm
const HMIN_3D = 0.05, HMAX_3D = 8;         // MATCH _msurf_inhouseVsGmsh arm
const GRADE_BETA = 0.2;                    // MATCH _msurf_inhouseVsGmsh arm
const MAX_POINTS = 2_500_000;
const MAX_SCORE_TRIS = 1_400_000;

const OUT_DIR = join('research', 'exchange', '_msurf_regionKernel');
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
/** (u,t,0) stride-3 vertex buffer (ConformingOuterWallResult) → flat number[] of (u,t) pairs for the rulers. */
function extractUt2(vtx: Float32Array): number[] {
  const nV = vtx.length / 3;
  const ut = new Array<number>(nV * 2);
  for (let i = 0; i < nV; i++) { ut[2 * i] = vtx[3 * i]; ut[2 * i + 1] = vtx[3 * i + 1]; }
  return ut;
}

describe('SRC region kernel (buildMetricOuterWall) — port-fidelity reproduction of the M=g/h² win', () => {
  it.skipIf(process.env.PF_MSURFIH_REGION !== '1')('buildMetricOuterWall on DragonScales + GeometricStar', () => {
    // D-1 flag: the region kernel is reachable only under __pfRegionLayer.
    (globalThis as unknown as { __pfRegionLayer?: boolean }).__pfRegionLayer = true;
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

      for (const tol of TOLS) {
        const key = `${style}|region|${tol}`;
        if (keyExists(key)) { plog(`[skip] ${key} already recorded`); continue; }
        const t0 = Date.now();
        // SRC region kernel. guardManifoldAlways is forced true internally (mandatory watertight guard).
        const wall = buildMetricOuterWall(rA, { H }, {
          tolMm: tol, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
          maxPoints: MAX_POINTS,
        });
        const meshMs = Date.now() - t0;
        const idx = wall.indices;
        const ut = extractUt2(wall.vertices);
        const lifted = liftUtToRadial(ut, rA, H);
        const xyz = lifted.vertices;
        const tris = idx.length / 3, verts = xyz.length / 3;

        const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
        const nonMan = auditNonManByIndex(xyz, idx);

        const row: Record<string, unknown> = {
          key, style: String(style), mesher: 'region', tol, tris, verts, meshMs,
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
            const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
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
