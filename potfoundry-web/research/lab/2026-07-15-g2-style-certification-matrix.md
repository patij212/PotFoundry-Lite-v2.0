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

## Addendum 5 — U3a: shared snapped-feature angular ladders + the Gothic pow finding

Landed the kernel-untouched half of U3: `angularStations` — a shared non-uniform dyadic
angular ladder (validated symmetric under s -> 1-s so the atlas's reversed junction welds
stay station-exact) with a `snappedFeatureAngularLadder` generator that unions a uniform
grid with feature fractions (e.g. crease angles k/24) snapped to 2^-20 dyadics plus their
mirrors. Snap error <= 2^-21 in u (~5e-5 mm of arc at r=15) — for CONTINUOUS kinks
(min/max/abs creases) the crease-straddling sliver becomes so thin its chord error
vanishes, with zero changes to the exactness kernel.

**Gothic outcome (honest):** crease alignment works mechanically (529 stations weld and
partition cleanly), but Gothic STILL deadlines on bottom-top with a budget-INDEPENDENT
~100 s burn — histogram: `power-domain:1778`. Diagnosis: Gothic's arch-shape `pow` sees
bases the SCREEN's libm-padded trig dips to ~-2e-16 while the DECIMAL kernel's 40-digit
enclosures keep them exactly clamped at 0 (`decimalPow` throws on any negative base, so
decimal never actually saw them) — 1778 borderline cells/patch route to 32 ms decimal
consults regardless of budget. Fix class: align negative-base/zero-touching pow semantics
between kernels (screen v3) or normalize the style program's clamp placement (G1) — a
semantics-critical change deliberately NOT rushed here.

**Value-discontinuity split confirmed:** snapped-dyadic stations can never sit exactly ON
k/N jump lines (N not a power of two), and a floor/fract node whose jump is strictly
inside a cell keeps a width-1 hull at every depth in BOTH kernels — the fract family
(SFB, Crystalline, RippleInterference, GeometricStar, CelticTriquetra, Voronoi)
mathematically requires exact-RATIONAL stations (U3b: partition kernel generalization from
one power-of-two denominator to one arbitrary positive integer denominator; decimal
conversion becomes an outward-rounded interval instead of an exact point).

Session tally: certified set unchanged at five pots (HR gentle small + DEFAULT SCALE,
SR gentle, FB defaults, SE defaults); U3a machinery landed and tested; Gothic and the
fract family have precisely named next mechanisms (screen-v3 pow semantics; U3b rational
stations).

## Addendum 6 — screen v3 exactness + the Gothic cusp classification

Two screen tightenings landed (both pure improvements, no policy loosened):

1. **Power-of-two-point products/quotients stay exact unwidened** — multiplying by a
   0.5-style constant is a float64 exponent shift; widening it was manufacturing
   spurious -4e-16 lower bounds that broke clamped-at-zero domain guards downstream.
2. **p < 1 cusp pow** (`max(0, 1-t)^(5/6)` arch outlines): value stays enclosed by
   monotone corners (pow(0,p) = 0 finite), derivative is genuinely unbounded at the
   clamp boundary, so the run downgrades to the value-hull residual and the b&b refines
   cusp neighborhoods geometrically instead of dumping them on 32 ms decimal cells.

**Gothic final classification (empirical, histogram-clean):** with these, Gothic runs the
ENTIRE proof with ZERO screen refusals — and still exceeds the deadline as pure
hull-cascade volume along its arch outlines. The outlines are p<1 CUSP CURVES (vertical
tangent), diagonal in (u,v): no axis-aligned station ladder can reach them, and hull
convergence at ~h^0.83 along a curve costs millions of cells. GothicArches therefore joins
WaveInterference in the CURVED-FEATURE-ALIGNMENT class — the unlock is stations ON curves
(true feature-conforming tessellation, the same machinery the production mesher track
carries), not more ops, density, or ceilings.

Updated routing table: U3b exact-rational stations -> fract family (6 styles, axis-aligned
jump lines); curved-feature conforming (U5-class) -> GothicArches + WaveInterference;
U4 curtain/riser complexes -> 7 layered styles. Certified set: five pots across four
styles (HR small+default-scale, SR, FB, SE).

## Addendum 7 — containment #4 CLOSED: adversarial regression suite (2026-07-16)

`src/geometry/targetSolid/adversarialContainment.test.ts` — six permanent tests, each
CONSTRUCTING one failure mode the old sampled/percentile rulers admitted and pinning the
chain's refusal. Design rule: every adversarial case first shows the untouched artifact
PASSING at the same budget, so the refusal is attributable to the attack, never fixture
slack.

| Attack | Construction | Refusal (pinned) |
|---|---|---|
| p99-pass/max-fail | 1 vertex of ~18.9k-tri certified pot displaced 0.05 mm (byte poke) | `PATCH_PROOF_REFUSED`, reported residual **50,000,026 pm** — the ruler measures the TRUE 0.05 mm defect; p99 would never see it (gated PF_G2_POT) |
| post-check mutation | 1-ulp byte flip | `byteSha256` AND `parsedTriangleSetSha256` both re-bind |
| budget coarsening (claim) | request 0.05 mm tolerance | `BUDGET_INVALID` at the composed layer — `requestedTolerancePm <= 10,000,000` is a hard wall, no coarser certificate exists |
| budget coarsening (geometry) | coarse strong-ripple grid | passes loose (2 mm), refuses 9.5 µm (`PATCH_PROOF_REFUSED` at max depth) |
| decimation bridging | collapse one facet to a point | geometry refuses (cell uncovered -> residual explodes) AND structural gate refuses independently |
| non-default params | artifact @ petal 0.01 vs target @ petal 0.15 | `PATCH_PROOF_REFUSED` — the "defaults-only" escape hatch is closed |
| twist | unspun artifact vs spinTurns 0.25 target | `PATCH_PROOF_REFUSED` at ~0.7 mm (macroscopic, pinned > 0.5 mm) |

Finding worth recording: **every geometric attack is caught by the continuous residual
gate itself** — none needed provenance side-checks to fire. And twist is INSIDE analytic
truth (radialOuterWallProgram bakes `2*pi*spinTurns*v^spinCurve` into theta placement),
so the correct G1 pin is "unspun-vs-spun refuses", not "spin refuses to build".

