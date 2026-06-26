# Meshing Research Lab — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the dev-only meshing research lab and prove it by re-baselining our mesher against SOTA engines (gmsh/Triangle) on the same instruments — answering, with evidence, whether an existing engine already solves the 5 tangled styles.

**Architecture:** A Python oracle sidecar triangulates the `(u,t)` parameter domain under a curvature sizing field; a TS bridge exports our conforming `(u,t)` mesh + the field, ingests the oracle's `(u,t)` mesh, lifts both to 3D analytically, and measures them with the project's existing `perpendicular3DDeviation` + `triangleQualityDistribution`. Plus three skills + one subagent.

**Tech Stack:** Python 3.11 (gmsh, triangle, numpy, scipy, trimesh, meshio, pytest) · TypeScript (Vitest, the existing `src/fidelity` instruments) · Markdown skills/agent.

> **⚠ This plan refines spec `2026-06-26-meshing-research-lab-design.md` §6.2 / §9, based on the real instrument API discovered during planning:**
> `perpendicular3DDeviation` (`src/fidelity/analyticSurfaceGate.ts:567`) measures facets against the **analytic radius function** `rAnalytic(θ,z)` (not a dense PLY mesh), and the conforming mesher emits `(u,t)` **CPU-side**. Therefore the **core re-baseline is CPU-only and deterministic**: the oracle outputs a `(u,t)` triangulation; we lift it via `S(θ,z)=(r·cosθ, r·sinθ, z)` and measure with the same instrument as our own mesh. The spec's GPU `reference.ply`/`ours.ply` + Blender QuadriFlow remesh become the **Phase-2 3D-validation path** (kept, deferred). PLY exchange is replaced by a lighter `(u,t)` JSON exchange. This is strictly more rigorous (no GPU-warp confound) and removes the GPU/Blender risk from the Phase-1 critical path.

## Global Constraints

- **Dev-only.** Nothing under `src/` may import from `research/`. The lab never enters the Vite build or Cloudflare deploy. (Guard test in Task 4.)
- **Production byte-identical.** No production export code is modified in Phase 1. The bridge only *reads* existing `src/fidelity` + conforming-mesher functions.
- **Preserve work** — commit WIP/partial with honest status; never `git revert`/`restore` to discard; refuted experiments are kept.
- **Commit hygiene** — scope each `git add` to the task's files; NEVER stage the pre-existing dirty WIP hunks in `ConformingWall.ts` / `WatertightAssembly.ts` / `PeriodicBalancedQuadtree.ts` / `ParametricExportComputer.ts` / `windowHook.ts`.
- **Python isolation** — all Python lives in `potfoundry-web/research/oracle/`; `.venv/` and `research/exchange/` are gitignored; `requirements.txt` pinned.
- **Determinism** — Triangle is deterministic; gmsh seed pinned (`gmsh.option.setNumber("Mesh.RandomSeed", 1)`). Same input + config → identical mesh.
- **ESLint 0-warnings** on any `.ts` touched (the PostToolUse hook enforces it).
- **De-risk first** — Tasks 0–5 are the load-bearing spike (does the toolchain run? can we extract our `(u,t)` mesh? does the round-trip measure?). Tasks 6–10 (all-20, anisotropic, skills, agent) are expanded/confirmed only after the spike lands.

---

## Task 0: Python environment + engine smoke (load-bearing de-risk)

**Why first:** the entire lab rests on "gmsh + Triangle wheels install and run on this Windows/Python 3.11 box." Prove it before anything else.

**Files:**
- Create: `potfoundry-web/research/oracle/requirements.txt`
- Create: `potfoundry-web/research/oracle/tests/test_smoke.py`
- Create: `potfoundry-web/research/.gitignore`
- Create: `potfoundry-web/research/README.md`

**Interfaces:**
- Produces: a working `.venv` with importable `gmsh`, `triangle`, `numpy`, `scipy`, `trimesh`, `meshio`; the convention that all `oracle.py` runs use `research/oracle/.venv`.

- [ ] **Step 1: Write `requirements.txt` (pinned)**

```
# potfoundry-web/research/oracle/requirements.txt
gmsh==4.13.1
triangle==20230923
numpy==1.26.4
scipy==1.13.1
trimesh==4.4.3
meshio==5.3.5
pytest==8.2.2
```

- [ ] **Step 2: Write `.gitignore` (Python isolation)**

```
# potfoundry-web/research/.gitignore
oracle/.venv/
exchange/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 3: Write the smoke test**

```python
# potfoundry-web/research/oracle/tests/test_smoke.py
"""Proves the SOTA engines install and run on this machine."""
import numpy as np


