# potscope truth layer — residual characterization + certificate registry

**Date:** 2026-07-22
**Status:** Design approved (proceeding to plan + implementation)
**Branch:** `refactor/core-migration`
**Tool:** `potfoundry-web/research/tools/potscope/` + `potfoundry-web/research/bridge/`

## Problem

potscope does two of the three jobs a certification campaign needs well, and misses the third:

- **Capture** — `run` (EcoQoS bump + probe scraping) and `ledger` — solid.
- **Render** — `view` (ceramic / `--error` / shelf), `serve` — excellent.
- **Synthesize truth** — *absent.* This is the gap, and it is where the recurring cost lives.

Three grounded symptoms of the missing synthesis layer:

1. **Truth goes stale by hand.** `research/lab/2026-07-19-all20-status-truth.md` exists *only
   because* the ledger + lab docs + memory constantly drift. It is hand-typed, and it already
   carries `SUSPECTED`, `STALE`, and "as-of-date" markers it admits it cannot keep current. The
   ledger holds 404 append-only lines; `ledger list` just dumps them — yet the `WROTE` probe
   lines are already structured (`tris=`, `maxMm=`, `p99Mm=`, `provenance=matches-committed-stl`,
   `enclosures=`). The raw material for a real registry is already emitted and thrown into a flat
   file.

2. **Max-masking is an expensive, repeated failure mode.** The record is explicit — "certify on
   MAX, never p99 alone"; a region-kernel "0.009" certificate was later found **p99-masked 12×**.
   The per-triangle `error.bin` sidecars already encode exactly where the worst error hides, but
   nothing ranks or localizes it; the worst triangle is eyeballed in the 3D overlay.

3. **`decode` is Gothic-only.** Its analytic model is hardcoded Gothic constants
   (`potscope.mjs:38-50`). It silently mis-models any non-Gothic pot, and cannot scale to 20
   styles as written.

Underneath all three is the decision that actually costs re-bakes: for a residual that misses
0.01 mm, is it **density-responsive** (throw more triangles) or **density-invariant / structural**
(redesign the mesher)? The record is littered with this being the crux — GeometricStar chevron
"DENSITY-IRREDUCIBLE," the Gyroid "test raised-budget convergence FIRST" trap, "quality gap
density-invariant, chord density-responsive," "coarse-config divergence unmasked." Getting that
call wrong wastes a 10–90 min bake every time. No tool answers it today.

## Goal

A **truth layer** on potscope that turns the data the certification machinery already produces
into synthesized answers, without re-implementing any surface:

- **`hotspots` (headline)** — reads the residual and **characterizes its structure** (spike /
  band / anisotropic / feature-aligned), mapping structure → the mesher lever it points at. This
  is the refine-vs-redesign signal, made cheap.
- **`status`** — a **generated** certificate registry + staleness guard. Replaces the
  hand-maintained status-truth table; catches source drift (the Voronoi-desync class).
- **`decode`** — reframed as a style-agnostic lookup backed by real per-triangle data, with the
  Gothic mechanism model demoted to an optional enrichment.

All three ride one shared spine: a fast **reconstruct** pass that rebuilds each certified pot
from `_certRoster` (tessellate only — the cheap prefix of the error bake, no enclosure loop) and
emits self-describing sidecars.

**Non-goals (explicitly deferred):**

- **Production-default worst-case column.** v1 models *certified-config* truth only. The
  OD140/H120 + registry-default "what a user exports" measurements are a separate oracle pipeline.
- **Convergence-slope probe** ("does max halve when density doubles?"). The direct
  refine-vs-redesign answer, but it needs multi-density bake data — a bigger build, deferred.
- **Re-implementing the analytic surface anywhere in potscope.** potscope stays a pure reader
  (the Voronoi hash-desync lesson: copies drift).
- **Auto-running the 90-min certifies-at bake.** Reconstruct is the tessellation-only pass.
- **Per-style mechanism naming for all 20 styles.** `hotspots` characterizes *structure* and
  names the *lever class*, not the per-style mechanism. Gothic mechanism naming stays in `decode`.

## Architecture

