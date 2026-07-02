// _sfbPush.test.ts — DEV-ONLY (research/ only). TEAM-A SFB-PUSH (E-2026-07-02-SFB-PUSH).
// Drive SuperformulaBlossom@1 to the RAISED STANDARD: <=0.01mm TRUE-3D chord vs the ACTUAL 3D object,
// all-green (0 facets >0.01mm) or an honest quantified geometric limit; every petal-corner ridge
// embedded as mesh edges BY CONSTRUCTION (zero serration); good quality; watertight.
//
// ISOLATION: NEW files only (_sfbPush*). CALLS the kernel (buildInhouseMetricMesh) + committed hooks
//   (injectedPoints/constraintEdges/pinInjected/chordSteiner/guardManifoldAlways) + labkit + refineLoci
//   + planarizeSkeleton + _sharp3dRef (BVH ruler). Edits NOTHING in src/ or existing research files.
// OUTPUT DIR: research/exchange/_sfbpush/<config-tag>/ ONLY. Env: PF_SFBPUSH (+ suffixes). UNIQUE
//   sub-name per config => no file races with the parallel Team B run.
// RESILIENCE: env-gated blocks; each build CHECKPOINTS to disk the instant computed; resumable.
//
// Env switches (run one at a time):
//   PF_SFBPUSH_DIAG   — geometry + baseline (BVH ruler): reproduce the ~0.13 residual, localize the
//                       ridge, verify serration (are the petal-ridge loci embedded as mesh edges?).
//   PF_SFBPUSH_STEINER— true-3D-metric-driven iterative Steiner loop (inject at facets whose BVH sag
//                       >0.01; the kernel's radial chord guard stalls at near-vertical — drive by MY ruler).
//   PF_SFBPUSH_CONFIRM— high-density confirm of the winning config + heatmap + STL dump.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, buildRadiusFn, buildFeatureTruth, buildMeshUt, liftUtToRadial,
  auditNonManByIndex, triangleQualityDistribution, dumpRenderBins, perFaceTrue3DSag, perFaceChordSag,
  projectPointToRadialSurface,
} from './labkit';
import { refineLinesToExtremum } from './refineLoci';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import {
  buildSheetRefLocator, perFaceTrueSagBVH, adversarialBVH, vertColorsFrom, serrationToMeshEdge, trustedWorst,
  tracePetalLoci, analyticBruteDist, trustedWorstAnalytic, tipLadderPoints,
} from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_sfbpush');
const SEAM = 0.01;

// MODERATE screen density (matches E-SWEEP-METRIC-MAP / _perfectPipeline OPTS so numbers compare).
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;

