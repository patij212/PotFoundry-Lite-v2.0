# Verifier Round 1 — Critique of Generator's Chain Jaggedness Proposals
Date: 2026-03-03

## Summary Verdict: ACCEPT WITH AMENDMENTS (Proposals 3, 1) / REJECT (Proposals 2, 4, 5 for now)

The Generator correctly identifies the symptom (jagged chain polylines) and proposes five fixes ranked by priority. The root cause analysis is directionally correct but contains a factual error about the pipeline ordering, and the priority ranking is wrong. I'll address each hypothesis and proposal in order.

---

## Critique of Root Cause Analysis

### C1 [NOTE]: Hypothesis 1 — CHAIN_LINK_RADIUS Cross-Assignment — ACCEPTED with caveats

**Generator's claim**: "CHAIN_LINK_RADIUS = 0.04 is HUGE — that's 4% of the full circumference. For a pot with 10 petals, features are spaced 0.1 apart. A link radius of 0.04 means a chain can jump 40% of the way to the next feature."

**Verification**: Confirmed.
- `CHAIN_LINK_RADIUS = 0.04` at ChainLinker.ts L24
- `MOMENTUM_LINK_RADIUS = 0.08` (primary pass: `0.04 * 2.0`) at ChainLinker.ts L421
- For 10-petal styles: feature spacing ~0.1, momentum radius 0.08 = **80% of inter-feature distance**

**Caveat**: The Generator assumes cross-assignment is the PRIMARY cause of jaggedness. This is plausible but unproven. The diagnostic instrument (max deviation from local linear fit) proposed at the end is the right way to verify. Without that data, we're guessing.

**Counter-consideration**: `linkFeatureChainsByKind` (v16.3) already separates peaks from valleys before linking. So cross-assignment can only happen between same-kind features. For a 10-petal style with 10 peaks and 10 valleys, separated by kind, the spacing between same-kind peaks is 0.1 — still tight for a 0.04 radius but not catastrophic. The problem is worse for styles with multiple harmonic peaks per lobe (e.g., composite superformula styles where sub-peaks cluster at ~0.02 apart).

**Verdict**: ACCEPTED as a contributing factor, but severity depends on style. The Generator should estimate what fraction of rows actually have features close enough for cross-assignment.

### C2 [CRITICAL]: Hypothesis 2 — resnapChainToMeasuredPeaks Ordering — FACTUAL ERROR

**Generator's claim**: "resnapChainToMeasuredPeaks snaps to CRUDE 8192-sample peaks BEFORE GPU re-snap. This is backwards."

**Actual behavior**: The Generator correctly states the ordering but incorrectly describes it as two separate sequential pipeline steps. In reality, `resnapChainToMeasuredPeaks` is called **INSIDE** `linkFeatureChains` via `postProcessFeatureChains`:

```
PEC L894: let chains = linkFeatureChainsByKind(...)
  -> ChainLinker.ts L642: linkFeatureChains(peakRows, numRows)
      -> ChainLinker.ts L603: return postProcessFeatureChains([...primary, ...secondary], allRowFeatures)
          -> ChainLinker.ts L243: resnapChainToMeasuredPeaks(chain, allRowFeatures)
PEC L906-961: GPU re-snap (Step 3.5)
PEC L963-985: smoothChainPath + filterLowConfidenceChains (Step 3.6)
```

The ordering IS: link -> resnap-to-crude -> GPU-resnap -> SG-smooth. But "resnap-to-crude" is an internal step of the linker, not a separate pipeline stage. **This matters for Proposal 3** — removing resnap means modifying `postProcessFeatureChains`, which affects ALL callers of `linkFeatureChains`, not just the main pipeline.

**Impact on Generator's analysis**: The Generator's argument that "resnap DECREASES precision" is still valid regardless of where the call lives. The logical ordering problem exists either way.

**Verdict**: ACCEPTED directionally, REJECTED on implementation detail. The fix location must be stated precisely.

