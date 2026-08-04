/**
 * POPULATION-SCALE JAM CENSUS — research-only, shadow, never mutates a mesh.
 *
 * QUESTION. `_strataActionFrontier`'s S24 report proved on ONE audited carrier that the driver
 * tried 33 placements across all three edges and selected NONE. The S40VFC run then ended with an
 * EMPTY heap, 1,259,626 of an 8,000,000 triangle cap (84% unspent), and 4,283 facets left over
 * tolerance — 4,164 of them labelled `shape-ar`. One facet is an anecdote. This asks the same
 * question of the whole jammed population, and it asks the ONE thing that decides the fix:
 *
 *   Is the driver's move set EXHAUSTED at these facets, or does a legal single-edge split exist
 *   that its 11-position nudge ladder merely missed?
 *
 * If a dense 2049-sample sweep of all three edges finds a legal placement where the ladder found
 * none, the defect is a PLACEMENT SEARCH defect and the fix is cheap. If the dense sweep also finds
 * nothing, the reachable set really is empty under single-edge bisection and no amount of ladder,
 * ranking, budget or tolerance tuning can close these facets — the generator needs a larger move.
 *
 * Both arms use the DRIVER'S OWN composed gates (`scoreEdgePlacement`: AR cap, (theta,z) fold,
 * shipped-normal admission, weld floor, incidence), so a "legal" verdict here is legal for the
 * driver, not merely for this probe.
 *
 * Run:  PF_STRATA_JAM=1 npx vitest run --config vitest.stratajam.config.ts
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { signedAreaParam } from './_shapeGuard';
import { canonTheta, dThRaw, type SweepPredConst } from './_sweepPredicate';
import {
  auditDriverFrontier,
  incidentTriangles,
  sampledMinimaxPlacement,
  type FrontierMesh,
  type FrontierOptions,
  type FrontierTriangle,
  type FrontierVertex,
  type SplitRejection,
} from './_strataActionFrontier';

const RUN = process.env.PF_STRATA_JAM === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DEFAULT_NUDGE = [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72, 0.21, 0.79, 0.15, 0.85] as const;

function envF(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envI(name: string, fallback: number): number {
  return Math.round(envF(name, fallback));
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function registryDefaults(id: string): Record<string, number> {
  const config = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const group of [config?.params, config?.advancedParams]) {
    if (group === undefined) continue;
    for (const [key, value] of Object.entries(group)) {
      if (typeof value.default === 'number') out[snakeToCamel(key)] = value.default;
    }
  }
  return out;
}

/** Uniform spatial hash over triangle centroids, so a local patch costs O(1) instead of O(nTri). */
interface CentroidIndex {
  cx: Float64Array;
  cy: Float64Array;
  cz: Float64Array;
  cell: number;
  buckets: Map<number, number[]>;
}

function buildCentroidIndex(xyz: Float64Array, nTri: number, cell: number): CentroidIndex {
  const cx = new Float64Array(nTri);
  const cy = new Float64Array(nTri);
  const cz = new Float64Array(nTri);
  const buckets = new Map<number, number[]>();
  for (let tri = 0; tri < nTri; tri += 1) {
    const o = tri * 9;
    const x = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
    const y = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
    const z = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    cx[tri] = x; cy[tri] = y; cz[tri] = z;
    const key = cellKey(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell));
    const prior = buckets.get(key);
    if (prior === undefined) buckets.set(key, [tri]); else prior.push(tri);
  }
  return { cx, cy, cz, cell, buckets };
}

/**
 * Three 12-bit lanes packed into one double = 2^36, well inside the 2^53 exact-integer range.
 * A 20-bit packing overflows to 2^60, distinct cells then alias onto one key, and the 27-cell scan
 * visits the aliased bucket repeatedly — which duplicates triangles and made every target edge read
 * a constant 26 incidents instead of 2. The lane bound is asserted rather than assumed.
 */
const CELL_LANE = 2048;
function cellKey(i: number, j: number, k: number): number {
  if (Math.abs(i) >= CELL_LANE || Math.abs(j) >= CELL_LANE || Math.abs(k) >= CELL_LANE) {
    throw new Error(`cell lane out of range (${i},${j},${k}) — raise the cell size`);
  }
  return ((i + CELL_LANE) * 4096 + (j + CELL_LANE)) * 4096 + (k + CELL_LANE);
}

