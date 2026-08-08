// s120EdgeLib.ts — THE EDGE-CONFORMANCE QUANTITY. The algorithms only, so they can be validated on
// CLOSED FORMS rather than against a previous run.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS BEING MEASURED, AND WHY IT IS NOT WHAT THE CAMPAIGN HAS BEEN MEASURING
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Every position number this campaign has published is PER FACET: a barycentric lattice of order k is
// laid over the facet and the max distance-to-surface over those (k+1)(k+2)/2 points is the facet's
// score. NOBODY HAS EVER SCORED AN EDGE. The user's standard is that every EDGE lies on the surface, and
// for a straight 3-D segment between two on-surface points that is exactly achievable only where the
// surface is RULED along that direction. The achievable standard, and the one measured here, is
//
//        E(a,b)  =  max over s in [0,1] of  dist( a + s*(b-a) ,  S )                            (*)
//
// with dist the TRUE PERPENDICULAR distance to the analytic surface S = { (rA(th,z) cos th,
// rA(th,z) sin th, z) }, not the radial one.
//
// ── THE TWO QUANTITIES THAT ARE EASY TO CONFUSE WITH (*) ──────────────────────────────────────────────
//   * `edgeSagRaw` (_sweepPredicate.ts:93) — the DRIVER's own rank key — is
//         max over t of dist( surfaceCurve(t) , the infinite LINE through a,b )
//     i.e. it measures FROM the surface curve TO the line. (*) measures FROM the segment TO the whole
//     SURFACE. They are different quantities and neither bounds the other in general.
//   * a per-facet lattice of order k DOES contain k+1 points on each edge (the barycentric points with a
//     zero weight), so a facet score at k=8 has, buried inside it, a 7-interior-point sample of (*).
//     THAT SAMPLE IS THE CAMPAIGN'S ONLY EXISTING EDGE MEASUREMENT AND IT IS COARSE. Rung nS=8 of the
//     ladder below reproduces it exactly, which is what makes the ladder a rescoring of published work
//     rather than a new unrelated number.
//
// ── THE SOUND UPPER BOUND, WHICH IS ALSO THE PREFILTER ────────────────────────────────────────────────
// For P = (x,y,z), the point Q = (rA(th,z) cos th, rA(th,z) sin th, z) with th = atan2(y,x) IS A POINT OF
// S, and |P-Q| = | hypot(x,y) - rA(th,z) | exactly. So
//                       dist(P, S)  <=  radialResid(P)     POINTWISE.
// Hence max_s dist <= max_s radialResid, and any edge whose RADIAL max is under a bar is CERTIFIED under
// that bar without a single projector call. That is a proof, not a sample.
//
// ── SAMPLING s: THE PART THAT HAS ALREADY COST THIS CAMPAIGN TWICE ────────────────────────────────────
// An under-sampled max is an under-read, and this project has paid 13x for one. So:
//   1. the uniform profile is taken at nS (a power of two) so that EVERY coarser rung is a STRIDE of it —
//      the whole ladder 2,4,8,...,nS comes out of one pass at zero extra cost and is always printed;
//   2. every interior LOCAL MAXIMUM of the uniform profile is then golden-sectioned inside its own
//      bracket [s_{i-1}, s_{i+1}] to machine precision. Refinement can only RAISE the value, so a
//      refinement that is skipped is an under-read, never an over-read;
//   3. the number of local maxima per edge is COUNTED and the refinement cap is a DISCLOSED bound with a
//      printed binding rate, not a silent truncation.
// What remains unresolvable is a spike NARROWER than 1/nS that no uniform sample lands on. That is what
// the ladder is for: if rung nS and rung nS/2 agree, the profile is resolved at that scale; if they do
// not, the number is not converged and must not be quoted.
export type RadiusFn = (th: number, z: number) => number;

/**
 * Distance from P to the surface point at the SAME (theta, z). Exact, and a sound UPPER bound on the
 * true perpendicular distance (see header).
 */
