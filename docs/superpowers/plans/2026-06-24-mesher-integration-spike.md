# General Mesher — Production-Integration Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove the general FeatureGraph's offset-band paving can be stitched into the REAL production dyadic complement watertight-by-construction, on a real Voronoi pot — or surface the crack cheaply (a NO-GO is a win).

**Architecture:** Reuse the proven `src/fidelity/bandRemesh/` paver/stitch/junction/audit; REPLACE its hand-wired proof-of-concept complement with the real `FeatureConformingTriangulator` via (a) an emit-gate that excludes band-interior cells and (b) a force-register that makes the complement adopt the band's exact densified rail vertices. Flag-gated, default-OFF, byte-identical when off.

**Tech Stack:** TypeScript, Vitest (CPU `styleSampler`, no GPU/DOM), the conforming mesher + bandRemesh modules.

## Global Constraints

- **The #1 load-bearing rule (from the integration map):** ONE densified rail array, **quantized to the complement's QSCALE (2²⁴) dyadic grid**, fed to BOTH `paveBand` and the complement's force-register; **all welds in (u,t)-id space, never 3D** (positions match across GPU/CPU because both evaluate the same (u,t)); 3D evaluated once per final vertex. The band side keys by exact string `${u}|${t}`; the complement keys by quantized `round(u·2²⁴)` — these MUST be reconciled or rail vertices duplicate → T-junctions.
- **Flag-gated, default-OFF.** A new `bandRegions`/feature-band opt; when absent, the assembly is **byte-identical** to today (a committed test asserts this against the current golden). NO behavior change on the default path.
- **Production touch discipline (CLAUDE.md):** the GitNexus index was refreshed (29,833 nodes). Run `mcp__gitnexus__impact({target, direction:"upstream"})` on each production symbol BEFORE editing it (Task 0), report blast radius + risk; warn on HIGH/CRITICAL. Run `mcp__gitnexus__detect_changes()` before each commit that touches production.
- **Binary de-risk gate, not a quality target.** Smoothness/density/CAD-fidelity NOT gated. The single question: does the real complement share the band's rail vertices cleanly, watertight, on real geometry?
- TDD; ESLint 0 warnings (CI fails on any warning); run `npm run test` (Vitest).
- Keep new band-integration logic minimal-surface; band-side geometry stays in `src/fidelity/bandRemesh/`.

**Verified file:symbol anchors (from the integration map — confirm before editing):**
- `FeatureConformingTriangulator.ts:255` `triangulateQuadtreeWithFeatures(qt, features, options)` (entry); `:165` `edgeCrossingsInto`; `:220` `planarizeConstraints`; `:541-549` `regH`/`regV` registry; `:613-626` `registerBoundary` (only registers ON-EDGE points — extend here); `:674-687` `readH`/`readV` (PASS-B read); `:693-699` PASS-B emit loop (band emit-gate here); `:418-432` `vertexIndex()` (QSCALE=1<<24 global dedup).
- `WatertightAssembly.ts:402` `assembleWatertight(outerSampler, innerSampler, dims, opts)` (add band opt); `:486` `buildConformingWall` (plumb featureLines/bandRegions); `:747` `orientOutward`.
- `src/fidelity/bandRemesh/`: `stitch.ts:110` `densifyRail`; `stations.ts:202` `buildStations` (`:223` THROWS if rail spacing > targetEdgeMm/2 → densify first); `paver.ts:197` `paveBand` → `{utVertices:[u,t][], indices, railVertexIds:{foot,crest}}`; `junction.ts:400` `paveJunction` (corner precondition: `arm[i].junctionCrest ≡ arm[(i+1)%3].junctionFoot` EXACT); `audit.ts` `auditWatertight(mesh,{boundaryVertexIndices})`; `rails.ts:53` `extractRails(p,{footFrac:1.0,crestFrac:0.15,resU,resT,dpTol:3e-4})` → `{foot,crest}` (does NOT go through `VORONOI_INSERTION_ENABLED`).
- Harness to clone: `src/fidelity/verify_voronoiCelticFeatureFlow.test.ts:654` (assembleWatertight on Voronoi, FL7&11, `buildVoronoiSpec()` H=120,R0=40,nRing=1024); `styleSampler.ts:101` (CPU sampler).

---

### Task 0: Impact analysis (no code) — production blast radius

**Files:** none (analysis + report).

