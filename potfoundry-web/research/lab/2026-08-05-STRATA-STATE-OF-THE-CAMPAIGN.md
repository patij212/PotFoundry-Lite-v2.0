# STRATA — STATE OF THE CAMPAIGN, 2026-08-05

**READ THIS BEFORE QUOTING ANY NUMBER FROM THIS PROJECT.** It supersedes the status sections of
`2026-07-29-strata-perf-convergence-worklog.md`. Where they disagree, this wins.

---

## 0. THE ONE PARAGRAPH

For months this campaign optimised against `sagAdaptiveRaw`, the driver's INFINITE-PLANE position
ruler. That ruler **under-reports honest position error by 21× to 1,527×, and OVER-reports it 28–37%
of the time.** No correction factor exists. Every `over-0.01mm` figure ever published here is void —
not scalable, void. Re-measured honestly, the meshes are far from the 0.01 mm bar, the lever that
looked like a 4.37× win is a 2× win by count and a **regression by area and by max**, and a second
defect class — ORIENTATION — was never measured at all. One lever survives honest scoring: a
constrained edge flip, which is free. The binding constraint is now believed to be the mesher's
**vertex representation**, not its refinement rule.

---

## 1. THE RULERS — what to use, what to never use again

| quantity | instrument | status |
|---|---|---|
| **POSITION (H1, mesh→surface)** | `certifyTriangle` (`_facetTruthLib.ts`) at `tol = 0.010` | ***THE bar. Two-sided: `witnessed` = achieved, `bound` = rigorous.*** |
| position, cheap | `sagAdaptiveRaw` / the driver headline | ***BANNED as a verdict.*** 21–1,527× under, 28–37% over. Ranking only. |
| **H2 (surface→mesh)** | `advMeshWideH1.ts` (mis-named; relabelled) | Sound, but **cannot see a facet standing off the wall.** |
| **ORIENTATION** | normal chord `2·sin(θ/2)·diam`; `orientRuler.ts` (11 fixtures, covering-certified) | Sound. `tangExc` is a **DETECTOR** (13–125× selective), **NOT a magnitude** (26× over). |
| shape | `_shapeGuard.aspect3`, `_judgeNormal.facetNormalCensus` | Use these. **Do NOT re-derive them** — `s49BackFacing.ts` did and was unsound. |

**THREE RULES THAT COST US MONTHS:**

1. **NEVER report a bare MAX, and never report COUNT alone.** Facet count over-states defect AREA by
   **13–184×**. Count, area and max routinely disagree in *direction* — the AR-cap sweep improves
   count 2.13×, worsens area 1.13×, and worsens max 1.92×.
2. **A one-sided assertion is satisfied by a degenerate answer.** 11 of the hard gate's 12 bars were
   one-sided; a truncation passed 12/12 while collapsing the perpendicular ruler onto the radial one.
   The gate is now 24 bars (V1–V11 + M1–M11 mutation bars) and fails that change at 22/24.
3. **Diff PRINTED VALUES against a control run. The verdict is the weakest signal in the report.**
   Every instrument defect found this session was found this way, none by a pass/fail.

---

## 2. WHERE THE MESHES ACTUALLY STAND (honest position, `certifyTriangle` @ 10 µm)

| style | driver claims | **honest PROVEN-FAIL** | orientation over-bar |
|---|---|---|---|
| GothicArches 1,142,166 tris | 75 (0.007%) | **~3,265 (0.286%)** | 11.36% by count |
| Voronoi 806,765 | **PASS, 0 of 806,765** | **~84,710 (10.50%)** | 39.7% → **25.7%** corrected |
| LowPolyFacet 137,480 | 0 | **0** ✔ (reverse control) | 10.9% — **not a defect**, 0 of its own 300 worst fail |

*Sampling: golden-stride N=50,000 ≈ 4.38%, identical construction on all 12 meshes, ±1σ stated in the
scorecard. Maxima are LOWER BOUNDS — the honest whole-mesh max has never been computed (11–260
core-hours/mesh).*

**Instrument controls, which is why these supersede everything:** the harness reproduces each
driver's own `over-0.01mm` **exactly on all 12 meshes**; LowPolyFacet is a **reverse control at 0
fails/10,000**; and it agrees with an independently-written second tool to the facet.

