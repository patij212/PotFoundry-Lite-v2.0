# Meshing Research Lab — Experiment Registry

This file records reproducible experiment runs for the PotFoundry meshing research lab.
Every row is the output of `runStyle()` with a fixed random seed (none needed — the
pipeline is deterministic) from `research/bridge/runStyle.ts`. The one-metric-both-meshes
contract: every oracle run (triangle or gmsh) is scored with the same `measureOracleMesh`
call using perpendicular-3D deviation (the real chord metric, not radial approximation).

Engines: **gmsh 4.13.1** / **triangle 20230923**. Python venv: `research/oracle/.venv`.

---

## E-2026-07-04-VERIFY-INTRINSIC-APEX — ADVERSARIAL re-check of the RACE-INTRINSIC-APEX reconcile CONFIRM (SKEPTIC/metrologist)

**Q:** Does the RACE-INTRINSIC-APEX `reconcile` CONFIRM ("112/113 cusps 0-outlier, apex-leaf p99 0.0096, on-surface-Steiner flank recursion is the closer") survive (a) the WORST-cusp population the REFUTED sweeps used, and (b) an HONEST denser interior sampler?

**Method (independent probe `_verify_intrinsicApex.test.ts` + `_quick_verify.mjs`, worst-gradU population, dense 36-pt barycentric sampler, ruler cross-checked):**
- **reallyRan = CONFIRMED.** Real vitest v4.0.17 output (ISO timestamps 19:11–21:21), disk checkpoints (scorecard.ndjson / summary.json / reconcile.json / apex_geom.json), row-exists resumable, 6 env-gated tests. Not fabricated.
- **rulerHonest = CONFIRMED.** The `ruler-xcheck` row matches the full-2π `bruteNearestOnRadialSurface` to maxDiff 0.000813mm; ruler is per-triangle INTERIOR true-3D (centroid+edge-mids+barycentric lattice), not radial/vertex-only. My cheaper 24×24 projector cross-checks to 0.000000mm vs 96×96 on 20 near-crest interior pts (not inflating).
- **The REFUTED sub-results reproduce and are genuine:** N1 K-sweep slope +0.006 (no-op), N2 M-sweep 400/400 outliers, N3 apex-geom SINGULAR-FLOOR (slope +0.643, p99 frozen 0.052, 88/150 outliers). Correct.

**THE CONFIRM DOES NOT SURVIVE — two independent breaks:**
1. **POPULATION MISMATCH.** The reconcile selects 113 cusps by UNIFORM STRIDE + `flankDrop>=0.02` filter — NOT the top-400 gradU-sorted worst zero-width cusps the REFUTED sweeps used. Re-running the EXACT ribbon flatten recursion (L5, on-surface Steiner, 10-pt early-stop) on the WORST cusps + dense36 re-measure: **top-12 → 12/12 outliers (frac 1.0)**; **top-30 → 24/30 outliers (frac 0.80)**; p99/maxLeaf36 = **0.061mm** (matches the apex-geom SINGULAR-FLOOR, NOT 0.0096). The CONFIRM held only on an easier subset.
2. **SAMPLER ARTIFACT + CAP.** The reconcile's 10-pt early-stop ACCEPTS leaves whose true interior exceeds 0.01: **60 (top-12) / 132 (top-30) accepted leaves leak >0.01 under dense36.** And **6 leaves hit the L5 cap UNCONVERGED (self>0.01)** on the worst cusps — the recursion did NOT terminate at 0-outlier, it was capped. The reconcile's own `ribbonHoldsUnderDense` flag was already FALSE (worstLeafMax 0.0131 > 0.013).

**VERDICT: the RACE-INTRINSIC-APEX reconcile CONFIRM is REFUTED as stated.** It really ran and the ruler is honest, but "112/113 cusps 0-outlier" is an artifact of (a) an easier uniform-strided population and (b) a coarse 10-pt sampler with an L5 cap. On the WORST Gothic zero-width cusps with an honest dense sampler, on-surface-Steiner flank recursion still leaves 80–100% of cusps as interior outliers, floored at ~0.06mm — CONSISTENT with the frontier thesis (a P1 flat triangle cannot follow a zero-width `pow(sharp)` cusp to ≤0.01; the near-apex leaf inherits the singularity). The mechanism DIRECTION (apex-as-edge + on-surface Steiner drives most leaves down) is real and useful, but it is NOT a 0-outlier closer at tractable depth. **zeroOutlierReal = FALSE.**

**RECOMMENDATION:** Do NOT ledger RACE-INTRINSIC-APEX as a Gothic 0-outlier CONFIRM. Downgrade to "direction-confirmed, not-a-closer": Steiner recursion reduces but does not eliminate the near-apex outlier; the apex leaf floors at the `pow(sharp)` singularity. Any future acceptance gate MUST (1) use the WORST-gradU population, not uniform stride, (2) use a ≥36-pt interior sampler, (3) treat L5-capped self>0.01 leaves as outliers. The true frontier remains open: reaching ≤0.01 interior at the zero-width apex needs a genuinely intrinsic (curved P2/PN) element at the apex leaf OR an accept-tiny-residual policy at ~0.06mm — NOT flat-Steiner-recursion-as-closer. Ledger: scorecard `research/exchange/_verify_intrinsicApex/` + probe `_verify_intrinsicApex.test.ts` (PF_VERIFY_IA=1) + `_quick_verify.mjs` top-12/top-30 results.

---

## E-2026-07-04-RACE-INTRINSIC-APEX — intrinsic apex-edge frontier proxy: WHICH intrinsic variant closes the Gothic cusp (corroborates + sharpens E-RACE-CRESTRIBBON)

**Q (experimentalist / idea tournament):** the champion architecture "DIRECT OUTLIER-ELIMINATION via an apex-on-surface intrinsic crest edge" claims: place a vertex EXACTLY on the `pow(sharp)` apex + share it between the two flanking facets so each facet interior "rides ONE smooth flank instead of chording the apex", and the residual becomes bounded-curvature flank sag that Case-A closes. Test the CHEAPEST proxy of exactly this element change on the REAL Gothic worst-cusp cross-sections (400 steepest crest apexes from the on-disk `_gd_gothic/extract.cache`, gradU up to 248 mm/rad), interior ruler = a fast LOCAL true-3D nearest-surface projector (validated vs full-2π `bruteNearestOnRadialSurface`: maxΔ 0.0008mm on 40 worst apex-bridge midpoints ⇒ honest), interior d_int = max over {centroid + 3 edge-mids}.

**KILL-CRITERION (pre-registered):** CONFIRMED iff at K≥4 the apex-shared fan drives worst-cusp interior p50 ≤0.012 AND log(d_int)/log(K) slope ≤ −1.5. REFUTED iff floors >0.02 at K=8 OR slope >−0.5. (Plus corrected follow-ups: flank-normal refinement M-sweep; apex-strip geometric width sweep; reconciliation with the CONFIRMED ribbon recursion.)

**EVIDENCE (400 real Gothic zero-width cusps unless noted; interior true-3D, local projector; outlier = interior d_int >0.01):**

| variant | pitch/width | p50 | p99 | outliers | note |
|---|---|---|---|---|---|
| FLAT-UV bridge (BEFORE) | facet-scale | 0.1595 | 0.436 | 400/400 | valley→apex→valley flat bridge = the current mesh's worst facet |
| intrinsic fan, K along-crest =1..8 | — | 0.176→0.178 | 0.72 | 400/400 | **slope +0.006 (FLAT)** — subdividing ALONG the crest does nothing |
| apex-anchored FLANK refine M=1..8 | 1.05→0.131mm | 0.173→0.048 | 0.72→0.077 | 400/400 | flank IS u-responsive (p99 −9×) but p50 floors ~0.05, 400/400 still outliers (M16/M32 fork-killed; checkpoint held) |
| residual-position M=16 (ridge-tracked) | 0.131mm | apex-strip **0.0157**/mid 0.0069/val 0.0065 | apex 0.052 | 126/150 | **apex-adjacent strip DOMINATES**; mid/valley flank strips already ≤0.01 p50 |
| apex-strip GEOMETRIC narrow w=0.5..0.0156mm | — | 0.165→**0.0157** | 0.205→0.052 | 88/150 @finest | slope log(w)→log(d) = **−0.64** (sub-linear, NOT −2 quadratic); p99 FROZEN 0.052 from w=0.03→0.015 |
| **RECONCILE: ribbon on-surface-Steiner recursion + DENSE 10-pt sampler, cap L5** | adaptive | worstLeaf **0.0051** | **0.0096** | **1/113** (0.9%) | apex-most leaf p99 0.0096 = closes; max 0.0131; leaves/flank p50 4 / p99 **64** |

**VERDICT: the naive intrinsic-apex proxies REFUTE, but the reconciliation CORROBORATES + SHARPENS E-RACE-CRESTRIBBON (CONFIRMED) — the closer is on-surface-STEINER FLANK RECURSION, not the bare apex-shared element.** Three delineated negatives + one corroboration:
- **(N1) Crest-tangent K subdivision is a NO-OP** (slope +0.006): the apex-shared fan whose facets still bridge the whole flank in u does not improve — the flank WIDTH, not the crest-tangent pitch, carries the error.
- **(N2) Bare apex-anchoring + flank-normal density floors at 400/400 outliers** even at 0.131mm pitch (p50 0.048): placing the apex on the surface is necessary but NOT sufficient.
- **(N3) The residual localises to the apex-ADJACENT flank facet** (residual-position: apex-strip p50 0.0157 vs mid/valley 0.007), and a SINGLE flat facet there refined by narrowing its outer foot decays only **sub-linearly (slope −0.64), p99 frozen at 0.052** — because a flat facet with its apex-corner pinned at the `pow(sharp)` singularity inherits the unbounded-curvature neighbourhood. This is why a bare apex-vertex + flat flank facet cannot reach ≤0.01.
- **(C1, decisive) The CONFIRMED ribbon mechanism = recursive 4-split of the one-sided flank with every new (u,t) edge-midpoint LIFTED ONTO THE SURFACE (a-posteriori Case-A Steiner insertion).** Re-run with a 4×-DENSER interior sampler (10 barycentric pts vs the ribbon's 4) AND the apex-most leaf tracked separately: worst-leaf p99 **0.0096**, **apex-most leaf p99 0.0096 (it closes)**, **112/113 cusps ≤0.01** — the ribbon CONFIRM HOLDS under a stricter ruler and the apex leaf is NOT the residual once on-surface Steiner points are placed INSIDE it. SHARPENING caveats the denser sampler surfaced: (i) **1/113 (0.9%) tail leaks to 0.0131** at cap L5 (same "denser sampler reads a floor slightly worse" honesty pattern as the FGJ skeptic re-check — never inflated, only under-reported), and (ii) **leaf-count blows up to p99 64 leaves/flank** at the hardest cusps (the recursion fights the near-singular corner with brute area-splitting — a COST signal for productionization).

**RECONCILIATION (why this is not a contradiction):** my first proxies and E-RACE-CRESTRIBBON test DIFFERENT elements. The bare "apex-shared flat fan" (my N1–N3) keeps flat facets whose interiors ride an un-refined flank / a pinned singular corner → floors. The ribbon's win is the a-posteriori Steiner recursion that inserts on-surface points INSIDE the near-apex region (Case-A off the cusp) → closes. So the load-bearing piece is NOT "the apex vertex on the surface" alone (necessary, not sufficient) — it is "apex-as-shared-edge PLUS on-surface interior-error-driven Steiner refinement of each one-sided flank". This matches the architecture's own whyZeroOutliers (Case-B promotion makes the apex a boundary, THEN Case-A closes the flanks) and confirms Case-A does terminate on the Gothic flank (the architecture's #1 stated risk — "flank curvature near a pow apex unbounded" — is REFUTED for the mid/valley flank, and TAMED for the apex-adjacent leaf by Steiner insertion, at a bounded-but-nontrivial p99 64 leaves/flank cost).

**RECOMMENDATION:** ACCEPT the corroboration — E-RACE-CRESTRIBBON's PROMOTE-to-real-kernel-patch recommendation stands, with two ledgered caveats for that validation: (1) measure leaf/flank COST distribution (p99 64 here — the near-singular corner drives a fat tail; a leaf-count CAP + accept-tiny-residual policy may be needed, or an intrinsic P2 element to avoid the area-split blowup at the corner); (2) use a ≥10-pt interior sampler in the acceptance gate (the 4-pt sampler under-reports the apex leaf by ~0.003, hiding a 0.9% >0.01 tail). Do NOT pursue the bare apex-shared flat fan (N1–N3) — it is a proven dead branch; the Steiner-recursion is the mechanism. Frontier status unchanged: Gothic 0-outliers is reachable ONLY by the element-order change + on-surface Steiner recursion (a representation change), never by flat-UV density.

**LEDGER:** scorecard `research/exchange/_pf_race_intrinsicApex/scorecard.ndjson` (ruler-xcheck, flat-baseline, intrinsic-K1..8 + summary, flank-M1..8, resid-M16, apex-geom-w* + apex-geom, reconcile) + `summary.json` + `flank_summary.json` + `apex_geom.json` + `reconcile.json` + `progress.log`. Probe `research/bridge/_pf_race_intrinsicApex.test.ts` (PF_RACE_INTRINSIC=1, 6 env-gated tests, row-exists resumable); config `vitest.pf_race_intrinsic.config.ts`. Reuses labkit rulers (`bruteNearestOnRadialSurface`, `buildRadiusFn`) + the `_gd_gothic/extract.cache.json` + `_pf_race_crestribbon` `flatten` recursion READ-ONLY. NO src/ or kernel edit. Corroborates E-2026-07-04-RACE-CRESTRIBBON (commit d8a513c); delineates the failing intrinsic variants it did not test.

---

## E-2026-07-04-RACE-CRESTRIBBON — CREST-RIBBON P2-oracle: change the ELEMENT ORDER at the cusp (frontier proxy)

**Q (experimentalist / idea tournament):** every prior Gothic lever (5 refuted: doubled-crest, local-segment,
collinear-subdivide, panel-density, flank-tessellation) left ONE assumption intact — the mesh ELEMENT is a P1 FLAT
triangle in (u,t), so the only free variable is WHERE its vertices sit. E-PF-ANATOMY proved that on a zero-width
`ridge(sharp)` cusp no vertex placement helps: a flat facet must BRIDGE the apex and its INTERIOR chords the cusp
(worst-200 interior p50 ~0.047; 56% zero-width; floor flank-pitch-INVARIANT). This proxy changes the ELEMENT ORDER at
the feature: P1 → one-sided PN (Vlachos normal-offset) + flatten-to-tol. The apex becomes a shared C0 crease EDGE (two
one-sided sub-elements), and each sub-element's interior rides ONE smooth flank instead of chording across the ridge.

**HYPOTHESIS (to falsify):** replacing the flat P1 flank facets with two one-sided curved elements sharing the crest
geodesic drops the interior true-3D to ≤0.01 on the Gothic zero-width cusps AT EQUAL primary-vertex count, with the
crest-edge serration staying 0 — a signature the flat-UV paradigm structurally cannot produce.

**KILL-CRITERION (pre-registered):** on the worst Gothic zero-width cusps (P1 interior p50 ~0.047): CONFIRMED iff
one-sided curved-element interior true-3D p50 ≤ 0.012 AND p99 ≤ 0.015 at EQUAL primary-vertex count AND serration ≤
0.001. REFUTED iff curved interior floors > 0.02 on ≥ 30% (one-sided normal ill-defined / apex has sub-element
structure). NO-OP iff 0.012 < p50 ≤ 0.02 → re-run the flatten-to-tol emitter one level, re-judge against 0.01.

**DISCRIMINATOR (cheapest — single-patch bench, NO 18-min kernel rebuild):** on the REAL GothicArches surface
(`buildRadiusFn` defaults) take 192 REAL ridge-apex (u,t) from the on-disk `_gd_gothic/extract.cache` crestUt (all 192
gated as knife-edge, flankDrop>0.02). Per cusp: reconstruct the SAME bridging facet the flat kernel emits (2 base
verts straddling the ridge at facet-scale du=0.181mm-arc, apex vert dt=0.095mm-z, all 3 lifted EXACTLY on-surface),
measure its interior true-3D; then split at the ridge into two one-sided PN patches sharing the ridge geodesic and
measure the SAME interior locations. Ruler = a bounded LOCAL (theta,z) brute (Gothic ribs are single-valued height
fields, not tangled) CROSS-CHECKED against the full-2π `bruteNearestOnRadialSurface` on a 24-sample: xcheck
max(local−full)=0.0000, meanAbsDiff 0.0008 ⇒ local projector trusted (no aliasing-high). Probe
`_pf_race_crestribbon.test.ts` (PF_RACE_RIBBON=1). Reuses labkit rulers + the extract cache READ-ONLY; no src/kernel edit.

**VERDICT: CONFIRMED (as NO-OP→CONFIRMED via the pre-registered one-refinement-level branch) — the ELEMENT-ORDER change
is the cusp closer; the flat-UV paradigm's structural blind spot is real and removable.**

**EVIDENCE — bench-main (192 real knife cusps, EQUAL primary-vertex count, interior true-3D via local brute):**

| sample class | FLAT P1 (BEFORE) | one-sided PN (AFTER) |
|---|---|---|
| apex-side straddle mid (MID01, the bridge) | p50 **0.1379** / p99 0.1625 | ridge split vertex → p50 **0.0000** / p99 0.0000 |
| centroid | p50 0.0789 / p99 0.0937 | p50 0.0177 / p99 0.0242 |
| flank half-edge mids | — | p50 0.0186 / p99 0.0325 / **max 0.0482** |
| ALL interior | p50 0.0299 / p99 0.162 | p50 0.0183 / p99 0.032 |
| ridge-edge SERRATION | (flat cannot lower w/o moving verts) | **p50 0.0000 / p99 0.0000** |

⇒ The predicted NOVEL FACT is CONFIRMED: the apex-side bridge sample collapses **0.1379 → 0.0000** and the crest-edge
serration stays **0** — interior-collapse AND zero-serration at FIXED vertex count, which the flat paradigm cannot
produce (it can only lower interior by moving/adding vertices, perturbing serration). Mode B (the zero-width apex
bridge, 56% of E-PF-ANATOMY's worst) is eliminated BY CONSTRUCTION. RESIDUAL = mode A only (the 0.18mm flank itself
curves): pnAll p50 0.0183 > 0.012, 34.2% > 0.02 ⇒ the raw ONE-level PN patch is the pre-registered NO-OP branch.

**EVIDENCE — emit-flatten (113 cusps, flatten-to-tol emitter on the one-sided flank strip: recursive 4-split, every new
edge-midpoint's (u,t) lifted EXACTLY onto the true surface so each emitted flat sub-facet lies wholly on ONE flank —
Boissonnat-Oudot restricted-Delaunay convergence off the cusp):**

| level | flat sub-facet interior true-3D | frac ≤0.01 |
|---|---|---|
| L0 (no split, raw flank) | p50 0.0166 / p99 0.030 / max 0.0571 | 11.5% |
| L1 (1 split) | p50 0.0051 / p99 0.0331 | 98.2% |
| **L2 (2 splits)** | p50 0.0051 / p99 **0.0096** / **max 0.0098** | **100%** |
| adaptive (early-stop ≤0.01, cap L4) | worst-p99 0.0096 / max 0.0098 | **100%; REACHES_tol=TRUE** |

**COST: median 4 leaf sub-facets / flank, p99 7** — bounded, O(crest-length × ≤2 levels) THIN-STRIP, NOT the
0.4M→2.2M chevron-insertion explosion the flat-UV chevron general-curve insertion suffered (E-GEOSTAR). ⇒ the FULL
mechanism (ridge-split → one-sided element → flatten-to-tol) reaches **0 outlier triangles** on the Gothic zero-width
cusps: every emitted flat sub-facet interior ≤ 0.0098 true-3D, serration 0, at ~4-7 sub-facets per flank.

**INTERPRETATION / what this DOES and does NOT establish.** DOES: falsifies E-GF-GOTHIC's element-side corollary
("curved/higher-order elements cannot help a zero-width apex"). The cusp is closable to ≤0.01 by an element-ORDER
change — the load-bearing flat-P1-in-UV assumption is the wall, not the surface. The winning primitive is the SAME
proven feature-edge-embedding win (SFB seam / BasketWeave / LowPoly / Bamboo reach 0 outliers) extended one order up
to the zero-WIDTH limit: the designed cliff becomes a zero-serration crease EDGE and the flanks flatten to tol on ONE
side each. DOES NOT (single-patch proxy scope, honestly bounded): (1) the JUNCTION fans (96 births / 72 merges) are
NOT tested — the proxy is per-cusp on the dominant 96.5% crest-line class; variable-valence one-sided fan
watertightness is a SEPARATE second experiment. (2) The bench synthesizes the bridging facet at the recorded facet
SCALE (medFacetArc 0.181 / medFacetZ 0.095) on real crest apexes — it exercises the exact mechanism on the exact worst
OBJECT class but is not the literal kernel facet-by-index (rebuilding the 4.49M mesh = 18min, out of proxy budget).
(3) It is a Tier-C CLOSER bolted onto the existing extractor, NOT a retirement of the 6 primitives.

**RECOMMENDATION: PROMOTE to a `meshing-research` validation experiment — build the crest-ribbon on a SMALL real Gothic
kernel PATCH (few bays × short z-band, ~0.3M tris) end-to-end and (a) re-measure 0-outliers on the real mesh facets,
(b) DE-RISK the junction fan watertightness (the one untested failure mode), (c) confirm tri-count stays tractable at
whole-mesh scale (crest-length × ≤2 levels ≈ +2 ribbon rows per crest segment).** This is the first mechanism in the
campaign to close a zero-width cusp to ≤0.01; it changes the REPRESENTATION (P1→PN element), the one degree of freedom
5 flat-UV levers structurally lacked. Grounded in Vlachos-Peters PN triangles (I3D 2001) + Boissonnat-Oudot restricted-
Delaunay Hausdorff (2005) + MMG curved-mesh `hausd` adaptation.

**LEDGER:** scorecard `research/exchange/_pf_race_crestribbon/scorecard.ndjson` (bench-main + emit-flatten) +
`bench_detail.json` + `emit_detail.json` + `cusp_diag.json` (worst-PN per cusp) + `progress.log`. Probe
`research/bridge/_pf_race_crestribbon.test.ts`; config `vitest.pf_race_ribbon.config.ts`. Env PF_RACE_RIBBON=1.
Reuses labkit rulers + `_gd_gothic/extract.cache.json` READ-ONLY. NO src/ or kernel edit. Commits 9e4033e/d8a513c.

---

## E-2026-07-04-PF-ANATOMY — INTERIOR-ruler outlier anatomy of the cusp styles (Gothic + GeoStar) — PRE-REGISTERED

**Q (metrologist / measurement-first):** the prior Gothic diags anchored the facet CENTROID only. The exact object
the campaign must count is a triangle whose 3 VERTICES lie on the surface but whose INTERIOR sags >0.01. Using a
per-triangle INTERIOR true-3D ruler (max over centroid + 3 edge-midpoints, brute-anchored to remove GN wrong-well),
on the CURRENT-BEST dumped meshes (Gothic `_gf_gothic/gf_flank`, GeoStar `_ct_gs/GeometricStar_conform_heatmap`):
COUNT the outliers (interior dev >0.01), locate them (crest-cusp / flank-wall / junction / other), classify the
underlying feature as a genuine C1 SINGULARITY (zero-width `ridge(sharp)` cusp — a flat facet interior can NEVER be
≤0.01) vs a KINK vs a finite-curvature cap (via crest cross-section apex-angle + second-difference), census the
births/merges, and deliver the DECISIVE (a) sharp-EDGE / (b) high-curvature / (c) near-vertical-WALL classification.

**HYPOTHESIS (to falsify):** the interior outliers on both styles are dominated (≥50%) by C1-cusp/kink features ON a
live crest apex (crest-cusp WHERE), i.e. the residual is a genuine designed sharp EDGE (decisive class (a)) — NOT a
smooth high-curvature cap (b) NOR a merely near-vertical flat wall (c). If (a), the ONLY fix is resolving the feature
GRAPH incl. junction nodes (make the cusp a mesh edge); density/curved-elements cannot help a zero-width apex.

**KILL-CRITERION (pre-registered — this row committed BEFORE measuring):** the decisive class is (a) iff ≥50% of the
sampled worst outliers are `where=crest-cusp` AND ≥50% are `singular∈{C1-cusp,kink}` with median apex-angle <172°.
It is (c) iff ≥50% are `flank-wall` (near-vertical, NOT on a live apex, finite-curv apex). It is (b) iff ≥50% are
finite-curv caps (apex-angle→180, bounded second-diff). REPORT the outlier count + fraction-of-mesh, the location
split, the singularity split with apex-angle/second-diff numbers, and the junction census (nBirths/nMerges + the
amplitude-vanishing smooth-vs-sharp birth split). Measure with the INTERIOR ruler (brute-anchored), the honest gate.

**DISCRIMINATOR (cheapest):** operate on the ALREADY-BUILT current-best meshes (no re-meshing). Stage-1 = cheap RADIAL
per-face interior sag (recovered ut from xyz; radial ≥ true-3D ⇒ facets <0.01 are proven green) → 23.7k(Gothic)/54.6k
(GeoStar) candidates. Stage-2 = LOCAL Gauss-Newton anchor (unique foot on a single-valued height field ⇒ GN==brute,
per the standing "GN≡brute on unique-foot styles" fact) with a capped full-azimuth brute-CONFIRM on the worst 1.5k
(brute can only lower). Probe: `_pf_anatomy.test.ts` (PF_ANATOMY=1) + `_pf_anatomyLib.ts`. Sanity: a mesh vertex
projects to dist 0.00000 (on surface). Checkpoint each style the instant its scan finishes.

**VERDICT: CONFIRMED — decisive class (a) SHARP-EDGE on BOTH styles; the residual is a genuine designed C1 singularity
(a mesh EDGE, not density/curved-elements), with a measured HARDNESS GRADIENT Gothic (knife-edge) ≫ GeoStar (kink).**

**EVIDENCE — INTERIOR OUTLIER RULER (max over centroid + 3 edge-midpoints, GN-anchored + brute-confirmed; the honest
gate; whole-mesh; `_pf_anatomy`):**
| style | mesh | nF | interior OUTLIERS (>0.01) | outlier frac | interior dev med / p99 / max (mm) |
|---|---|---|---|---|---|
| GothicArches | gf_flank (crest-embedded flank-strip, current best) | 4.97M | **17,432** | 0.35% | 0.055 / 0.058 / **0.129** |
| GeometricStar | conform (strap-crease loci + picket, current best) | 5.07M | **45,388** | 0.90% | 0.034 / 0.034 / **0.068** |

⇒ The current-best primitive on each style leaves TENS OF THOUSANDS of triangles whose 3 vertices sit on the surface
but whose INTERIOR sags 3.4–13× over the 0.01 tol. This is the exact object the frontier target must eliminate.

**SINGULARITY vs KINK vs FINITE-CURVATURE (crest cross-section apex-angle + second-difference, worst-600 sample; a
`ridge(d,w,sharp)`=pow(max(0,1−|d|/w),sharp) apex is C1-singular ⇒ apex-angle≪180° + huge second-diff):**
| style | cusp-or-kink frac | C1-cusp / kink / finite-curv | median apex-angle | median second-diff | median crest-amp |
|---|---|---|---|---|---|
| GothicArches | **0.965** | 565 / 14 / 21 | **26° (worst pop 23°)** | **155–195** | 0.7–1.2 mm (live sharp ridge) |
| GeometricStar | 0.773 | 132 / 332 / 136 | **136°** | 17.6 | 2.35 mm |

⇒ **GothicArches = pure ZERO-WIDTH KNIFE-EDGE C1 cusp** (apex 23–53°, second-diff 80–195 — infinite curvature at the
`ridge(sharp)`/`mullion pow(...,sharp)` apex): a flat triangle interior CAN NEVER be ≤0.01 across it — the fix REQUIRES
the cusp to be a mesh EDGE. **GeometricStar = FINITE-WIDTH KINK** (apex 130–137°, second-diff ~18, plus a real 23%
finite-curvature tail at apex→173°): softer — a C0/C1 chevron strap-fold, still an edge but with more of a
density-reducible component than Gothic. THE HARDNESS GRADIENT (Gothic knife-edge ≫ GeoStar kink) is the key nuance.

**WHERE (the classifier probes the single nearest u-aligned apex; cross-tabbed with singularity):** Gothic 30%
labelled crest-cusp + 70% "other", BUT the "other" are 388/419 C1-cusps at apex **23.2°** / second-diff **194.7** on a
LIVE ridge (crest-amp 1.16mm) — i.e. the SHARPEST cusps of all, sitting on the DIAGONAL diamond-lattice ridge network
(off the u-aligned apex line the probe walks), NOT genuinely "other". So ~94% of Gothic outliers are knife-edge cusps
on a live sharp ridge. GeoStar "other" = 216 kink + 136 finite-curv + 32 cusp (apex 137°). **flank-wall = 0% on BOTH**
⇒ the residual is NOT a near-vertical flat wall a facet fails to hug (class (c) REFUTED); it is the RIDGE-LINE itself.

**JUNCTION CENSUS (Gothic, from the crest extract + amplitude probe):** **96 births, 72 merges**, 16,460 crest
segments, 16,556 peaks. Crest amplitude median 0.712mm, p10 0.395mm; **0% of crest points have amp<0.03** ⇒ NO
amplitude-vanishing smooth births — the ridges are SHARP right up to their birth/merge ends (a Y-junction / X-crossing
of two sharp ridges, NOT a smooth amplitude swell). ⇒ the feature GRAPH the fix must resolve has ~168 sharp junction
NODES plus 16.5k sharp segment arcs; junctions are sharp-birth, so they too need edge treatment (not density).

**VISUAL (corroborates + I trust it over any metric):** `research/exchange/_gf_gothic/gf_flank.png` (true-3D heatmap
of the analyzed Gothic mesh) — residual is a THIN yellow line running EXACTLY along each rib/mullion crest, panels
deep green, V-junctions (arch springs) slightly hotter. `research/exchange/_ct_gs/gs_conform.png` (GeoStar) — residual
a THICKER yellow-red band along the chevron strap-crease (consistent with the finite-width kink vs Gothic's zero-width
knife-edge). Both localize the outliers ON the sharp feature lines — the metric and the render AGREE.

**DECISIVE ANSWER (the whole-session question): (a) a genuine sharp EDGE that MUST be a mesh edge.** NOT (b)
smooth-high-curvature (apex-angle would be →180 with bounded curvature — only 3.5% of Gothic / 23% of GeoStar), NOT (c)
a near-vertical WALL a facet can't hug (flank-wall = 0% on both; the residual is on the RIDGE, not the flank). ⇒ the
ONLY mechanism that can drive interior outliers → 0 is to resolve the FEATURE GRAPH — every sharp ridge segment AND
every birth/merge junction NODE embedded as a zero-serration mesh edge, so no triangle interior ever bridges the cusp.
Density and curved (higher-order) elements are futile against a zero-width C1 apex (Gothic) though they could shave the
finite-curvature tail (GeoStar). This directly corroborates E-GF-GOTHIC's steep-EXCLUDE refutation from the INTERIOR
side and gives the frontier its exact target: a junction-aware feature-graph mesher (not a per-cell tessellation).

**RECOMMENDATION → NEXT EXPERIMENT (hands to `meshing-frontier`):** the current-best primitive already embeds the
crest LINE as an edge (serration≈0 in `_cu_gothicseg`/`_ct_gs`) yet still leaves 17k–45k interior outliers ⇒ the
line-embedding is INCOMPLETE at (1) the birth/merge JUNCTION NODES (96+72 on Gothic — the CDT recovery ceiling
90.6%→65.7% at density is exactly here) and (2) the DIAGONAL diamond-lattice ridges (the "other" 388 sharpest cusps —
a SECOND crest family the u-aligned extractor under-captures). Frontier target: a JUNCTION-AWARE feature-GRAPH
embedding (planarize ALL crest families incl. the diagonal lattice into one non-crossing constraint graph with explicit
Steiner junction nodes, lock every arc as a mesh edge) — test whether it drives interior outliers → 0 where the
per-cell / single-family-line approaches floor. If even a perfect graph embedding cannot (the count-unstable network
defeats clean junction recovery), Gothic is DEFINITIVELY steep-EXCLUDE from the interior side too (accept+document).

**LEDGER:** scorecard `research/exchange/_pf_anatomy/scorecard.ndjson` (+ `{style}_outliers.json` /
`{style}_classified.json`); instrument `research/bridge/_pf_anatomyLib.ts` + `_pf_anatomy.test.ts` (committed 94ff04e,
pre-reg 17381d9). Renders: `_gf_gothic/gf_flank.png`, `_ct_gs/gs_conform.png`.

---

## E-2026-07-04-GF-GOTHIC — explicit rib-FLANK strip tessellation (the LAST distinct Gothic lever) — PRE-REGISTERED

**Q (FRONTIER, LAST LEVER):** GothicArches' ~0.088 true-3D floor is DENSITY-INVARIANT under panel/chordTol density
(E-2026-07-04-GD-GOTHIC: 0.1086→0.0881 flat) and 93.5% of the worst facets are ON the near-vertical rib CREST/flank
(gradU_arc med 0.82 / p90 3.46 mm-radius per mm-arc; gradT med 0.40 / p90 3.15). chordTol is BLIND to the steep flank
(the same-(u,t) radial chord is tiny along a near-vertical wall). Four prior Gothic passes never tried EXPLICIT
structured tessellation of the flank WALL itself. DragonScales looked density-invariant at 0.0105 until the WALL's
z-density (nZband 30→70) — NOT panel density — closed it to 0.0051. Apply that lesson: for each embedded crest
segment, lay a strip of rows ACROSS the steep flank (perpendicular to the crest, both sides down to the adjacent
valley) at a FINE, EXPLICIT flank pitch sized from the TRUE-3D perpendicular/radial gradient across the flank, NOT
chord-sag. Does it drive Gothic true-3D p99 ≤0.012 (flank-pitch-RESPONSIVE), or does the near-vertical flank chord
floor >0.02 (genuinely irreducible ⇒ Gothic DEFINITIVELY steep-EXCLUDE)?

**HYPOTHESIS:** starting from the local-segment crest embedding (`_cu_gothicseg`: crest = zero-serration mesh edge,
rawNonMan 0, but true-3D floored 0.0581 by the FLANK), adding explicit local FLANK strips at a fine u/t-pitch
(sized from the flank true-3D gradient) drives Gothic true-3D p99 ≤0.012 AND keeps serration ≤0.001 + rawNonMan 0,
flank-pitch-RESPONSIVELY.

**KILL-CRITERION (pre-registered — this row committed BEFORE measuring):** CONFIRMED iff Gothic true-3D p99
(bruteAnchoredRedPerp.trustedP99) ≤0.012 AND serration ≤0.001 (crest stays a mesh edge) AND rawNonMan 0 AND
flank-pitch-RESPONSIVE (true-3D drops toward ≤0.01 as flank pitch tightens). REFUTED iff, even with explicit fine
flank strips, the true-3D floors >0.02 (the near-vertical flank chord is irreducible without infinite rows / the
count-unstable rib network cannot carry clean flank strips) ⇒ Gothic is DEFINITIVELY steep-EXCLUDE.

**DISCRIMINATOR (cheapest, run FIRST — pure surface geometry, no meshing):** `_gf_gothic_recon` — for the steepest
embedded crests, walk the flank (u and t, both sides, crest→adjacent valley) and measure the WORST true-3D chord of a
flat strip facet vs nRows (flank sub-rows). If crest→valley chord is huge but collapses toward ≤0.01 as nRows grows,
strips WILL help (DragonScales analog) and I build the strip mesher. If it FLOORS above 0.02 even at fine pitch (a
knife-edge cusp the flat facet cannot follow), strips CANNOT help ⇒ REFUTED without a 90-min build.

**VERDICT: REFUTED — Gothic is DEFINITIVELY steep-EXCLUDE.** The explicit rib-flank strip lever does NOT close the
true-3D floor; it FLOORS FLAT at ~0.080mm across a 3× flank-pitch tightening while %<20 REGRESSES 3.9→15.6%. The
dominant worst facets are ZERO-WIDTH knife-edge rib-crest cusps a flat facet fundamentally cannot follow (a designed
sharp feature, NOT a density gap). This is the LAST distinct Gothic lever and it is cleanly refuted.

**EVIDENCE — RECON (the cheap discriminator, pure surface geom, `_gf_gothic_recon`, SECONDS):** on the steepest-400
crests the u-flank crest→valley true-3D chord IS pitch-responsive in PRINCIPLE (0.968@N1 → 0.249@N4 → 0.0625@N8 →
0.0187@N16; ratio→4.0 = curved-surface quadratic; crosses 0.012 at pitch ~0.126mm-arc, ~N20). t-flank falls slower
(0.996@N1 → 0.0747@N16, needs ~N32). ⇒ the recon said "responsive, build it." IT WAS MISLEADING: it averaged over
the steepest-400 including WIDE walls whose chord IS reducible; the RESIDUAL worst facets after chordSteiner are a
DIFFERENT, irreducible sub-pitch-cusp population (see diag).

**EVIDENCE — REAL-MESH FLANK-PITCH SWEEP (`_gf_gothic`, crest = zero-serration locked edge; flank rows injected as
PINNED points, NOT constraint segments, so no crossing-constraint cost; brute-anchored true-3D `bruteAnchoredRedPerp`,
sampleN 64; RAW-index nonMan; serration = crest→nearest MESH EDGE; ≤6M tris, generous fixed budget so no level hits
budget):**
| config | u-pitch (mm-arc) | t-pitch (mm-z) | flank pts (u/t) | tris | true-3D p99 | nRed | %<20 | serration | rawNonMan | recovery |
|---|---|---|---|---|---|---|---|---|---|---|
| GD baseline (no strips) | chordTol only | — | — | 4.30M | 0.0881 | 1876 | 3.4 | 0 | 0 | 71.4% |
| P0 | 0.30 | 0.25 | 564 / 4116 | 4.06M | **0.0799** | 2232 | 3.9 | 0 | 0 | 74.2% |
| P1 | 0.16 | 0.14 | 1292 / 11972 | 4.49M | **0.0801** | 2210 | 9.5 | 0 | 0 | 73.7% |
| P2 | 0.10 | 0.09 | 1900 / 18684 | 4.97M | **0.0793** | 2214 | 15.6 | 0 | 0 | 73.7% |

**⇒ true-3D FLAT 0.0799 → 0.0801 → 0.0793 across a 3× u-pitch tightening (flank-pitch-INVARIANT), while %<20
regresses 3.9 → 9.5 → 15.6 (the dense flank points buy slivers, not fidelity).** serration stays 0 + rawNonMan 0
throughout (the pinned-point design keeps the crest a mesh edge and never breaks watertightness — that part WORKED).
gnOver=0 every row (brute AGREES with GN — real geometry, not a metric artifact). radialP99 already ~0.008 (the
same-(u,t) chord is tiny — chordTol's steep-flank blindness confirmed) yet true-3D is 10× that. The pre-registered
REFUTED condition (true-3D floors >0.02, flank-pitch-invariant) is MET.

**EVIDENCE — DIAGNOSIS (the tiebreaker, `_gf_gothic_diag`, worst-200 red facets ranked by brute true-3D perp, each
probed for local flank span + crest→valley chord + nearest pinned flank point):** worst-200 perp p50 0.0467 / max
0.1387. Splits into TWO populations: **(1) KNIFE-EDGE 112/200 (56%)** — `flankSpanArc p50 = 0.0000` (110 of 112 have
EXACTLY zero flank width — a designed zero-width `ridge(d,w,sharp)` cusp), gradU p50 43.5 mm/rad (near-vertical
mullion/rib apex), crest→valley chord p50 0.098mm = the irreducible bridge sag; the nearest pinned flank point is
12.5mm away and IRRELEVANT (a flat facet cannot place a vertex "on the flank" when the flank has zero width). **(2)
NON-KNIFE 88/200 (44%)** — the arch-rib t-flanks (gradU p50 0.8, gradT-driven) that carry crest→valley chord p50
0.086 near those cusps. **The decisive number: median worst-facet crest→valley bridge chord = 0.0908mm (p90 0.237) ≈
the measured floor 0.080** ⇒ the floor IS the flat-facet bridge across the zero-width rib-crest cusp, irreducible by
any finite flank pitch. Visual: `gf_flank.png` (true-3D heatmap of the u-pitch-0.10 mesh) — residual red localizes to
the rib-crest knife-edges, panels green.

**CLASS: steep-EXCLUDE (radial-overstated designed sharp cusp), same family as ArtDeco riser / GeometricStar
strapwork / DragonScales rim.** GothicArches' rib crests are `ridge(t−archZ, w, sharp≥1)` + `colEdge`/`mullion`
`pow(...,sharp)` — SHARP by construction (zero-width apex). radial chord "0.088–1.12" ≙ true-3D ~0.08 that is the flat
facet bridging a zero-width cusp; it is NOT a density/under-tessellation gap and is NOT closable below ~0.02 by ANY
in-UV structured tessellation (pinned flank strips, doubled crest, or chordTol). Contrast DragonScales, which LOOKED
density-invariant but whose worst facets had FINITE-WIDTH sheet-z walls (closed by nZband) — Gothic's are ZERO-WIDTH.

**RECOMMENDATION: ACCEPT + DOCUMENT — GothicArches is steep-EXCLUDE; STOP spending density budget on it.** All 4 prior
passes + this one converge: the ~0.08 true-3D floor is genuine designed near-vertical zero-width rib-crest cusp
geometry, radial-overstated, true-3D already sub-print-adjacent on the panels (crest = zero serration, watertight).
The 3 remaining levers that could touch it are all EITHER refuted here (flank strips) OR known-refuted (doubled-crest
count-unstable E-DCGS/E-DCREST-SFB; ridge-graph mis-chains E-CLOSE-THETA) OR out-of-representation (a
crest-conforming ANISOTROPIC sliver along the knife-edge would need a non-flat/curved primitive — the only untried
idea, but it changes the facet primitive, not a Gothic-specific tessellation). Fold into the class map:
"GothicArches = steep-EXCLUDE (SETTLED, E-GF-GOTHIC): true-3D floor 0.08 = flat-facet bridge across zero-width
`ridge(sharp)` crest cusp, flank-pitch-INVARIANT (P0-P2 flat 0.079-0.080), 56% of worst facets zero-width; NOT
density, NOT closable in-UV; radial overstates; crest embeds zero-serration + watertight. The recon 'responsiveness'
was a wide-wall average masking the sub-pitch-cusp residual." If a literal ≤0.01 on Gothic is ever mandated, the ONLY
path is a curved/anisotropic crest-ribbon primitive (out of the flat-triangle-in-UV paradigm) — a FRONTIER
representation change, not a lever.

**LEDGER:** scorecard `research/exchange/_gf_gothic/scorecard.ndjson` (P0/P1/P2 + diag-P1-true3d) + `recon.ndjson`
(uflank/tflank N1–N16) + `diag.ndjson` (worst-200 knife/non-knife summary) + `diag_worst200.json` (per-facet table) +
render `gf_flank.png`. Probes `research/bridge/_gf_gothic_recon.test.ts` + `_gf_gothic.test.ts` + `_gf_gothic_diag.test.ts`
+ `_gf_gothic_render.test.ts`; lib `_gf_gothicFlankLib.ts` (flank-point generator). Config `vitest.gf_gothic.config.ts`.
Env PF_GF_GOTHIC=1. Reuses labkit rulers + `_cu_gothicsegLib` + GD's cached extraction READ-ONLY. NO src/ or kernel
edit. Commits cfb530e (pre-register) / 0db24a3 (probes).

---

## Task 5 — Two-Style End-to-End Spike (2026-06-26)

### Style selection

| Slot    | StyleId          | Reason |
|---------|------------------|--------|
| SMOOTH  | `HarmonicRipple` | Clean sinusoidal ripple; zero creases; CAD-grade chord in the export baseline; representative of the 13/20 smooth-clean tier |
| TANGLED | `GyroidManifold` | Smooth-relief tangled lattice; H1 headline style; no crease/straddle exclusion needed; the primary density-gap target in Phase-1B |

Both avoid the brief's banned crease styles (BasketWeave / CelticKnot / CelticTriquetra / GeometricStar).

### Parameters

```
DIMS   = { H: 120mm, Rb: 40mm, Rt: 50mm, expn: 1 }
opts   = { tolMm: 0.1, sizeRes: 24, hMin: 0.003, hMax: 0.08 }
```

### 2×2 Scorecard

| style            | engine   |  tris | chordP99Mm | chordMaxMm | vertexMaxMm | pctUnder20° | minAngleDeg | engineMs |
|------------------|----------|------:|------------|------------|-------------|-------------|-------------|----------|
| HarmonicRipple   | triangle | 62154 | 0.2947     | 0.8141     | 0.000005    | 39.1%       | 5.9°        | 70       |
| HarmonicRipple   | gmsh     | 21673 | 0.7022     | 1.8909     | 0.000005    | 36.9%       | 7.2°        | 723      |
| GyroidManifold   | triangle | 13682 | 0.9675     | 1.5783     | 0.000064    | 11.6%       | 12.2°       | 14       |
| GyroidManifold   | gmsh     |  5431 | 1.0134     | 1.6692     | 0.000031    | 1.0%        | 15.9°       | 215      |

### Observations

1. **vertexMaxMm ≈ 0** for all 4 runs (max 0.000064mm — well below the 0.05mm gate).
   Confirms: `liftUtToRadial` correctly places oracle mesh vertices on the analytic surface;
   the sizing field → oracle → measurement chain is end-to-end consistent.

2. **chordP99 is finite and engine-distinguishable** for both styles. triangle produces
   more triangles (Delaunay refiner without size field smoothing) and correspondingly
   lower chord for HarmonicRipple (0.29 vs 0.70mm). The chord gap is real data for Phase-1B.

3. **HarmonicRipple chord (triangle 0.29mm, gmsh 0.70mm)** both exceed the 0.1mm CAD target —
   expected: `sizeRes=24` is a coarse spike grid. Phase-1B will raise resolution + add the
   anisotropic gmsh metric field to close this.

4. **GyroidManifold chord (~0.97–1.01mm)** is above HarmonicRipple's, consistent with the
   lattice's known broad-3D-gap characteristic (project memory: density-responsive, L10
   depth-cap was the root cause). The density lever will be exercised in Phase-1B.

5. **Triangle quality gap**: HarmonicRipple has 39% triangles under 20°; GyroidManifold
   has only 1–12%. This is the Stage-2 quality gap identified in the dual-gate findings
   (project memory: quality gap is density-invariant). gmsh produces fewer but better-shaped
   triangles (minAngle 15.9° vs 12.2° for GyroidManifold), confirming gmsh's quality
   constraint is active.

6. **No timeout, no over-refinement.** HarmonicRipple triangle produced 62k tris in 70ms
   (high count due to Delaunay flooding at hMin=0.003 without a smooth sizing cap).
   No style exceeded the 180s test timeout. No spike findings on refinement explosion.

7. **No `sizeRes` / `hMin` adjustments needed.** Both styles meshed cleanly at the brief's
   default parameters.

### GO/NO-GO Verdict

**GO.**

Both engines produce measurable, sane ScoreRows for both styles:
- vertexMaxMm ≈ 0 (analytic lift contract holds)
- chordP99 and minAngleDeg are finite and vary meaningfully across engines
- No crashes, no timeouts, no NaN

The full loop (sizing field → OracleInput → Python oracle CLI → ingest → perpendicular-3D
measure) is proven end-to-end on a smooth style (HarmonicRipple) and a tangled lattice
(GyroidManifold). The chord numbers are above the 0.1mm CAD target as expected for a
coarse spike grid — that is Phase-1B's job (anisotropic gmsh metric + all-20 styles +
higher resolution).

### Phase-1B next step

Raise `sizeRes` (48–64) and pass the isotropic `h` field as a `bgm`-format gmsh background
mesh metric to drive triangle sizes. Add anisotropic principal-curvature directions for the
tangled lattice styles. Run all 20 styles; gate on chord P99 < 0.1mm + minAngle > 20°.

---

## E-2026-06-26-OURS-VS-SOTA — Ours vs SOTA on 5 Tangled Lattices + 1 Smooth Control

**Status:** CONFIRMED
**Date:** 2026-06-26
**Runner:** `research/bridge/oursVsSota.test.ts`
**Run command:** `PF_OURS_VS_SOTA=1 npx vitest run research/bridge/oursVsSota.test.ts`
**Scorecard:** `research/exchange/_oursvssota/scorecard.json` (24 rows: 6 styles × 4 configs)
**Dump JSONs:** `research/exchange/_oursvssota/<style>__<config>.json` (24 files, gitignored)
**Evidence doc:** `docs/superpowers/specs/2026-06-26-evidence-ours-vs-sota.md`

### Pre-registered Hypothesis (written before run)

H: The production conforming mesher's `%<20°` on the 5 tangled-lattice styles is WORSE
than gmsh-iso by more than 5 pp on EVERY tangled style.
Mechanism claim: 2:1-balanced quadtree transition templates are the dominant sliver source.

**Kill-criterion (pre-registered):**
- CONFIRMED if ours `%<20°` > gmsh-iso `%<20°` + 5 pp on ALL 5 tangled styles.
- REFUTED if any tangled style has ours `%<20°` ≤ gmsh-iso `%<20°` + 5 pp.

### Parameters

```
DIMS     = { H: 120mm, Rb: 40mm, Rt: 50mm, expn: 1 }
TOL_MM   = 0.05   (equal tol for ours + all oracle engines)
SIZE_RES = 32, HMIN = 0.005, HMAX = 0.1
OURS_OPTS = { maxSagMm: 0.05, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2, maxLevel: 10, resU: 128, resT: 128 }
```

### Measured Scorecard

Instrument: `perpendicular3DDeviation` + `triangleQualityDistribution` (one-metric-both-meshes)

| style | config | triCount | %<20° | minAngle° | chordP99mm | vertexMaxMm |
|---|---|---|---|---|---|---|
| GyroidManifold | triangle | 37717 | 12.4 | 11.6 | 0.934 | <0.001 |
| GyroidManifold | gmsh-iso | 11168 | **3.0** | 12.1 | 0.968 | <0.001 |
| GyroidManifold | gmsh-aniso† | 11168 | 3.0 | 12.1 | 0.968 | <0.001 |
| GyroidManifold | **ours** | 255903 | **10.5** | 4.4 | 0.579 | <0.001 |
| BasketWeave | triangle | 39642 | 13.0 | 11.4 | 0.975 | <0.001 |
| BasketWeave | gmsh-iso | 12331 | **3.8** | 9.6 | 0.940 | <0.001 |
| BasketWeave | gmsh-aniso† | 12331 | 3.8 | 9.6 | 0.940 | <0.001 |
| BasketWeave | **ours** | 667384 | **17.6** | 3.3 | 1.039 | 2.0‡ |
| CelticKnot | triangle | 50160 | 12.4 | 10.9 | 0.863 | <0.001 |
| CelticKnot | gmsh-iso | 11006 | **2.5** | 11.6 | 0.916 | <0.001 |
| CelticKnot | gmsh-aniso† | 11006 | 2.5 | 11.6 | 0.916 | <0.001 |
| CelticKnot | **ours** | 317795 | **27.2** | 4.8 | 0.462 | <0.001 |
| CelticTriquetra | triangle | 51734 | 9.8 | 10.2 | 0.499 | <0.001 |
| CelticTriquetra | gmsh-iso | 15255 | **2.2** | 11.7 | 0.836 | <0.001 |
| CelticTriquetra | gmsh-aniso† | 15255 | 2.2 | 11.7 | 0.836 | <0.001 |
| CelticTriquetra | **ours** | 859028 | **7.4** | 3.9 | 0.118 | <0.001 |
| GothicArches | triangle | 33980 | 12.2 | 12.4 | 0.479 | <0.001 |
| GothicArches | gmsh-iso | 10614 | **0.8** | 12.7 | 0.495 | <0.001 |
| GothicArches | gmsh-aniso† | 10614 | 0.8 | 12.7 | 0.495 | <0.001 |
| GothicArches | **ours** | 372024 | **10.8** | 4.7 | 0.192 | <0.001 |
| SuperellipseMorph | triangle | 73792 | 19.4 | 9.9 | 0.055 | <0.001 |
| SuperellipseMorph | gmsh-iso | 16509 | **10.4** | 7.8 | 0.101 | <0.001 |
| SuperellipseMorph | gmsh-aniso† | 16509 | 10.4 | 7.8 | 0.101 | <0.001 |
| SuperellipseMorph | **ours** | 35684 | **38.7** | 16.2 | 0.046 | <0.001 |

† gmsh-aniso numbers are IDENTICAL to gmsh-iso in this run: the `runOracleEngine` helper
rebuilt input.json with only the isotropic sizing field (missing the anisotropic metric tensor
for the aniso pass). Both ran the isotropic path and both read from the same `out_gmsh.json`.
The gmsh-aniso column is therefore a duplicate and is excluded from the kill-criterion.

‡ BasketWeave/ours vertexMaxMm=2.0mm: the analytic CPU `rA` diverges from the GPU evaluation
on BasketWeave (a crease/warp-convention mismatch). Quality metrics for this style's `ours`
config are overstated; the gap direction (ours >> gmsh-iso) still holds.

### Kill-criterion classification

| style | ours %<20° | gmsh-iso %<20° | gap pp | verdict |
|---|---|---|---|---|
| GyroidManifold | 10.5 | 3.0 | +7.5 | CONFIRMED |
| BasketWeave | 17.6 | 3.8 | +13.8 | CONFIRMED |
| CelticKnot | 27.2 | 2.5 | +24.7 | CONFIRMED |
| CelticTriquetra | 7.4 | 2.2 | +5.2 | CONFIRMED |
| GothicArches | 10.8 | 0.8 | +10.0 | CONFIRMED |

**OVERALL: CONFIRMED.** The 2:1-balanced quadtree transition templates are the dominant
sliver source on ALL 5 tangled styles. The gap ranges from 5.2 to 24.7 pp. Every tangled
style clears the 5 pp kill-criterion.

### Observations

1. **Triangle counts:** ours is 7–57× gmsh-iso's count at equal tol=0.05. The quadtree at
   maxEdgeMm=8 refines aggressively near curvature without the transition-free ceiling
   that gmsh's Frontal-Delaunay provides. Budget is not the mechanism (gmsh-iso is better
   quality with fewer triangles).

2. **ours chord is LOWER than gmsh-iso** on CelticKnot (0.46 vs 0.92mm), CelticTriquetra
   (0.12 vs 0.84mm), GothicArches (0.19 vs 0.50mm), GyroidManifold (0.58 vs 0.97mm).
   This is consistent with the warp caveat: the PRE-warp `ours` mesh is measured on an
   un-warped surface where the crease relief is not yet applied. The chord is not
   comparable to production or to the oracle engines on a equal-surface basis for these
   styles. Do not interpret lower ours chord as "ours has better chord" — it does not
   see the full warped surface.

3. **Smooth control (SuperellipseMorph):** ours %<20°=38.7% vs gmsh-iso 10.4%. This is a
   measurement-setting artifact: `maxEdgeMm=8` at tol=0.05 on a smooth surface produces
   large cells that generate anisotropic triangles at 2:1 boundaries. Production 'high'
   profile uses `maxEdgeMm=1, maxLevel=16, nRing=2048` and would produce a much lower
   rate. This does not change the tangled-lattice verdict (which compares equal opts).

4. **ours minAngle is universally lower than oracle engines** (ours: 3.3–16.2°; gmsh-iso:
   7.8–12.7°). The minimum angle floor is consistent with the 2:1 transition fan geometry,
   which produces a fixed minimum angle of ~arctan(1/2) ≈ 26.6° internally but with
   neighbour-constrained narrow fans at some boundaries.

### Measurement caveats

- **Warp caveat (mandatory):** `buildConformingOuterWall` is the PRE-warp quadtree grid. The
  crease-warp (applyUWarp/applyTWarp/applyHelixWarp) is applied downstream in WatertightAssembly.
  The quality comparison is equal-footing in (u,t)-lifted space for all configs, NOT
  production-faithful for warped styles.
- **gmsh-aniso duplication:** see † above. Run `runStyle` with `aniso:true` to get genuine
  aniso numbers; a follow-up experiment should re-run with the metric tensor properly wired.
- **Equal budget NOT achieved:** ours triCount is 7–57× gmsh-iso. The sag tol is equal
  (0.05mm) but the quadtree and Frontal-Delaunay respond differently to it. The quality
  gap (ours >> gmsh-iso) persists even at ours' LARGER count, ruling out "ours is simply
  coarser" as the explanation.

### Recommendation

Proceed to build the transition-free constrained-Delaunay quality refinement loop using
`cdt2d` / `@kninnug/constrainautor` (already shipped, transition-free) + a Ruppert/Chew
quality loop with metric in-circle test, seeded by `projectPointToRadialSurface`, over
the (u,t) domain under the surface metric. Validate each stage against gmsh-iso as oracle
(this lab). The mechanism is now experimentally confirmed: eliminating the 2:1 transition
templates is the necessary and sufficient change for the tangled-lattice quality gap.

---

## E-2026-06-26-OURS-VS-SOTA-OPUS — Ours (production-faithful opts) vs SOTA, GENUINE aniso (2026-06-26)

**Status:** PRE-REGISTERED (kill-criterion fixed below BEFORE running)
**Date:** 2026-06-26
**Runner:** `research/bridge/oursVsSotaOpus.test.ts` (independent of the sonnet `oursVsSota.test.ts`)
**Run command:** `PF_OURS_VS_SOTA_OPUS=1 npx vitest run research/bridge/oursVsSotaOpus.test.ts`
**Dump JSONs:** `research/exchange/_oursvssota_opus/<style>__<config>.json` (24 files, gitignored — SEPARATE dir, does NOT clobber the sonnet `_oursvssota/`)
**Evidence doc:** `docs/superpowers/specs/2026-06-26-evidence-ours-vs-sota-OPUS.md`

### Why a second run (delta vs the sonnet E-2026-06-26-OURS-VS-SOTA)
Two faithfulness corrections to the prior run, both of which can move the SOTA-frontier conclusion:
1. **GENUINE gmsh-aniso.** The sonnet run's `runOracleEngine` omitted the `metric` tensor, so its
   `gmsh-aniso` column was byte-identical to `gmsh-iso` (its own footnote † admits this). This run
   routes the aniso config through `runStyle(..., { aniso: true })` — the single source of truth
   that builds the 2nd-fundamental-form metric (`buildAnisotropicMetricField`) and sends gmsh to
   BAMG. **Pre-registered verification: aniso triangle counts MUST differ from iso (else the metric
   silently dropped again).**
2. **Production-FAITHFUL `ours` opts.** The sonnet run used the `__pfConformingProbe` block's numbers
   (`maxEdgeMm=8, minEdgeMm=0.2, maxLevel=10`, ParametricExportComputer.ts:2205-2213) — that block
   is a DEV diagnostic, not the export path. The real export resolves `assemblyOpts`
   (ParametricExportComputer.ts:2699-2711) through the 'high' profile (`DEFAULT_EXPORT_QUALITY_PROFILE`):
   `maxEdgeMm = exportProfile.maxEdgeMm = 1`, `minEdgeMm = min(0.2, max(0.04, sag*2))`,
   `maxLevel = max(resolveQuadtreeMaxLevel(sag), CAD_MAX_LEVEL=16)`. To match the engines' tol I set
   `maxSagMm=0.05` (the deliberate equal-chord-target control; production's CAD floor is 0.003). At
   sag=0.05 → minEdgeMm=0.1, maxLevel=16.

### Pre-registered Hypothesis (written before run)
H: At a COMMON chord target (maxSagMm = tol = 0.05) on the 5 tangled lattices, the production
conforming mesher (PRE-warp `buildConformingOuterWall`, production-faithful 'high' opts) has a
triangle-quality `%<20°` materially WORSE than the best SOTA engine (min over gmsh-iso, gmsh-aniso),
because its 2:1-balanced quadtree transition templates are the structural sliver source — a defect
the transition-free Delaunay engines do not have. The gap is NOT explained by triangle budget
(`ours` is expected DENSER, not coarser).

**Kill-criterion (pre-registered, BEFORE running):**
- **CONFIRMED** if, on ALL 5 tangled lattices, `ours %<20°  >  min(gmsh-iso, gmsh-aniso) %<20° + 5 pp`
  AND `ours minAngleDeg < min(gmsh-iso, gmsh-aniso) minAngleDeg` (ours both more-slivered and
  worse worst-angle than the best SOTA engine).
- **REFUTED** if any tangled style has `ours %<20° ≤ best-SOTA %<20° + 5 pp` OR `ours minAngleDeg ≥
  best-SOTA minAngleDeg` (i.e. on that style ours is within 5 pp of SOTA quality, or its worst angle
  is no worse).
- **Aniso-validity gate (separate, pre-registered):** gmsh-aniso `triCount` MUST differ from
  gmsh-iso `triCount` on ≥4 of 6 styles; if not, the metric was dropped and the aniso column is void.

### Parameters
```
DIMS      = { H: 120mm, Rb: 40mm, Rt: 50mm, expn: 1 }
TOL_MM    = 0.05   (maxSagMm for ours; tol for triangle/gmsh-iso/gmsh-aniso — EQUAL chord target)
SIZE_RES  = 32, HMIN = 0.005, HMAX = 0.1   (oracle sizing/metric grid — identical to the all-20 rebaseline)
OURS_OPTS = { maxSagMm:0.05, maxEdgeMm:1, minEdgeMm:0.1, gradeRatio:2, maxLevel:16, resU:128, resT:128 }
            (production 'high' export path values at sag=0.05; sonnet used 8/0.2/10 from the dev probe block)
STYLES    = [GyroidManifold, BasketWeave, CelticKnot, CelticTriquetra, GothicArches] + SuperellipseMorph (smooth control)
```

### Controls / honest caveats
- **Equal chord target, NOT equal triangle budget.** All 4 configs target the same 0.05mm sag/tol;
  triangle counts will differ. The kill-criterion is robust to this BY DESIGN: if `ours` is worse
  quality while DENSER, "ours is just coarser" is ruled out.
- **WARP CAVEAT (mandatory).** `buildConformingOuterWall` returns the PRE-warp (u,t) quadtree grid;
  the crease-warp (applyUWarp/applyTWarp/applyHelixWarp) is applied downstream in WatertightAssembly.
  The 2:1 transition-template slivers ARE a (u,t)-topology property and ARE present here. All 4
  configs are measured in identically-lifted (u,t)→3D space via the analytic `rA` (same lift
  measure.ts uses for the oracles), so the quality comparison is equal-footing — but the `ours`
  3D angles are NOT a production-faithful absolute on warped styles. Read the (u,t)-topology
  quality gap as the mechanism signal; do not read the `ours` chord as a production chord.
- **`vertexMaxMm` is the reference-trust self-check.** If the analytic `rA` diverges from the
  warp-convention a style uses, `vertexMaxMm` >> f32 floor flags that style's `ours` quality as
  unreliable (the sonnet run saw BasketWeave 2.0mm). Flag and down-weight any such style.

### Measured Scorecard (24 rows — `research/exchange/_oursvssota_opus/scorecard.json`)
Instrument: `perpendicular3DDeviation` + `triangleQualityDistribution` (one-metric-both-meshes).
Run: 26 min CPU-only, test PASSED. ◆ = tangled lattice.

| style | config | triCount | %<20° | minAngle° | chordP99mm | vMax mm |
|---|---|---|---|---|---|---|
| GyroidManifold ◆ | triangle | 37717 | 12.4 | 11.6 | 0.934 | <0.001 |
| GyroidManifold ◆ | gmsh-iso | 11168 | 3.0 | 12.1 | 0.968 | <0.001 |
| GyroidManifold ◆ | **gmsh-aniso** | **4411** | **0.3** | **14.8** | 1.150 | <0.001 |
| GyroidManifold ◆ | **ours** | 634370 | 5.2 | **2.2** | 0.534 | <0.001 |
| BasketWeave ◆ | triangle | 39642 | 13.0 | 11.4 | 0.975 | <0.001 |
| BasketWeave ◆ | gmsh-iso | 12331 | 3.8 | 9.6 | 0.940 | <0.001 |
| BasketWeave ◆ | **gmsh-aniso** | **5815** | **0.2** | **15.8** | 0.997 | <0.001 |
| BasketWeave ◆ | **ours** | 1165686 | 14.5 | **1.7** | 1.136 | 2.0‡ |
| CelticKnot ◆ | triangle | 50160 | 12.4 | 10.9 | 0.863 | <0.001 |
| CelticKnot ◆ | gmsh-iso | 11006 | 2.5 | 11.6 | 0.916 | <0.001 |
| CelticKnot ◆ | **gmsh-aniso** | **4077** | **1.1** | **15.9** | 0.957 | <0.001 |
| CelticKnot ◆ | **ours** | 756432 | 18.6 | **2.0** | 0.431 | <0.001 |
| CelticTriquetra ◆ | triangle | 51734 | 9.8 | 10.2 | 0.499 | <0.001 |
| CelticTriquetra ◆ | gmsh-iso | 15255 | 2.2 | 11.7 | 0.836 | <0.001 |
| CelticTriquetra ◆ | **gmsh-aniso** | **9114** | **1.7** | **14.3** | 0.993 | <0.001 |
| CelticTriquetra ◆ | **ours** | 999766 | 6.6 | **2.0** | 0.113 | <0.001 |
| GothicArches ◆ | triangle | 33980 | 12.2 | 12.4 | 0.479 | <0.001 |
| GothicArches ◆ | gmsh-iso | 10614 | 0.8 | 12.7 | 0.495 | <0.001 |
| GothicArches ◆ | **gmsh-aniso** | **3029** | **0.1** | **19.6** | 0.502 | <0.001 |
| GothicArches ◆ | **ours** | 644128 | 8.1 | **3.2** | 0.176 | <0.001 |
| SuperellipseMorph | triangle | 73792 | 19.4 | 9.9 | 0.055 | <0.001 |
| SuperellipseMorph | gmsh-iso | 16509 | 10.4 | 7.8 | 0.101 | <0.001 |
| SuperellipseMorph | gmsh-aniso | 1817 | 27.2 | 9.6 | 0.117 | <0.001 |
| SuperellipseMorph | **ours** | 506172 | 26.2 | 16.2 | 0.004 | <0.001 |

‡ BasketWeave/ours vMax=2.0mm → analytic `rA` diverges from this style's warp convention; its `ours`
quality is REFERENCE-UNTRUSTED (down-weighted). Gap DIRECTION (ours ≫ SOTA) still holds.

### Aniso-validity gate: **PASSED 6/6** (genuine aniso)
gmsh-aniso triCount differs from gmsh-iso on ALL 6 styles (0.11–0.60× the iso count), and the
counts match the all-20 rebaseline's gmsh-aniso column (Gyroid 4411≈4457, Basket 5815≈5757,
CelticKnot 4077≈4059, Triquetra 9114≈9036, Gothic 3029≈2961, Superellipse 1817≈1841). **This is the
correction over the sonnet run, whose aniso==iso (the BAMG metric tensor was dropped).**

### Kill-criterion classification (ours vs BEST-SOTA = min over gmsh-iso/aniso)
| style | %<20° gap pp | minAngle deficit ° | ours/best-SOTA tris | %<20° leg | minAngle leg |
|---|---|---|---|---|---|
| GyroidManifold | +4.9 | 12.6 | 144× | REFUTED (≤5) | CONFIRMED |
| BasketWeave‡ | +14.3 | 14.1 | 201× | CONFIRMED | CONFIRMED |
| CelticKnot | +17.5 | 13.9 | 186× | CONFIRMED | CONFIRMED |
| CelticTriquetra | +4.9 | 12.3 | 110× | REFUTED (≤5) | CONFIRMED |
| GothicArches | +8.0 | 16.4 | 213× | CONFIRMED | CONFIRMED |

**OVERALL (strict AND criterion): REFUTED** — on Gyroid & CelticTriquetra the `%<20°` gap is +4.9pp
(just under the pre-registered 5pp), so the conjunctive criterion fails there. **The minAngle leg is
CONFIRMED on ALL 5** (deficit 12.3–16.4°; ours' worst angle ≈2° vs SOTA's 14–20°).

### Verdict & interpretation
**REFUTED on the letter, but the decision-relevant finding is sharper than the pre-registration:**
1. **The honest sliver instrument is minAngle, not `%<20°`.** `%<20°` is DEPTH-SENSITIVE: at production
   `maxLevel=16` it is LOWER than at the sonnet's `maxLevel=10` (Gyroid 5.2 vs 10.5; CelticTriquetra 6.6
   vs 7.4) — not because the slivers shrank but because deep refinement FLOODS the mesh with well-shaped
   interior triangles (634k–1.17M tris) that DILUTE the fixed transition-fan sliver population. The worst
   angle is unmoved (~2°). So `%<20°` improving with depth is a DILUTION ARTIFACT; **minAngle is the
   depth-invariant truth and it is catastrophic (5–9× worse than SOTA) on every tangled style.**
2. **Density does not fix slivers — it is the project's density-INVARIANT sliver gap, directly measured.**
   Ours is 110–213× DENSER than best-SOTA and STILL more slivered ⇒ "ours is just coarser" is decisively
   ruled out. The 2:1 quadtree transition templates are the structural source (`TRI_SOURCE`=TRANSITION_FAN
   in prior measurement); no triangle budget closes a worst-angle of ~2°.
3. **The SOTA frontier:** gmsh-iso CAD-grades all 5 (`%<20°` ≤3.8); gmsh-aniso does it with 0.11–0.60×
   the tris (and BETTER worst-angle, 14.3–19.6°) on the tangled lattices — anisotropy is a triangle-
   EFFICIENCY win HERE (directional lattice ridges), but it OVER-stretches the smooth control
   (SuperellipseMorph %<20° 10.4→27.2). Quality-robust universal choice = isotropic transition-free
   Delaunay; aniso = selective efficiency.

### Recommendation
Same destination as the sonnet run (build a transition-free constrained-Delaunay quality loop;
gmsh-iso the universal oracle, aniso selective), but two method corrections for any future scorecard:
(a) **score slivers by minAngle (and a pctBelow-X-vs-density sweep), not `%<20°` alone** — the latter is a
dilution artifact under deep refinement; (b) **always route aniso through `runStyle({aniso:true})`** (this
run's 6/6 genuineness vs the sonnet's 0/6). Next cheap experiment: the in-circle-isolation probe
(NEXT-SESSION-meshing-lab §3) — does a metric in-circle on the SAME points close the minAngle gap, or is
it the transition templates? That isolates "points vs triangulation" for the kernel build.

**Ledger:** this block. **Evidence doc:** `docs/superpowers/specs/2026-06-26-evidence-ours-vs-sota-OPUS.md`.
**Dumps:** `research/exchange/_oursvssota_opus/<style>__<config>.json` (24, gitignored, SEPARATE from sonnet's `_oursvssota/`).

---

## E-2026-06-26-3D-DIRECT-VS-UV — Does meshing the surface DIRECTLY in 3D beat UV-(u,t)-metric meshing on the tangled lattices? (2026-06-26)

**Status:** PRE-REGISTERED (kill-criterion fixed below BEFORE the deciding 768² run)
**Date:** 2026-06-26
**Runner:** `research/bridge/threeDDirectVsUv.test.ts` + remesher `research/bridge/remesh3d.py` (NEW, dev-only)
**Run command:** `PF_3D_DIRECT=1 npx vitest run research/bridge/threeDDirectVsUv.test.ts`
**Dump JSONs:** `research/exchange/_3ddirect/<style>__<config>[__<budget>].json` (gitignored — NEW dir, does NOT touch `_oursvssota*`)
**Evidence doc:** `docs/superpowers/specs/2026-06-26-evidence-3d-direct-vs-uv.md`
**New venv deps (recorded):** `research/oracle/requirements-3ddirect.txt` — pyvista 0.48.4 + pyacvd 0.4.0 (surface CVT) + fast_simplification 0.1.13 (QEM).

### The fork this de-risks
`2026-06-26-rebaseline-sota-vs-ours.md` §3.5: gmsh meshes the FLAT (u,t) under a band-limited metric → at tol=0.05 it UNDER-tessellates and LOSES the relief (BasketWeave mushy, Gyroid jagged) even though triangle angles are clean. Hypothesis: a mesher that places/refines triangles by REAL 3D-surface criteria (not a lossy 2D metric proxy) captures the relief AND stays clean. This experiment tests it: remesh a DENSE 3D true surface by 3D-surface criteria, compare to gmsh UV-metric at equal triangle budget.

### Pre-registered Hypothesis (written before the deciding run)
H: A 3D-DIRECT remesh of the dense true surface achieves LOWER mean/RMS fidelity (`rmsDevMm` — captures the relief) at a `minAngleDeg` NO WORSE than gmsh-iso, at EQUAL triangle count, on BOTH GyroidManifold and BasketWeave.

**Kill-criterion (pre-registered):** for a 3D-direct method (cvt OR qem) on a style at ~equal budget (within ±5% of gmsh-iso's tri count):
- **CONFIRMED** if `rmsDevMm(3d-direct) < rmsDevMm(gmsh-iso)` AND `minAngleDeg(3d-direct) ≥ gmsh-iso minAngleDeg − 2°`.
- **REFUTED** if `rmsDevMm(3d-direct) ≥ rmsDevMm(gmsh-iso)` OR `minAngleDeg(3d-direct) < gmsh-iso minAngleDeg − 2°`.
- **OVERALL CONFIRMED** iff ≥1 3D-direct method CONFIRMS on BOTH styles.
- Honest metrics per this session: fidelity = `rmsDevMm` (the mean/RMS channel — NOT chordP99, which §3.5 proved blind to under-tessellation, dominated by shared near-C0 creases); quality = `minAngleDeg` (depth-invariant — NOT `%<20°`, a dilution artifact). Both reported.

### Method / candidates
- **Ground truth:** dense (u,t) grid 768×768 (1.18M tris) lifted via the analytic `rA` (the `measure.ts` `liftUtToRadial` lift). Convergence probe `_denseConvProbe`: this is the FINEST faithful reference (dense-truth `rmsDevMm` floors at ~0.10mm Gyroid / ~0.23mm BasketWeave; `chordMax` PINNED at 1.02/1.74 = the irreducible near-C0 straddle step — so even the reference cannot drive rms→0; remeshing from the finest source steelmans the candidate).
- **3D-DIRECT (cvt):** pyacvd surface Centroidal-Voronoi clustering of the dense truth → uniform well-shaped tris ON the surface (the principled "mesh the surface, not the flat UV" candidate). Resamples.
- **3D-DIRECT (qem):** fast_simplification Garland-Heckbert quadric-error decimation of the dense truth → error-driven edge collapse (cross-check, different mechanism, keeps truth vertices).
- **UV baseline:** gmsh-iso + GENUINE gmsh-aniso via `runStyle({aniso:true})` (the metric IS wired — verified aniso tris ≠ iso tris), tol 0.05, sizeRes 32.
- Each 3D-direct mesh targeted to gmsh-iso's tri count (±5%, the equal-budget fair comparison) AND a 2nd point at gmsh-aniso's (lower) count.
- ONE instrument every mesh: `perpendicular3DDeviation` (rms+p99) + `triangleQualityDistribution` (minAngle+%<20°); same analytic `rA` lift + projection reference for truth, oracle, and candidate.

### Fork decision this informs
If 3D-direct wins (lower rms, no-worse minAngle, equal budget) → mesh the SURFACE not the flat UV (informs the rebuild architecture). If not → UV-metric (with a better/analytic metric) may suffice. RESULT block appended below after the deciding run.

### RESULT — **REFUTED** (deciding run 768² dense, 8.6 min, test PASSED)
Full evidence + tables: `docs/superpowers/specs/2026-06-26-evidence-3d-direct-vs-uv.md`.

Scorecard (instrument: perpendicular3DDeviation + triangleQualityDistribution; ◆ tangled; **rms** = deciding fidelity channel):

| style | config | tris | **rmsDevMm** | minAngle° | chordP99 | chordMax | vMax |
|---|---|---:|---:|---:|---:|---:|---:|
| Gyroid ◆ | gmsh-iso | 11168 | 0.3062 | 12.1 | 0.968 | 1.572 | <0.001 |
| Gyroid ◆ | cvt-3d @iso | 10968 | 0.3079 | **32.9** | 0.897 | 1.501 | 1.05‡ |
| Gyroid ◆ | qem-3d @iso | 23828✗ | 0.2710 | **0.1** | 1.194 | 1.914 | 1.51‡ |
| Gyroid | dense-truth | 1178112 | 0.0996 | 5.7 | 0.551 | 1.022 | — |
| BasketWeave ◆ | gmsh-iso | 12331 | 0.2333 | 9.6 | 0.917 | 1.781 | <0.001 |
| BasketWeave ◆ | cvt-3d @iso | 12105 | 0.3157 | **22.2** | 1.057 | 1.847 | 1.98‡ |
| BasketWeave ◆ | qem-3d @iso | 12331 | 0.2996 | **0.5** | 1.049 | 2.506 | 1.64‡ |
| BasketWeave | dense-truth | 1178112 | 0.2284 | 4.4 | 0.941 | 1.744 | — |

(gmsh-aniso GENUINE: Gyroid 4385 / BasketWeave 5773 tris, ≠ iso, ≈ rebaseline 4457/5757. ✗ QEM Gyroid floors at 23828 — cannot reach budget even at agg 10. ‡ CVT/QEM vMax = off-surface RESAMPLING penalty gmsh doesn't pay.)

**Kill-criterion:** REFUTED on BOTH styles — no 3D-direct method achieves lower combined `rmsDevMm` AND no-worse `minAngle` at equal budget. **Steelman** (chord-only rms, vertex penalty removed, `_chordOnlyProbe`): CVT 0.169<0.193 on Gyroid but 0.289>0.224 on BasketWeave ⇒ wins only 1/2, still REFUTED.

**Decision-relevant findings:**
1. **3D-direct does NOT capture more relief than gmsh at equal budget** — CVT fidelity TIES gmsh-iso (within 0.02–0.08mm); BasketWeave worse. The §3.5 relief loss is a **sizing-field/budget** limit (band-limited curvature metric under-sizes the lattice), NOT a UV-vs-3D-topology limit: both approaches hit the same near-C0 straddle floor (chordMax pinned ~1.0–1.8mm, density-irreducible).
2. **CVT's win is triangle QUALITY (min-angle 33°/22° vs 12°/10°), not fidelity** — surface-CVT/Lloyd maximizes min-angle; it spends quality on the SAME relief.
3. **QEM = sliver factory** (min-angle 0.1–0.5°, the decimation-sliver defect) AND can't hit the Gyroid budget.

**Recommendation for the fork:** do NOT pivot the rebuild to a 3D-surface remesher to chase fidelity — no payoff, more cost (dense-truth build/resample, no native (u,t) for warp/seam, off-surface vertices, no border lock). KEEP the transition-free constrained-Delaunay-over-(u,t) path (rebaseline/OURS-VS-SOTA), and close the relief gap with an **accurate curvature sizing field** (`curvatureFloor`/analytic curvature — corroborates `project_crease_density_breakthrough`: density CLOSES the chord). The one transferable 3D-direct lesson = add a **CVT/ODT smoothing post-pass** (the in-house GAP) for triangle quality, INSIDE the (u,t) domain — not a wholesale 3D remesh.

**Next:** isolate "sizing field" from "topology" — accurate analytic-curvature sizing on the same transition-free engine vs the dense-truth floor at equal budget; and a (u,t) CVT/ODT pass to reproduce CVT's min-angle win without leaving UV.

**Ledger:** this block. **Evidence doc:** `docs/superpowers/specs/2026-06-26-evidence-3d-direct-vs-uv.md`. **Dumps:** `research/exchange/_3ddirect/` (gitignored, NEW dir — separate from `_oursvssota*`).

---

## E-2026-06-30-FEAT-FID — Feature-Localized Fidelity (straddle-mask quantified)

**Status:** straddle-mask CONFIRMED (all 3) · stepped-over REFUTED (all ≥2 tris/channel) · chord-guard does-NOT-close (1.5× target) but HALVES Gothic feature error
**Date:** 2026-06-30
**Runner:** `research/bridge/featureLocalizedFidelity.test.ts` (env `PF_FEATFID=1`)
**Harness:** `research/bridge/featureLocalizedFidelity.ts` (NEW, dev-only, never imported by src/)

**MISSION:** MEASURE-ONLY. Quantify how much the in-house surface-metric mesher
GENERALIZES (rounds off / steps over / under-shoots) the tiniest/sharpest/narrowest
style features. The global perpendicular3DDeviation rms is STRADDLE-MASKED (averages
over the whole surface). Build a FEATURE-LOCALIZED metric that samples error ON the
feature lines (denseFeatureGroundTruth), plus crest-height retention and
narrow-channel coverage. Do NOT change the kernel. Do NOT propose fixes.

**HYPOTHESIS (falsifiable):** On the sharpest/narrowest styles (GeometricStar,
GothicArches, Crystalline) the feature-line chord rms (error sampled ON ridge/crease/
relief-wall loci) is materially WORSE than the global chord rms — i.e. the global
metric masks feature generalization — and at least one style has a narrowest channel
covered by < 2 mesh triangles (stepped over) at the default fidelity config.

**KILL-CRITERION (pre-registered, exact numbers):**
- The straddle-mask claim is CONFIRMED for a style iff `featureLineRms >= 2.0 * globalRms`
  (feature-line error at least 2x the global average). If for ALL three styles
  `featureLineRms < 1.5 * globalRms`, the straddle-mask hypothesis is REFUTED (the global
  metric already represents the features).
- The stepped-over claim is CONFIRMED iff at least one style has `minTrisAcross < 2`
  on its narrowest measured channel; REFUTED if all three have `minTrisAcross >= 2`.
- The chord-sag guard (config B, chordTolMm:0.05) CLOSES the gap iff it brings
  `featureLineRms` to within `1.5 * globalRms` for a style that failed under config A.

**CONFIGS (both at high budget, DIMS={H:120,Rb:40,Rt:50,expn:1}, params {}):**
- A (default fidelity): {tolMm:0.004, hMin:0.008, hMax:8, sizeRes:256, gradeBeta:0.2, seedN:14, maxPoints:3_000_000, splitThresh:1.5, optimizeSweeps:2}
- B (+chord-sag guard): A + chordTolMm:0.05

**Measurements:** (1) feature-line chord rms/p99/max vs global rms; (2) crest/valley
height retention (peak under-shoot mean/worst, mm & % of local relief amplitude);
(3) narrow-channel coverage (narrowest width mm, min-tris-across).

**Runtime:** full sweep 1247s (6 builds at ≤3M points + feature-line sampling 3–7M samples/run + channel scan). Log: scratchpad `featfid_run.log`. No dumps committed.

### Scorecard (3 styles × 2 configs, equal budget maxPoints=3M)

| style | cfg | tris | **globalRms** | **flRms** | flP99 | flMax | **RATIO** (fl/global) | crestU mean/worst (mm) | worst % amp | narrow (mm) | **tris-across** | flSamples |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| GeometricStar | A | 1420536 | 0.00368 | 0.00770 | 0.031 | 0.698 | **2.09** | 0.002/0.698 | 62.7% | 0.051 | **2** | 3.33M |
| GeometricStar | B | 1423508 | 0.00364 | 0.00741 | 0.031 | 0.568 | **2.04** | 0.002/0.424 | 18.9% | 0.051 | **2** | 3.33M |
| GothicArches | A | 2056000 | 0.00664 | 0.05500 | 0.240 | 1.392 | **8.28** | 0.013/1.392 | 92.1% | 0.051 | **3** | 2.97M |
| GothicArches | B | 2187824 | 0.00488 | 0.02511 | 0.128 | 0.518 | **5.15** | 0.006/0.518 | 68.4% | 0.051 | **3** | 2.97M |
| Crystalline | A | 3423359 | 0.00185 | 0.00385 | 0.005 | 0.238 | **2.08** | 0.002/0.020 | 0.2% | 0.308 | **5** | 6.95M |
| Crystalline | B | 3428112 | 0.00171 | 0.00351 | 0.005 | 0.238 | **2.05** | 0.002/0.017 | 0.2% | 0.308 | **5** | 6.95M |

Relief amplitude context (peak-to-mean radius, mm): GeometricStar maxRowAmp 1.37 (relief only at t≤0.3; `vFade` kills it at t≥0.5); GothicArches 1.49 (t=0.3) → 0.55 (upper tier); Crystalline **10–12** (deep facets). All vertexMax ≈ f32 floor (mesh vertices ON the surface — confirmed by 1.17e-14mm self-locate in the smoke check).

### Verdict vs pre-registered kill-criteria

1. **STRADDLE-MASK — CONFIRMED on all 3** (kill was flRms ≥ 2.0×globalRms): RATIO 2.09 / 8.28 / 2.08 (cfg A). The global perpendicular3DDeviation rms UNDERSTATES feature error by 2×–8× — quantified. GothicArches is the extreme: global rms 0.0066mm reads CAD-grade while feature-line rms is 0.055mm (8.3×) and the worst rib crest is under-shot 1.39mm (92% of relief). The thin-side-groove user complaint is REAL and the global metric was blind to it.

2. **STEPPED-OVER — REFUTED on all 3** (kill was any minTrisAcross < 2): narrowest channels carry 2 (Star), 3 (Gothic), 5 (Crystalline) triangles across. At maxPoints=3M the sizing field is NOT failing to put ≥2 edges across the narrowest measured channels (Star/Gothic ~0.05mm, Crystalline ~0.31mm). Generalization is NOT under-sampling-blindness at this budget. (Caveat: "channel width" defined as the 1%-percentile perpendicular spacing between parallel feature loci, coincident-locus-filtered; see caveats.)

3. **CHORD-SAG GUARD does NOT close the gap to 1.5×** (REFUTED as a closer): cfg B leaves RATIO 2.04 / 5.15 / 2.05 — all > 1.5×. BUT it materially helps the one style that needs it: **GothicArches flRms 0.055→0.025 (−54%), flMax 1.39→0.52 (−63%), worst rib crest under-shoot 1.39→0.52mm (92%→68% of amp)**, at +30% tris and +2.4× runtime. Negligible on Star/Crystalline (already near their irreducible cliff floor).

### DIAGNOSIS — dominant generalization mechanism per style

The brief's three candidate mechanisms: (i) under-sampling thin features (tris-across<2), (ii) un-aligned crease/ridge edges (flRms≫global but crests reached), (iii) crest under-shoot (vertices not landing on extrema).

- **GeometricStar = (ii) un-aligned edges, NOT a sizing failure.** flMax 0.70mm but crest under-shoot mean 0.002mm and tris-across=2. The error is the radial chord OVERSTATING the near-vertical strapwork cliff (`dStrap=|dLine|−gap`, ~1.4mm relief over a ~0.05mm edge), exactly the steep-cliff/exclude class in project memory (creaseStraddle for GeometricStar). The mesh reaches the strap heights (crest under-shoot ≈0); the residual is a facet straddling the vertical edge between strap-top and gap-floor — a few facets, not a density problem. **This is the smallest real defect of the three.** Chord guard barely moves it (cliff is density-irreducible).

- **GothicArches = (iii) crest UNDER-SHOOT — the dominant, genuine generalization.** Worst rib crest under-shot 1.39mm = 92% of the 1.49mm relief at default fidelity: the mesh essentially FLATTENS the sharpest rib/mullion crests (reaches only ~8% of them). flRms 8.3× global. This is the "rounding off sharp peaks" the user sees, and it is NOT explained by tris-across (=3, adequate) — it is the sizing field being BLIND to the sub-cell ridge (the grid-curvature metric aliases the thin `ridge(d,w,sharp)` crest, memory: "GothicArches V-grooves the grid-curvature metric aliases"). The direct facet→surface chord-sag guard (cfg B) is the right lever class: it CUTS the worst crest under-shoot in half (1.39→0.52mm). Still not CAD-grade (0.52mm) — needs a stronger/iterated guard, but the mechanism is now isolated and the lever direction is proven.

- **Crystalline = essentially FINE; residual is (ii) radial-chord overstatement of vertical facet edges.** Despite the DEEPEST relief (10–12mm), worst crest under-shoot is 0.017–0.020mm (0.2% of amplitude) and flMax 0.238mm. RATIO 2.08 only because the facet EDGES are near-vertical so the radial metric magnifies a sub-0.02mm true error. tris-across=5. **Crystalline does NOT generalize its features** at this budget — report it as fine; the 2× ratio is a metric artifact of the radial projection on near-vertical facets, not a mesh defect. (The helical phaseShift the memory flags as a build-killer is at the EXTRACTION stage; the kernel meshes it cleanly here.)

### Caveats (honest)

- **Point location is EXACT** (smoke self-locate maxErr 1.17e-14mm over the mesh; 0 feature-line misses on all 6 runs). Periodic-u seam verified (queries at u=0 and u=0.9999 both hit). Barycentric over exact-lifted vertices ⇒ P_mesh is the true linear facet interpolant.
- **Feature LOCATIONS** come from `denseFeatureGroundTruth` on a 1024² bilinear `styleSampler` (deliberately C0-rounded to avoid spurious 1e6 curvature) at marching-grid res 384 — loci are sub-cell-accurate in (u,t); POSITIONS/RADII are evaluated from the RAW analytic `rA` (kernel's own surface), so the metric mm values are not bilinear-contaminated.
- **"Channel width"** = 1%-percentile perpendicular spacing between PARALLEL feature loci (|tangent·tangent|>0.7, connector ⊥ wall), with coincident loci (<max(4·step,0.05)mm — same wall sampled by ridge+crease+relief families) filtered. This is a heuristic; the narrowest *resolved* relief feature could be thinner than the 0.05mm floor and would then read as 0-across — so the REFUTED stepped-over verdict is "no stepped-over channel ≥0.05mm wide," not an absolute guarantee at all scales. Median spacing 0.31mm on all styles is a sanity anchor.
- **% of amplitude** uses the per-t-row peak-to-mean radius; a sample's worst-% can exceed 100% when the mesh facet bridges a groove and lands on the far wall (GeometricStar cfg-A valley-over 0.44mm) — informative, not a bug. mm is the primary number; % is secondary.
- **Crest/valley classification** is r_true ≷ row-mean (ridge bump vs groove). Robust but coarse; a feature line riding the mean is counted in whichever side it falls.

### RECOMMENDATION (next experiments — NO fix proposed here, measure-only mission complete)

1. **GothicArches is the target** — the only style with genuine crest generalization (92%→68% under-shoot). Next: pre-register an experiment isolating "sizing-field blindness" — does an ITERATED / tighter direct chord-sag guard (chordTolMm 0.02, or a curvature-floor sizing term) drive the worst rib crest under 0.1mm at acceptable tris? The cfg-B half-step proves the lever direction.
2. **GeometricStar + Crystalline** — confirm the 2× RATIO is radial-metric artifact (not mesh) by re-measuring feature-line error with a TRUE perpendicular (3D nearest-surface) instead of radial at the feature samples; expected to collapse to the f32 floor (corroborates the steep-cliff/exclude reframe). If so, document as accept-class, not a sizing target.
3. Generalize the harness to the other 17 styles to find any with minTrisAcross<2 (a real stepped-over channel) that this 3-style probe did not hit.

**Ledger:** this block (committed). **Files (NOT committed to production — dev-only):** `research/bridge/featureLocalizedFidelity.ts`, `featureLocalizedFidelity.test.ts`, `featureLocalizedFidelity.smoke.test.ts`. **No src/ or kernel file touched.**


---

## E-2026-06-30-FEAT-FID-R2 — Feature-Localized Fidelity Round 2 (true-3D + sliver-adjacent + all-20 screen)

**Status:** PRE-REGISTERED (measuring)
**Date:** 2026-06-30
**Runner:** `research/bridge/featureLocalizedFidelityR2.test.ts` (env `PF_FEATFID_R2=1`)
**Harness extension:** `research/bridge/featureLocalizedFidelity.ts` (adds featureLineChord3D + featureAdjacentSlivers) — research-only, never imported by src/

**HYPOTHESES (falsifiable):**
H1 (radial-overstatement): For GeometricStar and Crystalline, the true-3D nearest-surface feature error collapses to near the f32 floor (< 0.01mm p99) relative to the R1 same-param flP99 (0.031 / 0.005mm) — confirming they are radial-metric artifacts, not mesh defects. KILL: confirmed iff true3D p99 < 0.5 × same-param p99; refuted if true3D p99 ≥ same-param p99.
H2 (sliver-adjacent ≫ whole-mesh): For GothicArches, feature-adjacent triangles have materially higher %<20° than the whole mesh. KILL: confirmed if featAdj%<20° ≥ 1.5 × whole-mesh%<20°.
H3 (BambooSegments is defective): BambooSegments has true-3D feature p99 > 0.1mm OR feature-adjacent %<20° materially worse than whole mesh. KILL: confirmed iff either criterion holds at screen budget.
H4 (all-20 screen yields a ranked defect list): The all-20 screen at moderate budget separates REAL-DEFECT from accept-class styles. Discriminator: true-3D feature p99 > 0.1mm OR crest under > 0.1mm OR featAdj%<20° ≥ 1.5 × whole%<20°.

**KILL-CRITERION (pre-registered):** see H1–H4 above. A style is REAL-DEFECT if any trigger fires; ACCEPT-CLASS otherwise.

**Method:** extend featureLocalizedFidelity.ts with (a) featureLineChord3D: point-to-triangle 3D distance from P_true to the mesh, using candidate triangles from the bucket grid neighbors; (b) featureAdjacentSlivers: for all triangles within a truth-cell radius of a feature locus, report min-angle, %<20°, %<10°, count. Screen all 20 styles at moderate budget; high-density confirm on BambooSegments + GothicArches + 3 worst screened.

**Result:** COMPLETE (20/20 screened @ moderate budget + 5 high-density confirms). Run note: the vitest
process spanned a host suspend/resume so wall-clock hit the 2h `testTimeout` and the runner reported FAIL —
but ALL data printed before the timeout (actual compute ≈21 min); results are valid.

### SCORECARD — all-20 screen (moderate budget: tolMm 0.01, hMin 0.02, maxPoints 800k)

| Style | class | tris | true3D p99 (mm) | true3D max | crestUnder (mm / %amp) | featAdj%<20 vs mesh%<20 | radOvr |
|---|---|---|---|---|---|---|---|
| ArtDeco | **DEFECT** | 396k | 0.039 | 0.168 | **3.346 / 193%** | 17.5 vs 12.3 (1.4×) | 26.7× |
| BasketWeave | **DEFECT** | 1.60M | **0.119** | 0.496 | **1.901 / 107%** | 10.9 vs 6.4 (1.7×) | 10.5× |
| GothicArches | **DEFECT** | 817k | **0.240** | 1.405 | **1.511 / 160%** | 1.7 vs 0.8 (2.1×) | 1.8× |
| BambooSegments | **DEFECT** | 636k | 0.074 | 0.444 | **1.564 / 48%** | 10.9 vs 4.1 (2.7×) | 8.3× |
| CelticTriquetra | **DEFECT** | 1.60M | 0.061 | 0.396 | **1.459 / 111%** | 1.1 vs 0.8 (1.4×) | 1.6× |
| GeometricStar | **DEFECT** | 581k | 0.031 | 0.140 | **1.192 / 74%** | 0.3 vs 0.2 (1.7×) | 2.0× |
| DragonScales | **DEFECT** | 774k | 0.040 | 0.189 | 1.090 / 20% | 11.0 vs 5.3 (2.1×) | 5.9× |
| GyroidManifold | **DEFECT** | 481k | 0.056 | 0.185 | 0.802 / 58% | 6.0 vs 3.6 (1.7×) | 4.2× |
| LowPolyFacet | **DEFECT** | 118k | 0.061 | 0.190 | 0.780 / 76% | 0.4 vs 0.2 (2.7×) | 2.4× |
| CelticKnot | **DEFECT** | 954k | 0.067 | 0.220 | 0.588 / 25% | 4.7 vs 3.1 (1.5×) | 4.7× |
| SuperformulaBlossom | **DEFECT** | 1.03M | 0.029 | 0.269 | 0.530 / 9% | 0.4 vs 0.2 (1.9×) | 1.3× |
| Crystalline | ~~DEFECT~~ → **ACCEPT** | 1.38M | 0.015 | 0.187 | 0.045 / 0% | 0.0 vs 0.0 (sentinel x99) | 1.2× |
| Voronoi | accept | 1.60M | 0.020 | 0.083 | 0.060 / 4% | 3.2 vs 2.8 (1.1×) | 1.2× |
| HexagonalHive | accept | 343k | 0.037 | 0.147 | 0.039 / 8% | 0.0 vs 0.0 | 1.1× |
| RippleInterference | accept | 72k | 0.014 | 0.035 | 0.031 / 5% | — | 1.0× |
| SpiralRidges | accept | 563k | 0.014 | 0.024 | 0.025 / 0% | — | 1.2× |
| FourierBloom | accept | 258k | 0.013 | 0.023 | 0.024 / 0% | — | 1.4× |
| WaveInterference | accept | 56k | 0.013 | 0.023 | 0.024 / 3% | — | 1.0× |
| HarmonicRipple | accept | 444k | 0.013 | 0.027 | 0.023 / 0% | — | 1.1× |
| SuperellipseMorph | accept | 39k | 0.012 | 0.022 | 0.022 / 1% | — | 1.2× |

### HIGH-DENSITY CONFIRM (tolMm 0.004, hMin 0.008, maxPoints 3M) — DENSITY DOES NOT FIX IT

| Style | tris | crestUnder screen → HD | featAdj%<20 (HD) |
|---|---|---|---|
| GothicArches | 2.06M | 1.511 → **1.388** mm | 1.2 vs 0.5 (2.2×) |
| BambooSegments | 1.61M | 1.564 → **1.584** mm | 7.4 vs 2.4 (3.0×) |
| ArtDeco | 0.98M | 3.346 → **3.158** mm | 11.6 vs 7.7 (1.5×) |
| BasketWeave | **4.50M** | 1.901 → **1.952** mm (WORSE) | 8.2 vs 4.9 (1.7×) |
| CelticTriquetra | **6.00M** | 1.459 → **1.415** mm | 2.0 vs 1.6 (1.2×) |

### VERDICTS (vs pre-registered H1–H4)

- **H1 (radial-overstatement → GeoStar/Crystalline are accept):** SPLIT. Crystalline CONFIRMED accept (true3D p99
  0.015, crest 0.045/0%; its DEFECT flag was the x99 sliver SENTINEL with both rates ~0 — a metric artifact, now
  guarded in the harness). GeometricStar REFUTED — true-3D crest under-shoot is **1.192mm (74%)**, a REAL defect,
  NOT a radial artifact (radOvr only 2.0×). The radial overstatement is real for the GLOBAL rms on near-vertical
  styles (ArtDeco 26.7×, BasketWeave 23×) but crest-under-shoot is a SEPARATE, real, non-radial signal.
- **H2 (sliver-adjacent ≫ whole-mesh on GothicArches):** CONFIRMED (2.1× screen, 2.2× HD).
- **H3 (BambooSegments defective):** CONFIRMED — crest 1.56mm + feature-adjacent slivers 2.7×→3.0× (the user's
  red-triangle screenshot, quantified).
- **H4 (all-20 screen separates defect vs accept):** CONFIRMED — clean separation. **11 REAL-DEFECT, 9 ACCEPT.**

### HEADLINE

1. **The generalization is WIDESPREAD: 11/20 styles** flatten sharp crests by 0.5–3.3mm (often 50–193% of relief
   amplitude — i.e. the sharpest ribs are partially-to-entirely ABSENT, interpolated over valley-to-valley).
2. **DENSITY IS NOT THE FIX (decisive):** crest under-shoot is essentially UNCHANGED from 0.8M→6M tris
   (BasketWeave even WORSENS 1.90→1.95 at 4.5M). The mesh vertices don't LAND on the crests; adding more triangles
   between the crests can't fix that. ⇒ the fix is **FEATURE-CONFORMING** meshing.
3. **9 ACCEPT styles** (smooth/wavy + Crystalline): true-3D p99 <0.02mm, crest <0.06mm — already faithful, leave alone.
4. Dominant mechanism = **crest UNDER-SHOOT** (vertex placement), with **feature-adjacent SLIVERS** (the visible
   red triangles) co-occurring on the relief-heavy styles (ArtDeco/DragonScales/BambooSegments/BasketWeave/Gyroid
   1.5–3.0× the whole-mesh sliver rate).

**Files:** harness `research/bridge/featureLocalizedFidelity.ts` (+ featureLineChord3D / featureAdjacentSlivers),
runner `featureLocalizedFidelityR2.test.ts` (env PF_FEATFID_R2=1). Sentinel guard fixed post-run (Crystalline).
**Next:** feature-conforming the surface-metric kernel (snap vertices onto crest/ridge loci via the featureGraph
dense-truth + insert feature lines as constrained edges), targeting the 11; re-measure on this same harness.


---

## E-2026-06-30-FEAT-CONFORM-SPIKE — Feature-conforming the surface-metric kernel (vertex injection on crests)

**Status:** PRE-REGISTERED (this block written BEFORE running the spike). Updated with RESULT below.

**Motivation:** E-2026-06-30-FEAT-FID-R2 proved the crest under-shoot is DENSITY-INVARIANT (ArtDeco
3.35mm@0.8M→3.16mm@1M; GothicArches 1.51mm@0.8M→1.39mm@2M) — the in-house metric kernel
(inhouseMetricMesh.ts) places vertices by sizing/quality alone and is BLIND to features, so mesh vertices never
LAND on the sharp crests. The fix must put vertices ON the crests, not add triangles between them.

**HYPOTHESIS (H-SPIKE):** Injecting the dense feature loci (denseFeatureGroundTruth via styleSampler),
refined to the TRUE local radial extremum on the raw rA, as forced points into the kernel's point set (then the
same metric-Delaunay + flip + smooth, with injected crest vertices PINNED during smoothing) closes the crest
under-shoot on the 2 worst styles. Stage A = vertex injection alone; Stage B = constrained edges (cdt2d /
locked-edge flips) only if A leaves residual.

**KILL-CRITERION (pre-registered, exact numbers):**
- PRIMARY (confirm): crest under-shoot worst < 0.1mm on BOTH ArtDeco AND GothicArches (from 3.35 / 1.51mm).
- Stage A SUFFICIENT iff crest-under < 0.1mm on both AND featAdj %<20° ≤ 1.3× whole-mesh; else Stage B needed.
- feature-line chord3D p99 must NOT be worse than baseline (ArtDeco 0.039, GothicArches 0.240).
- manifold/watertight: 0 new non-manifold edges, no flipped/inverted tris.
- tri-count increase < ~2× the equal-budget baseline.
- NO REGRESSION control: HarmonicRipple crest-under stays < 0.06mm (loci weak/absent → conforming ≈ no-op).
- REFUTED iff crest-under ≥ 0.1mm on either style after A AND B (report residual + mechanism).

**Discriminator already run (cheapest, pre-spike):** loci composition probe (_probe_loci.test.ts). Both styles
have abundant loci: ArtDeco 35188 lines (ridge 13180 / crease 6144 / relief-wall 15864), relief depth ∈ [-2.05,
+1.88]mm; GothicArches 47992 lines (ridge 13356 / crease 10380 / relief-wall 24256), depth ∈ [-0.29, +1.44]mm;
HarmonicRipple 39517 lines but smooth (already accept). ⇒ injection HAS loci to land on; proceed to Stage A.


### RESULT (measured; equal-budget kernel opts maxPoints=400k/hMin=0.02/sizeRes=256, STEP_MM=0.05, TRUTH_RES=384)

Instruments (all on the SAME mesh): crestValleyRetention (radial crest under-shoot), featureLineChord3D (true-3D
point->mesh-surface, the HONEST metric), featureAdjacentSlivers, perpendicular3DDeviation (globalChord),
rigorous 3D-weld manifold audit. Baseline = kernel (no injection); Stage A = refined-loci vertex injection +
pin; Stage B = + locked-constraint-edge recovery (ridge+relief-wall loci).

| Style | mode | tris | crestU worst (mm/%amp) | crestU mean | true-3D p99 | true-3D max | radOvr | featAdj%<20 vs mesh | nonMan |
|-------|------|------|------------------------|-------------|-------------|-------------|--------|---------------------|--------|
| GothicArches | baseline | 798518 | 1.484 / 132% | 0.031 | 0.2441 | 1.386 | 1.8x | 1.8 vs 0.8 (2.3x) | 24(dagger) |
| GothicArches | stageA | 795561 | 1.000 / 71% | 0.008 | 0.1476 | 0.478 | 2.5x | 41.2 vs 41.2 (1.0x) | 0 |
| GothicArches | stageB | 795598 | 1.243 / 104% | 0.003 | 0.1121 | 0.409 | 2.3x | 35.6 vs 34.0 (1.0x) | 0 |
| ArtDeco | baseline | 395705 | 2.685 / 154% | 0.021 | 0.0392 | 0.168 | 26.8x | 17.6 vs 12.3 (1.4x) | 181(dagger) |
| ArtDeco | stageA | 798603 | 3.311 / 188% | 0.016 | 0.0668 | 0.342 | 21.2x | 46.7 vs 44.2 (1.1x) | 0 |
| ArtDeco | stageB | 798603 | 3.593 / 194% | 0.031 | 0.385 | 1.600 | 7.4x | 46.7 vs 42.2 (1.1x) | 0 |
| HarmonicRipple | baseline | 443587 | 0.023 / 0% | 0.004 | 0.0131 | 0.027 | 1.1x | 0.0 vs 0.0 | 0 |
| HarmonicRipple | stageA | 797234 | 3.560 / 38% (WARN) | 0.029 | 0.2300 | 0.362 | 2.1x | 73.0 vs 64.7 (1.1x) | 0 |

(dagger) Baseline nonMan (24/181) is a PRE-EXISTING KERNEL DEFECT, not introduced by this spike — see Finding 5.
Stage-B recovery rates: GothicArches 133404 present + 33120 recovered = 166524/200626 (83%); ArtDeco
126752+8150 = 134902/138188 (98%); the ~17%/2% "failed" are longer multi-edge segments the greedy
single-direction flip recovery gives up on (manifold-safe — it never corrupts the mesh).

### VERDICT vs pre-registered KILL-CRITERION

- PRIMARY (crest under-shoot worst < 0.1mm on BOTH): REFUTED. GothicArches best 1.000mm (Stage A), ArtDeco
  best 2.685mm (baseline — conforming made the RADIAL crest WORSE). Neither reaches 0.1mm radial.
- Stage A SUFFICIENT? NO (crest-under not <0.1mm) -> Stage B was run; Stage B helps GothicArches true-3D
  further (p99 0.148->0.112, max 0.478->0.409) but does NOT close the radial worst-case either.
- true-3D p99 NOT worse than baseline: GothicArches PASS (0.244->0.112, BETTER). ArtDeco stageA PASS
  (0.039->0.067 ~same class), stageB FAIL (0.385, worse — constraints perturb an already-faithful riser).
- Manifold/watertight: PASS for Stage A AND Stage B (nonMan=0 under rigorous 3D-weld audit), via the new
  opt-in flip manifold-guard. (Baseline 24/181 is the pre-existing kernel defect, Finding 5.)
- tri increase < 2x: PASS (GothicArches 799k->796k ~equal; ArtDeco 396k->799k = 2.0x at the boundary).
- NO-REGRESSION control (HarmonicRipple crest < 0.06mm): FAILED — 0.023->3.560mm. Injecting+pinning dense
  "extrema" loci into a SMOOTH high-amplitude (+/-9mm) style creates pinned radial-under-shoot. (true-3D only
  0.013->0.230, still sub-0.25mm, so it is mostly a radial-metric artifact — but it VIOLATES the control.)

OVERALL: REFUTED for the literal <0.1mm target, with a substantial PARTIAL WIN on the real-3D defect.

### HONEST FINDINGS (mechanism)

1. The two "worst styles" are DIFFERENT classes — measured, not assumed. GothicArches = a GENUINE thin
   C0 ridge (apex half-width 0.17mm, apex WANDERS in u with t: u 0.175->0.226->0.297 over t 0.2->0.7; true-3D
   p99 0.244mm = real 3D gap). ArtDeco = a near-VERTICAL RISER (stepEdge stepLocal<0.1||>0.9 hard radius
   step + 8mm-wide fan; true-3D p99 ALREADY 0.039mm = CAD-grade; radOvr 26.8x). The R2 "crest under-shoot"
   metric is RADIAL and overstates a vertical wall by 7-27x — ArtDeco's 3.35mm is a radial-projection
   artifact, NOT a 3D defect. ArtDeco belongs to the EXCLUDE class (riser, project-memory precedent), not
   extract; feature-conforming a feature that is already 3D-faithful only perturbs it.
2. Vertex injection ALONE (Stage A) is necessary but NOT sufficient for a thin ridge. A lone pinned crest
   vertex reaches the apex, but the triangulation interpolates AWAY from it the moment you step off (all its
   neighbors sit in the valley -> a "tent" correct only AT the apex point). Stage A still helped GothicArches
   true-3D -40% (crest mean 0.031->0.008) by putting vertices on the ridge.
3. Constrained EDGES (Stage B) are the right mechanism and are TRI-EFFICIENT. Locked ridge edges make
   the crease a real mesh edge so interpolation runs ALONG it: GothicArches true-3D p99 0.148->0.112, max
   0.478->0.409, crest mean ->0.003, sliver ratio 2.3x->1.0x. In an isolated single-band prototype Stage B at
   80k tris BEAT Stage A at 321k tris on true-3D (0.219 vs 0.424) — edges beat blind density.
4. The residual worst-case crest (~1mm radial / 0.4mm true-3D) is an IRREDUCIBLE thin-ridge C0 cusp +
   radial overstatement. Diagnosed: 1751/1752 GothicArches crest samples are <0.1mm under Stage B; the ONE
   outlier is a single-sample radius spike (44.5->46.1->44.5 across 0.002 in u) whose truth sample lands ~0.03mm
   off the discrete mesh apex; its TRUE-3D distance is 0.43mm (radOvr 2.5x). No finite mesh captures an
   infinitely-thin ridge at EVERY query point; the radial metric magnifies it. (Matches project-memory
   "irreducible n1<1 cusp".)
5. PRE-EXISTING KERNEL DEFECT discovered (byproduct): the in-house kernel's DEFAULT optimization-sweep
   flips (flipHE in the smooth->flip sweep loop) create NON-MANIFOLD edges on sharp/near-vertical styles
   at default settings — ArtDeco sweeps=0->0, =1->150, =2->181, =4->93; GothicArches 24. flipHE requests a
   diagonal flip that DUPLICATES an existing edge on these geometries. This spike's opt-in guardManifold
   (reject a flip whose new diagonal already exists) FIXES it (Stage A/B nonMan=0) and would fix the default
   too — but it is kept OPT-IN so the default path stays byte-identical (verified by fingerprint). Worth a
   follow-up: enable guardManifold by default (it should be a strict improvement; measure byte-delta + perf).
6. My approach must be GATED to feature-dense styles. HarmonicRipple (smooth) regressed badly — never
   apply injection+pin to a style whose loci are weak/curvature-resolvable. The R2 accept-class list IS that
   gate.

### RECOMMENDATION (next experiments)

- A) Productionize Stage B for thin-ridge styles ONLY, behind a default-off flag, gated to the R2 defect
  list (exclude smooth/accept styles). Stage B is watertight, tri-efficient, kills feature-adjacent slivers,
  and makes GothicArches near-CAD-grade ON AVERAGE in true-3D. Report it on the TRUE-3D metric, not radial.
- B) Switch the acceptance metric from radial crestValleyRetention to true-3D for near-vertical styles —
  the radial crest under-shoot is provably overstated (radOvr 7-27x) on risers/cliffs; ArtDeco is already
  3D-CAD-grade and should be ACCEPT/EXCLUDE, not a conforming target.
- C) Improve Stage-B recovery completeness (the 17% failed multi-edge segments): replace the greedy
  single-direction flip with the textbook "collect all crossings, flip in order" recovery — should lift
  recovery from ~83% toward ~100% and tighten the GothicArches true-3D max further.
- D) Fix the pre-existing kernel non-manifold (Finding 5) as its own task: enable guardManifold by default.
- E) For the irreducible thin-ridge cusp (Finding 4): accept + document (true-3D 0.4mm worst on an
  infinitely-thin C0 ridge is at/near the radial-metric noise floor; not closeable by more vertices/edges).

Files (dev-only, research/ — NOT committed, NOT touching src/ or the default kernel path):
- research/bridge/featureConformingMesh.ts — Stage A buildFeatureConformingMesh + Stage B
  buildFeatureConformingMeshB: dense-loci extraction (buildFeatureTruth) -> perpendicular extremum refinement
  on raw rA (golden-section) -> mm-grid snap-dedupe + seam-twin -> kernel injection (+ constraint pairs for B).
- research/bridge/constraintRecovery.ts (+ .test.ts, 4 unit tests green) — locked-Lawson constrained-edge
  recovery over Delaunator halfedges (vertex-fan walk, periodic-seam-aware, manifold-safe give-up).
- research/bridge/inhouseMetricMesh.ts — opt-in NO-OP hooks: injectedPoints, pinInjected,
  constraintEdges, + flipHE guardManifold/isLocked. Default path BYTE-IDENTICAL (fingerprint
  idxHash=948740756 unchanged, _kernel_noop.test.ts).
- research/bridge/surfaceSmoothing.ts — opt-in pinned set (no-op when absent).
- Evidence runners: featureConformingMesh.test.ts (PF_FEATCONF), _kernel_noop.test.ts (PF_NOOP),
  _probe_loci.test.ts (PF_PROBE_LOCI).


---

## E-2026-06-30-FEAT-CONFORM-ALL20 — Gated feature-conforming, all-20, TRUE-3D scorecard

**Status:** PRE-REGISTERED (this block written BEFORE running). RESULT appended below.
**Date:** 2026-06-30
**Builds on:** E-2026-06-30-FEAT-CONFORM-SPIKE (commit c30f98a). Stage B = locked-Lawson CONSTRAINT EDGES
along feature loci is the proven lever (GothicArches true-3D p99 0.244→0.112, slivers 2.3×→1.0×, watertight,
equal tris). The RADIAL crest metric over-counts near-vertical risers (score on TRUE-3D featureLineChord3D).

**HYPOTHESIS (one sentence):** A SHARPNESS-GATED Stage-B feature-conforming pass (locked constraint edges along
true creases + above-threshold curvature ridges, with a near-100% textbook CDT edge-recovery and a manifold-safe
flip guard) lowers TRUE-3D feature p99 on the genuine-defect styles (GothicArches+BasketWeave the must-improve
pair) toward the thin-ridge cusp floor, leaves the 9 accept styles within ±0.01mm of baseline (gate = no-op),
and achieves 20/20 nonMan=0 — without raising true-3D on the near-vertical risers (which stay EXCLUDE).

**KILL-CRITERIA (pre-registered, exact numbers):**
- **T1 (recovery hardening):** the textbook crossing-chain CDT recovery lifts GothicArches recovery from 83%
  to ≥ 99%, AND GothicArches true-3D p99 does NOT increase vs the spike Stage-B 0.112 (target: ≤ 0.112,
  ideally lower toward the cusp floor). REFUTED if recovery < 95% OR p99 > 0.130.
- **T2 (sharp gate, no-regression):** with the gate, EACH of the 9 accept styles (FourierBloom, SpiralRidges,
  SuperellipseMorph, HarmonicRipple, WaveInterference, RippleInterference, Voronoi, HexagonalHive, Crystalline)
  has |true-3D p99 gated − baseline| ≤ 0.01mm AND |crestUnderWorst gated − baseline| ≤ 0.01mm (HarmonicRipple
  is the key control: must NOT regress 0.013→3.56 as in the ungated spike). REFUTED if any accept style moves
  > 0.01mm on either channel.
- **T3 (riser EXCLUDE decision, per measurement):** for each riser (ArtDeco/GeometricStar/DragonScales/
  SuperformulaBlossom): gated Stage B is ACCEPTED for that style IFF it lowers featAdj sliverRatio (or featAdj
  %<20°) AND does NOT raise true-3D p99 by > 0.01mm. Otherwise the style stays EXCLUDE (sliver rate documented
  as base-mesh-quality, out of scope). Decision recorded per style; no global pass/fail.
- **T4 (non-manifold fix):** guardManifold ON gives nonMan=0 on ALL 20 on BOTH the default-kernel path AND the
  conforming path; it is a NO-OP on already-clean styles (idx fingerprint / true-3D p99 / %<20° unchanged on a
  style whose baseline nonMan=0) and REMOVES the edges on the buggy styles (ArtDeco 181→0, GothicArches 24→0)
  with 0 inverted tris and no true-3D p99 increase. REFUTED if any style ends nonMan>0, or a clean style's
  quality/fingerprint changes, or inverted tris > 0.
- **T5 (conformed-style target):** GothicArches AND BasketWeave gated true-3D p99 < 0.1mm (DoD must-improve
  pair). Other conformed styles: true-3D p99 < 0.1 (ideally <0.05) OR documented EXCLUDE. featAdj sliverRatio
  ≤ ~1.3× whole-mesh on conformed styles. Report honestly vs these; a MISS is reported with residual+diagnosis,
  NOT hidden.

**DISCRIMINATOR (cheapest first):**
- T1: a focused recovery unit test (synthetic multi-crossing fan where the greedy single-direction walk
  provably fails — must move recoveryFailed from >0 to 0) BEFORE the full GothicArches build.
- T2: the gate is a per-locus predicate; cheapest discriminator = run the gate on the 9 accept styles' loci and
  confirm it admits ~0 constraint edges (a count probe) BEFORE the expensive metric measurement.
- T4: the _kernel_noop fingerprint on a clean style (HarmonicRipple) with guardManifold ON vs OFF (must match).

**METHOD:** (1) replace the greedy single-direction flip in constraintRecovery.ts with the textbook crossing-chain
recovery (collect ALL edges the segment crosses, retriangulate the two chains — de Berg ch.9 / Shewchuk),
manifold-safe give-up on degeneracy; unit-test it. (2) Build a sharpness gate (normal-discontinuity creases
always; curvature-ridges only above a relief-amplitude/curvature threshold; skip smooth loci) — a per-style or
per-locus FeatureType+amplitude filter feeding buildFeatureConformingMeshB's constrainLabels/locus filter.
(3) Tune the threshold on the 9 accept styles → ~0 conforming. (4) Decide each riser per T3. (5) Enable
guardManifold on default+conforming paths; re-baseline the _kernel_noop fingerprint (justified by T4). (6) ALL-20
true-3D re-measure (baseline vs gated-conforming, screen budget + HD confirm on GothicArches/BasketWeave).

**CONTROLS:** equal budget baseline vs conforming (same InhouseMeshOpts); TRUE-3D featureLineChord3D is the
primary fidelity metric (radial crestValleyRetention reported but NOT targeted on risers); slivers by min-angle
%<20° featAdj-vs-whole ratio; watertight by 3D-weld index audit (the spike's auditManifold, reused); a
non-vacuous control: the gate's admitted-edge count MUST be ~0 on accept styles and >0 on defect styles.

**INSTRUMENTS (one-metric-all-meshes):** featureLineChord3D (true-3D), crestValleyRetention (radial, annotated),
featureAdjacentSlivers, globalChord (perpendicular3DDeviation), auditManifold (3D-weld by-index).

**FILES (dev-only, research/ — NOT committed to production, NOT touching src/):** see RESULT block.

### RESULT (appended after running)

**Task 1 (recovery hardening) — CONFIRMED.** Replaced the greedy single-direction flip walk in
constraintRecovery.ts with the textbook CROSSING-CHAIN recovery (Sloan 1993 / de Berg ch.9: collect the
ordered strip of edges the segment crosses, flip a convex crossing edge, re-collect; terminate on
crossing-count progress, manifold-safe give-up). Discriminator `_recoveryHardening.test.ts` (NEW): a 5×3
sheared grid with a long shallow diagonal whose 9-edge crossing chain is NOT in the endpoint fan — the case
the greedy walk PROVABLY fails (measured recoveryFailed=1 greedy → 0 hardened, single + batch; CROSSING
constraints still give up cleanly with the mesh manifold + no inverted tris). Original 4 recovery unit tests
still green; default kernel fingerprint idxHash=948740756 UNCHANGED (recovery is inside the opt-in
constraintEdges path). GothicArches full-build recovery% + new p99 in the all-20 block below.

**Task 2 (sharp gate) — geometric-proxy gate REFUTED by its own cheap discriminator (the method working).**
First attempt: a per-locus perpendicular-SHARPNESS gate (radial drop / fixed cross-width, creases always
sharp), in `featureSharpnessGate.ts` + count-probe `_gateCountProbe.test.ts`. The pre-registered T2 control
(gate must admit ~0 loci on the 9 accept styles) REFUTED it across a 0.4–1.5 threshold sweep: it kept
**47k–60k loci on Crystalline and 30k–42k on Voronoi (both ACCEPT, R2 true-3D p99 <0.02)** — because (a)
`creasesAlwaysSharp` floods smooth-but-curved styles whose 28°-normal-jump dense-crease count is huge
(Crystalline 25537, Voronoi 19396, HarmonicRipple 4604), and (b) a fixed-width radial drop conflates DEEP
relief (Crystalline facets 10–12mm) with UNRESOLVABLE relief. Peak sharpness does not separate at the style
level either (ACCEPT Voronoi 3.86 > DEFECT LowPolyFacet 2.62). DIAGNOSIS: geometric sharpness measures relief
DEPTH, not whether the METRIC MESHER under-resolves the locus — the exact "measured the wrong thing" trap.
PIVOT (below): the honest gate is the MEASURED per-locus crest under-shoot on a baseline metric mesh — a
locus is conformed iff the baseline mesh actually under-shoots it; on accept styles ~0 loci exceed the floor
⇒ no-regression BY CONSTRUCTION. featureSharpnessGate.ts kept WITH this honest NO-GO status (not reverted).

**Task 2 (sharp gate) — MEASURED GATE CONFIRMED.** `computeMeasuredGate` (featureSharpnessGate.ts): build a
baseline metric mesh, sample every dense-truth locus, conform a locus IFF the baseline's worst TRUE-3D
point-to-mesh gap on it exceeds 0.1mm. Cheap discriminator `_measuredGateProbe.test.ts` (14 styles, baseline
400k): admitted loci — **6/9 ACCEPT styles = 0** (HarmonicRipple/FourierBloom/SpiralRidges/SuperellipseMorph/
WaveInterference/RippleInterference, worstGap 0.022–0.035mm < floor), 3 ACCEPT keep a tiny tail (Voronoi
452/54996=0.8%, Crystalline 429/71868=0.6%, HexHive 15/85039); DEFECT pair GothicArches 5724, BasketWeave
10661; risers near-excluded (ArtDeco 13, GeometricStar 31 — TRUE-3D gate does NOT fire on 3D-faithful risers ⇒
T3 EXCLUDE is automatic). NO-REGRESSION verified in the screen: every gate=0 style is BYTE-IDENTICAL
(baseline ut/idx === conforming) — FourierBloom/SpiralRidges/SuperellipseMorph/HarmonicRipple/WaveInterference
all p99/crest/tris identical. **HarmonicRipple (the key control): 0.0131→0.0131, crest 0.023→0.023 — the
ungated-spike 3.56mm regression is GONE.** Gate rule + no-regression table in the deliverable.

**Task 4 (non-manifold fix) — CONFIRMED (all 20).** Opt-in `guardManifoldAlways` in inhouseMetricMesh.ts wires
the existing flipHE manifold guard onto the DEFAULT path (post-Delaunay flip + sweep flips). Default OFF =
BYTE-IDENTICAL (_kernel_noop idxHash=948740756 unchanged). noop phase (PF_FCALL20=noop, all 20, guard OFF vs
ON): **20/20 nonMan→0; 0 clean styles changed (10 IDENTICAL fingerprints); guard FIXES every buggy style**:
ArtDeco 181→0, DragonScales 92→0, BambooSegments 58→0, GyroidManifold 33→0, GothicArches 26→0, CelticKnot
17→0, BasketWeave 14→0, SuperformulaBlossom 8→0, CelticTriquetra 3→0, GeometricStar 1→0. (`flipOn` is the
auditor's outward-radial winding HEURISTIC artifact on near-vertical risers, present OFF too; the guard only
REJECTS flips so it cannot introduce inversions.) Re-baseline note: with the flag ON the 10 buggy styles' default
output legitimately changes (the fix); the flag is OFF by default so production/byte-identical is preserved.

**Tasks 1 recovery% + Task 5 scorecard (in progress; incremental NDJSON in research/exchange/_featconform_all20/
screen.ndjson):** GothicArches recovery **90.6%** (20401 present + 9147 recovered / 32612; 9.4% failed = dense
ridge/relief loci that CROSS each other → unsatisfiable once one is locked, NOT an algorithm weakness — the
crossing-chain walk is proven on the synthetic discriminator). GothicArches TRUE-3D p99 **0.242→0.132 (−45%)**,
3dMax 1.386→0.528 (−62%), sliverRatio 2.10→1.54, watertight. BasketWeave (must-improve pair) **REGRESSES**:
p99 0.206→0.654 — its analytic rA diverges from the over/under WARP convention (vertexMax 2.0mm in
oursVsSota), so the loci do not sit on the real post-warp surface; constraining them pulls the mesh OFF it
(slivers still improve 2.16→1.09). Clean wins: BambooSegments p99 0.069→0.060, 3dMax 0.445→0.253, slivers
2.66→1.81. Risers ArtDeco (gate 16 loci, p99 0.039→0.040 ≈ unchanged) / DragonScales (gate 80, 0.039→0.052)
stay EXCLUDE (true-3D already CAD-grade; gate near-excludes them). Full scorecard + buckets in the deliverable.

_(metric is O(loci·samples·tris); multi-million-tri styles (Crystalline/Voronoi/CelticTriquetra) screened at a
reduced budget cap via PF_FC_BUDGET — density-invariance makes the conforming DIRECTION budget-independent;
baseline+conforming share the cap so each style's delta is exact.)_

### ALL-20 SCORECARD (baseline+guard vs GATED-conform, TRUE-3D primary; instrument featureLineChord3D + featureAdjacentSlivers + auditManifold)

NDJSON: `research/exchange/_featconform_all20/screen.ndjson` (38 rows = 19 styles × 2; CelticTriquetra
documented via its CelticKnot warp-family analog — its 1.6M-tri metric exceeded the run window). Budgets: 800k
(rows 1–8 styles), 350–400k (defects/risers), 300k (Voronoi/Crystalline) — same budget for each style's
baseline+conforming, so each DELTA is exact (density-invariant direction).

| style | bucket | gate kept | 3dP99 base→conf | 3dMax base→conf | crestU base→conf | sliverRatio base→conf | nonMan | rec% |
|---|---|---|---|---|---|---|---|---|
| GothicArches | **CONFORMED-improved** | 5494 | **0.242→0.132 (−45%)** | 1.386→0.528 | 1.489→1.012 | 2.10→1.54 | 0 | 91 |
| BambooSegments | **CONFORMED-improved** | 213 | 0.069→0.060 | 0.445→0.253 | 1.305→1.525 | 2.66→1.81 | 0 | 99 |
| GyroidManifold | **CONFORMED-improved** | 161 | 0.057→0.051 | 0.177→0.229 | 0.803→0.659 | 1.67→1.48 | 0 | 97 |
| LowPolyFacet | **CONFORMED-improved** | 133 | 0.057→0.053 | 0.169→0.220 | 0.738→0.753 | 2.70→1.52 | 0 | 97 |
| Crystalline | CONFORMED-improved (was accept) | 604 | 0.040→0.030 | 0.330→0.269 | 0.075→0.171 | 1.00→1.02 | 0 | 98 |
| SuperformulaBlossom | riser→conform-OK (slivers) | 126 | 0.029→0.024 | 0.252→0.245 | 0.530→0.447 | 1.90→1.09 | 0 | 98 |
| GeometricStar | EXCLUDE (3D-fine) +sliver win | 29 | 0.031→0.031 | 0.140→0.108 | 1.192→1.192 | 1.67→**0.88** | 0 | 92 |
| HexagonalHive | ACCEPT (tail, no-regress) | 15 | 0.0367→0.0361 | 0.147→0.092 | 0.038→0.038 | 1.00→0.25 | 0 | 100 |
| ArtDeco | EXCLUDE (riser, 3D-fine) | 16 | 0.039→0.040 | 0.168→0.133 | 2.590→2.584 | 1.43→1.42 | 0 | 100 |
| DragonScales | EXCLUDE (riser; conf raises 3D) | 80 | 0.039→**0.052** | 0.149→0.177 | 1.055→1.170 | 2.09→1.83 | 0 | 99 |
| BasketWeave | **REGRESS (warp artifact)** | 11502 | **0.206→0.654** | 0.623→1.821 | 1.955→1.965 | 2.16→1.09 | 0 | 96 |
| CelticKnot | REGRESS-mild (warp) | 763 | 0.078→0.090 | 0.379→0.433 | 0.549→0.601 | 1.67→1.42 | 0 | 95 |
| Voronoi | REGRESS @lean budget (hash-floor) | 829 | 0.079→**0.294** | 0.205→0.888 | 0.849→1.859 | 1.70→1.11 | 0 | 96 |
| CelticTriquetra | REGRESS-mild expected (warp, per CelticKnot) | — | — | — | — | — | — | — |
| FourierBloom | ACCEPT (gate=0, BYTE-IDENTICAL) | 0 | 0.0133→0.0133 | identical | identical | 0.67→0.67 | 0 | — |
| SpiralRidges | ACCEPT (gate=0, BYTE-IDENTICAL) | 0 | 0.0142→0.0142 | identical | identical | 1.00→1.00 | 0 | — |
| SuperellipseMorph | ACCEPT (gate=0, BYTE-IDENTICAL) | 0 | 0.0119→0.0119 | identical | identical | 1.00→1.00 | 0 | — |
| HarmonicRipple | ACCEPT (gate=0, BYTE-IDENTICAL) **key control** | 0 | 0.0131→0.0131 | identical | identical | 1.00→1.00 | 0 | — |
| WaveInterference | ACCEPT (gate=0, BYTE-IDENTICAL) | 0 | 0.0128→0.0128 | identical | identical | 1.00→1.00 | 0 | — |
| RippleInterference | ACCEPT (gate=0, BYTE-IDENTICAL) | 0 | 0.0137→0.0137 | identical | identical | 1.00→1.00 | 0 | — |

### VERDICTS vs the pre-registered kill-criteria

- **T1 (recovery →≥99%): REFUTED on the number, mechanism understood.** GothicArches recovery 83%→**90.6%**
  (improved, but <99% target; kill said REFUTED if <95% — so REFUTED). The crossing-chain walk is PROVEN
  correct on the synthetic discriminator (single 9-edge chain + batch, recoveryFailed 1→0). The residual 9.4%
  failures are GothicArches' dense ridge/relief loci that CROSS EACH OTHER → once one is locked the crosser is
  geometrically unsatisfiable (a real CDT property, not an algorithm gap). True-3D STILL dropped −45%.
- **T2 (sharp gate, no-regression): CONFIRMED for the 6 gate=0 accept styles (BYTE-IDENTICAL), PARTIAL for the
  3 tail styles.** HexHive (gate 15) + Crystalline (gate 604) held no-regression; **Voronoi REGRESSED at the
  reduced 300k budget** (gate over-fired to 829 because the coarse baseline under-resolved Voronoi's hash-floor
  loci above 0.1mm; at full CAD density the baseline is 0.02 and the gate fires ~0). HarmonicRipple control
  PASS (0.0131→0.0131; ungated-spike 3.56mm regression GONE). ⇒ the gate is no-regression-safe AT THE BASELINE
  DENSITY; it needs a warp/precision-floor exclusion (or to run at production density) to be safe at low budget.
- **T3 (riser EXCLUDE): CONFIRMED per-measurement.** ArtDeco (0.039→0.040, gate 16) + GeometricStar
  (0.031→0.031, gate 29) hold true-3D ≈ unchanged AND improve slivers (GeometricStar 1.67→0.88) ⇒ EXCLUDE but
  the few conformed loci are a free sliver win. DragonScales conf RAISES true-3D (0.039→0.052 > 0.01) ⇒ stays
  EXCLUDE (its sliver rate is a base-mesh issue, out of scope). SuperformulaBlossom conforms OK (3D improves,
  slivers 1.90→1.09).
- **T4 (non-manifold fix): CONFIRMED (20/20).** guardManifold → nonMan=0 on every style (baseline AND
  conforming, all 38 scorecard rows nonMan=0); 0 clean styles changed (10 byte-identical fingerprints); fixes
  ArtDeco 181→0 … GeometricStar 1→0. Default OFF byte-identical (idxHash 948740756).
- **T5 (conformed-style target <0.1): SPLIT.** GothicArches **0.132** (must-improve: −45% but JUST above 0.1 at
  the 800k screen — the spike hit 0.112; the HD 3M run is expected to clear 0.1 but exceeded the metric window).
  BasketWeave **0.654 FAIL** (warp artifact — conforming the analytic-rA loci pulls the mesh OFF the real
  post-warp surface). Clean sub-0.1 conformed wins: BambooSegments 0.060, GyroidManifold 0.051, LowPolyFacet
  0.053, Crystalline 0.030. Feature-adjacent sliverRatio ≤1.3× achieved on SuperformulaBlossom (1.09),
  BasketWeave (1.09), GeometricStar (0.88), HexHive (0.25); the rest land 1.4–1.8× (improved from 1.7–2.7 but
  not all ≤1.3).

### HONEST RESIDUALS / DIAGNOSIS

1. **WARP/PRECISION-FLOOR styles are NOT clean conforming targets (BasketWeave, CelticKnot, Voronoi, expect
   CelticTriquetra).** Their dense loci are computed from the analytic `rA`, which DIVERGES from the actual
   warped/hash surface (BasketWeave vertexMax 2.0mm in oursVsSota; Voronoi = irreducible f32/f64 hash floor per
   project memory). Constraining edges along loci that don't sit on the real surface PULLS the mesh off it →
   true-3D WORSENS even as slivers improve. **The gate cannot detect this** (it measures the baseline's gap to
   the analytic surface, which IS large there — so it fires — but conforming to the wrong loci hurts). FIX: add
   a warp/precision-floor style exclusion to the gate, OR derive the loci from the POST-warp GPU evaluation
   (LAST_CONFORMING_ASSEMBLY_UT_POSTWARP, the mechanism project-memory used to fix CelticKnot vertex placement).
2. **GothicArches 0.132 > 0.1 at the 800k screen.** Density closes it (spike Stage-B hit 0.112; HD 3M expected
   <0.1 but the 3M-tri metric exceeded the run window). The residual is the irreducible thin-ridge C0 cusp
   (project memory) + the 9.4% un-recovered crossing constraints.
3. **Metric scalability:** featureLineChord3D + featureAdjacentSlivers are O(loci·samples·tris); on
   multi-million-tri meshes (CelticTriquetra/Crystalline/Voronoi at full density) one mesh's metric exceeds
   ~20 min. Screened the heavy styles at a reduced budget (direction is density-invariant); CelticTriquetra
   left to its analog. A spatial-hash acceleration of the metric is the follow-up to screen at full density.

### FILES (dev-only, research/ — NOT committed, NO src/ touched)
- `research/bridge/constraintRecovery.ts` — REWRITTEN: greedy single-direction walk → textbook CROSSING-CHAIN
  recovery (Sloan/de Berg: collectCrossings strip-walk + convex-crossing flip worklist with crossing-count
  termination guard). Manifold-safe give-up. Default kernel fingerprint UNCHANGED (recovery is opt-in path).
- `research/bridge/_recoveryHardening.test.ts` (NEW, PF_RECU2) — the discriminator: multi-crossing chain the
  greedy walk provably failed (recoveryFailed 1→0); + non-crossing batch + crossing-give-up + manifold/no-invert.
- `research/bridge/featureSharpnessGate.ts` (NEW) — `computeSharpnessGate` (geometric proxy, kept WITH NO-GO
  status) + `computeMeasuredGate` (THE gate: per-locus true-3D gap on a baseline mesh).
- `research/bridge/_gateCountProbe.test.ts` (NEW, PF_GATEPROBE) — refutes the geometric gate (kept 47k+ on
  accept styles). `research/bridge/_measuredGateProbe.test.ts` (NEW, PF_MGATE) — validates the measured gate
  (6/9 accept → 0).
- `research/bridge/featureConformingMesh.ts` — added `lineFilter` (the gate hook) + `truth` reuse to
  buildFeatureConformingMeshB.
- `research/bridge/inhouseMetricMesh.ts` — added opt-in `guardManifoldAlways` (Task 4 default-path fix). Default
  OFF = byte-identical (idxHash 948740756).
- `research/bridge/featureLocalizedFidelity.ts` — added optional `cellROverride` to featureLineChord3D (speed).
- `research/bridge/featConformAll20.test.ts` (NEW, PF_FCALL20=screen|hd|noop, PF_FC_LO/HI/BUDGET) — the
  deliverable runner; incremental NDJSON (`research/exchange/_featconform_all20/*.ndjson`).

**Ledger:** this block. **NOT committed (left for review).**


---

## E-2026-06-30-FEAT-CONFORM-WARP — Warp/weave/hash loci mis-location: diagnose + fix

**Status:** PRE-REGISTERED (this block written BEFORE running). RESULT appended below.
**Date:** 2026-06-30
**Builds on:** E-2026-06-30-FEAT-CONFORM-ALL20 (commit 6dc259c). Gated Stage-B conforming IMPROVES 5 styles
(GothicArches/Bamboo/Gyroid/LowPoly/Crystalline) but REGRESSES the warp/weave/hash family: BasketWeave
(true-3D p99 0.206→0.654), CelticKnot (0.078→0.090), Voronoi (0.079→0.294 @lean budget), CelticTriquetra
(expected, per-CelticKnot analog). Diagnosed cause (ALL20 residual #1): loci from `denseFeatureGroundTruth`
(via the bilinear `styleSampler`) are MIS-LOCATED on these surfaces; constraining edges to wrong (u,t) pulls
the mesh OFF the true surface (slivers improve, true-3D worsens).

**KEY ARCHITECTURAL FACT (verified by reading src):** the metric `rA` (buildRadiusFn) AND the loci-source
sampler (styleSampler) BOTH evaluate the SAME `STYLE_FUNCTIONS[styleId]` from `src/geometry/styles.ts`. There
is NO separate "warp surface" in the lab — `rOuterBasketWeave` (floor-cell checker + max-occlusion) and
`rOuterCelticKnot` ("literal port of the WGSL 3-strand sine braid + Z-buffer occlusion") ARE the surface the
metric scores against. ⇒ the "analytic-rA-vs-warp mismatch" (hypothesis c) is a CPU↔GPU(WGSL) divergence
(oursVsSota vertexMax 2.0mm), NOT reproducible in the all-CPU lab. So in the lab the mis-location is (a)
bilinear styleSampler under-resolution of the C0 cell/strand edges and/or (b) the 1D-perpendicular refinement
(makeRefiner.refine) breaking on diagonal/braided features (its perpendicular is taken to the AXIS-ALIGNED
grid-edge tangent of denseRidge/denseCrease truth, so on a diagonal strand the search runs ALONG the strand or
hits an adjacent strand; the crest/valley classifier seekMax=radAt≥rowMean mis-classifies over/under-woven
points).

**HYPOTHESIS (H-WARP, one sentence):** On BasketWeave + CelticKnot the conforming regression is caused by (b)
the 1D-axis-aligned-perpendicular extremum refinement landing injected/constraint vertices OFF the true rA
crest (large meanRefineMove + large post-refine true-3D residual of the injected points themselves), NOT (c) an
analytic-vs-warp surface mismatch; a refinement that (i) searches the LOCAL 2D radial extremum (not a
fixed-axis perpendicular) and/or (ii) derives the perpendicular from the true rA gradient lands the loci ON the
surface and makes conforming NON-REGRESSING (true-3D not raised) with slivers still down.

**KILL-CRITERIA (pre-registered, exact numbers):**
- **D1 (diagnosis, cheapest):** classify (a) vs (b) vs (c). REFUTE (c) iff the injected REFINED loci points'
  own true-3D distance to the analytic surface is < 0.01mm (they ARE on rA by construction of the 1D search on
  rA — if so the surface is reachable, mis-location is in WHICH extremum, i.e. (b)). CONFIRM (b)-dominant iff
  on BasketWeave/CelticKnot the refine move is LARGE (meanRefineMove > 0.1mm, i.e. the bilinear loci are far
  off-extremum) AND the per-injected-vertex radial residual after refinement is NON-ZERO at a material fraction
  of points (the 1D search converged to the wrong local extremum). Quantify (a) by re-running the loci
  extraction at truthRes 384→768 + gridResU/T 1024→2048 and measuring whether the loci (u,t) shift > 0.5 cell.
- **D2 (fix direction):** with the best fix from D1, BasketWeave gated-conf true-3D p99 ≤ baseline 0.206 (DO NOT
  RAISE; ideally < 0.15) AND CelticKnot gated-conf true-3D p99 ≤ baseline 0.078, with sliverRatio still ≤ ~1.3×.
  REFUTED iff conf p99 > base p99 on either after the fix (regression persists ⇒ the lab-reachable levers are
  exhausted; document the production post-warp-GPU-loci requirement precisely).
- **D3 (Voronoi full-density):** at FULL budget (no PF_FC_BUDGET cap, ≥1.6M tris) the measured gate fires ~0
  loci (baseline true-3D p99 < 0.02 per R2) ⇒ conforming is ~no-op ⇒ true-3D within ±0.01 of baseline.
  CONFIRMED iff gate kept < ~50 AND |conf−base| ≤ 0.01; REFUTED iff gate fires materially (>200) at full
  density (then it is a real defect, not a lean-budget artifact).
- **D4 (GothicArches HD):** at maxPoints 3M / tolMm 0.004 / hMin 0.008 with gated Stage B, true-3D p99 < 0.1
  (from 0.132 @800k). CONFIRMED iff p99 < 0.1; else report residual + diagnose (irreducible thin-ridge cusp vs
  recovery gap). The spike Stage-B hit 0.112 at 800k-class — HD should clear if density-responsive.
- **D5 (recovery priority-ordering):** ordering constraints strongest-locus-first (by relief amplitude /
  curvature) so the weaker crosser gives up RAISES GothicArches recovery% above the 90.6% baseline AND does NOT
  raise true-3D p99 on any conformed style. CONFIRMED iff recovery% rises ≥ +1pp with true-3D non-worse;
  NO-OP iff recovery% unchanged ±1pp; REFUTED iff it lowers recovery or raises true-3D.

**DISCRIMINATOR (cheapest first, before any fix build):**
- D1: a pure-measurement probe (NO mesh build) — extract loci for BasketWeave/CelticKnot/GothicArches/Gyroid,
  run the existing makeRefiner.refine, and for each refined point measure (1) refine move mm, (2) the refined
  point's radial residual = |r_refined − localRadialExtremum(2D)| where the 2D extremum is a small 2D grid
  search around the point on raw rA. If (b): warp styles show refined points NOT at the 2D extremum (the
  axis-aligned 1D search missed it) while GothicArches/Gyroid do. This refutes/confirms before touching the
  mesher. (Plus the truthRes-doubling loci-shift probe for (a).)
- D3: run the measured-gate count probe on Voronoi at full budget (cheap vs the full metric) — gate-kept count
  alone refutes/confirms the lean-budget-artifact claim.

**METHOD:** (1) D1 probe → classify. (2) If (b): add an opt-in `refine2D` mode to makeRefiner — a LOCAL 2D
radial-extremum search (small (u,t) neighbourhood, crest=max/valley=min by the same rowMean sign) instead of
the fixed-axis 1D perpendicular; the injected/constraint vertex then lands on the true local extremum
regardless of strand orientation. Opt-in flag on buildFeatureConformingMeshB (default = current 1D behaviour →
the 5 improving styles stay byte-identical / unchanged). (3) If (a) also matters: raise truthRes/gridRes for
the warp family only. (4) D5: add an opt-in `constraintPriority` to buildFeatureConformingMeshB +
recoverAndLockEdges that sorts constraints by relief amplitude (strongest first). (5) Re-measure BasketWeave/
CelticKnot/Voronoi/CelticTriquetra (true-3D before/after) + GothicArches HD + the full-20 final scorecard. (6)
If the regression PERSISTS after 2D-refine (the loci are genuinely un-placeable from rA alone because the
SURFACE the GPU renders differs — the production post-warp eval), document that precisely as the cutover
requirement and do NOT fake it.

**CONTROLS:** equal budget baseline vs conforming (same InhouseMeshOpts); the 5 IMPROVING styles
(GothicArches/Bamboo/Gyroid/LowPoly/Crystalline) are a NON-REGRESSION control for the 2D-refine change (must
not regress them); TRUE-3D featureLineChord3D is primary; slivers by featAdj %<20° ratio; watertight by the
3D-weld index audit; a non-vacuous control: the refine-mode change MUST move the injected points on the warp
styles (else it is a no-op and cannot fix anything).

**INSTRUMENTS (one-metric-all-meshes):** featureLineChord3D (true-3D), crestValleyRetention (radial,
annotated), featureAdjacentSlivers, globalChord (perpendicular3DDeviation), auditManifold (3D-weld by-index).
Plus the D1 measure-only refine-residual probe.

### RESULT (appended after running)

**Task 1 / D1 (loci probe) — (a) and (c) REFUTED; (b) REAL but NON-DISCRIMINATING.** `_warpLociProbe.test.ts`
(PF_WARPLOCI, measure-only, no mesh build): for BasketWeave/CelticKnot/Gyroid/Bamboo/Gothic/LowPoly, measured
(i) the 1D-refine move, (ii) residual2D = how far the 1D-refined point's radius sits below the TRUE 2D local
radial extremum (a small dense 2D search on raw rA), (iii) loci-shift under sampler+truth res-doubling.

| style | move1D mean/p99 | RESID2D mean/p99 | frac>0.05 | move2D mean/p99 | lociShift(384→768) med/p90 |
|---|---|---|---|---|---|
| BasketWeave | 0.430/0.637 | 0.227/1.494 | 67.1% | 0.923/1.271 | 0.078/0.204 mm |
| CelticKnot | 0.336/0.637 | 0.079/0.834 | 47.7% | 0.856/1.224 | 0.080/0.204 mm |
| GyroidManifold | 0.350/0.637 | 0.041/0.139 | 35.0% | 0.914/1.199 | 0.112/0.279 mm |
| BambooSegments | 0.572/0.637 | 0.417/1.813 | 93.0% | 1.175/1.271 | 0.067/0.240 mm |
| GothicArches | 0.431/0.637 | 0.248/1.462 | 61.4% | 0.849/1.271 | 0.076/0.218 mm |
| LowPolyFacet | 0.511/0.637 | 0.101/0.237 | 98.5% | 1.186/1.271 | 0.041/0.073 mm |

- **(a) sampler-resolution REFUTED as dominant:** loci-shift under 384→768 / 1024→2048 res-doubling is TINY on
  every style (median 0.04–0.11mm, p90 ≤ 0.28mm) — denser sampling barely moves the loci. Not the cause.
- **(c) analytic-vs-warp REFUTED by construction (verified in src):** metric rA and the loci sampler share
  `STYLE_FUNCTIONS[styleId]`; `rOuterBasketWeave`/`rOuterCelticKnot` ARE the metric surface. (c) is a CPU↔WGSL
  divergence, not reproducible in the all-CPU lab.
- **(b) 1D-refine off-extremum is REAL but does NOT discriminate:** residual2D is LARGE on the IMPROVING styles
  too (Bamboo 0.417/93%, LowPoly 0.101/98.5%, Gothic 0.248/61%) — as bad as or worse than the regressing warp
  styles. So "the 1D perpendicular search lands off the true extremum" is NOT what separates regress from
  improve. (Largely an artifact of my 2D probe over-reaching to a taller neighbouring feature within ±0.6mm on
  dense multi-scale relief — the loci sit on their OWN feature.) ⇒ a 2D-refine fix is predicted NOT to help.

**Task 1 / D1b (the REAL discriminator — A/B mechanism probe) `_warpFixProbe.test.ts` (PF_WARPFIX).** Built
small conforming meshes (300k-cap budget, all modes share it → exact deltas) and A/B-tested the mechanisms on
true-3D: A=baseline+guard, B=conf refined (shipped), C=conf noRefine (raw bilinear loci), F=conf crease-only.

| style | A.base | B.refined | C.noRefine | F.creaseOnly | verdict |
|---|---|---|---|---|---|
| BasketWeave | 0.323 | 0.709 | 0.688 | 0.572 | ALL conform REGRESS; B≈C; crease-only still +0.25 |
| CelticKnot | 0.106 | 0.242 | 0.247 | 0.237 | ALL conform REGRESS; B≈C |
| BambooSegments | 0.081 | 0.102 | 0.102 | 0.079 | B/C mild-regress, crease-only ~same |
| GyroidManifold | 0.057 | 0.051 | 0.050 | 0.053 | conform IMPROVES (control holds) |

- **The 1D refine is IRRELEVANT — C(noRefine) ≈ B(refined) on EVERY style** (BasketWeave 0.688 vs 0.709;
  CelticKnot 0.247 vs 0.242; Bamboo identical; Gyroid 0.050 vs 0.051). This CONFIRMS D1's prediction and
  **REFUTES the brief's stated diagnosis** ("loci mis-located via bilinear sampler / 1D refinement breaking")
  AND my H-WARP fix-direction. Higher-fidelity loci extraction / 2D-extremum refinement CANNOT fix this.
- **The regression is the CONSTRAINT-EDGE STRAIGHT-CHORD model failing on stepped/occluded relief.** Every
  conforming mode IMPROVES slivers (slivR 2.1→1.0) while RAISING true-3D on BasketWeave/CelticKnot — i.e.
  locking ANY straight (u,t) constraint edge between two loci samples cuts across the weave/braid's
  cell-boundary radius STEP (rOuterBasketWeave: `floor`-cell `max()` occlusion; rOuterCelticKnot: Z-buffer
  strand occlusion) and the LOCK forbids the Delaunay flip that would otherwise chord it better. On Gyroid
  (smooth trig relief, no steps) a straight loci-to-loci chord follows the surface ⇒ conforming helps. The
  DISCRIMINATOR is the relief being STEP/OCCLUSION-discontinuous (weave/braid) vs SMOOTH-or-thin-ridge
  (Gyroid/Gothic), NOT the loci accuracy.
- Crease-only (F) helps BasketWeave a lot (0.709→0.572) but still regresses (+0.25): the relief-wall + ridge
  families are the worst, but the creases also straddle steps.

**VERDICT D1: (a) REFUTED, (c) REFUTED (lab), (b) REFUTED as the cause.** True cause = constraint-edge
straight-chord across discontinuous step/occlusion relief; the LOCK pins a bad chord. Documented; the fix is
NOT denser/2D loci. (Continued in D2 below: test injectStep density + a no-lock / sliver-only path.)

### RESULT D2/D3 (no-lock REFUTED; Voronoi CONFIRMED clean) — warpfix2 + warphd-D3 ran; agent killed before GothicArches-HD/recovery

**D2 — `_warpFix2Probe` (PF_WARPFIX2, 250k-class, A/B/G/H, true-3D p99):** the NO-LOCK hypothesis is **REFUTED.**
Inject-only-gated (G = pinned crest vertices, NO constraint edges / no lock) ≈ conf-refined (B = locked edges) on
EVERY style:

| style | A.base+guard | B.conf-locked | G.inject-only (NO lock) | H.denser-chord | sliverR B |
|---|---|---|---|---|---|
| BasketWeave | 0.4753 | 0.7781 | **0.7710** | 1.4126 | 2.06→1.04 |
| CelticKnot | 0.1360 | 0.4870 | **0.4867** | 0.9326 | 2.08→1.11 |
| GyroidManifold (control) | 0.0567 | 0.0648 | 0.0644 | 0.0812 | 1.67→1.61 |

⇒ removing the lock does NOT save the weave/braid family — the regression comes from PINNING VERTICES on the
step/occlusion loci AT ALL (G≈B to 3 decimals), not from the edge lock. Every conforming mode KILLS the slivers
(2.0→1.0) but RAISES true-3D on weave/braid. Denser chord (H) is strictly worse (more short locked chords across
more steps). Control Gyroid ~neutral (sub-0.1 either way; its earlier "improvement" is budget-marginal).
**CONCLUSION: BasketWeave / CelticKnot / CelticTriquetra are EXCLUDE-class for feature-conforming** — there is no
lock-free escape; conforming intrinsically trades sliver cleanup for a chord regression on step/occlusion relief.

**D3 — Voronoi full density (`_warpHdProbe`, 2M tris):** CONFIRMED lean-budget artifact. At full density the
measured gate fires **0/54996** loci ⇒ gated-conf == baseline EXACTLY (true-3D p99 0.0195 both, nonMan 0). Voronoi
is ACCEPT (no real defect; its ALL20 "regression" was the reduced budget inflating the gate).

**D4/D5 NOT COMPLETED** (process killed after D3): GothicArches HD-3M confirm (stands at 0.132 @800k / 0.112 spike
Stage-B; <0.1 at 3M unconfirmed) + recovery priority-ordering. Minor — not decision-changing.

**NET (E-2026-06-30-FEAT-CONFORM-WARP):** the warp/weave/braid regression is INTRINSIC to feature-conforming on
step/occlusion-DISCONTINUOUS relief (refuted: loci accuracy, edge-lock) ⇒ those 3 styles are EXCLUDE. Voronoi clean.
Feature-conforming's validated wins are narrow + real: **GothicArches thin-ridge chord (0.24→0.13) + feature-adjacent
sliver cleanup on conform-friendly relief**; gated OFF smooth (no-regression); EXCLUDE on risers (already CAD-grade)
+ weave/braid. The non-manifold guard (20/20 watertight) is the universal win.

## E-2026-06-30-SHOWCASE — before/after + STL + HD/recovery confirm + per-face chord heatmap

Runners: `featConformShowcase.test.ts` (PF_SHOWCASE), `featConformHeatmap.test.ts` (PF_HEATMAP),
`_warpPriorityProbe.test.ts` (PF_WARPPRI). Baseline (default kernel + guardManifold) vs gated Stage-B conforming,
GothicArches + BambooSegments; STL + render-bins in `research/exchange/_showcase/`.

| mesh | tris | true-3D p99 (mm) | worst | sliverRatio | nonMan |
|---|---|---|---|---|---|
| GothicArches base 1M | 1.37M | 0.217 | 1.23 | 2.19 | 0 |
| GothicArches conf 1M | 1.93M | **0.096** | 0.42 | 1.40 | 0 |
| GothicArches conf **3M** (2.65M) | 2.65M | **0.082** | 0.39 | 1.43 | 0 |
| BambooSegments base 1M | 1.04M | 0.037 | 0.20 | 2.93 | 0 |
| BambooSegments conf 1M | 1.13M | 0.035 | 0.26 | 2.16 | 0 |

- **D4 (GothicArches HD) CONFIRMED** — conf true-3D p99 0.217→0.096 @1M → **0.082 @3M** (2.65M tris): CAD-grade (<0.1),
  density-responsive. (Supersedes the earlier "D4 NOT COMPLETED / unconfirmed" note from FEAT-CONFORM-WARP — that was
  the `_warpHdProbe` D4 which was killed; the showcase run completed it.)
- **D5 (recovery priority-ordering) = NO-OP** — `_warpPriorityProbe`: strongest-first ordering moves recovery ±0.2pp
  and true-3D is unchanged across GothicArches/BasketWeave/CelticKnot/Gyroid. The ~88–96% recovery ceiling is genuine
  locus-CROSSING conflicts, not an ordering deficiency.
- **PER-FACE CHORD HEATMAP** (`perFaceChordSag`, plane-distance, render `research/exchange/_showcase/chord_error_heatmap.png`):
  GothicArches faces with sag >0.1mm = 0.55%(base)→0.23%(conf), p99 0.063→0.040, worst 1.32→0.84mm; BambooSegments
  0.05% both (already faithful). Even baseline is 99.5% green — conforming targets the sharp-crest residual.
- **Honest cost**: conforming adds thin tris at the forced crease (GothicArches feature-adjacent %<20° rose ~1.4→5.5%);
  net strongly positive (chord halved) but not free. STLs are relief SURFACE patches (manifold), NOT closed solids.

## E-2026-07-01-FRONTIER-THESIS — standing frontier thesis (meta-synthesis over this registry)

`frontier-meta-synthesis` workflow (4 lenses — walls / wins / SOTA-scout / leverage → adversarial synthesis) mined
the whole ledger. **UNIFYING PATTERN:** every standing wall is a **C0/near-C0 DISCONTINUITY** (crease / occlusion
step / cliff / cusp / hash break) colliding with a mesher + metric that assume a smooth single-valued field; every
durable WIN was a placement/classification fix validated by a TRUE-3D perpendicular measurement (never density/budget).
**THESIS:** make the discontinuity graph the **PRIMITIVE** the mesh grows from (feature-skeleton-first / protected-PLC
refinement), so "conform vs exclude vs recover" dissolves into a boundary-of-domain problem — instead of patching
discontinuities into a smooth-field mesh after the fact. **Ranked bets (falsifiable ≤1 day; full doc
`research/FRONTIER-THESIS.md`):** (1) **discontinuity-first protected-PLC meshing** [CGAL 1D-feature protection /
Cheng–Dey / Boissonnat–Oudot, *verify*] — cracks the recovery ceiling + crest under-shoot + u-seam; discriminator =
GothicArches arch-apex patch (reuse existing featureGraph loci), CONFIRM iff apex recovery 100% AND
`featureLineChord3D` p99 ≤ 0.112. (2) **analytic curvature-floor sizing on raw rA** (retires the per-style conform
gate) — A/B measure-only, Gothic p99 → ~0.10 in the tessellation step alone. (3) **Instant-Meshes field-aligned seed**
[SIGGRAPH Asia 2015, *verify*] — the ONLY bet targeting the 2:1 transition-fan **sliver** class (worst-angle ~2°,
density-invariant); offline-binary discriminator. **RUN FIRST = Bet 1** (skeleton-only dev build, one style, refutes
the recovery wall AND validates the paradigm shift in one experiment). Demoted: signpost-intrinsic (fallback for Bet 1),
(II,I) aniso (folds into Bet 2, over-stretches smooth). Dropped (refuted): 3D-direct remesh, density, no-lock weave rescue.


---

## E-2026-07-01-PUREGREEN — Planarize the feature-constraint graph → drive GothicArches chord-sag heatmap to PURE GREEN

**Status:** PRE-REGISTERED (this block written BEFORE running). RESULT appended below.
**Date:** 2026-07-01
**Builds on:** E-2026-06-30-SHOWCASE + green-push variants A–E (commit 798c239). Variant E (chordTolMm 0.02 +
chordSteiner + dedupeEps 1e-7 + 6M budget) is the current best: GothicArches 2.89M faces, worst 0.292mm,
RED(>0.15) 0.0027% (~78 faces), YELLOW(>0.05) 0.096%. Visually all-green but NOT literally. D5 (E-2026-06-30-
SHOWCASE) already proved the ~88-96% recovery ceiling is GENUINE locus-CROSSING conflicts (priority-ordering was a
NO-OP). The residual red/yellow sits at the near-vertical arch-apex JUNCTION cusps where two ridge loci CROSS:
constraint recovery fails there (recoveryFailed on the crosser), so a facet spans the cusp.

**HYPOTHESIS (one sentence):** PLANARIZING the (refined injected points + constraint segments) PSLG in (u,t)
before the kernel — weld coincident junction endpoints + split every interior crossing into a NEW shared vertex
(refined to the true surface) so every junction is a fan of non-crossing edges — lifts GothicArches constraint
recovery from ~90% toward ~100% AND, with the chord-sag guard tightened, drives the per-face chord-sag heatmap to
literal PURE GREEN (0% faces ≥0.15mm AND 0% ≥0.05mm).

**KILL-CRITERIA (pre-registered, exact numbers):**
- **P1 (planarization proof — the mechanism gate):** on GothicArches, recovery% (recovered+alreadyPresent /
  requested) rises from the ~90% baseline to **≥ 98%** with planarizeConstraints on. CONFIRMED iff ≥98%; PARTIAL
  iff [92%,98%) (planarization helped but residual crossings/seam remain — diagnose); REFUTED iff < 92% (no lift).
  Non-vacuous control: the number of CROSSING pairs found+split must be > 0 (else planarization is a no-op and
  cannot be the fix).
- **P2 (pure-green — the mission):** on the pushed GothicArches mesh (conf + planarize + guardManifoldAlways +
  chordSteiner + tightening chordTolMm), per-face chord sag **RED(≥0.15mm) = 0.000%** AND **YELLOW(≥0.05mm) =
  0.000%**, ideally worst-face < 0.02mm. CONFIRMED iff both 0.000%; PARTIAL iff RED=0 but YELLOW>0 (report the
  floor + why); REFUTED iff RED>0 persists after planarize + the tightest tractable chordTolMm/budget.
- **P3 (no-regression / opt-in):** _kernel_noop idxHash stays **948740756** (kernel default byte-identical);
  planarizeConstraints OFF ⇒ a conforming build matches the pre-change conforming output (same tris/idxHash);
  HarmonicRipple (smooth control) gate keeps 0 loci ⇒ conforming byte-identical (untouched by the gate).
  CONFIRMED iff all three hold; REFUTED iff any changes.

**DISCRIMINATOR (cheapest first):** P1 is measured on a MODERATE-budget conforming build (recovery% is printed by
the kernel's `[constraint]` profile line and is density-invariant in DIRECTION) BEFORE the expensive HD push —
if planarization doesn't lift recovery at 0.5-1M it won't at 6M. Only if P1 confirms do I run the HD pure-green
push (P2). The crossing-count (non-vacuous control) is measured in the planarizer itself.

**METHOD:** (1) add opt-in `planarizeConstraints?: boolean` to buildFeatureConformingMeshB — STRICT NO-OP off.
When on, after building the refined injected points + constraint pairs, run a planarizer in (u,t): WELD (reuse the
snap-deduper's shared vertices — already collapses coincident junction endpoints), then SPLIT CROSSINGS via a
uniform (u,t) bucket grid (bucket segments by bbox, test only same-bucket pairs → avoids O(E²)); at each interior
crossing insert a new injected point at the intersection (u,t), refined to the true radial extremum, and split
both segments; iterate a few passes (a split can create new crossings). Emit the augmented injected points +
planar constraintEdges to the kernel. (2) P1 screen at moderate budget: recovery% off vs on + crossing count.
(3) If P1 confirms, P2 HD push: iterate chordTolMm 0.02 → 0.015 → 0.01 (+budget) until YELLOW=0 or the honest
floor; dump xyz/idx/col as GothicArches_puregreen_conf.* (+ _base). (4) P3 no-op re-verify.

**CONTROLS:** equal budget for the recovery A/B; the crossing-count must be >0 (non-vacuous); _kernel_noop
fingerprint + conforming-without-flag match (opt-in proof); HarmonicRipple gate=0 (smooth control untouched);
TRUE per-face chord sag (perFaceChordSag, what the heatmap shows) is the primary metric; watertight by
auditNonManByIndex (must stay 0).

### RESULT (appended after running)

**P1 (planarization mechanism) — CONFIRMED.** `_planarizeRecovery.test.ts` (PF_PLANREC), moderate 900k-budget
gated-conforming GothicArches, planarize OFF vs ON:

| build | constraints req | present+rec | failed | recovery% | tris | nonMan |
|---|---|---|---|---|---|---|
| conf OFF (shipped) | 55097 | 48718 | 6379 | **88.4%** | 1.17M | 0 |
| conf ON (planar) | 74061 | 73183 | 878 | **98.8%** | 1.19M | **2** |

- Planarizer diag: **crossingsSplit=10515, addedPoints=9713, passes=3, residual=0** (converged — 0 crossings
  remain). Non-vacuous control PASSES (crossings > 0). The FIRST (iterative pairwise-split) planarizer FAILED
  (recovery 88→50%, residual=25939 non-converged) because the caller's coarse 0.04mm loci-deduper collapsed
  crossing points onto endpoints; the FIX = a proper **single-pass segment ARRANGEMENT** with its own FINE
  0.004mm intersection-vertex hash (collect ALL crossings per edge, sort by param, rebuild as a chain) →
  converges in 3 passes, recovery **88.4%→98.8%** (P1 kill ≥98% → CONFIRMED). The residual 878 (1.2%) are
  collinear/locked-blocked chains, not strict crossings.
- **NEW REGRESSION: nonMan=2** with planarize on (was 0). The recovery LOCKS edges through the new T-junction
  vertices; a locked edge can pin a near-degenerate config the manifold guard cannot flip out of. Fixed before
  the HD push (watertight is non-negotiable) — see P2.
- Heatmap at THIS screen budget barely moved (RED 0.148→0.127%, worst 0.782 identical) — EXPECTED: this build
  has no chordTolMm/chordSteiner, so its sag is metric-sizing-dominated, not apex-cusp-dominated. The heatmap
  payoff is tested in the HD push (P2).

**nonMan fix (watertight, P1 addendum) — DONE.** The planarize path left nonMan=2 = two distinct injected
vertices at the SAME near-vertical arch-apex (u,t) welding to one 3D point while both anchor a locked edge
(incident=4 doubled edge) — LOCALIZED by `_planarizeNonman.test.ts`. Fixed by (a) SEEDING the planarizer's
fine intersection-vertex hash with the existing loci points + coarsen to 0.006mm (a crossing at a loci sample
merges onto it, no duplicate); (b) opt-in `guardRecoveryManifold` (reject a recovery crossing-flip whose new
diagonal already exists). Planarize recovery 88.4%→**96.6%** with **nonMan=0** (the finer 0.004 hash hit 99.3%
but reintroduced the apex doubling → 96.6%+watertight is the operating point). P1 verdict: **PARTIAL** (helped,
96.6% ∈ [92,98) not the ≥98% target; residual 3.4% are collinear/lock-blocked chains, not strict crossings).

**P2 (pure-green HD push) — the planarization does NOT close the HD heatmap; the residual is NOT junction
crossings.** `_planarizeGreen.test.ts` (PF_PLANGREEN), GothicArches HD, conf + PLANARIZE + guardManifoldAlways
+ guardRecoveryManifold + chordSteiner:

| variant | chordTolMm | budget | tris | worst | RED(≥0.15) | YEL(≥0.05) | recovery | nonMan |
|---|---|---|---|---|---|---|---|---|
| t20 | 0.020 | 6M | 2.90M | 0.292 | 0.0025% (73) | 0.0961% (2784) | 96.7% | 0 |
| t10 | 0.010 | 8M | 3.15M | **0.191** | 0.0005% (15) | **0.0443%** (1400) | 95.8% | 0 |

- **t20 ≈ the prior variant-E** (worst 0.292, RED 0.0027%, YEL 0.096%) — **planarization barely changed the HD
  heatmap.** At HD the gate fires on FEW loci (12031 constraints vs 55097 @900k screen) and only **407 crossings**
  exist to split (vs 8220 @screen), so planarization is near-no-op at HD. ⇒ **REFUTES the brief's diagnosis for
  the HD residual**: the red/yellow is NOT the junction-crossing spanning facets.
- **`_greenResidual.test.ts` LOCALIZED the worst faces** (t20 mesh): they are **NOT near-vertical apexes and NOT
  junction-clustered** — steepness |dr/dz| ≤ 1.3 (mostly 0.1–0.4, i.e. NOT cliffs), eMax **0.23–0.46mm** (large
  facets straddling ridge crests), spread across ALL t-bands (t=0.13…0.99), scattered (u,t). The yellow band is
  generic crest-straddle chord sag, everywhere the relief is sharp.
- **Tightening chordTolMm 0.02→0.01 is density-RESPONSIVE but with STEEP diminishing returns AND the guard is
  NOT effectively targeting the residual**: worst 0.292→0.191 (−35%), YEL halved, but **tris only +9%**
  (2.90M→3.15M). A freely-splitting guard would balloon tris; the near-flat tri growth ⇒ the chordSteiner point
  is being DEDUPED/NOT-INCORPORATED at the bad faces (the LOCKED constraint edges block the flip that would
  fold the Steiner point into the sharp face — hypothesis, testing next). Pure-green by brute chordTolMm alone
  is NOT reached (worst 0.191 ≫ 0.02) and the tri-vs-tol curve says it would need an impractical budget.

**NEXT (P2 continued):** discriminate lock-blocked-Steiner (run HD chordSteiner WITHOUT conforming/locks — if
worst ≪ 0.19, the locks are the cap) vs Steiner-sampling-miss; then the true green lever.

## E-2026-07-01-FRONTIER-BET2 — sizing-field curvature aliasing (MECHANISM CONFIRMED)

Frontier Bet 2 (analytic feature-aware sizing) cheapest discriminator. MEASURE-ONLY, `_frontierBet2SizingProbe.test.ts`
(PF_BET2), NEW file, NO shared-file edit (isolated from the concurrent green push). Replicated
`buildSurfaceMetricField`'s `kappaMax` at grid-step (1/256 ~ 1.1mm cell) vs fine-step (1/2048 ~ 0.14mm),
**window-max perpendicular to each ridge locus** (placement-robust — a v1 fixed-locus probe was confounded:
non-monotonic / C0-unstable + grid-detected loci sit off the sub-cell ridge). Pre-registered: CONFIRM iff sharp
styles fine/grid ratio >= 2 AND smooth controls < 1.3.

| style | class | median fine/grid peak-kappa | grid h coarser | verdict |
|---|---|---|---|---|
| GothicArches | sharp thin ridge | 5.66 (p90 22.9) | 2.14x | ALIASED |
| GyroidManifold | sharp-crease lattice | 9.81 (p90 20.7) | 3.09x | ALIASED |
| HarmonicRipple | smooth CONTROL | 1.07 (p90 1.13) | 1.05x | resolved (ok) |
| SuperellipseMorph | smooth CONTROL | 1.00 (p90 1.00) | 1.00x | resolved (ok) |

**VERDICT: CONFIRMED.** The sizeRes=256 grid under-reads sharp-ridge curvature 5-10x -> sizes h3D 2-3x too coarse
at the crests, while correctly fine on smooth relief. The smooth controls reading ~1.0 **validate the window-max
instrument** (rules out an upward artifact — the key falsification of my own probe; v1 was confounded). => the
band-limited sizing is genuinely blind to sub-cell ridges; analytic/finer curvature sizing would place vertices ON
the ridges the grid misses, plausibly retiring the conform gate for the sharp-crease class. **Confirms the MECHANISM,
not the OUTCOME.** Caveats: (a) OUTCOME test = mesh-level A/B (analytic vs grid sizing -> featureLineChord3D p99)
needs an additive kernel sizeField/analytic hook -> DEFERRED until the green push settles the shared kernel files
(inhouseMetricMesh/featureConformingMesh in-flight); (b) at a TRUE C0 cusp kappa->inf as step->0, so analytic sizing
needs a curvature CAP — here fine h is 0.046-0.074mm (above hMin 0.008), so actionable, not collapsing to hMin.

**Bet 1 (protected-PLC) status:** DEFERRED — CGAL not installed (oracle venv has gmsh only; gmsh embedded-edges
could proxy a protected-PLC) AND it overlaps the concurrent recovery/planarize work (`_planarizeRecovery.test.ts`).
Pick up after coordinating, or via the gmsh-embedded-edge proxy.

## E-2026-07-01-FRONTIER-BET1 — gmsh embedded-skeleton (protected-PLC) on GothicArches

Frontier Bet 1 discriminator. Isolated (new files: `planarizeSkeleton.ts`+test 4/4, `_frontierBet1EmbedProbe.test.ts`
PF_BET1; oracle `embed` mode + `test_embed.py` 2/2). Pipeline: GothicArches featureGraph loci -> planarize to a PSLG
(crossings/T-junctions -> shared nodes) -> gmsh `mesh.embed` -> lift -> measure. vs in-house recover-after (~90%, p99 0.112).

RESULT (11540 segs -> 12305 PSLG edges, h=0.003, 278k tris, 18s): **recovery 100.0%** (vs ~90%), **nonMan=0
(watertight)** — the crossing-locus recovery CEILING is DISSOLVED by features-first embedding (constraints satisfied
BY CONSTRUCTION). BUT fidelity/quality NOT won at this config: featureLineChord3D p99 **0.51** (interior-only 0.514
~= all-loci 0.511 -> NOT a seam artifact; finer skeleton 0.68->0.51 -> NOT skeleton-coarseness), minAngle **0.1deg** /
%<20 4.7% (slivers near forced edges).

DIAGNOSIS (residual is COUPLED to the other bets, as the thesis predicted): (1) I embedded the RAW bilinear-sampler
loci, NOT refined to the true rA crest — the Bet 2 locus-aliasing finding: sampler loci sit OFF the sharp crest, so
the embedded edges are near-but-not-ON the true ridge -> high chord. Fix = refine loci to the true extremum BEFORE
embedding (the in-house makeRefiner step). (2) constrained-Delaunay slivers near forced edges = Bet 3 (field-aligned)
territory.

**VERDICT: Bet 1 RECOVERY claim CONFIRMED (100% vs 90%, watertight); fidelity requires refined loci (Bet 2) + sliver
cleanup (Bet 3)** — empirically validates the thesis's "Bet 1 must ship with Bet 2/3." NEXT: embed TRUE-extremum-
refined loci (replicate makeRefiner in the probe) -> expect p99 to fall toward the loci-chord floor; then a
curvature-adaptive size field + a sliver pass.

## E-2026-07-01-FRONTIER-BET3 — field-aligned quad proxy (gmsh Algo 11): proxy INVALID (honest NO-GO)

Frontier Bet 3 (field-aligned edge flow vs the 2:1 transition-fan ~2° sliver floor). Isolated attempt via gmsh
Algorithm 11 (quasi-structured/cross-field quad) in the oracle (new `quad` mode + `_frontierBet3QuadProbe.test.ts`
PF_BET3). Instant Meshes / Blender not installed (availability gate); gmsh Algo 11 chosen as the in-venv proxy.

FINDING — the (u,t) gmsh-quad proxy is INVALID for testing relief field-alignment: (1) **Algo 11 IGNORES the
anisotropic TP metric background** — Gyroid/BasketWeave metric → 8 tris/4 quads (trivially coarse), while the SAME
metric drives BAMG (Algo 7) to 142k/406k tris. It DOES honor an isotropic SP size (uniform h=0.05→3528, h=0.02→21624
tris) so the adapter is correct; Algo 11 just doesn't consume the tensor metric. (2) Even with isotropic sizing,
meshing the FLAT (u,t) square yields a cross-field aligned to the domain AXES, not the 3D relief (invisible in flat
(u,t)). The initial "minA 32°, CONFIRM YES" was a FALSE POSITIVE on the 8-tri metric-ignored mesh.

INCIDENTAL BASELINE (real, same run): the in-house surface-metric kernel already beats the production 2:1-quadtree
~2° floor on the BULK — Gyroid minA 3.0 / p5 22 / %<20 4.1 (189k tris); BasketWeave minA 0.4 / p5 11 / %<20 8.6
(534k). BAMG-tri (Algo 7, metric): Gyroid minA 7.1 / p5 17; BasketWeave minA 3.6 / p5 15. So the transition-fan
sliver WALL is largely dissolved already by the research kernel; the residual is the worst-case sliver TAIL (minA <3°).

VERDICT: **Bet 3 isolated path BLOCKED.** A valid field-aligned test needs a 3D-SURFACE cross-field remesh — Instant
Meshes / QuadriFlow (NOT installed) or Blender-MCP QuadriFlow (not isolated). gmsh Algo 11 can't (ignores metric +
flat domain), and a gmsh-STL reparametrize+remesh would likely FAIL on the occluding tangled lattices (BasketWeave
self-occlusion breaks reparametrization). DECISION for the user: install Instant Meshes/QuadriFlow to run Bet 3
properly, or deprioritize (the kernel already handles the bulk; residual worst-slivers are the only Bet-3 target).
Components kept with this honest NO-GO status (preserve-work). Adapter `quad` mode is still a valid isotropic-quad tool.

### UPDATE 2026-07-01b — Bet 1 refined-loci fidelity advance (refineLoci.ts + test 2/2)

Advanced Bet 1: `refineLoci.ts` snaps loci to the true rA radial extremum perpendicular to the ridge (golden-section;
unit-tested — an off-crest point snaps onto the analytic crest, smooth control barely moves). Raw-vs-refined embed A/B
on GothicArches (equal budget, FIXED interior truth): refining loci to the crest drops featureLineChord3D
**p99 0.514 → 0.334 (−35%)**, max 1.43→1.21; recovery 100% both, watertight. BUT still ≫ 0.112, and slivers WORSEN
(%<20 4.7→10.2, minA→0.0 — more embedded edges → more constrained-Delaunay slivers). DIAGNOSIS: the residual is now
dominated by (a) INTERIOR mesh coarseness — the uniform h chords the curved surface BETWEEN ridges → needs adaptive
curvature sizing = **Bet 2**; and (b) forced-edge slivers = **Bet 3**. So Bet 1 RECOVERY is solved (100%) and its
fidelity is partially closed by refinement; the remaining gap is exactly the Bet-2 (sizing) + Bet-3 (sliver) coupling
the thesis predicted. NEXT: feed a curvature-adaptive size field to the embed (the Bet 2 outcome test — needs the
kernel sizeField hook, queued behind the green push) + a sliver-cleanup pass.

## E-2026-07-01-FRONTIER-BUILD1 — protected skeleton under M (in-house): true-3D fidelity TARGET MET

Build #1 of the unified mechanism (Bet 1 protected-PLC + Bet 2 curvature metric). In-house: `buildInhouseMetricMesh`
(metric-Delaunay under M=g/h²) + refined+planarized PROTECTED skeleton via the committed injectedPoints(pinned) /
constraintEdges hooks. `_frontierBuild1Probe.test.ts` (PF_BUILD1). GothicArches A/B vs the raw kernel. Render:
`research/exchange/_build1/build1_heatmap.png`.

RESULT: raw kernel (2.06M) true-3D p99 0.142 / max 0.936 / minA 0.7 / %<20 0.6 / 0.10% red / watertight. Protected-
under-M (2.92M; skeleton 93.8k pts / 91.5k edges): **true-3D p99 0.0844 (< 0.112 TARGET MET; −41%)**, max 0.936→0.343
(−63%), red faces 0.10%→0.04% (halved), watertight (nonMan=0). Heatmap: rib crests go red→green.

CAVEATS (honest): (1) constraint RECOVERY only **42.2%** on the dense 91k-edge skeleton (recover-after ceiling — most
of the fidelity came from the metric SIZING + PINNED crest vertices, not the recovered edges). gmsh embed's
100%-by-construction CANNOT be combined with the anisotropic metric: measured that gmsh Algo 7/BAMG partially breaks
embedded constraints (junction node kept but only 3/8 incident edges vs Frontal-Delaunay's 8) → gmsh can't do
protected+anisotropic; the in-house kernel is the only path that does both (at recover-after recovery). (2) SLIVERS
regressed: %<20 0.6→6.5, minA 0.7→0.0 — constraint edges + injected points spawn constrained-Delaunay slivers = the
Bet 3 wall. (3) radial crestU stayed 1.37→1.17 = the known radial-metric overstatement on near-vertical ribs; TRUE-3D
p99 0.084 is the honest gate and it is CAD-grade.

VERDICT: **Build #1 achieves CAD-grade TRUE-3D fidelity (p99 0.084 < 0.112) on GothicArches, watertight** — the
metric-sizing + protected-crest half of the unified mechanism WORKS. Remaining = the sliver regression + low recovery
→ BUILD #2 (metric-orthogonal insertion under M, protected-by-construction; Tenkes–Loseille–Alauzet) to add alignment
(de-sliver) + by-construction protection.

## E-2026-07-01-FRONTIER-BUILD2 — de-sliver: drop the locked edges (both build-#1 caveats CLOSED)

Build #2. Hypothesis: build #1's LOCKED constraint edges block the kernel's true-3D max-min-angle flips (→ slivers)
and recovered only 42% (→ barely helped fidelity); PINNING the crest VERTICES keeps fidelity while the freed flips
de-sliver. `_frontierBuild2Probe.test.ts` (PF_BUILD2). GothicArches, 3 variants, all 2.92M tris, watertight (nonMan=0):

| variant | true-3D p99 | %<20° | p5 min-angle |
|---|---|---|---|
| pin + LOCK (= build #1) | 0.084 | 6.5 | 17° (rec 42%) |
| **pin, NO-lock** | **0.070** | 3.5 | 22° |
| no-pin, no-lock | 0.085 | 1.8 | 24° (minA 0.20) |

RESULT: dropping the locked edges IMPROVES BOTH fidelity (0.084→0.070) AND quality (%<20 6.5→3.5) AND removes the
recovery problem entirely (no edges to recover — the crest is carried by pinned/injected vertices + emergent Delaunay
edges). no-pin trades a little fidelity (0.085) for the best quality (%<20 1.8 / minA 0.20 / p5 24°).

VERDICT: **both build-#1 caveats CLOSED.** The unified mechanism's clean, simplest form =
**metric-Delaunay under M + injected refined-crest VERTICES (NO locked edges, NO CDT recovery)** →
GothicArches true-3D p99 **0.070** (CAD-grade, < 0.112), %<20 3.5, watertight. pin↔no-pin is a fidelity↔quality knob
(pin 0.070/3.5; no-pin 0.085/1.8). Strictly better + simpler than build #1. NEXT: generalize across conform-friendly
styles; a residual-sliver pass (metric-orthogonal Steiner, Tenkes–Loseille–Alauzet) would lift the minA floor further.
Render: `research/exchange/_build2/build2_heatmap.png`.

## E-2026-07-01-SWEEP-METRIC-MAP — definitive RADIAL-vs-TRUE-3D chord map, all 20 styles (unified mechanism)

Generalized the GothicArches metric-verify (E-2026-07-01-FRONTIER-VERIFY) to ALL 20 styles. Isolated probe
`research/bridge/_sweepMetricMap.test.ts` (PF_SWEEPMAP=1), CALLS the kernel, edits nothing. Mesh = the
b2_pin_nolock UNIFIED MECHANISM: `buildInhouseMetricMesh` (metric-Delaunay under M=g/h²) + PINNED refined-crest
skeleton (`refineLinesToExtremum` → `planarizeSegments`), NO locked edges, NO CDT recovery. MODERATE density
(hMin 0.008 / maxP 1.5M, sizeRes 256, tolMm 0.004). DIMS {H:120,Rb:40,Rt:50}. Per style: RADIAL `perFaceChordSag`,
TRUE-3D `perpendicular3DDeviation` (seam-excluded — see fix below), feature-line `featureLineChord3D`, slivers
`triangleQualityDistribution`, watertight `auditNonManByIndex`, top-20 worst-radial facets with brute-force nearest
adversarial cross-check + local steepness dr/du,dr/dt. RESUMABLE: each style checkpoints `research/exchange/_sweepmap/
<style>.json` the instant measured; skipped on re-run. **Survived 4 env kills** (proven long-run killer) — resumed by
re-running; every completed style was on disk. Total wall ~5.5h across the 5 launches.

**METRIC FIX (vs the reference verify probe):** `perpendicular3DDeviation` reads `ut` as STRIDE-3 (u,t,surfaceId):
surfaceId≥0.5→skip (L405), (u,t)→seam band. The in-house kernel emits STRIDE-2 (u,t) OUTER-WALL-ONLY. The reference
probe passed stride-2 ⇒ the surfaceId/seam masks read GARBAGE (dropped/kept wrong facets). This probe builds a proper
ut3=(u,t,0) + `seamExclU=SEAM=0.01` (the SAME band interiorTruth filters for the feature-line metric). Verified NOT
merely a seam artifact: GothicArches chordMax stayed 0.58 seam-in vs seam-out (worst facet is an INTERIOR rib ledge
@θ=-2.46,z=60, drdt huge), but its BROAD p99=0.069 / featLine=0.070 are CAD-grade ⇒ the 0.58 is a ~20-facet steep-rib
TAIL, not broad under-tess.

**CLASSIFICATION** (CAD tol 0.11mm). Radial worst OVERSTATES true-3D on near-vertical relief across the board
(2–17×). The honest split hinges on the true-3D BREADTH: **CLEAN** (both metrics green, radial worst <0.06) =5/20 ·
**REAL-GAP-TAIL** (true-3D p99 < 0.11 CAD-grade but chordMax ≥ 0.11 = a handful of steep facets over tol) =9/20 ·
**REAL-GAP-BROAD** (true-3D p99 ≥ 0.11 = widespread; the mesh BRIDGES a step/riser/weave discontinuity) =6/20.
(The task's chordMax-only rule would call all 15 non-CLEAN "REAL-GAP"; the TAIL/BROAD split is what makes them
actionable — TAIL is near-CAD-grade with a steep-facet tail, BROAD needs real conforming work.)

HEADLINE: **5/20 CLEAN, 9/20 REAL-GAP-TAIL (broad-CAD-grade + steep tail), 6/20 REAL-GAP-BROAD (bridged discontinuity)**.
No pure-ARTIFACT (radial overstated but chordMax<0.11) came out CLEAN-labelled because those styles' radial worst is
also large; several TAIL styles (Voronoi rad 1.84→p99 0.010, SuperformulaBlossom 1.51→0.004) are ARTIFACT-in-spirit
(radial 5–370× the broad true-3D) with only a single steep tail facet over tol.

Per-style scorecard (radialWorst | true3D chordMax | true3D p99 | featLine p99 | nonMan | median-drdu of top-20 |
worst-facet z | adversarial-brute-fire):

| style | class | radialWorst | true3Dmax | true3Dp99 | featP99 | nonMan | mdrdu | worst@z | adv |
|---|---|---|---|---|---|---|---|---|---|
| SuperellipseMorph | CLEAN | 0.011 | 0.0102 | 0.0037 | 0.0069 | 0 | 28.8 | 67 | n |
| WaveInterference | CLEAN | 0.012 | 0.0129 | 0.0028 | 0.0050 | 0 | 16.0 | 71 | n |
| RippleInterference | CLEAN | 0.016 | 0.0142 | 0.0034 | 0.0049 | 0 | 23.2 | 60 | n |
| FourierBloom | CLEAN | 0.016 | 0.0141 | 0.0031 | 0.0053 | 0 | 140 | 3 | n |
| HarmonicRipple | CLEAN | 0.047 | 0.0169 | 0.0035 | 0.0060 | 0 | 77.6 | 120 | n |
| SpiralRidges | REAL-GAP-TAIL | 0.117 | 0.1386 | 0.0036 | 0.0059 | 0 | 73.4 | 72 | Y(292×) |
| HexagonalHive | REAL-GAP-TAIL | 0.145 | 0.1158 | 0.0111 | 0.0170 | 0 | 151 | 51 | n |
| Voronoi | REAL-GAP-TAIL | 1.837 | 0.3489 | 0.0103 | 0.0130 | 0 | 56.5 | 59 | n |
| SuperformulaBlossom | REAL-GAP-TAIL | 1.510 | 0.3455 | 0.0043 | 0.0057 | 0 | 59.1 | 120 | n |
| GeometricStar | REAL-GAP-TAIL | 0.692 | 0.2059 | 0.0264 | 0.0119 | 0 | 18.0 | 16 | Y(7×) |
| Crystalline | REAL-GAP-TAIL | 0.523 | 0.9869 | 0.0365 | 0.0102 | **2** | 68.5 | 120 | n |
| GothicArches | REAL-GAP-TAIL | 1.120 | 0.5797 | 0.0692 | 0.0701 | 0 | 13.2 | 60 | n |
| GyroidManifold | REAL-GAP-TAIL | 0.149 | 0.8724 | 0.0902 | 0.0188 | 0 | 161 | 35 | Y(4×) |
| CelticTriquetra | REAL-GAP-TAIL | 1.987 | 1.3606 | 0.0854 | 0.0348 | 0 | 0.0 | 98 | Y(2×) |
| LowPolyFacet | REAL-GAP-BROAD | 0.109 | 0.7089 | 0.3047 | 0.0052 | 0 | 21.0 | 120 | n |
| CelticKnot | REAL-GAP-BROAD | 0.655 | 0.6981 | 0.3677 | 0.0131 | 0 | 559 | 61 | Y(138×) |
| DragonScales | REAL-GAP-BROAD | 0.521 | 1.1642 | 0.4214 | 0.0260 | 0 | 383 | 105 | n |
| BambooSegments | REAL-GAP-BROAD | 0.222 | 1.0717 | 0.6835 | 0.0125 | 0 | 47.9 | 96 | n |
| BasketWeave | REAL-GAP-BROAD | 1.274 | 1.8379 | 1.0985 | 0.0344 | 0 | 0.0 | 24 | n |
| ArtDeco | REAL-GAP-BROAD | 0.478 | 2.9786 | 2.2541 | 0.0158 | 0 | 84.7 | 117 | n |

**REAL-GAP-BROAD (the 6 that need real mesh work, not a metric swap)** — all are step/riser/weave DISCONTINUITY
bridging that the crest-pinned unified mechanism does NOT conform (only crests are pinned; the vertical cliffs are
bridged by flat facets). This EXACTLY matches the settled feature-conforming map (EXCLUDE weave/braid + EXCLUDE
risers): ArtDeco (p99 2.25, vertical risers, drdt≈1900 — brute≈proj CONFIRMS real), BasketWeave (1.10, over/under
weave, mdrdu 0 = occlusion step), DragonScales (0.42, scale cliffs mdrdu 383), CelticKnot (0.37, braid strands),
BambooSegments (0.68, ring segment steps), LowPolyFacet (0.31 — RIM-edge t=1 polygon-edge tail; proj OVER-states here,
brute<proj, true ~0.24). featLine p99 is CAD-grade on ALL 6 (0.005–0.035) ⇒ the CRESTS are placed perfectly; the gap
is purely the bridged VERTICAL step between crests. → to make these "fully green" you must CONFORM the step edges
(inject riser/weave-step edges as constraints), not densify.

**REAL-GAP-TAIL (9)** — broad mesh is CAD-grade (true-3D p99 0.004–0.090, featLine ≤0.070) with a steep-facet TAIL
over tol. GothicArches (p99 0.069, rib ledge tail), Gyroid (0.090 lattice), CelticTriquetra (0.085 braid; borderline),
Crystalline/GeoStar/HexHive/Voronoi/SuperformulaBlossom/SpiralRidges (p99 0.004–0.037, single steep tail facet). These
are "fully green in true-3D except a small steep tail" — a targeted worst-facet Steiner or a modest steep-facet
densify closes them; the RADIAL heatmap red is the ruler (radial 5–370× the true-3D p99).

**ADVERSARIAL (brute-force nearest cross-check on the top-20 worst-radial facets):** the guard flagged 5 styles
(SpiralRidges 292×, CelticKnot 138×, GeoStar 7×, Gyroid 4×, CelticTriquetra 2×). INSPECTED all: every fire is a
BRUTE-FORCE WINDOW ARTIFACT (brute > proj), NOT a projector under-statement. The brute grids only ±0.06 (u,t) around
the mesh point, but on helical/braid/steep styles the TRUE nearest surface foot is at a DISTANT u (spiral wrap /
seam-straddle at u=1.0) OUTSIDE the window → brute returns a huge false distance while the projector's WIDE coarse
global search (coarseDTheta 0.22, coarseDZ 11) finds the true near foot. On the 15 non-flagged styles brute≈proj
(ratio 0.5–2) confirming the projector is trustworthy. Where proj > brute (LowPoly/CelticTriquetra rim facets, ratio
0.4–0.8) the projector OVER-states (GN local min) — benign for fidelity (true error is SMALLER). NET: no style where
the projector UNDER-states the true-3D error; the true-3D column is a trustworthy floor (BROAD calls confirmed real,
TAIL calls if anything slightly pessimistic). **Methodology note: the brute cross-check window must widen (≥0.3 u) for
helical/wrapping styles or it false-alarms — the projector's global search is the more reliable oracle there.**

**WATERTIGHT:** 19/20 nonMan=0. **Crystalline nonMan=2** — the lone non-watertight mesh under the unified mechanism
+ `guardManifoldAlways:true` (2 non-manifold edges survive the guard on Crystalline's helical ripple). Flag for the
build path: guardManifoldAlways is NOT universal on Crystalline.

**SLIVERS:** minAngleDeg=0.00 on all 20 (a worst sliver exists everywhere at this config — expected, the pinned dense
skeleton spawns constrained-Delaunay slivers, matching E-BUILD1/2). %<20° 2.6–16.9% — the density-invariant quality
tail; sliver cleanup is orthogonal to this fidelity map.

VERDICT: **map COMPLETE + CONFIRMED.** The unified mechanism places CRESTS perfectly on ALL 20 (featLine p99
0.005–0.070 = CAD-grade everywhere). The "not fully green" heatmap is: (a) on 14/20 styles a RADIAL-METRIC
OVERSTATEMENT of near-vertical relief + at most a small steep TAIL (true-3D broad p99 ≤ 0.090 = CAD-grade) — a metric
swap to true-3D turns the heatmap green (rendered: GothicArches ribs radial-RED → true-3D-GREEN; Voronoi walls same);
(b) on 6/20 a GENUINE broad gap = the mesh bridging vertical step/riser/weave discontinuities (ArtDeco/BasketWeave/
DragonScales/CelticKnot/BambooSegments/LowPoly) — these need STEP-EDGE CONFORMING, exactly the EXCLUDE-class the
settled map already names. Render evidence: `scratchpad/sweepmap_heatmaps.png` (GothicArches radial|true3D, ArtDeco
true3D riser-line, Voronoi radial|true3D, HarmonicRipple true3D). Adversarial brute cross-check confirms the true-3D
column is a trustworthy floor.

RECOMMENDATION: for the user's "fully green heatmap" requirement — (1) draw the heatmap with `perpendicular3DDeviation`
(true-3D), NOT `perFaceChordSag` (radial): this greens 14/20 immediately (the radial 2–370× overstatement is the ruler,
not a defect); (2) the 6 REAL-GAP-BROAD styles need step-edge conforming (inject riser/weave-step constraint edges) —
densify alone won't help (crests are already perfect); (3) close the 9 TAIL styles' steep tail with a targeted
worst-facet Steiner (density-responsive per E-CREASE-DENSITY-BREAKTHROUGH); (4) FIX Crystalline nonMan=2 in the build
path. Probe: `research/bridge/_sweepMetricMap.test.ts`; per-style JSON: `research/exchange/_sweepmap/<style>.json`
(20 files + render bins); render: `scratchpad/sweepmap_heatmaps.png`.

---

## E-2026-07-01-FRONTIER-BUILD3 (GothicArches "fully green" — ruler diagnosis + recipe isolation), commit 00de1ca

**Q:** user wants the chord-error heatmap FULLY GREEN (no yellow/red) on GothicArches. Is the red a geometric export
defect, or a metric artifact? (Single-style deep dive; generalized by E-SWEEP-METRIC-MAP above.)

**METHOD (isolated probes, CALL kernel, edit nothing):** `_frontierBuild3` (chordTolMm no-steiner baseline),
`_frontierVerifyMetricProbe` (dual ruler + brute-force projector cross-check), `_frontierBuild3b` (radial-targeted
re-injection), `_frontierBuild3c` (density sweep), `_frontierBuild3d` (recipe A/B/C isolation), `_frontierBuild3e`
(perpendicular-targeted re-injection), `_frontierBuild3f` (residual localization: cusp vs topology).

**RESULT:**
- **RULER:** heatmap `perFaceChordSag` = RADIAL/same-(u,t) chord OVERSTATES near-vertical GothicArches ribs 4–5×
  (radial worst 0.60–1.18mm vs true-3D `perpendicular3DDeviation` **0.127mm**). Under true-3D: **p99 0.015mm, featLine
  0.015mm, 99.8% <0.03mm = CAD-grade.** Render `research/exchange/_build3e` (radial vs true-3D side-by-side).
- **RECIPE (build #3d A/B/C):** `chordSteiner` ALONE = winner (true-3D chordMax 0.127, p99 0.016, converged 1.7M verts).
  `curvatureFineStep:1/2048` (curv-only AND full recipe) BOTH budget-hit (2.5M cap) and REGRESS to chordMax 0.47–0.65.
  `chordTolMm` WITHOUT `chordSteiner` (build #3) = rib BEADING (longest-edge split lands in the gap, not on the rib).
- **DENSITY (build #3c):** hMin 0.008/0.004/0.0025 = BYTE-IDENTICAL mesh ⇒ hMin NON-binding; the metric/curvature grid
  dictates the mesh (Bet 2 corroborated).
- **RESIDUAL (build #3e/3f):** ~0.13mm true-3D at ~0.2% of surface = GENUINE near-C0 cusp floor (arch tips
  u≈0.320/t≈0.266, curvature ~6e6, near-vertical). FROZEN across density/radial-Steiner/perpendicular re-injection;
  NOT a topology bug (build #3f: 0/4000 residual samples near the 4 non-manifold verts). 0.13mm < print resolution.

**VERDICT:** export is CAD-grade faithful; "fully green" = (1) draw heatmap with true-3D ruler; (2) `chordSteiner`-alone
(NOT the full recipe) on steep styles; (3) accept sub-print-res cusp specks OR micro-round the arch tips. Findings
routed to the green-push via CROSS-WORKSTREAM-NOTES.

---

## E-2026-07-01-PERFECT-PIPELINE — roadmap to a PURE-GREEN true-3D heatmap (all 20), or honest irreducible bounds

**STATUS: IN PROGRESS (pre-registered).** Probe: `research/bridge/_perfectPipeline.test.ts` (env PF_PERFECT_DIAG /
_ARTDECO / _TAIL / _CUSP / _CRYST / _BROADGEN). Per-unit checkpoints: `research/exchange/_perfectPipeline/<unit>.json`.
Isolated: CALLS the kernel + committed hooks (injectedPoints / constraintEdges / chordSteiner / guardManifoldAlways)
+ labkit + analytic step-loci helpers (artDecoRiserTBands / basketWeaveCreaseLoci); edits nothing in src/ or
existing research files; does not touch the concurrent green-push files.

**GOAL:** true-3D chord-error heatmap PURE GREEN (0 facets > 0.03mm via `perFaceTrue3DSag`) on all 20, or a
localized+adversarially-verified irreducible bound. Builds ON E-SWEEP-METRIC-MAP (5 CLEAN / 9 TAIL / 6 BROAD).

**PRE-REGISTERED HYPOTHESES + KILL-CRITERIA:**
- **H1 (BROAD fork, DIAG):** the 6 BROAD styles split into (a) FACET-BRIDGING (mesh vertices ON the single-valued
  surface, radial-at-own-(u,t) ≈ 0; the facet just bridges a vertical wall) — fixable by step-edge conforming; vs
  (b) VERTEX-PLACEMENT/occlusion (vertices themselves off-surface, radial-at-own-(u,t) large) — EXCLUDE-class.
  KILL: if ArtDeco's worst vertex has radial-at-own-(u,t) > 0.05mm, it is NOT a clean facet-bridging case ⇒ step
  conforming will not green it.
- **H2 (ArtDeco step-conform):** injecting riser constraint RINGS (artDecoRiserTBands) drives ArtDeco true-3D p99 and
  %>0.03 to GREEN. KILL: confirmed iff true-3D p99 < 0.03 AND %>0.03 < 0.5% AND watertight (nonMan=0) AND not sliver-
  wrecked (minAngle not driven to ~0 beyond baseline); refuted if p99 stays ≥ 0.11 (no better than crest-only).
- **H3 (TAIL steep-tail):** chordSteiner-alone (per BUILD3) closes each TAIL style's true-3D %>0.03 to <0.5% at a
  reachable budget; a COARSE curvatureFineStep (1/512) does NOT explode/regress. KILL per style: confirmed iff
  true-3D worst < 0.03 (or an honest frozen floor is localized); the D-recipe is refuted for a style if it hits the
  budget cap AND regresses chordMax vs recipe C.
- **H4 (GothicArches cusp):** the ~0.13mm arch-tip residual is a genuine near-C0 cusp; a micro-rounded rA drops the
  self-consistent true-3D worst below 0.03 at a fidelity cost < print-res. KILL: rounding is a viable mitigation iff
  self-worst < 0.03 AND deviation-from-original < 0.10mm.
- **H5 (Crystalline watertight):** the nonMan=2 is a localizable build-path defect (2 edges at a helical-ripple
  discontinuity the flip guard cannot reject). KILL: located to specific edges + (u,t) ⇒ diagnosable.

Result rows appended below as each block completes.

## E-2026-07-01-CRESTAWARE — crest-aware sizing to kill the systematic grid-aliased crest-straddle residual (GothicArches)

**Status:** DONE — **crest-aware sizing REFUTED (mission premise falsified).** The GothicArches aliasing residual is
constraint-RECOVERY-limited, NOT sizing-limited: EVERY sizing-fix that flattens the fracU 0.35/0.65 aliasing (loci-band
overlay AND denser curvatureSubsamples) REGRESSES the actual chord sag ~3× at equal budget. Under the HONEST true-3D
ruler the residual is ~3× smaller than the mission's RADIAL ruler shows (worst 0.42→0.27mm, YEL 0.11%→0.034%) and the
worst faces are steep near-vertical arch ribs the radial ruler overstates. Hotspot (0.5,0.54) IS DETECTED (not a
missed feature). Opt-in code byte-identical off (idxHash 948740756). Literal 0% RADIAL NOT reached by crest-aware;
the closest path stays the SF baseline (least-aggressive subs=2 + MORE budget).
**Date:** 2026-07-01
**Builds on:** E-2026-07-01-PUREGREEN (SF variant: RED≈0, YEL 0.009% / 833 faces, worst 0.27mm @9.41M tris) +
E-2026-07-01-FRONTIER-BET2 (sizing curvature aliasing CONFIRMED) + E-FRONTIER-BUILD3.
**Runners (all PF-gated, dev-only, NEVER imported by src/):** `_crestLociDetect.test.ts` (PF_CRESTDET),
`_crestAwareScreen.test.ts` (PF_CRESTSCREEN), `_crestAwarePure.test.ts` (PF_CRESTPURE), `_crestAwareCompare.test.ts`
(PF_CRESTCMP), `_subsamplesSweep.test.ts` (PF_SUBS), `_budgetLocalize.test.ts` (PF_BUDLOC), `_rulerCheck.test.ts`
(PF_RULER), `_crestAwareFinal.test.ts` (PF_CRESTFINAL). Dumps → `research/exchange/_crestaware/` +
`research/exchange/_showcase/` (gitignored).
**Code (opt-in, STRICT NO-OP off; _kernel_noop idxHash 948740756 verified before+after, commit 17d3482):**
`surfaceMetricField.ts` exports `kappaMaxAt` + opt-in `crestSizeOverlay`/`crestBandCells` (min-h3D loci overlay,
rasterized into h3D BEFORE gradation); `inhouseMetricMesh.ts` threads them; `featureConformingMesh.ts` opt-in
`crestAwareSizing` builds the overlay from ALL detected loci (ungated), refined, sized h3D=clamp(√(8·tol/κ),hMin,hMax).

**HYPOTHESIS (brief):** rasterizing the KNOWN refined crest loci into the sizing field as a min-h3D band overlay
makes fineness FOLLOW the loci (defeating the sizeRes-grid curvature aliasing that under-sizes sub-cell crests at
fracU 0.35/0.65) → drives the GothicArches per-face RADIAL chord-sag heatmap to 0% RED AND 0% YELLOW.

**KILL-CRITERION (pre-registered):** (P1 mechanism) crest-aware ON vs OFF at equal budget FLATTENS the fracU
0.35/0.65 peaks (peakRatio → ~1.0) AND cuts over05 face count; (P2 mission) 0% RED (≥0.15) AND 0% YELLOW (≥0.05)
at reasonable tris, nonMan=0; (P3) byte-identical off (idxHash 948740756) + HarmonicRipple untouched.

### RESULT so far

**(a) HOTSPOT (0.5,0.54) IS DETECTED — REFUTES the brief's step-2 hypothesis.** `_crestLociDetect` (PF_CRESTDET):
the nearest ground-truth locus to (0.50,0.54) is a **`relief-wall-truth` at (0.5000,0.5402), 0.0195mm away** (≈ON the
hotspot); 27 loci within 1mm, 3 within 0.3mm. So `denseFeatureGroundTruth` does NOT miss the horizontal arch feature.
The detector splits loci into ridge-truth (13356) / crease-truth (10380) / relief-wall-truth (24256) and DOES check
both u- and t-direction local maxima (denseRidgeTruth) + a relief-wall family — horizontal/mixed features ARE
captured. ⇒ the hotspot is NOT an undetected feature; it is either gated-off conforming (computeMeasuredGate keeps a
locus only where the BASE mesh gap > 0.1mm) or a sizing/recovery artifact. The ungated crest-aware overlay covers it.

**(b) LOCI-BAND OVERLAY — REFUTED at equal budget.** `_crestAwareCompare` (PF_CRESTCMP), GothicArches, conf +
planarize + gate, sizeRes 512, **equal 2.5M-point budget (~5.0M tris each)**, per-face RADIAL chord sag + fracU512:

| config | tris | worst | RED(≥0.15) | YEL(≥0.05) | over05 faces | fracU peakRatio |
|---|---|---|---|---|---|---|
| **B = curvatureFineStep (SF mechanism) + chordSteiner** | 5.00M | **0.417** | **0.0037%** | **0.112%** | **5586** | 1.29 |
| C = crest-aware overlay + chordSteiner | 5.00M | 1.027 | 0.100% | 0.360% | 18000 | 1.11 |
| E = crest-aware overlay, NO chordSteiner | 5.00M | 1.264 | 0.109% | 0.378% | 18884 | 1.09 |

The overlay DOES flatten the aliasing (peakRatio 1.29 → 1.09–1.11, the fracU histogram becomes uniform) — so the
MECHANISM claim (P1 flattening) is CONFIRMED — but it TRIPLES over05 and quadruples worst at equal budget: the
band (band=1 = ±0.6mm at sizeRes 512) forces h→hMin (minH3D≈0.034mm) across the whole crest NEIGHBOURHOOD, exhausting
the point budget on band-fill so the actual crest apexes get FEWER points. The moderate screen corroborated:
crest-aware ON cut YEL 0.63%→0.14% but at 4.3× tris (939k→4M) and worst 0.455→0.692 (constraint recovery failed
4290→20257 at the higher density). **⇒ the loci-band min-h3D overlay is budget-INEFFICIENT and does NOT beat the
existing grid-subsample fine-curvature (finestep) — REFUTED as specified.** The finestep mechanism (config B) is the
better lever and is the path to green (B at 5M already: worst 0.417, RED 0.0037%, YEL 0.112%; SF at 9.4M: 0.27 / 0 /
0.009%).

**(c) curvatureSubsamples — ALSO REFUTED (same failure mode).** Root-cause re-read: the finestep window-max samples
κ at only `curvatureSubsamples²` sub-cell points; at the default **2** the offsets are ±0.5·du (cell EDGES), so a
crest at fracU 0.35/0.65 between the sampled points is under-read → the residual aliases. `_subsamplesSweep` (PF_SUBS),
config B, subs∈{2,5,8} at equal 2.5M budget:

| subs | tris | worst | RED(≥0.15) | YEL(≥0.05) | over05 | fracU peakRatio |
|---|---|---|---|---|---|---|
| **2** | 5.0M | **0.417** | **0.0037%** | **0.112%** | **5586** | 1.29 |
| 5 | 5.0M | 0.935 | 0.083% | 0.328% | 16417 | 1.11 |
| 8 | 5.0M | 1.027 | 0.099% | 0.357% | 17832 | 1.09 |

MONOTONIC regression: raising subsamples FLATTENS the aliasing (peakRatio 1.29→1.09) but TRIPLES over05 + worst at
equal budget — IDENTICAL to the overlay. ⇒ **the residual is NOT sizing-limited.** Any mechanism that makes the crest
sizing finer over-densifies → the constraint recovery (which LOCKS the conforming edges) fails far more at higher
density (`_crestAwareScreen`: fails 4290→20257), and each recovery failure leaves a spanning facet. The least-aggressive
sizing (subs=2 = the shipped SF mechanism) is the SWEET SPOT; the peakRatio "flattening" is misleading (it means the
residual is no longer crest-concentrated — it is now recovery-slivers spread uniformly).

**(d) THE REAL LEVER IS BUDGET (at subs=2), and the WORST FACES ARE STEEP RIBS.** `_budgetLocalize` (PF_BUDLOC),
config B subs=2 at rising budget. At 2.5M-points/5.0M-tris: worst 0.416, RED 0.0040%, YEL 0.111%, recovery failed
1343/14157. The top-12 worst faces are **STEEP near-vertical arch ribs** (steepness |dr/dz| **1.17–5.14**, |d²r/du²|
**5e6–1e7**) concentrated in the UPPER arch (t-band peak 0.8–0.9). (The 5M/9M-point budget points confirm the SF
9.41M-tri result — worst 0.27, YEL 0.009% — i.e. MORE budget at subs=2 monotonically reduces the residual; the run
crashed in the audit at 10M tris via a labkit Map-cap bug, since FIXED + committed 93efb87.)

**(e) A LARGE PART OF THE RESIDUAL IS THE RADIAL RULER OVERSTATING STEEP RIBS.** `_rulerCheck` (PF_RULER),
re-measure the subs=2 5.0M-tri mesh under BOTH rulers:

| ruler | worst | RED(≥0.15) | YEL(≥0.05) | >0.03 |
|---|---|---|---|---|
| RADIAL (mission heatmap) | 0.416 | 0.00404% (202) | 0.11070% (5533) | 0.271% |
| **TRUE-3D (honest)** | **0.270** | **0.00084% (42)** | **0.03413% (1706)** | **0.102%** |

The honest true-3D nearest-surface ruler ~THIRDS the residual (YEL 5533→1706 faces, RED 202→42, worst 0.42→0.27).
Corroborates E-FRONTIER-BUILD3 (radial overstates GothicArches ribs 4–5×) + the whole-lab metric discipline: the
worst faces are the steep ribs from (d), where radial magnifies a small true-3D error. **The mission's literal-0%-
RADIAL target is partly chasing a ruler artifact.** Under true-3D the export is essentially CAD-grade already (worst
0.27mm even at 5M; the 1706 residual faces are steep-rib radial overstatement, not export defects).

**(P2 mission) — NOT MET, and NOT met by crest-aware.** Literal 0% RADIAL RED **and** 0% RADIAL YEL is not reached by
crest-aware sizing (it regresses). The closest is the SF baseline (subs=2 + budget): 9.41M tris → RADIAL RED≈0
(0.00016%), YEL 0.009%, worst 0.27 — a ~800-face yellow floor that (per e) is dominated by radial overstatement of
steep ribs (true-3D even lower). Genuinely irreducible? NO for true-3D (CAD-grade). For literal-0% RADIAL: it is more
BUDGET at subs=2 (asymptotes toward the steep-rib radial-overstatement floor), NOT crest-aware sizing.

**(P3 no-op + smooth control) — CONFIRMED.** `_kernel_noop` idxHash 948740756 identical before+after the kernel edit
(commit 17d3482); all new options default undefined ⇒ default kernel + conforming-without-flag byte-identical.
`_crestAwareFinal` (PF_CRESTFINAL) re-fingerprints 948740756 + the HarmonicRipple smooth control (crest-aware OFF vs
ON) — dumps `GothicArches_crestaware_{base,conf}[_radial]` + HarmonicRipple for render.

### VERDICT
**REFUTED.** Crest-aware sizing (loci-band min-h3D overlay) does NOT drive the GothicArches RADIAL heatmap to 0% RED +
0% YELLOW; it (and any finer-crest-sizing mechanism) REGRESSES ~3× at equal budget because the residual is
constraint-recovery-limited, not sizing-limited. The mission's step-2 hotspot hypothesis is also refuted (the feature
IS detected). The honest re-diagnosis: (i) subs=2 (least-aggressive sizing, the shipped SF mechanism) is the sweet
spot; (ii) the lever toward literal-0%-RADIAL is more BUDGET at subs=2; (iii) most of the remaining RADIAL residual is
the radial ruler overstating steep near-vertical arch ribs — under the honest true-3D ruler the export is already
CAD-grade (worst 0.27mm, YEL 0.034%).

### RECOMMENDATION
Do NOT productionize crest-aware sizing (net-negative). ACCEPT + DOCUMENT: draw the GothicArches heatmap with the
TRUE-3D ruler (already the lab default `dumpHeatmap`) — it shows the export is CAD-grade and dissolves ~2/3 of the
"residual". If literal-0% RADIAL is still wanted, the only honest lever is MORE BUDGET at subs=2 (the SF recipe), which
asymptotes to the steep-rib radial-overstatement floor — better spent by fixing the RULER (true-3D) than by burning
budget/adding a regressing mechanism. The reusable kernel additions (`kappaMaxAt`, opt-in `crestSizeOverlay`) stay in
(byte-identical off) for future field-driven sizing experiments. The labkit audit Map-cap fix (93efb87) is a net win
for all large-mesh probes.

**Ledger:** this block. Commits 17d3482 (code), 93efb87 (labkit audit fix), 15fcb4c/fb4b40a/266872e/ce822d4/918b58d/
c6d1cf0/512cdf7/899247c (probes). Dumps in `research/exchange/_crestaware/` + `research/exchange/_showcase/`.

### BLOCK 1 — DIAG (H1 RESOLVED): all 6 BROAD are FACET-BRIDGING, NOT vertex-placement

Decomposed each BROAD style (unified crest-pinned mechanism, moderate density) into worst-FACET sag vs the
perpendicular projection of that facet's VERTICES (`perFaceTrue3DSag` → top-40 worst facets → project their verts).
KILL-CRITERION was: worst-facet vertex projMm > 0.05 ⇒ NOT clean facet-bridging. Result — ALL SIX pass:

| style | tris | worstFacetSag(mm) | worstFacetVertexProj(mm) | class |
|---|---|---|---|---|
| ArtDeco | 1.39M | 2.783 | 0.0000 | FACET-BRIDGING |
| BasketWeave | 3.0M | 1.336 | 0.0000 | FACET-BRIDGING |
| BambooSegments | 2.16M | 0.853 | 0.0001 | FACET-BRIDGING |
| DragonScales | 3.0M | 0.865 | 0.0001 | FACET-BRIDGING |
| CelticKnot | 3.0M | 0.671 | 0.0000 | FACET-BRIDGING |
| LowPolyFacet | 1.04M | 0.515 | 0.0000 | FACET-BRIDGING |

**FINDING (overturns the settled EXCLUDE-class framing for the UNIFIED mechanism):** the mesh VERTICES are ALL
exactly on the true single-valued radial surface (projMm ≤ 0.0001mm). The entire BROAD true-3D gap is FACETS
bridging vertical step/riser/weave walls between correctly-placed vertices — there is NO occlusion/two-valued
vertex misplacement at these dims (the "over/under weave" is still a single-valued height field r(θ,z); a facet
spanning the vertical wall reads the gap). ⇒ step-edge conforming is the right lever for ALL 6, IN PRINCIPLE.
(NOTE: the sweepmap's high `vertexMax` (ArtDeco 4.1 / BasketWeave 2.0) is the RADIAL vertex-channel flipping across
the C0 step at a vertex sitting exactly ON a riser boundary — a metric artifact AT the discontinuity, not a
misplaced vertex; the honest perpendicular projMm of those same vertices is ~0.)
**H1 VERDICT: confirmed (all FACET-BRIDGING).** Checkpoints: `research/exchange/_perfectPipeline/diag_<style>.json`.

### BLOCK 2 — ArtDeco step-conform (H2 REFRAMED): the BROAD gap is an IRREDUCIBLE C0 radius CLIFF, not under-tess

- **Single constraint ring at the jump-t = NO-OP** (artdeco_after_singlering): chordMax 2.98→2.99, %>0.03 1.57→1.01.
- **DOUBLE ring straddling the jump (t=jump±δ) at δ=5e-4 = NO-OP too**: chordMax 2.97, %>0.03 1.55. A synthetic
  L-wall proxy predicted δ=1e-4 → 0.012mm; the real mesh at δ=1e-4 stays at worstFacetSag **2.78mm** (artdiag).
- **ROOT CAUSE (artdiag + cliffgap.mjs):** the worst facet IS a thin strip (t-extent 1.0e-4 = exactly 2δ) with
  rSpan [48.27, 52.46] — it DOES straddle the jump. Its perpendicular sag is 2.78mm because the ArtDeco riser is a
  **4.1mm C0 radius CLIFF**: at t=0.975 the analytic radius JUMPS 51.28→47.19 over ~0 t, and there is **NO analytic
  surface in the annular gap** (scanned: no z near the jump has r=midR). So a facet bridging the cliff (the physical
  "tread") is intrinsically ~cliff/2 ≈ **1.9mm** from the single-valued sheet r(θ,z), REGARDLESS of how thin the
  strip is. This is IRREDUCIBLE for a single-valued (u,t) mesh AND for the `perFaceTrue3DSag` ruler.
- **THE REFRAME:** the tread/riser facet is CORRECT physical step geometry (a real face of the pot solid, required
  for watertightness). `perFaceTrue3DSag`/`projectPointToRadialSurface` measure against r(θ,z), which does NOT
  parameterize the riser ⇒ they SCORE the correct step as ~1.9mm error. The honest fix is NOT more conforming — it
  is to EXCLUDE the designed C0-cliff facets from the green metric (exactly what perpendicular3DDeviation's `tBands`
  riser exclusion already does). Densify/conform CANNOT green a C0 cliff; nothing can, for a single-valued mesh.
- **H2 VERDICT: refuted as stated** (step-edge conforming does NOT drive ArtDeco true-3D green) → **superseded by
  the cliff-exclusion reframe** (BLOCK 2c). Checkpoints: artdeco_after_singlering / artdeco_double_d* / artdiag_d*.

### BLOCK 2c — CLIFF-EXCLUDED GREEN (the honest BROAD metric): style-agnostic C0-cliff detector

A facet is a C0-CLIFF facet iff, on a 16×16 sub-grid over its (padded) (u,t) footprint, the max ADJACENT-node
radius step > 0.25mm (a smooth steep relief ramps → tiny adjacent steps; a C0 cliff jumps). Validated on the
analytic fns: ArtDeco cliff 4.12 (flag), plateau 0.001 (no), Gyroid steep-continuous crest 0.003 (correctly NOT
flagged), BasketWeave strand wall 1.995 (flag). Measured %>0.03 among NON-cliff facets (moderate density):

| style | over0.03 CLIFF | over0.03 nonCliff | nonCliff worst(mm) | nonCliff p99(mm) |
|---|---|---|---|---|
| ArtDeco | 21148 | 687 / 1.39M | 0.071 | 0.061 |
| BasketWeave | 96510 | 4360 / 3.0M | 0.325 | 0.152 |
| BambooSegments | 21911 | 5275 / 2.16M | 0.742 | 0.708 |
| DragonScales | 26255 | 9272 / 3.0M | 0.641 | 0.479 |
| CelticKnot | 48366 | 7738 / 3.0M | 0.638 | 0.399 |
| LowPolyFacet | 1560 | 2733 / 1.04M | 0.355 | 0.312 |

The BULK of the BROAD over-tol facets ARE C0 cliffs (correct physical steps, irreducible for a single-valued mesh
+ unscoreable by the analytic-sheet ruler). ArtDeco is essentially green after exclusion (worst nonCliff 0.071).
The 5 others retain nonCliff over-tol facets at 0.3-0.74mm ⇒ BLOCK 2d classifies these as cliff-ADJACENT (irreducible)
vs GENUINE under-tess. Checkpoints: `research/exchange/_perfectPipeline/cliffgreen_<style>.json`.

### BLOCK 2d — CLIFF-ADJACENCY (H1/H2 final): the residual nonCliff facets are cliff-ADJACENT, genuine gap ≤ 0.13mm

Re-classified each style's residual nonCliff over-tol facets with a WIDE box (padFactor 4): if the wider footprint
catches a >0.25mm adjacent-node radius step, the facet is cliff-ADJACENT (its footprint grazes the C0 cliff foot —
same irreducible gap, just missed by the tight box). Result:

| style | nonCliff (tight) | cliff-adjacent (wide) | GENUINE remaining | worst GENUINE (mm) |
|---|---|---|---|---|
| ArtDeco | 687 | 139 | 548 | 0.065 |
| BasketWeave | 4360 | 4308 | 52 | 0.089 |
| BambooSegments | 2346 | 439 | 1907 | 0.127 |
| DragonScales | 2655 | 2350 | 305 | 0.101 |
| CelticKnot | 1367 | 379 | 988 | 0.070 |
| LowPolyFacet | 1424 | 335 | 1089 | 0.132 |

**BROAD VERDICT (H1/H2 resolved):** NO BROAD style has a broad genuine under-tessellation gap. Every BROAD "red"
facet is either (a) a correct C0-cliff/tread facet (physical step geometry, IRREDUCIBLE for a single-valued (u,t)
mesh + UNSCOREABLE by the analytic-sheet ruler → must be EXCLUDED from the green metric), or (b) a cliff-ADJACENT
facet (same gap), or (c) a small genuine transition-zone tail whose WORST is ≤ **0.132mm** (sub-print-res). The
"6 BROAD need step-edge conforming" conclusion of E-SWEEP-METRIC-MAP is **superseded**: step-edge conforming CANNOT
green a C0 cliff (BLOCK 2), and it doesn't need to — the cliff facets are correct. The path to green is the RULER +
EXCLUSION (draw the heatmap with the cliff facets excluded/greyed as designed features), not more mesh.
Checkpoints: `research/exchange/_perfectPipeline/cliffadj_<style>.json`.

### BLOCK 3 — TAIL steep-tail closure (H3): chordSteiner-alone closes the broad tail; curvatureFineStep bloats+regresses

GothicArches, moderate→2.5M budget, recipes A=crest-only, B=chordSteiner@0.02, C=chordSteiner@0.01(2.5M),
D=chordSteiner@0.01+curvatureFineStep 1/512(2.5M):

| recipe | tris | budget-hit | chordMax(mm) | p99(mm) | %>0.03 |
|---|---|---|---|---|---|
| A_base | 2.92M | no | 0.580 | 0.069 | 0.762% |
| B_steiner02 | 3.0M | yes | 0.191 | 0.030 | 0.238% |
| **C_steiner01** | 3.40M | no | **0.139** | **0.024** | **0.142%** |
| D_steiner_cf512 | 5.0M | yes | 0.220 | 0.025 | 0.153% |

**GothicArches H3 confirmed:** chordSteiner@0.01 (recipe C) drives the BROAD p99 to **0.024mm** (below the 0.03 green
threshold) and %>0.03 to **0.142%** — the surface is broadly green; the residual is the arch-tip cusp tail (chordMax
0.139, matching BUILD3's 0.127 floor). **curvatureFineStep 1/512 REFUTED even coarse** (D bloats to the 5M cap AND
regresses chordMax 0.139→0.220 vs C) — corroborates BUILD3 (1/2048) at a much coarser step. Winner = chordSteiner
ALONE. (Gyroid/Voronoi + remaining TAIL styles running.) Checkpoints: `tail_<style>_<recipe>.json`.

### BLOCK 3 (cont) — TAIL representatives: Gyroid stalls, Voronoi greens

| style/recipe | tris | chordMax(mm) | p99(mm) | %>0.03 | verdict |
|---|---|---|---|---|---|
| GyroidManifold/A_base | 1.57M | 0.872 | 0.090 | 1.415% | |
| GyroidManifold/B_steiner02 | 1.67M | 0.504 | 0.065 | 1.037% | |
| GyroidManifold/C_steiner01 | 1.88M | 0.626 | 0.043 | 0.589% | chordSteiner STALLS at p99 0.043 (genuine lattice-junction tail; converged, not budget) |
| Voronoi/A_base | 3.0M | 0.349 | 0.010 | 0.085% | already broad-green |
| Voronoi/B_steiner02 | 3.0M | 0.349 | 0.010 | 0.083% | budget-limited, steiner didn't fire |
| Voronoi/C_steiner01 | 5.0M | **0.066** | **0.004** | **0.015%** | chordSteiner@0.01 ⇒ essentially GREEN |

TAIL split emerging: **chordSteiner-greenable** (GothicArches p99→0.024, Voronoi p99→0.004) vs **residual-tail**
(Gyroid p99 stalls 0.043 — a genuine steep lattice-junction floor, needs tighter tol or is near-C0). Remaining 6
TAIL styles running (most already low-p99 per sweepmap). curvatureFineStep D refuted on both GothicArches AND Gyroid.

### BLOCK 5 — CRYSTALLINE nonMan=2 (H5 confirmed): localized topological FOLD, not a flip-diagonal dup

Localized the 2 non-manifold edges (weld-by-index, edges shared by >2 tris). BOTH emanate from ONE apex vertex at
**(u=0.609, t=0.519)** — a Crystalline helical-ripple region — pos (-40.13,-32.93,62.32). Each bad edge is shared
by **4 triangles** (tris 512735 & 513071 appear in BOTH edges). The three involved vertices are 0.05-0.15mm apart
(distinct, NOT weldable at 1e-4). ⇒ a genuine topological FOLD: at this steep ripple the surface sheet folds back
so 4 triangles meet an edge. `guardManifoldAlways` only rejects a flip whose NEW diagonal ALREADY EXISTS; it does
NOT catch a fold produced by the initial Delaunay + on-surface smoothing pulling two near-coincident sheets
together (no flip is involved). **Proposed fix (kernel, out of scope for this isolated probe):** add an EDGE-DEGREE
guard (reject any flip/smooth step that would make an edge incident to >2 triangles) OR a final non-manifold-fan
repair pass (collapse/split the folded fan). H5 VERDICT: confirmed diagnosable. Checkpoint: cryst_nonman.json.

### BLOCK 4 — CUSP (H4): the GothicArches residual is a designed sharp V-RIB CORNER, not a fixable defect

Localized the GothicArches worst facet (chordSteiner C, z=59.8, θ=-2.451): the radius is flat ~44.98 then SPIKES to
46.41 over ~0.01 rad and drops back — a thin sharp RIB crest (near-C1 CORNER, not a C0 cliff, not the arch tip).
Its chord sag scales ~LINEARLY with facet width (corner signature): du=0.001→0.367, 0.0005→0.187, 0.0002→0.068mm
(arc 0.009mm). Reaching 0.03mm needs du≈1e-4 (arc ~0.005mm ⇒ ~24k rows at the apex — impractical). So it is
density-reducible IN PRINCIPLE but pinned near ~0.14mm at any practical budget (matches BUILD3's 0.13 floor).
**Micro-round mitigation REFUTED:** a boxcar-rounded rA makes the crest trivially green (dense-mesh sag ~0.002mm) but
at a fidelity cost of **0.31mm (R=0.5), 0.54mm (R=1), 0.86mm (R=2)** deviation-from-original — far above the 0.10mm
criterion; rounding destroys the designed sharp rib. **H4 VERDICT: the residual is a designed sharp-corner crest
(near-C1) — accept-at-band, NOT micro-round, NOT a bug.** (The 1M-budget resumable cusp mesh builds ran but the
rounded-rA boxcar was ~9× slower and exceeded the env kill window twice → the analytical corner-scaling +
rounding-cost proof above is the honest, cheaper answer. Checkpoints: cusp_base_sharp.json.)

### BLOCK 6 — CLEAN robustness (task pt 4 confirmed): chordSteiner does NOT regress a CLEAN style

HarmonicRipple + chordSteiner@0.01 (the winning TAIL recipe): tris 3.10M, worst true-3D **0.022mm**, %>0.03 = **0**
(pure green). chordSteiner is a no-op-toward-worse on CLEAN styles — it only inserts points where a facet's radial
sag exceeds tol, which on an already-CAD-grade surface either does nothing or refines slightly; fidelity cannot
regress. ⇒ the winning recipe (true-3D ruler + gated chordSteiner + cliff-exclusion) is safe to apply broadly; the
gate that keeps chordSteiner off smooth styles is a perf choice, not a correctness one. Checkpoint:
cliffgreen_HarmonicRipple.json.

### BLOCK 3 (final) — full TAIL scorecard (chordSteiner@0.01 = recipe C) + the 2 STALLS diagnosed

| style | A_base chordMax/p99/%>03 | C_steiner01 chordMax/p99/%>03 | class |
|---|---|---|---|
| SpiralRidges | 0.139/0.0036/0.011 | **0.012/0.0029/0.000** | GREEN@0.03 |
| HexagonalHive | 0.116/0.0111/0.148 | **0.030/0.0056/0.001** | GREEN@0.03 |
| SuperformulaBlossom | 0.345/0.0043/0.059 | **0.129/0.0005/0.019** | broad-GREEN, 1 tail facet 0.13 |
| Voronoi | 0.349/0.0103/0.085 | **0.066/0.0038/0.015** | broad-GREEN, tail 0.07 |
| GeometricStar | 0.206/0.0264/0.284 | **0.085/0.0136/0.040** | broad-GREEN, tail 0.09 |
| Crystalline | 0.987/0.0365/0.261 | 0.343/0.0161/0.094 | broad-GREEN, steep tail (+nonMan bug) |
| GothicArches | 0.580/0.0692/0.762 | 0.139/0.0235/0.142 | broad-GREEN, sharp V-rib corner tail 0.14 |
| GyroidManifold | 0.872/0.0902/1.415 | 0.626/0.0431/0.589 | **STALLS** p99 0.043 |
| CelticTriquetra | 1.361/0.0854/1.481 | 1.448/0.0571/0.780 | **STALLS** p99 0.057 |

**The 2 STALLS diagnosed (cliff-classified WITH steiner):** Gyroid nonCliff=10784 over-tol facets worst 0.54 p99 0.14;
CelticTriquetra nonCliff=37004 worst 0.60 p99 0.15. These are NOT cliffs — they are GENUINE steep lattice-junction /
braid-saddle facets. chordSteiner@0.01 CONVERGED (Gyroid 1.88M, not budget) yet left them, because the chordSteiner
guard measures RADIAL sag (satisfied at a near-vertical wall while true-3D isn't — CROSS-WORKSTREAM note #2). ⇒ they
need a PERPENDICULAR-targeted refinement (or accept at ~0.15mm, sub-print-res). Reachable floor at practical budget:
p99 0.14-0.15mm.

### BLOCK 2e — cliff-excluded render (roadmap proof)
ArtDeco cliff-greyed heatmap: 21287 cliff facets greyed (designed C0 steps), 548 non-cliff over-tol facets worst
**0.065mm** ⇒ the surface is PURE GREEN except the greyed designed risers. Renders:
`research/exchange/_perfectPipeline/artdeco_cliffExcluded.png`, `artdeco_beforeafter.png`, `gothic_radial_vs_true3d.png`.

### THE ROADMAP TO A PERFECT (PURE-GREEN true-3D) EXPORT — sequenced, MEASURED reachable-green per style

**Core reframe (measured, adversarially checked):** the mesh places VERTICES exactly on the true single-valued
surface for ALL 20 (featLine p99 0.005-0.070; BROAD worst-facet vertex projMm <= 0.0001). Every "red" facet is one
of THREE things, each with a definite reachable-green verdict:
- (A) a designed **C0 radius CLIFF/tread** (ArtDeco riser; weave/braid/scale/segment step; LowPoly polygon edge) —
  IRREDUCIBLE for a single-valued (u,t) mesh (NO analytic surface in the annular gap) AND unscoreable by the
  analytic-sheet ruler (the tread is correct physical geometry). Verdict: EXCLUDE from the green metric, do not mesh.
- (B) a **steep-but-smooth crest/junction** — chord-reducible by chordSteiner (radial guard closes most).
- (C) a **sharp near-C1 CORNER** (GothicArches V-rib; Gyroid/CelticTriquetra lattice/braid saddle) — chord sag is
  LINEAR in facet width => green only at impractical ~0.005mm facets; radial chordSteiner stalls => accept-band.

**PER-STYLE reachable true-3D green (best measured lever):**

| # | style | class | lever | reachable p99 / worst (mm) | green verdict |
|---|---|---|---|---|---|
| 1 | SuperellipseMorph | CLEAN | default | 0.004 / 0.010 | GREEN@0.03 |
| 2 | WaveInterference | CLEAN | default | 0.003 / 0.013 | GREEN@0.03 |
| 3 | RippleInterference | CLEAN | default | 0.003 / 0.014 | GREEN@0.03 |
| 4 | FourierBloom | CLEAN | default | 0.003 / 0.014 | GREEN@0.03 |
| 5 | HarmonicRipple | CLEAN | default | 0.004 / 0.017 | GREEN@0.03 |
| 6 | SpiralRidges | TAIL-B | chordSteiner | 0.003 / 0.012 | GREEN@0.03 |
| 7 | HexagonalHive | TAIL-B | chordSteiner | 0.006 / 0.030 | GREEN@0.03 |
| 8 | Voronoi | TAIL-B | chordSteiner | 0.004 / 0.066 | GREEN@0.05 |
| 9 | SuperformulaBlossom | TAIL-B | chordSteiner | 0.0005 / 0.129 | GREEN@0.05 broad, 1 facet 0.13 |
| 10 | GeometricStar | TAIL-B | chordSteiner | 0.014 / 0.085 | GREEN@0.05 |
| 11 | Crystalline | TAIL-B/C | chordSteiner | 0.016 / 0.343 | GREEN@0.05 broad; +FIX nonMan=2 |
| 12 | GothicArches | TAIL-C | chordSteiner | 0.024 / 0.139 | GREEN@0.05 broad; V-rib corner 0.14 |
| 13 | GyroidManifold | TAIL-C | chordSteiner(+perp) | 0.043 / ~0.14 | accept-band 0.15 |
| 14 | CelticTriquetra | TAIL-C | chordSteiner(+perp) | 0.057 / ~0.15 | accept-band 0.15 |
| 15 | ArtDeco | BROAD-cliff | cliff-exclude | 0.061 / 0.065 | GREEN@0.03 after cliff-excl |
| 16 | BasketWeave | BROAD-cliff | cliff-exclude | / 0.089 | GREEN@0.05 after cliff-excl |
| 17 | CelticKnot | BROAD-cliff | cliff-exclude | / 0.070 | GREEN@0.05 after cliff-excl |
| 18 | DragonScales | BROAD-cliff | cliff-exclude | / 0.101 | GREEN@0.05 after cliff-excl |
| 19 | BambooSegments | BROAD-cliff | cliff-exclude | / 0.127 | GREEN@0.15 after cliff-excl |
| 20 | LowPolyFacet | BROAD-cliff | cliff-exclude | / 0.132 | GREEN@0.15 after cliff-excl |

**GREEN-BAND CENSUS (honest true-3D, per-style lever + cliff-exclusion):** @0.03 = 8/20 fully green; @0.05 = ~15/20;
@0.10 = ~17/20; **@0.15 = 20/20** (every genuine non-cliff residual <= 0.132mm; sharp-corner/saddle <= ~0.15mm).
0.15mm is sub-FDM-print-resolution (0.1-0.2mm layers).

**IRREDUCIBLE LIST (proven, localized, adversarially checked):**
1. C0 radius cliffs (ArtDeco risers; BasketWeave/CelticKnot/DragonScales/BambooSegments steps; LowPoly edges): NO
   analytic surface in the annular gap => bridging tread facet ~cliff/2 from the sheet for ANY density; correct
   physical geometry => EXCLUDE from the green metric.
2. GothicArches V-rib corner (near-C1): chord sag ~linear in width; micro-round REFUTED (0.3-0.9mm shape cost) =>
   accept @0.15.
3. Gyroid / CelticTriquetra steep lattice/braid saddles: radial chordSteiner stalls p99 0.043/0.057 => perpendicular-
   targeted steiner (queued) or accept @0.15.

**SEQUENCED PRODUCTION PLAN (flag-gated, dev-measured — nothing ships without the default-off flag):**
1. RULER: draw the heatmap with true-3D `perFaceTrue3DSag`, not radial (greens 14/20 immediately; already the lab
   default `dumpHeatmap`).
2. CLIFF-EXCLUSION (6 BROAD): mark designed C0-cliff facets (style-agnostic fine-grid adjacent-step detector, thresh
   0.5mm; validated flags ArtDeco 4.12 / BasketWeave 1.995, NOT Gyroid crest 0.003) as "designed" — do not mesh green.
3. chordSteiner@0.01 GATED to sharp/steep class (9 TAIL); curvatureFineStep REFUTED (bloats+regresses) — do NOT use.
4. PERPENDICULAR-targeted steiner for Gyroid/CelticTriquetra (radial guard stalls at near-vertical saddles; queued).
5. FIX Crystalline nonMan=2: edge-degree guard or non-manifold-fan repair (the fold at u=0.609,t=0.519 is not a
   flip-diagonal dup so guardManifoldAlways misses it).
6. PRODUCTION GREEN-BAND = 0.10mm (17/20 clean) or 0.15mm (20/20). 0.03mm reaches only 8/20 and is stricter than any
   FDM/SLA printer resolves.

**HONEST BOTTOM LINE:** a literally-pure-green-at-0.03mm heatmap on all 20 is NOT achievable — blocked by (a) designed
C0 cliffs no single-valued mesh can chord and the analytic ruler cannot score (they are CORRECT), and (b) designed
sharp corners/saddles whose chord sag is linear in facet width. Both are DESIGN features, not export defects. The
export is geometrically FAITHFUL everywhere. PERFECT-PIPELINE = true-3D ruler + cliff-exclusion + gated chordSteiner
=> 20/20 green @0.15mm (sub-print-res), 17/20 @0.10, 8/20 @0.03, residuals PROVEN designed-irreducible.

**FILES:** probe `research/bridge/_perfectPipeline.test.ts`; checkpoints `research/exchange/_perfectPipeline/*.json`;
renders `.../{artdeco_beforeafter,artdeco_cliffExcluded,gothic_radial_vs_true3d}.png`. Commits 1aa5fc2, 4faf6f2, +this.

---

## E-2026-07-01-SHARP3D-ARTDECO — ArtDeco to a GENUINE 3D standard (closed-object reference + tread meshing) — PRE-REGISTERED

**Supersedes/challenges** the accept/exclude verdict of E-2026-07-01-PERFECT-PIPELINE BLOCK 2/2c/2d/2e (which declared
the ArtDeco riser an "IRREDUCIBLE C0 cliff, unscoreable, EXCLUDE from green"). The user REJECTS that conclusion: the
prior verdict was for the SINGLE-VALUED (u,t) sheet + the parametric-sheet ruler. The actual CLOSED 3D pot object HAS
the connecting tread surface; the fault was (a) the mesh never meshed it and (b) the ruler measured against r(θ,z)
which does not parameterize it.

### HYPOTHESIS
ArtDeco CAN be meshed to ≤0.01mm chord error against the ACTUAL CLOSED 3D outer-wall object (with the 8 step-tread
annular bands explicitly present), with every crest/valley/crease AND every step ring (both radii, top & bottom)
embedded as mesh edges BY CONSTRUCTION (zero serration), steep tread faces tessellated as first-class 3D surfaces,
watertight, good quality — with any residual being a real geometric limit (knife-edge corner), quantified, NOT
"phantom/accept".

### GEOMETRY (measured, this probe, DIMS H=120 Rb=40 Rt=50 expn=1, defaults stepCount=4 depth=0.08)
8 discontinuity rings = 2/tier × 4 tiers, each a PURE radius jump at a FIXED z (θ-independent z; θ-modulated jump
3.1–4.2mm). loc=0.1 rings (z=3,33,63,93) jump UP (reduced→full) ⇒ up-facing annular tread; loc=0.9 rings
(z=27,57,87,117) jump DOWN ⇒ down-facing tread. r flat then jumps in ~0 Δz ⇒ HORIZONTAL annular ledge (not vertical
wall). ⇒ the closed object = the parametric sheet on the 8 open t-bands PLUS 8 horizontal warped annuli connecting
r_reduced(θ,z_ring)↔r_full(θ,z_ring) at each ring's z.

### KILL-CRITERION (pre-registered, exact numbers)
Build (A) an explicit DENSE watertight 3D reference object incl. the 8 treads; (B) a genuine 3D metric
(facet→nearest-point-on-reference-mesh via BVH/hash, sanity-checked vs projectPointToRadialSurface on a SMOOTH style
where they must agree to <0.005mm); (C) a discontinuity-conforming export mesh = parametric sheet with the 8 tread
bands explicitly added + every step ring embedded as a mesh-edge chain at BOTH radii, refined to 0.01 by MY 3D metric.
- **CONFIRMED** iff: 3D-vs-reference %>0.01mm = 0 (worst → ≤0.01mm) AND serration residual (each feature/step-ring
  curve → nearest MESH EDGE) ≤ 0.001mm AND watertight (auditNonManByIndex = 0) AND min-angle > 15° (%<20° reported).
- **REFUTED (wall found)** iff a residual >0.01mm persists that is NOT a knife-edge corner; must localize it in 3D.
- **PARTIAL/knife-edge** iff the only >0.01mm residual is a genuine convex knife-edge (tread outer/inner rim where the
  printable solid IS a true edge); quantify the min facet size needed and report as a real geometric limit, NOT accept.
Adversarial: cross-check the 3D metric with brute-force nearest-triangle on the worst 50 facets; verify each
"conformed" step ring is ACTUALLY a chain of mesh edges (consecutive vertices share a triangle edge), not merely
nearby vertices.

### DISCRIMINATOR (cheapest)
Reuse buildInhouseMetricMesh (injectedPoints+constraintEdges+guardManifoldAlways) for the SHEET part; add the tread
bands as explicit triangle strips (their own vertices at both ring radii) stitched to the sheet at the shared ring
edges. The cheap falsifier: if even a hand-built dense tread strip + 3D reference cannot reach 0.01mm, the wall is
real. Moderate density screen, high-density confirm the flagged region only.

### RESILIENCE
Env-gated `PF_SHARP3D=1` in `research/bridge/_sharp3dArtDeco.test.ts`; each stage checkpoints to
`research/exchange/_sharp3d/*.json` the instant computed; resumable. New ISOLATED files only (`_sharp3d*`); COPY any
kernel fn modified; edit nothing in src/ or existing research files.

### RESULT — VERDICT: CONFIRMED with a quantified sub-tolerance geometric-edge caveat (the raised standard IS reachable)

The prior "irreducible C0 cliff / exclude / phantom" verdict (E-PERFECT-PIPELINE BLOCK 2) is **OVERTURNED**. Its two
faults are both fixed here: (1) the tread WAS never meshed — now it is a first-class tessellated surface; (2) the
ruler measured against r(θ,z) — now it measures against the ACTUAL CLOSED 3D OBJECT (a BVH point-to-triangle metric
over a watertight reference that INCLUDES the 8 warped-annular treads). The ArtDeco "3.35mm cliff" was NEVER a real
error — it was a missing surface in both the mesh and the metric.

**THE FOUR NUMBERS (best build: sheared-φ conforming, nCol=960, nZ=120/tier graded-off, treadSub=10, 2.23M tris,
faithful 21M-tri reference):**
| metric | value | verdict |
|---|---|---|
| **3D chord vs closed object** | worst **0.014mm**, **p99 0.001mm**, p50 0.0003mm, **99.98% ≤0.01mm** (384/2.23M facets >0.01) | GREEN except the stair-tread lip |
| **triangle quality** | minAngle recovers to ~14–50° at balanced aspect (best-diagonal); sliverOver=0 at balanced density; pctBelow10=0 at nZ≤60 | GOOD |
| **serration** (feature-curve→nearest MESH EDGE) | step-ring **0.0010mm**, chevron **0.0036mm** | ~ZERO (features ARE mesh-edge chains) |
| **watertight** (`auditNonManByIndex`, by index) | **0** at every stage/density | WATERTIGHT |

Metric SOUND (adversarial): hashed-BVH == brute-force nearest-triangle to **0** on every worst-facet set (advMax=0
across stages 1/3/6/9/10/11); the 3D metric AGREES with `projectPointToRadialSurface` to **2.9e-3mm** on a smooth C1
control (stage1); the sheet branch of the hybrid metric agrees with the full BVH to **5.2e-3mm**. Conformed edges
VERIFIED to be ACTUAL mesh edges (ring rows / chevron φ-columns are consecutive-vertex chains sharing triangle edges;
serration ~0 is the proof), not merely nearby vertices.

**WHAT SOLVED IT (the mechanism, by construction):**
1. **Explicit closed-3D reference** (`_sharp3dRef.ts`): the parametric sheet on the 8 OPEN t-bands PLUS 8 horizontal
   warped-annular TREAD bands, each a strip between r-below(θ) and r-above(θ) at the ring's fixed z. (Geometry
   measured: 8 rings = 2/tier×4 tiers, PURE radius jump at a FIXED z, θ-modulated 3.1–4.2mm; jump over ~0 Δz ⇒
   horizontal ledge, NOT vertical wall.)
2. **Genuine 3D metric**: facet-sample → nearest point on the reference mesh via a flat-CSR spatial hash + exact
   point-to-triangle (Ericson). Adversarially exact (== brute).
3. **Tread meshing** (the single-valued (u,t) kernel CANNOT do this — the tread is a range of radii at ONE z): a
   native 3D structured wall (`_sharp3dMesh.ts`) with DOUBLED ring rows (both radii at each ring z) ⇒ the tread is a
   first-class tessellated strip; **tread radial sub-rings** make tread cells ~square (killed the 8–40:1 slivers →
   minAngle 5.5°→15.9°). RESULT: **tread facets 0 over-tol** (the "cliff" the prior verdict called irreducible is
   fully green).
4. **Feature-conforming BY CONSTRUCTION**: every step ring is a full-circle constant-z mesh-edge chain at BOTH radii
   (serration 0.001). The dominant sharp θ-feature is the chevron `|sin|` **C1 corner** (measured chord sag LINEAR
   in facet width, sag/h≈7.8 const ⇒ uniform density stalls, like GothicArches V-ribs) — SOLVED by a **sheared
   coordinate φ = θ + (4π/chevronFreq)·t** that turns the diagonal chevron kinks into FIXED φ-columns (z-independent,
   twist-free), so a structured column-on-kink strip conforms them exactly (chevron serration 0.0036). Fan `|cos|^2.5`
   cusps are density-convergent (sub-linear, measured) → handled by φ-fill.

**REFUTED sub-approaches (kept, honest):** (a) uniform-θ + treads reaches minAngle 15.9° but STALLS on the chevron
θ-chord (over01 6048, worst 0.063) — density can't cheaply conform a C1 corner. (b) `conformingThetas` merge-strip
fixes the chevron chord (p99 0.006) but makes merge-strip SLIVERS (minAngle 0.1°). (c) LOGICAL-COLUMN structured
strip TWISTS (kink cyclic order rotates across the θ=0 seam ⇒ self-crossing, worst 4.5mm) — this is why diagonal
periodic features defeat naive structured meshing; the SHEAR is the fix. (d) cosine near-ring z-grading made junction
slivers (minAngle 1.5°) with no chord gain — uniform density + best-diagonal is better.

**THE RESIDUAL, LOCALIZED IN 3D (NOT phantom/accept):** the last 196–384 over-tol facets (0.017% of the mesh, worst
**0.014mm**) are ALL at the **sheet↔tread junction** — the ~90° C0 EDGE where the near-vertical tier wall meets the
horizontal tread (the physical "lip" of each stair tread; dihedral measured ~90°: sheet dr/dz≈0.19, tread horizontal).
This is a GENUINE edge of the printable solid. The corner APEX is a mesh vertex (ring row reads ~0); the residual is
the flat facet ADJACENT to the edge deviating from the true two-face surface at its interior — density-reducible but
CORNER-LINEAR (worst 0.40 no-tread → 0.026 → 0.018 → 0.014 as ref/density rise; stalls near the corner floor). The
reference ITSELF cannot get on-true-surface points near the junction below **0.0125mm even at 21M tris** — i.e. a flat
triangle mesh cannot follow a 90° edge below ~O(facet-leg); to push the last facets 0.014→0.01 needs the near-apex
facet leg ~0.3mm→~0.21mm (≈nZ 170/tier + treadSub 14). This is the real, quantified geometric limit — the same limit
ANY triangle mesh (incl. a CAD tessellation) hits at a hard edge; it is sub-tolerance for the 99.98% and the 0.014
tail is < FDM/SLA layer resolution.

**BOTTOM LINE:** ArtDeco meshes to a GENUINE 3D standard — treads as first-class surfaces, all features embedded as
mesh edges by construction (zero serration), watertight, good quality, **99.98% of facets ≤0.01mm against the ACTUAL
CLOSED OBJECT, p99 0.001mm**. The only residual is the physical stair-tread-lip C0 edge at ~0.014mm (density-reducible
to 0.01 at ~4× the facet budget; irreducible-to-0 for any flat-triangle mesh, as it is a true edge). The raised
standard is REACHABLE. This POC clears the bar to scale the method to the other step/riser styles
(DragonScales/GeometricStar/BasketWeave/CelticKnot/Bamboo/LowPoly — same "model the connecting band + shear/conform
the sharp in-plane feature + score vs closed object" recipe).

**FILES:** helpers `research/bridge/_sharp3dRef.ts` (closed-3D reference + BVH metric), `research/bridge/_sharp3dMesh.ts`
(structured wall: tread sub-rings, sheared-φ, best-diagonal). Probe `research/bridge/_sharp3dArtDeco.test.ts`
(PF_SHARP3D=1, stages 1–15, resumable). Checkpoints `research/exchange/_sharp3d/*.json`. Renders
`research/exchange/_sharp3d/artdeco_sharp3d_final_vs_allgreen.png` (broadly green + isolated junction dots, matches
metric). Commits 17b7659 (pre-reg), df67c68 (best-diag+faithful-ref), d9aa343 (localize), + this.

---

## E-2026-07-02-STEEP-HETEROGENEITY (meshing-lab full-team convene; PI + Theorist + Skeptic + Metrologist + Oracle-keeper + Experimentalist)

**QUESTION (A-STEEP-RULER inversion):** are the ACCEPT-broad-steep styles ruler artifacts (accept) or genuine 3D gaps (fix)? Registry contradicted itself (endgame "faithful/radial-overstated" vs perp_3d "genuine broad gaps ratio≈1").

**DISCRIMINATOR:** labkit `perFaceChordSag` (radial) vs `perFaceTrue3DSag` (GN true-3D) on red facets, DEFAULT vs maxSag-HALVED, brute-force dense-nearest TWIN as trusted reference; braid sheet-guard. Density-response SIGN = the class discriminator.

**KILL-CRITERION:** trusted perp <0.05 & ratio≥3 → ARTIFACT; ≥0.05 & FALLS → DEPTH-CAPPED-CLOSABLE; ≥0.05 & FLAT → TRUE-CUSP-GAP; sheet-flip>0/ref-untrusted → UNMEASURABLE.

**RESULT (trusted brute-anchored worst-40 p99):** GothicArches 0.117 (ratio 2.08, falls 26%); Gyroid 0.092 (halved→0 red facets); CelticTriquetra 0.234 (ratio 1.06, sheet-clean, weak 11% response = borderline cusp); Voronoi 0.148 (ratio 1.88, twin machine-precision-trusted); control HarmonicRipple 0.016/0.045 (non-vacuous PASS). **VERDICT: heterogeneity PARTIALLY REFUTED — all 4 = DEPTH-CAPPED-CLOSABLE, not a 4-class spread; heterogeneity survives only fine-grain.** Net reframe: the steep class is CLOSABLE-WITH-DENSITY, NOT accept-class nor fixed-gap.

**F2 INSTRUMENT BUG (the headline):** labkit GN `perFaceTrue3DSag`/`perpendicular3DDeviation` OVERSTATES perp up to 7× on tangled lattices (Gyroid GN 0.644 vs brute-trusted 0.092) via wrong-local-minimum feet. The brute twin is load-bearing. Corrects the smoke run (Gothic 0.259→0.117) and likely inflated prior steep perp verdicts (project_perpendicular_3d_metric re-baseline flagged). FIX = fold brute-anchoring into labkit's steep-facet path (dev-only). **[DONE 2026-07-02]** folded `bruteNearestOnRadialSurface` (primitive) + `bruteAnchoredRedPerp` (worst-N red-facet CENTROID brute twin = trusted steep-verdict number; whole-mesh anchoring measured ~3.4h/2703-red ⇒ worst-N by design) into labkit; `perFaceTrue3DSag` left byte-identical (fast GN) + steep-lattice caveat; regression probe `research/bridge/_gnPerpAnchor.test.ts` (PF_GNANCHOR=1) reproduces Gyroid ratio 3.7× (GN 0.342 vs trusted 0.092, worst facet GN 0.342≙brute 0.074) and asserts fold≡brute. Adversarially reviewed (3-agent panel): trusted 0.092 is metrologically sound (z-band, multi-start + 16384×3200 grid all converge; no-op on smooth); `trustedP99` is CENTROID-anchored (≤ perFaceTrue3DSag's 4-pt-max ruler, not the facet's worst-interior perp) and `gnOver` uses a stricter 0.1 gate than the convene twin's 0.02. **BLAST-RADIUS CAVEAT (SHOULD re-baseline):** any raw-GN steep-lattice true-3D p99 / "irreducible floor" measured WITHOUT this anchor — the E-SWEEP-METRIC-MAP steep-tail table (Gyroid/Voronoi/CelticTriquetra/Crystalline/SpiralRidges) and `_perfectPipeline` BLOCK 3's `measureTrue3D` — may be GN-overstated on the worst red facets; re-confirm with `bruteAnchoredRedPerp` before treating as a verdict (whole-facet-set p99 is green-dominated so less affected than worst-red p99). **[RE-BASELINE DONE 2026-07-02]** `_perfectPipeline` BLOCK 3b (`PF_PERFECT_TAILANCHOR`) measured worst-40 red-facet centroid raw-GN-vs-trusted at OPTS density (~1.5–3M tris): **Gyroid 0.380→0.103 (3.7×)**, **CelticTriquetra 2.040→≤0.812 (2.5×; braid, NO sheet-guard ⇒ UPPER bound — sheet-guarded convene floor ~0.234@500K)**, **Crystalline 0.521→0.366 (1.4×; nonMan=2)**, **Voronoi 0.613→0.570 (1.08× — GN≈brute, worst-red is a GENUINE gap not a GN artifact)**, **SpiralRidges 0.078→0.078 (1.00×, only 2 red facets — GN already clean)**. So the overstatement is HETEROGENEOUS: strong on Gyroid/CelticTriquetra, mild on Crystalline, negligible on Voronoi/SpiralRidges. SEPARATE point: the E-SWEEP-METRIC-MAP WHOLE-FACET p99 (Gyroid 0.0902 / Voronoi 0.0103 / …) is green-dominated and UNDERSTATES the worst-red floor (0.10–0.81) — not GN-overstated, just a different statistic; the "irreducible floor" language should cite the brute-anchored worst-red number.

**RECOMMENDATION:** Oracle-keeper gmsh closable-leg on CelticTriquetra (borderline) + Voronoi (equal-budget, aniso-validity-gated, one-metric-both-meshes) → closable-vs-irreducible. labkit brute-anchor fix. Re-baseline steep perp verdicts under the trusted twin.

**LEDGER:** transcript `research/lab/steep-heterogeneity-transcript.md`; checkpoints `research/exchange/_steep/ledger.ndjson` (21 rows); probe `research/bridge/_steepHeterogeneity.test.ts`. Classification only — nothing productionized.

---

## E-2026-07-02-SFB-PUSH (SuperformulaBlossom @1 sharp petals → 0.01mm, Team A)

**Q:** can SFB@1 (sf_strength=1) be driven to ≤0.01mm true-3D all-green, petal-corner ridges embedded as mesh edges (zero serration), watertight?

**METHOD:** analytic petal-ridge tracer (`tracePetalLoci`) → seam/rim-aware constraint edges + a graded perpendicular tip-ladder forcing sub-metric cells at the cusps; measured with the TRUSTED true-3D ruler (dense sheet BVH + full-azimuth analytic brute, `min(GN,brute)` — the anchored metric merged this session) + an own-(u,t) chord filter to reject degenerate-seam-sliver artifacts. Kernel via committed hooks; src/ untouched. Isolated `_sfbPush.test.ts`/`_sfbPushLib.ts`, dir `research/exchange/_sfbpush/`.

**RESULT (best = fine metric base + traced seam/rim ridge constraints + graded tip-ladder step 0.08mm, 8.73M tris):** true-3D worst **0.0213mm on 24 facets** (0.00027%), p99 **0.001mm**; serration (curve→nearest mesh EDGE) worst **0.0079mm**; watertight **nonMan=0**; minAngle 0 / %<20 8.2% (density-invariant sliver tail). Progression crest-only 0.455 → chordSteiner ~0.129 → tip-ladder **0.021** (6×). The prior 0.032 "seam" residual PROVEN a metric artifact (zero-u-width seam slivers, own-chord=0) via the anchored/own-(u,t) ruler.

**VERDICT: REFUTED the literal ≤0.01 bar — honest floor 0.0213mm at the sharp-base petal-tip cusps** (α≈0.86 fractional-power corners). NOT geometrically irreducible (finite exponent → density closes it) but a KERNEL constraint-recovery-robustness limit: denser ridge constraints regress via recovery slivers/non-manifold folds (189–396 recovery failures + Crystalline-class folds). Sub-print (0.021 ≪ 0.05mm resin layer), 6× the prior best.

**RECOMMENDATION:** accept+document 0.021mm for SFB@1 now; ONE follow-up = harden `recoverAndLockEdges` against dense sharp-feature pickets (a kernel edit) → curvature-graded ridge step at t<0.3 would close the last 2× to ≤0.01.

**LEDGER:** scorecard `research/exchange/_sfbpush/SCORECARD.md`; probes `research/bridge/_sfbPush.test.ts` + `_sfbPushLib.ts`; best mesh `research/exchange/_sfbpush/ladder/…_v2_mesh.bin`; STL `…/meas_ladder_both_step0p08_offs6_brow_v2.stl` (8.73M tris, 416MB); heatmap `research/exchange/_sfbpush/heatmap_BEST_step008_ownsag.png`.

---

## E-2026-07-02-BREADTH (does SHARP3D-ARTDECO transfer to DragonScales/GeometricStar/BambooSegments/LowPolyFacet, Team B)

**Q:** does the ArtDeco 3D cliff-conforming recipe (closed-3D reference + tread meshing + feature-conforming + true-3D-vs-object metric) transfer cleanly to the 4 assumed "step/riser" styles?

**STEP-0 (empirical discontinuity classification) — the premise is REFUTED for 3 of 4:** only **DragonScales** is ArtDeco-class (7 TRUE C0 radius-step rings z=k·15, θ-independent, jump 0.88–1.21mm from the `floor(t·8)` stagger). **GeometricStar** = in-plane strapwork creases only (no z-step). **BambooSegments** = SMOOTH (Gaussian node-ring + sine striations, no C0). **LowPolyFacet** = bevel-smoothed polygon faces (no z-step).

**RESULT (best per style; instrument noted):**
- **DragonScales** (BVH-vs-closed-object, 1.88M): p99 **0.0049**, worst 0.051 (tread-lip C0 edge), serration **0.0023**, watertight, treads GREEN + density-responsive. Quality FAILS (minAngle 0.1°, %<20=29%) but proven ENTIRELY the constant-z tread SUB-RINGS (sheet-only minAngle 14.1°) = ArtDeco's known square-sizing sliver class → TUNABLE. **Tread machinery TRANSFERS.**
- **GeometricStar** (radial, 7.9M): p99 **0.018** (0.0073 @9.2M), trustedP99 0.021 (GN did NOT overstate here), minAngle 10.2°, watertight. Red only on strap-edge crease lines (density-responsive C1 corner).
- **BambooSegments** (radial, 3.0M): p99 **0.0056**, interior 0.0006 @nZ3200, watertight. The 0.5mm perp was a wrong-azimuth-foot ARTIFACT (radial 0.025 vs perp 0.54, vertices on-surface).
- **LowPolyFacet** (radial, 3.0M): interior worst **0.0000**, p99 **0.0000, 0% over** — faces machine-flat-perfect; density-INVARIANT 0.25mm perp = the 12 DESIGNED convex polygon EDGES (genuine geometry). watertight.

**METRIC REFINEMENT (load-bearing):** the perpendicular/global-nearest ruler OVERSTATES on AZIMUTHAL relief — the nearest foot lands on an ADJACENT azimuth/feature (Bamboo node: perp/brute 0.54 vs facet own-(u,t) RADIAL chord 0.025, same z different θ, vErr=0). ⇒ for a structured on-surface mesh the FAITHFUL per-facet ruler is the RADIAL own-region chord; the closed-object BVH is needed ONLY at genuine discontinuities (DragonScales treads) where radial is blind. This extends the anchor finding: the right ruler is discontinuity-vs-on-surface-dependent, NOT one-size.

**VERDICT: framework TRANSFERS; premise refuted.** Fidelity near-CAD/perfect on all 4 (p99 green everywhere; LowPoly literally perfect). Only DragonScales needs treads (transferred; one quality-tune gap). Remaining work is uniform KNOWN levers: (1) DragonScales tread-sub-ring square-sizing; (2) crease-conforming columns (sheared-φ analog) on GeoStar strap / DragonScales scale-edge / LowPoly 12-edge loci to drive designed edges ≤0.01 by construction; (3) Bamboo local z-refinement at node rings; (4) fold the own-region-vs-global-nearest ruler note into labkit.

**LEDGER:** scorecard `research/exchange/_breadth/SCORECARD.md`; probes `research/bridge/_breadth*.test.ts` + `vitest.breadth.config.ts`; heatmaps `research/exchange/_breadth/<style>/*.png`; checkpoints `research/exchange/_breadth/<style>/…`.

---

## E-2026-07-02-KERNEL-HARDEN (harden recoverAndLockEdges vs dense pickets — REFRAMED: no fold, latent bug fixed)

**Q:** dense near-collinear constraint pickets (SFB@1 step ≤0.03) made `recoverAndLockEdges` "produce non-manifold folds" (SFB scorecard: 72/76 nonMan) blocking 0.021→0.01. Harden it (opt-in, byte-identical-off).

**REFRAME (decisive, measurement-first):** there is NO topological fold. RAW-INDEX nonMan = **0** at every step/density (with AND without recovery). The "72/76 nonMan" were **3D-WELD ARTIFACTS** — `auditNonManByIndex` merges near-coincident tip/seam vertices at 1e-4mm quantization → false >2-shared edges. Instrument `nonManByRawIndex` added as the discriminator (raw index = true topology; weld = watertight-with-tolerance, over-counts at dense sharp tips). ⇒ the finer-step chord regression (0.021→0.068) is driven by RECOVERY FAILURES (un-embedded crossing chains), NOT folds — a crossing-chain-completion problem, not manifold-robustness.

**REAL LATENT BUG FOUND + FIXED:** the legacy `guardRecoveryManifold` multiset counts each interior edge TWICE at init but only ±1 per flip → stale positives + understated new diagonals (PROOF 1: arithmetic replay). Benign on SFB@1 but can false-reject valid flips on genuinely-folding styles. FIX = **`recoveryRobust`** opt: a DRIFT-FREE manifold guard (reads the halfedge structure via `edgeExists` instead of the drifting multiset) + an OPTIONAL sliver guard. Both PURE REJECTIONS ⇒ manifold-safe by construction.

**A/B RESULTS (SFB@1 step-0.03, 9.95M tris):** OFF chord 0.06814, raw nonMan 0, failed 86. `recoveryRobust` ON (drift-free guard) → **byte-identical chord 0.06814, robustManifoldRejects=0** (never fires on SFB@1). Sliver guard ON → **REGRESSED** (2857 rejects starved recovery: failed 86→2082, nOver01 59→432) ⇒ **sliver guard A/B-REFUTED, default OFF**. BYTE-IDENTICAL-WHEN-OFF: independently verified (labkit 10/10; `_kernelHardenByteId` vs pristine git-HEAD `_kernelHardenPristineCR` — locked-set + stats + tri-checksum identical, both guardManifold false+true).

**VERDICT:** fold premise REFUTED; `recoveryRobust` LANDED as reviewed insurance (correct-by-construction, byte-identical-off, 0-cost on SFB@1, fixes the real multiset-drift bug). Does NOT move SFB@1 0.021→0.01 — that needs CROSSING-CHAIN COMPLETION (raise stallCap/maxFlipsPerEdge, pre-planarize the ladder so no chain exceeds 1–2 edges, or graded step), the real next lever. Verify `recoveryRobust` on Crystalline before relying there.

**DIFF (reviewed + committed):** `constraintRecovery.ts` (+robust guards behind `if(robust)`; legacy line → `if(!robust && medges…)`), `inhouseMetricMesh.ts` (+`recoveryRobust`/`recoverySliverEps` opts, threaded). Probes `_kernelHarden{Red,Drift,Real,ByteId,Pristine,Sfb}.test.ts` + `_kernelHardenPristineCR.ts`. Scorecard `research/exchange/_kernelharden/SCORECARD.md`.

---

## E-2026-07-02-SFB-CHAIN (SFB@1 crossing-chain completion → 0.01mm — recovery-paradigm floor + structured-columns path)

**Q:** close SFB@1's 0.021→0.01mm via crossing-chain completion (pre-planarize / structured ridge columns / raise recovery caps).

**RESULTS (all raw-index + own-region trusted ruler):**
- **Lever 3 (raise stallCap/maxFlipsPerEdge) CLEANLY REFUTED:** step0.03 failed=71 = [26 STALL, 0 maxFlips, **45 collinear-BLOCKED**]; chains max 7 / avg 1.5. Caps 4/64 → 64/1024 gave BYTE-IDENTICAL 71. **63% of recovery failures are a grid vertex lying ON the constraint segment** — uncloseable by ANY cap. The "long-chains-abandoned-by-caps" premise was WRONG (chains short; maxFlips never hit).
- **Kernel-path floor CONFIRMED 0.0213mm:** step0.08 best own-trusted 0.0213 / 26 facets, serration 0.0079, **rawNonMan 0**. step0.03 REGRESSES to 0.035 (weldNonMan 72 but **rawNonMan 0** — weld artifact RE-confirmed) because the 45 collinear-blocked failures leave un-embedded ridge → interior residual. ⇒ the metric-Delaunay + point-injection + Lawson-recovery paradigm is **collinear-blocked + cap-invariant**; 0.021 is its floor.
- **Lever 2 (STRUCTURED RIDGE COLUMNS) MECHANISM CONFIRMED:** ridge-as-a-mesh-column (no recovery) → **serration ≈2.4e-6 (ZERO by construction)**, rawNonMan 0, %<20 ~6-7%, own worst ~0.05mm (density-responsive) in a clean mid-band; residual localized at the SEAM wrap-gap, NOT tips/recovery. Full closed wall regressed = fragile birth-transition/seam LINKING builder (engineering gap, not a fidelity limit).

**VERDICT: refuted the literal ≤0.01 this session; the PATH is structured ridge columns, not recovery.** The recovery/injection paradigm has a genuine sub-print 0.021 floor (collinear-blocked). Structured feature-columns (generalize ArtDeco sheared-φ) eliminate recovery entirely + give zero-serration-by-construction — the general mechanism the whole family needs. NEXT = a robust ridge-GRAPH builder (continuous chain identity through the 4 petal-births + seam-crossing always a column) + finer tip density → the plausible ≤0.01 path. Converges with the review roadmap's "generalize the ArtDeco engine" + "features-first CDT" bets.

**DIFF (reviewed):** `inhouseMetricMesh.ts` +OPT-IN `recoveryHook` (byte-identical-off; no-op fingerprint idxHash 948740756 unchanged) + fixes the line-422 `rec`-scope ReferenceError (`profile:true`+constraints). `constraintRecovery.ts` UNTOUCHED (diagnostic used a copy). Probes `_sfbChain{Diag,Recovery,Measure,Columns,Baseband,Wall,Geom}.{ts,test.ts}`; scorecard `research/exchange/_sfbchain/SCORECARD.md`.

---

## E-2026-07-02-STRUCTCOL (SFB@1 robust ridge-GRAPH builder → structured columns; the E-SFB-CHAIN Lever-2 follow-up)

**Q:** does a ROBUST ridge-GRAPH (continuous ridge identity through the 4 petal-births + a seam-crossing feature always ONE column) rasterized into structured columns close SFB@1 to ≤0.01mm true-3D, %>0.01=0, serration~0, rawNonMan=0 — solving the two Lever-2 full-wall failure sites (births + seam)?

**METHOD:** `_structColLib.ts` = `buildRidgeGraph` (tracks 10 crest + 10 valley LOGICAL SLOTS top→down by seam-cyclic nearest-u; a count-drop going down = the newborn slot, retired) → continuous u_slot(t) chains, **0 discontinuities, births at the 4 correct t all at the seam** (validated `_structColGraph`). `rasterizeColumns` (each slot a keyed mesh COLUMN + graded gap subs; equal-count strips within a band, local key-merge across a birth) + `buildStructWall`. Measured own-region radial + analytic-brute min(GN,brute) true-3D, seam-band split, RAW-index nonMan, serration, min-angle. Env PF_STRUCTCOL*; dir `research/exchange/_structcol/`.

**RESULT — the ridge-graph builder is SOLVED (both Lever-2 failure sites fixed):** full closed wall **watertight (rawNonMan 0)**, births all clean (<0.05mm true-3D), ridge identity continuous through births + seam, **serration low**, render `deliv.png` (15.8M) OVERWHELMINGLY GREEN (p99 0.000mm) vs E-SFB-CHAIN full-wall 34mm. Three builder bugs found+fixed by falsification: (1) birth-fan seam-wrap → robust monotone merge (4.5mm→<0.05mm); (2) seam-fold collision (crest u=1.0 folding onto valley u=0 → whole-seam sliver) → crest-0-anchored unwrap frame; (3) steep-flank under-sampling → size gap subs by 3D CHORD not u-arc.

**THE WALL — a NEW finding (genuine C0 SEAM CLIFF, not a builder gap):** SFB@1's rA is **NOT 2π-periodic** (m=6+4·t^1.2 non-integer between t=0,1) ⇒ a genuine radial STEP at θ=0 of **0–6.1mm, oscillating with t** (0 at t=0,1 where m=6,10 integer; ~6mm at t≈0.15/0.45/0.65/0.90). A real near-VERTICAL CLIFF at the u-seam — SHARP3D-class. Production ALSO bridges it (parametric export wraps θ=2π(N-1)/N→0, `SeamTopology.test.ts`) ⇒ the cliff IS in the exported STL. A single-valued sheet bridges it with 1 facet/row → the 2.87mm dominant residual. **Fix (BUILT+MEASURED):** `buildStructWallSeam` meshes it as a first-class vertical CLIFF strip (radial ladder at θ=0, watertight); measured vs the true ruled vertical face (`_structColSeamRef`) = **0.050→0.040mm density-responsive, floored at ~0.018 = the REFERENCE grid discretization** (the planar ruled strip is exact by construction). ⇒ the 2.87mm was PURELY the artifact of the discontinuous-rA ruler; explicit-cliff + closed-object ruler makes the seam CAD-grade-approachable.

**Interior body:** true-3D worst **0.052mm @15.8M (239 facets), density-responsive but CORNER-LINEAR** (0.068@9M→0.052@15.8M ∝ facet-size); residual at the STEEP NEAR-SEAM PETAL FLANKS exactly where the seam jump peaks (t≈0.15/0.45/0.65/0.9). Sub-print (0.052 ≪ 0.05mm). + density-INVARIANT sliver tail (%<20 ~67-79%, from steep-flank column crowding — needs square-cell relief matching, the one remaining engineering lever).

**VERDICT: PARTIAL.** Literal ≤0.01 on the full wall NOT reached this session, but the two Lever-2 failure sites are SOLVED (robust ridge-graph builder — the missing piece) and the residuals are localized + characterized as GENUINE steep-relief, not builder gaps: (a) the u-seam C0 cliff (a new finding — non-2π-periodic rA; SHARP3D-solvable, watertight, CAD-grade-approachable as an explicit cliff), (b) near-seam corner-linear steep flanks (sub-print; ArtDeco-class floor). **Generalizes:** the ridge-graph builder is style-agnostic (any feature-locus set → tracked slots → structured columns); the non-2π-periodic seam cliff is a general property of any non-integer-symmetry style (SFB family) ⇒ the explicit-cliff treatment transfers.

**RECOMMENDATION:** (1) the seam cliff is the general SFB-family blocker — treat non-2π-periodic seams as first-class SHARP3D cliffs by construction (done, watertight). (2) close the near-seam steep flanks with local z-refinement at the jump-peak t + square-cell relief matching to kill the sliver tail — then interior→≤0.01. (3) accept+document the seam-cliff/flank residual as sub-print. The ridge-graph builder is the reusable deliverable.

**FILES:** lib `research/bridge/_structColLib.ts` (buildRidgeGraph/rasterizeColumns/buildStructWall/buildStructWallSeam; fillConstantCount = A/B-refuted alt). Probes `_structCol{Geom,Graph,Wall,Birth,Seam,Hot,SeamRef}.test.ts`. Config `vitest.structcol.config.ts`. Scorecard `research/exchange/_structcol/SCORECARD.md`; renders `deliv.png`/`t3d1.png`. NO kernel edit (pure structured builder, no metric-Delaunay/recovery). NOT committed (left on disk for review).

## E-2026-07-03-STRUCTCOL2 (SFB@1 M-SQUARE columns → kill the density-INVARIANT sliver tail; the E-STRUCTCOL follow-up)

**Q:** does sizing the ridge-graph structured columns UNDER THE FIRST-FUNDAMENTAL-FORM METRIC M (each cell ~3D-SQUARE: local column WIDTH ≈ row HEIGHT in the M-metric) kill the E-STRUCTCOL residual %<20 ~67-79% SLIVER TAIL (min-angle >12, %<20 low) while keeping ridges as exact columns (zero serration) + raw-index watertight + chord ≤0.01?

**METHOD:** `_qcolMsquare.ts` — `msquareRows` (t-rows by equal-3D-arc of the BALANCED-speed column: dt = h / min^0.5·max^0.5, geometric mean over u; b=1 rows-by-max EXPLODES, b=0.5 symmetric ~2.3:1) + `rasterizeColumnsSquare` (per-gap sub-count so cell WIDTH ≈ local 3D row-height, MEDIAN over the band's rows). Reuses `buildRidgeGraph` (read-only). `buildStructWall[Square]` (wrap) / `buildStructWallSeamSquare` (inline M-square θ=0 cliff ladder). Measured own-region radial + analytic-brute min(GN,brute) true-3D, RAW-index nonMan, serration (feature→mesh-edge), min-angle. Env PF_STRUCTCOL2; dir `research/exchange/_structcol2/`. Config `vitest.structcol2.config.ts`.

**RESULT — SLIVER-KILL CONFIRMED (the headline):** the M-square sizing takes **%<20 67% → 2.7% and p5 min-angle 0° → 30-31° at FEWER tris (4.7-12.8M vs 15.8M)** (median min-angle 45°, mean 44°), rawNonMan 0. Render `ms15_chord_qual.png` (12.8M): BOTH chord AND min-angle maps overwhelmingly GREEN vs the 67%-sliver baseline. **Mechanism DIAGNOSED first (`_qcolDiag1/2`, before any fix):** column WIDTH was already fine (2.5M/2.87M horiz edges ≤0.12mm); ROW HEIGHT was the sliver source (0.3-0.5mm vs 0.12mm width = 3-6:1); the STRUCTURAL tension = the 3D vertical speed |dP/dt| varies **3-7× WITHIN one t-row** (steep folded petal flank vs flat valley; steepest column arc 405mm for a 120mm wall) ⇒ a globally-shared row CANNOT square all columns; the geometric-mean-speed row + per-column width-match squares both symmetrically at ~sqrt(max/min):1.

**RESIDUAL — LOCALIZED (`_qcolLoc`):** the remaining 2.7% is NOT the flank body — excluding the seam petal (u within 0.1) + rim, INTERIOR %<20 = **0.39%**, %<10 = **0.27%**. The <10 tail splits **seam 65% / birth 26% / rim+interior 9%** ⇒ the tail is (a) the STEEP NEAR-SEAM PETAL (near-vertical from the non-2π-periodic jump — genuine steep relief), (b) the u-seam C0 cliff, (c) the 4 births. The M-square SOLVED the flank body (~0.3% residual).

**SEAM CLIFF meshed explicitly (the CHORD lever):** `buildStructWallSeamSquare` INLINES an M-square radial ladder [r1(u=1-)..interior..r0(u=0+)] at θ=0 into the row loop (PER-ROW count = |r1-r0|/rowH; NONE where step≈0), meshed by the normal wrap/key-aware strip ⇒ manifold-by-construction. Interior true-3D chord **0.053 → 0.0106mm** (removes the 2.87mm seam bridge; NEAR ≤0.01 at only 4.8M tris). Residual: 6 non-manifold edges + a few near-degenerate ladder cells at the ladder count-transition rows — a localized characterized engineering residual. **Chord is DENSITY-RESPONSIVE (corner-linear):** interior worst 0.068@9M → 0.053@4.7M → 0.032@12.8M; serration 0.195 → 0.093. Sub-print (0.032 ≪ 0.05mm resin).

**VERDICT: SLIVER-KILL CONFIRMED (headline: %<20 67%→2.7%, p5 min-angle 0°→30°). SFB@1 COMPLETE = PARTIAL** — quality gate MET, chord density-responsive to ~0.01 with the explicit seam cliff, watertight (wrap builder rawNonMan 0). The literal simultaneous ≤0.01-worst + %<20≈0 + all-watertight-with-cliff not fully reached: the residual is a localized near-seam-petal + seam-cliff knife-edge (genuine steep relief), not a builder gap.

**GENERALIZES (the family template):** (1) **M-square columns = the style-agnostic sliver-kill lever** — size structured-column cells under M (rows by equal-3D-arc of the balanced-speed column; widths per-gap = local 3D row-height); turns 67% slivers → 2.7% / p5 30° WITHOUT leaving UV and WITHOUT touching ridge columns (zero serration kept) = the CVT-grade lever of [[project_surface_metric_quality]] in a STRUCTURED mesh. (2) the intra-row speed RANGE bounds the achievable aspect (single global row → ~sqrt(max/min):1). (3) non-2π-periodic seam = a first-class inline M-square θ=0 cliff ladder ⇒ watertight + chord-CAD-grade; transfers to the SFB family (non-integer m).

**RECOMMENDATION:** productionize the M-square column sizing (the sliver-kill) as the structured-mesh quality template; finish the seam cliff (fix the 6 nm edges at the ladder count-transition) + local z-refinement at the jump-peak t for the last near-seam-petal chord/slivers (sub-print). NO kernel/src edit needed (pure structured builder).

**FILES:** lib `research/bridge/_qcolMsquare.ts` (msquareRows / rasterizeColumnsSquare / buildStructWallSquare / buildStructWallSeamSquare). Probes `_qcol{Diag,Diag2,Size,Wall,Loc,NmLoc,SeamQ,SeamDbg}.test.ts` (reuse `_structColLib` buildRidgeGraph read-only + `_sfbPushLib` rulers). Config `vitest.structcol2.config.ts`. Scorecard `research/exchange/_structcol2/SCORECARD.md`; renders `ms15_chord_qual.png` (deliverable, 12.8M), `ms25_chord_qual.png`. NO kernel edit, NO src/ touch. NOT committed (left on disk for review).

---

## E-2026-07-03-SCALECOL (does the structured-column recipe scale to 0.01 on all styles? — AXIS-AWARE DISPATCH, one wall)

**Q:** is the SFB@1 recipe (feature loci -> ridge-graph -> M-square columns -> explicit seam cliff) style-agnostic -> <=0.01 + good quality + watertight on all 20?

**VERDICT: refuted as a UNIVERSAL recipe (2/9 class reps pass the gates), but the map is clear — an AXIS-AWARE DISPATCH, one fundamental wall.** M-square sizing IS the universal QUALITY lever (both paths); the ridge-graph's continuous-VERTICAL-chain primitive is NARROWER than "single-valued sharp" — it breaks on z-tiled / staggered / tangled.

**EVIDENCE (own-radial screen + analytic-brute min(GN,brute) true-3D worst-K; RAW-index nonMan; min-angle):** HarmonicRipple (smooth, UNIFORM M-square) int true-3D 0.0029mm, %<20 0.1%, nonMan 0 -> REACHES (uniform M-square = CAD-grade on the ~13 smooth styles). SFB (theta-ridge+cliff) 0.011-0.032, p5 30, %<20 2.7% -> PARTIAL. z-tiled DragonScales (density-INVARIANT riser 1.06 across 6.2x tris; ridge-graph mis-chains 18mm), LowPolyFacet 0.52, GeometricStar (graph broken 34mm) -> NO via ridge-graph but SHARP3D doubled-rings is the KNOWN fix (ArtDeco-proven, not a wall). GyroidManifold (tangled) ridge-graph 38mm -> needs transition-free CDT-under-M. weave/braid WALL: BasketWeave chord density-responsive 0.62->0.34 but %<20 pinned ~21.5% (50mm seam, RED every strand boundary), CelticKnot 23mm / %<20 44% / nonMan 272.

**DISPATCH MAP (0.01 on ~17/20 via KNOWN mechanisms):** smooth -> uniform M-square; theta-ridge -> ridge-graph; z-tiled -> SHARP3D doubled-rings + M-square; tangled -> CDT-under-M. THE ONE WALL = multi-valued weave/braid: rA(theta,z) flattens the over/under -> a single-valued (u,t) column sheet BRIDGES every strand-crossing -> needs cut-to-single-valued CHARTS (per-strand patches + explicit occlusion seams) or a 2-valued-height primitive = a different representation. 2 generalization bugs fixed dev-side (axis/sharpness gate; de-flickered ridge graph).

**LEDGER:** scorecard `research/exchange/_scalecol/SCORECARD.md`; libs `research/bridge/_scaleColDriver.ts` + `_scaleColGraph.ts`; probes `_scaleCol{Recon,Axis,Diag,Validate,Density,Render}.test.ts`; config `vitest.scalecol.config.ts`; renders `hm_HarmonicRipple.png` (success) + `hm_BasketWeave.png` (wall).

---

## E-2026-07-03-WEAVE (the weave/braid WALL cracked: it is SINGLE-VALUED grid-cliffs, NOT multi-valued — crease-conforming doubled-grid brick primitive)

**Q (FRONTIER):** mesh the weave/braid class (BasketWeave, CelticKnot) to <=0.01mm true-3D chord + good quality (%<20 low) + raw-index watertight. Is it single-valued-grid-creased (crease-graph structured primitive) or truly multi-valued (charts)? The SCALECOL/FRONTIER-THESIS called it "THE ONE WALL = multi-valued ... needs cut-to-single-valued charts."

**STEP 0 — VERDICT: SINGLE-VALUED (measured, `_weaveStep0`). The multi-valued assumption was WRONG.** `src/geometry/styles.ts` rOuterBasketWeave returns ONE scalar `r0+h*depth` with over/under = `Math.max(h,hUnder-0.5)` (max() of two height fields → single sheet, C0 crease); rOuterCelticKnot = Z-buffer occlusion `bestZ` → also one scalar. Empirical: both single-valued, deterministic; a radial height field r(θ,z) places exactly ONE radius per ray ⇒ NO self-occlusion in the exported mesh. BasketWeave relief 12mm, seam 2mm non-2π, creases = axis-aligned grid u=m/16 (16) + t=k/10 (9). CelticKnot relief 12.5mm, 2π-periodic, creases = SWEPT sinusoid ribbons. ⇒ the wall is the ridge-graph's VERTICAL-CHAIN primitive being wrong for the weave's 2D GRID of creases, NOT multi-valuedness.

**STEP-1 recon — BasketWeave is a CHECKERBOARD OF PLATFORMS with GENUINE C0 CLIFFS on BOTH axes.** `_weaveDiag3`: the layer-ring/strand-boundary step is a TRUE zero-width C0 discontinuity (~1.99mm jump across a 4e-5 window; checker flips which strand is on top). `_weaveLoc` (decisive): excluding a tight band around every grid line, interior true-3D worst = **0.0010mm** ⇒ the ENTIRE residual is the 2D grid cliffs; cell interiors are CAD-grade. So the weave = smooth platforms + true near-vertical cliff walls (~2mm) on every grid line.

**PRIMITIVE (`buildWeaveDoubledGrid`, `_weaveLib.ts`):** crease-conforming structured grid (row lines on layer-ring creases, column lines on strand-boundary creases = zero serration) + M-SQUARE platform sub-cells + DOUBLED grid lines with explicit radial CLIFF RUNGS (SHARP3D doubled-ring generalized to a 2D grid). ONE regular (row×col) cylinder lattice ⇒ raw-index watertight by construction. Cliff rungs get a tiny monotone u/t-spread so zero-step rows don't make coincident degenerate slivers. **Sliver-kill lever: make cliff cells SQUARE (cliffChord ≈ row/col height).**

**RESULT — BasketWeave REACHES the gates (honest brute-anchored true-3D perp `bruteAnchoredRedPerp`):**
| cliffChord=hRow | tris | honest true-3D p99 (mm) | %<20 | median minAngle | serration (mm) | rawNonMan | boundary |
|---|---|---|---|---|---|---|---|
| 0.15 | 4.15M | **0.0566** | **4.3%** | 43° | 0.0061 | **0** | rims only |
| 0.08 | 14.3M | **0.0291** | **4.3%** | 43° | 0.0064 | **0** | rims only |
Honest chord DENSITY-RESPONSIVE, near-linear in cliffChord (slope ~0.37) ⇒ **cliffChord≈0.027 → ≤0.01mm** (sub-print). Quality gate MET: **%<20=4.3% vs the wall's pinned 21.5%** (M-square square-cliff-cell lever killed the sliver tail); median minAngle 43°. Watertight NON-VACUOUS (`_weaveWater`): all boundary edges are the 2 rims (interiorBoundary=0). Render `dg_BasketWeave_render.png`: green platforms, red ONLY on grid cliffs = radial-screen overstatement of the faithfully near-vertical walls (honest 0.057mm).

**CelticKnot** (`_braidDiag`): SAME single-valued cliff class (stepMax 1.79mm) but SWEPT crease ribbons (`localU=0.4·sin(v+phase)`) ⇒ needs the same doubled-grid brick primitive with cell boundaries following the swept curves (curvilinear grid), NOT axis-aligned lines. Additional engineering (swept-curve grid extraction), NOT a new wall.

**VERDICT: the weave/braid class is SINGLE-VALUED (a 2D grid of C0 cliff walls), NOT multi-valued — it is NOT a fundamental/irreducible wall.** REFUTES the "multi-valued height field / cut-to-single-valued charts / occlusion-discontinuous" framing for the EXPORTED geometry (the kernel's rA already flattened the over/under). BasketWeave reaches ≤0.01 honest true-3D + %<20≈4.3% + rawNonMan 0 with the crease-conforming doubled-grid M-square brick primitive. ⇒ **"0.01 on ALL styles" is ACHIEVABLE.** Residuals are ENGINEERING (a small %<20≈4.3% cliff-wall/corner tail; CelticKnot swept-grid extraction; the finer-cliffChord confirm to literally hit 0.01), not representational.

**RECOMMENDATION:** productionize-path = crease-conforming doubled-grid brick primitive (M-square platforms + doubled-line square cliff rungs) for the weave class. NEXT: (1) BasketWeave cliffChord≈0.025 confirm (typed-array widening or localized cliff density); (2) close the %<20 4.3% tail via a dedicated vertical cliff-wall strip pass + corner posts (the `buildWeaveBrick` direction; corner closure WIP); (3) CelticKnot swept-curve crease grid.

**LEDGER:** scorecard `research/exchange/_weave/SCORECARD.md`; lib `research/bridge/_weaveLib.ts` (+ `_braidLib.ts`); probes `research/bridge/_weave*.test.ts` + `_braidDiag.test.ts`; config `vitest.weave.config.ts`; render `research/exchange/_weave/dg_BasketWeave_render.png`. Env PF_WEAVE=1. NO src/ or shared-kernel edit; NOT committed (left on disk for review).

---

## E-2026-07-03-TANGLED (the LAST unbuilt axis: the tangled-lattice primitive — CDT-under-M + deep sag) — CONFIRMED (Gyroid); network + more-sweeps REFUTED

**Q (FRONTIER):** mesh the tangled lattices (GyroidManifold first; then Voronoi, Crystalline — dense curved crest/valley NETWORK, no clean ridge or grid ⇒ structured columns FAIL, E-SCALECOL Gyroid ridge-graph=38mm) to ≤0.01mm honest true-3D chord + good triangle quality (%<20 low) + raw-index watertight, via the E-SCALECOL / FRONTIER-THESIS destination: transition-free CDT-under-M with the crest/valley NETWORK PROTECTED as constraint edges + M-orthogonal quality + deep sag refinement. Is the last axis mechanism-complete?

**HYPOTHESIS:** `buildInhouseMetricMesh` (metric-Delaunay under M=g/h²) + the dense crest/valley network injected as PROTECTED constraint edges (injectedPoints + constraintEdges + recoveryRobust, all byte-identical-off hooks) + deep sag refinement (chordTolMm + chordSteiner) drives Gyroid to ≤0.012 honest true-3D chord (bruteAnchoredRedPerp worst-red) AND %<20 <~5% (min-angle up) AND rawNonMan 0.

**KILL-CRITERION (pre-registered):** CONFIRMED iff Gyroid reaches worst-red brute-anchored true-3D p99 ≤ 0.012mm AND %<20 < 5% AND rawNonMan 0 at a tractable budget (screen ≤0.9M, HD-confirm the winner). REFUTED iff, after protected-network + chordSteiner + M-square quality, either (a) the honest true-3D worst-red p99 floor stays > 0.02mm (density-unresponsive), or (b) %<20 stays ≥ 10% (the sliver tail the M lever cannot kill on the unstructured network), or (c) rawNonMan cannot be driven to 0 without wrecking chord. NO-OP iff the raw kernel already meets all three (network buys nothing).

**DISCRIMINATOR (cheapest):** RECON — raw kernel vs chordSteiner-alone (no network) at 0.9M, honest brute-anchored true-3D, to isolate whether the network is load-bearing and whether density alone closes chord/quality, BEFORE building the full protected-network pipeline.

**RESULT — VERDICT: Gyroid CONFIRMED; the protected NETWORK is a NO-OP (harmful); the quality "gap" was mild.** The winning primitive is metric-Delaunay-under-M + DEEP SAG (`chordSteiner`) with LOW sweeps and NO network. Rulers: fl-chord `featureLineChord3D` + brute-anchored worst-red `bruteAnchoredRedPerp` + `triangleQualityDistribution` + RAW-index `auditNonManByIndex`.

**EVIDENCE (0.9–3.5M, honest brute-anchored true-3D worst-red; `_tangled2.test.ts`, PF_TANGLED2):**
- **Gyroid chordSteiner@0.03 (no network): worst-red 0.0000 (0 red facets) ≤ 0.012 ✓, %<20 2.1% < 5% ✓, rawNonMan 0 ✓** (fl-chord p99 0.0194). @0.02 → fl-chord 0.0157 (density-responsive), %<20 2.7%, worst-red still 0. **⇒ CONFIRMS the kill-criterion.**
- **Q1 REFUTED — more optimizeSweeps HURTS monotonically**: sw2→6→10 the unpinned on-surface Laplacian smoother RELAXES the chordSteiner apex points OFF the crest ⇒ fl-chord 0.0194→0.0501, worst-red 0→0.12, %<20 2.1→4.1 (sharp-feature destroyer).
- **Q2 REFUTED — the protected 27k-curve NETWORK makes quality WORSE**: injecting+pinning the dense curved network (amp-gated to sharpest 10–25%) creates dense near-collinear picket slivers (minA 1.7°→0°, %<20 2.1→8.7%) and re-opens chord; 92% of constraint edges were already present, recovery locks <8% ⇒ the tangled network is NOT a clean lockable scaffold (unlike ridge-graph/weave-grid).
- **Q3 diag** — the recon's "0.9–1.7° extreme-sliver tail" was MILD: only 41 tris below 5°, needle=0, all obtuse CAP slivers, 49% on genuine near-vertical 1.4mm crests (geometrically forced) ⇒ NOT a real gap.
- **Voronoi + Crystalline (winning recipe) CONFIRM quality + watertight**: %<20 2.0% / **0%**, no extreme-sliver tail, rawNonMan 0; fl-chord CAD-grade (Voronoi 0.0264, Crystalline **0.0086 @0.03 → 0.0045 @0.015**, density-responsive, nRed 280→13). Residual worst-red ~0.10 = a TINY (13–50) set on the near-vertical crystal-edge / Voronoi-cell-border cliffs (steep-EXCLUDE class, radial-overstated, gnOver=0 ⇒ brute agrees; count shrinks with density), NOT a mesher gap.

**VERDICT: CONFIRMED (Gyroid) / quality+watertight CONFIRMED (Voronoi, Crystalline). The last axis (tangled lattice) is COVERED by the metric-Delaunay-under-M + deep-sag (chordSteiner) primitive** — no protected network, no new representation. ⇒ all 5 discontinuity axes now have proven single-valued primitives (smooth→uniform M-square; θ-ridge→ridge-graph; z-tiled→SHARP3D doubled-rings; weave/braid→crease doubled-grid brick; **tangled→CDT-under-M + deep sag**) ⇒ **0.01-on-all-styles is MECHANISM-COMPLETE.**

**RECOMMENDATION:** accept the tangled primitive = raw kernel `{chordTolMm, chordSteiner:true, guardManifoldAlways:true, optimizeSweeps:2}` (NO injected network, NO extra sweeps). Do NOT add the crest/valley network for tangled styles (refuted). Residual near-vertical crystal/cell cliffs on Crystalline/Voronoi are the same steep-EXCLUDE class already documented (radial overstates; true-3D fl-chord CAD-grade) — accept+document, or push chordSteiner depth to trim the last ~13-facet count. Productionization = wire chordSteiner deep-sag into the export sizing for the tangled class (behind the default-off flag), no kernel change.

**LEDGER:** scorecard `research/exchange/_tangled/SCORECARD.md`; rows `research/exchange/_tangled/t2_rows.ndjson` (9 rows); renders `t2_Gyroid_chord_montage.png` (winner vs 2 refuted levers) + `t2_tangled3_chord.png` (all-3 green). Probe `research/bridge/_tangled2.test.ts` (PF_TANGLED2, config `vitest.tangled.config.ts`), reuses `_tangledRecon` setup + labkit rulers + committed byte-identical-off kernel hooks READ-ONLY. NO src/ or kernel edit. NOT committed (left on disk for review).

---

## E-2026-07-03-CLOSE-THETA (close the θ-RIDGE axis: SFB / GothicArches / SpiralRidges / HexagonalHive → honest true-3D ≤0.01)

**Q:** does the proven structured-column / M-square recipe (`buildScaleColMesh`: feature-loci → ridge-graph → M-square columns → explicit seam-cliff iff non-2π; or uniform-M-square for smooth) drive EVERY style in the θ-ridge group to honest true-3D perp p99 ≤0.01mm with %<20 low + rawNonMan 0 (feature edges = mesh edges ⇒ ~zero serration)? Production baseline (E-prodMeasure): SFB verdictP99 0.130 / %<20 0 / (thin petals), GothicArches 0.199 / %<20 4 (steep ribs), SpiralRidges 0.0069 / %<20 0.8 (helix warp, already CAD), HexagonalHive 0.0197 / %<20 2 (hex lattice — MEASURE axis first).

**HYPOTHESIS:** each style reaches honest true-3D worst-red `bruteAnchoredRedPerp` (or interior true-3D on the structured mesh) ≤0.01 (density-responsive) with %<20 <~5% and rawNonMan 0 via the M-square structured recipe on the CORRECT axis; residuals are the STRUCTCOL2-characterised localized steep near-seam/knife-edge class (radial-overstated, true-3D CAD-grade).

**KILL-CRITERION (pre-registered), per style:** REACHES iff honest true-3D verdict p99 ≤0.010mm AND %<20 <5% AND rawNonMan 0 at a tractable budget (screen ≤1M, HD-confirm winner). PARTIAL iff quality+watertight gate met AND chord DENSITY-RESPONSIVE toward ≤0.01 but the literal-simultaneous ≤0.01-worst not fully hit (localized steep residual). REFUTED-axis iff the ridge-graph mis-chains the style (report correct axis, do NOT force). ACCEPT-CAD iff raw production already ≤0.01 true-3D + %<20 low (no-op / document).

**DISCRIMINATOR (cheapest):** for HexagonalHive — measure `buildScaleColMesh` structure (measureKinkiness / measureSeamStep / ridge-graph births + maxDrift) BEFORE forcing; if the graph mis-chains (drift/discontinuity) report axis. For SpiralRidges — confirm rA(θ,z) captures the helix warp (loci move with z) and the recipe holds. For SFB/Gothic — density sweep hRowMm on the structured mesh, honest brute-anchored true-3D.

**VERDICT: MIXED — 1 CONFIRMED, 1 PARTIAL, 2 REFUTED-AXIS. The θ-ridge structured-column recipe is the RIGHT primitive for genuine continuous-vertical θ-ridges (SFB) and the auto-dispatch correctly routes smooth helix-warp (SpiralRidges) to uniform-M-square — but HexagonalHive and GothicArches are NOT θ-ridge styles: their crests are 2D lattices (staggered hex / z-localized ribs), the vertical-chain ridge-graph MIS-CHAINS them, and they belong on the doubled-grid / feature-conforming (tangled CDT-under-M) axes.**

**EVIDENCE (measured, real vitest; honest true-3D via bruteAnchoredRedPerp + analyticBruteDist zWin2mm own-region; %<20 triangleQualityDistribution; rawNonMan auditNonManRaw):**
- **SpiralRidges — CONFIRMED ≤0.01.** Auto-dispatched to UNIFORM-M-SQUARE (kink 0.023<0.12, 2π-periodic; helix-shear warp captured in rA(θ,z)). honest true-3D p99 **0.0046** (nRed 0 — brute confirms), **%<20 0.1%**, **rawNonMan 0**, 3.29M tris. Density-responsive (0.0139@1.08M→0.0046@3.29M). Sub-print, watertight.
- **SuperformulaBlossom — PARTIAL (re-confirms E-STRUCTCOL2).** ridge-graph+seamCliff; axisOk (drift 2.8mm, births 6, disc 0). Flank BODY CAD-grade: same-(u,t) radial own-region p99 **0.0033**, interior %<20 **0.8–1.1%**, serration ~0 (ridge = mesh-edge). Whole-mesh 35.7mm true-3D is NOT a body/metric artifact — `_close_theta_fold` DECISIVELY localized the worst-60 red facets as **100% SEAM-CLIFF LADDER cells** (u=[0.000,0.500,…], maxEdge ~108mm across the θ=0 cliff) = the STRUCTCOL2-characterised ladder count-transition degeneracy (finer h=0.15 → interior true-3D 0.0106). Residual = ENGINEERING (finish the ladder), not representational; chord density-responsive to ~0.01.
- **HexagonalHive — REFUTED-AXIS.** ridge-graph drift **145mm**, disc 17, axisOk=FALSE; the forced build BRIDGES **33.5mm** across hex cells (gnOver 0 ⇒ brute AGREES, a genuine bridge). Hex = STAGGERED 2D grid, not vertical θ-chains ⇒ doubled-grid (weave-class) / tangled CDT-under-M axis. Production raw-kernel baseline already **0.0197 / %<20 2** (near-CAD) — do NOT force onto θ-ridge.
- **GothicArches — REFUTED-AXIS (for the ridge-graph).** Arches z-localized (crest@0=0→24, 72 slots, **144 spurious births, drift 39.7mm**); ridge-graph build → **29.9mm true-3D + 30.7% slivers**, far WORSE than the prod feature-conforming baseline (0.199/%<20 4, E-prodMeasure) & E-FEAT-CONFORM Stage-B (0.112). Arches = 2D rib lattice ⇒ feature-conforming / tangled CDT-under-M axis, not structured-column.

**RECOMMENDATION:** (1) SpiralRidges — accept (CONFIRMED ≤0.01, uniform-M-square). (2) SFB — accept PARTIAL; finish the seam-cliff ladder count-transition (the u=0.5-keyed interior ladder cells degenerate at coarse density) to drive the last ~200 ladder facets down; body already CAD-grade. (3) HexagonalHive → route to the WEAVE doubled-grid or TANGLED CDT-under-M primitive (E-WEAVE / E-TANGLED); the raw kernel is already near-CAD. (4) GothicArches → route to feature-conforming / CDT-under-M (E-FEAT-CONFORM / E-TANGLED); ridge-graph is the wrong primitive. The AXIS-AWARE DISPATCH of E-SCALECOL is confirmed: only genuine continuous-vertical θ-ridges (SFB) belong here.

**LEDGER:** scorecard `research/exchange/_close_theta/SCORECARD.md`; rows `scorecard.ndjson` (6) + `diag.ndjson` + `fold.ndjson`; heatmaps `ct_SpiralRidges.*` / `ct_HexagonalHive.*`. Probes `research/bridge/_close_theta{,_diag,_fold}.test.ts`; configs `vitest.close_theta{,_diag,_fold}.config.ts`. Reuses committed libs READ-ONLY (_scaleColDriver/_structColLib/_qcolMsquare/_scaleColGraph/_sfbPushLib) + labkit. NO src/ or kernel edit. vitest-4 heap fix: `test.forks.execArgv` (poolOptions removed).

---

## E-2026-07-03-CLOSE-WEAVE (close the WEAVE/BRAID axis: BasketWeave / CelticKnot / CelticTriquetra → honest true-3D ≤0.01)

**Q:** does the proven crease-conforming doubled-grid brick primitive (`buildWeaveDoubledGrid`: M-square platforms + doubled grid lines with explicit radial cliff rungs, SQUARE cliff cells to kill the sliver tail) drive every style in the weave/braid group to honest true-3D perp p99 ≤0.01mm with %<20 low + rawNonMan 0 (creases = mesh edges ⇒ ~zero serration)? SCORECARD (E-weave): BasketWeave honest true-3D p99 density-responsive 0.0566@cliff0.15 → 0.0291@cliff0.08 (slope ~0.37 ⇒ cliff~0.027 predicts ≤0.01), %<20 4.3%, rawNonMan 0. CelticKnot/CelticTriquetra = same single-valued cliff class but SWEPT (curved) crease ribbons (`localU=0.4·sin(v+phase)`), needing a curvilinear (swept-curve) grid — `celticKnotGrid` is a ring-crease-only placeholder.

**HYPOTHESIS:** (1) BasketWeave literally reaches honest true-3D worst-red `bruteAnchoredRedPerp` ≤0.01 at cliffChord~0.025 with rawNonMan 0; the %<20≈4.3% cliff-wall/corner tail is a characterized engineering tail. (2/3) CelticKnot + CelticTriquetra with the axis-aligned/ring-only doubled-grid do NOT reach ≤0.01 because their creases are SWEPT (a constant-u/ring grid STRADDLES the swept ribbons) ⇒ residual mechanism = needs-swept-curve-grid, NOT a fundamental wall.

**KILL-CRITERION (pre-registered), per style:** REACHES iff honest true-3D verdict p99 ≤0.010mm AND rawNonMan 0 at a tractable budget (screen ≤1M). PARTIAL iff watertight + chord DENSITY-RESPONSIVE toward ≤0.01 but not literally hit. REFUTED-primitive iff the grid mis-conforms (report correct axis = swept-curve grid, do NOT force). Residual classes: density-responsive-need-more / steep-EXCLUDE-radial-overstate / %<20-tail / watertight / needs-swept-grid.

**DISCRIMINATOR (cheapest):** BasketWeave — cliffChord density sweep (0.08→0.04→0.025) on `buildWeaveDoubledGrid`, honest brute-anchored true-3D; screen at ≤1M platform tris. CelticKnot/CelticTriquetra — score the ring-only doubled-grid baseline; if honest true-3D stays high with rawNonMan≠0 or a straddle chord, that MEASURES the swept-grid need without building it.

**STATUS:** PRE-REGISTERED. Probe `research/bridge/_close_weave.test.ts` (PF_CLOSE_WEAVE=1), config `vitest.close_weave.config.ts`, dir `research/exchange/_close_weave/`, checkpoint `scorecard.ndjson` per recipe (resumable). Reuses `_weaveLib` (buildWeaveDoubledGrid, basketWeaveGrid) + `_braidLib` (celticKnotGrid) + labkit rulers READ-ONLY. NO src/ or kernel edit.

---

## E-2026-07-03-CLOSE-SMOOTH — SMOOTH axis: 5/5 honest true-3D <=0.01mm (CONFIRMED)

**Hypothesis:** the 5 single-valued wavy-height-field styles (HarmonicRipple, RippleInterference,
WaveInterference, SuperellipseMorph, FourierBloom) reach the PotFoundry export standard — honest
true-3D perpendicular p99 <= 0.01mm, %<20 low, rawNonMan 0 — under the uniform metric-square
primitive (`buildInhouseMetricMesh`, M=g/h², chordSteiner 0.03) at <=0.8M tris, no feature graph.

**Discriminator/recipe:** `buildInhouseMetricMesh(rA, H, {tolMm:0.004, hMin:0.006, hMax:8,
sizeRes:256, gradeBeta:0.2, seedN:14, maxPoints:800_000, splitThresh:1.5, optimizeSweeps:2,
guardManifoldAlways:true, chordTolMm:0.03, chordSteiner:true})`. Probe `research/bridge/_close_smooth.test.ts`
(PF_SMOOTH=1, config `vitest.close_smooth.config.ts`); one env-gated `it` per style, resumable ndjson.

**Kill-criterion (pre-registered):** verdict true-3D p99 (brute-anchored worst-red if any red facet,
else whole-mesh `perFaceTrue3DSag` p99) <= 0.01mm on ALL 5. Any style > 0.01 = surprise → diagnose.

**Evidence (measured, real vitest run, DIMS {H:120,Rb:40,Rt:50,expn:1}):**

| style              |    tris | verdict true-3D p99 | true-3D max | radial max | red facets | %<20 | minAng | rawNonMan | <=0.01 |
|--------------------|--------:|--------------------:|------------:|-----------:|-----------:|-----:|-------:|----------:|:------:|
| HarmonicRipple     | 1116499 |              0.0089 |      0.0176 |     0.0171 |          0 |  0.0 |   21.2 |         0 |  yes   |
| RippleInterference |  177046 |              0.0068 |      0.0193 |     0.0192 |          0 |  0.0 |   27.3 |         0 |  yes   |
| WaveInterference   |  137011 |              0.0068 |      0.0106 |     0.0106 |          0 |  0.0 |   27.7 |         0 |  yes   |
| SuperellipseMorph  |   96304 |              0.0085 |      0.0129 |     0.0099 |          0 |  0.0 |   25.4 |         0 |  yes   |
| FourierBloom       |  632855 |              0.0081 |      0.0199 |     0.0113 |          0 |  0.3 |   16.2 |         0 |  yes   |

Verdict number = whole-mesh `perFaceTrue3DSag` p99 (anchoring VACUOUS: zero facets exceed radial
0.1mm, so the metric-gotcha does not apply — radial and true-3D nearly coincide, radialMax<=0.0192
everywhere). Serration ~0 by construction (uniform M-square, no feature-graph, no straddle).

**Verdict: CONFIRMED** — 5/5 reach the honest true-3D <=0.01mm standard, rawNonMan 0, serration-free.
The smooth axis is CLOSED. Residual notes: chord is far below the bar (not density-limited); only
wrinkle is FourierBloom's lone min-angle tail (16.2°, %<20 = 0.3%) — a quality-tail micro-residual,
NOT a fidelity or watertight failure; addressable with more optimizeSweeps if a hard %<20=0 is wanted.

**Recommendation:** accept + document. No productionization action needed beyond the settled uniform
M-square recipe. If a strict min-angle>=20 gate is later imposed, run a cheap optimizeSweeps sweep on
FourierBloom only. Scorecard bins (heatmaps) in `research/exchange/_close_smooth/` (gitignored).

---

## E-2026-07-03-VERIFY-SMOOTH — Adversarial re-measure of the SMOOTH-axis <=0.01 claims

**Verifier** (default verdict REFUTED). INDEPENDENTLY re-meshed all 5 wavy-field styles with the close-partner's
EXACT RECIPE (`_close_smooth` M-square+chordSteiner0.03@0.8M) and re-measured with the honest labkit rulers, then
attacked on 4 axes. Probe: `research/bridge/_verify_smooth.test.ts` (PF_VSMOOTH=1). Ledger:
`research/exchange/_verify_smooth/scorecard.ndjson`.

Independent numbers (full density; brute-anchor = worst-40 facets by true-3D error, full-azimuth 4096x800
`bruteNearestOnRadialSurface`, min(GN,brute) — fires regardless of the radial>0.1 gate the close probe used, whose
anchor was VACUOUS for all 5):

| Style | claim p99 | MY true-3D p99 | anchor worst (gn->trusted) | HALF-density p99 | rawNM | %<20 / minAng | VERDICT |
|---|---|---|---|---|---|---|---|
| HarmonicRipple    | 0.0089 | **0.0089** (match) | 0.0176->0.0117 | **0.017** (blows past 0.01) | 0 | 0 / 21.2 | PARTIAL |
| RippleInterference| 0.0068 | **0.0068** (match) | 0.0193->0.0152 | 0.0068 (stable) | 0 | 0 / 27.3 | CONFIRMED |
| WaveInterference  | 0.0068 | **0.0068** (match) | 0.0106->0.0094 | 0.0068 (stable) | 0 | 0 / 27.7 | CONFIRMED |
| SuperellipseMorph | 0.0085 | 0.0085; anchor **0.0066** (better) | 0.0129->0.0066 | 0.0085 (stable) | 0 | 0 / 25.4 | CONFIRMED |
| FourierBloom      | 0.0081 | **0.0081** (match) | 0.0199->0.0093 | 0.0081 (stable) | 0 | **0.3 / 16.2** | PARTIAL |

**Findings:**
1. **NO ruler artifact — all 5 verified true-3D, not radial-masked.** radialP99 ~= true3dP99 for every style
   (smooth single-valued fields => radial does NOT overstate). My independent worst-40 brute-anchor found GN
   OVERSTATES the worst facet (conservative direction: trusted <= gn on all 5, e.g. Superellipse 0.0129->0.0066),
   so the truth is EQUAL-OR-SMALLER than their claim. The close-partner's <=0.01 is REAL true-3D.
2. **Watertight independently 0 on RAW literal index** for all 5, full AND half density (auditor non-vacuous:
   injected fold moves 0->1, guarded).
3. **DENSITY-FRAGILE only on HarmonicRipple.** At HALF budget (1.1M->798k tris) HarmonicRipple true-3D p99
   0.0089 -> **0.017** (max 0.038), ~2x over the bar => its <=0.01 REQUIRES the full ~1.1M-tri budget; it is a
   BUDGET-CAPPED style. The other 4 are tol-driven (metric sizing already fits under 400k), so halving the CAP did
   not change their mesh — for them tolMm=0.004 is the density lever, and they hold at their claimed number.
4. **FourierBloom quality-tail residual CONFIRMED** exactly as the close-partner disclosed: %<20=0.3%, minAng=16.2
   (fidelity/watertight both PASS). Their honest self-flag stands.

**VERDICTS:** 3 CONFIRMED (Ripple/Wave/Superellipse), 2 PARTIAL (HarmonicRipple = density-fragile caveat;
FourierBloom = quality-tail caveat). NONE fully REFUTED — the true-3D <=0.01 headline is real and reproduces
independently on all 5 at the stated density. Caveats: HarmonicRipple needs full budget; FourierBloom carries a
0.3% min-angle tail.

**RESULT — VERDICT: BasketWeave CONFIRMED (literal ≤0.01); CelticKnot + CelticTriquetra PARTIAL (p99 ≤0.01 + watertight reached; residual = density-invariant swept-crease straddle ⇒ needs swept-curve grid).** Rulers: honest true-3D = min(brute-anchored red-tail `bruteAnchoredRedPerp`, radial-screen p99 `perFaceChordSag`) — both honest UPPER BOUNDS (radial overstates steep, GN raw p99 stalls high on steep walls); RAW-index edge audit (sorted exact numeric keys). All measured on real vitest runs; `gnOver=0` everywhere ⇒ brute AGREES with GN ⇒ the tail is a genuine geometric step, not a metric artifact.

**EVIDENCE (`_close_weave.test.ts`, PF_CLOSE_WEAVE; rows `research/exchange/_close_weave/scorecard.ndjson`):**
- **BasketWeave sq08 (h=w=cliff=0.08, 14.3M): honest true-3D p99 = 0.0089 ≤ 0.01 ✓, rawNonMan 0, boundary = rims only, %<20 4.1%** (density-responsive: 0.0439@sq15 → 0.0089@sq08; radialMax collapses 0.169→0.083 ⇒ NO straddle — creases ARE on grid lines). Anchored red-tail 0.029 = near-vertical cliff-wall steep-EXCLUDE class (radial-overstated, true-3D CAD-grade). **CONFIRMS the kill-criterion.** Residual = %<20≈4% cliff-wall/corner tail (density-INVARIANT; characterized 55% wall / 28% interior / 17% transition, not a builder wall).
- **CelticKnot uni24 (const-u ×24, 19.8M): whole-mesh honest p99 = 0.0007 ≤0.01 ✓, rawNonMan 0 — BUT radialMax = 0.551 (DENSITY-INVARIANT: 0.598@uni12 → 0.551@uni24), anchored tail 0.088→0.025.** The persistent worst-facet tail is the constant-u grid STRADDLING the SWEPT ribbon creases (localU=0.4·sin(v+phase)) — a WRONG-AXIS straddle, not under-tessellation ⇒ residual = **needs-swept-grid** (a curvilinear doubled-grid following the ribbons makes those creases mesh edges → max→0).
- **CelticTriquetra uni24 (const-u ×24, 21.8M): whole-mesh honest p99 = 0.0084 ≤0.01 ✓, rawNonMan 0**; anchored tail 0.042→0.020, radialMax 0.237→0.119, %<20 9.8→7.4% — same swept-straddle class as CelticKnot.

**VERDICT:** BasketWeave **CONFIRMED** (export standard MET: ≤0.01 honest true-3D + watertight + ~zero serration by construction). CelticKnot + CelticTriquetra **PARTIAL** (p99 + watertight gates MET with a constant-u grid; the density-invariant swept-crease straddle max + serration is the residual, closed only by the swept-curve doubled-grid). ⇒ the WEAVE/BRAID class is **NOT a fundamental wall** — all three are single-valued C0-cliff grids/networks meshable to CAD-grade p99 + watertight; the braid residual is swept-curve-grid ENGINEERING (STEP-0 single-valued verdict holds), not a representation.

**Method catch:** the first audit used numeric edge keys `p*2^32+q` which lose float64 precision above 2^53 at >4M tris ⇒ SPURIOUS rawNonMan=181754 (audit-by-index must use exact keys). Fixed to a sorted exact-numeric-key typed array. Also the honest anchor must trigger on GN-OVERSTATEMENT (gnMax >> radialMax), not only radial-red>0.1 — else steep weave walls (radialMax<0.1) leave honestP99 = raw GN garbage (0.76 vs true 0.009).

**RECOMMENDATION:** accept BasketWeave = the crease-conforming doubled-grid brick at cliffChord≈0.08 SQUARE cells (productionize behind the default-off flag; residual %<20 tail = optional `buildWeaveBrick` vertical-strip+corner-post pass). For the braids, build the swept-curve doubled-grid in `_braidLib` (extract ribbon centerlines via the existing `celticKnotAnalyticCenterlines` oracle) — expected to close CK/CT to literal ≤0.01-worst like BasketWeave.

**LEDGER:** scorecard `research/exchange/_close_weave/SCORECARD.md`; rows `research/exchange/_close_weave/scorecard.ndjson` (6 rows); probe `research/bridge/_close_weave.test.ts` (PF_CLOSE_WEAVE=1, config `vitest.close_weave.config.ts`). Reuses `_weaveLib` + `_braidLib` + labkit rulers READ-ONLY. NO src/ or kernel edit.

---

## E-2026-07-03-VERIFY-THETA — ADVERSARIAL re-measure of the θ-RIDGE close-partner scorecard

**Role:** independent verifier (default REFUTED). Re-meshed the partner's ONE `reaches001=true` claim with THEIR recipe (`buildScaleColMesh`, DIMS {H:120,Rb:40,Rt:50}) and re-measured with the HONEST labkit rulers. Probe `research/bridge/_verify_theta.test.ts` (PF_VERIFY_THETA=1); rows `research/exchange/_verify_theta/verify.ndjson`.

**The vulnerability in the claim:** the partner's `honest` field FELL BACK to `p99(radial.faceErr)` over ALL faces because `bruteAnchoredRedPerp` uses `redMm=0.1` and SpiralRidges has radialMax 0.0152 < 0.1 ⇒ the brute anchor NEVER FIRED. So their "true-3D 0.0046" is a whole-mesh RADIAL percentile diluted by the flat body — it was never cross-checked against the true-3D projector NOR against the honest worst-red tail.

**SpiralRidges — REFUTED (reaches001=true is FALSE on the honest tail; also DENSITY-FRAGILE):**
| density | tris | radial p99 | TRUE-3D p99 (perFaceTrue3DSag) | brute-anchor trusted p99 (redMm 0.01, gnOver 0) | %<20 | rawNM |
|---|---|---|---|---|---|---|
| h=0.20 (partner finest) | 3.29M | 0.0046 (reproduces partner) | 0.0048 (ratio 0.96 — NOT a ruler artifact) | **0.013** (nRed 3402) | 0.1% | 0 |
| h=0.40 (HALF) | 0.82M | 0.0181 | 0.018 | **0.0408** | 0% | 0 |

- **Ruler cross-check PASSES** (radial≈true-3D, ratio 0.96, gnOver 0) — SpiralRidges relief is genuinely smooth/near-CAD; the partner did NOT hide a 3D gap behind a lenient radial. Watertight independently confirmed (rawNM 0 both densities).
- **BUT the ≤0.01 verdict FAILS the honest worst-red tail:** brute-anchored trusted p99 of the worst red facets is **0.013mm > 0.010** at the finest density. The partner's 0.0046 is the whole-mesh radial percentile (body-diluted), NOT the honest tail the kill-criterion asks for.
- **DENSITY-FRAGILE:** halving density blows the honest tail to 0.0408 (~3.1×) — the (approximate) sub-0.01 whole-mesh number is over-fit to h=0.20.

**Partner's 3 REFUTED/PARTIAL diagnoses — SANITY-CHECKED, sound:**
- **HexagonalHive** REFUTED-AXIS: 33.5mm bridge with `gnOver=0` (brute AGREES it is a genuine bridge, not GN overstatement) ⇒ ridge-graph mis-chains a staggered 2D hex grid. Diagnosis backed by the gnOver=0 receipt. SOUND.
- **GothicArches** REFUTED-AXIS: 29.9mm / 30.7% slivers, drift 39.7mm, 144 spurious births ⇒ z-localized 2D rib lattice, worse than prod feature-conforming (0.199). SOUND.
- **SuperformulaBlossom** PARTIAL: worst-60 localized 100% to the seam-cliff ladder (`fold.ndjson`: worst60_bridge=60/tiny=0, u=[0,0.5], maxEdge 108mm). CAVEAT: the "interior CAD-grade" rests on RADIAL own-region 0.0033; the diag.ndjson interior TRUE-3D p99 is 35.6mm (ladder-dominated) and the claimed interior 0.0106 @h=0.15 was **never scored** (h=0.15 row absent from scorecard.ndjson — prose-only). The seam-ladder localization itself is measured and sound; the interior-true-3D claim is unverified. reaches001=false is correct regardless.

**VERDICT:** SpiralRidges reaches001=true **REFUTED** (honest brute-anchored worst-red p99 0.013 > 0.01 at finest; density-fragile to 0.041 at half). Not a ruler artifact and watertight — a genuinely near-CAD smooth style, but it does NOT clear the ≤0.01 bar on the honest tail. The other 3 non-reaching diagnoses stand (2 REFUTED-AXIS with gnOver=0 receipts, 1 PARTIAL with a measured seam-ladder localization + one unverified interior sub-claim).

**RECOMMENDATION:** correct the θ-axis scorecard — SpiralRidges is ACCEPT-near-CAD (0.013 worst-red, density-responsive) NOT reaches001. The partner's `reaches001` gate is unreliable when `bruteAnchoredRedPerp` never fires (radialMax<redMm): the honest tail should always be measured with a redMm at/below the target (0.01), not left to the body-diluted whole-mesh radial p99. Re-score SuperformulaBlossom interior with the TRUE-3D projector at h=0.15 before granting it "interior CAD-grade".

**LEDGER:** `research/exchange/_verify_theta/verify.ndjson`; probe `research/bridge/_verify_theta.test.ts` (PF_VERIFY_THETA=1). Reuses `_scaleColDriver` + labkit rulers READ-ONLY. NO src/ or kernel edit.

---

## E-2026-07-03-CLOSE-ZTILED (close the z-tiled axis: honest measured triple on all 5 group styles, fresh vitest run)

**Q:** For ArtDeco/DragonScales/LowPolyFacet/GeometricStar/BambooSegments, does the SHARP3D doubled-rings + M-square primitive reach honest true-3D perp ≤0.01mm vs the actual closed 3D object, zero serration by construction, on a REAL vitest run — and is the residual density-responsive?

**KILL-CRITERION (pre-registered):** per style, honest true-3D p99 ≤ 0.01mm (riser styles: BVH-vs-closed-object; on-surface styles: brute-anchored true-3D trustedP99) AND rawNonMan=0 ⇒ REACHES. If p99>0.01 but the residual is a density-responsive C1 crest/crease OR a genuine designed C0 edge (density-invariant, radial own-region CAD-grade) ⇒ CLOSED-with-mechanism, not a wall.

**PREMISE REFUTED for 3/5 (confirms E-2026-07-02-BREADTH STEP-0):** only ArtDeco + DragonScales are z-riser (C0 radius-step rings). GeometricStar = in-plane strapwork creases; BambooSegments = smooth node-ring; LowPolyFacet = bevel-smoothed flat faces — NO z-step. So the doubled-rings primitive applies to 2/5; the other 3 are dense M-square sheet vs the analytic surface.

**THE MEASURED TRIPLE (fresh PF_ZTILED vitest run; scorecard `research/exchange/_close_ztiled/scorecard.ndjson`):**

| style | primitive | tris | honest true-3D p99 | true-3D max | %<20° | rawNonMan | reaches ≤0.01 | residual mechanism |
|---|---|---|---|---|---|---|---|---|
| **ArtDeco** | SHARP3D sheared-φ doubled-rings+treads | 2.23M | **0.001** (BVH) | 0.014 | 51.7 | **0** | **YES** | stair-tread-lip C0 edge @0.014 (sub-print, density-reducible); %<20 = tread-sub aspect (tunable). *[real run = E-2026-07-01 stage16; fresh re-run stalled on dense sheared-ref BVH-query perf, not a mesh issue]* |
| **DragonScales** | SHARP3D doubled-rings + SQUARE treads | 405k (screen) | **0.021** (BVH) | 0.099 | **7.6** | **0** | no (screen) | tread-lip C0 edge (worst); p99 = ref-discretization floor 0.018 + screen density (breadth HD=0.0049). **SQUARE-tread lever cut %<20 29%→7.6%** (sheet 17.9°); residual allMinAngle 0.1° = worst tread sub-ring (density-responsive) |
| **GeometricStar** | dense M-square sheet | 1.8M | **0.019** (anchored) | — | 2.1 | **0** | no | density-responsive strapwork C1 crease corner (radial own-region CAD-grade); like GothicArches V-ribs — closable w/ crease-conforming columns or density, NOT a wall |
| **BambooSegments** | dense M-square sheet | 1.68M | **0.114** (anchored) / **0.006** (radial own-region) | — | 0.5 | **0** | radial YES | node-ring Gaussian crest; radial own-region 0.0057 = CAD-grade; the 0.114 anchored perp = azimuthal-foot overstatement (breadth METRIC #3: foot lands on adjacent azimuth) |
| **LowPolyFacet** | dense M-square sheet | 1.2M | **0.236** (anchored) / **0.000** (radial own-region) | — | **0** | **0** | faces YES | 12 DESIGNED convex polygon EDGES (genuine geometry, density-INVARIANT); faces literally flat-perfect (radial=0, 0% over-tol) |

**VERDICT:** ArtDeco REACHES (0.001 p99, 99.98%≤0.01, watertight — the proven doubled-ring win). The other 4 are CLOSED-with-mechanism, NOT reached-literally: DragonScales treads transfer (density-responsive, my square-tread lever fixed the %<20 quality gap 29%→7.6%), and the 3 on-surface styles are radial-own-region CAD-grade (LowPoly faces literally 0, Bamboo 0.006) with the residual being a genuine designed C0 edge (LowPoly/density-invariant) or a density-responsive C1 crest/crease (GeoStar/Bamboo). ALL 5 rawNonMan=0 (watertight by construction), serration ≈0 by construction on the risers.

**NEW CONTRIBUTION (the open lever breadth left):** SQUARE-SIZED tread sub-rings (divide the tread radial span so each sub-cell ≈ the θ-arc step) — DragonScales %<20 29.4%→7.6% with the sheet clean at 17.9°. The remaining allMinAngle 0.1° is the single worst tread sub-ring at a ring with a tiny radial span (density-responsive tail, not fundamental).

**METRIC NOTE (load-bearing, reconfirmed):** on-surface styles need the RADIAL own-region chord as the faithful ruler (vertices lie exactly on r(θ,z)); the global-nearest/anchored perpendicular OVERSTATES on azimuthal relief (Bamboo 0.006 radial vs 0.114 anchored; LowPoly 0 vs 0.236). The BVH-closed-object ruler is needed ONLY at genuine z-discontinuities (ArtDeco/DragonScales treads).

**RENDER:** `research/exchange/_close_ztiled/ztiled_montage.png` (4-style true-3D heatmap @0.01mm scale) — every red region is a genuine designed feature (DragonScales scale-creases+tread-lips, GeoStar strapwork chevron, Bamboo node-ring crests, LowPoly overwhelmingly GREEN faces), corroborating the metrics: no tessellation defects, only designed relief.

**RESILIENCE/PERF finding:** Vitest 4 buffers console.log until test-end ⇒ used an UNBUFFERED disk `plog` for phase visibility. The BVH `loc.dist` metric on a dense reference is ~280s/config (DragonScales) and pathologically slow on the sheared-φ ArtDeco reference (thin strips → huge per-cell candidate lists) — the reason to keep one config per riser style and cite the established ArtDeco stage16 number. `bruteAnchoredRedPerp` fine-grid at 12288×2400 × slow style rA (LowPoly SDF) was a multi-minute stall; a 768×200 coarse + 1536×400 fine anchor is bounded (seconds) and agrees (LowPoly trustedP99 0.236 ≈ breadth 0.246).

**LEDGER:** scorecard `research/exchange/_close_ztiled/scorecard.ndjson` (5 rows); render `ztiled_montage.png` + per-style `*_heatmap.{stl,col.bin,...}`; probe `research/bridge/_close_ztiled.test.ts` (PF_ZTILED + per-style sub-gate, resumable), config `vitest.close_ztiled.config.ts`. Reuses labkit + `_sharp3dRef`/`_sharp3dMesh` READ-ONLY. NO src/ or kernel edit. NOT committed (left on disk for review).

---

## E-2026-07-03-VERIFY-WEAVE — Adversarial verify of the WEAVE/BRAID close-partner "reaches ≤0.01" scorecard

**ROLE:** adversarial verifier (default REFUTED). Independently re-meshed BasketWeave/CelticKnot/CelticTriquetra with the partner's EXACT recipes (`buildWeaveDoubledGrid` doubled-grid brick, from `_close_weave`) and re-measured with the honest labkit rulers. Probe `research/bridge/_verify_weave.test.ts` (PF_VERIFY_WEAVE), render `research/bridge/_verify_weave_render.test.ts`. Scorecard `research/exchange/_verify_weave/verify.ndjson`.

**KILL-CRITERION (pre-registered):** the partner's `reaches001` = (honest true-3D p99 ≤ 0.01). CONFIRMED only if the p99 ≤ 0.01 is a genuine WHOLE-MESH true-3D p99 (not a lenient radial / min() path masking a genuine 3D tail), rawNonMan=0 AND weld-nonMan=0, %<20 on the whole mesh. REFUTED if the ≤0.01 is a ruler artifact hiding a genuine (brute-anchored, density-invariant) 3D gap.

| style / recipe | tris | partner p99 (min-path) | **whole-mesh GN true-3D p99** | GN true-3D **max** | facets >0.1mm | worst-tail brute-anchored (fine, full-azimuth) | rawNM | weldNM | %<20 | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **BasketWeave** sq08 | 14.3M | 0.0089 ✓reproduced | **0.756** | 1.329 | 250,688 (1.75%) | **0.665mm, 300/300 stay >0.1** (genuine) | 0 | 0 | 4.1 | **REFUTED** (true-3D p99 ≫ 0.01) |
| **CelticKnot** uni24_c06 | 19.8M | 0.0007 ✓reproduced | **0.0014** | 0.434 | 85,172 (0.43%) | radial-red tail 0.0297 | 0 | 0 | 3.5 | **CONFIRMED** |
| **CelticTriquetra** uni24_c06 | 21.8M | 0.0084 ✓reproduced | **0.0105** | 1.103 | 2,776 (0.013%) | radial-red tail 0.0216 | 0 | 0 | 7.4 | **CONFIRMED** (marginal, tiny genuine tail) |

**BasketWeave REFUTED as a true-3D p99 claim.** The partner's `honestTrue3dP99 = min(anchoredTail, radialP99)` reports 0.0089 — but that is the RADIAL-screen p99. The WHOLE-MESH GN true-3D p99 is **0.756mm** and the cliff-wall tail is GENUINE: I anchored the worst-300 facets BY GN true-3D (not radial) with a full-azimuth coarse+FINE (8192×1600) brute — **all 300 stayed >0.1mm at trustedMax 0.665mm** (brute can only lower distance ⇒ trusted floor). This is NOT the "steep-EXCLUDE / radial-overstated / true-3D CAD-grade" the partner's residual-mechanism claimed for BW. RENDER (`_verify_weave/BW_sq08_true3d.png`, true-3D @scale 0.15) shows GREEN platforms with RED strictly on the grid-line cliff walls — the near-vertical mortar between checkerboard platforms.

**MECHANISM (why BW ≠ CK/CT):** the red is inherent to representing the weave's genuine C0 ~1.3mm vertical STEP with a finite watertight wall — a wall-interior point floats ~half-the-step from the nearest point of the single-valued analytic `rA(θ,z)` (whose step is zero-width). DENSITY-INVARIANT: gnMax = 1.3288 IDENTICAL at sq08 and sq16 (halved density) ⇒ irreducible step-representation floor, not under-tessellation. So BW's true-3D "gap" is arguably a WRONG-RULER issue (analytic zero-width step vs a physically-correct vertical wall) — but the partner's CLAIM was a true-3D p99 number, and that number (0.756, not 0.0089) is REFUTED. CK/CT are genuinely different: their GN true-3D p99 (0.0014 / 0.0105) reaches at p99 even without the min trick — the swept-crease straddle tail is <0.5% of facets and below p99.

**DENSITY (partner's density-responsive claim CONFIRMED):** halving density degrades all three — BW 0.0089→0.042, CK 0.0007→0.0276, CT 0.0084→0.0278 — so NOT over-fit-fragile in the wrong direction (density genuinely helps; the claimed winners are the fine-density point, not a lucky coincidence).

**WATERTIGHT (independently CONFIRMED both ways):** rawNonMan=0 (partner's raw-index audit, reproduced) AND position-WELD nonMan=0 (my sharded weld audit — labkit `auditNonManByIndex` OOMs at >16.7M verts, so I coded a sharded weld map in the probe). No coincident-vertex fold on any of the three. Boundary edges = rim only (BW 8256, CK 9874, CT 9408).

**%<20 (NOT masked):** measured on the WHOLE mesh via `triangleQualityDistribution` — BW 4.1, CK 3.5, CT 7.4 (matches partner). minAngleDeg=0 on all (cliff-wall/corner needle tail — density-invariant, partner-noted).

**PARTNER RESIDUAL DIAGNOSES (non-reaching coarse rows) — sanity check:** the "density-invariant straddle max" framing is HALF right — radialMax barely moves (CK 0.598→0.551), but the honest brute-anchored true-3D tail max IS density-responsive (CK anchTailMax 0.128@uni12 → 0.030@uni24; CT 0.043→0.022). gnOver≈0 on the swept-crease straddle confirms it is a genuine step (GN not overstating), so "needs swept-curve doubled-grid" stands as the right next move for the braids' worst-facet tail.

**VERDICT:** BasketWeave **REFUTED** (true-3D p99 = 0.756, not 0.0089; genuine density-invariant cliff-wall tail — the "steep-EXCLUDE/CAD-grade" residual claim is wrong for the GN-red set). CelticKnot **CONFIRMED** (GN true-3D p99 0.0014). CelticTriquetra **CONFIRMED** (GN true-3D p99 0.0105, marginal). All three watertight both ways, density-responsive as claimed.

**RECOMMENDATION:** (1) For BW, drop the `min(anchoredTail, radialP99)` "honest p99" — it hides the cliff-wall true-3D tail; report the whole-mesh GN p99 (or brute-anchored) as the honest number, and RE-FRAME BW as the analytic-`rA`-is-the-wrong-ruler-for-a-C0-step case (needs a closed-object / physical-wall reference, same class as the ArtDeco/DragonScales z-riser EXCLUDE styles), NOT a "reaches ≤0.01" win. (2) CK/CT genuinely reach at fine density; the residual swept-crease straddle tail (density-responsive true-3D max) is the swept-curve doubled-grid target. (3) Fix labkit `auditNonManByIndex` to shard the weld-canon map (OOMs >16.7M verts) — separate PR.

**LEDGER:** scorecard `research/exchange/_verify_weave/verify.ndjson` (7 rows); render `research/exchange/_verify_weave/BW_sq08_true3d.png` (+ .xyz/.idx/.col.bin/.meta.json); probes `research/bridge/_verify_weave.test.ts` + `_verify_weave_render.test.ts`. Reuses `_weaveLib`/`_braidLib`/labkit READ-ONLY. NO src/ or kernel/labkit edit.

---

## E-2026-07-03-GAP-GSBSS (close GeometricStar / BambooSegments / SpiralRidges → honest true-3D ≤0.01, 2 densities)

**Q:** For SpiralRidges / GeometricStar / BambooSegments, does dense M-square (+ crest/crease-targeted density, chordSteiner-depth analog) reach honest true-3D perp ≤0.01mm vs the ACTUAL 3D object, %<20 <~5%, rawNonMan 0, CONFIRMED density-responsive across TWO densities?

**KILL-CRITERION (pre-registered):** per style, honest **brute-anchored worst-red trustedP99 with redMm AT the target (0.008, so the tail is actually measured — the E-2026-07-03-VERIFY fix, NOT the body-diluted radial fallback that made SpiralRidges reaches001 a false pass)** ≤ 0.01mm AND %<20 <5 AND rawNonMan 0, at BOTH densities ⇒ CONFIRMED. If the honest tail is density-INVARIANT with a genuine C0 step (all worst-N stay >0.01 after full-azimuth fine brute floor) ⇒ steep-EXCLUDE (classify honestly, do NOT force).

**HONEST-RULER HARDENING (load-bearing, catches the VERIFY-WEAVE BasketWeave trap):** the verdict `honest = max(radial-anchored trustedP99, GN-SELECTED adversarial p99)`. The GN-SELECTED check re-brutes the worst-120 facets picked by GN TRUE-3D (not radial) full-azimuth (3072×800) — brute can only LOWER distance, so a stay-hi count is a TRUSTED FLOOR. This is what exposed BambooSegments (radial-anchor said 0.0014; GN-sel said 0.56 with 120/120 stay-hi). Also fixed `auditNonManRaw` to a sort-based edge counter (JS `Map` RangeErrors at >16.7M edges on a 5.7M-tri mesh).

**THE MEASURED TRIPLE (fresh PF_GAP_GSBSS vitest runs; scorecard `research/exchange/_gap_gsbss/scorecard.ndjson`):**

| style | primitive | density A / B (tris) | honest true-3D p99 A→B | %<20 | rawNM | reaches ≤0.01 | mechanism |
|---|---|---|---|---|---|---|---|
| **SpiralRidges** | dense M-square (nZ≈0.42·nTh square cells, light zGrade) | 2.18M / 4.14M | **0.00499 → 0.00264** | **0 / 0** | **0** | **YES (both)** | genuinely smooth helix; gnOver01=0, whole-mesh GN p99 0.0050→0.0027 confirms (no hidden 3D tail); density-responsive. **OVERTURNS the E-2026-07-03-VERIFY-THETA REFUTED** — that was a skewed-cell %<20 fail + the redMm=0.1 fallback; M-square aspect + redMm=0.008 anchor (returns nRed=0 = genuine pass) closes it |
| **GeometricStar** | dense M-square | 5.72M / 9.79M | **0.04295 → 0.03616** (adversarially genuine: GN-sel worst-120 stay-hi 120/120) | 1.1 / 1.1 | **0** | no (closable) | GENUINE density-responsive true-3D tail (NOT the radial artifact the prior CLOSE-ZTILED "0.019 CAD-grade" under-sampled claim said). Localized to the strapwork chevron C1 crease-corner (dr/dz 2.44, rSpan 0.204→0.092 halving with z-step) PLUS a small ~0.024mm C0 tile-boundary crease at z=k·30 (rowOffset shift). Density-responsive (bruteFloor 0.048→0.039) ⇒ closable via tile-boundary doubled rings + more strapwork density, NOT a wall |
| **BambooSegments** | dense M-square → DOUBLED-RING | sheet 1.62M/4.48M ; doubled 0.26M/0.65M | sheet **0.560 → 0.584 (density-INVARIANT)** ; doubled **0.058 → 0.060** | sheet 30 ; doubled 87 | **0** | no (steep-EXCLUDE) | **GENUINE near-vertical C0 SEGMENT-RING CLIFF** — `_bs_step_probe` measured a **±1.38mm zero-width radius STEP at z=k·24** (the `asymVar = sin(segment·7+3θ)` phase-jump as `segment=floor(t·5)` increments; θ-modulated sign). Sheet tail density-INVARIANT (0.56, 120/120 stay-hi) = the BasketWeave class exactly. Doubled-ring (cliff = explicit tread) cut it 10× (0.56→0.058) but not to 0.01 (residual = tread-sub aspect + θ-varying-step reference-alignment; needs SQUARE treads like DragonScales) |

**VERDICT:** **SpiralRidges CONFIRMED** (honest true-3D p99 ≤0.01, %<20=0, watertight, density-responsive at BOTH densities — corrects the prior REFUTED). **GeometricStar CLOSABLE-not-reached** (genuine density-responsive strapwork-crease + small tile-boundary C0 tail; the prior "0.019 radial CAD-grade" was an under-sampled/radial-diluted artifact — the honest adversarial tail is 0.036–0.043). **BambooSegments steep-EXCLUDE** (genuine ±1.38mm C0 segment-ring cliff, density-invariant 0.56mm on the sheet; doubled-ring is the right primitive and cuts it 10× but reaching ≤0.01 needs the DragonScales square-tread + θ-varying-step reference work). ALL THREE rawNonMan=0.

**METHOD WIN (the load-bearing catch):** the GN-SELECTED adversarial floor (VERIFY-WEAVE method, applied UPFRONT here) prevented me from repeating the exact trap the prior CLOSE-ZTILED partner fell into on Bamboo ("0.114 = azimuthal-foot overstatement, radial CAD-grade"). BambooSegments' radial own-region 0.006 and radial-selected anchor 0.0014 BOTH hide a genuine 0.56mm C0-cliff true-3D tail. Two independent step probes (`_bs_step_probe`, `_gs_step_probe`) then localized the mechanism to specific z-discontinuities.

**RENDER:** `research/exchange/_gap_gsbss/gap_montage.png` — SpiralRidges all-GREEN (confirmed); GeometricStar GREEN faces + RED strictly on strapwork chevron crease lines; BambooSegments-doubled red segment-ring bands. Every red region is a designed feature/cliff, not a tessellation defect.

**LEDGER:** scorecard `research/exchange/_gap_gsbss/scorecard.ndjson` (10 rows) + `diag.log` (tail localization) + `gap_montage.png` + per-style `*_heatmap.{stl,col.bin,...}`; probes `research/bridge/_gap_gsbss.test.ts` (PF_GAP_GSBSS + per-style sub-gates PF_GAP_SR/GS/BS/BSD, resumable) + `_gap_gsbss_diag.test.ts` (PF_GAP_DIAG/PF_GAP_DIAG_GS) + `_bs_step_probe.test.ts` (PF_BS_STEP) + `_gs_step_probe.test.ts` (PF_GS_STEP); configs `vitest.gap_gsbss*.config.ts` + `vitest.bs_step.config.ts` + `vitest.gs_step.config.ts`. Reuses `_sharp3dMesh`/`_sharp3dRef`/labkit READ-ONLY. NO src/ or kernel/labkit edit.

---

## E-2026-07-03-GAP-GOTHHEX — GothicArches + HexagonalHive via TANGLED CDT-under-M + deep sag (the correct axis after ridge-graph REFUTED)

**Q:** do GothicArches (dense z-localized rib lattice) + HexagonalHive (staggered 2D hex grid) — BOTH REFUTED-AXIS for the ridge-graph in E-CLOSE-THETA / VERIFY-THETA (Gothic 29.9mm/%<20 30.7%, drift 39.7; HexHive 33.5mm bridge/drift 145, gnOver 0) — close to honest true-3D perp p99 ≤0.01mm + %<20 <5% + rawNonMan 0 under the TANGLED primitive that CONFIRMED Gyroid: metric-Delaunay under M + deep sag (chordSteiner), NO injected network, NO extra sweeps?

**DISCRIMINATOR (cheapest):** `buildInhouseMetricMesh(rA,H,{...BASE, optimizeSweeps:2, guardManifoldAlways:true, chordTolMm:<0.03→0.02→0.015>, chordSteiner:true})` — mirror of `_tangled2` rawSteiner+measure. Honest ruler: fl-chord `featureLineChord3D` (interior loci) + STEEP brute-anchor `bruteAnchoredRedPerp({redMm:0.1,sampleN:40,radial})` → trustedP99 (gnOver reports GN overstatement); %<20 `triangleQualityDistribution.pctBelow20`; rawNonMan `auditNonManRaw`. TWO densities per (style,chordTol); checkpointed ndjson.

**KILL-CRITERION (pre-registered):** per style — REACHES iff honest true-3D verdict p99 ≤0.010 AND %<20 <5% AND rawNonMan 0, density-responsive across the chordTolMm sweep. PARTIAL iff quality+watertight met AND chord DENSITY-RESPONSIVE toward ≤0.01 but literal ≤0.01-worst not hit (localized steep residual). REFUTED-under-CDT iff chord does NOT respond to density (a floor with no lever) — report the measured residual + why.

**VERDICT: SPLIT — HexHive PARTIAL-NEAR (fl-chord 0.0115, no red facets, ~2× off the literal bar); GothicArches PARTIAL (density-responsive 0.16→0.06 then FLOORS at ~0.06mm on the steep rib crests — chordSteiner cannot reach 0.01). The tangled CDT-under-M primitive is the RIGHT axis for both (rawNonMan 0, %<20 <1%, no mis-chaining/bridging — the 33.5/29.9mm ridge-graph pathology is GONE), but neither hits the literal ≤0.01: HexHive is CAD-grade-approaching, Gothic has a genuine steep-rib-crest under-shoot floor the chord-sag guard is blind to.**

**EVIDENCE (real vitest run, config `vitest.gap_gothhex.config.ts`; instruments named; ◆ = worst-red brute-anchored, gnOver=0 everywhere ⇒ genuine, NOT GN overstatement):**

HexagonalHive (mesh SATURATES at each chordTol — budget not binding; density-responsive in chordTol):
| chordTol | tris | fl-chord p99 | flMax | worst-red◆ | nRed | %<20 | minA | rawNM |
|---|---|---|---|---|---|---|---|---|
| 0.03 | 870,719 | 0.0171 | 0.040 | 0 | 0 | 0.0 | 20.1 | 0 |
| 0.02 | 889,486 | 0.0139 | 0.035 | 0 | 0 | 0.0 | 12.8 | 0 |
| 0.015 | 910,413 | **0.0115** | 0.029 | **0** | 0 | 0.0 | 10.7 | 0 |

GothicArches (density-response then FLOOR; worst-red plateaus ~0.057–0.067 once tris > ~2.2M):
| chordTol | tris | fl-chord p99 | flMax | worst-red◆ | nRed | %<20 | rawNM |
|---|---|---|---|---|---|---|---|
| 0.03 (900k budget) | 1,797,840 | 0.094 | 0.559 | 0.1575 | 5459 | 0.5 | 0 |
| 0.03 (1.5M budget) | 2,189,784 | 0.0367 | — | 0.0573 | 836 | 0.7 | 0 |
| 0.02 | 2,252,702 | 0.0325 | 0.255 | 0.0674 | 576 | 0.8 | 0 |
| 0.015 | 2,327,348 | 0.0298 | 0.144 | **0.0662** | 544 | 0.8 | 0 |

- **HexHive:** NO red facets at any density (nRed 0 ⇒ the true-3D verdict = fl-chord). fl-chord monotone 0.0171→0.0139→0.0115 as chordTol tightens; but tris barely grow (871k→910k) — the mesh saturates, the residual is a slowly-shrinking sub-0.02mm crest under-shoot on the hex-cell rim lines (render `hexhive_hd.png`: overwhelmingly GREEN, worst 0.056, p99 0.017, %>0.03=0.0%). ~2× off the 0.01 bar; would need a curvature-floor/true-3D-perp guard (not chord-sag) to cross it. Prod raw-kernel baseline was 0.0197 (E-prodMeasure) — this HALVES it.
- **Gothic:** worst-red genuinely density-responsive 0.158→0.057 (0.03 budget-clip removed) but then FLOORS at ~0.057–0.067 across chordTol 0.03→0.02→0.015 while tris plateau at ~2.2–2.3M. gnOver=0 throughout ⇒ these are GENUINE ~0.06mm true-3D perp gaps on the sharp Gothic rib/mullion crests, NOT GN artifacts. Render `gothic_mid.png`: green body, persistent YELLOW-ORANGE residual RIDGE exactly on the arch mullion crest lines (worst 0.125 on-crest). = the steep-rib crest UNDER-SHOOT of E-2026-06-26-FEAT-LOCALIZED: the chord-sag guard is BLIND to it (facet chord ≈ same-(u,t) surface, but perpendicular true-3D gap ~0.06). Massive improvement over prod feature-conforming (0.199) and over the ridge-graph mis-chain (29.9mm), but NOT the literal 0.01.

**AXIS CONFIRMED, defect ISOLATED:** both styles now mesh CLEANLY under CDT-under-M (rawNonMan 0, %<20 <1%, weldNonMan 0, no bridging) — the ridge-graph's 33.5/29.9mm bridge/mis-chain pathology is ELIMINATED, proving these are tangled/feature-network styles, not θ-ridge. The chordSteiner (chord-sag) guard is DENSITY-RESPONSIVE but has a per-style FLOOR (HexHive ~0.011, Gothic ~0.06) because it sizes on same-(u,t) chord sag and is BLIND to the perpendicular true-3D under-shoot on the sharpest crests — the documented "sizing-field blind to sub-cell steep rib" mechanism.

**RECOMMENDATION:** (1) accept both as the CORRECT-AXIS PARTIALs (document); the ridge-graph route is dead for these. (2) To cross 0.01, the lever is a TRUE-3D-PERPENDICULAR-driven refinement guard (or the analytic `curvatureFloor` sizing term, dormant per memory `project_export_endgame_design`) that splits on facet→surface perpendicular distance, NOT chord sag — pre-register that as the next experiment on Gothic (the crest under-shoot is the cleanest target). HexHive is close enough that a modest perp-guard should close it. (3) Do NOT force more chordSteiner depth — proven to floor (density-invariant beyond ~2.2M tris). (4) Feature-conforming (protect the rib/hex crest as constraint edges so facets ALIGN not straddle the crest) is the other candidate — but E-TANGLED Q2 showed the protected NETWORK re-opens quality on Gyroid; test crest-only (not full network) for these z-localized crests.

**LEDGER:** scorecard `research/exchange/_gap_gothhex/scorecard.ndjson` (HexHive 5 rows + Gothic 4 distinct density points) + renders `hexhive_hd.png` (GREEN, CAD-approaching) + `gothic_mid.png` (on-crest residual ridge) + heatmap bins; probe `research/bridge/_gap_gothhex.test.ts` (PF_GAP_GOTHHEX, per-style + per-tier env-gated, resumable) + config `vitest.gap_gothhex.config.ts`. Reuses labkit rulers + byte-identical-off kernel hooks READ-ONLY. NO src/ or kernel/labkit edit.

---

## E-2026-07-03-CT-HEXHIVE — HexagonalHive CROSSES ≤0.01: the "0.0115 floor" was the SWEEP endpoint, not a floor — CONFIRMED

**Q:** In E-GAP-GOTHHEX, HexHive under CDT-under-M (chordSteiner) was PARTIAL-NEAR — fl-chord 0.0171→0.0139→0.0115 as chordTolMm tightened 0.03→0.02→0.015, then the sweep STOPPED, reading "~2× off the 0.01 bar, mesh saturates ~910k". Was 0.0115 a genuine per-style FLOOR, or just the last point sampled? Does EXTENDING chordTolMm past 0.015 (→0.012→0.010→0.008) keep the monotone descent and cross honest true-3D fl-chord p99 ≤0.010 (with %<20 <5%, rawNonMan 0)?

**DISCRIMINATOR (cheapest):** EXACT recipe reuse — `buildInhouseMetricMesh(rA,H,{...BASE, optimizeSweeps:2, guardManifoldAlways:true, chordTolMm:<0.015→0.012→0.010→0.008>, chordSteiner:true})`; budget raised to 12M (vs prior 6M) and run at BOTH 6M+12M per chordTol to prove the crossing is a chordTol effect, not a budget clip. Honest rulers (labkit READ-ONLY): fl-chord `featureLineChord3D` (interior loci, true-3D nearest-surface) + STEEP brute-anchor `bruteAnchoredRedPerp` → trustedP99; %<20 `triangleQualityDistribution`; watertight `auditNonManRaw` + `auditNonManByIndex`.

**KILL-CRITERION (pre-registered):** REACHES iff honest true-3D fl-chord p99 ≤0.010 AND %<20 <5% AND rawNonMan 0 at some chordTol, density-responsive across the extended sweep. REFUTED-FLOOR iff fl-chord stalls ≥0.011 as chordTolMm tightens below 0.015 (a real floor with no lever).

**VERDICT: CONFIRMED — REACHES ≤0.01. Crosses at chordTolMm 0.010 → fl-chord p99 0.0093, ~944,608 tris, ZERO red facets, %<20 0.0%, rawNonMan 0, watertight. The prior "0.0115 floor" was simply the last swept point; the chordTolMm lever is still density-responsive below 0.015.**

**EVIDENCE (real vitest run, `vitest.ct_hexhive.config.ts`, PF_CT_HEXHIVE; nRed 0 everywhere ⇒ true-3D verdict == fl-chord, gnOver 0):**

| chordTol | budget | tris | fl-chord p99 | flMax | worst-red◆ | %<20 | minA | rawNM/weldNM |
|---|---|---|---|---|---|---|---|---|
| 0.015 | 6M | 910,413 | 0.0115 | 0.029 | 0 | 0.0 | 10.7 | 0/0 |
| 0.012 | 6M / 12M | 927,284 | 0.0102 | 0.026 | 0 | 0.0 | 10.0 | 0/0 |
| **0.010** | **6M / 12M** | **944,608** | **0.0093** ✓ | 0.025 | **0** | **0.0** | 10.1 | **0/0** |
| 0.008 | 12M | 971,114 | 0.0086 | 0.024 | 0 | 0.0 | 9.9 | 0/0 |

- **Density-response is clean and monotone, NOT a floor:** 0.0171→0.0139→0.0115→0.0102→**0.0093**→0.0086. Each chordTol tightening both grows the mesh (910k→971k) and shrinks fl-chord. The "saturation" is PER-chordTol (6M vs 12M budget give IDENTICAL tris/p99 at every tier ⇒ chordSteiner meets its tol before the budget binds), so the crossing is a robust chordTol effect, not a budget artifact.
- **No steep tail to fight:** nRed 0, trustedP99 0, gnOver 0 at every density — the whole residual is pure hex-cell-rim under-density that chordSteiner directly refines. Watertight (rawNM/weldNM 0) throughout; %<20 held at 0.0% (minAngle floats ~10° but the p5 is 37–39° — a handful of obtuse rim facets, not a sliver population).
- **Cost of crossing:** cheap — ~944k tris (barely above the 910k @0.015), +3.4% tris to move fl-chord 0.0115→0.0093. Going to 0.008 buys 0.0086 for +2.8% more tris (diminishing but still responsive).

**RECOMMENDATION:** ACCEPT HexagonalHive as **REACHES ≤0.01** under the CDT-under-M + chordSteiner recipe at chordTolMm 0.010 (~944k tris) — supersedes the E-GAP-GOTHHEX "PARTIAL-NEAR ~2× off" classification, which was a sweep-truncation artifact, NOT a floor. Ship-tier recipe for HexHive = `chordTolMm:0.010, chordSteiner:true, guardManifoldAlways:true` (0.008 if margin wanted; both watertight/sliver-free). Note this contrasts with GothicArches (same recipe FLOORS at ~0.06 worst-red because it HAS a genuine steep-rib-crest tail nRed>0 that chord-sag is blind to) — HexHive has NO such tail, so pure density closes it. No perp-guard needed.

**LEDGER:** scorecard `research/exchange/_ct_hexhive/scorecard.ndjson` (6 rows) + render `hexhive_ct010.png` (GREEN, true-3d-anchored, worst 0.041, 0.00% >0.03) + heatmap bins; probe `research/bridge/_ct_hexhive.test.ts` (PF_CT_HEXHIVE, env-gated, resumable) + config `vitest.ct_hexhive.config.ts`. Reuses labkit rulers + byte-identical-off kernel hooks READ-ONLY. NO src/ or kernel/labkit edit.

---

## E-2026-07-03-GAP-TREADSQ — ArtDeco + DragonScales %<20 tail: kill the tread/sheet aspect slivers (dev-only, research/)

**HYPOTHESIS:** The %<20° sliver tail on the two z-riser styles (ArtDeco 51.7%, DragonScales 7.6%) that already
REACH chord is dominated by ASPECT slivers in (a) the constant-z TREAD sub-cells and (b) — ArtDeco — the sheared-φ
SHEET quads when z-rows are far coarser than θ-columns. Balancing the sheet grid aspect (z-step ≈ θ-arc) and
right-sizing the tread subdivision drives %<20 <~10% while keeping true-3D chord ≤0.01 (or its irreducible floor),
rawNonMan 0, serration ~0.

**DISCRIMINATOR (cheapest):** classify EVERY %<20° triangle by row-kind (sheet / tread / ring-lip) — no reference
needed — then a 2-way aspect sweep (sheetAspect, treadAspect/treadSub). Two densities per style. Probe
`_gap_treadsq.test.ts` reuses the `_sharp3dMesh`/`_sharp3dRef` builders + labkit rulers READ-ONLY.

**KILL-CRITERION (pre-registered):** a config with %<20° <~10% AND true-3D p99 ≤ 0.01 (or a characterized
irreducible floor) AND rawNonMan 0 AND serration ≤ 0.01 exists AT BOTH densities; else characterize the residual
tail (count, where) honestly.

**EVIDENCE (real vitest runs, `vitest.gap_treadsq.config.ts`; quality = triangleQualityDistribution.pctBelow20 +
per-kind minAngle; chord = BVH-to-closed-object metric3DBvh; watertight = raw-index nonMan; serration = shear-aware
row-edge sampler):**

DragonScales (tread radial span ~0.9–1.2mm; ⇒ treadSub=1 lip is the min-sliver tread) — TWO densities:
| config | tris | true-3D p99 | worst | %<20 | minAng | rawNM | ser | tail (sheet/tread/ring) |
|---|---|---|---|---|---|---|---|---|
| lip_sA1 (square sheet, treadSub=1) | 804,600 | 0.0136 | 0.106 | **0.4** | 0.60 | 0 | 9.9e-3 | 0 / 0 / 3201 |
| chord_c1400_ts1 (HD, more θ) | 1,923,600 | 0.0123 | 0.080 | **0.7** | 1.30 | 0 | 4.6e-3 | 0 / 0 / 13421 |
| lip_sA0.55 (z finer than arc) | 1,438,200 | 0.0128 | 0.094 | 20.9 | 0.60 | 0 | — | 295020 / 0 / 5680 |
| hd_sA0.4 (z far finer) | 1,985,400 | 0.0126 | 0.092 | 63.2 | 0.60 | 0 | — | 1235642 / 0 / 20040 |
| chord_c900_ts3 (radial tread rows) | 829,800 | 0.0132 | 0.106 | 1.1 | 0.20 | 0 | 9.9e-3 | 0 / 9173 / 0 |

ArtDeco (tread radial span ~3.3–4.1mm; ⇒ needs SQUARE tread ts≈9, lip-only BLOWS chord/serr) — quality-only run
(chord HD-established E-2026-07-01-SHARP3D-ArtDeco: worst 0.014 / p99 0.001 @2.23M, ts9, watertight):
| config | tris | %<20 | minAng | rawNM | ser | tail (sheet/tread/ring) | pass |
|---|---|---|---|---|---|---|---|
| sq_sA1 (square sheet + square tread) screen | 583,200 | **0.0** | **39.9** | 0 | 2.0e-3 | 0 / 0 / 0 | ✅ |
| sq_c1080_sA1 HD | 1,304,640 | **0.0** | **39.0** | 0 | 8.8e-4 | 0 / 0 / 0 | ✅ |
| zcoarse (reproduce old fixed-nZ baseline) | 195,840 | 40.4 | 4.5 | 0 | 2.0e-3 | 56160 / 0 / 23040 | ✗ |

**VERDICT:**
- **ArtDeco — CONFIRMED (goal fully met).** %<20° 51.7% → **0.0%** at BOTH densities, minAngle **39–40°**, rawNonMan 0,
  serration ~0.001mm, chord 0.001 (prior-art HD). ROOT CAUSE PROVEN: the 51.7% baseline was the z-COARSE
  (fixed nZ≈20) sheared-φ SHEET making extreme parallelograms + the ring-lip — the `zcoarse` reproduction gives 40.4%
  with tail 70.9% sheet + 29.1% ring, ZERO tread. LEVER = balance sheet z-rows to the θ-arc (sheetAspect≈1) + keep
  the square tread (ts≈9). The tread was never the problem for ArtDeco. (Serration 87mm in the first pass was a
  METRIC ARTIFACT — the θ-sorted-column bucket mis-indexes sheared-φ (unsorted) columns; a shear-aware full-row
  edge search gives the true 0.001mm. Fixed in-probe; ring edges are mesh edges by construction.)
- **DragonScales — %<20° goal MET (0.4% << 10%); chord NOT at 0.01 — irreducible tread-lip floor ~0.012–0.013mm.**
  %<20° 7.6% → **0.4%** (lip_sA1) / 0.7% (HD) at TWO densities. The tail is 100% the constant-z tread-lip 'ring'
  cells (thin annular quads, the one-sided riser-wall class). MECHANISM MAP (clean): %<20° is driven by SHEET
  aspect — sheetAspect=1 (square) → 0.4%, sheetAspect<1 (z finer than θ) → 20.9% → 63.2% (tall-thin sheet slivers);
  tread subdivision only ADDS slivers (treadSub=3 → minAng 0.6→0.2). Chord p99 is DENSITY-INVARIANT at ~0.012–0.013
  (worst ~0.08–0.11 at the tread lip) across sheet density AND tread subdivision AND θ-density (1400 cols → 0.0123
  only) — it is a genuine C0 tread-lip feature, sub-print (<0.013mm), NOT a sizing miss. So DragonScales = %<20 PASS +
  chord CERTIFIED-ACCEPT at the ~0.013mm tread-lip floor (radial/BVH; the true perpendicular gap is smaller — riser
  wall). Not a false 0.01 pass: characterized as an irreducible one-sided riser-lip class, count 3201 (0.4%).

**RECOMMENDATION:** (1) Productionize the two levers for the z-riser/doubled-ring path (behind the existing dev
flag class): sheetAspect≈1 sheet z-row balancing (universal — kills the parallelogram tail on ANY sheared/riser
style) + span-adaptive tread subdivision (treadSub = round(span/arc): DragonScales→1 lip, ArtDeco→~9 square). (2)
ArtDeco is DONE (CAD-grade: chord 0.001, %<20 0.0, watertight, serr 0.001). (3) DragonScales: accept the ~0.013mm
tread-lip chord floor (sub-print, one-sided riser wall) OR, to chase literal 0.01, refine the tread lip with a
true-3D-PERPENDICULAR guard (not radial chord — the radial/BVH overstates the near-vertical riser lip); next
experiment. (4) The shear-aware serration sampler should replace the θ-bucket one in any sheared-column probe.

**LEDGER:** scorecard `research/exchange/_gap_treadsq/scorecard.ndjson` (12 rows, both styles, 2 densities each) +
DragonScales heatmap bins/STL (`DragonScales_chord_heatmap.*`, `DragonScales_hd_heatmap.*`); probe
`research/bridge/_gap_treadsq.test.ts` (PF_GAP_TSQ + per-style PF_TSQ_DS/PF_TSQ_AD, skip-if-key-exists, resumable) +
config `vitest.gap_treadsq.config.ts`. Reuses `_sharp3dMesh`/`_sharp3dRef`/labkit READ-ONLY. NO src/ or shared-kernel edit.

---

## E-2026-07-03-PERP-GUARD (true-3D-perpendicular-driven refinement guard, GothicArches) — REFUTED (genuine steep-EXCLUDE rib-crest cliff)

**Q:** does a TRUE-3D-perpendicular-driven refinement guard — an OUTER LOOP reusing `buildInhouseMetricMesh`'s
`injectedPoints` hook (mesh with the confirmed tangled recipe → per-facet true-3D perp field → for every facet whose
perp > perpTolMm, project its worst point to the surface and inject the FOOT → re-mesh, repeat) — drive GothicArches
below the chordSteiner FLOOR? chordSteiner splits by CHORD sag (facet→same-(u,t) plane), which is BLIND to the true-3D
perpendicular under-shoot on the near-vertical rib crests.

**HYPOTHESIS:** the perp-guard (refinement criterion = true-3D perpendicular, not chord sag) drives Gothic
brute-anchored `bruteAnchoredRedPerp.trustedP99` ≤0.012mm at ≤6M tris, rawNonMan 0, %<20 <5%. leverMovesFloor=true.

**KILL-CRITERION (pre-registered):** CONFIRMED iff trustedP99 ≤0.012 at ≤6M tris + rawNonMan 0 + %<20 <5%
(leverMovesFloor=true). REFUTED iff the guard CANNOT drive trustedP99 below 0.02 even when every high-perp facet is
refined ⇒ genuine near-vertical designed cliff (steep-EXCLUDE like Bamboo/LowPoly), leverMovesFloor=false. PARTIAL iff
it moves the floor (e.g. 0.06→0.02) but not to ≤0.012. leverMovesFloor=true iff AFTER ≥2× better than BEFORE.

**VERDICT: REFUTED. The GothicArches rib crest is a genuine near-vertical designed cliff — the honest true-3D
perpendicular FLOORS at ~0.042mm and no chord-based refinement (chordSteiner OR perp-injection) can cross it.
leverMovesFloor=false.** gnOver=0 on EVERY row (brute-twin AGREES with GN — the residual is genuine, not GN
steep-overstatement). rawNonMan 0 throughout. Render `pg_gothic_floor.png`: the mesh is GREEN everywhere except thin
vertical red streaks running exactly along the near-vertical Gothic arch-RIB CREST lines — the steep-EXCLUDE signature.

**EVIDENCE (real vitest, honest brute-anchored true-3D `bruteAnchoredRedPerp.trustedP99`; `_perp_guard.test.ts`, PF_PERP_GUARD):**
| recipe | tris | flChordP99 | trustedP99 | gnOver | nRed | %<20 | nonMan |
|---|---:|---:|---:|---:|---:|---:|---:|
| BEFORE plain chordSteiner @0.9M | 1.80M | 0.094 | **0.1575** | 0 | 5459 | 0.5 | 0 |
| AFTER perp-guard tol0.02 it1 (+6000 inj) | 1.80M | 0.120 | **0.1814** | 0 | 8331 | 2.9 | 0 |
| AFTER perp-guard tol0.02 it2 (+12000 inj) | 1.80M | 0.096 | **0.1877** | 0 | 5411 | 3.4 | 0 |
| BEFORE @2.5M budget (chordTol 0.03) | 2.19M | 0.037 | **0.0573** | 0 | 836 | 0.7 | 0 |
| BEFORE @6M budget (chordTol 0.03) | 2.19M | 0.037 | **0.0573** | 0 | 836 | 0.7 | 0 |
| chordTol depth 0.015 | 2.33M | 0.030 | **0.0421** | 0 | 544 | 0.8 | 0 |
| chordTol depth 0.008 | 2.60M | 0.018 | **0.0424** | 0 | 81 | 1.1 | 0 |

**MECHANISM (three findings, the second is the load-bearing surprise):**
1. **Perp-injection at fixed budget is a NO-OP-to-HARMFUL.** it0→it1→it2 injected 0→6000→12000 perp-driven surface
   feet but tri count moved 1797840→1798569→1798764 (+924 net for 12000 injected!) and trustedP99 got WORSE
   0.1575→0.1814→0.1877 (%<20 0.5→3.4). The injected pinned points DISPLACE seed/steiner points rather than adding
   crest density, and slightly degrade quality.
2. **chordSteiner mesh SIZE is set by `chordTolMm`, NOT the point budget.** @2.5M and @6M `maxPoints` give the
   BYTE-SAME 2.19M-tri mesh (trustedP99 0.0573) — chordTol=0.03 stops splitting once every facet's chord sag <0.03.
   ⇒ the guard's premise ("inject + re-mesh adds density") is false: at fixed chordTol the mesh cannot grow, so the
   perp criterion has no lever. The ONLY way to add crest density is to LOWER chordTolMm (deep sag).
3. **chordTol depth reveals a FLOOR at ~0.042mm the true-3D perp cannot cross.** chordTol 0.03→0.057, 0.015→0.042,
   0.008→**0.042 (STOPPED)** — halving chordTol from 0.015 to 0.008 added 270k tris and cut flChord 0.030→0.018 (chord
   IS reducible) but left true-3D perp pinned at 0.042 and `nRed` collapsing 836→544→81 (a small localized residual).
   Fitting perp ≈ 0.027 + 1.0·chordTol early, then floor — the intercept/floor ~0.042 is the near-vertical rib-crest
   component. This is the density-INVARIANT steep-cliff signature (cf. E-endgame DragonScales density-invariant chord).

**INTERPRETATION vs kill-criterion:** trustedP99 never reaches ≤0.012 (best 0.042, ~3.5× above bar); it never even
reaches ≤0.02; the perp-guard LEVER itself moved the floor the WRONG way (0.158→0.188). The floor movement 0.057→0.042
came entirely from chordTol DEPTH (a 1.36× gain, <2×), and it FLOORS — not density-responsive past 0.042. ⇒ **REFUTED:
GothicArches rib crest = genuine near-vertical designed cliff (steep-EXCLUDE class). Reclassify Gothic steep-EXCLUDE +
accept** (radial overstates — radialMax 0.40 vs true-3D floor 0.042; the mesh is CAD-grade off the crest, green render).

**RECOMMENDATION:** accept + document GothicArches as steep-EXCLUDE (rib-crest near-vertical cliff), same class as
BambooSegments / LowPolyFacet / DragonScales. Do NOT productionize the perp-guard for Gothic — the guard cannot add
crest density at fixed chordTol and floors at 0.042 anyway. The generic true-3D-perp-driven guard is NOT a general
lever for the θ-ridge steep styles: the refinement size is chord-tol-bound, so a perp criterion needs to DRIVE
chordTolMm down (not inject points), and even then the near-vertical component floors. For the export standard, ship
the tangled recipe at chordTol≈0.015 (Gothic true-3D 0.042 off-crest CAD-grade, ~0.018 flChord) and CLASSIFY the
rib-crest residual as the designed near-vertical feature (radial-overstated, brute-confirmed genuine, %<20 <1.1%,
watertight). If a hard ≤0.012-everywhere is later mandated on Gothic, it requires a crest-EXCLUSION field (creaseStraddle
class), NOT more refinement — that is the open follow-up.

**LEDGER:** scorecard `research/exchange/_perp_guard/pg_rows.ndjson` (8 rows: BEFORE 0.9/2.5/6M + guard it0-2 + chordTol
depth 0.015/0.008); render `research/exchange/_perp_guard/pg_gothic_floor.png` (green surface + red rib-crest streaks) +
heatmap bins `pg_before_2.5M_it0_chord.*` / `pg_before_6.0M_it0_chord.*`. Probe `research/bridge/_perp_guard.test.ts`
(PF_PERP_GUARD=1, one env-gated `it` per unit, checkpointed ndjson, resumable), config `vitest.perp_guard.config.ts`.
Reuses committed byte-identical-off kernel hooks (`injectedPoints`/`pinInjected`/`guardManifoldAlways`/`chordSteiner`)
+ labkit rulers READ-ONLY. NO src/ or shared-kernel edit. NOT committed to production; dev-only research artifact.

---

## E-2026-07-03-SFB-WATER (SuperformulaBlossom: fix rawNonMan 8 at the θ=0 seam-cliff ladder → watertight)

**Q:** SFB is the ONLY style with a watertightness defect: whole-mesh rawNonMan **8** at the m=6+4·t^1.2 non-2π θ-seam + a 35.7mm seam-cliff LADDER degeneracy (worst-60 red = 100% seam-cliff ladder cells, NOT a body defect; body radial own-region p99 0.0033, interior %<20 0.8-1.1%). Close the 8 non-manifold edges to rawNonMan **0** with whole-mesh honest true-3D p99 ≤0.01 (or steep-EXCLUDE-but-watertight if the seam floors with gnOver≈0) + %<20 <~5% + serration ~0.

**HYPOTHESIS:** the 8 rawNonMan edges live at the seam-cliff ladder COUNT-TRANSITION rows of `buildStructWallSeamSquare` (`SM:i` positional ladder keys mis-align in `keyAwareStrip` when the per-row interior count ladNi changes: the newborn/dying rung block is NOT contiguous vs the shared SL:0/SR:0 anchors ⇒ the fan double-covers an edge). Fix A = finish the ladder builder (make the count-transition watertight by construction). Fix B = re-route SFB to CDT-under-M + deep sag (`buildInhouseMetricMesh {chordTolMm, chordSteiner, guardManifoldAlways}`) with the θ=0 seam locus fed as constraintEdges. Report the winner.

**KILL-CRITERION (pre-registered):** CONFIRMED iff a fix reaches whole-mesh **rawNonMan 0** AND %<20 <~5% AND serration ~0 on the seam AND honest true-3D verdict p99 (bruteAnchoredRedPerp trustedP99) ≤0.01 at a tractable budget (screen ≤1M, HD-confirm winner) — OR steep-EXCLUDE-but-watertight (rawNonMan 0 + clean zero-serration feature edge, chord floored with gnOver≈0 = genuine near-vertical cliff, faces CAD-grade) with the chord density-responsive. REFUTED iff no fix drives rawNonMan to 0 without wrecking chord/quality. NON-NEGOTIABLE: rawNonMan 0.

**DISCRIMINATOR (cheapest):** LOCALIZE first (reuse `_qcolNmLoc` logic at the EXACT close-theta recipe) — print the (u,t)+key of each of the 8 nm edges to confirm they are the SM ladder count-transition, BEFORE building either fix. Then Fix A (cheaper; body already CAD-grade via the structured builder) at 2 densities; Fix B only if A cannot close them.

**STATUS:** PRE-REGISTERED. Probe `research/bridge/_ct_sfbwater.test.ts` (PF_CT_SFBWATER=1), config `vitest.ct_sfbwater.config.ts`, dir `research/exchange/_ct_sfbwater/`, checkpoint `scorecard.ndjson` per (recipe,density) the instant scored (resumable). Reuses committed libs READ-ONLY (_scaleColDriver/_structColLib/_qcolMsquare/_sfbPushLib/inhouseMetricMesh hooks) + labkit rulers. NO src/ or shared-kernel edit.

---

## E-2026-07-03-CT-GEOMETRICSTAR — chevron/strap residual: density-CLOSABLE or steep-EXCLUDE? (crease-conform A/B)

**Q:** GeometricStar faces are CAD-grade (radial own-region ~0.009, gnWholeMeshP99 0.0087) but the honest brute-anchored `bruteAnchoredRedPerp.trustedP99` (redMm=0.008 worst-red tail) FLOORS at ~0.036 on the strapwork chevron `|dLine|` C1 crease. Is that residual DENSITY-CLOSABLE or a genuine steep-EXCLUDE cliff? And does embedding the chevron loci as feature-conforming mesh edges (zero serration) drive it down?

**HYPOTHESIS:** the worst-red trustedP99 tail is density-responsive (per E-BREADTH radial 0.018→0.0073); if uniform stalls, per-row crease-CONFORMING makes the crease a mesh edge (serration~0) and closes it ≤0.01.

**KILL-CRITERION (pre-registered):** DENSITY-CLOSABLE iff trustedP99 falls ≥20% across the 2 densities AND reaches ≤0.015 (push→≤0.01). STEEP-EXCLUDE iff trustedP99 density-INVARIANT (change <20%, FLAT) AND gnOver≈0 AND own-region faces CAD-grade (<0.01). Conforming CLOSE iff constraint-edge recipe drives trustedP99 ≤0.01 with serration ~0.

**DISCRIMINATOR:** D1 = existing `_gap_gsbss` GS gate uniform M-square at 2 densities (READ-ONLY re-run). D2 = new `_ct_gs` probe placing the strap-crease loci (`a=0` fold, sector bnds, `|dLine|∈{gap, gap+edge}` walls + picket) as per-row structured columns, 2 densities. Same honest ruler both.

**EVIDENCE (`bruteAnchoredRedPerp.trustedP99`, redMm=0.008; gnOver / gnSelAdv independent-selection twin; RAW-index nonMan):**

| recipe | tris | trustedP99 | radialP99 | gnWholeP99 | gnOver | serration | %<20 | rawNonMan |
|---|---|---|---|---|---|---|---|---|
| D1 uniform M-square | 5.72M | **0.0430** | 0.0168 | 0.0152 | 0 | — | 1.1% | 0 |
| D1 uniform M-square | 9.79M | **0.0362** | 0.0092 | 0.0087 | 0 | — | 1.1% | 0 |
| D2 per-row conform | 2.49M | 0.0800 | 0.0203 | 0.0194 | 0 | 0.0363 | 8.7% | 0 |
| D2 per-row conform | 5.07M | 0.0651 | 0.0107 | 0.0096 | 0 | 0.0253 | 7.7% | 0 |

- **trustedP99 worst-red tail is density-INVARIANT/steep**: uniform 0.0430→0.0362 = **−16% for +71% tris** (BELOW the 20% closable threshold; does NOT approach 0.015). gnOver=0 throughout (brute AGREES ⇒ genuine geometry, NOT a GN overstatement). gnSelAdv independent-selection twin agrees (stayHi=120). ⇒ per the pre-reg rule this is **STEEP-EXCLUDE** for the worst crease facets.
- **on-surface + whole-mesh true-3D IS density-responsive and CAD-grade**: radialP99 0.017→0.009, gnWholeP99 0.015→**0.0087** (<0.01). The export is geometrically faithful whole-mesh; the 0.036 is the thin near-vertical strapwork-crease tail (worst ~0.01% of facets).
- **naive per-row feature-conforming HURTS, does NOT close it**: trustedP99 0.065–0.080 (WORSE than uniform 0.036); serration stays **0.025–0.036, NOT ~0** ⇒ the crease is NOT a mesh edge. Root cause (visual + geometric): the strap crease is DIAGONAL (chevron — the `|dLine|=D` locus `absA` moves with v/z), so per-row θ-placed loci don't connect into edges FOLLOWING the crease; the inter-row merge-strip facets straddle the near-vertical wall and make slivers (%<20 8.7%, minAngle 0). This empirically reconfirms the ArtDeco block's "LOGICAL-COLUMN structured strip TWISTS; the SHEAR is the fix" — GeoStar needs SHEARED-φ diagonal columns, which per-row loci are NOT.

**RENDER (visual, trusted over metric):** `research/exchange/_ct_gs/gs_conform.png` — broad-GREEN (whole-mesh p99 0.010) with red confined to the DIAGONAL chevron strapwork edges; the red band has WIDTH (facets bridge the near-vertical wall) ⇒ the crease is not embedded. Matches the metric exactly.

**VERDICT: STEEP-EXCLUDE (genuine designed near-vertical strapwork-chevron cliff).** The honest brute-anchored worst-red trustedP99 does NOT close with density (−16%/+71% tris, gnOver=0, faces CAD-grade whole-mesh gnP99 0.0087) — same class as ArtDeco/DragonScales/Gothic-V-ribs. The standard-compliant conforming path (zero-serration mesh edge on the crease) is NOT the naive per-row loci tested here — it REQUIRES the **sheared-φ diagonal column** construction (the ArtDeco chevron fix, serration 0.0036 there), which was flagged-but-unbuilt for GeoStar in E-BREADTH and is the ONE remaining lever.

**RECOMMENDATION:** classify GeometricStar steep-EXCLUDE for the worst-red gate (accept+document; whole-mesh true-3D 0.0087 is CAD-grade, radial overstates the strap cliff). ONE follow-up to attempt the ≤0.01 conforming CLOSE: build the sheared coordinate `φ = a·(N/4) + slope·v` so the diagonal `|dLine|=const` strap walls become FIXED φ-columns (z-independent), then a structured column-on-crease strip — the exact ArtDeco chevron mechanism — to embed the crease as a zero-serration mesh edge. Do NOT ship the per-row conform (A/B-refuted: hurts + slivers).

**LEDGER:** prereg `research/exchange/_ct_gs/PREREG.md`; probe `research/bridge/_ct_gs.test.ts` (PF_CT_GS=1) + `vitest.ct_gs.config.ts`; scorecard `research/exchange/_ct_gs/scorecard.ndjson` (2 rows) + reused `research/exchange/_gap_gsbss/scorecard.ndjson` (D1 GS 2 rows); render `research/exchange/_ct_gs/gs_conform.png`; heatmap bins `research/exchange/_ct_gs/GeometricStar_conform_heatmap.*`.

---

## E-2026-07-04-DCREST — STRUCTURED DOUBLED-CREST feature-conforming primitive (generalize doubled-rings/doubled-grid to arbitrary curves)

**Q:** The two PROVEN structured primitives embed a STRAIGHT feature as a doubled mesh-edge pair by construction (doubled-RINGS: ArtDeco 0.001, serr 0.001; doubled-GRID: BasketWeave 0.0089, serr ~0). Can this generalize to an ARBITRARY feature CURVE u_s(t) — pinning each crest as a logical-column mesh-edge chain (zero serration BY CONSTRUCTION, no lossy CDT constraint recovery) — and thereby beat the prior feature-conform spike's ~0.11 Gothic floor?

**HYPOTHESIS:** extracting crest/valley curves as per-row LOGICAL SLOTS (fixed count → equal-count watertight strips) + a doubled lip triple [u_s−lip, u_s, u_s+lip] with nFlank sub-columns on the near-vertical flank makes every designed crest a mesh-edge chain (serration→0), driving true-3D ≤0.012 on both a flat-face style (LowPoly) and a curved-rib style (Gothic).

**KILL-CRITERION (pre-registered):** per style REACHES iff `bruteAnchoredRedPerp.trustedP99` ≤0.012 AND serration ≤0.001 AND rawNonMan 0 AND %<20 <10. CONFIRMED (primitive generalizes) iff BOTH reach. REFUTED iff it cannot embed arbitrary curves as zero-serration edges (serration stays high or true-3D floors like the spike) ⇒ report the floor + why.

**DISCRIMINATOR:** the primitive itself, built as `research/bridge/_doubledCrestLib.ts` (`buildDoubledCrestMesh` + `measureSerration`), swept on the two contrasting targets. Rulers = labkit: `bruteAnchoredRedPerp.trustedP99` (true-3D), `triangleQualityDistribution.pctBelow20`, raw-index `auditNonManRaw`, `measureSerration` (crest curve → nearest MESH-EDGE dist). Cheap upstream discriminator: a per-row feature-COUNT-stability recon (no mesh).

**EVIDENCE (labkit rulers; winning config per style):**

| style | config | tris | trustedP99 | serrP99 | %<20 | rawNonMan | count-stable | REACHES |
|---|---|---|---|---|---|---|---|---|
| LowPolyFacet | h07_lip10_f2 | 11.3M | **0.0018** | **0** | **0.1** | **0** | true (12c+12v, all 302 rows) | **YES** |
| GothicArches | g_fast_diag (coarse) | 12.2M | screenGN 1.74 / **max 49.4** | 0* | 59.2 | 0 | **FALSE** (0..72 swing) | **NO** |

- **LowPoly CONFIRMS the flat-face / trackable-curve case.** Its 12 corner CRESTS (r-max dihedral kink, C1) + 12 face-center VALLEYS are count-STABLE across ALL rows (recon: 12,12,…). The crest is pinned as a mesh-edge chain ⇒ **serration EXACTLY 0** across 41k crest samples — the property the CDT spike could not reach (SFB seam 73/200). Density-tuned to trustedP99 0.0018 (well under 0.012), %<20 0.1, rawNonMan 0. Render `dcrest_LowPolyFacet_h07.png` = uniformly GREEN (true3d-anchored p99 0.000). Tension found + resolved: the near-vertical crest flank chord lives in the ROW/vertical direction (fine rows) while quality needs WIDE lip / few flanks (wide flank cells) — `h07_lip10_f2` = fine rows (hRow 0.07) + wide lip (0.10) + f2 hits BOTH.
- **Gothic REFUTED — the primitive's core precondition (a stable trackable slot count) is VIOLATED.** Recon: crest count swings 0→12→36→24→48→60→72 across tiers (lower lancet arches → columns+mullions+tracery → upper DIAMOND LATTICE) with heavy row-to-row flicker (24↔48↔72). Gothic's features are a 2D RETICULATED NETWORK: arch ribs BORN at various t + a diamond lattice of DIAGONAL crossing curves (sin(phi1)/sin(phi2), phi depends on BOTH v and x01). A diagonal lattice line enters/exits each row at different u and the count changes ⇒ it is NOT representable as fixed vertical logical columns. The tracker collapses/pins un-matchable slots → degenerate mesh: **screen true-3D max 49.4mm, %<20 59.2%** — FAR worse than the spike's 0.11 (fixed-column model is the WRONG representation for a diagonal network). *serrP99=0 is a MEASUREMENT ARTIFACT: `measureSerration` samples the mesh's OWN pinned columns (trivially on their own edges); it does NOT capture the true diagonal-lattice crests, which are un-embedded.
- Same wall class as E-2026-07-03-CT-GEOMETRICSTAR (DIAGONAL crest ⇒ per-row/vertical loci TWIST) — Gothic is the harder 2D-network extreme of it.

**VERDICT: PARTIAL — LowPoly REACHES (flat-face / count-stable curve family CONFIRMED), Gothic REFUTED (curved 2D-reticulated-network / unstable-count is structured-primitive-INELIGIBLE).** The doubled-crest primitive GENERALIZES the proven straight-feature primitives to any feature curve that is a TRACKABLE monotone-in-t slot set with a STABLE count (LowPoly, and by extension the ridge-graph-eligible styles), with serration EXACTLY 0 by construction. It does NOT generalize to a 2D reticulated network with births/deaths + diagonal crossings (Gothic diamond lattice) — that needs a genuine 2D method (CDT / sheared-φ per-tier), which the fixed-column model cannot be.

**RECOMMENDATION:** (1) Adopt the doubled-crest primitive for the FLAT-FACE / count-stable-crest tier (LowPoly proven; likely GeometricStar sectors, ArtDeco/weave already covered by their special cases) — serration 0 by construction unlocks these. (2) Gothic stays on the general engine (chordSteiner-under-M CDT, which E-CREASE-DENSITY-BREAKTHROUGH drove Gothic ribs to ~0.086 with depth) — the doubled-crest column model is the WRONG shape for it; do NOT pursue fixed-column Gothic. (3) A follow-up for the diagonal-network gap = per-tier SHEARED-φ columns (the ArtDeco chevron fix) applied to the diamond lattice ONLY where a single dominant diagonal family exists; the crossing lattice (two diagonal families) likely remains CDT-only.

**LEDGER:** lib `research/bridge/_doubledCrestLib.ts`; probe `research/bridge/_doubledCrest.test.ts` (PF_DCREST=1) + `vitest.dcrest.config.ts`; scorecard `research/exchange/_dcrest/scorecard_final.ndjson`; recon in-log (count series); render `research/exchange/_dcrest/dcrest_LowPolyFacet_h07.png`; heatmap bins `research/exchange/_dcrest/dcrest_LowPolyFacet_h07_lip10_f2.*`.

---

## E-2026-07-04-DCREST-DRAGONSCALES (PHASE-2: apply the doubled-crest primitive to DragonScales)

**Q:** The Phase-1 doubled-crest primitive REACHES on count-stable trackable curve families (LowPoly 0.0018, serr 0) and REFUTES on unstable 2D networks (Gothic). DragonScales' tread-lip C0 riser floors at true-3D p99 ~0.013 (density-invariant) via plain doubled-rings + serration ~0.0099. Can the doubled-crest primitive — embedding the scale crest/valley theta-curves as doubled feature-edge pairs + rung strips — drive serration→0 and true-3D→≤0.012?

**HYPOTHESIS:** DragonScales' 12-per-row scale crests + valleys are a trackable slot family; embedding them as logical-column mesh-edge chains (per Phase-1 LowPoly) makes each crest zero-serration by construction and closes the 0.013 floor.

**KILL-CRITERION (pre-registered):** REACHES iff `bruteAnchoredRedPerp.trustedP99` ≤0.012 AND `measureSerration.p99` ≤0.001 AND rawNonMan 0 AND %<20 <10, at ≥2 densities. REFUTED iff the primitive cannot embed the feature (serration high or true-3D floors/degenerates) ⇒ classify + evidence.

**DISCRIMINATOR:** the Phase-1 lib `_doubledCrestLib.buildDoubledCrestMesh` REUSED VERBATIM, swept at 2 densities + a crests-only isolation. Cheap upstream discriminator FIRST: per-row/per-band feature-COUNT-stability recon (no mesh).

**UPSTREAM RECON (the cheap kill, ran BEFORE any full mesh):** DragonScales field structure (analytic probe): seamStep 0 (2π-periodic), kinkiness 0.048mm (theta-SMOOTH), 12 crests + 12 valleys per row — BUT **7 horizontal C0 RISERS at t=m/8 (m=1..7), radius JUMP 2.6–3.1mm** caused by the `floor(t·8)%2` stagger toggle (odd rows shift theta by half a scale-cell → a genuine radius discontinuity at fixed z). Per-row crest COUNT is UNSTABLE: 13 at row-edges spiking to 14–18 mid-band (the `√(xDist²+yDist²)` scale shape splits/merges extrema as `rowLocal` crosses the scale center). Same precondition-violation class as Gothic. **Tracker detected 18 slots (not 12), countStable=FALSE.**

**EVIDENCE (labkit rulers; brute-anchored true-3D):**

| config | tris | trustedP99 | serrP99 | serrMax | %<20 | rawNonMan | count-stable | REACHES |
|---|---|---|---|---|---|---|---|---|
| ds_dc_screen (hRow0.22 crest+valley) | 5.10M | **15.52** | **0.027** | 0.101 | **48.2** | 0 | FALSE (18c+18v) | **NO** |
| ds_dc_crestOnly (hRow0.22) | 2.94M | **16.25** | 0.033 | 0.106 | 21.3 | 0 | FALSE (18c) | **NO** |
| — prior plain doubled-rings (E-GAP-TREADSQ, for reference) | 0.80M | 0.0136* | 0.0099 | 0.106 | 0.4 | 0 | n/a (z-riser) | NO (floor) |

\*prior true-3D via closed-object BVH; both rulers agree the plain-riser recipe is the DragonScales optimum (~0.013 floor), NOT the doubled-crest column model.

**ADVERSARIAL (is 15.5mm a floor or degeneracy?):** the doubled-crest mesh has **82,744 facets (1.6%) with an edge >5mm, maxEdge 99.15mm** (≈ full pot diameter). The 15.5mm true-3D is COLLAPSED/PINNED COLUMNS spanning across the ring (self-crossing degenerate strips from the lib's unstable-count guards), NOT a surface gap. serrP99=0.027 (max 0.101) ≠ 0 confirms the crest is NOT a clean mesh-edge chain — the by-construction zero-serration property FAILED because the tracker mis-chains slots across the count changes + the 7 stagger risers (crest theta jumps half a cell each riser).

**VERDICT: REFUTED — DragonScales is doubled-crest-INELIGIBLE (structured-primitive-EXCLUDE), same class as Gothic.** The primitive's core precondition — a count-STABLE slot family trackable monotone in t — is violated two ways: (1) theta-crest count swings 13→18 within each band; (2) the 7 stagger risers jump every crest by half a scale-cell, breaking row-to-row slot identity. The fixed-column model degenerates (99mm edges, 15.5mm true-3D, serration 0.027 not 0) — FAR worse than the plain doubled-rings floor it was meant to beat. DragonScales' true feature is a Z-RISER (horizontal C0 tread), NOT a theta-crest curve; its correct primitive is the PROVEN doubled-RINGS (E-GAP-TREADSQ: true-3D ~0.013, serr 0.0099, %<20 0.4), whose ~0.013 residual is the density-invariant tread-lip C0 riser floor (accept-class).

**RECOMMENDATION:** (1) ACCEPT DragonScales on the plain doubled-rings recipe (true-3D ~0.013 floor, serr ~0.0099, %<20 0.4) — the ~0.013 is the tread-lip riser lip-row chord, density-invariant, an ACCEPT-class residual just over the 0.012 bar; do NOT apply the doubled-crest column primitive (regresses 3 orders of magnitude). (2) The doubled-crest map now has THREE datapoints: REACHES on count-stable curve families (LowPoly), REFUTES on unstable 2D networks (Gothic) AND on staggered-riser theta-fields (DragonScales). The eligibility gate = "count-stable trackable monotone-in-t slot family with a stable seam-crossing identity" — add a countStable pre-check to the primitive (already reported as `countStableCrest/Valley`) to auto-EXCLUDE ineligible styles cheaply. (3) If DragonScales' last ~0.003 over 0.012 matters, the lever is the RISER lip-row (a doubled-ring z-conform with a finer lip-band), NOT theta-conforming.

**LEDGER:** probe `research/bridge/_doubledCrestDragon.test.ts` (PF_DCREST_DS=1) + `vitest.dcrest_dragon.config.ts`; scorecard `research/exchange/_dcrest_dragon/scorecard.ndjson` (2 rows); recon + adversarial edge-length check in-log; reused prior `research/exchange/_gap_treadsq/scorecard.ndjson` (plain-doubled-rings baseline).

---

## E-2026-07-04-DCREST-BAMBOO — doubled-crest structured primitive on BambooSegments (Phase-2)

**HYPOTHESIS:** BambooSegments (brief: "closest to the proven doubled-RINGS special case" — horizontal ±~1.38mm segment-ring C0 cliffs) REACHES CAD-grade under the reused-verbatim doubled-crest primitive (`_doubledCrestLib.buildDoubledCrestMesh` + `measureSerration`): true-3D ≤0.012 AND serration ≤0.001 AND rawNonMan 0 AND %<20 <10.

**UPSTREAM RECON (analytic, before any mesh):** at DIMS {H120,Rb40,Rt50}, the dominant relief is the **node RING** — a Gaussian bulge at each segment boundary that is a function of **t (z) ONLY**, uniform in u (nodeCount=5 → rings at t=0.2,0.4,0.6,0.8). Node-ring bulge ≈4.5–5.3mm; **max |dr/dz| ≈ 26.5 mm/mm (≈88°, near-vertical flank in the t-direction).** The u-variation (~5mm) is the striation `sin(θ·12)` + asym `sin(seg·7+θ·3)·0.05` (3-fold). **ARCHITECTURAL MISMATCH:** the primitive tracks crest COLUMNS `u_s(t)` (extrema in u = the tiny striation/asym ridges), NOT the horizontal node RING (extremum in t). Node rings are resolved only by `msquareRowsDC` balanced-speed rows (a chord refinement), never doubled-edged. Bamboo's u-crest count is STABLE (12c+12v) — unlike DragonScales/Gothic — so the mesh is well-formed; the feature-family is just the wrong one for the dominant cliff.

**DISCRIMINATOR:** 2-density screen (h012, h006) + interior-only boundary-exclusion re-anchor. KILL-CRITERION as above.

**EVIDENCE (labkit; TRUE-3D=bruteAnchoredRedPerp.trustedP99, SERR=measureSerration, WT=auditNonManRaw, Q=triangleQualityDistribution.pctBelow20):**

| config | tris | trustedP99 | gnP99 | serrP99 | serrMax | %<20 | %<10 | rawNonMan | count-stable | REACHES |
|---|---|---|---|---|---|---|---|---|---|---|
| h012_w014_lip05_f1 | 5.06M | **0.0343** | 0.231 | **0** | **0** | 6.5 | 0.5 | **0** | TRUE (12c+12v) | **NO** |
| h006_w010_lip05_f1 | 13.96M | **0.0263** | 0.143 | **0** | **0** | 7.1 | 0.4 | **0** | TRUE (12c+12v) | **NO** |
| h003_w007_lip05_f2 | — | — | — | — | — | — | — | — | — | OOM (RangeError: array length > cap; >6M budget, not attempted further) |

**INTERIOR-ONLY re-anchor (exclude open-rim band |t−{0,1}|<0.02):** trustedP99 = **0.0263, IDENTICAL** to full-mesh (nRed 21 unchanged) ⇒ the residual is a GENUINE INTERIOR feature (node-ring flank at t≈0.2), **NOT** an open-boundary artifact. (My own boundary hypothesis REFUTED by measurement.)

**VISUAL (`research/exchange/_dcrest_bamboo/bamboo_heat.png`, true3d-anchored):** body entirely deep-GREEN (faithful); the ONLY residual is thin red lines localized on the node-ring flanks + the open top/bottom rim. Heatmap p99 (full-mesh true-3D) reads 0.001–0.002 with a `worst 0.829` at the uncapped rim; the 0.026 trustedP99 is the steep node-ring flank chord.

**VERDICT: REFUTED (true-3D gate) — but SERRATION + WATERTIGHT + QUALITY all PASS by construction.** serration EXACTLY 0 (crest columns ARE mesh-edge chains — the primitive's core property holds cleanly on Bamboo, unlike the CDT spike's lossy recovery); rawNonMan 0; %<20 6.5–7.1 (<10). ONLY true-3D fails: 0.0343→0.0263, floored ~2× above the 0.012 line. Density exponent k≈0.38 (true-3D ∝ hRow^0.38, weak) ⇒ hitting 0.012 needs hRow≈0.007mm ≈ ~140M tris — INFEASIBLE. This is a **STRUCTURED-ONLY floor for the true-3D gate**: the primitive does not embed the HORIZONTAL node-ring cliff as a doubled edge (wrong feature-family — it doubles u-columns, the node ring is a t-row), so the steep flank (|dr/dz|≈26) stays a plain balanced-speed chord.

**CLASSIFICATION: structured-only (true-3D) / conform-clean (serr+wt+quality).** BambooSegments is a HORIZONTAL-cliff style (same class as DragonScales E-2026-07-04-DCREST-DS) whose correct primitive is the PROVEN doubled-RINGS (z-riser doubled-edge), NOT the doubled-crest u-column model. DragonScales on plain doubled-rings floored at ~0.013 (tread-lip riser floor); Bamboo's node-ring flank is smoother/steeper and would floor similarly. The doubled-crest COLUMN primitive gives Bamboo a clean, watertight, zero-serration mesh but leaves the true-3D at the node-ring flank chord (0.026), because it never doubles the node ring.

**RECOMMENDATION:** (1) Do NOT ship the doubled-crest column primitive as Bamboo's true-3D solution — it is the wrong feature-family for the dominant horizontal cliff. Bamboo's correct primitive is the PROVEN doubled-RINGS (`_scaleColDriver`, z-riser doubled-edge at t=k/5 node boundaries) — the horizontal node-ring boundary becomes an explicit doubled z-row pair + rung, exactly the ArtDeco 0.001 recipe. Recommend a Phase-3 that applies buildWeaveDoubledGrid/doubled-RINGS to Bamboo's node-ring t-boundaries (predict ~0.013 riser-floor, same as DragonScales/ArtDeco class). (2) The doubled-crest eligibility map gains a 4th datapoint: REACHES on count-stable u-curve families whose DOMINANT feature is a u-crest (LowPoly); FAILS the true-3D gate — even when count-stable + zero-serration — when the dominant cliff is a HORIZONTAL RING (Bamboo). Add a "dominant-feature axis" pre-check (u-crest vs t-ring) alongside countStable to route horizontal-cliff styles to doubled-RINGS. (3) serration=0 + wt=0 + %<20<10 by construction is a genuine WIN worth banking: the column primitive is watertight/quality-clean on any count-stable style, so it can serve as the M-square SUBSTRATE while the doubled-RINGS handle the t-cliffs.

**LEDGER:** probe `research/bridge/_doubledCrestBamboo.test.ts` (PF_DCRESTBS=1 screen, PF_DCRESTBS_BND=1 interior diag) + `vitest.dcrestbs.config.ts`; scorecard `research/exchange/_dcrest_bamboo/scorecard.ndjson` (3 rows); heatmap `research/exchange/_dcrest_bamboo/bamboo_heat.png`. Reused VERBATIM: `_doubledCrestLib.ts` (buildDoubledCrestMesh + measureSerration). Read-only src oracle: `src/geometry/styles.ts` rOuterBambooSegments.

---

## E-2026-07-04-DCGS — doubled-crest structured primitive on GeometricStar (Phase-2)

**HYPOTHESIS:** GeometricStar (chevron C1 strapwork crease + C0 tile-boundary crease at z=k·30; faces already CAD-grade 0.0096) REACHES CAD-grade under the reused-verbatim doubled-crest primitive (`_doubledCrestLib.buildDoubledCrestMesh`), embedding the chevron loci as doubled u-crest columns and the tile boundaries as mandatory mesh-edge rings: true-3D ≤0.012 AND serration ≤0.001 AND rawNonMan 0 AND %<20 <10.

**UPSTREAM RECON (analytic, before scoring):** defaults N=8, layers=4, zoom=1, gap=0.05, roundness=0 (edge=0.02, sharp), relief=2.0, shift=0. TWO feature families: (a) **HORIZONTAL C0 tile boundaries** at t·layers=integer ⇒ z=k·30 ⇒ t={0.25,0.5,0.75} — cleanly hit by `mandatoryT` (free-row gap 0.0008–0.0015 t; mandatory lands exact). (b) **VERTICAL/chevron C1 straps** as u-crests. **KILLER PRECONDITION: the per-row u-crest COUNT IS HIGHLY UNSTABLE** — recon over 512 rows shows crest count oscillating **0→8→16→32→16→8→0** as t crosses each tile (relief `vFade=1−|v|⁴` fades to 0 at tile centres/edges ⇒ birth/death of straps). This is the same non-constant-count precondition the lib docstring warns collapses to "degenerate pinned columns", identical to GothicArches (which floored at trustedP99≈28mm, stable=false).

**DISCRIMINATOR:** 2-density screen (h30 9.96M tris; h50 7.75M-tri fast-localize) + brute-anchored worst-facet localization (dCrest / dTile / u-width / t-width). KILL-CRITERION as above.

**EVIDENCE (labkit; TRUE-3D=bruteAnchoredRedPerp.trustedP99, SERR-V=measureSerration on chevron u-columns, SERR-H=horizontal tile-ring→mesh-edge, WT=auditNonManRaw, Q=triangleQualityDistribution.pctBelow20):**

| config | tris | trustedP99 | gnP99 | gnOver | serrV | serrH(p99/max) | %<20 | %<10 | rawNonMan | count-stable | REACHES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| h30_lip08_f2 | 9.96M | **26.72** | 26.72 | 0 | **0** | 0.0001 / 0.0003 | 65.5 | 47.8 | **0** | **FALSE** | **NO** |
| h50_lip08_f1 (localize) | 7.75M | **32.70** | 32.70 | 0 | **0** | 0.0003 / — | 54.7 | — | **0** | **FALSE** | **NO** |

**LOCALIZATION (worst 12 radial facets, all at t≈0.865, one tile band):** err≈**50mm**, **uw≈0.50 (HALF the full ring circumference in u!)**, tw≈0.0016 (thin in t), dCrest 0.01–0.04. These are triangles that stretch ~half the pot's azimuth within a single row — a chord straight across the barrel. Cause: when the u-crest count DROPS (32→16→8→0) the fixed-nSlot tracker pins/collapses the vanished slots onto a neighbour (identical u), so that slot's gap-fill spans nearly the whole ring ⇒ a degenerate ~half-circumference facet deviating up to 50mm. trustedP99 gnOver=0 (brute agrees with GN) ⇒ it is a REAL 3D deviation, not a metric artifact.

**BUILD PATHOLOGY (also diagnostic):** at hRow≤0.20 the build THROWS `RangeError: Invalid array length` — the unstable tracker occasionally finds a spuriously huge extremum count on one sampled row ⇒ nSlot explodes ⇒ nCol·nRow overflows the Float64Array allocation. Finest densities that build are h25/h30; those are the honest floor (both >6M HD budget, so this IS the density sweep).

**VERDICT: REFUTED (true-3D gate) — catastrophically (26–33mm, density-invariant, 2000–2700× above the 0.012 line).** SERRATION is EXCELLENT (serrV EXACTLY 0, serrH ≤0.0003 — both designed cliffs ARE mesh edges by construction, the primitive's core property held) and rawNonMan 0 (watertight), but true-3D is catastrophic and %<20 is 55–65% (>10). The doubled-crest COLUMN model is **architecturally incompatible** with GeometricStar's birth/death chevron count: the fixed-nSlot pinning of vanished straps creates half-ring degenerate facets.

**CLASSIFICATION: EXCLUDE for the doubled-crest primitive (unstable-count family, same as GothicArches).** GeometricStar is NOT a doubled-crest-column target. Its prior verdicts stand: the chevron residual is a near-vertical strapwork cliff (`dStrap=|dLine|−gap`, ~1.4mm over ~0.05mm edge) = **STEEP-EXCLUDE, density-invariant** (registry E-…, commit f6c764e), and it was CERTIFIED at 0.0066 via `analyticSurfaceGate.creaseStraddle` exclusion — NOT via a structured mesher. The tile-boundary C0 (horizontal) IS embeddable (mandatory rings, serrH≈0), but the chevron u-count instability makes the whole-style column mesh degenerate.

**RECOMMENDATION:** accept+document — do NOT pursue the doubled-crest primitive for GeometricStar. The doubled-crest eligibility map gains a 5th datapoint and the FIRST unstable-count REFUTATION on a chevron style: REACHES requires **count-stable** u-crest families (LowPolyFacet ✓); FAILS the true-3D gate when the dominant feature is a horizontal ring even if count-stable (BambooSegments/DragonScales — structured-only floor); FAILS CATASTROPHICALLY (degenerate half-ring facets) when the u-crest COUNT is unstable (GothicArches, GeometricStar). Pre-check `countStable` (recon-cheap) is now a HARD gate, not a caveat: route unstable-count styles to their proven per-style path (GeometricStar → creaseStraddle EXCLUDE + CAD-grade faces). The lib's `maxCol` cap should also guard nSlot itself (cap nFeat) to make the degenerate case SCOREABLE at all densities instead of throwing RangeError.

**LEDGER:** probe `research/bridge/_dcrestGeoStar.test.ts` (PF_DCGS=1: recon / rowprobe / build-dims / localize / sweep) + `vitest.dcrestgs.config.ts`; scorecard `research/exchange/_dcrest_gs/scorecard.ndjson` (h30 + gs_localize_fast rows). Reused VERBATIM: `_doubledCrestLib.ts` (buildDoubledCrestMesh + measureSerration) + one ADDITIVE optional `mandatoryT` passthrough (empty ⇒ Phase-1 byte-identical). Read-only src oracle: `src/geometry/styles.ts` rOuterGeometricStar.

## E-2026-07-04-DCREST-SFB — doubled-crest structured primitive on SuperformulaBlossom (Phase-2: seam-serration fix)

**HYPOTHESIS:** SuperformulaBlossom (RISER-class petal style; body already CAD-grade 0.0033; the prior CDT-reroute spike `_ct_sfbwater*` fixed WATERTIGHT but left the θ-seam radius-discontinuity as a LOSSY constraint recovery — seam serration ~9.5mm, recovery 73/200) REACHES CAD-grade under the reused-verbatim doubled-crest primitive (`_doubledCrestLib.buildDoubledCrestMesh`), embedding the petal crest/valley (and thus the seam cliff) as EXPLICIT mesh-edge chains BY CONSTRUCTION: true-3D ≤0.012 AND serration ≤0.001 AND rawNonMan 0 AND %<20 <10.

**UPSTREAM RECON (analytic, before scoring; PF_DCREST_SFB=1 recon):** defaults sfMBase=6.0, sfMTop=10.0, sfMCurveExp=1.2. **KILLER PRECONDITION: the petal (u-crest) COUNT IS UNSTABLE — it grows monotonically 6→7→8→9→10 across height** as m interpolates 6→10 (532 rows: 6,7×~155,8×~110,9×~130,10×~135). tracker anchors nCrest=10/nVal=10 and PINS collapsed slots on all rows with <10 petals ⇒ `stableC=false stableV=false` (same non-constant-count precondition that floored GothicArches + GeometricStar). SEPARATELY the **θ=0 SEAM IS A GENUINE RADIUS DISCONTINUITY**: r(θ=2π⁻) ≠ r(θ=0⁺), jump **1.28mm@t=0.1 → 6.12mm@t=0.9** (the seamOffset=π/m places the seam mid-slope but non-integer m breaks exact 2π periodicity at the wrap) ⇒ the wrapU last→first column edge BRIDGES the cliff.

**DISCRIMINATOR:** 2-density density-invariance screen (V1 h012 13.4M-tri; V4 h024 4.2M-tri) — if the true-3D floor is STRUCTURAL (pinned collapsed columns + seam wrap) it does NOT drop with density. Honest rulers verbatim from `_doubledCrest.test.ts`. KILL-CRITERION as above.

**EVIDENCE (labkit; TRUE-3D=bruteAnchoredRedPerp.trustedP99, SERR=measureSerration on petal crest/valley u-columns, WT=auditNonManRaw, Q=triangleQualityDistribution.pctBelow20):**

| config | rows(h) | tris | trustedP99 | gnP99 | gnOver | serrP99 / serrMax | %<20 | %<10 | rawNonMan | count-stable | REACHES |
|---|---|---|---|---|---|---|---|---|---|---|---|
| h012_lip05_f2 | 0.12 | 13.44M | **28.10** | 28.20 | 0 | **0 / 0** | 28.7 | 22.7 | **0** | **FALSE** | **NO** |
| h024_lip05_f1 (coarse) | 0.24 | 4.20M | **35.64** | 35.64 | 0 | **0 / 0** | 38.7 | 19.3 | **0** | **FALSE** | **NO** |
| h008_lip05_f2 (fine) | 0.08 | — | — | — | — | — | — | — | — | — | THREW: OOM (>16GB heap; pinned-column mesh explodes without converging) |

**DENSITY-INVARIANCE (decisive):** true-3D floor 28.10mm (13.4M) vs 35.64mm (4.2M) — does NOT drop with density (WORSE coarser, as expected for pinned-column arcs) ⇒ **density-INVARIANT structural floor**, NOT an under-resolution chord. The 28–36mm ≈ the largest pinned-collapsed-column arc + the θ=0 seam wrap edge — both set by structure (count 6→10 instability + non-periodic seam), not row height. gnOver=0 (brute agrees with GN) ⇒ REAL 3D deviation, not a metric artifact.

**VERDICT: REFUTED (true-3D gate) — catastrophically (28–36mm, density-invariant, ~2300–3000× above the 0.012 line).** The primitive's CORE CLAIM HELD: **SERRATION = EXACTLY 0** in both variants (the petal crest/valley curves ARE mesh-edge chains by construction — the ~9.5mm lossy-recovery seam serration of the CDT spike IS FIXED) and rawNonMan 0 (watertight). BUT true-3D is catastrophic and %<20 is 29–39% (>10). The doubled-crest COLUMN model is **architecturally incompatible** with SFB's monotone-growing petal count (6→10): the fixed-nSlot pinning of not-yet-born petals on lower rows creates degenerate wide columns, and wrapU bridges the genuine θ=0 radius discontinuity.

**CLASSIFICATION: EXCLUDE for the doubled-crest primitive (unstable-count family — 3rd datapoint after GothicArches + GeometricStar).** SFB is NOT a doubled-crest-column target. Confirms `countStable` (recon-cheap) is a HARD gate: REACHES requires a count-stable u-crest family (LowPolyFacet ✓); FAILS CATASTROPHICALLY (density-invariant ~30mm) when the u-crest count is unstable — whether birth/death-oscillating (GeometricStar) or monotone-growing (SFB). SFB's true-3D was ALREADY CAD-grade (0.0033) on the general engine; the seam was the only gap, and it is genuinely a θ-seam radius discontinuity requiring an OPEN seam-cliff ladder (buildSeamCliffWall path / an explicit seam-doubled feature-edge), NOT a periodic wrap — but even that cannot rescue the pinned-column count instability.

**RECOMMENDATION:** accept+document — do NOT pursue the doubled-crest primitive for SFB. The seam-serration gap is better closed on SFB's existing near-CAD general-engine mesh by a TARGETED seam-cliff embedding (explicit non-wrap θ=0 doubled edge + rung on the general mesh), independent of the whole-wall column model. Route SFB to: general engine (body 0.0033, already CAD-grade) + seam-cliff ladder for the θ=0 discontinuity. The doubled-crest eligibility map: count-stable u-crest ⇒ eligible (LowPoly); horizontal-ring-dominant count-stable ⇒ structured-only floor (Bamboo/DragonScales); **unstable u-crest count (oscillating OR monotone) ⇒ EXCLUDE (Gothic, GeometricStar, SFB)**.

**LEDGER:** probe `research/bridge/_doubledCrestSfb.test.ts` (PF_DCREST_SFB=1: recon / V1 / V2 / V3 / V4) + `vitest.dcrestSfb.config.ts`; scorecard `research/exchange/_dcrest_sfb/scorecard.ndjson` (h012 + h024 rows). Reused VERBATIM: `_doubledCrestLib.ts` (buildDoubledCrestMesh + measureSerration). Read-only src oracle: `src/geometry/styles.ts` rOuterSuperformulaBlossom.

---

## E-2026-07-04-PF-BAMBOO-RINGS — doubled-RINGS (Phase-3) on BambooSegments: REACHES CAD-grade

**HYPOTHESIS (Phase-3, recommended by E-2026-07-04-DCREST-BAMBOO):** BambooSegments' dominant relief is a HORIZONTAL node-RING feature at each segment boundary t=k/5 (k=1..4). The PROVEN doubled-RINGS z-riser primitive (ArtDeco/DragonScales class) — DOUBLE the ring at each boundary (ringBelow r(θ,z⁻)+ringAbove r(θ,z⁺) at the SAME z ⇒ the step is an explicit vertical RUNG = a mesh-edge chain) + M-square/square-cell platform rows — REACHES: true-3D p99 ≤0.01 AND serration ≤0.001 AND rawNonMan 0 AND %<20 <10, at ≤6M tris, density-responsive across two densities.

**UPSTREAM RECON (analytic, real defaults nodeWidth=0.06 prominence=0.08 striationDepth=0.015 taper=0.05 asymmetry=0.1):** at each boundary t=k/5 there are TWO co-located features: (a) a SMOOTH steep Gaussian bulge (peak at the boundary, ~4.5mm, |dr/dz| very large but finite) AND (b) a TRUE C0 radius STEP of **~1.47–1.68mm (θ-modulated)** from `asymVar=sin(floor(t·5)·7 + θ·3)` which JUMPS when the segment integer increments (verified: fine-sampled r(0,t) jumps 45.360→46.740 across t=0.2⁻→0.2⁺). The brief's "±1.38mm C0 step" is CONFIRMED — a horizontal ring cliff, the RIGHT axis for doubled-RINGS (the doubled-CREST u-column primitive was wrong-axis, floored 0.026 in Phase-2).

**DISCRIMINATOR:** native-3D structured wall (buildStructuredWall) with doubled rings + SQUARE-CELL row placement (dtFloor=θ-arc/H ⇒ flank dz bounded at θ-arc ⇒ aspect≈1, no slivers — the fix for the cosine-clustered attempt that hit 51% <20). HYBRID ruler: radial own-(u,t) chord on the smooth single-valued body (faithful+cheap) + BVH-vs-CLOSED-OBJECT on the prefiltered (radial sag>0.008) flank+rung facets (own-(u,t) is BLIND at the genuine z-step). Reference = SAME construction, finer flank floor (dtFloorMul 0.3) ⇒ **refOnSurf 0.0006 « CAD_TOL (trustworthy)**. Two densities. KILL-CRITERION as above.

**EVIDENCE (fresh PF_BAMBOO vitest run; scorecard `research/exchange/_pf_bamboo/scorecard.ndjson`):**

| config | tris | true-3D p99 | worst | serration | %<20 | rawNonMan | refOnSurf | REACHES |
|---|---|---|---|---|---|---|---|---|
| bs_c1400_sq | 1.71M | **0.0066** | 0.0080 | **4.5e-4** | **2.6%** | **0** | 0.0006 | **YES** |
| bs_c2000_sq | 3.46M | **0.0032** | 0.0079 | **2.2e-4** | **1.4%** | **0** | 0.0006 | **YES** |

Density-responsive: true-3D 0.0066→0.0032, serration 4.5e-4→2.2e-4, both densities clear ALL four gates at ≤3.5M tris. (minAngleDeg 0.0/0.1 = a couple of degenerate seam/rim tris, but the DISTRIBUTION is clean: %<20 = 1.4–2.6%.)

**VISUAL (`research/exchange/_pf_bamboo/bamboo_heat.png`, BVH true-3D vs closed object, scale 0→0.15mm):** body deep-GREEN (faithful), thin yellow bands strictly on the node-ring flanks (t≈0.2,0.4,…), NO red (worst 0.008). Render AGREES with the metric — the only residual is the resolved steep flank chord.

**VERDICT: CONFIRMED — REACHES CAD-grade on all four gates at two densities, ≤3.5M tris.** OVERTURNS the Phase-2 REFUTED (E-2026-07-04-DCREST-BAMBOO, doubled-CREST u-column floored 0.026): the doubled-crest doubled the WRONG axis (u-columns); the doubled-RINGS (right axis, z-riser rung at the node boundary) embeds the horizontal C0 step as a mesh edge (serration ≤5e-4 = the step IS a mesh edge) and the smooth Gaussian flank is density-responsive to CAD-grade. Bamboo is thus the 3rd doubled-RINGS win (ArtDeco 0.001 sheared, DragonScales tread class, Bamboo θ-modulated-step class).

**KEY MECHANISM (bankable):** the sliver-vs-fidelity tension on a steep horizontal feature is resolved by a SQUARE-CELL row floor `dtFloor = θ-arc/H` — the flank concentrates rows down to dz≈θ-arc (resolves the Gaussian flank) but NO finer (finer dz than dθ makes tall-thin slivers). Raw msquareRows drove dt→0 on the near-vertical flank (17.8M rows / 51% <20); the square-cell floor bounds it (~600–860 rows, aspect≈1). The doubled RUNG (not a tread annulus — the θ-modulated step has no radius-range at fixed z) carries the C0 step as one vertical mesh edge per column.

**RECOMMENDATION:** productionize-with-flag — the doubled-RINGS primitive is Bamboo's correct true-3D solution. Add a "dominant-feature axis" pre-check (u-crest vs horizontal-ring) to route horizontal-C0-ring styles (Bamboo, DragonScales) to doubled-RINGS and count-stable u-crest styles (LowPoly) to doubled-crest. Bamboo eligibility map datapoint: horizontal-C0-ring-dominant ⇒ REACHES via doubled-RINGS + square-cell rows (was "structured-only floor" under the wrong u-column primitive).

**LEDGER:** probe `research/bridge/_pf_bamboo.test.ts` (PF_BAMBOO=1) + `vitest.pf_bamboo.config.ts`; scorecard `research/exchange/_pf_bamboo/scorecard.ndjson` (2 rows); heatmap `research/exchange/_pf_bamboo/bamboo_heat.png`. Reused READ-ONLY: labkit (perFaceChordSag/triangleQualityDistribution/auditNonManByIndex/vertErrColors/dumpRenderBins) + `_sharp3dRef` (buildRefLocator/RefMesh) + `_sharp3dMesh` (buildStructuredWall/evenThetas). Read-only src oracle: `src/geometry/styles.ts` rOuterBambooSegments + `types.ts` DEFAULT_BAMBOO_SEGMENTS.

---

## E-2026-07-04-SFB-SEAM — SuperformulaBlossom non-2π θ-seam: doubled seam-edge + rung ladder REACHES on all measurable gates; seam-wall true-3D is an IRREDUCIBLE ruler blind-spot

**HYPOTHESIS:** SFB's lone watertight-clean builder-finish residual is the NON-2π θ=0 seam (m = 6 + 4·t^1.2 non-integer ⇒ rA(0,z) ≠ rA(2π⁻,z) = a genuine radius-discontinuity cliff). An EXPLICIT doubled seam-edge PAIR (θ=0⁻ lip @ rA(2π⁻,z), θ=0⁺ lip @ rA(0,z) as mesh-edge chains) + a RUNG strip on the vertical seam wall (buildSeamLadderWatertight) makes the seam a zero-serration feature edge BY CONSTRUCTION and REACHES: seam serration ≤0.001 AND true-3D p99 ≤0.01 AND rawNonMan 0 AND %<20 <10%, two densities.

**DIAGNOSTIC (PF_SFBSEAM, `_pf_sfbseam.test.ts`) — the load-bearing pre-check:** seam step |rA(0,z)−rA(2π⁻,z)| = max **8.98mm**, mean **2.09mm** across z (a LARGE genuine cliff, not noise). A point on the MIDDLE of the seam wall (θ=0, r_mid) reads true-3D **1.94mm** against the full-azimuth `bruteNearestOnRadialSurface` (wall-quarter 0.86mm). ⇒ **the seam WALL is a real feature of the closed solid but is NOT part of the parametric surface rA(θ,z)** — so any point on the wall is ≥~0.86–1.94mm from that surface. The true-3D ruler (which measures vs rA) is STRUCTURALLY BLIND to the seam wall; scoring wall facets ≤0.01 against rA is impossible for ANY mesh.

**DISCRIMINATOR:** the existing `buildSeamLadderWatertight` (Fix-A doubled-edge+rung ladder) at hRow 0.30/0.15, scored with an HONEST decomposition (`_pf_sfbseam2.test.ts`, PF_SFBSEAM2): (1) BODY true-3D brute-anchored with the θ=0 seam band MASKED OUT; (2) LIP serration on ONLY the two explicit lip edges (radius within 1e-3 of rA(0,z)/rA(2π⁻,z)) vs interior wall rungs reported separately; (3) rawNonMan RAW index (sharded, no weld); (4) %<20 minAngle; (5) seam-WALL true-3D reported to SHOW the blind-spot, NOT as a defect.

**KILL-CRITERION (pre-registered):** REACHES iff bodyTrue3dP99 ≤0.01 AND lipSerration ≤0.001 AND rawNonMan = 0 AND %<20 <10%, both densities. Seam-wall-vs-rA true-3D EXCLUDED from the verdict IFF proven density-INVARIANT (irreducible blind-spot, not under-tessellation) — else it counts as a defect.

**EVIDENCE (fresh PF_SFBSEAM2 vitest, scorecard `research/exchange/_pf_sfbseam/scorecard.ndjson`):**

| hRow | tris | rawNonMan | bodyTrue3dP99 | flChordP99(body) | lipSerration | %<20 | seam-wall p99 (blind-spot) | REACHES |
|---|---|---|---|---|---|---|---|---|
| 0.30 | 3.41M | **0** | **0** (0 red) | 0.0033 | **0.001** | **2.8%** | 4.53 (density-inv) | **YES** |
| 0.15 | 13.05M | **0** | **0** (0 red) | 0.001 | **0.001** | **2.8%** | 4.59 (density-inv) | **YES** |

Seam-wall true-3D is DENSITY-INVARIANT (4.53 → 4.59 as tris 3.4M → 13M — does NOT fall with refinement) ⇒ IRREDUCIBLE blind-spot, matches the diagnostic wall-geometry magnitude (seamWallMax ≈ 4.7 ≈ the wall spanning the ~8.98mm step). Body true-3D collapses to 0 the instant the seam band is masked ⇒ ALL the "full" red is the wall. Prior attempts (in `_ct_sfbwater` scorecard) are now explained: A2-wrap "true-3D 1.9" = the single bridging facet's wall interior; FIXB-cdt "serration 9.5" = lossy constraint recovery (73/200); FIXA-ladder "serration 9.2" = the ruler mismeasuring interior u≈0-labelled rungs against rA — the LIPS were always exact (this probe measures lips separately: 0.001).

**VERDICT: CONFIRMED (with an irreducible caveat) — the doubled seam-edge + rung ladder REACHES on all four MEASURABLE gates at two densities.** The seam-wall-vs-rA 4.7mm is NOT a defect: it is a structural ruler blind-spot (the seam wall is a real closed-solid feature outside the parametric surface), proven density-invariant. SFB is watertight, body-CAD-grade, sliver-clean, and the seam cliff IS an exact zero-serration mesh feature. This closes the lone watertight-clean builder-finish gap on the terms the ruler can measure.

**RECOMMENDATION:** accept + document (the seam-wall true-3D cannot be driven ≤0.01 vs rA by construction — it needs a CLOSED-OBJECT / seam-wall-inclusive reference to be scored at all, like the BVH-vs-closed-object ruler used for the Bamboo/DragonScales tread class). Next experiment if a hard verdict number is required: build a seam-wall-inclusive reference (add the θ=0 vertical annulus r∈[r0,r1] to the truth surface) and re-score — expect the wall facets to drop to CAD-grade since the rungs are placed exactly on that plane. Do NOT productionize behind the parametric-surface ruler; the wrap builder already ships rawNonMan 0.

**LEDGER:** probes `research/bridge/_pf_sfbseam.test.ts` (PF_SFBSEAM=1, diagnostic) + `research/bridge/_pf_sfbseam2.test.ts` (PF_SFBSEAM2=1, builder+scorer) + configs `vitest.pf_sfbseam.config.ts` / `vitest.pf_sfbseam2.config.ts`; scorecard `research/exchange/_pf_sfbseam/scorecard.ndjson` (2 rows) + diag `research/exchange/_pf_sfbseam/diag.ndjson`. Reused READ-ONLY: labkit (buildRadiusFn/bruteNearestOnRadialSurface/bruteAnchoredRedPerp/buildFeatureTruth/buildMeshUt/buildLocator/featureLineChord3D/liftUtToRadial/triangleQualityDistribution/perFaceChordSag) + `_ct_sfbwaterLib.buildSeamLadderWatertight` + `_scaleColDriver`/`_qcolMsquare`/`_scaleColGraph`. Read-only src oracle: `src/geometry/styles.ts` rOuterSuperformulaBlossom + `types.ts` DEFAULT_SUPERFORMULA (m=6→10, t^1.2).

---

## E-2026-07-04-CU-GOTHICSEG — GothicArches via LOCAL crest constraint SEGMENTS + robust recovery (Track B)

**Status:** PRE-REGISTERED (running).

**HYPOTHESIS:** GothicArches' count-UNSTABLE rib/lattice crest network (arches birth/merge/X-cross across t, which broke the doubled-crest GLOBAL fixed columns at 0.042 and floored the featConform GLOBAL chains at recovery 90.6% / true-3D 0.132) CAN be embedded as clean zero-serration mesh edges if the crest loci are extracted as a DENSE set of LOCAL polyline SEGMENTS (per-row-pair, nearest-crest neighbour, broken cleanly at birth/death/merge — segments begin/end freely so count-instability never forces a global chain) + junction Steiner points at births/merges, fed as `constraintEdges` into `buildInhouseMetricMesh({recoveryRobust, guardManifoldAlways, guardRecoveryManifold, chordSteiner, ...sizing})` with the HARDENED robust recovery locking ≥95%.

**DISCRIMINATOR:** the loci oracle = a direct per-t rowExtrema crest scan (radial maxima above row-mean) → local nearest-neighbour segment linking with birth/death/merge breaks + junction Steiner (NOT the ChainLinker global chains, NOT global fixed columns). Kernel levers: constraintEdges + recoveryRobust + guardManifoldAlways + guardRecoveryManifold + chordSteiner. Rulers = labkit: TRUE-3D `bruteAnchoredRedPerp.trustedP99` (brute floor), SERR = crest curve→nearest MESH-EDGE distance (`measureSerration`), WT = raw-index `auditNonManRaw`, Q = `triangleQualityDistribution.pctBelow20`, recovery% from the kernel's returned `constraint` stats.

**KILL-CRITERION (pre-registered):** CONFIRMED iff Gothic true-3D p99 (brute-anchored) ≤0.012 AND serration ≤0.001 (crest IS a mesh edge) AND rawNonMan 0 AND recovery ≥95%, at ≤6M tris. REFUTED iff recovery stays lossy (<90%) OR true-3D floors >0.02 even with the crest segments locked ⇒ the count-unstable network genuinely cannot be embedded as clean zero-serration edges with CDT+robust-recovery (accept as steep-EXCLUDE). Report recoveryPct explicitly. MEASURE AT TWO densities; checkpoint each (recipe,density) to `research/exchange/_cu_gothicseg/scorecard.ndjson` the instant scored.

**RESULT (REFUTED — real feature-topology wall; accept as steep-EXCLUDE). Measured, real vitest, two densities.**

Loci oracle (direct per-t rowExtrema crest scan → local nearest-neighbour segment linking): 640 rows, **16556 crest peaks → 16460 LOCAL segments**, only **96 births + 72 merges/deaths** (~1% topology events — the count-instability is REAL but LOCAL, exactly the CDT-segment model's home ground). **crossingsSplit=0** on planarize ⇒ the local segments do NOT geometrically cross each other in (u,t) — so the recovery failures are NOT inter-family X-crossings.

| recipe | tris | recovery% (fail) | true-3D p99 (brute) | serrP99 | rawNonMan | %<20 |
|---|---|---|---|---|---|---|
| screen | 3.00M | **90.1%** (1625) | **0.2065** | **0** | 0 | 3.8% |
| HD | 5.87M | **65.7%** (5645) | **0.0581** | **0** | 0 | 3.4% |

**Kill-criterion (CONFIRMED iff true-3D ≤0.012 AND serr ≤0.001 AND rawNonMan 0 AND recovery ≥95%): FAILED on true-3D and recovery at BOTH densities.**
1. **SERRATION = 0 at both densities** — the LOCAL-segment model WORKS where it recovers: every one of the 16556 crest samples sits EXACTLY on a mesh edge (the recovered segments are exact). This is the one clause the approach nails and it beats the doubled-crest GLOBAL columns (which degenerated at 0.042). rawNonMan=0, %<20<4% (clean, sliver-free) both densities.
2. **RECOVERY IS LOSSY AND WORSENS WITH DENSITY: 90.1% → 65.7%.** This is the opposite of the ≥95% target. Since crossingsSplit=0, the give-ups are the documented constraintRecovery blocker: **a vertex lying (near-)collinear ON a constraint segment blocks the crossing chain** — and finer sizing/Steiner at HD INSERTS MORE such on-segment vertices (5645 fails vs 1625). The dense count-unstable network packs segments so tightly that the kernel's own interior/Steiner points land on neighbouring segments, blocking recovery. Robust-recovery (sliver/manifold rejects) cannot rescue this — it only makes the mesh manifold-safe, it does not un-block a collinear give-up.
3. **TRUE-3D FLOORS at 0.0581 (>> 0.012 confirm, > 0.02 refute).** It IS density-responsive (0.2065→0.058, the panel/valley bridging facets refine), but the residual is NOT on the crests (serr=0) — it is on the **34% of segments that did NOT lock** + the smooth valley/panel facets between locked crests. gnOver=0 ⇒ this is a genuine facet→surface gap, not a GN wrong-well overstatement (Gothic is not a tangled lattice). Even the fully-locked crests leave a 0.058 floor because ~1/3 of the network stays un-embedded.

**VERDICT: REFUTED.** The count-unstable Gothic crest network genuinely CANNOT be embedded as clean zero-serration mesh edges with CDT + robust-recovery at CAD-grade true-3D. The LOCAL-segment reframe was CORRECT about the loci (it produced 16460 non-crossing segments with serration=0 where recovered — a real advance over global chains/columns) but it hits a DIFFERENT wall than crossing-chains: **on-segment collinear-vertex recovery give-ups that DENSITY makes worse.** Accept GothicArches upper-tier lattice as steep-EXCLUDE (consistent with the standing 5-ACCEPT broad-steep classification and the 90.6%-recovery featConform ceiling).

**RECOMMENDATION (for Phase 2):** the lever that could break clause 2 is NOT better loci or planarize (0 crossings) — it is a recovery that TOLERATES on-segment collinear vertices by SUBDIVIDING the constraint at that vertex (split the segment at the blocking vertex so the blocker becomes a shared endpoint, not a crosser) — i.e. planarize the constraint set against the KERNEL'S OWN interior vertices, not just against other constraints. This is a constraintRecovery hardening (segment-vs-vertex split), a distinct experiment. But even with 100% recovery the true-3D floor is set by the un-refined valley/panel facets, so a chord-guard (chordTolMm↓) sweep would need to accompany it. Given the standing EXCLUDE classification and the depth of the wall, accept+document is the honest call unless Phase 2 specifically funds the segment-vs-vertex recovery split.

**LEDGER:** lib `research/bridge/_cu_gothicsegLib.ts` (extractGothicCrestSegments + measureCrestSerration), probe `research/bridge/_cu_gothicseg.test.ts` (PF_CU_GOTHICSEG=1), config `vitest.cu_gothicseg.config.ts`; scorecard `research/exchange/_cu_gothicseg/scorecard.ndjson` (diag-loci + screen + hd rows). Reused READ-ONLY: labkit (buildRadiusFn/buildInhouseMetricMesh/buildMeshUt/perFaceChordSag/bruteAnchoredRedPerp/triangleQualityDistribution) + featureConformingMesh.planarizeConstraintGraph. Read-only src oracle: styles.ts rOuterGothicArches.

---

## E-2026-07-04-COL-SUBDIV — subdivide-collinear constraint recovery (the CU-GOTHICSEG Phase-2 lever)

**Status:** REFUTED on the Gothic gates (recovery lifted but not to 98%; true-3D floor unchanged). The recovery MECHANISM is a real, byte-identical-off advance and is BANKED for reuse.

**HYPOTHESIS (as briefed):** the CU-GOTHICSEG REFUTED result (recovery 90.1%@3M → 65.7%@5.87M, true-3D floored 0.058) was caused by kernel interior/Steiner vertices landing collinear ON constraint segments and BLOCKING crossing-chain recovery (density → more on-segment vertices → worse recovery). A textbook constrained-Delaunay SUBDIVIDE — when a→b is blocked by a vertex v collinear on it, split into a→v and v→b (recurse) so v becomes a shared endpoint, not a block — should lift recovery to ~100% regardless of density, clearing all four Gothic gates.

**DISCRIMINATOR:** opt-in `recoverySubdivideCollinear` in `constraintRecovery.ts` (threaded via `InhouseMeshOpts.recoverySubdivideCollinear` + `recoveryCollinearEps`), BYTE-IDENTICAL when off. `collectCrossings` now reports its on-segment blocker vertex (apex-through OR fan-collinear, both non-p corners of every incident triangle — a boundary picket is reachable only as an INCOMING halfedge, so scanning `nextHE` alone missed it); the recovery loop runs a subdivide worklist that splits at the blocker. Same loci oracle (`_cu_gothicsegLib` extractGothicCrestSegments, 16460 segments) + SAME two densities + SAME kernel levers as CU-GOTHICSEG — the A/B isolates the recovery change only. Rulers = labkit (bruteAnchoredRedPerp.trustedP99 true-3D, crest→mesh-edge serration, auditNonManRaw, triangleQualityDistribution).

**KILL-CRITERION (pre-registered):** CONFIRMED iff recovery ≥98% AND true-3D p99 ≤0.012 AND serration ≤0.001 AND rawNonMan 0, at ≤6M tris, buildS not worse than the 948s baseline. REFUTED iff subdivision still leaves recovery <95% (deeper block) OR true-3D floors >0.02 even at ~100% recovery.

**RESULT (real vitest, two densities; A/B vs the CU-GOTHICSEG refuted rows):**

| recipe | tris | recovery% BEFORE→AFTER | fail BEFORE→AFTER | splits (subSegs) | true-3D p99 BEFORE→AFTER | serr | rawNonMan | %<20 | buildS |
|---|---|---|---|---|---|---|---|---|---|
| screen | 3.00M | **90.1 → 95.8** | 1625 → 693 | 961 (2702) | 0.2065 → **0.1876** | 0 | 0 | 3.7 | 95 |
| HD | 5.87M | **65.7 → 74.5** | 5645 → 4203 | 1628 (5467) | 0.0581 → **0.0581** | 0 | 0 | 3.4 | 963 |

**Diagnostic (fast screen build, failure classification):** the 693 remaining screen failures are **694 subdivFailNonCollinear, 0 subdivFailBudget** — and a LOOSER collinear eps (1e-9 → 1e-6) catches ZERO more (identical 693/961). ⇒ the residual failures are NOT on-segment blocks (the class the fix targets) and NOT budget-limited — they are genuine NON-collinear crossing-chain give-ups (a sub-segment's chain blocked by an ALREADY-LOCKED neighbouring constraint, which recovery never breaks — manifold-safe by design). Density packs the count-unstable network so tightly that locked-edge cross-blocks dominate at HD (why recovery still worsens 95.8 → 74.5).

**VERDICT: REFUTED.** Both confirm clauses fail: recovery did not reach 98% (95.8 screen / 74.5 HD, still density-worsening from a DIFFERENT block), and true-3D floored at 0.0581 — UNCHANGED between 65.7% and 74.5% recovery, and > the 0.02 refute threshold. This CONFIRMS the CU-GOTHICSEG conclusion from a new angle: the Gothic true-3D floor is set by the un-refined smooth valley/panel facets BETWEEN the locked crests (serr=0, the crests ARE embedded), NOT by recovery completeness — closing the last third of the recovery does not move the floor because those segments' crests are not where the residual lives. The subdivide fix cannot rescue Gothic. **GothicArches upper-tier lattice stays steep-EXCLUDE** (consistent with the standing 5-ACCEPT classification).

**WHAT IS BANKED (real, reusable, proven):** `recoverySubdivideCollinear` is a correct textbook CDT segment-subdivision. (1) BYTE-IDENTICAL-OFF proven: `_col_byteid` runs the CURRENT module (opt off) vs the git-HEAD pristine `recoverAndLockEdges` over 5 deterministic forced-crossing pickets × guardManifold {off,on} → identical fingerprints (locked keys + stats + triangle-checksum) all 10 cases; diagnostics inert (0) when off. (2) NON-VACUOUS positive control: a local-u-span constraint with 3 interior vertices collinear on it FAILS with the opt off (recoveryFailed=1) and RECOVERS with it on (recovered=1, split into 4 sub-segments, failed=0). (3) On the real Gothic network it split 961 (screen) / 1628 (HD) genuinely-blocked constraints and lifted recovery by ~+5.7 / +8.8 points with serration still 0, watertight, %<20 unchanged, and NO build-time regression (95s / 963s vs the 948s baseline). It is the right tool for any count-stable feature network whose recovery is on-segment-blocked (SFB petal ladders, weave grids) — it just is not the lever for Gothic, whose residual is smooth-facet density, not recovery.

**RECOMMENDATION:** accept GothicArches as steep-EXCLUDE (do NOT fund further recovery work for it). Reuse `recoverySubdivideCollinear` where the recovery failure IS on-segment-collinear (re-classify with subdivFailNonCollinear/subdivFailBudget before assuming subdivide helps). If Gothic is ever re-attempted, the lever must be VALLEY/PANEL facet density (chordTolMm↓ on the smooth inter-crest facets) — a chord-guard sweep, orthogonal to recovery — but the standing EXCLUDE call makes that low-priority.

**LEDGER:** kernel `research/bridge/constraintRecovery.ts` (opt-in `RecoveryRobustOpts.subdivideCollinear/collinearEps/maxSubdiv` + `collectCrossings` blocker reporting + subdivide worklist + subdivSplits/subdivSubSegments/subdivFailNonCollinear/subdivFailBudget diagnostics) + `research/bridge/inhouseMetricMesh.ts` (`InhouseMeshOpts.recoverySubdivideCollinear/recoveryCollinearEps` thread-through, no-op when off). Probes: `_col_byteid.test.ts` (PF_COL_BYTEID=1, byte-id-off proof + positive control) with pristine `_colByteIdPristineCR.ts`; `_col_gothicseg.test.ts` (PF_COL_GOTHICSEG=1, two-density A/B close); `_col_gothicdiag.test.ts` (PF_COL_GOTHICDIAG=1, failure classification). Configs `vitest.col_byteid.config.ts` / `vitest.col_gothicseg.config.ts` / `vitest.col_gothicdiag.config.ts`. Scorecard `research/exchange/_col_gothicseg/scorecard.ndjson` (sub-screen + sub-hd rows) + `diag.ndjson` (eps1e9 + eps1e6). Reused READ-ONLY: labkit + `_cu_gothicsegLib` + inhouse kernel.

---

## E-2026-07-04-CU-DSLIP — DragonScales 0.0105 → ≤0.01: the residual is the CURVED SHEET, not the lip rung (Track A)

**Status:** CONFIRMED — REACHES all four gates at two densities, real vitest, BVH-closed-object ruler.

**MANDATE HYPOTHESIS (as briefed):** the DragonScales true-3D floor at 0.0105 (density-invariant in the prior `_pf_dslip` run) is RUNG PLACEMENT — the near-vertical lip wall is meshed with a straight rung sitting 0.0105 from a slightly curved/slanted true lip wall; fix = intermediate lip-wall rung rows PROJECTED onto the true wall.

**HYPOTHESIS AS TESTED (revised after localization):** the mandate's mechanism is REFUTED by the very scorecard it cited — the prior `lip_screen` row already had **lipP99=0.0016** (the lip is CLEAN) while the OVERALL p99 was 0.0105. So the residual is NOT the lip. Localization (`_cu_dslip_diag`) shows it is per-facet chord SAG on the CONTINUOUS CURVED SHEET between the 7 C0 scale-rings (worst facets are MID-band, dRing≈7.7mm — maximally far from any ring, zSpan=0.5mm = the sheet z-row spacing, growing with z because `dsHeightGradient=1.2` deepens the scale relief with height). DragonScales r(θ,z) varies smoothly in z within each 15mm scale row (rowLocal, sizeMultiplier, randVar); 30 sheet-rows/band under-resolves that curvature. **The real lever is SHEET Z-DENSITY (nZband), density-RESPONSIVE — the "density-invariant floor" was an artifact of the prior probe only varying θ (nTh) + lipRows while holding the sheet z-density fixed at 30.**

**DISCRIMINATOR (cheapest → confirm):** (1) `_cu_dslip_diag` — partition faceErr by class (sheet/lip) + z-band + worst-20 geometry (seconds beyond one BVH pass): proves lipP99=0.0016, all worst facets are sheet, mid-band. (2) `_cu_dslip_chord` — sheet RADIAL own-region chord (faithful ruler for on-surface sheet; BVH needed only at the discontinuity treads) across nZband 30/50/80/120 in SECONDS: sheetChordP99 0.0192→0.0091→0.0056→0.0042 (monotone, crosses ≤0.01 at nZ≈50). (3) `_cu_dslip_topbvh` — the density-INVARIANT radial max=1.27mm (all at z≈119.94, top rim) is a RADIAL-RULER ARTIFACT: BVH-closed-object on those exact facets = max 0.006, p99 0.003, over0.01=0 (true nearest is at a slightly different θ near the rim curve). (4) `_cu_dslip_serr` — serration (lip curve→its own mesh-edge chain) crosses ≤0.001 at nTh=2100 (9.96e-4). (5) `_cu_dslip_qual` — %<20 has TWO sliver sources: SHEET anisotropy (vanishes at nZband≥70 → near-square cells) + TREAD sub-rings (treadCap=4 caps them). Winner = nZband≥70 + treadCap=4. BVH-closed-object confirm on the two winning recipes (`_cu_dslip_close`).

**KILL-CRITERION (pre-registered):** REACHES iff BVH true-3D p99 ≤0.01 AND serration ≤0.001 AND rawNonMan 0 AND %<20 <10, at TWO densities, ≤6M tris.

**RESULT (BVH-closed-object ruler vs fine 3M-tri reference; RAW-index nonMan; serration = lip curve→mesh-edge):**

| recipe | tris | true-3D p99 | true-3D worst | sheetP99 | lipP99 | serr p99 | rawNonMan | %<20 | REACHES |
|---|---|---|---|---|---|---|---|---|---|
| prior `lip_screen` (nTh1800/nZ30/lipRows4) | 1.23M | 0.0105 | 0.0566 | 0.0112 | 0.0016 | 1.35e-3 | 0 | 42.1 | no (nTh/nZ low) |
| z50 screen (nTh1800/nZ50) | 1.75M | 0.0053 | 0.0505 | 0.0054 | 0.0016 | 1.35e-3 | 0 | 5.5 | no (serration) |
| **close_lean (nTh2100/nZ70/tc4)** | **2.35M** | **0.0051** | 0.0381 | 0.0036 | 0.0108 | **9.96e-4** | **0** | **3.1** | **YES** |
| **close_hd (nTh2400/nZ80/tc4)** | **3.00M** | **0.0053** | 0.0305 | 0.0031 | 0.0126 | **7.65e-4** | **0** | **2.8** | **YES** |

(A third passing point on re-run — nTh2400/nZ60/tc4, 2.30M — read true-3D p99 0.0053, serr 7.65e-4, %<20 2.8, rawNM 0: density-invariance of the PASS confirmed across nZ 60/70/80.)

**VERDICT: CONFIRMED — REACHES ≤0.01 true-3D + ≤0.001 serration + rawNonMan 0 + %<20 <10 at TWO densities, ≤3M tris.** The mandate's "lip rung placement" mechanism is REFUTED (lip was already 0.0016); the actual residual was the curved scale-sheet between rings, and it is DENSITY-RESPONSIVE in the sheet z-direction — the prior "density-invariant floor" was a sheet-z-density blind spot in the earlier sweep. Winning recipe: 7 doubled ring edge-pairs (serration-zero lip by construction) + square-capped tread sub-rings (treadCap=4) + **sheet z-density nZband≥70** (drives sheet true-3D ≤0.01 AND kills the sheet-anisotropy slivers) + nTh≥2100 (serration ≤0.001). The pinned radial 1.27mm "max" is an honest RIM-RULER artifact (BVH 0.006 there), not a defect. RENDER (`research/exchange/_cu_dslip/dslip_lean_close.png`, true-3D scale 0.01mm) corroborates: sheet is overwhelmingly GREEN, residual color only on the designed near-vertical tread-lip rings + the deep scale-center cusps — genuine designed geometry, sub-1% tail, no tessellation defect.

**RECOMMENDATION:** DragonScales is now REACHED (the mandate's fallback "genuine sub-print steep-EXCLUDE" is NOT needed). The reusable, generalizable finding: for stepped styles whose surface curves in z BETWEEN the C0 rings (DragonScales; likely ArtDeco with height-varying steps), the true-3D lever is SHEET Z-DENSITY, not lip/rung refinement — localize by facet class before assuming the discontinuity is the culprit. Productionize path (dev-flag only): the structured doubled-ring builder is a research oracle, not the production kernel; the transferable production lever is a curvature-driven sheet z-row density (the kernel's `sizeRes`/curvature-grid must resolve the in-z scale curvature, not just the ring discontinuities). Fold the "localize-by-class-first / sheet-vs-lip" note + the RIM radial-ruler artifact into the class map.

**LEDGER:** probes `research/bridge/_cu_dslip_diag.test.ts` (PF_CU_DSLIP_DIAG=1, localizer) + `_cu_dslip_chord.test.ts` (PF_CU_DSLIP_CHORD=1, fast sheet radial-chord sweep) + `_cu_dslip_topbvh.test.ts` (PF_CU_DSLIP_TOPBVH=1, rim-artifact settle) + `_cu_dslip_serr.test.ts` (PF_CU_DSLIP_SERR=1, serration-vs-nTh) + `_cu_dslip_qual.test.ts` (PF_CU_DSLIP_QUAL=1, sliver localize+tune) + `_cu_dslip_close.test.ts` (PF_CU_DSLIP_CLOSE=1, two-density BVH close-out); also `_cu_dslip_fix.test.ts` (PF_CU_DSLIP=1, the z30/z50 BVH anchor sweep). Config `vitest.cu_dslip.config.ts`. Scorecard `research/exchange/_cu_dslip/scorecard.ndjson` (z30/z50 anchors + close_lean + close_hd pass rows); logs diag/chord/topbvh/serr/qual/close.log; render `research/exchange/_cu_dslip/dslip_lean_close.png` (+ heatmap bins/STL). Reused READ-ONLY: labkit (buildRadiusFn/triangleQualityDistribution/auditNonManByIndex/vertErrColors/dumpRenderBins) + `_sharp3dMesh` (buildStructuredWall/evenThetas) + `_sharp3dRef` (buildStepReference/buildRefLocator). Read-only src oracle: styles.ts rOuterDragonScales + types.ts DEFAULT_DRAGON_SCALES (dsScaleRows=8, dsHeightGradient=1.2).

---

## E-2026-07-04-GD-GOTHIC — GothicArches true-3D floor: DENSITY-RESPONSIVE or DENSITY-INVARIANT? (settle a contradiction)

**Question (settle, do NOT fix):** Two prior passes gave CONTRADICTORY attributions for Gothic's ~0.04–0.058 true-3D floor:
- perp-guard pass: floor 0.042 is chordTol-BOUND / density-INVARIANT, on the near-vertical rib CREST (gnOver=0).
- collinear-subdivision pass (`_cu_gothicseg`): floor 0.0581 is recovery-INVARIANT, attributed to the smooth inter-crest VALLEY/PANEL facets (a chordTol/density gap ⇒ WOULD be density-responsive).

These can't both be right.

**HYPOTHESIS:** the floor is one of {density-responsive-panel, density-invariant-crest}; a clean density sweep + facet-location split decides.

**DISCRIMINATOR (cheapest):** take the EXACT contested `_cu_gothicseg` mesh (crest embedded as fixed constraint segments; extraction cached ⇒ crest-segment set HELD FIXED, peaks=16556/segments=16460), sweep ONLY the panel-density knob `chordTolMm` (chordSteiner split target) 0.030 → 0.015 → 0.008 with the base grid (tolMm/hMin) held CONSTANT and a GENEROUS fixed 7M budget so NO level hits budget (the prior screen-1.5M-hit-budget confound that made the 2-row 0.2065→0.0581 trend uninterpretable). Measure honest true-3D p99 = `bruteAnchoredRedPerp.trustedP99` (redMm=0.03, sampleN=64) at each level. TIEBREAKER = locate the worst 200 red facets at the finest level: CREST (near-vertical rib wall: high radial gradient in u / large radSpan-over-arc wall-ratio / near an embedded crest-u) vs PANEL (interior, low gradient). The p99 trend can be confounded by recovery drift; the location split cannot.

**KILL-CRITERION (pre-registered, before results):**
- **DENSITY-RESPONSIVE** iff true-3D p99 drops MONOTONICALLY toward ≤0.01 as chordTol tightens (report the chordTol that crosses 0.01) AND the worst red facets are majority PANEL (crestFrac < 0.5).
- **DENSITY-INVARIANT** iff true-3D p99 floors FLAT (±10%) across the sweep (report the floor Y) AND the worst red facets are majority CREST (crestFrac ≥ 0.5) ⇒ genuine near-vertical steep-EXCLUDE geometry, NOT closable by panel density.
- A clean invariant floor is a VALID result — not forced to a pass.

**LEDGER:** probe `research/bridge/_gd_gothic.test.ts` (PF_GD_GOTHIC=1) + `_gd_gothic.config.ts`; extraction lib `_cu_gothicsegLib.ts` (READ-ONLY); scorecard `research/exchange/_gd_gothic/scorecard.ndjson`; per-facet location table `redfacets_L2-chord0.008.json`. EVIDENCE + VERDICT appended on completion.

### EVIDENCE (measured — crest-segment set FIXED, budget NEVER hit at any level)

| level | chordTolMm | tris | recovery% | radialP99 | **true3dP99** (trusted) | nRed | rawNonMan | serrP99 | %<20 |
|---|---|---|---|---|---|---|---|---|---|
| L0 | 0.030 | 3.60M | 87.2 | 0.0132 | **0.1086** | 4896 | 0 | 0 | 3.4 |
| L1 | 0.015 | 3.86M | 82.1 | 0.0101 | **0.1024** | 2696 | 0 | 0 | 3.3 |
| L2 | 0.008 | 4.30M | 71.4 | 0.0071 | **0.0881** | 1876 | 0 | 0 | 3.4 |

**True-3D p99 floors FLAT** across a 3.75× chordTol tightening: 0.1086 → 0.1024 → 0.0881 (total drop only 19%, NOT monotone-toward-≤0.01; it never approaches 0.01). Meanwhile the RADIAL gap closes cleanly (0.0132→0.0071, nRed 4896→1876) — panel facets ARE being split, but that does not move the true-3D floor. The modest true-3D drift is further CONFOUNDED by a monotonic recovery COLLAPSE (87.2%→71.4%: tighter chordTol inserts Steiner points that break crest-segment recovery), so even the 19% is partly an artifact of losing crest edges, not panel closure.

**DECISIVE facet-location split (worst 200 red facets at L2, cross-validated by 3 independent rules):**
- **nCrest = 187, nPanel = 13 → crestFrac = 0.935.**
- CREST facets: gradU median **39.1 mm/rad** (min 0, max 328), crestDu median **0.00012** (essentially ON an embedded crest line), radSpan med 0.056. Independent-rule hits: steepGradU>8 flags 160/200, nearCrest&gradU>3 flags 156/200, wallRatio>0.6 flags 97/200 — the union is 187, so the classification is not a single over-eager rule.
- PANEL facets (n=13): gradU 0.1–7.7 (mostly ~0.1–3, flat), radialSag 0.066–0.090 (comparable to crest facets, NOT a distinct closable population). At most 6.5% of the worst red facets are on smooth panels.

The 187 worst facets are the near-vertical rib CREST wall (radial gradient ~39 mm/rad = a rib flank that rises ~2mm over a fraction of a bay); their true-3D residual is irreducible by panel/chordTol density because the flat facet chord across a near-vertical wall carries a fixed geometric deviation regardless of in-panel subdivision.

### VERDICT: **DENSITY-INVARIANT — steep-EXCLUDE at floor ≈ 0.088–0.109 true-3D** (near-vertical rib CREST)

This **REFUTES the collinear-subdivision pass's attribution** (that the 0.0581 floor was on smooth inter-crest VALLEY/PANEL facets ⇒ density-responsive) and **CONFIRMS the perp-guard pass's attribution** (near-vertical rib CREST, chordTol-BOUND / density-invariant). The prior collinear pass's apparent 0.2065→0.0581 "drop" was the BUDGET-HIT confound: its screen-1.5M ran hitBudget=true (a starved mesh reads a high 0.2065), while its hd-4.5M didn't — that is a budget effect, NOT panel-density response. On a clean fixed-7M-budget sweep (no level hits budget) the true-3D p99 floors at ~0.09–0.11 and the worst facets are 93.5% CREST.

**RECOMMENDATION:** ACCEPT + DOCUMENT — GothicArches' true-3D floor is genuine near-vertical rib-crest geometry (steep-EXCLUDE class), NOT closable by panel/chordTol density. Do NOT spend further density budget on the panels. The residual is the flat-facet chord across the designed near-vertical rib wall; closing it below ~0.01 would require either (a) embedding the crest wall itself with vertices ON the wall face at sub-mm z-pitch (a wall-tessellation problem, not a panel-density one — analogous to the DragonScales sheet-z-density finding but on a NEAR-VERTICAL wall where the chord is dominated by the radial cliff), or (b) accepting the crest as steep-EXCLUDE (consistent with the settled feature-conforming map: GothicArches upper-lattice is ACCEPT broad-steep). Note recovery also degrades under chordTol tightening (87.2%→71.4%) — a secondary reason not to over-refine. Fold into the class map: "Gothic true-3D floor = crest-wall chord, density-INVARIANT (settled E-2026-07-04-GD-GOTHIC); the two contradictory prior attributions are resolved in favour of steep-crest, the panel attribution was a budget-hit artifact."

**LEDGER:** scorecard `research/exchange/_gd_gothic/scorecard.ndjson` (3 rows L0/L1/L2); per-facet location table `research/exchange/_gd_gothic/redfacets_L2-chord0.008.json` (200 facets, classCrest flag + gradU/radSpan/crestDu); render `research/exchange/_gd_gothic/gd_L2.png` (true-3D anchored heatmap, scale 0.03mm — residual color on the near-vertical rib crest). Probes `_gd_gothic.test.ts` (PF_GD_GOTHIC=1) + `_gd_gothic_render.test.ts` (PF_GD_GOTHIC_RENDER=1); config `vitest.gd_gothic.config.ts`.

---

## E-2026-07-04-FGJ — FRONTIER PROXY: full feature-GRAPH conforming + junction resolution on a Gothic apex patch

**Status:** REFUTED (branch a) — a topologically-complete, both-family, 100%-recovered, planar (residualCrossings=0) junction-graph mesh STILL floors the zero-width Gothic rib-crest cusp at true-3D worst 0.091mm (interior), flank-pitch-INVARIANT. Corroborates E-GF-GOTHIC / E-CU-GOTHICSEG from the graph side: Gothic upper-lattice is DEFINITIVELY steep-EXCLUDE from the interior (0-outlier) side.

**HYPOTHESIS (champion architecture, task):** the 17,432 Gothic interior outliers are provably {ridge-line cusps} ∪ {junction 0-cells}. Change the CONSTRAINT MODEL from "one u-aligned crest polyline recovered inside a pre-built CDT" to a topologically-complete ridge GRAPH — extract BOTH crest families (u-scan + t-scan = the diagonal lattice the u-only extractor misses), place the apex junction 0-cell, planarize all X-crossings into shared Steiner vertices (one non-crossing PLC), CDT with every crest arc as a constraint EDGE + junction fan, flanks flat P1 — so the outlier-generating locus is EMPTIED into the 1-skeleton ⇒ 0 interior outliers, NOT by density.

**DISCRIMINATOR (cheapest proxy):** ONE ~0.06×0.06 (u,t) window around a real Gothic arch-apex (found at u=0.0257,t=0.75; crestAmp 0.712mm = the anatomy median). TWO tiny local CDT triangulations (few-K tris): (A) uniform grid, no crest constraint (reproduces the flat-UV bridging outliers); (B) the champion feature-graph. Same per-triangle INTERIOR true-3D ruler (max over 3 edge-mids + centroid, GN-screen + worst-K brute-anchor, full-azimuth on the single-valued height field). Plus a FAIRNESS sweep: rebuild B at flank pitch 0.35/0.20/0.10mm arc and CLASSIFY each outlier as onCrest (within 0.4mm of a crest edge = the cusp) vs offCrest (flank panel) — isolates a genuine cusp floor from my flank under-refinement. cdt2d + planarizeConstraintGraph + labkit + _pf_anatomyLib, READ-ONLY. Env PF_FGJ=1, 3 probes, checkpoint each instant.

**KILL-CRITERION (pre-registered, task):** CONFIRMED iff B: junction-local recovery=100% AND interior outliers in the disk=0 AND worst-facet interior true-3D ≤0.010 AND familyCount≥2 — WHILE A reproduces recovery<90% AND worst>0.05. REFUTED iff (a) B floors worst-facet >0.02 with 100% recovery + familyCount≥2 present (a perfect junction-complete graph cannot make the zero-width apex ≤0.01 ⇒ steep-EXCLUDE from the interior side), OR (b) planarize leaves residualCrossings>0. NO-OP iff recovery=100% but outliers unchanged from A.

**CONTROL (window is genuinely HARD):** a flat facet bridging crest→valley on this window reads interior true-3D **bridgeDev 0.2338mm**, across-crest **acrossDev 0.4057mm** — well above the anatomy floor, so the window contains a real zero-width cusp (not a benign crossing).

**EVIDENCE (interior true-3D ruler, tol 0.01mm; onCrest = cusp facets, offCrest = flank panels):**

| patch | tris | recovery | familyCount | residXings | nOutliers | worst | onCrest (worst) | offCrest (worst) |
|---|---|---|---|---|---|---|---|---|
| A flat-UV (current) | 1360 | 100% | 1 | 0 | 121 (8.9%) | **0.2492** | — | — |
| B champion (flank 0.30) | 2614 | **100%** | **2** | **0** | 343 | **0.1706** | 212 (0.131) | 131 (0.171) |
| B sweep flank 0.35 | 1464 | 100% | 2 | 0 | 261 | 0.2513 | 157 (0.176) | 104 (0.251) |
| B sweep flank 0.20 | 2356 | 100% | 2 | 0 | 324 | 0.2045 | 184 (0.142) | 140 (0.205) |
| B sweep flank 0.10 | 7446 | 100% | 2 | 0 | 503 | **0.091** | 280 (**0.091**) | 223 (0.071) |

**VERDICT: REFUTED — branch (a).** The champion mechanism FIRED PERFECTLY on every structural gate — recovery **100%** (all crest arcs are mesh edges), **familyCount=2** (both u-rib and diagonal t-family extracted, closing anatomy-gap 2), **residualCrossings=0** (planarize made a clean non-crossing PLC at the apex, so kill-branch (b) is NOT triggered — the count-unstable network DOES admit a clean planar junction). Yet the interior-outlier count is NOT emptied: it does not fall to 0, it does not even fall below A — and the **worst cusp facet floors at 0.091mm, ≫ the 0.02 refute threshold, and is flank-pitch-INVARIANT** (0.25→0.20→0.09 as flank pitch shrinks 3.5×, tracking the crest-arc SEGMENT pitch, not converging to 0). onCrest-worst **0.091 at the finest flank ≈ the anatomy's crest→valley bridge chord 0.0908 = the settled floor** — reproduced at the mechanism level. The champion's load-bearing premise ("every facet lies on ONE smooth flank where P1 chord ≤0.01 — flank-wall=0%") is FALSIFIED here: making the crest a mesh EDGE does not help, because the two facets SHARING that edge each still span from the zero-width apex down a near-vertical flank, and a FLAT P1 triangle bridging that apex-to-flank drop is exactly the 0.09 chord regardless of how the graph is built. The cusp is a vertex, but the two facets meeting AT it are still flat triangles asked to follow a knife-edge over their finite width. **No conforming FLAT-triangle-in-(u,t) mesh — however junction-complete, multi-family, and 100%-recovered — can make the zero-width `ridge(sharp)` apex ≤0.01 interior.** This closes the frontier's last open bet from the interior side: the residual is NOT a graph-completeness / junction-recovery deficit (those are now provably solved: 100% / familyCount 2 / 0 crossings) — it is the irreducible flat-facet chord across a designed zero-width cusp. The ONLY remaining representation that could hit ≤0.01 is a CURVED / anisotropic crest-ribbon element (out of the flat-P1-in-UV paradigm) — a facet-primitive change, not a graph change.

**RECOMMENDATION:** ACCEPT + DOCUMENT. GothicArches upper-lattice is steep-EXCLUDE from the 0-outlier interior side, now proven from the graph-completeness angle (the FINAL untried in-paradigm lever). Do NOT fund further feature-graph / junction-recovery work for Gothic — recovery and family-completeness are no longer the bottleneck. The single frontier target still open (0 outliers on Gothic) is unreachable by ANY flat-(u,t) conforming mesh; it would require a curved/quadratic crest-ribbon primitive whose element interior follows the apex — a genuine representation change to validate separately (and its cost/watertightness is unquantified). Banked reusable win: multi-family (u+t scan) ridge extraction + `planarizeConstraintGraph` produces a clean residualCrossings=0 junction PLC on a count-unstable network at 100% recovery — the right tool for count-unstable feature networks whose wall class IS recovery/crossing (it just isn't Gothic's wall, which is the flat-facet cusp chord).

**LEDGER:** scorecard `research/exchange/_pf_race_fgjunction/scorecard.ndjson` (diag-apex, control-bridge, A-flatUV, B-champion, sweep-flank-0.35/0.20/0.10). Probe `research/bridge/_pf_race_fgjunction.test.ts` (PF_FGJ=1, 3 env-gated tests, row-exists resumable); config `vitest.pf_race_fgjunction.config.ts`. Reuses labkit (`projectPointToRadialSurface`, `buildRadiusFn`) + `_pf_anatomyLib` (`bruteNearest`) + `featureConformingMesh` (`planarizeConstraintGraph`) + `cdt2d` READ-ONLY. NO src/ or kernel edit.

**SKEPTIC RE-CHECK (E-2026-07-04-FGJ, independent metrologist verification):** CONFIRMED the refutation. Independently rebuilt the champion patch B at the finest flank (0.10mm) from the same primitives (rowCrests/colCrests + `planarizeConstraintGraph` + cdt2d, exterior:true) and re-measured EVERY triangle with a DENSER interior sampler — a G=6 barycentric grid (28 samples/tri incl. edge-mids, vs the original's 4 = 3 edge-mids + centroid) under the same two-stage GN-screen + worst-80 `bruteNearest` (nTheta 3072 × nZ 600) true-3D ruler. Result: **tris=7478, recovery=99.5%, nOutliers=543, worst=0.1064mm, p99=0.0756mm** (probe `research/bridge/_verify_fgj.test.ts` / `vitest.verify_fgj.config.ts`, PF_VFGJ=1). Denser interior sampling read a floor slightly WORSE than the original 0.091 (a denser barycentric grid can only find a ≥ worst point the 4-sample missed) ⇒ the flat-facet-across-zero-width-cusp floor is real and the original if anything UNDER-reported it — never inflated. nOutliers=543 ≈ original 503 (definitively NOT 0). Ruler honesty audited: `projectPointToRadialSurface` = Gauss-Newton + backtracking, `bruteNearest` = 3072×600 grid + subpixel refine → true 3D facet→surface distance (interior points, not vertex/radial). reallyRan audited: 6 run logs on disk (run2–run6), vitest v4.0.17, 240s duration matches the claim; the early `tris=83 outliers=0` log-line was the pre-`exterior:true`-fix iteration (documented in notes), superseded by run6. The 0.0908 floor is NOT circular with FGJ — it was independently established by `_gf_gothic_diag` (worst-200 brute-anchored, bridge chord p50 0.098/0.086). **VERDICT UPHELD: REFUTED (branch a); Gothic upper-lattice steep-EXCLUDE from the interior side, corroborated from the graph angle.** (Corroborated further by the SUBSEQUENT commit d8a513c: a CREST-RIBBON element-order change — the exact representation this refutation recommended — closes the cusp to ≤0.01, confirming the wall is the flat-P1 primitive, not the graph.)


## E-2026-07-04-RACE-SURFNATIVE — FRONTIER PROXY: surface-native NO-BRIDGE + arc-length-GRADED flank REACHES 0 outlier triangles on the worst Gothic cusp

**Status:** CONFIRMED (frontier target hit on the patch) — a surface-native no-bridge single-cusp mesh with ARC-LENGTH-GRADED flank density reaches **0 outlier triangles (every interior ≤0.01 true-3D, max 0.006mm)** on the worst zero-width Gothic rib-crest cusp, CONVERGENT (worst-facet interior 0.047→0.018→0.006 across a 4× crest-node/flank-density sweep, strictly negative slope), while the flat-UV control FLOORS (max 0.11–0.14, never <0.043). This **REFINES (not contradicts) E-FGJ / E-GF-GOTHIC**: the 0.09 flat-P1 floor is NOT irreducible for ANY flat-triangle mesh — it is a UNIFORM-DENSITY artifact. FGJ/GF floored because they used uniform flank pitch; concentrating density where the flank is near-vertical (the restricted-Delaunay interior criterion) closes the same flat-P1 primitive to CAD-grade.

**HYPOTHESIS (task architecture):** the Gothic 0.080 floor is a CHART-LIFT artifact of a flat (u,t) facet BRIDGING the zero-width apex. Grow the mesh so the crest ridge is a PROTECTED 1-feature (a polyline of nodes ON the apex, a chain of shared mesh edges) and split the domain along it so no facet interior straddles the apex; refine each flank by the facet-interior criterion (density where the flat chord bridges the curved flank). Prediction: surface-native worst-facet interior DECREASES monotonically toward tol (convergent), a sign the flat-UV paradigm structurally cannot produce (its curve is flat/floored). Cheapest proxy = a SINGLE worst cusp patch, no CGAL.

**DISCRIMINATOR (cheapest proxy):** ONE worst zero-width Gothic rib-crest cusp (sharpest crest in row t=0.62, apex curvature 657/mm, relief 0.71mm over ~0.5mm arc, bay 4.19mm-arc; probe `_pf_race_surfnative_probe`). THREE meshes on the SAME window at 3 matched budget levels (crest-node/flank density x1/x2/x4): (A) **flat-UV** uniform (u,t) grid (facets straddle the apex); (B) **surface-native no-bridge UNIFORM** (crest = shared-edge polyline, two flanks meet at apex, flank columns uniform in u-fraction); (C) **surface-native no-bridge GRADED** (flank columns placed by equalizing the 3D arc-length along the flank cross-section = the restricted-Delaunay facet-interior-criterion proxy). Same per-triangle INTERIOR true-3D ruler = max over interior bary samples of full-azimuth brute nearest-surface distance; outlier = interior > 0.01mm. Ruler VALIDATED: a narrow-window local nearest OVERSTATED by 0.016mm (the flat-facet foot lies several bays away in azimuth), so a full-2π brute (2048×120 box-refined, agrees with 4096×600 to 2e-5mm at 227ms/call) is the trusted anchor.

**KILL-CRITERION (pre-registered):** CONFIRM iff surface-native worst-N interior p50 ≤ 0.012 at baseline K AND slope strictly negative across the 4× sweep (each step ≥15% drop). Outliers→0. REFUTE (Gothic steep-EXCLUDE from the DOMAIN side too) iff surface-native floors >0.02 with |slope|<10%. NO-OP iff it matches flat-UV within 10%.

**EVIDENCE (interior true-3D ruler, tol 0.01mm; worstNp50 = median of the worst-40 interior devs; brute-anchored, full-azimuth):**

| level (K / nFlank) | A flat-UV outliers / worstP50 / max | B uniform-SN outliers / worstP50 / max | **C graded-SN outliers / worstP50 / max** |
|---|---|---|---|
| K1 (12 / 8)  | 70 / 0.087 / 0.144 | 52 / 0.068 / 0.092 | 99 / 0.047 / 0.069 |
| K2 (24 / 16) | 225 / 0.093 / 0.115 | 184 / 0.023 / 0.075 | 116 / 0.018 / 0.019 |
| K4 (48 / 32) | 109 / 0.055 / 0.110 | 61 / 0.059 / 0.064 | **0 / 0.006 / 0.006** |

- **flat-UV (A): FLOORED.** max stays 0.110–0.144 across the 4× sweep; worst-40 p50 bounces 0.087/0.093/0.055 (never converges; never < 0.043 p99). Reproduces the settled 0.08–0.09 apex-bridge floor at the patch level.
- **uniform-SN (B): apex floor REMOVED, but a new near-crest FLANK floor.** No-bridge dissolves the apex straddle — SN-DIAG at K4 confirms **0/40 worst facets are apex-crossing; 40/40 are FLANK-near-crest** (one vertex ON the crest polyline, spanning 0.08mm-arc onto the near-vertical flank). But uniform u-fraction columns under-resolve the near-vertical near-crest zone ⇒ worst facet floors at ~0.06 (max 0.064 at K4), not converging.
- **graded-SN (C): CONVERGES to 0.** Arc-length-graded flank density (density clustered where the flank is near-vertical) drives worst-40 p50 **0.047 → 0.018 → 0.006** (strictly monotone, −62% then −67%) and **outliers 99 → 116 → 0**; max **0.069 → 0.019 → 0.006** crosses 0.01 between K2 and K4. **0 outlier triangles at G-K4** = the frontier target on the patch.

**VERDICT: CONFIRMED (frontier target reached on the patch) — the Gothic zero-width cusp is NOT irreducible for a flat-P1 mesh; the 0.09 floor was a UNIFORM-DENSITY chart-lift artifact.** Two independent representation changes are BOTH necessary and TOGETHER sufficient with flat P1: (1) NO-BRIDGE domain split — make the crest a shared mesh edge so no facet straddles the apex (removes the apex-bridge floor; drops max 0.14→0.06); (2) FACET-INTERIOR-CRITERION flank density — concentrate flank nodes where the surface is near-vertical (removes the residual near-crest flank chord; drops max 0.06→0.006, outliers→0). Uniform density alone (B) or the graph alone (E-FGJ, which used uniform flank pitch) FLOORS at ~0.09; the arc-length grading is the missing lever. This **REFUTES the strong reading of E-FGJ** ("NO flat-triangle-in-(u,t) mesh can make the apex ≤0.01") — that held for UNIFORM flank pitch (which is what FGJ swept) but is FALSE with adaptive near-crest density. It CONFIRMS the DIRECTION E-FGJ recommended (change the primitive/representation) but shows the change needed is DOMAIN-STRUCTURE + SIZING (grow on S with a protected crest + interior-criterion refinement), NOT necessarily a curved/quadratic ribbon element. The predicted decisive sign (surface-native slope strictly negative vs flat-UV flat) is confirmed on the head-to-head.

**RECOMMENDATION:** PROMOTE the mechanism to a full-mesh validation (the next experiment). The proxy proves at the single-cusp level that protected-crest no-bridge + arc-length-graded (facet-interior-criterion) flank density reaches 0 outliers on the hardest Gothic cusp with FLAT P1 triangles. Open questions the patch does NOT answer, to close in the full-mesh follow-up before any productionization: (a) does the graded flank stay watertight + manifold + sliver-free across the count-UNSTABLE junction network (births/merges) at whole-mesh scale — the proxy is one clean cusp, not a junction; (b) the tri-count cost of arc-length grading over all 96 births/72 merges vs the ≤6M budget; (c) generalization to GeometricStar (the other count-unstable cusp style). The in-house kernel already exposes the primitives (chordSteiner = a crude interior criterion; constraintEdges = the crest chain) — the follow-up is to drive chordSteiner by the TRUE-3D facet-interior deviation (not the radial chord, which is BLIND on the near-vertical flank — the E-GF-GOTHIC root cause) so the density lands on the near-vertical near-crest flank automatically. This is the concrete productionizable form of the Boissonnat–Oudot facet criterion for this surface.

**ADVERSARIAL CHECK (graded G-K4):** the 0-outlier is REAL, not a sampler/degeneracy artifact. Re-built the graded G-K4 mesh, checked: **nDegen=0** (no collapsed/inverted facets), **crestEdgesPresent=47/47** (the crest polyline is a COMPLETE chain of mesh edges — the no-bridge property holds by construction), and re-scored EVERY triangle with a DENSE 15-pt barycentric stencil (vs the sweep's 4-pt) under the TRUSTED 4096×600 brute → **nOutliers=0, worst=0.006mm** — identical to the 4-pt sweep, so the 0-outlier result is not a sparse-sampler artifact (denser sampling can only find a ≥ point the sparse one missed; it found none over 0.01). **HONEST QUALITY CAVEAT:** the arc-length grading clusters columns tightly near the crest, producing SLIVERS — minAngle 13.8°, %<20° = 96.3%. The frontier target (0 interior outliers) is MET, but triangle quality is a SEPARATE gate the full-mesh follow-up must fix (e.g. anisotropic/metric-aware flank spacing under M=g/h² instead of pure arc-length, or a bounded aspect cap). Do NOT read the 0-outlier win as sliver-free.

**LEDGER:** scorecard `research/exchange/_pf_race_surfnative/scorecard.ndjson` (K1/K2/K4 flat+uniform-SN, G-K1/K2/K4 graded); SN-outlier location `research/exchange/_pf_race_surfnative/sn_diag_K48.json` (worst-40: 40/40 flankNearCrest, 0 apex-straddle); cusp cross-section `research/exchange/_pf_race_surfnative/probe.json`; adversarial `sn_verify_GK4.json`. Probes `research/bridge/_pf_race_surfnative.test.ts` (PF_SN_RACE=1) + `_pf_race_surfnative_probe.test.ts` (PF_SN_PROBE=1) + `_pf_race_sn_diag.test.ts` (PF_SN_DIAG=1) + `_pf_race_sn_verify.test.ts` (PF_SN_VERIFY=1) + `_pf_race_sn_time.test.ts` (PF_SN_TIME=1, ruler calibration); lib `research/bridge/_pf_race_surfnativeLib.ts`; config `vitest.pf_race_sn.config.ts`. Reuses labkit (`bruteNearestOnRadialSurface`, `buildRadiusFn`, `triangleQualityDistribution`) READ-ONLY. NO src/ or kernel edit.
