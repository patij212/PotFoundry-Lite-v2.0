// s114cF32Band.ts — IS THE "MESH-MANUFACTURED" DIHEDRAL CLASS ACTUALLY f32 NOISE ON SLIVERS?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CONFOUND THIS EXISTS TO KILL. s114SweepC.ts finds HexagonalHive's entire >45 deg visible class
// (9,775 wall edges, 1,200 sampled, 100% by area) sitting on footprints whose TOTAL analytic normal
// variation is at most 24.75 deg — i.e. the mesh shows a >45 deg fold where the surface turns <25 deg.
// That is a strong claim and there is an obvious way for it to be an artefact:
//
//   AN STL STORES float32. A THIN FACET'S NORMAL IS ARBITRARILY SENSITIVE TO ITS VERTICES.
//   If HexagonalHive's high-dihedral facets are slivers, a 45 deg dihedral can be pure quantisation and
//   the honest verdict is "UNMEASURABLE", not "mesh-manufactured".
//
// The campaign already has this scar written down: STL-side defect gates need f32 DETERMINACY BANDS,
// never bare zeros. A gate that reports a defect smaller than its own arithmetic noise reports nothing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT. Per facet, how far can its NORMAL move given that each stored coordinate is only
// known to within half a float32 ULP of the true vertex?
//   bandLin  — first-order: for each of the 9 coordinates independently, the angular derivative of the
//              unit normal times 0.5 ULP, summed. A CONSERVATIVE (large) estimate.
//   bandRand — the max over NRAND independent uniform perturbations in [-0.5,+0.5] ULP on all 9 coords
//              at once. An ACHIEVED (small) value, hence a LOWER bound on the true band.
//   *** BOTH ARE PRINTED. *** A one-sided bar is vacuous: bandLin alone could be inflated to explain
//   anything away, bandRand alone could be too small to catch a real sensitivity. The verdict uses the
//   CONSERVATIVE one (bandLin) so the confound gets every benefit of the doubt.
//
// A pair is UNMEASURABLE when  measured_dihedral <= bandLin(f1) + bandLin(f2).
//
// SHAPE, reported beside it because it is the mechanism: aspect3 = diam*perim/(4*Area) (the s90/s91
// mis-orientation metric; >= 50 is the campaign's near-degenerate cut) and the min altitude 2A/diam.
//
// TWO-SIDED IN SITU: the same probe runs on GothicArches' straddling class, where the sweep says the
// class is 96.28% REAL crease. If the f32 band explains Gothic away too, the probe is mis-scaled and
// proves nothing. Gothic is the ceiling control; a random SMOOTH sample is the floor control.
//
// PRE-REGISTERED BEFORE THE FIRST RUN:
//   PF-1  HexagonalHive's mesh-manufactured class is NOT f32 noise: < 5% of it by AREA is UNMEASURABLE.
//         *** If >= 25% is unmeasurable, s114SweepC's HexagonalHive verdict must be withdrawn and
//         restated as UNMEASURABLE rather than CONTRADICTS. ***
//   PF-2  Gothic's straddling class is likewise < 5% unmeasurable (the ceiling control).
//
// Usage: bash research/tools/run-s114c-f32band.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DEG = 180 / Math.PI;

const OUTDIR = process.env.PF_S114F_OUTDIR ?? 'research/exchange/_strataConformBisect/s114c';
const EXCH = process.env.PF_S114F_EXCH ?? 'research/exchange/_strataConformBisect';
const HI_DEG = envF('PF_S114F_HI_DEG', 45);
const CURTAIN_RATIO = envF('PF_S114F_CURTAIN', 8);
const NRAND = Math.round(envF('PF_S114F_NRAND', 128));
const NPAIR = Math.round(envF('PF_S114F_NPAIR', 3000));
const CTLN = Math.round(envF('PF_S114F_CTLN', 3000));
const DIMS: StyleDims = { H: envF('PF_S114F_H', 120), Rb: envF('PF_S114F_RB', 40), Rt: envF('PF_S114F_RT', 50), expn: 1 };
const H = DIMS.H;
const TAG = process.env.PF_S114F_TAG ?? 'C';

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

