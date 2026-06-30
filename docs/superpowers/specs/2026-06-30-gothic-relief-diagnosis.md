# GothicArches "missing relief" — diagnosis (2026-06-30)

User saw big chunks of the GothicArches groove pattern missing/ragged in the hi-res montage (2.06M tris).

## Root cause: SMOOTH-SHADING render artifact (not a mesh defect)
The montage render (`surfMontageBin.cjs`) used `flatShading:false` + `computeVertexNormals` — averaging normals
across the sharp near-C0 V-grooves, which visually FLATTENS/fades them ("missing chunks"). The mesh actually
captures the relief: **chord rms 0.0066 mm, p99 0.029, max 0.29 mm** at 2.06M tris. Re-rendered FLAT-shaded
(`surfZoomBin.cjs`, `scratchpad/gothic_flat.png`), the grooves are complete and crisp.

Evidence — a direct chord-sag fidelity guard barely changed it:
| build | tris | chord rms | p99 | max | time |
|---|---|---|---|---|---|
| baseline (metric only) | 2.056M | 0.0066 | 0.029 | 0.291 | 154s |
| + chordTolMm 0.1 | 2.103M | 0.0055 | 0.026 | 0.193 | 486s |

Only +2% triangles and max 0.29→0.19 — i.e. the relief was already captured; the chord-sag guard only trimmed
the worst facets. If the relief had been genuinely missing (aliased), chord-sag would have added many triangles
and dropped the max by mm.

## Fixes
1. **Render sharp relief FLAT-shaded** (or with sharp-edge/face normals). Smooth vertex normals fade near-C0
   grooves regardless of triangle count. The STLs carry the true geometry (per-face normals) — a slicer shows
   the grooves correctly.
2. **`chordTolMm` fidelity guard added to the kernel** (`inhouseMetricMesh.ts`, default-off): split any triangle
   whose DIRECT facet→surface chord-sag (sampled on the true surface, robust to grid-curvature aliasing) exceeds
   the tolerance. Cheap insurance for genuinely sharp/thin relief on other styles; modest on GothicArches because
   its relief was already resolved.

## Residual (minor)
Thin side-grooves are slightly BEADED (resolved as dimple-rows where mesh edges don't align to the thin channel).
Cosmetic; chord is fine. Crease-aligned meshing or more density would clean it — GothicArches is an
extended-feature style where crease-alignment applies.
