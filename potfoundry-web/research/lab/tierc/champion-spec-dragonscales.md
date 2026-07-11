# DragonScales Champion Spec — Doubled-Ring Embedding + Structured Sheet Density

**Program:** PROD-TIERC, Phase 0, deliverable D0.1 (one of three: `champion-spec-{dragonscales,gyroid,gothic}.md`).
Charter: `research/lab/2026-07-11-tierc-productionization-charter.md`. **Status: design document,
read-only research survey — no code changed to produce this.**

**Purpose.** Let a fresh implementer rebuild the DragonScales (DS) lab champion — the doubled-ring
outer-wall construction plus its scoring instrument — inside the new region-based Tier-C mesher,
without re-reading the ~30 lab probes that produced it. Every number below is cited to a specific
file/line or a committed doc; where a claim could not be nailed to a citation it is marked **OPEN**.

---

## 0. Quick-reference constants (the whole recipe in one table)

| constant | value | source |
|---|---|---|
| `dsScaleRows` (ring count basis) | 8 → **7 interior rings** at `t=k/8, k=1..7` | `src/geometry/types.ts:673` (`DEFAULT_DRAGON_SCALES`) |
| Ring z's (H=120 capture) | 15, 30, 45, 60, 75, 90, 105 mm | `dragonRings()`, below |
| Ring jump magnitude | **0.88–1.21mm** (θ-dependent, 0.0007–1.21mm across θ; the 0.88–1.21 figures are θ-MAXIMA of a scalloped edge) | `research/lab/2026-07-04-perfect-mesher-spec.md:2084-2090`; `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md:323-326` |
| `zEps` / `WALLEPS` (mesh row offset = ruler wall offset, MUST match — "aligned") | `5e-4` mm | `research/bridge/_pf_dszdensity.test.ts:68`; `research/bridge/_ds_prodtruth_lib.ts:50` |
| `nTheta` (θ columns, global, fixed) | **2400** — do **not** raise (see §2.5 θ-trap) | `research/bridge/_pf_dszdensity.test.ts:190` |
| `treadCap` / tread sub-ring count | **4** (span-adaptive, "square-sized") | `research/bridge/_pf_dszdensity.test.ts:76,190` |
| `nZband` (sheet z-density per inter-ring band) | **110** = the recommended champion operating point (4.09M tris) | `research/lab/2026-07-04-perfect-mesher-spec.md:2179-2180` |
| Ruler: radial-sheet twin | `2048θ × 3072z` | `research/bridge/_ds_prodtruth_lib.ts:47` (`RAD_TWIN`) |
| Ruler: riser wall-only reference | `4096θ`, `wallEps=5e-4` | `research/bridge/_ds_prodtruth_lib.ts:51` (`WALL_NTHETA`) |
| Ruler: composite z-gate half-width | `wallZBand=3.0mm` | `research/bridge/_ds_conformRef.ts:142` |
| Tolerance | 0.01mm (project standard) | throughout |

---

## 1. THE CHAMPION

### 1.1 The mechanism, precisely

DragonScales is the project's **z-riser style**: `rOuterDragonScales` computes a brick-staggered
scale pattern whose stagger offset **flips at every integer `rowPhase = t·scaleRows`**
(`src/geometry/styles.ts:1009-1016`), producing a genuine radius **discontinuity** (not a fold, not
a fillet) at 7 interior heights. This was independently established as the *only* true z-riser
among the four "step-looking" styles (`research/EXPERIMENT-REGISTRY.md:3854-3857`,
E-2026-07-02-BREADTH STEP-0): GeometricStar/BambooSegments/LowPolyFacet have no z-step.

A discontinuity like this **cannot be represented by any single-valued `(u,t) → r(θ,z)` grid** —
at a ring z, the true surface needs *two* radii, not one. Two production-adjacent mechanisms both
fail for exactly this structural reason, which is why DS needed a purpose-built primitive instead
of reusing either:

- The generic UV feature-conforming lever (`buildFeatureConformingMeshB`/`__pfConforming*`) is
  **measured to HURT DS** (true-3D p99 0.039→0.052mm, `research/EXPERIMENT-REGISTRY.md:2573`,
  `2600`) — it lives entirely inside the single-valued (u,t) chart and can only move where a line
  sits in that chart, never add a second radius. `research/LAB-CHEATSHEET.md:61-62` bakes this in:
  *"EXCLUDE — risers (ArtDeco/GeometricStar/DragonScales): true-3D already CAD-grade; radial
  overstates; conforming HURTS."*
- Production's own crease-pinning primitive, `CreaseTWarp` (see §3.1), pins **one** dyadic mesh row
  exactly onto each ring z. One row still samples `r(θ, t=k/8)` at a **single** radius — this is
  the charter's **R3 "single feature centreline"** anti-pattern verbatim
  (`research/lab/2026-07-11-tierc-productionization-charter.md:63-64`).

**The champion mechanism instead changes the *mesh representation* itself**, dropping out of the
single-valued (u,t) chart entirely for a native structured θ×z builder
(`research/bridge/_sharp3dMesh.ts`, header comment lines 1-11): at each ring, **emit two rings of
vertices at the same z** (one at `z_k − zEps` sampling the radius just *below* the jump, one at
`z_k + zEps` sampling just *above*), connected by an explicit near-vertical **tread strip** of its
own triangles. This is the charter's **P2 "protect both sides of a steep transition, never a single
centreline"** principle, realized concretely. Between rings, the sheet is a plain uniform θ×z
grid whose z-density (**`nZband`**, rows per open inter-ring band) is the one free density knob —
this is the "structured sheet-direction density between rings" of the mission brief. See §2 for
the exact row schedule and connectivity.

### 1.2 The ruler DS needs, and why (the "V11g composite two-population ruler")

Two whole-mesh instruments were tried first and **both refuted** before the champion ruler was
built (`research/lab/2026-07-04-perfect-mesher-spec.md:2058-2101`, spec §V11f):

1. **The plain radial twin** `S(θ,z) = (rA·cosθ, rA·sinθ, z)` is one-sided-safe and exact on the
   smooth sheet, but **tread-blind** — a single radius per (θ,z) cannot represent a step, so ~141k
   genuinely-designed riser facets score as "outliers" that are pure ruler artifact.
2. **The filled-annulus step twin** (`buildStepReference`, `research/bridge/_sharp3dRef.ts:56-131`)
   represents the tread but **FAILS 1b** (its own on-surface residual 0.0116mm > tol inflates
   smooth-body verdicts, 71 deep-body disagreers) **and FAILS 1d decisively** (a filled disk at the
   ring z catches an off-surface probe pushed radially outward, understating distance by up to
   0.116mm — it can **hide a genuine mesh gap**).

