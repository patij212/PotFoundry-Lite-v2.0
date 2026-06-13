# B5 — Absolute Surface-Fidelity Gate (2026-06-13)

The ONE unvalidated claim from the surface-fidelity session
(`2026-06-13-fidelity-session-handoff.md` open item 1): SFB (born petals +
density) and ArtDeco (paired-ring riser) are shipped flag-gated
(`surfaceFidelityExact`) and e2e-validated for **wiring** (features/tris up,
watertight via `measure()`), but the **absolute** "the exported mesh lies on the
true analytic surface" number was never measured end-to-end. The existing
`measure()` cannot certify it: its reference is `generateReference()` =
`gpuExport.generateMesh()` (a GPU uniform grid @1280×720), which is band-limited
(flattens cusps), bin-quantized (720×400 radial bins), and GPU-vs-GPU (blind to
common-mode kernel bugs) — red-team finding **B5**.

This spec is the design + proof for `diagnoseSurfaceFidelity`, an ABSOLUTE gate
that measures the REAL exported 3D mesh against a CPU-reconstructed ANALYTIC
surface with **no GPU-grid reference at all**.

## The metric

These styles are RADIAL surfaces `r(theta, z)`. The conforming export's OUTER
wall (surfaceId 0) is evaluated as (GPU `adaptive_mesh.wgsl:784-789`):

```
theta = u_wrapped · TAU
r     = compute_outer_radius(theta, t)      // = style_radius(id, theta, t, r_base(t))
th    = compute_twist(theta, t)             // = theta + TAU·spinTurns·t^curve + spinPhase
z     = t · H ;  x = r·cos(th) ;  y = r·sin(th)
```

When **twist = 0** (`spinTurns == 0 && spinPhase == 0`), `th == theta`, so a 3D
outer-wall point maps back EXACTLY:

```
theta = atan2(y, x)        z (direct)        t = z / H
r_analytic = STYLE_FUNCTIONS[id](theta, z, r0(t), H, opts)
deviation  = | hypot(x, y) − r_analytic |     // RADIAL
```

`hypot(x,y) = r` is twist-INVARIANT (twist only rotates azimuth), so the radius
is exact; the radial residual is the signed surface distance projected onto the
radial direction — **EXACT for radial features** and a safe **lower bound** on a
near-vertical wall (factor `cos(normal-tilt)`; for the default H=120 / Rb45→Rt70
wall the tilt is ~12–17°, `cos ≈ 0.96–0.99`).

