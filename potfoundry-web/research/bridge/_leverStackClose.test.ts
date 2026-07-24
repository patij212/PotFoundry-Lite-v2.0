// _leverStackClose.test.ts — does the PROVEN LEVER STACK close the remaining conforming-path
// styles (GeometricStar / GyroidManifold / Voronoi) to <= 0.01mm true-3D at PROD dims? (PF_LSC=1)
//
// THE STACK (all landed, all default-OFF, all flag-gated — this probe only APPLIES them):
//   (1) `__pfConformingAnalyticScore` + analyticRA/analyticSagMm  (E-2026-07-24-ANALYTIC-SCORE)
//   (2) nRing  — the pin level; the ONLY lever on the pinned rim row (E-2026-07-24-PINBAND §3c)
//   (3) `__pfConformingPinBandRelax='geometric'` — the tight 2:1-legal band grading (§3a/§3b)
//   (4) EXACT feature loci as `general-curve` lines -> local-CDT insertion (geoStarExactLoci etc.)
//
// HYPOTHESIS (pre-registered, written BEFORE any arm was run):
//   H-GS: GeometricStar's 0.03187 residual (stack levers 1+4, nRing 2048, L11) is owned by a lever
//         still untried on it — raising nRing (its rim row is already clean at 0.00041 and K<=1, so
//         the PINBAND band mechanism is inert). Sweeping nRing 2048 -> 8192 -> 32768 (with the
//         maxLevel raise that `pinBoundaryLevel <= maxLevel` forces) drops MAX <= 0.01.
//   H-GY: GyroidManifold's 0.11192 (lever 1 only, nRing 2048, L12) responds the same way.
//   H-VO: Voronoi's `general-curve` cell-border lines ARE inserted on the buildConformingWall path
//         measured here, and levers 1+2+3 drop its MAX materially.
//
// KILL-CRITERION (pre-registered, PER STYLE):
//   CLOSED         iff whole-mesh true-3D MAX <= 0.01mm with nonMan == 0 and rings intact.
//   CONFIRMED-LEVER iff the single lever under test drops MAX <= 0.5x its own control arm.
//   REFUTED        iff MAX >= 0.9x the control across the WHOLE sweep (the lever is not the
//                  binding constraint) — and then the residual MUST be given a NAMED mechanism
//                  plus a density-invariance demonstration (>= 2 maxLevels, identical MAX).
//   PARTIAL        otherwise.
//   ROUTING (Voronoi only): lines are INSERTED iff feature-line point coverage on the built mesh
//                  is >= 0.9 with lines ON *and* the lines-OFF control is materially lower
//                  (non-vacuous). REFUTED-ROUTING iff ON coverage < 0.9.
//
// CONTROLS: ONE lever per arm. Every arm passes the SAME analyticRA/analyticH/dims/sizing/budget
// cap, so only the named env var moves. ONE ruler for every mesh: labkit `perFaceTrue3DSag`
// lifted with the EXACT `buildAnalyticRadiusFn` (pre-filter 0.004). Slivers by
// `triangleQualityDistribution` (minAngle + %<20). Watertight by `auditNonManByIndex` (by INDEX);
// meshes above ~4.5M tris additionally get `nonManRawBigStats` (V8 Map-cap-free).
//
// RESIDUAL DECOMPOSITION (the task's question "rim-row / interior-band / deep-interior"):
//   pin = max(1, round(log2(nRing)) - uBias);  K = maxLevel - pin;  pinRow = floor(min(t,1-t)*2^pin)
//   rimRow  = pinRow 0            (owned by nRing — no grading can touch it)
//   band    = 1 <= pinRow <= K-1  (owned by `__pfConformingPinBandRelax`; INERT when K <= 1)
//   deep    = pinRow >= K         (owned by analyticSagMm / maxLevel)
//   seam    = min(u,1-u) < 0.002  (owned by `clipFeaturesToBox`'s uMargin = 1.5/2^featureLevel)
//
// Resilience: one it() per arm, selected by env; the ndjson row is appended the INSTANT the arm
// finishes, so a killed run resumes by re-running only the unfinished arms.
import { describe, it } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildConformingWall, clipFeaturesToBox } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { extractAnalyticFeatures, measureFeatureResolution } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { StyleId } from '../../src/geometry/types';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  perFaceTrue3DSag, perFaceChordSag, bruteAnchoredRedPerp, auditNonManByIndex, nonManRawBigStats,
  triangleQualityDistribution, vertErrColors, dumpRenderBins,
} from './labkit';

