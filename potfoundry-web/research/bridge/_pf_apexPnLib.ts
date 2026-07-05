// _pf_apexPnLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// SLIVER LEVER 13a (E-2026-07-05-GOTHIC-APEXPN): scoped one-sided PN curved element AT the apex, re-tessellating the
// near-apex NEEDLE leaves into a FEW well-shaped ON-SURFACE flat sub-triangles.
//
// CONTEXT (measured, VALIDATION 8 §1): the CONFIRMED whole-mesh Gothic mesh reaches wholeMeshOutliers=0 (max
// 0.01mm, watertight) but is 19% <20° / minAngle 0°. The needles are baked into the apex-band point set by the
// red 1->4 apex refine: near the zero-width pow(sharp) crest apex the fidelity-holding cells are FORCED long-along-
// crest needles. 12 prior sliver levers refuted — ALL move/reconnect the SAME flat point set (density / placement /
// connectivity / flips / free-CDT strips / red-green). V8 §1 names the SOLE untried REPRESENTATION move: a scoped
// one-sided PN/P2 curved element at the apex leaf. `apexLeafPN` (Vlachos) was BENCHED for FIDELITY (usedPnAtApex=
// FALSE) but NEVER used to re-TESSELLATE the needle leaves for QUALITY. This lib is that move.
//
// THE MECHANISM (no cdt2d — the free re-CDT re-chord was the V6 failure mode):
//   1. Localize needle facets (minAngle < angThresh) that are NEAR-APEX (high centroid gradU — the near-vertical
//      crest flank; the panel needles are LOW-gradU and are a DIFFERENT class we deliberately do NOT touch here).
//   2. CLUSTER connected needle facets (share a vertex) into local patches.
//   3. Per cluster: extract the ordered BOUNDARY polygon (edges used by exactly one cluster facet), which is KEPT
//      FIXED (shared with the surrounding untouched mesh ⇒ watertight by index). Build a one-sided Vlachos PN patch
//      per original cluster facet (from corner positions + surface normals) so we can LIFT any (u,t) inside the
//      cluster onto the smooth curved surface without chording the cusp.
//   4. Re-triangulate the boundary polygon with a FEW interior PN-lifted Steiner nodes placed at well-shaped fan
//      positions (constrained-ear + centroid split), emitting flat sub-triangles whose vertices ride the PN surface.
//      The interior connectivity is FREE to break out of the needle wedge (only the boundary is locked).
//   5. Splice: drop the cluster's old facets, append the new sub-triangles + new interior verts.
//
// ISOLATION: NEW file. Imports labkit + _pf_perfectMesherLib (lift) READ-ONLY, and re-implements the Vlachos PN
// control-net locally (the _pf_perfectMesherBruteLib apexLeafPN evaluator is measurement-only; here we need the
// EVALUATOR to place mesh nodes). NO cdt2d. NO src/ or existing-kernel edit.
import { type AnalyticRadiusFn } from './labkit';
import { type PatchDef, lift } from './_pf_perfectMesherLib';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

// ── geometry ─────────────────────────────────────────────────────────────────────────────────────────────────
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

// gradU at (u,t): |dr/du| — the near-vertical-flank steepness proxy the campaign uses.
export function gradU(rA: AnalyticRadiusFn, H: number, u: number, t: number): number {
  const du = 1 / 8192, z = t * H;
  return Math.abs(rA(TAU * ((u + du) - Math.floor(u + du)), z) - rA(TAU * ((u - du) - Math.floor(u - du)), z)) / (2 * du * TAU);
}

// surface normal at (u,t) (outward radial-oriented) — for the PN control net.
function surfaceNormal(rA: AnalyticRadiusFn, u: number, t: number, H: number): V3 {
  const du = 1 / 8192, dt = 0.5 / H;
  const p0 = lift(rA, u, t, H), pu = lift(rA, u + du, t, H), pt = lift(rA, u, t + dt, H);
  const tu: V3 = [pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]];
  const tt: V3 = [pt[0] - p0[0], pt[1] - p0[1], pt[2] - p0[2]];
  let n = cross(tu, tt); const L = norm(n) || 1; n = [n[0] / L, n[1] / L, n[2] / L];
  const th = TAU * (u - Math.floor(u)); if (n[0] * Math.cos(th) + n[1] * Math.sin(th) < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}
