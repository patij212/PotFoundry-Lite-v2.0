# Generator Round 24.1 — Independent CDT Normalization: Eliminating Band-Geometry Slivers

Date: 2026-03-06

## Problem Statement

R24 (PROMO_EPSILON=0) slashed max aspect ratio from 2.4M to 3,350 by eliminating the UV/3D height mismatch. But violations(>4:1) only dropped from 55.6% to 50.4%. The remaining 50% are **not** from PROMO mismatch — they are caused by the CDT normalization itself squishing one axis, making the Delaunay criterion produce triangles that look fine in CDT space but are slivers in 3D.

## Root Cause Analysis

### The Squished Domain

In [ChainStripTriangulator.ts](src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L160-L176), the current normalization at **line 168**:

```typescript
const scale = Math.max(uRange, tRange);
```

With typical values `uRange ≈ 0.013` (strip of ~8 grid cells) and `tRange ≈ 0.0023` (inter-row height):
- `scale = uRange = 0.013` (since uRange > tRange)
- U coordinates span [0, 1.0] in CDT space
- T coordinates span [0, **0.177**] in CDT space (≈ 5.65× squished)

The CDT sees a **5.65:1 elongated rectangle**. Its Delaunay criterion — which maximizes the minimum angle in its OWN coordinate system — creates wide horizontal triangles spanning multiple grid cells, because those look fine in the squished domain.

### Traced Sliver Example

**Strip context**: chain at u=0.496, expansion=4, uStripLeft=0.490, uStripRight=0.503, uRange=0.013.  
**Band**: tBot=0.500, tTop=0.5023, tRange=0.0023.

**Current (uniform, scale=0.013)**:
| Vertex | CDT U | CDT T | Physical width | Physical height |
|--------|-------|-------|----------------|-----------------|
| Chain C | 0.462 | 0.000 | — | — |
| Grid G_right | 0.846 | 0.000 | — | — |
| Companion P | 0.462 | 0.044 | — | — |

CDT creates triangle C→G_right→P: base=0.384, height=0.044 → CDT aspect ≈ 1.5:1 → **APPROVED**.  
3D: width=0.384×0.013×R ≈ 1.57mm, height=0.044×0.013×H ≈ 0.058mm → 3D aspect ≈ **7.8:1** → SLIVER.

**Proposed (independent, uScale=uRange, tScale=tRange)**:
| Vertex | CDT U | CDT T |
|--------|-------|-------|
| Chain C | 0.462 | 0.000 |
| Grid G_right | 0.846 | 0.000 |
| Companion P | 0.462 | **0.250** |

Now the companion is at 25% of the T-axis, not 4.4%. The Delaunay criterion prefers connecting C to the nearest companion ABOVE (vertical edge) rather than sweeping across to G_right. It creates C→P→G_nearest: base≈0.08, height=0.25 → CDT aspect ≈ 1.0:1. 3D: width=0.32mm, height=0.058mm → 3D aspect ≈ **1.6:1** → GOOD.

### Why This Works Mathematically

The Delaunay criterion maximizes the minimum angle of the triangulation. In a 5.65:1 elongated domain, the criterion has no penalty for creating triangles that span the full width but barely any height — those triangles have reasonable angles in the squished domain. By normalizing each axis independently to [0,1], the CDT sees a square domain where horizontal slivers have terrible angles and are rejected in favor of balanced triangulations.

The physical strip has aspect ratio ≈ `(uRange × R) / (tRange × H)` ≈ `(0.013 × 50) / (0.0023 × 100)` ≈ **2.8:1**. Independent normalization (1:1) is far closer to 2.8:1 than uniform normalization (5.65:1). The CDT connectivity choices better approximate what an ideal physical-space triangulation would produce.

## Proposals

### Proposal 1: Independent Per-Axis Normalization (Targeted, Single-Line Change)

**Idea**: Replace the uniform `scale` with per-axis divisors in `addVertex`.

**Mechanism**: Change line 176 from:
```typescript
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```
to:
```typescript
points.push([(u - uMin) / uRange, (t - tBase) / tRange]);
```
and delete line 168 (`const scale = Math.max(uRange, tRange);`).

**Files affected**: [ChainStripTriangulator.ts](src/renderers/webgpu/parametric/ChainStripTriangulator.ts) only.

