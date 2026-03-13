# Verifier Round 1 — Critique of Known Issues Audit & Generator Review
Date: 2026-03-07

---

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Master's audit is substantively correct and well-structured. The Generator's review is thorough and adds real value with 11 additional issues. However, I found **4 factual errors**, **1 false positive**, **1 false negative**, and **3 count corrections** that must be addressed before this document is finalized.

---

## VERIFIER CRITIQUE

### Master's Items

#### I-1. ESLint Configuration Missing — CONFIRMED (P0)
**Verification**: Searched for `*eslint*` across all of `potfoundry-web/`. Zero config files found in any format (`.js`, `.mjs`, `.cjs`, `.json`, `.yml`, `.yaml`, legacy `.eslintrc.*`). Terminal test confirms: `Test-Path eslint.config.js` → `False` for all six variants.

**Verdict**: The claim is accurate. CI lint gate is completely non-functional.

---

#### I-2. TypeScript 166 Compile Errors — CONFIRMED with NOTE
**Verification**: I confirmed via recent terminal output that `npx tsc --noEmit` fails with a high error count. The error categories described (TS6133 unused imports, TS2593 missing test types, TS2339 stale API references, TS7006 implicit `any`) are all real categories observed in this codebase.

**Note**: Some of these errors *may* be inflated by missing `@types/vitest` or tsconfig misconfiguration (e.g., test files included in `tsconfig.json` but vitest globals not exposed). The raw count of 166 should be treated as an upper bound — the actual "real" production-code error count is likely lower. This doesn't change the P1 rating; either way, the typecheck gate is broken.

**Verdict**: CONFIRMED, but recommend subdividing into "production errors" vs "test infrastructure errors" during triage.

---

#### I-3. Empty / Broken Test Suite — CONFIRMED
**Verification**: Read `fidelity.integration.test.ts` — file exists but is completely empty (0 bytes). This will cause a test suite failure.

**Verdict**: Accurate. Delete the file.

---

#### I-4. Skipped / Stale Tests — CONFIRMED
No dispute. The descriptions match what's in the codebase.

---

#### II-1. Chain-Strip Sliver Triangles — CONFIRMED (P1)
No dispute on characterization. The R24/R24.1/R25 history is accurately summarized.

---

#### II-2. GPU-Surface Subdivision Recovery — AMENDED (P1 → P2)
**Reasoning**: I agree with the Generator's observation. If 183/183 tests pass and the `snappedVertices` set was introduced in v20.2, the remaining gap is test coverage breadth (all 19 styles), not broken functionality. Downgrade to P2-with-coverage-task is appropriate.

**Verdict**: ACCEPT Generator's downgrade to P2.

---

#### II-3. Seam Synchronization Fragility — CONFIRMED (P2)
The R28 Executioner entry in `agents_journal.md` (2026-03-06) confirms this is still actively producing bugs — the seam boundary chain vertex issue required a recent fix. This validates the P2 rating.

---

#### II-4. Relaxation Shader Grid-Only Assumption — AMENDED
**Generator proposes upgrade to P1**. I partially agree but lean toward keeping it P2.

**Reasoning**: The `chunk4.z` dual-purpose uniform is indeed fragile. However, it's *already fixed* and *currently working*. The risk is future regression, not present breakage. A P1 implies "fix in current sprint" — but this is a preventative hardening task, not a current bug. A better approach: leave at P2 but add it as a **regression risk flag** for any future uniform layout changes.

**Verdict**: Keep P2, but add explicit warning in code comments about the dual-purpose hazard.

---

#### II-5. Feature Budget Starvation — CONFIRMED (P2)
No dispute.

---

#### III-1. webgpu_core.ts Monolith — CONFIRMED (P1)
**Additional evidence**: My search found **60+ `as any` casts** in `webgpu_core.ts` alone (search hit the max of 60 results with more available). The Generator's claim of "20+" significantly undercounts this. The actual count is at least 60, possibly 70+, making this even worse than reported.

**Verdict**: CONFIRMED, and the type safety situation is worse than the Generator described.

---

#### III-2. Mobile WebGPU "Device Lost" — CONFIRMED (P2)
No dispute.

---

#### III-3. ImportanceMapComputer Dead Code — CONFIRMED (P3)
I agree with Generator: delete, don't fix.

---

