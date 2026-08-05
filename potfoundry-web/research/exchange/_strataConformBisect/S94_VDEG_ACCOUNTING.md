# S94 — THE SUPER-HUB GUARD WAS READING A COUNTER THAT ONLY EVER WENT UP

§7 of the state-of-the-campaign doc lists the super-hub runaway as *"a bug, not a limit"*, says
`PF_CB_MAXDEG` exists to make it visible, and records that **"the emitting site is in the last phase of
the split loop and has not been located."** This locates it — and it is not an unguarded emitter.

## Method — enumeration, not reading

`vDeg` is maintained inside `addT` / `killT`, which are the single choke point for triangle creation and
retirement. So every emitter is enumerable by grep rather than by reading 5,000 lines.

**All five `addT` sites:** seed tris (1242), uniform grid init (1280–81), `bisectAt` (1667–68), the
reproject hand-copy (1901–02), `tryFlip` (3670). The two refinement splitters both route through
`shapeAdmits`, which is where the S83 cap lives — the reproject copy's gate was mirrored in on
2026-07-30 for exactly this reason. **There is no unguarded emitter.**

## THE ACTUAL DEFECT — `killT` is the only decrement, and half the kill sites skip it

| site | what it does | effect on `vDeg` |
|---|---|---|
| 1666, 1900, 3893 | `killT(t)` | correct, −3 |
| **`tryFlip` 3669** | inlined `alive=false` + 3×`eDel`, then `addT`×2 | **net +6 per accepted flip** |
| **degenerate drop 3340** | `alive[t] = false` only | **+3 stranded** |
| **collapse path 3780** | `alive[t] = false` only | **+3 stranded** |

`addT` raises `vDeg` on all three corners; only `killT` lowered it. So **`vDeg` was never a degree** — it
was *"triangles ever added minus triangles killed via `killT` only"*, drifting monotonically upward with
flip and collapse volume. A flip is degree-neutral in truth (−1, −1, +1, +1); the counter recorded +6.

**Why it matters:** `vDeg` is read in exactly ONE place — the S83 fan cap at `shapeAdmits` (line 1568).
The guard built to stop the degree-2,550 runaway was reading an inflated number, so it would refuse
splits at facets whose real degree is far below the cap, and its "sane first value ~64" was never
calibrated against a real degree.

**The runaway itself is NOT in doubt.** The 2,550 was measured by the S81/S82 census tools on the
OUTPUT mesh, not from `vDeg`. This bug corrupts the GUARD, not the diagnosis.

## The fix, and why it is byte-identical at the default

Extracted `vDegDrop(t)` and called it at all four kill paths. **`vDeg` has exactly one reader and it is
behind `MAXDEG > 0`, whose default is 0** — so with the cap off nothing reads the counter and no arm can
move. This is a proof by construction, not an A/B: `grep "vDeg\["` returns one write in `addT`, one write
in `vDegDrop`, and one read at 1568.

Deliberately **NOT** routed through `killT` at the two collapse sites: those omit `eDel` as well, and
whether that omission is intentional (`alive[]` is the source of truth, `edgeMap` treated as a superset
filtered by `if (!alive[t]) continue` at every use) is a SEPARATE question. Fixing only the degree
accounting keeps the two from being confounded.

## What this unblocks, and what it does not

`PF_CB_MAXDEG` can now be turned on against a counter that means what its name says. **That is a
prerequisite for the §7 item, not the item itself** — the cap refuses splits, it does not prevent the
fan's birth, and §7's own words are *"preventing the birth is the fix; every repair we have is a
dressing."* Nothing here has yet been run with `MAXDEG > 0`; the first honest arm should re-measure max
degree on Voronoi at a cap of ~64 and report what the driver strands in `unresolved` as the price.

## One hypothesis of mine that was WRONG, recorded

I first suspected the cap was silently inert because `MAXDEG` is nested inside `shapeAdmits`'s
`if (!SHAPE) return true` early-return. It is not: `SHAPE = process.env.PF_CB_SHAPE !== '0'`, i.e.
**default ON**. Checked before reporting; the real defect was one level down.
