# E-2026-07-10-INTHASH — pre-registration

> Dev-only feasibility spike. UNWIRED — no production code (`src/`) is touched. Only
> `research/bridge/_voronoi_inthash*` and `research/lab/E-2026-07-10-INTHASH*` are created/modified,
> plus data under `research/exchange/_inthash/` (gitignored — `research/.gitignore:3` covers `exchange/`).

## FRAME

E-2026-07-09-VORONOI-TRUTHBRIDGE (verdict commit registry §6052) REFUTED the per-op `Math.fround`
f32-emulation hypothesis: f32-emulated CPU truth improved p99 only 1.21× (0.06506→0.05378mm), nowhere
near the ≥5× PARTIAL bar. Its decisive additional finding was the **divergence-locus classification**:
0/500 of the worst-by-f64 vertices showed ANY material f1/f2 cell-argmin difference between f64 and
f32-emulated evaluation at the identical (theta,z) input — the two CPU-side precisions AGREE with each
other and disagree with the real GPU by the same ~0.05–0.14mm margin. The leading remaining mechanism:
GPU driver FMA/fused-multiply-add contraction or non-strict-IEEE fast-math — WGSL does not mandate
per-operation IEEE rounding or forbid instruction fusion, so a fused `a*b+c` (one rounding instead of
two) is not reproducible by naive post-hoc `Math.fround` emulation on CPU. That arm's own redirect
named two routes forward, both of which bypass FMA-nondeterminism instead of trying to out-predict it:
(a) certify reflexively against the GPU's own output, or (b) replace the floating-point hash chain with
an **integer-exact hash** (PCG/Wang on integer cell coordinates) that has no floating-point rounding
path to diverge on, matching bit-for-bit on any IEEE-754-compliant device by construction. This spike
is route (b).

## DESIGN UNDER TEST

`research/bridge/_voronoi_inthash_lib.ts` (new, self-contained — mirrors the
`_voronoi_truthbridge_lib.ts` Round-parameterized pattern; does not modify `src/geometry/styles.ts` or
`src/assets/shaders/styles.wgsl`):

- Cell id from `floor(u,v)` as before (unchanged — this is exact in both f32 and f64 for the operand
  ranges in play, not a source of divergence).
- The **hash** operates on **integer** cell coordinates using pure u32/i32 arithmetic (PCG2D), realized
  in JS via `Math.imul` + `>>>0` so every intermediate is coerced to an exact u32 at each step — bit-
  identical to a WGSL `u32` port by construction (WGSL integer arithmetic IS exact/wrapping per the
  spec, unlike its float arithmetic).
- **Hash → jitter float conversion**: `(h >>> 8) * 2**-24` — a dyadic rational (24 significant mantissa
  bits, exponent a power of two) that is EXACTLY representable in both f32 (24-bit mantissa incl.
  implicit leading 1) and f64 — by construction the hash→float boundary itself contributes zero
  rounding divergence between precisions.
- Downstream geometry (distance argmin over the 3×3 neighborhood, smoothstep web/bubble blend, edge
  fade) is kept IDENTICAL in structure to `rOuterVoronoi`/`periodicCellular` — only the hash primitive
  and the jitter-float derivation change. This isolates the experiment to exactly the mechanism under
  test.
- Round-parameterized evaluation (F64 identity vs. F32 per-op `Math.fround`) for the downstream float
  chain, reusing the truthbridge lib's `Round` pattern, so the SAME int-hash algorithm can be evaluated
  at both precisions for the determinism gate.

## HYPOTHESES (falsifiable)

- **H1 (core claim — determinism by construction):** across a large adversarial sweep including dense
  bands straddling cell boundaries, the int-hash's u32 outputs, the derived jitter floats, AND the
  resulting cell-argmin selection (winning neighbor for f1 and f2) are BIT-IDENTICAL between F64 and
  F32-emulated evaluation — because the hash itself has no floating-point rounding path, and the
  hash→float conversion is exact in both precisions.
- **H2 (control contrast):** the SAME adversarial boundary-band sweep, run through the EXISTING
  float-hash chain (`rOuterVoronoiF32`/`rOuterVoronoiF64Ref`/`cellArgminBothPrecisions` from
  `_voronoi_truthbridge_lib.ts`, imported READ-ONLY), shows what the int-hash design fixes — reported
  honestly whichever way it lands (the truthbridge arm found 0/500 flips at the ARTIFACT's actual worst
  vertices; an adversarial boundary-band sweep is a different, harder sampling regime and may or may
  not find flips the artifact sampling missed).
