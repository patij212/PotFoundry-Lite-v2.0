# Snaking-C0 P2 — CelticKnot feature-side curtain emission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the CelticKnot feature-side complex (ribbon↔background outer walls AND the internal z-buffer occlusion step) as SSA curtain patches on the target, flip `completeInternalFeatureSideGraphEmitted → true` for relief>0, and make CelticKnot composition-admissible.

**Architecture:** At target-derive time, enumerate the *declared* cliff segment structure from P1's pure `buildCelticKnotCliffComplex` (single source of truth — the same module the P3 mesher will read), then emit **one SSA curtain patch per declared segment**. Each curtain is a generalization of the existing `compileSeamCurtain`: `localU` sweeps the arc `s∈[0,1]` along the cliff curve, `localV` sweeps the lip fraction 0→1 between the two one-sided radius limits, and the point is projected through the existing `radialPointAt`. P1's JS closures are used ONLY for test validation, never fed into the SSA emitter.

**Tech Stack:** TypeScript, Vitest (jsdom), the validated-SSA target-program builder (`validatedTargetProgramBuilder` / `radialOuterWallProgram`), domain-separated canonical-JSON SHA-256.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-snaking-c0-double-valued-wall-design.md` §4.2 (P2). Roadmap agnosticism rule (`research/lab/2026-07-15-universal-001mm-roadmap.md` §340): the TARGET DECLARES structure analytically; the judge/mesher NEVER detects it from samples. The cliff curves + lips are the style's own closed form.
- **Proof-critical file, SHA-pinned.** `celticKnotOuterWallTarget.ts` emits SHA-stable SSA programs. Every emitted program must be deterministic (no `Date`/`Math.random`/DOM). The canonical-JSON/backends contract must be preserved (emit via `buildRadialTargetPatchProgram` → `compileGeneratedTargetProgramBackends`, exactly like the existing patches).
- **Do NOT touch** any of: `parallelPatchProof*.ts`, `_patchProofWorker.ts`, Gothic certification, `FeatureLineGraph.ts`, `completeMappedArtifactGeometry.ts`, `finalStlPartialCertification.ts`. Another agent holds these open.
- **Lint is 0-max-warnings** (CI fails otherwise). A `PostToolUse` hook runs `eslint --max-warnings=0` after every `.ts` edit. Fix warnings before moving on.
- **Concurrency hygiene:** `git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0"` with absolute paths only; NEVER `git stash`; treat session-start `git status` as stale (re-check immediately before committing); commit ONLY the files this plan lists, by explicit pathspec (`git commit -m "..." -- <path> <path>`), NEVER `-a`.
- **GitNexus:** impact was pre-run — `createCelticKnotOuterWallTargetBinding` and `compositionStatus` are both **LOW risk** (0 processes affected; CelticKnot-local). Run `detect_changes()` before the final commit and confirm scope is CelticKnot target + registry CelticKnot-case + the 2 tests + this plan.
- **Gate safety:** the certified-pot rosters (`annularSolidReferenceTessellation.test.ts` `CERTIFIED_POTS`, `_certifiedPotStl.test.ts`, `adversarialContainment.test.ts`) all EXCLUDE CelticKnot (grep-confirmed). Making CelticKnot admissible adds no CelticKnot cert work to the gate. **If ANY existing certificate moves other than CelticKnot's own binding/registry SHA, STOP and diagnose before committing.**
- All commands run from `potfoundry-web/` unless noted. Run heavy suites in the FOREGROUND.

---

## File Structure

- **Modify:** `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts`
  - New imports: `buildCelticKnotCliffComplex`, `type CelticKnotCliffComplex`, `type CelticKnotCliffParams`, `type CliffDims`, `type CliffSegment` from the P1 module; `buildAnalyticRadiusFn` from `../analyticRadius`; `type StyleOptions` from `../types`.
  - New patch interface `CelticKnotFeatureCurtainPatch`; extend the `CelticKnotOuterWallTargetPatch` union.
  - New internal `declaredComplex(input, params)` + exported `celticKnotDeclaredComplex(input)` (single-source enumeration used by both `derive` and tests).
  - New `compileFeatureCurtain(input, params, segment, index)`.
  - Wire feature curtains into `derive` (gated on `seamCurtainActive`); flip `completeInternalFeatureSideGraphEmitted`; widen its type `false`→`boolean`; update `CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE`, the proof-method last bullet, and `regularityValue`.