def test_triangle_meshes_a_square():
    import triangle as tr
    sq = {"vertices": np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float),
          "segments": np.array([[0, 1], [1, 2], [2, 3], [3, 0]], dtype=int)}
    out = tr.triangulate(sq, "pq30a0.01")  # planar straight-line graph, min-angle 30, max-area
    assert out["triangles"].shape[0] > 50
    assert out["vertices"].shape[0] >= 4


def test_gmsh_meshes_a_square():
    import gmsh
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("Mesh.RandomSeed", 1)
        gmsh.model.add("sq")
        lc = 0.1
        p = [gmsh.model.geo.addPoint(x, y, 0, lc) for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]]
        lines = [gmsh.model.geo.addLine(p[i], p[(i + 1) % 4]) for i in range(4)]
        cl = gmsh.model.geo.addCurveLoop(lines)
        gmsh.model.geo.addPlaneSurface([cl])
        gmsh.model.geo.synchronize()
        gmsh.model.mesh.generate(2)
        _, coords, _ = gmsh.model.mesh.getNodes()
        assert coords.shape[0] // 3 > 50
    finally:
        gmsh.finalize()
```

- [ ] **Step 4: Create venv + install + run the smoke test**

Run (Git Bash):
```bash
cd potfoundry-web/research/oracle
python -m venv .venv
.venv/Scripts/python.exe -m pip install --upgrade pip
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pytest tests/test_smoke.py -v
```
Expected: `2 passed`. **If a wheel fails to install** (e.g. `triangle` needs build tools): record the exact error in `research/README.md`, drop that engine to "blocked" status, and proceed with whichever engine(s) installed — gmsh is the priority (it carries the anisotropic test). Do not silently continue as if it worked.

- [ ] **Step 5: Write `research/README.md`** (one-line setup + engine status table: engine | version | smoke pass/blocked | note).

- [ ] **Step 6: Commit**

```bash
git add potfoundry-web/research/oracle/requirements.txt potfoundry-web/research/oracle/tests/test_smoke.py potfoundry-web/research/.gitignore potfoundry-web/research/README.md
git commit -m "feat(meshing-lab): Task 0 — python oracle env + engine smoke (de-risk)"
```

---

## Task 1: Curvature sizing field (TS helper)

**Why:** both engines need a sizing field over `(u,t)` that bounds chord error. Start **isotropic** (a scalar target edge length `h(u,t)`); the anisotropic tensor is Task 6.

**Files:**
- Create: `potfoundry-web/research/bridge/sizingField.ts`
- Test: `potfoundry-web/research/bridge/sizingField.test.ts`

**Interfaces:**
- Consumes: `AnalyticRadiusFn` from `../../src/fidelity/analyticSurfaceGate` (type only).
- Produces: `buildIsotropicSizingField(rA: AnalyticRadiusFn, H: number, opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number }): { resU: number; resT: number; h: Float64Array }` — `h[it*resU+iu]` is the target edge length (in **`(u,t)` units**, u∈[0,1], t∈[0,1]) at that grid node, from the worst second-fundamental-form magnitude: `h = clamp(sqrt(8·tolMm / max(|S_uu|,|S_tt|)), hMin, hMax)` — already in `(u,t)` units (`|S_dd|` carries the parameter→mm scale; **no speed division**). **CORRECTED 2026-06-26 (TDD caught it):** a cylinder r=R is circumferentially curved (`|S_uu|=(2π)²R`), so it does NOT saturate at hMax — its sizing equals the analytic chord length `sqrt(8·tol/((2π)²R))`. The Step-1/Step-3 code below is the corrected version.

- [ ] **Step 1: Write the failing test**

```typescript
// potfoundry-web/research/bridge/sizingField.test.ts
import { describe, it, expect } from 'vitest';
import { buildIsotropicSizingField } from './sizingField';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

