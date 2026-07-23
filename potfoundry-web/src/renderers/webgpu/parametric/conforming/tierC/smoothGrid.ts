// smoothGrid.ts — SMOOTH-STYLE STRUCTURED-GRID EMITTER (E-2026-07-22 certifiable-production-mesh campaign).
//
// For C∞ smooth styles (HarmonicRipple, SuperellipseMorph, FourierBloom, SpiralRidges, SuperformulaBlossom,
// WaveInterference) a uniform (u,t) grid on the exact analytic surface, at the density that makes the chord sag ≤ tol,
// closes whole-mesh true-3D ≤0.01mm AND is JUDGE-CERTIFIABLE by the exact-dyadic partition (its columns sit on u=i/nU,
// power-of-two ⇒ exact dyadic snap). This is the certifiable production path for the smooth-style class — the
// free-Delaunay conforming mesher carries non-dyadic float stations and cannot be exact-dyadic certified.
// Measured (research/lab/2026-07-22-certifiable-production-mesh-campaign.md): all 6 smooth styles close ≤0.01 + judge
// ACCEPT on the tapered production geometry (SFB 65k → SR ~4M tris by shape).
//
// Watertight BY CONSTRUCTION (u-seam welded by index) + emergent rim counts (nU) that WatertightAssembly adopts (it
// pins the inner wall to outer.bottomRing.length, exactly as for the DS cone-fan). Flag-gated + byte-identical off:
// no default caller (the ParametricExportComputer dispatch only invokes this under __pfSmoothGrid + __pfPerfectMesher).
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import type { ConformingOuterWallResult } from '../ConformingOuterWall';

const TAU = 2 * Math.PI;

/** An explicit-XYZ uniform structured cylinder grid + its (u,t) provenance + rims. */
export interface SmoothGridWall {
  /** Flat xyz (3 per vertex). */
  vertices: Float32Array;
  /** Flat triangle vertex indices (3 per face). */
  indices: Uint32Array;
  /** Flat (u,t) per vertex (index-aligned; u ∈ [0,1), t ∈ [0,1]). */
  ut: number[];
  /** Circumferential column count. */
  nU: number;
  /** Row count. */
  nT: number;
  /** Ordered t=0 rim vertex indices (ascending u). */
  bottomRing: number[];
  /** Ordered t=1 rim vertex indices (ascending u). */
  topRing: number[];
}

/**
 * Emit a uniform structured periodic cylinder grid of `nU` circumferential columns × `nT` rows, lifted through `rA`.
 * Columns at u=i/nU (full 2π, u-seam welded by index → watertight cylinder), rows at t=j/(nT−1). Every quad is split
 * (a,b,c)+(a,c,d) — CCW in (u,t) = outward normal on this increasing-u/increasing-t cylinder.
 */
export function buildSmoothGridWall(rA: AnalyticRadiusFn, H: number, nU: number, nT: number): SmoothGridWall {
  const cols = Math.max(3, Math.floor(nU));
  const rows = Math.max(2, Math.floor(nT));
  const positions: number[] = [];
  const ut: number[] = [];
  const grid = new Int32Array(rows * cols);
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const z = t * H;
    for (let i = 0; i < cols; i++) {
      const u = i / cols;
      const th = TAU * u;
      const r = rA(th, z);
      grid[j * cols + i] = positions.length / 3;
      positions.push(r * Math.cos(th), r * Math.sin(th), z);
      ut.push(u, t);
    }
  }
  const triangles: number[] = [];
  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const iN = i + 1 === cols ? 0 : i + 1;
      const a = grid[j * cols + i], b = grid[j * cols + iN], c = grid[(j + 1) * cols + iN], d = grid[(j + 1) * cols + i];
      triangles.push(a, b, c, a, c, d);
    }
  }
  const bottomRing: number[] = [];
  const topRing: number[] = [];
  for (let i = 0; i < cols; i++) {
    bottomRing.push(grid[i]);
    topRing.push(grid[(rows - 1) * cols + i]);
  }
  return { vertices: new Float32Array(positions), indices: new Uint32Array(triangles), ut, nU: cols, nT: rows, bottomRing, topRing };
}

/**
 * Pack a {@link SmoothGridWall} into the {@link ConformingOuterWallResult} the region dispatch + WatertightAssembly
 * consume (stores (u,t,0) — the downstream single-valued lift reproduces the xyz exactly, as the surface is smooth so
 * no vertex sits at a discontinuity), the structured index buffer, per-face seam flags by u-span, and the t=0/t=1 rims.
 */
