# S89 — `PF_S85_WORKERS` RESOLVED: DEFAULT 0 → 6, ON THE CONSUMER'S OWN MESH

## The question the flag was blocked on

S88 wired `s85PosRebase`'s per-facet `certifyTriangle` onto the existing H1 pool and left
`PF_S85_WORKERS` **defaulting to 0 (serial)** for one specific reason: S87 uses this tool as a
**bit-exact cross-tool reference** —

> `S87_LEDGER.md §C2`: *"C2 PASSES to the digit. Two independently-driven tools, different `rA`
> construction (this one takes the hoisted `_raFast` twin, s85 took `buildRadiusFn` directly), agree
> facet-for-facet."* — on **8,000 facets of `S39CTL`**.

A pooled path that perturbed a single per-facet value would silently break someone else's *passing*
gate. The S88 wiring proved byte-identity on LOWPOLY and S40AR90 — **but not on S39CTL**, which is the
only mesh that consumer actually stands on. So the flag stayed off, correctly.

## The decisive test

Re-ran the S87 consumer's own mesh, pooled, and `cmp`-ed against the **committed serial ndjson**:

| | committed serial | pooled W=14 |
|---|---|---|
| file | `s85rebase/S39CTL.uniform.ndjson` | `s85rebase/S39CTLPOOL.uniform.ndjson` |
| bytes | 7,188,468 | **7,188,468** |
| PROVEN-FAIL | 143/50,000 (0.2860%) | **143/50,000 (0.2860%)** |
| area-fail | 0.03534% | **0.03534%** |
| witnessed max | 240.059 µm | **240.059 µm** |
| plane over-bar | 3/50,000 | **3/50,000** |

```
*** BYTE-IDENTICAL — pooling cannot be observed by the S87 consumer ***
```

**W = 14 was chosen deliberately over the W = 6 the wiring was verified at.** More shards is a
*stronger* test of the merge-by-walk-index, not merely a faster run — a scheduling-dependent merge has
more opportunities to expose itself at 14 than at 6. It did not.

A distinct tag (`S39CTLPOOL`) was used so the run wrote a **new** file rather than overwriting the
reference it was being judged against.

## RESOLUTION

**`PF_S85_WORKERS` now defaults to 6.** `PF_S85_WORKERS=0` still forces the serial path.

Byte-identity now holds at **W=6** (LOWPOLY, S40AR90, one target arm) and at **W=14** (S39CTL). The
merge keys on the walk index, which one atomic cursor makes unique, so correctness is **not**
worker-count-dependent. Everything below is therefore a LOAD policy, not a correctness argument.

### Why 6, and not 14, and not `resolveWorkerCount()`

The measured product is **LATENCY, not throughput**. Three concurrent SERIAL slots already reach
~78.9 facet/s aggregate against one pooled arm's ~128.2 — so pooling buys only ~1.62× on a full batch,
but it turns a **34-minute arm into ~6.5 minutes**. 6 is verified end-to-end and leaves headroom on this
8-physical / 16-logical box.

> **If you launch three or more S85 slots at once, set `PF_S85_WORKERS` lower, or 0.**
> The tool cannot see the other slots, so it cannot choose for you. That is exactly why this is an
> explicit number and not `resolveWorkerCount()` — whose default (physical cores) is right for a box
> running one audit and wrong for this campaign's habitual three-slot queue.

### What is still NOT pooled

- The parent-side `sagAdaptiveRaw` + `tangExc` pre-pass. Amdahl caps the per-mesh gain: it is **91% of
  LOWPOLY's wall** (so that mesh sees only ~1.75×, already at its ceiling) but **6.9% on Gothic**. The
  tool prints the split.
- `raFast` is deliberately OFF in the workers — a measured 3.17× left on the table, because the serial
  control used `buildRadiusFn` and `_facetTruthRA`'s own mutation test shows no finite upfront sweep can
  certify the twin. Every speedup quoted here is therefore a FLOOR.
- Concurrent pooled arms: unmeasured, and nothing is claimed about them.

---

# S89 PART 2 — THE C2 CLAUSE WAS 72% OF THE FLIP PASS, AND HALF OF IT WAS COMPUTING A CEILING ALREADY CLEARED

S88 relieved the **census** of the banned plane ruler. The same ruler is also the **accept clause** inside
the sweep, and that had never been measured — only the reporting one had.