describe('buildIsotropicSizingField', () => {
  it('cylinder: uniform field == the analytic chord length sqrt(8·tol/((2π)²R))', () => {
    // A cylinder r=R is circumferentially curved (|S_uu|=(2π)²R) ⇒ it does NOT
    // saturate at hMax; its sizing equals the analytic chord length, in u-units.
    const R = 50, tolMm = 0.1;
    const rA: AnalyticRadiusFn = () => R;
    const f = buildIsotropicSizingField(rA, 120, { resU: 16, resT: 16, tolMm, hMin: 0.0005, hMax: 0.2 });
    expect(f.h.length).toBe(16 * 16);
    const expected = Math.sqrt((8 * tolMm) / (4 * Math.PI * Math.PI * R)); // ≈ 0.0201, inside [hMin,hMax]
    for (const v of f.h) expect(v).toBeCloseTo(expected, 3); // uniform + matches analytic
  });

  it('clamps to hMax when the curvature-derived length exceeds it', () => {
    const rA: AnalyticRadiusFn = () => 50; // analytic ≈0.0201 > hMax 0.01 → clamp
    const f = buildIsotropicSizingField(rA, 120, { resU: 8, resT: 8, tolMm: 0.1, hMin: 0.001, hMax: 0.01 });
    for (const v of f.h) expect(v).toBeCloseTo(0.01, 6);
  });

  it('fluted wall (high azimuthal curvature) → smaller mean h than a smooth cylinder', () => {
    const smooth: AnalyticRadiusFn = () => 50;
    const fluted: AnalyticRadiusFn = (theta) => 50 + 3 * Math.cos(12 * theta); // strong curvature
    const opts = { resU: 64, resT: 8, tolMm: 0.1, hMin: 0.0005, hMax: 0.2 };
    const hS = buildIsotropicSizingField(smooth, 120, opts).h;
    const hF = buildIsotropicSizingField(fluted, 120, opts).h;
    const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(hF)).toBeLessThan(mean(hS));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd potfoundry-web && npx vitest run research/bridge/sizingField.test.ts`
Expected: FAIL ("buildIsotropicSizingField is not a function").

- [ ] **Step 3: Implement**

```typescript
// potfoundry-web/research/bridge/sizingField.ts
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface IsotropicSizingField { resU: number; resT: number; h: Float64Array; }

/**
 * Isotropic chord-control sizing field over (u,t). At each grid node we estimate
 * the worst second-fundamental-form magnitude |S_dd| by central differences of the
 * radial surface S(θ,z)=(r·cosθ, r·sinθ, z) (θ=u·TAU, z=t·H) in each parameter
 * direction. A parameter-edge of length h has chord sag ≈ |S_dd|·h²/8, so bounding
 * sag ≤ tol gives the target edge length DIRECTLY in (u,t) units (|S_dd| already
 * carries the parameter→mm scale — no speed division):
 *   h = clamp( sqrt(8·tol / max(|S_uu|,|S_tt|)), hMin, hMax ).
 * A cylinder r=R is circumferentially curved (|S_uu|=(2π)²R) ⇒ h≈sqrt(8·tol/((2π)²R)),
 * NOT hMax; only a (degenerate) zero-curvature patch saturates at hMax.
 */
export function buildIsotropicSizingField(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number },
): IsotropicSizingField {
  const { resU, resT, tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  // |a − 2c + b| / step²  — central second-difference magnitude (≈ |S_dd|).
  const secondDiff = (
    a: [number, number, number], c: [number, number, number], b: [number, number, number], step: number,
  ): number =>
    Math.hypot(a[0] - 2 * c[0] + b[0], a[1] - 2 * c[1] + b[1], a[2] - 2 * c[2] + b[2]) / (step * step);
  const h = new Float64Array(resU * resT);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      // clamp the stencil centre off the boundary so the ± samples stay in-domain
      const uu = Math.min(Math.max(iu * du, du), 1 - du);
      const tt = Math.min(Math.max(it * dt, dt), 1 - dt);
      const c = S(uu, tt);
      const d2u = secondDiff(S(uu + du, tt), c, S(uu - du, tt), du);
      const d2t = secondDiff(S(uu, tt + dt), c, S(uu, tt - dt), dt);
      const d2max = Math.max(d2u, d2t, 1e-9);
      const hUt = Math.sqrt((8 * tolMm) / d2max);
      h[it * resU + iu] = Math.min(Math.max(hUt, hMin), hMax);
    }
  }
  return { resU, resT, h };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd potfoundry-web && npx vitest run research/bridge/sizingField.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/research/bridge/sizingField.ts potfoundry-web/research/bridge/sizingField.test.ts
git commit -m "feat(meshing-lab): Task 1 — isotropic curvature sizing field over (u,t)"
```

---

## Task 2: Exchange schema + bridge export (TS)

**Why:** define the `(u,t)` JSON exchange and write it from a style's `rAnalytic` + sizing field. (Extracting our *own* conforming `(u,t)` mesh is folded in as the `ours` block; if that extraction needs a not-yet-known internal, fall back to a uniform `(u,t)` grid as `ours` and flag it — the engines' comparison still holds.)

**Files:**
- Create: `potfoundry-web/research/bridge/exchange.ts` (shared TS type + writer)
- Test: `potfoundry-web/research/bridge/exchange.test.ts`

**Interfaces:**
- Consumes: `IsotropicSizingField` (Task 1).
- Produces:
  - `interface OracleInput { style: string; H: number; domain: { uPeriodic: boolean }; sizing: { resU: number; resT: number; h: number[] }; ours: { ut: number[]; indices: number[] } | null; }`
  - `interface OracleOutput { engine: string; config: Record<string, unknown>; ut: number[]; indices: number[]; engineMs: number; engineVersion: string; }`
  - `writeOracleInput(dir: string, input: OracleInput): void` (writes `<dir>/input.json`)
  - `readOracleOutput(path: string): OracleOutput`

- [ ] **Step 1: Write the failing test**

```typescript
// potfoundry-web/research/bridge/exchange.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeOracleInput, readOracleOutput, type OracleInput, type OracleOutput } from './exchange';

describe('exchange round-trip', () => {
  it('writes OracleInput as JSON and reads OracleOutput back losslessly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-oracle-'));
    try {
      const input: OracleInput = {
        style: 'Cyl', H: 120, domain: { uPeriodic: true },
        sizing: { resU: 2, resT: 2, h: [0.1, 0.1, 0.1, 0.1] }, ours: null,
      };
      writeOracleInput(dir, input);
      const parsed = JSON.parse(readFileSync(join(dir, 'input.json'), 'utf8'));
      expect(parsed.style).toBe('Cyl');
      expect(parsed.sizing.h).toHaveLength(4);

      const out: OracleOutput = { engine: 'triangle', config: { minAngle: 30 },
        ut: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2], engineMs: 5, engineVersion: '20230923' };
      writeFileSync(join(dir, 'out.json'), JSON.stringify(out));
      const back = readOracleOutput(join(dir, 'out.json'));
      expect(back.indices).toEqual([0, 1, 2]);
      expect(back.ut).toHaveLength(6);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run research/bridge/exchange.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// potfoundry-web/research/bridge/exchange.ts
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OracleInput {
  style: string;
  H: number;
  domain: { uPeriodic: boolean };
  sizing: { resU: number; resT: number; h: number[] };
  /** Our conforming (u,t) mesh for comparison; null if not extractable (use grid fallback). */
  ours: { ut: number[]; indices: number[] } | null;
}

export interface OracleOutput {
  engine: string;
  config: Record<string, unknown>;
  ut: number[];        // flat [u0,t0, u1,t1, ...]
  indices: number[];   // flat [i0,i1,i2, ...]
  engineMs: number;
  engineVersion: string;
}

export function writeOracleInput(dir: string, input: OracleInput): void {
  writeFileSync(join(dir, 'input.json'), JSON.stringify(input));
}

export function readOracleOutput(path: string): OracleOutput {
  return JSON.parse(readFileSync(path, 'utf8')) as OracleOutput;
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run research/bridge/exchange.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/research/bridge/exchange.ts potfoundry-web/research/bridge/exchange.test.ts
git commit -m "feat(meshing-lab): Task 2 — (u,t) JSON exchange schema + writer/reader"
```

---

## Task 3: Oracle adapters + CLI (Python)

**Files:**
- Create: `potfoundry-web/research/oracle/adapters/triangle_adapter.py`
- Create: `potfoundry-web/research/oracle/adapters/gmsh_adapter.py`
- Create: `potfoundry-web/research/oracle/oracle.py`
- Test: `potfoundry-web/research/oracle/tests/test_adapters.py`

**Interfaces:**
- Consumes: `input.json` (Task 2 `OracleInput` shape).
- Produces: each adapter `mesh(input: dict) -> dict` returning `{engine, config, ut, indices, engineMs, engineVersion}` (Task 2 `OracleOutput` shape). `oracle.py mesh --in <dir> --engine <triangle|gmsh> [--match-budget N]` writes `<dir>/out_<engine>.json`.

- [ ] **Step 1: Write the failing test** (isotropic round-trip; both engines mesh the periodic `(u,t)` unit square at a uniform `h`, return a non-empty triangulation whose vertices stay in `[0,1]²`):

```python
# potfoundry-web/research/oracle/tests/test_adapters.py
import numpy as np
from adapters import triangle_adapter, gmsh_adapter

def _square_input(h=0.1):
    res = 4
    return {"style": "Cyl", "H": 120.0, "domain": {"uPeriodic": True},
            "sizing": {"resU": res, "resT": res, "h": [h] * (res * res)}, "ours": None}

def _check(out):
    ut = np.array(out["ut"]).reshape(-1, 2)
    idx = np.array(out["indices"]).reshape(-1, 3)
    assert idx.shape[0] > 20
    assert ut[:, 0].min() >= -1e-9 and ut[:, 0].max() <= 1 + 1e-9
    assert ut[:, 1].min() >= -1e-9 and ut[:, 1].max() <= 1 + 1e-9

def test_triangle_adapter(): _check(triangle_adapter.mesh(_square_input()))
def test_gmsh_adapter():     _check(gmsh_adapter.mesh(_square_input()))
```

- [ ] **Step 2: Run to verify it fails** — `.venv/Scripts/python.exe -m pytest tests/test_adapters.py -v` → FAIL (import error).

- [ ] **Step 3: Implement the Triangle adapter**

```python
# potfoundry-web/research/oracle/adapters/triangle_adapter.py
"""Isotropic quality CDT of the (u,t) unit square (Shewchuk Triangle)."""
import time
import numpy as np
import triangle as tr

def mesh(input: dict) -> dict:
    t0 = time.perf_counter()
    s = input["sizing"]
    hmin = float(min(s["h"]))            # conservative uniform target this Phase-1A step
    max_area = 0.5 * hmin * hmin         # area of an equilateral-ish triangle of edge ~hmin
    pslg = {"vertices": np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float),
            "segments": np.array([[0, 1], [1, 2], [2, 3], [3, 0]], dtype=int)}
    out = tr.triangulate(pslg, f"pq30a{max_area:.8f}")
    ut = out["vertices"].astype(float).reshape(-1).tolist()
    idx = out["triangles"].astype(int).reshape(-1).tolist()
    return {"engine": "triangle", "config": {"minAngle": 30, "maxArea": max_area},
            "ut": ut, "indices": idx, "engineMs": (time.perf_counter() - t0) * 1000,
            "engineVersion": tr.__version__ if hasattr(tr, "__version__") else "unknown"}
```

- [ ] **Step 4: Implement the gmsh adapter** (isotropic curvature field via a background scalar `View`; anisotropic tensor is Task 6):

```python
# potfoundry-web/research/oracle/adapters/gmsh_adapter.py
"""Frontal-Delaunay quality meshing of the (u,t) square under a scalar size field."""
import time
import numpy as np
import gmsh

def mesh(input: dict) -> dict:
    t0 = time.perf_counter()
    s = input["sizing"]
    resU, resT, h = s["resU"], s["resT"], np.array(s["h"], dtype=float)
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("Mesh.RandomSeed", 1)
        gmsh.option.setNumber("Mesh.Algorithm", 6)  # Frontal-Delaunay
        gmsh.model.add("ut")
        p = [gmsh.model.geo.addPoint(x, y, 0) for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]]
        lines = [gmsh.model.geo.addLine(p[i], p[(i + 1) % 4]) for i in range(4)]
        cl = gmsh.model.geo.addCurveLoop(lines)
        gmsh.model.geo.addPlaneSurface([cl])
        gmsh.model.geo.synchronize()
        # background size field: structured grid view of h(u,t)
        view = gmsh.view.add("size")
        data = []
        for it in range(resT):
            for iu in range(resU):
                u = iu / max(resU - 1, 1); t = it / max(resT - 1, 1)
                data.append([u, t, 0.0, float(h[it * resU + iu])])
        gmsh.view.addListData(view, "SP", len(data), np.array(data).reshape(-1).tolist())
        bg = gmsh.model.mesh.field.add("PostView")
        gmsh.model.mesh.field.setNumber(bg, "ViewIndex", 0)
        gmsh.model.mesh.field.setAsBackgroundMesh(bg)
        gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 0)
        gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
        gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 0)
        gmsh.model.mesh.generate(2)
        tags, coords, _ = gmsh.model.mesh.getNodes()
        coords = coords.reshape(-1, 3)
        idmap = {int(t): i for i, t in enumerate(tags)}
        ut = coords[:, :2].reshape(-1).tolist()
        etypes, etags, enodes = gmsh.model.mesh.getElements(2)
        tri = enodes[list(etypes).index(2)].reshape(-1, 3)
        idx = np.array([[idmap[int(n)] for n in row] for row in tri]).reshape(-1).tolist()
        return {"engine": "gmsh", "config": {"algo": "frontal-delaunay"}, "ut": ut,
                "indices": idx, "engineMs": (time.perf_counter() - t0) * 1000,
                "engineVersion": gmsh.__version__ if hasattr(gmsh, "__version__") else "4.x"}
    finally:
        gmsh.finalize()
