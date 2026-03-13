# Generator Round 1 — UI v2 Luxury Elevation: From Skeleton to Soul

Date: 2026-03-06

## Problem Statement

The existing design doc (`2026-03-06-ui-v2-luxury-redesign-design.md`) is a solid **structural** spec — it defines typography, color palette, layout architecture, tab organization, and file structure. But a luxury UI isn't built from tokens alone. The gap between "this looks professional" and "holy shit, this is beautiful" is entirely in the *temporal dimension*: how things move, how they respond to touch, how they surprise and delight, how they guide without patronizing.

The current spec has zero motion design, zero onboarding strategy, zero interaction choreography, zero sound consideration, and no dark/light duality. It also leaves several component designs at the "same Radix with new colors" level. PotFoundry creates *physical objects* — the digital experience of crafting them should feel as tangible and satisfying as the objects themselves.

## Root Cause Analysis

The v1 UI (`src/ui/AppUI.tsx`, `Sidebar.tsx`, `ExportPanel.tsx`) is functional but clinical:
- Transitions are limited to `--pf-transition-fast: 0.1s ease` / `--pf-transition-normal: 0.15s ease` / `--pf-transition-slow: 0.25s ease` — generic `ease` curves, no brand personality
- The sidebar slide-in is a bare `0.25s ease` keyframe animation (`pf-sidebar-slide-in`)
- Export feedback is minimal — a status bar spinner and text state changes
- Sliders use the standard Radix root with a simple gradient range fill (indigo, not gold)
- Preset cards are flat buttons with thumbnails — no dimensionality, no hover life
- Mobile bottom sheet has touch tracking (`MobileBottomSheet.tsx:91-120`) but no haptic feedback API calls, no gesture-based tab switching
- Focus indicators use browser defaults or `border-color: rgba(99, 102, 241, 0.6)` (v1 indigo, not even the v2 gold)
- No `prefers-reduced-motion` media query anywhere in the codebase
- No ARIA live regions for dynamic content (mesh stats changes, export progress)

## Proposals

---

## 1. Motion & Animation System

### The Problem
The v1 transition system uses three generic `ease` durations with no brand personality. The existing sidebar uses a bare `translateX` + `opacity` keyframe. There's no orchestration, no stagger, no choreography. Every element enters and exits the same way — the temporal experience is flat.

### The Proposal

#### 1.1 Custom Easing Curves — The PotFoundry Motion Language

Four curves that embody "soft luxury":

```css
:root {
  /* ENTER — Gentle deceleration. Objects arrive with ceramic weight. */
  --pf2-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  
  /* EXIT — Quick departure. Don't linger. Confident. */
  --pf2-ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
  
  /* MOVE — Organic repositioning. The "clay on wheel" curve. */
  --pf2-ease-move: cubic-bezier(0.22, 0.61, 0.36, 1);
  
  /* BOUNCE — Subtle spring for micro-interactions. Life. */
  --pf2-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**Rationale**: `--pf2-ease-enter` uses a high overshoot start parameter (0.16) that creates the feeling of an object gliding to a stop — like a pot settling on a shelf. `--pf2-ease-spring` has slight overshoot (1.56) for tactile micro-feedback without being cartoonish.

#### 1.2 Duration Scale

```css
:root {
  --pf2-duration-instant: 80ms;   /* Focus rings, active states */
  --pf2-duration-micro: 150ms;    /* Hover reveals, button presses */
  --pf2-duration-fast: 220ms;     /* Tooltips, popovers */
  --pf2-duration-normal: 320ms;   /* Tab switches, section toggles */
  --pf2-duration-slow: 480ms;     /* Sidebar open/close, modal enter */
  --pf2-duration-dramatic: 700ms; /* Export completion, first-run entrance */
  --pf2-duration-stagger: 50ms;   /* Per-item delay in lists */
}
```

#### 1.3 Transition Choreography

**Sidebar Open/Close**:
```css
.pf2-sidebar--entering {
  animation: pf2-sidebar-enter var(--pf2-duration-slow) var(--pf2-ease-enter);
}

@keyframes pf2-sidebar-enter {
  0% {
    transform: translateX(-40px);
    opacity: 0;
    filter: blur(4px);
  }
  100% {
    transform: translateX(0);
    opacity: 1;
    filter: blur(0);
  }
}
```

Note: not `translateX(-100%)` — a shorter 40px reveals feels more grounded, like a drawer sliding from a nearby position rather than flying in from offscreen. The 4px blur creates a "focus pull" — cinematic idiom.

**Tab Switches** — Crossfade with directional hint:
```css
.pf2-tab-content--exiting-left {
  animation: pf2-tab-exit-left var(--pf2-duration-normal) var(--pf2-ease-exit) forwards;
}
.pf2-tab-content--entering-right {
  animation: pf2-tab-enter-right var(--pf2-duration-normal) var(--pf2-ease-enter);
}

