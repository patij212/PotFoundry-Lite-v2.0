// s119SeamMap.ts — S119 TASK 3, STAGE 0: MAP THE DISCONTINUITY SET OF rA.
//
// Before a cliff-aware ruler can exist I have to know WHAT the cliff IS: how many branches, where they
// run in (theta, z), how big the jump is along each, whether the jump is in THETA (a vertical curtain)
// or in Z (a horizontal annular curtain), and how fast the seam azimuth moves with z (which sets the
// table spacing the ruler needs).
//
// METHOD, AND WHY IT IS NOT A STENCIL. At each z level, rA is evaluated on a dense theta grid and every
// adjacent pair whose |dr| exceeds a floor is BISECTED to the f64 limit. A merely-steep region loses its
// rise as the bracket collapses; a genuine jump keeps it (this is the S117/S118 discontinuity test,
// reused verbatim in spirit). Only brackets whose rise SURVIVES the collapse are reported as seams.
//
// Usage: bash research/tools/run-s119-seammap.sh
//   env PF_S119_STYLE PF_S119_NZ PF_S119_NTH PF_S119_MINJUMP PF_S119_TAG
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLE = envS('PF_S119_STYLE', 'CelticTriquetra');
const DIMS: StyleDims = { H: envF('PF_S119_H', 120), Rb: envF('PF_S119_RB', 40), Rt: envF('PF_S119_RT', 50), expn: 1 };
const H = DIMS.H;
const NZ = envI('PF_S119_NZ', 240);
const NTH = envI('PF_S119_NTH', 24000);
const MINJUMP = envF('PF_S119_MINJUMP', 0.02);
const TAG = envS('PF_S119_TAG', 'CT');
const OUTDIR = envS('PF_S119_OUTDIR', 'research/exchange/_strataConformBisect/s119');
const TAU = 2 * Math.PI;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S119 STAGE 0 — WHERE IS THE DISCONTINUITY SET OF rA?  style=${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`scan: ${NZ + 1} z levels x ${NTH} theta samples   minJump ${MINJUMP} mm`);
log('');

interface Hit { z: number; th: number; rLo: number; rHi: number; jump: number; riseWide: number }

/** Bisect [tA,tB] at fixed z keeping the half that carries the change; return the surviving rise. */
function bisectTheta(z: number, tA0: number, tB0: number): { th: number; rL: number; rR: number; rise: number } {
  let tA = tA0; let tB = tB0;
  let rL = rA(tA, z); let rR = rA(tB, z);
  for (let it = 0; it < 200; it += 1) {
    const mid = 0.5 * (tA + tB);
    if (mid === tA || mid === tB) break;
    const rm = rA(mid, z);
    if (Math.abs(rm - rL) >= Math.abs(rR - rm)) { tB = mid; rR = rm; } else { tA = mid; rL = rm; }
  }
  return { th: 0.5 * (tA + tB), rL, rR, rise: Math.abs(rR - rL) };
}

