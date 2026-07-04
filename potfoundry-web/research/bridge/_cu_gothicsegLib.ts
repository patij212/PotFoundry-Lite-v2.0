// _cu_gothicsegLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-04-CU-GOTHICSEG (Track B): extract GothicArches rib/lattice crest loci as a DENSE set of LOCAL
// polyline SEGMENTS (per-row-pair, nearest-crest neighbour, broken cleanly at birth/death/merge) so the
// count-UNSTABLE crest network is never forced into a GLOBAL chain. Also a self-contained serration measure
// (crest sample point -> nearest MESH EDGE 3D distance) keyed on the extracted crest points.
//
// WHY not the ChainLinker / featureConformingMeshB global chains: prior featConform fed GLOBAL crest chains
// (long linked polylines that CROSS each other) -> the crossing-chain CDT recovery gives up once a crosser is
// locked -> 90.6% recovery ceiling, true-3D floored 0.132 (E-2026-06-30-*). The doubled-crest GLOBAL fixed
// columns degenerated at 0.042 (count-unstable half-ring facets). KEY INSIGHT (task): count-instability only
// breaks GLOBAL chains; LOCALLY every crest is still a curve, and CDT conforms to a SET of constraint SEGMENTS
// natively (segments begin/end freely at births/merges). So we extract per-row crest points and link each to
// its nearest same-crest neighbour in the ADJACENT row, breaking the link when no match is near (birth/death)
// or when two crests would map to the same neighbour (merge) — emitting the un-matched endpoint as a junction
// Steiner point the CDT can conform around without a crossing-constraint failure.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface CrestExtractOpts {
  /** number of z-rows to scan (t in (0,1)). */ nRows: number;
  /** u-samples per row for the extremum scan. */ nUScan: number;
  /** min crest prominence above the LOCAL neighbourhood (mm) to accept a peak. */ minPromMm: number;
  /** min crest height above ROW MEAN (mm) to accept a peak (kills flat-panel noise). */ minAboveMeanMm: number;
  /** max |du| (in u units) a crest may move between adjacent rows to be the "same" crest (link window). */
  maxLinkDu: number;
  /** refine each peak by golden-section around the coarse scan max. */ refine?: boolean;
  /** restrict to a t-band [tMin,tMax] (default full 0..1, trimmed to avoid open-boundary rows). */
  tBand?: [number, number];
}

export interface CrestExtractResult {
  /** deduped flat (u,t) injected points. */ points: number[];
  /** constraint edges = vertex-position PAIRS into points (local segments). */ constraints: number[];
  /** the crest sample points as flat (u,t) — the serration reference (every one is a true crest). */ crestUt: number[];
  /** counts. */ nPeaks: number; nSegments: number; nBirths: number; nMerges: number; nRows: number;
}

/** row mean radius (N-sample) at t, cached. */
function makeRowMean(rA: AnalyticRadiusFn, H: number): (t: number) => number {
  const cache = new Map<number, number>();
  return (t: number): number => {
    const key = Math.round(t * 8192);
    const c = cache.get(key); if (c !== undefined) return c;
    const z = t * H; let s = 0; const N = 256;
    for (let i = 0; i < N; i++) s += rA(TAU * (i / N), z);
    const m = s / N; cache.set(key, m); return m;
  };
}