@keyframes pf2-tab-exit-left {
  to { transform: translateX(-12px); opacity: 0; }
}
@keyframes pf2-tab-enter-right {
  from { transform: translateX(12px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

Direction depends on tab index: Shape(0) → Style(1) → Export(2). Moving right = content slides left-out, right-in. Reverse for going left. Only 12px displacement — not a full slide, just a directional *whisper*.

**Section Expand/Collapse** — Height animation with content fade:
```css
.pf2-section__body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--pf2-duration-normal) var(--pf2-ease-move),
    opacity var(--pf2-duration-fast) var(--pf2-ease-move);
}
.pf2-section__body--open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.pf2-section__body > div {
  overflow: hidden;
}
```

Using `grid-template-rows: 0fr → 1fr` instead of `max-height` — this gives us proper GPU-composited height animation without knowing the content height, and no clipping artifacts.

**Staggered Enter for Tab Content** — When switching to a tab, each control group enters with a staggered delay:
```tsx
// SectionV2.tsx — each Section receives its index for stagger calculation
interface SectionV2Props {
  index?: number; // Position in the tab for stagger timing
  // ...existing props
}

// CSS
.pf2-section {
  opacity: 0;
  transform: translateY(8px);
  animation: pf2-section-enter var(--pf2-duration-normal) var(--pf2-ease-enter) forwards;
  animation-delay: calc(var(--pf2-duration-stagger) * var(--section-index, 0));
}

@keyframes pf2-section-enter {
  to { opacity: 1; transform: translateY(0); }
}
```

Set via inline style: `style={{ '--section-index': index } as React.CSSProperties}`.

#### 1.4 Micro-interactions

**Slider Thumb — Tactile Feel**:
```css
.pf2-slider__thumb {
  width: 18px;
  height: 18px;
  background: var(--pf2-text-primary);
  border: 2px solid var(--pf2-accent);
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(180, 151, 90, 0);
  transition:
    box-shadow var(--pf2-duration-micro) var(--pf2-ease-spring),
    transform var(--pf2-duration-micro) var(--pf2-ease-spring);
}

.pf2-slider__thumb:hover {
  box-shadow: 0 0 0 4px rgba(180, 151, 90, 0.15);
  transform: scale(1.1);
}

.pf2-slider__thumb:active,
.pf2-slider__thumb[data-dragging] {
  box-shadow: 0 0 0 8px rgba(180, 151, 90, 0.12);
  transform: scale(1.15);
  border-color: var(--pf2-accent-hover);
}
```

The expanding glow on drag is the "tactile" moment — it communicates "I'm holding something."

**Button Press — Physical Depression**:
```css
.pf2-button {
  transition: 
    transform var(--pf2-duration-instant) var(--pf2-ease-move),
    box-shadow var(--pf2-duration-instant) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move);
}
.pf2-button:active {
  transform: scale(0.97) translateY(1px);
  box-shadow: none;
}
```

Subtle 3% scale-down + 1px push — feels like pressing a physical button.

**Focus Ring — Gold Halo**:
```css
.pf2-focus-ring:focus-visible {
  outline: none;
  box-shadow: 
    0 0 0 2px var(--pf2-bg-surface),  /* gap */
    0 0 0 4px var(--pf2-accent);       /* gold ring */
  transition: box-shadow var(--pf2-duration-instant) var(--pf2-ease-enter);
}
```

Two-layer box-shadow creates a 2px gap between the element and the gold ring — this isn't a clinical browser outline, it's a jewelry bezel.

**Hover Reveals** — Toolbar icon tooltips and labels:
```css
.pf2-toolbar__button::after {
  content: attr(aria-label);
  position: absolute;
  bottom: -36px;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  font-size: 11px;
  font-family: var(--pf2-font-body);
  color: var(--pf2-text-secondary);
  white-space: nowrap;
  pointer-events: none;
  transition:
    opacity var(--pf2-duration-fast) var(--pf2-ease-enter),
    transform var(--pf2-duration-fast) var(--pf2-ease-enter);
}
.pf2-toolbar__button:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

#### 1.5 Loading / Progress States

**Export Progress** (covered in detail in §3.1):
Multi-stage progress bar with phase labels and a completion celebration.

**Mesh Generation Spinner** — Replaces the current status bar spinner:
```css
.pf2-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--pf2-border);
  border-top-color: var(--pf2-accent);
  border-radius: 50%;
  animation: pf2-spin 0.8s linear infinite;
}

@keyframes pf2-spin {
  to { transform: rotate(360deg); }
}
```

Simple but on-brand — gold accent on the spinning edge.

#### 1.6 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  /* Still allow opacity transitions — they're not disorienting */
  .pf2-tab-content--entering-right,
  .pf2-tab-content--exiting-left {
    animation: none;
    transition: opacity var(--pf2-duration-fast) linear;
  }
  
  /* Export progress: no animation, just instant fills */
  .pf2-export-progress__fill {
    transition: width 0.01ms linear !important;
  }
}
```

**Implementation Notes**: Create a `useReducedMotion()` hook that reads `window.matchMedia('(prefers-reduced-motion: reduce)')` and returns a boolean. Components that use JS-driven animations (stagger delays, spring physics) should check this flag.

```tsx
// hooks/useReducedMotion.ts
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
```

**Priority**: Must-have (motion is the entire soul of this proposal)  
**Risk**: Overdone animations cause jank on low-end devices. Mitigated by using CSS transforms and opacity exclusively (GPU-composited) — never animating layout properties like `width`, `height`, `margin`.

---

## 2. Onboarding & First-Run Experience

### The Problem

PotFoundry has 20+ parameters across 5+ styles with advanced sub-parameters. A new user opens the app and sees a wall of sliders. There's no guidance on what to try first, no progressive disclosure, and no contextual help. The Library is empty. The experience is "here are all the knobs — good luck."

### The Proposal

#### 2.1 First-Run Detection

```tsx
// hooks/useFirstRun.ts
const FIRST_RUN_KEY = 'pf2-first-run-complete';

export function useFirstRun() {
  const [isFirstRun, setIsFirstRun] = useState(() => {
    return localStorage.getItem(FIRST_RUN_KEY) !== 'true';
  });
  
  const completeFirstRun = useCallback(() => {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    setIsFirstRun(false);
  }, []);
  
  return { isFirstRun, completeFirstRun };
}
```

#### 2.2 The Welcome Moment (Non-Modal)

**No modal. No wizard.** Instead, the first-run experience is *woven into the existing UI*:

1. **The viewport loads with a curated preset** (not default parameters). Pick the most visually striking design — probably a FourierBloom or SuperformulaBlossom with dramatic parameters. The pot auto-rotates slowly. *First impression is beauty, not blankness.*

2. **A floating welcome card** appears overlaid on the viewport (not blocking the sidebar):

```tsx
// v2/onboarding/WelcomeCard.tsx
<div className="pf2-welcome-card">
  <h2 className="pf2-welcome-card__title">
    Welcome to PotFoundry
  </h2>
  <p className="pf2-welcome-card__subtitle">
    Design parametric pots for 3D printing.
    Start with a preset, then make it yours.
  </p>
  <div className="pf2-welcome-card__actions">
    <button className="pf2-button pf2-button--accent">
      Pick a Style
    </button>
    <button className="pf2-button pf2-button--ghost">
      I know what I'm doing
    </button>
  </div>
</div>
```

```css
.pf2-welcome-card {
  position: absolute;
  bottom: 80px;
  right: 40px;
  max-width: 320px;
  padding: 24px;
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border-active);
  border-radius: 12px;
  box-shadow: var(--pf2-shadow-float);
  animation: pf2-welcome-enter var(--pf2-duration-dramatic) var(--pf2-ease-enter);
  z-index: 150;
}

@keyframes pf2-welcome-enter {
  0% { opacity: 0; transform: translateY(20px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
```

3. Clicking **"Pick a Style"** opens the Style tab in the sidebar with style selector highlighted (pulsing gold border). Clicking **"I know what I'm doing"** dismisses and marks first-run complete.

#### 2.3 Progressive Disclosure — Parameter Confidence Levels

The v2 design already has collapsed sections. The elevation: **sections start collapsed on first-run and expand as users interact**.

```tsx
// State tracking: which parameter groups the user has interacted with
interface UserConfidence {
  hasChangedDimensions: boolean;
  hasChangedStyle: boolean;
  hasChangedAppearance: boolean;
  hasExported: boolean;
}
```

- **Level 0 (First run)**: Only Presets and the Style selector are visible. All dimension groups are collapsed. The sidebar shows: Presets → Style Selector → "Customize dimensions ▸" (collapsed).
- **Level 1 (After first preset/style change)**: Size group auto-expands. Style parameters show.
- **Level 2 (After first dimension change)**: Thickness and Features groups appear.
- **Level 3 (After first export)**: Advanced parameters, pipeline tuning, debug — progressively revealed.

The user never sees 20 sliders at once until they've demonstrated they want depth.

#### 2.4 Contextual Hints — Parameter Tooltips

Every slider label gets an info icon (Lucide `Info` at 12px, `--pf2-text-muted` color) that shows a rich tooltip on hover:

```tsx
// controls/SliderV2.tsx addition
{description && (
  <button
    className="pf2-slider__info"
    aria-label={`About ${label}`}
    onMouseEnter={() => setShowTooltip(true)}
    onMouseLeave={() => setShowTooltip(false)}
    onFocus={() => setShowTooltip(true)}
    onBlur={() => setShowTooltip(false)}
  >
    <Info size={12} />
  </button>
)}

{showTooltip && (
  <div className="pf2-tooltip" role="tooltip">
    <p className="pf2-tooltip__text">{description}</p>
    <div className="pf2-tooltip__range">
      Range: {min}–{max}{unit ? ` ${unit}` : ''}
    </div>
  </div>
)}
```

```css
.pf2-tooltip {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  padding: 10px 14px;
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border-active);
  border-radius: 8px;
  box-shadow: var(--pf2-shadow-float);
  max-width: 220px;
  z-index: 300;
  animation: pf2-tooltip-enter var(--pf2-duration-fast) var(--pf2-ease-enter);
}

.pf2-tooltip__text {
  font-family: var(--pf2-font-body);
  font-size: 12px;
  color: var(--pf2-text-primary);
  line-height: 1.5;
  margin: 0 0 6px;
}

.pf2-tooltip__range {
  font-family: var(--pf2-font-mono);
  font-size: 11px;
  color: var(--pf2-text-muted);
}
```

Source data: The `description` field already exists in `STYLE_REGISTRY` for every parameter (`src/styles/registry.ts`). We just need to pipe it through the StyleTab → SliderV2 props.

#### 2.5 Empty Library State

When the Library drawer opens with zero saved designs:

```tsx
<div className="pf2-library-empty">
  <div className="pf2-library-empty__illustration">
    {/* Minimal SVG: an empty shelf with a single pot silhouette */}
    <EmptyShelfIllustration />
  </div>
  <h3>Your collection is empty</h3>
  <p>Designs you save will appear here. Start by customizing a preset.</p>
  <button className="pf2-button pf2-button--accent pf2-button--sm">
    Browse Presets
  </button>
</div>
```

The illustration should be a single-color SVG in `--pf2-text-muted` — an empty curved shelf with a single ghost pot outline. Elegant, not playful.

#### 2.6 Guided Tour (Optional)

Not a step-by-step wizard. Instead, a "spotlight" system that highlights one element at a time:

```tsx
// v2/onboarding/Spotlight.tsx
interface SpotlightStep {
  target: string;       // CSS selector
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: SpotlightStep[] = [
  { target: '.pf2-tab[data-tab="shape"]', title: 'Shape', description: 'Control dimensions, wall thickness, and drain holes.', placement: 'right' },
  { target: '.pf2-tab[data-tab="style"]', title: 'Style', description: 'Choose a mathematical style and fine-tune its parameters.', placement: 'right' },
  { target: '.pf2-tab[data-tab="export"]', title: 'Export', description: 'Generate a production-ready STL for 3D printing.', placement: 'right' },
  { target: '.pf2-camera-button', title: 'Camera', description: 'Preset views and projection modes.', placement: 'bottom' },
];
```

Triggered by a "Take a tour" link in the sidebar footer or Settings. Dim the rest of the UI (overlay at `rgba(0,0,0,0.5)`) with a spotlight cutout around the target element. Each step advances with "Next" / "Skip".

**Priority**: Should-have (progressive disclosure is must-have; tour is should-have)  
**Risk**: Over-tutorialization annoys power users. Mitigated: tour is optional, progressive disclosure is automatic but non-blocking, and "I know what I'm doing" bypasses immediately.

---

## 3. Interaction Design — The "Delight" Moments

### The Problem

The current UI has zero choreography for key user moments. Clicking a preset silently swaps parameters. Starting an export shows a text status change. There's no emotional arc. The user's journey from creation to download is flat.

### The Proposal

#### 3.1 The Download Moment — The Climax

This is the single most important interaction in PotFoundry. The user has designed their pot, tweaked every parameter, and now they click "Download STL." This moment should feel like a *celebration of craftsmanship*.

**Phase 1: Initiation** (0-200ms after click)

The Download button transforms into a progress container:
```css
.pf2-download-btn--active {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-accent-subtle);
  transition: all var(--pf2-duration-normal) var(--pf2-ease-move);
}
```

**Phase 2: Progress** (200ms - completion)

Multi-stage progress with phase names. The current `useParametricExport` already exposes phase information via `PipelineDiagnostics.phases`.

```tsx
// StatusFooter.tsx — Export progress display
<div className="pf2-export-progress">
  <div className="pf2-export-progress__bar">
    <div 
      className="pf2-export-progress__fill"
      style={{ width: `${progress}%` }}
    />
    <div 
      className="pf2-export-progress__glow"
      style={{ left: `${progress}%` }}
    />
  </div>
  <div className="pf2-export-progress__label">
    <span className="pf2-export-progress__phase">{currentPhase}</span>
    <span className="pf2-export-progress__percent">{progress}%</span>
  </div>
</div>
```

```css
.pf2-export-progress__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--pf2-accent), var(--pf2-accent-hover));
  border-radius: 4px;
  transition: width 100ms linear; /* Smooth progress ticks */
}

/* Leading edge glow — the "writing head" of the progress */
.pf2-export-progress__glow {
  position: absolute;
  top: -2px;
  width: 24px;
  height: calc(100% + 4px);
  background: radial-gradient(ellipse at center, rgba(180,151,90,0.4), transparent);
  filter: blur(4px);
  transform: translateX(-50%);
  pointer-events: none;
}

.pf2-export-progress__phase {
  font-family: var(--pf2-font-mono);
  font-size: 11px;
  color: var(--pf2-text-secondary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
```

Phase names from the pipeline: "Probing Surface" → "Detecting Features" → "Building Grid" → "Tessellating" → "Optimizing" → "Writing STL"

**Phase 3: Completion** (0-1500ms after finish)

```css
/* The progress bar fills completely and pulses gold */
.pf2-export-progress--done .pf2-export-progress__fill {
  background: var(--pf2-accent);
  animation: pf2-progress-pulse 0.6s var(--pf2-ease-spring);
}

@keyframes pf2-progress-pulse {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
  100% { filter: brightness(1); }
}

/* Completion card replaces progress */
.pf2-export-complete {
  animation: pf2-complete-enter var(--pf2-duration-normal) var(--pf2-ease-spring);
}

@keyframes pf2-complete-enter {
  0% { transform: scale(0.95); opacity: 0; }
  70% { transform: scale(1.02); }
  100% { transform: scale(1); opacity: 1; }
}
```

The completion card shows:
```tsx
<div className="pf2-export-complete">
  <div className="pf2-export-complete__icon">
    <Check size={20} strokeWidth={3} />
  </div>
  <div className="pf2-export-complete__stats">
    <span className="pf2-export-complete__headline">
      {triangles.toLocaleString()} triangles · {fileSize}
    </span>
    <span className="pf2-export-complete__time">
      Generated in {timeMs.toLocaleString()}ms
    </span>
  </div>
</div>
```

The check icon enters with a draw-on SVG animation:
```css
.pf2-export-complete__icon svg path {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: pf2-check-draw 0.4s var(--pf2-ease-enter) 0.2s forwards;
}

@keyframes pf2-check-draw {
  to { stroke-dashoffset: 0; }
}
```

**No confetti.** Confetti is antithetical to "soft luxury." The brightness pulse + check draw + stats display is the celebration — *understated triumph*.

**Sound consideration**: A brief, warm tone on completion (see §10). Muted by default.

#### 3.2 The Preset Load — Morphing Feedback

When a user clicks a preset:

1. **Sidebar feedback**: The clicked preset card gets a brief gold border flash (`0.3s`). All sliders animate to their new values simultaneously — each slider thumb glides along the track to its new position over `var(--pf2-duration-normal)`.

```tsx
// SliderV2.tsx — animated value changes from external updates
const [displayValue, setDisplayValue] = useState(value);
const [isAnimating, setIsAnimating] = useState(false);

useEffect(() => {
  if (value !== displayValue && !isDragging) {
    setIsAnimating(true);
    setDisplayValue(value);
    const timer = setTimeout(() => setIsAnimating(false), 320);
    return () => clearTimeout(timer);
  }
}, [value]);

// The Radix slider thumb position auto-animates because we CSS transition
// the Radix track's `style` calculation via transition on the thumb's `left`.
```

```css
.pf2-slider__thumb--animating {
  transition: left var(--pf2-duration-normal) var(--pf2-ease-move);
}
```

2. **3D viewport feedback**: This is handled by the WebGPU renderer — the pot geometry morphs in real-time because `setGeometry`/`setStyleOpts` triggers an immediate re-render. No extra work needed — the GPU-based preview already interpolates per-frame. The visual result: sliders slide, pot morphs, simultaneously. *Satisfying*.

#### 3.3 The Style Switch

When changing from e.g. SpiralRidges to FourierBloom:

1. The style selector dropdown closes with `--pf2-ease-exit`
2. The old style parameters fade out (stagger -50ms from bottom up)
3. The new style parameters fade in (stagger +50ms from top down)
4. The slider labels and ranges crossfade

```css
.pf2-style-params--exiting .pf2-slider {
  animation: pf2-param-exit var(--pf2-duration-fast) var(--pf2-ease-exit) forwards;
  animation-delay: calc(var(--pf2-duration-stagger) * var(--param-index-reverse));
}

.pf2-style-params--entering .pf2-slider {
  animation: pf2-param-enter var(--pf2-duration-normal) var(--pf2-ease-enter) forwards;
  animation-delay: calc(80ms + var(--pf2-duration-stagger) * var(--param-index));
}

@keyframes pf2-param-exit {
  to { opacity: 0; transform: translateY(-4px); }
}
@keyframes pf2-param-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

The 80ms offset between exit completing and enter starting creates a "breathing" pause.

#### 3.4 Slider Manipulation Details

**Real-time value display**: The current value already shows in a monospace input (`Slider.tsx:showInput`). Elevation: add a **floating value tooltip** that tracks the thumb during drag:

```tsx
// Only visible during active drag
{isDragging && (
  <div 
    className="pf2-slider__float-value"
    style={{ left: `${thumbPercent}%` }}
  >
    {formattedValue}{unit}
  </div>
)}
```

```css
.pf2-slider__float-value {
  position: absolute;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-accent);
  border-radius: 6px;
  font-family: var(--pf2-font-mono);
  font-size: 12px;
  color: var(--pf2-accent);
  white-space: nowrap;
  pointer-events: none;
  animation: pf2-float-enter var(--pf2-duration-micro) var(--pf2-ease-spring);
}
```

**Default value ghost**: A faint tick mark on the track shows the default/preset value:

```css
.pf2-slider__default-mark {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 10px;
  background: var(--pf2-text-muted);
  opacity: 0.3;
  transform: translateX(-50%) translateY(-50%);
  border-radius: 1px;
  pointer-events: none;
  /* left: calculated from default value position */
}
```

**Double-click to reset**: Double-clicking the slider track resets to default value.

```tsx
const handleDoubleClick = useCallback(() => {
  onChange(defaultValue);
}, [onChange, defaultValue]);
```

**Priority**: Must-have (these are the core tactile moments)  
**Risk**: Slider tooltip may overlap with other sliders in dense layouts. Mitigate with `z-index` management and conditional visibility (only during active drag of *this* slider).

---

## 4. Keyboard & Focus Management

### The Problem

The current keyboard shortcuts (`useKeyboardShortcuts` in hooks) only handle global actions (export, reset, toggle panel, help, escape). There's no fine-grained keyboard navigation within the sidebar, no parameter nudging, and focus indicators are browser defaults or indigo-colored (v1 palette).

### The Proposal

#### 4.1 Tab Order

Logical flow matches the visual hierarchy:

```
1. Sidebar tab buttons (Shape / Style / Export) 
2. Active tab content — controls in visual order
3. Download button (always last in sidebar)
4. Toolbar buttons (left to right)
```

Each `SliderV2`, `SelectV2`, `SectionV2`, `ButtonV2` receives `tabIndex={0}` by default (natural flow). Sections that are collapsed have `tabIndex={-1}` on their children when closed.

#### 4.2 Focus Trapping

Use Radix's `FocusTrap` (already available via `@radix-ui/react-focus-guard`) for:
- **Camera popover**: Tab cycles through preset buttons and toggle controls
- **Library drawer**: Tab stays within the drawer until Escape closes it
- **Export dialog**: Already has Radix Dialog focus trapping

```tsx
// shared/CameraPopover.tsx
import { FocusScope } from '@radix-ui/react-focus-scope';

