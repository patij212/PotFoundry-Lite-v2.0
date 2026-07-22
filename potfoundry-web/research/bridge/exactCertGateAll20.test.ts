/**
 * exactCertGateAll20.test.ts — the rigorous certification gate extended to ALL 20
 * styles: an honest per-style MATRIX of the interval prover's outer-wall coverage.
 *
 * ENV-GATED (PF_CERT_ALL20=1) — a 20-style sweep of the rigorous prover is minutes,
 * not seconds (the always-on smoke gate stays exactCertGate.test.ts). Each style runs
 * OUTER-WALL-SCOPED at a PER-STYLE resolution: roster styles use their own tuned
 * angular + outer-wall vertical (capped at v5 to bound runtime); non-roster styles use
 * a gentle small-pot default. A style that cannot be proven ≤0.01mm within a small
 * split/depth budget FAILS CLOSED FAST — the honest outcome for high-relief /
 * high-frequency / missing-curtain styles (and for the v6-v7 roster styles the cap
 * under-resolves: they show as not-certified-here but certify at full resolution — the
 * roster-baker's slow sweep). Each row is CHECKPOINTED to
 * research/exchange/_all20CertMatrix.jsonl (vitest buffers a single test's console).
 *
 * Run: PF_CERT_ALL20=1 npx vitest run research/bridge/exactCertGateAll20.test.ts
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import type { StyleId } from '../../src/geometry/types';
import { certifyOuterWallExact } from './exactCertGate';
import { CERTIFIED_POTS } from './_certRoster';

const ALL_STYLES: StyleId[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales',
  'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
] as unknown as StyleId[];

const CAP_ANGULAR = 8; // 256 columns; angular-9 (512) blows up tris + runtime on non-converging styles
const CAP_OUTER_WALL = 5; // bounds runtime; v6-v7 roster styles under-resolve here (honest)
const SMALL: GeometryParams = { ...DEFAULT_GEOMETRY, H: 20, top_od: 30, bottom_od: 30, r_drain: 6 };

/**
 * Styles the rigorous prover cannot certify in BOUNDED time at any useful resolution —
 * a genuine coverage limit, not a config knob. Running them hangs the sweep, so they
 * are SKIPPED (recorded with a reason) and reported as `intractable` in the matrix:
 *  - GothicArches: the zero-width `ridge(sharp)` cusp makes subdivision explode
 *    (measured 3-11 min and still unconverged).
 *  - Voronoi: cellular bisectors force a split at every cell edge (measured >15 min,
 *    non-terminating). The over/under weave/braid family (BasketWeave / CelticKnot /
 *    CelticTriquetra) and HexagonalHive are the same class + also lack per-style
 *    discontinuity CURTAINS in the target registry (Agent G), so they fail-closed by
 *    construction — skipped here to keep the sweep bounded.
 * (Gyroid, by contrast, fail-closes FAST — 37s — so it is NOT skipped.)
 */
const INTRACTABLE: ReadonlySet<string> = new Set([
  'GothicArches', 'Voronoi', 'BasketWeave', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra',
]);

interface Cfg { geometry: GeometryParams; params: Readonly<Record<string, number>>; angularLog2: number; outerWallV: number; }

function configFor(styleId: StyleId): Cfg {
  const pot = CERTIFIED_POTS.find((p) => p.styleId === styleId);
  if (pot) {
    return {
      geometry: pot.geometry,
      params: pot.styleParams,
      angularLog2: Math.min(pot.divisions.angularDivisionsLog2, CAP_ANGULAR),
      outerWallV: Math.min(pot.divisions.verticalDivisionsLog2ByPatch['outer-wall'] ?? 4, CAP_OUTER_WALL),
    };
  }
  return { geometry: SMALL, params: {}, angularLog2: 8, outerWallV: 4 };
}

const OUT = join(__dirname, '..', 'exchange', '_all20CertMatrix.jsonl');

