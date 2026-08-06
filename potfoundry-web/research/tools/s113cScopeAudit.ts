// s113cScopeAudit.ts — ATTACK THE 12.7x. An adversarial audit of BOTH legs of S112's scoping claim.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS BEING ATTACKED, AND THE ARITHMETIC OF WHERE IT LIVES (read this first — it retargets the audit)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S112 claims the visible defect class is 0.1872% of mesh area, not S108's 2.3699% — 12.7x — via two
// independent scoping moves. `S112_ANGDECOMP_GOTH.report.txt` prints the intermediate, so the two legs can
// be priced SEPARATELY, and they are NOT equal partners:
//
//     unscoped high-dihedral class          2.3699% of mesh area
//     -> LEG 1, CURTAIN scope (graphRatio<=8)   1.7602%      =  1.35x        <- the SMALL leg
//     -> LEG 2, inset-drop STRADDLING split     0.1872%      =  9.40x        <- the HEADLINE
//
// *** 9.40 of the 12.7 is LEG 2. *** If leg 1 collapses entirely the figure moves only 0.1872 -> ~0.25%;
// if leg 2 collapses it moves to 1.76%. So this audit spends its budget accordingly, but runs BOTH.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LEG 1 — IS THE "CURTAIN" CLASS REAL, OR IS IT JUST STEEP WALL?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S112 excludes a facet when `graphRatio` = 3D area / (r*theta, z) parameter area exceeds 8, on the ground
// that "the surface is not a graph of rA there, so the ruler is undefined". THAT IS A STEEPNESS PROXY, NOT
// A NON-GRAPH TEST. For a small facet on a smooth graph the ratio is exactly the area distortion of the
// graph map,
//        J(th,z) = |P_th x P_z| / r = sqrt( 1 + r_z^2 + (r_th/r)^2 ),
// which is FINITE and can be LARGE wherever rA is merely steep. A cut at 8 therefore removes genuine wall
// whenever J > 8 anywhere on the surface. S112's own sweep is the tell: the curtain AREA moves
// 2.13 / 0.61 / 0.026 / 0.017 % across cuts 4/8/16/64 — a 125x swing — while the COUNT moves only 11x, so
// the area sits in the 8-16 band, i.e. in LARGE facets at MODEST ratio, which is not what a vertical
// curtain looks like (a true curtain has ~zero parameter area and diverges).
//
// THE HONEST BINARY. rA is a function everywhere; what actually breaks the ruler is a C0 JUMP of rA inside
// the footprint — then the facet bridges a gap that is not on the analytic surface at all, and n_S does not
// exist on the jump line. A CREASE does not break it (rA is continuous; that is the straddle class). So:
//   D1 TWO-SCALE JUMP PROBE, over the FOOTPRINT (not endpoints): max |delta rA| between ADJACENT points of
//      an order-k barycentric lattice, at k and at 2k. Continuous rA => D(2k)/D(k) ~ 0.5. A jump is
//      preserved under refinement => ratio ~ 1. Reported with the ABSOLUTE delta so a 1-um "jump" cannot
//      count as a cliff.
//   D2 DOES THE FACET LIE ON THE SURFACE? max over an interior lattice of | hypot(x,y) - rA(atan2(y,x),z) |.
//      A curtain facet bridging a cliff sits ~half the cliff off rA; a graph facet sits at chord sag.
//   D3 the analytic J field itself, on a fine grid, so "what ratio can a genuine graph facet reach on THIS
//      style" is a measured number and not an assumption.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LEG 2 — IS A LOW INSET-DROP EVIDENCE OF CONFORMANCE, OR JUST OF A BOUNDARY-ATTAINED SUP?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S112 defines drop = normDeg(inset 0.05)/normDeg(inset 0) and calls drop < 0.25 "CONFORMED — a vertex sits
// ON the crease, so the facet is being falsely indicted". THE ALTERNATIVE, WHICH THE RULER'S OWN HEADER
// STATES (`orientRuler.ts:64`): "the order-k lattice always contains the three VERTICES, which is where the
// sup sits whenever the normal field is monotone across the footprint (every developable/ruled patch, i.e.
// most of a pot wall)". If the sup is generically at a vertex, an inset that deletes the vertices deletes
// the sup FOR ANY FACET, conformed or not, and the drop measures footprint shrinkage, not conformance.
//   D4 DIRECT: locate the crease on each parameter edge (`locateKinkRaw`, the driver's own locator; cross-
//      checked against `locateTurnAdaptive` gated on `turn`) and measure the distance from the NEAREST
//      VERTEX to it, in mm and as a fraction of the facet's parameter diameter. Conformed means ~0.
//   D5 WHERE IS THE inset-0 SUP ATTAINED? `orientOfFacet` returns argTh/argZ; invert the barycentric to get
//      the max weight. maxW ~ 1 => at a vertex. Then measure the distance from THAT point to the crease.
//      A vertex-attained sup FAR from any crease is the alternative explanation, caught in the act.
//   D6 CREASE-FREE CONTROL: facets with NO crease on any edge and normLo > 10. If those drop below 0.25
//      too, a low drop cannot mean "a vertex is on the crease".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST RUN. Two-sided, because a one-sided bar is satisfied by a degenerate
// answer (the 2026-08-05 scar: K=8 passed a gate 12/12 while destroying the ruler).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A1 (LEG 1 CEILING). TRULY-NON-GRAPH := D1 ratio >= 0.75 AND absolute adjacent delta >= 0.010 mm.
//     *** KILL: if under 50% of the CURTAIN class BY AREA is truly non-graph, the curtain exclusion is not
//     justified as stated and its 1.35x must be withdrawn in the measured proportion. ***
// A2 (LEG 1 FLOOR). The same probe must fire on UNDER 10% by area of the WALL class. If it fires on wall
//     too, the probe is broken, the run is VOID for leg 1, and I say so instead of quoting A1.
// A3 (LEG 2 CEILING). VERTEX-ON-CREASE := nearest-vertex-to-crease <= 5% of the facet's parameter diameter
//     (generous). *** KILL: if rate(CONFORMED)/rate(STRADDLING) < 2.0, the "falsely indicted" reading is
//     REFUTED and the 9.40x is overstated. ***
// A4 (LEG 2 FLOOR). rate(CONFORMED) must itself exceed 50%. A discriminator that separates but explains
//     only a minority of its own class does not license deleting that class from the census.
// A5 (LEG 2 ALTERNATIVE). If the CREASE-FREE control (D6) has median drop < 0.25, the drop is a boundary
//     artefact and cannot carry the conformance meaning, INDEPENDENTLY of A3/A4.
//
// EVERY population below is COUNT + AREA-SHARE + MAX, over the UNIQUE facet set. Never a bare count.
// `inset` is passed EXPLICITLY at every call site and swept; it is a measurement choice, not a default.
//
// Usage: bash research/tools/run-s113c-scope.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113C_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113C_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S113C_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S113C_HI_DEG', 45);
const K = Math.round(envF('PF_S113C_K', 8));
const INSET_LO = envF('PF_S113C_INSET_LO', 0);
const INSET_HI = envF('PF_S113C_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S113C_CURTAIN', 8);
const DROP_CUT = envF('PF_S113C_DROP', 0.25);
const JUMP_MM = envF('PF_S113C_JUMP_MM', 0.010);
const JUMP_RATIO = envF('PF_S113C_JUMP_RATIO', 0.75);
const VERT_FRAC = envF('PF_S113C_VERT_FRAC', 0.05);
const TURN_GATE = envF('PF_S113C_TURN_GATE', 10);
const CTRL_STRIDE_N = Math.round(envF('PF_S113C_CTRL_N', 40000));
const DIMS: StyleDims = { H: envF('PF_S113C_H', 120), Rb: envF('PF_S113C_RB', 40), Rt: envF('PF_S113C_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/scopeaudit';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

const PRED: SweepPredConst = {
  esN: Math.round(envF('PF_CB_ESN', 8)),
  refHs: envF('PF_CB_REF_HS', 0.03),
  refNmax: Math.round(envF('PF_CB_REF_NMAX', 64)),
  kinkScan: Math.round(envF('PF_CB_KINK_SCAN', 16)),
  kinkHalvings: Math.round(envF('PF_CB_KINK_HALVINGS', 24)),
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15),
  jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62),
  snap: true,
  confMm: envF('PF_CB_CONF_UM', 0.6) / 1000,
};

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== S113c — ADVERSARIAL AUDIT OF THE 12.7x: both legs of S112\'s scoping =====');
log(`style ${STYLE}  tag ${TAG}  dihedral>${HI_DEG}  k=${K}  insets ${INSET_LO}/${INSET_HI}  curtain ${CURTAIN_RATIO}x  drop ${DROP_CUT}`);
log('LEG 1 is worth 1.35x and LEG 2 is worth 9.40x of the 12.7x (S112\'s own intermediate: 2.3699 -> 1.7602 -> 0.1872).');
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2  interior edges ${d.interiorEdges}  ${el()}`);
log('');

// ─────────────────────────── shared per-facet geometry ───────────────────────────
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;

function orientOf(f: number, inset: number): { normDeg: number; spreadDeg: number; argTh: number; argZ: number } {
  const [ath, bth, cth] = th3(f);
  const o = orientOfFacet(nsKink,
    xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K, inset, scratch });
  return { normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI, argTh: o.argTh, argZ: o.argZ };
}

function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
/** MAX by loop, never `Math.max(...arr)` — the spread blows the stack past ~1e5 and this project has 1e6-point grids. */
const mx = (v: number[]): number => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; };
const areaOfSet = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const uniq = (rs: Array<{ f1: number; f2: number }>): Set<number> => {
  const s = new Set<number>(); for (const r of rs) { s.add(r.f1); s.add(r.f2); } return s;
};
const repPairs = (name: string, rs: Array<{ f1: number; f2: number }>, denomN: number, maxOf: number[]): void => {
  const ar = areaOfSet(uniq(rs));
  log(`  ${name.padEnd(36)} n=${String(rs.length).padStart(6)} (${((rs.length / Math.max(1, denomN)) * 100).toFixed(2).padStart(6)}%)  AREA ${ar.toFixed(2).padStart(9)} mm2 = ${((ar / meshArea) * 100).toFixed(4)}% of mesh  MAX ${maxOf.length > 0 ? mx(maxOf).toFixed(2) : 'n/a'}`);
};
const repFacets = (name: string, fs: number[], denomFs: number[], maxOf: number[]): void => {
  const ar = areaOfSet(fs); const den = areaOfSet(denomFs);
  log(`  ${name.padEnd(36)} n=${String(fs.length).padStart(6)} (${((fs.length / Math.max(1, denomFs.length)) * 100).toFixed(2).padStart(6)}%)  AREA ${ar.toFixed(3).padStart(9)} mm2 = ${((ar / Math.max(1e-12, den)) * 100).toFixed(2).padStart(6)}% of class, ${((ar / meshArea) * 100).toFixed(4)}% of mesh  MAX ${maxOf.length > 0 ? mx(maxOf).toFixed(3) : 'n/a'}`);
};

// ══════════════════════════ REPRODUCE THE FUNNEL — a drift means a different set ══════════════════════
type Row = {
  e: number; f1: number; f2: number; measDeg: number; gr: number; curtain: boolean;
  normHi: number; normLo: number; drop: number;
};
const rows: Row[] = [];
const hiThr = (HI_DEG * Math.PI) / 180;
const facCache = new Map<number, { nHi: number; nLo: number; argThLo: number; argZLo: number; gr: number }>();
const facOf = (f: number): { nHi: number; nLo: number; argThLo: number; argZLo: number; gr: number } => {
  const c = facCache.get(f);
  if (c !== undefined) return c;
  const hi = orientOf(f, INSET_HI); const lo = orientOf(f, INSET_LO);
  const v = { nHi: hi.normDeg, nLo: lo.normDeg, argThLo: lo.argTh, argZLo: lo.argZ, gr: graphRatio(f) };
  facCache.set(f, v); return v;
};
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const a = facOf(f1); const b = facOf(f2);
  const normHi = Math.max(a.nHi, b.nHi); const normLo = Math.max(a.nLo, b.nLo);
  rows.push({
    e, f1, f2, measDeg: (d.edgeAngRad[e] * 180) / Math.PI, gr: Math.max(a.gr, b.gr),
    curtain: a.gr > CURTAIN_RATIO || b.gr > CURTAIN_RATIO,
    normHi, normLo, drop: normLo > 1e-9 ? normHi / normLo : 1,
  });
}
const wall = rows.filter((r) => !r.curtain);
const curtain = rows.filter((r) => r.curtain);
const conformedP = wall.filter((r) => r.drop < DROP_CUT && r.normLo > 10);
const straddlingP = wall.filter((r) => r.drop >= DROP_CUT && r.normHi > 10);
log('── FUNNEL REPRODUCTION (control: a drift means I am not measuring S112\'s set) ──');
repPairs('ALL high-dihedral  (S112: 2.3699%)', rows, rows.length, rows.map((r) => r.measDeg));
repPairs('WALL   (S112: 13092, 1.7602%)', wall, rows.length, wall.map((r) => r.measDeg));
repPairs('CURTAIN (S112: 6490, 0.6111%)', curtain, rows.length, curtain.map((r) => r.measDeg));
repPairs('CONFORMED (S112: 7918, 1.5731%)', conformedP, wall.length, conformedP.map((r) => r.measDeg));
repPairs('STRADDLING (S112: 5174, 0.1872%)', straddlingP, wall.length, straddlingP.map((r) => r.measDeg));
log(`  ${el()}`);
log('');

// ══════════════════════════════════ LEG 1 — IS THE CURTAIN REAL? ══════════════════════════════════
log('══════════ LEG 1 — IS THE "CURTAIN" CLASS TRULY NON-GRAPH, OR JUST STEEP WALL? ══════════');

/** D1 — two-scale jump probe over the FOOTPRINT: max |delta rA| between adjacent lattice points, at k and 2k. */
function adjMaxDelta(f: number, k: number): number {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const off = new Int32Array(k + 2);
  for (let i = 0; i <= k; i += 1) off[i + 1] = off[i] + (k - i + 1);
  const vals = new Float64Array(off[k + 1]);
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      vals[off[i] + j] = rA(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz);
    }
  }
  // the three lattice directions of a triangular grid: +j, +i, and the diagonal (i+1,j)-(i,j+1)
  let best = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const v = vals[off[i] + j];
      if (i + j + 1 <= k) {
        const q1 = Math.abs(vals[off[i] + j + 1] - v); if (q1 > best) best = q1;
        const q3 = Math.abs(vals[off[i + 1] + j] - vals[off[i] + j + 1]); if (q3 > best) best = q3;
      }
      if (i + 1 + j <= k) { const q2 = Math.abs(vals[off[i + 1] + j] - v); if (q2 > best) best = q2; }
    }
  }
  return best;
}
/** D2 — does the FACET lie on the analytic surface? max radial deviation over an interior lattice. */
function maxRadDev(f: number, k: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let best = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const px = wa * ax + wb * bx + wc * cx; const py = wa * ay + wb * by + wc * cy; const pz = wa * az + wb * bz + wc * cz;
      const dv = Math.abs(Math.hypot(px, py) - rA(Math.atan2(py, px), pz));
      if (dv > best) best = dv;
    }
  }
  return best;
}

const curtainF = [...uniq(curtain)];
const wallF = [...uniq(wall)];
type Probe = { f: number; d8: number; d16: number; ratio: number; dev: number; gr: number };
const probeOf = (f: number): Probe => {
  const d8 = adjMaxDelta(f, 6); const d16 = adjMaxDelta(f, 12);
  return { f, d8, d16, ratio: d8 > 1e-15 ? d16 / d8 : 0, dev: maxRadDev(f, 6), gr: graphRatio(f) };
};
const curtainP = curtainF.map(probeOf);
const wallP = wallF.map(probeOf);
log(`  probed ${curtainP.length} unique CURTAIN facets and ${wallP.length} unique WALL facets  ${el()}`);
const isNonGraph = (p: Probe): boolean => p.ratio >= JUMP_RATIO && p.d16 >= JUMP_MM;
const cNG = curtainP.filter(isNonGraph); const wNG = wallP.filter(isNonGraph);
log('');
log(`  D1 TWO-SCALE JUMP PROBE  (halving ratio D(12)/D(6); continuous => ~0.5, C0 JUMP => ~1.0)`);
log(`     CURTAIN  ratio p10 ${q(curtainP.map((p) => p.ratio), 0.1).toFixed(3)} p50 ${q(curtainP.map((p) => p.ratio), 0.5).toFixed(3)} p90 ${q(curtainP.map((p) => p.ratio), 0.9).toFixed(3)}   |delta| at 2k: p50 ${(q(curtainP.map((p) => p.d16), 0.5) * 1000).toFixed(2)} um p90 ${(q(curtainP.map((p) => p.d16), 0.9) * 1000).toFixed(2)} um MAX ${(mx(curtainP.map((p) => p.d16)) * 1000).toFixed(1)} um`);
log(`     WALL     ratio p10 ${q(wallP.map((p) => p.ratio), 0.1).toFixed(3)} p50 ${q(wallP.map((p) => p.ratio), 0.5).toFixed(3)} p90 ${q(wallP.map((p) => p.ratio), 0.9).toFixed(3)}   |delta| at 2k: p50 ${(q(wallP.map((p) => p.d16), 0.5) * 1000).toFixed(2)} um p90 ${(q(wallP.map((p) => p.d16), 0.9) * 1000).toFixed(2)} um MAX ${(mx(wallP.map((p) => p.d16)) * 1000).toFixed(1)} um`);
log('');
log(`  A1/A2 VERDICT — TRULY-NON-GRAPH := ratio >= ${JUMP_RATIO} AND |delta| >= ${(JUMP_MM * 1000).toFixed(0)} um`);
repFacets('CURTAIN truly non-graph', cNG.map((p) => p.f), curtainF, cNG.map((p) => p.d16 * 1000));
repFacets('WALL   truly non-graph [FLOOR<10%]', wNG.map((p) => p.f), wallF, wNG.map((p) => p.d16 * 1000));
{
  const cShare = areaOfSet(cNG.map((p) => p.f)) / Math.max(1e-12, areaOfSet(curtainF));
  const wShare = areaOfSet(wNG.map((p) => p.f)) / Math.max(1e-12, areaOfSet(wallF));
  log(`  => CURTAIN non-graph area share ${(cShare * 100).toFixed(2)}%   (A1 KILL if < 50%)`);
  log(`  => WALL    non-graph area share ${(wShare * 100).toFixed(2)}%   (A2 FLOOR: run VOID for leg 1 if > 10%)`);
  log(`     ${wShare > 0.10 ? '*** A2 FIRED — the probe fires on wall too; LEG 1 IS UNDECIDED, do not quote A1. ***'
    : cShare < 0.50 ? '*** A1 KILL LINE FIRED — the curtain exclusion is NOT justified as stated. ***'
      : '[A1 PASSES — the curtain class is genuinely non-graph.]'}`);
}
log('');
log('  D2 DOES THE FACET LIE ON rA? max |hypot(x,y) - rA| over an interior lattice (um)');
log(`     CURTAIN  p10 ${(q(curtainP.map((p) => p.dev), 0.1) * 1000).toFixed(2)} p50 ${(q(curtainP.map((p) => p.dev), 0.5) * 1000).toFixed(2)} p90 ${(q(curtainP.map((p) => p.dev), 0.9) * 1000).toFixed(2)} MAX ${(mx(curtainP.map((p) => p.dev)) * 1000).toFixed(1)}`);
log(`     WALL     p10 ${(q(wallP.map((p) => p.dev), 0.1) * 1000).toFixed(2)} p50 ${(q(wallP.map((p) => p.dev), 0.5) * 1000).toFixed(2)} p90 ${(q(wallP.map((p) => p.dev), 0.9) * 1000).toFixed(2)} MAX ${(mx(wallP.map((p) => p.dev)) * 1000).toFixed(1)}`);
log('     (a facet bridging a cliff sits ~HALF THE CLIFF off rA; a graph facet sits at chord sag)');
{
  const bar = envF('PF_S113C_DEV_MM', 0.05);
  const cOff = curtainP.filter((p) => p.dev > bar); const wOff = wallP.filter((p) => p.dev > bar);
  repFacets(`CURTAIN off-surface >${(bar * 1000).toFixed(0)}um`, cOff.map((p) => p.f), curtainF, cOff.map((p) => p.dev * 1000));
  repFacets(`WALL    off-surface >${(bar * 1000).toFixed(0)}um`, wOff.map((p) => p.f), wallF, wOff.map((p) => p.dev * 1000));
}
log('');
log('  D3 THE ANALYTIC AREA-DISTORTION FIELD J = sqrt(1 + r_z^2 + (r_th/r)^2) on a fine grid.');
log('     This is what graphRatio converges to on a SMOOTH graph facet. If J routinely exceeds the cut,');
log('     the cut removes genuine wall by construction.');
{
  const NT = 2400; const NZ = 400; const hA = 2e-4;
  const js: number[] = [];
  for (let i = 0; i < NT; i += 1) {
    const th = (i / NT) * 2 * Math.PI;
    for (let j = 0; j < NZ; j += 1) {
      const z = (j / (NZ - 1)) * H;
      const r0 = rA(th, z);
      const hTh = hA / Math.max(1e-9, r0);
      const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
      const zl = Math.max(0, z - hA); const zh = Math.min(H, z + hA);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      js.push(Math.sqrt(1 + rz * rz + (rt / Math.max(1e-9, r0)) ** 2));
    }
  }
  log(`     J over ${NT}x${NZ} = ${js.length} points:  p50 ${q(js, 0.5).toFixed(3)}  p90 ${q(js, 0.9).toFixed(3)}  p99 ${q(js, 0.99).toFixed(3)}  p99.9 ${q(js, 0.999).toFixed(3)}  MAX ${mx(js).toFixed(1)}`);
  for (const c of [2, 4, 8, 16, 64]) log(`       fraction of the SURFACE with J > ${String(c).padStart(2)} : ${((js.filter((x) => x > c).length / js.length) * 100).toFixed(4)}%`);
}
log('');
log('  CURTAIN-CUT SWEEP re-run with the non-graph test attached (does the cut track the physics?)');
for (const c of [2, 4, 8, 16, 64]) {
  const sel = rows.filter((r) => r.gr > c);
  const selF = [...uniq(sel)];
  const ng = selF.filter((f) => { const p = probeOf(f); return isNonGraph(p); });
  const ar = areaOfSet(selF);
  log(`     cut ${String(c).padStart(3)}x  n=${String(sel.length).padStart(6)}  AREA ${((ar / meshArea) * 100).toFixed(4)}% of mesh   truly non-graph: ${((areaOfSet(ng) / Math.max(1e-12, ar)) * 100).toFixed(2)}% by area, ${((ng.length / Math.max(1, selF.length)) * 100).toFixed(2)}% by count`);
}
log(`  ${el()}`);
log('');

// ══════════════════════════ LEG 2 — DOES A LOW DROP MEAN "A VERTEX IS ON THE CREASE"? ═════════════════
log('══════════ LEG 2 — IS A LOW INSET-DROP EVIDENCE OF CONFORMANCE, OR OF A BOUNDARY-ATTAINED SUP? ══════════');

interface CreaseInfo {
  nEdges: number;            // parameter edges carrying a crease (locateKinkRaw, !jump)
  minVertMm: number;         // nearest vertex -> located crease, mm in the (rRef*th, z) metric
  minVertFrac: number;       // ... / parameter diameter
  argCreaseMm: number;       // inset-0 argmax -> nearest located crease, mm
  argMaxW: number;           // barycentric max weight of the inset-0 argmax (1 => AT a vertex)
  paramDiamMm: number;
  bestTurnDeg: number;       // locateTurnAdaptive cross-check
  minVertMmTurn: number;     // nearest vertex -> crease per locateTurnAdaptive (gated on turn)
}
function creaseInfo(f: number): CreaseInfo {
  const [ath, bth, cth] = th3(f);
  const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const ths = [ath, bth, cth];
  const rRef = rRefOf(f);
  const px = ths.map((t) => rRef * t); const pz = zs;
  let diam = 0;
  for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) diam = Math.max(diam, Math.hypot(px[i] - px[j], pz[i] - pz[j]));
  const fac = facOf(f);
  const aTh = fac.argThLo * rRef; const aZ = fac.argZLo;
  // barycentric of the argmax in the parameter triangle
  const d00 = px[1] - px[0]; const d01 = pz[1] - pz[0];
  const d10 = px[2] - px[0]; const d11 = pz[2] - pz[0];
  const det = d00 * d11 - d01 * d10;
  let wb = 0; let wc = 0;
  if (Math.abs(det) > 1e-18) {
    const qx = aTh - px[0]; const qz = aZ - pz[0];
    wb = (qx * d11 - qz * d10) / det; wc = (d00 * qz - d01 * qx) / det;
  }
  const wa = 1 - wb - wc;
  const argMaxW = Math.max(wa, wb, wc);
  let nEdges = 0; let minVert = Infinity; let argMin = Infinity;
  let bestTurn = 0; let minVertTurn = Infinity;
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    const L = Math.hypot(px[ei] - px[j], pz[ei] - pz[j]);
    const kk = locateKinkRaw(rA, ths[ei], zs[ei], ths[j], zs[j], PRED);
    if (kk !== null && !kk.jump) {
      nEdges += 1;
      const t = Math.max(0, Math.min(1, kk.t));
      minVert = Math.min(minVert, L * Math.min(t, 1 - t));
      const cx = px[ei] + (px[j] - px[ei]) * t; const cz = pz[ei] + (pz[j] - pz[ei]) * t;
      argMin = Math.min(argMin, Math.hypot(aTh - cx, aZ - cz));
    }
    const lt = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 14);
    const tdeg = (lt.turn * 180) / Math.PI;
    if (tdeg > bestTurn) bestTurn = tdeg;
    if (tdeg >= TURN_GATE) {
      const s = Math.max(0, Math.min(1, lt.s));
      minVertTurn = Math.min(minVertTurn, L * Math.min(s, 1 - s));
    }
  }
  return { nEdges, minVertMm: minVert, minVertFrac: diam > 1e-12 ? minVert / diam : Infinity, argCreaseMm: argMin, argMaxW, paramDiamMm: diam, bestTurnDeg: bestTurn, minVertMmTurn: minVertTurn };
}

// classify PER FACET — the mechanism claim ("a vertex sits on the crease") is about a facet, not a pair.
const wallF2 = wallF;
type FRow = { f: number; nHi: number; nLo: number; drop: number; ci: CreaseInfo };
const fr: FRow[] = [];
for (const f of wallF2) {
  const a = facOf(f);
  const drop = a.nLo > 1e-9 ? a.nHi / a.nLo : 1;
  fr.push({ f, nHi: a.nHi, nLo: a.nLo, drop, ci: creaseInfo(f) });
}
log(`  per-facet crease analysis over ${fr.length} unique WALL facets  ${el()}`);
const confF = fr.filter((r) => r.drop < DROP_CUT && r.nLo > 10);
const stradF = fr.filter((r) => r.drop >= DROP_CUT && r.nHi > 10);
log('');
log('  FACET-LEVEL classes (S112\'s cuts, applied per facet):');
repFacets('CONFORMED facets (drop<0.25)', confF.map((r) => r.f), wallF2, confF.map((r) => r.nLo));
repFacets('STRADDLING facets (drop>=0.25)', stradF.map((r) => r.f), wallF2, stradF.map((r) => r.nHi));
log('');
log('  D4 DIRECT TEST — distance from the NEAREST VERTEX to the located crease (locateKinkRaw, !jump)');
const vfrac = (rs: FRow[]): number[] => rs.map((r) => r.ci.minVertFrac);
const vmm = (rs: FRow[]): number[] => rs.map((r) => r.ci.minVertMm);
for (const [nm, rs] of [['CONFORMED', confF], ['STRADDLING', stradF]] as Array<[string, FRow[]]>) {
  const withC = rs.filter((r) => r.ci.nEdges > 0);
  log(`     ${nm.padEnd(11)} n=${rs.length}  with a crease on an edge: ${withC.length} (${((withC.length / Math.max(1, rs.length)) * 100).toFixed(1)}%)`);
  log(`     ${' '.repeat(11)}   vertex->crease / paramDiam:  p10 ${q(vfrac(withC), 0.1).toFixed(4)}  p50 ${q(vfrac(withC), 0.5).toFixed(4)}  p90 ${q(vfrac(withC), 0.9).toFixed(4)}`);
  log(`     ${' '.repeat(11)}   vertex->crease mm:           p10 ${q(vmm(withC), 0.1).toFixed(5)}  p50 ${q(vmm(withC), 0.5).toFixed(5)}  p90 ${q(vmm(withC), 0.9).toFixed(5)}   paramDiam p50 ${q(withC.map((r) => r.ci.paramDiamMm), 0.5).toFixed(4)} mm`);
}
{
  const onC = (rs: FRow[]): FRow[] => rs.filter((r) => r.ci.nEdges > 0 && r.ci.minVertFrac <= VERT_FRAC);
  const cOn = onC(confF); const sOn = onC(stradF);
  const cRate = areaOfSet(cOn.map((r) => r.f)) / Math.max(1e-12, areaOfSet(confF.map((r) => r.f)));
  const sRate = areaOfSet(sOn.map((r) => r.f)) / Math.max(1e-12, areaOfSet(stradF.map((r) => r.f)));
  const cRateN = cOn.length / Math.max(1, confF.length); const sRateN = sOn.length / Math.max(1, stradF.length);
  log('');
  log(`  A3/A4 VERDICT — VERTEX-ON-CREASE := nearest vertex within ${(VERT_FRAC * 100).toFixed(0)}% of the parameter diameter`);
  repFacets('CONFORMED with a vertex ON a crease', cOn.map((r) => r.f), confF.map((r) => r.f), cOn.map((r) => r.nLo));
  repFacets('STRADDLING with a vertex ON a crease', sOn.map((r) => r.f), stradF.map((r) => r.f), sOn.map((r) => r.nHi));
  log(`     rate CONFORMED  ${(cRate * 100).toFixed(2)}% by area / ${(cRateN * 100).toFixed(2)}% by count`);
  log(`     rate STRADDLING ${(sRate * 100).toFixed(2)}% by area / ${(sRateN * 100).toFixed(2)}% by count`);
  log(`     separation ${(cRate / Math.max(1e-9, sRate)).toFixed(2)}x by area, ${(cRateN / Math.max(1e-9, sRateN)).toFixed(2)}x by count   (A3 KILL if < 2.0x)`);
  log(`     ${cRate / Math.max(1e-9, sRate) < 2.0 ? '*** A3 KILL LINE FIRED — "conformed" facets are NOT more crease-aligned than straddling ones. ***'
    : cRate < 0.50 ? '*** A4 FLOOR FIRED — the interpretation explains under half of its own class by area. ***'
      : '[A3+A4 PASS — the conformed class really does put a vertex on the crease.]'}`);
  log('     VERT_FRAC SWEEP (the verdict must not rest on the threshold):');
  for (const vf of [0.01, 0.02, 0.05, 0.10, 0.20]) {
    const c2 = confF.filter((r) => r.ci.nEdges > 0 && r.ci.minVertFrac <= vf);
    const s2 = stradF.filter((r) => r.ci.nEdges > 0 && r.ci.minVertFrac <= vf);
    const ca = areaOfSet(c2.map((r) => r.f)) / Math.max(1e-12, areaOfSet(confF.map((r) => r.f)));
    const sa = areaOfSet(s2.map((r) => r.f)) / Math.max(1e-12, areaOfSet(stradF.map((r) => r.f)));
    log(`       <= ${(vf * 100).toFixed(0).padStart(2)}%  conformed ${(ca * 100).toFixed(2).padStart(6)}%  straddling ${(sa * 100).toFixed(2).padStart(6)}%  sep ${(ca / Math.max(1e-9, sa)).toFixed(2)}x`);
  }
}
log('');
log('  D5 WHERE IS THE inset-0 SUP ATTAINED? barycentric max weight (1.0 => exactly AT a vertex)');
for (const [nm, rs] of [['CONFORMED', confF], ['STRADDLING', stradF]] as Array<[string, FRow[]]>) {
  const w = rs.map((r) => r.ci.argMaxW);
  const atV = rs.filter((r) => r.ci.argMaxW > 0.99);
  log(`     ${nm.padEnd(11)} argMaxW p10 ${q(w, 0.1).toFixed(3)} p50 ${q(w, 0.5).toFixed(3)} p90 ${q(w, 0.9).toFixed(3)}   AT a vertex (>0.99): ${atV.length}/${rs.length} = ${((atV.length / Math.max(1, rs.length)) * 100).toFixed(1)}%`);
  const far = atV.filter((r) => r.ci.nEdges > 0 && r.ci.argCreaseMm > VERT_FRAC * r.ci.paramDiamMm);
  const none = atV.filter((r) => r.ci.nEdges === 0);
  log(`     ${' '.repeat(11)} ...of those, argmax FAR from any crease: ${far.length} (${((far.length / Math.max(1, atV.length)) * 100).toFixed(1)}%);  NO crease on any edge at all: ${none.length} (${((none.length / Math.max(1, atV.length)) * 100).toFixed(1)}%)`);
}
log('     (a vertex-attained sup FAR from any crease is the ALTERNATIVE explanation caught in the act:');
log('      the inset deleted the vertices, not a conformance witness)');
log('');
log('  CROSS-CHECK: locateTurnAdaptive (Gauss-map bisection) vs locateKinkRaw (|D2 r| bisection)');
for (const [nm, rs] of [['CONFORMED', confF], ['STRADDLING', stradF]] as Array<[string, FRow[]]>) {
  const g = rs.filter((r) => r.ci.bestTurnDeg >= TURN_GATE && Number.isFinite(r.ci.minVertMmTurn));
  const fr2 = g.map((r) => r.ci.minVertMmTurn / Math.max(1e-12, r.ci.paramDiamMm));
  log(`     ${nm.padEnd(11)} bestTurn p50 ${q(rs.map((r) => r.ci.bestTurnDeg), 0.5).toFixed(2)} deg;  gated n=${g.length};  vertex->turn / diam p10 ${q(fr2, 0.1).toFixed(4)} p50 ${q(fr2, 0.5).toFixed(4)} p90 ${q(fr2, 0.9).toFixed(4)}`);
}
log('');

// D6 — the crease-free control
log('  D6 CREASE-FREE CONTROL — facets with NO crease on ANY edge and normLo > 10. If those drop below');
log(`     ${DROP_CUT} too, a low drop cannot mean "a vertex is on the crease" (A5).`);
{
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gsr = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (gsr > 1 && gcd(gsr, nTri) !== 1) gsr += 2;
  const drops: number[] = []; const dropsCF: number[] = []; let nSeen = 0; let nHiLo = 0;
  const cfF: number[] = []; const cfLow: number[] = [];
  for (let i = 0; i < CTRL_STRIDE_N; i += 1) {
    const f = (i * gsr) % nTri;
    if (graphRatio(f) > CURTAIN_RATIO) continue;
    nSeen += 1;
    const lo = orientOf(f, INSET_LO);
    if (!(lo.normDeg > 10)) continue;
    nHiLo += 1;
    const hi = orientOf(f, INSET_HI);
    const dr = lo.normDeg > 1e-9 ? hi.normDeg / lo.normDeg : 1;
    drops.push(dr);
    const [ath, bth, cth] = th3(f);
    const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]]; const ths = [ath, bth, cth];
    let anyC = false;
    for (let ei = 0; ei < 3 && !anyC; ei += 1) {
      const j = (ei + 1) % 3;
      const kk = locateKinkRaw(rA, ths[ei], zs[ei], ths[j], zs[j], PRED);
      if (kk !== null && !kk.jump) anyC = true;
    }
    if (!anyC) { dropsCF.push(dr); cfF.push(f); if (dr < DROP_CUT) cfLow.push(f); }
  }
  log(`     sampled ${CTRL_STRIDE_N} facets by golden stride -> ${nSeen} wall -> ${nHiLo} with normLo>10 -> ${dropsCF.length} of those CREASE-FREE`);
  log(`     drop, all normLo>10 wall facets:  p10 ${q(drops, 0.1).toFixed(3)} p50 ${q(drops, 0.5).toFixed(3)} p90 ${q(drops, 0.9).toFixed(3)}`);
  log(`     drop, CREASE-FREE subset:         p10 ${q(dropsCF, 0.1).toFixed(3)} p50 ${q(dropsCF, 0.5).toFixed(3)} p90 ${q(dropsCF, 0.9).toFixed(3)}`);
  const cfLowShare = dropsCF.length > 0 ? dropsCF.filter((x) => x < DROP_CUT).length / dropsCF.length : NaN;
  const cfLowArea = areaOfSet(cfLow) / Math.max(1e-12, areaOfSet(cfF));
  log(`     CREASE-FREE facets classified CONFORMED by the drop rule: ${(cfLowShare * 100).toFixed(2)}% by count, ${(cfLowArea * 100).toFixed(2)}% by area`);
  log(`     ${q(dropsCF, 0.5) < DROP_CUT ? `*** A5 FIRED — median crease-free drop ${q(dropsCF, 0.5).toFixed(3)} < ${DROP_CUT}: the drop is a BOUNDARY artefact, not a conformance witness. ***`
    : `[A5 clear — crease-free facets keep their normDeg under the inset (median drop ${q(dropsCF, 0.5).toFixed(3)}).]`}`);
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════════ THE HONEST FIGURE ══════════════════════════════════
log('══════════ WHAT THE HONEST FIGURE IS ══════════');
{
  const allA = areaOfSet(uniq(rows)) / meshArea * 100;
  const wallA = areaOfSet(uniq(wall)) / meshArea * 100;
  const stradA = areaOfSet(uniq(straddlingP)) / meshArea * 100;
  // leg-1-failed variant: apply the drop split to ALL high-dihedral pairs, no curtain scope
  const stradAll = rows.filter((r) => r.drop >= DROP_CUT && r.normHi > 10);
  const stradAllA = areaOfSet(uniq(stradAll)) / meshArea * 100;
  log(`  unscoped high-dihedral class                       ${allA.toFixed(4)}% of mesh   (S108/S112: 2.3699%)`);
  log(`  + LEG 1 only (curtain scope)                       ${wallA.toFixed(4)}%   => ${(allA / wallA).toFixed(2)}x`);
  log(`  + LEG 2 only (drop split, NO curtain scope)        ${stradAllA.toFixed(4)}%   => ${(allA / stradAllA).toFixed(2)}x`);
  log(`  + BOTH (S112's published figure)                   ${stradA.toFixed(4)}%   => ${(allA / stradA).toFixed(2)}x`);
  writeFileSync(`${OUTDIR}/S113C_SCOPE_${TAG}.json`, `${JSON.stringify({
    style: STYLE, stl: STL, meshFacets: nTri, meshAreaMm2: meshArea,
    cuts: { HI_DEG, CURTAIN_RATIO, DROP_CUT, INSET_LO, INSET_HI, K, JUMP_MM, JUMP_RATIO, VERT_FRAC },
    funnel: { all: rows.length, wall: wall.length, curtain: curtain.length, conformed: conformedP.length, straddling: straddlingP.length },
    areaPct: { all: allA, wall: wallA, straddlingBoth: stradA, straddlingNoCurtainScope: stradAllA },
  }, null, 2)}\n`);
}
log(`done ${el()}`);
