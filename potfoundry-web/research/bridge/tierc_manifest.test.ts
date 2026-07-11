// tierc_manifest.test.ts — TDD for the PROD-TIERC Phase-1 manifest v1 (architecture-v1.md build
// item 3; research/bridge/tierc_manifest.ts). FAST synthetic checks only, no heavy meshing — proves
// the manifest's wiring/shape, not fidelity numbers (those are the later region-layer-core /
// scored-arm build items, #4 and #8).
//
// DEV-ONLY. research/ never imported by src/. Run via the dedicated config (no shared "all
// research/bridge tests" config exists in this repo — see vitest.tierc_gates.config.ts's own header
// for the same convention):
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_manifest.config.ts research/bridge/tierc_manifest.test.ts
//
// PF_MANIFEST_LIVE=1 additionally runs the GyroidManifold anatomy provider at its real default
// resolution (GBE_EXTRACT_DEFAULT, nu=nt=1200, ~10.4s per champion-spec-gyroid.md §2.2) — OFF by
// default so the plain `vitest run` invocation above stays fast regardless of machine speed.
import { describe, it, expect } from 'vitest';
import { GBE_EXTRACT_DEFAULT } from './_gyroid_bandedge_lib';
import {
  getManifest,
  fourierBloomAnatomy,
  gyroidManifoldAnatomy,
  dragonScalesAnatomy,
  gothicArchesAnatomy,
  TIERC_COMMON_DIMS,
  TIERC_MANIFEST_STYLE_IDS,
} from './tierc_manifest';

// ─────────────────────────────── getManifest: shape for all 4 supported styles ───────────────────────────────

describe('getManifest — returns a well-formed manifest for all 4 supported styles', () => {
  const expected: Record<string, { ruler: string; g7scope: string }> = {
    FourierBloom: { ruler: 'radial-newton', g7scope: 'full-pot' },
    GyroidManifold: { ruler: 'radial-newton', g7scope: 'full-pot' },
    DragonScales: { ruler: 'ds-composite-v11g', g7scope: 'full-pot' },
    GothicArches: { ruler: 'k2-interior', g7scope: 'patch-NA' },
  };

  for (const styleId of TIERC_MANIFEST_STYLE_IDS) {
    it(`${styleId}: styleId/truth/ruler/budget/gates/anatomy are all present and consistent`, () => {
      const m = getManifest(styleId);
      expect(m.styleId).toBe(styleId);

      expect(m.truth.bridgeClass).toBe('exact');
      expect(typeof m.truth.rA).toBe('function');
      const sample = m.truth.rA(0.3, TIERC_COMMON_DIMS.H / 2);
      expect(Number.isFinite(sample)).toBe(true);
      expect(sample).toBeGreaterThan(0);

      expect(m.ruler).toBe(expected[styleId].ruler);
      expect(m.gates.g7scope).toBe(expected[styleId].g7scope);

      expect(m.budget.maxOuterTris).toBeGreaterThan(0);
      expect(m.budget.maxFullTris).toBeGreaterThanOrEqual(m.budget.maxOuterTris);

      expect(typeof m.anatomy).toBe('function');
    });
  }
});

// ─────────────────────────────── FourierBloom (Arm D control) ───────────────────────────────

describe('FourierBloom anatomy — the null-case control', () => {
  it('is a single R-CDT region spanning the whole wall, zero curves, zero pins', () => {
    const anatomy = fourierBloomAnatomy({}, TIERC_COMMON_DIMS);
    expect(anatomy.regions).toHaveLength(1);
    expect(anatomy.regions[0].type).toBe('R-CDT');
    expect(anatomy.regions[0].domain).toEqual({ uLo: 0, uHi: 1, tLo: 0, tHi: 1 });
    expect(anatomy.regions[0].boundaryChains).toEqual([]);
    expect(anatomy.curves).toEqual([]);
    expect(anatomy.pins).toEqual([]);
  });

  it('budget matches the SHIPPED-CLEAN batch capture row (all20_scorecard.md:4)', () => {
    const m = getManifest('FourierBloom');
    expect(m.budget).toEqual({ maxOuterTris: 1_278_510, maxFullTris: 3_143_106 });
  });
});

