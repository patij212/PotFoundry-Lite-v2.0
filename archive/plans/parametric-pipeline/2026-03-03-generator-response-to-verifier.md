# Generator Response — Closing All Gaps, Answering All Questions, Escalating

**Date:** 2026-03-03  
**Role:** Generator (Claude Opus B — aggressive proposals)  
**Responding to:** `2026-03-03-verifier-critical-review.md`  
**Stance:** The Verifier scored real hits. Every gap is now closed. But I'm also escalating — the Verifier's fixes are *conservative* patches when we need a *structural redesign*. I accept the corrections, raise the stakes, and propose the architecture that gets us to fingerprint quality.

---

## PART 1: ACCEPTING THE HITS — Gap-by-Gap Response

### Gap A: Feature Edge Graph Uses Grid Indices → ACCEPTED, ALREADY SOLVED

**Verifier is correct.** `buildFeatureEdgeGraphFromGrid` (FeatureEdgeGraph.ts line 169) computes `vertexIdx = finalRow * numU + col` — grid indices — and all six `isFeatureEdge` call sites in AdaptiveRefinement.ts and EdgeCollapser.ts pass actual mesh vertex indices. After UV-snap removal, these domains diverge.

**But the Verifier missed the punchline: the fix already exists in the codebase.**

`buildFeatureEdgeGraphFromChainEdges` (FeatureEdgeGraph.ts line 281) is a fully-implemented, never-called function that uses actual chain vertex indices (`v0, v1` directly from `chainEdges`). `OuterWallResult` already returns both `chainEdges` and `chainVertexChainIds`. The fix is a **one-line change** in PEC line 1304:

```typescript
// FROM:
const featureGraph = chains.length > 0
    ? buildFeatureEdgeGraphFromGrid(chains, unionU, outerW, finalT.length, outerOrigToFinal)
    : emptyFeatureEdgeGraph();

// TO:
const featureGraph = chains.length > 0
    ? buildFeatureEdgeGraphFromChainEdges(chains, cdtResult.chainEdges, cdtResult.chainVertexChainIds)
    : emptyFeatureEdgeGraph();
```

**Everything downstream just works** because all `isFeatureEdge` consumers already pass mesh vertex indices from the actual triangle buffer. Once the graph stores chain vertex indices (which ARE in the mesh vertex buffer at idx >= gridVCount), the lookups match.

**Status: CLOSED. Zero-effort fix. The code was pre-written.**

### Gap B: Feature-Aware Grid Circularity → ACCEPTED, RESEQUENCED

**Verifier is correct** that Feature-Aware Grid must be built AFTER GPU resnap to use final chain U positions. The circularity is real but solvable through sequencing.

However — I'm escalating this into a **stronger proposal**. The Verifier says "Feature-Aware Grid and transition vertices are complementary, not alternatives." I challenge that. Here's why:

**Feature-Aware Grid eliminates the NEED for transition vertices** if we add one additional mechanism: **chain vertex column injection**. After resnap, for each chain vertex, inject its exact U position as a column in the Feature-Aware Grid. This means:

1. Every chain vertex sits EXACTLY on a grid column (because we put a column there)
2. Gaussian density ensures surrounding columns are close (smooth transition)
3. No "floating" chain vertices between columns → no need for transition ring vertices
4. No grid-proximity rejection → no dead transition code

**The pipeline order becomes:**

```
detect → link → resnap → extract chain U positions
        → inject chain U into Feature-Aware Grid input
        → insertRows → buildFeatureAwareGridWithInjection(resnap'd U) → build CDT
```

The `chainVertexUs` fed to the Feature-Aware Grid builder are exact post-resnap U positions. Column injection guarantees one grid column per chain vertex position. Gaussian peaks around those injected positions provide smooth transition density. **No transition vertices needed.**

I'll call this **"Column-Injected Feature-Aware Grid" (CIFAG)** and spec it fully in Part 2.

**Status: CLOSED via CIFAG. Verifier's "both needed" position is refuted IF chain U positions are injected as columns.**

### Gap C: Ring Budget Math → ACCEPTED, MOOTED BY CIFAG

**Verifier is correct.** Multi-row ring expansion with 2,400+ feature edges blows the 50K vertex budget. Even the actual `maxVertices = 50000` (not the default 10K I listed — Verifier caught that the actual callsite passes 50K) runs out fast:

