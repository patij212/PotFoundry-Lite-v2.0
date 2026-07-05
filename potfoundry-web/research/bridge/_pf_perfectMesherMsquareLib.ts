// _pf_perfectMesherMsquareLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-05-PERFECT-MESHER-MSQUARE. The perfect mesher is FIDELITY-PROVEN whole-PATCH on Gothic + GeoStar by
// FLAT-P1 (0 interior outliers @0.006mm, watertight non-vacuous, manifold) via the honest-brute-driven EDGE-mode
// refine (_pf_perfectMesherBruteLib). But that 0-outlier mesh is SLIVERY (Gothic 81.4%, minAngle 0), and an
// a-posteriori max-min-angle Lawson FLIP was REFUTED (E-…-TIERAB-SLIVERS): flips reopen outliers 0→57 because
// they reconnect the SAME needle point-set. The lever the refutation pointed to is METRIC-AWARE SPACING AT REFINE
// TIME.
//
// ROOT CAUSE of the slivers (measured, not inferred): the honest-brute EDGE-mode loop drives PERPENDICULAR-to-crest
// density very high near the near-vertical apex (to hold 0 outliers) while the ALONG-crest density stays at the FGJ
// extraction pitch (the locked crest constraint chain is never subdivided). A triangle with one vertex on the coarse
// crest chain and its opposite edge on the fine flank is a NEEDLE. So the fix is: whenever the loop refines a flank
// facet perpendicular-to-crest, ADD MATCHING along-crest density so the resulting cells are SQUARE under the surface
// metric M=g/h² (Steiner nodes placed at dt = h/√(su·st)-equalized positions; the crest constraint edges are
// SUBDIVIDED to the same 3D pitch).
//
// THE M=g/h² SQUARE-CELL RULE (surface first fundamental form):
//   - su(u,t) = |∂P/∂u| = arc-length per unit u (mm/uunit)  [varies with relief; ≈ arcPerU on the mean surface,
//               but MUCH larger on a near-vertical flank where dr/du is steep]
//   - st(u,t) = |∂P/∂t| = arc-length per unit t (mm/tunit)  [≈ H on a near-vertical wall]
//   A cell spanning du×dt has TRUE-3D extent (su·du) × (st·dt). SQUARE ⇒ su·du = st·dt. So to match a perpendicular
//   (across-crest, u) 3D pitch of h, the along-crest (t) node spacing must be dt = h / st, and the across-crest
//   node spacing du = h / su. This is exactly the M=g/h² even-tessellation lever (dt=h/√(min·max) rows +
//   width-match → SQUARE 3D cells) from the weave/z-tiled campaign.
//
// MECHANISM: same honest-brute STOP driver + same locked-constraint CDT as the CONFIRMED kernel. ONE change: when an
// outlier flank facet is refined, instead of a blind 1→4 RED edge split (which slivers), place M-SQUARE Steiner
// nodes — a small local lattice sized so its across-crest AND along-crest 3D pitch both equal the facet's target h
// (h halves each pass = geometric convergence, holding 0 outliers), AND subdivide any incident LOCKED crest edge to
// the same along-crest 3D pitch (so the crest chain densifies WITH the flank, killing the needle rows).
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + _pf_perfectMesherBruteLib + labkit + cdt2d READ-ONLY. NO src/
// or existing-kernel edit.
import cdt2d from 'cdt2d';
import { type AnalyticRadiusFn } from './labkit';
import { type PatchDef, lift } from './_pf_perfectMesherLib';
import { facetInteriorBrute, type HonestFacet } from './_pf_perfectMesherBruteLib';

const TAU = 2 * Math.PI;

// ── surface metric scales at (u,t): su=|∂P/∂u| (mm per uunit), st=|∂P/∂t| (mm per tunit) ──────────────────────────
export function metricScales(rA: AnalyticRadiusFn, H: number, u: number, t: number): { su: number; st: number } {
  const du = 1 / 16384, dt = 0.25 / H; // du in uunit; dt in tunit (~0.25mm in z)
  const p0 = lift(rA, u, t, H);
  const pu = lift(rA, u + du, t, H);
  const pt = lift(rA, u, Math.min(0.999999, t + dt), H);
  const su = Math.hypot(pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]) / du;
  const st = Math.hypot(pt[0] - p0[0], pt[1] - p0[1], pt[2] - p0[2]) / dt;
  return { su: su || 1e-9, st: st || 1e-9 };
}

// mm-scaled (u,t) CDT with locked constraint edges (replica of the proven lib's internal triangulate).
function triangulateMM(uv: number[], patch: PatchDef, cEdges: Array<[number, number]>): number[] {
  const { arcPerU, H } = patch;
  const nV = uv.length / 2; const pts: [number, number][] = new Array(nV);
  for (let i = 0; i < nV; i++) pts[i] = [uv[2 * i] * arcPerU, uv[2 * i + 1] * H];
  const t = cdt2d(pts, cEdges as [number, number][], { exterior: true }) as number[][];
  const out: number[] = []; for (const tr of t) out.push(tr[0], tr[1], tr[2]);
  return out;
}