- **Modify:** `potfoundry-web/src/geometry/targetSolid/styleOuterWallTargetRegistry.ts`
  - `compositionStatus`, CelticKnot `case` only: gate the blocker on `&& !source.completeInternalFeatureSideGraphEmitted`.
- **Modify (tests):** `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts` (feature-curtain coverage + flag assertions), `potfoundry-web/src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts` (CelticKnot moves from refuse→admissible).
- **No new source files.** `compileFeatureCurtain` lives beside `compileSeamCurtain` in the target file (cohesive: both use the private `celticKnotRadius` graph). The P1 declaration module already exists (committed f6aa442d).

**Shared test helpers** (define once at the top of `celticKnotOuterWallTarget.test.ts`, reuse across new tests):

```ts
const xy = (p: readonly [number, number, number]): [number, number] => [p[0], p[1]];
const rad = (p: readonly [number, number, number]): number => Math.hypot(p[0], p[1]);
function r0At(t: number): number {
  return baseRadius(
    DEFAULT_GEOMETRY.H * t, DEFAULT_GEOMETRY.H,
    DEFAULT_GEOMETRY.bottom_od / 2, DEFAULT_GEOMETRY.top_od / 2,
    DEFAULT_GEOMETRY.expn, DEFAULT_GEOMETRY,
  );
}
```

(`baseRadius` and `DEFAULT_GEOMETRY` are already imported in this test file.)

---

## Task 1: Ribbon↔background feature curtains (the analytic, load-bearing core)

Emit one curtain patch per declared `ribbon-background` segment. Lips are pure analytic one-sided limits (`upper = r0`, `lower = r0 − jump`) — no `celticKnotRadius` evaluation, no floating-point edge fragility. Flag stays `false` and the registry is untouched this task (occlusion not yet emitted → graph not complete).

**Files:**
- Modify: `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts`
- Test: `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts`

**Interfaces:**
- Consumes (from P1, committed): `buildCelticKnotCliffComplex(params: CelticKnotCliffParams, dims: CliffDims, styleRadius?: (theta,z)=>number): CelticKnotCliffComplex`; `CliffSegment { kind: 'ribbon-background'|'occlusion'; column; strand; side: 1|-1; tRange: [number,number]; at(s); lipsAt(s) }`.
- Consumes (existing, in-file): `celticKnotRadius(context, params, t, materialU)`, `buildRadialTargetPatchProgram`, `compileGeneratedTargetProgramBackends`, `RadialTargetPatchContext`, `TargetExpressionReference`.
- Produces: `celticKnotDeclaredComplex(input): CelticKnotCliffComplex`; `compileFeatureCurtain(input, params, segment, index): CelticKnotFeatureCurtainPatch`; patch `kind: 'ribbon-curtain'|'occlusion-curtain'`, `role: 'feature-curtain'`, `patchId: \`feature-curtain-${'rb'|'occ'}-${index}\``. Feature curtains appended to `binding.patches` after `outer-wall` (+ `seam-curtain`), in `cx.segments` order.

- [ ] **Step 1: Write the failing tests**

Add to `celticKnotOuterWallTarget.test.ts` (add `import { celticKnotDeclaredComplex } from './celticKnotOuterWallTarget';` to the existing import block, and the shared helpers above):

```ts
describe('Celtic Knot ribbon↔background feature curtains (P2)', () => {
  it('emits one ribbon-curtain per declared ribbon-background segment when relief>0', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const cx = celticKnotDeclaredComplex(canonicalInput);
    const declaredRibbon = cx.segments.filter((s) => s.kind === 'ribbon-background');
    const ribbonPatches = binding.patches.filter((p) => p.kind === 'ribbon-curtain');
    expect(declaredRibbon.length).toBeGreaterThan(0);
    expect(ribbonPatches.length).toBe(declaredRibbon.length);
    for (const p of ribbonPatches) {
      expect(p.role).toBe('feature-curtain');
      expect(p.programSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(p.nodeCount).toBeGreaterThan(0);
      expect(p.nodeCount).toBeLessThan(8192);
    }
  });

  it('welds each ribbon curtain to the analytic one-sided limits (upper=r0, lower=r0−jump)', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const jump = 2.0 * 0.3; // default ck_relief=2.0 → jump 0.6 mm
    const ribbonPatches = binding.patches.filter((p) => p.kind === 'ribbon-curtain');
    let worst = 0;
    for (const p of ribbonPatches) {
      for (const s of [0.15, 0.5, 0.85]) {
        const pUp = p.backends.evaluateFloat64(s, 1);
        const pLo = p.backends.evaluateFloat64(s, 0);
        const t = pUp[2] / DEFAULT_GEOMETRY.H;        // z = H·t
        const r0 = r0At(t);
        expect(pLo[2]).toBeCloseTo(pUp[2], 9);        // v=0 and v=1 share the (u,t) locus
        worst = Math.max(worst, Math.abs(rad(pUp) - r0), Math.abs(rad(pLo) - (r0 - jump)));
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('emits no feature curtains when relief is zero (patchCount stays 1)', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input({ ck_relief: 0 }));
    expect(binding.patches.some((p) => p.role === 'feature-curtain')).toBe(false);
    expect(binding.patchCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts -t "ribbon"`
