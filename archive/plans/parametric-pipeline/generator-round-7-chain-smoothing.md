# Generator Round 7 — Chain Path Smoothing Proposals
Date: 2026-03-04
Agent: Generator (dispatched by Master)

## Analysis of Current State

### The Signal
Chain points oscillate with maxConsecDelta = 0.0078 pre-smooth. After SG(halfWidth=3), significant oscillation remains. Why?

**SG frequency response analysis:**
For SG quadratic with halfWidth=m, the -3dB cutoff is at approximately frequency `f ≈ 0.6/(2m+1)` of the sampling rate. With m=3 (window=7):
- -3dB at f ≈ 0.086 (period ~12 rows)
- Oscillations with period 12+ rows pass through nearly unattenuated
- Oscillations with period 7 rows are attenuated ~50%
- Oscillations with period 3-4 rows are strongly attenuated

**The problem:** If the chain oscillation has structure at periods > 7 rows (which it very likely does — features converging over 10-20 row spans), SG(7) barely touches it.

### The Boundary Problem
First/last 3 points (halfWidth boundary) keep raw values. With 243 points/chain average, 6 boundary points is 2.5% of the chain. But if the worst maxConsecDelta happens to be at a boundary, it dominates the metric.

---

## P1: Increase SG halfWidth to 8 (window=17)

**What it changes:** `SMOOTH_HALFWIDTH` from 3 to 8 in ChainLinker.ts.

**Why it helps:**
- -3dB cutoff moves from period ~12 to period ~28 rows
- Oscillations with period 10-20 rows (likely the feature convergence pattern) would be attenuated 60-80%
- With 243 points/chain average, a window of 17 still encompasses only 7% of the chain — well below the risk threshold for global smoothing artifacts

**Risk assessment:** MODERATE. SG quadratic preserves linear trends (slope of diagonal chains is preserved exactly). The risk is smoothing through real inflection points where a chain legitimately curves in U. At halfWidth=8, the smoother averages over ~8 T-steps. If the chain has real curvature at that scale (tight spiral), it would be blurred. For typical petal-style features (gentle U-drift), this is safe.

**Expected impact:** maxConsecDelta should drop from ~0.008 to ~0.003-0.004 (40-50% reduction).

**Concrete change:**
```typescript
const SMOOTH_HALFWIDTH = 8;  // was 3
```

**Assessment:** Necessary but probably insufficient alone. Gets us closer but likely not below the 0.002 target.

---

## P2: Multi-Pass Smoothing (2 passes of SG)

**What it changes:** Apply `smoothChainPath` twice per chain in PEC Step 3.6.

**Why it helps:** Each SG pass attenuates the oscillation by its transfer function. Two passes of SG(halfWidth=8) compound — the square of the transfer function. Oscillations at period 15 that survive one pass at 60% amplitude are reduced to 36% after two passes.

**Risk assessment:** LOW. Two passes of a polynomial-preserving filter still preserve linear trends exactly. The effective window is wider (~2× the single-pass window in terms of smoothing reach), but because SG preserves polynomial structure, we're not introducing bias toward the mean.

**Expected impact:** maxConsecDelta should drop to ~0.001-0.002 (target range).

**Concrete change in PEC Step 3.6:**
```typescript
// Two-pass smoothing for stronger oscillation removal
for (let ci = 0; ci < chains.length; ci++) {
    chains[ci] = smoothChainPath(chains[ci], 8); // pass 1
    chains[ci] = smoothChainPath(chains[ci], 8); // pass 2
}
```

**Assessment:** This is the primary proposal. Two passes of SG(17) should bring maxConsecDelta into the target range without over-smoothing.

---

## P3: Boundary Point Treatment — Linear Extrapolation

**What it changes:** Instead of keeping boundary points raw, extrapolate them from the smoothed interior.

**Why it helps:** The current code leaves first/last `halfWidth` points at their raw (oscillating) values. With halfWidth=8, that's 16 unsmoothed boundary points per chain. If any of these are at a convergence zone, they'll be the worst-case maxConsecDelta.

**Risk assessment:** LOW. Linear extrapolation from the nearest 2-3 smoothed points is conservative and geometrically sound. It maintains the local slope of the chain at the boundary.

**Concrete change to `smoothChainPath`:**
```typescript
// Replace boundary point handling:
// Instead of:
//   smoothed[i] = unwrapped[i]  (for i < m and i >= n-m)
// Use linear extrapolation from the nearest smoothed points:

// Leading boundary: extrapolate backward from smoothed[m], smoothed[m+1]
if (n > 2 * m + 2) {
    const slope = smoothed[m + 1] - smoothed[m];
    for (let i = m - 1; i >= 0; i--) {
        smoothed[i] = smoothed[i + 1] - slope;
    }
    // Trailing boundary: extrapolate forward from smoothed[n-m-2], smoothed[n-m-1]
    const slopeEnd = smoothed[n - m - 1] - smoothed[n - m - 2];
    for (let i = n - m; i < n; i++) {
        smoothed[i] = smoothed[i - 1] + slopeEnd;
    }
}
```

**Expected impact:** Eliminates boundary points as a source of maxConsecDelta spikes. Without this, P1+P2 would leave 16 raw boundary points that could dominate the metric.

**Assessment:** Required companion to P1/P2. Must be implemented together.

---

## P4: Post-Smooth Diagnostic + Quality Gate

**What it changes:** Measure maxConsecDelta AFTER smoothing (currently only measured pre-smooth) and log it. Optionally, flag chains that still exceed a threshold for additional treatment.

**Why it helps:** Currently we fly blind post-smooth. We need data to validate that P1+P2+P3 achieve the target.

