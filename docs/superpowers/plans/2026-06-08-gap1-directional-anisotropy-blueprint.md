# GAP 1 — local/directional anisotropy: vetted implementation blueprint (2026-06-08)

## RESULT (2026-06-09) — IMPLEMENTED, e2e-tested, then DISABLED BY DEFAULT (opt-in)
The blueprint was implemented in full (commits `e17744d` + `60dbb87`, 8 stages, +1325 LOC, 230 unit
tests green, adversarially reviewed: 2 sound / 1 fixable, no fatal holes). It is a **proven true
no-op at default** — all 20 styles byte-identical e2e (`e2e/regress-20-directional-default-2026-06-09.log`)
— and topologically watertight/T-junction-free under directional cells (the registry N-mid template
holds to eUL gaps of 4, mixed-eUL, seam-straddling — adversarially probed). **BUT the e2e on the REAL
short-wide residuals showed it does NOT deliver and REGRESSES, so it is now OFF by default (opt-in via
`directionalRefine:true`):**
- **Crystalline short-wide: 0 splits, sliver=55 unchanged.** Its residual cells are F-SHEAR
  (physW≤physH), so the `physW>physH` long-axis guard CORRECTLY skips them. The synthetic analogue
  (rippled cylinder, F≈0) was u-long and got fixed — but the REAL GPU surface is F≠0. The blueprint's
  efficacy assumption (residuals are u-long) was WRONG for the real surfaces.
- **ArtDeco short-wide: BUILD TIMEOUT (>180s).** Its cells ARE u-long so the trigger fires, but the
  both-axis eUL-balance cascade EXPLODES (a u-split propagates as a vertical stripe through the whole
  t-column — exactly the risk the design adversarial review flagged) → on 3496 cells it never converges.
- So the directional pass either no-ops (F-shear) or explodes (u-long cascade). The REAL fix for the
  residual short-wide slivers (Crystalline 55, ArtDeco 3496, Gyroid 95, Voronoi 63) is **metric-ALIGNED
  / rotated cells** (F-shear area-collapse), the SAME tool as the twisted case — NOT u-only refinement.

**To revive directional refine** (if a genuinely u-long-residual case appears): (1) bound the eUL-balance
cascade (cap total splits / limit the t-column propagation), (2) confirm the target residual is u-long
(physW>physH) not F-shear, (3) flip the `WatertightAssembly` default back. The code + tests are kept.

---



Produced by a design+adversarial-verification workflow (4 architects → 3 judges → 3 skeptics
→ finalizer). The 3 skeptics returned **fundamentally-broken** on the naive per-leaf u-only
design (13 fatal holes); the finalizer patched all of them. This is the hole-patched, staged,
TDD-ready plan. **No code has been written yet.**

## Problem
After the committed global **uBias B** (gated, no-op at default), residual short-wide slivers
remain on styles with PERVASIVE local relief — cells whose LOCAL √E/√G/2^B still exceeds the
sliver bound (ASPECT_MAX=100). Measured residual short-wide slivers (all otherwise topologically
valid): Crystalline 55 (maxAspect 143.8), ArtDeco 3496 (101.6), HexagonalHive 4 (150.1),
GyroidManifold 95 (667.9), Voronoi 63 (428.4).

## Efficacy scope (HONEST — do not over-claim)
This blueprint drives the **u-long** residuals to 0: **Crystalline, ArtDeco, HexagonalHive**.
It does NOT fix:
- **GyroidManifold / Voronoi** — their sliver is F-SHEAR area-collapse (EG−F²→0), not width-excess;
  u-only refinement provably can't fix it (area∝√(EG−F²); shrinking du doesn't raise it). The
  trigger uses the F-INCLUSIVE metric aspect + a `physW>physH` long-axis check, so it correctly
  LEAVES shear cells untouched (no useless inflation) rather than failing to converge. These need
  metric-aligned/rotated cells (separate, handoff §5b item c).
- The **deferred inserted styles** (B=0) — they need un-deferring (blocked by the CelticKnot braid
  bnd=6 bug) before uExtra can help. Directional refine is therefore DISABLED on feature walls.

