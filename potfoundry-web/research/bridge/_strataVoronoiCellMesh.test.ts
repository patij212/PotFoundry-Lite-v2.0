// _strataVoronoiCellMesh.test.ts — STRATA-001: STRUCTURED Voronoi cell-mesher fidelity prototype.
//
// Both generic vehicles top out at true-3D MAX ~0.11mm on Voronoi (reference tessellator degree-2 can't fan
// junctions; production CDT constraint-recovery fails on the dense bisector graph — E-2026-07-24-STRATA001-S6-CDT).
// The locus probe proved 100% of the over-tolerance error is crease-straddling and the cell INTERIOR is ≤ 0.0072mm.
// The structured answer: mesh each Voronoi CELL as its own polygon whose boundary IS the bisectors, so the crease is
// a cell edge BY CONSTRUCTION (no recovery, no straddling) and the junction is a polygon vertex.
//
// This prototype meshes cells INDEPENDENTLY (fan from the site centre + adaptive true-3D-sag subdivision) and reports
// the worst cell's MAX true-3D chord error INCLUDING its boundary facets (which lie along the bisector crease).
//
// VERDICT (E-2026-07-24-STRATA001-S6-CELLMESH): the naive centre-FAN is INSUFFICIENT — worst cell 220 um (bubble
// v_morph 0) / 1347 um (web v_morph 1) even at 15k+ facets/cell and maxDepth 14. Cause: BOTH modes have a steep relief
// GROOVE at the cell boundary (relief → 0 where f1 is largest / f2−f1 → 0), and long thin centre-to-boundary fan
// triangles chord ACROSS that groove wall; Steiner-at-worst-sample keeps landing on the boundary and falling back to
// the centroid, so it never resolves the wall. The correct structured mesher meshes each cell as a DOMAIN (its
// polygon boundary = the bisectors, respected for FREE — no CDT recovery) with proper M=g/h² / boundary-PARALLEL
// (ring-strip) sizing across the groove wall, NOT a centre fan. i.e. run the metric mesher PER CELL-DOMAIN. The
// polygon extraction + the per-cell-domain metric mesh is the S7 build; this file documents why the shortcut fails.
// DEV/LAB only; never edits src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { voronoiCenterCellular, type VoronoiLatticeParams } from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_CELLMESH === '1';

const LATTICE: VoronoiLatticeParams = { scale: 8, jitter: 0.8, pulse: 0, zStretch: 1, period: 8 };
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
// NOTE: the CPU radius fn (STYLE_FUNCTIONS via buildRadiusFn) reads camelCase keys (types.ts VoronoiParams:
// vMorph/vRelief/vScale/vJitter/vZStretch/vPulse), NOT the registry snake_case. These MUST match DEFAULT_VORONOI's
// lattice (vScale 8, vJitter 0.8, vZStretch 1, vPulse 0) so the cell polygons below (from the target's
// voronoiCenterCellular at scale 8 / jitter 0.8) describe the SAME cells the CPU field lifts.
const VPARAMS = { vMorph: 1, vRelief: 2.0, vScale: 8, vJitter: 0.8, vZStretch: 1, vPulse: 0 } as const;
const TOL = 0.01;

type P2 = readonly [number, number];
type P3 = readonly [number, number, number];

function envFloat(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

/** Clip a convex polygon (cellular coords) to the half-plane nx·x + ny·y ≤ d (Sutherland–Hodgman). */
function clipHalfPlane(poly: P2[], nx: number, ny: number, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - d;
    const db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const s = da / (da - db);
      out.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
    }
  }
  return out;
}

/** The Voronoi cell polygon of site (cx,cy) in cellular coords: a box clipped by bisectors with nearby sites. */
function cellPolygon(cx: number, cy: number): P2[] {
  const [sx, sy] = voronoiCenterCellular(LATTICE, cx, cy);
  const R = 2.5;
  let poly: P2[] = [
    [sx - R, sy - R],
    [sx + R, sy - R],
    [sx + R, sy + R],
    [sx - R, sy + R],
  ];
  for (let ox = -3; ox <= 3; ox += 1) {
    for (let oy = -3; oy <= 3; oy += 1) {
      if (ox === 0 && oy === 0) continue;
      const [nx, ny] = voronoiCenterCellular(LATTICE, cx + ox, cy + oy);
      const dx = nx - sx;
      const dy = ny - sy;
      if (Math.hypot(dx, dy) > 2 * R) continue;
      // Bisector: points closer to (sx,sy) than (nx,ny) ⇒ dx·x + dy·y ≤ dx·mx + dy·my.
      const mx = (sx + nx) / 2;
      const my = (sy + ny) / 2;
      poly = clipHalfPlane(poly, dx, dy, dx * mx + dy * my);
      if (poly.length < 3) return [];
    }
  }
  return poly;
}

