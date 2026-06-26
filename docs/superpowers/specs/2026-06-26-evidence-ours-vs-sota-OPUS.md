# Ours vs SOTA — Tangled-Lattice Triangle Quality — EVIDENCE (OPUS run, 2026-06-26)

**Question:** how far is OUR production conforming mesher from SOTA (gmsh-iso / gmsh-aniso / Triangle)
on triangle QUALITY for the 5 tangled-lattice styles? (Quantifies the sliver gap the all-20 re-baseline
showed gmsh closes.)

**Independent of** the sonnet run `docs/superpowers/specs/2026-06-26-evidence-ours-vs-sota.md` /
`research/bridge/oursVsSota.test.ts` — this run corrects two faithfulness defects in it (below) and is
the basis for a head-to-head. Neither the sonnet doc, its registry entry, nor `oursVsSota.test.ts` was
modified.

- **Runner:** `potfoundry-web/research/bridge/oursVsSotaOpus.test.ts` (new; `PF_OURS_VS_SOTA_OPUS=1 npx vitest run …`).
- **Ledger / pre-registration:** `potfoundry-web/research/EXPERIMENT-REGISTRY.md` → `E-2026-06-26-OURS-VS-SOTA-OPUS`
  (kill-criterion fixed BEFORE the run).
- **Scorecard:** `potfoundry-web/research/exchange/_oursvssota_opus/scorecard.json` (24 rows).
- **Dumps (gitignored, SEPARATE dir):** `research/exchange/_oursvssota_opus/<style>__<config>.json` (24 files;
  each `{style, config, ut2 (flat 2-stride), xyz (flat 3-stride, lifted), tris (flat), triCount,
  minAngleDeg, pctUnder20deg, chordP99Mm, vertexMaxMm}`; `__raw.json` siblings keep the engine output).
- **Measured by the project's own instruments** (one-metric-both-meshes): `perpendicular3DDeviation`
  (`src/fidelity/analyticSurfaceGate.ts`) + `triangleQualityDistribution` (`src/fidelity/metrics.ts`).
- **Run:** 26 min, CPU-only, test PASSED. gmsh 4.13.1 / triangle 20230923.

---

## 0. TL;DR

