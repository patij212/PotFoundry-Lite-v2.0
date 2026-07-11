# Arm B1 Verdict — DragonScales full wall: NOT-REPRODUCED (config-explained), chain mechanism works

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm B1. **Verdict: NOT REPRODUCED (T1∧T4∧T5 fails),
but the R-STRUCT/R-CDT chain MECHANISM works** — the failures are configuration-explained + three
named, actionable defects. Raw data (gitignored): `research/exchange/_tierc_b1/`. Probes:
`_tierc_armB1.test.ts`, `_tierc_b1_lib.ts` (corrected-domain A/B helper), `_tierc_b1_quality_quick.test.ts`.

## Chain mechanism: WORKS (first end-to-end build of the N>2 R-STRUCT/R-CDT path)

`buildRegionOuterWall(getManifest('DragonScales'), dims)` fired native `dispatch:'RSTRUCT-RCDT-chain'`
(previously only arg-shape-guarded) — no throw, 1,089,632 outer tris (8 body regions + 7 ring bands ×
44,224) in 5.1s. The chain generalizes B0's proven contract to 15 regions.

## Finding 1 — manifest domain-overlap bug (FIX PROVEN)

`tierc_manifest.ts` `dragonScalesAnatomy` gives R-CDT body regions z-boundaries **exactly at** each
ring z, while R-STRUCT ring regions span `[ringZ−0.6, ringZ+0.6]` — an unintended 0.6mm overlap at
all 7 seams (B0's toy used disjoint bands). Not a crash, but a measured defect: `topologyMetric`
native `nonManifoldEdges=3584` (=7×512, one coincident double-loop per ring — adjacent K1 regions
terminate at the same z with the same uniform 512-θ ring). A corrected non-overlapping build
(`buildDsChainCorrected`) drives it to `nonManifoldEdges=0`. **Fix: body-region z-boundaries stop at
`ringZ ∓ DS_RING_HALF_BAND_MM`.** (Applied by the coordinator with this commit's follow-up.)

## Finding 2 — per-seam winding defect (B0's gates couldn't see it; THIRD recurrence of the pattern)

The corrected (non-overlapping) config trades the coincident loop for `orientationMismatches=7168`
(=7×2×512, both seams of every ring) — a winding-consistency defect at the R-STRUCT↔R-CDT adoption
boundary. **B0's 3-gate battery (raw-index nonMan + T-junction + serration) never checked winding**,
so it passed B0 while carrying this. Same invisible-to-narrower-gate pattern as Gyroid A1→Addendum 3
and (measured-clean) Gothic C1. Likely a single convention mismatch between `ConformingWall`'s
closing strip and `buildStructuredWall`'s equal-count path — analogous to Gyroid A4-orient. **Not yet
fixed; needs diagnosis.**

## Finding 3 — quality collapse (undiagnosed)

Whole-mesh `%<20° = 73.4% (native) / 73.7% (corrected)`, minAngle 0.9° — 7× over T5's <10% gate,
worse than any prior DS config (champion's worst-degraded lever was 26.3%). Identical in both configs
⇒ NOT the overlap bug. Root cause **not diagnosed (out of budget)** — a named blocker before any
genuine B1 fidelity reading.

## Fidelity: not yet a real DS reading (loose config)

Literal full-population scoring was intractable (~3.6–4.4ms/facet at `K1_TOY_DEFAULTS`' loose 0.05mm
sag; killed past the 25-min ceiling). A bounded 2000-facet/population directional sample (labeled,
NOT an acceptance basis): body ~48–49% over-rate / max 0.10–0.12mm; ring-band 21–30% / max
0.08–0.27mm. **These fail T1/T2/T3 by large margins, but the build used `K1_TOY_DEFAULTS` (loose sag,
NO relief-conforming), not `AF_PROD_OPTS` tight sizing — so they are a loose-config reading, not the
DS champion.** A genuine T1/T2/T3 reading requires re-running with production sizing AFTER Findings
1–3 close.

## T1–T7 (champion-spec §5)

- **T4 (tris + density): PASS** both — 1.09–1.10M ≤ 4,549,600; ring-local density ≈36,853 tris/mm ≪
  production 130–175k/mm (caveat: partly a loose-budget artifact).
- **T1/T2/T3: FAIL** (config-explained — loose sizing, see above).
- **T5: FAIL** — native nonManifoldEdges; corrected orientationMismatches; both %<20°; zeroArea 0
  (pass); serration OPEN. **0 interior boundary holes both** (DS does NOT carry Gyroid's hole defect).
- **T6 rim-attachment: OPEN** (outer-wall-only, no assembly — matches the champion's own never-assembled scope).
- **T7: 5.1s/4.8s** (not comparable to production 131.3s — no relief-conforming, no assembly).

## Actionable path (per the agent's recommendation)

1. Fix `dragonScalesAnatomy` body-region domains (Finding 1 — proven; applied).
2. Diagnose+fix the seam winding-order bug (Finding 2 — likely the ConformingWall/buildStructuredWall
   convention mismatch; kin to Gyroid A4-orient).
3. Diagnose the 73%+ `%<20°` quality collapse (Finding 3) before further B1 fidelity.
4. Re-run B1 fidelity with `AF_PROD_OPTS`-tight sizing for a genuine T1/T2/T3 reading.
