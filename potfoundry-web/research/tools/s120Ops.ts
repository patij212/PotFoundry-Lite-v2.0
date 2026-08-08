// s120Ops.ts — S120 TASK C, STAGE 2. PRICE THE FIVE OPERATORS on the BLOCKED class.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION. When a facet needs refining and NO edge is a legal candidate, what should happen?
//   (a) 1->3 INTERIOR INSERTION at the parametric centroid, lifted onto rA
//   (b) 2->2 FLIP FIRST, then split
//   (c) LOCAL RETRIANGULATION of the 1-ring in the PARAMETER domain, then lift
//   (d) COLLAPSE the degenerate edge
//   (e) REFUSE and strand   (the S118 baseline)
//
// Every operator is scored against the DRIVER'S OWN BARS — `shapeAdmits`' aspect3 <= SHAPE_AR and the
// (theta,z) fold sign — so "admissible" here means admissible to the driver, not to me.
//
// ── THREE THINGS THIS FILE MEASURES THAT DECIDE THE ANSWER ──────────────────────────────────────────
//  1. ADMITTED — is the operator legal at all under the driver's own guards?
//  2. UNBLOCKED — after it, does at least one facet carrying the demand have a LEGAL SPLIT? This, not
//     immediate discharge, is the question: the driver's loop only needs the recursion to RESUME.
//  3. DISCHARGED — is the demand gone outright (every product facet at or under acceptTol)?
// Plus triangle cost, worst product AR, and EDGE CONFORMANCE over the patch's edges before and after.
//
// ── PATCH SEMANTICS, DECLARED ───────────────────────────────────────────────────────────────────────
// Each operator is evaluated INDEPENDENTLY against the UNMUTATED mesh. Blocked facets can be adjacent, so
// a real pass would see interactions this does not model. That is named, not hidden: `adjacentPairs`
// counts how much of the class is adjacent, which bounds the error. Operator (a) is ALSO applied to the
// whole class at once and re-measured globally, because 1->3 insertions are provably independent (they
// touch no shared edge), so for (a) the interaction term is exactly zero and the global number is real.
//
// env: PF_S120_STL PF_S120_STYLE PF_S120_TAG PF_S120_ACCEPT_UM PF_S120_SNAP PF_S120_DUMP PF_S120_SEED
import { readFileSync } from 'node:fs';
import {
  rebuildFromStl, growMesh, measureSurfaceResidual, styleRadius, driverDefaults, buildWeldGrid, weldHit,
  probeSplitEdge, makeDemand, eLen, eVerts, triArea, arOf, eKeyOf, edgeRadialMax, edgeCliffJump,
  type Mesh, type DriverConst, type WeldGrid, type RadiusFn,
} from './s120DriverLib';
import { aspect3, signedAreaParam } from '../bridge/_shapeGuard';
import { canonTheta, dThRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
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
const SNAP = envS('PF_S120_SNAP', '1') === '1';
const DUMP = envS('PF_S120_DUMP', '');
const SEED = Math.round(envF('PF_S120_SEED', 20260808));
const EDGEN = Math.round(envF('PF_S120_EDGEN', 64));
if (STL.length === 0 || DUMP.length === 0) { log('*** PF_S120_STL and PF_S120_DUMP required ***'); process.exit(2); }

const T0 = Date.now();
log('═'.repeat(104));
log(`S120 TASK C · STAGE 2 — OPERATOR PRICING   tag=${TAG}  style=${STYLE}  acceptTol=${(ACCEPT * 1000).toFixed(3)} µm  SNAP=${SNAP ? 1 : 0}`);
log('═'.repeat(104));

const { rA, paramsJson } = styleRadius(STYLE);
log(`mesh   ${STL}`);
log(`params ${paramsJson}`);
const C: DriverConst = driverDefaults(ACCEPT, SNAP);
const PRED: SweepPredConst = { kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62, confMm: 0.6 / 1000, snap: true };

const dump = JSON.parse(readFileSync(DUMP, 'utf8')) as {
  tag: string; nT: number; area3: number; blocked: number[][];
};
const base = rebuildFromStl(STL);
if (base.nT !== dump.nT) { log(`*** DUMP/STL MISMATCH: ${dump.nT} vs ${base.nT} ***`); process.exit(2); }
measureSurfaceResidual(base, rA);
const B = dump.blocked.map((r) => r[0]);
log(`blocked class: ${B.length.toLocaleString()} facets from ${DUMP}`);
log(`mesh: ${base.nT.toLocaleString()} facets, ${base.area3.toFixed(3)} mm²`);

// headroom: at most 1 new vertex and +2 triangles per blocked facet for (a); (c) reuses vertices.
const M: Mesh = growMesh(base, B.length + 8, 8 * B.length + 64);
let nV = M.nV; let nT = M.nT;
const G: WeldGrid = buildWeldGrid(M, C);
const arg = makeSagArgmax();
const SM = { ta: M.ta, tb: M.tb, tc: M.tc, vth: M.vth, vz: M.vz, vx: M.vx, vy: M.vy };
const sagOf = (t: number): number => sagAdaptiveRaw(rA, SM, t, C.REF_HS, C.REF_NMIN, C.REF_NMAX, arg);

// ─────────────────────────── how much of the class is ADJACENT (the interaction bound) ───────────────
{
  const inB = new Set(B);
  let pairs = 0;
  for (const t of B) for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e);
    for (const u of M.edge.get(eKeyOf(M.BIG, a, b)) ?? []) if (u !== t && inB.has(u) && u > t) pairs += 1;
  }
  log(`adjacent blocked pairs: ${pairs} (${(100 * 2 * pairs / Math.max(1, B.length)).toFixed(2)} % of the class has a blocked neighbour)`);
  log('   ⇒ the per-facet prices below IGNORE interactions; this bounds that error.');
}

