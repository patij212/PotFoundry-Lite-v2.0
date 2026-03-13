# PotFoundry Distilled Agent Context

> **This is institutional memory distilled from ~11,200 lines of archived agent journals.**
> It captures every hard-won lesson, critical bug pattern, architectural decision with rationale,
> and engineering constant so that no future agent repeats past mistakes.

Last updated: 2026-03-11
Source: `archive/agent-journals/agents_journal_2026-03-09-pre-distill.md` (root, ~5400 lines)
        `archive/agent-journals/potfoundry-web_agents_journal_2026-03-09-pre-distill.md` (web, ~5800 lines)

---

## 1. Canonical Scope & Startup Protocol

- **Active product**: `potfoundry-web/` (TypeScript/React/WebGPU SPA on Cloudflare Pages)
- **Reference only**: `potfoundry/` (Python) — mathematical ground truth, deprecated for active work
- **North star**: Watertight STL/3MF meshes with faithful feature tracking (ridges/valleys) for 3D printing

**Agent startup order** (token-efficient):
1. This file (you're reading it)
2. `TODO.md` + `ROADMAP.md` for current priorities
3. Archived plan docs in `archive/plans/` for deep-dive on specific topics (see `archive/plans/INDEX.md`)
4. Last 3-5 entries of `agents_journal.md` only if you need chronological/emotional context

---

## 2. Architecture — Facts That Must Not Drift

### 2.1 Data Flows
- **Preview**: `UI` → `Zustand` → `GPU UniformBuffer` → `WGSL Compute Shader` → `Screen`
- **Export**: `UI` → `Worker Thread` → `ParametricExportComputer.ts` → `Binary STL` → `Disk`
- Preview renders the continuous mathematical surface; export is a discrete triangulated mesh — they will never match exactly

### 2.2 Key Invariants
- `potfoundry-web/src/styles/registry.ts` is the single source of truth for style IDs and params
- **Style IDs are permanent** — serialized into localStorage and GPU buffers; never renumber; use ID ≥ 20 for new styles
- **Supabase client can be null** — always call `isSupabaseConfigured()` before any `supabase.*` call
- **WGSL `vec3<f32>` needs 16-byte alignment** — missing padding causes silent data corruption in export pipeline
- **Frontend env vars need `VITE_` prefix**; deployment uses Anon key not Service key
- **ConsolePatch intercepts all `console.*`** — installed in `main.tsx` before React mounts
- **ESLint 0 max-warnings** — any warning fails CI; fix before committing

### 2.3 Key Directories
```
potfoundry-web/src/
  renderers/webgpu/          # WebGPU renderer + WGSL shaders
    parametric/              # Parametric export pipeline (current best path)
      ParametricExportComputer.ts  # Core pipeline (~3000-5000 lines, THE critical file)
      OuterWallTessellator.ts      # Outer wall mesh: chain strips, companions, CDT
      ChainStripTriangulator.ts    # CDT-based chain strip triangulation
      ChainLinker.ts               # Feature chain linking, smoothing, DP optimization
      GridBuilder.ts               # CDF-adaptive grid generation
      MeshSubdivision.ts           # Edge subdivision + quality improvement
      MeshValidator.ts             # Export mesh validation diagnostics
      FeatureEdgeGraph.ts          # Chain edge graph construction
      EdgeCollapser.ts             # QEM edge collapse for mesh simplification
  state/                     # Zustand slices (geometry, style, mesh, ui, appearance)
  services/supabase.ts       # Supabase client (may be null)
  services/stripe.ts         # Price IDs + tier feature config
  styles/registry.ts         # Style ID + param registry (PERMANENT IDs)
  ui/                        # React components (v1 + v2 layout system)
  utils/geometry/            # CDT triangulation, mesh stitching, chain constraints
```

---

## 3. Parametric Export Pipeline — Complete Technical Reference

### 3.1 Pipeline Steps (v16.31+ Current Architecture)
```
Step 1:   Curvature sampling (per-row probe, 8192 samples per row)
Step 2:   Feature detection v16.0 (verified classification, peaks + valleys)
Step 3:   linkFeatureChainsByKind (non-crossing DP, kind-separated)
Step 3.5: GPU re-snap (32 candidates × parabolic refinement per chain point)
Step 3.6: smoothChainPath (WH λ=50, 2-pass) → filterLowConfidenceChains
Step 4:   insertChainGuidedRows (row insertion at chain boundaries)
Step 5:   CDF-adaptive grid (curvature-driven column density, CAG architecture)
Step 6:   Per-row GPU probing → vertex positions
Step 7:   Grid mesh + OuterWallTessellator (chain strips, companions, CDT)
Step 7.5: Edge flips (chain-directed → 3D quality flip, up to 5 passes)
Step 8:   GPU evaluation → final 3D positions
Step 9:   MeshValidator → Binary STL export
```

### 3.2 Feature Detection (v16.0 — Verified Detection Rewrite)

**Algorithm evolution**: Newton-Raphson → GSS → parabolic refinement → v16.0 verified detection

**v16.0 architecture**:
- Classified peaks and valleys with confidence scoring (40% gradient + 30% curvature + 30% prominence)
- **Strategy 3 (inflection points) REMOVED ENTIRELY** — was the main source of noise. Every d² sign change flagged as feature on flat geometry
- 5-point stencil refinement for sub-sample accuracy
- Column-direction probing (T-direction features, v15.0) — reuses existing rowProbeData, zero additional GPU calls

**Critical detection bugs (all fixed, never reintroduce)**:
- Catmull-Rom evaluation OVERSHOOTS at sharp cusps (Gibbs-like phantom peaks) — removed in v13.0
- Smoothing destroys accuracy: MAX_SMOOTH_DELTA=0.002 was 32× larger than detection precision ±0.00006
- Strategy 2 was refining wrong signal (curvature vs radius)
- Re-snap window 61× too narrow: RESNAP_HALFWIDTH=0.000244 vs RIDGE_DIAG_HW=0.015 (R49)
- Re-snap `isMax` bug: used probe-data heuristic instead of chain `kind` field (R50-B)
- Row-only probing blind to horizontal features → column probing added (v15.0)
- Monotonicity check was INVERTED for valleys vs ridges

### 3.3 Chain Linking — Non-Crossing DP (v16.3+)

**Architecture**: Non-crossing bipartite matching via O(K×M) dynamic programming

**Why DP replaced greedy**: Greedy sorted-scan is order-dependent → same-kind features < 0.0002 apart produce numerically tied scores → arbitrary tie-breaking → zigzag chains. No scoring formula can disambiguate. Only topology (non-crossing constraint) can.

**Key design decisions**:
- **Kind-separated linking** (v16.3): peaks and valleys linked independently — mixing causes 258 valleys orphaned from 780 features
- **Circular linearization**: find largest gap in chain U positions, cut there, shift to linear space
- **MATCH_BONUS=1.0**: safe because max score ≈ 0.05, giving 20× margin
- **Momentum velocity**: signed median of last 3-5 deltas (not 2-point), individually seam-unwrapped, sorted by signed value — prevents single-point corruption from poisoning predictions
- `predictedU` always used as match center (was previously gated behind `missCount > 0`)

**Linking bug taxonomy**:
- Greedy tie-breaking → zigzag (FIXED: DP)
- `repairChainsZigzags` usedFeatures set creates DEADLOCK: symmetric swap (C1 holds C2's feature and vice versa) → mutual blocking → 0 repairs (FIXED: removed usedFeatures)
- Kind-unaware repair: peak chains snagging valley features (FIXED: kind-filtered features)
- `resnapChainToMeasuredPeaks` was a NO-OP — chain linker already stores exact peak positions. Removed as dead code
- Chain U-wrapping at seam: chains spanning U≈0 and U≈1 cause CDT confusion → `SEAM_NEAR_THRESHOLD=0.002` guard (R28)
- Twist-induced drift (`spinTurns × Δt/row`) is SIGNAL not noise — `maxConsecDelta=0.008` is expected mathematical feature trajectory variance, not detection jitter

**Constants**:
- `CHAIN_LINK_RADIUS`: **0.02** (NOT 0.04 as in stale docs)
- `MAX_MISS_COUNT`: 6 (gap bridging tolerance)
- `FEATURE_CLUSTER_RADIUS`: 0.002
- `ACCEL_PENALTY_WEIGHT`: 0.3

### 3.4 Chain Smoothing — Whittaker-Henderson (WH)

**Why WH replaced Savitzky-Golay**: SG has negative sidelobes (period-4 phase inversion, -0.1145 at Nyquist), causing compound error in 2-pass. WH has clean monotonic lowpass transfer function with zero sidelobes.

**Current config**: WH λ=50, single pass (was 2-pass SG with halfWidth=8)
- Post-smooth maxConsecDelta: ~0.003 (from 0.009 pre-smooth)
- Mirror extension at boundaries (preserves curvature, no boundary/interior code split)
- Adaptive halfWidth for short chains: `Math.min(halfWidth, Math.floor((n-1)/2))`
- Min chain length for smoothing: 3 points

**The smoothing data flow (critical for understanding pipeline)**:
- `chains` = WH-smoothed → diagnostic metrics ONLY
- `meshChains` = pre-smooth, filtered → ALL mesh construction
- `preSmoothChains` = pre-smooth, unfiltered → debug visualization
- This split was the fix for Round 14's "mesh uses wrong positions" bug: WH displaces chain U up to ~0.006 U (1.5mm on 40mm pot) from true GPU re-snapped peak/valley positions

### 3.5 Grid Construction — Curvature-Adaptive Grid (CAG)

**Architecture** (replaced the old union feature grid):
1. Compute per-row curvature from `rowProbeData` using `computeRawCurvature`
2. MAX envelope across all rows → single curvature profile
3. Feed to `generateCDFAdaptivePositions` → curvature-adaptive columns
4. Chain vertices remain CDT free points, chain edges remain CDT constraints

**What was removed (DO NOT REINTRODUCE)**:
- `buildUnionFeatureGrid` (~230 lines) — union grid artifacts
- `insertGradedTransitionVertices` (~200 lines) — transition rings eliminated
- UV-snapping loop (~50 lines) — chain vertices are CDT free points now
- `FLANK_OFFSETS`, `FEATURE_CLUSTER_RADIUS` (union grid constants)
- `localOnlyMode` UI toggle and config plumbing
- CDF-adaptive spacing (v16.10) — created visible density bands
- Stitch fan triangulation (v16.9) — legacy scaffolding

**Key bug**: Budget cap killed ALL feature columns: base grid (738) > budget (470) → 0 feature columns survived (v16.2). Budget caps should sacrifice LUXURY columns (flanking companions), never CORE feature columns.

**CAG hotfix**: `featureBudgetTriangles` from old union grid inflated budget to 64,680 columns (designed for union grid feature column injection). CDF-adaptive grids don't need it → use `targetOuterBudget` directly.

**Dead zone removal**: `applyChainDeadZones` removed entirely — each chain (~243 points) drifts ~0.094 in U across 313 rows; dead zone radius 0.0005 > point spacing → zones tile entire chain U-range → 95.7% of CDF columns randomly killed.

### 3.6 Outer Wall Tessellation (OuterWallTessellator)

**D-Radical Chain Vertex Promotion** (R18):
Chain vertices promoted from CDT boundary to interior with T-perturbation (ε = `PROMO_EPSILON` × tGap). Boundary becomes pure-grid → zero R2-boundary violations. Manifold auto-guaranteed because pure-grid boundaries produce identical edge decompositions.

Non-manifold fix: chain vertex at rowIdx=r appears in both band r-1 (topRow) and band r (botRow). Both bands promote to interior using SAME global index → 4 triangles per edge → non-manifold. Fix: topRow promotions use DUPLICATE vertex indices via `topDupMap`/`topDupReverse`.

**PROMO_EPSILON 3D/UV consistency** (R23): Must store `promotedT` in the vertex buffer (not just use it in CDT). CDT places vertex at promotedT, but vertex buffer has tRow → zero-height slivers. All consumers verified safe: buildMergedRow, rescue code, Batch6 dedup, getUV, GPU snap (disabled for outer wall).

**T-Ladder Companion Cloud** (R5-R6):
The companion system provides T-density between row boundaries near chain features. Each chain vertex gets rungs at `tFrac = k/(nTLevels+1)` with center + U-spread companions.
- **NO center companion** — causes collinearity with constraint edges (R6 root cause)
- `MIN_LATERAL_CLEARANCE=0.002`, `CONSTRAINT_GUARD_RADIUS=0.001`
- `MAX_COMPANIONS_PER_CV=20`, per-CV cap
- Companion pointIdx < 0 → skip in companion loop (don't generate companions for companions)

**U-Graded Fan** (R19-R20):
Concentric shells radiating from chain vertices toward strip boundaries. 4 shells at `SHELL_FRACTIONS=[0.20, 0.45, 0.72, 1.0]` with decreasing T-density per shell.
- Budget priority: T-ring emitted FIRST (Verifier C1 fix), then shells
- `MAX_TRING_PER_BAND=12`, `MAX_FAN_PER_BAND=40`
- Anisotropic constraint guard: `CONSTRAINT_GUARD_RELAXED=0.0002` for mid-edge projections
- ExportDialog defaults: density=8, expansion=4 (was d4/e1 — the single highest-impact bugfix of R20)

**Shadow Boundary Enrichment** (R21):
Projects chain vertex U-positions onto strip boundaries at adjacent rows so CDT connects chain→shadow vertically instead of chain→grid diagonally.
- Self-row shadow projection REMOVED (C2 fix) — prevents chain→shadow coincidence destroying D-Radical promotion
- Shadow columns marked in `colHasChain` (C1 fix) — prevents T-junctions

**CatRom Subdivision**: REMOVED (R15). Uniform Catmull-Rom at inflection points creates zigzag constraint paths. Piecewise-linear chain edges are sufficient at 264-row resolution. `subdivideFullChain` marked `@deprecated`.

**Crossing Constraint Filter** (R7.1):
Before calling `triangulateChainStrip`, tests all O(n²) constraint pairs for intersection. When two cross, removes the lower-confidence edge (confidence = detected endpoints bonus + UV length tiebreaker). CDT enforcement rate: 100% after filter (was undefined before).

**R52 Precision Guarantee — Chain/Grid Vertex Separation** (LOCKED):
Three independent mechanisms previously merged chain vertices to nearby grid positions, destroying sub-sample detection precision (parabolic refinement, ±0.00006 U). All three are now disabled/guarded:

1. **`batch2Remap` (DISABLED)**: Was `MERGE_THRESHOLD=1e-4` — chain vertices within 0.0001 U of a grid column were REPLACED by grid vertices. The CDF-adaptive grid deliberately clusters columns near features, maximizing merge frequency. Now returns an empty map.
2. **`Batch 6 dedup` (GUARDED)**: Post-triangulation dedup quantized to 1e-5 grid and "preferred grid over chain." Now skips all cross-type merging (`vIsChain !== existIsChain` guard). Only same-type dedup (grid↔grid or chain↔chain) preserved.
3. **`upsertPhantomRowVertex` + `bestV` (R37 GUARDED)**: Phantom vertex creation merged chain crossing anchors with column boundary vertices at `R37_U_MERGE=1e-4`. Now uses `phantomChainAnchorSet` to track vertex types; chain anchors never merge with column boundaries. Edge-splitting `bestV` lookup searches only chain anchors.

**Invariant**: Chain vertices and grid vertices NEVER merge, average, snap, or move toward each other. Both exist at their exact positions. Extra triangulation from near-coincident vertices is acceptable. "No averaging, no estimation, no close enough."

**Module**: Chain vertex collection extracted to `ChainVertexBuilder.ts`. All four critical sections in `OuterWallTessellator.ts` marked with `🔒 R52 PRECISION LOCK` comment blocks.

### 3.7 Edge Flip Systems

Three-phase approach:
1. **Chain-directed flip**: Forces diagonals to follow chain direction, locks ridge quads
2. **3D quality flip** (`flipEdges3D`): Max-min angle + dihedral criterion, multi-pass (up to 5)
3. **Chain-strip phases A/B/C**: angle+valence, valence-only, short-diagonal within chain-strip tris

**Key lessons**:
- `CHAIN_LOCK_BAND_HALF_WIDTH`: went 1→0→recommendation back to 1. Root cause of diagonal crease: boundary ownership gap between chain-strip and grid-managed regions
- Normal-inversion guard: rejects flips creating inward-facing triangles (v10.7)
- "If you're flipping 78% of quads and it still looks bad, the issue isn't which diagonal — it's that NEITHER diagonal may be right"

### 3.8 Mesh Quality & Edge Collapse

**EdgeCollapser** (Phase 6): QEM quadrics as Float64Array (10 floats per vertex), half-edge collapse only, MinHeap with lazy deletion. 5 validity checks: feature edge protection, feature vertex protection, seam safety, link condition, inversion prevention.

**MeshValidator diagnostic metrics**:
- `inconsistentPairs` = REAL metric (adjacent faces with opposing normals)
- `invertedTriangles` = FALSE ALARM for closed solids — inner wall faces inward → correctly flagged as "inverted" relative to outward-dominant average. The code itself says "informational only... false positive"
- 6 rounds (R7-R12) chased the 207K "inverted triangles" metric before realizing it includes inner wall. **Never chase a metric without understanding what it measures.**

---

## 4. Bug Taxonomy — Critical Cross-Cutting Bugs Discovered

These bugs cost hours to days of debugging. Know them so you don't reintroduce them.

### 4.1 GPU/CPU Interface Bugs
| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **Stride-of-Death** | GPU expected `array<vec4<u32>>` (stride 16) but CPU sent stride 12 | GPU read triangle indices as surface IDs → shattered mesh |
| **WGSL alignment** | `vec3<f32>` without 16-byte padding | Silent data corruption in export pipeline |
| **buildStyleParamPayload reversed** | `(styleOpts, params.styleId)` when signature was `(styleName, opts)` | Wrong style rendered |

### 4.2 Data Flow / Identity Bugs
| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **Feature type dropped** | `extractChains` mapped points without `type: f.type` | Ridges and valleys chaining together → valley zigzag |
| **Steiner Points bypass addPoint** | CDT library inserts geometric points that bypass vertex snapping | Seam vertices near but not ON boundary |
| **buildMergedRow mutates batch2Remap closure** | Not side-effect free | Unpredictable vertex indexing |
| **CDT constraint ordering** | Interior vertices (CatRom) added to `globalToLocal` AFTER constraint edges processed | Chain-strip constraints: total=0 |
| **R28 centroid bounds NaN** | `tBoundsMax` formula referenced undefined `scale` variable | Export hung indefinitely |

### 4.3 Threshold / Configuration Bugs
| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **Snap threshold > Buffer offset** | Snap radius (0.0005) encompassed buffer offset (0.00025) | 875K degenerate triangles |
| **"EXPLOSION TEST" debug values** | `dt = 0.005` left in production, never reverted | Wrong export |
| **refineTriangleQuality disabled** | Internal loop hardcoded `it < 0` | Quality improvement never ran |
| **PATCH_ACCEPTANCE gate 85%** | Rejected chain points too far from grid columns | Staircase artifacts (v14.0) |
| **Budget cap overflow** | `featureBudgetTriangles=40M` designed for union grid applied to CDF grid | 64,680 columns instead of 558 |
| **ExportDialog defaults override** | UI had d4/e1, backend had d8/e4 | All R19+R20 companion work neutered |

### 4.4 Topology / Geometry Bugs
| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **UV vs Physical Space confusion** | `stitchSeam` used `1.0` (UV) instead of `aspectRatio` (Physical) | Bad seam welding |
| **generateGrid periodicity** | Grid generated w+1 columns (u=[0,1] inclusive) | Unsealed vertices |
| **Seam-crossing chain edges** | Wrap-correction at OWT L535 collapsed raw 0.991 delta to 0.009 | Full-domain CDT constraint → horizontal ring artifacts |
| **sweepQuad diagonal alternation** | Line 231 alternates diagonal direction when chain U oscillates | ROOT CAUSE of 39 rounds of tessellation failure |
| **Bridge patches off-ridge** | Midpoint U maps to position between peaks (in valley) | v16.11 → reverted v16.12 |

### 4.5 Debug / Visualization Bugs
| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **Debug dots ≠ lines** | Green dots = raw detection, magenta lines = post-smooth chains | Lines can't pass through dots — WH smoothing displaces them |
| **Horizontal debug lines** | Seam-crossing segment u=0.98→u=0.02 drawn as straight line in clip space | Lines through pot interior |
| **Column index interpolation** | `Math.round(col0 + (col1-col0) * frac)` — binary integer step | Staircase instead of continuous U (v14.0) |

---

## 5. Architectural Lessons & Anti-Patterns

### 5.1 Hard-Won Principles (Proven Through Failure)
1. **"When you disable a safety mechanism, ALSO revert the workarounds created FOR that mechanism"** — zombie workarounds cause subtle regressions
2. **"Sometimes the fix isn't adding code, it's removing it"** — v10.10, v16.9, v16.10 all improved by deletion
3. **"The problem was never topology or geometry — it was data quality flowing into those stages"** — garbage in, garbage out
4. **"Separate topology from geometry"** — index buffer = regular grid (no fins); vertex U coords = patched per-row (exact features)
5. **"When the CPU does its job well, the GPU should be conservative"** — aggressive GPU snap unnecessary AND harmful (causes self-intersection)
6. **CDT is wrong architecture for PRIMARY tessellation** — 2D topology blind to 3D curvature. Use CDT only for chain-strip regions
7. **"More companions" is NOT the answer for CDT slivers** — the issue is CDT domain SHAPE, not point density (R24-R26)
8. **Never trust line numbers in planning docs** — they shift constantly. Always grep for actual code patterns
9. **Local-only adaptation (no global row/column insertion)** is the intended behavior
10. **The "constraint-driven mesh" philosophy**: grid is canvas, chains paint features, everything else stays smooth and uniform

### 5.2 Debugging Methodology (What Works)
- **Diagnostics FIRST, implementation SECOND** — 6 rounds (R7-R12) chased chain linker when CDT constraints were the real issue
- **When incremental fixes produce IDENTICAL metrics across 6 rounds, the diagnosis is wrong**
- **Measure pre AND post for every stage** — four chain quality checkpoints exist: post-linking, post-resnap, post-repair, post-smooth
- **Always present data at the DEFAULT configuration** — Generator presented density=12 worst-case without noting density=4 is default
- **Test the common case** — usedFeatures deadlock blocked symmetric swaps (the MOST common zigzag pattern)
- **Read the code, not the plan docs** — Generator repeatedly proposed fixes that contradicted existing code paths (pointIdx guard, batch2Remap interactions)

### 5.3 Anti-Patterns (Proven Dangerous)
- Adaptive subdivision on GPU without neighbor adjacency → T-junctions at every subdivision boundary
- Patching at interpolated midpoints instead of actual feature positions → vertices off-ridge
- Budget caps that sacrifice CORE feature columns instead of LUXURY companions
- Applying wrap-correction to filtering operations (should be raw UV for filtering, wrap-corrected for interpolation)
- Scoring changes to fix topological problems (no formula can enforce ordering constraints)
- CatRom interpolation near cusps or inflection points (overshoots, Gibbs-like artifacts)
- `buildFeatureEdgeGraphFromGrid` instead of `buildFeatureEdgeGraphFromChainEdges` (former doesn't track real chain topology)

---

## 6. Constants & Tuning Parameters Reference

### 6.1 Detection & Probing
| Constant | Value | Context |
|----------|-------|---------|
| `ROW_PROBE_SAMPLES` | 8192 | Per-row GPU probe count |
| `COL_PROBE_COUNT` | 512 | Column-direction probing (v15.0) |
| `RESNAP candidates` | 32 | GPU re-snap candidate count per chain point |

### 6.2 Chain Linking
| Constant | Value | Notes |
|----------|-------|-------|
| `CHAIN_LINK_RADIUS` | **0.02** | NOT 0.04 — stale docs lie |
| `momentumScale` (primary) | 1.5 | Effective radius: 0.03 |
| `momentumScale` (secondary) | 1.25 | Effective radius: 0.014 |
| `MAX_MISS_COUNT` | 6 | Gap bridging tolerance |
| `FEATURE_CLUSTER_RADIUS` | 0.002 | Feature dedup |
| `MATCH_BONUS` | 1.0 | DP: ensures matches preferred (max score ≈ 0.05) |
| `ACCEL_PENALTY_WEIGHT` | 0.3 | Cost-based scoring |
| `SEAM_NEAR_THRESHOLD` | 0.002 | Chain seam guard |

### 6.3 Smoothing
| Constant | Value | Notes |
|----------|-------|-------|
| `WH_LAMBDA` | 50 | Whittaker-Henderson penalty |
| `SMOOTH_HALFWIDTH` | 8 | SG window (deprecated, replaced by WH) |
| `MIN_CHAIN_LENGTH` | 10 | Low-confidence filter |
| `MAX_CHAIN_ROUGHNESS` | 0.008 | Low-confidence filter |

### 6.4 Grid & Tessellation
| Constant | Value | Notes |
|----------|-------|-------|
| `PROMO_EPSILON` | 0.05 | D-Radical T-perturbation factor |
| `MAX_CDT_BANDS` | **1** | Per-row CDT — multi-band creates ill-conditioned problems (R33) |
| `CDT expansion` | 2 | Down from 4 (R26: domain aspect ratio 5.8:1→3.2:1) |
| `minSpacingFactor` | 0.3 | CDF grid: limits curvature adaptation ratio to 3.33× |
| `DEDUP_EPS` | 1e-5 | Spatial hash dedup |
| `SEAM_THRESHOLD` | 0.4 | Seam-crossing edge detection |

### 6.5 Companions
| Constant | Value | Notes |
|----------|-------|-------|
| `MAX_RUNGS_PER_CV` | 20 | T-Ladder budget |
| `MAX_FAN_PER_BAND` | 40 | U-Graded fan budget |
| `MAX_TRING_PER_BAND` | 12 | T-ring budget |
| `SHELL_FRACTIONS` | [0.20, 0.45, 0.72, 1.0] | Fan shell positions |
| `CONSTRAINT_GUARD_RADIUS` | 0.001 | Companion proximity guard |
| `CONSTRAINT_GUARD_RELAXED` | 0.0002 | Mid-edge relaxation |
| `MIN_LATERAL_CLEARANCE` | 0.002 | Minimum companion U-offset |
| `MIN_TGAP_FOR_COMPANIONS` | 0.001 | Micro-row companion skip |
| `ASPECT_MATCH_FACTOR` | 0.4 | T-Ladder U-spread sizing |
| `SHADOW_DEDUP_U` | 1e-6 | Shadow vertex dedup threshold |
| Default `density` | 8 | UI config (ExportDialog) |
| Default `expansion` | 4 | UI config (ExportDialog) |

---

## 7. Mesh Topology Evolution — The Saga (Abridged)

### Why this matters: 39+ rounds of tessellation work converged on the current architecture. Each "obvious" alternative was tried and failed. Don't re-propose them.

**CDT Era (v1-v3, R24-R41)** → CDT creates 2D topology in UV space, blind to 3D curvature. Fan triangles from 1D→2D density mismatch are structural. Post-CDT centroid refinement fails (child keeps long edge). CDT was identified as architecturally wrong for primary tessellation but reintroduced for chain-strip regions only.

**Rectangular Grid Era (v4.0-v10.10)** → Fundamental limitation: staircase on diagonal features (Nyquist). Per-row feature patching (v8.2) separates topology from geometry. CDF-adaptive spacing REMOVED (v16.10) — visible density bands. Stitch fan REMOVED (v16.9).

**Chain-Constrained Tessellation Era (v16.13+, R37-R41)** → v16.13 Take 1 (baked feature columns) FAILED — destroyed 57% base columns. v16.13 Take 3 (row-band strip) introduced. v16.14 (multi-column strip). v16.15 (chain interpolation). R37 (phantom rows). **R41 (chain-coherent tessellation)**: `chainFanQuad` + FAST (Feature-Aligned Subdivision of Triangles).

**ROOT CAUSE of 39 rounds**: `sweepQuad` line 231 alternates diagonal direction when chain U oscillates between rows.

---

## 8. High-Risk Zones — Handle With Extreme Care

### 8.1 `webgpu_core.ts` — The Monolith
- **5245 lines**, 66 `as any` casts — #1 maintenance risk
- Phase 2 complete: `InputManager` extracted (~260 lines, keyboard/camera controls)
- Phase 3 planned: `UniformBlock` extraction (76-float uniform buffer layout)
- Uniform buffer layout: 0-15 geometry, 16-17 resolution, 18-35 rendering, 36-39 camera, 40-55 ViewProjection, 56-67 camera basis, 68-75 flags
- Known Issues Audit: 35 items across 6 planned phases

### 8.2 Seam (0°/360° Boundary)
- generateGrid: use periodic wrapping (modulo), NOT w+1 inclusive columns
- Chain linking: `SEAM_NEAR_THRESHOLD=0.002` guards cross-seam chains
- Edge recording: raw UV delta for filtering (catches seam crossings), wrap-corrected for interpolation direction
- Shadow enrichment: seam guard prevents spurious projections
- Vertex welding: custom integer sort (string-hashing caused V8 crashes)
- 135 missing chain edges at col734/seam boundary (open issue)

### 8.3 Memory & Performance
- 8k resolution exports: ~500MB arrays → browser tab crash (known limit)
- Companion count can explode: ~130K at density=12 → monitor CDT performance
- Mobile WebGPU: massive shaders with dead code cause driver timeouts → region-based stripping via `#region` markers in `styles.wgsl`

---

## 9. Architectural Decisions — DO NOT REVERT

These decisions were made after extensive debugging and multi-agent debate. Reverting them will reintroduce bugs that took days to diagnose.

| Decision | Rationale | What Happens If Reverted |
|----------|-----------|------------------------|
| cdt2d removal from hot path | 2D topology blind to 3D curvature | Fan triangles, sliver explosion |
| CDF-adaptive spacing removal (v16.10) | Created visible density bands | Banding artifacts |
| Stitch fan removal (v16.9) | Legacy scaffolding from imprecise patching era | Dead code adding complexity |
| GPU snap/relax DISABLED | When CPU detection is good, GPU snap is unnecessary AND harmful | Self-intersecting mesh |
| UV-snapping loop removal | Chain vertices as CDT free points is cleaner | Near-coincident vertex pairs, staircase |
| `buildUnionFeatureGrid` removal | Replaced by CAG curvature-driven density | Union grid artifacts return |
| Transition vertex ring removal | Eliminated by CAG + companion system | Complexity with no benefit |
| CatRom subdivision removal (R15) | Overshoots at inflection points → zigzag constraints | Jagged mesh at bifurcation zones |
| Non-crossing DP (replaces greedy) | Greedy can't fix topological ambiguity | Zigzag chains return |
| Kind-separated linking (v16.3) | Mixing peaks/valleys corrupts chain topology | 258 orphaned valleys |
| `localOnlyMode` removal | Unified single-path pipeline | Conditional maze in PEC |
| Strategy 3 (inflection detection) removal | Every d² sign change = false positive | Noise features on flat geometry |
| WH smoother (replaces SG) | SG has negative sidelobes at Nyquist | Phase-inverted smoothing errors |
| `MAX_CDT_BANDS=1` (R33) | Multi-band creates ill-conditioned CDT problems | CDT explosion |
| Debug dots from raw detection (not chains) | Chains are smoothed, dots should show truth | Misleading debug visualization |

---

## 10. Multi-Agent Debate Protocol

### 10.1 Agent Roles
- **Generator**: Creative engine, proposes solutions. Thinks in possibilities — aggressive, mathematically grounded
- **Verifier**: Adversarial reviewer, attacks proposals. Thinks in proofs and counterexamples — rigorous, skeptical
- **Executioner**: Implementation arm, writes production TypeScript. Thinks in code — clean, maintainable
- **Master**: Fourth vote, approves/rejects. Tracks long-term architecture

### 10.2 Quality Gates (All Must Pass Before Approval)
| Gate | Owner |
|------|-------|
| Problem fit | Master |
| Mathematical correctness | Verifier |
| Codebase grounding (verified against real code) | Verifier |
| Architectural alignment | Master |
| Implementation feasibility | Executioner |
| Test coverage | Master + Executioner |
| Regression safety | Verifier + Executioner |
| Performance impact | Verifier |

### 10.3 Lessons from 51 Rounds
- **Verifier catches real bugs**: C1 (budget priority inversion), C2 (dead zone resurrection), C6 (50% companion loss from negative dt), constraint guard interaction that kills 60% of companions, batch2Remap coincidence path
- **Generator pattern weakness**: reasons about architecture well but doesn't fully trace code paths — three independent barriers (R18.1), wrong insertion point (R8), density=12 presented as default
- **One-round convergence happens** when the problem is well-framed and the solution is mathematically clean
- **When fixing doesn't work for 6 rounds, the diagnosis is wrong** — not the algorithm
- **Safety mechanisms can create deadlocks** (usedFeatures set, R11.1)
- **Guard systems interact with new features in non-obvious ways** (constraint guard killed 60% of innermost fan companions)
- **Transfer function verification matters**: Generator's WH table had lambda=50 results labeled as lambda=200 (C1 R9 Verifier catch)

---

## 11. UI Architecture (v2.0-v2.2)

### 11.1 Layout System
- Phase 0 (Foundation): Design tokens, CSS custom properties, motion.css
- Phase 1 (Base Components): ButtonV2, SliderV2, SectionV2
- Phase 2 (Layout): SidebarV2 (380px, resizable, Radix Tabs), ToolbarV2 (floating), StatusFooter, AppUIv2
- Phase 3 (Tabs): ShapeTab (13 geometry sliders), StyleTab (dynamic schema params), ExportTab (quality cards + format selector)

### 11.2 Key Patterns
- **Welcome Card**: first-run onboarding, gates on confidence level 0, sets FourierBloom preset
- **Style transitions**: 4-phase state machine (idle→exiting→pausing→entering), `displayStyle` lags behind actual style
- **Progressive disclosure** via confidence system
- **Zustand slices pattern** — custom undo/redo (not zundo, incompatible with slices)
- Individual `useAppStore` selectors (not bulk `usePerformance()`)
- `defaultValue` on sliders MUST point to schema defaults, not current values (breaks snap-to-default)
- Radix `Tabs.Content` types `forceMount` as `true | undefined`, NOT `boolean`

---

## 12. Deployment & Infrastructure

- **Hosting**: Cloudflare Pages with Wrangler edge functions
- **Auth**: Supabase (client may be null — ALWAYS guard)
- **Payments**: Stripe (price IDs + tier config in `services/stripe.ts`)
- **State**: Zustand with slices
- **Env vars**: Frontend needs `VITE_` prefix; use Anon key not Service key
- **Mobile**: Massive shaders cause driver timeouts → `#region`-based stripping
- **npm packages**: `@fontsource/ibm-plex-mono` latest is 5.2.7 (not 5.2.8)

---

## 13. Current Open Issues (as of journal archival)

1. 135 missing chain edges at col734/seam boundary
2. 53% low-valence outer-wall vertices (structural from chain topology)
3. Diagonal crease artifact at chain-strip/grid-quad boundary (root cause: boundary ownership gap, `CHAIN_LOCK_BAND_HALF_WIDTH`)
4. 166 TypeScript compile errors (strict mode broken)
5. 0.22mm average ridge distance (genuine ~0.001 U error, 19× worse than claimed ±0.5 sample precision — Verifier proved R48 floor=0.052mm)
6. `buildFeatureEdgeGraphFromGrid` is dead code (still exported, never called after CAG)
7. `potGeometry` parameter on `buildCDTOuterWall` is unused (left for API stability)
8. Several pre-existing TS6133 (unused variable) warnings in OWT/CST/PEC test files

---

## 14. Operational Checklist

### Before any handoff:
```bash
cd potfoundry-web
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint — must be 0 warnings
npm test             # Vitest unit tests
```

### For export pipeline changes:
- Run targeted tests: `ChainLinker.test.ts`, `OuterWallTessellator.test.ts`, `ChainStripTriangulator.test.ts`, `ParametricExportComputer.test.ts`
- Check export console for diagnostic lines: chain quality, post-smooth quality, companion stats, crossing constraints
- Verify: missing chain edges, maxAspect, inverted triangles, CDT enforcement rate

### For debugging ambiguous geometry:
- Add/keep diagnostics BEFORE speculative algorithm rewrites
- Measure at EVERY pipeline stage (post-linking, post-resnap, post-repair, post-smooth)
- Present data at DEFAULT config, not worst-case
- Read the ACTUAL code, not plan docs (line numbers drift)

---

## 15. Journal Hygiene Rules

- `agents_journal.md` is a compact rolling log (target: 15-40 lines per entry)
- Required fields: Summary, Decisions, Validation, Risks, Next agent
- Deep narratives/debates → `archive/plans/`, then link from journal
- Entries > ~120 lines → move details to plan doc, journal as index
- **APPEND only** — never delete or modify previous entries
- Leave a "Sign-off" entry documenting what you did and what the next agent should know

---

## 16. Priority Stack (from ROADMAP + recent sessions)

1. stl export quality
2. Mobile responsiveness
3. OBJ/3MF export formats
4. Fixing the seam (0°/360° boundary)

---

*This document distills ~11,200 lines of archived agent journals into actionable engineering knowledge.
If you're about to propose a change to the parametric pipeline, search this document first —
the odds are high that someone already tried it, debugged it, and documented why it did or didn't work.*
