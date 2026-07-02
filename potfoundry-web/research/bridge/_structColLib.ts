// _structColLib.ts — DEV-ONLY (research/ only; src/ must NEVER import this). ISOLATED ridge-GRAPH builder for
// E-2026-07-02-STRUCTCOL. The missing piece of E-SFB-CHAIN Lever 2: a ROBUST ridge-graph that gives each
// petal-corner ridge a CONTINUOUS CHAIN IDENTITY through the 4 petal-BIRTHS and across the u-SEAM, then
// rasterizes it into structured mesh COLUMNS so every ridge (crest+valley) is a mesh-edge chain BY
// CONSTRUCTION (zero serration, no metric-Delaunay, no recovery), watertight by shared-vertex index.
//
// GEOMETRY (measured, _structColGeom): SFB@1 has 6 crests+6 valleys at t=0, growing to 10+10 at t=1 via 4
// births at t≈0.0005/0.338/0.561/0.829, EVERY birth at the u-SEAM (crest uNew=1.0, valley uNew≈0.99). The
// crests are NOT evenly spaced after a birth (14-20mm lattice residual, relaxing to ~1mm before the next birth)
// => the affine-lattice model is WRONG; ridges must be TRACKED. The clean model: track 10 crest + 10 valley
// LOGICAL SLOTS top->down; below its birth a slot is COLLAPSED onto the seam (a degenerate seam column). One
// global equal-count strip for the WHOLE wall => no band boundaries, no merge strips, no dropped rows; the
// ridge is one mesh-edge column continuously through births + seam.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

/** cyclic distance in u-units (period 1). */
function cyc(a: number, b: number): number { let d = Math.abs(a - b); if (d > 0.5) d = 1 - d; return d; }

/**
 * Per-row extrema of a given sign (+1 crest / -1 valley) with SEAM-ROBUST golden-section refine, sorted asc.
 * A feature straddling u=0 is not lost: the window search runs in a continuous frame then folds to [0,1).
 * De-dups near-coincident (seam-split) within `dedupU`.
 */
export function rowExtrema(rA: AnalyticRadiusFn, z: number, sign: number, N: number, dedupU = 1e-4): number[] {
  const vals = new Float64Array(N);
  for (let i = 0; i < N; i++) vals[i] = sign * rA(TAU * (i / N), z);
  const f = (u: number): number => sign * rA(TAU * (((u % 1) + 1) % 1), z);
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = vals[(i - 1 + N) % N], b = vals[i], c = vals[(i + 1) % N];
    if (b >= a && b > c) {
      let lo = (i - 1) / N, hi = (i + 1) / N; const gr = (Math.sqrt(5) - 1) / 2;
      let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
      for (let it = 0; it < 64 && hi - lo > 1e-11; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); } }
      let u = (lo + hi) / 2; u = ((u % 1) + 1) % 1; out.push(u);
    }
  }
  out.sort((a, b) => a - b);
  const dd: number[] = [];
  for (const u of out) if (dd.length === 0 || Math.abs(u - dd[dd.length - 1]) > dedupU) dd.push(u);
  if (dd.length > 1 && dd[0] + 1 - dd[dd.length - 1] < dedupU) dd.pop();
  return dd;
}

export interface RidgeGraph {
  /** t values of the rows, ascending (0..1). */
  ts: number[];
  /** nCrest, the max crest slot count across the wall (= crest count at t=1). */
  nCrest: number;
  nValley: number;
  /** crestU[r][s] = u of crest logical slot s at row r; NaN if slot s not yet born at this row. */
  crestU: Float64Array[];
  valleyU: Float64Array[];
  /** birth row index per crest/valley slot (first row where the slot is active). */
  crestBirthRow: number[];
  valleyBirthRow: number[];
  /** the u each slot is BORN at (its extremum u at its birth row). Used to pin the slot below birth (seam). */
  crestBirthU: number[];
  valleyBirthU: number[];
}

