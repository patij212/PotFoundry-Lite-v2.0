# Generator Round 25 — Mobile Responsiveness Architecture for v2 UI
Date: 2026-03-12

## Problem Statement

PotFoundry's v2 ("editorial") UI is non-functional on mobile. The current "fix" is a CSS-only `@media (max-width: 768px)` block in `SidebarV2.css:216-237` that converts the left sidebar to a `position: fixed; bottom: 0; height: 50vh` panel. This is fundamentally broken because:

1. **No interactivity** — the 50vh panel is static. No drag handle, no collapse/expand, no way to dismiss it to see the full 3D canvas.
2. **No canvas coordination** — v2 never sets `body[data-mobile-sheet-state]`, so `WebGPUPreview.css:139-151` canvas offset rules never fire. The pot is hidden behind the panel.
3. **No gesture routing** — `useSwipeGesture` (used in SidebarV2) only handles **horizontal** swipes for tab switching. No vertical drag-to-resize.
4. **Broken breakpoints** — `useMobile.ts:16-18` has `MOBILE_BREAKPOINT === TABLET_BREAKPOINT === 768`, making `isTablet` semantically empty.
5. **Header collision** — `pf-app__header` (App.tsx:415) is `position: fixed; top: 16px; right: 16px; z-index: 100`. On mobile, this overlaps the v2 toolbar (`z-index: 50`). No safe-area-inset handling.

Meanwhile, v1 (classic theme) has a **complete, working** mobile system:
- `Sidebar.tsx:310-320` uses `useMobile()` to conditionally render `MobileSidebar`
- `MobileSidebar` wraps `MobileBottomSheet.tsx` which has: 3 states (collapsed 72px / half 50vh / full 85vh), touch drag-to-resize with snap, mouse fallback, keyboard escape
- `Sidebar.tsx:275` sets `body.setAttribute('data-mobile-sheet-state', state)` on every state change
- `WebGPUPreview.css:141-147` reads this attribute to `translateY` the canvas

**The core failure**: v2 tried to solve mobile with CSS. CSS cannot do stateful gesture management. Period.

---

## Root Cause Analysis

### Data Flow: What v1 Does Right

```
MobileBottomSheet.tsx (touch gesture)
  → setState(SheetState)
    → onStateChange callback fires
      → MobileSidebar.tsx sets body[data-mobile-sheet-state]
        → WebGPUPreview.css reads attribute, applies translateY to canvas
        → User sees pot above the sheet, can interact with both
```

### What v2 Does Wrong

```
SidebarV2.css @media (max-width: 768px)
  → Hides resize handle
  → Sets fixed position bottom with height: 50vh
  → DONE. No JS. No state. No canvas coordination.
```

The canvas still fills `position: fixed; inset: 0` via `.pf-wgpu-preview--fullscreen`. The 50vh panel sits ON TOP of the canvas. The pot is behind the panel. This is the entire bug.

---

## Proposals

### Proposal 1: Composition Pattern — `MobileSheetV2` with Shared Gesture Hook (⭐ RECOMMENDED)

**Idea**: Extract the vertical drag gesture logic from `MobileBottomSheet.tsx` into a reusable `useSheetDrag` hook. Create a new `MobileSheetV2.tsx` component styled with v2 design tokens. `SidebarV2.tsx` uses `useMobile()` to conditionally render `MobileSheetV2` on mobile instead of the CSS-only panel.

**Mechanism**:

#### Step 1: Extract `useSheetDrag` hook

From `MobileBottomSheet.tsx:83-185`, extract the touch/mouse drag logic into `src/hooks/useSheetDrag.ts`. This hook manages:
- `touchStartY`, `touchStartHeight`, `isDragging` refs
- `handleTouchStart/Move/End`, `handleMouseDown`, window-level `mousemove/mouseup`
- Snap-to-nearest-state on release
- Returns `{ state, currentHeight, displayHeight, isAnimating, handlers }` where handlers is `{ onTouchStart, onTouchMove, onTouchEnd, onMouseDown }`

Both v1 `MobileBottomSheet` and v2 `MobileSheetV2` consume this hook. v1 behavior is preserved byte-for-byte because the hook's logic is identical.