- [ ] **Step 1:** Run `mcp__gitnexus__impact({target:"triangulateQuadtreeWithFeatures", direction:"upstream"})`, and the same for `assembleWatertight`, `registerBoundary`, `buildConformingWall`. Record direct callers, affected execution flows, risk level for each.
- [ ] **Step 2:** Report the blast radius to the controller. If any is HIGH/CRITICAL, the controller must warn the user before the production-editing tasks proceed. Record the result in the task report; do NOT edit production until this is reviewed.

---

### Task 1: Keying-regime reconciliation — the #1 crux, de-risked on 2 cells

**The hardest risk, and everything depends on it.** Prove a rail vertex inserted into the dyadic complement resolves to the SAME id from both adjacent cells, AND matches the band side — bit-exactly — for BOTH an on-edge and an interior rail vertex.

**Files:**
- Create: `src/fidelity/bandRemesh/railKey.ts` (the shared keyer).
- Test: `src/fidelity/bandRemesh/railKey.test.ts`.

**Interfaces:**
- Produces: `quantizeRailUT(u: number, t: number): [number, number]` — snap a rail (u,t) to the complement's QSCALE dyadic grid: `qu = round(u*QSCALE)/QSCALE`, `qt = round(t*QSCALE)/QSCALE` with `QSCALE = 1<<24`, u taken mod 1 (periodic) BEFORE rounding so the seam closes. Returns the snapped (u,t) that BOTH `paveBand` and the complement's force-register will use. Also `railVertexKey(u,t): number` matching the complement's `vertexIndex()` key exactly (read `FeatureConformingTriangulator.ts:418-432` for the exact formula — replicate it, do not approximate).

