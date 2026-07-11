# Arm A4a Verdict — Gyroid orientation seam fix: FAIL/HALT (root cause relocalized to kernel)

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm A4a (prereg Addendum 4). **Verdict: FAIL/HALT,
reported not tuned.** The cheap research-side fix is refuted with proof; the true fix is a kernel
change, now precisely localized. Raw data (gitignored): `research/exchange/tierc/armA4a_*.json`.

## What was tested and why it failed

Hypothesis: `_gyroidContourLib.ts`'s `linkSegments` tears the doubled band-edge contours at u=0/1
(non-periodic weld key), and that tear causes the 645/652 orientation-mismatch seam band.

- **`linkSegments` IS non-periodic** (confirmed by read: weld key on raw (u,t), no `u mod 1`), so
  the hypothesis's premise is true.
- **But it is NOT the binding gate.** `ConformingWall.ts:588-606,809-814` `clipFeaturesToBox`'s
  `uMargin` clip (`1.5/(1<<featureLevel) ≈ 0.000732`) runs unconditionally, once, downstream of
  extraction. `clipLineToInterval`'s run-scan closes each contour piece at the *same* interpolated
  boundary point whether or not `linkSegments` pre-welds across the seam — a run cannot straddle two
  consecutive out-of-range points either way. The clip's own doc comment names the intent: *a
  feature vertex on u=0 would be a T-junction against the wrapping u=1 cells, which the non-periodic
  extraction does not mirror.* So the seam-closure responsibility lives in the kernel clip, not in
  contour linking.
- **Empirical confirmation:** with `periodicU=true`, orientationMismatch went **652 → 654**
  (negligibly worse, ≪ the ≤15 gate). And boundary drifted **360 → 345** (−15), which tripped the
  pre-registered HALT. A full geometric-diff follow-up showed why: the TPMS band-edge level set is
  braided (crosses the seam ~429 times per contour set, not once), so welding re-phases
  `decimateContours`'s greedy walk across ~15.6% of the domain on each side of the seam —
  fidelity-harmless (Newton-worst and coverage stayed **bit-identical**) but incidentally reshuffling
  points near the *mechanism-1* near-tangent cells, not a targeted fix of either mechanism.

## Gate table

| metric | before (off) | after (periodicU=true) | gate |
|---|---|---|---|
| orientationMismatch | 652 | 654 | **FAIL** (need ≤15) |
| boundary | 360 | 345 | **HALT** (drop ⇒ coupled) |
| nonManifold | 3 | 3 | pass |
| outer tris | 2,242,987 | 2,242,786 (−0.009%) | pass |
| Newton-worst | 0.02491654414922634 | 0.02491654414922634 | pass (bit-identical) |
| coverageMax | 0.02531285773363981 | 0.02531285773363981 | pass (bit-identical) |
| CdtStats.outer | {inv:0, drops:0} | {inv:0, drops:0} | no new pathology |

## What was kept

The `linkSegments(segs, weldEps, periodicU=false)` opt-in param is RETAINED (committed): proven
byte-identical when off (element-wise equality assert + real `extractBandedgeContours` hash
bit-for-bit), GitNexus impact LOW (1 direct caller + extractIsolevel, all ≤2 args). It does not fix
orientation alone, but the kernel seam-aware fix will likely need periodic contours to feed it, so
the proven-safe enabler stays available. Not the fix; a prerequisite the kernel arm may consume.

## Redirect (prereg Addendum 5)

The orientation fix is a KERNEL change: `ConformingWall.ts` `clipFeaturesToBox`/`uMargin` + the
`wrapsSeam` stitch must mirror a constraint point across u±1 at the seam (or emit seam-aware
`wrapsSeam` triangles with correct winding). This is shared seam-closure machinery used by every
feature-carrying style — materially larger blast radius than A4a. It needs its own impact analysis
and a synthetic seam-wrapping-curve fixture before touching production. Both A4 remedies (A4a-kernel
orientation + A4b snapMerge holes) are now confirmed kernel-layer, on the same conforming region —
best done as one focused kernel-watertightness batch.
