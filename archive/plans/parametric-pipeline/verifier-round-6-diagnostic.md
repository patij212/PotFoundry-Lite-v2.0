# Verifier Round 6 — Diagnostic: T-Ladder at High Density + Persistent Missing Edges
Date: 2026-03-04

## Summary Verdict: REJECT (Round 5 T-Ladder Implementation — Insufficient)

The T-Ladder companion cloud is directionally correct (T-gap sized companions, no
cell bounds check), but produces catastrophic results at density=12. Two distinct
classes of bugs remain:

**Class A: Companion Flood** — 651K companions (2.8× grid vertex count) overwhelm
CDT strips with interior vertices, creating degenerate triangulations.

**Class B: Missing Chain Edges** — 488 missing edges (WORSE than pre-fix 196),
meaning the constraint endpoint injection fix is either broken or insufficient.

## Evidence: Export Metrics (density=12, nTLevels=6, nUSpread=4)

| Metric | Target | Round 4 (rings) | Round 5 (T-Ladder) | Δ |
|--------|--------|-----------------|--------------------|----|
| Companions generated | ~3K | 59,202 | 711,936 | 12× worse |
| Companions after dedup | ~3K | 52,621 | 651,624 | 12× worse |
| Missing chain edges | 0 | 196 | 488 | 2.5× worse |
| maxAspect (UV) | <20:1 | 338,449:1 | 30,177,403.9:1 | 89× worse |
| maxAspect (3D) | <100:1 | 83,810:1 | 3,083,890,123.9:1 | 36,800× worse |
| Inverted triangles | 0 | 125,869 | 431,060 | 3.4× worse |
| Non-manifold edges | 0 | 690 | 858 | 1.2× worse |
| Boundary edges | 0 | 22,459 | 109,941 | 4.9× worse |
| R2 violations | <500 | 25,815 | 25,967 | ~same |
| Validation | PASS | FAIL | FAIL | — |
| Build time | <10s | ~10s | 85,197ms | 8.5× slower |

## Root Cause Analysis

### RC1 [CRITICAL]: Companion Count Explosion at High Density

**Mechanism**: At density=12, nTLevels=6, nUSpread=4:
- Per chain vertex: 2 bands × 6 T-levels × (1 + 2×4 spreads) = 108 candidates
- 4854 chain vertices + micro-row interpolated vertices = ~6600 source vertices
- Pre-dedup: 711,936 companions
- After dedup: 651,624 companions (only 8.5% suppressed)

**Why dedup doesn't help**: Adjacent chain vertices on the SAME chain are spaced
~0.001 apart in U and 1 row apart in T. Their T-Ladder rungs extend into the SAME
two bands but at DIFFERENT U-positions. With COMPANION_DEDUP_THRESHOLD=1e-5 and
U-offsets > 1e-5, nearly all companions survive dedup.

**Impact**: Each CDT strip receives ~116 interior vertices on average (651K / 5642 strips).
The CDT creates tiny triangles around the dense companion cluster and long slivers
connecting the cluster to distant boundary vertices. This explains maxAspect=30M:1.

**Required fix**: The companion count must scale sub-linearly with density. At density=12
the current formula produces 108 per vertex; a reasonable count would be 20-30.
Cap `nTLevels` at 3 and `nUSpread` at 2 regardless of density. Use density to
control companion SPACING QUALITY, not companion COUNT.

### RC2 [CRITICAL]: Missing Chain Edges — Constraint Endpoint Fix Ineffective

The constraint endpoint injection fix (OWT L957-979) was supposed to ensure all
chain edge endpoints appear in stripBot/stripTop. But missing edges INCREASED from
196 to 488.

**Analysis of missing edge examples** (from log):

```
chain0 pt0→pt1: row0→1 col35→35 u=0.083334→0.083248 vidx=230800→230801
chain0 pt48→pt-1: row55→56 col31→31 u=0.077509→0.077419 vidx=230848→231120
chain0 pt105→pt106: row120→121 col28→28 u=0.071428→0.071339 vidx=230905→230906
```

Key observations:
1. ALL missing edges are cross-row (485/488): same-row=0, crossRow=485
2. Missing edges span col→col (same column!) — endpoints are in the SAME strip
3. Some examples have pt→pt-1 (pointIdx=-1 = micro-row interpolated points)
4. All examples are chain0, col 23-35 — NOT seam-related