/**
 * Build the ridge graph: track crest + valley LOGICAL SLOTS from the TOP row (max count) DOWNWARD by
 * nearest-in-u greedy matching (seam-cyclic). When the count drops (a birth, going down), the UNMATCHED
 * seam-most slot is retired (it was BORN at that transition). Each slot thus has a continuous u_slot(t) from
 * its birth row to the top. Below birth the slot's u is NaN (collapsed onto the seam by the rasterizer).
 *
 * Tracking top->down is robust because at the TOP all slots exist; going down, one disappears at each birth,
 * and greedy nearest-u correctly identifies WHICH one vanished (the seam-most newborn) without any lattice/
 * even-spacing assumption (which the geometry probe REFUTED: 14-20mm residual after a birth).
 */
export function buildRidgeGraph(
  rA: AnalyticRadiusFn, H: number, ts: number[], scanN: number,
): RidgeGraph {
  const nR = ts.length;
  const crestRows: number[][] = ts.map((t) => rowExtrema(rA, t * H, 1, scanN));
  const valleyRows: number[][] = ts.map((t) => rowExtrema(rA, t * H, -1, scanN));
  const track = (rows: number[][]): { slotU: Float64Array[]; birthRow: number[]; nSlot: number } => {
    const nSlot = rows[nR - 1].length; // top row = max count
    // slotU[r] length nSlot, NaN where unborn.
    const slotU: Float64Array[] = Array.from({ length: nR }, () => new Float64Array(nSlot).fill(NaN));
    // top row: slot s = the s-th feature (sorted asc). Establish the order there.
    for (let s = 0; s < nSlot; s++) slotU[nR - 1][s] = rows[nR - 1][s];
    const birthRow = new Array<number>(nSlot).fill(0);
    // walk down: match current-row features to the row-above's active slots by nearest-u.
    for (let r = nR - 2; r >= 0; r--) {
      const above = slotU[r + 1];
      const feats = rows[r];
      const activeSlots: number[] = []; for (let s = 0; s < nSlot; s++) if (!Number.isNaN(above[s])) activeSlots.push(s);
      // greedy: each feature grabs its nearest unused active slot; slots left unmatched are BORN here (retire).
      const usedSlot = new Array(nSlot).fill(false);
      const featSlot = new Array<number>(feats.length).fill(-1);
      // build (feat, slot, dist) triples, sort by dist, assign greedily => stable minimal-drift matching.
      const trip: Array<{ fi: number; s: number; d: number }> = [];
      for (let fi = 0; fi < feats.length; fi++) for (const s of activeSlots) trip.push({ fi, s, d: cyc(feats[fi], above[s]) });
      trip.sort((x, y) => x.d - y.d);
      const featUsed = new Array(feats.length).fill(false);
      for (const { fi, s } of trip) { if (featUsed[fi] || usedSlot[s]) continue; featUsed[fi] = true; usedSlot[s] = true; featSlot[fi] = s; }
      for (let fi = 0; fi < feats.length; fi++) { const s = featSlot[fi]; if (s >= 0) slotU[r][s] = feats[fi]; }
      // any active slot NOT used => it is born at row r+1 (first active going UP is r+1). Record birthRow.
      for (const s of activeSlots) if (!usedSlot[s]) birthRow[s] = r + 1;
    }
    // slots active at row 0 were born at 0.
    for (let s = 0; s < nSlot; s++) if (!Number.isNaN(slotU[0][s])) birthRow[s] = 0;
    const birthU = new Array<number>(nSlot).fill(NaN);
    for (let s = 0; s < nSlot; s++) birthU[s] = slotU[birthRow[s]][s];
    return { slotU, birthRow, birthU, nSlot };
  };
  const c = track(crestRows), v = track(valleyRows);
  return { ts, nCrest: c.nSlot, nValley: v.nSlot, crestU: c.slotU, valleyU: v.slotU, crestBirthRow: c.birthRow, valleyBirthRow: v.birthRow, crestBirthU: c.birthU, valleyBirthU: v.birthU };
}

/**
 * CONSTANT-COUNT fill: extend every slot BELOW its birth row by pinning it to its birth-u snapped to the SEAM
 * (u=1). All births are at the seam (measured), so below birth the newborn slot lives on the seam boundary; a
 * pinned column there is a thin seam-adjacent column, NOT degenerate, and makes EVERY row carry the SAME slot
 * set => pure equal-count structured strips for the whole wall (no key-merge fans, the source of the birth-fan
 * bug). Returns a NEW graph with no NaNs. `seamEps` keeps distinct pinned slots from exactly coinciding.
 */