export function radialResid(rA: RadiusFn, x: number, y: number, z: number): number {
  return Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
}

/** Reusable scratch for `edgeRadialSag`; sized once, never reallocated per edge. */
export interface EdgeWorkspace {
  /** nS+1 uniform radial residuals, prof[i] = radialResid at s = i/nS */
  prof: Float64Array;
  /** ladder[j] = max of prof over the sub-grid with 2^j intervals, j = 1..log2(nS) */
  ladder: Float64Array;
  /** refined local-maximum parameters, DESCENDING by value */
  candS: Float64Array;
  /** their refined radial values */
  candV: Float64Array;
  nS: number;
  levels: number;
  maxCand: number;
  /** outputs of the last edgeRadialSag call */
  nCand: number;
  nLocalMax: number;
  capBound: boolean;
  max: number;
  sStar: number;
  rAcalls: number;
}

export function makeEdgeWorkspace(nS: number, maxCand: number): EdgeWorkspace {
  if (nS < 2 || (nS & (nS - 1)) !== 0) throw new Error(`nS must be a power of two >= 2, got ${nS}`);
  const levels = Math.round(Math.log2(nS));
  return {
    prof: new Float64Array(nS + 1),
    ladder: new Float64Array(levels + 1),
    candS: new Float64Array(maxCand),
    candV: new Float64Array(maxCand),
    nS, levels, maxCand,
    nCand: 0, nLocalMax: 0, capBound: false, max: 0, sStar: 0, rAcalls: 0,
  };
}

/**
 * Golden-section MAXIMISE f on [lo,hi]. Deterministic: exactly `iters+2` evaluations, no tolerance exit,
 * so two runs with the same inputs make the same calls in the same order.
 */
export function goldenMax(
  f: (s: number) => number, lo: number, hi: number, iters: number,
): { s: number; v: number } {
  const G = 0.6180339887498949;
  let a = lo; let b = hi;
  let c = b - G * (b - a); let d = a + G * (b - a);
  let fc = f(c); let fd = f(d);
  for (let i = 0; i < iters; i += 1) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - G * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + G * (b - a); fd = f(d); }
  }
  return fc > fd ? { s: c, v: fc } : { s: d, v: fd };
}

/**
 * THE EDGE RADIAL SAG, with the full ladder and refined local maxima. Writes into `w`; returns nothing.
 *
 * `w.max` is the refined max, `w.ladder[j]` the uniform-rung maxima (rung j has 2^j intervals — rung 3 is
 * the k=8 facet-lattice edge sample), `w.candS/candV[0..nCand)` the refined local maxima DESCENDING by
 * value, ready to be handed to the perpendicular adjudication.
 */
