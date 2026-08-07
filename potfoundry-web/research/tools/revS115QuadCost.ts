// revS115QuadCost.ts — VERIFIER PROBE for S115 "oracle/prize".
//
// WHAT IT TESTS. S115's kill line ("a turn-equalised analytic grid at MATCHED triangle count is 1.69x
// WORSE than the shipping mesh => the reducible share corresponds to NO achievable mesh") was measured
// on a SEPARABLE (tensor-product) generator. The report's own harms section names this as the one place
// a re-run could overturn the verdict: a separable grid can only refine whole columns and whole rows, so
// it cannot pay for a diagonal wall locally.
//
// This probe replaces the separable arm with a LOCAL (quadtree) sizing arm and prices it HONESTLY:
//   - level 0 = a coarse structured sector grid.
//   - level L = the same sector at nT0*2^L x nZ0*2^L.
//   - for each level-0 cell, l*(cell) = the SMALLEST level at which EVERY facet inside that cell has
//     per-facet max dihedral <= BAR. (Facets are scored with the SAME per-facet max-dihedral ruler the
//     S115 tool uses, so the arms are commensurable.)
//   - adaptive triangle cost = SUM over level-0 cells of 2 * 4^(l*).
//     This is the exact leaf count of a quadtree whose leaves are those uniform blocks. It IGNORES the
//     green/red closure a conforming quadtree needs (<= ~2x) and it scores each block with SAME-LEVEL
//     neighbours, so it is OPTIMISTIC. Both biases are stated, not hidden.
//
// CONTROL (mandatory): the level-0/uniform reimplementation must reproduce the S115 tool's own sector
// UNIFORM row (89 x 606 -> tris 107868, AREA 3089.419 mm2, >45 AREA 8.2956%) to the printed digit. If it
// does not, this probe is VOID and says so.
//
// Nothing under src/ or research/bridge/_strataConformBisectL.test.ts is touched; rA comes from the same
// registry defaults + buildRadiusFn the S115 tool uses. No h, no inset, no orientOfFacet: this probe is
// PURE DIHEDRAL and therefore h-free and inset-free by construction (SCARS 1 and 3 are inert here, and
// that is asserted, not assumed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import type { StyleId, StyleDims, RadiusFn } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envL = (n: string, d: string): number[] => (process.env[n] ?? d).split(',').map(Number);

