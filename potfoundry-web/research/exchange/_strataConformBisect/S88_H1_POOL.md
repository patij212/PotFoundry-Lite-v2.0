# S88 — `s85PosRebase` CERTIFIES ON THE H1 WORKER POOL: 5.27× PER ARM, AND THE ndjson IS BYTE-IDENTICAL

**Gate first, speed second.** The pooled Gothic arm reproduces the published `S40AR90.uniform.ndjson`
**byte for byte** — 50,000 rows, 400,000 per-facet values, 0 differing — and so does a same-session serial
control. Only then is the 5.27× worth quoting.

- Wiring: `research/tools/s85PosRebase.ts` (arms became async; `certifyTriangle` moved onto the pool).
- Pool: `research/bridge/_facetTruthPool.ts` / `_facetTruthH1.ts` / `_facetTruthH1Worker.ts` — **reused, not
  rebuilt**. No `new Worker(...)` was written for this. `_facetTruthLib.ts` was NOT touched.
- Flag: `PF_S85_WORKERS`. **DEFAULT 0 = SERIAL**, i.e. the tool's shipped behaviour is unchanged.
- Diff tool: `research/tools/s88RowDiff.cjs` (field-level, `Object.is`).

## Why the default is OFF

`s85PosRebase`'s per-facet ndjson is a **cross-tool reference instrument**: S87's C2 control validates a
different tool against it to the bit (commit `9a6d59ed`). A speedup that moves those rows would silently
break someone else's passing check. So the serial path is not replaced — it is the default, the pool is a
flag, and the control therefore stays permanently available. Flip the default only after the C2 consumer
has re-validated.

## THE REPRODUCTION GATE — `cmp`, not "the aggregates agree"

Every row below is a **byte-for-byte** `cmp` of complete ndjson checkpoints. The published files were
copied from the main checkout into this worktree unmodified.

| arm | mesh | N | serial (this session) | pooled W=6 | published | `cmp` |
|---|---|---|---|---|---|---|
| uniform | LOWPOLY `lowpolyfacet_ring_D--` | 10,000 | 0/10000  0.0000%  max **4.983** µm | identical | 0/10000  0.0000%  4.98 µm | **byte-identical, both** |
| uniform | S40AR90 `gothicarches_ring_DS-HT_S40AR90` | 50,000 | 67/50000  0.1340%  area-fail 0.04009%  max **460.513** µm | identical | 67/50000  0.1340%  460.51 µm | **byte-identical, both** |
| target | LOWPOLY (plane top-300 ∪ tangExc top-300) | 576 | 0/576  PROVEN-PASS 576 | identical | `LOWPOLY.target.ndjson` | **byte-identical, both** |

Field-level diff of the two 50,000-row Gothic files (`s88RowDiff.cjs`, `Object.is` per field):

```
compared 50000 rows x 8 fields = 400000 values
   k 0    area 0    tg 0    p 0    w 0    b 0    v 0    c 0      worst |A-B| 0.000e+0 on every field
*** IDENTICAL — 0 of 400000 per-facet values differ ***
```

Note the second control in that table, which matters as much as the first: **the same-session SERIAL run is
also byte-identical to the published file.** So the refactor did not move the serial path either, and the
serial-vs-pooled comparison is not being made against a moved baseline.

The per-worker rA identity gate fired on every window and reported, every time:

```
99078 (worker x lattice-point) comparisons over 16513 points, 0 differing, max deviation 0.000e+0 mm
```

## THE SPEEDUP — same session, back to back, same box, same background load

Five other researchers' single-threaded jobs (`_run_s81LandFlipGate`, `_run_s87LedgerReexam` ×3) were
resident throughout **both** arms. Nothing was pinned, killed or re-niced.

| measurement | serial | pooled W=6 | ratio |
|---|---|---|---|
| **S40AR90 uniform, N=50,000, full arm** | **2061.7 s** (24.3 facet/s) | **391.3 s** (128.2 facet/s) | **5.27×** |
| S40AR90 uniform, N=2,000, foreground control | 79.3 s (25.9 facet/s) | 18.0 s (124.4 facet/s) | 4.80× |
| LOWPOLY uniform, N=10,000 | 11.4 s (886.1 facet/s) | 6.5 s (1572.8 facet/s) | 1.75× |

