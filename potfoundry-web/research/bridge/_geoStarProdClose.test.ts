// _geoStarProdClose.test.ts — E-2026-07-22-GEOSTAR-PROD-CLOSE (PF_GSPROD=1).
//
// GOAL (synthesis + fresh measure): does GeometricStar (registry 15) close to the LITERAL 0.01mm true-3D MAX at
// PRODUCTION scale (OD140/H120 registry defaults → H120/Rb45/Rt70/expn1.1) via the ONE untested lever the two
// E-2026-07-19 IRREDUCIBLE verdicts pointed to — the ANISOTROPIC (II,I) crease-aligned metric + metric-in-circle
// flip in the PRODUCTION region kernel (regionMetric.buildMetricMesh `aniso`) — where isotropic density + feature-
// conforming edges both FLOOR (E-2026-07-14-GEOSTAR-CLOSE witMax 0.075@5.3M / 0.1125@2.8M trusted-continuous-real,
// apex-limited; E-2026-07-19-CHEVRON-CONFORM graph makes MAX WORSE 0.367→1.25 via recovery failure).
//
// WHY this is the untested gap (per task + registry): the research kernel `buildInhouseMetricMesh` has NO `aniso`
// field; aniso was wired ONLY into the PRODUCTION regionMetric.ts (commit d23b8cbe, E-2026-07-19-DS-CONVERGE-B) and
// measured ONLY on DragonScales (flank MAX 0.343→0.102 = 3.4× MOVE, convergence FLOOR, NOT closed). GeoStar's
// buildRegionOuterWall branch never passes aniso. So "aniso on GeoStar" has never been run. This probe runs it.
//
// A/B (the ONLY variable is `aniso`): both arms mesh the SAME analytic GeoStar surface with the SAME production
// config on regionMetric.buildMetricMesh (tolMm0.01 / hMin0.02 / hMax8 / sizeRes192 / curvatureFineStep0.0022 /
// chordTolMm0.01 / chordSampleN8 / guardManifoldAlways — the density + chord-sag fidelity backstop). NO feature
// graph (E-CHEVRON-CONFORM proved the interleaved chevron graph HURTS the MAX via recovery failure; the aniso
// LEVER is isolated cleanest without the graph confound). ISO = today's region kernel; ANISO = +aniso.
//
// INSTRUMENT (cheatsheet): true-3D perFaceTrue3DSag is the verdict (GeoStar is a single-valued riser/revolution
// surface ⇒ single-seed GN is HONEST — gnOver=0 across all prior GeoStar probes; prior TRUSTEDMAX confirmed
// gnMax==bruteAnchored==denseContinuous==0.11252). A CHEAP dense-bary continuous pass (min(same-(u,t) UB, GN),
// no whole-mesh brute) on the top-K worst facets catches the between-4pt-sample peak (only ever RAISES the MAX =
// more honest) + one full-azimuth brute on the single worst sample nails it. Slivers by minAngle
// (triangleQualityDistribution). Watertight by INDEX (auditNonManByIndex, non-vacuous).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSE  iff ANISO true-3D whole-mesh MAX ≤ 0.01 AND p99 ≤ 0.01, nonMan 0, tris ≤ ~3M  ⇒ GO, productionize aniso.
//   MOVES  iff ANISO MAX < 0.7 × ISO MAX at EQUAL budget (aniso is the right lever, not sufficient) — report the
//          residual + where it concentrates (apex vs flank) + the honest floor.
//   NO-OP / WALL iff ANISO MAX ≥ 0.9 × ISO — aniso does not move the GeoStar apex; report why (corner not flank).
//   Radial reported ONLY as the overstating screen. Slivers reported either way (a regression is a cost, not a DQ).
//
// DEV-ONLY; research/ only; imports src READ-ONLY (buildMetricMesh). Each arm is a keyExists-guarded checkpointed
// unit ⇒ a killed run RESUMES by re-running only the unfinished arm. NO src edit, NO flag, NO commit.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import {
  triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
  buildRadiusFn, projectPointToRadialSurface, bruteNearestOnRadialSurface, dumpHeatmap,
} from './labkit';
import type { StyleDims } from './labkit';
import { buildMetricMesh, type MetricMeshOpts } from '../../src/renderers/webgpu/parametric/conforming/tierC/regionMetric';
import type { StyleId } from '../../src/geometry/types';