// ──────────────────────────────── local patch machinery ────────────────────────────────
type Tri = [number, number, number];
/** unwrapped theta of v relative to the anchor */
const uth = (anchor: number, v: number): number => M.vth[anchor] + dThRaw(M.vth[anchor], M.vth[v]);
const arTri3 = (p: Tri): number => aspect3(
  M.vx[p[0]], M.vy[p[0]], M.vz[p[0]], M.vx[p[1]], M.vy[p[1]], M.vz[p[1]], M.vx[p[2]], M.vy[p[2]], M.vz[p[2]]);
const signParam = (p: Tri): number => {
  const a = p[0];
  return Math.sign(signedAreaParam(M.vth[a], M.vz[a], uth(a, p[1]), M.vz[p[1]], uth(a, p[2]), M.vz[p[2]]));
};
const areaTri3 = (p: Tri): number => {
  const ux = M.vx[p[1]] - M.vx[p[0]]; const uy = M.vy[p[1]] - M.vy[p[0]]; const uz = M.vz[p[1]] - M.vz[p[0]];
  const wx = M.vx[p[2]] - M.vx[p[0]]; const wy = M.vy[p[2]] - M.vy[p[0]]; const wz = M.vz[p[2]] - M.vz[p[0]];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

/**
 * Is `q` (a facet of the patch) SPLITTABLE, using the patch's own incidence for edges inside the patch and
 * the untouched mesh for edges on the patch boundary? This is `refineDirected`'s last-resort loop composed
 * with `bisectAt`, evaluated against the post-operator topology.
 */
function patchLegal(q: Tri, patch: Tri[], killed: Set<number>): boolean {
  for (let e = 0; e < 3; e += 1) {
    const a = q[e]; const b = q[(e + 1) % 3];
    if (eLen(M, a, b) < C.FLOOR_MM) continue;
    // incident facets of (a,b) after the operator
    const inc: Tri[] = [];
    for (const u of M.edge.get(eKeyOf(M.BIG, a, b)) ?? []) {
      if (killed.has(u) || M.alive[u] === 0) continue;
      inc.push([M.ta[u], M.tb[u], M.tc[u]]);
    }
    for (const p of patch) {
      const hasA = p[0] === a || p[1] === a || p[2] === a;
      const hasB = p[0] === b || p[1] === b || p[2] === b;
      if (hasA && hasB) inc.push(p);
    }
    if (inc.length === 0) continue;
    for (let r = 0; r < C.NUDGE_LADDER.length; r += 1) {
      const frac = C.NUDGE_LADDER[r];
      // placeAt with MID3D — chordParam over the lifted edge
      let lo = 0; let hi = 1;
      const lift = (s: number): { x: number; y: number; z: number; th: number } => {
        const th = M.vth[a] + dThRaw(M.vth[a], M.vth[b]) * s;
        const z = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
        const theta = canonTheta(th); const r2 = rA(theta, z);
        return { x: r2 * Math.cos(theta), y: r2 * Math.sin(theta), z, th: theta };
      };
      for (let i = 0; i < C.MID3D_ITERS; i += 1) {
        const s = 0.5 * (lo + hi); const p = lift(s);
        const dA = Math.hypot(p.x - M.vx[a], p.y - M.vy[a], p.z - M.vz[a]);
        const dB = Math.hypot(p.x - M.vx[b], p.y - M.vy[b], p.z - M.vz[b]);
        if ((1 - frac) * dA <= frac * dB) lo = s; else hi = s;
      }
      let s = 0.5 * (lo + hi);
      const sh = Math.abs(s - frac);
      if (sh > C.MID3D_MAXSHIFT) s = s > frac ? frac + C.MID3D_MAXSHIFT : frac - C.MID3D_MAXSHIFT;
      const P = lift(s);
      let ok = true;
      for (const tri of inc) {
        const apex = tri[0] !== a && tri[0] !== b ? tri[0] : tri[1] !== a && tri[1] !== b ? tri[1] : tri[2];
        // oriented ends per bisectAt
        let oa = a; let ob = b;
        for (let i = 0; i < 3; i += 1) {
          if (tri[i] === a && tri[(i + 1) % 3] === b) { oa = a; ob = b; break; }
          if (tri[i] === b && tri[(i + 1) % 3] === a) { oa = b; ob = a; break; }
        }
        const ar1 = aspect3(M.vx[oa], M.vy[oa], M.vz[oa], P.x, P.y, P.z, M.vx[apex], M.vy[apex], M.vz[apex]);
        const ar2 = aspect3(P.x, P.y, P.z, M.vx[ob], M.vy[ob], M.vz[ob], M.vx[apex], M.vy[apex], M.vz[apex]);
        if (ar1 > C.SHAPE_AR || ar2 > C.SHAPE_AR) { ok = false; break; }
        const sPar = signedAreaParam(M.vth[apex], M.vz[apex], uth(apex, oa), M.vz[oa], uth(apex, ob), M.vz[ob]);
        const s1 = signedAreaParam(M.vth[apex], M.vz[apex], uth(apex, oa), M.vz[oa], M.vth[apex] + dThRaw(M.vth[apex], P.th), P.z);
        const s2 = signedAreaParam(M.vth[apex], M.vz[apex], M.vth[apex] + dThRaw(M.vth[apex], P.th), P.z, uth(apex, ob), M.vz[ob]);
        if (Math.sign(s1) !== Math.sign(sPar) || Math.sign(s2) !== Math.sign(sPar)) { ok = false; break; }
      }
      if (!ok) continue;
      if (weldHit(M, G, P.x, P.y, P.z) >= 0 && C.NOWELD) continue;
      return true;
    }
  }
  return false;
}

/** temporary triangle slot so `sagAdaptiveRaw` can score a patch facet. */
const scratchOf = (p: Tri): number => { M.ta[nT] = p[0]; M.tb[nT] = p[1]; M.tc[nT] = p[2]; return nT; };

/** perpendicular-confirmed max of dist(edge point, surface) over the 3-D segment. */
function edgePerp(a: number, b: number): number {
  const rd = edgeRadialMax(rA, C.H, M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], EDGEN);
  const s = rd.s;
  const px = M.vx[a] + (M.vx[b] - M.vx[a]) * s; const py = M.vy[a] + (M.vy[b] - M.vy[a]) * s;
  const pz = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
  return distPerpFrom(rA, C.H, px, py, pz, Math.atan2(py, px), Math.min(C.H, Math.max(0, pz))).d;
}