function gatherWithin(index: CentroidIndex, tri: number, radius: number): number[] {
  const { cx, cy, cz, cell, buckets } = index;
  const x = cx[tri]; const y = cy[tri]; const z = cz[tri];
  const span = Math.ceil(radius / cell);
  const i0 = Math.floor(x / cell); const j0 = Math.floor(y / cell); const k0 = Math.floor(z / cell);
  const out: number[] = [];
  const seen = new Set<number>(); // defence in depth: a duplicated member silently fakes edge incidence
  const r2 = radius * radius;
  for (let i = i0 - span; i <= i0 + span; i += 1) {
    for (let j = j0 - span; j <= j0 + span; j += 1) {
      for (let k = k0 - span; k <= k0 + span; k += 1) {
        const bucket = buckets.get(cellKey(i, j, k));
        if (bucket === undefined) continue;
        for (const t of bucket) {
          const dx = cx[t] - x; const dy = cy[t] - y; const dz = cz[t] - z;
          if (dx * dx + dy * dy + dz * dz <= r2 && !seen.has(t)) { seen.add(t); out.push(t); }
        }
      }
    }
  }
  return out;
}

interface LocalPatch {
  mesh: FrontierMesh | null;
  target: number;
  incidence: number[];
  reason: string;
}

function buildLocalMesh(
  xyz: Float64Array,
  members: number[],
  targetTri: number,
): LocalPatch {
  const vertices: FrontierVertex[] = [];
  const triangles: FrontierTriangle[] = [];
  const ids = new Map<string, number>();
  let target = -1;
  const addVertex = (x: number, y: number, z: number): number => {
    const key = `${x}|${y}|${z}`;
    const prior = ids.get(key);
    if (prior !== undefined) return prior;
    const id = vertices.length;
    ids.set(key, id);
    vertices.push({ x, y, z, th: canonTheta(Math.atan2(y, x)) });
    return id;
  };
  for (const tri of members) {
    const o = tri * 9;
    const v: [number, number, number] = [
      addVertex(xyz[o], xyz[o + 1], xyz[o + 2]),
      addVertex(xyz[o + 3], xyz[o + 4], xyz[o + 5]),
      addVertex(xyz[o + 6], xyz[o + 7], xyz[o + 8]),
    ];
    const rootSign = Math.sign(signedAreaParam(
      vertices[v[0]].th, vertices[v[0]].z,
      vertices[v[1]].th, vertices[v[1]].z,
      vertices[v[2]].th, vertices[v[2]].z,
    ));
    if (tri === targetTri) target = triangles.length;
    triangles.push({ v, sourceTri: tri, rootSign });
  }
  if (target < 0) return { mesh: null, target: -1, incidence: [], reason: 'target-missing' };
  const mesh = { vertices, triangles };
  const t = triangles[target];
  const incidence = ([[t.v[0], t.v[1]], [t.v[1], t.v[2]], [t.v[2], t.v[0]]] as Array<[number, number]>)
    .map(([a, b]) => incidentTriangles(mesh, a, b).length);
  // A target edge missing an incident neighbour means the patch is clipped, not that the mesh is
  // open. Reject rather than audit a facet against a fabricated boundary.
  if (incidence.some((n) => n !== 2)) return { mesh: null, target: -1, incidence, reason: 'incidence' };
  return { mesh, target, incidence, reason: 'ok' };
}

/**
 * `unresolved.json` records the driver's ALLOCATION id (0..alloc, 2,289,762 for S40VFC), not the
 * row the facet occupies in the emitted STL (0..1,259,625). Auditing row `tri` therefore audits an
 * arbitrary unrelated facet — on the first smoke run that silently reported "100% of the jam has a
 * legal split" from six wrong triangles. The facets are re-identified GEOMETRICALLY: the report
 * carries each one's centroid (theta,z) and its sorted edge triple, which together fingerprint a
 * facet in a 1.26 M mesh. A match must agree on BOTH or it is not returned.
 */
interface ThetaZIndex {
  buckets: Map<number, number[]>;
  th: Float64Array;
  z: Float64Array;
  edges: Float64Array; // sorted short/mid/long per facet, in um
}

const TZ_DTH = 0.004;
const TZ_DZ = 0.25;

function tzKey(ti: number, zi: number): number {
  return ti * 8192 + zi;
}

