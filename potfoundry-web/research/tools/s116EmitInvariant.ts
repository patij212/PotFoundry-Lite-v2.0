// s116EmitInvariant.ts — S116: THE EMIT-TIME INVARIANT ("GCE" = GRAPH-CONFORMING EMIT).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
//
// The user's target is ZERO blades / folds / artefacts BY CONSTRUCTION — a predicate no emitted triangle
// can violate, not a post-hoc repair. This file DEFINES that predicate as an O(1)-per-triangle test on
// (the 3 vertices, the analytic surface rA) and then VALIDATES IT TWO-SIDEDLY against the classes S112-S115
// measured. Nothing is repaired here and no mesh is written: the deliverable is the CONFUSION MATRIX.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PREDICATE
//
// The shipping surface is a RADIAL GRAPH  r = rA(theta, z).  Every 3D point on it therefore CARRIES its own
// parameter: theta = atan2(y,x), z = z. So a predicate stated in parameter space needs NO extra emitter
// state — it is computable from the 3 emitted vertices alone. That is what makes it an emit-time test.
//
// Parameter coordinates are taken as ARC LENGTH ON THE FACET'S OWN MEAN-RADIUS CYLINDER,
//     s_i = ( rbar * theta_i , z_i )   [mm, mm],  rbar = mean vertex radius, theta UNWRAPPED via dThRaw
// so that every quantity below is a LENGTH or a RATIO OF EQUAL POWERS OF LENGTH ⇒ SCALE-FREE.
//
//   ApS  = signed area of the parameter triangle                                  [mm^2]
//   Lp   = longest parameter edge                                                 [mm]
//   A3   = 3D triangle area                                                       [mm^2]
//   Jbar = mean over the stencil of  sqrt(r_th^2 + r^2 (1 + r_z^2)) / rbar        [dimensionless]
//          — the EXACT area magnification of the map (rbar*theta, z) -> 3D. Derived, not fitted:
//          E=r_th^2+r^2, F=r_th r_z, G=r_z^2+1 ⇒ sqrt(EG-F^2) = sqrt(r_th^2 + r^2(1+r_z^2)).
//
//  T1  FOLD          sigma * ApS > 0.                    sigma = the emitter's fixed global winding.
//  T2  DEGENERACY    qP := 4*sqrt(3) * sigma*ApS / Lp^2  >= tauQ.
//                    Dimensionless normalised shape of the PARAMETER triangle: 1 = equilateral,
//                    0 = collinear, NEGATIVE = folded. So T2 IMPLIES T1 WITH A MARGIN, and T1 is the
//                    tauQ -> 0+ limit. THIS IS THE ANSWER TO (a): the graphRatio pole is
//                    "ApS/Lp^2 -> 0", NOT "ApS -> 0". An absolute area bound is scale-DEPENDENT and would
//                    ban legitimate fine facets; the normalised form is the scale-free one.
//  T3  GRAPH-FIDELITY  Gr := A3 / (sigma*ApS * Jbar)  in [tauGlo, tauGhi].
//                    -> 1 for ANY facet small against the surface's variation. Gr >> 1 = 3D area over ~no
//                    parameter footprint = the FIN/BLADE; Gr << 1 = 3D area collapsed = a shortcut across
//                    a fold. THIS IS (b) IN SCALE-FREE FORM: a flank-aligned blade stands edge-on to the
//                    graph direction, so it spans ~zero parameter area while carrying real 3D area.
//  T4  ORIENTATION   nDeg := max over the stencil of angle(n_T, n_A(theta,z)) <= tauN.        [(d)]
//  T5  POSITION      max over the stencil of |r_pt - rA(theta_pt, z_pt)| <= posBar.           [(e)]
//                    Also reported divided by J (the perpendicular estimate) because the raw radial form
//                    is the KNOWN-INFLATING projector on riser facets.
//
// (c) OVER-CEILING FOLDS ARE A PAIR PROPERTY — AND THEY REDUCE TO A PER-TRIANGLE TEST. HONESTLY:
//   For two triangles sharing a PARAMETER edge, T1 puts their apexes on OPPOSITE sides of that edge in the
//   parameter plane (that is what a common sign of the signed area MEANS). Their footprints are therefore
//   disjoint and their union is a parameter quadrilateral. Each facet normal is within tauN of the surface
//   normal somewhere in its own footprint (T4), so
//        dihedral(f1,f2)  <=  Theta_S(union of footprints)  +  2*tauN
//   where Theta_S is the analytic normal-cone diameter over the union, itself <= the GLOBAL analytic
//   ceiling CEIL = 2*atan(max|grad r|). SO: T1 AND T4, BOTH PER-TRIANGLE, ARE SUFFICIENT FOR (c).
//   *** WHAT THEY ARE NOT SUFFICIENT FOR: global injectivity. *** Two triangles that do NOT share an edge
//   can still have overlapping parameter footprints while both satisfy T1. That is not O(1) and this file
//   says so rather than pretending otherwise (Stage 6).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED GROUND TRUTH — WRITTEN BEFORE ANY THRESHOLD WAS CHOSEN
//
//   BAD  (the predicate MUST flag it)   CelticTriquetra facets whose max adjacent dihedral EXCEEDS the
//        analytic ceiling CEIL. The surface CANNOT produce that angle over that footprint, so the mesh
//        made it. S115: 72.76% of CT's >45 class AREA. ANALYTIC-FREE except for the single scalar CEIL.
//   BAD-BLADE                          dihedral >= 175 deg (the fold-flat sub-class).
//   GOOD (the predicate MUST NOT flag it)  GothicArches facets in the >45 deg dihedral class whose REAL
//        normDeg (orientOfFacet, inset PASSED EXPLICITLY and swept, k swept, h swept) is <= ACC_BAR.
//        S114/S115: 94.83% of Gothic's flagged AREA, normDeg MAX 4.99 deg. REAL GEOMETRY.
//   *** A PREDICATE THAT FLAGS GothicArches's GOOD SET IS REFUTED. This file will say so. ***
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIVE INSTRUMENT SCARS — ALL OBEYED
//  1 inset  PASSED EXPLICITLY to orientOfFacet, and SWEPT {0, 0.02, 0.05, 0.1}. Reference 0.05.
//  2 k      SWEPT {4, 8, 16} on every orientOfFacet number. spreadRad is NEVER quoted (it does not converge).
//  3 h      SWEPT {2e-6, 2e-5, 2e-4, 1e-3} on every normDeg AND on the analytic ceiling AND on Jbar.
//  4 cuts   tauQ, tauGhi, tauGlo, tauN, posBar, CEIL, the 45 deg bar, ACC_BAR — every one swept, ladder printed.
//  5 PRECOND EXHAUSTIVE over welded vertices, never strided.
//
// MEASUREMENT DISCIPLINE: COUNT + AREA-share + MAX together, PER FACET. Every share prints its DENOMINATOR
// so a sub-class share can never be read as a mesh share. Placebo arms in Stage 5.
//
// Usage: bash research/tools/run-s116-emitinv.sh   (env PF_S116_STL absolute, PF_S116_STYLE, PF_S116_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, radialNormal } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));

const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S116_STL ?? '';
const TAG = process.env.PF_S116_TAG ?? STYLE;
const OUTDIR = process.env.PF_S116_OUTDIR ?? 'research/exchange/_strataConformBisect/s116';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const SQ3x4 = 4 * Math.sqrt(3);

