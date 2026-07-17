# Snaking C0 double-valued walls — feature-side complex for curved risers (2026-07-17)

**Author:** Claude (Opus 4.8), with Patryk
**Status:** design approved (mechanism de-risked by three probes); P1 in implementation
**Roadmap:** folds into `research/lab/2026-07-15-universal-001mm-roadmap.md` (U4 curtain complexes, curved-riser sub-class; U5 candidate generator). See the addendum there.

## 1. Problem

Three styles carry a **true C0 radius jump whose locus SNAKES** across the surface (measured, `research/bridge/_c0Scan.test.ts`): CelticKnot (0.60mm), CelticTriquetra (1.73mm), and BasketWeave when twisted (2.0mm). A snaking C0 is not any of the four sharp-feature classes the roadmap names (§348): class 2 is *straight* jump lines; class 3 is *cusps* (continuous value). It is a **curved jump curve** — a value discontinuity along a curved (u,t) path.

The single-valued height field `r=f(u,t)` cannot represent the vertical face at such a jump, and the current handling either ramps it (metric over-reads) or gate-excludes the band (the accept-band pattern Patryk rejects). The judge already **declares** the structure: `celticKnotOuterWallTarget.ts` lists the obligations `foreground-background-radial-jump`, `z-buffer-occlusion-ties`, `closest-strand-ownership-ties`, and carries `completeInternalFeatureSideGraphEmitted: false` with the scope note *"the internal ribbon and occlusion discontinuity graph is declared but not yet emitted as a complete clipped feature-side complex."* That unemitted complex is this project.

## 2. What the de-risk proved (evidence, not claims)

- **Mechanism GO** (`_wallSpike.test.ts`): a double-valued wall — two vertices at ONE (u,t), radii = the two one-sided limits, joined by flat quads — chords a snaking C0 to **<0.01mm true-3D**, converging O(spacing²) and crossing 0.01 at 0.635mm spacing = **1.3× a typical surface edge** (not pathological). Lips distinct 0.600mm; lips == one-sided limits to 0.0011mm (watertight weld).
- **Junctions watertight** (`_wallJunction.test.ts`): ribbon crossings are **3-sheet Y-junctions** (not X), four bounding a small overlap diamond. The occlusion is an *internal* cliff (0→0.65mm) inside the diamond; the outer envelope keeps its full 0.6mm wall throughout. Shrinking a ring onto each junction, levels collapse 55→25→9→4→**2** landing on `{r0−0.6, r0}` — all walls meeting at a Y **pinch to one shared double-vertex** ⇒ watertight by construction.

## 3. Agnosticism contract (non-negotiable, roadmap §340)

The **target declares** the cliff structure analytically; the mesher/judge never *detects* it. CelticKnot's cliffs are closed form — `localU = x_i(t) ± strandW`, `x_i(t) = amp·sin(t·tightness·τ·3 + phaseᵢ)` — so this is a declaration, not sampling. Every new snaking-C0 style must emit the same contract (its cliff curves + lip limits + junction graph) to be handled. No black-box detection.

## 4. Architecture

A **feature-side complex** = a set of double-valued **curved-riser curtain patches** plus a **junction graph**, all derived analytically from style params. Three layers, each independently testable:

