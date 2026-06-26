/**
 * threeDDirectVsUv.test.ts — Experiment E-2026-06-26-3D-DIRECT-VS-UV
 *
 * THE ARCHITECTURAL FORK (de-risk):
 *   Does meshing the surface DIRECTLY in 3D beat UV-(u,t)-metric meshing on the
 *   tangled lattices — capturing the relief AND staying clean — at equal triangle
 *   budget?
 *
 *   §3.5 of 2026-06-26-rebaseline-sota-vs-ours.md found gmsh (UV-(u,t) under a
 *   band-limited metric) at tol=0.05 UNDER-tessellates and LOSES the relief
 *   (BasketWeave mushy, Gyroid jagged) even though its triangle angles are clean.
 *   Hypothesis: a mesher that places/refines triangles by REAL 3D-surface criteria
 *   (not a lossy 2D metric proxy) captures the relief AND stays clean.
 *
 * PRE-REGISTERED HYPOTHESIS (kill-criterion fixed BEFORE running):
 *   H: A 3D-DIRECT remesh of the dense true surface achieves LOWER mean/RMS
 *      fidelity deviation (rmsDevMm — captures the relief) at a minAngleDeg NO
 *      WORSE than gmsh-iso, at EQUAL triangle count, on BOTH GyroidManifold and
 *      BasketWeave.
 *
 * KILL-CRITERION (pre-registered):
 *   For a 3D-direct method (cvt OR qem), on a given style at ~equal tri budget
 *   (within ±5% of gmsh-iso's count):
 *     CONFIRMED  if  rmsDevMm(3d-direct) < rmsDevMm(gmsh-iso)        [captures relief]
 *               AND  minAngleDeg(3d-direct) >= gmsh-iso minAngleDeg - 2°  [no worse quality]
 *     REFUTED    if  rmsDevMm(3d-direct) >= rmsDevMm(gmsh-iso)       [no fidelity gain]
 *               OR   minAngleDeg(3d-direct) < gmsh-iso minAngleDeg - 2°  [worse quality]
 *   OVERALL CONFIRMED iff at least one 3D-direct method CONFIRMS on BOTH styles.
 *   (rms is the HONEST fidelity channel per §3.5 — p99 is blind to under-
 *   tessellation, dominated by the shared near-C0 creases. minAngle is depth-
 *   invariant per the OPUS run. Both reported.)
 *
 * FAIRNESS CONTROLS:
 *   - Equal triangle budget: each 3D-direct mesh is targeted to gmsh-iso's tri
 *     count for that style (±5%); a 2nd point at gmsh-aniso's (lower) count too.
 *   - ONE instrument, every mesh: perpendicular3DDeviation (rms+p99) +
 *     triangleQualityDistribution (minAngle+%<20°). Same lift (analytic rA) for
 *     the dense truth, the oracle (u,t), and the projection reference.
 *   - The dense truth (512×512) is measured too: its own rmsDevMm is the fidelity
 *     FLOOR (must be ~0 — it IS the reference, sanity check that the surface is
 *     captured by a fine enough mesh).
 *   - GENUINE gmsh-aniso via runStyle({aniso:true}) (the metric IS wired; verified
 *     by aniso tris != iso tris).
 *
 * Dumps: research/exchange/_3ddirect/  (gitignored, NEW dir — does NOT touch _oursvssota*).
 *
 * Run:
 *   PF_3D_DIRECT=1 npx vitest run research/bridge/threeDDirectVsUv.test.ts
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runStyle, buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

// ── Shared dims & tolerances (EQUAL across all configs) ──────────────────────
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL_MM   = 0.05;
const SIZE_RES = 32;
const HMIN     = 0.005;
const HMAX     = 0.1;

// Dense true-surface grid resolution (the reference surface lifted via analytic rA).
// 768² (1.18M tris) is the most FAITHFUL feasible reference: a convergence probe
// (_denseConvProbe) found the dense-truth rmsDevMm only reaches ~0.10mm (Gyroid) /
// ~0.23mm (BasketWeave) here — it does NOT go to ~0, because chordMax is PINNED
// (Gyroid ~1.02 / BasketWeave ~1.74, density-invariant 256²→768²): the worst facets
// straddle a near-C0 relief STEP (chord ≈ ½ step height), the project's irreducible
// steep-relief accept-class. Remeshing FROM the finest faithful source gives the
// 3D-direct candidate its BEST shot (steelman). Env-overridable for cheap wiring checks.
const DENSE_RES_U = Number(process.env.PF_3D_DIRECT_DENSE ?? 768);
const DENSE_RES_T = Number(process.env.PF_3D_DIRECT_DENSE ?? 768);

const STYLES: StyleId[] = ['GyroidManifold', 'BasketWeave'] as StyleId[];

// ── Output paths (NEW dir — must NOT touch _oursvssota / _oursvssota_opus) ────
const EXCHANGE_BASE  = join('research', 'exchange');
const DUMP_DIR       = join(EXCHANGE_BASE, '_3ddirect');
const SCORECARD_PATH = join(DUMP_DIR, 'scorecard.json');

// ── Python remesher ──────────────────────────────────────────────────────────
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY_BIN  = `research/oracle/.venv/${VENV_PY}`;
const REMESH  = 'research/bridge/remesh3d.py';

interface MeshMetrics {
  triCount:      number;
  minAngleDeg:   number;
  pctUnder20deg: number;
  rmsDevMm:      number;   // HONEST fidelity channel (captures under-tessellation)
  chordP99Mm:    number;   // reported but NOT the verdict channel (§3.5 blind)
  chordMaxMm:    number;
  vertexMaxMm:   number;
}

interface ScoreRow extends MeshMetrics {
  style:  string;
  config: string;
  budget: string;          // which tri budget this row targets (iso / aniso / dense)
  error?: string;
}

/**
 * Measure a 3D mesh {xyz, indices} with the project instruments. For a 3D-direct
 * mesh we synthesize the parallel (u,t,surfaceId) the instrument needs:
 *   u = wrap(atan2(y,x)/TAU), t = z/H, surfaceId = 0  (the whole patch is the
 * outer wall). seamExclU=0 + no crease loci ⇒ nothing excluded — IDENTICAL
 * exclusion regime to how the oracle meshes are measured (apples-to-apples).
 * The CHORD channel recovers (theta,z) from xyz and projects to rA via
 * Gauss-Newton regardless, so it is honest 3D facet→surface distance.
 */
