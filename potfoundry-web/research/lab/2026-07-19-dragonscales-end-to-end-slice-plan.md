# DragonScales end-to-end certified-export vehicle — slice plan / design spec (2026-07-19)

**Status:** DESIGN — awaiting go/no-go. No structural code written. Synthesizes the
2026-07-19 program audit's Track A (judge/atlas) + Track B (generator) findings into one
sequenced plan. Pin commits: atlas probe `90260f7d`, flip-blocker/seam probes `9f34b68a`,
status table `6bb7d6c9`, ruler hardening `42a90637`.

## Why DragonScales is the vehicle

DragonScales is the **single style that exercises all three unsolved sub-systems at once**,
so proving it end-to-end de-risks the whole layered/curtain program:

1. **Multi-patch judge** (atlas) — DS is atlas-refused today; it's a layered wall (8 bands +
   7 curtain risers + 5 base = 20 patches).
2. **Region generator** (mesher) — DS is the *most-ready* production style: the M=g/h² region
   kernel + `dsFeatureEdges` graph are already wired (flag-gated), body already p99 0.0147 /
   `<0.01` at ~3.3M tris.
3. **Certified-mesh seam** (U5.3) — the mesher→exact-partition wiring is style-agnostic; DS is
   the first place to land it.

Two properties make DS the *right first* vehicle (vs Gothic/GeoStar):

- **Its feature lines are dyadic** — bands at `t = k/8`, `8 = 2³`. The exact-rational-station
  machinery (U3b) is needed for placement, but no *odd-factor* stations are required for the
  outer wall + curtains (unlike Gothic `k/24` or GeoStar `shift ≠ 0`). Cleanest possible first cut.
- **Both halves already have landed probes** — judge-side `_dragonScalesMultiPatchAtlas.test.ts`
  (ACC1/2/3, `PF_DS_ATLAS_SPIKE`) and generator-side `flipBlocker.probe` / `mesherPartitionSeam.probe`.
  The acceptance criteria are already encoded and red; this plan makes them green.

## Current state (measured, not aspiration)

| Sub-system | State | Evidence |
|---|---|---|
| Judge / atlas | DS **refused** at the single-patch gate | `singlePatchAnnularRadialSolidTarget.ts:377-384` (`UNSUPPORTED_PATCH_COMPLEX`) |
| Judge / contract | Curtain/side roles **already admitted**, but **unwired** to live prover | `certificationContract.ts:933-938` (roles), `:795` (≤4096 patches), `:999-1000` (manifest counts), `:953-955` (5 base roles); imported only by its own test |
| Judge / exactness | Coverage kernel is **per-patch → composes**; multi-patch does NOT break exactness | `exactDyadicDomainPartition.ts:12` — never divides denominators, never looks across patches |
| Generator / body | Region kernel wired, body `<0.01` @ ~3.3M; rim step **gone** | `tierC/index.ts:437-448`; rim fix `dde07ed3`; region flag `__pfRegionLayer`+`__pfPerfectMesher` |
| Generator / residual | Ring risers `~0.25` (C0 class) + `0.3°` needle | Track B refresh; "0.25" **relocated** rim→interior rings at `t=k/8` |
| Seam | **RED** — mesher emits float64 UV; judge needs integer `k/N` lattice | `mesherPartitionSeam.probe.test.ts`: 64 wrap tris + "Triangle 0 not positively oriented" |

## The shared dependency (why A and B build together, not apart)

Both halves consume **exact-rational stations (U3b, landed)**:
- Track A's per-band **curtain patches** place feature lines on `k/R`.
- Track B's **lattice-native seam** places every mesher vertex on the declared `N`-lattice,
  features on `k/N` via `rationalFeatureAngularLadder`, seam evaluated once (the
  `annularSolidReferenceTessellation` discipline).

For DS both reduce to `t = k/8` (dyadic) — so the station substrate is already expressible and
S1/S3 should be built as one coordinated effort, not two independent programs.

## Scope decision baked in — outer-wall-first (your standing directive)

Per the 2026-07-17 directive ("inner wall can save triangles and compute; outer wall is the main
focus"), this vehicle scopes the DS certificate to **outer wall + curtains at 10 µm; inner/rim/base
at a relaxed bound or topology-only** (per-patch-class tolerance in the certification contract).
This deliberately sidesteps the inner-wall remap's non-dyadic stations (e.g. the `(8k−3)/29`
H-mapping) and the "complete solid" blocker — recorded as a G0/G4 scoped-claim, honestly labelled
in the certificate.

## Slices (sequenced; each flag-gated, TDD, audit-first)

### S1 — Multi-patch atlas admission (JUDGE) · size M · CRITICAL
Replace the `:377-384` single-patch length-gate with **layered admission**:
- Admit `R` outer-wall **band** patches, each a partial-height program over `[k/R, (k+1)/R]`,
  plus `R−1` **feature-curtain** risers.