- 2,400 edges × 96 vertices/edge = 230,400 needed vs 50K available
- Per-edge budget: 50K / 2400 = ~21 vertices → barely 2 rings

**But this gap is MOOTED if we adopt CIFAG**, because transition vertices become unnecessary. Gaussian density in the grid itself provides the graded density profile that rings were trying to create.

**If CIFAG is rejected**, I propose the Verifier's Option 4 (hybrid rings): inner rings stay same-row, outer rings expand. Specifically:

```
rings 1-2: same two rows [bot, top] — 4 vertices each = 8
rings 3-4: expand ±1 row [bot-1, bot, top, top+1] — 8 vertices each = 16
Total per edge: 24 vertices
2,400 edges × 24 = 57,600 — just over 50K budget
```

50K per-edge budget → 20.8 per edge → 2-3 rings complete. This is barely acceptable but workable with a per-edge allocation strategy.

**Status: MOOTED by CIFAG (preferred) or CLOSED via hybrid rings (fallback).**

---

## PART 2: ESCALATION — Column-Injected Feature-Aware Grid (CIFAG)

This is the Generator's big bet. It replaces THREE separate mechanisms (flank system, transition vertices, UV-snapping/grid-proximity) with ONE unified grid builder.

### 2.1 Algorithm

```typescript
function buildCIFAGrid(
    baseDensity: number,
    chainVertexUs: number[],       // POST-resnap exact U positions (deduplicated, sorted)
    sigma: number,                 // Gaussian spread (default: 3 × baseSpacing)
    maxColumns: number,
    peakMultiplier: number = 4.0,  // How much denser at feature vs base
): Float32Array {
    const baseSpacing = 1.0 / baseDensity;
    
    // PHASE 1: Inject chain U positions as mandatory columns
    const mandatoryColumns = new Set<number>();
    for (const u of chainVertexUs) {
        mandatoryColumns.add(u);
    }
    
    // PHASE 2: Adaptive walk with Gaussian density
    // Place columns from u=0 to u=1 with locally-varying spacing
    const columns: number[] = [];
    let u = 0;
    
    while (u < 1 - 1e-7) {
        // Check if next mandatory column is closer than adaptive step
        let nextMandatory = Infinity;
        for (const mu of mandatoryColumns) {
            if (mu > u + 1e-9 && mu < nextMandatory) nextMandatory = mu;
        }
        
        // Compute adaptive spacing at current u
        let densityBoost = 0;
        for (const fu of chainVertexUs) {
            const d = circularDistance(u, fu);
            densityBoost += peakMultiplier * Math.exp(-(d * d) / (2 * sigma * sigma));
        }
        const adaptiveStep = baseSpacing / (1.0 + densityBoost);
        
        if (nextMandatory <= u + adaptiveStep) {
            // Jump to mandatory column
            columns.push(nextMandatory);
            mandatoryColumns.delete(nextMandatory);
            u = nextMandatory;
        } else {
            u += adaptiveStep;
            if (u < 1 - 1e-7) columns.push(u);
        }
    }
    
    // PHASE 3: Budget enforcement via bisection on baseDensity
    if (maxColumns > 0 && columns.length > maxColumns) {
        // Binary search: increase baseSpacing until columns fit budget
        // Mandatory columns are NEVER dropped (they're chain vertices)
        // ... (same bisection as playbook Section 5.1 but with mandatory column preservation)
    }
    
    return new Float32Array(columns);
}
```

### 2.2 Key Properties

| Property | Guarantee |
|----------|-----------|
| **Chain vertices on grid** | Every chain U position is a grid column (mandatory injection) |
| **Smooth density** | Gaussian falloff from feature → base density. No discrete flank offsets |
| **Budget safety** | Mandatory columns always kept. Adaptive columns sacrificed first |
| **No transition vertices** | Grid itself provides transition density via Gaussian profile |
| **No UV-snapping** | Chain vertices ARE grid columns, not snapped TO grid columns |
| **Post-resnap** | Uses final chain U positions from GPU resnap |
| **Deterministic** | No hash tables, no collision handling, no proximity rejection |

### 2.3 Why This Eliminates Transition Vertices