Expected: FAIL — `celticKnotDeclaredComplex` is not exported / no `ribbon-curtain` patches emitted.

- [ ] **Step 3: Add imports + the new patch type**

At the top of `celticKnotOuterWallTarget.ts`, add to the imports:

```ts
import {
  buildCelticKnotCliffComplex,
  type CelticKnotCliffComplex,
  type CelticKnotCliffParams,
  type CliffDims,
  type CliffSegment,
} from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';
import { buildAnalyticRadiusFn } from '../analyticRadius';
import type { StyleOptions } from '../types';
```

After the `CelticKnotSeamCurtainPatch` interface, add:

```ts
export interface CelticKnotFeatureCurtainPatch {
  readonly kind: 'ribbon-curtain' | 'occlusion-curtain';
  readonly role: 'feature-curtain';
  readonly patchId: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}
```

Extend the union:

```ts
export type CelticKnotOuterWallTargetPatch =
  | CelticKnotOuterWallPatch
  | CelticKnotSeamCurtainPatch
  | CelticKnotFeatureCurtainPatch;
```

- [ ] **Step 4: Add `declaredComplex` + exported `celticKnotDeclaredComplex`**

Add above `compileOuterWall` (both consume the private `parameters()` result; the exported wrapper is the single-source enumerator tests read):

```ts
function declaredComplex(
  input: CanonicalTargetInputBinding,
  params: CelticKnotParameters
): CelticKnotCliffComplex {
  const geometry = input.geometry.geometry;
  const dims: CliffDims = {
    H: geometry.H,
    Rb: geometry.bottom_od / 2,
    Rt: geometry.top_od / 2,
    expn: geometry.expn,
  };
  const cliffParams: CelticKnotCliffParams = {
    columnCount: params.columnCount,
    strandWidth: params.strandWidth,
    strandCount: params.strandCount,
    tightness: params.tightness,
    relief: params.relief,
    gap: params.gap,
    roundness: params.roundness,
  };
  const analyticRadius = buildAnalyticRadiusFn(
    'CelticKnot',
    input.style.cpuOptions as StyleOptions,
    dims
  );
  return buildCelticKnotCliffComplex(cliffParams, dims, analyticRadius);
}

/** The declared CelticKnot feature-side complex the target emits as curtain patches. */
export function celticKnotDeclaredComplex(
  input: CanonicalTargetInputBinding
): CelticKnotCliffComplex {
  return declaredComplex(input, parameters(input));
}
```

- [ ] **Step 5: Add `compileFeatureCurtain` (ribbon branch only for now)**

Add after `compileSeamCurtain`:

