// research/bridge/tierc_gatesBench.test.ts — PROD-TIERC Phase-1 gates-harness BENCHMARK arm.
//
// MISSION: research/lab/tierc/gates-harness-spec.md marks every instrument's cost at the charter's own
// ~3M-tri reference scale as OPEN ("No instrument in this inventory has been benchmarked at exactly the
// charter's reference scale... I mark that number OPEN", §1 G1 "Cost profile"; Gap List #6: "add a first
// real benchmark run at the charter's own ~3M-tri reference scale"). This file closes that OPEN by driving
// `scoreAllGates` (research/bridge/tierc_gatesHarness.ts, committed 0a693ae9, proven only on the synthetic
// fixtures in tierc_gatesHarness.test.ts) against REAL captured production artifacts and producing the
// first real research/exchange/tierc/gates.ndjson rows.
//
// HARD RULE (mission-mandated): tierc_gatesHarness.ts is NOT touched by this arm. Where the harness lacks
// a lever this probe would like (see the GothicArches note below), the driver works around it and the gap
// is reported, not patched into the harness.
//
// Env-gated: PF_TIERC_BENCH=1 to run; unset (the default) is a no-op — matches the PF_PROD_TRUTH convention
// _prod_truth.test.ts uses (see that file's `ON` const), so `npm test`/CI never pays this probe's cost.
//
// Input contract (already proven, e2e/_prod_truth_capture.mjs — see gates-harness-spec.md §3.1): two mesh
// artifacts per style, research/exchange/_prod_truth/<style>/{full,outer}.{xyz,idx}.bin + meta.json, loaded
// via `loadBinMesh` (research/bridge/_pf_bvhRuler.ts:383-390, precedented by _prod_truth.test.ts:22,123-124).
// Style truth `rA` is built via `buildRadiusFn` (research/bridge/runStyle.ts), the exact helper
// _prod_truth.test.ts:19,121 uses, with the SAME capture dims (_prod_truth.test.ts:34): the captured bins
// were generated at H120/top_od100/bottom_od80/expn1/spin0, so DIMS here must match verbatim or `rA` would
// score against the wrong surface.
//
// STYLES (mission-specified, in order):
//   1. FourierBloom — unsharded (shard 0 of 1), full population. Correctness anchor: the PROD-BATCH verdict
//      table (research/lab/2026-07-10-program-consolidation.md:780) reads
//      "FourierBloom | stride 1, full pop | 0 | 0 | 0.0037 | SHIPPED-CLEAN" — this harness row should come
//      out clean too (0 outliers, small coverage max), or the disagreement is a real finding.
//   2. GothicArches — 1.42M outer tris (meta.json: outer.tris=1,415,270), known REGRESSION in the same
//      table: "stride 4, 4-shard merged | 33,345/40,736 (81.9%) -> ~133,400 of 162,937 surv |
//      0.3567 -> 0.3460/0.3045 | 1.2318 (batch-largest; tracery grooves) | REGRESSION". This harness row
//      should broadly reproduce those magnitudes (forward outliers ~30-40k at this scale, coverage max
//      ~1.2mm) — exact agreement is NOT expected (the harness composes G1/G2 slightly differently: no
//      PF_PT_STRIDE lever, see below), only same order of magnitude.
//
//      GAP FOUND (reported per the mission, harness NOT patched): `ScoreAllGatesOpts`
//      (tierc_gatesHarness.ts:81-120) has no `stride` option — only `tolMm`, `shard`/`nShards`,
//      `breadcrumbPath`, `prescreen`, `runId`, `outputPath`, `g2Lattice`, `g1Brute`,
//      `outerWallSeamTriangles`. The batch's "stride 4, 4-shard merged" GothicArches basis (a UNIFORM 4x
//      subsample of survivors, THEN 4-way sharded for parallelism, per program-consolidation.md's own
//      language) has no equivalent lever here. WORKAROUND (per the mission): run GothicArches at
//      shard=0/nShards=4 (PF_PT_SHARD/PF_PT_NSHARDS convention) and report it honestly as ONE shard's worth
//      of the full (unstrided) survivor population, not a merged/strided row — comparable ORDER of
//      magnitude, not the same basis string. Cross-check: the ORIGINAL _prod_truth.test.ts probe's own
//      shard=0/nShards=4 row for GothicArches (research/exchange/_prod_truth/scorecard.ndjson, no stride
//      applied at the per-shard level) scored ~40,734 survivor facets in ~4,569,249ms interior time
//      (~76.2 min) on this exact machine/style/shard config — this arm's time-gate decision (see below) is
//      calibrated against that direct historical precedent, not a guess.
//
// TIME-GATE (mission-mandated, executed EXTERNALLY, not in this file): if GothicArches' G1 stage projects
// beyond ~40 minutes from its research/exchange/tierc/bench_crumbs.ndjson cadence (PF_PT_BREADCRUMB
// convention — interior-tick crumbs fire every >=30s with {done,total,out,worst}, letting an outside
// watcher compute done/elapsed and project total time), the process is killed by PID/cmdline match
// (CROSS-WORKSTREAM-NOTES.md's documented kill convention) and the projection is reported instead of a
// completed row. This file has no internal timeout logic for that decision by design — the backstop
// testTimeout in vitest.tierc_bench.config.ts exists only so a monitoring failure doesn't hang forever.
//
// DEV-ONLY. research/ never imported by src/. Node-only (loadBinMesh uses node:fs; scoreAllGates's
// breadcrumb/ndjson side effects are opt-in via the opts passed below).
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import { loadBinMesh } from './_pf_bvhRuler';
import { scoreAllGates, type StyleTruth } from './tierc_gatesHarness';
import type { StyleId } from '../../src/geometry/types';

