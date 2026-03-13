# Verifier Round 25 — Critique of Generator Mobile Responsiveness Proposal
Date: 2026-03-12

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's Proposal 1 (Composition Pattern) is architecturally sound. The core mechanism — reusing `body[data-mobile-sheet-state]` to bridge React component state to CSS canvas offsets — is proven by v1, and the mutual exclusivity of v1/v2 themes (App.tsx:536) eliminates race conditions. However, I identify **2 CRITICAL**, **4 WARNING**, and **3 NOTE** issues that must be addressed before implementation.

---

## Claim-by-Claim Verification

### Claim 1: "`body[data-mobile-sheet-state]` mechanism is stable and theme-agnostic"

**Verdict: VERIFIED ✅**

**Evidence:**
- v1's `MobileSidebar` (Sidebar.tsx:275) sets `document.body.setAttribute('data-mobile-sheet-state', state)` and cleans up on unmount (Sidebar.tsx:280-282).
- v2's `AppUIv2` is rendered **exclusively** via `uiTheme === 'v2' ? <AppUIv2 /> : <AppUI />` (App.tsx:536-543). **No race condition is possible** — only one theme is active at any time.
- WebGPUPreview.css selectors (lines 141-147) target `body[data-mobile-sheet-state] .pf-wgpu-preview__canvas`. The canvas class `pf-wgpu-preview__canvas` is shared across both themes — it's set in App.tsx:428 which is upstream of the theme switch. ✅

**One concern dispatched:** I checked whether any other code sets this attribute. Only `MobileSidebar` in Sidebar.tsx does. v2 will add a second setter, but since v1 and v2 are mutually exclusive, no conflict.

---

### Claim 2: "Radix Tabs works correctly when reparented into a bottom sheet"

**Verdict: VERIFIED ✅ with one NOTE**

**Evidence:**
- Radix `Tabs.Root` IS the context provider. In SidebarV2.tsx (line 184), it's used in controlled mode with `value={activeTab}` and `onValueChange={handleTabChange}`. Controlled Radix Tabs has **no DOM positioning dependency** — the state is external.
- No Radix context providers exist above `Tabs.Root` that would break. The Radix docs confirm: `Tabs.Root` wraps everything; no external provider needed.
- `useSwipeGesture` (useSwipeGesture.ts) is attached to `contentRef` (SidebarV2.tsx:134) and only fires for horizontal swipes (filter at line 80: `absX <= absY * 1.2`). Vertical drag on the sheet handle will NOT trigger tab switches. ✅

### N1 [NOTE]: useSwipeGesture re-attachment
`useSwipeGesture` is currently attached to `contentRef` in SidebarV2.tsx:134. In MobileSheetV2, the Executioner must create a new `contentRef` and attach `useSwipeGesture` there. This is straightforward but must not be forgotten.

---

### Claim 3: "Canvas translateY values (-20%, -35%) are correct for v2"

**Verdict: ACCEPT WITH AMENDMENTS**

**Evidence — the math:**

CSS `translateY(%)` is relative to the element's own height. The canvas is `height: 100%` inside a `height: 100vh` container (WebGPUPreview.css:120-121). So the reference height is 100vh.

| Sheet State | Sheet Height | translateY | Canvas vertical span | Visible above sheet | Pot center (50vh → shifted) |
|---|---|---|---|---|---|
| half | 50vh | -20vh | [-20vh, 80vh] | [0, 50vh] = 50vh | 30vh ✅ |
| full | 85vh | -35vh | [-35vh, 65vh] | [0, 15vh] = 15vh | 15vh ⚠️ |

**Half state**: Pot center shifts from 50vh to 30vh. This is well inside the visible 50vh window. ✅

**Full state**: Pot center shifts to 15vh. The visible canvas is only 15vh tall. The pot is at the very bottom edge of the visible area. For tall pots, the top will be clipped.

### C1 [WARNING]: Canvas offset in "full" state may clip taller pots

**Generator's claim**: "The 85vh full-state needs translateY(-35%)"

**Actual behavior**: At `-35vh` translation with 85vh sheet, only 15vh of canvas is visible. The pot center is at exactly 15vh — the lower boundary. Any pot taller than ~15vh (which most are) will have its bottom portion hidden behind the sheet.