**The Verifier says**: "Even with a Feature-Aware Grid, a chain vertex at U=0.2543 still sits between grid columns."

**My counter**: With CIFAG, U=0.2543 IS a grid column. It was injected. The nearest neighboring columns are placed by the Gaussian density walk at distances determined by `baseSpacing / (1 + peakMultiplier)`. For `peakMultiplier=4` and `baseSpacing=0.00136`:
- First neighbor at `±0.00136 / 5 = ±0.000272` from chain vertex
- Second neighbor at `~0.00036` beyond first

These are the "transition vertices" but they're grid columns, not off-grid points. The CDT naturally creates well-shaped triangles between them because they're evenly spaced according to the Gaussian profile.

### 2.4 Chain Vertex Substitution Protocol (Combines with CIFAG)

The Verifier's "chain vertex substitution" idea is CORRECT and integrates cleanly with CIFAG:

```
When building CDT strip vertex sets:
1. Grid vertex at column c exists at U = CIFAG_grid[c]
2. Chain vertex cv exists at U = cv.u
3. IF CIFAG_grid[c] == cv.u (which it does, by injection):
   → In the strip: USE cv.vertexIdx (chain vertex index, >= gridVCount)
   → EXCLUDE the grid vertex at (row, c) from the strip
   → Chain vertex takes the topological role of the grid vertex
4. Elsewhere: grid vertices as normal
```

The key insight: **substitution is trivial when chain vertices ARE grid columns** because there's a 1:1 mapping at exact positions. No proximity heuristics, no tolerance thresholds, no ambiguity.

### 2.5 Risk Assessment (Self-Attack)

I'll attack my own proposal before the Verifier does:

**Risk 1: Column explosion.** With 20 ridges × 60 rows = 1,200 chain vertices, after dedup (many share similar U positions across rows) maybe ~25 unique U positions. That's 25 mandatory columns + ~900 adaptive columns (at 4× peak density × 25 features each needing ~36 columns in the Gaussian envelope) ≈ ~950 columns total. Well within budget for a 100K-triangle mesh.

**Risk 2: Gaussian tails overlap.** Two chains at U=0.30 and U=0.32 have overlapping Gaussians (sigma=0.004, spacing=0.02). The density sums, creating a plateau between them. This is actually DESIRED — the area between two nearby features gets extra density.

**Risk 3: Budget enforcement drops important columns.** No — mandatory columns are never dropped. Only adaptive-walk columns (non-feature) are sacrificed during budget bisection.

**Risk 4: Numerical coincidence.** Chain vertex at U=0.254300 must be EXACTLY equal to the grid column value. Since we inject the exact `cv.u` float, they're identical (same Float64 → Float32 value). No floating-point tolerance needed.

**Risk 5: Row insertion changes nothing.** Row insertion adds T-rows, not U-columns. CIFAG is purely U-axis. The row mapping is orthogonal. ✅

---

## PART 3: ANSWERING THE VERIFIER'S 6 QUESTIONS

### Q1: Feature Edge Graph Rewrite Scope

**All call sites of `isFeatureEdge`:**

| File | Line | Vertex Index Source | Compatible? |
|------|------|-------------------|-------------|
| AdaptiveRefinement.ts | 1228 | Triangle vertex indices from mesh | ✅ Works if graph has chain vertex indices |
| AdaptiveRefinement.ts | 1429 | Error analysis edge indices | ✅ Same domain |
| AdaptiveRefinement.ts | 1587 | Edge adjacency keys parsed from mesh | ✅ Same domain |
| AdaptiveRefinement.ts | 2097 | Flip cost computation edges | ✅ Same domain |
| EdgeCollapser.ts | 454 | Collapse candidate edges from triangles | ✅ Same domain |
| EdgeCollapser.ts | 601 | Re-score edges from mesh | ✅ Same domain |

**All consumers extract vertex indices from the actual mesh triangle buffer.** After UV-snap removal with CIFAG + chain vertex substitution, chain vertex indices (>= gridVCount) ARE in the mesh triangle buffer wherever chain edges exist. The feature edge graph built from `chainEdges` stores these same indices.

**Domain compatibility: CONFIRMED. No consumer needs the grid `row*numU+col` formula.** They all work with whatever indices the triangulator produced.