- **H3 (perf):** the int-hash chain is not meaningfully slower than the existing float-hash chain
  per-eval (integer PCG hashes are typically CHEAPER than the `fract(p*0.1031...)` scramble — no
  transcendental-adjacent fract/dot chain, pure imul+shift).
- **H4 (visual/statistical):** the int-hash field at DEFAULT_VORONOI produces a completely different
  cell LAYOUT (different hash ⇒ different jittered centers ⇒ different cell boundaries) but matching
  aggregate STATISTICS (cell-size distribution, jitter spread) to the existing float-hash field — i.e.
  it is "a different but equally valid" Voronoi pattern, not a degenerate one (e.g. all-zero jitter,
  striping, clustering artifacts).

## MEASUREMENTS (planned)

1. **DETERMINISM GATE** (core claim, H1): ≥2,000,000 (theta,z) samples, including dense bands sampled
   within ±1e-4 of integer cell lines in the scaled (u,v) domain. Report: count of bit-diffs in raw
   hash u32 output, count of bit-diffs in derived jitter floats, count of argmin-selection flips (f1
   AND f2 winning-neighbor index) — target EXACTLY 0 for all three. Also report max
   |f1_f64 − f1_f32| and max |f2_f64 − f2_f32| over the full sweep (expected ~1e-7-class smooth-
   function float noise from the downstream distance/smoothstep chain, NOT O(cell) jumps — this is a
   secondary sanity check, not the gate itself, since H1's bit-identity claim is stronger than a small-
   delta claim) and max |radius_f64 − radius_f32| in mm at DEFAULT_VORONOI/H120/Rb40/Rt50 scale.
2. **A/B CONTROL** (H2): identical boundary-band sweep through the existing float-hash chain. Report
   its argmin-flip count + max radius delta on the same adversarial bands.
3. **PERF** (H3): ns/eval benchmark, old float chain vs. new int chain, ≥10M evals each, Node single
   thread, warmed (discard a warmup batch before timing).
4. **VISUAL PACK** (H4): (u,t) relief-field grayscale render, OLD vs NEW, at DEFAULT_VORONOI,
   1024×1024, written to `research/exchange/_inthash/` (PPM — no external PNG encoder dependency
   audited yet; note format actually used in the verdict). Accompanied by a written description of the
   visual difference (cell layout expected to differ completely; statistics expected to match) — not
   only images.
5. **WGSL PORT**: exact WGSL fn bodies (`hash_pcg2d` + `periodic_cellular_int`) mirroring the JS
   bit-for-bit, included in the verdict as text. UNWIRED — not added to any `.wgsl` file in `src/`.

## KILL CRITERIA (committed BEFORE measuring)

- **Any nonzero bit-diff** in hash output, jitter floats, OR argmin selection between F64 and
  F32-emulated evaluation (measurement 1) ⇒ the design FAILS its own core claim (H1). Iterate the
  hash→float conversion **once** (one retry, one alternative derivation attempt). If still nonzero
  after that one iteration ⇒ **REFUTED** — report exactly which stage (hash u32, jitter float, or
  argmin) first shows divergence, with a minimal reproducing (theta,z) input.
- **Perf**: int chain slower than the float chain by **>1.5×** ⇒ note it explicitly in the verdict —
  this does NOT kill the correctness claim (H1 stands or falls on its own gate) but is a material input
  to the user's style-versioning decision and must not be buried.
- Scope discipline: DEV-ONLY. No `src/` edit under any outcome. A CONFIRMED result packages evidence
  for a user decision (whether to version/replace the Voronoi hash in production) — it does not itself
  authorize a production change.

## LEDGER (to be filled at verdict)

- Lib: `research/bridge/_voronoi_inthash_lib.ts`
- Probe: `research/bridge/_voronoi_inthash.test.ts` (env `PF_INTHASH=1`)
- Config: `vitest.voronoi_inthash.config.ts`
- Data: `research/exchange/_inthash/` (gitignored)
- Pre-reg commit: 899238b0
- Verdict commit: [this]

---

## VERDICT (measured 2026-07-10)

**H1 CONFIRMED (with an important measurement-methodology correction reported below).
H2/H4 CONFIRMED. H3 CONFIRMED (int chain FASTER, not merely non-slower).**

### The core result