**Counterexample**: A tall vase with H=240mm renders with ~60% of the canvas height occupied. At 15vh visible, only the top third of the vase appears.

**Mitigating factor**: The "full" state (85vh sheet) is primarily for editing controls, not viewing the pot. Users collapse the sheet to see the full pot. v1 has the same values and users don't complain.

**Required fix**: Not a blocker — keep v1-proven values. But consider adding a `collapsed` state translateY of `0` to the CSS as a defensive measure (currently absent, defaulting to no transform). This is already correct since no CSS rule fires for `collapsed` state.

### C2 [WARNING]: v2 toolbar overlaps shifted canvas

**Generator's claim**: "Canvas coordination is free via existing CSS"

**Actual behavior**: v2 has a `ToolbarV2` at `position: fixed; top` (confirmed in AppUIv2.tsx). When the canvas shifts up by 20-35vh, the visible pot occupies the same top region as the toolbar. The toolbar buttons could visually overlap the pot rendering.

**v1 had no toolbar at the top**, so this was never an issue. v2 introduces a new visual conflict.

**Required fix**: Not a code blocker — this is a design refinement. The toolbar is semi-transparent / blurred, and the pot is 3D underneath. Acceptable for now. If problematic, the toolbar could get `margin-top` in its mobile media query to give the canvas more room.

---

### Claim 4: "`useMobile()` returns correct values inside the v2 component tree"

**Verdict: VERIFIED ✅**

**Evidence:**
- `useMobile()` (useMobile.ts:66-139) uses `window.innerWidth` and `window.matchMedia()`. These are global browser APIs with **no React context dependency**.
- The lazy boundary at `React.lazy(() => import('./ui/v2/AppUIv2'))` (App.tsx:22) affects code loading timing, not hook behavior. Once AppUIv2 renders, `useMobile()` reads `window.innerWidth` synchronously in the `useState` initializer (useMobile.ts:85). ✅
- SSR guard: `typeof window === 'undefined'` checks at lines 77, 82, 85, 89 return safe defaults. Since PotFoundry is a SPA, these never fire in production. No hydration flash risk. ✅

**Note**: SidebarV2 does NOT currently import `useMobile`. The proposal correctly identifies this as a MODIFY.

---

### Claim 5: "Touch events on the sheet don't leak to the canvas"

**Verdict: VERIFIED ✅ with one clarification**

**Evidence:**
- Canvas touch listeners are registered on the **canvas element directly** (webgpu_core.ts:2751-2754):
  ```
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);
  ```
  They are NOT on `document`. ✅

- Touch event targeting: the browser sends `touchstart` to the **topmost element at the touch coordinates**. If the sheet (z-index 160) visually covers a point, AND it's a positioned element in the same stacking context, the sheet receives the touch, not the canvas.

- The canvas has `touch-action: none` (WebGPUPreview.css:30), which only applies to touches **targeted at the canvas element**. It does NOT affect touches on the sheet.

**Clarification**: z-index doesn't "prevent event propagation" — it determines which element is the hit-test target. The Generator's reasoning arrives at the correct conclusion ("touches on the sheet never reach the canvas DOM") but the mechanism description is imprecise. The DOM layering (sheet positioned above canvas) is what matters, not z-index blocking propagation.

---

### Claim 6: "No changes to webgpu_core.ts needed"

**Verdict: VERIFIED ✅**

**Evidence:**
- ResizeManager (ResizeManager.ts:206-222) calculates canvas dimensions via `parent.getBoundingClientRect()` where `parent = canvas.parentElement`. The parent is `div.pf-wgpu-preview` (App.tsx:421-425).
- CSS `translateY` is applied to `.pf-wgpu-preview__canvas` (the canvas element, WebGPUPreview.css:142). This does NOT change the parent div's `getBoundingClientRect()`. ResizeManager sees no dimension change. ✅
- ResizeObserver is attached to `parentContainer` (ResizeManager.ts:313). The parent's size doesn't change when the canvas is translated. No spurious resize callbacks. ✅
- The canvas backing buffer stays at full viewport resolution. The GPU renders a complete pot at full quality. CSS transform only shifts where pixels display on screen, wasting some GPU work on invisible regions, but causing no visual or functional issue. ✅

---

### Claim 7: "`--pf2-radius-xl` may be undefined"

**Verdict: CONFIRMED — PRE-EXISTING BUG ✅**

