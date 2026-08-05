# S88 — THE FLIP PASS SPENDS 57% OF ITS WALL CLOCK ON A RULER THE CAMPAIGN HAS BANNED

**And my own "the next bottleneck is `buildEdges()`" was REFUTED by the first measurement that looked.**

Owner file `research/tools/landFlipPass.ts`, harness `research/tools/s81LandFlipGate.ts`.
Instrument: wall-clock accumulators around each phase. Timing only — every run below produced the
same mesh, md5 `20abccf57ae1ab32fd7bd6a3196bad4d`, so nothing here perturbs a verdict.

## Why this was measured at all

S86 landed the dirty-edge frontier: body entries 6.14× fewer on Gothic, 6.00× fewer on Voronoi, and
wall clock 0.620× / 0.766× / 0.967× on three meshes. I then asserted, in a commit message and to the
owner, that *"the sweep is no longer the bottleneck of this pass; the per-round rebuild is"*, and named
`buildEdges()` as the next lever.

**That was an inference from the Gothic-vs-Voronoi wall-ratio gap, not a measurement.** It is wrong.

## The attribution — Voronoi `voronoi_ring_D--`, 806,765 facets, 20 rounds, `fastLevel 2`

Three independent runs, consistent to within run-to-run noise on a loaded box:

| phase | run A | run B | run C | share |
|---|---|---|---|---|
| sweep (the edge walk + body) | 207.9 s | 213.4 s | 212.2 s | **~35%** |
| `buildEdges()` rebuild | 29.8 s | 31.1 s | 29.0 s | **~5%** |
| frontier star scan | 2.9 s | 3.0 s | 2.9 s | ~0.5% |
| census BEFORE | — | 170.9 s | 187.2 s | ~29% |
| census AFTER | — | 187.3 s | 175.4 s | ~29% |
| weld + gate + writeback | — | 4.3 s | 4.8 s | ~0.8% |
| **pass total** | 605.5 s | 610.0 s | 611.6 s | |

**`buildEdges()` is 5%.** A full typed-array/CSR rewrite of it — which is the only way to speed it up,
since it cannot be made incremental (see below) — returns at most that. It is not the next lever and I
should not have called it one.

**The two censuses are 58–59%.** And run C attributes inside them:

> **of which the plane ruler `sagAdaptiveRaw`: 348.5 s = 57.0% OF THE ENTIRE PASS**

That is 96% of all census cost. Everything else in the census — `orientOf`, `areaOf`, `maxAngOf`,
`jitterUmOf` over every facet, twice — is ~14 s combined.

## What makes this a defect rather than a cost

`sagAdaptiveRaw` is the ruler this campaign has already ruled inadmissible. From
`research/lab/2026-08-05-STRATA-STATE-OF-THE-CAMPAIGN.md`:

> `| position, cheap | sagAdaptiveRaw / the driver headline | ***BANNED as a verdict.*** 21–1,527× under, 28–37% over. Ranking only. |`

So the pass was spending **the majority of its wall clock computing, twice, over 806,765 facets, a
number that is not admissible as a verdict.** It is not a tradeoff between speed and information —
the information was already withdrawn.

**It never fed the algorithm.** The census calls `posPlaneSlot` DIRECTLY; the C2 accept clause uses the
cached `posOfSlot`. The two do not share a code path, so removing the census loop cannot move a flip —
and the md5 proves it did not.

## THE FIX — `censusPlanePos`, DEFAULT FALSE

`landFlipPass.ts` gained `censusPlanePos?: boolean` (default **false**), overridable in the gate with
`PF_LAND_PLANECENSUS=1`. The driver call site passes nothing, so it inherits the default and gets the
saving for free.

**When off, the fields read NOT-MEASURED — `posOver = -1`, `posP99 = NaN`, `posMax = NaN` — and both
printers say so in words.** This is deliberate and it is the one thing not to get wrong here: `pq()`
returns 0 on an empty array, so the naive version of this change would have printed
`POSITION (plane ruler) over-10um 0` for a ruler that never ran. **A disabled gate that prints a
passing number is worse than no gate** — that is the vacuous-bar failure this campaign has already been
bitten by once.

## Why `buildEdges()` cannot simply be made incremental (recorded so nobody retries it)

Per flip the edge map changes O(1): `(u,v)` is removed, `(c,d)` is added, and two of the quad's edges
swap which triangle owns them. So an incremental patch looks obvious. It is not available:

**the sweep iterates `for (const [k, l] of em)` in Map INSERTION order, and that order is load-bearing**
— it decides which of two adjacent candidates wins the `dirty` race and therefore which flip happens.
A full rebuild inserts in current-triangle order; an incrementally-patched map keeps old positions and
appends new keys at the end. Different order ⇒ different greedy result ⇒ not byte-identical.

The only admissible speedup for `buildEdges()` is a cheaper structure preserving first-seen order (a
typed-array CSR plus an explicit key-order array instead of a `Map` of 1.71 M small arrays). At 5% of
the pass, that is not worth doing now.

## RESULT — VERIFIED. 0.410× WALL CLOCK FOR A BYTE-IDENTICAL MESH.

Same mesh, same code, back-to-back on the same box; the ONLY difference is `censusPlanePos`:

| | plane census ON | plane census OFF |
|---|---|---|
| flips / rounds | 266,135 / 20 | **266,135 / 20** |
| geometry md5 | `20abccf57ae1ab32fd7bd6a3196bad4d` | **`20abccf57ae1ab32fd7bd6a3196bad4d`** |
| census BEFORE | 187.2 s | **6.1 s** |
| census AFTER | 175.4 s | **5.7 s** |
| plane ruler | 348.5 s (57.0%) | **0.0 s** |
| **pass total** | 611.6 s | **250.8 s — 0.410×, a 2.44× speedup** |

The NOT-MEASURED reporting works as intended — both printers emit
`POSITION (plane ruler): NOT MEASURED — banned as a verdict…`, never a zero.

**This single default is a larger win than the entire S86 frontier on this mesh** (0.410× vs 0.766×),
and it was bought by deleting a measurement rather than by optimising code.

### The remaining profile, and the honest next target

With the banned ruler gone the pass is 250.8 s and reads:

```
sweep        202.4 s (80.7%)
buildEdges    29.3 s (11.7%)
census x2     11.8 s ( 4.7%)
frontier       2.8 s ( 1.1%)
weld+gate+wb   4.5 s ( 1.8%)
```

`buildEdges()` is now a larger SHARE (5% → 11.7%) purely because the denominator shrank — it is the
same ~29 s it always was. **The absolute next target is the sweep at 202.4 s**, and the honest options
there are (a) skipping the 1.71 M-edge `em` walk itself in late rounds by iterating the frontier in
recorded `em` order rather than `continue`-ing past non-members, or (b) nothing — 250.8 s for a
1.14 M-facet-class mesh may simply be enough. Neither is claimed here; both are unmeasured.
