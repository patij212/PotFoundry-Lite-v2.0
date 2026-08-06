// s114cInverse.ts — THE INVERSE CHECK: does the >45 deg DIHEDRAL TEST MISS REAL ANALYTIC CREASES?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. s114SweepC.ts answers "of the facets the >45 deg dihedral test FLAGS, how many sit on
// real analytic turn". That is a PRECISION question and it is only half of the instrument's error. The
// other half is RECALL: how much real analytic turn does the test NOT flag? The sweep cannot see it by
// construction — it only ever looks inside the flagged class.
//
// TWO OF MY FIVE STYLES MADE THIS UNAVOIDABLE, and both signals came out of the sweep's own printout:
//   * LowPolyFacet has ZERO edges over 45 deg and a MAX dihedral of 41.632 deg — sitting just under the
//     bar — while its normDeg at inset 0.05 clusters with p90 20.0479 and p99 20.0569, i.e. a spike of
//     thousands of facets at ONE value near 20 deg, with MAX 39.321. A population pinned at half of ~40
//     with a max at ~40 is the exact signature of facets STRADDLING a ~40 deg crease: each reads half the
//     jump from its own plane. If that is what it is, the crease is INSIDE facets and no dihedral test at
//     any bar will ever see it.
//   * RippleInterference has MAX dihedral 8.071 deg and normDeg p50 1.28 — a genuinely smooth, resolved
//     mesh. It is the NEGATIVE CONTROL for the above: if the probe fires there too, the probe is broken.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, BEFORE THE FIRST RUN OF THIS FILE.
//   PI-1  LowPolyFacet carries a >= 30 deg ANALYTIC crease INSIDE facet footprints, on a population that
//         the >45 deg dihedral test flags at ZERO. Falsified if the in-footprint crease jump reads under
//         30 deg at p99 on a whole-mesh sample.
//   PI-2  RippleInterference does NOT (its in-footprint crease jump stays under 5 deg at MAX).
//         *** This is the FLOOR. If PI-2 fails, the probe manufactures creases and PI-1 IS VOID. ***
//   PI-3  Gothic, whose creases the mesh IS conformed to (S112: 56.7% of target area has a vertex on the
//         locus), should show a SMALLER in-footprint jump than LowPolyFacet relative to its edge-visible
//         turn — i.e. Gothic puts its creases ON edges, LowPolyFacet does not.
//
// THE TWO PROBES, and why the second one is not redundant:
//   (A) EDGE CONFUSION, uniform golden sample over ALL interior edges. Measured dihedral vs the analytic
//       across-crease turn AND the analytic normal-set diameter over the pair. Gives the full 2x3 table
//       including the cell the sweep cannot reach: measured <= 45 while the analytic turn is >= 45.
//   (B) IN-FOOTPRINT JUMP, uniform golden sample over FACETS. 2-means the facet's OWN footprint normals,
//       then take the angle between the CLOSEST CROSS-FLANK SAMPLE PAIRS. On a smoothly curving footprint
//       that is small however far the normal sweeps; on a C0 crease running through the facet it is the
//       jump. *** THIS IS THE ONLY ONE OF THE TWO THAT CAN SEE A CREASE THE MESH NEVER PUT AN EDGE ON. ***
//       Reported beside the cluster-centre separation, which does NOT distinguish crease from sweep, so
//       the difference between the two columns is itself the evidence.
//
// INSTRUMENT DISCIPLINE: COUNT + AREA + MAX on every population; kink-aware fdNormals (a central
// difference across a C0 crease returns the AVERAGE of the two one-sided normals and would hide exactly
// what this tool is looking for); footprint lattices, never endpoints; PRECOND refusal gate on every
// mesh; and a SMOOTH negative control per style asserting a FLOOR as well as a ceiling.
//
// Usage: bash research/tools/run-s114c-inverse.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DEG = 180 / Math.PI;

