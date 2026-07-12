// _tierc_a2_gatesrunner.test.ts — TDD for PROD-TIERC region-layer-core plan task A-2
// (docs/superpowers/plans/2026-07-12-region-layer-core.md §A-2: "wire a single composite
// gates-harness runner over buildRegionOuterWall so the 4 style arms (A-3..A-6) can each score
// through it"). Research-side only. A-1 (DS ChainSpecs DEFINED) is committed; this builds on it.
//
// ── ANATOMY-SIGNATURE DECISION (brief requirement — pick ONE, state which) ─────────────────────────
// KEEP tierc_regionLayer.ts's existing `toHarnessManifest` LOCALIZED CAST (tierc_regionLayer.ts:118-127)
// — do NOT loosen tierc_gatesHarness.ts's placeholder `StyleManifest.anatomy` signature, and make NO
// edit to tierc_gatesHarness.ts at all. Rationale: that adapter was already wired by the
// region-layer-core build (tierc_regionLayer.ts's own file header: "The manifest -> harness adapter
// (mismatch #1) ... is resolved here via `toHarnessManifest`"), and `scoreAllGates` reads exactly TWO
// fields off its `manifestRow` parameter — `manifestRow?.truth?.bridgeClass` and
// `manifestRow?.budget?.maxFullTris` (grep-confirmed by tierc_gatesHarness.ts's own StyleManifest
// doc-comment; `anatomy` is never referenced in scoreAllGates' runtime body) — both of which
// `toHarnessManifest` preserves verbatim. tierc_manifest.ts's own StyleManifest doc-comment offers
// "either loosen tierc_gatesHarness.ts's placeholder `anatomy` signature ... or add an adapter at the
// call site" as the two valid options; the adapter already exists, and both this task's runner and the
// `npm run typecheck` pass prove the `getManifest(...) -> toHarnessManifest(...) -> scoreAllGates(...)`
// chain compiles cleanly under this repo's `strict`/`strictFunctionTypes` tsconfig. Loosening the
// harness placeholder instead would touch a file with its own converged v1.1 header/history for zero
// behavioral gain. So: A-2 edits NO harness file — the reconciliation is "keep the cast", already
// clean, exercised here on all 4 REAL getManifest() styles (not just the synthetic tinyManifest
// tierc_regionLayer.test.ts already covers).
//
// ── Two-tier suite (mirrors _tierc_a1_dschain.test.ts's always-on / env-gated split) ──────────────
//   ALWAYS-ON (foreground, in the default loop):
//     (1) toHarnessManifest adapter round-trips every one of the 4 REAL getManifest() styles.
//     (2) THE RUNNER GATE, cheapest path: buildRegionOuterWall -> scoreAllGates -> ndjson row, on a
//         REDUCED-DENSITY FourierBloom control (single-R-CDT, the orchestration null case) at TINY
//         dims (H=20) + small sizing (resU/resT=16). This proves the end-to-end runner + the §3.3 row
//         schema + BOTH non-vacuity witnesses (nonManControlMoved / locatorSelfCheckMaxMm<1e-9) fire
//         — WITHOUT paying a full production build. Reduced density is deliberate and NOTED per the
//         coordinator's A-2 scope clarification ("validate the runner on the cheapest path ... use a
//         smaller dims/budget and NOTE it"); the FULL per-arm production-scale runs are A-3..A-6, not
//         this task. The build path exercised (buildRegionOuterWall single-R-CDT -> assembleWatertight
//         -> extractOuterWallSubmesh -> evaluatePackedAssemblyToXyz) is the SAME code the production
//         arms take — only the grid resolution differs, exactly the tinyManifest strategy
//         tierc_regionLayer.test.ts's own dispatch-correctness suite already relies on.
//   PF_TIERC_A2_GATESRUNNER=1 (real production-scale build, all 4 REAL arms): the same runner over
//     buildRegionOuterWall(getManifest(id), TIERC_COMMON_DIMS) for FourierBloom / GyroidManifold /
//     DragonScales / GothicArches — one valid ndjson row per arm + the witnesses. This is the literal
//     brief interface at full scale; OFF by default because a single Gyroid build alone is ~92.5s
//     (champion-spec-gyroid.md), i.e. the 4-arm sweep is minutes, not loop-fast. Individual arm
//     FIDELITY (outlier counts, coverage/quality-vs-baseline verdicts) is NOT scored even here — that
//     is A-3..A-6's job (see _tierc_armD/_armA1/_armB1/_armC1.test.ts). g2Lattice/g1Brute FAST
//     overrides bound the SCORING stage only (sample-density-only levers, never algorithm-changing —
//     see ScoreAllGatesOpts.g2Lattice/g1Brute doc-comments in tierc_gatesHarness.ts).
//
// GothicArches has no full-pot concept (`gates.g7scope:'patch-NA'`) — buildRegionOuterWall's R-REFINE
// dispatch returns no `full` BinMesh (tierc_regionLayer.ts's buildSingleRRefineRegion: "`full` is
// intentionally omitted"). Per _tierc_armC1.test.ts's precedent ("`full` and `outer` are the SAME
// patch mesh in the `bins` argument, labeled"), this runner feeds `full: result.full ?? result.outer`.
//
// OPEN gate fields (G5 bridging, most of G7 assembly) are asserted as `null` / `"OPEN"` literals,
// never fabricated — this repo's audit-first rule (a gate with no live instrument reports OPEN).
//
// DEV-ONLY. research/ never imported by src/. NEW FILE — no existing test file edited. Run via:
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_a2_gatesrunner.config.ts
//   PF_TIERC_A2_GATESRUNNER=1 NODE_OPTIONS=--max-old-space-size=12288 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_a2_gatesrunner.config.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getManifest,
  TIERC_COMMON_DIMS,
  TIERC_MANIFEST_STYLE_IDS,
  type StyleManifest,
  type FeatureAnatomy,
} from './tierc_manifest';
import { buildRegionOuterWall, toHarnessManifest } from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth, type GatesRow, type BinMesh } from './tierc_gatesHarness';
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

