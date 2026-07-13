// _msurf_isoVsSurf.test.ts — E-2026-07-13-MSURF-ISOVSSURF (PF_MSURF=1).
//
// ADJUDICATE (measured): does meshing under M = g/h₃D² (the SURFACE-intrinsic first-fundamental-form metric,
// surfaceMetricField.ts, "even ON the 3D surface") MATERIALLY beat the current-production ISOTROPIC scalar
// sizing ("even in the FLAT (u,t) rectangle") on the two open frontiers — SLIVER quality + DS body/ring
// FIDELITY — for DragonScales (riser + ring discontinuities) and GeometricStar (chevron strapwork)?
//
// ISOLATION (clean A/B, same oracle, same chord target): BOTH arms are meshed by gmsh on the SAME unit (u,t)
// square at the SAME chord tolerance tolMm, differing ONLY in the size field:
//   • ARM iso  = buildIsotropicSizingField (scalar h(u,t) = √(8·tol/max|S_dd|)) → gmsh Frontal-Delaunay.
//                A (u,t)-equilateral cell → a √E:√G ≈ 2.4:1 STRETCHED triangle in 3D (the parametrization
//                anisotropy of S(u,t)=(r·cosθ,r·sinθ,z)). This is the production-analog: MetricSizingField feeds
//                the curvatureFloor hook a SCALAR isotropic curvature today.
//   • ARM surf = buildSurfaceMetricField CHORD mode (M = g/h₃D², h₃D=√(8·tol/κ_max), + gradeBeta) → gmsh BAMG
//                (Algorithm 7, anisotropic). Cells are even ON the 3D surface (3D-square by construction).
// Same tolMm ⇒ same chord fidelity target ⇒ tri budgets are comparable (surf typically uses FEWER because it
// does not over-refine the near-straight axial direction). We report tris for BOTH so the budget is explicit.
//
// INSTRUMENTS (labkit + the VALIDATED DS composite ruler, honest):
//   • SLIVERS  = triangleQualityDistribution on the lifted 3D mesh (minAngleDeg + pctBelow20, NOT %<20 alone as
//                a gate — reported together). One ruler, both meshes.
//   • DS FIDELITY = the §V11g tread-CONFORMING composite ruler (_ds_prodtruth_lib: buildConformRuler +
//                scoreBodyFacets/scoreRingBandFacets), BODY vs RING-band split, true dense-45 nearest-surface.
//   • GeoStar FIDELITY = perFaceTrue3DSag (facet→nearest-surface true-3D). Fair RELATIVE ruler (same on both
//                arms); may overstate absolute on steep chevrons but the iso-vs-surf DELTA is honest.
//   • watertight = auditNonManByIndex (reported; the gmsh (u,t)-square meshes are NOT u-seam-welded — the seam
//                gap is expected and orthogonal to the sliver/fidelity question).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring — see the registry row):
//   M-METRIC-ACCELERATES iff, on BOTH styles, at matched tolMm with tris within ~1.5×: surf pctBelow20 ≤ 0.7×
//   iso pctBelow20 (≥30% relative sliver reduction) AND surf minAngle ≥ iso minAngle AND DS surf body/ring true-3D
//   p99 not worse than iso by >0.005mm. MARGINAL iff the reduction is <30% relative on either style OR fidelity
//   regresses. NO-HELP iff surf pctBelow20 ≥ iso on either style (crest-flank-needle root cause dominates).
//
// DEV-ONLY; research/ only; never edits src/. Resumable: each (style,arm,tol) row is checkpointed to ndjson the
// instant it is computed (research/exchange/_msurf_isoVsSurf/scorecard.ndjson) — a killed run re-runs only the
// missing rows.
import { describe, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildIsotropicSizingField } from './sizingField';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution, auditNonManByIndex, perFaceTrue3DSag } from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreRingBandFacets, dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES = (process.env.PF_MSURF_STYLES ?? 'DragonScales,GeometricStar').split(',') as StyleId[];
const TOLS = (process.env.PF_MSURF_TOLS ?? '0.02,0.01').split(',').map(Number);
const SIZE_RES = 192;                     // sizing/metric grid res (fine enough for the DS ring bands)
const HMIN_UT = 0.0015, HMAX_UT = 0.06;   // iso sizing clamp (u,t units)
const HMIN_3D = 0.05, HMAX_3D = 8;        // surf metric clamp (3D mm)
const GRADE_BETA = 0.2;
const MAX_SCORE_TRIS = 1_400_000;         // above this, record quality only (fidelity scoring too slow)

