# RESULTS — GPU screen as the driver's ranking function (STRATA-001)

Pre-registration: `research/lab/2026-07-28-gpu-rank-prereg.md`. Read it first; the falsifiers there are
binding and this document resolves them as written.

**Headline: the lever works as an instrument and FAILS as a fix. P2 is falsified. The diagnosis it came from
is confirmed and strengthened. Two defects were found along the way that are worth more than the lever was.**

---

## 1. What was built, and what it is worth on its own

`research/bridge/_gpuRankBridge.ts` — Node drives the installed Chrome through Playwright and calls
`screenTriangles` by `page.evaluate`. No HTTP broker: Node holds a direct handle on the page, so the whole
run stays a single Node job, which is the only kind that survives between agent turns.

* Playwright's **bundled** Chromium grants an adapter and then refuses the device —
  `DynamicLib.Open: dxil.dll Windows Error: 87`; it ships without the DXC runtime Dawn's D3D12 backend
  needs. `channel: 'chrome'` uses the installed browser and gets a real device. Worth knowing before anyone
  spends an afternoon on it.
* **Proof (handoff §1 step 1): 1000 triangles, bit-identical.** `|Δmx| = |Δcov| = 0` against `screenTriangles`
  called directly in a page that fetched the STL itself, so the two paths share no data transport.
* **Startup parity guard** refuses to open if the GPU's `rA` disagrees with the mesher's own: 0.303 µm
  (Gothic), 0.148 µm (GeoStar) over 32 768 samples.
* **Cost is a non-issue.** Ranking 8.96 M candidate triangles cost 65 s GPU + 141 s transport = **8.7 % of a
  2361 s run**. Whatever is wrong, it is not the price of the instrument.

## 2. The instrument agrees with the independent auditor — better than the handoff claimed

On the committed GeoStar baseline, both at **100 % coverage**:

| | over-tolerance rate |
|---|---|
| independent CPU auditor (H1, true perpendicular, 885 400/885 400) | **16.833 %** |
| GPU screen used as the ranking function | **16.894 %** |

**0.06 points apart** — the handoff recorded "within 2 points". The ranking function measures what the
auditor measures.

## 3. The diagnosis is CONFIRMED, and it is worse than recorded

The handoff's §0 said the plane ruler cannot see feature-spanning facets. Re-measured on today's code:

| mesh | triangles the true metric puts over 10 µm | of those, the plane ruler flags |
|---|---|---|
| Gothic committed baseline (6.25 % subsample) | 12 986 | **0** |
| GeoStar committed baseline (14.29 % subsample) | 21 394 | **0** |
| GeoStar today's flag-OFF control (10 % subsample) | 56 900 | **1** |

A **0.002 % detection rate**. This is not a ruler reading low, it is a ruler not reading at all.

## 4. THE RULER FLOOR PROBE — and the density requirement it measured

Before trusting any verdict, the ranking function was checked against a tautology: three points ON the
surface, so max perpendicular distance must fall with the triangle. GothicArches, 4000 sites per scale.

| triangle size | mean | MAX | over 7 µm |
|---|---|---|---|
| 1000 µm | 47.899 µm | 732.715 µm | 894/4000 (22.4 %) |
| 100 µm | 1.685 µm | 413.799 µm | 173/4000 (4.3 %) |
| 10 µm | 0.021 µm | **13.428 µm** | 1/4000 |
| 1 µm | 0.0104 µm | 0.024 µm | 0 |
| 0.1 µm | 0.0102 µm | 0.032 µm | 0 |

**No floor** above ~10–30 nm of f32 noise, three orders under the accept bar. The instrument is sound and the
runs measured the mesh.

**But read the table as a density statement, because that is the more valuable result.** It is
mesher-independent: it says what the 0.01 mm bar costs in triangles for this surface, and nothing about it
depends on the driver being clever. Even at **10 µm** on-surface triangles, 1 in 4000 still reads 13.4 µm.
That is the same wall §14c hit from the other side, now stated per-triangle rather than per-cell.

---

## 5. RESOLUTION OF THE PRE-REGISTERED FALSIFIERS

*(P1 rows pending the running full-coverage audits; every other row is final.)*

| | verdict |
|---|---|
| **F4** flag unset is byte-identical | **PASS** — sha256 `315216ea…3070` before and after the edit; the source diff removes exactly 3 lines, all of which are no-ops when the flag is off |
| **F3** flagged mesh differs from unflagged | **PASS** — the lever is wired, meshes differ |
| **F5** budget honesty | **FIRED** — every flagged arm ended `[CAPPED]`; all flagged numbers are trajectories |
| **F2** over-10 µm rate falls ≥2× | **FALSIFIED** — see below |
| **F1** H1 max falls ≥2× | **FALSIFIED** — GeoStar judged at 100 % coverage; Gothic's flagged audit still running |

