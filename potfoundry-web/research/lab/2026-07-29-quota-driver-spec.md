# PHASE-1 SWEEP DRIVER — build specification

STRATA-001. Written 2026-07-29 as a **specification only**; no source file was edited producing it.
Brief: `research/lab/2026-07-29-strata-perf-convergence-worklog.md`, sections
"CORRECTIONS TO MY OWN READING" and "THE ARCHITECTURE THIS ALL POINTS AT". Those are premises here, not
re-derived.

Target file: `research/bridge/_strataConformBisect.test.ts`.
Line numbers below are **@ HEAD f76c37c4**; that file is under concurrent edit, so every reference also
gives the marker comment or identifier to anchor on. Anchor on the identifier, not the number.

---

## 0. WHAT IS BEING REPLACED, IN ONE PARAGRAPH

The driver ranks triangles by `sagBounded` (`const sagBounded = (t: number): number =>`, L537) and pops
worst-first from a binary max-heap (`// ─── worst-first refinement ───`, L875–L897). `sagBounded` returns
`wit + gap`; `gap` is the measured 3-D spacing of a lattice of level *n* over the facet, i.e. `~L/n` — a
function of triangle **size**. Ranking on it makes worst-first into largest-first. Measured signature
(R1/A2, GothicArches ring, 400 k cap): plane-ruler p50 **0.000 µm**, 9.6 % of triangles over tol, and the
true-3D auditor reading **86.3 % of the SURFACE** over 10 µm. Perfect facets, unrepresented surface.
R2 then showed conforming adaptive demand is **0.09×–1.07× the 2.5 M cap**, not ~100×. So capacity is not
the first-order constraint and the sizing field is not a rationing device — it is a **termination
predicate**. This spec replaces the key, the heap and the fallback ladder; it keeps the mesh store, the
splitter, `locateKink`, the post-loop cleanup and the topology audit untouched.

---

## 1. THE PREDICATE

### 1.1 The two halves, and what supplies each

| half | existing function | site | cost, rA evals per call |
|---|---|---|---|
| size / fit | `edgeSag(a, b)` | L239, `// ─── EDGE CHORD SAG (the anisotropy driver) ───` | `esN − 1`, where `esN = max(ES_N=8, min(REF_NMAX=64, ceil(|e|/REF_HS)))`, `REF_HS = 0.03 mm` ⇒ **7 … 63** |
| feature crossing | `locateKink(th0, z0, th1, z1)` | L187, `// ─── THE GENERIC 1-D KINK LOCATOR ───` | `(KINK_SCAN+1) + 2·KINK_HALVINGS + 5 = 17 + 48 + 5 = ` **70**, fixed, size-independent (**17** on the early return when the coarse scan finds no `Δ²r` peak) |

Both already exist and are already used by the driver — `edgeSag` inside `refineDirected` (L868),
`locateKink` inside `splitEdge` (L758). Neither needs modification. This is a re-wiring, not new maths.

### 1.2 Conformance test (new, 3 rA evals, derived from the file's own header)

An edge is **conformed** at a located crossing when a vertex of that edge is already on the locus. The
placement accuracy required is stated in this file's own header (L36–39): *"placing the vertex within
~0.6 µm of the crest is REQUIRED"*. So:

```ts
const CONF_MM = envF('PF_CB_CONF_UM', 0.6) / 1000;   // NEW lever, default from the header's own number

interface EdgeVerdict { sag: number; kink: Kink | null; conformed: boolean }

// P(t*) = the 3-D point at the located crossing.  edgeParam already returns (θ,z); one R() gives r.
const crossPoint = (a: number, b: number, tStar: number): P3 => {
  const [th, z] = edgeParam(a, b, tStar);           // L149, existing
  const thc = canon(th); const r = R(thc, z);       // 1 rA eval
  return [r * Math.cos(thc), r * Math.sin(thc), z];
};

const conformed = (a: number, b: number, k: Kink): boolean => {
  const p = crossPoint(a, b, k.t);
  return Math.min(
    Math.hypot(vx[a] - p[0], vy[a] - p[1], vz[a] - p[2]),
    Math.hypot(vx[b] - p[0], vy[b] - p[1], vz[b] - p[2]),
  ) <= CONF_MM;
};
```

Note this **replaces `SNAP_ALPHA` as the conformance criterion**. `SNAP_ALPHA = 0.12` is a *relative*
sliver guard, and correction #3 of the worklog names it as the Zeno mechanism: once a vertex sits near a
crease every later crossing has `t` inside the band, SNAP declines, and midpoint bisection marches into
the weld wall. `CONF_MM` is absolute, so it *terminates*: once a vertex is within 0.6 µm, the edge is
conformed and stays conformed however short it gets. `SNAP_ALPHA` survives only as the sliver guard on
*where a new vertex may be placed* (§4, R4).

### 1.3 The exact accept condition

```ts
// One action per pop. Conformance first (density cannot buy locus placement), size second.
type Need = 'none' | 'conform' | 'size';

const triangleNeed = (t: number): { need: Need; edge: 0 | 1 | 2; cls: SizingClass } => {
  const es: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
  let worstCls: SizingClass = 'smooth';
  let confEdge = -1;
  for (let e = 0; e < 3; e += 1) {
    const v = edgeVerdict(es[e][0], es[e][1]);       // memoised, §1.5
    if (v.kink === null) continue;
    worstCls = v.kink.jump ? 'jump' : worstCls === 'jump' ? 'jump' : 'crease';
    if (!v.conformed && confEdge < 0) confEdge = e;
  }
  if (worstCls === 'jump') return { need: 'none', edge: 0, cls: 'jump' };   // §3 — STOP, do not refine
  if (confEdge >= 0) return { need: 'conform', edge: confEdge as 0|1|2, cls: worstCls };
  let bs = 0; let be = 0;
  for (let e = 0; e < 3; e += 1) {
    const s = edgeVerdict(es[e][0], es[e][1]).sag;
    if (s > bs) { bs = s; be = e; }
  }
  if (bs > acceptTol) return { need: 'size', edge: be as 0|1|2, cls: worstCls };
  return { need: 'none', edge: 0, cls: worstCls };
};

// ACCEPT  ⟺  need === 'none'.
```