const hits: Hit[] = [];
let steepRejected = 0;
const t0 = Date.now();
for (let j = 0; j <= NZ; j += 1) {
  const z = (j / NZ) * H;
  let prevTh = 0; let prevR = rA(0, z);
  for (let i = 1; i <= NTH; i += 1) {
    const th = (i / NTH) * TAU;
    const r = rA(th, z);
    const dr = Math.abs(r - prevR);
    if (dr > MINJUMP) {
      const b = bisectTheta(z, prevTh, th);
      if (b.rise > 0.5 * dr && b.rise > MINJUMP) {
        hits.push({ z, th: b.th, rLo: Math.min(b.rL, b.rR), rHi: Math.max(b.rL, b.rR), jump: b.rise, riseWide: dr });
      } else steepRejected += 1;
    }
    prevTh = th; prevR = r;
  }
}
log(`theta-direction scan: ${hits.length} SURVIVING jumps, ${steepRejected} steep-but-continuous brackets rejected   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ── group into branches by (z ordering, theta proximity) ────────────────────────────────────────────
hits.sort((a, b) => (a.z - b.z) || (a.th - b.th));
interface Branch { id: number; pts: Hit[] }
const branches: Branch[] = [];
const dz = H / NZ;
for (const h of hits) {
  let best: Branch | null = null; let bestD = Infinity;
  for (const br of branches) {
    const last = br.pts[br.pts.length - 1];
    if (h.z - last.z > 2.5 * dz + 1e-12) continue;
    if (h.z === last.z) continue;
    const d = Math.abs(((h.th - last.th + Math.PI + TAU) % TAU) - Math.PI);
    if (d < bestD) { bestD = d; best = br; }
  }
  if (best !== null && bestD < 0.05) best.pts.push(h);
  else branches.push({ id: branches.length, pts: [h] });
}
log(`grouped into ${branches.length} branches (theta-proximity 0.05 rad, z-gap <= 2.5 levels)`);
log('');
log('  br   n     z range (mm)          theta range (rad)        jump min..max (mm)     max |dtheta/dz| (rad/mm)');
interface BrOut { id: number; n: number; z0: number; z1: number; th0: number; th1: number; jMin: number; jMax: number; slope: number; rLoMin: number; rHiMax: number }
const brOut: BrOut[] = [];
for (const br of branches) {
  if (br.pts.length < 2) continue;
  const zs = br.pts.map((p) => p.z); const ths = br.pts.map((p) => p.th);
  const js = br.pts.map((p) => p.jump);
  let slope = 0;
  for (let i = 1; i < br.pts.length; i += 1) {
    const d = Math.abs(br.pts[i].th - br.pts[i - 1].th) / Math.max(1e-12, br.pts[i].z - br.pts[i - 1].z);
    if (d > slope) slope = d;
  }
  const o: BrOut = {
    id: br.id, n: br.pts.length, z0: Math.min(...zs), z1: Math.max(...zs), th0: Math.min(...ths), th1: Math.max(...ths),
    jMin: Math.min(...js), jMax: Math.max(...js), slope,
    rLoMin: Math.min(...br.pts.map((p) => p.rLo)), rHiMax: Math.max(...br.pts.map((p) => p.rHi)),
  };
  brOut.push(o);
  log(`  ${String(o.id).padStart(3)} ${String(o.n).padStart(4)}   ${o.z0.toFixed(3).padStart(8)}..${o.z1.toFixed(3).padStart(8)}   ${o.th0.toFixed(6).padStart(9)}..${o.th1.toFixed(6).padStart(9)}   ${o.jMin.toFixed(6).padStart(9)}..${o.jMax.toFixed(6).padStart(9)}   ${o.slope.toExponential(3).padStart(11)}`);
}
const singles = branches.filter((b) => b.pts.length < 2).length;
log(`  (+ ${singles} isolated single-z hits, not tabulated)`);
log('');

// ── Z-DIRECTION CONTROL: are there jumps ACROSS z (which would need a HORIZONTAL curtain)? ───────────
let zJumpMax = 0; let zJumpTh = 0; let zJumpZ = 0; let zJumpN = 0;
const NTH2 = Math.min(4000, NTH);
const NZ2 = 4000;
for (let i = 0; i < NTH2; i += 1) {
  const th = (i / NTH2) * TAU;
  let prevZ = 0; let prevR = rA(th, 0);
  for (let j = 1; j <= NZ2; j += 1) {
    const z = (j / NZ2) * H;
    const r = rA(th, z);
    const dr = Math.abs(r - prevR);
    if (dr > MINJUMP) {
      // bisect in z
      let zA = prevZ; let zB = z; let rL = prevR; let rR = r;
      for (let it = 0; it < 200; it += 1) {
        const mid = 0.5 * (zA + zB);
        if (mid === zA || mid === zB) break;
        const rm = rA(th, mid);
        if (Math.abs(rm - rL) >= Math.abs(rR - rm)) { zB = mid; rR = rm; } else { zA = mid; rL = rm; }
      }
      const rise = Math.abs(rR - rL);
      if (rise > 0.5 * dr && rise > MINJUMP) {
        zJumpN += 1;
        if (rise > zJumpMax) { zJumpMax = rise; zJumpTh = th; zJumpZ = 0.5 * (zA + zB); }
      }
    }
    prevZ = z; prevR = r;
  }
}
log(`Z-DIRECTION CONTROL (${NTH2} theta x ${NZ2} z): ${zJumpN} surviving z-jumps, MAX rise ${zJumpMax.toExponential(6)} mm at theta ${zJumpTh.toFixed(6)} z ${zJumpZ.toFixed(6)}`);
log(zJumpN === 0
  ? '   => NO horizontal curtain is needed: the discontinuity set is theta-only. The vertical-curtain model is COMPLETE for this style.'
  : '   *** => HORIZONTAL CURTAINS EXIST. The vertical-curtain model is INCOMPLETE for this style and must say so. ***');
log('');

mkdirSync(OUTDIR, { recursive: true });
writeFileSync(`${OUTDIR}/S119_SEAMMAP_${TAG}.json`, JSON.stringify({
  style: STYLE, dims: DIMS, params: D, nz: NZ, nth: NTH, minJump: MINJUMP,
  nHits: hits.length, steepRejected, branches: brOut, singles,
  zJump: { n: zJumpN, max: zJumpMax, th: zJumpTh, z: zJumpZ },
}, null, 1));
log(`json -> ${OUTDIR}/S119_SEAMMAP_${TAG}.json`);
log('S119 SEAM MAP DONE');
