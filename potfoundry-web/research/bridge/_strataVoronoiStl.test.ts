// _strataVoronoiStl.test.ts — STRATA-001: EMIT the structured per-cell Voronoi mesh as STL + PROVE fidelity on the
// emitted geometry. The fidelity prototype (_strataVoronoiCellMesh) only counted/measured facets; this file writes
// the actual triangles so the 0.01mm claim can be inspected and re-measured independently.
//
// HONESTY: this emits the OUTER-WALL SURFACE (open, not a closed printable solid — that needs inner wall + rim + base,
// the full pipeline) and it is NOT watertight (the recursive longest-edge split leaves T-junctions; a watertight mesh
// needs conforming LEPP refinement, the remaining S7 work). What it PROVES is the FIDELITY: every emitted triangle,
// re-measured at a dense oracle, is ≤ 0.01mm perpendicular from the exact analytic Voronoi surface. Contrast: every
// generic mesher (reference tessellator, production CDT in 5 configs) topped out at MAX ~0.11mm.
//
// Gated PF_STRATA_STL=1. DEV/LAB only; never edits src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { voronoiCenterCellular, type VoronoiLatticeParams } from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_STL === '1';

const LATTICE: VoronoiLatticeParams = { scale: 8, jitter: 0.8, pulse: 0, zStretch: 1, period: 8 };
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const VERDICT_TOL = 0.01;

type P2 = readonly [number, number];
type P3 = [number, number, number];

function envFloat(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

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
      const mx = (sx + nx) / 2;
      const my = (sy + ny) / 2;
      poly = clipHalfPlane(poly, dx, dy, dx * mx + dy * my);
      if (poly.length < 3) return [];
    }
  }
  return poly;
}

interface Tri {
  readonly a: P3;
  readonly b: P3;
  readonly c: P3;
}

function writeBinaryStl(path: string, tris: readonly Tri[]): void {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write('STRATA-001 Voronoi structured per-cell mesh (fidelity proof)', 0, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const t of tris) {
    const ux = t.b[0] - t.a[0];
    const uy = t.b[1] - t.a[1];
    const uz = t.b[2] - t.a[2];
    const vx = t.c[0] - t.a[0];
    const vy = t.c[1] - t.a[1];
    const vz = t.c[2] - t.a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    buf.writeFloatLE(nx, o);
    buf.writeFloatLE(ny, o + 4);
    buf.writeFloatLE(nz, o + 8);
    for (const [k, p] of [t.a, t.b, t.c].entries()) {
      buf.writeFloatLE(p[0], o + 12 + k * 12);
      buf.writeFloatLE(p[1], o + 16 + k * 12);
      buf.writeFloatLE(p[2], o + 20 + k * 12);
    }
    buf.writeUInt16LE(0, o + 48);
    o += 50;
  }
  writeFileSync(path, buf);
}

