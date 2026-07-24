# Meshing Lab — cheat-sheet (read FIRST, before pre-registering)

Dev-only lab in `potfoundry-web/research/`. `src/` NEVER imports `research/`. Everything below is battle-tested this
arc — reason from it, don't re-derive. Full history + verdicts: `research/EXPERIMENT-REGISTRY.md` (**read it before
pre-registering so you don't re-test a refuted hypothesis**).

## Import instruments from `labkit` — do NOT re-code them
`research/bridge/labkit.ts` is the one barrel. New probes import from it:
```ts
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureConformingMeshB, computeMeasuredGate, recoverAndLockEdges,
  buildMeshUt, buildLocator, buildFeatureTruth,
  featureLineChord3D, crestValleyRetention, featureAdjacentSlivers, perpendicular3DDeviation, triangleQualityDistribution,
  auditNonManByIndex, nonManRawBig, nonManRawBigStats, perFaceChordSag, perFaceTrue3DSag, vertErrColors, writeBinarySTL, dumpRenderBins, dumpHeatmap,
  bruteNearestOnRadialSurface, bruteAnchoredRedPerp,
} from './labkit';
```
`auditNonManByIndex`, `perFaceChordSag`, `perFaceTrue3DSag`, `vertErrColors`, `writeBinarySTL`, `dumpRenderBins`,
`dumpHeatmap` were copy-pasted inline across 3+ probes before — their home is now labkit. `labkit.test.ts`
(PF-ungated, fast) guards them.

## Metric discipline — the gotcha that cost a round
- **RADIAL / same-(u,t) chord OVERSTATES near-vertical features 2–370×** (measured across all 20; ArtDeco radial
  "3.35mm" ≙ true-3D 0.039mm; GothicArches radial 1.12 ≙ true-3D 0.13). This is the WHOLE reason a mesh looks red on
  the old heatmap while being CAD-grade faithful — it's the ruler, not the mesh. E-FRONTIER-BUILD3 / E-SWEEP-METRIC-MAP.
- **DEFAULT HEATMAP = TRUE-3D.** Colour with `dumpHeatmap(dir,name,xyz,ut,idx,rA,H)` (honest `perFaceTrue3DSag` =
  facet→NEAREST-surface distance; writes `meta.ruler='true3d'` so the renderer legend says so). Pass `{ruler:'radial'}`
  only for an A/B against the legacy `perFaceChordSag` (facet→same-(u,t) plane distance). `perFaceTrue3DSag` pre-filters
  by the same-(u,t) bound so the projection runs only on facets that carry real residual (fast).
- **For any FIDELITY verdict use TRUE-3D** `featureLineChord3D` (nearest-surface on feature loci) or `perFaceTrue3DSag`
  / `perpendicular3DDeviation` (facet→surface). Report the radial number only as a screen, and state both when unsure.
- **STEEP LATTICES: single-seed GN OVERSTATES true-3D up to ~7×** (E-2026-07-02-STEEP-HETEROGENEITY / F2: Gyroid GN
  0.644 ≙ brute-trusted 0.092). `perFaceTrue3DSag` / `perpendicular3DDeviation` (both use `projectPointToRadialSurface`)
  stall in WRONG-LOCAL-MINIMUM feet on tangled lattices (Gyroid/CelticTriquetra/…). For a steep-red VERDICT use
  `bruteAnchoredRedPerp(ut,idx,rA,H,{radial})` — the worst-N brute twin (full-azimuth `bruteNearestOnRadialSurface`,
  keeps the SMALLER distance; seconds). Whole-mesh anchoring is ~3.4h — infeasible; the p99 signal lives in the worst
  facets. Do NOT trust the raw-GN heatmap red p99 on steep lattices; `bruteAnchoredRedPerp` returns `gnP99` next to
  `trustedP99` + `gnOver` so you can SEE the overstatement. `trustedP99` is CENTROID-anchored (faithful to the convene
  twin) ⇒ it reads ≤ the 4-point `perFaceTrue3DSag` ruler — it corrects GN's centroid overstatement, NOT the facet's
  worst-interior perp. Probe: `_gnPerpAnchor.test.ts` (PF_GNANCHOR=1).
- **Global RMS is straddle-masked** (a chamfered crest drowns under smooth walls) → sample ON feature loci
  (`buildFeatureTruth` → `featureLineChord3D`), not uniformly.