`acceptTol` is the existing `PF_CB_ACCEPT` (default 0.007 mm against `TOL = 0.01`). Keep the 30 % margin:
the predicate is a 1-D **lower** bound (§6.1), so margin matters more here, not less.

### 1.4 Cost, against today

| | rA evals per accept test |
|---|---|
| today, `sagBounded` (`PF_CB_RANK=bounded`, default) | `lat(12) = 91` minimum; escalates by prediction to `lat(24)=325`, `lat(48)=1 225`, `lat(96)=4 753`, `lat(192)=18 721`. The driver's own comment at `PF_CB_MAXSECS` (L946) prices it at **~6 600 per triangle** |
| today, `sagPtPerp` (R1b arm) | `lat(n)`, `n ∈ [12,64]` ⇒ **91 … 2 145** |
| **this predicate, cold** | `3 × edgeSag` (21…189) + `3 × locateKink` (51…210) + `≤3` conformance points ⇒ **75 … 402** |
| **this predicate, memoised (§1.5)** | each edge evaluated once, shared by its two incident triangles ⇒ **~38 … 201**, typical mid-refinement (0.2–0.6 mm edges) **≈ 130** |

**16×–50× cheaper than the current default, and the cost is bounded**: `3·63 + 3·70 + 3 = 402` is a hard
ceiling, whereas `sagBounded` has no ceiling below 18 721 and its expected cost *rises* as the run
proceeds (escalation fires on near-tol triangles, which is most of them late).

### 1.5 The per-edge memo (mandatory, and it is provably sound today)

The driver already establishes the invariant this needs, in the "RE-QUEUE THE SURVIVOR WITHOUT
RE-MEASURING IT" comment (L970–L978): *"vertices are never moved, and `killT`/`addT` never rewrite a live
triangle's corners during refinement"*. `edgeSag` and `locateKink` are pure functions of two vertex indices
and their coordinates. Therefore:

```ts
const edgeCache = new Map<number, EdgeVerdict>();     // keyed by eKey(a,b) — the same key edgeMap uses
```

* populate in `edgeVerdict(a,b)`; evict in `eDel` when the edge's incident list empties (`eDel` already
  deletes the `edgeMap` key at exactly that moment, L171 — piggyback there, one line).
* Halves the predicate cost, since every interior edge is tested by two triangles.
* **The invariant is broken by §4's vertex MOVE.** That is the single hazard; §4.3 specifies the
  invalidation, and §6.5 specifies the verification gate. Do not land the memo and the move in the same
  commit.

---

## 2. THE WORK LIST — A PLAIN FIFO

### 2.1 Justification

1. **The target is L∞.** `max over the surface of d(·, mesh) ≤ tol`. A max is order-insensitive: *every*
   violating triangle must be fixed. No order can terminate with a known violator outstanding, so ordering
   cannot move the fixed point of the predicate. (It moves the *mesh* — bisection is path-dependent — but
   not the set of surviving violations, which is empty under any order that runs to drain.)
2. **The heap's only product is the anytime property, and it is worthless here.** Stop early and you have
   fixed the worst first — but 400 µm and 900 µm are equally unshippable and the STL is equally unusable.
   There is no partial credit at a binary product bar.
3. **Greedy-on-current-error is the wrong greedy anyway.** It ranks by how *bad* a triangle is, not by how
   much a split *improves* it. Those diverge exactly at the class boundary: smooth improves 4× per split
   (h²), crease 2× (h¹), jump 1× (h⁰). Worst-first therefore preferentially feeds budget to the class where
   splitting helps least — which is literally what A2 did (574 025 weld-refused splits at h⁰ sites).
4. **The measured failure is deleted rather than patched.** `gap ~ L/n` is size-monotone; C1 says that is
   what turned worst-first into largest-first. Removing the key removes the failure mode. A threshold has
   no key to be biased.
5. **A size-correlated quantity is *fine* as a threshold.** `edgeSag ≈ κL²/8` is also size-correlated —
   ranking on it would be largest-first too. It is admissible here **only because it is compared against a
   constant**, never against another triangle. Say this in the code comment; it is the crux and it is easy
   to lose.
6. **Starvation-free.** FIFO latency is bounded by queue length. The heap starved small-bad triangles
   behind large-fine ones: A2 finished with **228 063 left, worst-left 1 025.9 µm**.
7. **Batchable.** A FIFO generation is a set of mutually independent work items. That maps directly onto
   the worker pool precedent (`_facetTruthPool.ts`, measured 5.26× at 8 workers) and onto the GPU screen.
   A heap is inherently serial.

### 2.2 Data structure

Not `Array.shift()` (O(n)). A ring buffer over `Int32Array`, grown by doubling, with a **generation
marker** so sweeps stay observable:

```ts
let q = new Int32Array(1 << 16); let qHead = 0; let qTail = 0; let qGenEnd = 0; let sweep = 0;
const qPush = (t: number): void => { /* grow by doubling when full; q[qTail++ & mask] = t */ };
const qPop  = (): number => q[qHead++ & mask];
const qSize = (): number => qTail - qHead;
```

Memory: one Int32 per entry vs the heap's `number[] heapT` **plus** `number[] heapK` (two double arrays).
At 2.5 M entries that is ~10 MB against ~40 MB, plus V8 growth slack on both `number[]`s — and the heap's
entry count is cumulative pushes, not live triangles.

Duplicates are impossible by construction: entries come only from `created` (fresh `addT` ids) plus the
re-enqueued survivor, which was just popped. Dead entries *are* possible (`bisectAt` splits every incident
triangle, killing queued neighbours) — the `alive[t]` check at pop already handles this, exactly as today.

### 2.3 The loop