### P1, THE PRE-REGISTERED JUDGE — GeometricStar, independent CPU auditor, both at 100 % coverage

| | triangles audited | witnessed max | exceedances |
|---|---|---|---|
| baseline | 885 400/885 400 = 100 %, 1896 s | **193.846 µm** | 149 044 = **16.833 %** |
| flagged, equal budget | 884 560/884 560 = 100 %, 12 477 s | **194.876 µm** | 641 627 = **72.537 %** |

P1 required < 96.9 µm. The max did not fall — it ROSE 0.5 %. **P1 is falsified.** Both pre-registered
predictions are now refuted by the independent instrument at full coverage.

**The ranking function is vindicated as an INSTRUMENT by this table.** The GPU screen read 16.894 % / 72.549 %
on these same two meshes; the CPU auditor reads 16.833 % / 72.537 % — agreement to **0.012 points** on the
flagged mesh, 0.06 on the baseline. That licenses every GPU rate quoted in this document.

**The GPU's MAX is NOT a proxy for the CPU's max, and must never be quoted as one.** The screen said GeoStar's
max fell 16 % (1195.107 → 974.528 µm); the auditor says it was flat (193.846 → 194.876 µm). The
over-statement ratio drifted from 6.16× to 5.00× between the two meshes, so it cannot be calibrated away.
Rates transfer between the two instruments; maxima do not.

**The same feature defeats both drivers.** Baseline worst facet at z = 101.405–101.655, θ = 0.5437; flagged at
z = 101.143–102.000, θ = 2.1236. Δθ = 1.580 ≈ π/2 — the same structural feature one symmetry copy over on an
8-point star. Whatever is at z ≈ 101.5 mm is untouched by either ranking function and is the thing to name
next.

### The P1 comparators, both re-measured at FULL coverage (the pre-reg figures were partial)

| independent CPU auditor, H1 | coverage | witnessed max | exceedances | P1 threshold for the flagged arm |
|---|---|---|---|---|
| GothicArches baseline | **1 979 816/1 979 816 = 100 %**, 8766 s | **362.888 µm** | 154 828 = **7.821 %** | < 181.4 µm |
| GeometricStar baseline | **885 400/885 400 = 100 %**, 1896 s | **193.846 µm** | 149 044 = **16.833 %** | < 96.9 µm |

Both maxima are unchanged from their partial-coverage readings (22.4 % and 73.2 %), i.e. the worst facet had
already been found — but the EXCEEDANCE COUNTS could only be obtained at full coverage, and they are the
numbers that matter here.

**Screen-vs-auditor calibration, on the same meshes, both at 100 % coverage:** GeoStar 16.894 % (GPU) vs
16.833 % (CPU) — 0.06 points; Gothic 10.774 % vs 7.821 % — 2.95 points. The screen over-flags, which is the
safe direction for an upper bound, and it never under-flags. That is what licenses using the GPU rate as the
P2 statistic while the CPU audits of the flagged meshes finish.

**Honest note on the cost of judging the flagged arms.** `certifyTriangle` escalates its lattice hardest on
triangles it cannot certify, so audit cost scales with the exceedance rate — which is precisely what the
flagged meshes have more of (79 % vs 7.8 % on Gothic). The Gothic baseline took 8766 s at 7.8 %; the flagged
mesh at 79 % is an order of magnitude worse. Those audits are running; if one caps, its report will say
INCOMPLETE and the coverage will be quoted with the number, never without.

### P2, as pre-registered (GeoStar, matched triangle count, GPU screen, 100 % coverage)

| | triangles | over 10 µm | MAX |
|---|---|---|---|
| committed baseline | 885 400 | **16.894 %** | 1195.107 µm |
| flagged, equal-alloc | 884 560 | **72.549 %** | 1027.519 µm |

Threshold was < 8.45 %. Result 72.549 % — **4.3× the wrong way**. P2 is falsified.

### P2 again, re-based on TODAY'S code (the comparator §6 forced), matched to 0.04 %

| | triangles | alloc | over 10 µm | MAX |
|---|---|---|---|---|
| control, flag OFF | 1 252 880 | 2 452 960, **drained** | **44.753 %** | 1162.977 µm |
| flagged, flag ON | 1 252 350 | 2 452 960, **CAPPED** | **73.775 %** | **974.528 µm** |