describe('rigorous certification MATRIX — all 20 styles (PF_CERT_ALL20)', () => {
  it.skipIf(process.env.PF_CERT_ALL20 !== '1')(
    'runs the interval prover on every style and reports the honest outer-wall coverage',
    { timeout: 2_400_000 },
    () => {
      mkdirSync(join(__dirname, '..', 'exchange'), { recursive: true });
      writeFileSync(OUT, '');
      const certified: string[] = [];
      let completed = 0;
      for (const styleId of ALL_STYLES) {
        if (INTRACTABLE.has(styleId)) {
          const row = { styleId, certified: false, intractable: true, reason: 'prover non-terminating at useful resolution (cusp / cellular / weave)' };
          appendFileSync(OUT, `${JSON.stringify(row)}\n`);
          completed += 1;
          // eslint-disable-next-line no-console
          console.log(`[all20] ${String(styleId).padEnd(20)} SKIP (intractable for the current prover)`);
          continue;
        }
        const cfg = configFor(styleId);
        const divisions = {
          angularDivisionsLog2: cfg.angularLog2,
          verticalDivisionsLog2ByPatch: {
            'outer-wall': cfg.outerWallV, 'inner-wall': 1, 'top-rim': 1,
            'bottom-top': 1, 'bottom-under': 1, 'drain-wall': 0,
          },
        };
        const t0 = Date.now();
        let row: Record<string, unknown>;
        try {
          const res = certifyOuterWallExact(cfg.geometry, cfg.params, styleId, divisions, {
            // The INTRACTABLE styles are skipped above, so the runnable ones can use a
            // deeper budget: enough for the certifiable gentle styles to converge (they do,
            // shallow), while the non-certifying-but-terminating ones (Gyroid, Crystalline)
            // still fail-closed in tens of seconds.
            tolMm: 0.01, splitBudget: 48, maxDepth: 12, gatePatchIds: ['outer-wall'],
          });
          if (res.certified) certified.push(styleId);
          row = { styleId, certified: res.certified, maxCertMm: res.maxCertifiesAtMm, unconverged: res.unconvergedCount, tris: res.triangleCount, ms: Date.now() - t0 };
        } catch (e) {
          row = { styleId, certified: false, error: e instanceof Error ? e.message.slice(0, 100) : String(e).slice(0, 100), ms: Date.now() - t0 };
        }
        completed += 1;
        appendFileSync(OUT, `${JSON.stringify(row)}\n`);
        // eslint-disable-next-line no-console
        console.log(`[all20] ${String(row.styleId).padEnd(20)} certified=${row.certified} maxCertMm=${row.maxCertMm ?? 'ERR'} unconv=${row.unconverged ?? '-'} tris=${row.tris ?? 0} ms=${row.ms}${row.error ? ' error=' + row.error : ''}`);
      }
      // eslint-disable-next-line no-console
      console.log(`[all20] CERTIFIED ${certified.length}/20: ${certified.join(', ')}`);
      expect(completed).toBe(ALL_STYLES.length);
      // Honest all-20 coverage of the rigorous prover at this bounded config (2026-07-22):
      //   CERTIFIED ≤0.01mm (5): SuperformulaBlossom, SpiralRidges, HarmonicRipple,
      //     SuperellipseMorph, RippleInterference.
      //   UNDER-RESOLVED (converged >0.01mm; certify at finer per-style resolution — the
      //     slow roster-baker sweep): FourierBloom, WaveInterference, GeometricStar, LowPolyFacet.
      //   FAIL-CLOSED (unconverged at this budget): Crystalline, GyroidManifold.
      //   PROVER-REFUSED (atlas "accepts exactly one period"): ArtDeco, DragonScales, BambooSegments.
      //   INTRACTABLE (skipped — prover non-terminating): GothicArches (cusp), Voronoi +
      //     BasketWeave/HexagonalHive/CelticKnot/CelticTriquetra (cellular/weave, missing curtains).
      // ⇒ the rigorous prover covers the SMOOTH/single-valued styles; the high-relief cusp,
      // lattice, and weave families are its genuine frontier (the meshing work, not the ruler).
      // Threshold is below the measured 5 so the gate is a stable regression guard.
      expect(certified.length).toBeGreaterThanOrEqual(3);
    },
  );
});
