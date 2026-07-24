// _gsLociConform.test.ts — does conforming to GeoStar's MEASURED loci close the true-3D MAX? (PF_GSLOCI=1)
//
// HYPOTHESIS (pre-registered, written BEFORE any arm was run):
//   GeometricStar's density-invariant true-3D residual (E-2026-07-23-GEOSTAR-SEAM-LOCK: MAX 0.684,
//   hitBudget, worst facets maxEdge 1.52mm vs hMin 0.04mm) is caused by the mesher refining the WRONG
//   locus: `extractGeometricStar` emits straight full-height columns at u=(k+0.5)/N, while the real
//   dominant locus is the strapwork RAMP (level curves dStrap=0 / dStrap=edge) — a chevron that
//   zigzags within each row. Feeding the CORRECTED loci to the local-CDT insertion engine
//   (buildConformingWall featureLines) should move the worst facet OFF the ramp and cut the MAX.
//
// KILL-CRITERION (pre-registered):
//   CONFIRMED-MECHANISM iff exact-loci MAX <= 0.5 x legacy MAX **and** the top-10 worst facets are no
//     longer dStrap-in-[0,edge] (they move off the ramp).
//   CLOSED iff exact-loci true-3D MAX <= 0.01mm.
//   REFUTED iff exact-loci MAX >= 0.9 x legacy MAX (the loci are not the binding constraint).
//   PARTIAL otherwise (report the residual + its mechanism + a density sweep).
//
// CONTROLS: identical dims/opts/budget cap in every arm; ONE lever = the feature-line set. The `none`
// arm (no lines at all) separates "the legacy lines were actively harmful" from "the exact lines help".
// ONE ruler both meshes: perFaceTrue3DSag (labkit) with the same buildRadiusFn analytic.
// GeoStar is a riser, not a tangled lattice: prior gnOver=0 (E-2026-07-19) ⇒ GN true-3D is honest here.
//
// Resilience: one it() per arm, ndjson appended the INSTANT an arm finishes.
import { describe, it } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildConformingWall, clipFeaturesToBox } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { geometricStarStrapField } from '../../src/fidelity/analyticSurfaceGate';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildRadiusFn, perFaceTrue3DSag, auditNonManByIndex, triangleQualityDistribution, vertErrColors, dumpRenderBins } from './labkit';

const OUT = join('research', 'exchange', '_gsLociConform');
mkdirSync(OUT, { recursive: true });
const NDJSON = join(OUT, 'scorecard.ndjson');

// PROD dims — the E-2026-07-23-HARDCARD / SEAM-LOCK config.
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const STYLE = 'GeometricStar';
const N = 8;
const EDGE = 0.02; // gs_roundness default 0 ⇒ edge = 0.02
const { field: STRAP } = geometricStarStrapField(8, 0.05, 0.5, 4, 0, 1, 0);

// Screen budget (moderate, per the resilience rule). Escalated only for the flagged arm.
const LEVEL = Number(process.env.PF_GSLOCI_LEVEL ?? 11);
const CAP = Number(process.env.PF_GSLOCI_CAP ?? 2_000_000);
// Ramp-band subdivision for the EXACT arm (1 = two bounding curves only; k = k+1 curves).
const RAMP_STEPS = Number(process.env.PF_GSLOCI_RAMPSTEPS ?? 1);

interface ArmResult {
  arm: string; rampSteps: number; level: number; cap: number; lines: number; linePoints: number;
  tris: number; verts: number; buildMs: number; scoreMs: number;
  max: number; p99: number; p999: number; over001: number; over01: number;
  maxOffSeam: number; p99OffSeam: number; nSeamBand: number;
  nonMan: number; pctBelow20: number; minAngle: number;
  worst: Array<{
    u: number; t: number; err: number; dsMin: number; dsMax: number; straddlesRamp: boolean;
    dFoldCells: number; dSeamU: number; maxEdgeMm: number;
  }>;
}

