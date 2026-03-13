# Executioner Review — Round 31: CDT Boundary Transition Fix (Corrected Proposal 2)

Date: 2026-03-07

## Feasibility Assessment

**Verdict: FEASIBLE — implementable as described with minor adjustments.**

The corrected Proposal 2 (boundary column constraints + boundary companion injection at strip assembly time) is sound. All the pieces fit. I've traced every vertex index path, buffer allocation chain, and constraint processing step. Below is the detailed analysis.

---

## File Impact Analysis

**Single file affected**: `OuterWallTessellator.ts`

| Change | Location | Lines Added | Risk |
|--------|----------|-------------|------|
| Vertex buffer slack | Line 919 (allocation) | 2 | None |
| Boundary companion injection | After interiorByBand collection (~L1553), before P5 (~L1644) | ~25 | Low |
| Boundary column constraints | Same location, after companion injection | ~20 | Low |
| Constraint dedup | Within boundary constraint loop | ~5 | None |
| **Total** | | **~52** | **Low** |

No changes to `ChainStripTriangulator.ts` — it already handles:
- Interior vertices with `promotedT` via `addVertex(sv.idx, sv.u, sv.promotedT)` at line 215
- Constraint dedup via `edgeSet` in `addEdge` at line 231
- Left/right boundary constraints via `addEdge(botLeftLocal, topLeftLocal)` at line 258

---

## Deep Analysis of Each Change

### Change 1: Vertex Buffer Slack Pre-allocation

**Current allocation** (line 919):
```typescript
const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount + totalShadowCount) * 3);
```

**Available information at allocation time**:
- `numT`, `numU`, `cellsPerRow = numU - 1`
- `allChainVertices.length` — total chain + companion vertex count
- Strip boundaries (`segStart`/`segEnd`) are NOT known yet — computed in Section 4

**Upper bound estimation**:
- Per segment: 2 boundaries × `(localJTop - localJ)` bands × 1 companion (nTLevels=1)
- Number of segments per window: unknown, but bounded by `cellsPerRow` (unreachable in practice)
- Total bands across all windows = `numT - 1` (each band in exactly one window)
- Practical bound: For a pot with N chain vertices, the number of contiguous segments is ≤ N (each chain vertex column can start at most one segment)

**Proposed formula**: `boundaryCompanionSlack = Math.min(4096, 2 * (numT - 1) * 10)`
- For numT=100: min(4096, 1980) = 1980 vertices = ~23KB. Safe.
- For numT=25: min(4096, 480) = 480 vertices = ~5.7KB. Safe.
- The `×10` factor assumes ≤5 segments per band (generous; typical is 1-3).
- Floor at 4096 prevents extreme cases from allocating GB of slack.

**Index tracking**: After shadow allocation completes, `nextShadowIdx` equals `totalVertexCount + rowBoundaryCvCount + totalShadowCount`. Boundary companions use `nextShadowIdx++` as their vertex index. The variable is in scope (function-level) and is already used as the actual vertex count tracker at line 1943: `const actualVertCount = nextShadowIdx`.

**Runtime overflow guard**: Add a bounds check before each vertex write to catch estimation errors gracefully rather than silently corrupting memory.

### Change 2: Boundary Companion Injection

**Injection point**: After the existing companion collection from `interiorByBand` (~line 1553) and after B-A1/B-A2 rescue blocks, but BEFORE P5 crossing constraint removal and `triangulateChainStrip`.

**For each band `[m, m+1]` in `[localJ, localJTop)`**:
- For each boundary column `bndCol` in `{segStart, segEnd}`:
  - Compute `tMid = (activeTPositions[m] + activeTPositions[m+1]) / 2`
  - Compute inward U-offset:
    - For `segStart`: `companionU = unionU[segStart] + 0.3 * (unionU[segStart+1] - unionU[segStart])`
    - For `segEnd`: `companionU = unionU[segEnd] - 0.3 * (unionU[segEnd] - unionU[segEnd-1])`
  - Dedup via `isDuplicate2D(companionU, tMid, COMPANION_DEDUP_THRESHOLD)` — functions are in scope ✓
  - Write vertex: `vertices[nextShadowIdx * 3 + 0] = companionU`, etc.
  - Push to `stripInteriorVerts` with `{ idx: nextShadowIdx++, u: companionU, promotedT: tMid, isChain: false, gridCol: -1 }`
  - Register in dedup buckets via `addToBuckets(companionU, tMid)`

**Key verifications**:
- `isDuplicate2D` and `addToBuckets` are function-level declarations (lines ~760-790), accessible during strip assembly ✓
- `surfaceId` is in scope (used at line 927) ✓
- `COMPANION_DEDUP_THRESHOLD` is in scope (line 575) ✓
- `nextShadowIdx` is in scope and is the correct next-free-slot counter ✓
- New vertices get unique indices that don't conflict with grid/chain/topDup/shadow indices ✓ (they follow after all shadow indices)

