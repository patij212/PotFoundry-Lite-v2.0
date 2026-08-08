# S119 — THE DEGENERACY POLE IS A CASCADE (α ≈ 1.9), AND IT IS NOT A CLIFF PHENOMENON

**2026-08-08.** 6 agents, 1.87 M tokens, 0 errors. All work in the driver
(`research/bridge/_strataConformBisectL.test.ts`). ***Both verifiers confirm zero scope violations —
every scored mesh came out of the driver, no grid seed, no new generator, no offline refiner.***

---

## 0. THE ANSWER — AND IT IS STRUCTURAL

***STRATA-001's degeneracy class is IMPROVED, NOT FIXED.*** Parameter-metric selection shifts every
degeneracy class down **2–4×** and delays the pole by ~one density doubling, but ***leaves the growth
exponent intact:***

> **pole (graphRatio ≥ 100) count ~ N^α : α = 1.992 (control) → 1.810 (treatment)**
> over a **7.7× density range — both ≫ 1.**

***α ≫ 1 IS POSITIVE FEEDBACK. THE POLE IS A CASCADE: bad children create the conditions for more bad
children.*** That is a **structural** defect in the recursion, not a constant per-split failure rate and
not a local emit bug — ***so no guard at the emit site can fix it***, which is exactly why S118's ADMIT
gate cleared the class only by making the headline MAX 2.18× worse.

⭐⭐ ***AND THE POLE IS NOT A CLIFF PHENOMENON.*** **GothicArches has no C0 cliff at all, and its control
still collapses min arc altitude 72.692 → 11.609 → 1.477 nm across the ladder.*** The cliff-centric story
this campaign has told since S115 — including my own framing of it — is wrong. ***The cascade is a
property of the refinement recursion itself.***

⭐ ***A ONE-RUNG A/B WOULD HAVE REFUTED A REAL WIN.*** The apparent **76.6× position penalty is a
single-rung TRANSITION LAG that inverts to a 1.43× WIN by the next rung.*** ***Never A/B a refinement
lever at one density again.***

⭐ ***AND SELECTION BEATS DENSITY ON A STUCK DEFECT.*** The treatment removes CelticTriquetra's
**0.54033 mm** stuck cliff facet — a facet that is **identical at 656 k, 1.28 M and 2.53 M facets**.
***A selector change killed a defect that a 3.9× density increase does not touch.***

## 1. THE SELECTOR — RIGHT METRIC, KILL LINE STILL FIRED