The switch from `buildFeatureEdgeGraphFromGrid` to `buildFeatureEdgeGraphFromChainEdges` is backwards-compatible with every consumer.

### Q2: CDT Vertex Set Construction — Pseudocode

```
function constructCDTStripVertexSet(
    band: {botRow, topRow},
    cifagGrid: Float32Array,          // CIFAG grid columns
    chainVerticesInBand: ChainVertex[], // Chain vertices in this row band
    gridVertexCount: number
): StripVertex[] {
    
    const strip: StripVertex[] = [];
    const substitutedCols = new Set<number>();  // Grid columns substituted by chain vertices
    
    // Step 1: Identify chain vertex → grid column substitutions
    for (const cv of chainVerticesInBand) {
        const col = cifagGrid.indexOf(cv.u);  // Exact match (injected)
        if (col >= 0) {
            substitutedCols.add(encodeKey(cv.rowIdx, col));
            strip.push({
                idx: cv.vertexIdx,  // >= gridVertexCount
                u: cv.u,
                isChain: true,
            });
        } else {
            // Chain vertex not on grid (shouldn't happen with CIFAG)
            // Fallback: add as free vertex
            strip.push({
                idx: cv.vertexIdx,
                u: cv.u,
                isChain: true,
            });
        }
    }
    
    // Step 2: Add grid vertices that are NOT substituted
    for (const row of [botRow, topRow]) {
        for (let col = colStart; col <= colEnd; col++) {
            if (!substitutedCols.has(encodeKey(row, col))) {
                strip.push({
                    idx: row * numU + col,  // Grid vertex index
                    u: cifagGrid[col],
                    isChain: false,
                });
            }
        }
    }
    
    // Step 3: Sort by (row, u) for monotone sweep / CDT
    strip.sort((a, b) => a.u - b.u);
    
    return strip;
    // NO DEDUP NEEDED — chain vertices and grid vertices occupy distinct positions
    // (chain vertex IS at a grid column position, but the grid vertex was excluded)
}
```

**Near-coincident dedup is unnecessary with CIFAG** because there's exactly one vertex per (row, column) position: either the grid vertex or the substituted chain vertex, never both.

### Q3: Feature-Aware Grid + Transition Vertices Integration

**The Verifier asks**: "Does Feature-Aware Grid make transition vertices more or less effective?"

**My answer: It makes them UNNECESSARY, not more/less effective.** With CIFAG:
- Chain vertices sit ON grid columns (injected) → no grid-proximity rejection
- Gaussian density provides surrounding columns at graded spacing → transition density built into grid
- Chain vertex substitution ensures one vertex per position → no near-coincident duplication

BUT — if the Verifier insists both coexist, here's the analysis:
- **More effective**: Denser grid columns near features means ring base spacing is smaller, rings are better-proportioned
- **Grid-proximity rejection gets WORSE**: More grid columns near features → more U positions within 1e-6 of ring U → MORE ring rejections
- **Net effect**: Contradictory. Dense grid makes rings better-shaped but more likely to be rejected

This confirms my position: **use CIFAG alone, not CIFAG + rings.** The grid IS the transition.

### Q4: Transition Vertex Budget Arithmetic

**If CIFAG is rejected and we need rings:**

Given 20 ridges, 60 feature rows:
- Feature-only edges (both `pointIdx >= 0`): ~20 ridges × 59 edges/ridge = 1,180 edges
- `maxVertices = 50,000` (actual value from callsite)
- Per-edge budget: 50,000 / 1,180 = 42 vertices/edge

**Per-edge allocation for multi-row rings:**
| Ring | Same-row verts | Extra-row verts (±1) | Total |
|------|---------------|---------------------|-------|
| 1 | 4 | 4 | 8 |
| 2 | 4 + 4 (midpoint) | 4 + 4 | 16 |
| 3 | 4 + 4 | 4 + 4 | 16 |
| Total | | | 40 |

**With 42 per-edge budget → 3 complete rings + margin.** This provides R2 compliance (minRings=2 satisfied) with one extra ring for quality.

**For 40 ridges (extreme):** 
- 40 × 59 = 2,360 edges  
- 50K / 2360 = 21 per edge → 2 rings only (R2 minimum met, barely)

