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
