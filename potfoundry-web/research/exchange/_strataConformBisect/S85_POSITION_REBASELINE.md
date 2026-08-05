# S85 — THE POSITION RE-BASELINE

**Every "position over-bar" number this campaign published was measured with `sagAdaptiveRaw`, an
INFINITE-PLANE distance that under-reports by 1.0x–46x with no constant correction. This file replaces
them with a two-sided `certifyTriangle` reading at the 10 µm PRODUCT bar.**

- Instrument: `certifyTriangle` (`research/bridge/_facetTruthLib.ts`), `tol = 0.010 mm`, `nMax = 512`.
- Three buckets, **never folded**: PROVEN-FAIL (`witnessed > tol` — a real point at a real distance),
  PROVEN-PASS (`bound <= tol` over the whole triangle, gaps included), UNKNOWN (level/sample ceiling).
- Tool: `research/tools/s85PosRebase.ts` (pre-registration in its header, written before the first run).
- Runner: `research/tools/run-s85-pos-rebase.sh`. Per-facet ndjson checkpoints in `s85rebase/`.

## Sample construction — IDENTICAL on every mesh

The first `N` terms of the golden-ratio stride `(q·s) mod nTri`, `s` = the odd integer nearest
`nTri·0.6180339887`, bumped until coprime with `nTri`. Byte-for-byte the construction
`s80HonestPos.ts` uses, so the S39CTL row and LAND's `L1_GOTHIC` "before" column are **the same 50,000
facets** — their agreement is a cross-tool check, their disagreement would be a finding.
An `N = 8,000` row is the 8,000-term **prefix** of the `N = 50,000` row: same construction, less coverage.

## What is NOT measured (stated up front)

- **The honest whole-mesh MAX.** Unreachable at this budget. The TARGET arm's `witnessed` max is a max
  over a targeted union (driver's own top-K by the plane ruler ∪ top-K by monotone `tangExc`) and is a
  **LOWER BOUND** on the mesh's true honest max. Never quoted as "the max".
- **H2** (surface → mesh). `certifyTriangle` is H1: points ON the facet, measured to the surface.
- **Orientation.** Position only.

---

## RAW ROW LOG — appended by the tool the instant each mesh finishes

TARGET columns:  `| TARGET | tag | style | nTri | driver HEADLINE µm | my plane MAX µm | my plane over-bar | HONEST max-over-union µm | honest max on plane-selector µm | proven-fail on plane top-K | proven-fail on tangExc top-K | headline/honest ratio | coverage |`

UNIFORM columns: `| UNIFORM | tag | style | nTri | driver over-0.01mm | proven-fail/N | fail rate ±1σ | scaled fail (whole mesh) | fail AREA fraction ±1σ | UNKNOWN | in-sample witnessed max µm | under-report ratio | coverage |`

| TARGET | S40AR90 | GothicArches | 1139357 | 10.83 | 10.829 | 1 | 460.513 | 57.370 | 53/300 | 273/300 | 0.02x | union 577 of 1139357 (0.0506%), TARGETED not random |
| TARGET | S40AR65 | GothicArches | 1140154 | 23.563 | 23.547 | 32 | 370.300 | 90.964 | 177/300 | 279/300 | 0.06x | union 548 of 1140154 (0.0481%), TARGETED not random |
| TARGET | S39CTL | GothicArches | 1142166 | 47.282 | 47.229 | 75 | 350.457 | 105.573 | 238/300 | 287/300 | 0.13x | union 557 of 1142166 (0.0488%), TARGETED not random |
