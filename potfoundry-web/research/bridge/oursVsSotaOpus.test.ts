/**
 * oursVsSotaOpus.test.ts — Experiment E-2026-06-26-OURS-VS-SOTA-OPUS
 *
 * INDEPENDENT of the sonnet `oursVsSota.test.ts`. Two faithfulness corrections that
 * can move the SOTA-frontier conclusion (see EXPERIMENT-REGISTRY.md pre-registration):
 *   1. GENUINE gmsh-aniso — routed through runStyle({aniso:true}) so the BAMG metric
 *      tensor is actually wired (the sonnet run silently dropped it → aniso == iso).
 *   2. Production-FAITHFUL `ours` opts — the 'high' EXPORT path values
 *      (maxEdgeMm=1, minEdgeMm=0.1, maxLevel=16), NOT the dev __pfConformingProbe block
 *      (8/0.2/10) the sonnet run used.
 *
 * PRE-REGISTERED HYPOTHESIS (kill-criterion fixed in the registry BEFORE running):
 *   H: At a COMMON chord target (maxSagMm = tol = 0.05) on the 5 tangled lattices, the
 *      production conforming mesher (PRE-warp, 'high'-faithful opts) has %<20° materially
 *      WORSE than the best SOTA engine (min over gmsh-iso, gmsh-aniso) — the 2:1 quadtree
 *      transition templates are the structural sliver source. Not explained by budget
 *      (ours is DENSER, not coarser).
 *
 * KILL-CRITERION (pre-registered):
 *   CONFIRMED if, on ALL 5 tangled lattices:
 *       ours %<20° > min(gmsh-iso, gmsh-aniso) %<20° + 5 pp
 *     AND ours minAngleDeg < min(gmsh-iso, gmsh-aniso) minAngleDeg.
 *   REFUTED if any tangled style is within 5 pp of best-SOTA quality OR has a worst-angle
 *     no worse than best-SOTA.
 *   ANISO-VALIDITY GATE: gmsh-aniso triCount MUST differ from gmsh-iso on >=4 of 6 styles.
 *
 * WARP CAVEAT (mandatory): buildConformingOuterWall returns the PRE-warp (u,t) quadtree
 *   grid. The crease-warp is applied downstream in WatertightAssembly. The 2:1 transition
 *   slivers ARE present here (a (u,t)-topology property), but the 3D angles on warped
 *   tangled styles differ from production. All 4 configs are lifted identically via rA,
 *   so the comparison is equal-footing; the `ours` numbers are not a production absolute.
 *
 * Run: PF_OURS_VS_SOTA_OPUS=1 npx vitest run research/bridge/oursVsSotaOpus.test.ts
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { runStyle, buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
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

// ── Production-FAITHFUL conforming opts (the 'high' EXPORT path at sag=0.05) ──
// ParametricExportComputer.ts:2699-2711 assemblyOpts, resolved through the 'high'
// profile (DEFAULT_EXPORT_QUALITY_PROFILE):
//   maxEdgeMm  = exportProfile.maxEdgeMm                       = 1   (HIGH profile)
//   minEdgeMm  = min(0.2, max(0.04, profileSag*2)) @0.05       = 0.1
//   maxLevel   = max(resolveQuadtreeMaxLevel(0.05)=12, 16)     = 16  (CAD_MAX_LEVEL floor)
//   gradeRatio = 2 ; resU/resT = 128
// maxSagMm=0.05 = the equal-chord-target control (production CAD floor is 0.003).
// (The sonnet run used the dev __pfConformingProbe block: 8 / 0.2 / 10.)
const OURS_OPTS = {
  maxSagMm:   TOL_MM,
  maxEdgeMm:  1,
  minEdgeMm:  0.1,
  gradeRatio: 2,
  maxLevel:   16,
  resU:       128,
  resT:       128,
} as const;

// ── Styles under test ────────────────────────────────────────────────────────
const TANGLED: StyleId[] = [
  'GyroidManifold', 'BasketWeave', 'CelticKnot', 'CelticTriquetra', 'GothicArches',
] as StyleId[];
const SMOOTH: StyleId[] = ['SuperellipseMorph'] as StyleId[];
const STYLES: StyleId[] = [...TANGLED, ...SMOOTH];

// ── Output paths (SEPARATE dir — does NOT clobber the sonnet _oursvssota/) ────
const EXCHANGE_BASE  = join('research', 'exchange');
const DUMP_DIR       = join(EXCHANGE_BASE, '_oursvssota_opus');
const SCORECARD_PATH = join(DUMP_DIR, 'scorecard.json');

// ── Types ────────────────────────────────────────────────────────────────────
interface MeshMetrics {
  triCount:      number;
  minAngleDeg:   number;
  pctUnder20deg: number;
  chordP99Mm:    number;
  vertexMaxMm:   number;
}
interface ScoreRow extends MeshMetrics { style: string; config: string; error?: string; }

// ── Dump writer (schema fixed by the task spec) ───────────────────────────────
function writeDump(
  styleId: StyleId, config: string,
  ut2: number[], tris: number[], m: MeshMetrics,
): void {
  const rA = buildRadiusFn(styleId, {}, DIMS);
  const { vertices: xyz } = liftUtToRadial(ut2, rA, DIMS.H);
  const row = {
    style: String(styleId), config,
    ut2,                       // flat 2-stride [u0,t0,u1,t1,...]
    xyz: Array.from(xyz),      // flat 3-stride lifted [x0,y0,z0,...]
    tris,                      // flat triangle indices
    triCount: m.triCount, minAngleDeg: m.minAngleDeg, pctUnder20deg: m.pctUnder20deg,
    chordP99Mm: m.chordP99Mm, vertexMaxMm: m.vertexMaxMm,
  };
  writeFileSync(join(DUMP_DIR, `${String(styleId)}__${config}.json`), JSON.stringify(row));
}

// ── ours: production conforming mesher (PRE-warp), measured with our instruments ─
function runOurs(styleId: StyleId): ScoreRow {
  try {
    // Production-faithful CPU sampler: dense pre-evaluated grid (discretize-then-
    // bilinear), the SAME SurfaceSampler contract the export's GpuSurfaceSampler uses.
    const sampler = styleSampler(styleId, {}, {
      H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb, expn: DIMS.expn,
    });
    const wall = buildConformingOuterWall(sampler, { ...OURS_OPTS });

    // Repack the (u,t,surfaceId) stride-3 vertices → stride-2 (u,t), lift via rA,
    // measure with the project's own instruments (one-metric-both-meshes).
    const n = wall.vertices.length / 3;
    const ut2 = new Array<number>(n * 2);
    for (let i = 0; i < n; i++) {
      ut2[2 * i]     = wall.vertices[3 * i];
      ut2[2 * i + 1] = wall.vertices[3 * i + 1];
    }
    const rA = buildRadiusFn(styleId, {}, DIMS);
    const { vertices: xyz, utFlat } = liftUtToRadial(ut2, rA, DIMS.H);
    const dev = perpendicular3DDeviation(
      { vertices: xyz, indices: wall.indices }, utFlat, rA,
      { H: DIMS.H, tolMm: TOL_MM, seamExclU: 0, denseN: 8 },
    );
    const q = triangleQualityDistribution({ vertices: xyz, indices: wall.indices });
    const m: MeshMetrics = {
      triCount: wall.indices.length / 3, minAngleDeg: q.minAngleDeg,
      pctUnder20deg: q.pctBelow20, chordP99Mm: dev.p99DevMm, vertexMaxMm: dev.vertexMaxMm,
    };
    writeDump(styleId, 'ours', ut2, Array.from(wall.indices), m);
    return { style: String(styleId), config: 'ours', ...m };
  } catch (e) {
    return {
      style: String(styleId), config: 'ours', triCount: 0, minAngleDeg: -1,
      pctUnder20deg: -1, chordP99Mm: -1, vertexMaxMm: -1, error: String(e).slice(0, 400),
    };
  }
}

// ── oracle: GENUINE iso / aniso via runStyle (the single source of truth for the
//    metric wiring). runStyle measures with our instruments AND writes out_gmsh.json;
//    we snapshot that file immediately (iso and aniso both write the same path) to
//    recover the (u,t)/indices for the required dump. ──────────────────────────
const GMSH_OUT = (styleId: StyleId) => join(EXCHANGE_BASE, String(styleId), 'out_gmsh.json');
const TRI_OUT  = (styleId: StyleId) => join(EXCHANGE_BASE, String(styleId), 'out_triangle.json');

function runOracle(styleId: StyleId, engine: 'triangle' | 'gmsh', aniso: boolean, config: string): ScoreRow {
  try {
    const [r] = runStyle(styleId, DIMS, [engine], { tolMm: TOL_MM, sizeRes: SIZE_RES, hMin: HMIN, hMax: HMAX, aniso });
    const m: MeshMetrics = {
      triCount: r.tris, minAngleDeg: r.minAngleDeg, pctUnder20deg: r.pctUnder20deg,
      chordP99Mm: r.chordP99Mm, vertexMaxMm: r.vertexMaxMm,
    };
    // Snapshot the engine output for the dump (read it back NOW before the next call overwrites).
    const outPath = engine === 'gmsh' ? GMSH_OUT(styleId) : TRI_OUT(styleId);
    const raw = JSON.parse(readFileSync(outPath, 'utf8')) as { ut: number[]; indices: number[] };
    writeDump(styleId, config, raw.ut, raw.indices, m);
    // Also keep a per-config copy of the raw engine output for auditability.
    copyFileSync(outPath, join(DUMP_DIR, `${String(styleId)}__${config}__raw.json`));
    return { style: String(styleId), config, ...m };
  } catch (e) {
    return {
      style: String(styleId), config, triCount: 0, minAngleDeg: -1,
      pctUnder20deg: -1, chordP99Mm: -1, vertexMaxMm: -1, error: String(e).slice(0, 400),
    };
  }
}

// ── Main batch ────────────────────────────────────────────────────────────────
describe('E-2026-06-26-OURS-VS-SOTA-OPUS: ours (faithful opts) vs gmsh-iso/aniso(genuine)/triangle', () => {
  it.skipIf(!process.env.PF_OURS_VS_SOTA_OPUS)(
    '4 configs × 6 styles; genuine aniso; writes dump JSONs; classifies kill-criterion',
    () => {
      mkdirSync(DUMP_DIR, { recursive: true });
      const rows: ScoreRow[] = [];
      const flush = () => writeFileSync(SCORECARD_PATH, JSON.stringify(rows, null, 2));
      const log = (r: ScoreRow) => {
        const s = r.error
          ? `ERR ${r.error.slice(0, 120)}`
          : `tris=${r.triCount} %<20=${r.pctUnder20deg.toFixed(1)} minAng=${r.minAngleDeg.toFixed(1)} chordP99=${r.chordP99Mm.toFixed(3)} vMax=${r.vertexMaxMm.toFixed(4)}`;
        // eslint-disable-next-line no-console
        console.log(`  ${r.style}/${r.config}: ${s}`);
      };

      for (const styleId of STYLES) {
        // eslint-disable-next-line no-console
        console.log(`\n[${String(styleId)}]`);
        // triangle → gmsh-iso → gmsh-aniso(GENUINE) → ours
        const tri  = runOracle(styleId, 'triangle', false, 'triangle'); rows.push(tri); flush(); log(tri);
        const iso  = runOracle(styleId, 'gmsh',     false, 'gmsh-iso'); rows.push(iso); flush(); log(iso);
        const ani  = runOracle(styleId, 'gmsh',     true,  'gmsh-aniso'); rows.push(ani); flush(); log(ani);
        const ours = runOurs(styleId); rows.push(ours); flush();
        // eslint-disable-next-line no-console
        console.log(`  ${ours.style}/ours: ${ours.error ?? `tris=${ours.triCount} %<20=${ours.pctUnder20deg.toFixed(1)} minAng=${ours.minAngleDeg.toFixed(1)} chordP99=${ours.chordP99Mm.toFixed(3)} vMax=${ours.vertexMaxMm.toFixed(4)}`} [PRE-WARP]`);
      }

      // ── Aniso-validity gate (pre-registered) ───────────────────────────────
      let anisoDiffers = 0;
      for (const styleId of STYLES) {
        const iso = rows.find(r => r.style === String(styleId) && r.config === 'gmsh-iso');
        const ani = rows.find(r => r.style === String(styleId) && r.config === 'gmsh-aniso');
        if (iso && ani && !iso.error && !ani.error && iso.triCount !== ani.triCount) anisoDiffers++;
      }
      // eslint-disable-next-line no-console
      console.log(`\n=== ANISO-VALIDITY: aniso triCount differs from iso on ${anisoDiffers}/${STYLES.length} styles (gate: >=4) ===`);

      // ── Kill-criterion: ours vs BEST-SOTA on the 5 tangled ─────────────────
      // eslint-disable-next-line no-console
      console.log('\n=== KILL-CRITERION (ours > best-SOTA +5pp %<20 AND ours minAng < best-SOTA) ===');
      let allConfirmed = true;
      for (const styleId of TANGLED) {
        const ours = rows.find(r => r.style === String(styleId) && r.config === 'ours');
        const iso  = rows.find(r => r.style === String(styleId) && r.config === 'gmsh-iso');
        const ani  = rows.find(r => r.style === String(styleId) && r.config === 'gmsh-aniso');
        if (!ours || !iso || !ani || ours.error || iso.error || ani.error) {
          // eslint-disable-next-line no-console
          console.log(`  ${String(styleId)}: SKIP (error/missing)`); allConfirmed = false; continue;
        }
        const bestPct = Math.min(iso.pctUnder20deg, ani.pctUnder20deg);
        const bestMin = Math.max(iso.minAngleDeg, ani.minAngleDeg); // best worst-angle = larger
        const gap = ours.pctUnder20deg - bestPct;
        const minWorse = ours.minAngleDeg < bestMin;
        const verdict = (gap > 5 && minWorse) ? 'CONFIRMED' : 'REFUTED';
        // eslint-disable-next-line no-console
        console.log(`  ${String(styleId)}: ours %<20=${ours.pctUnder20deg.toFixed(1)} bestSOTA=${bestPct.toFixed(1)} gap=${gap.toFixed(1)}pp | ours minAng=${ours.minAngleDeg.toFixed(1)} bestSOTA-minAng=${bestMin.toFixed(1)} → ${verdict}`);
        if (!(gap > 5 && minWorse)) allConfirmed = false;
      }
      // eslint-disable-next-line no-console
      console.log(`\nOVERALL: ${allConfirmed ? 'CONFIRMED' : 'REFUTED'}`);
      // eslint-disable-next-line no-console
      console.log(`Scorecard: ${SCORECARD_PATH}\nDump dir:  ${DUMP_DIR}`);

      // Non-vacuous assertions: all 6×4 attempted; all dumps exist; aniso gate met.
      expect(rows.length).toBe(STYLES.length * 4);
      for (const styleId of STYLES) {
        for (const config of ['triangle', 'gmsh-iso', 'gmsh-aniso', 'ours']) {
          expect(existsSync(join(DUMP_DIR, `${String(styleId)}__${config}.json`)), `dump missing: ${styleId}__${config}`).toBe(true);
        }
      }
      expect(anisoDiffers, 'gmsh-aniso must genuinely differ from gmsh-iso (metric tensor wired)').toBeGreaterThanOrEqual(4);
    },
    50 * 60 * 1000, // 50-min cap. SMOKE-MEASURED: `ours` at maxLevel=16 yields 634k-~1M+ tris
                    // (GyroidManifold 634k); the perp3D measurement is ~80-150s/style on those.
                    // Incremental scorecard survives a partial/timeout run.
  );
});
