# UI v3 "Studio at Dusk" — Phase 1: Desktop Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v3 desktop shell (tokens, primitives, Stage, panel with Shape/Style tabs, basic STL export) selectable via Settings, per the approved spec `docs/superpowers/specs/2026-07-02-ui-v3-redesign-design.md`.

**Architecture:** New lazy-loaded shell at `src/ui/v3/` behind the existing `uiTheme` store toggle (exactly how v2 was introduced). Zustand slices are reused untouched except two additive changes (`'v3'` in the `UITheme` union, new `v3ActiveTab`). All rendering/export goes through existing hooks (`useParametricExport`, `useExportTier`); the only below-UI reach is a one-time appearance-gradient migration for the warm stage backdrop.

**Tech Stack:** React 18 + TypeScript, plain CSS with `--pf3-*` custom properties, Zustand, Vitest + @testing-library/react (jsdom), Playwright e2e.

**Phase 1 scope notes (approved deviations):**
- Preset shelf, showroom, Living Blueprint, certificate/kiln log, entrance sequence → **Phase 2** (they depend on the GPU thumbnail service).
- Daylight (light) theme tokens are defined but the color-mode toggle ships **hidden**; `data-theme="dark"` is fixed in Phase 1.
- Export formats: STL wired; 3MF/OBJ segmented options rendered **disabled** with a "soon" tooltip.
- Fidelity rows show ≈triangles + ≈file size. Estimated *time* deferred to Phase 2 (needs telemetry).
- Pedestal shadow deferred to Phase 2 (renderer work); Phase 1 backdrop uses the existing `appearance.gradient` GPU background.

## Global Constraints

Every task implicitly includes these. Copy-checked from the spec and repo config:

- **ESLint 0 warnings** — a PostToolUse hook runs `npx eslint <file> --max-warnings=0` after every edit; fix warnings before moving on (CI fails otherwise). `npm run typecheck` must pass at every commit.
- **GitNexus protocol** — before each commit run the `detect_changes()` MCP tool (scope `all`) and confirm only expected symbols/flows are affected; warn on HIGH/CRITICAL.
- **Token discipline** — no `--pf2-` or `--pf-` custom properties inside `src/ui/v3/` (guard test in Task 2 enforces this). All v3 tokens use `--pf3-`.
- **The gold rule** — gold (`--pf3-gold`, `--pf3-gold-deep`) appears only on actionable elements: primary CTA, active segment, slider thumb/fill, focus ring. Never decoration.
- **Numbers** — every numeric readout uses IBM Plex Mono with `font-variant-numeric: tabular-nums`.
- **Labels never truncate** — no `text-overflow: ellipsis` on parameter labels.
- **`prefers-reduced-motion`** — all v3 animation/transition collapses to ~0ms (media query in `tokens.css` covers everything via CSS variables).
- **Style IDs are permanent** — never renumber registry entries; Phase 1 does not touch `src/styles/registry.ts`.
- **localStorage keys** — theme key stays `'pf2-ui-theme'` (legacy name, e2e depends on it); new v3 keys: `pf3-panel-width`, `pf3-seam-<id>`, `pf3-hint-dismissed`.
- **`ui` slice is not persisted** — do not add v3 UI state to the persist allowlist.
- **E2E requires a running dev server** — start `npm run dev` first; `webServer` is commented out in `playwright.config.ts`.
- **Copy rules** — sentence case, active verbs ("Export STL", not "Submit"), units with values (`120 mm`, `4.1 MB`).
- **Commit style** — `feat(ui-v3): <what>` / `test(ui-v3): <what>`, commit after every task, end commit messages with the Claude Code co-author trailer used in this repo.

## File Structure (Phase 1)

```
src/ui/v3/
  AppUIv3.tsx AppUIv3.test.tsx      # root shell: theme attr, layout, keyboard map
  tokens.css                        # --pf3-* dark + light, z-scale, reduced-motion
  fonts.css                         # fontsource imports (packages already installed)
  icons.tsx                         # the ONE icon family (inline SVG, currentColor)
  primitives/
    Button.tsx Button.css Button.test.tsx
    GlassSurface.tsx GlassSurface.css
    SegmentedControl.tsx SegmentedControl.css SegmentedControl.test.tsx
    ParamRow.tsx ParamRow.css ParamRow.test.tsx
    ToggleRow.tsx ToggleRow.css ToggleRow.test.tsx
    DisclosureSeam.tsx DisclosureSeam.css DisclosureSeam.test.tsx
  stage/
    PillToolbar.tsx PillToolbar.css PillToolbar.test.tsx
    StatusLine.tsx StatusLine.css StatusLine.test.tsx
    HintLine.tsx HintLine.css HintLine.test.tsx
    useStudioBackdrop.ts useStudioBackdrop.test.ts
  panel/
    PanelShell.tsx PanelShell.css PanelShell.test.tsx
    ShapeTab.tsx ShapeTab.test.tsx
    StyleTab.tsx StyleTab.test.tsx
    ExportTab.tsx ExportTab.test.tsx
    ExportFooter.tsx ExportFooter.css ExportFooter.test.tsx
    labels.ts                       # GeometryParams → human labels/units
  __tests__/tokenGuard.test.ts
Modify:
  src/state/types.ts        (UITheme union + v3ActiveTab field)
  src/state/slices/ui.ts    (setV3ActiveTab action)
  src/ui/settings/AppSettingsModal.tsx  (third theme option)
  src/App.tsx               (lazy mount v3)
Test (e2e):
  e2e/ui-v3-smoke.spec.ts
```

---

### Task 1: Theme plumbing — `'v3'` becomes a selectable shell

**Files:**
- Modify: `src/state/types.ts:252` (UITheme), `:255` area (add V3Tab type), `:263-301` (UIState + default)
- Modify: `src/state/slices/ui.ts` (setV3ActiveTab)
- Modify: `src/ui/settings/AppSettingsModal.tsx:72` (theme options array)
- Modify: `src/App.tsx:23` (lazy import), `:561-567` (mount branch)
- Create: `src/ui/v3/AppUIv3.tsx`, `src/ui/v3/AppUIv3.test.tsx`

**Interfaces:**
- Consumes: `useAppStore`, existing `setUITheme(theme: UITheme)`.
- Produces: `UITheme = 'classic' | 'v2' | 'v3'`; `ui.v3ActiveTab: V2Tab` (reuses the `'shape' | 'style' | 'export'` union, exported alias `V3Tab = V2Tab`); `setV3ActiveTab(tab: V2Tab): void`; default export `AppUIv3: React.FC` rendering `.pf3-root[data-theme="dark"]`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/v3/AppUIv3.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppUIv3 from './AppUIv3';
import { useAppStore } from '../../state';