function edgeCtrl(Pi: V3, Pj: V3, Ni: V3): V3 {
  const w = dot(sub(Pj, Pi), Ni);
  return [(2 * Pi[0] + Pj[0] - w * Ni[0]) / 3, (2 * Pi[1] + Pj[1] - w * Ni[1]) / 3, (2 * Pi[2] + Pj[2] - w * Ni[2]) / 3];
}

// A one-sided Vlachos PN triangle patch: evaluate at barycentric (w0,w1,w2), w0+w1+w2=1.
interface PnPatch { eval: (w0: number, w1: number, w2: number) => V3; }
function buildPnPatch(rA: AnalyticRadiusFn, H: number, P0: V3, P1: V3, P2: V3, uv0: [number, number], uv1: [number, number], uv2: [number, number]): PnPatch {
  const N0 = surfaceNormal(rA, uv0[0], uv0[1], H), N1 = surfaceNormal(rA, uv1[0], uv1[1], H), N2 = surfaceNormal(rA, uv2[0], uv2[1], H);
  const b210 = edgeCtrl(P0, P1, N0), b120 = edgeCtrl(P1, P0, N1);
  const b021 = edgeCtrl(P1, P2, N1), b012 = edgeCtrl(P2, P1, N2);
  const b102 = edgeCtrl(P2, P0, N2), b201 = edgeCtrl(P0, P2, N0);
  const E: V3 = [(b210[0] + b120[0] + b021[0] + b012[0] + b102[0] + b201[0]) / 6, (b210[1] + b120[1] + b021[1] + b012[1] + b102[1] + b201[1]) / 6, (b210[2] + b120[2] + b021[2] + b012[2] + b102[2] + b201[2]) / 6];
  const Vc: V3 = [(P0[0] + P1[0] + P2[0]) / 3, (P0[1] + P1[1] + P2[1]) / 3, (P0[2] + P1[2] + P2[2]) / 3];
  const b111: V3 = [E[0] + (E[0] - Vc[0]) / 2, E[1] + (E[1] - Vc[1]) / 2, E[2] + (E[2] - Vc[2]) / 2];
  const terms10: Array<[V3, (u: number, v: number, w: number) => number]> = [
    [P0, (u) => u * u * u], [P1, (_u, v) => v * v * v], [P2, (_u, _v, w) => w * w * w],
    [b210, (u, v) => 3 * u * u * v], [b120, (u, v) => 3 * u * v * v], [b021, (_u, v, w) => 3 * v * v * w],
    [b012, (_u, v, w) => 3 * v * w * w], [b102, (u, _v, w) => 3 * u * w * w], [b201, (u, _v, w) => 3 * u * u * w],
    [b111, (u, v, w) => 6 * u * v * w],
  ];
  return {
    eval: (w0, w1, w2): V3 => {
      const out: V3 = [0, 0, 0];
      for (const [P, c] of terms10) { const s = c(w0, w1, w2); out[0] += P[0] * s; out[1] += P[1] * s; out[2] += P[2] * s; }
      return out;
    },
  };
}

// ── min-angle of a 3D triangle (degrees) ─────────────────────────────────────────────────────────────────────
function triMinAngleDeg(A: V3, B: V3, C: V3): number {
  const a = norm(sub(B, C)), b = norm(sub(A, C)), c = norm(sub(A, B));
  if (a < 1e-12 || b < 1e-12 || c < 1e-12) return 0;
  const ang = (o: number, p: number, q: number): number => { let x = (p * p + q * q - o * o) / (2 * p * q); x = Math.max(-1, Math.min(1, x)); return Math.acos(x) * 180 / Math.PI; };
  return Math.min(ang(a, b, c), ang(b, a, c), ang(c, a, b));
}

// ── the lever ────────────────────────────────────────────────────────────────────────────────────────────────
export interface ApexPnOpts {
  angThresh: number;   // needle if minAngle < this (deg)
  gradUThresh: number; // near-apex if centroid gradU > this (near-vertical crest flank); panel needles are LOW-gradU
  nInterior: number;   // target interior PN nodes per cluster (small)
}
export interface ApexPnResult {
  uv: number[]; tris: number[];
  nNeedle: number; nNearApexNeedle: number; nClusters: number;
  nOldFacetsReplaced: number; nNewFacets: number; nInteriorNodes: number;
  clustersRetessellated: number; clustersSkipped: number;
  diag: { needleGradU: { p10: number; p50: number; p90: number }; nPanelNeedle: number };
}