const ckptDir = (tag: string): string => { const d = join(ROOT, tag); mkdirSync(d, { recursive: true }); return d; };
const ckpt = (tag: string, name: string, obj: unknown): void => { writeFileSync(join(ckptDir(tag), `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (tag: string, name: string): boolean => existsSync(join(ROOT, tag, `${name}.json`));
const load = (tag: string, name: string): any => JSON.parse(readFileSync(join(ROOT, tag, `${name}.json`), 'utf8'));

// ─── crest skeleton (the "unified mechanism": refined+pinned feature loci) ───
function buildCrestSkeleton(rA: AnalyticRadiusFn): { injected: number[]; nCrest: number; refinedLines: Array<{ points: { u: number; t: number }[] }>; uToMm: number } {
  const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
  const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
  const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));
  return { injected: pslg.points, nCrest: pslg.points.length / 2, refinedLines: refined, uToMm: truth.uToMm };
}

// ─── TRACED skeleton: analytic petal ridge/valley loci, seam-aware + rim-reaching, as constraint edges ───
// The DIAG finding: segmentsFromLines DROPS seam-crossing + rim-band ridge segments -> the dominant residual
// is at u~0/1 (seam) + t=1 (rim). tracePetalLoci fixes this by construction. Densify each chain to ~stepMm
// arc-length, planarize (split crossings into shared nodes), emit injected points + constraint-edge pairs.
// GRADED step: the tip cusps are SHARP only at the base (t<~0.3, n1~0.35 -> exp 0.86); mid/upper tips are
// smooth (exp 2.0). A uniform fine step over-constrains (173k edges -> 72 nonMan). Grade the step so it is
// fine only where the cusp is sharp: stepMm at t>=tHi, gradeStepMm at t<=tLo, linear between.
function gradedStep(t: number, stepMm: number, gradeStepMm: number, tLo = 0.05, tHi = 0.4): number {
  if (gradeStepMm >= stepMm) return stepMm;
  if (t <= tLo) return gradeStepMm;
  if (t >= tHi) return stepMm;
  const f = (t - tLo) / (tHi - tLo); return gradeStepMm + (stepMm - gradeStepMm) * f;
}
function buildTracedSkeleton(rA: AnalyticRadiusFn, stepMm: number, kind: 'crest' | 'valley' | 'both', gradeStepMm?: number): {
  injected: number[]; constraintPairs: number[]; loci: Array<{ points: { u: number; t: number }[]; label: string }>;
} {
  const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind });
  const uToMm = 2 * Math.PI * 50; // ring circ approx (Rt=50); step is in mm along the locus
  // densify chains into short segments, then planarize. DROP segments whose BOTH endpoints sit ON the
  // seam (u~0 or ~1): a constraint edge lying ALONG the seam forces a picket of coincident u=1 vertices
  // that triangulate into vertical zero-u-width slivers (SEAM-DIAG: 42 facets @0.19mm). A ridge that
  // merely TOUCHES the seam keeps its interior segments; only the degenerate along-seam run is dropped.
  const onSeam = (u: number): boolean => u < 1e-4 || u > 1 - 1e-4;
  const segs: Array<[number, number, number, number]> = [];
  for (const ln of loci) {
    const pts = ln.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      if (onSeam(p.u) && onSeam(q.u)) continue; // degenerate along-seam segment
      const du = q.u - p.u, dt = q.t - p.t; // already seam-split so |du|<0.5
      const lenMm = Math.hypot(du * uToMm, dt * DIMS.H);
      const localStep = gradeStepMm !== undefined ? gradedStep((p.t + q.t) / 2, stepMm, gradeStepMm) : stepMm;
      const n = Math.max(1, Math.ceil(lenMm / localStep));
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n;
        segs.push([p.u + du * f0, p.t + dt * f0, p.u + du * f1, p.t + dt * f1]);
      }
    }
  }
  // planarize WITHOUT dropping boundary/seam segments (custom: keep everything, split crossings).
  const pslg = planarizeSegments(segs, 1e-5);
  return { injected: pslg.points, constraintPairs: pslg.edges, loci };
}

// COARSER base metric for the Steiner loop: the tip cusps need TARGETED fine cells, not a uniform
// tolMm=0.004 grid that spends the whole budget on smooth shoulders. Relax global refinement so the
// true-3D Steiner injection drives the tip density. (Smooth shoulders converge fast — exp>1 in CORNER-CLASS.)
const OPTS_COARSE = { tolMm: 0.03, hMin: 0.02, hMax: 8, sizeRes: 96, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;

// ─── build the unified mesh with optional extra injected points + constraint edges + chordSteiner ───
interface BuildOpts { extraPoints?: number[]; constraintPairs?: number[]; chordSteiner?: boolean; chordTolMm?: number; maxPoints?: number; coarse?: boolean; }
function buildMesh(rA: AnalyticRadiusFn, base: number[], opts: BuildOpts = {}): {
  ut: number[]; idx: Uint32Array; xyz: Float32Array; vtx: Float64Array; nonMan: number; tris: number; hitBudget: boolean; constraint?: unknown;
} {
  const injected = opts.extraPoints ? base.concat(opts.extraPoints) : base;
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...(opts.coarse ? OPTS_COARSE : OPTS),
    ...(opts.maxPoints !== undefined ? { maxPoints: opts.maxPoints } : {}),
    guardManifoldAlways: true,
    injectedPoints: injected,
    pinInjected: true,
    ...(opts.constraintPairs && opts.constraintPairs.length ? { constraintEdges: opts.constraintPairs, guardRecoveryManifold: true } : {}),
    ...(opts.chordSteiner ? { chordSteiner: true } : {}),
    ...(opts.chordTolMm !== undefined ? { chordTolMm: opts.chordTolMm } : {}),
  });
  const ut = Array.from(mesh.ut); const idx = mesh.indices;
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  return { ut, idx, xyz: meshUt.xyz, vtx, nonMan, tris: idx.length / 3, hitBudget: mesh.hitBudget, constraint: mesh.constraint };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 1 — DIAG: geometry, baseline (BVH ruler), ridge localization, serration.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH DIAG — geometry + baseline + ridge localization', () => {
  it.skipIf(process.env.PF_SFBPUSH_DIAG !== '1')('diagnoses the petal-ridge residual (resumable)', () => {
    const tag = 'diag';
    const rA = buildRadiusFn(STYLE, {}, DIMS);

    // (a) GEOMETRY: petal count varies m 6->10; sample the crest sharpness (radial 2nd diff along theta near a tip).
    if (!done(tag, 'geometry')) {
      const rows: any[] = [];
      for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const z = t * DIMS.H;
        // sweep theta densely, find max r (a petal tip) and the local curvature there
        let rmax = -Infinity, thMax = 0, rmin = Infinity;
        const N = 8000;
        for (let i = 0; i < N; i++) { const th = TAU * (i / N); const r = rA(th, z); if (r > rmax) { rmax = r; thMax = th; } if (r < rmin) rmin = r; }
        // second difference at the tip (curvature signature; corner => big)
        const dth = TAU / N;
        const rL = rA(thMax - dth, z), r0 = rA(thMax, z), rR = rA(thMax + dth, z);
        const d2 = (rL - 2 * r0 + rR) / (dth * dth);
        rows.push({ t, z, petalTipR: rmax, valleyR: rmin, reliefMm: rmax - rmin, thMaxDeg: thMax * 180 / Math.PI, tipCurv: d2 });
      }
      ckpt(tag, 'geometry', { style: STYLE, dims: DIMS, rows });
      console.log('GEOMETRY', JSON.stringify(rows.map((r) => ({ t: r.t, relief: +r.reliefMm.toFixed(2), tipCurv: +r.tipCurv.toFixed(0) }))));
    }

    // (b) trusted BVH reference (dense sheet). Moderate density for the screen; near-tip facet ~0.01mm.
    // ref facet arc near a tip ~ (circ/nTheta). circ~340mm at t=0.5 -> nTheta 1600 => ~0.21mm arc; the
    // reference is the SHEET so its own chord sag near a sharp tip is O(arc^2*curv) — fine as a nearest-point
    // oracle since the mesh facet samples are on/near the surface; adversarial brute cross-check guards it.
    // (c-quick) FAST screen: crest-only, moderate budget (no chordSteiner) — localize the ridge + serration
    // in a few minutes. The chordSteiner baseline (matching the prior 0.13) is a SEPARATE checkpoint below.
    if (!done(tag, 'quick')) {
      const sk = buildCrestSkeleton(rA);
      console.log(`crest skeleton: ${sk.nCrest} pts`);
      let b: ReturnType<typeof buildMesh>;
      const meshCache = join(ROOT, tag, 'quick_mesh.bin');
      if (existsSync(meshCache)) {
        const raw = readFileSync(meshCache);
        const nUt = raw.readUInt32LE(0); const nIdx = raw.readUInt32LE(4);
        const ut = Array.from(new Float64Array(raw.buffer, raw.byteOffset + 8, nUt));
        const idx = new Uint32Array(raw.buffer.slice(raw.byteOffset + 8 + nUt * 8, raw.byteOffset + 8 + nUt * 8 + nIdx * 4));
        const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
        const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
        b = { ut, idx, xyz: meshUt.xyz, vtx, nonMan: auditNonManByIndex(meshUt.xyz, idx), tris: idx.length / 3, hitBudget: false };
        console.log(`quick mesh (cached): ${b.tris} tris`);
      } else {
        b = buildMesh(rA, sk.injected, {});
        const ut64 = Float64Array.from(b.ut);
        const hdr = Buffer.alloc(8); hdr.writeUInt32LE(ut64.length, 0); hdr.writeUInt32LE(b.idx.length, 4);
        writeFileSync(meshCache, Buffer.concat([hdr, Buffer.from(ut64.buffer), Buffer.from(b.idx.buffer, b.idx.byteOffset, b.idx.byteLength)]));
        console.log(`quick mesh: ${b.tris} tris, nonMan=${b.nonMan}`);
      }
      const cheap = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: 0.005 });
      const { loc } = buildSheetRefLocator(rA, DIMS.H, 1600, 400, 2.0);
      const tw = trustedWorst(b.ut, b.xyz, b.idx, cheap.faceErr, loc, 400, 0.01);
      const featUt: number[] = [];
      for (const ln of sk.refinedLines) for (const p of ln.points) featUt.push(p.u, p.t);
      const serr = serrationToMeshEdge(featUt, rA, DIMS.H, b.xyz, b.idx);
      const tq = triangleQualityDistribution({ vertices: b.vtx, indices: b.idx });
      const rec = {
        config: 'crest-only (quick)', tris: b.tris, nonMan: b.nonMan,
        cheapGN: { worstMm: cheap.worstMm, nOver01: Math.round(cheap.fracOver(0.01) * b.tris), nOver03: Math.round(cheap.fracOver(0.03) * b.tris) },
        bvhTrusted: { worstMm: tw.worstMm, nOver01: tw.nOverTol, advMaxRatio: tw.advMaxRatio },
        worstFacets: tw.overFacets.slice(0, 12),
        serrationMm: serr,
        quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
      };
      ckpt(tag, 'quick', rec);
      console.log('QUICK cheapGN', JSON.stringify(rec.cheapGN), 'bvhTrusted', JSON.stringify(rec.bvhTrusted), 'serr', JSON.stringify(serr));
    }

    // (c) BASELINE: crest-conforming + chordSteiner@0.01 (the prior best; expect ~0.13 tail).
    if (process.env.PF_SFBPUSH_BASELINE === '1' && !done(tag, 'baseline')) {
      const sk = buildCrestSkeleton(rA);
      const b = buildMesh(rA, sk.injected, { chordSteiner: true, chordTolMm: 0.01, maxPoints: 2_500_000 });
      console.log(`baseline mesh: ${b.tris} tris, nonMan=${b.nonMan}, hitBudget=${b.hitBudget}`);
      // FAST ruler chain: cheap labkit GN perFaceTrue3DSag (same-(u,t) pre-filter -> projects only real-residual
      // facets) gives faceErr O(nF); then the TRUSTED BVH runs ONLY on the top-400 worst facets.
      const cheap = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: 0.005 });
      const { loc } = buildSheetRefLocator(rA, DIMS.H, 1600, 400, 2.0);
      const tw = trustedWorst(b.ut, b.xyz, b.idx, cheap.faceErr, loc, 400, 0.01);
      // serration: are the refined ridge loci embedded as mesh edges?
      const featUt: number[] = [];
      for (const ln of sk.refinedLines) for (const p of ln.points) featUt.push(p.u, p.t);
      const serr = serrationToMeshEdge(featUt, rA, DIMS.H, b.xyz, b.idx);
      const tq = triangleQualityDistribution({ vertices: b.vtx, indices: b.idx });
      const rec = {
        config: 'crest+chordSteiner@0.01', tris: b.tris, nonMan: b.nonMan, hitBudget: b.hitBudget,
        cheapGN: { worstMm: cheap.worstMm, nOver01: Math.round(cheap.fracOver(0.01) * b.tris), nOver03: Math.round(cheap.fracOver(0.03) * b.tris) },
        bvhTrusted: { worstMm: tw.worstMm, nOver01: tw.nOverTol, advMaxRatio: tw.advMaxRatio },
        worstFacets: tw.overFacets.slice(0, 12),
        serrationMm: serr,
        quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
      };
      ckpt(tag, 'baseline', rec);
      console.log('BASELINE cheapGN', JSON.stringify(rec.cheapGN), 'bvhTrusted', JSON.stringify(rec.bvhTrusted), 'serr', JSON.stringify(serr));
      expect(tw.worstMm).toBeGreaterThan(0);
    }
    console.log('DIAG done');
  }, 3_600_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 1b — TRACE-SANITY: verify the analytic petal loci are sane (reach t=0/t=1, seam-split,
//   land ON the true ridge) BEFORE the expensive conform build. Cheap (no mesh build).
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH TRACE-SANITY — analytic petal loci', () => {
  it.skipIf(process.env.PF_SFBPUSH_TRACESANITY !== '1')('checks traced loci reach boundaries + land on ridge', () => {
    const tag = 'trace';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    // stats: how many loci reach t~0 and t~1; how many chains; how many crest vs valley.
    let reach0 = 0, reach1 = 0, nCrest = 0, nValley = 0, totalPts = 0;
    // ridge-landing: is each locus point at a radial extremum? sample d r / d theta ~ 0.
    let maxGrad = 0; const dth = 1e-4;
    for (const ln of loci) {
      if (ln.label === 'crest') nCrest++; else nValley++;
      const t0 = ln.points[0].t, tN = ln.points[ln.points.length - 1].t;
      if (Math.min(t0, tN) < 0.01) reach0++;
      if (Math.max(t0, tN) > 0.99) reach1++;
      totalPts += ln.points.length;
      for (const p of ln.points) {
        const z = p.t * DIMS.H;
        const g = Math.abs(rA(TAU * (p.u + dth), z) - rA(TAU * (p.u - dth), z)) / (2 * dth * TAU);
        // normalize by local relief per radian; a true extremum => ~0
        if (g > maxGrad) maxGrad = g;
      }
    }
    const rec = { nLoci: loci.length, nCrest, nValley, reachT0: reach0, reachT1: reach1, totalPts, maxRidgeGradMmPerRad: maxGrad };
    ckpt(tag, 'sanity', rec);
    console.log('TRACE-SANITY', JSON.stringify(rec));
    expect(loci.length).toBeGreaterThan(0);
    expect(reach1).toBeGreaterThan(0);
  }, 600_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — TRACE-CONFORM: build with the seam-aware + rim-reaching TRACED skeleton as constraint
//   edges (fixes the DIAG seam/rim residual), optionally + chordSteiner. Trusted-BVH measure.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH TRACE-CONFORM — seam/rim-aware ridge conforming', () => {
  it.skipIf(process.env.PF_SFBPUSH_TRACE !== '1')('conforms the petal ridges incl. seam+rim (resumable)', () => {
    const tag = 'trace';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const stepMm = Number(process.env.PF_SFBPUSH_STEP ?? '0.15');
    const kind = (process.env.PF_SFBPUSH_KIND ?? 'both') as 'crest' | 'valley' | 'both';
    const steiner = process.env.PF_SFBPUSH_NOSTEINER !== '1';
    const name = `conform_${kind}_step${String(stepMm).replace('.', 'p')}${steiner ? '_st' : ''}`;
    if (done(tag, name)) { console.log(`SKIP ${name}`); return; }
    const sk = buildTracedSkeleton(rA, stepMm, kind);
    console.log(`traced skeleton: ${sk.injected.length / 2} pts, ${sk.constraintPairs.length / 2} constraint edges`);
    const b = buildMesh(rA, sk.injected, {
      constraintPairs: sk.constraintPairs,
      ...(steiner ? { chordSteiner: true, chordTolMm: 0.01, maxPoints: 3_000_000 } : {}),
    });
    console.log(`mesh: ${b.tris} tris, nonMan=${b.nonMan}, constraint=${JSON.stringify(b.constraint)}`);
    // dump mesh cache for the confirm/heatmap step
    const ut64 = Float64Array.from(b.ut);
    const hdr = Buffer.alloc(8); hdr.writeUInt32LE(ut64.length, 0); hdr.writeUInt32LE(b.idx.length, 4);
    writeFileSync(join(ckptDir(tag), `${name}_mesh.bin`), Buffer.concat([hdr, Buffer.from(ut64.buffer), Buffer.from(b.idx.buffer, b.idx.byteOffset, b.idx.byteLength)]));
    // measure
    const cheap = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: 0.005 });
    const { loc } = buildSheetRefLocator(rA, DIMS.H, 1600, 400, 2.0);
    const tw = trustedWorst(b.ut, b.xyz, b.idx, cheap.faceErr, loc, 800, 0.01);
    // serration vs the traced loci (dense)
    const featUt: number[] = [];
    for (const ln of sk.loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, b.xyz, b.idx);
    const tq = triangleQualityDistribution({ vertices: b.vtx, indices: b.idx });
    const rec = {
      config: name, stepMm, kind, steiner, tris: b.tris, nonMan: b.nonMan, constraint: b.constraint,
      cheapGN: { worstMm: cheap.worstMm, nOver01: Math.round(cheap.fracOver(0.01) * b.tris), nOver03: Math.round(cheap.fracOver(0.03) * b.tris) },
      bvhTrusted: { worstMm: tw.worstMm, nOver01: tw.nOverTol, advMaxRatio: tw.advMaxRatio },
      worstFacets: tw.overFacets.slice(0, 15),
      serrationMm: serr,
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(tag, name, rec);
    console.log(`TRACE-CONFORM ${name}`, JSON.stringify(rec.bvhTrusted), 'serr', JSON.stringify(serr), 'q', JSON.stringify(rec.quality));
    expect(b.nonMan).toBe(0);
  }, 3_600_000);
});

// ─── load a cached mesh bin (ut+idx) written by any build block ───
function loadMeshBin(path: string, rA: AnalyticRadiusFn): {
  ut: number[]; idx: Uint32Array; xyz: Float32Array; vtx: Float64Array; nonMan: number; tris: number;
} {
  const raw = readFileSync(path);
  const nUt = raw.readUInt32LE(0); const nIdx = raw.readUInt32LE(4);
  const ut = Array.from(new Float64Array(raw.buffer.slice(raw.byteOffset + 8, raw.byteOffset + 8 + nUt * 8)));
  const idx = new Uint32Array(raw.buffer.slice(raw.byteOffset + 8 + nUt * 8, raw.byteOffset + 8 + nUt * 8 + nIdx * 4));
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
  return { ut, idx, xyz: meshUt.xyz, vtx, nonMan: auditNonManByIndex(meshUt.xyz, idx), tris: idx.length / 3 };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — MEASURE-ONLY: load a cached mesh, run trusted-BVH + serration + heatmap dump. Lets a
//   build be scored/re-scored without the expensive rebuild (resilient: build once, measure many).
//   PF_SFBPUSH_MEASURE_BIN = mesh-bin filename under trace/ (e.g. conform_both_step0p15_st_mesh.bin).
//   PF_SFBPUSH_MEASURE_KIND = crest|valley|both (which traced loci to score serration against).
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH MEASURE — score a cached mesh (trusted BVH + serration + heatmap)', () => {
  it.skipIf(process.env.PF_SFBPUSH_MEASURE !== '1')('scores + heatmaps a cached mesh', () => {
    const tag = process.env.PF_SFBPUSH_MEASURE_TAG ?? 'trace';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const binName = process.env.PF_SFBPUSH_MEASURE_BIN ?? 'conform_both_step0p15_st_mesh.bin';
    const measKind = (process.env.PF_SFBPUSH_MEASURE_KIND ?? 'both') as 'crest' | 'valley' | 'both';
    const outName = `meas_${binName.replace('_mesh.bin', '')}`;
    const b = loadMeshBin(join(ROOT, tag, binName), rA);
    console.log(`loaded ${b.tris} tris, nonMan=${b.nonMan}`);
    const cheap = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: 0.005 });
    // OWN-(u,t) per-facet chord sag: the HONEST interior-bulge ruler for a single-valued surface. It does
    // NOT mis-read the degenerate seam slivers (FACET-INSPECT: those are geometrically exact, ownSag=0, but
    // the nearest-surface GN/brute projection reports a spurious ~0.03 well). Since every mesh vertex is ON
    // the true surface, the ONLY real per-facet error is the surface bulge over the facet's OWN (u,t) domain.
    const own = perFaceChordSag(b.ut, b.idx, rA, DIMS.H);
    // trusted analytic worst among the facets whose OWN-sag is real (>tol) — filters the seam-sliver artifact.
    const twOwn = trustedWorstAnalytic(b.ut, b.xyz, b.idx, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
    const { loc } = buildSheetRefLocator(rA, DIMS.H, 1600, 400, 2.0);
    const tw = trustedWorst(b.ut, b.xyz, b.idx, cheap.faceErr, loc, 1000, 0.01);
    // serration vs traced loci
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: measKind });
    const featUt: number[] = [];
    for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, b.xyz, b.idx);
    const tq = triangleQualityDistribution({ vertices: b.vtx, indices: b.idx });
    // heatmap: colour by the HONEST own-(u,t) chord sag (reads degenerate seam slivers ~0, unlike the
    // nearest-surface projector which mis-reads them). scale 0.01 => any yellow/red facet is a real >0.005/>0.01.
    const col = vertColorsFrom(own.vertErr, 0.01);
    const p99 = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * b.tris)] ?? 0;
    dumpRenderBins(ckptDir(tag), outName, b.xyz, b.idx, {
      colors: col,
      meta: { ruler: 'true3d(own)', worstMm: twOwn.worstMm, p99Mm: p99, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE },
      stl: process.env.PF_SFBPUSH_STL === '1',
    });
    const rec = {
      config: outName, bin: binName, tris: b.tris, nonMan: b.nonMan,
      cheapGN: { worstMm: cheap.worstMm, nOver01: Math.round(cheap.fracOver(0.01) * b.tris), nOver03: Math.round(cheap.fracOver(0.03) * b.tris), pctOver01: 100 * cheap.fracOver(0.01) },
      ownSag: { worstMm: own.worstMm, nOver01: Math.round(own.fracOver(0.01) * b.tris), nOver005: Math.round(own.fracOver(0.005) * b.tris) },
      ownTrusted: { worstMm: twOwn.worstMm, nOver01: twOwn.nOverTol, worstFacets: twOwn.overFacets.slice(0, 15) },
      bvhTrusted: { worstMm: tw.worstMm, nOver01: tw.nOverTol, advMaxRatio: tw.advMaxRatio },
      worstFacets: tw.overFacets.slice(0, 20),
      serrationMm: serr,
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(tag, outName, rec);
    console.log(`MEASURE ${outName} bvh`, JSON.stringify(rec.bvhTrusted), 'ownSag', JSON.stringify(rec.ownSag), 'ownTrusted', JSON.stringify({ worstMm: twOwn.worstMm, nOver01: twOwn.nOverTol }), 'serr', JSON.stringify(serr), 'q', JSON.stringify(rec.quality));
    expect(b.tris).toBeGreaterThan(0);
  }, 3_600_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 1c — CORNER-CLASS: the definitive reachability discriminator. At the worst residual location
//   (u~0.858, t~0.15 base tip), measure chord-sag vs facet width: LINEAR => C1 corner (impractical,
//   like GothicArches V-rib); QUADRATIC => smooth-steep (density-reducible to 0.01). Cheap (no build).
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH CORNER-CLASS — sag-vs-width scaling at the worst residual', () => {
  it.skipIf(process.env.PF_SFBPUSH_CORNER !== '1')('measures sag scaling at the base-tip + seam residuals', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    // sample locations from the DIAG/MEASURE worst-facet clusters
    const locs = [
      { name: 'baseTip_u0858_t015', u: 0.8578, t: 0.150 },
      { name: 'shoulder_u0994_t069', u: 0.9938, t: 0.687 },
      { name: 'rim_u035_t10', u: 0.35, t: 0.999 },
      { name: 'baseFloor_u0084_t0', u: 0.084, t: 0.0 },      // residual cluster 1 (base floor tips)
      { name: 'seamTip_u0_t0675', u: 0.0, t: 0.675 },        // residual cluster 2 (seam tips)
    ];
    const P3 = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    // For a locus, build a tiny facet across the ridge (perp to it) of half-width h in u, chord = dist of
    // the true midpoint-surface to the facet chord. Scan h and fit sag ~ h^p.
    const rows: any[] = [];
    for (const L of locs) {
      // find the local ridge u by golden-section max around L.u (crest) — the feature is a radial extremum
      const z = L.t * DIMS.H;
      const rAt = (u: number): number => rA(TAU * (((u % 1) + 1) % 1), z);
      let lo = L.u - 0.03, hi = L.u + 0.03; const gr = (Math.sqrt(5) - 1) / 2;
      let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = rAt(c1), f2 = rAt(c2);
      for (let it = 0; it < 40; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = rAt(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = rAt(c1); } }
      const uTip = (lo + hi) / 2;
      // ONE-SIDED shoulder sag = what an EMBEDDED-RIDGE mesh actually has: the tip is a VERTEX; a shoulder
      //   facet runs from the tip to a point at distance h on ONE side. Sag = max over the shoulder of the
      //   true surface vs the tip->side chord (perpendicular). Also record the ACROSS-tip sag for contrast.
      const scan: any[] = [];
      for (const h of [0.02, 0.01, 0.005, 0.0025, 0.00125, 0.000625]) {
        const T = P3(uTip, L.t);
        // one-sided: tip -> uTip+h ; sample sag at several interior points of the shoulder
        const S = P3(uTip + h, L.t);
        let oneSided = 0;
        for (let k = 1; k < 8; k++) {
          const f = k / 8; const Q = P3(uTip + h * f, L.t);
          const cx = T[0] + (S[0] - T[0]) * f, cy = T[1] + (S[1] - T[1]) * f, cz = T[2] + (S[2] - T[2]) * f;
          const d = Math.hypot(Q[0] - cx, Q[1] - cy, Q[2] - cz);
          if (d > oneSided) oneSided = d;
        }
        // across-tip (for contrast)
        const A = P3(uTip - h, L.t), B = P3(uTip + h, L.t);
        const acrossSag = Math.hypot(T[0] - (A[0] + B[0]) / 2, T[1] - (A[1] + B[1]) / 2, T[2] - (A[2] + B[2]) / 2);
        scan.push({ hU: h, arcMm: h * TAU * 50, oneSidedSagMm: oneSided, acrossSagMm: acrossSag });
      }
      const s = scan;
      const pOne = Math.log(s[s.length - 2].oneSidedSagMm / s[s.length - 1].oneSidedSagMm) / Math.log(s[s.length - 2].hU / s[s.length - 1].hU);
      const pAcross = Math.log(s[s.length - 2].acrossSagMm / s[s.length - 1].acrossSagMm) / Math.log(s[s.length - 2].hU / s[s.length - 1].hU);
      rows.push({ ...L, uTip, expOneSided: pOne, expAcross: pAcross, scan });
    }
    ckpt('corner', 'scaling', { rows });
    console.log('CORNER-CLASS', JSON.stringify(rows.map((r) => ({ name: r.name, expOne: +r.expOneSided.toFixed(2), oneSidedFinest: +r.scan[r.scan.length - 1].oneSidedSagMm.toFixed(4), arcFinest: +r.scan[r.scan.length - 1].arcMm.toFixed(3) }))));
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 3b — SEAM DIAG: why are facets AT u=0/u=1 (the seam) ~0.34mm off? Load a cached mesh, list
//   the worst seam facets with their 3 vertex (u,t) + the true surface at the worst sample.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH SEAM-DIAG — inspect the u=0/1 seam residual', () => {
  it.skipIf(process.env.PF_SFBPUSH_SEAMDIAG !== '1')('lists worst seam facets from a cached mesh', () => {
    const tag = process.env.PF_SFBPUSH_SEAMDIAG_TAG ?? 'steiner';
    const binName = process.env.PF_SFBPUSH_SEAMDIAG_BIN ?? 'iter0_mesh.bin';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const b = loadMeshBin(join(ROOT, tag, binName), rA);
    const gn = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: 0.005 });
    const nF = b.idx.length / 3;
    // worst facets that TOUCH the seam (a vertex with u<0.02 or u>0.98)
    const seamFaces: number[] = [];
    for (let f = 0; f < nF; f++) {
      if (gn.faceErr[f] <= 0.02) continue;
      const a = b.idx[3 * f], bb = b.idx[3 * f + 1], c = b.idx[3 * f + 2];
      const us = [b.ut[2 * a], b.ut[2 * bb], b.ut[2 * c]];
      if (us.some((u) => u < 0.02 || u > 0.98)) seamFaces.push(f);
    }
    seamFaces.sort((x, y) => gn.faceErr[y] - gn.faceErr[x]);
    const rows = seamFaces.slice(0, 15).map((f) => {
      const a = b.idx[3 * f], bb = b.idx[3 * f + 1], c = b.idx[3 * f + 2];
      const v = (i: number): [number, number] => [b.ut[2 * i], b.ut[2 * i + 1]];
      return { f, sag: gn.faceErr[f], v: [v(a), v(bb), v(c)] };
    });
    const rec = { tag, bin: binName, tris: nF, seamOverTol: seamFaces.length, worstSeam: rows };
    ckpt('seamdiag', binName.replace('.bin', ''), rec);
    console.log('SEAM-DIAG worst seam facets', JSON.stringify(rows.slice(0, 6)));
    expect(nF).toBeGreaterThan(0);
  }, 1_200_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 3c — FACET INSPECT: load a cached mesh, dump the exact geometry of the worst facets near a
//   target (u*,t*). Prints the 3 vertices (u,t + 3D), the facet's own dense chord sag (independent of
//   GN/brute), and whether a mesh VERTEX sits on the local ridge tip. Tells fixable-defect vs cusp.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH FACET-INSPECT — exact geometry of a worst facet', () => {
  it.skipIf(process.env.PF_SFBPUSH_INSPECT !== '1')('inspects worst facets near a target (u,t)', () => {
    const tag = process.env.PF_SFBPUSH_INSPECT_TAG ?? 'ladder';
    const binName = process.env.PF_SFBPUSH_INSPECT_BIN ?? 'ladder_both_step0p08_offs6_rail_brow_mesh.bin';
    const uT = Number(process.env.PF_SFBPUSH_INSPECT_U ?? '1.0');
    const tT = Number(process.env.PF_SFBPUSH_INSPECT_T ?? '0.676');
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const b = loadMeshBin(join(ROOT, tag, binName), rA);
    const P3 = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    // find facets whose centroid (seam-normed) is near (uT,tT)
    const nF = b.idx.length / 3;
    const cand: Array<{ f: number; du: number; dt: number }> = [];
    for (let f = 0; f < nF; f++) {
      const a = b.idx[3 * f], bb = b.idx[3 * f + 1], c = b.idx[3 * f + 2];
      let ua = b.ut[2 * a], ub = b.ut[2 * bb], uc = b.ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const cu = ((ua + ub + uc) / 3) % 1, ct = (b.ut[2 * a + 1] + b.ut[2 * bb + 1] + b.ut[2 * c + 1]) / 3;
      let du = Math.abs(cu - uT); if (du > 0.5) du = 1 - du; const dt = Math.abs(ct - tT);
      if (du < 0.01 && dt < 0.02) cand.push({ f, du, dt });
    }
    cand.sort((x, y) => (x.du + x.dt) - (y.du + y.dt));
    const rows = cand.slice(0, 8).map(({ f }) => {
      const a = b.idx[3 * f], bb = b.idx[3 * f + 1], c = b.idx[3 * f + 2];
      const V = [a, bb, c].map((i) => ({ u: +b.ut[2 * i].toFixed(5), t: +b.ut[2 * i + 1].toFixed(5) }));
      // facet's own dense chord sag: sample the true surface over the facet's (u,t) triangle, perpendicular to facet plane
      const p = [P3(b.ut[2 * a], b.ut[2 * a + 1]), P3(b.ut[2 * bb], b.ut[2 * bb + 1]), P3(b.ut[2 * c], b.ut[2 * c + 1])];
      let nx = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      let ny = (p[1][1] - p[0][1]) * (p[2][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[2][1] - p[0][1]);
      let nz = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let ua = b.ut[2 * a], ub = b.ut[2 * bb], uc = b.ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = b.ut[2 * a + 1], tb = b.ut[2 * bb + 1], tc = b.ut[2 * c + 1];
      let sag = 0;
      for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12 - i; j++) {
        const w0 = i / 12, w1 = j / 12, w2 = 1 - w0 - w1; if (w2 < 0) continue;
        let u = w0 * ua + w1 * ub + w2 * uc; u -= Math.floor(u); const t = w0 * ta + w1 * tb + w2 * tc;
        const S = P3(u, t);
        const fx = w0 * p[0][0] + w1 * p[1][0] + w2 * p[2][0], fy = w0 * p[0][1] + w1 * p[1][1] + w2 * p[2][1], fz = w0 * p[0][2] + w1 * p[1][2] + w2 * p[2][2];
        const d = Math.abs((S[0] - fx) * nx + (S[1] - fy) * ny + (S[2] - fz) * nz);
        if (d > sag) sag = d;
      }
      return { f, V, ownChordSagMm: +sag.toFixed(4) };
    });
    ckpt('inspect', binName.replace('.bin', ''), { target: { u: uT, t: tT }, tris: nF, nCand: cand.length, facets: rows });
    console.log('FACET-INSPECT', JSON.stringify(rows.slice(0, 4)));
    expect(nF).toBeGreaterThan(0);
  }, 1_200_000);
});

// ─── collect worst-sample (u,t) of every facet whose GN true-3D sag > tol (for true-3D-driven Steiner) ───
function collectOverTolSamples(ut: number[], indices: ArrayLike<number>, faceErr: Float64Array, tolMm: number): number[] {
  const nF = indices.length / 3;
  const out: number[] = [];
  const bary = SAG_BARY_LOCAL;
  for (let f = 0; f < nF; f++) {
    if (faceErr[f] <= tolMm) continue;
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    // worst sample = centroid for interior-bulge faces (matches chordSteiner's Steiner choice)
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    // inject the centroid + the 3 edge-midpoints of over-tol facets (dense enough to split the steep facet)
    for (const [wa, wb, wc] of bary) {
      let u = wa * ua + wb * ub + wc * uc; u -= Math.floor(u);
      const t = Math.min(1, Math.max(0, wa * ta + wb * tb + wc * tc));
      out.push(u, t);
    }
  }
  return out;
}
const SAG_BARY_LOCAL: ReadonlyArray<readonly [number, number, number]> = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — FINE-BASE + TIP-LADDER: the decisive recipe. FINE metric base (densifies properly, unlike
//   the coarse-inject loop that stalled at 0.148) + traced seam/rim ridges (serration ~0) + a graded
//   PERPENDICULAR tip ladder that FORCES sub-metric cells at the fractional-power cusps (CORNER-CLASS:
//   arc ~0.025mm reaches 0.01 at exp 0.86). Analytic-trusted ruler. Dumps mesh + heatmap + (opt) STL.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH LADDER — fine base + perpendicular tip ladder', () => {
  it.skipIf(process.env.PF_SFBPUSH_LADDER !== '1')('drives tip cusps to 0.01 via forced fine cells (resumable)', () => {
    const tag = 'ladder';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const stepMm = Number(process.env.PF_SFBPUSH_STEP ?? '0.1');
    // GRADED step: fine (gradeStep) only at the SHARP base (t<0.3), coarse (stepMm) above — avoids the
    // 173k-edge over-constraint of uniform fine step (which regressed to 72 nonMan). Off unless set.
    const gradeStep = process.env.PF_SFBPUSH_GRADESTEP ? Number(process.env.PF_SFBPUSH_GRADESTEP) : undefined;
    const maxPts = Number(process.env.PF_SFBPUSH_MAXPTS ?? '4000000');
    // graded perpendicular offsets (mm): fine near the cusp out to the metric scale. Env-tunable.
    const offs = (process.env.PF_SFBPUSH_OFFS ?? '0.006,0.013,0.028,0.06,0.12,0.22').split(',').map(Number);
    const ladderKind = (process.env.PF_SFBPUSH_LKIND ?? 'both') as 'crest' | 'valley' | 'both';
    const noConstraint = process.env.PF_SFBPUSH_NOCONSTRAINT === '1';
    const rail = process.env.PF_SFBPUSH_RAIL === '1', brows = process.env.PF_SFBPUSH_NOBROWS !== '1';
    const name = `ladder_${ladderKind}_step${String(stepMm).replace('.', 'p')}${gradeStep ? `g${String(gradeStep).replace('.', 'p')}` : ''}_offs${offs.length}${noConstraint ? '_nc' : ''}${rail ? '_rail' : ''}${brows ? '_brow' : ''}_v2`;
    if (done(tag, name)) { console.log(`SKIP ${name}`); return; }
    const sk = buildTracedSkeleton(rA, stepMm, 'both', gradeStep);
    const uToMm = TAU * 50;
    // tip ladder on the sharp features (crest tips are the worst per CORNER-CLASS; both incl. valleys)
    const ladderLoci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: ladderKind });
    const ladder = tipLadderPoints(ladderLoci, offs, uToMm, DIMS.H);
    // SEAM RAIL: the seam residual (u=0/1) is a triangulation artifact (CORNER-CLASS: exp 2.0, sag 1e-4 @
    // arc 0.196 => smooth, NOT a cusp) — a facet bridging the seam. Dense points at u=0 AND u=1 at fine t
    // give the seam a clean rail so no wide facet spans it. Enabled unless PF_SFBPUSH_NORAIL=1.
    // NOTE: the seam RAIL (dense u=0/u=1 points) is DISABLED by default — it CREATED degenerate zero-u-width
    // seam slivers (FACET-INSPECT) that the metric mis-read as 0.034. The real seam fix is in tracePetalLoci
    // (seam-crossing endpoints placed JUST INSIDE the seam at u=1-eps/eps, not exactly at u=0/1). Opt-in only.
    const railPts: number[] = [];
    if (process.env.PF_SFBPUSH_RAIL === '1') {
      const nT = Number(process.env.PF_SFBPUSH_RAILN ?? '900');
      for (let i = 0; i <= nT; i++) { const t = i / nT; railPts.push(1e-4, t); railPts.push(1 - 1e-4, t); }
    }
    // BASE/RIM TIP ROWS: the t=0 / t=1 petal tips are GENUINE cusps (exp 0.86) whose perpendicular ladder
    // is clamped at the boundary. Add fine t-rows near t=0 and t=1 ON each ridge so the boundary tip cusp
    // gets fine cells too. Enabled unless PF_SFBPUSH_NOBROWS=1.
    const browPts: number[] = [];
    if (process.env.PF_SFBPUSH_NOBROWS !== '1') {
      const fineT = [0.001, 0.002, 0.004, 0.008, 0.016, 0.032];
      for (const ln of ladderLoci) {
        // ridge u at t~0 and t~1 = the endpoint u's
        const p0 = ln.points[0], p1 = ln.points[ln.points.length - 1];
        for (const ft of fineT) {
          if (p0.t < 0.05) { browPts.push(p0.u, ft); for (const o of offs) { let u = p0.u + o / uToMm; u -= Math.floor(u); browPts.push(u, ft); u = p0.u - o / uToMm; u -= Math.floor(u); browPts.push(u, ft); } }
          if (p1.t > 0.95) { browPts.push(p1.u, 1 - ft); for (const o of offs) { let u = p1.u + o / uToMm; u -= Math.floor(u); browPts.push(u, 1 - ft); u = p1.u - o / uToMm; u -= Math.floor(u); browPts.push(u, 1 - ft); } }
        }
      }
    }
    console.log(`skeleton ${sk.injected.length / 2} + edges ${sk.constraintPairs.length / 2} + ladder ${ladder.length / 2} + rail ${railPts.length / 2} + brows ${browPts.length / 2}`);
    const injected = sk.injected.concat(ladder).concat(railPts).concat(browPts);
    const b = buildMesh(rA, injected, { ...(noConstraint ? {} : { constraintPairs: sk.constraintPairs }), maxPoints: maxPts });
    console.log(`mesh ${b.tris} tris, nonMan ${b.nonMan}, hitBudget ${b.hitBudget}, constraint ${JSON.stringify(b.constraint)}`);
    // cache mesh
    const ut64 = Float64Array.from(b.ut);
    const hdr = Buffer.alloc(8); hdr.writeUInt32LE(ut64.length, 0); hdr.writeUInt32LE(b.idx.length, 4);
    writeFileSync(join(ckptDir(tag), `${name}_mesh.bin`), Buffer.concat([hdr, Buffer.from(ut64.buffer), Buffer.from(b.idx.buffer, b.idx.byteOffset, b.idx.byteLength)]));
    // measure: GN over whole mesh + analytic-trusted worst on the top facets
    const gn = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: 0.007 });
    const tw = trustedWorstAnalytic(b.ut, b.xyz, b.idx, gn.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
    // HONEST ruler: own-(u,t) chord to FILTER out degenerate seam slivers (they read ~0), then analytic-
    // nearest to MEASURE. This is the number that survived the ruler-disambiguation (raw nearest mis-reads slivers).
    const own = perFaceChordSag(b.ut, b.idx, rA, DIMS.H);
    const twOwn = trustedWorstAnalytic(b.ut, b.xyz, b.idx, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
    const tq = triangleQualityDistribution({ vertices: b.vtx, indices: b.idx });
    // serration
    const featUt: number[] = []; for (const ln of sk.loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, b.xyz, b.idx);
    const rec = {
      config: name, stepMm, gradeStep, offs, ladderKind, tris: b.tris, nonMan: b.nonMan, hitBudget: b.hitBudget, constraint: b.constraint,
      gnWorstMm: gn.worstMm, trustedWorstMm: tw.worstMm, maxGnMinusBrute: tw.maxGnMinusBrute, maxBruteMinusGn: tw.maxBruteMinusGn,
      ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol, ownWorstMm: own.worstMm,
      gnNOver01: Math.round(gn.fracOver(0.01) * b.tris), gnNOver005: Math.round(gn.fracOver(0.005) * b.tris),
      trustedNOver01: tw.nOverTol, pctOver01: 100 * gn.fracOver(0.01),
      ownTrustedWorstFacets: twOwn.overFacets.slice(0, 15),
      serrationMm: serr, quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(tag, name, rec);
    // heatmap (colour by the HONEST own-(u,t) faceErr, scale 0.01)
    const col = vertColorsFrom(own.vertErr, 0.01);
    const p99 = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * b.tris)] ?? 0;
    dumpRenderBins(ckptDir(tag), name, b.xyz, b.idx, {
      colors: col, meta: { ruler: 'true3d(own)', worstMm: twOwn.worstMm, p99Mm: p99, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE },
      stl: process.env.PF_SFBPUSH_STL === '1',
    });
    console.log(`LADDER ${name} OWN-trusted ${twOwn.worstMm.toFixed(4)} (nOver01 ${twOwn.nOverTol}) | raw-trusted ${tw.worstMm.toFixed(4)} gnNOver01 ${rec.gnNOver01} serr ${serr.worstMm.toExponential(2)} nonMan ${b.nonMan} q ${JSON.stringify(rec.quality)}`);
    expect(b.tris).toBeGreaterThan(0);
  }, 3_600_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — TRUE-3D STEINER LOOP: the radial chordSteiner guard STALLS on near-vertical petal
//   shoulders (satisfied at the wall, true-3D sag not). Drive refinement by MY true-3D ruler:
//   iteratively inject a Steiner cloud at every facet whose GN true-3D sag > 0.01, rebuild, repeat.
//   Base = the traced seam/rim-aware conform (serration ~0). Each iter checkpoints mesh+stats.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('SFB-PUSH TRUE3D-STEINER — perpendicular-metric-driven refinement loop', () => {
  it.skipIf(process.env.PF_SFBPUSH_STEINER !== '1')('drives true-3D sag <=0.01 by iterative Steiner (resumable)', () => {
    const tag = 'steiner';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const stepMm = Number(process.env.PF_SFBPUSH_STEP ?? '0.15');
    const tol = Number(process.env.PF_SFBPUSH_TOL ?? '0.01');
    const nIters = Number(process.env.PF_SFBPUSH_ITERS ?? '6');
    const maxPts = Number(process.env.PF_SFBPUSH_MAXPTS ?? '6000000');
    // chordSteiner is a RADIAL guard that STALLS on near-vertical shoulders AND eats the budget (iter0
    // hit 4M pts with chordSteiner and never reached the true-3D injection). Drive refinement PURELY by
    // MY true-3D ruler by default; PF_SFBPUSH_CHORDSTEINER=1 re-enables the radial guard for an A/B.
    const useChordSteiner = process.env.PF_SFBPUSH_CHORDSTEINER === '1';
    // base traced skeleton (constraint edges) — fixed across iters; Steiner points appended each iter.
    const sk = buildTracedSkeleton(rA, stepMm, 'both');
    console.log(`traced skeleton: ${sk.injected.length / 2} pts, ${sk.constraintPairs.length / 2} edges`);
    let steinerPts: number[] = [];
    // resume: find the last completed iteration checkpoint
    let startIter = 0;
    for (let i = nIters; i >= 0; i--) { if (done(tag, `iter${i}`)) { startIter = i + 1; const prev = load(tag, `iter${i}`); if (prev.steinerFile) { const raw = readFileSync(join(ROOT, tag, prev.steinerFile)); steinerPts = Array.from(new Float64Array(raw.buffer, raw.byteOffset, raw.length / 8)); } break; } }
    for (let iter = startIter; iter <= nIters; iter++) {
      console.log(`--- STEINER iter ${iter}: base ${sk.injected.length / 2} + steiner ${steinerPts.length / 2} pts ---`);
      const injected = steinerPts.length ? sk.injected.concat(steinerPts) : sk.injected;
      // constraint pairs index into sk.injected (unchanged; steiner appended AFTER so positions valid).
      const b = buildMesh(rA, injected, { coarse: true, constraintPairs: sk.constraintPairs, ...(useChordSteiner ? { chordSteiner: true, chordTolMm: tol } : {}), maxPoints: maxPts });
      // measure GN true-3D over the whole mesh (pre-filter kills the green majority)
      const gn = perFaceTrue3DSag(b.ut, b.idx, rA, DIMS.H, { preFilterMm: tol * 0.7 });
      const nOver = Math.round(gn.fracOver(tol) * b.tris);
      const nOver005 = Math.round(gn.fracOver(0.005) * b.tris);
      // trusted worst via the ANALYTIC brute guard (exact rA, full azimuth) on the top worst-by-GN facets —
      // NOT a discretized BVH (which has its own chord error at the fractional-power tip cusp).
      const tw = trustedWorstAnalytic(b.ut, b.xyz, b.idx, gn.faceErr,
        (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 600, tol);
      const tq = triangleQualityDistribution({ vertices: b.vtx, indices: b.idx });
      // dump mesh cache
      const ut64 = Float64Array.from(b.ut);
      const hdr = Buffer.alloc(8); hdr.writeUInt32LE(ut64.length, 0); hdr.writeUInt32LE(b.idx.length, 4);
      writeFileSync(join(ckptDir(tag), `iter${iter}_mesh.bin`), Buffer.concat([hdr, Buffer.from(ut64.buffer), Buffer.from(b.idx.buffer, b.idx.byteOffset, b.idx.byteLength)]));
      // next steiner cloud = worst samples of THIS mesh's over-tol facets (appended cumulatively)
      const newPts = collectOverTolSamples(b.ut, b.idx, gn.faceErr, tol);
      const merged = steinerPts.concat(newPts);
      const sf = Float64Array.from(merged);
      const sname = `iter${iter}_steiner.f64`;
      writeFileSync(join(ROOT, tag, sname), Buffer.from(sf.buffer));
      const rec = {
        iter, baseSkelPts: sk.injected.length / 2, steinerInPts: steinerPts.length / 2, tris: b.tris, nonMan: b.nonMan, hitBudget: b.hitBudget,
        constraint: b.constraint,
        gnWorstMm: gn.worstMm, trustedWorstMm: tw.worstMm, maxGnMinusBrute: tw.maxGnMinusBrute, maxBruteMinusGn: tw.maxBruteMinusGn,
        nOverTol: nOver, nOver005, pctOverTol: 100 * gn.fracOver(tol),
        newSteinerPts: newPts.length / 2, steinerFile: sname,
        worstFacets: tw.overFacets.slice(0, 12),
        quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
      };
      ckpt(tag, `iter${iter}`, rec);
      console.log(`STEINER iter${iter}: tris ${b.tris}, gnWorst ${gn.worstMm.toFixed(4)}, trusted ${tw.worstMm.toFixed(4)}, nOver${tol} ${nOver}, newSteiner ${newPts.length / 2}, nonMan ${b.nonMan}, minAngle ${tq.minAngleDeg}`);
      steinerPts = merged;
      if (nOver === 0) { console.log(`CONVERGED at iter ${iter} (0 facets > ${tol})`); break; }
      if (b.hitBudget) { console.log(`BUDGET HIT at iter ${iter} (maxPts ${maxPts}) — stop`); break; }
    }
    expect(startIter).toBeLessThanOrEqual(nIters + 1);
  }, 3_600_000);
});