```ts
for (let t = 0; t < ta.length; t += 1) qPush(t);      // replaces `for (…) consider(t)` at L936
qGenEnd = qTail;
while (qSize() > 0) {
  if (ta.length >= triCap) { capped = true; break; }
  if (MAXSECS > 0 && (iters & 1023) === 0 && (Date.now() - t0ms) / 1000 > MAXSECS) { timeCapped = true; break; }
  const t = qPop();
  if (qHead > qGenEnd) { sweep += 1; qGenEnd = qTail; /* progress line here */ }
  if (!alive[t]) continue;
  const nd = triangleNeed(t);
  if (nd.need === 'none') { if (nd.cls === 'jump') curtainDefer(t); continue; }   // §3
  created.length = 0;
  refineOne(t, nd);                                   // §3 — class-routed, ONE action
  for (const nt of created) qPush(nt);
  if (created.length > 0) { if (alive[t]) qPush(t); unresolved.delete(t); }
  else { stuck += 1; unresolved.set(t, worstEdgeSag(t)); }   // §2.4
  iters += 1;
}
```

### 2.4 What is DELETED

| deleted | site |
|---|---|
| `heapT` / `heapK` / `hswap` / `hpush` / `hpop` | L876–L897 |
| `lastKey`, `keyInversions`, the `kTop > lastKey` inversion count | L944–L945, L963–L964; report line L1461 |
| `bsReuse` / the "re-queue the survivor without re-measuring" `hpush(t, kTop)` path | L980. A FIFO has no key to reuse; the survivor is simply re-enqueued and re-tested next time round, at ~130 evals instead of ~6 600 |
| `heapLeftMax` / "worst-left" | L1003–L1004; see §2.5 |
| `pend` / `flushGpu` / the in-loop `PF_CB_GPU_RANK` batching | L898–L935, L958. The GPU moves to Phase 2 (§5) |
| the `NUDGE_LADDER` fallback at the bottom of `splitEdge` | L819 — see §4.4 |

### 2.5 What MUST SURVIVE — this is the stop-rule soundness

Do not lose any of these. They are the entire reason an empty work list is not a lie.

* **`unresolved: Map<number, number>`** (L943) — popped over-tolerance, refinement produced nothing, never
  re-queued. Under the FIFO the recorded value changes from "the heap key it was popped at" to
  `worstEdgeSag(t)` (the predicate value, already computed). Semantics identical: *this triangle violated
  and no mechanism could act on it.*
* **The survivor filter** (L1007–L1008): `for (const [t, k] of unresolved) if (alive[t])` — a recorded
  triangle can be re-meshed later by a neighbouring edge split, and those are genuinely resolved.
* **`stuck`** (L988) and its report line.
* **`capped` / `timeCapped` / `triCap` / `MAXSECS`** (L938, L953, L960, L966).
* **The NOT-CONVERGED verdict** (L1403):
  `verdict = headlineMax > TOL ? 'FAIL' : (unresolvedLeft > 0 || capped || timeCapped) ? 'NOT-CONVERGED' : 'PASS'`
  — extended in §3.4 with a fourth state, never weakened.
* **`FLOOR_MM` guard** — today at the head of `consider` (L908). Moves into `refineOne`: an edge shorter
  than `FLOOR_MM` is not a split candidate.

**"worst-left" genuinely disappears and that is a real loss.** With no key, a time-capped run cannot report
the worst residual for free. Replacement: on `capped`/`timeCapped`, walk the remaining queue once and
report `queueLeft` plus `max worstEdgeSag` over live entries — one bounded pass at ~130 evals each. Report
it as **`worst-left (edge ruler, LOWER BOUND)`**, never as a residual estimate.

---

## 3. CLASS ROUTING

### 3.1 Where the decision belongs

`locateKink` already returns the class — `interface Kink { t; big; ratio; jump }` (L186) — and the driver
already computes it in the right place and **throws it away**:

```ts
// _strataConformBisect.test.ts L756–L764, inside splitEdge:
if (SNAP) {
  const k = locateKink(vth[a], vz[a], vth[a] + dTh(a, b), vz[b]);
  if (k !== null && k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA) {
    if (k.jump) nJump += 1;          // <<<< THE EXACT SITE. The class is known here and only counted.
    nSnap += 1;
    if (bisectAt(a, b, k.t, true)) return true;
  }
}
```

That site is **too late for the routing decision** and must not be where it lands, for two reasons:

1. By the time `splitEdge` is called, `refineDirected`/`refineLepp` has already *chosen* to split. A
   jump-class triangle must never be entered into refinement at all — the decision has to be at triangle
   scope, before edge selection.
2. The `k.t > SNAP_ALPHA` band gates the whole block. A jump whose crossing lands within 12 % of an
   endpoint falls straight through to midpoint bisection with the class discarded. That is precisely the
   Zeno path of worklog correction #3.

**The routing decision belongs in `triangleNeed` (§1.3)**, which is called once per pop before any split.
`splitEdge` keeps `nJump` as a *counter only* and its `locateKink` call is replaced by a read of the cached
`edgeVerdict` — deleting a duplicated 70-eval probe per split.

### 3.2 The three routes

```ts
const refineOne = (t: number, nd: { need: Need; edge: 0|1|2; cls: SizingClass }): void => {
  const es: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
  const [a, b] = es[nd.edge];
  if (eLen(a, b) < FLOOR_MM) { /* fall through to the next-longest candidate, else refuse */ }

  if (nd.cls === 'jump') return;                       // unreachable: triangleNeed already returned 'none'

  if (nd.need === 'conform') {                         // CREASE → DIRECTED + SNAP, at the cached crossing
    const k = edgeVerdict(a, b).kink as Kink;
    if (k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA) { if (bisectAt(a, b, k.t, true)) return; }
    weldWall(t, a, b, k, 'crease');                    // §4
    return;
  }
  // SMOOTH (or a fully-conformed crease) → BISECT TO SIZE at the midpoint, aspect-guarded.
  // Edge choice is max edgeSag among candidates ≥ FLOOR_MM with ls[e]*AR >= lMax (refineDirected's guard, L867).
  if (bisectAt(a, b, 0.5, false)) return;
  weldWall(t, a, b, null, 'smooth');                   // §4
};
```