// Diagnostic-only: characterize the needle population WITHOUT modifying the mesh.
export function diagnoseNeedles(patch: PatchDef, uv: number[], tris: number[], angThresh: number): ApexPnResult['diag'] & { nNeedle: number; xyzSample: number[] } {
  const { rA, H } = patch;
  const P = (i: number): V3 => lift(rA, uv[2 * i], uv[2 * i + 1], H);
  const grads: number[] = [];
  let nNeedle = 0;
  for (let f = 0; f < tris.length; f += 3) {
    const a = tris[f], b = tris[f + 1], c = tris[f + 2];
    if (triMinAngleDeg(P(a), P(b), P(c)) >= angThresh) continue;
    nNeedle++;
    const um = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, tm = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
    grads.push(gradU(rA, H, um, tm));
  }
  grads.sort((x, y) => x - y);
  const q = (p: number): number => grads.length ? +grads[Math.min(grads.length - 1, Math.floor(p * grads.length))].toFixed(1) : 0;
  const nPanel = grads.filter((g) => g < 50).length;
  return { needleGradU: { p10: q(0.1), p50: q(0.5), p90: q(0.9) }, nPanelNeedle: nPanel, nNeedle, xyzSample: [] };
}

export function buildApexPnTess(patch: PatchDef, uv0: number[], tris0: number[], opts: ApexPnOpts): ApexPnResult {
  const { rA, H } = patch;
  const uv = uv0.slice();
  // live triangle list
  let tri: Array<[number, number, number]> = [];
  for (let i = 0; i < tris0.length; i += 3) tri.push([tris0[i], tris0[i + 1], tris0[i + 2]]);
  const P = (i: number): V3 => lift(rA, uv[2 * i], uv[2 * i + 1], H);

  // 1) find needle facets that are NEAR-APEX (high gradU).
  const isNeedle = (t: [number, number, number]): boolean => triMinAngleDeg(P(t[0]), P(t[1]), P(t[2])) < opts.angThresh;
  const centGradU = (t: [number, number, number]): number => gradU(rA, H, (uv[2 * t[0]] + uv[2 * t[1]] + uv[2 * t[2]]) / 3, (uv[2 * t[0] + 1] + uv[2 * t[1] + 1] + uv[2 * t[2] + 1]) / 3);
  let nNeedle = 0, nPanel = 0;
  const targetFacet = new Set<number>();
  for (let fi = 0; fi < tri.length; fi++) {
    if (!isNeedle(tri[fi])) continue;
    nNeedle++;
    if (centGradU(tri[fi]) > opts.gradUThresh) targetFacet.add(fi); else nPanel++;
  }
  const nNearApex = targetFacet.size;

  // 2) CLUSTER target facets that share a vertex (union-find over target facets via vertex incidence).
  const vtxToTargets = new Map<number, number[]>();
  for (const fi of targetFacet) for (const v of tri[fi]) { const a = vtxToTargets.get(v) ?? []; a.push(fi); vtxToTargets.set(v, a); }
  const parent = new Map<number, number>();
  for (const fi of targetFacet) parent.set(fi, fi);
  const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const uni = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const [, fis] of vtxToTargets) for (let k = 1; k < fis.length; k++) uni(fis[0], fis[k]);
  const clusters = new Map<number, number[]>();
  for (const fi of targetFacet) { const r = find(fi); const a = clusters.get(r) ?? []; a.push(fi); clusters.set(r, a); }

  // 3) per cluster: extract boundary polygon + retessellate over PN.
  const removed = new Set<number>();
  const newTris: Array<[number, number, number]> = [];
  let nInterior = 0, nRetess = 0, nSkip = 0;
  for (const [, fis] of clusters) {
    const res = retessellateCluster(patch, uv, tri, fis, opts.nInterior);
    if (!res) { nSkip++; continue; }
    for (const fi of fis) removed.add(fi);
    for (const nt of res.tris) newTris.push(nt);
    nInterior += res.nInterior; nRetess++;
  }

  // 4) splice
  const finalTri: Array<[number, number, number]> = [];
  for (let fi = 0; fi < tri.length; fi++) if (!removed.has(fi)) finalTri.push(tri[fi]);
  for (const nt of newTris) finalTri.push(nt);
  tri = finalTri;

  const flat: number[] = []; for (const t of tri) flat.push(t[0], t[1], t[2]);
  return {
    uv, tris: flat,
    nNeedle, nNearApexNeedle: nNearApex, nClusters: clusters.size,
    nOldFacetsReplaced: removed.size, nNewFacets: newTris.length, nInteriorNodes: nInterior,
    clustersRetessellated: nRetess, clustersSkipped: nSkip,
    diag: { needleGradU: { p10: 0, p50: 0, p90: 0 }, nPanelNeedle: nPanel },
  };
}

