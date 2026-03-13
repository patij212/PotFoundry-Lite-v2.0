# Master Approval — Round 8: Catmull-Rom Subdivision + Debug Instrumentation

Date: 2026-01-28

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- **Generator**: Proposed P2 (Catmull-Rom subdivision) — accepted by all parties
- **Verifier**: Accepted P2 with amendments (no extra SG, insert before companions, explicit t). Proposed VP2 (instrumentation first)
- **Executioner**: Feasible with 3 corrections (insertion point, interiorByBand, constraint endpoint routing)
- **Master**: APPROVED — incorporating all Verifier amendments and Executioner corrections

## Rationale

### Problem 1 (Jagged polylines): Catmull-Rom subdivision is the correct fix.
The existing chain edges are piecewise-linear connections between detected feature points (one per row). Even after 2-pass Savitzky-Golay smoothing, the connection between well-detected points produces visible zigzag because the underlying mathematical features follow smooth curves, not line segments. Catmull-Rom subdivision inserts 2 intermediate points per edge with C¹ continuity, solving the zigzag without needing any additional filtering passes.

The Verifier correctly identified that `maxConsecDelta ≈ 0.003378` is dominated by trajectory slope (~1/313), not residual noise. Additional SG passes would be harmful. This insight eliminated the Generator's P3 and P4 proposals.

### Problem 2 (Horizontal line artifacts): Instrumentation first, fix second.
The Verifier mathematically disproved the seam-crossing hypothesis — the debug shader maps each UV vertex independently via `surface_point()`, so seam-crossing segments produce short chords, not horizontal lines. The actual root cause remains undiagnosed. Implementing instrumentation to count dropped chain points and large Δu jumps will reveal the true cause.

## Conditions

### The Executioner's three corrections are MANDATORY:

**C1 — Insertion Point**: Subdivision must happen INSIDE the per-chain loop, after `fullChain` construction (~L400) but BEFORE edge recording (~L404). NOT after the loop. Reason: Catmull-Rom needs per-chain sequential context (4 control points), which `chainEdges` (a flat index-pair array) doesn't carry.

**C2 — `interiorByBand` Fix**: Change L611 to iterate `allChainVertices` instead of only `companionVertices`. Without this, subdivision vertices are orphaned — they exist in the vertex buffer but never enter CDT. This would cause silent constraint failure.

**C3 — Constraint Endpoint Routing**: Update the "fix missing constraint endpoints" code (L1043-1063) to handle subdivision vertices with `cv.t !== undefined`. Route them to `stripInteriorVerts`, not `stripBot`/`stripTop`. They are between rows, not on row boundaries.

### Additional condition: Seam-wrapping guard
CatRom near the seam may produce UV wrapping artifacts (control points at u=0.95,0.98,0.02,0.05 → CatRom midpoint at u≈0.5). The `subdivideFullChain()` function must clamp/wrap CatRom output to `[0, 1-ε]`.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| CatRom overshoot causes new crossings | Low | Existing crossing filter handles it; subdivision edges have lower confidence scores and are preferentially removed |
| Orphaned subdivision vertices | High (if C2 missed) | C2 fix is mandatory. Verify with test: all subdivision vertex indices appear in CDT output |
| Performance impact from 3× chain edges | Low | ~10K additional FP ops; crossing filter is O(n²) per strip but strip density stays ≤5 constraints |
| Seam-wrapping artifacts | Medium | Clamp/wrap guard in subdivideFullChain() |
| Rollback plan | Single function removal + revert 3 line changes. Clean rollback. |

## Implementation Order

Per Executioner's recommended sequence:

### Changeset 1: Debug Instrumentation (Phase 2)
- Add counters to PEC debug line construction
- ~10 lines, zero risk, provides diagnostic baseline

### Changeset 2a: `subdivideFullChain()` pure function
- New function, unit-testable in isolation
- Input: fullChain + activeTPositions + nextVertexIdx counter
- Output: subdivided chain + new vertices

### Changeset 2b: Integration into chain loop
- Call after fullChain construction, before edge recording
- Push new vertices, replace fullChain

### Changeset 2c: `interiorByBand` fix (CRITICAL)
- Iterate `allChainVertices` not just `companionVertices`

### Changeset 2d: Constraint endpoint routing fix (CRITICAL)
- Route `cv.t !== undefined` vertices to `stripInteriorVerts`

### Changeset 2e: Validation
- Run tests, verify chain edge 3× increase, check enforcement rate

## Answers to Executioner's Questions

1. **Insertion point override**: Concur with Executioner. The plan's insertion point was a design-level specification that didn't account for scope/context requirements. Inside the loop is correct.

2. **Subdivision count**: 2 intermediate points per edge (τ=0.5 standard Catmull-Rom) is correct. Do NOT expose as a config parameter — this is an internal implementation detail, not a user-facing control. YAGNI.

3. **SG interaction**: CatRom runs on post-SG data (SG runs upstream in ChainLinker). This is correct — we subdivide already-smoothed paths, producing smooth C¹ curves through well-positioned control points. No ordering change needed.
