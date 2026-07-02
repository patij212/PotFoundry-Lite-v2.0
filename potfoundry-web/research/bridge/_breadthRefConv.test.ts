// _breadthRefConv.test.ts — DEV-ONLY (PF_BREADTH_REFCONV=1). Reference-density convergence + projector-vs-brute
// trust check for the 3 smooth/crease styles. Answers: (a) how dense must the reference sheet be so its own
// on-surface chord < 0.005mm (well under the 0.01 bar); (b) does projectPointToRadialSurface AGREE with the
// brute-force reference-mesh nearest on these styles' steep creases (the F2 instrument-bug guard) — if yes, the
// analytic projector is a valid fast metric; if no, the dense-reference BVH twin is load-bearing.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, projectPointToRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';
import { buildRefLocator } from './_sharp3dRef';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_refconv');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

function buildSheet(rA: (th: number, z: number) => number, nTh: number, nZ: number) {
  const rows: RowSpec[] = [];
  for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
  return buildStructuredWall(rA, DIMS.H, rows);
}

describe('BREADTH-REFCONV', () => {
  it.skipIf(process.env.PF_BREADTH_REFCONV !== '1')('reference-density convergence + projector-vs-brute trust', () => {
    const styles: StyleId[] = ['BambooSegments', 'GeometricStar', 'LowPolyFacet'] as StyleId[];
    const out: Record<string, unknown> = {};
    for (const style of styles) {
      const rA = buildRadiusFn(style, {}, DIMS);
      // (a) reference on-surface chord vs density (memory-safe caps): sample 300 on-true-surface pts, dist to BVH.
      const conv: Array<{ nTh: number; nZ: number; refTris: number; onSurfMax: number; onSurfP99: number }> = [];
      for (const [nTh, nZ] of [[2000, 800], [3000, 1200]] as const) {
        const ref = buildSheet(rA, nTh, nZ);
        const loc = buildRefLocator(ref, 3.0);
        const ds: number[] = [];
        for (let s = 0; s < 300; s++) { const th = TAU * Math.random(), z = DIMS.H * (0.02 + 0.96 * Math.random()); const r = rA(th, z); ds.push(loc.dist(r * Math.cos(th), r * Math.sin(th), z)); }
        ds.sort((a, b) => a - b);
        conv.push({ nTh, nZ, refTris: ref.nF, onSurfMax: ds[ds.length - 1], onSurfP99: ds[Math.floor(0.99 * ds.length)] });
        // eslint-disable-next-line no-console
        console.log(`[refconv ${style}] ref ${nTh}x${nZ} (${ref.nF} tris): onSurfMax=${ds[ds.length - 1].toFixed(4)} p99=${ds[Math.floor(0.99 * ds.length)].toFixed(4)}`);
      }
      // (b) projector-vs-brute (the F2-bug guard): moderate ref, push points off-surface, compare projector dist to
      // brute-BVH. If they AGREE, projectPointToRadialSurface is a valid EXACT fast metric for this continuous style
      // (no reference-density floor). Test at several off-surface pushes incl. very small (0.02mm).
      const ref = buildSheet(rA, 3000, 1200);
      const loc = buildRefLocator(ref, 3.0);
      let pjMax = 0; const diffs: number[] = [];
      for (let s = 0; s < 600; s++) {
        const th = TAU * Math.random(), z = DIMS.H * (0.05 + 0.9 * Math.random());
        const push = [0.02, 0.05, 0.15, 0.4][s % 4];
        const r = rA(th, z) + push; const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
        const dP = projectPointToRadialSurface(px, py, pz, rA).dist; const dB = loc.bruteDist(px, py, pz);
        // brute-BVH is ITSELF chord-limited by the ref (~0.03mm); the relevant signal is systematic DISAGREEMENT
        // beyond that floor (a wrong-local-minimum projector foot reads MUCH larger). Record signed too.
        const e = Math.abs(dP - dB); diffs.push(e); if (e > pjMax) pjMax = e;
      }
      diffs.sort((a, b) => a - b);
      const rec = { style, conv, projVsBruteMax: pjMax, projVsBruteP99: diffs[Math.floor(0.99 * diffs.length)], projVsBruteP50: diffs[Math.floor(0.5 * diffs.length)] };
      out[style] = rec;
      // eslint-disable-next-line no-console
      console.log(`[refconv ${style}] projector-vs-brute(0.05mm off): max=${pjMax.toFixed(4)} p99=${diffs[Math.floor(0.99 * diffs.length)].toFixed(4)}`);
    }
    save('refconv', out);
  }, 1_200_000);
});