// retessellate a connected cluster of facets: keep the boundary polygon fixed, place PN-lifted interior nodes,
// re-triangulate to near-equilateral. Returns null if the boundary is non-simple (safe skip → cluster untouched).
function retessellateCluster(
  patch: PatchDef, uv: number[], tri: Array<[number, number, number]>, fis: number[], nInteriorTarget: number,
): { tris: Array<[number, number, number]>; nInterior: number } | null {
  const { rA, H } = patch;
  // boundary edges = edges appearing exactly once among the cluster facets.
  const edgeCount = new Map<string, [number, number]>();
  const bump = (a: number, b: number): void => { const k = a < b ? `${a}_${b}` : `${b}_${a}`; if (edgeCount.has(k)) edgeCount.delete(k); else edgeCount.set(k, [a, b]); };
  for (const fi of fis) { const [a, b, c] = tri[fi]; bump(a, b); bump(b, c); bump(c, a); }
  const bedges = Array.from(edgeCount.values());
  if (bedges_len(bedges) < 3) return null;
  // order the boundary into a single simple loop (each boundary vertex must appear in exactly 2 boundary edges).
  const adj = new Map<number, number[]>();
  const pushAdj = (a: number, b: number): void => { const arr = adj.get(a); if (arr) arr.push(b); else adj.set(a, [b]); };
  for (const [a, b] of bedges) { pushAdj(a, b); pushAdj(b, a); }
  for (const [, nb] of adj) if (nb.length !== 2) return null; // not a single simple loop → skip (rare, safe)
  const start = bedges[0][0];
  const loop: number[] = [start]; let prev = -1, cur = start;
  for (let guard = 0; guard < adj.size + 2; guard++) {
    const nb = adj.get(cur)!; const nxt = nb[0] === prev ? nb[1] : nb[0];
    if (nxt === start) break;
    loop.push(nxt); prev = cur; cur = nxt;
  }
  if (loop.length !== adj.size) return null; // disconnected boundary → skip
  const m = loop.length;

  // Build a PN patch from the cluster: use the LARGEST-area original facet as the reference PN triangle (its 3
  // corners span the cluster; the PN normals capture the local flank curvature so interior nodes ride the cusp).
  const P = (i: number): V3 => lift(rA, uv[2 * i], uv[2 * i + 1], H);
  let refFi = fis[0], refArea = -1;
  for (const fi of fis) {
    const [a, b, c] = tri[fi]; const A = P(a), B = P(b), C = P(c);
    const ar = norm(cross(sub(B, A), sub(C, A)));
    if (ar > refArea) { refArea = ar; refFi = fi; }
  }
  const [ra0, rb0, rc0] = tri[refFi];
  const seamU = (u: number, ref: number): number => { while (u - ref > 0.5) u -= 1; while (ref - u > 0.5) u += 1; return u; };
  const refU = uv[2 * ra0];
  const uvR0: [number, number] = [uv[2 * ra0], uv[2 * ra0 + 1]];
  const uvR1: [number, number] = [seamU(uv[2 * rb0], refU), uv[2 * rb0 + 1]];
  const uvR2: [number, number] = [seamU(uv[2 * rc0], refU), uv[2 * rc0 + 1]];
  const pn = buildPnPatch(rA, H, P(ra0), P(rb0), P(rc0), uvR0, uvR1, uvR2);
  // affine (u,t)->barycentric of the reference triangle so we can map ANY (u,t) in the cluster onto the PN patch.
  const bary = makeBaryMapper(uvR0, uvR1, uvR2);
  // lift a (u,t) inside the cluster onto the PN surface (clamped bary so PN eval stays on-patch); if the point maps
  // far outside the reference triangle, fall back to the analytic lift (still on the true surface).
  const pnLift = (u: number, t: number): V3 => {
    const su = seamU(u, refU);
    const [w0, w1, w2] = bary(su, t);
    if (w0 >= -0.25 && w1 >= -0.25 && w2 >= -0.25) { const cw0 = Math.max(0, w0), cw1 = Math.max(0, w1), cw2 = Math.max(0, w2); const s = cw0 + cw1 + cw2 || 1; return pn.eval(cw0 / s, cw1 / s, cw2 / s); }
    return lift(rA, u, t, H);
  };

  // interior nodes: place nInteriorTarget PN-lifted nodes at well-spread (u,t) positions inside the loop polygon
  // (uv-centroid + a small ring), each snapped onto the PN surface. Then fan-triangulate the polygon THROUGH the
  // interior nodes with a constrained-ear + centroid scheme that maximizes min-angle.
  const loopUV: Array<[number, number]> = loop.map((i) => [seamU(uv[2 * i], refU), uv[2 * i + 1]]);
  // uv centroid
  let cu = 0, ct = 0; for (const [u, t] of loopUV) { cu += u; ct += t; } cu /= m; ct /= m;
  const interiorIds: number[] = [];
  const addInterior = (u: number, t: number): number => { const Pp = pnLift(u, t); void Pp; const id = uv.length / 2; uv.push(((u % 1) + 1) % 1, t); return id; };
  // Note: we store (u,t) for the interior node (so liftMesh reproduces it on the TRUE surface). The PN patch is used
  // only to CHOOSE well-shaped positions; storing the analytic (u,t) keeps the node exactly on-surface (the honest
  // guard measures against the true surface, so the node MUST be a true-surface point, which lift(u,t) is by def).
  if (nInteriorTarget >= 1) interiorIds.push(addInterior(cu, ct));
  // a small ring of interior nodes between centroid and boundary for larger clusters
  const nRing = Math.max(0, Math.min(m, nInteriorTarget - 1));
  for (let k = 0; k < nRing; k++) {
    const [bu, bt] = loopUV[Math.floor((k / nRing) * m) % m];
    interiorIds.push(addInterior(cu + 0.45 * (bu - cu), ct + 0.45 * (bt - ct)));
  }
  const nInterior = interiorIds.length;

  // triangulate: connect each boundary edge to the NEAREST interior node (in uv), forming a fan from interior nodes.
  // This is a simple, robust, direct-emit scheme (no cdt2d). For nInterior===1 it is a pure fan (still far rounder
  // than the original needle wedge because the apex node sits at the uv-centroid, not on the crest tip).
  const out: Array<[number, number, number]> = [];
  const nearestInterior = (u: number, t: number): number => {
    let best = interiorIds[0], bd = Infinity;
    for (const id of interiorIds) { const d = (uv[2 * id] - u) ** 2 + (uv[2 * id + 1] - t) ** 2; if (d < bd) { bd = d; best = id; } }
    return best;
  };
  for (let k = 0; k < m; k++) {
    const a = loop[k], b = loop[(k + 1) % m];
    const [au, at] = loopUV[k], [bu, bt] = loopUV[(k + 1) % m];
    const mid_u = (au + bu) / 2, mid_t = (at + bt) / 2;
    const c = nearestInterior(mid_u, mid_t);
    if (a !== b && a !== c && b !== c) out.push([a, b, c]);
  }
  // if more than one interior node, connect adjacent interior nodes to the centroid to close the interior region.
  if (nInterior > 1) {
    const centre = interiorIds[0];
    for (let k = 1; k < nInterior; k++) {
      const a = interiorIds[k], b = interiorIds[(k % (nInterior - 1)) + 1];
      if (a !== b && a !== centre && b !== centre) out.push([centre, a, b]);
    }
  }
  return { tris: out, nInterior };
}