```

- [ ] **Step 5: Implement `oracle.py`** (CLI: read `input.json`, dispatch engine, write `out_<engine>.json`; `argparse`; importable adapters via `sys.path`):

```python
# potfoundry-web/research/oracle/oracle.py
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from adapters import triangle_adapter, gmsh_adapter  # noqa: E402

ENGINES = {"triangle": triangle_adapter, "gmsh": gmsh_adapter}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["mesh"])
    ap.add_argument("--in", dest="indir", required=True)
    ap.add_argument("--engine", required=True, choices=list(ENGINES))
    args = ap.parse_args()
    with open(os.path.join(args.indir, "input.json")) as f:
        inp = json.load(f)
    out = ENGINES[args.engine].mesh(inp)
    with open(os.path.join(args.indir, f"out_{args.engine}.json"), "w") as f:
        json.dump(out, f)
    print(f"wrote out_{args.engine}.json: {len(out['indices'])//3} triangles in {out['engineMs']:.0f}ms")

if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run to verify the adapters pass** — `.venv/Scripts/python.exe -m pytest tests/test_adapters.py -v` → PASS (2 tests). (If gmsh's `PostView` background-field API differs in 4.13.1, fall back to `Mesh.MeshSizeFromCurvature=1` + a global `Mesh.MeshSizeFactor` and note the deviation; the smoke is "engine meshes the square at curvature-adaptive density".)

- [ ] **Step 7: Commit**

```bash
git add potfoundry-web/research/oracle/adapters potfoundry-web/research/oracle/oracle.py potfoundry-web/research/oracle/tests/test_adapters.py
git commit -m "feat(meshing-lab): Task 3 — triangle + gmsh (u,t) adapters + oracle CLI"
```

---

## Task 4: Bridge ingest + measure + production-isolation guard (TS)

**Files:**
- Create: `potfoundry-web/research/bridge/measure.ts`
- Test: `potfoundry-web/research/bridge/measure.test.ts`
- Test: `potfoundry-web/research/bridge/isolation.test.ts`

**Interfaces:**
- Consumes: `OracleOutput` (Task 2); `perpendicular3DDeviation`, `AnalyticRadiusFn`, `AnalyticDevOpts` from `../../src/fidelity/analyticSurfaceGate`; `triangleQualityDistribution` + `MeshView` from `../../src/fidelity/metrics` / `types`.
- Produces: `liftUtToRadial(ut: number[], rA: AnalyticRadiusFn, H: number): { vertices: Float32Array; utFlat: Float32Array }` and `measureOracleMesh(out: OracleOutput, rA: AnalyticRadiusFn, H: number, opts: Partial<AnalyticDevOpts>): ScoreRow` where `ScoreRow = { engine: string; tris: number; chordP99Mm: number; chordMaxMm: number; vertexMaxMm: number; pctUnder20deg: number; minAngleDeg: number; engineMs: number }`.

- [ ] **Step 1: Write the failing test** (lift a known triangulation of the cylinder; vertices land on the surface ⇒ `vertexMaxMm≈0`; chord is finite ≥0; a coarse mesh has a worse min-angle distribution than a fine one):

```typescript
// potfoundry-web/research/bridge/measure.test.ts
import { describe, it, expect } from 'vitest';
import { liftUtToRadial, measureOracleMesh } from './measure';
import type { OracleOutput } from './exchange';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const grid = (n: number): OracleOutput => {
  const ut: number[] = [], idx: number[] = [];
  const nv = n + 1;
  for (let it = 0; it <= n; it++) for (let iu = 0; iu <= n; iu++) ut.push(iu / n, it / n);
  for (let it = 0; it < n; it++) for (let iu = 0; iu < n; iu++) {
    const a = it * nv + iu, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  return { engine: 'grid', config: {}, ut, indices: idx, engineMs: 0, engineVersion: 't' };
};

describe('measureOracleMesh', () => {
  const rA: AnalyticRadiusFn = () => 50; // cylinder
  it('vertices lifted onto the analytic surface read ~0 vertex deviation', () => {
    const row = measureOracleMesh(grid(24), rA, 120, { tolMm: 0.1, seamExclU: 0, denseN: 6 });
    expect(row.vertexMaxMm).toBeLessThan(1e-3);
    expect(row.chordMaxMm).toBeGreaterThanOrEqual(0);
    expect(row.tris).toBe(24 * 24 * 2);
  });
  it('a curved wall: finer mesh → lower chord', () => {
    const fluted: AnalyticRadiusFn = (th) => 50 + 3 * Math.cos(8 * th);
    const coarse = measureOracleMesh(grid(16), fluted, 120, { tolMm: 0.1, seamExclU: 0, denseN: 6 });
    const fine = measureOracleMesh(grid(64), fluted, 120, { tolMm: 0.1, seamExclU: 0, denseN: 6 });
    expect(fine.chordP99Mm).toBeLessThan(coarse.chordP99Mm);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run research/bridge/measure.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// potfoundry-web/research/bridge/measure.ts
import { perpendicular3DDeviation, type AnalyticRadiusFn, type AnalyticDevOpts } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { OracleOutput } from './exchange';

const TAU = 2 * Math.PI;

export interface ScoreRow {
  engine: string; tris: number; chordP99Mm: number; chordMaxMm: number;
  vertexMaxMm: number; pctUnder20deg: number; minAngleDeg: number; engineMs: number;
}

export function liftUtToRadial(ut: number[], rA: AnalyticRadiusFn, H: number):
  { vertices: Float32Array; utFlat: Float32Array } {
  const n = ut.length / 2;
  const v = new Float32Array(n * 3), uf = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = ut[2 * i], t = ut[2 * i + 1];
    const th = TAU * u, z = t * H, r = rA(th, z);
    v[3 * i] = r * Math.cos(th); v[3 * i + 1] = r * Math.sin(th); v[3 * i + 2] = z;
    uf[3 * i] = u; uf[3 * i + 1] = t; uf[3 * i + 2] = 0;
  }
  return { vertices: v, utFlat: uf };
}

export function measureOracleMesh(
  out: OracleOutput, rA: AnalyticRadiusFn, H: number, opts: Partial<AnalyticDevOpts>,
): ScoreRow {
  const { vertices, utFlat } = liftUtToRadial(out.ut, rA, H);
  const indices = Uint32Array.from(out.indices);
  const full: AnalyticDevOpts = { H, tolMm: opts.tolMm ?? 0.1, seamExclU: opts.seamExclU ?? 0,
    denseN: opts.denseN ?? 8, ...opts };
  const dev = perpendicular3DDeviation({ vertices, indices }, utFlat, rA, full);
  const q = triangleQualityDistribution({ vertices, indices });
  return {
    engine: out.engine, tris: indices.length / 3,
    chordP99Mm: dev.p99DevMm, chordMaxMm: dev.chordMaxMm, vertexMaxMm: dev.vertexMaxMm,
    pctUnder20deg: q.pctUnder20deg ?? percentUnder(q, 20), minAngleDeg: q.minAngleDeg ?? q.minAngle ?? 0,
    engineMs: out.engineMs,
  };
}

// `triangleQualityDistribution` returns a histogram; derive %<20° if not provided directly.
function percentUnder(q: { histogram?: ArrayLike<number>; triangleCount?: number }, deg: number): number {
  const h = q.histogram; if (!h || !q.triangleCount) return 0;
  let below = 0; for (let i = 0; i < deg && i < h.length; i++) below += h[i];
  return (100 * below) / q.triangleCount;
}
```
*(Step 3a: open `src/fidelity/metrics.ts:758` `triangleQualityDistribution` and adjust the `ScoreRow` derivation to its ACTUAL return fields — use the real property names; the `percentUnder` fallback covers the histogram case. Re-run the test after aligning.)*

- [ ] **Step 4: Run to verify it passes** — `npx vitest run research/bridge/measure.test.ts` → PASS.

- [ ] **Step 5: Write + run the production-isolation guard**

```typescript
// potfoundry-web/research/bridge/isolation.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe('production isolation', () => {
  it('no file under src/ imports from research/', () => {
    const offenders = walk('src').filter((f) => /from ['"].*research\//.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```
Run: `cd potfoundry-web && npx vitest run research/bridge/isolation.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add potfoundry-web/research/bridge/measure.ts potfoundry-web/research/bridge/measure.test.ts potfoundry-web/research/bridge/isolation.test.ts
git commit -m "feat(meshing-lab): Task 4 — ingest+measure oracle (u,t) via existing instruments + isolation guard"
```

---

## Task 5: Two-style end-to-end proof (the spike verdict)

**Why:** prove the whole loop on 1 tractable + 1 tangled style before scaling. This is the spike's go/no-go.

**Files:**
- Create: `potfoundry-web/research/bridge/runStyle.ts` (node script: style → input.json → invoke oracle CLI via `child_process` → ingest → ScoreRow[])
- Create: `potfoundry-web/research/bridge/runStyle.test.ts` (drives 2 styles; asserts both engines return a measurable ScoreRow)

**Interfaces:**
- Consumes: Tasks 1–4; the per-style `rAnalytic` builder. **Step 0 (read first):** open `src/fidelity/fidelityGate.ts` to reuse its `rAnalytic` + per-style `AnalyticDevOpts` (seam/crease exclusion) construction — do NOT re-derive style formulas.

- [ ] **Step 1:** Read `src/fidelity/fidelityGate.ts`; note the exact helper that yields `{ rAnalytic, opts, H }` for a style id. Record its signature in this task.
- [ ] **Step 2: Write the failing test** — for `['GeometricStar' (tractable), 'BasketWeave' (tangled)]`, build input (sizing field from Task 1, `ours=null` grid fallback if our `(u,t)` isn't yet extractable), run `triangle` + `gmsh`, ingest, and assert each `ScoreRow.tris > 0` and `chordP99Mm` finite. Run: `npx vitest run research/bridge/runStyle.test.ts` → FAIL.
- [ ] **Step 3: Implement `runStyle.ts`** — `child_process.execFileSync('research/oracle/.venv/Scripts/python.exe', ['research/oracle/oracle.py','mesh','--in',dir,'--engine',e])`, then `readOracleOutput` + `measureOracleMesh`. (Full code written against the Task-1–4 signatures + the Step-1 `fidelityGate` helper.)
- [ ] **Step 4: Run → PASS.** Print the 2×2 ScoreRow table (style × engine) to the console.
- [ ] **Step 5: Record the spike verdict** in `research/EXPERIMENT-REGISTRY.md` (new file): the 2-style scorecard + a GO/NO-GO note (GO if both engines produce measurable rows and at least one shows a chord/angle delta vs the grid fallback).
- [ ] **Step 6: Commit**
```bash
git add potfoundry-web/research/bridge/runStyle.ts potfoundry-web/research/bridge/runStyle.test.ts potfoundry-web/research/EXPERIMENT-REGISTRY.md
git commit -m "feat(meshing-lab): Task 5 — 2-style end-to-end spike + verdict"
```

---

## Tasks 6–10 (expanded after the Task-5 spike GO; outline locked, code detailed post-spike)

These are real, scoped tasks; their full TDD code is written once Task 5 confirms the loop (per the project's spike-then-build practice). They do not block 1A.

- **Task 6 — Anisotropic gmsh metric.** Replace the scalar size field with a per-node **2×2 metric tensor** from the surface second fundamental form (principal curvatures of `S(θ,z)`), supplied as a gmsh background tensor view (`"TP"` list data). Test: an anisotropic fluted wall yields elongated triangles aligned to the low-curvature direction and a lower chord at equal tri-count than the isotropic field. *This is the load-bearing test for H1 (tangled styles).*
- **Task 7 — `--match-budget`.** Binary-search the engine size scalar until `tris` is within ±10% of the target (our tri-count per style). Test: converges on a known case; logs "budget-approx" if it cannot.
- **Task 8 — All-20 re-baseline.** Pre-register H1/H2/H3 + kill-criteria in `EXPERIMENT-REGISTRY.md` (committed BEFORE the run). Run all 20 styles × {ours, triangle:ruppert, gmsh:iso, gmsh:aniso} budget-matched; write `_scorecard.json` + a `docs/superpowers/specs/2026-06-26-rebaseline-sota-vs-ours.md` result doc with the per-style table and the H1/H2/H3 verdicts. Decide the next arc from the verdicts.
- **Task 9 — Skills.** Author `.claude/skills/meshing/meshing-research/SKILL.md` (the protocol + levers + gates + hard rules), `.claude/skills/meshing/oracle-harness/SKILL.md` (setup + CLI + the Blender QuadriFlow recipe + engine status), and seed `.claude/skills/meshing/tessellation-knowledge/SKILL.md` (the four load-bearing rows from spec §5, cited-or-measured). Per `superpowers:writing-skills`.
- **Task 10 — Subagent.** Author `.claude/agents/meshing-researcher.md` (spec §8): protocol + skill pointers + tool allowlist + the CPU-first/GPU-serialize rule + hard rules; returns a structured finding. Validate by having it reproduce one Task-8 verdict end-to-end.

---

## Self-Review

**Spec coverage:** C1 knowledge skill → Task 9. C2 harness → Tasks 0,1,2,3,4 (+6,7). C3 workflow skill → Task 9. C4 subagent → Task 10. Proving-ground re-baseline → Tasks 5 (spike) + 8 (all-20). One-metric-both-meshes → Task 4 (same instruments, analytic lift). Pre-registration → Task 8. Testing §10 → Tasks 0 (smoke), 2 (round-trip), 4 (source-agnostic + isolation), 7 (budget). Standing constraints → Global Constraints + the isolation guard. **Deviation from spec (documented in the header callout):** GPU `reference.ply`/`ours.ply` + Blender remesh + libigl are deferred to Phase 2; the Phase-1 chord comparison is CPU-only via the analytic instrument. No spec requirement is dropped — they move phase.

**Placeholder scan:** Tasks 0–4 carry complete code. Task 5 references Task-1–4 signatures + a `fidelityGate` helper read in its own Step 1 (not a placeholder — a grounded read step). Tasks 6–10 are explicitly outline-now/detail-post-spike per the project's spike practice, not TBDs.

**Type consistency:** `OracleInput`/`OracleOutput` (Task 2) are consumed unchanged in Tasks 3 (Python mirror) + 4 (`measureOracleMesh`). `ScoreRow` (Task 4) flows to Tasks 5 + 8. `AnalyticRadiusFn`/`AnalyticDevOpts`/`perpendicular3DDeviation` match `analyticSurfaceGate.ts:35/37/567`. `triangleQualityDistribution` field names are aligned to the real return in Task 4 Step 3a (flagged read).

## Execution Handoff

Phase-1A (Tasks 0–5) is the de-risk spike; Phase-1B (Tasks 6–10) is detailed after the Task-5 GO. Execution proceeds via **subagent-driven-development** (fresh subagent per task, controller review between tasks), with the load-bearing Task 0 run first.