const STYLE = process.env.PF_QC_STYLE ?? 'CelticTriquetra';
const TAG = process.env.PF_QC_TAG ?? 'QC';
const OUTDIR = process.env.PF_QC_OUTDIR ?? 'research/exchange/_strataConformBisect/s115oracle';
const DIMS: StyleDims = { H: envF('PF_QC_H', 120), Rb: envF('PF_QC_RB', 40), Rt: envF('PF_QC_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const SECTOR_DIV = envI('PF_QC_SECTORDIV', 16);
const SECTOR_T0 = envF('PF_QC_SECTORT0', 0);
const BARS = envL('PF_QC_BARS', '45,60,90,163.41');
const BAR = envF('PF_QC_BAR', 45);
const NT0 = envI('PF_QC_NT0', 16);
const NZ0 = envI('PF_QC_NZ0', 108);
const LMAX = envI('PF_QC_LMAX', 6);
// the S115 sector control row
const CTL_NT = envI('PF_QC_CTLNT', 89);
const CTL_NZ = envI('PF_QC_CTLNZ', 606);
const CTL_TRIS = envI('PF_QC_CTLTRIS', 107868);
const CTL_AREA = envF('PF_QC_CTLAREA', 3089.419);
const CTL_OVER45 = envF('PF_QC_CTLOVER45', 8.2956);
// the shipping mesh's own sector numbers, quoted from the S115 tool (BASE row) for the head-to-head
const BASE_TRIS = envI('PF_QC_BASETRIS', 108021);
const BASE_AREA = envF('PF_QC_BASEAREA', 3161.506);
const BASE_OVER45 = envF('PF_QC_BASEOVER45', 3.9620);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
mkdirSync(OUTDIR, { recursive: true });

/**
 * Structured sector grid, wrap=false. Byte-for-byte the same construction and the same PER-FACET
 * max-dihedral ruler as s115OracleCeiling.ts `structuredGrid`, plus a per-block max/area aggregation
 * into a coarse (bT x bZ) binning of the SAME parameter rectangle.
 */
interface GridOut {
  tris: number; areaMm2: number; maxDeg: number;
  overArea: Record<number, number>; overCount: Record<number, number>;
  blockMaxRad: Float64Array; blockArea: Float64Array; blockOverArea: Float64Array;
}
function sectorGrid(t0: number, t1: number, nT: number, nZ: number, bT: number, bZ: number): GridOut {
  const nCol = nT + 1;
  const vx = new Float64Array(nCol * (nZ + 1));
  const vy = new Float64Array(nCol * (nZ + 1));
  const vz = new Float64Array(nCol * (nZ + 1));
  for (let i = 0; i < nCol; i += 1) {
    const th = t0 + ((t1 - t0) * i) / nT;
    const c = Math.cos(th); const s = Math.sin(th);
    for (let j = 0; j <= nZ; j += 1) {
      const z = (H * j) / nZ;
      const r = rA(th, z);
      const o = i * (nZ + 1) + j;
      vx[o] = r * c; vy[o] = r * s; vz[o] = z;
    }
  }
  const nF = 2 * nT * nZ;
  const fnx = new Float64Array(nF); const fny = new Float64Array(nF); const fnz = new Float64Array(nF);
  const fa = new Float64Array(nF); const fmax = new Float64Array(nF);
  const V = (i: number, j: number): number => i * (nZ + 1) + j;
  const setF = (fi: number, a: number, b: number, c: number): void => {
    const ux = vx[b] - vx[a]; const uy = vy[b] - vy[a]; const uz = vz[b] - vz[a];
    const wx = vx[c] - vx[a]; const wy = vy[c] - vy[a]; const wz = vz[c] - vz[a];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const L = Math.hypot(cx, cy, cz);
    fa[fi] = 0.5 * L;
    if (L > 0) { fnx[fi] = cx / L; fny[fi] = cy / L; fnz[fi] = cz / L; }
  };
  for (let i = 0; i < nT; i += 1) {
    for (let j = 0; j < nZ; j += 1) {
      const cell = i * nZ + j;
      setF(cell * 2, V(i, j), V(i + 1, j), V(i + 1, j + 1));
      setF(cell * 2 + 1, V(i, j), V(i + 1, j + 1), V(i, j + 1));
    }
  }
  let maxAng = 0;
  const pair = (fi: number, fj: number): void => {
    let dp = fnx[fi] * fnx[fj] + fny[fi] * fny[fj] + fnz[fi] * fnz[fj];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    const ang = Math.acos(dp);
    if (ang > maxAng) maxAng = ang;
    if (ang > fmax[fi]) fmax[fi] = ang;
    if (ang > fmax[fj]) fmax[fj] = ang;
  };
  for (let i = 0; i < nT; i += 1) {
    for (let j = 0; j < nZ; j += 1) {
      const cell = i * nZ + j;
      pair(cell * 2, cell * 2 + 1);
      if (j >= 1) pair(cell * 2, (i * nZ + (j - 1)) * 2 + 1);
      if (i + 1 < nT) pair(cell * 2, ((i + 1) * nZ + j) * 2 + 1);
    }
  }
  let area = 0;
  const overArea: Record<number, number> = {}; const overCount: Record<number, number> = {};
  for (const b of BARS) { overArea[b] = 0; overCount[b] = 0; }
  const blockMaxRad = new Float64Array(bT * bZ);
  const blockArea = new Float64Array(bT * bZ);
  const blockOverArea = new Float64Array(bT * bZ);
  const thr = (BAR * Math.PI) / 180;
  const rT = nT / bT; const rZ = nZ / bZ;
  for (let i = 0; i < nT; i += 1) {
    const bi = Math.min(bT - 1, Math.floor(i / rT));
    for (let j = 0; j < nZ; j += 1) {
      const bj = Math.min(bZ - 1, Math.floor(j / rZ));
      const bidx = bi * bZ + bj;
      const cell = i * nZ + j;
      for (let s = 0; s < 2; s += 1) {
        const f = cell * 2 + s;
        area += fa[f];
        blockArea[bidx] += fa[f];
        if (fmax[f] > blockMaxRad[bidx]) blockMaxRad[bidx] = fmax[f];
        if (fmax[f] > thr) blockOverArea[bidx] += fa[f];
        for (const b of BARS) if (fmax[f] > (b * Math.PI) / 180) { overArea[b] += fa[f]; overCount[b] += 1; }
      }
    }
  }
  return { tris: nF, areaMm2: area, maxDeg: maxAng * DEG, overArea, overCount, blockMaxRad, blockArea, blockOverArea };
}

const W = (2 * Math.PI) / SECTOR_DIV;
const t0 = SECTOR_T0; const t1 = SECTOR_T0 + W;

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== REV-S115 QUADTREE COST PROBE — is the S115 kill line a SURFACE fact or a SEPARABLE-GENERATOR artefact? =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`style ${STYLE}  dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`registry defaults: ${Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log(`sector theta [${t0.toFixed(4)}, ${t1.toFixed(4)}] (1/${SECTOR_DIV})   bar ${BAR} deg   level-0 ${NT0}x${NZ0}   LMAX ${LMAX}`);
log('PURE DIHEDRAL: no fdNormals, no orientOfFacet => h and inset are INERT BY CONSTRUCTION here.');
log('');

const OUT: Record<string, unknown> = { style: STYLE, tag: TAG, dims: DIMS, sector: { t0, t1, div: SECTOR_DIV }, bar: BAR, nT0: NT0, nZ0: NZ0, lmax: LMAX };

// ── CONTROL: reproduce the S115 tool's own sector UNIFORM row ────────────────────────────────────────
log('── CONTROL C-A: reproduce s115OracleCeiling.ts sector UNIFORM 1x to the printed digit ──');
{
  const g = sectorGrid(t0, t1, CTL_NT, CTL_NZ, 1, 1);
  const o45 = (g.overArea[45] / g.areaMm2) * 100;
  const okT = g.tris === CTL_TRIS;
  const okA = Math.abs(g.areaMm2 - CTL_AREA) < 0.01;
  const okO = Math.abs(o45 - CTL_OVER45) < 0.0005;
  log(`   S115 printed : tris ${CTL_TRIS}  AREA ${CTL_AREA.toFixed(3)}  >45 AREA ${CTL_OVER45.toFixed(4)}%`);
  log(`   this probe   : tris ${g.tris}  AREA ${g.areaMm2.toFixed(3)}  >45 AREA ${o45.toFixed(4)}%  MAX ${g.maxDeg.toFixed(3)} deg`);
  log(`   => ${okT && okA && okO ? 'CONTROL PASSES — same instrument' : '*** CONTROL FAILED — THIS PROBE IS VOID ***'}`);
  OUT.controlA = { tris: g.tris, areaMm2: g.areaMm2, over45: o45, pass: okT && okA && okO };
  if (!(okT && okA && okO)) { writeFileSync(`${OUTDIR}/REVQC_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`); process.exit(0); }
}
log('');

// ── the level ladder ────────────────────────────────────────────────────────────────────────────────
log('── THE LEVEL LADDER (uniform sector refinement; per-FACET max dihedral; block = one level-0 cell) ──');
log('   lvl    nT x nZ          tris    AREA mm2   areaRatio   >45 AREA%   >60 AREA%   >163.41%   MAX dih   blocks clean');
const nBlk = NT0 * NZ0;
const lvlOfBlock = new Int32Array(nBlk).fill(-1);
const areaAtLvl: Float64Array[] = [];
const overAtLvl: Float64Array[] = [];
const ladder: Array<Record<string, number>> = [];
for (let L = 0; L <= LMAX; L += 1) {
  const nT = NT0 * 2 ** L; const nZ = NZ0 * 2 ** L;
  const t = Date.now();
  const g = sectorGrid(t0, t1, nT, nZ, NT0, NZ0);
  areaAtLvl.push(g.blockArea); overAtLvl.push(g.blockOverArea);
  const thr = (BAR * Math.PI) / 180;
  let clean = 0;
  for (let b = 0; b < nBlk; b += 1) {
    if (g.blockMaxRad[b] <= thr) { clean += 1; if (lvlOfBlock[b] < 0) lvlOfBlock[b] = L; }
  }
  const o45 = (g.overArea[45] / g.areaMm2) * 100;
  log(`   ${String(L).padStart(3)}  ${String(nT).padStart(5)} x ${String(nZ).padStart(6)}  ${String(g.tris).padStart(12)}  ${g.areaMm2.toFixed(3).padStart(10)}  ${(g.areaMm2 / BASE_AREA).toFixed(4).padStart(9)}  ${pct(g.overArea[45], g.areaMm2).padStart(9)}%  ${pct(g.overArea[60], g.areaMm2).padStart(9)}%  ${pct(g.overArea[163.41], g.areaMm2).padStart(8)}%  ${g.maxDeg.toFixed(3).padStart(8)}  ${String(clean).padStart(6)}/${nBlk}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  ladder.push({ L, nT, nZ, tris: g.tris, areaMm2: g.areaMm2, over45: o45, over60: (g.overArea[60] / g.areaMm2) * 100, fold: (g.overArea[163.41] / g.areaMm2) * 100, maxDeg: g.maxDeg, cleanBlocks: clean });
}
OUT.ladder = ladder;
log('');

// ── the quadtree price ──────────────────────────────────────────────────────────────────────────────
log('── THE LOCAL (QUADTREE) PRICE — the arm S115 never built ──');
log('   For each level-0 block, l* = the smallest level at which EVERY facet in it is <= bar.');
log('   cost = SUM 2*4^l*  (leaf count; green closure NOT included, see the harms line).');
let cost = 0; let unresolved = 0; let unresArea = 0; let resArea = 0;
const hist = new Int32Array(LMAX + 2);
for (let b = 0; b < nBlk; b += 1) {
  const L = lvlOfBlock[b];
  if (L < 0) { cost += 2 * 4 ** LMAX; unresolved += 1; unresArea += areaAtLvl[LMAX][b]; hist[LMAX + 1] += 1; }
  else { cost += 2 * 4 ** L; resArea += areaAtLvl[LMAX][b]; hist[L] += 1; }
}
const totArea = resArea + unresArea;
log(`   l* histogram (blocks): ${Array.from(hist).map((c, i) => `${i > LMAX ? 'unres' : `L${i}`}:${c}`).join('  ')}`);
log(`   *** LOCAL-SIZING COST to put EVERY block under ${BAR} deg: ${cost.toLocaleString()} triangles ***`);
log(`       vs the shipping mesh sector: ${BASE_TRIS.toLocaleString()} triangles  =>  ${(cost / BASE_TRIS).toFixed(3)}x`);
log(`   residual >${BAR} AREA carried by blocks that never clean by L${LMAX}: ${pct(unresArea, totArea)}% of sector area (${unresolved} blocks)`);
OUT.quad = { cost, ratioToBase: cost / BASE_TRIS, unresolved, unresAreaPct: (unresArea / totArea) * 100, hist: Array.from(hist) };
log('');

// ── the head-to-head at MATCHED triangle count ───────────────────────────────────────────────────────
log('── THE HEAD-TO-HEAD S115 ACTUALLY NEEDED: what does LOCAL sizing reach at the MATCHED budget? ──');
log('   Greedy: refine blocks in decreasing >bar area until the budget is spent. Same leaf-cost model.');
{
  // start every block at level 0, then repeatedly promote the block with the largest over-bar area
  // per added triangle until the budget is exhausted.
  const lv = new Int32Array(nBlk);
  let tris = nBlk * 2;
  const budget = BASE_TRIS;
  const gain = (b: number): number => {
    const L = lv[b]; if (L >= LMAX) return -1;
    const before = overAtLvl[L][b]; const after = overAtLvl[L + 1][b];
    const dT = 2 * 4 ** (L + 1) - 2 * 4 ** L;
    return (before - after) / dT;
  };
  // simple max-heap-free greedy: recompute a bounded candidate list each sweep (nBlk is small)
  for (let guard = 0; guard < 2_000_000; guard += 1) {
    let best = -1; let bestG = 0;
    for (let b = 0; b < nBlk; b += 1) { const g = gain(b); if (g > bestG) { bestG = g; best = b; } }
    if (best < 0) break;
    const L = lv[best];
    const dT = 2 * 4 ** (L + 1) - 2 * 4 ** L;
    if (tris + dT > budget) {
      // try the next-best affordable block
      let alt = -1; let altG = 0;
      for (let b = 0; b < nBlk; b += 1) {
        const Lb = lv[b]; if (Lb >= LMAX) continue;
        const d2 = 2 * 4 ** (Lb + 1) - 2 * 4 ** Lb;
        if (tris + d2 > budget) continue;
        const g = gain(b); if (g > altG) { altG = g; alt = b; }
      }
      if (alt < 0) break;
      lv[alt] += 1; tris += 2 * 4 ** lv[alt] - 2 * 4 ** (lv[alt] - 1);
      continue;
    }
    lv[best] += 1; tris += dT;
  }
  let over = 0; let ar = 0;
  for (let b = 0; b < nBlk; b += 1) { over += overAtLvl[lv[b]][b]; ar += areaAtLvl[lv[b]][b]; }
  const share = (over / ar) * 100;
  log(`   budget ${budget.toLocaleString()} tris (the shipping-mesh sector count).  spent ${tris.toLocaleString()}.`);
  log(`   LOCAL-SIZED arm  >${BAR} AREA ${share.toFixed(4)}%   vs   shipping mesh ${BASE_OVER45.toFixed(4)}%   =>  ${(share / BASE_OVER45).toFixed(4)}x base`);
  log(`   (S115's SEPARABLE arms at the same budget: UNIFORM 8.2956% = 2.0938x base, GRADED 5.0556% = 1.2760x base)`);
  log(`   S115's pre-registered KILL LINE was: structured > 1.60% of MESH area at matched count.`);
  const meshEquiv = share;
  log(`   => this arm reads ${meshEquiv.toFixed(4)}% — ${meshEquiv > 1.6 ? 'STILL ABOVE the 1.60% kill line' : '*** BELOW the 1.60% kill line ***'}`);
  OUT.matched = { budget, spent: tris, over45: share, ratioToBase: share / BASE_OVER45 };
}
log('');
log('  HARMS OF THIS PROBE, stated up front:');
log('   1. The leaf-cost model IGNORES conforming (green/red) closure between blocks at different levels.');
log('      A real conforming quadtree costs more — literature factor <= ~2x. So the cost is OPTIMISTIC.');
log('   2. Each block is scored with SAME-LEVEL neighbours; a real quadtree has a coarse neighbour across');
log('      a level jump and would show a LARGER dihedral there. Also optimistic.');
log('   3. Blocks are AXIS-ALIGNED in (theta,z), so this is still not a feature-ALIGNED generator. It is');
log('      strictly between S115\'s separable arm and a true anisotropic/aligned mesher.');
log('   4. This probe scores ONLY the analytic surface. It says nothing about the shipping mesh\'s FOLD band.');
log('');
writeFileSync(`${OUTDIR}/REVQC_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/REVQC_${TAG}.json   done ${el()}`);