**The exact code change** (full context):

```typescript
// ─── BEFORE (lines 160-176) ───
    // Normalize U and T using a uniform scale to preserve aspect ratio.
    // Independent normalization distorts triangle shapes when the band is
    // much wider than tall (or vice versa), causing CDT to produce poor angles.
    const uMin = Math.min(bot[0].u, top[0].u);
    const uMax = Math.max(bot[bot.length - 1].u, top[top.length - 1].u);
    const uRange = Math.max(uMax - uMin, 1e-12);
    const tRange = Math.max(Math.abs(tTop - tBot), 1e-12);
    const tBase = Math.min(tBot, tTop);
    const scale = Math.max(uRange, tRange);

    const addVertex = (idx: number, u: number, t: number): number => {
        const existing = globalToLocal.get(idx);
        if (existing !== undefined) return existing;
        const local = points.length;
        globalToLocal.set(idx, local);
        localToGlobal.push(idx);
        points.push([(u - uMin) / scale, (t - tBase) / scale]);
        return local;
    };

// ─── AFTER ───
    // R24.1: Independent per-axis normalization — each axis spans [0,1].
    // The band is naturally much wider than tall (uRange ≈ 5.7× tRange).
    // Uniform normalization (scale = max(uRange, tRange)) squishes T to ~0.18,
    // making the CDT create wide horizontal triangles that are slivers in 3D.
    // Independent normalization makes the CDT see a square domain, producing
    // balanced triangulations with well-shaped triangles in 3D.
    const uMin = Math.min(bot[0].u, top[0].u);
    const uMax = Math.max(bot[bot.length - 1].u, top[top.length - 1].u);
    const uRange = Math.max(uMax - uMin, 1e-12);
    const tRange = Math.max(Math.abs(tTop - tBot), 1e-12);
    const tBase = Math.min(tBot, tTop);

    const addVertex = (idx: number, u: number, t: number): number => {
        const existing = globalToLocal.get(idx);
        if (existing !== undefined) return existing;
        const local = points.length;
        globalToLocal.set(idx, local);
        localToGlobal.push(idx);
        points.push([(u - uMin) / uRange, (t - tBase) / tRange]);
        return local;
    };
```

**Mathematical basis**: Delaunay triangulation maximizes the minimum angle in its input coordinate system. A 5.65:1 elongation systematically biases the criterion toward horizontal edges. By presenting a 1:1 domain, the criterion balances both directions equally, producing connectivity that better represents 3D triangle quality.

**Trade-offs**:
- (+) Massive reduction in violations. CDT now penalizes the horizontal slivers it was previously blind to.
- (+) Zero risk to constraint enforcement (index-based).
- (+) Zero risk to crossing detection (OuterWallTessellator uses vertex buffer, not CDT coords).
- (+) Centroid filter bounds are **already correct** (see analysis below).
- (−) UV quality metrics (`minAngleUV`, `maxAspectUV`) change meaning. They now represent quality in the 1:1 domain rather than the physical-aspect domain. For monitoring, 3D metrics are what matters anyway.
- (−) For strips where `tRange > uRange` (taller than wide), the old code was correct (scale=tRange, U gets squished). These are rare in practice: with expansion=4, a strip covers ~8 grid cells in U, while tRange is always 1 inter-row gap.

**Assumptions** (for Verifier to attack):
1. `uRange >> tRange` for the vast majority of chain strips (true when expansion ≥ 2 and row count ≥ 64).
2. The rare case where `tRange > uRange` (very narrow strips) does not produce worse triangles than before — the squishing now goes the other direction but the strip is so narrow that there are few triangle choices anyway.
3. The `1e-12` clamp on uRange and tRange prevents coordinate explosion even for degenerate strips.
4. cdt2d handles the rescaled coordinates correctly (no internal epsilon issues with the 1:1 domain vs the 5.65:1 domain).
5. In-3D quality improvement is monotonic — better CDT-space triangles → better 3D-space triangles — because the 1:1 CDT domain is closer to the physical aspect ratio than the 5.65:1 domain was.

## Impact Analysis on All Downstream Consumers

### 1. `points[]` coordinate consumers

**`addVertex` (line 176)** — the ONLY place `scale` is referenced. ✅ Changed.