<FocusScope trapped loop>
  <div className="pf2-camera-popover">
    {/* Camera preset buttons... */}
  </div>
</FocusScope>
```

#### 4.3 Parameter Nudging with Arrow Keys

When a slider is focused:
- `ArrowRight` / `ArrowUp`: Increment by `step`
- `ArrowLeft` / `ArrowDown`: Decrement by `step`  
- `Shift+Arrow`: Increment by `step * 10`
- `Home`: Jump to `min`
- `End`: Jump to `max`

Radix Slider already provides this behavior natively — we just need to ensure proper `step` values are passed through from `STYLE_REGISTRY` param definitions. No custom code needed.

#### 4.4 Global Keyboard Shortcuts (v2 additions)

```tsx
// Extended shortcuts for v2
const V2_SHORTCUTS = {
  '1': () => setActiveTab('shape'),    // Quick tab access
  '2': () => setActiveTab('style'),
  '3': () => setActiveTab('export'),
  'c': () => toggleCameraPopover(),    // Camera flyout
  'l': () => toggleLibrary(),          // Library drawer
  'z': () => toggleZenMode(),          // Zen mode (§6.5)
  'd': () => toggleDensityMode(),      // Density toggle (§6.4)
};
```

All shortcuts only fire when no input/textarea is focused (existing guard in `useKeyboardShortcuts`).

#### 4.5 Visual Focus Indicators

The gold halo from §1.4 applies globally. Additionally:

```css
/* Tab buttons — focused tab gets gold underline + subtle glow */
.pf2-tab:focus-visible {
  outline: none;
  box-shadow: 0 2px 0 0 var(--pf2-accent), 0 4px 12px -2px rgba(180,151,90,0.2);
}

