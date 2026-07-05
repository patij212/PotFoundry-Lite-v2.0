// _pf_crestStripLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-05-PERFECT-MESHER-CRESTSTRIP. The LAST sliver lever: a CURVED-element-GUIDED STRUCTURED SQUARE flank
// strip that replaces the greedy flat-P1 RED 1->4 crest-flank refinement.
//
// WHY (measured root cause, E-…-ANISO-RULER): the perfect mesher's 0-outlier Gothic mesh is FIDELITY-clean
// (interiorOutliers=0 @0.006mm, watertight) but its free-cell "slivers" are a GENUINE defect — mis-oriented
// cross-curvature needles LONG ACROSS the near-vertical flank (worst-60 median 76° to crest), micro-thin ALONG
// the crest, WORSE under the anisotropic metric, + 36 ZERO-AREA UV-collinear degenerate faces. The greedy
// interior-refine loop (RED 1->4 on flank outliers to hold 0-outlier at the apex) is FORCED to chord-refine the
// near-vertical flank into needles. 6 density/placement/connectivity/relax/flip/ruler levers are refuted.
//
// THE MECHANISM (a PRIMITIVE change, not more density):
//   Per locked crest EDGE, grow a STRUCTURED STRIP that marches OUT from the crest into the flank:
//     - ROWS along the crest at a 3D arc pitch sAlong (subdivide the coarse crest edge to that pitch);
//     - COLUMNS out from the crest in +u AND -u (both flanks of the ridge) at a 3D arc pitch sOut ≈ sAlong (SQUARE),
//       marched by ARC-LENGTH along the curved flank so cells stay square as the flank steepens/curves;
//     - each strip node lifted to the TRUE radial surface ⇒ on-surface (0-outlier) by construction, provided the
//       column depth reaches far enough and sOut is small enough near the apex (the honest brute STOP decides).
//   The one-sided Vlachos PN element (surfaceNormal + control-net tangent from _pf_perfectMesherBruteLib) supplies
//   the flank SURFACE TANGENT used to convert the target 3D arc pitch sOut into a (u,t) step (dU = sOut / su, with
//   su the across-crest arc-length-per-uunit at the current depth) — i.e. the PN/first-form drives the arc-length
//   grading so the structured cells FOLLOW the flank curvature and land SQUARE. Flat P1 triangles TILE the strip
//   (each row×col quad -> 2 tris), so they are well-shaped by construction (aspect ~1 in 3D), not needles.
//
// The crest stays a NO-BRIDGE shared edge (the row-0 nodes ARE the subdivided crest chain, locked). Between the
// structured strips the background/smooth-panel CDT is unchanged (byte-identical off the flank). The honest
// full-azimuth brute STOP driver is REUSED VERBATIM (holds fidelity: a strip that under-reaches the apex is caught
// as a residual outlier and the loop deepens it).
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + _pf_perfectMesherBruteLib + labkit + cdt2d READ-ONLY. No src/
// or existing-kernel edit.
import cdt2d from 'cdt2d';
import { type AnalyticRadiusFn } from './labkit';
import { type PatchDef, lift } from './_pf_perfectMesherLib';
import { facetInteriorBrute, type HonestFacet } from './_pf_perfectMesherBruteLib';
import { metricScales } from './_pf_perfectMesherMsquareLib';

const TAU = 2 * Math.PI;

// mm-scaled (u,t) CDT with locked constraint edges (replica of the proven lib's internal triangulate).
function triangulateMM(uv: number[], patch: PatchDef, cEdges: Array<[number, number]>): number[] {
  const { arcPerU, H } = patch;
  const nV = uv.length / 2; const pts: [number, number][] = new Array(nV);
  for (let i = 0; i < nV; i++) pts[i] = [uv[2 * i] * arcPerU, uv[2 * i + 1] * H];
  const t = cdt2d(pts, cEdges as [number, number][], { exterior: true }) as number[][];
  const out: number[] = []; for (const tr of t) out.push(tr[0], tr[1], tr[2]);
  return out;
}

function crestVertexSetFromEdges(cEdges: Array<[number, number]>): Set<number> {
  const s = new Set<number>(); for (const [a, b] of cEdges) { s.add(a); s.add(b); } return s;
}