---

## 3. THE ONE LEVER THAT WORKS

**The CONSTRAINED FLIP** — `PF_LAND_FLIP`, fork `_strataConformBisectL.test.ts` + `vitest.stratal.config.ts`, DEFAULT OFF.

| GothicArches S39CTL | before | after |
|---|---|---|
| orientation over-bar **by AREA** | 8.131% | **2.179% — 3.73×** |
| honest position on CHANGED facets | 83 fail | **38 — 0.458× count, 0.616× area** (~5σ favourable) |
| inversions θ>90° | 1,506 | 671 |
| topology / vertices moved / tris added | — | **identical / 0 / 0** |
| flag-OFF control STL | — | **byte-identical to S39CTL** |

It is **free** and it improves *both* rulers. Cost: caps ≥150° ×1.66. It also regularises vertex
degree (max 50 → 31). **Only proven on Gothic-class (hub-free) meshes.**

**The CAVITY** (`PF_CB_CAVITY`) is the only arm of twelve that improves honest position on **both**
count and area (0.49× / 0.62×). Its published over-bar of 4 was 401× low. I previously reported it as
"worth zero" on the blind ruler — that was wrong.

---

## 4. REFUTED — do not re-derive these

| claim | verdict | what killed it |
|---|---|---|
| AR-cap 50→90 is a 4.37× fidelity win | **2.13× by count; WORSE by area and 1.92× worse by max** | S85 honest re-baseline |
| "refinement manufactures orientation error at ≈ s/h" | **REFUTED** | a null control: 1.95 over-bar children/parent vs a **1.99 NULL**; and `s/diam` is *anti*-correlated (ρ = −0.438) |
| collapse / re-point / retriangulate fixes MIS-ORIENTED | **ceiling 0.38%** | exact enumeration + a real sequential pass |
| a bigger connectivity search helps | **+3.29%** | exact min-max hexagon-cavity DP |
| density helps orientation | no better than the null | measured against the empty-split control |
| Euclidean `maxAngle` as an objective | **anti-correlated** — crushing it 20.5× made orientation 5.5× worse | two-armed flip test |
| `PF_FT_DESCENT_K=8` (2.53× speedup) | **REFUTED** | clears V3/V7c exactly, silently collapses `distPerp` onto `distRadial` |
| S82's **P4** guarded lift | **cannot be landed** | its fallback needs an **off-surface vertex**; see §5 |
| LowPolyFacet's 10.9% orientation | **not a defect** | 0 of its own 300 worst exceed the honest bar |
| `s49BackFacing.ts` | **unsound, retired** | re-derives `facetNormalCensus` without its July corrections |

---

## 5. THE OBSTRUCTIONS — proven, not suspected

1. ***VORONOI IS CLOSED TO SPLITTING.*** The child altitude needed to cancel the parent's orientation
   error implies a **required child aspect of 3,009** (p90 8.0e11). The triangle that would fix it is
   a needle whose own normal is unbounded.
2. ***EVERY 1-RING OPERATOR IS DEFEATED BY THE SUPER-HUBS.*** 32 Voronoi vertices of degree ≥1000 hold
   5.62% of the whole mesh; worst **2,550** against a **median of 5**. A flip, a collapse, a vertex
   removal and the cavity DP are all 1-ring ops, and the 1-ring of a 2,550-degree vertex is a
   2,550-gon. `fold` fires on 494,895 of 745,470 collapse candidates.
   **It is a REFINEMENT RUNAWAY:** the same junction vertex is degree **37 / 57 / 2,550** at 285,826 /
   671,823 / 806,765 triangles of the same mesher, style, params and flags.
3. ***THE LIFT FOLDS THE MESH AND NO ON-EDGE PLACEMENT CAN FIX IT.*** `liftAt`'s displacement is mostly
   IN-PLANE (dPar/dPerp p50 7.01). **7.415% of children are inverted** (child/parent area 1.01954 — a
   planar 1→2 split conserves area exactly, so that ratio *proves* non-tiling). `MID3D`/`placeAt`
   already corrects the along-edge component, so the residual is **perpendicular to the edge, toward
   the apex** — unreachable by any choice of split point on that edge.