Two layers with a clean boundary — the same principle potscope already lives by ("the
certification machinery emits self-describing sidecars; potscope only reads").

```
CERTIFICATION MACHINERY  (vitest/TS — the only code that runs the source)
  ├─ error bake (exists)  → <name>.stl.error.bin  per-tri certifies-at mm + stats + provenance
  └─ reconstruct (NEW)    → <name>.stl.loc.bin     per-tri patch + per-vertex (u,v)
                          → <name>.recon.json       fresh provenance triple + drift verdict
                                                     + config digest + tris + feature loci
                                    │  (plain files next to the STLs, in _certified_stl/)
POTSCOPE  (zero-dependency node — reads only, never re-implements the surface)
  ├─ hotspots  → residual characterization (reads error.bin + loc.bin + STL)
  ├─ status    → generated registry table + staleness guard (reads error.bin hdr + recon.json
  │              + certificate.txt + ledger)
  └─ decode    → single-refusal-line lookup, loc-backed + optional Gothic hints
```

The layer boundary is enforced by the language boundary: only the vitest/TS side can execute the
style source; potscope is plain zero-dep node and can only read files. This makes "no
re-implemented surface" structural, not a discipline.

## The reconstruct spine

New `research/bridge/_certRosterReconstructLib.ts` + a thin `_certRosterReconstruct.test.ts`
driver — mirroring the existing `_certifiesAtBakeLib.ts` + `_certRosterErrorBake.test.ts` split,
so the standing guard-gate can reuse the lib. DEV-only, env-selected like `PF_CERT_ERRORBAKE`
(`PF_CERT_RECON=all | <substr>`, `PF_CERT_RECON_FORCE=1`).

Per selected roster pot it runs the cheap prefix of the bake — confirmed available from
`_certRosterErrorBake.test.ts:53-59`:

```
binding      = atlas(pot.geometry, pot.styleParams, pot.styleId)
tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, pot.divisions)
```

`tessellation` yields `stlBytes`, `triangleCount`, and `partitions[].{ patchId,
fractionBits, oddDenominatorFactor?, triangles[].{ artifactTriangleIndex,
vertices[].{ uNumerator, vNumerator } } }`. **No `bakeCertifiesAtErrors` call** — that enclosure
loop is the 10–90 min cost; reconstruct skips it entirely (seconds/pot).

From this it emits two artifacts:

### `loc.bin` — per-triangle localization (`potscope-loc/v1`)

One JSON header line + Float32LE body, count-bound to the STL exactly as `error.bin` is (potscope
refuses a count mismatch — the same provenance guard the viewer already applies).

- **Header:** `{ magic:"potscope-loc/v1", style, variant, count, patches:[patchId,…],
  provenance:{ targetSha256, artifactByteSha256, parsedTriangleSetSha256 } }`.
- **Body, per artifact triangle (indexed by `artifactTriangleIndex`):** `patchIdx` (into
  `patches`), then per-vertex `(u, v)` — 3 vertices × 2 = 6 floats. Total **7 floats/tri**
  (≈ 35 MB for the 1.27M-tri WaveInterference pot; comparable to its `.pack`).

`(u, v)` are **normalized to `[0,1]` in the patch domain** — the universal, style-agnostic
coordinate. u ≈ angular, v ≈ vertical/"t" for wall patches. The exact denominator
(`uNumerator / (2^fractionBits · oddFactor)` vs the annular tessellation's own convention) must
be derived to match `annularSolidReferenceTessellation` and asserted against a known pot in the
plan — this is the one numeric detail to pin at implementation time. Per-**vertex** (not centroid)
u/v is required so `hotspots` can compute triangle anisotropy and cluster adjacency.

### `recon.json` — provenance + config + feature loci

A small per-pot JSON (next to the STL) that potscope reads for `status` and for FEATURE-ALIGNED
classification:

```jsonc
{
  "name": "GeometricStar_H32_OD30_fract",
  "style": "GeometricStar",
  "tris": 176128,
  "configDigest": "<stable hash of geometry+styleParams+divisions>",
  "provenance": {                       // recomputed fresh this run
    "targetSha256": "...",              // createCompleteMappedGeometryTargetBindingFromSurfaceComplex(binding.surfaceComplex)
    "artifactByteSha256": "...",        // createFinalArtifactProofSession(stlBytes).byteSha256
    "parsedTriangleSetSha256": "..."
  },
  "verdict": "GREEN | DRIFT | STL-MISSING",   // fresh vs recorded (see guard)
  "recorded": { /* provenance copied from the committed error.bin header, or null */ },
  "featureLoci": {                      // normalized [0,1], from _certRoster divisions
    "angular":  [ /* u values of angularStations / rational ladders */ ],
    "verticalByPatch": { "inner-wall": [ /* v values */ ], … },
    "conformingByPatch": { "outer-wall": [ /* {a,b,c} lines → domain loci */ ], … }
  }
}
```

`configDigest` gives `status` a config column without potscope importing the TS roster.
`featureLoci` is derived from `pot.divisions` (`angularStations`, `verticalStationsByPatch`,
`conformingLinesByPatch`) — the data `_certRoster` already carries.

The reconstruct pass writes sidecars beside the STL. It **never overwrites the committed STL**; if
the fresh tessellation bytes differ from the committed `<name>.stl`, verdict is `DRIFT` and the
fresh bytes go to `<name>.regen.stl` — the exact behavior `_certRosterErrorBake.test.ts:65-76`
already implements for the error bake.

## `hotspots` — residual characterization (headline)

```
node potscope.mjs hotspots <name|stl> [--top N] [--budget mm] [--json]
```

Reads `<name>.stl.error.bin` (per-tri error mm) + `<name>.stl.loc.bin` (patch + per-vertex u,v) +
the STL (xyz). Both sidecars are count-bound to the STL; a mismatch is refused with the same
message the viewer uses. **Before joining them, `hotspots` asserts the two sidecars describe the
same mesh** — `error.bin` and `loc.bin` must carry the *same* `provenance.artifactByteSha256`.
This matters because the join is by `artifactTriangleIndex`, which only aligns when both sidecars
were produced from the same deterministic tessellation: a `GREEN` pot's `loc.bin` aligns with the
committed STL and its `error.bin`, whereas a `DRIFT` pot's `loc.bin` pairs with the `.regen.stl`,
not the committed artifact. Refusing on a provenance mismatch makes a stale-pairing lie impossible
rather than silent.

**Pipeline:**

1. **Threshold** hot triangles: error ≥ `max(budget·0.5, p99)` by default (`--budget` overrides;
   default from the error.bin header). This deliberately includes the sub-budget shoulder so a
   certified pot still shows its tightest region (where the headroom is), not an empty set.
2. **Cluster** hot triangles by connected components. Adjacency = shared welded xyz vertex
   (reuse the `Map`-keyed weld already in `ceramicAttributes`, `potscope.mjs:335`). Each cluster
   accumulates its member triangles, their (u,v) extent, and error stats.
3. **Classify** each cluster into one structure class (below), compute the confidence signal, and
   attach the lever hint. Classes are not mutually exclusive in principle (a band can be
   feature-aligned); report the dominant class plus any secondary tag.
4. **Rank** clusters by peak error (then size) and print the top `--top` (default 5).

**Classification rules** (thresholds calibrated in the plan against fixtures + 2 real pots):

| Class | Signal | Lever hint |
|---|---|---|
| **SPIKE** | small cluster (≤ K tris), compact (u-extent and v-extent both small), high peak-to-surround error ratio | localized singularity → conforming edge / seam pin / atlas patch |
| **BAND** | elongated: extent along one axis ≫ the other. If it spans ~the full axis → tag **IRREDUCIBLE** | density/envelope **along the short axis**; if IRREDUCIBLE, *not* more triangles |
| **ANISOTROPIC** | member triangles show high **metric distortion** — the map's uv→xyz stretch ratio is large — and error correlates with it | the M=g/h² / anisotropic-flank kernel (the "wrong space" case) |
| **FEATURE-ALIGNED** | cluster (u,v) tracks a `recon.json` feature locus (within a tolerance) | feature resolved but flank under-met → flank/conforming edges |

**Metric distortion** for ANISOTROPIC is computed per triangle from data already in hand: for each
of the 3 edges, the ratio (xyz edge length) / (uv edge length); the triangle's distortion is
`max ratio / min ratio` over its edges (≈ the Jacobian condition number). A cluster is ANISOTROPIC
when its members' distortion is high *and* error tracks distortion — distinguishing "wrong metric
space" from "just not enough triangles." Exact proxy is plan-tunable; it must not fire on a
well-shaped dense band.

**Output** reads like a diagnosis, framed as hints ("points at") — same humility as `decode`'s
existing mechanism hints:

```
GeometricStar_H32_OD30_fract — 176,128 tris, max 0.0100mm  p99 0.0050  p50 0.0025
worst residual structure (top 5):

  [1] BAND · v-aligned crest · outer-wall
      42 tris · u∈[0.00,1.00] v≈0.87±0.01 · peak 0.0100 mean 0.0071
      spans full u at fixed v  ⇒  DENSITY-IRREDUCIBLE crest
      on feature locus: angularStation crest (FEATURE-ALIGNED)
      → points at anisotropic flank kernel (M=g/h²) — not more triangles

  [2] SPIKE · inner-wall
      3 tris · u≈0.50 v≈0.03 · peak 0.0098
      near patch seam (bottom-top join)
      → localized: candidate conforming edge / seam pin
```

`--json` emits the cluster list for machine use / regression fixtures.

## `status` — generated registry + guard

```
node potscope.mjs status [<substr>] [--check] [--json]
```

For each certified pot (roster ∪ what exists in `_certified_stl/`), reads and joins:

- **cert stats** — from the `error.bin` header (`maxMm`, `p99Mm`, `p50Mm`, `unconverged`, `tris`,
  `enclosures`).
- **certificate** — `pm` and pinned `commit` from `<name>.certificate.txt` when present.
- **config + provenance verdict** — from `recon.json`.

Prints the generated table (style · config digest · tris · maxMm · commit · verdict), and:

- **Flags max-masking** — any row with `maxMm / p99Mm > 3×` gets a marker, surfacing the "certify
  on MAX, never p99" lesson directly in the registry.
- **`--check`** exits non-zero if any pot's verdict is `DRIFT` — gate-friendly.
- **`--json`** emits the table as structured data, from which the `all20-status-truth.md` §2 table
  is *regenerated* instead of hand-typed.

**The guard.** Drift is decided by the reconstruct pass (the only side that can recompute hashes):
`recon.json.verdict` = `GREEN` when fresh `targetSha256` + `artifactByteSha256` match the committed
`error.bin` header's recorded provenance; `DRIFT` when they differ (source changed, or STL edited);
`STL-MISSING`/`NO-EVIDENCE` when there's nothing to compare. Because `targetSha256` recomputation
is tessellation-cost (not bake-cost), the same lib is also wired as a **standing vitest gate** —
`_certRosterReconstruct.test.ts` asserts every roster pot is `GREEN` — generalizing the "groundTruth
gate is the canary" lesson from one test to every certificate.

## `decode` enrichment

`decode` keeps working on a pasted refusal line. Given `--pot <name>` with a `loc.bin` present, it
resolves `tri=<global>` → patch + per-vertex (u,v) from the sidecar (exact, style-agnostic),
instead of the hardcoded Gothic model. The Gothic mechanism hints
(`mechanismHints`/`decodeVertex`, `potscope.mjs:52-117`) fire **only when the pot's style is
Gothic** — so `decode` stops silently mis-modeling the other 19 styles. Backward compatible: with
no `--pot` and no sidecar, it falls back to today's behavior (the tricount-offset patch resolution
plus, for a Gothic line, the Gothic hints), preserving the encoded global-vs-local index lesson.

## Testing

Measurement-first, matching the project discipline — the classifier is the part that must not lie,
so it carries the most tests.

- **Reconstruct lib/gate:** `loc.bin` count == STL `triangleCount`; on a known-clean pot the fresh
  provenance triple == the committed `error.bin` header (verdict GREEN); a deliberately mutated
  `configDigest`/param trips `DRIFT` — proving the guard actually fires, not just passes.
- **`hotspots` classifier:** synthetic fixtures (tiny hand-authored `error.bin` + `loc.bin` + STL)
  with a planted **spike**, a planted **v-band** (full-u at fixed v → assert IRREDUCIBLE tag), and
  a planted **anisotropic** patch (high metric distortion) → assert each lands in the right class
  and the wrong classes do *not* fire. Plus one real pot (e.g. GeometricStar) as a smoke check that
  the known chevron residual reads as an IRREDUCIBLE band.
- **`status`:** fixture set of `error.bin` headers + `recon.json` + `certificate.txt` → assert the
  table rows, the max-masking flag, and `--check` exit code on a planted DRIFT.
- **potscope readers** extend the existing `research/tools/potscope/_potscope.test.mjs`.

## Files

New:
- `potfoundry-web/research/bridge/_certRosterReconstructLib.ts`
- `potfoundry-web/research/bridge/_certRosterReconstruct.test.ts` (driver + standing guard-gate)
- `<name>.stl.loc.bin`, `<name>.recon.json` per pot in `research/exchange/_certified_stl/`

Modified:
- `potfoundry-web/research/tools/potscope/potscope.mjs` — add `status`, `hotspots`; enrich
  `decode`; add `loc.bin`/`recon.json` readers.
- `potfoundry-web/research/tools/potscope/_potscope.test.mjs` — reader + classifier tests.
- `potfoundry-web/research/tools/potscope/README.md` — document the three surfaces + the spine.

## Build sequence

1. **Spine** — `_certRosterReconstructLib` + driver; emit `loc.bin` + `recon.json` for the roster;
   pin the (u,v) normalization against a known pot; the guard-gate turns green. (Nothing in
   potscope yet — the sidecars exist and are provenance-verified first.)
2. **`hotspots`** — reader + clustering + classifier + fixtures. The headline; gated on the
   classifier fixtures passing.
3. **`status`** — registry join + max-masking flag + `--check`; regenerate the status-truth §2
   table from `--json` as the acceptance demo.
4. **`decode` enrichment** — loc-backed lookup + Gothic-gated hints.
5. **README** + a short ledger/memory note.

Each step is independently useful and independently testable; step 1 must land and verify green
before any potscope reader is written, so the readers are never validated against unverified data.
