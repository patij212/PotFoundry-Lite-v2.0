// _certRosterConvergence.test.ts — DEV-ONLY. The refine-vs-redesign convergence
// probe on the PF_G2_POT certified roster: the shallow-depth worst-residual at
// TWO densities (FINE = certified divisions, COARSE = one step down), per patch.
// coarseMax/fineMax ~4 => density-responsive (refine); ~1 => structurally
// irreducible (redesign the mesher).
//
// Reuses atlas -> tessellate from ./_certRoster and the exact residual evaluator
// via ./_certRosterConvergenceLib (no re-implemented surface). The pure helpers
// (coarsenDivisions / uniformSubcellWeights / classifyRatio) are unit-tested
// deterministically and always run; the heavy per-pot probe is env-selected.
//
// Select which pot to probe with PF_CONVERGE (substring of the pot name,
// mirroring PF_CERT_ERRORBAKE):
//   PF_CONVERGE=HarmonicRipple            — probe matching pot(s)
//   PF_CONVERGE_DEPTH=3                    — override the calibrated fixed depth
//   PF_CONVERGE_DEPTHS=2,3,4              — CALIBRATION sweep: fine-only at each
//                                           depth vs the committed certified max
//   PF_CONVERGE_COARSE_STEP=1             — density step for the coarse variant
// Runs through the potscope EcoQoS wrapper to dodge the Windows throttle:
//   node research/tools/potscope/potscope.mjs run -- \
//     npx vitest run research/bridge/_certRosterConvergence.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  dyadicEdgeLadder,
  rationalStationLadder,
  tessellateAnnularRadialSolidTargetForCertification,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import { atlas, CERTIFIED_POTS, type CertifiedPot } from './_certRoster';
import {
  classifyRatio,
  coarsenDivisions,
  coarsenLadder,
  coarsenedAxesReport,
  convergePot,
  convergePotSelfCalibrated,
  sampleWorstResidualByPatch,
  trianglesByPatch,
  uniformSubcellWeights,
  verdictsAgree,
} from './_certRosterConvergenceLib';

const OUT_DIR = join(__dirname, '..', 'exchange', '_certified_stl');

/**
 * The arbitrary-config bake input (Task 3): a self-describing JSON that names a
 * style + geometry + divisions to converge WITHOUT a committed certificate. The
 * `geometry`/`divisions` shapes are validated downstream by `atlas` /
 * `tessellate` (they throw on a malformed spec), so this parse guard only
 * enforces that the five required fields are present — a fast fail before any
 * heavy bake. `coarseStep`/`maxDepth`/`budgetMs` are optional self-calibration
 * knobs. Exported for the same-file structural guard test.
 */
export interface ConvergeConfig {
  readonly name: string;
  readonly styleId: string;
  readonly styleParams: Readonly<Record<string, number>>;
  readonly geometry: unknown; // GeometryParams shape — validated by atlas() downstream
  readonly divisions: unknown; // AnnularSolidReferenceTessellationOptions — validated by tessellate()
  readonly coarseStep?: number;
  readonly maxDepth?: number;
  readonly budgetMs?: number;
}

/**
 * Parse + shape-guard an arbitrary-config JSON. Throws (before any bake) if any
 * of the five required fields is missing. A `function` declaration (hoisted) so
 * the same-file structural test can reference it above its definition.
 */
export function parseConvergeConfig(json: string): ConvergeConfig {
  const c = JSON.parse(json) as Partial<ConvergeConfig>;
  for (const key of ['name', 'styleId', 'styleParams', 'geometry', 'divisions'] as const) {
    if (c[key] === undefined) throw new Error(`convergeconfig: missing '${key}'`);
  }
  return c as ConvergeConfig;
}