export function edgeRadialSag(
  rA: RadiusFn,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  refineIters: number,
  w: EdgeWorkspace,
): void {
  const nS = w.nS; const prof = w.prof;
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  let calls = 0;
  const at = (s: number): number => {
    calls += 1;
    return radialResid(rA, ax + s * dx, ay + s * dy, az + s * dz);
  };
  for (let i = 0; i <= nS; i += 1) prof[i] = at(i / nS);
  // ladder: rung j uses stride nS/2^j. Rung 0 is the two endpoints (the PRECOND corners).
  for (let j = 0; j <= w.levels; j += 1) {
    const stride = nS >> j;
    let m = 0;
    for (let i = 0; i <= nS; i += stride) if (prof[i] > m) m = prof[i];
    w.ladder[j] = m;
  }
  // interior local maxima of the uniform profile (plateaux: take the first index of the plateau)
  let nLoc = 0; let nCand = 0;
  const candS = w.candS; const candV = w.candV;
  const insert = (s: number, v: number): void => {
    // insertion into a DESCENDING top-maxCand list
    if (nCand === w.maxCand && v <= candV[nCand - 1]) return;
    let p = nCand < w.maxCand ? nCand : w.maxCand - 1;
    while (p > 0 && candV[p - 1] < v) { candV[p] = candV[p - 1]; candS[p] = candS[p - 1]; p -= 1; }
    candV[p] = v; candS[p] = s;
    if (nCand < w.maxCand) nCand += 1;
  };
  for (let i = 1; i < nS; i += 1) {
    if (prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1]) {
      nLoc += 1;
      insert(i / nS, prof[i]);
    }
  }
  // The two endpoints are on the surface BY CONSTRUCTION (addV lifts them onto rA), but a mesh that
  // violated that would show it here, so they are candidates too and never silently dropped.
  if (prof[0] >= prof[1]) { nLoc += 1; insert(0, prof[0]); }
  if (prof[nS] >= prof[nS - 1]) { nLoc += 1; insert(1, prof[nS]); }
  w.nLocalMax = nLoc;
  w.capBound = nLoc > w.maxCand;
  // refine each kept candidate inside its own bracket; refinement can only RAISE the value
  const h = 1 / nS;
  for (let c = 0; c < nCand; c += 1) {
    const s0 = candS[c];
    if (s0 <= 0 || s0 >= 1) continue;                 // endpoint candidates have no interior bracket
    const g = goldenMax(at, Math.max(0, s0 - h), Math.min(1, s0 + h), refineIters);
    if (g.v > candV[c]) { candV[c] = g.v; candS[c] = g.s; }
  }
  // re-sort descending (refinement can reorder); nCand <= maxCand is tiny, insertion sort is right
  for (let i = 1; i < nCand; i += 1) {
    const kv = candV[i]; const ks = candS[i];
    let j = i - 1;
    while (j >= 0 && candV[j] < kv) { candV[j + 1] = candV[j]; candS[j + 1] = candS[j]; j -= 1; }
    candV[j + 1] = kv; candS[j + 1] = ks;
  }
  w.nCand = nCand;
  w.max = nCand > 0 ? candV[0] : 0;
  w.sStar = nCand > 0 ? candS[0] : 0;
  w.rAcalls = calls;
}

export interface EdgePerpTally {
  /** edges witnessed over the HI bar perpendicularly */
  overHiCount: number;
  overHiLen: number;
  overLoCount: number;
  overLoLen: number;
  /** max perpendicular distance witnessed over the walked set */
  max: number;
  /** the edge id attaining it */
  argEdge: number;
  argS: number;
  calls: number;
  edgesTouched: number;
  /** pointwise perpendicular > radial violations. MUST be 0; anything else voids the run. */
  c2Violations: number;
  /** edges whose RADIAL max cleared the LO bar but no sampled point cleared it perpendicularly */
  loUndecided: number;
}

export interface EdgePerpOpts {
  /** edge ids in DESCENDING radial-max order */
  order: ArrayLike<number>;
  /** radial max per edge (the sound upper bound / prefilter) */
  rad: ArrayLike<number>;
  /** edge length per edge */
  len: ArrayLike<number>;
  /** endpoints of edge e: (ax,ay,az,bx,by,bz) */
  ends: (e: number, out: Float64Array) => void;
  rA: RadiusFn;
  project: (x: number, y: number, z: number) => number;
  /** rebuild the candidate + uniform sample set for edge e into (sBuf, vBuf), DESCENDING by radial.
   *  Returns the count. */
  samples: (e: number, sBuf: Float64Array, vBuf: Float64Array) => number;
  barHi: number;
  barLo: number;
  /** 'full' disables both reductions: max over EVERY sample of EVERY walked edge. Reference arm. */
  mode: 'fast' | 'full';
  sBuf: Float64Array;
  vBuf: Float64Array;
}

