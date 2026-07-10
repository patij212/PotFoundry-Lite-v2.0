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
- Pre-reg commit: [this]
- Verdict commit: [pending]
