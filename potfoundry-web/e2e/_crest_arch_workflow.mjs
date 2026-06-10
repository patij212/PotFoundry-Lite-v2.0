export const meta = {
  name: 'crest-fix-architecture',
  description: 'Design+adversarial architecture to eliminate diagonal/helical crest slivers (SpiralRidges helix-shear residual + SFB CDT-fill + uBias overshoot) in the conforming mesher, watertight-by-construction',
  phases: [
    { title: 'Explore', detail: 'map the fix surfaces in code (read-only)' },
    { title: 'Design', detail: '3 architects propose full architectures' },
    { title: 'Adversarial', detail: 'skeptics try to refute each architecture' },
    { title: 'Finalize', detail: 'synthesize one staged TDD blueprint' },
  ],
};

const ROOT = 'potfoundry-web/src/renderers/webgpu';
const CONF = `${ROOT}/parametric/conforming`;

// ── Ground-truth MEASURED evidence (agents CANNOT run the GPU — treat as given) ──
const EVIDENCE = `
MEASURED GROUND TRUTH (reference-free 3D min-angle instrument; agents cannot re-run the GPU — treat as FACT):

INSTRUMENT (this session, committed): src/fidelity/metrics.ts \`crestBandTriangleQuality\` (3D min interior angle of OUTER-wall triangles; degenerate=0; band = sampler radius-extrema loci) + windowHook \`diagnoseCrestQuality\`. Reference-FREE (cannot be fooled by a reference, unlike the chord-error \`diagnoseSerration\` that fooled a prior session into a wrong "CAD-grade" claim). Also: \`diagnoseTopoQuality\` (sliver=aspect>100 count, bnd, nonMan, orient, maxAspect3D); \`diagnoseFShear\` (FShearDiagnostics: maxURatio, maxTRatio, irreducibleByAxisFrac, maxSquareAspect, maxRotatedAspect).

CONTROL — SuperformulaBlossom @ sf_strength=0 (plain pot): wall %<15°=0, sliver=0, bnd=nonMan=orient=0, maxAspect=11. Instrument reads ~0 on a clean pot (validated). VISUAL: entirely neutral.

TARGET A — SpiralRidges (DEFAULT params): path = helix-SHEAR WARP (chooseHelixGrid → applyHelixWarp, u_final=φ₀(u)−(turns/k)·t+offset). NO CDT insertion. Feature accounting: 9 helical-crease lines, featDropped=0. Surface FShear is CLEAN: maxURatio=7.95, maxTRatio=1, irreducibleByAxisFrac=0, sqSliver=0, maxSquareAspect=9, maxRotatedAspect=2 → a square (u,t) cell on this surface is at worst aspect 9, so the mesh slivers are a CONSTRUCTION artifact, not surface metric. uBias sweep (window.__pfConformingUBias override; B=round(log2(maxURatio/√3)) auto=2):
  B0: wall%<15=54.9, worst=0°, sliver=1117, maxAspect=7.9M
  B1: 15.1, sliver=1333, nonMan=1
  B2(auto): 2.3, worst=0.01°, sliver=479, maxAspect=14161
  B3: 11.3, sliver=2148, maxAspect=1e9
  → B2 is BEST. The dominant defect is U-LONG anisotropy (maxURatio 7.95) which uBias B2 mostly squares; RESIDUAL = 2.3% sub-15 + 479 EXTREME slivers (aspect 14161, worst 0.01°) uBias ALONE cannot remove. VISUAL: red(<15°) triangles trace the DIAGONAL HELICAL crest lines; bulk is a clean near-equilateral tessellation.

TARGET B — SuperformulaBlossom @ sf_strength=1: path = general-curve CDT INSERTION (extractSuperformulaBlossom → outerFeatureLines → FeatureConformingTriangulator). uBias sweep:
  B0: wall%<15=60.4, sliver=2525, nonMan=2, maxAspect=2.5e9
  B1: 13.9, sliver=244, nonMan=0, maxAspect=174800
  B2: 10.4, worst=1.02°, sliver=0, nonMan=0, maxAspect=50  ← CLEAN topology
  B3(auto): 35.7, sliver=2285, nonMan=3, maxAspect=1e9(degenerate)  ← BROKEN (non-manifold)
  → AUTO uBias picks B=3 which makes SFB@1 NON-MANIFOLD + 2285 slivers + degenerate. B=2 is topology-clean with a 10.4% crest sub-15 residual. So: (i) the auto uBias formula OVERSHOOTS at the high end (maxURatio~11.8→B3) and (ii) the uBias×CDT-insertion path is NON-WATERTIGHT at B3 — a real bug — and (iii) even at the best B2, the CDT fill leaves 10.4% crest slivers (triangulateConstrainedCell inserts ZERO interior Steiner points).
`;