The surviving instrument — call it **the §V11g composite ruler** — is the first (of three tried) to
pass the full 1a–1d metrologist battery
(`research/EXPERIMENT-REGISTRY.md:780`, `research/lab/2026-07-04-perfect-mesher-spec.md:2151`):

```
composite(x,y,z) = min( sheetLoc.dist(x,y,z), wallLoc.dist(x,y,z) )   [wallLoc consulted only when z is within wallZBand of a ring]
  sheetLoc = BVH over the DENSE radial twin (2048θ × 3072z)                      — "population A: the sheet"
  wallLoc  = BVH over a TINY open riser-wall-only reference                       — "population B: the riser wall"
             (per ring: a skirt-below ring at z_k−wallEps + a skirt-above ring at
              z_k+wallEps, joined by ONE near-vertical quad-strip per θ — NO
              interior radial fill, so it can never reach past the true wall to
              catch an off-wall probe)
```

Implementation: `compositeLocator` in `research/bridge/_ds_conformRef.ts:142-150`; the wall-only
reference builder is `buildWallOnlyReference` (`_ds_conformRef.ts:108-128`); anchor/1c points are
`riserWallPoints` (`_ds_conformRef.ts:156-173`).

**This is the "two-population ruler" the mission refers to, at two levels — both load-bearing:**

