# Arm C2 Verdict — Gothic K2 analytic-surface-source fix: PASS (mechanism), full-patch scale deferred

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm C2 (prereg Addendum 6). **First production-kernel
fix of the program.** Verdict: **PASS at mechanism scale** (default-off byte-identical + watertight +
analytic-ruler crest ≤0.01mm, triple-independently); full-9917-facet-patch confirm deferred (priced
out). Raw data (gitignored): `research/exchange/tierc/armC2_*.json`. Probe: `_tierc_armC2.test.ts`.

## The fix (elegant — a surface-source swap, not new meshing logic)

The entire K2 kernel is parametrized over ONE `SurfaceSampler` object; production always passes a
`GpuSurfaceSampler` wrapping a 512² bilinear grid. The fix swaps *which* sampler the kernel receives:
- `interiorRuler.ts` (+48, pure addition): `analyticSurfaceSampler(rA, H)` — `position(u,t)` evaluates
  the exact `rA(θ,z)` per query (no grid), so every point sits exactly on the analytic surface;
  `radialSurfaceFromAnalytic(rA, H)`.
- `noBridgeRefine.ts` (+70/−5): `RefineOptions.surfaceSource?: 'sampler'|'analytic'` (default
  `'sampler'`) + `analyticRA?`/`analyticH?`. `resolveSurfaceSource` default branch returns the
  identical `sampler` + `radialSurfaceFromSampler(sampler)` (byte-identical); `'analytic'` builds
  both placement and ruling from `rA`. Threaded through the sync `refineToZeroOutliers` (the function
  the CI gate, region layer, and C1 all call).

**Scope note:** `refineToZeroOutliersParallel` (a separate perf path, NOT exercised by the CI gate)
was deliberately left on the sampler surface — flagged follow-up.

## Verification

| check | result |
|---|---|
| **Default-off byte-identity** (surfaceSource omitted) | **EXACT**: 9917 tris / 7 passes / 0 outliers / max 0.009996 — reproduces the CI gate + C1 bit-for-bit. Proven 4 ways: code no-op branch; `flagOff.byteIdentical.test.ts`; `wholeMesh0Outlier.test.ts`; coordinator re-ran both + typecheck. |
| **Analytic-on crest max** (small patch bracketing C1's worst crest) | **0.24mm → 0.005239mm.** Triple-independent: K2-ruler 0.005239, an independent Newton arbiter 0.005239 (agrees to 12 sig digits), the harness oracle (`scoreWholeMeshInterior` vs `getManifest('GothicArches').truth.rA`) 0.00997mm / 0-of-61 outliers. **All three ≤0.01mm.** |
| Honest tri/pass cost | sampler 3377 tris/12 passes → analytic **11594 tris/7 passes** (3.43× density) — the true cost of analytic-faithful knife-edges, not capped. |
| Watertight | nonMan 0 non-vacuous, orientation 0, boundary all-rim, zeroArea 0 — every mesh. |
| Quality | full patch %<20° 19.2% ≈ banked 19.0%; small patch minAngle 0.8°→0.4° under analytic (new thin crest slivers, 0 degenerate) — honest concession, consistent with Gothic's banked needle class. |
| Regression | 13 tierC/conforming suites, 62 tests pass / 0 fail / 2 env-gated-skip; ESLint clean; typecheck 0 new errors. |

## Impact analysis (coordinator ran GitNexus; agent's session lacked the tool)

`refineToZeroOutliers` upstream = **HIGH** blast-radius (2 direct callers incl. `buildTierCOuterWall`
→ `ParametricExportComputer`, the production renderer; 0 execution flows affected). **The HIGH rating
is the SYMBOL's importance, not the change's danger:** the change is additive/opt-in and default-off
byte-identical (proven 4 ways above), so effective production risk is nil — nothing flips; the default
stays `'sampler'`. This is the intended way to touch a HIGH-blast-radius area: gate it, prove
byte-identity, keep default-off. No production behavior changes until a deliberate future flip.

## Honest limitation (not tuned away)

Analytic-on was validated on a SMALL sub-patch bracketing C1's known-worst crest, NOT the full
9917-facet smoke patch: C1 measured a score-only pass of that mesh against analytic as an
uninterruptible >10-min grind (killed unfinished), and a refine loop rescoring a growing mesh each
pass costs more. C1 also found ~70% of the full patch's facets exceed tol against analytic, so the
small-patch result proves the MECHANISM (the lever makes the worst crest analytic-faithful) but not
full-patch convergence at scale. **Full-patch confirm = a dedicated checkpointed run before any
default flip.** Recommend: land the lever now (safe, default-off); schedule the scale confirm.

## Status

C2 mechanism PASS. The lever to make Gothic/GeoStar faithful-to-analytic exists, is safe, and is
proven at the worst crest. The true cost (~3.4× tris at knife-edges) is the honest price of the 0.01mm
standard the 512² sampler was hiding. Full-patch scale confirm is the remaining C2 follow-up.
