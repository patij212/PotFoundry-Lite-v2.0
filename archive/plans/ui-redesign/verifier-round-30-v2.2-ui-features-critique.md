# Verifier Round 30 — Critique of v2.2 UI Features Proposal
Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS

Proposal intent is strong and mostly aligned with current architecture, but there are blocking correctness issues in the current draft.

Go/No-Go for Executioner:
- NO-GO on the proposal as currently written.
- GO after the binding amendments in this document are applied.

## Critique

### C1 [CRITICAL]: Proposed mono font package does not exist
Generator claim:
- Typography can be implemented with @fontsource-variable/fraunces, @fontsource-variable/inter, and @fontsource-variable/ibm-plex-mono.

Actual behavior:
- npm registry lookup for @fontsource-variable/ibm-plex-mono returns 404 (not found).
- Current code references local assets under /fonts in [src/ui/v2/fonts.css](src/ui/v2/fonts.css#L20), [src/ui/v2/fonts.css](src/ui/v2/fonts.css#L41), [src/ui/v2/fonts.css](src/ui/v2/fonts.css#L62), but there is no public fonts directory in [potfoundry-web/public](potfoundry-web/public).

Counterexample:
- Running npm view for @fontsource-variable/ibm-plex-mono fails with E404, so install step fails before any UI work can proceed.

Required fix:
- Use @fontsource/ibm-plex-mono (static package) for 400/500 and keep variable packages for Fraunces/Inter.
- Keep token names aligned with real family names from package CSS:
  - Fraunces Variable
  - Inter Variable
  - IBM Plex Mono
- Implement typography as either:
  - fully package-driven, or
  - fully local assets in public/fonts
- Do not keep a mixed broken path.

### C1 [CRITICAL]: Undo/redo snapshot semantics are incorrect for slider-driven state
Generator claim:
- pushToHistory at commit points (onValueCommit) is sufficient and avoids history spam.

Actual behavior:
- Slider updates happen continuously through onChange today in [src/ui/v2/tabs/ShapeTab.tsx](src/ui/v2/tabs/ShapeTab.tsx#L116), [src/ui/v2/tabs/StyleTab.tsx](src/ui/v2/tabs/StyleTab.tsx#L168), [src/ui/v2/tabs/ExportTab.tsx](src/ui/v2/tabs/ExportTab.tsx#L201).
- SliderV2 supports onValueCommit in [src/ui/v2/controls/SliderV2.tsx](src/ui/v2/controls/SliderV2.tsx#L9), [src/ui/v2/controls/SliderV2.tsx](src/ui/v2/controls/SliderV2.tsx#L200), but current tabs do not pass commit handlers.

Counterexample:
- User drags Height 120 -> 180.
- If history only pushes at release, snapshot captures already-mutated state (180).
- Undo from that entry does not restore 120 unless a pre-drag snapshot was captured earlier.

Required fix:
- Capture pre-interaction snapshot once per interaction start (pointerdown/focus-start).
- Then commit one post-state entry at interaction end, or store transactions with before/after pair.
- Add dedupe guard so unchanged commits do not consume history entries.

### C2 [WARNING]: Swipe architecture collides with interactive controls unless target-filtered
Generator claim:
- Attach swipe listener to sidebar content container and lock horizontal gestures.

Actual behavior:
- Proposed attachment point is [src/ui/v2/layout/SidebarV2.tsx](src/ui/v2/layout/SidebarV2.tsx#L173), which contains many sliders and controls.
- Slider root sets touch-action none in [src/ui/v2/controls/SliderV2.css](src/ui/v2/controls/SliderV2.css#L89), encouraging horizontal touch manipulation.

Counterexample:
- User drags a slider thumb horizontally by >40px.
- Container-level swipe logic sees the same touch sequence and can switch tabs.

Required fix:
- Ignore swipe detection when touch starts on interactive descendants:
  - input, select, button, [role="slider"], [data-radix-collection-item], color pickers.
- Enable swipe only on mobile/touch viewports.
- Keep touch-action pan-y on content, but do not rely on it alone.

### C2 [WARNING]: Haptics integration point in proposal is mismatched to real export flow
Generator claim:
- Trigger success haptic in ExportTab on export completion.

Actual behavior:
- Export action and completion lifecycle are in [src/ui/v2/layout/StatusFooter.tsx](src/ui/v2/layout/StatusFooter.tsx#L51), [src/ui/v2/layout/StatusFooter.tsx](src/ui/v2/layout/StatusFooter.tsx#L69), not ExportTab.

Counterexample:
- Wiring success haptic in ExportTab misses primary export button in StatusFooter and will not reliably fire on completion state transition.

Required fix:
- Fire success haptic in StatusFooter when progress.status transitions to complete.
- Fire tap haptic at tab switches and high-value buttons only.

### C2 [WARNING]: Proposed haptics hook has non-reactive preference toggling
Generator claim:
- setEnabled persists preference; remount is acceptable.

Actual behavior:
- Proposal itself notes value is memoized and does not update at runtime.

Counterexample:
- User disables haptics in settings; same session still vibrates until remount.

Required fix:
- Keep preference in Zustand UI slice or React state so toggles are immediate.
- Maintain runtime guard: typeof navigator !== 'undefined' and typeof navigator.vibrate === 'function'.

### C2 [WARNING]: Undo keyboard shortcut layering must avoid regression with existing v2 key handlers
Generator claim:
- Add Ctrl+Z/Ctrl+Shift+Z in AppUIv2.

Actual behavior:
- Existing key handling already owns z and alt+1/2/3 in [src/ui/v2/AppUIv2.tsx](src/ui/v2/AppUIv2.tsx#L59), [src/ui/v2/AppUIv2.tsx](src/ui/v2/AppUIv2.tsx#L72).
- Input guards are present in [src/ui/v2/AppUIv2.tsx](src/ui/v2/AppUIv2.tsx#L63).

Counterexample:
- If undo checks are added after plain z checks or without early return, ctrl/cmd-z could leak into zen toggle paths in future edits.

Required fix:
- Handle undo/redo first with explicit modifier checks and early return.
- Keep input/textarea/select/contentEditable bypass in place.

### C3 [NOTE]: State architecture supports targeted undo scope cleanly
Evidence:
- Store already segmented via slices in [src/state/store.ts](src/state/store.ts#L89).
- Persisted keys are limited to geometry/style/mesh/appearance in [src/state/store.ts](src/state/store.ts#L50).
- Volatile UI and performance are separate in [src/state/types.ts](src/state/types.ts#L286), [src/state/types.ts](src/state/types.ts#L322).

Implication:
- Undo scope can cleanly target geometry/style/appearance while excluding ui/performance.
- Mesh is serializable but may remain excluded per product requirement.

### C3 [NOTE]: Tab swipe state location is correct and low blast-radius
Evidence:
- Tab source of truth is ui.v2ActiveTab in [src/ui/v2/layout/SidebarV2.tsx](src/ui/v2/layout/SidebarV2.tsx#L51) with setV2ActiveTab in [src/ui/v2/layout/SidebarV2.tsx](src/ui/v2/layout/SidebarV2.tsx#L52).
- Tabs are controlled via Radix Root in [src/ui/v2/layout/SidebarV2.tsx](src/ui/v2/layout/SidebarV2.tsx#L154).

Implication:
- Swipe can be implemented as a small adapter around existing handleTabChange.

## Required Amendments (Binding)

1. Typography amendment:
- Replace nonexistent @fontsource-variable/ibm-plex-mono with @fontsource/ibm-plex-mono.
- Keep explicit token-family mapping consistent with real package families.
- Validate that fonts are actually requested in network/devtools after build.

2. Swipe amendment:
- Mobile/touch-only activation.
- Gesture target filtering to exclude sliders/selects/buttons/inputs.
- Add guard tests for slider drag not changing tabs.

3. Haptics amendment:
- Integrate completion haptic in StatusFooter completion transition.
- Make enable/disable reactive in-session.
- Keep unsupported platforms as no-op with runtime feature detection.

4. Undo/redo amendment:
- Transaction model must capture before-state at interaction start.
- Do not push history per slider tick.
- Exclude ui/performance/ephemeral fields from snapshots.
- Add Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y with early returns and input guards.

5. History bounds amendment:
- Cap history at 50 entries.
- Deduplicate consecutive identical snapshots.
- Clear redo branch on new mutation after undo.

## What Can Be Implemented Now vs Deferred

Implement now in one pass:
- Typography repair (package or local assets) with verified family names.
- Swipe hook + Sidebar integration with target filters and mobile guard.
- Haptics hook + tab tap + export completion success in StatusFooter.
- History slice skeleton + toolbar undo/redo buttons + keyboard bindings (without broad auto-tracking).

Defer to follow-up (after first integration is stable):
- Advanced undo transaction coalescing across compound actions (load design, preset batch apply).
- Optional persisted user haptics preference surface in settings UI if not yet present.
- Broader E2E test matrix across iOS/Android browsers.

## Minimal Validation Protocol

1. Typography:
- Build passes.
- Network confirms font files requested and loaded.
- Visual check confirms non-fallback families in computed style.

2. Swipe:
- Mobile viewport test: left/right swipe switches tabs.
- Vertical scroll in sidebar remains smooth.
- Slider drag and select interactions do not trigger tab switch.

3. Haptics:
- Android device: tab switch tap buzz, export completion success pattern.
- iOS/desktop: no errors, no-op behavior.

4. Undo/Redo:
- Drag slider and commit once: one undo step restores pre-drag value.
- Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work; Ctrl/Cmd+Y redo works on Windows.
- Undo does not mutate ui/performance state.

5. Regression smoke:
- v2 keyboard shortcuts (z, alt+1/2/3) still behave as before.
- Export flow unchanged aside from optional haptic side effect.
