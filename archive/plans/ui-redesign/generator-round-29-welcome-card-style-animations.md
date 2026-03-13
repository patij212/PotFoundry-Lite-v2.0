# Generator Round 29 — First-Run Welcome Card + Style Switch Animations

Date: 2026-03-06

---

## Problem Statement

Two v2.1 onboarding/polish features need implementation plans:

1. **First-Run Welcome Card** — First-time visitors currently see a bare viewport with no guidance. The spec requires a non-modal welcome card that showcases the product (auto-rotating FourierBloom pot) and channels users into the sidebar.

2. **Style Switch Animations** — When users change the parametric style (e.g., FourierBloom → SpiralRidges), the parameter sliders currently hard-cut to the new set. The spec requires choreographed exit→pause→enter animation.

Both are "should-have" v2.1 features with existing infrastructure waiting to be wired up.

---

## Feature 1: First-Run Welcome Card

### Root Cause Analysis

The `useConfidence` hook ([src/ui/v2/onboarding/useConfidence.ts](src/ui/v2/onboarding/useConfidence.ts)) already tracks confidence level 0–3 with localStorage persistence under `pf2-user-confidence`. Level 0 (no triggers fired) is the exact first-visit signal. The `onboarding/` directory exists with only this hook — it's scaffolded for a component to land.

