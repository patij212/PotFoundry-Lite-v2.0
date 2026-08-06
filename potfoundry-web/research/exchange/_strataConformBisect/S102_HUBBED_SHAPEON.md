# S102 — THE HUBBED FOUR UNDER SHAPE-ON: PREDICTION CONFIRMED, 9.9×–84.6×, AND CHEAPER. NONE REACH ZERO.

S101 pre-registered: *"re-running those four under SHAPE-on removes most of their back-facing area.
**KILL: <5× improvement by AREA on any of the four** ⇒ the sliver→hub→back-facing chain is wrong and S98's
mechanism must be re-opened."* This is that test. Runner `research/tools/run-s102-hubbed-shapeon.sh`.

## RESULT — every admissible style clears the kill line

| style | SHAPE-off AREA | SHAPE-on AREA | **ratio** | back-facing facets | triangles |
|---|---:|---:|---:|---:|---|
| **Crystalline** | 1.09450% | **0.01294%** | **84.6×** | 21,064 → 816 | 1,163,100 → 913,416 (−21%) |
| **Voronoi** (S95, prior) | 0.50635% | 0.01298% | **39.0×** | 62,332 → 488 | 806,765 → 492,068 (−39%) |
| **GeometricStar** | 1.46237% | **0.14831%** | **9.9×** | 60,220 → 3,528 | 885,400 → 425,376 (−52%) |
| ~~CelticTriquetra~~ | 0.95229% | *(0.06903%)* | *(13.8×)* | *(28,375 → 4,600)* | 1,714,638 → 1,282,394 |

**PREDICTION CONFIRMED on 3 of 3 admissible arms — 9.9×, 39.0×, 84.6×, all far above the 5× kill line.**
The sliver → hub → back-facing chain holds: S98's mechanism (needle slivers), S94/S95's cause (hubs are a
SHAPE-off phenomenon the default-ON aspect gate eliminates), and this outcome are mutually consistent.

**AND IT IS CHEAPER EVERY TIME — 21%, 39% and 52% FEWER triangles.** Density is not being traded for
quality here; the aspect gate refuses the splits that manufacture slivers, and the mesh is both smaller
and cleaner. That is now four independent styles telling the same story.

## ⚠ CELTICTRIQUETRA IS INADMISSIBLE, AND THE REASON IS A GATE LIMITATION WORTH FIXING

`GATE VERDICT: NOT-MEASURED` on **`PRECOND radial: MAX |r_mesh − rA| = 1533.7094 µm`**. The cause is not a
bad mesh — it is the gate's precondition:

```
soup: 1282394 tris = 1278000 outer wall + 4394 TREADS + 0 caps
```

**Tread-wall vertices legitimately do NOT lie on the outer-wall surface `rA`.** The gate's radial
precondition assumes every vertex is on `rA`, which holds for a pure ring and breaks the moment a mesh
carries treads or caps. `landFlipPass` already knows this — its surface gate exists precisely to FREEZE
"end caps, floor fans, tread walls". **The gate needs the same concept: score the outer wall, and report
the off-surface population separately rather than voiding the whole mesh.**
Its 13.8× and 0.06903% are therefore **not admissible** and are shown struck through above.

Second, independent reason this arm is not comparable: it **CAPPED** at `alloc 2500000/2500000`, so it is
budget-truncated as well. Two defects in one arm; fix the gate first, then re-run with headroom.

## NOTHING REACHES ZERO — the standard is not met

| | back-facing facets | AREA |
|---|---:|---:|
| GeometricStar | **3,528** | 0.14831% |
| Crystalline | 816 | 0.01294% |
| Voronoi | 488 | 0.01298% |

**GeometricStar is now the worst measurable style**, an order of magnitude above the other two, and it is
the one whose triangle count fell the most (−52%) — worth checking whether it is under-refined rather than
mis-shaped. The user's standard is ZERO; 9.9× is progress, not arrival.

## WHAT THIS SETTLES AND WHAT IT DOES NOT

- **Settles:** the hubbed-four hypothesis. 87.8% of the catalogue's back-facing area sat in four styles,
  and the already-shipping default removes 9.9–84.6× of it. **No new operator was needed.**
- **Does not settle:** the residual. Three styles still carry 488–3,528 back-facing facets with no known
  mechanism beyond "needle slivers", and S98's post-hoc re-winding repair is already refuted
  (`A_param > 0` on 1178/1178 — the parametric mesh is correctly oriented everywhere).
- **Not measured:** these are config-vs-config comparisons at different triangle counts, not paired
  facets; one arm per style; no orientation or position re-score on the new meshes; CelticTriquetra
  unmeasured pending the gate fix.
