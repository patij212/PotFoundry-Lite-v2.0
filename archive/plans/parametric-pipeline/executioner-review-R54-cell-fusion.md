# Executioner Review — R54 Cell Fusion

Date: 2026-03-10

## Verdict: FEASIBLE

Clean, minimal changeset. 100% reuse of proven R35 super-cell infrastructure. All variables in scope. No interaction with R52 locks. Two-phase approach is trivial and recommended.

---

## 1. Exact Insertion Point

**File**: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`

**Insert AFTER** line 978 (closing `}` of the chain vertex sort loop — end of section 3.7):
```typescript
    for (const [, info] of cellChainMap) {
        info.botChainVerts.sort((a, b) => vertices[a * 3] - vertices[b * 3]);
        info.topChainVerts.sort((a, b) => vertices[a * 3] - vertices[b * 3]);
    }
    // ← INSERT R54 DETECTION LOOP HERE
    // ── 3.8. Merge fusion requests into super-cells (R35) ──
```

**Insert BEFORE** line 981 (`// ── 3.8. Merge fusion requests ...`).

### Variables in scope at insertion point — CONFIRMED ✓

| Variable | Type | Access | Declared at |
|----------|------|--------|-------------|
| `cellChainMap` | `Map<number, CellChainInfo>` | Read | L851 |
| `unionU` | `Float32Array \| number[]` | Read | Function param |
| `fusionRequests` | `SuperCell[]` | Read/Write | L916 |
| `cellsPerRow` | `number` | Read | L765 |
| `vertices` | `Float32Array` | Read | L775 |
| `cellKey` | `(band, col) => number` | Call | L852 |
| `SEAM_GUARD` | `number` (0.3) | Read | L196 |
| `numU` | `number` | Read | L753 |

All required variables are local to `buildCDTOuterWall` and in scope. No imports needed.

---

## 2. Production-Quality Detection Code

### Constant (add near other constants, ~L196)

```typescript
/**
 * R54: Fraction of cell width below which a chain vertex triggers
 * fusion with the neighboring cell to eliminate narrow-side slivers.
 * At 0.35 the worst-case escape aspect ratio is ~4.6:1 (acceptable).
 */
const R54_NEAR_BOUNDARY_FRAC = 0.35;
```

### Detection Loop (~35 lines, insert between L978 and L981)

```typescript
    // ── R54: Near-boundary cell fusion ──
    // Chain vertices very close to a cell boundary create narrow sub-quads
    // with catastrophic aspect ratios (12:1+) at the most critical location
    // (directly adjacent to ridge/valley chain edges). Detect these and
    // generate fusion requests so the cell merges with its neighbor,
    // eliminating the narrow sub-quad. Reuses R35 super-cell infrastructure.
    let r54FusionCount = 0;
    for (const [key, info] of cellChainMap) {
        const band = Math.floor(key / cellsPerRow);
        const col = key % cellsPerRow;
        const uLeft = unionU[col];
        const uRight = unionU[col + 1];
        const cellWidth = uRight - uLeft;
        if (cellWidth <= 0 || cellWidth > SEAM_GUARD) continue; // skip seam cells

        const allChainVerts = [...info.botChainVerts, ...info.topChainVerts];
        for (const cvIdx of allChainVerts) {
            const uChain = vertices[cvIdx * 3];
            const distToLeft = uChain - uLeft;
            const distToRight = uRight - uChain;
            const minDist = Math.min(distToLeft, distToRight);

            // Exact-boundary: handled by R35 cross-column detection
            if (minDist < 1e-10) continue;

            if (minDist / cellWidth < R54_NEAR_BOUNDARY_FRAC) {
                const neighborCol = distToLeft < distToRight ? col - 1 : col + 1;

                // Guard: neighbor must exist
                if (neighborCol < 0 || neighborCol >= cellsPerRow) continue;

                // Guard: neighbor must not be a seam cell
                const neighborWidth = unionU[neighborCol + 1] - unionU[neighborCol];
                if (neighborWidth > SEAM_GUARD || neighborWidth < -SEAM_GUARD) continue;

                fusionRequests.push({
                    band,
                    colStart: Math.min(col, neighborCol),
                    colEnd: Math.max(col, neighborCol),
                });
                r54FusionCount++;
                break; // one fusion per cell is sufficient
            }
        }
    }
    if (r54FusionCount > 0) {
        console.log(`[CDT] R54: ${r54FusionCount} near-boundary fusions from ${cellChainMap.size} chain cells (threshold=${R54_NEAR_BOUNDARY_FRAC})`);
    }
```

