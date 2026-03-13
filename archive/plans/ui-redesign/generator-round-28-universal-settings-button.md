# Generator Round 28 — Universal Settings Button
Date: 2026-03-06

## Problem Statement

PotFoundry's `SettingsModal` ([src/ui/auth/SettingsModal.tsx](src/ui/auth/SettingsModal.tsx)) is gated behind Supabase authentication. When no Supabase config is present (typical dev setup, self-hosted, local), `UserMenu` renders a disabled "Auth Disabled" button and settings are completely inaccessible. Users cannot:

- Switch between `classic` and `v2` UI themes
- Change renderer preference (Auto / WebGPU / WebGL)
- Adjust color mode (light / dark / system) in v2 theme

These are **non-auth** settings — they have nothing to do with user accounts and should always be available.

## Root Cause Analysis

The coupling is architectural: `SettingsModal` lives in `src/ui/auth/` and its only entry point is through `UserMenu`, which calls `useAuth()` on line 11. The early-return at [UserMenu.tsx#L160-L168](src/ui/auth/UserMenu.tsx) kills the entire flow when `!state.isConfigured`.

The renderer setting is duplicated in two places already:
1. `SettingsModal.tsx` lines 278-289 (auth-gated, read/write `pf-preferred-renderer`)
2. `Sidebar.tsx` lines 209-220 (v1 only, embedded in header)

The UI theme switch exists only in the Zustand `setUITheme` action and the `pf2-ui-theme` localStorage key — there's no accessible widget for it anywhere.

## Proposals

### Proposal 1: Standalone `AppSettingsButton` + `AppSettingsModal` (Recommended)

**Idea**: Create a new, self-contained settings gear button + Radix Dialog modal that sits alongside `UserMenu` in `pf-app__header`. Zero auth dependencies. Minimal footprint. Uses existing Zustand actions and localStorage patterns.

**Mechanism**:

#### 1. File List

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `src/ui/settings/AppSettingsButton.tsx` | Gear icon trigger + modal composition |
| **Create** | `src/ui/settings/AppSettingsModal.tsx` | The modal dialog content |
| **Create** | `src/ui/settings/AppSettings.css` | Styles for both components |
| **Create** | `src/ui/settings/index.ts` | Barrel export |
| **Modify** | `src/App.tsx` | Add `<AppSettingsButton />` to `pf-app__header` |
| **Modify** | `src/styles.css` | Add flexbox to `.pf-app__header` for multi-button layout |

#### 2. Component Structure

**`AppSettingsButton.tsx`** — Composition root:

```tsx
import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { AppSettingsModal } from './AppSettingsModal';
import './AppSettings.css';

export function AppSettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="app-settings-trigger"
        onClick={() => setOpen(true)}
        aria-label="App settings"
        title="Settings"
      >
        <Settings size={18} />
      </button>
      <AppSettingsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
```

**`AppSettingsModal.tsx`** — The dialog:

```tsx
import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Palette, Monitor, Sun, Moon, SunMoon } from 'lucide-react';
import { useAppStore } from '../../state';
import { useUIActions } from '../../state/store';
import { useColorMode, type ColorMode } from '../v2/hooks/useColorMode';
import './AppSettings.css';

interface AppSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RENDERER_KEY = 'pf-preferred-renderer';

const COLOR_MODE_LABELS: Record<ColorMode, { label: string; icon: React.ReactNode }> = {
  system: { label: 'System', icon: <SunMoon size={14} /> },
  light:  { label: 'Light',  icon: <Sun size={14} /> },
  dark:   { label: 'Dark',   icon: <Moon size={14} /> },
};

export function AppSettingsModal({ open, onOpenChange }: AppSettingsModalProps) {
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const { setUITheme } = useUIActions();
  const { colorMode, cycleColorMode } = useColorMode();

  // Renderer pref is standalone localStorage — read on render, write + reload on change
  const [rendererPref, setRendererPref] = useState<string>(() => {
    try { return localStorage.getItem(RENDERER_KEY) || 'auto'; }
    catch { return 'auto'; }
  });

  const handleRendererChange = (value: string) => {
    if (value === 'auto') {
      localStorage.removeItem(RENDERER_KEY);
    } else {
      localStorage.setItem(RENDERER_KEY, value);
    }
    setRendererPref(value);
    // Defer reload so the user sees the selection change
    setTimeout(() => window.location.reload(), 300);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-settings-overlay" />
        <Dialog.Content
          className="app-settings-content"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="app-settings-header">
            <Dialog.Title className="app-settings-title">
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="app-settings-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* UI Theme Section */}
          <section className="app-settings-section">
            <h3 className="app-settings-section-title">
              <Palette size={15} />
              UI Theme
            </h3>
            <div className="app-settings-toggle-group" role="radiogroup" aria-label="UI Theme">
              {(['classic', 'v2'] as const).map((theme) => (
                <button
                  key={theme}
                  role="radio"
                  aria-checked={uiTheme === theme}
                  className={`app-settings-toggle ${uiTheme === theme ? 'app-settings-toggle--active' : ''}`}
                  onClick={() => setUITheme(theme)}
                >
                  {theme === 'classic' ? 'Classic' : 'v2'}
                </button>
              ))}
            </div>
          </section>

          {/* Renderer Section */}
          <section className="app-settings-section">
            <h3 className="app-settings-section-title">
              <Monitor size={15} />
              Renderer
            </h3>
            <select
              className="app-settings-select"
              value={rendererPref}
              onChange={(e) => handleRendererChange(e.target.value)}
              aria-label="Renderer preference"
            >
              <option value="auto">Auto (WebGPU → WebGL)</option>
              <option value="webgpu">WebGPU (High Performance)</option>
              <option value="webgl">WebGL (Compatibility)</option>
            </select>
            <p className="app-settings-hint">
              Page will reload when changed.
            </p>
          </section>

          {/* Color Mode Section — v2 only */}
          {uiTheme === 'v2' && (
            <section className="app-settings-section">
              <h3 className="app-settings-section-title">
                <Sun size={15} />
                Color Mode
              </h3>
              <div className="app-settings-toggle-group" role="radiogroup" aria-label="Color mode">
                {(['system', 'light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    role="radio"
                    aria-checked={colorMode === mode}
                    className={`app-settings-toggle ${colorMode === mode ? 'app-settings-toggle--active' : ''}`}
                    onClick={() => {
                      // Cycle until we hit the target
                      // Or: direct set (see "Open Questions" below)
                      // For simplicity: just cycle
                      if (colorMode !== mode) {
                        // We need a direct setter. See Proposal note.
                        // For MVP: use cycleColorMode and accept cycle behavior.
                        cycleColorMode();
                      }
                    }}
                  >
                    {COLOR_MODE_LABELS[mode].icon}
                    {COLOR_MODE_LABELS[mode].label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

#### 3. State Management

| Setting | Store / Persistence | Read | Write |
|---------|-------------------|------|-------|
| UI Theme | Zustand `ui.uiTheme` + `localStorage['pf2-ui-theme']` | `useAppStore((s) => s.ui.uiTheme)` | `useUIActions().setUITheme(theme)` |
| Renderer | `localStorage['pf-preferred-renderer']` only | `localStorage.getItem(...)` in `useState` init | `localStorage.setItem(...)` + `window.location.reload()` |
| Color Mode | `useState` in `useColorMode` hook + `localStorage['pf2-color-mode']` | `useColorMode().colorMode` | `useColorMode().cycleColorMode()` — **see Open Question #1** |

**Critical note on Color Mode**: The existing `useColorMode` hook only exposes `cycleColorMode()` (system→light→dark→system), not a direct `setColorMode(mode)`. For the toggle-group UI where users click a specific mode, we need a direct setter. Two options:

- **(A) Extend `useColorMode`** to also return `setColorMode(mode: ColorMode)`. This is a 3-line change — just expose the internal `setColorMode` and add a `persistMode(mode)` call. **Recommended.**
- **(B) Cycle-based workaround**: Click handler calls `cycleColorMode()` repeatedly until target is reached. Ugly, flickery, bad. **Rejected.**

#### 4. Styling Strategy

The key challenge: this button and modal must look correct in **both** v1 (dark glassmorphism) and v2 (design-token-driven, light/dark). Strategy: **use hardcoded v1-compatible values as defaults, with `[data-theme]` or `.pf2-*` context overrides for v2**.

**`AppSettings.css`** — full proposed styles:

```css
/* ============================================================================
   Trigger Button — gear icon, sits next to UserMenu
   ============================================================================ */

.app-settings-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf3;
  cursor: pointer;
  transition: all 150ms;
}