const OUTDIR = process.env.PF_S114CI_OUTDIR ?? 'research/exchange/_strataConformBisect/s114c';
const EXCH = process.env.PF_S114CI_EXCH ?? 'research/exchange/_strataConformBisect';
const HI_DEG = envF('PF_S114CI_HI_DEG', 45);
const K_LAT = Math.round(envF('PF_S114CI_KLAT', 12));
const NCROSS = Math.round(envF('PF_S114CI_NCROSS', 8));
const CURTAIN_RATIO = envF('PF_S114CI_CURTAIN', 8);
const NEDGE = Math.round(envF('PF_S114CI_NEDGE', 1200));
const NFACET = Math.round(envF('PF_S114CI_NFACET', 1500));
const CTLN = Math.round(envF('PF_S114CI_CTLN', 400));
const H_FD = envF('PF_S114CI_HFD', 2e-4);
const DIMS: StyleDims = { H: envF('PF_S114CI_H', 120), Rb: envF('PF_S114CI_RB', 40), Rt: envF('PF_S114CI_RT', 50), expn: 1 };
const H = DIMS.H;
const PRECOND_UM = envF('PF_S114CI_PRECOND_UM', 50);
const TAG = process.env.PF_S114CI_TAG ?? 'C';

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
function goldenSample(n: number, want: number): number[] {
  if (want >= n) { const a: number[] = []; for (let i = 0; i < n; i += 1) a.push(i); return a; }
  const GOLD = 0.6180339887498949;
  const seen = new Set<number>(); const out: number[] = [];
  let i = 0;
  while (out.length < want && i < want * 40) {
    const idx = Math.floor(((i * GOLD) % 1) * n);
    if (!seen.has(idx)) { seen.add(idx); out.push(idx); }
    i += 1;
  }
  return out;
}
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

