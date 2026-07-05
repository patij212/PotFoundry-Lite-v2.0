// _pf_structStripLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// GATE-2 SLIVERS on GeometricStar. The perfect mesher is FIDELITY-PROVEN whole-mesh 0-outlier (E-…-GEOSTAR-WHOLEMESH:
// wholeMeshOutliers=0, max 0.01mm, watertight non-vacuous) but SLIVERY (pctBelow20=21.7%, minAngle=0). Nine sliver
// levers are refuted (Lawson flips, M-square spacing, smooth graded seed, Laplacian-under-M relax, aniso-ruler escape,
// crest-strip-that-re-CDTs ×2 styles, collapse). The MEASURED root cause (E-…-ANISO-RULER): free cross-curvature
// needles LONG ACROSS the near-vertical flank (worst-60 median 76° to crest) — a GENUINE defect. The V6 crest-strip
// FAILED for ONE reason (banked): it inserted structured POINTS then re-CDT'd them with FREE cdt2d, whose Delaunay
// reconnects the dense strip points into cross-flank chords → the structured-quad intent is DEFEATED.
//
// THIS LIB'S ONE DIFFERENT MOVE (the spec's mandate): build a STRUCTURED-QUAD FLANK STRIP per crest segment and
// EMIT THE STRIP'S CONNECTIVITY DIRECTLY (each quad → 2 tris with a consistent diagonal). The strip points are NEVER
// handed to cdt2d. cdt2d fills ONLY the smooth panel far from the crests, seeing ONLY the strip's OUTER-BOUNDARY ring
// (locked as constraint edges) + background points — never a strip-interior node. So the free triangulation cannot
// re-chord the strip.
//
// STRIP GEOMETRY (square by construction):
//   ROWS along the crest — subdivide each crest chain to a 3D along-crest pitch h (rows i=0..nRow).
//   COLUMNS across the flank — from each row node march ±perpendicular into BOTH flanks by 3D ARC-LENGTH h
//     (dU = h/su, dT = h/st via metricScales), nCol steps. Column j=0 is the crest itself (shared, no-bridge).
//   Each cell (row i..i+1) × (col j..j+1) is ~square in 3D (su·du ≈ st·dt ≈ h) → 2 near-right tris, NOT needles.
//   Every node is lifted to the TRUE radial surface ⇒ on-surface (0-outlier) by construction, provided nCol·h
//     reaches past the near-vertical band (the honest brute STOP decides the depth).
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + _pf_perfectMesherMsquareLib(metricScales) + labkit + cdt2d
// READ-ONLY. NO src/ or existing-kernel edit.
import cdt2d from 'cdt2d';
import { type AnalyticRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface } from './labkit';
import { type PatchDef, lift, denseBary } from './_pf_perfectMesherLib';
import { metricScales } from './_pf_perfectMesherMsquareLib';

const TAU = 2 * Math.PI;
const BARY45 = denseBary(8); // 45 pts — the honest interior sampler (>=36 pre-registered)

// ── honest 45-pt full-azimuth-brute interior ruler for a facet (COPY of the whole-mesh guard ruler) ──────────────
function facetDev45(
  rA: AnalyticRadiusFn, H: number, xyz: Float64Array, uv: number[], a: number, b: number, c: number,
  opts: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
): number {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
  const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => {
    const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
    return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
  };
  let dev = 0;
  for (const [wa, wb, wc] of BARY45) {
    const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
    const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
    const bound = utBound(px, py, pz, um, tm);
    let d: number;
    if (bound <= opts.preFilter) d = bound;
    else {
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      d = gn <= opts.gnScreen ? gn : bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: opts.nTheta, nZ: opts.nZ, zBandMm: opts.zBandMm, refineIters: opts.refineIters }).dist;
    }
    if (d > dev) dev = d;
  }
  return dev;
}

