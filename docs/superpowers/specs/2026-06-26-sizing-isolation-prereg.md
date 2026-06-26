# Sizing-field isolation — PRE-REGISTRATION (write-before-run)

**Date:** 2026-06-26 · committed BEFORE the run. Follows up the 3D-direct de-risk (`2026-06-26-evidence-3d-direct-vs-uv.md`), which showed the relief loss is a SIZING/BUDGET limit (not UV-vs-3D-topology). This isolates **sizing-field accuracy** from **budget**.

## Question
Is the relief-fidelity gap (gmsh mushing the tangled lattices) closable in **(u,t)** by an ACCURATE curvature sizing field — and does accurate sizing reach the dense-truth floor at FAR fewer triangles than ours' ~256k?

## Method
`research/bridge/sizingIsolation.test.ts` (PF_SIZING=1). Styles GyroidManifold + BasketWeave, dims `{H:120,Rb:40,Rt:50}`. gmsh-iso under an isotropic curvature sizing field at **sizeRes 32 (band-limited — the all-20 run)** vs **256 (accurate)**, swept across budget (tol ∈ {0.1, 0.05, 0.025, 0.0125}). Score: **RMS** fidelity (`honestGate` / `perpendicular3DDeviation`) + **minAngle** — the honest gates, NOT p99/`%<20°`. Plot RMS vs triangle count; compare the two curves and to the dense-truth floor.

**Dense-truth RMS floor (from the 3D-direct run, 256²→768² invariant):** GyroidManifold ≈ **0.0996 mm**, BasketWeave ≈ **0.2284 mm** (the irreducible near-C0 straddle).

## Pre-registered kill-criteria (FIXED NOW)
- **CONFIRMED** iff, on BOTH styles: at a matched triangle count the **accurate (256) RMS is clearly below the band-limited (32) RMS** (≥10% lower) — i.e. accurate sizing places the same triangles better — AND the accurate curve **reaches ≤ 1.3× the dense-truth floor at < 100k triangles** (vs ours' 256k). → the relief gap is a sizing-accuracy problem, closable in UV at a fraction of ours' budget. Roadmap (UV + accurate sizing) de-risked.
- **REFUTED** iff the two sizeRes curves **coincide** (RMS within ~10% at equal tris) — sizing accuracy doesn't matter, the gap is pure budget (need raw triangle count regardless of metric) — OR **neither curve nears the floor** by the densest budget (UV can't capture it even with accurate sizing → reconsider).

## Controls
Equal-instrument (RMS + minAngle on every mesh); RMS-vs-tris curve so budget is explicit (not confounded with sizing); deterministic (gmsh seed pinned); dense-truth floor as the reference. Surface-patch fidelity probe (watertightness not tested).