function measure3DMesh(
  styleId: StyleId,
  xyz: Float32Array,
  indices: Uint32Array,
): MeshMetrics {
  const rA = buildRadiusFn(styleId, {}, DIMS);
  const n = xyz.length / 3;
  const utFlat = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
    let u = Math.atan2(y, x) / TAU;
    u = ((u % 1) + 1) % 1;
    utFlat[3 * i] = u;
    utFlat[3 * i + 1] = z / DIMS.H;
    utFlat[3 * i + 2] = 0; // surfaceId 0 → outer wall, all measured
  }
  const dev = perpendicular3DDeviation(
    { vertices: xyz, indices }, utFlat, rA,
    { H: DIMS.H, tolMm: TOL_MM, seamExclU: 0, denseN: 8 },
  );
  const q = triangleQualityDistribution({ vertices: xyz, indices });
  return {
    triCount:      indices.length / 3,
    minAngleDeg:   q.minAngleDeg,
    pctUnder20deg: q.pctBelow20,
    rmsDevMm:      dev.rmsDevMm,
    chordP99Mm:    dev.p99DevMm,
    chordMaxMm:    dev.chordMaxMm,
    vertexMaxMm:   dev.vertexMaxMm,
  };
}

/**
 * Build the DENSE true-surface 3D mesh: a fine (u,t) grid lifted via the analytic
 * rA (the production-identical lift measure.ts uses). Periodic in u (wrap the
 * column index, NOT t). Returns 3D vertices + triangle indices.
 */
function buildDenseTruth(styleId: StyleId): { xyz: Float32Array; indices: Uint32Array } {
  const rA = buildRadiusFn(styleId, {}, DIMS);
  const nu = DENSE_RES_U, nt = DENSE_RES_T;
  // flat (u,t) stride-2 grid (u in [0,1), endpoint excluded → seamless wrap; t in [0,1])
  const ut2 = new Array<number>(nu * nt * 2);
  for (let i = 0; i < nu; i++) {
    const u = i / nu; // periodic: endpoint excluded
    for (let j = 0; j < nt; j++) {
      const t = j / (nt - 1);
      const k = i * nt + j;
      ut2[2 * k] = u;
      ut2[2 * k + 1] = t;
    }
  }
  const { vertices: xyz } = liftUtToRadial(ut2, rA, DIMS.H);
  // triangulate the cylinder grid, wrapping u
  const idx = (i: number, j: number): number => ((i % nu) * nt + j);
  const indices: number[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nt - 1; j++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }
  return { xyz, indices: Uint32Array.from(indices) };
}

