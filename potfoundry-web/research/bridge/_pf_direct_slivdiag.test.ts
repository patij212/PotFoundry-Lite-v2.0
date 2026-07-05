// _pf_direct_slivdiag.test.ts — DEV-ONLY (PF_SLIVDIAG=1). Reads the persisted direct-strip mesh bin, finds the
// worst-angle triangles, and reports their (u,t) + 3D edge lengths + where they sit (crest / valley / fan) to
// localize the needle source. Cheap, no brute.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeGothicPatch, lift, rowCrests } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path); const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const uv: number[] = new Array(nV * 2), tris: number[] = new Array(nT * 3);
  let o = 8; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

describe('direct-slivdiag', () => {
  it.skipIf(process.env.PF_SLIVDIAG !== '1')('worst-angle triangle anatomy', () => {
    const style = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
    const patch = style === 'geostar' ? makeGeoStarPatch(2, 8) : makeGothicPatch(2, 8);
    const { rA, H, uLo, uHi } = patch;
    const bin = loadBin(join(process.cwd(), 'research', 'exchange', `_pf_creststrip_direct_${style}_smoke`, 'direct_mesh.bin'))
      ?? loadBin(join(process.cwd(), 'research', 'exchange', `_pf_creststrip_direct_${style}`, 'direct_mesh.bin'));
    if (!bin) { /* eslint-disable-next-line no-console */ console.log('no mesh bin'); expect(false).toBe(false); return; }
    const { uv, tris } = bin;
    const P = (i: number): [number, number, number] => lift(rA, uv[2 * i], uv[2 * i + 1], H);
    const nF = tris.length / 3;
    const worst: Array<{ f: number; ang: number }> = [];
    for (let f = 0; f < nF; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const A = P(a), B = P(b), C = P(c);
      const eAB = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const eBC = Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]);
      const eCA = Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
      const ang = (o: number, p: number, q: number): number => { const c2 = (o * o + p * p - q * q) / (2 * o * p); return Math.acos(Math.max(-1, Math.min(1, c2))) * 180 / Math.PI; };
      const minA = Math.min(ang(eAB, eCA, eBC), ang(eAB, eBC, eCA), ang(eBC, eCA, eAB));
      worst.push({ f, ang: minA });
    }
    worst.sort((x, y) => x.ang - y.ang);
    // classify: for each vertex, is it near a crest u at its t? valley = between crests. Cache crests per t-row.
    const crestCache = new Map<number, number[]>();
    const crestsAt = (t: number): number[] => { const k = Math.round(t * 1e5); let c = crestCache.get(k); if (!c) { c = rowCrests(rA, t, H, uLo, uHi, 3000, 0.03); crestCache.set(k, c); } return c; };
    const isCrest = (u: number, t: number): boolean => {
      const cr = crestsAt(t);
      let best = Infinity; for (const uc of cr) best = Math.min(best, Math.abs(uc - u));
      return best * patch.arcPerU < 0.05; // within finest pitch of a crest
    };
    /* eslint-disable no-console */
    console.log(`[slivdiag ${style}] nF=${nF} worst 15:`);
    let onCrest = 0, mixed = 0;
    for (let k = 0; k < Math.min(15, worst.length); k++) {
      const { f, ang } = worst[k]; const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const A = P(a), B = P(b), C = P(c);
      const eAB = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const eBC = Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]);
      const eCA = Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
      const emin = Math.min(eAB, eBC, eCA), emax = Math.max(eAB, eBC, eCA);
      const cA = isCrest(uv[2 * a], uv[2 * a + 1]), cB = isCrest(uv[2 * b], uv[2 * b + 1]), cC = isCrest(uv[2 * c], uv[2 * c + 1]);
      const nC = (cA ? 1 : 0) + (cB ? 1 : 0) + (cC ? 1 : 0);
      const du = Math.max(uv[2 * a], uv[2 * b], uv[2 * c]) - Math.min(uv[2 * a], uv[2 * b], uv[2 * c]);
      const dt = Math.max(uv[2 * a + 1], uv[2 * b + 1], uv[2 * c + 1]) - Math.min(uv[2 * a + 1], uv[2 * b + 1], uv[2 * c + 1]);
      console.log(`  ang=${ang.toFixed(2)}° emin=${emin.toFixed(4)} emax=${emax.toFixed(4)} nCrestV=${nC} du=${(du * patch.arcPerU).toFixed(3)}mm dt=${(dt * H).toFixed(3)}mm ut=[${uv[2 * a].toFixed(4)},${uv[2 * a + 1].toFixed(4)}]`);
    }
    // aggregate: among all <20° tris, how many have >=1 crest vertex vs 0
    let below = 0, belowCrest = 0;
    for (const w of worst) { if (w.ang >= 20) break; below++; const f = w.f; const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; const nC = (isCrest(uv[2 * a], uv[2 * a + 1]) ? 1 : 0) + (isCrest(uv[2 * b], uv[2 * b + 1]) ? 1 : 0) + (isCrest(uv[2 * c], uv[2 * c + 1]) ? 1 : 0); if (nC >= 1) belowCrest++; }
    console.log(`  <20° total=${below} withCrestVertex=${belowCrest} (${(100 * belowCrest / Math.max(1, below)).toFixed(1)}%)`);
    void onCrest; void mixed;
    /* eslint-enable no-console */
    expect(true).toBe(true);
  }, 300000);
});
