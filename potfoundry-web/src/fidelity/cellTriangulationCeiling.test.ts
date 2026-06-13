/**
 * cellTriangulationCeiling.test.ts — validates the connectivity-ceiling
 * instrument against KNOWN cases (synthetic-validation discipline) and runs the
 * headline SFB@1 audit, logging the verdict on the blueprint's load-bearing
 * unknown (can connectivity alone remove oblique-crest slivers?).
 */
import { describe, it, expect } from 'vitest';
import type { PositionSampler } from './metrics';
import {
  triangulationsOfNgon,
  polygonBestMinAngle3D,
  measureCellCeiling,
  runSfbCrestCellCeilingAudit,
} from './cellTriangulationCeiling';

/** Isometric (u,t)→3D plane: 3D angles equal the planar (u,t) angles, so known
 *  planar geometry pins the 3D-angle machinery exactly. */
const planar: PositionSampler = {
  position: (u: number, t: number): readonly [number, number, number] => [u, t, 0],
};

/** Catalan(n) = number of triangulations of a convex (n+2)-gon. */
function catalan(n: number): number {
  let c = 1;
  for (let k = 0; k < n; k++) c = (c * 2 * (2 * k + 1)) / (k + 2);
  return Math.round(c);
}

describe('triangulationsOfNgon — complete enumeration', () => {
  it('counts match the Catalan numbers (full set, not a sample)', () => {
    expect(triangulationsOfNgon(3).length).toBe(1);
    expect(triangulationsOfNgon(4).length).toBe(2);
    expect(triangulationsOfNgon(5).length).toBe(5);
    expect(triangulationsOfNgon(6).length).toBe(catalan(4)); // 14
    expect(triangulationsOfNgon(7).length).toBe(catalan(5)); // 42
  });

  it('every triangulation has exactly n−2 triangles with in-range indices', () => {
    for (let n = 3; n <= 7; n++) {
      for (const T of triangulationsOfNgon(n)) {
        expect(T.length).toBe(n - 2);
        for (const tri of T) {
          for (const idx of tri) {
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(n);
          }
        }
      }
    }
  });
});

describe('polygonBestMinAngle3D — known geometry', () => {
  it('an equilateral triangle reads 60°', () => {
    const tri = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 0.5, t: Math.sqrt(3) / 2 },
    ];
    expect(polygonBestMinAngle3D(tri, planar)).toBeCloseTo(60, 4);
  });

  it('a unit square: best triangulation min-angle is 45°', () => {
    // Either diagonal splits the square into two 45-45-90 triangles.
    const sq = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];
    expect(polygonBestMinAngle3D(sq, planar)).toBeCloseTo(45, 4);
  });
});

describe('measureCellCeiling — discrimination on known cells', () => {
  it('a corner-clip grazing a corner is a FORCED sliver (connectivity powerless)', () => {
    // Crest enters S edge far from SW, exits W edge a hair above SW → the forced
    // corner triangle {SW,(0.5,0),(0,0.001)} is a needle no triangulation fixes.
    const rec = measureCellCeiling(0, 0, 1, 1, { u: 0.5, t: 0 }, { u: 0, t: 0.001 }, planar);
    expect(rec.topology).toBe('corner-clip');
    expect(rec.forcedCornerMinAngleDeg).toBeGreaterThan(0);
    expect(rec.forcedCornerMinAngleDeg).toBeLessThan(1);
    expect(rec.bestMinAngleDeg).toBeLessThan(1); // ceiling pinned by the forced sliver
  });

  it('a centred opposite-edge crossing leaves a well-shaped ceiling', () => {
    const rec = measureCellCeiling(0, 0, 1, 1, { u: 0.5, t: 0 }, { u: 0.5, t: 1 }, planar);
    expect(rec.topology).toBe('opposite');
    expect(rec.bestMinAngleDeg).toBeGreaterThan(20);
  });

  it('the ceiling is always ≥ the production fill (cdt2d ∈ the enumerated set)', () => {
    // A handful of generic crossings; best-achievable can never be below what
    // cdt2d already found (unless cdt2d dropped/flipped — then it is suspect).
    const cases: Array<[{ u: number; t: number }, { u: number; t: number }]> = [
      [{ u: 0.3, t: 0 }, { u: 0.7, t: 1 }],
      [{ u: 0.1, t: 0 }, { u: 0, t: 0.4 }],
      [{ u: 1, t: 0.2 }, { u: 0.6, t: 1 }],
      [{ u: 0.2, t: 0 }, { u: 0.9, t: 1 }],
    ];
    for (const [e1, e2] of cases) {
      const rec = measureCellCeiling(0, 0, 1, 1, e1, e2, planar);
      if (rec.delaunayDrops === 0 && rec.delaunayInversions === 0) {
        expect(rec.bestMinAngleDeg).toBeGreaterThanOrEqual(rec.delaunayMinAngleDeg - 1e-6);
      }
    }
  });
});

