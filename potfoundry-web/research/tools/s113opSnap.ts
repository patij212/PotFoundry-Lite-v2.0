// s113opSnap.ts — OPERATOR 3: VERTEX SNAP ONTO THE CREASE. Offline, on the STL. Zero triangle cost.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HYPOTHESIS, AND THE ONE THING THAT DECIDES IT BEFORE ANY SNAP IS APPLIED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A straddling facet has a crease cutting through its interior. The crease enters through one edge and
// leaves through another; the two crossings and the vertex they share cut a SLIVER off the facet. If that
// vertex is moved ONTO the crease the sliver collapses to zero and the whole facet lies on one flank —
// conformed, at zero triangle cost. That only works if the vertex is ALREADY NEAR the crease. So PHASE 2
// below reports the vertex->crease distance distribution FIRST, and if the vertices are not near, the
// operator is dead on arrival and this tool says so instead of forcing it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED KILL LINE — written before the first run, quoted verbatim from the brief
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   >= 2x reduction in the target set's over-45deg AREA
//   AND ZERO facets pushed over 0.01 mm position
//   AND no more than 5% of 1-ring neighbours made worse.
// All three must hold. Any one failing REFUTES the operator at that rung.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE POSITION MEASUREMENT IS NOT THE DRIVER'S
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `sagOfNRaw` measures the distance from analytic samples to the triangle's INFINITE PLANE. That ruler is
// BANNED as a verdict in this campaign (it reads ~0 for a crest sitting above a tent of near-coincident
// planes). The position ruler here is `posMaxOf`: the max over an order-n barycentric lattice of the
// facet's PARAMETER footprint of the distance from the analytic point to the TRIANGLE ITSELF (clamped,
// Ericson). That is the one-sided surface->mesh distance restricted to this facet. It OVER-reports (the
// true nearest mesh point may lie on a neighbour), i.e. it is sound in the REFUSAL direction, which is the
// direction a hard 0.01 mm bar needs. An n-LADDER runs on a subsample so "it converged" is measured, and a
// NEGATIVE CONTROL runs it on random ordinary facets so a broken ruler cannot hide behind a bad class.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// INSTRUMENT DISCIPLINE ENFORCED HERE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  * NEVER a bare COUNT and NEVER a bare MAX — every population is COUNT + AREA-share + MAX.
//  * `orientOfFacet`'s `inset` is a MEASUREMENT CHOICE and is passed EXPLICITLY and SWEPT (0 / 0.02 / 0.05).
//  * The membership of the target set is READ from S113's pinned NDJSON, never re-derived. Two CONTROLS
//    check it hasn't drifted: (a) the pinned edge id `e` must still resolve to the pinned facet pair and
//    the pinned `measDeg` to 1e-9; (b) `locateTurnAdaptive` is re-run at iters 14 AND 20 on a subsample and
//    the printed values diffed. If either fires the run is VOID and says so.
//  * `locateTurnAdaptive` CARRIES AN UNPATCHED TIE-BREAK DEFECT (orientRuler.ts:529): on a smooth segment
//    it walks to the left end and returns a plausible `s`. `turn` is therefore thresholded on EVERY use
//    and the threshold is SWEPT.
//  * Moved vertices are rounded to f32 (`Math.fround`) so the mesh stays weldable by exact equality, the
//    way every other tool here reads it. The rounding error is measured and printed, not assumed small.
//
// Usage: bash research/tools/run-s113-opsnap.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJSON = process.env.PF_S113_SET
  ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const TAG = process.env.PF_S113_TAG ?? 'GOTH';
