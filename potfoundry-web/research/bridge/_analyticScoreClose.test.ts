// _analyticScoreClose.test.ts — does EXACT-ANALYTIC scoring let conforming refinement CONVERGE
// where sampler scoring diverged? (PF_ANLSC=1)
//
// HYPOTHESIS (pre-registered, written BEFORE any arm was run):
//   The conforming sag refiner scores/refines against `styleSampler` — a bilinear grid whose OWN
//   deviation from the exact analytic surface is 0.48-1.29mm at production dims (256^2, the real GPU
//   export sampler) and 0.22-1.07mm at the lab's 512^2 (MEASURED, `_samplerBlindness.test.ts`). The
//   refiner is therefore BLIND to relief finer than its own grid error, which is why the
//   "density-hungry" styles hit budget without converging. Scoring the REFINEMENT DECISION against
//   the EXACT surface instead (`__pfConformingAnalyticScore` + `analyticRA`/`analyticSagMm`, the same
//   `surfaceSource:'analytic'` principle already used by tierC `refineToZeroOutliers`) should make
//   the residual CONVERGE with density where sampler scoring plateaued.
//
// KILL-CRITERION (pre-registered):
//   CONFIRMED-MECHANISM iff, at EQUAL budget cap and identical everything else, flag-ON true-3D MAX
//     <= 0.5 x flag-OFF MAX on at least one of {GeometricStar (exact-loci arm), Crystalline}.
//   CLOSED iff flag-ON true-3D MAX <= 0.01mm.
//   REFUTED iff flag-ON MAX >= 0.9 x flag-OFF MAX on BOTH styles (analytic scoring is not the
//     binding constraint and the "blindness" framing is wrong).
//   PARTIAL otherwise — and then the residual MUST be given a NAMED mechanism plus a density
//     (maxLevel) sweep showing whether it is density-invariant.
//
// CONTROLS: ONE lever = the `__pfConformingAnalyticScore` flag. Every arm passes the SAME
// analyticRA/analyticH (so the flag, not the presence of the closure, is the variable), the same
// dims / sizing opts / budget cap / feature-line set / uBias. ONE ruler both meshes:
// `perFaceTrue3DSag` (labkit) lifted with the exact analytic radius — the same surface the refiner
// is now scoring against, and the same surface the GPU evaluates vertices on at export.
//
// Resilience: one it() per (style, arm); ndjson appended the INSTANT an arm finishes.
import { describe, it } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { StyleId } from '../../src/geometry/types';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  perFaceTrue3DSag, auditNonManByIndex, triangleQualityDistribution, vertErrColors, dumpRenderBins,
} from './labkit';

const OUT = join('research', 'exchange', '_analyticScoreClose');
mkdirSync(OUT, { recursive: true });
const NDJSON = join(OUT, 'scorecard.ndjson');

/** PROD dims — the HARDCARD / GEOSTAR-LOCUS config. */
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

const LEVEL = Number(process.env.PF_ANLSC_LEVEL ?? 11);
const CAP = Number(process.env.PF_ANLSC_CAP ?? 4_000_000);
const SAG = Number(process.env.PF_ANLSC_SAG ?? 0.05);
const ASAG = Number(process.env.PF_ANLSC_ASAG ?? 0.01);
const ASAMP = Number(process.env.PF_ANLSC_ASAMP ?? 3);
const PREFILTER = Number(process.env.PF_ANLSC_PREFILTER ?? 0.004);
const SEAM_BAND = 0.002;

function setAnalyticScore(on: boolean): void {
  (globalThis as unknown as { __pfConformingAnalyticScore?: boolean }).__pfConformingAnalyticScore = on;
}

interface Row {
  style: string; arm: 'off' | 'on'; level: number; cap: number; sag: number; aSag: number;
  lines: number; tris: number; verts: number; buildMs: number; scoreMs: number;
  floorLeaves?: number; chosenScale?: number; leavesAtChosen?: number; capSaturated?: boolean;
  max: number; p99: number; p999: number; over001: number; over01: number;
  maxOffSeam: number; p99OffSeam: number; nSeamBand: number;
  nonMan: number; pctBelow20: number; minAngle: number;
  worst: Array<{ u: number; t: number; err: number; maxEdgeMm: number; dSeamU: number }>;
}