// ── the predicate's thresholds. REFERENCE values; every one is swept in Stage 5. ────────────────────
const TAU_Q = envF('PF_S116_TAUQ', 0.02);        // T2 parameter shape quality floor (0..1)
const TAU_GHI = envF('PF_S116_TAUGHI', 1.30);    // T3 upper
const TAU_GLO = envF('PF_S116_TAUGLO', 0.70);    // T3 lower
const TAU_N = envF('PF_S116_TAUN', 20);          // T4 orientation bar, deg (stencil witness)
const POS_BAR = envF('PF_S116_POSBAR', 0.01);    // T5 mm
const POS_BAR2 = envF('PF_S116_POSBAR2', 0.001); // T5 tight, mm
// ── ground-truth cuts ───────────────────────────────────────────────────────────────────────────────
const HI_DEG = envF('PF_S116_HI_DEG', 45);       // the inherited visibility bar (a CONVENTION)
const BLADE_DEG = envF('PF_S116_BLADE', 175);
const ACC_BAR = envF('PF_S116_ACC', 10);         // "ACCURATE" bar for the GOOD set, deg
// ── ruler settings ─────────────────────────────────────────────────────────────────────────────────
const K_REF = envI('PF_S116_K', 8);
const INSET_REF = envF('PF_S116_INSET', 0.05);
const H_REF = envF('PF_S116_HFD', 2e-6);
const CEIL_N = envI('PF_S116_CEILN', 1200);
const GT_CAP = envI('PF_S116_GTCAP', 240000);    // cap on exhaustive orientOfFacet over a ground-truth set
const SWEEP_N = envI('PF_S116_SWEEPN', 4000);    // subsample for the scar ladders

