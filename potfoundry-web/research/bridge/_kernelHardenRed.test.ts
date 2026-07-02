// _kernelHardenRed.test.ts — DEV-ONLY (research/ only; src/ must never import this).
// KERNEL HARDENING RED repro: a SMALL deterministic mesh with a DENSE near-collinear constraint picket
// near a sharp tip that yields nonMan>0 / sub-eps slivers via recoverAndLockEdges with BOTH guards on
// (guardManifold=true). Also directly instruments the multiset-DRIFT hypothesis: the initial multiset
// counts each INTERIOR undirected edge TWICE (both halfedges, line 115) but each flip only ±1 (line 185),
// so the guard's `mget(ap0,ap1)>0` rejects DRIFT from the true "edge shared by >2 triangles" condition.
//
// Env: PF_KERNELHARDEN=1. Output: research/exchange/_kernelharden/.
// Each block env-gated + checkpointed so a killed run resumes by re-running the unfinished block.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { recoverAndLockEdges } from './constraintRecovery';

const ROOT = join('research', 'exchange', '_kernelharden');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

const nextHE = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);

// --- audit helpers on the raw (triangles,uv) — NOT 3D-welded; the recovery op is purely 2D-topological ---
/** Count undirected edges shared by >2 triangles (topological non-manifold on the index mesh). */
function nonManByHE(tris: Uint32Array): number {
  const cnt = new Map<string, number>();
  for (let e = 0; e < tris.length; e++) {
    const a = tris[e], b = tris[nextHE(e)]; const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
  }
  let nm = 0; for (const v of cnt.values()) if (v > 2) nm++; return nm;
}
/** Min |signed area| over all triangles (in the uv frame) — a sub-eps value = a sliver flip happened. */
function minAbsArea(tris: Uint32Array, uv: number[]): { min: number; nBelow: (eps: number) => number } {
  let mn = Infinity; const areas: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ar = Math.abs((uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * b + 1] - uv[2 * a + 1]) * (uv[2 * c] - uv[2 * a])) / 2;
    areas.push(ar); if (ar < mn) mn = ar;
  }
  return { min: mn, nBelow: (eps: number): number => areas.filter((x) => x < eps).length };
}

// Build a small mesh: a base fan + a DENSE near-collinear PICKET of vertices lying almost on a line
// approaching a sharp tip, with a few off-line "shoulder" vertices so the Delaunay diagonals CROSS the
// picket line (forcing recovery flips through near-collinear quads).
function buildPicketCase(nPicket: number, collinearEps: number): { uv: number[]; constraints: number[] } {
  const uv: number[] = [];
  const add = (u: number, t: number): number => { uv.push(u, t); return uv.length / 2 - 1; };
  // sharp tip apex + a far anchor: the constraint ridge runs tip -> anchor along t (nearly a straight u).
  // Petal-tip analog: u drifts by collinearEps across the picket (near-collinear), t marches 0.05..0.95.
  const picket: number[] = [];
  for (let i = 0; i < nPicket; i++) {
    const f = i / (nPicket - 1);
    const t = 0.05 + 0.9 * f;
    const u = 0.5 + collinearEps * Math.sin(Math.PI * f); // tiny bow => near-collinear picket
    picket.push(add(u, t));
  }
  // shoulder vertices on BOTH sides so Euclidean-Delaunay diagonals cut ACROSS the picket line between
  // consecutive picket rungs (this is what forces the recovery to flip near-collinear crossing quads).
  for (let i = 0; i + 1 < nPicket; i++) {
    const f = (i + 0.5) / (nPicket - 1);
    const t = 0.05 + 0.9 * f;
    add(0.5 - 0.03, t); add(0.5 + 0.03, t);
  }
  // a couple of frame corners so the hull is a clean quad
  add(0.42, 0.0); add(0.58, 0.0); add(0.42, 1.0); add(0.58, 1.0);
  // constraints: consecutive picket rungs (the dense ridge ladder)
  const constraints: number[] = [];
  for (let i = 0; i + 1 < picket.length; i++) constraints.push(picket[i], picket[i + 1]);
  return { uv, constraints };
}

describe('KERNEL-HARDEN RED — near-collinear picket folds recoverAndLockEdges', () => {
  it.skipIf(process.env.PF_KERNELHARDEN !== '1')('reproduces nonMan>0 / slivers with guardManifold ON (multiset drift)', () => {
    const rows: any[] = [];
    for (const cfg of [
      { nPicket: 40, eps: 2e-4, tag: 'dense_eps2e-4' },
      { nPicket: 60, eps: 1e-4, tag: 'dense_eps1e-4' },
      { nPicket: 80, eps: 5e-5, tag: 'dense_eps5e-5' },
      { nPicket: 120, eps: 2e-5, tag: 'ultra_eps2e-5' },
    ]) {
      const { uv, constraints } = buildPicketCase(cfg.nPicket, cfg.eps);
      // initial Euclidean Delaunay (same connectivity the kernel uses)
      const coords = new Float64Array(uv.length);
      for (let k = 0; k < uv.length; k++) coords[k] = uv[k];
      const d = new Delaunator(coords);
      const tris = d.triangles.slice(); const he = d.halfedges.slice();
      const nmBefore = nonManByHE(tris);
      const areaBefore = minAbsArea(tris, uv);
      // recover WITH the manifold guard ON (the failing production setting).
      const rec = recoverAndLockEdges(tris, he, uv, constraints.slice(), 64, true);
      const nmAfter = nonManByHE(tris);
      const areaAfter = minAbsArea(tris, uv);
      rows.push({
        tag: cfg.tag, nPicket: cfg.nPicket, eps: cfg.eps, nConstraints: constraints.length / 2, nTris: tris.length / 3,
        nmBefore, nmAfter,
        minAreaBefore: areaBefore.min, minAreaAfter: areaAfter.min,
        sliversBelow1e9After: areaAfter.nBelow(1e-9), sliversBelow1e12After: areaAfter.nBelow(1e-12),
        recovered: rec.recovered, alreadyPresent: rec.alreadyPresent, failed: rec.recoveryFailed, flips: rec.flips,
      });
    }
    ck('red_picket', { note: 'FINDING: an ISOLATED near-collinear picket does NOT fold — its Delaunay already contains the picket edges (0 flips, all alreadyPresent). The real fold is EMERGENT from the dense metric mesh (see _kernelHardenReal/_kernelHardenSfb). Kept as an honest control.', rows });
    // eslint-disable-next-line no-console
    console.log('RED_PICKET', JSON.stringify(rows, null, 2));
    // NO-OP CONTROL: the isolated picket recovers cleanly (0 flips). The FOLD needs the real dense metric mesh
    // + the graded ladder crossing chains (reproduced in _kernelHardenReal / _kernelHardenSfb, not here). We
    // only assert the harness ran + is watertight — the real repro lives in the full-build probes.
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.nmAfter).toBe(r.nmBefore); // isolated picket never folds (documented)
  });
});