interface OpResult {
  name: string;
  applied: number;          // operator was ADMISSIBLE under the driver's own guards
  unblocked: number;        // >=1 demanding product facet now has a legal split
  discharged: number;       // no product facet exceeds acceptTol
  dTris: number;            // net triangle change over the class
  worstProductAr: number;   // over ADMITTED patches only
  productOverCap: number;
  areaBefore: number; areaAfter: number;     // 3-D area of the patch, admitted patches only
  refusedWhy: Record<string, number>;
  arProduct: number[];      // ADMITTED patches only
  eBeforeN: number; eBeforeMax: number; eBeforeOver10: number; eBeforeOver1: number; eBeforeSum: number;
  eAfterN: number; eAfterMax: number; eAfterOver10: number; eAfterOver1: number; eAfterSum: number;
  sagBefore: number; sagAfter: number;       // MAX driver-ruler sag over the patch, admitted only
}
const mkOp = (name: string): OpResult => ({
  name, applied: 0, unblocked: 0, discharged: 0, dTris: 0, worstProductAr: 0, productOverCap: 0,
  areaBefore: 0, areaAfter: 0, refusedWhy: {}, arProduct: [],
  eBeforeN: 0, eBeforeMax: 0, eBeforeOver10: 0, eBeforeOver1: 0, eBeforeSum: 0,
  eAfterN: 0, eAfterMax: 0, eAfterOver10: 0, eAfterOver1: 0, eAfterSum: 0,
  sagBefore: 0, sagAfter: 0,
});
const why = (o: OpResult, k: string): void => { o.refusedWhy[k] = (o.refusedWhy[k] ?? 0) + 1; };

const SCORE_EDGES = envS('PF_S120_EDGESCORE', '1') === '1';

/** score a completed patch: shape bars, unblock, discharge, area, EDGE CONFORMANCE before and after. */
function scorePatch(o: OpResult, patch: Tri[], killed: Set<number>, areaBefore: number, dTris: number): boolean {
  let worst = 0; let over = 0;
  const ars: number[] = [];
  for (const p of patch) {
    const a = arTri3(p); ars.push(a);
    if (a > worst) worst = a;
    if (a > C.SHAPE_AR) over += 1;
  }
  if (over > 0) { why(o, 'product-over-AR-cap'); return false; }
  for (const p of patch) if (signParam(p) === 0) { why(o, 'product-degenerate-in-param'); return false; }
  o.applied += 1;
  for (const a of ars) o.arProduct.push(a);
  o.areaBefore += areaBefore;
  for (const p of patch) o.areaAfter += areaTri3(p);
  o.dTris += dTris;
  if (worst > o.worstProductAr) o.worstProductAr = worst;
  // demand BEFORE (the killed facets) and AFTER (the products), on the driver's own ruler
  let sb = 0; for (const u of killed) { const s = sagOf(u); if (s > sb) sb = s; }
  if (sb > o.sagBefore) o.sagBefore = sb;
  let anyDemand = false; let anyLegal = false; let sa = 0;
  for (const p of patch) {
    const s = sagOf(scratchOf(p));
    if (s > sa) sa = s;
    if (s > C.acceptTol) { anyDemand = true; if (!anyLegal && patchLegal(p, patch, killed)) anyLegal = true; }
  }
  if (sa > o.sagAfter) o.sagAfter = sa;
  if (!anyDemand) o.discharged += 1;
  if (!anyDemand || anyLegal) o.unblocked += 1;
  // ── EDGE CONFORMANCE over the patch's edge set, BEFORE (killed facets) and AFTER (product facets) ──
  if (SCORE_EDGES) {
    const seenB = new Set<number>(); const seenA = new Set<number>();
    for (const u of killed) for (let e = 0; e < 3; e += 1) {
      const a = e === 0 ? M.ta[u] : e === 1 ? M.tb[u] : M.tc[u];
      const b = e === 0 ? M.tb[u] : e === 1 ? M.tc[u] : M.ta[u];
      const k = eKeyOf(M.BIG, a, b); if (seenB.has(k)) continue; seenB.add(k);
      const d = edgePerp(a, b); const L = eLen(M, a, b);
      o.eBeforeN += 1; o.eBeforeSum += L;
      if (d > o.eBeforeMax) o.eBeforeMax = d;
      if (d > 0.01) o.eBeforeOver10 += 1; if (d > 0.001) o.eBeforeOver1 += 1;
    }
    for (const p of patch) for (let e = 0; e < 3; e += 1) {
      const a = p[e]; const b = p[(e + 1) % 3];
      const k = eKeyOf(M.BIG, a, b); if (seenA.has(k)) continue; seenA.add(k);
      const d = edgePerp(a, b); const L = eLen(M, a, b);
      o.eAfterN += 1; o.eAfterSum += L;
      if (d > o.eAfterMax) o.eAfterMax = d;
      if (d > 0.01) o.eAfterOver10 += 1; if (d > 0.001) o.eAfterOver1 += 1;
    }
  }
  return true;
}