```ts
function compileFeatureCurtain(
  input: CanonicalTargetInputBinding,
  params: CelticKnotParameters,
  segment: CliffSegment,
  index: number
): CelticKnotFeatureCurtainPatch {
  const { column, strand, side, tRange, kind } = segment;
  const patchId = `feature-curtain-${kind === 'occlusion' ? 'occ' : 'rb'}-${index}`;
  const programCanonicalJson = buildRadialTargetPatchProgram(
    input,
    'CelticKnot',
    {
      evaluatorId: `potfoundry.celtic-knot.feature-curtain.${kind}`,
      evaluatorVersion: 'v1',
      patchId,
    },
    (context) => {
      const { builder, constant } = context;
      const s = context.localU; // arc along the cliff curve, 0..1
      const v = context.localV; // lip fraction, 0..1
      // t = tRange0 + (tRange1 - tRange0) * s
      const t = builder.add(
        constant(tRange[0]),
        builder.multiply(constant(tRange[1] - tRange[0]), s)
      );
      // centerline = 0.4 * sin( t*tightness*tau*3 + column*pi*0.333 + strand*(tau/strandCount) )
      const argument = builder.add(
        builder.multiply(
          builder.multiply(builder.multiply(t, constant(params.tightness)), context.tau),
          constant(3)
        ),
        builder.add(
          builder.multiply(builder.multiply(constant(column), builder.pi()), constant(0.333)),
          builder.multiply(
            builder.divide(context.tau, constant(params.strandCount)),
            constant(strand)
          )
        )
      );
      const centerline = builder.multiply(constant(0.4), builder.sin(argument));
      const materialUAt = (localUGeom: TargetExpressionReference): TargetExpressionReference =>
        builder.divide(
          builder.add(
            builder.add(constant(column), builder.multiply(localUGeom, constant(0.5))),
            constant(0.5)
          ),
          constant(params.columnCount)
        );
      const localUEdge = builder.add(centerline, constant(side * params.strandWidth));
      const materialU = materialUAt(localUEdge);
      const r0 = context.baseRadiusAt(t);
      let lowerRadius: TargetExpressionReference;
      let upperRadius: TargetExpressionReference;
      if (kind === 'occlusion') {
        // Occlusion branch — implemented in Task 2.
        lowerRadius = r0;
        upperRadius = r0;
      } else {
        lowerRadius = builder.subtract(r0, constant(params.relief * 0.3));
        upperRadius = r0;
      }
      const radius = builder.mix(lowerRadius, upperRadius, v);
      return context.radialPointAt(radius, materialU, t);
    }
  );
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  return Object.freeze({
    kind: kind === 'occlusion' ? 'occlusion-curtain' : 'ribbon-curtain',
    role: 'feature-curtain',
    patchId,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  });
}
```

- [ ] **Step 6: Wire feature curtains into `derive`**

In `derive`, replace the `patches` construction (currently `compileOuterWall` + optional `compileSeamCurtain`) with:

```ts
  const complex = seamCurtainActive
    ? declaredComplex(input, params)
    : undefined;
  const featureCurtains = complex
    ? complex.segments
        .map((segment, index) => ({ segment, index }))
        // Task 2 removes this filter to also emit occlusion curtains. The original
        // cx.segments `index` is preserved so occlusion patchIds stay stable.
        .filter(({ segment }) => segment.kind === 'ribbon-background')
        .map(({ segment, index }) => compileFeatureCurtain(input, params, segment, index))
    : [];
  const patches = Object.freeze([
    compileOuterWall(input, params),
    ...(seamCurtainActive ? [compileSeamCurtain(input, params)] : []),
    ...featureCurtains,
  ]) as readonly CelticKnotOuterWallTargetPatch[];
```

