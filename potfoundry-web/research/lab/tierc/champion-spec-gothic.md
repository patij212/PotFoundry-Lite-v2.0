# Champion Spec Sheet — GothicArches (Tier-C no-bridge-cusp exemplar)

**Program:** PROD-TIERC, Phase 0 deliverable D0.1 (design only, no code changed by this doc).
**Charter:** `research/lab/2026-07-11-tierc-productionization-charter.md` — evidence table row
"Gothic patch" / "Gothic whole mesh" (lines 82-83), R4 (line 66), R6 (lines 70-71).
**Scope of this doc:** the **perfect-mesher / Tier-C arc** (2026-07-04 → 2026-07-09), i.e. the
work that actually produced the two champion results the charter asks for. There is an OLDER,
superseded classification of Gothic ("steep-EXCLUDE", `E-2026-07-04-GD-GOTHIC` /
`E-2026-07-04-GF-GOTHIC`, `EXPERIMENT-REGISTRY.md:4792-4854`) from the pre-perfect-mesher
CDT-under-M dispatch axis — it is what motivated the 2026-07-04 frontier tournament and is cited
here only as context (§0); it is NOT one of the two champions requested.
**Sibling docs:** `champion-spec-{dragonscales,gyroid}.md` (separate Phase-0 deliverables, not
authored here).

---

## 0. Why Gothic is the no-bridge cusp exemplar (anatomy, 60 seconds)

GothicArches' rib crests are `ridge(t−archZ, w, sharp≥1)` combined with `colEdge`/`mullion`
strapwork (`src/geometry/styles.ts:rOuterGothicArches`). Under the default style parameters the
feature network is a **2D diagonal rib lattice that births/merges** (measured: 96 crest births /
72 merges, `EXPERIMENT-REGISTRY.md:1543`; junction count 163 at `TIER_C_DETECT_OPTS`
coarseRes40/fineRes120, `countUnstable.ts:17`) and the crest itself is a **zero-width knife-edge
C1 cusp** — `flankSpanArc` is exactly 0 on the majority of worst facets (apex angle 23-53°,
apex curvature up to 657/mm; `EXPERIMENT-REGISTRY.md:1517-1560`). This is qualitatively harder
than the campaign's other count-unstable style, GeometricStar, whose chevron cusp is a
**finite-width kink (130-137°)** that plain flat-P1 already rides to tolerance
(`E-…-GEOSTAR-CRESTSTRIP`, cited in `EXPERIMENT-REGISTRY.md:31/57`). Every number below should be
read against that contrast: GeoStar's needle problem is a minority (9% on-crest, 91% off-crest
panel-grading — `2026-07-04-perfect-mesher-spec.md:1158`); Gothic's is the crest itself.

Style parameter envelope (`src/styles/registry.ts:170-193`) — relevant because §4 flags that NONE
of it has ever been swept against the Tier-C kernel: `gaCounts` (arch count, 3-32, default 12),
`gaRelief` (0-5mm, default 1.5), `gaPointiness` (0.25-2.0, default 1.2), `gaDiamond`/`gaX`
(0-1, defaults 0.5/0.0 — these gate entire tracery sub-feature families on/off), `gaSharp`
(cusp sharpness, 1-10, default **4.0** — directly the knife-edge severity), `gaRib`/`gaCol`
(structural widths), `gaSpring`/`gaArchHeight`/`gaBands`/`gaBandW`.

---

## 1. THE CHAMPIONS

### 1(a) Gothic PATCH literal-zero

There are **two distinct mechanisms** that both reach literal patch-scale zero, discovered in
sequence. A fresh implementer needs both, because only the second is what actually ships behind
the flag today.

#### 1(a)-i — the mechanism proof: surface-native no-bridge + arc-length-graded flank (PROXY ONLY, never scaled/ported)

**Experiment:** `E-2026-07-04-RACE-SURFNATIVE` — `EXPERIMENT-REGISTRY.md:4889-4917`; synthesis in
`research/lab/2026-07-04-perfect-mesher-spec.md` §§1-6 (lines 14-234, esp. the winner section
lines 80-113) and `2026-07-04-perfect-mesher-spec.md` Tournament Scorecard row 1 (line 60).
Commit `b1c3e19` (mechanism+probe).

**Patch definition (exact, reproducible — `research/bridge/_pf_race_surfnative.test.ts:30-53`):**
```
DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }         // GothicArches default dims
STYLE = 'GothicArches'                              // default style params ({})
tMid = 0.62                                          // fixed row — the sharpest crest lives here
{uApex, nCrests} = findSharpestCrest(rA, tMid, H=120, R_MEAN=48)
bayDu   = 1 / nCrests
halfDu  = bayDu * 0.55                               // reach ~0.55 bay toward both adjacent valleys
dt      = 0.6 / H = 0.005                            // 0.6mm-tall axial strip
window  = { uApex, halfDu, t0: tMid-dt, t1: tMid+dt, rMean: 48, H: 120 }
```
Measured window geometry: apex curvature 657/mm, relief 0.71mm over ~0.5mm arc, bay
4.19mm-arc (`EXPERIMENT-REGISTRY.md:4895`) — the single hardest Gothic cusp in the default
parameterization.

**Mechanism (`research/bridge/_pf_race_surfnativeLib.ts:buildSurfaceNativeGraded`, lines
208-270) — two levers, BOTH proven necessary and jointly sufficient with flat P1:**
1. **NO-BRIDGE split.** The crest is a single chain of shared mesh edges (`crestIdx`/`crestU`,
   one column shared by both flanks) — two flank facets *meet* at the apex, none straddles it.
2. **Arc-length-graded flank columns** (`placeFlankU`, lines 221-242): for each row `t`, sample
   M=400 points along the straight (u,t) segment from the valley edge to the crest, accumulate
   3D Euclidean arc length `s(u) = Σ|Δxyz|` (x,y from `r=rA(θ,z)`, z=t·H), then place `nFlank−1`
   interior columns at `u` values where `s(u) = (c/nFlank)·s_total` for `c=1..nFlank−1` — i.e.
   literally re-parameterize the flank cross-section by 3D arc length and sample uniformly in
   that parameter, so density concentrates exactly where the flank is near-vertical.

**Terminal numbers (K = crest-row count, nFlank = flank-column count, both doubling per level;
`EXPERIMENT-REGISTRY.md:4901-4909`):**