const OUT = join('research', 'exchange', '_leverStackClose');
mkdirSync(OUT, { recursive: true });
const NDJSON = join(OUT, 'scorecard.ndjson');
const ROUTEJSON = join(OUT, 'routing.ndjson');

/** PROD dims — the HARDCARD / ANALYTIC-SCORE / PINBAND config. */
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

const STYLE = (process.env.PF_LSC_STYLE ?? 'GeometricStar') as StyleId;
const LEVEL = Number(process.env.PF_LSC_LEVEL ?? 11);
const NRING = Number(process.env.PF_LSC_NRING ?? 2048);
const CAP = Number(process.env.PF_LSC_CAP ?? 12_000_000);
const SAG = Number(process.env.PF_LSC_SAG ?? 0.05);
const ASAG = Number(process.env.PF_LSC_ASAG ?? 0.01);
const ASAMP = Number(process.env.PF_LSC_ASAMP ?? 3);
const MINEDGE = Number(process.env.PF_LSC_MINEDGE ?? 0.02);
const PREFILTER = Number(process.env.PF_LSC_PREFILTER ?? 0.004);
const SCORE = process.env.PF_LSC_SCORE !== '0';          // lever (1), default ON
const LOCI = process.env.PF_LSC_LOCI === '1';            // lever (4)
const MODE = (process.env.PF_LSC_MODE ?? 'off') as 'off' | 'geometric' | 'rowsOnly'; // lever (3)
const TAG = process.env.PF_LSC_TAG ?? '';
const SEAM_BAND = 0.002;
/** Binary STL hard cap: 84-byte header + 50 bytes/triangle must fit 1 GiB. */
const STL_TRI_CAP = Math.floor((1024 ** 3 - 84) / 50);

function setAnalyticScore(on: boolean): void {
  (globalThis as unknown as { __pfConformingAnalyticScore?: boolean }).__pfConformingAnalyticScore = on;
}
function setRelax(mode: 'off' | 'geometric' | 'rowsOnly'): void {
  const g = globalThis as unknown as { __pfConformingPinBandRelax?: string };
  if (mode === 'off') delete g.__pfConformingPinBandRelax;
  else g.__pfConformingPinBandRelax = mode;
}

function extractLines(style: StyleId): ReturnType<typeof extractAnalyticFeatures>['lines'] {
  const [, packed] = buildStyleParamPayload(style, {});
  const p = Float32Array.from(packed);
  return extractAnalyticFeatures(style, p, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
    { geoStarExactLoci: true, geoStarRampSteps: 4 }).lines;
}