| class | route | mechanism reused |
|---|---|---|
| `smooth` | bisect to size — midpoint split of the max-`edgeSag` edge, aspect guard `ls[e]*AR >= lMax` from `refineDirected` (L867) | `bisectAt(a,b,0.5,false)` |
| `crease` | DIRECTED + SNAP — split at the cached `k.t`, `feat = true` | `bisectAt(a,b,k.t,true)` |
| `jump` | **STOP.** Tag for the curtain stage. Do not refine, do not enqueue, do not count as unresolved | `curtainDefer(t)` |

`PF_CB_DIRECTED` / `PF_CB_SNAP` stop being global mode switches and become *ablation* switches (§7.3).

### 3.3 The curtain tag

```ts
interface CurtainSite { tri: number; th: number; z: number; jumpMm: number; sweep: number }
const curtainSites: CurtainSite[] = [];
const curtainDefer = (t: number): void => { /* record the located crossing points of the jump edges */ };
```

Consumer is a separate STAGE, exactly as `compileFeatureCurtain` and the DragonScales ring-strip emitter
already are — keyed by a *detected* feature, not by a style id, so shape-agnosticism holds. Phase 1 only
tags and stops. R2 prices BasketWeave's honest jump demand at **0.138 M curtain triangles** against a
straddling "demand" that diverges under grid refinement (1.91× per doubling); that is the whole argument
for tagging rather than refining.

**Stickiness (required, see §6.3).** `locateKink`'s two-scale window is `w = 1/KINK_SCAN` **of the edge**,
so it shrinks with the edge and the same physical feature can reclassify smooth→crease→jump across sweeps.
Curtain deferral is terminal and unrecoverable, so it must not fire on a single noisy reading:

* seed a per-cell class map from Phase 0 (`sizingFeasibility`'s `byClass` + the two-grid **persistence**
  verdict — GothicArches' jump share fell 31.4 % → 6.1 % under refinement, BasketWeave's did not);
* require **two consecutive sweeps** of jump verdicts at the same site, *or* a Phase-0 persistent-jump
  cell, before deferring;
* otherwise treat as crease.

### 3.4 Verdict, extended

```ts
const verdict =
    headlineMax > TOL                                  ? 'FAIL'
  : (unresolvedLeft > 0 || capped || timeCapped)       ? 'NOT-CONVERGED'
  : (curtainSites.length > 0 && !curtainStageRan)      ? 'DEFERRED-TO-CURTAIN'
  :                                                      'PASS';
```

Jump-class facets **must not** land in `unresolved`. If they did, every BasketWeave run would report
NOT-CONVERGED forever for a reason no bisection driver can ever fix, and the signal would be worthless.

---

## 4. THE WELD WALL

`WELD_MM = PF_CB_WELD_UM / 1000 = 0.05 µm = 50 nm` (L91). `addV` (L125) welds any new vertex within that
3-D radius onto an existing one and sets `addVNew = false`; `bisectAt` (L729) then refuses the split under
`NOWELD`. A2 logged **574 025 refusals** (≈ 60–100 k *distinct sites* — worklog correction #2: the
11-offset `NUDGE_LADDER` counts every collision) and **58 facets the splitter could not subdivide at all,
worst 1 368.3 µm**.

### 4.1 The four distinct refusals — today they are one code path

| id | condition | site | meaning |
|---|---|---|---|
| R1 | `m === a \|\| m === b` | L725 | the split point welded onto **this edge's own endpoint** |
| R2 | `!addVNew` and the weld partner ∉ {a,b} | L729 | topological pinch — some **unrelated** vertex is within 50 nm |
| R3 | the split point equals an incident triangle's apex | L734–L737 | both replacement triangles would be degenerate |
| R4 | `k.t ≤ SNAP_ALPHA` or `k.t ≥ 1 − SNAP_ALPHA` | L759 | crossing too near an endpoint — SNAP declines; **this is the dominant Zeno case** |

### 4.2 Route per class

```ts
const weldWall = (t: number, a: number, b: number, k: Kink | null, cls: SizingClass): void => { … };
```

* **jump** → curtain route (§3.3). Never nudge, never lower anything. Unreachable from `refineOne` by
  construction; present as a defence in case a class flips between sweeps.
* **crease, R4 or R1** → **SNAP-TO-LOCUS VERTEX MOVE** (§4.3). The crossing is within `SNAP_ALPHA·|e|` of
  endpoint `v ∈ {a,b}`; instead of creating a vertex there, *move `v` onto the crossing point*. This
  conforms the edge exactly, creates no vertex, cannot collide, and **terminates in one step** — there is
  no geometric march, which is the entire pathology being removed.
* **crease, R2 or R3** → **CONFORMED-BY-PROXIMITY.** A weld partner within 50 nm of the wanted locus point
  means the locus already passes within 50 nm of an existing vertex — **12× tighter** than the 0.6 µm the
  header calls sufficient (`CONF_MM / WELD_MM = 0.6 / 0.05`). Mark `edgeVerdict.conformed = true`, count
  `nProximity`, stop refining this edge
  *for locus reasons* (it may still need size work). Do **not** nudge — nudging here is what manufactures
  the >2-incidence pinch the guard exists to prevent.
* **smooth** → **LOG AS A BUG.** A smooth midpoint that welds means two independent refinement fronts
  converged to within 50 nm on a patch with no feature. Record `(t, a, b, |e|, edgeSag, weld partner j,
  |partner − midpoint|)` to a bounded ring buffer (cap 256) and print it. It is a splitter defect, not a
  geometry fact, and it must be visible rather than silently absorbed.

### 4.3 What the vertex MOVE would take (the driver does not have this today)

Collapse exists only as a **post-loop** pass (`// ─── LINK-CONDITION-SAFE NEEDLE COLLAPSE ───`, L1039–L1170,
gated by `PF_CB_SAFE_COLLAPSE`). There is no in-loop vertex mutation of any kind. Required, in order:

1. **Write the coordinates.** `vth[j]`, `vz[j]`, `vx[j]`, `vy[j]`, `vFeat[j] = true`. Trivial.
2. **Rehash.** `gcell` (L123, L138–139) is insert-only. Add `removeFromCell(j, oldX, oldY, oldZ)` and
   re-insert at the new key. ~10 lines.
