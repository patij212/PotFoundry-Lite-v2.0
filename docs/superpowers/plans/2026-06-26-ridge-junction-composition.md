# Ridge Junction Composition (STEP 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose N ridge bands meeting at a shared graph node J into one watertight, simple-footprint, feature-followed `RidgeResult` — the degree-N generalization of the proven corner-join.

**Architecture:** New `paveRidgeJunction(spines, sampler, opts)` in `bandConstruct.ts`. Pave each spine as a ridge band sharing J; order the arms by azimuth around J; resolve each azimuth sector between adjacent arms' facing crest rails with the proven per-corner machinery (wide sector → `triangulatePolygon3D` wedge-fill; narrow sector → miter clip); combine + weld by exact-(u,t)/QSCALE key.

**Tech Stack:** TypeScript, Vitest. Reuses proven `bandConstruct.ts` helpers: `dirUT`, `lineIntersectUT`, `turnSign3D`, `clipTailToMiter`, `clipHeadToMiter`, `offsetRailVariable`, `addFlankToCombined`, `fillPolygon`, `makeCombinedTable`, `perpUV`; `triangulatePolygon3D` (junction.ts); `auditWatertight`/`triangleQuality3D` (audit.ts); `footprintSelfCrossings`.

## Global Constraints

- Flag-gated default-OFF; no production code touched (new `bandConstruct.ts` symbol + tests only).
- Never stage the 5 cellSamples-WIP files (`WatertightAssembly.ts`/`PeriodicBalancedQuadtree.ts`/`windowHook.ts`/`ParametricExportComputer.ts`/`ConformingWall.ts`). Scope every `git add`; verify `git diff --cached --name-only`.
- GitNexus `impact` before editing a committed symbol; `detect_changes` before commits.
- Heavy real-pipeline tests behind `describe.skipIf(!process.env.PF_DERISK)`; real-pipeline builds in `beforeAll(…, 120000+)` with LAZY selection (never pave the whole graph in `beforeAll`).
- Cylinder test surface: `new SyntheticCylinderSampler(50, 100, 0, 0)` is developable — developed coords are `x = 2π·50·u ≈ 314.159·u` mm, `y = 100·t` mm, so a spine at dev-angle φ from J of length L has endpoint `(u,t) = (J.u + L·cosφ/314.159, J.t + L·sinφ/100)`.
- ESLint 0-warnings. Run from `potfoundry-web/`.

---

### Task 1: `paveRidgeJunction` — symmetric degree-3 Y (wide-sector wedge fill)

**Files:**
- Modify: `potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts` (add `paveRidgeJunction` + sector helpers after `assembleSubSpines`)
- Test: `potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts` (add a `describe('paveRidgeJunction …')`)

**Interfaces:**
- Consumes: `CornerJoinOptions {widthMm, edgeMm}`, `RidgeResult`, and the existing `bandConstruct.ts` helpers listed in Tech Stack.
- Produces: `export function paveRidgeJunction(spines: StationPoint[][], sampler: SurfaceSampler, opts: CornerJoinOptions): RidgeResult` — each `spines[i]` is a (u,t) polyline whose FIRST vertex is the shared node J (exact (u,t) equal across all arms).

- [ ] **Step 1: Write the failing test** (append to `bandConstruct.test.ts`, in a new describe under the `flat` sampler)

```ts
describe('paveRidgeJunction (STEP 3b — junction composition)', () => {
  const flat = new SyntheticCylinderSampler(50, 100, 0, 0);
  const J: StationPoint = { u: 0.5, t: 0.5 };
  // Three arms radiating from J at 120° in the developed plane (φ = 90°,210°,330°), L=20mm.
  const armAt = (deg: number, L = 20): StationPoint[] => {
    const r = (deg * Math.PI) / 180;
    return [J, { u: J.u + (L * Math.cos(r)) / (2 * Math.PI * 50), t: J.t + (L * Math.sin(r)) / 100 }];
  };

  it('composes a symmetric degree-3 Y into a SIMPLE-footprint, watertight ridge (J shared crease)', () => {
    const spines = [armAt(90), armAt(210), armAt(330)];
    const res = paveRidgeJunction(spines, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
    // J is a crease vertex shared by all arms.
    const [qu, qt] = quantizeRailUT(J.u, J.t);
    const spineKeys = new Set(res.spineVertexIds.map((id) => { const [u, t] = res.vertexUT[id]; return `${u}|${t}`; }));
    expect(spineKeys.has(`${qu}|${qt}`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t "paveRidgeJunction"`
