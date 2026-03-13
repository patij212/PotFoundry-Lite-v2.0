# Verifier Round 26 — Critique of CDT Segment Inherent Aspect Ratio Proposals

Date: 2026-03-06

## Summary Verdict: REJECT P2/P5 as stated; ACCEPT P1 unconditionally; ACCEPT P2/P5 WITH MAJOR AMENDMENTS

The Generator's root cause analysis is correct (CDT segment aspect ratio causes slivers). P1 (reduce expansion) is sound. However, P2's "3D-metric-aware normalization" contains a **critical mathematical error**: the metric correction is applied in the wrong direction, making CDT cell aspect *worse* in 3D, not better. The P5 hybrid inherits this error. Furthermore, the Generator's claim that `positions3D` is available at CDT time is **false** — 3D positions don't exist until after GPU evaluation, which runs AFTER the CDT.

Despite these errors, moderate T-inflation *may* still be empirically beneficial (more square CDT domain gives Delaunay more freedom with companions). But the theoretical grounding is wrong, the optimal correction factor unknown, and the risk of repeating R24.1's failure is real.

---

## Critique

### V1 [CRITICAL]: 3D positions are NOT available when CDT runs

**Generator's claim** (P2, P5): "The 3D positions are available in the vertex buffer at this point. For each CDT segment, we can estimate the 3D U-scale and T-scale from the boundary vertices: `p3D_botLeft = positions3D[bot[0].idx]`"

**Actual pipeline order** (verified from [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts)):
1. **Step 7** ([line 1311](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1311)): `buildCDTOuterWall()` runs → CDT triangulation occurs here
2. **Phase 3** ([line 1456](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1456)): GPU evaluation `evaluatePoints()` → produces 3D xyz positions
3. **Phase 4** ([line 1467](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1467)): Post-GPU quality improvement uses 3D positions

**Evidence**: The OWT vertex buffer contains `(u, t, surfaceId)` interleaved, NOT xyz positions. See [OuterWallTessellator.ts lines 921-923](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L921-L923):
```typescript
vertices[vIdx++] = unionU[i];           // u
vertices[vIdx++] = activeTPositions[j];  // t
vertices[vIdx++] = surfaceId;            // surfaceId
```

The `pos3()` function from [ChainStripOptimizer.ts line 181](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L181) reads xyz from a `Float32Array` — but no such array exists at CDT time. Using it on the OWT vertex buffer would read `(u, t, surfaceId)` as `(x, y, z)`, producing garbage.

**Impact**: The Generator's "no new parameters needed" implementation path is **impossible**. The P5 implementation sketch (`pos3(positions3D, bot[0].idx)`) would crash or produce nonsense.

**Required fix**: Use `PotGeometryParams` (already passed to `buildCDTOuterWall` at [line 1325](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1325) but **never used** inside the function) plus pot height `H` for analytic metric computation:
```
R(t) = Rb + (Rt - Rb) × t^expn
scaleU = 2πR(meanT)
scaleT ≈ H  (or √(R'² + H²) for precision)
```

**Plumbing needed**:
1. Add `H: number` to `PotGeometryParams` interface ([OWT line 87](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L87))
2. Pass `H` from PEC call site ([PEC line 1325](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1325)): `{ Rb: dimensions.Rb, Rt: dimensions.Rt, expn: dimensions.expn, H: dimensions.H }`
3. Thread `potGeometry` through `triangulateChainStrip` → `cdtTriangulateStrip` (add parameter to both signatures)
4. Compute `metricRatio` analytically inside `cdtTriangulateStrip` using `R(meanT)` and `H`

This is ~10-15 lines of plumbing, not the "~15 lines" the Generator estimated. Moderate but manageable.

---

### V2 [CRITICAL]: Metric normalization formula is mathematically inverted

**Generator's claim** (P2): "Normalize CDT points as: `t_norm = (t - tBase) / tRange * metricRatio` where `metricRatio = scaleU_3D / scaleT_3D = 2πR / H`. [...] This makes the CDT's Delaunay criterion optimize for equilateral triangles in 3D space."