// deterministic RNG for the placebos
let rngS = SEED >>> 0;
const rnd = (): number => { rngS = (rngS * 1664525 + 1013904223) >>> 0; return rngS / 4294967296; };

// ══════════════════════════ (a) 1->3 INTERIOR INSERTION ══════════════════════════
// *** THE BRIEF'S PREMISE IS WRONG AND IT MATTERS. *** A 1->3 insertion places the new vertex STRICTLY
// INSIDE the facet and joins it to the three corners. The facet's three ORIGINAL edges are untouched, so
// NO hanging node is created and no neighbour has to be split. The cascade the brief prices does not
// exist for 1->3 (it exists for 1->4, which splits all three edges). The real cost is +2 triangles.
function opInterior(useCentroid: boolean, name: string): OpResult {
  const o = mkOp(name);
  for (const t of B) {
    const a = M.ta[t]; const b = M.tb[t]; const c = M.tc[t];
    // barycentric weights in the PARAMETER domain
    let wa = 1 / 3; let wb = 1 / 3; let wc = 1 / 3;
    if (!useCentroid) {   // COST-MATCHED PLACEBO: a uniformly random interior point, same +2 triangles
      const r1 = Math.sqrt(rnd()); const r2 = rnd();
      wa = 1 - r1; wb = r1 * (1 - r2); wc = r1 * r2;
    }
    const tha = M.vth[a]; const thb = uth(a, b); const thc = uth(a, c);
    const th = wa * tha + wb * thb + wc * thc;
    const z = wa * M.vz[a] + wb * M.vz[b] + wc * M.vz[c];
    const theta = canonTheta(th); const r = rA(theta, z);
    const px = r * Math.cos(theta); const py = r * Math.sin(theta);
    if (weldHit(M, G, px, py, z) >= 0) { why(o, 'weld'); continue; }
    const m = nV;
    M.vx[m] = px; M.vy[m] = py; M.vz[m] = z; M.vth[m] = theta;
    const patch: Tri[] = [[a, b, m], [b, c, m], [c, a, m]];
    const killed = new Set<number>([t]);
    const area = triArea(M, t);
    scorePatch(o, patch, killed, area, +2);
  }
  return o;
}

// ══════════════════════════ (b) 2->2 FLIP FIRST ══════════════════════════
// Flip one of t's edges, then ask whether a legal split candidate now EXISTS on the facet carrying the
// demand. Cost 0 triangles. The flip must itself be admissible: convex quad in (theta,z), both new facets
// at or under the AR cap, and the new diagonal must not already be an edge.
function opFlip(elsewhere: boolean, name: string): OpResult {
  const o = mkOp(name);
  for (const t0 of B) {
    // COST-MATCHED PLACEBO: the SAME operator at the SAME cost on a DIFFERENT target — an edge of a
    // neighbouring facet that is NOT incident to the blocked one. If the treatment does not beat this,
    // the win is in "flip something nearby", not in flipping the blocked facet's edges.
    let t = t0;
    if (elsewhere) {
      const cand: number[] = [];
      for (let e = 0; e < 3; e += 1) {
        const [a, b] = eVerts(M, t0, e);
        for (const u of M.edge.get(eKeyOf(M.BIG, a, b)) ?? []) if (u !== t0 && M.alive[u] !== 0) cand.push(u);
      }
      if (cand.length === 0) { why(o, 'no-neighbour'); continue; }
      t = cand[Math.floor(rnd() * cand.length)];
    }
    const order = [0, 1, 2];
    let done = false;
    let sawInterior = false; let sawConvex = false;
    for (const e of order) {
      const [a, b] = eVerts(M, t, e);
      if (elsewhere && (a === M.ta[t0] || a === M.tb[t0] || a === M.tc[t0]) && (b === M.ta[t0] || b === M.tb[t0] || b === M.tc[t0])) continue;
      const list = (M.edge.get(eKeyOf(M.BIG, a, b)) ?? []).filter((u) => M.alive[u] !== 0);
      if (list.length !== 2) continue;
      sawInterior = true;
      const u = list[0] === t ? list[1] : list[0];
      const p = M.ta[t] !== a && M.ta[t] !== b ? M.ta[t] : M.tb[t] !== a && M.tb[t] !== b ? M.tb[t] : M.tc[t];
      const q = M.ta[u] !== a && M.ta[u] !== b ? M.ta[u] : M.tb[u] !== a && M.tb[u] !== b ? M.tb[u] : M.tc[u];
      if (p === q) continue;
      if ((M.edge.get(eKeyOf(M.BIG, p, q)) ?? []).length > 0) continue;   // diagonal already exists
      // convexity in (theta,z): both new facets must carry the parent's sign
      const s0 = signParam([p, a, b] as Tri);
      const n1: Tri = [p, a, q]; const n2: Tri = [p, q, b];
      if (signParam(n1) !== s0 || signParam(n2) !== s0) continue;
      sawConvex = true;
      const patch: Tri[] = [n1, n2];
      const killed = new Set<number>([t, u]);
      const area = triArea(M, t) + triArea(M, u);
      if (scorePatch(o, patch, killed, area, 0)) { done = true; break; }
    }
    if (!done) {
      if (!sawInterior) why(o, 'no-interior-edge');
      else if (!sawConvex) why(o, 'quad-non-convex-or-diagonal-exists');
    }
  }
  return o;
}

