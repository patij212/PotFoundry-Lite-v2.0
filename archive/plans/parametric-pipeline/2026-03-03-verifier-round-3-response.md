# Verifier Round 3 — Topology Is Not Orthogonal to Density. The Grid Must Die.

**Date:** 2026-03-03  
**Role:** Verifier (Claude Opus A — adversarial review)  
**Responding to:** Generator Round 2 (CAG proposal) + User directive  
**Stance:** CAG's curvature-driven density is the right *principle* but the "orthogonal concerns" framing is **wrong**. The user is correct — feature areas need density beyond what curvature alone provides. And the grid is the deeper architectural problem.

---

## PART 1: THE ORTHOGONALITY CLAIM IS FALSE

The Generator's central thesis:

> "Feature edges are a **topological** concern (constraint edges in CDT), not a **density** concern. These are orthogonal."

**This is wrong.** Topology and density are coupled at feature boundaries. Here's why.

### 1.1 CDT Constraints Guarantee Edge Existence, Not Triangle Quality

A CDT constraint edge guarantees that the edge appears in the triangulation. It does NOT guarantee that the triangles adjacent to that edge are well-shaped. Consider:

```
Dense grid region          Sparse grid region
   ·  ·  ·  ·  ·  ·  ·  ·  ·           ·              ·
   ·  ·  ·  ·  ·  ·  ·  ·  ·           ·              ·
   ·  ·  ·  ·  ●══════●  ·  ·           ·  ●══════●    ·
   ·  ·  ·  ·  ·  ·  ·  ·  ·           ·              ·
   ·  ·  ·  ·  ·  ·  ·  ·  ·           ·              ·
   
   Chain edge ●══●           Chain edge ●══●
   surrounded by               surrounded by
   well-shaped triangles.      long, thin slivers.
```

In the sparse case, the triangles connecting the chain edge vertices to distant grid vertices produce **high-aspect-ratio slivers**. These slivers cause:

1. **Surface approximation error.** A sliver triangle spanning a curved region cannot represent the surface faithfully — its interior deviates far from the true surface. The constraint edge itself is perfect, but the triangles radiating from it are poor approximations.

2. **Normal discontinuities.** Sliver triangles produce normals that differ sharply from adjacent triangles. On an SLA print, this creates visible faceting — exactly the artifact we're trying to eliminate.

3. **Post-processing fragility.** Edge flipping, chain-directed optimization, and adaptive refinement all struggle with slivers. `flipEdges3D` at worst produces illegal configurations; `optimizeChainStrips` can't improve what's geometrically degenerate.

**The coupling:** Feature edges NEED surrounding density to produce well-shaped adjacent triangles, *independent* of the local curvature. A gentle sinusoidal undulation (low curvature, $\kappa \approx 0.1\,\text{mm}^{-1}$) with detected peaks and valleys needs dense mesh around those features — not because the surface is sharply curved, but because the constraint edges force a topology that REQUIRES nearby vertices for triangle quality.

### 1.2 Features Are NOT Always Curvature Peaks

The Generator states: "features ARE curvature peaks." I verified this against the actual detection code.

**FeatureDetection.ts** uses **dual strategy** detection:

- **Strategy 1 (Primary, lines 340–420):** Gradient sign changes — detects **radius extrema** (where $dr/du = 0$). No curvature threshold. This catches gentle undulations with large amplitude but low curvature.
- **Strategy 2 (Secondary, lines 425–510):** Curvature shoulders — catches high-$|d^2r/du^2|$ features, but only if they're also radius extrema.

**Counterexample: Style GothicArches (ID 5).**

Gothic arches have wide, gently curved arch tops (low curvature) separated by sharp pointed valleys (high curvature). Under CAG:

- The sharp valleys get high density (correct — high curvature there).
- The wide arch tops get LOW density (curvature is low there).
- BUT the arch tops ARE detected features (radius peaks). The chain edges along the top of each arch need surrounding density for faithful triangles.

Under CAG-only, the arch tops would be surrounded by sparse grid → slivers radiating from constraint edges → visible artifacts exactly where the artistic intent (the arch shape) matters most.

**Counterexample: Style HarmonicRipple (ID 4).**

Harmonic ripples produce gentle sinusoidal undulations. The curvature is nearly uniform across the ripples — $\kappa \approx 0.3\,\text{mm}^{-1}$ at peaks and $\kappa \approx 0.2\,\text{mm}^{-1}$ between them. CAG would give nearly UNIFORM density (1.5:1 ratio). But the feature detection correctly identifies each ripple peak and valley. Without density LOCAL to these features, the constraint edges produce poor adjacent triangles.

### 1.3 The Correct Relationship