/**
 * Adjudicate the perpendicular bars over `order`, by the same two SOUND reductions s118's facet pass uses,
 * restated for edges:
 *   * a sample point whose RADIAL residual is <= the threshold that currently matters cannot produce a
 *     perpendicular value above it — skipped as PROVEN irrelevant, not sampled away;
 *   * an edge whose radial max is <= the running mesh max cannot improve the max — the walk stops.
 * `full` disables both and must return identical overHi/overLo/max. Only `calls` may differ.
 */
export function edgePerpScan(o: EdgePerpOpts): EdgePerpTally {
  const { order, rad, len, rA, project, samples, barHi, barLo, mode, sBuf, vBuf } = o;
  const ends = new Float64Array(6);
  let calls = 0; let touched = 0; let c2 = 0; let best = 0; let argE = -1; let argS = 0;
  let cHi = 0; let lHi = 0; let cLo = 0; let lLo = 0; let undec = 0;
  for (let i = 0; i < order.length; i += 1) {
    const e = order[i];
    const re = rad[e];
    if (mode === 'fast' && re <= best && re <= barLo) continue;
    o.ends(e, ends);
    const n = samples(e, sBuf, vBuf);
    const ax = ends[0], ay = ends[1], az = ends[2];
    const dx = ends[3] - ax, dy = ends[4] - ay, dz = ends[5] - az;
    let overHi = false; let overLo = false; let did = false;
    for (let p = 0; p < n; p += 1) {
      const rr = vBuf[p];
      if (mode === 'fast') {
        let tSkip = best;
        if (!overLo && barLo < tSkip) tSkip = barLo;
        if (!overHi && re > barHi && barHi < tSkip) tSkip = barHi;
        if (rr <= tSkip) break;                       // samples are DESCENDING by radial
      }
      const s = sBuf[p];
      const x = ax + s * dx, y = ay + s * dy, z = az + s * dz;
      const d = project(x, y, z); calls += 1; did = true;
      const rCheck = radialResid(rA, x, y, z);
      if (d > rCheck + 1e-9) c2 += 1;
      if (d > best) { best = d; argE = e; argS = s; }
      if (d > barHi) overHi = true;
      if (d > barLo) overLo = true;
    }
    if (did) touched += 1;
    if (overHi) { cHi += 1; lHi += len[e]; }
    if (overLo) { cLo += 1; lLo += len[e]; } else if (re > barLo) undec += 1;
  }
  return {
    overHiCount: cHi, overHiLen: lHi, overLoCount: cLo, overLoLen: lLo,
    max: best, argEdge: argE, argS, calls, edgesTouched: touched, c2Violations: c2, loUndecided: undec,
  };
}

/**
 * Weld coincident vertices by EXACT coordinate equality. Byte-for-byte the same policy as
 * dihedralRulerBig's private `weldBig` (a tolerance would merge this project's real 0.1 um needle pairs
 * and manufacture adjacency); duplicated here only because that one is not exported. The UNIQUE-EDGE
 * COUNT this produces is cross-checked against facetDihedralsBig's interior+boundary+nonManifold in the
 * tool, so a divergence between the two welds cannot pass silently.
 */
