# S103 — THE GATE NOW SCORES THE OUTER WALL AND REPORTS TREADS SEPARATELY. ALL FOUR HUBBED STYLES CONFIRM: 9.9× / 16.4× / 39.0× / 84.6×.

S102 found the ship gate voiding a good mesh: CelticTriquetra returned `NOT-MEASURED` on
`PRECOND radial MAX |r_mesh − rA| = 1533.7 µm`, because that run emitted `1278000 outer wall + 4394
TREADS` and **tread-wall vertices legitimately do not lie on `rA`**. One such vertex failed the whole
mesh as "wrong style params" when the params were right and the wall was fine.

## The fix

The precondition took a **max over every vertex**, conflating two different situations. It now
discriminates them:

* **WRONG PARAMS** → essentially *every* facet leaves the gate, because `rA` itself is the wrong function.
* **TREADS / CAPS** → the large majority are on `rA` and a small named minority are not.

Facets whose vertices all lie within `SURF_GATE` of `rA` are **OUTER WALL** and are scored. Everything
else is **REPORTED, NEVER SILENTLY DROPPED** and never allowed to void the run:

```
SCOPE : OUTER WALL 1267921 scored  |  OFF-SURFACE 14473 (treads/caps/floor-fans, area 39.077 mm^2)
        NOT SCORED — rA does not describe them
        (their orientation needs the surface THEY belong to; this gate does not have it)
```

`landFlipPass` already had this concept — its surface gate exists precisely to FREEZE "end caps, floor
fans, tread walls". The gate now shares it.

## ⚠ MY FIRST DEFAULT WAS WRONG, AND THE PROBE CAUGHT IT

I copied `landFlipPass`'s 0.05 mm gate. That produced `on-surface MAX 49.8117 µm` — suspiciously equal to
the gate itself — and the run STILL voided, because the parameter check demands ≤ 10 µm. Rather than tune
the threshold, I measured whether the population is bimodal:

| gate | on-surface | on-surface MAX |
|---|---:|---:|
| 50 µm | 98.857% | **49.8117 µm** |
| 1 µm | 98.812% | **0.0255 µm** |

**A 50× tightening moved the population by 0.045 pp (~9 facets of 20,038) and collapsed the max to
Gothic's own 0.0310 µm.** The distribution IS bimodal — wall at ~0.03 µm, treads at ~1500 µm, almost
nothing between. The 49.81 µm was a handful of boundary facets, not a loose wall.

**Why the copied value was wrong:** `landFlipPass` uses its gate to FREEZE facets, where loose is
conservative. Here the gate DEFINES THE SCORED POPULATION, where loose admits boundary facets into the
parameter check. Default is now **0.010 mm**.

**And that created a circularity I removed rather than shipped.** With the gate equal to the parameter
threshold, the on-surface MAX check can never fail — a vacuous bar. So the max is **REPORTED, not gated**
(Gothic's 0.031 µm is the reference, so a degrading wall stays visible), and parameter mismatch is
detected by the **FRACTION**, which is the criterion that actually does work.

## VALIDATION — the pure-ring regression is exact

| mesh | on-surface | off-surface | back-facing | AREA | verdict |
|---|---:|---:|---:|---:|---|
| Gothic `S39CTL` (pure ring) | 100.000% | 0 | **690** | **0.00596%** | FAIL |
| CelticTriquetra `_S102` (treads) | 98.812% | 14,473 | 4,094 | 0.05794% | **FAIL (was NOT-MEASURED)** |

**Gothic is unchanged to the digit** — 690 / 0.00596%, identical to S98/S100. The change is inert on
meshes without treads, which is what makes it safe.

## ⭐ ALL FOUR HUBBED STYLES NOW CONFIRM S101's PREDICTION

| style | SHAPE-off | SHAPE-on | **ratio** |
|---|---:|---:|---:|
| Crystalline | 1.09450% | 0.01294% | **84.6×** |
| Voronoi | 0.50635% | 0.01298% | **39.0×** |
| **CelticTriquetra** | 0.95229% | **0.05794%** | **16.4×** |
| GeometricStar | 1.46237% | 0.14831% | **9.9×** |

**4 of 4, all far above the 5 × kill line.** The sliver → hub → back-facing chain is confirmed on the
whole hubbed class, and the fix was already the shipping default.

## CAVEATS

- CelticTriquetra's SHAPE-off baseline was a **pure ring** (no treads); its SHAPE-on run emitted treads
  and **CAPPED at alloc 2,500,000/2,500,000**. So its 16.4× compares two meshes of different topology at
  different budgets — directionally sound, not a controlled A/B.
- The off-surface population is **reported, not scored**. Whether those 14,473 tread facets are correctly
  oriented is **UNMEASURED** — answering it needs the surface *they* belong to, which this gate does not
  have. That is a real gap for closed/solid pots, not just a bookkeeping note.
- Nothing reaches ZERO. GeometricStar remains the worst at 0.14831%.