// FAST overrides for the SCORING stage only (see file header) — identical convention to
// tierc_gatesHarness.test.ts's own FAST const (change only sample density, never which facets get
// flagged as outliers).
const FAST_G2 = { nu: 8, nt: 8 };
const FAST_G1_BRUTE = { nTheta: 32, nZ: 8 };

// REDUCED-DENSITY control manifest (always-on gate): FourierBloom's real rA at TINY dims + small
// sizing — same single-R-CDT dispatch the production Arm-D control takes, just a coarse grid. Mirrors
// tierc_regionLayer.test.ts's own tinyManifest strategy exactly (that suite runs in the default loop).
const TINY_DIMS: StyleDims = { H: 20, Rb: 10, Rt: 12, expn: 1 };
const TINY_SIZING = {
  maxSagMm: 0.2,
  maxEdgeMm: 4,
  minEdgeMm: 0.5,
  gradeRatio: 2,
  maxLevel: 8,
  resU: 16,
  resT: 16,
  nRing: 32,
  targetTriangles: 200_000,
  featureLevel: 6,
};

function reducedFourierBloomManifest(): StyleManifest {
  const rA = buildRadiusFn('FourierBloom' as StyleId, {}, TINY_DIMS);
  const anatomy: FeatureAnatomy = {
    regions: [
      {
        id: 'outer-wall',
        type: 'R-CDT',
        domain: { uLo: 0, uHi: 1, tLo: 0, tHi: 1 },
        boundaryChains: [],
        sizing: { method: 'metric-sizing', params: { ...TINY_SIZING } },
      },
    ],
    curves: [],
    pins: [],
    birthDeathNotes: 'reduced-density FourierBloom control — runner gate only, NOT a scored arm.',
  };
  return {
    styleId: 'FourierBloom',
    truth: { rA, bridgeClass: 'exact' },
    anatomy: () => anatomy,
    ruler: 'radial-newton',
    budget: { maxOuterTris: 5_000_000, maxFullTris: 10_000_000 },
    gates: { g7scope: 'full-pot' },
  };
}

/** Every field the GatesRow schema (tierc_gatesHarness.ts, gates-harness-spec.md §3.3) declares is
 *  present on the JSON-round-tripped row — "one valid ndjson row, correct schema" — and OPEN gate
 *  fields carry the null / "OPEN" literal, never a fabricated pass. */