- **Construction-level populations** (what the ruler is *made of*): the union of two disjoint
  reference surfaces — the smooth sheet (population A) and the riser wall (population B). Distance
  to the union is exact and cheap because a z-gate (§1.1's `wallZBand=3.0mm`) skips the sparse wall
  BVH whenever a query point cannot possibly be nearer the wall than the sheet
  (`_ds_conformRef.ts:130-141`, proof of exactness inline).
- **Scoring-level populations** (what you *report*): every consumer of this ruler classifies each
  scored facet into **body** (away from any ring) vs **ring-band/lip** (near a ring) and reports
  the two counts **separately, never blended** — this is a hard, pre-registered requirement in
  every DS arm (e.g. `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md:72-73`: *"The deliverable is
  this two-population verdict, cleanly separated — not a single blended number."*). Two different
  classifiers exist for this, and **they are not the same code**:
  - On the **research mesh** (row-structured, built by the champion's own `buildRows`), membership
    is *exact*: `facetClassifier` reads each vertex's `RowSpec.kind`
    (`research/bridge/_pf_dszdensity.test.ts:150-159`) — a facet touching any `ringBelow`/
    `ringAbove`/`tread` row is `'lip'`, else `'sheet'`.
  - On an **unstructured production artifact** (no row metadata survives export), membership is
    *geometric*: a facet is `'ringBand'` iff its centroid z lies within `bandMm` of some ring z
    (`classifyRingBand`, `research/bridge/_ds_prodtruth_lib.ts:118-131`); `bandMm` is swept
    {0.5,1.0,1.5,2.5}mm as a robustness/sensitivity check, not tuned post-hoc.

**Why DS needs precisely this ruler** (not the general true-3D instruments used everywhere else in
the lab): every other style's true-3D ruler assumes single-valued `r(θ,z)`. DS's designed geometry
violates that assumption at 7 loci by construction — any single-valued ruler is either blind there
(radial twin) or must fake the second value with a shape that can overreach (filled disk). The
composite ruler is the only one of three tried whose riser component is **open** (zero interior
fill) and therefore structurally cannot hide a gap while still representing the tread.

### 1.3 Terminal champion numbers (the RESEARCH mesh — outer wall only, no caps)

Ladder measured under the validated, ALIGNED (`wallEps=5e-4`) composite ruler, on the doubled-rings
mesh (`buildStructuredWall` + `buildRows` + `dragonRings`, `nTheta=2400`, `treadCap=4`,
H120/Rt50/Rb40/expn1, DEFAULT DS params). Two independent measurement passes agree to <0.1%
(stride-8 in the ruler-validation arm, stride-4 in the follow-up):

| nZband | tris | sheet-out | lip-out | **TOTAL** | max mm | p99 mm | %<20° | rawNonMan | zeroArea | source |
|---|---|---|---|---|---|---|---|---|---|---|
| 70 | 2.69M | 6,680 | 1,904 | **8,584** | 0.0461 | 0.0057 | 3.1 | 0 | 0 | spec §V11g, `perfect-mesher-spec.md:2179` |
| **110 (champion op. point)** | **4.09M** | 5,552 (5,580*) | 3,200 (3,164*) | **8,752 (8,744*)** | **0.0461** | **0.0043** | **2.0** | 0 | 0 | spec §V11g/§V11x, `perfect-mesher-spec.md:2180`, `EXPERIMENT-REGISTRY.md:172` |
| 160 | 5.88M | 5,104 | 2,272 | **7,376** | 0.0461 | 0.0032 | 1.4 | 0 | 0 | spec §V11x, `EXPERIMENT-REGISTRY.md:173` |
| 220 | 8.04M | 5,020 | 1,192 | **6,212** | 0.0461 | 0.0025 | **8.1** | 0 | 0 | spec §V11x, `EXPERIMENT-REGISTRY.md:174` |

*(\* = independent stride-4 re-measurement, `EXPERIMENT-REGISTRY.md:172`, agrees with the
stride-8 figure to <0.1%.)*

Watertight boundary edges `bd=4800` at every density = `2 open rings (z=0,z=H) × nTheta(2400)` —
this is the mesh's own **designed open top/bottom** (it is an outer-wall-only standalone mesh, see
§4.2), not a defect. Riser construction quality: on-surface anchor residual (1a) **0.00029mm**;
riser **serration ≈0.001mm** (feature-locus → nearest-mesh-edge distance — the ring IS a literal
mesh-edge chain by construction) (`perfect-mesher-spec.md:2165`, `2192`).

**IMPORTANT — this floor is *characterized*, not merely where measurement stopped.** A later,
more rigorous round (spec **§V11x**, `research/EXPERIMENT-REGISTRY.md:150-196`,
E-2026-07-08-DS-FINAL) explicitly **REFUTES** the earlier, more optimistic "density-responsive,
will reach 0 with more z" framing of §V11g/§V11l:

- Raising `nZband` 110→220 (doubling tris to 8.04M) only shaves the **sheet** 5,580→5,020
  (**−10% for +97% tris**); the fitted power-law exponent flattened to **−0.37**, projecting
  **literal-0 needs ≈nZband 5000 ≈ 180M tris** — infeasible (`EXPERIMENT-REGISTRY.md:176`).
- **Doubling `nTheta` (2400→4800) makes the sheet WORSE**: 5,580→**9,876** outliers @ 8.18M tris
  (`EXPERIMENT-REGISTRY.md:178`). This proves the sheet residual is **not** a smooth chord-sag that
  density closes — it is a **relief-chord CLIFF**: finer θ resolves *more* of the θ-periodic
  dragon-scale bump geometry into facets that each still straddle a steep bump, so the count grows
  with resolution (the same signature as Gyroid/Voronoi/CelticKnot's excluded classes,
  `EXPERIMENT-REGISTRY.md:178`, citing §V11b/§V11r-3).
- The **max is frozen at 0.0461mm across every density and every axis tested** — one single
  worst C0-straddle facet, completely density-invariant (`EXPERIMENT-REGISTRY.md:176,187`).
- A θ-only densify of *just* the near-ring rows (an attempt to close the lip on a "different axis"
  than the refuted z-refinement) asymptotes the lip toward ~1,900 but **destroys quality**: %<20°
  explodes 2.0%→7.5%→**26.3%** (fails the <10% gate) and introduces 7–8 zero-area slivers from
  mixed-column-count merge strips (`EXPERIMENT-REGISTRY.md:180-187`).
- **`nZband=110` is explicitly the best-quality operating point** — V11x's own words:
  *"nZ220 shaves the count but degrades %<20 and doubles tris for a −29% count that never reaches
  0"* (`EXPERIMENT-REGISTRY.md:192`).

**Verdict, verbatim (`EXPERIMENT-REGISTRY.md:167,194`): "CLOSED-with-adjudicated-cliff-floor
(fidelity-vs-budget FRONTIER)"** — DragonScales is a **density-invariant relief-cliff class on the
body scale-relief AND the near-ring riser**, the *same class the settled feature-conforming map
assigns weave/braid/lattice styles to EXCLUDE* (`EXPERIMENT-REGISTRY.md:194`). The p99 is CAD-grade
(0.0025–0.0057mm) at every density tested — 99%+ of every facet is comfortably under tol; the
"outlier" population is a <1% tail, and only ~90 facets ever reach the frozen 0.0461mm max.

**Read this as: the champion mechanism's genuine, reproducible win is the RING/RISER treatment**
(the doubled-row/tread-strip construction crushes what would otherwise be a ~141k-facet tread-blind
catastrophe down to a tightly z-banded 3,164–3,200-facet population, [0.2,0.6mm] of a ring, plus a
<90-facet C0-straddle tail). **The SHEET's ~5,552–5,580-facet relief-chord-cliff population is a
separate, still-open problem** the champion mesh does not close — see §4.6.

### 1.4 Current production regression numbers (for contrast)

The production capture is `E-2026-07-09-PROD-ARTIFACT-TRUTH` (real WebGPU, `ParametricExportComputer`
default 'high' conforming path, H120/Rt50/Rb40/expn1/spin0, DEFAULT DS params): full 8,734,682 tris /
outer 4,549,600 tris. That pilot **captured** the artifact but explicitly **stopped without scoring
DS** — the single-valued forward ruler ran 130 CPU-minutes at stride 4 with no completion and was
recorded as an **INSTRUMENT-TRACTABILITY finding**, deferred
(`research/EXPERIMENT-REGISTRY.md:5916`). The actual honest numbers — the "~17x regression, 96% at
rings" the mission cites — were produced by the **follow-up** arm that ported the §V11g ruler to
this exact captured artifact: `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md` (verdict commit
`91449c35`, pre-reg `7f83ae4b`):

| population | scanned | outliers | rate | max mm | p99 mm | basis |
|---|---|---|---|---|---|---|
| **BODY** (literal, every facet) | 2,302,975 | **6,158** | 0.267% | **0.158197** | ≈0.0046 | top-10 worst ALL at t≈0.999 rim-attachment row — a boundary class, not mid-body |
| **RING-BAND** (8/16 shard, no prefilter, =50% of outer facets) | 1,123,128 | **71,355** | **6.353%** | **0.070044** | 0.0180 | scaled est. ≈142,710 of 2,246,625 ring facets |
| **WHOLE ARTIFACT** | 4,549,600 | **≈148,900** | **≈3.3%** | 0.158 (rim) / 0.070 (riser) | — | body+ring-band, `E-2026-07-10-DS-PRODTRUTH-prereg.md:275` |

Source: `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md:267-278` (headline), `:339-343` (forward
table). **Ratio vs the champion floor (8,752): ≈17.01×** (`:368`, matches the mission's "~17x"
exactly). **Ring share of the regression: 142,710/148,900 ≈ 95.8%** (matches "96%" — this IS the
source row). **Magnitude ratio on the riser specifically is only 1.52×** (0.0700 vs 0.0461) — *the
regression is almost entirely a COUNT blowup, not a magnitude blowup* (`:370`). **The body alone
(6,158) is 0.70× the champion's whole floor — CONSISTENT-to-better**, i.e. production's existing
adaptive body meshing is *not* the problem (`:371`) — see §4.7.

Reverse (truth→mesh) witnesses, same doc (`:351-362`): sheet coverage max 0.0403/p99 0.0016mm
(0.27% over); sheet **rim-attachment boundary bands** max 0.1241/p99 0.1179mm (this is the *same*
rim-attachment class as the forward BODY tail — see §4.2); **wall coverage** (does the artifact
even *contain* the designed cliff) max **0.0703mm** everywhere sampled, but **72.1% of the true
riser wall sits >0.01mm from the nearest artifact facet** — the riser is genuinely under-resolved
across most of its true area, even though no point is ever catastrophically far.

**Ring density-waste mechanism** (why production is *not* triangle-starved at the ring, yet still
regresses — the exact rows the mission asks for):

> *"the production conforming mesher packs z-rows at ~0.029mm pitch at the rings — a measured
> **6–8× local triangle-density spike** (130–175k tris per 1mm-z-bin at rings vs 20–25k baseline;
> ring-adjacent verts: 77,351 within ±0.3mm of ring 1)"*
> — `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md:319-322`

> *"MEASURED OPPORTUNITIES (ranked): (1) DS ring density waste 6–8× at 8.73M tris/18.5min — ring
> embedding fixes fidelity AND cost"*
> — `research/lab/2026-07-10-program-consolidation.md:55` (also manifest row `:17`)

Mechanism: production's `CreaseTWarp` pins **one** dyadic row per ring exactly onto `t=k/8`
(§3.1); the surrounding curvature-adaptive quadtree then reacts to the (structurally invalid,
single-valued) chord-sag signal at that crease by refining locally *very* hard — 6–8× the baseline
local density — without ever being *able* to close the error, because no amount of one-sided
refinement can represent a two-sided jump. This is the concrete, measured instance of charter
principle **R3**: a single centreline forces bridging (here: an over-refined, still-wrong ramp)
rather than closing it. The **byte-identical carry-over check** in the all-20 batch
(`research/lab/E-2026-07-10-PROD-BATCH-prereg.md:492-508`, sha1-identical bins) confirms this is the
artifact's genuine, still-current geometry — not a stale capture — and the live drain's scorecard
(`research/exchange/_prod_batch/all20_scorecard.md:12`, gitignored data, read 2026-07-11) reproduces
the same ring 71,355/0.070044 figures verbatim.

### 1.5 Existing visual evidence

An earlier (pre-§V11g) packaged snapshot exists on disk: `research/exchange/_best20/heatmap/
DragonScales.png` (+ `.xyz/.idx/.col.bin`), built by `research/bridge/_pkg_drings.test.ts:213-242`
at a *different* config (`nTheta=2100`, `nZband=50`, plus a 4-row near-ring "lip-refine" band —
`buildDragonRows`, `_pkg_drings.test.ts:306-...`) and scored with a **hybrid** radial+BVH metric
(`metricHybridKind`, `_pkg_drings.test.ts:59-80`) rather than the later-validated composite ruler.
Its meta (`research/exchange/_best20/heatmap/DragonScales.meta.json`): 2,083,200 tris, worst
0.2189mm, p99 0.00616mm, 0.43% over 0.01mm. **Use this only for a qualitative look at the doubled-
ring wall's shape** (gitignored data, not re-generated for this survey per the no-heavy-compute
constraint) — the §1.3 table is the numerically authoritative champion figure.

---

## 2. THE RECIPE

Two *separate* constructions share the same `dragonRings()` ring locator: (A) the **mesh** you
triangulate and ship, and (B) the **ruler** you score it with. Do not conflate them — B is a
scoring oracle only, never emitted as geometry.

### 2.1 Style ground truth (read-only source of truth — do not re-derive)

- `src/geometry/styles.ts:990-1041` — `rOuterDragonScales(theta, z, r0, H, opts)`. Ring mechanism:
  `rowPhase = t·scaleRows; row = floor(rowPhase); staggerOffset = (trunc(row)%2===1) ?
  0.5·TAU/scalesPerRow : 0` (line 1009-1016) — the stagger flips at every integer `rowPhase`.
- `src/geometry/types.ts:285-293` (`DragonScalesParams`) and `:672-680` (`DEFAULT_DRAGON_SCALES`):
  `dsScaleRows=8, dsScalesPerRow=16, dsScaleDepth=0.12, dsOverlap=0.5, dsCurvature=1.5,
  dsRandomize=0.1, dsHeightGradient=1.2`.

### 2.2 Ring locator formula

```ts
// research/bridge/_ds_prodtruth_lib.ts:73-80 (the production-facing, analytically re-derived form —
// preferred over the many test-local copies, see the provenance note below)
function dragonRings(scaleRows = 8): StepRing[] {
  const rings: StepRing[] = [];
  for (let k = 1; k < scaleRows; k++) {
    const t = k / scaleRows;
    rings.push({ z: t * H, t, up: false });
  }
  return rings;   // 7 rings at H120: z = 15,30,45,60,75,90,105
}
```

`k=0` and `k=scaleRows` are the pot's own top/bottom boundary rings, **not** interior discontinuities
— excluded by the `k=1..scaleRows-1` range. **Provenance note:** this exact function body was first
written in the 2026-07-04 `_cu_dslip_close.test.ts` arm and has since been copy-pasted verbatim into
~15 subsequent probes (grep `research/bridge -l "function dragonRings"` finds them all) — treat
`_ds_prodtruth_lib.ts`'s parameterized version (only one taking `scaleRows` as an argument, and the
only one importable rather than test-local) as canonical for new code.