export function fillConstantCount(g: RidgeGraph, seamEps = 1e-5): RidgeGraph {
  const nR = g.ts.length;
  const fill = (slotU: Float64Array[], birthRow: number[], birthU: number[], nSlot: number): Float64Array[] => {
    const out = slotU.map((a) => Float64Array.from(a));
    for (let s = 0; s < nSlot; s++) {
      // pin u for rows below birth. Snap the birth-u to the nearest seam side (0 or 1) so the pinned column sits
      // ON the seam boundary (all SFB births are at the seam). Offset by seamEps*s so pinned columns are distinct.
      const bu = birthU[s]; const seamU = bu > 0.5 ? 1 - seamEps * (s + 1) : seamEps * (s + 1);
      for (let r = 0; r < birthRow[s]; r++) out[r][s] = seamU;
    }
    return out;
  };
  return {
    ts: g.ts, nCrest: g.nCrest, nValley: g.nValley,
    crestU: fill(g.crestU, g.crestBirthRow, g.crestBirthU, g.nCrest),
    valleyU: fill(g.valleyU, g.valleyBirthRow, g.valleyBirthU, g.nValley),
    crestBirthRow: g.crestBirthRow, valleyBirthRow: g.valleyBirthRow,
    crestBirthU: g.crestBirthU, valleyBirthU: g.valleyBirthU,
  };
}

/** validate the graph: each slot's u is continuous (monotone-ish, small per-row drift) from birth to top. */
export function validateRidgeGraph(g: RidgeGraph): { maxDriftU: number; maxDriftMm: number; discontinuities: number; nCrest: number; nValley: number; births: Array<{ kind: string; slot: number; t: number; u: number }> } {
  const nR = g.ts.length;
  let maxDrift = 0, disc = 0;
  const births: Array<{ kind: string; slot: number; t: number; u: number }> = [];
  const scan = (slotU: Float64Array[], birthRow: number[], nSlot: number, kind: string): void => {
    for (let s = 0; s < nSlot; s++) {
      for (let r = birthRow[s]; r + 1 < nR; r++) {
        const a = slotU[r][s], b = slotU[r + 1][s];
        if (Number.isNaN(a) || Number.isNaN(b)) { disc++; continue; }
        const d = cyc(a, b); if (d > maxDrift) maxDrift = d;
        if (d > 0.1) disc++; // a >0.1 u jump = a broken chain (should not happen)
      }
      const br = birthRow[s];
      births.push({ kind, slot: s, t: +g.ts[br].toFixed(4), u: +(slotU[br][s] ?? NaN).toFixed(4) });
    }
  };
  scan(g.crestU, g.crestBirthRow, g.nCrest, 'crest');
  scan(g.valleyU, g.valleyBirthRow, g.nValley, 'valley');
  return { maxDriftU: maxDrift, maxDriftMm: maxDrift * TAU * 50, discontinuities: disc, nCrest: g.nCrest, nValley: g.nValley, births: births.filter((b) => b.t > 1e-6) };
}

// ---------------------------------------------------------------------------------------------------------------
// RASTERIZER: ridge graph -> structured mesh columns. Each row is an ordered list of COLUMNS, each with a stable
// KEY across rows. Feature columns key = 'F:kind:slot' (a ridge/valley identity, continuous through births +
// seam). Gap sub-columns key = 'G:leftFeatKey:j' (fill between two consecutive features). Adjacent rows with the
// SAME ordered key list -> clean equal-count structured strip (ridge = mesh-edge column). At a BIRTH the key
// lists differ only by ONE feature + its subs at the SEAM -> a LOCAL key-merge (advance the longer row) bridges
// it; the OTHER columns still connect same-key straight-through. This is the fix for the old builder's global
// theta re-sort that lost ridge identity across bands.

export interface RowColumns {
  t: number;
  z: number;
  u: Float64Array;       // column u values, cyclic-sorted asc in [0,1)
  key: string[];         // stable key per column (same length as u)
}

