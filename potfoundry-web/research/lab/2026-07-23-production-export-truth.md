# Production Export Truth — Pass 1 (measured, real GPU pipeline)

_Generated from `e2e/baselines/production-export-truth-pass1.json` — measured through the REAL in-app export pipeline (WebGPU eval + WatertightAssembly + the actual `validateMeshForExport` download gate) on an NVIDIA Turing adapter, MAX-first, at PRODUCTION dims (`{"H":120,"top_od":140,"bottom_od":90,"r_drain":10}`) + registry-default params. Ruler: `measureProjectorMax` (one-sided Hausdorff mesh→exact rA, no exclusion loci ⇒ cliffs measured); watertight via `topologyMetric`. Certify iff `max ≤ 0.01mm ∧ boundary=0 ∧ download-gate pass ∧ referenceTrusted`._

**What OFF vs ON mean:** OFF = what a user exports TODAY (old conforming mesher, all perfect-mesher flags off). ON = the flag-gated structured emitter for that style (`__pfPerfectMesher` + the per-family sub-flag).

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

## Summary

- Styles measured: **9/9**.
- **CLOSED-holds (ON emitter ≤0.01mm + watertight + gate + trusted): 6** — HarmonicRipple, SuperellipseMorph, FourierBloom, SpiralRidges, SuperformulaBlossom, WaveInterference.
- Already ≤0.01mm on OFF (today's mesher, closure redundant): 6 — HarmonicRipple, SuperellipseMorph, FourierBloom, SuperformulaBlossom, WaveInterference, LowPolyFacet.
- Slivers: full-solid `minAngle` runs sub-degree across styles (base/drain cap fans, not the wall) — a separate pre-existing concern for both OFF and ON.