const CODE_MAP = `
KEY CODE (verify with Read/Grep; cite file:line in findings):
- Conforming routing: ${ROOT}/ParametricExportComputer.ts ~:2240-2490. Per style: helical-crease→chooseHelixGrid→applyHelixWarp(:2466-2481); vertical/horizontal creases→applyUWarp/applyTWarp; general-curve→outerFeatureLines (CDT); buildCreaseRefineLines→outerCreaseLines (refine-only, no CDT). uBias auto via computeUBias.
- uBias: ${CONF}/WatertightAssembly.ts computeUBias(:110-152) GATE A (wide/flat dims; deferred to B=0 with features) + GATE B (default dims; B=round(log2(maxURatio/√3)) clamp[0,MAX_RELIEF_B]; FIRES WITH features). assembleWatertight(:340+) passes uBias to buildConformingWall (Δu=1/2^(level+B), Δt=1/2^level). Override: window.__pfConformingUBias.
- FeatureConformingTriangulator.ts (${CONF}): per-cell CDT (triangulateConstrainedCell) on feature cells; grid-line vertex registry regH/regV = watertight+T-junction-free BY CONSTRUCTION (a shared-edge point is computed identically by both neighbours → bit-identical → deduped). PASS A classifies+registers boundary points; PASS B triangulates reading the registry UNION. cornerSnap caps needles. uBias-aware (eUL=level+uBias+uExtra). NO repair passes.
- ConstrainedCellTriangulator.ts: triangulateConstrainedCell = local cdt2d, ZERO interior Steiner (only winding flips) → leaves anisotropic needles in feature cells.
- CellQualityRefinement.ts: refineCellInterior — BUILT + UNIT-TESTED but NOT WIRED into the build path (only its own test + featureQualityHarness.test reference it). Bounded Ruppert/Chew: inserts off-center (Üngör) circumcenters computed IN THE 3D SURFACE METRIC (via a (u,t)→3D sampler closure), mapped back to (u,t), STRICTLY cell-interior (rejects any candidate within ON_EDGE_EPS of a side) → never mutates the registry-shared boundary → WATERTIGHT-SAFE. THETA_MIN=20, MAX_STEINER_PER_CELL=32. LIMITATION: interior-only — a sliver whose worst (short) edge lies ON a cell boundary cannot be fixed by interior insertion; those need a PASS A2 edge densifier (interior-INDEPENDENT, edge-local, registry-mirrored) = NOT YET BUILT.
- CreaseHelixWarp.ts: u_final=φ₀(u)−shearRate·t+offset; φ₀ usually identity for SpiralRidges (shear-only); topology-preserving (monotone per row). Applied post-triangulation to vertex u; skews axis-aligned cells into parallelograms.
- PeriodicBalancedQuadtree.ts (41KB): periodic 2:1-balanced quadtree; global uBias B; per-leaf directional uExtra (built, default OFF — both-axis 2:1 balance cascade can explode; designed for u-long not F-shear).
- MetricSizingField.ts / SurfaceMetricTensor.ts: curvature/anisotropy sizing (E,F,G). SuperformulaCurvature.ts: analytic angular curvature (committed, reusable signal).
`;

