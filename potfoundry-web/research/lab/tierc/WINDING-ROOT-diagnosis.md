# WINDING-ROOT diagnosis — Gyroid A4-orient vs DragonScales B1 Finding-2

**Task:** E-2026-07-11-TIERC-HEADTOHEAD Addenda 5/7/8. DIAGNOSIS ONLY, no fix implemented.
**New probe (uncommitted per mission RULES):** `research/bridge/_tierc_winding_diag.test.ts` +
`vitest.tierc_winding_diag.config.ts`. Raw dumps (gitignored):
`research/exchange/tierc/windingDiag_ds_{summary,mismatchEdges}.json`,
`windingDiag_crumbs.ndjson`. Gyroid evidence reused read-only from the ALREADY-COMMITTED
`research/exchange/tierc/armA4_patchDumps.json` (A4-diagnosis's own probe output) — no rebuild
needed. GitNexus MCP was not available in this session; blast radius below is from manual `Grep`,
flagged as such per the mission's fallback instruction.

## VERDICT (read first): DISTINCT mechanisms, not a shared root

Both are "seam winding defects" only in the most superficial sense (an edge at a T-adoption/join
has two same-direction incident triangles). Mechanistically they are unrelated:

| | Gyroid A4 (u-seam) | DragonScales B1 Finding 2 (z-adoption seam) |
|---|---|---|
| **Triangulators involved** | ONE (`FeatureConformingTriangulator`'s own wrapsSeam+CDT path talking to itself across a t-row boundary) | TWO, independently hand-written (`ConformingWall`/`QuadtreeTriangulator` vs `_sharp3dMesh.ts`'s `buildStructuredWall`) |
| **Scope** | ~645/652 edges, 100% confined to ONE t-band (t≈0.31–0.33) where a band-edge feature curve happens to run close to the seam | 100% of every seam edge, unconditionally — measured 32/32 in this toy (nRing=16), matches B1's full-scale 7168 = 7 rings × 2 seams × 512 exactly |
| **Sign pattern** | Mixed / near coin-flip: A1 measured `{2f0r: 314, 0f2r: 338}` — which side is "wrong" varies edge to edge | Absolute: 100% of non-degenerate `ringStruct` triangles are CW, 100% of `lowerK1`/`upperK1` triangles are CCW, always — a fixed global sign per source, not per-edge |
| **Feature-curve dependence** | YES — vanishes everywhere the plain (non-CDT) path handles the seam (proven: 0 mismatches outside the one t-band) | NO — this toy's K1 z-bands carry zero feature lines; the defect is 100% present regardless |
| **Root class** | A registry/PASS-A→PASS-B read inconsistency between two vertically-adjacent wrapsSeam+feature-registered leaves | A missing shared-convention CONTRACT: nobody ever specified "CCW-in-(θ,z)" as an invariant `buildStructuredWall` must match; it was written independently and picked the opposite sign |

A forced single fix would be wrong for both: DS's fix is a one-line global sign flip in a
research-only file; Gyroid's fix must stay a narrow, feature-registry-local kernel change (a global
flip would break the 99.99% of the u-seam already proven correct).

---

## 1. Mechanism characterization

### 1.a DragonScales B1 Finding 2 — CONFIRMED, systematic cross-triangulator CW-vs-CCW mismatch

**New evidence (this probe):** rebuilt the exact B0/B1-proven adoption primitives
(`buildK1ZBand`→`ConformingWall`, `buildRingBandRows`+`buildStructuredWall`, `mergeAdoptedAssembly`
— all read-only imports from `_tierc_b0_toy_lib.ts`/`_sharp3dMesh.ts`, zero duplicated logic) at toy
scale (nRing=16, nThetaRing=24 — deliberately mismatched counts, so `buildStructuredWall` takes the
*general* `stripBetween` merge-strip dispatch, the same one production DS uses at nRing=512 ≠
nThetaRing=2400). Triangles were tagged by SOURCE using exact positional index-range slicing of the
merged buffer (`mergeAdoptedAssembly` concatenates `lower.indices`, then `upper.indices`, then
`ring.idx` — a hard fact read from its own code, not inferred), and each triangle's true winding
sign was computed in a periodic-unwrapped (θ,z) plane (local-unwrap per triangle, avoiding the
θ=0/2π branch-cut artifact — see §1.b for why this matters).