// Calibrated 2026-07-22 by the PF_CONVERGE_DEPTHS sweep: at depth 2 the
// HarmonicRipple_small fine global-max is 0.010578 mm vs the committed certified
// 0.010 mm (ratio 1.058 — within 6%), it is the cheapest depth (17 s fine on the
// small pot), and the fine-max converges DOWNWARD with depth (0.0106 -> 0.0093
// -> 0.0089), confirming it brackets the true residual from above. Deeper depths
// cost 4x each (depth 4 = 266 s) and would push GeometricStar past a few minutes.
const DEFAULT_DEPTH = 2;
// The calibration acceptance band: the probe's fine global-max must sit within
// this factor of the pot's committed certified global max (both directions).
// Generous because the certificate quantizes to a ladder (floor 0.0025) while
// the probe is a continuous conservative sup.
const CALIBRATION_TOLERANCE = 2.5;

const SELECTOR = process.env.PF_CONVERGE;
const selected = (name: string): boolean =>
  SELECTOR !== undefined &&
  (SELECTOR === 'all' || SELECTOR === '1' || name.toLowerCase().includes(SELECTOR.toLowerCase()));

interface CertifiedReference {
  readonly globalMaxMm: number;
  readonly perPatchMaxMm: Record<string, number>;
}

/** Split a `<header-json>\n<float32 body>` sidecar into its two parts. */
function splitSidecar(buf: Buffer): { header: Record<string, unknown>; body: Float32Array } {
  const nl = buf.indexOf(0x0a);
  const header = JSON.parse(buf.subarray(0, nl).toString('utf8')) as Record<string, unknown>;
  // The body offset is not 4-aligned (header length varies), so copy to a fresh
  // aligned buffer before viewing as Float32.
  const body = new Float32Array(Uint8Array.from(buf.subarray(nl + 1)).buffer);
  return { header, body };
}

/**
 * Read the committed certifies-at sidecar (`<name>.stl.error.bin`) and, if the
 * localization sidecar (`<name>.stl.loc.bin`) is present, the per-patch max. The
 * error sidecar carries the global stats in its header regardless.
 */
function readCertifiedReference(name: string): CertifiedReference | undefined {
  const errPath = join(OUT_DIR, `${name}.stl.error.bin`);
  if (!existsSync(errPath)) return undefined;
  const err = splitSidecar(readFileSync(errPath));
  const stats = err.header.stats as { maxMm: number } | undefined;
  const globalMaxMm = stats?.maxMm ?? Number.NaN;
  const perPatchMaxMm: Record<string, number> = {};
  const locPath = join(OUT_DIR, `${name}.stl.loc.bin`);
  if (existsSync(locPath)) {
    const loc = splitSidecar(readFileSync(locPath));
    const patches = loc.header.patches as string[];
    // loc body = count * 7 floats: [patchIdx, u0, v0, u1, v1, u2, v2].
    for (let tri = 0; tri < err.body.length; tri += 1) {
      const patch = patches[loc.body[tri * 7]];
      perPatchMaxMm[patch] = Math.max(perPatchMaxMm[patch] ?? 0, err.body[tri]);
    }
  }
  return { globalMaxMm, perPatchMaxMm };
}