3. **Validity — revert on inversion.** Moving a vertex can invert an incident triangle. Compute the signed
   area of every incident triangle in shortest-arc (θ,z) coordinates *before and after*; if any sign flips
   or `|area|` falls below `AREA_EPS`, **restore the old coordinates and treat as R2** (conformed-by-
   proximity). The `cr(...)` cross-product helper inside `tryFlip` (L1095) is the right primitive; hoist it
   out of the collapse block to module scope, unchanged.
4. **Incident-triangle lookup.** Phase 1 has none — `vTris` is built only inside the collapse pass (L1066).
   Do **not** add a persistent `Map<number, Set<number>>`: at 1.25 M vertices × ~6 that re-opens the V8
   2²³ Map-cap failure this file has already hit three times (edgeMap L153–157, seenE L1121–L1125,
   detectSelfIntersections). Build a **CSR adjacency in `Int32Array`s, rebuilt at each sweep boundary** —
   O(T) counting sort over `ta/tb/tc`, no hashing, no per-entry object. Between rebuilds, a move's incident
   set is (CSR entry) ∪ (triangles created this sweep touching `j`, tracked in a small side list).
5. **Move budget.** Cap the displacement at `SNAP_ALPHA · |e|` (the same 0.12 that gated the split — reused
   as a *bound on motion* rather than a refusal). It is a bounded move by construction: the crossing lies
   on the edge.
6. **One move per vertex per sweep.** First claim wins; a second edge wanting the same vertex treats it as
   conformed-by-proximity. Two loci pulling one vertex would otherwise oscillate forever, and a FIFO gives
   it unlimited opportunities to do so.
7. **Invalidate.** Evict `edgeCache` for **every edge incident to `j`**, and re-enqueue every incident
   triangle. This is the memo-soundness break named in §1.5; get it wrong and the driver silently believes
   stale verdicts — the exact shape of the Voronoi hash-desync bug. See §6.5 for the gate.

Counters: `nSnapMove`, `nSnapMoveReverted`, `nProximity`, `nSmoothWeldBug`.

### 4.4 `WELD_UM` MUST NEVER BE LOWERED. THE NUDGE LADDER MUST NEVER BE RETRIED.

**`WELD_MM` is not a resolution knob — it is the definition of point identity, and the audit shares it.**
`analyze()` (L1181–L1194, `wIndex`) position-welds at the *same* `WELD_MM` because a slicer position-welds
too; that is what "watertight" means downstream. Lower it and the audit's definition of watertight moves
with it. You would be trading a certificate for a split.

**Each halving buys exactly one useless split.** The refused split point converges geometrically toward its
weld partner, so halving the radius admits exactly one more halving before the identical collision recurs.
The measured residual at those sites is **1 368 µm at a demanded resolution of 50 nm — a 27 000 : 1
feature-to-element ratio**. No C¹ surface asks for that; `sagBounded`'s own comment (L316–L318) says a
feature-spanning facet *can never be accepted* and "names the loci that need a curtain rather than
density". Closing 1 368 µm → 10 µm needs ≥ log₂(137) ≈ 7.1 halvings, i.e. ≥ 2⁷ = 128× local triangles, and
under h⁰ the residual does not fall at all. It is not a resolution problem, and `WELD_UM` is not the lever.

**`NUDGE_LADDER` is deleted, not tuned.** It is the 11-offset list at L106–L107 consumed at L819. It turns
one refusal into 11 rA-eval-bearing attempts and 11 hash probes (this is the 574 025 ÷ ~11 inflation), and
its *successes* are worse than its failures: it places a vertex up to 35 % of the edge away from where the
geometry asked for it, manufacturing exactly the misplaced facets the V7b fixture (402.230 µm) measures.
Under `PF_CB_DRIVER=sweep`, `PF_CB_NUDGE` is inert and the report says so.

---

## 5. TERMINATION AND THE CERTIFICATE

### 5.1 Phase 1 ends when the FIFO drains — and that is NOT a pass

A drained FIFO means exactly: *no live triangle violates the local predicate.* The predicate is a 1-D edge
sagitta sampled at `REF_HS = 0.03 mm` plus a kink probe at 16 coarse bins. It is a **lower bound** on the
facet-interior point-to-triangle quantity the auditor judges (§6.1). Phase 1 therefore reports a
**trajectory**, never a verdict:

```
PHASE 1  sweeps 7   in 28 000 → out 1 341 992 tris   splits 656 996
         snap-splits 41 233   snap-MOVES 9 118 (reverted 61)   conformed-by-proximity 3 402
         curtain-deferred 0 sites   smooth-weld BUGS 0
         unresolved 0   capped no   time-capped no
         *** DRAINED — this is a PREDICATE fixed point, not a certificate. Phase 2 decides. ***
```

### 5.2 Phase 2 — one batched honest pass

| tier | engine | role |
|---|---|---|
| triage, 100 % coverage | GPU screen — `openGpuRank` / `gpu.score(xyz9, nTri)` (`research/bridge/_gpuRankBridge.ts`, `research/gpu/gpuRuler.js`) | 164 M rA/s measured, 152× single-core JS; cross-validated against the independent CPU auditor to **0.012 points at 100 % coverage** (2026-07-28). Returns `[maxPerpDist, covRad]` per triangle |
| confirmation | CPU H1 — `runH1Walk` / `_facetTruthPool.ts`, `PF_FT_WORKERS=8` | the argmax top-K (`PF_FT_TOPK`) plus the V-fixtures. 5.26× at 8 workers, byte-identical to serial |

Static batches, embarrassingly parallel, no in-loop coupling — this is the P3 re-aiming: the GPU is the
*certificate engine*, not the ranker. `gpu.parityUm` must be checked and printed; the CPU side keeps using
`buildAuditRadiusFn` (`_facetTruthRA.ts`) so the two paths do not share an rA implementation.

### 5.3 Feedback — local h tightening from the measured slope