The auto-rotate capability exists on `ControllerContext` via `setAutoRotate(enabled: boolean)` ([src/context/ControllerContext.tsx](src/context/ControllerContext.tsx#L53)) which delegates to `webgpu_core.ts`'s `setAutoRotate` ([src/webgpu_core.ts](src/webgpu_core.ts#L1630)). The speed constant `AUTOROTATE_SPEED_DEFAULT = 0.3` rad/s ([src/camera_constants.ts](src/camera_constants.ts#L66)) matches the spec's 0.3 rpm within its semantic intent.

The z-index token `--pf2-z-welcome: 150` is pre-defined in [src/ui/v2/AppUIv2.css](src/ui/v2/AppUIv2.css#L71). The spring easing `--pf2-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` exists in [src/ui/v2/motion.css](src/ui/v2/motion.css#L22). All design tokens are in place.

### Proposals

#### Proposal 1: Pure CSS Card with React Portal (Recommended — Conservative)

**Idea**: A single `WelcomeCard.tsx` component in `src/ui/v2/onboarding/` that renders a fixed-position card. Uses the existing `useConfidence` hook for visibility and unlocking. No new state slice.

**File list**:
| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/ui/v2/onboarding/WelcomeCard.tsx` | Card component |
| CREATE | `src/ui/v2/onboarding/WelcomeCard.css` | Card styles + keyframes |
| MODIFY | `src/ui/v2/AppUIv2.tsx` | Mount `<WelcomeCard />` inside `pf2-root` |
| MODIFY | `src/ui/v2/onboarding/useConfidence.ts` | Add `isFirstRun` derived getter |

**Component structure** (`WelcomeCard.tsx`):

```tsx
// Key logic — NO new state slice. The card's visibility is derived entirely
// from useConfidence().level === 0. Dismissing the card fires unlock('auto-unlock')
// which sets level to 3 and persists to localStorage. Card never shows again.

import React, { useEffect, useRef, useState } from 'react';
import { useConfidence } from './useConfidence';
import { useControllerMaybe } from '../../../context';
import { useAppStore } from '../../../state';
import './WelcomeCard.css';

export const WelcomeCard: React.FC = () => {
  const { level, unlock } = useConfidence();
  const controller = useControllerMaybe();
  const setV2ActiveTab = useAppStore((s) => s.setV2ActiveTab);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);
  const [exiting, setExiting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Gate: only show at confidence level 0
  const shouldShow = level === 0 && !exiting;
  // Track "fully dismissed" separately to unmount after exit animation
  const [dismissed, setDismissed] = useState(false);

  // Auto-rotate when card is visible
  useEffect(() => {
    if (level !== 0 || !controller?.isReady) return;
    controller.setAutoRotate(true);
    // No cleanup — don't force-stop rotation on dismiss
  }, [level, controller?.isReady]);

  // Escape key dismissal
  useEffect(() => {
    if (level !== 0) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [level]);

  const handleDismiss = () => {
    setExiting(true);
    // Wait for fade-out animation, then unlock
    setTimeout(() => {
      unlock('auto-unlock');
      setDismissed(true);
    }, 220); // matches --pf2-duration-fast
  };

  const handlePickStyle = () => {
    setExiting(true);
    setTimeout(() => {
      unlock('preset-load');  // Level 1 — unlocks style selector area
      setPanelOpen(true);
      setV2ActiveTab('style');
      setDismissed(true);
    }, 220);
  };

  if (dismissed || level !== 0) return null;

  return (
    <div
      ref={cardRef}
      className={`pf2-welcome ${exiting ? 'pf2-welcome--exit' : ''}`}
      role="complementary"
      aria-label="Welcome to PotFoundry"
    >
      <div className="pf2-welcome__wordmark pf2-text-display">
        PotFoundry
      </div>
      <p className="pf2-welcome__tagline">
        Generative 3D pottery, ready to print.
      </p>
      <div className="pf2-welcome__actions">
        <button
          className="pf2-welcome__btn pf2-welcome__btn--accent pf2-focus-ring"
          onClick={handlePickStyle}
          autoFocus
        >
          Pick a Style
        </button>
        <button
          className="pf2-welcome__btn pf2-welcome__btn--ghost pf2-focus-ring"
          onClick={handleDismiss}
        >
          I know what I'm doing
        </button>
      </div>
    </div>
  );
};
```

**CSS** (`WelcomeCard.css`):

```css
/* ============================================================================
   WelcomeCard — First-run overlay
   Positioned bottom-right over the viewport. Non-modal.
   ============================================================================ */

/* --- Enter: spring scale from center ------------------------------------ */
@keyframes pf2-welcome-enter {
  0%   { opacity: 0; transform: scale(0.9); }
  60%  { opacity: 1; transform: scale(1.03); }
  100% { opacity: 1; transform: scale(1); }
}

/* --- Exit: fade down ---------------------------------------------------- */
@keyframes pf2-welcome-exit {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(12px); }
}

.pf2-welcome {
  position: fixed;
  bottom: var(--pf2-space-xl);
  right: var(--pf2-space-xl);
  z-index: var(--pf2-z-welcome);

  width: 320px;
  padding: var(--pf2-space-xl) var(--pf2-space-xl) var(--pf2-space-lg);

  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border-active);
  border-radius: var(--pf2-radius-lg);
  box-shadow: var(--pf2-shadow-float);

  animation: pf2-welcome-enter var(--pf2-duration-slow) var(--pf2-ease-spring) both;
  /* Delay entrance slightly so the 3D scene has time to render */
  animation-delay: 600ms;
}

.pf2-welcome--exit {
  animation: pf2-welcome-exit var(--pf2-duration-fast) var(--pf2-ease-exit) forwards;
}

/* --- Typography --------------------------------------------------------- */
.pf2-welcome__wordmark {
  font-size: 22px;
  color: var(--pf2-accent);
  margin-bottom: var(--pf2-space-xs);
}

.pf2-welcome__tagline {
  font-family: var(--pf2-font-body);
  font-size: 14px;
  color: var(--pf2-text-secondary);
  margin: 0 0 var(--pf2-space-lg);
  line-height: 1.5;
}

/* --- Buttons ------------------------------------------------------------ */
.pf2-welcome__actions {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-sm);
}

.pf2-welcome__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pf2-space-sm) var(--pf2-space-lg);
  border-radius: var(--pf2-radius-md);
  font-family: var(--pf2-font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--pf2-duration-micro) var(--pf2-ease-move),
              border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

/* Gold accent button */
.pf2-welcome__btn--accent {
  background: var(--pf2-accent);
  color: var(--pf2-bg-base);
  border: 1px solid transparent;
}
.pf2-welcome__btn--accent:hover {
  background: var(--pf2-accent-hover);
}
.pf2-welcome__btn--accent:active {
  animation: pf2-press var(--pf2-duration-micro) var(--pf2-ease-spring) both;
}