**Edge cases**:
- `segStart + 1 >= segEnd`: The strip is only 1 column wide. Both left and right companions would be at similar U. Dedup handles this — `isDuplicate2D` rejects the second.
- Companion near seam (U≈0 or U≈1): The seam guard in `tryEmitCompanion` doesn't apply here (we're not using that function). Need explicit seam guard: skip if `companionU < 1e-6 || companionU > 1 - 1e-6`.
- Single-band strip (`localJTop - localJ == 1`): Still works — emits 2 companions (one per boundary) at the band midpoint.

### Change 3: Boundary Column Constraints

**Mechanism**: For each band `[m, m+1]` in `[localJ, localJTop)`, add constraint edge `[m * numU + bndCol, (m+1) * numU + bndCol]` to `segConstraints`.

**Vertex existence verification**:
- `localJ * numU + segStart` = `botLeftIdx` → in `stripBot` ✓ (line 1397)
- `(localJ+k) * numU + segStart` for `0 < k < localJTop-localJ` → in `stripInteriorVerts` via midRows filter (line 1462-1472: `col === segStart` passes the filter) ✓
- `localJTop * numU + segStart` = `topLeftIdx` → in `stripTop` ✓ (line 1424-1426)
- Same analysis holds for `segEnd` column ✓

**CDT2d handling** (Verifier C3):
- Boundary column constraints at segStart map to normalized U=0 (they're on the convex hull minimum U)
- CDT2d's monotone sweep skips vertical edges (`a[0] === b[0]` — neither branch at monotone.js:161-171 fires)
- BUT: consecutive convex hull vertices at U=0 are naturally connected by the sweep
- AND: constraint tracking via `isConstraint()` prevents Delaunay flips of these edges
- **Net effect**: constraints work de facto via hull preservation + flip prevention. Acceptable.

**P5 interaction**:
- Boundary column constraints use raw UV coordinates from the vertex buffer for crossing checks
- Boundary constraints are at U = `unionU[segStart]` (far left of strip) or U = `unionU[segEnd]` (far right)
- Chain constraints are between interior chain vertices at `U > unionU[segStart]` and `U < unionU[segEnd]`
- A chain constraint cannot cross a boundary constraint without extending outside the strip → **geometrically impossible**
- Two boundary constraints at the same column are collinear (same U) → `segmentsCross` returns `false` (cross products = 0, strict inequality test fails)
- Boundary constraints at different columns (segStart vs segEnd) are parallel vertical lines → no crossing

**Conclusion**: P5 handles boundary constraints correctly. Zero risk of legitimate constraints being removed. ✓

### Change 4: Constraint Dedup

**Risk**: Can a boundary column constraint duplicate an existing chain constraint?

Chain constraints are between chain vertex indices (`≥ gridVertexCount`). Boundary column constraints are between grid vertex indices (`m * numU + segStart`, which is `< gridVertexCount`). **No overlap in the common case.**

**Exception**: Batch2 remapping (`batch2Remap`) can remap chain vertex indices to grid vertex indices when they coincide. After remapping, a chain constraint `[v0, v1]` could have both endpoints be grid indices. If a chain runs exactly along a boundary column (chain vertex at `(m, segStart)` and `(m+1, segStart)` with exact UV coincidence), the remapped chain constraint would match a boundary column constraint.

**Solution**: Before adding each boundary constraint, check if it already exists in `segConstraints`. Use a `Set<string>` with sorted keys. This is O(1) per check and handles both chain-constraint overlap and self-dedup (multiple chains at same boundary).

Note: `ChainStripTriangulator.addEdge` also deduplicates via `edgeSet`, so even if a duplicate slips through OWT, it won't cause a CDT assertion failure. Belt and suspenders.

---

## Risk Zones

| Risk | Severity | Mitigation |
|------|----------|------------|
| Vertex buffer overflow | HIGH if slack estimate too low | Runtime bounds check + generous slack formula |
| Boundary companion too close to existing vertex | LOW | `isDuplicate2D` dedup with existing bucket system |
| Boundary companion at seam | LOW | Explicit seam guard check |
| CDT assertion from duplicate edge | NONE | Dedup in OWT + dedup in CST's `addEdge` |
| P5 removes boundary constraint | NONE | Geometrically impossible for valid meshes |
| CDT2d ignores vertical constraint | MODERATE-LOW | Hull mechanism provides equivalent guarantee |
| Performance regression from extra vertices/constraints | NEGLIGIBLE | ≤20 extra vertices per strip segment |

---

## Unstated Dependencies

1. **`isDuplicate2D` and `addToBuckets` remain in scope**: These are function-level declarations. No block scoping issues. ✓ verified.

2. **`nextShadowIdx` is stable after shadow allocation**: Shadow allocation completes before strip assembly begins (Section 2 vs Section 4). After line 967, `nextShadowIdx` is only read at line 1943 for final trim. We can safely increment it during strip assembly. ✓ verified.

3. **`surfaceId` is available**: It's a function parameter or early local. Used at line 927. ✓ verified.

4. **Vertex buffer trim at line 1943 uses `nextShadowIdx`**: Since we increment `nextShadowIdx` for boundary companions, the final trim will correctly include them. ✓ this is exactly right — the trim at `actualVertCount = nextShadowIdx` will capture all boundary companion vertices.

5. **Batch 6 global dedup at line 1806+**: The dedup loop iterates `v < totalVerts` where `totalVerts = totalVertexCount`. Boundary companion indices are `≥ totalVertexCount + rowBoundaryCvCount + totalShadowCount`, so they're EXCLUDED from Batch 6 dedup. This is correct — we don't want boundary companions merged with grid vertices in the global pass. Their dedup is handled locally via `isDuplicate2D`.

---

## Implementation Sequence

1. **Change 1**: Add `boundaryCompanionSlack` to vertex buffer allocation (2 lines, zero risk)
2. **Change 3**: Add boundary column constraints (after segConstraints assembly, before P5)
3. **Change 4**: Add constraint dedup check (within boundary constraint loop)
4. **Change 2**: Add boundary companion injection (after companion collection, before P5)
5. **Validate**: Run `npx vitest run` — all 131 tests must pass
6. **Validate**: Run `npm run typecheck` — no errors
7. **Inspect**: Export a pot style with visible chains (e.g., helical, Gothic) — check boundary zone quality visually

---

## Exact Code Changes

### Change 1: Vertex buffer slack

**File**: `OuterWallTessellator.ts` ~line 917-919

**Old code**:
```typescript
    // ── 2. Generate vertices: grid + chain vertices + companions ──
    const totalVertexCount = gridVertexCount + allChainVertices.length;
    const rowBoundaryCvCount = allChainVertices.filter(cv => cv.t === undefined).length;
    const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount + totalShadowCount) * 3);
```

**New code**:
```typescript
    // ── 2. Generate vertices: grid + chain vertices + companions ──
    const totalVertexCount = gridVertexCount + allChainVertices.length;
    const rowBoundaryCvCount = allChainVertices.filter(cv => cv.t === undefined).length;
    // Boundary companion slack: injected at strip assembly time near segStart/segEnd columns.
    // Upper bound: 2 boundaries × totalBands × ~10 segments, capped at 4096.
    const boundaryCompanionSlack = Math.min(4096, 2 * Math.max(1, numT - 1) * 10);
    const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount + totalShadowCount + boundaryCompanionSlack) * 3);
```

### Change 2: Boundary companion injection

**File**: `OuterWallTessellator.ts`

Insert AFTER the existing companion collection from `interiorByBand` (the `for (let b = localJ; b < localJTop; b++)` loop at ~line 1546-1553), AFTER the B-A1 and B-A2 rescue blocks, AFTER the `botModified`/`topModified` sort (line 1637-1638), and BEFORE P5 crossing constraint removal (line 1644).

**Insertion point** — after the line:
```typescript
                if (botModified) stripBot.sort((a, b) => a.u - b.u);
                if (topModified) stripTop.sort((a, b) => a.u - b.u);
```

**New code to insert**:
```typescript
                // ── Boundary companion injection (Round 31) ──
                // Inject Steiner points near segStart/segEnd columns to fill the
                // "companion desert" between boundary grid vertices and interior
                // chain companions. One companion per boundary per band at T-midpoint.
                const vertexBufCapacity = vertices.length / 3;
                for (let b = localJ; b < localJTop; b++) {
                    const tLo = activeTPositions[b];
                    const tHi = activeTPositions[b + 1];
                    const tMid = (tLo + tHi) / 2;
                    if (tHi - tLo < MIN_TGAP_FOR_COMPANIONS) continue;
                    for (const bndCol of [segStart, segEnd] as const) {
                        // Compute inward U-offset (30% of adjacent column gap)
                        let companionU: number;
                        if (bndCol === segStart && segStart + 1 < numU) {
                            companionU = unionU[segStart] + 0.3 * (unionU[segStart + 1] - unionU[segStart]);
                        } else if (bndCol === segEnd && segEnd - 1 >= 0) {
                            companionU = unionU[segEnd] - 0.3 * (unionU[segEnd] - unionU[segEnd - 1]);
                        } else {
                            continue;
                        }
                        // Seam guard
                        if (companionU < SEAM_COMPANION_GUARD || companionU > 1 - SEAM_COMPANION_GUARD) continue;
                        // Strip bounds guard
                        if (companionU < uStripLeft + 1e-9 || companionU > uStripRight - 1e-9) continue;
                        // Dedup against existing companions and chain vertices
                        if (isDuplicate2D(companionU, tMid, COMPANION_DEDUP_THRESHOLD)) continue;
                        // Buffer overflow guard
                        if (nextShadowIdx >= vertexBufCapacity) {
                            console.warn('[CDT] Boundary companion buffer overflow — skipping');
                            break;
                        }
                        const bcIdx = nextShadowIdx++;
                        vertices[bcIdx * 3 + 0] = companionU;
                        vertices[bcIdx * 3 + 1] = tMid;
                        vertices[bcIdx * 3 + 2] = surfaceId;
                        addToBuckets(companionU, tMid);
                        stripInteriorVerts.push({
                            idx: bcIdx, u: companionU, isChain: false,
                            gridCol: -1, promotedT: tMid,
                        });
                    }
                }
```

### Change 3 + 4: Boundary column constraints with dedup

**File**: `OuterWallTessellator.ts`

Insert AFTER the boundary companion injection (Change 2) and BEFORE P5 crossing constraint removal.

**New code to insert** (immediately after Change 2's block):
```typescript
                // ── Boundary column constraints (Round 31) ──
                // Add vertical constraint edges at segStart/segEnd columns between
                // consecutive grid vertices. Prevents Delaunay flips that create
                // cross-band slivers at strip boundaries.
                const existingConstraintKeys = new Set<string>();
                for (const [c0, c1] of segConstraints) {
                    const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
                    existingConstraintKeys.add(`${lo}:${hi}`);
                }
                for (let m = localJ; m < localJTop; m++) {
                    for (const bndCol of [segStart, segEnd]) {
                        const vBot = m * numU + bndCol;
                        const vTop = (m + 1) * numU + bndCol;
                        const lo = Math.min(vBot, vTop), hi = Math.max(vBot, vTop);
                        const key = `${lo}:${hi}`;
                        if (existingConstraintKeys.has(key)) continue;
                        existingConstraintKeys.add(key);
                        segConstraints.push([vBot, vTop]);
                    }
                }
```

---

## Questions for Generator/Verifier

1. **Companion U-offset 0.3 × colGap**: The Verifier suggested 0.3, which keeps companions close to the boundary but not ON it. Should this be configurable or is 0.3 the right fixed value? For very wide columns (low U-resolution), 0.3 might place companions too far from the boundary; for narrow columns, it's fine.

2. **nTLevels=1 vs 3**: The user specified nTLevels=1 (single midpoint). The Verifier's Amendment A mentioned T-levels at 0.25, 0.5, 0.75 (nTLevels=3). I've implemented nTLevels=1 per the user's spec. If boundary quality is insufficient with 1, escalation to 3 is trivial (change `tMid` to a loop over fractions).

3. **Constraint mechanism**: Per Verifier C3, these constraints work through convex hull preservation + flip prevention, NOT through CDT2d's direct edge enforcement (vertical edges are skipped by the monotone sweep). This is acceptable for our use case but worth documenting. If we ever add interior vertices that push the boundary vertices off the hull, these constraints would lose their implicit enforcement.

---

## Test Impact

**No existing test modifications needed.** The changes add new vertices and constraints but don't remove or modify existing ones. The CDT output will change (better triangles at boundaries), which could affect triangle count assertions if any tests check exact counts. However:

- Current tests verify mesh topology (watertightness, manifold), not exact triangle counts
- Companion dedup ensures the changes are deterministic
- The CDT produces valid triangulations regardless of companion count

**Recommended new test**: A unit test verifying that boundary companions are injected when a chain strip has `segStart`/`segEnd` boundaries. Test that `stripInteriorVerts` contains vertices near `unionU[segStart]` and `unionU[segEnd]` with T-positions between row boundaries.

---

## Surprises / Feedback for Generator & Verifier

1. **Batch 6 dedup scope**: Batch 6 iterates `v < totalVertexCount`, which excludes topDup, shadow, and boundary companion indices. This is correct by accident — boundary companions don't need global dedup because they're locally deduped. But the Generator should be aware that boundary companion vertices live in a "post-totalVertexCount" index range alongside topDup and shadow vertices.

2. **The vertex index counter is `nextShadowIdx`**: Despite the name, this counter tracks ALL post-allocation vertex slots (topDup → shadow → boundary companions). The name is misleading. A rename to `nextFreeVertexIdx` would improve clarity but is out of scope.

3. **Amendment B (U-offset on constraints) is inadvisable**: The Verifier suggested `+1e-8` U-offset on constraint vertices in normalized CDT coordinates. This would require modifying vertex positions in the CDT, which would move boundary vertices off the convex hull and potentially create worse geometry. The convex hull mechanism provides equivalent guarantees without this risk.

---

*Signature: Executioner Agent — 2026-03-07*