### 2. Centroid filter (lines 281-289)

```typescript
const uBoundsMin = -0.01;
const uBoundsMax = 1.01;
const tBoundsMin = -0.01;
const tBoundsMax = 1.01;
```

With **uniform** normalization: U spans [0, 1] but T spans [0, tRange/scale] ≈ [0, 0.177]. The filter's T upper bound of 1.01 is needlessly loose — any centroid with T > 0.177 is exterior but the filter doesn't catch it (relying on `exterior: true` in cdt2d).

With **independent** normalization: U spans [0, 1], T spans [0, 1]. The bounds [-0.01, 1.01] are now **tight and geometrically correct** for both axes. The filter actually becomes **more accurate** — it matches the domain better. ✅ No change needed.

### 3. Quality metrics (lines 328-350)

```typescript
const e0 = Math.sqrt((pj[0] - pi[0]) ** 2 + (pj[1] - pi[1]) ** 2);
// ... aspect and angle calculations
```

These compute edge lengths and angles in the CDT coordinate system. With independent normalization:
- `maxAspectUV` will **decrease** (triangles are more equilateral in the 1:1 domain)
- `minAngleUV` will **change** — could decrease for strips where the T-axis stretching creates elongated vertical triangles, but increase for the majority of triangles

These are diagnostic-only. The logged output at [OuterWallTessellator.ts line 1844](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1844) reports them but they don't affect mesh generation. ✅ No change needed, but the interpretation changes.

### 4. Winding check (lines 310-320)

```typescript
const ux1 = points[lj][0] - points[li][0];
const uy1 = points[lj][1] - points[li][1];
const cross = ux1 * uy2 - ux2 * uy1;
```

Cross product sign is scale-invariant. If U and T are independently scaled by positive factors, the sign of the cross product is preserved. ✅ No impact.

### 5. Constraint edges

```typescript
const l0 = globalToLocal.get(v0);
const l1 = globalToLocal.get(v1);
addEdge(l0, l1);
```

Purely index-based. The CDT enforces constraints by vertex INDEX, not by coordinate value. ✅ Confirmed no interaction.

### 6. OuterWallTessellator crossing detection (lines 1558-1600)

```typescript
const getUV = (vIdx: number): [number, number] => {
    return [vertices[vIdx * 3], vertices[vIdx * 3 + 1]];
};
```

Reads from the GPU vertex buffer's U,T values (physical parametric coordinates). Completely independent of CDT normalized coordinates. ✅ Confirmed no interaction.

## Edge Case Analysis

### Very narrow strips (uRange → 0)

When a strip has only 1-2 columns (expansion=0 or chain near strip boundary):
- `uRange` ≈ 0, clamped to `1e-12`
- With independent normalization: `(u - uMin) / 1e-12` could be huge if vertices have even slightly different U values
- But: if uRange clamped to 1e-12, all vertices' U values are within ~1e-12 of uMin, so `(u - uMin) / 1e-12` ≈ [0, 1]. No explosion.
- If uRange is exactly 0 (all same U): all CDT U-coordinates = 0. This is a degenerate 1D strip — the CDT either produces no triangles or falls through to the sweep fallback. Same as before.

### Single-column strips

`bot.length == 1, top.length == 1` → `points.length < 3` → early return at line 183. Never reaches normalization. ✅ Safe.

`bot.length == 2, top.length == 1` (or vice versa) → 3 points, uRange is the gap between the 2 bot vertices. With independent normalization, this becomes a well-formed triangle in CDT space. ✅ Safe.

### Very thin micro-row bands (tRange → 0)

`tRange` clamps to `1e-12`. With PROMO_EPSILON=0, all bot vertices are at T=tBot and top at T=tTop, so `(tBot - tBase)/tRange = 0` and `(tTop - tBase)/tRange = 1`. Interior companions at intermediate T become `(companion_t - tBase) / tRange` which is a well-defined fraction in (0, 1). ✅ Safe.

### Strips where tRange > uRange (unusual)

This can occur with very low expansion (0-1) and high row density. The old code was correct here (scale=tRange, U gets squished). With independent normalization, BOTH axes span [0,1] — identical to the common case. In fact, these strips **benefit equally** from independent normalization: the CDT sees a square domain regardless of which axis was originally larger. ✅ Actually an improvement.

