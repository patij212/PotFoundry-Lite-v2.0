// s104SplitFoldRender.ts — THE PICTURE OF THE FOLD. Visual evidence for S82 §2.3.
//
// The claim under test is MINE and it is the most contestable thing in S82: the mesher's split rule turns
// 24.55% of the children it makes on Voronoi INSIDE OUT, because the "put the vertex on the surface" lift
// is mostly IN-PLANE on a near-radial facet and can push the new vertex past the opposite edge. It rests
// on two numeric certificates — `rho > 90 deg` against the parent normal, and `sum(child area)/parent area
// = 1.2508 > 1`, which is a PROOF of non-tiling because a planar 1->2 split conserves area exactly — and
// on no picture at all. The brief's rule is "if a render disagrees with a metric, trust the render", so
// the render has to exist before the metric is allowed to stand.
//
// THREE PANELS over the SAME patch of the SAME mesh:
//   A  the patch as built (flat-shaded, no colours)
//   B  after the mesher's split rule (P0 param-lift), every child coloured by rho = angle(n_child, n_par)
//   C  after the guarded rule (P4), same colouring, same scale
// Colour scale is the SAME for B and C and is stated in the meta: green 0 deg -> yellow 45 -> red 90 ->
// MAGENTA above 90 (a folded child). If B is speckled magenta and C is not, the fold is real and the guard
// works. If B has no magenta, my §2.3 is wrong and I retract it.
//
// The split is applied per-facet WITHOUT a conformity closure — this is a picture, not a mesh. The
// T-junctions it leaves are ~dPerp (sub-micron) and invisible at patch scale; nothing here is a mesh
// suitable for anything but looking at.
//
// Usage: bash research/tools/run-s104-split-fold-render.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dumpRenderBins } from '../bridge/labkit';
import { mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S104_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S104_STEM ?? 's60flip/voronoi_ring_D--_A2CON';
const TAG = process.env.PF_S104_TAG ?? 'V';
const ZLO = envF('PF_S104_ZLO', 58);
const ZHI = envF('PF_S104_ZHI', 62);
const THW = envF('PF_S104_THW', 0.10);              // half-width in radians about theta=0
const DIMS: StyleDims = { H: envF('PF_S104_H', 120), Rb: envF('PF_S104_RB', 40), Rt: envF('PF_S104_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s104fold';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
mkdirSync(OUTDIR, { recursive: true });
log('===== S104 — THE PICTURE OF THE FOLD =====');

const { xyz, nTri } = readMeshFloat64(`research/exchange/_strataConformBisect/${STEM}.stl`, false);
log(`${nTri} facets read`);

// ── WHOLE-MESH FOLD CENSUS FIRST. The first patch I picked returned 0 folds in 288 children where S101
// says 7.5% of a uniform sample fold. Two of my own measurements disagreed, so the census settles it and
// the patch is then AUTO-SELECTED around the densest fold cluster instead of at a window I chose.
const foldMark = new Uint8Array(nTri);
{
  let inv = 0; let nCh = 0; let aPar = 0; let aCh = 0;
  const zH = new Float64Array(24); const zHn = new Float64Array(24);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const V = [[xyz[o], xyz[o + 1], xyz[o + 2]], [xyz[o + 3], xyz[o + 4], xyz[o + 5]], [xyz[o + 6], xyz[o + 7], xyz[o + 8]]];
    const ux = V[1][0] - V[0][0]; const uy = V[1][1] - V[0][1]; const uz = V[1][2] - V[0][2];
    const wx = V[2][0] - V[0][0]; const wy = V[2][1] - V[0][1]; const wz = V[2][2] - V[0][2];
    let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const parArea = 0.5 * nl; nx /= nl; ny /= nl; nz /= nl;
    // NO per-facet outward flip: rho compares the parent's RAW WINDING normal with the children's RAW
    // WINDING normals, which are in the same family by construction. Flipping only the parent (the first
    // version of this file) turns every INWARD-winding facet into a false "fold" — measured 43.44% in the
    // fold-dense patch, i.e. it was counting the winding, not the fold. S101 never had this because it
    // fixes the winding ONCE globally and then never flips per facet.
    const eL = [0, 1, 2].map((e) => { const a = V[e]; const b = V[(e + 1) % 3]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); });
    let e = 0; if (eL[1] > eL[e]) e = 1; if (eL[2] > eL[e]) e = 2;
    const U = V[e]; const W2 = V[(e + 1) % 3]; const Wp = V[(e + 2) % 3];
    const fx2 = (U[0] + W2[0]) / 2; const fy2 = (U[1] + W2[1]) / 2; const fz2 = (U[2] + W2[2]) / 2;
    const thU2 = Math.atan2(U[1], U[0]);
    const thM2 = thU2 + dThRaw(thU2, Math.atan2(W2[1], W2[0])) / 2;
    const rM2 = rA(thM2, Math.min(H, Math.max(0, fz2)));
    const M2 = [rM2 * Math.cos(thM2), rM2 * Math.sin(thM2), fz2];
    aPar += parArea;
    let bad = 0;
    for (const K of [[U, M2, Wp], [M2, W2, Wp]]) {
      const a1 = K[1][0] - K[0][0]; const a2 = K[1][1] - K[0][1]; const a3 = K[1][2] - K[0][2];
      const b1 = K[2][0] - K[0][0]; const b2 = K[2][1] - K[0][1]; const b3 = K[2][2] - K[0][2];
      let cx = a2 * b3 - a3 * b2; let cy = a3 * b1 - a1 * b3; let cz = a1 * b2 - a2 * b1;
      const cl = Math.hypot(cx, cy, cz); if (!(cl > 0)) continue;
      aCh += 0.5 * cl; cx /= cl; cy /= cl; cz /= cl; nCh += 1;
      let d = nx * cx + ny * cy + nz * cz; d = d > 1 ? 1 : d < -1 ? -1 : d;
      if (Math.acos(d) > Math.PI / 2) { inv += 1; bad += 1; }
    }
    if (bad > 0) { foldMark[t] = 1; const zb = Math.min(23, Math.max(0, Math.floor((V[0][2] / H) * 24))); zH[zb] += 1; }
    { const zb = Math.min(23, Math.max(0, Math.floor((V[0][2] / H) * 24))); zHn[zb] += 1; }
  }
  log(`WHOLE-MESH FOLD CENSUS (every facet virtually split by the mesher rule):`);
  log(`   INVERTED children ${inv}/${nCh} = ${((100 * inv) / Math.max(1, nCh)).toFixed(3)}%   parents with >=1 folded child ${((100 * foldMark.reduce((a2, b2) => a2 + b2, 0)) / nTri).toFixed(3)}%   area(ch)/area(par) ${(aCh / aPar).toFixed(5)}`);
  let s2 = 'z-histogram of folding parents (24 bins, % of facets in bin): ';
  for (let i = 0; i < 24; i += 1) s2 += `${((100 * zH[i]) / Math.max(1, zHn[i])).toFixed(0)} `;
  log(`   ${s2}`);
}

// ── AUTO-SELECT the patch at the DENSEST FOLD CLUSTER. My hand-picked window (z 58-62, theta ~ 0) returned
// 0/288 — it sat in the theta=0 SEAM COLUMN, which is a structured strip and folds nowhere. Choosing the
// window by hand is how you get a picture that agrees with whatever you wanted; the grid picks it now.
let zlo = ZLO; let zhi = ZHI; let thc = 0;
{
  const NTH = 96; const NZ = 32;
  const cnt = new Int32Array(NTH * NZ);
  for (let t = 0; t < nTri; t += 1) {
    if (foldMark[t] === 0) continue;
    const o = t * 9;
    const cx2 = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3; const cy2 = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
    const cz2 = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    let th = Math.atan2(cy2, cx2); if (th < 0) th += 2 * Math.PI;
    const i = Math.min(NTH - 1, Math.floor((th / (2 * Math.PI)) * NTH));
    const j = Math.min(NZ - 1, Math.max(0, Math.floor((cz2 / H) * NZ)));
    cnt[i * NZ + j] += 1;
  }
  let best = -1; let bi = 0; let bj = 0;
  for (let i = 0; i < NTH; i += 1) for (let j = 0; j < NZ; j += 1) if (cnt[i * NZ + j] > best) { best = cnt[i * NZ + j]; bi = i; bj = j; }
  thc = ((bi + 0.5) / NTH) * 2 * Math.PI;
  const zc = ((bj + 0.5) / NZ) * H; const zsp = envF('PF_S104_ZSPAN', H / NZ);
  zlo = zc - zsp / 2; zhi = zc + zsp / 2;
  log(`AUTO-PATCH at the densest fold cell: theta ${(thc).toFixed(4)} rad, z [${zlo.toFixed(1)}, ${zhi.toFixed(1)}], ${best} folding parents in it`);
}

// ── select the patch (all three corners inside the window)
const sel: number[] = [];
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9; let ok = true;
  for (let v = 0; v < 3; v += 1) {
    const x = xyz[o + 3 * v]; const y = xyz[o + 3 * v + 1]; const z = xyz[o + 3 * v + 2];
    const th = Math.atan2(y, x);
    if (z < zlo || z > zhi || Math.abs(dThRaw(thc, th)) > THW) { ok = false; break; }
  }
  if (ok) sel.push(t);
}
log(`patch: ${sel.length} facets in z[${zlo.toFixed(1)},${zhi.toFixed(1)}] theta ${thc.toFixed(4)} +-${THW} rad`);
if (sel.length === 0) { log('EMPTY PATCH — widen the window'); process.exit(1); }

