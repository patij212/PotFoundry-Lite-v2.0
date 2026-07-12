// _tierc_analytic_ship.test.ts — T3.4 SHIP GATE for the C2 analytic-surface lever wired into
// production behind the double flag __pfPerfectMesher + __pfTierCAnalyticSurface (both default-OFF).
//
// The lever itself (surfaceSource:'analytic' in noBridgeRefine.ts) is already proven at patch scale
// (Gothic 18045/18045 0-outliers ≤0.01, GeoStar 5071/0 — research/lab/tierc/C2-full-patch-verdict.md).
// What T3.4 adds is the PRODUCTION WIRING: a src/-only buildAnalyticRadiusFn (src/geometry/
// analyticRadius.ts) that reproduces the SAME analytic surface the research champion scored against
// (getManifest().truth.rA = research buildRadiusFn), threaded through buildTierCOuterWall's new
// analytic opts. This file validates BOTH halves:
//
//   PART A (fast, no env var):
//     A1 — buildTierCOuterWall is byte-identical with the new analytic opts + sub-flag ON while
//          __pfPerfectMesher is OFF (production default): the analytic opt/sub-flag can NEVER perturb
//          the production-default delegation path.
//     A1b — with __pfPerfectMesher ON but the style NOT count-unstable, still byte-identical
//          (the analytic branch is allow-list-gated, never fires for Tier-A/B styles).
//     A2 — FAITHFULNESS: the PRODUCTION buildAnalyticRadiusFn agrees POINTWISE with the research
//          truth (getManifest('GothicArches').truth.rA and buildRadiusFn('GeometricStar',...)) across
//          a dense (theta,z) grid. This is why reproducing C2's 0-outlier numbers with it (PART B)
//          IS the faithfulness proof — same surface in, same mesh out.
//
//   PART B (heavy, env-gated — RUN FOR REAL, mirrors _tierc_c2full / _tierc_geostar_c2 harness):
//     PF_ANALYTIC_SHIP_A=1       — Gothic CI patch, SAMPLER mode → 9917 tris / 7 passes / 0-vs-sampler
//                                  (the byte-identical sampler baseline; sub-flag semantics OFF).
//     PF_ANALYTIC_SHIP_B=1       — Gothic CI patch, ANALYTIC mode via the PRODUCTION buildAnalyticRadiusFn
//                                  → 18045/18045, 0 interior outliers, max ≤0.01 vs the exact analytic rA.
//     PF_ANALYTIC_SHIP_GEOSTAR=1 — GeoStar patch, ANALYTIC mode via buildAnalyticRadiusFn → 0 outliers,
//                                  ~5071 tris.
//
// Run (separate processes for the heavy parts, resilience):
//   NODE_OPTIONS=--max-old-space-size=12288 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_analytic_ship.config.ts        # PART A
//   NODE_OPTIONS=--max-old-space-size=12288 PF_ANALYTIC_SHIP_A=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_analytic_ship.config.ts        # sampler baseline
//   NODE_OPTIONS=--max-old-space-size=12288 PF_ANALYTIC_SHIP_B=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_analytic_ship.config.ts        # Gothic analytic (~5min)
//   NODE_OPTIONS=--max-old-space-size=12288 PF_ANALYTIC_SHIP_GEOSTAR=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_analytic_ship.config.ts        # GeoStar analytic
//
// DEV-ONLY. research/ never imported by src/. Node-only. Commits nothing.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRadiusFn } from './labkit';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
// PRODUCTION fn under test (src/):
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import {
  buildTierCOuterWall,
  type TierCOuterWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/index';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import {
  DEFAULT_RULER,
  liftChartMesh,
  radialSurfaceFromSampler,
  analyticSurfaceSampler,
  scoreWholeMesh,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';

const RUN_A = process.env.PF_ANALYTIC_SHIP_A === '1';
const RUN_B = process.env.PF_ANALYTIC_SHIP_B === '1';
const RUN_GEOSTAR = process.env.PF_ANALYTIC_SHIP_GEOSTAR === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'analytic_ship_crumbs.ndjson');

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ probe: 'analytic-ship', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

