/**
 * verify_routeB_realmesh.test.ts — MAIN-LOOP decisive test: does ROUTE B (build
 * the grid IN feature-phase so columns FOLLOW the crests) recover the ~17deg
 * ceiling in a REAL CONNECTED WATERTIGHT mesh — or does it collapse toward
 * Route A's ~5-8deg?
 *
 * verify_warpVsInsert showed Route A (warp a FIXED u-grid) reaches only
 * min 4.74deg (exact)/8.19deg (bilinear) because a t-dependent warp on fixed
 * columns can't track a fast-moving crest (nearest-pinned column zigzags). The
 * 17deg ceiling assumed Route B: columns at phi=const, i.e. u=phi/m(t), which
 * FOLLOW the crest continuously across t (no zigzag).
 *
 * This builds a REAL indexed, connected mesh in feature-phase over the in-scope
 * interior (phi in [1,5], clear of the seam AND of births — petals are born at
 * the seam u->1, so the interior has a stable column set, no transitions). Each
 * cell -> 2 triangles (best-of-2 3D diagonal, as the shaped templates choose).
 * Scores emitted triangles in 3D on BOTH the exact f64 surface and the
 * production bilinear-256 surface, and VERIFIES watertightness via an explicit
 * edge-use map (every interior edge shared by exactly 2 triangles).
 *
 * If Route B real-mesh min >> Route A (toward the ~17deg ceiling), the cure is
 * GRID CONSTRUCTION in feature-phase (not a post-hoc warp), and it survives real
 * connectivity. If it also collapses, the ceiling is not buildable.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { PositionSampler } from './metrics';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);

const DENSE_RES = 256;
function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}
const bilinear = buildBilinear(DENSE_RES);

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

type V3 = readonly [number, number, number];
function angAt(X: V3, Y: V3, Z: V3): number {
  const x1 = Y[0] - X[0], y1 = Y[1] - X[1], z1 = Y[2] - X[2];
  const x2 = Z[0] - X[0], y2 = Z[1] - X[1], z2 = Z[2] - X[2];
  const l1 = Math.hypot(x1, y1, z1), l2 = Math.hypot(x2, y2, z2);
  if (l1 < 1e-12 || l2 < 1e-12) return 0;
  let cs = (x1 * x2 + y1 * y2 + z1 * z2) / (l1 * l2);
  cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
  return (Math.acos(cs) * 180) / Math.PI;
}
function triMin(a: V3, b: V3, c: V3): number {
  return Math.min(angAt(a, b, c), angAt(b, c, a), angAt(c, a, b));
}

interface Dist { n: number; min: number; p1: number; median: number; b15: number; b20: number }
function distOf(v: number[]): Dist {
  const s = [...v].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0;
  for (const x of s) { if (x < 15) b15++; if (x < 20) b20++; }
  return { n, min: n ? s[0] : 0, p1: n ? s[Math.floor(0.01 * n)] : 0, median: n ? s[Math.floor(0.5 * n)] : 0, b15: n ? 100 * b15 / n : 0, b20: n ? 100 * b20 / n : 0 };
}
function fmt(name: string, d: Dist): string {
  return `${name}: n=${d.n} min ${d.min.toFixed(2)} p1 ${d.p1.toFixed(2)} median ${d.median.toFixed(2)} <15 ${d.b15.toFixed(2)}% <20 ${d.b20.toFixed(2)}%`;
}

describe('VERIFY Route B (feature-phase grid) as a real connected watertight mesh', () => {
  for (const tSpan of [128, 256]) {
    it(`feature-phase interior mesh, tSpan=${tSpan}`, () => {
      const phiLo = 1, phiHi = 5; // in-scope interior: clear of seam + births
      const dphi = 0.5 / 64; // crests (half-int) + valleys (int) land on phi lines
      const K = Math.round((phiHi - phiLo) / dphi); // columns
      const cols = K + 1;

      // Vertices on a structured (phi,t) grid → (u=phi/m(t), t). One vertex per
      // (k,j); id = j*cols + k. Columns at phi=const FOLLOW the crest (Route B).
      const vid = (k: number, j: number): number => j * cols + k;
      const uvOf = (k: number, j: number): [number, number] => {
        const t = j / tSpan;
        const phi = phiLo + k * dphi;
        return [phi / mOf(t), t];
      };
      const pos = (P: PositionSampler, k: number, j: number): V3 => {
        const [u, t] = uvOf(k, j);
        return P.position(u, t);
      };

      // Emit triangles (best-of-2 3D diagonal per cell) + an edge-use map for the
      // watertight check. Score on both surfaces.
      const exactVals: number[] = [];
      const biVals: number[] = [];
      const edgeUse = new Map<string, number>();
      const ek = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
      const addTri = (a: number, b: number, c: number): void => {
        for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
          edgeUse.set(ek(x, y), (edgeUse.get(ek(x, y)) ?? 0) + 1);
        }
      };
      for (let j = 0; j < tSpan; j++) {
        for (let k = 0; k < K; k++) {
          const sw = vid(k, j), se = vid(k + 1, j), ne = vid(k + 1, j + 1), nw = vid(k, j + 1);
          // exact-surface positions for the diagonal choice + angle.
          const Esw = pos(exact, k, j), Ese = pos(exact, k + 1, j), Ene = pos(exact, k + 1, j + 1), Enw = pos(exact, k, j + 1);
          const diagA = Math.min(triMin(Esw, Ese, Ene), triMin(Esw, Ene, Enw)); // SW-NE
          const diagB = Math.min(triMin(Esw, Ese, Enw), triMin(Ese, Ene, Enw)); // SE-NW
          const useA = diagA >= diagB;
          if (useA) { exactVals.push(triMin(Esw, Ese, Ene), triMin(Esw, Ene, Enw)); addTri(sw, se, ne); addTri(sw, ne, nw); }
          else { exactVals.push(triMin(Esw, Ese, Enw), triMin(Ese, Ene, Enw)); addTri(sw, se, nw); addTri(se, ne, nw); }
          // same connectivity scored on the bilinear (real) surface.
          const Bsw = pos(bilinear, k, j), Bse = pos(bilinear, k + 1, j), Bne = pos(bilinear, k + 1, j + 1), Bnw = pos(bilinear, k, j + 1);
          if (useA) biVals.push(triMin(Bsw, Bse, Bne), triMin(Bsw, Bne, Bnw));
          else biVals.push(triMin(Bsw, Bse, Bnw), triMin(Bse, Bne, Bnw));
        }
      }

      // Watertight check: interior edges (not on the patch boundary) must be used
      // exactly twice. Boundary edges (k=0/K columns, j=0/tSpan rows) used once.
      let interiorEdges = 0, badInterior = 0;
      for (const [key, cnt] of edgeUse) {
        const [a, b] = key.split(':').map(Number);
        const ka = a % cols, ja = Math.floor(a / cols), kb = b % cols, jb = Math.floor(b / cols);
        const onBoundary = (ka === 0 && kb === 0) || (ka === K && kb === K) || (ja === 0 && jb === 0) || (ja === tSpan && jb === tSpan);
        if (onBoundary) continue;
        interiorEdges++;
        if (cnt !== 2) badInterior++;
      }

      const dE = distOf(exactVals), dB = distOf(biVals);
      /* eslint-disable no-console */
      console.log(`\n===== ROUTE B real connected mesh, tSpan=${tSpan} (phi in [1,5], ${cols} cols) =====`);
      console.log('  ' + fmt('EXACT f64 surface   ', dE));
      console.log('  ' + fmt('BILINEAR-256 (real) ', dB));
      console.log(`  watertight: interior edges ${interiorEdges}, NOT-shared-twice ${badInterior} (0 = watertight)`);
      console.log('  REFERENCE: Route A (warp fixed grid) min 4.74/8.19deg; idealized ceiling 17deg');
      console.log('=================================================================================\n');
      /* eslint-enable no-console */

      expect(dE.n).toBeGreaterThan(1000);
      expect(badInterior).toBe(0); // a real watertight connected mesh
    });
  }
});