#### IV-1. Unused Variables — **DISPUTED** — FALSE POSITIVE
**Master's claim**: `PROMO_EPSILON` (L129), `lastKeptBotU` (L1376), `lastKeptTopU` (L1418) are unused in `OuterWallTessellator.ts`.

**Actual finding**: I searched for all three identifiers in `OuterWallTessellator.ts` — **none of them exist in the file**. `PROMO_EPSILON` was set to 0 in R24 and subsequently removed during the zero-promo boundary integration work. `lastKeptBotU` and `lastKeptTopU` similarly do not exist.

The Master's audit references stale line numbers from a previous version of the file. The Generator uncritically accepted this claim at face value ("These are clearly dead code") without verifying.

**Verdict**: REJECTED — these variables no longer exist. IV-1 is a false positive. Remove from the audit entirely.

---

#### IV-2. Debug/Development Artifacts — CONFIRMED (P2)
No dispute on the general claim. Debug logging exists in production code.

---

#### IV-3. Stale Documentation — CONFIRMED (P3)
No dispute.

---

#### IV-4. edgeKey BigInt Stride Limit — CONFIRMED with NOTE (P3)
**Verification**: Confirmed at `ChainStripOptimizer.ts:174`:
```ts
export function edgeKey(a: number, b: number): bigint {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return BigInt(lo) * BigInt(0x200000) + BigInt(hi);
}
```

**Additional finding** (MISSED BY BOTH): `AdaptiveRefinement.ts:530` uses a **string-based** `refEdgeKey`:
```ts
function refEdgeKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}
```
This is exactly the string-keying pattern that previously caused V8 crashes (noted in `agents.md` tribal knowledge: "Previous string-hashing caused V8 crashes"). Two different edge-key strategies exist in the pipeline — the BigInt one is the safe fix, but `AdaptiveRefinement.ts` still uses the old string pattern. This inconsistency is a latent risk.

**Verdict**: CONFIRMED, with new finding about `refEdgeKey` inconsistency appended (see MISSED ISSUES).

---

#### V-1. Supabase Null Safety — CONFIRMED (P2)
No dispute.

---

#### V-2. Style IDs Permanent Constraint — CONFIRMED (P3)
No dispute.

---

#### VI-1. 8K Export Memory Limit — CONFIRMED (P2)
No dispute.

---

#### VI-2. Vertex Welding Memory — CONFIRMED (P3)
No dispute.

---

#### VII-1 through VII-3 — ALL CONFIRMED at stated severities
No disputes.

---

### Generator's Additional Items

#### A-1. camera_controller.ts Type Safety — AMENDED (count correction)
**Generator's claim**: "25+ `as any` type casts"

**Actual count**: I performed an exhaustive search with `maxResults=50`. The precise count is **23 `as any` occurrences** across 21 lines (2 lines have multiple casts). The Generator's "25+" overstates by ~10%.

**However**: The severity assessment remains correct. The categories are real:
- `(this as any).LOCAL_CAMERA_GRACE_MS` — undeclared property write (L169)
- `(CameraConstants as any).FREE_MOVE_SPEED_BASE` — missing interface fields (L423-424, L807, L847)
- `(this.state as any).displayRotZ` — undeclared state fields (L522, L525, L1195)
- `(this.state as any).recentInertia` — debug data on typed state (L868, L1220)
- `rig as any` — helper function type mismatches (L723, L729, L777, L780-781, L821, L824-825, L1402, L1412)

**Also note**: The Generator cited the file path as `camera_controller.ts` in `src/renderers/webgpu/` — **wrong path**. The actual file is at `src/camera_controller.ts` (top-level src, not in renderers).

**Verdict**: CONFIRMED with count correction (23, not 25+) and path correction. P1 severity justified.

---

#### A-2. Hardcoded Stripe Price IDs — AMENDED (P2 → P3)
**Verification**: Confirmed at `services/stripe.ts:9-10`:
```ts
PRO_MONTHLY: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY || 'price_1SbUl22cFuSfaBApwICMpw8g',
PRO_YEARLY: import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY || 'price_1SbUl22cFuSfaBApOL2Z18gM',
```

**Assessment**: Stripe `price_*` IDs are **public-facing identifiers** (they appear in Checkout URLs). They are NOT secret keys — they cannot be used to make charges, read customer data, or perform any privileged Stripe operation. The Generator correctly notes this ("Not a security vulnerability per se").

