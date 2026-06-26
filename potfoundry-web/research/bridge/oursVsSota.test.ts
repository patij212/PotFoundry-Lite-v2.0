/**
 * oursVsSota.test.ts — Experiment E-2026-06-26-OURS-VS-SOTA
 *
 * PRE-REGISTERED HYPOTHESIS (kill-criterion fixed before running):
 *   H: The production conforming mesher's `%<20°` on the 5 tangled-lattice styles
 *      is WORSE than gmsh-iso by more than 5 pp on EVERY tangled style.
 *      Mechanism claim: the 2:1-balanced quadtree transition templates are the
 *      dominant sliver source (per the all-20 rebaseline finding).
 *
 * KILL-CRITERION (pre-registered):
 *   CONFIRMED if: ours `%<20°` > gmsh-iso `%<20°` + 5 pp on ALL 5 tangled styles.
 *   REFUTED if: any tangled style has ours `%<20°` ≤ gmsh-iso `%<20°` + 5 pp.
 *
 * WARP CAVEAT (mandatory, stated here):
 *   `buildConformingOuterWall` returns the PRE-warp quadtree grid. The crease-warp
 *   (applyUWarp/applyTWarp/applyHelixWarp) is applied downstream in WatertightAssembly.
 *   The 2:1 transition-template slivers ARE a (u,t)-topology property and ARE present
 *   here. However, on warped tangled styles the 3D min-angles differ from production
 *   final output. All 4 configs are measured in identically-lifted (u,t)→3D space
 *   (via rA), so it is a fair equal-footing comparison — but the `ours` number is
 *   NOT a production-faithful absolute. This is the same lifting all oracle configs use.
 *
 * Run:
 *   PF_OURS_VS_SOTA=1 npx vitest run research/bridge/oursVsSota.test.ts
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runStyle, buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { buildIsotropicSizingField } from './sizingField';
import { writeOracleInput } from './exchange';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { buildConformingOuterWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingOuterWall';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleId } from '../../src/geometry/types';

// ── Shared dims & tolerances (EQUAL across all configs) ──────────────────────
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL_MM   = 0.05;
const SIZE_RES = 32;
const HMIN     = 0.005;
const HMAX     = 0.1;

// ── Production conforming opts ────────────────────────────────────────────────
// Sourced from ParametricExportComputer.ts probe block (lines 2206-2210).
// maxSagMm=0.05 matches oracle tol=0.05 for equal-footing comparison.
// Production CAD path uses 0.003; using 0.05 here is intentional for parity.
const OURS_OPTS = {
  maxSagMm:   TOL_MM,
  maxEdgeMm:  8,
  minEdgeMm:  0.2,
  gradeRatio: 2,
  maxLevel:   10,
  resU:       128,
  resT:       128,
} as const;

// ── Styles under test ────────────────────────────────────────────────────────
const TANGLED: StyleId[] = [
  'GyroidManifold', 'BasketWeave', 'CelticKnot', 'CelticTriquetra', 'GothicArches',
] as StyleId[];
const SMOOTH: StyleId[] = ['SuperellipseMorph'] as StyleId[];
const STYLES: StyleId[] = [...TANGLED, ...SMOOTH];

// ── Output paths ─────────────────────────────────────────────────────────────
const EXCHANGE_BASE  = join('research', 'exchange');
const DUMP_DIR       = join(EXCHANGE_BASE, '_oursvssota');
const SCORECARD_PATH = join(DUMP_DIR, 'scorecard.json');

// ── Types ────────────────────────────────────────────────────────────────────
interface MeshMetrics {
  triCount:      number;
  minAngleDeg:   number;
  pctUnder20deg: number;
  chordP99Mm:    number;
  vertexMaxMm:   number;
}

interface DumpRow extends MeshMetrics {
  style:  string;
  config: string;
  ut2:    number[];
  xyz:    number[];
  tris:   number[];
}

interface ScoreRow extends MeshMetrics {
  style:  string;
  config: string;
  error?: string;
}

// ── Measurement ───────────────────────────────────────────────────────────────
/**
 * Measure a (u,t) mesh (stride-3 vertices with surfaceId in slot 2) using the
 * same instruments as the oracle harness: perpendicular3DDeviation + triangleQualityDistribution.
 */
function measureUtMesh(
  styleId: StyleId,
  vertices: Float32Array,   // stride-3: [u,t,surfaceId, ...]
  indices: Uint32Array,
): MeshMetrics {
  const rA = buildRadiusFn(styleId, {}, DIMS);
  const n = vertices.length / 3;
  // Repack stride-3 → stride-2 for liftUtToRadial
  const ut2 = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) {
    ut2[2 * i]     = vertices[3 * i];
    ut2[2 * i + 1] = vertices[3 * i + 1];
  }
  const { vertices: xyz, utFlat } = liftUtToRadial(ut2, rA, DIMS.H);
  const dev = perpendicular3DDeviation(
    { vertices: xyz, indices },
    utFlat,
    rA,
    { H: DIMS.H, tolMm: TOL_MM, seamExclU: 0, denseN: 8 },
  );
  const q = triangleQualityDistribution({ vertices: xyz, indices });
  return {
    triCount:      indices.length / 3,
    minAngleDeg:   q.minAngleDeg,
    pctUnder20deg: q.pctBelow20,
    chordP99Mm:    dev.p99DevMm,
    vertexMaxMm:   dev.vertexMaxMm,
  };
}

