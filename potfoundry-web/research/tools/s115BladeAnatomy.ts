// s115BladeAnatomy.ts — S115: WHAT IS A BLADE, TOPOLOGICALLY? (the operator-choice probe)
//
// char:mechanism named P2a-BLADE as the dominant mechanism of CelticTriquetra's reducible defect:
// 67.669% of the >45 deg class AREA, 75.834% of the REDUCIBLE area, dihedral p50 179.93 deg,
// blade-pair centroid-separation / pair-diameter 0.0699 — "two facets occupying the SAME PLACE
// facing OPPOSITE ways".
//
// THAT NAMES A SYMPTOM, NOT A REPAIR. A 180 deg dihedral across edge (u,v) with apexes p and q means
// the two triangles are coplanar AND their apexes are on the SAME SIDE of line uv: the sheet folds flat
// back onto itself. Which repair is correct depends on facts this tool measures and NOTHING else:
//
//   Q1  Is the shared edge the LONGEST edge of the pair (=> a 2-2 FLIP is the textbook repair) or the
//       SHORTEST (=> a COLLAPSE is)?
//   Q2  Are p and q nearly COINCIDENT (=> flip makes a needle; collapse p,q is the repair) or far apart?
//   Q3  Is the fold visible in the (r*theta, z) PARAMETER projection as an area-sign flip (=> the
//       parameterisation itself is folded; no purely-3D operator is well-posed) or is the pair a
//       consistent graph patch whose 3D plane is merely ill-conditioned?
//   Q4  Do blade edges come ISOLATED, in PAIRS, or in long CHAINS/STRIPS (=> a per-edge operator cannot
//       reach a strip; the strip needs a re-triangulation of its whole footprint)?
//   Q5  Are the four vertices ON the analytic surface (PRECOND says yes on a stride sample; here it is
//       measured EXHAUSTIVELY on the blade vertices, which is the population that matters)?
//   Q6  Would a FLIP be LEGAL (no duplicate edge p-q, no non-manifold result, children of positive area)
//       and would the CHILDREN be better — min angle, aspect, param-area sign, and the residual dihedral?
//
// It is a CENSUS + a SIMULATION. Nothing is written; no mesh is modified.
//
// SCARS. This probe is ANALYTIC-FREE for every structural quantity (Q1-Q4, Q6), so scars 1/2/3 (inset, k,
// h) cannot touch them. rA is used ONLY for Q5 (a position statement, h-free, k-free, inset-free) and for
// the param projection, which is exact. The one measurement CHOICE is BLADE_BAR, and it is SWEPT.
//
// Usage: bash research/tools/run-s115-anat.sh   (env PF_S115_STL absolute, PF_S115_STYLE, PF_S115_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, dflt: number): number => (process.env[n] === undefined ? dflt : Number(process.env[n]));
const envI = (n: string, dflt: number): number => Math.round(envF(n, dflt));

const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const TAG = process.env.PF_S115_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115anat';
const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const BLADE_BAR = envF('PF_S115_BLADE', 175);
const HI_DEG = envF('PF_S115_HI_DEG', 45);
const DETAIL_N = envI('PF_S115_DETAIL', 40000);

