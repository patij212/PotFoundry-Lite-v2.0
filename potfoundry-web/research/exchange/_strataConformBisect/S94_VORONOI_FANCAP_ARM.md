# S94 ARM — THE SUPER-HUB RUNAWAY IS A `SHAPE=0` PHENOMENON. ON THE DEFAULT CONFIG MAX DEGREE IS 40, AND THE FAN CAP FIRES ZERO TIMES.

Ran the §7 item *"fix the super-hub runaway"* as an A/B, after S94 fixed the `vDeg` accounting the guard
reads. Logs `S94_VOR_CTL.log` / `S94_VOR_D64.log`; meshes `voronoi_ring_D--H_S94{CTL,D64}.stl`.

## Why the arm could not be an A/B against the committed baseline

`voronoi_ring_D--` carries **no `H` suffix**, and `SHAPE_SUFFIX = SHAPE || MID3D || LONGFALL ? 'H' : ''`.
So the mesh the 2,550 runaway was measured on was built with **`PF_CB_SHAPE=0`** — and with SHAPE off,
`shapeAdmits` returns at its first line, *before* the S83 fan cap. **The cap is unreachable on the exact
configuration the runaway belongs to.** Testing it requires `SHAPE=1`, which is a different mesh. Hence a
fresh same-session control, and distinct `PF_CB_TAG_SUFFIX` on both arms (`MAXDEG` adds no suffix, so
without that the treatment would have silently overwritten the control).

## RESULT — both arms identical in every reported number

| | control `MAXDEG=0` | treatment `MAXDEG=64` |
|---|---|---|
| triangles | 492,068 | 492,068 |
| rA evals | 635 M | 635 M |
| refused on aspect (>50) | 65,701 | 65,701 |
| refused on (θ,z) FOLD | 0 | 0 |
| **refused on FAN DEGREE (>64)** | — | **0** |
| unresolved | 560 (all `shape-ar`) | 560 (all `shape-ar`) |
| wall | 225 s | 228 s |

### Max vertex degree, measured on the shipped STLs by exact f32 weld

| mesh | config | tris | p50 | p99 | **MAX** | ≥64 | ≥1000 |
|---|---|---|---|---|---|---|---|
| `…_S94CTL` | SHAPE **on** | 492,068 | 6 | 14 | **40** | 0 | 0 |
| `…_S94D64` | SHAPE **on** | 492,068 | 6 | 14 | **40** | 0 | 0 |
| `voronoi_ring_D--` | SHAPE **off** | 806,765 | 5 | 13 | **2,550** | 78 | **32** |

**INSTRUMENT CROSS-CHECK:** the tool independently reproduces S81's published figures on the baseline —
*"32 vertices of degree >= 1000 … worst degree 2,550"* — to the digit, from a separately written weld.
So the 40 is measured on the same ruler as the 2,550.

## THE FINDING

**On the default configuration the runaway does not happen.** Max degree is 40 against a cap of 64, so
the S83 fan cap fires zero times and the two arms are indistinguishable. **The 2,550 belongs to
`SHAPE=0`**, the historical configuration the S81/S82 census measured — and the shape levers have been
**default ON since 2026-07-29**, i.e. *after* that census.

The mechanism is visible in the same log: the aspect gate refuses **65,701** splits. Refusing to split
thin fan facets is what stops the degree growth — the shape gate is already doing, on an aspect
criterion, the job the fan cap was built to do on a degree criterion.

## WHAT THIS DOES *NOT* SHOW — stated because the two configs are not the same mesh

- **This is a regime comparison, not a repaired mesh.** The SHAPE-on run terminates at 492,068 triangles
  against the baseline's 806,765, and strands **560 triangles in `unresolved`** (100% `shape-ar`). The
  aspect gate prevents the runaway *by refusing splits*, which is the same trade the fan cap would make;
  it is already paying that price, visibly, in `unresolved`.
- **Max degree 40 is not proof the runaway cannot occur at larger sizes on this config.** S81 measured the
  same junction vertex at degree 37 / 57 / 2,550 across 285,826 / 671,823 / 806,765 triangles, so degree
  climbs with size. This run stops at 492k *because* the aspect gate refuses; whether a SHAPE-on run
  driven to 806k would still hold 40 is **unmeasured**.
- Nothing here re-measures fidelity. Orientation and position on these two meshes were not scored.

## CONSEQUENCE FOR §7

§7 lists *"fix the super-hub runaway"* as NEXT, calling it *"a bug, not a limit"* and noting it *"defeats
every local operator"*. On the evidence here that item is **substantially superseded by a default that
changed after it was written**: at `SHAPE=1` there is no super-hub to defeat local operators, because
there is no vertex above degree 40.

What remains live from that item is narrower and should be re-stated: **the aspect gate buys a bounded
degree by stranding 560 facets, and nobody has priced that trade against the runaway it prevents.** That
is a fidelity question (what do those 560 cost on an honest ruler?), not a topology one.

The S83 fan cap should be kept — it is now correct (S94 fixed the counter it reads) and it is free at
`MAXDEG=0` — but it is a belt for a configuration nobody currently runs, not a fix for the default.

## A FALSE SUCCESS ON THE WAY, RECORDED

The first launch of this arm reported `vitest exit 0` on both runs and produced **nothing**: the driver
is `it.runIf(RUN)` with `RUN = process.env.PF_STRATA_CB === '1'`, which was unset, so vitest skipped the
test and exited cleanly in 3 s. Filtered greps came back empty and would have read as *"the cap changed
nothing"* — a null result manufactured entirely by a missing env var. It was caught only by printing the
raw tail (`1 test | 1 skipped`). The runner now carries an `assert_ran` gate that fails loudly on
`1 skipped` / `0 passed` or on a log with no mesh output. Same class as the vacuous-bar trap: a check
that is silent exactly when it should be shouting.