**Result — 100% clean separation:**
```
tally: lowerK1  {pos: 416, neg: 0,   zero: 0}   ← always CCW
       upperK1  {pos: 416, neg: 0,   zero: 0}   ← always CCW
       ringStruct {pos: 0, neg: 176, zero: 96}  ← always CW (zero = tread sub-rows, constant-z, degenerate in the (θ,z) projection — not a defect)
counts: boundary=32 (the toy's own intentionally-open far ends, expected) nonManifold=0 orientationMismatch=32
crossSourceMismatches: 32/32 (100%)
```
`orientationMismatch = 32 = 2×nRing` — exactly the `2×512×7=7168` shape B1 measured at production
scale (2 seams × nRing per ring, × 7 rings). Two representative dumped edges (from
`windingDiag_ds_mismatchEdges.json`):

```
edge (a=22, b=26)  z=57 (SEAM_LO), θa=5.105, θb=4.712
  tri #34  verts=[27,22,26]  source=lowerK1     thz=[(4.909,56.375),(5.105,57),(4.712,57)]  signedArea=+0.2454  CCW  forwardOnEdge=true
  tri #863 verts=[26,467,22] source=ringStruct  thz=[(4.712,57),(4.974,58.5),(5.105,57)]    signedArea=-0.5890  CW   forwardOnEdge=true
```
Both triangles traverse the directed edge `22→26` (`forwardOnEdge: true` for both — literally the
`forward=2, reverse=0` orientationMismatch signature). `lowerK1`'s triangle is CCW by construction
of `ConformingWall`/`QuadtreeTriangulator`'s `add(u0,t0)→add(u1,t0)→add(u1,t1)→add(u0,t1)` SW→SE→NE→NW
polygon walk (`QuadtreeTriangulator.ts:711-718`, mirrored verbatim in
`FeatureConformingTriangulator.ts:1474-1482` for the plain-template branch) — always CCW in
`(u,t)=(θ/τ,z/H)` for ANY leaf, regardless of position, by construction. `ringStruct`'s triangle is
CW by construction of `buildStructuredWall`'s row-pair emission
(`_sharp3dMesh.ts:96-116`): both its equal-count branch (`idx.push(a,b,bn); idx.push(a,bn,an)`,
lines 110-111) and its general `stripBetween` branch (`idx.push(topV(i),botV(j),topV(i+1))` /
`idx.push(topV(i),botV(j),botV(j+1))`, lines 66/70) emit `(lower-row-θᵢ, upper-row-θⱼ, lower-or-upper-row-θᵢ₊₁)`
— hand-verified algebraically (signed area = `-(Δθ)(Δz)` for the advance-top case,
`(Δz)(θb-θd)` with `θd>θb` for the advance-bot case, both strictly negative when `Δθ,Δz>0`) and
now confirmed numerically: CW, unconditionally, for every non-degenerate triangle it emits. Neither
routine is locally "buggy" — each is a valid, self-consistent triangulator — but they were authored
independently (`_sharp3dMesh.ts`'s own header: "ISOLATED builder for E-2026-07-01-SHARP3D-ARTDECO")
with no shared winding-convention contract, and they disagree.

### 1.b Gyroid A4-orient — a LOCAL per-leaf-pair registry inconsistency, feature-curve-triggered (refines A4-diagnosis, does not overturn it)

**Existing evidence, re-analyzed with correct periodic unwrap.** `armA4_patchDumps.json`'s own
`signedAreaUV` field is computed by A4-diagnosis's `localPatch()` as raw
`(u1-u0)(t2-t0)-(u2-u0)(t1-t0)` with **no periodic unwrap** — for a seam-crossing triangle
(one vertex at u≈0.9995, another at the collapsed u=0 twin) this manufactures a spurious
sign/magnitude from the branch cut (a "jump" of −0.9995 instead of the true +0.00049 step), so the
raw dump's per-triangle sign is NOT directly readable as CW/CCW at the seam. Unwrapping properly
(consistent reference frame, e.g. treat u=0 as u=1 when a triangle's other vertices sit near
u≈0.9995) on the two triangles incident to edge `a=303844 (u=.99951,t=.32422)`,
`b=303845 (u=0→1 unwrapped, t=.32422)` (locus `kind=orientationMismatch, forward=2, reverse=0`,
i.e. both triangles traverse `303844→303845`):

```
triangle X = (303844, 303845, 303841)   t-span [.32422,.3252]  (leaf ABOVE the shared row)
  unwrapped (u,t): (.99951,.32422) (1.0,.32422) (.99951,.3252)   signedArea = +4.8e-7   CCW  (correct)
triangle Y = (303867, 303844, 303845)   t-span [.32324,.32422]  (leaf BELOW the shared row)
  unwrapped (u,t): (1.0,.32324) (.99951,.32422) (1.0,.32422)     signedArea = -4.8e-7   CW   (WRONG)
```
So the true picture is: leaf-ABOVE emits a correctly-CCW triangle; the vertically-adjacent
leaf-BELOW, for the SAME shared edge, emits a CW (flipped) triangle. This is a **local, per-leaf**
sign error, not a global convention flip (contra a naive reading of the raw dump, and contra DS's
mechanism) — corroborated by A1's own aggregate count `{2f0r: 314, 0f2r: 338}` (near-even split
across the ~326 affected loci: sometimes the "above" leaf is wrong, sometimes "below" — a
coin-flip-like local inconsistency, not "one side is always backwards"). It is also STRICTLY
feature-curve-gated: `crossIsolevelNear` is only 11.8% for this population (A4-diagnosis §2.2) and
100% of the 645 loci concentrate in ONE t-decile (t∈[0.30,0.40)) where a band-edge contour runs near
(not through) the seam; everywhere else on the identical u=0/1 seam, the SAME
`add(u0,t0)→add(u1,t0)→add(u1,t1)→add(u0,t1)` plain-template convention I hand-verified for
`QuadtreeTriangulator.ts` — reused byte-for-byte by `FeatureConformingTriangulator.ts`'s own
plain-cell branch (lines 1474-1482) — produces 0 mismatches. `CdtStats.outer={inversions:0,drops:0}`
across the whole outer build (A4-diagnosis, already-wired instrument) rules out "the CDT folded a
triangle" as the cause; the boundary polygon or registry read FED to the CDT (or the plain-template
choice) must already differ between the two leaves for what should be the same shared edge — this
diagnosis narrows the search (a wrapsSeam-flagged leaf's `regH`/`regV` read, or its
`featS/featN/featW/featE` union in `FeatureConformingTriangulator.ts:1456-1459`, disagreeing with
its t-neighbor's own read of the identical grid line) but — consistent with A4-diagnosis's own
scope — does not pin the exact single line; that is fix-design, not diagnosis.

---

## 2. Proposed fixes (design only, not implemented)

### 2.a DragonScales — flip `buildStructuredWall`'s winding (research-file-only, near-zero blast radius)

Reverse the emitted vertex order in `_sharp3dMesh.ts`'s two triangle-emission sites so the row-pair
strip becomes CCW-in-(θ,z), matching `ConformingWall`: swap the last two vertices in each `idx.push`
call in `buildStructuredWall`'s equal-count branch (lines ~110-111) and in `stripBetween`'s two
`idx.push` calls (lines ~66/70) — e.g. `idx.push(a, bn, b)` / `idx.push(a, an, bn)` for the
equal-count branch. **Blast radius (manual grep, GitNexus unavailable this session):**
`_sharp3dMesh.ts` is imported ONLY from `research/bridge/` — confirmed by grep, `src/` never
matches `_sharp3dMesh|buildStructuredWall`. Direct consumers: `_tierc_b0_toy_lib.ts`,
`_tierc_b1_lib.ts` (both DS region-layer work), and `_sharp3dArtDeco.test.ts` /
`_pf_dsconform.test.ts` (the sibling E-2026-07-01-SHARP3D-ARTDECO experiment, which this file was
originally built for) — i.e. the fix is confined to two research experiment lines (DS region-layer,
ArtDeco sharp-3D), zero production (`src/`) exposure, by construction. Re-verification is cheap:
re-run this probe (`PF_TIERC_WINDING_DIAG=1`, ~1s) and B1 Stage 2 topology
(`PF_TIERC_ARMB1_TOPO=1`, `which=corrected`) expecting `orientationMismatches: 0`.

### 2.b Gyroid — kernel change, scoped to the wrapsSeam+feature-registry leaf-pair interaction

Per A4-diagnosis's own recommendation (still the right order): first test whether making
`_gyroidContourLib.ts`'s `linkSegments` periodic-u-aware (research-side only, already proven
byte-identical-when-off by Arm A4a) collapses the torn-endpoint precondition enough to matter; A4a
already showed this is NOT the binding gate (orientationMismatch got marginally worse, 652→654,
with `periodicU=true`), so the real fix is confirmed kernel-side. This diagnosis's contribution:
the fix should NOT be a global winding-convention change (DS's fix shape) — that would break the
>99.99% of the u-seam already proven correct by the plain path. It must be a targeted repair of how
a wrapsSeam-flagged, feature-registered leaf reads its shared-grid-line registry
(`FeatureConformingTriangulator.ts` PASS A/B, `regH`/`regV`, `uKey` wraparound
`((u%1)+1)%1`, and the `featS/featN/featW/featE` unions at lines 1456-1459) relative to its
t-neighbor's own read of the identical line — so that two vertically-adjacent wrapsSeam+CDT leaves
agree on which vertex set (and hence which winding) the shared edge carries. **Blast radius
(manual grep, GitNexus unavailable this session):** `wrapsSeam`/`seamTriangles` is genuinely core
kernel machinery — produced by `QuadtreeTriangulator.ts` and `FeatureConformingTriangulator.ts`,
threaded through `ConformingWall.ts:907` and `ConformingOuterWall.ts:81` into every conforming wall
build (outer AND inner, every feature-carrying style), and already specially-handled downstream by
`minAngle3D`/`degenerate3D`/`signedArea` test helpers that unwrap `seamTriangles`-flagged triangles
— i.e. the whole codebase already treats wrapsSeam triangles as needing special orientation-aware
handling, which is the right place for this fix to live, but it is materially larger-blast-radius
than 2.a and needs the synthetic seam-wrapping-curve fixture A4-diagnosis/A4a already called for
(mirroring `MultiCurveCellPolicy.test.ts`'s pattern) before any kernel edit, not a direct patch.

---

## 3. Manifest-fix / winding-fix interaction (DS only — confirmed, they must land together)

B1's own native-vs-corrected pair already demonstrated the interaction directly: the **native**
(domain-overlapping, Finding-1-unfixed) build showed `nonManifoldEdges=3584` and did NOT show the
winding defect as `orientationMismatch` — because with overlapping domains the two regions'
triangulations at a "seam" are NOT actually sharing indices (each region independently meshes
across the full overlapping z-range), so the mismatch presents as a doubled/coincident-loop
non-manifold signature (multiplicity >2) instead of a clean multiplicity-2 orientation clash. Once
Finding 1 is applied (`buildDsChainCorrected`'s non-overlapping domains, real index-adoption at the
boundary), the seam edges become genuinely, cleanly SHARED by index — and it is precisely that
correct sharing which exposes the pre-existing winding mismatch as `orientationMismatches=7168`.
This toy corroborates the same ordering directly: it was built from the start on
`mergeAdoptedAssembly`'s non-overlapping, index-adoption contract (B0's own design, never had
Finding 1's overlap bug), and shows `nonManifold=0, orientationMismatch=32` (32/32 cross-source) —
i.e. "Finding-1-clean + Finding-2-unfixed" always looks like pure `orientationMismatch`, never
`nonManifold`. **Conclusion: the two fixes must land together to reach 0/0** — applying only 2.a
(the winding flip) to a still-overlapping domain would silently leave the doubled-shell geometry in
place (nonManifold stays 3584, unrelated to winding), and applying only Finding 1 without 2.a
leaves the now-exposed 7168 orientation mismatches as the dominant remaining defect (as B1 already
measured). Neither fix subsumes the other; both are required for a clean DS topology reading.

---

## Recommendation

- **DS (2.a):** cheap, safe, research-file-only — apply + re-verify (this probe + B1 Stage 2) as a
  fast follow-up; no production risk, no GitNexus/impact-analysis gate needed since `src/` is never
  touched.
- **Gyroid (2.b):** do NOT attempt directly — build the synthetic seam-wrapping-curve fixture first
  (A4-diagnosis's own next step), scoped to the wrapsSeam+feature-registry leaf-pair interaction
  this diagnosis narrowed, and run GitNexus `impact()` on `FeatureConformingTriangulator.ts` /
  `ConformingWall.ts` before any edit (this session had no GitNexus access — the coordinator should
  run it).
- Treat the two as SEPARATE experiment arms — a unified "seam winding fix" ticket would misdirect
  effort (DS needs one sign flip in one research file; Gyroid needs a scoped kernel repair behind a
  fixture).
