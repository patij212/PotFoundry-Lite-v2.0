/* eslint-disable no-console */
// _pfCloseHardCard.test.ts — DEV-ONLY (SCORECARD, 2026-07-23). PF_HARDCARD=1.
//
// GOAL: for each WIRED hard/layered style, measure the HONEST true-3D MAX of its PRODUCTION emitter at production
// density, to decide flip-readiness (<=0.01mm?). ONE honest ruler per style (measureProjectorMax — globally-correct
// perpendicular projector, 1.00x on cones), cross-checked with perFaceTrue3DSag (labkit). Vertices lifted through the
// EXACT analytic rA (production GPU does this). Report tris / MAX / p99 / vtx / watertight; for any GAP run a DENSITY
// SWEEP (a density-INVARIANT residual with a named mechanism = a real floor; anything responsive = under-resolved).
//
// Styles measured here:
//   GeometricStar (15) — buildRegionOuterWall (M=g/h2 region kernel; __pfRegionLayer). "chevron/needle" claim.
//   GothicArches  (5)  — buildTierCOuterWall / refineToZeroOutliers (analytic surface). "needle-tip" claim.
//                        Full-pot tierC refine is MULTI-HOUR single-thread (wholeMesh0Outlier budgets 8h) — the
//                        full-pot cost is ITSELF a flip consideration; measured on a bounded apex PATCH at prod config.
//   LowPolyFacet  (19) — routed OFF (FACET_GRID_ALIGN_NU empty); cited from prior real-pipeline audit (0.00102mm).
// (BambooSegments 0.00265 + DragonScales cone-fan 0.0051 already verified this session — cited, not re-run.)
//
// Each unit is an env-gated, ndjson-checkpointed it.skipIf(PF_HARDCARD!=='1') so a killed run RESUMES the unfinished
// unit only. research/ only; imports src READ-ONLY. NO src edit, NO flag flip in production, NO commit from the test.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildRegionOuterWall } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import { refineToZeroOutliers, type ChartDomain } from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import { DEFAULT_RULER } from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import {
  perFaceTrue3DSag, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial,
} from './labkit';

// PRODUCTION dims (task): tapered OD140/H120 → Rt70/Rb45/expn1.1.
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;
const TOL = 0.01;

const OUT_DIR = join('research', 'exchange', '_pfCloseHardCard');
const WIT = join(OUT_DIR, 'witness.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(WIT, JSON.stringify(row) + '\n');
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

/** Extract the flat (u,t) pairs from a ConformingOuterWallResult's packed (u,t,0) vertices. */
function packedToUt(vertices: Float32Array): number[] {
  const n = vertices.length / 3;
  const ut = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) { ut[2 * i] = vertices[3 * i]; ut[2 * i + 1] = vertices[3 * i + 1]; }
  return ut;
}

/**
 * CHEAP worst-facet localizer (no projection): the same-(u,t) full-3D distance is a rigorous UPPER BOUND on the true
 * nearest chord, so the top-K worst-UB facets CONTAIN the worst-true facet. Reports where the gap concentrates
 * (apex u≈bay-center / strap-valley / rim t≈0,1) without paying the projector cost. Seam-unwrapped in u.
 */
function worstFacetsUB(ut: number[], idx: ArrayLike<number>, lifted: Float32Array, rA: (th: number, z: number) => number, K: number): Array<{ u: number; t: number; z: number; ub: number }> {
  const TAU = 2 * Math.PI, nF = idx.length / 3;
  const out: Array<{ u: number; t: number; z: number; ub: number }> = [];
  let worst = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const cx = (lifted[3 * a] + lifted[3 * b] + lifted[3 * c]) / 3;
    const cy = (lifted[3 * a + 1] + lifted[3 * b + 1] + lifted[3 * c + 1]) / 3;
    const cz = (lifted[3 * a + 2] + lifted[3 * b + 2] + lifted[3 * c + 2]) / 3;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const um = ((ua + ub + uc) / 3) % 1, tm = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    const th = TAU * um, z = tm * H, r = rA(th, z);
    worst[f] = Math.hypot(r * Math.cos(th) - cx, r * Math.sin(th) - cy, z - cz);
  }
  const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => worst[y] - worst[x]).slice(0, K);
  for (const f of order) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const um = ((ua + ub + uc) / 3 % 1 + 1) % 1, tm = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    out.push({ u: +um.toFixed(4), t: +tm.toFixed(4), z: +(tm * H).toFixed(2), ub: +worst[f].toFixed(4) });
  }
  return out;
}