`r0(t)` is the EXPORT's tapered+belled base radius — `baseRadius(t·H, H, Rb, Rt,
expn, bell)` (`geometry/profile.ts`), the byte-equivalent CPU mirror of
`styles.wgsl r_base(t):7-27`. **NOT** the scalar mean `(top_od+bottom_od)/4`
(that reads a CYLINDER on a tapered pot — false-fails by up to ~12mm; red-team
BLOCKING-2).

### Two channels (reported separately)

- **VERTEX channel** — per outer-wall vertex, radial dev. Production places each
  vertex EXACTLY at its `(u,t)`, so this reads ≈ the f32 floor (~1e-5mm) when
  correct. This is the literal **"mesh vertices lie on the true surface"** number
  — the B5 claim.
- **CHORD channel** — dense barycentric samples on each FLAT triangle, radial dev.
  What a slicer/print actually sees; catches missing-edge straddle + facet chord
  error. Kept separate so chord error never masks a vertex-placement regression.

## Config-truth (the correctness precondition)

The analytic radius MUST be the surface the GPU actually exported, at the export's
own opts:

- **SuperformulaBlossom** (BLOCKING-2): the CPU `rOuterSuperformulaBlossom`
  (`styles.ts:172`) has NO strength term — always full petals — while the GPU
  `sf_radius` (`styles.wgsl:102`) returns `mix(r0, r0·(0.9+0.35·rf), strength)`
  with `strength = packed[0]` (= `sf_strength`, default 0 → smooth pot). The gate
  therefore builds SFB from the **packed** `sfRf` + the explicit mix:
  `r0 + (r0·(0.9+0.35·sfRf(u,t,p)) − r0) · clamp(p[0],0,1)`. At the default
  `sf_strength=0` this reads a smooth pot (≈ 0 deviation), NOT a ~8mm petal
  false-fail. (`referenceMode = 'sfb-packed'`.)
- **ArtDeco** (and other radial styles): `STYLE_FUNCTIONS[id](theta, z, r0(t), H,
  opts)` with the store opts copied in BOTH snake_case and camelCase (the
  production `buildStyleOptions` convention — the CPU mirrors read camelCase, the
  store carries snake_case). ArtDeco's `rOuterArtDeco` is a verified 1:1 GPU
  mirror. (`referenceMode = 'analytic'`.)

## Exclusions

- **Outer wall only** (surfaceId 0): `t = z/H` holds ONLY here. Inner wall (1,
  `z = tBottom + t·(H−tBottom)`), rim (2), bottom (3/4), drain (5) have different
  z↔t mappings — excluded by construction via the PRE-WARP `(u,t,surfaceId)`
  stash.
- **u-seam** (the non-periodic cliff): a triangle whose pre-warp centroid-u is
  within `seamExclU` of 0/1, or whose u-span wraps > 0.5. Tracked in
  `seamBandMaxMm` (accepted cliff), never failed. Default `seamExclU =
  1.5/2^(7+2)` (the production seam half-width: featureLevel 7, uBias 2).
- **ArtDeco riser t-bands** (C0 vertical faces): triangles whose pre-warp
  centroid-t is within `tBandHalf` (≈1.6e-3) of a riser t (`(tier+0.1)/N`,
  `(tier+0.9)/N` from the live `ad_step_count`). Tracked in `riserBandMaxMm`. The
  `r(u,t)` metric structurally cannot score a vertical face (the riser frustum
  reads ~4mm of meaningless "deviation" — see `verify_artDecoFidelity.test.ts`).

The seam + riser exclusion logic is the 3D analog of `fidelityGate.ts`
`forEachWallTri`, computed from the PARALLEL pre-warp `(u,t)` stash
(`getLastConformingAssemblyUT`) rather than `atan2` (exact u, twist-robust).

## Honest-null discipline (refusals)

`diagnoseSurfaceFidelity` returns `null` (never a confident wrong number) when:

- legacy/parametric path (no assembly-UT stash);
- the mount provided no style-state getter, or it lacks `Rt/Rb/expn` (can't
  reconstruct the tapered base profile — the config-truth gap);
- `ut.length !== mesh.vertices.length` (a downstream pass — e.g. decimation —
  broke the stash↔mesh parallelism, so the `(u,t)` lookup would read garbage);
- `H` non-finite or ≤ 0;
- **twist active** (`spinTurns !== 0 || spinPhaseDeg !== 0`): `atan2(y,x)` recovers
  the TWISTED azimuth, not the style theta, so the analytic radius would be sampled
  at a sheared angle. Mirrors `diagnoseCrestLateralDeviation` (`windowHook.ts:774`).
  SFB@1 / ArtDeco default configs are spin-zero, so they ARE measured.

`nonFiniteCount` counts NaN/Inf mesh vertices; any nonzero ⇒ do NOT gate.

## Code

- `src/fidelity/analyticSurfaceGate.ts` — pure CPU metric.
  `radialAnalyticDeviation(mesh, ut, rAnalytic, opts) → AnalyticDevResult`
  (`{ maxDevMm, p99DevMm, rmsDevMm, vertexMaxMm, chordMaxMm, wallTriangles,
  samples, nAbove, nonFiniteCount, seamBandMaxMm, riserBandMaxMm, worst }`). The
  analytic radius is a CLOSURE the caller builds (the `fidelityGate.ts`
  convention — config-awareness is the caller's `surface`, not a style-id dispatch
  the gate can't do faithfully). `artDecoRiserTBands(stepCount)` helper.
  - Optional `dropNearHorizontalNz` (default OFF): the radial dev is a valid lower
    bound even on a tilted face, so dropping tilted facets would HIDE defects —
    the surfaceId-0 mask is the primary wall isolation. Enable only to harden
    against a mask leak.
- `src/fidelity/windowHook.ts` — `diagnoseSurfaceFidelity(opts)` on
  `PfFidelityApi` + `createFidelityApi`. Mirrors `diagnoseWallFidelity`/
  `diagnoseCrestLateralDeviation`: one `generateMesh` (repopulates the stash),
  pull `ut` + `getStyleState`, honest-null guards, build the config-true closure,
  call `radialAnalyticDeviation`, return `{ styleId, triangleCount, referenceMode,
  ...result }`. READ-ONLY (a diagnostic; does not change export behavior).
- `src/fidelity/FidelityHookMount.tsx` — `getStyleState` EXTENDED to forward
  `Rt = top_od/2, Rb = bottom_od/2, expn, bellAmp, bellCenter, bellWidth` (the
  config-truth wiring fix). The `FidelityHookDeps.getStyleState` type widened with
  the same OPTIONAL fields (older mounts still type-check; the method null-refuses
  when they are absent).

## CPU proof — `src/fidelity/verify_b5_analyticMetric.test.ts`

Builds a known-`(u,t)` lattice mesh, evaluates 3D positions via the exact analytic
surface, then cross-checks the 3D radial-analytic metric against the
known-`(u,t)` gate (`fidelityGate.deviationVsTrueSurface`) — two independent code
paths that must agree. Results (all green):

| Test | Result |
|---|---|
| SFB@1 chord vs (u,t) gate | 3D **10.86mm** vs (u,t) **10.87mm** (ratio **0.99861**); vertexMax **1.7e-5mm** |
| ArtDeco (riser excluded) | 3D chord **0.5214** vs (u,t) **0.5250**; wallTris parity **16896**; riserBandMax **2.10** (frustum captured, not failed); vertexMax **3.6e-6** |
| Injected +0.3mm ring | vertexMax **0.3000mm** (detected exactly) |
| Seam spike +1mm (smooth base) | seamBandMax **1.000** (captured); wall maxDev **0.084** (not failed) |
| Config-aware: SFB sf_strength=0 | maxDev **0.033mm** (smooth pot — NOT full petals; BLOCKING-2 avoided) |

Proves: the `atan2`/z mapping is exact (chord ≈ (u,t) gate, ratio 0.9986); the
config (packed strength mix, tapered r0(t), snake+camel opts) recovers the GPU
surface; the exclusions fire on the right faces; the metric detects real radial
defects; and it is a strict lower bound. The vertex channel is exact (≈ f32 floor)
— the literal B5 certification.

`npx vitest run src/fidelity/verify_b5_analyticMetric.test.ts` — 5 passed.
`npx eslint <files> --max-warnings=0` — clean.

## e2e usage — `e2e/_fidelity_surface_validate.cjs`

OFF-vs-ON probe (mirrors `_fidelity_flag_validate.cjs`): per `PF_STYLE`
(SuperformulaBlossom default; also run ArtDeco), launches headed Chromium with
`--enable-unsafe-webgpu`, `__pfConforming=true` (+ `__pfSurfaceFidelityExact=true`
ON), `setStyle`, `sf_strength=1` for SFB, then
`diagnoseSurfaceFidelity({ targetTriangles: 1e6 })`. Asserts ON is non-null +
nonFinite-free, `vertexMaxMm < CAD_TOL_MM` (default 0.5), and ON does NOT regress
the wall vs OFF (`vertexMax`/`chordMax` ≤ OFF·1.05 — features add EDGES that
REDUCE straddle, never raise placement error). Logs `seamBandMaxMm`/`riserBandMaxMm`
(tracked, not gated).

Requires a running dev server (`npm run dev`) — `webServer` is commented out in
`playwright.config.ts`. Run: `PF_STYLE=SuperformulaBlossom node
e2e/_fidelity_surface_validate.cjs`, then `PF_STYLE=ArtDeco …`.

## Honest residual risks

1. **In-memory, not STL-bytes.** This runs on the GPU-f32 `MeshData`, not the
   round-tripped binary STL (re-welds at 0.001mm, recomputes normals,
   f32-quantizes). Necessary-but-NOT-sufficient for the shipped artifact — a
   separate STL-bytes gate is a follow-up.
2. **Radial under-estimate on oblique faces.** The chord channel is a LOWER bound
   (factor `cos(normal-tilt)`); safe for certifying PASS, weak for FAIL magnitude
   on high-flare/big-bell regions. The vertex channel is immune. Risers (dr/dt→∞)
   are excluded.
3. **CPU-vs-GPU radius parity unverified beyond SFB.** SFB CPU==GPU to ≤19nm
   (`verify_cross_consistency` B2); ArtDeco parity is inferred from a 1:1 source
   read, not asserted against the real kernel; CelticKnot is flagged config-suspect
   (1.80mm). Certify only **SFB + ArtDeco** as the absolute number; flag others.
4. **Bilinear-mesh vs analytic cusp gap.** The production mesh tracks a 256×256
   bilinear sampler between nodes (`verify_cross_consistency` B3); the chord
   channel legitimately measures this, but the irreducible cusp-flattening is not a
   placement defect.
5. **Decimation breaks the stash.** At high budgets decimation may run and change
   the vertex count, breaking `ut`↔mesh parallelism → the gate returns null. The
   probe must treat null as INVESTIGATE (not pass); if it recurs, lower
   `targetTriangles` below the budget cap so no decimation runs.
6. **f32 floor.** Packed params are stored f32; the irreducible truth error is
   ~1.9e-5mm — far below any tol, but set `tolMm` (default 0.1) well above it.