**A measurement control I had to run.** A CPU-delta sample 25–45 s into the backgrounded serial arm read
10.59 s user / 20 s wall = 53% of one core — the exact Windows EcoQoS signature this repo has been burned by
before. If that had held for the whole run the 5.27× would be ~2× inflated. It did not: the same serial work
run in the **foreground** measured 25.9 facet/s against the backgrounded arm's 24.3, a 6% gap, and the
backgrounded arm's own throughput ramped only 21.5 → 24.3 facet/s. The early sample was a transient. Both
timing arms were launched identically regardless.

## WHAT CAPS IT — the plane ruler, and it is still single-threaded

Only `certifyTriangle` moved. `areaOf`, `tangExcMono` and `sagAdaptiveRaw` still run in the parent, in walk
order, off the parent's own rA — deliberately, because moving three more rulers onto the identity-proof hook
buys nothing on the styles that matter. The tool now prints its own attribution:

| mesh | blocked on workers | parent-side rows + plane ruler (still serial) |
|---|---|---|
| S40AR90 (fine mesh, expensive certify) | **93.1%** (361.5 s) | 6.9% (27.0 s) |
| LOWPOLY (coarse mesh, cheap certify) | 9.1% (0.6 s) | **90.9%** (5.5 s) |

That is the whole explanation of the 5.27× vs 1.75× split. LowPolyFacet facets are large, so
`sagAdaptiveRaw` runs at level 64 = 2,145 rA evaluations per facet while `certifyTriangle` certifies almost
immediately — the parent-side ruler is 91% of the work and no number of threads touches it. **Amdahl caps
LOWPOLY at ~1.8× and it is already there.** Gothic is the regime the pool was built for.

Windows are overlapped (the next window's workers start before the current window's rows are built),
which took LOWPOLY from 1.39× to 1.75×. It cannot affect a value: windows are disjoint k-ranges with
independent cursors, and rows are still appended strictly in walk order.

## AGAINST CURRENT PRACTICE — and this is where I do NOT meet the brief

The brief projected ~8× pooled and therefore ~2.7× against a practice of ~3 concurrent single-threaded
slots. **I measured 5.27×, not 8×, and the against-practice figure is correspondingly lower.** Measured, not
assumed — three concurrent serial slots were actually run:

```
3 CONCURRENT SERIAL SLOTS, 2,000 facets each : 76 s wall for 6,000 facets = 78.9 facet/s aggregate
```

Against that aggregate:

| pooled deployment | aggregate | vs 3 serial slots |
|---|---|---|
| ONE pooled arm at a time, W=6, production N=50,000 | 128.2 facet/s | **1.62×** |
| ONE pooled arm at a time, W=6, N=2,000 slice | 111.1 facet/s | 1.41× |
| TWO+ concurrent pooled arms | **not measured** | — |

So: **per-arm latency improves 5.27×; lab-wide throughput improves ~1.6× if pooled arms are run one at a
time.** The gap to the brief's 2.7× has two named causes, both mine to state rather than explain away:

1. **W=6, not 16.** The pool's own documented scaling is 7.97× at W=16. I took 6 because five other jobs
   were resident and the brief required headroom. At W=16 on an otherwise idle box the 2.7× is reachable.
2. **Three serial slots barely contend on this box.** They finished in 76 s against 79.3 s for a single slot
   alone — i.e. current practice is *already* getting near-linear aggregate throughput out of the 16 logical
   threads, so there is much less on the table than "8× / 3" suggests. The pool's real product here is
   latency: an arm that took 34 minutes takes 6.5.

Running two pooled arms concurrently (12 workers) would probably recover most of the difference. I did not
measure it, and I did not take the threads to try, so I claim nothing about it.

## Worker count: 6, and why

Xeon E5-2640 v3, 8 physical / 16 logical, 32 GB. Five other researchers' single-threaded research jobs were
running the whole time (verified by process listing, not assumed). 6 workers + 1 parent = 7 of my threads;
with the 5 resident jobs that commits 12 of 16 logical and leaves 4 idle. `PF_S85_WORKERS` is explicit and
does **not** default to `resolveWorkerCount()`: that default (physical cores) is right for a box running one
audit, and this box habitually runs three or more S85 slots at once.

## What makes the pooled row bit-identical — checked, not argued

1. **Same walk.** The `uniform` arm asserts `(k*stride)%nTri === goldenIdx[k]` for **every** k before a
   single facet is certified (`walk-equality gate: all 50000 pool stride indices match goldenIdx`).