/** graded sub-column fractions in a gap of width gapMm: uniform to dthMm + geometric shoulders tipArc..dthMm. */
function gapFracs(gapMm: number, dthMm: number, tipArcMm: number, nShoulder: number): number[] {
  const set = new Set<number>();
  const subN = Math.max(0, Math.ceil(gapMm / dthMm) - 1);
  for (let j = 1; j <= subN; j++) set.add(+(j / (subN + 1)).toFixed(9));
  for (let i = 0; i < nShoulder; i++) {
    const arc = tipArcMm * Math.pow(Math.max(dthMm, tipArcMm) / tipArcMm, i / Math.max(1, nShoulder - 1));
    const fr = arc / gapMm; if (fr > 1e-7 && fr < 0.5) { set.add(+fr.toFixed(9)); set.add(+(1 - fr).toFixed(9)); }
  }
  return Array.from(set).filter((x) => x > 1e-7 && x < 1 - 1e-7).sort((a, b) => a - b);
}

/**
 * Rasterize the ridge graph into per-row columns (VARIABLE count — the feature count changes at the 4 births).
 * Per row: gather ACTIVE features (slots with a non-NaN u), sort cyclically STARTING JUST AFTER THE SEAM, emit
 * feature column + graded gap sub-columns to the NEXT feature. Feature key = the slot identity ('F:c:s'/'F:v:s')
 * so a ridge is the SAME column across rows within a band; sub key = 'G:leftFeatKey:j' with a FIXED per-slot-gap
 * sub-count (max over rows of the dthMm-target) so adjacent same-count rows have IDENTICAL key lists => pure
 * equal-count structured strips (ridge = mesh-edge column). Across a birth the key lists differ only by the
 * newborn feature + its gap subs => a LOCAL key-merge (buildStructWall) bridges it.
 *
 * Column order per row is cyclic starting at the first feature with u>=0 after sorting; because ridges never
 * cross (validated: continuous chains) the cyclic order of shared slots is preserved across rows.
 */
