/**
 * s118xPrecondAudit.ts — INDEPENDENT re-measurement of the S118 PRECOND perpendicular figure.
 *
 * WHY. s118CtApcr.ts:656 adjudicates the worst corners under a HARD CAP of 40,000:
 *
 *     for (let i = 0; i < Math.min(worstCorner.length, 40000); i += 1) {
 *       const w = worstCorner[i];
 *       if (w.d <= precPerpMax) break;     // sound early exit
 *       ...
 *     }
 *
 * The `break` is sound (radial >= perpendicular pointwise). The CAP is not: if the loop reaches i =
 * 40,000 without the break firing, every remaining corner is silently skipped and the printed
 * "PERPENDICULAR MAX" is a LOWER BOUND of an unfinished scan, not a max.
 *
 * This tool runs the SAME reduction with NO CAP, and reports both values side by side, plus the index
 * at which the break fired. It reads the STL directly (streaming f32) so it re-derives every number
 * from the shipped artefact rather than trusting the run log.
 *
 * Usage: PF_S118X_STL=<path> PF_S118X_LABEL=<name> node <bundle>
 */
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = envS('PF_S118X_STYLE', 'CelticTriquetra');
const STL = envS('PF_S118X_STL', '');
const LABEL = envS('PF_S118X_LABEL', 'ARM');
const CAP = envF('PF_S118X_CAP', 40000);          // the cap the original tool used
const PRECBAR = envF('PF_S118X_PRECBAR', 2e-5);   // "corners over 0.02 um"
const DIMS: StyleDims = { H: envF('PF_S118X_H', 120), Rb: envF('PF_S118X_RB', 40), Rt: envF('PF_S118X_RT', 50), expn: 1 };
const H = DIMS.H;
if (STL.length === 0) { log('*** PF_S118X_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
// IDENTICAL projector configuration to s118CtApcr.ts:95 — same instrument, so the numbers are comparable.
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1536, nZ: 768, seedTopK: 6 });

log('════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118X PRECOND AUDIT — ${LABEL} =====`);
log('════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`style ${STYLE}  dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`projector ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples`);

// ── streaming binary-STL corner scan (memory-safe at 1e7 facets) ────────────────────────────────
const fd = openSync(STL, 'r');
const hdr = Buffer.alloc(84); readSync(fd, hdr, 0, 84, 0);
const nTri = hdr.readUInt32LE(80);
const sz = statSync(STL).size;
if (sz !== 84 + nTri * 50) { log(`*** SIZE MISMATCH: header says ${nTri} facets, file implies ${(sz - 84) / 50} ***`); process.exit(3); }
log(`facets ${nTri.toLocaleString()}   (header count MATCHES file size)`);

const cand: { d: number; x: number; y: number; z: number }[] = [];
let radMax = 0; let overBar = 0; let corners = 0;
const CH = 50 * 20000;
const buf = Buffer.alloc(CH);
let off = 84;
while (off < sz) {
  const want = Math.min(CH, sz - off);
  const got = readSync(fd, buf, 0, want, off);
  if (got <= 0) break;
  const nf = Math.floor(got / 50);
  for (let f = 0; f < nf; f += 1) {
    const b0 = f * 50 + 12;
    for (let v = 0; v < 3; v += 1) {
      const x = buf.readFloatLE(b0 + v * 12);
      const y = buf.readFloatLE(b0 + v * 12 + 4);
      const z = buf.readFloatLE(b0 + v * 12 + 8);
      const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      corners += 1;
      if (d > radMax) radMax = d;
      if (d > PRECBAR) { overBar += 1; cand.push({ d, x, y, z }); }
    }
  }
  off += nf * 50;
}
closeSync(fd);
log('');
log('── RADIAL corner scan (exhaustive, every corner, no stride) ──');
log(`   corners scanned ................ ${corners.toLocaleString()}`);
log(`   radial MAX ..................... ${(radMax * 1000).toFixed(4)} um`);
log(`   corners over ${(PRECBAR * 1000).toFixed(2)} um ........... ${overBar.toLocaleString()}`);

// ── the reduction, run TWICE: capped (as shipped) and uncapped (the honest one) ─────────────────
cand.sort((a, b) => b.d - a.d);
const run = (cap: number): { max: number; adjudicated: number; brokeAt: number } => {
  let best = 0; let adj = 0; let brokeAt = -1;
  const lim = Math.min(cand.length, cap);
  for (let i = 0; i < lim; i += 1) {
    const w = cand[i];
    if (w.d <= best) { brokeAt = i; break; }
    const dv = proj.project(w.x, w.y, w.z).dist;
    adj += 1;
    if (dv > best) best = dv;
  }
  return { max: best, adjudicated: adj, brokeAt };
};
const capped = run(CAP);
const honest = run(Number.POSITIVE_INFINITY);
log('');
log('── PERPENDICULAR reduction (descending radial, prune when radial <= running best) ──');
log(`   AS SHIPPED  (cap ${CAP.toLocaleString()}) : PERP MAX ${(capped.max * 1000).toFixed(4)} um   adjudicated ${capped.adjudicated.toLocaleString()}   break fired at ${capped.brokeAt < 0 ? 'NEVER — CAP HIT, SCAN TRUNCATED' : `i=${capped.brokeAt}`}`);
log(`   UNCAPPED    (honest)      : PERP MAX ${(honest.max * 1000).toFixed(4)} um   adjudicated ${honest.adjudicated.toLocaleString()}   break fired at ${honest.brokeAt < 0 ? 'NEVER (list exhausted)' : `i=${honest.brokeAt}`}`);
const ratio = capped.max > 0 ? honest.max / capped.max : Infinity;
log(`   UNDER-READ FACTOR .......... ${ratio.toFixed(4)}x   ${ratio > 1.0001 ? '*** THE SHIPPED FIGURE IS AN UNDER-READ ***' : 'shipped figure stands'}`);
log(`   corners with radial > shipped perp max (${(capped.max * 1000).toFixed(4)} um): ${cand.filter((c) => c.d > capped.max).length.toLocaleString()}   (cap binds iff this is >= ${CAP.toLocaleString()})`);
log('');
log('S118X PRECOND AUDIT DONE');
