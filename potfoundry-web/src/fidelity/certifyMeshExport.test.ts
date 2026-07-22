/**
 * certifyMeshExport.test.ts — TDD for the full export certificate composer: the
 * unified radial fidelity ruler (MAX ≤ tol on the outer wall) AND a watertight
 * closed solid (topologyMetric by index). The compendium's rule: a fully-certified
 * export is `fidelity.certified && watertight` — surface-fidelity alone is not enough
 * (a faithful but leaky mesh must NOT certify), and watertight alone is not enough
 * (a closed but inaccurate mesh must NOT certify).
 *
 * Fixture: a genuinely CLOSED cylinder (wrapped wall + two cap fans, coincident rim
 * positions ⇒ welds watertight). The outer wall (surfaceId 0) sits on r=R; the caps
 * (surfaceId ≥0.5) are excluded from the fidelity measure.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { certifyMeshExport } from './certifyMeshExport';
import type { AnalyticRadiusFn } from './analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 100;

/** A closed cylinder: wrapped wall (surfaceId 0) + top/bottom cap fans (surfaceId 2). */
function closedCylinder(R: number, nu: number, nt: number, wallScale = 1): {
  mesh: { vertices: Float32Array; indices: Uint32Array }; ut: Float32Array;
} {
  const v: number[] = [];
  const ut: number[] = [];
  // Wall rings: (nt+1) rings × nu vertices (wrapped in u — no seam boundary).
  for (let it = 0; it <= nt; it++) {
    const t = it / nt, z = t * H;
    for (let iu = 0; iu < nu; iu++) {
      const th = (iu / nu) * TAU;
      const r = R * (it > 0 && it < nt ? wallScale : 1); // optionally bulge the interior rings
      v.push(r * Math.cos(th), r * Math.sin(th), z);
      ut.push(iu / nu, t, 0); // surfaceId 0 = outer wall
    }
  }
  const ring = (it: number, iu: number): number => it * nu + ((iu % nu) + nu) % nu;
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = ring(it, iu), b = ring(it, iu + 1), c = ring(it + 1, iu), d = ring(it + 1, iu + 1);
      idx.push(a, b, d, a, d, c);
    }
  }
  // Cap centres (surfaceId 2 ⇒ excluded from the wall fidelity measure).
  const topC = v.length / 3; v.push(0, 0, H); ut.push(0, 1, 2);
  const botC = v.length / 3; v.push(0, 0, 0); ut.push(0, 0, 2);
  // Cap rim edges must be traversed OPPOSITE to the wall's so the shared edge has one
  // forward + one reverse use (watertight, consistent outward orientation). The wall's
  // top rim edge runs ring(nt,iu+1)→ring(nt,iu) and its bottom rim edge ring(0,iu)→
  // ring(0,iu+1); the fans therefore use the opposite direction on each.
  for (let iu = 0; iu < nu; iu++) {
    idx.push(topC, ring(nt, iu), ring(nt, iu + 1));   // top fan: rim edge iu→iu+1
    idx.push(botC, ring(0, iu + 1), ring(0, iu));     // bottom fan: rim edge iu+1→iu
  }
  return { mesh: { vertices: Float32Array.from(v), indices: Uint32Array.from(idx) }, ut: Float32Array.from(ut) };
}

describe('certifyMeshExport — fidelity AND watertight', () => {
  const R = 50;
  const rA: AnalyticRadiusFn = () => R;

  it('a faithful, watertight closed cylinder certifies', () => {
    const { mesh, ut } = closedCylinder(R, 256, 24);
    const cert = certifyMeshExport(mesh, ut, rA, { H, tolMm: 0.1, denseN: 4 });
    expect(cert.watertight).toBe(true);
    expect(cert.boundaryEdges).toBe(0);
    expect(cert.fidelity.certified).toBe(true);
    expect(cert.certified).toBe(true);
  });

  it('a faithful but LEAKY mesh (a wall triangle removed) does NOT certify', () => {
    const { mesh, ut } = closedCylinder(R, 256, 24);
    // Drop the first wall triangle ⇒ boundary edges appear ⇒ not watertight.
    const leaky = { vertices: mesh.vertices, indices: mesh.indices.slice(3) };
    const cert = certifyMeshExport(leaky, ut, rA, { H, tolMm: 0.1, denseN: 4 });
    expect(cert.watertight).toBe(false);
    expect(cert.boundaryEdges).toBeGreaterThan(0);
    expect(cert.certified).toBe(false); // even though fidelity may pass
  });

  it('a watertight but INACCURATE mesh (interior wall bulged) does NOT certify', () => {
    // Bulge the interior wall rings 1mm outward ⇒ vertices off the r=50 reference.
    const { mesh, ut } = closedCylinder(R, 256, 24, 1.02); // interior rings at r=51
    const cert = certifyMeshExport(mesh, ut, rA, { H, tolMm: 0.1, denseN: 4 });
    expect(cert.watertight).toBe(true);
    expect(cert.fidelity.maxMm).toBeGreaterThan(0.1);
    expect(cert.certified).toBe(false); // watertight, but surface fidelity fails
  });
});
