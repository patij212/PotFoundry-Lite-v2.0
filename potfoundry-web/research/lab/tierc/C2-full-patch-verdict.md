# C2 Full-Patch Confirm — Gothic is a TRUE-0.01mm style at full CI-patch scale

**Experiment:** PROD-TIERC (E-2026-07-11-TIERC-HEADTOHEAD), the deferred C2 full-patch confirm
(C2 lever committed 6c71b850). **VERDICT: PASS, whole-patch, LITERAL scan — no plateau, no residual
tail.** This is the program's FIRST style proven to meet the true-analytic 0.01mm standard
end-to-end. Raw: `research/exchange/tierc/c2full_*.json`. Probe: `_tierc_c2full.test.ts`.

## Result

Full Gothic CI patch (u∈[0,0.125], t∈[0.48,0.52], bgArc 0.6, nTheta 512), built via the K2 kernel
with C2's `surfaceSource:'analytic'` lever, scored against the EXACT analytic surface
(`getManifest('GothicArches').truth.rA`):

| build | tris | passes | build time | analytic-max (scored vs exact rA) |
|---|---|---|---|---|
| `sampler` (default, = CI/C1 baseline) | 9,917 | 7 | 38.1s | **0.230mm** (70.2% of facets over tol) |
| `analytic` (C2 lever) | 18,045 | 8 | 309.8s | **0.009952mm** (LITERAL 18,045/18,045, **0 outliers**) |

- **After** distribution: p50 0.00264 / p90 0.00568 / p99 0.00813 / max 0.009952mm — every facet ≤0.01.
- **Before** (sampler-built vs analytic, strided 151/9917, same scorer): 70.2% over tol, max 0.230mm
  — independently reproduces C1's ~70%/0.17-0.33mm finding at full CI scale, apples-to-apples.
- **G3/G7:** orientation 0; boundary 321 all-rim (0 interior); watertight nonMan 0 non-vacuous.
- **Quality:** minAngle 0.8° / 0 degenerate — the banked Gothic sliver concession, SMALLER than
  C2's small-patch 0.4° (element-level, Phase-2 research; unchanged by this arm).

## Two findings worth keeping

1. **The mechanism generalizes at LOWER proportional cost than the worst crest** — 1.82× density
   here vs 3.43× at the crest-only sub-patch, because the full patch averages knife-edge crests
   against smoother in-between arch regions. The honest full-patch cost of true-0.01 Gothic is
   **1.82× triangles, 8.1× build wall-time** (the per-query analytic eval vs the grid lookup).
2. **The "expensive full-patch scoring" fear was misplaced.** The literal 18,045-facet analytic scan
   took **1.2s** — a converged analytic mesh screens green on the cheap GN check, near-free to verify.
   The expense C1/C2 saw was only ever in scoring NON-converged (sampler-built) meshes against
   analytic. Verifying a converged one is cheap.

## Status & follow-ups

**Gothic = a confirmed true-0.01mm style at CI-patch scale** — the program's first, proven
end-to-end against the real surface (not the 512² sampler, not one crest; the whole patch,
watertight, 0 outliers on a literal scan). C2 full-patch confirm CLOSED. Follow-ups (out of scope
here): (1) profile the 8.1× build wall-time (per-query analytic eval vs brute-confirm count) before
any default-flip discussion — `refineToZeroOutliersParallel` is sampler-only/CI-unexercised, a
separate perf item; (2) repeat for GeoStar (the other R-REFINE knife-edge style); (3) the sliver
concession (minAngle 0.8°) remains Gothic's known element-level frontier.
