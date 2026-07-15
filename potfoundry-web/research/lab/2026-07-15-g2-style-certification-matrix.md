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

## Addendum 2 — resource envelope v2 + FourierBloom certified at pure defaults (same day)

Landed ranked-#2: the proof layer's v1 resource policy was retired for a coherent v2
envelope (every constant was sized for 65k-triangle artifacts): mapped-triangle cap
131,072 -> 524,288 (per-patch partition 65,536 -> 262,144), composed/partition/structural
hard elapsed 30s -> 120s, and the derived work/byte cap families (partition build/BVH/
traversal/pair-checks, topology work units/vertices, self-intersection build/traversal/
candidate/broad-phase, structural byte+work totals, mapped variant mirrored) scaled to
match. Work-unit charging is now differentiated: every consulted cell costs one screen
unit; only validated-decimal consultations pay the program node count (the old policy
billed screen cells at decimal prices and capped FB at ~223k cells). The screen core also
moved to raw widened float64 (dropping ~60 BigInt-nextafter interval ops per cell;
47.5 -> 37.6 us/cell measured).

**RESULT: FourierBloom CERTIFIED-PARTIAL at FULL DEFAULT parameters — 9,499,927 pm over
206,848 triangles in ~65 s** (1024 angular x 32-row walls / 16-row bottoms). Third
certified style; first at completely untouched defaults. Added to the PF_G2_POT gate.

Sharpened classifications from the unlocked attempts:

- **WaveInterference: reclassified from cap-blocked to FEATURE-ALIGNED-REQUIRED.** Its
  crossing value is density-invariant across 512/1024/2048 angular and 32/64 inner rows
  (9,500,027 -> 9,500,011 -> 9,500,010 pm); periodic seams and all six junctions measure
  image-exact (<=3e-14 mm). By elimination the relief crest is a sqrt-type cusp (vertical
  tangent; chord error ~ sqrt(h)), which no uniform grid can close — same class as
  GothicArches' creases. Needs stations on the crest curves (exact-rational partitions).
- **GyroidManifold (gentle 0.3 mm): ladder-blocked.** Structural now PASSES at 410k
  triangles under the v2 envelope; geometry still needs ~128 rows on BOTH walls and
  bottoms simultaneously (> 524k uniform) — non-uniform vertical ladders fit it.
- FourierBloom's earlier "deadline" classification was the resource policy, as predicted.

Certified set: HarmonicRipple (gentle), SpiralRidges (gentle low-turn),
**FourierBloom (defaults)**. Remaining ranked increments: non-uniform dyadic vertical
ladders (Gyroid, styled-edge annuli, default-scale), screen v2 ops (SuperellipseMorph,
fract-family), exact-rational stations (Gothic, WaveInterference), curtain/riser
complexes (7 layered styles).

## Addendum 3 — non-uniform dyadic vertical ladders + first DEFAULT-SCALE certificate (same day)

Landed the last U1 item: per-patch `verticalStationsByPatch` ladders (explicit strictly-
increasing dyadic station numerators; `dyadicEdgeLadder(uniformLog2, refinements, edge)`
generator halves the row width geometrically into a chosen edge). Uniform grids unchanged.

**RESULT: HarmonicRipple (gentle) CERTIFIED-PARTIAL at PRODUCTION-DEFAULT SCALE
(OD140/H120/drain10) — 9,499,996 pm over 155,648 triangles in ~85 s.** The blocker was the
live profile exponent t^1.1 whose curvature diverges at the base (kappa ~ t^-0.9); v0-edge
wall ladders match the divergence (each halving toward the base halves local sag). In the
PF_G2_POT gate (now four pots + fail-closed case; 417/417 with the gate on).

Gyroid-gentle honest wall (measured): with laddered bottoms its styled inner edge STILL
binds — it needs ~1024 shared angular stations (welds require one angular grid across
patches), putting walls alone at ~524k triangles = the entire v2 cap. Gyroid waits for
envelope v3 / streaming scans (U5-era), not for more tessellation cleverness.

Ladder lesson: edge ladders fix EDGE-CONCENTRATED error (profile-exponent base, styled
edges); they cannot fix uniform-in-v twist terms (those need uniform density) or angular
demands (those need global stations). Classify first (crossing-invariance + patch id +
edge locality), then choose the tool.

## Addendum 4 — screen v2 ops: SuperellipseMorph certified at pure defaults (same day)

Landed U2: the piecewise/branch-cut ops (floor, ceiling, round, fract, sign, step, atan2,
pcg2d) now compile to JUMP-GUARDED opcodes — cells whose argument enclosures exclude every
jump take exact locally-constant/smooth paths (fract(x)=x-k stays fully smooth; pcg2d with
proven single-integer operands resolves to its exact dyadic constant, confirming the
preregistered Voronoi hypothesis at the op level), and straddling cells downgrade the run
to a plain value-hull residual — first-order wide but sound and cheap, so the b&b
subdivides toward jump-free children. `power` gained a varying-exponent branch
(base >= 0, y >= 1): the first cut bounded the exponent-derivative factor a^y*ln(a) by a
constant-width global floor, which destroyed second-order convergence and blew the 1M
work-cell cap on SuperellipseMorph's inner wall; cell-local piecewise-monotone bounds
(corners + the analytic minimum at a* = e^(-1/y) when inside the cell) fixed it.

**RESULT: SuperellipseMorph CERTIFIED-PARTIAL at FULL DEFAULT parameters — 9,499,679 pm
over 107,520 triangles in ~38 s** (m_top = 5.5 corner bands and all). Fifth pot in the
PF_G2_POT gate (419/419 with the gate on).

The fract/floor family (SuperformulaBlossom, Crystalline, RippleInterference,
GeometricStar, CelticTriquetra, Voronoi) all now run soundly but deadline on bottom-top
hull-cascades: their jump lines are DENSE and non-dyadic (facet boundaries, lattice
edges), so straddling cells persist at every depth — the honest classification is
U3 (exact-rational feature-aligned stations), exactly as the roadmap review predicted.
U2's machinery is complete; U3 is now the sole unlock for six styles plus Gothic and
WaveInterference.
