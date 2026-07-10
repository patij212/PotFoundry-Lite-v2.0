# E-2026-07-10-DS-PRODTRUTH — DragonScales production-artifact honest fidelity number via the §V11g tread-conforming ruler

**Status: PRE-REGISTERED — kill criteria committed BEFORE measuring.**

## FRAME

`E-2026-07-09-PROD-ARTIFACT-TRUTH` captured the real production default DragonScales export
(`research/exchange/_prod_truth/DragonScales/`: full 8,734,682 tris / outer 4,549,600 tris,
`meta.json` dims H120/top_od100/bottom_od80/expn1/spinTurns0 — i.e. Rt=50/Rb=40, DEFAULT style
params) but never scored it: the forward (mesh→truth) ruler used by that arm was the
**single-valued radial ruler** (`scoreWholeMeshInterior`, `min(GN,brute)` against
`S(θ,z)=(rA·cosθ,rA·sinθ,z)`), and it ran **130 CPU-minutes at stride 4 with no completion**
(nearly every ring-band facet carries a ~1mm radial bound ⇒ the GN screen is exceeded on almost
every ring-band facet ⇒ each falls through to an expensive 45-pt dense + windowed-brute
evaluation, across 4.55M outer facets). The arm was stopped and DragonScales was recorded as an
**INSTRUMENT-TRACTABILITY finding**, deferred to a follow-up arm using the already-VALIDATED
§V11g tread-CONFORMING open-surface composite ruler.

Two prior arms (`E-2026-07-08-DRAGONSCALES-ZDENSITY`, `E-2026-07-08-DS-STEPTWIN-CLOSE`) already
established, on the RESEARCH mesh (not this production artifact):
- the single-valued **radial twin is TREAD-BLIND** — at a tread (a z where the radius jumps) it
  has one radius per (θ,z), so tread facets read a spurious ~0.046mm "error" that is actually the
  ruler's structural blindness, not a mesh defect (V11c's original figure, since corrected);
- the **filled-annulus STEP twin (`buildStepReference`) is REFUTED as a whole-mesh instrument** —
  it passes 1a/1c but FAILS 1b (0.9988 agreement with the radial twin on a smooth control, not
  ≥0.999 — its own on-surface sheet residual is coarser than tol) and FAILS 1d DECISIVELY: an
  off-surface probe pushed 0.2mm outward near a ring reads **0.116mm CLOSER than the true
  off-surface distance** — a filled disk at the ring z catches points that should read far, i.e.
  **it can HIDE a genuine gap**;
- the true riser is **NOT the originally-reported 0.046mm** — it is a genuine stagger-flip C0
  discontinuity of **0.88–1.21mm** (mean 1.04mm), verified both analytically (`ringJumpMax`) and
  via the validated 1a construction audit. This is a **designed 3D feature** the export standard
  says must be MESHED (not smoothed away), not measurement noise.
- **`E-2026-07-08-DS-CONFORMING-RULER` (spec §V11g) built + VALIDATED the composite open-surface
  ruler** = `min(radial-sheet twin 2048×3072, riser wall-only 4096θ z-gated)` and it is the FIRST
  of three DragonScales instruments to survive the full 1a–1d metrologist battery (1a maxDist
  0.00029mm; 1b agreeFrac 1.0 exactly, 0 disagreers, deltaP99 0; 1c sheet 0.00315mm / wall
  converges 0.00498→0.00125→0.00031mm over nTheta 1024/2048/4096; 1d SOUND normal-push understate
  0.0057mm, ≪ the 0.05 threshold). On the RESEARCH doubled-rings mesh (nZband 110, 4.09M tris) it
  read a honest whole-mesh **8,752** outliers (max 0.0461, p99 0.0043) — decomposing into 5,552
  body-wide sheet chord-sag (density-responsive, budget-frontier-limited) + 3,200 near-ring lip
  (representation floor, irreducible to z-refinement per `E-2026-07-08-DS-LITERAL-CLOSE`/§V11l).

**This experiment ports that VALIDATED §V11g composite ruler to score the ACTUAL CAPTURED
PRODUCTION ARTIFACT** (not a research mesh) — the first honest DragonScales production number,
using the correct instrument for a doubled-valued riser surface.