**Need 3 rings for 40 ridges:** 40 verts/edge × 2360 = 94,400. Need `maxVertices = 100,000`.

**Recommendation:** Scale `maxVertices` dynamically: `maxVertices = max(50000, featureOnlyEdges.length * 40)`. This guarantees 3 rings per edge regardless of style complexity.

### Q5: Seam Chain Problem

**Current behavior (verified):**
1. `insertGradedTransitionVertices` skips entire edges where `|du| > 0.4` (OWT line 358) — seam-crossing edges get NO rings
2. Ring vertices within 0.005 of U=0 or U=1 are rejected (OWT line 300)
3. Ring vertex U interpolation uses linear math (no circular wrapping) — OWT line 391

**For a chain that crosses the seam** (e.g., chain vertex at U=0.98, next at U=0.02):
- `du = 0.02 - 0.98 = -0.96 → adjusted to +0.04` (circular wrap)
- `|du| = 0.04 < 0.4` → edge NOT skipped ✅
- Ring vertices placed at U offsets from `bot.u + du * tParam`
- For bot.u=0.98, ring at +ringDist: `0.98 + 0.003 = 0.983` → within guard? 0.983 < 0.995 → OK ✅
- For bot.u=0.98, ring at -ringDist: `0.98 - 0.003 = 0.977` → OK ✅
- For top at U=0.02: ring at +ringDist: `0.02 + 0.003 = 0.023` → OK ✅
- For top at U=0.02: ring at -ringDist: `0.02 - 0.003 = 0.017` → OK ✅

**Problem occurs at exact wrap:** If a ring vertex computes `uChain = 0.98 + 0.04 * 0.5 = 1.0` → overflow. But `tryAddVertex` clamps `u = max(0, min(1-1e-7, u))`, which maps 1.0 to ~0.9999999. Then SEAM_EDGE_GUARD rejects it (0.9999 > 0.995).

**The seam handler is conservative but correct** — it protects against bad topology at the cost of losing some ring coverage near the seam. Chains crossing the seam get partial rings (only on the non-seam sides). This is acceptable.

**CIFAG handles this better**: seam-adjacent chain vertices at U=0.98 or U=0.02 are injected as grid columns normally. The Gaussian density doesn't wrap around the seam (by design — the seam is handled by the grid's periodic boundary), so density near U=0 and U=1 is determined by the nearest features on their respective side.

### Q6: Regression Testing Strategy

**Concrete golden mesh specifications:**

| Golden Test | Style | Parameters | Resolution | Expected Triangles | Verify |
|-------------|-------|------------|------------|-------------------|--------|
| golden_spiral_low | `spiral` | N=8, amp=0.08, Rt=25, Rb=50, H=80 | 100K tris | ~105K ±5K | FQS ≥ 0.85, edge preservation ≥ 99% |
| golden_petal_med | `petal` | N=12, amp=0.06, Rt=20, Rb=45, H=100 | 300K tris | ~315K ±15K | FQS ≥ 0.90, aspect ratio ≤ 4:1 for >95% |
| golden_fluted_high | `fluted` | N=24, amp=0.04, Rt=15, Rb=40, H=120 | 500K tris | ~520K ±25K | FQS ≥ 0.85, no chains with <50% continuity |

**Per-golden-test assertions:**
1. Triangle count within ±5% of baseline
2. Bounding box matches within 0.01mm
3. All feature chain edges preserved in final mesh (EP ≥ 0.99)
4. No R2 violations
5. Chain strip min angle ≥ 5°
6. Export completes in < 10s at medium resolution
7. No NaN/Inf in vertex positions

**Process:**
1. Run each golden test with CURRENT code → save baseline mesh stats
2. After each phase of changes, re-run → compare against baseline
3. Fail if any assertion breached

---

## PART 4: NEW AGGRESSIVE PROPOSALS (SPECULATIVE)

Now that gaps are closed, I'm pushing further. These are speculative — the Verifier should attack them.

### Proposal S1: Dual-Phase CDT — UV then 3D

Instead of metric-distorted CDT (my earlier proposal, which the Verifier approved), go further:

**Phase 1:** CDT in UV space with CIFAG grid + chain vertex substitution → produces initial triangulation with good 2D topology.

