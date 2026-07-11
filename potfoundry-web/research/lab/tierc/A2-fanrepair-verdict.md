# Arm A2 Verdict — Gyroid 2-locus non-manifold fix (G4 blocker)

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm A2. **Verdict: PASS via `fanRepair`.**
Raw data: `research/exchange/_tierc_a2_accept/` (gitignored — `verdict_{fanRepair,forceRefine}.json`,
`rows.ndjson`, `nonman_loci_forceRefine.json`). Kernel change committed with this doc.

## Result

The champion-spec §1.5 2-locus deterministic non-manifold defect (mult=3 cracks on the outer wall
where the two doubled band-edge contours pass within ~1–1.7 featureLevel-11 cells of each other) is
**closed to zero** by an opt-in fan-consistency post-pass, with geometry provably unmoved.

| remedy (pre-registered order) | nonMan | outer tris | vs banked | verdict |
|---|---|---|---|---|
| `off` (default) | 3 | 2,242,987 | hash `f033dbf5-b5f9fb84` = banked exactly | byte-identical baseline |
| `forceRefine` (tried FIRST) | **3** | 2,275,354 (+1.44%) | fidelity perturbed, defect NOT cleared | **FAIL** |
| `fanRepair` (FALLBACK) | **0** (control moved) | 2,242,984 (−3) | see below | **PASS** |

**`fanRepair` acceptance (all gates met):**
- nonManRawBig **0**, non-vacuous (injected-duplicate control moved); zeroArea **0**; loci `[]`.
- Fidelity UNMOVED — every scored number bit-identical or within noise of the banked band-edge row:
  outer tris 2,242,984 (−3, ≪ ±0.5%); prescreen survivors 236,185 (**exact**); stratified
  estOutliers 31,114 (**exact**); **Newton-worst 0.02491654414922634 (identical to banked)**;
  coverage max 0.02531285773363981 (**exact**), p99 0.000935, locator self-check 0; knee-class
  410/410 knee-adjacent, 0 wall-band, 0 off-band (matches banked). buildMs 69,208.

**Why forceRefine failed** (a documented negative result, consistent with champion-spec §V11q):
refining a near-tangent multi-curve cell to featureLevel+1 adds triangles but does not resolve the
fan-emission inconsistency — the extra triangle on the shared edge persists. The defect is a
per-cell CDT topology inconsistency, not an under-resolution, so the correct lever is the
topological repair (fan-consistency post-pass), not more density. Both remedies remain in the
kernel behind the default-off option; `forceRefine` is retained as a tested, documented negative.

## Safety (the hard rule)

Default `'off'` is byte-identical to prior behavior, proven at BOTH levels:
- twin `offVerification` hash `f033dbf5-b5f9fb84` = banked baseline at 2,242,987 outer tris;
- existing unit regression `ConformingWall.test.ts` "keeps the budgeted plain-wall artifact
  byte-identical" GREEN with the change in tree.
Full battery: `npm run typecheck` exit 0; MultiCurveCellPolicy + FeatureConformingTriangulator +
ConformingWall + ConformingOuterWall + WatertightAssembly + ConstrainedCellTriangulator suites
74 passed / 1 skipped.

## Impact analysis (recorded per CLAUDE.md rule)

Kernel edits are additive and option-gated (`multiCurveCellPolicy?: 'off'|'forceRefine'|'fanRepair'`,
default `'off'`), threaded `AssemblyWallOptions → ConformingWallOptions →
triangulateQuadtreeWithFeatures`. Actual behavioral risk on the default path is nil by the
byte-identity proof above; the option is exercised only by opt-in callers (the Gyroid arm's twin
injection today; a Phase-2/3 manifest decision for production enablement).

## Phase-1 status after A2

Arm A "reproduced" = A1 (locus fix) ∧ A2 (this). **A2 done.** A1 (reproduce the −67.6% band-edge
row through the region layer) and A3 (pins at scale) remain. When A1 lands, it should enable
`multiCurveCellPolicy: 'fanRepair'` so its watertight gate reads 0, not 3.
