// _tierc_fac3d.test.ts — FAC-3D arm (PROD-TIERC wire-and-validate): the MISSING true-3D fidelity
// confirm for flipping `featureAlignedCell` default-ON in the production conforming mesher.
//
// CONTEXT: research/lab/tierc/featureAlignedCell-crossstyle-verdict.md banked that the per-cell
// strip-pave graft (`__pfFeatureAlignedCells` + `__pfConformingRefine`, both default-off ⇒
// byte-identical) improves PRODUCTION GothicArches triangle quality 1.9%→1.1% (<20° fraction), 0
// non-manifold, +11.7% tris — CONFIRMED net-positive but UNSHIPPED. research/lab/2026-07-12-
// existing-asset-roadmap.md §Gothic/GeoStar (action item 2) says default-on needs "only a true-3D
// fidelity confirm + GPU A/B" — the banked quality numbers were NEVER accompanied by a
// perpendicular-3D chord regression check. This arm is that CPU (Node-twin) confirm. The browser
// GPU A/B is a SEPARATE later gate (not this arm).
//
// HYPOTHESIS: featureAlignedCell ON inserts only INTERIOR Steiner points on an UNCHANGED conforming
// boundary (watertight by construction, per the cross-style verdict), so it cannot INCREASE the
// true-3D per-facet chord sag vs OFF — the denser interior can only bridge relief equal-or-better,
// UNLESS its anisotropic (ridge-aligned) interior grid produces facets ELONGATED across the relief
// that bridge worse in the cross-ridge direction. This arm measures which.
//
// RULER (metric discipline — LAB-CHEATSHEET §Metric): FIDELITY verdict = TRUE-3D perpendicular
// chord. `perFaceTrue3DSag` (facet→NEAREST analytic surface, single-seed Gauss-Newton) re-lifts the
// mesh (u,t) via the analytic `rA = buildRadiusFn(style,{},dims)` — this is BOTH the lab-standard
// tessellation-fidelity ruler (matches Gothic base true-3D 0.22→0.096, E-2026-06-30) AND faithful to
// the production-exported geometry (the GPU lifts (u,t) analytically; the bilinear GpuSurfaceSampler
// only steered point PLACEMENT, identical between ON/OFF). RADIAL (`perFaceChordSag`, same-(u,t))
// OVERSTATES near-vertical relief 2–370× (arch tips / GeoStar risers) so it is reported as a SCREEN
// only. GN≡brute on non-tangled styles (Gothic/GeoStar/DragonScales) ⇒ GN is honest there; on the
// TANGLED Gyroid lattice single-seed GN overstates up to ~7× (F2) ⇒ Gyroid additionally reports the
// brute-anchored trusted p99 (`bruteAnchoredRedPerp`, worst-N centroid twin) for the honest verdict.
//
// PRE-REGISTERED GATE — PASS-for-flip iff, on EVERY tested style:
//   (1) FIDELITY: true-3D worst ON ≤ OFF + max(2%·OFF, 0.0005mm) AND true-3D p99 ON ≤ same bound
//       (evaluated on ALL facets AND on the feature-region subset — FCT_* sources {3,4,5,7});
//   (2) QUALITY: <20° fraction (pctBelow20) ON ≤ OFF  [Gothic MUST reproduce the banked 1.9%→1.1%;
//       if it does NOT reproduce, that is a first-class finding — STOP and diagnose, do not proceed];
//   (3) WATERTIGHT: auditNonManByIndex == 0 (both modes);
//   (4) TRI DELTA reported (no budget cap — just honest).
// FAIL otherwise, WITH localization (which facets, which sources, chord magnitude). Either way the
// verdict doc research/lab/tierc/featureAlignedCell-true3d-verdict.md is written from the artifacts.
//
// RESILIENCE: one env-gated it() PER STYLE (independently resumable) — order Gothic, GeoStar (both
// MANDATORY), DragonScales, GyroidManifold (cross-style safety, run if budget permits). Each style
// checkpoints crumbs the instant each build is scored and read-merges its row into fac3d_summary.json
// on completion, so a killed run resumes by re-running only the unfinished style. AboveNormal
// self-bump (Windows EcoQoS). Artifacts: research/exchange/tierc/fac3d_crumbs.ndjson + fac3d_summary
// .json. DEV-ONLY: research/ never imported by src/; NO src/ edits — the flags are the only lever.
import { describe, it } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { StyleId } from '../../src/geometry/types';
import { buildRadiusFn } from './runStyle';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from './labkit';
import {
  triangleQualityDistribution, auditNonManByIndex,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp,
} from './labkit';