Across **2,000,000 (theta,z) samples** — 1,500,000 random-coverage + 500,000 deliberately
adversarial, sampled within **±1e-4 of integer cell lines in the scaled (u,v) domain** — the
int-hash chain's **winning ABSOLUTE PHYSICAL CELL** (for both f1 and f2) is **BIT-IDENTICAL between
F64 and F32-emulated evaluation: 0/2,000,000 diffs.** The raw PCG2D hash output is bit-identical
across 200,000 domain samples (0 diffs), and by construction (no `Round` parameter anywhere in
`hash22Int`/`pcg2d`/`u32ToUnitFloat`) this generalizes to the full u32 domain, not just the sampled
subset. Max radius delta F64 vs. F32-emulated at DEFAULT_VORONOI/H120/Rb40/Rt50 scale:
**2.922e-5 mm** — five orders of magnitude below the 0.01mm certification target, and consistent
with ordinary smooth-function float noise (max |f1_f64−f1_f32| = 5.78e-7, max
|f2_f64−f2_f32| = 5.79e-7 normalized units), not a cell-boundary jump.

### Methodology correction (reported honestly, not smoothed over — two iterations, both informative)

The pre-registration's kill criteria permitted "iterate the hash→float conversion once" if the
first design showed a nonzero diff. In practice **two iterations were needed, and both found bugs
in the TEST'S invariant, not in the design's hash→float conversion** — worth stating precisely
since it changes what "iterate" meant in execution vs. what was anticipated in the prereg:

- **Iteration 1** (first design): gated on `f1===f1`/`f2===f2` FLOAT VALUE equality between F64 and
  F32-emulated `CellResult`. Result: **2,000,000/2,000,000 "diffs"** — but max delta was only
  ~5.8e-7, five orders below any cell-boundary-scale jump. Root cause: the downstream
  distance/sqrt/smoothstep chain still runs through per-op `Math.fround` rounding on the F32 side
  EVEN WITH bit-identical hash inputs — ordinary last-ULP float noise on otherwise-identical
  arithmetic, ordinary and expected (the prereg itself predicted "~1e-7-class smooth-function noise"
  as the SECONDARY metric — the bug was conflating that expected noise with the PRIMARY claim in one
  counter).
- **Iteration 2**: switched the gate to compare the winning neighbor's **RASTER INDEX** (0..8,
  position relative to the local `cellId` origin) instead. Result: **104/2,000,000 diffs**
  (0.0052%), concentrated in the adversarial boundary-band samples. Root-caused by hand (dumped all
  9 neighbor distances at the worst sample, `theta=3.954...`, `z=74.99999768...`): the scaled
  `v`-coordinate at this locus was `4.999999845...`, ~1.5e-7 from an integer line. F64 and
  F32-emulated rounding of this SMOOTH value can `floor()` to DIFFERENT local `cellId` origins
  (`floor(4.9999998)=4` vs. a F32-rounded value landing at exactly `5.0` → `floor=5`) — this shifts
  EVERY neighbor's RASTER position by a constant offset while the ABSOLUTE PHYSICAL winning cell
  stays identical. Verified by hand: `cellId(5,4)+(0,1)` (F64's frame) and `cellId(5,5)+(0,0)` (F32's
  frame) both resolve to the same absolute cell `(5,5)`, and the runner-up likewise resolves to the
  same absolute cell `(4,5)` in both frames. **This is an artifact of comparing a `floor()`-relative
  index, generic to ANY floor()-tiled Voronoi/Worley scheme (int-hash or float-hash) — not a defect
  introduced by the int-hash design.**
- **Fix**: `CellResult` (`_voronoi_inthash_lib.ts`) now carries the winning cell's **ABSOLUTE
  INTEGER ID** (`f1CellX`/`f1CellY`/`f2CellX`/`f2CellY` — the unwrapped `cellIdX+x`/`cellIdY+y`, the
  physical cell identity, independent of which local `floor()` frame either evaluation landed in;
  periodic X-wrap is applied only at the hash-lookup step, not to this identity). Gating on this
  invariant is what produced the clean 0/2,000,000 result above.

This correction is reported in full because it is itself informative: it demonstrates precisely
*why* "argmin bit-identity" needs a careful, physically-grounded definition (winning absolute cell,
not a coordinate-frame-relative index) — a subtlety the ORIGINAL truthbridge arm's divergence-locus
check (which compared raw f1/f2 floats with a 0.003 tolerance, sidestepping this exact frame issue)
did not need to confront because it was comparing against real GPU output, not two CPU frames that
can independently `floor()` to different local origins.

### A/B control (H2) — what the design fixes, measured on the SAME adversarial sweep