**Evidence:**
- AppUIv2.css defines radius tokens at lines 59-61:
  ```css
  --pf2-radius-sm:  4px;
  --pf2-radius-md:  8px;
  --pf2-radius-lg:  12px;
  ```
  There is **no `--pf2-radius-xl`** defined.

- SidebarV2.css:230 already uses `var(--pf2-radius-xl)`:
  ```css
  border-radius: var(--pf2-radius-xl) var(--pf2-radius-xl) 0 0;
  ```
  This resolves to the initial value (no border-radius). The mobile sheet currently has **square corners** — probably unintentional.

- The Generator correctly identifies this must be added to AppUIv2.css. Proposed value `16px` follows the 4/8/12/16 progression. ✅

**Required fix**: Add `--pf2-radius-xl: 16px;` to AppUIv2.css after `--pf2-radius-lg` (line 61). This is a 1-line fix.

---

## Additional Attack Vectors

### C3 [CRITICAL]: Performance — React state updates during drag

**Generator's claim**: "During drag, only `setCurrentHeight` fires. React batching handles this."

**Actual behavior in MobileBottomSheet.tsx** (lines 110-122):
```tsx
const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const deltaY = touchStartY.current - touch.clientY;
    const newHeight = touchStartHeight.current + deltaY;
    const clampedHeight = Math.max(minH, Math.min(maxH, newHeight));
    setCurrentHeight(clampedHeight);  // ← State update EVERY touchmove frame
}, [getStateHeight]);
```

This calls `setCurrentHeight(number)` on **every touchmove event** (~60-120Hz on modern phones). Each call triggers a React re-render cycle: reconciliation → diffing → DOM update of `style={{ height: displayHeight + 'px' }}`.

**Why this matters for `useSheetDrag`**: The Generator proposes extracting this exact logic. If `useSheetDrag` preserves the same pattern, the performance issue is inherited.

**Severity assessment**: On modern phones with React 18 automatic batching, this is likely imperceptible. React's diffing for a single `style.height` change is O(1). But on low-end Android devices (which are PotFoundry's accessibility target for educational pottery), this could cause frame drops during drag.

**Required fix**: The `useSheetDrag` hook should use `useRef` + direct DOM manipulation for in-flight drag animation, then sync to React state only on snap (touchend). This is the standard pattern for performant gesture handling:

```typescript
// During drag: update DOM directly
sheetRef.current.style.height = `${clampedHeight}px`;
// On snap: sync to React state
setState(newState);
setCurrentHeight(null); // triggers CSS transition
```

This is a ~10-line change to the hook signature (accept a `ref` for the sheet container).

### C4 [CRITICAL]: Window-level mouse listeners always attached

**Actual code in MobileBottomSheet.tsx** (lines 178-186):
```tsx
useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
}, [handleMouseMove, handleMouseUp]);
```

These listeners are **always attached** while the component is mounted, even when NOT dragging. The `isDragging.current` guard inside `handleMouseMove` prevents action, but the listener still fires on **every mouse movement across the entire page**. On desktop (where users test with Chrome DevTools device mode), this means `handleMouseMove` is called 60+ times/second while moving the mouse ANYWHERE.

**Additionally**: `handleMouseMove` and `handleMouseUp` are recreated on every render (they depend on `currentHeight` and `state` via `useCallback` dependencies). Each recreation triggers the `useEffect` cleanup+re-attach cycle, briefly removing and re-adding window listeners. This is wasteful.

**Required fix**: `useSheetDrag` must attach window listeners **only during active drag** (add on mousedown, remove on mouseup), not unconditionally. Pattern:

```typescript
const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // ... setup
    const onMove = (e: MouseEvent) => { /* ... */ };
    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        // ... snap logic
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}, [...]);
```

### C5 [WARNING]: `console.log` statements in production gesture code

**Actual code**: MobileBottomSheet.tsx has `console.log('[Sheet] Touch start...', ...)` at lines 106, 137, 145, 163, 172, etc. There are **6+ console.log statements** in the gesture handlers.

**Impact**: On every touch interaction, multiple log statements fire. These are not guarded by `import.meta.env.DEV`.

**Required fix**: The extracted `useSheetDrag` hook must NOT include these console.log statements. They were debugging aids that should have been removed.