### Design Decisions in the Code

**N1: `break` after first fusion per cell.** A cell only needs to fuse once — fusing left or right both eliminate the narrow sub-quad. Without the `break`, a cell with bot AND top chain vertices both near the same boundary would generate duplicate fusion requests. The merger handles duplicates correctly, but generating them is wasteful. One fusion per cell is semantically correct and avoids noise in diagnostics.

**N2: `key % cellsPerRow` for column recovery.** The `cellKey` function encodes `band * cellsPerRow + col`. Recovering `col` via modulo is exact because `cellsPerRow` is a positive integer and both `band` and `col` are non-negative integers less than their respective counts. No floating-point involved.

**N3: `cellWidth > SEAM_GUARD` check on the current cell.** The existing code at L1015–1027 applies seam guards AFTER merger. But R54 should avoid generating requests for seam cells in the first place — a seam-spanning cell has `uRight - uLeft` near 1.0, and `distToLeft`/`distToRight` would be meaningless. This early-out is cheap and correct.

**N4: `allChainVerts` concatenation.** Building a temporary array of bot+top verts per cell looks wasteful but is O(2–4 elements) per chain cell. The alternative (two identical loops) saves allocation but doubles code. Given ~5,000 cells × ~3 verts each = ~15K iterations either way, the allocation cost is negligible (~0.1ms).

**N5: No `Set` dedup on `allChainVerts`.** A vertex index might appear in BOTH `botChainVerts` and `topChainVerts` for a cell — this is impossible. `botChainVerts` are vertices at `cv.rowIdx == band` (bottom of band) and `topChainVerts` are at `cv.rowIdx == band` (top of previous band = bottom of this one). Wait — actually let me re-examine. At L901–910: a vertex with `cv.rowIdx > 0` is added to `topChainVerts` of cell `(cv.rowIdx - 1, gc)`, and with `cv.rowIdx < numT - 1` is added to `botChainVerts` of cell `(cv.rowIdx, gc)`. So for a given cell key, `botChainVerts` contains vertices at `row == band` and `topChainVerts` contains vertices at `row == band + 1`. No overlap possible. No dedup needed. ✓

---

## 3. Two-Phase Assessment

### Phase 1 (Diagnostic-Only): RECOMMENDED — trivial toggle

To make Phase 1 diagnostic-only, replace:
```typescript
                fusionRequests.push({ ... });
                r54FusionCount++;
                break;
```
with:
```typescript
                r54FusionCount++;
                // Phase 1: diagnostic only — uncomment next line to enable fusion
                // fusionRequests.push({ band, colStart: Math.min(col, neighborCol), colEnd: Math.max(col, neighborCol) });
                break;
```

The toggle is a single comment/uncomment. Phase 1 produces the `r54FusionCount` diagnostic log without changing any tessellation output.

**Is it worth it?** Yes. Phase 1 validates that the threshold catches the right number of cells (expected ~1,400–1,600 at 0.35) and that the detection loop doesn't throw. Since the loop is purely additive (only writes to `fusionRequests`), Phase 1 is effectively a no-op test that confirms the scan logic before enabling the tessellation change.

---

## 4. Line-of-Code Estimate

- **Constant declaration**: 5 lines (with JSDoc)
- **Detection loop**: 35 lines (including comments, guards, diagnostic log)
- **Total**: ~40 lines

The Generator estimated ~30 lines. Revised to **~40 lines** including the comment block header, the `break` optimization, the current-cell seam guard (not in original pseudo-code), and the diagnostic log.

---

## 5. R52 Lock Interaction — NO CONFLICT ✓

