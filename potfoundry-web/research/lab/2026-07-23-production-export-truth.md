# Production Export Truth — Pass 1 (measured, real GPU pipeline)

_Generated from `e2e/baselines/production-export-truth-pass1.json` — measured through the REAL in-app export pipeline (WebGPU eval + WatertightAssembly + the actual `validateMeshForExport` download gate) on an NVIDIA Turing adapter, MAX-first, at PRODUCTION dims (`{"H":120,"top_od":140,"bottom_od":90,"r_drain":10}`) + registry-default params. Ruler: `measureProjectorMax` (one-sided Hausdorff mesh→exact rA, no exclusion loci ⇒ cliffs measured); watertight via `topologyMetric`. Certify iff `max ≤ 0.01mm ∧ boundary=0 ∧ download-gate pass ∧ referenceTrusted`._

**What OFF vs ON mean:** OFF = what a user exports TODAY (old conforming mesher, all perfect-mesher flags off). ON = the flag-gated structured emitter for that style (`__pfPerfectMesher` + the per-family sub-flag).

> ⚠ **RULER CAVEAT (2026-07-23, corrected):** `measureProjectorMax` measures vs the **single-valued** analytic
> `rA`, so it is honest ONLY for styles whose surface is single-valued radial — the SMOOTH styles (+ LowPolyFacet,
> whose facets are single-valued). For **riser/tread styles with genuine vertical walls (DragonScales rings/scale-tips,
> BambooSegments treads)** it **INFLATES** the (faithful-by-construction) vertical tread facets to ~half the step
> height, because `rA` has no vertical face to project onto. This was CONFIRMED: the DS cone-fan floors at ~0.82mm by
> BOTH `measureProjectorMax` (0.822) AND the campaign's own `perFaceTrue3DSag` (0.825) — both `rA`-based, both share the
> limitation (vertexMax ≈ 0.00001, i.e. vertices ARE on the surface; only the tread-facet chord is inflated). So the
> **DragonScales/BambooSegments ON `maxMm` below are UPPER BOUNDS dominated by tread inflation, NOT confirmed fidelity
> failures.** Their TRUE MAX needs the parametric-Φ projector (`buildParametricSurfaceProjector`, parallel-agent asset)
> or a smooth-complement measurement. The smooth-style + LowPoly numbers are unaffected.

| Style | OFF max·wt·tris·gate | ON max·wt·tris·gate·refTrust | flag-wired | verdict (ON) |
|---|---|---|---|---|
| HarmonicRipple | 0.00954·wt·4.87M·ok | 0.00386·wt·9.74M·ok·T | WIRED | **CLOSED-holds** — OFF already holds too (closure may be redundant) |
| SuperellipseMorph | 0.00312·wt·1.41M·ok | 0.00423·wt·2.29M·ok·T | WIRED | **CLOSED-holds** — OFF already holds too (closure may be redundant) |
| FourierBloom | 0.00404·wt·4.57M·ok | 0.00332·wt·6.35M·ok·T | WIRED | **CLOSED-holds** — OFF already holds too (closure may be redundant) |
| SpiralRidges | 0.04731·wt·5.68M·ok | 0.00316·wt·11.61M·ok·T | WIRED | **CLOSED-holds** |
| SuperformulaBlossom | 0.00129·wt·1.11M·ok | 0.00309·wt·0.82M·ok·T | WIRED | **CLOSED-holds** — OFF already holds too (closure may be redundant) |
| WaveInterference | 0.00750·wt·1.39M·ok | 0.00407·wt·3.07M·ok·T | WIRED | **CLOSED-holds** — OFF already holds too (closure may be redundant) |
| LowPolyFacet | 0.00102·wt·1.62M·ok | ERR page.evaluate: Error: Fidelity: under-te | ? | **ON-ERROR** (page.evaluate: Error: Fidelity: under-test generateMesh retu) |
| DragonScales | 0.82032·wt·9.41M·ok | 0.82304·wt·18.97M·ok·T | WIRED | **CLOSED-refuted** (gap 0.82304mm) |
| BambooSegments | 0.91391·wt·4.97M·ok | ERR page.evaluate: Error: Fidelity: under-te | ? | **ON-ERROR** (page.evaluate: Error: Fidelity: under-test generateMesh retu) |

## Post-audit corrections (2026-07-23 pm)

- **BambooSegments — null FIXED and fidelity CONFIRMED (genuine closure).** The ON `generateMesh` null was the pow2-rim
  bug (`buildConformingWall` needs pow2 `nRing`); fixed by snapping the emitter nU to a power of two (commit `8d7cdd77`).
  Re-probed through the live pipeline: ON now builds a **watertight** mesh (nRing=2048, boundary=0, download-gate pass).
  The full-mesh `maxMm` (0.86) is tread-wall inflation. ⚠ **CORRECTED (evening): the ISOLATED emitter closes (bridge
  smooth complement 0.00448mm at fine sag-tol 0.004), but the REAL PIPELINE tread-aware run reports smoothMax = 0.121**
  (watertight, gate-pass) — so Bamboo does NOT close at the export's DEFAULT quality. The gap (0.12 pipeline vs 0.0045
  isolated) is a sag-tol/`tWarp=L3`/geometric-filter reconciliation (the emitter uses `sagTolMm=qMaxSag`, coarser than
  the bridge's 0.004; Bamboo's node-bulges need finer tessellation than the smooth styles). **NET: the null FIX is a
  real win (watertight export); the production FIDELITY is UNRESOLVED — do NOT re-classify Bamboo CLOSED-holds yet.**
- **DragonScales — does NOT close at MAX (scale-tip cones); p99-CAD-grade only.** MEASURED: the full-mesh 0.82 IS tread
  inflation (rA-ruler), but the geometric smooth complement (faces with vertex-radius-spread > 0.2mm excluded) still
  floors at **MAX 0.0965mm** with **p99 0.0088mm** (vtx 0.00001). So DS ≠ Bamboo: excluding the risers reveals a real
  residual at the **scale-tip cone apex** (a near-point singularity the radius-spread filter can't remove, and the
  cone-fan reduces but does not bring to ≤0.01). This matches the prior "certify on MAX, never p99 — MAX 0.10–0.13
  hides at scale-tip cones" finding ([[project_ds_rim_bug]]). **DS's "closure" was p99-scoped; the honest MAX (~0.096)
  is an OPEN frontier.** (Bamboo, by contrast, genuinely closes at MAX 0.0045 — its treads are the only vertical
  feature; DS additionally has the scale-tip cones.)
- **LowPolyFacet — ON still null** (facet-align nU=864 non-pow2, can't be pow2). Deferred; OFF already holds 0.00102.

## Summary

- Styles measured: **9/9**.
- **CLOSED-holds (ON emitter ≤0.01mm + watertight + gate + trusted): 6** — HarmonicRipple, SuperellipseMorph, FourierBloom, SpiralRidges, SuperformulaBlossom, WaveInterference.
- Already ≤0.01mm on OFF (today's mesher, closure redundant): 6 — HarmonicRipple, SuperellipseMorph, FourierBloom, SuperformulaBlossom, WaveInterference, LowPolyFacet.
- Slivers: full-solid `minAngle` runs sub-degree across styles (base/drain cap fans, not the wall) — a separate pre-existing concern for both OFF and ON.