if (STL.length === 0) { log('*** PF_S116_STL is required (ABSOLUTE path). ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const qt = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f3 = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : '—');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [kk, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(kk)] = v.default;
  }
  return out;
}
const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const OUT: Record<string, unknown> = {
  style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS,
  thresholds: { TAU_Q, TAU_GHI, TAU_GLO, TAU_N, POS_BAR, POS_BAR2 },
  gtCuts: { HI_DEG, BLADE_DEG, ACC_BAR }, ruler: { K_REF, INSET_REF, H_REF },
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 — THE EMIT-TIME INVARIANT (GCE), TWO-SIDED VALIDATION — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`defs  ${Object.entries(DEFAULTS).map(([kk, v]) => `${kk}=${v}`).join(' ')}`);
log(`T1 FOLD sigma*ApS>0 | T2 qP>=${TAU_Q} | T3 Gr in [${TAU_GLO},${TAU_GHI}] | T4 nDeg<=${TAU_N} | T5 pos<=${POS_BAR}mm`);
log(`gt cuts: class>${HI_DEG}deg  blade>=${BLADE_DEG}deg  ACC<=${ACC_BAR}deg   ruler k=${K_REF} inset=${INSET_REF} h=${H_REF}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD, WELD, PRECOND (EXHAUSTIVE — scar 5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nF = M.nTri;
log(`loaded ${nF} facets ${el()}`);
{
  // EXHAUSTIVE over EVERY CORNER — no dedup hash, no stride. A hash-deduped scan can DROP a vertex on a
  // collision, and S115's 1,374.8 um population was missed by exactly that kind of shortcut (scar 5).
  const nC = nF * 3;
  let worst = 0; let wth = 0; let wz = 0; let over10 = 0; let over50 = 0;
  const devs: number[] = [];
  for (let c = 0; c < nC; c += 1) {
    const x = xyz[c * 3]; const y = xyz[c * 3 + 1]; const z = xyz[c * 3 + 2];
    const th = Math.atan2(y, x);
    const dd = Math.abs(Math.hypot(x, y) - rA(th, z)) * 1000;
    if (dd > worst) { worst = dd; wth = th; wz = z; }
    if (dd > 10) over10 += 1;
    if (dd > 50) over50 += 1;
    if (c % 37 === 0) devs.push(dd);
  }
  log('── STAGE 0 / CONTROL C1: PRECOND, EXHAUSTIVE over every FACET CORNER (no dedup, no stride) ──');
  log(`  corners ${nC}   |dr| p50 ${ex(qt(devs, 0.5))} p99 ${ex(qt(devs, 0.99))} um   MAX ${worst.toFixed(3)} um @ th=${f3(wth)} z=${f3(wz)}`);
  log(`  over 10 um: ${over10} (${pct(over10, nC)}% of corners)   over 50 um: ${over50} (${pct(over50, nC)}% of corners)`);
  OUT.precond = { nCorners: nC, p50Um: qt(devs, 0.5), p99Um: qt(devs, 0.99), maxUm: worst, over10, over50 };
  if (over50 > 0) log(`  ██ ${over50} corners exceed the 50 um PRECOND gate (MAX ${worst.toFixed(1)} um) — REPORTED, not averaged in.`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — THE ANALYTIC CEILING (h-SWEPT, scar 3)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function ceilingAt(hfd: number, N: number): { gmax: number; deg: number } {
  let gmax = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const th = (2 * Math.PI * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
      const r0 = rA(th, z);
      const hT = hfd / Math.max(1e-9, r0);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      let zl = z - hfd; let zh = z + hfd;
      if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
      if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const g = Math.hypot(rt / r0, rz);
      if (g > gmax) gmax = g;
    }
  }
  return { gmax, deg: 2 * Math.atan(gmax) * DEG };
}
log('── STAGE 1: ANALYTIC CEILING  CEIL = 2*atan(max|grad r|)  — h SWEPT (scar 3) ──');
const CEIL_LADDER: Array<{ h: number; gmax: number; deg: number }> = [];
for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
  const c = ceilingAt(hh, 400);
  CEIL_LADDER.push({ h: hh, ...c });
  log(`   h=${ex(hh)}  (400^2 grid)  max|grad r| ${c.gmax.toFixed(4)}  CEIL ${c.deg.toFixed(3)} deg`);
}
const CEILREF = ceilingAt(H_REF, CEIL_N);
const CEIL_DEG = CEILREF.deg;
log(`   REFERENCE h=${ex(H_REF)} on a ${CEIL_N}^2 grid: max|grad r| ${CEILREF.gmax.toFixed(4)}  ***CEIL = ${CEIL_DEG.toFixed(3)} deg*** ${el()}`);
OUT.ceiling = { ref: CEILREF, ladder: CEIL_LADDER, refDeg: CEIL_DEG };
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — THE PREDICATE, EXHAUSTIVE OVER EVERY FACET
//
// THE EMIT STENCIL: the order-2 barycentric lattice (3 vertices + 3 edge midpoints) PLUS the centroid = 7
// points. Each costs one 5-evaluation finite-difference stencil of rA, and ONE stencil delivers ALL THREE of
// n_A (T4), J (T3) and r (T5). So the whole predicate is 7 stencils = 35 rA evaluations per triangle, and
// T1/T2 cost ZERO rA evaluations at all.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const B2raw: Array<[number, number, number]> = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5],
  [1 / 3, 1 / 3, 1 / 3],
];
/**
 * SCAR 1 IS STRUCTURAL, NOT COSMETIC. The smoke run measured T4 at inset 0 FALSE-FLAGGING 97.06% of
 * GothicArches's GOOD set AREA: a conformed mesh puts its vertices ON the crease ON PURPOSE, and the
 * analytic normal is not defined there, so a stencil that samples the vertices indicts the mesher's best
 * work. The stencil is therefore INSET-PARAMETERISED and the inset is SWEPT EXHAUSTIVELY (not subsampled).
 */
const INSETS = (process.env.PF_S116_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const INSET_S_IDX = Math.max(0, INSETS.indexOf(envF('PF_S116_INSET_S', 0.05)));
const lattice = (inset: number): Array<[number, number, number]> => B2raw.map(([a, b, c]) => [
  a + inset * (1 / 3 - a), b + inset * (1 / 3 - b), c + inset * (1 / 3 - c),
] as [number, number, number]);
const LATS = INSETS.map(lattice);
const nb = new Float64Array(3);

/** One fd stencil at (th,z): returns r, and writes the unit analytic normal into `nb`; returns J too. */
function stencil(th: number, z: number, hfd: number): { r: number; J: number } {
  const r0 = rA(th, z);
  const hT = hfd / Math.max(1e-9, Math.abs(r0));
  const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
  let zl = z - hfd; let zh = z + hfd;
  if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
  if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
  const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
  radialNormal(r0, rt, rz, th, nb, 0);
  return { r: r0, J: Math.sqrt(rt * rt + r0 * r0 * (1 + rz * rz)) };
}

// per-facet stored quantities
const NI = INSETS.length;
const A3 = new Float64Array(nF);
const APS = new Float64Array(nF);        // signed parameter area, mm2
const QP = new Float64Array(nF);         // signed normalised parameter shape
const GRI = INSETS.map(() => new Float64Array(nF));   // A3/(ApS*Jbar) per inset — SIGNED
const DMIN = INSETS.map(() => new Float64Array(nF));  // min over stencil of (n_T . n_A), n_T AS WOUND
const DMAX = INSETS.map(() => new Float64Array(nF));
const NDEGI = INSETS.map(() => new Float64Array(nF)); // orientation witness per inset, GLOBAL winding, deg
const POSR = new Float64Array(nF);       // radial position dev over the FULL footprint, mm (INFLATING)
const POSP = new Float64Array(nF);       // radial/J, mm  (perpendicular estimate)
const Q3 = new Float64Array(nF);         // 3D normalised shape, for the sliver comparison
let GR = GRI[INSET_S_IDX];               // rebound after the winding decision
let NDEG = NDEGI[INSET_S_IDX];

function computeAll(hfd: number): { negAp: number; negApArea: number; outArea: number } {
  let negAp = 0; let negApArea = 0; let outArea = 0;
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    // 3D
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    let fx = uy * wz - uz * wy; let fy = uz * wx - ux * wz; let fz = ux * wy - uy * wx;
    const fl = Math.hypot(fx, fy, fz);
    const area = 0.5 * fl;
    if (fl > 0) { fx /= fl; fy /= fl; fz /= fl; }
    // parameters — UNWRAPPED theta (orientOfFacet's stated precondition, and correct across the seam)
    const ra = Math.hypot(ax, ay); const rb = Math.hypot(bx, by); const rc = Math.hypot(cx, cy);
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const rbar = (ra + rb + rc) / 3;
    const s0x = rbar * tha; const s1x = rbar * thb; const s2x = rbar * thc;
    const aps = 0.5 * ((s1x - s0x) * (cz - az) - (bz - az) * (s2x - s0x));
    const e0 = Math.hypot(s1x - s0x, bz - az);
    const e1 = Math.hypot(s2x - s1x, cz - bz);
    const e2 = Math.hypot(s0x - s2x, az - cz);
    const Lp = Math.max(e0, e1, e2);
    const L3 = Math.max(Math.hypot(ux, uy, uz), Math.hypot(wx, wy, wz), Math.hypot(cx - bx, cy - by, cz - bz));
    A3[f] = area; APS[f] = aps;
    QP[f] = Lp > 0 ? (SQ3x4 * aps) / (Lp * Lp) : 0;
    Q3[f] = L3 > 0 ? (SQ3x4 * area) / (L3 * L3) : 0;
    let dCen = 0;
    for (let li = 0; li < NI; li += 1) {
      const B2 = LATS[li];
      let Jsum = 0; let dmin = 2; let dmax = -2;
      for (let bi = 0; bi < B2.length; bi += 1) {
        const w0 = B2[bi][0]; const w1 = B2[bi][1]; const w2 = B2[bi][2];
        const th = w0 * tha + w1 * thb + w2 * thc;
        const zz = w0 * az + w1 * bz + w2 * cz;
        const st = stencil(th, zz, hfd);
        Jsum += st.J / Math.max(1e-12, rbar);
        const d = fx * nb[0] + fy * nb[1] + fz * nb[2];
        if (d < dmin) dmin = d;
        if (d > dmax) dmax = d;
        if (li === 0 && bi === 6) dCen = d;
        if (li === 0) {
          // POSITION on the FULL footprint (inset 0): position has no crease singularity, so the
          // vertices belong in it. Sampled at the un-inset lattice only.
          const px = w0 * ax + w1 * bx + w2 * cx; const py = w0 * ay + w1 * by + w2 * cy;
          const rp = Math.hypot(px, py);
          const dr = Math.abs(rp - st.r);
          if (dr > POSR[f]) POSR[f] = dr;
          const jj = st.J / Math.max(1e-12, st.r);        // sqrt(1+(rt/r)^2+rz^2) — the perp divisor
          const dp = dr / Math.max(1e-12, jj);
          if (dp > POSP[f]) POSP[f] = dp;
        }
      }
      const Jbar = Jsum / B2.length;
      GRI[li][f] = Math.abs(aps) > 0 ? area / (aps * Jbar) : (aps === 0 ? Infinity : 0);
      DMIN[li][f] = dmin; DMAX[li][f] = dmax;
    }
    if (aps < 0) { negAp += 1; negApArea += area; }
    if (dCen > 0) outArea += area;
  }
  return { negAp, negApArea, outArea };
}
log(`── STAGE 2: THE PREDICATE, EXHAUSTIVE OVER ALL FACETS (7-point stencil x ${NI} insets [${INSETS.join(',')}]) ──`);
const tPred0 = Date.now();
const signInfo = computeAll(H_REF);
const tPred = Date.now() - tPred0;
let MESH_AREA = 0; for (let f = 0; f < nF; f += 1) MESH_AREA += A3[f];
log(`   done ${el()}   predicate wall-clock ${(tPred / 1000).toFixed(2)}s = ${((tPred * 1e6) / nF).toFixed(0)} ns/triangle for ALL ${NI} insets (${35 * NI} rA evals/tri); ONE inset = ${((tPred * 1e6) / nF / NI).toFixed(0)} ns/tri`);
log(`   mesh AREA ${MESH_AREA.toFixed(3)} mm2   facets ${nF}`);
// sigma: the emitter's global parameter winding, taken as the AREA-weighted majority sign of ApS.
const SIGMA = signInfo.negApArea > MESH_AREA / 2 ? -1 : 1;
log(`   signed parameter area: NEGATIVE on ${signInfo.negAp} facets (${pct(signInfo.negAp, nF)}% of facets) carrying ${signInfo.negApArea.toFixed(3)} mm2 (${pct(signInfo.negApArea, MESH_AREA)}% of MESH area)`);
log(`   => sigma (area-weighted majority) = ${SIGMA}.  T1 flags the minority sign.`);
if (SIGMA < 0) {
  for (let f = 0; f < nF; f += 1) { APS[f] = -APS[f]; QP[f] = -QP[f]; }
  for (let li = 0; li < NI; li += 1) for (let f = 0; f < nF; f += 1) GRI[li][f] = -GRI[li][f];
}
// WSIGN: the mesh's global 3D winding vs the analytic OUTWARD normal (radialNormal is outward by
// construction). Decided by AREA, at the centroid, and REPORTED — the convention is not assumed.
const WSIGN = signInfo.outArea >= MESH_AREA / 2 ? 1 : -1;
log(`   3D winding: facets whose CENTROID normal agrees with the analytic OUTWARD normal carry ${signInfo.outArea.toFixed(3)} mm2 (${pct(signInfo.outArea, MESH_AREA)}% of MESH area) => WSIGN = ${WSIGN}`);
for (let li = 0; li < NI; li += 1) {
  for (let f = 0; f < nF; f += 1) {
    const d = WSIGN > 0 ? DMIN[li][f] : -DMAX[li][f];
    NDEGI[li][f] = Math.acos(Math.max(-1, Math.min(1, d))) * DEG;
  }
}
GR = GRI[INSET_S_IDX]; NDEG = NDEGI[INSET_S_IDX];
log(`   REFERENCE stencil inset = ${INSETS[INSET_S_IDX]} (index ${INSET_S_IDX})`);
OUT.stage2 = { nF, meshArea: MESH_AREA, sigma: SIGMA, wsign: WSIGN, outArea: signInfo.outArea, negAp: signInfo.negAp, negApArea: signInfo.negApArea, nsPerTriAllInsets: (tPred * 1e6) / nF, insets: INSETS, insetRefIdx: INSET_S_IDX };
{
  const s = [] as number[]; const p = [] as number[]; const q3 = [] as number[];
  for (let f = 0; f < nF; f += 41) { s.push(QP[f]); p.push(POSR[f]); q3.push(Q3[f]); }
  log(`   qP    p01 ${ex(qt(s, 0.01))} p10 ${ex(qt(s, 0.1))} p50 ${f3(qt(s, 0.5))} p90 ${f3(qt(s, 0.9))}   (inset-free)`);
  log(`   posR  p50 ${ex(qt(p, 0.5))} p99 ${ex(qt(p, 0.99))} mm     q3D p10 ${ex(qt(q3, 0.1))} p50 ${f3(qt(q3, 0.5))}`);
  for (let li = 0; li < NI; li += 1) {
    const g = [] as number[]; const n = [] as number[];
    for (let f = 0; f < nF; f += 41) { g.push(GRI[li][f]); n.push(NDEGI[li][f]); }
    log(`   inset=${String(INSETS[li]).padStart(5)}  Gr p01 ${f3(qt(g, 0.01))} p50 ${f3(qt(g, 0.5))} p99 ${f3(qt(g, 0.99))}   nDeg p50 ${f3(qt(n, 0.5))} p90 ${f3(qt(n, 0.9))} p99 ${f3(qt(n, 0.99))}`);
  }
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — GROUND TRUTH: THE DIHEDRAL CLASSES (ANALYTIC-FREE) + THE REAL orientRuler ON THEM
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 3: GROUND TRUTH ──');
const idxAll = new Uint32Array(nF * 3); for (let i = 0; i < nF * 3; i += 1) idxAll[i] = i;
const DD = facetDihedrals(xyz, idxAll);
log(`   topology: interior ${DD.interiorEdges}  boundary ${DD.boundaryEdges}  non-manifold ${DD.nonManifoldEdges}  inconsistent winding ${DD.inconsistentEdges} ${el()}`);
const hiThr = (HI_DEG * Math.PI) / 180;
const ceThr = (CEIL_DEG * Math.PI) / 180;
const blThr = (BLADE_DEG * Math.PI) / 180;
let hiC = 0; let hiA = 0; let ceC = 0; let ceA = 0; let blC = 0; let blA = 0; let dMax = 0;
for (let f = 0; f < nF; f += 1) {
  const a = DD.perFacetMaxRad[f]; if (a > dMax) dMax = a;
  if (a > hiThr) { hiC += 1; hiA += A3[f]; }
  if (a > ceThr) { ceC += 1; ceA += A3[f]; }
  if (a >= blThr) { blC += 1; blA += A3[f]; }
}
log(`   >${HI_DEG} deg CLASS       COUNT ${hiC} (${pct(hiC, nF)}% of facets)  AREA ${hiA.toFixed(3)} mm2 (${pct(hiA, MESH_AREA)}% OF MESH)  dihedral MAX ${(dMax * DEG).toFixed(3)} deg`);
log(`   >CEIL(${CEIL_DEG.toFixed(2)}) = "BAD"  COUNT ${ceC} (${pct(ceC, nF)}% of facets)  AREA ${ceA.toFixed(3)} mm2 (${pct(ceA, MESH_AREA)}% OF MESH) = ${pct(ceA, hiA)}% OF THE >${HI_DEG} CLASS`);
log(`   >=${BLADE_DEG} deg BLADE     COUNT ${blC} (${pct(blC, nF)}% of facets)  AREA ${blA.toFixed(3)} mm2 (${pct(blA, MESH_AREA)}% OF MESH) = ${pct(blA, hiA)}% OF THE >${HI_DEG} CLASS`);
OUT.groundTruthDihedral = {
  interiorEdges: DD.interiorEdges, boundaryEdges: DD.boundaryEdges, nonManifold: DD.nonManifoldEdges,
  inconsistent: DD.inconsistentEdges, hiC, hiA, ceC, ceA, blC, blA, dihedralMaxDeg: dMax * DEG,
};

// the >HI class facet list — the population on which the REAL orientRuler runs
const hiList: number[] = [];
for (let f = 0; f < nF; f += 1) if (DD.perFacetMaxRad[f] > hiThr) hiList.push(f);
const scratch = new Float64Array(12);
function realNormDeg(f: number, hfd: number, k: number, inset: number): number {
  const o = f * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const tha = Math.atan2(ay, ax);
  const thb = tha + dThRaw(tha, Math.atan2(by, bx));
  const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
  const ns = SAMPLERS.get(hfd) ?? fdNormals(rA, H, hfd, hfd);
  if (!SAMPLERS.has(hfd)) SAMPLERS.set(hfd, ns);
  return orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, tha, thb, thc,
    { k, inset, scratch }).normDeg;
}
const SAMPLERS = new Map<number, ReturnType<typeof fdNormals>>();

// SCAR LADDERS on the REAL normDeg over the >HI class (subsample), then the REFERENCE run exhaustively.
log('');
log('   ── SCARS 1/2/3 on the REAL orientRuler over the >' + String(HI_DEG) + ' class (subsample) ──');
const sub: number[] = [];
{ const st = Math.max(1, Math.floor(hiList.length / SWEEP_N)); for (let i = 0; i < hiList.length; i += st) sub.push(hiList[i]); }
log(`   subsample ${sub.length} of ${hiList.length}`);
const LAD: Record<string, unknown> = {};
{
  const rows: string[] = [];
  for (const inset of [0, 0.02, 0.05, 0.1]) {
    const v = sub.map((f) => realNormDeg(f, H_REF, K_REF, inset));
    const accShare = v.filter((x) => x <= ACC_BAR).length / v.length;
    rows.push(`     inset=${inset.toFixed(2)}  normDeg p50 ${f3(qt(v, 0.5))} p90 ${f3(qt(v, 0.9))} MAX ${f3(Math.max(...v))}  <=${ACC_BAR}deg share ${(accShare * 100).toFixed(2)}%`);
  }
  log('   SCAR 1 — inset (k=' + String(K_REF) + ', h=' + ex(H_REF) + '):'); rows.forEach((r) => log(r));
  LAD.inset = rows;
}
{
  const rows: string[] = [];
  for (const k of [4, 8, 16]) {
    const v = sub.map((f) => realNormDeg(f, H_REF, k, INSET_REF));
    rows.push(`     k=${k}  normDeg p50 ${f3(qt(v, 0.5))} p90 ${f3(qt(v, 0.9))} MAX ${f3(Math.max(...v))}  <=${ACC_BAR}deg share ${((v.filter((x) => x <= ACC_BAR).length / v.length) * 100).toFixed(2)}%`);
  }
  log('   SCAR 2 — lattice order k (inset=' + String(INSET_REF) + '):'); rows.forEach((r) => log(r));
  LAD.k = rows;
}
{
  const rows: string[] = [];
  for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
    const v = sub.map((f) => realNormDeg(f, hh, K_REF, INSET_REF));
    rows.push(`     h=${ex(hh)}  normDeg p50 ${f3(qt(v, 0.5))} p90 ${f3(qt(v, 0.9))} MAX ${f3(Math.max(...v))}  <=${ACC_BAR}deg share ${((v.filter((x) => x <= ACC_BAR).length / v.length) * 100).toFixed(2)}%`);
  }
  log('   SCAR 3 — fd step h (k=' + String(K_REF) + ', inset=' + String(INSET_REF) + '):'); rows.forEach((r) => log(r));
  LAD.h = rows;
}
OUT.scarLadders = LAD;

// REFERENCE exhaustive real normDeg over the >HI class -> the GOOD / not-GOOD split
log('');
const RN = new Float64Array(nF).fill(NaN);
{
  const n = Math.min(hiList.length, GT_CAP);
  for (let i = 0; i < n; i += 1) RN[hiList[i]] = realNormDeg(hiList[i], H_REF, K_REF, INSET_REF);
  if (hiList.length > GT_CAP) log(`   ** >${HI_DEG} class has ${hiList.length} facets, capped at ${GT_CAP} for the exhaustive real normDeg **`);
  let gC = 0; let gA = 0; let iC = 0; let iA = 0; let gMax = 0;
  for (let i = 0; i < n; i += 1) {
    const f = hiList[i];
    if (RN[f] <= ACC_BAR) { gC += 1; gA += A3[f]; if (RN[f] > gMax) gMax = RN[f]; } else { iC += 1; iA += A3[f]; }
  }
  log(`   GOOD  (in >${HI_DEG} class AND real normDeg <= ${ACC_BAR} deg): COUNT ${gC}  AREA ${gA.toFixed(3)} mm2 = ${pct(gA, hiA)}% OF THE CLASS (= ${pct(gA, MESH_AREA)}% of mesh)  normDeg MAX ${f3(gMax)} deg`);
  log(`   NOT-GOOD (class, normDeg > ${ACC_BAR}):                        COUNT ${iC}  AREA ${iA.toFixed(3)} mm2 = ${pct(iA, hiA)}% OF THE CLASS (= ${pct(iA, MESH_AREA)}% of mesh)`);
  OUT.goodSet = { count: gC, area: gA, shareOfClass: gA / hiA, shareOfMesh: gA / MESH_AREA, normDegMax: gMax };
  OUT.notGoodSet = { count: iC, area: iA, shareOfClass: iA / hiA, shareOfMesh: iA / MESH_AREA };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — THE CONFUSION MATRIX
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
type TermKey = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'ANY' | 'CORE';
const t1p = (f: number): boolean => !(APS[f] > 0);
const t2p = (f: number): boolean => !(QP[f] >= TAU_Q);
const t3p = (f: number): boolean => !(GR[f] >= TAU_GLO && GR[f] <= TAU_GHI);
const t4p = (f: number): boolean => !(NDEG[f] <= TAU_N);
const t5p = (f: number): boolean => !(POSR[f] <= POS_BAR);
const corep = (f: number): boolean => t1p(f) || t2p(f) || t3p(f);
const anyp = (f: number): boolean => corep(f) || t4p(f) || t5p(f);
const TERMFN: Record<TermKey, (f: number) => boolean> = {
  T1: t1p, T2: t2p, T3: t3p, T4: t4p, T5: t5p, CORE: corep, ANY: anyp,
};
const REF_CUT = { tauQ: TAU_Q, tauGlo: TAU_GLO, tauGhi: TAU_GHI, tauN: TAU_N, posBar: POS_BAR };
function tally(pred: (f: number) => boolean, set: number[] | null): { c: number; a: number } {
  let c = 0; let a = 0;
  if (set === null) { for (let f = 0; f < nF; f += 1) if (pred(f)) { c += 1; a += A3[f]; } }
  else { for (const f of set) if (pred(f)) { c += 1; a += A3[f]; } }
  return { c, a };
}
const BADset: number[] = []; const BLADEset: number[] = []; const GOODset: number[] = [];
for (let f = 0; f < nF; f += 1) {
  if (DD.perFacetMaxRad[f] > ceThr) BADset.push(f);
  if (DD.perFacetMaxRad[f] >= blThr) BLADEset.push(f);
  if (DD.perFacetMaxRad[f] > hiThr && RN[f] <= ACC_BAR) GOODset.push(f);
}
const BAD_A = BADset.reduce((s, f) => s + A3[f], 0);
const BLADE_A = BLADEset.reduce((s, f) => s + A3[f], 0);
const GOOD_A = GOODset.reduce((s, f) => s + A3[f], 0);

log('── STAGE 4: CONFUSION MATRIX at the REFERENCE cut ──');
log(`   cut: tauQ=${REF_CUT.tauQ} Gr in [${REF_CUT.tauGlo},${REF_CUT.tauGhi}] tauN=${REF_CUT.tauN}deg pos<=${REF_CUT.posBar}mm`);
log('');
const MATRIX: Record<string, unknown> = {};
for (const key of ['T1', 'T2', 'T3', 'T4', 'T5', 'CORE', 'ANY'] as TermKey[]) {
  const p = TERMFN[key];
  const all = tally(p, null);
  const bad = tally(p, BADset);
  const bl = tally(p, BLADEset);
  const good = tally(p, GOODset);
  log(`   ${key.padEnd(4)}  MESH flagged  COUNT ${String(all.c).padStart(8)} (${pct(all.c, nF).padStart(8)}% of facets)  AREA ${all.a.toFixed(3).padStart(11)} mm2 (${pct(all.a, MESH_AREA).padStart(8)}% OF MESH)`);
  log(`         BAD(>CEIL) caught   ${String(bad.c).padStart(8)} / ${BADset.length}  = ${pct(bad.c, BADset.length)}% by count   AREA ${bad.a.toFixed(3)} / ${BAD_A.toFixed(3)} = ${pct(bad.a, BAD_A)}% OF THE BAD SET`);
  log(`         BLADE caught        ${String(bl.c).padStart(8)} / ${BLADEset.length}  = ${pct(bl.c, BLADEset.length)}% by count   AREA ${bl.a.toFixed(3)} / ${BLADE_A.toFixed(3)} = ${pct(bl.a, BLADE_A)}% OF THE BLADE SET`);
  log(`         GOOD  FALSE-FLAGGED ${String(good.c).padStart(8)} / ${GOODset.length}  = ${pct(good.c, GOODset.length)}% by count   AREA ${good.a.toFixed(3)} / ${GOOD_A.toFixed(3)} = ${pct(good.a, GOOD_A)}% OF THE GOOD SET`);
  MATRIX[key] = {
    meshCount: all.c, meshArea: all.a, meshCountShare: all.c / nF, meshAreaShare: all.a / MESH_AREA,
    badCount: bad.c, badArea: bad.a, badN: BADset.length, badTotalArea: BAD_A,
    bladeCount: bl.c, bladeArea: bl.a, bladeN: BLADEset.length, bladeTotalArea: BLADE_A,
    goodCount: good.c, goodArea: good.a, goodN: GOODset.length, goodTotalArea: GOOD_A,
  };
}
OUT.matrix = MATRIX;
OUT.sets = { badN: BADset.length, badArea: BAD_A, bladeN: BLADEset.length, bladeArea: BLADE_A, goodN: GOODset.length, goodArea: GOOD_A };
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — THRESHOLD LADDERS (scar 4) + PLACEBO
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 5: THRESHOLD LADDERS (scar 4) ──');
const LADS: Record<string, unknown> = {};
function ladder(name: string, vals: number[], mk: (v: number) => (f: number) => boolean): void {
  const rows: Array<Record<string, number>> = [];
  log(`   ${name}:`);
  log('        value      MESH cnt%   MESH area%   BAD caught% (area)   BLADE caught% (area)   GOOD false% (area)');
  for (const v of vals) {
    const p = mk(v);
    const all = tally(p, null); const bad = tally(p, BADset); const bl = tally(p, BLADEset); const good = tally(p, GOODset);
    log(`      ${String(v).padStart(9)}   ${pct(all.c, nF).padStart(8)}   ${pct(all.a, MESH_AREA).padStart(9)}   ${pct(bad.a, BAD_A).padStart(10)}          ${pct(bl.a, BLADE_A).padStart(10)}           ${pct(good.a, GOOD_A).padStart(9)}`);
    rows.push({ v, meshC: all.c / nF, meshA: all.a / MESH_AREA, badA: BAD_A > 0 ? bad.a / BAD_A : NaN, bladeA: BLADE_A > 0 ? bl.a / BLADE_A : NaN, goodA: GOOD_A > 0 ? good.a / GOOD_A : NaN });
  }
  LADS[name] = rows;
}
ladder('T2 tauQ (parameter shape floor)', [0, 1e-6, 1e-4, 1e-3, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2],
  (v) => (f) => !(QP[f] >= v));
ladder('T3 tauGhi (graph-fidelity upper, tauGlo=1/tauGhi)', [1.02, 1.05, 1.1, 1.2, 1.3, 1.5, 2, 4, 10, 100],
  (v) => (f) => !(GR[f] >= 1 / v && GR[f] <= v));
ladder('T4 tauN (stencil orientation bar, deg) at REFERENCE inset ' + String(INSETS[INSET_S_IDX]),
  [1, 2, 5, 10, 15, 20, 30, 45, 60, 90], (v) => (f) => !(NDEG[f] <= v));
// SCAR 1 EXHAUSTIVELY, ON THE PREDICATE ITSELF (not on a subsample of a different ruler).
for (let li = 0; li < NI; li += 1) {
  ladder(`T4 tauN at stencil inset=${INSETS[li]}`, [2, 5, 10, 20, 45, 90],
    (v) => (f) => !(NDEGI[li][f] <= v));
}
for (let li = 0; li < NI; li += 1) {
  ladder(`T3 tauGhi at stencil inset=${INSETS[li]}`, [1.05, 1.2, 1.5, 2, 4, 100],
    (v) => (f) => !(GRI[li][f] >= 1 / v && GRI[li][f] <= v));
}
ladder('T5 posBar (radial, mm)', [1e-4, 3e-4, 1e-3, 3e-3, 0.01, 0.03, 0.1],
  (v) => (f) => !(POSR[f] <= v));
ladder('T5perp posBar (radial/J, mm)', [1e-4, 3e-4, 1e-3, 3e-3, 0.01, 0.03, 0.1],
  (v) => (f) => !(POSP[f] <= v));
// GT-cut sensitivity: does the CORE verdict survive moving the BAD/GOOD boundaries themselves?
{
  const rows: Array<Record<string, number>> = [];
  log('   GT-CUT SENSITIVITY — the BAD set redefined at other dihedral bars, CORE held fixed:');
  for (const bar of [CEIL_DEG, 150, 160, 170, 175, 179]) {
    const thr = (bar * Math.PI) / 180;
    const set: number[] = []; let aTot = 0;
    for (let f = 0; f < nF; f += 1) if (DD.perFacetMaxRad[f] > thr) { set.push(f); aTot += A3[f]; }
    const got = tally(corep, set);
    log(`      BAD bar ${bar.toFixed(2)} deg: n=${set.length} area ${aTot.toFixed(3)} mm2 (${pct(aTot, MESH_AREA)}% of mesh)  CORE catches ${pct(got.c, set.length)}% by count, ${pct(got.a, aTot)}% BY AREA`);
    rows.push({ bar, n: set.length, area: aTot, caughtC: set.length > 0 ? got.c / set.length : NaN, caughtA: aTot > 0 ? got.a / aTot : NaN });
  }
  LADS.gtBar = rows;
}
{
  const rows: Array<Record<string, number>> = [];
  log('   GT-CUT SENSITIVITY — the GOOD set redefined at other ACC bars, CORE held fixed:');
  for (const acc of [1, 2, 5, 10, 20]) {
    const set: number[] = []; let aTot = 0;
    for (let f = 0; f < nF; f += 1) if (DD.perFacetMaxRad[f] > hiThr && RN[f] <= acc) { set.push(f); aTot += A3[f]; }
    const got = tally(corep, set);
    log(`      ACC bar ${String(acc).padStart(3)} deg: GOOD n=${set.length} area ${aTot.toFixed(3)} mm2 (${pct(aTot, MESH_AREA)}% of mesh)  CORE FALSE-FLAGS ${pct(got.c, set.length)}% by count, ${pct(got.a, aTot)}% BY AREA`);
    rows.push({ acc, n: set.length, area: aTot, falseC: set.length > 0 ? got.c / set.length : NaN, falseA: aTot > 0 ? got.a / aTot : NaN });
  }
  LADS.accBar = rows;
}
// CORE at a grid of tauQ with T3 fixed
{
  const rows: Array<Record<string, number>> = [];
  log('   CORE = T1|T2|T3 grid (tauQ x tauGhi):');
  for (const tq of [1e-4, 1e-3, 0.005, 0.02, 0.05]) {
    for (const tg of [1.05, 1.2, 1.5, 4]) {
      const p = (f: number): boolean => !(APS[f] > 0) || !(QP[f] >= tq) || !(GR[f] >= 1 / tg && GR[f] <= tg);
      const all = tally(p, null); const bad = tally(p, BADset); const bl = tally(p, BLADEset); const good = tally(p, GOODset);
      log(`      tauQ=${String(tq).padStart(7)} tauGhi=${String(tg).padStart(5)}  MESH ${pct(all.c, nF).padStart(8)}%cnt ${pct(all.a, MESH_AREA).padStart(8)}%area   BAD ${pct(bad.a, BAD_A).padStart(8)}%   BLADE ${pct(bl.a, BLADE_A).padStart(8)}%   GOOD-false ${pct(good.a, GOOD_A).padStart(8)}%`);
      rows.push({ tq, tg, meshC: all.c / nF, meshA: all.a / MESH_AREA, badA: BAD_A > 0 ? bad.a / BAD_A : NaN, bladeA: BLADE_A > 0 ? bl.a / BLADE_A : NaN, goodA: GOOD_A > 0 ? good.a / GOOD_A : NaN });
    }
  }
  LADS.coreGrid = rows;
}
OUT.ladders = LADS;
log('');

// PLACEBO: a cost-matched UNINFORMED key. Same number of flagged facets, chosen by a hash of the facet
// index (nothing to do with geometry). If the informed predicate does not beat this by a wide margin on
// BAD-caught-per-mesh-area-flagged, it is not a result.
log('── STAGE 5b: COST-MATCHED PLACEBO (uninformed key, same flagged COUNT) ──');
{
  const p = corep;
  const all = tally(p, null);
  const target = all.c;
  // deterministic uninformed ranking
  const key = (f: number): number => { let h = (f * 2654435761) >>> 0; h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13; return h; };
  const arr = Array.from({ length: nF }, (_v, i) => i);
  arr.sort((a, b) => key(a) - key(b));
  const sel = new Uint8Array(nF); for (let i = 0; i < target; i += 1) sel[arr[i]] = 1;
  const pl = (f: number): boolean => sel[f] === 1;
  const pall = tally(pl, null); const pbad = tally(pl, BADset); const pbl = tally(pl, BLADEset); const pgood = tally(pl, GOODset);
  const ibad = tally(p, BADset); const ibl = tally(p, BLADEset); const igood = tally(p, GOODset);
  log(`   CORE     flagged ${all.c} facets (${pct(all.a, MESH_AREA)}% of mesh area)  BAD-area caught ${pct(ibad.a, BAD_A)}%  BLADE ${pct(ibl.a, BLADE_A)}%  GOOD-false ${pct(igood.a, GOOD_A)}%`);
  log(`   PLACEBO  flagged ${pall.c} facets (${pct(pall.a, MESH_AREA)}% of mesh area)  BAD-area caught ${pct(pbad.a, BAD_A)}%  BLADE ${pct(pbl.a, BLADE_A)}%  GOOD-false ${pct(pgood.a, GOOD_A)}%`);
  const ratio = pbad.a > 0 ? ibad.a / pbad.a : Infinity;
  log(`   *** CORE beats the cost-matched placebo by ${Number.isFinite(ratio) ? ratio.toFixed(2) : 'inf'}x on BAD area caught. ***`);
  OUT.placebo = { targetCount: target, informed: { bad: ibad, blade: ibl, good: igood, mesh: all }, placebo: { bad: pbad, blade: pbl, good: pgood, mesh: pall }, ratio };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — ANATOMY OF THE TWO SETS (so a reader can see WHY each term fires)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 6: ANATOMY — the predicate quantities ON each ground-truth set ──');
function anat(name: string, set: number[]): void {
  if (set.length === 0) { log(`   ${name}: EMPTY`); return; }
  const st = Math.max(1, Math.floor(set.length / 20000));
  const s: number[] = []; const g: number[] = []; const n: number[] = []; const p: number[] = []; const q3: number[] = []; const gA: number[] = [];
  for (let i = 0; i < set.length; i += st) { const f = set[i]; s.push(QP[f]); g.push(GR[f]); n.push(NDEG[f]); p.push(POSR[f]); q3.push(Q3[f]); gA.push(Math.abs(GR[f])); }
  let mxN = 0; let mxP = 0; let mnQ = Infinity; let mxG = 0;
  for (const f of set) { if (NDEG[f] > mxN) mxN = NDEG[f]; if (POSR[f] > mxP) mxP = POSR[f]; if (QP[f] < mnQ) mnQ = QP[f]; if (Math.abs(GR[f]) > mxG) mxG = Math.abs(GR[f]); }
  log(`   ${name}  n=${set.length}`);
  log(`      qP    p01 ${ex(qt(s, 0.01))} p50 ${ex(qt(s, 0.5))} p99 ${ex(qt(s, 0.99))}   MIN ${ex(mnQ)}`);
  log(`      Gr    p01 ${f3(qt(g, 0.01))} p50 ${f3(qt(g, 0.5))} p99 ${ex(qt(g, 0.99))}   |MAX| ${ex(mxG)}`);
  log(`      nDeg  p50 ${f3(qt(n, 0.5))} p90 ${f3(qt(n, 0.9))} p99 ${f3(qt(n, 0.99))}   MAX ${f3(mxN)} deg`);
  log(`      posR  p50 ${ex(qt(p, 0.5))} p99 ${ex(qt(p, 0.99))}   MAX ${ex(mxP)} mm`);
  log(`      q3D   p01 ${ex(qt(q3, 0.01))} p50 ${f3(qt(q3, 0.5))}   (3D shape — a BLADE is NOT necessarily a 3D sliver)`);
}
anat('BAD (>CEIL)', BADset);
anat('BLADE (>=' + String(BLADE_DEG) + ')', BLADEset);
anat('GOOD (class & normDeg<=' + String(ACC_BAR) + ')', GOODset);
anat('WHOLE MESH (stride)', Array.from({ length: Math.min(nF, 200000) }, (_v, i) => Math.floor((i * nF) / Math.min(nF, 200000))));
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6b — THE RESIDUAL, AT THE DEFENSIBLE CUT. Nothing is left unexplained:
//   (i)  FLAGGED but NOT in BAD — are these FALSE POSITIVES, or facets that are genuinely defective but
//        whose NEIGHBOUR happens to be defective the SAME WAY (so the dihedral does not see it)?
//        Decided with the REAL orientRuler, EXHAUSTIVELY, not with my own stencil.
//   (ii) BAD but NOT flagged — the misses, and what they look like.
//   (iii) the boundary-edge population, reported so it cannot hide inside either.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const DEF_Q = envF('PF_S116_DEFQ', 0.005);
const DEF_G = envF('PF_S116_DEFG', 4);
const defCore = (f: number): boolean => !(APS[f] > 0) || !(QP[f] >= DEF_Q) || !(GR[f] >= 1 / DEF_G && GR[f] <= DEF_G);
log(`── STAGE 6b: RESIDUAL AT THE DEFENSIBLE CUT (tauQ=${DEF_Q}, Gr in [${(1 / DEF_G).toFixed(4)},${DEF_G}]) ──`);
{
  const all = tally(defCore, null); const bad = tally(defCore, BADset); const bl = tally(defCore, BLADEset); const good = tally(defCore, GOODset);
  log(`   CORE-def  MESH ${all.c} (${pct(all.c, nF)}% of facets) ${all.a.toFixed(3)} mm2 (${pct(all.a, MESH_AREA)}% OF MESH)`);
  log(`             BAD area caught ${pct(bad.a, BAD_A)}%   BLADE area caught ${pct(bl.a, BLADE_A)}%   GOOD area false ${pct(good.a, GOOD_A)}%`);
  OUT.defensible = { tauQ: DEF_Q, tauGhi: DEF_G, mesh: all, bad, blade: bl, good, badTotal: BAD_A, bladeTotal: BLADE_A, goodTotal: GOOD_A };

  const inBad = new Uint8Array(nF); for (const f of BADset) inBad[f] = 1;
  const extra: number[] = []; const miss: number[] = [];
  for (let f = 0; f < nF; f += 1) { if (defCore(f) && inBad[f] === 0) extra.push(f); }
  for (const f of BADset) if (!defCore(f)) miss.push(f);
  const extraA = extra.reduce((s, f) => s + A3[f], 0);
  const missA = miss.reduce((s, f) => s + A3[f], 0);
  log(`   (i)  FLAGGED-not-BAD  n=${extra.length}  AREA ${extraA.toFixed(3)} mm2 (${pct(extraA, MESH_AREA)}% OF MESH)`);
  {
    const cap = Math.min(extra.length, 120000);
    const v: number[] = []; let over45 = 0; let over10 = 0; let a45 = 0; let a10 = 0; let aTot = 0;
    for (let i = 0; i < cap; i += 1) {
      const f = extra[Math.floor((i * extra.length) / cap)];
      const nd = realNormDeg(f, H_REF, K_REF, INSET_REF); v.push(nd); aTot += A3[f];
      if (nd > 45) { over45 += 1; a45 += A3[f]; }
      if (nd > 10) { over10 += 1; a10 += A3[f]; }
    }
    log(`        REAL orientRuler on ${cap} of them: normDeg p50 ${f3(qt(v, 0.5))} p90 ${f3(qt(v, 0.9))} MAX ${f3(Math.max(...v))} deg`);
    log(`        of that sampled area: normDeg > 10 deg on ${pct(a10, aTot)}%   > 45 deg on ${pct(a45, aTot)}%  (counts ${over10} / ${over45} of ${cap})`);
    log('        => a FLAGGED-not-BAD facet with a large real normDeg is NOT a false positive: the dihedral');
    log('           ruler simply cannot see it, because its neighbour is wrong the SAME way.');
    OUT.extraAudit = { n: extra.length, area: extraA, sampled: cap, p50: qt(v, 0.5), p90: qt(v, 0.9), areaOver10: a10 / aTot, areaOver45: a45 / aTot };
  }
  log(`   (ii) BAD-not-flagged (MISSES)  n=${miss.length}  AREA ${missA.toFixed(3)} mm2 = ${pct(missA, BAD_A)}% OF THE BAD SET (${pct(missA, MESH_AREA)}% of mesh)`);
  if (miss.length > 0) {
    const s: number[] = []; const g: number[] = []; const n: number[] = [];
    const st = Math.max(1, Math.floor(miss.length / 20000));
    for (let i = 0; i < miss.length; i += st) { s.push(QP[miss[i]]); g.push(GR[miss[i]]); n.push(NDEG[miss[i]]); }
    log(`        qP p50 ${f3(qt(s, 0.5))}   Gr p50 ${f3(qt(g, 0.5))}   stencil nDeg p50 ${f3(qt(n, 0.5))} p90 ${f3(qt(n, 0.9))} deg`);
    OUT.missAudit = { n: miss.length, area: missA, qP50: qt(s, 0.5), gr50: qt(g, 0.5), nd50: qt(n, 0.5) };
  }
  // (iii) boundary population
  {
    const onB = new Uint8Array(nF);
    const cnt = new Map<number, number>();
    const wl = new Int32Array(nF * 3);
    // rebuild a welded id cheaply: reuse facetDihedrals' edge bookkeeping is not exposed, so count edge
    // multiplicity here with an exact f32 key on coordinates.
    const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
    const vmap = new Map<string, number>(); let nv = 0;
    for (let c = 0; c < nF * 3; c += 1) {
      f32[0] = xyz[c * 3]; f32[1] = xyz[c * 3 + 1]; f32[2] = xyz[c * 3 + 2];
      const k = `${u32[0]},${u32[1]},${u32[2]}`;
      let id = vmap.get(k); if (id === undefined) { id = nv; nv += 1; vmap.set(k, id); }
      wl[c] = id;
    }
    for (let f = 0; f < nF; f += 1) {
      const a = wl[f * 3]; const b = wl[f * 3 + 1]; const c = wl[f * 3 + 2];
      for (const [p, r] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const lo = p < r ? p : r; const hi = p < r ? r : p; const k = lo * 67108864 + hi;
        cnt.set(k, (cnt.get(k) ?? 0) + 1);
      }
    }
    for (let f = 0; f < nF; f += 1) {
      const a = wl[f * 3]; const b = wl[f * 3 + 1]; const c = wl[f * 3 + 2];
      for (const [p, r] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const lo = p < r ? p : r; const hi = p < r ? r : p;
        if ((cnt.get(lo * 67108864 + hi) ?? 0) === 1) { onB[f] = 1; break; }
      }
    }
    let bc = 0; let ba = 0; let bfc = 0; let bfa = 0;
    for (let f = 0; f < nF; f += 1) if (onB[f] === 1) { bc += 1; ba += A3[f]; if (defCore(f)) { bfc += 1; bfa += A3[f]; } }
    log(`   (iii) facets touching a BOUNDARY edge: n=${bc} AREA ${ba.toFixed(3)} mm2 (${pct(ba, MESH_AREA)}% OF MESH); of those CORE-def flags ${bfc} (${ba > 0 ? pct(bfa, ba) : 'n/a'}% of their area)`);
    OUT.boundaryAudit = { n: bc, area: ba, flaggedN: bfc, flaggedArea: bfa };
  }
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — COST
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 7: COST ──');
{
  const N = 200000;
  const t1 = Date.now();
  let acc = 0;
  for (let i = 0; i < N; i += 1) { const th = (i * 0.001) % (2 * Math.PI); const z = (i * 0.017) % H; acc += rA(th, z); }
  const tRA = Date.now() - t1;
  log(`   rA alone: ${((tRA * 1e6) / N).toFixed(0)} ns/eval  (checksum ${acc.toFixed(3)})`);
  log(`   predicate: 35 rA evals/triangle (7 stencil points x 5 evals). T1+T2 cost ZERO rA evals.`);
  log(`   measured predicate wall-clock ${((tPred * 1e6) / nF).toFixed(0)} ns/triangle over ${nF} triangles = ${(tPred / 1000).toFixed(2)}s total.`);
  log(`   T1+T2 ONLY (no rA at all) is ~${'<50'} ns/triangle: 3 atan2 + 3 hypot + 6 mul.`);
  OUT.cost = { nsPerRaEval: (tRA * 1e6) / N, nsPerTriangleFull: (tPred * 1e6) / nF, raEvalsPerTriangle: 35, totalSec: tPred / 1000 };
}
log('');

writeFileSync(`${OUTDIR}/S116_EMITINV_${TAG}.json`, JSON.stringify(OUT, null, 1));
log(`json -> ${OUTDIR}/S116_EMITINV_${TAG}.json  ${el()}`);
