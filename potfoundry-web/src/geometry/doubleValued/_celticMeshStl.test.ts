// _celticMeshStl.test.ts — P3 M5 dev-gated STL emitter + production-verifier cross-check.
//
// Writes the delivered full-pot CelticKnot mesh to research/exchange/_p3_celtic/celtic_perfect.stl
// via the app's production `generateBinarySTL` (which runs `orientMeshForSTL` internally), then
// cross-checks it against the app's OWN production verifiers as an independent second opinion:
//   - auditWatertight (src/fidelity/bandRemesh/audit.ts) — topology
//   - buildNearestSurface (src/fidelity/metrics.ts)      — nearest-3D-surface chord over an
//        INDEPENDENT analytic reference soup (sheets + wall ruled faces), all triangles indexed
//   - wallChordError (src/fidelity/metrics.ts)           — radial deviation (double-counts the
//        vertical double-valued walls by design, so only the SHEET rms is meaningful; reported)
// Gated on PF_P3_STL=1 (never runs in CI). Run:
//   PF_P3_STL=1 npx vitest run src/geometry/doubleValued/_celticMeshStl.test.ts

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildCelticKnotFullPotMesh } from './celticKnotMesh';
import { buildSurfaceReferenceSoup } from './doubleValuedMesh';
import { generateBinarySTL } from '../stlExport';
import { auditWatertight } from '../../fidelity/bandRemesh/audit';
import { buildNearestSurface, wallChordError } from '../../fidelity/metrics';
import { buildCelticKnotCliffComplex } from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';
import { buildAnalyticRadiusFn } from '../analyticRadius';
import type { DomainWindow, SegLike, SurfaceRadiusFn, Vec3 } from './types';

const TAU = 2 * Math.PI;
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
// The delivered pot: the full multi-column CelticKnot at ckRoundness=1 (smooth crest — the profile
// value M3/M4 certified; the default ckRoundness=0.5 cornered-crest chord is reported separately).
const STYLE = { ckScale: 3, ckWidth: 0.15, ckRelief: 2, ckGap: 0.02, ckRoundness: 1, ckTwist: 0, ckStrands: 3 };
const OPTS = { baseGridU: 120, baseGridT: 84, chordTolMm: 0.01, maxRefinePasses: 2, across: 20 };

