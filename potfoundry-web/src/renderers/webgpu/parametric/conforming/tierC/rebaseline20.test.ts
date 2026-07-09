import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS } from '../../../../../geometry/styles';
import type { StyleId } from '../../../../../geometry/types';
import { styleSampler } from '../featureGraph/styleSampler';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
} from '../ConformingOuterWall';
import { buildTierCOuterWall, isCountUnstableStyle } from './index';
import { detectFeatures } from '../featureGraph/detectFeatures';
import { TIER_C_DETECT_OPTS } from './detectOpts';
import { hashMesh } from './__testutil';

// ── Task-6 FINAL PRODUCTION RE-BASELINE GATE (env-gated: PF_REBASELINE20=1).
//
// Run: PF_REBASELINE20=1 npx vitest run .../rebaseline20.test.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// ACCEPTANCE = the ACCEPTED TERMINAL SCORECARD, NOT blanket literal-0.
// Source of truth: research/lab/2026-07-09-drive-final-scorecard.md (commit
// 83fe4c36). USER DECISION 2026-07-09: the Tier-2/3 certifications + the Gothic
// PRODUCTION full-relief frontier are ACCEPTED as terminal; this gate runs with
// PER-STYLE acceptance, not the old blanket every-facet-0.
//
// WHAT THIS GATE PROVES (the two ship-safety properties that are TRACTABLE in
// a single-thread test — the fidelity verdict for the 2 count-unstable styles
// is proven at PATCH scale in wholeMesh0Outlier.test.ts, NOT here):
//
//   (a) BYTE-IDENTICAL FALLBACK for the 18 count-STABLE styles. With the
//       __pfPerfectMesher flag ON, `buildTierCOuterWall` output === the flag-OFF
//       `buildConformingOuterWall` output for every count-stable style. This is
//       the zero-regression guarantee for 18/20: because the output is byte-for-
//       byte identical, their banked scorecard verdicts (Tier-1 literal-0,
//       Tier-2 designed-edge certifications, Tier-3 measured-exclude floors) are
//       PRESERVED unchanged — production never touches them, so no silent
//       regression below their banked figure is even POSSIBLE.
//
//   (b) TIER-C DISPATCH for the 2 count-UNSTABLE styles (GothicArches,
//       GeometricStar). We verify the dispatch predicate (isCountUnstableStyle
//       on the production feature graph) selects the Tier-C path for exactly
//       these two, so flag-ON DOES route them to the perfect-mesher closer.
//       Their FIDELITY verdict is DELEGATED to wholeMesh0Outlier.test.ts:
//         • GeometricStar → LITERAL whole-mesh 0 at patch scale (the finite-
//           width chevron rides flat-P1 to <tol; MEASURED 0 outliers, max 0.01,
//           watertight, on the interior band). The full-relief band's residual
//           is a benign LOW-gradU domain-boundary-clip artifact at p99 0.009 <
//           tol (E-2026-07-09-REBASELINE20 §V12), the accepted Gothic-frontier
//           PATTERN — not a new mechanism.
//         • GothicArches → the ACCEPTED PRODUCTION FRONTIER (§V11v/y: full-
//           relief multi-bay band worst 0.117 / p99 0.00907 < tol / ~140 near-
//           vertical-flank facets / 5.0M — no kernel closes it under 10M;
//           literal-0 proven only at the smoke/patch scale).
//       We do NOT run the full-pot Tier-C EMISSION for these two here: it is
//       documented INTEGRATION scope (cdt2d over [0,1] does not share seam
//       vertex indices — conforming/tierC/index.ts) and, measured, a multi-DAY
//       single-thread grind (the patch at 2% wall area is ~6 min; full-pot is
//       ~50× the facets and superlinear in the whole-mesh brute scorer). A
//       full-pot literal-0 assertion is unreachable AND intractable — asserting
//       it would hang the gate. The patch gate is the honest fidelity evidence.
//
// PER-STYLE ACCEPTANCE (from the scorecard — the 20 styles' terminal verdicts):
//   Tier-1 (12): SuperellipseMorph, SpiralRidges, ArtDeco, BambooSegments,
//     WaveInterference, FourierBloom, RippleInterference, HarmonicRipple,
//     HexagonalHive, GyroidManifold → count-STABLE → (a) byte-identical.
//     GothicArches, GeometricStar → count-UNSTABLE → (b) dispatch + patch-scale
//     fidelity (delegated).
//   Tier-2 CERTIFIED (4): LowPolyFacet, SuperformulaBlossom, Crystalline,
//     DragonScales → count-STABLE → (a) byte-identical (designed-feature-edge
//     certifications preserved).
//   Tier-3 MEASURED-EXCLUDE (4): Voronoi, BasketWeave, CelticKnot,
//     CelticTriquetra → count-STABLE → (a) byte-identical (free-adaptive
//     honest floors preserved).
//
// The flag stays default-OFF: this test is the EVIDENCE the flip decision
// reads, it does NOT flip the flag.
// ═══════════════════════════════════════════════════════════════════════════
const GATE = process.env.PF_REBASELINE20 === '1';
const GATE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const DIMS = { H: 120, Rt: 50, Rb: 40 };
const OPTS: ConformingOuterWallOptions = {
  maxSagMm: 0.05,
  maxEdgeMm: 60,
  minEdgeMm: 0.5,
  gradeRatio: 2,
  maxLevel: 8,
  resU: 65,
  resT: 17,
};