// PRODUCTION dims: tapered OD140/H120 → top OD 140 (Rt70), tapered base Rb45, expn1.1.
const DIMS: StyleDims = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;
const TOL = 0.01;
const TAU = 2 * Math.PI;

const SIZE_RES = 192, HMAX_3D = 8, GRADE_BETA = 0.2;
const FINE_STEP = 0.0022, SUBSAMPLES = 4;
// Screen budget (cheatsheet: 0.3-0.8M pts). Overridable to HD-confirm the flagged arm.
const MAX_POINTS = process.env.PF_GSPROD_PTS ? parseInt(process.env.PF_GSPROD_PTS, 10) : 600_000;

const OUT_DIR = join('research', 'exchange', '_geoStarProdClose');
const WIT = join(OUT_DIR, 'witness.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(file: string, row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row).slice(0, 500)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

const gsRadiusFn = (): ((theta: number, z: number) => number) => buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);

interface Arm {
  key: string; hMin: number; aniso: boolean; fineStep?: number; chordTolMm?: number; note: string;
}

function makeArms(): Arm[] {
  return [
    // calibration smoke (tiny, cheap, always runs fast) — confirms wiring + times the kernel at prod dims.
    { key: 'smoke|iso', hMin: 0.05, aniso: false, note: 'wiring+timing calibration (no chord guard)' },
    // A/B #1 (chordTolMm backstop) — budget-starved at ≤600k (chord guard hungry); kept for the record.
    { key: `iso|chord|p${MAX_POINTS}`, hMin: 0.02, aniso: false, fineStep: FINE_STEP, chordTolMm: 0.01, note: 'ISO region kernel + fineStep + chordTolMm (chord-guard, budget-starved ≤600k)' },
    { key: `aniso|chord|p${MAX_POINTS}`, hMin: 0.02, aniso: true, fineStep: FINE_STEP, chordTolMm: 0.01, note: 'ANISO + fineStep + chordTolMm — the lever WITH chord backstop' },
    // A/B #2 (fineStep-only — CONVERGENT; the clean aniso A/B). The ONLY variable is aniso. NO chord guard so both
    // CONVERGE below the cap (hitBudget=false) ⇒ a budget-independent floor + a fair equal-budget aniso delta.
    { key: `iso|fine|p${MAX_POINTS}`, hMin: 0.02, aniso: false, fineStep: FINE_STEP, note: 'ISO + fineStep-only (convergent floor anchor)' },
    { key: `aniso|fine|p${MAX_POINTS}`, hMin: 0.02, aniso: true, fineStep: FINE_STEP, note: 'ANISO + fineStep-only — THE untested lever, clean convergent A/B' },
  ];
}

function optsFor(arm: Arm): MetricMeshOpts {
  const o: MetricMeshOpts = {
    tolMm: TOL, hMin: arm.hMin, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints: MAX_POINTS, guardManifoldAlways: true, aniso: arm.aniso,
  };
  if (arm.fineStep) { o.curvatureFineStep = arm.fineStep; o.curvatureSubsamples = SUBSAMPLES; }
  if (arm.chordTolMm) { o.chordTolMm = arm.chordTolMm; o.chordSampleN = 8; }
  return o;
}

function radialDev(rA: (th: number, z: number) => number, px: number, py: number, pz: number): number {
  const th = Math.atan2(py, px); const r = Math.hypot(px, py);
  return Math.abs(r - rA(th < 0 ? th + TAU : th, pz));
}

