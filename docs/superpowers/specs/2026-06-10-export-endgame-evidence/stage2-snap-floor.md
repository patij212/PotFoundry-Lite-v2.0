# Stage 2b — SFB@1 Snap/Placement Floor (published 2026-06-12)

Blueprint `faithfulMetricSpec` item (4) (`crest-elimination-blueprint.json`): the
inserted-polyline-vs-analytic-ridge deviation, measured as **two separate
channels, never summed** — published BEFORE the amplitude gates are frozen.
Production amplitude gates are set at **max(0.02 mm, the measured post-fix
placement floor)**; this document banks the PRE-fix floor the Stage-4 placement
fix must beat.

Instrument: `potfoundry-web/src/fidelity/snapPlacementAudit.ts`
(`measureExtractionError` / `measureSnapDisplacement` / `runSfbSnapFloorAudit`),
test-pinned by `snapPlacementAudit.test.ts` (S1–S6). CPU-only, vitest-runnable;
**zero production files modified** — the audit imports the REAL extractor and
the REAL `FeatureConformingTriangulator` read-only and runs them in-process.

## Pinned config (production law, stated assumptions)

| Knob | Value | Source |
|---|---|---|
| Style / params | SuperformulaBlossom, packed `[1, 6, 10, 1.2, 0.35, 0.5, 0.8, 1.4, 0.8, 0.8, 1, 1]` (defaults + `sf_strength=1`) | the pinned SFB@1 benchmark (default strength 0 extracts NOTHING per `SF_CREST_MIN_STRENGTH`, FeatureLineGraph.ts:690) |
| Dims | H=120, Rt=70, Rb=45, expn=1.1 (wall r ≈ 45–90 mm) | `DEFAULT_GEOMETRY` (state/types.ts) |
| featureLevel | 7 | ParametricExportComputer.ts conforming branch (`featureLevel: 7`) |
| cornerSnap | 0.06/2⁷ = **4.6875e-4** (t-units) | ConformingWall.ts:539 |
| uBias B | 2 ⇒ cornerSnapU = cornerSnap/2² = **1.171875e-4** | `computeUBias` GATE B + Stage-0 `hasFeatures` B≤2 cap (WatertightAssembly.ts); FCT.ts:285 |
| Grid | uniform 2⁹×2⁷ = 65,536 level-7 leaves (B=2) | mirrors FCT.test.ts `uniformAnisoQuadtree`; production trees are adaptive but every inserted vertex lives in a featureLevel-7 feature cell, which this grid reproduces everywhere |
| Feature clip | uMargin = 1.5/2⁷, tMargin = 1/nRing = 1/1024 ('high' nRing) | ConformingWall.ts:601-603 (audit mirrors the private `clipFeaturesToBox`) |
| Inserted set | 12 full-height crest/valley polylines, 146 vertices total | production extractor (768×320 marching squares, 3e-4 simplify, `SF_CREST_FULL_HEIGHT_SPAN` filter) |
| Truth | Stage 2a `solveParamRidgeByBisection` on the f64 `sfRf` mirror, duTol = 1e-6, periodicU=false | reference error ≤ ~5e-4 mm-class — carried as `truthDuTol` |

## Channel A — EXTRACTION ERROR (extractor polyline vs analytic ridge)

146/146 vertices matched (unmatched = 0). Deviation at the polyline vertices,
lateral (⊥ crest tangent, Stage 2a convention d = r·Δθ/√(1+(r·dθ/dz)²)):

- **maxU = 1.711e-4** (u-units), rmsU = 8.391e-5
- **maxMm = 0.0744 mm** (worst branch crest[2]), rmsMm = 0.0285 mm

Per branch (n = matched vertices):

| Branch | n | maxU | maxMm | rmsMm |
|---|---|---|---|---|
| crest[0] | 6 | 1.340e-4 | 0.0485 | 0.0385 |
| valley[1] | 7 | 2.335e-5 | 0.0066 | 0.0027 |
| **crest[2]** | 10 | 1.430e-4 | **0.0744** | 0.0580 |
| valley[3] | 11 | 3.416e-5 | 0.0094 | 0.0031 |
| crest[4] | 12 | 1.403e-4 | 0.0457 | 0.0356 |
| valley[5] | 11 | 3.248e-5 | 0.0090 | 0.0028 |
| crest[6] | 14 | 1.434e-4 | 0.0600 | 0.0417 |
| valley[7] | 12 | 4.295e-5 | 0.0111 | 0.0035 |
| crest[8] | 15 | 1.279e-4 | 0.0384 | 0.0285 |
| valley[9] | 13 | 5.402e-5 | 0.0140 | 0.0040 |
| crest[10] | 19 | 1.711e-4 | 0.0490 | 0.0355 |
| valley[11] | 16 | 2.528e-5 | 0.0052 | 0.0014 |