Expected: FAIL — `paveRidgeJunction is not a function` (or import error). Add `paveRidgeJunction` to the import line in the test, then re-run → FAIL on the assertions.

- [ ] **Step 3: Write the minimal implementation** (append to `bandConstruct.ts` after `assembleSubSpines`)

Algorithm (reuse the `assembleSubSpines` shape; refine geometry to pass the test):

```ts
/** Outgoing (u,t) azimuth of arm `i` at J, in the metric tangent plane (for CCW ordering). */
function armAzimuth(spineDense: StationPoint[], J: StationPoint, sampler: SurfaceSampler): number {
  const d = dirUT(J, spineDense[1]); // (u,t) outgoing tangent
  // Project the 3D tangent onto the tangent basis at J → a stable 2D azimuth.
  const E = 1e-4;
  const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const pu = sub(sampler.position(J.u + E, J.t), sampler.position(J.u - E, J.t)) as [number, number, number];
  const pt = sub(sampler.position(J.u, J.t + E), sampler.position(J.u, J.t - E)) as [number, number, number];
  const t3 = [pu[0] * d.du + pt[0] * d.dt, pu[1] * d.du + pt[1] * d.dt, pu[2] * d.du + pt[2] * d.dt];
  // 2D coords in the (pu,pt) basis (Gram-Schmidt not needed for a monotonic azimuth).
  const x = t3[0] * pu[0] + t3[1] * pu[1] + t3[2] * pu[2];
  const y = t3[0] * pt[0] + t3[1] * pt[1] + t3[2] * pt[2];
  return Math.atan2(y, x);
}

export function paveRidgeJunction(spines: StationPoint[][], sampler: SurfaceSampler, opts: CornerJoinOptions): RidgeResult {
  const { widthMm, edgeMm } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const J = { u: spines[0][0].u, t: spines[0][0].t };
  // Densify each arm (J stays the first vertex / anchor).
  const arms = spines.map((s) => densifyRail(s, sampler, maxSpacingMm));

  // Order arms CCW by azimuth around J.
  const order = arms.map((a, i) => ({ i, az: armAzimuth(a, J, sampler) })).sort((p, q) => p.az - q.az).map((o) => o.i);

  const table = makeCombinedTable();
  const tris: number[] = [];
  // Pave each arm's two flanks; capture each flank's J-end row (rows[0].w, since J is first).
  // +perp (left) flank faces CCW (toward the next arm); −perp (right) faces CW (toward the prev arm).
  const left: PavedFlank[] = []; const right: PavedFlank[] = [];
  for (const a of arms) {
    const widths = new Array<number>(a.length).fill(widthMm);
    const railL = offsetRailVariable(a, sampler, widths, 1);
    const railR = offsetRailVariable(a, sampler, widths, -1);
    left.push(addFlankToCombined(a, railL, sampler, edgeMm, maxSpacingMm, table, tris));
    right.push(addFlankToCombined(a, railR, sampler, edgeMm, maxSpacingMm, table, tris));
  }

  // For each CCW sector (arm order[k] → order[k+1]): wedge-fill between armA's +perp J-row and
  // armB's −perp J-row, sharing J. (Narrow-sector miter is Task 2.)
  const N = order.length;
  for (let k = 0; k < N; k++) {
    const a = order[k], b = order[(k + 1) % N];
    const aRow = left[a].grid.rows[0].w;   // [J, …, +perpCrest_a]
    const bRow = right[b].grid.rows[0].w;  // [J, …, −perpCrest_b]
    // Wedge loop: J → aRow interior → +perpCrest_a → −perpCrest_b → bRow interior reversed → J.
    fillPolygon([...aRow, ...bRow.slice(1).reverse()], sampler, table, tris);
  }

  // Open boundary: every flank crest rail + every arm's outer (free) end row. J + creases +
  // sector-fill interiors are interior (count-2).
  const openBoundaryVertices = new Set<number>();
  for (const f of [...left, ...right]) {
    for (const id of f.crestIds) openBoundaryVertices.add(id);
    const outer = f.grid.rows[f.grid.rows.length - 1].w;
    for (const p of outer) openBoundaryVertices.add(table.intern(p.u, p.t));
  }
  // Crease ids: J + each arm's foot rows (J shared).
  const spineVertexIds: number[] = [];
  for (const f of left) for (const r of f.grid.rows) spineVertexIds.push(table.intern(r.footPt.u, r.footPt.t));

  const positions = new Float32Array(table.ut.length * 3);
  for (let i = 0; i < table.ut.length; i++) {
    const p = sampler.position(table.ut[i][0], table.ut[i][1]);
    positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
  }
  return {
    mesh: { positions, indices: new Uint32Array(tris) },
    vertexUT: table.ut.map((v) => [v[0], v[1]] as [number, number]),
    spineVertexIds,
    openBoundaryVertices,
  };
}
```