Measured decay is **1.45×–3.2× per halving, with no plateau** (worklog §7 / R1). For a facet failing at
`E > tol`:

```
k = ceil( log2(E / tol) / log2(s) )        halvings needed
h_target = h_current / 2^k
```

Use the **pessimistic** `s = 1.45` unless a local slope has actually been measured at that site (measure it
by re-certifying one child after the first halving; then switch to the measured `s`).

Worked, at `E = 400 µm`, `tol = 10 µm`: `log₂40 = 5.32`. Optimistic `s = 3.2` ⇒ `k = ceil(5.32/1.678) = 4`
⇒ **16× local triangles**. Pessimistic `s = 1.45` ⇒ `k = ceil(5.32/0.536) = 10` ⇒ **1 024× local
triangles**. That spread is the single largest cost risk in this design and §6.2 treats it.

Re-seed the FIFO with **only** the failing facets and their 1-ring, carrying a *local* `tol_i = tol` and a
local `acceptTol_i` scaled to `h_target`. Do **not** tighten the global `acceptTol` — that is the escalating
accept lever that R1 refuted (5.4× the cost for a byte-identical mesh).

### 5.4 Outer loop — two or three iterations, with explicit exits

```
for it in 1..OUTER_MAX (default 3):
    Phase 1 sweep to drain (seeded set only, after it = 1)
    Phase 2 batched certificate
    if PASS: exit PASS
    if predicted post-tightening count > triCap: exit INFEASIBLE-AT-CAP
    if max_it > max_{it-1} / 1.3 and tris_it > 1.5 * tris_{it-1}: exit NON-MONOTONE
    tighten locally, re-seed
exit NOT-CONVERGED (outer budget)
```

| exit | condition | reported |
|---|---|---|
| `PASS` | GPU screen max ≤ TOL at 100 % coverage **and** CPU H1 confirms the top-K ≤ TOL **and** `unresolvedLeft = 0` **and** `curtainSites` all consumed | max, coverage, tri count, sweeps, outer iterations, `gpu.parityUm` |
| `DEFERRED-TO-CURTAIN` | as PASS but `curtainSites.length > 0` and the curtain stage has not run | the site list, `nCurtain` predicted by Phase 0 |
| `NOT-CONVERGED` | `unresolvedLeft > 0`, or `capped`, or `timeCapped`, or outer budget exhausted | which of the four, plus the per-iteration max/tri-count trajectory |
| `INFEASIBLE-AT-CAP` | the tightening implied by Phase 2's failures predicts a count over `triCap` | predicted count, cap, the offending region. **Never loosen `tol`** — 0.01 everywhere, no concessions. Raise the cap or tile |
| `NON-MONOTONE` | the max failed to fall by ≥ 1.3× while the triangle count rose ≥ 1.5× | the trajectory. This is the signature of h⁰ content misclassified as crease |

Phase 0 (`sizingFeasibility`, `research/bridge/_sizingFeasibilityLib.ts` via
`research/tools/sizingFeasibility.mjs`) runs **before** any of this and prints predicted `nConfIso` /
`nConfAnisoAR` / `nCurtain` against `triCap`, plus the per-class shares and the two-grid persistence
verdict. Price against the **isotropic** column (0.09×–1.07× cap), never the directed one — `refineDirected`'s
aspect guard cannot cash AR-8 today.

---

## 6. WHAT COULD GO WRONG

### 6.1 The predicate WILL under-call. This is the central weakness.

Edge sagitta is 1-D; the auditor's quantity is point-to-triangle over the facet **interior**. Two failure
shapes:

* **Slivers / straddling facets.** For a well-shaped triangle on a smooth patch the interior max and the
  max edge sag agree to a small constant. That constant is unbounded for slivers and for any facet whose
  feature crosses the interior without crossing an edge at a sampled point.
* **Sub-pitch features.** The V5 fixture is the deterministic proof. *(Precision note: the brief describes
  V5's 5.552 µm as an "edge ruler" reading — it is actually `oldRulerMax`, the facet-**interior**
  barycentric plane ruler at pitch 0.03 mm, `n ∈ [12,64]`, `_strataFacetTruthValidate.test.ts` L74–L103.
  The point survives and gets stronger, because the edge predicate is coarser still.)* V5 builds a crest of
  half-width `0.4 × samplePitch ≈ 10 µm` placed exactly half-way between sample columns; the interior ruler
  reads **5.552 µm** and H2 reads **391.661 µm** — 70×. Against the Phase-1 predicate on the same facet
  (arc 1.414 mm): `edgeSag`'s `esN = 48` ⇒ pitch **29.5 µm** on a 20 µm-wide crest, and `locateKink`'s
  coarse scan is 16 bins ⇒ **88 µm** bins, so the `Δ²r` argmax almost certainly never sees the crest and
  the two-scale test returns *smooth*. **Both halves of the predicate miss it.** Under-call is not a
  possibility, it is a certainty on features narrower than the pitch.

**The design answer is Phase 2, and only Phase 2.** This is why "the soundness of the whole architecture
lives ONLY there" is a load-bearing sentence and not a slogan. Corollary: the driver's self-report block
must keep the "NOT the verdict" framing it already has (L1487–L1488), and the pass bar is the auditor.

### 6.2 How many outer iterations that plausibly costs

The predicate pitch *does* follow `h` down: for `|e| < ES_N·REF_HS = 0.24 mm`, `esN` floors at 8 and the
pitch becomes `|e|/8`, which shrinks with the edge. So a sub-pitch feature is eventually caught — the
question is only how many halvings, and over how much area.

* Feature already resolved by the initial grid (Voronoi, HarmonicRipple, SpiralRidges — all grid-converged
  at 0.95–1.00× in R2): **2 outer iterations**, the second confirming.
* Feature narrower than `REF_HS` (V7c's 8 µm ridge; GothicArches' ribs): reaching pitch = 8 µm needs
  `|e| ≈ 64 µm`, i.e. **~4.5 halvings from a 1.4 mm edge** — cheap *per site*. **3 outer iterations.**