## Chosen approach
Per-leaf integer `uExtra` (default 0). A cell is `{level, iu, it, uExtra}` with effective u-level
`eUL = level + uBias + uExtra`; u-span `1/2^eUL`, u-coord `u0 = iu/2^eUL`. T-axis unchanged
(`t0=it/2^level`, `tSize=1/2^level`). A directional u-split of `(level,iu,it,k)` →
`(level,iu*2,it,k+1)` and `(level,iu*2+1,it,k+1)`. Four structural changes patch the fatal holes:

- **H1 — explicit integer address.** Extend `QuadLeaf` to carry `{u0,t0,level,iu,it,uExtra}`; ALL
  conforming-core consumers read `iu/it/uExtra` DIRECTLY and NEVER reconstruct via
  `Math.round(u0*2^(level+B))` again (that collides: a uExtra=0 cell at iu=k and a uExtra=1 cell at
  iu=2k share u0). Re-key cellSet on the EFFECTIVE u-level: `${level}:${it}:${eUL}:${iu}`. Periodic
  wrap modulus is `2^eUL`, carried per cell. Add a secondary `uByEffective` map (`${eUL}:${it}:${iu}`)
  so u-side neighbour probes find a finer u-neighbour whether it arose from level+1 or uExtra+1.
- **H2 — both-axis 2:1 balance.** A u-split creates hanging nodes on the cell's TWO t-edges, so
  t-neighbours MUST react. Enforce `|eUL(a)−eUL(b)|≤1` across ALL FOUR sides (u AND t), plus the
  existing `|level−level|≤1` on t-sides. Queue-driven fixpoint reusing `balance()`.
- **H3 — registry N-mid transition template.** The single-mid-per-side poly build can't reference
  quarter-points. Port the regH/regV union-of-subdivisions registry from FeatureConformingTriangulator
  into the PLAIN QuadtreeTriangulator: each cell registers its corner u-positions on the grid lines
  its edges touch; each cell builds its CCW boundary from the UNION of neighbour subdivision points
  per edge, then centre-fans (body unchanged — tiles N-mid polygons with positive area). Keep the
  single-mid fast path when no extra points are registered (uExtra=0 → byte-identical).
- **H4 — gate-based no-op + F-included trigger.** Gate the WHOLE pass on the SAME relief-aware
  base-anisotropy criterion `computeUBias` uses (`median(2π·r/√G) > UBIAS_AREF·√2`): at default dims
  the gate is NOT tripped → the pass touches zero cells → structurally inert, regardless of any
  per-cell threshold or budget-search scale. Trigger uses the TRUE F-inclusive 3D-quad aspect.

## Staged TDD plan (gate each stage: `npx vitest run src/renderers/webgpu/parametric/conforming src/fidelity` from potfoundry-web/)
- **Stage 0 — RED guard** (`Gap1DirectionalRefine.test.ts`, NEW). The first failing test (compile-RED,
  references the not-yet-existing `directionalRefine` option + `uExtra` field):
  ```ts
  it('directional refine is a perfect no-op at default dims', () => {
    const s = new SyntheticCylinderSampler(57, 120, 8, 16); const f = field(s);
    const off = new PeriodicBalancedQuadtree(f, s, { maxLevel: 8 });
    const on  = new PeriodicBalancedQuadtree(f, s, { maxLevel: 8, directionalRefine: true });
    expect(on.leaves().every((l) => (l.uExtra ?? 0) === 0)).toBe(true);
    expect(leafKeys(on)).toEqual(leafKeys(off));   // leafKeys from QuadtreeUBias.test.ts
  });
  ```
  Plus a GAP test: build on `SyntheticCylinderSampler(145,40,10,80)` uBias=4, directionalRefine OFF →
  assert a true F-inclusive max cell aspect > 100 (the residual sliver exists).
- **Stage 1 — Cell representation** (PeriodicBalancedQuadtree): add `uExtra` to internal Cell (default 0),
  `effULevel`, 4-tuple cellKey, `uByEffective` map, extend `QuadLeaf`; thread uExtra=0 through ALL
  existing splits → leaf sets byte-identical. Add the `directionalRefine` flag (unused yet). GATE: all
  existing conforming tests green; Stage-0 no-op test now compiles+passes.
