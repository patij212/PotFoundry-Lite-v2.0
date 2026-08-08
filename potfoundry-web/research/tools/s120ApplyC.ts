// s120ApplyC.ts — S120 TASK C, STAGE 4. APPLY OPERATOR (c) TO THE WHOLE BLOCKED CLASS AND RE-MEASURE.
//
// Stage 2 priced every operator INDEPENDENTLY against the unmutated mesh, and measured that 88.5 % of the
// blocked class has a blocked NEIGHBOUR. So the per-facet unblock rate is an upper bound on what a real
// pass delivers: two overlapping 1-rings cannot both be retriangulated from the same starting geometry.
// This stage does the honest thing — apply (c) GREEDILY with conflict skipping, commit the mesh, then
// re-run the blocked-class census over the treated region. It is the number a recommendation must rest on.
//
// It also censuses the AR bins BY AREA mesh-wide, which stage 1 reported only by count, so the population
// a tighter EMIT cap would refuse is priced instead of guessed.
//
// env: PF_S120_STL PF_S120_STYLE PF_S120_TAG PF_S120_ACCEPT_UM PF_S120_DUMP PF_S120_ROUNDS
import { readFileSync } from 'node:fs';
import {
  rebuildFromStl, measureSurfaceResidual, styleRadius, driverDefaults, buildWeldGrid, weldHit,
  growMesh, eLen, eVerts, triArea, arOf, eKeyOf, edgeRadialMax,
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
const ROUNDS = Math.round(envF('PF_S120_ROUNDS', 4));
const EDGEN = Math.round(envF('PF_S120_EDGEN', 64));
const PLACEBO = envS('PF_S120_APPLYC_PLACEBO', '0') === '1';
if (STL.length === 0 || DUMP.length === 0) { log('*** PF_S120_STL and PF_S120_DUMP required ***'); process.exit(2); }

const T0 = Date.now();
log('═'.repeat(104));
log(`S120 TASK C · STAGE 4 — (c) APPLIED FOR REAL${PLACEBO ? ' [PLACEBO: random fan]' : ''}   tag=${TAG}  style=${STYLE}  acceptTol=${(ACCEPT * 1000).toFixed(3)} µm`);
log('═'.repeat(104));
const { rA, paramsJson } = styleRadius(STYLE);
log(`mesh   ${STL}`);
log(`params ${paramsJson}`);
const C: DriverConst = driverDefaults(ACCEPT, false);
const base = rebuildFromStl(STL);
measureSurfaceResidual(base, rA);
const dump = JSON.parse(readFileSync(DUMP, 'utf8')) as { nT: number; blocked: number[][] };
if (dump.nT !== base.nT) { log('*** DUMP/STL MISMATCH ***'); process.exit(2); }
const B0 = dump.blocked.map((r) => r[0]);
const M: Mesh = growMesh(base, 4, 8 * B0.length + 64);
let nT = M.nT;
const G: WeldGrid = buildWeldGrid(M, C);
const arg = makeSagArgmax();
const SM = { ta: M.ta, tb: M.tb, tc: M.tc, vth: M.vth, vz: M.vz, vx: M.vx, vy: M.vy };
const sagOf = (t: number): number => sagAdaptiveRaw(rA, SM, t, C.REF_HS, C.REF_NMIN, C.REF_NMAX, arg);
const uth = (a: number, v: number): number => M.vth[a] + dThRaw(M.vth[a], M.vth[v]);
let rngS = 20260808 >>> 0;
const rnd = (): number => { rngS = (rngS * 1664525 + 1013904223) >>> 0; return rngS / 4294967296; };

log(`blocked class from the census: ${B0.length.toLocaleString()}   mesh ${M.nT.toLocaleString()} facets / ${M.area3.toFixed(3)} mm²`);

// ── AR BINS BY AREA, mesh-wide, exhaustive — prices the population a tighter EMIT cap would refuse ──
{
  const BINS = [0, 10, 20, 25, 30, 40, 50, 1e9];
  const cnt = new Array<number>(BINS.length - 1).fill(0);
  const ar = new Array<number>(BINS.length - 1).fill(0);
  let tot = 0;
  for (let t = 0; t < M.nT; t += 1) {
    const a = arOf(M, t); const A = triArea(M, t); tot += A;
    let i = 0; for (let k = BINS.length - 2; k >= 0; k -= 1) if (a >= BINS[k]) { i = k; break; }
    cnt[i] += 1; ar[i] += A;
  }
  log('');
  log('── AR bins BY AREA, mesh-wide, EXHAUSTIVE (stage 1 gave counts only) ──');
  log('     AR bin          facets       share        area mm²      area share');
  for (let i = 0; i < cnt.length; i += 1) {
    if (cnt[i] === 0) continue;
    const hi = BINS[i + 1] >= 1e9 ? '∞' : String(BINS[i + 1]);
    log(`     [${String(BINS[i]).padStart(3)},${hi.padStart(3)})  ${String(cnt[i]).padStart(11)}  ${(100 * cnt[i] / M.nT).toFixed(4).padStart(8)} %  ${ar[i].toFixed(4).padStart(12)}  ${(100 * ar[i] / tot).toFixed(4).padStart(8)} %`);
  }
  const over25 = cnt.slice(3).reduce((s, v) => s + v, 0); const over25a = ar.slice(3).reduce((s, v) => s + v, 0);
  log(`   ⇒ a tighter EMIT cap at AR = ${C.SHAPE_AR / 2} would have to refuse or repair ${over25.toLocaleString()} facets (${(100 * over25 / M.nT).toFixed(4)} %), ${over25a.toFixed(4)} mm² (${(100 * over25a / tot).toFixed(4)} % of area).`);
}

// ──────────────────────────── (c), applied greedily with conflict skipping ────────────────────────────
const arTri3 = (p: [number, number, number]): number => aspect3(
  M.vx[p[0]], M.vy[p[0]], M.vz[p[0]], M.vx[p[1]], M.vy[p[1]], M.vz[p[1]], M.vx[p[2]], M.vy[p[2]], M.vz[p[2]]);
const killT = (t: number): void => {
  M.alive[t] = 0;
  for (let e = 0; e < 3; e += 1) {
    const a = e === 0 ? M.ta[t] : e === 1 ? M.tb[t] : M.tc[t];
    const b = e === 0 ? M.tb[t] : e === 1 ? M.tc[t] : M.ta[t];
    const k = eKeyOf(M.BIG, a, b); const l = M.edge.get(k);
    if (l === undefined) continue;
    const i = l.indexOf(t); if (i >= 0) l.splice(i, 1);
    if (l.length === 0) M.edge.delete(k);
  }
};
const addT = (a: number, b: number, c: number): number => {
  const t = nT; nT += 1;
  M.ta[t] = a; M.tb[t] = b; M.tc[t] = c; M.alive[t] = 1;
  for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
    const k = eKeyOf(M.BIG, p, q); const l = M.edge.get(k);
    if (l === undefined) M.edge.set(k, [t]); else l.push(t);
  }
  return t;
};
/** the driver's split legality for facet t, evaluated on the CURRENT mesh. */
function legal(t: number): boolean {
  for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e);
    if (eLen(M, a, b) < C.FLOOR_MM) continue;
    const list = (M.edge.get(eKeyOf(M.BIG, a, b)) ?? []).filter((u) => M.alive[u] !== 0);
    for (const frac of C.NUDGE_LADDER) {
      let lo = 0; let hi = 1;
      const lift = (s: number): { x: number; y: number; z: number; th: number } => {
        const th2 = canonTheta(M.vth[a] + dThRaw(M.vth[a], M.vth[b]) * s);
        const z2 = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
        const r2 = rA(th2, z2);
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
/** the blocked predicate on the CURRENT mesh */
const blockedNow = (t: number): boolean => M.alive[t] !== 0 && sagOf(t) > C.acceptTol && !legal(t);

/** one greedy (c) round over `work`; returns the facets it actually retriangulated. */
function roundC(work: number[]): { applied: number; skipped: Record<string, number>; created: number[] } {
  const touched = new Set<number>();
  const created: number[] = [];
  const skipped: Record<string, number> = {};
  const no = (k: string): void => { skipped[k] = (skipped[k] ?? 0) + 1; };
  let applied = 0;
  for (const t of work) {
    if (M.alive[t] === 0 || touched.has(t)) { no('already-touched'); continue; }
    const ring: number[] = []; const killed: number[] = [t];
    let ok = true;
    for (let e = 0; e < 3; e += 1) {
      const [a, b] = eVerts(M, t, e);
      ring.push(a);
      const list = (M.edge.get(eKeyOf(M.BIG, a, b)) ?? []).filter((u) => M.alive[u] !== 0);
      if (list.length !== 2) { ok = false; break; }
      const u = list[0] === t ? list[1] : list[0];
      killed.push(u);
      ring.push(M.ta[u] !== a && M.ta[u] !== b ? M.ta[u] : M.tb[u] !== a && M.tb[u] !== b ? M.tb[u] : M.tc[u]);
    }
    if (!ok) { no('boundary-or-non-manifold'); continue; }
    if (new Set(killed).size !== 4) { no('ring-shares-a-neighbour'); continue; }
    if (new Set(ring).size !== ring.length) { no('ring-not-simple'); continue; }
    if (killed.some((u) => touched.has(u))) { no('patch-conflict'); continue; }
    const n = ring.length;
    const anchor = ring[0];
    const PX = ring.map((v) => uth(anchor, v)); const PZ = ring.map((v) => M.vz[v]);
    let ringArea = 0;
    for (let i = 0; i < n; i += 1) { const j = (i + 1) % n; ringArea += PX[i] * PZ[j] - PX[j] * PZ[i]; }
    const sgn = Math.sign(ringArea);
    if (sgn === 0) { no('ring-degenerate'); continue; }
    let patch: Array<[number, number, number]>;
    if (PLACEBO) {           // COST-MATCHED PLACEBO: same 4-in/4-out, a random valid fan instead of the DP
      const a0 = Math.floor(rnd() * n);
      patch = [];
      for (let i = 1; i < n - 1; i += 1) patch.push([ring[a0], ring[(a0 + i) % n], ring[(a0 + i + 1) % n]]);
    } else {
      const cost: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const cut: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
      const ear = (i: number, k: number, j: number): number => {
        const s = Math.sign((PX[k] - PX[i]) * (PZ[j] - PZ[i]) - (PX[j] - PX[i]) * (PZ[k] - PZ[i]));
        if (s !== sgn) return Infinity;
        return arTri3([ring[i], ring[k], ring[j]]);
      };
      for (let len = 2; len < n; len += 1) for (let i = 0; i + len < n; i += 1) {
        const j = i + len; let best = Infinity; let bk = -1;
        for (let k = i + 1; k < j; k += 1) {
          const v = Math.max(cost[i][k], cost[k][j], ear(i, k, j));
          if (v < best) { best = v; bk = k; }
        }
        cost[i][j] = best; cut[i][j] = bk;
      }
      if (!Number.isFinite(cost[0][n - 1])) { no('no-valid-triangulation'); continue; }
      patch = [];
      const emit = (i: number, j: number): void => {
        if (j - i < 2) return; const k = cut[i][j];
        patch.push([ring[i], ring[k], ring[j]]); emit(i, k); emit(k, j);
      };
      emit(0, n - 1);
    }
    let over = false;
    for (const p of patch) if (arTri3(p) > C.SHAPE_AR) over = true;
    if (over) { no('product-over-AR-cap'); continue; }
    for (const p of patch) {
      const s = signedAreaParam(M.vth[p[0]], M.vz[p[0]], uth(p[0], p[1]), M.vz[p[1]], uth(p[0], p[2]), M.vz[p[2]]);
      if (s === 0) { over = true; }
    }
    if (over) { no('product-degenerate'); continue; }
    for (const u of killed) { killT(u); touched.add(u); }
    for (const p of patch) { const nt = addT(p[0], p[1], p[2]); touched.add(nt); created.push(nt); }
    applied += 1;
  }
  return { applied, skipped, created };
}

// ── BEFORE ──
const region = new Set<number>(B0);
for (const t of B0) for (let e = 0; e < 3; e += 1) {
  const [a, b] = eVerts(M, t, e);
  for (const u of M.edge.get(eKeyOf(M.BIG, a, b)) ?? []) region.add(u);
}
const regionEdgesOf = (): Array<[number, number]> => {
  const seen = new Set<number>(); const out: Array<[number, number]> = [];
  for (let t = 0; t < nT; t += 1) {
    if (M.alive[t] === 0) continue;
    let hit = false;
    for (const v of [M.ta[t], M.tb[t], M.tc[t]]) if (regionV.has(v)) hit = true;
    if (!hit) continue;
    for (let e = 0; e < 3; e += 1) {
      const [a, b] = eVerts(M, t, e); const k = eKeyOf(M.BIG, a, b);
      if (seen.has(k)) continue; seen.add(k); out.push([a, b]);
    }
  }
  return out;
};
const regionV = new Set<number>();
for (const t of region) for (const v of [M.ta[t], M.tb[t], M.tc[t]]) regionV.add(v);

const edgeStat = (): { n: number; max: number; o10: number; o1: number } => {
  const es = regionEdgesOf(); let mx = 0; let o10 = 0; let o1 = 0;
  for (const [a, b] of es) {
    const rd = edgeRadialMax(rA, C.H, M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], EDGEN);
    const s = rd.s;
    const px = M.vx[a] + (M.vx[b] - M.vx[a]) * s; const py = M.vy[a] + (M.vy[b] - M.vy[a]) * s;
    const pz = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
    const d = distPerpFrom(rA, C.H, px, py, pz, Math.atan2(py, px), Math.min(C.H, Math.max(0, pz))).d;
    if (d > mx) mx = d; if (d > 0.01) o10 += 1; if (d > 0.001) o1 += 1;
  }
  return { n: es.length, max: mx, o10, o1 };
};
const report = (label: string, work: number[]): number => {
  let nb = 0; let ab = 0; let maxSag = 0; let maxAr = 0; let area = 0; let live = 0;
  for (let t = 0; t < nT; t += 1) {
    if (M.alive[t] === 0) continue;
    let hit = false;
    for (const v of [M.ta[t], M.tb[t], M.tc[t]]) if (regionV.has(v)) hit = true;
    if (!hit) continue;
    live += 1; area += triArea(M, t);
    const a = arOf(M, t); if (a > maxAr) maxAr = a;
    const s = sagOf(t); if (s > maxSag) maxSag = s;
    if (s > C.acceptTol && !legal(t)) { nb += 1; ab += triArea(M, t); }
  }
  const E = edgeStat();
  log(`   ${label.padEnd(16)} region ${live} live facets / ${area.toFixed(4)} mm²   maxAR ${maxAr.toFixed(2)}   MAX sag ${(maxSag * 1000).toFixed(3)} µm`);
  log(`   ${''.padEnd(16)} *** BLOCKED IN REGION: ${nb} facets / ${ab.toFixed(5)} mm² ***`);
  log(`   ${''.padEnd(16)} EDGE: ${E.n} edges  MAX ${(E.max * 1000).toFixed(3)} µm  over 10 µm ${(100 * E.o10 / E.n).toFixed(3)} %  over 1 µm ${(100 * E.o1 / E.n).toFixed(3)} %`);
  void work;
  return nb;
};

log('');
log(`── the REGION = the blocked facets and their edge-neighbours: ${region.size} facets, ${regionV.size} vertices ──`);
report('BEFORE', B0);
let work = B0.slice();
let totalApplied = 0;
for (let r = 1; r <= ROUNDS; r += 1) {
  const res = roundC(work);
  totalApplied += res.applied;
  log('');
  log(`   round ${r}: retriangulated ${res.applied} 1-rings  [skipped: ${Object.entries(res.skipped).map(([k, v]) => `${k} ${v}`).join(', ')}]   nT now ${nT.toLocaleString()} slots`);
  // the next round's work list: everything still blocked in the region
  const next: number[] = [];
  for (let t = 0; t < nT; t += 1) if (M.alive[t] !== 0) {
    let hit = false; for (const v of [M.ta[t], M.tb[t], M.tc[t]]) if (regionV.has(v)) hit = true;
    if (hit && blockedNow(t)) next.push(t);
  }
  report(`AFTER round ${r}`, next);
  if (next.length === 0) break;
  work = next;
}
log('');
log(`   total 1-rings retriangulated: ${totalApplied}   net triangle change: ${nT - M.nT - 0} slots allocated, live delta measured above`);
log('');
log(`done in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