/* Section headers — focus makes chevron gold */
.pf2-section__header:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--pf2-bg-surface), 0 0 0 4px var(--pf2-accent);
  border-radius: 6px;
}

/* Select dropdown trigger */
.pf2-select__trigger:focus-visible {
  border-color: var(--pf2-accent);
  box-shadow: 0 0 0 2px rgba(180,151,90,0.2);
}
```

**Priority**: Must-have (accessibility + power user efficiency)  
**Risk**: Keyboard shortcuts may conflict with browser defaults. Mitigate: only activate when canvas/sidebar has focus, check `e.target` is within our app root.

---

## 5. Advanced Component Design

### The Problem

The current design doc says "new v2 variants — same Radix primitives, new styling." But reskinning isn't enough. The controls need to be *smarter* and *more informative* to justify the v2 label.

### The Proposal

#### 5.1 SliderV2 — The Flagship Control

PotFoundry lives and dies by its sliders. They must feel premium.

**Interface**:
```tsx
interface SliderV2Props {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  description?: string;    // From STYLE_REGISTRY — tooltip content
  unit?: string;
  decimals?: number;
  defaultValue?: number;   // For ghost marker + double-click reset
  disabled?: boolean;
  onChangeEnd?: (value: number) => void;
  /** Show floating value during drag */
  floatingValue?: boolean;
  /** Show default value marker on track */
  showDefault?: boolean;
}
```

**Visual anatomy**:
```
┌────────────────────────────────────────────┐
│ Ridge Count  ⓘ                    9     │  ← label + info + value
│ ───────────────●───────────────────────── │  ← track + thumb + default ghost
│ 3           ▪                         24 │  ← min/max + default marker
└────────────────────────────────────────────┘
                 ↑
           [floating "9" tooltip during drag]