// ── crest chains: follow the locked constraint edges into maximal polylines ──────────────────────────────────────
// Returns ordered vertex chains (each a run of crest vertices connected by locked edges), degree-2 interior verts
// walked into a single chain; a junction (degree != 2) ends a chain (so strips meet AT the junction fan vertex).
function crestChains(cEdges: Array<[number, number]>): number[][] {
  const adj = new Map<number, number[]>();
  const edgeSeen = new Set<string>();
  const ekey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (const [a, b] of cEdges) {
    if (a === b) continue; const k = ekey(a, b); if (edgeSeen.has(k)) continue; edgeSeen.add(k);
    if (!adj.has(a)) adj.set(a, []); (adj.get(a) as number[]).push(b);
    if (!adj.has(b)) adj.set(b, []); (adj.get(b) as number[]).push(a);
  }
  const usedEdge = new Set<string>();
  const chains: number[][] = [];
  // start walks from junction / endpoint verts (deg != 2), then remaining deg-2 loops.
  const starts: number[] = [];
  for (const [v, ns] of adj) if (ns.length !== 2) starts.push(v);
  const walk = (from: number, to: number): number[] => {
    const chain = [from]; let prev = from, cur = to;
    for (;;) {
      const k = ekey(prev, cur); if (usedEdge.has(k)) break; usedEdge.add(k); chain.push(cur);
      const ns = adj.get(cur) ?? [];
      if (ns.length !== 2) break; // stop at a junction/endpoint (strips meet at the junction)
      const nxt = ns[0] === prev ? ns[1] : ns[0];
      if (usedEdge.has(ekey(cur, nxt))) break; prev = cur; cur = nxt;
    }
    return chain;
  };
  for (const s of starts) for (const n of (adj.get(s) ?? [])) if (!usedEdge.has(ekey(s, n))) chains.push(walk(s, n));
  // remaining pure loops (all deg-2): pick any unused edge
  for (const [a, b] of cEdges) { const k = ekey(a, b); if (a !== b && !usedEdge.has(k)) chains.push(walk(a, b)); }
  return chains.filter((c) => c.length >= 2);
}

export interface StructStripResult {
  uv: number[]; tris: number[];
  nStripTris: number; nBgTris: number; nStripVerts: number; nChains: number;
  meanColDepth: number;
}

