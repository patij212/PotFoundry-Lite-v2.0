import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  voronoiBisectorSegmentsUv,
  voronoiCenterCellular,
  type UvSegment,
  type VoronoiLatticeParams,
} from '../../src/geometry/targetSolid/voronoiBisectorGuides';

/*
 * STRATA-001 S0 Task 0.3 — fired-map overlay (E-2026-07-23-STRATA001-S0-BASELINE).
 *
 * ANALYSIS ONLY: reads the per-cell CSV emitted by _gothicScreenSlackAudit
 * (PF_SLACK_CSV) and overlays it on the exactly-known order-1 Voronoi bisector
 * graph. No kernel code runs here.
 *
 * INSTRUMENT CORRECTION (measured 2026-07-23, before any kernel edit):
 * spec P1 is phrased over "Clarke-fired cells", but getLastScreenClarkeFired()
 * is a TAPE-GLOBAL boolean (validatedResidualProgram.ts:2100 — "set when a
 * min/max/abs node takes its Clarke subgradient branch during a tape run").
 * The Voronoi tape's smoothstep CLAMPS are themselves min/max nodes, so the
 * flag reads 1 on 100% of cells and carries ZERO stratum attribution. P1 is
 * therefore not testable through that flag; testing it needs per-node telemetry
 * (plan S4, "fired-map telemetry keyed by stratum id").
 *
 * What IS measurable now, and what P1 actually cares about (the hang locus):
 * the NON-CERTIFIED population — cells the screen could not bring under budget
 * (disp = subdivide | depthcap). If the hang is the order-1 bisector kink, that
 * population must concentrate on the order-1 graph. If instead it is spread over
 * the smooth interior, the spec's root cause (§3) is wrong and S1 must not start.
 *
 * Gated PF_STRATA_OVERLAY=1; CSV path via PF_STRATA_CSV.
 */

const RUN = process.env.PF_STRATA_OVERLAY === '1';

// Must match the lattice the audit classified against (bubble-mode defaults).
const VORONOI_BUBBLE_LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};

interface CellRow {
  readonly uMin: number;
  readonly vMin: number;
  readonly uMax: number;
  readonly vMax: number;
  readonly depth: number;
  readonly clarke: boolean;
  readonly straddle: string;
  readonly disp: string;
}

