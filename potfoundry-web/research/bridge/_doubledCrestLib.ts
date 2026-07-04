// _doubledCrestLib.ts — DEV-ONLY (research/ only; src/ NEVER imports this). PHASE-1 STRUCTURED DOUBLED-CREST
// feature-conforming mesher, generalizing the two PROVEN structured primitives to ARBITRARY feature curves:
//   - doubled-RINGS (horizontal z-riser cliffs): _sharp3dArtDeco / _scaleColDriver (ArtDeco 0.001, serr 0.001).
//   - doubled-GRID (2D axis-aligned grid cliffs): _weaveLib.buildWeaveDoubledGrid (BasketWeave 0.0089, serr ~0).
// Both special cases embed a straight feature as a DOUBLED mesh-edge pair with a rung strip. This lib does the
// same for a feature CURVE that wanders in u as t changes (Gothic rib arch, LowPoly polygon corner), by tracking
// each feature as a per-row LOGICAL COLUMN SLOT and pinning it as an exact mesh-edge chain (zero serration).
//
// THE FLOOR IT FIXES: the prior spike (featConformAll20 / assembleFeatureAligned) embeds features via CDT
// constraintEdges, but CDT constraint-recovery is LOSSY (SFB seam 73/200) => residual serration + a ~0.11 floor
// on Gothic. This lib is BY CONSTRUCTION: the feature curve IS a column of mesh vertices connected top-to-bottom,
// so it is a mesh-edge chain with zero recovery loss.
//
// MODEL. A "crest column" is a feature curve u_s(t) (slot s). Per row t we have a FIXED number nSlot of crest
// slots plus, in each gap between consecutive slots, a FIXED number of smooth M-square sub-columns. Constant
// column count on every row => trivially watertight equal-count quad strips, and the crest slot is one continuous
// mesh-edge column. Around each crest we place a DOUBLED lip: two columns straddling the crest at u_s ± halfWidth
// PLUS the crest column itself (the "peak" vertex), so the near-vertical relief flank between lip and crest is
// resolved as an explicit rung strip and no facet straddles the crest ridge.
//
// SEAM: 2pi-periodic styles wrap in u; non-periodic ones get an explicit theta=0 M-square cliff ladder (reused
// idea from _weaveLib / _structColLib). LowPoly & Gothic are 2pi-periodic (integer bay counts) => wrap.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StructMesh } from './_structColLib';

const TAU = 2 * Math.PI;

// ───────────────────────── geometry helpers ─────────────────────────
/** 3D vertical speed |dP/dt| at (u,t) via central difference (mm per unit-t). */
function vSpeed(rA: AnalyticRadiusFn, u: number, t: number, H: number): number {
  const dt = 1e-4; const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt); const dtt = t1 - t0 || 1e-9;
  const p = (tt: number): [number, number, number] => { const th = u * TAU, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const a = p(t0), b = p(t1);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dtt;
}
/** 3D horizontal (ring) arc length between two u at fixed z (mm). */
function ringArc(rA: AnalyticRadiusFn, uA: number, uB: number, z: number, nSamp = 24): number {
  let L = 0, px = 0, py = 0;
  for (let i = 0; i <= nSamp; i++) { const u = uA + (uB - uA) * (i / nSamp); const th = u * TAU; const rr = rA(th, z); const x = rr * Math.cos(th), y = rr * Math.sin(th); if (i > 0) L += Math.hypot(x - px, y - py); px = x; py = y; }
  return L;
}
function mod1(u: number): number { return ((u % 1) + 1) % 1; }
function cyc(a: number, b: number): number { let d = Math.abs(a - b); if (d > 0.5) d = 1 - d; return d; }

// ───────────────────────── feature curve extraction ─────────────────────────
export interface CrestSlot {
  /** u_s(t) per row (length = nRow). The exact crest curve for logical slot s. */
  u: Float64Array;
  /** true iff this slot is a genuine relief extremum (crest/valley) that needs a doubled lip; else a filler. */
  sharp: boolean;
  /** +1 crest / -1 valley (sign of relief). */
  sign: number;
}