```

**Gold track fill with gradient**:
```css
.pf2-slider__range {
  background: linear-gradient(
    90deg,
    rgba(180, 151, 90, 0.6) 0%,
    var(--pf2-accent) 100%
  );
  border-radius: 3px;
}
```

**Snap-to-default**: When dragging within ±2 steps of the default value, the thumb magnetically snaps to default with a subtle spring animation. Feedback: brief haptic pulse (mobile) or a subtle brightness flash on the tick mark.

```tsx
const SNAP_THRESHOLD = step * 2;
const handleValueChange = (newValue: number) => {
  if (Math.abs(newValue - defaultValue) < SNAP_THRESHOLD && !shiftKeyHeld) {
    onChange(defaultValue);
  } else {
    onChange(newValue);
  }
};
```

Holding Shift disables snapping for fine-tuning near the default.

#### 5.2 Quality Selector — Premium Tier Cards

The Draft/Standard/High/Ultra cards should feel like selecting membership tiers, not radio buttons.

```tsx
<div className="pf2-quality-grid">
  {PROFILES.map(profile => (
    <button
      key={profile.name}
      className={`pf2-quality-card ${selected === profile.name ? 'pf2-quality-card--selected' : ''}`}
      onClick={() => setProfile(profile.name)}
    >
      <div className="pf2-quality-card__icon">{profile.icon}</div>
      <div className="pf2-quality-card__name">{profile.label}</div>
      <div className="pf2-quality-card__estimate">
        ~{profile.triangleEstimate.toLocaleString()} △
      </div>
      <div className="pf2-quality-card__time">
        ~{profile.estimatedTime}
      </div>
    </button>
  ))}
</div>
```

```css
.pf2-quality-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.pf2-quality-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 8px;
  background: var(--pf2-bg-surface);
  border: 1px solid var(--pf2-border);
  border-radius: 10px;
  cursor: pointer;
  transition: 
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move),
    transform var(--pf2-duration-micro) var(--pf2-ease-spring);
}

.pf2-quality-card:hover {
  background: var(--pf2-bg-hover);
  border-color: var(--pf2-border-active);
  transform: translateY(-2px);
}

.pf2-quality-card--selected {
  border-color: var(--pf2-accent);
  background: var(--pf2-accent-subtle);
  box-shadow: 0 0 0 1px var(--pf2-accent), 0 4px 16px rgba(180,151,90,0.15);
}

.pf2-quality-card--selected .pf2-quality-card__name {
  color: var(--pf2-accent-hover);
}

.pf2-quality-card__icon {
  font-size: 24px;
  opacity: 0.7;
}

.pf2-quality-card__name {
  font-family: var(--pf2-font-body);
  font-size: 13px;
  font-weight: 600;
  color: var(--pf2-text-primary);
}

.pf2-quality-card__estimate {
  font-family: var(--pf2-font-mono);
  font-size: 11px;
  color: var(--pf2-text-secondary);
}

.pf2-quality-card__time {
  font-family: var(--pf2-font-mono);
  font-size: 10px;
  color: var(--pf2-text-muted);
}
```

Icons (no new dependency — use Lucide or inline SVG):
- Draft: `Pencil` (sketch feel)
- Standard: `Box` (solid)
- High: `Gem` (precision)
- Ultra: `Crown` (already exists in ExportPanel)

The selected card has a gold border + subtle gold background + shadow. The 2px upward lift on hover creates dimensionality.

#### 5.3 Preset Cards

Elevation over current `PresetCard` in `PresetPanel.tsx`:

```css
.pf2-preset-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pf2-bg-surface);
  border: 1px solid var(--pf2-border);
  cursor: pointer;
  transition: 
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    box-shadow var(--pf2-duration-normal) var(--pf2-ease-move),
    transform var(--pf2-duration-micro) var(--pf2-ease-spring);
}

.pf2-preset-card:hover {
  border-color: var(--pf2-border-active);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  transform: translateY(-3px);
}

/* Hover overlay — subtle gradient reveal */
.pf2-preset-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 50%,
    rgba(180,151,90,0.08) 100%
  );
  opacity: 0;
  transition: opacity var(--pf2-duration-micro) var(--pf2-ease-move);
  pointer-events: none;
}

.pf2-preset-card:hover::after {
  opacity: 1;
}

/* Active/loaded state */
.pf2-preset-card--active {
  border-color: var(--pf2-accent);
  box-shadow: 0 0 0 1px var(--pf2-accent);
}
```

**Metadata on hover**: Style name and category appear as an overlay at the bottom of the thumbnail:
```css
.pf2-preset-card__meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 10px;
  background: linear-gradient(transparent, rgba(15,15,18,0.85));
  transform: translateY(4px);
  opacity: 0;
  transition: 
    opacity var(--pf2-duration-micro) var(--pf2-ease-enter),
    transform var(--pf2-duration-micro) var(--pf2-ease-enter);
}

.pf2-preset-card:hover .pf2-preset-card__meta {
  opacity: 1;
  transform: translateY(0);
}
```

#### 5.4 Color System Elevation

Move beyond 3 individual pickers. The v2 Appearance section should have:

**Color Preset Strip**: A horizontal row of curated color combinations (not individual colors — *palettes*):
```tsx
<div className="pf2-color-strip">
  {COLOR_PALETTES.map(palette => (
    <button
      key={palette.id}
      className="pf2-color-swatch-combo"
      onClick={() => applyPalette(palette)}
      title={palette.name}
    >
      <div className="pf2-swatch" style={{ background: palette.primary }} />
      <div className="pf2-swatch pf2-swatch--sm" style={{ background: palette.secondary }} />
      <div className="pf2-swatch pf2-swatch--sm" style={{ background: palette.accent }} />
    </button>
  ))}