export interface StripPassStat {
  pass: number; nTris: number; nScored: number; nOutBrute: number; worstBrute: number;
  nStrips: number; nInsertedRow: number; nInsertedCol: number; nCrestEdgesSplit: number; bruteCalls: number; ms: number;
}
export interface StripRefineResult {
  uv: number[]; tris: number[]; cEdges: Array<[number, number]>; passes: number; capped: boolean; histPerPass: StripPassStat[];
}

// ── THE STRUCTURED CREST-STRIP refine loop ────────────────────────────────────────────────────────────────────
// STOP driver = honest full-azimuth brute (facetInteriorBrute), identical to the CONFIRMED kernel.
// DELIVERY: on a FLANK OUTLIER facet (>tol AND >=1 crest vertex), grow a structured strip off its incident crest
// edge(s): ROW nodes along the crest at 3D pitch h; COLUMN nodes out from each row node at square 3D pitch h,
// marched by arc-length (dU = h/su_local) into BOTH flanks, to a depth of `nCol` columns (the strip reaches the
// smooth panel where the flat chord is already < tol). Insert only NEW (u,t) points (dedup by mm cell); re-CDT with
// the (subdivided) locked crest edges — the structured lattice becomes a square-celled Delaunay strip.
export function refineCrestStrip(
  patch: PatchDef, seed: { uv: number[]; tris: number[] }, cEdges0: Array<[number, number]>, tol: number, maxPass: number,
  ruler: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
  onPass?: (s: StripPassStat) => void,
  opts?: { nCol?: number; hMinMm?: number },
): StripRefineResult {
  const { rA, H, arcPerU } = patch;
  const nCol = opts?.nCol ?? 4;          // structured columns marched into EACH flank per strip
  const hMinMm = opts?.hMinMm ?? 0.003;  // finest 3D pitch (matches the M-square cellMm floor)
  let uv = seed.uv.slice(); let tris = seed.tris.slice();
  let cEdges = cEdges0.map((e) => [e[0], e[1]] as [number, number]);
  const cellMm = 0.003;
  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number => Math.round(((u % 1) + 1) % 1 * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm);
  const rehash = (): void => { pmap.clear(); for (let i = 0; i < uv.length / 2; i++) { const k = keyOf(uv[2 * i], uv[2 * i + 1]); if (!pmap.has(k)) pmap.set(k, i); } };
  const addPt = (u: number, t: number): number => { const k = keyOf(u, t); const hit = pmap.get(k); if (hit !== undefined) return hit; const id = uv.length / 2; uv.push(u, t); pmap.set(k, id); return id; };

  const hist: StripPassStat[] = [];
  let capped = false; let pass = 0;
  let lastInserted = new Set<number>();

  for (pass = 1; pass <= maxPass; pass++) {
    const t0 = Date.now();
    const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const nF = tris.length / 3;
    let active: number[];
    if (pass === 1) active = Array.from({ length: nF }, (_, i) => i);
    else { active = []; for (let f = 0; f < nF; f++) { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; if (lastInserted.has(a) || lastInserted.has(b) || lastInserted.has(c)) active.push(f); } }
    rehash();

    const crestV = crestVertexSetFromEdges(cEdges);
    // crest-vertex -> incident locked crest edges (O(1) lookup in the facet loop)
    const crestAdj = new Map<number, Array<[number, number]>>();
    for (const [x, y] of cEdges) {
      if (!crestAdj.has(x)) crestAdj.set(x, []); (crestAdj.get(x) as Array<[number, number]>).push([x, y]);
      if (!crestAdj.has(y)) crestAdj.set(y, []); (crestAdj.get(y) as Array<[number, number]>).push([x, y]);
    }

    let nOut = 0, worst = 0, bruteCalls = 0, nRow = 0, nColN = 0, nStrips = 0, nCrestSplit = 0;
    const insertedVerts = new Set<number>();
    const dedupe = new Set<number>();
    const crestSplitReq = new Map<string, number>();       // crest edge key -> target 3D pitch (needle-row killer)
    const stripped = new Set<string>();                    // crest edges already stripped this pass

    const insertNode = (u: number, t: number): number => {
      const kk = keyOf(u, t); const id = addPt(u, t);
      if (!dedupe.has(kk)) { dedupe.add(kk); insertedVerts.add(id); }
      return id;
    };

    // Grow a structured strip off ONE crest edge (cx->cy), marching into BOTH flanks (±u) at square 3D pitch h.
    // Returns nRowNodes, nColNodes added.
    const growStrip = (cx: number, cy: number, h: number): { r: number; c: number } => {
      let ux = uv[2 * cx], uy = uv[2 * cy]; const tx = uv[2 * cx + 1], ty = uv[2 * cy + 1];
      while (uy - ux > 0.5) uy -= 1; while (ux - uy > 0.5) uy += 1; // seam-image the edge
      const Px = lift(rA, ((ux % 1) + 1) % 1, tx, H), Py = lift(rA, ((uy % 1) + 1) % 1, ty, H);
      const len3d = Math.hypot(Px[0] - Py[0], Px[1] - Py[1], Px[2] - Py[2]);
      // ROW resolution: nRows along the crest edge so each along-crest cell ≈ h in 3D.
      const nRows = Math.min(6, Math.max(1, Math.round(len3d / h)));
      let rAdd = 0, cAdd = 0;
      // Determine the crest tangent direction in (u,t): the ridge here is (near-)u-family (horizontal) OR t-family
      // (vertical). The FLANK (across-crest) direction is the (u,t) direction PERPENDICULAR to the crest tangent in
      // the mm chart. We march columns along ±perp. Compute the perp in mm, convert back to (u,t).
      const dUmm = (uy - ux) * arcPerU, dTmm = (ty - tx) * H;
      const Lmm = Math.hypot(dUmm, dTmm) || 1e-9;
      // unit crest tangent (mm), unit perp (mm)
      const txmm = dUmm / Lmm, tymm = dTmm / Lmm;
      const pxmm = -tymm, pymm = txmm; // perp
      for (let ri = 0; ri <= nRows; ri++) {
        const fr = ri / Math.max(1, nRows);
        const ru = ux + (uy - ux) * fr, rt = tx + (ty - tx) * fr; // row anchor ON the crest
        const rowId = insertNode(ru, rt); crestV.add(rowId); if (ri > 0 && ri < nRows) rAdd++;
        // March COLUMNS out into BOTH flanks (±perp) by ARC-LENGTH h per step (square 3D pitch, curvature-following).
        // The mm-perp unit direction (pxmm,pymm) back to (u,t) is (pxmm/arcPerU, pymm/H); its 3D length per 1 mm of
        // perp advance is arcPerMmPerp = |(su·dU, st·dT)|. Stepping stepMm = h/arcPerMmPerp advances ~h in 3D — the
        // arc-length grading (steps SHRINK in (u,t) where the flank is near-vertical, so cells stay square as the
        // flank steepens). This is the PN/first-form-driven flank-following delivery.
        for (const sgn of [+1, -1]) {
          let cu = ru, ct = rt;
          const dUu = pxmm / arcPerU, dTt = pymm / H;
          for (let ci = 1; ci <= nCol; ci++) {
            const { su, st } = metricScales(rA, H, ((cu % 1) + 1) % 1, ct);
            const arcPerMmPerp = Math.hypot(su * dUu, st * dTt) || 1e-9;
            const stepMm = h / arcPerMmPerp;
            cu = cu + sgn * dUu * stepMm; ct = ct + sgn * dTt * stepMm;
            if (ct < patch.tLo - 1e-6 || ct > patch.tHi + 1e-6) break;
            if (cu < patch.uLo - 1e-6 || cu > patch.uHi + 1e-6) break;
            insertNode(cu, ct); cAdd++;
          }
        }
      }
      // request the crest edge itself be subdivided to the row pitch (needle-row killer + no-bridge preserved)
      if (nRows > 1) { const key = `${Math.min(cx, cy)}_${Math.max(cx, cy)}`; crestSplitReq.set(key, h); }
      return { r: rAdd, c: cAdd };
    };

    for (const f of active) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const g: HonestFacet = facetInteriorBrute(rA, H, xyz, uv, a, b, c, ruler);
      bruteCalls += g.bruteCalls;
      if (g.dev > worst) worst = g.dev;
      if (g.dev <= tol) continue;
      nOut++;

      // 3D min edge of the facet -> target pitch h (geometric halving each pass, floored at hMinMm)
      const P = (vI: number): [number, number, number] => lift(rA, uv[2 * vI], uv[2 * vI + 1], H);
      const Pa = P(a), Pb = P(b), Pc = P(c);
      const e0 = Math.hypot(Pb[0] - Pa[0], Pb[1] - Pa[1], Pb[2] - Pa[2]);
      const e1 = Math.hypot(Pc[0] - Pb[0], Pc[1] - Pb[1], Pc[2] - Pb[2]);
      const e2 = Math.hypot(Pa[0] - Pc[0], Pa[1] - Pc[1], Pa[2] - Pc[2]);
      const emin = Math.min(e0, e1, e2);
      const hF = Math.max(hMinMm, emin / 2);

      // Is this a FLANK facet (>=1 crest vertex)? If so, grow structured strips off its incident crest edges.
      let didStrip = false;
      for (const v of [a, b, c]) {
        const inc = crestAdj.get(v); if (!inc) continue;
        for (const [x, y] of inc) {
          const key = `${Math.min(x, y)}_${Math.max(x, y)}`;
          if (stripped.has(key)) { didStrip = true; continue; }
          stripped.add(key);
          const res = growStrip(x, y, hF); nRow += res.r; nColN += res.c; nStrips++;
          didStrip = true;
        }
      }

      // FALLBACK for a flank outlier with NO incident crest edge (an interior-panel outlier, rare): RED 1->4 (the
      // CONFIRMED convergent mechanism) so fidelity still holds.
      if (!didStrip) {
        let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
        while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
        insertNode((ua + ub) / 2, (ta + tb) / 2); insertNode((ub + uc) / 2, (tb + tc) / 2); insertNode((uc + ua) / 2, (tc + ta) / 2);
        nColN += 3;
      }
    }

    // APPLY crest-edge subdivisions to the row pitch (endpoints stay crest-locked -> no-bridge preserved).
    if (crestSplitReq.size > 0) {
      const newCEdges: Array<[number, number]> = [];
      for (const [x, y] of cEdges) {
        const key = `${Math.min(x, y)}_${Math.max(x, y)}`;
        const hReq = crestSplitReq.get(key);
        if (hReq === undefined) { newCEdges.push([x, y]); continue; }
        let ux = uv[2 * x], uy = uv[2 * y]; const tx = uv[2 * x + 1], ty = uv[2 * y + 1];
        while (uy - ux > 0.5) uy -= 1; while (ux - uy > 0.5) uy += 1;
        const Px = lift(rA, ((ux % 1) + 1) % 1, tx, H), Py = lift(rA, ((uy % 1) + 1) % 1, ty, H);
        const len3d = Math.hypot(Px[0] - Py[0], Px[1] - Py[1], Px[2] - Py[2]);
        const nSub = Math.min(6, Math.max(1, Math.round(len3d / hReq)));
        if (nSub <= 1) { newCEdges.push([x, y]); continue; }
        let prev = x;
        for (let k = 1; k < nSub; k++) {
          const fr = k / nSub;
          const mu = ux + (uy - ux) * fr, mt = tx + (ty - tx) * fr;
          const mid = addPt(mu, mt); insertedVerts.add(mid); nCrestSplit++;
          newCEdges.push([prev, mid]); prev = mid;
        }
        newCEdges.push([prev, y]);
      }
      cEdges = newCEdges;
    }

    const stat: StripPassStat = {
      pass, nTris: nF, nScored: active.length, nOutBrute: nOut, worstBrute: +worst.toFixed(5),
      nStrips, nInsertedRow: nRow, nInsertedCol: nColN, nCrestEdgesSplit: nCrestSplit, bruteCalls, ms: Date.now() - t0,
    };
    hist.push(stat); if (onPass) onPass(stat);
    if (nOut === 0) break;
    tris = triangulateMM(uv, patch, cEdges);
    lastInserted = insertedVerts;
    if (pass === maxPass && nOut > 0) capped = true;
  }
  return { uv, tris, cEdges, passes: pass, capped, histPerPass: hist };
}