### 2.3 The doubled-ring row schedule (the mesh side)

`buildRows` (`research/bridge/_pf_dszdensity.test.ts:66-84`, identical logic reused everywhere the
champion mesh is rebuilt) emits an ordered list of `RowSpec` (type at
`research/bridge/_sharp3dMesh.ts:17-31`):

```ts
function buildRows(rA, rings: StepRing[], nTh: number, nZband: number, treadCap: number): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a,b) => a.z - b.z);
  rows.push({ z: 0, rz: zEps, thetas: evenThetas(nTh), kind: 'sheet' });   // bottom boundary
  let cursor = 0;
  const nearRing = (z) => sorted.some(rg => Math.abs(z - rg.z) < 0.6 + 1e-6);   // 0.6mm skip-band
  const pushSheetBand = (z0, z1, n) => {                                   // UNIFORM sheet density
    for (let i = 1; i < n; i++) {
      const z = z0 + (z1 - z0) * (i / n);
      if (nearRing(z)) continue;                                          // near-ring rows come from the ring block below
      rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' });
    }
  };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);                                // sheet up to the ring
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut);
    const span = Math.abs(rOut - rIn);                                    // representative jump size (θ=0 sample — see §4.5 caveat)
    const rMean = 0.5 * (rIn + rOut);
    const arc = (TAU * rMean) / nTh;                                      // θ-column arc length at the ring
    const treadSub = Math.max(2, Math.min(treadCap, Math.round(span / Math.max(arc, 1e-4)) + 1)); // SQUARE-sized sub-rings
    rows.push({ z: ring.z, rz: rzIn,  thetas: evenThetas(nTh), kind: 'ringBelow' });   // DOUBLED RING, side 1
    for (let s = 1; s < treadSub; s++)
      rows.push({ z: ring.z, rz: ring.z, thetas: evenThetas(nTh), kind: 'tread',
                  treadBlend: { s: s/treadSub, rzInner: rzIn, rzOuter: rzOut } });      // interior tread sub-rows
    rows.push({ z: ring.z, rz: rzOut, thetas: evenThetas(nTh), kind: 'ringAbove' });    // DOUBLED RING, side 2
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: evenThetas(nTh), kind: 'sheet' });           // top boundary
  return rows;
}
```

**The doubled-ring offset** is exactly `zEps = 5e-4mm`: two rows share the *same* mesh z
(`ring.z`) but sample the radius one-sided (`rz = ring.z ∓ zEps`), so `ringBelow` gets the radius
just before the jump and `ringAbove` gets it just after — this is what makes the tread strip
between them a **first-class, non-degenerate** band of triangles rather than a zero-height crack.
**The sheet-direction density** is the single free parameter `nZband`: it is applied **uniformly,
per open inter-ring band** (there are `scaleRows=8` such bands at defaults — before ring 1, between
each pair of rings, and after ring 7 — each ~`H/scaleRows=15mm` long at the pinned dims, so
`nZband=110` gives a nominal z-pitch of **≈0.136mm** within a band; this is a discrete row-count
knob, not a continuously graded density function). A `0.6mm` half-band around every ring is
excluded from the plain sheet fill (`nearRing`) because that z-range is populated by the
ring/tread rows instead. **The tread sub-row count** (`treadSub`) is span-adaptive
("square-sized", `E-2026-07-03-GAP-TREADSQ`, `research/EXPERIMENT-REGISTRY.md:4328-4392`): it
picks enough interior tread rows that each tread quad is roughly as wide (radially) as it is tall
(θ-arc-wise), capped at `treadCap=4`, floored at 2.