- **Stage 2 — Triangulators read integer address** (both triangulators): read `iu/it/uExtra` directly;
  delete every `Math.round(leaf.u0*uSpanOf(level))`; cellSet 4-tuple; `has(eUL,it,iu)` wraps mod 2^eUL;
  sideHasFiner queries effective-u-level (u-side finer = eUL+1 via secondary index; t-side finer =
  level+1). uExtra=0 → byte-identical. GATE: full suite green (pure refactor).
- **Stage 3 — Registry N-mid template** (QuadtreeTriangulator): port regH/regV union-of-subdivisions;
  PASS A register corner u-positions, PASS B read union per edge + centre-fan; keep single-mid fast path.
  NEW test: a hand-built tree where a coarse cell's south edge is subdivided at QUARTER points by 4 finer
  cells → interiorBoundary=0. GATE: full suite green + new N-mid test.
- **Stage 4 — localDirectionalRefine pass** (PeriodicBalancedQuadtree): called after balance() ONLY when
  `directionalRefine`. (1) GATE median(2π·r/√G)≤AREF·√2 → return. (2) per leaf, F-inclusive true aspect;
  if >U_SPLIT_TRIGGER(=20) AND uExtra<MAX_U_EXTRA(=4) AND physW>physH AND !touchesBoundary → u-split.
  (3) both-axis eUL re-balance fixpoint. (4) iterate to fixpoint. Boundary rows NEVER split. GATE:
  Stage-0 GAP test now PASSES (aspect<100, sliverCount=0); no-op test still green; balance + boundary tests.
- **Stage 5 — Watertight+T-junction-free under directional cells** (integration tests): plain triangulator
  on a directional tree → wallEdgeAudit 0/0; FeatureConformingTriangulator + a closed-loop feature on a
  directional tree → 0/0 (cornerSnap stays a SINGLE absolute value, NOT per-cell-uExtra-scaled); seam closed.
- **Stage 6 — Wire into ConformingWall** (final-build-only): `directionalRefine` flag forwarded; searchBudgetScale
  passes FALSE (monotone count preserved), final build passes TRUE. AssemblyWallOptions.directionalRefine
  default true for NON-feature walls, false when outerFeatureLines present. Boundary rows exempt → nRing
  unchanged → both walls' rings still match. GATE: full 211+ suite green; ring-equality holds.
- **Stage 7 — Efficacy + regression + e2e canary**: synthetic Crystalline/ArtDeco/HexHive analogues
  (145,40 + relief) directionalRefine on → sliverCount=0, maxAspect3D<100. Voronoi/Gyroid F-shear analogues
  documented out-of-scope (trigger does NOT fire to MAX_U_EXTRA). GATE: full suite + typecheck 0 + lint 0;
  THEN e2e `_conforming_full_probe.cjs` 20 default styles byte-identical (orient=bnd=nonMan=sliver=0);
  THEN `_shortwide_probe.cjs` Crystalline/ArtDeco sliverCount=0.

## Invariant arguments (summary; full in the design workflow output)
Watertight + T-junction-free: H3 registry makes a wide t-neighbour subdivide its shared edge to every
finer u-cell; H2 bounds the disparity to ≤1 eUL/edge → small exactly-matched mid sets; centre-fan tiles
positive-area. Orientation: orientOutward is 3D-position-welded, cell-structure-independent. 2:1 balance:
generalized to eUL per axis incl. seam (modulus 2^eUL per cell + secondary index). Seam: dyadic u with
power-of-two denominators → u=0/u=1 share quantized keys. Pinned rings: boundary rows NEVER directionally
split → uExtra=0, count 2^(pin+B); both walls match. No-op@default: HARD GATE (same as B=0) + uExtra=0
byte-identical refactor (Stages 1-3 proven green before any directional cell) + pass skipped during budget
search → monotone count → identical scale/leaf-set at default. Stage-0 + Stage-7 e2e canary pin it.

## Risks/mitigations (top)
- T-junction at t-edge (was the FATAL flaw): H2+H3, two dedicated test stages (3 + 5).
- u0-collision (FATAL): H1 explicit integer address, deleted round-trip, byte-identical Stage 2.
- Budget non-monotonicity: pass runs only on final build (Stage 6).
- Tri inflation on ArtDeco (3496 cells): MAX_U_EXTRA=4 cap; U_SPLIT_TRIGGER=20 splits early (1 bit needed).
- CelticKnot braid bnd=6: directional refine DISABLED on feature walls → neither fixes nor worsens it.