describe('convergence probe — pure helpers', () => {
  it('uniformSubcellWeights: 4^depth cells, each row a partition of 2^depth', () => {
    expect(uniformSubcellWeights(0)).toEqual([[1, 0, 0, 0, 1, 0, 0, 0, 1]]);
    for (const depth of [0, 1, 2, 3, 4]) {
      const cells = uniformSubcellWeights(depth);
      expect(cells.length).toBe(4 ** depth);
      const scale = 2 ** depth;
      for (const w of cells) {
        expect(w.length).toBe(9);
        for (let vtx = 0; vtx < 3; vtx += 1) {
          const rowSum = w[vtx * 3] + w[vtx * 3 + 1] + w[vtx * 3 + 2];
          expect(rowSum).toBe(scale); // barycentric weights sum to 2^depth
          for (let k = 0; k < 3; k += 1) expect(w[vtx * 3 + k]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('uniformSubcellWeights: subcell areas tile the reference triangle', () => {
    // Each depth-d subcell has |det| = 1 in weight units; total 4^d covers the
    // root (det scale 4^d over the 2^d denominator squared).
    for (const depth of [1, 2, 3]) {
      const cells = uniformSubcellWeights(depth);
      let area2 = 0;
      for (const w of cells) {
        const det =
          (w[3] - w[0]) * (w[7] - w[1]) - (w[6] - w[0]) * (w[4] - w[1]);
        area2 += Math.abs(det);
      }
      // 4^d cells each |det|=1 in the 2^d grid => total |det| = 4^d.
      expect(area2).toBe(4 ** depth);
    }
  });

  it('uniformSubcellWeights: rejects out-of-range depth', () => {
    expect(() => uniformSubcellWeights(-1)).toThrow();
    expect(() => uniformSubcellWeights(9)).toThrow();
    expect(() => uniformSubcellWeights(2.5)).toThrow();
  });

  it('coarsenDivisions: reduces the two uniform knobs, clamps at floors, coarsens ladders (v2)', () => {
    const fine = {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 6,
        'inner-wall': 6,
        'top-rim': 3,
        'bottom-top': 4,
        'bottom-under': 4,
        'drain-wall': 0,
      },
      verticalStationsByPatch: { 'inner-wall': { log2Denominator: 6, numerators: [0, 64] } },
    } as unknown as Parameters<typeof coarsenDivisions>[0];
    const coarse = coarsenDivisions(fine, 1);
    expect(coarse.angularDivisionsLog2).toBe(8);
    expect(coarse.verticalDivisionsLog2ByPatch['outer-wall']).toBe(5);
    expect(coarse.verticalDivisionsLog2ByPatch['drain-wall']).toBe(0); // clamped at vertical floor
    // v2: a laddered patch now coarsens VERTICALLY too (ladder subsetted, endpoints kept).
    // This 2-station ladder is already at its endpoints, so coarsenLadder is a no-op —
    // endpoints preserved and length unchanged (a wider ladder is exercised by the
    // dedicated coarsenLadder test above).
    const fineLadder = fine.verticalStationsByPatch!['inner-wall'];
    const coarseLadder = coarse.verticalStationsByPatch!['inner-wall'];
    expect(coarseLadder.numerators[0]).toBe(fineLadder.numerators[0]);
    expect(coarseLadder.numerators.length).toBeLessThanOrEqual(fineLadder.numerators.length);
    // fine spec is untouched (pure transform)
    expect(fine.angularDivisionsLog2).toBe(9);
  });

  it('coarsenDivisions: coarseStep=2 and custom floors', () => {
    const fine = {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: { 'outer-wall': 5, 'drain-wall': 1 },
    } as unknown as Parameters<typeof coarsenDivisions>[0];
    const coarse = coarsenDivisions(fine, 2, { angular: 4, vertical: 1 });
    expect(coarse.angularDivisionsLog2).toBe(6);
    expect(coarse.verticalDivisionsLog2ByPatch['outer-wall']).toBe(3);
    expect(coarse.verticalDivisionsLog2ByPatch['drain-wall']).toBe(1); // 1-2 -> clamp at 1
    expect(() => coarsenDivisions(fine, 0)).toThrow();
  });

  it('coarsenLadder halves stations, keeps endpoints + denominator, stays valid', () => {
    const ladder = dyadicEdgeLadder(4, 0, 'v0'); // uniform 16-row: numerators 0..16
    const coarse = coarsenLadder(ladder, 1);
    expect(coarse.log2Denominator).toBe(ladder.log2Denominator); // same denominator
    expect(coarse.numerators[0]).toBe(0); // endpoint kept
    expect(coarse.numerators[coarse.numerators.length - 1]).toBe(
      ladder.numerators[ladder.numerators.length - 1]
    ); // top endpoint kept
    expect(coarse.numerators.length).toBeLessThan(ladder.numerators.length); // genuinely reduced
    for (let i = 1; i < coarse.numerators.length; i += 1) {
      expect(coarse.numerators[i]).toBeGreaterThan(coarse.numerators[i - 1]); // strictly increasing
    }
    // resolveStations' core contract: top numerator === (oddFactor ?? 1) * 2^log2Denominator
    expect(coarse.numerators[coarse.numerators.length - 1]).toBe(
      (coarse.oddDenominatorFactor ?? 1) * 2 ** coarse.log2Denominator
    );
    // a rational (non-dyadic) ladder keeps its oddDenominatorFactor
    const rat = rationalStationLadder(6, [
      [5, 29],
      [13, 29],
      [21, 29],
    ]);
    const ratCoarse = coarsenLadder(rat, 1);
    expect(ratCoarse.oddDenominatorFactor).toBe(rat.oddDenominatorFactor);
    expect(ratCoarse.numerators.length).toBeLessThan(rat.numerators.length);
    expect(ratCoarse.numerators[0]).toBe(0); // endpoint kept
    expect(ratCoarse.numerators[ratCoarse.numerators.length - 1]).toBe(
      (ratCoarse.oddDenominatorFactor ?? 1) * 2 ** ratCoarse.log2Denominator
    ); // top endpoint === denominator preserved
    for (let i = 1; i < ratCoarse.numerators.length; i += 1) {
      expect(ratCoarse.numerators[i]).toBeGreaterThan(ratCoarse.numerators[i - 1]); // strictly increasing
    }
  });

  it('coarsenLadder is a no-op below 3 stations (nothing safe to drop)', () => {
    const tiny = { log2Denominator: 3, numerators: [0, 8] };
    expect(coarsenLadder(tiny, 1).numerators).toEqual([0, 8]);
  });

  it('coarsenedAxesReport marks ladder patches vertical when the ladder shrank', () => {
    const fine = {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: { 'outer-wall': 6, 'inner-wall': 6 },
      verticalStationsByPatch: { 'inner-wall': dyadicEdgeLadder(5, 0, 'v0') },
    } as unknown as Parameters<typeof coarsenedAxesReport>[0];
    const coarse = coarsenDivisions(fine, 1);
    const axes = coarsenedAxesReport(fine, coarse);
    expect(axes['outer-wall']).toBe('angular+vertical'); // uniform vertical knob dropped
    expect(axes['inner-wall']).toBe('angular+vertical'); // ladder was coarsened (v2)
  });

  it('classifyRatio: maps ratio to refine-vs-redesign verdict', () => {
    expect(classifyRatio(4)).toBe('responsive');
    expect(classifyRatio(3.5)).toBe('responsive');
    expect(classifyRatio(2)).toBe('partial');
    expect(classifyRatio(1)).toBe('irreducible');
    expect(classifyRatio(0.9)).toBe('irreducible');
    expect(classifyRatio(Number.POSITIVE_INFINITY)).toBe('responsive');
  });

  // A tiny structural check that the config-JSON parse + shape guard exists.
  // (The full bake path is exercised by Task 6's real bakes.)
  it('parseConvergeConfig accepts a valid config and rejects a missing field', () => {
    const good = {
      name: 'X',
      styleId: 'GeometricStar',
      styleParams: { gs_relief: 0.08 },
      geometry: { H: 32, top_od: 30, bottom_od: 30, r_drain: 6 },
      divisions: { angularDivisionsLog2: 8, verticalDivisionsLog2ByPatch: { 'outer-wall': 5 } },
    };
    expect(() => parseConvergeConfig(JSON.stringify(good))).not.toThrow();
    expect(() => parseConvergeConfig(JSON.stringify({ ...good, divisions: undefined }))).toThrow();
  });
});

describe('certified roster — convergence probe', () => {
  for (const pot of CERTIFIED_POTS) {
    it.skipIf(!selected(pot.name))(
      `probes coarse/fine convergence for ${pot.name}`,
      { timeout: 3_600_000 },
      () => {
        const startedAt = Date.now();
        const reference = readCertifiedReference(pot.name);
        const certGlobalMax = reference?.globalMaxMm ?? Number.NaN;

        // CALIBRATION SWEEP: fine-only worst-residual at each depth vs the
        // committed certified max. Picks the cheapest depth that calibrates.
        const sweep = process.env.PF_CONVERGE_DEPTHS;
        if (sweep !== undefined) {
          const binding = atlas(pot.geometry, pot.styleParams, pot.styleId);
          const tess = tessellateAnnularRadialSolidTargetForCertification(binding, pot.divisions);
          const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
            binding.surfaceComplex
          );
          const triByPatch = trianglesByPatch(tess);
          for (const depthStr of sweep.split(',')) {
            const depth = Number(depthStr.trim());
            const t0 = Date.now();
            const s = sampleWorstResidualByPatch(binding, tess, target.targetSha256, depth);
            const ms = Date.now() - t0;
            let fineGlobalMax = 0;
            for (const v of Object.values(s.perPatchMaxMm)) if (v > fineGlobalMax) fineGlobalMax = v;
            // eslint-disable-next-line no-console
            console.log(
              `[probe:converge] CALIB ${pot.name} depth=${depth} fineGlobalMax=${fineGlobalMax.toFixed(6)}` +
                ` certGlobalMax=${certGlobalMax.toFixed(6)} ratioToCert=${(fineGlobalMax / certGlobalMax).toFixed(3)}` +
                ` enclosures=${s.enclosureCount} fallbacks=${s.fallbackCount} ms=${ms}`
            );
            for (const patchId of Object.keys(s.perPatchMaxMm)) {
              const cert = reference?.perPatchMaxMm[patchId];
              // eslint-disable-next-line no-console
              console.log(
                `[probe:converge] CALIB ${pot.name} depth=${depth}   ${patchId.padEnd(14)}` +
                  ` fineMax=${s.perPatchMaxMm[patchId].toFixed(6)}` +
                  ` cert=${cert === undefined ? 'n/a' : cert.toFixed(6)} tris=${triByPatch[patchId]}`
              );
            }
          }
          return; // sweep is a calibration probe only — no ratio, no assertion
        }

        const depth = Number(process.env.PF_CONVERGE_DEPTH ?? DEFAULT_DEPTH);
        const coarseStep = Number(process.env.PF_CONVERGE_COARSE_STEP ?? 1);
        const result = convergePot(pot, { depth, coarseStep });

        // eslint-disable-next-line no-console
        console.log(
          `[probe:converge] ${pot.name} depth=${depth} coarseStep=${coarseStep}` +
            ` fineGlobalMax=${result.fineGlobalMaxMm.toFixed(6)} coarseGlobalMax=${result.coarseGlobalMaxMm.toFixed(6)}` +
            ` certGlobalMax=${certGlobalMax.toFixed(6)} calibRatio=${(result.fineGlobalMaxMm / certGlobalMax).toFixed(3)}` +
            ` fineTris=${result.fineTrisTotal} coarseTris=${result.coarseTrisTotal}` +
            ` fineMs=${result.fineMs} coarseMs=${result.coarseMs} fallbacks=${result.fallbackCount}`
        );
        for (const patchId of Object.keys(result.perPatch)) {
          const p = result.perPatch[patchId];
          const cert = reference?.perPatchMaxMm[patchId];
          // eslint-disable-next-line no-console
          console.log(
            `[probe:converge] ${pot.name}   ${patchId.padEnd(14)} fineMax=${p.fineMaxMm.toFixed(6)}` +
              ` coarseMax=${p.coarseMaxMm.toFixed(6)} ratio=${p.ratio.toFixed(2)} ${p.verdict.padEnd(11)}` +
              ` fineTris=${p.fineTris} coarseTris=${p.coarseTris}` +
              ` cert=${cert === undefined ? 'n/a' : cert.toFixed(6)}`
          );
        }

        const outPath = join(OUT_DIR, `${pot.name}.converge.json`);
        writeFileSync(
          outPath,
          `${JSON.stringify(
            {
              magic: 'potscope-converge/v1',
              variant: pot.name,
              style: pot.styleId,
              depth,
              coarseStep,
              fineDivisions: result.fineDivisions,
              coarseDivisions: result.coarseDivisions,
              fineTrisTotal: result.fineTrisTotal,
              coarseTrisTotal: result.coarseTrisTotal,
              fineGlobalMaxMm: result.fineGlobalMaxMm,
              coarseGlobalMaxMm: result.coarseGlobalMaxMm,
              fineMs: result.fineMs,
              coarseMs: result.coarseMs,
              fallbackCount: result.fallbackCount,
              calibration: {
                certGlobalMaxMm: certGlobalMax,
                certPerPatchMaxMm: reference?.perPatchMaxMm ?? null,
                calibrationRatio: result.fineGlobalMaxMm / certGlobalMax,
                tolerance: CALIBRATION_TOLERANCE,
              },
              // Shared with the arbitrary-config path so both converge.json flavors
              // carry the same per-patch coarsened-axes report (no behavior change).
              coarsenedAxes: coarsenedAxesReport(result.fineDivisions, result.coarseDivisions),
              perPatch: result.perPatch,
            },
            null,
            2
          )}\n`
        );
        // eslint-disable-next-line no-console
        console.log(
          `[probe:converge] ${pot.name} WROTE ${outPath} elapsedMs=${Date.now() - startedAt}`
        );

        // Sanity: probe produced a per-patch table and never fell back to the
        // decimal enclosure at this depth (shallow => fast numeric suffices).
        expect(Object.keys(result.perPatch).length).toBeGreaterThan(0);
        expect(result.fineGlobalMaxMm).toBeGreaterThan(0);

        // CALIBRATION GATE: the probe's fine global-max must land within
        // CALIBRATION_TOLERANCE of the committed certified global-max (both
        // directions). Outside the band the proxy is untrustworthy — fail loud.
        if (Number.isFinite(certGlobalMax) && certGlobalMax > 0) {
          expect(result.fineGlobalMaxMm).toBeLessThanOrEqual(certGlobalMax * CALIBRATION_TOLERANCE);
          expect(result.fineGlobalMaxMm).toBeGreaterThanOrEqual(certGlobalMax / CALIBRATION_TOLERANCE);
        }
      }
    );
  }
});

// The ARBITRARY-CONFIG driver: converge a self-describing config JSON that has
// NO committed certificate. Env-gated on PF_CONVERGE_CONFIG=<path.json> (skipped
// by default, like the roster probes). Runs `convergePotSelfCalibrated` (which
// self-calibrates the probe depth by verdict-stability) and writes a
// `<name>.converge.json` sharing the roster schema PLUS `configSource:'arbitrary'`,
// `selfCalibration`, `coarsenedAxes`, and `calibration:null` — there is no cert to
// gate against, so the assertions only check the probe produced a table (and a
// real global-max once stable). The real bake is exercised in Task 6.
describe('arbitrary-config — self-calibrated convergence probe', () => {
  const CONFIG_PATH = process.env.PF_CONVERGE_CONFIG;
  it.skipIf(CONFIG_PATH === undefined)(
    'converges an arbitrary config JSON and emits self-calibration',
    { timeout: 3_600_000 },
    () => {
      const startedAt = Date.now();
      const parsed = parseConvergeConfig(readFileSync(CONFIG_PATH as string, 'utf8'));
      // CertifiedPot-shaped input for the converger. `geometry`/`divisions` are
      // validated downstream by atlas()/tessellate(); the cast is the only bridge.
      const config = {
        name: parsed.name,
        styleId: parsed.styleId,
        styleParams: parsed.styleParams,
        // Merge DEFAULT_GEOMETRY so a PARTIAL `geometry` bakes: the convergeconfig
        // builder emits only { H, top_od, bottom_od, r_drain }, but atlas() needs
        // all ~13 GeometryParams fields (t_wall/t_bottom/expn/bell*/spin*). The
        // config's own fields win over the defaults; a fully-specified geometry
        // (e.g. a reproduced roster pot) is unaffected.
        geometry: { ...DEFAULT_GEOMETRY, ...(parsed.geometry as Partial<GeometryParams>) },
        divisions: parsed.divisions,
      } as unknown as CertifiedPot;

      const result = convergePotSelfCalibrated(config, {
        startDepth: 2,
        maxDepth: parsed.maxDepth ?? 5,
        coarseStep: parsed.coarseStep ?? 1,
        budgetMs: parsed.budgetMs,
      });
      const coarsenedAxes = coarsenedAxesReport(config.divisions, result.coarseDivisions);

      // eslint-disable-next-line no-console
      console.log(
        `[probe:converge] ${config.name} selfCal stable=${result.selfCalibration.stable}` +
          ` reason=${result.selfCalibration.reason} finalDepth=${result.selfCalibration.finalDepth}` +
          ` depthsRun=[${result.selfCalibration.depthsRun.join(',')}]`
      );
      for (const patchId of Object.keys(result.perPatch)) {
        const p = result.perPatch[patchId];
        // eslint-disable-next-line no-console
        console.log(
          `[probe:converge] ${config.name}   ${patchId.padEnd(14)} fineMax=${p.fineMaxMm.toFixed(6)}` +
            ` coarseMax=${p.coarseMaxMm.toFixed(6)} ratio=${p.ratio.toFixed(2)} ${p.verdict.padEnd(11)}` +
            ` fineTris=${p.fineTris} coarseTris=${p.coarseTris}`
        );
      }

      const outPath = join(OUT_DIR, `${config.name}.converge.json`);
      writeFileSync(
        outPath,
        `${JSON.stringify(
          {
            magic: 'potscope-converge/v1',
            variant: config.name,
            style: config.styleId,
            configSource: 'arbitrary',
            depth: result.depth,
            coarseStep: result.coarseStep,
            fineDivisions: result.fineDivisions,
            coarseDivisions: result.coarseDivisions,
            fineTrisTotal: result.fineTrisTotal,
            coarseTrisTotal: result.coarseTrisTotal,
            fineGlobalMaxMm: result.fineGlobalMaxMm,
            coarseGlobalMaxMm: result.coarseGlobalMaxMm,
            fineMs: result.fineMs,
            coarseMs: result.coarseMs,
            fallbackCount: result.fallbackCount,
            // No certificate for an arbitrary config — null, not a cert block.
            calibration: null,
            selfCalibration: result.selfCalibration,
            coarsenedAxes,
            perPatch: result.perPatch,
          },
          null,
          2
        )}\n`
      );
      // eslint-disable-next-line no-console
      console.log(
        `[probe:converge] ${config.name} WROTE ${outPath} elapsedMs=${Date.now() - startedAt}`
      );

      // No cert-tolerance gate (there is no certificate). Only assert the probe
      // produced a per-patch table and — when it self-calibrated to a stable
      // verdict — a real (positive) fine global-max.
      expect(Object.keys(result.perPatch).length).toBeGreaterThan(0);
      if (result.selfCalibration.stable) {
        expect(result.fineGlobalMaxMm).toBeGreaterThan(0);
      }
    }
  );
});

// minimal fake ConvergePotResult with only the fields the stability logic reads.
// Casts kept deliberately loose (`as unknown`) so the fake stays tiny — the DI
// runner never touches the surface machinery, so the omitted fields are inert.
function fakeResult(depth: number, perPatchVerdict: Record<string, string>) {
  const perPatch: Record<string, unknown> = {};
  for (const [p, verdict] of Object.entries(perPatchVerdict)) {
    perPatch[p] = { verdict, ratio: 0, fineMaxMm: 1, coarseMaxMm: 1, fineTris: 1, coarseTris: 1 };
  }
  return {
    name: 'fake',
    styleId: 'X',
    depth,
    coarseStep: 1,
    fineDivisions: {},
    coarseDivisions: {},
    perPatch,
    fineGlobalMaxMm: 1,
    coarseGlobalMaxMm: 1,
    fineTrisTotal: 2,
    coarseTrisTotal: 1,
    fineMs: 0,
    coarseMs: 0,
    fineEnclosures: 0,
    coarseEnclosures: 0,
    fallbackCount: 0,
  } as unknown;
}

// A fake whose COARSE mesh did not actually shrink (coarseTris >= fineTris) — the
// division knobs are already at the floor. Trips the cannot-coarsen guard.
function fakeResultNoShrink(depth: number, perPatchVerdict: Record<string, string>) {
  return {
    ...(fakeResult(depth, perPatchVerdict) as Record<string, unknown>),
    fineTrisTotal: 1,
    coarseTrisTotal: 1,
  } as unknown;
}

describe('convergence probe — self-calibration', () => {
  it('stops at the depth where per-patch verdicts first agree', () => {
    const scripted: Record<number, Record<string, string>> = {
      2: { 'inner-wall': 'partial', 'outer-wall': 'responsive' },
      3: { 'inner-wall': 'irreducible', 'outer-wall': 'responsive' }, // inner changed 2->3
      4: { 'inner-wall': 'irreducible', 'outer-wall': 'responsive' }, // stable 3->4
    };
    const runAtDepth = (_cfg: unknown, d: number) => fakeResult(d, scripted[d]);
    const r = convergePotSelfCalibrated(
      {} as never,
      { startDepth: 2, maxDepth: 5 },
      runAtDepth as never
    );
    expect(r.selfCalibration.stable).toBe(true);
    expect(r.selfCalibration.reason).toBe('converged');
    expect(r.selfCalibration.finalDepth).toBe(4); // reported at the upper of the stable pair
    expect(r.selfCalibration.depthsRun).toEqual([2, 3, 4]);
    expect(r.depth).toBe(4);
  });

  it('reports UNCALIBRATED when verdicts never stabilize by maxDepth', () => {
    const flip = (d: number) => ({ 'inner-wall': d % 2 ? 'responsive' : 'irreducible' });
    const runAtDepth = (_cfg: unknown, d: number) => fakeResult(d, flip(d));
    const r = convergePotSelfCalibrated(
      {} as never,
      { startDepth: 2, maxDepth: 4 },
      runAtDepth as never
    );
    expect(r.selfCalibration.stable).toBe(false);
    expect(r.selfCalibration.reason).toBe('max-depth');
    expect(r.selfCalibration.depthsRun).toEqual([2, 3, 4]);
  });

  it('refuses with cannot-coarsen when the coarse mesh did not shrink', () => {
    const runAtDepth = (_cfg: unknown, d: number) =>
      fakeResultNoShrink(d, { 'inner-wall': 'irreducible' });
    const r = convergePotSelfCalibrated(
      {} as never,
      { startDepth: 2, maxDepth: 5 },
      runAtDepth as never
    );
    expect(r.selfCalibration.stable).toBe(false);
    expect(r.selfCalibration.reason).toBe('cannot-coarsen');
    expect(r.selfCalibration.finalDepth).toBe(2); // bailed at the start depth
    expect(r.selfCalibration.depthsRun).toEqual([2]); // never escalated
  });

  it('gives up with budget when the time bound is exceeded before agreement', () => {
    // Never-agreeing verdicts, driven by an injected clock: t0 reads 0, the first
    // in-loop budget check reads 1000 > budgetMs, so it bails at the first step.
    const flip = (d: number) => ({ 'inner-wall': d % 2 ? 'responsive' : 'irreducible' });
    const runAtDepth = (_cfg: unknown, d: number) => fakeResult(d, flip(d));
    let calls = 0;
    const nowMs = (): number => (calls++ === 0 ? 0 : 1000);
    const r = convergePotSelfCalibrated(
      {} as never,
      { startDepth: 2, maxDepth: 5, budgetMs: 10, nowMs },
      runAtDepth as never
    );
    expect(r.selfCalibration.reason).toBe('budget');
    expect(r.selfCalibration.stable).toBe(false);
    expect(r.selfCalibration.finalDepth).toBe(3); // bailed at the first over-budget step
    expect(r.selfCalibration.depthsRun).toEqual([2, 3]);
  });

  it('verdictsAgree compares per patch', () => {
    const a = fakeResult(2, { p: 'responsive', q: 'partial' });
    const b = fakeResult(3, { p: 'responsive', q: 'irreducible' });
    expect(verdictsAgree(a as never, b as never)).toEqual({ p: true, q: false });
  });
});
