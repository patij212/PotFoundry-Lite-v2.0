// landFlipPass.ts — THE CONSTRAINED FLIP, PACKAGED AS A DRIVER PASS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS. The S60 constrained edge-flip, lifted out of the offline STL probe so it can run INSIDE a
// driver over an in-memory triangle soup. Connectivity only: ZERO vertices moved, ZERO triangles added,
// facet count and vertex positions byte-identical. It re-cuts diagonals.
//
// MEASURED (GothicArches S39CTL, 1,142,166 facets, whole-mesh, S60_FLIP_G2CON):
//   orientation over-10um  129,757 -> 37,157  (3.49x; 3.73x area-weighted),  theta>90deg 1,506 -> 828
//   topology  1,713,829 edges / 1,160 boundary / 0 non-manifold / 0 orientation-inconsistent — IDENTICAL
// REFUTED on Voronoi (1.33x): that class is 124,245 MIS-ORIENTED high-aspect facets a flip cannot repair,
// because a flip can only re-cut a diagonal, not change a facet's own shape. Gothic has 2 such facets.
// ⇒ this pass is for WELL-CONDITIONED meshes. It is DEFAULT OFF and it is not a general fix.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR CLAUSES — an accepted flip must pass ALL of them
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   C1  max(orientation) over the incident PAIR strictly decreases.
//   C2  position: BOTH new facets are no worse than max(bar, old pair max). Two rulers are selectable —
//       'plane' (sagAdaptiveRaw, the driver's own, FAST but proven blind: it reports 11 over-bar where
//       certifyTriangle proves 251 on this very mesh) and 'h1' (certifyTriangle's WITNESS at tol = bar,
//       a real point at a real distance, so `witnessed > tol` is a PROOF of failure and rejecting on it is
//       SOUND). 'h1' is one-sided by construction: not proving failure is NOT proving pass, so it is a
//       do-no-proven-harm guard and is documented as one, never as a certificate.
//   C3  f32 determinacy: jitterUm = 1.5*ulp(R)*diam/minAlt <= max(jbar, old pair max). This is the
//       uncertainty OF THE QUANTITY BEING OPTIMISED when a consumer recomputes the normal in f32 from f32
//       STL coordinates. Validated empirically (measured/predicted p99 0.870, max 0.984 => upper bound).
//   C4  topology: interior edge, opposite vertices distinct, NO duplicate-edge creation (the unconstrained
//       variant made 131 non-manifold edges on Voronoi without it), strict convexity of the quad at the
//       diagonal in the (theta,z) graph domain, and ORIENTATION-CORRECT re-labelling from the quad's real
//       boundary cycle (S56 labelled unconditionally and inverted 27.3% of its edges' windings).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ORIENTATION KEY. `2*sin(theta/2)*diam`, the CHORD between the unit normals. NOT `sin(theta)*diam`,
// which is non-monotone on [0, pi] and scores a FULLY INVERTED facet at ~0 — this quantity is the ranking
// key AND the C1 accept test, so the old form steered the greedy search away from the worst facets.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// SURFACE-ONLY GUARD. A driver soup contains facets that are NOT on the analytic surface — end caps, floor
// fans, tread walls. Their orientation against rA is meaningless and flipping them would be vandalism, so
// every facet is gated on `| hypot(x,y) - rA(theta,z) | <= gateMm` at all three vertices and non-surface
// facets are frozen. The count of frozen facets is REPORTED, never assumed to be zero.
//
// DEV-ONLY. Lives in research/; `src/` never imports it. Its driver call site is flag-gated and default
// OFF, so an unflagged run is byte-identical.
import { dThRaw } from '../bridge/_sweepPredicate';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { certifyTriangle } from '../bridge/_facetTruthLib';

export type LandPosRuler = 'plane' | 'h1' | 'off';

