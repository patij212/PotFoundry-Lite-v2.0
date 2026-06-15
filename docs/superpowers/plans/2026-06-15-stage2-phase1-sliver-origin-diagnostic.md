# Stage 2 / Phase 1 — Sliver-Origin Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine, with committed measured data, WHICH mechanism produces the
density-invariant triangulation slivers (Stage-1 finding) on the catastrophic-sliver
styles — and how many are *fixable* (smooth-region, triangulation-pattern) vs
*input-forced* (genuine sharp feature) — so Stage 2 / Phase 2 fixes the right thing.

**Architecture:** Lever-and-measure, like Stage 1. The leading hypothesis (the prior
re-baseline implicated `computeUBias` GATE-B anisotropy as *introducing* slivers) is
tested by forcing the EXISTING dev lever `__pfConformingUBias=0` and re-measuring the
reference-free min-angle, with the existing `crestBandTriangleQuality` band-vs-bulk split
giving a free fixable-vs-feature signal. No production source change (the lever already
exists); production stays byte-identical.

**Tech Stack:** Playwright + headless Chromium (`--enable-unsafe-webgpu`) driving the real
GPU export via the `__pfFidelity` window API (`diagnoseCrestQuality`,
`diagnoseSurfaceFidelity`); the existing `__pfConformingUBias` lever
(`WatertightAssembly.ts:425`).

**Design reference:** `docs/superpowers/specs/2026-06-15-stage2-triangle-quality-design.md`
(§6.1). Stage-1 baseline: `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.md`.

---

## Why this phase / what it forks

Stage 1 proved the slivers are density-invariant (uniform 8× density left worst min-angle
pinned). The candidate mechanisms are diagonal-choice (Klincsek DP gated on `efg`),
GATE-B anisotropy (`computeUBias`), transition templates, feature-pins, directional
splits. The cheapest decisive test is GATE-B, because (a) the prior re-baseline already
implicated it and (b) the `__pfConformingUBias` lever already exists. Reading:

- **uBias=0 substantially raises worst min-angle** on a style ⇒ its slivers are
  **GATE-B-anisotropy-driven** ⇒ Phase 2 = tame/condition GATE-B (a contained fix).
- **uBias=0 does NOT help** AND the residual slivers sit in the **bulk** (smooth,
  non-band) ⇒ diagonal/transition-driven ⇒ Phase 1b investigates the `efg` DP path.
- **uBias=0 does NOT help** AND the slivers sit at a **genuine sharp feature** (Voronoi
  cell walls, SFB petal cusps) ⇒ **input-forced** ⇒ exclude + document (Phase 3), not fix.

The chord gate is measured alongside as a **regression sanity** (a triangulation change
must not worsen chord).

---

## File structure

- **Create** `potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs` — per-style probe:
  sweeps `__pfConformingUBias`, measures min-angle (band-vs-bulk) + a chord sanity.
- **Create (output)** `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-ubias-sweep.json` (+ a `.md` table).
- **Create (output)** `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-findings.md` — the synthesis + Phase-2 recommendation.

No production source files are modified in Phase 1.

---

## Pre-flight

- [ ] **P1: Dev server.** A vite dev server must be running (`npm run dev` in
  `potfoundry-web/`). One is already up on **port 3001** this session; probes below pass
  `PF_BASE_URL=http://127.0.0.1:3001/?fidelity=1`. If starting fresh, confirm the port and
  adjust `PF_BASE_URL`.
- [ ] **P2: GPU hygiene.** Probes launch `chromium` `headless:false` with
  `--enable-unsafe-webgpu`. NEVER hard-kill a probe's node process (orphans Chromium,
  degrades the GPU ~3×). Let each reach `browser.close()`.

---

## Task 1: uBias mechanism discriminator (existing lever, new probe)

**Files:**
- Create: `potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs`
- Create (output): `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-ubias-sweep.{json,md}`

- [ ] **Step 1: Write the probe.**

Create `potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs`:

