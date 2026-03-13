# Verifier Round 2 — Final Verdict on Chain Jaggedness
Date: 2026-03-03

## Status: CONVERGED — Ready for Executioner

All 8 items are now converged. The Generator wins the D2 dispute on momentum fix timing. The Verifier accepts the amendment.

---

## D2 Ruling: Momentum Fix Moves to Phase A — ACCEPTED

The Generator's argument is sound and uses my own C4 analysis correctly:

**The code proves it.** When `missCount > 0`, the chain searches at `predictedU` with `MOMENTUM_LINK_RADIUS` (ChainLinker.ts L465-467):
```typescript
const matchU = ac.missCount > 0 ? ac.predictedU : ac.chain.points[ac.chain.points.length - 1].u;
const searchRadius = ac.missCount > 0 ? MOMENTUM_LINK_RADIUS : linkRadius;
```

After radius tightening: `MOMENTUM_LINK_RADIUS = 0.02 * 1.5 = 0.03` (down from `0.04 * 2.0 = 0.08`).

**The danger**: If momentum velocity is poisoned (from a 2-point computation that included one wrong assignment), the predicted U is wrong. With the current wide search (0.08), the chain might still find the correct feature by accident. With the tight search (0.03), a wrong prediction means the chain misses, increments missCount, uses the SAME wrong prediction next row, misses again, and dies after 6 misses. The tight radius AMPLIFIES the momentum problem instead of being independent of it.

**The fix order matters**: Fixing momentum first (median of 3-5 deltas) makes the velocity resistant to single-point corruption. THEN tightening the radius eliminates the cross-assignment source. Each fix protects the other:
- Momentum fix → velocity stays correct through occasional noise → predictions stay valid
- Radius tightening → fewer cross-assignments → fewer noise events to survive

Reversed order (radius first, momentum later) creates a dangerous intermediate state where chains die from the tight radius + broken predictions.

**AMENDMENT TO MOMENTUM IMPLEMENTATION**: The Generator's pseudocode has a subtle bug:

> "Sort by magnitude, take the median"

Sorting by **magnitude** loses the sign. A chain moving at velocity -0.003 with deltas `[-0.003, -0.003, +0.010, -0.003, -0.003]` sorted by magnitude gives `[0.003, 0.003, 0.003, 0.003, 0.010]` → median magnitude = 0.003. Correct magnitude, but direction is lost.

**Correct approach**: Sort the signed, seam-unwrapped deltas and take the signed median:
```
deltas = [-0.003, -0.003, +0.010, -0.003, -0.003]
sorted = [-0.003, -0.003, -0.003, -0.003, +0.010]
median = -0.003  ← correct sign AND magnitude
```

The +0.010 outlier (from a cross-assignment) is rejected. The direction is preserved. The Executioner must use the **signed median** of unwrapped deltas, not sort-by-magnitude.

---

## Final Convergence Table

