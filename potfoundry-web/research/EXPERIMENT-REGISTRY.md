# Meshing Research Lab — Experiment Registry

This file records reproducible experiment runs for the PotFoundry meshing research lab.
Every row is the output of `runStyle()` with a fixed random seed (none needed — the
pipeline is deterministic) from `research/bridge/runStyle.ts`. The one-metric-both-meshes
contract: every oracle run (triangle or gmsh) is scored with the same `measureOracleMesh`
call using perpendicular-3D deviation (the real chord metric, not radial approximation).

Engines: **gmsh 4.13.1** / **triangle 20230923**. Python venv: `research/oracle/.venv`.

---

## Task 5 — Two-Style End-to-End Spike (2026-06-26)

### Style selection

| Slot    | StyleId          | Reason |
|---------|------------------|--------|
| SMOOTH  | `HarmonicRipple` | Clean sinusoidal ripple; zero creases; CAD-grade chord in the export baseline; representative of the 13/20 smooth-clean tier |
| TANGLED | `GyroidManifold` | Smooth-relief tangled lattice; H1 headline style; no crease/straddle exclusion needed; the primary density-gap target in Phase-1B |

Both avoid the brief's banned crease styles (BasketWeave / CelticKnot / CelticTriquetra / GeometricStar).

### Parameters

```
DIMS   = { H: 120mm, Rb: 40mm, Rt: 50mm, expn: 1 }
opts   = { tolMm: 0.1, sizeRes: 24, hMin: 0.003, hMax: 0.08 }
```

### 2×2 Scorecard

| style            | engine   |  tris | chordP99Mm | chordMaxMm | vertexMaxMm | pctUnder20° | minAngleDeg | engineMs |
|------------------|----------|------:|------------|------------|-------------|-------------|-------------|----------|
| HarmonicRipple   | triangle | 62154 | 0.2947     | 0.8141     | 0.000005    | 39.1%       | 5.9°        | 70       |
| HarmonicRipple   | gmsh     | 21673 | 0.7022     | 1.8909     | 0.000005    | 36.9%       | 7.2°        | 723      |
| GyroidManifold   | triangle | 13682 | 0.9675     | 1.5783     | 0.000064    | 11.6%       | 12.2°       | 14       |
| GyroidManifold   | gmsh     |  5431 | 1.0134     | 1.6692     | 0.000031    | 1.0%        | 15.9°       | 215      |

### Observations

1. **vertexMaxMm ≈ 0** for all 4 runs (max 0.000064mm — well below the 0.05mm gate).
   Confirms: `liftUtToRadial` correctly places oracle mesh vertices on the analytic surface;
   the sizing field → oracle → measurement chain is end-to-end consistent.

2. **chordP99 is finite and engine-distinguishable** for both styles. triangle produces
   more triangles (Delaunay refiner without size field smoothing) and correspondingly
   lower chord for HarmonicRipple (0.29 vs 0.70mm). The chord gap is real data for Phase-1B.

3. **HarmonicRipple chord (triangle 0.29mm, gmsh 0.70mm)** both exceed the 0.1mm CAD target —
   expected: `sizeRes=24` is a coarse spike grid. Phase-1B will raise resolution + add the
   anisotropic gmsh metric field to close this.

4. **GyroidManifold chord (~0.97–1.01mm)** is above HarmonicRipple's, consistent with the
   lattice's known broad-3D-gap characteristic (project memory: density-responsive, L10
   depth-cap was the root cause). The density lever will be exercised in Phase-1B.

5. **Triangle quality gap**: HarmonicRipple has 39% triangles under 20°; GyroidManifold
   has only 1–12%. This is the Stage-2 quality gap identified in the dual-gate findings
   (project memory: quality gap is density-invariant). gmsh produces fewer but better-shaped
   triangles (minAngle 15.9° vs 12.2° for GyroidManifold), confirming gmsh's quality
   constraint is active.

6. **No timeout, no over-refinement.** HarmonicRipple triangle produced 62k tris in 70ms
   (high count due to Delaunay flooding at hMin=0.003 without a smooth sizing cap).
   No style exceeded the 180s test timeout. No spike findings on refinement explosion.

7. **No `sizeRes` / `hMin` adjustments needed.** Both styles meshed cleanly at the brief's
   default parameters.

### GO/NO-GO Verdict

**GO.**

Both engines produce measurable, sane ScoreRows for both styles:
- vertexMaxMm ≈ 0 (analytic lift contract holds)
- chordP99 and minAngleDeg are finite and vary meaningfully across engines
- No crashes, no timeouts, no NaN

The full loop (sizing field → OracleInput → Python oracle CLI → ingest → perpendicular-3D
measure) is proven end-to-end on a smooth style (HarmonicRipple) and a tangled lattice
(GyroidManifold). The chord numbers are above the 0.1mm CAD target as expected for a
coarse spike grid — that is Phase-1B's job (anisotropic gmsh metric + all-20 styles +
higher resolution).

### Phase-1B next step

Raise `sizeRes` (48–64) and pass the isotropic `h` field as a `bgm`-format gmsh background
mesh metric to drive triangle sizes. Add anisotropic principal-curvature directions for the
tangled lattice styles. Run all 20 styles; gate on chord P99 < 0.1mm + minAngle > 20°.