interface RemeshOut { method: string; vertices: number[]; indices: number[]; targetTris: number; ms: number; version: string; }

function runRemesh(dir: string, method: 'cvt' | 'qem', targetTris: number): RemeshOut {
  execFileSync(PY_BIN, [REMESH, '--in', dir, '--method', method, '--target-tris', String(targetTris)], { stdio: 'pipe' });
  return JSON.parse(readFileSync(join(dir, `remesh_${method}.json`), 'utf8')) as RemeshOut;
}

// ── Main batch test ───────────────────────────────────────────────────────────
describe('E-2026-06-26-3D-DIRECT-VS-UV: 3D-direct remesh vs gmsh UV-metric', () => {
  it.skipIf(!process.env.PF_3D_DIRECT)(
    '2 styles × {gmsh-iso, gmsh-aniso, cvt, qem (@iso & @aniso budget), dense} — rms+minAngle at equal budget',
    () => {
      mkdirSync(DUMP_DIR, { recursive: true });
      const rows: ScoreRow[] = [];
      const flush = (): void => { writeFileSync(SCORECARD_PATH, JSON.stringify(rows, null, 2)); };
      const log = (r: ScoreRow): void => {
        const s = r.error
          ? `ERR ${r.error.slice(0, 120)}`
          : `tris=${r.triCount} rms=${r.rmsDevMm.toFixed(4)} p99=${r.chordP99Mm.toFixed(3)} minAng=${r.minAngleDeg.toFixed(1)} %<20=${r.pctUnder20deg.toFixed(1)}`;
        // eslint-disable-next-line no-console
        console.log(`  ${r.style}/${r.config} [@${r.budget}]: ${s}`);
      };

      for (const styleId of STYLES) {
        // eslint-disable-next-line no-console
        console.log(`\n[${String(styleId)}]`);
        const dir = join(EXCHANGE_BASE, String(styleId));
        mkdirSync(dir, { recursive: true });

        // ── (A) UV baselines via runStyle (GENUINE aniso — runStyle wires the metric) ──
        // Each gmsh config run ONCE; re-measured from its own out_gmsh.json with the
        // SAME 3D measurer (measure3DMesh) used for the 3D-direct meshes, so rmsDevMm is
        // produced by ONE instrument path for every config (runStyle's ScoreRow omits rms).
        let isoTris = 0, anisoTris = 0;
        for (const [cfg, aniso, budget] of [['gmsh-iso', false, 'iso'], ['gmsh-aniso', true, 'aniso']] as const) {
          try {
            runStyle(styleId, DIMS, ['gmsh'], { tolMm: TOL_MM, sizeRes: SIZE_RES, hMin: HMIN, hMax: HMAX, aniso });
            const raw = JSON.parse(readFileSync(join(dir, 'out_gmsh.json'), 'utf8')) as { ut: number[]; indices: number[] };
            const { vertices: xyz } = liftUtToRadial(raw.ut, buildRadiusFn(styleId, {}, DIMS), DIMS.H);
            const m = measure3DMesh(styleId, xyz, Uint32Array.from(raw.indices));
            if (cfg === 'gmsh-iso') isoTris = m.triCount; else anisoTris = m.triCount;
            const row: ScoreRow = { style: String(styleId), config: cfg, budget, ...m };
            rows.push(row); flush(); log(row);
            writeFileSync(join(DUMP_DIR, `${String(styleId)}__${cfg}.json`),
              JSON.stringify({ style: String(styleId), config: cfg, budget, xyz: Array.from(xyz), tris: raw.indices, ...m }));
          } catch (e) {
            const row: ScoreRow = { style: String(styleId), config: cfg, budget, triCount: 0, minAngleDeg: -1, pctUnder20deg: -1, rmsDevMm: -1, chordP99Mm: -1, chordMaxMm: -1, vertexMaxMm: -1, error: String(e).slice(0, 400) };
            rows.push(row); flush(); log(row);
          }
        }

        // ── (B) Build dense truth, write dense.json, measure its floor ──
        const dense = buildDenseTruth(styleId);
        writeFileSync(join(dir, 'dense.json'),
          JSON.stringify({ vertices: Array.from(dense.xyz), indices: Array.from(dense.indices) }));
        const denseM = measure3DMesh(styleId, dense.xyz, dense.indices);
        const denseRow: ScoreRow = { style: String(styleId), config: 'dense-truth', budget: 'dense', ...denseM };
        rows.push(denseRow); flush(); log(denseRow);

        // ── (C) 3D-direct remeshes @ iso budget AND @ aniso budget ──
        const budgets: Array<[string, number]> = [];
        if (isoTris > 0) budgets.push(['iso', isoTris]);
        if (anisoTris > 0) budgets.push(['aniso', anisoTris]);
        for (const [budgetName, targetTris] of budgets) {
          for (const method of ['cvt', 'qem'] as const) {
            try {
              const rm = runRemesh(dir, method, targetTris);
              const xyz = Float32Array.from(rm.vertices);
              const idx = Uint32Array.from(rm.indices);
              const m = measure3DMesh(styleId, xyz, idx);
              const cfg = `${method}-3d`;
              const row: ScoreRow = { style: String(styleId), config: cfg, budget: budgetName, ...m };
              rows.push(row); flush(); log(row);
              writeFileSync(join(DUMP_DIR, `${String(styleId)}__${cfg}__${budgetName}.json`),
                JSON.stringify({ style: String(styleId), config: cfg, budget: budgetName, version: rm.version, ms: rm.ms, xyz: rm.vertices, tris: rm.indices, ...m }));
            } catch (e) {
              const row: ScoreRow = { style: String(styleId), config: `${method}-3d`, budget: budgetName, triCount: 0, minAngleDeg: -1, pctUnder20deg: -1, rmsDevMm: -1, chordP99Mm: -1, chordMaxMm: -1, vertexMaxMm: -1, error: String(e).slice(0, 400) };
              rows.push(row); flush(); log(row);
            }
          }
        }
      }

      // ── Kill-criterion classification (vs gmsh-iso, equal budget) ──
      // eslint-disable-next-line no-console
      console.log('\n=== KILL-CRITERION (3d-direct rms < gmsh-iso rms AND minAngle >= gmsh-iso minAngle - 2°, @iso budget) ===');
      const styleConfirms: Record<string, boolean> = {};
      for (const styleId of STYLES) {
        const iso = rows.find(r => r.style === String(styleId) && r.config === 'gmsh-iso');
        if (!iso || iso.error) { styleConfirms[String(styleId)] = false; continue; }
        let anyMethodConfirms = false;
        for (const method of ['cvt-3d', 'qem-3d']) {
          const d = rows.find(r => r.style === String(styleId) && r.config === method && r.budget === 'iso');
          if (!d || d.error) continue;
          // equal-budget guard: within ±5% of iso tris
          const budgetOk = Math.abs(d.triCount - iso.triCount) / iso.triCount <= 0.05;
          const fidelityWin = d.rmsDevMm < iso.rmsDevMm;
          const qualityOk = d.minAngleDeg >= iso.minAngleDeg - 2;
          const verdict = budgetOk && fidelityWin && qualityOk ? 'CONFIRMED' : 'REFUTED';
          // eslint-disable-next-line no-console
          console.log(`  ${String(styleId)}/${method}: rms ${d.rmsDevMm.toFixed(4)} vs iso ${iso.rmsDevMm.toFixed(4)} | minAng ${d.minAngleDeg.toFixed(1)} vs iso ${iso.minAngleDeg.toFixed(1)} | tris ${d.triCount} vs ${iso.triCount} (budgetOk=${budgetOk}) → ${verdict}`);
          if (verdict === 'CONFIRMED') anyMethodConfirms = true;
        }
        styleConfirms[String(styleId)] = anyMethodConfirms;
      }
      const overall = STYLES.every(s => styleConfirms[String(s)]);
      // eslint-disable-next-line no-console
      console.log(`\nOVERALL: ${overall ? 'CONFIRMED' : 'REFUTED'} (per-style: ${JSON.stringify(styleConfirms)})`);
      // eslint-disable-next-line no-console
      console.log(`Scorecard: ${SCORECARD_PATH}\nDump dir:  ${DUMP_DIR}`);

      // Non-vacuous: both styles produced gmsh-iso + dense + at least cvt/qem @ iso.
      for (const styleId of STYLES) {
        expect(existsSync(join(DUMP_DIR, `${String(styleId)}__gmsh-iso.json`)), `missing iso dump ${String(styleId)}`).toBe(true);
      }
      expect(rows.length).toBeGreaterThanOrEqual(STYLES.length * 5);
    },
    25 * 60 * 1000, // 25-min cap
  );
});
