# PRE-REGISTRATION — GPU screen as the driver's ranking function (STRATA-001)

**Written 2026-07-28, BEFORE any production run.** Everything in §1–§3 was measured before the flagged
mesher was launched. §4 is the falsifier; it is binding, and it will be reported as written whichever way it
resolves. Nothing below may be re-framed after the fact.

Prior: `research/lab/2026-07-28-strata001-handoff.md` §0 (the diagnosis, closed — not re-derived here) and §1
(the task). This document is the falsifier the handoff asked to be pre-registered.

---

## 1. What changed

One thing: **the quantity the driver ranks and accepts on.**

| | before (`PF_CB_GPU_RANK` unset) | after (`PF_CB_GPU_RANK=1`) |
|---|---|---|
| key | `sagAdaptive` — max over a barycentric lattice of the distance from an ANALYTIC point to the triangle's **INFINITE PLANE** | `screenTriangles` — max over a barycentric lattice of the true **PERPENDICULAR distance from a point OF THE TRIANGLE to the SURFACE** (radial foot + one-sided-limit jump closure + 2 Gauss-Newton steps) |
| where it runs | CPU, in-process | browser WebGPU, via Playwright-driven installed Chrome, `page.evaluate` |
| accept test | `key > acceptTol` ⇒ refine | `key > acceptTol` ⇒ refine (**unchanged threshold, unchanged witness semantics**) |

Deliberately NOT changed, so the experiment has one variable: the splitter, the locus machinery, the aspect
guard, the floor, `acceptTol = 0.007`, the grid, the triangle cap, and the final self-report audit.

**The accept test stays a WITNESS, not a certificate.** The screen also returns `covRad`, and
`mx + covRad/n + margin` would be a sound upper bound. Using that would ALSO make the driver sound — and
would confound this experiment, because at n=12 the covering term alone is ~L/12, so every triangle with
edges over ~84 µm would be refused on sampling grounds however well it fits. That is the measured failure of
the L4 escalating-accept lever (re-audit §14f: 93 % refused at n=12 vs 47 % at n=192 — 46 points of pure
artifact). `PF_CB_GPU_COVFRAC=1` restores the sound variant for a later, separate experiment.

## 2. Instrument checks passed before running

| check | result |
|---|---|
| bridge returns what the in-page instrument computes (handoff §1 step 1) | **1000/1000 triangles bit-identical**, `|Δmx|` and `|Δcov|` exactly 0 |
| GPU `rA` vs the mesher's own CPU `rA` (startup parity guard, refuses to open on disagreement) | **0.303 µm** (Gothic), **0.148 µm** (GeoStar) over 32 768 samples |
| dropped-dispatch guard | non-zero readings 1000/1000; all-zero buffers throw |
| flag unset reproduces the pre-change mesh byte-for-byte | **PASS** — sha256 `315216ea…3070` before and after the edit |
| my bridge reproduces the established GeoStar number (handoff §17b quotes GPU 16.75 % over-tolerance) | **16.894 %** at full coverage |

## 3. Baselines — measured, with coverage stated

| | GothicArches | GeometricStar |
|---|---|---|
| baseline STL | `gothicarches_D--.stl` | `geometricstar_ring_D--.stl` |
| triangles | 1 979 816 | 885 400 |
| grid / triCap / alloc | 200×140 / 6 000 000 / 3 903 632 | 200×140 / 9 000 000 / 1 716 752 |
| wall, converged? | 1468 s, heap DRAINED | 593 s, heap DRAINED |
| **driver self-report** | MAX 5.856 µm **PASS**, 0/1 979 816 over 10 µm | MAX ~5 µm **PASS** |
| independent CPU auditor H1 witnessed | **362.888 µm** at **22.4 %** coverage (443 467/1 979 816) | **193.846 µm** at **73.2 %** coverage (648 543/885 400) |
| GPU screen MAX (an upper bound, over-states) | 829.050 µm at **100 %** coverage | 1195.107 µm at **100 %** coverage |
| GPU screen over 10 µm | **10.774 %** at 100 % | **16.894 %** at 100 % |
| GPU screen over 7 µm (what the flagged driver will now refine) | **13.424 %** = 265 774 tris | **17.566 %** = 155 526 tris |
| GPU cert-sweep uncertifiable (12/48/192, gn 2) | 263 939 = 13.33 % | not run (sweep owes this row) |

**The blind spot, measured on the shipped artifact.** On a 6.25 % subsample of the Gothic baseline the new
ruler puts 12 986 triangles over 10 µm and the driver's own ruler flags **zero** of them. On a 14.29 %
subsample of GeoStar: 21 394 over, **zero** flagged. The old ruler's max on those same triangles is 5.856 /
8.218 µm — it is not reading them low, it is not reading them at all.

Both baselines converged with budget to spare, so this is not a budget result.

