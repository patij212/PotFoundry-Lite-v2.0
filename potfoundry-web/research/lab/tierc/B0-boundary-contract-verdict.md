# B0 boundary-contract toy β€” verdict

**Program:** PROD-TIERC Phase 1, `E-2026-07-11-TIERC-HEADTOHEAD-prereg.md` Arm B / B0 (decision A2,
architecture-v1.md Β§2 "The known hard case β€” R-STRUCT<->R-CDT adoption (DS)").
**Question:** can a K3 structured ring band (doubled-ring rows, `evenThetas` chains) share its
boundary with a K1 quadtree region by an explicit owned/adopted vertex chain, watertight and
T-junction-free?
**Answer: YES.** Contract (a) (mismatched-count adoption via `buildStructuredWall`'s own existing
merge-strip dispatch) clears all three pre-registered gates at `nRing=512` (K1's own pin) /
`nThetaRing=2400` (the champion's own validated ring-band count). No production file was edited;
no new triangulation code was written β€” the win is wiring, not invention.

**New files (this arm only):** `research/bridge/_tierc_b0_toy_lib.ts`,
`research/bridge/_tierc_b0_toy.test.ts`, `vitest.tierc_b0.config.ts`. Env-gated `PF_TIERC_B0=1`;
6 tests, ~3-8s wall time total (K1 region build ~0.6-0.8s each with `uBias` set correctly β€” see
Β§4). Raw ndjson: `research/exchange/_tierc_b0/scorecard.ndjson` (gitignored). Nothing committed
per task rules.

---

## 1. Design actually run

One ring (DragonScales k=4 of 8, `z=60`, `t=0.5`, at the pinned dims H120/Rt50/Rb40/expn1,
DEFAULT params, `rA` via `_ds_prodtruth_lib.dsRadiusFn()`):

- **R-STRUCT ring band**: `z in [SEAM_LO,SEAM_HI]=[57,63]`, built by a restricted one-ring
  `buildRows`/`buildStructuredWall` (verbatim champion recipe β€” `zEps=5e-4`, span-adaptive
  `treadSub<=4`, `_pf_dszdensity.test.ts:66-84` pattern): adopted-boundary row β†’ 2 sheet rows β†’
  `ringBelow` β†’ tread sub-rows β†’ `ringAbove` β†’ 2 sheet rows β†’ adopted-boundary row.
- **Two K1 regions**, built by the **unmodified production kernel** `buildConformingWall`, over
  **narrowed** z-bands immediately either side of the seam: lower `z in [50,57]`, upper
  `z in [63,70]` (7mm each). Narrowed deliberately off the champion's full `[0,H]` span so the toy
  isolates the ONE seam under test instead of also re-discovering DS's *already-known*
  over-refinement pathology at the other 6 rings (ds-spec Β§1.4) inside the same K1 domain β€” a real
  B1 body region needs the same chopping (or a curvature-floor exemption) for the same reason.
- `nRing=512` (power of two, `buildConformingWall`'s own requirement) pins both K1 regions'
  boundary rows. **`ConformingWall.ts` has zero awareness of "outer wall vs region"** β€” it pins
  t=0/t=1 for *any* `SurfaceSampler`, so a z-sub-band K1 build terminates on exactly the same
  `bottomRing`/`topRing` chain (`ConformingWall.ts:770-899`) a full-height wall would. This answers
  the architecture doc's "investigate what boundary K1 actually emits at a t-window edge" directly:
  **it's the same mechanism `WatertightAssembly.ts` already uses for cap/inner-wall seam-sharing**
  β€” nothing new, no WIP hook needed for this contract.
- **Adoption**: the ring band's row-0/row-N thetas are read *directly off* the K1 regions' own
  emitted `topRing`/`bottomRing` vertex data (`u = result.vertices[ring[i]*3]`), not re-derived.
  The combined mesh is one **explicit raw-index** buffer β€” K1-lower occupies indices
  `[0,lowerN)`, K1-upper `[lowerN,lowerN+upperN)`, and every ring-band index that falls in row-0 or
  row-N is *remapped* to the corresponding K1 index (offset into the combined array); only the
  ring's *interior* rows get new indices. `nRing` (512) is a power of two but the champion's own
  ring-band `nTheta` is not (2400) β€” `buildStructuredWall`'s existing dispatch (equal-count
  diagonal-flip vs. the general periodic merge-strip `stripBetween`, `_sharp3dMesh.ts:96-116`)
  handles the mismatch automatically. This *is* contract (a)'s "conservative stitch strip" β€” no
  new triangulation code.

---

## 2. Gate results, per contract

All three gates pre-registered: **(1)** `nonManRawBig`==0 on the assembled toy, non-vacuous
(injected duplicate-triangle control moves it); **(2)** zero T-junctions on both seam chains
(explicit audit, 1e-6mm quantized); **(3)** riser serration (ring locus β†’ nearest-mesh-edge
distance, `_cu_dslip_serr.test.ts`'s own `lipSerration` algorithm, re-derived verbatim) p99 ≀
0.001mm β€” same acceptance basis the champion's own sweep test used (`s.p99 <= 0.001`).

### Contract (a) β€” mismatched-count adoption (nRing=512, nThetaRing swept)

| nThetaRing | tris (total) | gate1 (nonMan / boundary / control) | gate2 (T-junctions lo/hi) | gate3 p99 / max (mm) | overall |
|---|---|---|---|---|---|
| 600  | 255,604 | 0 / 1024 / 3 β†’ PASS, non-vacuous | 0/0 β†’ PASS | 0.012196 / 0.016803 β†’ **FAIL** | FAIL |
| 1200 | 267,604 | 0 / 1024 / 3 β†’ PASS, non-vacuous | 0/0 β†’ PASS | 0.003038 / 0.004915 β†’ **FAIL** | FAIL |
| **2400** | **289,204** | **0 / 1024 / 3 β†’ PASS, non-vacuous** | **0/0 β†’ PASS** | **0.000762 / 0.001621 β†’ PASS** | **PASS** |

**2400 is the champion's own validated `nTheta` (ds-spec Β§0 "do not raise")** β€” this is not a
tuned-for-this-toy number, it's the recipe's own operating point, reproduced independently. `max`
(0.00162mm) sits slightly over 0.001 at nThetaRing=2400 while `p99` clears β€” reported honestly;
the champion's own gate (and its own registry citation, "β‰ˆ0.001mm") is p99-based, not max-based,
so this is not a downgrade of the acceptance basis, just the same one the source instrument used.

### Contract (c) β€” matched-count adoption (nRing=nThetaRing=512, ZERO merge-strip anywhere)

| tris | gate1 | gate2 | gate3 p99/max | overall |
|---|---|---|---|---|
| 254,196 | 0 / 1024 / 3 β†’ PASS, non-vacuous | 0/0 β†’ PASS | 0.016575 / 0.022171 β†’ **FAIL** | FAIL |

Gates 1 and 2 pass identically to contract (a) β€” **the seam mechanism itself is clean regardless
of whether counts match** β€” but 512 theta samples is too coarse for the ring's own serration
requirement (expected: `_cu_dslip_serr.test.ts`'s own sweep found nTheta=1800 still failed the
0.001mm bar; 512 is coarser still). This is a *ring-recipe density* limitation, not an adoption
defect β€” see Β§4 for where the one quality anomaly in this config actually lives (not the seam).

### Non-vacuous mechanism control (not merely audit non-vacuity β€” the MECHANISM's own effect)

Built the identical lower/upper/ring pieces and merged them **two ways**: `mergeAdoptedAssembly`
(index-shared) vs `mergeUngluedAssembly` (same positions, independent indices β€” simulates a naive
"stitch without adoption"):

| | nonMan | boundary edges |
|---|---|---|
| adopted | 0 | **1024** (= exactly `2Γ—nRing`, the toy's own two intentionally-open far ends β€” confirmed `adoptedBoundaryIsExactlyFarEnds:true`) |
| unglued | 0 | **3072** (= 1024 + 2048; `2048 = 4Γ—nRing` = 2 seams Γ— 2 sides Γ— nRing, exactly as predicted) |

Both read `nonMan=0` β€” **an unglued-but-coincident seam is invisible to `nonManRawBig` alone**
(it shows up as inflated *boundary* edge count, not a multiplicity defect β€” a real methodological
point: gate 1's `nonManRawBig==0` check needs the boundary-edge cross-check, or the duplicate-tri
injection, to be a genuinely discriminating non-vacuity witness for THIS failure mode). The
`Ξ” = 2048` landing exactly on the predicted `4Γ—nRing` is strong, mechanism-level (not just
audit-level) confirmation that adoption β€” not coincidence β€” is what closes the seam. Plus the
literal task-specified control: injecting one duplicate triangle moved `nonManBase` 0β†’3 in every
config (edges of the duplicated triangle each go multiplicity 2β†’3).

### Contract (b) β€” light investigation (railLines force-registration at a domain t-edge)

Per the task's "stop at first PASS" rule, this got a single cheap smoke test, not a full build:
unpinned (`nRing` omitted) K1 region, one `railLines` entry carrying `evenThetas(100)`-equivalent
points at `t=0` (100 not a power of two β€” exactly the case `nRing` pinning can't reach).

**Result: PARTIAL/UNEXPECTED, no throw.** `bottomRing.length = 352` (not 100), and the 352
vertices' u-values do **not** match the rail's own `i/100` samples. **Finding (the missing hook):**
rail lines are documented and coded as *additive* constraints β€” "Rail lines are ADDITIVE feature
constraints: they are triangulated as constraints exactly like ordinary features AND additionally
force-registered" (`FeatureConformingTriangulator.ts:123-127`) β€” they get inserted into whatever
the natural (unpinned, curvature-adaptive) quadtree already produces at that edge; they do not
**replace** the row's structure the way `nRing`+`enforcePinnedBoundary` does. There is no override
mode that would make a rail line the *exclusive* definition of a boundary row. This is consistent
with the mechanism's own documented purpose (Task 2/3, a general-mesher offset-band integration
spike for *interior* band complements) rather than domain-edge chain replacement. **Not pursued
further** β€” contract (a) already fully passes and this confirms (a)/(c)'s already-production-proven
pinning mechanism is the right lever, not the WIP spike.

---

## 3. VERDICT

**Contract (a) β€” mismatched-count adoption β€” PASSES all three pre-registered gates** at
`nRing=512`, `nThetaRing=2400`: `nonMan=0` (non-vacuous two ways), `boundary=1024` (exactly the
toy's own open far ends, zero extraneous seam boundary), 0/0 T-junctions on both seams, serration
p99=0.000762mm ≀ 0.001mm. 289,204 total triangles, built in ~1.4s (K1 regions ~0.7s each, ring
band construction+merge ~0.07s). This is a clean, one-shot **PASS** β€” per the task's "stop at
first PASS" rule, contracts (b)/(c) were not pursued further once (a) cleared, beyond the light
investigation above.

**The R-STRUCT<->R-CDT adoption question, architecture-v1.md Β§2's "known hard case," is
CLOSED: production ConformingWall's own `nRing`-pinned boundary ring is a sufficient, already-
proven-in-production mechanism for the K3 doubled-ring band to adopt β€” no new hook, no
`ConformingWall.ts` edit, no `railLines`/`bandRegions` completion needed.**

---

## 4. Side finding (not a gate): the one quality anomaly, and where it actually lives

The FIRST run (before adding `computeUBias`) showed K1 tris ballooning (~408k/422k per region) and
poor triangle quality (minAngle 0.3-0.6Β°) β€” traced to this toy's z-bands being an EXTREME wide/flat
aspect ratio (`wideFlat = circumference/height β‰ˆ 283/7 β‰ˆ 40`, vs. `computeUBias`'s own Gate-A
threshold `3√2β‰ˆ4.24`) with `uBias` left at the isotropic default 0. **Fix: call the SAME
`computeUBias(sampler, false)` production uses for every real wall** (`WatertightAssembly.ts:118`,
imported read-only) β€” this is production parity, not a new lever, and it does not change the
adopted chain's vertex count (`buildConformingWall` keeps the pinned ring at exactly `nRing`
regardless of `uBias`, `ConformingWall.ts:779-786`). Result: `uBias=2`, K1 tris dropped to
~120-125k per region (3.4Γ—), quality improved materially, **and all gate numbers above are
already reported post-fix** (the table in Β§2 is the corrected run).

One residual anomaly remained: `minAngleDeg` rounds to **0** in the contract-(c) matched
(512/512) config only. A region-classified diagnostic (`quality_diag_sliver_location` in the
ndjson) resolved it definitively:

| region | matched (512/512) worst angle | winner (512/2400) worst angle |
|---|---|---|
| touchesSeamLo | 2.92Β° | 2.90Β° |
| touchesSeamHi | 2.87Β° | 2.87Β° |
| K1 lowerInterior | 2.38Β° | 2.38Β° (identical β€” K1 build is deterministic/config-only) |
| K1 upperInterior | 2.31Β° | 2.31Β° |
| **ringInterior** | **0.0015Β° (the sliver)** | 0.97Β° (healthy) |

**The sliver touches neither adopted seam chain** β€” both `touchesSeamLo`/`touchesSeamHi` are
healthy (~2.9Β°) in *every* config, including the one with the sliver. It lives entirely inside the
ring band's own interior construction, specifically only at the exact-count (512-thetas)
configuration β€” most likely a near-degenerate quad from the equal-count diagonal-flip path landing
on a coincidental near-collinearity at that particular sample density (not reproduced at 600, 1200,
or 2400). **This is a ring-recipe density artifact orthogonal to the seam/adoption mechanism under
test**, and does not appear at all in the winning contract-(a) config. Not investigated further
(out of B0's scope; would be a B1-adjacent ring-recipe-tuning note if it recurred at production
scale).

---

## 5. Visual evidence

`research/exchange/_tierc_b0/b0_winner.png` (true-aspect render) framed almost entirely off-screen
β€” the toy is a *short, wide washer* (20mm z-span vs. ~90mm diameter) and `meshRender.cjs`'s camera
heuristic is tuned for tall-pot silhouettes, not this aspect ratio. A second, clearly-labelled
**z-exaggerated (5x) visualization-only** dump (`b0_winner_a_zx5_VIZONLY.*.bin`, never used for any
measurement) renders cleanly: `research/exchange/_tierc_b0/b0_winner_viz.png` shows K1-lower
(blue) transitioning through the bright-yellow adopted seam chain into the ring band (red) with no
visible gap, crack, or misalignment β€” consistent with the numeric zero-T-junction / zero-extra-
boundary result.

---

## 6. Recommendation for B1 (full DS outer wall, 7 R-STRUCT ring bands + 8 R-CDT body bands)

1. **Adopt contract (a)'s mechanism as-is**: each K1 body region calls `buildConformingWall` with
   `nRing` set to whatever the region needs (does **not** have to match any ring band's own
   `nTheta`); each R-STRUCT ring band's outermost rows read their thetas directly off the adjacent
   K1 region's `topRing`/`bottomRing`, and get explicitly index-remapped into the combined buffer.
   `buildStructuredWall`'s existing merge-strip dispatch needs no changes.
2. **Every K1 body region MUST call `computeUBias(sampler, hasFeatures)`** (Β§4) β€” B1's 8 body
   bands will likely be much taller than this toy's 7mm slices (so less extreme a `wideFlat`
   ratio), but the toy proves the lever matters and it costs nothing to always apply it (it's
   already production's own default path for every real wall).
3. **Chop K1 body regions to avoid straddling more than one ring's discontinuity** β€” confirmed
   necessary by this toy's own deliberate narrowing (Β§1); an 8-body-band B1 plan already implies
   this (7 rings β‡’ 8 inter-ring gaps β‡’ 8 body bands, one per gap), so B1's own architecture
   already matches what B0 needed, not an extra requirement B1 discovers new.
4. **Ring-band `nTheta` should default to the champion's validated 2400** β€” confirmed here (not
   just cited): 600 and 1200 both cleanly fail gate 3 (serration) while topology/T-junction gates
   pass regardless, so density is purely a serration dial, decoupled from the seam mechanism.
5. **Contract (b) (`railLines`/`bandRegions`) is not needed and not recommended** for this seam
   class β€” it targets a different integration pattern (interior offset-band complement, not
   domain-edge chain replacement); pursuing it would be additive scope with no evidence it beats
   the already-proven `nRing` pinning mechanism.
6. **The one open thread**: B1's full outer wall will have TWO seams per ring band (as this toy
   does) times 7 rings = 14 adoption seams total, all using the identical mechanism validated here
   β€” B0 did not test whether ADJACENT ring bands' K1 body regions (sharing a boundary with TWO
   different ring bands, one above and one below) introduce any new interaction; this is a natural
   B1-scale question, not expected to be a new mechanism (each seam is still a simple two-sided
   `nRing` pin/adopt, independent of its neighbours) but worth a quick non-vacuous check once B1 is
   assembled.

---

## 7. Files

- `research/bridge/_tierc_b0_toy_lib.ts` β€” pure functions: K1 z-band sampler/builder (with
  `computeUBias`), ring-band row builder (champion recipe, restricted to one ring), explicit
  raw-index adopted/unglued merge, gate 1/2/3 instruments, checkpointing helpers.
- `research/bridge/_tierc_b0_toy.test.ts` β€” 6 env-gated (`PF_TIERC_B0=1`) tests: contract (a)
  sweep, contract (c), non-vacuous mechanism control, contract (b) smoke, quality diagnostic,
  visual-evidence dump.
- `vitest.tierc_b0.config.ts` β€” mirrors `vitest.tierc_gates.config.ts`'s convention.
- `research/exchange/_tierc_b0/` (gitignored) β€” `scorecard.ndjson`, `run.log`, render bins/PNGs.

Run: `NODE_OPTIONS=--max-old-space-size=8192 PF_TIERC_B0=1 node node_modules/vitest/vitest.mjs run
--config vitest.tierc_b0.config.ts` (idempotent β€” re-run skips any key already in the ndjson).