function assertValidGatesRowSchema(row: GatesRow, styleId: string): void {
  const parsed = JSON.parse(JSON.stringify(row)) as GatesRow;
  expect(parsed.style, 'row.style').toBe(styleId);
  expect(typeof parsed.runId, 'row.runId').toBe('string');
  expect(typeof parsed.at, 'row.at').toBe('string');
  expect(parsed.dims, 'row.dims').toHaveProperty('H');
  for (const gateKey of [
    'g1_forward', 'g2_reverse', 'g3_watertight', 'g4_zeroDefect',
    'g5_bridging', 'g6_budget', 'g7_assembly', 'quality',
  ] as const) {
    expect(parsed[gateKey], `row.${gateKey} must be present`).toBeDefined();
  }
  expect(typeof parsed.totalMs, 'row.totalMs').toBe('number');
  // OPEN gate fields: null / "OPEN" literal, never fabricated (audit-first rule; gates-harness-spec.md
  // §3.3 / Gap List #7 — G5 has no live instrument yet).
  expect(parsed.g5_bridging.verdict).toBe('OPEN');
  expect(parsed.g5_bridging.detectorRecall).toBeNull();
  expect(parsed.g5_bridging.detectorPrecision).toBeNull();
  expect(parsed.g5_bridging.residualCrossings).toBeNull();
  expect(parsed.g5_bridging.constraintRecoveryFailed).toBeNull();
  expect(parsed.g7_assembly.seamSpecificCheck).toBe('OPEN');
  expect(parsed.g7_assembly.rimCheck).toBe('OPEN');
  expect(parsed.g7_assembly.baseCheck).toBe('OPEN');
  expect(parsed.g7_assembly.capCheck).toBe('OPEN');
  expect(parsed.g7_assembly.innerOuterStitchCheck).toBe('OPEN');
}

/** The two MANDATORY instrument non-vacuity witnesses (prereg "Common configuration": "a row without
 *  them is VOID"). Both are shard-0-only fields; this runner never shards (nShards defaults to 1), so
 *  both are always populated, never null. */
function assertWitnesses(row: GatesRow, styleId: string): void {
  expect(row.g3_watertight.nonManControlMoved, `${styleId}: nonManControlMoved`).toBe(true);
  expect(row.g2_reverse.locatorSelfCheckMaxMm, `${styleId}: locatorSelfCheckMaxMm`).not.toBeNull();
  expect(
    row.g2_reverse.locatorSelfCheckMaxMm as number,
    `${styleId}: locatorSelfCheckMaxMm`,
  ).toBeLessThan(1e-9);
}

describe('A-2 — toHarnessManifest adapter wiring (always-on, all 4 REAL manifests, no meshing)', () => {
  for (const styleId of TIERC_MANIFEST_STYLE_IDS) {
    it(`${styleId}: toHarnessManifest(getManifest(...)) preserves the two fields scoreAllGates reads`, () => {
      const manifest = getManifest(styleId);
      const row = toHarnessManifest(manifest);
      expect(row.styleId).toBe(manifest.styleId);
      expect(row.truth.bridgeClass).toBe(manifest.truth.bridgeClass);
      expect(row.truth.rA).toBe(manifest.truth.rA); // same function reference, not re-derived
      expect(row.budget?.maxFullTris).toBe(manifest.budget.maxFullTris);
      expect(row.budget?.maxOuterTris).toBe(manifest.budget.maxOuterTris);
      expect(row.gates?.g7scope).toBe(manifest.gates.g7scope);
      expect(row.ruler).toBe(manifest.ruler);
    });
  }

  it('TIERC_MANIFEST_STYLE_IDS names exactly the 4 Phase-1 arms this runner drives', () => {
    expect([...TIERC_MANIFEST_STYLE_IDS]).toEqual([
      'FourierBloom', 'GyroidManifold', 'DragonScales', 'GothicArches',
    ]);
  });
});

