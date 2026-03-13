# Generator Round 33 — UI v2 Immediate-Priority Known-Issues Audit
Date: 2026-03-07

## Problem Statement
UI v2 is functional and visually coherent, but several immediate risks remain in resilience, interaction determinism, and operability. The most urgent failures are: unrecoverable UI crashes due to missing boundaries, onboarding overlay interaction interception, and slider interaction edge behavior that undermines precision and trust.

Scope: potfoundry-web/src/ui/v2/** plus direct integration points in App.tsx and state slices.

## Root Cause Analysis
1. V2 composition removed the defensive containment model used by v1. AppUIv2 mounts all major regions without ErrorBoundary wrappers, unlike v1 AppUI.
2. Several v2 controls rely on global listeners and global mutable integration points (window store exposure, document-level key handlers), increasing cross-component coupling and test flakiness under realistic interaction timing.
3. Onboarding and preset application flows mutate high-impact state but skip history transaction boundaries in some paths, creating undo/redo inconsistency despite v2.2 transaction work.
4. A few implementation details are Vite-inconsistent or known TODOs (process.env in Announcer, Radix slider ghost offset) that have direct runtime and UX consequences.

## Top Issues (Ranked, Immediate Priority)

### 1) P0 — Missing Error Boundaries in AppUIv2 (Product Bug)
- Why it matters now: Any throw in ToolbarV2, SidebarV2, tabs, onboarding, or shared widgets can blank the entire interactive layer.
- Concrete failure mode: Runtime exception in any child of AppUIv2 tears down all v2 controls while canvas continues, leaving user unable to recover without hard refresh.
- Fast mitigation: Wrap AppUIv2 root, SidebarV2 region, ToolbarV2 region, and key modal/drawer regions with existing ui/shared ErrorBoundary.
- Durable fix: Align v2 boundary topology with v1 parity and add one render-crash test per major zone.
- Evidence: src/ui/v2/AppUIv2.tsx, src/ui/AppUI.tsx.

### 2) P1 — WelcomeCard Overlay Intercepts First-Run Interactions (Product + Testability)
- Why it matters now: First-run users and E2E both hit this path; blocked pointer focus causes false negatives and real onboarding friction.
- Concrete failure mode: Fixed-position welcome card sits above other overlays and captures pointer/focus before user can access intended target controls.
- Fast mitigation: Add explicit, deterministic dismissal gate for automation and keyboard flow (Escape + deterministic close state), and constrain hit area behavior while animating.
- Durable fix: Convert onboarding to intentional modal semantics (focus trap + inert background or explicit affordance rules), and add first-run interaction tests that use real UI clicks.
- Evidence: src/ui/v2/onboarding/WelcomeCard.tsx, src/ui/v2/onboarding/WelcomeCard.css, e2e/v2-undo-redo-verification.spec.ts.

### 3) P1 — Preset Application in LibraryDrawer Is Not Transactional (Product Bug)
- Why it matters now: Preset load is a primary action and currently mutates geometry/style/appearance in one burst without history transaction boundaries.
- Concrete failure mode: Undo may not represent a single “apply preset” step; users cannot reliably revert a preset apply as one action.
- Fast mitigation: Wrap applyPreset sequence in beginHistoryTransaction/commitHistoryTransaction.
- Durable fix: Add transactional helper for multi-field v2 actions and enforce via unit tests for library, import/load, and onboarding preset paths.
- Evidence: src/ui/v2/shared/LibraryDrawer.tsx, src/state/slices/ui.ts.

### 4) P1 — SliderV2 Edge Ghost Misalignment at Track Extremes (Product Bug)
- Why it matters now: This is user-visible precision debt on the most-used control family.
- Concrete failure mode: Default marker “ghost” drifts up to ~9px versus thumb at min/max due to Radix in-bounds thumb offset, creating perceived wrong defaults.
- Fast mitigation: Hide ghost marker near edge epsilon to avoid visibly wrong states.
- Durable fix: Implement Radix-compatible offset compensation (getThumbInBoundsOffset equivalent) and snapshot-test endpoints for all slider sizes.
- Evidence: src/ui/v2/controls/SliderV2.tsx.

### 5) P1 — Announcer Uses process.env.NODE_ENV in Vite Surface (Operability Bug)
- Why it matters now: Environment checks should be Vite-native to avoid inconsistent bundler behavior and dev/prod warning divergence.
- Concrete failure mode: Dev-only warning path can misbehave in certain build setups because process.env is not canonical in Vite.
- Fast mitigation: Replace with import.meta.env.DEV in Announcer context default.
- Durable fix: Add lint rule or codemod check to block process.env usage in frontend runtime code.
- Evidence: src/ui/v2/shared/Announcer.tsx.

### 6) P2 — WelcomeCard Exit Timer Lacks Unmount Cleanup (Product Stability)
- Why it matters now: Navigation/theme remount during exit animation can trigger state updates after unmount.
- Concrete failure mode: Pending timeout fires after component unmount and calls setDismissed/unlock, causing warnings or latent state skew.
- Fast mitigation: Add effect cleanup for exitTimeoutRef on unmount.
- Durable fix: Centralize onboarding state machine with cancellable transitions.
- Evidence: src/ui/v2/onboarding/WelcomeCard.tsx.

### 7) P2 — SidebarV2 localStorage Access Is Unguarded (Product + Operability)
- Why it matters now: localStorage is blocked in some privacy modes and embedded contexts.
- Concrete failure mode: getItem/setItem throws during width init or resize commit; sidebar can fail or crash interaction path.
- Fast mitigation: Add try/catch around all localStorage reads/writes in SidebarV2.
- Durable fix: Shared safeStorage utility used by v2 hooks/components, with fallback memory storage.
- Evidence: src/ui/v2/layout/SidebarV2.tsx.

### 8) P2 — SliderV2 Registers Global Key Listeners Per Instance (Operability + Perf)
- Why it matters now: Shape/Style/Export tabs can mount many sliders; each instance attaches window keydown/keyup listeners.
- Concrete failure mode: N sliders create N global listeners; shift tracking can become noisy and harder to reason about under rapid tab/portal churn.
- Fast mitigation: Replace per-slider global Shift listeners with event-local logic in thumb handlers.
- Durable fix: Introduce one shared keyboard modifier service/hook with singleton listener and explicit subscription.
- Evidence: src/ui/v2/controls/SliderV2.tsx.

### 9) P2 — App.tsx Uses Suspense fallback=null for AppUIv2 (Testability + UX)
- Why it matters now: First paint can show canvas without controls, creating timing race for interactions and automation.
- Concrete failure mode: On theme switch or cold load, v2 controls absent momentarily; user clicks are dropped or land on canvas unexpectedly.
- Fast mitigation: Replace null fallback with lightweight control-shell placeholder.
- Durable fix: Preload AppUIv2 chunk when uiTheme preference resolves to v2 and test for control readiness before interaction.
- Evidence: src/App.tsx.

### 10) P2 — V2 E2E Coverage Bypasses Real UI Interactions (Testability Bug)
- Why it matters now: Current passing suite can miss real regressions because it drives store actions directly to avoid UI fragility.
- Concrete failure mode: E2E passes while actual click/drag/overlay/tab flows are broken.
- Fast mitigation: Add one smoke suite that performs real UI-level actions for WelcomeCard dismissal, tab switch, slider drag, and export-trigger interaction.
- Durable fix: Two-lane strategy: state-level deterministic tests + UI-level behavioral tests with deterministic onboarding control.
- Evidence: e2e/v2-undo-redo-verification.spec.ts.

### 11) P3 — ShortcutsDialog Text Mismatch for Shift+Arrow Behavior (Product UX)
- Why it matters now: Help text currently claims fine-tune ±1 while implementation does step ×10 acceleration.
- Concrete failure mode: User expectation mismatch when using keyboard nudging from dialog guidance.
- Fast mitigation: Update dialog copy to match current behavior.
- Durable fix: Define shortcut contract constants consumed by both UI behavior and dialog rendering.
- Evidence: src/ui/v2/shared/ShortcutsDialog.tsx, src/ui/v2/controls/SliderV2.tsx.

## Focused 7-Day Plan (Urgent Items Only)

### Day 1
- Patch P0/P1 resilience: add ErrorBoundary topology to AppUIv2 major regions.
- Patch Announcer env check (process.env -> import.meta.env.DEV).
- Add smoke test that intentionally throws inside one v2 region and verifies bounded fallback.

### Day 2
- Stabilize first-run flow: WelcomeCard deterministic dismissal path and pointer/focus behavior constraints.
- Add first-run E2E that clicks through real UI with WelcomeCard present.

### Day 3
- Fix LibraryDrawer transactional preset apply.
- Add undo/redo regression test for “apply preset” as single history entry.

### Day 4
- Apply SliderV2 fast mitigation for ghost endpoint drift (edge hide epsilon).
- Add endpoint visual assertions for min/max/default.

### Day 5
- Refactor SliderV2 modifier handling to remove per-instance global key listeners.
- Add interaction tests for Shift+Arrow behavior consistency.

### Day 6
- Harden localStorage calls in SidebarV2 with safe fallback.
- Add browser-context test that simulates storage failure.

### Day 7
- Improve operability: replace Suspense null fallback with non-interactive shell and add control-readiness assertions.
- Add one UI-level v2 smoke pack (not store-driven) to complement existing deterministic store-driven suite.

## Assumptions / Unknowns For Verifier Confirmation
1. ErrorBoundary fallback visuals from v1 are acceptable for v2 styling, or minimal v2-skinned fallback can be added without design sign-off delay.
2. WelcomeCard should behave as a modal-like onboarding layer on first run; if product wants passive card semantics, pointer interception policy must be explicitly defined.
3. Preset application is expected to be a single undoable unit (not multi-step undo through each field mutation).
4. Slider ghost marker is product-critical enough to prioritize before broader slider polish.
5. Storage failures (private mode/embedded contexts) are in current support matrix and should not hard-fail UI.
6. A lightweight non-null Suspense fallback is acceptable from a visual-direction perspective.
7. Existing v2 E2E strategy intentionally bypasses UI for speed; adding UI-smoke tests is acceptable despite potential flakiness cost.
8. No additional hidden integration points outside App.tsx/store slices materially alter v2 interaction semantics in this sprint window.

## Recommended Approach
Prioritize issues 1-5 this week as immediate-risk containment: crash containment, onboarding determinism, transactional integrity, slider trust at endpoints, and env-correct operability. These five remove the highest near-term risk concentration with minimal architectural churn and no broad refactor dependency.