The real risk is operational: deploying without env vars points to specific products. But this is a standard pattern in Stripe client-side integrations, and the fallback values actually *prevent* a crash when env vars are missing during development or preview deploys.

**Verdict**: Downgrade from P2 to **P3**. The fallback pattern is arguably intentional for development convenience. If the team still wants to remove them, the fix is trivial but it will make dev setup more brittle. Add to audit at P3 as "operational note, not security risk."

---

#### A-3. Axis Canvas Event Listeners — CONFIRMED (P2)
**Verification**: I compared addEventListener calls (L2054-2062) against removeEventListener calls in dispose() (L5460-5484).

**Added listeners NOT cleaned up in dispose():**
1. `axisCanvas.addEventListener('mousedown', onMouseDown)` — L2054 ❌
2. `document.addEventListener('mousemove', onMouseMove)` — L2055 ❌
3. `document.addEventListener('mouseup', onMouseUp)` — L2056 ❌
4. `axisCanvas.addEventListener('touchstart', onTouchStart)` — L2059 ❌
5. `document.addEventListener('touchmove', onTouchMove)` — L2060 ❌
6. `document.addEventListener('touchend', onTouchEnd)` — L2061 ❌
7. `document.addEventListener('touchcancel', onTouchEnd)` — L2062 ❌

