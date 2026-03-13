# Master Round 7 — Problem Framing: Chain Path Oscillation
Date: 2026-03-04
Agent: Master (Claude Opus 4.6)

## Decision Context

After 6 rounds of CDT/companion/tessellation work, the Verifier has correctly diagnosed that the remaining visual jaggedness is **not a tessellation problem** — it's a **chain path quality problem**. The CDT faithfully reproduces whatever chain path it receives. Rounds 1-6 fixed the CDT's ability to preserve constraints and produce well-shaped triangles. Round 7 must fix what those constraints actually represent.

## Problem Statement

**Feature chain paths oscillate around the true mathematical feature curves.** Consecutive chain points zig-zag by up to 4.5 grid columns (maxConsecDelta = 0.0078), producing crossing constraint edges, missing edges, and visually jagged feature lines in the exported mesh.

## Root Cause Decomposition

### RC1: Feature Detection Can't Resolve Tightly-Spaced Features (PRIMARY)
- 8192 sample spacing = 0.000122 U
- minSameKindSpacing = 0.000200 (1.6 samples)
- At convergence zones (pot bottom, where petals merge), two same-kind features are closer than 3 samples → the detected peak oscillates between them row-to-row
- **This is a sampling/Nyquist problem.** No amount of downstream smoothing fixes a detection that assigns the wrong feature to a chain.

### RC2: SG Smoothing Insufficient (SECONDARY)
- Window = 7 (halfWidth=3) can remove single-row jitter but not multi-row oscillation patterns
- Boundary points (first/last 3 per chain) are unsmoothed entirely
- The smoother is fighting a signal that's fundamentally corrupted by RC1

### RC3: Chain Linking Instability Near Convergence (CONTRIBUTING)
- CHAIN_LINK_RADIUS = 0.02 is 100× larger than minSameKindSpacing
- In convergence zones, the greedy linker can swap between two features that are very close in U, producing chain points that hop between features

## The Fundamental Tension

The core tension is between **detection precision** and **chain smoothness**:

1. **More samples** (RC1 fix) → better detection but more GPU cost, still can't resolve features that are arbitrarily close
2. **Stronger smoothing** (RC2 fix) → smoother chains but may shift chain positions away from true features
3. **Smarter linking** (RC3 fix) → prevents some cross-assignments but can't fix oscillation that happens at the detection level

The ideal solution uses **the known mathematics** — we know the superformula, we can compute exact feature positions analytically. The GPU `evaluatePoints` infrastructure already exists. The question is: can we use mathematical knowledge to either (a) improve detection precision, (b) validate/correct chain points post-detection, or (c) project chain paths onto the true feature curves?

## Solution Space Boundaries

### What We Know Works
- GPU re-snap (Step 3.5) already refines each chain point within ±0.000244 U → ~20× better than raw probe
- SG smoothing removes single-row jitter
- The chain linking itself (greedy + momentum) is sound for well-separated features
- `evaluatePoints` can cheaply evaluate arbitrary (U, T) positions on GPU

### What We Know Doesn't Work
- Simply increasing probe resolution → diminishing returns, GPU memory limits
- Reducing CHAIN_LINK_RADIUS further → chains die at legitimate gaps
- More CDT/companion work → wrong layer, chain oscillation is upstream

### What's Potentially Viable
1. **Multi-pass smoothing** — multiple SG passes or increasing halfWidth significantly
2. **Spline fitting** — fit a B-spline or cubic spline to the chain path, evaluate at each row
3. **Analytical feature projection** — compute exact feature U positions from the superformula parameters
4. **Constraint crossing detection/resolution** — before CDT, detect and resolve crossing constraint edges
5. **Convergence-aware linking** — detect convergence zones and merge/split chains appropriately
6. **Post-smooth re-snap** — after smoothing, GPU-verify that smoothed positions are still near true features

## Validation Targets (from Verifier)
1. maxConsecDelta (post-smooth) < 0.002
2. Missing chain edges < 50
3. maxAspect UV < 1000:1
4. Inverted triangles < 10K
5. Visual: smooth chain debug segments following mathematical curves

## Constraints
- Must not break existing chain linking for well-separated features
- Must not significantly increase export time (currently 72s, target < 20s)
- Must maintain watertight mesh output
- Should be implementable without major architectural changes (iteration, not revolution)

## Generator Dispatch

The Generator should propose solutions across three tracks:

**Track A — Smoothing Enhancement** (immediate, low risk):
How do we make the existing chain paths smoother without losing feature fidelity? Consider: larger SG window, multiple passes, spline fitting, different filter types, boundary treatment.

**Track B — Detection/Chain Quality** (medium term, medium risk):
How do we prevent oscillation from entering the chain in the first place? Consider: convergence-zone detection, adaptive linking radius, chain merge/split at convergence, post-smooth GPU verification.

**Track C — Mathematical Projection** (high impact if feasible):
Can we project chain paths onto analytically-computed feature curves? The superformula parameters are known at export time. If we can compute exact feature U positions from the formula, smoothing becomes trivial — just follow the math.

The Generator should focus on **Track A first** (fastest path to improvement), propose Track B ideas for the Verifier to evaluate, and assess feasibility of Track C.

## Files to Study

| File | Focus Area |
|------|------------|
| `ChainLinker.ts` L380-450 | `smoothChainPath()` — current SG implementation |
| `ChainLinker.ts` L460-700 | `linkFeatureChainsCore()` — the greedy linker |
| `ChainLinker.ts` L136-193 | `computeChainDiagnostics()` — measurement |
| `ParametricExportComputer.ts` L912-1050 | GPU re-snap + chain smoothing pipeline |
| `FeatureDetection.ts` L204+ | `detectRowFeaturesV16()` — peak detection |
| `types.ts` | `FeatureChain`, `ChainPoint` types |