Leave `completeInternalFeatureSideGraphEmitted: false` and the scope/proof strings unchanged this task. (`declaredComplex` still enumerates occlusion segments — they are filtered out of emission until Task 2 — so `celticKnotDeclaredComplex` already returns the complete complex for the Task 1 count test.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts`
Expected: PASS — the 3 new ribbon tests pass AND every pre-existing test in the file still passes (they select patches by `kind`/`role`, so extra patches don't disturb them; `relief:0` still yields `patchCount:1`).

- [ ] **Step 8: Lint + typecheck the touched file**

Run: `npx eslint src/geometry/targetSolid/celticKnotOuterWallTarget.ts --max-warnings=0` then `npm run typecheck`
Expected: clean (0 warnings, 0 type errors). If ESLint flags the cross-directory import, DO NOT suppress — confirm there is no `import/no-restricted-paths` rule (there is none as of this plan); the P1 module is a pure declaration (imports only `geometry/profile`), so no dependency cycle is created.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" commit -m "feat(target): CelticKnot ribbon↔background feature curtains (P2, TDD)" -- potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts
```

---

## Task 2: Internal occlusion feature curtains (the z-buffer over/under step)

Extend `compileFeatureCurtain`'s `occlusion` branch. The upper lip is the under-strand's one-sided surface limit, expressed by re-using the shared `celticKnotRadius` SSA graph evaluated at the over-edge **nudged outward by a small δ** — this is load-bearing: evaluating the graph exactly on the over-edge is ULP-fragile (a 1-ULP slip lets the higher-z over-strand win the z-buffer and collapses the wall to zero height), so the δ-nudge guarantees the over-strand is strictly excluded and the raised under-strand surface (the true one-sided limit) shows.

**Files:**
- Modify: `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts` (occlusion branch of `compileFeatureCurtain`)
- Test: `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts`

**Interfaces:**
- Consumes: everything from Task 1, plus the in-file `celticKnotRadius(context, params, t, materialU)`.
- Produces: occlusion curtains now weld to the under-strand surface (`upper > lower`, non-degenerate); `binding.patches` gains `occlusion-curtain` patches for every declared occlusion segment.

- [ ] **Step 1: Write the failing tests**

Add to `celticKnotOuterWallTarget.test.ts`:

```ts
describe('Celtic Knot internal occlusion feature curtains (P2)', () => {
  it('emits one occlusion-curtain per declared occlusion segment when relief>0', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const cx = celticKnotDeclaredComplex(canonicalInput);
    const declaredOcc = cx.segments.filter((s) => s.kind === 'occlusion');
    const occPatches = binding.patches.filter((p) => p.kind === 'occlusion-curtain');
    expect(declaredOcc.length).toBeGreaterThan(0);
    expect(occPatches.length).toBe(declaredOcc.length);
    for (const p of occPatches) expect(p.nodeCount).toBeLessThan(8192);
  });

  it('occlusion curtains are non-degenerate raised steps (δ-nudge picks the under strand)', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    const occPatches = binding.patches.filter((p) => p.kind === 'occlusion-curtain');
    for (const p of occPatches) {
      for (const s of [0.5]) {
        const lo = rad(p.backends.evaluateFloat64(s, 0));
        const up = rad(p.backends.evaluateFloat64(s, 1));
        const t = p.backends.evaluateFloat64(s, 0)[2] / DEFAULT_GEOMETRY.H;
        expect(lo).toBeCloseTo(r0At(t), 4);   // lower lip = over-strand foot r0
        expect(up).toBeGreaterThan(lo + 0.05); // a genuine step UP to a ribbon (NOT collapsed)
      }
    }
  });

  it('occlusion curtains weld to the outer-wall one-sided limits across the over-edge', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const wall = outer(binding);
    const cx = celticKnotDeclaredComplex(canonicalInput);
    const occ = cx.segments
      .map((s, i) => ({ s, i }))
      .filter((e) => e.s.kind === 'occlusion');
    const dU = 1e-6;
    let checked = 0;
    let worst = 0;
    for (const { s: seg, i } of occ) {
      const patch = binding.patches.find((p) => p.patchId === `feature-curtain-occ-${i}`);
      expect(patch).toBeDefined();
      if (patch === undefined) continue;
      for (const f of [0.3, 0.5, 0.7]) {
        const { u, t } = seg.at(f);
        const materialU = u / (2 * Math.PI);           // spin=0 ⇒ material = placement angle
        const lo = rad(patch.backends.evaluateFloat64(f, 0));
        const up = rad(patch.backends.evaluateFloat64(f, 1));
        const rIn = rad(wall.backends.evaluateFloat64(materialU - seg.side * dU, t));  // over foot ≈ r0
        const rOut = rad(wall.backends.evaluateFloat64(materialU + seg.side * dU, t)); // under surface
        if (rOut - rIn > 0.05) {
          checked += 1;
          worst = Math.max(worst, Math.abs(up - rOut), Math.abs(lo - rIn));
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.02);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts -t "occlusion"`
Expected: FAIL — occlusion curtains currently collapse (`upper = lower = r0`, the Task-1 placeholder), so the "raised step" and "weld" assertions fail.

- [ ] **Step 3a: Emit occlusion segments (remove the ribbon-only filter in `derive`)**

In `derive`, delete the `.filter(({ segment }) => segment.kind === 'ribbon-background')` line added in Task 1 so ALL declared segments are emitted:

```ts
  const featureCurtains = complex
    ? complex.segments.map((segment, index) =>
        compileFeatureCurtain(input, params, segment, index)
      )
    : [];
```

- [ ] **Step 3b: Implement the occlusion branch**

In `compileFeatureCurtain`, replace the `if (kind === 'occlusion') { ... }` placeholder body with:

```ts
      if (kind === 'occlusion') {
        // Lower lip = the over-strand foot r0 (its profile → 0 at its own edge).
        lowerRadius = r0;
        // Upper lip = the raised under-strand surface = the shared celticKnotRadius graph
        // evaluated at the over-edge nudged OUTWARD by δ. The nudge is load-bearing: at the
        // exact edge the strict step is 1-ULP fragile and the higher-z over-strand can win,
        // collapsing the wall. δ (in localU units) strictly excludes the over-strand so the
        // under-strand's one-sided surface limit shows.
        const DELTA_LOCAL_U = 1e-6;
        const localUOuter = builder.add(
          centerline,
          constant(side * (params.strandWidth + DELTA_LOCAL_U))
        );
        upperRadius = celticKnotRadius(context, params, t, materialUAt(localUOuter));
      } else {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts`
Expected: PASS — occlusion curtains present, non-degenerate, and welding to the outer-wall under-strand limit; all Task-1 and pre-existing tests still pass.

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/geometry/targetSolid/celticKnotOuterWallTarget.ts --max-warnings=0` then `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" commit -m "feat(target): CelticKnot internal occlusion feature curtains (P2, TDD)" -- potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts
```

---

## Task 3: Flip `completeInternalFeatureSideGraphEmitted` + update scope/proof/obligations

The complete declared graph (both kinds) is now emitted, so flip the flag for relief>0 and update the proof-semantic strings (SHA changes are intended). Wording stays honest: the graph declared by the cliff complex is emitted for every declared segment — no claim of exhaustive-envelope completeness (that is P1's declaration scope).

**Files:**
- Modify: `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts`
- Test: `potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts`

**Interfaces:**
- Produces: `binding.completeInternalFeatureSideGraphEmitted` is now `boolean` (`true` ⟺ `relief≠0`); `CELTIC_KNOT_OUTER_WALL_TARGET_PROOF_SHA256`, `bindingSha256`, `regularityObligationsSha256` move (intended, CelticKnot-local).

- [ ] **Step 1: Write / update the failing tests**

In `celticKnotOuterWallTarget.test.ts`, update the existing `'declares the finite foreground/background and occlusion discontinuities'` test (currently asserts the flag is `false`) and add a relief=0 case:

```ts
  it('flips the complete-feature-side-graph flag once curtains are emitted', () => {
    const active = createCelticKnotOuterWallTargetBinding(input());
    expect(active.internalRibbonDiscontinuitiesActive).toBe(true);
    expect(active.completeInternalFeatureSideGraphEmitted).toBe(true);
    expect(active.regularityObligationsCanonicalJson).toContain('foreground-background-radial-jump');
    expect(active.regularityObligationsCanonicalJson).toContain('z-buffer-occlusion-ties');

    const flat = createCelticKnotOuterWallTargetBinding(input({ ck_relief: 0 }));
    expect(flat.internalRibbonDiscontinuitiesActive).toBe(false);
    expect(flat.completeInternalFeatureSideGraphEmitted).toBe(false);
  });
```

Delete the old `'declares the finite foreground/background and occlusion discontinuities'` test (its `completeInternalFeatureSideGraphEmitted).toBe(false)` assertion is now superseded by the test above).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts -t "flips the complete"`
Expected: FAIL — flag is still hard-coded `false`.