function analyseWorst(
  ut: number[], idx: ArrayLike<number>, faceErr: Float64Array, rA: (th: number, z: number) => number, k: number,
): ArmResult['worst'] {
  const order = Array.from({ length: faceErr.length }, (_, i) => i).sort((a, b) => faceErr[b] - faceErr[a]).slice(0, k);
  const lift = (u: number, t: number): [number, number, number] => {
    const th = 2 * Math.PI * u, z = t * DIMS.H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  return order.map((f) => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const u = ((ua + ub + uc) / 3) % 1, t = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    const pa = lift(ua, ut[2 * a + 1]), pb = lift(ub, ut[2 * b + 1]), pc = lift(uc, ut[2 * c + 1]);
    const d = (x: number[], y: number[]): number => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    const maxEdgeMm = Math.max(d(pa, pb), d(pb, pc), d(pc, pa));
    // dStrap over the WHOLE facet (a 1.6mm facet spans the 0.66mm ramp; the centroid value
    // alone under-reads). "straddlesRamp" = the facet's dStrap range overlaps [0,edge] ⇒ the
    // facet BRIDGES the steep ramp — the defect class the loci are meant to remove.
    const dsv = [STRAP(ua % 1, ut[2 * a + 1]), STRAP(ub % 1, ut[2 * b + 1]), STRAP(uc % 1, ut[2 * c + 1]), STRAP(u, t)];
    const dsMin = Math.min(...dsv), dsMax = Math.max(...dsv);
    const ucell = u * N - 0.5;
    const dSeamU = Math.min(u, 1 - u);
    return {
      u: +u.toFixed(6), t: +t.toFixed(6), err: +faceErr[f].toFixed(5),
      dsMin: +dsMin.toFixed(5), dsMax: +dsMax.toFixed(5),
      straddlesRamp: dsMin <= EDGE + 1e-9 && dsMax >= -1e-9,
      dFoldCells: +(Math.abs(ucell - Math.round(ucell))).toFixed(4),
      dSeamU: +dSeamU.toFixed(6),
      maxEdgeMm: +maxEdgeMm.toFixed(4),
    };
  });
}