**On every tangled lattice our mesher's WORST triangle angle is 1.7–3.2°; gmsh's is 14.3–19.6°** — a
**12.3–16.4° deficit**, while ours uses **110–213× the triangles**. Density does not help: this is the
project's known density-INVARIANT sliver gap, now measured directly against SOTA. The honest sliver
instrument is **minAngle**, not `%<20°` — `%<20°` *improves* under deeper refinement (Gyroid 10.5→5.2)
purely by diluting a fixed sliver population with well-shaped interior triangles, while the worst angle
stays pinned at ~2°. gmsh-iso CAD-grades all 5 (`%<20°` ≤ 3.8); gmsh-aniso does it with 0.11–0.60× the
tris (genuine this time — 6/6, the sonnet run's aniso was a phantom equal to iso).

---

## 1. The two corrections over the sonnet run (why this run exists)

| | Sonnet run | This run | Why it matters |
|---|---|---|---|
| **gmsh-aniso** | `runOracleEngine` wrote only the scalar `sizing` field, omitted the `metric` tensor → aniso BYTE-IDENTICAL to iso (its own footnote † admits this) | routed through `runStyle(…, {aniso:true})` — the single source of truth that builds `buildAnisotropicMetricField` (2nd fundamental form) and sends gmsh to BAMG (Algorithm 7) | the SOTA frontier needs a real aniso column. **Verified: aniso triCount differs from iso on 6/6 styles** (0.11–0.60×) and matches the all-20 rebaseline's aniso counts (Gyroid 4411≈4457, …). |
| **`ours` opts** | the DEV `__pfConformingProbe` block (`ParametricExportComputer.ts:2205-2213`: maxEdgeMm=8, minEdgeMm=0.2, maxLevel=10) | the production EXPORT path `assemblyOpts` (`ParametricExportComputer.ts:2699-2711`) resolved through the `'high'` default profile: **maxEdgeMm=1, minEdgeMm=0.1, maxLevel=16** (CAD floor); maxSagMm=0.05 as the equal-chord-target control | the probe block is a diagnostic, not the export. The faithful opts refine ~2× deeper (Gyroid 634k vs sonnet 256k tris) → and SURFACE the dilution artifact in `%<20°` (see §4). |

Everything else is held equal to the all-20 rebaseline: `DIMS={H:120,Rb:40,Rt:50,expn:1}`, oracle
`tolMm=0.05, sizeRes=32, hMin=0.005, hMax=0.1`, all 4 configs lifted to 3D via the SAME analytic `rA`
(`measure.ts::liftUtToRadial`) and scored with the SAME two instruments.

`ours` extraction: `buildConformingOuterWall(styleSampler(styleId,{},{H,Rt,Rb,expn}), OURS_OPTS)` →
`{vertices:(u,t,surfaceId), indices}`. `styleSampler` is the production-faithful CPU bridge (dense
512×512 pre-evaluated `GpuSurfaceSampler` — the same discretize-then-bilinear contract the GPU export
uses, so the curvature estimator recovers bounded curvature exactly).

---

## 2. Pre-registered hypothesis & kill-criterion (fixed before running)

**H:** At a common chord target (maxSagMm = tol = 0.05) on the 5 tangled lattices, the production
conforming mesher (PRE-warp, `'high'`-faithful opts) has triangle-quality `%<20°` materially worse than
the best SOTA engine (min over gmsh-iso, gmsh-aniso) — its 2:1-balanced quadtree transition templates
are the structural sliver source — and the gap is NOT explained by triangle budget (ours is DENSER).

**Kill-criterion (conjunctive):** CONFIRMED iff, on ALL 5 tangled lattices,
`ours %<20° > best-SOTA %<20° + 5 pp` **AND** `ours minAngleDeg < best-SOTA minAngleDeg`.
REFUTED if any style is within 5 pp of best-SOTA `%<20°` OR has a worst-angle no worse than best-SOTA.

**Aniso-validity gate (separate):** gmsh-aniso triCount MUST differ from gmsh-iso on ≥ 4 of 6 styles.

---

## 3. Scorecard (◆ = tangled lattice; **bold** = the load-bearing cells)

| style | config | triCount | %<20° | minAngle° | chordP99 mm | vMax mm |
|---|---|---|---|---|---|---|
| **GyroidManifold** ◆ | triangle | 37717 | 12.4 | 11.6 | 0.934 | <0.001 |
| | gmsh-iso | 11168 | 3.0 | 12.1 | 0.968 | <0.001 |
| | **gmsh-aniso** | **4411** | **0.3** | **14.8** | 1.150 | <0.001 |
| | **ours** | **634370** | **5.2** | **2.2** | 0.534 | <0.001 |
| **BasketWeave** ◆ | triangle | 39642 | 13.0 | 11.4 | 0.975 | <0.001 |
| | gmsh-iso | 12331 | 3.8 | 9.6 | 0.940 | <0.001 |
| | **gmsh-aniso** | **5815** | **0.2** | **15.8** | 0.997 | <0.001 |
| | **ours** ‡ | **1165686** | **14.5** | **1.7** | 1.136 | **2.0** |
| **CelticKnot** ◆ | triangle | 50160 | 12.4 | 10.9 | 0.863 | <0.001 |
| | gmsh-iso | 11006 | 2.5 | 11.6 | 0.916 | <0.001 |
| | **gmsh-aniso** | **4077** | **1.1** | **15.9** | 0.957 | <0.001 |
| | **ours** | **756432** | **18.6** | **2.0** | 0.431 | <0.001 |
| **CelticTriquetra** ◆ | triangle | 51734 | 9.8 | 10.2 | 0.499 | <0.001 |
| | gmsh-iso | 15255 | 2.2 | 11.7 | 0.836 | <0.001 |
| | **gmsh-aniso** | **9114** | **1.7** | **14.3** | 0.993 | <0.001 |
| | **ours** | **999766** | **6.6** | **2.0** | 0.113 | <0.001 |
| **GothicArches** ◆ | triangle | 33980 | 12.2 | 12.4 | 0.479 | <0.001 |
| | gmsh-iso | 10614 | 0.8 | 12.7 | 0.495 | <0.001 |
| | **gmsh-aniso** | **3029** | **0.1** | **19.6** | 0.502 | <0.001 |
| | **ours** | **644128** | **8.1** | **3.2** | 0.176 | <0.001 |
| SuperellipseMorph (smooth control) | triangle | 73792 | 19.4 | 9.9 | 0.055 | <0.001 |
| | gmsh-iso | 16509 | 10.4 | 7.8 | 0.101 | <0.001 |
| | gmsh-aniso | 1817 | 27.2 | 9.6 | 0.117 | <0.001 |
| | **ours** | 506172 | 26.2 | 16.2 | 0.004 | <0.001 |

‡ **BasketWeave/ours vMax = 2.0 mm** ⇒ the analytic CPU `rA` diverges from this style's warp convention
(the weave over/under crease floor-flips between GPU-f32 and CPU-f64); its `ours` quality numbers are
REFERENCE-UNTRUSTED and down-weighted. The gap DIRECTION (ours ≫ SOTA) is unaffected. All other styles'
`ours` vMax ≈ 0 (reference trusted).

---

## 4. The SOTA gap, quantified (ours vs best-SOTA = min over gmsh-iso/aniso)

| style | %<20° gap (pp) | minAngle deficit (°) | ours / best-SOTA tris | %<20° leg | minAngle leg |
|---|---|---|---|---|---|
| GyroidManifold | **+4.9** | **12.6** | 144× | REFUTED (≤5) | CONFIRMED |
| BasketWeave ‡ | +14.3 | 14.1 | 201× | CONFIRMED | CONFIRMED |
| CelticKnot | +17.5 | 13.9 | 186× | CONFIRMED | CONFIRMED |
| CelticTriquetra | **+4.9** | **12.3** | 110× | REFUTED (≤5) | CONFIRMED |
| GothicArches | +8.0 | 16.4 | 213× | CONFIRMED | CONFIRMED |

**VERDICT (strict conjunctive criterion): REFUTED** — Gyroid & CelticTriquetra land at `%<20°` +4.9pp,
a hair under the pre-registered 5pp, so the AND-criterion fails on those two. **But the minAngle leg is
CONFIRMED on ALL 5** (deficit 12.3–16.4°). The "letter" refutation is itself the finding (§5.1).

---

## 5. Mechanisms (what the numbers mean)

### 5.1 `%<20°` is a DILUTION ARTIFACT under deep refinement; minAngle is the depth-invariant truth
At production `maxLevel=16`, `ours %<20°` is *lower* than at the sonnet's `maxLevel=10`
(GyroidManifold 5.2 vs 10.5; CelticTriquetra 6.6 vs 7.4) — **not because the slivers shrank** but because
deep refinement floods the mesh with hundreds of thousands of well-shaped interior triangles that DILUTE
the fixed transition-fan sliver population. The proof it is dilution, not repair: **minAngle is unmoved at
~2°** (and the chord/topology is identical in kind). So a `%<20°` that *drops* as you refine is a sizing
artifact, while the **worst angle (≈2°, vs SOTA's 14–20°) is the honest, depth-invariant sliver signal.**
This is why the strict AND-criterion REFUTED on 2 styles yet the defect is unambiguous: the right metric
(minAngle) confirms it 5/5; the depth-sensitive metric (`%<20°`) does not.

### 5.2 Density does NOT fix slivers — measured directly
Ours is **110–213× DENSER** than best-SOTA and STILL more slivered (worse `%<20°` AND worse minAngle on
every tangled style). "Ours is just coarser" is decisively ruled out. This is the project's documented
**density-INVARIANT sliver gap** (memory: crease-density breakthrough; dual-gate findings), now quantified
against SOTA. No triangle budget closes a worst-angle of ~2°, because the source is structural: the
periodic-balanced quadtree's **2:1 transition-fan templates** (prior `TRI_SOURCE`=TRANSITION_FAN). The
transition-free Frontal-Delaunay (gmsh) has no such templates → no transition slivers.

### 5.3 The SOTA frontier
- **gmsh-iso CAD-grades all 5** tangled lattices (`%<20°` ≤ 3.8) at 11–15k tris.
- **gmsh-aniso** does it with **0.11–0.60× the iso tris** AND a BETTER worst-angle (14.3–19.6° vs iso's
  9.6–12.7°) on the tangled lattices — anisotropy is a triangle-EFFICIENCY win where the metric is
  genuinely directional (lattice ridges). **But it OVER-stretches the isotropically-high-frequency smooth
  control** (SuperellipseMorph `%<20°` 10.4 → 27.2). ⇒ quality-robust universal choice = ISOTROPIC
  transition-free Delaunay; aniso = SELECTIVE efficiency (matches the all-20 rebaseline conclusion).

### 5.4 The chord column is NOT comparable for `ours` (warp caveat)
`buildConformingOuterWall` returns the PRE-warp (u,t) quadtree grid; the crease-warp
(applyUWarp/applyTWarp/applyHelixWarp) is applied downstream in `WatertightAssembly`. The 2:1 transition
slivers ARE a (u,t)-topology property and ARE present here (so the quality comparison is valid), but the
3D angles on warped tangled styles differ from production final output. The `ours` chordP99 (0.11–1.14mm,
sometimes LOWER than the oracles) measures the un-warped surface and must NOT be read as a production
chord or as "ours has better chord". All 4 configs are lifted identically via `rA`, so the relative
QUALITY comparison is equal-footing; the absolute `ours` chord is not.

---

## 6. Threats to validity / honesty

- **Equal chord target, NOT equal triangle budget.** All 4 configs target sag/tol = 0.05; counts differ.
  The criterion is robust BY DESIGN: ours is worse quality while 100–200× DENSER, so "coarser" is
  excluded. (Equal-budget would only widen the gap — fewer ours triangles = fewer good interior tris to
  dilute the slivers = HIGHER `%<20°`.)
- **PRE-warp `ours`** (warp caveat, §5.4): quality gap is a (u,t)-topology signal, not a production
  absolute on warped styles.
- **BasketWeave/ours REFERENCE-UNTRUSTED** (vMax 2.0mm, §3): down-weighted; direction holds.
- **minAngle is a single worst triangle.** It is corroborated by the project's prior `TRI_SOURCE`
  attribution (100% TRANSITION_FAN) and by the fact that ALL 5 styles show the same ~2° floor independent
  of depth — i.e. it is not one freak triangle but the template family's structural minimum.
- **Single tol (0.05), grid res 32, deterministic** (Triangle; gmsh seed pinned). Re-runnable from the
  ledger command.

---

## 7. Recommendation

Destination unchanged from the sonnet run and the all-20 rebaseline — **replace the
`PeriodicBalancedQuadtree` + transition-fan templates with a transition-free constrained-Delaunay quality
loop** over the (u,t) domain under the surface metric (`cdt2d` / `@kninnug/constrainautor`, already
shipped + the proven crossing-PSLG planarization, + a Ruppert/Chew loop), **isotropic-by-default**
(quality-robust on all 20), with **selective anisotropy** for directional lattices (efficiency). gmsh-iso
is the universal dev oracle; gmsh-aniso the selective one.

**Two method corrections this run establishes for any future mesher scorecard:**
1. **Score slivers by minAngle (and a `pctBelow-X` vs density sweep), not `%<20°` alone** — `%<20°` is a
   dilution artifact under deep refinement and will falsely report "improvement".
2. **Always route aniso through `runStyle({aniso:true})`** — this run's 6/6 genuineness vs the sonnet's
   0/6 phantom (the metric tensor is silently dropped if you hand-roll the oracle call).

**Next cheap experiment (NEXT-SESSION-meshing-lab §3 — in-circle isolation):** does a metric-aware
in-circle on the SAME point set close the minAngle gap, or is it specifically the transition templates?
That isolates "points vs triangulation" before committing to the kernel build — the cheapest discriminator
for the rebuild's central design choice.