function buildThetaZIndex(xyz: Float64Array, nTri: number): ThetaZIndex {
  const th = new Float64Array(nTri);
  const z = new Float64Array(nTri);
  const edges = new Float64Array(nTri * 3);
  const buckets = new Map<number, number[]>();
  for (let tri = 0; tri < nTri; tri += 1) {
    const o = tri * 9;
    const cxv = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
    const cyv = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
    const czv = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    const t = canonTheta(Math.atan2(cyv, cxv));
    th[tri] = t; z[tri] = czv;
    const e = [
      Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]) * 1000,
      Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]) * 1000,
      Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]) * 1000,
    ].sort((a, b) => a - b);
    edges[tri * 3] = e[0]; edges[tri * 3 + 1] = e[1]; edges[tri * 3 + 2] = e[2];
    const key = tzKey(Math.floor(t / TZ_DTH), Math.floor(czv / TZ_DZ));
    const prior = buckets.get(key);
    if (prior === undefined) buckets.set(key, [tri]); else prior.push(tri);
  }
  return { buckets, th, z, edges };
}

function findFacetRow(
  index: ThetaZIndex,
  theta: number,
  zMm: number,
  shortUm: number,
  midUm: number,
  longUm: number,
): number {
  const ti = Math.floor(theta / TZ_DTH);
  const zi = Math.floor(zMm / TZ_DZ);
  let best = -1;
  let bestErr = Infinity;
  for (let a = ti - 1; a <= ti + 1; a += 1) {
    for (let b = zi - 1; b <= zi + 1; b += 1) {
      const bucket = index.buckets.get(tzKey(a, b));
      if (bucket === undefined) continue;
      for (const tri of bucket) {
        // Centroid agreement first: the report prints 6 decimals, so a true match is sub-micron.
        const dth = Math.abs(index.th[tri] - theta);
        const dz = Math.abs(index.z[tri] - zMm);
        if (dth > 2e-5 || dz > 2e-3) continue;
        // Then the shape fingerprint. Relative, because the report rounds to 0.1 um.
        const e0 = index.edges[tri * 3]; const e1 = index.edges[tri * 3 + 1]; const e2 = index.edges[tri * 3 + 2];
        const rel = Math.abs(e0 - shortUm) / Math.max(shortUm, 1)
          + Math.abs(e1 - midUm) / Math.max(midUm, 1)
          + Math.abs(e2 - longUm) / Math.max(longUm, 1);
        if (rel > 0.01) continue;
        const err = dth + dz + rel;
        if (err < bestErr) { bestErr = err; best = tri; }
      }
    }
  }
  return best;
}

function longestEdgeMm(xyz: Float64Array, tri: number): number {
  const o = tri * 9;
  return Math.max(
    Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]),
    Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]),
    Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]),
  );
}

function quantile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