## Measured, Voronoi, `fastLevel 2`, plane census already off

```
C2 accept clause INSIDE the sweep: 220.0s = 72.1% of the pass, over 270,266 candidates
                                   ... and it VETOES 4,131 of them = 1.53%
```

86% of the sweep, for a veto that fires on one candidate in 65.

## The defect — visible once the number is in hand

```js
const allow = Math.max(BAR, posOfSlot(t1), posOfSlot(t2));   // >= BAR BY CONSTRUCTION
if (!(p1 <= allow && p2 <= allow)) { rej.pos += 1; continue; }
```

When `p1 <= BAR && p2 <= BAR` the clause **cannot fail** — yet both `posOfSlot` calls are evaluated
anyway, i.e. up to two extra `sagAdaptiveRaw` evaluations per candidate to compute a ceiling that was
already cleared. On this mesh the plane ruler reports **zero** facets over the 10 µm bar, so that is
very nearly every candidate.

**Identical by case analysis, not by testing.** (a) `p1,p2 <= BAR <= allow` ⇒ the old code evaluates
`allow` and accepts; the new code accepts without it — same verdict. (b) otherwise the new code computes
`allow` and applies the identical test. `posOfSlot`'s only side effect is populating `posC[t]`, and the
accept path overwrites `posC[t1]/posC[t2]` with `p1`/`p2` on the very next line either way, so the cache
state matches too.

## RESULT — same box, idle, back to back, `PF_LAND_C2SHORT` the only difference

| | control (`=0`) | short-circuit (`=1`, default) |
|---|---|---|
| flips / rounds | 266,135 / 20 | **266,135 / 20** |
| rejections | dirty 614,271 · dup 68,012 · fold 1,348,980 · noImp 2,189,913 · DET 52,057 · **POS 4,131** | **every counter identical** |
| geometry md5 | `20abccf57ae1ab32fd7bd6a3196bad4d` | **identical** |
| C2 clause | 152.7 s | **92.5 s — 0.606×** |
| **pass total** | 230.0 s | **170.5 s — 0.741×** |

**The identical `POS 4,131` is stronger evidence than the md5.** It proves the clause reached the same
verdict on each of the 270,266 candidates individually, not merely that the final meshes coincided.

### A number I nearly published and did not

The first short-circuit run measured 305.3 s → 170.5 s = 0.558×. **That baseline overlapped the W=14
pooled S39CTL run and was contention-inflated.** Re-running the control on an idle box gives the honest
0.741×. Same trap as K-S86b, caught the same way: never quote a ratio whose two arms did not run under
the same load.

## CUMULATIVE — all three levers, one box, one session, byte-identical throughout

Voronoi `voronoi_ring_D--`, 806,765 facets, 20 rounds. Every arm produced
`flips 266135 in 20 rounds` and md5 `20abccf57ae1ab32fd7bd6a3196bad4d`.

| configuration | flags | wall |
|---|---|---|
| pre-S86 baseline | `FAST=0  PLANECENSUS=1  C2SHORT=0` | **709.1 s** |
| today's default | `FAST=2  PLANECENSUS=0  C2SHORT=1` | **170.5 s** |
| | | **0.240× — a 4.16× speedup, 76.0% removed** |

The 709.1 s baseline sits within 1.7% of the 696.9 s S86 measured for the same configuration in a
different session, which is the reproduction check on the whole series.

Per-lever, each ratio from its own same-session pair (they are NOT multiplied to get the 4.16× — that
is measured end-to-end above):

| lever | flag | same-session ratio |
|---|---|---|
| S86 dirty-edge frontier | `fastLevel 0 -> 2` | 0.766× (Voronoi) / 0.620× (Gothic) |
| S88 banned-ruler census | `censusPlanePos -> false` | 0.410× |
| S89 C2 short-circuit | `c2ShortCircuit -> true` | 0.741× |

## The pattern across all three levers

Every win in S86, S88 and S89 came from **not computing something**, never from computing it faster:
the edges that cannot have changed (frontier), the banned ruler in the reporting (census), the ceiling
already cleared (C2). That is also *why* each survived a byte-identity gate — none of them changed what
the algorithm decides. The one lever that would have required computing something differently,
`buildEdges()` incrementally, is the one that turned out to be inadmissible.
