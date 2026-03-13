# Generator Round 7 Dispatch — Chain Path Smoothing & Precision
Date: 2026-03-04
From: Master
To: Generator

## Problem Statement

Feature chain paths oscillate around the true mathematical feature curves. Consecutive chain points zig-zag by up to 4.5 grid columns (maxConsecDelta = 0.0078 pre-smooth). The SG smoother (window=7) attenuates high-frequency noise but cannot remove multi-row oscillation patterns. This produces crossing constraint edges in the CDT, causing 487 missing edges and 147K inverted triangles.

**The fix must happen in Steps 3-3.6 of the pipeline** (ChainLinker.ts + PEC orchestration), not downstream in CDT/companion/tessellation.

## What I Need From You

### Track A: Smoothing Enhancement (PRIMARY — propose first)

The current `smoothChainPath` at ChainLinker.ts L380-450:
- SG quadratic, halfWidth=3 (window=7)
- Boundary points (first/last 3) are unsmoothed
- Single pass

**Questions to answer:**
1. What happens if we increase halfWidth to 6-10 (window=13-21)? Risk of over-smoothing diagonal/spiral chains?
2. Would multi-pass smoothing (2-3 passes of SG) converge faster than one pass with larger window?
3. Is there a better filter than SG for this problem? Consider: weighted moving average, bilateral filter, LOWESS, B-spline fit-and-evaluate.
4. How should boundary points be handled? Mirror-extend? Linear extrapolation? Smaller window?
5. Should we add a **post-smooth diagnostic** that measures maxConsecDelta after smoothing and logs it?

**Concrete deliverable**: Propose specific parameter changes and/or code modifications to `smoothChainPath` that would bring maxConsecDelta below 0.002 post-smooth.

### Track B: Crossing Constraint Resolution (SECONDARY)

Even with better smoothing, oscillating chains near convergence zones may still produce crossing constraints. The 487 missing edges are caused by `cdt2d` silently dropping one of two crossing constraint edges.

**Questions to answer:**
1. Can we detect crossing constraint edges BEFORE passing them to CDT? (Two line segments that intersect in UV space.)
2. What's the right resolution? Split at intersection? Remove the shorter constraint? Merge nearby chains?
3. Should this be a pre-CDT validation pass in OuterWallTessellator.ts, or a chain-level fix in ChainLinker.ts?

### Track C: Feasibility Assessment Only

Can we compute exact feature U positions analytically from the superformula parameters? The GPU `evaluatePoints` infrastructure evaluates arbitrary (U, T) positions. If we can compute where the superformula's radial extrema are at each T-position, we can project chain points onto those exact curves instead of relying on detection + smoothing.

**This is a feasibility assessment, not a proposal.** Just tell me: is it mathematically tractable? What would be needed?

## Key Numbers

```
Pre-smooth chain quality:
  maxLinearDev    = 0.002364   (~1.4 grid columns)
  maxConsecDelta  = 0.007843   (~4.5 grid columns)  ← THIS IS THE PROBLEM
  minSameKindSpacing = 0.000200 (~0.12 grid columns)

Pipeline parameters:
  ROW_PROBE_SAMPLES = 8192
  sample spacing    = 0.000122 U
  CHAIN_LINK_RADIUS = 0.02
  SG halfWidth      = 3 (window = 7)
  GPU re-snap window = ±0.000244 U (±2 samples)
  GPU re-snap candidates = 64

Validation targets:
  maxConsecDelta (post-smooth) < 0.002
  Missing chain edges          < 50
  maxAspect UV                 < 1000:1
  Inverted triangles           < 10K
```

## Files to Read

1. `src/renderers/webgpu/parametric/ChainLinker.ts` — L380-450 for smoothing, L460-700 for linking
2. `src/renderers/webgpu/ParametricExportComputer.ts` — L890-1060 for pipeline context
3. `src/renderers/webgpu/parametric/FeatureDetection.ts` — L204+ for detection context
4. `docs/plans/verifier-round-7-diagnostic.md` — full diagnostic with evidence

## Constraints

- Do NOT propose changes to CDT, companion, or tessellation code (Rounds 1-6 territory)
- Do NOT propose increasing ROW_PROBE_SAMPLES (GPU memory constraint)
- DO propose concrete parameter values, not ranges
- DO include pseudocode for any new functions
- DO assess risk of over-smoothing for diagonal/spiral chain styles

## Format

Number all proposals (P1, P2, ...). For each:
- What it changes
- Why it helps
- Risk assessment
- Concrete parameter values or pseudocode
- Expected impact on maxConsecDelta