function runArm(style: StyleId, arm: 'off' | 'on', useLoci: boolean): void {
  const [, packed] = buildStyleParamPayload(style, {});
  const p = Float32Array.from(packed);
  const lines = useLoci
    ? extractAnalyticFeatures(style, p, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
      { geoStarExactLoci: true, geoStarRampSteps: 4 }).lines
    : [];
  const sampler: SurfaceSampler = styleSampler(style, {}, DIMS);
  const uBias = computeUBias(sampler, lines.length > 0);
  const rA = buildAnalyticRadiusFn(style, {}, DIMS);

  setAnalyticScore(arm === 'on');
  const t0 = Date.now();
  const wall = buildConformingWall(sampler, {
    maxSagMm: SAG, maxEdgeMm: 8, minEdgeMm: 0.02, gradeRatio: 2,
    maxLevel: LEVEL, resU: 128, resT: 128, nRing: 256,
    surfaceId: 0,
    featureLines: lines.length ? lines : undefined,
    featureLevel: LEVEL,
    targetTriangles: CAP, budgetMode: 'cap',
    uBias,
    efgSampler: sampler,
    // Passed in BOTH arms so the flag is the only lever.
    analyticRA: rA, analyticH: DIMS.H, analyticSagMm: ASAG, analyticSagSamples: ASAMP,
  });
  const buildMs = Date.now() - t0;
  setAnalyticScore(false);

  const vtx = wall.vertices, idx = wall.indices;
  const nV = vtx.length / 3;
  const ut: number[] = new Array(nV * 2);
  for (let i = 0; i < nV; i++) { ut[2 * i] = vtx[i * 3]; ut[2 * i + 1] = vtx[i * 3 + 1]; }

  const s0 = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: PREFILTER });
  const scoreMs = Date.now() - s0;
  const sorted = Float64Array.from(sag.faceErr).sort();
  const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];

  const offSeam: number[] = [];
  let nSeamBand = 0;
  for (let f = 0; f < sag.faceErr.length; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const uu = [ut[2 * a], ut[2 * b], ut[2 * c]];
    if (uu.some((x) => Math.min(x, 1 - x) < SEAM_BAND)) { nSeamBand++; continue; }
    offSeam.push(sag.faceErr[f]);
  }
  offSeam.sort((x, y) => x - y);

  // 3D lift for topology/quality (sampler lift, matching the FACROSS template).
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const pos = sampler.position(vtx[i * 3], vtx[i * 3 + 1]);
    xyz[i * 3] = pos[0]; xyz[i * 3 + 1] = pos[1]; xyz[i * 3 + 2] = pos[2];
  }
  const quality = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  // Worst facets with their physical edge length (the "is it density or a locus?" tell).
  const lift = (u: number, t: number): [number, number, number] => {
    const th = 2 * Math.PI * u, z = t * DIMS.H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const order = Array.from({ length: sag.faceErr.length }, (_, i) => i)
    .sort((a, b) => sag.faceErr[b] - sag.faceErr[a]).slice(0, 8);
  const worst = order.map((f) => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) {
      if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1;
    }
    const pa = lift(ua, ut[2 * a + 1]), pb = lift(ub, ut[2 * b + 1]), pc = lift(uc, ut[2 * c + 1]);
    const d = (x: number[], y: number[]): number => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    const u = ((ua + ub + uc) / 3) % 1;
    return {
      u: +u.toFixed(6), t: +((ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3).toFixed(6),
      err: +sag.faceErr[f].toFixed(5),
      maxEdgeMm: +Math.max(d(pa, pb), d(pb, pc), d(pc, pa)).toFixed(4),
      dSeamU: +Math.min(u, 1 - u).toFixed(6),
    };
  });

  const row: Row = {
    style, arm, level: LEVEL, cap: CAP, sag: SAG, aSag: ASAG,
    lines: lines.length, tris: idx.length / 3, verts: nV, buildMs, scoreMs,
    floorLeaves: wall.budget?.floorLeaves, chosenScale: wall.budget?.chosenScale,
    leavesAtChosen: wall.budget?.leavesAtChosen, capSaturated: wall.budget?.capSaturated,
    max: +sag.worstMm.toFixed(5), p99: +q(0.99).toFixed(5), p999: +q(0.999).toFixed(5),
    over001: +sag.fracOver(0.01).toFixed(5), over01: +sag.fracOver(0.1).toFixed(5),
    maxOffSeam: +(offSeam.length ? offSeam[offSeam.length - 1] : 0).toFixed(5),
    p99OffSeam: +(offSeam.length ? offSeam[Math.floor(0.99 * offSeam.length)] : 0).toFixed(5),
    nSeamBand, nonMan, pctBelow20: quality.pctBelow20, minAngle: quality.minAngleDeg,
    worst,
  };
  if (process.env.PF_ANLSC_DUMP === '1') {
    dumpRenderBins(OUT, `${style}_${arm}_L${LEVEL}`, Float32Array.from(xyz), idx, {
      colors: vertErrColors(sag.vertErr, 0.15),
      meta: {
        ruler: 'true3d', worstMm: sag.worstMm, p99Mm: q(0.99), pctOver0_03: 100 * sag.fracOver(0.03),
        arm, level: LEVEL, tris: idx.length / 3, nonMan,
      },
    });
  }
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  /* eslint-disable no-console */
  console.log(`\n[ANLSC ${style} ${arm.toUpperCase()} L${LEVEL} cap${CAP} sag${SAG} aSag${ASAG}] ` +
    `lines=${row.lines} tris=${row.tris} build=${(buildMs / 1000).toFixed(1)}s score=${(scoreMs / 1000).toFixed(1)}s`);
  console.log(`  budget: floorLeaves=${row.floorLeaves} chosenScale=${row.chosenScale} ` +
    `leavesAtChosen=${row.leavesAtChosen} capSaturated=${row.capSaturated}`);
  console.log(`  true-3D MAX=${row.max} p99=${row.p99} p99.9=${row.p999} over0.01=${(row.over001 * 100).toFixed(2)}% ` +
    `over0.1=${(row.over01 * 100).toFixed(3)}% | offSeam MAX=${row.maxOffSeam} p99=${row.p99OffSeam} (${nSeamBand} excl)`);
  console.log(`  nonMan=${row.nonMan} %<20deg=${row.pctBelow20} minAngle=${row.minAngle}`);
  for (const w of row.worst) {
    console.log(`    worst u=${w.u} t=${w.t} err=${w.err} maxEdge=${w.maxEdgeMm}mm dSeam=${w.dSeamU}`);
  }
  /* eslint-enable no-console */
}