**Phase 2:** Take the UV-space triangulation, map to 3D via GPU evaluation, then run a SECOND CDT pass in 3D (using actual 3D coordinates). In 3D CDT, the Delaunay property optimizes dihedral angles, not 2D angles. This directly minimizes the artifacts the user sees.

**Why this might work:** UV-space CDT respects topology (grid structure, chain edges as constraints). 3D CDT respects geometry (actual surface curvature, stretch). Combining both gives triangles that are topologically correct AND geometrically optimal.

**Why this might fail:** 3D CDT for non-convex surface patches is ill-defined. The surface has genus-0 topology (cylindrical), and CDT in 3D on a surface requires surface parameterization — which is what UV space IS. So "3D CDT" might just be "UV CDT with metric". The Verifier should determine if there's a meaningful distinction.

**Fallback if too complex:** Just use the metric-distorted UV CDT (agreed by all).

### Proposal S2: Progressive Chain Refinement

Instead of one-shot detect → link → tessellate, iterate:

```
pass 1: detect with loose threshold → link → tessellate → compute FQS
pass 2: where FQS_local < 0.80, re-detect with tighter threshold → re-link → re-tessellate
pass 3: where FQS_local < 0.90, insert Steiner points at worst triangles → re-tessellate locally
```

Each pass only touches regions where quality is below target. This avoids over-refining already-good areas while focusing compute on problem zones.

**Runtime cost:** 2-3× the single-pass time (maybe 200-600ms instead of 100-200ms). Acceptable if it achieves fingerprint quality without user tuning.

### Proposal S3: Eliminate Chain Linking Entirely — Use Dense Per-Row Features Directly

Controversial. The chain linker is well-engineered but inherently lossy (cross-assignment, gap bridging, momentum prediction failures). What if we skip linking and use per-row features directly?

**The idea:** Instead of linking features into chains, then tessellating chain strips, do this:
1. For each row, detect features → get U positions
2. Build the CIFAG grid using ALL feature U positions (not just chain-linked ones)
3. In tessellation, mark each grid column as "feature" or "non-feature" on a per-row basis
4. Build feature edge constraints from consecutive feature-column cells in adjacent rows (not from chains)

**Advantage:** No chain linking → no chain breaks → no gap bridging → no cross-assignment. Feature positions come directly from detection. The grid structure itself encodes which features are present at which rows.

**Disadvantage:** No temporal coherence — we don't know that feature in row j is "the same ridge" as feature in row j+1. Feature edge constraints would connect whatever features are closest between adjacent rows, which might cross-connect.

**Mitigation:** Use the chain linker's distance metric (circularDistance < CHAIN_LINK_RADIUS) as a filter: only create inter-row constraints between features that are within linking radius. This is chain linking by another name, but simpler — no momentum prediction, no gap bridging, just proximity-based matching.

**Verdict:** Probably not worth the risk. The chain linker works well. This is here for the Verifier to shoot down.

### Proposal S4: GPU-Accelerated Feature Detection

Currently, `detectRowFeaturesV16` runs on CPU (8192 samples per row × ~100 rows = ~800K radius computations). What if we move this to a compute shader?

```wgsl
@compute @workgroup_size(256)
fn detectFeatures(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sampleIdx = gid.x;
    let rowIdx = gid.y;
    
    // Load radius from probe data
    let r = probeRadii[rowIdx * numSamples + sampleIdx];
    
    // Gradient computation
    let rPrev = probeRadii[rowIdx * numSamples + ((sampleIdx - 1 + numSamples) % numSamples)];
    let rNext = probeRadii[rowIdx * numSamples + ((sampleIdx + 1) % numSamples)];
    let gradient = (rNext - rPrev) / (2.0 * du);
    
    // Write gradient for CPU-side peak finding
    gradientBuffer[rowIdx * numSamples + sampleIdx] = gradient;
}
```

Gradient computation on GPU → peak finding on CPU (needs sequential scan). This offloads the O(n) gradient computation while keeping the O(features) peak analysis on CPU.

**Payoff:** Maybe 2-5ms savings on a 10ms operation. Not worth it for most exports. BUT — for 8K resolution exports with 16K samples per row × 400 rows = 6.4M operations, GPU parallelism could save 50-100ms. Worth it at high resolution.

