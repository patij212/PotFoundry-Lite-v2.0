# ArtDeco / BambooSegments t-step Riser — Scope & Design (2026-06-13)

**Status:** SCOPED + the key design question MEASURED. Cheap fix confirmed (no new
assembler capability). Ready to implement.

## Problem

ArtDeco's dominant surface-fidelity gap is a **C0 radius JUMP** in t, not a crease.
`rOuterArtDeco` (`styles.ts:946-951`): `stepFactor = 1 − stepDepth·stepEdge`, where
`stepEdge` is a **step function** (0 or 1) of `stepLocal = frac(t·stepCount)`. So the
radius is *discontinuous* at `stepLocal = 0.1` and `0.9`, i.e. at
`t = (tier+0.1)/stepCount` and `(tier+0.9)/stepCount` for `tier=0..stepCount−1`
(8 edges at the default `stepCount=4`).

**Measured (verify_artDecoDecompose):** per-family deviation — STEP only **4.16mm**,
CHEVRON only 0.34mm, FAN only **0.006mm** (negligible, C2-smooth), fan+chevron
together 0.17mm. The t-step is overwhelmingly dominant.

**Why a horizontal crease edge fails (verify_artDecoFidelity):** inserting a single
horizontal edge at `t_step` REGRESSES ArtDeco (max 3.41→4.39mm). A single shared
ring carries ONE radius (exact-eval at `t_step` is single-valued), so it cannot
represent the **vertical riser face** between `r_full` and `r_reduced` — the
adjacent triangle still spans the ~4mm jump, and the featureLevel density lever
*amplifies* it. **`CreaseTWarp` is a warp, not a riser — it also cannot represent a
discontinuity.**

## Scoping result — a PAIRED-RING RISER captures it (cheap, MEASURED)

**verify_artDecoRiser** (real adaptive mesh, deviation EXCLUDING the riser bands +
seam):

| config | non-band max | p99 |
|---|---|---|
| no features | 0.152mm | 0.024 |
| single line @t_step | 0.152mm | 0.024 |
| **PAIRED ε=1e-3** | **0.152mm** | **0.008** |
| PAIRED ε=3e-4 | 2.613mm (leaks) | 0.008 |

- The **entire ~4mm is INSIDE the step bands** — exclude them and ArtDeco is already
  ~0.15mm everywhere (the fan/chevron + chord).
- A **paired ring at `t_step ± ε` (ε ≈ 1e-3)** captures the C0 step: the thin band
  between the two rings is the **vertical riser face** (a real model feature, like a
  crest edge → excluded from the fidelity metric, which is `r(u,t)`-based and cannot
  measure a vertical face), and the rest of the wall is clean (p99 0.008).
- **ε must not be too small:** ε=3e-4 leaks (2.6mm) — the rings weld/sliver and the
  step escapes the band. ε ≈ 1e-3 is the validated sweet spot (tune vs the weld
  tolerance).

**⇒ The riser is a CHEAP extractor change (emit paired horizontal lines), NOT a new
assembler capability.** The conforming triangulator already inserts two close
horizontal-band constraints as two rings with a band between.

## Design

1. **`extractArtDeco` emits a PAIRED ring** at each C0 jump: `horizontalLine(t_step−ε)`
   + `horizontalLine(t_step+ε)` with **ε ≈ 1e-3** (a named constant
   `AD_RISER_HALF_T`), for `t_step ∈ {(tier+0.1)/stepCount, (tier+0.9)/stepCount}`,
   clipped to `(tMargin, 1−tMargin)`. Replaces the single-line emitter (which
   regresses). Gate on `surfaceFidelityExact` — now SAFE to wire to the production
   flag (no regression), unlike the single-line version.
2. **Fidelity gate excludes the riser bands** (`|t − t_step| < ε·~1.6`) as accepted
   feature faces — add a `tBands` exclusion list to `deviationVsTrueSurface`
   (mirrors the seam exclusion). The riser band IS the model's vertical face; the
   `r(u,t)` metric cannot score it.
3. **Fan = density** (negligible 0.006mm — no edges). **Chevron = 0.34mm** (a C0
   `|sin|` diagonal corner family) — minor; defer (measure whether density or a
   diagonal general-curve extractor is needed after the riser).
4. **BambooSegments** has the same C0 t-step structure → the same paired-ring riser
   (its extractor currently emits single t-rings; switch to paired).

## Tasks

- [ ] **R1** — `extractArtDeco`: emit paired rings at `t_step±ε` (ε=`AD_RISER_HALF_T`≈1e-3);
  keep gated; register. Test: the non-riser-band ArtDeco deviation ≤ ~0.15mm (the
  fan/chevron floor), watertight (folded=0).
- [ ] **R2** — `deviationVsTrueSurface`: add a `tBands` exclusion (riser faces), so the
  gate scores the wall excluding the vertical faces (as it excludes the seam).
- [ ] **R3** — wire ArtDeco to the production `surfaceFidelityExact` flag (now safe);
  e2e real-GPU OFF-vs-ON like SFB (born petals).
- [ ] **R4** — BambooSegments: switch its t-ring extractor to paired-ring risers; same gate.
- [ ] **R5** — Chevron follow-up (measure: density vs diagonal extractor for the 0.34mm).
- [ ] **R6** — watertight + budget: confirm `assertMeshExportable` + folded=0 on the
  paired-ring mesh at the default profile; confirm the extra rings stay within budget.

## Open risks

- **ε tuning vs weld tolerance:** ε=1e-3 works, 3e-4 leaks. The lower bound is the
  construction weld (1e-4 mm in 3D); pick ε so the two rings never weld at any z.
  Tabulate ε vs stepDepth/dims.
- **Riser-band watertightness:** the thin frustum band — confirm no fold/sliver
  defect (folded=0) and that `assertMeshExportable` passes.
- **The riser band is an accepted feature** (the vertical face) — document it like the
  seam cliff; the `r(u,t)` fidelity metric structurally cannot score a vertical face.
- **Chevron (0.34mm)** and the fan (0.006mm) are left to a follow-up / density.
