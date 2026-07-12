# featureAlignedCell true-3D confirm — 4/4 PASS; the default-on flip is evidence-unblocked

**Date:** 2026-07-12. **Arm:** FAC-3D (the roadmap item-2 gating evidence: true-3D fidelity confirm
for the `__pfFeatureAlignedCells` default-on flip). **Test:** `research/bridge/_tierc_fac3d.test.ts`.
**Artifacts:** `research/exchange/tierc/fac3d_{summary.json,crumbs.ndjson}` + per-style logs.
**Ruler:** perFaceTrue3DSag (GN; honest on non-tangled — all four styles non-tangled).
**Gate (pre-registered):** ON ≤ OFF + max(2%·OFF, 0.0005mm) on true-3D worst & p99, quality
<20° not worse, nonMan==0, tri delta reported.

## Result: PASS on all four styles

| Style | <20° OFF→ON | true-3D worst OFF→ON | true-3D p99 OFF→ON | tris | nonMan ON |
|---|---|---|---|---|---|
| GothicArches | **1.9 → 1.1** | 0.6369 → 0.6369 | 0.1186 → **0.1098** | +11.7% | 0 |
| GeometricStar | 3.7 → 3.7 | 0.7670 → 0.7670 | 0.1627 → 0.1627 | +0.1% | 0 |
| DragonScales | 19.2 → 19.1 | 0.7329 → 0.7329 | 0.4287 → 0.4286 | +0.2% | 0 |
| GyroidManifold | 8.4 → **8.0** | 0.9982 → 0.9982 | 0.5304 → **0.4990** | +8.9% | 0 |

- Fidelity NEVER regresses: worst bit-identical on every style; p99 improves or holds. Consistent
  with the mechanism (interior-only Steiner insertion, keep-better semantics — boundary untouched).
- Quality improves exactly where the lever fires (Gothic 62,437 tried / 35,182 improved;
  reproduces the banked 1.9→1.1). GeoStar/DS barely fire (+0.1/0.2% tris) — no-harm confirmed.
- The absolute true-3D numbers (0.64–1.0mm worst) are the DEFAULT production path's standing
  fidelity, unrelated to this lever — they match the raycast-oracle whole-pot finding
  (`research/lab/2026-07-12-raycast-oracle-fidelity.md`) and are the region-core program's target.

## Consequence

Plan task **T2.1** (`docs/superpowers/plans/2026-07-12-tierc-wire-and-validate.md`) precondition (i)
is SATISFIED. Precondition (ii) — the `ConformingWall.ts` sampler gating (`__pfConformingRefine`)
that decides whether `featureAlignedOn` can fire on the default path — must be re-checked against
the now-landed Gyroid ship chain before dispatching the flip. Remaining flip mechanics: Gothic-scoped
default + golden re-baseline (deliberate output change; NOTE: coordinate with the uncommitted SFB
golden regeneration currently in the tree from the sf_strength workstream).