// The two count-unstable styles (birth/merge feature networks) — the scorecard
// Tier-1 patch-scale entries. Every OTHER style is count-stable ⇒ byte-identical
// fallback. This list is ASSERTED to match the dispatch predicate below (no
// hard-coded per-style routing in production — the predicate is graph-driven).
const EXPECT_COUNT_UNSTABLE: readonly StyleId[] = [
  'GothicArches',
  'GeometricStar',
];

function setFlag(on: boolean): void {
  (
    globalThis as unknown as { __pfPerfectMesher?: boolean }
  ).__pfPerfectMesher = on;
}

describe.skipIf(!GATE)('Tier-C 20-style whole-mesh re-baseline gate', () => {
  const styleIds = Object.keys(STYLE_FUNCTIONS) as StyleId[];

  it(
    'flag-ON: 18 count-stable byte-identical fallback; 2 count-unstable dispatched to Tier-C',
    () => {
      const report: Record<string, unknown>[] = [];
      const dispatchedUnstable: StyleId[] = [];
      for (const styleId of styleIds) {
        const sampler = styleSampler(styleId, {}, DIMS);

        // Dispatch predicate (graph-driven, the production routing signal).
        const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
        const unstable = isCountUnstableStyle('', graph);
        if (unstable) dispatchedUnstable.push(styleId);

        if (!unstable) {
          // (a) count-STABLE: flag-ON MUST fall back byte-identical.
          setFlag(false);
          const off = buildConformingOuterWall(sampler, OPTS);
          setFlag(true);
          const on = buildTierCOuterWall(sampler, OPTS);
          setFlag(false);
          const byteIdentical = hashMesh(on) === hashMesh(off);
          expect(byteIdentical, `${styleId} flag-on must fall back`).toBe(true);
          report.push({ styleId, class: 'count-stable', byteIdentical: true });
        } else {
          // (b) count-UNSTABLE: dispatched to Tier-C. Fidelity is delegated to
          // wholeMesh0Outlier.test.ts (patch scale — full-pot emission is
          // integration scope + intractable single-thread; see the header).
          report.push({
            styleId,
            class: 'count-unstable (Tier-C dispatched)',
            fidelityGate: 'wholeMesh0Outlier.test.ts (patch scale)',
          });
        }
        // eslint-disable-next-line no-console
        console.log(
          `[rebaseline20] ${JSON.stringify(report[report.length - 1])}`,
        );
      }

      // The dispatch predicate must select EXACTLY the two count-unstable
      // scorecard styles — nothing more (no Tier-A/B style accidentally routed
      // to Tier-C), nothing less (both count-unstable styles ARE routed).
      expect(
        [...dispatchedUnstable].sort(),
        'dispatch must select exactly the 2 count-unstable styles',
      ).toEqual([...EXPECT_COUNT_UNSTABLE].sort());

      // eslint-disable-next-line no-console
      console.log(
        `[rebaseline20 FINAL] countUnstable=${JSON.stringify(dispatchedUnstable)} ${JSON.stringify(report)}`,
      );
      expect(report.length).toBe(styleIds.length);
    },
    GATE_TIMEOUT_MS,
  );
});