### 2.4 Connectivity rule (mesh emission)

`buildStructuredWall` (`research/bridge/_sharp3dMesh.ts:77-118`) strip-triangulates every
consecutive row pair. Because `buildRows` gives **every** row (sheet/ringBelow/tread/ringAbove) the
*same* `nTh` θ-sample count, DS always takes the **equal-count path** (never the general
merge-strip `stripBetween`, `_sharp3dMesh.ts:50-74`, which exists for other styles' θ-varying
rows):

```ts
// equal-count path, _sharp3dMesh.ts:98-112 — per θ-quad between two adjacent rows:
for (let c = 0; c < n; c++) {
  const a = top[c], an = top[c+1], b = bot[c], bn = bot[c+1];
  // choose the SHORTER 3D diagonal (cheap Delaunay-like flip at build time, avoids shear slivers)
  if (d2(a, bn) <= d2(an, b)) { emit(a,b,bn); emit(a,bn,an); }
  else                        { emit(a,b,an); emit(an,b,bn); }
}
```

Every ring z is therefore a **literal chain of mesh edges** by construction (both `ringBelow` and
`ringAbove` are full-width rows), which is what makes the riser **zero-serration** — there is no
approximation step between "the crease locus" and "an actual mesh edge", unlike the pinned-single-
row `CreaseTWarp` approach (§3.1).

### 2.5 The θ-density trap (do not raise `nTheta` to fix anything)

`nTheta` is a **global, fixed** resolution (2400 at the validated operating point) — it is never
swept as a density lever for DS. When it *was* tried (doubling to 4800 at fixed `nZband=110`), the
sheet population got **worse**, not better (5,580→9,876 outliers, §1.3) — raising θ-resolution
resolves *more* dragon-scale bump geometry into facets that still chord the same steep bumps. If a
region-based mesher's generic sizing field wants to drive θ-density up on DS's sheet region because
it sees high curvature there, this recipe says: **don't** — that curvature is the designed texture,
not a mesh defect, and pushing density into it is the refuted §V11x lever.

### 2.6 The ruler side (rebuild this separately — never emit it as geometry)

```ts
// research/bridge/_ds_prodtruth_lib.ts:84-91 — buildConformRuler (production-facing form)
function buildConformRuler(rA): RefLocator {
  const radTwin  = buildRadialTwin(rA, H, 2048, 3072);           // RAD_TWIN
  const sheetLoc = buildRefLocator(radTwin, RAD_CELL);           // RAD_CELL = max(0.35, 4·circumference/2048)
  const dr       = dragonRings();
  const wallRef  = buildWallOnlyReference(rA, dr, 4096, 0.0005); // WALL_NTHETA, WALLEPS
  const wallLoc  = buildRefLocator(wallRef, 0.3);                // WALL_CELL
  return compositeLocator(sheetLoc, wallLoc, dr.map(r => r.z));  // wallZBand default 3.0mm
}
```

Reused/read-only pieces: `buildRadialTwin`/`loadBinMesh` (`research/bridge/_pf_bvhRuler.ts`),
`buildRefLocator` (spatial-hash BVH, `research/bridge/_sharp3dRef.ts:193-275` — flat CSR buckets +
expanding-shell query, `bruteDist` fallback for self-checks), `buildWallOnlyReference` /
`compositeLocator` / `riserWallPoints` (`research/bridge/_ds_conformRef.ts`, full listing above in
§1.2). The **locator self-check** (`loc.dist` vs `loc.bruteDist`, must agree to ≤1e-9mm,
`research/bridge/_ds_prodtruth_lib.ts:301-313`) is mandatory hygiene before trusting any score from
a freshly-built locator.

**Scoring functions to reuse verbatim** (`research/bridge/_ds_prodtruth_lib.ts:168-245`):
`scoreBodyFacets` (sound radial-bound prefilter — a facet whose dense-45 radial bound is entirely
`≤0.7·tol` is green-proven and skips the BVH, exact-equivalent by construction since the composite
ruler's sheet component *is* the radial surface) and `scoreRingBandFacets` (**no** prefilter — the
radial bound is structurally unsound at the riser, so every ring-band facet is dense-scored
unconditionally). Reverse-direction (truth→mesh coverage): `sheetCoverage` / `wallCoverage`
(`_ds_prodtruth_lib.ts:317-358`) plus `oneSidedRA` (`:255-269`, evaluates the correct one-sided
radius when a coverage sample lands within `wallEps` of a ring, since `rA` is ill-defined exactly
at the jump).

### 2.7 File + experiment index (everything cited above, one place)

| artifact | path | role |
|---|---|---|
| mesh builder (rows→triangles) | `research/bridge/_sharp3dMesh.ts` | `buildStructuredWall`, `RowSpec`, `BuiltMesh`, `evenThetas` |
| DS row schedule (mesh side) | `research/bridge/_pf_dszdensity.test.ts:66-159` | `buildRows`, `dragonRings` (local copy), `facetClassifier` |
| step/skirt reference primitives | `research/bridge/_sharp3dRef.ts` | `StepRing`, `RefMesh`, `RefLocator`, `buildRefLocator`, `buildStepReference` (superseded ruler, kept for the hybrid "best20" metric) |
| composite ruler (V11g) | `research/bridge/_ds_conformRef.ts` | `buildConformingReference` (abandoned, BVH-stalled), `buildWallOnlyReference`, `compositeLocator`, `riserWallPoints` |
| production-facing port | `research/bridge/_ds_prodtruth_lib.ts` | `dragonRings` (canonical), `buildConformRuler`, `classifyRingBand`, `scoreBodyFacets`/`scoreRingBandFacets`, `sheetCoverage`/`wallCoverage` |
| production-artifact scoring probe | `research/bridge/_ds_prodtruth.test.ts` | orchestrates battery/FWD/REV/kill-guard units |
| best-20 packaged snapshot (older config) | `research/bridge/_pkg_drings.test.ts:213-242,306-...` | `buildDragonRows` (lip-refine variant), `metricHybridKind` |
| ruler validation (spec §V11g) | `research/lab/2026-07-04-perfect-mesher-spec.md:2151-2196`; registry `research/EXPERIMENT-REGISTRY.md:764-812` | 1a-1d battery, 8,752-outlier floor |
| initial floor characterization (§V11l) | `perfect-mesher-spec.md:2104-2148`; registry `:584-624` | transition-row lever REFUTED |
| **corrected/terminal floor (§V11x)** | `perfect-mesher-spec.md` header at registry `research/EXPERIMENT-REGISTRY.md:150-196` | relief-chord-cliff mechanism, θ-trap, best-op-point verdict |
| z-density origin arm (§V11c ARM1) | `perfect-mesher-spec.md:2020-2037`; registry `E-2026-07-08-DRAGONSCALES-ZDENSITY` (`:5440-5477`) | first density sweep, tread-blind lip discovery |
| step-twin refutation (§V11f) | `perfect-mesher-spec.md:2058-2101`; registry `E-2026-07-08-DS-STEPTWIN-CLOSE` (`:5477-...`) | material 0.046mm→1mm correction |
| production port + regression numbers | `research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md` (commits `7f83ae4b` pre-reg, `91449c35` verdict) | §1.4 of this doc |
| per-style manifest / density-waste citation | `research/lab/2026-07-10-program-consolidation.md:17,55` | manifest row + ranked opportunity #1 |
| tread sliver lever (SQUARE treadSub) | registry `E-2026-07-03-GAP-TREADSQ` (`:4328-4392`) | origin of `treadCap`/`treadSub` formula |
| original DS-is-a-riser discovery | registry `E-2026-07-02-BREADTH` (`:3850-3862`) | rules out GeoStar/Bamboo/LowPoly as step styles |