export function smoothGridWallToOuterWall(wall: SmoothGridWall): ConformingOuterWallResult {
  const nV = wall.ut.length / 2;
  const vertices = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    vertices[3 * i] = wall.ut[2 * i];
    vertices[3 * i + 1] = wall.ut[2 * i + 1];
    vertices[3 * i + 2] = 0;
  }
  const nF = wall.indices.length / 3;
  const seamTriangles = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const ua = vertices[3 * wall.indices[3 * f]];
    const ub = vertices[3 * wall.indices[3 * f + 1]];
    const uc = vertices[3 * wall.indices[3 * f + 2]];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) seamTriangles[f] = 1;
  }
  return { vertices, indices: wall.indices, seamTriangles, gridVertexCount: nV, bottomRing: wall.bottomRing, topRing: wall.topRing };
}

/** Optional knobs for {@link deriveSmoothGridDensity}. */
export interface SmoothGridDensityOpts {
  probeRes?: number;
  minNU?: number;
  maxNU?: number;
  minNT?: number;
  maxNT?: number;
  /** Safety factor on the derived density (accounts for the coarse 2nd-difference sag estimate). Default 1.5. */
  safety?: number;
  /**
   * FACET-ALIGNED column snapping. When set, `nU` is snapped to the NEAREST multiple of `alignNU`
   * (near the sag-derived raw density) instead of rounded UP to a power of two. For a faceted style
   * whose static edges tile the circumference exactly (LowPolyFacet: 12 facets ⇒ sharp edges at
   * u=odd/24 ⇒ `alignNU=24`) this LANDS grid columns on the edges AND the face centers, so the flat
   * faces close at far lower density than pow2 (whose columns STRADDLE the edges — MAX floors ~0.044
   * at nU=1024, needs 8192/2.08M-tris to close). Absent ⇒ the power-of-two path (the exact-dyadic
   * snap the C∞ smooth styles cert against) — byte-identical.
   */
  alignNU?: number;
}

/** Golden ratio — decorrelates the stage-1 intra-quad u-phase from the power-of-two column lattice (see below). */
const STAGE1_SHEAR = 0.618033988749895;

/**
 * The TRUE worst flat-TRIANGLE chord of the smooth grid at (nU,nT): the maximum perpendicular distance from an
 * analytic surface sample to the ACTUAL mesh triangle plane whose (u,t) cell the sample lands in. The separable
 * second-difference sag law {@link deriveSmoothGridDensity} seeds from only PREDICTS this and under-picks `nU` for
 * fine/oblique/2D azimuthal relief; this MEASURES the emitted mesh's chord directly so the derivation can bump
 * density until it is ≤ tol. The triangulation matches {@link buildSmoothGridWall}: quad (i,j) splits on the
 * c00→c11 diagonal into T1=(c00,c10,c11) and T2=(c00,c11,c01); a sample lands in T1 iff its intra-quad fu≥ft.
 *
 * TWO-STAGE (accuracy + bounded cost):
 *   - STAGE 1 (coarse LOCATE only): a FIXED 640×512 (u,t) surface grid (independent of nU/nT ⇒ bounded), cell-centered
 *     and GOLDEN-ROW-SHEARED in u, tracking the TOP-K highest-chord samples. Its only job is to find the crest
 *     regions (accuracy comes from stage 2), so a modest resolution far above the relief's azimuthal Nyquist suffices.
 *     The shear is LOAD-BEARING: an un-sheared fixed grid whose u-resolution shares a factor with the power-of-two
 *     `nU` lands EVERY sample on a column boundary (fu≡0, e.g. u=a/1024 with nU=2048 ⇒ floor(u·nU)=2a, fu=0), where the
 *     surface passes through the mesh edge ⇒ chord≈0 ⇒ the scan is BLIND to the intra-column crest sag that IS the gap.
 *     The per-row golden shear moves successive rows to varied intra-quad u-phases so the crest is sampled near its peak.
 *   - STAGE 2 (local refine): a ±4-quad block of ACTUAL mesh quads around EACH distinct top-K location, sampled on a
 *     dense 5×5 interior grid (both triangles) against the true triangle plane — nails the exact worst facet at mesh
 *     resolution. Refining the top-K (not just the single argmax) catches the true worst facet even when it sits on a
 *     secondary crest; over-samples measureProjectorMax's 4-point-per-triangle chord, so it agrees within ~6%.
 */