function measure(style: string, stl: string): Record<string, unknown> {
  const row: Record<string, unknown> = { style, stl };
  log('');
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style} ═════`);
  const defs = registryDefaults(style);
  const rAbase = buildRadiusFn(style as StyleId, { ...defs }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const ns: NormalSampler = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);

  const M = readMeshFloat64(stl, false);
  const xyz = M.xyz; const nTri = M.nTri;
  let worst = 0;
  { const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    } }
  const precondUm = worst * 1000;
  log(`  facets ${nTri}   PRECOND ${precondUm.toFixed(4)} um`);
  row.nTri = nTri; row.precondUm = precondUm;
  if (precondUm > PRECOND_UM) { log('  *** REFUSED (PRECOND) ***'); row.refused = true; return row; }

  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  log(`  area ${meshArea.toFixed(3)} mm2   interior edges ${d.interiorEdges}   ${el()}`);
  row.meshAreaMm2 = meshArea; row.interiorEdges = d.interiorEdges;

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
  function angU(a: Float64Array, ai: number, b: Float64Array, bi: number): number {
    let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
  }
  interface Samp { n: Float64Array; pth: Float64Array; pz: Float64Array; m: number }
  function sampleFacet(f: number, k: number): Samp {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    const rRef = rRefOf(f);
    const cap = ((k + 1) * (k + 2)) / 2;
    const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
    let m = 0;
    for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, scratch);
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
        pth[m] = rRef * th; pz[m] = z; m += 1;
      }
    }
    return { n, pth, pz, m };
  }
  function twoMeans(n: Float64Array, m: number): { lab: Int8Array; sepRad: number } {
    const lab = new Int8Array(m); const c = new Float64Array(6);
    if (m === 0) return { lab, sepRad: 0 };
    let sx = 0; let sy = 0; let sz = 0;
    for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
    let L = Math.hypot(sx, sy, sz); if (!(L > 0)) L = 1;
    const mean = new Float64Array([sx / L, sy / L, sz / L]);
    let i1 = 0; let best = -1;
    for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
    let i2 = 0; best = -1;
    for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
    c[0] = n[i1 * 3]; c[1] = n[i1 * 3 + 1]; c[2] = n[i1 * 3 + 2];
    c[3] = n[i2 * 3]; c[4] = n[i2 * 3 + 1]; c[5] = n[i2 * 3 + 2];
    let na = 0; let nb = 0;
    for (let it = 0; it < 30; it += 1) {
      let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; na = 0; nb = 0;
      for (let i = 0; i < m; i += 1) {
        const da = angU(n, i * 3, c, 0); const db = angU(n, i * 3, c, 3);
        if (da <= db) { lab[i] = 0; ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
        else { lab[i] = 1; bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; nb += 1; }
      }
      if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
      if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
      if (na === 0 || nb === 0) break;
    }
    return { lab, sepRad: na > 0 && nb > 0 ? angU(c, 0, c, 3) : 0 };
  }
  /**
   * The three quantities over a merged normal set. `jump` is the CLOSEST-CROSS-FLANK angle — small on a
   * smooth sweep however far it sweeps, equal to the discontinuity on a C0 crease. `sepCent` is the
   * cluster-centre separation, which does NOT distinguish the two. `diam` is the total variation.
   */
  function probe(n: Float64Array, pth: Float64Array, pz: Float64Array, m: number): { jump: number; sepCent: number; diam: number } {
    const sp = twoMeans(n, m);
    const A: number[] = []; const B: number[] = [];
    for (let i = 0; i < m; i += 1) (sp.lab[i] === 0 ? A : B).push(i);
    const cand: Array<{ dd: number; ang: number }> = [];
    for (const a of A) for (const b of B) cand.push({ dd: Math.hypot(pth[a] - pth[b], pz[a] - pz[b]), ang: angU(n, a * 3, n, b * 3) });
    cand.sort((x, y) => x.dd - y.dd);
    let jump = 0;
    const take = Math.min(NCROSS, cand.length);
    for (let i = 0; i < take; i += 1) if (cand[i].ang > jump) jump = cand[i].ang;
    let diam = 0;
    for (let a = 0; a < m; a += 1) for (let b = a + 1; b < m; b += 1) {
      const t = angU(n, a * 3, n, b * 3); if (t > diam) diam = t;
    }
    return { jump: jump * DEG, sepCent: sp.sepRad * DEG, diam: diam * DEG };
  }
  const footProbe = (f: number): { jump: number; sepCent: number; diam: number } => {
    const s = sampleFacet(f, K_LAT);
    return probe(s.n, s.pth, s.pz, s.m);
  };
  const pairProbe = (f1: number, f2: number): { jump: number; sepCent: number; diam: number } => {
    const s1 = sampleFacet(f1, K_LAT); const s2 = sampleFacet(f2, K_LAT);
    const m = s1.m + s2.m;
    const n = new Float64Array(m * 3); const pth = new Float64Array(m); const pz = new Float64Array(m);
    n.set(s1.n.subarray(0, s1.m * 3), 0); n.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
    pth.set(s1.pth.subarray(0, s1.m), 0); pth.set(s2.pth.subarray(0, s2.m), s1.m);
    pz.set(s1.pz.subarray(0, s1.m), 0); pz.set(s2.pz.subarray(0, s2.m), s1.m);
    return probe(n, pth, pz, m);
  };

  // ── PROBE A: THE EDGE CONFUSION, uniform golden sample over ALL interior edges ────────────────────
  const eSamp = goldenSample(d.interiorEdges, Math.min(NEDGE, d.interiorEdges)).map((i) => i);
  const cells = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } as Record<string, number>;
  const wcells = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } as Record<string, number>;
  let wTot = 0;
  const hiddenJumps: number[] = [];
  for (const e of eSamp) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const meas = d.edgeAngRad[e] * DEG;
    const p = pairProbe(f1, f2);
    const w = (d.areaMm2[f1] + d.areaMm2[f2]) / 2; wTot += w;
    let cell: string;
    if (meas > HI_DEG) cell = p.jump >= HI_DEG ? 'A' : p.diam >= HI_DEG ? 'B' : 'C';
    else { cell = p.jump >= HI_DEG ? 'D' : p.diam >= HI_DEG ? 'E' : 'F'; if (cell === 'D') hiddenJumps.push(p.jump); }
    cells[cell] += 1; wcells[cell] += w;
  }
  log('');
  log(`  ── PROBE A: EDGE CONFUSION, uniform golden sample n=${eSamp.length} of ${d.interiorEdges} interior edges (${((eSamp.length / d.interiorEdges) * 100).toFixed(3)}%)`);
  log('     weight = mean area of the edge\'s two facets; COUNT and EDGE-AREA-WEIGHTED share both printed');
  const pc = (k: string): string => `${cells[k]} (${((cells[k] / eSamp.length) * 100).toFixed(3)}%)  W ${((wcells[k] / Math.max(1e-12, wTot)) * 100).toFixed(3)}%`;
  log(`     A  measured >${HI_DEG} & analytic JUMP >=${HI_DEG}   (visible, real crease)          ${pc('A')}`);
  log(`     B  measured >${HI_DEG} & smooth sweep >=${HI_DEG}    (visible, real, density fixes)  ${pc('B')}`);
  log(`     C  measured >${HI_DEG} & total turn <${HI_DEG}       (visible, MESH-MANUFACTURED)    ${pc('C')}`);
  log(`     D  measured <=${HI_DEG} & analytic JUMP >=${HI_DEG}  *** HIDDEN CREASE — THE MISS *** ${pc('D')}`);
  log(`     E  measured <=${HI_DEG} & smooth sweep >=${HI_DEG}   (hidden sweep)                  ${pc('E')}`);
  log(`     F  neither                                                                  ${pc('F')}`);
  if (hiddenJumps.length > 0) log(`     hidden-crease jump magnitudes: p50 ${q(hiddenJumps, 0.5).toFixed(2)} MAX ${mx(hiddenJumps).toFixed(2)} deg`);
  Object.assign(row, { edgeSample: eSamp.length, cells: { ...cells }, cellsAreaPct: Object.fromEntries(Object.entries(wcells).map(([k, v]) => [k, (v / Math.max(1e-12, wTot)) * 100])) });

  // ── PROBE B: THE IN-FOOTPRINT JUMP, uniform golden sample over FACETS ────────────────────────────
  const fSamp = goldenSample(nTri, Math.min(NFACET, nTri));
  const jumps: number[] = []; const seps: number[] = []; const diams: number[] = [];
  let aTot = 0; const aOver = [0, 0, 0]; const nOver = [0, 0, 0];
  const BARS = [20, 30, 45];
  for (const f of fSamp) {
    const p = footProbe(f);
    jumps.push(p.jump); seps.push(p.sepCent); diams.push(p.diam);
    aTot += d.areaMm2[f];
    for (let i = 0; i < BARS.length; i += 1) if (p.jump >= BARS[i]) { aOver[i] += d.areaMm2[f]; nOver[i] += 1; }
  }
  log('');
  log(`  ── PROBE B: IN-FOOTPRINT ANALYTIC JUMP, uniform golden sample n=${fSamp.length} of ${nTri} facets (${((fSamp.length / nTri) * 100).toFixed(3)}%)   ${el()}`);
  log(`     JUMP (closest cross-flank, crease-only)  p50 ${q(jumps, 0.5).toFixed(4)}  p90 ${q(jumps, 0.9).toFixed(3)}  p99 ${q(jumps, 0.99).toFixed(3)}  MAX ${mx(jumps).toFixed(3)} deg`);
  log(`     SEP  (cluster centres, crease OR sweep)  p50 ${q(seps, 0.5).toFixed(4)}  p90 ${q(seps, 0.9).toFixed(3)}  p99 ${q(seps, 0.99).toFixed(3)}  MAX ${mx(seps).toFixed(3)} deg`);
  log(`     DIAM (total normal variation)            p50 ${q(diams, 0.5).toFixed(4)}  p90 ${q(diams, 0.9).toFixed(3)}  p99 ${q(diams, 0.99).toFixed(3)}  MAX ${mx(diams).toFixed(3)} deg`);
  for (let i = 0; i < BARS.length; i += 1) {
    log(`     facets whose OWN FOOTPRINT contains a >= ${BARS[i]} deg analytic JUMP:  COUNT ${nOver[i]} (${((nOver[i] / fSamp.length) * 100).toFixed(3)}%)   AREA-share ${((aOver[i] / Math.max(1e-12, aTot)) * 100).toFixed(4)}%`);
  }
  Object.assign(row, {
    facetSample: fSamp.length,
    jumpP50: q(jumps, 0.5), jumpP90: q(jumps, 0.9), jumpP99: q(jumps, 0.99), jumpMax: mx(jumps),
    sepP50: q(seps, 0.5), sepP99: q(seps, 0.99), sepMax: mx(seps),
    diamP50: q(diams, 0.5), diamP99: q(diams, 0.99), diamMax: mx(diams),
    inFootBars: BARS, inFootCount: nOver, inFootAreaPct: aOver.map((a) => (a / Math.max(1e-12, aTot)) * 100),
  });

  // ── CONTROL: the same PROBE B on the SMOOTH class. A FLOOR as well as a ceiling. ─────────────────
  const smooth: number[] = [];
  { const loThr = (2 * Math.PI) / 180;
    for (const f of goldenSample(nTri, Math.min(nTri, CTLN * 100))) {
      if (smooth.length >= CTLN) break;
      if (d.perFacetMaxRad[f] < loThr && graphRatio(f) <= CURTAIN_RATIO) smooth.push(f);
    } }
  if (smooth.length >= 50) {
    const cj = smooth.map((f) => footProbe(f).jump);
    const over45 = cj.filter((x) => x >= 45).length;
    log(`     CONTROL (n=${smooth.length} smooth facets, per-facet max dihedral < 2 deg): in-footprint JUMP p50 ${q(cj, 0.5).toFixed(4)}  p99 ${q(cj, 0.99).toFixed(3)}  MAX ${mx(cj).toFixed(3)} deg   >=45 deg: ${over45}`);
    if (over45 / cj.length > 0.05) log('     *** CONTROL FIRED: the in-footprint probe manufactures creases on smooth facets. PROBE B IS VOID FOR THIS STYLE. ***');
    Object.assign(row, { ctlJumpP50: q(cj, 0.5), ctlJumpP99: q(cj, 0.99), ctlJumpMax: mx(cj), ctlOver45: over45, ctlN: cj.length });
  } else {
    log(`     CONTROL: only ${smooth.length} smooth facets; cannot run.`);
  }
  return row;
}

mkdirSync(OUTDIR, { recursive: true });
const DEFAULT_LIST = [
  'GothicArches:gothicarches_ring_DS-HT_S39CTL.stl',
  'GyroidManifold:gyroidmanifold_ring_D--.stl',
  'HarmonicRipple:harmonicripple_ring_D--C.stl',
  'HexagonalHive:hexagonalhive_ring_D--.stl',
  'LowPolyFacet:lowpolyfacet_ring_D--.stl',
  'RippleInterference:rippleinterference_ring_D--.stl',
].join(',');
const LIST = (process.env.PF_S114CI_LIST ?? DEFAULT_LIST).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

log('===== S114-C INVERSE — DOES THE >45 DEG DIHEDRAL TEST MISS REAL ANALYTIC CREASES? =====');
log(`  bar ${HI_DEG} deg | lattice K=${K_LAT} | ${NCROSS} closest cross-flank pairs | dims H${DIMS.H} Rb${DIMS.Rb} Rt${DIMS.Rt}`);
log('  PI-1 LowPolyFacet carries a >=30 deg analytic crease INSIDE facet footprints (flagged at ZERO by the dihedral test).');
log('  PI-2 RippleInterference does NOT (in-footprint jump MAX < 5 deg). *** THE FLOOR — if PI-2 fails, PI-1 IS VOID. ***');

const rows: Array<Record<string, unknown>> = [];
for (const item of LIST) {
  const [s, f] = item.split(':');
  try { rows.push(measure(s, `${EXCH}/${f}`)); }
  catch (err) { log(`  *** ${s} THREW: ${(err as Error).message} ***`); rows.push({ style: s, error: (err as Error).message }); }
}

log('');
log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
log('S114-C INVERSE TABLE   (cell D = the miss the forward sweep structurally cannot see)');
log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
log('style | A_vis_crease% | B_vis_sweep% | C_vis_mesh% | D_HIDDEN_CREASE% | E_hid_sweep% | F_fine% | inFootJump_p99 | inFootJump_MAX | A%>=30 | A%>=45 | ctlJumpMAX');
for (const r of rows) {
  const c = r.cellsAreaPct as Record<string, number> | undefined;
  const ia = r.inFootAreaPct as number[] | undefined;
  log([
    r.style,
    c ? c.A.toFixed(3) : '-', c ? c.B.toFixed(3) : '-', c ? c.C.toFixed(3) : '-',
    c ? c.D.toFixed(3) : '-', c ? c.E.toFixed(3) : '-', c ? c.F.toFixed(3) : '-',
    typeof r.jumpP99 === 'number' ? (r.jumpP99 as number).toFixed(3) : '-',
    typeof r.jumpMax === 'number' ? (r.jumpMax as number).toFixed(3) : '-',
    ia ? ia[1].toFixed(4) : '-', ia ? ia[2].toFixed(4) : '-',
    typeof r.ctlJumpMax === 'number' ? (r.ctlJumpMax as number).toFixed(3) : '-',
  ].join(' | '));
}
writeFileSync(`${OUTDIR}/S114_INVERSE_${TAG}.json`, `${JSON.stringify({
  tool: 's114cInverse.ts', generatedAt: new Date().toISOString(),
  cuts: { HI_DEG, K_LAT, NCROSS, NEDGE, NFACET, CTLN, H_FD }, dims: DIMS, rows,
}, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_INVERSE_${TAG}.json`);
log(`done ${el()}`);
