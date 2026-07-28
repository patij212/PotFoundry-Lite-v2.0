# STRATA-001 HANDOFF — 2026-07-28

**Goal unchanged:** one shape-agnostic pipeline whose meshes have no point of any triangle further than
0.01 mm (perpendicular) from the true 3-D surface.

Everything below is committed (through `9f2b264e`). The full record is
`research/lab/2026-07-27-facet-truth-reaudit.md` — read its correction table above §0 first, then §14-§17c.

---

## 0. THE ANSWER — do not re-derive this

**The defect is the driver's RANKING FUNCTION.** Five links, each measured independently, several of them
established by refuting an earlier hypothesis:

1. **The surface is density-closable.** Chord error vs cell size falls 1.45-3.2x per halving on every
   refuted style with **no plateau**; at 20 µm cells only 0.002-0.53 % of the wall exceeds the bar. A C0
   jump would hold its height as h→0. None does. (§14c)
2. **The driver is not out of budget.** Baseline runs used 19-65 % of cap. The one run that DID cap
   produced a **byte-identical mesh** to the un-capped one. (§14b, §14f)
3. **The failures are not slivers.** 72-96 % of over-tolerance triangles are well-shaped. (§17b)
4. **The failures are not at the mechanism floor.** 0.00 % (GeoStar) / 0.48 % (Gothic) lie within 10x of
   the 1.5 µm refinement floor. (§17c)
5. **The failures are LARGE facets.** Median longest edge 1714 µm (GeoStar) / 357 µm (Gothic) against
   312 / 189 µm for passing triangles — **1.9-5.5x larger** — carrying 252 / 29 µm median error. (§17c)

GeometricStar's *median* failing facet is **1.7 mm across, sitting 252 µm off the surface**, three orders of
magnitude above the floor, in a run with budget to spare.

**Why:** `sagOfN` measures distance to a triangle's **INFINITE PLANE** on a coarse lattice. That quantity is
small for exactly the facet that spans a feature. The driver cannot see what it is failing to refine.

**Corollaries that close old questions.** §7's bounded-accept hypothesis is refuted (§14f). §13's
"mechanism-limited" verdict is not supported (§14c). §12's "survivors are jump deferrals" is refuted —
GeoStar and Gyroid contain **zero** tread facets (§15c). The unwired M=g/h² work is a *shape* lever, not the
fidelity lever (§17b).

---

## 1. THE NEXT TASK — GPU screen as the driver's ranking function

This is the single highest-value piece of work available and the diagnosis points only here.

**Why it is the right fix.** The instrument already exists, measures TRUE PERPENDICULAR distance rather than
plane distance, cross-validates against the independent CPU auditor **to within 2 points** (GPU 16.75 % vs
CPU H1 18.9 % over-tolerance on GeoStar, §17b), and runs ~42x faster than the CPU ruler it would replace.

**The obstacle is process topology, not algorithms.** The mesher runs in Node under vitest; WebGPU needs a
browser and there is no Node binding in this repo. **The bridge pattern is already proven here** — invert
`research/tools/statusSink.cjs`: the Node driver POSTs candidate triangle batches to a page endpoint, the
page scores them on the GPU and returns the bounds. Batch large enough to amortise the round trip; the sweep
screens 5.16 M triangles in 362 s, so scoring is cheap relative to a 1000-1800 s mesher run.

**Suggested sequence**
1. Prove the bridge on one batch: Node POSTs 1000 triangles, gets back 1000 `[mx, covRad]` pairs, asserts
   they match `screenTriangles` called directly in the page.
2. Wire it behind a flag (`PF_CB_GPU_RANK=1`, default OFF, byte-identical when unset — the existing knobs
   all follow this convention).
3. Run GothicArches and GeometricStar at registry defaults. **Pre-register the falsifier before running.**
4. Judge with the independent auditor at FULL coverage (GPU cert sweep), never the driver's self-report.

**The prediction to beat:** the driver should now spend its budget on the 1.7 mm / 252 µm facets instead of
polishing 200 µm ones. Watch the *max* and the full-coverage uncertifiable rate, not the triangle count.

---

## 2. INSTRUMENTS — all committed, all validated

| file | what it is |
|---|---|
| `research/gpu/gpuRuler.js` | GPU screen. Jump closure (one-sided-limit radial clamp), Gauss-Newton tightening (`gnIters`), adaptive chunking by MEASURED wall-time (`targetMs`), validation error scopes on every dispatch, all-zero guards, pipeline cache. **Cascade capped at n=192** — see traps. |
| `research/tools/gpuCertSweep.js` | Page-side sweep driver. Checkpoints each row to `localStorage`, resumable, **resume key includes the CONFIG** so a settings change re-runs affected rows. Also exports `calibrate()`. |
| `research/tools/statusSink.cjs` | HTTP sink (port 4599) so browser-side jobs leave a trace on disk for a Monitor to watch. |
| `research/bridge/_facetTruthLib.ts` | CPU auditor. H1 certified (1-Lipschitz), H2 witnessed, `distPerp` true perpendicular by descent-then-Newton. |
| `research/bridge/_strataFacetTruth.test.ts` | Drives the auditor over a finished STL (`PF_STRATA_FT=1`). |
| `research/bridge/_strataConformBisect.test.ts` | The mesher. New knobs: `PF_CB_BND_NMAX` (escalating accept, **leave OFF**), `PF_CB_MAXSECS` (wall budget, emits a labelled TIME-CAPPED partial), `PF_CB_PROGRESS` (per-50k-split progress to a FILE), `PF_CB_TAG_SUFFIX` (stops runs clobbering each other). |
| scratchpad `sliverCensus.mjs` | Standalone min-angle / aspect-ratio census on a binary STL. Worth moving into `research/tools/`. |

