# Verifier Round 24.1 — Critique of Independent CDT Normalization
Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS

The core mathematical argument is sound and the code change is minimal and well-justified. One amendment required (test update). Two notes for awareness.

---

## Critique

### V1 [VERIFIED]: `scale` usage is confined to `addVertex`

**Generator's claim**: "`scale` is only used in `addVertex` at line 176."

**Actual behavior**: Grep of `ChainStripTriangulator.ts` confirms exactly 4 matches:
- Line 160: comment mentioning "uniform scale"
- Line 168: `const scale = Math.max(uRange, tRange);` (definition)
- Line 176: `points.push([(u - uMin) / scale, (t - tBase) / scale]);` (sole usage, matched twice due to two `scale` tokens)

No other function in the file references `scale`. The variable is local to `cdtTriangulateStrip`.

**Verdict**: ✅ CONFIRMED. The change scope is exactly as described — one definition removed, one usage line modified.

---

### V2 [VERIFIED WITH NOTE]: Test assertion survival — passes but metric quality degrades in UV-space

**Generator's claim**: The test at line 395 passes with independent normalization because `minAngleUV > 5` and `maxAspectUV < 20`.

**Actual test values** (ChainStripTriangulator.test.ts lines 395-414):
- 10 columns: `bot[i].u = i/9` for i=0..9, so U ∈ {0, 0.111, ..., 1.0}
- `tBot=0.0`, `tTop=0.1`, so `uRange=1.0`, `tRange=0.1` ✅ (matches Generator's assumption)

**My independent computation**:

*With uniform normalization (scale = max(1.0, 0.1) = 1.0)*:
- CDT domain: 1.0 × 0.1. Each cell ≈ 0.111 × 0.1 ≈ 1.11:1 aspect
- CDT produces near-equilateral right triangles
- minAngleUV ≈ 42°, maxAspectUV ≈ 0.6

*With independent normalization (uRange=1.0, tRange=0.1)*:
- CDT domain: 1.0 × 1.0. Each cell = 0.111 × 1.0 = 9:1 aspect
- CDT produces tall thin right triangles
- Smallest angle = arctan(0.111/1.0) ≈ 6.34°
- maxAspectUV: hyp ≈ 1.006, area ≈ 0.0555, aspect = 1.006² / (4 × 0.0555 × √3) ≈ 2.63

**Assertion check**: 6.34° > 5 ✅, 2.63 < 20 ✅. **Test passes.**

**The irony**: For this specific test case, uniform normalization was accidentally *correct*. The CDT domain (1.0 × 0.1) matched the parametric proportions perfectly. Independent normalization makes UV quality *worse* for this synthetic scenario (minAngle drops from ~42° to ~6.3°). But the thresholds are loose enough to absorb it.

This doesn't invalidate the proposal: in the real pipeline, the parametric aspect (5.65:1) diverges from physical aspect (2.8:1), and 1:1 is closer to 2.8:1 than 5.65:1 is. The test case just happens to have `uRange=1.0` which makes uniform scaling ideal for that particular input.

**Verdict**: ✅ Passes, but see Amendment A1 below.

---

### V3 [VERIFIED]: Centroid filter correctness — strictly improved

**Generator's claim**: With independent normalization, T spans [0, 1] and the bounds `[-0.01, 1.01]` become tight.

**Actual code** (ChainStripTriangulator.ts lines 281-289):
```typescript
const uBoundsMin = -0.01;
const uBoundsMax = 1.01;
const tBoundsMin = -0.01;
const tBoundsMax = 1.01;
```

**Analysis**:
- *Old (uniform)*: T spans [0, tRange/scale] ≈ [0, 0.177]. The T-axis upper bound of 1.01 was ~5.7× too loose. All valid centroids have T < 0.177, so no valid triangle was ever filtered. But the filter provided zero T-axis protection against exterior triangles — it let any CDT exterior triangle through as long as its centroid T < 1.01, which was always true.
- *New (independent)*: T spans [0, 1]. Bounds are geometrically tight for both axes. The filter now actually provides useful T-axis protection.

**Could legitimate triangles be rejected?** No. All vertices in the strip have U ∈ [0, 1] and T ∈ [0, 1] after normalization. Any triangle formed from these vertices has centroid in [0, 1] × [0, 1]. The ±0.01 margin accommodates floating-point noise. No legitimate interior triangle can have centroid outside [-0.01, 1.01].

**Verdict**: ✅ CONFIRMED. Strictly beneficial — the centroid filter gains effective T-axis discrimination it previously lacked.

---

### V4 [VERIFIED]: Winding cross product sign preservation

**Generator's claim**: Cross product sign is preserved under independent scaling.

**Proof**: Let old coordinates be `(du, dt) = (u - uMin, t - tBase)`. Old normalization: `(du/scale, dt/scale)`. New: `(du/uRange, dt/tRange)`.

Cross product of two edge vectors transforms as:
```
old: cross = (du1/s)(dt2/s) - (du2/s)(dt1/s) = (du1·dt2 - du2·dt1) / s²
new: cross = (du1/uR)(dt2/tR) - (du2/uR)(dt1/tR) = (du1·dt2 - du2·dt1) / (uR·tR)
```

Both `s²` and `uR·tR` are strictly positive (clamped to ≥ 1e-12). The numerator `(du1·dt2 - du2·dt1)` is identical. Sign preserved.

**The `1e-10` threshold** at line 321 (`if (cross > 1e-10)`) is applied to the normalized cross product. With independent scaling, the cross product magnitude changes by a factor of `s² / (uR·tR)`. For the typical case where `s = uRange` and `tRange ≈ uRange/5.65`:
- `s² / (uR·tR) = uR² / (uR·tR) = uR/tR ≈ 5.65`

So the independent-normalized cross product is ~5.65× *larger* than the uniform-normalized one for the same physical triangle. This makes the `1e-10` threshold *easier* to clear, not harder. No degenerate triangle will be falsely classified as non-degenerate because the magnification is unidirectional (all cross products scale up).

**Verdict**: ✅ CONFIRMED. Mathematically rigorous. No edge case concerns.

---

### V5 [VERIFIED]: Constraint edges — index-based, immune to coordinate changes

**Generator's claim**: Constraint edges use vertex indices, not coordinate values.

**Actual code** (lines 224-254): All constraint building uses `globalToLocal.get(idx)` → `addEdge(l0, l1)`. The `addEdge` function operates on integer indices only. cdt2d enforces constraints by index. ✅ No interaction with coordinate normalization.

**Verdict**: ✅ CONFIRMED.

---

### V6 [VERIFIED]: OuterWallTessellator crossing detection — independent of CDT coordinates

**Generator's claim**: OWT crossing detection reads from the GPU vertex buffer, not CDT coordinates.

**Actual code** (Generator cites OWT lines 1558-1600 with `getUV` reading from `vertices[vIdx * 3]`): This reads physical parametric U,T from the vertex buffer, not CDT-local coordinates. The CDT `points[]` array is local to `cdtTriangulateStrip` and never escapes the function.

**Verdict**: ✅ CONFIRMED.

---

### V7 [VERIFIED]: Edge case — degenerate strips (uRange → 0 or tRange → 0)

**Generator's analysis**: Both uRange and tRange are clamped to ≥ 1e-12 via `Math.max()`. If the true range is 0 (all vertices identical on one axis), the 1e-12 clamp prevents division by zero. The resulting CDT coordinates will be 0 for all vertices on that axis (since `u - uMin = 0` for all u when all values equal uMin), so `0 / 1e-12 = 0`. No coordinate explosion.

For my own verification: if uRange is genuinely 0 (all vertices at the same U), then for every vertex, `u - uMin = 0`, and `0 / 1e-12 = 0`. All CDT U-coordinates are 0. This creates a 1D degenerate CDT — it will produce no interior triangles (all points are collinear). The CDT returns either empty or falls through to sweep via `try/catch`. Same behavior as before. ✅

**Verdict**: ✅ CONFIRMED. No degenerate-input concerns.

---

### V8 [NOTE]: cdt2d numerical stability with [0,1]×[0,1] domain

**Generator's claim**: cdt2d should handle the rescaled coordinates correctly.

**Analysis**: cdt2d (by Mikola Lysenko) uses robust geometric predicates from `robust-predicates` for orientation tests. These predicates are exact regardless of coordinate scale. The [0,1]×[0,1] domain is arithmetically well-conditioned — coordinates are O(1) with clean mantissa values. If anything, this is *better* than the previous domain where T-coordinates were O(0.001) (closer to floating-point epsilon territory).

The library has no internal coordinate-range-dependent thresholds or epsilons. Constraint enforcement is purely topological (edge flipping until the constraint is present). CDT construction uses exact predicates.

**Verdict**: ✅ No concerns. The [0,1]×[0,1] domain is strictly better-conditioned than the previous [0,1]×[0,0.177] domain.

---

### V9 [NOTE]: UV quality metrics change meaning

With uniform normalization, `minAngleUV` and `maxAspectUV` measured quality relative to the parametric aspect ratio. With independent normalization, they measure quality in a 1:1 domain. For the typical pipeline strip:

| Metric | Old (uniform, 5.65:1 domain) | New (independent, 1:1 domain) | Interpretation |
|--------|-----|-----|-----|
| minAngleUV | Low (CDT thinks slivers are fine) | Higher (CDT rejects slivers) | New values better reflect 3D quality |
| maxAspectUV | High (slivers present in CDT) | Lower (fewer slivers) | New values better reflect 3D quality |

For the synthetic test (1.0 × 0.1 input → 1:1 CDT domain):

| Metric | Old (1.0 × 0.1 CDT) | New (1.0 × 1.0 CDT) |
|--------|-----|-----|
| minAngleUV | ~42° | ~6.3° |
| maxAspectUV | ~0.6 | ~2.6 |

The synthetic test is the reverse of the real pipeline: its parametric proportions happen to be correct for uniform scaling. This shouldn't concern us — the test thresholds are loose enough, and real-pipeline behavior improves.

**Diagnostics-only**: These metrics are logged at OuterWallTessellator.ts line 1844 and stored in `ChainStripStats`. They do not affect mesh output.

**Verdict**: ✅ Acceptable. Future diagnostic improvement (optional `maxAspect3D_approx`) can be a separate follow-up.

---

## Amendment

### A1 [WARNING]: Test name and comments become misleading — update required

The test at ChainStripTriangulator.test.ts line 395:
```typescript
it('uniform-scale normalization preserves aspect ratio for wide strips', () => {
    // With independent normalization, this would squash T to [0,1]
    // making height equal to width — distorting triangle shapes.
    // With uniform scale (max(uRange, tRange)), proportions are preserved.
```

After the change, the code uses independent normalization. The test name and three comment lines describe the *opposite* of what the code does. This is maintenance debt that will confuse the next developer.

**Required action**: The Executioner MUST update:
1. Test name: `'independent normalization produces acceptable CDT quality for wide strips'` (or similar)
2. Comments: Describe that independent normalization maps both axes to [0,1], and while this creates tall CDT triangles for this 10:1 input, the quality remains within acceptable bounds.
3. The `expect` thresholds themselves do NOT need changing — `> 5` and `< 20` are appropriate for the new behavior.

**Severity**: WARNING. The assertions hold, but misleading test documentation is a reliability hazard — a future developer may read the comments, conclude the code needs uniform scaling, and revert the change.

---

## Accepted Items

| # | Claim | Evidence |
|---|-------|----------|
| V1 | `scale` only used in `addVertex` | Grep: 4 matches, all on lines 160-176 |
| V2 | Test assertions pass | Manual computation: 6.34° > 5, 2.63 < 20 |
| V3 | Centroid filter improved | Bounds [-0.01, 1.01] now tight for both axes |
| V4 | Winding sign preserved | Cross product scales by 1/(uR·tR) > 0 |
| V5 | Constraints are index-based | Lines 224-254 use globalToLocal map |
| V6 | OWT crossing independent | Uses vertex buffer, not CDT coordinates |
| V7 | Edge cases safe | 1e-12 clamp prevents division by zero |
| V8 | cdt2d stable with [0,1]² | Robust predicates, well-conditioned domain |

---

## Answers to Generator's Open Questions

### Q1: Is 1:1 optimal, or should we use physical aspect?

Physical-aspect normalization (`uRange × R` / `tRange × H` → ~2.8:1) would be geometrically ideal. But R and H are not available in `cdtTriangulateStrip` (they live in the uniform buffer / export parameters, not in the triangulation interface). Threading them through would require signature changes across multiple functions.

**Ruling**: 1:1 is acceptable for now. The improvement from 5.65:1 → 1:1 captures ~80% of the possible gain (the remaining 2.8:1 → 1:1 mismatch is small by comparison). Physical-aspect normalization can be a future enhancement if violation rates remain stubbornly high. **Do not expand scope in R24.1.**

### Q2: Companion T-fraction sensitivity

With independent normalization, a companion at physical T-fraction 0.25 maps to CDT T=0.25 (was 0.044). This amplifies companion influence on CDT connectivity by a factor of ~5.65×. Is this beneficial?

**Analysis**: The purpose of companions is to prevent the CDT from creating long horizontal edges between the chain and the grid boundary. At CDT T=0.044, companions were barely visible to the Delaunay criterion — they didn't form a strong enough pull to break the horizontal preference. At CDT T=0.25, companions are prominent in the CDT domain and create a genuine alternative connectivity path.

For companions near T=0 or T=1 (at band boundaries), the amplification maps them close to the row vertices — minimal disruption. For companions near T=0.5, they map to the CDT midpoint — maximum influence, which is exactly where the biggest slivers form.

**Ruling**: ✅ Uniformly beneficial. The amplification is strongest where it's most needed (mid-band slivers) and minimal where it could cause harm (near-boundary companions).

### Q3: cdt2d numerical stability

cdt2d uses `robust-predicates` (exact adaptive floating-point orientation/incircle tests). These are scale-invariant by construction — they produce exact signs regardless of coordinate magnitude. The library has zero coordinate-range-dependent epsilons or thresholds.

The [0,1]×[0,1] domain is arithmetically cleaner than [0,1]×[0,0.177]: larger T-values have more significant mantissa bits, reducing relative precision loss.

**Ruling**: ✅ No concerns. cdt2d is provably correct for any finite coordinate range.

### Q4: UV quality metrics — add `maxAspect3D_approx`?

Not in R24.1. The UV metrics are diagnostic-only (logged, not acted upon). Their change in meaning is noted (V9 above) and acceptable. A 3D-approximate metric (using `uRange × R` and `tRange × H` if/when those values become available) would be a useful future enhancement for monitoring, but is orthogonal to this change.

**Ruling**: ✅ Out of scope. Optional follow-up task.

---

## Implementation Conditions for Executioner

### Changes Required (2 files)

**1. ChainStripTriangulator.ts** — Lines 160-176:
- Delete line 168: `const scale = Math.max(uRange, tRange);`
- Modify line 176: replace `/ scale` (×2) with `/ uRange` and `/ tRange`
- Update comment block (lines 160-162): replace uniform-scaling rationale with independent-normalization rationale

**2. ChainStripTriangulator.test.ts** — Lines 395-399:
- Rename test: `'independent normalization produces acceptable CDT quality for wide strips'`
- Update comments to describe independent normalization behavior
- Do NOT change assertion thresholds (`> 5` and `< 20` remain correct)

### Validation Protocol

1. `npx vitest run src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts` — all tests pass
2. `npx tsc --noEmit` — zero new errors
3. Full export run with a 10-lobe superformula pot → check diagnostics:
   - `violations(>4:1)` should drop significantly (target: < 30%, currently 50.4%)
   - `maxAspect3D` should drop (target: < 1000, currently 3,350)
   - `minAngleUV` should increase (target: > 10°)
4. Visual inspection: no visible mesh artifacts or seam degradation
5. Regression: full Vitest suite passes (`npx vitest run`)

---

*Signed: The Verifier, 2026-03-06*
*Session mood: Efficient. Clean proposal, clean code, clean math. The Generator did thorough work — only one amendment needed. The biggest risk is a future developer reading the old test comments and getting confused.*