/** exact float32 ULP at v (the gap to the next representable float32 of larger magnitude) */
const dv = new DataView(new ArrayBuffer(4));
function ulp32(v: number): number {
  const f = Math.fround(v);
  if (f === 0) return 1.401298464324817e-45;
  dv.setFloat32(0, f);
  const bits = dv.getUint32(0);
  dv.setUint32(0, bits + 1);          // next away from zero in magnitude (sign bit untouched for finite f)
  return Math.abs(dv.getFloat32(0) - f);
}
function unitNormal(p: Float64Array, o: number, out: Float64Array): boolean {
  const ux = p[o + 3] - p[o]; const uy = p[o + 4] - p[o + 1]; const uz = p[o + 5] - p[o + 2];
  const wx = p[o + 6] - p[o]; const wy = p[o + 7] - p[o + 1]; const wz = p[o + 8] - p[o + 2];
  let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  if (!(L > 0)) return false;
  nx /= L; ny /= L; nz /= L;
  out[0] = nx; out[1] = ny; out[2] = nz;
  return true;
}
const angBetween = (a: Float64Array, b: Float64Array): number => {
  let dp = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};

// deterministic PRNG so the run is reproducible
let seed = 0x2545f491;
const rnd = (): number => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

interface Band { lin: number; rand: number; aspect3: number; minAlt: number; areaMm2: number }
const tri = new Float64Array(9); const pert = new Float64Array(9);
const n0 = new Float64Array(3); const n1 = new Float64Array(3);
function bandOf(xyz: Float64Array, f: number): Band {
  for (let i = 0; i < 9; i += 1) tri[i] = xyz[f * 9 + i];
  const ok = unitNormal(tri, 0, n0);
  const e = [
    Math.hypot(tri[3] - tri[0], tri[4] - tri[1], tri[5] - tri[2]),
    Math.hypot(tri[6] - tri[3], tri[7] - tri[4], tri[8] - tri[5]),
    Math.hypot(tri[0] - tri[6], tri[1] - tri[7], tri[2] - tri[8]),
  ];
  const perim = e[0] + e[1] + e[2];
  const diam = Math.max(e[0], e[1], e[2]);
  const ux = tri[3] - tri[0]; const uy = tri[4] - tri[1]; const uz = tri[5] - tri[2];
  const wx = tri[6] - tri[0]; const wy = tri[7] - tri[1]; const wz = tri[8] - tri[2];
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const aspect3 = area > 0 ? (diam * perim) / (4 * area) : Infinity;
  const minAlt = diam > 0 ? (2 * area) / diam : 0;
  if (!ok) return { lin: Math.PI, rand: Math.PI, aspect3, minAlt, areaMm2: area };
  // bandLin — per-coordinate one-at-a-time sensitivity at half an ULP, summed (CONSERVATIVE)
  let lin = 0;
  for (let i = 0; i < 9; i += 1) {
    pert.set(tri);
    pert[i] = tri[i] + 0.5 * ulp32(tri[i]);
    if (unitNormal(pert, 0, n1)) lin += angBetween(n0, n1);
  }
  // bandRand — max over NRAND simultaneous uniform half-ULP perturbations (ACHIEVED, hence a LOWER bound)
  let rand = 0;
  for (let t = 0; t < NRAND; t += 1) {
    for (let i = 0; i < 9; i += 1) pert[i] = tri[i] + (rnd() - 0.5) * ulp32(tri[i]);
    if (unitNormal(pert, 0, n1)) { const a = angBetween(n0, n1); if (a > rand) rand = a; }
  }
  return { lin: lin * DEG, rand: rand * DEG, aspect3, minAlt, areaMm2: area };
}