</div>
```

Each palette button shows 3 stacked color dots (primary large, secondary+accent small) representing the full color scheme. Clicking applies all three colors at once.

**Live Gradient Preview**: A thin gradient bar (8px tall, full sidebar width) above the color pickers shows the current color combination applied:
```css
.pf2-gradient-preview {
  height: 8px;
  width: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--current-primary), var(--current-secondary), var(--current-accent));
  transition: background var(--pf2-duration-normal) var(--pf2-ease-move);
  margin-bottom: 12px;
}
```

**Priority**: Should-have (slider and quality cards are must-have; preset animations and color strip are should-have)  
**Risk**: Color palettes need curation — bad palettes undermine the luxury feel. Ship with 6-8 carefully chosen palettes modeled after real ceramic glazes.

---

## 6. Layout Refinements

### The Problem

The current 340px sidebar feels functional but cramped for a luxury aesthetic. The relationship between sidebar and viewport has no visual poetry.

### The Proposal

#### 6.1 Sidebar Breathing Room

Default width: **380px** (up from 340px). The extra 40px gives section headers, slider labels, and preset thumbnails more room to breathe.

```css
.pf2-sidebar {
  width: 380px; /* from 340px */
  min-width: 320px;
  max-width: min(480px, 45vw);
}
```

Internal padding: 20px (up from 16px). Sections get 16px vertical gap (up from 12px).

#### 6.2 Viewport Integration — Transparent Edge

The sidebar should feel like a *glass panel floating over the 3D scene*, not a wall next to it:

```css
.pf2-sidebar {
  background: rgba(15, 15, 18, 0.92);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  border-right: 1px solid rgba(245, 240, 232, 0.04);
}
```

The pot is faintly visible through the sidebar — especially near the bottom where there's less content. This creates a sense of depth and connection between controls and creation.

A subtle vignette gradient at the sidebar's right edge bleeds into the viewport:
```css
.pf2-sidebar::after {
  content: '';
  position: absolute;
  top: 0;
  right: -24px;
  bottom: 0;
  width: 24px;
  background: linear-gradient(90deg, rgba(15,15,18,0.3), transparent);
  pointer-events: none;
}
```

#### 6.3 Content Density Toggle

A three-state density selector in Settings:

```tsx
type Density = 'compact' | 'comfortable' | 'spacious';
```

```css
/* Compact — power user */
[data-density="compact"] { --pf2-section-gap: 8px; --pf2-control-gap: 4px; --pf2-sidebar-padding: 12px; }

/* Comfortable — default */
[data-density="comfortable"] { --pf2-section-gap: 16px; --pf2-control-gap: 8px; --pf2-sidebar-padding: 20px; }

/* Spacious — luxury */
[data-density="spacious"] { --pf2-section-gap: 24px; --pf2-control-gap: 12px; --pf2-sidebar-padding: 28px; }
```

Apply via `data-density` attribute on the sidebar root.

#### 6.4 No Split-Screen

**Rejected**: Adding multi-column layout increases layout complexity without clear user value for a single-product configurator. The sidebar's three tabs already organize all controls. Power users who need to see export stats while adjusting dimensions can use the persistent footer stats line.

#### 6.5 Zen Mode

A single keypress (`Z`) hides everything except:
- The 3D viewport (full screen)
- A minimal floating toolbar (5 buttons: sidebar toggle, auto-rotate, screenshot, download, exit zen)

```tsx
// state/uiSlice.ts addition
zenMode: boolean;
toggleZenMode: () => void;
```

```css
.pf2-zen-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 8px;
  background: rgba(15, 15, 18, 0.75);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(245, 240, 232, 0.06);
  border-radius: 28px;
  opacity: 0;
  transition: opacity var(--pf2-duration-normal) var(--pf2-ease-enter);
  z-index: 200;
}

