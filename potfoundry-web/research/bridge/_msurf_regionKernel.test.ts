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
import { buildRegionOuterWall } from '../../src/renderers/webgpu/parametric/conforming/tierC/index';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreRingBandFacets, scoreBodyFacets,
  dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DIRECT SRC-PATH DragonScales validation (PF_MSURFIH_REGION_DS=1)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Drives the ACTUAL production region path — src `buildRegionOuterWall('DragonScales')` with `__pfRegionLayer` ON:
// rim-pin(nRing) + the DS θ+toe conforming graph (curvatureFineStep=0.0022, pinInjected, recoverySubdivideCollinear)
// + the rim-pin near-boundary split guard. This is what the src wiring runs; the block ABOVE calls the bare kernel
// (no graph) and the E-2026-07-13-DS-INTERIOR-CLOSE research probe uses `buildInhouseMetricMesh` (no rim-pin). This
// arm is the missing DIRECT confirm: does the src path (rim-pin + split guard) hold the research twin's ~0.009 body
// close? Surface = dsRadiusFn()/DS_H — byte-identical to the twin, so p99 is directly comparable.
//
// BODY-only score (ring-band excluded, bandMm 1.0) under the SAME V11g composite ruler (buildConformRuler/
// scoreBodyFacets) + the perFaceTrue3DSag witness. Env-parameterized (heavy defaults) + checkpointed/resumable.
const DSR_NRING = Number(process.env.PF_DSREGION_NRING ?? '128');
const DSR_SIZERES = Number(process.env.PF_DSREGION_SIZERES ?? '192');
const DSR_MAXPTS = Number(process.env.PF_DSREGION_MAXPTS ?? '3000000');
const DSR_HMIN = Number(process.env.PF_DSREGION_HMIN ?? '0.02');
const DSR_TOL = Number(process.env.PF_DSREGION_TOL ?? '0.01');
// Direct facet→surface chord-sag guard, matching the PRODUCTION dispatch (ParametricExportComputer passes
// chordTolMm=qMaxSag). Catches sharp near-rim relief the curvature metric aliases. Default = tol; 0 disables.
const DSR_CHORD = Number(process.env.PF_DSREGION_CHORD ?? String(DSR_TOL));
const DSR_SKIP_COMP = process.env.PF_DSREGION_SKIP_COMP === '1'; // witness-only (fast smoke)
const DSR_DUMP_WORST = Number(process.env.PF_DSREGION_DUMP_WORST ?? '0'); // log top-K worst body facets' (u,t) locus
const DSR_NDJSON = join(OUT_DIR, 'ds_srcpath.ndjson');

