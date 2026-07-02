// _kernelHardenPristine.test.ts — DEV-ONLY. Computes the byte-identical fingerprint from the PRISTINE
// (pre-change) recoverAndLockEdges (extracted via `git cat-file HEAD` into _kernelHardenPristineCR.ts),
// using an IDENTICAL generator + checksum as _kernelHardenByteId.test.ts (inlined here — a .test.ts file
// is not resolvable as an import in vitest). The main session diffs byteid_pristine.json vs
// byteid_current.json: identical => the fix is byte-identical when the opt is off.
//
// Env: PF_KERNELHARDEN_BYTEID=1. Output: research/exchange/_kernelharden/byteid_pristine.json.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { recoverAndLockEdges as pristineRecover } from './_kernelHardenPristineCR';

const ROOT = join('research', 'exchange', '_kernelharden');

// INLINE COPY (must match _kernelHardenByteId.ts exactly — deterministic, no RNG).
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

describe('KERNEL-HARDEN PRISTINE — pre-change recovery fingerprint', () => {
  it.skipIf(process.env.PF_KERNELHARDEN_BYTEID !== '1')('writes the PRISTINE-module fingerprint', () => {
    const cases = [
      { nRung: 30, bow: 3e-3, mid: 8e-3 }, { nRung: 40, bow: 1e-3, mid: 4e-3 },
      { nRung: 60, bow: 5e-4, mid: 2e-3 }, { nRung: 80, bow: 2e-4, mid: 1e-3 },
      { nRung: 100, bow: 5e-5, mid: 3e-4 },
    ];
    const out: any[] = [];
    for (const c of cases) {
      const { uv, constraints } = buildForcedCrossing(c.nRung, c.bow, c.mid);
      const coords = new Float64Array(uv.length); for (let k = 0; k < uv.length; k++) coords[k] = uv[k];
      const d = new Delaunator(coords);
      const tris = d.triangles.slice(); const he = d.halfedges.slice();
      for (const gm of [false, true]) {
        const t2 = tris.slice(), h2 = he.slice();
        const rec = pristineRecover(t2, h2, uv, constraints.slice(), 64, gm);
        const lockedSorted = Array.from(rec.locked).sort((a, b) => a - b);
        out.push({
          nRung: c.nRung, guardManifold: gm,
          alreadyPresent: rec.alreadyPresent, recovered: rec.recovered, failed: rec.recoveryFailed, flips: rec.flips,
          nLocked: lockedSorted.length, lockedHash: lockedSorted.join(','), triChecksum: triChecksum(t2),
        });
      }
    }
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'byteid_pristine.json'), JSON.stringify(out, null, 2));
    expect(out.length).toBe(10);
    // eslint-disable-next-line no-console
    console.log('BYTEID_PRISTINE', JSON.stringify(out));
  });
});