* **What would make it not converge**, in descending likelihood:
  1. **The failing set is large and the local slope is pessimistic.** 1 024× on a large area blows the cap.
     Detected by the `INFEASIBLE-AT-CAP` exit, not by churning. **GeometricStar is the pre-registered
     failure case**: R2 puts it at **1.07× the cap isotropically**, i.e. already over, before any of A1's
     lower-bound slack is repaid.
  2. **Real h⁰ misclassified as crease** ⇒ refinement to the weld wall forever. Guards: §3.3 stickiness,
     the `NON-MONOTONE` exit, Phase 0's two-grid persistence.
  3. **A2's own pathology re-entering through the back door**: if the predicate says 90 % of triangles
     violate on sweep 1, breadth-first doubles everything — uniform refinement in a different disguise. The
     difference is that this 90 % is a *fact about the surface* (a threshold) rather than an *artifact of a
     key*, and Phase 0's arithmetic is the check that it fits. **That is why Phase 0 must run first and be
     believed.** If Phase 0's counts are lower bounds by 3× rather than the ~2× headroom the worklog asks
     for, this design is under-provisioned and the honest answer is a bigger cap, not a looser tol.

### 6.3 Class instability across sweeps

`locateKink`'s two-scale window `w = 1/KINK_SCAN` is a fraction *of the edge*, so it shrinks as the edge
shrinks and a fixed physical feature can walk smooth → crease → jump between sweeps. Routing decisions then
flip, and curtain deferral is terminal. Mitigated by §3.3 (Phase-0 seed + two-sweep agreement), but the
residual risk is real and it should be **instrumented**: count `nClassFlips` per sweep and print it. A
rising flip count is the signature.

### 6.4 The FIFO gives up the anytime property, genuinely

Time-cap a heap run and you know the worst was fixed first. Time-cap a sweep run and you have a
half-finished generation with no bound on what is left. This is a true loss. It is acceptable only because
the anytime property was worthless at a binary bar (§2.1.2) — and it must not be papered over: report
`queueLeft`, the sweep index, and a `worst-left (edge ruler, LOWER BOUND)` figure explicitly labelled as
not being a residual estimate (§2.5).

### 6.5 The memo can go stale (this is the Voronoi-hash-desync shape)

`edgeCache` is sound *only* while vertices never move; §4.3 introduces moves. Required gate before the move
lands: **`PF_CB_MEMO_VERIFY=1`** recomputes `edgeSag` and `locateKink` on every cache hit and `Object.is`-
compares both `sag` and `kink.t`; mismatches must be **0** over a full GothicArches ring run. Run it once
per style at reduced cap. Precedent: this is the same discipline that caught the `sagBoundedAtN` inline
(3 200 pairs, 8 levels, 0 mismatches) and the same discipline whose absence produced the partial
int-hash swap.

### 6.6 Circularity

Phase 2 feeds back into the same predicate against the same surface. If `rA` is wrong, everything agrees
and everything is wrong. Keep both existing defences: `openGpuRank`'s startup parity guard (`gpu.parityUm`,
refuses to open on disagreement) and the auditor's separate `buildAuditRadiusFn` wrapper.

### 6.7 Small things that will bite

* `qPush` on a growing `Int32Array` must double, not `push` — and the mask arithmetic must be re-derived on
  grow. Easy to get wrong silently.
* Dead entries accumulate in the queue (a `bisectAt` kills every incident triangle). At the 2.5 M cap this
  is bounded by total allocations, not live triangles — the same accounting that blew the `edgeMap` Map cap
  (L167–L171). Compact the ring at each sweep boundary, dropping `!alive[t]`.
* `refineOne` does exactly ONE action per pop. Two would make sweep counts meaningless and reintroduce the
  inner LEPP walk's unbounded `guard = 200_000` loops (L838).
* `FLOOR_MM` (1.5 µm) must gate *split candidacy*, not *predicate evaluation* — a sub-floor triangle that
  violates is `unresolved`, not accepted.

---

## 7. MIGRATION PATH

### 7.1 One flag, old driver untouched

```ts
type DriverMode = 'heap' | 'sweep';
const DRIVER: DriverMode = ((): DriverMode => {
  const raw = process.env.PF_CB_DRIVER;
  if (raw === undefined || raw === '') return 'heap';        // DEFAULT = today, byte-reproducible
  if (raw === 'heap' || raw === 'sweep') return raw;
  throw new Error(`PF_CB_DRIVER: unknown mode '${raw}' — expected heap | sweep`);
})();
```

Fail-loud on a typo, matching the existing `PF_CB_RANK` precedent (L357–L364) — a run tagged as one
experiment and driven by another is exactly the confound this flag exists to remove.

**Zero edits inside** `sagBounded`, `sagBoundedAtN`, `sagAdaptive`, `sagOfN`, `sagPtPerp`, `locateKink`,
`edgeSag`, `bisectAt`, `splitEdge`'s SNAP block, `refineLepp`, the collapse/flip pass, `analyze`, the STL
writer. The sweep driver **calls** them. The only surgical edits to shared code are:

1. one line in `eDel` (L171) to evict `edgeCache`;
2. hoisting `cr(...)` out of `tryFlip` (L1095) to module scope, unchanged;
3. `splitEdge`'s `locateKink` call reads the cache when `DRIVER === 'sweep'`.

Everything else is new code appended below the existing driver, inside `if (DRIVER === 'sweep') { … }`.
Consequence: the hard gate (`PF_STRATA_FTV=1 … _strataFacetTruthValidate.test.ts --testTimeout=1800000
--hookTimeout=600000`) is unaffected — it imports `_facetTruthLib`, not this file — and a bisect between
arms stays meaningful.

### 7.2 Tag suffix

Extend the `tag` template (L1429) with `W` for sweep, so `gothicarches_ring_DS-BW.stl` cannot land on
`gothicarches_ring_DS-B.stl`. The precedent is already established for `B` (bounded), `G` (doom guard) and
`P` (ptperp), for exactly this reason.

### 7.3 Every existing lever keeps working