function bedges_len(b: Array<[number, number]>): number { return b.length; }

// ── LEVER 13a — ELEMENT-LEVEL DECISIVE TEST: PN-flip on needle pairs ─────────────────────────────────────────────
// The cheapest discriminator for "does a CURVED element let a ROUNDER cell ride the crest cusp within tol". For each
// internal edge shared by two adjacent NEAR-APEX needle facets, consider the FLIP (2 needles -> 2 rounder tris on the
// other diagonal). A flat flip REOPENS outliers (V2-§3b: the flat chord bridges the cusp). Here we score the FLIPPED
// pair's interior deviation TWO ways: (a) FLAT chord (the flat sub-triangle that will actually be emitted for STL),
// and (b) the CURVED one-sided PN patch (the curved element that follows the cusp). If (b) <= tol while (a) > tol,
// the curved element genuinely rides the cusp — but the honest STL question is (a) with a FEW flat sub-triangles.
// We report: for each candidate flip, minAngle before/after, flat-dev, PN-dev, and how many flat sub-tris (uniform
// 1->k^2 tessellation of the flipped curved facet) are needed to bring the FLAT sub-tri dev <= tol, and the WORST
// min-angle of that flat sub-tessellation (the sliver the STL actually carries). This decides the lever WITHOUT the
// full watertight rebuild: if reaching flat-dev<=tol requires a sub-tessellation whose worst sub-tri is STILL a
// needle, the curved element cannot co-satisfy fidelity+angle at the zero-width apex (REFUTE at the element level).
export interface PnFlipStat {
  nPairs: number; nRounder: number;                 // candidate flips that improve min-angle
  nScored: number;                                   // rounder pairs actually device-scored (sampleCap)
  nPnRidesFlat: number;                             // flips where PN-curved dev<=tol but FLAT chord dev>tol
  nFlatWithinTol: number;                           // flips where even the FLAT chord is within tol
  worstMinAngleBefore: { p10: number; p50: number };
  flippedMinAngle: { p10: number; p50: number };    // min-angle of the flipped FLAT triangles
  flatDev: { p50: number; p90: number };            // flipped-facet FLAT chord true-3D dev (mm)
  pnDev: { p50: number; p90: number };              // flipped-facet CURVED PN patch true-3D dev (mm)
  tol: number;
}
export function pnFlipDiscriminator(
  patch: PatchDef, uv: number[], tris: number[], opts: { angThresh: number; gradUThresh: number; tol: number; sampleCap?: number },
  brute: (P: V3) => number,
): PnFlipStat {
  const sampleCap = opts.sampleCap ?? 200; // score at most this many rounder pairs with the expensive sub-tess (representative)
  const { rA, H } = patch;
  const P = (i: number): V3 => lift(rA, uv[2 * i], uv[2 * i + 1], H);
  const seamU = (u: number, ref: number): number => { while (u - ref > 0.5) u -= 1; while (ref - u > 0.5) u += 1; return u; };
  const minAng = (a: number, b: number, c: number): number => triMinAngleDeg(P(a), P(b), P(c));
  const isTarget = (a: number, b: number, c: number): boolean => {
    if (minAng(a, b, c) >= opts.angThresh) return false;
    const um = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, tm = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
    return gradU(rA, H, um, tm) > opts.gradUThresh;
  };
  // build edge -> incident target-facet list
  const nF = tris.length / 3;
  const edgeMap = new Map<string, number[]>();
  const target = new Array<boolean>(nF);
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    target[f] = isTarget(a, b, c);
    if (!target[f]) continue;
    for (const [i, j] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) { const k = i < j ? `${i}_${j}` : `${j}_${i}`; const arr = edgeMap.get(k); if (arr) arr.push(f); else edgeMap.set(k, [f]); }
  }
  // sample the flat chord OR PN patch of a triangle: worst interior dev over a barycentric lattice.
  const bary = interiorBary(3); // ~7 interior/edge-mid pts — enough to catch the cusp chord (direction discriminator)
  const flatDev = (A: V3, B: V3, C: V3): number => { let mx = 0; for (const [w0, w1, w2] of bary) { const Q: V3 = [w0 * A[0] + w1 * B[0] + w2 * C[0], w0 * A[1] + w1 * B[1] + w2 * C[1], w0 * A[2] + w1 * B[2] + w2 * C[2]]; const d = brute(Q); if (d > mx) mx = d; } return mx; };
  const pnDevOf = (ia: number, ib: number, ic: number): number => {
    const refU = uv[2 * ia];
    const uvA: [number, number] = [uv[2 * ia], uv[2 * ia + 1]];
    const uvB: [number, number] = [seamU(uv[2 * ib], refU), uv[2 * ib + 1]];
    const uvC: [number, number] = [seamU(uv[2 * ic], refU), uv[2 * ic + 1]];
    const pn = buildPnPatch(rA, H, P(ia), P(ib), P(ic), uvA, uvB, uvC);
    let mx = 0; for (const [w0, w1, w2] of bary) { const Q = pn.eval(w0, w1, w2); const d = brute(Q); if (d > mx) mx = d; } return mx;
  };
  const beforeMin: number[] = [], flippedMin: number[] = [], flatDevs: number[] = [], pnDevs: number[] = [];
  let nPairs = 0, nRounder = 0, nScored = 0, nPnRides = 0, nFlatOk = 0;
  const seen = new Set<string>();
  for (const [k, fs] of edgeMap) {
    if (fs.length !== 2) continue; if (seen.has(k)) continue; seen.add(k);
    const [f0, f1] = fs;
    const [ei, ej] = k.split('_').map(Number);
    const opp = (f: number): number => { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; return a !== ei && a !== ej ? a : b !== ei && b !== ej ? b : c; };
    const p = opp(f0), q = opp(f1);
    if (p === q) continue;
    nPairs++;
    const bMin = Math.min(minAng(ei, ej, p), minAng(ei, ej, q));
    const fMin = Math.min(minAng(p, q, ei), minAng(p, q, ej)); // flipped pair (p,q,ei)+(p,q,ej)
    beforeMin.push(bMin);
    if (fMin > bMin + 1) {
      nRounder++; flippedMin.push(fMin);
      if (nScored >= sampleCap) continue;
      nScored++;
      // FLAT chord dev (the flat sub-triangle STL emits) vs CURVED PN patch dev (the curved element).
      const fd = Math.max(flatDev(P(p), P(q), P(ei)), flatDev(P(p), P(q), P(ej)));
      const pd = Math.max(pnDevOf(p, q, ei), pnDevOf(p, q, ej));
      flatDevs.push(fd); pnDevs.push(pd);
      if (fd <= opts.tol) nFlatOk++;
      if (pd <= opts.tol && fd > opts.tol) nPnRides++;
    }
  }
  const pc = (arr: number[], p: number): number => { if (!arr.length) return 0; const s = arr.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(4); };
  return {
    nPairs, nRounder, nScored, nPnRidesFlat: nPnRides, nFlatWithinTol: nFlatOk,
    worstMinAngleBefore: { p10: pc(beforeMin, 0.1), p50: pc(beforeMin, 0.5) },
    flippedMinAngle: { p10: pc(flippedMin, 0.1), p50: pc(flippedMin, 0.5) },
    flatDev: { p50: pc(flatDevs, 0.5), p90: pc(flatDevs, 0.9) },
    pnDev: { p50: pc(pnDevs, 0.5), p90: pc(pnDevs, 0.9) },
    tol: opts.tol,
  };
}

// interior barycentric lattice (strictly interior + edge mids), n = subdivisions.
function interiorBary(n: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 1; i < n; i++) for (let j = 1; j < n - i; j++) out.push([1 - (i + j) / n, i / n, j / n]);
  out.push([0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]);
  return out;
}

// affine barycentric mapper for a reference triangle in (u,t): returns (w0,w1,w2) for a query (u,t).
function makeBaryMapper(A: [number, number], B: [number, number], C: [number, number]): (u: number, t: number) => [number, number, number] {
  const v0u = B[0] - A[0], v0t = B[1] - A[1], v1u = C[0] - A[0], v1t = C[1] - A[1];
  const den = v0u * v1t - v1u * v0t || 1e-12;
  return (u: number, t: number): [number, number, number] => {
    const v2u = u - A[0], v2t = t - A[1];
    const w1 = (v2u * v1t - v1u * v2t) / den;
    const w2 = (v0u * v2t - v2u * v0t) / den;
    const w0 = 1 - w1 - w2;
    return [w0, w1, w2];
  };
}