describe('AppUIv3 shell', () => {
  it('renders the pf3 root with dark theme', () => {
    render(<AppUIv3 />);
    const root = screen.getByTestId('pf3-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.className).toContain('pf3-root');
  });

  it('store accepts the v3 theme', () => {
    useAppStore.getState().setUITheme('v3');
    expect(useAppStore.getState().ui.uiTheme).toBe('v3');
  });

  it('store tracks the v3 active tab', () => {
    useAppStore.getState().setV3ActiveTab('export');
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/v3/AppUIv3.test.tsx`
Expected: FAIL — module `./AppUIv3` not found; `setV3ActiveTab` not a function.

- [ ] **Step 3: Extend types**

In `src/state/types.ts` change line 252 and the UIState block:

```ts
export type UITheme = 'classic' | 'v2' | 'v3';

/** v3 panel tab — same tabs as v2 by design */
export type V3Tab = V2Tab;
```

Add to `UIState` (after `hapticsEnabled`):

```ts
  /** Active tab in v3 panel */
  v3ActiveTab: V3Tab;
```

Add to `DEFAULT_UI_STATE`:

```ts
  v3ActiveTab: 'shape',
```

- [ ] **Step 4: Add the slice action**

In `src/state/slices/ui.ts`, next to `setV2ActiveTab` (line ~196), mirror it exactly:

```ts
setV3ActiveTab: (tab) =>
    set((state) => ({ ui: { ...state.ui, v3ActiveTab: tab } }), false, 'setV3ActiveTab'),
```

and add `setV3ActiveTab: (tab: V3Tab) => void;` to the slice's action interface beside `setV2ActiveTab`. Import `V3Tab` where `V2Tab` is imported.

- [ ] **Step 5: Create the minimal root shell**

Create `src/ui/v3/AppUIv3.tsx`:

```tsx
/**
 * PotFoundry UI v3 — "Studio at Dusk" root shell.
 * Lazy-loaded via React.lazy in App.tsx; v1/v2 users pay zero bundle cost.
 */
import React from 'react';
import './tokens.css';

export const AppUIv3: React.FC = () => {
  return (
    <div className="pf3-root pf3-layout" data-theme="dark" data-testid="pf3-root">
      {/* Stage chrome + panel land here in later tasks */}
    </div>
  );
};

export default AppUIv3;
```

(`tokens.css` arrives in Task 2 — create an empty `src/ui/v3/tokens.css` now so the import resolves.)

- [ ] **Step 6: Wire settings + App mount**

`src/ui/settings/AppSettingsModal.tsx` line 72: extend the mapped array from `(['classic', 'v2'] as const)` to `(['classic', 'v2', 'v3'] as const)`. Verify the button label rendering handles the new literal (it renders the raw value; that is acceptable for Phase 1).

`src/App.tsx`: below line 23 add:

```tsx
const AppUIv3 = lazy(() => import('./ui/v3/AppUIv3'));
```

Replace the mount branch (lines 561–567):

```tsx
{uiTheme === 'v2' ? (
    <Suspense fallback={null}>
        <AppUIv2 />
    </Suspense>
) : uiTheme === 'v3' ? (
    <Suspense fallback={null}>
        <AppUIv3 />
    </Suspense>
) : (
    <AppUI />
)}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/ui/v3/AppUIv3.test.tsx && npm run typecheck`
Expected: 3 tests PASS; tsc clean.

- [ ] **Step 8: Commit**

Run `detect_changes()` (expect: `UITheme`, ui slice, `AppSettingsModal`, `App` — low risk), then:

```bash
git add src/state/types.ts src/state/slices/ui.ts src/ui/settings/AppSettingsModal.tsx src/App.tsx src/ui/v3/
git commit -m "feat(ui-v3): v3 theme plumbing — selectable empty shell"
```

---

### Task 2: Design tokens + fonts + token-guard test

**Files:**
- Create: `src/ui/v3/tokens.css` (replace the empty stub), `src/ui/v3/fonts.css`
- Test: `src/ui/v3/__tests__/tokenGuard.test.ts`

**Interfaces:**
- Produces: the full `--pf3-*` token set (colors, type, space, radius, z, motion) scoped to `.pf3-root`, with `[data-theme='light']` overrides; utility classes `.pf3-mono`, `.pf3-section-voice`, `.pf3-label`; focus-ring rule via `[data-pf3-focusable]`.
- Every later task's CSS consumes only these tokens.

- [ ] **Step 1: Write the failing guard test**

Create `src/ui/v3/__tests__/tokenGuard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const V3_DIR = path.resolve(__dirname, '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('v3 token discipline', () => {
  it('uses no v1/v2 tokens inside src/ui/v3', () => {
    const offenders: string[] = [];
    for (const file of walk(V3_DIR).filter((f) => /\.(css|tsx?)$/.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      if (/--pf2-/.test(text) || /--pf-(?!3-)/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('defines the core pf3 tokens', () => {
    const css = fs.readFileSync(path.join(V3_DIR, 'tokens.css'), 'utf8');
    for (const t of ['--pf3-gold:', '--pf3-bg-stage:', '--pf3-text-primary:', '--pf3-z-panel:', '--pf3-ease-move:']) {
      expect(css).toContain(t);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/v3/__tests__/tokenGuard.test.ts`
Expected: FAIL — second test: tokens.css is empty.

- [ ] **Step 3: Write `fonts.css` and `tokens.css`**

`src/ui/v3/fonts.css` (packages already in package.json — fraunces ^5.2.9, inter ^5.2.8, plex mono ^5.2.7):

```css
@import '@fontsource-variable/fraunces/index.css';
@import '@fontsource-variable/inter/index.css';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/500.css';
```

`src/ui/v3/tokens.css`:

```css
/* PotFoundry UI v3 — "Studio at Dusk" design tokens. Spec §3. */
@import './fonts.css';

.pf3-root {
  /* --- Stage & surfaces (dark default) --- */
  --pf3-bg-stage: #131009;
  --pf3-bg-stage-deep: #0e0b08;
  --pf3-glass: rgba(28, 23, 18, 0.88);
  --pf3-glass-border: rgba(245, 240, 232, 0.09);
  --pf3-elevated: #2a2119;
  --pf3-hairline: rgba(245, 240, 232, 0.08);

  /* --- Text --- */
  --pf3-text-primary: #f5f0e8;
  --pf3-text-secondary: #a8a29e;
  --pf3-text-muted: #7a756f;

  /* --- Gold: actionable elements ONLY (spec §3.1) --- */
  --pf3-gold: #cfa967;
  --pf3-gold-deep: #b4975a;
  --pf3-gold-grad: linear-gradient(180deg, var(--pf3-gold), var(--pf3-gold-deep));
  --pf3-gold-tint: rgba(180, 151, 90, 0.12);
  --pf3-on-gold: #17120e;

  /* --- Status (desaturated) --- */
  --pf3-ok: #7fa886;
  --pf3-warn: #d4a94c;
  --pf3-error: #c9706a;

  /* --- Type --- */
  --pf3-font-display: 'Fraunces Variable', 'Fraunces', Georgia, serif;
  --pf3-font-body: 'Inter Variable', 'Inter', system-ui, sans-serif;
  --pf3-font-mono: 'IBM Plex Mono', Consolas, monospace;

  /* --- Space / radius --- */
  --pf3-space-xs: 4px; --pf3-space-sm: 8px; --pf3-space-md: 12px;
  --pf3-space-lg: 16px; --pf3-space-xl: 24px;
  --pf3-radius-sm: 6px; --pf3-radius-md: 9px; --pf3-radius-lg: 12px; --pf3-radius-pill: 999px;

  /* --- Depth: exactly two levels (spec §3.4) --- */
  --pf3-shadow-float: 0 12px 40px rgba(0, 0, 0, 0.45);
  --pf3-shadow-overlay: 0 24px 80px rgba(0, 0, 0, 0.6);
  --pf3-blur: 12px;

  /* --- Z scale --- */
  --pf3-z-stage: 0; --pf3-z-toolbar: 50; --pf3-z-panel: 100;
  --pf3-z-overlay: 200; --pf3-z-tooltip: 300;

  /* --- Motion (spec §3.3) --- */
  --pf3-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --pf3-ease-move: cubic-bezier(0.22, 0.61, 0.36, 1);
  --pf3-dur-control: 120ms; --pf3-dur-panel: 200ms; --pf3-dur-overlay: 320ms;

  font-family: var(--pf3-font-body);
  font-size: 14px;
  line-height: 1.5;
  color: var(--pf3-text-primary);
  -webkit-font-smoothing: antialiased;
}

.pf3-root[data-theme='light'] {
  --pf3-bg-stage: #f4efe6;
  --pf3-bg-stage-deep: #eae3d6;
  --pf3-glass: rgba(255, 253, 248, 0.9);
  --pf3-glass-border: rgba(60, 50, 40, 0.12);
  --pf3-elevated: #fffdf8;
  --pf3-hairline: rgba(60, 50, 40, 0.1);
  --pf3-text-primary: #2c241c;
  --pf3-text-secondary: #6b6156;
  --pf3-text-muted: #97897b;
  --pf3-gold: #8a6d4a;
  --pf3-gold-deep: #75592d;
  --pf3-on-gold: #fffdf8;
}

.pf3-root *, .pf3-root *::before, .pf3-root *::after { box-sizing: border-box; }

.pf3-root button {
  font-family: inherit; color: inherit;
  background: none; border: none; padding: 0; cursor: pointer;
}

/* Focus ring — gold halo (spec §11) */
.pf3-root [data-pf3-focusable]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--pf3-glass), 0 0 0 4px var(--pf3-gold);
}

/* Typography utilities */
.pf3-mono {
  font-family: var(--pf3-font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.pf3-section-voice {
  font-family: var(--pf3-font-display);
  font-style: italic;
  font-weight: 400;
  font-size: 15px;
  color: var(--pf3-text-secondary);
}
.pf3-label {
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--pf3-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .pf3-root { --pf3-dur-control: 0.01ms; --pf3-dur-panel: 0.01ms; --pf3-dur-overlay: 0.01ms; }
  .pf3-root *, .pf3-root *::before, .pf3-root *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/ui/v3/__tests__/tokenGuard.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

`detect_changes()` (docs/none — CSS only), then:

```bash
git add src/ui/v3/tokens.css src/ui/v3/fonts.css src/ui/v3/__tests__/tokenGuard.test.ts
git commit -m "feat(ui-v3): Studio-at-Dusk design tokens + token-guard test"
```

---

### Task 3: Button + GlassSurface primitives

**Files:**
- Create: `src/ui/v3/primitives/Button.tsx`, `Button.css`, `GlassSurface.tsx`, `GlassSurface.css`
- Test: `src/ui/v3/primitives/Button.test.tsx`

**Interfaces:**
- Produces:
  - `Button: React.FC<{ variant?: 'primary' | 'secondary' | 'tertiary'; children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; 'data-testid'?: string }>` — default variant `'secondary'`.
  - `GlassSurface: React.FC<{ children: React.ReactNode; className?: string }>` — glass panel wrapper (`.pf3-glass-surface`).

- [ ] **Step 1: Write the failing test**

`src/ui/v3/primitives/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders variants with pf3 classes and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Export STL</Button>);
    const btn = screen.getByRole('button', { name: 'Export STL' });
    expect(btn.className).toContain('pf3-btn--primary');
    expect(btn).toHaveAttribute('data-pf3-focusable');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled blocks clicks', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/ui/v3/primitives/Button.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement**

`src/ui/v3/primitives/Button.tsx`:

```tsx
import React from 'react';
import './Button.css';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary', children, onClick, disabled, title, 'data-testid': testId,
}) => (
  <button
    type="button"
    className={`pf3-btn pf3-btn--${variant}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
    data-pf3-focusable=""
    data-testid={testId}
  >
    {children}
  </button>
);
```

`src/ui/v3/primitives/Button.css`:

```css
.pf3-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; padding: 0 14px;
  border-radius: var(--pf3-radius-md);
  font: 600 12.5px var(--pf3-font-body);
  transition: filter var(--pf3-dur-control) var(--pf3-ease-move),
              background-color var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pf3-btn--primary {
  background: var(--pf3-gold-grad); color: var(--pf3-on-gold);
  box-shadow: 0 2px 12px rgba(180, 151, 90, 0.25);
}
.pf3-btn--primary:not(:disabled):hover { filter: brightness(1.06); }
.pf3-btn--secondary {
  border: 1px solid var(--pf3-glass-border); color: var(--pf3-text-primary);
  font-weight: 500;
}
.pf3-btn--secondary:not(:disabled):hover { background: var(--pf3-gold-tint); }
.pf3-btn--tertiary { color: var(--pf3-text-secondary); font-weight: 500; }
.pf3-btn--tertiary:not(:disabled):hover { color: var(--pf3-text-primary); }
```

`src/ui/v3/primitives/GlassSurface.tsx`:

```tsx
import React from 'react';
import './GlassSurface.css';

export const GlassSurface: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children, className,
}) => <div className={`pf3-glass-surface${className ? ` ${className}` : ''}`}>{children}</div>;
```

`src/ui/v3/primitives/GlassSurface.css`:

```css
.pf3-glass-surface {
  background: var(--pf3-glass);
  border: 1px solid var(--pf3-glass-border);
  border-radius: var(--pf3-radius-lg);
  box-shadow: var(--pf3-shadow-float);
  backdrop-filter: blur(var(--pf3-blur));
  -webkit-backdrop-filter: blur(var(--pf3-blur));
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/ui/v3/primitives/Button.test.tsx` → 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/primitives/
git commit -m "feat(ui-v3): Button + GlassSurface primitives"
```

---

### Task 4: SegmentedControl

**Files:**
- Create: `src/ui/v3/primitives/SegmentedControl.tsx`, `SegmentedControl.css`
- Test: `src/ui/v3/primitives/SegmentedControl.test.tsx`

**Interfaces:**
- Produces: `SegmentedControl<T extends string>: React.FC<{ options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (v: T) => void; ariaLabel: string }>` — `role="tablist"` with `aria-selected`, ArrowLeft/ArrowRight cycling. (e2e relies on `[aria-selected="true"]` — keep the ARIA contract.)

- [ ] **Step 1: Write the failing test**

`src/ui/v3/primitives/SegmentedControl.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

const OPTS = [
  { value: 'shape', label: 'Shape' },
  { value: 'style', label: 'Style' },
  { value: 'export', label: 'Export' },
] as const;

describe('SegmentedControl', () => {
  it('marks the active segment and switches on click', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTS} value="shape" onChange={onChange} ariaLabel="Panel tabs" />);
    expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(onChange).toHaveBeenCalledWith('export');
  });

  it('cycles with arrow keys', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTS} value="style" onChange={onChange} ariaLabel="Panel tabs" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('export');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('shape');
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/ui/v3/primitives/SegmentedControl.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`src/ui/v3/primitives/SegmentedControl.tsx`:

```tsx
import React, { useCallback } from 'react';
import './SegmentedControl.css';

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel,
}: SegmentedControlProps<T>): React.ReactElement {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const next = options[(idx + delta + options.length) % options.length];
      onChange(next.value);
    },
    [options, value, onChange],
  );

  return (
    <div className="pf3-seg" role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={`pf3-seg__item${o.value === value ? ' pf3-seg__item--on' : ''}`}
          onClick={() => onChange(o.value)}
          data-pf3-focusable=""
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/v3/primitives/SegmentedControl.css`:

```css
.pf3-seg {
  display: flex; padding: 2.5px;
  background: rgba(245, 240, 232, 0.06);
  border-radius: var(--pf3-radius-md);
}
.pf3-root[data-theme='light'] .pf3-seg { background: rgba(60, 50, 40, 0.07); }
.pf3-seg__item {
  flex: 1; padding: 6px 0;
  border-radius: calc(var(--pf3-radius-md) - 2px);
  font: 500 12px var(--pf3-font-body);
  color: var(--pf3-text-secondary);
  transition: color var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-seg__item--on {
  background: var(--pf3-gold-grad);
  color: var(--pf3-on-gold);
  font-weight: 600;
}
```

- [ ] **Step 4: Run to verify pass** — 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/primitives/SegmentedControl.*
git commit -m "feat(ui-v3): SegmentedControl with tablist semantics"
```

---

### Task 5: ParamRow — the app's most repeated element

**Files:**
- Create: `src/ui/v3/primitives/ParamRow.tsx`, `ParamRow.css`
- Test: `src/ui/v3/primitives/ParamRow.test.tsx`

**Interfaces:**
- Consumes: nothing v3-specific (pure controlled component).
- Produces:

```ts
export interface ParamRowProps {
  label: string;                    // never truncates
  value: number;
  min: number; max: number; step: number;
  unit?: string;                    // 'mm' | '°' | undefined
  defaultValue?: number;            // double-click reset target
  onChange: (value: number) => void;          // fired live (slider drag / scrub)
  onInteractionStart?: () => void;  // history: beginHistoryTransaction
  onValueCommit?: () => void;       // history: commitHistoryTransaction
  'data-testid'?: string;
}
export const ParamRow: React.FC<ParamRowProps>;
```

Behavior contract (spec §5): value chip is an input — click to type (Enter/blur commits, Escape cancels), double-click resets to `defaultValue`, ArrowUp/Down nudges ±step (Shift ×10); values clamp to [min,max] and snap to step; gold fill shows position.

- [ ] **Step 1: Write the failing tests**

`src/ui/v3/primitives/ParamRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamRow } from './ParamRow';

const setup = (over: Partial<Parameters<typeof ParamRow>[0]> = {}) => {
  const onChange = vi.fn();
  const onInteractionStart = vi.fn();
  const onValueCommit = vi.fn();
  render(
    <ParamRow
      label="Height" value={120} min={20} max={500} step={1} unit="mm"
      defaultValue={120} onChange={onChange}
      onInteractionStart={onInteractionStart} onValueCommit={onValueCommit}
      data-testid="row-h" {...over}
    />,
  );
  return { onChange, onInteractionStart, onValueCommit };
};

describe('ParamRow', () => {
  it('renders label, mono value and unit', () => {
    setup();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByTestId('row-h-value').textContent).toBe('120 mm');
  });

  it('slider change clamps, snaps and commits', () => {
    const { onChange, onInteractionStart, onValueCommit } = setup();
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '652' } });
    expect(onInteractionStart).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(500); // clamped to max
    fireEvent.pointerUp(slider);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('click value → type → Enter commits the typed number', () => {
    const { onChange, onValueCommit } = setup();
    fireEvent.click(screen.getByTestId('row-h-value'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '200' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(200);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('Escape cancels editing without change', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('row-h-value'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('row-h-value')).toBeInTheDocument();
  });

  it('double-click resets to defaultValue', () => {
    const { onChange, onValueCommit } = setup({ value: 300 });
    fireEvent.doubleClick(screen.getByTestId('row-h-value'));
    expect(onChange).toHaveBeenCalledWith(120);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('arrow keys nudge ±step, Shift ×10', () => {
    const { onChange } = setup();
    const chip = screen.getByTestId('row-h-value');
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(121);
    fireEvent.keyDown(chip, { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(110);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/ui/v3/primitives/ParamRow.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`src/ui/v3/primitives/ParamRow.tsx`:

```tsx
import React, { useCallback, useRef, useState } from 'react';
import './ParamRow.css';

export interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  defaultValue?: number;
  onChange: (value: number) => void;
  onInteractionStart?: () => void;
  onValueCommit?: () => void;
  'data-testid'?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function snap(v: number, step: number, min: number): number {
  const snapped = min + Math.round((v - min) / step) * step;
  // avoid float debris like 120.00000000001
  const dec = (String(step).split('.')[1] ?? '').length;
  return Number(snapped.toFixed(dec));
}

export const ParamRow: React.FC<ParamRowProps> = ({
  label, value, min, max, step, unit, defaultValue,
  onChange, onInteractionStart, onValueCommit, 'data-testid': testId,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const interacting = useRef(false);

  const apply = useCallback(
    (raw: number, commit: boolean) => {
      const next = snap(clamp(raw, min, max), step, min);
      onChange(next);
      if (commit) onValueCommit?.();
    },
    [min, max, step, onChange, onValueCommit],
  );

  const beginEdit = useCallback(() => {
    setDraft(String(value));
    setEditing(true);
  }, [value]);

  const commitDraft = useCallback(() => {
    setEditing(false);
    const parsed = Number(draft);
    if (!Number.isNaN(parsed)) {
      onInteractionStart?.();
      apply(parsed, true);
    }
  }, [draft, apply, onInteractionStart]);

  const handleChipKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const mult = e.shiftKey ? 10 : 1;
      onInteractionStart?.();
      apply(value + dir * step * mult, true);
    },
    [value, step, apply, onInteractionStart],
  );

  const dec = (String(step).split('.')[1] ?? '').length;

  return (
    <div className="pf3-param" data-testid={testId}>
      <div className="pf3-param__head">
        <span className="pf3-param__label">{label}</span>
        {editing ? (
          <input
            className="pf3-param__input pf3-mono"
            value={draft}
            autoFocus
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="pf3-param__value pf3-mono"
            data-testid={testId ? `${testId}-value` : undefined}
            data-pf3-focusable=""
            title="Click to type · double-click to reset"
            onClick={beginEdit}
            onDoubleClick={() => {
              if (defaultValue === undefined) return;
              setEditing(false);
              onInteractionStart?.();
              apply(defaultValue, true);
            }}
            onKeyDown={handleChipKeyDown}
          >
            {value.toFixed(dec)}{unit ? ` ${unit}` : ''}
          </button>
        )}
      </div>
      <input
        type="range"
        role="slider"
        className="pf3-param__slider"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pf3-fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onPointerDown={() => {
          if (!interacting.current) {
            interacting.current = true;
            onInteractionStart?.();
          }
        }}
        onChange={(e) => apply(Number(e.target.value), false)}
        onPointerUp={() => {
          interacting.current = false;
          onValueCommit?.();
        }}
        data-pf3-focusable=""
      />
    </div>
  );
};
```

`src/ui/v3/primitives/ParamRow.css`:

```css
.pf3-param { margin-bottom: var(--pf3-space-md); }
.pf3-param__head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 4px;
}
.pf3-param__label {
  font: 500 12.5px var(--pf3-font-body);
  color: var(--pf3-text-primary);
  white-space: nowrap; /* labels never truncate — reserve space instead */
}
.pf3-param__value {
  font-size: 12px; color: var(--pf3-gold);
  border-bottom: 1px dashed rgba(207, 169, 103, 0.4);
  cursor: ew-resize;
}
.pf3-param__input {
  width: 72px; text-align: right; font-size: 12px;
  background: var(--pf3-elevated); color: var(--pf3-text-primary);
  border: 1px solid var(--pf3-gold); border-radius: var(--pf3-radius-sm);
  padding: 1px 4px;
}
.pf3-param__slider {
  width: 100%; height: 20px; margin: 0;
  -webkit-appearance: none; appearance: none; background: transparent;
}
.pf3-param__slider::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: linear-gradient(to right,
    var(--pf3-gold-deep) var(--pf3-fill, 0%),
    rgba(245, 240, 232, 0.12) var(--pf3-fill, 0%));
}
.pf3-param__slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--pf3-gold);
  border: 2.5px solid var(--pf3-bg-stage);
  margin-top: -5px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.pf3-param__slider::-moz-range-track {
  height: 4px; border-radius: 2px; background: rgba(245, 240, 232, 0.12);
}
.pf3-param__slider::-moz-range-progress {
  height: 4px; border-radius: 2px; background: var(--pf3-gold-deep);
}
.pf3-param__slider::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--pf3-gold); border: 2.5px solid var(--pf3-bg-stage);
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/ui/v3/primitives/ParamRow.test.tsx` → 6 PASS. Also run `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/primitives/ParamRow.*
git commit -m "feat(ui-v3): ParamRow — scrub/type/reset/nudge parameter instrument"
```

---

### Task 6: ToggleRow + DisclosureSeam

**Files:**
- Create: `src/ui/v3/primitives/ToggleRow.tsx`, `ToggleRow.css`, `DisclosureSeam.tsx`, `DisclosureSeam.css`
- Test: `src/ui/v3/primitives/ToggleRow.test.tsx`, `src/ui/v3/primitives/DisclosureSeam.test.tsx`

**Interfaces:**
- Produces:
  - `ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; 'data-testid'?: string }>` — used for `ParamSchema.type === 'bool'` style params.
  - `DisclosureSeam: React.FC<{ id: string; summary: string; children: React.ReactNode; defaultOpen?: boolean }>` — hairline seam that names its contents ("advanced — walls, drain & flare"); expansion persisted to `localStorage['pf3-seam-<id>']` (spec §5).

- [ ] **Step 1: Write the failing tests**

`src/ui/v3/primitives/ToggleRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleRow } from './ToggleRow';

describe('ToggleRow', () => {
  it('renders a switch and toggles', () => {
    const onChange = vi.fn();
    render(<ToggleRow label="Mirror" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Mirror' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

`src/ui/v3/primitives/DisclosureSeam.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisclosureSeam } from './DisclosureSeam';

describe('DisclosureSeam', () => {
  beforeEach(() => localStorage.clear());

  it('is collapsed by default and names its contents', () => {
    render(<DisclosureSeam id="shape-adv" summary="advanced — walls, drain & flare"><p>Deep</p></DisclosureSeam>);
    expect(screen.queryByText('Deep')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /advanced — walls/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands on click and persists', () => {
    const view = render(<DisclosureSeam id="shape-adv" summary="advanced"><p>Deep</p></DisclosureSeam>);
    fireEvent.click(screen.getByRole('button', { name: /advanced/ }));
    expect(screen.getByText('Deep')).toBeInTheDocument();
    expect(localStorage.getItem('pf3-seam-shape-adv')).toBe('1');
    view.unmount();
    render(<DisclosureSeam id="shape-adv" summary="advanced"><p>Deep</p></DisclosureSeam>);
    expect(screen.getByText('Deep')).toBeInTheDocument(); // remembered
  });
});
```

- [ ] **Step 2: Run to verify fail** — both suites FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/ui/v3/primitives/ToggleRow.tsx`:

```tsx
import React from 'react';
import './ToggleRow.css';

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  'data-testid'?: string;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, checked, onChange, 'data-testid': testId }) => (
  <div className="pf3-toggle" data-testid={testId}>
    <span className="pf3-param__label">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`pf3-toggle__track${checked ? ' pf3-toggle__track--on' : ''}`}
      onClick={() => onChange(!checked)}
      data-pf3-focusable=""
    >
      <span className="pf3-toggle__thumb" />
    </button>
  </div>
);
```

`src/ui/v3/primitives/ToggleRow.css`:

```css
.pf3-toggle {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: var(--pf3-space-md);
}
.pf3-toggle__track {
  width: 34px; height: 18px; border-radius: var(--pf3-radius-pill);
  background: rgba(245, 240, 232, 0.14); position: relative;
  transition: background-color var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-toggle__track--on { background: var(--pf3-gold-deep); }
.pf3-toggle__thumb {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--pf3-text-primary);
  transition: transform var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-toggle__track--on .pf3-toggle__thumb { transform: translateX(16px); }
```

`src/ui/v3/primitives/DisclosureSeam.tsx`:

```tsx
import React, { useCallback, useState } from 'react';
import './DisclosureSeam.css';

export interface DisclosureSeamProps {
  id: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const key = (id: string) => `pf3-seam-${id}`;

export const DisclosureSeam: React.FC<DisclosureSeamProps> = ({ id, summary, children, defaultOpen }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key(id));
      return stored === null ? Boolean(defaultOpen) : stored === '1';
    } catch {
      return Boolean(defaultOpen);
    }
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      try { localStorage.setItem(key(id), prev ? '0' : '1'); } catch { /* private mode */ }
      return !prev;
    });
  }, [id]);

  return (
    <div className="pf3-seam">
      <button
        type="button"
        className="pf3-seam__bar"
        aria-expanded={open}
        onClick={toggle}
        data-pf3-focusable=""
      >
        <span className="pf3-seam__line" />
        <span className="pf3-seam__text">{open ? '⌃' : '⌄'} {summary}</span>
        <span className="pf3-seam__line" />
      </button>
      {open && <div className="pf3-seam__content">{children}</div>}
    </div>
  );
};
```

`src/ui/v3/primitives/DisclosureSeam.css`:

```css
.pf3-seam { margin: var(--pf3-space-sm) 0; }
.pf3-seam__bar {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 4px 0;
}
.pf3-seam__line { flex: 1; height: 1px; background: var(--pf3-hairline); }
.pf3-seam__text {
  font: 500 10.5px var(--pf3-font-body);
  letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--pf3-gold);
  white-space: nowrap;
}
.pf3-seam__content { padding-top: var(--pf3-space-sm); }
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/ui/v3/primitives` → all primitive suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/primitives/
git commit -m "feat(ui-v3): ToggleRow + persisted DisclosureSeam"
```

---

### Task 7: PanelShell — the floating glass panel

**Files:**
- Create: `src/ui/v3/panel/PanelShell.tsx`, `PanelShell.css`
- Test: `src/ui/v3/panel/PanelShell.test.tsx`

**Interfaces:**
- Consumes: `GlassSurface`, `SegmentedControl`, store `ui.v3ActiveTab` + `setV3ActiveTab`.
- Produces: `PanelShell: React.FC<{ children: React.ReactNode; footer?: React.ReactNode }>` — renders wordmark ("PotFoundry", Fraunces), the Shape/Style/Export SegmentedControl bound to the store, a scrollable content area, an optional sticky footer slot, and a right-edge resize handle (width 300–480px, persisted to `localStorage['pf3-panel-width']`). Width is applied via inline `style.width`; drag uses refs + direct style writes (no React state per pointermove), state synced once on pointerup.

- [ ] **Step 1: Write the failing test**

`src/ui/v3/panel/PanelShell.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelShell } from './PanelShell';
import { useAppStore } from '../../../state';

describe('PanelShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setV3ActiveTab('shape');
  });

  it('renders wordmark, tabs and content', () => {
    render(<PanelShell footer={<div>FOOT</div>}><p>CONTENT</p></PanelShell>);
    expect(screen.getByText('PotFoundry')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('CONTENT')).toBeInTheDocument();
    expect(screen.getByText('FOOT')).toBeInTheDocument();
  });

  it('tab click updates the store', () => {
    render(<PanelShell><p /></PanelShell>);
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
  });

  it('restores persisted width', () => {
    localStorage.setItem('pf3-panel-width', '420');
    render(<PanelShell><p /></PanelShell>);
    expect(screen.getByTestId('pf3-panel').style.width).toBe('420px');
  });
});
```

- [ ] **Step 2: Run to verify fail** — FAIL (module not found).

- [ ] **Step 3: Implement**

`src/ui/v3/panel/PanelShell.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { useAppStore } from '../../../state';
import type { V3Tab } from '../../../state/types';
import './PanelShell.css';

const WIDTH_KEY = 'pf3-panel-width';
const MIN_W = 300;
const MAX_W = 480;
const DEFAULT_W = 340;

const TABS = [
  { value: 'shape', label: 'Shape' },
  { value: 'style', label: 'Style' },
  { value: 'export', label: 'Export' },
] as const;

export interface PanelShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const PanelShell: React.FC<PanelShellProps> = ({ children, footer }) => {
  const activeTab = useAppStore((s) => s.ui.v3ActiveTab);
  const setV3ActiveTab = useAppStore((s) => s.setV3ActiveTab);

  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored >= MIN_W && stored <= MAX_W ? stored : DEFAULT_W;
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, startW: panelRef.current?.offsetWidth ?? DEFAULT_W };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onHandleMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !panelRef.current) return;
    const w = Math.min(MAX_W, Math.max(MIN_W, drag.current.startW + (e.clientX - drag.current.startX)));
    panelRef.current.style.width = `${w}px`; // direct write — no re-render per move
  }, []);

  const onHandleUp = useCallback(() => {
    if (!drag.current || !panelRef.current) return;
    drag.current = null;
    const w = panelRef.current.offsetWidth;
    setWidth(w);
    try { localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    if (panelRef.current) panelRef.current.style.width = `${width}px`;
  }, [width]);

  return (
    <div ref={panelRef} className="pf3-panel" data-testid="pf3-panel" style={{ width }}>
      <GlassSurface className="pf3-panel__surface">
        <div className="pf3-panel__header">
          <div className="pf3-panel__wordmark">PotFoundry</div>
          <SegmentedControl<V3Tab>
            options={TABS}
            value={activeTab}
            onChange={setV3ActiveTab}
            ariaLabel="Panel sections"
          />
        </div>
        <div className="pf3-panel__content">{children}</div>
        {footer && <div className="pf3-panel__footer">{footer}</div>}
      </GlassSurface>
      <div
        className="pf3-panel__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
      />
    </div>
  );
};
```

`src/ui/v3/panel/PanelShell.css`:

```css
.pf3-panel {
  position: absolute;
  left: var(--pf3-space-lg); top: var(--pf3-space-lg); bottom: var(--pf3-space-lg);
  z-index: var(--pf3-z-panel);
  display: flex;
  pointer-events: auto;
}
.pf3-panel__surface {
  display: flex; flex-direction: column;
  width: 100%; overflow: hidden;
}
.pf3-panel__header { padding: var(--pf3-space-md) var(--pf3-space-md) var(--pf3-space-sm); }
.pf3-panel__wordmark {
  font: 400 17px var(--pf3-font-display);
  margin-bottom: var(--pf3-space-sm);
}
.pf3-panel__content {
  flex: 1; overflow-y: auto;
  padding: var(--pf3-space-sm) var(--pf3-space-md);
  scrollbar-width: thin;
  scrollbar-color: rgba(245, 240, 232, 0.15) transparent;
}
.pf3-panel__footer {
  border-top: 1px solid var(--pf3-hairline);
  padding: var(--pf3-space-md);
  background: rgba(20, 16, 13, 0.6);
}
.pf3-root[data-theme='light'] .pf3-panel__footer { background: rgba(60, 50, 40, 0.05); }
.pf3-panel__resize {
  width: 6px; cursor: col-resize; margin-left: 2px;
  border-radius: 3px;
}
.pf3-panel__resize:hover { background: var(--pf3-gold-tint); }
```

- [ ] **Step 4: Run to verify pass** — 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/panel/
git commit -m "feat(ui-v3): PanelShell — glass panel with tabs, footer slot, ref-based resize"
```

---

### Task 8: ShapeTab — geometry sections with history-safe wiring

**Files:**
- Create: `src/ui/v3/panel/labels.ts`, `src/ui/v3/panel/ShapeTab.tsx`
- Test: `src/ui/v3/panel/ShapeTab.test.tsx`

**Interfaces:**
- Consumes: `ParamRow`, `DisclosureSeam`, store selectors from Task 1 facts:
  `useAppStore((s) => s.geometry)`, `s.setGeometryParam(key: keyof GeometryParams, value: number)`, `s.beginHistoryTransaction`, `s.commitHistoryTransaction`; `GEOMETRY_BOUNDS`, `DEFAULT_GEOMETRY` from `src/state/types.ts`.
- Produces: `ShapeTab: React.FC` and `GEOMETRY_LABELS: Record<keyof GeometryParams, { label: string; unit?: string }>` in `labels.ts` (reused by Phase-2 Blueprint and mobile).

- [ ] **Step 1: Write `labels.ts`** (data, no test needed on its own):

```ts
import type { GeometryParams } from '../../../state/types';

export const GEOMETRY_LABELS: Record<keyof GeometryParams, { label: string; unit?: string }> = {
  H: { label: 'Height', unit: 'mm' },
  top_od: { label: 'Top diameter', unit: 'mm' },
  bottom_od: { label: 'Bottom diameter', unit: 'mm' },
  t_wall: { label: 'Wall thickness', unit: 'mm' },
  t_bottom: { label: 'Base thickness', unit: 'mm' },
  r_drain: { label: 'Drain radius', unit: 'mm' },
  expn: { label: 'Flare' },
  bellAmp: { label: 'Bell amount' },
  bellCenter: { label: 'Bell position' },
  bellWidth: { label: 'Bell width' },
  spinTurns: { label: 'Twist turns' },
  spinPhase: { label: 'Twist phase', unit: '°' },
  spinCurve: { label: 'Twist curve' },
};
```

- [ ] **Step 2: Write the failing test**

`src/ui/v3/panel/ShapeTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShapeTab } from './ShapeTab';
import { useAppStore } from '../../../state';
import { DEFAULT_GEOMETRY } from '../../../state/types';

describe('ShapeTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((s) => ({ geometry: { ...DEFAULT_GEOMETRY } }));
  });

  it('shows the three essential Size rows, hides advanced by default', () => {
    render(<ShapeTab />);
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('Top diameter')).toBeInTheDocument();
    expect(screen.getByText('Bottom diameter')).toBeInTheDocument();
    expect(screen.queryByText('Wall thickness')).not.toBeInTheDocument();
  });

  it('advanced seam reveals walls/drain/flare rows', () => {
    render(<ShapeTab />);
    fireEvent.click(screen.getByRole('button', { name: /advanced — walls, drain & flare/ }));
    expect(screen.getByText('Wall thickness')).toBeInTheDocument();
    expect(screen.getByText('Flare')).toBeInTheDocument();
  });

  it('slider edit writes to the store', () => {
    render(<ShapeTab />);
    const slider = screen.getByRole('slider', { name: 'Height' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '200' } });
    fireEvent.pointerUp(slider);
    expect(useAppStore.getState().geometry.H).toBe(200);
  });
});
```

- [ ] **Step 3: Run to verify fail** — FAIL.

- [ ] **Step 4: Implement**

`src/ui/v3/panel/ShapeTab.tsx`:

```tsx
import React, { useCallback } from 'react';
import { ParamRow } from '../primitives/ParamRow';
import { DisclosureSeam } from '../primitives/DisclosureSeam';
import { useAppStore } from '../../../state';
import { DEFAULT_GEOMETRY, GEOMETRY_BOUNDS, type GeometryParams } from '../../../state/types';
import { GEOMETRY_LABELS } from './labels';

const SIZE_KEYS: Array<keyof GeometryParams> = ['H', 'top_od', 'bottom_od'];
const STRUCTURE_KEYS: Array<keyof GeometryParams> = ['t_wall', 't_bottom', 'r_drain', 'expn'];
const ORNAMENT_KEYS: Array<keyof GeometryParams> = [
  'bellAmp', 'bellCenter', 'bellWidth', 'spinTurns', 'spinPhase', 'spinCurve',
];

export const ShapeTab: React.FC = () => {
  const geometry = useAppStore((s) => s.geometry);
  const setGeometryParam = useAppStore((s) => s.setGeometryParam);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const row = useCallback(
    (key: keyof GeometryParams) => {
      const bounds = GEOMETRY_BOUNDS[key];
      const meta = GEOMETRY_LABELS[key];
      return (
        <ParamRow
          key={key}
          label={meta.label}
          unit={meta.unit}
          value={geometry[key]}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          defaultValue={DEFAULT_GEOMETRY[key]}
          onChange={(v) => setGeometryParam(key, v)}
          onInteractionStart={beginHistoryTransaction}
          onValueCommit={commitHistoryTransaction}
          data-testid={`pf3-param-${key}`}
        />
      );
    },
    [geometry, setGeometryParam, beginHistoryTransaction, commitHistoryTransaction],
  );

  return (
    <div className="pf3-shape-tab">
      <div className="pf3-section-voice">Size</div>
      {SIZE_KEYS.map(row)}
      <DisclosureSeam id="shape-structure" summary="advanced — walls, drain & flare">
        {STRUCTURE_KEYS.map(row)}
      </DisclosureSeam>
      <div className="pf3-section-voice">Bell &amp; twist</div>
      <DisclosureSeam id="shape-ornament" summary="advanced — bell & twist">
        {ORNAMENT_KEYS.map(row)}
      </DisclosureSeam>
    </div>
  );
};
```

- [ ] **Step 5: Run to verify pass** — 3 PASS. `npm run typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/v3/panel/labels.ts src/ui/v3/panel/ShapeTab.*
git commit -m "feat(ui-v3): ShapeTab — Size + advanced seams over GEOMETRY_BOUNDS"
```

---

### Task 9: StyleTab — working set (Phase-1 lite)

**Files:**
- Create: `src/ui/v3/panel/StyleTab.tsx`, add styles to `PanelShell.css` if needed
- Test: `src/ui/v3/panel/StyleTab.test.tsx`

**Interfaces:**
- Consumes: `ParamRow`, `ToggleRow`, `DisclosureSeam`; style slice: `useAppStore((s) => s.style)` (`{ name, opts }`), `s.setStyle(name: string)`, `s.setStyleOpt(key: string, value: number | boolean)`; the registry.
- Produces: `StyleTab: React.FC`. (Showroom overlay replaces the `<select>` in Phase 2 — keep the select's handler isolated so the swap is one line.)

- [ ] **Step 1: Verify slice + registry export names**

Read `src/state/slices/style.ts` and `src/styles/registry.ts` (first ~40 lines each). Confirm: action names `setStyle` / `setStyleOpt` (adjust the code below if they differ) and the registry export (expected: a `STYLE_REGISTRY: Record<string, StyleConfig>` or similar map plus `STYLE_IDS`). Note the exact names before writing code.

- [ ] **Step 2: Write the failing test**

`src/ui/v3/panel/StyleTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StyleTab } from './StyleTab';
import { useAppStore } from '../../../state';

describe('StyleTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setStyle('HarmonicRipple');
  });

  it('shows the current style card and its parameter rows', () => {
    render(<StyleTab />);
    expect(screen.getByTestId('pf3-style-current').textContent).toContain('HarmonicRipple');
    // HarmonicRipple has hr_petals etc. — at least one labelled row renders
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('changing style select writes to the store', () => {
    render(<StyleTab />);
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'GothicArches' } });
    expect(useAppStore.getState().style.name).toBe('GothicArches');
  });

  it('param row edit writes a style opt', () => {
    render(<StyleTab />);
    const first = screen.getAllByRole('slider')[0];
    fireEvent.pointerDown(first);
    fireEvent.change(first, { target: { value: String(Number(first.getAttribute('max'))) } });
    fireEvent.pointerUp(first);
    const { opts } = useAppStore.getState().style;
    expect(Object.keys(opts).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run to verify fail** — FAIL.

- [ ] **Step 4: Implement**

`src/ui/v3/panel/StyleTab.tsx` (adjust registry import per Step 1 findings):

```tsx
import React from 'react';
import { ParamRow } from '../primitives/ParamRow';
import { ToggleRow } from '../primitives/ToggleRow';
import { DisclosureSeam } from '../primitives/DisclosureSeam';
import { useAppStore } from '../../../state';
import { STYLE_REGISTRY } from '../../../styles/registry';
import type { ParamSchema } from '../../../state/types';

const STYLE_NAMES = Object.keys(STYLE_REGISTRY);

export const StyleTab: React.FC = () => {
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpt = useAppStore((s) => s.setStyleOpt);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const config = STYLE_REGISTRY[style.name];
  if (!config) return <p className="pf3-label">Unknown style: {style.name}</p>;

  const renderParam = (key: string, schema: ParamSchema): React.ReactNode => {
    const current = style.opts[key] ?? schema.default;
    if (schema.type === 'bool') {
      return (
        <ToggleRow
          key={key}
          label={schema.label}
          checked={Boolean(current)}
          onChange={(v) => setStyleOpt(key, v)}
        />
      );
    }
    return (
      <ParamRow
        key={key}
        label={schema.label}
        unit={schema.unit}
        value={Number(current)}
        min={schema.min ?? 0}
        max={schema.max ?? 1}
        step={schema.step ?? (schema.type === 'int' ? 1 : 0.01)}
        defaultValue={Number(schema.default)}
        onChange={(v) => setStyleOpt(key, schema.type === 'int' ? Math.round(v) : v)}
        onInteractionStart={beginHistoryTransaction}
        onValueCommit={commitHistoryTransaction}
      />
    );
  };

  return (
    <div className="pf3-style-tab">
      <div className="pf3-style-tab__current" data-testid="pf3-style-current">
        <div className="pf3-section-voice">{config.name}</div>
        <p className="pf3-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {config.description}
        </p>
      </div>
      <label className="pf3-label" htmlFor="pf3-style-select">Style</label>
      <select
        id="pf3-style-select"
        aria-label="Style"
        className="pf3-style-tab__select pf3-mono"
        value={style.name}
        onChange={(e) => setStyle(e.target.value)}
        data-pf3-focusable=""
      >
        {STYLE_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <div className="pf3-section-voice" style={{ marginTop: 'var(--pf3-space-md)' }}>Parameters</div>
      {Object.entries(config.params).map(([k, s]) => renderParam(k, s))}
      {config.advancedParams && Object.keys(config.advancedParams).length > 0 && (
        <DisclosureSeam
          id="style-advanced"
          summary={`advanced — ${Object.keys(config.advancedParams).length} more`}
        >
          {Object.entries(config.advancedParams).map(([k, s]) => renderParam(k, s))}
        </DisclosureSeam>
      )}
    </div>
  );
};
```

Add to `PanelShell.css`:

```css
.pf3-style-tab__select {
  width: 100%; margin: 4px 0 var(--pf3-space-sm);
  background: var(--pf3-elevated); color: var(--pf3-text-primary);
  border: 1px solid var(--pf3-glass-border); border-radius: var(--pf3-radius-sm);
  padding: 6px 8px; font-size: 12px;
}
```

- [ ] **Step 5: Run to verify pass** — 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/v3/panel/StyleTab.* src/ui/v3/panel/PanelShell.css
git commit -m "feat(ui-v3): StyleTab — schema-driven params with advanced seam"
```

---

### Task 10: Icons + PillToolbar

**Files:**
- Create: `src/ui/v3/icons.tsx`, `src/ui/v3/stage/PillToolbar.tsx`, `PillToolbar.css`
- Test: `src/ui/v3/stage/PillToolbar.test.tsx`

**Interfaces:**
- Consumes: store `undo`/`redo`/`toggleZenMode`/`toggleFullscreen`; the renderer controller for camera actions.
- Produces: `PillToolbar: React.FC` — three pills: History (undo, redo) · View (reset camera, auto-rotate) · Scene (zen, fullscreen). Icon components: `IconUndo, IconRedo, IconCameraReset, IconRotate, IconZen, IconFullscreen` — all 16×16, `stroke="currentColor"`, `strokeWidth={1.5}`, `fill="none"` (this IS the one icon family; no other icon source may be used in v3).

- [ ] **Step 1: Verify controller camera API**

Read `src/ui/v2/layout/ToolbarV2.tsx` and note the exact calls it makes for reset-camera and auto-rotate (expected: consuming `ControllerContext` — note the hook/consumer name and method names, e.g. `controller.resetCamera()` / `controller.setAutoRotate(enabled)` or an `emit`/params call). Mirror exactly those calls in Step 4; do not invent new controller methods.

- [ ] **Step 2: Write the failing test**

`src/ui/v3/stage/PillToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PillToolbar } from './PillToolbar';
import { useAppStore } from '../../../state';

describe('PillToolbar', () => {
  it('renders three grouped pills with labelled buttons', () => {
    render(<PillToolbar />);
    for (const name of ['Undo', 'Redo', 'Reset camera', 'Auto-rotate', 'Zen mode', 'Fullscreen']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('pf3-pill')).toHaveLength(3);
  });

  it('zen button toggles the store', () => {
    const before = useAppStore.getState().ui.zenMode;
    fireEvent.click(screen.getByRole('button', { name: 'Zen mode' }));
    expect(useAppStore.getState().ui.zenMode).toBe(!before);
  });
});
```

(Component must render without a controller in jsdom — camera buttons no-op when the controller is absent.)

- [ ] **Step 3: Run to verify fail** — FAIL.

- [ ] **Step 4: Implement**

`src/ui/v3/icons.tsx`:

```tsx
import React from 'react';

const base = {
  width: 16, height: 16, viewBox: '0 0 16 16',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;

export const IconUndo: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M6 3 3 6l3 3" /><path d="M3 6h7a3 3 0 0 1 0 6H8" /></svg>
);
export const IconRedo: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M10 3l3 3-3 3" /><path d="M13 6H6a3 3 0 0 0 0 6h2" /></svg>
);
export const IconCameraReset: React.FC = () => (
  <svg {...base} aria-hidden="true"><circle cx="8" cy="8" r="2" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2" /></svg>
);
export const IconRotate: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5" /><path d="M13 2v3h-3" /></svg>
);
export const IconZen: React.FC = () => (
  <svg {...base} aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 5.5v5M5.5 8h5" opacity="0.4" /></svg>
);
export const IconFullscreen: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
);
```

`src/ui/v3/stage/PillToolbar.tsx` (replace the two `CONTROLLER:` comment lines with the exact calls found in Step 1):

```tsx
import React, { useCallback, useState } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import { useAppStore } from '../../../state';
import {
  IconUndo, IconRedo, IconCameraReset, IconRotate, IconZen, IconFullscreen,
} from '../icons';
import './PillToolbar.css';

const PillButton: React.FC<{ label: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({
  label, onClick, active, children,
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`pf3-pillbtn${active ? ' pf3-pillbtn--active' : ''}`}
    onClick={onClick}
    data-pf3-focusable=""
  >
    {children}
  </button>
);

export const PillToolbar: React.FC = () => {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const [autoRotate, setAutoRotate] = useState(false);

  const resetCamera = useCallback(() => {
    // CONTROLLER: call the exact reset-camera API found in ToolbarV2 (Step 1); no-op if controller absent.
    window.dispatchEvent(new CustomEvent('pf3:reset-camera'));
  }, []);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((v) => {
      // CONTROLLER: call the exact auto-rotate API found in ToolbarV2 (Step 1) with !v.
      window.dispatchEvent(new CustomEvent('pf3:auto-rotate', { detail: { enabled: !v } }));
      return !v;
    });
  }, []);

  return (
    <div className="pf3-toolbar" data-zen={zenMode || undefined}>
      <GlassSurface className="pf3-toolbar__pill"><span data-testid="pf3-pill" className="pf3-toolbar__group">
        <PillButton label="Undo" onClick={undo}><IconUndo /></PillButton>
        <PillButton label="Redo" onClick={redo}><IconRedo /></PillButton>
      </span></GlassSurface>
      <GlassSurface className="pf3-toolbar__pill"><span data-testid="pf3-pill" className="pf3-toolbar__group">
        <PillButton label="Reset camera" onClick={resetCamera}><IconCameraReset /></PillButton>
        <PillButton label="Auto-rotate" onClick={toggleAutoRotate} active={autoRotate}><IconRotate /></PillButton>
      </span></GlassSurface>
      <GlassSurface className="pf3-toolbar__pill"><span data-testid="pf3-pill" className="pf3-toolbar__group">
        <PillButton label="Zen mode" onClick={toggleZenMode} active={zenMode}><IconZen /></PillButton>
        <PillButton label="Fullscreen" onClick={toggleFullscreen}><IconFullscreen /></PillButton>
      </span></GlassSurface>
    </div>
  );
};
```

`src/ui/v3/stage/PillToolbar.css`:

```css
.pf3-toolbar {
  position: absolute; top: var(--pf3-space-lg); left: 50%;
  transform: translateX(calc(-50% + 170px)); /* optically centered over the stage, right of panel */
  display: flex; gap: var(--pf3-space-sm);
  z-index: var(--pf3-z-toolbar);
  pointer-events: auto;
}
.pf3-toolbar__pill { border-radius: var(--pf3-radius-pill); }
.pf3-toolbar__group { display: flex; padding: 4px 6px; gap: 2px; }
.pf3-pillbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 24px; border-radius: var(--pf3-radius-pill);
  color: var(--pf3-text-secondary);
  transition: color var(--pf3-dur-control) var(--pf3-ease-move),
              background-color var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-pillbtn:hover { color: var(--pf3-text-primary); background: var(--pf3-gold-tint); }
.pf3-pillbtn--active { color: var(--pf3-gold); }
```

- [ ] **Step 5: Run to verify pass** — 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/v3/icons.tsx src/ui/v3/stage/
git commit -m "feat(ui-v3): one icon family + grouped PillToolbar"
```

---

### Task 11: StatusLine + HintLine

**Files:**
- Create: `src/ui/v3/stage/StatusLine.tsx`, `StatusLine.css`, `HintLine.tsx`, `HintLine.css`
- Test: `src/ui/v3/stage/StatusLine.test.tsx`, `src/ui/v3/stage/HintLine.test.tsx`

**Interfaces:**
- Consumes: `useAppStore((s) => s.performance)` (`triangleCount`, `generationTime`, `isGenerating`).
- Produces: `StatusLine: React.FC` — bottom-left quiet mono line: `24,412 triangles · 12 ms` (locale thousands separators; shows `shaping…` while `isGenerating`). `HintLine: React.FC` — bottom-center italic hint "Drag to orbit · pick a starting point on the left", dismissed permanently on any pointerdown anywhere (localStorage `pf3-hint-dismissed`).

- [ ] **Step 1: Write the failing tests**

`src/ui/v3/stage/StatusLine.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusLine } from './StatusLine';
import { useAppStore } from '../../../state';

describe('StatusLine', () => {
  it('formats triangles with separators and shows generation time', () => {
    useAppStore.setState((s) => ({
      performance: { ...s.performance, triangleCount: 24412, generationTime: 12.4, isGenerating: false },
    }));
    render(<StatusLine />);
    expect(screen.getByTestId('pf3-status').textContent).toBe('24,412 triangles · 12 ms');
  });

  it('announces shaping while generating', () => {
    useAppStore.setState((s) => ({
      performance: { ...s.performance, isGenerating: true },
    }));
    render(<StatusLine />);
    expect(screen.getByTestId('pf3-status').textContent).toContain('shaping…');
  });
});
```

`src/ui/v3/stage/HintLine.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HintLine } from './HintLine';

describe('HintLine', () => {
  beforeEach(() => localStorage.clear());

  it('shows on first run, hides after any pointer interaction', () => {
    render(<HintLine />);
    expect(screen.getByText(/Drag to orbit/)).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText(/Drag to orbit/)).not.toBeInTheDocument();
    expect(localStorage.getItem('pf3-hint-dismissed')).toBe('1');
  });

  it('never returns once dismissed', () => {
    localStorage.setItem('pf3-hint-dismissed', '1');
    render(<HintLine />);
    expect(screen.queryByText(/Drag to orbit/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**

`src/ui/v3/stage/StatusLine.tsx`:

```tsx
import React from 'react';
import { useAppStore } from '../../../state';
import './StatusLine.css';

export const StatusLine: React.FC = () => {
  const triangleCount = useAppStore((s) => s.performance.triangleCount);
  const generationTime = useAppStore((s) => s.performance.generationTime);
  const isGenerating = useAppStore((s) => s.performance.isGenerating);

  const text = isGenerating
    ? 'shaping…'
    : `${triangleCount.toLocaleString('en-US')} triangles · ${Math.round(generationTime)} ms`;

  return (
    <div className="pf3-status pf3-mono" data-testid="pf3-status" aria-live="polite">
      {text}
    </div>
  );
};
```

`src/ui/v3/stage/StatusLine.css`:

```css
.pf3-status {
  position: absolute; bottom: var(--pf3-space-lg);
  left: calc(var(--pf3-space-lg) + 340px + 28px); /* right of the panel's default width */
  font-size: 10.5px; color: var(--pf3-text-muted);
  z-index: var(--pf3-z-toolbar);
  pointer-events: none;
}
```

`src/ui/v3/stage/HintLine.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import './HintLine.css';

const KEY = 'pf3-hint-dismissed';

export const HintLine: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) !== '1'; } catch { return true; }
  });

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
      setVisible(false);
    };
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [visible]);

  if (!visible) return null;
  return (
    <GlassSurface className="pf3-hint">
      <span className="pf3-hint__text">Drag to orbit · pick a starting point on the left</span>
    </GlassSurface>
  );
};
```

`src/ui/v3/stage/HintLine.css`:

```css
.pf3-hint {
  position: absolute; bottom: var(--pf3-space-lg); left: 58%;
  transform: translateX(-50%);
  padding: 6px 14px; border-radius: var(--pf3-radius-pill);
  z-index: var(--pf3-z-toolbar);
  pointer-events: none;
}
.pf3-hint__text {
  font: italic 400 12px var(--pf3-font-display);
  color: var(--pf3-text-secondary);
}
```

- [ ] **Step 4: Run to verify pass** — 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/stage/StatusLine.* src/ui/v3/stage/HintLine.*
git commit -m "feat(ui-v3): humane StatusLine + whispered HintLine"
```

---

### Task 12: useStudioBackdrop — one-time warm scene migration

**Files:**
- Create: `src/ui/v3/stage/useStudioBackdrop.ts`
- Test: `src/ui/v3/stage/useStudioBackdrop.test.ts`

**Interfaces:**
- Consumes: appearance slice (`useAppStore((s) => s.appearance.gradient)` + the appearance setter — verify exact action name in `src/state/slices/appearance.ts`, expected `setAppearanceParam(key, value)`).
- Produces: `useStudioBackdrop(): void` — on first v3 mount only (guard `localStorage['pf3-scene-migrated']`), if the current `appearance.gradient` still equals the v1 default `['#1a1a2e', '#16213e']`, set it to the Studio values `['#131009', '#0e0b08']` and `gradientAngle` to `0`. Users who already customized their background are never touched.

- [ ] **Step 1: Verify the appearance setter** — read `src/state/slices/appearance.ts` (first ~60 lines); note the exact action to set `gradient` and `gradientAngle`. Adjust the code below to the real API.

- [ ] **Step 2: Write the failing test**

`src/ui/v3/stage/useStudioBackdrop.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStudioBackdrop, STUDIO_GRADIENT } from './useStudioBackdrop';
import { useAppStore } from '../../../state';
import { DEFAULT_APPEARANCE } from '../../../state/types';

describe('useStudioBackdrop', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((s) => ({ appearance: { ...DEFAULT_APPEARANCE } }));
  });

  it('migrates the v1 default gradient to studio values once', () => {
    renderHook(() => useStudioBackdrop());
    expect(useAppStore.getState().appearance.gradient).toEqual(STUDIO_GRADIENT);
    expect(localStorage.getItem('pf3-scene-migrated')).toBe('1');
  });

  it('leaves a customized gradient alone', () => {
    useAppStore.setState((s) => ({
      appearance: { ...s.appearance, gradient: ['#ff0000', '#00ff00'] as [string, string] },
    }));
    renderHook(() => useStudioBackdrop());
    expect(useAppStore.getState().appearance.gradient).toEqual(['#ff0000', '#00ff00']);
  });

  it('does not re-migrate after the flag is set', () => {
    localStorage.setItem('pf3-scene-migrated', '1');
    renderHook(() => useStudioBackdrop());
    expect(useAppStore.getState().appearance.gradient).toEqual(DEFAULT_APPEARANCE.gradient);
  });
});
```

- [ ] **Step 3: Run to verify fail** — FAIL.

- [ ] **Step 4: Implement**

`src/ui/v3/stage/useStudioBackdrop.ts` (adjust setter call per Step 1):

```ts
import { useEffect } from 'react';
import { useAppStore } from '../../../state';
import { DEFAULT_APPEARANCE } from '../../../state/types';

export const STUDIO_GRADIENT: [string, string] = ['#131009', '#0e0b08'];
const FLAG = 'pf3-scene-migrated';

export function useStudioBackdrop(): void {
  useEffect(() => {
    try {
      if (localStorage.getItem(FLAG) === '1') return;
      const { appearance, setAppearanceParam } = useAppStore.getState();
      const [a, b] = appearance.gradient;
      const [da, db] = DEFAULT_APPEARANCE.gradient;
      if (a === da && b === db) {
        setAppearanceParam('gradient', STUDIO_GRADIENT);
        setAppearanceParam('gradientAngle', 0);
      }
      localStorage.setItem(FLAG, '1');
    } catch { /* private mode — skip migration */ }
  }, []);
}
```

- [ ] **Step 5: Run to verify pass** — 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/v3/stage/useStudioBackdrop.*
git commit -m "feat(ui-v3): one-time studio backdrop migration (respects custom scenes)"
```

---

### Task 13: ExportFooter — the sticky money moment

**Files:**
- Modify: `src/state/types.ts` (UIState: add `exportFilename: string | null`, default `null`), `src/state/slices/ui.ts` (add `setExportFilename(name: string | null): void` mirroring other ui setters)
- Create: `src/ui/v3/panel/exportName.ts`, `src/ui/v3/panel/ExportFooter.tsx`, `ExportFooter.css`
- Test: `src/ui/v3/panel/ExportFooter.test.tsx` (also covers `exportName`)

**Interfaces:**
- Consumes: `useParametricExport()` → `{ progress: { status, progress, message }, stats, isAvailable, exportSTL(filename?) }`; `useExportTier()` → `{ checkExportAllowed(), recordExport(), isPro, isAuthConfigured }`; store `performance.triangleCount`, `mesh.export_n_theta/export_n_z`, `style.name`, `geometry.H`, `ui.exportFilename`.
- Produces:
  - `deriveDefaultFilename(styleName: string, H: number): string` — `'HarmonicRipple', 120` → `'harmonic-ripple-120'` (kebab-case, no extension).
  - `estimateExport(nTheta: number, nZ: number): { tris: number; bytes: number }` — `tris = nTheta * nZ * 2`, `bytes = 84 + tris * 50` (binary STL).
  - `formatBytes(bytes: number): string` — `4322132` → `'4.1 MB'`.
  - `ExportFooter: React.FC` — label row (`quality · ≈ tris · ≈ size`), gold CTA `Export STL`; while firing shows `progress.message` + thin gold bar; `Exported ✓ <filename>.stl` for 4 s on completion; listens for `window` event `'pf3:download'`; on gated (`!checkExportAllowed().canExport`) renders `Continue with Pro` CTA instead (opens the pricing modal in Phase 2 — Phase 1: `window.dispatchEvent(new CustomEvent('pf3:upgrade'))`); calls `recordExport()` after successful export.

- [ ] **Step 1: Write the failing tests**

`src/ui/v3/panel/ExportFooter.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { deriveDefaultFilename, estimateExport, formatBytes } from './exportName';

const exportSTL = vi.fn().mockResolvedValue(undefined);
const recordExport = vi.fn().mockResolvedValue(undefined);
let canExport = true;

vi.mock('../../../hooks/useParametricExport', () => ({
  useParametricExport: () => ({
    progress: { status: 'idle', progress: 0, message: '' },
    stats: null,
    isAvailable: true,
    exportSTL,
  }),
}));
vi.mock('../../../hooks/useExportTier', () => ({
  useExportTier: () => ({
    checkExportAllowed: () => ({
      canExport, isPro: false, exportsRemaining: canExport ? 7 : 0,
      totalExports: 10, showUpgradePrompt: !canExport, reason: canExport ? null : 'limit',
    }),
    recordExport,
    exportsThisMonth: 3,
    isPro: false,
    isAuthConfigured: true,
  }),
}));

import { ExportFooter } from './ExportFooter';

describe('exportName utils', () => {
  it('derives kebab filenames', () => {
    expect(deriveDefaultFilename('HarmonicRipple', 120)).toBe('harmonic-ripple-120');
  });
  it('estimates triangles and bytes', () => {
    const { tris, bytes } = estimateExport(336, 168);
    expect(tris).toBe(112896);
    expect(bytes).toBe(84 + 112896 * 50);
  });
  it('formats bytes humanely', () => {
    expect(formatBytes(4_322_132)).toBe('4.1 MB');
    expect(formatBytes(512_000)).toBe('500 KB');
  });
});

describe('ExportFooter', () => {
  beforeEach(() => { exportSTL.mockClear(); recordExport.mockClear(); canExport = true; });

  it('fires the parametric export with a derived filename and records it', async () => {
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await vi.waitFor(() => expect(exportSTL).toHaveBeenCalled());
    expect(String(exportSTL.mock.calls[0][0])).toMatch(/^[a-z0-9-]+$/);
    await vi.waitFor(() => expect(recordExport).toHaveBeenCalledOnce());
  });

  it('shows the upgrade CTA when gated', () => {
    canExport = false;
    render(<ExportFooter />);
    expect(screen.getByRole('button', { name: /Continue with Pro/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export STL/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement**

`src/ui/v3/panel/exportName.ts`:

```ts
export function deriveDefaultFilename(styleName: string, H: number): string {
  const kebab = styleName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
  return `${kebab}-${Math.round(H)}`;
}

export function estimateExport(nTheta: number, nZ: number): { tris: number; bytes: number } {
  const tris = nTheta * nZ * 2;
  return { tris, bytes: 84 + tris * 50 };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
```

Extend the ui slice first (types default `exportFilename: null`, setter mirrors `setV3ActiveTab`).

`src/ui/v3/panel/ExportFooter.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { useAppStore } from '../../../state';
import { useParametricExport } from '../../../hooks/useParametricExport';
import { useExportTier } from '../../../hooks/useExportTier';
import { deriveDefaultFilename, estimateExport, formatBytes } from './exportName';
import './ExportFooter.css';

export const ExportFooter: React.FC = () => {
  const styleName = useAppStore((s) => s.style.name);
  const H = useAppStore((s) => s.geometry.H);
  const nTheta = useAppStore((s) => s.mesh.export_n_theta);
  const nZ = useAppStore((s) => s.mesh.export_n_z);
  const exportFilename = useAppStore((s) => s.ui.exportFilename);

  const { progress, isAvailable, exportSTL } = useParametricExport();
  const { checkExportAllowed, recordExport } = useExportTier();

  const [done, setDone] = useState<string | null>(null);
  const firing = progress.status === 'initializing' || progress.status === 'generating';
  const { tris, bytes } = estimateExport(nTheta, nZ);
  const filename = exportFilename ?? deriveDefaultFilename(styleName, H);
  const tier = checkExportAllowed();

  const fire = useCallback(async () => {
    if (firing || !tier.canExport) return;
    setDone(null);
    await exportSTL(filename);
    await recordExport();
    setDone(filename);
  }, [firing, tier.canExport, exportSTL, filename, recordExport]);

  useEffect(() => {
    const onShortcut = () => void fire();
    window.addEventListener('pf3:download', onShortcut);
    return () => window.removeEventListener('pf3:download', onShortcut);
  }, [fire]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <div className="pf3-export-footer">
      <div className="pf3-export-footer__meta">
        <span className="pf3-label">export</span>
        <span className="pf3-mono pf3-export-footer__est">
          ≈ {tris.toLocaleString('en-US')} tris · {formatBytes(bytes)}
        </span>
      </div>
      {firing ? (
        <div className="pf3-export-footer__progress" aria-live="polite">
          <span className="pf3-mono">{progress.message || 'firing…'}</span>
          <div className="pf3-export-footer__bar">
            <div className="pf3-export-footer__fill" style={{ width: `${progress.progress}%` }} />
          </div>
        </div>
      ) : tier.canExport ? (
        <Button variant="primary" onClick={() => void fire()} disabled={!isAvailable} data-testid="pf3-export-cta">
          {done ? `Exported ✓ ${done}.stl` : 'Export STL'}
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => window.dispatchEvent(new CustomEvent('pf3:upgrade'))}
          data-testid="pf3-upgrade-cta"
        >
          Continue with Pro
        </Button>
      )}
    </div>
  );
};
```

`src/ui/v3/panel/ExportFooter.css`:

```css
.pf3-export-footer { display: flex; flex-direction: column; gap: 6px; }
.pf3-export-footer__meta { display: flex; justify-content: space-between; align-items: baseline; }
.pf3-export-footer__est { font-size: 10.5px; color: var(--pf3-text-muted); }
.pf3-export-footer__progress { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
.pf3-export-footer__bar {
  height: 3px; border-radius: 2px; background: rgba(245, 240, 232, 0.12); overflow: hidden;
}
.pf3-export-footer__fill {
  height: 100%; background: var(--pf3-gold-grad);
  transition: width var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-export-footer .pf3-btn { width: 100%; }
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/ui/v3/panel/ExportFooter.test.tsx` → 5 PASS. `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add src/state/types.ts src/state/slices/ui.ts src/ui/v3/panel/exportName.ts src/ui/v3/panel/ExportFooter.*
git commit -m "feat(ui-v3): sticky ExportFooter — estimate, firing progress, dignified gating"
```

---

### Task 14: ExportTab — fidelity, format, filename, quota

**Files:**
- Create: `src/ui/v3/panel/ExportTab.tsx` (+ styles appended to `ExportFooter.css`)
- Test: `src/ui/v3/panel/ExportTab.test.tsx`

**Interfaces:**
- Consumes: mesh slice quality presets — **verify first**: read `src/state/slices/mesh.ts` and `src/ui/v2/tabs/ExportTab.tsx:42-82` for the exact preset API (expected `applyQualityPreset(preset)` with keys like `'draft' | 'standard' | 'high' | 'ultra'`) and which preset maps to which `export_n_theta/export_n_z`. Also `useExportTier()`, `ui.exportFormat` + its setter (verify: expected pattern-matching ui slice setter), `ui.exportFilename` + `setExportFilename` (Task 13).
- Produces: `ExportTab: React.FC` — fidelity radio rows (name + purpose + `≈ tris · size` from `estimateExport`), format segmented (STL enabled; 3MF, OBJ rendered `disabled` with `title="Coming with the certificate — Phase 2"`), filename input (writes `setExportFilename`, placeholder = derived default), quota arc (SVG circle, only when `!isPro && isAuthConfigured`; text `N of 10 free exports left this month`).

Fidelity copy (spec §8.1, do not paraphrase):

| key | name | purpose |
|---|---|---|
| draft | Draft | quick look |
| standard | Standard | everyday prints |
| high | High | print-ready · 0.20 mm |
| ultra | Ultra | exhibition · 0.05 mm |

- [ ] **Step 1: Verify preset + format APIs** (as above). Record exact names.

- [ ] **Step 2: Write the failing test**

`src/ui/v3/panel/ExportTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../hooks/useExportTier', () => ({
  useExportTier: () => ({
    checkExportAllowed: () => ({
      canExport: true, isPro: false, exportsRemaining: 7,
      totalExports: 10, showUpgradePrompt: false, reason: null,
    }),
    recordExport: vi.fn(),
    exportsThisMonth: 3,
    isPro: false,
    isAuthConfigured: true,
  }),
}));

import { ExportTab } from './ExportTab';
import { useAppStore } from '../../../state';

describe('ExportTab', () => {
  beforeEach(() => localStorage.clear());

  it('renders four fidelity rows with honest numbers', () => {
    render(<ExportTab />);
    for (const name of ['Draft', 'Standard', 'High', 'Ultra']) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByText(/quick look/)).toBeInTheDocument();
  });

  it('selecting a fidelity applies the mesh preset', () => {
    render(<ExportTab />);
    fireEvent.click(screen.getByRole('radio', { name: /Draft/ }));
    const { export_n_theta } = useAppStore.getState().mesh;
    expect(export_n_theta).toBeLessThan(336); // draft is coarser than the default standard
  });

  it('3MF and OBJ are visible but disabled', () => {
    render(<ExportTab />);
    expect(screen.getByRole('tab', { name: '3MF' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'OBJ' })).toBeDisabled();
  });

  it('filename input writes to the store', () => {
    render(<ExportTab />);
    fireEvent.change(screen.getByLabelText('Filename'), { target: { value: 'my-pot' } });
    expect(useAppStore.getState().ui.exportFilename).toBe('my-pot');
  });

  it('shows the free-quota line', () => {
    render(<ExportTab />);
    expect(screen.getByText(/7 of 10 free exports left/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify fail** — FAIL.

- [ ] **Step 4: Implement**

`src/ui/v3/panel/ExportTab.tsx` (adjust preset/format setter names per Step 1; the disabled-format buttons reuse the SegmentedControl *markup pattern* inline because SegmentedControl has no disabled support — do not extend it for a Phase-2 throwaway):

```tsx
import React from 'react';
import { useAppStore } from '../../../state';
import { useExportTier } from '../../../hooks/useExportTier';
import { estimateExport, formatBytes, deriveDefaultFilename } from './exportName';
import './ExportFooter.css';

const FIDELITIES = [
  { key: 'draft', name: 'Draft', purpose: 'quick look', nTheta: 168, nZ: 84 },
  { key: 'standard', name: 'Standard', purpose: 'everyday prints', nTheta: 336, nZ: 168 },
  { key: 'high', name: 'High', purpose: 'print-ready · 0.20 mm', nTheta: 672, nZ: 336 },
  { key: 'ultra', name: 'Ultra', purpose: 'exhibition · 0.05 mm', nTheta: 1344, nZ: 672 },
] as const;

export const ExportTab: React.FC = () => {
  const mesh = useAppStore((s) => s.mesh);
  const applyQualityPreset = useAppStore((s) => s.applyQualityPreset);
  const exportFilename = useAppStore((s) => s.ui.exportFilename);
  const setExportFilename = useAppStore((s) => s.setExportFilename);
  const styleName = useAppStore((s) => s.style.name);
  const H = useAppStore((s) => s.geometry.H);
  const { checkExportAllowed, isPro, isAuthConfigured } = useExportTier();
  const tier = checkExportAllowed();

  const activeKey =
    FIDELITIES.find((f) => f.nTheta === mesh.export_n_theta && f.nZ === mesh.export_n_z)?.key ?? 'custom';

  return (
    <div className="pf3-export-tab">
      <div className="pf3-section-voice">Fidelity</div>
      <div role="radiogroup" aria-label="Fidelity">
        {FIDELITIES.map((f) => {
          const { tris, bytes } = estimateExport(f.nTheta, f.nZ);
          const selected = activeKey === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`pf3-fidelity${selected ? ' pf3-fidelity--on' : ''}`}
              onClick={() => applyQualityPreset(f.key)}
              data-pf3-focusable=""
            >
              <span className="pf3-fidelity__name">{f.name}</span>
              <span className="pf3-fidelity__purpose">{f.purpose}</span>
              <span className="pf3-mono pf3-fidelity__est">
                ≈ {tris.toLocaleString('en-US')} · {formatBytes(bytes)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pf3-section-voice" style={{ marginTop: 'var(--pf3-space-md)' }}>File</div>
      <label className="pf3-label" htmlFor="pf3-filename">Filename</label>
      <input
        id="pf3-filename"
        aria-label="Filename"
        className="pf3-style-tab__select pf3-mono"
        value={exportFilename ?? ''}
        placeholder={deriveDefaultFilename(styleName, H)}
        onChange={(e) => setExportFilename(e.target.value || null)}
        data-pf3-focusable=""
      />
      <div className="pf3-format" role="tablist" aria-label="Format">
        <button type="button" role="tab" aria-selected="true" className="pf3-seg__item pf3-seg__item--on">STL</button>
        <button type="button" role="tab" aria-selected="false" className="pf3-seg__item" disabled
          title="Coming with the certificate — Phase 2">3MF</button>
        <button type="button" role="tab" aria-selected="false" className="pf3-seg__item" disabled
          title="Coming with the certificate — Phase 2">OBJ</button>
      </div>

      {!isPro && isAuthConfigured && tier.exportsRemaining !== null && (
        <p className="pf3-label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 'var(--pf3-space-md)' }}>
          {tier.exportsRemaining} of {tier.totalExports ?? 10} free exports left this month
        </p>
      )}
    </div>
  );
};
```

Append to `ExportFooter.css`:

```css
.pf3-fidelity {
  display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: baseline;
  width: 100%; text-align: left;
  border: 1px solid var(--pf3-glass-border); border-radius: var(--pf3-radius-md);
  padding: 8px 10px; margin-bottom: 6px;
  transition: border-color var(--pf3-dur-control) var(--pf3-ease-move);
}
.pf3-fidelity--on { border-color: var(--pf3-gold); background: var(--pf3-gold-tint); }
.pf3-fidelity__name { font: 500 12.5px var(--pf3-font-body); color: var(--pf3-text-primary); }
.pf3-fidelity__purpose { font-size: 11px; color: var(--pf3-text-secondary); }
.pf3-fidelity__est { font-size: 10px; color: var(--pf3-text-muted); }
.pf3-format { display: flex; gap: 2px; margin-top: var(--pf3-space-sm);
  background: rgba(245, 240, 232, 0.06); border-radius: var(--pf3-radius-md); padding: 2.5px; }
.pf3-format .pf3-seg__item:disabled { opacity: 0.4; cursor: not-allowed; }
```

Note: if Step 1 reveals `applyQualityPreset` uses different preset keys or resolutions, update `FIDELITIES` to the real mapping and fix the "Draft is coarser" test threshold accordingly — the honest numbers must come from what the preset actually applies.

- [ ] **Step 5: Run to verify pass** — 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/v3/panel/ExportTab.* src/ui/v3/panel/ExportFooter.css
git commit -m "feat(ui-v3): ExportTab — fidelity rows, filename, format, quota"
```

---

### Task 15: Assemble AppUIv3 + keyboard map + zen

**Files:**
- Modify: `src/ui/v3/AppUIv3.tsx` (replace the Task-1 stub), `src/ui/v3/AppUIv3.test.tsx` (extend)
- Create: `src/ui/v3/AppUIv3.css`

**Interfaces:**
- Consumes: everything above.
- Produces: the complete Phase-1 shell. Keyboard contract (all ignored while typing in inputs/textareas/selects/contentEditable): `Z` zen · `D` dispatches `'pf3:download'` · `R` dispatches `'pf3:reset-camera'` · `Alt+1/2/3` → `setV3ActiveTab('shape'|'style'|'export')` · `Ctrl/Cmd+Z` undo · `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` redo. Zen mode (`data-zen`) hides panel/status/hint, keeps toolbar. Root has `pointer-events: none`; children opt in (canvas stays orbit-able).

- [ ] **Step 1: Extend the failing tests**

Add to `src/ui/v3/AppUIv3.test.tsx`:

```tsx
it('renders panel, toolbar and status chrome', () => {
  useAppStore.getState().setUITheme('v3');
  render(<AppUIv3 />);
  expect(screen.getByTestId('pf3-panel')).toBeInTheDocument();
  expect(screen.getAllByTestId('pf3-pill')).toHaveLength(3);
  expect(screen.getByTestId('pf3-status')).toBeInTheDocument();
});

it('Alt+2 switches to the style tab; typing in inputs is ignored', () => {
  useAppStore.getState().setUITheme('v3');
  render(<AppUIv3 />);
  fireEvent.keyDown(document, { key: '2', altKey: true });
  expect(useAppStore.getState().ui.v3ActiveTab).toBe('style');
});

it('Z toggles zen and hides the panel', () => {
  useAppStore.getState().setUITheme('v3');
  useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: false } }));
  render(<AppUIv3 />);
  fireEvent.keyDown(document, { key: 'z' });
  expect(useAppStore.getState().ui.zenMode).toBe(true);
  expect(screen.queryByTestId('pf3-panel')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail** — new tests FAIL.

- [ ] **Step 3: Implement**

`src/ui/v3/AppUIv3.tsx` (full replacement):

```tsx
/**
 * PotFoundry UI v3 — "Studio at Dusk" root shell (spec §4, §12).
 */
import React, { useEffect } from 'react';
import { ErrorBoundary } from '../shared';
import { useAppStore } from '../../state';
import { PanelShell } from './panel/PanelShell';
import { ShapeTab } from './panel/ShapeTab';
import { StyleTab } from './panel/StyleTab';
import { ExportTab } from './panel/ExportTab';
import { ExportFooter } from './panel/ExportFooter';
import { PillToolbar } from './stage/PillToolbar';
import { StatusLine } from './stage/StatusLine';
import { HintLine } from './stage/HintLine';
import { useStudioBackdrop } from './stage/useStudioBackdrop';
import './tokens.css';
import './AppUIv3.css';

const TAB_KEYS: Record<string, 'shape' | 'style' | 'export'> = { '1': 'shape', '2': 'style', '3': 'export' };

export const AppUIv3: React.FC = () => {
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const v3ActiveTab = useAppStore((s) => s.ui.v3ActiveTab);
  const setV3ActiveTab = useAppStore((s) => s.setV3ActiveTab);
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);

  useStudioBackdrop();

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    return () => { delete document.documentElement.dataset.theme; };
  }, []);

  useEffect(() => {
    if (uiTheme !== 'v3') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
        if (k === 'y') { e.preventDefault(); redo(); return; }
        if (k === 'z') { e.preventDefault(); undo(); return; }
        return;
      }
      if (e.altKey && TAB_KEYS[e.key]) { e.preventDefault(); setV3ActiveTab(TAB_KEYS[e.key]); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); toggleZenMode(); }
      if (k === 'd') { e.preventDefault(); window.dispatchEvent(new CustomEvent('pf3:download')); }
      if (k === 'r') { e.preventDefault(); window.dispatchEvent(new CustomEvent('pf3:reset-camera')); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [uiTheme, undo, redo, setV3ActiveTab, toggleZenMode]);

  return (
    <ErrorBoundary name="AppUIv3">
      <div className="pf3-root pf3-layout" data-theme="dark" data-zen={zenMode || undefined} data-testid="pf3-root">
        <ErrorBoundary name="PillToolbar"><PillToolbar /></ErrorBoundary>
        {!zenMode && (
          <>
            <ErrorBoundary name="PanelShell">
              <PanelShell footer={<ExportFooter />}>
                {v3ActiveTab === 'shape' && <ShapeTab />}
                {v3ActiveTab === 'style' && <StyleTab />}
                {v3ActiveTab === 'export' && <ExportTab />}
              </PanelShell>
            </ErrorBoundary>
            <StatusLine />
            <HintLine />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AppUIv3;
```

`src/ui/v3/AppUIv3.css`:

```css
.pf3-layout {
  position: absolute; inset: 0;
  pointer-events: none; /* children opt in — the canvas below stays orbit-able */
  z-index: 10;
}
```

- [ ] **Step 4: Run all v3 tests** — `npx vitest run src/ui/v3 && npm run typecheck` → all PASS, tsc clean. Also `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/v3/
git commit -m "feat(ui-v3): assemble the Studio-at-Dusk shell — keyboard map, zen, chrome"
```

---

### Task 16: E2E smoke + screenshot critique gate

**Files:**
- Create: `e2e/ui-v3-smoke.spec.ts`

**Interfaces:**
- Consumes: the `pf2-ui-theme` localStorage key (value `'v3'`), `.pf3-root` / `[data-testid]` selectors from prior tasks.

- [ ] **Step 1: Write the e2e spec**

`e2e/ui-v3-smoke.spec.ts` (pattern mirrors `e2e/mobile-responsiveness.spec.ts:170-186`):

```ts
import { test, expect } from '@playwright/test';

test.describe('UI v3 desktop smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pf2-ui-theme', 'v3');
    });
    await page.goto('/');
    await page.waitForSelector('.pf3-root', { timeout: 15000 });
  });

  test('shell renders: panel, three pills, status', async ({ page }) => {
    await expect(page.getByTestId('pf3-panel')).toBeVisible();
    await expect(page.getByTestId('pf3-pill')).toHaveCount(3);
    await expect(page.getByTestId('pf3-status')).toBeVisible();
  });

  test('tabs switch and advanced seam expands', async ({ page }) => {
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByTestId('pf3-style-current')).toBeVisible();
    await page.getByRole('tab', { name: 'Shape' }).click();
    await page.getByRole('button', { name: /advanced — walls/ }).click();
    await expect(page.getByText('Wall thickness')).toBeVisible();
  });

  test('height slider drives the store and status updates', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Height' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    const h = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('potfoundry-storage') ?? '{}')?.state?.geometry?.H);
    expect(h).toBeGreaterThan(120);
  });

  test('v1 and v2 shells still mount', async ({ page }) => {
    for (const [theme, sel] of [['classic', '.pf-app-ui'], ['v2', '.pf2-root']] as const) {
      await page.evaluate((t) => localStorage.setItem('pf2-ui-theme', t), theme);
      await page.reload();
      await expect(page.locator(sel).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('capture critique screenshots', async ({ page }) => {
    await page.screenshot({ path: 'test-results/pf3-shape.png' });
    await page.getByRole('tab', { name: 'Style' }).click();
    await page.screenshot({ path: 'test-results/pf3-style.png' });
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.screenshot({ path: 'test-results/pf3-export.png' });
  });
});
```

Note: the persist key in the height test (`potfoundry-storage`) must be verified against `src/state/store.ts` (`name:` field of the persist config) — adjust if it differs.

- [ ] **Step 2: Run it**

Terminal 1: `npm run dev` (leave running). Terminal 2: `npx playwright test e2e/ui-v3-smoke.spec.ts --project=chromium`
Expected: 5 PASS; screenshots in `test-results/`.

- [ ] **Step 3: The screenshot critique gate (spec §13 exit gate — do not skip)**

View `test-results/pf3-shape.png`, `pf3-style.png`, `pf3-export.png` and check each against the mock `docs/superpowers/specs/2026-07-02-ui-v3-mocks/layout-v2-stage-refined.html` and spec §3–§5:

- Gold appears ONLY on: CTA, active segment, slider thumbs/fills, seam text, value chips. Anywhere else → fix.
- Numbers all render in Plex Mono without jitter (drag a slider and watch).
- No truncated labels at 300px panel width.
- Panel/toolbar read as glass over the stage; status line is quiet; hint is italic serif.
- "Remove one accessory": name one element that could be removed; if removing it costs nothing, remove it.

Record findings (even "clean") in the PR/commit body.

- [ ] **Step 4: Full suite** — `npm run test && npm run lint && npm run typecheck` → all green (v1/v2 suites untouched).

- [ ] **Step 5: Commit**

```bash
git add e2e/ui-v3-smoke.spec.ts
git commit -m "test(ui-v3): e2e smoke + critique screenshots for the Phase-1 shell"
```

---

## Plan Self-Review (completed at write time)

- **Spec coverage (Phase 1 scope):** tokens §3 → Task 2; workspace §4 items 1,2,3,6,7 (partial: no gizmo dock — renderer-owned, Phase 2),8 (hint only) → Tasks 7,10,11,15; ParamRow §5 → Task 5; seams §5 → Task 6; style working-set-lite §7 → Task 9; export configure+quota §8.1/8.4 → Tasks 13,14; scene §4.5 → Task 12; quality floor §11 → focus ring/reduced-motion in Task 2, ARIA throughout, critique gate Task 16. Deferred items are listed in the header's scope notes; certificate/firing checklist (§8.2–8.3), Blueprint (§6), showroom (§7), presets shelf (§4.4), entrance (§3.3) → Phase 2 plan.
- **Placeholder scan:** verify-first steps (Tasks 9.1, 10.1, 12.1, 14.1, 16 note) name the expected API and the exact fallback action — these are reads with acceptance criteria, not TBDs.
- **Type consistency:** `V3Tab = V2Tab` used in Tasks 1/7/15; `estimateExport/formatBytes/deriveDefaultFilename` defined in Task 13 and consumed in Task 14; `data-testid` names (`pf3-panel`, `pf3-pill`, `pf3-status`, `pf3-export-cta`) consistent across Tasks 7/10/11/15/16.

## Exit gate for Phase 1

All 16 tasks committed; `npm run test`, `npm run lint`, `npm run typecheck`, and the v3 e2e smoke green with a dev server; critique screenshots reviewed against the mocks and findings recorded. Then hand off to the Phase-2 plan (Blueprint, showroom, certificate, entrance).