/**
 * Per-row extrema of `sign*rA` (sign=+1 crest, -1 valley) with golden-section refine, sorted asc, seam-robust.
 * A crease/dihedral ridge (LowPoly) and a smooth relief ridge (Gothic rib) both show up as an r-extremum in u.
 */
export function rowExtremaU(rA: AnalyticRadiusFn, z: number, sign: number, N: number, dedupU = 5e-4): number[] {
  const vals = new Float64Array(N);
  for (let i = 0; i < N; i++) vals[i] = sign * rA(TAU * (i / N), z);
  const f = (u: number): number => sign * rA(TAU * mod1(u), z);
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = vals[(i - 1 + N) % N], b = vals[i], c = vals[(i + 1) % N];
    if (b >= a && b > c) {
      let lo = (i - 1) / N, hi = (i + 1) / N; const gr = (Math.sqrt(5) - 1) / 2;
      let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
      for (let it = 0; it < 64 && hi - lo > 1e-11; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); } }
      out.push(mod1((lo + hi) / 2));
    }
  }
  out.sort((a, b) => a - b);
  const dd: number[] = [];
  for (const u of out) if (dd.length === 0 || Math.abs(u - dd[dd.length - 1]) > dedupU) dd.push(u);
  if (dd.length > 1 && dd[0] + 1 - dd[dd.length - 1] < dedupU) dd.pop();
  return dd;
}

export interface CrestTrackOpts {
  scanN?: number;         // azimuth samples for extrema detection
  reliefFloorMm?: number; // ignore extrema whose peak relief amplitude < this (noise gate)
  wrapU?: boolean;        // 2pi-periodic (LowPoly/Gothic true)
}

/**
 * Track feature crest slots across rows. Requires a CONSTANT extremum count per sign (the common case for a bay
 * lattice with integer bay count: LowPoly N corners at all t; Gothic ribs are curved but the *count* of ribs per
 * ring is constant within the tier). Tracks by nearest-cyclic assignment row-to-row. Returns crest slots (sign+1)
 * then valley slots (sign-1). If the count is NOT constant (a genuine birth) the tracker anchors to the row with
 * the MAX count and pins missing slots onto their nearest neighbour (a collapsed degenerate column) — watertight
 * is preserved (equal count) and the collapsed column carries no relief so it costs nothing.
 */
export function trackCrestSlots(rA: AnalyticRadiusFn, H: number, ts: number[], opts: CrestTrackOpts = {}): { crests: CrestSlot[]; valleys: CrestSlot[]; nCrest: number; nValley: number; countStableCrest: boolean; countStableValley: boolean } {
  const scanN = opts.scanN ?? 4096;
  const reliefFloor = opts.reliefFloorMm ?? 0.02;
  const nRow = ts.length;

  const trackOne = (sign: number): { slots: CrestSlot[]; stable: boolean } => {
    // per-row extrema, amplitude-gated
    const perRow: number[][] = [];
    let maxCount = 0;
    for (let r = 0; r < nRow; r++) {
      const z = ts[r] * H;
      // row mean for amplitude gate
      let sum = 0; const NM = 256; for (let i = 0; i < NM; i++) sum += rA(TAU * (i / NM), z); const mean = sum / NM;
      const ex = rowExtremaU(rA, z, sign, scanN).filter((u) => Math.abs(rA(TAU * u, z) - mean) >= reliefFloor);
      perRow.push(ex);
      if (ex.length > maxCount) maxCount = ex.length;
    }
    if (maxCount === 0) return { slots: [], stable: true };
    // stability: is the count equal on (almost) every row?
    let stableRows = 0; for (const ex of perRow) if (ex.length === maxCount) stableRows++;
    const stable = stableRows >= nRow * 0.9;
    // anchor slot u's from the first max-count row, then propagate by nearest-cyclic.
    const anchorRow = perRow.findIndex((ex) => ex.length === maxCount);
    const nSlot = maxCount;
    const slotU: Float64Array[] = Array.from({ length: nSlot }, () => new Float64Array(nRow));
    const anchor = perRow[anchorRow].slice().sort((a, b) => a - b);
    // fill anchor row
    for (let s = 0; s < nSlot; s++) slotU[s][anchorRow] = anchor[s];
    const assignRow = (r: number, prev: number[]): number[] => {
      const ex = perRow[r].slice();
      const out = new Array<number>(nSlot);
      // greedy nearest-cyclic: for each slot, take nearest available extremum; if none, pin to prev (collapsed).
      const used = new Array(ex.length).fill(false);
      for (let s = 0; s < nSlot; s++) {
        let best = -1, bd = Infinity;
        for (let j = 0; j < ex.length; j++) { if (used[j]) continue; const d = cyc(ex[j], prev[s]); if (d < bd) { bd = d; best = j; } }
        if (best >= 0 && bd < 0.5 / nSlot) { out[s] = ex[best]; used[best] = true; } else { out[s] = prev[s]; }
      }
      return out;
    };
    // propagate up from anchor
    let prev = anchor.slice();
    for (let r = anchorRow + 1; r < nRow; r++) { const a = assignRow(r, prev); for (let s = 0; s < nSlot; s++) slotU[s][r] = a[s]; prev = a; }
    // propagate down from anchor
    prev = anchor.slice();
    for (let r = anchorRow - 1; r >= 0; r--) { const a = assignRow(r, prev); for (let s = 0; s < nSlot; s++) slotU[s][r] = a[s]; prev = a; }
    const slots: CrestSlot[] = slotU.map((u) => ({ u, sharp: true, sign }));
    return { slots, stable };
  };

  const c = trackOne(+1), v = trackOne(-1);
  return { crests: c.slots, valleys: v.slots, nCrest: c.slots.length, nValley: v.slots.length, countStableCrest: c.stable, countStableValley: v.stable };
}