function dsrKeyExists(k: string): boolean {
  if (!existsSync(DSR_NDJSON)) return false;
  return readFileSync(DSR_NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function dsrCheckpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(DSR_NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}

describe('SRC region PATH (buildRegionOuterWall DragonScales) — rim-pin + graph + split-guard body true-3D', () => {
  it.skipIf(process.env.PF_MSURFIH_REGION_DS !== '1')('body composite p99 on the REAL src production path', () => {
    // D-1 flag: buildRegionOuterWall throws unless the region layer is enabled.
    (globalThis as unknown as { __pfRegionLayer?: boolean }).__pfRegionLayer = true;
    const key = `DS|srcpath|nRing${DSR_NRING}|sizeRes${DSR_SIZERES}|maxPts${DSR_MAXPTS}|hMin${DSR_HMIN}|tol${DSR_TOL}|chord${DSR_CHORD}${DSR_SKIP_COMP ? '|wit' : ''}`;
    if (dsrKeyExists(key)) { plog(`[skip] ${key} already recorded`); return; }

    const rA = dsRadiusFn();
    const H = DS_H;
    const t0 = Date.now();
    // The EXACT production dispatch — the DS branch injects the θ+toe graph + curvatureFineStep=0.0022 internally.
    const wall = buildRegionOuterWall(
      {
        analyticRA: rA, H, nRing: DSR_NRING, tolMm: DSR_TOL, hMin: DSR_HMIN, hMax: HMAX_3D,
        sizeRes: DSR_SIZERES, maxPoints: DSR_MAXPTS,
        ...(DSR_CHORD > 0 ? { chordTolMm: DSR_CHORD } : {}),
      },
      'DragonScales' as StyleId,
    );
    if (!wall) throw new Error('buildRegionOuterWall returned undefined (region flag OFF or non-region style)');
    const meshMs = Date.now() - t0;
    const idx = wall.indices;
    const ut = extractUt2(wall.vertices);
    const xyz = liftUtToRadial(ut, rA, H).vertices;
    const tris = idx.length / 3, verts = xyz.length / 3;
    plog(`[DS srcpath] built ${tris} tris / ${verts} verts nRing=${DSR_NRING} bottomRing=${wall.bottomRing.length} topRing=${wall.topRing.length} in ${(meshMs / 1000).toFixed(1)}s`);

    const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
    const nonMan = auditNonManByIndex(xyz, idx);

    // BODY classification (ring-band excluded, bandMm 1.0) — identical to E-DS-INTERIOR-CLOSE.
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
    const bodyAll: number[] = [];
    for (let f = 0; f < tris; f++) if (cls(f) === 'body') bodyAll.push(f);

    // WITNESS true-3D (perFaceTrue3DSag) on the body subset — cheap, GN-honest for DS risers.
    const tW = Date.now();
    const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
    const wDevs: number[] = []; let wWorst = 0, wOut = 0;
    for (const f of bodyAll) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > DSR_TOL) wOut++; }
    const wSorted = Float64Array.from(wDevs).sort();
    const witP99 = pctFrom(wSorted, 0.99), witMax = +wWorst.toFixed(6);
    plog(`[DS srcpath][WITNESS] body p99=${witP99} max=${witMax} out=${wOut}/${bodyAll.length} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

    // LOCUS CONFIRM: dump the top-K worst-witness body facets' centroid (u,t) + classify seam/rim/body.
    if (DSR_DUMP_WORST > 0) {
      const ranked = bodyAll.map((f) => ({ f, e: sag.faceErr[f] })).sort((x, y) => y.e - x.e).slice(0, DSR_DUMP_WORST);
      let seamCount = 0;
      for (const { f, e } of ranked) {
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3;
        const ct = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
        // A facet is at the SEAM if any corner is within 0.03 of u=0 or u=1 (the seam-column scale spans both edges).
        const uMin = Math.min(ut[2 * a], ut[2 * b], ut[2 * c]);
        const uMax = Math.max(ut[2 * a], ut[2 * b], ut[2 * c]);
        const atSeam = uMin < 0.03 || uMax > 0.97;
        if (atSeam) seamCount++;
        // eslint-disable-next-line no-console
        plog(`  [worst] sag=${e.toFixed(4)} centroid u=${cu.toFixed(4)} t=${ct.toFixed(4)} uSpan=[${uMin.toFixed(4)},${uMax.toFixed(4)}] ${atSeam ? 'SEAM' : (ct < 0.03 || ct > 0.97 ? 'RIM' : 'body')}`);
      }
      plog(`[DS srcpath][LOCUS] ${seamCount}/${ranked.length} of the worst facets touch the seam (u<0.03 || u>0.97)`);
    }

    const row: Record<string, unknown> = {
      key, mesher: 'regionSrcPath', nRing: DSR_NRING, sizeRes: DSR_SIZERES, maxPoints: DSR_MAXPTS, hMin: DSR_HMIN, tol: DSR_TOL,
      tris, verts, meshMs, bottomRing: wall.bottomRing.length, topRing: wall.topRing.length,
      minAngleDeg: +q.minAngleDeg.toFixed(3), pctBelow20: +q.pctBelow20.toFixed(2), nonMan,
      bodyFacets: bodyAll.length, witP99, witMax, witOut: wOut,
    };

    // COMPOSITE (V11g certified ruler) — the E-DS-INTERIOR-CLOSE gate. Skippable for the fast smoke.
    if (!DSR_SKIP_COMP) {
      const loc = buildConformRuler(rA);
      const tS = Date.now();
      const t3 = scoreBodyFacets(xyz as unknown as Float32Array, idx, bodyAll, loc, rA, DSR_TOL,
        (done, total) => { if (done % Math.max(1, Math.floor(total / 4)) === 0) plog(`  [DS srcpath][comp] ${done}/${total}`); });
      row.t3P50 = t3.p50; row.t3P90 = t3.p90; row.t3P99 = t3.p99; row.t3Max = t3.maxMm; row.t3Out = t3.outliers;
      row.t3GreenProvenFrac = t3.greenProvenFrac; row.compMs = Date.now() - tS;
      plog(`[DS srcpath][COMPOSITE] body p50=${t3.p50} p90=${t3.p90} p99=${t3.p99} max=${t3.maxMm} out=${t3.outliers}/${bodyAll.length} in ${((Date.now() - tS) / 1000).toFixed(1)}s`);
    }

    dsrCheckpoint(row);
    plog(`[DS srcpath][RESULT] bodyComp p99=${row.t3P99 ?? 'skip'} max=${row.t3Max ?? 'skip'} | wit p99=${witP99} max=${witMax} | %<20=${q.pctBelow20.toFixed(2)} tris=${tris} nonMan=${nonMan} rims=${wall.bottomRing.length}/${wall.topRing.length}`);
  }, 6_000_000);
});