/**
 * Lift flat ut2 (stride-2) to 3D xyz and build the dump row.
 */
function buildDumpFromUt2(
  styleId: StyleId, config: string,
  ut2: number[], indices: number[],
  metrics: MeshMetrics,
): DumpRow {
  const rA = buildRadiusFn(styleId, {}, DIMS);
  const { vertices: xyzArr } = liftUtToRadial(ut2, rA, DIMS.H);
  return {
    style: String(styleId), config,
    ut2, xyz: Array.from(xyzArr), tris: indices,
    ...metrics,
  };
}

function writeDump(row: DumpRow): void {
  const path = join(DUMP_DIR, `${row.style}__${row.config}.json`);
  writeFileSync(path, JSON.stringify(row));
}

// ── Oracle engine runner (one config at a time for correct file naming) ───────
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY_BIN  = `research/oracle/.venv/${VENV_PY}`;
const ORACLE   = 'research/oracle/oracle.py';

interface OracleRawOut { ut: number[]; indices: number[]; engineMs: number; }

function runOracleEngine(
  styleId: StyleId,
  engine: string,
  aniso: boolean,
  config: string,
): ScoreRow {
  try {
    const rA = buildRadiusFn(styleId, {}, DIMS);
    const field = buildIsotropicSizingField(rA, DIMS.H, {
      resU: SIZE_RES, resT: SIZE_RES, tolMm: TOL_MM, hMin: HMIN, hMax: HMAX,
    });
    const dir = join(EXCHANGE_BASE, String(styleId));
    mkdirSync(dir, { recursive: true });
    const input = {
      style: String(styleId), H: DIMS.H, domain: { uPeriodic: true },
      sizing: { resU: field.resU, resT: field.resT, h: Array.from(field.h) },
      ours: null,
    };
    writeOracleInput(dir, input);
    execFileSync(PY_BIN, [ORACLE, 'mesh', '--in', dir, '--engine', engine], { stdio: 'pipe' });
    const outPath = join(dir, `out_${engine}.json`);
    const raw = JSON.parse(readFileSync(outPath, 'utf8')) as OracleRawOut;

    // Measure using the project's own instruments (one-metric-both-meshes rule)
    const rA2 = buildRadiusFn(styleId, {}, DIMS);
    const { vertices: xyz, utFlat } = liftUtToRadial(raw.ut, rA2, DIMS.H);
    const indicesU32 = Uint32Array.from(raw.indices);
    const dev = perpendicular3DDeviation(
      { vertices: xyz, indices: indicesU32 }, utFlat, rA2,
      { H: DIMS.H, tolMm: TOL_MM, seamExclU: 0, denseN: 8 },
    );
    const q = triangleQualityDistribution({ vertices: xyz, indices: indicesU32 });
    const metrics: MeshMetrics = {
      triCount:      raw.indices.length / 3,
      minAngleDeg:   q.minAngleDeg,
      pctUnder20deg: q.pctBelow20,
      chordP99Mm:    dev.p99DevMm,
      vertexMaxMm:   dev.vertexMaxMm,
    };

    // Write dump JSON (required by spec)
    const dump = buildDumpFromUt2(styleId, config, raw.ut, raw.indices, metrics);
    writeDump(dump);

    return { style: String(styleId), config, ...metrics };
  } catch (e) {
    return {
      style: String(styleId), config, triCount: 0, pctUnder20deg: -1,
      minAngleDeg: -1, chordP99Mm: -1, vertexMaxMm: -1,
      error: String(e).slice(0, 400),
    };
  }
}

function runOurs(styleId: StyleId): ScoreRow {
  try {
    const sampler = styleSampler(styleId, {}, {
      H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb, expn: DIMS.expn,
    });
    const wall = buildConformingOuterWall(sampler, { ...OURS_OPTS });
    const metrics = measureUtMesh(styleId, wall.vertices, wall.indices);

    // Build ut2 (stride-2) for the dump
    const n = wall.vertices.length / 3;
    const ut2: number[] = new Array(n * 2);
    for (let i = 0; i < n; i++) {
      ut2[2 * i]     = wall.vertices[3 * i];
      ut2[2 * i + 1] = wall.vertices[3 * i + 1];
    }
    const dump = buildDumpFromUt2(styleId, 'ours', ut2, Array.from(wall.indices), metrics);
    writeDump(dump);

    return { style: String(styleId), config: 'ours', ...metrics };
  } catch (e) {
    return {
      style: String(styleId), config: 'ours', triCount: 0, pctUnder20deg: -1,
      minAngleDeg: -1, chordP99Mm: -1, vertexMaxMm: -1,
      error: String(e).slice(0, 400),
    };
  }
}

