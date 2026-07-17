# UNIVERSAL-001 — distance to "true 0.01 mm for every valid style and shape" + staged roadmap (2026-07-15)

**Question:** how far is the project from the literal goal — a continuous, two-sided ≤ 0.01 mm certificate on the **final parsed artifact bytes**, for **every** valid style × parameter × geometry — and what closes the rest, in what order?

**Rulers (measured evidence only, no new claims):** the G0–G5 programme ladder (audit `9bec055d`, unanimously approved 2026-07-14), the 20-style G2 certification matrix (`f510bada` + numeric-channel addendum `2646395e`), the raycast/GPU-oracle production frontier (2026-07-12), the DS continuous worst-case gate (`8af880ac`), and the all-20 production-artifact truth capture (verdict `9d3933f7`).

**Scope note ("all possible shapes"):** per the PROD-TIERC charter, "all shapes" = every valid shape expressible by the current radial parametric model (20 registry styles, 174 style controls + 13 geometry controls, spin ∈ [−3, 3]); geometry outside that envelope is documented, not silently excluded. `ValidShape` formalization is itself a gate item (G0).

**Namespace warning:** G0–G5 below are the **audit programme gates**. The PROD-TIERC charter has its own per-artifact G1–G7; those are referenced here as TC-G#.

---

## 1. Position on the G0–G5 ladder (as of HEAD `f70c0fac`)

| Gate | Meaning (short) | State | Evidence |
|---|---|---|---|
| Containment | stop over-claiming; fix truth bugs; fresh baseline | **~3.5 / 5** | #1 partial (`tolerancesPassed` naming survives in parametric contracts; UI v3 Certificate cleaned — test asserts the slicer claim is gone), #2 done (v3), #3 done for WI parity (`2d02f566`; f32-emulated contract, on-GPU differential still owed), #4 open (adversarial regression set not landed), #5 **open** (no fresh clean-tree all-20 baseline since the truth fixes) |
| G0 — target + validity spec | complete target-solid semantics + ValidShape envelope | **Partial** | canonical target input, style runtime contract, per-style outer-wall targets landed (`35d8b68b`); **open:** curtain/riser surface-complex layer (7 styles atlas-refused), inner-wall semantics decision, formal ValidShape preconditions |
| G1 — evaluator parity | one authoritative surface truth, proven CPU/WGSL parity | **Partial** | WI CPU aligned to WGSL, BasketWeave ratio live, drain-0 semantics (`2d02f566`); **open:** true on-GPU differential (real fma/sin ULP), parameter-corner + fuzz coverage, twist/spin inside analytic truth |
| G2 — final-artifact certification | continuous two-sided proof on parsed bytes + structure gates | **Core COMPLETE, coverage 2/20** | screen (`236f543c`) + annular reference tessellation + first certified closed pot (`7d59941b`) + numeric channel (`2646395e`); `PF_G2_POT` gate 5/5. HarmonicRipple 9,499,923 pm / 15.8 s and SpiralRidges 9,499,969 pm / 18.1 s — **small pot (H40/OD30), gentle params only** |
| G3 — full production matrix | every style × param corners × surfaces: certify or refuse | **Not started** | all current certificates are one param point each; production-default scale (OD140/H120) refuses on the triangle cap |
| G4 — resource/UX contract | SLA + fail-closed refusal UX; budgets never change tolerance | **Not started** | 30 s / 131,072-tri are proof-layer constants today, not a product contract |
| G5 — release evidence | clean-tree rerun, committed certificates, independent verifier | **Not started** | — |

## 2. The two-track gap (the load-bearing frame)

The goal decomposes into a **judge** (certification chain) and a **candidate generator** (production mesher). Matrix lesson #4: Gothic's and Gyroid's production gaps are *candidate-generator* gaps — their target definitions are certifiable.

**Judge:** existence risk retired this week — `proveFinalStlMappedGeometryAndStructure` runs parse → coverage → continuous two-sided distance → topology → self-intersection → height on real curved closed pots. Binding frontier is now the triad **131,072-triangle cap × 30 s composed deadline × uniform dyadic grids** (per-cell geometry cost solved by the numeric channel).