export interface LandFlipOpts {
  rA: (th: number, z: number) => number;
  H: number;
  /** decision bar, um, for BOTH rulers. Default 10 (the product bar). */
  barUm?: number;
  /** C3 determinacy floor, um. Default 1 = one tenth of the decision bar. */
  jbarUm?: number;
  /** max sweeps; the pass stops early at quiescence. Default 40. */
  rounds?: number;
  /** C2 ruler. 'plane' = sagAdaptiveRaw (fast, blind). 'h1' = certifyTriangle witness (sound, slow). */
  posRuler?: LandPosRuler;
  /** C2 'h1' only: skip the honest test when BOTH new facets' orientation key is below this (um).
   *  Measured selectivity is what justifies it and the MISS RATE is reported. 0 = never skip. */
  h1SelectUm?: number;
  /** C3 on/off. Default true. */
  useDet?: boolean;
  /** 'rel' = max(jbar, status quo) — the default, because the input may already exceed the bare floor. */
  detMode?: 'rel' | 'abs';
  /** surface gate, mm. A facet with any vertex further than this off the analytic surface is FROZEN. */
  gateMm?: number;
  /** certifyTriangle level ceiling for the 'h1' ruler. Default 512. */
  nMax?: number;
  zJumps?: number[];
  thJumps?: number[];
  /**
   * SWEEP COST LEVEL — pure work-elimination, NEVER a change to which flips are accepted.
   * DEFAULT IS 2. Level 0 is retained as the equivalence CONTROL, not as a fallback for correctness.
   *   0  the exhaustive sweep: full `score` recompute + full edge body, every round. THE CONTROL.
   *   1  hoist the `score` recompute out of the round loop.  `score[t]` is a pure function of the index
   *      triple (positions never move in a connectivity-only pass) and the accept path already maintains
   *      it exactly (`score[t1] = g1` alongside `ta[t1] = n1[0]`), so recomputing it per round reproduces
   *      the bits it already holds. Costs nTri x orientOf = nTri x 5 rA evals PER ROUND for nothing.
   *   2  level 1 + the DIRTY-EDGE FRONTIER. An edge's verdict reads only: its two triangles' index
   *      triples, their `score`/`posC`, `live`, membership of the opposite key in `em`/`created`, and
   *      the per-round `dirty`. If none of those moved, last round's rejection is this round's rejection,
   *      so the body can be skipped. The frontier is the union of (a) every edge of every triangle
   *      touching a vertex of a flipped quad — which also covers the `em.has(kcd)` dependency, since an
   *      edge dup-blocked by (c,d) has its triangles in the stars of c and d — and (b) the edges rejected
   *      last round for the two PER-ROUND reasons, `dirty` and a `created` dup, which do not persist.
   *
   * ORDER IS PRESERVED EXACTLY. The frontier is applied as a `continue` INSIDE the existing `em`
   * iteration, never by iterating the frontier set. The pass is greedy and order-dependent — `dirty`
   * blocks the second of two adjacent candidates, so whoever is visited first wins — and iterating a Set
   * would re-order the visits and hand the win to a different edge. Same order, same winners, same mesh.
   */
  fastLevel?: 0 | 1 | 2;
  /**
   * Compute the PLANE-position column in the before/after census. **Default false**, on measurement:
   * it is 57.0% of the whole pass (348.5 s of 611.6 s on Voronoi) and what it produces is
   * `sagAdaptiveRaw`, BANNED as a verdict by the campaign. It never feeds the algorithm — it calls
   * `posPlaneSlot` directly, not the cached `posOfSlot` the C2 clause uses — so it cannot move a flip.
   * When false, `posOver` is -1 and `posP99`/`posMax` are NaN: NOT-MEASURED, and callers MUST print
   * them as such rather than as zeros.
   */
  censusPlanePos?: boolean;
  /**
   * Skip the `posOfSlot` pair when both candidates already clear `barUm`. **Default true.** `allow` is
   * `max(barUm, ...)` so it is >= barUm by construction and the clause cannot fail in that case — the
   * two extra `sagAdaptiveRaw` evaluations were being spent to compute a ceiling already cleared.
   * Set false to restore the unconditional evaluation as an equivalence CONTROL; the verdict, every
   * rejection counter, and the output md5 are the same either way.
   */
  c2ShortCircuit?: boolean;
  log?: (s: string) => void;
}