| # | Item | Value | Converged |
|---|------|-------|-----------|
| 1 | Remove resnapChainToMeasuredPeaks | Yes (it's dead code) | ✅ |
| 2 | CHAIN_LINK_RADIUS | 0.04 → 0.02 | ✅ |
| 3 | MAX_MISS_COUNT | 6 (unchanged) | ✅ |
| 4 | Momentum scale (primary) | 2.0 → 1.5 | ✅ |
| 5 | Momentum velocity computation | Median of last 3-5 signed deltas | ✅ |
| 6 | Momentum fix timing | Phase A (before radius tightening) | ✅ |
| 7 | Hungarian assignment | Deferred to Phase B | ✅ |
| 8 | DBSCAN / Ridge direction | Withdrawn / Rejected | ✅ |
| 9 | Diagnostics first | Yes, before any code changes | ✅ |

---

## Implementation Plan for Executioner

### Phase A — Execute in this exact order

**A.1: Diagnostic Instrumentation** (no behavior changes)

Add logging after Step 3.6 in ParametricExportComputer.ts:
- Per-chain: max deviation from local 5-point linear fit
- Per-chain: max consecutive-point U-delta (absolute, seam-unwrapped)
- Per-row: min distance between same-kind features
- Count: how many points `resnapChainToMeasuredPeaks` actually moves (expected: 0)

Run on: 10-petal superformula blossom, standard resolution. Save baseline metrics.

**A.2: Remove `resnapChainToMeasuredPeaks`**

In `postProcessFeatureChains` (ChainLinker.ts ~L238-244):
- Remove the `resnapChainToMeasuredPeaks` call
- Keep `suppressDuplicateChains`
- Remove the `allRowFeatures` parameter from `postProcessFeatureChains` signature
- Update all callsites (inside `linkFeatureChains`, ~L603)

Validation: Re-run A.1 diagnostics. Metrics should be identical (since resnap is a no-op).

**A.3: Fix Momentum Velocity Computation**

In `linkFeatureChainsCore` (ChainLinker.ts ~L496-512), replace the 2-point velocity:
```typescript
const last = pts[pts.length - 1];
const prev = pts[pts.length - 2];
const rowSpan = last.row - prev.row;
if (rowSpan > 0) {
    let uVel = (last.u - prev.u) / rowSpan;
    if (uVel > 0.5) uVel -= 1;
    if (uVel < -0.5) uVel += 1;
    ac.predictedU = ((last.u + uVel) % 1 + 1) % 1;
}
```

With a windowed signed-median velocity (last 3-5 points):
```typescript
// Compute velocity from median of recent deltas (rejects outlier mis-assignments)
const window = Math.min(pts.length - 1, 5);
const deltas: number[] = [];
for (let k = pts.length - window; k < pts.length; k++) {
    const rs = pts[k].row - pts[k - 1].row;
    if (rs > 0) {
        let du = (pts[k].u - pts[k - 1].u) / rs;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
        deltas.push(du);
    }
}
if (deltas.length > 0) {
    deltas.sort((a, b) => a - b);  // SIGNED sort, not magnitude
    const uVel = deltas[Math.floor(deltas.length / 2)];  // signed median
    const last = pts[pts.length - 1];
    ac.predictedU = ((last.u + uVel) % 1 + 1) % 1;
} else {
    ac.predictedU = pts[pts.length - 1].u;
}
```

Key requirements:
- Sort by SIGNED value, not magnitude (preserves direction)
- Each delta is per-row (divided by rowSpan) for consistent rate
- Seam unwrap each delta individually (`if (du > 0.5) du -= 1`)
- Window of 5 provides outlier rejection: one bad delta out of 5 can't shift the median

Validation: Re-run A.1 diagnostics. Expect:
- Max consecutive-point U-delta should decrease (momentum isn't amplifying outliers)
- Fewer chains terminated at MAX_MISS_COUNT (predictions stay valid through gaps)

**A.4: Tighten Link Radius**

Constants to change:
- `CHAIN_LINK_RADIUS`: 0.04 → 0.02
- Primary pass `momentumScale`: 2.0 → 1.5 (effective MOMENTUM_LINK_RADIUS: 0.03)
- Secondary pass: radius = `0.02 * 0.7 = 0.014`, momentum 1.25 (unchanged ratio)
- `MAX_MISS_COUNT`: stays at 6

Validation: Re-run A.1 diagnostics. Expect:
- Max deviation from linear fit drops 50%+ from baseline
- No sawtooth patterns (successive +/- deltas > 0.005)
- Chain count roughly stable (chains shouldn't be dying more often)

**A.5: Compare All Diagnostics**

| Metric | Baseline (A.1) | After Resnap (A.2) | After Momentum (A.3) | After Radius (A.4) |
|--------|----------------|---------------------|----------------------|---------------------|
| Max deviation from linear fit | ? | ≈ same | ↓ expected | ↓↓ expected |
| Max consecutive U-delta | ? | ≈ same | ↓ expected | ↓ expected |
| Min same-kind feature spacing | ? | ≈ same | ≈ same | ≈ same |
| Resnap points moved | ? (expect 0) | N/A | N/A | N/A |
| Chains terminated at MAX_MISS | ? | ≈ same | ↓ expected | ? monitor |

### Phase B — Only if Phase A diagnostics warrant it

**B.1: Hungarian Assignment** — Only if >5% of rows have same-kind feature contention at radius 0.02

**B.2: Data-driven link radius** — Set radius to 3× measured max per-row jitter per style

---

## Validation Protocol

All of the following must pass before this work ships:

1. **All 1,878 existing tests pass** (zero regressions)
2. **Diagnostic metrics improve** vs baseline at every step (A.2 through A.4)
3. **Visual inspection**: Export 10-petal blossom at standard resolution. Chain debug overlay must show smooth continuous curves with no visible zigzag or sawtooth.
4. **Export comparison**: Binary-compare STL output at two resolutions (standard + high). Chain-containing regions must have well-formed triangles (no slivers, no flipped normals).
5. **Performance**: No measurable regression in chain linking time (<50ms for 20 chains × 400 rows)

---

## Notes to Executioner

- The momentum velocity code (A.3) is ~15 lines replacing ~8 lines. It's the most delicate change — get the seam unwrapping right for each individual delta.
- The `postProcessFeatureChains` signature change (A.2) will require updating `linkFeatureChains` where it's called. Check for any other callers.
- The diagnostic instrumentation (A.1) should be behind a flag or easily removable — it's not meant for production.
- Run diagnostics at EACH step (A.2, A.3, A.4) to verify each change independently improves or is neutral. If any step makes metrics worse, STOP and report back.

## Notes to Generator

Good debate. The D2 argument was well-constructed — using the Verifier's own analysis to flip the phasing was clean work. The momentum median-velocity fix is the right surgical intervention: small change, high impact, no side effects. The one catch was the sort-by-magnitude vs. signed-sort detail, but that's an implementation nuance, not a design flaw.

The diagnostic-first approach is the thing we're most aligned on. Data before code. This should be the pattern for all future pipeline work.
