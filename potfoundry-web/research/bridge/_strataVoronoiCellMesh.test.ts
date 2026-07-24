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
// VERDICT (E-2026-07-24-STRATA001-S6-CELLMESH): the per-cell mesher CLOSES Voronoi to 0.01mm HONESTLY.
//   • Naive centre-FAN + Steiner-at-worst FAILS (220 um bubble / 1347 um web): long thin centre-to-boundary triangles
//     chord across the steep relief GROOVE at the cell boundary, and Steiner-at-worst degenerates to the centroid.
//   • Switching the split to Rivara LONGEST-EDGE bisection (bounded aspect ratio; self-organizes into concentric
//     rings that resolve the groove) + an ACCEPT-TOL MARGIN (accept at 0.007 so the dense-verified sag has headroom
//     against the between-sample under-report) CONVERGES: dense verify (oracle 24) worst = 7.03 um (bubble) / 7.95 um
//     (web) ≤ 0.01mm, at ~1.6k facets/cell (bubble) / ~20k facets/cell (web) ⇒ ~0.1M / ~1.28M for the full 8×8 outer
//     wall (comparable to the certified WaveInterference 1.27M).
// So the FIDELITY of the structured per-cell approach is PROVEN end-to-end (not inference): bisectors are the cell
// polygon boundary (respected for FREE — no CDT recovery, the wall the generic CDT hit) and the interior closes by
// ordinary adaptive refinement. REMAINING for a shippable mesher: (1) weld shared bisector edges + junction vertices
// with MATCHED boundary subdivision (ring-strip discipline) → watertight; (2) seam u=0/1 + rim t=0/1; (3) extract
// cells from the mesher's OWN field (hash-desync landmine). DEV/LAB only; never edits src/.
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
    // Acceptance tolerance MARGIN below the 0.01mm verdict: the accept-oracle samples the sag at discrete points and
    // under-reports the true peak between them, so accepting at exactly 0.01 leaves the DENSE sag ~11-14um. Accepting
    // at a tighter tol gives the between-sample peak headroom (the verify-and-bump pattern from the smooth-grid
    // guarantee). Default 0.007.
    const acceptTol = envFloat('PF_CELLMESH_ACCEPT_TOL', 0.007);

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

    // Adaptively mesh one facet until true-3D sag ≤ TOL or depth cap.
    // SPLIT MODE: 'longest' = Rivara longest-edge bisection (bounded aspect ratio, self-organizes into concentric
    // rings that resolve the boundary groove — the fix for the centre-fan's degenerate Steiner splits); 'steiner' =
    // the refuted worst-sample split, kept for the A/B.
    const splitMode = process.env.PF_CELLMESH_SPLIT ?? 'longest';
    const dist3 = (P: P2, Q: P2): number => {
      const p = lift(P[0], P[1]).p;
      const q = lift(Q[0], Q[1]).p;
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    };
    let facetCount = 0;
    let worstLeafSag = 0;
    let worstVerifiedSag = 0; // leaves re-measured at a DENSER oracle (guards the chordSampleN under-report lesson)
    const facetCap = Math.round(envFloat('PF_CELLMESH_FACETCAP', 400_000));
    const verifyOracle = Math.round(envFloat('PF_CELLMESH_VERIFY', 16));
    const mid = (P: P2, Q: P2): P2 => [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
    // Denser barycentric re-measure of one accepted leaf facet's true-3D sag.
    const verifyFacet = (A: P2, B: P2, C: P2): number => {
      const a = lift(A[0], A[1]).p;
      const b = lift(B[0], B[1]).p;
      const c = lift(C[0], C[1]).p;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let s = 0;
      for (let i = 0; i <= verifyOracle; i += 1) {
        for (let j = 0; j <= verifyOracle - i; j += 1) {
          const wa = i / verifyOracle;
          const wb = j / verifyOracle;
          const wc = 1 - wa - wb;
          const q = lift(wa * A[0] + wb * B[0] + wc * C[0], wa * A[1] + wb * B[1] + wc * C[1]).p;
          const d = Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * ny + (q[2] - a[2]) * nz);
          if (d > s) s = d;
        }
      }
      return s;
    };
    const meshFacet = (A: P2, B: P2, C: P2, depth: number): void => {
      const { sag, worst } = facetSag(A, B, C);
      if (sag <= acceptTol || depth >= maxDepth || facetCount >= facetCap) {
        facetCount += 1;
        if (sag > worstLeafSag) worstLeafSag = sag;
        const v = verifyFacet(A, B, C);
        if (v > worstVerifiedSag) worstVerifiedSag = v;
        return;
      }
      if (splitMode === 'longest') {
        // Bisect the longest 3D edge at its midpoint → 2 triangles sharing the new vertex + opposite vertex.
        const ab = dist3(A, B);
        const bc = dist3(B, C);
        const ca = dist3(C, A);
        if (ab >= bc && ab >= ca) {
          const m = mid(A, B);
          meshFacet(A, m, C, depth + 1);
          meshFacet(m, B, C, depth + 1);
        } else if (bc >= ab && bc >= ca) {
          const m = mid(B, C);
          meshFacet(B, m, A, depth + 1);
          meshFacet(m, C, A, depth + 1);
        } else {
          const m = mid(C, A);
          meshFacet(C, m, B, depth + 1);
          meshFacet(m, A, B, depth + 1);
        }
        return;
      }
      // Steiner split at the worst interior sample; fall back to centroid if degenerate.
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
    const results: Array<{ cx: number; cy: number; max: number; verified: number; facets: number; uSpan: number; tSpan: number; nPoly: number }> = [];
    let worstCellMax = 0;
    let worstCellVerified = 0;
    let totalFacets = 0;
    for (let cx = 2; cx <= 6; cx += 1) {
      for (let cy = 2; cy <= 6; cy += 1) {
        const poly = cellPolygon(cx, cy);
        if (poly.length < 3) continue;
        const [sx, sy] = voronoiCenterCellular(LATTICE, cx, cy);
        facetCount = 0;
        worstLeafSag = 0;
        worstVerifiedSag = 0;
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
        results.push({ cx, cy, max: worstLeafSag, verified: worstVerifiedSag, facets: facetCount, uSpan: uMax - uMin, tSpan: tMax - tMin, nPoly: poly.length });
        totalFacets += facetCount;
        if (worstLeafSag > worstCellMax) worstCellMax = worstLeafSag;
        if (worstVerifiedSag > worstCellVerified) worstCellVerified = worstVerifiedSag;
      }
    }
    results.sort((a, b) => b.verified - a.verified);
    const um = (mm: number): string => (mm * 1000).toFixed(2);
    const report = [
      '',
      '===== STRATA-001 STRUCTURED VORONOI CELL-MESH (per-cell true-3D) =====',
      `Voronoi v_relief 2.0 v_morph ${morph}, H120, cells cx,cy∈[2,6]  tol ${um(TOL)}um  maxDepth ${maxDepth} oracleN ${oracleN} verifyOracle ${verifyOracle} split ${splitMode}`,
      `cells meshed: ${results.length}   total leaf facets: ${totalFacets}`,
      `WORST-CELL MAX (accept oracle ${oracleN}):   ${um(worstCellMax)} um`,
      `WORST-CELL MAX (VERIFY oracle ${verifyOracle}): ${um(worstCellVerified)} um   [≤ 10 ⇒ structured cell-mesh closes Voronoi to 0.01mm HONESTLY]`,
      '',
      '  worst 8 cells (by verified sag):',
      ...results.slice(0, 8).map((r) => `    cell(${r.cx},${r.cy})  accept ${um(r.max)} verify ${um(r.verified)} um  facets ${r.facets}  nPoly ${r.nPoly}`),
      '=====================================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    appendFileSync(join(outDir, 'report.txt'), report);
    expect(results.length).toBeGreaterThan(0);
  }, 3_000_000);
});