The IDENTICAL 500,000-sample adversarial boundary-band sweep (same RNG seed, same loci), run
through the **EXISTING float-hash chain** (`rOuterVoronoiF32`/`rOuterVoronoiF64Ref`/
`cellArgminBothPrecisions` from `_voronoi_truthbridge_lib.ts`, imported read-only):
**761/500,000 argmin flips (0.152%)** — using the truthbridge arm's own 0.003-normalized-unit
threshold — with **max radius delta 0.121mm** (worst sample f1/f2 pair:
f64={f1:0.2306, f2:0.3272} vs. f32={f1:0.2309, f2:0.3303} — the f2 value alone differs by 0.003,
right at cell-boundary-jump scale). This is the side-by-side the mission asked for: on this
harder, deliberately-adversarial sampling regime (vs. the ORIGINAL truthbridge arm's 0/500 on the
artifact's actual worst vertices — a different, easier regime since production artifact vertices
are not deliberately chosen to sit within 1e-4 of a cell line), the float-hash chain DOES show
material argmin flips that the int-hash chain's own boundary-band sweep (same 500,000 loci, same
seed) shows ZERO of. Both results are honestly reported per the pre-registration's instruction to
report "whichever way it lands."

### Perf (H3)

**≥10,000,000 evals each, Node single-thread, warmed (500,000-eval discarded warmup, shared
pre-generated input array for a fair A/B):**
- Existing float-hash chain (f64): **4,862.89 ns/eval**
- New int-hash chain (f64): **2,211.84 ns/eval**
- **Ratio: 0.455× — the int-hash chain is ~2.2× FASTER**, not merely non-slower. (Kill criterion
  was ">1.5× slower ⇒ note it"; the actual result is the opposite direction, so no note is needed —
  reported for completeness.) Consistent with removing the `fract(p*0.1031...)`
  transcendental-adjacent dot-product scramble in favor of pure `imul`+shift integer ops.

### Visual pack (H4)

Rendered `research/exchange/_inthash/voronoi_relief_{OLD_floathash,NEW_inthash}.png` (1024×1024,
r0=0 to isolate the pattern term, u-span = 1 full period of scale=8, v-span = 1.5× that so the fade
zone is visible) — both images visually inspected. **Both are legitimate, non-degenerate Voronoi
web patterns** (DEFAULT_VORONOI's `vMorph=1.0` renders "web/border" mode: bright cell-boundary
lines on a dark cell-interior field) with the SAME structural features: identical relief amplitude
range `[0, ~2.0]` (matches `vRelief=2.0`), identical vertical fade-to-black band at the
top/bottom of the sampled span (matches `vEdgeFade=0.15`), similar cell-count order of magnitude
(31 vs. 26 local-minima proxy count in the sampled window — expected variation from a genuinely
different hash, not a red flag). **Cell BOUNDARY LAYOUT differs completely between the two images**
— visually obvious (different hash ⇒ different jittered cell centers ⇒ different Voronoi
tessellation) and confirmed numerically (77.4% same-pixel fraction within 2% of the shared value
range — the complement, ~23%, is the visually-different boundary/interior structure; a byte-for-byte
IDENTICAL pattern would read ~100%, a fully-uncorrelated random field would read much lower than
77% given how much of each image is uniform dark cell-interior). **In short: it is "a different but
equally valid" Voronoi pattern — exactly the outcome a hash swap should produce, not a degenerate
one.** Any production adoption is a **style-versioning decision** (existing designs/presets
serialize specific cell layouts) — this arm does not make that call, only supplies the evidence.

### WGSL port (UNWIRED — text only, not added to any `.wgsl` file in `src/`)

Mirrors `_voronoi_inthash_lib.ts`'s `pcg2d`/`hash22Int`/`periodicCellularInt` bit-for-bit. WGSL
`u32` arithmetic is exact/wrapping per spec (no `>>>0` needed — every WGSL `u32` op already behaves
like the JS `Math.imul(...)>>>0` idiom used in the TS port), so this is a direct line-for-line
translation, not a re-derivation:

```wgsl
// hash_pcg2d — PCG2D integer hash, pure u32 arithmetic, bit-identical to research/bridge/
// _voronoi_inthash_lib.ts's pcg2d() by construction (WGSL u32 ops are exact/wrapping).
fn hash_pcg2d(vx: u32, vy: u32) -> vec2<u32> {
  var x = vx;
  var y = vy;

  x = x * 1664525u + 1013904223u;
  y = y * 1664525u + 1013904223u;

  x = x + y * 1664525u;
  y = y + x * 1664525u;

  x = x ^ (x >> 16u);
  y = y ^ (y >> 16u);

  x = x + y * 1664525u;
  y = y + x * 1664525u;

  x = x ^ (x >> 16u);
  y = y ^ (y >> 16u);

  return vec2<u32>(x, y);
}

// u32_to_unit_float — dyadic-rational conversion, exact in f32 (24-bit mantissa). Mirrors
// u32ToUnitFloat(): (h >>> 8) * 2**-24.
fn u32_to_unit_float(h: u32) -> f32 {
  return f32(h >> 8u) * 5.9604644775390625e-08; // 2^-24, spelled as a literal for WGSL const-eval
}

// hash22_int — INTEGER-EXACT hash22 analog. cx/cy must already be integer cell coordinates
// (post floor + periodic wrap). Bias constants match hash22Int()'s 0x9e3779b1/0x85ebca77.
fn hash22_int(cx: i32, cy: i32) -> vec2<f32> {
  let seeded = hash_pcg2d(u32(cx) + 0x9e3779b1u, u32(cy) + 0x85ebca77u);
  return vec2<f32>(u32_to_unit_float(seeded.x), u32_to_unit_float(seeded.y));
}

// periodic_cellular_int — INTEGER-HASH periodic Worley/Voronoi. Structurally identical to the
// existing periodic_cellular() (styles.wgsl:855) EXCEPT the hash call: hash22_int() on the
// INTEGER neighbor cell id (periodic-wrapped in integer space) instead of hash22() on a float
// wrapped_id. Returns vec3(F1, F2, 0.0) — same shape as the existing fn for drop-in call-site
// compatibility if this is ever wired.
fn periodic_cellular_int(uv: vec2<f32>, period_x: i32, jitter: f32) -> vec3<f32> {
  let cell_id = vec2<i32>(floor(uv));
  let cell_uv = fract(uv);

  var f1 = 999.0;
  var f2 = 999.0;

  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let neighbor_id = cell_id + vec2<i32>(x, y);
      // periodic wrap ONLY for the hash lookup (cylinder periodicity) — matches
      // periodicCellularInt()'s wrappedX (Euclidean modulo, not WGSL's truncating %).
      let wrapped_x = ((neighbor_id.x % period_x) + period_x) % period_x;

      let point_hash = hash22_int(wrapped_x, neighbor_id.y);

      let center = vec2<f32>(f32(x), f32(y)) + point_hash * jitter;
      let diff = center - cell_uv;
      let dist = length(diff);

      if (dist < f1) {
        f2 = f1;
        f1 = dist;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }

  return vec3<f32>(f1, f2, 0.0);
}
```

Note: `period_x` is typed `i32` here (vs. the existing `periodic_cellular`'s `vec2<f32> period`)
since the whole point of this design is that the wrap happens in exact integer space — a production
wiring would need `style_voronoi` to pass `i32(round(scale_val))` at the call site, matching
`periodicCellularInt`'s `periodXInt = Math.max(1, Math.round(periodX))` JS-side rounding.

### KILL CRITERIA disposition

- **Nonzero bit-diff kill criterion**: NOT triggered in the final measurement (0/2,000,000 on the
  correct invariant). Two iterations were used (methodology fixes to the TEST, documented above in
  full) — the pre-registration anticipated "iterate the hash→float conversion once, if still
  nonzero REFUTED"; in execution, both iterations found the divergence was in how the TEST measured
  "same winning cell," not in the hash→float conversion itself (which was bit-identical from the
  first run, 0/200,000, and stayed that way throughout). Reported as a methodology-correction verdict
  rather than a strict "REFUTED, hash→float conversion iterated" per the letter of the prereg,
  because the actual conversion under test (`u32ToUnitFloat`) never needed to change.
- **Perf kill criterion (>1.5× slower)**: NOT triggered — int chain is 2.2× FASTER.

### RECOMMENDATION

The integer-exact hash design **achieves its core claim**: Voronoi cell selection is bit-identical
across f64/f32-emulated arithmetic BY CONSTRUCTION, on both random and deliberately-adversarial
boundary-band sampling (2,000,000 samples, 0 diffs on the physically-correct absolute-cell
invariant), is markedly faster than the existing float-hash chain, and produces a visually and
statistically legitimate (non-degenerate) Voronoi pattern that is admittedly a DIFFERENT cell layout
from the current shipped pattern. This packages the evidence the mission asked for: a
**style-versioning decision** (ship as a NEW style variant / version-gate existing presets vs.
silently swap the current Voronoi's hash and accept that saved designs render differently) is a
product call outside this spike's scope — the WGSL port above is ready, text-only, and UNWIRED for
whichever direction that decision goes.