// ══════════════════════════ (c) 1-RING RETRIANGULATION IN THE PARAMETER DOMAIN ══════════════════════════
// The polygon is t's 1-ring: a, n_ab, b, n_bc, c, n_ca (a hexagon when the three neighbours are distinct
// and share no extra vertex). Retriangulated by EXACT dynamic programming over all triangulations of the
// polygon, minimising the MAX 3-D aspect ratio. 4 facets in, 4 facets out — zero triangle cost. No new
// vertex, so every vertex stays exactly where `addV` put it: ON the surface.
function opRetri(shuffle: boolean, name: string): OpResult {
  const o = mkOp(name);
  for (const t of B) {
    const ring: number[] = [];
    const killed = new Set<number>([t]);
    let ok = true;
    for (let e = 0; e < 3; e += 1) {
      const [a, b] = eVerts(M, t, e);
      ring.push(a);
      const list = (M.edge.get(eKeyOf(M.BIG, a, b)) ?? []).filter((u) => M.alive[u] !== 0);
      if (list.length !== 2) { ok = false; break; }
      const u = list[0] === t ? list[1] : list[0];
      killed.add(u);
      const q = M.ta[u] !== a && M.ta[u] !== b ? M.ta[u] : M.tb[u] !== a && M.tb[u] !== b ? M.tb[u] : M.tc[u];
      ring.push(q);
    }
    if (!ok) { why(o, 'boundary-or-non-manifold-ring'); continue; }
    if (new Set(ring).size !== ring.length) { why(o, 'ring-not-simple'); continue; }
    if (killed.size !== 4) { why(o, 'ring-shares-a-neighbour'); continue; }
    const n = ring.length;
    if (shuffle) { // COST-MATCHED PLACEBO: same DP, but maximise nothing — pick the FIRST valid fan
      const anchor = Math.floor(rnd() * n);
      const patch: Tri[] = [];
      for (let i = 1; i < n - 1; i += 1) patch.push([ring[anchor], ring[(anchor + i) % n], ring[(anchor + i + 1) % n]]);
      const area = [...killed].reduce((s, u) => s + triArea(M, u), 0);
      if (!scorePatch(o, patch, killed, area, patch.length - 4)) { /* counted by scorePatch */ }
      continue;
    }
    // the polygon must be SIMPLE in (theta,z): all ears consistently oriented against the ring's own sign
    const anchor = ring[0];
    const PX = ring.map((v) => uth(anchor, v)); const PZ = ring.map((v) => M.vz[v]);
    let ringArea = 0;
    for (let i = 0; i < n; i += 1) { const j = (i + 1) % n; ringArea += PX[i] * PZ[j] - PX[j] * PZ[i]; }
    const sgn = Math.sign(ringArea);
    if (sgn === 0) { why(o, 'ring-degenerate-in-param'); continue; }
    // DP over triangulations minimising max aspect3; INFINITY for an ear with the wrong parameter sign
    const cost: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const cut: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
    const earCost = (i: number, k: number, j: number): number => {
      const s = Math.sign((PX[k] - PX[i]) * (PZ[j] - PZ[i]) - (PX[j] - PX[i]) * (PZ[k] - PZ[i]));
      if (s !== sgn) return Infinity;
      return arTri3([ring[i], ring[k], ring[j]]);
    };
    for (let len = 2; len < n; len += 1) {
      for (let i = 0; i + len < n; i += 1) {
        const j = i + len;
        let best = Infinity; let bk = -1;
        for (let k = i + 1; k < j; k += 1) {
          const v = Math.max(cost[i][k], cost[k][j], earCost(i, k, j));
          if (v < best) { best = v; bk = k; }
        }
        cost[i][j] = best; cut[i][j] = bk;
      }
    }
    if (!Number.isFinite(cost[0][n - 1])) { why(o, 'no-valid-triangulation-in-param'); continue; }
    const patch: Tri[] = [];
    const emit = (i: number, j: number): void => {
      if (j - i < 2) return;
      const k = cut[i][j];
      patch.push([ring[i], ring[k], ring[j]]);
      emit(i, k); emit(k, j);
    };
    emit(0, n - 1);
    const area = [...killed].reduce((s, u) => s + triArea(M, u), 0);
    scorePatch(o, patch, killed, area, patch.length - 4);
  }
  return o;
}