const CONSTRAINTS = `
HARD CONSTRAINTS (non-negotiable — the whole architecture exists for them):
1. WATERTIGHT + T-JUNCTION-FREE BY CONSTRUCTION via the grid-line registry. NO repair/weld/T-junction-patch passes (that battery is what the conforming mesher replaced). Any NEW shared-edge vertex MUST be interior-INDEPENDENT + edge-local so BOTH neighbours derive a bit-identical point (see buildCreaseRefineLines + the regH/regV registry). Cell-INTERIOR points (refineCellInterior, planarization Steiner) need no mirroring and are safe.
2. MUST NOT regress the 17 currently-clean styles (sliver=bnd=nonMan=orient=0 at default dims) nor break the 312+ conforming+fidelity unit tests (incl. the two-cell watertight conformance proof in FeatureConformingTriangulator.test.ts).
3. The fix is gated by: crestBandTriangleQuality (band + wall %<15° → ~0), diagnoseTopoQuality (sliver=bnd=nonMan=orient=0, no degenerate/aspect-1e9), featDrop=0, the VISUAL red-gone render, and the full 20-style matrix (unchanged-or-better). Plus vitest + typecheck + scoped eslint. TDD with SyntheticCylinderSampler.
4. Perf: feature-dense builds are 60-236s at high fidelity; do not make them dramatically worse.
5. Conforming mesher is FLAG-GATED (window.__pfConforming / overrides.conformingMesher), not production default — internal changes are safe to iterate.

DESIGN QUESTION: an architecture that drives the crest sub-15° fraction → ~0 AND sliver/nonMan/degenerate → 0 for BOTH SpiralRidges (helix-shear u-long residual after uBias B2 — 2.3% + 479 extreme slivers) AND SuperformulaBlossom@1 (CDT-fill 10.4% at B2 + the uBias-overshoot-to-B3 non-watertight bug), watertight-by-construction, no 17-clean-style regression. Levers to weigh: (a) WIRE refineCellInterior into feature cells (SFB) + BUILD the PASS A2 edge densifier for on-boundary slivers; (b) fix/cap the auto-uBias so B3 never breaks insertion (and decouple "best B for quality" from "B that breaks watertight"); (c) for SpiralRidges, address the helix-shear residual the axis-aligned uBias cannot square (anti-shear/crest-aligned cells, OR extend interior quality refinement to PLAIN/sheared cells, OR a sheared sizing metric); (d) north star: metric-aligned (sheared/rotated) cells.
`;

phase('Explore');
const EXPLORE_TASKS = [
  { key: 'helix-ubias-quadtree', focus: `the SpiralRidges HELIX-SHEAR + uBias + PeriodicBalancedQuadtree path. Map: how applyHelixWarp interacts with the axis-aligned quadtree cells; where the 479 extreme slivers (aspect 14161) most plausibly originate at uBias B2 (transition cells? cap rotation at ${ROOT}/ParametricExportComputer.ts:2466-2481? crease-refine rows? the shear of a square cell?); whether the quadtree can build sheared/anti-shear cells; what the directional uExtra machinery does and why it's disabled. Cite file:line.` },
  { key: 'cdt-fill-registry-refine', focus: `the SFB@1 CDT-INSERTION path + the watertight registry + the DORMANT refineCellInterior. Map EXACTLY: the watertight-by-construction registry contract in FeatureConformingTriangulator.ts (what makes a shared-edge vertex safe); where/how to WIRE refineCellInterior into the feature-cell loop (PASS B, after triangulateConstrainedCell, with a (u,t)→3D sampler closure) WITHOUT touching the registry boundary; what fraction of SFB crest slivers have their worst edge ON a cell boundary (un-fixable by interior insertion → need PASS A2); and a concrete design for the PASS A2 edge densifier (interior-independent, edge-local, registry-mirrored). Cite file:line.` },
  { key: 'ubias-calibration', focus: `the uBias auto-calibration across all 20 styles. Map computeUBias GATE A/B (WatertightAssembly.ts:110-152), MAX_RELIEF_B, and the per-style maxURatio→B that the CURRENT formula picks; WHY B=3 breaks the SFB@1 CDT-insertion path into non-manifold/degenerate (the uBias-aware code paths in FeatureConformingTriangulator + the quadtree at high eUL); whether B can be DECOUPLED (e.g. a quality-B for the bulk vs a capped-B where features are inserted) without regressing the 15 styles GATE B currently helps. Identify the unit tests that pin uBias behavior (ComputeUBias.test, CreaseUBiasInvariance.test, QuadtreeUBias.test). Cite file:line.` },
  { key: 'instrument-and-gates', focus: `the test + gate surface. Map: the existing conforming+fidelity unit tests that any fix must keep green (FeatureConformingTriangulator.test two-cell conformance proof, ConformingWall/ConformingOuterWall, CellQualityRefinement.test, the serration/crestQuality fidelity guards); the SyntheticCylinderSampler / HelicalCrestSampler TDD fixtures; how the e2e probes measure (diagnoseCrestQuality/diagnoseTopoQuality/diagnoseFeatures). Propose the EXACT TDD guard tests a crest fix needs (synthetic two-cell watertight proof under interior refinement; a synthetic that reproduces an aspect-100 feature-cell sliver and proves refineCellInterior raises its min-angle). Cite file:line.` },
];
const maps = await parallel(EXPLORE_TASKS.map((tk) => () =>
  agent(
    `You are a code explorer for the PotFoundry conforming mesher (TypeScript). Read the ACTUAL code (Read/Grep/Glob) under potfoundry-web/. Do NOT run anything.\n\nFOCUS: ${tk.focus}\n\n${EVIDENCE}\n${CODE_MAP}\n${CONSTRAINTS}\n\nReturn a precise, code-grounded map for your focus area: verified mechanisms (with file:line), the exact extension/wiring points, watertight invariants that constrain the fix, concrete risks, and any correction to the EVIDENCE/CODE_MAP you find. Be specific and terse.`,
    { label: `explore:${tk.key}`, phase: 'Explore', agentType: 'feature-dev:code-explorer',
      schema: { type: 'object', additionalProperties: false, required: ['area', 'findings', 'extensionPoints', 'watertightInvariants', 'risks'], properties: {
        area: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' }, description: 'verified mechanisms with file:line' },
        extensionPoints: { type: 'array', items: { type: 'string' }, description: 'exact places to wire/extend, file:line' },
        watertightInvariants: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        corrections: { type: 'array', items: { type: 'string' }, description: 'corrections to the provided evidence/code-map' },
      } } },
  ).then((r) => ({ key: tk.key, map: r })),
));
const mapDigest = maps.filter(Boolean).map((m) => `### EXPLORER MAP: ${m.key}\n${JSON.stringify(m.map, null, 1)}`).join('\n\n');

