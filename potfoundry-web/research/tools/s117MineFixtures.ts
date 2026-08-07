// s117MineFixtures.ts — S117 P1: MINE REAL FACET FIXTURES FOR THE emitInvariant UNIT TEST.
//
// The load-bearing half of a two-sided predicate test is the NEGATIVE control: REAL GothicArches facets
// that are HIGH-DIHEDRAL BUT CORRECT GEOMETRY. S116 measured that class (25,519 facets / 860.392 mm2,
// 94.41% of Gothic's >45 deg class area, real orientRuler normDeg <= 10 deg with the inset PASSED
// EXPLICITLY and swept). A predicate that flags them is REFUTED. This tool extracts a sample of them —
// plus CelticTriquetra fold / blade / degenerate exemplars — as TypeScript literals to paste into
// src/renderers/webgpu/parametric/conforming/emitInvariant.test.ts.
//
// SCARS OBEYED: inset PASSED EXPLICITLY and swept {0.02,0.05,0.1} (a facet only qualifies as GOOD if it is
// under the bar at EVERY inset in the sweep); k swept {4,8,16}; fd step h swept {2e-6,2e-5,2e-4}; the ACC
// bar itself is a parameter. spreadRad is never quoted.
//
// Usage: bash research/tools/run-s117-mine.sh
//   env PF_S117_STL (absolute) PF_S117_STYLE PF_S117_TAG PF_S117_MODE(good|bad) PF_S117_N
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));

const STYLE = process.env.PF_S117_STYLE ?? 'GothicArches';
const STL = process.env.PF_S117_STL ?? '';
const TAG = process.env.PF_S117_TAG ?? STYLE;
const MODE = process.env.PF_S117_MODE ?? 'good';
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const SQ3x4 = 4 * Math.sqrt(3);

const N_WANT = envI('PF_S117_N', 24);
const HI_DEG = envF('PF_S117_HI_DEG', 45);
const ACC_BAR = envF('PF_S117_ACC', 10);
const BLADE_DEG = envF('PF_S117_BLADE', 175);
const CEIL_DEG_IN = envF('PF_S117_CEIL', 0); // 0 = compute
const SCAN_CAP = envI('PF_S117_SCANCAP', 400000);