## CRITICAL FRAMING (pre-registered before measuring)

The production DS artifact (`ParametricExportComputer` conforming path, real WebGPU, production
default) is a **SINGLE-VALUED conforming mesh** — its vertices sit on a curvature-adaptive
tessellation of the analytic surface, and at each of the 7 stagger-flip rings (t=k/8, k=1..7) it
**CHORDS the designed ~1mm riser as a steep ramp** (a smooth transition across a few facet rows),
not as the doubled-ring vertical-wall construction the RESEARCH meshes (`buildStructuredWall` +
`dragonRings`) use. Scored against the TRUE stepped surface (the composite ruler, which DOES
represent the riser as an open wall), the artifact is expected to show **TWO populations**:

- **(a) BODY (off-ring-band) facets** — these should closely track the sheet, so their fidelity
  against the composite ruler's sheet component is the honest smooth-body number; expected
  small/CAD-grade-adjacent, matching the production 'high' conforming profile's general behavior
  on other styles (cf. HarmonicRipple's production literal-0 in the prior arm).
- **(b) RING-BAND facets** (the chorded ramp spanning the designed cliff) — a **REAL production
  representation deficiency**, NOT a ruler artifact this time, because the production mesh (unlike
  the research doubled-rings mesh) does NOT embed the riser as a feature edge — it approximates a
  true C0 jump with a continuous ramp of finite-width facets. Per
  `[[feedback_export_standard]]` (cliffs are real 3D features to mesh, not accept-band artifacts),
  this population's magnitude should land in the **~0.4–1.2mm class** (a fraction of the
  0.88–1.21mm designed jump, since the ramp only needs to *span* the cliff, not equal it) — **if
  it instead reads ≪0.1mm, the finding is suspect and must be treated as a possible instrument
  wall-hiding defect** (the 1d failure class), not a clean pass, before being reported.

The deliverable is this **two-population verdict, cleanly separated** — not a single blended
number.

## INSTRUMENT — porting §V11g to the artifact-scoring direction

New file `research/bridge/_ds_prodtruth_lib.ts` (self-contained; imports the READ-ONLY primitives
below, re-derives nothing that is already exported):

- `dragonRings()` — the 7 stagger-flip rings at `t=k/8, k=1..7`, `z=t·H`. Re-derived analytically
  from `DEFAULT_DRAGON_SCALES.dsScaleRows=8` (`src/geometry/types.ts`) and the `rowPhase =
  t·scaleRows; row=floor(rowPhase); staggerOffset flips when trunc(row)%2` mechanism in
  `rOuterDragonScales` (`src/geometry/styles.ts`) — verbatim same recipe as
  `research/bridge/_pf_dsconform.test.ts`'s `dragonRings()` (re-derived independently in the new
  lib per the read-only import discipline, not imported from the test file).
- `buildConformRuler(rA)` — `compositeLocator(sheetLoc, wallLoc, ringZs)` where `sheetLoc =
  buildRefLocator(buildRadialTwin(rA,H,2048,3072), RAD_CELL)` and `wallLoc =
  buildRefLocator(buildWallOnlyReference(rA,dragonRings(),4096,WALLEPS), WALL_CELL)`,
  `WALLEPS=5e-4` (the V11g-ALIGNED value — matches the mesh's own ring-row zEps and is what
  collapsed the wallEps-alignment artifact in V11g). Imports `buildRadialTwin` from
  `./_pf_bvhRuler`, `buildRefLocator`/`compositeLocator`/`type RefLocator` from `./_sharp3dRef` +
  `./_ds_conformRef`, `buildWallOnlyReference`/`riserWallPoints` from `./_ds_conformRef` — all
  READ-ONLY imports, no re-derivation of already-exported machinery.
- `classifyRingBand(xyz, idx, ringZs, bandMm)` — NEW per-facet classifier for the PRODUCTION
  artifact (which has no `RowSpec`/`kind` metadata, unlike the research mesh): a facet is
  RING-BAND iff its centroid z is within `bandMm` of some ring z (bandMm swept, see METHOD);
  else BODY. This is the artifact-specific analogue of `_pf_dsconform.test.ts`'s
  `facetClassifier` (which reads mesh row-kind — unavailable here since the production mesh is an
  unstructured curvature-adaptive tessellation, not row-structured).