### C6 [WARNING]: `useSwipeGesture` vertical-vs-horizontal conflict zone

**Actual code in useSwipeGesture.ts** (line 80):
```typescript
if (absX <= absY * 1.2) return; // Only fire if horizontal > 1.2× vertical
```

This filter means diagonal swipes at ~40° from horizontal will NOT trigger tab switches. But the inverse problem exists: if a user intends a vertical drag on the sheet content (scrolling) but their finger drifts slightly horizontal (< 1.2× ratio), `useSwipeGesture` fires a tab switch instead of scrolling.

**Mitigating factor**: useSwipeGesture requires `minDistance = 48` (line 39), so minor drift doesn't trigger. And the `startsOnInteractiveElement` guard (line 27) prevents firing when starting on sliders/inputs.

**Verdict**: Acceptable. Not a blocker. The existing SidebarV2 already uses this hook with the same parameters. If it works on desktop scroll areas, it'll work in the mobile sheet content.

---

## New Risks Found During Verification

### R1: Breakpoint change (`TABLET_BREAKPOINT` from 768 to 1024) risks v1 regression

The Generator proposes changing `TABLET_BREAKPOINT` from 768 to 1024 (useMobile.ts). However, v1's Sidebar.tsx uses `useMobile()` which reads `MOBILE_BREAKPOINT` (768), NOT `TABLET_BREAKPOINT`. So changing `TABLET_BREAKPOINT` doesn't affect v1's mobile trigger.

But: `isTablet` IS exported and could be used elsewhere. Search shows `isTablet` is only consumed in `useMobile`'s return value. If no external code reads `isTablet`, the change is safe. If external code does, it would suddenly consider 769-1024px viewports as "tablet" instead of "desktop".

**Recommendation**: Keep `TABLET_BREAKPOINT = 768` unchanged. Add `BREAKPOINTS` object as the Generator suggests, but don't modify the default `TABLET_BREAKPOINT` export. v2 code should use `BREAKPOINTS.tablet` directly.

### R2: `panelOpen === false` hides everything on mobile

When `panelOpen === false`, SidebarV2 returns `null` (SidebarV2.tsx:153). On mobile, this means NO sheet, NO collapsed handle, NO way to reopen except via the v2 toolbar's panel toggle button.

This is actually identical to v1 behavior (Sidebar.tsx returns `null` when `!panelOpen`). The toolbar provides the re-open affordance. Not a blocker, but worth noting in the UX documentation.

### R3: `--pf2-ease-spring` has overshoot — affects sheet animation

SidebarV2.css:232 uses `animation: pf2-sheet-up var(--pf2-duration-normal) var(--pf2-ease-spring)`. The `--pf2-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` (motion.css:23) has a 1.56 y2 value, meaning the animation **overshoots its target**. For a bottom sheet sliding up, this means it briefly extends ABOVE its final position before settling.

At 50vh target height, the overshoot could make the sheet momentarily reach ~56vh, then bounce back to 50vh. This is a subtle visual effect that may or may not be desirable for a bottom sheet. v1's MobileBottomSheet uses `cubic-bezier(0.32, 0.72, 0, 1)` (no overshoot).

**Recommendation**: MobileSheetV2.css should use `--pf2-ease-enter: cubic-bezier(0.16, 1, 0.3, 1)` (no overshoot) instead of `--pf2-ease-spring` for the snap animation. Or define a dedicated `--pf2-ease-sheet` token. The spring easing is fine for button presses but jarring for a large surface area.

---

## Accepted Items

1. **Proposal 1 over Proposals 2 and 3**: Correct architectural choice. Proposal 2 (inline everything) violates SRP. Proposal 3 (rewrite v1) violates "don't break v1." ✅
2. **`body[data-mobile-sheet-state]` bridge pattern**: Proven, theme-agnostic, no race conditions. ✅
3. **Mutual exclusivity of v1/v2**: Confirmed at App.tsx:536. No dual-setter risk. ✅
4. **CSS selectors work for both themes**: `.pf-wgpu-preview__canvas` is set in App.tsx:428, upstream of theme switch. ✅
5. **Canvas resize unaffected by translateY**: ResizeManager observes parent, not canvas. Transform doesn't change parent rect. ✅
6. **Touch event routing via DOM layering**: Canvas listeners on canvas element, not document. Sheet at higher z-index receives touches in its area. ✅
7. **`useMobile()` works in lazy-loaded v2 tree**: No React context dependency. Window API is always available. ✅
8. **Radix Tabs controlled mode is position-independent**: Correct. ✅
9. **Migration path (4 atomic changesets)**: Each is independently testable and rollback-safe. ✅
10. **Sheet state in component state (not Zustand)**: Correct — this is presentation state, not app state. YAGNI principle properly applied. ✅

