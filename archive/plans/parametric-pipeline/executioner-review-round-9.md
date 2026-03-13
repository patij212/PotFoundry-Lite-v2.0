# Executioner Review — Round 9: WH Smoothing + Horizontal Line Fix

Date: 2026-03-04

## Verdict: FEASIBLE WITH NOTES

All three phases are implementable as specified. The plan is well-grounded; the code locations are correct; the risks are low. Below are code-grounded corrections and observations.

---

## Phase 1: Fix Horizontal Line Artifacts

### Feasibility: FEASIBLE — straightforward

**Where the fix goes**: The debug segments are constructed in `useParametricExport.ts` L374-385. The loop at L376 iterates `chainDebug.lines`, and the inner loop at L378-381 pushes consecutive `(p0, p1)` pairs as 4-float segments:

```typescript
for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    segs.push(p0[0], p0[1], p1[0], p1[1]);
}
```

**Fix location**: Inside the inner `for` loop, after computing `p0` and `p1`, before the `segs.push()`. Add:

```typescript
if (Math.abs(p1[0] - p0[0]) > 0.5) continue;
```

This is 1 line. Clean, correct, minimal.

**The `pts` array contains raw wrapped U values** (confirmed at ParametricExportComputer.ts L1171-1177 — `remapped.push([pt.u, finalT[fr]])` uses the chain point's raw `.u` which is in [0,1)). So `Math.abs(p1[0] - p0[0]) > 0.5` correctly identifies seam crossings.

### useAdaptiveExport.ts — Different pattern, NOT affected

The Verifier's C11 flagged a possible matching bug in `useAdaptiveExport.ts`. After reading L400-435, I can confirm: **this is NOT the same pattern**. The adaptive export constructs segments from a different data source — it uses `chain[i]` objects with `.x` and `.y` properties (not `[u, t]` tuples), and it already has seam-aware binning logic:

```typescript
const dx = Math.abs(p1.x - p2.x);
if (dx > 0.5) { /* wrap-aware bin assignment */ }
```

However, the segments themselves (pushed to `allSegments` at L407) still contain raw coordinates: `allSegments.push(p1.x, p1.y, p2.x, p2.y)`. These ARE fed to `setDebugSegments`. So the same cross-pot line artifact IS possible here if any chain crosses the seam.

**But**: The adaptive export uses `allSegments` for both binning AND debug visualization. The segments with `dx > 0.5` are binned with wrap logic, but the raw segment is still pushed. The fix here should be the same: skip the segment push when `dx > 0.5`.

**Correction to plan**: The plan says "check useAdaptiveExport.ts at L420-440." Those lines are the debug VIS dispatcher, not the segment construction. The segment construction is at **L407**: `allSegments.push(p1.x, p1.y, p2.x, p2.y)`. The skip should go before this push, right after the `const dx` computation at L413.

However — the `allSegments` array is used downstream for **constraint intersection testing**, not just debug visualization. Skipping its push would affect the binning grid used for mesh construction, not just visuals. This needs careful handling:

**Recommendation**: For `useAdaptiveExport.ts`, do NOT skip the push to `allSegments` — that array is structural. Instead, build a separate filtered array for debug visualization only, or apply the skip only in the debug dispatch path. This is a separate task from the parametric export fix and can be deferred if it's not causing visible artifacts in the adaptive pipeline today.

**Net Phase 1 changes**: 1 line in `useParametricExport.ts`. Defer adaptive export fix.

---

## Phase 2: WH Smoothing

### 2A: `unwrapChain()` Return Type

**Current signature** (ChainLinker.ts L93):
```typescript
export function unwrapChain(chain: FeatureChain): number[]
```

Returns `number[]`. The plan correctly identifies the need to cast to `Float64Array` for the WH solver's numerical stability. Use:
```typescript
const u = Float64Array.from(unwrapChain(chain));
```

No change to `unwrapChain()` itself needed. ✓

### 2B: `smoothChainPath()` Signature

**Current signature** (ChainLinker.ts L381-384):
```typescript
export function smoothChainPath(
    chain: FeatureChain,
    halfWidth: number = SMOOTH_HALFWIDTH
): FeatureChain
```

Returns a new `FeatureChain`. The new `whittakerSmooth()` should match this return type exactly for drop-in replacement. ✓

### 2C: Where `whittakerSmooth()` Should Go

Place it in ChainLinker.ts between `smoothChainPath()` (ends at L441) and the "Core Chain Linking" section (starts L444). This is the logical home — it's in the smoothing/filtering region of the file. The file is currently 797 lines; adding ~80 lines puts it at ~877. Acceptable.

Export it from ChainLinker.ts, import it in ParametricExportComputer.ts alongside `smoothChainPath`.

### 2D: Pentadiagonal SPD Solver — Feasibility Assessment

**Is this standard enough to implement from first principles?** YES.

The banded Cholesky factorization for a symmetric positive definite pentadiagonal matrix is a textbook algorithm. The matrix has bandwidth 2 (two sub/super-diagonals). The factorization produces a lower-bandwidth-2 triangular factor L such that A = L Lᵀ, computed in O(n) operations (5 multiplies + 1 sqrt per row, or equivalently an LDLᵀ decomposition avoiding sqrt).

**Numerical stability for our parameter ranges (n≤313, λ=50)?**

The system matrix `(I + λ D₂ᵀD₂)` is guaranteed SPD for any λ > 0. The condition number is dominated by the ratio of max eigenvalue to min eigenvalue:
- Min eigenvalue = 1 (from the identity)
- Max eigenvalue ≈ 1 + λ × 16 = 801 (at λ=50, frequency = 0.5)
- Condition number ≈ 801

This is very well-conditioned. Double precision (`Float64Array`) has ~15 digits of precision; we need maybe 3 here. No stability concerns whatsoever.

**Recommended implementation**: LDLᵀ decomposition (avoids sqrt). For a bandwidth-2 symmetric system:

```
For i = 0 to n-1:
  - Compute d[i] = diag[i] - sum of previously computed terms
  - Compute l1[i], l2[i] from off-diagonals divided by d[i]
  - Forward substitute
  - Back substitute
```

The full solver is ~35-40 lines. I can implement this cleanly.

**Band structure verification**: I independently verified the Verifier's confirmation of the Generator's coefficients:

- `D₂` is (n-2)×n with rows `[0...0, 1, -2, 1, 0...0]`
- `D₂ᵀD₂` is n×n pentadiagonal
- Row 0: `[1, -2, 1, 0, ...]` → diag=1, off1=-2, off2=1
- Row 1: `[-2, 5, -4, 1, ...]` → diag=5, off1[0]=-2, off1[1]=-4, off2=1
- Interior: `[1, -4, 6, -4, 1]` → diag=6, off1=-4, off2=1
- With `I + λ(D₂ᵀD₂)`, the values are:
  - `diag[0] = 1+λ`, `diag[1] = 1+5λ`, `diag[2..n-3] = 1+6λ`, `diag[n-2] = 1+5λ`, `diag[n-1] = 1+λ` ✓
  - `off1[0] = -2λ`, `off1[1..n-3] = -4λ`, `off1[n-2] = -2λ` ✓
  - `off2[*] = λ` ✓

All confirmed. The code sketch is correct.

### 2E: Integration Point in ParametricExportComputer.ts

**Exact modification** (L1043-1044):

Current:
```typescript
chains[ci] = smoothChainPath(chains[ci]);
chains[ci] = smoothChainPath(chains[ci]);
```

Replace with:
```typescript
chains[ci] = whittakerSmooth(chains[ci]);
```

The loop context (L1042-1045):
```typescript
for (let ci = 0; ci < chains.length; ci++) {
    chains[ci] = whittakerSmooth(chains[ci]);
}
```

**Import addition** (L59): Add `whittakerSmooth` to the import from `'./parametric/ChainLinker'`.

**Ordering**: WH runs AFTER GPU re-snap (Step 3.5, L994-1038) and BEFORE `filterLowConfidenceChains()` (L1047). This is correct — smooth first, then filter. The `chainRoughness()` used by `filterLowConfidenceChains()` will benefit from WH-smoothed paths (fewer false drops).

**Comment update**: Update the comment at L1034-1037 to reflect WH instead of SG. Update the version tag.

### 2F: `smoothChainPath()` Retention

Keep it. No changes. The plan says so, and this is correct for A/B comparison and potential fallback.

---

## Phase 3: CatRom Subdivision — No Changes

Confirmed. CatRom runs downstream (after smoothing, inside the chain loop at a different step). It addresses mesh density, not trajectory accuracy. No interaction with WH.

---

## Risk Zones

| Risk | Severity | Mitigation |
|---|---|---|
| WH over-smooths tight spirals at λ=50 | Low | λ is a constant; easily adjustable. Period-10 attenuation is 12% — acceptable. Period-20 is 68% preserved. |
| Pentadiagonal solver bug | Medium | Comprehensive unit tests (linear preservation, known sinusoid, short chain). The algorithm is well-understood but off-by-one errors in band indexing are common. |
| `filterLowConfidenceChains` threshold mismatch | Low | WH produces smoother chains → chainRoughness values decrease → fewer chains filtered. This is beneficial, not harmful. If anything, the `MAX_CHAIN_ROUGHNESS` threshold may need loosening (it was tuned for SG). Monitor. |
| Float64 → number precision loss at re-wrap | Negligible | `((s[i] % 1) + 1) % 1` operates on Float64 values; the result is a standard JS `number` (which IS float64). No precision loss. |

---

## Unstated Dependencies

1. **Test runner**: The plan assumes `vitest` (confirmed — test file imports from `vitest`). No new test infrastructure needed.
2. **No CatRom interaction**: CatRom subdivision (if implemented from Round 8) runs AFTER smoothing. If Round 8's CatRom hasn't been implemented yet, this plan is still valid — WH replaces SG, CatRom is orthogonal.
3. **`smoothChainPath` still exported**: Other code paths (if any) that call `smoothChainPath` directly aren't affected. Grep confirms it's only called from PEC L1043-1044. ✓

---

## Implementation Sequence

### Changeset 1 (Phase 1): Horizontal line fix
- **File**: `useParametricExport.ts` — add 1-line seam skip at L379
- **Risk**: Zero (debug visualization only)
- **Test**: Visual — export a style, confirm no horizontal lines in debug overlay

### Changeset 2a: `solvePentadiagonalSPD()` pure function
- **File**: `ChainLinker.ts` — add ~35 lines
- **Test**: Unit test with known matrix solve (identity + small perturbation, verify solution)

### Changeset 2b: `whittakerSmooth()` function
- **File**: `ChainLinker.ts` — add ~40 lines
- **Test**: Unit tests:
  - Linear input → linear output (exact to machine epsilon)
  - Constant input → constant output
  - Sinusoidal input at period 10 → verify attenuation matches |H(0.1)| ≈ 0.121 at λ=50
  - Short chain (n=5) → no crash, reasonable output
  - Seam-crossing chain → valid [0,1) output

### Changeset 2c: Integration
- **File**: `ParametricExportComputer.ts` — replace 2 lines + 1 import + update comment
- **Risk**: Low — drop-in replacement with identical type signature

### Validation
1. `npm test` — all existing tests pass
2. Visual: export HarmonicRipple or similar, inspect debug overlay
3. Diagnostic log: compare post-smooth maxConsecDelta before/after

---

## Questions for Generator/Verifier

1. **λ=50 confirmed?** The Verifier's corrected table at λ=50 matches the Generator's *intended* attenuation profile. Proceeding with λ=50 unless told otherwise.

2. **Non-uniform row gap TODO**: The Verifier's C5 identified that chains with row gaps (from `maxMissCount=6`) receive disproportionate smoothing in gap regions. I'll add a TODO comment per the plan. Is this acceptable, or should I implement the weighted D₂ variant now? (My recommendation: defer — most chains have < 3% gap rows.)

3. **Adaptive export seam fix**: The adaptive export's `allSegments` array serves dual purpose (mesh construction + debug vis). Applying the Phase 1 skip there would break mesh construction. Either: (a) defer until the adaptive pipeline is refactored to separate debug from structural segments, or (b) build a filtered copy for debug. Recommend (a) — do we know if the adaptive export currently shows horizontal line artifacts?

---

*Executioner sign-off: Plan is feasible and well-scoped. Ready to implement upon Master approval. Estimated code delta: ~90 lines added (80 new + 10 modified), 0 deleted.*