/** Scan one row for local radial maxima (crests). Returns sorted u of accepted peaks + their radius. */
function scanRowCrests(
  rA: AnalyticRadiusFn, H: number, t: number, opts: CrestExtractOpts, rowMean: number,
): Array<{ u: number; r: number }> {
  const z = t * H;
  const N = opts.nUScan;
  const rad = new Float64Array(N);
  for (let i = 0; i < N; i++) rad[i] = rA(TAU * (i / N), z);
  const peaks: Array<{ u: number; r: number }> = [];
  const GR = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < N; i++) {
    const rp = rad[(i - 1 + N) % N], rc = rad[i], rn = rad[(i + 1) % N];
    if (!(rc > rp && rc >= rn)) continue;            // discrete local max (>= to break plateaus once)
    if (rc - rowMean < opts.minAboveMeanMm) continue; // above-row-mean gate
    // local prominence: drop to the min within a small window on both sides
    const W = Math.max(2, Math.round(N * 0.01));
    let lo = rc;
    for (let k = 1; k <= W; k++) { const a = rad[(i - k + N) % N], b = rad[(i + k) % N]; if (a < lo) lo = a; if (b < lo) lo = b; }
    if (rc - lo < opts.minPromMm) continue;
    let uPk = i / N, rPk = rc;
    if (opts.refine !== false) {
      // golden-section on the continuous rA around [i-1, i+1]/N
      let a = (i - 1) / N, b = (i + 1) / N;
      const f = (u: number): number => rA(TAU * (u - Math.floor(u)), z);
      let c = b - GR * (b - a), d = a + GR * (b - a);
      let fc = f(c), fd = f(d);
      for (let it = 0; it < 30; it++) {
        if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); }
        else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); }
        if (b - a < 1e-7) break;
      }
      uPk = (a + b) / 2; uPk -= Math.floor(uPk); rPk = f(uPk);
    }
    peaks.push({ u: uPk, r: rPk });
  }
  peaks.sort((p, q) => p.u - q.u);
  return peaks;
}

/** shortest periodic du in [-0.5, 0.5). */
function periodicDu(u1: number, u0: number): number {
  let du = u1 - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1; return du;
}

/**
 * Extract Gothic crest loci as LOCAL segments. For each adjacent row pair, each crest in row r is linked to its
 * nearest crest in row r+1 within maxLinkDu; a link is DROPPED (segment breaks) when no crest is within the
 * window (birth/death) or when two row-r crests claim the SAME row-(r+1) crest (merge → keep only the nearest,
 * the loser's endpoint is a junction Steiner point that simply isn't linked forward). Every accepted crest
 * point is injected (deduped on a u,t grid); every kept link is a constraint segment.
 */