/* Ghost/secondary button */
.pf2-welcome__btn--ghost {
  background: transparent;
  color: var(--pf2-text-secondary);
  border: 1px solid var(--pf2-border-active);
}
.pf2-welcome__btn--ghost:hover {
  background: var(--pf2-bg-hover);
  color: var(--pf2-text-primary);
}
.pf2-welcome__btn--ghost:active {
  animation: pf2-press var(--pf2-duration-micro) var(--pf2-ease-spring) both;
}

/* --- Light theme overrides ---------------------------------------------- */
[data-theme="light"] .pf2-welcome {
  background: var(--pf2-bg-raised, #ffffff);
  border-color: var(--pf2-border-default, rgba(0,0,0,0.15));
  box-shadow: var(--pf2-shadow-md, 0 4px 12px rgba(0,0,0,0.1));
}

[data-theme="light"] .pf2-welcome__btn--accent {
  background: var(--pf2-accent);
  color: var(--pf2-text-on-accent, #faf8f5);
}

/* --- Mobile responsive -------------------------------------------------- */
@media (max-width: 768px) {
  .pf2-welcome {
    bottom: var(--pf2-space-md);
    right: var(--pf2-space-md);
    left: var(--pf2-space-md);
    width: auto;
  }
}

/* --- Reduced motion ----------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .pf2-welcome {
    animation: pf2-fade-in var(--pf2-duration-fast) ease both;
    animation-delay: 0ms;
  }
  .pf2-welcome--exit {
    animation: pf2-fade-out var(--pf2-duration-fast) ease both;
  }
}
```

**State management**: 

No new Zustand slice. The card's lifecycle is controlled entirely by:
- **Visibility gate**: `useConfidence().level === 0` (derived from localStorage)
- **Dismiss**: Calls `unlock('auto-unlock')` → level jumps to 3 → card never renders again
- **"Pick a Style"**: Calls `unlock('preset-load')` → level 1, then `setPanelOpen(true)` + `setV2ActiveTab('style')` to open the sidebar to the Style tab
- **Local `exiting` state**: Boolean for triggering the exit CSS animation before unmount

**Integration points**:

Mount in `AppUIv2.tsx` return JSX, after `<SidebarV2 />`:
```tsx
return (
  <AnnouncerProvider>
    <div className="pf2-root pf2-layout" ...>
      <ToolbarV2 />
      <SidebarV2 />
      <WelcomeCard />   {/* ← new */}
    </div>
  </AnnouncerProvider>
);
```

This works because:
- `WelcomeCard` uses `position: fixed` — no layout impact
- It self-gates on `level === 0` — renders nothing for returning users
- It's inside `.pf2-root` so it inherits `data-theme` for light mode
- The `z-index: 150` places it above the sidebar (100) but below modals (200)

**FourierBloom preset initialization**: 

The spec says "Viewport loads with FourierBloom preset (`fb_n1=8, fb_amp=0.22`)". The default style state is already initialized in the Zustand store. Two options:

- **Option A** (simple): Don't override — the default state is whatever the user last saved. On a truly fresh visit, the default style from `DEFAULT_STYLE_STATE` applies. If that happens to be SuperformulaBlossom, the welcome card still works. The visual showcase is "a pretty pot rotating," not specifically FourierBloom.
- **Option B** (spec-exact): On first-run detection (level 0, no localStorage), dispatch `setStyle('FourierBloom')` + `setStyleOpt('fb_n1', 8)` + `setStyleOpt('fb_amp', 0.22)` inside a `useEffect` in `WelcomeCard`. This overrides what may be in state.

**Recommendation**: Option B for spec compliance. The `useEffect` fires only once (level 0 gate + runs before paint) and sets the showcase parameters.

**Assumptions** (for Verifier to attack):
1. `useConfidence().level === 0` is a reliable first-visit signal — it relies on `localStorage.getItem('pf2-user-confidence')` returning null or `{level: 0, triggers: []}`.
2. `controller.setAutoRotate(true)` is safe to call before the first frame renders — the `isReady` guard should prevent null-pointer access.
3. The 600ms entrance delay is sufficient for WebGPU to display the first frame on most hardware.
4. `autoFocus` on the "Pick a Style" button won't steal from viewport interaction since the card is non-modal.
5. Exit animation timing (220ms JS timeout synced to CSS `--pf2-duration-fast`) is safe — CSS and JS share the same 220ms constant but there's inherent skew risk.
6. Calling `setStyle('FourierBloom')` in a `useEffect` won't cause a visible flash of the wrong style, because the GPU preview updates synchronously per-frame.

**Edge cases**:
- **Private/incognito browsing**: `localStorage` might be blocked → `loadState()` returns level 0 → card shows every visit. Acceptable — the `catch` swallows errors and returns default state.
- **Multiple tabs**: `useSyncExternalStore` won't sync across tabs since the external store is module-scoped. But the `localStorage` is shared — second tab gets level 0, shows card, user dismisses → both tabs share the updated localStorage on next load.
- **Theme switch mid-card**: The `[data-theme="light"]` selector handles this. Since `data-theme` is on `<html>` (synced in `AppUIv2.tsx`'s `useEffect`), the card picks it up via attribute selector inheritance.
- **Zen mode**: The card has `position: fixed` with `z-index: 150`. If zen mode hides the sidebar/toolbar, the card should remain visible (it's positioned independently). This is correct behavior — the welcome card should persist in zen mode.

**Accessibility**:
- `role="complementary"` with `aria-label="Welcome to PotFoundry"` marks it as a landmark
- `autoFocus` on "Pick a Style" directs keyboard users immediately
- Escape key dismissal matches dialog convention (even though this isn't a dialog)
- Both buttons have `.pf2-focus-ring` for gold halo focus indicator
- Reduced motion: spring scale → simple fade, no entrance delay

---

## Feature 2: Style Switch Animations

### Root Cause Analysis

When the user selects a new style via the `SelectV2` dropdown in `StyleTab` ([src/ui/v2/tabs/StyleTab.tsx](src/ui/v2/tabs/StyleTab.tsx)), `handleStyleChange` calls `setStyle(value)` which replaces `style.name` and resets `style.opts` in Zustand. This causes the `basicParams` and `advancedParams` memos to recompute with the new schema, and React re-renders the parameter list.

Currently, the `key={styleName}` prop on the `.pf2-style-tab__params` div ([StyleTab.tsx line ~196](src/ui/v2/tabs/StyleTab.tsx#L196)) causes React to unmount the old params and mount new ones. The `pf2-tab-enter` animation on `.pf2-style-tab__param` ([StyleTab.css line ~20](src/ui/v2/tabs/StyleTab.css#L20)) gives incoming params a staggered entrance. **But there is no exit animation** — old params just vanish instantly.

The spec requires: exit (stagger from bottom) → 80ms pause → enter (stagger from top).

### Proposals

#### Proposal 1: CSS Animation Classes + Ref-Based Phase Machine (Recommended — Moderate)

**Idea**: A lightweight state machine inside `StyleTab` that manages three phases: `idle` → `exiting` → `pausing` → `entering` → `idle`. CSS classes drive the animation; JS manages the phase transitions via `setTimeout`.

**Mechanism**:

The `key={styleName}` trick needs to be **removed** since it unmounts immediately (no exit animation possible). Instead:
1. Maintain a `prevStyleName` ref
2. When `styleName !== prevStyleName.current`, enter `exiting` phase
3. Apply `.pf2-style-tab__param--exit` class to current params (stagger from bottom)
4. After `exitDuration` ms, enter `pausing` phase (80ms)
5. After pause, swap the displayed params to new schema and enter `entering` phase
6. Apply `.pf2-style-tab__param--enter` class (stagger from top)
7. After `enterDuration` ms, return to `idle`

**Mathematical basis**: 

Exit stagger: each param gets `animation-delay: calc((paramCount - 1 - index) * 30ms)`. For 5 params, delays are 120ms, 90ms, 60ms, 30ms, 0ms. Total exit time: `220ms + 120ms = 340ms`.

Pause: 80ms flat.

Enter stagger: each param gets `animation-delay: calc(index * 30ms)`. For 5 params, delays are 0ms, 30ms, 60ms, 90ms, 120ms. Total enter time: `220ms + 120ms = 340ms`.

Total transition budget: 340 + 80 + 340 = **760ms** — under the 1s threshold for "direct cause-and-effect" perception. Just right.

**File list**:
| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/ui/v2/hooks/useStyleTransition.ts` | Phase machine hook |
| MODIFY | `src/ui/v2/tabs/StyleTab.tsx` | Wire transition hook, remove `key={styleName}` |
| MODIFY | `src/ui/v2/tabs/StyleTab.css` | Add exit keyframes + classes |