describe('strata jam census', () => {
  it('enumerates the driver frontier over the jammed population', { timeout: 3_600_000 }, () => {
    if (!RUN) { expect(true).toBe(true); return; }

    const root = process.env.PF_STRATA_JAM_ROOT ?? process.cwd();
    const stlPath = process.env.PF_STRATA_JAM_STL
      ?? join(root, 'research', 'exchange', '_strataConformBisect', 'gothicarches_ring_DS-HT_S40VFC.stl');
    const jamPath = process.env.PF_STRATA_JAM_LIST
      ?? join(root, 'research', 'tools', 'potscope', 'gothicarches_ring_DS-HT_S40VFC.unresolved.json');
    const outDir = process.env.PF_STRATA_JAM_OUT ?? join(root, 'research', 'exchange', '_strataJamCensus');
    const tag = process.env.PF_STRATA_JAM_TAG ?? 'S40VFC';
    const sampleCap = envI('PF_STRATA_JAM_N', 400);
    const denseSamples = envI('PF_STRATA_JAM_DENSE', 2049);

    const predicate: SweepPredConst = {
      esN: envI('PF_STRATA_JAM_ESN', 8),
      refHs: envF('PF_STRATA_JAM_REF_HS_MM', 0.03),
      refNmax: envI('PF_STRATA_JAM_REF_NMAX', 64),
      kinkScan: envI('PF_STRATA_JAM_KINK_SCAN', 16),
      kinkHalvings: envI('PF_STRATA_JAM_KINK_HALVINGS', 24),
      kinkRatio: envF('PF_STRATA_JAM_KINK_RATIO', 0.15),
      jumpRatio: envF('PF_STRATA_JAM_JUMP_RATIO', 0.62),
      snap: process.env.PF_STRATA_JAM_SNAP !== '0',
      confMm: envF('PF_STRATA_JAM_CONF_UM', 0.6) / 1000,
    };
    const options: FrontierOptions = {
      arCap: envF('PF_STRATA_JAM_AR_CAP', 50),
      arGuard: envF('PF_STRATA_JAM_AR_GUARD', 8),
      floorMm: envF('PF_STRATA_JAM_FLOOR_UM', 1.5) / 1000,
      weldMm: envF('PF_STRATA_JAM_WELD_UM', 0.05) / 1000,
      snapAlpha: envF('PF_STRATA_JAM_SNAP_ALPHA', 0.12),
      mid3dIters: envI('PF_STRATA_JAM_MID3D_ITERS', 24),
      mid3dMaxShift: envF('PF_STRATA_JAM_MID3D_MAXSHIFT', 0.25),
      nudgeFractions: DEFAULT_NUDGE,
      shippedNormal: process.env.PF_STRATA_JAM_SHIPPED_NORMAL !== '0',
      predicate,
    };

    const R = buildAuditRadiusFn('GothicArches', registryDefaults('GothicArches'), DIMS, H).rA;
    const { xyz, nTri } = readMeshFloat64(stlPath, false);
    const jam = JSON.parse(readFileSync(jamPath, 'utf8')) as {
      facets: Array<{
        tri: number; theta: number; z: number;
        shortUm: number; midUm: number; longUm: number;
        ar3: number; sagNowUm: number; why: string;
      }>;
    };
    const facets = jam.facets;
    const stride = Math.max(1, Math.floor(facets.length / sampleCap));
    const chosen = facets.filter((_, i) => i % stride === 0).slice(0, sampleCap);

    const index = buildCentroidIndex(xyz, nTri, 0.5);
    const tzIndex = buildThetaZIndex(xyz, nTri);

    let audited = 0;
    let matched = 0;
    let clipped = 0;
    let ladderLegal = 0;
    let jammed = 0;
    let denseRescued = 0;
    const attemptCounts: number[] = [];
    const denseBestAr: number[] = [];
    const jamSag: number[] = [];
    const jamAr: number[] = [];
    const primaryHist = new Map<string, number>();
    const anyReasonHist = new Map<string, number>();
    const clipHist = new Map<string, number>();
    const rescueExamples: Array<Record<string, number | string>> = [];
    const clipExamples: Array<Record<string, number | string>> = [];

    const bump = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };

    for (const facet of chosen) {
      const tri = findFacetRow(tzIndex, facet.theta, facet.z, facet.shortUm, facet.midUm, facet.longUm);
      if (tri < 0) { clipped += 1; bump(clipHist, 'unmatched'); continue; }
      matched += 1;
      // Grow the patch until the target's three edges each have their neighbour, then stop. A fixed
      // radius either clips sparse regions or drags thousands of facets into dense ones.
      let local: LocalPatch = { mesh: null, target: -1, incidence: [], reason: 'unset' };
      const seed = Math.max(4 * longestEdgeMm(xyz, tri), 0.12);
      for (const radius of [seed, seed * 2, seed * 4, 3]) {
        local = buildLocalMesh(xyz, gatherWithin(index, tri, radius), tri);
        if (local.mesh !== null) break;
      }
      if (local.mesh === null) {
        clipped += 1;
        bump(clipHist, local.reason);
        if (clipExamples.length < 8) {
          clipExamples.push({
            tri,
            reason: local.reason,
            incidence: local.incidence.join('/'),
            members: gatherWithin(index, tri, seed).length,
            longUm: Math.round(longestEdgeMm(xyz, tri) * 1000),
          });
        }
        continue;
      }
      audited += 1;
      const mesh = local.mesh;

      const frontier = auditDriverFrontier(R, mesh, local.target, options);
      attemptCounts.push(frontier.attempts.length);
      if (frontier.selected !== null) { ladderLegal += 1; continue; }

      jammed += 1;
      jamSag.push(facet.sagNowUm);
      jamAr.push(facet.ar3);
      let firstPrimary: SplitRejection | null = null;
      for (const attempt of frontier.attempts) {
        const score = attempt.score;
        if (score === null) continue;
        if (firstPrimary === null && score.primaryRejection !== null) firstPrimary = score.primaryRejection;
        for (const reason of new Set(score.reasons)) bump(anyReasonHist, reason);
      }
      bump(primaryHist, firstPrimary ?? 'no-placement');

      // THE DISCRIMINATOR. The ladder tries 11 fixed fractions per edge. Sweep all three edges at
      // `denseSamples` positions under the same gates: a legal placement here is one the driver
      // could have taken and did not.
      const t = mesh.triangles[local.target];
      const edges: Array<[number, number]> = [[t.v[0], t.v[1]], [t.v[1], t.v[2]], [t.v[2], t.v[0]]];
      let bestAr = Infinity;
      let rescued = false;
      for (const edge of edges) {
        const minimax = sampledMinimaxPlacement(R, mesh, edge, options, denseSamples);
        bestAr = Math.min(bestAr, minimax.score.worstAr);
        if (minimax.score.legal) rescued = true;
      }
      denseBestAr.push(bestAr);
      if (rescued) {
        denseRescued += 1;
        if (rescueExamples.length < 12) {
          rescueExamples.push({ tri, ar3: facet.ar3, sagNowUm: facet.sagNowUm, bestAr, why: facet.why });
        }
      }
    }

    const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);
    const lines: string[] = [
      '===== STRATA JAM CENSUS — SHADOW ONLY =====',
      `source ${stlPath} (${nTri} facets)`,
      `jam list ${jamPath} (${facets.length} unresolved facets, sampled every ${stride} → ${chosen.length})`,
      `gates: AR cap ${options.arCap}  floor ${(options.floorMm * 1000).toFixed(1)} um  weld `
        + `${(options.weldMm * 1000).toFixed(2)} um  shipped-normal ${String(options.shippedNormal)}`,
      '',
      `geometrically re-identified in the STL ${matched}/${chosen.length}`,
      `audited ${audited}   dropped ${clipped}`
        + (clipped > 0 ? `   clip reasons: ${[...clipHist].map(([k, v]) => `${k}=${v}`).join('  ')}` : ''),
      `  ladder found a legal split : ${ladderLegal} (${pct(ladderLegal, audited)})`,
      `  JAMMED, selected=NONE      : ${jammed} (${pct(jammed, audited)})`,
      '',
      'JAMMED POPULATION',
      `  own AR3   p50 ${quantile(jamAr, 0.5).toFixed(1)}  p90 ${quantile(jamAr, 0.9).toFixed(1)}`,
      `  own sag   p50 ${quantile(jamSag, 0.5).toFixed(1)} um  p90 ${quantile(jamSag, 0.9).toFixed(1)} um`,
      `  ladder attempts per facet  p50 ${quantile(attemptCounts, 0.5)}  max ${Math.max(...attemptCounts, 0)}`,
      `  first primary rejection: ${[...primaryHist].map(([k, v]) => `${k}=${v}`).join('  ')}`,
      `  any rejection (per attempt, deduped): ${[...anyReasonHist].map(([k, v]) => `${k}=${v}`).join('  ')}`,
      '',
      '*** THE DISCRIMINATOR — dense sweep of all 3 edges at '
        + `${denseSamples} positions under the driver's own gates ***`,
      `  RESCUED (a legal placement the 11-nudge ladder missed): ${denseRescued} (${pct(denseRescued, jammed)})`,
      `  best achievable worst-AR over all sampled placements: p50 ${quantile(denseBestAr, 0.5).toFixed(1)}`
        + `  p10 ${quantile(denseBestAr, 0.1).toFixed(1)}  min ${Math.min(...denseBestAr, Infinity).toFixed(1)}`,
      '',
      // A verdict is only meaningful over a non-empty audited jam. Printing one on zero rows is
      // exactly the false headline this campaign's controls exist to catch.
      jammed === 0
        ? `VERDICT: NONE — ${audited} audited, ${jammed} jammed. Nothing was measured; fix the harness, not the mesher.`
        : denseRescued > 0
          ? `VERDICT: PLACEMENT-SEARCH defect on ${pct(denseRescued, jammed)} of the jam — the move exists and the ladder misses it.`
          : 'VERDICT: MOVE SET EXHAUSTED. No legal single-edge placement exists on any of the three edges at '
            + `${denseSamples} positions. No ladder, ranking, budget or tolerance change can close these facets.`,
    ];
    if (clipExamples.length > 0) {
      lines.push('', 'clip examples:');
      for (const c of clipExamples) lines.push(`  ${JSON.stringify(c)}`);
    }
    if (rescueExamples.length > 0) {
      lines.push('', 'rescue examples:');
      for (const r of rescueExamples) lines.push(`  ${JSON.stringify(r)}`);
    }

    const text = lines.join('\n');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `JAM_${tag}.report.txt`), `${text}\n`, 'utf8');
    writeFileSync(join(outDir, `JAM_${tag}.json`), `${JSON.stringify({
      schema: 'pf.strataJamCensus/1',
      stlPath,
      jamPath,
      nTri,
      unresolvedTotal: facets.length,
      sampled: chosen.length,
      audited,
      clipped,
      ladderLegal,
      jammed,
      denseRescued,
      denseSamples,
      primary: Object.fromEntries(primaryHist),
      anyReason: Object.fromEntries(anyReasonHist),
      denseBestArP50: quantile(denseBestAr, 0.5),
      denseBestArMin: Math.min(...denseBestAr, Infinity),
    }, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(text);

    expect(audited).toBeGreaterThan(0);
  });
});
