# Master Approval — Round 19: U-Graded Companion Fan for Chain Strip Density

Date: 2026-03-05

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- **Generator**: Proposed P5 Hybrid (expansion=4, density=8, 5-shell quadratic fan, alpha=2.0)
- **Verifier**: ACCEPT WITH AMENDMENTS — C1 (constraint guard kills shells 0-1, fix: start at fraction≥0.2), C2 (strip boundary estimation must use actual `unionU`)
- **Executioner**: Pending (combined feasibility + implementation dispatch)
- **Master**: APPROVED — with Verifier amendments incorporated plus Master decisions on open questions

## Rationale

The root cause is correctly diagnosed: the T-Ladder provides T-density only, with zero U-density grading between chain edges and strip boundaries. CDT connects boundary grid columns directly to promoted chain vertices, inheriting the grid column spacing pattern into the triangulation. With expansion=1 (3 columns) this produces a visible grid-aligned mesh structure.

The U-Graded Fan fills this void with concentric shells of Steiner points radiating from chain edges toward strip boundaries. CDT with sufficient interior points produces triangulations that follow the local point density rather than boundary structure. This is the correct solution — it extends the existing companion system without architectural disruption.

The Verifier's amendments are critical and correct:
- **C1**: The constraint guard at `CONSTRAINT_GUARD_RADIUS=0.001` would silently reject 60% of the fan's densest companions. The root tension is real — ultra-near companions create slivers. Starting shells at fraction≥0.2 resolves this.
- **C2**: Using `1/numU` for strip width on a CDF-adaptive grid overestimates near features and underestimates away from them. Using actual `unionU` lookups is exact and zero-cost.

## Master Decisions on Open Questions

**Q1 (Shell fractions)**: Use explicit fractions `[0.20, 0.45, 0.72, 1.0]`. Power-law is over-engineering for 4 discrete shells. Explicit values are debuggable and tuneable.

**Q2 (T-level scaling)**: Derive T-levels per shell from density parameter:
```
tLevels[s] = max(1, floor(density × (nShells - s) / (nShells × 2)))
```
At density=8: [4, 3, 2, 1]. At density=4: [2, 1, 1, 1]. At density=12: [6, 5, 3, 2]. This scales naturally without configuration surprise.

**Q3 (Config)**: Hardcode `nShells=4`. The `uGradingShells` config parameter is unnecessary complexity — 4 shells is the correct count given the constraint guard geometry. Don't expose a knob that only works for values 3-5.

**Q4 (Companion caps)**: Split per Verifier C10: `MAX_RUNGS_PER_CV = 20`, `MAX_FAN_PER_BAND = 30`, each function enforces its own cap. Simpler than shared counters.

**Q5 (Defaults)**: Update `expansion: 4`, `densityMultiplier: 8`. The fan mechanism requires expansion≥3 to have sufficient U-range. Density=8 gives T-levels [4,3,2,1] — the minimum for effective grading. These are the operational defaults, not the theoretical minimums.

## Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Problem fit | ✅ | Addresses root cause: U-space void between chain edge and strip boundary |
| Mathematical correctness | ✅ | Verifier verified constraint guard interaction, CDT interior point behavior, dedup threshold coverage |
| Codebase grounding | ✅ | All line references verified. unionU, bsearchFloor, chainStripConfig available at companion generation point |
| Architectural alignment | ✅ | Extends existing companion system. Preserves D-Radical boundary topology. No new abstractions |
| Implementation feasibility | ✅ (est.) | ~35 lines new code, 1 call site, 3-4 config lines. No structural changes. Combined with Executioner dispatch |
| Test coverage | Defined | Phase 3 validation protocol in Verifier critique. Export quality metrics comparison |
| Regression safety | ✅ | D-Radical interaction verified safe (Verifier C6). Fan companions never touch boundaries |
| Performance impact | ✅ | ~25-30k extra companions, ~20% vertex increase, negligible CDT time increase |

## Conditions

1. **All Verifier amendments C1-C11 must be honored.** Particularly C1 (shell fractions) and C2 (unionU boundary lookup).
2. **Right boundary offset**: Use `col + expansion + 1` for right boundary lookup (Verifier C3).
3. **Companion cap split**: Separate `MAX_RUNGS_PER_CV` and `MAX_FAN_PER_BAND` (Verifier C10).
4. **No `uGradingShells` config parameter**: Hardcode nShells=4. Remove from ChainStripConfig plan.
5. **Log fan metrics**: Include fan companion count, per-shell acceptance rate, and guard reject breakdown in the CDT diagnostics log line.

## Risk Assessment

- **Blast radius**: LOW. Fan companions are interior-only CDT free points. If they cause quality issues, removing them is a 1-line change (delete the `emitUGradedFan` call).
- **Rollback**: Trivial — comment out the fan call in the companion generation loop.
- **What could go wrong**: (a) Shell 0 at borderline guard distance rejected inconsistently across bands — monitoring via log. (b) High-frequency styles with strip overlap produce unexpected fan interaction — pre-existing issue, CDT handles merged strips. (c) Fan + high density creates too many companions → memory/performance — capped by MAX_FAN_PER_BAND=30.

## Implementation Order (Executioner Marching Orders)

### Changeset 1: Core fan function
- Add `SHELL_FRACTIONS`, `MAX_FAN_PER_BAND` constants to OWT
- Add `emitUGradedFan()` function after `emitRungs()` (~35 lines)
- Call from companion generation loop after `emitRungs()` calls

### Changeset 2: Config updates
- Update `DEFAULT_CHAIN_STRIP_CONFIG`: `expansion: 4`, `densityMultiplier: 8`
- Update `ParametricExportComputer.ts` default values to match
- Rename `MAX_COMPANIONS_PER_CV` to `MAX_RUNGS_PER_CV` (no functional change)

### Changeset 3: Diagnostics
- Update CDT companion diagnostics log line to include fan metrics
- Log per-shell acceptance rate and guard reject breakdown