// ───────────────────────── M-square row placement ─────────────────────────
/** balanced 3D vertical speed over u at t (seam band excluded); speedBlend 0.5 = geometric mean. */
function balancedSpeedT(rA: AnalyticRadiusFn, H: number, t: number, nUprobe: number, b: number, seamBand: number): number {
  let mn = Infinity, mx = 0;
  for (let iu = 0; iu < nUprobe; iu++) {
    const u = seamBand + (1 - 2 * seamBand) * (iu / (nUprobe - 1));
    const sp = vSpeed(rA, u, t, H); if (sp < mn) mn = sp; if (sp > mx) mx = sp;
  }
  return Math.max(1e-6, Math.pow(Math.max(1e-6, mn), 1 - b) * Math.pow(Math.max(1e-6, mx), b));
}
/** M-square rows: advance ~hRowMm in 3D per row (balanced speed). Mandatory rows (feature births / bands) added. */
export function msquareRowsDC(rA: AnalyticRadiusFn, H: number, hRowMm: number, mandatory: number[], b = 0.5, nUprobe = 200): number[] {
  const tset = new Set<number>([0, 1]);
  for (const m of mandatory) if (m > 1e-6 && m < 1 - 1e-6) tset.add(+m.toFixed(9));
  let t = 0, guard = 0;
  while (t < 1 && guard++ < 200000) {
    const sp = balancedSpeedT(rA, H, t, nUprobe, b, 0.02);
    const dt = Math.max(1e-5, hRowMm / sp);
    const tn = Math.min(1, t + dt); if (tn <= t) break;
    tset.add(+tn.toFixed(9)); t = tn;
  }
  return Array.from(tset).sort((a, c) => a - c);
}

// ───────────────────────── the primitive: doubled-crest structured wall ─────────────────────────
export interface DoubledCrestOpts {
  hRowMm?: number;        // target 3D row height
  wTargetMm?: number;     // target 3D smooth sub-column width
  lipMm?: number;         // 3D half-width of the doubled lip around each crest (the near-vertical flank arc)
  nFlank?: number;        // sub-columns per flank between lip and crest (>=1 => rung strip on the near-vertical wall)
  wrapU?: boolean;        // 2pi-periodic
  scanN?: number;
  reliefFloorMm?: number;
  speedBlend?: number;
  includeValleys?: boolean;
}

export interface DoubledCrestBuild {
  mesh: StructMesh;
  ts: number[];
  nCol: number;
  nCrest: number;
  nValley: number;
  countStableCrest: boolean;
  countStableValley: boolean;
  /** the crest slot curves (u per row) — for the serration ruler (each MUST be a mesh-edge chain). */
  featureSlots: CrestSlot[];
}