// ─────────────────────────────────────────────────────────────── the sweep arm
function runArm(): void {
  const lines = LOCI ? extractLines(STYLE) : [];
  const sampler: SurfaceSampler = styleSampler(STYLE, {}, DIMS);
  const uBias = computeUBias(sampler, lines.length > 0);
  const rA = buildAnalyticRadiusFn(STYLE, {}, DIMS);
  const pin = Math.max(1, Math.round(Math.log2(NRING)) - uBias);
  const K = LEVEL - pin;

  setAnalyticScore(SCORE);
  setRelax(MODE);
  const t0 = Date.now();
  const wall = buildConformingWall(sampler, {
    maxSagMm: SAG, maxEdgeMm: 8, minEdgeMm: MINEDGE, gradeRatio: 2,
    maxLevel: LEVEL, resU: 128, resT: 128, nRing: NRING,
    surfaceId: 0,
    featureLines: lines.length ? lines : undefined,
    featureLevel: LEVEL,
    targetTriangles: CAP, budgetMode: 'cap',
    uBias,
    efgSampler: sampler,
    analyticRA: rA, analyticH: DIMS.H, analyticSagMm: ASAG, analyticSagSamples: ASAMP,
  });
  const buildMs = Date.now() - t0;
  setRelax('off');
  setAnalyticScore(false);

  const vtx = wall.vertices, idx = wall.indices;
  const nV = vtx.length / 3;
  const nF = idx.length / 3;
  const ut: number[] = new Array(nV * 2);
  for (let i = 0; i < nV; i++) { ut[2 * i] = vtx[i * 3]; ut[2 * i + 1] = vtx[i * 3 + 1]; }

  const s0 = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: PREFILTER });
  const scoreMs = Date.now() - s0;
  const sorted = Float64Array.from(sag.faceErr).sort();
  const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];

  // ── residual decomposition by the mechanism's OWN coordinate ──
  const zone = { rim: 0, band: 0, deep: 0, seam: 0 };            // per-zone MAX
  const zoneN = { rim: 0, band: 0, deep: 0, seam: 0 };           // per-zone facet count
  const zoneOver = { rim: 0, band: 0, deep: 0, seam: 0 };        // per-zone >0.01 count
  const rowMax = new Map<number, number>();
  let over001 = 0;
  const pinRows = 1 << pin;
  const zoneOf = (f: number): 'rim' | 'band' | 'deep' | 'seam' => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const uu = [ut[2 * a], ut[2 * b], ut[2 * c]];
    if (uu.some((x) => Math.min(x, 1 - x) < SEAM_BAND)) return 'seam';
    const tt = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    const row = Math.floor(Math.min(tt, 1 - tt) * pinRows + 1e-9);
    if (row === 0) return 'rim';
    return row < K ? 'band' : 'deep';
  };
  for (let f = 0; f < nF; f++) {
    const e = sag.faceErr[f];
    const z = zoneOf(f);
    zoneN[z]++;
    if (e > zone[z]) zone[z] = e;
    if (e > 0.01) { zoneOver[z]++; over001++; }
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const tt = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    const row = Math.floor(Math.min(tt, 1 - tt) * pinRows + 1e-9);
    if (e > (rowMax.get(row) ?? 0)) rowMax.set(row, e);
  }

  // 3D lift (exact analytic — the surface the export evaluates) for quality + topology.
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const th = 2 * Math.PI * vtx[i * 3], z = vtx[i * 3 + 1] * DIMS.H, r = rA(th, z);
    xyz[i * 3] = r * Math.cos(th); xyz[i * 3 + 1] = r * Math.sin(th); xyz[i * 3 + 2] = z;
  }
  const quality = triangleQualityDistribution({ vertices: xyz, indices: idx });
  // auditNonManByIndex is Map-based (V8 ~16.7M-entry cap); above ~4.5M tris use the
  // sorted-key run-length scan instead (labkit `nonManRawBigStats`, no cap).
  const st = nonManRawBigStats(idx);
  const boundary = st.boundary;
  const nonManRaw = st.nonMan;
  // 3D-weld verdict on top of the raw-index scan (Map-based ⇒ only below the V8 cap).
  const nonMan = nF <= 4_500_000 ? auditNonManByIndex(xyz, idx) : nonManRaw;

  const lift = (u: number, t: number): [number, number, number] => {
    const th = 2 * Math.PI * u, z = t * DIMS.H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const describeFacet = (f: number): Record<string, number | string> => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) {
      if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1;
    }
    const pa = lift(ua, ut[2 * a + 1]), pb = lift(ub, ut[2 * b + 1]), pc = lift(uc, ut[2 * c + 1]);
    const d = (x: number[], y: number[]): number => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    const u = ((ua + ub + uc) / 3) % 1;
    const t = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    return {
      u: +u.toFixed(6), t: +t.toFixed(6), err: +sag.faceErr[f].toFixed(5),
      maxEdgeMm: +Math.max(d(pa, pb), d(pb, pc), d(pc, pa)).toFixed(4),
      dSeamU: +Math.min(u, 1 - u).toFixed(6),
      pinRow: Math.floor(Math.min(t, 1 - t) * pinRows + 1e-9),
      zone: zoneOf(f),
    };
  };
  const worst = Array.from({ length: nF }, (_, i) => i)
    .sort((a, b) => sag.faceErr[b] - sag.faceErr[a]).slice(0, 8).map(describeFacet);
  const topRows = Array.from(rowMax.entries()).sort((x, y) => y[1] - x[1]).slice(0, 6)
    .map(([r, v]) => ({ row: r, max: +v.toFixed(5) }));

  // GN-overstatement cross-check for TANGLED lattices (Gyroid/Voronoi): the honest
  // steep-lattice verdict number (E-2026-07-02-STEEP-HETEROGENEITY). Opt-in (seconds).
  let brute: Record<string, number> | undefined;
  if (process.env.PF_LSC_BRUTE === '1') {
    const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
    const b = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, redMm: 0.02, sampleN: 40 });
    brute = {
      nRed: b.nRed, nSample: b.nSample, gnOver: b.gnOver, bruteOver: b.bruteOver,
      gnP99: +b.gnP99.toFixed(5), trustedP99: +b.trustedP99.toFixed(5), trustedMax: +b.trustedMax.toFixed(5),
    };
  }

  const row = {
    tag: TAG, style: STYLE, level: LEVEL, nRing: NRING, uBias, pin, K,
    score: SCORE, loci: LOCI, mode: MODE, aSag: ASAG, cap: CAP,
    lines: lines.length, tris: nF, verts: nV, buildMs, scoreMs,
    chosenScale: wall.budget?.chosenScale, capSaturated: wall.budget?.capSaturated,
    leavesAtChosen: wall.budget?.leavesAtChosen,
    max: +sag.worstMm.toFixed(5), p99: +q(0.99).toFixed(5), p999: +q(0.999).toFixed(5),
    over001: +(over001 / nF).toFixed(5), over01: +sag.fracOver(0.1).toFixed(5),
    maxRim: +zone.rim.toFixed(5), maxBand: +zone.band.toFixed(5),
    maxDeep: +zone.deep.toFixed(5), maxSeam: +zone.seam.toFixed(5),
    nRim: zoneN.rim, nBand: zoneN.band, nDeep: zoneN.deep, nSeam: zoneN.seam,
    overRim: zoneOver.rim, overBand: zoneOver.band, overDeep: zoneOver.deep, overSeam: zoneOver.seam,
    nonMan, nonManRaw, boundary, pctBelow20: quality.pctBelow20, minAngle: quality.minAngleDeg,
    bottomRing: wall.bottomRing.length, topRing: wall.topRing.length,
    stlOverCap: nF > STL_TRI_CAP, stlTriCap: STL_TRI_CAP,
    topRows, worst, brute,
  };
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');

  if (process.env.PF_LSC_DUMP === '1') {
    dumpRenderBins(OUT, `${STYLE}_${TAG || 'arm'}_n${NRING}_L${LEVEL}`, Float32Array.from(xyz), idx, {
      colors: vertErrColors(sag.vertErr, Number(process.env.PF_LSC_COLSCALE ?? 0.05)),
      meta: {
        ruler: 'true3d', worstMm: sag.worstMm, p99Mm: q(0.99), pctOver0_03: 100 * sag.fracOver(0.03),
        style: STYLE, nRing: NRING, level: LEVEL, tris: nF, nonMan,
      },
    });
  }

  /* eslint-disable no-console */
  console.log(`\n[LSC ${TAG} ${STYLE} nRing${NRING} L${LEVEL} score=${SCORE} loci=${LOCI} mode=${MODE} aSag${ASAG}] ` +
    `uBias=${uBias} pin=${pin} K=${K} lines=${lines.length} tris=${nF} build=${(buildMs / 1000).toFixed(1)}s score=${(scoreMs / 1000).toFixed(1)}s`);
  console.log(`  budget: chosenScale=${row.chosenScale} leavesAtChosen=${row.leavesAtChosen} capSaturated=${row.capSaturated}`);
  console.log(`  true-3D MAX=${row.max} p99=${row.p99} p99.9=${row.p999} over0.01=${(row.over001 * 100).toFixed(3)}% over0.1=${(row.over01 * 100).toFixed(4)}%`);
  console.log(`  ZONES  rim(row0) MAX=${row.maxRim} (${row.nRim}f, ${row.overRim} over) | ` +
    `band(1..${Math.max(0, K - 1)}) MAX=${row.maxBand} (${row.nBand}f, ${row.overBand} over) | ` +
    `deep MAX=${row.maxDeep} (${row.nDeep}f, ${row.overDeep} over) | seam MAX=${row.maxSeam} (${row.nSeam}f, ${row.overSeam} over)`);
  console.log(`  nonMan=${row.nonMan} (raw ${row.nonManRaw}) boundary=${row.boundary} %<20deg=${row.pctBelow20} minAngle=${row.minAngle} ` +
    `rings=${row.bottomRing}/${row.topRing} (need ${NRING})`);
  console.log(`  STL cap ${STL_TRI_CAP} tris -> over cap? ${row.stlOverCap}`);
  console.log(`  worst pin-rows: ${topRows.map((r) => `row${r.row}:${r.max}`).join(' ')}`);
  for (const w of worst) console.log(`    worst ${JSON.stringify(w)}`);
  if (brute) console.log(`  BRUTE-anchored: ${JSON.stringify(brute)}`);
  /* eslint-enable no-console */
}