/**
 * Trusted continuous MAX on the top-K worst facets: dense-bary min(same-(u,t) UB, GN) (both ≥ true ⇒ a conservative
 * UPPER bound on the true nearest distance, catches the between-4pt-sample peak the witness ruler misses), then one
 * full-azimuth brute on the single worst sample to nail it. GeoStar GN is honest (gnOver=0) so this ≈ the true MAX.
 */
function trustedContinuousMax(
  ut: number[], idx: Uint32Array, rA: (th: number, z: number) => number, faceErr: Float64Array,
  K: number, N: number,
): { contMax: number; worstU: number; worstT: number; nOver: number } {
  const tris = idx.length / 3;
  const order = Array.from({ length: tris }, (_, f) => f).sort((x, y) => faceErr[y] - faceErr[x]).slice(0, Math.min(K, tris));
  const BARY: [number, number, number][] = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j + i <= N; j++) BARY.push([i / N, j / N, (N - i - j) / N]);
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  let contMax = 0, worstU = 0, worstT = 0, nOver = 0;
  let gWx = 0, gWy = 0, gWz = 0, gWm = 0;
  for (const f of order) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    const A = lift(ua, ta), B = lift(ub, tb), Cc = lift(uc, tc);
    let sMax = 0, sx = 0, sy = 0, sz = 0, su = 0, st = 0;
    for (const [wa, wb, wc] of BARY) {
      const fx = wa * A[0] + wb * B[0] + wc * Cc[0], fy = wa * A[1] + wb * B[1] + wc * Cc[1], fz = wa * A[2] + wb * B[2] + wc * Cc[2];
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const S = lift(um, tm);
      const ub3 = Math.hypot(S[0] - fx, S[1] - fy, S[2] - fz);        // same-(u,t) full-3D = rigorous UPPER bound
      const gn = projectPointToRadialSurface(fx, fy, fz, rA).dist;
      const d = Math.min(ub3, gn);
      if (d > sMax) { sMax = d; sx = fx; sy = fy; sz = fz; su = um; st = tm; }
    }
    if (sMax > TOL) nOver++;
    if (sMax > contMax) { contMax = sMax; worstU = su - Math.floor(su); worstT = st; gWx = sx; gWy = sy; gWz = sz; gWm = sMax; }
  }
  // one full-azimuth brute on the single worst sample — corrects any GN wrong-well (only ever LOWERS contMax)
  if (gWm > TOL) {
    const bf = bruteNearestOnRadialSurface(gWx, gWy, gWz, rA, H, { nTheta: 4096, nZ: 1024 }).dist;
    contMax = Math.min(contMax, bf);
  }
  return { contMax: +contMax.toFixed(6), worstU: +worstU.toFixed(5), worstT: +worstT.toFixed(5), nOver };
}

