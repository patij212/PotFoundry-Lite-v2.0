// s120Relocate.ts — S120 TASK C, STAGE 3. THE OPERATOR THE BRIEF'S LIST DOES NOT CONTAIN.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. Operators (a)-(d) are all LOCAL CONNECTIVITY changes on a FIXED VERTEX SET — (b), (c)
// and (d) re-wire or delete edges without moving a single vertex, and (a) adds a vertex INSIDE a facet
// that is already thin, so every interior point it can choose is thin too. Stage 2 measured all four
// being refused by the SAME guard that creates the blocked class in the first place: `shapeAdmits`'
// aspect3 <= SHAPE_AR. If the blocked facets are thin because their VERTICES sit in the wrong place, no
// amount of re-wiring can help and the ceiling stage 2 measured is the ceiling of the whole family.
//
// (f) 1-RING VERTEX RELOCATION tests exactly that, and it is the cheapest possible test of it:
//     move ONE vertex to the centroid of its 1-ring IN THE PARAMETER DOMAIN, then LIFT it onto rA.
//
// *** THE CONFORMANCE INVARIANT SURVIVES BY CONSTRUCTION. *** The moved vertex is placed by the same
// `r = rA(canon(th), z)` lift `addV` uses, so it is ON the surface to the same tolerance every other
// vertex is. "Every vertex on the surface" is not weakened by a relocation; only the EDGES change, which
// is the half that was never conforming anyway.
//
// GUARDS ARE THE DRIVER'S OWN, transcribed from `tryLocusMoveH` (driver :2716-2721): every triangle in
// the moved vertex's star must keep its (theta,z) signed-area SIGN and stay at or under SHAPE_AR, and a
// boundary vertex is never moved.
//
// env: PF_S120_STL PF_S120_STYLE PF_S120_TAG PF_S120_ACCEPT_UM PF_S120_SNAP PF_S120_DUMP PF_S120_SEED
import { readFileSync } from 'node:fs';
import {
  rebuildFromStl, measureSurfaceResidual, styleRadius, driverDefaults, buildWeldGrid, weldHit,
  eLen, eVerts, triArea, arOf, eKeyOf, edgeRadialMax,
  type Mesh, type DriverConst, type WeldGrid,
} from './s120DriverLib';
import { aspect3, signedAreaParam } from '../bridge/_shapeGuard';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { sagAdaptiveRaw, makeSagArgmax } from '../bridge/_sagKernel';
import { distPerpFrom } from '../bridge/_facetTruthLib';

/* eslint-disable no-console */
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = envS('PF_S120_STL', '');
const STYLE = envS('PF_S120_STYLE', 'GothicArches');
const TAG = envS('PF_S120_TAG', 'RUN');
const ACCEPT = envF('PF_S120_ACCEPT_UM', 3.5) / 1000;
const DUMP = envS('PF_S120_DUMP', '');
const SEED = Math.round(envF('PF_S120_SEED', 20260808));
const EDGEN = Math.round(envF('PF_S120_EDGEN', 64));
const PASSES = Math.round(envF('PF_S120_PASSES', 3));
if (STL.length === 0 || DUMP.length === 0) { log('*** PF_S120_STL and PF_S120_DUMP required ***'); process.exit(2); }

const T0 = Date.now();
log('═'.repeat(104));
log(`S120 TASK C · STAGE 3 — (f) 1-RING VERTEX RELOCATION   tag=${TAG}  style=${STYLE}  acceptTol=${(ACCEPT * 1000).toFixed(3)} µm`);
log('═'.repeat(104));
const { rA, paramsJson } = styleRadius(STYLE);
log(`mesh   ${STL}`);
log(`params ${paramsJson}`);
const C: DriverConst = driverDefaults(ACCEPT, false);
const M: Mesh = rebuildFromStl(STL);
measureSurfaceResidual(M, rA);
const dump = JSON.parse(readFileSync(DUMP, 'utf8')) as { nT: number; blocked: number[][] };
if (dump.nT !== M.nT) { log('*** DUMP/STL MISMATCH ***'); process.exit(2); }
const B = dump.blocked.map((r) => r[0]);
log(`blocked class: ${B.length.toLocaleString()} facets   mesh ${M.nT.toLocaleString()} facets / ${M.area3.toFixed(3)} mm²`);