---

## 3. EXISTING CODE ARTIFACTS

**Headline: none of §2's mechanism is in `src/`.** Every doubled-ring/composite-ruler artifact
lives in `research/bridge/`. Production has a *different, structurally incompatible* mechanism for
DS's rings (a single-row crease pin), described below so the region-based mesher doesn't
accidentally reuse it as if it were a step toward the champion.

### 3.1 What production has today (wrong mechanism class, but real and wired)

- **`extractDragonScales`** (`src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts:366-382`,
  documented at `:54-57`): emits `scaleRows-1 = 7` **horizontal** `FeatureLine`s at `t=k/scaleRows`
  — i.e. it already knows about the exact same 7 ring loci `dragonRings()` computes. But each is a
  **single** `t=const` polyline (`horizontalLine`, not a doubled pair) — "the per-scale vertical
  edges are STAGGERED per row… not emitted" per its own docstring.
- **`extractAnalyticFeatures`** (`FeatureLineGraph.ts:953`) dispatches to `extractDragonScales` by
  `styleId` and **is called unconditionally** (no flag) from the real export path:
  `src/renderers/webgpu/ParametricExportComputer.ts:57,2679-2698,3093-3098` — confirmed by GitNexus
  (`extractAnalyticFeatures` called by `prepareTwinInputs`, among others). This runs on every
  default DragonScales export today.
- **`CreaseTWarp`** (`src/renderers/webgpu/parametric/conforming/CreaseTWarp.ts:1-47`) then pins
  **one** existing dyadic mesh row exactly onto each `t=k/scaleRows` locus via a monotone,
  endpoint-fixed t-warp — explicitly a "horizontal twin" mechanism shared with BambooSegments node
  rings. Its own docstring: *"turning a chamfered sharp ring crease into an actual mesh edge WITHOUT
  touching connectivity"* — by design it can only make **one** row exact, never two. Its own test
  suite exercises the DS case directly: `CreaseTWarp.test.ts:37-43` ("DragonScales rows=8: interior
  creases at k/8 for k=1..7").
- This is **exactly the charter's R3 anti-pattern** (single centreline forces bridging) applied to
  DS, and it is the *measured, root-caused mechanism* behind the 17× regression in §1.4: production
  is not missing knowledge of where the rings are — it has that — it is missing the doubled-row/
  tread-strip representation that would let it actually close the jump instead of over-refining a
  ramp around a single pinned row.

### 3.2 Tier-C dispatch state (DS is explicitly NOT routed to the perfect-mesher path)

`src/renderers/webgpu/parametric/conforming/tierC/countUnstable.ts:54-57`:

```ts
export const COUNT_UNSTABLE_STYLES: ReadonlySet<StyleId> = new Set<StyleId>([
  'GothicArches', 'GeometricStar',
]);
```

This is the *only* dispatch predicate (`isCountUnstableStyle`, an explicit allow-list — a measured
graph-signal alternative was tried and refuted, see the module's own header,
`countUnstable.ts:9-41`). `buildTierCOuterWall` (`tierC/index.ts:150-195`) delegates to the
unchanged `buildConformingOuterWall` for every style not in this set — **DragonScales always takes
the old path**, and even for Gothic/GeoStar the flag (`__pfPerfectMesher`) is default-OFF in
production (`tierC/index.ts:133-136`, `flagOff.byteIdentical.test.ts`). Net: **there is no
dev-flag-gated DS path either** — DS's production behavior today is 100% the plain conforming
mesher described in §3.1, unconditionally.

### 3.3 The DS export-blocker fix (adjacent, not the fidelity mechanism)

A real product bug was found and fixed alongside this research: DS's default artifact contained
**409 finite-area-needle slivers** (`triangleQuality3D`, aspect>100) which made
`summarizeConformingValidation` set `valid=false`, which made `useParametricExport` **throw** —
DragonScales' default export was blocked for real users
(`research/EXPERIMENT-REGISTRY.md:5952`, E-2026-07-09-EXPORT-PERF). Fix: split `sliverCount` from a
new `degenerateCount` and gate `valid` only on `manifoldOk && normalsOk && degeneratesOk` — a
finite-area needle demotes to a warning, a true zero-area triangle still gates
(`research/EXPERIMENT-REGISTRY.md:5962-5982`; current code has `degenerateCount` at
`src/fidelity/metrics.ts:646,733,741,804,828`). As of this survey the containing session's own
notes describe this as **"in-tree, uncommitted, awaiting owner commit/review"**
(`research/lab/2026-07-10-program-consolidation.md:100`, `da6b423a` commit message) — it is present
in the current working tree (confirmed by direct read) but its commit status should be re-verified
before Phase 1 relies on it. This is **why** the production captures in §1.4 could complete at all
(8.73M/4.55M tris, 131.3s) rather than throwing — it is orthogonal to fidelity, purely an
export-blocking gate fix.

### 3.4 Status table

| mechanism piece | status |
|---|---|
| Doubled-ring row schedule (`buildRows`, `dragonRings`) | **lab-only**, `research/bridge/` |
| Structured-wall connectivity (`buildStructuredWall`) | **lab-only** (shared with ArtDeco/Bamboo/other doubled-ring styles) |
| Composite ruler (sheet∪wall, §V11g) | **lab-only** |
| Production-artifact scoring port | **lab-only** (`_ds_prodtruth_lib.ts`, one-shot use, not wired as a live certifier) |
| Ring-locus knowledge (`extractDragonScales`) | **committed, wired unconditionally** — but wrong mechanism class (single centreline) |
| Single-row crease pin (`CreaseTWarp`) | **committed, wired unconditionally** — the actual (regressing) production mechanism for DS rings |
| Tier-C perfect-mesher path | **dev-flag-gated, default OFF, and DS is not even in its allow-list** |
| Export-blocker (sliver/degenerate gate split) | **present in working tree**, commit status unverified — re-check before Phase 1 |

---

## 4. GAPS THE CHAMPION DID NOT CLOSE

Be explicit here — the Phase-1 head-to-head must not silently inherit any of these.

### 4.1 Composite-ruler production port is a one-shot score, not a live certifier

`_ds_prodtruth_lib.ts`/`_ds_prodtruth.test.ts` were built to score **one already-captured**
artifact once. There is no wiring anywhere that would let a live export pipeline (or a per-export
Certificate) call this ruler routinely — it is a research oracle, not a production-callable
function. The production-side classifier (`classifyRingBand`) is a **geometric approximation**
(z-proximity to a ring, `bandMm` swept 0.5–2.5mm) rather than the research mesh's *exact*
row-metadata classifier (§1.2) — any new region-based mesher that keeps exact region membership
(per charter **P1**, partition by real feature anatomy) should prefer the exact classifier and only
fall back to the geometric one when scoring a mesh it didn't itself construct.

### 4.2 Seam / assembly: never attempted

The champion mesh is **outer-wall-only, standalone, periodic-in-θ, open at z=0 and z=H**
(`bd=4800` in §1.3 is exactly this open top/bottom — confirmed by direct code read, zero mentions of
`innerWall`/`rimCap`/`baseCap`/`assembleWatertight`/`seam` anywhere in `_pf_dsconform.test.ts`,
grep-verified). It has **never** been assembled with a base, rim, or inner wall
(`src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts` machinery), and it has never
been partitioned into multiple independently-triangulated regions that need to share vertices *by
index* across a partition boundary — the charter's own region architecture (§5, "Per-region
meshers" → "Assembly: seam, inner wall, rim, base, cap; weld; orientation", G7) is **entirely
untested** against this style. Two concrete unknowns for Phase 1:

- Do the champion's ring rows compose cleanly with a region partitioner's own seam-sharing
  discipline (shared-vertex-by-index at region boundaries), or does the doubled-row construction
  need its own boundary contract?
- The production BODY population's own worst tail (§1.4, max 0.158mm) and the reverse sheet
  coverage's rim-attachment band (max 0.1241mm) **both cluster at t≈0.999**, i.e. exactly the
  rim-attachment seam the champion mesh never had to solve (it simply ends open at z=H). This is a
  live, currently-uncharacterized-by-the-champion defect class Phase 1 will newly encounter the
  moment it assembles a full pot.

### 4.3 Budget/time numbers are not apples-to-apples

The champion's "tris" numbers (§1.3) are pure CPU-array construction inside a Vitest probe — there
is no comparable "generate wall time" measurement for the champion mesh (build times were logged
ad hoc for resilience checkpointing, not benchmarked). Production's **131.3s** generate time (§1.4,
post the `topologyMetric` perf fix, `-88.2%` vs the original 1113s pilot transient) is a real
GPU+CPU pipeline number and is the only trustworthy timing anchor available. **OPEN:** no number
exists yet for "how long would a region-based DS mesher with doubled-ring embedding take to
generate," and it should be measured, not assumed comparable to the champion's raw build time.