export interface LandFlipStats {
  nTri: number; nVert: number; frozen: number; flips: number; rounds: number; secs: number;
  rej: { dirty: number; sameOpp: number; dup: number; fold: number; noImprove: number; det: number; pos: number; frozen: number };
  /** C2 'h1' bookkeeping: candidates the selector skipped, and how many honest evaluations were spent. */
  h1Skipped: number; h1Evaluated: number;
  /**
   * THE WORK COUNTERS — the non-vacuity evidence for `fastLevel`. `candBody` is the number of times the
   * expensive body was entered (the only place rA is spent); `scoreEvals` is the `score`-recompute cost.
   * A sound A/B moves BOTH of these DOWN while `flips` and the output md5 stay EQUAL. If `flips` is equal
   * and `candBody` is equal too, the frontier did nothing and the arm is vacuous — say so, do not ship it.
   */
  candBody: number; scoreEvals: number; frontierSkipped: number;
  /** S88 cost breakdown, ms: the per-round edge-map rebuild, the frontier star scan, the edge walk. */
  msEdges: number; msFrontier: number; msSweep: number;
  /** the two DIAGNOSTIC censuses (before/after) — measurement, not algorithm. */
  msCensusBefore: number; msCensusAfter: number;
  /** of the census time, the part spent in the BANNED plane ruler `sagAdaptiveRaw` (both censuses). */
  msCensusPlane: number;
  /** the C2 accept clause inside the sweep (the plane ruler again), and how many candidates reached it. */
  msC2: number; c2Calls: number;
  before: LandCensus; after: LandCensus;
}
export interface LandCensus {
  orientOver: number; orientP50: number; orientP99: number; orientMax: number;
  orientAreaOverPct: number; over90: number; over120: number; angMax: number;
  posOver: number; posP99: number; posMax: number;
  jitOver1: number; jitOver10: number; maxAngMax: number; cap150: number;
  edges: number; boundary: number; nonManifold: number; orientInconsistent: number;
}

const pq = (a: Float64Array | number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);

/**
 * Run the constrained flip over a triangle soup IN PLACE.
 * @param P flat positions, 9 doubles per facet (a.xyz, b.xyz, c.xyz) — REWRITTEN in place.
 * @returns stats; `P` holds the flipped mesh. Facet count and the SET of vertex positions are unchanged.
 */