**Hypothesis**: The constraint endpoints ARE in the CDT vertex set (the injection
fix works), but the CDT is FAILING to honor the constraints because:

a) **Crossing constraints from companion vertices**: With 116 interior vertices
   per strip, the CDT may produce a triangulation where the chain constraint edge
   intersects a Delaunay edge connecting two companions. The CDT algorithm SHOULD
   handle this (it inserts constraint edges by splitting), but `cdt2d` may not
   handle degenerate configurations well.

b) **Near-degenerate vertex configurations**: When companion vertices are
   very close to a chain constraint edge, the CDT may create near-zero-area
   triangles that effectively "absorb" the constraint edge. The edge appears
   in the triangulation as two edges (a→companion, companion→b) rather than
   (a→b), so the verification code flags it as missing.

c) **Batch 6 global dedup interference**: After CDT runs, Batch 6 dedup (QUANT=1e5)
   may merge a chain vertex with a companion or grid vertex, changing the edge
   endpoint index. Even though `allChainEdges` is remapped, if the dedup merges a
   vertex that APPEARS on a constraint edge but was actually a different vertex
   at the same quantized position, the edge verification fails.

**Most likely cause**: (b) — companions at U-positions very close to the chain
constraint path effectively split the constraint. The edge verification checks
for the DIRECT edge (v0→v1) in meshEdgeSet, but the CDT may have split it into
(v0→companion→v1), which would be two edges neither of which matches the original.

### RC3 [WARNING]: Micro-Row T-Gaps Create Near-Zero Companion Spacing

The log shows "87 micro-rows for steep crossings" (400 rows vs 313 base). Micro-rows
have very small T-gaps (inserted between adjacent base rows). When a chain vertex is
at a micro-row, the T-Ladder uses this tiny T-gap for sizing:
- tGap ≈ 0.0001 (vs normal ~0.0025)
- spreadU = 0.0001 × 0.4 = 0.00004

Companions at this scale are even smaller than the Ring design's worst case. They
create the same "microscopic cluster" pathology that crashed the Ring approach.

### RC4 [WARNING]: Build Time 85 Seconds

At density=12 with 651K companions, the build takes 85 seconds (vs ~10s without
companions). The CDT processing 116 interior vertices per strip × 5642 strips is
the bottleneck. This is unacceptable for an interactive tool.

## Requirements for Generator Round 6

### HARD REQUIREMENTS (non-negotiable)

1. **Cap companions per chain vertex at 20** regardless of density parameter.
   Use density to control spacing quality, not count.

2. **Minimum T-gap guard**: Skip companion generation for chain vertices at
   micro-rows where tGap < MIN_TGAP_FOR_COMPANIONS (e.g., 0.001).

3. **Fix the missing edge problem**: The current approach produces MORE missing
   edges than before the fix. Either:
   (a) Don't place companions within a minimum distance of chain constraint paths
       (so CDT doesn't split the constraint edge), OR
   (b) Change the edge verification to accept "path-connected" edge enforcement
       (v0→...→v1 through intermediate vertices), OR
   (c) Remove companions entirely and solve the sliver problem differently.

4. **Performance**: Build time must be under 20 seconds at any density setting.

### DESIGN CONSTRAINTS

5. The chain polylines MUST be sharp — constraint edges must appear as direct
   mesh edges (not split through companion vertices). This is the user's primary
   complaint.

6. The T-Ladder concept (adding T-density between rows) remains correct. But
   the companion count, sizing, and placement relative to chain constraint paths
   need fundamental rethinking.

7. Companions must NEVER be placed ON or NEAR a chain constraint edge path.
   They should be placed in the regions BETWEEN chains, not around chain vertices.

## Key Architecture Files
- OuterWallTessellator.ts L395-550: T-Ladder companion generation
- OuterWallTessellator.ts L957-979: Constraint endpoint injection
- OuterWallTessellator.ts L1010-1095: Edge verification
- ChainStripTriangulator.ts L230-260: CDT interior vertex injection
- ChainStripTriangulator.ts L260-340: Triangle filtering and quality measurement