const G: WeldGrid = buildWeldGrid(M, C);
const arg = makeSagArgmax();
const SM = { ta: M.ta, tb: M.tb, tc: M.tc, vth: M.vth, vz: M.vz, vx: M.vx, vy: M.vy };
const sagOf = (t: number): number => sagAdaptiveRaw(rA, SM, t, C.REF_HS, C.REF_NMIN, C.REF_NMAX, arg);
const uth = (anchor: number, v: number): number => M.vth[anchor] + dThRaw(M.vth[anchor], M.vth[v]);
let rngS = SEED >>> 0;
const rnd = (): number => { rngS = (rngS * 1664525 + 1013904223) >>> 0; return rngS / 4294967296; };

/** every live triangle containing v, walked through the edge map. Capped at 64 like the driver's starOfH. */
function starOf(v: number, seedT: number): number[] {
  const out: number[] = []; const seen = new Set<number>(); const stack = [seedT];
  while (stack.length > 0) {
    const t = stack.pop() as number;
    if (seen.has(t) || M.alive[t] === 0) continue;
    if (M.ta[t] !== v && M.tb[t] !== v && M.tc[t] !== v) continue;
    seen.add(t); out.push(t);
    if (out.length > 64) return [];
    for (const w of [M.ta[t], M.tb[t], M.tc[t]]) {
      if (w === v) continue;
      for (const o of M.edge.get(eKeyOf(M.BIG, v, w)) ?? []) if (o !== t && M.alive[o] !== 0 && !seen.has(o)) stack.push(o);
    }
  }
  return out;
}

interface MoveOut { ok: boolean; why: string; worstAr: number; disp: number }
/**
 * Move `v` to the PARAMETER centroid of its 1-ring (or, for the placebo, to a random convex combination),
 * lifted onto rA. Returns the driver's own verdict without committing.
 */
function tryMove(v: number, star: number[], random: boolean): MoveOut & { px: number; py: number; pz: number; pth: number } {
  const bad = { ok: false, why: '', worstAr: 0, disp: 0, px: 0, py: 0, pz: 0, pth: 0 };
  if (star.length === 0) return { ...bad, why: 'star-cap' };
  if (M.vz[v] <= 1e-9 || M.vz[v] >= C.H - 1e-9) return { ...bad, why: 'boundary' };
  const ring = new Set<number>();
  for (const t of star) for (const w of [M.ta[t], M.tb[t], M.tc[t]]) if (w !== v) ring.add(w);
  if (ring.size < 3) return { ...bad, why: 'ring-too-small' };
  const rs = [...ring];
  let wsum = 0; let th = 0; let z = 0;
  for (const w of rs) {
    const wt = random ? rnd() : 1;
    wsum += wt; th += wt * uth(v, w); z += wt * M.vz[w];
  }
  th /= wsum; z /= wsum;
  const theta = canonTheta(th); const r = rA(theta, z);
  const px = r * Math.cos(theta); const py = r * Math.sin(theta);
  const disp = Math.hypot(px - M.vx[v], py - M.vy[v], z - M.vz[v]);
  if (!(disp > 0)) return { ...bad, why: 'no-move' };
  const hit = weldHit(M, G, px, py, z);
  if (hit >= 0 && hit !== v) return { ...bad, why: 'weld', disp };
  // the driver's own star guards (tryLocusMoveH :2716-2721)
  let worst = 0;
  for (const s of star) {
    const A = M.ta[s]; const Bv = M.tb[s]; const Cv = M.tc[s];
    const gx = (i: number): number => (i === v ? px : M.vx[i]);
    const gy = (i: number): number => (i === v ? py : M.vy[i]);
    const gz = (i: number): number => (i === v ? z : M.vz[i]);
    const gt = (i: number): number => (i === v ? th : uth(v, i));
    const before = signedAreaParam(uth(v, A), M.vz[A], uth(v, Bv), M.vz[Bv], uth(v, Cv), M.vz[Cv]);
    const after = signedAreaParam(gt(A), gz(A), gt(Bv), gz(Bv), gt(Cv), gz(Cv));
    if (before === 0 || after === 0 || (before > 0) !== (after > 0)) return { ...bad, why: 'fold', disp };
    const ar = aspect3(gx(A), gy(A), gz(A), gx(Bv), gy(Bv), gz(Bv), gx(Cv), gy(Cv), gz(Cv));
    if (ar > worst) worst = ar;
    if (!(ar <= C.SHAPE_AR)) return { ...bad, why: 'ar-cap', worstAr: ar, disp };
  }
  return { ok: true, why: '', worstAr: worst, disp, px, py, pz: z, pth: theta };
}