function runArm(arm: 'none' | 'legacy' | 'exact'): void {
  const [, packed] = buildStyleParamPayload(STYLE, {});
  const p = Float32Array.from(packed);
  const lines = arm === 'none'
    ? []
    : extractAnalyticFeatures(STYLE, p, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
      arm === 'exact' ? { geoStarExactLoci: true, geoStarRampSteps: RAMP_STEPS } : undefined).lines;
  const linePoints = lines.reduce((s, l) => s + l.points.length, 0);
  const sampler: SurfaceSampler = styleSampler(STYLE as never, {}, DIMS);
  const uBias = computeUBias(sampler, lines.length > 0);

  const t0 = Date.now();
  const wall = buildConformingWall(sampler, {
    maxSagMm: Number(process.env.PF_GSLOCI_SAG ?? 0.05), maxEdgeMm: 8, minEdgeMm: 0.02, gradeRatio: 2,
    maxLevel: LEVEL, resU: 128, resT: 128, nRing: 256,
    surfaceId: 0,
    featureLines: lines.length ? lines : undefined,
    featureLevel: LEVEL,
    targetTriangles: CAP, budgetMode: 'cap',
    uBias,
    efgSampler: sampler,
  });
  const buildMs = Date.now() - t0;

  const vtx = wall.vertices, idx = wall.indices;
  const nV = vtx.length / 3;
  const ut: number[] = new Array(nV * 2);
  for (let i = 0; i < nV; i++) { ut[2 * i] = vtx[i * 3]; ut[2 * i + 1] = vtx[i * 3 + 1]; }
  const rA = buildRadiusFn(STYLE as never, {}, DIMS);

  const s0 = Date.now();
  // preFilterMm: facets whose same-(u,t) UPPER BOUND is below this are reported at that bound
  // (not projected). Default 0.02 piles the whole green bulk up just under 0.02 — lower it when the
  // sub-0.02 distribution is the question.
  const sag = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: Number(process.env.PF_GSLOCI_PREFILTER ?? 0.02) });
  const scoreMs = Date.now() - s0;
  const sorted = Float64Array.from(sag.faceErr).sort();
  const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  // OFF-SEAM split: the engine's `clipFeaturesToBox` strips feature lines within uMargin of u=0/1,
  // so that band is structurally unconformable. Report the MAX with and without it — honestly, both.
  const SEAM_BAND = 0.002; // ≈ 0.6mm of arc; ≫ uMargin(L11)=7.3e-4 so the whole clip band is inside
  const offSeam: number[] = [];
  let nSeamBand = 0;
  for (let f = 0; f < sag.faceErr.length; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const uu = [ut[2 * a], ut[2 * b], ut[2 * c]];
    const nearSeam = uu.some((x) => Math.min(x, 1 - x) < SEAM_BAND);
    if (nearSeam) { nSeamBand++; continue; }
    offSeam.push(sag.faceErr[f]);
  }
  // Locate the worst OFF-SEAM facets too (the seam class dominates the top-10 after conforming).
  const offIdx: number[] = [];
  for (let f = 0; f < sag.faceErr.length; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const uu = [ut[2 * a], ut[2 * b], ut[2 * c]];
    if (!uu.some((x) => Math.min(x, 1 - x) < SEAM_BAND)) offIdx.push(f);
  }
  offIdx.sort((x, y) => sag.faceErr[y] - sag.faceErr[x]);
  const offErr = new Float64Array(sag.faceErr.length);
  for (const f of offIdx.slice(0, 6)) offErr[f] = sag.faceErr[f];
  const worstOff = analyseWorst(ut, idx, offErr, rA, 6);
  offSeam.sort((x, y) => x - y);
  const maxOffSeam = offSeam.length ? offSeam[offSeam.length - 1] : 0;
  const p99OffSeam = offSeam.length ? offSeam[Math.floor(0.99 * offSeam.length)] : 0;

  // 3D lift for the topology + quality instruments (same as the FACROSS template).
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const pos = sampler.position(vtx[i * 3], vtx[i * 3 + 1]);
    xyz[i * 3] = pos[0]; xyz[i * 3 + 1] = pos[1]; xyz[i * 3 + 2] = pos[2];
  }
  const quality = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  const res: ArmResult = {
    arm, rampSteps: arm === 'exact' ? RAMP_STEPS : 0, level: LEVEL, cap: CAP, lines: lines.length, linePoints,
    tris: idx.length / 3, verts: nV, buildMs, scoreMs,
    max: +sag.worstMm.toFixed(5), p99: +q(0.99).toFixed(5), p999: +q(0.999).toFixed(5),
    over001: +sag.fracOver(0.01).toFixed(5), over01: +sag.fracOver(0.1).toFixed(5),
    maxOffSeam: +maxOffSeam.toFixed(5), p99OffSeam: +p99OffSeam.toFixed(5), nSeamBand,
    nonMan, pctBelow20: quality.pctBelow20, minAngle: quality.minAngleDeg,
    worst: analyseWorst(ut, idx, sag.faceErr, rA, 10),
  };
  if (process.env.PF_GSLOCI_DUMP === '1') {
    const tag = `geoStar_${arm}${arm === 'exact' ? `_s${RAMP_STEPS}` : ''}_L${LEVEL}`;
    dumpRenderBins(OUT, tag, Float32Array.from(xyz), idx, {
      colors: vertErrColors(sag.vertErr, 0.15),
      meta: {
        ruler: 'true3d', worstMm: sag.worstMm, p99Mm: q(0.99), pctOver0_03: 100 * sag.fracOver(0.03),
        arm, level: LEVEL, tris: idx.length / 3, nonMan,
      },
    });
  }
  appendFileSync(NDJSON, JSON.stringify(res) + '\n');
  /* eslint-disable no-console */
  console.log(`\n[GSLOCI ${arm} L${LEVEL} cap${CAP}] lines=${res.lines} (pts ${res.linePoints}) tris=${res.tris} ` +
    `build=${(buildMs / 1000).toFixed(1)}s score=${(scoreMs / 1000).toFixed(1)}s`);
  console.log(`  true-3D MAX=${res.max} p99=${res.p99} p99.9=${res.p999} over0.01=${(res.over001 * 100).toFixed(2)}% ` +
    `over0.1=${(res.over01 * 100).toFixed(3)}% | nonMan=${res.nonMan} %<20°=${res.pctBelow20} minAngle=${res.minAngle}`);
  console.log(`  OFF-SEAM (|u-0/1| > 0.002; ${nSeamBand} seam-band facets excluded): MAX=${res.maxOffSeam} p99=${res.p99OffSeam}`);
  console.log(`  worst OFF-SEAM 6:`);
  for (const w of worstOff) {
    console.log(`    u=${w.u} t=${w.t} err=${w.err} dStrap=[${w.dsMin},${w.dsMax}] ${w.straddlesRamp ? 'STRADDLES-RAMP' : 'off-ramp'} dFold=${w.dFoldCells}cells maxEdge=${w.maxEdgeMm}mm`);
  }
  console.log(`  worst-10 (u,t,err,dStrap[min,max],straddlesRamp,dFoldCells,dSeamU,maxEdgeMm):`);
  for (const w of res.worst) {
    console.log(`    u=${w.u} t=${w.t} err=${w.err} dStrap=[${w.dsMin},${w.dsMax}] ` +
      `${w.straddlesRamp ? 'STRADDLES-RAMP' : 'off-ramp'} dFold=${w.dFoldCells}cells dSeam=${w.dSeamU} maxEdge=${w.maxEdgeMm}mm`);
  }
  console.log(`  >>> worst-10 RAMP-STRADDLING = ${res.worst.filter((w) => w.straddlesRamp).length}/10 ; ` +
    `at-seam (dSeamU<0.002) = ${res.worst.filter((w) => w.dSeamU < 0.002).length}/10`);
  /* eslint-enable no-console */
}