describe('STRATA-001 Voronoi structured mesh → STL + fidelity proof', () => {
  it.runIf(RUN)('emits STL and re-measures true-3D sag over the emitted triangles', () => {
    const morph = envFloat('PF_STL_MORPH', 1);
    const acceptTol = envFloat('PF_STL_ACCEPT_TOL', 0.007);
    const oracleN = Math.round(envFloat('PF_STL_ORACLE', 12));
    const verifyOracle = Math.round(envFloat('PF_STL_VERIFY', 24));
    const maxDepth = Math.round(envFloat('PF_STL_MAXDEPTH', 30));
    const cxLo = Math.round(envFloat('PF_STL_CXLO', 3));
    const cxHi = Math.round(envFloat('PF_STL_CXHI', 5));
    const cyLo = Math.round(envFloat('PF_STL_CYLO', 3));
    const cyHi = Math.round(envFloat('PF_STL_CYHI', 5));
    const rA = buildRadiusFn('Voronoi' as StyleId, { vMorph: morph, vRelief: 2.0, vScale: 8, vJitter: 0.8, vZStretch: 1, vPulse: 0 }, DIMS);

    const outDir = join('research', 'exchange', '_strataVoronoiStl');
    mkdirSync(outDir, { recursive: true });

    const lift = (cxCell: number, cyCell: number): P3 => {
      const u = cxCell / LATTICE.scale;
      const t = cyCell / (LATTICE.scale * LATTICE.zStretch);
      const theta = 2 * Math.PI * u;
      const z = t * H;
      const r = rA(theta, z);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    };
    const sagOf = (A: P2, B: P2, C: P2, n: number): number => {
      const a = lift(A[0], A[1]);
      const b = lift(B[0], B[1]);
      const c = lift(C[0], C[1]);
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let s = 0;
      for (let i = 0; i <= n; i += 1) {
        for (let j = 0; j <= n - i; j += 1) {
          const wa = i / n;
          const wb = j / n;
          const wc = 1 - wa - wb;
          const q = lift(wa * A[0] + wb * B[0] + wc * C[0], wa * A[1] + wb * B[1] + wc * C[1]);
          const d = Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * ny + (q[2] - a[2]) * nz);
          if (d > s) s = d;
        }
      }
      return s;
    };

    // Collect leaf facets (cellular coords) by recursive longest-edge bisection to the accept tolerance.
    const leaves: Array<[P2, P2, P2]> = [];
    const dist3 = (P: P2, Q: P2): number => {
      const p = lift(P[0], P[1]);
      const q = lift(Q[0], Q[1]);
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    };
    const mid = (P: P2, Q: P2): P2 => [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
    const mesh = (A: P2, B: P2, C: P2, depth: number): void => {
      if (sagOf(A, B, C, oracleN) <= acceptTol || depth >= maxDepth) {
        leaves.push([A, B, C]);
        return;
      }
      const ab = dist3(A, B);
      const bc = dist3(B, C);
      const ca = dist3(C, A);
      if (ab >= bc && ab >= ca) {
        const m = mid(A, B);
        mesh(A, m, C, depth + 1);
        mesh(m, B, C, depth + 1);
      } else if (bc >= ab && bc >= ca) {
        const m = mid(B, C);
        mesh(B, m, A, depth + 1);
        mesh(m, C, A, depth + 1);
      } else {
        const m = mid(C, A);
        mesh(C, m, B, depth + 1);
        mesh(m, A, B, depth + 1);
      }
    };

    let cells = 0;
    for (let cx = cxLo; cx <= cxHi; cx += 1) {
      for (let cy = cyLo; cy <= cyHi; cy += 1) {
        const poly = cellPolygon(cx, cy);
        if (poly.length < 3) continue;
        cells += 1;
        const [sx, sy] = voronoiCenterCellular(LATTICE, cx, cy);
        for (let e = 0; e < poly.length; e += 1) {
          mesh([sx, sy], poly[e], poly[(e + 1) % poly.length], 0);
        }
      }
    }

    // Lift to 3D triangles + write STL.
    const tris: Tri[] = leaves.map(([A, B, C]) => ({ a: lift(A[0], A[1]), b: lift(B[0], B[1]), c: lift(C[0], C[1]) }));
    const stlName = `voronoi_${morph === 0 ? 'bubble' : 'web'}_patch_cx${cxLo}-${cxHi}_cy${cyLo}-${cyHi}.stl`;
    const stlPath = join(outDir, stlName);
    writeBinaryStl(stlPath, tris);

    // INDEPENDENT re-measurement over the EMITTED triangles at the dense verify oracle.
    const sags: number[] = leaves.map(([A, B, C]) => sagOf(A, B, C, verifyOracle));
    sags.sort((a, b) => a - b);
    const q = (p: number): number => sags[Math.min(sags.length - 1, Math.floor(p * sags.length))];
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const maxSag = sags[sags.length - 1];
    const over = sags.filter((s) => s > VERDICT_TOL).length;

    // Bounding box (mm) for context.
    let xMin = 1e9;
    let xMax = -1e9;
    let yMin = 1e9;
    let yMax = -1e9;
    let zMin = 1e9;
    let zMax = -1e9;
    for (const t of tris) {
      for (const p of [t.a, t.b, t.c]) {
        xMin = Math.min(xMin, p[0]);
        xMax = Math.max(xMax, p[0]);
        yMin = Math.min(yMin, p[1]);
        yMax = Math.max(yMax, p[1]);
        zMin = Math.min(zMin, p[2]);
        zMax = Math.max(zMax, p[2]);
      }
    }

    const report = [
      '',
      '========== STRATA-001 VORONOI STRUCTURED MESH → STL (fidelity proof) ==========',
      `file: ${stlName}   (binary STL, ${tris.length} triangles)`,
      `Voronoi ${morph === 0 ? 'BUBBLE' : 'WEB'} (vMorph ${morph}), vRelief 2.0mm, H120/Rb40/Rt50 — registry defaults`,
      `region: ${cells} interior cells cx∈[${cxLo},${cxHi}] cy∈[${cyLo},${cyHi}]  (open outer-wall surface, no seam/rim)`,
      `bbox mm: x[${xMin.toFixed(1)},${xMax.toFixed(1)}] y[${yMin.toFixed(1)},${yMax.toFixed(1)}] z[${zMin.toFixed(1)},${zMax.toFixed(1)}]`,
      '',
      `--- TRUE-3D FIDELITY over the EMITTED triangles (independent re-measure, dense oracle ${verifyOracle}) ---`,
      `  MAX perpendicular sag : ${um(maxSag)} um   ${maxSag <= VERDICT_TOL ? '✅ ≤ 0.01mm' : '❌ OVER 0.01mm'}`,
      `  p99 : ${um(q(0.99))} um   p50 : ${um(q(0.5))} um`,
      `  triangles over 0.01mm : ${over} / ${sags.length}  (${((100 * over) / sags.length).toFixed(3)}%)`,
      '',
      `  PROVES: every emitted triangle is ≤ 0.01mm from the exact analytic Voronoi surface.`,
      `  (Open surface, NOT watertight — recursive split leaves T-junctions; watertight = remaining LEPP+weld work.)`,
      '===============================================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    writeFileSync(join(outDir, `${stlName}.report.txt`), report);

    expect(tris.length).toBeGreaterThan(0);
    expect(maxSag).toBeLessThanOrEqual(VERDICT_TOL);
  }, 3_000_000);
});
