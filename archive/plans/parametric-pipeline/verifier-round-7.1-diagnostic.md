# Verifier Round 7.1 — Post-Export Diagnostic: Smoothing Insufficient, Primary Missing Edges REGRESSED
Date: 2026-03-04

## Summary Verdict: SMOOTHING ALONE CANNOT FIX THIS

The Round 7 SG smoothing changes (halfWidth 3→8, 2-pass, mirror extension) reduced maxConsecDelta from 0.00784 to 0.00338 (57% reduction), but:
1. Post-smooth maxConsecDelta = 0.003378 — still 69% above the 0.002 target
2. **Primary missing edges REGRESSED from 236 to 312 (+32%)** — smoothing shifted chain positions, creating MORE crossing constraints
3. maxAspect UV REGRESSED from 14.3M:1 to 30.8M:1

More smoothing will make (2) and (3) worse while only marginally improving (1). We need a different approach.

## Evidence

### A. Metrics Comparison (Round 5 → 6 → 7)

| Metric | R5 (pre-fix) | R6 (companion) | R7 (smoothing) | Target |
|--------|-------------|----------------|-----------------|--------|
| Pre-smooth maxConsecDelta | — | 0.00784 | 0.00784 | — |
| Post-smooth maxConsecDelta | — | N/A | **0.00338** | < 0.002 |
| Companions | 651K | 47.7K | 46.7K | < 50K ✓ |
| Missing edges (total) | 488 | 487 | 451 | < 50 |
| **Missing edges (primary)** | — | **236** | **312** | — |
| maxAspect UV | 30.2M | 14.3M | **30.8M** | < 1K |
| Inverted tris | 431K | 147K | 135K | < 10K |
| Micro-rows inserted | — | 87 | 42 | — |

### B. Why Smoothing Made Primary Missing Edges WORSE

Pre-smooth chain positions are at detected peaks (noisy but ON the feature).
Post-smooth chain positions are SG-filtered (smoother but SHIFTED from the feature).

When smoothing shifts a chain point's U by δ, the constraint edge pivots. Two adjacent chains whose constraint edges didn't cross before can now cross after smoothing — especially when chains are only 0.0002 apart (minSameKindSpacing).

The SG filter doesn't know about neighboring chains. It smooths each chain independently. This means:
- Chain A's point at row 100 moves left by 0.001
- Chain B's point at row 100 moves right by 0.001
- Net: the chains move 0.002 closer at row 100, their constraint edges cross

This explains the regression: total missing edges decreased slightly (487→451, the smoothing does help boundary oscillation), but PRIMARY missing edges increased (236→312, smoothing creates new crossings between close chains).

### C. The Fundamental Problem

The problem has TWO components that require DIFFERENT solutions:

**Component 1: Chain path oscillation (visual jaggedness)**
- Cause: Feature detection noise + chain linking instability
- Current approach: SG smoothing (treating symptoms)
- What's needed: Root cause fix in detection/linking, OR analytical projection

**Component 2: Missing constraint edges (mesh quality)**
- Cause: CDT receives crossing constraint edges from nearby chains
- Current approach: None (hoping smoothing would fix it)
- What's needed: Constraint crossing detection and resolution (P5 from Generator Round 7)

These are INDEPENDENT problems. Smoothing helps (1) but hurts (2). Constraint handling helps (2) but doesn't help (1). We need both.

### D. maxConsecDelta = 0.003378 — Is This Noise or Real Feature Motion?

With 20 chains and minSameKindSpacing=0.0002, features CAN genuinely move by 0.003 per row at certain heights. A spiral feature moving 0.003/row across 313 rows would traverse 0.94 — nearly the full circle. This is real feature motion, not noise.

The SG filter cannot distinguish real motion from noise. Increasing halfWidth or adding passes will over-smooth real diagonal/spiral features while still leaving residual oscillation from chain swapping.

## Root Cause Assessment (Updated)

### RC1: Crossing constraint edges (DOMINANT for mesh quality)
When two chains are close (0.0002 apart), their constraint edges cross. `cdt2d` handles crossing constraints with undefined behavior — it may silently drop one constraint, producing a "missing" edge. The resulting triangulation has poor quality where constraints were dropped.

**This is the #1 problem now.** Missing edges (451) directly cause inverted triangles (135K) and extreme aspect ratios (30.8M:1).

### RC2: Chain path oscillation (SECONDARY for visual quality)  
The SG smoothing reduced this significantly (maxConsecDelta 0.0078→0.0034). Further improvements need a fundamentally different approach (analytical projection or adaptive linking radius), not more SG passes.

### RC3: Smoothing-induced chain convergence (NEW — caused by our fix)
SG smoothing moves chains toward each other when they're close, creating NEW crossing constraints that didn't exist before. This is why primary missing edges regressed.

## Recommended Next Steps (for Master)

### Immediate (Round 7.1): Implement P5 — Crossing Constraint Detection/Resolution
The Generator already designed this in `generator-round-7-chain-smoothing.md`. Algorithm:
1. Before passing constraints to CDT in each strip, test all pairs for intersection
2. If two constraint edges cross, remove the one with lower confidence (shorter chain, or interpolated endpoint)
3. Log the number of crossings detected and resolved

**Expected impact**: Missing edges → near zero (constraints that would cross are preemptively removed). maxAspect and inverted tris should improve dramatically since the CDT will produce valid triangulations.

**Risk**: Removing a constraint means the CDT won't enforce that chain edge. The visual chain may "blur" at crossing points. But this is strictly better than having the CDT produce garbage triangulations.

### Follow-up (Round 8): Chain convergence handling
For chains that converge to < 0.002 apart, consider:
1. Merging them into a single chain at convergence zones
2. Reducing linking radius near convergence points
3. Analytical feature projection (if the superformula is available in the export pipeline)

### Do NOT do more SG smoothing
Adding 3-pass or halfWidth=10 will:
- Marginally improve maxConsecDelta (maybe 0.0034 → 0.0028)
- WORSEN primary missing edges (more chain shifting → more crossings)
- Over-smooth real diagonal features
- Not address the root cause

## Validation Protocol for P5

After implementing crossing constraint resolution:
1. Missing chain edges (total) < 50
2. Missing chain edges (primary) < 30
3. maxAspect UV < 10K:1 (relaxed from 1K due to other factors)
4. Inverted triangles < 20K
5. No sweep fallbacks
6. Crossings detected count logged for monitoring