const OUT_DIR = join('research', 'exchange', '_msurf_isoVsSurf');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';

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

function runGmsh(dir: string): { ut: number[]; indices: number[] } {
  execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe', maxBuffer: 1 << 30 });
  const out = readOracleOutput(join(dir, 'out_gmsh.json'));
  return { ut: out.ut, indices: out.indices };
}

function pctFrom(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

describe('M=g/h² (surface metric) vs isotropic sizing — sliver + DS fidelity', () => {
  it.skipIf(process.env.PF_MSURF !== '1')('iso-vs-surf on DragonScales + GeometricStar', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const style of STYLES) {
      const rA = style === ('DragonScales' as StyleId) ? dsRadiusFn() : buildRadiusFn(style, {}, DIMS);
      const H = DS_H;
      // DS composite ruler (built once per DS run; heavy radial twin + wall ref).
      let dsLoc: ReturnType<typeof buildConformRuler> | undefined;
      let ringZs: number[] | undefined;
      if (style === ('DragonScales' as StyleId)) {
        const t0 = Date.now();
        dsLoc = buildConformRuler(rA);
        ringZs = dragonRings().map((r) => r.z);
        plog(`[${style}] built DS composite ruler in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }

      for (const tol of TOLS) {
        for (const arm of ['iso', 'surf'] as const) {
          const key = `${style}|${arm}|${tol}`;
          if (keyExists(key)) { plog(`[skip] ${key} already recorded`); continue; }
          const dir = join(OUT_DIR, `_${style}_${arm}_${tol}`);
          mkdirSync(dir, { recursive: true });
          const t0 = Date.now();
          let input: OracleInput;
          if (arm === 'iso') {
            const f = buildIsotropicSizingField(rA, H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: HMIN_UT, hMax: HMAX_UT });
            input = { style: String(style), H, domain: { uPeriodic: true }, sizing: { resU: f.resU, resT: f.resT, h: Array.from(f.h) }, ours: null };
          } else {
            const mf = buildSurfaceMetricField(rA, H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: HMIN_3D, hMax: HMAX_3D, gradeBeta: GRADE_BETA });
            // gmsh needs `sizing` present as a base too (some paths read it); include a coarse fallback.
            const base = buildIsotropicSizingField(rA, H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: HMIN_UT, hMax: HMAX_UT });
            input = { style: String(style), H, domain: { uPeriodic: true }, sizing: { resU: base.resU, resT: base.resT, h: Array.from(base.h) }, metric: { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, ours: null };
          }
          writeOracleInput(dir, input);
          let mesh: { ut: number[]; indices: number[] };
          try {
            mesh = runGmsh(dir);
          } catch (e) {
            checkpoint({ key, style: String(style), arm, tol, error: String(e).slice(0, 300) });
            continue;
          }
          const meshMs = Date.now() - t0;
          const lifted = liftUtToRadial(mesh.ut, rA, H);
          const xyz = lifted.vertices;                 // Float32Array
          const idx = Uint32Array.from(mesh.indices);
          const tris = idx.length / 3, verts = xyz.length / 3;

          // SLIVERS
          const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
          const nonMan = auditNonManByIndex(xyz, idx);

          const row: Record<string, unknown> = {
            key, style: String(style), arm, tol, tris, verts, meshMs,
            minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(3),
            medianMinAngleDeg: +q.medianMinAngleDeg.toFixed(2),
            pctBelow10: +q.pctBelow10.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2), pctBelow30: +q.pctBelow30.toFixed(2),
            degenerate: q.degenerateCount, nonMan,
          };

          // FIDELITY
          if (tris <= MAX_SCORE_TRIS) {
            if (style === ('DragonScales' as StyleId) && dsLoc && ringZs) {
              const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
              const bodyAll: number[] = [], ring: number[] = [];
              for (let f = 0; f < tris; f++) (cls(f) === 'ringBand' ? ring : bodyAll).push(f);
              // BODY facets (>1mm from any ring): the composite ruler's SHEET component IS the radial surface there,
              // so the dense-45 radial bound (radialBoundAt) is the EXACT true-3D facet→surface distance — no BVH,
              // full population, fast. (Per _ds_prodtruth_lib: radialBoundAt is the sound sheet ruler; away from a
              // riser it is also tight.) RING band (the DS fidelity FRONTIER) is scored in FULL against the composite
              // BVH (radial bound is unsound at the riser — the whole reason the ring population is split out).
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
    }
    plog('DONE — all rows checkpointed to scorecard.ndjson');
  }, 3_000_000);
});
