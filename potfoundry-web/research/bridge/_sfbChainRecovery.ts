// _sfbChainRecovery.ts — DEV-ONLY (research/ only; src/ never imports this). ISOLATED copy of
// constraintRecovery.recoverAndLockEdges with (1) FAILURE CLASSIFICATION (cap-limited vs geometry-blocked)
// and (2) OPT-IN configurable caps (stallCap / maxFlipsPerEdge). This is the DIAGNOSTIC twin for
// E-2026-07-02-SFB-CHAIN: it answers "are the SFB@1 recoveryFailed chains cap-limited (Lever 3 fixes) or
// geometry-blocked (collinear/locked — needs Lever 1/2)?" WITHOUT touching the shared committed kernel.
//
// Logic is byte-for-byte the same crossing-chain Sloan recovery as constraintRecovery.ts; the ONLY additions
// are: a `diag` counter set classifying each failure, and the caps passed as params instead of hardcoded.
// (guardManifold/robust paths are stripped — SFB@1 A/B proved recoveryRobust is a wash and the legacy
// multiset drifts; the diagnostic runs the pure crossing-chain path with the drift-free edgeExists manifold
// guard always ON, which is the correct manifold test — pure rejection, manifold-safe by construction.)

const nextHE = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);
const prevHE = (e: number): number => (e % 3 === 0 ? e + 2 : e - 1);