function measure(style: string, stl: string): Record<string, unknown> {
  const row: Record<string, unknown> = { style, stl };
  log('');
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style} ═════`);
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const M = readMeshFloat64(stl, false);
  const xyz = M.xyz; const nTri = M.nTri;
  let worst = 0;
  { const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    } }
  log(`  facets ${nTri}   PRECOND ${(worst * 1000).toFixed(4)} um`);
  row.nTri = nTri; row.precondUm = worst * 1000;
  if (worst * 1000 > 50) { log('  *** REFUSED (PRECOND) ***'); row.refused = true; return row; }

  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
    const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
    return [a, b, c];
  };
  function graphRatio(f: number): number {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const ux = xyz[f * 9 + 3] - ax; const uy = xyz[f * 9 + 4] - ay; const uz = xyz[f * 9 + 5] - az;
    const wx = xyz[f * 9 + 6] - ax; const wy = xyz[f * 9 + 7] - ay; const wz = xyz[f * 9 + 8] - az;
    const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const [ath, bth, cth] = th3(f);
    const rRef = (Math.hypot(xyz[f * 9], xyz[f * 9 + 1]) + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
    const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (xyz[f * 9 + 8] - az) - (xyz[f * 9 + 5] - az) * (rRef * (cth - ath)));
    return aP > 1e-15 ? a3 / aP : Infinity;
  }

  const hiThr = (HI_DEG * Math.PI) / 180;
  const wall: number[] = [];
  for (let e = 0; e < d.interiorEdges; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    if (graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO) continue;
    wall.push(e);
  }
  log(`  high-dihedral WALL edges: ${wall.length}`);
  row.wallEdges = wall.length;
  if (wall.length === 0) { log('  no wall class on this mesh — nothing to test.'); return row; }

  const samp = goldenSample(wall.length, Math.min(NPAIR, wall.length)).map((i) => wall[i]);
  const lins: number[] = []; const rands: number[] = []; const asp: number[] = []; const alts: number[] = [];
  let aTot = 0; let aUnmeas = 0; let nUnmeas = 0;
  const seenF = new Set<number>();
  for (const e of samp) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const b1 = bandOf(xyz, f1); const b2 = bandOf(xyz, f2);
    lins.push(b1.lin, b2.lin); rands.push(b1.rand, b2.rand);
    asp.push(b1.aspect3, b2.aspect3); alts.push(b1.minAlt, b2.minAlt);
    const meas = d.edgeAngRad[e] * DEG;
    const unm = meas <= b1.lin + b2.lin;
    for (const f of [f1, f2]) if (!seenF.has(f)) { seenF.add(f); aTot += d.areaMm2[f]; if (unm) { aUnmeas += d.areaMm2[f]; nUnmeas += 1; } }
  }
  log(`  sampled ${samp.length}/${wall.length} wall pairs, ${seenF.size} unique facets, AREA ${aTot.toFixed(4)} mm2`);
  log(`  f32 NORMAL BAND, bandLin (conservative, per-coord half-ULP summed)  p50 ${q(lins, 0.5).toExponential(3)}  p99 ${q(lins, 0.99).toExponential(3)}  MAX ${mx(lins).toExponential(3)} deg`);
  log(`  f32 NORMAL BAND, bandRand (achieved over ${NRAND} draws, a LOWER bound) p50 ${q(rands, 0.5).toExponential(3)}  p99 ${q(rands, 0.99).toExponential(3)}  MAX ${mx(rands).toExponential(3)} deg`);
  log(`  SHAPE  aspect3 = diam*perim/4A   p50 ${q(asp, 0.5).toFixed(3)}  p99 ${q(asp, 0.99).toFixed(2)}  MAX ${mx(asp).toFixed(2)}   (campaign near-degenerate cut: 50)`);
  log(`         min altitude 2A/diam      p50 ${q(alts, 0.5).toExponential(3)}  p10 ${q(alts, 0.1).toExponential(3)}  MIN ${Math.min(...alts).toExponential(3)} mm`);
  log(`  *** UNMEASURABLE (measured dihedral <= bandLin(f1)+bandLin(f2)):  COUNT ${nUnmeas} facets   AREA ${aUnmeas.toFixed(6)} mm2 = ${((aUnmeas / Math.max(1e-12, aTot)) * 100).toFixed(4)}% of the class ***`);
  const asp50 = asp.filter((a) => a >= 50).length;
  log(`  facets with aspect3 >= 50 (near-degenerate): ${asp50}/${asp.length} = ${((asp50 / asp.length) * 100).toFixed(3)}%`);
  Object.assign(row, {
    sampledPairs: samp.length, uniqueFacets: seenF.size, classAreaMm2: aTot,
    bandLinP50: q(lins, 0.5), bandLinP99: q(lins, 0.99), bandLinMax: mx(lins),
    bandRandP50: q(rands, 0.5), bandRandMax: mx(rands),
    aspect3P50: q(asp, 0.5), aspect3P99: q(asp, 0.99), aspect3Max: mx(asp), aspect3Over50Pct: (asp50 / asp.length) * 100,
    minAltP50: q(alts, 0.5), minAltMin: Math.min(...alts),
    unmeasurableCount: nUnmeas, unmeasurableAreaPct: (aUnmeas / Math.max(1e-12, aTot)) * 100,
  });

  // FLOOR CONTROL: the same band on a random sample of ALL facets. If the whole mesh's band is the same
  // size, the band is a property of the mesh scale and says nothing specific about the high class.
  const ctl = goldenSample(nTri, Math.min(CTLN, nTri));
  const cl: number[] = []; const ca: number[] = [];
  for (const f of ctl) { const b = bandOf(xyz, f); cl.push(b.lin); ca.push(b.aspect3); }
  log(`  FLOOR CONTROL (n=${ctl.length} facets drawn from the WHOLE mesh): bandLin p50 ${q(cl, 0.5).toExponential(3)}  MAX ${mx(cl).toExponential(3)} deg   aspect3 p50 ${q(ca, 0.5).toFixed(3)}`);
  Object.assign(row, { ctlBandLinP50: q(cl, 0.5), ctlBandLinMax: mx(cl), ctlAspect3P50: q(ca, 0.5) });
  return row;
}

mkdirSync(OUTDIR, { recursive: true });
const DEFAULT_LIST = [
  'HexagonalHive:hexagonalhive_ring_D--.stl',
  'GothicArches:gothicarches_ring_DS-HT_S39CTL.stl',
  'GyroidManifold:gyroidmanifold_ring_D--.stl',
  'HarmonicRipple:harmonicripple_ring_D--C.stl',
].join(',');
const LIST = (process.env.PF_S114F_LIST ?? DEFAULT_LIST).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

log('===== S114-C f32 DETERMINACY BAND — IS THE "MESH-MANUFACTURED" CLASS JUST QUANTISATION NOISE? =====');
log(`  bar ${HI_DEG} deg | ${NRAND} random half-ULP draws | up to ${NPAIR} wall pairs per style`);
log('  PF-1 HexagonalHive: < 5% of the class UNMEASURABLE.  >= 25% => the CONTRADICTS verdict must be withdrawn.');
log('  PF-2 GothicArches (ceiling control): likewise < 5%.');

const rows: Array<Record<string, unknown>> = [];
for (const item of LIST) {
  const [s, f] = item.split(':');
  try { rows.push(measure(s, `${EXCH}/${f}`)); }
  catch (err) { log(`  *** ${s} THREW: ${(err as Error).message} ***`); rows.push({ style: s, error: (err as Error).message }); }
}
log('');
log('style | wallEdges | bandLin_p50 | bandLin_MAX | aspect3_p50 | aspect3>=50% | UNMEASURABLE_AREA% | ctl_bandLin_p50');
for (const r of rows) {
  const n = (k: string, dgt = 3): string => (typeof r[k] === 'number' ? (r[k] as number).toExponential(dgt) : '-');
  const t = (k: string, dgt = 3): string => (typeof r[k] === 'number' ? (r[k] as number).toFixed(dgt) : '-');
  log([r.style, r.wallEdges ?? '-', n('bandLinP50'), n('bandLinMax'), t('aspect3P50'), t('aspect3Over50Pct'), t('unmeasurableAreaPct', 4), n('ctlBandLinP50')].join(' | '));
}
writeFileSync(`${OUTDIR}/S114_F32BAND_${TAG}.json`, `${JSON.stringify({ tool: 's114cF32Band.ts', generatedAt: new Date().toISOString(), cuts: { HI_DEG, CURTAIN_RATIO, NRAND, NPAIR }, dims: DIMS, rows }, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_F32BAND_${TAG}.json`);