if (STL.length === 0) { log('*** PF_S117_STL is required (ABSOLUTE path). ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');

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

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S117 FIXTURE MINE — ${STYLE} (tag ${TAG}, mode ${MODE}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl  ${STL}`);
log(`defs ${Object.entries(DEFAULTS).map(([kk, v]) => `${kk}=${v}`).join(' ')}`);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nF = M.nTri;
log(`loaded ${nF} facets ${el()}`);

const idxAll = new Uint32Array(nF * 3); for (let i = 0; i < nF * 3; i += 1) idxAll[i] = i;
const DD = facetDihedrals(xyz, idxAll);
log(`topology: interior ${DD.interiorEdges} boundary ${DD.boundaryEdges} non-manifold ${DD.nonManifoldEdges} inconsistent ${DD.inconsistentEdges} ${el()}`);
let meshArea = 0; for (let f = 0; f < nF; f += 1) meshArea += DD.areaMm2[f];
log(`mesh AREA ${meshArea.toFixed(3)} mm2`);

// ── analytic ceiling (only needed for the BAD set) ────────────────────────────────────────────────
function ceilingAt(hfd: number, N: number): number {
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
  return 2 * Math.atan(gmax) * DEG;
}
const CEIL_DEG = CEIL_DEG_IN > 0 ? CEIL_DEG_IN : ceilingAt(2e-6, 1200);
log(`analytic ceiling CEIL = ${CEIL_DEG.toFixed(3)} deg ${el()}`);

// ── per-facet parameter quantities (the emit-invariant scalars, zero analytic evaluations) ─────────
interface FQ { aps: number; qP: number; minAlt: number; lp: number; rbar: number; tha: number; thb: number; thc: number }
function paramOf(f: number): FQ {
  const o = f * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
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
  const lp = Math.max(e0, e1, e2);
  return {
    aps, qP: lp > 0 ? (SQ3x4 * aps) / (lp * lp) : 0, minAlt: lp > 0 ? (2 * Math.abs(aps)) / lp : 0,
    lp, rbar, tha, thb, thc,
  };
}

// global winding sigma = AREA-weighted majority sign of ApS (S116's definition, reproduced)
let negApArea = 0; let negAp = 0;
for (let f = 0; f < nF; f += 1) if (paramOf(f).aps < 0) { negAp += 1; negApArea += DD.areaMm2[f]; }
const SIGMA = negApArea > meshArea / 2 ? -1 : 1;
log(`sigma (area-weighted majority parameter winding) = ${SIGMA}   [minority: ${negAp} facets, ${negApArea.toFixed(3)} mm2 = ${pct(negApArea, meshArea)}% of mesh]`);

// ── the real orientRuler, scars swept ─────────────────────────────────────────────────────────────
const scratch = new Float64Array(12);
function realNormDeg(f: number, k: number, inset: number, hfd: number): number {
  const o = f * 9;
  const p = paramOf(f);
  const ns = fdNormals(rA, H, hfd, hfd);
  const r = orientOfFacet(
    ns,
    xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
    p.tha, p.thb, p.thc, { k, inset, scratch },
  );
  return r.normDeg;
}

const hiThr = (HI_DEG * Math.PI) / 180;
const ceThr = (CEIL_DEG * Math.PI) / 180;
const blThr = (BLADE_DEG * Math.PI) / 180;

const INSETS = [0.02, 0.05, 0.1];
const KS = [4, 8, 16];
const HS = [2e-6, 2e-5, 2e-4];

interface Pick { f: number; dihDeg: number; area: number; nd: number; q: FQ }
const picks: Pick[] = [];

if (MODE === 'good') {
  // GOOD = in the >HI_DEG dihedral class AND real normDeg <= ACC_BAR at EVERY swept inset/k/h.
  // Take the LARGEST-AREA such facets: the biggest real-geometry facets are the ones a false positive
  // would cost the most, and they are the hardest for a parameter-space predicate to keep.
  const cand: Array<{ f: number; area: number }> = [];
  for (let f = 0; f < nF; f += 1) if (DD.perFacetMaxRad[f] > hiThr) cand.push({ f, area: DD.areaMm2[f] });
  cand.sort((a, b) => b.area - a.area);
  log(`>${HI_DEG} deg class: ${cand.length} facets ${el()}`);
  let scanned = 0;
  for (const c of cand) {
    if (picks.length >= N_WANT || scanned >= SCAN_CAP) break;
    scanned += 1;
    let worst = 0;
    for (const ins of INSETS) for (const k of KS) for (const hh of HS) {
      const nd = realNormDeg(c.f, k, ins, hh);
      if (!(nd <= ACC_BAR)) { worst = Infinity; break; }
      if (nd > worst) worst = nd;
    }
    if (!Number.isFinite(worst)) continue;
    picks.push({ f: c.f, dihDeg: DD.perFacetMaxRad[c.f] * DEG, area: c.area, nd: worst, q: paramOf(c.f) });
  }
  log(`GOOD picks: ${picks.length} (scanned ${scanned} of the class, largest-area first) ${el()}`);
} else {
  // BAD exemplars: fold (minority ApS sign), blade (minAlt tiny AND dihedral >= BLADE_DEG),
  // over-ceiling. Largest-area first inside each bucket so the fixtures are not micro-noise.
  const fold: Array<{ f: number; area: number }> = [];
  const blade: Array<{ f: number; area: number }> = [];
  const overC: Array<{ f: number; area: number }> = [];
  for (let f = 0; f < nF; f += 1) {
    const q = paramOf(f);
    if (SIGMA * q.aps <= 0) fold.push({ f, area: DD.areaMm2[f] });
    if (DD.perFacetMaxRad[f] >= blThr && q.minAlt < 2e-3) blade.push({ f, area: DD.areaMm2[f] });
    if (DD.perFacetMaxRad[f] > ceThr) overC.push({ f, area: DD.areaMm2[f] });
  }
  for (const arr of [fold, blade, overC]) arr.sort((a, b) => b.area - a.area);
  log(`fold ${fold.length}  blade(<2um minAlt & >=${BLADE_DEG}deg) ${blade.length}  over-CEIL ${overC.length}`);
  const take = Math.max(1, Math.floor(N_WANT / 3));
  const seen = new Set<number>();
  for (const arr of [fold, blade, overC]) {
    let n = 0;
    for (const c of arr) {
      if (n >= take) break;
      if (seen.has(c.f)) continue;
      seen.add(c.f); n += 1;
      picks.push({ f: c.f, dihDeg: DD.perFacetMaxRad[c.f] * DEG, area: c.area, nd: realNormDeg(c.f, 8, 0.05, 2e-6), q: paramOf(c.f) });
    }
  }
  log(`BAD picks: ${picks.length} ${el()}`);
}

// ── emit the TypeScript literal ───────────────────────────────────────────────────────────────────
const n9 = (v: number): string => v.toPrecision(17);
const lines: string[] = [];
lines.push(`// ${MODE === 'good' ? 'GOOD' : 'BAD'} fixtures mined from ${STL}`);
lines.push(`// sigma=${SIGMA}  CEIL=${CEIL_DEG.toFixed(3)}deg  mesh ${nF} facets ${meshArea.toFixed(3)} mm2`);
for (const p of picks) {
  const o = p.f * 9;
  const c: number[] = [];
  for (let i = 0; i < 9; i += 1) c.push(xyz[o + i]);
  lines.push(`  { f: ${p.f}, v: [${c.map(n9).join(', ')}],`);
  lines.push(`    th: [${n9(p.q.tha)}, ${n9(p.q.thb)}, ${n9(p.q.thc)}],`);
  lines.push(`    dihDeg: ${p.dihDeg.toFixed(4)}, areaMm2: ${p.area.toExponential(6)}, normDeg: ${p.nd.toFixed(4)},`);
  lines.push(`    apS: ${p.q.aps.toExponential(6)}, qP: ${p.q.qP.toExponential(6)}, minAltMm: ${p.q.minAlt.toExponential(6)} },`);
}
const body = lines.join('\n');
log('');
log('──────── PASTE-READY FIXTURES ────────');
log(body);
log('──────── END ────────');

const outPath = `${OUTDIR}/S117_FIXTURES_${TAG}.ts.txt`;
writeFileSync(outPath, `${body}\n`);
writeFileSync(`${OUTDIR}/S117_FIXTURES_${TAG}.json`, JSON.stringify({
  style: STYLE, stl: STL, mode: MODE, sigma: SIGMA, ceilDeg: CEIL_DEG, nF, meshArea,
  insets: INSETS, ks: KS, hs: HS, accBar: ACC_BAR, hiDeg: HI_DEG, bladeDeg: BLADE_DEG,
  picks: picks.map((p) => ({ f: p.f, dihDeg: p.dihDeg, area: p.area, normDeg: p.nd, aps: p.q.aps, qP: p.q.qP, minAlt: p.q.minAlt })),
}, null, 2));
log(`\nwrote ${outPath} ${el()}`);