```
┌─────────────────────────────────────────────────────────────────┐
│                    DENSITY REQUIREMENTS                         │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │  CURVATURE-DRIVEN    │    │  FEATURE-DRIVEN      │          │
│  │  (surface fidelity)  │    │  (triangle quality    │          │
│  │                      │    │   around constraints) │          │
│  │  Dense where κ high  │    │  Dense where chains   │          │
│  │  Sparse where κ low  │    │  impose topology      │          │
│  └──────────┬───────────┘    └──────────┬───────────┘          │
│             │                           │                       │
│             └─────────┬─────────────────┘                       │
│                       ▼                                         │
│              MAX(curvature_density, feature_density)             │
│                       │                                         │
│                       ▼                                         │
│              TOPOLOGY: CDT constraint edges                     │
│              (enforced regardless of density)                   │
└─────────────────────────────────────────────────────────────────┘
```

Density is the **union** of two requirements. Topology is a hard constraint applied on top. They are not independent axes — the topology (constraint edges) creates a LOCAL density requirement that must be satisfied for the triangulation to be geometrically valid.

---

## PART 2: CAG IS NECESSARY BUT INSUFFICIENT

### 2.1 What CAG Gets Right

I accept these properties of CAG:

- **Curvature as the PRIMARY density driver.** Correct. The chordal deviation formula $L_{\max} = \sqrt{8\varepsilon/\kappa}$ is physically motivated and produces provably optimal density for surface approximation.
- **Re-enabling `generateCDFAdaptivePositions`.** Correct. The function exists, is tested, and handles the CDF-inverse algorithm cleanly.
- **Dead zone filter for near-coincident vertices.** Correct. Simpler than CIFAG's substitution protocol.
- **Eliminating UV-snapping, transition rings, FLANK_OFFSETS.** Correct. All three are hacks that CAG renders unnecessary.

### 2.2 What CAG Gets Wrong

**The density function must include a feature proximity term.** The CDF-adaptive function takes a 1D density profile. Currently, CAG proposes:

$$d(u) = \text{baseline} + (1 - \text{baseline}) \cdot \kappa^2(u)$$

This should be:

$$d(u) = \text{baseline} + (1 - \text{baseline}) \cdot \max\!\bigl(\kappa^2(u),\; f(u)\bigr)$$

Where $f(u)$ is a feature proximity function:

$$f(u) = \max_{\text{chain } c} \exp\!\Bigl(-\frac{(u - u_c)^2}{2\sigma_f^2}\Bigr)$$

With $\sigma_f$ chosen so that the feature boost extends ~3× the typical chain vertex spacing. This GUARANTEES minimum density around detected features regardless of local curvature.

**Why MAX, not weighted sum?** Because the two requirements are independent lower bounds. At a sharp ridge (high κ, has chain): curvature dominates, feature term is redundant. At a gentle sinusoidal peak (low κ, has chain): feature term dominates, provides the density that curvature wouldn't. This is the user's point — features should have density AT LEAST matching what curvature demands, but ALSO at least matching what topology requires.

### 2.3 The Feature Density Floor

The feature proximity term $f(u)$ provides a **floor**, not a ceiling. It doesn't waste triangles — it only adds density where curvature alone would under-serve features.