**Concrete change in PEC Step 3.6 (after smoothing, before filterLowConfidenceChains):**
```typescript
// Post-smooth diagnostic
if (chains.length > 0) {
    const postDiag = computeChainDiagnostics(chains, allRowFeatures);
    const postMaxDelta = Math.max(...postDiag.perChain.map(d => d.maxConsecutiveDelta));
    const postMaxDev = Math.max(...postDiag.perChain.map(d => d.maxLinearDeviation));
    console.log(`[ParametricExport]     Post-smooth quality: maxConsecDelta=${postMaxDelta.toFixed(6)}, maxLinearDev=${postMaxDev.toFixed(6)}`);
}
```

**Risk assessment:** ZERO. Diagnostic only.

**Expected impact:** Provides the data needed to validate the smoothing fix and tune parameters.

---

## P5: Crossing Constraint Detection and Resolution (Track B)

**What it changes:** Add a pre-CDT pass that detects and resolves crossing constraint edges from oscillating chains.

**Why it helps:** Even with improved smoothing, chains near convergence zones may still produce occasional crossing constraints. 487 missing edges → many from crossings.

**Algorithm:**
1. After chains are finalized, extract all constraint edges as line segments in UV space
2. For each pair of constraint edges from DIFFERENT chains, check if they intersect (O(E²) naive, but can be optimized with spatial sorting)
3. If two constraints cross, remove the shorter one (the one more likely to be a jitter artifact)

**Pseudocode:**
```typescript
function removeCrossingConstraints(
    chainEdges: Array<{u0: number, t0: number, u1: number, t1: number, chainIdx: number}>,
): Array<{u0: number, t0: number, u1: number, t1: number, chainIdx: number}> {
    // Sort edges by min-U for sweep-line efficiency
    const sorted = [...chainEdges].sort((a, b) => Math.min(a.u0, a.u1) - Math.min(b.u0, b.u1));
    const removed = new Set<number>();
    
    for (let i = 0; i < sorted.length; i++) {
        if (removed.has(i)) continue;
        for (let j = i + 1; j < sorted.length; j++) {
            if (removed.has(j)) continue;
            // Skip same-chain edges (they can't cross by construction)
            if (sorted[i].chainIdx === sorted[j].chainIdx) continue;
            // Early exit: if min-U of edge j is past max-U of edge i, no more crossings possible
            if (Math.min(sorted[j].u0, sorted[j].u1) > Math.max(sorted[i].u0, sorted[i].u1)) break;
            
            if (segmentsIntersect(sorted[i], sorted[j])) {
                // Remove the shorter edge
                const len_i = Math.hypot(sorted[i].u1 - sorted[i].u0, sorted[i].t1 - sorted[i].t0);
                const len_j = Math.hypot(sorted[j].u1 - sorted[j].u0, sorted[j].t1 - sorted[j].t0);
                removed.add(len_i < len_j ? i : j);
            }
        }
    }
    
    return sorted.filter((_, idx) => !removed.has(idx));
}
```

**Risk assessment:** MODERATE. Removing constraint edges means the CDT won't preserve those feature edges. But a crossing constraint is already producing undefined behavior in `cdt2d` — removing one is strictly better than the current silent corruption.

**Expected impact:** Should dramatically reduce missing edges (from 487 toward <50). Independent of smoothing improvements.

**Assessment:** Good safety net. Should be implemented alongside the smoothing fix but can be validated independently.

---

## P6: Track C Feasibility — Analytical Feature Projection

**Assessment: NOT FEASIBLE in the current architecture.**

The superformula is evaluated via WGSL compute shaders. The feature positions (peaks/valleys of radial function) depend on:
- The superformula parameters (m, n1, n2, n3, a, b)
- The vertical profile (interpolated across T)
- The morph parameters (m transition zones)

For a pure superformula `r(θ) = (|cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3)^(-1/n1)`, the radial extrema are at analytically known positions (multiples of π/m for ridges, multiples of π/m + π/(2m) for valleys). But:

1. The m parameter can be non-integer and interpolates across T-positions
2. Multiple style effects (petal blending, harmonic layering) modify the radius function
3. The actual computation happens in WGSL and would need to be replicated in TypeScript

**Bottom line:** The GPU already evaluates the surface at arbitrary (U, T) positions. The GPU re-snap (Step 3.5) already exploits this with 64 candidates per chain point. If we need higher precision, we increase the re-snap resolution, not compute analytical positions.

**Alternative insight:** The GPU re-snap could be applied AFTER smoothing to verify that smoothed positions still correspond to actual features. This would catch over-smoothing:
```
smooth → GPU re-snap (verify only, flag if moved > threshold) → alert if too many points deviate
```

---

## Implementation Summary

| # | Change | Risk | Expected Impact | Priority |
|---|--------|------|-----------------|----------|
| P1 | SG halfWidth 3→8 | MOD | maxConsecDelta ~0.004 | HIGH |
| P2 | 2-pass smoothing | LOW | maxConsecDelta ~0.002 | HIGH |
| P3 | Boundary extrapolation | LOW | Eliminates boundary spikes | HIGH |
| P4 | Post-smooth diagnostic | ZERO | Measurement visibility | HIGH |
| P5 | Crossing constraint removal | MOD | Missing edges < 50 | MEDIUM |
| P6 | Analytical projection | N/A | Not feasible | DEFERRED |

**Recommended implementation order:** P4 (diagnostic) → P1+P2+P3 (smoothing) → measure → P5 (if still needed).

**Key question for Verifier:** With maxConsecDelta at ~0.002 post-smooth, will the crossing constraint problem self-resolve? If yes, P5 may be unnecessary. If the Verifier can estimate how many crossings remain at maxConsecDelta=0.002, we can decide.
