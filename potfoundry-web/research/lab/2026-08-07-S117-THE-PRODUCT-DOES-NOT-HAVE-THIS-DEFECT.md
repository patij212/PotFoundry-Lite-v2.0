# S117 — THE SHIPPING GENERATOR HAS NO FOLDS. THE CAMPAIGN OPTIMISED A RESEARCH ARTEFACT FOR NINE SESSIONS.

**2026-08-07.** 9 agents, 2.70 M tokens, 0 errors. Roadmap P0–P5 executed.
***This is the decisive session. Read §0 before anything else in the S108–S116 line.***

---

## 0. P0'S ANSWER — AND IT RETIRES THE CAMPAIGN'S CENTRAL PREMISE

***THE SHIPPING CONFORMING GENERATOR EMITS ZERO NEEDLES, ZERO INVERTED FACETS AND ZERO DEGENERACY
POLES.*** Measured on the shipping CelticTriquetra outer wall (6,767,774 facets), three meshes side by
side on ONE instrument at ceiling 163.374°:

| class | **SHIPPING** | driver guard-ON | driver guard-OFF |
|---|---|---|---|
| over-analytic-ceiling | **4 facets / 0.0003%** | 16,198 / 0.2389% | 70,810 / 2.3265% |
| needles (<2 µm alt) | **0 / 0.0000%** | 8,319 / 0.1008% | 64,690 / 2.2069% |
| blades | **0 / 0.0000%** | 24,012 / 0.1504% | 109,057 / 2.3143% |
| inverted | **0 / 0.0000%** | 11 / 0.0011% | 19,543 / 0.9146% |
| degeneracy poles | **0 / 0.0000%** | 3,546 / 0.1655% | 50,510 / 2.2020% |
| MAX dihedral | **164.620°** | 179.980° | 180.000° |

Topology on all three: non-manifold **0**, inconsistent winding **0**.

***THE FOLD/BLADE/NEEDLE CLASS THIS CAMPAIGN HAS CHASED SINCE S108 IS A RESEARCH-DRIVER ARTEFACT. THE
PRODUCT DOES NOT HAVE IT.*** Nine sessions of mechanism-hunting, five refuted operators and three
instrument scars were all spent on a mesh the shipping path never produces.

## 1. BUT PRODUCTION IS WORSE WHERE IT ACTUALLY MATTERS

***The shipping mesh is structurally pristine and positionally far worse:***

| | shipping path | best driver mesh | ratio |
|---|---|---|---|
| **Gothic** over-0.01 mm (perp AREA) | **14.0764%** | 0.030433% | ***462×*** |
| **CelticTriquetra** over-0.01 mm | **8.6140%** | 0.5142% (guard-ON) | **16.8×** |
| CT triangles | 6,767,774 | 1,282,394 | 5.3× MORE |
| Gothic triangles | 1,415,280 | 1,142,166 | 1.24× MORE |

Gothic's shipping wall also covers **4.33% LESS surface area** than the analytic band (excess −4.3292%).

***PRODUCTION'S DISEASE IS SYSTEMATIC UNDER-RESOLUTION — mid-range position and orientation error with no
catastrophic tail. It is the exact mirror image of the driver meshes' profile, and it is a different
engineering problem with a different fix.***

⚠ **And the sizing field mis-allocates by 4.8×**: Gothic (max|grad r| **9.52**, the *harder* surface) got
1.42 M outer facets while CelticTriquetra (max|grad r| **6.84**, easier) got 6.77 M. ***The field gives
fewer triangles to the harder surface.*** That is a bug, and it is the likeliest single cause of §1's
462×.

## 2. ⛔ CORRECTIONS TO MY OWN ROADMAP — I WAS WRONG TWICE ON P2

**P2 as I stated it is wrong on both halves.**

1. ***THE SHIPPING CLAMP IS 0.10 mm, NOT 0.04 mm.*** `ParametricExportComputer.ts:2660` reads
   `Math.min(0.2, Math.max(0.04, profileSag * 2))`. Default profile is `high`
   (`QualityProfiles.ts:27`) with `epsPosMm = 0.05` (`:86`) ⇒ **min(0.2, max(0.04, 0.1)) = 0.1 mm**.
   Per profile: draft 0.2 · standard 0.16 · high **0.1** · ultra 0.06. **The 0.04 is only the floor of a
   `max()` and is unreachable at every shipped quality profile** — it needs `epsPosMm < 0.02`.
2. ***AND `qMinEdge` IS NOT THE 0.001 mm BLOCKER AT ALL.*** Everything below 0.04 is a **measured
   byte-identical no-op**. The real band-limit is ***`DENSE_RES = 256` on the curvature sampler*** — the
   field cannot *see* structure it never samples, so it cannot ask for edges to resolve it.
   (At the value that actually ships, the 0.1 mm clamp *is* live, and it contradicts the code's own
   `CAD_SAG_MM` target — a separate, real defect.)

