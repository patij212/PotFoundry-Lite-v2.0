# Generator Round 2 — Response to Verifier Critique

**Date**: 2026-03-03  
**Status**: Response + Revised Proposal

---

## Acknowledgments

The Verifier's critique is sharp and correct on all factual points. I accept every amendment and retract where I was wrong.

### C2 — resnapChainToMeasuredPeaks Location: ACCEPTED

I presented the pipeline ordering imprecisely. `resnapChainToMeasuredPeaks` lives inside `postProcessFeatureChains`, called at the tail of `linkFeatureChains` (L603), not as a standalone PEC step. The Verifier is right that modifying it affects `postProcessFeatureChains` internals, not PEC orchestration.

### C4/H4 — Momentum Positive Feedback Loop: ACCEPTED AS CRITICAL

I classified this as "POSSIBLE." The Verifier correctly escalates it to **CRITICAL**. Here's why I now agree:

The velocity is computed from **exactly 2 consecutive points** (L499-505):
```
uVel = (last.u - prev.u) / rowSpan
```

ONE mis-assignment poisons the velocity, which poisons the prediction, which uses a 2× wider search radius, which increases the probability of the NEXT mis-assignment. This is a geometric amplifier, not a linear one.

**New insight** from accepting this: The momentum loop explains why the user sees chains that are "extremely jagged" rather than just "slightly noisy." A chain that's 99% correct but gets ONE wrong assignment can spiral into a zigzag cascade for 6-12 subsequent rows until it either recovers or dies.

### C8 — resnapChainToMeasuredPeaks is a No-Op: ACCEPTED

The Verifier catches what I missed: `linkFeatureChainsCore` stores `rowFeats[cand.featIdx]` at L490 — the **exact** measured peak position. The linker never stores a position that isn't already a measured peak. So `resnapChainToMeasuredPeaks` snaps each point to the nearest measured peak... which is the same measured peak already stored. It's a no-op.

**Retraction**: My claim that "resnap DECREASES precision" is wrong. It can't decrease precision of something it doesn't change. I accept the Verifier's recharacterization: remove it because it's dead code, not because it's harmful.

### C5 — Link Radius 0.02 vs 0.015: ACCEPTED

The Verifier's argument is better: 0.02 = half the current value, leaves headroom for 5-petal spirals (0.2 spacing, 10%), still below danger for 10-petal (0.1 spacing, 20%). My 0.015 was arbitrary.

### C6 — MAX_MISS_COUNT Stay at 6: ACCEPTED

The Verifier is right — increasing miss tolerance with tighter radius and broken momentum is dangerous. A chain that's been running on predictions for 8 rows with a wrong velocity will be far from any correct feature when it finally gets a match opportunity.

### C10 — DBSCAN Can't Handle Topology: ACCEPTED

DBSCAN merges spatially close but topologically distinct features. The chain linker's row-by-row approach respects temporal ordering. This is a genuine advantage I overlooked.

### C11 — CDT Constraints Misconception: ACCEPTED

I confused edge orientation with edge direction. CDT constraint edges connect vertex A to vertex B — the "direction" is the straight line between them. You can't orient a CDT edge along a tangent. The companion point cloud already addresses local density from a different angle.

---

## Defense (Where I Stand Firm)

### D1: Diagnostic Instrumentation is the Right First Step

The Verifier and I fully agree on this. No code changes until we can measure. The Verifier's implementation conditions (Phase A item 1) are exactly right.

### D2: The Momentum Fix Should Be PART OF Phase A, Not Phase B

The Verifier puts "momentum smoothing" in Phase B. I disagree. The Verifier's own C4 analysis proves momentum is the **most dangerous** failure mode — a positive feedback loop that amplifies any mis-assignment. Tightening the link radius (Phase A item 3) without fixing momentum is dangerous: a tighter radius means chains MISS more often, which triggers momentum prediction MORE often, and broken momentum with a tight radius means chains die after 6 misses instead of recovering.

**Counter-proposal**: Fix momentum as Phase A item 2.5 (after diagnostics, after resnap removal, BEFORE radius tightening). Use the Verifier's own suggestion: compute velocity from median of last 3+ points instead of last 2. This is a 5-line change that dramatically reduces the feedback loop's severity.

Specifically, instead of:
```typescript
const last = pts[pts.length - 1];
const prev = pts[pts.length - 2];
uVel = (last.u - prev.u) / rowSpan;
```

Use a windowed velocity (last 3-5 points) with outlier rejection:
```
Collect last min(N, 5) U-deltas
Sort by magnitude
Take the median
Use as velocity
```

This kills the "one bad point cascades" problem at the root. A single mis-assignment's delta gets rejected as an outlier. The chain continues on the median trajectory of its last several correct steps.

### D3: Link Radius Should Be Data-Driven Eventually, But 0.02 Is Good For Now