- [ ] **Step 3: Update the scope string**

Replace `CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE`:

```ts
export const CELTIC_KNOT_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-celtic-knot-outer-wall-conditional-physical-seam-curtain-and-complete-clipped-ribbon-and-occlusion-feature-side-curtain-complex-no-inner-rim-bottom-regularity-artifact-distance-or-device-conformance-proof' as const;
```

- [ ] **Step 4: Update the proof-method last bullet**

In the `CELTIC_KNOT_OUTER_WALL_TARGET_PROOF_SHA256` string array, replace the final line:

```ts
    'the internal ribbon and occlusion discontinuity graph declared by the celtic knot cliff complex is emitted as clipped double-valued feature-side curtain patches for every declared segment whenever relief is active',
```

- [ ] **Step 5: Widen the interface field type**

In `CelticKnotOuterWallTargetBinding`, change:

```ts
  readonly completeInternalFeatureSideGraphEmitted: boolean;
```

- [ ] **Step 6: Compute and thread the flag in `derive` and `regularityValue`**

In `regularityValue`, change the first field from the literal to the active flag (it already receives `seamCurtainActive`, which equals `relief≠0`):

```ts
    completeInternalFeatureSideGraphEmitted: seamCurtainActive,
```

In `derive`, add after `const internalRibbonDiscontinuitiesActive = params.relief !== 0;`:

```ts
  const completeInternalFeatureSideGraphEmitted = internalRibbonDiscontinuitiesActive;
```

Then in the `bindingValue` object literal and in the returned frozen binding, replace both occurrences of `completeInternalFeatureSideGraphEmitted: false,` with:

```ts
    completeInternalFeatureSideGraphEmitted,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts`
Expected: PASS. The `'reauthenticates its patch set'` test still passes (derive is deterministic; `celticKnotOuterWallTargetForProof` re-derives and matches the new SHAs).

- [ ] **Step 8: Lint + typecheck**

Run: `npx eslint src/geometry/targetSolid/celticKnotOuterWallTarget.ts --max-warnings=0` then `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" commit -m "feat(target): flip CelticKnot completeInternalFeatureSideGraphEmitted (P2, TDD)" -- potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.ts potfoundry-web/src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts
```

---

## Task 4: Make CelticKnot composition-admissible in the registry

Teach the registry's CelticKnot composition rule to clear the `MISSING_INTERNAL_RIBBON_FEATURE_SIDE_GRAPH` blocker once the complete feature-side graph is emitted. The shared registry proof STRING already says features refuse *"while their complete internal physical side graphs are absent"* — so it stays valid unchanged; only CelticKnot's derived binding SHA and admissibility move.

**Files:**
- Modify: `potfoundry-web/src/geometry/targetSolid/styleOuterWallTargetRegistry.ts` (CelticKnot `case` in `compositionStatus`)
- Test: `potfoundry-web/src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts`

**Interfaces:**
- Consumes: `source.internalRibbonDiscontinuitiesActive`, `source.completeInternalFeatureSideGraphEmitted` (the CelticKnot source binding fields).
- Produces: `target('CelticKnot').outerWallCompositionAdmissible === true` and `compositionBlockers === []` at default (relief>0).

- [ ] **Step 1: Write / update the failing tests**

In `styleOuterWallTargetRegistry.test.ts`, in the `'refuses composition for each currently known missing physical closure graph'` test, REMOVE the CelticKnot assertion (lines asserting `target('CelticKnot').compositionBlockers` contains `MISSING_INTERNAL_RIBBON_FEATURE_SIDE_GRAPH`) and leave HexagonalHive + BasketWeave. Then add a new test:

```ts
  it('admits CelticKnot composition once its feature-side curtain complex is emitted', () => {
    const binding = target('CelticKnot');
    expect(binding.sourceBinding.styleId).toBe('CelticKnot');
    expect(binding.outerWallCompositionAdmissible).toBe(true);
    expect(binding.compositionBlockers).toEqual([]);
    expect(binding.outerWallPhysicalClosureComplete).toBe(true);
    // sibling styles whose graphs are still absent must STILL refuse (change is CelticKnot-scoped)
    expect(target('HexagonalHive', { hh_noise: 0.2 }).compositionBlockers).toContain(
      'MISSING_INTERNAL_CELL_FEATURE_SIDE_GRAPH'
    );
    expect(target('BasketWeave').compositionBlockers).toContain(
      'MISSING_INTERNAL_CHECKER_CURTAIN_GRAPH'
    );
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts -t "admits CelticKnot"`
Expected: FAIL — CelticKnot still carries the blocker (registry ignores the emitted-graph flag).

- [ ] **Step 3: Implement the registry rule**

In `compositionStatus`, replace the CelticKnot case:

```ts
    case 'CelticKnot':
      if (
        source.internalRibbonDiscontinuitiesActive &&
        !source.completeInternalFeatureSideGraphEmitted
      ) {
        blockers.push('MISSING_INTERNAL_RIBBON_FEATURE_SIDE_GRAPH');
      }
      break;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts`