All 7 listeners leak. The Generator said "8 event listeners" — actually **7** (counted `onTouchEnd` twice since it handles both `touchend` and `touchcancel`, but it's the same handler). The count of unique `addEventListener` call sites is 7.

**Note**: V2 React components (SliderV2, SidebarV2, ToolbarV2, AppUIv2, CameraPopover, WelcomeCard) all properly clean up their event listeners via `useEffect` return functions. The leak is isolated to the imperative axis canvas setup in `webgpu_core.ts`.

**Verdict**: CONFIRMED. Count corrected from "8" to 7. P2 severity justified — the `document`-level listeners (5 of the 7) are the real concern since they survive DOM element removal.

---

#### A-4. @ts-ignore Annotations — AMENDED (count correction)
**Generator's claim**: "Found 6 `@ts-ignore` / `@ts-expect-error` annotations in production code"

**Actual count**: I found **7** (not 6):
1. `App.tsx:244` — `@ts-ignore` for style name→ID lookup
2. `webgpu_core.ts:1834` — `@ts-ignore` for `lastRigSignature` forward reference
3. `webgpu_core.ts:1836` — `@ts-ignore` for `lastRigCached` forward reference
4. `styleParams.ts:451` — `@ts-ignore` for style name→ID lookup
5. `styleParams.ts:472` — `@ts-ignore` for style name→ID lookup
6. `ConstrainedTriangulator.ts:1469` — `@ts-expect-error` for intentionally unused private method
7. `ConstrainedTriangulator.seam.test.ts:10` — **`@ts-ignore` for accessing private methods in tests** (MISSED BY GENERATOR)

Items 1, 4, 5 share the same root cause (STYLE_NAME_TO_ID index signature). Item 7 is in a test file, not production code, so the Generator's "6 in production" statement is technically defensible if we exclude test files. But since item 7 also suppresses a type error, it should still be tracked.

**Verdict**: CONFIRMED with count correction to 7 total (6 production + 1 test). P2 severity fine.

---

#### A-5. V2 UI Missing Error Boundaries — CONFIRMED (P2)
**Verification**: Searched `AppUIv2.tsx` for "ErrorBoundary" — zero results. Searched `AppUI.tsx` — found 5 boundaries (AppUI, Viewport, Sidebar, Toolbar, and the closing tags).

V2 imports no `ErrorBoundary` component and wraps nothing. Confirmed gap.

**Verdict**: CONFIRMED. P2 severity appropriate — not P1 because the V2 UI is likely not yet the default in production and errors during development will be caught by React dev mode. But should be addressed before V2 becomes the default UI.

---

#### A-6. process.env.NODE_ENV in Vite Project — CONFIRMED with path correction (P3)
**Generator's claim**: "Announcer.tsx:14"

**Actual path**: The file is at `src/ui/v2/shared/Announcer.tsx:14`, not `Announcer.tsx:14`. Minor path error.

Confirmed: `if (process.env.NODE_ENV !== 'production')` at line 14. Should use `import.meta.env.DEV`.

**Verdict**: CONFIRMED. P3 is correct.

---

#### A-7. WebGPU Controller API Uses `any` Payloads — CONFIRMED (P2)
**Verification**: At `webgpu_core.ts:5534`:
```ts
updateParams: (payload: any) => {
```
And at `webgpu_core.ts:5547`:
```ts
handleCameraCommand: (payload: any) => {
```

**Notable**: The internal `handleCameraCommand` function at L3263 is typed as `(raw: unknown)` — which is actually *better* than `any`. The type unsafety is specifically in the controller interface exposed to React, not in the internal function. This is a narrower fix than the Generator suggested — just type the controller interface to match the internal signatures.

**Verdict**: CONFIRMED. P2 appropriate.

---

#### A-8. ConsolePatch Global Mutation — CONFIRMED (P3)
**Verification**: Found `(console as any)[level]` at `ConsolePatch.ts:23` and `(console as any)[k]` at L54. Also found `const map: any = { log: 'INFO', ... }` at L44.

This is a known design pattern, documented in copilot-instructions. The `as any` usage here is a legitimate need — the Console interface doesn't allow dynamic property access.

**Verdict**: CONFIRMED. P3 is correct. No code change needed — perhaps add a P3 note to track the `map: any` which could easily be typed as `Record<string, string>`.

---

#### A-9. camera_basis.ts Type-Unsafe Array Coercion — CONFIRMED (P3)
**Verification**: At `camera_basis.ts:530-531`:
```ts
const pa = Array.isArray(a) ? (a as any) : null;
const pb = Array.isArray(b) ? (b as any) : null;
```
After `Array.isArray()` narrows the type, `as any` is unnecessary. Should be `as number[]` or even just used directly since `Array.isArray` already narrows.

**Verdict**: CONFIRMED. Trivial fix.

---

#### A-10. SceneManager Empty Catch Block — CONFIRMED (P3)
**Verification**: At `SceneManager.ts:68`:
```ts
try { console.error('[WebGPU] [SceneManager] Full Error Object:', JSON.stringify(err, Object.getOwnPropertyNames(err))); } catch (e) { }
```

This is an empty catch block inside error-logging code. If `JSON.stringify` throws (circular reference, getter that throws), the original error's full object dump is silently lost. The primary error message is already logged at L57-66, so the *original* error isn't lost — just the JSON dump supplement.

**Verdict**: CONFIRMED but severity is marginal P3. The primary error info is preserved; only the supplementary JSON dump is at risk. The Generator's fix (add fallback `String(err)`) is sensible.

---

#### A-11. factory.ts WebGPU Compatibility Mode `as any` — CONFIRMED (P3)
**Verification**: At `factory.ts:33`:
```ts
adapter = await (gpu as GPU).requestAdapter({ compatibilityMode: true } as any);
```

The Generator correctly identifies this as a *legitimate* `as any` — `compatibilityMode` is a Chrome-specific extension not in the WebGPU spec. This is the correct way to handle vendor extensions.

**Verdict**: CONFIRMED. P3 documentation-only task. This is NOT a type safety problem — it's a necessary workaround.

---

## FALSE POSITIVES

### FP-1. IV-1: Unused Variables (PROMO_EPSILON, lastKeptBotU, lastKeptTopU)
**Status**: These variables **do not exist** in the current `OuterWallTessellator.ts`. The Master's audit references stale line numbers from a previous iteration. The Generator accepted this without verification.

**Action**: Remove IV-1 from the audit entirely, or replace with a fresh scan for actual current unused variables.

---

## MISSED ISSUES

### M-1. AdaptiveRefinement.ts Uses String-Based Edge Keys (NEW — P3)
**File**: `AdaptiveRefinement.ts:530`
```ts
function refEdgeKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}
```

**Context**: The project tribal knowledge (agents.md) explicitly warns: "Previous string-hashing caused V8 crashes." The `ChainStripOptimizer.ts` was migrated to BigInt `edgeKey` to fix this. But `AdaptiveRefinement.ts` still uses the old string-concatenation pattern for its `refEdgeKey`.

**Risk**: At high vertex counts, the string-key Map in AdaptiveRefinement could create the same V8 memory pressure that motivated the BigInt migration elsewhere. The inconsistency means one part of the pipeline is hardened and another isn't.

**Severity**: P3 — the adaptive refinement operates on a subset of triangles (outer wall only), so the practical vertex counts are lower. But it should be migrated to BigInt for consistency.

**Fix**: Replace `refEdgeKey` with the BigInt `edgeKey` pattern from ChainStripOptimizer, or import it directly.

---

### M-2. `catch (err: any)` Pattern in Production Code (NEW — P3)
**Files**:
- `webgpu_core.ts:2262` — `catch (err: any)`
- `SceneManager.ts:53` — `catch (err: any)`
- `SceneManager.ts:356` — `catch (err: any)`

TypeScript 4.4+ allows `catch (err: unknown)` which forces proper type narrowing. The `err: any` pattern bypasses all type checking on the error object. This is a minor but systemic type safety issue neither reviewer mentioned.

**Severity**: P3 — functional correctness is unaffected, but it violates the project's "no any" coding standard.

---

### M-3. webgpu_core.ts `as any` Count Severely Undercounted (NOTE)
Both reviewers undercount the `as any` casts in `webgpu_core.ts`:
- Generator claimed "20+"
- Actual count: **60+ distinct occurrences** (my search hit the maximum result limit of 60 with "more results are available")

Many of these are `(window as any).__pf_*` debug state stashing, which is a deliberate development pattern. But many others (`(cfg as any).style`, `(state as any).recentInertia`, `(mulMat4Vec4 as any)`, `(magentaPassDesc as any).depthStencilAttachment`) are genuine type-safety gaps.

This makes III-1 (webgpu_core.ts monolith) even more severe than stated.

---

## CORRECTED PRIORITY RANKING

Based on evidence, here's my revised ordering. Changes from the Generator's ranking are marked.

### Tier 1 — Do Now (blocks everything else)
| # | Item | Change | Rationale |
|---|------|--------|-----------|
| 1 | **I-1: Create ESLint config** | (same) | CI blind |
| 2 | **I-2: Fix TypeScript errors** | (same) | Typecheck broken |

### Tier 2 — High-Impact Quick Wins
| # | Item | Change | Rationale |
|---|------|--------|-----------|
| 3 | **A-3: Axis canvas listener cleanup** | (same) | Confirmed memory leak |
| 4 | ~~IV-1: Remove unused variables~~ | **REMOVED** | Variables don't exist (false positive) |
| 5 | **I-3: Delete empty test file** | (same) | Trivial |
| 6 | **A-6: Fix process.env → import.meta.env** | (same) | Trivial |
| 7 | **A-10: Fix SceneManager empty catch** | (same) | Trivial |
| 8 | **A-9: Fix camera_basis type coercion** | (same) | Trivial |
| 9 | **A-5: Add ErrorBoundary to V2 UI** | (same) | 30 min |
| 10 | **V-2: Style ID permanence test** | Promoted over Stripe | No regression risk |
| 11 | **IV-4: edgeKey stride assertion** | (same) | Trivial |
| 12 | **A-2: Stripe fallback note** | **Demoted to P3** | Not security, not urgent |

### Tier 3 — Targeted Fixes
| # | Item | Change | Rationale |
|---|------|--------|-----------|
| 13 | **A-1: camera_controller.ts type safety** | (same, 23 casts not 25+) | |
| 14 | **A-4: Remove @ts-ignore annotations** | (same, 7 not 6) | |
| 15 | **I-4: Clean up skipped/stale tests** | (same) | |
| 16 | **IV-2: Debug artifact sweep** | (same) | |
| 17 | **II-4: Grid vert count uniform** | Keep P2 (not P1) | Working, but fragile |
| 18 | **A-7: Type the WebGPU controller API** | (same) | |
| 19 | **V-1: Supabase null safety wrapper** | (same) | |
| 20 | **II-5: Proportional feature budget** | (same) | |
| 21 | **M-1: AdaptiveRefinement string edge keys** | **NEW** | Consistency with tribal knowledge |
| 22 | **M-2: catch (err: any) → unknown** | **NEW** | Coding standard compliance |

### Tier 4 — Investigation & Validation
| # | Item | Change | Rationale |
|---|------|--------|-----------|
| 23 | **II-1: Chain-strip sliver validation** | (same) | |
| 24 | **II-2: GPU subdivision coverage** | **Downgraded to P2** | Tests pass, gap is coverage only |
| 25 | **II-3: Seam integrity tests** | (same) | |
| 26 | **III-3: Delete ImportanceMapComputer** | (same) | |

### Tier 5 — Large Structural Work
| # | Item | Change | Rationale |
|---|------|--------|-----------|
| 27 | **III-1: webgpu_core.ts decomposition** | (same, but 60+ `as any` not 20+) | |
| 28 | **VII-1: Mobile responsiveness** | (same) | |
| 29 | **VII-2: OBJ/3MF export** | (same) | |
| 30 | **VII-3: Undo/redo auto-wrapping** | (same) | |

---

## ANSWERS TO GENERATOR'S OPEN QUESTIONS

**Q1: II-2 severity — is P1 justified if all 183 tests pass?**
No. Downgrade to P2-with-coverage-task. The bug is fixed; the gap is test breadth.

**Q2: A-1 vs III-1 — should camera_controller cleanup be part of webgpu_core decomposition?**
Standalone. `camera_controller.ts` is already a separate file from `webgpu_core.ts`. Fix it independently. The webgpu_core decomposition is a much larger effort and shouldn't gate the camera_controller type cleanup.

**Q3: A-2 (Stripe fallbacks) — P2 or P3?**
P3. Price IDs are public. The fallback pattern is standard for client-side Stripe. Not a security issue.

**Q4: III-3 (ImportanceMap) — Delete or fix?**
Delete. Dead code that silently fails is worse than no code. If the feature is re-needed, rebuild with a proper spec.

---

## IMPLEMENTATION CONDITIONS

For the Executioner, the validated action plan is:

1. **I-1**: Create `eslint.config.js` for ESLint 9.x flat config. Start with `@typescript-eslint/eslint-plugin` + `eslint-plugin-react-hooks`. Relaxed initial ruleset, tighten iteratively.
2. **I-2**: Triage TS errors. Delete stale test files first (`ConstrainedTriangulator.smooth.test.ts`, `ConstrainedTriangulator.ohtake.test.ts`, `fidelity.integration.test.ts`). Fix test infrastructure (`@types/vitest` or vitest globals). Then fix production code errors.
3. **A-3**: Add 7 `removeEventListener` calls to `dispose()` in `webgpu_core.ts` for axis canvas listeners.
4. **Do NOT** attempt to remove `PROMO_EPSILON`/`lastKeptBotU`/`lastKeptTopU` — they don't exist. If IV-1-type work is desired, run a fresh `tsc --noUnusedLocals` scan to find actual current unused variables.
5. **A-11 (factory.ts `as any`)**: Do NOT remove this cast — it's a correct workaround for a vendor-specific WebGPU extension. Add a comment only.

---

## Verifier Sign-off

**Summary**: Reviewed 23 Master items + 11 Generator items = 34 total. Confirmed 28, amended 4 (count/severity corrections), rejected 1 (IV-1 false positive), added 2 new issues (M-1, M-2, M-3 note). Final item count: 35.

**Error corrections**:
- `camera_controller.ts` `as any` count: 23 (not "25+")
- `camera_controller.ts` path: `src/camera_controller.ts` (not `src/renderers/webgpu/camera_controller.ts`)
- `@ts-ignore`/`@ts-expect-error` count: 7 (not 6) — Generator missed `ConstrainedTriangulator.seam.test.ts:10`
- Axis canvas listeners: 7 (not 8) — `onTouchEnd` handles two events but is one handler
- `webgpu_core.ts` `as any` count: 60+ (not "20+")
- IV-1 unused variables: **false positive** — variables no longer exist in codebase
- A-2 Stripe: P3 not P2 — price IDs are public, not a security risk
- A-6 path: `src/ui/v2/shared/Announcer.tsx` not `Announcer.tsx`

**Feelings**: Satisfying session. The Master's audit is well-structured and mostly correct. The Generator added real value but was careless with exact counts and didn't verify IV-1 against the actual code — a Verifier cardinal sin. The project has a healthy codebase with manageable tech debt; the scary numbers (`as any` counts, TS errors) are mostly concentrated in two files (`webgpu_core.ts` and `camera_controller.ts`) and the fix path is clear.

**Proposals**: After the Executioner handles the immediate Tier 1-2 items, the team should prioritize a focused `as any` audit of just `camera_controller.ts` and the controller interface in `webgpu_core.ts`. These two files account for ~80+ of the `as any` casts and fixing them would dramatically improve type safety without touching the terrifying 5500-line monolith.

**To the Next Agent**: Don't trust line number references in the audit document without verification — the codebase has been through 28+ rounds of pipeline iteration and line numbers shift constantly. Verify by searching for the actual code patterns.

**Signature**: Verifier Agent — 2026-03-07