Falsified on the controlled comparison too: 1.65× the wrong way on the rate. The **max did fall 16 %**, which
is worst-first doing exactly what it claims — but 16 %, not the 2× predicted, and paid for with a rate that
nearly doubled.

---

## 6. A SECOND DEFECT: the committed STRATA baselines are not reproducible

The flag-OFF control existed to catch code drift. It caught it.

| GeoStar, flag OFF, identical settings | committed artifact (Jul 25) | today's code |
|---|---|---|
| triangles / alloc | 885 400 / 1 716 752 | **1 252 880 / 2 452 960** |
| own-ruler MAX | 4.999 µm PASS, 0 over | **28.889 µm FAIL**, 32 over |
| true metric, over 10 µm, 100 % coverage | 16.894 % | **44.753 %** |

Both drained their heaps. Five commits touched `_strataConformBisect.test.ts` after the artifact was written
(`564808ed`, `bfb0716c`, `b65bcdfd`, `7ae27e38`, `4c89c9fc`). My change is excluded: flag-OFF byte-identity
was verified independently.

**So the mesher regressed by 2.6× on the true metric between 2026-07-25 and 2026-07-28, while its own ruler
went on reporting a mesh it called fine.** Every scorecard row measured against those artifacts describes a
mesher that no longer exists. This is a bigger finding than the lever, and it is only visible because the
control was run.

### P2 on GothicArches, matched to 0.05 % (GPU screen, 100 % coverage)

| | triangles | over 10 µm | MAX |
|---|---|---|---|
| committed baseline | 1 979 816 | **10.774 %** | 829.050 µm |
| flagged, equal-alloc | 1 978 812 | **79.061 %** | 858.619 µm |

**7.3× the wrong way on the rate, and 3.6 % worse on the max.** Watertight in both cases (0 non-manifold,
0 seam-crack). Two styles, same verdict.

### P2 on Gothic re-based on TODAY'S code — the flagged arm had 32 % MORE triangles and still lost

| | triangles | over 10 µm | MAX |
|---|---|---|---|
| control, flag OFF | 1 504 648, **drained** | **13.824 %** | 829.050 µm |
| flagged, flag ON | 1 978 812 (+32 %), **CAPPED** | **79.061 %** | 858.619 µm |

Giving the flagged arm a third more triangles than its own control did not rescue it: 5.7× worse on rate.

*Caveat on the MAX column, stated rather than buried:* the committed baseline and today's control report an
IDENTICAL max of 829.050 µm despite differing by 475 168 triangles and by five commits. That means both left
the same worst facet untouched, and on a `ring`-stage mesh the prime suspect is the open boundary row — the
same ruler-domain artifact the handoff flagged for BasketWeave's 651.879 µm. The RATE is the statistic to
trust here; it is unambiguous either way, and no conclusion below rests on the max.

### The one place the lever did what it promised

GeoStar's max fell 1162.977 → 974.528 µm (16 %) while Gothic's rose 3.6 %. Worst-first DOES attack the worst
facet — when bisection can actually reduce that facet's error. Where the worst facet chords a feature,
splitting it yields children that still chord it, and the max does not move. That asymmetry is the mechanism
in §6b showing through in a single number.

## 6b. WHY IT FAILS — measured, by bucketing size against error jointly

A rate alone cannot separate "uniformly too coarse" from "bimodal: over-refined in hot spots, untouched
elsewhere", and the median triangle size cannot either. GeoStar, same code, matched triangle count, GPU
screen at 100 % coverage, bucketed by longest edge:

| longest edge | control: count / **AREA** / over-10 µm | flagged: count / **AREA** / over-10 µm |
|---|---|---|
| 5–20 µm | 0.02 % / 0.00 % / 0.00 % | 0.08 % / 0.00 % / 0.00 % |
| 20–50 µm | 1.90 % / 0.01 % / 0.13 % | 0.17 % / 0.00 % / 0.00 % |
| 50–150 µm | 8.67 % / 0.22 % / 2.41 % | 0.66 % / 0.00 % / 0.39 % |
| 150–500 µm | 20.86 % / 3.13 % / 11.48 % | 23.28 % / 4.36 % / **80.62 %** |
| 500–1500 µm | 34.44 % / 15.97 % / 35.67 % | 32.94 % / 14.86 % / 53.68 % |
| **1500–∞ µm** | 34.11 % / **80.67 %** / 87.55 % | 42.86 % / **80.78 %** / 87.10 % |

1. **Neither arm is in the adaptive regime at all.** ~81 % of the AREA of both meshes sits in facets over
   1.5 mm, failing at ~87 %. At this budget the honest answer is "the whole mesh is too coarse", and against
   that, scheduling is a second-order question.