// ─────────────────────────────────────────────────── the Voronoi routing probe
function runRouting(): void {
  const styles: StyleId[] = ['GeometricStar', 'GyroidManifold', 'Voronoi'];
  for (const s of styles) {
    const lines = extractLines(s);
    const kinds = new Map<string, number>();
    let pts = 0;
    for (const l of lines) { kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1); pts += l.points.length; }
    const sampler: SurfaceSampler = styleSampler(s, {}, DIMS);
    const uBias = computeUBias(sampler, lines.length > 0);
    const featureLevel = LEVEL;
    const uMargin = 1.5 / (1 << featureLevel);
    const tMargin = 1 / NRING;
    const clipped = clipFeaturesToBox(lines, uMargin, tMargin);
    let cpts = 0;
    for (const l of clipped) cpts += l.points.length;
    const row = {
      probe: 'routing', style: s, lines: lines.length, kinds: Object.fromEntries(kinds), points: pts,
      uBias, uMargin, tMargin, clippedLines: clipped.length, clippedPoints: cpts,
      pointRetention: pts ? +(cpts / pts).toFixed(4) : 0,
    };
    appendFileSync(ROUTEJSON, JSON.stringify(row) + '\n');
    /* eslint-disable no-console */
    console.log(`[LSC ROUTING ${s}] lines=${row.lines} kinds=${JSON.stringify(row.kinds)} pts=${pts} uBias=${uBias}`);
    console.log(`  clipFeaturesToBox(uMargin=${uMargin.toExponential(3)}, tMargin=${tMargin.toExponential(3)}) -> ` +
      `${clipped.length} lines / ${cpts} pts (retention ${row.pointRetention})`);
    /* eslint-enable no-console */
  }
}