/**
 * DIAG — the density-INVARIANT residual after conforming (MAX 0.11998 identical at L11 and L12)
 * sits on two loci: (a) the u-SEAM (dSeamU 1.2e-4) and (b) t≈0.0206 at the SECTOR EDGES u≈k/N.
 * Is that an EXTRACTOR coverage gap (no line emitted there) or an INSERTION gap (line emitted,
 * engine drops/clips it)? Measure the emitted line coverage BEFORE and AFTER the engine's own
 * `clipFeaturesToBox`, at the exact worst-facet loci.
 */
function runDiag(): void {
  const [, packed] = buildStyleParamPayload(STYLE, {});
  const p = Float32Array.from(packed);
  const lines = extractAnalyticFeatures(STYLE, p, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb }, { geoStarExactLoci: true }).lines;
  const LEVELS = [11, 12];
  const PROBES: Array<[number, number, string]> = [
    [0.999878, 0.014123, 'worst#1 SEAM'],
    [0.996595, 0.020611, 'worst#3 sector-edge (u≈k/N)'],
    [0.628405, 0.020611, 'worst#5 sector-edge'],
    [0.71224, 0.598958, 'the LEGACY/none worst facet (mid-wall ramp)'],
  ];
  const nearest = (ls: typeof lines, u: number, t: number): number => {
    let best = Infinity;
    for (const l of ls) {
      for (const pt of l.points) {
        let du = Math.abs(pt.u - u) % 1; if (du > 0.5) du = 1 - du;
        const d = Math.hypot(du, pt.t - t);
        if (d < best) best = d;
      }
    }
    return best;
  };
  /* eslint-disable no-console */
  console.log(`\n[GSLOCI DIAG] emitted lines=${lines.length} pts=${lines.reduce((s, l) => s + l.points.length, 0)}`);
  for (const lvl of LEVELS) {
    const uMargin = 1.5 / (1 << lvl);
    const tMargin = 1 / 256; // nRing=256 default in this probe
    const clipped = clipFeaturesToBox(lines, uMargin, tMargin);
    console.log(`  level ${lvl}: uMargin=${uMargin.toExponential(3)} tMargin=${tMargin.toExponential(3)} ` +
      `⇒ clipped lines=${clipped.length} pts=${clipped.reduce((s, l) => s + l.points.length, 0)}`);
    for (const [u, t, tag] of PROBES) {
      const dRaw = nearest(lines, u, t);
      const dClip = nearest(clipped, u, t);
      // one quadtree feature cell at this level, in (u,t)
      const cell = 1 / (1 << lvl);
      console.log(`    ${tag} (u=${u},t=${t}): nearest RAW line pt = ${dRaw.toExponential(3)} (${(dRaw / cell).toFixed(2)} cells) | ` +
        `after CLIP = ${dClip.toExponential(3)} (${(dClip / cell).toFixed(2)} cells)${dClip > dRaw * 1.5 ? '  <<< CLIPPED AWAY' : ''}`);
    }
  }
  /* eslint-enable no-console */
}

// PF_GSLOCI_ARM=none|legacy|exact runs a SINGLE arm (density sweep / resumable re-runs).
const ONLY = process.env.PF_GSLOCI_ARM;
const wants = (a: string): boolean => !ONLY || ONLY === a;

describe.skipIf(process.env.PF_GSLOCI !== '1')('GeoStar measured-loci conforming (buildConformingWall / local-CDT insertion)', () => {
  it.skipIf(!wants('none'))('arm NONE — no feature lines (control)', () => { runArm('none'); }, 3_600_000);
  it.skipIf(!wants('legacy'))('arm LEGACY — shipped extractor: N full-height fold columns', () => { runArm('legacy'); }, 3_600_000);
  it.skipIf(!wants('exact'))('arm EXACT — measured loci: strap-ramp level curves + staggered per-row fold segments', () => { runArm('exact'); }, 3_600_000);
  it.skipIf(!wants('diag'))('DIAG — extractor coverage vs engine clip at the frozen worst-facet loci', () => { runDiag(); }, 600_000);
});
