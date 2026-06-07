# Conforming Mesher — Whole-Mesh Watertight Assembly (Plan 3 of 3, brought forward)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. TDD, checkbox steps.

**Goal:** Under the `conformingMesher` flag, build the WHOLE pot (all 6 surfaces) watertight **by construction** — shared boundary rings, no repair battery — so the full goal vector (`sliver=0, boundary=0, nonManifold=0, orientation=0`) passes end-to-end on smooth styles.

**Status of foundation (Plan 1):** DONE + validated. The feature-free conforming outer wall is clean in isolation on 13 styles (sliver/orient/nonMan/seam-boundary=0, maxAspect<16, build 1–6 s). Modules in `src/renderers/webgpu/parametric/conforming/`. `GpuSurfaceSampler(positions, resU, resT)` + `buildConformingOuterWall(sampler, opts)` exist and are unit-tested.

**Key idea — shared uniform rings.** Every surface boundary ring uses the SAME uniform `nRing` U-samples so adjacent surfaces share ring vertices by index (watertight, no weld). Walls (outer/inner) use the conforming quadtree mesher with **pinned-uniform boundary rows** (t=0 and t=1 rows fixed to `level = log2(nRing)`, interior refines freely; transition templates bridge). Caps (rim/base/drain) are simple ring-joined strips that REFERENCE the walls' shared ring vertices (creating triangles, not duplicate ring vertices).

**Surface geometry (from GPU `evaluate_vertices`, adaptive_mesh.wgsl):**
| surfaceId | name | (u,t)→3D | boundary rings |
|---|---|---|---|
| 0 | Outer wall | r=outer(θ,t), z=t·H | top@t=1 (z=H), bottom@t=0 (z=0) |
| 1 | Inner wall | z=tBottom+t·(H−tBottom), r=inner | top@t=1 (z=H), bottom@t=0 (z=tBottom) |
| 2 | Rim | r=lerp(r_inner,r_outer,t)@z=H | outer-edge↔outer-top, inner-edge↔inner-top |
| 3 | Bottom-under | r=lerp(r_outer@0, r_drain, t)@z=0 | outer-edge↔outer-bottom, inner-edge↔drain ring |
| 4 | Bottom-top | r=lerp(r_inner@tBottom, r_drain, t)@z=tBottom | outer-edge↔inner-bottom, inner-edge↔drain ring |
| 5 | Drain | r=r_drain, z=t·tBottom | top↔bottom-top drain ring, bottom↔bottom-under drain ring |

If `rDrain<=0`: no drain surface; bottom-under and bottom-top are full discs (fan to a single centre vertex at the axis). Handle both cases.

## File structure
New under `conforming/`:
- `RingStrip.ts` — triangulate an annular strip between two index-rings of equal count `nRing` (and a disc: ring→centre fan); winding per surface invertWinding.
- `ConformingWall.ts` — generalize `buildConformingOuterWall` to any wall sampler + `pinBoundaryLevel` option → uniform `nRing` top/bottom rings (ordered loops). (Refactor: `buildConformingOuterWall` becomes a thin wrapper.)
- `WatertightAssembly.ts` — orchestrate: build outer+inner walls, then rim/base/drain strips referencing shared rings; return combined `{ vertices:(u,t,surfaceId), indices, surfaceRanges }` with shared ring vertices used by both neighbours.
Modify:
- `PeriodicBalancedQuadtree.ts` — add `pinBoundaryLevel?: number` (force t=0 and t=1 rows to exactly that level; keep 2:1 balance with the interior).
- `ParametricExportComputer.ts` — under `flags.conformingMesher`, early-return `await this.buildConformingExport(params, buffers…)`: build samplers (one per wall surfaceId via `evaluatePoints`), `assembleWatertight(...)`, GPU-eval all (u,t,surfaceId) vertices → 3D, run `validateMesh`, return `ParametricExportResult`. SKIP the whole existing surface-loop + optimization passes + tail battery.

## Tasks (TDD; unit tests use SyntheticCylinderSampler / hand-built rings; e2e gate via harness)

- **T1 RingStrip** — annulus(ringA:number[], ringB:number[], invert) → triangles; disc(ring:number[], centreIdx, invert). Test: annulus of nRing=8 → 2·8 tris, every interior edge used twice, no boundary except the two input rings; CCW per invert. Commit.
- **T2 Quadtree pinned boundary rows** — `pinBoundaryLevel`. Test: top & bottom rows all at exactly `level`; interior still refines; 2:1 balance holds; seam periodic. Commit.
- **T3 ConformingWall** — wall builder returning uniform `nRing` rings (ordered, length nRing, U=i/nRing). Test (synthetic): topRing/bottomRing length==nRing, U evenly spaced, watertight wall (boundary only at the two rings), seam closed, aspect<100. `buildConformingOuterWall` re-expressed as wrapper (existing 19 tests stay green). Commit.
- **T4 WatertightAssembly** — full assembly with shared rings. Test (two synthetic concentric cylinders + flat rim/base, rDrain>0 and rDrain==0): combined mesh has **boundary=0, nonManifold=0** (whole closed solid), orientation consistent (all outward), every ring vertex shared (referenced by both neighbour surfaces). Commit.
- **T5 Pipeline integration** — gated `buildConformingExport` early-return in compute(); skip battery. typecheck+lint. e2e GATE: `e2e/_conforming_full_probe.cjs` sets `window.__pfConforming`, runs `__pfFidelity.diagnoseTopoQuality` (full mesh) on SuperformulaBlossom. **Gate: sliver=0 ∧ boundary=0 ∧ nonManifold=0 ∧ orientation=0** end-to-end. Then run the smooth-style set (SuperformulaBlossom, SuperellipseMorph, BambooSegments, RippleInterference, WaveInterference, HarmonicRipple, Crystalline, ArtDeco, GeometricStar, BasketWeave, GyroidManifold). Record. Commit.

## Notes / risk
- The walls' rings must align in U with the caps. Pin all walls to the SAME nRing. Pick nRing = 256 (or scale with target). Inner & outer top rings both have nRing verts at U=i/nRing → rim quads connect index i↔i.
- Winding: outer wall CCW outward; inner wall inverted; caps per SURFACE_CONFIG.invertWinding. Verify orientation=0 on the whole closed solid (all-outward) in T4/T5.
- Drain: when rDrain>0, drain is a short cylinder sharing both disc drain-rings. When rDrain<=0, discs fan to one centre vertex (watch the single-centre needle aspect — a centre vertex disc on a tiny base is fine; if aspect>100 appears at the very centre, increase base ring resolution or accept the centre fan only at the true axis where triangles are not slivers because the disc is small).
- Canary: SuperformulaBlossom whole-mesh must reach 0/0/0/0. If boundary>0, the ring sharing is broken — fix the shared-index assembly, never add a weld/battery pass.
