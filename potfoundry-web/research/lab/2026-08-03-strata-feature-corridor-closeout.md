# Strata 001 feature-corridor boundary closeout

Date: 2026-08-03  
Scope: GothicArches, ring stage, 0.01 mm visual budget  
Control: `gothicarches_ring_DS-HT_S30C1`  
Best bounded research mesh: `gothicarches_ring_DS-HT_S40VFC`

## Outcome

The photographed spikes are deterministic connectivity defects at analytic
feature corridors, not random under-resolution. In the S30 control, 4,139 of
4,145 independently bad facets lie within 650 um of a serialized locus. The
repeating pattern is produced when locally legal triangles bridge or fan along
the boundary between the protected feature graph and the freely triangulated
background.

The converged default-off repair is a post-refinement transaction sequence:

1. Delete selected non-feature visual hubs and retriangulate their complete
   one-ring polygon.
2. Flip only off-locus diagonals in two-triangle quads around protected hubs.
3. Optionally collapse a short edge only by deleting its non-feature endpoint
   and rewriting its complete star.

Every transaction preserves feature vertices and locus edges, rejects new
proper kink crossings, checks manifold incidence, shipped-value normal
admission, aspect ratio, long-AR facets, shards and fan births, and must improve
the independent four-sample mesh-to-surface visual objective. The production
pipeline is unchanged; all switches remain research-only and default off.

## Exact result

| Mesh | >10 um | >20 um | >30 um | >50 um | >75 um | >100 um | >125 um | >150 um | p99 / p999 / max (um) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S30 control | 4,145 | 1,344 | 600 | 203 | 69 | 31 | 23 | 4 | 3.776 / 20.685 / 188.459 |
| S37, 11 stars + 64 flips | 4,069 | 1,256 | 542 | 176 | 50 | 26 | 23 | 4 | 3.769 / 19.974 / 188.459 |
| S38, legal flips exhausted | 3,740 | 1,222 | 542 | 176 | 50 | 26 | 23 | 4 | 3.629 / 19.805 / 188.459 |
| S40, +35 legal collapses | **3,701** | **1,206** | **533** | **175** | 50 | 26 | 23 | 4 | **3.617 / 19.731 / 188.459** |

S40 reduces the visible over-budget population by 444 facets (10.7%) without
changing the protected high tail. It is watertight: zero non-manifold edges,
zero reversed facets, zero seam cracks, and exactly two ring boundary loops.

| Exact corridor ledger | S30 | S38 | S40 |
|---|---:|---:|---:|
| triangles | 1,259,718 | 1,259,696 | 1,259,626 |
| feature spans | 4,481 | 4,380 | **4,367** |
| long feature spans | 392 | **359** | **359** |
| shards | 201 | **191** | **191** |
| fans | 26 | 26 | 26 |
| visual facets in routed annuli | 633 | **528** | **528** |
| proper-kink visual recall | 68.71% | **74.71%** | 74.44% |

The S40 routed-annulus cohorts are identical to S38 (504 feature spans, 63
long spans, 6 shards and 15 fans). The optional collapse therefore polishes
outside those protected annuli rather than weakening their ownership.

## What had the best effect

Among the five originally debated bisection levers, **conform-first had the
best broad causal effect** because it prevents a crossing from becoming a
shape-censored fossil. It remains the right birth-time rule. Recursive
longest-edge protection was self-blocked at 96.6% of the production sites;
retry produced no certificate movement; metric-aware gating recalled only
12-17% of the visual class; tighter acceptance spent more triangles without
moving the certificate.

For the photographed residual specifically, the largest measured visual
effect came from the **protected local connectivity pass** rather than further
bisection tuning: non-feature one-ring deletion plus off-locus flips. The
expanded flip arm terminated after 456 commits even with a budget of 512, so
the legal move set—not the tuning budget—was exhausted. The optional collapse
found 695 short-edge candidates, committed 35, and delivered only the final
39-facet improvement.

## Closed alternatives

- Atomic 1-to-3 face insertion: +242 triangles and 109 commits, but independent
  bad facets worsened 4,145 -> 4,161; feature spans increased by 82 and long
  spans by 14. Rejected.
- Denser aligned seed: +33k to +124k triangles; crossings and hubs increased,
  with no corresponding closure. Rejected.
- Structured collars: planarized full collar raised long-AR facets 188 ->
  1,482 and bans 34 -> 587; outer variants also regressed hubs/long-AR. Rejected.
- Residual fan-only selector: 26 hubs found, only 2 near a locus and none
  carried the >10 um visual set. It selected the wrong remaining population.
- Feature-chain contraction: reproduced the non-feature arm exactly and added
  no benefit. Rejected.
- Raising a generic collapse threshold: the exact protected implementation
  found 90 feature-endpoint and 346 locus/crossing refusals, plus 142 invalid
  manifold links. A blind threshold increase would erase feature ownership or
  manufacture non-manifold topology.

## Why 23 facets remain above 125 um

The remaining tail is constraint-locked. It is unchanged by 456 admissible
flips and 35 admissible collapses. On the 188.459 um pair, the obvious alternate
single-edge flip would reduce the visual value but creates AR 72.55, above the
AR 50 invariant. Other 126-146 um alternates require AR in the hundreds or
thousands, or cross a protected feature. These are not missed budget slots.

The next mechanism, if literal removal of this tail is required, is a
**multi-ring constrained corridor-sector cavity**, not another scalar knob:

1. Grow two triangle rings around each connected >125 um component.
2. Freeze the outer polygon and retain the complete internal feature-edge
   graph as a PSLG.
3. Split the cavity into sectors at feature junctions; never triangulate across
   a feature edge.
4. Permit analytically lifted Steiner points inside a sector and additional
   points on a feature chain where its spacing is the limiting constraint.
5. Generate several constrained triangulations per sector (visual, shape and
   length priorities), then commit the whole multi-sector patch atomically.
6. Apply the same global non-regression gates used here: topology, feature
   ownership, admission, AR/long-AR, shard, fan and exact visual cohorts.

That is a materially larger topology operation. It should stay out of
production until it has a synthetic junction suite, an exact S30 replay and
cross-style adversarial tests. The present S40 mesh is the converged safe local
result; the unchanged high tail is declared rather than hidden.

## Reproducible artifacts

- Mesh: `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S40VFC.stl`
- PotScope sidecar: `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S40VFC.stl.error.bin`
- Driver report: `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S40VFC.report.txt`
- Corridor ledger: `research/exchange/_strataCorridorOwnership/gothicarches_ring_DS-HT_S40VFC.ledger.json`
- Implementation: `research/bridge/_strataFanCavity.ts`
- Focused tests: `research/bridge/_strataFanCavity.test.ts`