## Test Assertion Analysis

From [ChainStripTriangulator.test.ts](src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts#L390-L445):

### Test: "uniform-scale normalization preserves aspect ratio for wide strips" (line 395)

```typescript
expect(stats.minAngleUV).toBeGreaterThan(5);  // at least 5° min angle
expect(stats.maxAspectUV).toBeLessThan(20);    // not extremely elongated
```

This test creates a 10-column strip with uRange=1.0, tRange=0.1.

**With uniform** (scale=1.0): CDT sees 1.0×0.1 rectangle. Triangles ≈ 0.111×0.1 right triangles. minAngleUV ≈ 42°, maxAspectUV ≈ 0.6. ✅ Passes.

**With independent**: CDT sees 1.0×1.0 square. Each column pair forms a 0.111×1.0 rectangle. Triangles are tall and narrow. minAngleUV ≈ 6.3° (angle opposite the 0.111 base in a 0.111×1.0 right triangle). maxAspectUV ≈ 2.63. ✅ **Still passes** (6.3° > 5, 2.63 < 20).

The test name and comments become misleading (they describe the OLD rationale for uniform scaling) but **assertions hold**. Per the constraint "Do NOT change any test files" — no action needed.

### Test: "new stats fields are initialized to defaults" (line 435)

```typescript
expect(s.minAngleUV).toBe(180);
expect(s.maxAspectUV).toBe(0);
```

Tests the `createEmptyStats()` return values. Unaffected by normalization. ✅ Passes.

## Predicted Metric Impact

| Metric | Before (R24) | Predicted (R24.1) | Reasoning |
|--------|-------------|-------------------|-----------|
| violations(>4:1) | 50.4% | **15-25%** | CDT now penalizes horizontal slivers. The remaining violations will come from inherently challenging topology (chain vertices at band boundaries, very thin companion layers near T-fraction extremes). |
| maxAspect3D | 3,350 | **200-800** | Without the 5.65× squishing, the worst triangles lose their primary creation mechanism. Max will come from edge cases near strip boundaries. |
| aspectRejects | 281,219 | **80K-150K** | Roughly proportional to violation reduction. Post-rejection optimizer has better starting material. |
| minAngleUV | ~2-5° | **~5-15°** | CDT in square domain rejects the previously-invisible degenerate configurations. |
| maxAspectUV | ~10-50 | **~3-8** | Triangles more equilateral in CDT space. (Caveat: this metric's relationship to 3D quality changes with normalization.) |

## Recommended Approach

**Proposal 1 — do it.** This is a single-line change (`scale` → `uRange`/`tRange`) with:
- Crystal-clear mathematical justification
- Zero impact on constraint edges, crossing detection, or centroid filtering
- All test assertions pass
- Massive predicted improvement on the dominant remaining violation source

This is the lowest-risk, highest-impact single change available.

## Open Questions (Inviting Verifier Scrutiny)

1. **Is 1:1 optimal, or should we use physical aspect?** The physical strip is ~2.8:1, not 1:1. We could compute `physicalUScale = uRange × R` and `physicalTScale = tRange × H`, normalizing by those. But R and H aren't available in `cdtTriangulateStrip`, and 1:1 is much better than 5.65:1. Diminishing returns on further tuning.

2. **Companion T-fraction sensitivity**: With independent normalization, companions at T-fraction=0.25 map to CDT T=0.25 (25% of the axis) rather than CDT T=0.044 (4.4%). This AMPLIFIES the companion's influence on CDT connectivity. Is this always beneficial? For T-fractions near 0 or 1 (companions very close to boundaries), the amplification is minimal. For T-fractions near 0.5, the companion is now at CDT T=0.5 — right in the middle — which should produce excellent triangulations. I believe this is uniformly beneficial but the Verifier should confirm.

3. **cdt2d numerical stability**: Does cdt2d have any internal epsilons calibrated for a particular coordinate range? The library documentation doesn't mention this, and we've been using it with coordinates in [0, ~1] range for both cases. Should be fine.

4. **The UV quality metrics now mean something different.** Should we add a `maxAspect3D_approx` metric that uses physical scaling? Not in this change (minimal scope), but worth considering for future diagnostics.