```typescript
// src/hooks/useSheetDrag.ts
export interface SheetDragConfig {
  handleHeight: number;       // collapsed height (px)
  halfPercent: number;         // half-open as % of vh
  maxPercent: number;          // full-open as % of vh
  initialState: SheetState;
  onStateChange?: (state: SheetState) => void;
}

export interface SheetDragResult {
  state: SheetState;
  displayHeight: number;
  isAnimating: boolean;
  dragHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
  };
  toggle: () => void;
}
```

#### Step 2: Create `MobileSheetV2.tsx`

A v2-styled bottom sheet that:
- Uses `useSheetDrag` for gesture management
- Renders a v2-themed drag handle (grip bar, no title row — follows v2 minimal aesthetic)
- Contains the Radix `Tabs.Root` + tab content from SidebarV2
- Sets `body[data-mobile-sheet-state]` on every state change (like v1 does at Sidebar.tsx:275)
- Has `touch-action: pan-x` on the handle (allows vertical drag while passing horizontal)
- Has `touch-action: pan-y` on the content area (allows vertical scroll)
- Uses v2 design tokens (`--pf2-bg-base`, `--pf2-border`, `--pf2-radius-xl`, `--pf2-shadow-float`)
- Supports `env(safe-area-inset-bottom)` padding

#### Step 3: Modify `SidebarV2.tsx`

Add conditional rendering based on `useMobile()`:

```tsx
const { isMobile } = useMobile();

if (isMobile) {
  return <MobileSheetV2 activeTab={activeTab} onTabChange={handleTabChange} />;
}

// existing desktop sidebar JSX...
```

#### Step 4: Canvas coordination via existing CSS

The existing `WebGPUPreview.css:139-151` rules already handle `body[data-mobile-sheet-state]`. Because v2's `MobileSheetV2` sets this attribute identically to v1, the canvas offset **just works** without any CSS changes. This is the elegance of the `body` attribute approach — it's theme-agnostic.

**Mathematical basis**: The 50vh half-state means the canvas needs `translateY(-20%)` to center the pot in the visible 50% above the sheet. The 85vh full-state needs `translateY(-35%)`. These values are already calibrated in `WebGPUPreview.css`.

**Files affected**:
- CREATE: `src/hooks/useSheetDrag.ts` (new shared hook)
- CREATE: `src/ui/v2/layout/MobileSheetV2.tsx` (new v2 mobile component)
- CREATE: `src/ui/v2/layout/MobileSheetV2.css` (v2-styled sheet CSS)
- MODIFY: `src/ui/v2/layout/SidebarV2.tsx` (add conditional mobile rendering)
- MODIFY: `src/ui/v2/layout/SidebarV2.css` (remove/disable CSS-only mobile block)
- MODIFY: `src/ui/layout/MobileBottomSheet.tsx` (consume `useSheetDrag` instead of inline logic — optional, not required for v2 fix)

**Trade-offs**:
- ✅ DRY: gesture logic shared between themes
- ✅ v1 unaffected if we don't refactor MobileBottomSheet (can be a follow-up)
- ✅ Canvas coordination works for free via existing CSS
- ⚠️ New file count: +3 files
- ⚠️ Must test that `useMobile()` correctly triggers in SidebarV2 context (it should — it uses `matchMedia`)