### C3 [NOTE]: Hypothesis 3 — SG Boundary Effect — ACCEPTED as MINOR

Correctly identified as a boundary effect. The SG filter's boundary preservation (keeping original values for first/last `m` points) can create a visible jump if the original boundary points were noisy. But this is negligible for chains of 100+ points where only 6 out of 200+ points are affected.

### C4 [WARNING]: Hypothesis 4 — Momentum Amplification — UNDERESTIMATED

**Generator's claim**: "If the velocity itself was wrong (due to previous mis-assignment), the prediction points to the WRONG feature with an even larger search radius."

This is correct but the Generator didn't follow through on the implications. The momentum velocity is computed from **two consecutive points**:

```typescript
// ChainLinker.ts L499-505
const last = pts[pts.length - 1];
const prev = pts[pts.length - 2];
const rowSpan = last.row - prev.row;
if (rowSpan > 0) {
    let uVel = (last.u - prev.u) / rowSpan;
```

If even ONE point is a cross-assignment (point assigned to wrong feature), the velocity becomes wrong for ALL subsequent momentum-based predictions. This is a **positive feedback loop**: wrong assignment -> wrong velocity -> wider search at wrong location -> more wrong assignments. This makes the cross-assignment problem from Hypothesis 1 MUCH worse than the Generator acknowledges.

**Verdict**: ACCEPTED but should be classified as a CRITICAL amplifier, not a POSSIBLE side effect.

---

## Critique of Proposals

### Proposal 1: Tighten Link Radius — ACCEPT WITH AMENDMENTS

**Generator proposes**: Reduce `CHAIN_LINK_RADIUS` from 0.04 to 0.015, reduce momentum scale from 2.0 to 1.5, increase `MAX_MISS_COUNT` from 6 to 8.

**My assessment**:

**C5 [WARNING]**: The value 0.015 is presented without mathematical justification. The "right" link radius depends on the per-row U-jitter of correctly-linked chain points. If a chain vertex drifts by at most +/-0.003 per row (plausible for smooth features), a link radius of 0.01 would suffice. If features genuinely move 0.01 per row (steep spiral), 0.015 may be too tight.

**Recommendation**: Make it **data-driven**. After the SG smoothing fix, the per-row U-jitter should be minimal. Measure the actual max `|unwrapped[i] - unwrapped[i-1]|` across all chains after smoothing. Set link radius to 3x that value. This is better than picking a constant.

For now: **0.02** is a better starting point than 0.015. It's half the current value (meaningful reduction), leaves headroom for 5-petal spiral features (0.2 spacing, 0.02 = 10%), and is still well below the danger zone for 10-petal styles (0.1 spacing, 0.02 = 20%).

**C6 [WARNING]**: Increasing `MAX_MISS_COUNT` from 6 to 8 is risky. More misses with momentum = more time the chain is running on predicted positions with no ground-truth correction. Combined with a tighter radius, if the prediction drifts beyond the new radius, the chain will NEVER recover. Recommendation: **keep MAX_MISS_COUNT at 6** and reduce momentum scale to 1.5 as proposed. This limits the damage from bad predictions.

**Amended proposal**: 
- `CHAIN_LINK_RADIUS` -> 0.02 (not 0.015)
- `momentumScale` primary pass -> 1.5 (accepted)
- `MAX_MISS_COUNT` -> 6 (unchanged, NOT 8)

### Proposal 2: Hungarian Assignment — REJECT (for now)

**Generator's claim**: "O(n^3) per row where n = max(num_chains, num_features) — typically n < 30, so < 27K operations per row at worst."

**C7 [CRITICAL]**: The Generator assumes n < 30 but doesn't verify. For complex styles with superformula composites:
- 10 peaks + 10 valleys = 20 features per row (separated by kind -> 10 peaks per linking pass)
- But harmonic composite styles can have 20+ peaks of the same kind per row
- At n=20: Hungarian is 8K ops/row x 409 rows = 3.3M ops. Acceptable.
- At n=40: 64K ops/row x 409 rows = 26.2M ops. Still acceptable.
- But: Hungarian requires a **dense cost matrix** plus the algorithm implementation. This is significant new code.

