# S86 — THE FLIP SWEEP DOES O(rounds × |E|) WORK FOR O(flips) OF RESULT

**Pre-registered before the first A/B was run.** Owner file: `research/tools/landFlipPass.ts`
(`fastLevel`), harness `research/tools/s81LandFlipGate.ts` (`PF_LAND_FAST`).

This is a COST finding, not a quality finding. Nothing here changes which flips are accepted, and the
kill criterion is written so that "it got faster" is not admissible on its own — the mesh has to come
out byte-identical or the arm is dead.

## The measurement that motivated it

From `S81_LANDGATE_GATE.report.txt` (GothicArches `S39CTL`, 1,142,166 facets, 19 rounds, 889.5 s):

| rounds | flips | share of all flips |
|---|---|---|
| 1–4 | 420,179 | 97.13% |
| 5–8 | 11,102 | 2.57% |
| 9–19 | **1,316** | **0.30%** |

And the cost does not follow the yield. The rejection counters' per-round deltas flatten by round ~5
and stay flat through round 19 — a round that produced **zero** flips:

```
noImprove delta/round:  660,809 -> 1,057,314 -> 1,209,130 -> ... -> 1,306,376 (round 19)
fold      delta/round:  212,929 -> ~292k -> ~338k -> ... -> 379,862 (round 19)
per-round total:  379,862 + 23,719 + 1,306,376 + 2,454 + 258 = 1,712,669
                                                            = 1,713,829 edges - 1,160 boundary
```

Every round re-examines **every interior edge**, and additionally recomputes `score[t]` for **all**
`nTri` (`orientOf` = 5 rA evals each ⇒ 5.71 M rA per round). `dirty` exists but is allocated *inside*
the round and discarded at the round boundary — it is a same-round re-entry lock, not a frontier.

Wall clock is NOT flat, and the campaign already published the datum that says so
(`S80_LAND_FINDINGS.md:490`): `round 1 = 76.8 s of 890 s`. With ~170 s of census, the 19 rounds share
~720 s ⇒ ~37.9 s average, so **round 1 ≈ 2.03× a later round** — the plane C2 ruler fires on 257,512
candidates in round 1 and 258 in round 19. So rounds 9–19 are **57.9% of candidate evaluations but
≈44% of wall clock**. The 44% is the number this file is trying to recover, not the 57.9%.

## What was built

`fastLevel`, default **0 = the committed sweep**, so an unflagged run is the control.

* **1** — hoist the `score` recompute out of the round loop. `score[t]` is a pure function of the index
  triple (a connectivity-only pass never moves a vertex) and the accept path already maintains it
  exactly (`score[t1] = g1` written alongside `ta[t1] = n1[0]`), so the per-round recompute reproduces
  the bits already in the array. **Provably redundant**, 18 of 19 rounds × 5.71 M rA evals.
* **2** — level 1 + the **dirty-edge frontier**. An edge's verdict reads only its two triangles' index
  triples, their `score`/`posC`, `live`, membership of the opposite key in `em`/`created`, and the
  per-round `dirty`. If none moved, last round's rejection is this round's rejection.

Frontier = (a) every edge of every triangle touching a vertex of a flipped quad `{u,v,c,d}` ∪ (b) the
edges rejected last round for the two PER-ROUND reasons (`dirty`, a `created` dup).

**(a) covers the `em.has(kcd)` dependency**: an edge dup-blocked by `(c,d)` has its two triangles in
the stars of `c` and `d`, so if a later flip removes `(c,d)` — making that flip's `u,v` equal to
`c,d` — the blocked edge is already in the frontier.

### Why the visit ORDER is preserved, and why that was the trap

The pass is greedy and order-dependent: `dirty` blocks the second of two adjacent candidates, so
whichever is visited first wins. **Iterating the frontier set would re-order the visits and hand the
win to a different edge.** The frontier is therefore applied as a `continue` INSIDE the existing `em`
walk — same iteration, same order, expensive body skipped. Map-iteration + one Set probe costs
nanoseconds against a body that spends 10 rA evals.

### The within-round case that looked like a divergence and is not

An edge later in `em` order than a flip that touched its triangles: the full sweep visits it with
changed state, the frontier skips it. They agree because the full sweep **rejects it on `dirty`** —
that is precisely the edge `dirty` exists to block. Both paths produce no flip, and the edge enters the
next round's frontier either way (via `touchedV`). No divergence.

**Consequence for the A/B: the rejection counters MUST diverge.** `rej.dirty` / `rej.fold` /
`rej.noImprove` are all lower at level 2 because the body is never entered. Comparing `rej.*` across
levels is meaningless and is not a kill criterion. Compare the mesh and the flips.

## KILL CRITERIA — fixed before the first run

* **K-S86-VAC (non-vacuity, checked first).** `candBody` and `scoreEvals` must both FALL from level 0
  to level 2, and `frontierSkipped` must be > 0. If the work counters do not move, the frontier did
  nothing and the arm is vacuous — report it and stop. A wall-clock win with unmoved counters is
  measurement noise, not a lever.
* **K-S86a (the only clause that decides shipping).** The output STL's **vertices-only geometry md5**
  at level 1 and level 2 must equal the level-0 control's, AND `flips` must be equal, AND the
  **per-round flip sequence** must be equal. Any difference ⇒ the frontier is UNSOUND, it is not an
  optimisation, and it does not ship regardless of speed.
* **K-S86b (the cost claim).** Report wall clock as a ratio against the level-0 control **measured in
  the same session on the same box**, never against the committed 889.5 s — this machine is running
  other jobs and `project_strata_baselines_not_reproducible` says committed baselines do not reproduce.
  If the control does not reproduce the committed flip count (432,597 / 19 rounds), say so and treat
  every ratio here as provisional.

## What is NOT claimed

- Not a quality change. Orientation, position, and topology outcomes are the level-0 outcomes by
  construction — that is what K-S86a asserts.
- Not a fix for `buildEdges()`, which is still O(nTri) per round. It was left alone deliberately: it
  spends no rA and the sweep body dominates. If K-S86b lands and the remaining cost is the rebuild,
  that is the next lever, not this one.
- Nothing about the driver's `PF_LAND_FLIP` default, which stays OFF.

---

## RESULTS

*(appended by the A/B when it runs — level 0 control first, then 1, then 2)*

| level | mesh | nTri | flips | rounds | geometry md5 | candBody | scoreEvals | frontierSkipped | secs |
|---|---|---|---|---|---|---|---|---|---|