2. **Worst-first with the honest key made the mesh COARSER, not finer.** The flagged arm has more huge facets
   (42.86 % vs 34.11 % of count) and almost no fine ones (0.91 % vs 10.59 % under 150 µm). The mechanism is
   visible in the algorithm: worst-first always jumps to the current global worst, which is always some huge
   facet somewhere else; it splits ONE edge; both children come straight back near the top of the heap. With
   45–74 % of the mesh over the bar it degenerates into slow breadth-first halving and can never build local
   fineness anywhere.
3. **The flagged mesh breaks monotonicity in size**: its 150–500 µm bucket fails at **80.62 %**, worse than
   its own 500–1500 µm bucket at 53.68 %, while the control's rate rises monotonically with size
   (0.13 → 2.41 → 11.48 → 35.67 → 87.55 %). Those small flagged triangles are the ones worst-first drove onto
   the hardest loci — it did exactly what it was told and got no reward, because a facet chording a feature
   stays over the bar until it is smaller than the feature.

The floor probe (§4) rules out the instrument: a 150–500 µm triangle at a random on-surface site fails ~4 %
of the time, not 80 %. The 80 % is a statement about WHERE those triangles are, not about the ruler.

**GothicArches makes the same point far more sharply**, at 1 978 812 vs 1 979 816 triangles:

| longest edge | baseline: count / **AREA** / over-10 µm | flagged: count / **AREA** / over-10 µm |
|---|---|---|
| 5–20 µm | 2.27 % / 0.01 % / 2.36 % | 0.65 % / 0.00 % / 2.20 % |
| 20–50 µm | 6.56 % / 0.06 % / 10.19 % | 1.06 % / 0.00 % / 3.30 % |
| **50–150 µm** | **32.67 %** / 2.37 % / 5.09 % | **2.74 %** / 0.00 % / 7.53 % |
| 150–500 µm | 42.97 % / 15.58 % / 9.65 % | 13.71 % / 0.84 % / 51.26 % |
| 500–1500 µm | 14.84 % / 70.08 % / 27.41 % | **66.20 %** / 53.94 % / **88.30 %** |
| 1500–∞ µm | 0.70 % / 11.91 % / 24.84 % | 15.48 % / 45.22 % / 86.10 % |

The baseline drove **32.67 %** of its triangles down into the 50–150 µm band and FINISHED those regions. The
flagged run, on the identical budget, left **66.20 %** of its triangles stranded at 500–1500 µm and got only
4.6 % below 150 µm. This is the clearest single statement of the failure: *worst-first on a
near-universally-failing population halves everything once instead of finishing anything*, and a fixed budget
spent that way buys a strictly coarser mesh.

## 7. WHAT THE FAILURE MEANS — stated as what is measured, not as a story

The ranking function is correct, validated, cheap, and it agrees with the independent auditor to 0.06 points.
Swapping it in makes the mesh worse at matched budget. Both statements are measured. The reconciliation the
data actually supports:

* With an honest key, **45–73 % of the mesh is over the accept bar**, against a few percent under the plane
  ruler. The heap therefore never drains — it GREW monotonically in every flagged arm — and the run caps.
* Worst-first over a queue that large is a near-uniform sweep, and bisection reduces the key slowly on a
  facet that chords a feature: the children still chord it. **668 095 no-op splits** on Gothic and **563 600**
  on GeoStar (both **0** in the controls) are the visible end of that: triangles the driver popped, tried to
  refine, could not, and dropped.
* The plane ruler's blindness was acting as an accidental budget allocator that finishes. An honest ruler
  refuses to finish — truthfully — and at a fixed budget that produces a worse mesh.

**The gap is not allocation, it is ~10² in triangle count** (§4), which no ranking function can close. That
is consistent with the ~100× allocation gap already recorded on 2026-07-27, now measured from the surface
side instead of the mesh side.

## 8. WHAT I DID NOT DO

* Did not tune `acceptTol`, `PF_CB_GPU_COVFRAC`, or the lattice level to rescue the number. The pre-registered
  comparison is the comparison.
* Did not run SNAP/REPROJECT with the new ranking function. Every arm here had them OFF (`snaps 0`,
  `transverse re-solves 0`), matching the baselines. That combination — honest ranking plus feature-conforming
  vertex placement — is the obvious next experiment and it is NOT tested by anything above.
* Did not re-audit the §5 "let it keep going" arms at full CPU coverage (4.5 M and 3.0 M triangles, ~2.7 h
  each). They are reported by the GPU screen only, and labelled as such.