const K = Math.round(envF('PF_S113_K', 8));
const INSET_MAIN = envF('PF_S113_INSET', 0.05);
const INSETS = (process.env.PF_S113_INSETS ?? '0,0.02,0.05').split(',').map(Number);
const TURN_THR_DEG = envF('PF_S113_TURN', 30);
const TURN_SWEEP = (process.env.PF_S113_TURNS ?? '20,30,45,60').split(',').map(Number);
const RUNGS = (process.env.PF_S113_RUNGS ?? '0.05,0.10,0.25,0.50').split(',').map(Number);
const POS_N = Math.round(envF('PF_S113_POSN', 12));
const POS_BAR_MM = envF('PF_S113_POSBAR', 0.01);
const HI_DEG = envF('PF_S113_HI_DEG', 45);
const SUB = Math.round(envF('PF_S113_SUB', 200));
const DIMS: StyleDims = { H: envF('PF_S113_H', 120), Rb: envF('PF_S113_RB', 40), Rt: envF('PF_S113_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
// NOT a spread into Math.max: the touched-facet arrays here run to tens of thousands and a call of that
// arity blows the argument stack. A silent RangeError mid-report is exactly the kind of failure that turns
// a run into a plausible-looking partial answer.
const mx = (v: number[]): number => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; };

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== S113 OPERATOR 3 — VERTEX SNAP ONTO THE CREASE =====');
log(`style ${STYLE}  tag ${TAG}  K ${K}  insetMain ${INSET_MAIN}  turnThr ${TURN_THR_DEG} deg  posN ${POS_N}  posBar ${POS_BAR_MM} mm`);
log(`rungs (snap radius as a fraction of the facet's mean edge length): ${RUNGS.join(' ')}`);
log('');

// ── mesh ────────────────────────────────────────────────────────────────────────────────────────────
const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d0 = facetDihedrals(xyz0, new Uint32Array(nTri * 3).map((_, i) => i));
const nEdge = d0.edgeAngRad.length;
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea0.toFixed(1)} mm2  interior edges ${nEdge}  ${el()}`);

// ── the pinned target set ───────────────────────────────────────────────────────────────────────────
interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row { e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number; locs: Loc[] }
const LIMIT = Math.round(envF('PF_S113_LIMIT', 0));      // >0 => SMOKE RUN on the first N pairs only
let rows: Row[] = readFileSync(NDJSON, 'utf8').trim().split('\n').map((L) => JSON.parse(L) as Row);
if (LIMIT > 0) { rows = rows.slice(0, LIMIT); log(`*** SMOKE RUN: PF_S113_LIMIT=${LIMIT}; this is NOT the pinned set and no verdict may be quoted from it. ***`); }
const uniqF: number[] = [...new Set(rows.flatMap((r) => [r.f1, r.f2]))].sort((a, b) => a - b);
let targetArea0 = 0;
for (const f of uniqF) targetArea0 += d0.areaMm2[f];
log(`target set: ${rows.length} pairs, ${uniqF.length} unique facets, AREA ${targetArea0.toFixed(3)} mm2 = ${((targetArea0 / meshArea0) * 100).toFixed(4)}% of mesh   (S113 pinned: 3282 / 6193 / 69.826 / 0.1816%)`);

// CONTROL A — the pinned edge ids must still resolve to the pinned pair and angle.
{
  let bad = 0; let worstD = 0;
  for (const r of rows) {
    const a = d0.edgeF1[r.e]; const b = d0.edgeF2[r.e];
    if (!((a === r.f1 && b === r.f2) || (a === r.f2 && b === r.f1))) bad += 1;
    worstD = Math.max(worstD, Math.abs((d0.edgeAngRad[r.e] * 180) / Math.PI - r.measDeg));
  }
  log(`CONTROL A (edge identity): ${bad} of ${rows.length} pinned edge ids mismatch; max |measDeg drift| ${worstD.toExponential(3)} deg`);
  if (bad > 0 || worstD > 1e-9) { log('*** RUN VOID: the pinned set does not resolve on this mesh. ***'); process.exit(5); }
}

// ── geometry helpers over an arbitrary coordinate array ─────────────────────────────────────────────
const th3 = (a: Float64Array, f: number): [number, number, number] => {
  const t = Math.atan2(a[f * 9 + 1], a[f * 9]);
  const b = t + dThRaw(t, Math.atan2(a[f * 9 + 4], a[f * 9 + 3]));
  const c = t + dThRaw(t, Math.atan2(a[f * 9 + 7], a[f * 9 + 6]));
  return [t, b, c];
};
const rRefOf = (a: Float64Array, f: number): number => (
  Math.hypot(a[f * 9], a[f * 9 + 1]) + Math.hypot(a[f * 9 + 3], a[f * 9 + 4]) + Math.hypot(a[f * 9 + 6], a[f * 9 + 7])
) / 3;
const meanEdgeLen = (a: Float64Array, f: number): number => (
  Math.hypot(a[f * 9 + 3] - a[f * 9], a[f * 9 + 4] - a[f * 9 + 1], a[f * 9 + 5] - a[f * 9 + 2])
  + Math.hypot(a[f * 9 + 6] - a[f * 9 + 3], a[f * 9 + 7] - a[f * 9 + 4], a[f * 9 + 8] - a[f * 9 + 5])
  + Math.hypot(a[f * 9] - a[f * 9 + 6], a[f * 9 + 1] - a[f * 9 + 7], a[f * 9 + 2] - a[f * 9 + 8])
) / 3;

function normDegOf(a: Float64Array, f: number, inset: number): number {
  const [ath, bth, cth] = th3(a, f);
  return orientOfFacet(nsKink,
    a[f * 9], a[f * 9 + 1], a[f * 9 + 2], a[f * 9 + 3], a[f * 9 + 4], a[f * 9 + 5],
    a[f * 9 + 6], a[f * 9 + 7], a[f * 9 + 8], ath, bth, cth, { k: K, inset, scratch }).normDeg;
}

/** squared distance from p to triangle abc, 3D, Ericson's region test. */
function distPtTri(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const apx = px - ax; const apy = py - ay; const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(px - ax, py - ay, pz - az);
  const bpx = px - bx; const bpy = py - by; const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(px - bx, py - by, pz - bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(px - (ax + abx * v), py - (ay + aby * v), pz - (az + abz * v));
  }
  const cpx = px - cx; const cpy = py - cy; const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(px - cx, py - cy, pz - cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(px - (ax + acx * w), py - (ay + acy * w), pz - (az + acz * w));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(px - (bx + (cx - bx) * w), py - (by + (cy - by) * w), pz - (bz + (cz - bz) * w));
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den; const w = vc * den;
  return Math.hypot(px - (ax + abx * v + acx * w), py - (ay + aby * v + acy * w), pz - (az + abz * v + acz * w));
}

/** POSITION RULER: max over an order-n lattice of the parameter footprint of dist(analytic pt, TRIANGLE). */
function posMaxOf(a: Float64Array, f: number, n: number): number {
  const [ath, bth, cth] = th3(a, f);
  const ax = a[f * 9]; const ay = a[f * 9 + 1]; const az = a[f * 9 + 2];
  const bx = a[f * 9 + 3]; const by = a[f * 9 + 4]; const bz = a[f * 9 + 5];
  const cx = a[f * 9 + 6]; const cy = a[f * 9 + 7]; const cz = a[f * 9 + 8];
  let best = 0;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; i + j <= n; j += 1) {
      const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const r = rA(th, z);
      const dd = distPtTri(r * Math.cos(th), r * Math.sin(th), z, ax, ay, az, bx, by, bz, cx, cy, cz);
      if (dd > best) best = dd;
    }
  }
  return best;
}

// ── CONTROL B — the position ruler, on the class AND on ordinary facets, with an n-ladder ───────────
{
  const sub = uniqF.filter((_, i) => i % Math.max(1, Math.floor(uniqF.length / SUB)) === 0).slice(0, SUB);
  const lad = [6, 12, 17, 24].map((n) => sub.map((f) => posMaxOf(xyz0, f, n)));
  log('');
  log('── CONTROL B: the POSITION ruler (surface -> TRIANGLE, not the banned plane ruler) ──');
  for (let i = 0; i < 4; i += 1) {
    const n = [6, 12, 17, 24][i];
    log(`  n=${String(n).padStart(2)}  target subsample (${sub.length})  p50 ${(q(lad[i], 0.5) * 1000).toFixed(2)} um  p90 ${(q(lad[i], 0.9) * 1000).toFixed(2)} um  MAX ${(mx(lad[i]) * 1000).toFixed(2)} um`);
  }
  const rnd: number[] = [];
  let seed = 12345;
  for (let i = 0; i < SUB; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    rnd.push(posMaxOf(xyz0, seed % nTri, 12));
  }
  log(`  NEGATIVE CONTROL, ${SUB} random ordinary facets, n=12: p50 ${(q(rnd, 0.5) * 1000).toFixed(3)} um  p90 ${(q(rnd, 0.9) * 1000).toFixed(3)} um  MAX ${(mx(rnd) * 1000).toFixed(3)} um`);
  log('  (if the negative control were large the ruler would be broken and every number below void)');
}

// ── CONTROL C — locateTurnAdaptive reproduces the pinned locs, and is stable in iters ───────────────
{
  const sub = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / SUB)) === 0).slice(0, SUB);
  let worst14 = 0; let worstT14 = 0; let moved20 = 0; let worst20 = 0; let nProbe = 0;
  for (const r of sub) {
    for (const f of [r.f1, r.f2]) {
      const [ath, bth, cth] = th3(xyz0, f);
      const ths = [ath, bth, cth];
      const zs = [xyz0[f * 9 + 2], xyz0[f * 9 + 5], xyz0[f * 9 + 8]];
      const rRef = rRefOf(xyz0, f);
      for (let ei = 0; ei < 3; ei += 1) {
        const j = (ei + 1) % 3;
        const a14 = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 14);
        const a20 = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 20);
        const pin = r.locs.find((l) => l.f === f && l.edge === ei);
        if (pin !== undefined) {
          worst14 = Math.max(worst14, Math.abs(a14.s - pin.s));
          worstT14 = Math.max(worstT14, Math.abs((a14.turn * 180) / Math.PI - pin.turnDeg));
        }
        const big = (a14.turn * 180) / Math.PI > TURN_THR_DEG || (a20.turn * 180) / Math.PI > TURN_THR_DEG;
        if (big) { nProbe += 1; worst20 = Math.max(worst20, Math.abs(a20.s - a14.s)); if (Math.abs(a20.s - a14.s) > 1e-3) moved20 += 1; }
      }
    }
  }
  log('');
  log('── CONTROL C: locateTurnAdaptive vs the pinned dump, and iters 14 -> 20 ──');
  log(`  reproduces the dump: max |ds| ${worst14.toExponential(2)}   max |dturn| ${worstT14.toExponential(2)} deg  (must be 0)`);
  log(`  iters 14 -> 20 on ${nProbe} large-turn probes: max |ds| ${worst20.toExponential(3)}, ${moved20} moved by > 1e-3`);
  if (worst14 > 0 || worstT14 > 0) log('  *** WARNING: the locator does not reproduce the dump. Treat the plan below as unpinned. ***');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 2 — THE DISTANCE DISTRIBUTION. THIS DECIDES THE OPERATOR BEFORE A SINGLE SNAP IS APPLIED.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// For facet f, the crease crossings on its edges (turn > thr) are points ON the crease. The nearest vertex
// and its distance to the crease are:
//   2 crossings sharing vertex m -> perpendicular foot of m onto the chord between them (the minimal move);
//   1 crossing on edge (i,j)     -> the nearer endpoint, moved ALONG the edge to the crossing;
//   3 crossings                  -> the best of the three 2-crossing readings;
//   0 crossings                  -> NOT ADDRESSABLE by this operator; reported, never silently dropped.
// Distances are measured in the (rRef*theta, z) arclength parameter plane, the same metric `orientRuler`'s
// `cov` uses, so a "distance" here is a millimetre on the surface.
//
// ⚠ THE BUDGET IS CUT ON THE 3-D DISPLACEMENT, NOT ON THE PARAMETER-PLANE ONE. The first cut of this tool
// compared a distance measured in the (rRef*theta, z) plane against the facet's 3-D mean edge length. On
// this class that is not a like-for-like comparison at all: the wall cut admits graphRatio up to 8, i.e.
// facets tilted up to ~83 deg out of the parameter plane, where a 48 um parameter move IS A MUCH LARGER
// MOVE ON THE SURFACE. Both numbers are reported; `move3d` is what the rungs are cut on and what the
// position budget is spent on.
interface Plan {
  f: number; vi: number;             // facet, which of its 3 corners moves
  th: number; z: number;             // target parameter point (on the crease)
  move: number;                      // mm, in the (rRef*theta, z) parameter plane
  move3d: number;                    // mm, the actual 3-D displacement of the vertex — THE BUDGET
  L: number;                         // facet 3-D mean edge length, mm
  nCross: number;
  refined: boolean; refShift: number;
}

// The three edge locators are a pure function of the ORIGINAL facet, so they are computed ONCE per facet
// and reused across every turn threshold. (Recomputing them per threshold was 4x the rA budget for
// bit-identical numbers — and, worse, would have let a threshold sweep silently become a re-derivation.)
const edgeLoc = new Map<number, Array<{ s: number; turnDeg: number }>>();
function locsOf(a: Float64Array, f: number): Array<{ s: number; turnDeg: number }> {
  const hit = edgeLoc.get(f);
  if (hit !== undefined) return hit;
  const [ath, bth, cth] = th3(a, f);
  const ths = [ath, bth, cth];
  const zs = [a[f * 9 + 2], a[f * 9 + 5], a[f * 9 + 8]];
  const rRef = rRefOf(a, f);
  const out: Array<{ s: number; turnDeg: number }> = [];
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    const lt = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 14);
    out.push({ s: lt.s, turnDeg: (lt.turn * 180) / Math.PI });
  }
  edgeLoc.set(f, out);
  return out;
}

function planFor(a: Float64Array, f: number, thrDeg: number, refine: boolean): Plan | null {
  const [ath, bth, cth] = th3(a, f);
  const ths = [ath, bth, cth];
  const zs = [a[f * 9 + 2], a[f * 9 + 5], a[f * 9 + 8]];
  const rRef = rRefOf(a, f);
  const px = [rRef * ths[0], rRef * ths[1], rRef * ths[2]];
  const py = [zs[0], zs[1], zs[2]];
  const el3 = locsOf(a, f);
  const cross: Array<{ ei: number; s: number; x: number; y: number }> = [];
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    if (el3[ei].turnDeg <= thrDeg) continue;
    cross.push({ ei, s: el3[ei].s, x: px[ei] + (px[j] - px[ei]) * el3[ei].s, y: py[ei] + (py[j] - py[ei]) * el3[ei].s });
  }
  if (cross.length === 0) return null;
  const L = meanEdgeLen(a, f);
  // CANDIDATES: every corner that a crossing can be pulled to. Two crossings sharing a corner give the
  // perpendicular foot on their chord (the minimal move that collapses the sliver); a single crossing
  // gives BOTH endpoints of its edge (the nearer one is usually right, but on an anisotropic facet the
  // farther one can be the smaller 3-D move, and this operator is judged on 3-D displacement).
//
// ⚠ THE CANDIDATE RULE IS FORCED BY THE GEOMETRY, NOT CHOSEN TO MINIMISE THE MOVE. The first cut of this
// let every corner compete and took the smallest 3-D displacement — and it MEASURED A CLEAN NULL: 182
// vertices "moved" and every printed number was unchanged to four decimals at BOTH rungs. The reason is
// that when the crease crosses edges m and m-1, the OTHER two corners each sit next to one of those
// crossings, so "move corner j onto the crossing on the edge it is an endpoint of" is a ~0 mm move that
// does nothing at all — and minimising picked it every time. The two rungs coming out bit-identical is
// what exposed it. When two crossings SHARE a corner, that corner is the one the crease cuts off and it is
// the only legal target.
  const cands: Array<{ m: number; x: number; y: number }> = [];
  for (let m = 0; m < 3; m += 1) {
    const inc = cross.filter((c) => c.ei === m || c.ei === (m + 2) % 3);
    if (inc.length < 2) continue;
    const [p1, p2] = inc;
    const ex = p2.x - p1.x; const ey = p2.y - p1.y;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((px[m] - p1.x) * ex + (py[m] - p1.y) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    cands.push({ m, x: p1.x + ex * t, y: p1.y + ey * t });
  }
  if (cands.length === 0) {
    // exactly ONE crossing: the crease enters through this edge and leaves through a VERTEX (or the
    // detector missed the second one). Pulling either endpoint onto the crossing collapses the region on
    // that side; take the nearer endpoint. This case is counted and reported separately.
    const c = cross[0];
    const i = c.ei; const j = (c.ei + 1) % 3;
    const di = Math.hypot(px[i] - c.x, py[i] - c.y); const dj = Math.hypot(px[j] - c.x, py[j] - c.y);
    cands.push({ m: di <= dj ? i : j, x: c.x, y: c.y });
  }
  let best: Plan | null = null;
  for (const cd of cands) {
    let bx = cd.x; let by = cd.y;
    let dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
    // REFINE the target onto the true crease: probe perpendicular to the move direction through the foot.
    let refined = false; let refShift = 0;
    if (refine && dd > 1e-12) {
      const ux = (bx - px[cd.m]) / dd; const uy = (by - py[cd.m]) / dd;
      const dl = Math.max(1e-6, 0.5 * dd);
      const lt = locateTurnAdaptive(rA, H, (bx - ux * dl) / rRef, by - uy * dl, (bx + ux * dl) / rRef, by + uy * dl, rRef, 16);
      if ((lt.turn * 180) / Math.PI > thrDeg) {
        const nx2 = bx - ux * dl + 2 * ux * dl * lt.s;
        const ny2 = by - uy * dl + 2 * uy * dl * lt.s;
        refShift = Math.hypot(nx2 - bx, ny2 - by);
        bx = nx2; by = ny2; refined = true;
        dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
      }
    }
    const nth = bx / rRef;
    const nz = by < 0 ? 0 : by > H ? H : by;
    const nr = rA(nth, nz);
    const o = f * 9 + cd.m * 3;
    const m3 = Math.hypot(nr * Math.cos(nth) - a[o], nr * Math.sin(nth) - a[o + 1], nz - a[o + 2]);
    if (best === null || m3 < best.move3d) {
      best = { f, vi: cd.m, th: nth, z: nz, move: dd, move3d: m3, L, nCross: cross.length, refined, refShift };
    }
  }
  return best;
}

log('');
log('══ PHASE 2 — VERTEX -> CREASE DISTANCE. THE GO/NO-GO, BEFORE ANY SNAP. ══');
log('   move3d = the 3-D displacement of the nearest vertex onto the crease. THIS is the budget.');
log('   move   = the same displacement measured in the (rRef*theta, z) parameter plane, for comparison.');
log('   L      = the facet\'s 3-D mean edge length. move3d/L is what the rungs are cut on.');
const planByThr = new Map<number, Plan[]>();
for (const thr of TURN_SWEEP) {
  const ps: Plan[] = [];
  let none = 0; let noneArea = 0;
  for (const f of uniqF) {
    const p = planFor(xyz0, f, thr, true);
    if (p === null) { none += 1; noneArea += d0.areaMm2[f]; continue; }
    ps.push(p);
  }
  planByThr.set(thr, ps);
  const rel = ps.map((p) => p.move3d / p.L);
  const abs = ps.map((p) => p.move3d);
  const par = ps.map((p) => p.move);
  const areaOf = (pred: (p: Plan) => boolean): number => ps.filter(pred).reduce((s, p) => s + d0.areaMm2[p.f], 0);
  log('');
  log(`  turn threshold ${thr} deg:  addressable ${ps.length}/${uniqF.length} facets (${((areaOf(() => true) / targetArea0) * 100).toFixed(2)}% of target AREA);  NO crossing found on ${none} (${((noneArea / targetArea0) * 100).toFixed(2)}% of AREA)`);
  log(`    crossings per facet: 1 -> ${ps.filter((p) => p.nCross === 1).length}   2 -> ${ps.filter((p) => p.nCross === 2).length}   3 -> ${ps.filter((p) => p.nCross === 3).length}`);
  log(`    move3d/L    p10 ${q(rel, 0.1).toFixed(4)}  p50 ${q(rel, 0.5).toFixed(4)}  p90 ${q(rel, 0.9).toFixed(4)}  MAX ${mx(rel).toFixed(4)}`);
  log(`    move3d (um) p10 ${(q(abs, 0.1) * 1000).toFixed(2)}  p50 ${(q(abs, 0.5) * 1000).toFixed(2)}  p90 ${(q(abs, 0.9) * 1000).toFixed(2)}  MAX ${(mx(abs) * 1000).toFixed(2)}`);
  log(`    move   (um) p10 ${(q(par, 0.1) * 1000).toFixed(2)}  p50 ${(q(par, 0.5) * 1000).toFixed(2)}  p90 ${(q(par, 0.9) * 1000).toFixed(2)}  MAX ${(mx(par) * 1000).toFixed(2)}   [parameter plane]`);
  log(`    L      (um) p10 ${(q(ps.map((p) => p.L), 0.1) * 1000).toFixed(1)}  p50 ${(q(ps.map((p) => p.L), 0.5) * 1000).toFixed(1)}  p90 ${(q(ps.map((p) => p.L), 0.9) * 1000).toFixed(1)}`);
  for (const rung of RUNGS) {
    const inR = ps.filter((p) => p.move3d <= rung * p.L);
    const ar = inR.reduce((s, p) => s + d0.areaMm2[p.f], 0);
    log(`    within ${(rung * 100).toFixed(0)}% of L: COUNT ${inR.length} (${((inR.length / uniqF.length) * 100).toFixed(1)}% of facets)  AREA ${ar.toFixed(3)} mm2 (${((ar / targetArea0) * 100).toFixed(1)}% of target)  max move3d ${inR.length > 0 ? (mx(inR.map((p) => p.move3d)) * 1000).toFixed(2) : 'n/a'} um`);
  }
  log(`    refinement onto the true crease fired on ${ps.filter((p) => p.refined).length}; shift p50 ${(q(ps.filter((p) => p.refined).map((p) => p.refShift), 0.5) * 1000).toFixed(3)} um, MAX ${ps.some((p) => p.refined) ? (mx(ps.filter((p) => p.refined).map((p) => p.refShift)) * 1000).toFixed(3) : 'n/a'} um`);
}

// ── PHASE 2b — THE THREE-WAY SPLIT THAT EXPLAINS THE RESULT ───────────────────────────────────────
// `move3d` on this class is BIMODAL, not merely spread: p50 is 0.01 um and p90 is 165 um. So the target
// set is really three populations and mixing them hides everything:
//   NONE  — no crease crossing found on any of the three edges. Outside this operator entirely.
//   NO-OP — a crossing was found but it sits AT a vertex (move3d < MOVE_EPS). The mesh ALREADY has a
//           vertex on the crease and the facet is STILL over the bar, so the crease must run from that
//           vertex ACROSS THE INTERIOR — which a vertex snap cannot touch at any radius. This is the
//           population that makes the tight rungs read exactly 1.000x.
//   REAL  — a crossing strictly inside an edge. The only population the operator can act on.
const MOVE_EPS = envF('PF_S113_MOVE_EPS_UM', 1) / 1000;
const realFacetSet = new Set<number>();
{
  const ps = planByThr.get(TURN_THR_DEG) as Plan[];
  const addr = new Set(ps.map((p) => p.f));
  const noneF = uniqF.filter((f) => !addr.has(f));
  const noop = ps.filter((p) => p.move3d < MOVE_EPS);
  const real = ps.filter((p) => p.move3d >= MOVE_EPS);
  for (const p of real) realFacetSet.add(p.f);
  const ar = (fs: number[]): number => fs.reduce((s, f) => s + d0.areaMm2[f], 0);
  const dmax = (fs: number[]): number => {
    let m = 0;
    for (const r of rows) if (fs.includes(r.f1) || fs.includes(r.f2)) m = Math.max(m, r.measDeg);
    return m;
  };
  const noneA = ar(noneF); const noopA = ar(noop.map((p) => p.f)); const realA = ar(real.map((p) => p.f));
  log('');
  log(`══ PHASE 2b — THE THREE-WAY SPLIT (turn threshold ${TURN_THR_DEG} deg, no-op cut ${MOVE_EPS * 1000} um) ══`);
  log(`  NONE  (no crossing on any edge)      COUNT ${noneF.length}  AREA ${noneA.toFixed(3)} mm2 (${((noneA / targetArea0) * 100).toFixed(2)}% of target)`);
  log(`  NO-OP (crossing AT a vertex)         COUNT ${noop.length}  AREA ${noopA.toFixed(3)} mm2 (${((noopA / targetArea0) * 100).toFixed(2)}% of target)   move3d p90 ${(q(noop.map((p) => p.move3d), 0.9) * 1e6).toFixed(1)} nm`);
  log(`  REAL  (crossing inside an edge)      COUNT ${real.length}  AREA ${realA.toFixed(3)} mm2 (${((realA / targetArea0) * 100).toFixed(2)}% of target)   move3d p50 ${(q(real.map((p) => p.move3d), 0.5) * 1000).toFixed(1)} um  p90 ${(q(real.map((p) => p.move3d), 0.9) * 1000).toFixed(1)} um`);
  log(`  *** THE OPERATOR'S CEILING IS THE REAL CLASS: ${((realA / targetArea0) * 100).toFixed(2)}% of the target AREA. ***`);
  log(`  (dihedral MAX over pinned pairs touching NO-OP facets ${dmax(noop.slice(0, 400).map((p) => p.f)).toFixed(2)} deg — those are over the bar WITH a vertex already on the crease)`);
  const sAll = ps.flatMap((p) => locsOf(xyz0, p.f).filter((l) => l.turnDeg > TURN_THR_DEG).map((l) => l.s));
  const pinned = sAll.filter((s) => s <= 1e-4 || s >= 1 - 1e-4).length;
  log(`  crossing parameter s: ${pinned} of ${sAll.length} (${((pinned / Math.max(1, sAll.length)) * 100).toFixed(1)}%) are pinned at a bisection END (s<=1e-4 or >=1-1e-4), i.e. AT a vertex`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 3/4 — APPLY, AND RE-MEASURE THE WHOLE 1-RING.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A snap moves EVERY facet incident on that vertex. The vertex is identified by EXACT coordinate equality
// (the same test `dihedralRuler.weld` uses), the new position is rounded to f32 so the mesh stays weldable,
// and every incident facet is re-measured — not just the target pair.
const HASHBUF = new Float32Array(3);
const HASHU32 = new Uint32Array(HASHBUF.buffer);
const vHash = (x: number, y: number, z: number): number => {
  HASHBUF[0] = x; HASHBUF[1] = y; HASHBUF[2] = z;
  return ((HASHU32[0] * 0x9e3779b1) ^ (HASHU32[1] * 0x85ebca6b) ^ (HASHU32[2] * 0xc2b2ae35)) | 0;
};

// ── VERTEX INCIDENCE, BUILT ONCE ──────────────────────────────────────────────────────────────────
// Every candidate vertex over ALL rungs is registered, then ONE pass over the 1.14 M facets collects the
// corners that match it. After this, a rung costs no mesh pass at all — and, more importantly, the 1-ring
// is EXACTLY the set of facets a snap can change, so "collateral" below is complete by construction and
// not a sample. (Only a facet incident on a moved vertex can move at all.)
type VKey = { key: [number, number, number]; corners: number[] };
const vertReg = new Map<number, VKey[]>();
function regVertex(x: number, y: number, z: number): VKey {
  const h = vHash(x, y, z);
  let list = vertReg.get(h);
  if (list === undefined) { list = []; vertReg.set(h, list); }
  for (const e of list) if (e.key[0] === x && e.key[1] === y && e.key[2] === z) return e;
  const e: VKey = { key: [x, y, z], corners: [] };
  list.push(e);
  return e;
}
{
  const allPlans = TURN_SWEEP.map((t) => planByThr.get(t) as Plan[]).flat();
  for (const p of allPlans) { const o = p.f * 9 + p.vi * 3; regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]); }
  let hits = 0;
  for (let f = 0; f < nTri; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const o = f * 9 + k * 3;
      const list = vertReg.get(vHash(xyz0[o], xyz0[o + 1], xyz0[o + 2]));
      if (list === undefined) continue;
      for (const e of list) {
        if (e.key[0] === xyz0[o] && e.key[1] === xyz0[o + 1] && e.key[2] === xyz0[o + 2]) { e.corners.push(o); hits += 1; break; }
      }
    }
  }
  let distinct = 0;
  for (const l of vertReg.values()) distinct += l.length;
  log('');
  log(`incidence: ${distinct} candidate vertices, ${hits} incident corners (mean valence ${(hits / Math.max(1, distinct)).toFixed(2)})  ${el()}`);
}