const ON = process.env.PF_TIERC_FAC3D === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'fac3d_crumbs.ndjson');
const SUMMARY_PATH = join(OUT_DIR, 'fac3d_summary.json');
const PER_STYLE_TIMEOUT_MS = 40 * 60 * 1000;
// FeatureConformingTriangulator sources — the "feature-region" subset (near features, where the
// featureAlignedCell graft operates). PLAIN_QUAD(0)/TRANSITION_FAN(1)/EAR_CLIP(2) are background.
const FEAT_SOURCES = new Set([3, 4, 5, 7]); // FCT_PLAIN_QUAD, FCT_PLAIN_FAN, FCT_FEATURE_CDT, FCT_EAR_CLIP

interface Case { name: StyleId; dims: StyleDims; tangled: boolean; }
// Gothic + GeoStar MANDATORY; DragonScales + GyroidManifold cross-style safety. Dims mirror the
// cross-style probe (Gothic/GeoStar/DS) + TIERC_COMMON_DIMS (Gyroid) — the pinned lab configuration.
const CASES: Case[] = [
  { name: 'GothicArches', dims: { H: 120, Rt: 50, Rb: 40, expn: 1 }, tangled: false },
  { name: 'GeometricStar', dims: { H: 120, Rt: 50, Rb: 40, expn: 1 }, tangled: false },
  { name: 'DragonScales', dims: { H: 120, Rt: 40, Rb: 40, expn: 1 }, tangled: false },
  { name: 'GyroidManifold', dims: { H: 120, Rt: 50, Rb: 40, expn: 1 }, tangled: true },
];

