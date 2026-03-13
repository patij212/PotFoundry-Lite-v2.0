# Master Approval — R54 Cell Fusion

Date: 2026-03-10

## Decision: APPROVED

## Unanimous Agreement Status

| Agent | Status | Document |
|-------|--------|----------|
| Generator | Proposed cell fusion (Proposal 1) | `generator-round-5-R54-cell-fusion.md` |
| Verifier | ACCEPT WITH AMENDMENTS (C2: threshold 0.35, C4: min-dist guard) | `verifier-round-5-R54-cell-fusion.md` |
| Executioner | FEASIBLE — 40 LOC, no hidden dependencies, two-phase trivial | `executioner-review-R54-cell-fusion.md` |
| Master | **APPROVED** | This document |

## Rationale

### Why This Is the Right Fix

The user was explicit: **chain areas must be absolutely perfectly tessellated.** The narrow-side sliver problem produces the worst quality triangles (aspect ratios up to 7940:1) at the most critical location (directly adjacent to ridge/valley chain edges). This is not a cosmetic issue — it creates staircase artifacts on the features that define the pot's visual identity in 3D printing.

Cell fusion is the correct fix because:

1. **Eliminates the root cause.** The narrow sub-quad exists because a chain vertex is near a cell boundary. Fusion widens the cell, moving the chain vertex away from both boundaries. The narrow sub-quad vanishes entirely.

2. **100% reuse of proven infrastructure.** The R35 super-cell mechanism (merger, emitSuperCell, R37 band-splitting, R53 BPP) handles fused cells unchanged. All 5 assumptions verified by the Verifier against actual code paths with line references.

3. **Minimal code change.** 40 lines — one constant and one detection loop. No tessellation logic changes. No new interfaces. No new code paths for cell emission.

4. **Composes with Axes 1/2.** Cell fusion handles the narrow-side problem. The original R54 axes (U-phantoms for wide sub-quads, T-phantoms for tall bands) remain valid for different quality issues, with reduced scope.

### Quality Gate Verification

| Gate | Status | Evidence |
|------|--------|---------|
| Problem fit | ✅ | Directly eliminates narrow-side chain slivers per user requirement |
| Mathematical correctness | ✅ | Verifier traced all 5 assumptions to specific code lines |
| Codebase grounding | ✅ | Executioner confirmed exact insertion point, all variables in scope |
| Architectural alignment | ✅ | Extends existing R35 pattern — same schema, same merger, same emission |
| Implementation feasibility | ✅ | Executioner: 40 LOC, no hidden dependencies, production code ready |
| Test coverage | ✅ | Existing vitest suite covers super-cell infrastructure; R54 adds no new code paths |
| Regression safety | ✅ | Verifier confirmed R37/BPP/R52 all work correctly with fused cells |
| Performance impact | ✅ | Verifier: ~20µs detection + ~0.05ms redistribution — negligible |

### Amendments Accepted

- **C2 (Verifier)**: Threshold raised to `R54_NEAR_BOUNDARY_FRAC = 0.35`. The Generator's 0.20 let 8:1 slivers escape — unacceptable given user's "absolutely perfect" requirement. At 0.35, worst-case escape is 4.6:1.
- **C4 (Verifier)**: `if (minDist < 1e-10) continue` guard for exact-boundary edge case. Prevents degenerate zero-area triangles from coincident chain/grid vertices.
- **Two-phase implementation** (Verifier Q5, Executioner confirmed): Phase 1 diagnostic-only, Phase 2 enable fusion. Trivial toggle (single comment), validates trigger statistics before changing output.

### Corrected Root Cause (per Verifier C1)

The Generator incorrectly attributed the narrow sub-quad to `mergeFeaturePositions` injecting U columns. The Verifier confirmed this function is only used for T grid construction, not U. The actual root cause: `buildDensityProfile`'s Gaussian floor concentrates the CDF-adaptive U grid near chain vertex positions, creating near-coincident column/chain pairs. Combined with R52's precision lock (no merging), this produces the narrow sub-quad. The fix (cell fusion) is independent of which specific mechanism creates the near-coincident pair.

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Narrow-side slivers at seam edges | Very Low | Seam guard prevents fusion; ~2-4 cells per 420 rows affected |
| Cascading fusion (>3 cols) | Low | Inter-chain spacing (~51 cells) prevents wider cascading; Verifier confirmed max ~3 columns |
| R37/BPP regression | Very Low | Both systems are trigger-agnostic; verified at specific code lines |
| Performance | Negligible | ~20µs scan + ~0.05ms work redistribution |

**Blast radius**: If cell fusion produces unexpected artifacts, it can be disabled by commenting out the single `fusionRequests.push()` line. Rollback is trivial.

## Implementation Order

### Changeset R54-F1a: Diagnostic-Only Detection (Phase 1)

1. Add `R54_NEAR_BOUNDARY_FRAC = 0.35` constant near L196
2. Insert detection loop between L976 and L978 — diagnostic only (log count, don't push to fusionRequests)
3. Validate: `npm run typecheck`, `npm run lint`, `npm test`
4. Export gothic_arches — verify diagnostic log shows ~1,400-1,600 trigger count

### Changeset R54-F1b: Enable Fusion (Phase 2)

1. Uncomment `fusionRequests.push(...)` line
2. Update section 3.8 comment: `(R35)` → `(R35 + R54)`
3. Validate: typecheck, lint, test
4. Export gothic_arches — verify:
   - Super-cell count increased by ~1,200-1,600
   - Narrow-side slivers >8:1 at chain edges eliminated
   - Total triangle count within ±5%
   - No manifold violations
5. Export 3-4 additional styles for visual inspection

### Changeset R54-F2: Axis 1 U-Phantoms (from Round 4, reduced scope)

After F1b is validated, implement U-phantoms for remaining non-fused chain cells with wide sub-quad imbalance.

### Changeset R54-F3: Axis 2 T-Phantoms (from Round 4, reduced scope)

After F2 is validated, implement T-phantoms for remaining cells with tall-band aspect ratio.

### Changeset R54-F4: Quality Diagnostics

Add chain-strip quality gating and aspect ratio distribution logging.

## Notes for Next Agent

- The Executioner has production-quality TypeScript in `executioner-review-R54-cell-fusion.md` — use it as the implementation template
- The detection loop goes between the chain vertex sort loop (L976) and section 3.8 merger (L978)
- Start with Phase 1 (diagnostic-only) to validate trigger statistics
- The `cellKey` recovery (`key % cellsPerRow`, `Math.floor(key / cellsPerRow)`) is verified correct
- R52 locks are completely orthogonal — R54 runs before all phantom/BPP logic
- After F1b, the Round 4 Axes 1/2 become cleanup passes with reduced scope — but they are NOT invalidated