**Hook** (`useStyleTransition.ts`):

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

type TransitionPhase = 'idle' | 'exiting' | 'pausing' | 'entering';

interface UseStyleTransitionReturn {
  /** Current animation phase */
  phase: TransitionPhase;
  /** The style name to DISPLAY (may lag behind actual during transition) */
  displayStyle: string;
  /** Notify the hook that the canonical style changed */
  onStyleChanged: (newStyle: string) => void;
}

/**
 * Manages the exit → pause → enter animation cycle for style switches.
 *
 * The hook introduces a "display style" that lags behind the actual
 * Zustand style during the exit+pause animation. This prevents React
 * from swapping the param list until the exit animation completes.
 *
 * @param currentStyle - Current style name from Zustand
 * @param exitMs - Exit animation duration (includes stagger)
 * @param pauseMs - Breathing pause between exit and enter
 * @param enterMs - Enter animation duration (includes stagger)
 */
export function useStyleTransition(
  currentStyle: string,
  exitMs = 340,
  pauseMs = 80,
  enterMs = 340
): UseStyleTransitionReturn {
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [displayStyle, setDisplayStyle] = useState(currentStyle);
  const prevStyle = useRef(currentStyle);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Check for reduced motion preference
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const onStyleChanged = useCallback((newStyle: string) => {
    // Guard: don't animate on initial mount or same-style "change"
    if (newStyle === prevStyle.current) return;
    prevStyle.current = newStyle;

    // Clear any in-flight transition
    if (timerRef.current) clearTimeout(timerRef.current);

    // Reduced motion: skip animation, just swap immediately
    if (prefersReducedMotion.current) {
      setDisplayStyle(newStyle);
      setPhase('idle');
      return;
    }

    // Phase 1: exit
    setPhase('exiting');

    timerRef.current = setTimeout(() => {
      // Phase 2: pause (swap content while invisible)
      setPhase('pausing');
      setDisplayStyle(newStyle);

      timerRef.current = setTimeout(() => {
        // Phase 3: enter
        setPhase('entering');

        timerRef.current = setTimeout(() => {
          // Phase 4: done
          setPhase('idle');
        }, enterMs);
      }, pauseMs);
    }, exitMs);
  }, [exitMs, pauseMs, enterMs]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { phase, displayStyle, onStyleChanged };
}
```

**Rapid style switching**: If the user fires multiple style changes while a transition is in flight, the `clearTimeout(timerRef.current)` cancels the in-flight sequence and starts fresh from the exit phase with the newest style. The `displayStyle` will jump to the newest value at the next pause phase. This prevents animation pile-up.

**StyleTab.tsx changes**:

```tsx
// Add import
import { useStyleTransition } from '../hooks/useStyleTransition';

// Inside StyleTab component:
const { phase, displayStyle, onStyleChanged } = useStyleTransition(styleName);

// Modify handleStyleChange:
const handleStyleChange = useCallback(
  (value: string) => {
    setStyle(value as StyleName);
    unlock('style-change');
    onStyleChanged(value);
  },
  [setStyle, unlock, onStyleChanged]
);

// Derive params from displayStyle (not styleName) during transition
const displaySchema = useMemo(
  () => STYLE_SCHEMAS[displayStyle as StyleName] ?? schema,
  [displayStyle, schema]
);
const displayBasicParams = useMemo(
  () => Object.entries(displaySchema.params),
  [displaySchema]
);

// In JSX, REMOVE the key={styleName} from the params container:
// BEFORE: <div className="pf2-style-tab__params" key={styleName}>
// AFTER:
<div className={`pf2-style-tab__params ${
  phase === 'exiting' ? 'pf2-style-tab__params--exiting' :
  phase === 'entering' ? 'pf2-style-tab__params--entering' :
  phase === 'pausing' ? 'pf2-style-tab__params--pausing' : ''
}`}>
  {displayBasicParams.map(([key, paramSchema], i) => (
    <StyleParamControl
      key={`${displayStyle}-${key}`}
      paramKey={key}
      schema={paramSchema}
      value={styleOpts[key] ?? paramSchema.default}
      onChange={handleStyleOpt}
      index={i}
    />
  ))}
</div>
```

**CSS additions** (`StyleTab.css`):

```css
/* --- Exit animation: stagger from bottom -------------------------------- */
@keyframes pf2-param-exit {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes pf2-param-enter {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Exiting: stagger from bottom (last item exits first → delay inverted) */
.pf2-style-tab__params--exiting .pf2-style-tab__param {
  animation: pf2-param-exit var(--pf2-duration-fast) var(--pf2-ease-exit) both;
  /* Invert stagger: bottom exits first. Uses CSS calc with a CSS variable
     set by the parent via a data attribute or fallback.
     For simplicity, we rely on --stagger-index already set inline. */
  animation-delay: calc(
    (var(--pf2-param-count, 5) - 1 - var(--stagger-index, 0))
    * var(--pf2-duration-stagger)
  );
}

/* Pausing: content swapped, keep invisible */
.pf2-style-tab__params--pausing .pf2-style-tab__param {
  opacity: 0;
}

/* Entering: stagger from top (first item enters first → normal order) */
.pf2-style-tab__params--entering .pf2-style-tab__param {
  animation: pf2-param-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
  animation-delay: calc(var(--stagger-index, 0) * var(--pf2-duration-stagger));
}

/* Reduced motion: override to simple opacity */
@media (prefers-reduced-motion: reduce) {
  .pf2-style-tab__params--exiting .pf2-style-tab__param,
  .pf2-style-tab__params--entering .pf2-style-tab__param {
    animation: none;
    transition: opacity var(--pf2-duration-fast) ease;
  }
  .pf2-style-tab__params--exiting .pf2-style-tab__param {
    opacity: 0;
  }
  .pf2-style-tab__params--entering .pf2-style-tab__param {
    opacity: 1;
  }
}
```

**The `--pf2-param-count` variable**: Set on the params container via inline style:

```tsx
<div
  className={`pf2-style-tab__params ${phaseClass}`}
  style={{ '--pf2-param-count': displayBasicParams.length } as React.CSSProperties}
>
```

This lets the CSS invert the stagger order for the exit animation without JS involvement.

**State management**:

- **No Zustand changes**. The transition state is entirely local to the `useStyleTransition` hook.
- `displayStyle` acts as a "view model" — it lags behind `styleName` during the exit animation, then catches up when the new params fade in.
- The `styleOpts` from Zustand will already have the new style's defaults by the time `displayStyle` catches up (since `setStyle()` in the store resets opts synchronously).

**Integration points**:

- `StyleTab.tsx`: The `SelectV2` dropdown continues to call `handleStyleChange` which fires `setStyle()` immediately (GPU preview updates instantly). The animation only affects the *sidebar parameter controls*, not the 3D viewport.
- `SliderV2.tsx`: No changes needed. The `key={displayStyle}-${key}` on `StyleParamControl` ensures React creates fresh slider instances with new values when `displayStyle` changes.
- `motion.css`: No changes — the new keyframes live in `StyleTab.css` since they're component-scoped.

**Edge cases**:

- **Rapid switching**: Multiple quick style changes → each new change clears the previous timer and starts fresh. The user sees the exit animation restart. Worst case: they see a brief flicker as params fade out and restart fading out. Acceptable.
- **Same style re-selected**: `newStyle === prevStyle.current` guard prevents animation from firing.
- **0 params → N params**: If a style has no basic params, `paramCount = 0`, stagger math is trivially correct (nothing to animate). Enter animation fires normally for new params.
- **Initial mount**: `useStyleTransition` initializes `prevStyle.current = currentStyle`, so the first render is always `idle` phase with no animation. The `pf2-tab-enter` animation on `.pf2-style-tab__param` from the existing CSS handles initial mount stagger.
- **Tab switch during animation**: If user switches to Shape tab mid-animation, the `StyleTab` unmounts, cleanup runs, timers clear. No dangling state.

**Accessibility**:

- Reduced motion: The hook checks `prefers-reduced-motion` and skips the animation cycle entirely — `displayStyle` is set synchronously, phase stays `idle`.
- The CSS reduced-motion override strips all transform animations, falling back to simple opacity transitions.
- Screen readers: No ARIA interaction needed — the param list is just controls that update. The `useAnnounce` hook in the broader system already announces style changes.

**Assumptions** (for Verifier to attack):
1. Removing `key={styleName}` from the params container won't break React reconciliation. The individual `StyleParamControl` components still have `key={displayStyle}-${key}`, which will force remount when `displayStyle` changes. This is correct — React reconciles by key within the list.
2. The 340ms exit + 80ms pause + 340ms enter = 760ms total doesn't feel sluggish. The spec says 80ms breathing pause. The stagger adds 120ms max (4 * 30ms for a typical 5-param style). The base animation is 220ms (`--pf2-duration-fast`). So: 220+120 + 80 + 220+120 = 760ms. 
3. The `styleOpts` values will be correct when `displayStyle` catches up to `styleName`. Since `setStyle()` resets opts synchronously in Zustand, by the time React re-renders with `displayStyle = newStyle`, the opts will have the new defaults.
4. CSS `calc()` with `var()` inversion (`paramCount - 1 - staggerIndex`) works cross-browser for the reversed stagger.
5. The `--stagger-index` CSS variable (already set by `StyleParamControl` inline style) is sufficient — no need for a separate `--pf2-param-exit-index`.

---

## Recommended Implementation Order

### Phase A: Welcome Card (1 session)
1. Add `isFirstRun` convenience getter to `useConfidence.ts` (or just use `level === 0` inline — simpler)
2. Create `WelcomeCard.tsx` with component logic
3. Create `WelcomeCard.css` with enter/exit animations + light theme + mobile
4. Mount in `AppUIv2.tsx`
5. Add FourierBloom preset initialization in the welcome card's `useEffect`
6. Test: clear `pf2-user-confidence` from localStorage, reload → card appears → dismiss → never shows again

### Phase B: Style Switch Animations (1 session)
1. Create `useStyleTransition.ts` hook
2. Modify `StyleTab.tsx`: integrate hook, remove `key={styleName}`, add phase classes
3. Add exit/enter keyframes to `StyleTab.css`
4. Set `--pf2-param-count` CSS variable on params container
5. Test: switch styles rapidly, verify no animation pile-up, verify reduced motion fallback

### Phase C: Integration Testing
1. Verify welcome card "Pick a Style" correctly opens sidebar to Style tab
2. Verify style switch animation plays correctly after navigating from welcome card
3. Test on mobile (card should be full-width at bottom)
4. Test light theme for both features
5. Test keyboard navigation: Tab through welcome card buttons, Escape to dismiss

---

## Open Questions

1. **FourierBloom preset params**: The spec says `fb_n1=8, fb_amp=0.22`. Do these map exactly to the current `STYLE_SCHEMAS['FourierBloom'].params` keys? Need to verify the exact param key names in the schema definition.

2. **Auto-rotate speed**: The spec says "0.3 rpm". The constant `AUTOROTATE_SPEED_DEFAULT = 0.3` is in **radians per second**, which is ~2.9 rpm. Should we add a separate slower speed for the welcome card, or is the existing default acceptable?

3. **Advanced params during style switch**: Should the exit→enter animation also apply to the "Advanced Parameters" collapsed section? Currently the advanced params are in a separate `SectionV2`. The animation could be scoped to basic params only (simpler) or both (spec doesn't specify).

4. **Card content**: The spec gives two buttons but doesn't specify copy beyond that. The proposal uses "PotFoundry" wordmark + "Generative 3D pottery, ready to print." tagline. Should this be more elaborate, or is minimal better for a welcome card?

5. **When the card shows but sidebar is already open**: If `panelOpen` is true on first visit (edge case — default state), the card would overlap the sidebar's right edge. Should the card position-aware adjust, or is this unlikely enough to ignore?