**Assumptions** (for Verifier to attack):
1. The `body[data-mobile-sheet-state]` attribute mechanism is stable and not about to be refactored
2. `useMobile()` returns correct values inside the v2 component tree (no conditional rendering ancestor that prevents window sizing)
3. The v2 Radix Tabs component works correctly when reparented into a bottom sheet container (no Radix context issues)
4. `WebGPUPreview.css` canvas offset values (-20% / -35%) are correct for v2 layout (v2 toolbar is top-center vs v1's left-aligned)
5. Extracting `useSheetDrag` won't break v1 if we also refactor `MobileBottomSheet` to use it

---

### Proposal 2: Minimal Shim — SidebarV2 Sets Body Attribute + JS Height Toggle (Conservative)

**Idea**: Don't create new components. Instead, add minimal JS to `SidebarV2.tsx` that:
- Detects mobile via `useMobile()`
- On mobile, adds a drag handle div at the top
- Manages collapsed/half/full state inline
- Sets `body[data-mobile-sheet-state]`

**Mechanism**:

```tsx
// In SidebarV2.tsx, add:
const { isMobile } = useMobile();
const [sheetState, setSheetState] = useState<SheetState>('half');

useEffect(() => {
  if (isMobile) {
    document.body.setAttribute('data-mobile-sheet-state', sheetState);
    return () => document.body.removeAttribute('data-mobile-sheet-state');
  }
}, [isMobile, sheetState]);
```

And modify the existing `@media (max-width: 768px)` CSS to use `data-sheet-state` for height:

```css
.pf2-sidebar[data-sheet-state="collapsed"] { height: 72px; }
.pf2-sidebar[data-sheet-state="half"] { height: 50vh; }
.pf2-sidebar[data-sheet-state="full"] { height: 85vh; }
```

Add touch handlers for drag-to-resize to the sidebar header area.

**Files affected**:
- MODIFY: `src/ui/v2/layout/SidebarV2.tsx` (~80 lines of gesture logic added inline)
- MODIFY: `src/ui/v2/layout/SidebarV2.css` (update mobile media query, add state-based heights)
- No new files

**Trade-offs**:
- ✅ Fewest files changed
- ✅ No new components
- ⚠️ Duplicates gesture logic from MobileBottomSheet (DRY violation)
- ⚠️ SidebarV2.tsx becomes cluttered with mobile-specific code
- ⚠️ Harder to test — gesture logic mixed with UI logic
- ❌ No structural separation between mobile and desktop codepaths

**Assumptions**:
1. SidebarV2.tsx isn't already too large to absorb gesture logic
2. The Radix Tabs layout works identically in both 50vh and full-screen height contexts
3. Adding touch handlers to the sidebar header doesn't conflict with the close button click handler

---

### Proposal 3: Universal Responsive Shell (Radical)

**Idea**: Create a `ResponsiveShell.tsx` component that both v1 and v2 use as their mobile container. It handles:
- Bottom sheet gesture management
- Canvas coordination
- Safe area insets
- Body attribute management

Each theme passes its content as `children` and a style config object.

**Mechanism**:

```tsx
<ResponsiveShell
  config={{
    tokens: v2Tokens,  // or v1Tokens
    gripStyle: 'minimal', // v2 = minimal grip, v1 = titled handle
  }}
  onStateChange={handleSheetState}
>
  {/* Theme-specific tab content */}
</ResponsiveShell>
```

**Files affected**:
- CREATE: `src/ui/shared/ResponsiveShell.tsx`
- CREATE: `src/ui/shared/ResponsiveShell.css`
- MODIFY: `src/ui/layout/Sidebar.tsx` (use ResponsiveShell)
- MODIFY: `src/ui/v2/layout/SidebarV2.tsx` (use ResponsiveShell)
- DELETE: `src/ui/layout/MobileBottomSheet.tsx` (replaced)

**Trade-offs**:
- ✅ Maximum DRY — one gesture system
- ✅ Future themes automatically get mobile support
- ⚠️ High refactoring risk — v1 is working, modifying it risks regression
- ⚠️ Abstraction overhead — config object must anticipate both themes' needs
- ❌ Violates "Don't break v1" constraint — touching v1's working system

**Assumptions**:
1. v1 and v2 bottom sheet needs are similar enough to share a component
2. The config pattern can handle v1's title+subtitle header vs v2's minimal grip
3. Replacing MobileBottomSheet won't break any tests or integrations

---

## Breakpoint Strategy

### Current (Broken)
```typescript
// useMobile.ts:16-18
export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 768;  // ← same as mobile!
```

This means `isMobile === isTablet` always. Useless.

### Proposed Breakpoints

| Breakpoint | Width | What Changes |
|---|---|---|
| **Phone** | ≤ 480px | Bottom sheet, single-column, minimal toolbar |
| **Tablet** | 481px – 1024px | Bottom sheet (wider handle), or narrow sidebar (landscape), compact toolbar |
| **Desktop** | > 1024px | Full sidebar (380px default), full toolbar |

```typescript
// useMobile.ts — new values
export const PHONE_BREAKPOINT = 480;
export const TABLET_BREAKPOINT = 1024;
export const MOBILE_BREAKPOINT = TABLET_BREAKPOINT; // "mobile" = anything ≤ 1024 (tablet + phone)
```

**Key insight**: The bottom sheet should activate on **all** tablet-and-below viewports, not just phones. A 768px iPad in portrait is too narrow for a fixed left sidebar — the 3D canvas needs every pixel. The v1 system already uses 768px as the mobile cutoff, and v2's CSS-only media query does too. I propose raising the breakpoint to **1024px** for v2 so tablets always get the bottom sheet, while keeping v1's breakpoint unchanged to avoid regression.

However, this could be controversial. An alternative is keeping 768px as the bottom-sheet trigger and using 1024px only for "narrow sidebar" mode. The Verifier should weigh in.

**For v2 specifically**:

| Viewport | v2 Layout |
|---|---|
| ≤ 768px | `MobileSheetV2` bottom sheet (3 states) |
| 769px – 1024px | Narrow sidebar (280px, no resize handle) |
| > 1024px | Full sidebar (380px, resizable) |

This matches the existing `SidebarV2.css` tablet rule at line 242 (`width: 280px !important`). No change needed for the tablet CSS rule.

**The `useMobile()` hook remains backward-compatible** because it takes an `options.breakpoint` override. v2 can call `useMobile({ breakpoint: 768 })` explicitly if the default changes. But actually, the cleanest approach:

```typescript
// useMobile.ts — add named breakpoints
export const BREAKPOINTS = {
  phone: 480,
  tablet: 768,
  desktop: 1024,
} as const;

export const MOBILE_BREAKPOINT = BREAKPOINTS.tablet; // default behavior unchanged
```

This gives callers semantic names without changing default behavior.

**Assumptions** (for Verifier):
1. 768px is the right bottom-sheet trigger for v2 (matching current CSS)
2. iPad portrait (768px CSS width) should use the bottom sheet
3. The tablet narrow sidebar (769-1024px) is sufficient without a bottom sheet

---

## Touch Event Routing Architecture

### The Conflict

The canvas has `touch-action: none` (WebGPUPreview.css:30) and registers touch listeners with `passive: false` in `webgpu_core.ts` for camera rotate/pan/zoom. The sidebar content needs `touch-action: pan-y` for vertical scrolling. The sheet handle needs to capture vertical drags for resizing.

### The Solution (Same as v1)

```
┌─────────────────────────────────────────┐
│ Canvas: touch-action: none              │ ← Camera gestures (rotate/pan/zoom)
│ z-index: 0                              │    All touches consumed by webgpu_core
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ MobileSheetV2: z-index: 160     │   │ ← Sheet overlays canvas
│   │                                  │   │
│   │ ┌──────────────────────────────┐ │   │
│   │ │ Handle: touch-action: pan-x  │ │   │ ← Vertical touch captured by JS
│   │ │ Captures touchstart/move/end │ │   │    Horizontal passes through (unused)
│   │ └──────────────────────────────┘ │   │
│   │                                  │   │
│   │ ┌──────────────────────────────┐ │   │
│   │ │ Content: touch-action: pan-y │ │   │ ← Native vertical scroll
│   │ │ overflow-y: auto             │ │   │    Horizontal swipe → tab switch
│   │ └──────────────────────────────┘ │   │    (useSwipeGesture, passive listeners)
│   │                                  │   │
│   └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Key rules**:
1. The sheet's z-index (160) is above the canvas. Touches on the sheet never reach the canvas DOM.
2. The handle area intercepts `touchstart` with `passive: false` for drag gestures. Uses `e.preventDefault()` only on the handle.
3. The content area uses `passive: true` touch listeners (via `useSwipeGesture`) for horizontal tab switching. Native vertical scroll works via `touch-action: pan-y`.
4. When the sheet is collapsed (72px), most of the viewport is the canvas, so camera gestures work unobstructed.

**No changes to `webgpu_core.ts` needed.** The DOM layering handles event routing. This is identical to v1's proven approach.

**Assumptions** (for Verifier):
1. Event propagation doesn't leak through the sheet to the canvas (z-index stacking should prevent this)
2. `passive: false` on the handle's touchstart doesn't cause jank warnings in Chrome (it shouldn't, since it's a small DOM area)
3. Radix Tabs don't add their own touch handlers that interfere

---

## Header & Controls Adaptation

### Current State

`App.tsx:415-418` renders:
```tsx
<div className="pf-app__header">
  <AppSettingsButton />
  <UserMenu />
</div>
```

Styled at `styles.css:39-46`:
```css
.pf-app__header {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 100;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

### Problems on Mobile

1. **z-index collision**: Header is z-index 100, v2 toolbar is z-index 50, v2 panel is z-index 100. On desktop this is fine (toolbar is center, header is right, they don't overlap). On mobile they **do** overlap because the toolbar is `left: 50%; transform: translateX(-50%)` but at narrow widths it extends nearly to the right edge.

2. **No safe area insets**: On iPhone with notch/Dynamic Island, `top: 16px` can be behind the notch.

3. **Touch targets**: `AppSettingsButton` and `UserMenu` may be smaller than 44×44px minimum.

### Proposed Changes

```css
/* styles.css — add mobile adaptations */

@media (max-width: 768px) {
  .pf-app__header {
    top: max(8px, env(safe-area-inset-top, 8px));
    right: max(8px, env(safe-area-inset-right, 8px));
    z-index: 100; /* above toolbar (50) but below sheet (160) */
    gap: 4px;
  }

  /* Ensure minimum 44×44px touch targets */
  .pf-app__header button {
    min-width: 44px;
    min-height: 44px;
  }
}
```

And for the v2 toolbar:
```css
/* ToolbarV2.css — already has mobile styles at line 131 */
/* Add safe-area-inset-top */
@media (max-width: 768px) {
  .pf2-toolbar {
    top: max(8px, env(safe-area-inset-top, 8px));
    /* ... existing compact styles ... */
  }
}
```

**For v2 specifically**, the header buttons (AppSettingsButton, UserMenu) could be moved INTO the toolbar on mobile to save vertical space. But this is a bigger refactor (they're rendered in `App.tsx`, not `AppUIv2.tsx`). For now, safe-area + touch-target fixes are sufficient.

**Assumptions**:
1. `env(safe-area-inset-top)` is well-supported on target browsers (Safari 11+, Chrome 69+)
2. The toolbar and header don't physically overlap at 320px width (minimum phone width)
3. Moving AppSettingsButton/UserMenu into the v2 toolbar is out of scope for this proposal

---

## State Management

### What Already Exists in Zustand (types.ts:263-288)

```typescript
interface UIState {
  panelOpen: boolean;
  zenMode: boolean;
  uiTheme: UITheme;
  v2ActiveTab: V2Tab;
  hapticsEnabled: boolean;
  // ... more
}
```

### What's Needed for Mobile Sheet

**Option A: Keep sheet state in React component state** (recommended)

The sheet state (collapsed/half/full) is a **UI presentation concern**, not application state. It doesn't need to persist across page reloads. It doesn't need to be accessed by other components. It maps to `body[data-mobile-sheet-state]` via a side effect.

```typescript
// Inside MobileSheetV2.tsx
const [sheetState, setSheetState] = useState<SheetState>('half');

useEffect(() => {
  document.body.setAttribute('data-mobile-sheet-state', sheetState);
  return () => document.body.removeAttribute('data-mobile-sheet-state');
}, [sheetState]);
```

This is exactly what v1 does (Sidebar.tsx:275-281). Proven pattern.

**Option B: Add to Zustand UIState**

```typescript
interface UIState {
  // ... existing
  mobileSheetState: SheetState; // new
  setMobileSheetState: (s: SheetState) => void; // new
}
```

This would let the toolbar or other components read the sheet state. For example, the toolbar could show a "collapse sheet" button. But it adds complexity and Zustand persistence overhead.

**Recommendation**: Option A for now (component state). If a future feature needs to read sheet state from other components, promote to Zustand then. YAGNI.

**The `useSheetDrag` hook doesn't need Zustand** — it operates on local refs and state. The only Zustand interaction is reading `panelOpen` and `zenMode` to decide whether to render at all.

---

## Component Tree (Mobile, v2 Theme)

### Desktop (Current, Unchanged)

```
<AppUIv2>
  <ToolbarV2 />              position: fixed, top center, z-index: 50
  <SidebarV2 />              position: fixed, left, z-index: 100
</AppUIv2>
```

### Mobile (Proposed)

```
<AppUIv2>
  <ToolbarV2 />              position: fixed, top center, z-index: 50
                              (compact mode via CSS media query, already exists)
  <SidebarV2>                conditional branch:
    └─ <MobileSheetV2>       position: fixed, bottom, z-index: 160
        ├─ handle             drag grip bar (v2 styled, minimal)
        ├─ tab-list           horizontal tab buttons (Shape/Style/Export)
        └─ tab-content        scrollable content area
  </SidebarV2>
</AppUIv2>
```

The `SidebarV2` component renders either:
- **Desktop**: the existing `<aside>` with resize handle
- **Mobile**: `<MobileSheetV2>` with the same tab content

---

## CSS Strategy Summary

### New CSS File: `MobileSheetV2.css`

```css
.pf2-mobile-sheet {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 160;
  display: flex;
  flex-direction: column;
  background: rgba(15, 15, 18, 0.96);
  border-radius: var(--pf2-radius-xl) var(--pf2-radius-xl) 0 0;
  border-top: 1px solid var(--pf2-border);
  box-shadow: 0 -4px 32px rgba(0,0,0,0.4);
  padding-bottom: env(safe-area-inset-bottom, 0);
  overflow: hidden;
  transition: height 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}

/* backdrop-filter for glass effect */
@supports (backdrop-filter: blur(12px)) {
  .pf2-mobile-sheet {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}

.pf2-mobile-sheet--dragging {
  transition: none !important;
}
```

### Modified CSS: `SidebarV2.css`

Remove or neuter the `@media (max-width: 768px)` block (lines 216-237). Since SidebarV2 won't render on mobile anymore (replaced by MobileSheetV2), this CSS is dead code. But to be safe, gate it:

```css
/* Only apply if JS hasn't taken over rendering */
@media (max-width: 768px) {
  .pf2-sidebar:not(.pf2-sidebar--desktop-only) {
    /* old rules — but SidebarV2 adds .pf2-sidebar--desktop-only on mobile */
    display: none; /* JS renders MobileSheetV2 instead */
  }
}
```

Actually, cleaner: since `SidebarV2.tsx` returns `<MobileSheetV2>` on mobile (not `<aside class="pf2-sidebar">`), the CSS media query for `.pf2-sidebar` simply never matches. We can leave it as a no-op fallback for SSR/JS-disabled scenarios, or remove it. I'd remove it to avoid confusion.

### Unchanged CSS: `WebGPUPreview.css`

Lines 139-151 remain as-is. The `body[data-mobile-sheet-state]` → `translateY` system works for both themes.

### Modified CSS: `styles.css` and `ToolbarV2.css`

Add safe-area-inset and touch-target rules as described in "Header & Controls Adaptation" above.

---

## File Changes (Complete List)

| File | Action | What |
|---|---|---|
| `src/hooks/useSheetDrag.ts` | **CREATE** | Shared vertical drag gesture hook (extracted from MobileBottomSheet logic) |
| `src/ui/v2/layout/MobileSheetV2.tsx` | **CREATE** | v2-styled mobile bottom sheet component |
| `src/ui/v2/layout/MobileSheetV2.css` | **CREATE** | Styles for v2 mobile bottom sheet |
| `src/ui/v2/layout/SidebarV2.tsx` | **MODIFY** | Import `useMobile`, conditionally render `MobileSheetV2` on mobile |
| `src/ui/v2/layout/SidebarV2.css` | **MODIFY** | Remove CSS-only mobile bottom sheet rules (lines 216-237) |
| `src/hooks/useMobile.ts` | **MODIFY** | Add `BREAKPOINTS` const, fix `TABLET_BREAKPOINT` to 1024 or at minimum add named constants |
| `src/styles.css` | **MODIFY** | Add mobile safe-area and touch-target rules for `.pf-app__header` |
| `src/ui/v2/layout/ToolbarV2.css` | **MODIFY** | Add `safe-area-inset-top` to mobile toolbar rules |
| `src/ui/v2/AppUIv2.css` | **MODIFY** | Add `--pf2-radius-xl: 16px` token (currently undefined, used in SidebarV2.css) |

**Optional follow-up** (not required for v2 fix, but improves DRY):
| `src/ui/layout/MobileBottomSheet.tsx` | **MODIFY** | Refactor to consume `useSheetDrag` instead of inline gesture logic |

---

## Migration Path (Atomic Changesets)

### Changeset 1: Infrastructure (no visible change)
- Create `src/hooks/useSheetDrag.ts`
- Modify `src/hooks/useMobile.ts` (add `BREAKPOINTS` const)
- Run: `npm run typecheck && npm run lint && npm test`

### Changeset 2: v2 Mobile Sheet Component (inert until wired)
- Create `MobileSheetV2.tsx` + `MobileSheetV2.css`
- Import and test in isolation (Vitest unit test)
- Run: `npm run typecheck && npm run lint && npm test`

### Changeset 3: Wire Into SidebarV2 (feature goes live)
- Modify `SidebarV2.tsx` to conditionally render `MobileSheetV2`
- Modify `SidebarV2.css` to remove CSS-only mobile rules
- Run: full test suite + manual mobile test (Chrome DevTools device mode)

### Changeset 4: Polish (safe-area, touch targets)
- Modify `styles.css` and `ToolbarV2.css` for safe-area insets
- Add `--pf2-radius-xl` to `AppUIv2.css` if not already defined
- Run: `npm run typecheck && npm run lint && npm test`

### Changeset 5: Optional DRY cleanup
- Refactor v1 `MobileBottomSheet.tsx` to use `useSheetDrag`
- Regression test v1 mobile behavior

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Radix Tabs context issues when reparented into MobileSheetV2 | Low | High | Radix Tabs is headless — it doesn't rely on fixed DOM position. `Tabs.Root` wraps everything. |
| `useMobile()` returns wrong value during SSR/hydration | Low | Medium | Hook already handles `typeof window === 'undefined'` (useMobile.ts:77-79). |
| Touch events leaking through sheet to canvas | Very Low | High | z-index stacking prevents this. v1 proves it works. |
| Changing `TABLET_BREAKPOINT` breaks v1 | Medium | High | **Mitigation**: Don't change the default export value. Add `BREAKPOINTS` object as an additive API. v1 code uses `TABLET_BREAKPOINT` directly, which remains 768. |
| `--pf2-radius-xl` undefined | Medium | Low | It's used in SidebarV2.css but may not be defined in AppUIv2.css. Check and add. |
| Performance: re-renders during drag | Low | Medium | `useSheetDrag` uses refs for touch tracking, only calls `setState` on touch-end snap. During drag, only `setCurrentHeight` fires (a number state update). React batching handles this. |
| v2 light theme styling for the sheet | Low | Medium | Need to add `.pf2-root[data-theme="light"] .pf2-mobile-sheet` overrides. |

---

## Recommended Approach

**Proposal 1 (Composition Pattern)** is the clear winner.

- It's significantly cleaner than Proposal 2 (inline everything)
- It's dramatically safer than Proposal 3 (rewrite v1)
- It follows the same proven architecture as v1 but with v2 styling
- The `useSheetDrag` hook provides immediate DRY value
- The migration path is 4 atomic changesets, each independently testable
- Zero changes to `webgpu_core.ts` (constraint satisfied)
- Zero changes to v1 code (constraint satisfied, unless optional Changeset 5)

The body-attribute pattern (`data-mobile-sheet-state`) is the key insight. It's the bridge between the React component tree and the CSS layout system. v1 proved it. v2 just needs to set it.

---

## Open Questions

1. **Should `MobileSheetV2` have a close button?** v2 sidebar has an X button. On mobile, "close" means collapsing the sheet. But v1's `MobileBottomSheet` has both a close button (X) AND collapse behavior. The v2 aesthetic is minimal — maybe just the grip handle, with collapse as the "close" action?

2. **What happens when `panelOpen` is false on mobile?** Currently v2 hides the sidebar entirely when `panelOpen === false`. On mobile, should the collapsed handle (72px) still be visible as a "pull up to open" affordance? Or should it fully hide? v1 shows the sheet when `panelOpen === true` and the grip is part of the collapsed state.

3. **Should the toolbar reflow on mobile?** The v2 toolbar has ~10 buttons. At 320px width, even with 2px gaps, that's potentially wider than the viewport. The current CSS uses `max-width: calc(100vw - 16px)` which will cause overflow. Should excess buttons go into a "⋯" overflow menu?

4. **Landscape phone orientation**: When a phone is landscape (e.g., 844×390 on iPhone 14 Pro), should we still use the bottom sheet? The viewport height is only 390px — a 50vh sheet would be 195px, leaving only 195px for the canvas. An alternative: in landscape + narrow-height, use a side panel instead. This adds complexity but could be addressed in a follow-up.

5. **Drag handle visual affordance**: v1 uses a full header row (title + subtitle + buttons). v2's minimal aesthetic suggests just a grip bar. But will users understand they can drag? We could add a subtle "swipe up" animation on first load, stored in localStorage as a "seen" flag.