The Verifier suggests making link radius "data-driven" (3× measured jitter). I agree in principle but this creates a chicken-and-egg problem: you need well-linked chains to measure jitter, and you need the right radius to get well-linked chains. A hardcoded 0.02 with the momentum fix is the pragmatic path. The data-driven approach belongs in v3.0 with the Generator's Proposal 4 (curve fitting).

---

## Revised Implementation Plan (Converged)

### Phase A — Immediate (in order)

**A.1: Diagnostic instrumentation** (no behavior changes)

Add to PEC after Step 3.6 (post-smoothing):
- Per-chain: max deviation from local linear fit (5-point window)
- Per-chain: max consecutive-point U-delta
- Per-row: min distance between same-kind features (answers Verifier Q1)
- Count: how many points `resnapChainToMeasuredPeaks` actually moves (answers Verifier Q2, expected: 0)

**A.2: Remove `resnapChainToMeasuredPeaks`** from `postProcessFeatureChains`

Since it's confirmed as a no-op, this is trivially safe. Modify `postProcessFeatureChains` in ChainLinker.ts to only call `suppressDuplicateChains`:
```typescript
export function postProcessFeatureChains(chains, allRowFeatures) {
    return suppressDuplicateChains(chains);
}
```

Note: `allRowFeatures` parameter becomes unused. Verifier should decide: keep for API stability or remove?

**A.3: Fix momentum velocity** (median of last 3+ points instead of last 2)

In `linkFeatureChainsCore`, replace the 2-point velocity computation (L496-510) with:
1. Collect the last `min(pts.length, 5)` unwrapped U-deltas per row
2. Sort by magnitude
3. Take the median as the velocity estimate

This is ~10 lines replacing ~8 lines. Kills the positive feedback loop.

**A.4: Tighten link radius** to 0.02

- `CHAIN_LINK_RADIUS`: 0.04 → 0.02
- Primary pass momentum scale: 2.0 → 1.5 (MOMENTUM_LINK_RADIUS = 0.03)
- Secondary pass: 0.014 radius, momentum 1.25 (unchanged)
- `MAX_MISS_COUNT`: stays at 6

**A.5: Re-run diagnostics** with A.2-A.4 applied

Compare before/after metrics from A.1. Expected improvements:
- Max deviation from linear fit: should drop 50%+
- Max consecutive delta: should drop 30%+
- No chains with sawtooth pattern (successive +/- deltas > 0.005)

### Phase B — After Validation

**B.1**: Hungarian assignment — only if diagnostic shows >5% of rows with same-kind feature contention at radius 0.02

**B.2**: Data-driven link radius — measure actual per-row jitter across all styles, set radius to 3× max jitter

---

## Answers to Verifier's Open Questions

**Q1: What fraction of rows have same-kind features closer than 0.04?**
Can't answer without instrumentation. This is exactly why A.1 logs `min distance between same-kind features per row`. The answer will come from the diagnostic run.

**Q2: How many points does resnapChainToMeasuredPeaks actually move?**
Prediction: 0 or near-0, based on the Verifier's C8 analysis. The linker stores exact measured positions. But we should verify empirically per A.1.

**Q3: What is the actual per-row U-jitter of correctly linked chains?**
Can't answer without instrumentation. A.1's `max consecutive-point U-delta` metric will reveal this. For a vertical chain (constant U), jitter is the ±0.00006 sampling quantization from 8192 probes. For diagonal chains, the raw delta includes both jitter AND genuine feature drift — need to subtract the local linear fit to isolate jitter.

**Q4: Should momentum be fixed BEFORE radius tightening?**
**YES.** This is my D2 defense above. The Verifier correctly identified momentum as the most dangerous failure mode but then deferred it to Phase B. Fixing momentum FIRST means the radius tightening can be more aggressive without chains dying from prediction drift.

**Q5: Is SG smoothing moving points off the mathematical feature?**
By ±0.0002 at most (the SG window is 7 points, well within sampling noise). This is sub-pixel in any mesh resolution. After the momentum + radius fixes, the SG smoother should be removing genuine noise, not mathematical signal. If diagnostics show SG is moving points by more than ±0.001, we should reconsider the halfwidth.

---

## Summary of Convergence State

| Item | Generator | Verifier | Converged? |
|------|-----------|----------|-----------|
| Resnap removal | ✅ Remove | ✅ Remove (it's a no-op) | ✅ YES |
| Link radius | 0.02 | 0.02 | ✅ YES |
| MAX_MISS_COUNT | 6 | 6 | ✅ YES |
| Momentum scale | 1.5 | 1.5 | ✅ YES |
| Momentum fix timing | Phase A | Phase B | ❌ DISPUTED — see D2 |
| Hungarian | Deferred | Deferred | ✅ YES |
| DBSCAN | Withdrawn | Rejected | ✅ YES |
| Ridge direction | Withdrawn | Rejected | ✅ YES |
| Diagnostics first | ✅ | ✅ | ✅ YES |

**Single disputed item**: Momentum fix timing. I argue Phase A (before radius tightening), Verifier said Phase B (after validation). This is the one thing the Verifier needs to rule on.