.app-settings-trigger:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.app-settings-trigger:focus-visible {
  outline: 2px solid #58a6ff;
  outline-offset: 2px;
}

/* v2 theme overrides (when ancestor has data-theme) */
[data-theme="light"] .app-settings-trigger {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.12);
  color: #24292f;
}

[data-theme="light"] .app-settings-trigger:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .app-settings-trigger {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  color: #e6edf3;
}

/* ============================================================================
   Modal Overlay + Content
   ============================================================================ */

.app-settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  animation: app-settings-fade-in 150ms ease-out both;
}

.app-settings-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1c1c2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
  max-width: 380px;
  width: 90vw;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  z-index: 1001;
  animation: app-settings-scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* v2 overrides */
[data-theme="light"] .app-settings-content {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] .app-settings-content {
  background: var(--pf2-bg-raised, #1c1c2e);
  border-color: var(--pf2-border-default, rgba(255, 255, 255, 0.1));
}

/* ============================================================================
   Header
   ============================================================================ */

.app-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.app-settings-title {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
  margin: 0;
}

[data-theme="light"] .app-settings-title {
  color: #24292f;
}

.app-settings-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8b949e;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}

.app-settings-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf3;
}

[data-theme="light"] .app-settings-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #24292f;
}

/* ============================================================================
   Section
   ============================================================================ */