export interface MsquarePassStat {
  pass: number; nTris: number; nScored: number; nOutBrute: number; worstBrute: number;
  nInsertedFlank: number; nInsertedCrest: number; nCrestEdgesSplit: number; bruteCalls: number; ms: number;
}
export interface MsquareRefineResult {
  uv: number[]; tris: number[]; cEdges: Array<[number, number]>; passes: number; capped: boolean; histPerPass: MsquarePassStat[];
}

// crest-vertex membership: a mesh vertex is ON the crest iff it is an endpoint of a locked constraint edge.
function crestVertexSetFromEdges(cEdges: Array<[number, number]>): Set<number> {
  const s = new Set<number>(); for (const [a, b] of cEdges) { s.add(a); s.add(b); } return s;
}

// ── THE M=g/h² SQUARE refine loop ────────────────────────────────────────────────────────────────────────────
// STOP driver = honest full-azimuth brute (facetInteriorBrute), identical to the CONFIRMED edge-mode kernel.
// DELIVERY = M-square: for each outlier flank facet, target 3D pitch h_f = (current 3D min-edge of the facet)/2
// (geometric halving), and insert Steiner nodes so BOTH across-crest and along-crest 3D pitch ≈ h_f:
//   - across-crest (u): a node at du = h_f/su from the crest side (the near-vertical direction — this is what
//     holds fidelity, same as edge-mode);
//   - along-crest (t): nodes at dt = h_f/st spacing (this is the NEW density that squares the cells);
//   - AND subdivide any incident LOCKED crest edge whose 3D length > h_f at its M-square midpoints (t-direction),
//     so the crest chain densifies WITH the flank — the needle-row killer.
// Cap-hit facets remain outliers (honest).
export function refineInteriorMsquare(
  patch: PatchDef, seed: { uv: number[]; tris: number[] }, cEdges0: Array<[number, number]>, tol: number, maxPass: number,
  ruler: { gnScreen: number; preFilter: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number },
  onPass?: (s: MsquarePassStat) => void,
  aspectCap = 3.0, // do not insert a node that would create a cell more anisotropic than this under M (safety)
): MsquareRefineResult {
  const { rA, H, arcPerU } = patch;
  let uv = seed.uv.slice(); let tris = seed.tris.slice();
  let cEdges = cEdges0.map((e) => [e[0], e[1]] as [number, number]);
  const cellMm = 0.003;
  const pmap = new Map<number, number>();
  const rehash = (): void => { pmap.clear(); for (let i = 0; i < uv.length / 2; i++) { const k = keyOf(uv[2 * i], uv[2 * i + 1]); if (!pmap.has(k)) pmap.set(k, i); } };
  const keyOf = (u: number, t: number): number => Math.round(((u % 1) + 1) % 1 * arcPerU / cellMm) * 100000 + Math.round(t * H / cellMm);
  const addPt = (u: number, t: number): number => { const k = keyOf(u, t); const hit = pmap.get(k); if (hit !== undefined) return hit; const id = uv.length / 2; uv.push(u, t); pmap.set(k, id); return id; };

  const crestV = crestVertexSetFromEdges(cEdges);
  const hist: MsquarePassStat[] = [];
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

    let nOut = 0, worst = 0, bruteCalls = 0, nInsF = 0, nInsC = 0, nCrestSplit = 0;
    const insertedVerts = new Set<number>();
    const dedupe = new Set<number>();
    // collect crest edges to split THIS pass (edge index -> target 3D pitch); applied after facet loop
    const crestSplitReq = new Map<string, number>();

    const insertNode = (u: number, t: number): void => {
      const kk = keyOf(u, t); if (dedupe.has(kk)) return; dedupe.add(kk); const id = addPt(u, t); insertedVerts.add(id);
    };

    for (const f of active) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const g: HonestFacet = facetInteriorBrute(rA, H, xyz, uv, a, b, c, ruler);
      bruteCalls += g.bruteCalls;
      if (g.dev > worst) worst = g.dev;
      if (g.dev <= tol) continue;
      nOut++;

      // seam-consistent (u,t) corners of the facet
      let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
      while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
      const um = (ua + ub + uc) / 3, tm = (ta + tb + tc) / 3;

      // local metric at the facet centroid — su across-crest (u), st along-crest (t)
      const { su, st } = metricScales(rA, H, ((um % 1) + 1) % 1, tm);

      // facet 3D min edge (the current local pitch); target = half it (geometric convergence)
      const P = (vu: number, vt: number): [number, number, number] => lift(rA, ((vu % 1) + 1) % 1, vt, H);
      const Pa = P(ua, ta), Pb = P(ub, tb), Pc = P(uc, tc);
      const e0 = Math.hypot(Pb[0] - Pa[0], Pb[1] - Pa[1], Pb[2] - Pa[2]);
      const e1 = Math.hypot(Pc[0] - Pb[0], Pc[1] - Pb[1], Pc[2] - Pb[2]);
      const e2 = Math.hypot(Pa[0] - Pc[0], Pa[1] - Pc[1], Pa[2] - Pc[2]);
      const emin = Math.min(e0, e1, e2), emax = Math.max(e0, e1, e2);
      const hF = Math.max(cellMm, emin / 2); // target 3D pitch this pass

      // du, dt so the M-square cell has 3D extent hF × hF
      const duStep = hF / su;   // uunit
      const dtStep = hF / st;   // tunit

      // M-SQUARE LATTICE: place a small 2x2 (u,t) node cluster at the facet centroid so BOTH directions get hF pitch.
      // This replaces the edge-mode 1->4 (which only added perpendicular density) — it adds the ALONG-crest node the
      // edge-mode loop skipped, so the local cells become square. Clamp to the facet's (u,t) span so we densify IN
      // the facet, not outside it.
      const uMin = Math.min(ua, ub, uc), uMax = Math.max(ua, ub, uc);
      const tMin = Math.min(ta, tb, tc), tMax = Math.max(ta, tb, tc);
      // centroid node (always) + the four M-square neighbours (clamped into the facet)
      insertNode(um, tm); nInsF++;
      const cand: Array<[number, number]> = [
        [um + duStep, tm], [um - duStep, tm], [um, tm + dtStep], [um, tm - dtStep],
      ];
      for (const [cu, ct] of cand) {
        if (cu < uMin - 1e-9 || cu > uMax + 1e-9 || ct < tMin - 1e-9 || ct > tMax + 1e-9) continue;
        insertNode(cu, ct); nInsF++;
      }

      // NEEDLE-ROW KILLER: if this outlier facet is a FLANK facet touching the crest (>=1 crest vertex), request
      // that its incident LOCKED crest edges be subdivided to the same along-crest 3D pitch hF. A coarse crest edge
      // opposite a fine flank is exactly the needle; densifying it squares those cells.
      const hasCrest = crestV.has(a) || crestV.has(b) || crestV.has(c);
      if (hasCrest && emax / Math.max(emin, 1e-9) > aspectCap) {
        for (const [x, y] of cEdges) {
          const touchesFacet = (x === a || x === b || x === c) && (y === a || y === b || y === c);
          if (!touchesFacet) continue;
          const key = `${Math.min(x, y)}_${Math.max(x, y)}`;
          const prev = crestSplitReq.get(key);
          if (prev === undefined || hF < prev) crestSplitReq.set(key, hF);
        }
      }
    }

    // APPLY crest-edge subdivisions: split each requested locked edge at M-square t-midpoints so its 3D sub-length
    // <= target. Rebuild cEdges with the split chain (endpoints stay crest-locked → no-bridge preserved).
    if (crestSplitReq.size > 0) {
      const newCEdges: Array<[number, number]> = [];
      const reqSet = crestSplitReq;
      for (const [x, y] of cEdges) {
        const key = `${Math.min(x, y)}_${Math.max(x, y)}`;
        const hReq = reqSet.get(key);
        if (hReq === undefined) { newCEdges.push([x, y]); continue; }
        // 3D length of the crest edge
        let ux = uv[2 * x], uy = uv[2 * y]; const tx = uv[2 * x + 1], ty = uv[2 * y + 1];
        while (uy - ux > 0.5) uy -= 1; while (ux - uy > 0.5) uy += 1;
        const Px = lift(rA, ((ux % 1) + 1) % 1, tx, H), Py = lift(rA, ((uy % 1) + 1) % 1, ty, H);
        const len3d = Math.hypot(Px[0] - Py[0], Px[1] - Py[1], Px[2] - Py[2]);
        const nSub = Math.min(8, Math.max(1, Math.round(len3d / hReq))); // cap sub per pass (geometric across passes)
        if (nSub <= 1) { newCEdges.push([x, y]); continue; }
        let prev = x;
        for (let k = 1; k < nSub; k++) {
          const fr = k / nSub;
          const mu = ux + (uy - ux) * fr, mt = tx + (ty - tx) * fr;
          const mid = addPt(mu, mt); crestV.add(mid); insertedVerts.add(mid); nInsC++;
          newCEdges.push([prev, mid]); prev = mid;
        }
        newCEdges.push([prev, y]); nCrestSplit++;
      }
      cEdges = newCEdges;
    }

    const stat: MsquarePassStat = {
      pass, nTris: nF, nScored: active.length, nOutBrute: nOut, worstBrute: +worst.toFixed(5),
      nInsertedFlank: nInsF, nInsertedCrest: nInsC, nCrestEdgesSplit: nCrestSplit, bruteCalls, ms: Date.now() - t0,
    };
    hist.push(stat); if (onPass) onPass(stat);
    if (nOut === 0) break;
    tris = triangulateMM(uv, patch, cEdges);
    lastInserted = insertedVerts;
    if (pass === maxPass && nOut > 0) capped = true;
  }
  return { uv, tris, cEdges, passes: pass, capped, histPerPass: hist };
}
