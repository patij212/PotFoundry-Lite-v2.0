# Strata 001 atomic feature-corridor cavity: S44 closeout

Date: 2026-08-03  
Scope: GothicArches ring mesh, feature-corridor artefacts, hard AR 50  
Source: `gothicarches_ring_DS-HT_S40VFC`  
Certified research output: `gothicarches_ring_DS-HT_S44ACC`

## Outcome

The remaining sharp facets were deterministic boundary/ownership defects, not
random tessellation noise and not evidence that the registered 2 um rung had
silently lost one constraint. The registered 2 um run recovered 12,955 of
12,955 constraints with zero final proper PSLG crossings. Historical exact-one
losses were real structural failures: a final feature arm properly crossed a
recovered arm after shared junction identity had been lost. The final
planarity guard fixes that class by splitting both arms at one shared vertex
and must reject any incomplete ledger.

The bounded corridor-sector implementation now produces 22 disjoint atomic
patches. The composed S44 mesh has no triangle above AR 50, no visual facet
above 100 um, no degenerate or orientation-invalid triangle, no non-manifold
edge, and exactly the same 1,150 open-boundary edges as S40.

## Deterministic causes found

1. **Antipodal chart branch:** locus segment endpoints were independently
   unwrapped around the crop reference. A short segment crossing the antipodal
   branch became a false near-2*pi chord through the crop. Segment `b` is now
   unwrapped coherently from segment `a`.
2. **Loose feature proximity classification:** the original 8/16 um
   vertex/edge tolerances assigned nearby collar triangles to named locus
   loops. Measured legitimate vertices were exactly on the feature; false
   positives were 4-8 um away. The artifact harness now uses 2/4 um.
3. **Interior ownership leak:** carrying every old cavity vertex into CDT
   preserved the near-boundary needles the remesh was supposed to remove. Only
   perimeter and named feature/junction identities now survive; unconstrained
   interior sites are regenerated.
4. **Retry witness overwrite:** at source triangle 1,100,000, the initial
   AR-violating candidate had a three-boundary-vertex witness. Fifteen
   longest-edge splits eventually stopped at a two-vertex exterior rim edge.
   The terminal pair overwrote the initial triple, so adaptive growth tried to
   cross the true rim, found no neighbour, and stopped. Initial and terminal
   witnesses are now separate. The retry grows around the original acute
   sector and accepts a 44-parent cavity at AR 13.618 and 4.823 um.
5. **Direct LEB is not a sliver cure:** bisection retains an original endpoint
   angle in one child. In the rim witness it changed AR 50.0077 into an interim
   AR 867.7 cascade. LEB remains a private candidate-closure tool; it is never
   the correctness certificate or a live-mesh fallback.

## Converged algorithm

For each connected bad region:

1. Grow and topologically regularize a complete triangle-ring cavity.
2. Freeze its directed perimeter and extract every named feature fragment.
3. Preserve shared feature-junction identity and planarize any feature-feature
   crossing into one analytic shared vertex before CDT.
4. Discard unconstrained old interior vertices and pave several deterministic
   metric-scaled constrained-Delaunay candidates in scratch space.
5. Use physical equal-chord longest-edge closure only inside the candidate.
   Visual splits preflight alternate edges and are accepted only when both
   children stay under AR 50 and strictly reduce the visual maximum.
6. On a boundary refusal, retain the initial shape witness and expand the
   source cavity around that witness. A later terminal blocker is diagnostic,
   not a replacement growth instruction.
7. Commit nothing unless the complete candidate proves: every named edge
   recovered, zero proper crossings, AR <= 50, zero admission failures, zero
   non-manifold edges, equal Euler characteristic, identical frozen boundary,
   every replacement facet <= 10 um, and deterministic output.

Temporary invalid candidates are allowed only in private scratch state. Any
crossing, missing feature edge, cap exhaustion, weld, fold, boundary change,
or visual/shape failure rolls back byte-identically.

## Exact S40 -> S44 audit

| Metric | S40 source | S44 output |
|---|---:|---:|
| Triangles | 1,259,626 | 1,259,942 |
| Removed / added by 22 patches | - | 1,008 / 1,324 |
| AR > 50 | 12 | **0** |
| Worst AR | 85.129095 | **49.999473** |
| Degenerate facets | 0 | **0** |
| Non-manifold edges | 0 | **0** |
| Orientation mismatches | 0 | **0** |
| Open-boundary edges | 1,150 | **1,150** |
| Visual > 10 um | 3,701 | 3,487 |
| Visual > 50 um | 175 | 131 |
| Visual > 75 um | 50 | 23 |
| Visual > 100 um | 26 | **0** |
| Visual > 125 um | 23 | **0** |
| Maximum visual error | 188.459 um | **96.411 um** |

The 22 local certificates recover 10/10 active feature-fragment obligations,
with zero missing edges, zero final proper crossings, zero local non-manifold
edges, and zero replacement facets above 10 um. The untouched part of S40 is
byte-preserved, so the registered global feature ledger remains the baseline;
the composed STL itself does not serialize feature names and therefore cannot
independently recount all 12,955 named obligations.

Only two shape-closure bisections were needed across all accepted patches, both
inside one candidate. The measured improvement came from conform-first
ownership plus corrected cavity retry, not from switching wholesale to LEB.

## What “every triangle perfect” means here

For shape and mesh validity, the whole S44 output meets the operational hard
contract: every shipped triangle is finite, non-degenerate, correctly admitted,
and AR <= 50; the mesh has no topology regression.

For visual approximation, the guarantee currently applies to every triangle
created by the 22 replacement cavities (<= 10 um). It is not yet a global
<=10 um remesh: 3,487 byte-preserved S40 triangles remain above that visual
budget, with a maximum of 96.411 um. Claiming the entire object is visually
perfect would therefore be false. Removing that remaining population requires
component scheduling over all inherited >10 um regions or a global constrained
remesh, followed by the same atomic certificate.

## Regression and artifact paths

- Planner: `research/bridge/_strataCorridorCavity.ts`
- Synthetic tests: `research/bridge/_strataCorridorCavity.test.ts`
- Gothic artifact/regression test: `research/bridge/_strataCorridorCavity.gothic.test.ts`
- Disjoint composer and whole-mesh audit:
  `research/bridge/_strataCorridorCavity.compose.gothic.test.ts`
- Mesh: `research/exchange/_strataCorridorCavity/gothicarches_ring_DS-HT_S44ACC.stl`
- Error sidecar:
  `research/exchange/_strataCorridorCavity/gothicarches_ring_DS-HT_S44ACC.stl.error.bin`
- Machine-readable report:
  `research/exchange/_strataCorridorCavity/gothicarches_ring_DS-HT_S44ACC.report.json`
- Debate record:
  `archive/plans/parametric-pipeline/2026-08-03-strata-ar50-atomic-corridor-debate.md`