.app-settings-section {
  margin-bottom: 20px;
}

.app-settings-section:last-child {
  margin-bottom: 0;
}

.app-settings-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8b949e;
  margin: 0 0 10px 0;
}

[data-theme="light"] .app-settings-section-title {
  color: #57606a;
}

/* ============================================================================
   Toggle Group (for theme and color mode selection)
   ============================================================================ */

.app-settings-toggle-group {
  display: flex;
  gap: 8px;
}

.app-settings-toggle {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #8b949e;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms;
}

.app-settings-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf3;
}

.app-settings-toggle--active {
  background: rgba(88, 166, 255, 0.15);
  border-color: rgba(88, 166, 255, 0.4);
  color: #58a6ff;
}

[data-theme="light"] .app-settings-toggle {
  color: #57606a;
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
}

[data-theme="light"] .app-settings-toggle:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #24292f;
}

[data-theme="light"] .app-settings-toggle--active {
  background: rgba(9, 105, 218, 0.1);
  border-color: rgba(9, 105, 218, 0.4);
  color: #0969da;
}

/* ============================================================================
   Select
   ============================================================================ */

.app-settings-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: #e6edf3;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  appearance: auto;
}

.app-settings-select:focus-visible {
  outline: 2px solid #58a6ff;
  outline-offset: 2px;
}

[data-theme="light"] .app-settings-select {
  color: #24292f;
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.15);
}

/* ============================================================================
   Hint text
   ============================================================================ */

.app-settings-hint {
  font-size: 12px;
  color: #8b949e;
  margin: 6px 0 0 0;
}

[data-theme="light"] .app-settings-hint {
  color: #57606a;
}

/* ============================================================================
   Animations
   ============================================================================ */

@keyframes app-settings-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes app-settings-scale-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
```

#### 5. Layout Integration

Current `pf-app__header` contains only `<UserMenu />`. We need it to hold two items side-by-side. Minimal CSS change:

**In `src/styles.css`**, modify `.pf-app__header`:

```css
.pf-app__header {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 100;
  pointer-events: auto;
  /* NEW: flex layout for multiple buttons */
  display: flex;
  align-items: center;
  gap: 8px;
}
```

**In `src/App.tsx`**, the render becomes:

```tsx
<div className="pf-app__header">
  <AppSettingsButton />
  <UserMenu />