interface Rung {
  rung: number; guarded: boolean; nMoved: number; nPlans: number; nRejected: number;
  affected: number[]; movedXyz: Float64Array;
  maxRound: number; nConflict: number; nMultiVert: number;
}

const workXyz = new Float64Array(xyz0);           // ONE working copy, restored between rungs

/** signed-area/orientation test used by the validity guard: does this corner set stay non-inverted? */
function facetOk(a: Float64Array, f: number): boolean {
  const o = f * 9;
  const ux = a[o + 3] - a[o]; const uy = a[o + 4] - a[o + 1]; const uz = a[o + 5] - a[o + 2];
  const wx = a[o + 6] - a[o]; const wy = a[o + 7] - a[o + 1]; const wz = a[o + 8] - a[o + 2];
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  const len = Math.hypot(cx, cy, cz);
  if (!(len > 1e-14)) return false;
  return (cx * G0.nx[f] + cy * G0.ny[f] + cz * G0.nz[f]) / len > 0;
}

function applyRung(ps: Plan[], rung: number, guarded: boolean): Rung {
  workXyz.set(xyz0);
  // one target per vertex — smallest 3-D move wins
  const byVert = new Map<VKey, { th: number; z: number; move3d: number }>();
  let nConflict = 0;
  const chosen: Plan[] = [];
  for (const p of ps) {
    if (!(p.move3d <= rung * p.L)) continue;
    chosen.push(p);
    const o = p.f * 9 + p.vi * 3;
    const e = regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]);
    const prev = byVert.get(e);
    if (prev !== undefined) { nConflict += 1; if (p.move3d >= prev.move3d) continue; }
    byVert.set(e, { th: p.th, z: p.z, move3d: p.move3d });
  }
  // apply, vertex by vertex, with an optional VALIDITY GUARD. The guard is part of the operator, not of
  // the ruler: a real implementation would never ship a snap that inverts or collapses an incident facet.
  // Both arms are run and reported so the cost of the guard is visible rather than assumed.
  let maxRound = 0; let nRejected = 0; let nMoved = 0;
  const touched = new Set<number>();
  const perFacetMoved = new Map<number, number>();
  for (const [e, v] of byVert) {
    const z = v.z < 0 ? 0 : v.z > H ? H : v.z;
    const r = rA(v.th, z);
    const nx = Math.fround(r * Math.cos(v.th)); const ny = Math.fround(r * Math.sin(v.th)); const nz = Math.fround(z);
    const old: number[] = [];
    for (const o of e.corners) old.push(workXyz[o], workXyz[o + 1], workXyz[o + 2]);
    for (const o of e.corners) { workXyz[o] = nx; workXyz[o + 1] = ny; workXyz[o + 2] = nz; }
    if (guarded) {
      let ok = true;
      for (const o of e.corners) if (!facetOk(workXyz, Math.floor(o / 9))) { ok = false; break; }
      if (!ok) {
        for (let i = 0; i < e.corners.length; i += 1) {
          const o = e.corners[i];
          workXyz[o] = old[i * 3]; workXyz[o + 1] = old[i * 3 + 1]; workXyz[o + 2] = old[i * 3 + 2];
        }
        nRejected += 1;
        continue;
      }
    }
    nMoved += 1;
    maxRound = Math.max(maxRound, Math.abs(Math.hypot(nx, ny) - rA(Math.atan2(ny, nx), nz)));
    for (const o of e.corners) {
      const f = Math.floor(o / 9);
      touched.add(f);
      perFacetMoved.set(f, (perFacetMoved.get(f) ?? 0) + 1);
    }
  }
  let nMultiVert = 0;
  for (const c of perFacetMoved.values()) if (c > 1) nMultiVert += 1;
  return {
    rung, guarded, nMoved, nPlans: chosen.length, nRejected,
    affected: [...touched].sort((a, b) => a - b), movedXyz: workXyz, maxRound, nConflict, nMultiVert,
  };
}