Refine the `+perp/−perp faces which sector` assignment empirically with the test (mirror how `joinCorner` determined concave via `turnSign3D`): if the symmetric Y folds, the facing-flank pairing per sector is swapped — flip `left[a]`/`right[b]` selection. The proven `joinCorner` is the 2-arm oracle (two arms 180° apart → 2 sectors).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd potfoundry-web && npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t "paveRidgeJunction"`
Expected: PASS. Then run the full file: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts` → all green. Lint: `npx eslint src/fidelity/bandRemesh/bandConstruct.ts --max-warnings=0`.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "feat(bandConstruct): paveRidgeJunction — symmetric deg-3 Y (STEP 3b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Narrow sector → miter (asymmetric junction)

**Files:** same `bandConstruct.ts` + `bandConstruct.test.ts`.

**Interfaces:** Consumes Task 1's `paveRidgeJunction`. Produces no new export (internal narrow-sector branch).

- [ ] **Step 1: Write the failing test** (add inside the `paveRidgeJunction` describe)

```ts
it('composes an asymmetric junction with a NARROW sector (miter branch) — simple + watertight', () => {
  // Two arms close together (40° apart) + a third opposite → one narrow sector forces a miter.
  const spines = [armAt(80), armAt(120), armAt(280)];
  const res = paveRidgeJunction(spines, flat, { widthMm: 3, edgeMm: 2 });
  expect(res.mesh.indices.length).toBeGreaterThan(0);
  expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
  const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
  expect(a.nonManifoldEdges).toBe(0);
  expect(a.tJunctions).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t "NARROW sector"`