phase('Design');
const ANGLES = [
  { key: 'surgical', stance: `MINIMAL/SURGICAL, reuse-first. Prefer: WIRE the already-built refineCellInterior into feature cells; FIX/CAP the auto-uBias so it never overshoots into the non-watertight B3 regime (decouple quality-B from watertight-B); for SpiralRidges, the cheapest lever that removes the 479 extreme slivers + 2.3% residual (e.g. extend interior quality refinement to plain sheared cells near the crest, or a capped/relief-aware B). Smallest watertight-safe change set that moves the measured gate.` },
  { key: 'crest-aligned', stance: `CREST-ALIGNED ANISOTROPY. Build triangulation that is FINE perpendicular to the crest and COARSE along it. For SpiralRidges the crest is a constant-slope helix (a uniform shear) → anti-shear/sheared cells aligned to the helix (cells that become near-square AFTER applyHelixWarp). For SFB the crest is a morphing curve → a crest-local ribbon/ladder of perpendicular rungs along the inserted polyline, transitioning to the background grid via the registry. Watertight-by-construction via the registry.` },
  { key: 'metric-aligned', stance: `PRINCIPLED METRIC-ALIGNED (rotated) CELLS — the north star. Drive cell shape/orientation by the local first+second fundamental form (E,F,G + principal curvature direction) so cells are 3D-near-equilateral and aligned to principal curvature near the crest, generalizing uBias (diagonal anisotropy) to full 2x2 metric anisotropy including the off-diagonal F (shear). Define how this stays watertight + T-junction-free with the registry, and a staged path that does NOT require a full mesher rewrite.` },
];
const designs = await parallel(ANGLES.map((a) => () =>
  agent(
    `You are a mesh-architecture designer for the PotFoundry conforming mesher (by-construction watertight, periodic 2:1 quadtree + grid-line registry + local CDT). Propose ONE complete architecture from THIS stance:\n\nSTANCE: ${a.stance}\n\n${EVIDENCE}\n${CODE_MAP}\n${CONSTRAINTS}\n\nEXPLORER MAPS (code-grounded):\n${mapDigest}\n\nYou MAY Read code to verify. Produce a concrete, staged, TDD-able architecture that covers BOTH SpiralRidges and SFB@1, argues watertight-by-construction explicitly, states how it avoids regressing the 17 clean styles, and names the MEASURED gate per stage (the reference-free crestBandTriangleQuality + topology + featDrop + visual). Be specific about files/functions to add/modify.`,
    { label: `design:${a.key}`, phase: 'Design', agentType: 'feature-dev:code-architect',
      schema: { type: 'object', additionalProperties: false, required: ['name', 'oneLine', 'spiralApproach', 'sfbApproach', 'watertightArgument', 'regressionSafety', 'stages', 'measuredGates', 'risks', 'confidence'], properties: {
        name: { type: 'string' },
        oneLine: { type: 'string' },
        spiralApproach: { type: 'string', description: 'how it eliminates SpiralRidges helix-shear residual (2.3% + 479 slivers)' },
        sfbApproach: { type: 'string', description: 'how it eliminates SFB@1 CDT-fill slivers + the uBias-overshoot bug' },
        watertightArgument: { type: 'string', description: 'why it stays watertight + T-junction-free BY CONSTRUCTION' },
        regressionSafety: { type: 'string', description: 'why the 17 clean styles + 312 tests are safe' },
        stages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'change', 'tddGuard', 'gate'], properties: { title: { type: 'string' }, change: { type: 'string' }, tddGuard: { type: 'string' }, gate: { type: 'string' } } } },
        measuredGates: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      } } },
  ).then((r) => ({ key: a.key, design: r })),
));

