// s117PrecondGate.ts — S117 P4 STEP 0: THE ADMISSION GATE FOR APCR.
//
// APCR places every new vertex by evaluating rA(theta, z). If the mesh under test is NOT a mesh of
// THIS analytic surface — wrong style params, wrong dims, a different build of the style function —
// then every projected vertex lands somewhere else and the operator is meaningless. S116 measured
// PRECOND on Gothic at MAX 0.031 um; that is the f32 write floor and it is what "the mesh IS the
// surface" looks like.
//
// This gate is EXHAUSTIVE (every corner of every facet, no stride, no dedup — scar 5) and CHEAP
// (3 rA evals per facet, no projector). It reports:
//   * the mesh bbox, so H / Rb / Rt can be checked rather than assumed;
//   * PRECOND MAX / p99 / p50 in um, and the share of facets with any corner over 1 um and 1 mm;
//   * 3D area, facet count, and a weld+topology probe (boundary / non-manifold / winding).
// A mesh that fails is REFUSED and that refusal is the result. No operator is run on it.
//
// Usage: bash research/tools/run-s117-precond.sh
//   env PF_S117_STL(abs, ; separated for several) PF_S117_STYLES(; separated, parallel to STL)
//       PF_S117_H PF_S117_RB PF_S117_RT PF_S117_TAG PF_S117_OUTDIR
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STLS = envS('PF_S117_STL', '').split(';').filter((s) => s.length > 0);
const STYLES = envS('PF_S117_STYLES', '').split(';').filter((s) => s.length > 0);
const OUTDIR = envS('PF_S117_OUTDIR', 'research/exchange/_strataConformBisect/s117');
const TAG = envS('PF_S117_TAG', 'GATE');
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
if (STLS.length === 0 || STLS.length !== STYLES.length) { log('*** PF_S117_STL and PF_S117_STYLES required, same length ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const qOf = (v: Float64Array, p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * p)))]);
const pct = (a: number, b: number): string => (b === 0 ? '  —  ' : ((a / b) * 100).toFixed(4));

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S117 P4 STEP 0 — APCR ADMISSION GATE (exhaustive PRECOND, every corner, no stride) =====');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`dims H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}   (checked against the mesh bbox below, not assumed)`);
log('');

interface Row {
  style: string; stl: string; nT: number; area: number;
  precMaxUm: number; precP99Um: number; precP50Um: number;
  perpMaxUm: number; perpN: number; perpOver1um: number;
  over1umFacets: number; over1mmFacets: number;
  zmin: number; zmax: number; rmin: number; rmax: number;
  bnd: number; nonMan: number; incons: number; nV: number;
  verdict: string;
}
const rows: Row[] = [];

for (let si = 0; si < STLS.length; si += 1) {
  const STL = STLS[si]; const STYLE = STYLES[si];
  log(`──────── ${STYLE}  ${STL.split(/[\\/]/).pop()} ────────`);
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
  if (cfg === undefined) { log(`   *** REFUSED: style ${STYLE} is not in STYLE_REGISTRY ***`); log(''); continue; }
  const D: Record<string, number> = {};
  for (const g of [cfg.params, cfg.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
  log(`   registry defaults: ${JSON.stringify(D)}`);
  const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
  const H = DIMS.H;
  const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  const src = readMeshFloat64(STL, false);
  const nT = src.nTri; const xyz = src.xyz;
  let area = 0; let precMax = 0; let over1um = 0; let over1mm = 0;
  let zmin = Infinity, zmax = -Infinity, rmin = Infinity, rmax = -Infinity;
  const prec = new Float64Array(nT * 3);
  for (let t = 0; t < nT; t += 1) {
    const o = t * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    area += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by), rc = Math.hypot(cx, cy);
    const p1 = Math.abs(ra - rA(tha, az));
    const p2 = Math.abs(rb - rA(thb, bz));
    const p3 = Math.abs(rc - rA(thc, cz));
    prec[t * 3] = p1; prec[t * 3 + 1] = p2; prec[t * 3 + 2] = p3;
    const pm = p1 > p2 ? (p1 > p3 ? p1 : p3) : (p2 > p3 ? p2 : p3);
    if (pm > precMax) precMax = pm;
    if (pm > 1e-3) over1um += 1;
    if (pm > 1) over1mm += 1;
    for (const z of [az, bz, cz]) { if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
    for (const r of [ra, rb, rc]) { if (r < rmin) rmin = r; if (r > rmax) rmax = r; }
  }
  const ps = prec.slice(); ps.sort();
  // ── SCAR 5 ADJUDICATION. |r - rA| is the RADIAL ruler; on a cliff it reads the height of the cliff,
  // not the distance to the surface (S115: a 612,236x over-read from exactly this). Radial >=
  // perpendicular POINTWISE, so the radial number above is a sound UPPER BOUND and nothing more.
  // Every corner it flags is re-measured PERPENDICULARLY here, and the perpendicular number is the
  // one the verdict uses.
  let perpMax = 0; let perpN = 0; let perpOver1um = 0;
  const perpVals: number[] = [];
  if (precMax > 1e-3) {
    const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
    for (let v = 0; v < nT * 3; v += 1) {
      if (prec[v] <= 1e-3) continue;
      perpN += 1;
      const d = proj.project(xyz[v * 3], xyz[v * 3 + 1], xyz[v * 3 + 2]).dist;
      perpVals.push(d);
      if (d > perpMax) perpMax = d;
      if (d > 1e-3) perpOver1um += 1;
    }
  }
  const pv = new Float64Array(perpVals); pv.sort();
  // weld + topology probe — EXACT f32 weld, numeric hash buckets (same weld the operator uses).
  const id = new Int32Array(nT * 3);
  let nV = 0;
  {
    const vx = new Float64Array(nT * 3); const vy = new Float64Array(nT * 3); const vz = new Float64Array(nT * 3);
    const buckets = new Map<number, number[]>();
    const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
    for (let v = 0; v < nT * 3; v += 1) {
      const x = xyz[v * 3], y = xyz[v * 3 + 1], z = xyz[v * 3 + 2];
      f32[0] = x; f32[1] = y; f32[2] = z;
      const h = (Math.imul(u32[0], 0x9e3779b1) ^ Math.imul(u32[1], 0x85ebca6b) ^ Math.imul(u32[2], 0xc2b2ae35)) | 0;
      const b = buckets.get(h);
      let found = -1;
      if (b !== undefined) for (const c of b) if (vx[c] === x && vy[c] === y && vz[c] === z) { found = c; break; }
      if (found < 0) { found = nV; vx[nV] = x; vy[nV] = y; vz[nV] = z; nV += 1; if (b === undefined) buckets.set(h, [found]); else b.push(found); }
      id[v] = found;
    }
  }
  const em = new Map<number, number>();
  const dirSeen = new Map<number, number>();
  let bnd = 0; let nonMan = 0; let incons = 0;
  for (let t = 0; t < nT; t += 1) {
    for (let s = 0; s < 3; s += 1) {
      const a = id[t * 3 + s], b = id[t * 3 + ((s + 1) % 3)];
      const key = a < b ? a * 1e7 + b : b * 1e7 + a;
      em.set(key, (em.get(key) ?? 0) + 1);
      const dk = a * 1e7 + b;
      dirSeen.set(dk, (dirSeen.get(dk) ?? 0) + 1);
    }
  }
  for (const [, c] of em) { if (c === 1) bnd += 1; else if (c > 2) nonMan += 1; }
  for (const [, c] of dirSeen) if (c > 1) incons += 1;

  const okDims = zmin > -1e-6 && zmax < DIMS.H + 1e-3;
  const verdictMaxUm = (precMax > 1e-3 ? perpMax : precMax) * 1000;
  const verdict = verdictMaxUm <= 1.0 && okDims ? 'ADMIT' : 'REFUSE';
  log(`   facets ${nT}   vertices(f32-weld) ${nV}   3D area ${area.toFixed(3)} mm2`);
  log(`   bbox   z [${zmin.toFixed(4)}, ${zmax.toFixed(4)}]  (H=${DIMS.H})   r [${rmin.toFixed(4)}, ${rmax.toFixed(4)}]  (Rb=${DIMS.Rb} Rt=${DIMS.Rt})`);
  log(`   RADIAL   |r - rA| EXHAUSTIVE over ${nT * 3} corners (UPPER BOUND ONLY):  MAX ${(precMax * 1000).toFixed(4)} um   p99 ${(qOf(ps, 0.99) * 1000).toExponential(3)} um   p50 ${(qOf(ps, 0.5) * 1000).toExponential(3)} um`);
  log(`   facets with a corner over 1 um RADIALLY: ${over1um} (${pct(over1um, nT)}%)     over 1 mm: ${over1mm} (${pct(over1mm, nT)}%)`);
  if (perpN > 0) {
    log(`   PERPENDICULAR adjudication of the ${perpN} flagged corners (scar 5 — this is the VERDICT ruler):`);
    log(`      MAX ${(perpMax * 1000).toFixed(4)} um   p99 ${(qOf(pv, 0.99) * 1000).toExponential(3)} um   p50 ${(qOf(pv, 0.5) * 1000).toExponential(3)} um   still over 1 um: ${perpOver1um} (${pct(perpOver1um, perpN)}% of flagged)`);
    log(`      radial/perp over-read factor at the MAX: ${(precMax / Math.max(1e-12, perpMax)).toFixed(1)}x`);
  } else log(`   PERPENDICULAR adjudication: not needed, radial MAX already under 1 um.`);
  log(`   TOPOLOGY boundary edges ${bnd}   non-manifold edges ${nonMan}   inconsistent-winding directed edges ${incons}`);
  log(`   *** ${verdict} ***  (bar: PERPENDICULAR PRECOND MAX <= 1.0 um AND z inside [0,H]; Gothic reference = 0.031 um)`);
  log('');
  rows.push({ style: STYLE, stl: STL, nT, area, precMaxUm: precMax * 1000, precP99Um: qOf(ps, 0.99) * 1000, precP50Um: qOf(ps, 0.5) * 1000, perpMaxUm: perpMax * 1000, perpN, perpOver1um, over1umFacets: over1um, over1mmFacets: over1mm, zmin, zmax, rmin, rmax, bnd, nonMan, incons, nV, verdict });
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   GATE SUMMARY');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   style              facets      area mm2    RADIAL MAX um    PERP MAX um   >1um facets   perp>1um   bnd   nonMan  incons   verdict');
for (const r of rows) {
  log(`   ${r.style.padEnd(18)} ${String(r.nT).padStart(8)}  ${r.area.toFixed(2).padStart(11)}  ${r.precMaxUm.toExponential(4).padStart(14)}  ${(r.perpN > 0 ? r.perpMaxUm.toExponential(4) : '     n/a').padStart(13)}  ${String(r.over1umFacets).padStart(11)}  ${String(r.perpOver1um).padStart(9)}  ${String(r.bnd).padStart(5)} ${String(r.nonMan).padStart(7)} ${String(r.incons).padStart(7)}   ${r.verdict}`);
}
writeFileSync(`${OUTDIR}/S117_PRECOND_${TAG}.json`, JSON.stringify(rows, null, 1));
log(`json -> ${OUTDIR}/S117_PRECOND_${TAG}.json`);
log('S117 GATE DONE');