function runArm(arm: Arm): Record<string, unknown> {
  const rA = gsRadiusFn();
  const t0 = Date.now(); const c0 = cpuUsage();
  const mesh = buildMetricMesh(rA, H, optsFor(arm));
  const cpuMs = Math.round((cpuUsage(c0).user) / 1000);
  const idx = mesh.indices, ut = mesh.ut;
  const xyz = liftUtToRadial(ut, rA, H).vertices;
  const tris = idx.length / 3, verts = xyz.length / 3;
  const cst = mesh.constraint;
  plog(`[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s (cpu ${cpuMs}ms) rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  const tW = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.006 });
  const faceErr = sag.faceErr;
  const wDevs: number[] = []; let wWorst = 0, wOut = 0;
  for (let f = 0; f < tris; f++) { const e = faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
  const wSorted = Float64Array.from(wDevs).sort();
  const witP99 = pct(wSorted, 0.99), witP999 = pct(wSorted, 0.999), witMax = +wWorst.toFixed(6);
  plog(`[${arm.key}][WITNESS] p99=${witP99} p99.9=${witP999} max=${witMax} out=${wOut}/${tris} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

  // trusted continuous MAX on the top-300 worst facets (dense-bary, cheap; one brute on the single worst)
  const tc = trustedContinuousMax(ut, idx, rA, faceErr, 300, 6);
  plog(`[${arm.key}][TRUSTED] denseContinuousMax=${tc.contMax} (>0.01 in top300: ${tc.nOver}) worst@ u=${tc.worstU} t=${tc.worstT}`);

  // radial screen (artifact comparison — overstates near-vertical)
  const rDevs: number[] = []; let rWorst = 0;
  for (let f = 0; f < tris; f++) {
    const a = idx[3 * f], bb = idx[3 * f + 1], cc = idx[3 * f + 2];
    const cx = (xyz[3 * a] + xyz[3 * bb] + xyz[3 * cc]) / 3;
    const cy = (xyz[3 * a + 1] + xyz[3 * bb + 1] + xyz[3 * cc + 1]) / 3;
    const cz = (xyz[3 * a + 2] + xyz[3 * bb + 2] + xyz[3 * cc + 2]) / 3;
    const d = radialDev(rA, cx, cy, cz); rDevs.push(d); if (d > rWorst) rWorst = d;
  }
  const rSorted = Float64Array.from(rDevs).sort();

  return {
    key: arm.key, note: arm.note, aniso: arm.aniso, hMin: arm.hMin, maxPoints: MAX_POINTS,
    tris, verts, rounds: mesh.rounds, hitBudget: mesh.hitBudget, cpuMs,
    constraint: cst ?? null,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2), nonMan,
    witP99, witP999, witMax, witOut: wOut,
    denseContinuousMax: tc.contMax, nOverTop300: tc.nOver, worstU: tc.worstU, worstT: tc.worstT,
    radialP99: pct(rSorted, 0.99), radialMax: +rWorst.toFixed(6),
  };
}

describe('GEOSTAR prod-close — aniso region kernel at production scale (H120/Rb45/Rt70/expn1.1)', () => {
  const arms = makeArms();
  for (const arm of arms) {
    it.skipIf(process.env.PF_GSPROD !== '1')(`ARM ${arm.key} — ${arm.note}`, () => {
      if (keyExists(WIT, arm.key)) { plog(`[skip] ${arm.key}`); return; }
      const row = runArm(arm);
      append(WIT, row);
    }, 3_600_000);
  }

  // RENDER — dump a true-3D heatmap of a converged iso mesh (rebuild at RENDER_PTS) to SEE where the residual
  // concentrates (expected: the designed chevron apex / V-turn / star-point relief, not a tessellation defect).
  it.skipIf(process.env.PF_GSPROD_RENDER !== '1')('RENDER iso true-3D heatmap', () => {
    const rA = gsRadiusFn();
    const pts = process.env.PF_GSPROD_RENDER_PTS ? parseInt(process.env.PF_GSPROD_RENDER_PTS, 10) : 600_000;
    const o: MetricMeshOpts = {
      tolMm: TOL, hMin: 0.02, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
      maxPoints: pts, guardManifoldAlways: true, curvatureFineStep: FINE_STEP, curvatureSubsamples: SUBSAMPLES,
    };
    const mesh = buildMetricMesh(rA, H, o);
    const xyz = liftUtToRadial(mesh.ut, rA, H).vertices;
    const sag = dumpHeatmap(OUT_DIR, 'gsProdISO', xyz, mesh.ut, mesh.indices, rA, H,
      { scaleMm: 0.05, preFilterMm: 0.006, stl: false, meta: { arm: 'iso|fine', dims: 'H120/Rb45/Rt70/expn1.1', pts } });
    plog(`[RENDER gsProdISO] tris=${mesh.indices.length / 3} heatmap worst=${sag.worstMm.toFixed(4)} p99>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)}%`);
  }, 3_600_000);
});
