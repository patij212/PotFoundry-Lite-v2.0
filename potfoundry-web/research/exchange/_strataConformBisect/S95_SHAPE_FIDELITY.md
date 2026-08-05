# S95 — THE CONFIGURATION THAT ELIMINATES THE SUPER-HUB IS ALSO 1.52× MORE ACCURATE BY AREA, WITH 39% FEWER TRIANGLES

The campaign has treated Voronoi's degree-2,550 super-hub as *the* pathology — S81: *"every 1-ring
operator is defeated by a 2,550-gon"*, S83: *"preventing the birth is the fix."* S94's arm showed the
runaway is a `SHAPE=0` phenomenon and does not occur at `SHAPE=1` (max degree **40**). But the config
that eliminates it does so by **refusing 65,701 splits**, ending 39% smaller and stranding 560 facets in
`unresolved` — and **nobody had asked which mesh is actually more accurate.** This prices it.

## Method

Both meshes scored by `s85PosRebase` (the campaign's `certifyTriangle` ruler at the 10 µm product bar),
uniform arm, **identical golden-stride construction, identical N = 8,000**, same tol, same nMax. The
SHAPE-off row is the committed S85 scorecard entry; the SHAPE-on row was run for this file.

**This is a paired-CONFIG comparison, not a paired-FACET one.** The meshes have different triangle
counts and different tessellations, so the two columns are independent draws and the Poisson intervals
carry the verdict — not the point estimates.

## RESULT

| | SHAPE **off** `voronoi_ring_D--` | SHAPE **on** `voronoi_ring_D--H_S94CTL` |
|---|---|---|
| triangles | 806,765 | **492,068** (0.61×) |
| max vertex degree | **2,550** (32 vertices ≥ 1000) | **40** (0 ≥ 64) |
| unresolved | — | 560, all `shape-ar` |
| honest PROVEN-FAIL rate | 10.5000% ±3.5% → **[10.13, 10.87]** | **0.8375% ±12.2% → [0.735, 0.940]** |
| honest fail **AREA** | 1.30676% ±5.2% → **[1.239, 1.375]** | **0.86197% ±26.2% → [0.636, 1.088]** |
| in-sample honest max | 184.71 µm | **67.327 µm** |
| scaled failing facets | 84,710 | **4,121** |

**Both the rate and the AREA intervals are DISJOINT** (area: 1.088 < 1.239). The improvement is resolved,
not a point-estimate artefact — which matters, because the SHAPE-on area bar is wide (±26.2% on 67
failures).

- by **AREA**, the size-independent measure: **1.52× better**
- by count rate: 12.54× better
- by in-sample max: 2.74× better
- and with **39% fewer triangles**

## THE FINDING

**The aspect gate is not trading fidelity for topology. It wins both, and it wins them cheaper.**

Every dead-operator result in this campaign — flip, cavity DP, collapse, vertex removal, all defeated by
the 2,550-gon — was measured on the SHAPE-off mesh. That mesh is *also* the less accurate one by every
honest measure available. **The super-hub was never a fidelity problem to be solved; it is a property of
a configuration that is simply worse**, and the shape levers that have been default-ON since 2026-07-29
already left it behind.

## WHAT THIS DOES NOT SHOW

- **The 560 stranded facets are IN the number but thinly sampled.** They are 0.114% of the mesh, so an
  8,000-facet (1.63%) uniform sample expects ~9 of them. The in-sample max of 67.327 µm against the
  driver's reported worst `unresolved` of 263.072 µm (edge ruler) says the sample did **not** catch the
  worst strandees. The 0.86197% area figure is therefore a fair estimate of the *typical* cost and an
  **under-estimate of the tail**. Pricing the tail needs a targeted arm over the 560, not a uniform one.
- **Orientation was not scored** on either mesh here. This is position only.
- Nothing here is a claim about other styles; Voronoi is one mesh of one style.
- The driver's own plane ruler reports **347** over-bar on the SHAPE-on mesh against **4,121** honest —
  an 11.9× under-report, consistent with the campaign's standing finding, and another reason the
  driver's own number should not be used as a verdict.

## CONSEQUENCE

§7's *"fix the super-hub runaway"* can be closed rather than merely superseded: the runaway belongs to a
configuration that is worse on fidelity and more expensive in triangles. **The remaining live question is
the one this file could not answer — what the 560 stranded facets cost in the TAIL**, which is a targeted
`certifyTriangle` arm over exactly those facets, not another uniform sample.
