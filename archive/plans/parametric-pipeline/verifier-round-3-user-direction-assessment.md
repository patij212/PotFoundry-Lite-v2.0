# Verifier Round 3 — Assessment of User's Architectural Direction
Date: 2026-03-04

## Context

The user rejects P3 (reduce companion density) AND the Verifier's aspect-capped alternative. Instead, the user specifies four requirements that form a coherent architectural vision for chain strip tessellation:

1. **High density around feature chains** — more than density=1, not constrained by aspect formulas
2. **Anisotropic chain strips** — not constrained by grid columns/rows
3. **Gradient density** — smooth transition from dense mesh at feature edges to base grid
4. **Grid pushed away from chain edges** — wider buffer zone between grid and chain vertices

This invalidates the Generator's P3 and the Verifier's aspect-capped alternative. Both were patches. The user wants the cure.

## Verdict: THE USER IS RIGHT — AND THE INFRASTRUCTURE EXISTS

The current companion placement is a 1D line (varying U, constant T per row). This is the root cause of aspect violations regardless of density setting. The user's vision — anisotropic, gradient, 2D companion clouds — addresses this at the right level of abstraction.

**Critical evidence**: The GPU surface evaluation infrastructure already supports arbitrary (U, T) evaluation. The `subdivideLongEdges` pass (PEC L1481-1500) calls `this.evaluatePoints(uvBatch, ...)` to compute 3D positions for vertices at non-grid positions. This means companions at non-grid T-positions are NOT a v3.0 pipe dream — they're achievable with existing GPU infrastructure.

---

## Analysis of Each Requirement

### R1: High Density Around Feature Chains — VALIDATED

The user wants MORE companions, not fewer. The aspect-capped approach reduces density to 1 per side at standard resolution. The user explicitly rejects this — feature edges should be the MOST densely tessellated region of the mesh.

**Current state**: Companions provide density in U only. At density=4, there are 8 companions per chain vertex (4 left + 4 right), all at the same T-row. These create density along the U-axis but contribute nothing to T-direction resolution.

**What the user needs**: A 2D companion cloud that provides density in BOTH U and T directions around each chain vertex. More companions is fine IF they're placed to produce well-shaped triangles, not 1D slivers.

### R2: Anisotropic Chain Strips — VALIDATED

The user says chain strips should "not be constrained by columns/rows." Currently:

- **Strip U-boundaries**: Defined by grid column indices `segStart, segEnd` (OWT L755-756)
- **Strip T-boundaries**: Defined by grid row positions `activeTPositions[j], activeTPositions[j+1]` (OWT L697-699)
- **Companion T-positions**: Locked to `activeTPositions[cv.rowIdx]` (OWT L508)

The strip is fundamentally a grid-aligned rectangle. "Anisotropic" means the strip should follow the chain's natural direction — e.g., if a chain moves diagonally in (U, T) space, the companion cloud should be elongated along that diagonal, not aligned to the grid axes.

**Feasibility**: The CDT already operates in 2D (U, T) space with normalized coordinates (CST L175-190). It can triangulate ANY point set — grid-aligned or not. The constraint is not the triangulator but the **vertex generation** (locked to grid rows) and the **3D evaluation** (needs R-values at each vertex position).

**3D evaluation**: The `evaluatePoints` GPU function (PEC L1490) accepts arbitrary (U, T) batch inputs. The subdivision pass already creates vertices at non-grid (U, T) positions and evaluates them. So companions at non-grid T-positions CAN get correct 3D positions — the infrastructure exists.

### R3: Gradient Density — PARTIALLY EXISTS

The CDF-adaptive grid (GridBuilder.ts L260-286) already has a Gaussian density floor around chain vertices:
```
contribution = featureFloor × exp(-0.5 × (du/σ)²)
```
This gives gradient column spacing: denser near chains, sparser away. But this only affects U-direction grid columns. It doesn't create gradient density in the T-direction or within the companion cloud itself.

**What the user needs**: A density gradient within the companion cloud — highest density immediately adjacent to the chain edge, tapering off toward the grid. This would create a smooth transition from the high-resolution chain band to the lower-resolution base mesh.

**Implementation**: Instead of uniform COMPANION_FRACS, use non-uniform spacing biased toward the chain vertex. E.g., for density=4: `[0.1, 0.3, 0.6, 0.9]` instead of `[0.2, 0.4, 0.6, 0.8]`. More companions near the chain, fewer near the grid column.

### R4: Grid Pushed Away From Chain Edges — EASY

Currently, `applyChainDeadZones` uses `deadZoneRadius = 0.0005` (GridBuilder.ts L290). This is ~29% of the minimum grid cell spacing (~0.00173). Grid columns can sit extremely close to chain vertices.

**The user wants a wider buffer**: Push grid columns far enough from chain edges that the companion cloud has full control of the mesh topology in the transition zone.

**Implementation**: Increase `deadZoneRadius` to approximately half the grid cell width. At standard resolution (~577 columns), typical grid spacing is ~0.00173. A dead zone radius of ~0.001 would push the nearest grid column ~0.001 away from any chain vertex, leaving room for a meaningful companion cloud.

**Risk**: A wider dead zone removes more grid columns, reducing the base mesh resolution near features. But this is exactly the tradeoff the user wants — the companion cloud replaces the grid in the feature zone.

**Calibration**: The dead zone radius should be proportional to the average grid cell width, not a fixed constant. `deadZoneRadius = gridCellWidth * fraction` where `fraction` ≈ 0.4-0.6.

---

## What the Generator Needs to Design