/** commit a move (used only by the APPLIED pass). */
function commit(v: number, px: number, py: number, pz: number, pth: number): void {
  const gi = (x: number): number => Math.floor(x / G.h);
  const ok = `${gi(M.vx[v])},${gi(M.vy[v])},${gi(M.vz[v])}`;
  const ol = G.cell.get(ok);
  if (ol !== undefined) { const at = ol.indexOf(v); if (at >= 0) ol.splice(at, 1); if (ol.length === 0) G.cell.delete(ok); }
  M.vx[v] = px; M.vy[v] = py; M.vz[v] = pz; M.vth[v] = pth;
  const nk = `${gi(px)},${gi(py)},${gi(pz)}`;
  const nl = G.cell.get(nk); if (nl === undefined) G.cell.set(nk, [v]); else nl.push(v);
}

/** the driver's split legality for facet t, on the CURRENT geometry. */
function legal(t: number): boolean {
  for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e);
    if (eLen(M, a, b) < C.FLOOR_MM) continue;
    const list = (M.edge.get(eKeyOf(M.BIG, a, b)) ?? []).filter((u) => M.alive[u] !== 0);
    for (const frac of C.NUDGE_LADDER) {
      let lo = 0; let hi = 1;
      const lift = (s: number): { x: number; y: number; z: number; th: number } => {
        const t2 = M.vth[a] + dThRaw(M.vth[a], M.vth[b]) * s;
        const z2 = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
        const th2 = canonTheta(t2); const r2 = rA(th2, z2);
        return { x: r2 * Math.cos(th2), y: r2 * Math.sin(th2), z: z2, th: th2 };
      };
      for (let i = 0; i < C.MID3D_ITERS; i += 1) {
        const s = 0.5 * (lo + hi); const p = lift(s);
        const dA = Math.hypot(p.x - M.vx[a], p.y - M.vy[a], p.z - M.vz[a]);
        const dB = Math.hypot(p.x - M.vx[b], p.y - M.vy[b], p.z - M.vz[b]);
        if ((1 - frac) * dA <= frac * dB) lo = s; else hi = s;
      }
      let s = 0.5 * (lo + hi);
      if (Math.abs(s - frac) > C.MID3D_MAXSHIFT) s = s > frac ? frac + C.MID3D_MAXSHIFT : frac - C.MID3D_MAXSHIFT;
      const P = lift(s);
      let ok = true;
      for (const u of list) {
        const apex = M.ta[u] !== a && M.ta[u] !== b ? M.ta[u] : M.tb[u] !== a && M.tb[u] !== b ? M.tb[u] : M.tc[u];
        let oa = a; let ob = b;
        const seq = [M.ta[u], M.tb[u], M.tc[u]];
        for (let i = 0; i < 3; i += 1) {
          if (seq[i] === a && seq[(i + 1) % 3] === b) { oa = a; ob = b; break; }
          if (seq[i] === b && seq[(i + 1) % 3] === a) { oa = b; ob = a; break; }
        }
        const ar1 = aspect3(M.vx[oa], M.vy[oa], M.vz[oa], P.x, P.y, P.z, M.vx[apex], M.vy[apex], M.vz[apex]);
        const ar2 = aspect3(P.x, P.y, P.z, M.vx[ob], M.vy[ob], M.vz[ob], M.vx[apex], M.vy[apex], M.vz[apex]);
        if (ar1 > C.SHAPE_AR || ar2 > C.SHAPE_AR) { ok = false; break; }
      }
      if (!ok) continue;
      if (weldHit(M, G, P.x, P.y, P.z) >= 0 && C.NOWELD) continue;
      return true;
    }
  }
  return false;
}

function edgePerp(a: number, b: number): number {
  const rd = edgeRadialMax(rA, C.H, M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], EDGEN);
  const s = rd.s;
  const px = M.vx[a] + (M.vx[b] - M.vx[a]) * s; const py = M.vy[a] + (M.vy[b] - M.vy[a]) * s;
  const pz = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
  return distPerpFrom(rA, C.H, px, py, pz, Math.atan2(py, px), Math.min(C.H, Math.max(0, pz))).d;
}