**The real issue**: Proposals 1 + 3 together may solve 90%+ of the jaggedness without any new algorithm. Adding Hungarian is the right fix IF the greedy assignment is demonstrably producing wrong results even with a tight radius. We don't have that evidence yet.

**Verdict**: DEFERRED. Implement Proposals 1 + 3 first, measure remaining jaggedness, THEN decide if Hungarian is needed. The Generator should propose a diagnostic metric (e.g., "count rows where two chains wanted the same feature") that would trigger the Hungarian implementation.

### Proposal 3: Eliminate resnapChainToMeasuredPeaks — ACCEPT WITH AMENDMENTS

**Generator's claim**: This is a zero-cost improvement that removes a precision-degradation step.

**C8 [WARNING]**: Not quite zero-cost. The chain linker stores `rowFeats[cand.featIdx]` — the exact 8192-sample peak position — for every matched point:

```typescript
// ChainLinker.ts L493
ac.chain.points.push({ u: rowFeats[cand.featIdx], row: j });
```

Chain points are ALWAYS at exact measured peak positions. Unmatched chains keep their `predictedU` but DON'T add a point to the chain. So `resnapChainToMeasuredPeaks` is a **NO-OP** for correctly linked points (the nearest measured peak IS the one already stored). It can only change a point if the linking somehow stored a non-peak position, which doesn't happen from the code above.

**Conclusion**: `resnapChainToMeasuredPeaks` is likely a no-op in practice. Removing it is safe and correct, but won't change behavior. The Generator's hypothesis that it "undoes GPU precision" is **wrong** — it runs BEFORE GPU re-snap, so it can't undo what hasn't happened yet. And since it snaps to the exact same peaks the linker already used, it probably doesn't move anything.

**C9 [NOTE]**: The Generator should verify this empirically before removing. Add a temporary log: how many points does `resnapChainToMeasuredPeaks` actually move? If the answer is 0 or near-0, the removal is trivially safe. If >0, the points that moved are diagnostic clues about linker misbehavior.

**Amended verdict**: ACCEPT removal, but the rationale changes: remove it because it's dead code (effectively a no-op), not because it "degrades precision."

### Proposal 4: DBSCAN + Spline Regression — REJECT

**C10 [CRITICAL]**: This replaces the entire chain-linking infrastructure. The Generator says "v3.0 horizon" — agreed. But the proposal has a fundamental flaw: DBSCAN clustering operates on spatial proximity, not topological connectivity. Two features that are spatially close but topologically different (e.g., two ridges that approach each other in U-space then diverge) will be merged into one cluster. The chain linker's greedy approach at least respects the temporal ordering (row-by-row), which DBSCAN wouldn't.

**Also**: The polynomial fit `U(T)` can't represent features that are vertical (constant U) or that wrap around the seam. The unwrapping machinery in the chain linker handles seam crossing; a generic polynomial wouldn't.

**Verdict**: REJECT for Phase A. Interesting for Phase B with proper seam handling and merge/split logic.

### Proposal 5: Mathematical Ridge Direction — REJECT

**C11 [CRITICAL]**: "Orient the chain edge to follow this mathematical direction, not just connect consecutive row points." This fundamentally misunderstands how CDT constraint edges work. CDT constraint edges connect specific vertex indices. You can't orient an edge — it goes from vertex A to vertex B. The direction is determined by the vertex positions, period.

The Generator is describing a different approach: computing tangent vectors and inserting additional vertices along the tangent direction to guide the CDT. This is valid but is effectively what the companion point cloud already does — providing local density around chain vertices so the CDT has enough nearby points to form well-shaped triangles.

**Verdict**: REJECT as stated. The companion point cloud from the previous session already addresses this need from a different angle.

---

## Accepted Items