// ── zero-area / degenerate face instrument (the slicer-safety ruler) ─────────────────────────────────────────
// Counts lifted-3D faces below the zero-area floor (UV-collinear degenerates -> undefined normal -> slicer risk).
export interface ZeroAreaStat { zeroArea: number; subMicro: number; minAreaMm2: number; }
export function countZeroAreaFaces(xyz: Float64Array, tris: number[], zeroFloor = 1e-9, microFloor = 1e-6): ZeroAreaStat {
  let zeroArea = 0, subMicro = 0, minA = Infinity;
  for (let k = 0; k < tris.length; k += 3) {
    const a = tris[k], b = tris[k + 1], c = tris[k + 2];
    const ux = xyz[3 * b] - xyz[3 * a], uy = xyz[3 * b + 1] - xyz[3 * a + 1], uz = xyz[3 * b + 2] - xyz[3 * a + 2];
    const vx = xyz[3 * c] - xyz[3 * a], vy = xyz[3 * c + 1] - xyz[3 * a + 1], vz = xyz[3 * c + 2] - xyz[3 * a + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area < minA) minA = area;
    if (area < zeroFloor) zeroArea++;
    else if (area < microFloor) subMicro++;
  }
  return { zeroArea, subMicro, minAreaMm2: minA === Infinity ? 0 : minA };
}