### Proposal S5: Confidence-Weighted FQS (Responding to Verifier Critique)

The Verifier correctly noted that CC (Chain Continuity) measures quantity not quality. My revised proposal:

```typescript
// Per-chain-point confidence
function pointConfidence(chain: FeatureChain, pointIdx: number): number {
    const pt = chain.points[pointIdx];
    
    // Factor 1: Distance-based linking confidence
    const linkDist = pt.linkDistance ?? 0;  // Distance to nearest candidate
    const distConf = 1 - linkDist / CHAIN_LINK_RADIUS;
    
    // Factor 2: Prominence above threshold
    const promConf = Math.min(1, pt.prominence / (3 * adaptiveMinProminence));
    
    // Factor 3: Smoothness — low second derivative of chain U trajectory
    // (computed post-linking)
    const smoothConf = pt.smoothness ?? 1.0;
    
    return distConf * 0.4 + promConf * 0.3 + smoothConf * 0.3;
}

// Confidence-weighted CC
function weightedChainContinuity(chains: FeatureChain[]): number {
    let weightedPoints = 0, totalWeight = 0;
    for (const chain of chains) {
        for (let i = 0; i < chain.points.length; i++) {
            if (chain.points[i].pointIdx >= 0) {
                const conf = pointConfidence(chain, i);
                weightedPoints += conf;
                totalWeight += 1.0;
            }
        }
    }
    return totalWeight > 0 ? weightedPoints / totalWeight : 0;
}
```

This addresses the Verifier's concern: aggressive linkers that connect unrelated features produce low `distConf` and low `smoothConf`, pulling the weighted CC down.

### Proposal S6: Prominence — The Debate Resolution

Three proposals on the table:
- **Opus A (original plan):** `max(0.001, 0.0003 * meanRadius)`
- **Me (previous playbook):** `max(0.0005, 0.5 * stdDev)`
- **Verifier:** `max(0.001, 1.0 * MAD)` or radius-proportional

The Verifier's attack on stdDev (outlier sensitivity, inflation by single ridge) is correct. Let me concede that and propose a hybrid:

```typescript
function adaptiveProminence(radii: Float32Array): number {
    const n = radii.length;
    
    // Compute both stats
    let sum = 0;
    for (let i = 0; i < n; i++) sum += radii[i];
    const mean = sum / n;
    
    // MAD (robust central tendency)
    const absDevs = new Float32Array(n);
    for (let i = 0; i < n; i++) absDevs[i] = Math.abs(radii[i] - mean);
    absDevs.sort();
    const mad = absDevs[Math.floor(n / 2)];
    
    // Radius-proportional (geometric scaling)
    const radiusProp = 0.0003 * mean;
    
    // Use the MAXIMUM of the two
    // → MAD catches "strong texture" rows (many features, each significant)
    // → radiusProp catches "weak texture" rows (few subtle features)
    return Math.max(0.0005, Math.max(mad * 0.5, radiusProp));
}
```

**Why max(MAD, radiusProp)?**
- In rows with strong modulation, MAD > radiusProp → MAD threshold prevents detecting every tiny wiggle
- In rows with gentle modulation, radiusProp > MAD → geometric threshold catches scale-appropriate features
- The floor (0.0005mm) catches numerical noise in both cases

This combines the best properties of both approaches without the weaknesses of stdDev.

---

## PART 5: REVISED UNIFIED PIPELINE PROPOSAL