function crumb(extra: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try { appendFileSync(CRUMB_PATH, JSON.stringify({ arm: 'FAC-3D', pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n'); } catch { /* a breadcrumb must never kill the run */ }
}
function bumpPriority(): void { try { os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ } }
function heapLimitMB(): number { return Math.round(getHeapStatistics().heap_size_limit / 1048576); }

interface SagStat { worst: number; p99: number; median: number; n: number; }
function statOf(faceErr: Float64Array, subset?: number[]): SagStat {
  const src = subset ?? Array.from({ length: faceErr.length }, (_, i) => i);
  const n = src.length;
  if (n === 0) return { worst: 0, p99: 0, median: 0, n: 0 };
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = faceErr[src[i]];
  s.sort();
  return { worst: s[n - 1], p99: s[Math.min(n - 1, Math.floor(0.99 * n))], median: s[Math.floor(0.5 * n)], n };
}

/** (u,t,surfaceId) stride-3 vertex buffer → flat number[] of (u,t) pairs for the fidelity rulers. */
function extractUt2(vtx: Float32Array): number[] {
  const nV = vtx.length / 3;
  const ut = new Array<number>(nV * 2);
  for (let i = 0; i < nV; i++) { ut[2 * i] = vtx[3 * i]; ut[2 * i + 1] = vtx[3 * i + 1]; }
  return ut;
}

/** Sampler-lifted xyz (matches the banked cross-style quality/nonMan reproduction). */
function buildXyzFlat(sampler: SurfaceSampler, vtx: Float32Array): Float64Array {
  const nV = vtx.length / 3;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const p = sampler.position(vtx[3 * i], vtx[3 * i + 1]); xyz[3 * i] = p[0]; xyz[3 * i + 1] = p[1]; xyz[3 * i + 2] = p[2]; }
  return xyz;
}

interface WallOut { vertices: Float32Array; indices: Uint32Array; triangleSource: Uint8Array | undefined; tried: number; improved: number; }
function buildWall(
  sampler: SurfaceSampler, lines: ReturnType<typeof extractAnalyticFeatures>['lines'], uBias: number, stripPave: boolean,
): WallOut {
  const g = globalThis as { __pfConformingRefine?: boolean; __pfFeatureAlignedCells?: boolean; __pfFeatureAlignedStats?: { tried: number; improved: number } };
  if (stripPave) { g.__pfConformingRefine = true; g.__pfFeatureAlignedCells = true; g.__pfFeatureAlignedStats = { tried: 0, improved: 0 }; }
  const wall = buildConformingWall(sampler, {
    maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.1, gradeRatio: 2,
    maxLevel: 11, resU: 128, resT: 128, nRing: 256,
    surfaceId: 0,
    featureLines: lines,
    featureLevel: 11,
    targetTriangles: 6_000_000, budgetMode: 'cap',
    uBias,
    efgSampler: sampler,
  });
  const fa = g.__pfFeatureAlignedStats;
  const out: WallOut = {
    vertices: wall.vertices, indices: wall.indices,
    triangleSource: wall.triangleSource as Uint8Array | undefined,
    tried: fa?.tried ?? 0, improved: fa?.improved ?? 0,
  };
  if (stripPave) { g.__pfConformingRefine = undefined; g.__pfFeatureAlignedCells = undefined; g.__pfFeatureAlignedStats = undefined; }
  return out;
}

interface ModeScore {
  mode: 'off' | 'on'; tris: number; nonMan: number;
  quality: { minAngleDeg: number; pctBelow10: number; pctBelow20: number; pctBelow30: number };
  radial: { all: SagStat; feat: SagStat };
  true3d: { all: SagStat; feat: SagStat };
  brute?: { nRed: number; nSample: number; gnP99: number; trustedP99: number; trustedMax: number; gnOver: number };
  faStats: { tried: number; improved: number };
}

function scoreMode(
  styleName: string, mode: 'off' | 'on', sampler: SurfaceSampler, rA: AnalyticRadiusFn, H: number, w: WallOut, tangled: boolean,
): ModeScore {
  const nTri = w.indices.length / 3;
  // quality + nonMan on the SAMPLER lift (faithful to the banked cross-style reproduction)
  const xyz = buildXyzFlat(sampler, w.vertices);
  const q = triangleQualityDistribution({ vertices: xyz, indices: w.indices });
  const nonMan = auditNonManByIndex(xyz, w.indices);
  crumb({ stage: 'quality-scored', style: styleName, mode, tris: nTri, pctBelow20: q.pctBelow20, minAngleDeg: q.minAngleDeg, nonMan });

  // fidelity on the analytic rA lift (true-3D verdict ruler)
  const ut = extractUt2(w.vertices);
  const featIdx: number[] = [];
  if (w.triangleSource) for (let f = 0; f < nTri; f++) if (FEAT_SOURCES.has(w.triangleSource[f])) featIdx.push(f);
  const radial = perFaceChordSag(ut, w.indices, rA, H); // SCREEN (overstates steep relief)
  const t3d = perFaceTrue3DSag(ut, w.indices, rA, H);    // VERDICT ruler (true-3D perpendicular)
  const score: ModeScore = {
    mode, tris: nTri, nonMan,
    quality: { minAngleDeg: q.minAngleDeg, pctBelow10: q.pctBelow10, pctBelow20: q.pctBelow20, pctBelow30: q.pctBelow30 },
    radial: { all: statOf(radial.faceErr), feat: statOf(radial.faceErr, featIdx) },
    true3d: { all: statOf(t3d.faceErr), feat: statOf(t3d.faceErr, featIdx) },
    faStats: { tried: w.tried, improved: w.improved },
  };
  if (tangled) {
    // TANGLED lattice: single-seed GN overstates up to ~7×; brute-anchor the worst red facets for the
    // honest verdict number (worst-40 centroid twin; reuse the precomputed radial to pick the red set).
    const b = bruteAnchoredRedPerp(ut, w.indices, rA, H, { radial, redMm: 0.1, sampleN: 40 });
    score.brute = { nRed: b.nRed, nSample: b.nSample, gnP99: b.gnP99, trustedP99: b.trustedP99, trustedMax: b.trustedMax, gnOver: b.gnOver };
  }
  crumb({ stage: 'fidelity-scored', style: styleName, mode, tris: nTri, featFacets: featIdx.length,
    radialWorst: score.radial.all.worst, t3dWorstAll: score.true3d.all.worst, t3dP99All: score.true3d.all.p99,
    t3dWorstFeat: score.true3d.feat.worst, t3dP99Feat: score.true3d.feat.p99, brute: score.brute });
  return score;
}

function allowedUpper(off: number): number { return off + Math.max(0.02 * off, 0.0005); }

function mergeSummary(styleName: string, row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  let cur: Record<string, unknown> = { experiment: 'FAC-3D', arm: 'featureAlignedCell true-3D fidelity confirm', styles: {} };
  if (existsSync(SUMMARY_PATH)) { try { cur = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')); } catch { /* start fresh */ } }
  const styles = (cur.styles as Record<string, unknown>) ?? {};
  styles[styleName] = row;
  cur.styles = styles;
  cur.updatedAt = new Date().toISOString();
  writeFileSync(SUMMARY_PATH, JSON.stringify(cur, null, 2));
}

describe.skipIf(!ON)('FAC-3D — featureAlignedCell true-3D fidelity confirm (production conforming wall, Node twin)', () => {
  for (const c of CASES) {
    it(`${c.name}: flag OFF vs ON — true-3D fidelity + quality + watertight + tri delta`, () => {
      const t0 = Date.now();
      bumpPriority();
      crumb({ stage: 'style-start', style: c.name, heapLimitMB: heapLimitMB() });
      const H = c.dims.H;
      const rA = buildRadiusFn(c.name, {}, c.dims);
      const [, packed] = buildStyleParamPayload(c.name, {});
      const graph = extractAnalyticFeatures(c.name, Float32Array.from(packed), { H, Rt: c.dims.Rt, Rb: c.dims.Rb }, { surfaceFidelityExact: true });
      const lines = graph.lines;
      const sampler = styleSampler(c.name, {}, c.dims);
      const uBias = computeUBias(sampler, lines.length > 0);
      crumb({ stage: 'setup', style: c.name, lines: lines.length, kinds: [...new Set(lines.map((l) => l.kind))], uBias, ruler: c.tangled ? 'true3d-GN+bruteAnchored' : 'true3d-GN' });

      const off = scoreMode(c.name, 'off', sampler, rA, H, buildWall(sampler, lines, uBias, false), c.tangled);
      const on = scoreMode(c.name, 'on', sampler, rA, H, buildWall(sampler, lines, uBias, true), c.tangled);

      // ── GATE evaluation (true-3D fidelity is the verdict ruler) ──
      const fidWorstAllOk = on.true3d.all.worst <= allowedUpper(off.true3d.all.worst);
      const fidP99AllOk = on.true3d.all.p99 <= allowedUpper(off.true3d.all.p99);
      const fidWorstFeatOk = on.true3d.feat.worst <= allowedUpper(off.true3d.feat.worst);
      const fidP99FeatOk = on.true3d.feat.p99 <= allowedUpper(off.true3d.feat.p99);
      // For the tangled style, the brute-anchored trusted p99 is the HONEST fidelity number.
      const bruteOk = !c.tangled || !off.brute || !on.brute || on.brute.trustedP99 <= allowedUpper(off.brute.trustedP99);
      const qualityOk = on.quality.pctBelow20 <= off.quality.pctBelow20;
      const watertightOk = off.nonMan === 0 && on.nonMan === 0;
      const gatePass = fidWorstAllOk && fidP99AllOk && fidWorstFeatOk && fidP99FeatOk && bruteOk && qualityOk && watertightOk;
      const triDelta = on.tris - off.tris;
      const triPct = off.tris > 0 ? (100 * triDelta) / off.tris : 0;

      const row = {
        dims: c.dims, tangled: c.tangled, ruler: c.tangled ? 'perFaceTrue3DSag(GN) + bruteAnchoredRedPerp(trusted)' : 'perFaceTrue3DSag(GN, honest on non-tangled)',
        featureLines: lines.length,
        off, on,
        triDelta, triPct,
        gate: {
          pass: gatePass,
          fidelity: { worstAll: fidWorstAllOk, p99All: fidP99AllOk, worstFeat: fidWorstFeatOk, p99Feat: fidP99FeatOk, bruteTrusted: bruteOk },
          quality: { ok: qualityOk, offPctBelow20: off.quality.pctBelow20, onPctBelow20: on.quality.pctBelow20 },
          watertight: watertightOk,
          tolerancePolicy: 'ON <= OFF + max(2%*OFF, 0.0005mm) on true-3D worst & p99',
        },
        elapsedMs: Date.now() - t0,
      };
      mergeSummary(c.name, row);
      crumb({ stage: 'style-done', style: c.name, gatePass, qualityOk, watertightOk, triPct,
        offPctBelow20: off.quality.pctBelow20, onPctBelow20: on.quality.pctBelow20,
        offT3dWorstAll: off.true3d.all.worst, onT3dWorstAll: on.true3d.all.worst,
        offT3dP99Feat: off.true3d.feat.p99, onT3dP99Feat: on.true3d.feat.p99, elapsedMs: Date.now() - t0 });
      // eslint-disable-next-line no-console
      console.log(`[FAC-3D ${c.name}] gate=${gatePass ? 'PASS' : 'FAIL'} quality ${off.quality.pctBelow20}%->${on.quality.pctBelow20}% <20deg | ` +
        `true3d worst(all) ${off.true3d.all.worst.toFixed(5)}->${on.true3d.all.worst.toFixed(5)} p99(feat) ${off.true3d.feat.p99.toFixed(5)}->${on.true3d.feat.p99.toFixed(5)} | ` +
        `nonMan ${off.nonMan}/${on.nonMan} | tris ${off.tris}->${on.tris} (${triPct.toFixed(1)}%) | faStats tried=${on.faStats.tried} improved=${on.faStats.improved}`);
    }, PER_STYLE_TIMEOUT_MS);
  }
});
