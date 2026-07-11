# E-2026-07-11-TIERC-HEADTOHEAD — pre-registration

**Program:** PROD-TIERC Phase 1 (charter `65f85bbe`; Phase-0 specs `a17ee380`; architecture v1
`5120d1f4`; production baseline = E-2026-07-10-PROD-BATCH verdict `9d3933f7`).
**Registered:** 2026-07-11, BEFORE any scored run. Committed by the coordinator session.
**Question:** does ONE region-based Tier-C implementation (orchestration layer over kernels
K1/K2/K3 per architecture v1 §1) reproduce the DragonScales, Gyroid, and Gothic champions while a
smooth control stays clean, watertight, and in budget — all under the composite gates harness?
**Decision rule (user's, charter §6):** all three champions reproduced + control clean ⇒
architecture PROVEN ⇒ Phase 2. Any failure ⇒ mechanism-level diagnosis naming the failed
contract/kernel/service; iterate or KILL that arm with the named mechanism. No silent scope-shrink.

## Common configuration (pinned)

- Dims `H=120, top_od=100, bottom_od=80 (Rt=50, Rb=40), expn=1, spinTurns=0`; DEFAULT style params
  (`{}`) for every arm. tol = 0.01mm. Tree basis recorded per-row (label uncommitted deltas).
- Harness: S-GATES per `tierc/gates-harness-spec.md` §3 — research metrology stack (decision A3),
  row schema §3.3 verbatim, `PF_PT_SHARD/NSHARDS` sharding, `PF_PT_BREADCRUMB` 30s ticks (A10),
  zeroArea floor 1e-12 (A4), weld tolerance stated per-row (default labkit 1e-4), OPEN fields
  written as null/"OPEN" — never fabricated. Non-vacuity witnesses (nonMan control-moved, locator
  self-check <1e-9) mandatory on every row; a row without them is VOID.
- G2 reverse coverage runs for EVERY arm (first time for the Gothic mechanism family).
- Integration seam: the region layer replaces the OUTER-WALL build only, behind a NEW dev flag
  (default OFF); flag-off byte-identity proven by the rebaseline pattern BEFORE any scored arm.
  Inner wall/rim/base/cap/weld = `WatertightAssembly` unchanged.
- Ops: coordinator hosts all runners; per-shard timeout wrappers; stage-aware watchdog at 600s
  against the 30s tick cadence; AboveNormal only; max 4 concurrent heavy forks; direct
  `node node_modules/vitest/vitest.mjs` invocation.

## Baseline rows to beat (production, E-2026-07-10-PROD-BATCH `9d3933f7`)

| style | verdict | forward | Newton-worst | coverage max | basis |
|---|---|---|---|---|---|
| FourierBloom (control) | SHIPPED-CLEAN | 0 over | ≤tol | ≤tol | literal |
| GyroidManifold | REGRESSION | 105,107 literal | 0.0590 | 0.0987 | literal carried (FAST-HONEST-RULER) |
| DragonScales | special-ruler | body 6,158 literal / ring 71,355 @8/16 (6.353%, max 0.0700) | — | wall 72.1% area >tol | V11g composite two-population |
| GothicArches | REGRESSION | 33,345 @stride 4 | 0.3460 (max-across-shards) | **1.2318** (batch-largest) | fresh, merged 4 shards |

## Arms (run order D → A → B → C; each arm's scored run only after its build items land)

**Arm D — smooth control (FourierBloom).** One R-CDT region, zero curves, zero pins, standard
assembly. PASS = every gate green at tol; outer tris within ±5% of production; quality
distribution not worse than production's on p5MinAngle/%<20°; G7 full-pot. FAIL here kills the
orchestration layer itself (null case) — nothing else runs until D passes.

**Arm A — Gyroid.**
- A1 (locus fix through the manifest anatomy provider, decision A7): reproduce
  `champion-spec-gyroid.md` §5.4 — extraction 28,785 pts/~2,045 polylines @stepMm 0.15, placement
  ≤0.001mm; outer 2,242,987 ±5% (+18.5% ±3pp vs 1,892,112 baseline); stratified outliers
  ~31,114 ±15%; Newton-worst 0.024917 (exact if same locus); coverage max 0.0253 ±10%; 100%
  knee-adjacent / 0 off-band / 0 wall-band (any off-band reappearance = the K3 single-midline-trap
  signature ⇒ HALT and reclassify).
- A2 (2-locus CDT fan fix; G4 blocker): nonManRawBig 0 (non-vacuous) on both stepMm configs, TDD
  on the two banked step-invariant loci (u,t)=(0.6448,0.8931),(0.4384,0.4421). Remedy order:
  force-refine multi-curve cells to featureLevel+1 first; fan-consistency post-pass if that fails.
- A3 (pins at scale — S-RESIDUAL; own sub-prereg appended here before it runs): primary design =
  analytic knee pre-seed from `wallIsolevels()` loci (untested; single-pass); fallback =
  worst-sag Newton recovery (§V11aa recipe: knee + 6-ring spread 0.0008, pinInjected). Report
  LITERAL before/after counts. Pre-named redirect: if the residual proves edge-class
  (contour-length-distributed, not isolated spots), A3 KILLs and redirects to a chord-ladder
  lever, priced separately — that outcome is a finding, not a failure of this prereg.
- Arm A "reproduced" = A1 within tolerances AND A2 green. A3 reports its own verdict
  (target: literal every-facet ≤0.01 at outer ≤7.0M tris, per gyroid-spec §5.3(a); if unreachable,
  the priced frontier curve + exact residual classification).

**Arm B — DragonScales.**
- B0 (boundary-contract toy, decision A2 — runs BEFORE B1): one ring at z=60 between two body
  bands; contracts (a) structured transition band, (b) railLines force-registration, (c) reversed
  adoption — tried in that order until one passes: watertight non-vacuous 0, ZERO T-junctions on
  the seam chains, riser serration ≤0.001mm on the embedded ring. If none passes, Arm B KILLs
  with the contract named — the architecture claim for R-STRUCT↔R-CDT adoption fails, and that is
  the finding.
- B1 (full outer wall: 7 R-STRUCT ring bands + 8 R-CDT body bands + standard assembly), scored on
  the V11g composite ruler, two populations never blended: **T1** ring-band ≤3,300 outliers +
  ≤100 C0-straddle tail, max ≤0.05, rate ≤1.0%, wall-coverage-over ≤10% (vs 72.1%); **T4** outer
  ≤4,549,600 tris AND ring-local density (tris per 1mm z-bin at rings) measurably DOWN vs
  production's 130–175k; **T5** nonMan 0 / zeroArea 0 / %<20° <10% / serration ≤0.001mm.
  Report T2 (body ≤6,200), T3 (total ≤10,000), T6 (rim-attachment max ≤0.02 reported separately),
  T7 (generate time, honest) regardless. **DS "reproduced" = T1∧T4∧T5** (ds-spec §5 kill rule).
  The 0.0461 sheet cliff floor is REPORTED as the known frontier — not claimed, not hidden.
- Deviation note (pre-declared): B1's body uses K1 adaptive machinery, NOT the champion's uniform
  sheet (decision A6, measured basis ds-spec §4.7). T1's ring numbers remain the champion's.

**Arm C — Gothic (patch scope, decision A5).**
- C1: region layer dispatches the patch domain to K2; reproduce the CI gate exactly —
  u∈[0,0.125], t∈[0.48,0.52], bgArc 0.6, ruler nTheta 512: outliers 0 (every free facet), max
  ≤0.0101, watertight non-vacuous, tris ≤9,917 / passes ≤7 to match; PLUS the quality report the
  current suite omits (triangleQualityDistribution + needleCount) and G2 coverage on the patch.
- C2 (recommended): 2-bay research build to literal 0 at ≤30,323 tris; %<20° reported against the
  banked 19.0%/minAngle-0° concession. The concession is a REPORTED comparison, not a gate — the
  element-level fix is Phase-2 research (13 levers refuted).
- The 0.117 production-band frontier is explicitly OUT (Phase-3-adjacent; requires un-wired
  flankBand + seam-share). G7 for Arm C = patch-NA, declared here.

## Build items gating the arms (architecture v1 §6)

1→2 (harness: new `research/bridge/tierc_gatesHarness.ts` + TDD; zeroArea canonical local until
labkit quiets; needleCount exposed) → 3 (manifest v1, 4 styles) → 4 (region layer core + dev flag
+ byte-identical-off gate) → 5 (B0 toy) → 6 (A2 fan fix) → 7 (A3 pin plumbing) → arm runs.
Shared-file discipline: labkit.ts / metrics.ts / conforming/* hold other sessions' uncommitted
work — new-file-first; any shared-file edit needs GitNexus impact analysis (index fresh as of
2026-07-11, 49,448 nodes) + constructed-blob staging.

## Honesty rails

Stratified estimates never serve as acceptance bases (literal shard runs for verdicts). Any
config/tolerance change after first scored run = a new labeled arm, never an edit. Every
kill names its mechanism. Control-arm regressions outrank champion wins — a champion "win" that
degrades D is an architecture failure. All rows carry tree-basis labels.