export function extractGothicCrestSegments(
  rA: AnalyticRadiusFn, H: number, opts: CrestExtractOpts,
): CrestExtractResult {
  const rowMean = makeRowMean(rA, H);
  const tMin = opts.tBand?.[0] ?? 0.5 / opts.nRows;
  const tMax = opts.tBand?.[1] ?? 1 - 0.5 / opts.nRows;
  // dedupe injected points on a fine (u,t) grid (kernel dedupeEps ~1e-6); key = guW * BIG + gt
  const cellU = 1 / Math.max(4096, opts.nUScan * 2);
  const cellT = 1 / Math.max(4096, opts.nRows * 4);
  const nU = Math.round(1 / cellU);
  const pmap = new Map<number, number>();
  const points: number[] = [];
  const addPt = (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const gu = ((Math.round(uu / cellU) % nU) + nU) % nU;
    const gt = Math.round(tc / cellT);
    const key = gu * 8_388_608 + gt;
    const hit = pmap.get(key); if (hit !== undefined) return hit;
    const pos = points.length / 2; points.push(uu, tc); pmap.set(key, pos); return pos;
  };
  const constraints: number[] = [];
  const cseen = new Set<number>();
  const addSeg = (a: number, b: number): void => {
    if (a === b) return;
    const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * 16_777_216 + hi;
    if (cseen.has(k)) return; cseen.add(k); constraints.push(a, b);
  };
  const crestUt: number[] = [];

  // per-row crest positions (u) + injected-point-position
  let prev: Array<{ u: number; pos: number }> | null = null;
  let nPeaks = 0, nBirths = 0, nMerges = 0;
  for (let r = 0; r < opts.nRows; r++) {
    const t = tMin + (tMax - tMin) * (opts.nRows === 1 ? 0 : r / (opts.nRows - 1));
    const rm = rowMean(t);
    const peaks = scanRowCrests(rA, H, t, opts, rm);
    const cur = peaks.map((p) => { const pos = addPt(p.u, t); crestUt.push(p.u, t); return { u: p.u, pos }; });
    nPeaks += cur.length;
    if (prev && cur.length) {
      // greedy nearest-neighbour matching prev->cur within maxLinkDu, one-to-one (merge = loser unlinked)
      const claimed = new Set<number>();
      // build candidate (i in prev, j in cur, |du|) sorted ascending, then take greedily
      const cands: Array<{ i: number; j: number; d: number }> = [];
      for (let i = 0; i < prev.length; i++) {
        for (let j = 0; j < cur.length; j++) {
          const d = Math.abs(periodicDu(cur[j].u, prev[i].u));
          if (d <= opts.maxLinkDu) cands.push({ i, j, d });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      const usedPrev = new Set<number>();
      for (const c of cands) {
        if (usedPrev.has(c.i) || claimed.has(c.j)) continue;
        usedPrev.add(c.i); claimed.add(c.j);
        addSeg(prev[c.i].pos, cur[c.j].pos);
      }
      // births = cur crests unclaimed; merges/deaths = prev crests unused
      for (let j = 0; j < cur.length; j++) if (!claimed.has(j)) nBirths++;
      for (let i = 0; i < prev.length; i++) if (!usedPrev.has(i)) nMerges++;
    } else if (cur.length) {
      nBirths += cur.length;
    }
    prev = cur;
  }
  return {
    points, constraints, crestUt,
    nPeaks, nSegments: constraints.length / 2, nBirths, nMerges, nRows: opts.nRows,
  };
}

/**
 * Serration = for each extracted crest sample point (a TRUE crest on the surface, lifted to 3D), the 3D distance
 * to the NEAREST MESH EDGE. If the crest segment was recovered+locked as a mesh edge, this is ~0. Self-contained
 * (spatial-hashed edge midpoints), keyed on the probe's own crest points (not a fixed-column CrestSlot model,
 * which does not fit a count-unstable network).
 */
export function measureCrestSerration(
  crestUt: number[], xyz: ArrayLike<number>, indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number,
): { p99Mm: number; maxMm: number; meanMm: number; nSample: number } {
  const nV = xyz.length / 3;
  const NSH = 64;
  const seen: Array<Set<number>> = Array.from({ length: NSH }, () => new Set<number>());
  const edges: Array<[number, number]> = [];
  const ekey = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a);
  const addEdge = (p: number, q: number): void => { const s = seen[(p < q ? p : q) & (NSH - 1)]; const k = ekey(p, q); if (!s.has(k)) { s.add(k); edges.push([p, q]); } };
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  const CELL = 1.0;
  const grid = new Map<string, number[]>();
  const gk = (x: number, y: number, z: number): string => `${Math.floor(x / CELL)}_${Math.floor(y / CELL)}_${Math.floor(z / CELL)}`;
  for (let e = 0; e < edges.length; e++) {
    const [p, q] = edges[e];
    const mx = (xyz[3 * p] + xyz[3 * q]) / 2, my = (xyz[3 * p + 1] + xyz[3 * q + 1]) / 2, mz = (xyz[3 * p + 2] + xyz[3 * q + 2]) / 2;
    const key = gk(mx, my, mz); const arr = grid.get(key); if (arr) arr.push(e); else grid.set(key, [e]);
  }
  const segDist = (px: number, py: number, pz: number, e: number): number => {
    const [p, q] = edges[e];
    const ax = xyz[3 * p], ay = xyz[3 * p + 1], az = xyz[3 * p + 2];
    const bx = xyz[3 * q], by = xyz[3 * q + 1], bz = xyz[3 * q + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
    let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
    const cx = ax + tt * dx, cy = ay + tt * dy, cz = az + tt * dz;
    return Math.hypot(px - cx, py - cy, pz - cz);
  };
  const dists: number[] = [];
  for (let i = 0; i + 1 < crestUt.length; i += 2) {
    const u = crestUt[i], t = crestUt[i + 1];
    const th = TAU * u, z = t * H, r = rA(th, z);
    const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
    // search cell + neighbours
    let best = Infinity;
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL), cz = Math.floor(pz / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(`${cx + dx}_${cy + dy}_${cz + dz}`); if (!arr) continue;
      for (const e of arr) { const d = segDist(px, py, pz, e); if (d < best) best = d; }
    }
    if (best < Infinity) dists.push(best);
  }
  dists.sort((a, b) => a - b);
  const p99 = dists.length ? dists[Math.min(dists.length - 1, Math.floor(0.99 * dists.length))] : 0;
  const max = dists.length ? dists[dists.length - 1] : 0;
  const mean = dists.length ? dists.reduce((s, x) => s + x, 0) / dists.length : 0;
  return { p99Mm: p99, maxMm: max, meanMm: mean, nSample: dists.length };
}