// ═══════════════════════════════ GeometricStar (15) — region kernel ═══════════════════════════════
// Production emitter (ParametricExportComputer): buildRegionOuterWall({analyticRA, H, nRing:qNRing, tolMm:emitterCadSag,
// hMin:qMinEdge, hMax:qMaxEdge, sizeRes:qSizingRes, chordTolMm:emitterCadSag}, 'GeometricStar'). At the cadFidelity
// (high/ultra) tier the export STANDARD reaches: emitterCadSagMm = min(qMaxSag,0.01) = min(0.003,0.01) = 0.003,
// qNRing=2048, qMinEdge=0.04, qMaxEdge=1(highprofile), qSizingRes=128. Single-valued revolution-relief ⇒ report maxMm.
interface GsArm { key: string; tolMm: number; chordTolMm: number; hMin: number; maxPoints: number; note: string; }

function gsArms(): GsArm[] {
  return [
    // screen (moderate budget), then the two production densities, then a finer-hMin invariance confirm.
    { key: 'GS|screen|tol0.01', tolMm: 0.01, chordTolMm: 0.01, hMin: 0.04, maxPoints: 1_200_000, note: 'screen tol0.01 (standard-tier emitterCadSag)' },
    { key: 'GS|prod|tol0.003', tolMm: 0.003, chordTolMm: 0.003, hMin: 0.04, maxPoints: 5_000_000, note: 'PROD high/ultra emitterCadSag 0.003 (nRing2048,hMin0.04,hMax1,sizeRes128)' },
    { key: 'GS|fine|tol0.0015|hMin0.02', tolMm: 0.0015, chordTolMm: 0.0015, hMin: 0.02, maxPoints: 5_000_000, note: 'density-invariance confirm: tighter tol + finer hMin' },
  ];
}

async function runGs(arm: GsArm): Promise<Record<string, unknown>> {
  const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
  const t0 = Date.now(); const c0 = cpuUsage();
  const wall = buildRegionOuterWall({
    analyticRA: rA, H, nRing: 2048, tolMm: arm.tolMm, hMin: arm.hMin, hMax: 1.0,
    sizeRes: 128, chordTolMm: arm.chordTolMm, maxPoints: arm.maxPoints,
  }, 'GeometricStar' as StyleId);
  if (!wall) throw new Error('buildRegionOuterWall returned undefined (flag off?)');
  const cpuMs = Math.round(cpuUsage(c0).user / 1000);
  const ut = packedToUt(wall.vertices);
  const lifted = liftUtToRadial(ut, rA, H).vertices;
  const idx = wall.indices;
  const tris = idx.length / 3, verts = ut.length / 2;
  plog(`[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s (cpu ${cpuMs}ms)`);

  const q = triangleQualityDistribution({ vertices: lifted, indices: idx });
  const nonMan = auditNonManByIndex(lifted, idx);

  // Honest ruler: measureProjectorMax (globally-correct perpendicular projector). Single-valued ⇒ maxMm is the verdict.
  const pmT = Date.now();
  const pm = await measureProjectorMax({ vertices: lifted, indices: idx }, rA, { H, tolMm: TOL, nTheta: 2048, nZ: 1024 });
  plog(`[${arm.key}] measureProjectorMax done in ${((Date.now() - pmT) / 1000).toFixed(1)}s: max=${pm.maxMm.toFixed(5)} chord=${pm.chordMaxMm.toFixed(5)} vtx=${pm.vertexMaxMm.toFixed(6)} p99=${pm.p99Mm.toFixed(5)}`);
  // Cross-check with perFaceTrue3DSag ONLY on smaller meshes (screen); it agrees on the screen so skip on the heavy arms.
  let t3Max = -1, t3P99 = -1, t3P999 = -1;
  if (tris <= 1_600_000) {
    const t3 = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.006 });
    const sorted = Float64Array.from(t3.faceErr).sort();
    t3Max = +t3.worstMm.toFixed(6); t3P99 = pct(sorted, 0.99); t3P999 = pct(sorted, 0.999);
  }
  const worst = worstFacetsUB(ut, idx, lifted, rA, 5);
  plog(`[${arm.key}] worst-UB facets: ${JSON.stringify(worst)}`);

  const row = {
    key: arm.key, style: 'GeometricStar', emitter: 'buildRegionOuterWall(region M=g/h2)', note: arm.note,
    tolMm: arm.tolMm, hMin: arm.hMin, maxPoints: arm.maxPoints, tris, verts, cpuMs,
    projMax: +pm.maxMm.toFixed(6), projChord: +pm.chordMaxMm.toFixed(6), projVtx: +pm.vertexMaxMm.toFixed(6),
    projP99: +pm.p99Mm.toFixed(6), samples: pm.samples,
    t3Max, t3P99, t3P999,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), nonMan,
    worstUB: worst,
    verdict: pm.maxMm <= TOL ? 'CLOSED<=0.01' : 'GAP>' + pm.maxMm.toFixed(3),
  };
  return row;
}