// ── Main batch test ───────────────────────────────────────────────────────────
describe('E-2026-06-26-OURS-VS-SOTA: ours vs gmsh-iso/aniso/triangle', () => {
  it.skipIf(!process.env.PF_OURS_VS_SOTA)(
    '4 configs × 6 styles; writes dump JSONs; classifies kill-criterion',
    () => {
      mkdirSync(DUMP_DIR, { recursive: true });
      const rows: ScoreRow[] = [];
      // Incremental write so a partial run still captures results
      function flush() { writeFileSync(SCORECARD_PATH, JSON.stringify(rows, null, 2)); }

      const log = (r: ScoreRow) => {
        const summary = r.error
          ? `ERR ${r.error.slice(0, 120)}`
          : `tris=${r.triCount} %<20=${r.pctUnder20deg.toFixed(1)} minAng=${r.minAngleDeg.toFixed(1)} chordP99=${r.chordP99Mm.toFixed(3)}`;
        // eslint-disable-next-line no-console
        console.log(`  ${r.style}/${r.config}: ${summary}`);
      };

      for (const styleId of STYLES) {
        // eslint-disable-next-line no-console
        console.log(`\n[${String(styleId)}]`);

        // Oracles first (triangle → gmsh-iso → gmsh-aniso)
        const configs: [string, boolean, string][] = [
          ['triangle', false, 'triangle'],
          ['gmsh',     false, 'gmsh-iso'],
          ['gmsh',     true,  'gmsh-aniso'],
        ];
        for (const [engine, aniso, config] of configs) {
          const r = runOracleEngine(styleId, engine, aniso, config);
          rows.push(r); flush(); log(r);
        }

        // ours (production conforming, PRE-warp)
        const r = runOurs(styleId);
        rows.push(r); flush();
        // eslint-disable-next-line no-console
        console.log(`  ${r.style}/ours: ${r.error ?? `tris=${r.triCount} %<20=${r.pctUnder20deg.toFixed(1)} minAng=${r.minAngleDeg.toFixed(1)} chordP99=${r.chordP99Mm.toFixed(3)}`} [PRE-WARP caveat]`);
      }

      // ── Kill-criterion classification ──────────────────────────────────────
      // eslint-disable-next-line no-console
      console.log('\n=== KILL-CRITERION (H: ours > gmsh-iso + 5pp on ALL 5 tangled) ===');
      let allConfirmed = true;
      const gaps: Record<string, number> = {};
      for (const styleId of TANGLED) {
        const oursRow = rows.find(r => r.style === String(styleId) && r.config === 'ours');
        const gmshRow = rows.find(r => r.style === String(styleId) && r.config === 'gmsh-iso');
        if (!oursRow || !gmshRow || oursRow.error !== undefined || gmshRow.error !== undefined) {
          // eslint-disable-next-line no-console
          console.log(`  ${String(styleId)}: SKIP (error or missing)`);
          allConfirmed = false;
          continue;
        }
        const gap = oursRow.pctUnder20deg - gmshRow.pctUnder20deg;
        gaps[String(styleId)] = gap;
        const verdict = gap > 5 ? 'CONFIRMED' : 'REFUTED';
        // eslint-disable-next-line no-console
        console.log(`  ${String(styleId)}: ours=${oursRow.pctUnder20deg.toFixed(1)} gmsh-iso=${gmshRow.pctUnder20deg.toFixed(1)} gap=${gap.toFixed(1)}pp → ${verdict}`);
        if (gap <= 5) allConfirmed = false;
      }
      // eslint-disable-next-line no-console
      console.log(`\nOVERALL: ${allConfirmed ? 'CONFIRMED' : 'REFUTED'}`);
      // eslint-disable-next-line no-console
      console.log(`Scorecard: ${SCORECARD_PATH}`);
      // eslint-disable-next-line no-console
      console.log(`Dump dir:  ${DUMP_DIR}`);

      // Non-vacuous assertion: all 6 styles × 4 configs attempted
      expect(rows.length).toBe(STYLES.length * 4);
      // All dump files must exist
      for (const styleId of STYLES) {
        for (const config of ['triangle', 'gmsh-iso', 'gmsh-aniso', 'ours']) {
          const dumpPath = join(DUMP_DIR, `${String(styleId)}__${config}.json`);
          expect(existsSync(dumpPath), `dump missing: ${dumpPath}`).toBe(true);
        }
      }
    },
    25 * 60 * 1000, // 25-min cap; 6 styles × 4 configs (gmsh is the slow step)
  );
});
