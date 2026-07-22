# Tooling Acceleration Program — 2026-07-22 (autonomous 8h build)

**Mandate (Patryk, away 8h):** "build and improve tools to accelerate our development
efforts. be creative and thorough… make some spectacular things." Free rein; use subagents
(Opus, per standing instruction); use the full window.

**Operating rules (self-imposed, matching the project's ethos):**
- Every tool: brief spec → TDD implementation (Opus subagent) → adversarial review (Opus
  subagent) → fix loop → record. No unverified claims; measurement before assertions.
- Shared branch `refactor/core-migration` has a LIVE concurrent DS-SEAM agent. Per-tool: record
  BASE=HEAD right before dispatch; explicit `git add <paths>` only (never `-A`); review-package
  off the commit's real parent.
- No large binaries committed (respect the `exchange/` ignore policy). No product-code (`src/`)
  edits unless a tool genuinely needs a tiny dev-gated hook. Research/lab tools only.
- Durable state: this charter (map + ledger), per-tool specs in `docs/superpowers/specs/`,
  `.superpowers/sdd/progress-*.md` ledgers. Survives compaction / API drops.

---

## Foundation (this session, pre-mandate): the potscope TRUTH LAYER — 8/8 tasks shipped

`_certRosterReconstruct` spine (loc.bin + recon.json + standing drift guard) + `hotspots`
(residual structural classifier) + `status` (generated cert registry + `--check` gate) +
loc-backed `decode`. Full suite 19/19. Commits `4240c4d8…25f0a75d`. Spec+plan committed.
Final whole-branch review in flight. Known major finding: `research/exchange/` is git-ignored ⇒
certified artifacts not tracked ⇒ tools read ON-DISK state (fine in this campaign tree, not on a
fresh clone). Tool P1 below fixes this.

---

## Program backlog (ranked by accel-value × buildability × "spectacular")

### TIER 1 — build for sure
- **P1 · Portable certificate manifest** — `potscope manifest` writes a small COMMITTED
  `research/exchange/_certified_stl/certs.manifest.json` (per-pot: name, style, configDigest,
  provenance triple, tris, stats, cert pm/commit). `status`/`hotspots` fall back to it when the
  on-disk sidecars are absent (fresh clone). Resolves the major finding WITHOUT committing big
  binaries. → makes the truth layer portable/teammate-usable.
- **P2 · Convergence-slope probe** (THE deferred #1 signal) — `_certRosterConvergence` bridge
  harness bakes a pot's worst region at ≥2 densities; `potscope converge <name>` reports whether
  the worst residual HALVES when density doubles → **refine-vs-redesign verdict**
  (density-responsive vs structurally-irreducible). The single most decision-relevant question in
  the campaign, made cheap.

### TIER 2 — build if time
- **P3 · A/B error diff** — `potscope diff <a.error.bin> <b.error.bin>`: per-region better/worse
  between two bakes of the same pot (two configs), + a `view --diff` overlay. The campaign is all
  comparisons.
- **P4 · Production-scale budget estimator** — `potscope estimate <style> --od 140 --h 120`:
  predict triangle count + envelope version to certify at production scale via the roadmap's sag
  law (tris ~ relief·freq²·area/tol). Answers "how far is this style from production-certified?"
- **P5 · Campaign ETA + structured probes** — `run` estimates completion of long bakes from the
  ledger's enclosure/elapsed history; a `probe()` emitter helper so capture isn't fragile regex.

### TIER 3 — spectacular / integrative
- **P6 · Campaign dashboard** — a self-contained HTML command-center (Artifact): status registry
  table + per-pot hotspots summary + the certified shelf + convergence verdicts, one view.
- **P7 · `potscope doctor`** — one command runs the whole truth layer (guard + status + hotspots
  roll-up) → a single health report (human + `--json`).
- **P8 · New-style onboarding scaffolder** — `potscope newstyle <Name> <id>` codegen for the
  required-update order (registry → WGSL stub → styles.ts → fixtures → cert roster → decode).

---

### TIER 0 — finish the truth layer trustworthily (do FIRST; foundational)
- **P0a · Merge-readiness fixes** (final review: MERGE WITH FIXES, 0 blockers): (#2) per-file
  try/catch in `buildStatusRows` + `committedProvenance` so one malformed sidecar skip+warns
  instead of aborting the whole run; (#8) wrap `cmdDecode`'s `resolveTriFromLoc` → clean CLI
  message not a stack trace; (#9) README "committed STL"→"on-disk certified STL" + a one-line
  DOCUMENTED CONTRACT (GREEN = determinism + on-disk match; fresh clone = vacuous STL-MISSING).
- **P0b · ANISOTROPIC radial-patch calibration** (final review real-data caveat): `triAnisotropy`
  measures PARAMETERIZATION anisotropy, which is legitimately huge near the polar/annular
  singularity of the disc/rim/drain cap patches — so ANISOTROPIC currently mis-fires there
  (SpiralRidges bottom-top 8.7, Voronoi top-rim 29.5) pointing the M=g/h² lever at a coordinate
  artifact, not a mesher defect. Fix: gate ANISOTROPIC to the regular-parameterization WALL
  patches (outer-wall/inner-wall) only; cap/rim/drain get shape-only structure, no aniso lever.
  Makes the refine-vs-redesign verdict trustworthy — foundational to P6/P7 which surface it.

## Program ledger (append status as tools land)
- (start) Charter written. Truth layer 8/8 shipped (4240c4d8…25f0a75d, 19/19).
- Final review: MERGE WITH FIXES, 0 blockers. Provenance chain verified real-bytes; exchange/
  boundary = acceptable lab-tool contract (document it). Added P0a (3 one-liners) + P0b
  (ANISOTROPIC radial calibration — real-data finding). Starting P0a.
- P0a DONE (705bc628): malformed-sidecar guard + test (20/20), decode CLI clean, honest STL docs.
  Truth layer now MERGE-READY. Trusted prescribed-fix evidence, skipped a re-review cycle (budget).
- P0b DONE (81201998, 23/23, self-verified gate): ANISOTROPIC now wall-only. Roster survey:
  0/190 radial-cap high-aniso clusters mislabeled (was mislabeling SpiralRidges bottom-top 8.7,
  Voronoi top-rim 29.5); 27 legit wall cases still fire; aniso number preserved everywhere.
  Classifier verdict now TRUSTWORTHY. Truth layer complete+calibrated.
- P1 DONE (1cd39b87, 26/26, review APPROVED): portable certs.manifest.json (12 pots, git-tracked,
  idempotent) + status fresh-clone fallback (source:sidecar|manifest, DRY shared helpers). Registry
  now works on a clean clone. Minors tracked: manifest.magic not validated on read; per-entry
  malformation not skip+warned; no manifest drift-gate (future `manifest --check`).
- P2a DONE (a162cb22, depth=2 CALIBRATES: fine-max 1.06x/1.33x of cert-max): convergence probe
  harness. VALIDATED vs ground truth — HarmonicRipple all-6-patches responsive (3.9-4.0 ≈ h²);
  GeometricStar DISCRIMINATES: outer-wall 2.12 PARTIAL, inner-wall 1.07 IRREDUCIBLE (independently
  rediscovers the known GeometricStar chevron density-irreducibility!). ~3min/pot. Caveat: inner-wall
  station-ladder passes through coarsening so 1.07 = "angular-refinement-invariant" specifically.
- P2b DONE (48d4fdcf, 32/32, self-verified real output): potscope `converge` reader. Real
  GeometricStar output is a clean per-patch refine-vs-redesign table (inner-wall IRREDUCIBLE 1.07 /
  outer-wall PARTIAL 2.12 / caps RESPONSIVE 4.0) with the angular-only caveat + lever. Agent dropped
  at report-write (API), deliverable committed+verified. CONVERGENCE PROBE COMPLETE end-to-end.
- Reprioritized: P7 doctor (aggregator → dashboard data source) → P6 dashboard (showpiece) →
  P4 estimator → consolidation. P3 A/B-diff DEPRIORITIZED (convergence covers the key A/B case;
  general spatial-diff needs two baked variants — lower immediate value).
- P7 DONE (9b1d48f4, 36/36, hotspotClusters refactor BYTE-IDENTICAL on real data): `potscope doctor`
  roster roll-up. Real: 12 pots / 12 GREEN / 0 DRIFT / 0 masked / hotspots 12/12 / converge 2/12 /
  1 irreducible (GeometricStar inner-wall). --fast (instant, elides STL reads) + --json (dashboard src).
- P6 DONE (4bbfe971, 38/38): `potscope dashboard` — 33KB self-contained command center, 12 cards,
  fidelity meters, hotspot+convergence rows, ceramic palette, 0 external URLs. Rendered (read_page
  confirmed) + SendUserFile'd to Patryk (browser pane not displayable while away).
  CROSS-VIEW FINDING: dashboard exposed classifier vs convergence DISAGREEMENT — HarmonicRipple_small
  hotspot "BAND IRREDUCIBLE outer-wall" but converge measured outer-wall RESPONSIVE ×3.92. The
  classifier's full-span→IRREDUCIBLE is a STRUCTURAL HEURISTIC; the convergence probe MEASURES. ⇒ P8b.
- BATCH: PF_CONVERGE=all convergence bake running in background (roster-wide refine-vs-redesign map;
  ~30-60min). Uses current angular-primary coarsening (vertical station-ladders pass through). After:
  regen dashboard/doctor with converge for all 12.
- P8b IN PROGRESS: classifier honesty — rename BAND's `IRREDUCIBLE` tag → `FULL-SPAN` (structural
  observation), lever points at `converge` to MEASURE responsive-vs-irreducible. Reserve the word
  IRREDUCIBLE for the convergence probe's measured verdict. Makes the two tools compose honestly.
- P8b DONE (76692888, 38/38 + 3 two-path guard tests): classifier BAND tag IRREDUCIBLE→FULL-SPAN,
  lever now "run converge to measure"; convergence verdict keeps measured IRREDUCIBLE. Tools compose honestly.
- P9 DONE (ad8db745, 43/43, isolated red-check per fix): consolidation — manifest magic-guard +
  per-entry resilience on read, hotspots DOMINANT-patch label (fixes seam mislabel), cmdServe path
  containment (isInsideDir vs startsWith).
- BATCH CONVERGENCE DONE (28min, all 12 converge.json written). CALIBRATION GATE finding (honest!):
  8/12 calibrate (calibRatio≤1.5: HR/HRprod/SpiralRidges/FourierBloom/Crystalline×2/GeometricStar/WI);
  4 FAIL the ≤2.5 tolerance → depth-2 proxy too loose: SuperellipseMorph 3.5x, SuperformulaBlossom 3.5x,
  RippleInterference 9.2x, and Voronoi BLOWS UP 427x w/ 512 enclosure fallbacks (numerical). ⇒ depth must
  scale with relief; Voronoi field needs investigation. The tools MUST mark uncalibrated pots.
- P2c DONE (92937ab0, 46/46): convergence CALIBRATION-HONESTY. doctor summary convergeCalibrated 8 /
  uncalibrated 4; withIrreducibleConvergence 4→3 (gate excludes Voronoi's unreliable IRREDUCIBLE).
  Voronoi converge shows ⚠ UNCALIBRATED 427.4× banner.
- DASHBOARD v2 delivered (regen, verified via get_page_text, SendUserFile'd). Roster map reads honest:
  3 MEASURED-IRREDUCIBLE frontiers (GeometricStar inner-wall 1.07 · Crystalline_fract outer-wall 1.00 ·
  Crystalline_hp025 drain-wall 1.00 — all certified via feature-conforming, NOT density); RESPONSIVE:
  FourierBloom/WaveInterference/SpiralRidges/HRsmall (3.8-4.0); PARTIAL: HRprod 1.82; 4 uncalibrated flagged.
  Real campaign intelligence: the convergence proxy needs depth to scale with relief; Voronoi field is
  numerically nasty (512 fallbacks). Classifier FULL-SPAN composes correctly w/ measured verdict on the cards.
- CONVERGENCE-DEPTH finding logged as future work (auto-depth-scaling): re-baking the 3 loose pots at
  higher depth is expensive + slow-converging (depth tightens ~12%/level); Voronoi won't fix via depth.
  NOT re-baking now — tool is honest as-is. Documented for a future pass.
- P5 DONE (2544329f, 48/48): `run` heartbeat + stall/EcoQoS warning + on-completion historical comparison
  (runHistory over ledger run-complete entries).
- FINAL GATE GREEN: 48/48 node --test; doctor end-to-end 12 GREEN / 3 irreducible / 8+4 converge. Toolkit coherent.
- P10 DONE (598c08e8, 50/50): portable convergence — manifest carries the roster refine-vs-redesign map;
  fresh-clone doctor shows the identical 3-irreducible/8-calibrated/4-uncalibrated map with 0 on-disk sidecars.

---

## FINAL STATE (2026-07-22, end of autonomous window)

### Toolkit shipped (all committed on refactor/core-migration, `node --test` 50/50 green)
Foundation — TRUTH LAYER (pre-mandate, 8 tasks + finalization):
- `_certRosterReconstruct` spine → `<name>.stl.loc.bin` (per-tri patch+u/v) + `recon.json` (fresh provenance
  + drift verdict) + STANDING DRIFT GUARD (all 12 committed certs reproduce GREEN, byte-identical).
- `potscope hotspots <name>` — residual STRUCTURAL classifier (SPIKE / BAND[+FULL-SPAN] / DIFFUSE,
  ANISOTROPIC[wall-gated] / FEATURE-ALIGNED), each → a mesher-lever hint. f32-tolerant hot threshold.
- `potscope status [--check] [--json]` — generated cert registry + drift gate + max-mask flag; fresh-clone
  manifest fallback.
- `potscope decode --pot` — loc-backed, style-agnostic (Gothic hints only for GothicArches).
Mandate tools (P0–P10):
- `potscope manifest` → committed `certs.manifest.json` (registry + convergence map; portable, no binaries).
- CONVERGENCE PROBE: `_certRosterConvergence` harness (shallow-depth worst-residual at 2 densities,
  calibrated vs cert-max) + `potscope converge <name>` → per-patch REFINE-vs-REDESIGN verdict
  (RESPONSIVE ≥3 / PARTIAL 1.8–3 / IRREDUCIBLE <1.8), calibration-gated (uncalibrated ratios flagged).
- `potscope doctor [--fast] [--json]` — roster health roll-up (registry + hotspots + convergence).
- `potscope dashboard` — self-contained HTML command center (ceramic studio palette).
- `potscope run` — now heartbeat + stall/EcoQoS warning + historical-comparison on completion.
- Calibration/honesty: ANISOTROPIC wall-gated; classifier FULL-SPAN (structural) vs measured IRREDUCIBLE;
  dominant-patch labels; manifest schema/entry guards; serve path containment.

### Real intelligence the tools produced (measured, not modeled)
1. **3 measured-irreducible frontiers among the certified roster** (density won't close them — they're
   certified via feature-conforming/anisotropic construction, NOT triangle count): GeometricStar inner-wall
   (ratio 1.07), Crystalline_small_OD30_fract outer-wall (1.00), Crystalline_H32_hp025 drain-wall (1.00).
   The convergence probe independently rediscovered the known GeometricStar chevron irreducibility.
2. **The cheap depth-2 convergence proxy calibrates for 8/12 pots** (calibRatio ≤ 1.5) but is too loose for
   3 high-relief styles (SuperellipseMorph 3.5×, SuperformulaBlossom 3.5×, RippleInterference 9.2×) and
   **blows up numerically on Voronoi (427×, 512 enclosure decimal fallbacks)** — the fast enclosure fails
   on Voronoi's field. The tools flag these honestly rather than reporting a wrong verdict.
3. **The classifier's structural "full-span band" heuristic can disagree with the measured verdict**
   (HarmonicRipple_small outer-wall: classifier FULL-SPAN, convergence RESPONSIVE ×3.92) — which is exactly
   why the measured convergence probe is the authority and the classifier only reports structure.

### Roadmap (ranked; the clear next-session work)
1. **Arbitrary-config convergence** — feed the probe an uncertified config (not just the roster) so it works
   on the ACTUAL frontier (e.g. GeometricStar at production relief). Needs a cert-free calibration:
   SELF-CALIBRATE via depth-stability (bake fine-max at depth D and D+1; trust iff they agree within tol).
   This is the highest-value next build; deferred here as a real design, not a rushed end-of-run attempt.
2. **Convergence vertical-coarsening v2** — the P2a caveat: coarsening currently passes vertical
   station-ladders through, so inner-wall IRREDUCIBLE verdicts are "angular-refinement-invariant" only.
   Coarsen the ladders (drop alternate stations) to test BOTH axes → complete refine-vs-redesign verdicts.
3. **Voronoi convergence numerical investigation** — why 512 decimal fallbacks + 427× at depth 2? The
   fast enclosure degenerates on Voronoi's field; needs the exact path or a field-specific fix.
4. **Depth auto-scaling for high-relief** — bump probe depth until calibrated (bounded); calibrates the 3
   loose styles (depth tightens ~12%/level, so this is compute-real — pair with #1's self-calibration).
5. **Convergence standing regression gate** — a fast `node --test` asserting the committed manifest's
   golden verdicts (GeometricStar IRREDUCIBLE, FourierBloom RESPONSIVE, Voronoi uncalibrated) don't drift.

### How to use it (the closure loop the toolkit now supports)
`bake → potscope hotspots <pot>` (where + what structure) `→ potscope converge <pot>` (refine or redesign?)
`→ decide → re-mesh → potscope status --check` (didn't regress) `→ potscope dashboard` (see the roster).
All per-tool specs/reports in `.superpowers/sdd/` (p0a..p10, task-1..8). Design+plan committed under
`docs/superpowers/specs|plans/2026-07-22-potscope-truth-layer*`.