2. **Same surface.** Workers rebuild rA from `(style, params, dims)` and the pool refuses the run unless
   every worker's rA is `Object.is`-identical to the parent's over the C0-bracketed lattice. `raFast: false`
   keeps them on `buildRadiusFn`, which is what the serial control used — see below.
3. **Same arguments.** `runH1Walk` remains the only loop body. `sampleCap` is passed as `+Infinity` because
   `certOne` leaves it undefined and `certifyTriangle` defaults it to `+Infinity`; `zJumps`/`thJumps` are the
   parent's, shipped to the workers rather than re-detected.
4. **Same order.** Rows are keyed by **walk index**, which one atomic cursor makes unique across the pool,
   and merged by sorting on it. `mergeH1Rows` throws on a duplicate or out-of-range index rather than
   reporting. `h1Before` and `mergeH1` are untouched.

## Changes to the shared pool (additive, all default-off)

| file | change |
|---|---|
| `_facetTruthH1.ts` | `H1Job.list` (explicit walk list — the `target` arm is a union of two top-K lists, not a progression); optional `emit` callback on `runH1Walk`; `H1RowSink`, `H1RowShard`, `mergeH1Rows` |
| `_facetTruthH1Worker.ts` | `emitRows` / `raFast` workerData flags; ships a transferred struct-of-arrays row shard |
| `_facetTruthPool.ts` | `kStart` (resume), `emitRows`, `raFast`; `PoolOutcome.rows`; **`import.meta.url` guard** — it is empty in an esbuild CJS bundle and `fileURLToPath(undefined)` threw *after* the mesh had been read |
| `_facetTruthRA.ts` | `buildAuditRadiusFn(..., { allowFast })`, default `true` = unchanged |
| `run-s85-pos-rebase.sh` | `--external:esbuild` — the pool uses esbuild's JS API at runtime to bundle the worker entry, and esbuild cannot be inlined into a bundle (it locates a platform binary relative to its own package) |

Every existing caller of the pool (`_strataFacetTruth.test.ts`, `_strataCertD.test.ts`) is untouched:
each new field is optional and each default reproduces the previous behaviour exactly.

## Where I deliberately did NOT weaken determinism, and what it cost

`raFast: false`. `_raFast`'s hoisted twin is a measured 3.17× on ~84% of the certificate's wall clock and
would have made this a much larger number. It is not taken, because `_facetTruthRA.ts` records its own
mutation test proving a divergence confined to a window smaller than the sampling pitch evades **every**
finite upfront sweep — so "the twin has never been caught diverging" is a speedup argument, not a
reproduction argument, and the serial control used `buildRadiusFn`. The 5.27× is therefore a floor, not a
ceiling: a future run that adopts the twin **on both arms** should see substantially more.

## Scoped out, explicitly

- **The `target` arm's whole-mesh pre-pass.** The `target` arm's *certify* is pooled and proven
  byte-identical (576 facets, LOWPOLY). Its dominant cost is the preceding **whole-mesh `sagAdaptiveRaw` +
  `tangExc` pass over all nTri facets** — 1,139,357 facets on a Gothic arm — which is a different kernel and
  is **still single-threaded**. Pooling it is a separate job and would need its own identity gate.
- **Concurrent pooled arms.** Not measured; no claim made.
- **A pooled `sagAdaptiveRaw`.** See the attribution table — it is 91% of the wall on coarse meshes and is
  the obvious next lever for `LowPolyFacet`-class work. Not attempted here.
- **`certifyTriangle`'s cost.** Untouched. `_facetTruthLib.ts` was not modified; the (40,40) descent/Newton
  counts stand.

## Reproducing this

```bash
# serial control (the shipped default)
PF_S85_BUNDLE=1 PF_S85_ARM=uniform PF_S85_TAG=X PF_S85_STYLE=GothicArches \
  PF_S85_STEM=gothicarches_ring_DS-HT_S40AR90 PF_S85_N=50000 PF_S85_RESUME=0 \
  PF_S85_WORKERS=0 bash research/tools/run-s85-pos-rebase.sh

# pooled
PF_S85_BUNDLE=0 ... PF_S85_TAG=Y ... PF_S85_WORKERS=6 bash research/tools/run-s85-pos-rebase.sh

cmp research/exchange/_strataConformBisect/s85rebase/{X,Y}.uniform.ndjson
node research/tools/s88RowDiff.cjs .../X.uniform.ndjson .../Y.uniform.ndjson
```