interface FlagBag {
  __pfPerfectMesher?: boolean;
  __pfTierCAnalyticSurface?: boolean;
}
const flags = globalThis as unknown as FlagBag;
afterEach(() => {
  delete flags.__pfPerfectMesher;
  delete flags.__pfTierCAnalyticSurface;
});

const DIMS = TIERC_COMMON_DIMS; // { H:120, Rb:40, Rt:50, expn:1 }
const GOTHIC_DOMAIN: ChartDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };
const GOTHIC_BG_ARC = 0.6;
const GOTHIC_N_THETA = 512;
const GEOSTAR_DOMAIN: ChartDomain = { uLo: 0, uHi: 0.05, tLo: 0.35, tHi: 0.4 };
const GEOSTAR_BG_ARC = 0.6;
const GEOSTAR_N_THETA = 256;
const TOL = 0.01;

const BASE_OPTS: TierCOuterWallOptions = {
  maxSagMm: 0.1,
  maxEdgeMm: 8,
  minEdgeMm: 0.2,
  gradeRatio: 2,
  maxLevel: 10,
  resU: 128,
  resT: 128,
};

function sameMesh(
  a: { vertices: Float32Array; indices: Uint32Array },
  b: { vertices: Float32Array; indices: Uint32Array },
): boolean {
  if (a.vertices.length !== b.vertices.length) return false;
  if (a.indices.length !== b.indices.length) return false;
  for (let i = 0; i < a.vertices.length; i++) if (a.vertices[i] !== b.vertices[i]) return false;
  for (let i = 0; i < a.indices.length; i++) if (a.indices[i] !== b.indices[i]) return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PART A — fast: byte-identity of the wiring + faithfulness of the production analytic fn
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('T3.4 PART A — wiring byte-identity + production-fn faithfulness', () => {
  it('A1: analytic opt + sub-flag ON cannot perturb the production-default (perfectMesher OFF) path', () => {
    // Production default: __pfPerfectMesher unset ⇒ buildTierCOuterWall pure-delegates.
    const sampler = styleSampler('GothicArches', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
    const analyticRA = buildAnalyticRadiusFn('GothicArches', {}, DIMS);

    const plain = buildTierCOuterWall(sampler, BASE_OPTS, 'GothicArches');

    // Sub-flag ON + analytic opts supplied, but perfectMesher OFF ⇒ MUST still delegate identically.
    flags.__pfTierCAnalyticSurface = true;
    const withAnalyticOpts = buildTierCOuterWall(
      sampler,
      { ...BASE_OPTS, analyticRA, analyticH: DIMS.H },
      'GothicArches',
    );
    expect(withAnalyticOpts.vertices.length).toBeGreaterThan(0);
    expect(sameMesh(plain, withAnalyticOpts)).toBe(true);
  });

  it('A1b: perfectMesher ON + sub-flag ON but NON-count-unstable style ⇒ byte-identical (allow-list gated)', () => {
    const sampler = styleSampler('FourierBloom', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
    const analyticRA = buildAnalyticRadiusFn('FourierBloom', {}, DIMS);

    const plain = buildTierCOuterWall(sampler, BASE_OPTS, 'FourierBloom');

    flags.__pfPerfectMesher = true;
    flags.__pfTierCAnalyticSurface = true;
    const on = buildTierCOuterWall(
      sampler,
      { ...BASE_OPTS, analyticRA, analyticH: DIMS.H },
      'FourierBloom',
    );
    expect(sameMesh(plain, on)).toBe(true);
  });

  it('A2: PRODUCTION buildAnalyticRadiusFn agrees POINTWISE with the research truth surface', () => {
    // Gothic: getManifest().truth.rA == research buildRadiusFn('GothicArches',{},COMMON_DIMS).
    const prodGothic = buildAnalyticRadiusFn('GothicArches', {}, DIMS);
    const truthGothic = getManifest('GothicArches').truth.rA;
    // GeoStar is NOT in the manifest — its research truth is buildRadiusFn (labkit) directly.
    const prodGeo = buildAnalyticRadiusFn('GeometricStar', {}, DIMS);
    const truthGeo = buildRadiusFn('GeometricStar', {}, DIMS);

    let maxDGothic = 0;
    let maxDGeo = 0;
    const N = 97; // dense odd grid (avoids landing only on nice fractions)
    for (let i = 0; i < N; i++) {
      const theta = (2 * Math.PI * i) / N;
      for (let j = 0; j <= N; j++) {
        const z = (DIMS.H * j) / N;
        maxDGothic = Math.max(maxDGothic, Math.abs(prodGothic(theta, z) - truthGothic(theta, z)));
        maxDGeo = Math.max(maxDGeo, Math.abs(prodGeo(theta, z) - truthGeo(theta, z)));
      }
    }
    crumb('A2-pointwise', { maxDGothic, maxDGeo });
    // Same STYLE_FUNCTIONS + baseRadius + DEFAULT_STYLE_PARAMS ⇒ bit-exact (0), not merely close.
    expect(maxDGothic).toBe(0);
    expect(maxDGeo).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PART B — heavy, env-gated: reproduce C2-full via the PRODUCTION fn
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe.skipIf(!RUN_A)('T3.4 PART B(sampler) — Gothic CI patch sampler baseline (9917/7)', () => {
  it(
    'sampler-mode Gothic patch reproduces the CI baseline 9917 tris / 7 passes / 0-vs-sampler',
    () => {
      const t0 = Date.now();
      const sampler = styleSampler('GothicArches', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
      const complex = buildProtectedComplex(sampler, 'GothicArches');
      expect(complex.residualCrossings).toBe(0);
      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: GOTHIC_N_THETA, thetaWindowRad: 0.5 };
      const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: GOTHIC_N_THETA };
      const refined = refineToZeroOutliers(
        sampler,
        complex,
        GOTHIC_DOMAIN,
        { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: GOTHIC_BG_ARC, ruler: loopRuler },
      );
      const surface = radialSurfaceFromSampler(sampler);
      const guard = scoreWholeMesh(sampler, surface, refined, TOL, guardRuler);
      const tris = refined.tris.length / 3;
      crumb('B-sampler', { tris, passes: refined.passes, guardOutliers: guard.outliers, maxMm: guard.maxMm, ms: Date.now() - t0 });
      // eslint-disable-next-line no-console
      console.log(`[analytic-ship PART A] sampler Gothic: tris=${tris} passes=${refined.passes} guardOut=${guard.outliers} max=${guard.maxMm}`);
      expect(refined.capped).toBe(false);
      expect(tris).toBe(9917);
      expect(refined.passes).toBe(7);
      expect(guard.outliers).toBe(0);
    },
    9 * 60 * 1000,
  );
});

describe.skipIf(!RUN_B)('T3.4 PART B(analytic) — Gothic via PRODUCTION buildAnalyticRadiusFn (18045/0)', () => {
  it(
    "analytic-mode Gothic patch reproduces C2-full: 18045/18045, 0 outliers ≤0.01 vs exact analytic",
    () => {
      const t0 = Date.now();
      const analyticRA = buildAnalyticRadiusFn('GothicArches', {}, DIMS); // PRODUCTION fn
      const sampler = styleSampler('GothicArches', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
      const complex = buildProtectedComplex(sampler, 'GothicArches');
      expect(complex.residualCrossings).toBe(0);
      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: GOTHIC_N_THETA, thetaWindowRad: 0.5 };
      const refined = refineToZeroOutliers(
        sampler,
        complex,
        GOTHIC_DOMAIN,
        { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: GOTHIC_BG_ARC, ruler: loopRuler, surfaceSource: 'analytic', analyticRA },
        (s) => crumb('B-analytic-pass', { pass: s.pass, dense: s.dense, tris: s.nTris, outliers: s.outliers, worstMm: +s.worstMm.toFixed(5), ms: s.ms }),
      );
      const buildMs = Date.now() - t0;
      expect(refined.capped).toBe(false);
      const tris = refined.tris.length / 3;

      // Lift via the SAME analytic-backed sampler the kernel placed against, then score vs analytic.
      const analyticLift = analyticSurfaceSampler(analyticRA, DIMS.H);
      const xyz = liftChartMesh(analyticLift, refined.uv);
      const score = scoreWholeMeshInterior(
        Float32Array.from(xyz),
        Uint32Array.from(refined.tris),
        analyticRA,
        DIMS.H,
        { tol: TOL, stride: 1 },
      );
      crumb('B-analytic-done', {
        tris,
        passes: refined.passes,
        scanned: score.scannedFacets,
        interiorOutliers: score.interiorOutliers,
        wholeMeshMaxMm: score.wholeMeshMaxMm,
        buildMs,
      });
      // eslint-disable-next-line no-console
      console.log(`[analytic-ship PART B Gothic] tris=${tris} passes=${refined.passes} scanned=${score.scannedFacets} outliers=${score.interiorOutliers} max=${score.wholeMeshMaxMm} build=${(buildMs / 1000).toFixed(1)}s`);
      writeFileSync(join(OUT_DIR, 'analytic_ship_gothic_verdict.json'), JSON.stringify({ tris, passes: refined.passes, score, buildMs }, null, 2));

      expect(tris).toBe(18045);
      expect(score.scannedFacets).toBe(tris); // literal stride=1 full scan
      expect(score.interiorOutliers).toBe(0);
      expect(score.wholeMeshMaxMm).toBeLessThanOrEqual(0.01);
    },
    20 * 60 * 1000,
  );
});

describe.skipIf(!RUN_GEOSTAR)('T3.4 PART B(analytic) — GeoStar via PRODUCTION buildAnalyticRadiusFn (0 outliers)', () => {
  it(
    'analytic-mode GeoStar patch: 0 interior outliers ≤0.01 vs exact analytic (tris reported)',
    () => {
      const t0 = Date.now();
      const analyticRA = buildAnalyticRadiusFn('GeometricStar', {}, DIMS); // PRODUCTION fn
      const sampler = styleSampler('GeometricStar', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
      const complex = buildProtectedComplex(sampler, 'GeometricStar');
      expect(complex.residualCrossings).toBe(0);
      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: GEOSTAR_N_THETA, thetaWindowRad: 0.5 };
      const refined = refineToZeroOutliers(
        sampler,
        complex,
        GEOSTAR_DOMAIN,
        { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: GEOSTAR_BG_ARC, ruler: loopRuler, surfaceSource: 'analytic', analyticRA },
        (s) => crumb('geostar-pass', { pass: s.pass, dense: s.dense, tris: s.nTris, outliers: s.outliers, worstMm: +s.worstMm.toFixed(5), ms: s.ms }),
      );
      const buildMs = Date.now() - t0;
      expect(refined.capped).toBe(false);
      const tris = refined.tris.length / 3;

      const analyticLift = analyticSurfaceSampler(analyticRA, DIMS.H);
      const xyz = liftChartMesh(analyticLift, refined.uv);
      const score = scoreWholeMeshInterior(
        Float32Array.from(xyz),
        Uint32Array.from(refined.tris),
        analyticRA,
        DIMS.H,
        { tol: TOL, stride: 1 },
      );
      crumb('geostar-done', {
        tris,
        passes: refined.passes,
        scanned: score.scannedFacets,
        interiorOutliers: score.interiorOutliers,
        wholeMeshMaxMm: score.wholeMeshMaxMm,
        buildMs,
      });
      // eslint-disable-next-line no-console
      console.log(`[analytic-ship PART B GeoStar] tris=${tris} passes=${refined.passes} scanned=${score.scannedFacets} outliers=${score.interiorOutliers} max=${score.wholeMeshMaxMm} build=${(buildMs / 1000).toFixed(1)}s`);
      writeFileSync(join(OUT_DIR, 'analytic_ship_geostar_verdict.json'), JSON.stringify({ tris, passes: refined.passes, score, buildMs }, null, 2));

      expect(score.scannedFacets).toBe(tris);
      expect(score.interiorOutliers).toBe(0);
      expect(score.wholeMeshMaxMm).toBeLessThanOrEqual(0.01);
    },
    9 * 60 * 1000,
  );
});
