// s118GradPeak.ts — S118 DRIVE: how big is max|grad r| REALLY, and therefore where is the fold ceiling?
//
// The campaign's fold test is `dihedral > CEIL = 2*atan(max|grad r|)`: a radial-graph surface cannot bend
// two of its normals further apart than that, so anything above CEIL was made by the MESH. The whole test
// therefore rests on max|grad r|, and every tool in the campaign estimates it by sampling a FIXED GRID
// (1200 x 1200). A grid maximum is a LOWER BOUND on a true maximum. If the true peak sits between grid
// lines the ceiling is quoted too LOW and honest crest facets are convicted of being folds.
//
// That is not hypothetical: the S118 rung-1 mesh scores 32 facets above the 1200^2 ceiling of 168.024 deg
// with a max of 168.534 deg — which is exactly what a 3% underestimate of the gradient peak looks like.
// This tool decides it, by taking the grid maximum and then REFINING it with a local pattern search that
// converges on the true peak, and by reporting the ladder so the convergence is visible rather than
// asserted.
//
// Usage: bash research/tools/run-s118-gradpeak.sh
//   env PF_S118G_STYLE PF_S118G_H PF_S118G_RB PF_S118G_RT PF_S118G_GRID PF_S118G_TOPK PF_S118G_HFD
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const STYLE = envS('PF_S118G_STYLE', 'GothicArches');
const DIMS: StyleDims = { H: envF('PF_S118G_H', 120), Rb: envF('PF_S118G_RB', 40), Rt: envF('PF_S118G_RT', 50), expn: 1 };
const H = DIMS.H;
const GRID = envI('PF_S118G_GRID', 1200);
const TOPK = envI('PF_S118G_TOPK', 4000);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

/** |grad r| in the ARC metric at (th, z), central differences with step hArc mm (and hZ = hArc in z). */
function gradAt(th: number, z: number, hArc: number): number {
  const r0 = rA(th, z);
  const hTh = hArc / Math.max(1e-9, r0);
  const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hArc);
  const zl = Math.max(0, z - hArc); const zh = Math.min(H, z + hArc);
  const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
  return Math.hypot(rt, rz);
}

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 GRADIENT PEAK — ${STYLE}  (is the fold CEILING quoted too low?) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log('');

// ── STEP 1: the grid maximum, exactly as every other tool computes it, h SWEPT (scar 3) ─────────────
log('── STEP 1: GRID MAXIMUM (what the campaign quotes), h swept ──');
interface Cand { th: number; z: number; g: number }
let cands: Cand[] = [];
for (const hfd of [2e-6, 2e-5, 2e-4]) {
  let best = 0; let bth = 0; let bz = 0;
  const local: Cand[] = [];
  for (let i = 0; i < GRID; i += 1) {
    const th = (i / GRID) * 2 * Math.PI;
    for (let j = 0; j <= GRID; j += 1) {
      const z = (j / GRID) * H;
      const g = gradAt(th, z, hfd);
      if (g > best) { best = g; bth = th; bz = z; }
      if (hfd === 2e-6) local.push({ th, z, g });
    }
  }
  if (hfd === 2e-6) {
    local.sort((a, b) => b.g - a.g);
    cands = local.slice(0, TOPK);
  }
  log(`   h=${hfd.toExponential(3)}  ${GRID}^2  max|grad r| ${best.toFixed(6)}  CEIL ${(2 * Math.atan(best) * DEG).toFixed(4)} deg  at th=${bth.toFixed(6)} z=${bz.toFixed(6)} ${el()}`);
}
log('');

// ── STEP 2: REFINE. A grid max is a LOWER bound on a true max; refine the top cells with a shrinking
// pattern search until the answer stops moving. The ladder is printed so convergence is visible. ─────
log(`── STEP 2: LOCAL PATTERN-SEARCH REFINEMENT from the top ${TOPK} grid cells ──`);
const dTh = (2 * Math.PI) / GRID; const dZ = H / GRID;
let gBest = 0; let pth = 0; let pz = 0;
const HFD = envF('PF_S118G_HFD', 2e-6);
for (const c of cands) {
  let cth = c.th; let cz = c.z; let cg = gradAt(cth, cz, HFD);
  let sTh = dTh; let sZ = dZ;
  for (let round = 0; round < 40; round += 1) {
    let moved = false;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nth = cth + a * sTh; const nz = cz + b * sZ;
      if (nz < 0 || nz > H) continue;
      const g = gradAt(nth, nz, HFD);
      if (g > cg) { cg = g; cth = nth; cz = nz; moved = true; }
    }
    if (!moved) { sTh *= 0.5; sZ *= 0.5; if (sTh < 1e-12) break; }
  }
  if (cg > gBest) { gBest = cg; pth = cth; pz = cz; }
}
log(`   refined max|grad r| ${gBest.toFixed(6)}  at th=${pth.toFixed(9)} z=${pz.toFixed(9)}  *** CEIL ${(2 * Math.atan(gBest) * DEG).toFixed(4)} deg *** ${el()}`);
log('');

// ── STEP 3: the h ladder AT THE PEAK. A true kink has |grad| that GROWS without bound as h -> 0; a
// smooth peak converges. Which one it is decides whether a ceiling exists at all. ───────────────────
log('── STEP 3: h LADDER AT THE REFINED PEAK (scar 3, where it actually matters) ──');
for (const hfd of [1e-3, 2e-4, 2e-5, 2e-6, 2e-7, 2e-8]) {
  const g = gradAt(pth, pz, hfd);
  log(`   h=${hfd.toExponential(3)}  |grad r| ${g.toFixed(6)}  CEIL ${(2 * Math.atan(g) * DEG).toFixed(4)} deg`);
}
log('');
log(`WALL ${((Date.now() - T0) / 1000).toFixed(1)} s`);
log('S118 GRADPEAK DONE');