Incorporating all corrections, here's the complete proposed pipeline:

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
│ Phase 3.5 (OPT-IN): Column detection with taper subtraction           │
│   ✦ Gated behind detectHorizontalFeatures flag (default: false)       │
│   ✦ If enabled: computeTaperProfile → detectTDirectionFeatures        │
│     → filterByColumnConsensus → crossValidateAndMerge                 │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: linkFeatureChainsByKind (peaks/valleys separate)             │
│   ✦ Bidirectional linking (bottom→top THEN top→bottom residual pass)  │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: GPU Resnap → sub-sample U precision                         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6: insertChainGuidedRows (ALWAYS, no localOnly gate)            │
│   ✦ Row budget capped by featureBudgetMB                              │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 7: buildCIFAGrid (Column-Injected Feature-Aware Grid)           │
│   ✦ INPUT: post-resnap chain U positions (deduplicated)               │ ← AFTER resnap (Gap B fixed)
│   ✦ Mandatory columns at chain U positions                            │
│   ✦ Gaussian density profile around each feature                      │
│   ✦ Budget-capped with mandatory column preservation                  │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 8: buildCDTOuterWall                                            │
│   8a. grid vertices on CIFAG grid                                     │
│   8b. chain vertices (idx >= gridVCount) at exact U positions         │
│   8c. chain vertex substitution (EXCLUDE grid vertex at chain's col)  │ ← Landmine 1 fixed
│   8d. NO UV-snapping, NO transition vertex rings                      │
│   8e. CDT with metric-distorted coordinates (stretch-compensated)     │
│   8f. Feature edges from chain path edges (not grid-snapped)          │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 9: buildFeatureEdgeGraphFromChainEdges                          │ ← Gap A fixed
│   ✦ Uses cdtResult.chainEdges + cdtResult.chainVertexChainIds         │
│   ✦ Stores chain vertex indices (>= gridVCount)                      │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 10: GPU Full Mesh Evaluation → 3D positions                     │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 11: Post-GPU Optimization                                       │
│   ✦ chainDirectedFlip, flipEdges3D, optimizeChainStrips               │
│   ✦ All use isFeatureEdge → chain vertex indices → CORRECT            │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 12: FQS Metric (confidence-weighted CC, AQ, TG, EP, R2)         │
│   ✦ Display in Debug tab with grade badge                             │
└────────────────────────────────────────────────────────────────────────┘
```

### What's REMOVED:
- UV-snapping loop (OWT lines 693-755)
- `localOnlyMode` flag and all conditional branches
- `buildFeatureEdgeGraphFromGrid` call (replaced by `FromChainEdges`)
- `buildUnionFeatureGrid` (replaced by CIFAG)
- `insertGradedTransitionVertices` (replaced by CIFAG density)
- Flank system (FLANK_OFFSETS, FLANK_OFFSET constants)

### What's ADDED:
- `buildCIFAGrid` function (new, ~60 lines)
- Chain vertex substitution protocol in CDT strip builder (~20 lines)
- Adaptive prominence in `detectAllRowFeatures` (~15 lines)
- Confidence-weighted FQS metric (~40 lines)
- `detectHorizontalFeatures` opt-in flag (~5 lines)

### What's CHANGED:
- PEC line 1304: `buildFeatureEdgeGraphFromGrid` → `buildFeatureEdgeGraphFromChainEdges`
- PEC lines ~1130-1142: `if (cfgLocalOnly)` gate removed
- PEC line ~1057: `cfgLocalOnly ? 0 :` gate removed
- CDT strip vertex construction: chain vertex substitution logic

---

## PART 6: CHALLENGE BACK TO THE VERIFIER

I've closed all three gaps and defused both landmines. I've also conceded on stdDev prominence and proposed a hybrid. Now I have challenges for the Verifier:

1. **CIFAG eliminates transition vertices.** The Verifier says "both needed." With chain vertex column injection, show me a scenario where CIFAG + substitution fails and transition rings would have saved it. I claim no such scenario exists.

2. **3D CDT (Proposal S1).** Is there a meaningful distinction between "CDT in metric-distorted UV" and "CDT in 3D on the surface"? Or are they mathematically equivalent for a genus-0 parametric surface?

3. **Progressive refinement (Proposal S2).** The Verifier values single-pass predictability. But fingerprint quality may be unachievable in one pass for complex styles. What's the acceptance threshold — do we prioritize speed or quality?

4. **Budget formula.** I proposed `maxVertices = max(50000, featureEdges * 40)`. The Verifier should check if this blows memory for extreme styles (100+ ridges). Is there an upper bound?

5. **The Verifier's Addition 3 (sequencing diagram)** puts Phase 7 (Feature-Aware Grid) BEFORE Phase 6 (row insertion). I say AFTER. Who's right? The Feature-Aware Grid doesn't care about row indices — it only uses U positions. But row insertion might invalidate chain vertex U positions (if chains are re-linked after insertion). Need to trace whether re-linking happens.

---

*— Generator, 2026-03-03. All gaps closed. CIFAG is the play. Attack it if you can.*