describe('P3 M5 STL emitter + production-verifier cross-check (dev-gated, PF_P3_STL=1)', () => {
  it('emits celtic_perfect.stl and reconciles with the production verifiers', () => {
    const { mesh, report } = buildCelticKnotFullPotMesh(STYLE, DIMS, OPTS);
    const buf = generateBinarySTL(mesh, 'celtic_perfect');
    const dir = path.resolve(process.cwd(), 'research/exchange/_p3_celtic');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, 'celtic_perfect.stl');
    fs.writeFileSync(out, Buffer.from(buf));

    // ---- cross-check 1: production auditWatertight (independent topology opinion) ----
    // The two open rings are the t-rims: z = tLo·H and tHi·H. Mark those vertices as boundary.
    const zLo = 0.02 * DIMS.H;
    const zHi = 0.98 * DIMS.H;
    const rim = new Set<number>();
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const z = mesh.vertices[i * 3 + 2];
      if (Math.abs(z - zLo) < 1e-3 || Math.abs(z - zHi) < 1e-3) rim.add(i);
    }
    const wt = auditWatertight({ positions: mesh.vertices, indices: mesh.indices }, { boundaryVertexIndices: rim });

    // ---- cross-check 2: production buildNearestSurface over an INDEPENDENT analytic soup ----
    const rA = buildAnalyticRadiusFn('CelticKnot', STYLE, DIMS);
    const surface: SurfaceRadiusFn = (u, t) => rA(TAU * u, t * DIMS.H);
    const domain: DomainWindow = { uMin: 0, uMax: 1, tLo: 0.02, tHi: 0.98 };
    const complex = buildCelticKnotCliffComplex(
      { columnCount: 3, strandWidth: STYLE.ckWidth * 0.15, strandCount: 3, tightness: 0.5, relief: 2, gap: 0.02, roundness: 1 },
      { H: DIMS.H, Rb: DIMS.Rb, Rt: DIMS.Rt, expn: 1 },
    );
    const segs: SegLike[] = complex.segments.filter((s) => s.kind === 'ribbon-background').map((s) => ({
      tRange: s.tRange,
      at: (x: number) => { const o = s.at(x); return { u: o.u / TAU, t: o.t }; },
      lipsAt: (x: number) => s.lipsAt(x),
    }));
    const soup = buildSurfaceReferenceSoup(surface, domain, segs, DIMS.H, 720, 260, 1400);
    const refPos = new Float32Array(soup.length * 9);
    const refIdx = new Uint32Array(soup.length * 3);
    for (let i = 0; i < soup.length; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = soup[i][k] as Vec3;
        refPos[i * 9 + k * 3] = v[0];
        refPos[i * 9 + k * 3 + 1] = v[1];
        refPos[i * 9 + k * 3 + 2] = v[2];
        refIdx[i * 3 + k] = i * 3 + k;
      }
    }
    const nearest = buildNearestSurface(refPos, refIdx, { minNonVerticalCos: 0, cellMm: 1.5 });
    let prodMax = 0;
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const d2 = nearest.nearestDist2(mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2]);
      if (d2 > prodMax) prodMax = d2;
    }
    const prodNearestMaxMm = Math.sqrt(prodMax);

    // ---- cross-check 3: production wallChordError (radial; double-counts the vertical walls) ----
    const wce = wallChordError(
      { vertices: mesh.vertices, indices: mesh.indices },
      { position: (u, t) => { const r = surface(u, t); return [r * Math.cos(TAU * u), r * Math.sin(TAU * u), t * DIMS.H]; } },
    );

    // eslint-disable-next-line no-console
    console.log(
      `[P3 M5 STL] ${out}\n` +
        `  bytes=${buf.byteLength} tris=${report.triangleCount} verts=${report.vertexCount}\n` +
        `  MINE: maxChordMm=${report.maxChordMm.toFixed(5)} clearRegionMaxChordMm=${(report.clearRegionMaxChordMm ?? -1).toFixed(5)} ` +
        `diamondMaxChordMm=${(report.diamondMaxChordMm ?? -1).toFixed(5)} rmsChordMm=${report.rmsChordMm.toFixed(5)}\n` +
        `  MINE: cliffDevMm=${report.certification.maxCliffDevMm.toFixed(5)} sheetDevMm=${report.certification.maxSheetDevMm.toFixed(5)} ` +
        `nonManifold=${report.nonManifold} seamOpen=${report.seamOpenEdges} tRim=${report.tRimBoundaryEdges} ` +
        `components=${report.componentCount} outward=${report.outwardWinding} inconEdges=${report.orientationInconsistentEdges}\n` +
        `  PROD auditWatertight: nonManifoldEdges=${wt.nonManifoldEdges} tJunctions=${wt.tJunctions} boundaryEdges=${wt.boundaryEdges}\n` +
        `  PROD buildNearestSurface maxMm=${prodNearestMaxMm.toFixed(5)} (mesh VERTICES vs the independent analytic soup — ` +
        `confirms vertices sit on the true surface within the soup's own facet floor; it is not a facet-sag measure)\n` +
        `  PROD wallChordError maxDevMm=${wce.maxDevMm.toFixed(5)} rmsDevMm=${wce.rmsDevMm.toFixed(5)} p99DevMm=${wce.p99DevMm.toFixed(5)} ` +
        `(radial metric — maxDev double-counts the vertical double-valued walls; rms is the sheet signal)`,
    );

    // the STL is a valid binary STL of a watertight, independently-certified pot
    expect(buf.byteLength).toBe(84 + report.triangleCount * 50);
    expect(report.nonManifold).toBe(0);
    expect(report.seamOpenEdges).toBe(0);
    expect(report.certification.maxCliffDevMm).toBeLessThan(0.01);
    expect(report.certification.maxSheetDevMm).toBeLessThan(0.01);
    expect(report.outwardWinding).toBe(true);
    // production topology verifier AGREES: watertight (only the t-rims open, no interior T-junctions)
    expect(wt.nonManifoldEdges).toBe(0);
    expect(wt.tJunctions).toBe(0);
  }, 600000);
});
