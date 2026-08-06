// revqCreaseTurnProbe.ts — ADVERSARIAL RE-MEASUREMENT of the S113-OP4 "oracle ceiling" claim.
//
// Two independent instruments, aimed at the two load-bearing numbers:
//
//  P1  THE BOTH-SIDES TEST on the 94.83%-by-area "false indictment" figure.
//      S113-OP4C attributes a facet's whole area to "the surface really turns here" from ONE side:
//      facet F is accurate (normDeg(0.1) <= 5, no interior crease) and F has an adjacent edge with
//      dihedral > 45 deg  =>  "any correct mesh shows that edge".  That inference is only valid if the
//      facet on the OTHER side of that edge is also accurate; if the neighbour is a straddler or a
//      defect, the >45 deg is the NEIGHBOUR's error and F is not evidence of anything.
//      Measured here: partition the >45-deg wall edges into ALIGNED-ALIGNED / ALIGNED-OTHER /
//      OTHER-OTHER, by COUNT and by AREA, and re-price the headline on the ALIGNED-ALIGNED subset only.
//
//  P2  AN INDEPENDENT ANALYTIC TURN PROBE with an EPSILON LADDER, on the 3,282 pinned pairs.
//      Part A's crease turn came from `fdNormals`' one-sided candidates at coincident lattice points
//      (parameter gap p50 0.00e+0 mm) after a 2-means split — one instrument, no ladder in epsilon.
//      Here: locate the kink by bisection along BOTH the shared edge and the centroid-to-centroid
//      segment, then read the turn from two CENTRAL-difference normals at +/- epsilon, for a ladder of
//      epsilon.  A genuine C0 crease is epsilon-INVARIANT; smooth curvature decays linearly in epsilon.
//      The same probe is run on a SMOOTH CONTROL of low-dihedral wall pairs — it must decay there.
//
//  P3  THE GAP-ZERO MECHANISM. Count, per pair footprint, the lattice points at which `fdNormals`
//      returns candidates spanning >= 45 deg (a kink INSIDE the finite-difference stencil). Part A's
//      estimator needs >= 8 of them per pair to have taken all 8 of its closest cross-flank pairs at
//      zero parameter gap, which it reports for 3,107 of 3,282 pairs.
//
// COUNT + AREA + MAX are reported together everywhere. Reads only; writes one report + one ndjson.
// Usage: bash research/tools/run-revq-crease-turn.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals, fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NDJ = process.env.PF_REVQ_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const BND = process.env.PF_REVQ_BNDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113OPB_ORACLE_GOTH.ndjson';
const ORA = process.env.PF_REVQ_ORACLE ?? 'research/exchange/_strataConformBisect/straddle/S113OP_ORACLE_GOTH.ndjson';
const STL = process.env.PF_REVQ_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const STYLE = process.env.PF_REVQ_STYLE ?? 'GothicArches';
const TAG = process.env.PF_REVQ_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_REVQ_H', 120), Rb: envF('PF_REVQ_RB', 40), Rt: envF('PF_REVQ_RT', 50), expn: 1 };
const H = DIMS.H;
const VIS = envF('PF_REVQ_VIS', 45);
const DEG = 180 / Math.PI;

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
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);

log('===== REVQ — ADVERSARIAL RE-MEASUREMENT OF THE S113-OP4 ORACLE CEILING =====');
log(`style ${STYLE} tag ${TAG}  visibility cut ${VIS} deg`);
log('');

interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row {
  e: number; f1: number; f2: number; measDeg: number; area1: number; area2: number;
  onEdge: boolean; onSeg: boolean; z: number; tri1: number[]; tri2: number[]; shared: number[]; locs: Loc[];
}
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0; for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets ${meshArea.toFixed(3)} mm2  rows ${rows.length}  ${el()}`);
log('');

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P1 — THE BOTH-SIDES TEST
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface BRow { f: number; minor: number; sepDeg: number; dihDeg: number; area: number; n05: number; n10: number }
{
  const bs: BRow[] = readFileSync(BND, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as BRow);
  const byF = new Map<number, BRow>(); for (const r of bs) byF.set(r.f, r);
  const CREASE_MIN = 15;
  const isAligned = (r: BRow | undefined): boolean => (r !== undefined && !(r.sepDeg >= CREASE_MIN && r.minor >= 0.02) && r.n10 <= 5);
  const aligned = new Set<number>();
  let alignedArea = 0; let allArea = 0;
  for (const r of bs) { allArea += r.area; if (isAligned(r)) { aligned.add(r.f); alignedArea += r.area; } }
  log('── P1: THE BOTH-SIDES TEST on the ">45 deg is CORRECT GEOMETRY" attribution ──');
  log(`  B population re-read: ${bs.length} wall facets  AREA ${allArea.toFixed(3)} mm2`);
  log(`  ALIGNED (reproduced from the dump): COUNT ${aligned.size} (${((aligned.size / bs.length) * 100).toFixed(2)}%)  AREA ${alignedArea.toFixed(3)} mm2 = ${((alignedArea / allArea) * 100).toFixed(2)}% of flagged  = ${((alignedArea / meshArea) * 100).toFixed(4)}% of mesh`);

  const hiThr = (VIS * Math.PI) / 180;
  let eAA = 0; let eAO = 0; let eOO = 0; let eTot = 0;
  const hasAAedge = new Set<number>();
  const hasAnyEdge = new Set<number>();
  const dihAA = new Map<number, number>();
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > 8 || graphRatio(f2) > 8) continue;
    eTot += 1;
    const a1 = aligned.has(f1); const a2 = aligned.has(f2);
    hasAnyEdge.add(f1); hasAnyEdge.add(f2);
    if (a1 && a2) {
      eAA += 1; hasAAedge.add(f1); hasAAedge.add(f2);
      dihAA.set(f1, Math.max(dihAA.get(f1) ?? 0, d.edgeAngRad[e] * DEG));
      dihAA.set(f2, Math.max(dihAA.get(f2) ?? 0, d.edgeAngRad[e] * DEG));
    } else if (a1 || a2) eAO += 1; else eOO += 1;
  }
  log(`  >45-deg WALL EDGES: total ${eTot}   ALIGNED-ALIGNED ${eAA} (${((eAA / eTot) * 100).toFixed(2)}%)   ALIGNED-OTHER ${eAO} (${((eAO / eTot) * 100).toFixed(2)}%)   OTHER-OTHER ${eOO} (${((eOO / eTot) * 100).toFixed(2)}%)`);
  let aAA = 0; let nAA = 0; let aOnly1 = 0; let nOnly1 = 0;
  for (const f of aligned) {
    const ar = (byF.get(f) as BRow).area;
    if (hasAAedge.has(f)) { aAA += ar; nAA += 1; } else { aOnly1 += ar; nOnly1 += 1; }
  }
  log('  ALIGNED facets that carry at least ONE >45-deg edge whose OTHER side is ALSO aligned');
  log('    (the only subset where "both sides accurate => the SURFACE turns" is a valid inference):');
  log(`     COUNT ${nAA} (${((nAA / Math.max(1, aligned.size)) * 100).toFixed(2)}% of aligned)  AREA ${aAA.toFixed(3)} mm2 = ${((aAA / allArea) * 100).toFixed(2)}% of ALL flagged area  = ${((aAA / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`     their ALIGNED-ALIGNED dihedral: p10 ${q([...dihAA.values()], 0.1).toFixed(2)} p50 ${q([...dihAA.values()], 0.5).toFixed(2)} p90 ${q([...dihAA.values()], 0.9).toFixed(2)} MAX ${mx([...dihAA.values()]).toFixed(2)} deg`);
  log(`  ALIGNED facets whose EVERY >45-deg edge faces a NON-aligned facet (one-sided evidence only):`);
  log(`     COUNT ${nOnly1} (${((nOnly1 / Math.max(1, aligned.size)) * 100).toFixed(2)}% of aligned)  AREA ${aOnly1.toFixed(3)} mm2 = ${((aOnly1 / allArea) * 100).toFixed(2)}% of ALL flagged area`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P2 — THE INDEPENDENT EPSILON-LADDER TURN PROBE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const EPS = (process.env.PF_REVQ_EPS ?? '0.05,0.02,0.01,0.005,0.002,0.001').split(',').map(Number);
const nsFine = (h: number): ((th: number, z: number, out: Float64Array) => number) => fdNormalsCentral(rA, H, h, h);
const nsProbe = nsFine(1e-6);
const nsMulti = fdNormals(rA, H, 2e-4, 2e-4);
const angOf = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};
const s1 = new Float64Array(3); const s2 = new Float64Array(3);

/**
 * Locate the sharpest normal turn on the parameter segment (th0,z0)->(th1,z1) and read it at +/- eps
 * (arc mm) with a CENTRAL-difference sampler whose own step is eps/50 — so the stencil never straddles.
 * Returns the turn in deg for every eps in EPS.
 */
function turnLadder(th0: number, z0: number, th1: number, z1: number, rRef: number): number[] {
  const L = Math.hypot(rRef * (th1 - th0), z1 - z0);
  if (!(L > 0)) return EPS.map(() => 0);
  const N = 128;
  let bi = -1; let bA = -1;
  const na = new Float64Array(3); const nb = new Float64Array(3);
  nsProbe(th0, z0, na);
  for (let i = 1; i <= N; i += 1) {
    const t = i / N;
    nsProbe(th0 + t * (th1 - th0), z0 + t * (z1 - z0), nb);
    const a = angOf(na, 0, nb, 0);
    if (a > bA) { bA = a; bi = i; }
    na[0] = nb[0]; na[1] = nb[1]; na[2] = nb[2];
  }
  if (bi < 0) return EPS.map(() => 0);
  // bisect the bracket [ (bi-1)/N , bi/N ] on "which side of the kink"
  let lo = (bi - 1) / N; let hi = bi / N;
  const nLo = new Float64Array(3); const nHi = new Float64Array(3); const nMid = new Float64Array(3);
  nsProbe(th0 + lo * (th1 - th0), z0 + lo * (z1 - z0), nLo);
  nsProbe(th0 + hi * (th1 - th0), z0 + hi * (z1 - z0), nHi);
  for (let it = 0; it < 40; it += 1) {
    const mid = 0.5 * (lo + hi);
    nsProbe(th0 + mid * (th1 - th0), z0 + mid * (z1 - z0), nMid);
    if (angOf(nLo, 0, nMid, 0) > angOf(nMid, 0, nHi, 0)) { hi = mid; nHi.set(nMid); } else { lo = mid; nLo.set(nMid); }
  }
  const sStar = 0.5 * (lo + hi);
  return EPS.map((eps) => {
    const dt = eps / L;
    const ta = Math.max(0, sStar - dt); const tb = Math.min(1, sStar + dt);
    const ns = nsFine(Math.max(1e-9, eps / 50));
    ns(th0 + ta * (th1 - th0), z0 + ta * (z1 - z0), s1);
    ns(th0 + tb * (th1 - th0), z0 + tb * (z1 - z0), s2);
    return angOf(s1, 0, s2, 0) * DEG;
  });
}

function pairCurves(f1: number, f2: number, shared: number[]): Array<[number, number, number, number, number]> {
  const [a1, b1, c1] = th3(f1);
  const rRef = 0.5 * (rRefOf(f1) + rRefOf(f2));
  const g1th = (a1 + b1 + c1) / 3;
  const g1z = (xyz[f1 * 9 + 2] + xyz[f1 * 9 + 5] + xyz[f1 * 9 + 8]) / 3;
  const [a2, b2, c2] = th3(f2);
  const raw2 = (a2 + b2 + c2) / 3;
  const g2th = g1th + dThRaw(g1th, raw2);
  const g2z = (xyz[f2 * 9 + 2] + xyz[f2 * 9 + 5] + xyz[f2 * 9 + 8]) / 3;
  const out: Array<[number, number, number, number, number]> = [[g1th, g1z, g2th, g2z, rRef]];
  if (shared !== undefined && shared.length >= 6) {
    const sa = Math.atan2(shared[1], shared[0]);
    const sat = g1th + dThRaw(g1th, sa);
    const sbt = sat + dThRaw(sat, Math.atan2(shared[4], shared[3]));
    out.push([sat, shared[2], sbt, shared[5], rRef]);
  }
  return out;
}

interface PRow { e: number; f1: number; f2: number; turn: number[]; area1: number; area2: number }
const probe: PRow[] = [];
{
  for (const r of rows) {
    let best = EPS.map(() => 0);
    for (const [t0, z0, t1, z1, rr] of pairCurves(r.f1, r.f2, r.shared)) {
      const v = turnLadder(t0, z0, t1, z1, rr);
      best = best.map((x, i) => Math.max(x, v[i]));
    }
    probe.push({ e: r.e, f1: r.f1, f2: r.f2, turn: best, area1: r.area1, area2: r.area2 });
  }
  const area = new Map<number, number>();
  for (const r of rows) { area.set(r.f1, r.area1); area.set(r.f2, r.area2); }
  let tot = 0; for (const v of area.values()) tot += v;
  log(`── P2: INDEPENDENT EPSILON-LADDER TURN PROBE on ${rows.length} pinned pairs  ${el()} ──`);
  log(`  target: ${area.size} unique facets, AREA ${tot.toFixed(3)} mm2`);
  log('  eps(mm)  turn p10 / p50 / p90 / MAX (deg)   |  pairs >=45  |  facets >=45 (loose)  AREA  %of target');
  for (let i = 0; i < EPS.length; i += 1) {
    const v = probe.map((p) => p.turn[i]);
    const anyIrr = new Map<number, boolean>();
    for (const p of probe) for (const f of [p.f1, p.f2]) anyIrr.set(f, (anyIrr.get(f) ?? false) || p.turn[i] >= VIS);
    let aI = 0; let nI = 0;
    for (const [f, ar] of area) if (anyIrr.get(f) === true) { aI += ar; nI += 1; }
    const nP = v.filter((x) => x >= VIS).length;
    log(`  ${EPS[i].toFixed(4)}   ${q(v, 0.1).toFixed(2)} / ${q(v, 0.5).toFixed(2)} / ${q(v, 0.9).toFixed(2)} / ${mx(v).toFixed(2)}   |  ${nP}/${probe.length} = ${((nP / probe.length) * 100).toFixed(2)}%  |  ${nI}/${area.size} = ${((nI / area.size) * 100).toFixed(2)}%  ${aI.toFixed(4)} mm2  ${((aI / tot) * 100).toFixed(2)}%`);
  }
  log('');
}

// SMOOTH CONTROL: the same probe on low-dihedral wall pairs. It MUST decay in eps.
{
  const hi = new Set<number>(); for (const r of rows) { hi.add(r.f1); hi.add(r.f2); }
  const pool: Array<[number, number, number[]]> = [];
  let seed = 987654321;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 4000000 && pool.length < 400; t += 1) {
    const e = Math.floor(rnd() * d.edgeAngRad.length);
    if (!(d.edgeAngRad[e] < (2 * Math.PI) / 180)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (hi.has(f1) || hi.has(f2) || graphRatio(f1) > 8 || graphRatio(f2) > 8) continue;
    pool.push([f1, f2, []]);
  }
  const res = pool.map(([f1, f2]) => {
    let best = EPS.map(() => 0);
    for (const [t0, z0, t1, z1, rr] of pairCurves(f1, f2, [])) {
      const v = turnLadder(t0, z0, t1, z1, rr);
      best = best.map((x, i) => Math.max(x, v[i]));
    }
    return best;
  });
  log(`── P2-CONTROL: the SAME probe on ${pool.length} SMOOTH wall pairs (dihedral < 2 deg) ──`);
  for (let i = 0; i < EPS.length; i += 1) {
    const v = res.map((r) => r[i]);
    log(`  eps ${EPS[i].toFixed(4)}   turn p50 ${q(v, 0.5).toFixed(4)} p90 ${q(v, 0.9).toFixed(4)} MAX ${mx(v).toFixed(3)} deg   >=45: ${v.filter((x) => x >= VIS).length}/${v.length}`);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P3 — THE GAP-ZERO MECHANISM: how many lattice points hold a kink INSIDE the fd stencil?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const K = 12;
  const kinkPts = (f: number): number => {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    let hits = 0;
    for (let i = 0; i <= K; i += 1) for (let j = 0; i + j <= K; j += 1) {
      const wa = i / K; const wb = j / K; const wc = 1 - wa - wb;
      const nc = nsMulti(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, scratch);
      let worst = 0;
      for (let p = 0; p < nc; p += 1) for (let qq = p + 1; qq < nc; qq += 1) {
        const a = angOf(scratch, p * 3, scratch, qq * 3) * DEG; if (a > worst) worst = a;
      }
      if (worst >= VIS) hits += 1;
    }
    return hits;
  };
  const sub: number[] = [];
  for (let i = 0; i < rows.length && sub.length < 400; i += Math.max(1, Math.floor(rows.length / 400))) sub.push(i);
  const hits = sub.map((i) => kinkPts(rows[i].f1) + kinkPts(rows[i].f2));
  log(`── P3: lattice points (K=12, 91/facet, 182/pair) whose fd STENCIL straddles a >=45-deg kink  ${el()} ──`);
  log(`  on a ${sub.length}-pair subsample: p10 ${q(hits, 0.1).toFixed(0)} p50 ${q(hits, 0.5).toFixed(0)} p90 ${q(hits, 0.9).toFixed(0)} MAX ${mx(hits).toFixed(0)}`);
  log(`  pairs with ZERO such points: ${hits.filter((x) => x === 0).length}/${hits.length} = ${((hits.filter((x) => x === 0).length / hits.length) * 100).toFixed(2)}%`);
  log(`  pairs with >= 8 such points: ${hits.filter((x) => x >= 8).length}/${hits.length} = ${((hits.filter((x) => x >= 8).length / hits.length) * 100).toFixed(2)}%`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P4 — CROSS-CHECK against Part A's own per-pair number
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  interface OraRow { e: number; f1: number; f2: number; sepCreaseDeg: number; sepCentDeg: number; diamDeg: number }
  const ora: OraRow[] = readFileSync(ORA, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as OraRow);
  const iEps = EPS.indexOf(0.01) >= 0 ? EPS.indexOf(0.01) : 0;
  const dd = probe.map((p, i) => p.turn[iEps] - ora[i].sepCreaseDeg);
  log(`── P4: my eps=${EPS[iEps]} turn MINUS Part A's sepCreaseDeg, per pair ──`);
  log(`  diff p10 ${q(dd, 0.1).toFixed(2)} p50 ${q(dd, 0.5).toFixed(2)} p90 ${q(dd, 0.9).toFixed(2)} MAX ${mx(dd).toFixed(2)} MIN ${q(dd, 0).toFixed(2)} deg`);
  const agree = probe.filter((p, i) => (p.turn[iEps] >= VIS) === (ora[i].sepCreaseDeg >= VIS)).length;
  log(`  class agreement on the >=${VIS}-deg cut: ${agree}/${probe.length} = ${((agree / probe.length) * 100).toFixed(2)}%`);
  log('');
  writeFileSync(`${OUTDIR}/REVQ_TURN_${TAG}.ndjson`, `${probe.map((p, i) => JSON.stringify({
    e: p.e, f1: p.f1, f2: p.f2, area1: p.area1, area2: p.area2,
    turn: p.turn.map((x) => Number(x.toFixed(5))), eps: EPS, oraSepCrease: ora[i].sepCreaseDeg,
  })).join('\n')}\n`);
  log(`wrote ${OUTDIR}/REVQ_TURN_${TAG}.ndjson (${probe.length} rows)`);
}
log(`done ${el()}`);