describe('SFB@1 crest-cell connectivity ceiling — headline audit', () => {
  it('walks the real crests and reports the ceiling distribution', () => {
    const r = runSfbCrestCellCeilingAudit();

    // The instrument actually ran over real crest cells.
    expect(r.config.crestBranches).toBeGreaterThan(0);
    expect(r.cellsMeasured).toBeGreaterThan(50);
    // Ceiling is a valid upper bound on the production fill everywhere it is
    // trustworthy (no cdt2d drop/flip).
    for (const c of r.worstCells) {
      if (c.delaunayDrops === 0 && c.delaunayInversions === 0) {
        expect(c.bestMinAngleDeg).toBeGreaterThanOrEqual(c.delaunayMinAngleDeg - 1e-6);
      }
    }

    /* eslint-disable no-console */
    console.log('\n===== SFB@1 CREST-CELL CONNECTIVITY CEILING (3D, exact placement) =====');
    console.log(
      `grid ${r.config.uSpan}×${r.config.tSpan} (L=${r.config.featureLevel}, B=${r.config.uBias}), ` +
        `${r.config.crestBranches} crest branches`,
    );
    console.log(
      `cells measured: ${r.cellsMeasured}  ` +
        `[corner-clip ${r.cornerClipCells} | opposite ${r.oppositeCells} | ` +
        `same-side ${r.sameSideCells} | degenerate ${r.degenerateCells}]  ` +
        `cdt2d-suspect ${r.delaunaySuspectCells}`,
    );
    console.log(
      `CEILING (best achievable):  min ${r.ceiling.minDeg.toFixed(2)}°  ` +
        `p05 ${r.ceiling.p05Deg.toFixed(2)}°  median ${r.ceiling.medianDeg.toFixed(2)}°  ` +
        `| <15°: ${r.ceiling.below15}  <20°: ${r.ceiling.below20}  <30°: ${r.ceiling.below30}`,
    );
    console.log(
      `PRODUCTION FILL (cdt2d):    min ${r.delaunay.minDeg.toFixed(2)}°  ` +
        `p05 ${r.delaunay.p05Deg.toFixed(2)}°  median ${r.delaunay.medianDeg.toFixed(2)}°  ` +
        `| <15°: ${r.delaunay.below15}  <20°: ${r.delaunay.below20}  <30°: ${r.delaunay.below30}`,
    );
    console.log(
      `FORCED corner-triangle slivers (PROVABLY unfixable by connectivity):  ` +
        `<15°: ${r.forcedCornerBelow15}  <20°: ${r.forcedCornerBelow20}  ` +
        `worst ${r.worstForcedCornerDeg.toFixed(2)}°`,
    );
    console.log(
      `VERDICT  fraction of cells whose BEST triangulation is still <15°: ` +
        `${(r.fractionCeilingBelow15 * 100).toFixed(1)}%  (<20°: ${(r.fractionCeilingBelow20 * 100).toFixed(1)}%)`,
    );
    console.log('worst cells (best 3D min-angle, topology, cdt2d):');
    for (const c of r.worstCells.slice(0, 8)) {
      console.log(
        `  best ${c.bestMinAngleDeg.toFixed(2)}°  cdt2d ${c.delaunayMinAngleDeg.toFixed(2)}°  ` +
          `${c.topology}  forced ${c.forcedCornerMinAngleDeg.toFixed(2)}°  ` +
          `cell(u0=${c.u0.toFixed(4)},t0=${c.t0.toFixed(4)})`,
      );
    }
    console.log('======================================================================\n');
    /* eslint-enable no-console */

    expect(Number.isFinite(r.fractionCeilingBelow15)).toBe(true);
  });
});