### 4.4 Parameter-envelope behaviour: entirely untested

Every single occurrence of `dragonRings()` across ~15 lab files hardcodes `k < 8` (i.e.
`scaleRows=8`) and every DS mesh in the lab uses the **exact same** pinned dims
(`H=120, Rb=40, Rt=50, expn=1`, DEFAULT style params) — grep-verified (`research/bridge -l
"function dragonRings"` and inspection of each match). **Nothing measures**:

- Ring **birth/death** as `dsScaleRows` varies (more/fewer rings — does `treadCap`/`nZband` still
  behave, does the per-band z-pitch calculation still hold at extreme row counts?).
- Non-default `H`/`Rt`/`Rb`/`expn`/`spinTurns`/`bellAmp` — the ring z's are `t·H` so they scale
  trivially with `H`, but the jump *magnitude* (θ-dependent, driven by `dsScalesPerRow`/
  `dsOverlap`/`dsCurvature`) and therefore the tread-strip's `treadSub` sizing were never
  re-validated off the pinned Rt=50/Rb=40.
- Interaction with `spinTurns`/twist parameters at all (the capture pipeline pins `spin=0`
  specifically "makes the per-vertex radial check exact",
  `research/EXPERIMENT-REGISTRY.md:5895` — meaning even the *production* capture avoided this).

This is a real gap: the charter's mandate is "every valid shape... inside [the representational
envelope], no exclusions" (`research/lab/2026-07-11-tierc-productionization-charter.md:25-28`), and
DS's champion has only ever been proven at one point in its own parameter space.

### 4.5 Triangle quality: a known, currently-open tension with fidelity

At the champion's own recommended operating point (nZband=110) quality is good (%<20°=2.0%,
minAngle not degenerate). But **quality and fidelity trade off against each other on the SAME
lever** in ways that are not simultaneously optimizable by density alone (§1.3): nZband=220
degrades quality to 8.1% <20° for a fidelity count that never reaches 0; the lip θ-densify lever
degrades quality to 26.3% <20° while still not closing the lip. Additionally, `treadSub`'s span
estimate samples the ring jump at **θ=0 only** (`_pf_dszdensity.test.ts:75`, `const rIn = rA(0,
rzIn)`) even though the true jump is θ-dependent (0.0007–1.21mm across θ per §0/§1.4) — this worked
cleanly at the validated defaults but is a **known simplification**, not a proven-robust general
rule; a parameter sweep (§4.4) could expose a θ where a single-sample `treadSub` under- or
over-subdivides.

### 4.6 The SHEET is not closed — only the ring/riser sub-problem is

This is the single most important gap to carry into Phase 1, spelled out in §1.3's terminal
verdict: the champion's ~5,552–5,580-facet **sheet** population (the majority of its total outlier
budget, larger than the ring/lip population) is a **density-invariant relief-chord cliff** —
raising z-density barely helps (−10% for +97% tris) and raising θ-density actively *hurts*
(+77% outliers). The lab's own verdict places this in the **same EXCLUDE class as weave/braid/
lattice styles** (`research/EXPERIMENT-REGISTRY.md:194`), not in the "champion, solved" class. Any
claim that "DragonScales is closed" must be scoped precisely to the ring/riser sub-problem; the
sheet's per-scale relief texture was never separately embedded as feature edges and remains an
open problem shared with (not solved better than) every other relief-cliff style in the roster.

