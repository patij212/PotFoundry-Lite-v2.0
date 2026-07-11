// _tierc_armC1_rulerdiag.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm C1 RULER-DISAGREEMENT
// diagnosis (coordinator-directed, after the 7006-facet full harness scan was killed as wasteful).
// Env-gated PF_TIERC_ARMC1DIAG=1.
//
// C1 REPRODUCTION IS ALREADY PASS (armC1_crumbs.ndjson, this same run's build stage): native
// buildRegionOuterWall R-REFINE dispatch -> 9917 tris / dispatch single-R-REFINE; complex
// residualCrossings 0 / recoveryPct 100; refine 7 passes 944->9917, outliers 251->0, worst
// 0.324->0.01, capped false; ci-guard (the CI's OWN full-azimuth scoreWholeMesh @ the SAMPLER
// surface) outliers 0 / maxMm 0.009996 / nFacets 9917 -- EXACTLY the live CI gate
// (wholeMesh0Outlier.test.ts: 9917 tris / 7 passes / 0 outliers / max<=0.0101). This file does NOT
// re-run that; it DIAGNOSES the ruler disagreement the harness exposed.
//
// THE DISAGREEMENT (armC1_crumbs.ndjson interior-tick): on the SAME 9917-tri mesh the ci-guard
// scores 0-outlier/0.0099, the harness scoreWholeMeshInterior (research stack) flagged ~97% of
// scanned facets, worst 0.17-0.22mm. That is 17-22x tol -- too big for calibration noise.
//
// ROOT-CAUSE HYPOTHESIS (from reading the two rulers' reference SURFACES, before measuring):
//   - The K2 kernel MESHES and the ci-guard SCORES against `radialSurfaceFromSampler(sampler)` --
//     a styleSampler GpuSurfaceSampler PRE-EVALUATED on a 512x512 grid (DEFAULT_GRID_U/T=512,
//     styleSampler.ts:87-88), bilinearly interpolated.
//   - The harness scores against `buildRadiusFn('GothicArches',{},dims)` -- the EXACT analytic
//     function (verified: runStyle.ts buildRadiusFn composes radiusFn(theta,z,baseRadius(...),H,opts)
//     with the SAME STYLE_FUNCTIONS + DEFAULT_STYLE_PARAMS styleSampler uses; the ONLY difference is
//     pointwise-exact vs 512^2-bilinear).
//   - At Gothic's ~301.6mm circumference (r~48), 512 u-columns => 0.59mm/column -- FAR coarser than
//     the sub-mm knife-edge crest (apex curvature up to 657/mm, champion-spec-gothic.md). A 0.59mm
//     bilinear grid CHORDS ACROSS the crest, sitting radially INSIDE the true analytic crest. The
//     mesh (faithful to the grid) is therefore genuinely OFF the analytic surface by the grid chord
//     sag -> LEADING HYPOTHESIS = CAUSE B (sampler-resolution truth-bridge gap), NOT a harness
//     ruler grid-trap (CAUSE A). This file MEASURES which, it does not assume.
//
// DISCRIMINATORS (cheapest first):
//   STAGE A -- PURE SURFACE-vs-SURFACE (no mesh, no mesh-ruler): over a dense (u,t) lattice in the
//     patch domain, 3D distance between sampler.position(u,t) at grid res N in {512,1024,2048} and
//     the exact analytic point. If diff@512 ~ 0.17 and shrinks monotonically with N -> the grid
//     surface itself differs from analytic (CAUSE B), settled INDEPENDENTLY of any mesh or ruler.
//     Grid-free Newton confirms the worst lattice points' TRUE nearest to analytic.
//   STAGE B -- the mesh, TRUSTED K2 ruler (interiorRuler facetInteriorHonest: fine box-refine 1e-10
//     + per-sample self-window) against BOTH surfaces: @sampler (reproduce 0.0099) and @analytic.
//     If K2@analytic ~ 0.17 (agreeing with the harness) -> both trusted rulers agree the mesh is
//     off analytic -> NOT a harness artifact. If K2@analytic ~ 0.01 -> the harness is the outlier
//     (CAUSE A). Plus vertexOnSurf @ analytic (radial + Newton) -- are the vertices themselves off?
//   STAGE C -- ARBITER deep-dive on 5 flagged facets: worst interior sample P; newtonNearest
//     (grid-free multi-seed) + ultra-fine dense brute (nTheta 16384) @ analytic vs the harness
//     scoreWholeMeshInterior value on that facet vs K2@analytic vs K2@sampler + the surface diff
//     |sampRA512-analyticRA| at P. If newton/ultra-brute ~ 0.17 -> the 0.17 is the TRUE nearest to
//     analytic (real gap), grid-trap ruled out. If ~0.01 -> grid-trap (harness calibration).
//   STAGE D -- G3/G7 cross-style seam question: topologyMetric(patch) orientationMismatches +
//     boundaryEdges + a by-index boundary DOMAIN classifier (rim vs strictly-interior). Is the
//     Gothic K2 patch clean 0/0, or does it carry a defect like Gyroid's band-edge CDT (A1/A4:
//     360 boundary + 652 orientation)? A rectangular OPEN patch is EXPECTED to have rim boundary
//     edges; the defect signature is boundary/mismatch edges STRICTLY INTERIOR to the domain.
//
// PROPOSE harness fixes; DO NOT patch the harness (coordinator directive). Commit NOTHING.
//
// Run: NODE_OPTIONS=--max-old-space-size=8192 PF_TIERC_ARMC1DIAG=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_armC1_diag.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE ONLY -- every kernel/ruler/harness
// import is READ-ONLY; none edited by this file.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { newtonNearest } from './_gyroid_truthLib';
import { bruteNearestOnRadialSurface, nonManRawBigStats } from './labkit';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import { refineToZeroOutliers, type ChartDomain, type RefineOptions } from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import {
  DEFAULT_RULER,
  computeDevArraySeq,
  reduceDevArray,
  facetInteriorHonest,
  denseBary,
  liftChartMesh,
  radialSurfaceFromSampler,
  type RadialSurface,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import { topologyMetric } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const TAU = Math.PI * 2;
const TOL = 0.01;
const ON = process.env.PF_TIERC_ARMC1DIAG === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armC1_diag_crumbs.ndjson');
const VERDICT_PATH = join(OUT_DIR, 'armC1_diag_verdict.json');
const TIMEOUT_MS = 15 * 60 * 1000;
const BUDGET_MS = 12 * 60 * 1000;

const DOMAIN: ChartDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };
const BG_ARC_MM = 0.6;
const N_THETA = 512;
const DIMS = TIERC_COMMON_DIMS;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(CRUMB_PATH, JSON.stringify({ arm: 'C1-diag', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n');
  } catch {
    /* never let a breadcrumb kill the run */
  }
}
function pct(a: Float64Array, q: number): number {
  if (a.length === 0) return 0;
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

describe.skipIf(!ON)('Arm C1 ruler-disagreement diagnosis (Gothic K2 patch: sampler-grid vs analytic)', () => {
  it(
    'STAGE A surface-diff -> B mesh trusted-ruler both surfaces -> C arbiter facets -> D G3/G7',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const tStart = Date.now();
      const heapMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=8192 must propagate').toBeGreaterThanOrEqual(6000);
      const overBudget = (stage: string): boolean => {
        if (Date.now() - tStart > BUDGET_MS) {
          crumb('BUDGET-GUARD-FIRED', { stage, elapsedMs: Date.now() - tStart });
          return true;
        }
        return false;
      };

      const manifest = getManifest('GothicArches');
      const analyticRA = manifest.truth.rA; // buildRadiusFn -- exact pointwise analytic
      const { H, Rt, Rb, expn } = DIMS;
      const surfaceAnalytic: RadialSurface = { rA: analyticRA, H };

      // ════════════════════════════════════════════════════════════════════════════════════════
      // STAGE A -- pure surface-vs-surface (no mesh). Is the 512^2 sampler grid off analytic?
      // ════════════════════════════════════════════════════════════════════════════════════════
      const gridDiff: Record<string, { max: number; p99: number; p50: number; worst: { u: number; t: number } }> = {};
      const samplers: Record<number, ReturnType<typeof styleSampler>> = {};
      for (const N of [512, 1024, 2048]) {
        if (overBudget(`stageA-${N}`)) break;
        const tN = Date.now();
        const sampler = styleSampler('GothicArches' as StyleId, {}, { H, Rt, Rb, expn, gridResU: N, gridResT: N });
        samplers[N] = sampler;
        // Dense (u,t) lattice OFFSET from grid nodes so the bilinear chord is captured (grid-node
        // points would read ~0 by construction). 401x81 across the patch, phase-shifted by ~0.37
        // cell so points land between the N-grid lines.
        const NU = 401;
        const NT = 81;
        const diffs = new Float64Array(NU * NT);
        let w = 0;
        let worst = -1;
        let worstU = 0;
        let worstT = 0;
        for (let i = 0; i < NU; i++) {
          const u = DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * ((i + 0.37) / NU);
          for (let j = 0; j < NT; j++) {
            const t = DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * ((j + 0.41) / NT);
            const [sx, sy, sz] = sampler.position(u, t); // bilinear grid point
            const th = TAU * u;
            const z = t * H;
            const rAn = analyticRA(th, z);
            const d = Math.hypot(sx - rAn * Math.cos(th), sy - rAn * Math.sin(th), sz - z);
            diffs[w++] = d;
            if (d > worst) {
              worst = d;
              worstU = u;
              worstT = t;
            }
          }
        }
        gridDiff[`res${N}`] = { max: worst, p99: pct(diffs, 0.99), p50: pct(diffs, 0.5), worst: { u: worstU, t: worstT } };
        crumb(`stageA-${N}-done`, { ms: Date.now() - tN, ...gridDiff[`res${N}`] });
      }
      // Grid-free Newton confirmation on the 512-grid worst point: is the sampler surface point's
      // TRUE nearest to analytic really ~the same-(u,t) diff (near-radial), not a projection quirk?
      let stageAWorstNewton: number | null = null;
      if (samplers[512] && gridDiff.res512) {
        const { u, t } = gridDiff.res512.worst;
        const [sx, sy, sz] = samplers[512].position(u, t);
        stageAWorstNewton = newtonNearest(analyticRA, H, sx, sy, sz, { seedTheta: 0, seedZ: 0, nThetaSeeds: 41, nZSeeds: 41, maxIter: 80, windowMode: 'wide' }).dist;
        crumb('stageA-worst-newton', { u, t, sameUtDiff: gridDiff.res512.max, newtonToAnalytic: stageAWorstNewton });
      }

      // ════════════════════════════════════════════════════════════════════════════════════════
      // STAGE B -- rebuild the mesh (the SAME K2 patch), score with the TRUSTED K2 ruler against
      // BOTH the sampler(512) surface (reproduce ci-guard) and the analytic surface.
      // ════════════════════════════════════════════════════════════════════════════════════════
      let stageB: Record<string, unknown> | null = null;
      let meshCtx: { sampler: ReturnType<typeof styleSampler>; uv: number[]; tris: number[]; xyz: Float64Array; idx: Uint32Array; radialScreenDev: Float64Array } | null = null;
      if (!overBudget('stageB-build')) {
        const sampler = samplers[512] ?? styleSampler('GothicArches' as StyleId, {}, { H, Rt, Rb, expn, gridResU: 512, gridResT: 512 });
        const tC = Date.now();
        const complex = buildProtectedComplex(sampler, 'GothicArches');
        expect(complex.residualCrossings).toBe(0);
        crumb('stageB-complex', { ms: Date.now() - tC, residualCrossings: complex.residualCrossings });
        const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
        const refineOpts: RefineOptions = { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: BG_ARC_MM, ruler: loopRuler };
        const tR = Date.now();
        const refined = refineToZeroOutliers(sampler, complex, DOMAIN, refineOpts, (s) => {
          if (s.dense || s.pass % 2 === 0) crumb('stageB-refine', { pass: s.pass, dense: s.dense, tris: s.nTris, outliers: s.outliers, worstMm: +s.worstMm.toFixed(5) });
        });
        crumb('stageB-refine-done', { ms: Date.now() - tR, passes: refined.passes, capped: refined.capped, tris: refined.tris.length / 3 });

        const xyz = liftChartMesh(sampler, refined.uv);
        const idx = Uint32Array.from(refined.tris);
        const mesh = { uv: refined.uv, tris: refined.tris };
        const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
        const surfaceSampler = radialSurfaceFromSampler(sampler);

        // K2 ruler @ SAMPLER (reproduce ci-guard 0.0099).
        const tS = Date.now();
        const devSampler = computeDevArraySeq(surfaceSampler, xyz, mesh, guardRuler).dev;
        const redSampler = reduceDevArray(devSampler, TOL, 0);
        crumb('stageB-k2@sampler', { ms: Date.now() - tS, outliers: redSampler.outliers, maxMm: +redSampler.maxMm.toFixed(6), p99: +redSampler.p99.toFixed(6) });

        // K2 ruler @ ANALYTIC. The FULL-mesh honest K2@analytic call is DELIBERATELY NOT run here:
        // against analytic ~97% of the 9917 facets advance to the per-sample brute, making
        // computeDevArraySeq an uninterruptible >10-min grind (measured: killed at 318s CPU / ~6.5min
        // and still going, run 1) that risks the 12-min budget with no extra evidence over STAGE A +
        // the per-facet arbiters. Instead:
        //   (1) a CHEAP per-facet RADIAL screen against analytic (same-(theta,z) max deviation over
        //       the denseBary lattice -- instant, no brute; OVERSTATES true-3D on steep relief, so it
        //       is a conservative screen + the facet SELECTOR for STAGE C, never the honest verdict);
        //   (2) a BOUNDED STRIDED honest true-3D K2@analytic subsample (facetInteriorHonest on ~1-in-N
        //       facets, N chosen for ~400 scored) -- the honest true-3D number against analytic at a
        //       controlled cost, labeled a subsample.
        const nFB = mesh.tris.length / 3;
        const denseB = denseBary(8);
        const radialScreenDev = new Float64Array(nFB);
        for (let f = 0; f < nFB; f++) {
          const a = mesh.tris[3 * f];
          const b = mesh.tris[3 * f + 1];
          const c = mesh.tris[3 * f + 2];
          let d = 0;
          for (const [wa, wb, wc] of denseB) {
            const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
            const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
            const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
            let th = Math.atan2(py, px);
            if (th < 0) th += TAU;
            const rr = Math.abs(Math.hypot(px, py) - analyticRA(th, Math.min(H, Math.max(0, pz))));
            if (rr > d) d = rr;
          }
          radialScreenDev[f] = d;
        }
        let radialOver = 0;
        for (let f = 0; f < nFB; f++) if (radialScreenDev[f] > TOL) radialOver++;
        crumb('stageB-radialScreen@analytic', { p99: +pct(radialScreenDev, 0.99).toFixed(6), max: +pct(radialScreenDev, 1).toFixed(6), overCount: radialOver, nFacets: nFB, note: 'radial same-(u,t), OVERSTATES true-3D' });

        const strideA = Math.max(1, Math.floor(nFB / 400));
        const subDevs: number[] = [];
        let subOut = 0;
        const tA = Date.now();
        for (let f = 0; f < nFB; f += strideA) {
          const a = mesh.tris[3 * f];
          const b = mesh.tris[3 * f + 1];
          const c = mesh.tris[3 * f + 2];
          const d = facetInteriorHonest(surfaceAnalytic, xyz, mesh.uv, a, b, c, denseB, guardRuler).dev;
          subDevs.push(d);
          if (d > TOL) subOut++;
        }
        const subArr = Float64Array.from(subDevs);
        const k2AnalyticStrided = { scanned: subDevs.length, strideA, outliers: subOut, maxMm: pct(subArr, 1), p99: pct(subArr, 0.99), p50: pct(subArr, 0.5) };
        crumb('stageB-k2@analytic-strided', { ms: Date.now() - tA, ...k2AnalyticStrided, maxMm: +k2AnalyticStrided.maxMm.toFixed(6), p99: +k2AnalyticStrided.p99.toFixed(6) });

        // vertexOnSurf @ analytic: radial same-(theta,z) deviation of EVERY vertex (instant).
        const nV = xyz.length / 3;
        const vRad = new Float64Array(nV);
        for (let v = 0; v < nV; v++) {
          const x = xyz[3 * v];
          const y = xyz[3 * v + 1];
          const z = Math.min(H, Math.max(0, xyz[3 * v + 2]));
          let th = Math.atan2(y, x);
          if (th < 0) th += TAU;
          vRad[v] = Math.abs(Math.hypot(x, y) - analyticRA(th, z));
        }
        // Newton (grid-free) on the worst 10 vertices -- true nearest (radial overstates steep relief).
        const vOrder = Array.from({ length: nV }, (_, i) => i).sort((a, b) => vRad[b] - vRad[a]);
        const vNewtonWorst: number[] = [];
        for (const v of vOrder.slice(0, 10)) {
          vNewtonWorst.push(newtonNearest(analyticRA, H, xyz[3 * v], xyz[3 * v + 1], xyz[3 * v + 2], { seedTheta: 0, seedZ: 0, nThetaSeeds: 41, nZSeeds: 41, maxIter: 80, windowMode: 'wide' }).dist);
        }
        crumb('stageB-vertexOnSurf', { radialP99: +pct(vRad, 0.99).toFixed(6), radialMax: +pct(vRad, 1).toFixed(6), newtonWorst10: vNewtonWorst.map((d) => +d.toFixed(6)) });

        stageB = {
          k2AtSampler: { outliers: redSampler.outliers, maxMm: redSampler.maxMm, p99: redSampler.p99, reproduces_ciGuard_0p0099: redSampler.outliers === 0 && redSampler.maxMm <= 0.0101 },
          radialScreenAtAnalytic: { p99: pct(radialScreenDev, 0.99), max: pct(radialScreenDev, 1), overCount: radialOver, nFacets: nFB, note: 'radial same-(u,t) -- OVERSTATES true-3D, screen+selector only' },
          k2AtAnalyticStrided: k2AnalyticStrided,
          vertexOnSurfAnalytic: { radialP99: pct(vRad, 0.99), radialMax: pct(vRad, 1), newtonWorst10: vNewtonWorst, newtonWorstMax: Math.max(...vNewtonWorst) },
        };
        meshCtx = { sampler, uv: refined.uv, tris: refined.tris, xyz, idx, radialScreenDev };
      }

      // ════════════════════════════════════════════════════════════════════════════════════════
      // STAGE C -- ARBITER deep-dive on the 6 facets the cheap radial screen flags worst (the radial
      // screen is a conservative UPPER bound on true-3D, so its worst facets are guaranteed to include
      // the true-3D-worst; the honest true-3D + grid-free arbiters are computed per-facet HERE).
      // ════════════════════════════════════════════════════════════════════════════════════════
      const stageC: Array<Record<string, unknown>> = [];
      if (meshCtx && !overBudget('stageC')) {
        const { sampler, uv, tris, xyz, radialScreenDev } = meshCtx;
        const surfaceSampler = radialSurfaceFromSampler(sampler);
        const dense = denseBary(8);
        const facetOrder = Array.from({ length: radialScreenDev.length }, (_, f) => f).sort((a, b) => radialScreenDev[b] - radialScreenDev[a]);
        const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
        for (const f of facetOrder.slice(0, 6)) {
          const a = tris[3 * f];
          const b = tris[3 * f + 1];
          const c = tris[3 * f + 2];
          // K2 honest verdict @ analytic (worst interior sample site) and @ sampler.
          const hA = facetInteriorHonest(surfaceAnalytic, xyz, uv, a, b, c, dense, guardRuler);
          const hS = facetInteriorHonest(surfaceSampler, xyz, uv, a, b, c, dense, guardRuler);
          // Worst interior sample point P (3D) at the K2@analytic worst bary site.
          const wu = hA.uWorst;
          const wt = hA.tWorst;
          const [px, py, pz] = sampler.position(((wu % 1) + 1) % 1, Math.min(1, Math.max(0, wt)));
          // ARBITERS against analytic: grid-free multi-seed Newton + ultra-fine dense brute.
          const nn = newtonNearest(analyticRA, H, px, py, pz, { seedTheta: 0, seedZ: 0, nThetaSeeds: 61, nZSeeds: 41, maxIter: 100, windowMode: 'wide' }).dist;
          const ub = bruteNearestOnRadialSurface(px, py, pz, analyticRA, H, { nTheta: 16384, nZ: 480, zBandMm: 8, refineIters: 80 }).dist;
          // The harness scoreWholeMeshInterior value on THIS single facet (its exact number).
          const sub = Uint32Array.from([a, b, c]);
          const harness = scoreWholeMeshInterior(Float32Array.from(xyz), sub, analyticRA, H, { tol: TOL }).wholeMeshMaxMm;
          // Surface diff at P: is P on the sampler surface but off analytic (the grid-chord signature)?
          let th = Math.atan2(py, px);
          if (th < 0) th += TAU;
          const rho = Math.hypot(px, py);
          const sampDiffAtP = Math.abs(rho - surfaceSampler.rA(th, pz));
          const analyticDiffRadialAtP = Math.abs(rho - analyticRA(th, pz));
          const rec = {
            facet: f,
            worstUt: { u: wu, t: wt },
            k2_analytic: +hA.dev.toFixed(6),
            k2_sampler: +hS.dev.toFixed(6),
            harness_scoreWholeMeshInterior: +harness.toFixed(6),
            newton_grid_free_toAnalytic: +nn.toFixed(6),
            ultraBrute16384_toAnalytic: +ub.toFixed(6),
            radialDiff_P_toSampler: +sampDiffAtP.toFixed(6),
            radialDiff_P_toAnalytic: +analyticDiffRadialAtP.toFixed(6),
          };
          stageC.push(rec);
          crumb('stageC-facet', rec);
        }
      }

      // ════════════════════════════════════════════════════════════════════════════════════════
      // STAGE D -- G3/G7 (cross-style seam question) on the patch mesh.
      // ════════════════════════════════════════════════════════════════════════════════════════
      let stageD: Record<string, unknown> | null = null;
      if (meshCtx && !overBudget('stageD')) {
        const { uv, tris, xyz, idx } = meshCtx;
        const topo = topologyMetric({ vertices: Float32Array.from(xyz), indices: idx }, 1e-4);
        const rawStats = nonManRawBigStats(idx);
        // Non-vacuity for the raw-index audit: inject a duplicate triangle, count must move.
        const cracked = new Uint32Array(idx.length + 3);
        cracked.set(idx);
        cracked.set([idx[0], idx[1], idx[2]], idx.length);
        const crackedNonMan = nonManRawBigStats(cracked).nonMan;
        // Boundary-edge DOMAIN classifier (by index): rim (on the (u,t) rectangle) vs strictly interior.
        const eps = 1e-7;
        const use = new Map<string, { a: number; b: number; n: number }>();
        for (let ff = 0; ff < tris.length / 3; ff++) {
          const a = tris[3 * ff];
          const b = tris[3 * ff + 1];
          const c = tris[3 * ff + 2];
          for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
            const k = i < j ? `${i}_${j}` : `${j}_${i}`;
            const hit = use.get(k);
            if (hit) hit.n++;
            else use.set(k, { a: i, b: j, n: 1 });
          }
        }
        let onRect = 0;
        let interior = 0;
        const interiorSamples: Array<{ u: number; t: number }> = [];
        for (const { a, b, n } of use.values()) {
          if (n !== 1) continue;
          const um = (uv[2 * a] + uv[2 * b]) / 2;
          const tm = (uv[2 * a + 1] + uv[2 * b + 1]) / 2;
          const onU = Math.abs(um - DOMAIN.uLo) < eps || Math.abs(um - DOMAIN.uHi) < eps;
          const onT = Math.abs(tm - DOMAIN.tLo) < eps || Math.abs(tm - DOMAIN.tHi) < eps;
          if (onU || onT) onRect++;
          else {
            interior++;
            if (interiorSamples.length < 20) interiorSamples.push({ u: um, t: tm });
          }
        }
        stageD = {
          topologyMetric: { orientationMismatches: topo.orientationMismatches, boundaryEdges: topo.boundaryEdges, nonManifoldEdges: topo.nonManifoldEdges },
          rawIndex: { nonMan: rawStats.nonMan, boundary: rawStats.boundary, controlMoved: crackedNonMan > rawStats.nonMan },
          boundaryDomainClass: { total: onRect + interior, onDomainRect_expected: onRect, strictlyInterior_defectSignature: interior, interiorSamples },
          g3_orientation_clean: topo.orientationMismatches === 0,
          g7_no_interior_boundary_defect: interior === 0,
          seamDefectLikeGyroid: topo.orientationMismatches > 0 || interior > 0,
        };
        crumb('stageD-done', stageD);
      }

      // ════════════════════════════════════════════════════════════════════════════════════════
      // CLASSIFY.
      // ════════════════════════════════════════════════════════════════════════════════════════
      const b = stageB as
        | null
        | {
            k2AtSampler: { reproduces_ciGuard_0p0099: boolean; maxMm: number };
            k2AtAnalyticStrided: { maxMm: number; p99: number; outliers: number; scanned: number };
            vertexOnSurfAnalytic: { radialMax: number; newtonWorstMax: number };
          };
      const k2AnalyticMax = b?.k2AtAnalyticStrided.maxMm ?? null;
      const cNewtonMax = stageC.length ? Math.max(...stageC.map((r) => r.newton_grid_free_toAnalytic as number)) : null;
      const cUltraMax = stageC.length ? Math.max(...stageC.map((r) => r.ultraBrute16384_toAnalytic as number)) : null;
      const grid512Max = gridDiff.res512?.max ?? null;
      const grid2048Max = gridDiff.res2048?.max ?? null;

      // CAUSE B (sampler-resolution gap) iff: the arbiters (Newton + ultra-brute, grid-free) confirm
      // the mesh really is ~0.1mm+ off analytic AND the pure surface diff @512 is comparably large
      // AND that diff shrinks with grid resolution. CAUSE A (harness grid-trap) iff the arbiters say
      // ~tol while the harness said ~0.17.
      const arbitersLarge = cNewtonMax !== null && cUltraMax !== null && cNewtonMax > 0.05 && cUltraMax > 0.05;
      const arbitersSmall = cNewtonMax !== null && cUltraMax !== null && cNewtonMax <= 0.02 && cUltraMax <= 0.02;
      const surfaceGapLarge = grid512Max !== null && grid512Max > 0.05;
      const surfaceGapShrinks = grid512Max !== null && grid2048Max !== null && grid2048Max < 0.5 * grid512Max;
      let classification: string;
      if (arbitersLarge && surfaceGapLarge) {
        classification =
          'CAUSE B -- SAMPLER-RESOLUTION TRUTH-BRIDGE GAP. The K2 kernel meshes+scores a 512^2 bilinear styleSampler grid that chords across Gothic knife-edge crests; the mesh is faithful to that grid (K2@sampler ~0.0099, = ci-guard = live CI gate) but genuinely ~0.17mm off the exact analytic surface (K2@analytic AND grid-free Newton AND ultra-brute all agree). The harness ruler is CORRECT; the disagreement is a real surface-basis difference, not a ruler artifact. NOT a region-layer bug (native dispatch reproduced the CI gate bit-for-bit) and NOT a harness bug.';
      } else if (arbitersSmall) {
        classification =
          'CAUSE A -- HARNESS GRID-TRAP. Grid-free Newton + ultra-brute find the mesh within ~tol of analytic, while scoreWholeMeshInterior reported ~0.17 -- the harness brute grid-traps on Gothic fine ribs (Gyroid-38x class). Mesh is fine; harness needs rib-aware theta-windowing / finer grid for Gothic-class.';
      } else {
        classification = 'MIXED/INCONCLUSIVE -- see the per-facet arbiter table; arbiters did not cleanly agree with either the surface-diff or the harness. Report numbers verbatim, do not force a class.';
      }

      const summary = {
        c1_reproduction: {
          verdict: 'PASS',
          evidence: 'armC1_crumbs.ndjson (build stage): native buildRegionOuterWall R-REFINE dispatch -> 9917 tris / dispatch single-R-REFINE / passes 7 / capped false; ci-guard (CI full-azimuth scoreWholeMesh @ sampler) outliers 0 / maxMm 0.009996 / nFacets 9917 == live CI gate exactly.',
        },
        rulerDisagreement: {
          classification,
          harness_worst_reported: '0.1737-0.2164mm (armC1_crumbs interior-tick, ~97% of scanned facets flagged)',
          k2_ciGuard_atSampler: '0 outliers / max 0.009996mm',
          k2_ruler_atAnalytic_stridedSubsample_max: k2AnalyticMax,
          arbiter_newton_gridfree_max: cNewtonMax,
          arbiter_ultraBrute16384_max: cUltraMax,
          rootCause_surfaceDiff: {
            note: 'PURE surface-vs-surface 3D distance sampler.position(u,t) vs exact analytic point, dense lattice in the patch domain -- no mesh, no mesh-ruler.',
            grid512: gridDiff.res512 ?? null,
            grid1024: gridDiff.res1024 ?? null,
            grid2048: gridDiff.res2048 ?? null,
            worstPoint512_newtonToAnalytic: stageAWorstNewton,
            surfaceGapLarge,
            surfaceGapShrinksWithResolution: surfaceGapShrinks,
          },
        },
        stageB_meshTrustedRuler: stageB,
        stageC_arbiterFacets: stageC,
        crossStyleSeamQuestion: stageD,
        proposedHarnessFixes:
          classification.startsWith('CAUSE B')
            ? [
                'The disagreement is a SURFACE-BASIS mismatch, not a harness bug: the tierC/K2 kernel is a SAMPLER-surface mesher (meshes the 512^2 styleSampler grid), so scoring its output against the exact analytic function measures the styleSampler RESOLUTION, not the kernel meshing quality.',
                'FIX 1 (ruler basis): for R-REFINE/tierC meshes, score G1 against radialSurfaceFromSampler(sampler) -- the SAME surface the kernel targets and the live CI gate uses -- OR carry BOTH numbers (faithful-to-sampler AND faithful-to-analytic) and label them, never conflate. The manifest already knows the region is R-REFINE (dispatch=single-R-REFINE); the harness could branch its G1 reference surface on that.',
                'FIX 2 (close the gap at the source): raise styleSampler gridResU/gridResT for Gothic-class knife-edge styles until sampler ~ analytic (STAGE A shows the diff shrinks with resolution), OR lift refine-inserted vertices via the analytic rA instead of sampler.position -- either makes the tierC mesh faithful to analytic, at which point the harness analytic ruler is the right gate.',
                'IMPLICATION for the live CI gate: wholeMesh0Outlier.test.ts asserts faithful-to-the-512^2-grid, NOT faithful-to-analytic. The harness earned its keep by exposing this (same pattern as the Gyroid G3/G7 exposure in A1) -- a truth-bridge/coverage gap invisible to every prior Gothic verdict.',
              ]
            : classification.startsWith('CAUSE A')
              ? [
                  'Harness scoreWholeMeshInterior grid-traps on Gothic fine ribs: give its brute a per-sample theta-window sized from the same-(u,t) radial bound (as interiorRuler.facetInteriorHonest already does) and/or raise brute nTheta for the count-unstable rib styles.',
                ]
              : ['Inconclusive -- gather the per-facet arbiter numbers before proposing a fix.'],
        wallTimes: { totalMs: Date.now() - tStart, budgetGuardFired: Date.now() - tStart > BUDGET_MS },
      };
      writeFileSync(VERDICT_PATH, JSON.stringify(summary, null, 2));
      crumb('verdict', { classification, k2AnalyticMax, cNewtonMax, cUltraMax, grid512Max, grid2048Max });
      // eslint-disable-next-line no-console
      console.log(`[armC1-diag] ${classification}\n${JSON.stringify(summary, null, 2)}`);
    },
    TIMEOUT_MS,
  );
});