if (STL.length === 0) { log('*** PF_S115_STL is required (ABSOLUTE path). ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');
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

const OUT: Record<string, unknown> = { style: STYLE, tag: TAG, stl: STL, dims: DIMS, bladeBar: BLADE_BAR };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 — BLADE ANATOMY: WHAT REPAIR DOES THE MECHANISM ACTUALLY NAME? — ${STYLE} (${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`blade bar ${BLADE_BAR} deg   class bar ${HI_DEG} deg`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets ${el()}`);

// ── WELD (exact f32 equality, the same rule dihedralRuler uses) ────────────────────────────────────────
const nCorner = nTri * 3;
const vid = new Int32Array(nCorner);
let nV = 0;
const VX: number[] = []; const VY: number[] = []; const VZ: number[] = [];
{
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  for (let c = 0; c < nCorner; c += 1) {
    const x = xyz[c * 3]; const y = xyz[c * 3 + 1]; const z = xyz[c * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35); h |= 0;
    const b = buckets.get(h);
    let found = -1;
    if (b !== undefined) for (const cc of b) if (VX[cc] === x && VY[cc] === y && VZ[cc] === z) { found = cc; break; }
    if (found < 0) {
      found = nV; nV += 1; VX.push(x); VY.push(y); VZ.push(z);
      if (b === undefined) buckets.set(h, [found]); else b.push(found);
    }
    vid[c] = found;
  }
}
log(`welded ${nCorner} corners -> ${nV} vertices ${el()}`);

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0; for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
const hiThr = (HI_DEG * Math.PI) / 180;
let clsN = 0; let clsArea = 0;
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { clsN += 1; clsArea += d.areaMm2[f]; }
log(`mesh AREA ${meshArea.toFixed(3)} mm2  >${HI_DEG} class COUNT ${clsN} AREA ${clsArea.toFixed(3)} mm2 (${pct(clsArea, meshArea)}%)  ${el()}`);
log(`edges interior ${d.interiorEdges} boundary ${d.boundaryEdges} non-manifold ${d.nonManifoldEdges} inconsistent ${d.inconsistentEdges}`);

// ── EDGE TABLE with the VERTEX PAIR (dihedralRuler gives facets only) ─────────────────────────────────
const SHIFT = 67_108_864;
type ERec = { u: number; v: number; f1: number; f2: number };
const edgeMap = new Map<number, ERec>();
const edgeCount = new Map<number, number>();
for (let f = 0; f < nTri; f += 1) {
  const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
  for (const [p, r] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
    const lo = Math.min(p, r); const hi = Math.max(p, r); const k = lo * SHIFT + hi;
    edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    const e = edgeMap.get(k);
    if (e === undefined) edgeMap.set(k, { u: lo, v: hi, f1: f, f2: -1 });
    else if (e.f2 < 0) e.f2 = f;
  }
}
// CONTROL A0 — my edge table must agree with dihedralRuler's counts exactly.
{
  let intr = 0; let bnd = 0; let nm = 0;
  for (const c of edgeCount.values()) { if (c === 2) intr += 1; else if (c === 1) bnd += 1; else nm += 1; }
  const ok = intr === d.interiorEdges && bnd === d.boundaryEdges && nm === d.nonManifoldEdges;
  log(`── CONTROL A0: my edge table vs dihedralRuler — interior ${intr}/${d.interiorEdges} boundary ${bnd}/${d.boundaryEdges} nm ${nm}/${d.nonManifoldEdges}  ${ok ? 'OK' : '*** A0 FIRED ***'}`);
  OUT.a0 = { intr, bnd, nm, ok };
  if (!ok) { log('*** RUN VOID: edge topology disagrees with the scoring ruler. ***'); }
}

// per-facet unit normal (winding)
const FNX = new Float64Array(nTri); const FNY = new Float64Array(nTri); const FNZ = new Float64Array(nTri);
for (let f = 0; f < nTri; f += 1) {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; }
  FNX[f] = nx; FNY[f] = ny; FNZ[f] = nz;
}
const VXa = Float64Array.from(VX); const VYa = Float64Array.from(VY); const VZa = Float64Array.from(VZ);
const P = (i: number, k: number): number => (k === 0 ? VXa[i] : k === 1 ? VYa[i] : VZa[i]);
const dist = (i: number, j: number): number => Math.hypot(VXa[i] - VXa[j], VYa[i] - VYa[j], VZa[i] - VZa[j]);

// ── STAGE 1: THE BLADE-BAR LADDER, AND EDGE-LEVEL VS FACET-LEVEL ACCOUNTING ───────────────────────────
log('');
log('── STAGE 1: BLADE EDGES vs BLADE FACETS at each bar (per-EDGE and per-FACET, never mixed) ──');
log('   bar deg    blade EDGES   blade FACETS  facet% of mesh   AREA mm2   AREA% mesh   AREA% of >45 class');
const ladder: Array<Record<string, number>> = [];
for (const bar of [150, 165, 170, 175, 178, 179, 179.9]) {
  const th = (bar * Math.PI) / 180;
  let nE = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] >= th) nE += 1;
  const mark = new Uint8Array(nTri);
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] >= th) { mark[d.edgeF1[e]] = 1; mark[d.edgeF2[e]] = 1; }
  let nF = 0; let a = 0; let ca = 0;
  for (let f = 0; f < nTri; f += 1) if (mark[f] === 1) { nF += 1; a += d.areaMm2[f]; if (d.perFacetMaxRad[f] > hiThr) ca += d.areaMm2[f]; }
  log(`   >=${String(bar).padStart(6)}  ${String(nE).padStart(12)}  ${String(nF).padStart(13)}  ${pct(nF, nTri).padStart(13)}%  ${a.toFixed(3).padStart(10)}  ${pct(a, meshArea).padStart(10)}%  ${pct(ca, clsArea).padStart(18)}%`);
  ladder.push({ bar, edges: nE, facets: nF, areaMm2: a, areaPctMesh: (a / meshArea) * 100, areaPctClass: (ca / clsArea) * 100 });
}
OUT.ladder = ladder;

// the reference blade edge set
const bth = (BLADE_BAR * Math.PI) / 180;
const bladeEdges: number[] = [];
for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] >= bth) bladeEdges.push(e);
log('');
log(`   REFERENCE SET at ${BLADE_BAR} deg: ${bladeEdges.length} blade edges`);

// map dihedralRuler edge slot -> my (u,v). dihedralRuler iterated its own Map; I re-derive from facets.
const oppVert = (f: number, u: number, v: number): number => {
  const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
  if (a !== u && a !== v) return a; if (b !== u && b !== v) return b; return c;
};
const sharedUV = (f1: number, f2: number): [number, number] => {
  const s1 = [vid[f1 * 3], vid[f1 * 3 + 1], vid[f1 * 3 + 2]];
  const s2 = [vid[f2 * 3], vid[f2 * 3 + 1], vid[f2 * 3 + 2]];
  const sh = s1.filter((x) => s2.includes(x));
  return [sh[0], sh[1]];
};

// ── STAGE 2: BLADE STRIP STRUCTURE (Q4) — isolated, paired, or chained? ───────────────────────────────
log('');
log('── STAGE 2 / Q4: ARE BLADE EDGES ISOLATED, OR DO THEY FORM STRIPS? ──');
{
  const bpf = new Uint8Array(nTri);                 // blade edges incident on each facet
  for (const e of bladeEdges) { bpf[d.edgeF1[e]] += 1; bpf[d.edgeF2[e]] += 1; }
  const hist = [0, 0, 0, 0];
  let nBF = 0; const areaBy = [0, 0, 0, 0];
  for (let f = 0; f < nTri; f += 1) if (bpf[f] > 0) { nBF += 1; hist[Math.min(3, bpf[f])] += 1; areaBy[Math.min(3, bpf[f])] += d.areaMm2[f]; }
  const totA = areaBy.reduce((a, b) => a + b, 0);
  log(`   blade FACETS ${nBF}   AREA ${totA.toFixed(3)} mm2`);
  for (let i = 1; i <= 3; i += 1) log(`     facets carrying ${i}${i === 3 ? '' : ' '} blade edge(s): ${String(hist[i]).padStart(8)} (${pct(hist[i], nBF)}% of blade facets)   AREA ${pct(areaBy[i], totA)}%`);
  log('     READ: 1 => isolated flap (a per-edge operator reaches it). 2-3 => the facet is INSIDE a strip;');
  log('     a per-edge flip/collapse changes its neighbours mid-pass and the pass is order-dependent.');
  OUT.strip = { bladeFacets: nBF, hist, areaBy };

  // connected components over blade facets (adjacency through ANY shared edge)
  const comp = new Int32Array(nTri).fill(-1);
  const adjHead = new Int32Array(nTri).fill(-1); const adjNext = new Int32Array(d.edgeF1.length * 2).fill(-1);
  const adjTo = new Int32Array(d.edgeF1.length * 2);
  let ap = 0;
  for (let e = 0; e < d.edgeF1.length; e += 1) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (bpf[f1] === 0 || bpf[f2] === 0) continue;
    adjTo[ap] = f2; adjNext[ap] = adjHead[f1]; adjHead[f1] = ap; ap += 1;
    adjTo[ap] = f1; adjNext[ap] = adjHead[f2]; adjHead[f2] = ap; ap += 1;
  }
  let nc = 0; const sizes: number[] = []; const compArea: number[] = [];
  const stack: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    if (bpf[f] === 0 || comp[f] >= 0) continue;
    const c = nc; nc += 1; let sz = 0; let ar = 0;
    stack.length = 0; stack.push(f); comp[f] = c;
    while (stack.length > 0) {
      const g = stack.pop() as number; sz += 1; ar += d.areaMm2[g];
      for (let p = adjHead[g]; p >= 0; p = adjNext[p]) { const h = adjTo[p]; if (comp[h] < 0) { comp[h] = c; stack.push(h); } }
    }
    sizes.push(sz); compArea.push(ar);
  }
  sizes.sort((a, b) => b - a);
  log(`   CONNECTED BLADE COMPONENTS: ${nc}   sizes p50 ${q(sizes, 0.5)} p90 ${q(sizes, 0.9)} MAX ${sizes[0]}   mean ${(nBF / Math.max(1, nc)).toFixed(2)} facets`);
  log(`   components of size 2 (a clean isolated flap): ${sizes.filter((s) => s === 2).length} (${pct(sizes.filter((s) => s === 2).length, nc)}% of components)`);
  OUT.components = { n: nc, p50: q(sizes, 0.5), p90: q(sizes, 0.9), max: sizes[0], size2: sizes.filter((s) => s === 2).length };
}

// ── STAGE 3: PER-PAIR ANATOMY (Q1,Q2,Q3,Q5,Q6) on a stride sample of blade edges ─────────────────────
log('');
log(`── STAGE 3: PER-PAIR ANATOMY on ${Math.min(DETAIL_N, bladeEdges.length)} blade edges (stride) ──`);
type Anat = {
  e: number; f1: number; f2: number; u: number; v: number; p: number; qv: number;
  luv: number; lpq: number; diam: number; shortest: number;
  uvRankF1: number;         // 0 = shared edge is the LONGEST of f1, 2 = shortest
  minAngF1: number; minAngF2: number; maxAngF1: number; maxAngF2: number;
  paSign1: number; paSign2: number; paAbs1: number; paAbs2: number;
  pqExists: boolean; flipLegal: boolean;
  chMinAng: number; chMinAlt: number; chAsp: number; chDihNew: number;
  drMaxUm: number;          // max |r_vertex - rA| over the 4 vertices, um
  areaPair: number;
  rSpread: number;
  colDrUm: number;          // position cost of collapsing the shortest edge to its midpoint's projection
};
const anats: Anat[] = [];
{
  const stride = Math.max(1, Math.floor(bladeEdges.length / DETAIL_N));
  const angs = (i: number, j: number, k: number): [number, number] => {
    const a = dist(j, k); const b = dist(i, k); const c = dist(i, j);
    const ang = (x: number, y: number, z: number): number => {
      const cs = (y * y + z * z - x * x) / (2 * y * z);
      return Math.acos(Math.max(-1, Math.min(1, cs))) * DEG;
    };
    const A = ang(a, b, c); const B = ang(b, a, c); const C = ang(c, a, b);
    return [Math.min(A, B, C), Math.max(A, B, C)];
  };
  const triArea3 = (i: number, j: number, k: number): number => {
    const ux = VXa[j] - VXa[i]; const uy = VYa[j] - VYa[i]; const uz = VZa[j] - VZa[i];
    const wx = VXa[k] - VXa[i]; const wy = VYa[k] - VYa[i]; const wz = VZa[k] - VZa[i];
    return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  };
  const paramSigned = (i: number, j: number, k: number, rRef: number): number => {
    const ti = Math.atan2(VYa[i], VXa[i]);
    const tj = ti + dThRaw(ti, Math.atan2(VYa[j], VXa[j]));
    const tk = ti + dThRaw(ti, Math.atan2(VYa[k], VXa[k]));
    return 0.5 * ((rRef * (tj - ti)) * (VZa[k] - VZa[i]) - (VZa[j] - VZa[i]) * (rRef * (tk - ti)));
  };
  const drUm = (i: number): number => {
    const r = Math.hypot(VXa[i], VYa[i]);
    return Math.abs(r - rA(Math.atan2(VYa[i], VXa[i]), VZa[i])) * 1000;
  };
  for (let s = 0; s < bladeEdges.length; s += stride) {
    const e = bladeEdges[s];
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const [u, v] = sharedUV(f1, f2);
    if (u === undefined || v === undefined) continue;
    const p = oppVert(f1, u, v); const qv = oppVert(f2, u, v);
    const luv = dist(u, v); const lpq = dist(p, qv);
    const e1 = [dist(u, v), dist(v, p), dist(p, u)].sort((a, b) => b - a);
    const rank = e1.indexOf(luv);
    const diam = Math.max(e1[0], dist(u, qv), dist(v, qv));
    const shortest = Math.min(luv, dist(v, p), dist(p, u), dist(u, qv), dist(v, qv));
    const [mi1, ma1] = angs(u, v, p); const [mi2, ma2] = angs(u, v, qv);
    const rRef = (Math.hypot(VXa[u], VYa[u]) + Math.hypot(VXa[v], VYa[v]) + Math.hypot(VXa[p], VYa[p])) / 3;
    const pa1 = paramSigned(u, v, p, rRef); const pa2 = paramSigned(u, v, qv, rRef);
    const kpq = Math.min(p, qv) * SHIFT + Math.max(p, qv);
    const pqExists = edgeMap.has(kpq);
    // FLIP simulation: children (u,p,q) and (v,q,p) — winding taken from f1's orientation of (u,v)
    const cA = triArea3(u, p, qv); const cB = triArea3(v, qv, p);
    const flipLegal = !pqExists && cA > 0 && cB > 0;
    const [cmiA] = angs(u, p, qv); const [cmiB] = angs(v, qv, p);
    const longA = Math.max(dist(u, p), dist(p, qv), dist(qv, u));
    const longB = Math.max(dist(v, qv), dist(qv, p), dist(p, v));
    const altA = longA > 0 ? (2 * cA) / longA : 0; const altB = longB > 0 ? (2 * cB) / longB : 0;
    // new dihedral BETWEEN THE TWO CHILDREN across the new edge (p,q)
    const nrm = (i: number, j: number, k: number): [number, number, number] => {
      const ux = VXa[j] - VXa[i]; const uy = VYa[j] - VYa[i]; const uz = VZa[j] - VZa[i];
      const wx = VXa[k] - VXa[i]; const wy = VYa[k] - VYa[i]; const wz = VZa[k] - VZa[i];
      let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; }
      return [nx, ny, nz];
    };
    const n1 = nrm(u, p, qv); const n2 = nrm(v, qv, p);
    const dot = Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]));
    const rs = [u, v, p, qv].map((i) => Math.hypot(VXa[i], VYa[i]));
    anats.push({
      e, f1, f2, u, v, p, qv, luv, lpq, diam, shortest, uvRankF1: rank,
      minAngF1: mi1, minAngF2: mi2, maxAngF1: ma1, maxAngF2: ma2,
      paSign1: Math.sign(pa1), paSign2: Math.sign(pa2), paAbs1: Math.abs(pa1), paAbs2: Math.abs(pa2),
      pqExists, flipLegal,
      chMinAng: Math.min(cmiA, cmiB), chMinAlt: Math.min(altA, altB),
      chAsp: Math.max(altA > 0 ? longA / altA : Infinity, altB > 0 ? longB / altB : Infinity),
      chDihNew: Math.acos(dot) * DEG,
      drMaxUm: Math.max(drUm(u), drUm(v), drUm(p), drUm(qv)),
      areaPair: d.areaMm2[f1] + d.areaMm2[f2],
      rSpread: Math.max(...rs) - Math.min(...rs),
      colDrUm: 0,
    });
  }
}
log(`   sampled ${anats.length} pairs ${el()}`);

const col = (g: (a: Anat) => number): number[] => anats.map(g);
log('');
log('  Q1  IS THE SHARED EDGE THE LONGEST EDGE OF THE PAIR?');
{
  const r0 = anats.filter((a) => a.uvRankF1 === 0).length;
  const r1 = anats.filter((a) => a.uvRankF1 === 1).length;
  const r2 = anats.filter((a) => a.uvRankF1 === 2).length;
  log(`      shared edge is the LONGEST of f1: ${pct(r0, anats.length)}%   MIDDLE ${pct(r1, anats.length)}%   SHORTEST ${pct(r2, anats.length)}%`);
  log(`      |uv| p10 ${ex(q(col((a) => a.luv), 0.1))} p50 ${ex(q(col((a) => a.luv), 0.5))} p90 ${ex(q(col((a) => a.luv), 0.9))} mm`);
  log(`      pair diameter p50 ${ex(q(col((a) => a.diam), 0.5))} mm   shortest edge in the pair p50 ${ex(q(col((a) => a.shortest), 0.5))} mm`);
  log('      READ: a 2-2 FLIP is the textbook repair only when the shared edge is the LONGEST — otherwise');
  log('      the flip lengthens the mesh\'s longest edge and the children inherit the degeneracy.');
  OUT.q1 = { longest: r0 / anats.length, middle: r1 / anats.length, shortest: r2 / anats.length,
    luvP50: q(col((a) => a.luv), 0.5), diamP50: q(col((a) => a.diam), 0.5), shortP50: q(col((a) => a.shortest), 0.5) };
}
log('');
log('  Q2  ARE THE TWO APEXES p,q COINCIDENT?  (if yes, a flip manufactures a needle on p-q)');
{
  const rel = anats.map((a) => a.lpq / Math.max(1e-12, a.diam));
  log(`      |pq| p10 ${ex(q(col((a) => a.lpq), 0.1))} p50 ${ex(q(col((a) => a.lpq), 0.5))} p90 ${ex(q(col((a) => a.lpq), 0.9))} mm`);
  log(`      |pq| / pair diameter  p10 ${q(rel, 0.1).toFixed(4)}  p50 ${q(rel, 0.5).toFixed(4)}  p90 ${q(rel, 0.9).toFixed(4)}`);
  log(`      pairs with |pq|/diam < 0.05: ${pct(rel.filter((x) => x < 0.05).length, rel.length)}%   < 0.2: ${pct(rel.filter((x) => x < 0.2).length, rel.length)}%`);
  OUT.q2 = { lpqP50: q(col((a) => a.lpq), 0.5), relP50: q(rel, 0.5), relP10: q(rel, 0.1), relP90: q(rel, 0.9) };
}
log('');
log('  Q3  IS THE (r*theta, z) PARAMETER PROJECTION FOLDED ACROSS THE PAIR?');
{
  const opp = anats.filter((a) => a.paSign1 * a.paSign2 < 0).length;   // consistent graph => OPPOSITE signs
  const same = anats.filter((a) => a.paSign1 * a.paSign2 > 0).length;  // FOLDED
  log(`      signed param areas of (u,v,p) and (u,v,q): OPPOSITE sign ${pct(opp, anats.length)}%  (a consistent graph patch)`);
  log(`                                                 SAME     sign ${pct(same, anats.length)}%  (*** THE PARAMETER SHEET IS FOLDED ***)`);
  log(`      |param area| f1 p50 ${ex(q(col((a) => a.paAbs1), 0.5))}  f2 p50 ${ex(q(col((a) => a.paAbs2), 0.5))} mm2`);
  log(`      3D area of the pair p50 ${ex(q(col((a) => a.areaPair), 0.5))} mm2`);
  log(`      radial spread over the 4 vertices p50 ${ex(q(col((a) => a.rSpread), 0.5))} mm`);
  OUT.q3 = { oppositeFrac: opp / anats.length, sameFrac: same / anats.length };
}
log('');
log('  Q5  ARE THE BLADE VERTICES ON THE ANALYTIC SURFACE?  (exhaustive over the sampled pairs)');
{
  const dr = col((a) => a.drMaxUm);
  log(`      max |r_vertex - rA| per pair: p50 ${ex(q(dr, 0.5))} p90 ${ex(q(dr, 0.9))} p99 ${ex(q(dr, 0.99))} MAX ${ex(q(dr, 1))} um   (export bar 10 um)`);
  log(`      pairs with any vertex over 10 um off the surface: ${pct(dr.filter((x) => x > 10).length, dr.length)}%`);
  log('      READ: if the vertices are ON the surface, the fold is a CONNECTIVITY defect, not a position');
  log('      defect, and any operator that only MOVES vertices is attacking the wrong thing.');
  OUT.q5 = { p50: q(dr, 0.5), p90: q(dr, 0.9), max: q(dr, 1), over10Frac: dr.filter((x) => x > 10).length / dr.length };
}
log('');
log('  Q6  WOULD A 2-2 FLIP BE LEGAL, AND WOULD THE CHILDREN BE BETTER?');
{
  const legal = anats.filter((a) => a.flipLegal).length;
  const dup = anats.filter((a) => a.pqExists).length;
  log(`      flip LEGAL (no pre-existing p-q edge, both children of positive area): ${pct(legal, anats.length)}%`);
  log(`      blocked by an EXISTING p-q edge (a flip would make it non-manifold): ${pct(dup, anats.length)}%`);
  const lg = anats.filter((a) => a.flipLegal);
  const parMin = lg.map((a) => Math.min(a.minAngF1, a.minAngF2));
  log(`      PARENT min angle  p10 ${f2(q(parMin, 0.1))} p50 ${f2(q(parMin, 0.5))} deg`);
  log(`      CHILD  min angle  p10 ${f2(q(lg.map((a) => a.chMinAng), 0.1))} p50 ${f2(q(lg.map((a) => a.chMinAng), 0.5))} deg`);
  log(`      CHILD  aspect     p50 ${ex(q(lg.map((a) => a.chAsp), 0.5))} p90 ${ex(q(lg.map((a) => a.chAsp), 0.9))}`);
  log(`      CHILD-PAIR dihedral across the NEW edge p-q: p50 ${f2(q(lg.map((a) => a.chDihNew), 0.5))} p90 ${f2(q(lg.map((a) => a.chDihNew), 0.9))} MAX ${f2(q(lg.map((a) => a.chDihNew), 1))} deg`);
  const better = lg.filter((a) => a.chDihNew < BLADE_BAR).length;
  log(`      *** flips whose CHILD PAIR is no longer a blade (< ${BLADE_BAR} deg): ${pct(better, lg.length)}% of legal flips ***`);
  const winA = lg.filter((a) => a.chMinAng > Math.min(a.minAngF1, a.minAngF2)).length;
  log(`      flips that IMPROVE the min angle: ${pct(winA, lg.length)}%`);
  OUT.q6 = { legalFrac: legal / anats.length, dupFrac: dup / anats.length,
    parentMinAngP50: q(parMin, 0.5), childMinAngP50: q(lg.map((a) => a.chMinAng), 0.5),
    childDihP50: q(lg.map((a) => a.chDihNew), 0.5), noLongerBladeFrac: better / Math.max(1, lg.length),
    improveAngleFrac: winA / Math.max(1, lg.length) };
}
log('');
log('  Q7  WHERE ARE THE BLADES?  (z / r / theta of the blade facets)');
{
  const zs: number[] = []; const rs: number[] = [];
  for (const a of anats) { zs.push((VZa[a.u] + VZa[a.v]) / 2); rs.push(Math.hypot(VXa[a.u], VYa[a.u])); }
  log(`      z  p10 ${f2(q(zs, 0.1))} p50 ${f2(q(zs, 0.5))} p90 ${f2(q(zs, 0.9))} mm   (pot H=${H})`);
  log(`      r  p10 ${f2(q(rs, 0.1))} p50 ${f2(q(rs, 0.5))} p90 ${f2(q(rs, 0.9))} mm`);
  OUT.q7 = { zP50: q(zs, 0.5), rP50: q(rs, 0.5) };
}

log('');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('ANATOMY SUMMARY — the operator this names:');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
writeFileSync(`${OUTDIR}/S115ANAT_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115ANAT_${TAG}.json  done ${el()}`);
void P; void FNX; void FNY; void FNZ; void HI_DEG;
