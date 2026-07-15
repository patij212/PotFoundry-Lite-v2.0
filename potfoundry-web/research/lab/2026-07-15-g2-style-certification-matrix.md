# G2 style certification matrix — reference tessellation vs the 0.01 mm continuous proof (2026-07-15)

**Question:** which of the 20 registry styles can the G2 chain (annular atlas → `annularSolidReferenceTessellation` → `proveFinalStlMappedGeometryAndStructure`) certify today, and what exactly blocks the rest?

**Vehicle:** small pot `{H:40, top_od:30, bottom_od:30, r_drain:6}`, claim `requestedTolerancePm=10_000_000` (0.01 mm) with 0.5 µm non-geometric reserve → 9.5 µm geometric budget. Proof-layer hard constraints: 131,072 mapped triangles, 30 s composed deadline, dyadic-only partition stations. Screen engine as of 236f543c (kernel v13 / registry v7 / compiler v10).

## Atlas admissibility (all 20)

| Class | Styles | Meaning |
|---|---|---|
| Admissible, screen-full | HarmonicRipple, SpiralRidges, FourierBloom, SuperellipseMorph, GothicArches, WaveInterference, GyroidManifold | Six-patch closed atlas builds; every program op has a fast-screen enclosure |
| Admissible, screen op gap | SuperformulaBlossom (`sign`), Crystalline (`fract`), RippleInterference (`fract`), GeometricStar (`floor,fract`), CelticTriquetra (`fract,floor,step,atan2`), Voronoi (`floor,fract,pcg2d`) | Atlas builds, but the screen refuses whole-program → decimal-only (~32 ms/cell) → certification intractable until the screen grows those ops |
| Atlas-refused | LowPolyFacet, ArtDeco, DragonScales, BambooSegments, HexagonalHive (multi-patch feature complexes); BasketWeave, CelticKnot (composition/production-integration blockers) | Need the audit's curtain/riser multi-patch surface-complex layer |

## Certification outcomes (screen-full styles)

| Style | Params | Grid (angular × walls / rim / bottoms) | Result |
|---|---|---|---|
| **HarmonicRipple** | gentle (petal 0.01, ripple 0, bell 0) | 256 × 8 / 8 / 16 (~29k tris) | **CERTIFIED-PARTIAL, upper = 9,499,923 pm, ~20 s** |
| **SpiralRidges** | gentle low-turn (amp 0.02/0.02, groove 0, turns 0.2) | 256 × 32 / 8 / 16 (53.8k tris) | **CERTIFIED-PARTIAL, upper = 9,499,969 pm, 24.4 s** |
| FourierBloom | defaults | best tried: 512×32 + bottoms 16 (~103k) | REFUSED — deadline at the density it needs; true sampled bottom-top max ≈ 9.08 µm at uv≈(0.71, 0.93) — a razor-edge near-miss, throughput-blocked |
| WaveInterference | defaults (relief 2.3 mm) | several ≤ cap | REFUSED — residual crossing at max depth; styled-inner-edge annulus terms persist at every ≤-cap grid |
| GyroidManifold | gentle (relief 0.3 mm) | 128 × 128 + bottoms 32 (84k) | REFUSED — true sampled bottom-top max **85 µm** at uv≈(0.66, 0.98): effective angular frequency ≈ 30 at the styled inner edge (fixed-size lattice cells) ⇒ needs ≳512 angular × 128 rows ≈ 262k+ tris ≫ cap at ANY meaningful relief |
| SuperellipseMorph | gentle (m_top 3) | 512×8 (42k) | REFUSED — deadline: `power(abs(cosθ), m(v))` has a NON-CONSTANT exponent, and at `abs` fold lines the base touches 0 → screen refuses those cells → 32 ms decimal cells dominate. Screen v2 item: non-constant-exponent power with base ≥ 0 |
| GothicArches | defaults | any ≤ cap | REFUSED — 24 crease kinks are C0/first-order: chord error ≈ Δslope·r·h; uniform dyadic stations can never lie ON θ=k/24 curves (24 ∤ 2^n). Needs feature-aligned stations ⇒ exact-rational (non-dyadic) partition support |

## Load-bearing lessons

1. **The depth-24 "9.5000x pm" refusal value is a crossing-contour artifact** — it is the enclosure of the first max-depth cell, which sits where the true residual crosses the budget. It says nothing about the region max (Gyroid read 9,500,033 pm while its true max was 85,000,000 pm-scale). Diagnose with dense sampling of the named patch, never with that number.
2. **The styled inner-bottom edge is the universal hot spot.** `bottom-top` spans a circular drain edge to a STYLED inner edge; both its ruled twist and the style's angular frequency land there, and it fails first for every non-gentle style.
3. **The binding frontier is a triad**: 131,072-triangle cap × 30 s deadline × uniform dyadic grids. Per-cell cost is now dominated by proof-side request construction (BigInt dyadic points/strings, ~100 µs/cell), not enclosure math (~µs) — a numeric fast-path in `requestForCell` is the highest-leverage unlock, followed by non-uniform dyadic vertical ladders and a raised/streamed triangle cap.
4. **Frontier reframing for the mesher track:** GothicArches' and GyroidManifold's canonical programs are screen-full smooth/min-max compositions — their production 0.44/0.72 mm gaps are candidate-generator gaps, not target-definition gaps. Gothic additionally needs feature-aligned stations in ANY certifying mesh, which is the same feature-conforming requirement the production mesher track already carries.

## Next increments (ranked)

1. `requestForCell` numeric fast-path (proof kernel perf) — unlocks FB at defaults immediately, likely WI.
2. Non-uniform dyadic vertical ladders in the reference tessellation — default-scale pots and styled-edge annuli.
3. Screen v2 ops: non-constant-exponent `power` (base ≥ 0), `fract`/`floor` on jump-free cells — unlocks SE and the fract-family styles.
4. Exact-rational (non-dyadic) partition stations — Gothic/crease styles, and pre-requisite for feature-aligned production meshes.
5. Curtain/riser multi-patch complexes — the 7 atlas-refused styles.

## Addendum — numeric screen channel (same day)

Landed the ranked-#1 unlock: an exact numeric cell side-channel for the screen
(`encloseResidualFastNumeric`, kernel v14 / registry v8). The kernel screens cells from
per-mapping numeric caches (integer numerators kept within 2^52 so weighted midpoint
combinations stay exact; exact parsed binary32 STL coordinates) and builds the canonical
BigInt/string request ONLY for cells the decimal authority actually decides. Bit-identical
enclosures to the string channel (property-tested).

Measured effect: HR pot proof 19.4s -> 15.8s, SR 22.0s -> 18.1s; the geometry phase is no
longer the composed bottleneck. Re-testing FB/WI at defaults with the freed headroom
sharpened their classification:

- FourierBloom defaults now fails on the COMPOSED 30s deadline at its required density
  (1024 angular -> ~108k tris: exact partition verify + structural self-intersection scans
  dominate), no longer on geometry cells.
- WaveInterference defaults still needs ~140k triangles (bottoms x walls at 512 angular)
  -> mapped-triangle cap.

Conclusion: for FB/WI the last walls are exactly ranked-#2 — the 131,072 cap and the 30s
composed ceiling (structural/partition scan throughput), plus non-uniform ladders to spend
triangles where the styled edges need them.