- **Slivers by minAngle** (`triangleQualityDistribution`, depth-invariant) — `%<20°` DILUTES under refinement.
- **Watertight by INDEX** (`auditNonManByIndex`, 3D-weld) — non-vacuous: an injected crack must move the count.
  **RAW-index / large meshes:** every Map-based audit dies at V8's ~16.7M-entry cap (≥~5.6M tris, "Map maximum size
  exceeded") — use `nonManRawBig` (count) / `nonManRawBigStats` (+edges/boundary): sorted-key run-length scan, no cap,
  exact for all u32 indices. `_pf_tangledKernelLib.auditNonManRaw` now delegates to it (deprecated alias).
- **Two different defects, don't conflate:** crest UNDER-shoot (vertex placement, ~density-INVARIANT) vs per-face
  chord SAG (facet bridging, density-RESPONSIVE, reducible by `chordTolMm`).

## The SAMPLER is blind — score against the EXACT surface (E-2026-07-24-ANALYTIC-SCORE)
The conforming refiner's own surface is a BILINEAR grid (`GpuSurfaceSampler`). Its max deviation from
the exact `buildAnalyticRadiusFn` surface at PROD dims, **at the production 256² export grid**
(`ParametricExportComputer` `DENSE_RES_U`, NOT the lab `styleSampler`'s 512²):
Crystalline **1.29**, Gyroid **1.24**, GeoStar **1.18**, Voronoi **0.48**, HarmonicRipple **0.22** mm.
The sizing field commands edges **4.8–22.6× too long** (h_cmd/h_req at a 0.01mm target) and cannot see it.
⇒ **A sampler-scored mesh can never converge below its own grid error.** Symptom: a build that stops at
0.4M triangles out of a 12M budget with 21% of facets over 0.01mm (`chosenScale 1`, `capSaturated false`)
— surface-starved, NOT budget-starved. ALWAYS print `wall.budget` before blaming density.
- **Lever:** `globalThis.__pfConformingAnalyticScore = true` + pass `analyticRA`/`analyticH`
  (+ `analyticSagMm`, default = `maxSagMm`) to `buildConformingWall`. Default OFF ⇒ byte-identical.
  Measured: Crystalline MAX 0.524→0.0737 (0.00793 off-pin-band, **0.00% over-0.01**), Gyroid 0.982→0.112,
  HarmonicRipple 0.102→0.0133 — at EQUAL budget. p99 tracks `analyticSagMm` 1:1 (it CONVERGES).
  Cost 3.7–4.3× tris; sliver cost is style-dependent (Gyroid %<20° 6.7→25.4; Crystalline/Ripple zero).
  NO-OP where analytic FEATURE LINES already refine the locus to `featureLevel` (GeoStar: −1.2%).
- **The `levelCap` PIN-GRADED BAND is the next wall, and it defeats EVERY criterion:**
  `levelCap = min(maxLevel, pin + floor(nearEdge·2^pin))`, `pin = log2(nRing) − uBias`. At nRing 256 /
  uBias 2 the whole band `t<0.078` is capped at level ≤7. It is DENSITY-INVARIANT by construction — if
  your worst facet sits at `t≈0.00x` or `t≈0.99x`, raise `nRing` before theorising (GeoStar MAX
  0.11998→0.03226 from nRing 256→2048 alone). Report MAX with the band excluded, and say so.

## Kernel knobs (`InhouseMeshOpts`, `buildInhouseMetricMesh`)
`tolMm` (chord target), `hMin`/`hMax` (edge clamp mm), `sizeRes` (curvature-grid res — band-limited, blind to
sub-cell relief), `maxPoints` (budget), `splitThresh`, `optimizeSweeps`, `chordTolMm` (splits any facet whose
chord sag > tol — the lever to drive the heatmap green), `guardManifoldAlways` (fixes a pre-existing flipHE
non-manifold bug; opt-in, byte-identical off). Conforming: `buildFeatureConformingMeshB` adds `truth`, `lineFilter`
(sharp gate via `computeMeasuredGate().keep`), `injectStepMm`, `pin`, `chordTolMm`.

## Feature-conforming — the settled map (E-2026-06-30-FEAT-CONFORM-*)
- **Conform helps**: thin-ridge / smooth-relief sharp styles — GothicArches (conf true-3D p99: base 0.22 → 0.096 @1M
  → 0.082 @3M, measured E-2026-06-30-SHOWCASE), Gyroid, LowPoly, Crystalline, (Bamboo already CAD-grade at density).
- **EXCLUDE — risers** (ArtDeco/DragonScales): true-3D already CAD-grade; radial overstates; conforming HURTS.
  **GeometricStar CORRECTED (E-2026-07-24-GEOSTAR-LOCUS):** it was on this list because it was conformed to the WRONG
  locus. The shipped `extractGeometricStar` full-height columns at u=(k+0.5)/N are a MAX **no-op** (0.73357 =
  bit-identical to no-lines) — 97.3% of each column is provably non-feature. The real locus is the strapwork RAMP
  (`dStrap=0`/`dStrap=edge` level curves — a chevron ZIGZAG, C1-SMOOTH but steep: Δr 2.235mm over 0.659mm arc ⇒ needs
  ≤0.05mm facets). Emitting it (`geoStarExactLoci`, default OFF) → MAX 0.734→0.120, **off-seam 0.734→0.017**, p99
  0.0946→0.0073, over-0.1mm 0.921%→0.000%. Residual = the u-seam `clipFeaturesToBox` band (density-INVARIANT).
  NB `styleSampler` is a 512² bilinear grid whose OWN error on GeoStar is **0.60mm** (production's 256² grid: **1.18mm**)
  — the sag refiner is blind to any sub-grid-cell relief, which is why ANALYTIC lines (not density) are the lever.
  See the SAMPLER-IS-BLIND section above: `__pfConformingAnalyticScore` is the general form of the same medicine.
  **GeoStar's 0.11998 was NOT the u-seam clip alone** — it was the clip band AMPLIFIED by the `levelCap` pin grading;
  nRing 256→2048 alone gives 0.03226 (E-2026-07-24-ANALYTIC-SCORE §4).
- **EXCLUDE — weave/braid** (BasketWeave/CelticKnot/CelticTriquetra): step/occlusion-discontinuous relief. Conforming
  trades slivers for a true-3D chord regression — REFUTED that better loci OR no-lock rescue it (inject-only ≈ locked).
- **Gate is mandatory**: applying conform to a smooth style (HarmonicRipple) wrecked it 0.023→3.56mm.
- **Discriminator**: step/occlusion-discontinuous (weave/braid → exclude) vs smooth/thin-ridge (conform helps).
- **Universal win**: `guardManifoldAlways` → 20/20 nonMan=0.

## Resilience (the environment kills long runs — plan for it)
- **One env-gated probe per question** (`it.skipIf(process.env.PF_X !== '1')`) so a killed run RESUMES by re-running
  only the unfinished probe. This is why work survived 6+ crashes this arc.
- **Checkpoint: dump/append each unit's result the INSTANT it's computed** (`dumpRenderBins` per mesh, append the
  registry row / ndjson per style) — never only at the end.
- **No single multi-hour unit.** Screen at moderate budget (~0.3–0.8M), high-density confirm only the flagged few.

## Render (see `research/render/README.md`)
`dumpHeatmap(...)` (default true-3D ruler) or `dumpRenderBins(...)` in the probe → `NODE_PATH="$(pwd)/node_modules"
node research/render/meshRender.cjs out.png <binDir> <cols> <names...>`. Auto-heatmaps if a `.col.bin` is present; the
legend labels the ruler from `meta.ruler` (true-3D perpendicular = honest default; radial = OVERSTATES steep relief).
Per-cell label shows worst / p99 / %>0.03 / nonMan from the meta. FLAT-shade sharp relief (smooth normals fade near-C0
grooves). Example: `research/bridge/_heatmapDefaultSmoke.test.ts` (PF_HEATSMOKE=1).

## Return concisely
Full scorecard → the registry file. Your return = HYPOTHESIS / DISCRIMINATOR / KILL-CRITERION / EVIDENCE (headline
numbers) / VERDICT / RECOMMENDATION / LEDGER(path+sha). Don't inline a 400k-token scorecard.

## Lab (multi-agent) — organ of last resort for contested/frontier work
- **Solo vs convene:** cheap mechanical sweep → dispatch solo `meshing-researcher`.
  Contested finding / frontier wall / DEGENERATING programme / "trust this" → convene the
  `meshing-lab` skill (PI + 7-8 specialists, generative→falsification→anti-closure).
- **Durable state:** `research/programme-scorecard.md` (A1), `research/assumption-ledger.md`
  (C2), `research/lab/<arc>-transcript.md` from `research/lab/TRANSCRIPT-TEMPLATE.md`
  (FINDINGS + SURPRISES + CLOSE-GATE RECEIPTS). Validate format:
  `node research/lab/validateLedgers.cjs <files...>`.
- **Invariant unchanged:** generative organs only propose/score ("if true, how much does it
  reprice?"); a measurement still closes everything.