function wrapU(u: number, uRef: number): number {
  let d = u - uRef;
  while (d > 0.5) d -= 1;
  while (d < -0.5) d += 1;
  return uRef + d;
}
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
function segCross(
  p0x: number, p0y: number, p1x: number, p1y: number,
  q0x: number, q0y: number, q1x: number, q1y: number,
): boolean {
  const d1 = orient(p0x, p0y, p1x, p1y, q0x, q0y);
  const d2 = orient(p0x, p0y, p1x, p1y, q1x, q1y);
  const d3 = orient(q0x, q0y, q1x, q1y, p0x, p0y);
  const d4 = orient(q0x, q0y, q1x, q1y, p1x, p1y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
const linkHE = (halfedges: Int32Array, a: number, b: number): void => { halfedges[a] = b; if (b !== -1) halfedges[b] = a; };

export interface DiagRecoveryResult {
  locked: Set<number>;
  alreadyPresent: number;
  recovered: number;
  recoveryFailed: number;
  flips: number;
  /** FAILURE CLASSIFICATION (the diagnostic payload). */
  failStall: number;        // gave up because chain length stalled (stallCap) — a longer walk COULD complete => Lever 3
  failMaxFlips: number;     // hit the outer maxFlipsPerEdge*8 iteration cap — Lever 3 (higher cap)
  failNoConvex: number;     // no convex crossing edge anywhere (reflex/degenerate) — geometry; Lever 3 won't help
  failBlocked: number;      // collectCrossings returned null (collinear/locked/boundary) — geometry; needs Lever 1/2
  /** chain-length histogram at first-collect for the FAILED constraints (how long are the chains that fail?). */
  failChainLenMax: number;
  failChainLenSum: number;
}

/**
 * Diagnostic + configurable-cap crossing-chain recovery. stallCap and maxFlipsPerEdge are PARAMS.
 * Same locking semantics as the shipped recoverAndLockEdges (drift-free edgeExists manifold guard ON).
 */
export function recoverAndLockEdgesDiag(
  triangles: Uint32Array, halfedges: Int32Array, uv: number[], constraints: number[],
  maxFlipsPerEdge = 64, stallCap = 4, perConstraintFlipBudget = 200_000,
): DiagRecoveryResult {
  const nVerts = uv.length / 2;
  const N = nVerts + 1;
  const locked = new Set<number>();
  const lockKey = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
  let alreadyPresent = 0, recovered = 0, recoveryFailed = 0, totalFlips = 0;
  let failStall = 0, failMaxFlips = 0, failNoConvex = 0, failBlocked = 0;
  let failChainLenMax = 0, failChainLenSum = 0;

  const vhe = new Int32Array(nVerts).fill(-1);
  for (let e = 0; e < triangles.length; e++) { const v = triangles[e]; if (vhe[v] < 0) vhe[v] = e; }
  const setVhe = (e: number): void => { vhe[triangles[e]] = e; };

  const forEachOutgoing = (v: number, fn: (e: number) => boolean): void => {
    const start = vhe[v]; if (start < 0) return;
    let e = start;
    for (let guard = 0; guard < 1000; guard++) {
      if (triangles[e] !== v) break;
      if (fn(e)) return;
      const pe = prevHE(e); const tw = halfedges[pe];
      if (tw < 0) break;
      e = tw; if (e === start) return;
    }
    e = start;
    for (let guard = 0; guard < 1000; guard++) {
      const tw = halfedges[e]; if (tw < 0) break;
      const ne = nextHE(tw);
      if (triangles[ne] !== v) break;
      if (ne === start) return;
      if (fn(ne)) return;
      e = ne;
    }
  };
  const edgeExists = (v: number, w: number): boolean => {
    let found = false;
    forEachOutgoing(v, (e) => { if (triangles[nextHE(e)] === w) { found = true; return true; } return false; });
    return found;
  };
  const wx = (v: number, uRef: number): number => wrapU(uv[2 * v], uRef);
  const wy = (v: number): number => uv[2 * v + 1];

  const flipConvexCrossing = (e: number, uRef: number): boolean => {
    const tw = halfedges[e];
    if (tw < 0) return false;
    if (locked.has(lockKey(triangles[e], triangles[nextHE(e)]))) return false;
    const eNext = nextHE(e), ePrev = prevHE(e), twPrev = prevHE(tw);
    const pr = triangles[e], pl = triangles[eNext], ap0 = triangles[ePrev], ap1 = triangles[twPrev];
    const a0x = wx(ap0, uRef), a0y = wy(ap0), a1x = wx(ap1, uRef), a1y = wy(ap1);
    const prx = wx(pr, uRef), pry = wy(pr), plx = wx(pl, uRef), ply = wy(pl);
    const s0 = orient(a0x, a0y, a1x, a1y, prx, pry);
    const s1 = orient(a0x, a0y, a1x, a1y, plx, ply);
    if (s0 * s1 >= 0) return false;
    const r0 = orient(prx, pry, plx, ply, a0x, a0y);
    const r1 = orient(prx, pry, plx, ply, a1x, a1y);
    if (r0 * r1 >= 0) return false;
    // drift-free manifold guard (always on for the diagnostic — correct, pure rejection):
    if (edgeExists(ap0, ap1)) return false;
    triangles[e] = ap1; triangles[tw] = ap0;
    const hbl = halfedges[twPrev], har = halfedges[ePrev];
    linkHE(halfedges, e, hbl);
    linkHE(halfedges, tw, har);
    linkHE(halfedges, ePrev, twPrev);
    const t0 = e - (e % 3), t1 = tw - (tw % 3);
    setVhe(t0); setVhe(t0 + 1); setVhe(t0 + 2);
    setVhe(t1); setVhe(t1 + 1); setVhe(t1 + 2);
    return true;
  };

  const collectCrossings = (p: number, q: number, uRef: number): number[] | null => {
    const px = wx(p, uRef), py = wy(p), qx = wx(q, uRef), qy = wy(q);
    let startFar = -1;
    forEachOutgoing(p, (e) => {
      const farE = nextHE(e);
      const b = triangles[farE], c = triangles[nextHE(farE)];
      if (b === q || c === q) return false;
      if (segCross(px, py, qx, qy, wx(b, uRef), wy(b), wx(c, uRef), wy(c))) { startFar = farE; return true; }
      return false;
    });
    if (startFar < 0) return null;
    const chain: number[] = [];
    let cur = startFar;
    for (let guard = 0; guard < maxFlipsPerEdge * 4; guard++) {
      chain.push(cur);
      const tw = halfedges[cur];
      if (tw < 0) return null;
      const apexE = prevHE(tw);
      const apex = triangles[apexE];
      if (apex === q) return chain;
      const exitA = apexE;
      const va = triangles[exitA], vb = triangles[nextHE(exitA)];
      if (segCross(px, py, qx, qy, wx(va, uRef), wy(va), wx(vb, uRef), wy(vb))) { cur = exitA; continue; }
      const exitC = prevHE(apexE);
      const vc = triangles[exitC], vd = triangles[nextHE(exitC)];
      if (segCross(px, py, qx, qy, wx(vc, uRef), wy(vc), wx(vd, uRef), wy(vd))) { cur = exitC; continue; }
      return null;
    }
    return null;
  };

  for (let ci = 0; ci + 1 < constraints.length; ci += 2) {
    const p = constraints[ci], q = constraints[ci + 1];
    if (p === q || p < 0 || q < 0 || p >= nVerts || q >= nVerts) continue;
    if (edgeExists(p, q)) { locked.add(lockKey(p, q)); alreadyPresent++; continue; }
    const uRef = uv[2 * p];

    let ok = false;
    let bestLen = Infinity, sinceImprove = 0;
    let firstChainLen = 0;
    // classification flags for THIS constraint
    let reason: 'stall' | 'maxflips' | 'noconvex' | 'blocked' | null = null;
    let outer = 0, cFlips = 0;
    for (; outer < maxFlipsPerEdge * 8 && !ok; outer++) {
      if (cFlips > perConstraintFlipBudget) { reason = 'maxflips'; break; } // safety: no single constraint hangs
      const chain = collectCrossings(p, q, uRef);
      if (chain === null || chain.length === 0) { reason = 'blocked'; break; }
      if (outer === 0) firstChainLen = chain.length;
      if (chain.length < bestLen) { bestLen = chain.length; sinceImprove = 0; } else if (++sinceImprove > stallCap) { reason = 'stall'; break; }
      let flippedAny = false;
      for (const e of chain) {
        if (flipConvexCrossing(e, uRef)) { totalFlips++; cFlips++; flippedAny = true; break; }
      }
      if (edgeExists(p, q)) { ok = true; break; }
      if (!flippedAny) { reason = 'noconvex'; break; }
    }
    if (!ok && outer >= maxFlipsPerEdge * 8) reason = 'maxflips';

    if (ok || edgeExists(p, q)) { locked.add(lockKey(p, q)); recovered++; }
    else {
      recoveryFailed++;
      if (reason === 'stall') failStall++;
      else if (reason === 'maxflips') failMaxFlips++;
      else if (reason === 'noconvex') failNoConvex++;
      else failBlocked++;
      if (firstChainLen > failChainLenMax) failChainLenMax = firstChainLen;
      failChainLenSum += firstChainLen;
    }
  }
  return {
    locked, alreadyPresent, recovered, recoveryFailed, flips: totalFlips,
    failStall, failMaxFlips, failNoConvex, failBlocked, failChainLenMax, failChainLenSum,
  };
}