export function worstSmoothFacetChord(rA: AnalyticRadiusFn, H: number, nU: number, nT: number): number {
  const cols = Math.max(3, Math.floor(nU));
  const rows = Math.max(2, Math.floor(nT));
  const cellT = 1 / (rows - 1);
  const N = cols * rows;
  // Precompute the lifted vertex grid when it is CHEAPER than lifting corners on the fly (flat, no per-sample re-lift ⇒
  // the stage-1 loop does 1 lift/sample + array reads instead of 5). Crossover: precompute = N + (S1U·S1T) lifts vs
  // on-the-fly = 5·(S1U·S1T) lifts ⇒ precompute wins when N ≤ 4·S1U·S1T (≈1.31M for the 640×512 scan). Above that a
  // large grid stays on the fly so the per-call cost is BOUNDED by the fixed 5·S1U·S1T stage-1 lifts (< ~1.65M).
  let gx: Float64Array | null = null;
  let gy: Float64Array | null = null;
  let gz: Float64Array | null = null;
  if (N <= 1_300_000) {
    gx = new Float64Array(N);
    gy = new Float64Array(N);
    gz = new Float64Array(N);
    for (let j = 0; j < rows; j++) {
      const z = j * cellT * H;
      for (let i = 0; i < cols; i++) {
        const th = (TAU * i) / cols, r = rA(th, z), o = j * cols + i;
        gx[o] = r * Math.cos(th);
        gy[o] = r * Math.sin(th);
        gz[o] = z;
      }
    }
  }
  const cor = new Float64Array(12); // c00 | c10 | c01 | c11 (3 each)
  const setCorner = (base: number, i: number, j: number): void => {
    const ii = i === cols ? 0 : i; // periodic wrap: column `cols` ≡ column 0 (rA is 2π-periodic)
    if (gx && gy && gz) {
      const o = j * cols + ii;
      cor[base] = gx[o];
      cor[base + 1] = gy[o];
      cor[base + 2] = gz[o];
    } else {
      const th = (TAU * ii) / cols, z = j * cellT * H, r = rA(th, z);
      cor[base] = r * Math.cos(th);
      cor[base + 1] = r * Math.sin(th);
      cor[base + 2] = z;
    }
  };
  // Perpendicular distance from P=(px,py,pz) to the plane of the triangle whose corners are at offsets ai,bi,ci in `cor`.
  const planeDist = (px: number, py: number, pz: number, ai: number, bi: number, ci: number): number => {
    const ax = cor[ai], ay = cor[ai + 1], az = cor[ai + 2];
    const ux = cor[bi] - ax, uy = cor[bi + 1] - ay, uz = cor[bi + 2] - az;
    const vx = cor[ci] - ax, vy = cor[ci + 1] - ay, vz = cor[ci + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    return nl < 1e-20 ? 0 : Math.abs((px - ax) * nx + (py - ay) * ny + (pz - az) * nz) / nl;
  };
  // STAGE 1 — golden-sheared, cell-centered 640×512 scan (see the load-bearing-shear note above). Track the TOP-K
  // highest-chord samples (not just the single argmax): at bumped density the true worst facet can sit on a SECONDARY
  // crest outside the global argmax's refine window, so refining only the argmax UNDER-reads the ruler (~7% measured
  // on SpiralRidges/HexagonalHive). Refining every distinct top-K crest closes that gap.
  const S1U = 640, S1T = 512;
  const K = 32;
  const tkChord = new Float64Array(K).fill(-1);
  const tkU = new Float64Array(K);
  const tkT = new Float64Array(K);
  let tkMin = 0; // slot index of the smallest tracked chord
  for (let b = 0; b < S1T; b++) {
    const t = (b + 0.5) / S1T;
    const shear = STAGE1_SHEAR * b;
    const jj = Math.min(rows - 2, Math.floor(t * (rows - 1)));
    const ft = t * (rows - 1) - jj;
    const z = t * H;
    for (let a = 0; a < S1U; a++) {
      let u = (a + 0.5) / S1U + shear;
      u -= Math.floor(u);
      const i = Math.min(cols - 1, Math.floor(u * cols));
      setCorner(0, i, jj);
      setCorner(3, i + 1, jj);
      setCorner(6, i, jj + 1);
      setCorner(9, i + 1, jj + 1);
      const th = TAU * u, r = rA(th, z), px = r * Math.cos(th), py = r * Math.sin(th);
      const fu = u * cols - i;
      const d = fu >= ft ? planeDist(px, py, z, 0, 3, 9) : planeDist(px, py, z, 0, 9, 6);
      if (d > tkChord[tkMin]) {
        tkChord[tkMin] = d; tkU[tkMin] = u; tkT[tkMin] = t;
        let mi = 0;
        for (let k = 1; k < K; k++) if (tkChord[k] < tkChord[mi]) mi = k;
        tkMin = mi;
      }
    }
  }
  let worst = 0;
  for (let k = 0; k < K; k++) if (tkChord[k] > worst) worst = tkChord[k];
  // STAGE 2 — dense refine over a ±4-quad block of ACTUAL quads around EACH distinct top-K location (both triangles,
  // 5×5 interior) against the true triangle plane; nails the exact worst facet at mesh resolution.
  const FR = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
  const seen = new Set<number>();
  for (let k = 0; k < K; k++) {
    if (tkChord[k] < 0) continue;
    const iC = Math.min(cols - 1, Math.floor((tkU[k] - Math.floor(tkU[k])) * cols));
    const jC = Math.min(rows - 2, Math.floor(tkT[k] * (rows - 1)));
    const qkey = jC * cols + iC;
    if (seen.has(qkey)) continue; // one refine per distinct quad (top-K samples cluster on shared crests)
    seen.add(qkey);
    for (let dj = -4; dj <= 4; dj++) {
      const jq = jC + dj;
      if (jq < 0 || jq > rows - 2) continue;
      for (let di = -4; di <= 4; di++) {
        const iq = (((iC + di) % cols) + cols) % cols;
        setCorner(0, iq, jq);
        setCorner(3, iq + 1, jq);
        setCorner(6, iq, jq + 1);
        setCorner(9, iq + 1, jq + 1);
        for (let sj = 0; sj < 5; sj++) {
          const ftc = FR[sj], t = (jq + ftc) * cellT, z = t * H;
          for (let si = 0; si < 5; si++) {
            const fuc = FR[si];
            let u = (iq + fuc) / cols;
            u -= Math.floor(u);
            const th = TAU * u, r = rA(th, z), px = r * Math.cos(th), py = r * Math.sin(th);
            const d = fuc >= ftc ? planeDist(px, py, z, 0, 3, 9) : planeDist(px, py, z, 0, 9, 6);
            if (d > worst) worst = d;
          }
        }
      }
    }
  }
  return worst;
}

/**
 * Sag-based density sizing WITH a measured chord GUARANTEE: probe the analytic surface on a coarse `probeRes²` grid,
 * estimate the worst chord sag per direction from the 3D second difference (sag ≈ |Δ²P|/8 at the probe spacing), scale
 * by the sag∝1/n² law to an `nU`/`nT` seed (rounded UP to a power of two — the exact-dyadic judge lattice), THEN
 * verify-and-bump: MEASURE the emitted grid's true worst flat-facet chord ({@link worstSmoothFacetChord}) and double
 * the deficient axis (≤6×) until it is ≤ `tolMm`. The separable predictive law alone under-picks `nU` for fine/oblique
 * azimuthal relief (HarmonicRipple/SpiralRidges/WaveInterference/HexagonalHive floored 0.0115–0.0183 MAX at the seed);
 * the bump loop closes it by construction. Clamped to sane bounds; the alignNU faceted path keeps the direct snap.
 */
export function deriveSmoothGridDensity(
  rA: AnalyticRadiusFn,
  H: number,
  tolMm: number,
  opts: SmoothGridDensityOpts = {},
): { nU: number; nT: number } {
  const n0 = Math.max(16, Math.floor(opts.probeRes ?? 128));
  const safety = opts.safety ?? 1.5;
  const lift = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const sag2 = (Pm: number[], P: number[], Pp: number[]): number =>
    0.125 * Math.hypot(Pm[0] + Pp[0] - 2 * P[0], Pm[1] + Pp[1] - 2 * P[1], Pm[2] + Pp[2] - 2 * P[2]);
  let maxSagU = 0, maxSagT = 0;
  for (let j = 0; j <= n0; j++) {
    const t = j / n0;
    for (let i = 0; i < n0; i++) {
      const u = i / n0;
      const P = lift(u, t);
      const sU = sag2(lift(((i - 1 + n0) % n0) / n0, t), P, lift(((i + 1) % n0) / n0, t)); // periodic in u
      if (sU > maxSagU) maxSagU = sU;
      if (j > 0 && j < n0) {
        const sT = sag2(lift(u, (j - 1) / n0), P, lift(u, (j + 1) / n0));
        if (sT > maxSagT) maxSagT = sT;
      }
    }
  }
  const nURaw = n0 * Math.sqrt(Math.max(maxSagU, 1e-12) / tolMm) * safety;
  const nTRaw = n0 * Math.sqrt(Math.max(maxSagT, 1e-12) / tolMm) * safety;
  const minNU = opts.minNU ?? 256;
  const maxNU = opts.maxNU ?? 8192;
  const minNT = opts.minNT ?? 32;
  const maxNT = opts.maxNT ?? 2048;
  const aligned = opts.alignNU !== undefined && opts.alignNU >= 1;
  let nU: number;
  if (aligned) {
    // Facet-aligned: snap to the NEAREST multiple of alignNU so columns land on the static facet
    // edges/centers. Clamp to the multiples of alignNU inside [minNU, maxNU] (ceil the lower / floor
    // the upper) so the bound can never break alignment.
    const a = Math.floor(opts.alignNU as number);
    const lo = Math.max(a, Math.ceil(minNU / a) * a);
    const hi = Math.max(lo, Math.floor(maxNU / a) * a);
    nU = Math.min(hi, Math.max(lo, Math.round(nURaw / a) * a));
  } else {
    // Power-of-two: the exact-dyadic judge lattice the C∞ smooth styles cert against.
    let pow2 = 1;
    while (pow2 < nURaw) pow2 *= 2;
    nU = Math.max(minNU, Math.min(maxNU, pow2));
  }
  let nT = Math.max(minNT, Math.min(maxNT, Math.ceil(nTRaw)));
  // VERIFY-AND-BUMP (E-2026-07-23-SMOOTHGRID-DENSITY-GUARANTEE): the separable sag law under-picks nU for
  // fine/oblique/2D azimuthal relief (HR 0.01225 / SR 0.01667 / WI 0.01825 / HexHive 0.0115 MAX at the seed). MEASURE
  // the emitted grid's true worst flat-facet chord and DOUBLE the deficient axis until ≤ tol. Doubling preserves the
  // power-of-two column lattice. Bounded ≤6. Scope = the pow2 smooth-style path: the alignNU faceted path closes by
  // column edge-alignment (not density) and its lone candidate (LowPolyFacet) is routed OFF with an un-closable rim
  // floor() surface bug, so it keeps the direct snap (byte-identical, and its density tests unchanged).
  if (!aligned) {
    for (let iter = 0; iter < 6; iter++) {
      if (worstSmoothFacetChord(rA, H, nU, nT) <= tolMm) break;
      const prevNU = nU, prevNT = nT;
      // Double the axis whose predicted per-facet sag contribution (maxSag/n², sag ∝ 1/n²) dominates; if it is
      // capped, grow the other. Re-evaluated each pass, so a wrong first pick self-corrects (doubling one axis
      // shrinks its ratio 4×, flipping the decision toward the truly-deficient axis on the next pass).
      if (maxSagU / (nU * nU) >= maxSagT / (nT * nT)) {
        if (nU < maxNU) nU = Math.min(maxNU, nU * 2);
        else nT = Math.min(maxNT, nT * 2);
      } else {
        if (nT < maxNT) nT = Math.min(maxNT, nT * 2);
        else nU = Math.min(maxNU, nU * 2);
      }
      if (nU === prevNU && nT === prevNT) break; // both axes capped ⇒ cannot improve further
    }
  }
  return { nU, nT };
}

/** Inputs for {@link buildSmoothGridOuterWall} — the exact analytic surface + the export chord tolerance. */
export interface SmoothGridOuterWallParams {
  analyticRA: AnalyticRadiusFn;
  H: number;
  tolMm: number;
  density?: SmoothGridDensityOpts;
}

/**
 * Build the smooth-style outer wall for the production dispatch: derive the sag-based density, emit the uniform grid,
 * pack it into the {@link ConformingOuterWallResult} the assembly adopts (emergent nU rims). One call = a certifiable
 * ≤tol production outer wall for a smooth style.
 */
export function buildSmoothGridOuterWall(params: SmoothGridOuterWallParams): ConformingOuterWallResult {
  const { nU, nT } = deriveSmoothGridDensity(params.analyticRA, params.H, params.tolMm, params.density);
  return smoothGridWallToOuterWall(buildSmoothGridWall(params.analyticRA, params.H, nU, nT));
}