### 4.7 Do not port the champion's uniform sheet wholesale — production's adaptive body may already be better

A direct, sourced comparison (§1.4): production's existing **adaptive** body population (6,158
outliers / 2,302,975 facets = 0.267%) is **smaller in absolute count** than the champion's own
**uniform-grid** sheet population at a comparable density (5,552–5,580), and is measured as
*"CONSISTENT-to-better"* against the champion's whole floor
(`research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md:371`). The champion's win is real and large only
for the ring/riser sub-problem (§1.3/§1.4's 17×/96%-at-rings numbers) — its brute-uniform sheet is
not demonstrated to beat production's existing curvature-adaptive body meshing, and the one
controlled ablation available (θ-doubling, §1.3) shows the champion's uniform-grid sheet actively
*regresses* under naive density increases in a way an adaptive mesher might not. **Recommendation
for Phase 1's design** (not yet validated, flag for the architecture doc): port the doubled-
ring/tread-strip *region* mechanism for the 7 ring loci specifically; keep the body/sheet region on
the region-based mesher's general adaptive/CDT machinery (charter §5 stage C2/C3) rather than
reimplementing the champion's fixed uniform θ×z grid there.

---

## 5. REPRODUCE-TARGETS (pre-registerable verbatim)

All targets below use the **same capture shape** as every cited measurement: `H=120, top_od=100,
bottom_od=80 (Rt=50, Rb=40), expn=1, spinTurns=0`, DEFAULT `DragonScales` style params
(`dsScaleRows=8` etc.), scored under the **§V11g composite ruler** (§1.2/§2.6) at `tol=0.01mm`,
forward direction split **body vs ring-band**, reverse direction split **sheet vs wall coverage** —
never a single blended number (§1.2).

**T1 — Ring/riser closure (the PRIMARY target; this is what "reproduce the champion" means).**
Ring-band population must fall from production's current **71,355 outliers / 6.353% / max
0.070044mm** (§1.4) toward the champion's characterized floor: **≤3,300 outliers** (vs the
champion's measured 3,164–3,200 near-ring transition population, tightly banded within
[0.2,0.6mm] of a ring) **plus** a bounded C0-straddle tail of **≤100 facets**, with **max
≤0.05mm** (not 0.070mm) and **outlier rate ≤1.0%** of ring-band-classified facets (not 6.35%).
Reverse wall-coverage over-tolerance fraction must fall from production's **72.1%** toward the
champion's implied near-zero (the champion's wall points ARE the ruler's own wall reference to
0.00029mm, §1.3) — target **≤10%** of true riser-wall area >0.01mm from the mesh.

**T2 — Body/sheet: do not regress, do not expect a miracle.** Target **≤6,200 outliers** on the
body population (matching-or-better than production's current 6,158/0.267%, §4.7) — this is
explicitly **not** a "beat the champion's sheet" target, since the champion's own uniform sheet
(5,552–5,580 at comparable density) is not proven superior to production's adaptive body and
regresses under the one density ablation tried (§4.6/§4.7). If Phase 1's region partitioner routes
the DS body through its general adaptive/CDT machinery (recommended, §4.7) rather than
reimplementing the champion's fixed grid, pre-register that choice explicitly.

**T3 — Whole-artifact ceiling.** Total forward outliers **≤10,000** (vs production's current
≈148,900, a required **>10×** reduction; vs the champion's own whole floor of 8,744–8,752 — T3
should land at-or-below that number since T1+T2 together target ≈9,500 combined).

**T4 — Triangle budget (verbatim, pre-registerable).** Outer-wall triangle count **≤4,549,600**
(production's current outer count, §1.4) — the ring-embedding mechanism is required to **reclaim**
the measured 6–8× local density spike (§1.4), not add to it, so ring-band-local triangle density
per unit z should measurably *decrease* vs production's current 130–175k tris/mm-z-bin at rings.
If a full-pot assembly (base+rim+inner-wall, §4.2, absent from every champion measurement) is
included, inherit the historical DS-research ceiling of **≤10,000,000 (prefer ≤8,000,000)**
total tris, the exact figure the user mandated for the terminal research arm
(`research/EXPERIMENT-REGISTRY.md:152`, E-2026-07-08-DS-FINAL) — but treat this as a starting
anchor, not a target to spend up to; production's current 8,734,682 full-pot tris should be the
not-to-exceed ceiling for a mechanism whose entire premise is reclaiming wasted density.

**T5 — Watertight/quality, non-vacuous.** `rawNonMan=0` (index-based, injected-crack-moves-count
non-vacuous per the standing lab methodology), `zeroArea=0`, **%<20°<10%** (the champion's own best
operating point measured 2.0%, §1.3 — do not accept the 8.1%/26.3% degraded configurations §1.3
found at higher density). Riser serration **≤0.001mm** on any embedded ring locus (matching
§1.3's 0.001mm/0.00029mm figures) if the region mesher embeds ring edges explicitly.

**T6 — Rim-attachment tail (separate, newly-encountered defect — pre-register it as its own row,
do not fold into T1/T3).** Both production's forward BODY tail (max 0.158mm, top-10 all at t≈0.999)
and its reverse sheet-boundary band (max 0.1241mm) cluster at the rim attachment — a class the
champion mesh never measured (§4.2). Phase 1, being a full-pot assembly, will newly encounter this.
Target: **max ≤0.02mm** at the t≈1 attachment ring, reported **separately** from the general body
population, per the cross-style pattern already banked for SpiralRidges (t≈0.98) and Gyroid (t≈0.05)
(`research/lab/2026-07-10-program-consolidation.md:19-20`).

**T7 — Generate wall-time (measure, do not assume).** No pre-existing comparable number exists
(§4.3) — Phase 1 must measure and report its own DS generate time at first light; the only
available anchor is production's current **131.3s** (§1.4) as a not-to-regress baseline, not a
target to beat blindly (a region-based mesher doing strictly more topological work than a plain
quadtree — partitioning, doubled-ring embedding, per-region CDT — may reasonably cost more; report
honestly rather than silently degrading fidelity to hit a time number).

**Kill/adjudication rule (mirrors the charter's Phase-1 decision rule, applied to DS specifically):**
DS counts as "reproduced" only if **T1 AND T4 AND T5** all pass simultaneously — T1 is the actual
champion mechanism, T4 is its "reclaims density" promise, T5 is the non-negotiable watertight/quality
floor every other style in the head-to-head also has to clear. T2/T3/T6/T7 are honest secondary
readings that must be reported regardless of pass/fail, per this program's audit-first discipline —
a T1 pass achieved by silently blowing the T2 body population, or by a T6 rim regression, is not a
clean reproduction and must be reported as such, not folded into a single green checkmark.