export function rasterizeColumns(
  g: RidgeGraph, uToMm: number, dthMm: number, tipArcMm: number, nShoulder: number,
  rA?: AnalyticRadiusFn, H?: number,
): RowColumns[] {
  const nR = g.ts.length;
  // SEAM-SAFE FRAME: anchor every row's cyclic feature order at crest slot 0 (present at EVERY row, never a birth
  // site) and UNWRAP each feature's u into (anchorU, anchorU+1). Births happen at u≈1.0 in the raw frame => they
  // land in the INTERIOR of the anchored frame, NOT at the u=0/1 mesh boundary — so no seam-fold collision. The
  // mesh seam boundary is then crest-0 itself, a single shared column.
  const activeFeats = (r: number): Array<{ u: number; key: string }> => {
    const raw: Array<{ u: number; key: string }> = [];
    for (let s = 0; s < g.nCrest; s++) { const u = g.crestU[r][s]; if (!Number.isNaN(u)) raw.push({ u: ((u % 1) + 1) % 1, key: `F:c:${s}` }); }
    for (let s = 0; s < g.nValley; s++) { const u = g.valleyU[r][s]; if (!Number.isNaN(u)) raw.push({ u: ((u % 1) + 1) % 1, key: `F:v:${s}` }); }
    const anchorU = ((g.crestU[r][0] % 1) + 1) % 1;
    for (const f of raw) { let u = f.u; while (u < anchorU) u += 1; f.u = u; }
    raw.sort((a, b) => a.u - b.u);
    const dd: Array<{ u: number; key: string }> = [];
    for (const f of raw) if (dd.length === 0 || f.u - dd[dd.length - 1].u > 1e-9) dd.push(f);
    return dd;
  };
  // GAP LENGTH: sub-count is sized by the FLANK'S 3D CHORD LENGTH (crest->valley can be a steep near-vertical
  // cliff with tiny u-arc but a large radial drop — e.g. the squeezed newborn petal at the seam, 0.9mm arc / 6mm
  // radial: sizing by arc left it under-sampled => a 2.4mm spanning facet; sizing by 3D chord fixes it). Fall back
  // to arc if rA/H not supplied.
  const gap3dMm = (r: number, uA: number, uB: number): number => {
    if (!rA || H === undefined) return (uB - uA) * uToMm;
    const z = g.ts[r] * H; const nSamp = 12; let L = 0;
    let pr = rA(uA * TAU, z), px = pr * Math.cos(uA * TAU), py = pr * Math.sin(uA * TAU);
    for (let i = 1; i <= nSamp; i++) { const u = uA + (uB - uA) * (i / nSamp); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); L += Math.hypot(x - px, y - py); px = x; py = y; }
    return L;
  };
  // FIXED per-slot-gap sub-count keyed by the LEFT feature slot = max over rows of the dthMm recipe on the 3D
  // chord length. Keeps counts identical on same-active-set rows (=> equal-count strip).
  const subCount = new Map<string, number>();
  for (let r = 0; r < nR; r++) {
    const feats = activeFeats(r); const nf = feats.length;
    for (let k = 0; k < nf; k++) {
      const a = feats[k]; const bU = (k + 1 < nf ? feats[k + 1].u : feats[0].u + 1);
      const cnt = gapFracs(gap3dMm(r, a.u, bU), dthMm, tipArcMm, nShoulder).length;
      subCount.set(a.key, Math.max(subCount.get(a.key) ?? 0, cnt));
    }
  }
  // place n sub-columns by EQUAL 3D ARC-LENGTH along the flank (dense where the flank is steep) — the faithful
  // chord-minimizing placement. Returns n fractions in (0,1). Falls back to uniform if rA/H absent.
  const subFracs = (r: number, uA: number, uB: number, n: number): number[] => {
    if (n <= 0) return [];
    if (!rA || H === undefined) { const o: number[] = []; for (let j = 1; j <= n; j++) o.push(j / (n + 1)); return o; }
    const z = g.ts[r] * H; const M = Math.max(64, 8 * (n + 1));
    const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const total = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) {
      const target = total * (j / (n + 1));
      // binary search cum for target
      let lo = 0, hi = M; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
      const seg = cum[hi] - cum[lo] || 1; const fr = (lo + (target - cum[lo]) / seg) / M;
      out.push(Math.min(1 - 1e-9, Math.max(1e-9, fr)));
    }
    return out;
  };
  const rows: RowColumns[] = [];
  for (let r = 0; r < nR; r++) {
    const feats = activeFeats(r); const nf = feats.length;
    const us: number[] = []; const keys: string[] = [];
    for (let k = 0; k < nf; k++) {
      const a = feats[k]; const bU = (k + 1 < nf ? feats[k + 1].u : feats[0].u + 1);
      us.push(((a.u % 1) + 1) % 1); keys.push(a.key);
      const n = subCount.get(a.key) ?? 0;
      const fr = subFracs(r, a.u, bU, n);
      for (let j = 0; j < fr.length; j++) { let v = a.u + (bU - a.u) * fr[j]; v = ((v % 1) + 1) % 1; us.push(v); keys.push(`G:${a.key}:${j}`); }
    }
    rows.push({ t: g.ts[r], z: 0, u: Float64Array.from(us), key: keys });
  }
  return rows;
}

export interface StructMesh {
  xyz: Float64Array; ut: number[]; idx: Uint32Array; nV: number; nF: number;
}

/**
 * Build the watertight structured wall from rasterized rows. Adjacent rows are stitched by KEY:
 * - identical key lists -> equal-count structured strip (best-diagonal per quad); ridge = mesh-edge column.
 * - differing key lists (a birth) -> KEY-MERGE walk: two pointers over the cyclic key lists; a shared key
 *   connects a quad, an unmatched column (present in only one row = the newborn feature + its subs) is bridged
 *   by a triangle fan to the matched partner. Because divergence is LOCAL (one feature at the seam), the fan is
 *   tiny and the rest of the ring is clean same-key quads.
 * H = wall height (mm). Row z = t*H. Periodic in u (the last column wraps to the first).
 */