/** per-facet normals + areas from a coordinate array. */
function facetGeom(a: Float64Array): { nx: Float64Array; ny: Float64Array; nz: Float64Array; ar: Float64Array } {
  const nx = new Float64Array(nTri); const ny = new Float64Array(nTri); const nz = new Float64Array(nTri);
  const ar = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ux = a[o + 3] - a[o]; const uy = a[o + 4] - a[o + 1]; const uz = a[o + 5] - a[o + 2];
    const wx = a[o + 6] - a[o]; const wy = a[o + 7] - a[o + 1]; const wz = a[o + 8] - a[o + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const len = Math.hypot(cx, cy, cz);
    ar[f] = 0.5 * len;
    if (len > 0) { nx[f] = cx / len; ny[f] = cy / len; nz[f] = cz / len; }
  }
  return { nx, ny, nz, ar };
}

const G0 = facetGeom(xyz0);

/** the KILL-LINE instrument: the pinned pairs' dihedral, as COUNT + AREA + MAX. */
function targetMetric(
  g: { nx: Float64Array; ny: Float64Array; nz: Float64Array; ar: Float64Array },
  only?: Set<number>,
): {
  n: number; area: number; max: number; maxAll: number; areaPctMesh: number;
} {
  const uf = new Set<number>();
  let n = 0; let mx = 0; let mxAll = 0;
  for (const r of rows) {
    if (only !== undefined && !only.has(r.f1) && !only.has(r.f2)) continue;
    let dd = g.nx[r.f1] * g.nx[r.f2] + g.ny[r.f1] * g.ny[r.f2] + g.nz[r.f1] * g.nz[r.f2];
    dd = dd > 1 ? 1 : dd < -1 ? -1 : dd;
    const ang = (Math.acos(dd) * 180) / Math.PI;
    if (ang > mxAll) mxAll = ang;
    if (ang > HI_DEG) { n += 1; uf.add(r.f1); uf.add(r.f2); if (ang > mx) mx = ang; }
  }
  let area = 0;
  for (const f of uf) area += g.ar[f];
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += g.ar[f];
  return { n, area, max: mx, maxAll: mxAll, areaPctMesh: (area / meshArea) * 100 };
}

