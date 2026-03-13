# Master Approval — Round 7 Chain Path Smoothing
Date: 2026-03-04

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- Generator: Proposed P1-P6 (smoothing enhancement, boundary treatment, diagnostics, crossing constraints, feasibility)
- Verifier: Accepted P1+P2+P4, amended P3 (mirror extension instead of linear extrapolation), deferred P5
- Executioner: Pending implementation
- Master: APPROVED — implement the converged plan

## Rationale

The Generator correctly identified that stronger SG smoothing is the fastest path to reducing maxConsecDelta. The Verifier's amendments are all well-founded:

1. **Mirror extension (C3)** is clearly superior to linear extrapolation — it preserves curvature at boundaries and eliminates the interior/boundary code split entirely. Cleaner code, better math.
2. **Adaptive halfWidth (C2)** prevents short chains (10-16 points) from skipping smoothing entirely. Simple one-line fix with zero risk.
3. **Deferring P5 (crossing constraints)** is the right call — measure first, then decide if the symptom persists after treating the root cause.

The two-pass SG(halfWidth=8) approach is conservative enough to be safe while aggressive enough to produce measurable improvement. SG quadratic preserves linear trends (safe for diagonal chains) and the mirror extension handles boundaries properly.

## Conditions

1. **The diagnostic (P4) must be implemented FIRST** — before changing the smoothing parameters. I want to see the current post-smooth maxConsecDelta baseline before we change anything. The current diagnostic only measures pre-smooth.

2. **The mirror extension boundary handling must be used** — NOT the Generator's linear extrapolation. The Verifier's analysis of the curvature preservation issue is correct.

3. **The adaptive halfWidth must be included** — chains of 10-16 points must receive reduced-window smoothing, not zero smoothing.

4. **Post-implementation, report THREE numbers**: (a) pre-smooth maxConsecDelta, (b) post-smooth maxConsecDelta, (c) missing chain edges. These three numbers determine whether we proceed to P5 or close Round 7.

## Risk Assessment

- **Blast radius**: ChainLinker.ts `smoothChainPath` function + PEC Step 3.6 orchestration. Isolated scope — no CDT/companion/tessellation changes.
- **Rollback**: Trivial — revert SMOOTH_HALFWIDTH to 3 and remove the second pass. Mirror extension is backward-compatible (produces identical results at the same halfWidth if the original chain has no boundary oscillation).
- **Over-smoothing risk**: SG quadratic preserves slopes. Two passes of halfWidth=8 gives effective smoothing over ~30 rows, which is ~12% of a 243-point chain. Acceptable for even moderately curved features. If a specific style (tight spiral) shows over-smoothing, halfWidth can be reduced per-style in the future.

## Implementation Order (Executioner's Marching Orders)

### Step 1: Add post-smooth diagnostic to PEC Step 3.6
- After the existing `smoothChainPath` loop, add `computeChainDiagnostics` call
- Log `Post-smooth quality: maxConsecDelta=X, maxLinearDev=Y`
- **Do NOT change smoothing parameters yet** — establish the baseline

### Step 2: Rewrite `smoothChainPath` in ChainLinker.ts
- Change `SMOOTH_HALFWIDTH` from 3 to 8
- Add adaptive halfWidth: `const m = Math.min(halfWidth, Math.floor((n-1)/2))`
- Replace boundary/interior split with mirror extension approach (full SG for all points)
- Keep the "too short to smooth" guard for chains < 3 points (can't mirror-extend)

### Step 3: Apply 2-pass smoothing in PEC Step 3.6
- Change the smoothing loop to apply twice:
```typescript
for (let ci = 0; ci < chains.length; ci++) {
    chains[ci] = smoothChainPath(chains[ci]);
    chains[ci] = smoothChainPath(chains[ci]);
}
```

### Step 4: Validate
- TypeScript compilation clean
- Existing tests pass (update any that hardcode SMOOTH_HALFWIDTH or boundary behavior)
- Log the three numbers for verification

## Open Items for Next Round
- If missing edges > 50 after smoothing fix → implement P5 (crossing constraint removal)
- Post-smooth GPU verification (P6 alternative) → future enhancement, not Round 7 scope
- Per-chain worst-offender logging → nice to have, implement if time permits
