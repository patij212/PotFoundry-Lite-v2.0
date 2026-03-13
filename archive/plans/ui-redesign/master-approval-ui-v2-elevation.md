# Master Approval — UI v2 Luxury Elevation

**Date**: 2026-03-06  
**Author**: The Master  
**Round**: Generator R1 → Verifier R1 → Executioner Review → Master Approval

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status

| Agent | Status | Notes |
|---|---|---|
| Generator | **Proposed** | Comprehensive 10-section elevation proposal — motion, onboarding, delight moments, keyboard/focus, advanced components, layout, mobile, accessibility, dark/light, sound |
| Verifier | **Accepted with amendments** | 6 clean accepts, 4 amended. Critical: export progress pipeline hallucination, keyboard `1/2/3` conflict, `@radix-ui/react-focus-scope` not installed. All fixable. |
| Executioner | **Feasible — no blockers** | All 9 must-haves buildable with existing stack. Zero config changes needed. 5-phase, 16-changeset implementation plan. |
| Master | **Approved** | Clean convergence in one Generator/Verifier round. Quality of debate was high. |

## Rationale

This elevation transforms the UI v2 from a visual reskin into a genuinely differentiated experience. The key upgrades that justify the work:

1. **Motion system** — Branded easing curves, choreographed transitions, and micro-interactions give PotFoundry a tactile identity that no parameter-tweak UI has ever had in the 3D printing space.

2. **Export progress choreography** — The single most important user moment (Download) goes from a frozen spinner to a celebration of craftsmanship. Even as indeterminate progress (A3.2), the completion card with animated check + post-hoc phase timeline is a massive upgrade.

3. **SliderV2** — Floating value tooltips, default ghost markers, snap-to-default, double-click reset. These are the controls users will spend 90% of their time interacting with. Making them feel premium pays compound returns.

4. **Accessibility infrastructure** — ARIA announcer, live regions, focus management, contrast corrections. This isn't just compliance — it's the foundation for a UI that works for everyone.

5. **Progressive disclosure** — Solves the #1 onboarding problem (20+ parameters overwhelming new users) without sacrificing power-user depth.

The plan is architecturally sound: zero modifications to v1 UI, clean `--pf2-*` token isolation, shared Zustand state, lazy-loaded v2 tree. The Executioner confirmed zero build config changes needed.

## Conditions (Binding)

### Must-Have for v2.0 Ship

1. **Motion system** — All 4 custom easing curves, 7-tier duration scale, sidebar/tab/section choreography, reduced motion support via `prefers-reduced-motion` and `useReducedMotion()` hook
2. **Micro-interactions** — Slider thumb hover/active states, button press depression, gold focus rings (2-layer box-shadow bezel)
3. **Export progress** — Indeterminate gold pulse bar, completion celebration (brightness pulse + SVG check draw + stats card), post-hoc phase timeline. **No pipeline modifications.** (A3.2)
4. **SliderV2** — Floating value tooltip (during drag only), default ghost marker, snap-to-default (5% of range, capped at step × 5, Shift to override), double-click reset, `min-width: 3ch` on tooltip
5. **Quality tier cards** — 4-card grid (Draft/Standard/High/Ultra) with hover lift, gold selection state, triangle estimates, mobile 2×2 layout
6. **Keyboard/focus** — `Alt+1/2/3` for tab switching, `Z` for zen mode (with input guard), Radix Focus-Scope trapping on CameraPopover + LibraryDrawer, gold focus-visible indicators. **Install `@radix-ui/react-focus-scope`.**
7. **Accessibility** — `AnnouncerProvider` + `useAnnounce()` hook, ARIA live regions on StatusFooter stats + export progress, focus-return-to-trigger on non-Radix components, `forced-colors` media query support
8. **Sidebar** — 380px default width, resizable with persistence (`pf2-sidebar-width`), solid background `rgba(15, 15, 18, 0.96)`. **No `backdrop-filter` required for v2.0.**
9. **Progressive disclosure** — Confidence levels gated by user interaction, `localStorage` persistence, auto-unlock on preset/deeplink/library load, "Reset tutorial" in Settings

### Should-Have for v2.1

10. First-run welcome card (non-modal, viewport overlay)
11. Preset card elevation (hover lift, metadata overlay)
12. Style switch parameter stagger animation
13. Dark/Light mode (warm parchment light palette, system preference detection)
14. Mobile gesture navigation (swipe tabs, 4-state bottom sheet, velocity snapping)
15. Zen mode (Z key, auto-hiding minimal toolbar)
16. Color palette strip (curated ceramic glaze palettes)
17. Sidebar `backdrop-filter: blur(12px)` as progressive enhancement (after multi-GPU testing)

### Nice-to-Have for v2.2+

18. Sound design (Web Audio API oscillators, opt-in, 3 sounds)
19. Guided spotlight tour
20. Content density toggle (compact/comfortable/spacious)
21. Landscape mobile drawer adaptation
22. Haptic feedback (Vibration API, Android-only)

