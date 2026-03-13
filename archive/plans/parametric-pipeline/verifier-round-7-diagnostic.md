# Verifier Round 7 — Diagnostic: Chain Oscillation + Persistent Missing Edges
Date: 2026-03-04

## Summary

Round 6 companion fixes (center companion removal, count cap, guard zone) achieved the **companion reduction target** (651K → 47K) but had **near-zero impact on the core visual problem**: jagged, oscillating chain edges in the exported mesh.

The root cause is **upstream of the CDT**: the chain paths themselves oscillate around the true mathematical features. The CDT faithfully reproduces the oscillating chain path. Improving CDT companions won't fix a problem that originates in Steps 3-3.6 of the pipeline.

## Evidence

### A. Export Metrics Comparison

| Metric | Round 5 | Round 6 | Change | Target |
|--------|---------|---------|--------|--------|
| Companions | 651,624 | 47,723 | -92.7% | < 50K ✓ |
| Guard rejects | 0 | 20,679 | NEW | INFO |
| Missing edges | 488 | 487 | **-0.2%** | < 50 ✗ |
| maxAspect UV | 30.2M:1 | 14.3M:1 | -52.6% | < 1K:1 ✗ |
| Inverted tris | 431K | 147K | -65.9% | < 10K ✗ |
| R2 violations | — | 40,314 | — | — |
| Build time | 85s | 72s | -15.3% | < 20s ✗ |
| Validation | FAIL | FAIL | — | PASS ✗ |

### B. Chain Quality (measured pre-resnap/pre-smooth)

```
maxLinearDev = 0.002364    (~1.4 grid columns)
maxConsecDelta = 0.007843  (~4.5 grid columns)
minSameKindSpacing = 0.000200  (~0.12 grid columns)
```

The key number: **maxConsecDelta = 0.0078**. Consecutive chain points differ by up to 4.5 grid columns in U. Even after SG smoothing (window=7), significant oscillation remains visible in the export.

### C. Pipeline Order (Steps 3-3.6)

```
Step 3:   linkFeatureChainsByKind → 20 chains, 4854 points
Step 3.5: GPU re-snap (64 candidates, ±2 samples = ±0.000244 U) → 4801/4854 refined
Step 3.6: SG smooth (halfWidth=3, window=7) → 20 chains, 4854 points (no filtering)
```

Re-snap search window: ±0.000244 U. Maximum re-snap movement: 0.000244.
This CANNOT explain maxConsecDelta=0.0078. The oscillation enters at **Step 3** (chain linking).

### D. Missing Edge Root Cause

The 487 missing edges (488→487, near-zero improvement) are NOT caused by companion collinearity. After removing center companions and adding guard zone, the count barely changed.

**Hypothesis**: Missing edges are caused by **crossing constraint edges** from oscillating chains. When chain X zig-zags in U, its constraint edges can cross constraint edges from a nearby chain Y (or from the strip boundary). `cdt2d` handles crossing constraints with undefined behavior — it may silently drop one constraint, producing a "missing" edge.

Evidence supporting this:
- `sweep=0` — CDT never throws (it silently misbehaves on crossing constraints)
- `minSameKindSpacing=0.0002` — some chains are EXTREMELY close in U
- All 10 missing edge examples in the log are from chain 0
- Missing edges are 100% cross-row (484/484) — cross-row edges are the ones that cross each other

**Key insight**: Fix the chain oscillation → the constraint edges stop crossing → missing edges resolve naturally.

## Root Cause Analysis

### RC1: Feature Detection Resolution Limit (PRIMARY)

At 8192 samples/row, sample spacing = 1/8192 ≈ 0.000122.
`minSameKindSpacing = 0.000200` = only **1.6 samples** between some same-kind features.

At this resolution, two features 0.0002 apart cannot be reliably resolved as separate peaks. The detected peak position oscillates between the two features across rows, creating maxConsecDelta ≈ 0.008.

This is a **Nyquist-like problem**: the sampling grid is too coarse to resolve features that are closer than ~3 samples apart.

**Where this happens**: At certain T-positions (heights), features can converge in UV space — e.g., near the bottom of a pot where all petals converge. At those heights, the features are physically close and their U-spacing approaches zero.

### RC2: SG Smoothing Too Weak (SECONDARY)

SG smoothing with halfWidth=3 (window=7) can attenuate high-frequency noise, but cannot smooth out oscillations with wavelength > 7 rows. If the chain oscillates every 2-3 rows, a window of 7 helps. If it oscillates every 5-10 rows, window=7 is insufficient.

Additionally, **boundary points (first/last 3) are NOT smoothed** — they keep their original noisy positions. With 313 rows, 6 boundary points is small, but these unsmoothed boundary points create visible jags.

### RC3: Chain Linking Instability Near Convergence Points (CONTRIBUTING)

`CHAIN_LINK_RADIUS = 0.02` is 100× larger than `minSameKindSpacing = 0.0002`. At convergence points, the linker's greedy nearest-neighbor can assign features to the wrong chain, creating a larger U-delta than the actual feature motion.

## Affected Files

| File | Role | Current Issue |
|------|------|---------------|
| `FeatureDetection.ts` | `detectRowFeaturesV16()` | 8192 samples insufficient for tightly-spaced features |
| `ChainLinker.ts` | `linkFeatureChainsByKind()` | Greedy linking unstable when features converge |
| `ChainLinker.ts` | `smoothChainPath()` | halfWidth=3 too small, boundary points unsmoothed |
| `ParametricExportComputer.ts` | Pipeline orchestration | No post-smooth quality diagnostic |
| `OuterWallTessellator.ts` | CDT constraint feeding | Faithfully reproduces oscillating chains; crossing constraints cause missing edges |

## Proposed Investigation Areas (for Generator)

1. **Stronger smoothing**: Increase SG halfWidth, or add multiple passes, or use a different filter (moving average, bilateral, spline fit)
2. **Mathematical feature projection**: Instead of smoothing detected peaks, project each chain point onto the nearest analytical feature curve (the superformula is known — we can compute exact feature positions)
3. **Adaptive linking radius**: Reduce CHAIN_LINK_RADIUS near convergence points where minSameKindSpacing is small
4. **Post-smooth quality gate**: Measure maxConsecDelta AFTER smoothing and flag chains that still oscillate
5. **Constraint crossing detection**: Before passing constraints to CDT, check for intersections and resolve them (split at intersection, remove one, etc.)
6. **Increased probe resolution**: More than 8192 samples for rows with tightly-spaced features

## Validation Protocol for Any Fix

After implementing:
1. `maxConsecDelta` (post-smooth) must be < 0.002 (< 1.2 grid columns)
2. Missing chain edges < 50
3. maxAspect UV < 1000:1
4. Inverted triangles < 10K
5. Visual inspection: chain debug segments must follow smooth mathematical curves
6. No sweep fallbacks (crossing constraints eliminated)
