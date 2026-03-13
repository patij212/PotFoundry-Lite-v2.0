# Master Approval — R47 Topology-Based Dip/Wavy Fix
Date: 2026-03-09

## Decision: APPROVED — Proposals 1 + 3 (Phase A+B combined)

## Unanimous Agreement Status
- Generator: Proposed 5 options (P1-P5), recommended P1+P3 first
- Verifier: ACCEPT WITH AMENDMENTS (P1, P2, P3); REJECT (P4); DEFER (P5)
- Master: APPROVED P1+P3 for immediate implementation; P2 deferred to next round if needed

## Rationale

After three rounds of vertex-position fixes (R46 Phases 1-3), all working correctly, dips persist AND a new "wavy" artifact appeared on sharp features. The Generator correctly identified this as a MESH TOPOLOGY problem, not a vertex-position problem:

1. **Persistent dips**: Caused by 37.1% sliver triangles in chain strips (fan diagonal topology when chain vertices sit between grid columns)
2. **Wavy sharp edges**: Caused by Phase 2 re-snap sampling noise (~±0.00015 on large gaps) comparable to sharp features' natural U variation, combined with 2118 quality-improving CSO flips being blanket-blocked

The Verifier confirmed the critical safety assumption: fan diagonal edges ARE independently protected in `constraintEdgeSet` (line 586 check runs before line 643). The blanket `isChainGridEdge` skip only catches non-fan, non-chain interior edges. Releasing quality-improving flips for these edges is safe with a quality gate.

## What Gets Implemented

### Proposal 1: Selective CSO Chain-Grid Flip (with diagnostics)
- Replace blanket `isChainGridEdge` skip with quality-gated filter
- Threshold: 0.20 rad (conservative start, per Verifier A3)
- Add `chainGridFlipsAllowed` counter + quality gain histogram logging
- Apply identically to all 3 CSO phases (A/B/C)
- Simplified implementation per Verifier C2 (redundant guards already applied upstream)

### Proposal 3: Neighbor-Constrained Re-snap Smoothing
- Add Phase 2b post-pass after Phase 2a re-snap
- Adaptive α per vertex: `min(0.6, iv.gapSize × 0.15)` (Verifier C5 CRITICAL)
- Skip when gapSize < 2 (per-vertex α < 0.3 → negligible effect, skip to save work)
- Add logging: `R47 interp smooth: N vertices, avg α=X, max α=Y`
- For each chain, identify primary (non-interpolated) and interpolated vertices; blend interpolated toward linear interpolation between primaries

## Conditions
1. Diagnostic histogram for P1 quality gains must be in the log output
2. Adaptive α for P3 — NOT fixed α (Verifier C5 CRITICAL)
3. All 3 CSO phases updated identically for P1
4. Test validation: typecheck, lint, 88 test files pass

## Risk Assessment
- **P1**: Low risk — fan diags protected by constraintEdgeSet; batch2Remap cells prove free flips are safe
- **P3**: Low risk — pure post-processing, zero GPU cost; adaptive α prevents over-smoothing
- **Blast radius**: Both changes are isolated to CSO and PEC; no architectural impact
- **Rollback**: Both changes are easily reversible (restore blanket skip for P1, remove Phase 2b for P3)

## Implementation Order
1. P3 first (simpler, lower risk, directly addresses user's "wavy" complaint)
2. P1 second (requires changes in 3 CSO phases + diagnostic logging)
3. Both in one implementation pass (no dependency between them)

## Deferred
- P2 (fan midpoint insertion): Next round if dips persist after P1+P3
- P4 (column densification): REJECTED — cascading architectural risk
- P5 (dual chains): DEFERRED — coupling risk too high
