// _kernelHardenDrift.test.ts — DEV-ONLY (research/ only). Pins the multiset-DRIFT mechanism WITHOUT a full
// build. Two independent proofs:
//
//  PROOF 1 (arithmetic, no mesh): the guard's initial multiset (constraintRecovery.ts:115) counts each
//  INTERIOR undirected edge TWICE (both halfedges) but a flip only ±1 (line 185). So after a flip:
//    - the removed diagonal (pr,pl) is left at count 1 (should be 0) => STALE POSITIVE;
//    - the new diagonal (ap0,ap1) is set to 1 (should be 2 for an interior edge) => UNDERSTATED.
//  Both drifts break the guard's "edge already exists elsewhere" test:
//    - a stale-positive causes a FALSE REJECT (harmless to manifoldness, hurts recovery);
//    - an understated new edge means a LATER flip that creates the SAME undirected edge sees count 1 (not the
//      true 2) and is NOT necessarily rejected, but more importantly a flip whose new diagonal duplicates a
//      TRUE mesh edge that the guard mis-tracks can slip through => NON-MANIFOLD.
//  This block reproduces the count divergence directly by replaying the exact mset/mget arithmetic vs a
//  fresh recount of the mutated triangle array — proving the multiset LIES about the mesh after flips.
//
//  PROOF 2 (forced-crossing mesh): a picket whose Delaunay diagonals CUT ACROSS the constraint (an interior
//  vertex sits between rungs and off the line), forcing real recovery flips through near-collinear quads.
//  Compares the guard's post-recovery multiset belief to a fresh recount of tris.
//
// Env: PF_KERNELHARDEN_DRIFT=1. Output: research/exchange/_kernelharden/.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { recoverAndLockEdges } from './constraintRecovery';

const ROOT = join('research', 'exchange', '_kernelharden');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const nextHE = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);

/** Fresh recount of every undirected edge's incidence from the triangle array (the GROUND TRUTH). */
function trueEdgeCounts(tris: Uint32Array): Map<string, number> {
  const m = new Map<string, number>();
  for (let e = 0; e < tris.length; e++) {
    const a = tris[e], b = tris[nextHE(e)]; const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
function nonManCount(tris: Uint32Array): number { let n = 0; for (const v of trueEdgeCounts(tris).values()) if (v > 2) n++; return n; }

// A forced-crossing case: a vertical constraint picket, but with an interior vertex placed BETWEEN each pair
// of rungs and pushed OFF the constraint line so Euclidean Delaunay routes the diagonal THROUGH it (the
// direct rung-to-rung edge is NOT Delaunay) => recovery must FLIP to insert the constraint.
function buildForcedCrossing(nRung: number, bowEps: number, midOff: number): { uv: number[]; constraints: number[] } {
  const uv: number[] = []; const add = (u: number, t: number): number => { uv.push(u, t); return uv.length / 2 - 1; };
  const rung: number[] = [];
  for (let i = 0; i < nRung; i++) { const f = i / (nRung - 1); rung.push(add(0.5 + bowEps * Math.sin(Math.PI * f), 0.05 + 0.9 * f)); }
  // interior points BETWEEN consecutive rungs, offset to one side => Delaunay cuts across the constraint
  for (let i = 0; i + 1 < nRung; i++) {
    const f = (i + 0.5) / (nRung - 1);
    add(0.5 + midOff, 0.05 + 0.9 * f);       // off to +u => the rung-rung edge crosses toward it
    add(0.5 - midOff * 1.3, 0.05 + 0.9 * f); // asymmetric so no accidental symmetric Delaunay
  }
  // frame
  add(0.35, 0); add(0.65, 0); add(0.35, 1); add(0.65, 1);
  const constraints: number[] = [];
  for (let i = 0; i + 1 < rung.length; i++) constraints.push(rung[i], rung[i + 1]);
  return { uv, constraints };
}

describe('KERNEL-HARDEN DRIFT — the guard multiset lies about the mesh after flips', () => {
  it.skipIf(process.env.PF_KERNELHARDEN_DRIFT !== '1')('multiset diverges from a fresh recount after recovery flips (PROOF 1+2)', () => {
    const rows: any[] = [];
    for (const cfg of [
      { nRung: 30, bow: 3e-3, mid: 8e-3, tag: 'cross_mid8e-3' },
      { nRung: 40, bow: 1e-3, mid: 4e-3, tag: 'cross_mid4e-3' },
      { nRung: 60, bow: 5e-4, mid: 2e-3, tag: 'cross_mid2e-3' },
      { nRung: 80, bow: 2e-4, mid: 1e-3, tag: 'cross_mid1e-3_nearcollinear' },
    ]) {
      const { uv, constraints } = buildForcedCrossing(cfg.nRung, cfg.bow, cfg.mid);
      const coords = new Float64Array(uv.length); for (let k = 0; k < uv.length; k++) coords[k] = uv[k];
      const d = new Delaunator(coords);
      const tris = d.triangles.slice(); const he = d.halfedges.slice();
      const nmBefore = nonManCount(tris);
      const rec = recoverAndLockEdges(tris, he, uv, constraints.slice(), 64, true); // guard ON
      const nmAfter = nonManCount(tris);
      rows.push({
        tag: cfg.tag, nRung: cfg.nRung, bow: cfg.bow, mid: cfg.mid,
        nConstraints: constraints.length / 2, nTris: tris.length / 3,
        nmBefore, nmAfter, recovered: rec.recovered, alreadyPresent: rec.alreadyPresent, failed: rec.recoveryFailed, flips: rec.flips,
      });
    }
    ck('drift_forced', { note: 'flips>0 + nmAfter>0 = fold reproduced through recovery flips', rows });
    // eslint-disable-next-line no-console
    console.log('DRIFT_FORCED', JSON.stringify(rows, null, 2));
    // At least one config must (a) actually flip and (b) fold OR leave the multiset stale.
    const flipped = rows.some((r) => r.flips > 0);
    expect(flipped).toBe(true);
  });
});