| lever | under `sweep` |
|---|---|
| `PF_CB_DIRECTED`, `PF_CB_SNAP` | become **ablation** switches, not mode switches. SNAP is forced on for crease-class edges; `PF_CB_SNAP=0` disables the class router entirely (an explicit control arm). The report states which |
| `PF_CB_REPROJECT` | unchanged, still applies to edges with both ends on a locus |
| `PF_CB_ACCEPT` | becomes the predicate threshold (§1.3) |
| `PF_CB_RANK`, `PF_CB_BOUNDED` | **inert — must FAIL LOUD if set explicitly together with `sweep`.** No rank exists; silently ignoring them would mislabel a run |
| `PF_CB_NUDGE` | inert; the report prints a one-line notice (§4.4) |
| `PF_CB_GPU_RANK` | selects the **Phase-2 certificate engine** instead of the in-loop ranker. Same env name, new meaning, stated in the report |
| `PF_CB_BND_DOOM`, `PF_CB_BNDSTATS` | survive; only exercised by the Phase-2 bounded pass |
| `PF_CB_TRICAP`, `PF_CB_MAXSECS`, `PF_CB_PROGRESS`, `PF_CB_DEBUG` | unchanged. `PF_CB_PROGRESS` gains `sweep=`, `queue=`, `cls=` fields |
| `PF_CB_FLOOR_UM`, `PF_CB_WELD_UM`, `PF_CB_COLLAPSE_UM`, `PF_CB_NEEDLE_UM`, `PF_CB_SAFE_COLLAPSE`, `PF_CB_FLIP` | unchanged, all post-loop |
| `PF_CB_STAGE`, `PF_CB_WALLT`, `PF_CB_FLOORZ`, `PF_CB_INNERDIV`, `PF_CB_INNERRINGS`, `PF_CB_CAVITY_TH` | unchanged |
| `PF_CB_TOL`, `PF_CB_ORACLE*`, `PF_CB_AUD_*`, `PF_CB_TAILK/N`, `PF_CB_LOCUS_AUDIT` | unchanged — the whole final-audit block is shared |
| **new**: `PF_CB_DRIVER`, `PF_CB_CONF_UM`, `PF_CB_OUTER_MAX`, `PF_CB_MEMO_VERIFY`, `PF_CB_PHASE0` | |

### 7.4 Landing order — five mechanical commits, each independently measurable

| # | contents | measured against |
|---|---|---|
| 1 | FIFO + `triangleNeed` + class routing + jump→curtain-tag. **No memo, no vertex move, no Phase 2.** | heap arm at equal `triCap`, on H2 true-3D at 100 % coverage. Expected: coverage and bulk beat A2; max may not close |
| 2 | `edgeCache` + `PF_CB_MEMO_VERIFY` | wall-clock only. Must be **bit-identical** to commit 1's STL (md5) |
| 3 | snap-to-locus vertex MOVE + CSR adjacency + revert-on-inversion + `edgeCache` invalidation | weld-wall counters: refusals, `nSnapMove`, `nProximity`. `PF_CB_MEMO_VERIFY` mismatches must be 0 |
| 4 | Phase 0 wiring — call `sizingFeasibility`, print predicted vs cap, refuse to start on `INFEASIBLE-AT-CAP` unless `PF_CB_PHASE0=0` | the R2 table reproduces |
| 5 | Phase 2 batched certificate + local tightening + outer loop | the full architecture, all-6-style roster |

### 7.5 A/B protocol

Committed STRATA baselines are **not reproducible** (2026-07-28). Run the `PF_CB_DRIVER=heap` control **in
the same session, on the same box** before quoting any comparison against a `sweep` arm. Never A/B against
a committed STL.

---

## APPENDIX — identifier index

| identifier | line @ f76c37c4 | anchor |
|---|---|---|
| `locateKink` | 187 | `// ─── THE GENERIC 1-D KINK LOCATOR ───` |
| `interface Kink` | 186 | `{ t; big; ratio; jump }` |
| `edgeSag` | 239 | `// ─── EDGE CHORD SAG (the anisotropy driver) ───` |
| `sagOfN` / `sagAdaptive` | 262 / 294 | `// ─── TRIANGLE SAG ORACLE ───` |
| `sagBoundedAtN` / `sagBounded` | 393 / 537 | `// ─── L4 BOUNDED ACCEPT ───` |
| `sagPtPerp` | 625 | `PF_CB_RANK=ptperp` |
| `addV` / `addVNew` / `gcell` | 125 / 122 / 123 | `// ─── mesh store (θ,z) with 3D spatial-hash weld ───` |
| `bisectAt` | 722 | `// ─── BISECTION ───` |
| `splitEdge` (the `nJump` site) | 756 (760) | `if (k.jump) nJump += 1;` |
| `NUDGE_LADDER` decl / use | 106 / 819 | `PF_CB_NUDGE` |
| `refineLepp` / `refineDirected` | 837 / 860 | aspect guard at 867 |
| heap block | 875–897 | `// ─── worst-first refinement ───` |
| `consider` / `pend` / `flushGpu` | 905 / 904 / 916 | GPU-RANK candidate queue |
| main loop | 954–1001 | `while (heapT.length > 0 \|\| pend.length > 0)` |
| `unresolved` / `stuck` | 943 / 940 | `NOT CONVERGED, NOT CONVERGED-AND-QUIET` |
| `unresolvedLeft` / `unresolvedMax` | 1007–1008 | survivor filter |
| collapse / `tryFlip` / `cr` | 1064 / 1076 / 1095 | `LINK-CONDITION-SAFE NEEDLE COLLAPSE` |
| `analyze` / `wIndex` | 1181 / 1183 | position weld at `WELD_MM` |
| `verdict` | 1403 | `A MEASUREMENT IS NOT A VERDICT` |
| `tag` | 1429 | `RANK SUFFIX` |
| `sizingFeasibility` | — | `research/bridge/_sizingFeasibilityLib.ts` L270 |
| `openGpuRank` / `GpuRank.score` | — | `research/bridge/_gpuRankBridge.ts` L168 / L94 |
| `runH1Walk` / pool | — | `research/bridge/_facetTruthH1.ts`, `_facetTruthPool.ts` |