/**
 * WHOLE-MESH RELOCATION CENSUS. S100's scar: a conformance demand without a discharging operator made the
 * defect 3.42x WORSE by area because it RELOCATED 181x into a bucket nobody was reading. Only a facet
 * incident on a moved vertex can change, so this census over ALL 1,142,166 facets is a complete accounting
 * of where the defect went — the target-set number alone cannot be trusted to be a repair rather than a
 * transfer.
 */
function meshCensus(g: { nx: Float64Array; ny: Float64Array; nz: Float64Array; ar: Float64Array }): {
  n: number; area: number; areaPct: number; max: number; meshArea: number;
} {
  const pm = new Float64Array(nTri);
  let mxA = 0;
  for (let e = 0; e < nEdge; e += 1) {
    const f1 = d0.edgeF1[e]; const f2 = d0.edgeF2[e];
    let dd = g.nx[f1] * g.nx[f2] + g.ny[f1] * g.ny[f2] + g.nz[f1] * g.nz[f2];
    dd = dd > 1 ? 1 : dd < -1 ? -1 : dd;
    const ang = Math.acos(dd);
    if (ang > pm[f1]) pm[f1] = ang;
    if (ang > pm[f2]) pm[f2] = ang;
    if (ang > mxA) mxA = ang;
  }
  const thr = (HI_DEG * Math.PI) / 180;
  let n = 0; let area = 0; let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) { meshArea += g.ar[f]; if (pm[f] > thr) { n += 1; area += g.ar[f]; } }
  return { n, area, areaPct: (area / meshArea) * 100, max: (mxA * 180) / Math.PI, meshArea };
}