- `loadArtifact()` — thin wrapper over `loadBinMesh` (from `./_pf_bvhRuler`, already used by
  `_prod_truth.test.ts` for this exact artifact) reading
  `research/exchange/_prod_truth/DragonScales/outer.{xyz,idx}.bin` + `meta.json`.

## 1a–1d BATTERY — MANDATORY re-run on THIS configuration before trusting

The V11g battery was validated for `WALLEPS=5e-4`, `WALL_NTHETA=4096`, `RAD_TWIN=2048×3072`
against the RESEARCH mesh's sampling. Porting the ruler to score a DIFFERENT mesh (the production
artifact, unstructured triangulation, different vertex density/placement) does not change the
ruler's own geometry, but the battery is re-run here as insurance against a construction slip in
the re-derived `dragonRings()`/lib wiring, per the mission's explicit mandate. Probe
`research/bridge/_ds_prodtruth.test.ts`, `PF_DS_PRODTRUTH_BATTERY=1`:

- **1a (construction):** skirt-anchor (ring radii at z_k∓WALLEPS) + riser-wall interior points
  (`riserWallPoints`) sit on the composite ruler surface, `maxDist ≤ 1e-3mm`. Also reports
  `ringJumpMax` per ring (expect 0.88–1.21mm, matching V11g's banked figures — a mismatch here
  would mean the artifact's dims/params differ from what `dragonRings()` assumes).
- **1b (smooth-parity):** on ≥60,000 smooth-body sample points (θ,z sampled off the artifact's own
  mesh, `|z − z_k| > 2mm` for every ring), the composite ruler's outlier/pass verdict at tol=0.01
  agrees with the standalone radial twin ≥0.998 fraction (deltaP99 near 0 — the composite's sheet
  IS the radial twin by construction, so this should reproduce V11g's 1.0/0 exactly; any drop
  indicates a construction bug in the new lib, not a real geometry difference).
- **1c (density-convergence):** the wall sub-locator's own on-surface residual on `riserWallPoints`
  converges as `WALL_NTHETA` is swept {1024, 2048, 4096} — worst-facet delta between successive
  densities `<10%` at the top of the sweep (mirrors V11g's 0.00498→0.00125→0.00031mm
  convergence).
- **1d (one-sidedness):** off-surface probes pushed along the TRUE 3D surface normal (not a raw
  radial push — the V11g DIAG lesson: a radial push on DragonScales' steep-θ sheet is nearly
  tangent and reads misleadingly small) by 0.2mm near every ring must read `≥0.2 − 0.05 = 0.15mm`
  (i.e. understate `<0.05mm`) — reproduces V11g's SOUND normal-push check (0.0057mm understate).

**BATTERY FAILURE ⇒ STOP.** Report the instrument defect verbatim (which gate, by how much,
localized if possible) and do NOT proceed to score the artifact. No forcing a verdict on a
failed instrument.

## FORWARD DIRECTION (mesh→truth): artifact scored against the composite ruler

Probe `research/bridge/_ds_prodtruth.test.ts`, `PF_DS_PRODTRUTH_FWD=1`. Load the outer submesh
(4,549,600 tris). Per facet: classify BODY vs RING-BAND (bandMm swept — start at 1.5mm, half the
mean ring-to-ring sheet-only sample spacing at the production mesh's local density near a ring;
report the sensitivity of the split to bandMm ∈ {0.5, 1.0, 1.5, 2.5}mm as a robustness check, not
a re-definition after the fact).

**Tractability plan (dense-45 prescreen + shard, per the mission and
`E-2026-07-09-FAST-HONEST-RULER` precedent):**
1. **BODY facets:** the composite ruler's sheet component IS the radial surface for a BODY point
   ⇒ the sound radial same-(u,t) bound `|hypot(x,y) − rA(atan2,z)|` is a STRICT upper bound on the
   true composite distance (proven in `_pf_dsconform.test.ts`'s `scoreMesh`: "conforming sheet ==
   radial surface" ⇒ prefilter is sound-by-construction — same equivalence argument as
   `E-2026-07-09-FAST-HONEST-RULER`'s dense-45 radial screen, reused verbatim). Facets whose dense
   45-pt lattice all read radially `≤ 0.7·tol` are GREEN-PROVEN and skip the BVH; survivors are
   dense-scored against the full composite locator.
2. **RING-BAND facets:** the radial bound is UNSOUND here (that is the whole point of the ring
   band — the radial surface doesn't represent the riser) ⇒ **NO prefilter; every ring-band facet
   is dense-scored against the full composite locator, unconditionally** (mission mandate: "if
   unsound near rings, prescreen only off-band facets and score ALL ring-band facets").
3. If projected wall time for either population exceeds 45 minutes at stride 1, shard by facet
   index mod N (identical mechanism to `E-2026-07-09-FAST-HONEST-RULER`'s proven
   exact-count-equivalent facet-sharding) and run shards as a parallel fleet; merge by summing
   outliers/scanned and maxing max/worst, mirroring `_prod_truth_merge.mjs`'s reducer.
4. `NODE_OPTIONS=--max-old-space-size=16384` passed on the CLI for every heavy stage (Vitest 4
   ignores `poolOptions` heap config — banked repo-wide footgun).

Checkpoint (ndjson, `research/exchange/_ds_prodtruth/scorecard.ndjson`) the INSTANT each
population (body / ring-band) finishes scoring, independently — a killed run must resume without
re-scoring a completed population.

**Report:** body population `{outliers, max, p99, scannedFacets, fraction of total}`; ring-band
population `{outliers, max, p99, scannedFacets, fraction of ring-band area = ring-band tris /
outer tris}`. Both at tol=0.01mm, EVERY qualifying facet (stride 1) or explicitly labeled stride
if sharded/screened — never a silently-scaled estimate presented as literal.

## REVERSE DIRECTION (truth→mesh): the missing-wall witness

Probe `research/bridge/_ds_prodtruth.test.ts`, `PF_DS_PRODTRUTH_REV=1`. This is the
mission-mandated "does the artifact even CONTAIN the cliff" check — the coverage direction from
`E-2026-07-09-PROD-ARTIFACT-TRUTH` (`buildRefLocator` over the artifact's own outer submesh),
extended with explicit riser-wall sampling:

1. **Locator:** `buildRefLocator(artifactOuterSubmesh, cell)`, cell sized from the artifact's own
   mean edge length (same `4×edgeSum/eSamples` heuristic `_prod_truth.test.ts` already used and
   banked as the V10 perf lesson).
2. **Locator self-check (mandatory instrument hygiene):** `loc.dist` vs `loc.bruteDist` on ≥24
   samples spanning body + near-ring locations, `max delta ≤ 1e-9mm` — reproduces the
   `_prod_truth.test.ts` pattern exactly (same gate value).
3. **Sheet coverage:** dense true-surface lattice (≥1024×1024 in (u,t), ONE-SIDED radii per z-band
   — i.e. for z within `wallEps` of a ring, sample the correct one-sided `rA(θ, z_k∓wallEps)`, not
   the naive `rA(θ,z)` which is ill-defined exactly AT a jump) → nearest distance to the artifact.
   Report max/p99, boundary bands (t=0/1 attachment rings) separated per the
   `E-2026-07-09-PROD-ARTIFACT-TRUTH` precedent.
4. **Wall coverage (the mission-critical NEW witness):** dense samples ON the riser wall strips
   (`riserWallPoints(rA, dragonRings(), wallEps, nTheta≥2048, nS≥8)` — points spanning the full
   vertical riser face at every ring, every θ) → nearest distance to the artifact. This DIRECTLY
   measures how far the artifact's chorded ramp sits from the true vertical wall the ramp is
   supposed to span. Report max/p99 separately from sheet coverage — this is the "does production
   contain the cliff" number, distinct from ordinary sheet fidelity.

**Report sheet-coverage and wall-coverage as two separate numbers, never blended.**

## MACHINE COURTESY

Before every heavy stage (forward FWD scoring, REV wall/sheet lattice build,
locator/BVH construction on the 4.5M-tri outer submesh): check
`powershell -NoProfile -Command "Get-Process node | Where-Object {$_.WorkingSet64 -gt 2GB}"`. If
≥2 foreign heavy node processes are found, sleep-poll at 60s intervals up to 45 minutes before
proceeding. Light stages (this document, lib code, battery sub-tests, reading) proceed
immediately without the check.

## KILL CRITERIA (committed BEFORE measuring)

- **BATTERY FAIL ⇒ instrument verdict only.** Any of 1a/1b/1c/1d failing on this configuration
  stops the arm at the instrument report — no forward/reverse numbers are published from a
  ruler that hasn't passed its own battery, regardless of how "reasonable" they might look.
- **RING-BAND SANITY (wall-hiding guard):** the ring-band population's magnitude is expected in
  the **~0.4–1.2mm class** (the chorded riser is a real, but partial, span of the 0.88–1.21mm
  designed jump). If the ring-band max/p99 reads **≪0.1mm**, this is a suspected instrument
  wall-hiding defect (the 1d failure class recurring in a new form) — the arm must STOP and
  re-validate 1d specifically at the production mesh's actual near-ring vertex density (not just
  the analytic-probe battery) before reporting ANY ring-band number as trustworthy. A genuinely
  small ring-band number is only accepted after this extra check passes.
- **BODY-POPULATION SANITY:** if the body population's outlier count is large (order comparable to
  the OLD tread-blind 263,536/~141k-lip figures from the refuted radial-twin era), that would
  indicate the sheet-prefilter equivalence argument broke somewhere — STOP and diagnose before
  reporting, since the equivalence is supposed to be exact by construction (same argument as
  `E-2026-07-09-FAST-HONEST-RULER`'s proven prescreen soundness).
- **COVERAGE LOCATOR-SELF-CHECK FAIL (>1e-9mm delta)** ⇒ STOP, the locator itself is untrusted;
  report the divergence verbatim, no coverage numbers published from it.
- **TRACTABILITY:** forward scoring uses prescreen (BODY) + full-dense (RING-BAND, no prefilter)
  + shard-if->45min, per the mission. If a population is STILL intractable after sharding
  (projected total wall time, summed across a realistic parallel fleet, exceeds ~90 minutes),
  STOP, report the partial/screened state verbatim with basis clearly labeled, and do not force
  a literal completion at the cost of silently degrading the basis without labeling it.
- Every stage checkpoints its ndjson row THE INSTANT it is computed (population-level for FWD,
  witness-level for REV) — a killed run resumes without re-computing finished units.

## SCOPE / FILE DISCIPLINE

- New files only: `research/bridge/_ds_prodtruth_lib.ts`, `research/bridge/_ds_prodtruth.test.ts`,
  `vitest.ds_prodtruth.config.ts` (if a dedicated heap-configured Vitest project is needed —
  NODE_OPTIONS on the CLI is the primary heap lever per the banked Vitest-4-ignores-poolOptions
  footgun), `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md` (this file, verdict appended
  below).
- Data: `research/exchange/_ds_prodtruth/` (gitignored via `research/.gitignore`'s blanket
  `exchange/` rule — confirmed; numbers are inlined in the verdict, not committed as data).
- READ-ONLY imports (never modified): `research/bridge/labkit.ts`, `research/bridge/_sharp3dRef.ts`,
  `research/bridge/_ds_conformRef.ts`, `research/bridge/_pf_bvhRuler.ts`,
  `research/bridge/_pf_dsconform.test.ts` (referenced for the recipe, not imported — its exports
  are test-local, so the ring/row recipe is re-derived analytically from
  `src/geometry/types.ts`/`src/geometry/styles.ts` per the mission's instruction), `src/` (never
  edited — dev-only research, no production code touched regardless of outcome).
- No `git add -A`/`-u`. No file outside the `research/bridge/_ds_prodtruth*` /
  `research/lab/E-2026-07-10-DS-PRODTRUTH*` patterns is created or modified. This pre-reg is
  committed ALONE, first, before any measurement.

## DELIVERABLE

Verdict appended to this file (committed, explicit staging: `git add
research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md` only). Final chat message = dense data summary
for the orchestrator: battery table (1a/1b/1c/1d pass/fail + values), body-population
`{outliers, max, p99}`, ring-band population `{count, max, p99, fraction of ring-band area}`,
sheet-coverage + wall-coverage numbers (max/p99 each), wall times per stage, file paths + commit
SHAs. Not user-facing prose.

---

*(Verdict appended below after measurement.)*