Readings: **crest (cusp) loci carry 5–10× the valley error** — the extractor's
central difference (h = 0.5/768) is biased at the n1=0.35 cusps; valleys (smooth
minima) extract to ≤0.014 mm. COMPANION BOUND: these are vertex deviations; the
segment-interior chord deviation of the simplified polyline adds up to the
extractor's 3e-4 (u,t) simplify tolerance ≈ 0.08–0.14 mm lateral at r≈75–85 mm —
the same class, so the extraction channel as a whole is **~0.07–0.15 mm-class**.

## Channel B — SNAP DISPLACEMENT (FCT post-snap vs pre-snap input)

Pre→post correspondence: **nearest-neighbor matching** of each pre-snap input
vertex against the real FCT output vertex set, inside an anisotropic
3×cornerSnap search box (wrap-aware in u). Exact correspondence is NOT
recoverable from production data structures (CdtStats incidents record per-cell
inversion/drop counts, not snap moves; TRI_SOURCE tags triangles, not vertices) —
NN against the real output is exact for surviving unsnapped vertices (distance
~0 ≪ cornerSnap) and matches snapped/welded vertices to their actual end state;
only a vertex displaced beyond 3× cornerSnap would read unmatched (none did).
Snapped/unsnapped split at numericFloor = 2e-6 (f32 storage ≈6e-8 + WELD_TAU
1e-6 — both ≪ cornerSnapU).

- inserted = 146, matched = 146, **unmatched = 0**
- **snapped = 22** (7 in u, 15 in t), unsnapped = 124
- **maxAbsDu = 1.119e-4** (= 0.95× cornerSnapU), rmsDu = 1.268e-5
- **maxAbsDt = 4.653e-4** (= 0.99× cornerSnapT)
- **maxLateralMm = 0.1586 mm**, rmsLateralMm = 0.0191 mm
- Worst vertex: (u=0.813802, t=0.249758), du=−2.0e-8, **dt=+2.418e-4** (a
  `snapToCellEdge` t-snap onto the grid row t=32/128=0.25), lateral 0.1586 mm.

Reading of the worst case: the displacement is a **pure-t edge snap of only
½·cornerSnapT**, yet it costs 0.1586 mm laterally — because the crest is
DIAGONAL (du/dt ≈ −0.44 on the fastest-sweeping crest at that height) and
CUSPED, so a t-move at fixed u walks the vertex off the apex down the cusp
flank (the lateral number is the full 3D displacement ⊥ the crest tangent,
flank-drop INCLUSIVE — the conservative placement number). This is exactly the
class the blueprint's Stage-4 fix kills: **sliding ALONG the analytic crest to
the crest×grid-line intersection makes this displacement 0 by construction.**
No composition beyond 1× cornerSnap was observed at this config (the ~2.5×
worst class from FCT.test.ts:323-326 is a coarse-grid/anchor-composition case).

## Verdict — the published floor

- **Worst-case placement error (both channels, never summed): extraction
  0.0744 mm max (≈0.15 mm incl. the chord bound); snap 0.1586 mm max.**
- **Implied placement floor = max(0.02, 0.1586) = 0.159 mm** (pre-fix).
- Both channels sit inside the blueprint's expected **0.05–0.2 mm class** at
  r≈70 mm — confirming the snap-floor verdict: 0.01–0.02 mm amplitude gates are
  numerically unachievable until Stage 4's exact placement (along-crest slide +
  analytic crest×grid-line intersections) and a tighter/exact extraction (the
  closed-form loci instead of the marching-squares trace) land. After Stage 4,
  re-run `runSfbSnapFloorAudit` and re-freeze the gates at the new floor.

Reproduce: `npx vitest run src/fidelity/snapPlacementAudit.test.ts` (test S5
logs the full table; values here are from the 2026-06-12 run at the pinned
config).