const fmtPop = (label: string, cnt: number, area: number, denomArea: number, max: number, unit: string): string => `${label}  COUNT ${String(cnt).padStart(6)}   AREA ${area.toFixed(4)} mm2 (${((area / denomArea) * 100).toFixed(2)}% of target)   MAX ${max.toFixed(3)} ${unit}`;

// baseline per-facet measurements, cached over the union of every rung's affected set
const beforeNorm = new Map<number, number[]>();
const beforePos = new Map<number, number>();
function ensureBefore(fs: number[], insets: number[]): void {
  for (const f of fs) {
    if (!beforeNorm.has(f)) beforeNorm.set(f, insets.map((i) => normDegOf(xyz0, f, i)));
    if (!beforePos.has(f)) beforePos.set(f, posMaxOf(xyz0, f, POS_N));
  }
}

log('');
log('══ BASELINE (flag-OFF control), same instruments used after every rung ══');
const base = targetMetric(G0);
log(`  TARGET dihedral > ${HI_DEG} deg:  COUNT ${base.n} pairs   AREA ${base.area.toFixed(4)} mm2 (${base.areaPctMesh.toFixed(4)}% of mesh)   MAX ${base.max.toFixed(3)} deg   (max over ALL pinned pairs ${base.maxAll.toFixed(3)} deg)`);
ensureBefore(uniqF, INSETS);
for (let i = 0; i < INSETS.length; i += 1) {
  const v = uniqF.map((f) => (beforeNorm.get(f) as number[])[i]);
  const over45 = uniqF.filter((f) => (beforeNorm.get(f) as number[])[i] > 45);
  const over10 = uniqF.filter((f) => (beforeNorm.get(f) as number[])[i] > 10);
  const a45 = over45.reduce((s, f) => s + G0.ar[f], 0);
  const a10 = over10.reduce((s, f) => s + G0.ar[f], 0);
  log(`  normDeg inset ${INSETS[i]}:  p50 ${q(v, 0.5).toFixed(2)}  p90 ${q(v, 0.9).toFixed(2)}  MAX ${mx(v).toFixed(2)} deg`);
  log(`     ${fmtPop('over45', over45.length, a45, targetArea0, over45.length > 0 ? mx(over45.map((f) => (beforeNorm.get(f) as number[])[i])) : 0, 'deg')}`);
  log(`     ${fmtPop('over10', over10.length, a10, targetArea0, over10.length > 0 ? mx(over10.map((f) => (beforeNorm.get(f) as number[])[i])) : 0, 'deg')}`);
}
{
  const pv = uniqF.map((f) => beforePos.get(f) as number);
  const ov = uniqF.filter((f) => (beforePos.get(f) as number) > POS_BAR_MM);
  log(`  POSITION posMax (n=${POS_N}) on the target set: p50 ${(q(pv, 0.5) * 1000).toFixed(2)}  p90 ${(q(pv, 0.9) * 1000).toFixed(2)}  MAX ${(mx(pv) * 1000).toFixed(2)} um`);
  log(`     ${fmtPop(`over ${POS_BAR_MM} mm`, ov.length, ov.reduce((s, f) => s + G0.ar[f], 0), targetArea0, ov.length > 0 ? mx(ov.map((f) => beforePos.get(f) as number)) * 1000 : 0, 'um')}`);
}
log(`${el()}`);