// ── THE STRUCTURED-QUAD FLANK STRIP builder (direct emission; cdt2d only for the complement) ────────────────────
// Input: the CONFIRMED whole-mesh 0-outlier mesh {uv,tris} + its locked crest edges cEdges.
// Output: strips emitted directly (2 tris/quad, consistent diagonal) + smooth-panel CDT of the complement, sharing
// the strip OUTER-BOUNDARY ring (locked) so the whole mesh is watertight. STRIP interior points never enter cdt2d.
//
// h = target square 3D pitch (mm). widthMm = across-crest reach of the strip (nCol = ceil(widthMm/h) columns/flank).
export function buildStructStrips(
  patch: PatchDef, seedUv: number[], cEdges: Array<[number, number]>,
  opts: { hMm: number; widthMm: number; valleyClamp?: boolean },
): StructStripResult {
  const { rA, H, arcPerU, uLo, uHi, tLo, tHi } = patch;
  const h = opts.hMm, widthMm = opts.widthMm;
  const nCol = Math.max(2, Math.round(widthMm / h));
  const valleyClamp = opts.valleyClamp ?? false;
  // valley-clamp support: nearest-OTHER-crest 3D half-distance per crest vertex (the Voronoi midline the strip
  // must stop at so neighbouring strips do not overlap). Built once from the crest vertex set.
  const crestVids = new Set<number>(); for (const [a, b] of cEdges) { crestVids.add(a); crestVids.add(b); }
  const crestList = Array.from(crestVids);
  const crest3 = crestList.map((v) => lift(rA, ((seedUv[2 * v] % 1) + 1) % 1, seedUv[2 * v + 1], H));

  // vertex pool starts as the seed's (u,t) (we REUSE its crest verts so chains stay locked); dedupe by mm cell.
  const uv = seedUv.slice();
  const cellMm = Math.max(1e-4, h * 0.25);
  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number => Math.round(((u % 1) + 1) % 1 * arcPerU / cellMm) * 1_000_003 + Math.round(t * H / cellMm);
  for (let i = 0; i < uv.length / 2; i++) { const k = keyOf(uv[2 * i], uv[2 * i + 1]); if (!pmap.has(k)) pmap.set(k, i); }
  const addPt = (u: number, t: number): number => { const k = keyOf(u, t); const hit = pmap.get(k); if (hit !== undefined) return hit; const id = uv.length / 2; uv.push(u, t); pmap.set(k, id); return id; };

  const stripTris: number[] = [];
  // grid[i][j] for j in [-nCol..+nCol] (0=crest). We store the vertex id per (rowNode, signedCol).
  const stripCellKeys = new Set<number>();   // (u,t) mm-cells COVERED by a strip (to delete bg tris + exclude bg pts)
  const coverKeyOf = (u: number, t: number): number => Math.round(((u % 1) + 1) % 1 * arcPerU / (h * 0.5)) * 1_000_003 + Math.round(t * H / (h * 0.5));
  const boundaryVerts = new Set<number>();   // strip outer-boundary verts (fed to cdt2d as the hole rim)
  const boundaryEdges: Array<[number, number]> = []; // locked rim edges for the CDT

  const chains = crestChains(cEdges);
  let meanDepthAcc = 0, depthN = 0;

  for (const chain of chains) {
    // 1) ROW nodes: resample the chain polyline (in mm) to along-crest pitch h. Build cumulative arc-length.
    const pts3: Array<[number, number, number]> = []; const ptsUt: Array<[number, number]> = [];
    // seam-consistent u along the chain (unwrap)
    let uPrev = uv[2 * chain[0]];
    for (let i = 0; i < chain.length; i++) {
      let u = uv[2 * chain[i]]; const t = uv[2 * chain[i] + 1];
      while (u - uPrev > 0.5) u -= 1; while (uPrev - u > 0.5) u += 1; uPrev = u;
      ptsUt.push([u, t]); pts3.push(lift(rA, ((u % 1) + 1) % 1, t, H));
    }
    const cum = [0]; for (let i = 1; i < pts3.length; i++) cum.push(cum[i - 1] + Math.hypot(pts3[i][0] - pts3[i - 1][0], pts3[i][1] - pts3[i - 1][1], pts3[i][2] - pts3[i - 1][2]));
    const total = cum[cum.length - 1]; if (total < 1e-6) continue;
    const nRow = Math.max(1, Math.round(total / h));
    // interpolate (u,t) at arc-length s
    const atArc = (s: number): [number, number] => {
      if (s <= 0) return ptsUt[0]; if (s >= total) return ptsUt[ptsUt.length - 1];
      let i = 1; while (i < cum.length && cum[i] < s) i++;
      const f = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      return [ptsUt[i - 1][0] + (ptsUt[i][0] - ptsUt[i - 1][0]) * f, ptsUt[i - 1][1] + (ptsUt[i][1] - ptsUt[i - 1][1]) * f];
    };
    // crest tangent (mm) at a row node — from the local chain direction
    const tangentAt = (s: number): [number, number] => {
      const e = Math.min(total, Math.max(0, s));
      const [u0, t0] = atArc(Math.max(0, e - h * 0.5)); const [u1, t1] = atArc(Math.min(total, e + h * 0.5));
      let dUmm = (u1 - u0) * arcPerU, dTmm = (t1 - t0) * H; const L = Math.hypot(dUmm, dTmm) || 1e-9;
      dUmm /= L; dTmm /= L; return [dUmm, dTmm];
    };

    // 2) grid: rows 0..nRow, signed columns -nCol..+nCol. Column march by across-crest arc-length h.
    const grid: number[][] = []; // grid[i] = ids for j=0..2nCol  (index jj, jj=0 is col -nCol, jj=nCol is crest, jj=2nCol is +nCol)
    for (let i = 0; i <= nRow; i++) {
      const s = (i / nRow) * total; const [cu, ct] = atArc(s);
      const [txmm, tymm] = tangentAt(s); const pxmm = -tymm, pymm = txmm; // perp (mm)
      const row: number[] = new Array(2 * nCol + 1);
      // crest node (col 0)
      const crestId = addPt(cu, ct); row[nCol] = crestId; boundaryVerts.add(crestId);
      // VALLEY midline distance at this crest node (nearest OTHER crest 3D dist / 2) — the strip must not cross it.
      let half = Infinity;
      if (valleyClamp) {
        const [cx0, cy0, cz0] = lift(rA, ((cu % 1) + 1) % 1, ct, H);
        let best = Infinity;
        for (let ci = 0; ci < crest3.length; ci++) { const p = crest3[ci]; const dd = Math.hypot(cx0 - p[0], cy0 - p[1], cz0 - p[2]); if (dd > h * 0.5 && dd < best) best = dd; }
        half = best === Infinity ? Infinity : best * 0.5;
      }
      for (const sgn of [+1, -1]) {
        let u = cu, t = ct; let reached = 0; let lastId = crestId;
        for (let jc = 1; jc <= nCol; jc++) {
          const { su, st } = metricScales(rA, H, ((u % 1) + 1) % 1, t);
          // perp step in (u,t): the mm-perp (pxmm,pymm) back to (u,t) = (pxmm/arcPerU, pymm/H); 3D length per unit of
          // that (u,t) vector = |(su·pxmm/arcPerU, st·pymm/H)|; step = h / that → advances ~h in 3D (square).
          const dUu = pxmm / arcPerU, dTt = pymm / H;
          const arc = Math.hypot(su * dUu, st * dTt) || 1e-9; const step = h / arc;
          reached += h;
          if (valleyClamp && reached > half) { // stop at the valley midline — duplicate the last node out to nCol
            const jj = sgn > 0 ? nCol + jc : nCol - jc; row[jj] = lastId; continue;
          }
          u += sgn * dUu * step; t += sgn * dTt * step;
          // clamp into the patch band (a strip that would exit the band stops — background fills there)
          const tc2 = Math.min(tHi, Math.max(tLo, t));
          const jj = sgn > 0 ? nCol + jc : nCol - jc;
          const id = addPt(u, tc2); row[jj] = id; lastId = id;
          if (jc === nCol) boundaryVerts.add(id);
          if (tc2 !== t) t = tc2;
        }
      }
      grid.push(row);
      meanDepthAcc += nCol; depthN++;
    }

    // 3) EMIT quads directly (2 tris, consistent diagonal). Mark covered cells + boundary rim edges.
    for (let i = 0; i < nRow; i++) {
      for (let jj = 0; jj < 2 * nCol; jj++) {
        const v00 = grid[i][jj], v01 = grid[i][jj + 1], v10 = grid[i + 1][jj], v11 = grid[i + 1][jj + 1];
        if (v00 === v01 || v00 === v10 || v11 === v01 || v11 === v10) continue; // degenerate (dedup collision) — skip
        // consistent diagonal v00-v11
        stripTris.push(v00, v11, v01); stripTris.push(v00, v10, v11);
        // cover the cell centroid (u,t) so bg tris there are removed
        const cu = (uv[2 * v00] + uv[2 * v11]) / 2, ct = (uv[2 * v00 + 1] + uv[2 * v11 + 1]) / 2;
        stripCellKeys.add(coverKeyOf(cu, ct));
      }
      // rim edges on the outer columns (j=0 and j=2nCol) for the CDT hole boundary
      boundaryEdges.push([grid[i][0], grid[i + 1][0]]);
      boundaryEdges.push([grid[i][2 * nCol], grid[i + 1][2 * nCol]]);
    }
    // end-cap rim edges (row 0 and row nRow across all columns) so the strip is a closed polygon in the CDT
    for (let jj = 0; jj < 2 * nCol; jj++) {
      boundaryEdges.push([grid[0][jj], grid[0][jj + 1]]);
      boundaryEdges.push([grid[nRow][jj], grid[nRow][jj + 1]]);
    }
  }

  // 4) BACKGROUND CDT of the COMPLEMENT. Feed cdt2d ONLY: (a) seed background verts NOT inside a strip cover-cell,
  //    (b) strip boundary verts. Constraint edges = strip rim edges. Delaunay fills the smooth panel; the rim edges
  //    are locked so it cannot cross into the strip; strip-interior verts are ABSENT → cannot be re-chorded.
  const nSeed = seedUv.length / 2;
  const bgIds: number[] = [];
  for (let i = 0; i < nSeed; i++) {
    const cid = coverKeyOf(seedUv[2 * i], seedUv[2 * i + 1]);
    // include the seed vert if it is NOT covered by a strip, OR it is a strip boundary vert (needed to close the rim)
    if (!stripCellKeys.has(cid) || boundaryVerts.has(i)) bgIds.push(i);
  }
  for (const v of boundaryVerts) if (v >= nSeed) bgIds.push(v); // strip rim verts added past the seed pool
  const bgSet = new Set(bgIds);
  // remap to a compact index space for cdt2d, then remap back
  const local: number[] = []; const g2l = new Map<number, number>();
  for (const v of bgSet) { g2l.set(v, local.length); local.push(v); }
  const pts: [number, number][] = local.map((v) => [uv[2 * v] * arcPerU, uv[2 * v + 1] * H]);
  const rimLocal: Array<[number, number]> = [];
  for (const [a, b] of boundaryEdges) { const la = g2l.get(a), lb = g2l.get(b); if (la !== undefined && lb !== undefined && la !== lb) rimLocal.push([la, lb]); }
  let bgTris: number[] = [];
  try {
    const t = cdt2d(pts, rimLocal as [number, number][], { exterior: true }) as number[][];
    for (const tr of t) {
      const a = local[tr[0]], b = local[tr[1]], c = local[tr[2]];
      // drop any bg tri whose centroid falls inside a strip cover-cell (the hole) — belt-and-suspenders vs cdt2d
      const cu = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, ct = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
      if (stripCellKeys.has(coverKeyOf(cu, ct))) continue;
      bgTris.push(a, b, c);
    }
  } catch { bgTris = []; }

  void uLo; void uHi;
  const tris = stripTris.concat(bgTris);
  return {
    uv, tris,
    nStripTris: stripTris.length / 3, nBgTris: bgTris.length / 3, nStripVerts: boundaryVerts.size, nChains: chains.length,
    meanColDepth: depthN ? meanDepthAcc / depthN : 0,
  };
}

// re-export the honest facet ruler for the probe's whole-mesh guard (identical instrument)
export { facetDev45 };