export function weldExact(xyz: ArrayLike<number>): { id: Int32Array; count: number } {
  const nV = Math.floor(xyz.length / 3);
  const id = new Int32Array(nV);
  let cap = 16;
  while (cap < nV * 2) cap *= 2;
  const mask = cap - 1;
  const slot = new Int32Array(cap).fill(-1);
  const canonX = new Float64Array(nV); const canonY = new Float64Array(nV); const canonZ = new Float64Array(nV);
  const f32 = new Float32Array(3);
  const u32 = new Uint32Array(f32.buffer);
  let next = 0;
  for (let v = 0; v < nV; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (Math.imul(u32[0], 0x9e3779b1) ^ Math.imul(u32[1], 0x85ebca6b) ^ Math.imul(u32[2], 0xc2b2ae35)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    let i = h & mask;
    for (;;) {
      const c = slot[i];
      if (c < 0) { slot[i] = next; canonX[next] = x; canonY[next] = y; canonZ[next] = z; id[v] = next; next += 1; break; }
      if (canonX[c] === x && canonY[c] === y && canonZ[c] === z) { id[v] = c; break; }
      i = (i + 1) & mask;
    }
  }
  return { id, count: next };
}

export interface UniqueEdges {
  /** welded endpoint ids, lo < hi */
  eLo: Int32Array;
  eHi: Int32Array;
  /** first incident facet, and the number of incident facets (1 = boundary, 2 = interior, >2 = non-manifold) */
  eF1: Int32Array;
  eF2: Int32Array;
  eDeg: Uint8Array;
  count: number;
  boundary: number;
  interior: number;
  nonManifold: number;
}

/**
 * Unique undirected edges of an identity-indexed facet soup, with their incident facets. Counting-sort
 * CSR over the welded LOW endpoint — the same linear construction dihedralRulerBig uses, so the edge SET
 * is the same set it reports counts for.
 */
export function uniqueEdges(id: Int32Array, nVw: number, nF: number): UniqueEdges {
  const nHE = nF * 3;
  const off = new Int32Array(nVw + 1);
  const loOf = (f: number, e: number): number => {
    const a = id[f * 3 + e]; const b = id[f * 3 + ((e + 1) % 3)];
    return a < b ? a : b;
  };
  const hiOf = (f: number, e: number): number => {
    const a = id[f * 3 + e]; const b = id[f * 3 + ((e + 1) % 3)];
    return a < b ? b : a;
  };
  for (let f = 0; f < nF; f += 1) for (let e = 0; e < 3; e += 1) off[loOf(f, e) + 1] += 1;
  for (let v = 0; v < nVw; v += 1) off[v + 1] += off[v];
  const cursor = off.slice(0, nVw);
  const bHi = new Int32Array(nHE);
  const bF = new Int32Array(nHE);
  for (let f = 0; f < nF; f += 1) {
    for (let e = 0; e < 3; e += 1) {
      const p = cursor[loOf(f, e)]; cursor[loOf(f, e)] = p + 1;
      bHi[p] = hiOf(f, e); bF[p] = f;
    }
  }
  for (let v = 0; v < nVw; v += 1) {
    const s = off[v]; const en = off[v + 1];
    for (let i = s + 1; i < en; i += 1) {
      const kh = bHi[i]; const kf = bF[i];
      let j = i - 1;
      while (j >= s && bHi[j] > kh) { bHi[j + 1] = bHi[j]; bF[j + 1] = bF[j]; j -= 1; }
      bHi[j + 1] = kh; bF[j + 1] = kf;
    }
  }
  let nE = 0;
  for (let v = 0; v < nVw; v += 1) {
    const en = off[v + 1]; let i = off[v];
    while (i < en) { let j = i + 1; while (j < en && bHi[j] === bHi[i]) j += 1; nE += 1; i = j; }
  }
  const eLo = new Int32Array(nE); const eHi = new Int32Array(nE);
  const eF1 = new Int32Array(nE); const eF2 = new Int32Array(nE); const eDeg = new Uint8Array(nE);
  let k = 0; let bnd = 0; let inte = 0; let nm = 0;
  for (let v = 0; v < nVw; v += 1) {
    const en = off[v + 1]; let i = off[v];
    while (i < en) {
      let j = i + 1; while (j < en && bHi[j] === bHi[i]) j += 1;
      const n = j - i;
      eLo[k] = v; eHi[k] = bHi[i]; eF1[k] = bF[i]; eF2[k] = n > 1 ? bF[i + 1] : -1;
      eDeg[k] = n > 255 ? 255 : n;
      if (n === 1) bnd += 1; else if (n === 2) inte += 1; else nm += 1;
      k += 1; i = j;
    }
  }
  return { eLo, eHi, eF1, eF2, eDeg, count: nE, boundary: bnd, interior: inte, nonManifold: nm };
}