describe('A-2 — the composite gates-harness RUNNER (always-on gate, reduced-density FourierBloom control)', () => {
  it('buildRegionOuterWall -> scoreAllGates emits ONE valid ndjson row, witnesses fire, row round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tierc-a2-runner-'));
    const outPath = join(dir, 'gates.ndjson');
    try {
      const manifest = reducedFourierBloomManifest();
      const result = buildRegionOuterWall(manifest, TINY_DIMS);
      expect(result.meta.dispatch, 'single-R-CDT control dispatch').toBe('single-R-CDT');
      expect(result.full, 'single-R-CDT always returns a full-pot mesh').toBeDefined();
      expect(result.outer.idx.length, 'non-vacuous: outer wall actually built').toBeGreaterThan(0);

      const fullBin: BinMesh = result.full ?? result.outer;
      const styleTruth: StyleTruth = {
        styleId: manifest.styleId,
        rA: manifest.truth.rA,
        H: TINY_DIMS.H,
        Rb: TINY_DIMS.Rb,
        Rt: TINY_DIMS.Rt,
        expn: TINY_DIMS.expn,
      };
      const manifestRow = toHarnessManifest(manifest);

      const row = scoreAllGates(
        { full: fullBin, outer: result.outer },
        styleTruth,
        manifestRow,
        {
          g2Lattice: FAST_G2,
          g1Brute: FAST_G1_BRUTE,
          outputPath: outPath,
          runId: `a2-runner-FourierBloom-reduced-${Date.now()}`,
        },
      );

      assertValidGatesRowSchema(row, 'FourierBloom');
      assertWitnesses(row, 'FourierBloom');

      // g6 budget was wired from the manifest (proves toHarnessManifest carried budget through).
      expect(row.g6_budget.policyMaxTris).toBe(manifest.budget.maxFullTris);
      // truthBridge classified from the manifest's bridgeClass:'exact' (proves the other read field).
      expect(row.truthBridge).toEqual({ ok: true, note: null });

      // Exactly ONE ndjson line, round-tripping to the same row.
      const lines = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(1);
      const saved = JSON.parse(lines[0]) as GatesRow;
      expect(saved.style).toBe('FourierBloom');
      expect(saved.totalMs).toBe(row.totalMs);

      // eslint-disable-next-line no-console
      console.log(
        `[a2-runner] reduced FourierBloom: dispatch=${result.meta.dispatch} ` +
          `outerTris=${result.outer.idx.length / 3} fullTris=${fullBin.idx.length / 3} | ` +
          `nonManControlMoved=${row.g3_watertight.nonManControlMoved} ` +
          `locatorSelfCheckMaxMm=${row.g2_reverse.locatorSelfCheckMaxMm}`,
      );
      // eslint-disable-next-line no-console
      console.log(`[a2-runner] SAMPLE NDJSON ROW:\n${lines[0]}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────── real production-scale runner (env-gated) ─────────────────────────────
// The literal brief interface at FULL scale across all 4 REAL getManifest() arms. OFF by default (a
// single Gyroid build alone is ~92.5s, champion-spec-gyroid.md). Generous backstop timeout only
// (mirrors _tierc_armD.test.ts's philosophy: "this in-process ceiling should never actually fire").
const RUN = process.env.PF_TIERC_A2_GATESRUNNER === '1';
const GATESRUNNER_TIMEOUT_MS = 40 * 60 * 1000;

describe.skipIf(!RUN)(
  'A-2 — runner over all 4 REAL arms at production scale (PF_TIERC_A2_GATESRUNNER=1)',
  () => {
    it(
      'buildRegionOuterWall(getManifest(id), TIERC_COMMON_DIMS) -> scoreAllGates emits one valid ndjson row per arm, non-vacuous',
      () => {
        const dir = mkdtempSync(join(tmpdir(), 'tierc-a2-gatesrunner-'));
        const outPath = join(dir, 'gates.ndjson');
        const rows: GatesRow[] = [];
        try {
          for (const styleId of TIERC_MANIFEST_STYLE_IDS) {
            const manifest = getManifest(styleId);
            const t0 = Date.now();
            const result = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
            const buildMs = Date.now() - t0;
            // eslint-disable-next-line no-console
            console.log(
              `[a2-gatesrunner] ${styleId} build DONE in ${(buildMs / 1000).toFixed(1)}s: ` +
                `dispatch=${result.meta.dispatch} outer=${result.outer.idx.length / 3} ` +
                `full=${result.full ? result.full.idx.length / 3 : 'N/A(patch-NA)'} tris`,
            );

            const fullBin: BinMesh = result.full ?? result.outer;
            const styleTruth: StyleTruth = {
              styleId: manifest.styleId,
              rA: manifest.truth.rA,
              H: TIERC_COMMON_DIMS.H,
              Rb: TIERC_COMMON_DIMS.Rb,
              Rt: TIERC_COMMON_DIMS.Rt,
              expn: TIERC_COMMON_DIMS.expn,
            };
            const manifestRow = toHarnessManifest(manifest);
            const row = scoreAllGates(
              { full: fullBin, outer: result.outer },
              styleTruth,
              manifestRow,
              {
                g2Lattice: FAST_G2,
                g1Brute: FAST_G1_BRUTE,
                outputPath: outPath,
                runId: `a2-gatesrunner-${styleId}-${Date.now()}`,
              },
            );
            assertValidGatesRowSchema(row, styleId);
            assertWitnesses(row, styleId);
            rows.push(row);
          }

          expect(rows.length).toBe(4);
          expect(new Set(rows.map((r) => r.style)).size).toBe(4);
          const lines = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean);
          expect(lines.length).toBe(4);
          const fileStyles = new Set(lines.map((l) => (JSON.parse(l) as GatesRow).style));
          expect(fileStyles).toEqual(new Set(TIERC_MANIFEST_STYLE_IDS));
          // eslint-disable-next-line no-console
          console.log(`[a2-gatesrunner] SAMPLE ROW (${rows[0].style}):\n${JSON.stringify(rows[0], null, 2)}`);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      },
      GATESRUNNER_TIMEOUT_MS,
    );
  },
);