Expected: FAIL — `footprintSelfCrossings` > 0 (the 40° sector's facing flanks overlap with the Task-1 wedge-only fill).

- [ ] **Step 3: Add the narrow-sector miter branch**

In the sector loop, compute the sector angle (azimuth gap `order[k+1].az − order[k].az`, wrapped to (0,2π)). Below a threshold (`SECTOR_MITER_RAD`, start ≈ `Math.PI/2` and TIGHTEN), miter instead of wedge: clip armA's `+perp` rail tail and armB's `−perp` rail head to their shared miter `M` (the intersection of the two facing offset crest LINES at J), via `computeCornerGeom`-style geometry + `clipTailToMiter`/`clipHeadToMiter`, BEFORE paving those two flanks. Implementation mirrors `assembleSubSpines`'s concave clip: build the facing rails, clip to `M`, then `addFlankToCombined`; the two facing J-rows become the identical `buildCrossBandRow(J, M)` so they weld (no wedge fill for that sector). Refine `M` and the threshold with the test (the wedge chord inverting is the signal the sector is narrow).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t "paveRidgeJunction"` → all paveRidgeJunction tests PASS. Lint clean.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "feat(bandConstruct): narrow-sector miter in paveRidgeJunction (STEP 3b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reflex degree-3 + degree-4

**Files:** `bandConstruct.test.ts` (likely no `bandConstruct.ts` change — `triangulatePolygon3D` ear-clips reflex polygons; if a reflex sector folds, refine the wedge-loop ordering).

**Interfaces:** Consumes Task 2's `paveRidgeJunction`.

- [ ] **Step 1: Write the failing tests**

```ts
it('composes a REFLEX degree-3 junction (one sector > 180°) — simple + watertight', () => {
  // Three arms bunched in a half-plane → the opposite sector is reflex (> 180°).
  const spines = [armAt(60), armAt(120), armAt(180)];
  const res = paveRidgeJunction(spines, flat, { widthMm: 3, edgeMm: 2 });
  expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
  const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
  expect(a.nonManifoldEdges).toBe(0);
  expect(a.tJunctions).toBe(0);
});

it('composes a degree-4 junction — simple + watertight', () => {
  const spines = [armAt(45), armAt(135), armAt(225), armAt(315)];
  const res = paveRidgeJunction(spines, flat, { widthMm: 3, edgeMm: 2 });
  expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
  const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
  expect(a.nonManifoldEdges).toBe(0);
  expect(a.tJunctions).toBe(0);
});
```

- [ ] **Step 2: Run to verify fail/pass status**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts -t "paveRidgeJunction"`. Degree-4 (all wide) likely PASSES already (the N-sector loop is general). Reflex may FAIL (the > 180° wedge polygon winding); if so, fix in Step 3.

- [ ] **Step 3: Fix the reflex wedge if needed**

`triangulatePolygon3D` ear-clips a non-convex polygon, so the reflex sector's wedge polygon should triangulate — but its loop must be a SIMPLE (non-self-crossing) polygon and consistently wound. If the reflex sector folds, the cause is the wedge loop ordering (the chord `+perpCrest_a → −perpCrest_b` crosses the arms): for a reflex sector, the facing flanks are the OUTER crests; verify the loop walks J → aRow → crestA → crestB → bRow reversed → J without crossing. Refine the loop assembly (it is the same `fillPolygon` call; only the row selection differs) until `footprintSelfCrossings === 0`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/fidelity/bandRemesh/bandConstruct.test.ts` → all green. Lint clean.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.ts potfoundry-web/src/fidelity/bandRemesh/bandConstruct.test.ts
git commit -m "test(bandConstruct): reflex deg-3 + deg-4 junctions pass (STEP 3b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Real-junction PF_DERISK gate (Voronoi triple/reflex/highDegree)

**Files:**
- Create: `potfoundry-web/src/fidelity/bandRemesh/bandConstruct.junction.derisk.test.ts`

**Interfaces:** Consumes `paveRidgeJunction`, `paveRidgeCornerSplit`, `footprintSelfCrossings`, `auditWatertight`, `triangleQuality3D`, the real pipeline (`styleSampler`/`detectFeatures`/`conditionGraph` — copy config verbatim from `bandConstruct.gate.derisk.test.ts`), and `conditionGraph`'s `nodeTypes`.

- [ ] **Step 1: Write the gate** (model on `bandConstruct.gate.derisk.test.ts`'s pipeline + `buildStyle`; LAZY: for each `triple`/`reflex`/`highDegree` node whose incident interior edges are all clean-band-able and separated from other selected junctions, gather the incident spines ORIENTED to radiate from the node (reverse those whose node end is last), call `paveRidgeJunction`, and assert per junction: `footprintSelfCrossings===0`, `auditWatertight` 0/0, J is a crease vertex. Stop after ~6 junctions. Report counts of triple/reflex/highDegree composed + any that fold (the honest junction verdict). Non-vacuous negative control: split a shared seam vertex → tJunctions > 0.)

```ts
// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
// (Header + config copied from bandConstruct.gate.derisk.test.ts; build all in beforeAll(…,180000).)
```

- [ ] **Step 2: Run** `PF_DERISK=1 npx vitest run src/fidelity/bandRemesh/bandConstruct.junction.derisk.test.ts` and READ the per-node fold/quality counts.

- [ ] **Step 3: Systematic-debugging on any fold.** If a node class (e.g. reflex) folds on real geometry: root-cause (the wedge/miter on a real curved sector); if 3 fixes fail, STOP and report honestly (the honest 3b verdict, like the corner-join gate). Calibrate `SECTOR_MITER_RAD` by TIGHTENING only.

- [ ] **Step 4: Run to confirm green** (or record the honest verdict in the file header, asserting the measured reality — never a silent skip).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/fidelity/bandRemesh/bandConstruct.junction.derisk.test.ts
git commit -m "test(bandConstruct): real-junction gate — paveRidgeJunction on Voronoi nodes (STEP 3b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** §3 architecture → Task 1 (skeleton + wide wedge) + Task 2 (narrow miter); §4 reflex/deg-4 → Task 3; §6 unit tests → Tasks 1–3; §6 integration gate → Task 4. All spec sections covered. Mixed junctions + production graft are spec §8 out-of-scope (not planned here).

**Placeholder scan:** Implementation steps give the algorithm + reused helper names + starting code; geometric refinement-with-the-test is explicit (the user endorsed this for the corner-join). Test code is complete. No TBD/TODO.

**Type consistency:** `paveRidgeJunction(spines: StationPoint[][], sampler, opts: CornerJoinOptions): RidgeResult` is consistent across tasks. Reused helpers (`PavedFlank`, `addFlankToCombined`, `fillPolygon`, `makeCombinedTable`, `clipTailToMiter`/`clipHeadToMiter`, `computeCornerGeom`, `offsetRailVariable`, `dirUT`) match their `bandConstruct.ts` signatures.