Suite: 5 cases always-on (~8 s total, CHEAP fixture angular 2^7), 1 gated PF_G2_POT
(~16 s, two full certified-pot proofs). Full targetSolid suite: 59 files / 427 tests
green. Remaining containment: #1 remnant (`tolerancesPassed` naming sweep).

## Addendum 8 — U3b slice 4: band-resolved piecewise nodes + FIRST fract-family certificate (2026-07-16)

Landed the two halves of exact-rational station support and connected them end-to-end:

1. **Band-resolved fract/floor (compiler v12).** A fractional-part/floor node whose
   argument is compiler-proven POINT-EXACT affine in u/v (via the existing per-node affine
   derivation — pi's interval coefficient disqualifies tau-roundtrip arguments by
   construction, exactly the right fail-closed default) now band-resolves per cell: exact
   BigInt arithmetic on the cell's rational vertex numerators must prove the argument range
   lies inside ONE closed unit band [k, k+1]; the node then evaluates as the error-free-
   checked smooth shift x−k (fract) or the exact constant k (floor) in BOTH interval
   kernels, no hull downgrade. Cells whose exact range spans a jump keep today's hull —
   a jump strictly inside a cell can never be resolved away, so misaligned partitions
   still refuse. Enclosures bound distance to the CLOSED graph of the program: on a jump
   line the resolved branch evaluates its one-sided closure limit (sound for
   distance-to-set claims — closure points are infima of graph points); a solid-boundary
   curtain at a genuinely discontinuous jump remains a G0 surface-complex obligation, and
   the flat-plane-vs-sawtooth regression pins that bands never absorb a real residual.
2. **Rational feature angular ladders.** `rationalFeatureAngularLadder(uniformLog2, N)`
   puts stations exactly ON every k/N over denominator odd(N)·2^f — no dyadic snapping —
   symmetric under reversal by construction; partitions inherit the odd factor, scale both
   axes to q·2^F, and declare the complete unit square (v15 domain gate satisfied).
   Vertical ladders stay dyadic this slice (fail-closed refusal on vertical odd factors).
3. **Crystalline re-emission (target v5).** Fractional-cycle coordinates now emitted as
   affine unit-parameter expressions — facetCount·u + heightPhase·v and its subFacets
   multiple — with tau cancelled SYMBOLICALLY at authoring time. Real semantics unchanged
   (backends + parity green); the affine arguments are what the kernels can band-resolve.
   At heightPhase 0 every wrap of both families lies on u = k/24 (defaults 12×2).

**RESULT: Crystalline CERTIFIED-PARTIAL (gentle: facetDepth 0.02, edgeSharpness 2,
asymmetry 0, heightPhase 0, facets 12×2 default) — 9,497,638 pm over 31,008 triangles in
~16 s** on the small pot with `rationalFeatureAngularLadder(8, 24)` shared stations.
**FIRST certificate in the fract family** — before this slice every jump-adjacent cell
hulled fract to [0,1] at every density and every depth, making certification impossible
in principle, not just in budget. Sixth pot in the PF_G2_POT gate.

Honest residual routing for the rest of the family: RippleInterference's jump offsets are
float constants (52-bit dyadic stations exceed the ladder envelope — needs offset-aware
ladders or program-side offset normalization); GeometricStar needs vertical rational
ladders (row floors in v) plus its row-coupled sector floors; SuperformulaBlossom's `sign`
and CelticTriquetra's `step` are value jumps the band machinery does not yet cover
(same affine-argument pattern, different ops); Voronoi rides floor-banding + the proven
constant-pcg2d path and should be re-attempted next; Crystalline at heightPhase ≠ 0 has
DIAGONAL jump lines — the exact band check already handles arbitrary affine directions,
but the axis-aligned tessellation cannot avoid straddling them (feature-conforming cells,
U5-class). Gothic/WaveInterference stay in the curved-feature-alignment class (unchanged).

## Addendum 9 — U3b slice 5: vertical rational ladders + the Voronoi campaign (2026-07-16)

**Machinery landed:** vertical station ladders may now carry odd denominator factors, and
`rationalStationLadder(uniformLog2, stations)` inserts ARBITRARY exact p/q stations (lcm
denominator). Partition emission combines per-axis odd factors (q = lcm of angular and
vertical) and still declares the complete unit square. This was forced by a general
discovery: **patches whose local v remaps affinely into style-t (inner wall, drain wall)
have their lattice/jump lines at REMAPPED positions** — e.g. the inner wall's line
t = k/8 sits at local v = (k/8 − c)/s with c = t_bottom/H. At H 40 the float rounding of
c makes those positions astronomically-denominated; at H 32 (c = 3/32, exactly dyadic)
they are the small rationals (4k−3)/29 — geometry choice matters for station alignment.

**Voronoi findings (all measured on the H32/OD30 small pot, relief-gentled):**
1. The affine emission was ALREADY in place (`u·scale + pulse·scale`, `t·scale·zStretch`)
   — at defaults (scale 8 = power of two, pulse 0, zStretch 1) every u-lattice line is
   dyadic, the period wrap divides exactly, and the banded floors light the
   proven-constant PCG2D path end-to-end: the U2 Voronoi hypothesis is now LIVE (walls
   consult only ~100–130 decimal cells, refusal histograms near-empty).
2. **WEB mode (morph 1) at jitter 0.8 is genuinely value-discontinuous:** the true
   second-nearest center can live outside the 3×3 window, so the 9-candidate f2 JUMPS
   across lattice lines — measured 0.138 mm on the inner wall. An authenticated
   production-pattern property (the shader shares it), not provable as a graph: needs U4
   curtains or a window-exact F2. Direct lattice-line sampling shows NO jumps in F1
   (bubble) at any tested jitter.
3. **jitter 0 is pathological for the PROOF:** centers coincide with lattice corners =
   mesh stations, so a sqrt cusp touches cell corners at every depth — thousands of
   32 ms decimal consults (6,916 on one patch alone). The jitter is protective; never
   chase station alignment by zeroing it.
4. **BUBBLE mode (morph 0, jitter 0.8) CONVERGES on all six patches individually**
   (every patch ≤ 9.4999 µm; walls 9,499,980/9,499,986 pm at relief 0.04) — but the
   summed geometry is ~150 s vs the 120 s composed ceiling, at every configuration tried
   (relief 0.02–0.05, angular 2^7–2^9, walls 2^5–2^7). The cost driver is Clarke-hull
   subdivision volume along the CURVED Voronoi bisector kink-lines (~10–15× a smooth
   style's cell count). Classification: **compute-bound (U5/G4-era streamed scans or
   bisector-conforming cells), no longer mechanism-blocked** — a real reclassification
   from the pre-U3b "screen op gap, impossible in principle".

