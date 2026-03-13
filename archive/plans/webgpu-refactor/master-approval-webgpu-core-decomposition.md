# Master Approval — webgpu_core.ts Decomposition

Date: 2026-03-09

## Decision: ✅ APPROVED

---

## Unanimous Agreement Status

| Agent | Status | Document |
|-------|--------|----------|
| **Generator** | ✅ Proposed | `generator-round-1-webgpu-core-decomposition.md` |
| **Verifier** | ✅ Accepted with amendments | `verifier-round-1-webgpu-core-review.md` |
| **Executioner** | ✅ Feasible | `executioner-feasibility-webgpu-core-decomposition.md` |
| **Master** | ✅ Approved | This document |

---

## Rationale

This decomposition is the **right work at the right time** for PotFoundry:

1. **Addresses #1 maintenance risk**: `webgpu_core.ts` at 5,236 lines is explicitly called out in AGENTS.md as "the #1 maintenance risk."

2. **Phased & reversible**: Each phase is independently testable and rollbackable. No big-bang refactor.

3. **Type safety first**: Prerequisite P-1 (as-any elimination) ensures we don't propagate type unsafety to new modules.

4. **Well-scoped extractions**: 
   - AxisOverlay (~350 LOC) — self-contained, no closure dependencies
   - InputManager (~200 LOC) — clear interface boundary identified by Executioner
   - BufferLayout (~100 LOC) — pure utility functions

5. **Risk mitigation patterns documented**: Executioner provided concrete code patterns for all identified risks.

---

## Conditions for Implementation

The Executioner may proceed under these conditions:

### Mandatory

1. **Complete P-1 first**: No extraction until `as any` casts are eliminated and `webgpu_global.d.ts` exists
2. **Preserve backwards compatibility**: Re-export `overlayForAxisFromBasis` from `webgpu_core.ts`
3. **Full listener cleanup**: Axis overlay `dispose()` must remove ALL 6 document-level listeners
4. **80%+ test coverage**: Each new module must have unit tests before merge
5. **E2E validation**: Manual smoke test after each phase

### Recommended

6. **Follow Executioner's phase order**: Phase 0 → 1 → 2 → (defer 3/4)
7. **Commit atomically**: One commit per sub-step for easy bisect
8. **Update ARCHITECTURE.md**: Add new modules to the documentation

---

## Risk Assessment

### Blast Radius

| Phase | Blast Radius | Rollback Plan |
|-------|--------------|---------------|
| P-1 (as-any) | Zero — type-only changes | Revert .d.ts file, restore casts |
| Phase 1 (AxisOverlay) | Low — isolated UI element | Revert file, restore inline code |
| Phase 2 (InputManager) | Medium — event handling | Revert file, restore handlers |

### What Could Go Wrong

1. **Memory leaks**: Mitigated by explicit listener cleanup patterns
2. **Broken keyboard shortcuts**: Mitigated by `freeKeyboard` ownership documentation
3. **Rendering regressions**: Mitigated by E2E tests and manual validation

### Rollback Trigger

If E2E tests fail OR manual testing reveals:
- Axis overlay doesn't appear or drag
- Keyboard shortcuts don't work
- Preview stops responding to input

...then revert the phase immediately before investigating.

---

## Implementation Order

| Order | Phase | Time | Owner |
|-------|-------|------|-------|
| 1 | P-1: Global type augmentation | 30 min | Executioner |
| 2 | as-any cast removal | 1.5 hours | Executioner |
| 3 | Phase 1: AxisOverlay extraction | 2 hours | Executioner |
| 4 | Phase 2: InputManager extraction | 3 hours | Executioner |
| — | Phase 3-4: Deferred | — | — |

**Total estimated: ~7 hours** (reduced from Generator's 12hr estimate after Verifier & Executioner refinement)

---

## Success Criteria

### Quantitative

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 warnings
- `npm test` — all passing
- Line count in `webgpu_core.ts` — reduced by ~550 lines

### Qualitative

- Axis overlay drags smoothly
- All keyboard shortcuts work (R for rotate, view presets, etc.)
- No console errors on mount/dispose cycle

---

## Sign-off

**Master**: This plan represents collaborative excellence across the agent system. The Generator produced a well-researched proposal; the Verifier caught real discrepancies and refined scope; the Executioner confirmed feasibility with concrete patterns.

The result is a low-risk, high-value decomposition that directly addresses our largest maintenance burden.

**Implementation is authorized to proceed.**

---

## For the Next Agent

If you're continuing this work:

1. **Phase 0-1 are the quick wins** — Start there
2. **Don't skip the .d.ts consolidation** — Type safety underpins everything
3. **Test listener cleanup religiously** — Memory leaks are silent killers
4. **Commit atomically** — You'll thank yourself when bisecting

Good luck. The monolith awaits. 🪓