**How to run the GPU sweep**
```
node research/tools/statusSink.cjs 4599 research/exchange/_strataFacetTruth/gpuSweep.status.log &
# then in the page console at the dev server:
const S = await import('/research/tools/gpuCertSweep.js'); S.run();
```

---

## 3. TRAPS FROM THIS SESSION — these cost hours

1. **Fix by MEASUREMENT, not by hypothesis.** Four consecutive plausible fixes to a GPU device-loss all
   failed because every one reduced *thread count* while the watchdog is tripped by *per-thread duration*.
   One 6-line calibration found it immediately. This is the single biggest time sink of the session.
2. **Per-thread cost in `KERNEL_SCREEN` is O(n²) and depends on `n` ALONE.** Batch size sets how many
   threads run, not how long one takes. Device lost at **n=768 with a batch of TWO triangles**. Hence the
   n<=192 cap. The real fix is a kernel redesign — one workgroup per triangle, each invocation taking a
   stripe of (i,j) plus a workgroup reduction — which would also recover the certifications the cap costs
   (SuperformulaBlossom certifies at 768, not at 192).
3. **Never edit a file under the dev-server root while a BROWSER job runs.** Vite HMR reloads the page and
   kills it. Happened twice. Node jobs are immune (vitest reads the file once at launch).
4. **Long jobs must be durable AT LAUNCH.** There is no agent between turns. Node work → background Bash
   (survives + notifies). Browser work → checkpoint to `localStorage`, be resumable, POST to the sink. A
   ~40-minute sweep was lost to this.
5. **Assert the invariant an optimization must preserve.** Adaptive chunking gave a real 42x AND a
   **false-PASS** cursor bug — `for (…; base += maxTri)` read `maxTri` after the body mutated it, so growth
   SKIPPED triangles and a skipped triangle never enters `survivors`, i.e. is silently CERTIFIED. Caught
   only because a survivor count moved when batching alone cannot move it.
6. **Beware circular measurements.** Correlating slivers with screen SURVIVORS proves nothing: `covRad` is
   the circumradius, which diverges as the angle → 0, so slivers fail the bound by construction. Use the
   MEASURED distance `mx`.
7. **Quote H1 COVERAGE % with every H1 number.** CPU H1 on the REF003 mesh read 7.051 µm with 0
   exceedances — on **2.2 %** of the mesh. Full coverage showed 18.48 % uncertifiable. That number alone
   would have produced the headline "Gothic closed by a one-line config change".
8. **A heartbeat gap is a hint, not proof of death.** Chrome throttles timers in hidden tabs, and a UTC/local
   mismatch between log writer and reader faked an hour-long stall. Trust the EVENT lines.
9. Voronoi is pathologically slow to screen (~hours vs 20-60 s) — expensive `rA` plus ~90 k survivors at
   n=192. Not a hang.
10. `git stash` is unsafe here (concurrent agents); use `git -C <abspath>`.

---

## 4. OPEN / UNFINISHED

- **GPU cert sweep owes 6 rows**: Voronoi (started, killed — slow), GeometricStar, Crystalline,
  GothicArches, CelticTriquetra, BasketWeave. GyroidManifold done (72 905 / 1 132 314 = 6.44 %). The 12
  easier rows are complete: **5 159 492 triangles, 50 007 survivors (0.97 %), 362 s**, LowPolyFacet fully
  CERTIFIED at 0.
- **Task 4 — CPU perpendicular over the survivor set.** Now concretely scoped for the first time
  (275 906 triangles for Gothic REF003) instead of §15e's voided projection. No plumbing exists to feed GPU
  survivor indices into `_strataFacetTruth`.
- **§15e's survivor projection and its "~40 min CPU pass" are VOID** (computed at gnIters=3 with n=768).
- **BasketWeave's H1 651.879 µm may be a ruler-domain artifact** — argmax at z=120.000, the ring's open top
  boundary, and the auditor's surface model is the outer wall. Settle on the solid stage or by excluding
  the boundary row. Do not quote it as a wall defect.
- **The n<=192 cap costs real certifications** (SuperformulaBlossom's 277 survivors cleared at n=768).
- **Slivers are a real, separate defect**: 57-60 % of triangles under 20°, GeoStar 14.4 % under 1°, worst
  aspect 3 567 552. Visible as spikes in renders. Not the fidelity cause, but a print-quality problem, and
  `refineDirected` is the suspect (splits by chord sag not longest edge, and **drops its aspect guard** on
  the fallback path).

---

## 5. STANDING RULES

Measure before proposing fixes. State floors as floors, partial sweeps as INCOMPLETE, and witnessed values
separately from certified bounds. **Judge every mesher change with the independent auditor at FULL coverage,
never the driver's self-report** — the driver said PASS on a mesh the auditor read at 362.888 µm. When two
measurements that must agree disagree, that is the bug report; it found every defect worth finding today.