// ── BEFORE ──────────────────────────────────────────────────────────────────────────────────────────
const patchTris = new Set<number>();
for (const t of B) {
  for (const v of [M.ta[t], M.tb[t], M.tc[t]]) for (const s of starOf(v, t)) patchTris.add(s);
}
const patchEdges: Array<[number, number]> = [];
{
  const seen = new Set<number>();
  for (const t of patchTris) for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e); const k = eKeyOf(M.BIG, a, b);
    if (seen.has(k)) continue; seen.add(k); patchEdges.push([a, b]);
  }
}
const measure = (label: string): void => {
  let maxAr = 0; let over = 0; let area = 0; let maxSag = 0; let nLegal = 0;
  for (const t of patchTris) {
    const a = arOf(M, t); if (a > maxAr) maxAr = a; if (a > C.SHAPE_AR) over += 1;
    area += triArea(M, t);
    const s = sagOf(t); if (s > maxSag) maxSag = s;
  }
  for (const t of B) if (M.alive[t] !== 0 && legal(t)) nLegal += 1;
  let eMax = 0; let e10 = 0; let e1 = 0;
  for (const [a, b] of patchEdges) { const d = edgePerp(a, b); if (d > eMax) eMax = d; if (d > 0.01) e10 += 1; if (d > 0.001) e1 += 1; }
  log(`   ${label.padEnd(22)} patch ${patchTris.size} facets / ${patchEdges.length} edges   maxAR ${maxAr.toFixed(2).padStart(8)}  over-cap ${String(over).padStart(4)}   area ${area.toFixed(5)} mm²   MAX sag ${(maxSag * 1000).toFixed(3).padStart(8)} µm`);
  log(`   ${''.padEnd(22)} EDGE conformance: MAX ${(eMax * 1000).toFixed(3).padStart(9)} µm   over 10 µm ${(100 * e10 / patchEdges.length).toFixed(2).padStart(6)} %   over 1 µm ${(100 * e1 / patchEdges.length).toFixed(2).padStart(6)} %`);
  log(`   ${''.padEnd(22)} *** BLOCKED FACETS NOW SPLITTABLE: ${nLegal} of ${B.length} (${(100 * nLegal / B.length).toFixed(2)} %) ***`);
};

log('');
log('── the patch = every triangle in the 1-ring of every blocked facet\'s three vertices ──');
measure('BEFORE');

// ── APPLY (f), one Gauss-Seidel pass per round over the blocked facets' vertices ──────────────────────
const RANDOM = envS('PF_S120_RELOC_PLACEBO', '0') === '1';
log('');
log(RANDOM
  ? '── (f-PLACEBO) relocate to a RANDOM convex combination of the 1-ring — cost-matched (0 tris, 0 verts) ──'
  : '── (f) relocate to the 1-ring PARAMETER CENTROID, lifted onto rA — cost-matched (0 tris, 0 verts) ──');
for (let pass = 1; pass <= PASSES; pass += 1) {
  let moved = 0; let refused = 0; const whyC: Record<string, number> = {};
  let dispSum = 0; let dispMax = 0;
  const seenV = new Set<number>();
  for (const t of B) for (const v of [M.ta[t], M.tb[t], M.tc[t]]) {
    if (seenV.has(v)) continue; seenV.add(v);
    const st = starOf(v, t);
    const m = tryMove(v, st, RANDOM);
    if (!m.ok) { refused += 1; whyC[m.why] = (whyC[m.why] ?? 0) + 1; continue; }
    commit(v, m.px, m.py, m.pz, m.pth);
    moved += 1; dispSum += m.disp; if (m.disp > dispMax) dispMax = m.disp;
  }
  log(`   pass ${pass}: moved ${moved} of ${seenV.size} vertices, refused ${refused} [${Object.entries(whyC).map(([k, v]) => `${k} ${v}`).join(', ')}]   displacement mean ${(1000 * dispSum / Math.max(1, moved)).toFixed(3)} µm / max ${(1000 * dispMax).toFixed(3)} µm`);
  measure(`AFTER pass ${pass}`);
}
// the surface invariant, re-verified after the moves
{
  let mx = 0;
  const seenV = new Set<number>();
  for (const t of B) for (const v of [M.ta[t], M.tb[t], M.tc[t]]) {
    if (seenV.has(v)) continue; seenV.add(v);
    const d = Math.abs(Math.hypot(M.vx[v], M.vy[v]) - rA(M.vth[v], M.vz[v]));
    if (d > mx) mx = d;
  }
  log('');
  log(`   INVARIANT CHECK — moved vertices are still ON the surface: MAX |r - rA| = ${(mx * 1e6).toFixed(4)} nm`);
}
log('');
log(`done in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