/** Are the extracted lines actually INSERTED (points present as mesh vertices)? Non-vacuous: the
 *  lines-OFF control must read materially lower coverage on the SAME line set. */
function runInsertProof(): void {
  const lines = extractLines(STYLE);
  const sampler: SurfaceSampler = styleSampler(STYLE, {}, DIMS);
  const graph = { styleId: STYLE, lines, groundTruthCount: lines.length };
  const build = (withLines: boolean): { cov: number; resolved: number; tris: number; covByTol: Record<string, number> } => {
    const uBias = computeUBias(sampler, withLines && lines.length > 0);
    const rA = buildAnalyticRadiusFn(STYLE, {}, DIMS);
    setAnalyticScore(SCORE);
    const wall = buildConformingWall(sampler, {
      maxSagMm: SAG, maxEdgeMm: 8, minEdgeMm: MINEDGE, gradeRatio: 2,
      maxLevel: LEVEL, resU: 128, resT: 128, nRing: NRING, surfaceId: 0,
      featureLines: withLines && lines.length ? lines : undefined,
      featureLevel: LEVEL, targetTriangles: CAP, budgetMode: 'cap', uBias, efgSampler: sampler,
      analyticRA: rA, analyticH: DIMS.H, analyticSagMm: ASAG, analyticSagSamples: ASAMP,
    });
    setAnalyticScore(false);
    const nV = wall.vertices.length / 3;
    const mv = new Array<{ u: number; t: number }>(nV);
    for (let i = 0; i < nV; i++) mv[i] = { u: wall.vertices[i * 3], t: wall.vertices[i * 3 + 1] };
    // EXACT-vertex tolerance: a point counts as tracked only if a mesh vertex sits on it to 1e-6,
    // i.e. the CDT actually inserted it (not merely "a vertex happens to be nearby"). The tolerance
    // SWEEP separates "not inserted" from "inserted then CORNER-SNAPPED" (cornerSnap =
    // 0.06/2^featureLevel = 2.9e-5 at featureLevel 11 — points within it are moved to a cell corner
    // BY DESIGN, so they are inserted yet miss a 1e-6 test).
    const covAt = (tol: number): number => {
      const r = measureFeatureResolution(graph, mv, { uTol: tol, tTol: tol, minCoverage: 0.9 });
      return r.perLine.length ? r.perLine.reduce((s, l) => s + l.coverage, 0) / r.perLine.length : 0;
    };
    const res = measureFeatureResolution(graph, mv, { uTol: 1e-6, tTol: 1e-6, minCoverage: 0.9 });
    const cov = res.perLine.length
      ? res.perLine.reduce((s, l) => s + l.coverage, 0) / res.perLine.length : 0;
    const covByTol: Record<string, number> = {};
    for (const tol of [1e-6, 1e-5, 3e-5, 1e-4, 1e-3]) covByTol[tol.toExponential(0)] = +covAt(tol).toFixed(4);
    return { cov, resolved: res.present, tris: wall.indices.length / 3, covByTol };
  };
  const on = build(true);
  const off = build(false);
  const row = {
    probe: 'insertProof', style: STYLE, level: LEVEL, nRing: NRING, lines: lines.length,
    covOn: +on.cov.toFixed(4), covOff: +off.cov.toFixed(4),
    resolvedOn: on.resolved, resolvedOff: off.resolved, trisOn: on.tris, trisOff: off.tris,
    covOnByTol: on.covByTol, covOffByTol: off.covByTol,
    inserted: on.cov >= 0.9 && on.cov > 2 * Math.max(off.cov, 1e-6),
  };
  appendFileSync(ROUTEJSON, JSON.stringify(row) + '\n');
  /* eslint-disable no-console */
  console.log(`\n[LSC INSERT-PROOF ${STYLE} nRing${NRING} L${LEVEL}] lines=${lines.length}`);
  console.log(`  lines ON : exact-vertex coverage=${row.covOn} resolved=${row.resolvedOn}/${lines.length} tris=${row.trisOn}`);
  console.log(`  lines OFF: exact-vertex coverage=${row.covOff} resolved=${row.resolvedOff}/${lines.length} tris=${row.trisOff}`);
  console.log(`  coverage by tolerance ON : ${JSON.stringify(row.covOnByTol)}`);
  console.log(`  coverage by tolerance OFF: ${JSON.stringify(row.covOffByTol)}`);
  console.log(`  => INSERTED (>=0.9 ON, non-vacuous vs OFF)? ${row.inserted}`);
  /* eslint-enable no-console */
}

describe.skipIf(process.env.PF_LSC !== '1')('lever stack — close the remaining conforming-path styles', () => {
  it.skipIf(process.env.PF_LSC_PROBE !== 'routing')('R0 line extraction + clip survival', () => {
    runRouting();
  }, 3_600_000);
  it.skipIf(process.env.PF_LSC_PROBE !== 'insert')('R1 lines are INSERTED as mesh vertices (non-vacuous)', () => {
    runInsertProof();
  }, 7_200_000);
  it.skipIf(process.env.PF_LSC_PROBE !== 'arm')(`A ${STYLE} nRing${NRING} L${LEVEL}`, () => {
    runArm();
  }, 7_200_000);
});