## 4. THE FALSIFIER — binding

**Hypothesis.** The residue is caused by the ranking function. Given the same splitter and the same triangle
budget, ranking on the true perpendicular distance makes the driver spend that budget on the facets the plane
ruler cannot see, and the independently-audited error falls.

**Prediction (P).** At equal grid, equal `triCap`, equal `acceptTol`:
* **P1** independent CPU auditor H1 witnessed max falls **≥2×** — Gothic < 181 µm, GeoStar < 97 µm.
* **P2** GPU-screen full-coverage over-10 µm rate falls **≥2×** — Gothic < 5.39 %, GeoStar < 8.45 %.

**Falsifiers.** Any of these resolves against the hypothesis and will be reported as a refutation, not
re-framed as a partial success:

* **F1 (primary).** Flag-ON H1 at full coverage is not lower than flag-OFF H1 **at the same coverage** by
  ≥2×. Both sides are re-measured at FULL coverage for this comparison — the 362.888 / 193.846 figures above
  are partial-coverage and can only rise, so they are the *reference*, not the comparator.
* **F2.** The GPU-screen full-coverage over-10 µm rate does not fall by ≥2×.
* **F3 (null lever).** The flag-ON mesh is byte-identical to the flag-OFF mesh ⇒ the lever is not wired.
  This is the exact failure mode of the §7 bounded-accept lever, which returned a byte-identical mesh for
  5.4× the cost. Hashes are compared first, before any error number is quoted.
* **F4 (gating).** Flag unset does not reproduce the pre-change mesh byte-for-byte. **Already tested: PASS.**
* **F5 (budget honesty).** If a flagged run ends `[CAPPED]` or `[TIME-CAPPED]` rather than heap-drained, the
  comparison is BUDGET-LIMITED and will be labelled as such — a trajectory, not a verdict. A capped run may
  not be quoted as a closure either way.

**Judging protocol.** `research/bridge/_strataFacetTruth.test.ts`, which shares no machinery with the mesher,
at **FULL coverage**, with the audited/total fraction quoted next to every number. Never the driver's
self-report — it said PASS at 5.856 µm on a mesh the auditor read at 362.888 µm. The GPU cert sweep is a
secondary, *not independent*, check now that the same screen steers the driver; it is reported as a screen
bound and labelled as such.

**Cost is recorded, not traded against.** Wall time, triangle count and GPU/transport seconds are reported
for both arms whatever the verdict.

## 5. Runs launched under this registration

```
NODE_OPTIONS=--max-old-space-size=8192 PF_STRATA_CB=1 PF_CB_DIRECTED=1 PF_CB_GPU_RANK=1 \
  PF_CB_STYLE=GothicArches   PF_CB_TRICAP=6000000 PF_CB_MAXSECS=10800 PF_CB_TAG_SUFFIX=_GPURANK
NODE_OPTIONS=--max-old-space-size=8192 PF_STRATA_CB=1 PF_CB_DIRECTED=1 PF_CB_GPU_RANK=1 \
  PF_CB_STYLE=GeometricStar  PF_CB_TRICAP=9000000 PF_CB_MAXSECS=10800 PF_CB_TAG_SUFFIX=_GPURANK
```
plus same-code flag-OFF controls at identical settings (tag `_CTRL`), because the committed baselines were
produced by an older revision of the mesher and a code-drift confound would otherwise be invisible.

### 5b. AMENDMENT, added while the §5 runs were still meshing and BEFORE the arm below was launched

Within 5 minutes the §5 runs made it clear they will end `[CAPPED]`: the heap is GROWING (Gothic 1.45 M
entries at 287 s, GeoStar 1.68 M at 297 s) and allocation is on course for the cap. Under F5 a capped run is
a trajectory, not a verdict — so as launched, §5 **cannot answer P1**. That is information in itself (the
true metric demands far more refinement than the plane ruler ever asked for) but it is not the test.

So a second flagged arm is registered here, before it runs, at **exactly the allocation the baseline
actually spent**:

```
PF_CB_TRICAP=3903632   # GothicArches   — the baseline's own alloc, which yielded 1 979 816 live triangles
PF_CB_TRICAP=1716752   # GeometricStar  — the baseline's own alloc, which yielded   885 400 live triangles
```

The alloc→live ratio is stable at ~1.96–1.97 in both arms, so this lands the flagged meshes within a few
percent of the baseline triangle COUNT. That is the clean form of the question: **given the same budget the
baseline spent, does ranking on the true metric spend it better?** P1 and P2 are judged on THIS arm. The §5
arm is reported alongside as the "let it keep going" trajectory and is explicitly not quoted as a closure.

No thresholds are changed by this amendment. P1 (≥2× on H1 at full coverage) and P2 (≥2× on the over-10 µm
rate) stand exactly as written.
