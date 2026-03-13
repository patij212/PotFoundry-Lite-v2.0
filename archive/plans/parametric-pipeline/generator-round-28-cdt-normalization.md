# Generator Round 28 — CDT Domain Normalization Redesign (R28)
Date: 2026-03-06

## Problem Statement

Persistent horizontal segmentation lines and high aspect ratio triangles remain in the chain-strip mesh after R27-B (multi-band CDT + T-inflation). The current normalization (uniform scaling by max(uRange, tRange), with T-inflation applied to T) fails to sufficiently regularize wide CDT segments, resulting in visible horizontal artifacts and a high rate of aspect ratio violations (50.4% → 43.4% post-optimizer).

## Root Cause Analysis

- **Current Normalization**: Each CDT band is mapped to a [0,1] × [0,1] domain by scaling both U and T by max(uRange, tRange). T-inflation is applied to T to reduce sliver triangles at the band boundaries.
- **Limitation**: For wide bands (uRange ≫ tRange), this normalization compresses T excessively, producing horizontally elongated triangles. The mesh optimizer (aspect guard) and multi-band merging cannot fully compensate, so segmentation lines persist.
- **Narrow Bands**: For tRange ≫ uRange, the effect is less severe, but vertical slivers can still occur if T-inflation is not tuned.
- **Multi-Band CDT**: While merging helps, the underlying domain distortion from normalization is not addressed, so artifacts remain.

## Proposals

### Proposal 1: Fixed Aspect Ratio Normalization (Conservative)
**Idea**: Always map each CDT band to a fixed aspect domain (e.g., [0,1] × [0,A], with A = uRange/tRange or a capped value).
**Mechanism**: Compute the aspect ratio $A = \frac{uRange}{tRange}$ for each band. Map U to [0,1], T to [0,A]. If $A$ exceeds a threshold (e.g., 2.0), cap it to avoid extreme stretching.
**Mathematical basis**: This preserves the relative proportions of the band in the CDT domain, reducing horizontal compression for wide bands.
**Files affected**: OuterWallTessellator.ts (CDT domain mapping), ChainStripTriangulator.ts (band normalization logic).
**Trade-offs**: May introduce vertical stretching in very narrow bands; capping $A$ mitigates this. Simple to implement.
**Assumptions**:
1. The CDT solver is robust to non-square domains.
2. T-inflation can be applied after aspect normalization without introducing new artifacts.

### Proposal 2: Adaptive Local Scaling (Moderate)
**Idea**: Locally adapt the normalization scale along the band, based on local curvature or feature density.
**Mechanism**: For each segment, compute a local aspect ratio $A_{local}$ (e.g., based on arc length of U and T in the vicinity). Map each triangle using a locally varying scale, possibly via a piecewise-linear or spline-based mapping.
**Mathematical basis**: This equalizes triangle aspect ratios even in bands with highly variable width or curvature.
**Files affected**: OuterWallTessellator.ts (per-segment normalization), FeatureEdgeGraph.ts (local arc length computation).
**Trade-offs**: More complex; may require additional data structures. Risk of introducing local distortion if not smoothed.
**Assumptions**:
1. Local arc length can be computed efficiently.
2. CDT solver can handle non-uniform domains.

### Proposal 3: Isotropic Remeshing in CDT Domain (Radical)
**Idea**: After initial CDT, perform isotropic remeshing in the CDT domain to regularize triangle shapes.
**Mechanism**: Insert Steiner points or perform Lloyd relaxation in the CDT domain to equalize edge lengths, then map back to 3D.
**Mathematical basis**: Isotropic remeshing is a standard technique for improving mesh quality.
**Files affected**: OuterWallTessellator.ts (post-CDT remeshing), possibly new Remesher.ts.
**Trade-offs**: Computationally expensive; may disrupt feature alignment. Highest potential for eliminating artifacts.
**Assumptions**:
1. Remeshing can be performed efficiently at current mesh sizes.
2. Feature chains can be preserved during remeshing.

## Integration with T-inflation and Multi-Band CDT
- **T-inflation**: Should be applied after normalization, so that the inflated T values are consistent with the new domain aspect.
- **Multi-Band CDT**: Each band should be normalized independently, but the normalization parameters (aspect ratio, scaling) must be communicated to the merging logic to ensure seamless stitching at band boundaries.
- **Implementation Guidance**:
    - Refactor normalization logic into a dedicated function (e.g., `normalizeBandDomain(uRange, tRange, opts)`).
    - Pass normalization parameters through the CDT pipeline for use in merging and T-inflation.
    - Add diagnostic output for per-band aspect ratios and triangle quality metrics.

## Recommended Approach
- **Start with Proposal 1 (Fixed Aspect Ratio Normalization)**: It is simple, addresses the main issue, and is easy to tune. If artifacts persist in highly variable bands, incrementally add adaptive scaling (Proposal 2).
- **Defer Proposal 3** unless mesh quality remains unacceptable after 1/2.

## Explicit Instructions for Executioner
1. In OuterWallTessellator.ts, locate the CDT domain normalization logic (search for `normalizeDomain` or equivalent).
2. Replace uniform scaling by max(uRange, tRange) with aspect ratio normalization:
    - Compute $A = uRange / tRange$.
    - Map U to [0,1], T to [0,A], capping $A$ at a reasonable value (e.g., 2.0).
3. Ensure T-inflation is applied after normalization.
4. Update multi-band merging logic to account for per-band aspect ratios.
5. Add diagnostic logging for per-band aspect ratio and triangle quality.

## Open Questions / Risks for Verifier
- Does the CDT solver or downstream logic assume a square domain? Any edge cases?
- What is the optimal cap for aspect ratio $A$ to balance regularity and distortion?
- Will T-inflation interact cleanly with non-square domains?
- Are there bands with highly variable local aspect that require adaptive scaling?
- Is there a risk of new artifacts at band boundaries due to mismatched normalization?

---
**End of R28 Proposal**
