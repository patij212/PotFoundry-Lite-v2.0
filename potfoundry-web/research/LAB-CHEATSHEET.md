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
  auditNonManByIndex, perFaceChordSag, perFaceTrue3DSag, vertErrColors, writeBinarySTL, dumpRenderBins, dumpHeatmap,
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
- **Global RMS is straddle-masked** (a chamfered crest drowns under smooth walls) → sample ON feature loci
  (`buildFeatureTruth` → `featureLineChord3D`), not uniformly.
- **Slivers by minAngle** (`triangleQualityDistribution`, depth-invariant) — `%<20°` DILUTES under refinement.
- **Watertight by INDEX** (`auditNonManByIndex`, 3D-weld) — non-vacuous: an injected crack must move the count.
- **Two different defects, don't conflate:** crest UNDER-shoot (vertex placement, ~density-INVARIANT) vs per-face
  chord SAG (facet bridging, density-RESPONSIVE, reducible by `chordTolMm`).

## Kernel knobs (`InhouseMeshOpts`, `buildInhouseMetricMesh`)
`tolMm` (chord target), `hMin`/`hMax` (edge clamp mm), `sizeRes` (curvature-grid res — band-limited, blind to
sub-cell relief), `maxPoints` (budget), `splitThresh`, `optimizeSweeps`, `chordTolMm` (splits any facet whose
chord sag > tol — the lever to drive the heatmap green), `guardManifoldAlways` (fixes a pre-existing flipHE
non-manifold bug; opt-in, byte-identical off). Conforming: `buildFeatureConformingMeshB` adds `truth`, `lineFilter`
(sharp gate via `computeMeasuredGate().keep`), `injectStepMm`, `pin`, `chordTolMm`.

## Feature-conforming — the settled map (E-2026-06-30-FEAT-CONFORM-*)
- **Conform helps**: thin-ridge / smooth-relief sharp styles — GothicArches (conf true-3D p99: base 0.22 → 0.096 @1M
  → 0.082 @3M, measured E-2026-06-30-SHOWCASE), Gyroid, LowPoly, Crystalline, (Bamboo already CAD-grade at density).
- **EXCLUDE — risers** (ArtDeco/GeometricStar/DragonScales): true-3D already CAD-grade; radial overstates; conforming HURTS.
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