// ── FALLBACK: degenerate-face COLLAPSE post-pass (make the mesh SLICER-SAFE) ─────────────────────────────────
// Collapse every zero-area / sub-floor face by MERGING its coincident (UV-collinear) vertices: for each degenerate
// face, weld its two closest (in (u,t)) vertices to their midpoint, remap indices, drop faces that become
// two-index (collapsed edges). Returns a repaired {uv,tris} + counts. Watertight/outliers must be RE-MEASURED by
// the caller after collapse (the honest report).
export function collapseDegenerateFaces(
  patch: PatchDef, uv0: number[], tris0: number[], areaFloorMm2 = 1e-6,
): { uv: number[]; tris: number[]; collapsed: number; verticesMerged: number } {
  const { rA, H } = patch;
  const uv = uv0.slice();
  const nV = uv.length / 2;
  const remap = new Int32Array(nV); for (let i = 0; i < nV; i++) remap[i] = i;
  const find = (i: number): number => { let r = i; while (remap[r] !== r) r = remap[r]; while (remap[i] !== r) { const n = remap[i]; remap[i] = r; i = n; } return r; };
  const liftV = (i: number): [number, number, number] => lift(rA, uv[2 * i], uv[2 * i + 1], H);
  const area3 = (a: number, b: number, c: number): number => {
    const A = liftV(a), B = liftV(b), C = liftV(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  let collapsed = 0, merged = 0;
  for (let k = 0; k < tris0.length; k += 3) {
    let a = find(tris0[k]), b = find(tris0[k + 1]), c = find(tris0[k + 2]);
    if (a === b || b === c || a === c) continue;
    if (area3(a, b, c) >= areaFloorMm2) continue;
    // degenerate: weld the two vertices with the SHORTEST 3D edge into their midpoint (u,t) (collinear -> the middle
    // vertex is redundant; welding the shortest edge removes the sliver base without moving the outer vertices far).
    const A = liftV(a), B = liftV(b), C = liftV(c);
    const dAB = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    const dBC = Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]);
    const dCA = Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
    let p = a, q = b;
    if (dBC <= dAB && dBC <= dCA) { p = b; q = c; } else if (dCA <= dAB && dCA <= dBC) { p = c; q = a; }
    // merge q -> p (keep p's position; both are ~coincident so p's (u,t) is a faithful representative)
    if (find(p) !== find(q)) { remap[find(q)] = find(p); merged++; }
    collapsed++;
  }
  // rebuild tris with remapped indices, dropping any face that collapsed to <3 distinct vertices
  const tris: number[] = [];
  for (let k = 0; k < tris0.length; k += 3) {
    const a = find(tris0[k]), b = find(tris0[k + 1]), c = find(tris0[k + 2]);
    if (a === b || b === c || a === c) continue;
    tris.push(a, b, c);
  }
  return { uv, tris, collapsed, verticesMerged: merged };
}

void TAU;