describe('HARD/LAYERED scorecard — production-emitter honest true-3D MAX (H120/Rb45/Rt70/expn1.1)', () => {
  // Enable the region layer flag for the GeometricStar production emitter (dev-only; test-scoped global).
  (globalThis as unknown as { __pfRegionLayer?: boolean; __pfPerfectMesher?: boolean }).__pfRegionLayer = true;
  (globalThis as unknown as { __pfPerfectMesher?: boolean }).__pfPerfectMesher = true;

  for (const arm of gsArms()) {
    it.skipIf(process.env.PF_HARDCARD !== '1')(`GS ${arm.key} — ${arm.note}`, async () => {
      if (keyExists(WIT, arm.key)) { plog(`[skip] ${arm.key}`); return; }
      const row = await runGs(arm);
      append(row);
    }, 3_600_000);
  }
});

// ═══════════════════════════════ GothicArches (5) — tierC refine ═══════════════════════════════
// Production emitter (ParametricExportComputer): buildTierCOuterWall(sampler, {maxSagMm:qMaxSag, maxEdgeMm:qMaxEdge,
// minEdgeMm:qMinEdge, gradeRatio:2, maxLevel:qMaxLevel, resU/resT:qSizingRes, analyticRA, analyticH, nRing:qNRing},
// 'GothicArches'). Internally: detectFeatures → buildProtectedComplex → refineToZeroOutliers(tolMm:0.01, maxPass:16,
// bulkPasses7pt:4, bgArcMm:0.35, surfaceSource:'analytic'). The refine DRIVES to 0.01 by construction where it
// converges (wholeMesh0Outlier.test.ts asserts patch maxMm<=0.0101). Full-pot = MULTI-HOUR single-thread (that COST is
// itself the flip consideration), so this measures a bounded APEX PATCH (one bay, band around the needle apex t≈0.745)
// at the production analytic-surface config, independently confirming the achieved true-3D MAX via measureProjectorMax.
const GOTHIC_DIMS = { H: 120, Rt: 70, Rb: 45, expn: 1.1, gridResU: 1024, gridResT: 1024 };

interface GoArm { key: string; domain: ChartDomain; bgArcMm: number; nTheta: number; note: string; }

function goArms(): GoArm[] {
  // Arch apex (needle) at bay-center u=1/24≈0.0417, t=archApex=z0+zh=0.15+0.7*0.85=0.745. One bay u∈[0,1/12].
  return [
    { key: 'GO|apexPatch|prodCfg', domain: { uLo: 0, uHi: 1 / 12, tLo: 0.70, tHi: 0.79 }, bgArcMm: 0.35, nTheta: 1024,
      note: 'one bay x apex band (t.70-.79 around needle .745), prod analytic cfg bgArc0.35/nTheta1024/tol0.01' },
  ];
}