| # | Item | Amendments |
|---|------|-----------|
| H1 | Chain link radius is too large | Need per-style data on feature spacing |
| H2 | resnapChainToMeasuredPeaks ordering | Factual error on call location; resnap is inside linkFeatureChains |
| H4 | Momentum amplification | Severity underestimated — positive feedback loop |
| P1 | Tighten link radius | Use 0.02 not 0.015; keep MAX_MISS_COUNT at 6 |
| P3 | Remove resnapChainToMeasuredPeaks | Actually a no-op; add diagnostic log first |

---

## Open Questions for Generator

1. **What fraction of rows have same-kind features closer than 0.04 (current CHAIN_LINK_RADIUS)?** You claimed cross-assignment is the primary cause. Prove it with data. The diagnostic instrument proposal is the right approach — implement it first.

2. **How many points does resnapChainToMeasuredPeaks actually move?** If 0, it's a no-op and safe to remove. If >0, those moved points are diagnostic gold — they tell us where the linker is misbehaving.

3. **What is the actual per-row U-jitter of correctly linked chains?** Measure `max(|unwrapped[i] - unwrapped[i-1]|)` for the smoothest chains (roughness < 0.001). This determines the minimum safe link radius.

4. **The momentum positive feedback loop (C4/H4) is the most dangerous failure mode.** Do you agree it should be addressed BEFORE tightening the radius? A tight radius with broken momentum = chains that die after 6 rows of missed predictions. Possible fix: compute momentum from the last 3+ points (median velocity) instead of just the last 2 (instantaneous velocity).

5. **Is the SG smoothing moving points OFF the mathematical feature?** The SG filter preserves local polynomial structure but doesn't know where the true radius extremum is. A chain point that was at U=0.1730 (true peak) gets smoothed to U=0.1728 (local polynomial center). This is 0.0002 off-peak — invisible in the mesh, but it means the chain constraint edge doesn't sit exactly on the mathematical feature. Is this acceptable?

---

## Implementation Conditions (for Executioner)

**Phase A (immediate, implement in this order):**

1. **Add diagnostic logging** before any code changes:
   - Count points moved by `resnapChainToMeasuredPeaks`
   - Compute per-chain max deviation from local linear fit
   - Log per-row same-kind feature spacing (min distance between same-kind features)
   
2. **Remove `resnapChainToMeasuredPeaks`** from `postProcessFeatureChains` in `ChainLinker.ts`. Keep `suppressDuplicateChains`. This is trivially safe if the diagnostic confirms it's a no-op.

3. **Tighten link radius** to 0.02, momentum scale to 1.5 in the primary pass. Secondary pass: `0.02 * 0.7 = 0.014`, momentum 1.25 (unchanged). Keep MAX_MISS_COUNT at 6.

**Phase B (after Phase A validation):**

4. **Momentum smoothing**: If chains are still breaking after radius tightening, compute velocity from median of last 3 points instead of last 2. This dampens the positive feedback loop.

5. **Hungarian assignment**: Only if diagnostic shows >5% of rows with same-kind feature contention at the new radius.

**Validation protocol:**
- Export a 10-petal superformula blossom style at standard resolution
- Chain diagnostic log must show: max deviation < 0.002, no chains with saw-tooth pattern
- Visual inspection: chain edges should be smooth continuous curves in the debug overlay
- All 1,878 existing tests must pass

---

## Broader Assessment

The Generator's analysis is good. The five hypotheses are well-reasoned and the ranking (Proposals 1-3 before 4-5) is correct in principle. The main weaknesses:

1. **Insufficient evidence**: Every hypothesis starts with "I believe" or "this is the core problem." Evidence should come from instrumentation, not intuition.
2. **Pipeline ordering error**: The resnapChainToMeasuredPeaks factual error (C2) could lead to incorrect implementation.
3. **Momentum feedback loop underestimated**: This is the most dangerous interaction effect and the Generator classified it as "POSSIBLE" (C4).
