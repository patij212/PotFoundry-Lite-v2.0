# Master Approval — R53 Phase 2: Chain-Cell T-Junction Elimination

Date: 2026-03-10

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- Generator: proposed Full Sub-Band Decomposition (`emitChainSplitCell`) — Round 2
- Verifier: ACCEPTED WITH AMENDMENTS (1 CRITICAL, 2 MAJOR, 3 MINOR, 4 clean accepts)
- Executioner: pending dispatch
- Master: APPROVED — amendments are implementation details, not architectural issues

## Rationale

The sub-band decomposition approach is architecturally correct and follows PotFoundry's established R37 band-splitting pattern. It solves the fundamental problem: chain cells have two orthogonal sets of extra vertices (chain verts on horizontal edges, phantom verts on vertical edges), and neither a purely horizontal nor purely vertical sweep handles both. Sub-band decomposition at phantom T-values creates clean horizontal boundaries where both vertex types can coexist.

The Verifier confirmed:
- All 5 Generator assumptions hold
- Chain edge endpoint matching works in all 3 sub-band positions
- No cross-column edges can exist in adjacent non-super-cell chain cells
- A4 pre-splitting doesn't affect `cellChainMap` copies
- Shared vertices between super-cell and adjacent chain cell produce watertight boundaries
- R52 precision locks and R41 fan diagonal tracking are preserved

## Conditions (Mandatory)

### C1: Update `phantomVertexCount` after dispatch loop (CRITICAL)
After the main dispatch loop and BEFORE Batch 6 dedup, add:
```typescript
phantomVertexCount = nextPhantomIdx - phantomVertexStart;
```
Without this, Phase 2 phantom vertices are truncated from the output buffer.

### C2: Overflow guard on phantom allocation (MAJOR)
Every `nextPhantomIdx++` in `emitChainSplitCell` must check:
```typescript
if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
    console.warn('[CDT] R53 Phase 2: phantom slot overflow');
    emitChainCell(band, col, info);
    return;
}
```

### C3: Epsilon-based T-value lookup (MAJOR)
Replace `phantomTs.indexOf(tCross)` with:
```typescript
phantomTs.findIndex(t => Math.abs(t - tCross) < 1e-10)
```

## Risk Assessment

**Blast radius**: Low. All changes are additive — new function `emitChainSplitCell`, new dispatch branch, removal of the skip filter. No existing functions are modified. Graceful fallback to `emitChainCell` on overflow.

**Regression risk**: Low. Phase 1 BPP standard-cell behavior unchanged. Super-cell emission unchanged. Chain cells without phantom info still use `emitChainCell`.

**Rollback plan**: Re-add `!cellChainMap.has(adjKey)` filter at L1413/L1443, remove dispatch branch. Single-commit revert.

## Implementation Order

1. Remove `!cellChainMap.has(adjKey)` from L1413 and L1443 (allow chain cells into `phantomBoundaryMap`)
2. Implement `emitChainSplitCell` (~60-80 lines) after `emitChainCell`, with all 3 amendments
3. Add dispatch branch in the main loop: chain cells check `phantomBoundaryMap` before falling through to `emitChainCell`
4. Update `phantomVertexCount` after dispatch loop (C1)
5. Validate: `npm run typecheck && npm run lint && npm test`