// ─────────────────────────────── GyroidManifold (Arm A) ───────────────────────────────

describe('GyroidManifold anatomy — wraps _gyroid_bandedge_lib extraction verbatim', () => {
  // Always-on, FAST: a tiny 60x60 grid override proves the wiring (extractBandedgeContours ->
  // contoursToFeatureLines -> EmbeddedCurve[]) without the ~10s default-resolution cost, keeping this
  // suite inside the file's own "fast synthetic checks only, no heavy meshing" mandate regardless of
  // machine speed.
  it('tiny-grid override produces a well-formed R-CDT region + EmbeddedCurve[] (wiring shape)', () => {
    const anatomy = gyroidManifoldAnatomy({}, TIERC_COMMON_DIMS, {
      ...GBE_EXTRACT_DEFAULT,
      nu: 60,
      nt: 60,
      placementSampleN: 100,
    });
    expect(anatomy.regions).toHaveLength(1);
    expect(anatomy.regions[0].type).toBe('R-CDT');
    expect(anatomy.regions[0].sizing).toEqual({ method: 'fixed-feature-level', params: { featureLevel: 11 } });
    expect(anatomy.regions[0].boundaryChains).toEqual([]);

    expect(Array.isArray(anatomy.curves)).toBe(true);
    for (const curve of anatomy.curves) {
      expect(curve.kind).toBe('general-curve');
      expect(curve.points.length).toBeGreaterThanOrEqual(2);
      for (const p of curve.points) {
        expect(Number.isFinite(p.u)).toBe(true);
        expect(Number.isFinite(p.t)).toBe(true);
      }
    }
    expect(anatomy.pins).toEqual([]); // A3 (pins at scale) is a separate, not-yet-run sub-arm.
  });

  it('budget: maxOuterTris is the cited prereg 5.3(a) figure; maxFullTris is derived (>= outer)', () => {
    const m = getManifest('GyroidManifold');
    expect(m.budget.maxOuterTris).toBe(7_000_000);
    expect(m.budget.maxFullTris).toBeGreaterThan(m.budget.maxOuterTris);
  });

  // Gated: full GBE_EXTRACT_DEFAULT resolution (nu=nt=1200) measured at ~10.4s
  // (champion-spec-gyroid.md §2.2) — comfortably under the mission's 30s threshold, but the file's own
  // "fast synthetic checks only, no heavy meshing" mandate keeps it off the default run. Run with
  // PF_MANIFEST_LIVE=1 to exercise the real default-resolution extraction end to end.
  const liveIt = process.env.PF_MANIFEST_LIVE === '1' ? it : it.skip;
  liveIt(
    'PF_MANIFEST_LIVE=1: default-resolution extraction matches champion-spec-gyroid.md §2.2 order of magnitude (28,785 pts / ~2,045 polylines)',
    () => {
      const anatomy = gyroidManifoldAnatomy({}, TIERC_COMMON_DIMS);
      expect(anatomy.curves.length).toBeGreaterThan(1_000);
      expect(anatomy.curves.length).toBeLessThan(3_000);
      const totalPts = anatomy.curves.reduce((n, c) => n + c.points.length, 0);
      expect(totalPts).toBeGreaterThan(20_000);
      expect(totalPts).toBeLessThan(35_000);
    },
  );
});

// ─────────────────────────────── DragonScales (Arm B) ───────────────────────────────

