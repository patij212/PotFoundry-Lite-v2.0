 ---
  How Feature Chains Link to the Grid — Complete Analysis

  The Pipeline (in order)

  ┌───────┬───────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────┐
  │ Phase │                    Module                     │                              What happens                               │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 1     │ GPU curvature sampling                        │ 16 strips × 4096 samples → curvature profiles                           │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 2     │ FeatureDetection                              │ Gradient zero-crossings → peak/valley per row                           │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 3     │ ChainLinker                                   │ Greedy nearest-neighbor linking across rows, momentum bridging, re-snap │
  │       │                                               │  to GPU-measured peaks                                                  │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 4     │ GridBuilder                                   │ Uniform base grid (no knowledge of chain positions)                     │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 5     │ OuterWallTessellator.buildCDTOuterWall        │ The critical step — chains inserted into grid, triangulated             │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 6     │ GPU evaluate                                  │ UV → 3D positions (first time we have 3D)                               │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 7     │ MeshOptimizer.chainDirectedFlip               │ Diagonal alignment along ridges (UV-based, grid quads only)             │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 8     │ MeshOptimizer.flipEdges3D                     │ Delaunay-like 3D quality flips (grid quads only, skips locked)          │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 9     │ ChainStripOptimizer.optimizeChainStrips       │ 3-phase edge flip on chain-strip triangles (angle + valence + short     │
  │       │                                               │ diagonal)                                                               │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 10    │ ChainStripOptimizer.optimizeBoundaryDiagonals │ Dihedral angle minimization at chain/grid boundary                      │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 11    │ MeshSubdivision.subdivideLongEdges            │ GPU-evaluated midpoints on edges >1.8× average                          │
  ├───────┼───────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ 12    │ AdaptiveRefinement.adaptiveRefine             │ Error-driven iterative split (chord error + normal deviation)           │
  └───────┴───────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────┘

  How Bridging Actually Works (Step 5 in detail)

  buildCDTOuterWall does this:

  1. Chain vertex creation (lines 640-656): Each chain point gets a ChainVertex{u, rowIdx, vertexIdx} appended after grid vertices
  (index >= gridVertexCount)
  2. Interpolation for multi-row gaps (lines 658-700): If consecutive chain points span >1 row, intermediate vertices are linearly
  interpolated: interpU = p0.u + du * frac. This creates diagonal chain segments spanning multiple columns.
  3. Chain edge recording (lines 704-714): Edges between consecutive fullChain entries with rowGap === 1 become constraint edges. Only
  single-row-step edges qualify.
  4. UV-snapping (lines 744-785): Grid vertices near chain points get their U coordinate snapped to the chain's U. This helps
  standard-cell diagonals but doesn't change topology.
  5. Row merging (buildMergedRow, lines 830-862): For each row, chain vertices are interleaved with grid columns sorted by U. A chain
  vertex at u=0.35 lands between grid columns at u=0.2 and u=0.4.
  6. Cell classification (lines 864-908): Cells are marked colHasChain[c] = 1 if any chain vertex or chain edge touches that column
  range.
  7. Triangulation (lines 910-998):
    - Standard cells (no chain): 2 triangles with diagonal optimization
    - Chain cells: Entire run of consecutive chain-marked columns is swept as one strip via constraintAwareTriangulate()

  constraintAwareTriangulate — The Core Problem

  This function (lines 227-325) handles the bridging. Its algorithm:

  1. Classify each constraint edge: which vertex is in the bottom row, which in top
  2. Sort constraints by midpoint U (left-to-right)
  3. Process left to right: for each constraint, sweep the region BEFORE it, then advance past it

  sweepRegion (lines 180-207) is a standard alternating-advance monotone sweep. It advances whichever pointer (bottom or top) has the
  smaller next-U, emitting one triangle per step.

  The structural problem: The sweep produces fan topology when a chain vertex sits between grid vertices. If the bottom row has
  vertices at [u=0.0, u=0.35_chain, u=0.4, u=0.6, u=0.8] and the top row has [u=0.0, u=0.2, u=0.4, u=0.6, u=0.8], the sweep creates
  triangles fanning from u=0.35 on the bottom to u=0.0, u=0.2, u=0.4 on the top. These fan triangles have:
  - Two edges along the row (short, ~0.15 in U)
  - One edge crossing rows to a distant vertex (long, diagonal)
  - Aspect ratios 5-20:1, min angles ~5°

  What Each Post-hoc Module Actually Does

  chainDirectedFlip (MeshOptimizer): Only operates on grid quads (2-triangle pairs sharing a diagonal). Chain-strip cells have
  irregular fan topology — not quads. So this module never touches the bad triangles.

  flipEdges3D (MeshOptimizer): Same limitation — only operates on grid quads, skips locked quads.

  optimizeChainStrips (ChainStripOptimizer): This IS designed for chain-strip triangles. It does 3 passes:
  - Phase A: Angle-based Delaunay (flip if min angle improves)
  - Phase B: Valence equalization (flip to fix vertices with valence < 5)
  - Phase C: Short-diagonal tiebreaker

  But it has fundamental limitations:
  - Can only flip existing edges — cannot insert new vertices
  - Guards prevent flips that worsen aspect ratio or cross row boundaries
  - 53% of vertices still have valence < 5 after all 3 phases

  subdivideLongEdges (MeshSubdivision): Splits edges >1.8× average. This helps with length but:
  - Splitting a sliver along its longest edge creates two smaller slivers
  - The seam-crossing UV midpoint bug causes 142mm position errors
  - Only runs once (not iterative)

  adaptiveRefine (AdaptiveRefinement): Iterative error-driven splitting. Most sophisticated:
  - Uses SurfaceMetric for metric-aware edge scoring
  - Chord error + normal error tolerances
  - Feature edge protection via FeatureEdgeGraph
  - But it's reactive — it only fixes triangles that exceed error thresholds, not triangles that are topologically poor (a flat sliver
  might have perfect chord error but terrible aspect ratio)

  What's Available but UNUSED for Bridging Decisions

  SurfaceMetric has rich infrastructure that could transform bridging quality:

  ┌───────────────────────────────────────────┬─────────────────────────────┬──────────────────────────────────────────────────────┐
  │                Capability                 │      Currently used by      │                  Could be used for                   │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ MetricTensor {E, F, G} per vertex         │ AdaptiveRefinement edge     │ Pre-computing ideal triangle sizes before            │
  │                                           │ scoring                     │ triangulation                                        │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ PrincipalStretches {sigma1, sigma2,       │ Diagnostic logging          │ Orienting bridging triangles along principal stretch │
  │ anisotropy}                               │                             │  directions                                          │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ MetricField (grid-sampled metric)         │ Not used                    │ Bilinear interpolation to get metric at any UV point │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ metricEdgeLengthSq()                      │ AdaptiveRefinement priority │ Pre-evaluating which chain-cell configurations will  │
  │                                           │                             │ produce slivers                                      │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ anisotropicSplitPriority()                │ AdaptiveRefinement          │ Prioritizing companion vertex placement              │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ targetEdgeLength()                        │ AdaptiveRefinement          │ Computing ideal edge lengths for chain-strip regions │
  ├───────────────────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ estimateSurfaceArea()                     │ Budget calculation          │ Estimating triangle budget per chain cell            │
  └───────────────────────────────────────────┴─────────────────────────────┴──────────────────────────────────────────────────────┘

  The key missed opportunity: SurfaceMetric computes a full metric tensor field but it's only consulted AFTER the mesh is built (Phase
  12). If the metric were available at Phase 5 (triangulation), the sweep could:
  1. Know that a chain vertex at (u=0.35, t=0.5) is in a region with σ₁/σ₂ = 3.2 (highly anisotropic)
  2. Orient bridging triangles to align with the principal stretch direction
  3. Insert companion vertices at metric-optimal positions

  How to Achieve State-of-the-Art Topology

  The fundamental issue is architectural: the grid is built without knowing chain positions, and chains are forced into a pre-existing
  grid. State-of-the-art approaches would be:

  1. Metric-Aware Pre-Triangulation Vertex Insertion (most practical)
  - Before constraintAwareTriangulate, compute the surface metric at chain vertex locations
  - Insert "companion" vertices that decompose fan triangles into well-shaped triangles
  - Use metric tensor to determine optimal companion placement (not just UV centroid)
  - The staircase decomposition I planned addresses the diagonal interpolation part, but the fan topology around single chain vertices
  also needs companion vertices

  2. Advancing Front from Chain Edges (medium complexity)
  - Instead of sweep triangulation, start from chain edges as the initial front
  - Advance the front toward grid vertices, maintaining aspect ratio constraints
  - The front naturally produces well-shaped triangles near the constraint
  - This replaces constraintAwareTriangulate entirely

  3. Local Delaunay Refinement (Ruppert-style) in the chain strip region
  - After the sweep creates bridging triangles, identify all triangles with min angle < 20°
  - Insert circumcenter Steiner points (or off-center for obtuse triangles) iteratively
  - Guarantee minimum angle bound of 20° (Ruppert's theorem)
  - Key difference from the failed centroid approach: circumcenters are placed to maximize min angle, not at the triangle center

  4. Hybrid: Staircase + Metric Companion Vertices (recommended)
  - Staircase decomposition for diagonal chain gaps (from the plan)
  - For each chain vertex in a row, compute the metric tensor
  - Insert 2-4 companion vertices around the chain vertex at metric-optimal positions
  - These form a local "hex ring" that prevents fan topology
  - All companions get 3D positions from GPU evaluation (free — same pipeline)

  Is the Current Logic Correct?

  The logic is correct but insufficient:
  - Chain linking: Correct (kind-separated, re-snapped to GPU peaks)
  - Interpolation: Correct but produces diagonal edges (staircase would be better)
  - Triangulation: Correct coverage guarantee, but fan topology is structural
  - Edge flipping: Correct but can't fix fundamental topology issues
  - Subdivision: Correct but splits slivers into smaller slivers

  The code has no bugs in the chain-grid bridging path. The problem is that no amount of post-processing can fix topology that was
  structurally wrong from the start. The solution must be upstream — either in how chains are inserted into the grid, or in how the
  triangulation accommodates them.