function pointSegmentDistance(
  px: number,
  py: number,
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return Math.hypot(px - a[0], py - a[1]);
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function distanceToGraph(u: number, v: number, segs: readonly UvSegment[]): number {
  let best = Infinity;
  for (const s of segs) {
    const d = pointSegmentDistance(u, v, s.a, s.b);
    if (d < best) best = d;
  }
  return best;
}

/** The 64 lattice site centers, in UV over the unit square. */
function siteCentersUv(params: VoronoiLatticeParams): Array<readonly [number, number]> {
  const { scale, pulse, zStretch } = params;
  const out: Array<readonly [number, number]> = [];
  for (let i = -1; i <= Math.ceil(scale) + 1; i += 1) {
    for (let j = -1; j <= Math.ceil(scale * zStretch) + 1; j += 1) {
      const [x, y] = voronoiCenterCellular(params, i, j);
      out.push([(x - pulse * scale) / scale, y / (scale * zStretch)]);
    }
  }
  return out;
}

function parseCsv(path: string): CellRow[] {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const rows: CellRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    const f = line.split(',');
    if (f.length < 10) continue;
    rows.push({
      uMin: Number.parseFloat(f[0]),
      vMin: Number.parseFloat(f[1]),
      uMax: Number.parseFloat(f[2]),
      vMax: Number.parseFloat(f[3]),
      depth: Number.parseInt(f[4], 10),
      clarke: f[7] === '1',
      straddle: f[8],
      disp: f[9],
    });
  }
  return rows;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

describe('STRATA-001 S0: fired-map overlay vs the order-1 bisector graph', () => {
  it.runIf(RUN)('classifies the non-certified population against the exact kink graph', () => {
    const csvPath = process.env.PF_STRATA_CSV;
    expect(csvPath, 'PF_STRATA_CSV must point at the audit per-cell CSV').toBeDefined();
    if (csvPath === undefined) return;

    const rows = parseCsv(csvPath);
    expect(rows.length).toBeGreaterThan(0);

    const segs = voronoiBisectorSegmentsUv(VORONOI_BUBBLE_LATTICE);
    const sites = siteCentersUv(VORONOI_BUBBLE_LATTICE);

    // On-graph test: centroid within one cell diagonal of a bisector segment.
    // (A straddling cell's centroid can be up to ~half a diagonal off the line;
    // one full diagonal is the honest, generous bucket.)
    const onGraph = new Map<string, number>();
    const offGraph = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string): void => m.set(k, (m.get(k) ?? 0) + 1);

    const nonCertifiedDist: number[] = [];
    const acceptedDist: number[] = [];
    // Rival locus: the SITE CONES (f1=0, sqrt-at-0 cusp). Distance-to-graph is
    // MAXIMAL at a site centre, so "far from the graph" and "at a cone" are the
    // two competing explanations for the non-certified population.
    const nonCertifiedSiteDist: number[] = [];
    const acceptedSiteDist: number[] = [];
    let refusedNearSite = 0;
    let refusedTotal = 0;
    let refusedSiteDistMax = 0;
    let nonCertNearSite = 0;

    const distanceToSite = (u: number, v: number): number => {
      let best = Infinity;
      for (const s of sites) {
        const ds = Math.hypot(u - s[0], v - s[1]);
        if (ds < best) best = ds;
      }
      return best;
    };

    for (const r of rows) {
      const u = (r.uMin + r.uMax) / 2;
      const v = (r.vMin + r.vMax) / 2;
      const diag = Math.hypot(r.uMax - r.uMin, r.vMax - r.vMin);
      const d = distanceToGraph(u, v, segs);
      const dSite = distanceToSite(u, v);
      const nonCertified = r.disp === 'subdivide' || r.disp === 'depthcap';
      bump(d <= diag ? onGraph : offGraph, r.disp);
      if (nonCertified) {
        nonCertifiedDist.push(d / diag);
        nonCertifiedSiteDist.push(dSite / diag);
        if (dSite <= diag) nonCertNearSite += 1;
      }
      if (r.disp === 'accept') {
        acceptedDist.push(d / diag);
        acceptedSiteDist.push(dSite / diag);
      }
      if (r.disp === 'refused') {
        refusedTotal += 1;
        if (dSite <= diag) refusedNearSite += 1;
        if (dSite / diag > refusedSiteDistMax) refusedSiteDistMax = dSite / diag;
      }
    }

    nonCertifiedDist.sort((a, b) => a - b);
    acceptedDist.sort((a, b) => a - b);
    nonCertifiedSiteDist.sort((a, b) => a - b);
    acceptedSiteDist.sort((a, b) => a - b);

    const dispositions = [...new Set(rows.map((r) => r.disp))].sort();
    const pct = (n: number, d: number): string => ((100 * n) / Math.max(d, 1)).toFixed(1);
    const nonCertOn = (onGraph.get('subdivide') ?? 0) + (onGraph.get('depthcap') ?? 0);
    const nonCertTotal = nonCertOn + (offGraph.get('subdivide') ?? 0) + (offGraph.get('depthcap') ?? 0);
    const acceptOn = onGraph.get('accept') ?? 0;
    const acceptTotal = acceptOn + (offGraph.get('accept') ?? 0);

    const report = [
      '',
      '========== STRATA-001 S0 FIRED-MAP OVERLAY (P1/P2) ==========',
      `csv: ${csvPath}`,
      `rows: ${rows.length}   order-1 segments: ${segs.length}   sites: ${sites.length}`,
      `clarke=1 fraction: ${pct(rows.filter((r) => r.clarke).length, rows.length)}%  <-- tape-global flag, NOT stratum-attributed`,
      '',
      '--- disposition census ---',
      ...dispositions.map(
        (d) =>
          `  ${d.padEnd(10)}: ${rows.filter((r) => r.disp === d).length}  (on-graph ${onGraph.get(d) ?? 0} / off-graph ${offGraph.get(d) ?? 0})`
      ),
      '',
      '--- P1 PROXY GATE: NON-CERTIFIED cells (subdivide|depthcap) vs order-1 graph ---',
      `  on-graph  (<= 1 cell diag): ${nonCertOn}  (${pct(nonCertOn, nonCertTotal)}%)   [gate: >= 95%]`,
      `  off-graph                 : ${nonCertTotal - nonCertOn}  (${pct(nonCertTotal - nonCertOn, nonCertTotal)}%)`,
      `  dist/diag  p50 ${quantile(nonCertifiedDist, 0.5).toFixed(3)}  p90 ${quantile(nonCertifiedDist, 0.9).toFixed(3)}  p99 ${quantile(nonCertifiedDist, 0.99).toFixed(3)}`,
      '',
      '--- CONTRAST: certified (accepted) cells vs the same graph ---',
      `  on-graph: ${acceptOn}  (${pct(acceptOn, acceptTotal)}%)   [if this ~= the non-certified rate, the graph explains NOTHING]`,
      `  dist/diag  p50 ${quantile(acceptedDist, 0.5).toFixed(3)}  p90 ${quantile(acceptedDist, 0.9).toFixed(3)}`,
      '',
      '--- RIVAL LOCUS: non-certified cells vs SITE CONES (f1=0, sqrt cusp) ---',
      `  within 1 cell diag of a site: ${nonCertNearSite}  (${pct(nonCertNearSite, nonCertTotal)}%)`,
      `  non-certified site-dist/diag  p50 ${quantile(nonCertifiedSiteDist, 0.5).toFixed(3)}  p90 ${quantile(nonCertifiedSiteDist, 0.9).toFixed(3)}`,
      `  certified     site-dist/diag  p50 ${quantile(acceptedSiteDist, 0.5).toFixed(3)}  p90 ${quantile(acceptedSiteDist, 0.9).toFixed(3)}`,
      `  VERDICT: cones explain the population iff non-certified p50 << certified p50.`,
      '',
      '--- P1 site-cone clause: REFUSED cells vs lattice site centers ---',
      `  refused: ${refusedTotal}   within 1 cell diag of a site: ${refusedNearSite}  (${pct(refusedNearSite, refusedTotal)}%)`,
      `  worst refused site-dist / diag: ${refusedSiteDistMax.toFixed(3)}`,
      `  spec P1 says "site cones quiet in both modes" -> refused>0 at sites REFUTES that clause.`,
      '=============================================================',
      '',
    ].join('\n');

    // eslint-disable-next-line no-console
    console.log(report);
    const outPath = process.env.PF_STRATA_OVERLAY_OUT;
    if (outPath !== undefined) writeFileSync(outPath, report, 'utf8');

    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});