---

## Overall Conditions for ACCEPT

The Generator's Proposal 1 is **ACCEPTED** subject to these mandatory amendments:

### Amendment A1 (CRITICAL): `useSheetDrag` must use ref-based DOM updates during drag
No `setCurrentHeight()` on every touchmove. Use `sheetRef.current.style.height = ...` during drag, sync to React state only on snap. Accept a `RefObject<HTMLElement>` in the hook config.

### Amendment A2 (CRITICAL): Window mouse listeners must be drag-scoped
Attach `mousemove`/`mouseup` on `window` only inside the `mousedown` handler. Remove them in `mouseup`. Do not use an always-on `useEffect`.

### Amendment A3 (WARNING → REQUIRED): No `console.log` in `useSheetDrag`
Strip all 6+ console.log statements from the extracted gesture logic. If debugging is needed, use a `debug?: boolean` config option gated behind `import.meta.env.DEV`.

### Amendment A4 (REQUIRED): Add `--pf2-radius-xl: 16px` to AppUIv2.css
Pre-existing bug. Must be fixed before or alongside this work.

### Amendment A5 (REQUIRED): Use `--pf2-ease-enter` (not `--pf2-ease-spring`) for sheet snap animation
The spring curve's overshoot is jarring on a large-surface bottom sheet.

### Amendment A6 (RECOMMENDED): Do NOT change `TABLET_BREAKPOINT` default value
Add `BREAKPOINTS` object as additive API. Leave `TABLET_BREAKPOINT = 768` export unchanged for v1 compatibility. v2 code calls `useMobile({ breakpoint: 768 })` explicitly if needed (which is already the default).

---

## Implementation Guidance for Executioner

### Priority order:
1. **Changeset 1**: Create `useSheetDrag.ts` with amendments A1, A2, A3. Write unit tests.
2. **Changeset 2**: Add `--pf2-radius-xl: 16px` to AppUIv2.css (amendment A4). 1-line fix.
3. **Changeset 3**: Create `MobileSheetV2.tsx` + `.css` using `--pf2-ease-enter` (A5). Attach `useSwipeGesture` to content ref.
4. **Changeset 4**: Modify SidebarV2.tsx with `useMobile()` conditional rendering. Remove dead CSS-only mobile block from SidebarV2.css.
5. **Changeset 5**: Safe-area-inset fixes for header and toolbar (styles.css, ToolbarV2.css).

### Validation protocol:
- `npm run typecheck` — must pass with 0 errors
- `npm run lint` — must pass with 0 warnings
- `npm test` — all existing tests pass
- Manual test: Chrome DevTools → device mode → iPhone 14 Pro (390×844)
  - Verify: sheet drag up/down snaps to 3 states
  - Verify: canvas shows pot above the sheet
  - Verify: tab switching works via swipe and tap
  - Verify: collapsed handle shows 72px grip bar
  - Verify: canvas touch gestures (rotate/pan/zoom) work when sheet is collapsed
- Manual test: Chrome DevTools → device mode → iPad (768×1024 portrait)
  - Verify: narrow sidebar (280px) renders, NOT bottom sheet (per CSS tablet rule)

---

## Open Questions (Returning to Generator)

1. **A1 implementation detail**: Should `useSheetDrag` accept the ref via config object or as a separate argument? `useSheetDrag(sheetRef, config)` or `useSheetDrag({ ref: sheetRef, ...config })`?

2. **Collapse dismissal**: The Generator asks whether the collapsed handle (72px) should show when `panelOpen === false`. My recommendation: NO — keep v1 parity. The toolbar toggle is the re-open affordance. Adding a persistent handle when `panelOpen === false` would require additional z-index and layout work that's out of scope.

3. **Landscape phone**: Agree this should be deferred to a follow-up. The 50vh sheet at 390px landscape height (195px) is tight but usable. The half-state can be adjusted later.