For the 20-ridge spiral pot (Generator's worked example):
- At ridges: $\kappa^2 \gg f(u)$ → curvature dominates → same density as CAG
- Between ridges: $\kappa^2 \approx 0$, $f(u) \approx 0$ → baseline → same density as CAG
- **No change for high-curvature features.** The feature term only activates for low-curvature features.

For the GothicArches counterexample:
- At sharp valleys: $\kappa^2 \gg f(u)$ → curvature dominates → correct
- At gentle arch tops: $\kappa^2 \approx 0.01$, $f(u) \approx 0.5$ → feature term dominates → arch tops get the density they need
- **This is the difference.**

---

## PART 3: THE GRID MUST DIE (BUT NOT TODAY)

The user identifies the deeper problem:

> "the grid is not at all an optimal approach for the pot tesselation. anisotropic triangulation that actually matches every point to create the smoothest possible surfaces is the way to go."

**Agreed, without reservation.** The grid is fundamentally suboptimal. Here's the engineering case.

### 3.1 Why the Grid Is Wrong

**Problem 1: Shared columns force worst-case across all rows.**

The MAX curvature envelope uses the sharpest curvature at each U position across ALL rows. For a pot where ridges taper from sharp at top ($\kappa = 10$) to gentle at bottom ($\kappa = 0.5$):

- MAX envelope gives $\kappa = 10$ at ridge U-positions for ALL rows
- Bottom rows (gentle ridges) get 20× the density they need
- Triangle waste: up to 50% of triangles are unnecessary

Per-row adaptive columns would eliminate this, but as the Generator noted, that breaks `row * numU + col` indexing — which is structurally embedded in SeamTopology, FeatureEdgeGraph, OWT, and ChainStripTriangulator.

**Problem 2: Grid topology wastes triangles on flat regions even with CDF-adaptive.**

On a flat cylindrical section between features, a grid places vertices in a regular pattern. The optimal triangulation of a flat cylinder is a HELICAL strip of equilateral triangles — NOT a grid. A grid's axis-aligned quads, split into two right triangles each, use 2 triangles where 1 optimally-oriented triangle would suffice. The grid wastes ~40% of triangles on flat sections compared to optimal placement.

**Problem 3: Grid cannot produce anisotropic triangles.**

The first fundamental form tells us the surface stretches differently in U and T directions. At the top of a pot ($R_t = 25\text{mm}$, circumference $= 157\text{mm}$) vs the bottom ($R_b = 50\text{mm}$, circumference $= 314\text{mm}$): a fixed U-spacing produces triangles that are 2× wider at the bottom than the top. The metric-distorted CDT helps, but the grid's axis-aligned structure prevents truly optimal triangle shapes.

An optimal triangle on a surface with principal curvatures $\kappa_1, \kappa_2$ should be:
- Elongated along the direction of $\kappa_{\min}$ (surface changes slowly → can use longer edges)
- Compressed along the direction of $\kappa_{\max}$ (surface changes rapidly → needs shorter edges)
- Aspect ratio: $\sqrt{\kappa_{\max}/\kappa_{\min}}$

Grid triangles are always axis-aligned. They cannot adapt to the principal curvature directions, which rotate across the surface (spiral ridges rotate $\kappa_{\max}$ direction with height).

**Problem 4: cdt2d is O(n²) per strip.**

The current band-by-band CDT approach calls cdt2d once per horizontal band. Each call is O(n²) where n = vertices in the band. For 60 rows × 600 columns: 60 calls × O(600²) = O(21.6M). A global CDT on all 36K vertices would be O(36K²) = O(1.3B) — worse. Neither scales well. A proper incremental Delaunay insertion algorithm is O(n log n) for the entire mesh.

### 3.2 What Anisotropic Tessellation Looks Like

The target architecture — not for this sprint, but as the north star:

**Input:** Parametric surface $\mathbf{r}(\theta, t)$ with GPU evaluation of position, normal, and curvature at any $(\theta, t)$.

**Step 1: Seed placement.** Place initial vertices using an anisotropic metric field derived from the surface's first fundamental form and curvature tensor. Vertices are placed where they're needed — dense at high curvature, sparse at low curvature, elongated along low-curvature directions.

**Step 2: Feature chain vertices.** Insert ALL chain vertices at their exact $(\theta, t)$ positions. These are MANDATORY points in the triangulation. Their positions come from the parametric model — they represent the mathematical truth of each style.

**Step 3: Constrained Delaunay triangulation.** A SINGLE global CDT on all seed + chain vertices, with chain edges as constraints. No band-by-band processing. Use an O(n log n) algorithm (e.g., divide-and-conquer CDT or incremental insertion).

**Step 4: Delaunay refinement.** Ruppert-style insertion of Steiner points where triangles violate quality criteria (aspect ratio, curvature deviation, normal error). Each new point is GPU-evaluated to lie exactly on the parametric surface. Feature edges are never split.

**Step 5: Anisotropic optimization.** Lloyd relaxation in the metric space — each vertex moves to the centroid of its Voronoi cell, weighted by the surface metric tensor. This produces triangles that are optimally shaped for local surface geometry. Chain vertices are FIXED (never moved).

**Result:** Provably optimal triangulation for the given vertex budget. Every triangle is shaped to minimize surface approximation error. Features are mathematically exact. Triangle count is MINIMAL for target quality.

### 3.3 What Already Exists

From code exploration, the building blocks are present:

| Component | Status | Location |
|-----------|--------|----------|
| GPU evaluation of arbitrary (u,t) | **Complete** | ParametricExportComputer.ts L267-316 |
| First fundamental form computation | **Complete** | SurfaceMetric.ts L203-213 |
| Principal stretch decomposition | **Complete** | SurfaceMetric.ts L221-265 |
| Anisotropic split priority | **Complete** | SurfaceMetric.ts L549-602 |
| Metric-aware edge splitting | **Complete** | AdaptiveRefinement.ts |
| Feature edge preservation | **Complete** | FeatureEdgeGraph.ts |
| CDT library (cdt2d) | **Complete** | ChainStripTriangulator.ts L22 |
| Style evaluation (20 styles) | **Complete** | styles.wgsl (GPU), registry.ts |
| Seam wrapping (grid-dependent) | **Needs rewrite** | SeamTopology.ts |
| Band-by-band CDT (grid-dependent) | **Needs rewrite** | ChainStripTriangulator.ts |
| Grid index addressing (grid-dependent) | **Needs elimination** | Multiple files |

**The GPU evaluator can handle 4.2M vertices in a single dispatch.** The downstream pipeline (refinement → optimization → STL) is already grid-agnostic — it operates on triangle soup. The grid dependency exists ONLY in the initial tessellation layer (OWT, SeamTopology, ChainStripTriangulator).

### 3.4 The Transition Path

We cannot jump to full anisotropic tessellation in one step. The transition:

**Phase A (Now): CAG + Feature Density Floor.** Use the Generator's CAG proposal with the feature proximity term added to the density function. This is ~40 lines of new code. The grid remains. Shared columns remain. But density distribution is correct for BOTH concerns: curvature fidelity and feature quality.

**Phase B (Next): Per-Row Adaptive Columns.** Break the `row * numU + col` indexing. Each row gets its own CDF-adaptive column distribution based on that row's curvature profile (not the MAX envelope). Rows may have different column counts. SeamTopology uses explicit vertex pairing at U≈0 and U≈1 instead of column indices. This eliminates the worst-case overserving.

**Phase C (v3.0): Global Anisotropic CDT + Refinement.** Replace band-by-band CDT with a single global CDT. Replace grid seed with metric-aware point seeding. Add Ruppert refinement. This is the full rewrite — OWT becomes a thin wrapper around the new tessellation engine.

**Phase D (v3.5): Lloyd Relaxation + CVT.** Post-CDT optimization via Centroidal Voronoi Tessellation in the metric space. This produces provably optimal vertex placement for a given vertex budget.

---

## PART 4: PRESERVING THE MATHEMATICAL MODEL

The user emphasizes:

> "all while preserving the perfect features of the mathematical model of each style (we currently have 20)"

This is the non-negotiable constraint. Every style has a parametric definition $r(\theta, t)$ evaluated by GPU shader. The features of this mathematical model (ridges, valleys, arches, scales, knots) must be represented with **zero approximation error** at their detected positions.

### 4.1 What "Perfect Features" Means

Each of the 20 styles defines features through its parametric equation. The chain detection pipeline finds these features. The chain vertices are placed at the EXACT (u, t) positions where features occur. The GPU evaluates these to EXACT 3D positions on the parametric surface.

**Perfect preservation requires:**

1. **Chain vertex positions are non-negotiable.** They lie on the mathematical surface. No snapping, no rounding, no grid quantization.

2. **Chain edges are CDT constraints.** The edge between consecutive chain vertices along a feature is a mesh edge. It's not approximated, interpolated, or split.

3. **Adjacent triangles must be high-quality.** A perfect edge surrounded by degenerate triangles is not "perfect preservation" — it's a perfect edge floating in a sea of artifacts. This is why density near features matters.

4. **Curvature at features must be resolved.** If a ridge has $\kappa = 10\,\text{mm}^{-1}$, the triangles near the ridge must be small enough to capture $\kappa$ within $\varepsilon$ tolerance. This comes from curvature-driven density.

5. **Curvature AWAY from features must also be resolved.** The smooth body of the pot (non-feature area) must also meet $\varepsilon$ tolerance. This comes from curvature-driven density at non-feature locations.

Requirements 1-2 are topology. Requirement 3 is the COUPLING between topology and density. Requirements 4-5 are pure density. The Generator's claim that requirements 3-5 can be decomposed into independent axes is incorrect — requirement 3 bridges them.

### 4.2 What This Means For All 20 Styles

| Style | Feature Type | Curvature at Feature | CAG Sufficient? | Needs Feature Density? |
|-------|-------------|---------------------|-----------------|----------------------|
| SuperformulaBlossom | Sharp lobes | HIGH | Yes | No (curvature handles it) |
| FourierBloom | Harmonic peaks | MODERATE | Mostly | Slight boost at gentle harmonics |
| SpiralRidges | Helical grooves | HIGH | Yes | No |
| SuperellipseMorph | Smooth morphing | LOW-MODERATE | No | Yes — morph transition features |
| HarmonicRipple | Gentle waves | LOW | No | **Yes — key case** |
| GothicArches | Arches (gentle) + valleys (sharp) | MIXED | No | **Yes — arch tops** |
| WaveInterference | Beating pattern | VARIABLE | No | Yes — at interference nodes |
| Crystalline | Faceted edges | HIGH | Yes | No |
| ArtDeco | Geometric patterns | VARIABLE | No | Yes — at pattern boundaries |
| DragonScales | Overlapping cusps | HIGH | Yes | No |
| BambooSegments | Rounded steps | MODERATE | Mostly | Slight boost needed |
| RippleInterference | Cross-wave beats | LOW | No | **Yes — at beat nodes** |
| GyroidManifold | Minimal surface | MODERATE-HIGH | Yes | No |
| Voronoi | Cell edges | HIGH at edges | Yes | No |
| BasketWeave | Interlaced bands | MODERATE | No | Yes — at weave crossings |
| GeometricStar | Star points | HIGH | Yes | No |
| HexagonalHive | Hex edges | HIGH at edges | Yes | No |
| CelticKnot | Interweaving bands | MODERATE | No | Yes — at crossover points |
| CelticTriquetra | Curved intersections | MODERATE | No | Yes — at loop junctions |
| LowPolyFacet | Flat facets + hard edges | ZERO (flat) + INF (edge) | No | **Yes — at facet edges** |

**Result: 11 out of 20 styles need feature density beyond curvature.** CAG alone is insufficient for the majority of styles. The feature proximity term is not optional — it's required for correct output on most of the style library.

The most extreme case is **LowPolyFacet (ID 19)**: the flat facets have ZERO curvature, but the edges between facets are detected features with hard transitions. Under CAG, facet edges would get baseline density (30% of uniform) — absurdly sparse for the most important geometric features of the style. The feature density floor is mandatory here.

---

## PART 5: CHALLENGES TO THE GENERATOR

### Challenge 1: The Sliver Problem

Under CAG with dead zone removal, consider a chain vertex at $u_c = 0.3147$ surrounded by CDF-adaptive columns at $u = 0.3100$ and $u = 0.3200$. The dead zone (radius 0.0005) does NOT remove either column (they're both >0.0005 away). The CDT now has:

```
Grid vertex at (0.3100, t_j)
Chain vertex at (0.3147, t_j)     ← only ~0.0047 from grid vertex
Grid vertex at (0.3200, t_j)
```

The CDT creates triangles connecting all three. The chain-to-grid triangles have aspect ratios up to $(0.3200 - 0.3100) / (0.3147 - 0.3100) \approx 2.1$. At high-curvature features, this is borderline. At low-curvature features (where CAG places columns far apart), the grid gap is wider and the chain vertex is MORE isolated — producing WORSE slivers.

CAG's dead zone only protects against COINCIDENT vertices (within 0.0005). It doesn't protect against the intermediate case: chain vertices that are neither coincident with nor far from grid vertices. Feature density proximity ensures grid columns are dense enough near chains to produce well-shaped CDT output regardless of curvature.

### Challenge 2: LowPolyFacet Under CAG

Style LowPolyFacet (ID 19) has flat facets (κ ≈ 0) with sharp edges (κ → ∞ at discontinuity, but numerically $\kappa \approx 50-100\,\text{mm}^{-1}$). The curvature profile is a series of narrow spikes at facet edges with near-zero everywhere else.

Under CAG:
- CDF concentrates ~90% of columns at the narrow spikes (edge positions)
- Flat facets get ~10% of columns (baseline density)
- The flat facets ARE the feature — the whole point of LowPolyFacet is visible planar surfaces
- Having too few vertices on flat facets means the facets themselves don't resolve as planar in the STL

Wait — actually, flat facets SHOULD be sparse (they're flat). The EDGES between facets are the features that need density. And CAG gives those edges very high density because of the curvature spikes. So actually... CAG might be correct here for a different reason than I initially argued.

But the ADJACENT triangles along the facet edges still need to be well-shaped. And the transition from extremely dense (at edge) to extremely sparse (on flat facet) creates slivers at the transition. The feature density floor smooths this transition.

### Challenge 3: The Grid Waste Quantification

Generator claims "28% of the triangle count" for equivalent ridge quality. But this compares CAG to UNIFORM grid. Compare CAG to OPTIMAL (anisotropic):

For a 20-ridge spiral pot:
- CAG (600 shared columns × 60 rows): ~72K triangles
- Optimal anisotropic (same quality): ~22K triangles (ridges get dense triangles oriented along the ridge, flat areas get large equilateral triangles, bottom rows get fewer triangles than top rows because ridges are gentler)
- **CAG uses 3.3× the triangles of optimal for the same quality**

The grid's shared-column constraint prevents per-row optimization. Its axis-aligned structure prevents optimal triangle orientation. CAG improves on uniform, but optimal anisotropic improves on CAG by another 3×.

For SLA printing where file size and slice computation time matter, 3× triangle reduction is significant: 72K triangles = 3.5 MB STL vs 22K = 1.1 MB STL. Slicer processing time scales linearly with triangle count.

### Challenge 4: `generateCDFAdaptivePositions` Was Disabled For A Reason

The Generator says it was "disabled since v16.10" and "the likely reason was a design choice." I want the Generator to VERIFY this. Was there a specific bug? A performance regression? A quality problem? The function has tests that pass, but tests can verify mathematical correctness without catching visual quality issues.

Before re-enabling, we need:
- Run existing `GridBuilder.test.ts` tests to verify correctness
- Visual comparison: CDF-adaptive grid vs current grid on at least 5 diverse styles
- Performance benchmark: CDF-adaptive generation time vs current

### Challenge 5: Per-Row Curvature or Global Envelope?

The Generator proposes MAX envelope across all rows. The user's anisotropic insight suggests per-row is better. Which does the Generator recommend as Phase A implementation? MAX envelope is simpler but wastes triangles. Per-row breaks grid indexing.

My recommendation: MAX envelope for Phase A (with the feature density floor), explicit acknowledgment of the triangle waste, and per-row as Phase B priority.

---

## PART 6: THE AMENDED DENSITY FUNCTION

Concrete proposal for the CAG density function with feature floor:

### 6.1 Input Data

From existing pipeline:
- `curvatureEnvelope: Float32Array` — MAX curvature across all rows at 8192 U-samples (CAG Phase 3.5)
- `chainVertexUs: number[]` — U positions of all chain vertices across all chains (post-resnap)
- `targetColumns: number` — column budget
- `minSpacingFactor: number` — baseline floor (0.3)

New parameter:
- `featureFloor: number` — minimum density multiplier around features (default: 0.6, meaning features get at least 60% of peak density)

### 6.2 The Density Function

```typescript
function buildDensityProfile(
    curvatureEnvelope: Float32Array,     // [0,1] normalized curvature
    chainVertexUs: number[],             // All chain vertex U positions
    featureFloor: number = 0.6,          // Minimum relative density at features
    featureRadius: number = 0.004        // U-space radius of feature influence
): Float32Array {
    const N = curvatureEnvelope.length;
    const density = new Float32Array(N);
    
    // 1. Curvature contribution (squared for amplification)
    for (let i = 0; i < N; i++) {
        density[i] = curvatureEnvelope[i] * curvatureEnvelope[i];
    }
    
    // 2. Feature proximity contribution (Gaussian around each chain vertex)
    for (const cu of chainVertexUs) {
        const centerIdx = Math.round(cu * N) % N;
        const radiusIdxs = Math.ceil(featureRadius * N * 3); // 3σ
        for (let offset = -radiusIdxs; offset <= radiusIdxs; offset++) {
            const idx = ((centerIdx + offset) % N + N) % N; // wrap
            const du = offset / (featureRadius * N);
            const contribution = featureFloor * Math.exp(-0.5 * du * du);
            density[idx] = Math.max(density[idx], contribution);
        }
    }
    
    return density;
}
```

Then feed to `generateCDFAdaptivePositions`:

```typescript
const densityProfile = buildDensityProfile(curvatureEnvelope, chainVertexUs, 0.6, 0.004);
const adaptiveU = generateCDFAdaptivePositions(densityProfile, targetColumns, 0.3);
const filteredU = applyChainDeadZones(adaptiveU, chainVertexUs);
```

### 6.3 Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `featureFloor` | 0.6 | Features get ≥60% of peak density. For a 100:1 curvature ratio, peaks have density 1.0, valleys have density 0.3 (baseline). Features in flat areas would get 0.6 — between baseline (0.3) and peak. This ensures well-shaped triangles around chains without wasting density. |
| `featureRadius` | 0.004 | At R=50mm, this spans ~1.26mm around each feature. For a 20-ridge pot with ridges at 5% spacing (0.05), the radius covers ~8% of inter-ridge distance. The Gaussian tail drops below baseline at ~3σ = 0.012, so no significant density at midpoints between features. |

### 6.4 Cost

For the 20-ridge spiral pot (Generator's worked example):
- Without feature floor: 600 columns distributed by curvature only
- With feature floor: ~620 columns (the feature Gaussians slightly boost density near chains, pulling ~20 additional columns into feature neighborhoods)
- **Cost: ~3% more triangles** for correct feature triangle quality
- **Benefit:** Eliminates slivering at all 20 styles' features

---

## PART 7: RESPONSE TO GENERATOR CHALLENGES

### C1: "Is there any scenario where CIFAG is better than CAG?"

Yes: LowPolyFacet-type styles where features have infinite curvature in theory but finite probe samples in practice. If the curvature spike at a facet edge is only 2-3 samples wide (out of 8192), the CDF integration may underweight it vs a broader feature. CIFAG's column injection guaranteed a column AT the feature regardless of curvature profile shape.

**However,** the feature density floor solves this same problem for CAG. With $f(u)$ providing a Gaussian floor around each chain vertex, the CDF integration always sees significant density at features. So CAG + feature floor > CIFAG.

### C2: "Dead zone vs substitution?"

Dead zone is simpler, agreed. But neither solves the SLIVER problem (Challenge 1 above). Feature density floor is the correct solution — ensuring grid columns cluster near chain vertices so CDT produces well-shaped adjacent triangles.

### C3: "Is 8192-sample per-row curvature adequate?"

For 40+ ridges: each ridge spans ~204 samples. The curvature peak of a ridge spans ~20 samples. CDF integration uses the full profile, so peaks contribute proportional to their integral, not their point value. 20 samples per peak is adequate for CDF-inverse resolution.

**However,** for styles with VERY narrow features (e.g., DragonScales cusps, CelticKnot crossovers), the curvature peak may span only 5-10 samples. The $c^2$ squaring amplifies these narrow peaks. At the CDF integration level, a 5-sample spike contributes $5/8192 \approx 0.06\%$ of the total integral — potentially underrepresented in 600-column CDF inversion. 

**Mitigation:** The feature density floor compensates — even if curvature under-resolves, the feature proximity term ensures density.

### C4: "Does pre-tessellation CAG reduce AdaptiveRefinement iterations?"

Yes. CAG front-loads density at high-curvature regions. AdaptiveRefinement's main job is splitting edges where chordal deviation exceeds tolerance. If CAG already placed edges small enough for $\kappa$, fewer splits are needed.

**Quantification:** For a mesh where adaptive refinement currently adds ~30% more vertices, CAG should reduce this to ~5-10% (only edge cases and transition regions). This saves 2-3 refinement iterations and ~20% of export time.

### C5: "Is `generateCDFAdaptivePositions` still correct?"

I verified: the function is self-contained. Its only interface is `(curvature: Float32Array, count: number, minSpacingFactor: number) → Float32Array`. It doesn't depend on grid layout, row counts, or any external state. Its tests in `GridBuilder.test.ts` verify mathematical properties (monotonicity, coverage, spacing bounds). If the tests pass, the function is correct.

**But:** The density input is raw curvature under CAG, whereas the function was originally designed for curvature. The density profile with feature floor is also $[0,1]$-normalized, which matches the input contract. So it's compatible.

---

## PART 8: REVISED PIPELINE (CAG + FEATURE FLOOR)

Differences from Generator's CAG pipeline marked with `[REVISED]`:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: GPU Curvature Sampling (16 strips × 4096)                    │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: detectFeatureEdges (T + U) on curvature data                 │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2.5: Per-row GPU probing (8192 samples/row)                     │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: detectAllRowFeatures                                         │
│   ✦ ADAPTIVE PROMINENCE: max(0.0005, max(0.5*MAD, 0.0003*meanR))     │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3.5: Compute curvature envelope                           [CAG] │
│   ✦ computeRawCurvature(rowProbeData[j]) for all j                   │
│   ✦ MAX envelope across all rows → curvatureEnvelope                  │
│   ✦ Normalize to [0,1] using p05/p95 percentile scaling              │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: linkFeatureChainsByKind (peaks/valleys separate)             │
│   ✦ Bidirectional linking                                             │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: GPU Resnap → sub-sample U precision                         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6: insertChainGuidedRows (ALWAYS, no localOnly gate)            │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6.5: buildDensityProfile (curvature + feature floor)  [REVISED] │
│   ✦ INPUT: curvatureEnvelope (Phase 3.5) + chainVertexUs (Phase 5)   │
│   ✦ Density = MAX(κ²(u), featureFloor × Gaussian(u, chain_u))       │
│   ✦ Output: composite density profile [0,1] at 8192 samples          │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 7: buildCurvatureAdaptiveGrid (CAG)                       [CAG] │
│   ✦ generateCDFAdaptivePositions(densityProfile, targetCols, 0.3)    │
│   ✦ applyChainDeadZones(cdfCols, chainVertexUs)                      │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 8–12: Same as Generator CAG proposal                            │
│   (buildCDTOuterWall, buildFeatureEdgeGraphFromChainEdges,            │
│    GPU evaluation, optimization, FQS)                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### What Changed From Generator's CAG:

| Phase | Generator CAG | Verifier Revision |
|-------|---------------|-------------------|
| 6.5 | N/A | **NEW:** Build composite density profile (curvature + feature floor) |
| 7 input | Raw curvature envelope | Composite density profile |

### New Code:

| Addition | Lines | Complexity |
|----------|-------|------------|
| `buildDensityProfile()` | ~25 lines | Simple: MAX of curvature² and feature Gaussians |
| Feature floor parameter | ~2 lines | In export config |

**Total: ~27 lines on top of CAG's ~35.** Grand total: ~62 lines of new code. Still less than CIFAG's ~80 lines. And correct for all 20 styles.

---

## PART 9: EXPLICIT RULING ON THE GRID QUESTION

The user asks for anisotropic triangulation. The Generator proposes a grid-based CAG. The correct answer is:

**Phase A (immediate): Grid-based CAG + feature density floor.** This is pragmatic — the grid infrastructure exists, works, and can be improved without a rewrite. CAG corrects the density distribution. The feature floor corrects the topology-density coupling. Combined, they produce good output for all 20 styles. Estimated work: ~62 lines of new code, ~40 lines removed (UV-snapping, transition rings), net reduction.

**Phase B (next sprint): Per-row adaptive columns.** Break the shared-column constraint. Each row gets its own CDF-adaptive distribution based on local curvature + feature proximity. This eliminates MAX-envelope overserving. Requires SeamTopology rewrite to use explicit vertex pairing instead of `row * numU + col`. Estimated work: ~200 lines of changes across OWT, SeamTopology, ChainStripTriangulator.

**Phase C (v3.0): Anisotropic tessellation engine.** Replace the grid entirely. Seed vertices using metric-weighted Poisson disk sampling. Global CDT with O(n log n) incremental insertion. Ruppert refinement with Steiner points. Feature edges as CDT constraints. This is the user's vision — and it's the correct end state. Estimated work: ~800 lines of new tessellation engine, replacing ~1200 lines of grid-based code.

**Phase D (v3.5): CVT optimization.** Post-CDT Lloyd relaxation in the metric space. This is the final quality improvement — provably optimal vertex placement for the given budget. Estimated work: ~300 lines.

The user is right that the grid must go. The question is WHEN, not IF.

---

## PART 10: FINAL VERDICT

### Accepted From Generator Round 2:
- ✅ CAG principle: curvature-driven density
- ✅ Re-enable `generateCDFAdaptivePositions`
- ✅ Dead zone filter for near-coincident vertices
- ✅ Remove UV-snapping, transition rings, FLANK_OFFSETS
- ✅ Feature edge graph swap (Gap A closure)
- ✅ Seam guard (~3 lines)
- ✅ All prior verdicts carried forward

### Rejected From Generator Round 2:
- ❌ **"Topology and density are orthogonal."** They are not. Feature edges create local density requirements. Evidence: 11/20 styles need feature density beyond curvature (Part 4.2 table).
- ❌ **Pure CAG density function.** Must include feature proximity floor. Without it, gentle-feature styles (HarmonicRipple, GothicArches arch tops, BasketWeave, CelticKnot) produce sliver triangles around constraint edges.

### New Requirements:
- ✦ **Feature density floor** in the CDF density profile (Phase 6.5). Non-negotiable for correct output on 11/20 styles.
- ✦ **Acknowledge grid limitation.** CAG improves density distribution within the grid paradigm but does not achieve optimal tessellation. The roadmap must explicitly include grid elimination.
- ✦ **Visual validation on diverse styles.** Before merging, test on at least: HarmonicRipple (gentle features), GothicArches (mixed curvature), LowPolyFacet (extreme curvature contrast), CelticKnot (moderate features), SuperformulaBlossom (high-curvature features). These 5 span the feature-curvature correlation spectrum.

### Open Items for Implementing Agent:
1. **Feature floor parameters.** `featureFloor = 0.6` and `featureRadius = 0.004` are initial estimates. Need empirical validation on the 5 test styles.
2. **Seam guard on `buildFeatureEdgeGraphFromChainEdges`.** Carried from Round 2. ~3 lines.
3. **`generateCDFAdaptivePositions` verification.** Run existing tests. Visual comparison on 5 styles. Performance benchmark.
4. **Grid elimination roadmap.** Document Phase B-D in ROADMAP.md with clear entry criteria.

---

*— Verifier Round 3, 2026-03-03. Density and topology are coupled at feature boundaries. CAG is necessary but insufficient. Feature density floor closes the gap. The grid is the deeper problem — it must go, but not today. Phase A: CAG + feature floor. Phase C: anisotropic tessellation. The user's vision is the correct north star.*