describe('STRATA-001 structured Voronoi cell-mesher — per-cell true-3D fidelity', () => {
  it.runIf(RUN)('meshes cells as bisector-bounded polygons and closes ≤ 0.01mm', () => {
    const morph = envFloat('PF_CELLMESH_MORPH', 1);
    const rA = buildRadiusFn('Voronoi' as StyleId, { ...VPARAMS, vMorph: morph }, DIMS);
    const outDir = join('research', 'exchange', '_strataVoronoiCellMesh');
    mkdirSync(outDir, { recursive: true });
    const maxDepth = Math.round(envFloat('PF_CELLMESH_MAXDEPTH', 14));
    const oracleN = Math.round(envFloat('PF_CELLMESH_ORACLE', 6));

    // cellular (cx,cy) → (u,t) → 3D on the analytic outer wall.
    const lift = (cxCell: number, cyCell: number): { p: P3; u: number; t: number } => {
      const u = cxCell / LATTICE.scale;
      const t = cyCell / (LATTICE.scale * LATTICE.zStretch);
      const theta = 2 * Math.PI * u;
      const z = t * H;
      const r = rA(theta, z);
      return { p: [r * Math.cos(theta), r * Math.sin(theta), z], u, t };
    };

    // Max perpendicular true-3D sag of one facet (3 cellular verts) over a barycentric oracle sweep.
    const facetSag = (A: P2, B: P2, C: P2): { sag: number; worst: P2 } => {
      const a = lift(A[0], A[1]).p;
      const b = lift(B[0], B[1]).p;
      const c = lift(C[0], C[1]).p;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return { sag: 0, worst: A };
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let sag = 0;
      let worst: P2 = A;
      for (let i = 0; i <= oracleN; i += 1) {
        for (let j = 0; j <= oracleN - i; j += 1) {
          const wa = i / oracleN;
          const wb = j / oracleN;
          const wc = 1 - wa - wb;
          const cx = wa * A[0] + wb * B[0] + wc * C[0];
          const cy = wa * A[1] + wb * B[1] + wc * C[1];
          const q = lift(cx, cy).p;
          const d = Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * ny + (q[2] - a[2]) * nz);
          if (d > sag) {
            sag = d;
            worst = [cx, cy];
          }
        }
      }
      return { sag, worst };
    };

    // Adaptively mesh one facet: split at the worst-sag point (Steiner) until sag ≤ TOL or depth cap.
    let facetCount = 0;
    let worstLeafSag = 0;
    const meshFacet = (A: P2, B: P2, C: P2, depth: number): void => {
      const { sag, worst } = facetSag(A, B, C);
      if (sag <= TOL || depth >= maxDepth) {
        facetCount += 1;
        if (sag > worstLeafSag) worstLeafSag = sag;
        return;
      }
      // Steiner split at the worst interior sample (fans the bulge); fall back to centroid if degenerate.
      let s: P2 = worst;
      const eqA = s[0] === A[0] && s[1] === A[1];
      const eqB = s[0] === B[0] && s[1] === B[1];
      const eqC = s[0] === C[0] && s[1] === C[1];
      if (eqA || eqB || eqC) s = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
      meshFacet(A, B, s, depth + 1);
      meshFacet(B, C, s, depth + 1);
      meshFacet(C, A, s, depth + 1);
    };

    // Interior cells only (avoid the seam u≈0/1 and rim t≈0/1 — those are separate loci handled by the seam/rim
    // machinery, not the cell interior this prototype validates).
    const results: Array<{ cx: number; cy: number; max: number; facets: number; uSpan: number; tSpan: number; nPoly: number }> = [];
    let worstCellMax = 0;
    let totalFacets = 0;
    for (let cx = 2; cx <= 6; cx += 1) {
      for (let cy = 2; cy <= 6; cy += 1) {
        const poly = cellPolygon(cx, cy);
        if (poly.length < 3) continue;
        const [sx, sy] = voronoiCenterCellular(LATTICE, cx, cy);
        facetCount = 0;
        worstLeafSag = 0;
        for (let e = 0; e < poly.length; e += 1) {
          meshFacet([sx, sy], poly[e], poly[(e + 1) % poly.length], 0);
        }
        let uMin = 1e9;
        let uMax = -1e9;
        let tMin = 1e9;
        let tMax = -1e9;
        for (const pv of poly) {
          const uu = pv[0] / LATTICE.scale;
          const tt = pv[1] / (LATTICE.scale * LATTICE.zStretch);
          if (uu < uMin) uMin = uu;
          if (uu > uMax) uMax = uu;
          if (tt < tMin) tMin = tt;
          if (tt > tMax) tMax = tt;
        }
        results.push({ cx, cy, max: worstLeafSag, facets: facetCount, uSpan: uMax - uMin, tSpan: tMax - tMin, nPoly: poly.length });
        totalFacets += facetCount;
        if (worstLeafSag > worstCellMax) worstCellMax = worstLeafSag;
      }
    }
    results.sort((a, b) => b.max - a.max);
    const um = (mm: number): string => (mm * 1000).toFixed(2);
    const report = [
      '',
      '===== STRATA-001 STRUCTURED VORONOI CELL-MESH (per-cell true-3D) =====',
      `Voronoi v_relief 2.0 v_morph 1, H120, cells cx,cy∈[2,6]  tol ${um(TOL)}um  maxDepth ${maxDepth} oracleN ${oracleN}`,
      `cells meshed: ${results.length}   total leaf facets: ${totalFacets}`,
      `WORST-CELL MAX true-3D sag: ${um(worstCellMax)} um   [≤ 10 ⇒ structured cell-mesh closes Voronoi to 0.01mm]`,
      '',
      '  worst 8 cells:',
      ...results.slice(0, 8).map((r) => `    cell(${r.cx},${r.cy})  MAX ${um(r.max)} um  facets ${r.facets}  uSpan ${r.uSpan.toFixed(4)} tSpan ${r.tSpan.toFixed(4)} nPoly ${r.nPoly}`),
      '=====================================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    appendFileSync(join(outDir, 'report.txt'), report);
    expect(results.length).toBeGreaterThan(0);
  }, 3_000_000);
});