### 4.1 Declaration (pure, P1 — this increment)
`celticKnotCliffComplex.ts` (new, pure, browser-capable; pattern = `tierC/dsFeatureEdges.ts`). Emits:
- `CliffSegment[]` — each a declared curve `s∈[0,1] → (u,t)` on a strand edge `localU = x_i(t) ± strandW`, clipped to where it is the actual cliff (the envelope), with `kind: 'ribbon-background' | 'occlusion'` and `lips(s) → {upper, lower}` = the two one-sided radius limits (sampled from the style's own radius fn, δ→one-sided).
- `Junction[]` — where segments meet: the (u,t) point, the shared pinch double-vertex `{upper=r0, lower=r0−0.6}`, and the incident segment endpoints.

Contract: **lips == one-sided surface limits** (watertight weld to the sheets) and **junction pinch** (incident segments share the pinch vertex). Both are test obligations, ported from the probes.

### 4.2 Target emission (P2 — proof-layer, needs care)
Extend `celticKnotOuterWallTarget.ts` with `compileFeatureCurtain(segment)` — an SSA patch program (like the existing `compileSeamCurtain`) mapping `(localU,localV)` to the riser face swept between the two lips along the cliff curve. Emitting the full clipped complex flips `completeInternalFeatureSideGraphEmitted → true` and satisfies the declared obligations, making CelticKnot's atlas admissible (currently atlas-refused). **Proof-critical file, actively co-edited — coordinate; do not rush.**

### 4.3 Mesher generation (P3 — U5 candidate track)
The production mesher emits the double-valued wall triangles from the same declared complex (double vertices at the lips, wall quads, Y-junction shared vertices), welded to the surface sheets. Flag-gated behind the existing region/perfect-mesher flags. Feeds the U5 exit (production meshes certified, not just reference tessellations).

### 4.4 Certification (P4)
The wall band **scores** under the two-sided proof (a flat quad on a planar riser face has ~0 chord) rather than being `tBands`-excluded. Removes the accept-band exclusion for these styles.

## 5. Data flow

```
style params ──► celticKnotCliffComplex (P1: curves + lips + junctions, PURE)
                      │                                    │
                      ▼ (P2)                               ▼ (P3)
        target compileFeatureCurtain            mesher double-valued wall
        (SSA curtain patches, judge)            (triangles, candidate)
                      │                                    │
                      └────────► P4 certification ◄────────┘
                         (wall band scored, not excluded)
```

Both consumers read the **same** declared complex — one source of truth for the cliff geometry.

## 6. Testing

P1 (this increment), ported from the committed probes:
1. **Lip-weld**: each segment's `lips(s)` equal the style radius fn's one-sided limits at `(u∓δ, t)` to <2e-3mm across the segment.
2. **Junction pinch**: at every junction, incident segment endpoints converge to the shared `{r0, r0−0.6}` vertex (the 55→…→2 level collapse; endpoints agree to tolerance).
3. **Wall fidelity**: a double-valued wall built from a segment chords to <0.01mm (Hausdorff to the ruled face) at ≤~0.7mm spacing — the wall-spike guarantee, now on the production module.
4. **Determinism / purity**: same params → identical complex; no `Date`/`Math.random`/DOM.

## 7. Phasing & size

| Phase | Scope | Size | Touches |
|---|---|---|---|
| **P1** | pure declaration module + tests (this increment) | S | NEW file only |
| P2 | target curtain-patch emission; flip the flag | M | `celticKnotOuterWallTarget.ts` (proof-critical, co-edited) |
| P3 | mesher wall generation (double vertices + junctions), flag-gated | L | region/tierC mesher (CRITICAL hubs) |
| P4 | certification scores the wall band; retire `tBands` exclusion for these styles | M | proof layer |
| P1′ | extend declaration to CelticTriquetra + BasketWeave@twist | M | new per-style files |

P1 is the load-bearing, self-contained core: it ports proven probe math into a tested production module that both later consumers read, and it touches no file another agent holds open.

## 8. Risks / guardrails

- **Concurrency (active).** `FeatureLineGraph.ts`, `completeMappedArtifactGeometry.ts`, `finalStlPartialCertification.ts` and new `parallelPatchProof*` files are being edited by other agents now. P1 is a new file; P2–P4 must coordinate (`git -C` absolute paths, no `git stash`, `impact()`/`detect_changes()` before touching proof/mesher hubs).
- **Full-envelope clipping.** The de-risk characterized adjacent-strand crossings. P1 delivers the declaration + junction locator correct for the characterized cases and structured for the full envelope (all pairwise strand crossings × columns); completing the envelope enumeration is the remainder of P1 and is explicitly scoped, not assumed done.
- **Proof-layer integrity (P2).** Curtain patches are SHA-pinned SSA programs; emission must keep the canonical-JSON/backends contract. No shortcuts.
- **Off critical path.** These three styles are not the DS/Gyroid/Gothic mandate; this advances U4's curved-riser sub-class and R2 (representation) without competing for the mandate's critical path.