const STYLE = (process.env.PF_ANLSC_STYLE ?? '') as StyleId | '';
const ARM = process.env.PF_ANLSC_ARM ?? '';
const wants = (s: string, a: string): boolean =>
  (!STYLE || STYLE === s) && (!ARM || ARM === a);

describe.skipIf(process.env.PF_ANLSC !== '1')('exact-analytic scoring vs sampler scoring (buildConformingWall)', () => {
  it.skipIf(!wants('GeometricStar', 'off'))('GeometricStar exact-loci — SAMPLER scoring (control)', () => {
    runArm('GeometricStar', 'off', true);
  }, 7_200_000);
  it.skipIf(!wants('GeometricStar', 'on'))('GeometricStar exact-loci — ANALYTIC scoring', () => {
    runArm('GeometricStar', 'on', true);
  }, 7_200_000);
  it.skipIf(!wants('Crystalline', 'off'))('Crystalline — SAMPLER scoring (control)', () => {
    runArm('Crystalline', 'off', false);
  }, 7_200_000);
  it.skipIf(!wants('Crystalline', 'on'))('Crystalline — ANALYTIC scoring', () => {
    runArm('Crystalline', 'on', false);
  }, 7_200_000);
  it.skipIf(!wants('GyroidManifold', 'off'))('GyroidManifold — SAMPLER scoring (control)', () => {
    runArm('GyroidManifold', 'off', false);
  }, 7_200_000);
  it.skipIf(!wants('GyroidManifold', 'on'))('GyroidManifold — ANALYTIC scoring', () => {
    runArm('GyroidManifold', 'on', false);
  }, 7_200_000);
  it.skipIf(!wants('HarmonicRipple', 'off'))('HarmonicRipple (smooth control) — SAMPLER scoring', () => {
    runArm('HarmonicRipple', 'off', false);
  }, 7_200_000);
  it.skipIf(!wants('HarmonicRipple', 'on'))('HarmonicRipple (smooth control) — ANALYTIC scoring', () => {
    runArm('HarmonicRipple', 'on', false);
  }, 7_200_000);
});