// ══════════════════════════ (d) COLLAPSE THE DEGENERATE EDGE ══════════════════════════
// Collapse t's SHORTEST edge onto ONE OF ITS ENDPOINTS (never the midpoint — an endpoint is already ON the
// surface, a midpoint is not). Link condition enforced. Removes 2 facets per interior collapse.
function opCollapse(elsewhere: boolean, name: string): OpResult {
  const o = mkOp(name);
  for (const t0 of B) {
    // COST-MATCHED PLACEBO: the same collapse, at the same -2 triangles, on a NEIGHBOURING facet instead.
    let t = t0;
    if (elsewhere) {
      const cand: number[] = [];
      for (let e = 0; e < 3; e += 1) {
        const [a, b] = eVerts(M, t0, e);
        for (const u of M.edge.get(eKeyOf(M.BIG, a, b)) ?? []) if (u !== t0 && M.alive[u] !== 0) cand.push(u);
      }
      if (cand.length === 0) { why(o, 'no-neighbour'); continue; }
      t = cand[Math.floor(rnd() * cand.length)];
    }
    const ls = [0, 1, 2].map((e) => { const [a, b] = eVerts(M, t, e); return eLen(M, a, b); });
    const order = [0, 1, 2].sort((x, y) => ls[x] - ls[y]);
    let done = false; let sawInterior = false; let sawLink = false;
    for (const e of order) {
      const [a0, b0] = eVerts(M, t, e);
      const list = (M.edge.get(eKeyOf(M.BIG, a0, b0)) ?? []).filter((u) => M.alive[u] !== 0);
      if (list.length !== 2) continue;
      sawInterior = true;
      for (const [keep, gone] of [[a0, b0], [b0, a0]] as Array<[number, number]>) {
        // stars
        const starOf = (v: number): number[] => {
          const out: number[] = [];
          for (const [, l] of M.edge) void l;   // (not used; star built from incidence below)
          return out;
        };
        void starOf;
        // build the star of `gone` from the edge map by walking its incident triangles
        const star: number[] = [];
        for (const u of list) star.push(u);
        // full star: every triangle containing `gone`
        const seen = new Set<number>(star);
        const stack = [...star];
        while (stack.length > 0) {
          const u = stack.pop() as number;
          for (const w of [M.ta[u], M.tb[u], M.tc[u]]) {
            if (w === gone) continue;
            for (const x of M.edge.get(eKeyOf(M.BIG, gone, w)) ?? []) {
              if (M.alive[x] === 0 || seen.has(x)) continue;
              if (M.ta[x] !== gone && M.tb[x] !== gone && M.tc[x] !== gone) continue;
              seen.add(x); star.push(x); stack.push(x);
            }
          }
        }
        if (star.length > 64) continue;
        // LINK CONDITION: link(keep) ∩ link(gone) must be exactly the two shared opposite vertices
        const linkOf = (v: number, tris: number[]): Set<number> => {
          const s = new Set<number>();
          for (const u of tris) for (const w of [M.ta[u], M.tb[u], M.tc[u]]) if (w !== v) s.add(w);
          return s;
        };
        const starKeep: number[] = [];
        {
          const sk = new Set<number>(); const st = [...list];
          while (st.length > 0) {
            const u = st.pop() as number;
            if (sk.has(u) || M.alive[u] === 0) continue;
            if (M.ta[u] !== keep && M.tb[u] !== keep && M.tc[u] !== keep) continue;
            sk.add(u); starKeep.push(u);
            for (const w of [M.ta[u], M.tb[u], M.tc[u]]) if (w !== keep) for (const x of M.edge.get(eKeyOf(M.BIG, keep, w)) ?? []) if (!sk.has(x) && M.alive[x] !== 0) st.push(x);
          }
        }
        if (starKeep.length > 64) continue;
        const lg = linkOf(gone, star); const lk = linkOf(keep, starKeep);
        const shared: number[] = [];
        for (const v of lg) if (lk.has(v)) shared.push(v);
        const opp = new Set<number>();
        for (const u of list) for (const w of [M.ta[u], M.tb[u], M.tc[u]]) if (w !== a0 && w !== b0) opp.add(w);
        if (shared.filter((v) => !opp.has(v)).length > 0) continue;  // link condition violated
        sawLink = true;
        // the patch: every star triangle of `gone` except the two on (a0,b0), with `gone` -> `keep`
        const patch: Tri[] = [];
        const killed = new Set<number>(star);
        for (const u of star) {
          if (u === list[0] || u === list[1]) continue;
          const p: Tri = [M.ta[u], M.tb[u], M.tc[u]].map((w) => (w === gone ? keep : w)) as Tri;
          if (p[0] === p[1] || p[1] === p[2] || p[2] === p[0]) { continue; }
          patch.push(p);
        }
        if (patch.length === 0) continue;
        const area = star.reduce((s, u) => s + triArea(M, u), 0);
        if (scorePatch(o, patch, killed, area, patch.length - star.length)) { done = true; break; }
      }
      if (done) break;
    }
    if (!done) {
      if (!sawInterior) why(o, 'no-interior-edge');
      else if (!sawLink) why(o, 'link-condition');
    }
  }
  return o;
}

