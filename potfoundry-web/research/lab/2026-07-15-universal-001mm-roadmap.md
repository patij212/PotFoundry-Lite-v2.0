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