describe('DragonScales anatomy — dragonRings(8) -> 7 ring + 8 body regions', () => {
  it('yields exactly 7 R-STRUCT ring regions with correct z centers (15..105) and +-0.6mm bands', () => {
    const anatomy = dragonScalesAnatomy({}, TIERC_COMMON_DIMS);
    const ringRegions = anatomy.regions.filter((r) => r.type === 'R-STRUCT');
    expect(ringRegions).toHaveLength(7);

    const ringZ = ringRegions.map((r) => (r.domain.zLo! + r.domain.zHi!) / 2);
    expect(ringZ).toEqual([15, 30, 45, 60, 75, 90, 105]);

    for (const r of ringRegions) {
      expect(r.domain.zHi! - r.domain.zLo!).toBeCloseTo(1.2, 10); // +-0.6mm half-band
      expect(r.kernelOpts?.nTheta).toBe(2400);
      expect(r.kernelOpts?.treadCap).toBe(4);
      expect(r.boundaryChains).toHaveLength(2);
      expect(r.boundaryChains.every((c) => c.status === 'TODO')).toBe(true);
      expect(r.sizing.method).toBe('designed-texture-exempt');
    }
  });

  it('yields exactly 8 R-CDT body regions spanning [0,15],[15,30],...,[105,120]', () => {
    const anatomy = dragonScalesAnatomy({}, TIERC_COMMON_DIMS);
    const bodyRegions = anatomy.regions.filter((r) => r.type === 'R-CDT');
    expect(bodyRegions).toHaveLength(8);

    const bodyBounds = bodyRegions.map((r) => [r.domain.zLo, r.domain.zHi]);
    expect(bodyBounds).toEqual([
      [0, 15],
      [15, 30],
      [30, 45],
      [45, 60],
      [60, 75],
      [75, 90],
      [90, 105],
      [105, 120],
    ]);
    for (const r of bodyRegions) {
      expect(r.sizing.method).toBe('metric-sizing'); // Decision A6: stays on K1 adaptive.
      expect(r.boundaryChains).toHaveLength(2);
    }
  });

  it('budget matches prereg T4 / champion-spec-dragonscales.md §1.4 production capture', () => {
    const m = getManifest('DragonScales');
    expect(m.budget).toEqual({ maxOuterTris: 4_549_600, maxFullTris: 8_734_682 });
  });
});

// ─────────────────────────────── GothicArches (Arm C, patch scope) ───────────────────────────────

describe('GothicArches anatomy — single R-REFINE patch region', () => {
  it('carries the exact prereg Arm C1 patch domain (u[0,0.125], t[0.48,0.52])', () => {
    const anatomy = gothicArchesAnatomy({}, TIERC_COMMON_DIMS);
    expect(anatomy.regions).toHaveLength(1);
    expect(anatomy.regions[0].type).toBe('R-REFINE');
    expect(anatomy.regions[0].domain).toEqual({ uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 });
  });

  it('kernelOpts carries the verified patch-gate config (bgArcMm=0.6, nTheta=512)', () => {
    const anatomy = gothicArchesAnatomy({}, TIERC_COMMON_DIMS);
    const region = anatomy.regions[0];
    expect(region.kernelOpts?.bgArcMm).toBe(0.6);
    expect(region.kernelOpts?.rulerNTheta).toBe(512);
    expect(region.sizing).toEqual({
      method: 'k2-isotropic-refine',
      params: { tolMm: 0.01, maxPass: 16, bulkPasses7pt: 4 },
    });
  });

  it('budget matches prereg C1 (9,917 tris patch reference); patch scope has no outer/full split', () => {
    const m = getManifest('GothicArches');
    expect(m.budget).toEqual({ maxOuterTris: 9_917, maxFullTris: 9_917 });
    expect(m.gates.g7scope).toBe('patch-NA');
  });
});

// ─────────────────────────────── unknown styleId ───────────────────────────────

describe('getManifest — unknown styleId', () => {
  it('throws with a clear message listing every supported style', () => {
    let message = '';
    try {
      getManifest('TotallyUnknownStyle');
      throw new Error('expected getManifest to throw for an unsupported styleId');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('TotallyUnknownStyle');
    for (const id of TIERC_MANIFEST_STYLE_IDS) {
      expect(message).toContain(id);
    }
  });
});