// ══════════════════════════ (e) REFUSE ══════════════════════════
const opRefuse = (): OpResult => {
  const o = mkOp('(e) REFUSE and strand — the S118 baseline');
  o.applied = B.length;
  for (const t of B) o.areaTreated += triArea(M, t);
  return o;
};

// ─────────────────────────────────────── RUN + REPORT ───────────────────────────────────────
const ops: OpResult[] = [];
log('');
log('── operators (each evaluated independently against the UNMUTATED mesh) ──');
ops.push(opInterior(true, '(a) 1->3 INTERIOR at the parametric centroid'));
ops.push(opInterior(false, '(a-PLA) 1->3 INTERIOR at a RANDOM interior point [+2 tris]'));
ops.push(opFlip(false, '(b) 2->2 FLIP of one of t\'s own edges'));
ops.push(opFlip(true, '(b-PLA) 2->2 FLIP on a NEIGHBOUR, not t [0 tris]'));
ops.push(opRetri(false, '(c) 1-RING RETRIANGULATION, DP-optimal in (theta,z)'));
ops.push(opRetri(true, '(c-PLA) 1-RING re-fanned from a RANDOM anchor [0 tris]'));
ops.push(opCollapse(false, '(d) COLLAPSE t\'s SHORTEST edge'));
ops.push(opCollapse(true, '(d-PLA) COLLAPSE a NEIGHBOUR\'s shortest edge [-2 tris]'));
ops.push(opRefuse());