The 4 R52 lock blocks in OuterWallTessellator.ts:

| # | Location | What it protects | R54 touches it? |
|---|----------|-----------------|-----------------|
| 1 | L809–815 | `batch2Remap` disabled | No — R54 reads `vertices` and `unionU`, never `batch2Remap` |
| 2 | L1076–1083 | `phantomChainAnchorSet` type separation | No — R54 runs at L978, before phantom creation at L1083 |
| 3 | L1091–1099 | Chain anchor vs column boundary dedup in R37 | No — R54 doesn't create phantom vertices |
| 4 | L1317–1318 | `bestV` chain-anchor-only lookup in BPP | No — R54 doesn't modify BPP logic |

**R54 is a READ-ONLY scan of `cellChainMap` + `vertices` + `unionU`, with WRITE only to `fusionRequests` (an existing mutable array).** It runs before any R52-locked phantom/BPP logic. Zero interaction. The R52 precision guarantee (chain/grid NEVER merge) is fully preserved — R54 fuses CELLS, not vertices.

---

## 6. File Impact Analysis

| File | Change | Lines |
|------|--------|-------|
| `OuterWallTessellator.ts` | Add `R54_NEAR_BOUNDARY_FRAC` constant (~L196) | +5 |
| `OuterWallTessellator.ts` | Insert detection loop (between L978 and L981) | +35 |
| **Total** | | **+40** |

No other files affected. No test changes required (existing tests should pass — the change only adds fusion requests that feed into proven infrastructure).

---

## 7. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Exact-boundary zero-area triangle | Very Low | `minDist < 1e-10` guard |
| Seam-adjacent slivers persist | Very Low | Documented limitation; seam guard prevents manifold violations |
| Cascading fusion (>3 columns) | Low | Single-chain drift per band is ~0.0003 U; max practical super-cell = 3 columns |
| Performance regression | Very Low | ~20µs detection + ~0.05ms extra super-cell work |
| Duplicate fusion requests | None | `break` after first fusion per cell; merger handles overlap anyway |
| Wrong column recovery from cellKey | None | Integer arithmetic, `cellsPerRow > 0` guaranteed |
| R37/BPP regression | Very Low | Verified: both iterate merged super-cells agnostically |

---

## 8. Implementation Notes

**N6: Test with gothic_arches first.** This style has the most pronounced ridges and will show the most dramatic improvement. Export before/after and compare narrow-side aspect ratio distribution.

**N7: Diagnostic log format.** The `[CDT] R54:` prefix matches the existing `[CDT] R35 cell-local:` log line at L1901, maintaining console grep-ability.

**N8: Future enhancement path.** If the fixed 0.35 threshold produces too many fusions in bands with small `bandHeight` (where even wide slivers have acceptable aspect ratios), the Verifier's Q6 adaptive threshold (`narrowWidth / bandHeight < R54_MIN_NARROW_ASPECT`) can replace the fraction-based trigger. This is a 3-line change inside the `if` condition.

**N9: Section comment update.** After enabling Phase 2, update the section 3.8 comment from `// ── 3.8. Merge fusion requests into super-cells (R35) ──` to `// ── 3.8. Merge fusion requests into super-cells (R35 + R54) ──` for clarity.

---

## 9. Implementation Sequence

1. Add `R54_NEAR_BOUNDARY_FRAC` constant at ~L196
2. Insert detection loop between L978 and L981 (Phase 1: diagnostic only)
3. Run `npm run typecheck`, `npm run lint`, `npm test`
4. Export gothic_arches, verify diagnostic log shows expected count (~1,400–1,600)
5. Enable Phase 2: uncomment `fusionRequests.push(...)` line
6. Re-run validation suite
7. Export 3–4 styles, visually inspect chain ridge quality
8. Update section 3.8 comment to include R54

---

## 10. Questions for Generator/Verifier

None. The converged plan is fully implementable as specified with the Verifier's amendments (C2: threshold 0.35, C4: min-distance guard). No hidden dependencies, no unstated assumptions, no architectural concerns.