## 3. ⛔ S116's INVARIANT HEADLINE DID NOT REPRODUCE

Built properly, TDD'd two-sided (**27/27**), re-validated exhaustively:

- the **zero-analytic-eval core reaches 80.40% (Gothic) / 42.34% (CT guard-ON)** of over-ceiling AREA —
  ***not S116's 99.41%***;
- reaching 99.4–99.7% requires term T4 at ***45,276 ns/triangle*** against the core's **144.4 ns**;
- it false-flags ***0.0170%*** of Gothic's real geometry, ***not 0.0000%***.

**S116's headline was overstated and this session's own agent corrected it.**

## 4. P1 IS WIRED — AND IT HAS NOTHING TO CATCH

The invariant is wired into **both** shipping triangulators behind a default-off flag.
***998,184 triangles certified across CelticTriquetra + Gothic: ZERO violations.*** Exactly what §0
predicts.

⚠ **And the site is weaker than the roadmap assumed:** the `emit` closure holds **no 3D positions and no
`rA`**, so ***only 2 of the invariant's 4 terms are computable there at all***. It is **telemetry plus a
refusal gate, not a repair.** Shipped as record-and-count, as instructed, rather than manufacturing a win.

## 5. P4 — APCR WINS ON 2 OF 6 STYLES, AND ITS MECHANISM HYPOTHESIS IS REFUTED

Wins: **GothicArches** and **HexagonalHive** (the latter to a *literal zero*: 4,500 facets / 22.3550 mm²
→ 0 / 0.0000%, MAX 0.040393 → 0.0071422, against a placebo that got 7.9% **more** triangles).

***The pre-registered mechanism hypothesis (H-COVER — "APCR works where the mesh is an exact single cover")
is REFUTED: ArtDeco is a perfect exact single cover with zero inverted facets and APCR fails on it
completely.*** The real boundary is the **degeneracy-pole class**.

⚠ **And two styles' `rA` is genuinely DISCONTINUOUS** — ArtDeco **4.198 mm**, CelticTriquetra **1.638 mm**
— ***which makes the campaign's CEIL fold ruler VACUOUS on them.***

⚠ **Its verifier REFUTED it** on the auto-trigger *"anything made WORSE and not reported"*: harms on three
styles went unreported, a 100× magnitude error suppressed the tool's own VOID clause, two MEASURED-tagged
claims cite evidence files containing only a shell error, and one bar had no baseline comparand. **The two
claimed wins survive; the reporting does not.** Note also that its Gothic figure is quoted as **175×**,
which S116's verifier already showed is a sampled-ruler artefact — ***the honest figure is 50.1×.***

## 6. P5 — THE 45° BAR IS THE LAST ROW OF A REPORTING TABLE

Not a derived threshold. It is ***wrong on all three criteria, in three different directions***:

- **over-selects export defect by 132.7×**
- **under-selects visibility by 39.8×**
- ***the 45–90° band is the LEAST visible band above 0.1°***

**The replacement is three quantities, not one.** ⚠ And the agent's own pixel census was **refuted by its
own control**, because **1% Weber contrast *is* the 8-bit quantum** — a genuinely subtle instrument trap,
caught rather than shipped.

## 7. A REAL PRODUCTION BUG, FOUND AND FIXED

`facetDihedrals` pairs half-edges through a V8 `Map`, which caps at exactly **2²³ = 8,388,608 entries**.
The shipping CelticTriquetra wall needs **10,149,613 interior edges** ⇒ `RangeError` at
`dihedralRuler.ts:113`. (Gothic's 2,122,920 fit — the only reason its half ran.)

Fixed: **`facetDihedralsBig`** — counting-sort CSR, no `Map`. A **byte-for-byte drop-in**: on a
1,282,394-facet mesh the two rulers' 118-line reports differ only in tags, filenames and timestamps.
**6/6 unit tests**, including a 5.78 M-facet grid where the old ruler throws and the new one returns the
closed-form Euler counts.

## 8. WHERE THIS LEAVES THE PROGRAMME

***The "zero folds by construction" goal is already met by the shipping generator*** — measured, not
asserted. The invariant is wired as a permanent regression gate so it stays met.

**The real work is now clearly named, and it is not what the last nine sessions were about:**

1. ***FIX THE SIZING FIELD'S ALLOCATION.*** It gives the harder surface 4.8× fewer triangles. This is the
   prime suspect for Gothic's 462×.
2. ***RAISE `DENSE_RES` FROM 256.*** That, not `qMinEdge`, is what band-limits the curvature sampler and
   blocks 0.001 mm.
3. **Reconcile the 0.1 mm clamp with the code's own `CAD_SAG_MM` target.**
4. **Port APCR's mechanism into the generator** — it wins where the pole class is absent, which is exactly
   where the shipping generator already lives.
5. **Replace the 45° bar with the three derived quantities.**
6. ***Re-baseline every S108–S116 number against a shipping-path mesh, or mark it research-only.***