The converged P2 (remove filter) is unchanged. The companion placement requires a new design. Here's what the Generator should propose:

### Design Problem 1: 2D Companion Cloud Geometry

**Input**: A chain vertex at (U_cv, T_row), grid cell width W, T-spacing to adjacent rows T_above and T_below.

**Output**: A set of companion vertices forming a 2D cloud around the chain vertex, with:
- Density gradient: denser near chain vertex, sparser at cloud edge
- Aspect-aware spacing: U-spacing ≈ T-spacing (no extreme aspect ratios)
- Boundary: cloud extends to ½W in U-direction, ½T in T-direction

**Key constraint**: Companion vertices at non-grid T-positions need 3D evaluation. The GPU `evaluatePoints` function handles this, but the vertices must be batched and evaluated AFTER the companion cloud is generated.

**This changes the pipeline order**: Currently, vertices are generated → 3D positions filled in → triangulation. With 2D companions, the flow becomes: estimate companion positions (in U,T) → GPU-evaluate 3D positions → triangulate. This is how `subdivideLongEdges` already works, so the pattern exists.

### Design Problem 2: Gradient Density Distribution

**Question**: What distribution function should govern companion placement within the cloud?

Options:
- **Linear gradient**: Spacing increases linearly from chain to grid boundary. Simple, predictable.
- **Gaussian**: Matches the existing buildDensityProfile envelope. Natural falloff.
- **Exponential**: Aggressive density near chain, rapid falloff. Maximum edge definition.

The Generator should pick one and justify it with aspect ratio calculations.

### Design Problem 3: Dead Zone Calibration

**Question**: How wide should the dead zone be?

The dead zone radius determines:
- How far grid columns are pushed from chain vertices
- How much space the companion cloud has to fill
- How many grid columns are removed (affects base mesh quality)

**Constraint**: The dead zone must be wide enough for the companion cloud to produce well-shaped triangles, but narrow enough to avoid significant base mesh degradation.

**Recommendation**: `deadZoneRadius = max(gridCellWidth * 0.5, 0.001)`. This ensures at least half a cell width of clearance.

### Design Problem 4: Strip Boundary Definition

**Question**: If strips are no longer grid-aligned, how are strip boundaries defined?

Currently, strips are `[segStart, segEnd] × [row_j, row_j+1]` — defined by grid column and row indices. If the companion cloud extends in the T-direction beyond the current row band, the strip must span multiple row bands.

**This is the hardest architectural question.** The current strip-per-row-band approach assumes all strip vertices have the same two T-positions (bot and top). A 2D companion cloud breaks this assumption.

**Possible solutions**:
- **Keep strip boundaries grid-aligned**, but allow companions at non-grid T positions WITHIN the strip. CDT handles arbitrary 2D point sets, so this works — the strip just has interior vertices at T-positions between bot and top.
- **Redefine strips as chain-aligned bands** — each chain gets its own strip that spans all rows the chain traverses. This is a bigger change but produces better anisotropic triangulation.

**Recommendation**: Start with the first approach (keep grid row bands, add interior companions). This is a minimal extension of the current architecture. The second approach is the eventual goal but requires redesigning the strip iteration loop.

---

## Revised Implementation Phases

### Phase 1: Foundation (minimal changes, immediate)
1. **P2: Remove pointIdx filter** — unchanged from previous convergence
2. **Widen dead zone**: `deadZoneRadius` from 0.0005 to `gridCellWidth * 0.5`
3. **Gradient companion spacing**: Non-uniform COMPANION_FRACS biased toward chain vertex (still U-only, same row)

### Phase 2: 2D Companion Cloud (Generator must design)
4. **Interior companion vertices**: Place companions at fractional T-positions within the row band (not just at row boundaries)
5. **GPU batch evaluation**: Evaluate 3D positions for interior companions using `evaluatePoints`
6. **CDT with interior points**: Pass interior companions as free vertices to CDT (they'll naturally participate in the triangulation)

### Phase 3: Anisotropic Strips (future)
7. **Chain-aligned strip definition**: Strips follow the chain direction instead of grid axes
8. **Multi-row band strips**: Strip spans the full chain height, not just one row band at a time

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Interior companions need GPU evaluation (batch overhead) | LOW | `evaluatePoints` already handles arbitrary batches; subdivision uses it for ~10K+ new vertices |
| Wider dead zone reduces base mesh resolution | LOW | Grid density is already elevated near features via Gaussian floor; dead zone trades grid vertices for companion vertices |
| 2D companion cloud generates more vertices | MEDIUM | Budget-aware: cap total companions at `targetTris * fraction` |
| Non-grid T companions break `buildMergedRow` assumption | MEDIUM | buildMergedRow only looks up `rowChainVerts.get(rowIdx)` — interior companions should NOT appear in merged rows (they're free CDT vertices, not boundary vertices) |
| CDT with many interior points slows down | LOW | CDT is O(n log n); adding 4-8 interior companions per chain vertex per band is negligible vs. 130K current companions |

---

## Key Message to Generator

The aspect-capped approach was a patch for the real problem: companions are 1D. The user wants 2D companion clouds with gradient density, the infrastructure for GPU evaluation at arbitrary (U,T) exists, and the CDT can handle interior vertices at non-grid T positions.

Design the 2D companion cloud geometry. Start with: how many companions, at what (U, T) offsets from each chain vertex, with what density gradient? The dead zone widening and gradient U-spacing (Phase 1) can ship immediately. The 2D cloud (Phase 2) needs your design.

P2 (remove filter) is unchanged and should ship with Phase 1.