**Candidate generator (what users actually export):** production ships the OLD conforming mesher; perfect-mesher/region flags OFF; analytic lever + Gyroid two-pass flag-gated OFF. Measured worst-case vs the GPU oracle (2026-07-12, defaults):

| Style | max (mm) | p99 (mm) | × over 0.01 budget |
|---|---|---|---|
| SpiralRidges | 0.0469 | 0.004 | 4.7× (nearly there) |
| DragonScales | 0.25 rings / 0.067 body (`8af880ac`) | body p99 0.0093 | 25× (rim closes to 0.026 at nRing=512; seam rail 1.87→1.10) |
| GothicArches | 0.4401 | 0.1289 | 44× |
| GyroidManifold | 0.7241 | 0.1346 | 72× |

Topology/watertightness is NOT the gap: the all-20 production capture is watertight and topologically clean (with −81…−93 % generation time banked); its fidelity verdict was 3 SHIPPED-CLEAN / 14 REGRESSION / 2 truth-bridge / 1 special-ruler — and it predates the WI-parity/BasketWeave/drain truth fixes (hence containment #5).

**Production wiring:** the proof layer is deliberately standalone — no proof session in the export path yet, no certified-mode UX. Zero production exports are certified today.

## 3. All-20 distance matrix (judge view, post `2646395e`)

| Style | Judge status today | Blocking mechanism | Unlock |
|---|---|---|---|
| HarmonicRipple | **CERTIFIED-PARTIAL** (small pot, gentle) | default scale ⇒ cap/deadline | U1 |
| SpiralRidges | **CERTIFIED-PARTIAL** (small pot, gentle low-turn) | default scale ⇒ cap/deadline | U1 |
| FourierBloom | razor-edge near-miss (true max ≈ 9.08 µm) | composed 30 s ceiling at ~108 k tris (partition verify + self-intersection scans dominate) | U1 |
| WaveInterference | admissible, refused | needs ~140 k tris > 131,072 cap; styled-inner-edge annulus | U1 (WIP in tree) |
| GyroidManifold | admissible, refused (true 85 µm at 84 k tris) | eff. angular freq ≈ 30 at styled inner edge ⇒ ≥ 262 k tris at any meaningful relief | U1 (+U5 for prod) |
| SuperellipseMorph | screen op gap | non-constant-exponent `power`, base → 0 at `abs` folds ⇒ 32 ms decimal cells | U2 |
| SuperformulaBlossom | screen op gap | `sign` | U2 |
| Crystalline | screen op gap | `fract` | U2 |
| RippleInterference | screen op gap | `fract` | U2 |
| GeometricStar | screen op gap | `floor`, `fract` | U2 |
| CelticTriquetra | screen op gap | `fract`, `floor`, `step`, `atan2` | U2 |
| Voronoi | screen op gap | `floor`, `fract`, `pcg2d` | U2 (hypothesis below) |
| GothicArches | atlas admissible, stations impossible | 24 crease kinks, 24 ∤ 2ⁿ ⇒ dyadic stations can never lie on θ = k/24 | U3 |
| LowPolyFacet | atlas-refused | multi-patch feature complex | U4 |
| ArtDeco | atlas-refused | floors/steps ⇒ curtain/riser faces | U4 |
| DragonScales | atlas-refused | multi-patch feature complex (prod mesher track well advanced) | U4 + U5 |
| BambooSegments | atlas-refused | multi-patch feature complex | U4 |
| HexagonalHive | atlas-refused | multi-patch feature complex | U4 |
| BasketWeave | atlas-refused | composition/production-integration blockers | U4 |
| CelticKnot | atlas-refused | composition/production-integration blockers | U4 |

## 4. Roadmap — phases U0–U6

Ordering = the matrix's ranked increments (#1 already landed same-day as `2646395e`) + the audit's staged architecture + the PROD-TIERC charter as the parallel mesher track. Size legend (calibration: ranked-#1 = S, landed same-day; G2 core = M, ~2 sessions): **S** ≈ 1–2 focused sessions · **M** ≈ 3–5 · **L** ≈ 5–10 · **XL** = multi-week programme.

### U0 — containment closeout (S) → closes Containment
1. Land the in-flight working-tree WIP first (see §6) — WI seam/junction + screen-bench work is already started; do not duplicate.
2. Fresh clean-tree all-20 default artifact baseline on real WebGPU (containment #5) — the empirical status ruler after the truth fixes.
3. Adversarial regression set (containment #4): p99-pass/max-fail, post-check mutation, budget coarsening, decimation bridging, non-default params, twist.
4. Terminology sweep: retire `tolerancesPassed` naming in parametric contracts (heuristic wording).
**Exit:** baseline doc in `research/lab` + regressions green + no certified-sounding language outside the proof layer.

### U1 — proof-engine scale-up (M) — matrix ranked #2 → G2 coverage
1. Raise/stream the 131,072 mapped-triangle cap.
2. Composed-deadline throughput: exact partition verify + structural self-intersection scans (the current dominators).
3. Non-uniform dyadic vertical ladders in the reference tessellation (spend triangles at styled edges/annuli).
**Exit (measurable):** FourierBloom defaults CERTIFIED; WaveInterference defaults CERTIFIED; HR + SR CERTIFIED at production-default scale (OD140/H120); Gyroid gentle attempted at ≥ 262 k tris (certified or an honestly-measured wall named). `PF_G2_POT` gate extended.

### U2 — screen v2 ops (M) — ranked #3 → G2 coverage
1. `power` with non-constant exponent, base ≥ 0 → SuperellipseMorph.
2. `fract`/`floor` on jump-free cells → Crystalline, RippleInterference, GeometricStar.
3. `step`/`atan2` → CelticTriquetra; `sign` → SuperformulaBlossom.
4. **Preregister before building:** Voronoi hypothesis — `pcg2d` consumes `floor`ed lattice coords, so on jump-free cells its inputs are constant ⇒ constant enclosure; if true, Voronoi rides item 2's machinery. If false, Voronoi stays decimal-only and leans on U1 throughput.
**Exit:** all 6 op-gap styles screen-full; each CERTIFIED gentle small-pot or its refusal mechanism measured and named.

### U3 — exact-rational partition stations (M–L) — ranked #4 → G2 + G0
Non-dyadic station support so partition stations lie ON crease curves (θ = k/24 for Gothic). Same fail-closed guarantees in the exact layer. This is also the **feature-aligned-stations prerequisite the production mesher track carries** (charter P1/P4) — build once, share.
**Exit:** GothicArches gentle CERTIFIED with crease-aligned stations; partition proofs accept exact-rational stations with adversarial tests intact.

### U4 — curtain/riser surface complexes (L) — ranked #5 → G0 extension + G2
1. Extend the target spec to multi-patch complexes: one-sided boundaries, explicit curtain/riser patches, adjacency/ownership, periodic identifications, shared boundary registry (audit §"complete surface-complex target"; charter P1–P3 verbatim).
2. **Product decision to record in G0 (user call):** inner-wall semantics — smooth offset vs styled radial offset. The shader and assembly currently disagree; "complete solid" claims for layered styles are blocked until decided.
**Exit:** DragonScales + ArtDeco atlases build; ≥ 1 layered style CERTIFIED gentle; all 7 atlas-refused styles have admissible atlases.

### U5 — candidate-generator convergence (XL, parallel track = PROD-TIERC) → enables G3
Runs alongside U1–U4 under the charter's principles P1–P7 / refuted register R1–R7.
1. Productionize the region-core/M-surf anisotropic-BAMG kernel (M = g/h² accelerator is a certified-but-unwired asset); DS rim nRing=512 + seam rail to production config.
2. Feature-conforming remesh for the big gaps: Gothic 0.44, Gyroid 0.72 (band-edge recipe + pins), DS rings 0.25.
3. Wire **mesher outputs** to exact partitions so the judge certifies PRODUCTION meshes, not just reference tessellations (journal 2026-07-15: "mesher outputs can be wired to partitions next"). Gothic-class needs U3 first; smooth styles can start after U1.
4. Certified-mode export path: proof session flag-gated in the real export flow; fail-closed refusal + labelled-draft UX; begins the G4 SLA (memory/time/cancellation, cross-browser).
**Exit:** first PRODUCTION export (real UI caller, real WebGPU) end-to-end CERTIFIED ≤ 0.01 mm for ≥ 1 style at defaults; refusal path demonstrated on a style that cannot yet certify.

### U6 — G3 matrix → G4 contract → G5 release evidence (XL)
1. Full envelope matrix: 20 styles × param min/max/pairwise × geometry boundaries × twist/phase/seam × every surface class (outer, inner, rim, base, drain, cap) — certify or refuse each cell honestly. Requires G1 twist/spin closure first.
2. G4: explicit cross-browser SLA; no budget ever coarsens tolerance; draft vs certified UX final.
3. G5: fresh clean-tree rerun, committed machine-readable certificates, independent verifier, round-trip checks, `detect_changes()` before shipment.
**Exit:** the product claim "true 0.01 mm for every valid style and shape" turns ON here — and not before.

## 5. Guardrails and open risks

- **Screen soundness assumptions** (libm ≤ 1 ulp, relative widening floor 1e-150) are cross-validated by tests, not formally proven — carry as a documented platform assumption into G5.
- **Diagnostic rule (matrix lesson #1):** the depth-24 "9.5000x pm" refusal value is a crossing-contour artifact, never the region max — diagnose by dense-sampling the named patch.
- **Styled inner-bottom edge is the universal hot spot** (matrix lesson #2) — expect it to fail first for every non-gentle style; U1 item 3 targets exactly this.
- **Twist/spin is outside analytic truth today** (G1) — no twist ≠ 0 certification until closed; production allows spin ∈ [−3, 3].
- **CRITICAL hubs** per GitNexus: `buildConformingWall` (157 symbols), `assembleWatertight` (108), `buildStyleParamPayload` (98) — U5 changes stage behind narrow default-off flags, `impact()` before edit, `detect_changes()` before commit, re-baseline after each phase.
- **Full-pot compute:** default-scale proof cost is unknown until U1 lands; FB already shows the composed ceiling binding at ~108 k tris.
- **Concurrency ops:** append-only journal, no `git stash`, absolute-path `git -C`, coordinate around the Voronoi truth agents (`549bec4d`/`5cf68c3e`).

## 6. In-flight work (working tree, `refactor/core-migration`, 2026-07-15)

Uncommitted: +302/−140 across the targetSolid proof layer (largest: `validatedResidualProgram.ts`) plus probes `_probe_wi_seam` / `_probe_wi_junctions` / `_probe_screen_bench` / `_probe_phase_times` / `_probe_patchid` / `_probe_unlocked` — i.e. **U1/WaveInterference work has already begun this session**. Roadmap executors: land or hand off this WIP before starting U1 items independently (feedback rule: preserve work, never revert).

---

**Bottom line:** the existence question is answered — the judge certifies real curved closed pots. Remaining distance is coverage engineering with a known, ranked mechanism list: 2/20 styles certified (gentle, small scale) → U1 scale + U2 ops + U3 stations + U4 complexes ≈ judge-side universality; U5 makes production meshes the thing being certified; U6 is where the universal claim is allowed to exist.

---

## Review addendum — executor assessment after envelope v2 (Claude Fable 5, same day, HEAD 562d1ba3)

I executed U1 the same day this roadmap was written; §§1/3/4/6 predate commits `3a0a8c0a`/`562d1ba3`. Verdict: **the frame, ordering, and guardrails are right and I adopt them.** Seven adjustments from the bench:

1. **U1 items 1–2 are LANDED** (`2646395e` numeric channel + `3a0a8c0a` envelope v2: cap 524,288 / per-patch 262,144 / hard elapsed 120 s / differentiated work charging / raw-float screen core). The ceiling was a SEVEN-layer onion (partition build/BVH/traversal/broad-phase, topology work, self-intersection broad-phase, structural byte totals, aggregate pools) — each found by an honest fail-closed refusal; budget future "raise a cap" items accordingly.
2. **FourierBloom: CERTIFIED at pure defaults** (9,499,927 pm / 206,848 tris / ~65 s), not a near-miss — first U1 exit criterion met; in the `PF_G2_POT` gate.
3. **WaveInterference must move U1 → U3.** Measured: crossing value density-invariant across 512/1024/2048 angular and 32/64 inner rows; periodic seams and all six junctions image-exact (≤ 3e-14 mm). By elimination its relief crests are √-type cusps (chord ~ √h) — NO uniform grid closes it at any cap. The U1 exit "WaveInterference defaults CERTIFIED" is unachievable by U1 means; it is a feature-aligned-stations problem exactly like Gothic.
4. **Scope the U1 exit "HR + SR at production-default scale" to GENTLE params.** Default-PARAM HarmonicRipple at OD140 has 0.16-relative petal relief (≈ 11 mm at r = 70): sag math demands ~4,400 angular stations ⇒ ~2M+ triangles — beyond even the v2 cap. Gentle-param default-SCALE is feasible (~256 angular by the same math) and is the honest U1 target; default-param default-scale needs U3/U5-era machinery plus another cap generation.
5. **Downgrade "composed-scan throughput/streaming" from U1 to U5/G4.** The v2 envelope already fits the gate (structural ≈ 6 s @ 108 k, ~linear); streaming/incremental scans become mandatory only under the browser SLA — solve them where the SLA lives.
6. **Add a tool item to U1/U2: the style classifier probe.** The WI diagnosis playbook — (a) crossing-value invariance across two densities, (b) periodic-seam image gap, (c) six junction image gaps, (d) dense-sample the named patch — classifies any admissible style in ~2 minutes and routes it mechanically to U1 (density) / U2 (ops) / U3 (cusps/kinks) / U4 (complex). Cheap insurance against blind density tuning; I burned several runs on WI before running it.
7. **U5.3's dependency on U3 is broader than "Gothic-class".** Production conforming meshes carry float UV provenance — their stations are non-dyadic in general, so certifying ANY production mesh via exact partitions needs exact-rational stations (or dyadic snapping with accounted-for correspondence error). Make U3 an explicit prerequisite of U5.3, not a style-specific footnote.

§6 status: the in-flight WIP described there landed as `2646395e` + `3a0a8c0a`; probes deleted. Remaining U1 item = non-uniform dyadic vertical ladders (Gyroid-gentle ≥ 262 k attempt + gentle default-scale), which I am executing next.

## U3b progress addendum (2026-07-16, executor)

U0 containment: **ALL FIVE ITEMS CLOSED** (#5 fleet baseline `c39a0089`, #4 adversarial
suite `d6a5205f`, #1 remnant `cc93bdf4`). U1 landed earlier (envelope v2 + ladders); U2
landed (screen v2 ops; SE certified). U3a landed (snapped angular ladders; Gothic
reclassified to curved-feature-alignment with WI after screen v3).

**U3b (exact-rational stations): slices 1–4 LANDED.** Slices 1–3 = kernel/evaluator/cMPD
rational coordinates (partition kernel v8, evaluator odd-denominator channels, unit-square
domain gate). Slice 4 (this session) = the payoff: band-resolved fract/floor nodes
(compiler v12 — exact per-cell BigInt band checks on point-affine arguments, closed-graph
semantics, hull fallback on straddle), `rationalFeatureAngularLadder` (stations exactly ON
k/N, symmetric, partitions inherit the odd factor), Crystalline re-emitted with affine
cycle coordinates (target v5). **Crystalline gentle CERTIFIED-PARTIAL — 9,497,638 pm /
31,008 tris / ~16 s — the FIRST fract-family certificate.** Certified set: six pots across
five styles (HR small + default-scale, SR, FB, SE, Crystalline). See the certification
matrix Addendum 8 for the honest routing of the remaining five fract styles (RI float
offsets, GS vertical rows, SFB/CT sign/step ops, Voronoi floor+pcg2d re-attempt next,
heightPhase ≠ 0 diagonals = conforming cells).

U3 exit check: the original exit ("GothicArches gentle CERTIFIED with crease-aligned
stations") was superseded by the Addendum-6 reclassification — Gothic's arch outlines are
p<1 cusp CURVES, not axis-aligned stations; the honest U3 exit is now "partition proofs
accept exact-rational stations with adversarial tests intact" (DONE) + "first fract-family
style certified via stations-on-jumps" (DONE — Crystalline). Curved-feature conforming
(Gothic, WI) remains U5-class; U4 layered complexes unchanged.

**Slice 5 addendum (same day):** vertical rational ladders + combined per-axis odd
factors landed (arbitrary exact p/q stations; remapped-patch jump lines discovered:
inner-wall lattice lines live at (k/8 − c)/s with c = t_bottom/H — geometry choice
gates station exactness, H 32 ⇒ (4k−3)/29). Voronoi campaign fully measured (matrix
Addendum 9): banded floors + constant-pcg2d LIVE end-to-end; web mode = authenticated
F2-window discontinuity (0.138 mm, U4-class); bubble mode CONVERGES per-patch on all six
(≤ 9.4999 µm each) but sums to ~150 s vs the 120 s composed ceiling — reclassified
compute-bound (kink-line Clarke-hull volume; U5/G4 streamed scans or bisector-conforming
cells). Certified set holds at six pots / five styles.

**Slice 6 addendum (2026-07-17):** GeometricStar gentle **CERTIFIED-PARTIAL —
9,499,903 pm / 176,128 tris / 46.7 s** on the H32/OD30 pot (relief 0.02, roundness 1,
rest registry defaults incl. shift 0). Seventh pot / sixth style; FIRST with exact
stations on BOTH axes (sector u-floors k/8 + row v-floors incl. the remapped inner wall
at (8k−3)/29 — first production use of the slice-5 vertical rational ladder + the H-32
dyadic-c geometry lever). One code change: sector cycles re-emitted point-affine with τ
cancelled symbolically (target v6); the shift ≠ 0 row-coupled form stays hull
(fail-closed, regression-pinned). The Addendum-9 diagonal-strap compute risk did NOT
materialize (14–37 s per config vs Voronoi's ~150 s); the honest blocker was strap
cross-section under-resolution at roundness 0 (true 15.1 µm at the bottom edge, lesson
#2 reconfirmed), closed by roundness 1 (edge 0.22) + walls 2⁶. Matrix Addendum 10 has
the full campaign. Remaining fract-family: SFB/CT sign/step banding, RI float offsets.

**Slice 7–8 addenda (2026-07-17): U3b CLOSED.** Slice 7 (`42b29716`) landed sign/step
value-jump banding (compiler v13) + the honest rerouting: SFB's sign argument is
transcendental (positivity route, not banding); CT needs re-authoring at minimum.
Slice 8 (`b37df65c`) executed measurement-first and closed the family with ZERO new
kernel code: **SuperformulaBlossom CERTIFIED** (positivity route — 9,499,801 pm /
53,760 tris / 22 s, uniform 2⁸) and **RippleInterference CERTIFIED** (dyadic default
offsets i/4 ⇒ antipode fract lines on k/4 — 9,499,975 pm / 86,528 tris / 49 s);
**CelticTriquetra measured OUT to the U5 conforming class** (4 refusals, density- AND
relief-invariant including sub-tolerance 0.005 mm — the 45°-rotated braid lattice is
diagonal in (u,v); the slice-7 handoff's vBand re-authoring alone cannot unlock it and
was deliberately not built). Certified set: **nine pots / eight styles**; PF_G2_POT
18/18. No fract-family style remains unlockable by stations/bands — the frontiers are
now exactly the sufficiency addendum's ranked list: (1) curved/diagonal
feature-conforming cells spike on WI (templates Gothic + CT + Voronoi bisectors +
heightPhase/shift corners AND the production-mesh path), (2) U4 curtain complexes,
(3) envelope v3 / streamed scans (Voronoi bubble, Gyroid). Matrix Addendum 12 has the
full slice-8 data.

## Sufficiency addendum — does U0–U6 deliver "full feature-preserving representation of every possible shape"? (2026-07-17, analysis)

Requested by Patryk after slice 6. Decomposition: the claim = four requirements, each
with a different status. (R1) **Definition** — knowing what the features ARE per
(style, params): the `featureManifest` contract already enforces declared-obligation
semantics (`empty-proven`/`present-proven`, curtain counts, per-feature satisfied
assignment records — `certificationContract.ts`), but 7 layered styles + Voronoi web
(measured 0.138 mm F2-window jump) + diagonal param corners cannot yet declare
satisfiable obligations. (R2) **Representation** — the mesh class: axis-aligned exact
stations are DONE (both axes, GS); two classes remain unrepresentable: curved feature
curves (Gothic p<1 cusps, WI √-crests, Voronoi bisectors, heightPhase/shift diagonals)
and curtain/riser faces (U4). (R3) **Generation within budgets**: triangle demand scales
~ relief·freq²·area/tolerance — envelope corners (HR default-params at OD140 ≈ 2M+ tris)
are unbounded ⇒ refusal at corners is mathematically mandatory, not a defect. (R4)
**Verification**: the strongest layer — two-sided closed-graph proof + adversarial suite;
semantics: no real feature above tolerance can be LOST (forward bound) and no artifact
feature above tolerance can be ADDED (reverse bound); sub-2×tolerance features can
legally smooth away (manufacturability-consistent; state it in the product contract).

**Mechanism taxonomy of the remaining 14 styles** (the true map — style counts
understate the parameter axis): 3 mechanism-known (SFB/CT sign-step banding, RI
offsets — S-size); 2 compute-bound with converged mechanisms (Voronoi bubble ~150 s vs
120 s ceiling, per-patch ≤ 9.4999 µm proven; Gyroid ~1024 shared angular ⇒ envelope
v3/streaming); 2 curved-feature-conforming (Gothic, WI) — **the structural frontier,
and the same machinery certified-production meshes need (charter P1/P4)**; 7 curtain
class (U4). Certified styles re-enter the harder classes at param corners (Crystalline
heightPhase ≠ 0 → diagonal/curved class; GS shift ≠ 0 → hull; GS roundness → 0 →
density wall, honest refusal measured at 15.1 µm true).

**Correction to §5:** "twist outside analytic truth" is STALE — Addendum-7 (adversarial
suite) established spin is inside `radialOuterWallProgram` truth (unspun-vs-spun
refuses at ~0.7 mm); the remaining twist gap is certification coverage, not truth.

**The decision that defines success (Patryk's call, record in G0/G4):** (a)
certify-or-refuse over a formalized envelope — achievable; G3's goal becomes
"refusal-free interior, refusals only at the documented resource boundary"; or (b)
never-refuse over the full envelope — not achievable at 0.01 mm in browser budgets
(R3). Recommend (a); treat interior refusals as bugs. Second standing decision
unchanged: inner-wall semantics (blocks U4 'complete solid' claims).

**Recommended order (information-value ranked):** 1) finish fract remainder (SFB/CT/RI)
→ ~9 certified styles cheaply; 2) **curved-feature-conforming spike on WI** (pure
cusp-curve vehicle, no curtains; success templates Gothic + bisector + diagonal classes
AND the production-mesh path) — de-risk the biggest unknown before U4; 3) U4 with
DragonScales first + the inner-wall decision; 4) Voronoi-bubble/Gyroid envelope v3
opportunistically; 5) start per-style G3 param-envelope fleets EARLY (the roundness-0
class of discovery must happen per style, not at release).

## Directive addendum — outer-wall-first + agnosticism/perf analysis (2026-07-17, Patryk)

**User directive (recorded):** "inner wall can save triangles and compute. for now the
outer wall is the main focus." Provisional resolution of the standing inner-wall
question: fidelity effort concentrates on the OUTER wall; the inner wall becomes a
triangle/compute savings pool. Two implementation options, in recommended order:

1. **Scoped claims (do now, zero semantic risk):** keep target semantics unchanged;
   extend the certification contract with per-patch-class tolerance — outer-wall patches
   at 10 µm, inner/rim/base at a relaxed bound (e.g. 100 µm) or topology-only, honestly
   labelled in the certificate. Kills the universal hot spot (lesson #2: styled
   inner-bottom edge) as a 10 µm obligation; WI's ~140 k-tri demand and the Gyroid
   inner-edge frequency wall were inner-edge-driven.
2. **Smooth-offset inner semantics (the full savings, a G0/G1 change):** redefine inner
   = smooth offset. Halves styled area and removes inner curtains from U4 scope — but
   the WGSL preview currently styles the inner from the outer radius, so this touches
   preview parity (G1) and is product-visible. Decide only with preview updated in step.

**Agnosticism claim, made precise:** the engine is agnostic at the CONTRACT level (one
mesher+judge consuming the semantic style contract: point-affine emissions, declared
jump/feature manifests, curvature bounds). Black-box/sampling agnosticism is provably
out (finite samples never bound a supremum — the audit's core finding, and the
mechanism of the months of pre-audit failures). Every U3b breakthrough came from the
target DECLARING structure (affine re-emission, symbolic τ), not the mesher detecting it.
New styles must emit the contract to be certifiable — that is the product rule to keep.

**Sharp-feature completeness taxonomy (registry-wide, all four classes named):**
smooth (solved) · straight jump/kink lines, axis-aligned or diagonal (solved in-kernel —
slice-4 handles diagonal affine bands; diagonal TESSELLATION conforming still needed) ·
curved feature curves — cusps with vertical tangent (machinery missing = the WI/Gothic
spike; note √- and p<1-cusps need graded ladders TOWARD the curve + stations ON it;
chord error ~ √h ⇒ uniform grids are hopeless but geometric grading is log-cost — the
HR t^-0.9 base-ladder certificate is the working precedent) · curtains (U4). No fifth
class has appeared in any measured campaign.

**Browser perf programme (levers ranked by measured leverage):**
1. Feature-conforming candidates — conformity IS the perf lever: hull-cascade volume
   along unconformed kinks costs 10–15× cells (Voronoi bubble); conformed GS ran ~85 %
   fast-screen acceptance at depth ≤ 2. Fidelity and speed are the same build.
2. Outer-wall scoping (this directive) — removes the hot-spot class from the 10 µm
   budget; ≈ halves styled proof/mesh area once inner relaxes.
3. Per-patch worker parallelism — proofs are per-patch independent; Voronoi's 150 s SUM
   with six converged patches → ~max-patch wall time on a worker pool.
4. Patch-local residual queues (audit perf item) — refine-until-certified loops re-prove
   only failed cells' mapped correspondence, not the artifact.
5. WASM SIMD for the screen tape + WebGPU as PRIORITIZATION only (find worst cells,
   route CPU proof work; GPU never enters the trust chain — raycast oracle precedent).
6. Anisotropic M = g/h² sizing (certified-but-unwired asset) — fewer, better triangles
   before any proof runs.
7. Envelope v3 streaming (STL sink + streamed structural/self-intersection scans) —
   removes memory ceilings; unlocks Gyroid/Voronoi-bubble class certificates.
SLA shape to aim at (G4): gentle/defaults ≤ 30 s certified; heavy ≤ 2 min with progress
+ cancel; envelope corners refuse FAST (fail-closed detection is cheap).