const ON = process.env.PF_TIERC_BENCH === '1';
const ROOT = join('research', 'exchange', '_prod_truth');
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'bench_crumbs.ndjson');
// Capture dims — MUST match e2e/_prod_truth_capture.mjs / _prod_truth.test.ts:34 verbatim (same bins reused).
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL_MM = 0.01;

interface BenchStyle {
  style: string;
  shard: number;
  nShards: number;
  note: string;
}

// Order matters (mission-specified): cheap correctness-anchor first, expensive REGRESSION-class second —
// so a kill/timeout on GothicArches never costs FourierBloom's already-durably-written row (scoreAllGates
// appends synchronously via node:fs's appendFileSync before returning; see tierc_gatesHarness.ts:724-726).
const STYLES: BenchStyle[] = [
  {
    style: 'FourierBloom',
    shard: 0,
    nShards: 1,
    note: 'unsharded, full population -- correctness anchor vs batch SHIPPED-CLEAN',
  },
  {
    style: 'GothicArches',
    shard: 0,
    nShards: 4,
    note: 'shard 0/4 -- no-stride-lever workaround (see file header); batch verdict REGRESSION',
  },
];

describe.skipIf(!ON)('PROD-TIERC gates-harness BENCHMARK -- real captured production artifacts', () => {
  for (const cfg of STYLES) {
    it(
      `${cfg.style}: scoreAllGates on captured production bins (${cfg.note})`,
      () => {
        mkdirSync(OUT_DIR, { recursive: true });
        const dir = join(ROOT, cfg.style);
        const metaPath = join(dir, 'meta.json');
        if (!existsSync(metaPath)) {
          throw new Error(`no capture for ${cfg.style} (meta.json missing at ${metaPath})`);
        }
        const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
          ok: boolean;
          error?: string;
          full?: { tris: number };
          outer?: { tris: number };
        };
        if (!meta.ok) {
          throw new Error(`capture failed for ${cfg.style}: ${meta.error ?? 'unknown'}`);
        }

        const rA = buildRadiusFn(cfg.style as StyleId, {}, DIMS);
        const tLoad0 = Date.now();
        const full = loadBinMesh(join(dir, 'full.xyz.bin'), join(dir, 'full.idx.bin'));
        const outer = loadBinMesh(join(dir, 'outer.xyz.bin'), join(dir, 'outer.idx.bin'));
        const loadMs = Date.now() - tLoad0;
        console.log(
          `[tierc-bench] ${cfg.style}: loaded full=${full.idx.length / 3} outer=${outer.idx.length / 3} tris (${loadMs}ms)`,
        );

        const styleTruth: StyleTruth = {
          styleId: cfg.style,
          rA,
          H: DIMS.H,
          Rb: DIMS.Rb,
          Rt: DIMS.Rt,
          expn: DIMS.expn,
        };
        const row = scoreAllGates({ full, outer }, styleTruth, undefined, {
          tolMm: TOL_MM,
          shard: cfg.shard,
          nShards: cfg.nShards,
          breadcrumbPath: CRUMB_PATH,
          outputPath: OUT,
          runId: `bench-${cfg.style}-${Date.now()}`,
        });

        console.log(
          `[tierc-bench] ${cfg.style} [shard ${cfg.shard}/${cfg.nShards}]: ` +
            `g1 survivors=${row.g1_forward.survivors} outliers=${row.g1_forward.outliers} maxMm=${row.g1_forward.maxMm.toFixed(4)} ` +
            `newtonWorst=${row.g1_forward.newtonWorstMm ?? 'n/a'} (${row.g1_forward.ms}ms) | ` +
            `g2 coverageMax=${row.g2_reverse.maxMm ?? 'n/a'} (${row.g2_reverse.ms ?? 'n/a'}ms) | ` +
            `g3 nonManRaw=${row.g3_watertight.nonManRaw ?? 'n/a'} (${row.g3_watertight.ms ?? 'n/a'}ms) | ` +
            `g4 zeroArea=${row.g4_zeroDefect.zeroAreaCount ?? 'n/a'} (${row.g4_zeroDefect.ms ?? 'n/a'}ms) | ` +
            `quality minAngle=${row.quality.minAngleDeg.toFixed(2)} needles=${row.quality.needleCount} | ` +
            `total=${(row.totalMs / 1000).toFixed(1)}s`,
        );

        // Non-vacuity / instrument-hygiene witnesses, carried verbatim from the proven _prod_truth.test.ts
        // precedent (:342-343) and the spec's own design note (gates-harness-spec.md §3.3: "MUST be true or
        // the row is void"). Both only run shard-0 (spec §3.4) -- every style configured above IS shard 0.
        expect(row.g3_watertight.nonManControlMoved).toBe(true);
        expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
        expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);
      },
      21_600_000, // 6h in-process backstop; the real kill decision is external (see file header).
    );
  }
});