Certified set unchanged this slice: six pots across five styles. Next fract-family
increments in leverage order: GeometricStar (vertical rational ladders now exist; needs
the sector-coordinate affine re-emission and gsShift=0 gentling), SFB/CelticTriquetra
(sign/step value-jump banding), RippleInterference (float-offset ladders).

## Addendum 10 — U3b slice 6: GeometricStar CERTIFIED — first style with BOTH exact jump families (2026-07-17)

**GeometricStar gentle CERTIFIED-PARTIAL: 9,499,903 pm two-sided / 176,128 triangles /
46.7 s composed** on the H32/OD30 pot (params: relief 0.02, roundness 1; everything else
pure registry defaults — points 8, gap 0.05, detail 0.5, layers 4, interlace 1, zoom 1,
shift 0). Seventh pot, sixth style in `PF_G2_POT`. First certificate whose exact stations
span BOTH axes: sector floors jump in u (k/8) and row floors jump in v (t = k/4),
including the REMAPPED inner wall where those rows live at v = (8k−3)/29 — the
slice-5 vertical rational ladder's first production use, enabled by choosing H 32 so the
bottom fraction c = 3/32 is exactly dyadic (the slice-5 geometry-choice lever, exercised).

**The one code change (target v6):** GeometricStar's sector cycles are now emitted as
affine unit-parameter expressions — pointCount·u, plus rowParity·shift only when
shift ≠ 0 — with tau cancelled symbolically at authoring ((θ + rowOffset)/(τ/N) =
N·u + rowParity·shift exactly, since 2π/τ = 1). The old emission divided θ = τ·u by
sectorAngle = τ/N with INTERVAL τ, so at any cell touching u = k/8 the enclosure
overhung the integer and the sector floor hulled one full band wide at every depth —
measured 7.33 mm on a station-adjacent cell that the re-emission closes to 0.0202 mm
(pure base-curvature sag). At shift = 0 (registry default) the row-coupled term is
constant-folded away at authoring so the floor argument is compiler-provably
point-affine; at shift ≠ 0 it chains through the row floor, is not affine, and keeps
the sound hull (regression-pinned on a cell straddling the shifted jump u = (k−0.37)/8).
Real semantics unchanged; float parity pinned at both row parities.