/* Show on hover near bottom of screen */
.pf2-app--zen:hover .pf2-zen-toolbar,
.pf2-zen-toolbar:focus-within {
  opacity: 1;
}
```

The zen toolbar auto-hides after 3 seconds of no interaction — reappears on mouse move near the bottom edge. This creates a museum-like viewing experience.

**Priority**: Zen mode is should-have; sidebar breathing room and transparency are must-have; density toggle is nice-to-have  
**Risk**: `backdrop-filter` blur can be expensive on lower-end GPUs. Mitigate: use `@supports(backdrop-filter: blur(1px))` and fall back to solid background.

---

## 7. Mobile Experience Elevation

### The Problem

The current `MobileBottomSheet.tsx` has functional touch tracking (3 states: collapsed/half/full), but it's mechanically simple — linear swipe mapping, no gesture vocabulary, no tab integration, and no haptic feedback.

### The Proposal

#### 7.1 Gesture-Driven Tab Navigation

**Horizontal swipe on the tab bar** switches tabs with inertia:

```tsx
// In MobileBottomSheetV2
const handleTabSwipe = useCallback((deltaX: number) => {
  const SWIPE_THRESHOLD = 50; // px
  if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
  
  const tabs: TabId[] = ['shape', 'style', 'export'];
  const currentIndex = tabs.indexOf(activeTab);
  
  if (deltaX < -SWIPE_THRESHOLD && currentIndex < tabs.length - 1) {
    setActiveTab(tabs[currentIndex + 1]);
  } else if (deltaX > SWIPE_THRESHOLD && currentIndex > 0) {
    setActiveTab(tabs[currentIndex - 1]);
  }
}, [activeTab]);
```

The tab indicator (gold underline) slides with CSS transition tracking the active tab position. Content crossfades with the same directional animation as desktop (§1.3).

#### 7.2 Smart Bottom Sheet Heights

```tsx
const SHEET_HEIGHTS = {
  collapsed: 64,           // Just tab bar + stats line
  peek: '30vh',            // Enough for presets or download button
  half: '50vh',            // Default working state
  full: '85vh',            // Deep editing
};
```

Four states instead of three. The **peek** state shows the tab bar + 1 section — ideal for checking stats or hitting Download without obscuring the viewport.

**Velocity-aware snapping**: On touch end, calculate finger velocity. If velocity > threshold, snap to the *next* state in the direction of motion (even if distance hasn't crossed the halfway point). This makes the gesture feel responsive and predictive.

```tsx
const handleTouchEnd = () => {
  const velocity = (touchEndY - touchStartY) / (endTime - startTime);
  const VELOCITY_THRESHOLD = 0.5; // px/ms
  
  if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
    // Snap in direction of velocity
    if (velocity > 0) snapDown();
    else snapUp();
  } else {
    // Snap to nearest state
    snapToNearest(currentHeight);
  }
};
```

#### 7.3 Thumb-Zone Optimization

The persistent Download button in the footer sits in the natural thumb zone (bottom of screen). On mobile, the tab bar is also at the bottom. Key actions are never more than 60px from the thumb rest position.

Critical: the **quality selector cards** (§5.2) switch to a 2×2 grid on mobile instead of 4×1 — keeping them in thumb reach:

```css
@media (max-width: 480px) {
  .pf2-quality-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

#### 7.4 Haptic Feedback

Use the Vibration API for tactile moments:

```tsx
// utils/haptics.ts
export function hapticTap() {
  if ('vibrate' in navigator) navigator.vibrate(10);
}

export function hapticSnap() {
  if ('vibrate' in navigator) navigator.vibrate([5, 50, 5]);
}

export function hapticSuccess() {
  if ('vibrate' in navigator) navigator.vibrate([10, 30, 10, 30, 20]);
}
```

Trigger points:
- `hapticTap()`: Tab switch, button press
- `hapticSnap()`: Slider snap-to-default, sheet state change
- `hapticSuccess()`: Export complete

#### 7.5 Landscape Mode

When phone is horizontal:
```css
@media (max-height: 500px) and (orientation: landscape) {
  .pf2-mobile-sheet {
    /* Switch to left-side drawer instead of bottom sheet */
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 320px;
    max-height: 100vh;
    border-right: 1px solid var(--pf2-border);
    transform: translateX(0);
  }
  
  .pf2-mobile-sheet--collapsed {
    transform: translateX(-280px); /* Show just the tab strip */
  }
}
```

In landscape, the bottom sheet becomes a left drawer — the viewport needs the full height.

**Priority**: Gesture navigation and smart heights are must-have; haptics and landscape are should-have  
**Risk**: Vibration API availability is inconsistent. `navigator.vibrate` is guarded by a feature check — no-op where unsupported.

---

## 8. Accessibility Deep Dive

### The Problem

The current codebase has no ARIA live regions, no high-contrast mode, no screen reader announcements for dynamic content. The `StatusBar.tsx` updates silently. Export completion is only visual. Focus management after modal close is not specified.

### The Proposal

#### 8.1 Screen Reader Announcements

Use a live region announcer pattern:

```tsx
// v2/shared/Announcer.tsx
const AnnouncerContext = createContext<(message: string) => void>(() => {});

export const AnnouncerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState('');
  
  const announce = useCallback((msg: string) => {
    setMessage(''); // Force re-render for repeated messages
    requestAnimationFrame(() => setMessage(msg));
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pf2-sr-only"
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
};

export const useAnnounce = () => useContext(AnnouncerContext);
```

```css
.pf2-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
```

**Announcement triggers**:
- Export complete: "Export complete. 148,032 triangles. File size 12.4 megabytes."
- Preset applied: "Applied preset: Spiral Vase. Style changed to Spiral Ridges."
- Style changed: "Style changed to Fourier Bloom. 5 parameters available."
- Mesh stats update: Debounced (500ms), only when stats change significantly: "Mesh updated: 24,576 triangles."

#### 8.2 High Contrast Mode

```css
@media (forced-colors: active) {
  .pf2-sidebar {
    background: Canvas;
    border-color: CanvasText;
  }
  
  .pf2-slider__range {
    background: Highlight;
  }
  
  .pf2-slider__thumb {
    background: ButtonText;
    border-color: Highlight;
  }
  
  .pf2-button--accent {
    background: Highlight;
    color: HighlightText;
    border: 2px solid ButtonText;
  }
  
  .pf2-quality-card--selected {
    outline: 3px solid Highlight;
  }
}
```

Additionally, offer a custom high-contrast token set (toggleable in Settings):

```css
[data-contrast="high"] {
  --pf2-text-primary: #ffffff;
  --pf2-text-secondary: #d4d0c8;
  --pf2-text-muted: #a09a90;
  --pf2-accent: #e8c874;        /* Brighter gold */
  --pf2-border: rgba(255,255,255,0.15);
  --pf2-border-active: rgba(255,255,255,0.35);
}
```

#### 8.3 Focus Return After Modal/Drawer Close

```tsx
// In every modal/drawer: track the trigger element
const triggerRef = useRef<HTMLElement | null>(null);

const handleOpen = (e: React.MouseEvent) => {
  triggerRef.current = e.currentTarget as HTMLElement;
  setOpen(true);
};

const handleClose = () => {
  setOpen(false);
  // Return focus to trigger on next frame
  requestAnimationFrame(() => {
    triggerRef.current?.focus();
  });
};
```

Radix Dialog and Popover do this automatically, but the Library Drawer and Zen Mode need manual implementation.

#### 8.4 ARIA Live Regions for Dynamic Content

The `StatusFooter.tsx` stats line should be a live region:
```tsx
<div 
  className="pf2-status-footer__stats"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {stats.triangles} △ · {stats.vertices} ◇ · {stats.genTime}
</div>
```

The export progress phase label:
```tsx
<div
  role="progressbar"
  aria-valuenow={progress}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={`Export progress: ${progress}%, currently ${currentPhase}`}
/>
```

#### 8.5 WCAG AAA Contrast Verification

Checking the current v2 palette:

| Pair | Foreground | Background | Ratio | WCAG AA | WCAG AAA |
|---|---|---|---|---|---|
| Primary text on base | `#f5f0e8` on `#0f0f12` | **15.7:1** | ✅ | ✅ |
| Secondary text on base | `#9a9590` on `#0f0f12` | **5.3:1** | ✅ | ❌ (needs 7:1) |
| Muted text on base | `#5c5753` on `#0f0f12` | **2.6:1** | ❌ | ❌ |
| Accent on base | `#b4975a` on `#0f0f12` | **5.8:1** | ✅ | ❌ |
| Accent on elevated | `#b4975a` on `#1e1e25` | **4.7:1** | ✅ (large) | ❌ |

**Corrections needed**:
- `--pf2-text-secondary`: Lighten to `#b0a9a3` (→ 7.2:1 for AAA)
- `--pf2-text-muted`: This is intentionally decorative. **Do not use for information-bearing text.** Add lint rule: muted color only on supplementary labels, never sole information carriers. For the minimum AA standard on incidental text, lighten to `#7a756f` (→ 4.6:1).
- `--pf2-accent` on `--bg-elevated`: Acceptable for large text (18px+) but not for 11px labels. When accent is used on elevated backgrounds for small text, use `--pf2-accent-hover` (`#c9ab6e` → 5.8:1) instead.

**Priority**: Must-have (ARIA announcer, focus return, live regions); high contrast and AAA corrections are should-have  
**Risk**: Over-aggressive live region announcements annoy screen reader users. Mitigate: debounce stat updates, only announce significant changes.

---

## 9. Dark/Light Mode

### The Problem

The v2 design is dark-only. But the "editorial" aesthetic has strong light-mode precedent (Linear, Notion, Stripe). Light mode broadens appeal and helps in bright environments.

### The Proposal

#### 9.1 Yes, Add Light Mode (but dark stays default)

The luxury feel works in light when executed as "warm editorial" rather than "sterile white."

#### 9.2 Light Palette

```css
[data-theme="light"] {
  /* Backgrounds */
  --pf2-bg-base:      #f8f5f0;     /* warm parchment, not #fff */
  --pf2-bg-surface:   #ffffff;
  --pf2-bg-elevated:  #f0ece5;
  --pf2-bg-hover:     #e8e3db;
  
  /* Text */
  --pf2-text-primary:   #1a1714;    /* near-black warm */
  --pf2-text-secondary: #6b635a;
  --pf2-text-muted:     #a09788;
  
  /* Accents — darker gold for contrast */
  --pf2-accent:         #8b7340;
  --pf2-accent-hover:   #a0864d;
  --pf2-accent-subtle:  rgba(139,115,64,0.08);
  
  /* Borders */
  --pf2-border:         rgba(26,23,20,0.08);
  --pf2-border-active:  rgba(26,23,20,0.20);
  
  /* Status — adjusted for light bg */
  --pf2-success: #4a7a4f;
  --pf2-warning: #9a7a2c;
  --pf2-error:   #a04444;
  
  /* Shadows — softer */
  --pf2-shadow-float: 0 8px 32px rgba(26,23,20,0.12);
}
```

Key decisions:
- Base is `#f8f5f0` (warm parchment), not pure white. This maintains the artisanal feel.
- Accent gold darkens to `#8b7340` for contrast on light backgrounds (→ 4.5:1 on `#f8f5f0`).
- Shadows use warm brown tones, not gray.

#### 9.3 Viewport Background Adaptation

The 3D viewport background should shift from dark to a warm mid-tone:

```tsx
// When theme changes, update the renderer clear color
const bgColorDark = [0.06, 0.06, 0.07, 1.0];   // near #0f0f12
const bgColorLight = [0.88, 0.85, 0.82, 1.0];   // warm #e0d9d1

useEffect(() => {
  const clearColor = theme === 'light' ? bgColorLight : bgColorDark;
  store.setState({ clearColor });
}, [theme]);
```

#### 9.4 Theme Toggle

System preference detection + manual override:

```tsx
// hooks/useTheme.ts
type ThemePreference = 'system' | 'dark' | 'light';

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    return (localStorage.getItem('pf2-theme') as ThemePreference) ?? 'system';
  });
  
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedTheme = preference === 'system' 
    ? (systemDark ? 'dark' : 'light') 
    : preference;
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('pf2-theme', preference);
  }, [resolvedTheme, preference]);
  
  return { theme: resolvedTheme, preference, setPreference };
}
```

Place the toggle in the sidebar header — a Sun/Moon icon (Lucide) that cycles through dark → light → system.

#### 9.5 Sidebar Transparency in Light Mode

```css
[data-theme="light"] .pf2-sidebar {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(24px) saturate(1.1);
  border-right: 1px solid rgba(26, 23, 20, 0.06);
}
```

Light mode sidebar has a frosted-glass effect over the viewport — visible pot underneath, controls layered above.

**Priority**: Should-have (significant user-facing value but large surface area)  
**Risk**: Light mode doubles the visual QA surface. Mitigate: all styling through CSS custom properties means one token swap covers 90% of the adaptation. Test systematically with a screenshot-diff tool.

---

## 10. Sound Design

### The Problem

The app is completely silent. Key moments (export complete, preset load) lack any auditory feedback. For a "luxury" experience, silence can feel... empty.

### The Proposal

#### 10.1 Scope: Minimal & Opt-In

Only 3 sounds, all muted by default. Users must explicitly enable sounds via a Settings toggle.

#### 10.2 The Sounds

1. **Export Complete** — A brief, warm chime. Two harmonically-related sine tones (root + major third), 300ms total, with exponential decay. Think: ceramic "ting" when you tap a finished piece.

2. **Preset Load** — A soft "whoosh" or breath. Filtered white noise burst, 200ms, band-passed at 2-4kHz. Think: a page turning in a luxury catalog.

3. **Error/Failure** — A muted low tone. Single sine at 220Hz, 150ms, linear decay. Understated "hmm" rather than alarming.

#### 10.3 Implementation

Use the Web Audio API — no audio files to load:

```tsx
// utils/sounds.ts
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function playExportComplete() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  
  // Root tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.frequency.value = 523.25; // C5
  osc1.type = 'sine';
  gain1.gain.setValueAtTime(0.15, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.3);
  
  // Major third
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.frequency.value = 659.25; // E5
  osc2.type = 'sine';
  gain2.gain.setValueAtTime(0.1, now + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(now + 0.05);
  osc2.stop(now + 0.25);
}
```

**Zero bundle cost** — Web Audio API is built-in. No audio files. The oscillator definitions are ~50 lines total.

#### 10.4 Settings Integration

```tsx
// state/uiSlice.ts
soundEnabled: boolean;
setSoundEnabled: (enabled: boolean) => void;
```

Default: `false`. Toggle in Settings alongside the theme preference.

**Ambient generative audio tied to pot shape** — REJECTED for v2. While mathematically beautiful (map petal count to chord voicing, height to pitch), this is an R&D project, not a shipping feature. Revisit for v3.

**Priority**: Nice-to-have  
**Risk**: Unexpected sound is the fastest way to annoy users. Mitigated: muted by default with explicit opt-in.

---

## Recommended Approach

### Must-Have (Ship with v2)
1. **Motion system** (§1) — easing curves, duration scale, sidebar/tab/section animations, reduced motion
2. **Micro-interactions** (§1.4) — slider thumb feel, button press, gold focus rings
3. **Export progress choreography** (§3.1) — multi-stage progress bar, completion celebration
4. **SliderV2** (§5.1) — floating value, default ghost, snap-to-default, double-click reset
5. **Quality tier cards** (§5.2) — premium selection experience
6. **Keyboard / focus management** (§4) — tab order, focus trapping, parameter nudging, gold focus rings
7. **Accessibility** (§8.1-8.4) — ARIA announcer, live regions, focus return, contrast corrections
8. **Sidebar transparency** (§6.2) — glass panel feel, viewport bleed
9. **First-run welcome** (§2.2) — non-modal welcome card, curated starting preset

### Should-Have (v2.1)
10. **Progressive disclosure** (§2.3) — confidence-level parameter revelation
11. **Preset card elevation** (§5.3) — hover animations, metadata overlay
12. **Style switch choreography** (§3.3) — staggered parameter transitions
13. **Dark/Light mode** (§9) — full light palette, system preference detection
14. **Mobile gesture navigation** (§7.1-7.2) — swipe tabs, smart heights, haptics
15. **Zen mode** (§6.5) — distraction-free viewport
16. **Color palette strip** (§5.4)

### Nice-to-Have (v2.2+)
17. **Sound design** (§10) — opt-in audio feedback
18. **Guided tour** (§2.6) — spotlight walkthrough
19. **Content density toggle** (§6.3)
20. **Landscape mobile** (§7.5) — left drawer adaptation

## Open Questions (For Verifier)

1. **Sidebar width 380px vs 340px**: I'm proposing 40px more breathing room. On 1366px screens (common laptop), this consumes 27.8% vs 24.9% of viewport width. Is 3% too greedy for the 3D viewport?

2. **Slider snap-to-default**: The ±2 step magnetic snap is a UX pattern from audio DAWs. In PotFoundry, some parameters have large step values (e.g., `sf_m_base` has step=0.5). With ±2 steps, the snap zone is ±1.0 — that's a significant range. Should snap threshold be absolute (e.g., 5% of range) instead of step-relative?

3. **WCAG AAA on `--pf2-text-secondary`**: I'm proposing lightening from `#9a9590` to `#b0a9a3` to hit AAA (7:1). This makes secondary text closer to primary. Does it undermine the visual hierarchy?

4. **CSS `grid-template-rows: 0fr → 1fr` animation**: This is well-supported in modern browsers (Chrome 102+, Firefox 95+, Safari 16.4+). But our minimum browser target is unclear. Should we provide a `max-height` fallback for Safari 15?

5. **Light mode viewport background**: The warm `#e0d9d1` I proposed may conflict with pot materials that use similar warm tones. Should the viewport background be cooler (blue-gray) in light mode to contrast with warm ceramics?

6. **Export sound — opt-in or opt-out?**: I proposed opt-in (muted by default). But some luxury apps (e.g., Stripe's checkout success sound) ship sounds ON by default with an easy mute. Which approach for PotFoundry's audience (3D printing enthusiasts)?

7. **Stagger timing**: I'm using `--pf2-duration-stagger: 50ms` per item. With 5 sections on a tab, that's 250ms of total stagger — the last item appears 250ms after the first. Is this too slow? Should we cap at 150ms total and divide by item count?

8. **First-run preset**: Which preset is the most visually striking for the welcome state? FourierBloom with high harmonic strength? SuperformulaBlossom at full blossom? The choice sets the first impression. Needs A/B testing or at minimum human judgment.

---

*End of Generator Round 1 — UI v2 Elevation Proposal*
*Next step: Submit to Verifier for attack and refinement.*