/** green 0 -> yellow 45 -> red 90 -> MAGENTA above 90 (a folded child). */
function rhoColor(deg: number, out: Float32Array, o: number): void {
  if (deg > 90) { out[o] = 1; out[o + 1] = 0; out[o + 2] = 1; return; }   // magenta = INVERTED
  const u = Math.max(0, Math.min(1, deg / 90));
  const r = u < 0.5 ? 2 * u : 1;
  const g = u < 0.5 ? 1 : 2 * (1 - u);
  out[o] = r; out[o + 1] = g; out[o + 2] = 0.08;
}

// ── panel A: the patch as built
{
  const P = new Float32Array(sel.length * 9); const I = new Uint32Array(sel.length * 3);
  for (let k = 0; k < sel.length; k += 1) {
    const o = sel[k] * 9;
    for (let i = 0; i < 9; i += 1) P[9 * k + i] = xyz[o + i];
    for (let e = 0; e < 3; e += 1) I[3 * k + e] = 3 * k + e;
  }
  dumpRenderBins(OUTDIR, `${TAG}_A_asbuilt`, P, I, { meta: { note: 'patch as built (flat shade, no colours)', tris: sel.length } });
  log(`A: ${sel.length} facets`);
}

// ── panels B and C: split every patch facet on its longest edge, colour each child by rho
function buildSplit(guarded: boolean, name: string): void {
  const P = new Float32Array(sel.length * 18); const I = new Uint32Array(sel.length * 6);
  const C = new Float32Array(sel.length * 18);
  let nOut = 0; let inv = 0; let areaPar = 0; let areaCh = 0;
  const col = new Float32Array(3);
  for (const t of sel) {
    const o = t * 9;
    const V = [
      [xyz[o], xyz[o + 1], xyz[o + 2]],
      [xyz[o + 3], xyz[o + 4], xyz[o + 5]],
      [xyz[o + 6], xyz[o + 7], xyz[o + 8]]];
    // parent normal (outward)
    const ux = V[1][0] - V[0][0]; const uy = V[1][1] - V[0][1]; const uz = V[1][2] - V[0][2];
    const wx = V[2][0] - V[0][0]; const wy = V[2][1] - V[0][1]; const wz = V[2][2] - V[0][2];
    let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const parArea = 0.5 * nl; nx /= nl; ny /= nl; nz /= nl;
    const eL = [0, 1, 2].map((e) => {
      const a = V[e]; const b = V[(e + 1) % 3];
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    });
    let e = 0; if (eL[1] > eL[e]) e = 1; if (eL[2] > eL[e]) e = 2;
    const iu = e; const iv = (e + 1) % 3; const iw = (e + 2) % 3;
    const U = V[iu]; const W2 = V[iv]; const Wp = V[iw];
    const fx = (U[0] + W2[0]) / 2; const fy = (U[1] + W2[1]) / 2; const fz = (U[2] + W2[2]) / 2;
    const thU = Math.atan2(U[1], U[0]);
    const thM = thU + dThRaw(thU, Math.atan2(W2[1], W2[0])) / 2;
    const zM = fz;
    const rM = rA(thM, Math.min(H, Math.max(0, zM)));
    let Mx = rM * Math.cos(thM); let My = rM * Math.sin(thM); let Mz = zM;
    const dp = (Mx - fx) * nx + (My - fy) * ny + (Mz - fz) * nz;
    if (guarded) {
      const qx = Mx - dp * nx; const qy = My - dp * ny; const qz = Mz - dp * nz;
      const sA = (A: number[], Bq: number[], Cq: number[]): number => {
        const a1 = Bq[0] - A[0]; const a2 = Bq[1] - A[1]; const a3 = Bq[2] - A[2];
        const b1 = Cq[0] - A[0]; const b2 = Cq[1] - A[1]; const b3 = Cq[2] - A[2];
        return 0.5 * ((a2 * b3 - a3 * b2) * nx + (a3 * b1 - a1 * b3) * ny + (a1 * b2 - a2 * b1) * nz);
      };
      const s1 = sA(U, [qx, qy, qz], Wp); const s2 = sA([qx, qy, qz], W2, Wp);
      const half = 0.5 * parArea;
      if (!(s1 >= 0.5 * half && s2 >= 0.5 * half)) { Mx = fx + dp * nx; My = fy + dp * ny; Mz = fz + dp * nz; }
    }
    const M = [Mx, My, Mz];
    const kids = [[U, M, Wp], [M, W2, Wp]];
    areaPar += parArea;
    for (const K of kids) {
      const a1 = K[1][0] - K[0][0]; const a2 = K[1][1] - K[0][1]; const a3 = K[1][2] - K[0][2];
      const b1 = K[2][0] - K[0][0]; const b2 = K[2][1] - K[0][1]; const b3 = K[2][2] - K[0][2];
      let cx = a2 * b3 - a3 * b2; let cy = a3 * b1 - a1 * b3; let cz = a1 * b2 - a2 * b1;
      const cl = Math.hypot(cx, cy, cz); if (!(cl > 0)) continue;
      areaCh += 0.5 * cl; cx /= cl; cy /= cl; cz /= cl;
      let d = nx * cx + ny * cy + nz * cz; d = d > 1 ? 1 : d < -1 ? -1 : d;
      const deg = (Math.acos(d) * 180) / Math.PI;
      if (deg > 90) inv += 1;
      rhoColor(deg, col, 0);
      for (let v = 0; v < 3; v += 1) {
        P[3 * (3 * nOut + v)] = K[v][0]; P[3 * (3 * nOut + v) + 1] = K[v][1]; P[3 * (3 * nOut + v) + 2] = K[v][2];
        C[3 * (3 * nOut + v)] = col[0]; C[3 * (3 * nOut + v) + 1] = col[1]; C[3 * (3 * nOut + v) + 2] = col[2];
        I[3 * nOut + v] = 3 * nOut + v;
      }
      nOut += 1;
    }
  }
  dumpRenderBins(OUTDIR, name, P.subarray(0, nOut * 9), I.subarray(0, nOut * 3), {
    colors: C.slice(0, nOut * 9),
    meta: {
      note: `${guarded ? 'P4 GUARDED' : 'P0 MESHER'} split, colour = rho(child,parent): green 0 / yellow 45 / red 90 / MAGENTA >90 = INVERTED`,
      tris: nOut, invertedChildren: inv, invertedPct: (100 * inv) / Math.max(1, nOut),
      areaChildOverParent: areaCh / Math.max(1e-30, areaPar),
    },
  });
  log(`${name}: ${nOut} children, INVERTED ${inv} (${((100 * inv) / Math.max(1, nOut)).toFixed(2)}%), area(ch)/area(par) ${(areaCh / Math.max(1e-30, areaPar)).toFixed(4)}`);
}
buildSplit(false, `${TAG}_B_mesher_P0`);
buildSplit(true, `${TAG}_C_guarded_P4`);
log('');
log(`bins in ${OUTDIR} — render with:`);
log(`  PF_RENDER_CELL=1100 NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs ${OUTDIR}/S104_fold.png ${OUTDIR} 3 ${TAG}_A_asbuilt ${TAG}_B_mesher_P0 ${TAG}_C_guarded_P4`);
