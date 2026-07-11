# Gates-Harness Benchmark — closing the OPEN cost number

**Program:** PROD-TIERC Phase 1, build item 6 (`gates-harness-spec.md` Gap List #6: "add a first real
benchmark run at the charter's own ~3M-tri reference scale — S-effort once the harness exists — today
that number is OPEN everywhere"). This doc closes that OPEN.
**Harness under test:** `research/bridge/tierc_gatesHarness.ts` (`scoreAllGates`, committed `0a693ae9`) —
proven correct only on synthetic fixtures (`tierc_gatesHarness.test.ts`, 18 green). Never edited by this
arm (hard rule).
**Driver (this arm, NEW files only):** `research/bridge/tierc_gatesBench.test.ts` +
`vitest.tierc_bench.config.ts`. Env-gated `PF_TIERC_BENCH=1`.
**Machine/config:** direct `node node_modules/vitest/vitest.mjs run --config vitest.tierc_bench.config.ts
research/bridge/tierc_gatesBench.test.ts -t <style>`, `NODE_OPTIONS=--max-old-space-size=12288`, single
fork, AboveNormal priority bump on both the vitest CLI and fork-child PID immediately after spawn
(CROSS-WORKSTREAM-NOTES.md's documented EcoQoS mitigation — background node children throttle to
~20-25% of one core otherwise).
**Inputs:** real captured production artifacts, `research/exchange/_prod_truth/<style>/{full,outer}.
{xyz,idx}.bin` + `meta.json` (same capture `e2e/_prod_truth_capture.mjs` produced for
E-2026-07-09-PROD-ARTIFACT-TRUTH / E-2026-07-10-PROD-BATCH), loaded via `loadBinMesh`
(`_pf_bvhRuler.ts:383-390`). Style truth `rA` built via `buildRadiusFn` (`runStyle.ts`), same helper
`_prod_truth.test.ts` uses. `tolMm=0.01`, capture dims `H=120, Rb=40, Rt=50, expn=1` (matches
`_prod_truth.test.ts:34` and the TIERC-HEADTOHEAD prereg's pinned common configuration verbatim).
Defaults left untouched (`prescreen: true`, no `g1Brute`/`g2Lattice` overrides) — this is a genuine
production-default-composition benchmark, not a scaled-down probe.

---

## Bench table — wall time per gate stage

| style | shard | outer tris | full tris | G1 forward (prescreen+interior+newton) | G2 reverse (coverage) | G3 watertight | G4 zero-defect | quality | **total** |
|---|---|---|---|---|---|---|---|---|---|
| FourierBloom | 0/1 (unsharded) | 1,278,510 | 3,143,106 | 25.68s | 37.31s | 5.55s | 0.84s | 1.34s | **70.7s** |
| GothicArches | 0/4 | 1,415,270 | 3,128,634 | **KILLED — projected 262-299 min** (see below) | not reached | not reached | not reached | not reached | **not reached** |

FourierBloom's G1=25.68s is essentially pure prescreen cost (45-pt dense-radial lattice over all
1,278,510 outer facets, ~19.8µs/facet) — `survivors=0`, so the expensive `scoreWholeMeshInterior`
GN+brute-confirm stage and the worst-point Newton re-score both ran in ~1ms combined (nothing to score).
G2's 37.31s includes the outer-mesh locator BUILD (flat-CSR over 1,278,510 triangles) plus the full
1024×1024 lattice + 4x local refine + boundary bands + adversarial self-check. G3/G4 scan the FULL mesh
(3,143,106 tris) — G3 runs `nonManRawBig` twice (real + injected-crack control) plus `topologyMetric` +
signed-volume; G4 is `zeroAreaCount` + `triangleQuality3D`. Quality (`triangleQualityDistribution` +
`triangleQuality3D`, unsharded) is the cheapest full-mesh pass at 1.34s.

Full per-stage crumb trail (`research/exchange/tierc/bench_crumbs.ndjson`) for FourierBloom:

| from -> to | wall | what |
|---|---|---|
| start -> prescreen-done | 25.25s | prescreen scan, 1,278,510 outer facets x 45-pt lattice |
| prescreen-done -> newton-done | ~1ms | 0 survivors -> scoreWholeMeshInterior + newtonNearest no-op |
| newton-done -> vertexOnSurf-done | 0.37s | 641,303 outer-vertex radial premise check |
| vertexOnSurf-done -> coverage-done | 37.31s | G2: locator build (1.28M tri) + 1024x1024 lattice + refine + self-check |
| coverage-done -> watertight-done | 5.55s | G3: full mesh (3.14M tri), nonManRawBig x2 + topologyMetric + signed volume |
| watertight-done -> zerodefect-done | 0.84s | G4: full mesh, zeroAreaCount + triangleQuality3D |
| zerodefect-done -> quality-done | 1.34s | quality: full mesh, triangleQualityDistribution + triangleQuality3D |
| **total** | **70.7s** | |

---

## GothicArches — time-gate fired, KILLED, projection reported

**Decision (per mission protocol):** GothicArches' G1 stage projected far beyond the ~40-minute gate
from its own crumb cadence. Per the mission's explicit instruction ("a priced projection beats a burned
hour"), the run was killed rather than allowed to complete, and this section reports the projection plus
the historical cross-check instead of a finished row.

**No-stride gap (why shard 0/4, not the batch's exact basis):** `ScoreAllGatesOpts`
(`tierc_gatesHarness.ts:81-120`) exposes `tolMm`, `shard`/`nShards`, `breadcrumbPath`, `prescreen`,
`runId`, `outputPath`, `g2Lattice`, `g1Brute`, `outerWallSeamTriangles` — there is no `stride` lever
equivalent to `_prod_truth.test.ts`'s `PF_PT_STRIDE`. Per the mission's explicit workaround (and the
hard rule against touching the harness), this run used `PF_PT_SHARD=0`/`PF_PT_NSHARDS=4`: G1's prescreen
stage is NOT sharded (it scans the full 1,415,270-facet outer mesh regardless of shard config), but the
expensive `scoreWholeMeshInterior` confirm stage only processes shard 0's 1/4 slice of survivors, and
`quality` is facet-sharded on the full mesh. This is a genuinely different basis than the batch's
"stride 4, 4-shard **merged**" GothicArches row (program-consolidation.md:784) — that row summed all 4
shards' stride-reduced populations; this run is ONE shard's worth of the full (unstrided) survivor
population, unmerged. Same order of magnitude of scored facets, not the same basis string.

**Live measurement (this run, crumbs at `research/exchange/tierc/bench_crumbs.ndjson`):**

| crumb | at | elapsed since interior-start | done | out | worst mm |
|---|---|---|---|---|---|
| prescreen-done | 12:11:28.308Z | -- | survivors=162,937 total; **mine=40,738** (shard 0/4 slice) | -- | -- |
| interior-start | 12:11:28.311Z | 0s | 0 / 40,738 | -- | -- |
| interior-tick #1 | 12:12:35.348Z | 67.04s | 203 / 40,738 | 184 (90.6%) | 0.1965 |
| interior-tick #2 | 12:14:04.778Z | 156.47s | 406 / 40,738 | 373 (91.9%) | 0.1965 |

Prescreen itself was cheap and unsharded-cost-only (run-start to prescreen-done, same order as
FourierBloom's prescreen: 1,415,270 vs 1,278,510 outer facets, ~11% more) — confirms the prescreen stage
is NOT the bottleneck; the interior GN+brute-confirm stage is.

**Projection, two independent computations from the live ticks:**
- **Cumulative rate** (tick #2 vs true start): 406 facets / 156.47s = 2.595 facets/s (385ms/facet).
  Projected: 40,738 / 2.595 ≈ 15,698s ≈ **261.6 minutes (~4.4 hours)**.
- **Incremental rate** (tick #1 → tick #2 only, the more recent/current cost): 203 facets / 89.43s =
  2.269 facets/s (440ms/facet) — i.e. the run was getting SLOWER, not settling into a steady state.
  Projected: 40,738 / 2.269 ≈ 17,951s ≈ **299.2 minutes (~5.0 hours)**.

Both computations agree within ~15% of each other and both are 6.5-7.5x the 40-minute gate — a
flat-to-worsening trend across two independent measurement windows, not a single noisy sample. This was
sufficient confidence to kill without waiting for a third tick (per the mission: "a priced projection
beats a burned hour").

**Historical cross-check (independent corroboration, not a guess):** the ORIGINAL `_prod_truth.test.ts`
probe (pre-existing, this arm did not run it) has its own completed GothicArches `shard=0/nShards=4` row
in `research/exchange/_prod_truth/scorecard.ndjson` — same style, same shard config, no additional
stride applied at the per-shard level: **`interior.ms=4,569,249` (~76.2 min)** scoring a matching
~40,734-facet slice (162,937 survivors / 4), on this same machine. That run's per-facet rate was
~112ms/facet — 2.9-3.5x cheaper than this arm's live 385-440ms/facet ticks. Both numbers agree on the
conclusion (G1 interior confirm at this scale is a tens-of-minutes-to-hours cost, nowhere near the
40-minute gate); they disagree substantially on the constant, which is itself a finding (see "Instrument
surprises" below) rather than noise to paper over — this arm's honest number is the live 261-299 minute
projection, NOT the historical 76 minutes, since they are not proven to be the same basis.

**Process killed:** vitest CLI PID 11860 and fork-child PID 27096 (both bumped to AboveNormal priority
at spawn) terminated by PID (`taskkill /F /T`) immediately after tick #2 was captured — fork-child
27096 had accumulated 233.5s of actual CPU time at kill (confirms it was genuinely computing throughout,
not stalled; CPU-delta diagnosis per CROSS-WORKSTREAM-NOTES.md, not wall-clock alone). The vitest CLI
(PID 11860) self-terminated within ~4s of its worker's forced exit, logging a clean
"Worker forks emitted error... Worker exited unexpectedly" — the expected, non-buggy signature of an
externally-killed fork, not a crash in this arm's driver code. No GothicArches row was written to
`research/exchange/tierc/gates.ndjson` — per the harness's own design (`appendFileSync` fires once, at
the very end of `scoreAllGates`), a killed run produces no partial/fabricated row, which is the correct,
intended behavior, not a bug. Verified: `gates.ndjson` contains exactly 1 row (FourierBloom) after the
kill; `bench_crumbs.ndjson` contains the full 38-line stage trail for both styles up to the kill point.

---

## Instrument surprises

1. **FourierBloom's G1 stage is prescreen-only cost.** Every one of 1,278,510 outer facets passed the
   45-pt dense-radial upper-bound screen (`survivors=0`) — the expensive GN+brute-confirm stage and the
   worst-point Newton re-score never ran. This is a genuinely stronger clean-bill than "0 outliers after
   scoring" — it means no facet was even AMBIGUOUS enough to need scoring. Consistent with, and slightly
   stronger evidence than, the batch's SHIPPED-CLEAN verdict.
2. **GothicArches' live interior-confirm rate (385-440ms/facet across the two ticks, and worsening) ran
   ~3.4-3.9x slower than the same shard config's historical rate (112ms/facet) in the original
   `_prod_truth.test.ts` probe.** Both this arm's harness
   and the original probe call the identical `scoreWholeMeshInterior` (`_pf_rebaselineRuler.ts`) with
   default GN/brute settings, on the same captured bins, same machine. Candidate explanations (not
   adjudicated by this arm — flagging for whoever picks up the cost number next): (a) this specific
   killed sample (facets 0-406 in survivor-index order, ~91% flagged outlier vs the batch's eventual
   81.9% survivor-outlier rate) may be a locally harder-than-average region of the mesh (the batch's own
   note: "GothicArches control: p99 0.000049 OK — its 11.5% survivors are genuine feature density" —
   density is NOT uniform across the survivor population, so a 406-facet prefix is not guaranteed
   representative of the full 40,738, and the elevated local outlier rate is consistent with elevated
   local brute-confirm frequency, i.e. genuinely more expensive facets, not just instrument variance);
   (b) the harness composes G1 slightly
   differently from the old probe per the file header's own admission ("composes stages slightly
   differently" — mission brief); (c) resource contention from this session's other tool activity during
   the live run (a Vite dev server + several idle MCP node processes were also running, though none were
   CPU-heavy at inspection time). Not resolved here — reported honestly rather than averaged away.
3. **No other disagreements found.** FourierBloom's coverage max (0.003657mm) matches the batch's
   reported 0.0037 to the displayed precision; G3/G4/quality all read clean (0 non-manifold, 0 zero-area,
   0 needles) with a non-vacuity control that DID move (`nonManControlMoved: true`) and a locator
   self-check well under the 1e-9 instrument-hygiene bar (`locatorSelfCheckMaxMm: 0`) — both mandatory
   witnesses passed, so the row is not void per the spec's own definition.

## Gaps found in the harness (reported, NOT patched — hard rule)

- **No `stride` lever.** `ScoreAllGatesOpts` has no equivalent to `_prod_truth.test.ts`'s
  `PF_PT_STRIDE`. For a style at GothicArches' survivor density, this is the difference between a
  tractable benchmark and a multi-hour one — `shard`/`nShards` alone cannot reach the batch's own
  "stride 4, 4-shard merged" cost point without literally running all 4 shards to completion (this arm
  ran only shard 0). Recommend: a `stride` option on `ScoreAllGatesOpts` that's threaded straight through
  to `scoreWholeMeshInterior`'s own `stride` parameter (the underlying function already supports it —
  `_pf_rebaselineRuler.ts`, confirmed by `_prod_truth.test.ts:217-219`'s usage — the harness just doesn't
  expose it), with the row's `g1_forward.basis` string labeled accordingly (same pattern the harness
  already uses for `shard=k/n` suffixing, `tierc_gatesHarness.ts:411`).
- **Prescreen is unsharded by design** (every shard re-scans the full outer mesh) — cheap enough here
  (~25-28s at this scale) not to matter, but worth naming as a real per-shard redundant cost that would
  compound at higher shard counts or larger outer meshes; not a bug, just an unstated cost multiplier
  when choosing `nShards`.
- **No in-harness cost estimate / dry-run mode.** Discovering that a shard will take ~4-5 hours currently
  requires launching it for real and watching crumbs (as this arm did) — there's no cheap pre-flight
  (e.g., "score N random survivors, extrapolate") to warn a caller before they commit a fork to it.

## Files written (this arm)

- `research/bridge/tierc_gatesBench.test.ts` (NEW)
- `vitest.tierc_bench.config.ts` (NEW)
- `research/lab/tierc/gates-harness-bench.md` (NEW, this file)
- `research/exchange/tierc/gates.ndjson` (NEW, 1 row: FourierBloom)
- `research/exchange/tierc/bench_crumbs.ndjson` (NEW, full stage-boundary trail for both styles)

`research/bridge/tierc_gatesHarness.ts` was NOT modified (hard rule). Nothing committed (hard rule).

---

## CORRECTION (2026-07-11, v1.1 follow-up — supersedes the per-facet comparison above)

The "3.4-3.9x slower than the probe (385-440 vs 112 ms/facet)" comparison in this report was a
**stride-denominator misread**: the historical GothicArches shard-0/4 probe row is itself
`stride=4` with `scannedFacets=10,185` (its own basis string says so), giving a true probe rate of
**440.0 ms per SCANNED facet** (4 shards: 448.6/441.1/428.0/442.1). The harness's 385-440 ms/facet
was therefore **0.86-0.98x parity**, not a slowdown. Confirmed dynamically (v1.1 micro-bench, same
shard-0 slice, same process, warmed): probe-equivalent 388.2 vs harness 380.0 ms/scanned-facet
(0.98x), identical 449 outliers, survivor lists elementwise-identical (162,937). The genuine v1.0
gap was the MISSING STRIDE LEVER (the bench ran de-facto stride 1 = legitimately ~4x the probe's
stride-4 wall time). v1.1 adds `opts.stride` (probe-exact survivor-ordinal, interior-only) +
`survivorsIn/survivorsOut` prescreen-once: full-shard projection 258 min -> ~64 min at the batch's
stride-4 basis (probe: 76.2 min). Composition was never at fault.