4. ***THE FOLD GUARD HAS ALWAYS BEEN IN THE WRONG SPACE.*** `shapeAdmits` tests `signedAreaParam` on
   (θ,z). Every arm reports `0 on (θ,z) FOLD`; a 3-D test on the same mesh refuses **117,288** splits.

---

## 6. PERFORMANCE — landed and available

| | win | status |
|---|---|---|
| `rA` hoisted twin (`_raFast.ts`) | **2.81–3.17×**, bit-identical, self-verifying + in-flight sampling | **LANDED**. rA was 84% of certificate wall-clock. |
| `distPerp` seed-grid memoisation | **25.4×**, bit-identical seeds | **LANDED** |
| Phase-D certificate vs CPU | **3,230 s vs 8,449 s** for the same bound | available, unused |
| `PF_FT_WORKERS=16` | 1.51× over the default 8, byte-identical | available, unused |

The certificate spends **61× the mesher's evaluation budget** — measurement, not meshing, is where
this project's compute goes.

---

## 7. HOW TO PROCEED

**IMMEDIATE (cheap, unblocks everything)**
1. **Make `certifyTriangle` the reporting ruler for every arm.** A driver "PASS" is not evidence. Add
   it to the arm report or run `s85PosRebase.ts` after each arm.
2. **Withdraw every `over-0.01mm` figure in the worklog.** They cannot be corrected, only discarded.
3. **Land the flip on the remaining styles.** It is free, it improves both rulers, and it has only
   been proven on Gothic.

**NEXT (a bug, not a limit)**
4. **Fix the super-hub runaway.** Degree 2,550 against a median of 5 is a pathology, not a trade-off.
   `PF_CB_MAXDEG` exists (default 0) and makes it *visible*; the emitting site is in the last phase of
   the split loop and has not been located. Fixing it is prerequisite to any Voronoi progress, because
   it is what defeats every local operator.

**THE STRUCTURAL ONE — and this is the honest answer to "why are we stuck"**
5. ***THE VERTEX REPRESENTATION IS THE BINDING CONSTRAINT.*** `addV` derives every position from
   `R(θ,z)`, so a vertex is on the surface **by construction**. Three independent results now point at
   the same place: P4 cannot land because its fallback needs an off-surface vertex; the in-plane fold
   cannot be corrected because on-edge placement is the only freedom the driver has; and Voronoi's
   orientation cannot be fixed by any triangle the driver can express.
   **The design change is to allow a vertex OFF the surface under a bounded position budget** — trade a
   little H1 for orientation and tiling, deliberately and measurably. That is what P4 was, and it is
   what `_facetTruthLib`'s own two-sided certificate makes safe to attempt.
6. **Then, and only then, revisit the operator.** 1→4 refinement halves the circumradius
   deterministically (0.500 at p50 *and* p90) where longest-edge bisection *enlarges* it for >10% of
   Voronoi's children (p90 2.855). Normal error scales with circumradius — arXiv:1911.03424.

**DO NOT**
- Do not tune `PF_CB_SHAPE_AR`, chase density, or build a fan-aware local operator. All three are
  measured dead.
- Do not accept a lever on a headline movement. **The cavity was accepted on a 1.96× that was worth
  zero; the AR cap was accepted on a 4.37× that was 2.13×.** Every lever in the ledger accepted on a
  plane-ruler movement needs re-examining.

---

## 8. LEDGER

**Scorecards** (`research/exchange/_strataConformBisect/`, gitignored): `S85_POSITION_REBASELINE.md`
(authoritative position), `S80_LAND_FINDINGS.md` (the flip), `S81_COLLAPSE_FINDINGS.md` (hubs +
ceiling), `S82_SPLIT_FINDINGS.md` (fold + obstruction), `S62_AUDIT_FINDINGS.md` (instrument audit),
`S50_RULER_FINDINGS.md` (eval budget + blindness). Registry: `research/EXPERIMENT-REGISTRY.md`.

**Gate:** `PF_STRATA_FTV=1 npx vitest run research/bridge/_strataFacetTruthValidate.test.ts
--testTimeout=1800000 --hookTimeout=600000` — 24 bars. **The timeout flags are not optional.**

**Runners:** copy `research/tools/_run-template.sh`; do not `sed` an existing runner (its bundle path
is hardcoded and two agents collided on one, with one executing the other's binary).