export function buildStructWall(rA: AnalyticRadiusFn, H: number, rows: RowColumns[]): StructMesh {
  const nR = rows.length;
  const rowStart: number[] = [0]; let total = 0;
  for (const r of rows) { total += r.u.length; rowStart.push(total); }
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const base = rowStart[r]; const z = rows[r].t * H;
    for (let k = 0; k < rows[r].u.length; k++) {
      const th = rows[r].u[k] * TAU; const rad = rA(th, z); const vtx = base + k;
      xyz[3 * vtx] = rad * Math.cos(th); xyz[3 * vtx + 1] = rad * Math.sin(th); xyz[3 * vtx + 2] = z;
      ut[2 * vtx] = rows[r].u[k]; ut[2 * vtx + 1] = z / H;
    }
  }
  const idx: number[] = [];
  const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
  const sameList = (a: string[], b: string[]): boolean => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1];
    const topK = rows[r].key, botK = rows[r + 1].key;
    const nTop = topK.length, nBot = botK.length;
    if (sameList(topK, botK)) {
      for (let c = 0; c < nTop; c++) {
        const cn = (c + 1) % nTop; const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn;
        if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
        else { idx.push(a, b, an); idx.push(an, b, bn); }
      }
    } else {
      keyMergeStrip(idx, tb, topK, rows[r].u, bb, botK, rows[r + 1].u, d2);
    }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/**
 * Build the wall with the u-SEAM meshed as an EXPLICIT VERTICAL CLIFF (SHARP3D treatment). SFB@1's rA is NOT
 * 2π-periodic (m=6+4·t^1.2 non-integer between t=0,1) => a genuine radial STEP at θ=0 of height 0..6mm (measured):
 * a real near-vertical face of the closed object. A single-valued sheet mesh (periodic wrap) bridges it with one
 * facet/row => the dominant residual (true-3D 2.87mm). Here the wall is OPEN at the seam (first column at u=0⁺=r0,
 * last column at u=1⁻=rEnd, NOT wrapped) and the cliff is a first-class strip: `seamSub` radial points per row at
 * θ=0 spanning [min(r0,rEnd), max(r0,rEnd)], stitched vertically between rows AND to the wall's two seam edges.
 * Watertight by shared vertices. seamSub sized so cliff cells are ~square (relief-matched).
 *
 * NOTE the rasterizer anchors columns at crest-0; here we DO NOT wrap periodically — the column list per row is
 * treated as an OPEN chain from column 0 (crest-0, u≈0.05) around to the last column (just below crest-0+1). The
 * true θ=0 seam sits between the row's max-u column and crest-0; the cliff bridges exactly there.
 */