async function runGo(arm: GoArm): Promise<Record<string, unknown>> {
  const rA = buildAnalyticRadiusFn('GothicArches' as StyleId, {} as StyleOptions, { H: GOTHIC_DIMS.H, Rt: GOTHIC_DIMS.Rt, Rb: GOTHIC_DIMS.Rb, expn: GOTHIC_DIMS.expn });
  const sampler = styleSampler('GothicArches' as StyleId, {} as StyleOptions, GOTHIC_DIMS);
  const t0 = Date.now(); const c0 = cpuUsage();
  const complex = buildProtectedComplex(sampler, 'GothicArches');
  plog(`[${arm.key}] complex built (residualCrossings=${complex.residualCrossings}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const refined = refineToZeroOutliers(sampler, complex, arm.domain, {
    tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: arm.bgArcMm,
    ruler: { ...DEFAULT_RULER, nTheta: arm.nTheta },
    surfaceSource: 'analytic', analyticRA: rA, analyticH: GOTHIC_DIMS.H,
  }, (s) => {
    plog(`[${arm.key} pass ${s.pass}${s.dense ? ' DENSE' : ' 7pt'}] tris=${s.nTris} out=${s.outliers} worst=${s.worstMm.toFixed(5)} inserted=${s.inserted} ${(s.ms / 1000).toFixed(0)}s`);
  });
  const cpuMs = Math.round(cpuUsage(c0).user / 1000);
  const ut = refined.uv; const tris = refined.tris;
  const idx = Uint32Array.from(tris);
  const lifted = liftUtToRadial(ut, rA, GOTHIC_DIMS.H).vertices;
  const nTris = idx.length / 3;
  plog(`[${arm.key}] refined ${nTris} tris in ${((Date.now() - t0) / 1000).toFixed(1)}s capped=${refined.capped} passes=${refined.passes}`);

  const q = triangleQualityDistribution({ vertices: lifted, indices: idx });
  const nonMan = auditNonManByIndex(lifted, idx);
  const pm = await measureProjectorMax({ vertices: lifted, indices: idx }, rA, { H: GOTHIC_DIMS.H, tolMm: TOL, nTheta: 2048, nZ: 1024, zMin: arm.domain.tLo * GOTHIC_DIMS.H - 5, zMax: arm.domain.tHi * GOTHIC_DIMS.H + 5 });
  plog(`[${arm.key}] projMax=${pm.maxMm.toFixed(5)} chord=${pm.chordMaxMm.toFixed(5)} vtx=${pm.vertexMaxMm.toFixed(6)} p99=${pm.p99Mm.toFixed(5)}`);
  const t3 = perFaceTrue3DSag(ut, idx, rA, GOTHIC_DIMS.H, { preFilterMm: 0.006 });
  const worst = worstFacetsUB(ut, idx, lifted, rA, 5);

  return {
    key: arm.key, style: 'GothicArches', emitter: 'buildTierCOuterWall/refineToZeroOutliers(analytic)', note: arm.note,
    domain: arm.domain, bgArcMm: arm.bgArcMm, nTheta: arm.nTheta, tris: nTris, cpuMs, capped: refined.capped, passes: refined.passes,
    projMax: +pm.maxMm.toFixed(6), projChord: +pm.chordMaxMm.toFixed(6), projVtx: +pm.vertexMaxMm.toFixed(6), projP99: +pm.p99Mm.toFixed(6), samples: pm.samples,
    t3Max: +t3.worstMm.toFixed(6),
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), nonMan,
    worstUB: worst,
    verdict: (!refined.capped && pm.maxMm <= TOL) ? 'CLOSED<=0.01(patch,byConstruction)' : (refined.capped ? 'CAPPED@' + pm.maxMm.toFixed(3) : 'GAP>' + pm.maxMm.toFixed(3)),
  };
}

describe('GOTHIC tierC — apex-patch honest MAX (full-pot = multi-hour, cost is the flip consideration)', () => {
  for (const arm of goArms()) {
    it.skipIf(process.env.PF_HARDCARD !== '1')(`GOTHIC ${arm.key} — ${arm.note}`, async () => {
      if (keyExists(WIT, arm.key)) { plog(`[skip] ${arm.key}`); return; }
      const row = await runGo(arm);
      append(row);
    }, 10_800_000);
  }
});