/**
 * Build the doubled-crest feature-conforming structured wall.
 *
 * Per row, the column list is assembled in cyclic u order by interleaving:
 *   - for each feature crest slot at u_s(t): a DOUBLED lip triple [u_s - lip, u_s, u_s + lip] with `nFlank`
 *     M-square sub-columns on each flank between the lip edge and the crest (near-vertical rung strip). The
 *     CENTER column u_s is the crest peak — pinned as a mesh-edge chain (zero serration).
 *   - between consecutive features: M-square smooth fill sub-columns (width ~ local 3D row height => square).
 *
 * KEY invariant (watertight): the column KEY LIST is IDENTICAL on every row (slot s contributes the SAME number
 * of keys on every row: 1 crest + 2 lip-edges + 2*nFlank flank + a FIXED per-gap fill count). Constant count =>
 * equal-count quad strips everywhere, and each keyed column (crest / lip / fill-j) is one continuous mesh-edge
 * chain. The crest column being a mesh-edge chain is exactly the zero-serration property the CDT spike lost.
 */
export function buildDoubledCrestMesh(rA: AnalyticRadiusFn, H: number, opts: DoubledCrestOpts = {}): DoubledCrestBuild {
  const hRowMm = opts.hRowMm ?? 0.12;
  const wTargetMm = opts.wTargetMm ?? 0.14;
  const lipMm = opts.lipMm ?? 0.05;
  const nFlank = opts.nFlank ?? 1;
  const wrapU = opts.wrapU ?? true;
  const scanN = opts.scanN ?? 4096;
  const reliefFloor = opts.reliefFloorMm ?? 0.02;
  const b = opts.speedBlend ?? 0.5;
  const includeValleys = opts.includeValleys ?? true;

  // 1) rows.
  const ts = msquareRowsDC(rA, H, hRowMm, [], b);
  const nRow = ts.length;

  // 2) feature slots (crest + optional valley), tracked to per-row curves.
  const tr = trackCrestSlots(rA, H, ts, { scanN, reliefFloorMm: reliefFloor });
  const featureSlots: CrestSlot[] = [...tr.crests, ...(includeValleys ? tr.valleys : [])];
  const nFeat = featureSlots.length;

  // 3) FIXED per-gap fill count. A "gap" is the arc between two consecutive feature columns (in cyclic u order).
  //    Because features move slightly row-to-row, we determine a canonical cyclic ORDER of features from the
  //    MIDDLE row and keep it constant. Fill count per gap = median over rows of ceil(arc/width).
  //    We build a per-row ordered feature list (same identity order) so the strip keys line up.
  const midRow = Math.floor(nRow / 2);
  // canonical order of feature slots by their u at midRow.
  const order = Array.from({ length: nFeat }, (_, s) => s).sort((a, c) => featureSlots[a].u[midRow] - featureSlots[c].u[midRow]);

  // convert a 3D-mm u-offset near u at row r to a delta-u.
  const duForMm = (u: number, r: number, mm: number): number => {
    const z = ts[r] * H; const th = u * TAU; const rr = rA(th, z);
    // local ring speed |dP/du| ~ rr*TAU (ignoring dr/du; good enough for a small lip). Use finite diff for safety.
    const eps = 1e-4; const th2 = (u + eps) * TAU; const rr2 = rA(th2, z);
    const dsdU = Math.hypot(rr2 * Math.cos(th2) - rr * Math.cos(th), rr2 * Math.sin(th2) - rr * Math.sin(th)) / eps;
    return mm / Math.max(1e-6, dsdU);
  };

  // fill count per gap g (gap g = between feature order[g] and order[g+1] cyclic).
  const localRowHMm = (r: number): number => {
    const t = ts[r]; const dtUp = r + 1 < nRow ? ts[r + 1] - t : Infinity, dtDn = r > 0 ? t - ts[r - 1] : Infinity;
    const dt = Math.min(dtUp, dtDn); if (!isFinite(dt)) return wTargetMm;
    return balancedSpeedT(rA, H, t, 64, b, 0.02) * dt;
  };
  const gapFill: number[] = [];
  for (let g = 0; g < nFeat; g++) {
    const counts: number[] = [];
    for (let r = 0; r < nRow; r++) {
      const z = ts[r] * H;
      const sA = order[g], sB = order[(g + 1) % nFeat];
      let uA = featureSlots[sA].u[r] + duForMm(featureSlots[sA].u[r], r, lipMm); // right lip edge of A
      let uB = featureSlots[sB].u[r] - duForMm(featureSlots[sB].u[r], r, lipMm); // left lip edge of B
      // cyclic arc from uA to uB going positive
      let span = uB - uA; while (span < 0) span += 1; while (span > 1) span -= 1;
      const wTarget = Math.min(0.8, Math.max(0.02, Math.max(wTargetMm, 0.6 * localRowHMm(r))));
      const arc = ringArc(rA, uA, uA + span, z);
      // GUARD (unstable-count styles, e.g. Gothic): collapsed/crossing slots can make span≈1 ⇒ arc≈full ring ⇒
      // a runaway fill count. Cap per-gap fill so a degenerate tracking does not blow nCol into an invalid length.
      const c = Number.isFinite(arc) ? Math.max(0, Math.ceil(arc / wTarget) - 1) : 0;
      counts.push(Math.min(c, 400));
    }
    const s = counts.slice().sort((x, y) => x - y); gapFill.push(s[Math.floor(s.length / 2)] ?? 0);
  }

  // GLOBAL nCol cap: keep the mesh measurable (a fixed-column model on an unstable-count style like Gothic can
  // still sum to a huge nCol). If the projected column count exceeds `maxCol`, scale down every gap's fill so the
  // total stays bounded. This does NOT rescue serration (the crest columns are still pinned/collapsed) — it just
  // makes the degenerate case produce a scoreable mesh so the honest floor is measured, not an OOM crash.
  const maxCol = 12000;
  const featCols = nFeat * (2 + 2 * nFlank + 1);
  let fillTotal = gapFill.reduce((a, c) => a + c, 0);
  if (featCols + fillTotal > maxCol) {
    const budget = Math.max(0, maxCol - featCols);
    const scale = fillTotal > 0 ? budget / fillTotal : 0;
    for (let g = 0; g < gapFill.length; g++) gapFill[g] = Math.floor(gapFill[g] * scale);
    fillTotal = gapFill.reduce((a, c) => a + c, 0);
  }

  // 4) assemble per-row column u arrays (all same length + same key order).
  //    key order per feature: [lipL, flankL_1..nFlank, crest, flankR_1..nFlank, lipR], then gap fill.
  const perFeatKeys = 2 + 2 * nFlank + 1; // lipL, flanks, crest, flanks, lipR
  const keys: string[] = [];
  for (let gi = 0; gi < nFeat; gi++) {
    const s = order[gi];
    keys.push(`F${s}:lipL`);
    for (let k = 1; k <= nFlank; k++) keys.push(`F${s}:fL${k}`);
    keys.push(`F${s}:crest`);
    for (let k = 1; k <= nFlank; k++) keys.push(`F${s}:fR${k}`);
    keys.push(`F${s}:lipR`);
    for (let j = 0; j < gapFill[gi]; j++) keys.push(`G${gi}:${j}`);
  }
  const nCol = keys.length;

  // equal-3D-arc sub placement in [uA,uB] at z with n interior points.
  const subFr = (z: number, uA: number, uB: number, n: number): number[] => {
    if (n <= 0) return [];
    const M = Math.max(64, 8 * (n + 1)); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const th = u * TAU; const rr = rA(th, z); const x = rr * Math.cos(th), y = rr * Math.sin(th); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) { const tg = tot * (j / (n + 1)); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out.push((lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M); }
    return out;
  };

  const colU: Float64Array[] = [];
  for (let r = 0; r < nRow; r++) {
    const z = ts[r] * H; const us: number[] = [];
    for (let gi = 0; gi < nFeat; gi++) {
      const s = order[gi];
      const uc = featureSlots[s].u[r];
      const dLip = duForMm(uc, r, lipMm);
      const uL = uc - dLip, uR = uc + dLip;
      // lipL, flankL (between uL and uc), crest, flankR (between uc and uR), lipR
      us.push(uL);
      for (const fr of subFr(z, uL, uc, nFlank)) us.push(uL + (uc - uL) * fr);
      us.push(uc);
      for (const fr of subFr(z, uc, uR, nFlank)) us.push(uc + (uR - uc) * fr);
      us.push(uR);
      // gap fill from uR to next feature's uL
      const sB = order[(gi + 1) % nFeat];
      const ucB = featureSlots[sB].u[r]; const uLB = ucB - duForMm(ucB, r, lipMm);
      let span = uLB - uR; while (span < 0) span += 1;
      for (const fr of subFr(z, uR, uR + span, gapFill[gi])) us.push(uR + span * fr);
    }
    colU.push(Float64Array.from(us.map(mod1)));
  }

  const mesh = wrapU ? buildWrapWall(rA, H, ts, colU, nCol) : buildSeamCliffWall(rA, H, ts, colU, nCol);
  return { mesh, ts, nCol, nCrest: tr.nCrest, nValley: includeValleys ? tr.nValley : 0, countStableCrest: tr.countStableCrest, countStableValley: tr.countStableValley, featureSlots };
}