export function landConstrainedFlip(P: Float64Array, nTri: number, o: LandFlipOpts): LandFlipStats {
  const t0 = Date.now();
  const rA = o.rA; const H = o.H;
  const BAR = o.barUm ?? 10; const JBAR = o.jbarUm ?? 1;
  const ROUNDS = o.rounds ?? 40;
  const RULER: LandPosRuler = o.posRuler ?? 'plane';
  const H1SEL = o.h1SelectUm ?? 0;
  const USE_DET = o.useDet ?? true;
  const DETMODE = o.detMode ?? 'rel';
  const GATE = o.gateMm ?? 0.05;
  const NMAX = o.nMax ?? 512;
  // DEFAULT 2 since 2026-08-05 (S86). This is a COST default, not a behaviour default: levels 0 and 2
  // are MEASURED byte-identical (md5, flip count, per-round flip sequence, and the whole census) on
  // GothicArches S39CTL and on LowPolyFacet. `PF_LAND_FAST=0` restores the exhaustive sweep and is the
  // control any future equivalence check must run against — keep it working.
  const FAST = o.fastLevel ?? 2;
  const CENSUS_PLANE = o.censusPlanePos ?? false;
  /** default ON; `false` restores the unconditional `posOfSlot` pair as the equivalence CONTROL. */
  const C2SHORT = o.c2ShortCircuit ?? true;
  const zJumps = o.zJumps ?? []; const thJumps = o.thJumps ?? [];
  const log = o.log ?? ((): void => { /* silent */ });
  const TOLMM = BAR / 1000;

  // ── WELD (exact f64-of-f32 compare; the STL round-trip is exact and the driver's soup shares vertices).
  const SCRATCH = 2;
  const VXa = new Float64Array(nTri * 3); const VYa = new Float64Array(nTri * 3); const VZa = new Float64Array(nTri * 3);
  const ta = new Int32Array(nTri + SCRATCH); const tb = new Int32Array(nTri + SCRATCH); const tc = new Int32Array(nTri + SCRATCH);
  let NV = 0;
  {
    const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
    const map = new Map<number, number[]>();
    const corner = new Int32Array(3);
    for (let t = 0; t < nTri; t += 1) {
      for (let e = 0; e < 3; e += 1) {
        const x = P[t * 9 + e * 3]; const y = P[t * 9 + e * 3 + 1]; const z = P[t * 9 + e * 3 + 2];
        f64[0] = x; f64[1] = y; f64[2] = z;
        let h = 2166136261;
        for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
        h >>>= 0;
        const b = map.get(h);
        let found = -1;
        if (b !== undefined) { for (const v of b) if (VXa[v] === x && VYa[v] === y && VZa[v] === z) { found = v; break; } }
        if (found < 0) { found = NV; VXa[NV] = x; VYa[NV] = y; VZa[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
        corner[e] = found;
      }
      ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
    }
  }
  const VT = new Float64Array(NV); const VZ = VZa.subarray(0, NV);
  for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VYa[v], VXa[v]);
  const MESH: SagMesh = { ta, tb, tc, vth: VT, vz: VZa, vx: VXa, vy: VYa };
  const ARG = makeSagArgmax();

  // ── THE SURFACE GATE. Non-surface facets (caps / floor fans / tread walls) are FROZEN, never flipped.
  const onSurf = new Uint8Array(NV);
  for (let v = 0; v < NV; v += 1) {
    const zc = VZa[v] < 0 ? 0 : VZa[v] > H ? H : VZa[v];
    onSurf[v] = Math.abs(Math.hypot(VXa[v], VYa[v]) - rA(VT[v], zc)) <= GATE ? 1 : 0;
  }
  const live = new Uint8Array(nTri);
  let frozen = 0;
  for (let t = 0; t < nTri; t += 1) {
    const ok = onSurf[ta[t]] === 1 && onSurf[tb[t]] === 1 && onSurf[tc[t]] === 1;
    live[t] = ok ? 1 : 0; if (!ok) frozen += 1;
  }
  log(`  landFlip: ${nTri} facets, ${NV} welded vertices, ${frozen} FROZEN off-surface (gate ${GATE} mm)`);

  // ── GEOMETRY + RULERS
  const sidesOf = (a: number, b: number, c: number): [number, number, number] => [
    Math.hypot(VXa[b] - VXa[c], VYa[b] - VYa[c], VZa[b] - VZa[c]),
    Math.hypot(VXa[a] - VXa[c], VYa[a] - VYa[c], VZa[a] - VZa[c]),
    Math.hypot(VXa[a] - VXa[b], VYa[a] - VYa[b], VZa[a] - VZa[b]),
  ];
  function maxAngOf(a: number, b: number, c: number): number {
    const [la, lb, lc] = sidesOf(a, b, c);
    const g = (p1: number, p2: number, p3: number): number => {
      const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
      return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
    };
    return Math.max(g(la, lb, lc), g(lb, lc, la), g(lc, la, lb));
  }
  const ulpF32 = (R: number): number => { const a = Math.abs(R); return a > 0 ? 2 ** (Math.floor(Math.log2(a)) - 23) : 2 ** -149; };
  function jitterUmOf(a: number, b: number, c: number): number {
    const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
    const ux = VXa[b] - ax; const uy = VYa[b] - ay; const uz = VZa[b] - az;
    const wx = VXa[c] - ax; const wy = VYa[c] - ay; const wz = VZa[c] - az;
    const cr = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const [la, lb, lc] = sidesOf(a, b, c);
    const diam = Math.max(la, lb, lc);
    const R = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az), Math.abs(VXa[b]), Math.abs(VYa[b]), Math.abs(VZa[b]), Math.abs(VXa[c]), Math.abs(VYa[c]), Math.abs(VZa[c]));
    if (cr <= 0) return Infinity;
    return (1.5 * ulpF32(R) * diam / (cr / Math.max(1e-300, diam))) * 1000;
  }
  /** the angle between facet normal and surface normal at the centroid, radians. 5 rA evals. */
  function normAngOf(a: number, b: number, c: number): number {
    const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
    const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
    const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thA = VT[a];
    const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    return Math.acos(dot);
  }
  /** THE ORIENTATION KEY, um: the normal CHORD 2*sin(theta/2)*diam. MONOTONE on [0,pi]. */
  function orientOf(a: number, b: number, c: number): number {
    const [la, lb, lc] = sidesOf(a, b, c);
    return 2 * Math.sin(0.5 * normAngOf(a, b, c)) * Math.max(la, lb, lc) * 1000;
  }
  function areaOf(a: number, b: number, c: number): number {
    const ux = VXa[b] - VXa[a]; const uy = VYa[b] - VYa[a]; const uz = VZa[b] - VZa[a];
    const wx = VXa[c] - VXa[a]; const wy = VYa[c] - VYa[a]; const wz = VZa[c] - VZa[a];
    return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  const posPlaneSlot = (slot: number): number => sagAdaptiveRaw(rA, MESH, slot, 0.03, 12, 64, ARG) * 1000;
  /** the HONEST H1 witness, um. `witnessed > tol` is a PROOF of failure (a real point at a real distance). */
  function posH1(a: number, b: number, c: number): number {
    const v = certifyTriangle(rA, VXa[a], VYa[a], VZa[a], VXa[b], VYa[b], VZa[b], VXa[c], VYa[c], VZa[c],
      { H, tol: TOLMM, nMax: NMAX, zJumps, thJumps });
    return v.witnessed * 1000;
  }
  const posC = new Float64Array(nTri).fill(-1);
  const posOfSlot = (t: number): number => {
    const v = posC[t]; if (v >= 0) return v;
    const w = RULER === 'h1' ? posH1(ta[t], tb[t], tc[t]) : posPlaneSlot(t);
    posC[t] = w; return w;
  };
  function posOfCand(slot: 0 | 1, a: number, b: number, c: number): number {
    if (RULER === 'h1') return posH1(a, b, c);
    const s = nTri + slot; ta[s] = a; tb[s] = b; tc[s] = c;
    return posPlaneSlot(s);
  }

  // ── TOPOLOGY (by welded INDEX)
  const EKEY = NV + 1;
  function buildEdges(): Map<number, number[]> {
    const m = new Map<number, number[]>();
    for (let t = 0; t < nTri; t += 1) {
      const v3 = [ta[t], tb[t], tc[t]];
      for (let e = 0; e < 3; e += 1) {
        const u = v3[e]; const v = v3[(e + 1) % 3];
        const k = u < v ? u * EKEY + v : v * EKEY + u;
        const l = m.get(k); if (l === undefined) m.set(k, [t]); else l.push(t);
      }
    }
    return m;
  }
  function topoOf(em: Map<number, number[]>): { edges: number; bnd: number; nm: number; orientBad: number } {
    let bnd = 0; let nm = 0; let orientBad = 0;
    for (const [k, l] of em) {
      if (l.length === 1) { bnd += 1; continue; }
      if (l.length > 2) { nm += 1; continue; }
      const u = Math.floor(k / EKEY); const v = k - u * EKEY;
      let d1 = 0; let d2 = 0;
      for (let i = 0; i < 2; i += 1) {
        const v3 = [ta[l[i]], tb[l[i]], tc[l[i]]];
        let d = 0;
        for (let e = 0; e < 3; e += 1) { if (v3[e] === u && v3[(e + 1) % 3] === v) d = 1; else if (v3[e] === v && v3[(e + 1) % 3] === u) d = -1; }
        if (i === 0) d1 = d; else d2 = d;
      }
      if (d1 !== 0 && d1 === d2) orientBad += 1;
    }
    return { edges: em.size, bnd, nm, orientBad };
  }

  // ── CENSUS (both rulers, always; POSITION uses the PLANE ruler here regardless of the C2 ruler, so the
  // reported column stays comparable across arms. The HONEST verdict is taken offline by s80HonestPos.)
  function census(em: Map<number, number[]>): LandCensus {
    const or = new Float64Array(nTri); let orOver = 0; let arOver = 0; let arAll = 0;
    let o90 = 0; let o120 = 0; let angMax = 0; let cap150 = 0; let jit1 = 0; let jit10 = 0; let maMax = 0;
    for (let t = 0; t < nTri; t += 1) {
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const ang = normAngOf(a, b, c);
      const [la, lb, lc] = sidesOf(a, b, c);
      const g = 2 * Math.sin(0.5 * ang) * Math.max(la, lb, lc) * 1000;
      or[t] = g;
      const ar = areaOf(a, b, c); arAll += ar;
      if (g > BAR) { orOver += 1; arOver += ar; }
      const deg = (ang * 180) / Math.PI;
      if (deg > angMax) angMax = deg;
      if (deg > 90) o90 += 1;
      if (deg > 120) o120 += 1;
      const m = maxAngOf(a, b, c); if (m >= 150) cap150 += 1; if (m > maMax) maMax = m;
      const j = jitterUmOf(a, b, c); if (j > 1) jit1 += 1; if (j > 10) jit10 += 1;
    }
    const pos: number[] = []; let posOver = 0; let posMax = 0;
    // ── THE PLANE-POSITION CENSUS — DEFAULT OFF, and the default is a MEASUREMENT, not a preference.
    // Measured on Voronoi (806,765 facets, 20 rounds): this loop is 348.5 s of a 611.6 s pass = 57.0%,
    // i.e. 96% of all census time and more than the entire flip algorithm. What it computes is
    // `sagAdaptiveRaw`, which the campaign's own state-of-the-campaign doc marks ***BANNED as a
    // verdict*** (21-1,527x under, 28-37% over; ranking only). The pass was spending the majority of
    // its wall clock, twice, on a number that is not admissible as a verdict.
    //
    // It does NOT feed the algorithm: this calls `posPlaneSlot` directly, never the cached `posOfSlot`
    // the C2 clause uses, so switching it off cannot move a single flip. Verified by md5.
    //
    // WHEN OFF, THE FIELDS READ AS NOT-MEASURED (-1 / NaN) AND MUST BE PRINTED THAT WAY. Reporting 0
    // over-bar for a ruler that never ran is the vacuous-bar failure this campaign has already been
    // bitten by — a disabled gate that prints a passing number is worse than no gate.
    if (CENSUS_PLANE) {
      const tPlane = Date.now();
      for (let t = 0; t < nTri; t += 1) { const p = posPlaneSlot(t); pos.push(p); if (p > BAR) posOver += 1; if (p > posMax) posMax = p; }
      msCensusPlane += Date.now() - tPlane;
    } else { posOver = -1; posMax = NaN; }
    pos.sort((x, y) => x - y);
    const os = Float64Array.from(or).sort();
    const tp = topoOf(em);
    return {
      orientOver: orOver, orientP50: pq(os, 0.5), orientP99: pq(os, 0.99), orientMax: os[nTri - 1],
      orientAreaOverPct: (100 * arOver) / Math.max(1e-30, arAll), over90: o90, over120: o120, angMax,
      // `pq` returns 0 on an empty array, which would print a passing p99 for a ruler that never ran.
      posOver, posP99: CENSUS_PLANE ? pq(pos, 0.99) : NaN, posMax,
      jitOver1: jit1, jitOver10: jit10, maxAngMax: maMax, cap150,
      edges: tp.edges, boundary: tp.bnd, nonManifold: tp.nm, orientInconsistent: tp.orientBad,
    };
  }

  // Declared BEFORE the first `census()` call — `let` is hoisted but in TDZ, so putting this with the
  // other round-loop counters below would throw on the BEFORE census.
  let msCensusPlane = 0;
  const tPre = Date.now();
  const emBefore = buildEdges();
  const before = census(emBefore);
  const msCensusBefore = Date.now() - tPre;

  // ── THE FLIP ROUNDS
  const EPS = 1e-9;
  const rej = { dirty: 0, sameOpp: 0, dup: 0, fold: 0, noImprove: 0, det: 0, pos: 0, frozen: 0 };
  let totalFlips = 0; let roundsRun = 0; let h1Skipped = 0; let h1Evaluated = 0;
  let candBody = 0; let scoreEvals = 0; let frontierSkipped = 0;
  // ── S88 COST BREAKDOWN. With the sweep body 6x cheaper (S86) the per-round FIXED costs are now a
  // large share of what is left, and nobody has measured which one. Instrument before optimising:
  // `msEdges` is the per-round `buildEdges()` rebuild, `msFrontier` the O(nTri) star scan, `msSweep`
  // the edge walk itself. Timing only — it changes no verdict and no output.
  let msEdges = 0; let msFrontier = 0; let msSweep = 0;
  // S89: the C2 clause inside the sweep is the SAME `sagAdaptiveRaw` the census was just relieved of.
  // It is NOT vacuous (4,131 rejections on Voronoi), so it cannot simply be switched off — but nobody
  // has measured what the accept ruler costs, only what the reporting ruler cost.
  let msC2 = 0; let c2Calls = 0;
  const score = new Float64Array(nTri);
  // ── LEVEL >= 1: seed `score` ONCE. The accept path maintains it from here (see `fastLevel`).
  if (FAST >= 1) for (let t = 0; t < nTri; t += 1) { score[t] = orientOf(ta[t], tb[t], tc[t]); scoreEvals += 1; }
  // ── LEVEL 2 frontier state. `touchedV` marks the quad vertices of this round's flips; `retry` carries
  // the edges rejected for a PER-ROUND reason. `frontier === null` means "examine everything".
  const touchedV = new Uint8Array(NV);
  let retry = new Set<number>();
  let frontier: Set<number> | null = null;
  for (let round = 0; round < ROUNDS; round += 1) {
    roundsRun = round + 1;
    const tEdges = Date.now();
    const em = round === 0 ? emBefore : buildEdges();
    msEdges += Date.now() - tEdges;
    if (FAST === 0) for (let t = 0; t < nTri; t += 1) { score[t] = orientOf(ta[t], tb[t], tc[t]); scoreEvals += 1; }
    const tFrontier = Date.now();
    // Build this round's frontier from LAST round's touched vertices, over the CURRENT triples so the
    // vertex stars are post-flip. O(nTri) index work, zero rA — cheap against a body that spends 10.
    if (FAST >= 2 && round > 0) {
      const f = new Set<number>(retry);
      for (let t = 0; t < nTri; t += 1) {
        const a = ta[t]; const b = tb[t]; const c3 = tc[t];
        if (touchedV[a] === 0 && touchedV[b] === 0 && touchedV[c3] === 0) continue;
        const v3 = [a, b, c3];
        for (let e = 0; e < 3; e += 1) {
          const p = v3[e]; const q = v3[(e + 1) % 3];
          f.add(p < q ? p * EKEY + q : q * EKEY + p);
        }
      }
      frontier = f;
    }
    msFrontier += Date.now() - tFrontier;
    touchedV.fill(0);
    retry = new Set<number>();
    const dirty = new Uint8Array(nTri);
    const created = new Set<number>();
    let flips = 0;
    const tSweep = Date.now();
    for (const [k, l] of em) {
      if (l.length !== 2) continue;
      // THE FRONTIER SKIP — placed here, inside the natural `em` walk, so the VISIT ORDER of everything
      // that is not skipped is bit-for-bit the order the full sweep uses.
      if (frontier !== null && !frontier.has(k)) { frontierSkipped += 1; continue; }
      const t1 = l[0]; const t2 = l[1];
      if (live[t1] === 0 || live[t2] === 0) { rej.frozen += 1; continue; }
      if (dirty[t1] === 1 || dirty[t2] === 1) { rej.dirty += 1; retry.add(k); continue; }
      candBody += 1;
      const u = Math.floor(k / EKEY); const v = k - u * EKEY;
      const A1 = [ta[t1], tb[t1], tc[t1]]; const A2 = [ta[t2], tb[t2], tc[t2]];
      const c = A1[0] !== u && A1[0] !== v ? A1[0] : A1[1] !== u && A1[1] !== v ? A1[1] : A1[2];
      const d = A2[0] !== u && A2[0] !== v ? A2[0] : A2[1] !== u && A2[1] !== v ? A2[1] : A2[2];
      if (c === d) { rej.sameOpp += 1; continue; }
      const kcd = c < d ? c * EKEY + d : d * EKEY + c;
      // Split the two dup sources: `em` is the persistent edge set (a later flip that removes (c,d) puts
      // c and d in `touchedV`, so the star rule re-offers this edge), `created` is PER-ROUND and gone at
      // the next round boundary — that one has to be carried in `retry` or the frontier would lose it.
      const dupEm = em.has(kcd);
      if (dupEm || created.has(kcd)) { rej.dup += 1; if (!dupEm) retry.add(k); continue; }
      const t0th = VT[u];
      const pux = 0; const puy = VZ[u];
      const pvx = dThRaw(t0th, VT[v]); const pvy = VZ[v];
      const pcx = dThRaw(t0th, VT[c]); const pcy = VZ[c];
      const pdx = dThRaw(t0th, VT[d]); const pdy = VZ[d];
      const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
      const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
      const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
      if (!(s1 * s2 < 0 && s3 * s4 < 0)) { rej.fold += 1; continue; }
      let f1IsUV = false;
      for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
      const cc = f1IsUV ? c : d; const dd = f1IsUV ? d : c;
      const n1: [number, number, number] = [cc, u, dd];
      const n2: [number, number, number] = [cc, dd, v];
      const oldMax = Math.max(score[t1], score[t2]);
      const g1 = orientOf(n1[0], n1[1], n1[2]); const g2 = orientOf(n2[0], n2[1], n2[2]);
      if (!(Math.max(g1, g2) < oldMax - EPS)) { rej.noImprove += 1; continue; }
      if (USE_DET) {
        const j1 = jitterUmOf(n1[0], n1[1], n1[2]); const j2 = jitterUmOf(n2[0], n2[1], n2[2]);
        const jAllow = DETMODE === 'abs' ? JBAR : Math.max(JBAR, jitterUmOf(A1[0], A1[1], A1[2]), jitterUmOf(A2[0], A2[1], A2[2]));
        if (!(j1 <= jAllow && j2 <= jAllow)) { rej.det += 1; continue; }
      }
      const tC2 = Date.now();
      if (RULER !== 'off') {
        // THE SELECTOR, and it is only sound in one direction. Skipping the honest test when the new
        // facets' ORIENTATION is small is a bet that low orientation implies low H1 position error. It is
        // MEASURED (s80HonestPos prints P(H1 fail | orientation bucket)) and the miss rate is REPORTED, not
        // assumed. h1SelectUm = 0 disables it and every candidate gets the honest test.
        const skip = RULER === 'h1' && H1SEL > 0 && g1 < H1SEL && g2 < H1SEL
          && score[t1] < H1SEL && score[t2] < H1SEL;
        if (skip) { h1Skipped += 1; posC[t1] = -1; posC[t2] = -1; } else {
          if (RULER === 'h1') h1Evaluated += 1;
          const p1 = posOfCand(0, n1[0], n1[1], n1[2]);
          const p2 = posOfCand(1, n2[0], n2[1], n2[2]);
          // ── S89 SHORT-CIRCUIT. `allow = max(BAR, ...)` is >= BAR BY CONSTRUCTION, so when both
          // candidates already sit at or under BAR the clause CANNOT fail and the two `posOfSlot`
          // evaluations cannot change the verdict. They were being spent unconditionally — up to two
          // extra `sagAdaptiveRaw` calls per candidate, on the hot path, to compute a ceiling that was
          // already cleared. Measured: C2 is 72.1% of the whole pass (220.0 s over 270,266 candidates),
          // and it VETOES only 4,131 of them — 1.53%. This pays the full price for a rare veto.
          //
          // IDENTICAL BY CASE ANALYSIS, not by testing: (a) p1,p2 <= BAR <= allow => old code evaluates
          // `allow` and accepts; new code accepts without evaluating it — same verdict. (b) otherwise the
          // new code computes `allow` and applies the identical test. `posOfSlot`'s only side effect is
          // populating `posC[t]`, and the accept path overwrites `posC[t1]/posC[t2]` with p1/p2 on the
          // very next line either way, so the cache state is the same too.
          if (!C2SHORT || !(p1 <= BAR && p2 <= BAR)) {
            const allow = Math.max(BAR, posOfSlot(t1), posOfSlot(t2));
            if (!(p1 <= allow && p2 <= allow)) { rej.pos += 1; msC2 += Date.now() - tC2; c2Calls += 1; continue; }
          }
          posC[t1] = p1; posC[t2] = p2;
        }
      } else { posC[t1] = -1; posC[t2] = -1; }
      msC2 += Date.now() - tC2; c2Calls += 1;
      ta[t1] = n1[0]; tb[t1] = n1[1]; tc[t1] = n1[2];
      ta[t2] = n2[0]; tb[t2] = n2[1]; tc[t2] = n2[2];
      score[t1] = g1; score[t2] = g2;
      dirty[t1] = 1; dirty[t2] = 1;
      // The quad's FOUR vertices, not just the two triangles: an edge dup-blocked by (c,d), or made
      // legal by the removal of (u,v), lives in the star of one of these and nowhere else.
      touchedV[u] = 1; touchedV[v] = 1; touchedV[c] = 1; touchedV[d] = 1;
      created.add(kcd);
      flips += 1;
    }
    msSweep += Date.now() - tSweep;
    totalFlips += flips;
    log(`  landFlip round ${round + 1}: ${flips} flips (cum ${totalFlips})  rej fold ${rej.fold} dup ${rej.dup} noImp ${rej.noImprove} DET ${rej.det} POS ${rej.pos}${FAST >= 2 ? `  [frontier ${frontier === null ? 'ALL' : frontier.size} of ${em.size}, body ${candBody}]` : ''}`);
    if (flips === 0) break;
  }

  const tPost = Date.now();
  const after = census(buildEdges());
  const msCensusAfter = Date.now() - tPost;
  // ── WRITE BACK. Positions are unchanged; only the index triples moved.
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) { P[t * 9 + e * 3] = VXa[v3[e]]; P[t * 9 + e * 3 + 1] = VYa[v3[e]]; P[t * 9 + e * 3 + 2] = VZa[v3[e]]; }
  }
  return {
    nTri, nVert: NV, frozen, flips: totalFlips, rounds: roundsRun, secs: (Date.now() - t0) / 1000,
    rej, h1Skipped, h1Evaluated, candBody, scoreEvals, frontierSkipped, msEdges, msFrontier, msSweep,
    msCensusBefore, msCensusAfter, msCensusPlane, msC2, c2Calls, before, after,
  };
}