Expected: PASS — the all-20 dispatch/reauth test still passes (CelticKnot's binding SHA changed but stays distinct among the 20); CelticKnot admitted; siblings still refuse.

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/geometry/targetSolid/styleOuterWallTargetRegistry.ts --max-warnings=0` then `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" commit -m "feat(registry): admit CelticKnot composition once feature-side graph emitted (P2, TDD)" -- potfoundry-web/src/geometry/targetSolid/styleOuterWallTargetRegistry.ts potfoundry-web/src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts
```

---

## Task 5: Full verification — gate roster, scope, and provenance

No new production code. Confirm the increment is green end-to-end, the blast radius is exactly as predicted, and the gate did not move.

**Files:** none modified (verification + this plan doc committed if not already).

- [ ] **Step 1: Run the directly-affected suites together**

Run: `npx vitest run src/geometry/targetSolid/celticKnotOuterWallTarget.test.ts src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts src/renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex.test.ts`
Expected: PASS — including the P1 declaration test (must be UNCHANGED — P1 was not edited).

- [ ] **Step 2: Run the PF_G2_POT certification gate (foreground, heavy)**

Run: `npx vitest run src/geometry/targetSolid/annularSolidReferenceTessellation.test.ts`
Expected: PASS — every roster pot still certifies. CelticKnot is not in the roster, so no CelticKnot cert runs. If ANY roster pot's certificate moves, STOP and diagnose (a moved non-CelticKnot certificate means the change leaked beyond CelticKnot).

- [ ] **Step 3: Run the broader targetSolid + adversarial suites**

Run: `npx vitest run src/geometry/targetSolid/`
Expected: PASS. Watch the all-20 registry dispatch test's runtime (30s timeout) — CelticKnot now compiles its feature-curtain programs; if it approaches the timeout, note the added compile cost (not a correctness failure).

- [ ] **Step 4: Probe the atlas admissibility gate (diagnostic, non-gating)**

Confirm CelticKnot now clears the `UNSUPPORTED_PATCH_COMPLEX` composition gate (`singlePatchAnnularRadialSolidTarget.ts:371`). Run this one-off check:

```bash
npx vitest run src/geometry/targetSolid/styleOuterWallTargetRegistry.test.ts -t "admits CelticKnot"
```

The registry admissibility assertions in Task 4 already prove the gate clears. Full CelticKnot atlas certification (tessellation + wall-band scoring) is explicitly **P4 scope** — do NOT expand into it here. If you separately try `createSinglePatchAnnularRadialSolidTargetBinding` for CelticKnot and it throws for a reason OTHER than composition-admissibility, record it and report to the user; do not fix it in P2.

- [ ] **Step 5: Run `detect_changes` and confirm scope**

Run GitNexus `detect_changes({ scope: "unstaged" })` (or against `apply/streamlit-fix` with `scope: "compare"` for the regression view). Confirm the only changed symbols are in `celticKnotOuterWallTarget.ts`, `styleOuterWallTargetRegistry.ts` (CelticKnot case), and the two test files. WARN and STOP if anything else appears.

- [ ] **Step 6: Full lint + typecheck**

Run: `npm run lint` then `npm run typecheck`
Expected: 0 warnings, 0 errors.

- [ ] **Step 7: Re-check git status and commit the plan if not already tracked**

Run: `git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" status --short` (re-check — session-start status is stale). If this plan file is untracked:

```bash
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" add docs/superpowers/plans/2026-07-17-snaking-c0-p2-celtic-knot-feature-curtain.md
git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0" commit -m "docs(plan): snaking-C0 P2 CelticKnot feature-curtain plan" -- docs/superpowers/plans/2026-07-17-snaking-c0-p2-celtic-knot-feature-curtain.md
```

---

## Definition of Done (P2)

- [x] `completeInternalFeatureSideGraphEmitted: true` for CelticKnot with relief>0 (Task 3).
- [x] Feature-curtain patches emitted for BOTH ribbon↔background and occlusion jumps, one per declared segment, covering the declared discontinuity graph (Tasks 1–2).
- [x] The declared regularity obligations (`foreground-background-radial-jump`, `z-buffer-occlusion-ties`, `closest-strand-ownership-ties`) are satisfied by the emitted curtains (Tasks 1–3).
- [x] CelticKnot composition-admissible; atlas admissibility gate clears (Task 4).
- [x] CelticKnot target tests + registry tests + P1 test + PF_G2_POT gate all green (Task 5).
- [x] `detect_changes` scope limited to the CelticKnot target + registry CelticKnot-case + the two tests + this plan (Task 5).
- **Remaining (out of scope, per spec):** P3 mesher double-valued wall generation (U5 candidate track); P4 certification scores the wall band and retires the `tBands` exclusion; P1′ extends the declaration to CelticTriquetra + BasketWeave@twist.