const N = B.length;
const blockedArea = B.reduce((s, t) => s + triArea(M, t), 0);
log('');
log(`blocked class: ${N.toLocaleString()} facets, ${blockedArea.toFixed(5)} mm² (${(100 * blockedArea / M.area3).toFixed(5)} % of the mesh)`);
log('');
log('┌ operator ─────────────────────────────────────────────────── ADMITTED ──── UNBLOCKED ── DISCHARGED ── Δtris ── worst product AR');
for (const o of ops) {
  log(`  ${o.name.padEnd(60)} ${String(o.applied).padStart(7)} (${(100 * o.applied / N).toFixed(1).padStart(5)}%) ${String(o.unblocked).padStart(7)} (${(100 * o.unblocked / N).toFixed(1).padStart(5)}%) ${String(o.discharged).padStart(6)} (${(100 * o.discharged / N).toFixed(1).padStart(5)}%) ${String(o.dTris).padStart(7)}   ${o.worstProductAr.toFixed(2).padStart(9)}`);
}
log('');
for (const o of ops) {
  if (Object.keys(o.refusedWhy).length === 0) continue;
  log(`  ${o.name} — refusals: ${Object.entries(o.refusedWhy).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
log('');
log('  product-AR distribution over ADMITTED patches ONLY (the driver\'s cap is 50):');
for (const o of ops) {
  if (o.arProduct.length === 0) continue;
  const v = o.arProduct.slice().sort((a, b) => a - b);
  log(`    ${o.name.padEnd(46)} p50 ${v[Math.floor(v.length * 0.5)].toFixed(2).padStart(7)}  p95 ${v[Math.floor(v.length * 0.95)].toFixed(2).padStart(7)}  MAX ${v[v.length - 1].toFixed(2).padStart(7)}   n=${v.length}`);
}

log('');
log('  *** EDGE CONFORMANCE over the treated patch — max over the 3-D segment of dist(point, surface),');
log('      perpendicular-confirmed at the radial argmax. ADMITTED patches only, BEFORE vs AFTER. ***');
log('    operator                                        edges          MAX µm        over 10 µm        over 1 µm      Σlen mm');
for (const o of ops) {
  if (o.eBeforeN === 0) continue;
  log(`    ${o.name.padEnd(46)} B ${String(o.eBeforeN).padStart(6)}  ${(o.eBeforeMax * 1000).toFixed(3).padStart(10)}  ${(100 * o.eBeforeOver10 / o.eBeforeN).toFixed(2).padStart(7)} %  ${(100 * o.eBeforeOver1 / o.eBeforeN).toFixed(2).padStart(7)} %  ${o.eBeforeSum.toFixed(3).padStart(9)}`);
  log(`    ${''.padEnd(46)} A ${String(o.eAfterN).padStart(6)}  ${(o.eAfterMax * 1000).toFixed(3).padStart(10)}  ${(100 * o.eAfterOver10 / o.eAfterN).toFixed(2).padStart(7)} %  ${(100 * o.eAfterOver1 / o.eAfterN).toFixed(2).padStart(7)} %  ${o.eAfterSum.toFixed(3).padStart(9)}`);
}

log('');
log('  AREA and DRIVER-RULER SAG over the treated patch (admitted patches only):');
for (const o of ops) {
  if (o.applied === 0 || o.areaBefore === 0) continue;
  log(`    ${o.name.padEnd(46)} area ${o.areaBefore.toFixed(5)} -> ${o.areaAfter.toFixed(5)} mm² (${((o.areaAfter / o.areaBefore - 1) * 100).toFixed(4)} %)   MAX sag ${(o.sagBefore * 1000).toFixed(3)} -> ${(o.sagAfter * 1000).toFixed(3)} µm`);
}

// ────────────────────── (a) APPLIED GLOBALLY — the interaction term is exactly zero ──────────────────────
log('');
log('── (a) APPLIED TO THE WHOLE CLASS AT ONCE. 1->3 insertions touch no shared edge, so they are provably');
log('   independent and this global number carries NO interaction error. ──');
{
  const opA = mkOp('global');
  const newTris: Tri[] = [];
  const killedAll = new Set<number>();
  for (const t of B) {
    const a = M.ta[t]; const b = M.tb[t]; const c = M.tc[t];
    const tha = M.vth[a]; const thb = uth(a, b); const thc = uth(a, c);
    const th = (tha + thb + thc) / 3; const z = (M.vz[a] + M.vz[b] + M.vz[c]) / 3;
    const theta = canonTheta(th); const r = rA(theta, z);
    const px = r * Math.cos(theta); const py = r * Math.sin(theta);
    if (weldHit(M, G, px, py, z) >= 0) continue;
    const m = nV; nV += 1;
    M.vx[m] = px; M.vy[m] = py; M.vz[m] = z; M.vth[m] = theta;
    const patch: Tri[] = [[a, b, m], [b, c, m], [c, a, m]];
    let over = false;
    for (const p of patch) if (arTri3(p) > C.SHAPE_AR) over = true;
    if (over) { nV -= 1; opA.productOverCap += 1; continue; }
    killedAll.add(t);
    for (const p of patch) newTris.push(p);
  }
  log(`   admitted ${killedAll.size} of ${N} (${(100 * killedAll.size / N).toFixed(1)} %); refused ${opA.productOverCap} on the AR cap`);
  log(`   Δtriangles ${(2 * killedAll.size).toLocaleString()} (+${(100 * 2 * killedAll.size / M.nT).toFixed(5)} % of the mesh)`);
  // EDGE CONFORMANCE over the patch's edges, before and after
  const scoreEdgeSet = (edges: Array<[number, number]>): { p50: number; max: number; over10: number; over1: number; n: number } => {
    const vals: number[] = []; let mx = 0; let o10 = 0; let o1 = 0;
    for (const [a, b] of edges) {
      const rd = edgeRadialMax(rA, C.H, M.vx[a], M.vy[a], M.vz[a], M.vx[b], M.vy[b], M.vz[b], EDGEN);
      const s = rd.s;
      const px = M.vx[a] + (M.vx[b] - M.vx[a]) * s; const py = M.vy[a] + (M.vy[b] - M.vy[a]) * s; const pz = M.vz[a] + (M.vz[b] - M.vz[a]) * s;
      const pd = distPerpFrom(rA, C.H, px, py, pz, Math.atan2(py, px), Math.min(C.H, Math.max(0, pz))).d;
      vals.push(pd); if (pd > mx) mx = pd; if (pd > 0.01) o10 += 1; if (pd > 0.001) o1 += 1;
    }
    vals.sort((x, y) => x - y);
    return { p50: vals[Math.floor(vals.length * 0.5)] ?? 0, max: mx, over10: o10, over1: o1, n: vals.length };
  };
  const beforeE: Array<[number, number]> = [];
  const seenB = new Set<number>();
  for (const t of killedAll) for (let e = 0; e < 3; e += 1) {
    const [a, b] = eVerts(M, t, e); const k = eKeyOf(M.BIG, a, b);
    if (seenB.has(k)) continue; seenB.add(k); beforeE.push([a, b]);
  }
  const afterE: Array<[number, number]> = [...beforeE];
  const seenA = new Set<number>(seenB);
  for (const p of newTris) for (let e = 0; e < 3; e += 1) {
    const a = p[e]; const b = p[(e + 1) % 3]; const k = eKeyOf(M.BIG, a, b);
    if (seenA.has(k)) continue; seenA.add(k); afterE.push([a, b]);
  }
  const bE = scoreEdgeSet(beforeE); const aE = scoreEdgeSet(afterE);
  log('');
  log('   EDGE CONFORMANCE over the treated patch (perp at the radial argmax):');
  log(`      BEFORE  ${bE.n} edges   p50 ${(bE.p50 * 1000).toFixed(4)} µm   MAX ${(bE.max * 1000).toFixed(4)} µm   over 10 µm ${bE.over10} (${(100 * bE.over10 / bE.n).toFixed(2)} %)   over 1 µm ${(100 * bE.over1 / bE.n).toFixed(2)} %`);
  log(`      AFTER   ${aE.n} edges   p50 ${(aE.p50 * 1000).toFixed(4)} µm   MAX ${(aE.max * 1000).toFixed(4)} µm   over 10 µm ${aE.over10} (${(100 * aE.over10 / aE.n).toFixed(2)} %)   over 1 µm ${(100 * aE.over1 / aE.n).toFixed(2)} %`);
  log(`      *** THE ORIGINAL EDGES SURVIVE A 1->3 UNTOUCHED. Their conformance CANNOT improve; only the`);
  log(`      three NEW interior edges are added. MAX before ${(bE.max * 1000).toFixed(3)} µm -> after ${(aE.max * 1000).toFixed(3)} µm. ***`);
}

log('');
log(`done in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