export function buildStructWallSeam(
  rA: AnalyticRadiusFn, H: number, rows: RowColumns[], seamSubPerMm: number, minSeamSub: number,
): StructMesh {
  const nR = rows.length;
  const rowStart: number[] = [0]; let total = 0;
  for (const r of rows) { total += r.u.length; rowStart.push(total); }
  // seam cliff vertices: per row, a radial ladder at θ=0 (u=0). Count = max over rows so the strip is equal-count.
  const seamR0: number[] = []; const seamR1: number[] = []; // r at u=0⁺ and u=1⁻ per row
  let maxSeamN = minSeamSub;
  for (let r = 0; r < nR; r++) {
    const z = rows[r].t * H;
    const r0 = rA(0, z); const r1 = rA((1 - 1e-9) * TAU, z);
    seamR0.push(r0); seamR1.push(r1);
    const n = Math.max(minSeamSub, Math.ceil(Math.abs(r1 - r0) * seamSubPerMm));
    if (n > maxSeamN) maxSeamN = n;
  }
  const seamN = maxSeamN; // ladder points per row (inclusive endpoints r0..r1)
  const seamBase = total; total += nR * seamN;
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const base = rowStart[r]; const z = rows[r].t * H;
    for (let k = 0; k < rows[r].u.length; k++) {
      const th = rows[r].u[k] * TAU; const rad = rA(th, z); const vtx = base + k;
      xyz[3 * vtx] = rad * Math.cos(th); xyz[3 * vtx + 1] = rad * Math.sin(th); xyz[3 * vtx + 2] = z;
      ut[2 * vtx] = rows[r].u[k]; ut[2 * vtx + 1] = z / H;
    }
  }
  // seam ladder: point i in [0,seamN) at θ=0, r = r0 + (r1-r0)*i/(seamN-1). i=0 => u=0⁺ side (r0), i=seamN-1 => u=1⁻ side.
  for (let r = 0; r < nR; r++) {
    const z = rows[r].t * H; const r0 = seamR0[r], r1 = seamR1[r];
    for (let i = 0; i < seamN; i++) {
      const rad = r0 + (r1 - r0) * (seamN > 1 ? i / (seamN - 1) : 0);
      const vtx = seamBase + r * seamN + i;
      xyz[3 * vtx] = rad; xyz[3 * vtx + 1] = 0; xyz[3 * vtx + 2] = z; // θ=0
      ut[2 * vtx] = i === 0 ? 0 : (i === seamN - 1 ? 1 : 0.5); ut[2 * vtx + 1] = z / H;
    }
  }
  const idx: number[] = [];
  const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
  const sameList = (a: string[], b: string[]): boolean => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  // OPEN strips between adjacent rows (do NOT wrap column last->first; the seam cliff closes it).
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1];
    const topK = rows[r].key, botK = rows[r + 1].key;
    const nTop = topK.length, nBot = botK.length;
    if (sameList(topK, botK)) {
      for (let c = 0; c + 1 < nTop; c++) { // OPEN: c+1<nTop (no wrap)
        const cn = c + 1; const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn;
        if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
        else { idx.push(a, b, an); idx.push(an, b, bn); }
      }
    } else {
      keyMergeStripOpen(idx, tb, topK, rows[r].u, bb, botK, rows[r + 1].u);
    }
    // seam cliff strip between row r and r+1 (equal-count seamN ladder)
    const s0 = seamBase + r * seamN, s1 = seamBase + (r + 1) * seamN;
    for (let i = 0; i + 1 < seamN; i++) {
      const a = s0 + i, an = s0 + i + 1, b = s1 + i, bn = s1 + i + 1;
      if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
      else { idx.push(a, b, an); idx.push(an, b, bn); }
    }
  }
  // stitch the cliff's two vertical EDGES to the wall's seam columns:
  //  cliff i=0 edge (r0, θ=0) <-> wall column 0 (crest-0 side? NO — u=0⁺ side). The wall's first column is crest-0
  //  at u≈0.05, NOT u=0. The true u=0⁺ point (r0) is the cliff i=0 vertex. The wall's LAST column (max u, ≈ just
  //  below crest-0+1 => u≈0.05 wrapped) is the u=1⁻ side (rEnd) = cliff i=seamN-1 vertex.
  //  We connect: cliff i=0 (u=0⁺) to the wall's FIRST column (crest-0, u≈0.05) — a small quad closing the u∈[0,0.05]
  //  gap on the r0 side; cliff i=seamN-1 (u=1⁻) to the wall's LAST column — closing u∈[max,1] on the rEnd side.
  for (let r = 0; r + 1 < nR; r++) {
    const tb0 = rowStart[r], bb0 = rowStart[r + 1];
    const s0 = seamBase + r * seamN, s1 = seamBase + (r + 1) * seamN;
    // r0 side: cliff i=0 <-> wall first column (index 0)
    { const a = s0, b = s1, c0 = tb0 + 0, c1 = bb0 + 0; if (d2(a, c1) <= d2(c0, b)) { idx.push(a, b, c1); idx.push(a, c1, c0); } else { idx.push(a, b, c0); idx.push(c0, b, c1); } }
    // rEnd side: cliff i=seamN-1 <-> wall last column
    { const lastT = rowStart[r] + rows[r].u.length - 1, lastB = rowStart[r + 1] + rows[r + 1].u.length - 1; const a = s0 + seamN - 1, b = s1 + seamN - 1; if (d2(a, lastB) <= d2(lastT, b)) { idx.push(a, lastB, b); idx.push(a, lastT, lastB); } else { idx.push(a, lastT, b); idx.push(lastT, lastB, b); } }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/** OPEN key-merge strip (no periodic wrap): monotone two-chain merge over the column arrays in given order. */
function keyMergeStripOpen(
  idx: number[], tb: number, topK: string[], topU: Float64Array, bb: number, botK: string[], botU: Float64Array,
): void {
  const nT = topK.length, nB = botK.length;
  const top: Array<{ v: number; u: number }> = []; for (let i = 0; i < nT; i++) top.push({ v: tb + i, u: topU[i] < 0.5 ? topU[i] + (i > 0 && topU[i] < topU[0] ? 1 : 0) : topU[i] });
  const bot: Array<{ v: number; u: number }> = []; for (let i = 0; i < nB; i++) bot.push({ v: bb + i, u: botU[i] < 0.5 ? botU[i] + (i > 0 && botU[i] < botU[0] ? 1 : 0) : botU[i] });
  // unwrap ascending from column 0
  const unwrap = (a: Array<{ v: number; u: number }>): void => { let prev = -Infinity; for (const p of a) { let u = ((p.u % 1) + 1) % 1; while (u < prev - 1e-12) u += 1; p.u = u; prev = u; } };
  unwrap(top); unwrap(bot);
  let i = 0, j = 0;
  while (i + 1 < top.length || j + 1 < bot.length) {
    const advTop = (j + 1 >= bot.length) || (i + 1 < top.length && top[i + 1].u <= bot[j + 1].u);
    if (advTop) { idx.push(top[i].v, bot[j].v, top[i + 1].v); i++; }
    else { idx.push(top[i].v, bot[j].v, bot[j + 1].v); j++; }
  }
}

/**
 * KEY-MERGE strip between two cyclic rows whose key lists differ (a seam birth: one row has extra feature(s) +
 * subs). Robust construction: build BOTH rows as (vertex, UNWRAPPED-u) sequences anchored to a common seam
 * reference so u is monotone-increasing over the full ring (period 1). Then run ONE monotone two-chain merge:
 * advance whichever row's next column has the smaller unwrapped-u, emitting a triangle each step and closing the
 * ring. This is watertight and produces small triangles everywhere EXCEPT the tiny newborn neighborhood (where
 * the extra column fans locally). No spine/collect logic (which mis-handled the seam wrap → 4.5mm facets).
 *
 * Anchoring: both rows are re-ordered to START at their first column with u in [0, 0.5) nearest 0 (a seam-side
 * anchor present in both), then u is unwrapped ascending. The last column wraps by +1 to close.
 */
function keyMergeStrip(
  idx: number[], tb: number, topK: string[], topU: Float64Array, bb: number, botK: string[], botU: Float64Array,
  _d2: (u: number, v: number) => number,
): void {
  const nT = topK.length, nB = botK.length;
  // columns are ALREADY in the crest-0-anchored cyclic order (rasterizeColumns); just unwrap ascending FROM
  // column 0 (do NOT re-anchor to min-u — that would split the ring at a different point on the two rows and
  // break the merge). Append the first column +1 as the ring-close sentinel.
  const seq = (base: number, U: Float64Array, N: number): Array<{ v: number; u: number }> => {
    const out: Array<{ v: number; u: number }> = [];
    let prev = -Infinity;
    for (let i = 0; i < N; i++) {
      let u = ((U[i] % 1) + 1) % 1;
      while (u <= prev) u += 1;               // unwrap monotone ascending from column 0
      out.push({ v: base + i, u }); prev = u;
    }
    out.push({ v: out[0].v, u: out[0].u + 1 });
    return out;
  };
  const top = seq(tb, topU, nT);
  const bot = seq(bb, botU, nB);
  // align the two sequences to a common starting u (they both start near u≈0; pick the smaller start as origin,
  // advance the other until its u is >= origin so the first triangle is well-formed).
  let i = 0, j = 0;
  // emit ring triangles by advancing the smaller next-u; stop when both reach their sentinel end.
  const lastI = top.length - 1, lastJ = bot.length - 1;
  while (i < lastI || j < lastJ) {
    const canT = i < lastI, canB = j < lastJ;
    const advTop = canT && (!canB || top[i + 1].u <= bot[j + 1].u);
    if (advTop) { idx.push(top[i].v, bot[j].v, top[i + 1].v); i++; }
    else { idx.push(top[i].v, bot[j].v, bot[j + 1].v); j++; }
  }
}