- [ ] **Step 1: Failing test — round-trip equivalence.** For a set of arbitrary non-dyadic rail (u,t) (incl. one near the u-seam, e.g. u=0.99999, and one interior), assert: (a) `quantizeRailUT` is idempotent; (b) the band's exact-string key `${qu}|${qt}` and the complement's `railVertexKey(qu,qt)` resolve the SAME quantized cell (i.e. two (u,t) that the band treats as identical are also identical under the complement's quantizer, and vice versa — no split); (c) a seam pair (u≈0 and u≈1 at the same dyadic position) maps to ONE key.
- [ ] **Step 2: Run → FAIL.** `npx vitest run src/fidelity/bandRemesh/railKey.test.ts`
- [ ] **Step 3: Implement `railKey.ts`** replicating the complement's `vertexIndex` quantization exactly; `quantizeRailUT` snaps to that grid.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Two-cell adoption test (the actual de-risk).** Build a MINIMAL 2-leaf quadtree (two adjacent cells sharing one edge) + call the real `triangulateQuadtreeWithFeatures` with a single rail `FeatureLine` whose vertices are `quantizeRailUT`-snapped — one vertex ON the shared edge, one INTERIOR to a cell. Assert via `auditWatertight` (or a direct vertex-id check) that the shared-edge vertex resolves to ONE id seen by both cells. (The interior-vertex sharing is Task 3's force-register; here, DOCUMENT whether the on-edge vertex already shares — confirming the map's claim — and that the interior one does NOT yet, motivating Task 3.)
- [ ] **Step 6: Run → PASS** (on-edge shares; interior documented as needing Task 3). 
- [ ] **Step 7: Commit** `feat(bandRemesh): rail-vertex keyer reconciling band exact-key with complement QSCALE`.

**If Step 5 cannot make the on-edge vertex share even after snapping → STOP and report: the keying regimes are irreconcilable without deeper surgery — a candidate NO-GO for the spike (a cheap, valuable result).**

---

### Task 2: Band-region emit-gate + flag-OFF byte-identical

Add the opt-in band region and the three-way cell classification at the PASS-B emit loop, keeping the default path byte-identical.

**Files:**
- Modify: `FeatureConformingTriangulator.ts` (PASS-B emit loop ~`:693-699`), `WatertightAssembly.ts:402/486` (plumb the opt).
- Test: a new `src/fidelity/verify_mesher_band_integration.test.ts`.

**Interfaces:**
- Consumes: a new option `bandRegions?: BandRegion[]` on `assembleWatertight`/`buildConformingWall`/`triangulateQuadtreeWithFeatures`, where `BandRegion` describes the band's (u,t) footprint (start with: a predicate `insideBand(u,t):boolean` derived from the foot+crest rails, OR a polygon — choose the simplest that the emit-gate can test per-cell-center + per-cell-corners).
- Produces: three-way per-leaf classification in the emit loop: **fully-inside band → `continue` (skip emit); straddles a rail → feature-constrained fill (the rail is already a passed FeatureLine); fully-outside → unchanged.**

- [ ] **Step 1: Failing test — flag-OFF byte-identical.** Assemble a real Voronoi pot with NO `bandRegions` and assert the vertices+indices are byte-identical to the current `assembleWatertight` output (snapshot/golden). (This guards the default path before any gate logic exists — it should PASS trivially once the opt is threaded as a no-op, and must KEEP passing after the gate is added.)
- [ ] **Step 2: Failing test — band-interior cells excluded.** With a `bandRegions` covering a known (u,t) rectangle on a smooth test sampler, assert leaves fully inside emit zero triangles there (a hole the band will later fill), while straddle + outside cells still emit.
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement** the `bandRegions` opt plumbed `assembleWatertight → buildConformingWall → triangulateQuadtreeWithFeatures`, and the three-way emit-gate at `:699`. Keep the tree build (refine/balance) UNTOUCHED (do NOT use the tree-hole hook — it breaks 2:1 balance).
- [ ] **Step 5: Run → PASS** (both tests). Re-confirm flag-OFF byte-identical.
- [ ] **Step 6: `detect_changes()`** → confirm only expected symbols/flows changed. **Commit** `feat(mesher): opt-in band-region emit-gate (default-off, byte-identical)`.

---

### Task 3: Rail force-register — complement adopts the band's interior rail vertices

Make the complement SHARE the band's densified interior rail vertices (not just on-edge crossings), via the densify-and-share contract.

**Files:**
- Modify: `FeatureConformingTriangulator.ts` (extend `registerBoundary`/add `registerRailVertex` near `:613`; `readH`/`readV` already read the registry).
- Test: extend `railKey.test.ts` / the 2-cell test from Task 1.

**Interfaces:**
- Produces: a force-register path that admits EVERY densified rail vertex into `regH`/`regV` keyed by its grid-line (so both adjacent cells read it via `readH`/`readV`), regardless of the on-edge check — gated to rail/band FeatureLines only (so non-band features keep their current behavior, preserving flag-OFF byte-identical). The rail vertices passed in are `quantizeRailUT`-snapped (Task 1) so their grid-line keys are exact.

- [ ] **Step 1: Failing test** — extend the Task-1 two-cell test: insert an INTERIOR rail vertex (snapped); assert BOTH adjacent cells now resolve it to the SAME id (was failing in Task 1 Step 5) and `auditWatertight` shows no T-junction at that vertex.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `registerRailVertex` (force-register snapped rail vertices into the registry); wire it for band/rail FeatureLines in PASS A. Preserve the non-rail path unchanged.
- [ ] **Step 4: Run → PASS.** Re-run the Task-2 flag-OFF byte-identical test → still PASS (non-band features untouched).
- [ ] **Step 5: `detect_changes()`. Commit** `feat(mesher): force-register band rail vertices so the complement adopts them`.

---

### Task 4: Single-band integration on real Voronoi — THE GATE

Wire the full path on a real Voronoi pot and run the watertight + orientation gate at FL7 & FL11. This is the spike's GO/NO-GO.

**Files:**
- Modify: `src/fidelity/verify_mesher_band_integration.test.ts` (the real-Voronoi gate); a small `src/fidelity/bandRemesh/integrate.ts` orchestrator if helpful (densify-once → paveBand + complement).

**Interfaces:**
- Consumes: `extractRails` (Voronoi foot+crest), `densifyRail` (ONCE, shared), `quantizeRailUT`, `buildStations`+`paveBand` (band side), `assembleWatertight` with `bandRegions` + the rails as `outerFeatureLines` (complement side), `auditWatertight`.

- [ ] **Step 1: Failing test — the gate.** On a real Voronoi pot (`buildVoronoiSpec()`, `styleSampler('Voronoi')`), pick ONE band (one Voronoi wall segment between two triple-junctions, or the simplest closed cell): extract foot+crest rails → densify ONCE (snapped) → `paveBand` → assemble the complement with the band region excluded + rails force-registered → merge band+complement → `auditWatertight({boundaryVertexIndices: t0/t1 rings})`. Assert at **FL7 AND FL11**: `boundaryEdges`=0 (off the true rings), `nonManifoldEdges`=0, `tJunctions`=0; orientation consistent (`orientOutward`); band triangle aspect ≤4 and **zero** `<10°` band slivers. Handle **seam-crossing + loop closure** of the real Voronoi rails (snap seam/closing vertices to exact dyadic u; re-assert closure after DP — risk #4).
- [ ] **Step 2: Run → expect FAIL/partial,** iterate the wiring (seam, closure, the densify-once discipline) until the gate holds. Do NOT weaken the gate; if a sub-part genuinely can't hold, document precisely (NO-GO evidence).
- [ ] **Step 3: Run → PASS** (gate met) — OR a documented NO-GO with the exact failing invariant.
- [ ] **Step 4: Non-vacuous control.** Add a committed negative control: crack ONE interior shared rail vertex (t strictly in (0,1)) → assert `tJunctions>0` (proves the audit detects a real crack, mirroring Phase-0).
- [ ] **Step 5: `detect_changes()`. Commit** `test(mesher): real-Voronoi single-band watertight integration gate (FL7 & FL11)`.

---

### Task 5: graphToBands generality — junctions + loops on the Voronoi web (second milestone)

Only after Task 4 holds. Generalize from one band to the FeatureGraph network: offset edges → rails, `paveJunction` at degree-3 nodes, loop closure.

**Files:**
- Create: `src/fidelity/bandRemesh/graphToBands.ts` (FeatureGraph → bands + junction arms).
- Test: extend the integration gate to the full web.

**Interfaces:**
- Produces: `graphToBands(graph: FeatureGraph, sampler, opts:{widthMm}): { bands: {foot,crest}[]; junctions: JunctionArm[][] }` — per edge, offset the centerline ±width/2 (metric-aware via sampler) into foot/crest rails; at degree-3 nodes compute the shared corner (u,t) ONCE and hand the identical value to both adjacent arms (`paveJunction` precondition); close loop edges at exact dyadic (u,t).

- [ ] **Step 1: Failing test** — on a small synthetic FeatureGraph with one triple junction + one loop: `graphToBands` produces bands whose junction corners are bit-identical across arms and whose loops close exactly; paving the whole network + complement → `auditWatertight` 0/0 at FL7 & FL11.
- [ ] **Step 2: Run → FAIL → implement `graphToBands`** (offset, junction-corner sharing, loop closure) → **Step 3: PASS.**
- [ ] **Step 4: Real Voronoi full-web gate** — feed the real Voronoi FeatureGraph (from `detectFeatures` OR `extractRails`-derived web) through `graphToBands` + the integrated complement; assert the same watertight + orientation gate over the FULL web (multiple bands + junctions + loops) at FL7 & FL11. Document any junction/loop residual (Phase-0 noted asymmetric-junction aspect ~4.08 — quality, not watertight).
- [ ] **Step 5: `detect_changes()`. Commit** `feat(bandRemesh): graphToBands (offset/junction/loop) + full-web watertight gate`.

---

## Post-plan (controller, not a task)

After Task 5 (or an earlier documented NO-GO): final whole-spike review (most-capable model) over the diff; write the GO/NO-GO record (does the production integration hold? → write the full general-mesher plan: all 20 styles, off-feature snap, density-follows-features, GPU export/render verification, re-baseline; OR fall back to per-cell strip / reconsider). The user chose spike-first precisely so this decision is cheap.

## Self-review

- **Spec coverage:** spike §2 gate → Task 4/5 (watertight+orientation, FL7&11, flag-OFF byte-identical, non-vacuous control); §4 integration mechanism (exclude + adopt) → Task 2 (emit-gate) + Task 3 (force-register), reconciled by Task 1 (keying); §6 production discipline → Task 0 (impact) + `detect_changes` per production commit; §5 fallback → the NO-GO branches in Task 1 Step 7 / Task 4 Step 2. Covered.
- **Risk order matches the integration map (hardest first):** keying (Task 1) → exclusion (Task 2) → interior-rail adoption (Task 3) → real-geometry gate incl. seam/loop (Task 4) → junction/loop generality (Task 5).
- **Type consistency:** `quantizeRailUT`/`railVertexKey` (Task 1) consumed by Task 3's force-register and Task 4's densify-once; `bandRegions` opt (Task 2) consumed by Task 4; `paveBand`/`densifyRail`/`auditWatertight` signatures per the verified anchors.
- **No placeholders:** each task names the exact file:symbol hook, the gate, and the TDD steps; the one open design choice (BandRegion as predicate vs polygon) is bounded with "simplest that the per-cell test needs."