// periodic-wrap equal-count structured wall.
function buildWrapWall(rA: AnalyticRadiusFn, H: number, ts: number[], colU: Float64Array[], nCol: number): StructMesh {
  const nR = ts.length; const total = nR * nCol;
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H; const base = r * nCol; const u = colU[r];
    for (let k = 0; k < nCol; k++) { const th = u[k] * TAU; const rr = rA(th, z); const v = base + k; xyz[3 * v] = rr * Math.cos(th); xyz[3 * v + 1] = rr * Math.sin(th); xyz[3 * v + 2] = z; ut[2 * v] = u[k]; ut[2 * v + 1] = ts[r]; }
  }
  const idx: number[] = [];
  const d2 = (a: number, c: number): number => { const dx = xyz[3 * a] - xyz[3 * c], dy = xyz[3 * a + 1] - xyz[3 * c + 1], dz = xyz[3 * a + 2] - xyz[3 * c + 2]; return dx * dx + dy * dy + dz * dz; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = r * nCol, bb = (r + 1) * nCol;
    for (let c = 0; c < nCol; c++) { const cn = (c + 1) % nCol; const a = tb + c, an = tb + cn, bv = bb + c, bn = bb + cn; if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

// seam-cliff open wall (non-2pi-periodic): theta=0 meshed as an explicit M-square radial ladder per row band.
function buildSeamCliffWall(rA: AnalyticRadiusFn, H: number, ts: number[], colU: Float64Array[], nCol: number): StructMesh {
  const nR = ts.length; const total = nR * nCol;
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H; const base = r * nCol; const u = colU[r];
    for (let k = 0; k < nCol; k++) { const th = u[k] * TAU; const rr = rA(th, z); const v = base + k; xyz[3 * v] = rr * Math.cos(th); xyz[3 * v + 1] = rr * Math.sin(th); xyz[3 * v + 2] = z; ut[2 * v] = u[k]; ut[2 * v + 1] = ts[r]; }
  }
  const idx: number[] = [];
  const d2 = (a: number, c: number): number => { const dx = xyz[3 * a] - xyz[3 * c], dy = xyz[3 * a + 1] - xyz[3 * c + 1], dz = xyz[3 * a + 2] - xyz[3 * c + 2]; return dx * dx + dy * dy + dz * dz; };
  // OPEN strips (no wrap col last->first); seam left unclosed here — 2pi styles use wrap. Kept for completeness.
  for (let r = 0; r + 1 < nR; r++) {
    const tb = r * nCol, bb = (r + 1) * nCol;
    for (let c = 0; c + 1 < nCol; c++) { const a = tb + c, an = tb + c + 1, bv = bb + c, bn = bb + c + 1; if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

// ───────────────────────── SERRATION ruler: feature-edge → nearest MESH-EDGE distance ─────────────────────────
/**
 * Serration = for each sampled point on the true feature crest curve (u_s(t)), the 3D distance to the NEAREST
 * MESH EDGE. If the crest is a mesh-edge chain by construction, the crest sample lies ON a mesh edge => ~0. A
 * mesh that only APPROXIMATES the crest (CDT straddle) leaves the crest point off every edge => serration > 0.
 * We build an edge spatial hash (3D grid) over all mesh edges and query the crest samples.
 */
export function measureSerration(
  featureSlots: CrestSlot[], ts: number[], xyz: Float64Array | number[], indices: ArrayLike<number>,
  rA: AnalyticRadiusFn, H: number, samplePerRow = 1,
): { p99Mm: number; maxMm: number; meanMm: number; nSample: number } {
  // collect unique undirected edges. SHARDED dedup Set (a single JS Set caps ~2^24; a multi-M-tri mesh exceeds it
  // → "Set maximum size exceeded"). Shard by low bits of min endpoint. Serration is dominated by nearest-edge
  // distance, so a slightly over-counted duplicate edge (if two shards disagreed — they cannot, min endpoint is
  // deterministic) would be harmless anyway; sharding here is exact.
  const nV = xyz.length / 3;
  const NSH = 64;
  const seenSh: Array<Set<number>> = Array.from({ length: NSH }, () => new Set<number>());
  const edges: Array<[number, number]> = [];
  const ekey = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a);
  const addEdge = (p: number, q: number): void => { const kk = ekey(p, q); const s = seenSh[(p < q ? p : q) & (NSH - 1)]; if (!s.has(kk)) { s.add(kk); edges.push([p, q]); } };
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  // spatial hash of edge midpoints (cell ~1mm). Query point searches its cell + neighbours.
  const CELL = 1.0;
  const grid = new Map<string, number[]>();
  const gk = (x: number, y: number, z: number): string => `${Math.floor(x / CELL)}_${Math.floor(y / CELL)}_${Math.floor(z / CELL)}`;
  for (let e = 0; e < edges.length; e++) {
    const [p, q] = edges[e];
    const mx = (xyz[3 * p] + xyz[3 * q]) / 2, my = (xyz[3 * p + 1] + xyz[3 * q + 1]) / 2, mz = (xyz[3 * p + 2] + xyz[3 * q + 2]) / 2;
    const key = gk(mx, my, mz); const arr = grid.get(key); if (arr) arr.push(e); else grid.set(key, [e]);
  }
  // point-to-segment distance
  const segDist = (px: number, py: number, pz: number, e: number): number => {
    const [p, q] = edges[e];
    const ax = xyz[3 * p], ay = xyz[3 * p + 1], az = xyz[3 * p + 2];
    const bx = xyz[3 * q], by = xyz[3 * q + 1], bz = xyz[3 * q + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
    let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy, cz = az + t * dz;
    return Math.hypot(px - cx, py - cy, pz - cz);
  };
  const dists: number[] = [];
  const nRow = ts.length;
  for (const slot of featureSlots) {
    if (!slot.sharp) continue;
    for (let r = 0; r < nRow; r++) {
      // skip degenerate/pinned rows at the very top/bottom band edges (t=0,1) to avoid open-boundary noise
      if (ts[r] <= 1e-6 || ts[r] >= 1 - 1e-6) continue;
      for (let sp = 0; sp < samplePerRow; sp++) {
        const tt = samplePerRow === 1 ? ts[r] : ts[r] + (r + 1 < nRow ? (ts[r + 1] - ts[r]) * (sp / samplePerRow) : 0);
        const u = slot.u[r]; const th = TAU * mod1(u); const z = tt * H; const rr = rA(th, z);
        const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
        // search 3x3x3 neighbourhood
        let best = Infinity;
        const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL), cz = Math.floor(pz / CELL);
        for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
          const arr = grid.get(`${cx + ix}_${cy + iy}_${cz + iz}`); if (!arr) continue;
          for (const e of arr) { const d = segDist(px, py, pz, e); if (d < best) best = d; }
        }
        if (isFinite(best)) dists.push(best);
      }
    }
  }
  dists.sort((a, b) => a - b);
  const p = (q: number): number => dists.length ? dists[Math.min(dists.length - 1, Math.floor(q * dists.length))] : 0;
  const mean = dists.length ? dists.reduce((a, c) => a + c, 0) / dists.length : 0;
  return { p99Mm: p(0.99), maxMm: dists.length ? dists[dists.length - 1] : 0, meanMm: mean, nSample: dists.length };
}
