// _col_byteid.test.ts — DEV-ONLY (research/ only, PF_COL_BYTEID=1). BYTE-IDENTICAL-WHEN-OFF proof for the
// E-2026-07-04-COL-SUBDIV recovery subdivide-collinear fix.
//
// Claim: with recoverySubdivideCollinear OFF (robustOpts undefined OR robustOpts without subdivideCollinear),
// the CURRENT recoverAndLockEdges must behave EXACTLY as the pre-change module (git HEAD, extracted into
// _colByteIdPristineCR.ts). This probe runs a DETERMINISTIC forced-crossing input (the same generator the
// KERNEL-HARDEN byte-id probe used, so it actually exercises flips + near-collinear pickets) through BOTH the
// CURRENT module (robustOpts OMITTED => off) and the PRISTINE module, and asserts identical fingerprints
// (sorted locked keys + stats + triangle-array checksum) in-process. No cross-run diff needed.
//
// ISOLATION: NEW files only. Reuses labkit rulers not needed here — pure recovery A/B. Env sub-gate.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { recoverAndLockEdges } from './constraintRecovery';
import { recoverAndLockEdgesPristine } from './_colByteIdPristineCR';

const ROOT = join('research', 'exchange', '_col_byteid');

function buildForcedCrossing(nRung: number, bowEps: number, midOff: number): { uv: number[]; constraints: number[] } {
  const uv: number[] = []; const add = (u: number, t: number): number => { uv.push(u, t); return uv.length / 2 - 1; };
  const rung: number[] = [];
  for (let i = 0; i < nRung; i++) { const f = i / (nRung - 1); rung.push(add(0.5 + bowEps * Math.sin(Math.PI * f), 0.05 + 0.9 * f)); }
  for (let i = 0; i + 1 < nRung; i++) {
    const f = (i + 0.5) / (nRung - 1);
    add(0.5 + midOff, 0.05 + 0.9 * f); add(0.5 - midOff * 1.3, 0.05 + 0.9 * f);
  }
  add(0.35, 0); add(0.65, 0); add(0.35, 1); add(0.65, 1);
  const constraints: number[] = [];
  for (let i = 0; i + 1 < rung.length; i++) constraints.push(rung[i], rung[i + 1]);
  return { uv, constraints };
}
function triChecksum(tris: Uint32Array): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < tris.length; i++) { h ^= tris[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}
function fingerprint(rec: { locked: Set<number>; alreadyPresent: number; recovered: number; recoveryFailed: number; flips: number }, tris: Uint32Array): string {
  const lockedSorted = Array.from(rec.locked).sort((a, b) => a - b);
  return JSON.stringify({ ap: rec.alreadyPresent, rc: rec.recovered, fa: rec.recoveryFailed, fl: rec.flips, nL: lockedSorted.length, lk: lockedSorted.join(','), cs: triChecksum(tris) });
}

describe('COL-BYTEID — subdivide-collinear OFF is byte-identical to git-HEAD', () => {
  it.skipIf(process.env.PF_COL_BYTEID !== '1')('current-OFF fingerprint == pristine fingerprint (all cases)', () => {
    const cases = [
      { nRung: 30, bow: 3e-3, mid: 8e-3 }, { nRung: 40, bow: 1e-3, mid: 4e-3 },
      { nRung: 60, bow: 5e-4, mid: 2e-3 }, { nRung: 80, bow: 2e-4, mid: 1e-3 },
      { nRung: 100, bow: 5e-5, mid: 3e-4 },
    ];
    const rows: Array<Record<string, unknown>> = [];
    for (const c of cases) {
      const { uv, constraints } = buildForcedCrossing(c.nRung, c.bow, c.mid);
      const coords = new Float64Array(uv.length); for (let k = 0; k < uv.length; k++) coords[k] = uv[k];
      const d = new Delaunator(coords);
      const tris0 = d.triangles.slice(), he0 = d.halfedges.slice();
      for (const gm of [false, true]) {
        // CURRENT, robustOpts OMITTED => subdivideCollinear OFF => must be byte-identical.
        const tc = tris0.slice(), hc = he0.slice();
        const recC = recoverAndLockEdges(tc, hc, uv, constraints.slice(), 64, gm);
        // PRISTINE (git HEAD).
        const tp = tris0.slice(), hp = he0.slice();
        const recP = recoverAndLockEdgesPristine(tp, hp, uv, constraints.slice(), 64, gm);
        const fpC = fingerprint(recC, tc), fpP = fingerprint(recP, tp);
        rows.push({ nRung: c.nRung, gm, match: fpC === fpP, robustSliverRejects: recC.robustSliverRejects, robustManifoldRejects: recC.robustManifoldRejects, subdivSplits: recC.subdivSplits });
        expect(fpC).toBe(fpP); // byte-identical off
        // diagnostics must be inert when the switches are off
        expect(recC.robustSliverRejects).toBe(0);
        expect(recC.robustManifoldRejects).toBe(0);
        expect(recC.subdivSplits).toBe(0);
        expect(recC.subdivSubSegments).toBe(0);
      }
    }
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'byteid.json'), JSON.stringify(rows, null, 2));
    // eslint-disable-next-line no-console
    console.log('COL_BYTEID', JSON.stringify(rows));
    expect(rows.every((r) => r.match === true)).toBe(true);
  });

  // Positive control: subdivideCollinear ON must recover a constraint blocked by interior vertices lying ON it,
  // where the OFF path FAILS. Non-vacuous — proves the option actually does something. LOCAL u-span (<0.5) to
  // match how the kernel calls recovery (per-segment local u-frame anchors at p, resolves shortest-image ±0.5).
  it.skipIf(process.env.PF_COL_BYTEID !== '1')('subdivide ON recovers an on-segment-blocked constraint that OFF fails', () => {
    const uv: number[] = [];
    for (let i = 0; i < 5; i++) uv.push(0.4 + i * 0.01, 0.5);          // 0..4 on t=0.5 (constraint 0->4)
    for (let i = 0; i < 4; i++) uv.push(0.405 + i * 0.01, 0.5 + 0.02); // 5..8 above (offset)
    for (let i = 0; i < 4; i++) uv.push(0.405 + i * 0.01, 0.5 - 0.02); // 9..12 below (offset)
    const coords = new Float64Array(uv);
    const d = new Delaunator(coords);
    const constraints = [0, 4]; // 1,2,3 collinear on 0->4
    const t1 = d.triangles.slice(), h1 = d.halfedges.slice();
    const off = recoverAndLockEdges(t1, h1, uv, constraints.slice(), 64, false);
    const t2 = d.triangles.slice(), h2 = d.halfedges.slice();
    const on = recoverAndLockEdges(t2, h2, uv, constraints.slice(), 64, false, { subdivideCollinear: true });
    // eslint-disable-next-line no-console
    console.log('COL_SUBDIV_CTRL', JSON.stringify({ off: { ap: off.alreadyPresent, rc: off.recovered, fa: off.recoveryFailed }, on: { ap: on.alreadyPresent, rc: on.recovered, fa: on.recoveryFailed, splits: on.subdivSplits, subs: on.subdivSubSegments } }));
    expect(off.recoveryFailed).toBe(1); // OFF cannot embed the on-segment-blocked constraint
    expect(on.recoveryFailed).toBe(0);  // ON subdivides at the interior vertices and succeeds
    expect(on.recovered).toBe(1);       // the original constraint is recovered (via split)
    expect(on.subdivSplits).toBe(1);
  });
});