`PF_CB_S119_PARAMSEL` (default OFF, **byte-identical when off on both styles**; flag-OFF controls
reproduce S118's published controls **exactly**, so the A/B is one-variable against a live baseline).

**IT IS THE RIGHT METRIC.** At matched triangle budget (within 5.8%), parameter-metric selection beats
longest-3D by **2.22×** on over-0.01 mm perpendicular AREA (0.3841% vs 0.8532%), **2.40×** on pole AREA,
**1.95×** on scale-free thin area. Longest-3D is what LEPP and the S4 fall-back actually do, and on the
driver's own headline it is **9.9× worse than the control** (1168.622 vs 118.219 µm).

***AND IT IS CHEAPER THAN WHAT IT REPLACES:*** the parameter key needs **zero `rA` evaluations** (two
hypots and a `dTh` on stored coordinates) where max-SAG spends an absolute-pitch lattice per candidate
edge — **0.23× evals per triangle**. Topology untouched in every arm (0 non-manifold, 0 inconsistent
winding).

⛔ ***BUT THE AGENT'S OWN PRE-REGISTERED KILL LINE FIRED: NO-GO.*** CelticTriquetra's mesh-wide **min arc
altitude stays EXACTLY 0.000 nm** — *at birth as well*, so the emitter is still producing zero-altitude
footprints — and the **pole count GREW 1.81×** (3,652 → 6,607).

**Diagnosed cause:** the one line deliberately left 3-D — ***`FLOOR_MM` candidacy (`:2168`, `:2190`)***.
On a cliff facet the two non-crossing edges are already sub-floor **in 3-D**, so the candidate list has
**exactly one member and there is nothing to reorder** — the parametrically-collapsed edge is split again.
⚠ ***That single-candidate step is INFERRED, not counted*** — the candidate-list-size distribution was
never instrumented. **It is the decisive missing measurement.**

**Honest costs reported:** on CT the over-0.01 mm *share* improves 1.335× but the **COUNT rose
45,455 → 57,219** — the share fell only because the mesh carries 2.56× the facets. On Gothic poles fall
**3.77×** by count and min altitude improves 11.037 → 16.316 nm, but **perpendicular MAX gets 1.184×
WORSE** (0.3327 → 0.3940 mm), over its own 1.05× bar, and thin at τ=0.02 **grew 1.87×**.

**Both uninformed placebos decisively refuted:** `rand` → 4.03 M tris hitting the 8 M cap, 4.9× unresolved,
10.5× blade area, 5.5× poles; `short3d` → **24.8× poles**, 44.88% thin area, and a 3-D area **1.90× the
analytic band** (a grossly non-conforming mesh).

## 2. THE CLIFF RULER — AND IT REFUTES S118

Built, **two-sided validated**, and it ***reproduces Gothic digit-for-digit***.

- ***HONEST CelticTriquetra RESIDUAL: 0.3344% of AREA, MAX 0.5404 mm*** — not the graph-ruler's 0.5142% /
  0.8509 mm.
- ⛔ ***S118's "73–83% of the residual is ruler artefact" IS REFUTED: measured 34.97% by AREA, 48.20% by
  count.*** The cliff explains **a third**, not four fifths.
- ⭐ ***CelticTriquetra's C0 set is NOT three medallion rays — it is ~3,000 SEAMS OVER THE WHOLE POT***,
  and the medallion accounts for only **4.6%** of the cleared count. Every prior statement locating CT's
  discontinuity "in the medallion" was wrong about its extent.
- ⚠ Seams with jump < 0.002 mm are **not located**. They cannot move a 0.01 mm verdict, but they are
  exactly the scale that matters at 0.001 mm — so the 0.001 result (95.3180% of area) means *"the cliff
  explains none of it AT THIS minJump"*, not a final number.
- ⚠ Σ was **DISCOVERED by transverse scans, not TRACED**; a branch never bracketed at any scanned level
  would be missed. The structural argument that the located set is the whole set is **inferred from
  reading `styles.ts`**, not proved.

## 3. VERIFICATION

***Both verifiers returned NOT REFUTED*** — and both re-ran the load-bearing checks themselves.

- **Provenance is CLEAN.** `PF_CB_GRIDU=200 / PF_CB_GRIDV=140` are the **driver's own defaults**
  (`:147-148`), used by every historical baseline recipe; Gothic runs the driver's own S39CTL aligned
  seeder. Strongest anchor: the control arm lands on **1,282,394 facets / 48,535.770 mm²** — the published
  S102 baseline **exactly**.
- **The change is in `refineDirected`** — the *only* selector the pop loop calls at `PF_CB_DIRECTED=1`
  (`:3316`) — and every claimed HEAD line number checked out exactly.
- **Flag-OFF byte-identity proved, and re-proved by the verifier** (three md5-identical arms).
- ⚠ The verifiers also found **four reporting defects, one of which materially weakens the NO-GO**, and
  **three factually wrong findings** in the ladder report. ***Those corrections travel with this result.***

⚠ **OPS, and it cost a 1,841 s arm:** a concurrent agent's `npx esbuild` tore down the esbuild service a
live vitest process held through the junctioned `node_modules` — killing an arm with `EPIPE` **after it had
done its full work**. ***The runner guard did not catch it; the log read "1 failed", so a killed arm would
have been read as a result.*** A detector was added.

## 4. WHAT TO DO NEXT

1. ***COUNT THE CANDIDATE-LIST SIZE.*** T1's whole NO-GO rests on an *inferred* single-candidate escape
   hatch at `FLOOR_MM`. Instrument the distribution — it is cheap and it decides the next move.
2. ***ATTACK THE CASCADE, NOT THE EMIT SITE.*** α ≈ 1.9 says bad children beget bad children. Guards at
   emit cannot fix that (S118 proved the cost). The candidates are: move `FLOOR_MM` candidacy into the
   parameter metric (a *refusal* — price it against S118's 2.18× scar), or change the recursion so a
   collapsed footprint cannot be re-selected.
3. ***DROP THE CLIFF FRAMING FOR THE POLE.*** Gothic has no cliff and still collapses. Re-examine every
   pole result that was attributed to C0 geometry.
4. ***NEVER A/B A REFINEMENT LEVER AT ONE DENSITY*** — the 76.6× penalty that inverted to a 1.43× win.
5. Locate CT's sub-0.002 mm seams before any 0.001 mm verdict.