</div>
```

The gear button renders to the **left** of UserMenu (gear on left, user/auth on right). This is the standard pattern (see GitHub, Figma, VS Code).

#### 6. Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Theme switch v2→classic** | `setUITheme('classic')` triggers Zustand update → `App.tsx` re-renders `<AppUI />` instead of `<AppUIv2 />`. Color mode section disappears from modal (conditional render). No reload needed. |
| **Theme switch classic→v2** | `setUITheme('v2')` triggers lazy-load of `AppUIv2`. Modal stays open, color mode section appears. Smooth. |
| **Renderer change** | 300ms delay before `window.location.reload()` so user sees the selection register visually. The modal is destroyed by reload anyway. |
| **v2 color mode in classic theme** | Section is hidden via `{uiTheme === 'v2' && (...)}`. Clean. |
| **Color mode with no `data-theme` attr** | The `useColorMode` hook manages `data-theme` on `document.documentElement`. If the attribute is missing (classic theme), the v1 hardcoded defaults kick in. The modal styles gracefully degrade to dark-on-dark. |
| **Mobile** | `.app-settings-content` has `width: 90vw; max-width: 380px`. Works on narrow viewports. The trigger is 36×36px — large enough for touch targets (Apple recommends 44×44, but matching `UserMenu` sizing is more important for visual consistency). |
| **SSR / localStorage unavailable** | Both renderer and color mode reads are wrapped in try/catch with sensible defaults (`'auto'`, `'system'`). |

#### 7. Accessibility

| Concern | Implementation |
|---------|---------------|
| **Focus trap** | Radix Dialog handles this automatically — focus is trapped inside modal when open. |
| **Focus on open** | Radix Dialog moves focus to first focusable element (the close button). |
| **Focus on close** | Focus returns to trigger button automatically. |
| **Escape to close** | Radix Dialog handles `Escape` key out of the box. |
| **Click outside** | Radix `Dialog.Overlay` closes on click. |
| **Screen reader** | Trigger has `aria-label="App settings"`. Theme/color-mode toggle groups use `role="radiogroup"` with `aria-checked`. |
| **Keyboard nav** | Toggle buttons are focusable. `<select>` is natively keyboard-accessible. Arrow keys within radiogroup follow ARIA pattern. |
| **`aria-describedby`** | Set to `undefined` on `Dialog.Content` to suppress Radix warning (same pattern as `ShortcutsDialog`). |

### Proposal 2: Extend UserMenu to render settings inline (Conservative)

**Idea**: Instead of a separate button, modify `UserMenu` to always render a gear icon that opens an inline settings panel, even when `!state.isConfigured`.

**Mechanism**: After the `if (!state.isConfigured)` guard in `UserMenu.tsx`, render a gear button instead of (or alongside) the "Auth Disabled" button.

**Trade-offs**:
- **Pro**: No new files, no layout changes.
- **Con**: Couples app settings deeper into the auth module. Violates separation of concerns. The auth-disabled state becomes overloaded with non-auth functionality. Testing is harder because `UserMenu` depends on `AuthProvider`. If auth is fully removed later, settings go with it.

**Assumptions**:
1. `UserMenu` will always exist in the render tree. (Fragile — what if we remove auth entirely?)
2. The "Auth Disabled" button visual can accommodate a gear icon. (Questionable UX.)

**Verdict**: Workable but architecturally inferior. **Not recommended.**

### Proposal 3: Floating Action Button (Radical)

**Idea**: A floating gear button at bottom-right corner, always visible, independent of header layout.

**Trade-offs**:
- **Pro**: Zero coupling to header layout. Works in fullscreen/zen mode.
- **Con**: Violates existing UI conventions. Competes with the compatibility mode badge and export overlay. Feels out of place in both themes. Not where users expect settings to be.

**Verdict**: **Not recommended** — too unconventional for the current design language.

## Recommended Approach

**Proposal 1** is the clear winner:

1. Clean module boundary (`src/ui/settings/` — no auth coupling)
2. Follows existing Radix Dialog pattern (mirrors `ShortcutsDialog`)
3. Uses existing Zustand actions and localStorage conventions
4. Works in both themes via CSS fallback strategy
5. Small footprint: 4 new files, 2 modifications
6. One-pass implementable with no refactoring prerequisites

**Implementation order**:
1. Extend `useColorMode` to add `setColorMode(mode)` (3 lines)
2. Create `src/ui/settings/AppSettings.css`
3. Create `src/ui/settings/AppSettingsModal.tsx`
4. Create `src/ui/settings/AppSettingsButton.tsx`
5. Create `src/ui/settings/index.ts`
6. Modify `src/styles.css` (add flexbox to `.pf-app__header`)
7. Modify `src/App.tsx` (import + render `<AppSettingsButton />`)

## Open Questions

1. **`useColorMode` needs a direct setter**: The hook currently only exposes `cycleColorMode()`. The toggle-group UX requires clicking a specific mode. Should we extend `useColorMode` to return `setColorMode(mode: ColorMode)` or keep the cycle-based approach? **I strongly recommend extending it** — it's 3 lines of code and eliminates a bad UX pattern.

2. **Should the v1 sidebar renderer selector be removed?** The `Sidebar.tsx` header already has a small renderer `<select>` (lines 207-222). With the universal settings button, this becomes redundant. Removing it declutters the sidebar header. But this is a separate PR — don't scope-creep.

3. **Touch target size**: The trigger button is 36×36px to match `UserMenu`'s visual weight. Apple recommends 44×44 minimum. Should we bump to 40×40 as a compromise? The `UserMenu` login button is larger (text button), so the gear would be the smallest target. Worth discussing.

4. **Zen mode visibility**: In v2 zen mode, should the gear button be hidden along with other chrome, or always visible? Current proposal: it follows the header — if `pf-app__header` is hidden in zen mode, the gear goes too. This seems correct (zen = no chrome).

5. **Animation**: Should the renderer change use a confirmation dialog before reloading? Current proposal: immediate reload with 300ms visual delay. This matches the existing `SettingsModal` and `Sidebar` behavior. A confirmation would be safer but adds complexity.