## Master Rulings (Binding Technical Decisions)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Export progress: A3.2 (indeterminate)** | Pipeline modification is separate scope. Indeterminate bar + post-hoc phase display is honest and still beautiful. |
| 2 | **Tab shortcuts: `Alt+1/2/3`** | Existing `1-5` style shortcuts stay. No user-facing behavior changes in v1. |
| 3 | **Sidebar transparency: should-have** | `backdrop-filter` + WebGPU canvas readback is untested territory. Ship solid, enhance later. |
| 4 | **Stagger: 30ms/item, 150ms max** | 250ms total was sluggish. 150ms feels like a ripple, not a curtain. |
| 5 | **Snap threshold: 5% of range, cap step×5** | Consistent tactile feel across all parameters regardless of step size. |
| 6 | **WCAG secondary text: `#a8a29e` (~6.3:1)** | Passes AA generously, clear hierarchy, AAA for large text. Pragmatic. |
| 7 | **Font hosting: self-host** in `public/fonts/` with `font-display: swap` | Reliability, GDPR compliance, no external requests. |
| 8 | **v2 tab state: separate field** `v2ActiveTab: 'shape' \| 'style' \| 'export'` | Clean type separation from v1's `activeTab`. No union pollution. |
| 9 | **Confidence persistence: standalone `localStorage`** key `pf2-user-confidence` | UIState is NOT persisted (not in `PERSISTED_KEYS`), so standalone localStorage is the correct pattern. |
| 10 | **First-run preset: FourierBloom** at `fb_n1=8, fb_amp=0.22, fb_ring_n=5, fb_ring_amp=0.12` | 8-petal flower with ring detail. Organic, mathematical, not intimidating. Auto-rotate at 0.3 rpm. |

## Risk Assessment

| Risk | Severity | Blast Radius | Mitigation | Rollback |
|---|---|---|---|---|
| Keyboard shortcut conflicts | Medium | v2 users only | Build conflict matrix test fixture; `Alt` modifier safe on major browsers; gate all v2 shortcuts behind `uiTheme === 'v2'` | Remove shortcut bindings |
| Progressive disclosure edge cases | Medium | v2 users only | Explicit state transition rules: preset/deeplink/library → all flags true. Test the matrix. | Set all confidence flags true (shows everything) |
| CSS v1/v2 coexistence | Low-Medium | Both UIs | `--pf-` vs `--pf2-` prefix isolation. Shared components use own CSS unchanged. Playwright screenshot tests for both themes. | v2 tree is lazy-loaded — can be disabled instantly |
| Motion causing jank on low-end | Low | v2 users on weak hardware | Only animate `transform` and `opacity` (GPU-composited). Full `prefers-reduced-motion` fallback set. | Reduced motion auto-applies |
| Bundle size regression | Low | All users | v2 tree lazy-loaded via `React.lazy()`. Estimated 15-20KB gzip. Track with CI size check. | Lazy loading means v1 users pay zero cost |

## Implementation Order

Follow the Executioner's 5-phase, 16-changeset plan:

| Phase | Content | Gate |
|---|---|---|
| **0: Foundation** | Design tokens, fonts, motion keyframes, state additions, theme switch plumbing, install dependencies | Merge: v2 stub renders when toggled, v1 is untouched, all tests pass |
| **1: Base Components** | SliderV2, SectionV2, ButtonV2, SelectV2, Announcer infrastructure | Merge: components render in isolation, unit tests pass |
| **2: Layout Shell** | SidebarV2, StatusFooter, ToolbarV2, wire into AppUIv2 | Merge: full layout renders with placeholder tab content, tab switching works |
| **3: Tab Content** | ShapeTab, StyleTab, ExportTab with real store bindings | Merge: all parameters functional, presets work, exports work from v2 UI |
| **4: Features** | Export progress, keyboard shortcuts, CameraPopover, LibraryDrawer, progressive disclosure | Merge: all must-have features functional |
| **5: Polish** | Reduced motion audit, contrast corrections, integration testing, bundle size check | Ship gate: Playwright screenshots, <25KB gzip delta, all 1896+ tests pass |

**Each phase must leave the codebase in a working state. No phase merges until its gate criteria are met.**

## Assessment

This was a clean round. Generator delivered a comprehensive, well-researched proposal with specific CSS snippets, component interfaces, and timing values — no hand-waving. The Verifier caught exactly the right issues: the export progress phase hallucination was the most dangerous (could have led to weeks of pipeline work that wasn't scoped), the keyboard conflict was a real collision, and the FocusScope dependency gap was a blocker. The Executioner confirmed everything is buildable and produced a phased plan that I'm confident in.

One Generator/Verifier round to convergence. That's how it should work.

## To the Next Agent

The plan is approved. The Executioner has detailed changesets. Start at Phase 0 (foundation) and work forward. Do NOT skip ahead — the dependency order matters. If you hit a surprise during implementation that contradicts this plan, stop, document it in `agents_journal.md`, and escalate rather than improvising.

The key architectural principle for this entire build: **v1 UI must never be touched.** Every change is additive. If you find yourself modifying `AppUI.tsx`, `Sidebar.tsx`, or any existing control, you are off-plan.

The one exception: `App.tsx` needs the conditional render (`uiTheme === 'v2' ? <AppUIv2 /> : <AppUI />`), and `useKeyboardShortcuts.ts` needs the `Alt+1/2/3` bindings gated by theme. Everything else is new files.

---

*Master sign-off — 2026-03-06*