const baseCensus = meshCensus(G0);
log(`  WHOLE MESH dihedral > ${HI_DEG} deg: COUNT ${baseCensus.n}   AREA ${baseCensus.area.toFixed(3)} mm2 (${baseCensus.areaPct.toFixed(4)}% of mesh)   MAX ${baseCensus.max.toFixed(3)} deg`);

// ── the rungs ───────────────────────────────────────────────────────────────────────────────────────
const PS = planByThr.get(TURN_THR_DEG) as Plan[];
const summary: Array<Record<string, number | string | boolean>> = [];
for (const rung of RUNGS) for (const guarded of [false, true]) {
  log('');
  log(`══════ RUNG ${(rung * 100).toFixed(0)}% of L   ARM ${guarded ? 'GUARDED (reject any snap that inverts/collapses an incident facet)' : 'RAW (no validity guard)'} ══════`);
  const R = applyRung(PS, rung, guarded);
  log(`  plans within budget ${R.nPlans}   distinct vertices moved ${R.nMoved}   rejected by the guard ${R.nRejected}   vertex conflicts ${R.nConflict}`);
  log(`  facets touched (the FULL 1-ring — the COMPLETE set that can change) ${R.affected.length}   of which >1 moved corner ${R.nMultiVert}`);
  log(`  f32 re-rounding of the moved vertices: max |r - rA| ${(R.maxRound * 1e6).toFixed(3)} nm   ${el()}`);
  if (R.affected.length === 0) { log('  nothing moved at this rung; skipping.'); continue; }
  const G = facetGeom(R.movedXyz);
  // topology / degeneracy guards
  let flipped = 0; let degen = 0; let flipArea = 0;
  for (const f of R.affected) {
    if (!(G.ar[f] > 1e-14)) degen += 1;
    const dd = G.nx[f] * G0.nx[f] + G.ny[f] * G0.ny[f] + G.nz[f] * G0.nz[f];
    if (dd < 0) { flipped += 1; flipArea += G.ar[f]; }
  }
  log(`  GUARD: degenerate facets ${degen}   normal-flipped facets ${flipped} (AREA ${flipArea.toFixed(5)} mm2)`);

  const tm = targetMetric(G);
  const ratio = tm.area > 0 ? base.area / tm.area : Infinity;
  log('');
  log('  ── KILL-LINE INSTRUMENT: the target set\'s over-45deg AREA ──');
  log(`     BEFORE  COUNT ${base.n} pairs   AREA ${base.area.toFixed(4)} mm2 (${base.areaPctMesh.toFixed(4)}% of mesh)   MAX ${base.max.toFixed(3)} deg`);
  log(`     AFTER   COUNT ${tm.n} pairs   AREA ${tm.area.toFixed(4)} mm2 (${tm.areaPctMesh.toFixed(4)}% of mesh)   MAX ${tm.max.toFixed(3)} deg   (max over ALL pinned pairs ${tm.maxAll.toFixed(3)} deg)`);
  log(`     AREA reduction ${ratio.toFixed(3)}x   COUNT reduction ${(base.n / Math.max(1, tm.n)).toFixed(3)}x   [kill line: AREA >= 2.000x]`);

  // THE FAIREST POSSIBLE READING OF THE OPERATOR: restricted to the pinned pairs that contain a facet the
  // operator actually MOVED (move3d >= MOVE_EPS). If it fails even here it fails everywhere.
  const baseReal = targetMetric(G0, realFacetSet);
  const tmReal = targetMetric(G, realFacetSet);
  log(`     RESTRICTED to the ${realFacetSet.size} REAL-snap facets: AREA ${baseReal.area.toFixed(4)} -> ${tmReal.area.toFixed(4)} mm2 (${(baseReal.area / Math.max(1e-12, tmReal.area)).toFixed(3)}x)   COUNT ${baseReal.n} -> ${tmReal.n} pairs   MAX ${baseReal.max.toFixed(2)} -> ${tmReal.max.toFixed(2)} deg`);

  const mc = meshCensus(G);
  log('');
  log('  ── WHOLE-MESH RELOCATION CENSUS (S100\'s scar: did the defect move rather than go away?) ──');
  log(`     over ${HI_DEG} deg  BEFORE COUNT ${baseCensus.n} AREA ${baseCensus.area.toFixed(3)} mm2 (${baseCensus.areaPct.toFixed(4)}%) MAX ${baseCensus.max.toFixed(3)} deg`);
  log(`     over ${HI_DEG} deg  AFTER  COUNT ${mc.n} AREA ${mc.area.toFixed(3)} mm2 (${mc.areaPct.toFixed(4)}%) MAX ${mc.max.toFixed(3)} deg   => whole-mesh AREA ${(baseCensus.area / Math.max(1e-12, mc.area)).toFixed(3)}x`);

  ensureBefore(R.affected, INSETS);
  // angular, on the target facets
  log('');
  log('  ── ANGULAR (orientOfFacet, inset SWEPT) on the target facets ──');
  const nowNorm = new Map<number, number[]>();
  for (const f of R.affected) nowNorm.set(f, INSETS.map((i) => normDegOf(R.movedXyz, f, i)));
  for (const f of uniqF) if (!nowNorm.has(f)) nowNorm.set(f, beforeNorm.get(f) as number[]);
  for (let i = 0; i < INSETS.length; i += 1) {
    const bV = uniqF.map((f) => (beforeNorm.get(f) as number[])[i]);
    const aV = uniqF.map((f) => (nowNorm.get(f) as number[])[i]);
    const bOv = uniqF.filter((f) => (beforeNorm.get(f) as number[])[i] > 45);
    const aOv = uniqF.filter((f) => (nowNorm.get(f) as number[])[i] > 45);
    const bA = bOv.reduce((s, f) => s + G0.ar[f], 0); const aA = aOv.reduce((s, f) => s + G.ar[f], 0);
    log(`     inset ${INSETS[i]}  over45: COUNT ${bOv.length} -> ${aOv.length}   AREA ${bA.toFixed(4)} -> ${aA.toFixed(4)} mm2 (${(bA / Math.max(1e-12, aA)).toFixed(3)}x)   MAX ${mx(bV).toFixed(2)} -> ${mx(aV).toFixed(2)} deg   p50 ${q(bV, 0.5).toFixed(2)} -> ${q(aV, 0.5).toFixed(2)}`);
  }

  // position, on EVERY touched facet
  log('');
  log(`  ── POSITION (surface -> triangle, n=${POS_N}) on ALL ${R.affected.length} touched facets ──`);
  const nowPos = new Map<number, number>();
  for (const f of R.affected) nowPos.set(f, posMaxOf(R.movedXyz, f, POS_N));
  const bP = R.affected.map((f) => beforePos.get(f) as number);
  const aP = R.affected.map((f) => nowPos.get(f) as number);
  const pushedOver = R.affected.filter((f) => (beforePos.get(f) as number) <= POS_BAR_MM && (nowPos.get(f) as number) > POS_BAR_MM);
  const overB = R.affected.filter((f) => (beforePos.get(f) as number) > POS_BAR_MM);
  const overA = R.affected.filter((f) => (nowPos.get(f) as number) > POS_BAR_MM);
  log(`     BEFORE p50 ${(q(bP, 0.5) * 1000).toFixed(2)}  p90 ${(q(bP, 0.9) * 1000).toFixed(2)}  p99 ${(q(bP, 0.99) * 1000).toFixed(2)}  MAX ${(mx(bP) * 1000).toFixed(2)} um`);
  log(`     AFTER  p50 ${(q(aP, 0.5) * 1000).toFixed(2)}  p90 ${(q(aP, 0.9) * 1000).toFixed(2)}  p99 ${(q(aP, 0.99) * 1000).toFixed(2)}  MAX ${(mx(aP) * 1000).toFixed(2)} um`);
  log(`     over ${POS_BAR_MM} mm:  BEFORE COUNT ${overB.length} AREA ${overB.reduce((s, f) => s + G0.ar[f], 0).toFixed(4)} mm2   AFTER COUNT ${overA.length} AREA ${overA.reduce((s, f) => s + G.ar[f], 0).toFixed(4)} mm2`);
  log(`     *** PUSHED OVER ${POS_BAR_MM} mm BY THE SNAP: COUNT ${pushedOver.length}   AREA ${pushedOver.reduce((s, f) => s + G.ar[f], 0).toFixed(4)} mm2   MAX ${pushedOver.length > 0 ? (mx(pushedOver.map((f) => nowPos.get(f) as number)) * 1000).toFixed(2) : '0.00'} um ***   [kill line: 0]`);

  // collateral — the 1-ring neighbours that are NOT in the target set
  const tset = new Set(uniqF);
  const nb = R.affected.filter((f) => !tset.has(f));
  const eps = 0.1;            // deg — a change smaller than this is not called a change
  const iMain = Math.max(0, INSETS.indexOf(INSET_MAIN));
  const worseAng = nb.filter((f) => (nowNorm.get(f) as number[])[iMain] > (beforeNorm.get(f) as number[])[iMain] + eps);
  const worsePos = nb.filter((f) => (nowPos.get(f) as number) > (beforePos.get(f) as number) + 1e-4);
  const nbA = nb.reduce((s, f) => s + G.ar[f], 0);
  log('');
  log(`  ── COLLATERAL: the ${nb.length} touched facets that are NOT in the target set (AREA ${nbA.toFixed(4)} mm2) ──`);
  log(`     made worse by normDeg(inset ${INSETS[iMain]}, >${eps} deg): COUNT ${worseAng.length} (${((worseAng.length / Math.max(1, nb.length)) * 100).toFixed(2)}%)   AREA ${worseAng.reduce((s, f) => s + G.ar[f], 0).toFixed(4)} mm2 (${((worseAng.reduce((s, f) => s + G.ar[f], 0) / Math.max(1e-12, nbA)) * 100).toFixed(2)}%)   MAX worsening ${worseAng.length > 0 ? mx(worseAng.map((f) => (nowNorm.get(f) as number[])[iMain] - (beforeNorm.get(f) as number[])[iMain])).toFixed(2) : '0.00'} deg   [kill line: <= 5%]`);
  log(`     made worse by position (>0.1 um): COUNT ${worsePos.length} (${((worsePos.length / Math.max(1, nb.length)) * 100).toFixed(2)}%)   AREA ${worsePos.reduce((s, f) => s + G.ar[f], 0).toFixed(4)} mm2   MAX worsening ${worsePos.length > 0 ? (mx(worsePos.map((f) => (nowPos.get(f) as number) - (beforePos.get(f) as number))) * 1000).toFixed(2) : '0.00'} um`);

  const pass = ratio >= 2 && pushedOver.length === 0 && worseAng.length <= 0.05 * Math.max(1, nb.length);
  log('');
  log(`  >>> KILL LINE AT THIS RUNG: AREA ${ratio.toFixed(3)}x (need >=2) | pushed-over ${pushedOver.length} (need 0) | 1-ring worse ${((worseAng.length / Math.max(1, nb.length)) * 100).toFixed(2)}% (need <=5%)  =>  ${pass ? 'PASS' : 'FAIL'}`);
  summary.push({
    rung, arm: guarded ? 'guarded' : 'raw',
    movedVerts: R.nMoved, rejected: R.nRejected, touched: R.affected.length,
    meshAreaBefore: baseCensus.area, meshAreaAfter: mc.area, meshAreaRatio: baseCensus.area / Math.max(1e-12, mc.area),
    areaBefore: base.area, areaAfter: tm.area, areaRatio: ratio,
    countBefore: base.n, countAfter: tm.n, maxBefore: base.max, maxAfter: tm.max,
    pushedOver: pushedOver.length, posMaxAfterUm: mx(aP) * 1000,
    nbWorsePct: (worseAng.length / Math.max(1, nb.length)) * 100, flipped, degen, pass,
  });
  log(`${el()}`);
}

log('');
log('══ SUMMARY ══');
for (const s of summary) log(`  ${JSON.stringify(s)}`);
writeFileSync(`${OUTDIR}/S113OP_SNAP_${TAG}.json`, `${JSON.stringify({
  style: STYLE, stl: STL, set: NDJSON, k: K, insets: INSETS, turnThrDeg: TURN_THR_DEG,
  posN: POS_N, posBarMm: POS_BAR_MM, baseline: base, targetArea0, meshArea0, rungs: summary,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S113OP_SNAP_${TAG}.json`);
log(`done ${el()}`);