**Mathematical verification**: For a surface of revolution S(u,t) = (R cos 2πu, R sin 2πu, Ht), the first fundamental form gives:
- $E = (\partial S/\partial u)^2 = (2\pi R)^2$ (circumferential metric)
- $G = (\partial S/\partial t)^2 \approx H^2$ (meridional metric, assuming $R' \ll H$)

For the CDT Delaunay criterion to coincide with the 3D-optimal triangulation, CDT distances must be proportional to 3D distances:

$$ds_{CDT}^2 = du_{CDT}^2 + dt_{CDT}^2 \propto E\,du^2 + G\,dt^2$$

This requires $u_{CDT} = u \cdot \sqrt{E}/K$ and $t_{CDT} = t \cdot \sqrt{G}/K$ for normalization constant $K$.

**The Generator's formula gives the wrong cell aspect ratio.** For a concrete segment with $uRange = 0.0133$, $tRange = 0.0023$, $R = 40\text{mm}$, $H = 80\text{mm}$:

| Metric | Current (uniform) | Generator P2 | Correct isotropic |
|--------|-------------------|-------------|-------------------|
| CDT cell $\Delta u$ | 0.111 | 0.111 | 0.111 |
| CDT cell $\Delta t$ | 0.173 | 0.543 | 0.055 |
| CDT cell aspect | 0.64:1 (T slight) | 0.20:1 (T dominant) | 2.02:1 (U dominant) |
| Physical cell aspect | **2.02:1** | **2.02:1** | **2.02:1** |

The Generator's formula stretches T by `metricRatio = 3.14`, but the correct isotropic scaling *shrinks* T by the same factor. The difference is $\text{metricRatio}^2 \approx 10\times$. The Generator has the correction **inverted**.

**Proof**: With the Generator's normalization:
$$\frac{\Delta u_{CDT}}{\Delta t_{CDT}} = \frac{\Delta u / uRange}{\Delta t \cdot \text{metricRatio} / uRange} = \frac{\Delta u}{\Delta t \cdot \text{metricRatio}}$$

For isotropic CDT, this should equal $\frac{\Delta u \cdot \sqrt{E}}{\Delta t \cdot \sqrt{G}} = \frac{\Delta u}{\Delta t} \cdot \text{metricRatio}$.

The Generator gets $1/\text{metricRatio}$ where the correct answer is $\text{metricRatio}$. Off by $\text{metricRatio}^2$.

**Why this matters**: The CDT sees cells as T-dominant (0.2:1) when they're actually U-dominant (2:1) in 3D. The Delaunay criterion will aggressively create horizontal connections to "fix" the perceived T-elongation, producing slivers in the U-direction — the *same* failure mode as R24.1, just with less magnitude.

---

### V3 [CRITICAL]: Generator's R24.1 comparison contains errors

**Generator's claim**: "R24.1 created a 1:1 UV aspect but a 1:5.8 3D aspect, which is worse than the original 5.8:1."

**Actual analysis**: R24.1 normalized independently: `u/uRange` and `t/tRange` → [0,1]×[0,1]. This maps each CDT cell to:
- $\Delta u_{CDT} = 1/9 = 0.111$ (for 9 cells)
- $\Delta t_{CDT} = 1.0$ (entire T-range)
- CDT cell aspect = 0.111 : 1.0 = **1:9** (T extremely dominant)

The physical cell aspect is unchanged at 2.02:1 (U dominant). R24.1 makes the CDT think cells are 9:1 T-dominant when they're actually 2:1 U-dominant — off by factor of 18.

The Generator's claim of "1:5.8 3D aspect" is wrong. The 3D aspect doesn't change with normalization (it's a physical quantity). What changes is the CDT's *perception* of the aspect.

**Generator's P2 comparison**: P2 creates CDT cell aspect 1:4.9 (T too dominant). R24.1 created 1:9 (T much too dominant). Both go the same direction — P2 is just less extreme.

| Method | CDT cell aspect | Physical cell aspect | Error factor |
|--------|----------------|---------------------|-------------|
| Current (uniform) | 0.64:1 | 2.02:1 | 3.2× underestimates U |
| R24.1 (independent) | 0.11:1 | 2.02:1 | 18× underestimates U |
| Generator P2 | 0.20:1 | 2.02:1 | 10× underestimates U |
| Correct isotropic | 2.02:1 | 2.02:1 | 1.0× (exact) |

P2 is directionally the same error as R24.1, at 55% of R24.1's magnitude.

---

### V4 [WARNING]: The correct isotropic normalization would make the CDT domain MORE elongated, not less

**Counterintuitive finding**: The correct 3D-isotropic normalization produces a CDT domain with aspect **18.2:1** (vs current 5.8:1). This is because the physical domain IS highly elongated — each U-unit maps to more 3D distance than each T-unit (circumference > height).

In an 18.2:1 domain with only boundary vertices, the Delaunay triangulation produces extremely elongated triangles. Although these match 3D geometry correctly, the CDT has almost no freedom to create equilateral triangles because the domain is too narrow.

**Implication**: "Make the CDT see the correct 3D geometry" and "make the CDT produce good triangles" are conflicting objectives for boundary-dominated regions. The Generator conflates them. The literature on metric-aware CDT (Chew '93, Boissonnat '02) assumes dense, well-distributed vertex sets where the CDT has freedom to choose — not boundary-only strips.

---

### V5 [WARNING]: Despite V2-V4, moderate T-inflation MAY still help empirically

The Generator's formula, while mathematically unjustified as "3D isotropic," does make the CDT domain closer to square ($1.84:1$ vs $5.8:1$). A more square domain gives interior points (companions) more CDT-space separation from boundaries, allowing the Delaunay to create more diverse triangulations.

However:
- R24.1 went all the way to $1:1$ and made things **worse** (54.2% violations, up from 50.4%)
- P2 goes to $1.84:1$ — halfway between current ($5.8:1$) and R24.1 ($1:1$ but with $1:9$ cells)
- Whether this intermediate point is improvement or degradation is **unknown without testing**
- The optimal T-inflation factor is not derivable from theory — it depends on the vertex distribution

**Risk assessment**: If P2 makes things worse (like R24.1), it would be another wasted round. The R24.1→reverted→R25→reverted pattern is concerning.

---

### V6 [VERIFIED]: P1 (reduce expansion to 2) is mathematically sound and low-risk

**Claim verification**:
- [ChainStripTriangulator.ts line 47](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L47): `expansion: 4` is a single constant
- With $e=2$: CDT segment width = $2 \times 2 + 1 = 5$ columns at ~0.00148 spacing = 0.0074 U-units
- CDT aspect ratio: $0.0074 / 0.0023 = 3.2:1$ (down from 5.8:1)
- Normalized CDT domain height: $0.0023 / 0.0074 = 0.31$ (up from 0.17)

**Companion fan impact**: Verified at [OWT lines 699-701](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L699-L701):
```typescript
const expansion = chainStripConfig.expansion;
const leftCol = Math.max(0, col - expansion);
const rightCol = Math.min(numU - 1, col + expansion + 1);
```
With $e=2$, the U-range for companions narrows from ±4 cols to ±2 cols. `SHELL_FRACTIONS = [0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0]` — fractions 0.72 and 1.0 would place companions near the strip boundary. This is acceptable because the CDT segment boundary is also narrower.

**Strip marking impact**: Verified at [OWT lines 1199-1210](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1199-L1210): expansion is used for marking `colHasChain[]`. Fewer cells marked as chain-strip → more cells use simple quad triangulation → cleaner CDT←→quad transitions.

**Verdict**: **ACCEPT** unconditionally. One-constant change, clear geometric benefit, minimal risk.

---

### V7 [VERIFIED]: Centroid bounds filter needs adjustment for any T-stretching

At [ChainStripTriangulator.ts lines 280-283](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L280-L283):
```typescript
const tBoundsMin = -0.01;
const tBoundsMax = 1.01;
```

With metric normalization, T-coordinates in CDT space reach $0.54$ (P2 with current expansion) or $0.98$ (P5 with $e=2$). Both are within $[-0.01, 1.01]$, so the centroid filter would work.

**Edge case**: For tall narrow pots where $H \gg 2\pi R$ (metricRatio < 1), the Generator's formula would SHRINK T, reducing the effective range below 0.17. No bound violation in this case either.

**For the correct isotropic formula** (if adopted): T-range would shrink to $0.055$, well within bounds.

**Verdict**: Centroid filter is safe for the proposed $P5$ numbers. However, if `metricRatio` exceeds $\approx 5.8$ (uncommon but possible for very short, wide pots), `tBoundsMax` needs dynamic adjustment: `tBoundsMax = Math.max(1.01, tRange / combinedScale * metricRatio + 0.01)`.

---

### V8 [VERIFIED]: Winding check is robust to anisotropic T-scaling

At [ChainStripTriangulator.ts lines 314-324](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L314-L324):
```typescript
const cross = ux1 * uy2 - ux2 * uy1;
if (cross > 1e-10) { ... }
```

Any positive scaling of the T-axis (stretching or shrinking) preserves the sign of the cross product. The magnitude changes, but since all vertices are similarly scaled, the threshold `1e-10` remains adequate. Verified by same analysis as in [the R24.1 critique V4](potfoundry-web/docs/plans/verifier-round-24.1-independent-cdt-normalization-critique.md) — the proof is identical.

---

### V9 [NOTE]: Quality metrics change meaning with normalization

At [ChainStripTriangulator.ts lines 330-358](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L330-L358), `minAngleUV` and `maxAspectUV` are computed from CDT-space coordinates. With metric normalization, these become "CDT-metric-space quality" rather than "UV-space quality." The metrics are diagnostic-only (logged, not used for decisions), so this is acceptable. But test assertions calibrated to current normalization may need threshold updates.

---

### V10 [VERIFIED]: P3 (multi-band CDT) correctly assessed as high-risk

The Generator correctly identifies that the strip collection logic at [OWT lines 1270-1510](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1270) assumes 1 band per CDT segment. Multi-band merging would require major refactoring of the band scan loop, companion bucketing (`interiorByBand`), and constraint edge management. Correctly deferred.

---

### V11 [VERIFIED]: P4 (Laplacian smoothing) correctly assessed as band-aid

Buffer overflow concern from R25-P3 applies equally here. The `Float32Array` is fixed-size at allocation ([OWT line 915](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L915)). Steiner insertion cannot grow it. Additionally, 3D surface reprojection would require GPU re-evaluation — an expensive dependency.

---

### V12 [NOTE]: `potGeometry` is already threaded but unused — good existing hook

`buildCDTOuterWall` already accepts `potGeometry?: PotGeometryParams` at [OWT line 415](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L415) and PEC passes `{ Rb, Rt, expn }` at [PEC line 1325](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1325). But the parameter is **never read** inside the function body (confirmed by grep — only the declaration matches). Adding `H` and threading it to `cdtTriangulateStrip` is straightforward.

---

## Why P2's Normalization is NOT the Same as R24.1 (but is the Same Direction)

The user specifically asked for this explanation.

### The key distinction:

| Aspect | R24.1 | P2 |
|--------|-------|-----|
| T-inflation factor | $uRange/tRange = 5.78\times$ | $\text{metricRatio} = 3.14\times$ |
| CDT domain | $[0,1] \times [0,1]$ | $[0,1] \times [0, 0.54]$ |
| CDT cell aspect | 1:9 (extremely T-dominant) | 1:4.9 (moderately T-dominant) |
| Physical cell aspect | 2.02:1 (U-dominant) | 2.02:1 (unchanged) |
| Error vs physical | 18× wrong direction | 10× wrong direction |

Both R24.1 and P2 **inflate T relative to the uniform scale**, making the CDT think the T-dimension is more important than it physically is. R24.1 inflates maximally (to square domain); P2 inflates moderately (to 1.84:1 domain).

### Why P2 might not repeat R24.1's failure:

R24.1 failed because the extreme T-inflation (domain → 1:1) caused the CDT to create horizontal spanning-edges (9 columns wide in UV, appearing short in CDT space). These horizontal edges produced fan-like slivers.

P2's moderate inflation keeps the CDT domain $1.84:1$ (U still dominant). The CDT should still prefer vertical-ish connections at this aspect ratio, avoiding R24.1's horizontal-spanning failure mode.

### Why P2 might still fail:

The T-inflation is still in the *wrong direction* from an isotropic standpoint. The CDT's perception of T-importance is inflated ($\Delta t_{CDT} = 0.54$) far beyond the physical T-importance ($\Delta t_{3D} = 0.055$ equivalent). At a cell aspect of $1:4.9$, the CDT may still create undesirable horizontal connections in boundary-only regions, just less aggressively than R24.1.

### The honest answer:

Without testing, we cannot know if P2's intermediate inflation helps or hurts. The mathematical justification is wrong. The only true test is empirical.

---

## Answers to Generator's Open Questions

### Q1: "Are 3D positions available at CDT time?"

**No.** See V1 above. GPU evaluation (Phase 3) runs after CDT (Step 7). Use `PotGeometryParams + H` for analytic metric computation instead.

### Q2: "Does reducing expansion to 2 break any existing tests?"

Must be tested. The most likely impact: test cases in `ChainStripTriangulator.test.ts` may have companion counts or strip widths calibrated for $e=4$. Run `npx vitest run ChainStripTriangulator` to check. Threshold-based assertions (minAngleUV > 5, maxAspectUV < 20) should be robust across expansion values.

### Q3: "What's the optimal expansion value?"

For P1 alone (no metric normalization): $e=2$ gives aspect $3.2:1$, $e=3$ gives $4.5:1$, $e=1$ gives $1.9:1$. Lower is better for CDT quality but worse for CDT←→quad boundary smoothness. **Recommendation: $e=2$ is the sweet spot** — meaningful improvement without risk of boundary artifacts. Do NOT go to $e=1$ (only 3 cells wide, fragile).

### Q4: "Edge case: very tall, narrow pots (H >> 2πR)"

With the Generator's formula: metricRatio < 1, so T is SHRUNK (domain becomes even more U-dominant). This is actually the correct direction for tall narrow pots! The formula accidentally works better for $\text{metricRatio} < 1$ than for the typical $\text{metricRatio} > 1$ case.

With the correct isotropic formula (1/metricRatio instead of metricRatio): the situation is symmetric — tall narrow pots would get T-inflation (correct), wide short pots would get T-shrinking (correct).

### Q5: "Does companion placement need adjustment for e=2?"

`SHELL_FRACTIONS = [0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0]` — all 7 fractions are proportional to strip half-width. Fraction 1.0 places companions at the CDT boundary (the last column). With $e=2$, the boundary is closer so companions cluster more. This is fine — companion density near the chain is maintained, and the narrower CDT domain needs less interior coverage.

The T-ring near-chain emission at [OWT line 714-728](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L714) uses `Math.min(3, nShells)` → `nShells` (from R25's P1). This was recently changed and should be verified to work with $e=2$.

---

## Proposal Verdicts

| Proposal | Verdict | Rationale |
|----------|---------|-----------|
| **P1** (reduce expansion to 2) | **ACCEPT** | Sound geometry, one-line change, low risk |
| **P2** (3D-metric normalization) | **REJECT as stated** | Critical math error (inverted ratio), 3D positions unavailable; RESUBMIT with corrected formula + PotGeometryParams path |
| **P3** (multi-band CDT) | **ACCEPT (deferred)** | Correct long-term solution, too much refactoring risk now |
| **P4** (Laplacian + Steiner) | **REJECT** | Band-aid; buffer overflow risk; doesn't fix root cause |
| **P5** (Hybrid P1+P2) | **REJECT as stated** | Inherits P2's critical flaws; resubmit with corrected P2 |

---

## Recommended Path Forward

### Option A: P1 alone (minimum risk)

Implement P1 only — change `expansion: 4` to `expansion: 2`. This alone reduces CDT aspect from 5.8:1 to 3.2:1. Expected violation improvement: ~50% → ~30-40%.

**Why this is safe**: One constant, no formula changes, no plumbing, no normalization risk.

### Option B: P1 + corrected metric normalization (higher reward, higher risk)

If P1 alone is insufficient:

1. **Implement P1 first**, measure baseline improvement
2. **Then add metric normalization with corrected formula**:

   The correct isotropic normalization ($t_{CDT} = (t - tBase) / (uRange \cdot \text{metricRatio})$) would make the domain MORE elongated ($18:1$), which is counterproductive for boundary-dominated CDT.

   A better approach is **heuristic T-inflation by a moderate, physics-informed factor**. Instead of $\text{metricRatio}$ (too much) or $1/\text{metricRatio}$ (wrong direction for CDT quality), use $\sqrt{\text{metricRatio}}$ as a compromise:

   ```
   T_correction = sqrt(metricRatio)  // ≈ 1.77 for typical pots
   t_CDT = (t - tBase) / combinedScale * T_correction
   ```

   This inflates T moderately (domain → $2.8:1$ with $e=4$, or $1.8:1$ with $e=2$) without overcorrecting. The $\sqrt{\cdot}$ provides geometric-mean correction between no inflation and full (incorrect) inflation.

3. **Add a tuning constant**: Make the inflation factor configurable in `ChainStripConfig` so empirical tuning is possible without code changes.

### Implementation Conditions for the Executioner (Option A only)

If the Master approves P1 alone:

1. Change [ChainStripTriangulator.ts line 47](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L47): `expansion: 4` → `expansion: 2`
2. Run all tests: `npx vitest run`
3. Run export with default 8-petal style
4. Measure: violation rate, manifold status, maxAspect3D, triangle count
5. Compare against R24 baseline (50.4% violations, manifold=true)
6. Target: violations < 35%

### Implementation Conditions for the Executioner (Option B)

If the Master approves P1 + corrected metric normalization:

All of Option A, plus:

7. Add `H: number` to `PotGeometryParams` at [OWT line 87](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L87)
8. Pass `H` from PEC at [line 1325](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1325)
9. Add `potGeometry?: PotGeometryParams` parameter to `triangulateChainStrip()` and `cdtTriangulateStrip()` signatures
10. Thread `potGeometry` from OWT's `triangulateChainStrip` call at [OWT line 1621](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1621)
11. In `cdtTriangulateStrip`, if `potGeometry` is provided, compute:
    ```typescript
    const meanT = (tBot + tTop) / 2;
    const R = potGeometry.Rb + (potGeometry.Rt - potGeometry.Rb) * Math.pow(meanT, potGeometry.expn);
    const scaleU = 2 * Math.PI * R;
    const scaleT = potGeometry.H;
    const metricRatio = scaleU / scaleT;
    const tCorrection = Math.sqrt(metricRatio);  // geometric mean correction
    // Replace: const scale = Math.max(uRange, tRange);
    // With:    const scale = Math.max(uRange, tRange);
    //          (keep uniform normalization as base, then stretch T by tCorrection)
    // addVertex: points.push([(u - uMin) / scale, (t - tBase) / scale * tCorrection]);
    ```
12. Adjust `tBoundsMax` to `Math.max(1.01, tRange / scale * tCorrection + 0.01)`
13. Measure relative to Option A baseline

### Validation Protocol

- [ ] `npx vitest run` — all tests pass
- [ ] Export default 8-petal: violation rate, manifold, maxAspect3D
- [ ] Export spiral-ridge style: verify diagonal chains handled
- [ ] Compare P1-only vs P1+metric side-by-side
- [ ] Verify no visual boundary artifacts at CDT←→quad transitions
- [ ] Export time: < 10% increase from baseline

---

## Summary of Critical Errors in Generator Proposal

1. **`positions3D` not available at CDT time** — the entire P2/P5 implementation sketch is blocked
2. **Metric formula inverted** — T-inflation instead of T-shrinking; CDT cell aspect goes wrong direction
3. **R24.1 comparison incorrect** — claimed "1:5.8 3D aspect" is wrong; 3D aspect is a physical invariant
4. **"3D-isotropic" claim is false** — the formula does not achieve equal CDT distance ≈ equal 3D distance
5. **Root cause correctly identified** — the CDT domain shape problem is real and important

The Generator's root cause analysis and P1 are strong. The metric normalization idea is sound in principle but the implementation details need rework.

---

*Verifier signing off. The math demanded patience here — the 3D metric derivation has a subtle inversion that's easy to miss because "stretch T to account for U being bigger" sounds intuitively correct but is actually backwards. The correct isotropic fix makes the domain worse (18:1), which reveals that "isotropic CDT" and "good CDT triangles" are fundamentally different objectives for boundary-dominated regions. P1 is the safe bet. Metric normalization needs the Generator to rethink the formula direction.*