- **Per-height derivation** of caps/rim/inner from the *correct* band (today all 5 non-outer
  patches derive from the one source program at a single v-slice — `:400/:449/:465/:480/:493/:508` —
  which a layered wall cannot supply).
- `O(R)` `proveValidatedProgramBoundaryIdentity` junctions instead of the fixed 6
  (`NON_PERIODIC_JUNCTIONS:189-224`); reuse the DS source's **already-exposed adjacency graph**
  (`leftBandPatchId/rightBandPatchId/leftRowIndex/rightRowIndex/t` — Track A verified green).
- **Two NEW audits the per-patch exact kernel does not check** (must be exact — BigInt/index,
  not float): (a) global disjoint + complete artifact-triangle assignment across all `2R+4`
  patches; (b) watertight-by-index weld of the risers.
- Wire `featureManifest: present-proven` (contract is ready).
- The reference tessellation hardcodes 6 patches (`annularSolidReferenceTessellation.ts:1341-1348`)
  → make it `R`-parametric. **This is the largest single edit; stage it carefully.**
- **Exit:** `_dragonScalesMultiPatchAtlas.test.ts` ACC1 (20 patches) / ACC2 (per-patch exact +
  global disjoint-complete) / ACC3 (welds to one closed genus-1 solid) all green; default suite
  byte-identical with the flag off.

### S2 — Region-kernel productionize for DS (GENERATOR) · size S–M
- Bring `dsFeatureEdges` + a **`§V11l` u-running riser edge family at `t = k/8`** (the ~0.25 ring
  C0-class) into a flag-gated production config; body already `<0.01` @ ~3.3M.
- **Accept + document the `0.3°` needle** (the finite-area concession the region kernel trades for
  the ~14× sliver reduction — DS `%<20°` 57.9→4.2%).
- **Exit:** DS production mesh watertight, outer-wall true-3D MAX `≤ 0.01`, tractable (`<~1 min`),
  needle documented.

### S3 — Lattice-native seam (BRIDGE — the U5.3 milestone) · size M
Emit DS mesher vertices on the declared `N`-lattice (features on `k/8` via
`rationalFeatureAngularLadder`, seam evaluated once) so the judge certifies the **production mesh**,
not a reference tessellation.
- **Primary path (B):** lattice-native emission — clean, zero accounted error.
- **Fallback path (A):** snap+repair — seam-split wrap tris, merge zero-area cells, and **account
  `δ = |vertex₃D − target(snappedUV)|` into `maximumGeometricUpperPm`** (never silently).
- **Exit:** `mesherPartitionSeam.probe.test.ts` green for DS (no wrap tris, positively oriented,
  exact partition).

### S4 — End-to-end certificate + gate (COMPOSE) · size S
Compose S1 + S3: prove the DS production mesh through the multi-patch atlas; add a guarded,
worker-parallel `PF_G2_POT` roster entry. **First production-mesh certificate in the program.**
- **Exit:** a real DS export (flag-gated) proven `≤ 0.01 mm` outer-wall true-3D end to end; refusal
  path demonstrated on an out-of-scope DS param corner.

## Decision gates (yours) folded into the slices

- **S1:** inner-wall semantics — the outer-wall-first *scoped claim* is the recommended interim
  (no G1/preview change); the full smooth-offset redefinition stays deferred.
- **S2:** accept the `0.3°` region-kernel needle.
- **S4:** certify-or-refuse contract wording; DS body at 3.3M is within envelope v5, so **no v6
  needed for DS** (v6 remains a separate Gyroid + full-scale-WI decision).

## Risks / guardrails

- **CRITICAL hubs** (`buildConformingWall` 157, `assembleWatertight` 108, `buildStyleParamPayload`
  98): every slice stages behind a narrow default-off flag; **`impact()` before edit,
  `detect_changes()` before commit, re-baseline after each slice.** The GitNexus index is currently
  **stale — refresh before S1.**
- The exact-BigInt coverage invariant stays per-patch-exact; the two NEW audits (global assignment,
  riser weld) must be exact, not float — a float audit is the one way a malformed multi-patch
  triangulation could falsely certify.
- The reference-tessellation `6 → R` change is the highest-blast-radius edit; consider landing it
  behind the flag with the fixed-6 path bit-identical when `R = 1`.
- **Concurrent sessions** (CCP/double-valued + certification-roster) are live on this tree —
  path-scoped commits only, coordinate before touching shared proof-layer files.

## Generalization (why this pays off beyond DS)

Once S1 makes the atlas `R`-parametric and S3 lands the lattice-native seam, the other six
layered/curtain styles (ArtDeco, BambooSegments, HexagonalHive, BasketWeave, LowPolyFacet, CelticKnot)
and the snaking-C0 curtains repeat **S1's pattern with their own band/curtain counts** — the atlas
is built once. DS is the template, not a one-off.

## Sizing summary

S1 M · S2 S–M · S3 M · S4 S → **~M–L for the first style**, then incremental per additional layered
style. This is the judge-side U4 unlock and the generator-side U5.3 milestone landing together on one
vehicle.