**Measured campaign (per-patch probe, Addendum-9 pattern, before tuning):**
- The feared diagonal-strap Clarke-volume explosion did NOT materialize: total geometry
  14–37 s across all configs tried (vs Voronoi bubble's ~150 s); fast-screen acceptance
  ~85 %, depths ≤ 2 on certified runs.
- At roundness 0 (edge 0.02) the walls refuse HONESTLY: the strap's vertical
  cross-section (~0.019 in v) fits inside one 2⁻⁵ v-cell, so the artifact triangle
  bridges the whole bump — dense-sampled TRUE residuals 15.1 µm (inner wall) / 10.0 µm
  (outer wall), both at the bottom edge (matrix lesson #2's hot spot, reconfirmed). The
  depth-24 refusal values (9.50000x pm) were again the lesson-#1 crossing-contour
  artifact — relief- and density-invariant while the true max moved.
- Two honest levers close it: roundness 1 widens the smoothstep edge to 0.22
  (κ ∝ relief/edge², ~48× softer), and walls 2⁶ resolve the widened cross-section.
  Angular 2⁹ covers the u-direction. relief 0.02 keeps ~4× margin.

**Verification:** 61 files / 452 + 9 gated tests ALL GREEN foreground (7 pot proofs
incl. GS ~51 s; adversarial containment green); eslint 0-warnings on all touched files;
tsc exactly at the 356-error HEAD baseline (zero new; one same-family test error was
cast away). detect_changes: LOW, 7 symbols / 5 files, zero affected processes.

**Residual routing after this slice:** SFB (`sign`) + CelticTriquetra (`step`/`atan2`)
= value-jump banding on the same point-affine machinery (BandedJumpNode already keys
off the affine derivation — extend the op set); RippleInterference = float jump offsets
(BigInt ladder numerators or authoring-side offset normalization); Voronoi bubble =
compute-bound (U5/G4 envelope); web mode + heightPhase ≠ 0 diagonals + Gothic/WI curved
features = U4/U5 classes, unchanged.

## Addendum 11 — U3b slice 7: sign/step value-jump banding (compiler v13) + honest SFB/CT rerouting (2026-07-17)

**Machinery landed (compiler v12 → v13):** `sign` nodes with a point-exact affine
argument and `step(edge, x)` nodes whose COMBINED argument x − edge is point-exact
affine now band-resolve by the same exact BigInt per-cell check, against their single
zero jump: a cell provably on one closed side evaluates that side's closure constant
(sign −1/+1; step 0/1, the right-closed branch carrying the true `edge <= x` equality
value); mixed-sign cells keep the hull in every kernel (fast string, fast numeric,
decimal — bit-identity pinned). 9 new kernel tests incl. a DIAGONAL combined-affine
step line, one-sided closures, straddle soundness pins, and interval-pi refusal.

**Test-design lesson worth keeping:** a value-jump band is for INTERMEDIATE jumps
inside continuous composites (sign(x)·x = |x|, step·arg = max(0, arg)) — exactly like
fract inside Crystalline's triangle wave. A genuinely discontinuous OUTPUT leaves a
real full-amplitude residual at the station no matter how the node resolves (float
`sign(0) = 0` at the artifact corner makes it visible immediately) — that is and stays
a U4 curtain obligation, never a banding target.

**Honest rerouting of the two styles this was aimed at (emission inspection):**
- **SuperformulaBlossom:** its `sign` argument is `max(0, denominator − ε)` with a
  TRANSCENDENTAL denominator — NOT affine and not re-authorable to affine. Banding
  cannot apply. Wherever gentle params keep denominator − ε interval-positive the sign
  gate already resolves by plain positivity; the real question is the curved level set
  denominator = ε (output-discontinuity ⇒ curtain class if reachable, else params must
  provably clear it). Slice-4's "same affine-argument pattern" claim was WRONG for SFB.
  Route: probe first (classifier), not banding.
- **CelticTriquetra:** its `step(0.3, vBand)` / `step(vBand, 0.7)` gates ARE the
  intended shape but vBand chains through fract-family nodes, so the COMBINED argument
  is affine only if CT is re-authored Crystalline/GS-style (emit the band coordinates
  as affine unit-parameter expressions). Plus its `atan2` fold needs its own routing.
  The v13 machinery is the necessary substrate; CT re-authoring is the next increment.

Certified set unchanged this slice: seven pots across six styles.

## Addendum 12 — U3b slice 8: SFB + RI certified with ZERO new machinery; CT measured into the conforming class (2026-07-17)

Measurement-first execution of the slice-7 handoff (probe before building — the
roadmap review's classifier discipline). All runs H40/OD30 small pot, foreground.

- **SuperformulaBlossom gentle CERTIFIED-PARTIAL — 9,499,801 pm / 53,760 tris /
  ~22 s** (uniform 2⁸, walls 2⁵ — no ladder). Recipe: sf_strength 0.15, m 6→6
  (constant integer ⇒ every |trig| zero line is vertical), n1 1→1 (outer power
  exponent exactly 1), n2 2→2 / n3 4→4 (even powers ⇒ the abs-power terms are
  analytically smooth). The transcendental sign-gate argument
  max(0, cos²+sin⁴ − 1e-6) stays ≥ 3/4 − ε, so it resolves by plain interval
  positivity — the slice-7 routing CONFIRMED on the bench; banding was never
  consulted. Eighth pot / seventh style. The reachable level set
  denominator = ε at sharp params (n1 → 0.1, n2/n3 large) remains the
  output-discontinuity corner (curtain class).
- **RippleInterference gentle CERTIFIED-PARTIAL — 9,499,975 pm / 86,528 tris /
  ~49 s** (count 4, rotation 0, freq 6, relief 0.15; walls 2⁶ for the ~6.5 µm
  wave sag). **Addendum-8's "float jump offsets" DISSOLVES at power-of-two source
  counts with rotation 0**: i/4 is exact in float, so the antipode fract lines
  land on k/4 — already uniform-dyadic stations — and the argument
  u − sourceU + 0.5 is point-affine (no τ roundtrip). Ninth pot / EIGHTH style.
  The float-offset wall is real only for counts ∉ {2,4,8} or rotation ≠ 0 —
  an envelope boundary like GS shift ≠ 0 (BigInt ladder numerators when a
  certificate there is actually wanted).
- **CelticTriquetra classified OUT (4 measured refusals):** deadline burns,
  density-invariant (2⁸ w5 / 2⁹ w6) AND relief-invariant (0.3 mm and
  **sub-tolerance 0.005 mm**). The sub-tolerance refusal is the decisive one: the
  wall is subdivision VOLUME, not hull amplitude. Mechanism: the braid runs on a
  45°-ROTATED lattice (rotatedX = u·columns + vBand·rows), so its fract jump
  lines are DIAGONAL in (u,v); straddle cells never resolve on any axis-aligned
  partition and the b&b grinds to depth cap through 32 ms decimal consults
  (the Voronoi-kink signature). The slice-7 handoff's vBand re-authoring was
  intentionally NOT built — it affine-izes only the edge-cap step gates and
  cannot unlock the braid. CT joins Gothic / WaveInterference /
  Crystalline-heightPhase≠0 / GS-shift≠0 in the curved/diagonal
  feature-conforming class (U5); the medallion atan2 sector fold is the same
  class.

**Fract-family closeout.** Crystalline ✓, GeometricStar ✓, SuperformulaBlossom ✓,
RippleInterference ✓ certified; Voronoi bubble compute-bound (per-patch
converged, Addendum 9); CelticTriquetra conforming-class. **U3b is CLOSED — no
remaining style is unlockable by stations/bands alone.** The three remaining
walls are exactly the roadmap's next frontiers: curved/diagonal conforming cells
(U5 spike, WI as vehicle), U4 curtain complexes, envelope v3/streamed scans.
Certified set: **NINE pots across EIGHT styles.**

## Addendum 13 — U5 slice 9: conforming feature-line cells — FIRST diagonal-jump certificate (2026-07-17)

**Architecture finding that collapsed the build:** the proof chain was ALREADY
triangle-native. `verifyExactDyadicRectanglePartition` audits ARBITRARY
exact-rational conforming triangulations (positive orientation, pair audit
allowing only shared vertices/complete shared edges, exact area sum = coverage),
and cMPD's barycentric subdivision never assumed grids. The v15 gate pins only
the DOMAIN rectangle. So conforming cells are a pure tessellation-layer build —
zero kernel changes — and splitter bugs can only surface as refusals, never as
false certificates.

**Machinery (`conformingLinesByPatch`):** per-patch PARALLEL straight lines
a·u + b·v = c with integer coefficients. Strictly-crossed cells are split along
the EXACT line by exact-rational convex clipping; intersections land only on
axis-aligned edges (a parallel line is sign-constant along any previous cut
edge), and the frame denominator extends by lcm(|a|, |b|) so every intersection
is an exact integer numerator. Fail-closed: pairwise-parallel only,
boundary-row crossings must land EXACTLY on shared angular stations (junction
welds stay T-junction-free), seam-interior crossings refused, degenerate pieces
refused. Line-free patches emit byte-identical plain grids.

**RESULT: Crystalline heightPhase 0.25 CERTIFIED-PARTIAL — 9,499,985 pm /
50,544 tris / 19.4 s composed** (H32/OD30, facetDepth 0.02, sharpness 2) — the
exact corner Addendum 8 measured as impossible-in-principle for axis-aligned
partitions. Tenth pot in `PF_G2_POT`. Per-patch (probe): all six converge at
depth ≤ 2 with ~85 % fast-screen acceptance; drain-wall = 688 cells / depth 0 /
~50 ms. One-sidedness between adjacent half-integer lines puts BOTH fract
families inside single unit bands per cell, so every piece band-resolves — the
proof runs at smooth-style cost on a diagonal-jump style.

**Campaign lesson (u-reversal):** the atlas's inward-facing patches (inner
wall, drain wall — `reverseU: true`) carry their style argument at 12(1−u) +
0.25·t(v); the first line set ignored this and the inner wall refused in 0.5 s
at the full 0.3 mm fract-hull amplitude while the drain wall ground its
deadline on ~1,800 decimal consults. Corrected families: inner
1536u − 29v = 1539 − 64k (t = (3+29v)/32 at H32), drain 1536u − 3v = 1536 − 64k
(t = 3v/32). Boundary crossings all land in the symmetric j/48 ∪ (64k±3)/1536
ladder — which is also why the u-reversed top-rim/bottom patches passed with
stations alone (symmetry covers reversal).

**Updated conforming taxonomy:**
- **Straight PARALLEL diagonal families: CLOSED** (this slice). Crystalline
  heightPhase ≠ 0 certified; the same machinery covers any style whose jump
  lines form one parallel rational family per patch.
- **Crossing straight families (CelticTriquetra's ±45° braid): small
  extension, not new theory** — line-line intersections of integer lines are
  rational (denominator = the 2×2 determinant), so the frame lcm must absorb
  cross-family determinants and the splitter must allow intersections on
  previous cut edges. Bounded work; CT stays honestly open until then.
- **Row-coupled offsets (GS shift ≠ 0, Crystalline-hp analogues with per-row
  phases): kernel-side gap, not tessellation** — the argument is piecewise
  affine per row band, which the point-affine band predicate refuses; needs
  region-resolved (per-band) affine derivation in the compiler before
  conforming rows can help.
- **CURVED feature curves (WaveInterference clamp level set, Gothic p<1 arch
  outlines, Voronoi bisectors): the next slice** — same splitter, driven by
  per-cell guide-polyline chords (rational-snapped crossings computed once per
  shared edge for conformity). Pieces are then one-sided up to a thin sliver
  whose width shrinks second-order with the polyline, restoring convergence
  for kinks; p < 1 cusps additionally need graded ladders toward the curve
  (the HR t^-0.9 base-ladder precedent).

## Addendum 14 — U5 slice 10: chord machinery + WaveInterference CERTIFIED with a corrected classification (2026-07-17)

**Machinery landed (`conformingChordsByPatch`):** curved guide polylines as
exact chord CHAINS. Every chord endpoint must lie ON a grid line (angular
station column or vertical station row), so cell splitting is a pure boundary
walk between two on-boundary points — **no divisions at all**; chord
denominators fold into the frame by lcm. Conformity across cells comes from
the chain (interior vertices shared verbatim; the exact kernel refuses any
inconsistent chain as a T-junction — the tessellator never has to be trusted).
Boundary-row endpoints must be angular stations; seam-interior endpoints
refused; degenerate splits refused; piece fanning searches for a valid origin
so collinear boundary runs (several chord endpoints on one cell edge) fan
correctly. Lines and chords compose in one frame. TDD, 2 RED tests first.

**WaveInterference CERTIFIED-PARTIAL — 9,499,973 pm / 411,648 tris / ~84 s**
(H32/OD30, PURE DEFAULTS except relief 2.3 → 0.25 mm, edge fade off). Tenth
style-config, NINTH style. **And the mechanism is a measured classification
CORRECTION:** the Addendum-2/6 "√-type cusp by elimination" call was the
lesson-#1 crossing-contour artifact. The campaign playbook nailed it in three
steps: (1) per-patch isolation → only the outer wall refused, tri 199292 at
uv≈(0.622, 0.02), depth 24; (2) dense ridge sampling in that box → ridge ∈
[0.136, 0.660], i.e. BOTH clamp branches unreachable — no cusp, no kink, the
surface is smooth there (at defaults rc=0.45 ⇒ exponent 1.85, and the moiré
envelope never reaches the clamp); (3) axis-resolved density: vertical
doubling (w5→w6) left the crossing pinned (9,500,012 → 9,500,014 pm — the
contour artifact), but the binding axis is ANGULAR (moiré products at
effective frequency ~27): 2^10 angular closed it. No conforming chords were
consumed by this certificate.

**Honest routing after this slice:** WI joins the smooth-dense class
(density-responsive on the right axis — its earlier U3/U5 placements are
retired). The chord machinery remains the unlock for the styles with GENUINE
curved features: Gothic (p<1 arch-outline cusps — zero-refusal hull-cascade
profile, Addendum 6, stands), Voronoi bisector kink-lines (bubble mode's
compute burn), CT braid (after the crossing-family splitter extension), and
Crystalline/GS row-coupled corners (kernel per-band affine first). Certified
set: **ELEVEN pots across NINE styles.**

## Addendum 15 — slice 11 (6-hour autonomous session): envelope v3, Voronoi CERTIFIED, Gyroid and Gothic honestly measured (2026-07-17)

**Envelope v3 (minimal-change):** all nine hard elapsed ceilings 120 s → 240 s;
`HARD_MAX_TOTAL_MAPPED_TRIANGLES` 524,288 → 1,048,576. Pools untouched until a
measured trip names them (v2 discipline).

**Voronoi bubble CERTIFIED-PARTIAL — 9,499,879 pm / 172,032 tris / 118.8 s —
TENTH style, twelfth pot.** And a correction to Addendum 9: "compute-bound" was
partly a LADDER GAP. The inner wall's remapped t-lattice needs rows at EVERY
t = k/8 — v = (4k−3)/29 at H32 including the odd k (1/29, 9/29, 17/29, 25/29);
the GS-copied ladder carried only even k, and the invariant ~80 µm refusals
were the missing-odd-k floor straddles (per-patch isolation pinned the failing
cell exactly at v = 1/29). With the full ladder + walls 2⁷ (bisector-kink
chords) the composed proof fits in ~119 s.

**Gyroid honestly measured OUT (for now):** the four "razor-miss 9,500,02x"
readings across relief/fade/ladder changes were ALL the lesson-#1 contour
artifact — the TRUE-sag map (centroid vs triangle interpolation over the
actual grid) found **166.8 µm at (u=0.54, v=0.51), mid-wall, style-driven**, at
1024×128 walls. Uniform grids need 2–4M-triangle-class meshes at any visible
relief; the honest vehicle is anisotropic/metric tessellation (the production
track's M = g/h² kernel), not another cap raise. NEW PLAYBOOK RULE: relief- or
fade-invariance of a depth-24 crossing VALUE discriminates nothing; only
per-patch isolation + TRUE-sag maps do.

**Gothic campaign — the cusp-cascade is DEAD, certification one session out:**
- Conforming chords for the arch kink `t = archZ(u)` (pointiness 1: smooth
  cosine arcs between station-alignable 24ths) + the gate offset ran the FULL
  composed proof in 18–56 s with normal cell counts — the historic
  budget-independent ~100 s hull-cascade burns (Addendum 6) are eliminated.
- Machinery hardened en route (committed): seam-column chord endpoints are
  legal at GRID CORNERS (Gothic's arch bases sit exactly on the seam);
  axis-collinear chords are skipped and crossing runs collapse to corner
  representatives (flat-base grazing rows).
- Measured mechanisms: (a) arch-base ANGULAR SPIKE (columnEdge⁴):
  κ_u ≈ 5,560 mm/u² ⇒ geometric k/12-neighborhood stations (landed in the
  harness); (b) THE binder: the rib-band quartic STRIPE at the steep mid-flank
  — true sag **196.8/197.6 µm at (u≈0.72, t≈0.49)** — under-resolved ACROSS
  the ±0.04 stripe that crosses ~1 angular cell at slope ~20.
- Architecture answer (validated in concept): graded OFFSET guide curves
  (±0.003…0.036) through the same chord machinery — offset strips carry the
  across-stripe resolution so GLOBAL rows stay coarse. First full-period
  attempt: 126k chords ACCEPTED by the splitter (pools tripped ⇒ rebalanced to
  rows 2⁶ + 7 offsets/side ≈ 54k chords); one chain-consistency defect remains
  near offset-curve flat minima (topology refusal). The complete campaign
  harness is committed at `research/bridge/_gothicVoronoiConformingSpike.test.ts`.
  **Classification: offset-strip-conforming — mechanism measured, machinery
  proven, one hardening session from certification.**

Certified set: **TWELVE pots across TEN styles.**

**Addendum 15 (cont.) — second half of the window: chain hardening DONE, the
mullion spike, and the volume wall.** The offset-strip chain defect is FIXED:
curves are now chained GLOBALLY per period (per-half-arch chaining left the two
chains around each base minimum ending at unconnected mid-edge points), with
explicit seam-corner anchors and boundary-column pivots — topology and the
partition audit accept the full 61–68k-chord meshes. The next binder appeared
exactly where the playbook predicted a sibling of the base spike: the
**mullion ridge at every apex column** ((1−xAbs/0.0975)⁴, half-width ~0.0026 u,
κ_u ≈ 107,000 mm/u²) — closed by extending the geometric station neighborhoods
from k/12 to every k/24. That configuration then hit a WORK-CELL VOLUME WALL:
1M and 2M cells both exhaust at 473 angular stations. A principled kernel
improvement was landed for the sliver component — **cMPD v16: longest-edge
bisection for cells with aspect > 8** (two children tile the parent exactly;
exact doubled-weight midpoints; suites + adversarial containment green; full
12-pot gate revalidated under the new evidence hashes) — but the Gothic grind
has a second, still-unmeasured component (suspect: slow-converging screen
enclosures along the C³ quartic support curves crossed by ultra-thin
station columns). THE HISTOGRAM RAN (window hour 3): decimalUnits = 0,
depth <= 5, ~220 units/cell — the grind is pure BREADTH (mesh size), not
convergence. Coarsening the global grid (strips carry the features) removed
the volume wall entirely: a8w5 runs the full proof in ~69 s and lands at
9,500,004 pm — FOUR PICOMETRES over. The endgame is pinched between that
+4 pm contour at w5 (cells fine) and the 1M work-cell pool at w6 (full
stations + strips ≈ 152k tris/wall): NEXT SESSION picks one of two clean
exits — (a) targeted refinement at the +4 pm sliver, or (b) more cells.
Window hour 4 established the exact landscape for both: (b) needs NO code —
`FinalStlPartialCertificationOptions.patchProof.maxWorkCells` (+
`maxTotalWorkCells`) already plumb through to cMPD — but even 2M per patch
exhausts once k/64 lower-wall rows stack onto the strips (breadth × breadth);
(a) the +4 pm slivers are strip chords in the style-FLAT dead zone below the
band support carrying pure base-profile sag over their longer diagonals — so
the surgical fix is TWO-sided: clip rib-offset strip curves to the live band
(tMin = spring − bandSupport, not spring − offset) so no slanted slivers cross
the flat zone, and spend the saved cells on 1/64 rows ONLY in t ∈ [0.05, 0.2].
All knobs and the measured configurations live in
`research/bridge/_gothicVoronoiConformingSpike.test.ts`. One more measured
data point (hour 4, reverted): a NAIVE clip of all strips to
tMin = spring − 0.04 fits the cell pool (89 s to a verdict) but reads
9,546,743 pm — the clip termination rows need their own snapped stations and
corner-anchored chain ends, exactly like the gate curve's terminations.

## Addendum 16 — Gothic endgame session: the +4 pm localized, the collar mechanism calibrated, and a KERNEL-BOUND verdict (2026-07-17)

Nine per-patch probe rounds (`PF_SLICE11_GO_PP`, cMPD per patch at the
9.5M pm bound, 2M-cell pool) closed the Gothic p=1 measurement lattice.
Protocol lesson first: cross-round cells/triangle comparisons over DIFFERENT
sweep prefixes are invalid (the sweep is not uniform); only same-index
prefixes, converged totals, and refusal cells count. Multi-variable config
deltas were retired mid-session for single-variable ones.

**The one residual mechanism.** Every razor cell measured this session is
kink-crease chord sag in the base-column collar: crossings of the arch crease
t = archZ(u) are row-pitch-limited near columns (gap g ≈ (1/32)/slope), and
the ridge slope-jump 8A/w ≈ 40,000 µm/unit-t converts chord sag into
residual R[µm] ≈ 2500·κ·g², κ = 845·cos(12π·δu) — verified within ~5 % on
four independent cells:
- inner 9,500,004 pm at δ 0.009–0.0117, t 0.186–0.207 — THE hour-3 "+4 pm"
  (it was the inner wall's collar gap between the spring+0.036 row and the
  1/8 dyadic row all along);
- outer 9,500,096 pm, same class, t 0.1875–0.207;
- inner 9,500,409 pm (collar-rows config, gap to 13/64);
- outer 9,541,416 pm (k/64-band config, δ 0.0156–0.0181, t 0.25–0.28125).
Hour-4 attribution CORRECTED: the "naive clip reads 9,546,743" data point
matches the unclipped collar cell; clip terminations were never the driver,
and band clipping is retired (at safe depths it saves ~nothing; at useful
depths the collapse-run diagonals cross the residual tongue at 28–38 µm).

**The volume economics (measured, single-variable).** Hour-3 baseline
(a8w5, 8 offsets/side, spring+apex rows, no k/64) is CHEAP — walls ~460–500k
cells, 33–35 s sweeps — and fails ONLY at the two collar razors above. Every
in-contract mechanism that covers the collar band (δ ∈ [0.009, 0.020] at
~0.0018 crossing pitch, t ∈ [0.186, 0.31], 24 windows × both walls) costs:
- horizontal rows: ~190k cells each (a strip-band row is cut ~768× per wall
  — against the strip grain); ~8–12 needed ⇒ +1.5–2.3M/wall;
- angular stations: ~9k cells each (168 minimal stations ⇒ +~1.5M/wall;
  measured baseline+168 = both walls exhaust the 2M pool);
- interior chain vertices: REJECTED by the tessellator contract in 0.9 s
  ("conforming chord endpoint is off the station grid lines",
  `annularSolidReferenceTessellation.ts` buildPatchPartitionFrame).
Also measured dead: a7 (station removal reappears as work-cell splits and
worsens per-cell grind), inner w6 (44 % of sweep at 2M vs 55 % at w5), the
6/side offset regrade (the removed 0.028 row's absence stacks cross-strip +
base sag to 9,500,010 pm while saving little). The 2M per-patch pool is a
HARD envelope constant (`CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS`);
throughput ~10.5k cells/s puts the composed 235 s envelope at ~2.0–2.2M total
wall cells. Collar coverage ≥ 3× the headroom on either wall.

**Verdict: GothicArches p=1 at 0.01 mm / H32 is KERNEL-bound, not
config-bound** — reclassified from "one hardening session from certification"
(Addendum 15). Priced exits, cheapest first:
1. **Interior chain vertices** (extend the splitter/endpoint contract to
   accept degree-2 pass-through points on a conforming polyline): the collar
   fix becomes ~400 chain points ≈ ~1k extra chords ≈ trivial cells; walls
   stay at hour-3 volume ⇒ composed ~100 s. The T-junction oracle already
   handles mid-edge points on grid lines; this is the surgical kernel feature.
2. **Per-patch workers** (roadmap perf item): walls in parallel could fit the
   time envelope at ~1.9M cells/wall, but sits razor-edge against the 2M pool.
3. **Screen-enclosure improvements** (roadmap perf item): lower the ~9k/station
   and ~190k/row constants themselves.
All knobs and the measured configurations remain in
`research/bridge/_gothicVoronoiConformingSpike.test.ts` (env switches:
`PF_GOTHIC_H3_BASELINE`, `PF_GOTHIC_COLLAR` for the baseline and the
single-variable collar-station experiment).

## Addendum 17 — the interior-chain-vertex splitter extension BUILT + the volume truth corrected (2026-07-17, second session)

**The Addendum-16 named unlock is LANDED** (TDD, `annularSolidReferenceTessellation.ts`;
impact LOW — certification track only). Chord endpoints strictly inside a cell are now
legal as degree-2 chain pass-through vertices. Three kernel layers:
1. Chain assembly from chords sharing interior endpoints — fail-closed refusals for
   dangling/branching vertices ("not a degree-2 chain pass-through"), grid-free cycles,
   and chain self-intersection.
2. `splitPolygonByChain`: polyline boundary walk generalizing the chord walk, with exact
   containment (middles off the piece boundary, no strict segment/boundary crossing).
3. Piece triangulation ladder: legacy fan (bit-identical for all existing inputs) →
   for chain-marked pieces a MAX-MIN-ANGLE Klincsek DP (exact validity: no strict
   crossings, no vertex on the open diagonal, doubled-midpoint strictly inside; float
   angles steer only) → strictly-convex ear-clip fallback → refuse. Length-minimal was
   measured WRONG (a skip diagonal 8.06 beats rungs totaling 30.7 and picks the same
   chain-hugging slivers the fan does — 3.7–6° corners, the ~10 µm sag class).
**Gates: full targetSolid suite 470/470 green; the PF_G2_POT roster gate 37/37 — all
twelve certified pots re-proven to the 0.01 mm certificate under the new kernel.**

**Gothic application — the collar mechanism ladder is geometrically CLOSED.** Chain
injection on the kink + near-kink offset curves (asymmetric window: above-kink |o| ≤
0.0112 where every razor lives, below-kink |o| ≤ 0.0076 — the tongue's spring−o rows
cover below; pitch 0.0012) marched the razors down mechanism by mechanism:
9,500,004/9,500,096 (kink chords) → 9,500,182/9,500,597 (0.002-offset chords, and the
fan slivers) → 9,500,159 (+0.0075/+0.011 gap) → fixed. Every mechanism the model
R ≈ κg²/8 · f′(o) named was killed by the corresponding extension.

**THE VOLUME TRUTH, corrected.** The per-patch probe's `tri=` refusal indices are
GLOBAL artifact indices, not per-patch — all of this session's and Addendum 16's
sweep-fraction readings were misread. Restated with the partition offsets
(tessellation-only probe, `PF_GOTHIC_TRICOUNT`): chain-config walls are ~121k/123k
triangles and their FULL sweeps need ~3.5–4M work cells each; even the hour-3 baseline
walls are ~1–1.3M (not ~460–500k). Addendum 16's absolute per-row/per-station marginal
costs are RETRACTED as numbers (the relative verdict — any grid collar mechanism blows
the pool — was measured directly and stands). The doc's "a8w5 runs the full proof in
~69 s" claim is UNREPRODUCED under today's kernel: the official composed artifact at
the best config (a8w5-chain, 28,180 + 28,976 chords) is
**REFUSED after 214.3 s — Continuous proof exceeds maxWorkCells=2,000,000**, and the
inner wall additionally carries ~2× the outer's per-triangle screen slack.

**Frontier restated: Gothic p=1 fidelity machinery is DONE; the blocker is pure
proof-volume economics.** Exits, reprioritized:
1. Per-patch worker parallelism + a pool-shape decision (chain-config walls need
   >2M cells/patch — `CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS` is an
   envelope constant = Patryk's certify-or-refuse contract decision).
2. Evaluator screen-enclosure slack (the ~4M is slack-multiplied; inner ~2× outer —
   the same lever would shrink every style's proofs).
3. Scoped per-patch tolerance claims (outer-wall-first directive).
Harness: `PF_GOTHIC_TRICOUNT` (tessellation-only counts), `PF_GOTHIC_H3_BASELINE`
(disables injection), `PF_GOTHIC_COLLAR` (superseded station experiment).

## Addendum 18 — per-patch proof WORKERS built: composed wall-clock = max(patch) (2026-07-17, third session)

**Exit 1 of Addendum 17 is LANDED** (TDD; impact LOW — certification track only).
`parallelPatchProofPool.proveFinalStlWithPatchWorkers(stlBytes, canonicalInput,
target, jobsWithProgramJson, {..., patchWorkerCount})` runs the six per-patch
cMPD proofs on worker_threads and REPLAYS the outcomes through the UNCHANGED
sequential prover:
- Workers run at the sequential FIRST-ITERATION caps
  (`resolveParallelPatchProofDispatches`, exported from the composed module —
  one source of truth for the cap arithmetic); each worker mints its own proof
  session from cloned STL bytes and recompiles its evaluator from
  {targetSha256, programCanonicalJson} with program/proof hash cross-checks.
- Outcomes enter `certifyCompleteMappedArtifactGeometry` via a WeakMap-MINTED
  container (`parallelPatchProofs` option; structural lookalikes refuse) and
  the existing loop replays them through the identical shrinking-pool
  arithmetic in canonical patch order — including exact synthesis of the
  shrunk-cap refusal messages a sequential child would have thrown. The
  sequential path with the option absent is bit-identical legacy.
- Worker loading mirrors tierC/parallelScorer (esbuild native binary, temp
  `.mjs`, cached); cancellation bridges caller flags onto a SharedArrayBuffer.

**Determinism contract (tested, `parallelPatchProof.test.ts`, 4/4):**
per-patch evidence hashes are RUN-STABLE and exactly equal across modes; all
content fields deeply equal; refusals identical in code + message (geometry
refusals and aggregate-pool replays; the synthesized path omits only the
in-flight triangle index). DISCOVERY en route: the COMPOSED evidence hash and
per-stage `maxElapsedMilliseconds` were never run-stable — the composed
evidence binds its resolved elapsed budget, which finalStl passes as
remaining-deadline, so it differs between ANY two runs (two sequential runs
included). The per-patch evidence hashes are the certificate-stable anchors.

**Measurements (this machine, AboveNormal, six workers):**
- Voronoi bubble (certified, a8w6): sequential 107.8 s → parallel **55.0 s
  (1.96×)**, CONVERGED at the IDENTICAL certified bound 9,499,879 pm /
  172,032 tris.
- Gothic chain config: parallel REFUSED 235.9 s at the per-patch 2M pool —
  parallelism deliberately does NOT mask the pool-shape decision (Addendum 17
  exit 1's second half, still Patryk's call); when that ceiling moves, the
  time envelope is now ready (walls run concurrently).

**Gates: full targetSolid 474/474 (incl. the 4 new parallel tests);
PF_G2_POT roster 37/37 — all twelve certified pots re-proven, sequential path
bit-identical.** Probes: `PF_SLICE11_VORONOI_PAR`, `PF_SLICE11_GOTHIC_PAR` in
the spike harness.

## Addendum 19 — envelope v4 executed; Gothic runs the full sweep and lands TWO PICOMETRES from the certificate (2026-07-17, fourth session)

**Envelope v4 (Patryk's pool-shape decision, executed):** per-patch work cells
2M → 6M (measured trip: chain-config walls need ~3.9/4.0M — both exhausted 2M
at 51%/49.5% of their sweeps); aggregate cells 8M → 16M (2×4M + ~165k smalls
≈ 8.4M measured); all nine hard elapsed ceilings 240 s → 600 s (walls ~380 s
each at the measured ~10.5k cells/s, run concurrently by the patch workers).
DEFAULTS untouched — existing certificates are behavior-neutral (suite +
roster gates re-run green below).

**The volume wall is GONE and the razor ladder continued past the collar,
one mechanism per refusal, exactly as the playbook predicts:**
1. 9,519,144 pm — the TIER-BLEND ends: topMask's smoothstep swaps lower-tier
   relief for the lattice across topStart ± blendW = 0.53675 ± 0.05
   (blendW = max(0.015, 1.25·gaBandW)); curvature peaks at the blend ENDS
   (±600/t²) × the crest deltas (colEdge 0.70 at base columns / mullion 0.30
   at apex columns) ⇒ ~10.3 µm at 1/32 pitch. Cells pinned at the apex
   column 23/24 (inner) and base column 0 on the seam (outer). FIXED by
   rows 31/64, 33/64, 37/64 (~2.6-3.6 µm priced, confirmed).
2. 9,500,001 / 9,500,045 pm — the bandMid RIDGE FLANKS: the tier divider is
   itself a quartic ridge crest AT topStart (bw = 1.8·gaBandW = 0.072);
   the crest is a conforming named row but its flanks (~104k µm/t²) over the
   remaining 0.016-0.026 gaps price the razors. Depth 24 → 30 did NOT shave
   them (a clean discriminator: genuine geometric excess, not enclosure
   slack). FIXED by rows at 0.5265 / 0.5495.
3. 9,500,002 pm — TERMINAL for v4: the residual PLATEAU. At w5 base pitch
   the whole config adaptively prices just-under the bound (~9.49 µm class
   everywhere: the bottoms sit at 9,499,4xx-9xx by construction), so every
   fix reveals a +1-2 pm successor; meanwhile the fix currency has inflated
   (the two bandMid rows cost ~1.2M cells each — strip-crossing row cost is
   superlinear in the dense mid-band) and the run measured 581.3 s / 590 s
   with walls at ~5.2M / 6M cells. Both v4 ceilings are exhausted; the next
   verify run would time-refuse before reporting its residual.

**Exits from the plateau (ranked):**
1. Evaluator screen-enclosure slack (roadmap perf item 2) — the universal
   multiplier: cheaper cells globally buy BOTH the remaining fixes and the
   margin; inner ≈ 2× outer remains the asymmetry to attack first.
2. Envelope v5 density step (w6-class walls drop the plateau to ~2.4 µm base
   sag but need ~×1.7 volume/time over v4's ceilings — price it as v4 was
   priced, from measured trips).
3. Nothing in the accept-band direction (0.01 mm is the line; the machine is
   refusing at 2 pm and that is the machine working).
Config state: `gothic-p1-a8w5-chain` + blend rows + bandMid rows +
maxDepth 30, in the spike harness. Twelve pots / ten styles unchanged.