| level (K/nFlank) | tris (derived*) | A flat-UV outliers/p50/max | B uniform-SN outliers/p50/max | **C graded-SN outliers/p50/max** |
|---|---|---|---|---|
| K1 (12/8)  | 352  | 70/0.087/0.144  | 52/0.068/0.092  | 99/0.047/0.069 |
| K2 (24/16) | 1472 | 225/0.093/0.115 | 184/0.023/0.075 | 116/0.018/0.019 |
| K4 (48/32) | 6016 | 109/0.055/0.110 | 61/0.059/0.064  | **0/0.006/0.006** |

*tri counts are DERIVED from the exact topology (`4·nFlank·(K−1)` per the two-flank
quad-strip in `buildFlank`, lines 243-267) — not separately logged per level in the registry, but
the K4 value (6016) matches the tournament-scorecard's independently-cited figure
(`2026-07-04-perfect-mesher-spec.md:60`) exactly, corroborating the derivation.

**Adversarial re-check (independent re-audit, `EXPERIMENT-REGISTRY.md:4915`):** rebuilt G-K4,
re-scored every triangle with a DENSE 15-pt barycentric stencil (vs the sweep's 4-pt) under the
trusted 4096×600 full-azimuth brute → **nOutliers=0, worst=0.006mm** (identical), `nDegen=0`,
`crestEdgesPresent=47/47` (complete no-bridge chain).

**Honest caveat (load-bearing — do not port without addressing):** this 0-outlier win is
**not sliver-free**: `minAngle 13.8°, %<20°=96.3%` (arc-length grading clusters columns tightly
near the crest). **This proxy was never scaled beyond one cusp and never merged into production
code** — it exists only as a mechanism proof (§3 below explains what actually shipped instead).

#### 1(a)-ii — the shipped mechanism: whole-mesh honest-brute-driven refine (PORTED, live behind the flag today)

**Experiments:** `E-2026-07-05-PERFECT-MESHER-WHOLEMESH-GOTHIC` (`2026-07-04-perfect-mesher-spec.md`
§"VALIDATION 7 — LITERAL PERFECTION", lines 990-1113; commits pre-reg `dce21de`, CONFIRM
`b928169`, full-density `6c8b97f`) **+ its production re-verification**
`E-2026-07-09-REBASELINE20` (`EXPERIMENT-REGISTRY.md:27-66`, `research/exchange/_rebaseline20_final/FINDINGS.md:4`).

**Mechanism — deliberately SIMPLER than 1(a)-i, NOT arc-length column placement:** protected
complex from the FGJ Morse ridge graph (multi-family, planarized to `residualCrossings=0`) +
no-bridge crest split, then a **whole-mesh honest-brute STOP-driven isotropic edge-mode RED 1→4
refine loop** — every outlier facet is split at all three edge midpoints (in-chart, lifted
on-surface); see `noBridgeRefine.ts:19-21` ("Edge-mode RED 1→4 insertion: outlier facets split
at all three edge midpoints… so a persistent apex facet converges geometrically"). The decisive
fix over the prior REFUTE was NOT a better insertion geometry — it was replacing a
blind GN/7-pt STOP driver with the honest 45-pt `denseBary` full-azimuth brute, scored on
**every free facet, never a top-N-worst-gradU population** (that population was proven BLIND:
32 residual Gothic facets / 791 GeoStar facets hid below a top-400 guard,
`2026-07-04-perfect-mesher-spec.md:1004-1025`).

**Terminal numbers, three independently-measured instances of the SAME mechanism at three
domain sizes (all literal whole-mesh 0, all watertight non-vacuous by index):**

| instance | domain | ruler | tris | passes | max (mm) | p99 (mm) |
|---|---|---|---|---|---|---|
| research smoke | 2-bay, 6mm z-band | 512×120 box-refined brute | 16,904 | 7 (4×7pt+3 dense) | 0.00996 | 0.00927 |
| research full-density | 2-bay, 8mm z-band | 1024×120 box-refined brute | 30,323 | 7 | **0.01000** | 0.00824 |
| research 4-bay M-square | 4-bay | — | 58,365 → **projected 1,050,570** full-mesh (<6M) | — | — | — |
| **production-ported smoke** (CI, unconditional) | u[0,0.125]×t[0.48,0.52] | `DEFAULT_RULER` nTheta 512, bgArcMm 0.6 | **9917** | **7** | ≤0.0101 (assert) | — |

The last row is `wholeMesh0Outlier.test.ts:105-117` (`runPatchGate('GothicArches',
{uLo:0,uHi:0.125,tLo:0.48,tHi:0.52}, 0.6, 512)`), the CURRENT production kernel, run
unconditionally in CI (it calls `buildProtectedComplex`/`refineToZeroOutliers` directly, not
through the `__pfPerfectMesher` flag — the KERNEL is continuously tested even though the
DISPATCH is flag-gated off). Re-measured GREEN "this arc" per `EXPERIMENT-REGISTRY.md:31` and
`research/exchange/_rebaseline20_final/FINDINGS.md:4`.

**This is the mechanism that is actually live in `src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine.ts`
today (behind `__pfPerfectMesher` + the styleId allow-list). It is a genuinely different, simpler
instantiation of the same architecture (protected crest + no-bridge + interior-deviation-driven
refine) than 1(a)-i's arc-length column placement — see §2 and §4 for why this distinction is
load-bearing for a re-implementer.**

---

### 1(b) Gothic WHOLE-MESH champion (fidelity achieved; needle/quality concession OPEN)

**Experiments:** `2026-07-04-perfect-mesher-spec.md` §"VALIDATION 7" (lines 990-1113) +
§"VALIDATION 8 — HYBRID/FINAL" (lines 1143-1263, the DEFINITIVE roll-up). Registry rows
`E-2026-07-05-PERFECT-MESHER-WHOLEMESH-GOTHIC`, `E-2026-07-05-PERFECT-MESHER-GEOSTAR-WHOLEMESH`,
`E-2026-07-05-CRESTSTRIP-DIRECT`, `E-2026-07-05-HYBRID-APEX` (pre-reg `4f243f3`, result `a80ef6b`).

**Which number, which ruler:** fidelity = **0 interior outliers** (true-3D deviation >0.01mm),
scored over the **WHOLE MESH, every free facet** (no population cap), by the two-stage
`facetInteriorHonest` ruler (utBound pre-filter → GN screen → full-azimuth
`bruteNearestOnRadialSurface`, 45-pt `denseBary(8)` interior lattice) — `interiorRuler.ts:85-140`,
`DEFAULT_RULER = {preFilter:0.006, gnScreen:0.006, nTheta:1024, nZ:120, zBandMm:3, …}`.

**DEFINITIVE FINAL GATE TABLE** (`2026-07-04-perfect-mesher-spec.md:1173-1189`, honest whole-mesh,
every free facet, no gradU cap):

| gate | GothicArches (zero-width apex) | GeometricStar (finite-width chevron) | status |
|---|---|---|---|
| **FIDELITY** — interior outliers >0.01mm | **0** (max 0.01000, p99 0.00824), 30,323t | **0** (max 0.01, p99 0.00875), 116,889t | LITERAL 0, both |
| **WATERTIGHT** — auditNonManByIndex, non-vacuous | **0** (inj 0→1) | **0** (inj 0→1) | closed, both |
| **MANIFOLD** — across the FGJ junction net | ✓ (familyCount 2, residualCrossings 0) | ✓ (familyCount 2) | closed, both |
| **SLICER-SAFE** — zeroArea faces | **0** (via collapse post-pass, 36→0, welds 77 UV-collinear verts, HOLDS fidelity+watertight) | **0** (native) | closed, both |
| **ELEMENT** | `usedPnAtApex=FALSE` (flat P1) | `usedPnAtApex=FALSE` (flat P1) | flat-P1 suffices |
| **SLIVERS** — %<20° / minAngle | **19.0% / 0°** (whole-mesh edge-mode; M-square variant 56.2%; direct-strip variant 0.4% but 236 fidelity outliers) | **21.7% / 0°** (91% of needles are OFF-crest panel-grading, only 9% on-crest) | **OPEN — the sole concession** |
| tri-count (patch) | 30,323 (2-bay); 4-bay M-square proj. **1.05M** | 116,889 (patch-band) | in-budget at patch scale |
| Tier-A/B byte-identical | — | — | integration, not topology |
| full whole-MESH (>4-bay/full-z) | UNMEASURED | UNMEASURED | integration |

**Quantified needle concession:** best-measured Gothic sliver figure **holding fidelity** is
**19.0% of triangles <20° minimum angle, minAngle=0° exactly** (some triangles are exact-degenerate
in angle though NOT zero-area — zero-area is separately closed to 0 by the collapse post-pass).
This is **density-INVARIANT** (M-square anisotropic spacing only got it to 56.2%, worse) and
classified a **genuine cross-curvature needle defect**, not a ruler artifact: median longest-edge
angle-to-crest is 76.4° (Gothic) — long ACROSS the high-curvature flank, thin ALONG the crest,
the OPPOSITE of anisotropy-appropriate (`E-2026-07-05-PERFECT-MESHER-ANISO-RULER`, cited
`project_perfect_mesher.md` VALIDATION 5). **13 distinct sliver levers refuted**, all holding
fidelity+watertight and all failing to close slivers below ~19-21%: Lawson flips (REOPENED
outliers 0→57), M=g/h² insertion spacing, smooth graded seed, Laplacian-under-M relaxation,
aniso-ruler-escape metric, structured crest-strip ×2 designs (`buildDirectCrestStrip`/
`buildStructStrips`, both REFUTE — see the R6 discussion in §2), degenerate-collapse (doesn't
touch angle), direct-emit strip, GeoStar sub-pitch strip (non-watertight), Gothic hybrid apex
refine (67 outliers reopen), GeoStar hybrid (91% off-crest), and the 13th lever, a scoped
one-sided apex Vlachos-PN element (`E-2026-07-05-GOTHIC-APEXPN`, `EXPERIMENT-REGISTRY.md:850-928`
— NO-OP: needles are a 6-cluster crest-flank BAND not apex rings, and the convex PN element
*overshoots* the concave `pow(sharp)` cusp, ~12× worse true-3D on some facets).
**Root cause (measured, not inferred):** a flat P1 element at the zero-width apex must EITHER
chord the concave cusp (fidelity-forbidden) OR be a needle long-along-crest (angle-forbidden) —
every connectivity/density/placement/flip lever reconnects the same point set and cannot escape
both; closing both needs an ELEMENT change, unproven and currently unbudgeted
(`2026-07-04-perfect-mesher-spec.md:1167-1171`).

**Verdict as recorded:** "(b) FIDELITY-COMPLETE + WATERTIGHT + MANIFOLD + SLICER-SAFE whole-mesh,
both styles, by a FLAT-P1 element — NOT literally complete; SLIVERS is the sole open,
density-invariant, genuine print-quality gate" (`2026-07-04-perfect-mesher-spec.md:1191-1218`).
No formal ACCEPT+DOCUMENT decision on the finite-area-needle concession has been made — it remains
an explicit flag-flip blocker (§1 Production status, below).

---

### Negative anchors (cite both, per the charter)

**R4 — feature-graph completeness alone is necessary, not sufficient.**
`E-2026-07-04-FGJ` — `EXPERIMENT-REGISTRY.md:4858-4880`. The full multi-family Morse
junction-graph mesh (both u-rib and diagonal-t families, junction 0-cells, planarized) fired
**perfectly on every structural gate** — `recovery=100%`, `familyCount=2`, `residualCrossings=0`
— on a real Gothic apex patch (window at u=0.0257, t=0.75, crestAmp 0.712mm). Yet the interior
outlier count was **not** emptied and did not even fall below the flat-UV control: **worst cusp
facet floored at 0.091mm**, flank-pitch-**INVARIANT** (0.251→0.205→0.091 as flank pitch shrinks
3.5×, tracking crest-arc segment pitch, not converging toward 0). Independently re-audited at a
different apex with a denser sampler: 543 outliers, worst 0.1064mm (upheld, not weaker). This is
the exact instance of charter R4 ("~complete edge recovery still left ~0.09mm") — the mechanism
that fixed it (1(a)-i's arc-length-graded flank density) is a DIFFERENT lever (density placement,
not graph completeness); FGJ's own graph machinery was later grafted into it
(`2026-07-04-perfect-mesher-spec.md:97-103`).

**Band frontier 0.117 — the accepted terminal PRODUCTION-SCALE (not patch-scale) figure.**
`E-2026-07-08-TIERC-FLANKBAND` (`EXPERIMENT-REGISTRY.md:309-355`) + `E-2026-07-08-TIERC-TAPERRAIL`
(`EXPERIMENT-REGISTRY.md:276-306`). On the **full-relief multi-bay production domain**
(u≈[0.05,0.15]×t=[0.38,0.62], nTheta 1024 — junction-spanning, NOT the small patch of §1(a)):
after 5 exhausted mechanism families (isotropic/anisotropic/M-square RED refinement, adaptive/
rib-aware seeding, needle-forbidding pickets, refine-lattice dedupe, doubled/laddered flank-band
toe-contour embedding) plus a placement-variant sweep (uniform vs steepness-tapered rails), the
**best achieved is worst=0.117mm / ~124-147 outliers / p99=0.00907mm (<tol) / ~5.0M projected
full-pot tris** — this is a FRONTIER, not literal-0; literal-0 is proven to exceed the 10M cap
under every measured mechanism (`EXPERIMENT-REGISTRY.md:301,350`). **ACCEPTED AS TERMINAL** per
`research/lab/2026-07-09-drive-final-scorecard.md:55-61` (commit `83fe4c36`) and USER DECISION
2026-07-09 (`project_drive001_scorecard.md` line 292-297).

---

### Production status (for contrast)

Gothic (and GeoStar) literal-0 exist in **production `src/` code today at PATCH scale**, flag-gated:

- **Dispatch:** `COUNT_UNSTABLE_STYLES = {GothicArches, GeometricStar}` — an explicit styleId
  allow-list, `src/renderers/webgpu/parametric/conforming/tierC/countUnstable.ts:54-57`. Shipped
  by `E-2026-07-09-DISPATCH-PREDICATE` / spec §V12b (`EXPERIMENT-REGISTRY.md:13-23`, commit
  `990065cd`) — a graph-signal predicate (`countJunctionNodes(graph)>0`) was tried FIRST and
  REFUTED (over-triggered 17/20 styles; Gothic j=163 / GeoStar j=230 sit mid-range among
  smooth-style junction noise up to j=349 — no threshold separates them,
  `countUnstable.ts:9-41`); the allow-list is the shipped interim, general predicate = open
  research.
- **Flag:** `__pfPerfectMesher`, default **OFF** (`tierC/index.ts:130-136`). Flag-off is
  byte-identical to `buildConformingOuterWall` for every style, proven by
  `flagOff.byteIdentical.test.ts` and re-verified for all 20 styles by
  `rebaseline20.test.ts` (env `PF_REBASELINE20=1`).
  Call sites: `src/renderers/webgpu/ParametricExportComputer.ts:54` (import),
  `ParametricExportComputer.ts:2286-2297` (`buildTierCOuterWall(sampler, opts, params.styleId)`
  replacing the former direct `buildConformingOuterWall` call — `styleId` is threaded through
  purely as the dispatch signal).
- **Flip is blocked on TWO named items** (`tierC/index.ts:1-17`, `project_perfect_mesher.md`
  V12b entry):
  1. **Full-pot cdt2d seam-share integration.** `cdt2d` triangulates the full [0,1] u-domain but
     does **not** share vertex indices across the periodic u=0/u=1 seam
     (`tierC/index.ts:84-89` doc comment) — unlike the production quadtree mesher's shared-vertex
     contract. Stitching a Tier-C outer wall to the rest of `WatertightAssembly` (inner wall, rim,
     base, cap) is undesigned integration work, not yet attempted.
  2. **The sliver concession** (§1(b) above) — 13 levers refuted, no formal ACCEPT+DOCUMENT
     decision recorded.

---

## 2. THE RECIPE

### A. Crest/cusp detection + protection

`detectFeatures` (style-agnostic, existing `featureGraph/` detector) → `conditionGraph` (junction
skeleton) → seam-aware continuous-u unwrap to mm → `planarizeMM` (ported from the research-proven
`_pf_planarizeMM.ts`: splits proper crossings + T-junctions, welds near-triple-points, culls
micro-stubs, **iterates to `residualCrossings=0`**). Implementation:
`src/renderers/webgpu/parametric/conforming/tierC/morseComplex.ts:1-49` (`buildProtectedComplex`
→ `ProtectedComplex {vertices, edges, junctions, residualCrossings, recoveryPct, uToMm, tToMm}`).
Detector config, the ONE canonical Tier-C configuration
(`tierC/detectOpts.ts`):
```
TIER_C_DETECT_OPTS = {
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
}
```
`recoveryPct` is a **coverage** metric (% of input constraint samples within `COVER_TOL_MM` of a
planarized constraint), explicitly NOT an arc-length ratio (that conflates overlap-dedup with
loss — `morseComplex.ts:39-44`); ≥99% is the accepted bar.

### B. Doubled/shared flank band geometry — TWO distinct mechanisms, and the R6 contrast

**B1 — no-bridge single shared crest (the §1(a)-i / §1(a)-ii mechanism, what's live).** The crest
is ONE locked chain of shared mesh edges — not doubled. Both flanks meet AT it. This is what
`buildProtectedComplex` + `refineToZeroOutliers` implement in production
(`noBridgeRefine.ts:11-13`: "the ridge is a set of SHARED mesh edges — two flank facets meet AT
the ridge").

**B2 — doubled/shared crest-to-crest flank TOE-contour band (the R6-successor, NOT wired by
default).** `flankBand.ts` extracts the relief-**amplitude-fraction** field
`af(u,t) = (r(u,t) − r̄_panel(t)) / (r_crest(t) − r̄_panel(t))` (0 at the valley/panel floor, 1 at
the rib crest — `flankBand.ts:AmplitudeField`, `buildAmplitudeField` lines 54-90) and embeds
level-set contours of `af` as **DOUBLED** locked constraint chains (marching-squares on
`af − c` + root-polish + `filterByDisp3D` stray filter — mirrors `_gyroidContourLib`'s pattern,
style-agnostic). Because a toe contour is a single level-set curve threading the valley between
two adjacent ribs, it is naturally **shared by both flanks descending toward it** — the
crest-to-crest band the charter's R6 recommends. Wired ONLY as the optional `bandContours`
4th parameter of `buildProtectedComplex(sampler, styleId, graph?, bandContours?)`
(`morseComplex.ts:512-517,688-689`); `index.ts`'s production `buildTierCOuterWall` calls
`buildProtectedComplex(sampler, '', graph)` — **3 args, `bandContours` omitted** — so this
mechanism is byte-identical-off in the shipped path today (proven; only reachable via the
dev-only `_flankBand.test.ts` probe, `PF_FLANKBAND=1`).

**R6 contrast, precisely (`research/lab/2026-07-11-tierc-productionization-charter.md:70-71`):**
the REFUTED "independent crest strips" are `buildDirectCrestStrip`/`buildStructStrips`
(`_pf_crestStripDirectLib.ts`/`_pf_structStripLib.ts`) — a structured quad-strip mesher emitted
PER CREST independently. It closed slivers cleanly on Gothic (0.4% <20°) but REOPENED 236
fidelity outliers (fixed crest-column connectivity bakes in an apex-straddling facet that only a
free cdt2d flip — which the strip forbids — could un-straddle,
`2026-07-04-perfect-mesher-spec.md:1035,1042-1045`); on GeoStar it failed EARLIER and exactly as
R6 predicts — "adjacent narrow per-crest strips place NON-SHARED midline verts… chevron spacing
p50 0.088mm < one square column (0.044mm half-width) ⇒ adjacent strips place DIFFERENT (u,t)
midline verts → **INTERPENETRATE, non-watertight**" (`2026-07-04-perfect-mesher-spec.md:1157-1158`,
`EXPERIMENT-REGISTRY.md:1036`). B2 (doubled toe contours) is the untried-until-2026-07-08
replacement the charter flags as "recommended, NOT yet comprehensively proven" — it IS proven to
lower the Gothic production-band frontier 4×/8× (§1 negative anchor), but it has never been run
on GeoStar, never been checked for the same sub-pitch overlap failure mode B1's sibling hit, and
is not wired into the default dispatch path (see §4).

### C. Arc-length grading function + constants — TWO functions, opposite outcomes

**C1 — per-row 3D arc-length equalization (`buildSurfaceNativeGraded`, the §1(a)-i WINNER;
`_pf_race_surfnativeLib.ts:208-242`).** For row `t`: sample the straight (u,t) segment
valley→crest at M=400 points, accumulate 3D chord length `s(u)`, place columns at
`u : s(u) = (c/nFlank)·s_total`. Constants: `nFlank∈{8,16,32}` paired with `K∈{12,24,48}`
crest rows (each level doubles both). **This function is the source of the "3D arc-length
concentration" language in the charter — it is a per-row, closed-loop CDF inversion, not a
closed-form analytic formula** (it numerically integrates the sampled radius field each call).

**C2 — steepness-weighted cumulative rail placement (`taperedLevels`, the §1 negative-anchor
REGRESSION; `flankBand.ts`, TDD in `taperRail.test.ts`).**
```
S(af) = ∫ |∇r|(af′) · daf′        (integrand weighted against daf, NOT the mm footprint —
                                    af is linear in r by construction, so ∫|dr| would be
                                    trivially uniform; weighting by daf crowds rails where
                                    the radius-per-parameter gradient is high)
rail_k = S⁻¹( k/(nRails+1) · S_total ),  k = 1..nRails
```
On the real Gothic flank this produced `af=[0.186, 0.259, 0.323, 0.380]` — ALL FOUR rails
crowded at the mid-to-upper flank, **zero rails below af 0.186**
(`EXPERIMENT-REGISTRY.md:2687-2691`). **This is the load-bearing counter-intuitive finding for a
re-implementer: "put density where the surface is steepest" is WRONG for Gothic's production
band.** The chord-sag floor lives at the LOW toe (af<0.15, where panel meets flank, `|∇r|` is
LOW, not high) — worst 0.39553mm, **3.4× WORSE** than the winning uniform ladder, because 178/184
residual outliers sit exactly at `af∈[0,0.15]`, the band the steepness-taper starves
(`EXPERIMENT-REGISTRY.md:2700-2704`). The mechanism that actually won at production-band scale is
**uniform** fixed-af rails: `LADDER-4 af{0.03, 0.08, 0.18, 0.40}` (worst 0.117mm, ~140 outliers,
p99 0.00907, ~5.0M tris — `EXPERIMENT-REGISTRY.md:2635`); `LADDER-5` (adding a 5th rail at 0.28)
buys nothing (`EXPERIMENT-REGISTRY.md:2636`); removing the pickets between rails changes nothing
(rails alone forbid the needle, `EXPERIMENT-REGISTRY.md:2637,2643`). **The Gothic flank-band
mechanism table is exhaustively COMPLETE**: DOUBLED(0.396) → LADDER-4(0.117, the plateau) →
LADDER-5(0.117,+cost) → NO-PICKET(0.117) → TAPER-4(0.396, regresses). No rail-placement family
beats uniform LADDER-4.

### D. Refinement driver (measured facet error, the production kernel)

`noBridgeRefine.ts:refineToZeroOutliers` — seeds a metric-Delaunay mesh under the locked
protected complex, then loops while ANY free facet's whole-mesh interior deviation > tol:
- **Default (byte-identical baseline): isotropic edge-mode RED 1→4** — outlier facets split at
  all three edge midpoints, in-chart, lifted on-surface (`noBridgeRefine.ts:19-21`).
- **Opt-in `splitMode:'aniso'`** (`E-2026-07-08-TIERC-ANISO-RED`) — bisect only the single
  sag-dominant edge (`anisoDirection:'edgeSag'` default, or `'longEdge'`); ~half the point growth
  for the same fidelity trajectory, but does not change the production-band PLATEAU (still floors
  >6M, `EXPERIMENT-REGISTRY.md:2012` region / spec lines 1929-2019).
- **`adaptiveSeedPoints`** — sag-driven seed densification, floor pitch default **0.09mm** 3D arc
  (`noBridgeRefine.ts:73`); breaks the CDT-needle re-formation pin but overshoots budget
  (8.3M projected, `EXPERIMENT-REGISTRY.md` §V11h).
- **`dedupeCellMm`** — default **0.004mm** (`DEDUPE_CELL_MM`, `noBridgeRefine.ts:179`); diagnosed
  as a hard insertion-rejection floor at the production-band plateau (~99% of inserted midpoints
  dedupe-rejected, V11s/V11p).
- **`maxConstraintMm`** — default **0.15mm** (`MAX_CONSTRAINT_MM`, `noBridgeRefine.ts:189`); the
  ridge-snapped crest chain densification pitch — a long locked edge floors its adjacent facet at
  `≈L²κ/8` (a 1mm chord on a rib ≈0.4mm, `noBridgeRefine.ts:185` comment; this is the exact
  mechanism the picket/flank-band levers exist to defeat).
- Two-phase cost control: `bulkPasses7pt` cheap 7-pt `BARY_STOP` bulk passes (default 4 in the
  production call) before switching to the expensive dense 45-pt `denseBary(8)` mop-up phase.
- `ribAwareMode: 'mask'|'thetaAvg'` — excludes rib-adjacent seed mass (REFUTED as a
  budget-closer, `EXPERIMENT-REGISTRY.md` §V11k, banked flag-gated).

`buildTierCOuterWall`'s actual production call (`tierC/index.ts:173-184`):
```ts
refineToZeroOutliers(sampler, complex, {uLo:0,uHi:1,tLo:0,tHi:1},
  { tolMm: 0.01, maxPass: 16, bulkPasses7pt: 4, bgArcMm: 0.35, ruler: DEFAULT_RULER });
```
— note NO `splitMode`, `adaptiveSeed`, `ribAwareMode`, `dedupeCellMm` override, and NO
`bandContours` on the complex: **the shipped default is the plain isotropic kernel**, not any of
the escalation levers that produced the 0.117 production-band frontier.

### E. Acceptance guard + ruler config

MANDATORY whole-mesh guard, never a top-N population (banked mandate,
`2026-07-04-perfect-mesher-spec.md:1261-1262`): `scoreWholeMesh`/`assertWholeMeshZero`
(`interiorRuler.ts:444-472`) scores **every free facet** with `denseBary(8)` = 45-pt barycentric
lattice (`interiorRuler.ts:99-106`), via the two-stage `facetInteriorHonest` ruler
(same-(u,t) pre-filter <0.006mm → GN screen <0.006mm → full-azimuth or θ-windowed
`bruteNearestOnRadialSurface`, `DEFAULT_RULER` nTheta 1024/nZ 120/zBandMm 3,
`interiorRuler.ts:134-140`). The θ-window (`thetaWindowRad`, valid only for single-valued radial
surfaces like Gothic/GeoStar ribs) is a ~15× speed-up that can only OVERSTATE, never understate
(`interiorRuler.ts:122-128`) — the loop driver uses it, the final guard runs full-azimuth.

### F. Degenerate-face collapse post-pass

`collapseDegenerate.ts:collapseDegenerateFaces` — welds UV-collinear coincident vertices,
verified to HOLD 0-outlier fidelity + watertight while driving `zeroAreaFaces` to 0 (Gothic
36→0, welding 77 coincident verts). Wired as the mandatory final step of
`buildTierCOuterWall` (`tierC/index.ts:191-194`).

---

## 3. EXISTING CODE ARTIFACTS

### Production (`src/renderers/webgpu/parametric/conforming/tierC/`) — live, flag-gated

| file | role | status |
|---|---|---|
| `index.ts` | `buildTierCOuterWall` entry, `isPerfectMesherEnabled` flag reader | LIVE — the only symbol callers use |
| `countUnstable.ts` | `COUNT_UNSTABLE_STYLES` allow-list, `isCountUnstableStyle`, `countJunctionNodes` (diagnostic only) | LIVE (V12b) |
| `detectOpts.ts` | `TIER_C_DETECT_OPTS` canonical detector config | LIVE |
| `morseComplex.ts` | `buildProtectedComplex` (Morse graph→planarizeMM→PSLG), `PicketSpec`, `BandContour` | LIVE; `bandContours`/pickets present but NOT called with any by `index.ts` |
| `interiorRuler.ts` | `DEFAULT_RULER`, `denseBary`, `facetInteriorHonest`, `scoreWholeMesh`, `assertWholeMeshZero`, `radialSurfaceFromSampler` | LIVE |
| `noBridgeRefine.ts` | `refineToZeroOutliers` (+ parallel variant), `seedFromComplex`, `adaptiveSeedPoints` | LIVE; aniso/adaptiveSeed/ribAware/dedupe overrides present but unused by the default call |
| `flankBand.ts` | `buildAmplitudeField`, `marchAmpFrac`, `extractToeBand`, `extractLadder`, `taperedLevels` | **BUILT, TESTED, NOT WIRED** — imported only by `_flankBand.test.ts`; production byte-identical-off by construction |
| `collapseDegenerate.ts` | `collapseDegenerateFaces`, `countZeroAreaFaces` | LIVE, mandatory final pass |
| `parallelScorer.ts` + `_parallelScorerWorker.ts` | worker-pool whole-mesh scorer (2.94× quiet) | dev/test-only by design — deliberately NOT re-exported from the barrel (pulling `node:worker_threads` into the browser bundle broke WebGPU boot once, `index.ts:55-65`) |
| `wholeMesh0Outlier.test.ts` | the PATCH-scale literal-0 gate (smoke unconditional + `PF_TIERC_WHOLEMESH=1` full gate) | LIVE, CI-run |
| `rebaseline20.test.ts` | 20-style byte-identical + dispatch-selects-exactly-2 gate | LIVE (`PF_REBASELINE20=1`); does **not** assert or report sliver stats despite the back-port plan's Task 6 promising a report (gap, §4) |
| `countUnstable.test.ts`, `morseComplex.test.ts`, `flagOff.byteIdentical.test.ts`, `anisoSplit.test.ts`, `dirtyCache.test.ts`, `taperRail.test.ts`, `collapseDegenerate.test.ts`, `thetaWindow.test.ts` | fast-suite unit/TDD guards | LIVE, GREEN |
| `_junction*.test.ts`, `_topology*.test.ts`, `_ribAware*.test.ts`, `_aniso*.test.ts`, `_dispatch*.test.ts`, `_geostar*.test.ts`, `_parallel*.test.ts` (underscore-prefixed) | dev diagnostic/history probes, env-gated | present, historical — not part of the fast CI suite |

Call sites outside `tierC/`: `src/renderers/webgpu/ParametricExportComputer.ts:54` (import),
`:2286-2297` (the outer-wall build call, `params.styleId` threaded as the dispatch signal);
`src/renderers/webgpu/parametric/conforming/index.ts` re-exports the tierC barrel. **No other
production file references Tier-C** — confirmed by search (`grep -r tierC src/`); in particular
`WatertightAssembly.ts`/`ConformingWall.ts` (the inner-wall/rim/base/seam assembly) are
untouched, which is the concrete shape of the "seam-share" gap (§4).

### Lab (`research/bridge/`) — read-only historical artifacts, `src/` imports none of them

| file | role | status |
|---|---|---|
| `_pf_race_surfnativeLib.ts` + `_pf_race_surfnative*.test.ts` (4 probes: race/probe/diag/verify/time) | §1(a)-i proxy mechanism (`buildSurfaceNativeGraded`) | on disk, PROXY ONLY — never scaled beyond one cusp, never ported |
| `_pf_race_fgjunction.test.ts` | the R4 negative anchor (FGJ) | on disk |
| `_pf_perfectMesherBruteLib.ts` | `refineInteriorBruteWhole`, `acceptanceGuardWhole` — the SOURCE the back-port plan ported into `noBridgeRefine.ts`/`interiorRuler.ts` | on disk, superseded by the port (kept as the documented source-of-truth per the plan's Global Constraints) |
| `_pf_perfectMesherMsquareLib.ts` | the M-square (metric-aware spacing) sliver lever | REFUTED, banked |
| `_pf_crestStripDirectLib.ts`, `_pf_structStripLib.ts` | the R6-refuted independent-crest-strip mechanism | REFUTED, banked |
| `_pf_hybridApexLib.ts` | strip+localized-apex-refine hybrid | REFUTED (12th sliver lever) |
| `_pf_anisoRulerLib.ts` | M-metric anisotropic quality re-scoring | used to PROVE the sliver defect is genuine (not a ruler artifact) |
| `_pf_perfect_gothic_wholemesh.test.ts`, `_pf_perfect_geostar_wholemesh.test.ts` | the §1(a)-ii / §1(b) research-scale runs | on disk, the numbers cited in §1 come from these |
| `_gyroidContourLib.ts` | the marching-squares pattern `flankBand.ts` mirrors | on disk, cross-style reused pattern |

### Plans / specs

- `docs/superpowers/plans/2026-07-05-perfect-mesher-backport.md` — the 6-task back-port plan
  (Tasks 1-6 all CODE-COMPLETE per the memory ledger; `git log` commits `d38150a, 20c9023,
  d53aa7d, 5d8d1ce, 258c6f5, 233a25b`). **Self-review note in the plan itself (line 213):** "the
  ported algorithms are proven at PATCH scale… if Task 6 surfaces a full-scale regression, that
  is a new finding to escalate" — full-pot was never attempted, consistent with §4.
- `research/lab/2026-07-04-perfect-mesher-spec.md` — the primary source-of-truth synthesis
  (2947 lines, §1-§6 architecture + 12 numbered VALIDATION rounds + the V10-V12b Tier-C
  production arc).
- `research/lab/2026-07-09-drive-final-scorecard.md` — the terminal 20-style scorecard (commit
  `83fe4c36`), Gothic rows at lines 24 and 55-61.

---

## 4. GAPS NOT CLOSED

1. **Needle/quality closure.** 13 levers refuted; best-holding-fidelity figure is 19.0% <20°/
   minAngle 0° (Gothic, 2-bay research build). **This has never been re-measured on the
   PRODUCTION-PORTED kernel's output** — `wholeMesh0Outlier.test.ts` and `rebaseline20.test.ts`
   assert fidelity + watertight only; no file in `tierC/` calls `triangleQualityDistribution` or
   computes %<20°/minAngle (confirmed by search — 0 hits for `minAngle`/`pctBelow20` outside
   comments). The back-port plan's Task 6 Step 3 explicitly promised "record the measured
   20-style table + the sliver concession" as a report — `rebaseline20.test.ts` does not do this.
   No formal ACCEPT+DOCUMENT decision exists for the finite-area-needle concession.

2. **Seam-share blocker (detail).** `cdt2d` triangulates the full `[0,1]` u-domain per patch but
   does not deduplicate/share vertex indices at the periodic u=0/u=1 seam
   (`tierC/index.ts:84-89`). `rebaseline20.test.ts:56-62` states plainly: full-pot Tier-C emission
   is "documented INTEGRATION scope… a full-pot literal-0 assertion is unreachable AND
   intractable — asserting it would hang the gate." No code exists anywhere that stitches a
   Tier-C outer wall into `WatertightAssembly`'s inner-wall/rim/base/cap seam contract.

3. **Whole-mesh budget — and a sharper gap than "it's expensive".** The production full-relief
   band's own literal-0 residual is priced at **>10M tris** (`2026-07-09-drive-final-scorecard.md:85`,
   "Optional literal-0 residuals if ever re-funded: Gothic band >10M"). Full-pot (u wrapped ×
   full z) emission has **never been run at all** — `rebaseline20.test.ts` docstring estimates
   ~50× the patch-gate's facets and a superlinear whole-mesh brute scorer cost, "a multi-DAY
   single-thread grind." **Sharper gap:** the 0.117 frontier mechanism (`flankBand.ts`
   doubled-toe-contour embedding, §2 B2) that beats the plain-kernel 0.469 baseline by 4× is
   **not wired into `buildTierCOuterWall`'s default call** (§2 D, confirmed by reading the exact
   call site). Flipping `__pfPerfectMesher` on today would NOT reproduce the accepted 0.117
   figure at full-pot scale — it would reproduce the WORSE, un-embedded 0.469 baseline (or hang,
   per gap #2). Porting `flankBand.ts` into the default path is unstarted work, not a re-run.

4. **Parameter envelope (arch count / geometry changes — birth/death of cusps).** EVERY Tier-C
   test — production and research — calls `styleSampler('GothicArches', {}, {H:120,Rt:50,Rb:40})`
   with an **empty** style-parameter override object (confirmed: 10/10 production call sites
   grepped use `{}`). The 96-births/72-merges junction topology, the 657/mm apex curvature, and
   the 163-junction dispatch-diagnostic count are all specific to `gaCounts=12, gaSharp=4.0,
   gaDiamond=0.5, gaX=0.0` (the style's registered defaults, `src/styles/registry.ts:178-190`).
   Nothing in the campaign varies `gaCounts` (3-32 arches), `gaSharp` (1-10 cusp sharpness — the
   literal knife-edge severity), or `gaDiamond`/`gaX` (which gate entire tracery sub-feature
   families on/off, i.e. change the birth/death graph's structure outright). Whether the
   Morse-graph extraction + no-bridge split + refine mechanism is robust across this envelope is
   **completely unmeasured**.

5. **Coverage (reverse), charter gate G2.** Every ruler used anywhere in the Gothic Tier-C
   campaign (`denseBary`/45-pt interior sampler, θ-windowed brute, Newton in the sibling styles)
   queries **FROM the mesh TO the analytic truth** (forward: does every facet interior stay
   within tol of the true surface). **No experiment queries FROM dense truth samples TO the
   mesh** (reverse: does the mesh have under-sampled holes a forward-only ruler cannot see).
   Labkit has no purpose-built reverse-coverage instrument either — `narrowChannelCoverage`
   (`research/bridge/featureLocalizedFidelity.ts:423`) measures channel width, not surface
   coverage, and `buildRefLocator` (`research/bridge/_sharp3dRef.ts:193`) is a point-location BVH
   that every campaign use queries in the forward direction. G2 is fully OPEN for Gothic.

---

## 5. REPRODUCE-TARGETS (for the Phase-1 prereg)

**Recommendation: Phase 1 should target the PATCH scope (§1(a)-ii), not the whole-mesh/
production-band scope.** Rationale: (a) patch scope is the ONLY Gothic number that is actually
LIVE in the current production kernel today, not a research-only proxy — reproducing it in the
new region-based mesher is a like-for-like head-to-head against real shipped code; (b) it is
cheap (~6 min per the rebaseline note, vs. the production band's multi-hour/multi-day
single-thread grind); (c) the whole-mesh/production-band scope requires FIRST porting an
un-shipped mechanism (`flankBand.ts`, gap #3) and resolving or explicitly deferring the
seam-share integration (gap #2) before a full-pot mesh can even be ASSEMBLED — that is Phase 3
scope per the charter's own phase plan (§6, "Phase 3 — production integration: Seam-share
resolution"), not a Phase 1 head-to-head input.

### Primary target — patch scope, "reproduced" = exact gate match

Reproduce `wholeMesh0Outlier.test.ts`'s unconditional smoke gate on the new mesher:
- **Domain:** GothicArches, default style params, `DIMS={H:120, Rt:50, Rb:40}`,
  chart window `u∈[0, 0.125], t∈[0.48, 0.52]`.
- **Config:** `tolMm=0.01, bgArcMm=0.6`, ruler `nTheta=512` (both loop-driver and final guard, per
  the smoke call).
- **"Reproduced" means, simultaneously:** (1) `scoreWholeMesh` outliers **== 0** over every free
  facet (no population cap) at `maxMm ≤ 0.0101`; (2) watertight by index, non-vacuous
  (`nonManifoldByIndex(tris) == 0`, and injecting a duplicate triangle on an existing edge must
  move the count above 0); (3) **report** (not gate, per the current production suite's own gap)
  tri-count and `triangleQualityDistribution` minAngle/%<20° for comparison against the banked
  19.0%/0° figure — closing this reporting gap is itself in scope for whoever runs Phase 1, since
  the existing suite doesn't do it (gap #1).
- **Reference tri-count to beat/match:** **9917 triangles in 7 refine passes**
  (`research/exchange/_rebaseline20_final/FINDINGS.md:4`).

### Secondary target — carry the quality gate forward (optional but recommended)

Also reproduce the larger 2-bay research build (`u,t` spanning 2 arch bays, 8mm z-band) to a
literal 0 at **30,323 tris, max 0.01000mm, p99 0.00824mm**, AND report %<20°/minAngle against the
**19.0% / 0°** banked figure — this is the only way a new region-based mesher's sliver behavior
can be honestly compared to the old kernel's documented (if unresolved) concession, since the
production smoke domain is too small to be a meaningful sliver-quality sample.

### Stretch target — production full-relief band (name it explicitly as NOT primary)

If Phase 1 elects to also attempt the production-band frontier: domain `u∈[0,0.1], t∈[0.38,0.62]`,
`nTheta=1024`, "reproduced" = **worst ≤0.117mm, p99 ≤0.00907mm (<tol), ~124-147 outliers,
projected full-pot ≤~5.0M tris**, watertight non-vacuous — NOT literal 0 (proven unreachable
≤10M by 5 exhausted mechanism families, §1 negative anchor). Matching this number requires the
new mesher to implement the equivalent of B2 (doubled toe-contour flank-band embedding, uniform
uniform-af rail placement per §2 C2 — NOT steepness-tapered, which regresses 3.4×) — i.e. it is a
genuinely harder, currently-unported target, and per the charter's own phase plan belongs after
Phase 3's seam-share resolution, not in the Phase-1 three-champion head-to-head.

---

## Sources (primary)

- `research/lab/2026-07-11-tierc-productionization-charter.md` (this program's charter)
- `research/lab/2026-07-04-perfect-mesher-spec.md` (2947 lines — architecture §1-6, VALIDATION 1-9, V10-V12b)
- `research/lab/2026-07-09-drive-final-scorecard.md` (terminal 20-style scorecard, commit `83fe4c36`)
- `research/EXPERIMENT-REGISTRY.md` lines 13-66 (V12/V12b), 276-355 (flank-band/taperrail),
  850-928 (13th sliver lever), 1312-1666 (early Gothic history), 4858-4917 (FGJ + RACE-SURFNATIVE)
- `docs/superpowers/plans/2026-07-05-perfect-mesher-backport.md` (the 6-task back-port plan)
- `~/.claude/.../memory/project_perfect_mesher.md`, `project_drive001_scorecard.md` (session memory ledgers)
- Production code: `src/renderers/webgpu/parametric/conforming/tierC/**`,
  `src/renderers/webgpu/ParametricExportComputer.ts:54,2286-2297`, `src/styles/registry.ts:170-193`
- `agents_journal.md` (root, 6387 lines): searched — **no entries cover the perfect-mesher/Tier-C
  arc** (all 35 "Gothic" hits predate 2026-06-05 and concern the legacy CDT/quadtree pipeline);
  the Tier-C arc's record lives entirely in `research/lab/*.md` + `EXPERIMENT-REGISTRY.md` +
  session memory, not the journal.
