# S96 — THE 560 STRANDED FACETS ARE THE TAIL (253 µm, 3.8× THE UNIFORM SAMPLE'S REACH) AND 2.37% OF THE FAILING AREA

S95 priced the SHAPE-on Voronoi mesh at **0.86197% ±26.2%** of surface PROVEN-FAILING from a uniform
8,000-facet sample, and stated its own limit: the 560 `shape-ar` strandees are 0.114% of the mesh, so a
1.63%-coverage sample expects ~9 of them, and its in-sample max of 67.327 µm against the driver's
reported worst unresolved of 263.072 µm proved it had missed the worst. That number was therefore
*"a fair estimate of the TYPICAL cost and an UNDER-ESTIMATE OF THE TAIL"*. This arm closes that gap by
scoring **all 560 individually** — no sampling.

Tool `research/tools/s96StrandedTail.ts`, runner `run-s96-stranded-tail.sh`, report
`S96_STRANDED_TAIL.report.txt`.

## Method, and the two places it could have gone wrong

The driver deliberately does **not** emit H1 for these facets — its own comment says computing an
approximation there would create a third unvalidated ruler, against the standing rule that *"the
refinement ruler must equal the audit ruler"*. So H1 is applied from outside, with the same
`certifyTriangle` every other arm is scored on.

`tri` in the emitted record is the driver's **internal** index, which is not the shipped STL index
(dead triangles are skipped when the soup is built). Facets are matched on `(shortUm, midUm, longUm, z)`,
which the driver computed on **f32-rounded** vertices (`const ax = f32(vx[A])` at the emission site) —
exactly what the STL stores, so the key is exact rather than fuzzy.

**MATCH RATE: 560/560, 0 unmatched, 0 ambiguous.** The arm is admissible on its own gate (<90% would
have declared it inadmissible rather than reporting a shrunken population).

## RESULT

| | strandees (all 560) | S95 uniform arm (n=8,000) |
|---|---|---|
| PROVEN-FAIL | **472/560 = 84.29%** | 0.8375% ±12.2% |
| PROVEN-PASS / UNKNOWN | 88 / 0 | — |
| honest witnessed p50 | **21.650 µm** | — |
| p90 / p99 | 75.452 / 165.363 µm | — |
| **honest MAX** | **253.307 µm** | 67.327 µm (in-sample) |
| strandee area | 8.8263 mm² = 0.02185% of mesh | — |
| **failing AREA** | **8.2653 mm² = 0.02046% of mesh** | 0.86197% |

## THE ANSWER, AND IT CUTS BOTH WAYS

**They ARE the tail.** Honest max **253.307 µm** against the uniform sample's in-sample 67.327 µm —
**3.76×** beyond its reach. S95's caveat was correct and is now quantified. Even the MEDIAN strandee is
21.65 µm, i.e. **2.2× over the product bar**.

**And they are 2.37% of the failing area.** 0.02046% of surface against the uniform arm's 0.86197%. So
**97.6% of the failing surface is ordinary, non-stranded facets** — the strandees are a small, extreme
population, not the bulk of the defect.

**Being stranded is ~100× predictive of failing** (84.29% vs the mesh-wide 0.84%), so the driver's
`unresolved` list is an excellent *locator* of bad geometry even though it is a poor *account* of it.

⇒ **The aspect gate's trade is cheap.** S94/S95 showed it eliminates the degree-2,550 runaway and yields
a mesh 1.52× more accurate by area with 39% fewer triangles; S96 prices what it strands to do that at
**0.02% of surface**. There is no hidden bill.

## AN INSTRUMENT OBSERVATION WORTH KEEPING

On this population the driver's two rulers behave completely differently against honest H1:

| ruler | worst on these facets | vs honest MAX 253.307 µm |
|---|---|---|
| `keyUm` — the plane pop key | 49.910 µm | **0.20×** (5× under) |
| `sagNowUm` — the edge ruler, re-read on the shipped mesh | 263.072 µm | **1.04×** |

**The EDGE ruler tracks honest H1 to within 4% on the population that matters most**, while the plane key
under-reports it 5×. That is consistent with the campaign's standing ban on the plane ruler as a verdict
— and it suggests the edge ruler has been undersold. It is not a certificate and this is one population
on one mesh, but a 1.04× agreement at the extreme is worth a targeted follow-up before anyone builds
another expensive screen.

## WHY THESE FACETS EXIST — the refusal is correct, not a failure

Sample record: `ar3 43.337` but `parAR 83.919`, `shortUm 142.4 / midUm 1169.3 / longUm 1308`. The parent's
own aspect is **below** the 50 bar; the gate tests the **CHILDREN**, and theirs would be worse. So the
driver is not failing to split these — it is correctly declining to, because splitting does not help.
`unresolved: shape-ar 560` is "no admissible move", not "gave up".

## COST NOTE

720 s for 560 facets = **1.29 s/facet**, against ~0.04 s/facet on the uniform arm — **~32× more expensive
per facet**. These are 1.3 mm-long facets, and `certifyTriangle`'s lattice is `n = ceil(cov/tol)`, so a
0.65 mm covering radius at a 10 µm bar gives ~2,200 lattice points each. S80's observation that
certification cost scales with facet diameter is confirmed here at the extreme.

## WHAT REMAINS OPEN

The useful redirection: **97.6% of the failing area is ordinary facets**, not strandees and not
super-hubs. Whatever is wrong with this mesh is distributed, not concentrated in the populations the
campaign has been chasing. Orientation was not scored here — position only.