phase('Adversarial');
const vetted = await parallel(designs.filter(Boolean).map((d) => () =>
  parallel([0, 1].map((lens) => () =>
    agent(
      `You are an adversarial reviewer. Try HARD to REFUTE this conforming-mesher crest-fix architecture. Default to skepticism; a hole you cannot rule out is a hole. ${lens === 0 ? 'LENS: WATERTIGHTNESS + T-junctions — find any way a new vertex/edge breaks the bit-identical shared-edge registry contract, leaves a T-junction, or needs a forbidden repair pass.' : 'LENS: REGRESSION + the uBias×insertion interaction + perf — find any way this regresses one of the 17 clean styles, breaks a pinned unit test, re-introduces the B3 non-manifold/degenerate failure, or explodes build time / a refinement cascade.'}\n\n${EVIDENCE}\n${CONSTRAINTS}\n\nARCHITECTURE:\n${JSON.stringify(d.design, null, 1)}\n\nYou MAY Read code to ground your refutation. List concrete, code-grounded holes; mark each FATAL (sinks the approach) or FIXABLE (with the patch).`,
      { label: `refute:${d.key}:${lens === 0 ? 'watertight' : 'regression'}`, phase: 'Adversarial',
        schema: { type: 'object', additionalProperties: false, required: ['lens', 'verdict', 'holes'], properties: {
          lens: { type: 'string' },
          verdict: { type: 'string', enum: ['sound', 'fixable', 'fatal'] },
          holes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'hole', 'patch'], properties: { severity: { type: 'string', enum: ['fatal', 'fixable'] }, hole: { type: 'string' }, patch: { type: 'string' } } } },
        } } },
    ),
  )).then((reviews) => ({ key: d.key, design: d.design, reviews: reviews.filter(Boolean) })),
));

phase('Finalize');
const finalInput = vetted.filter(Boolean).map((v) =>
  `## DESIGN ${v.key}\n${JSON.stringify(v.design, null, 1)}\n### ADVERSARIAL REVIEWS\n${JSON.stringify(v.reviews, null, 1)}`,
).join('\n\n');
const blueprint = await agent(
  `You are the finalizer. Synthesize ONE staged, TDD, watertight-by-construction implementation blueprint for the PotFoundry conforming-mesher crest fix, choosing the best ideas from the designs and PATCHING every fatal/fixable hole the adversarial reviews surfaced. The blueprint must cover BOTH SpiralRidges (helix-shear u-long residual: 2.3% + 479 slivers after uBias B2) AND SuperformulaBlossom@1 (CDT-fill 10.4% at B2 + the auto-uBias-overshoots-to-B3 non-watertight bug). It must be measurement-first: each stage names the EXACT measured gate (reference-free crestBandTriangleQuality band/wall %<15° → ~0, topology sliver=bnd=nonMan=orient=0 with no degenerate, featDrop=0, the visual red-gone render) and a failing TDD guard FIRST. Order stages by VALUE-PER-RISK (cheapest measurable wins first; e.g. wiring refineCellInterior + fixing the uBias overshoot likely precede any new cell-shape machinery). Be explicit about files/functions, the watertight argument for every new shared-edge vertex, and which stages are independent.\n\n${EVIDENCE}\n${CODE_MAP}\n${CONSTRAINTS}\n\nEXPLORER MAPS:\n${mapDigest}\n\nDESIGNS + ADVERSARIAL REVIEWS:\n${finalInput}\n\nReturn the blueprint as clear markdown: (1) a 1-paragraph chosen-architecture summary; (2) an ordered stage list, each with: goal, files/functions, the failing TDD guard to write first, the watertight argument, the measured gate, and whether it's independent/parallelizable; (3) the precise measured DONE criteria; (4) open risks to watch.`,
  { label: 'finalize:blueprint', phase: 'Finalize' },
);

return { blueprint, designKeys: designs.filter(Boolean).map((d) => d.key), vetted: vetted.filter(Boolean).map((v) => ({ key: v.key, verdicts: v.reviews.map((r) => r.verdict) })) };