```javascript
// STAGE-2 PHASE-1 — uBias mechanism discriminator. For a style, sweeps the EXISTING
// __pfConformingUBias lever and measures the reference-free min-angle (band-vs-bulk
// split) + a chord regression sanity. Forks GATE-B-anisotropy-driven slivers (uBias=0
// raises worst min-angle) from diagonal/transition/input-forced (it does not).
//
// Usage: PF_STYLE=GyroidManifold PF_UBIASES=-1,0,1 node e2e/_fidelity_quality_ubias_sweep.cjs
//   uBias -1 = unset (production default / computeUBias auto); >=0 = forced.
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GyroidManifold';
const UBIASES = (process.env.PF_UBIASES || '-1,0,1').split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20);
const CHORD = process.env.PF_CHORD === '1';          // optional chord regression sanity
const DENSE_N = Number(process.env.PF_DENSE_N || 4);  // chord sanity sampling (fixed)
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runUBias(browser, ub) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([u]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (u >= 0) window.__pfConformingUBias = u; // -1 = leave unset (production default)
    }, [ub]);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    if (STYLE === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');
    const q = await withTimeout(page.evaluate(([t, b]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: b }), [TARGET, ANGLE_BAR]), DIAG_TIMEOUT, 'qual');
    let c = null;
    if (CHORD) c = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'chord');
    return { q, c };
  } finally { await page.close(); }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== uBias QUALITY SWEEP ${STYLE} (target=${TARGET}, bar=${ANGLE_BAR}deg) ===`);
  console.log('uBias | worstMinAng | p1MinAng | %<bar  | bandedPct | bulkPct | tris    | chordP99');
  for (const ub of UBIASES) {
    let r = null, err = null;
    try { r = await runUBias(browser, ub); } catch (e) { err = String(e.message).slice(0, 60); }
    if (err || !r || !r.q) { console.log(`${String(ub).padStart(5)} | ERROR ${err || 'null'}`); continue; }
    const q = r.q, c = r.c;
    const label = ub < 0 ? 'def' : String(ub);
    console.log(`${label.padStart(5)} | ${(q.worstMinAngleDeg).toFixed(2).padStart(10)} | ${(q.p1MinAngleDeg).toFixed(0).padStart(7)} | ${(q.pctBelow15).toFixed(2).padStart(5)}% | ${(q.bandPctBelow15).toFixed(2).padStart(8)}% | ${(q.nonBandPctBelow15).toFixed(2).padStart(6)}% | ${String(q.triangleCount).padStart(7)} | ${c ? c.p99DevMm.toFixed(4) : '-'}`);
  }
  await browser.close();
})();
```

- [ ] **Step 2: Smoke-run on one strong GATE-B candidate.**

Run (dev server on 3001):
```bash
PF_BASE_URL=http://127.0.0.1:3001/?fidelity=1 PF_STYLE=GyroidManifold PF_UBIASES=-1,0 node potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs
```
Expected: two rows (`def`, `0`) with numeric `worstMinAng` etc. Validates the probe + that
the `__pfConformingUBias=0` lever changes the build (tris and/or angles differ from `def`).
If the two rows are byte-identical, the lever isn't taking effect on this style (Gyroid's
GATE-B may already be 0) — note it and pick a style with a known B>0.

- [ ] **Step 3: Run the discriminator on the catastrophic-sliver styles (+ control).**

Run per style (let each finish; capture stdout). Styles = Stage-1 catastrophic set
(worst < 3°) + a chord-clean quality-fail control:
```bash
for S in GyroidManifold BasketWeave ArtDeco DragonScales HexagonalHive CelticKnot SuperformulaBlossom Voronoi FourierBloom; do \
  PF_BASE_URL=http://127.0.0.1:3001/?fidelity=1 PF_STYLE=$S PF_UBIASES=-1,1,0 PF_CHORD=1 node potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs; done
```
Expected per style: a 3-row table. Interpret each:
- worst min-angle RISES materially at uBias=0 and the `bulkPct` (smooth slivers) drops →
  **GATE-B-driven (fixable by taming anisotropy)**.
- worst min-angle ~unchanged at uBias=0 AND residual slivers concentrate in `bandedPct`
  near a genuine sharp feature → **input-forced (exclude)** (expected for Voronoi cells,
  SFB cusps).
- worst min-angle ~unchanged AND residual in `bulkPct` → **diagonal/transition** → Phase 1b.
- `chordP99` must not rise materially at uBias=0 (regression sanity).

- [ ] **Step 4: Record the sweep.**

Paste each style's table into
`docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-ubias-sweep.md`
(one labelled block per style) with the per-style verdict
(GATE-B / input-forced / diagonal) and the chord-regression note. Mirror the key numbers
into a `stage2-phase1-ubias-sweep.json` array (`{style, ubias, worstMinAngleDeg,
p1MinAngleDeg, pctBelow, bandPct, bulkPct, triangleCount, chordP99}`).

- [ ] **Step 5: Commit.**

```bash
git add potfoundry-web/e2e/_fidelity_quality_ubias_sweep.cjs docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-ubias-sweep.json docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-ubias-sweep.md
git commit -m "test(fidelity): Stage-2 Phase-1 uBias sliver-mechanism discriminator + sweep"
```
(No production symbol changed — the probe uses the existing `__pfConformingUBias` lever.)

---

## Task 2: Phase-1 findings document (Phase-2 fork)

**Files:**
- Create: `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-findings.md`

- [ ] **Step 1: Write the findings doc.**

Create the doc with, sourced from the committed sweep (no prose-only claims):
1. **Per-style mechanism verdict table** — for each style: default vs uBias=0 worst
   min-angle, the Δ, the band-vs-bulk residual, the chord-regression check, and the
   classification {GATE-B-fixable / input-forced / diagonal-transition (Phase-1b)}.
2. **The Phase-2 fork:** how many styles are GATE-B-fixable (→ Phase 2 = condition/tame
   GATE-B), how many input-forced (→ Phase 3 exclusion loci), how many need the `efg`-DP
   investigation (Phase 1b). State whether `uBias=0` is a viable production direction or
   regresses the styles GATE-B serves (chord/anisotropy) — i.e. the fix must *condition*
   GATE-B, not blanket-disable it.
3. **Carry-forward:** the input-forced loci per style (Phase-3 exclusion inputs); any
   style where the chord regressed under uBias=0 (a real tension to resolve in Phase 2).

- [ ] **Step 2: Commit.**

```bash
git add docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1-findings.md
git commit -m "docs(fidelity): Stage-2 Phase-1 findings — sliver mechanism + Phase-2 fork"
```

---

## Self-review

- **Spec coverage:** implements design §6.1 (sliver-origin diagnostic): the mechanism
  discriminator (Task 1) and the fixable-vs-input-forced split (band-vs-bulk + sharp-locus
  reading, Task 1 Step 3 + Task 2). The §5 exclusion-loci identification is seeded here
  (carry-forward) and built in Phase 3. The diagonal/`efg`-DP path is explicitly deferred
  to a conditional Phase 1b (only if uBias=0 doesn't explain the slivers) — measurement
  before building that lever.
- **No production change:** Phase 1 adds a probe + docs only; the `__pfConformingUBias`
  lever already exists. Production byte-identical.
- **No placeholders:** the probe is shown in full; the styles, env vars, commands, and
  interpretation rules are concrete. The findings doc's contents are enumerated and
  sourced from the committed sweep.
- **Type/name consistency:** probe reads `diagnoseCrestQuality` fields
  (`worstMinAngleDeg`, `p1MinAngleDeg`, `pctBelow15`, `bandPctBelow15`,
  `nonBandPctBelow15`, `triangleCount`) exactly as returned by
  `crestBandTriangleQuality` (`metrics.ts:1829-1842`); `diagnoseSurfaceFidelity` perp
  fields as used in Stage 1.
- **Measurement-first / cheapest-first:** tests the single most-likely mechanism (GATE-B)
  with a zero-code existing lever before building any new instrument; forks cleanly to
  Phase 2 (tame GATE-B) / Phase 1b (efg-DP) / Phase 3 (exclude).
```
