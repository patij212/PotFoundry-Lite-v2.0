// s113opFlip.ts — OPERATOR 1: THE EDGE FLIP, priced OFFLINE on the pinned S113 straddle set.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HYPOTHESIS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The 3,282 pinned pairs are crease-STRADDLING: the surface turns INSIDE the facet, so refinement is
// provably useless (fixture H2: the angle is invariant x0.9968 under five halvings while a smooth control
// decays x28.43). The only remedy is a mesh edge ON the crease. A flip re-cuts the quad's diagonal at
// ZERO triangle cost — if the shared edge currently runs ACROSS the crease, the OTHER diagonal might run
// ALONG it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED KILL LINE — printed BEFORE any result, and not negotiable afterwards
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   PRIMARY:  the target set's over-45deg AREA must fall by >= 2.0x.
//   FLOOR-1:  triangle count identical (a flip adds zero; if it does not, the run is void).
//   FLOOR-2:  WHOLE-MESH over-45deg AREA must NOT increase. (S100's scar: the defect RELOCATED 181x into
//             an unread bucket and the scoped number "improved". A one-sided target-set bar is vacuous.)
//   FLOOR-3:  no facet's normDeg(inset 0.05) may increase by more than 5.0 deg.
//   PRIMARY < 2.0x, or any FLOOR violated  =>  the flip is REFUTED for this class.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TWO ARMS, BECAUSE ONE ARM WOULD BE A STRAWMAN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   ARM A  UNCONDITIONAL — flip every LEGAL candidate. Measures the operator's raw REACH: how often the
//          other diagonal is the crease-aligned one.
//   ARM B  GUARDED — additionally require landFlipPass's C1 clause, max normDeg over the pair STRICTLY
//          decreases. This is the operator's BEST CASE: it can only ever accept flips that help the pair.
//          If arm B still misses the kill line, no accept rule rescues the operator.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MEASUREMENT DISCIPLINE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  * COUNT + AREA-share + MAX are reported together, never one alone (count over-states defect AREA by
//    13-184x in this project and the two routinely disagree in DIRECTION).
//  * The AFTER arm is a FULL GLOBAL RECOMPUTE — `facetDihedrals` over all 1.14 M facets of the modified
//    soup — not a local patch. A local recompute cannot see relocation.
//  * `inset` is passed EXPLICITLY and SWEPT (0 and 0.05). It is a measurement choice: normDeg moves 64x
//    across that range on this class, and the drop ratio normDeg(0.05)/normDeg(0) is precisely the
//    "is the edge ON the crease" signal — a CONFORMED edge reads a LOW drop.
//  * INSTRUMENT CONTROL: every probed facet that was NOT flipped must return a BYTE-IDENTICAL normDeg in
//    both arms. If any does not, the differencing machinery is broken and the run is VOID.
//  * INPUT CONTROL: the ndjson's own `tri1`/`tri2` coordinates are diffed against the STL bytes. A
//    mismatch means the pinned set was cut from a different mesh and the run is VOID.
//  * WELD CONTROL: my vertex/edge census must agree with `facetDihedrals`' independent one.
//
// REFUSALS ARE COUNTED BY REASON. An operator that silently skips is lying about its coverage.
//
// Usage: bash research/tools/run-s113-opflip.sh
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const SET = process.env.PF_S113_SET ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const TAG = process.env.PF_S113_TAG ?? 'GOTH';
const K = Math.round(envF('PF_S113_K', 8));
const INSET_LO = envF('PF_S113_INSET_LO', 0);
const INSET_HI = envF('PF_S113_INSET_HI', 0.05);
const HI_DEG = envF('PF_S113_HI_DEG', 45);
const AR_CAP = envF('PF_S113_AR_CAP', 50);
const KILL_X = envF('PF_S113_KILL_X', 2.0);
const WORSE_DEG = envF('PF_S113_WORSE_DEG', 5.0);
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

log('===== S113 OPERATOR 1 — EDGE FLIP of the shared edge, ZERO triangle cost =====');
log('');
log('── PRE-REGISTERED KILL LINE (stated BEFORE any result) ───────────────────────────────────────');
log(`  PRIMARY : target-set over-${HI_DEG}deg AREA must fall by >= ${KILL_X.toFixed(1)}x`);
log('  FLOOR-1 : triangle count identical (zero triangles added)');
log(`  FLOOR-2 : WHOLE-MESH over-${HI_DEG}deg AREA must NOT increase (relocation guard)`);
log(`  FLOOR-3 : no facet's normDeg(inset ${INSET_HI}) may increase by more than ${WORSE_DEG.toFixed(1)} deg`);
log(`  PRIMARY < ${KILL_X.toFixed(1)}x  OR any FLOOR violated  =>  REFUTED for this class.`);
log('  Two arms: A = every LEGAL flip; B = additionally guarded by C1 (pair max normDeg must decrease).');
log('─────────────────────────────────────────────────────────────────────────────────────────────');
log('');

// ── SURFACE ────────────────────────────────────────────────────────────────────────────────────────
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

// ── MESH ───────────────────────────────────────────────────────────────────────────────────────────
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
log(`mesh ${nTri} facets  ${el()}`);

// ── WELD (my own; cross-checked against facetDihedrals' independent edge census below) ─────────────
function weldSoup(xyz: Float64Array, n: number): { id: Int32Array; vx: Float64Array; vy: Float64Array; vz: Float64Array; nV: number } {
  const nVin = n * 3;
  const id = new Int32Array(nVin);
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
  let next = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket !== undefined) for (const cc of bucket) if (cx[cc] === x && cy[cc] === y && cz[cc] === z) { found = cc; break; }
    if (found < 0) {
      found = next; next += 1;
      cx.push(x); cy.push(y); cz.push(z);
      if (bucket === undefined) buckets.set(h, [found]); else bucket.push(found);
    }
    id[v] = found;
  }
  return { id, vx: Float64Array.from(cx), vy: Float64Array.from(cy), vz: Float64Array.from(cz), nV: next };
}
const W = weldSoup(xyz0, nTri);
log(`welded ${W.nV} unique vertices  ${el()}`);

const EKEY = 67_108_864; // 2^26, same packing as dihedralRuler
if (W.nV >= EKEY) { log('*** REFUSING: vertex count exceeds the 2^26 edge-key packing limit ***'); process.exit(4); }
const ekey = (a: number, b: number): number => (a < b ? a * EKEY + b : b * EKEY + a);
const baseEdges = new Set<number>();
for (let f = 0; f < nTri; f += 1) {
  const a = W.id[f * 3]; const b = W.id[f * 3 + 1]; const c = W.id[f * 3 + 2];
  baseEdges.add(ekey(a, b)); baseEdges.add(ekey(b, c)); baseEdges.add(ekey(c, a));
}
const VT = new Float64Array(W.nV);
for (let v = 0; v < W.nV; v += 1) VT[v] = Math.atan2(W.vy[v], W.vx[v]);

// ── BEFORE: whole-mesh dihedral census ─────────────────────────────────────────────────────────────
const idxIdentity = new Uint32Array(nTri * 3).map((_, i) => i);
const d0 = facetDihedrals(xyz0, idxIdentity);
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
log(`BEFORE census: area ${meshArea0.toFixed(3)} mm2  interior ${d0.interiorEdges}  boundary ${d0.boundaryEdges}  nonManifold ${d0.nonManifoldEdges}  inconsistent ${d0.inconsistentEdges}  ${el()}`);
log(`  WELD CONTROL: my unique vertices ${W.nV}, my undirected edges ${baseEdges.size}; ruler interior+boundary+nonManifold ${d0.interiorEdges + d0.boundaryEdges + d0.nonManifoldEdges}  ${baseEdges.size === d0.interiorEdges + d0.boundaryEdges + d0.nonManifoldEdges ? 'AGREE' : '*** DISAGREE — VOID ***'}`);
if (baseEdges.size !== d0.interiorEdges + d0.boundaryEdges + d0.nonManifoldEdges) process.exit(7);

// ── THE PINNED TARGET SET ──────────────────────────────────────────────────────────────────────────
interface Row { e: number; f1: number; f2: number; measDeg: number; normHi: number; drop: number; tri1: number[]; tri2: number[]; z: number; thMod30: number }
const rows: Row[] = readFileSync(SET, 'utf8').split('\n').filter((s) => s.length > 2).map((s) => JSON.parse(s) as Row);
log(`target set ${rows.length} pairs from ${SET}`);
{
  let bad = 0; let worst = 0;
  for (const r of rows) {
    let dev = 0;
    for (let k = 0; k < 9; k += 1) {
      dev = Math.max(dev, Math.abs(r.tri1[k] - xyz0[r.f1 * 9 + k]), Math.abs(r.tri2[k] - xyz0[r.f2 * 9 + k]));
    }
    if (dev > worst) worst = dev;
    if (dev > 0) bad += 1;
  }
  log(`  INPUT CONTROL: max |ndjson tri - STL tri| = ${worst}   (${bad} of ${rows.length} rows deviate)`);
  if (worst > 0) { log('*** VOID: the pinned set was cut from different bytes. ***'); process.exit(5); }
}

const U: number[] = [];
{
  const seen = new Set<number>();
  for (const r of rows) { if (!seen.has(r.f1)) { seen.add(r.f1); U.push(r.f1); } if (!seen.has(r.f2)) { seen.add(r.f2); U.push(r.f2); } }
}
const inU = new Uint8Array(nTri);
for (const f of U) inU[f] = 1;
let areaU0 = 0;
for (const f of U) areaU0 += d0.areaMm2[f];
log(`  unique facets ${U.length}   AREA ${areaU0.toFixed(3)} mm2 = ${((areaU0 / meshArea0) * 100).toFixed(4)}% of mesh   (S112/S113 pinned: 6,193 / 69.826 / 0.1816%)`);

const probe: number[] = [];
{
  const inP = new Uint8Array(nTri);
  for (const f of U) inP[f] = 1;
  for (let e = 0; e < d0.edgeAngRad.length; e += 1) {
    const a = d0.edgeF1[e]; const b = d0.edgeF2[e];
    if (inU[a] === 1) inP[b] = 1;
    if (inU[b] === 1) inP[a] = 1;
  }
  for (let f = 0; f < nTri; f += 1) if (inP[f] === 1) probe.push(f);
}
const probeSlot = new Map<number, number>();
for (let i = 0; i < probe.length; i += 1) probeSlot.set(probe[i], i);
log(`  probe set (U + its 1-ring; the only facets a flip can touch) ${probe.length} facets  ${el()}`);
log('');

// ── RULERS over a soup ─────────────────────────────────────────────────────────────────────────────
function normDegTri(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, inset: number,
): number {
  const a = Math.atan2(ay, ax);
  const b = a + dThRaw(a, Math.atan2(by, bx));
  const c = a + dThRaw(a, Math.atan2(cy, cx));
  return orientOfFacet(nsKink, ax, ay, az, bx, by, bz, cx, cy, cz, a, b, c, { k: K, inset, scratch }).normDeg;
}
const normDegOf = (xyz: Float64Array, f: number, inset: number): number => normDegTri(
  xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
  xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], inset,
);
// Aspect ratio, the campaign's definition (ConformalDiskSubdivision.ts:290): longest edge / (2*inradius).
function arOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const s = 0.5 * (ab + bc + ca);
  if (!(area > 0) || !(s > 0)) return Infinity;
  return Math.max(ab, bc, ca) / (2 * (area / s));
}
function nrmOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  return L > 0 ? [nx / L, ny / L, nz / L] : [0, 0, 0];
}

// ── THE OPERATOR ───────────────────────────────────────────────────────────────────────────────────
interface Acc { i: number; f1: number; f2: number; pairBefore: number; pairAfter: number; ndBefore: number; ndAfter: number; arP: number; arC: number }
interface ArmOut {
  xyz: Float64Array; touched: Uint8Array; acc: Acc[];
  rej: { notEdgePair: number; conflict: number; sameOpp: number; dup: number; fold: number; invert3d: number; shape: number; noImprove: number };
  strictShape: number;
}
function runArm(guard: boolean): ArmOut {
  const xyz = Float64Array.from(xyz0);
  const touched = new Uint8Array(nTri);
  const created = new Set<number>();
  const rej = { notEdgePair: 0, conflict: 0, sameOpp: 0, dup: 0, fold: 0, invert3d: 0, shape: 0, noImprove: 0 };
  const acc: Acc[] = [];
  let strictShape = 0;
  const P = (id: number, k: number): number => (k === 0 ? W.vx[id] : k === 1 ? W.vy[id] : W.vz[id]);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const f1 = r.f1; const f2 = r.f2;
    const A1 = [W.id[f1 * 3], W.id[f1 * 3 + 1], W.id[f1 * 3 + 2]];
    const A2 = [W.id[f2 * 3], W.id[f2 * 3 + 1], W.id[f2 * 3 + 2]];
    const sh = A1.filter((x) => A2.includes(x));
    if (sh.length !== 2) { rej.notEdgePair += 1; continue; }
    if (touched[f1] === 1 || touched[f2] === 1) { rej.conflict += 1; continue; }
    const u = sh[0]; const v = sh[1];
    const c = A1.find((x) => x !== u && x !== v) as number;
    const dv = A2.find((x) => x !== u && x !== v) as number;
    if (c === dv) { rej.sameOpp += 1; continue; }
    if (baseEdges.has(ekey(c, dv)) || created.has(ekey(c, dv))) { rej.dup += 1; continue; }
    // STRICT CONVEXITY of the quad in the (theta, z) GRAPH domain — landFlipPass's C4 predicate, verbatim.
    const t0th = VT[u];
    const pux = 0; const puy = W.vz[u];
    const pvx = dThRaw(t0th, VT[v]); const pvy = W.vz[v];
    const pcx = dThRaw(t0th, VT[c]); const pcy = W.vz[c];
    const pdx = dThRaw(t0th, VT[dv]); const pdy = W.vz[dv];
    const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
    const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
    if (!(s1 * s2 < 0 && s3 * s4 < 0)) { rej.fold += 1; continue; }
    // ORIENTATION-CORRECT RE-LABEL from the quad's real boundary cycle.
    let f1IsUV = false;
    for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
    const cc = f1IsUV ? c : dv; const dd = f1IsUV ? dv : c;
    const n1 = [cc, u, dd]; const n2 = [cc, dd, v];
    const g1 = nrmOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const g2 = nrmOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const o1 = nrmOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const o2 = nrmOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    const mx = o1[0] + o2[0]; const my = o1[1] + o2[1]; const mz = o1[2] + o2[2];
    if (!(Math.hypot(mx, my, mz) > 0) || !(g1[0] * mx + g1[1] * my + g1[2] * mz > 0 && g2[0] * mx + g2[1] * my + g2[2] * mz > 0)) { rej.invert3d += 1; continue; }
    // SHAPE FLOOR — do-no-harm: children may not be worse than max(AR_CAP, the two parents).
    const arC1 = arOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const arC2 = arOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const arP1 = arOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const arP2 = arOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    if (!(arC1 <= Math.max(AR_CAP, arP1, arP2) && arC2 <= Math.max(AR_CAP, arP1, arP2))) { rej.shape += 1; continue; }
    if (!(arC1 <= AR_CAP && arC2 <= AR_CAP)) strictShape += 1;
    // C1 — the GUARD arm only: the pair's max normDeg must STRICTLY decrease.
    const ndB = Math.max(normDegOf(xyz0, f1, INSET_HI), normDegOf(xyz0, f2, INSET_HI));
    const ndA = Math.max(
      normDegTri(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2), INSET_HI),
      normDegTri(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2), INSET_HI),
    );
    if (guard && !(ndA < ndB - 1e-9)) { rej.noImprove += 1; continue; }
    for (let k = 0; k < 3; k += 1) {
      xyz[f1 * 9 + k * 3] = W.vx[n1[k]]; xyz[f1 * 9 + k * 3 + 1] = W.vy[n1[k]]; xyz[f1 * 9 + k * 3 + 2] = W.vz[n1[k]];
      xyz[f2 * 9 + k * 3] = W.vx[n2[k]]; xyz[f2 * 9 + k * 3 + 1] = W.vy[n2[k]]; xyz[f2 * 9 + k * 3 + 2] = W.vz[n2[k]];
    }
    touched[f1] = 1; touched[f2] = 1;
    created.add(ekey(c, dv));
    let dp = g1[0] * g2[0] + g1[1] * g2[1] + g1[2] * g2[2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    acc.push({
      i, f1, f2, pairBefore: r.measDeg, pairAfter: (Math.acos(dp) * 180) / Math.PI, ndBefore: ndB, ndAfter: ndA,
      arP: Math.max(arP1, arP2), arC: Math.max(arC1, arC2),
    });
  }
  return { xyz, touched, acc, rej, strictShape };
}

// ── MEASUREMENT ────────────────────────────────────────────────────────────────────────────────────
const thr = (HI_DEG * Math.PI) / 180;
interface Cen { n: number; nTot: number; area: number; areaTot: number; pct: number; max: number; shareOfSet: number }
function census(d: { perFacetMaxRad: Float64Array; areaMm2: Float64Array }, set: number[] | null): Cen {
  let n = 0; let area = 0; let max = 0; let areaTot = 0; let nTot = 0;
  const walk = (f: number): void => {
    const a = d.perFacetMaxRad[f];
    nTot += 1; areaTot += d.areaMm2[f];
    if (a > max) max = a;
    if (a > thr) { n += 1; area += d.areaMm2[f]; }
  };
  if (set === null) { for (let f = 0; f < d.areaMm2.length; f += 1) walk(f); } else for (const f of set) walk(f);
  return { n, nTot, area, areaTot, pct: (area / meshArea0) * 100, max: (max * 180) / Math.PI, shareOfSet: areaTot > 0 ? area / areaTot : 0 };
}
// probe-minus-U: the 1-ring the defect can RELOCATE into. And everything else, which cannot move at all.
const ring: number[] = probe.filter((f) => inU[f] !== 1);
const outside: number[] = [];
{
  const inP = new Uint8Array(nTri);
  for (const f of probe) inP[f] = 1;
  for (let f = 0; f < nTri; f += 1) if (inP[f] === 0) outside.push(f);
}
const cU0 = census(d0, U); const cM0 = census(d0, null);
const cR0 = census(d0, ring); const cO0 = census(d0, outside);
const ndBefore: Record<string, Float64Array> = {};
for (const inset of [INSET_LO, INSET_HI]) {
  const b = new Float64Array(probe.length);
  for (let i = 0; i < probe.length; i += 1) b[i] = normDegOf(xyz0, probe[i], inset);
  ndBefore[String(inset)] = b;
}
log(`BEFORE normDeg computed on the probe set at inset ${INSET_LO} and ${INSET_HI}  ${el()}`);
log('');

const summary: Record<string, unknown>[] = [];
for (const arm of [{ name: 'A  UNCONDITIONAL (every LEGAL flip)', guard: false }, { name: 'B  GUARDED (C1: pair max normDeg must strictly decrease)', guard: true }]) {
  log('══════════════════════════════════════════════════════════════════════════════════════════════');
  log(`ARM ${arm.name}`);
  log('══════════════════════════════════════════════════════════════════════════════════════════════');
  const R = runArm(arm.guard);
  log('── FLIP LEGALITY (every refusal counted; a silent skip is a lie about coverage) ──');
  log(`  candidates                       ${rows.length}`);
  log(`  ACCEPTED (flip applied)          ${R.acc.length}   = ${((R.acc.length / rows.length) * 100).toFixed(2)}% of pairs`);
  log(`  refused: not an edge pair        ${R.rej.notEdgePair}`);
  log(`  refused: facet already flipped   ${R.rej.conflict}   (a facet in two pairs; file order, first wins)`);
  log(`  refused: same opposite vertex    ${R.rej.sameOpp}`);
  log(`  refused: new edge already exists ${R.rej.dup}   (the flip would make a non-manifold edge)`);
  log(`  refused: NON-CONVEX quad (fold)  ${R.rej.fold}   (the flip would invert a triangle)`);
  log(`  refused: 3D normal inversion     ${R.rej.invert3d}`);
  log(`  refused: shape floor AR          ${R.rej.shape}   (cap = max(${AR_CAP}, parents))`);
  log(`  refused: C1 no improvement       ${R.rej.noImprove}${arm.guard ? '' : '   (clause not applied in this arm)'}`);
  log(`  [a STRICT AR<=${AR_CAP} rule would refuse ${R.strictShape} MORE of the accepted]  ${el()}`);
  log('');

  const d1 = facetDihedrals(R.xyz, idxIdentity);
  let meshArea1 = 0;
  for (let f = 0; f < nTri; f += 1) meshArea1 += d1.areaMm2[f];
  log(`AFTER census: area ${meshArea1.toFixed(3)} mm2  interior ${d1.interiorEdges}  boundary ${d1.boundaryEdges}  nonManifold ${d1.nonManifoldEdges}  inconsistent ${d1.inconsistentEdges}  ${el()}`);
  log(`  topology delta: interior ${d1.interiorEdges - d0.interiorEdges}  boundary ${d1.boundaryEdges - d0.boundaryEdges}  nonManifold ${d1.nonManifoldEdges - d0.nonManifoldEdges}  inconsistentWinding ${d1.inconsistentEdges - d0.inconsistentEdges}`);
  log(`  mesh AREA delta ${(meshArea1 - meshArea0).toFixed(4)} mm2 = ${(((meshArea1 - meshArea0) / meshArea0) * 100).toFixed(4)}%  (the two cuts of a NON-PLANAR quad differ in area — real, not a bug)`);
  const cU1 = census(d1, U); const cM1 = census(d1, null);
  const cR1 = census(d1, ring); const cO1 = census(d1, outside);
  log('');
  log(`══ RESULT 1 — DIHEDRAL over ${HI_DEG} deg, the visibility quantity a preview shades ══`);
  log('                                   COUNT      AREA mm2   %of MESH    MAX deg');
  log(`  TARGET SET (${U.length} facets) BEFORE   ${String(cU0.n).padStart(7)}   ${cU0.area.toFixed(4).padStart(9)}   ${cU0.pct.toFixed(4).padStart(8)}   ${cU0.max.toFixed(2).padStart(7)}`);
  log(`  TARGET SET                AFTER    ${String(cU1.n).padStart(7)}   ${cU1.area.toFixed(4).padStart(9)}   ${cU1.pct.toFixed(4).padStart(8)}   ${cU1.max.toFixed(2).padStart(7)}`);
  const primaryX = cU1.area > 0 ? cU0.area / cU1.area : Infinity;
  log(`  => PRIMARY ratio (before/after AREA) = ${primaryX.toFixed(4)}x     [kill line: >= ${KILL_X.toFixed(1)}x]`);
  log(`     by COUNT it would be ${(cU1.n > 0 ? cU0.n / cU1.n : Infinity).toFixed(4)}x, by MAX ${(cU1.max > 0 ? cU0.max / cU1.max : Infinity).toFixed(4)}x  (never quote one alone)`);
  log('');
  log('  *** THE DECOMPOSITION THAT DECIDES WHETHER THAT RATIO MEANS ANYTHING ***');
  log(`  target set TOTAL area  ${cU0.areaTot.toFixed(4)} -> ${cU1.areaTot.toFixed(4)} mm2  (ratio ${(cU0.areaTot / cU1.areaTot).toFixed(4)}x)`);
  log(`  over-${HI_DEG}deg SHARE OF the target set  ${(cU0.shareOfSet * 100).toFixed(3)}% -> ${(cU1.shareOfSet * 100).toFixed(3)}%`);
  log('  A flip cannot delete area; it re-cuts a NON-PLANAR quad along its other diagonal, and the two cuts');
  log('  have different area. If TOTAL area falls by the same ratio as OVER-BAR area, the facets were not');
  log('  repaired — they were made SMALLER, and the defect went somewhere else. Read the next block.');
  log('');
  log(`  WHOLE MESH (${nTri})      BEFORE   ${String(cM0.n).padStart(7)}   ${cM0.area.toFixed(4).padStart(9)}   ${cM0.pct.toFixed(4).padStart(8)}   ${cM0.max.toFixed(2).padStart(7)}`);
  log(`  WHOLE MESH                AFTER    ${String(cM1.n).padStart(7)}   ${cM1.area.toFixed(4).padStart(9)}   ${cM1.pct.toFixed(4).padStart(8)}   ${cM1.max.toFixed(2).padStart(7)}`);
  log(`  => FLOOR-2 whole-mesh AREA delta ${cM1.area - cM0.area >= 0 ? '+' : ''}${(cM1.area - cM0.area).toFixed(4)} mm2  (must be <= 0)`);
  log('');
  log('  ── WHERE THE DEFECT WENT (the three regions partition the mesh) ──');
  log(`    U (target set,  ${String(U.length).padStart(7)} facets)  over-bar AREA ${cU0.area.toFixed(4)} -> ${cU1.area.toFixed(4)}   delta ${cU1.area - cU0.area >= 0 ? '+' : ''}${(cU1.area - cU0.area).toFixed(4)}`);
  log(`    1-RING          (${String(ring.length).padStart(7)} facets)  over-bar AREA ${cR0.area.toFixed(4)} -> ${cR1.area.toFixed(4)}   delta ${cR1.area - cR0.area >= 0 ? '+' : ''}${(cR1.area - cR0.area).toFixed(4)}`);
  log(`    EVERYTHING ELSE (${String(outside.length).padStart(7)} facets)  over-bar AREA ${cO0.area.toFixed(4)} -> ${cO1.area.toFixed(4)}   delta ${cO1.area - cO0.area >= 0 ? '+' : ''}${(cO1.area - cO0.area).toFixed(4)}`);
  log(`    PARTITION CONTROL: "everything else" touches no flipped facet, so its delta MUST be exactly 0. ${cO1.area === cO0.area && cO1.n === cO0.n ? 'IS 0.' : '*** NOT 0 — VOID ***'}`);
  if (!(cO1.area === cO0.area && cO1.n === cO0.n)) process.exit(8);
  log('');

  // normDeg, swept over inset
  log(`── RESULT 2 — normDeg (the ANALYTIC orientation ruler), k=${K}, winding, inset SWEPT ──`);
  const ndAfter: Record<string, Float64Array> = {};
  for (const inset of [INSET_LO, INSET_HI]) {
    const a = new Float64Array(probe.length);
    for (let i = 0; i < probe.length; i += 1) a[i] = normDegOf(R.xyz, probe[i], inset);
    ndAfter[String(inset)] = a;
  }
  {
    let bad = 0; let worstD = 0; let nUn = 0;
    for (const inset of [INSET_LO, INSET_HI]) {
      const b = ndBefore[String(inset)]; const a = ndAfter[String(inset)];
      for (let i = 0; i < probe.length; i += 1) {
        if (R.touched[probe[i]] === 1) continue;
        nUn += 1;
        if (a[i] !== b[i]) { bad += 1; worstD = Math.max(worstD, Math.abs(a[i] - b[i])); }
      }
    }
    log(`  INSTRUMENT CONTROL: ${nUn} untouched probe-facet readings, ${bad} differ between arms (worst ${worstD}). MUST be 0.`);
    if (bad > 0) { log('*** VOID: the differencing machinery moved a facet nobody flipped. ***'); process.exit(6); }
  }
  const ndCen = (v: Float64Array, bar: number): { n: number; area: number; max: number } => {
    let n = 0; let area = 0; let max = 0;
    for (let i = 0; i < probe.length; i += 1) {
      if (inU[probe[i]] !== 1) continue;
      if (v[i] > max) max = v[i];
      if (v[i] > bar) { n += 1; area += d0.areaMm2[probe[i]]; }
    }
    return { n, area, max };
  };
  for (const inset of [INSET_LO, INSET_HI]) {
    const b = ndBefore[String(inset)]; const a = ndAfter[String(inset)];
    for (const bar of [1, 10, 45]) {
      const cb = ndCen(b, bar); const ca = ndCen(a, bar);
      log(`  inset ${String(inset).padEnd(5)} bar ${String(bar).padStart(2)}deg | U BEFORE n=${String(cb.n).padStart(5)} area=${cb.area.toFixed(4)} max=${cb.max.toFixed(2)}  ->  AFTER n=${String(ca.n).padStart(5)} area=${ca.area.toFixed(4)} max=${ca.max.toFixed(2)}`);
    }
  }
  let floor3 = true; let floor3Detail = '';
  {
    const b = ndBefore[String(INSET_HI)]; const a = ndAfter[String(INSET_HI)];
    let worseN = 0; let worseArea = 0; let betterN = 0; let betterArea = 0; let worstUp = 0; let over = 0;
    const ups: number[] = [];
    for (let i = 0; i < probe.length; i += 1) {
      const del = a[i] - b[i];
      if (del > 1e-12) { worseN += 1; worseArea += d0.areaMm2[probe[i]]; ups.push(del); if (del > worstUp) worstUp = del; if (del > WORSE_DEG) over += 1; }
      else if (del < -1e-12) { betterN += 1; betterArea += d0.areaMm2[probe[i]]; }
    }
    floor3 = over === 0;
    floor3Detail = `${over} facets over +${WORSE_DEG} deg, worst +${worstUp.toFixed(3)} deg`;
    log('');
    log(`  FLOOR-3 on the probe set: WORSE n=${worseN} area=${worseArea.toFixed(4)} mm2 | BETTER n=${betterN} area=${betterArea.toFixed(4)} mm2`);
    log(`          worst single increase ${worstUp.toFixed(3)} deg; ${over} facets increased by more than ${WORSE_DEG.toFixed(1)} deg  (must be 0)`);
    if (ups.length > 0) log(`          increase distribution p50 ${q(ups, 0.5).toFixed(3)} p90 ${q(ups, 0.9).toFixed(3)} p99 ${q(ups, 0.99).toFixed(3)} deg`);
  }
  log('');

  if (R.acc.length > 0) {
    const before = R.acc.map((x) => x.pairBefore); const after = R.acc.map((x) => x.pairAfter);
    log('── RESULT 3 — the FLIPPED PAIRS themselves ──');
    log(`  pair DIHEDRAL BEFORE p10 ${q(before, 0.1).toFixed(2)} p50 ${q(before, 0.5).toFixed(2)} p90 ${q(before, 0.9).toFixed(2)} MAX ${Math.max(...before).toFixed(2)} deg`);
    log(`  pair DIHEDRAL AFTER  p10 ${q(after, 0.1).toFixed(2)} p50 ${q(after, 0.5).toFixed(2)} p90 ${q(after, 0.9).toFixed(2)} MAX ${Math.max(...after).toFixed(2)} deg`);
    log(`  pairs whose own diagonal fell under ${HI_DEG} deg: ${after.filter((x) => x <= HI_DEG).length} of ${R.acc.length}`);
    log(`  pairs whose own diagonal got WORSE:              ${R.acc.filter((x) => x.pairAfter > x.pairBefore).length}`);
    const bL = ndBefore[String(INSET_LO)]; const aL = ndAfter[String(INSET_LO)];
    const bH = ndBefore[String(INSET_HI)]; const aH = ndAfter[String(INSET_HI)];
    const dropB: number[] = []; const dropA: number[] = [];
    let inwardB = 0; let inwardA = 0; let nF = 0;
    for (const x of R.acc) for (const f of [x.f1, x.f2]) {
      const i = probeSlot.get(f) as number;
      nF += 1;
      if (bL[i] > 1e-9) dropB.push(bH[i] / bL[i]);
      if (aL[i] > 1e-9) dropA.push(aH[i] / aL[i]);
      if (bH[i] > 90) inwardB += 1;
      if (aH[i] > 90) inwardA += 1;
    }
    log(`  CONFORMANCE SIGNAL drop = normDeg(${INSET_HI})/normDeg(${INSET_LO}); LOW => a mesh edge now sits ON the crease`);
    log(`    BEFORE p10 ${q(dropB, 0.1).toFixed(3)} p50 ${q(dropB, 0.5).toFixed(3)} p90 ${q(dropB, 0.9).toFixed(3)}   frac<0.25 (CONFORMED) ${((dropB.filter((x) => x < 0.25).length / dropB.length) * 100).toFixed(2)}%`);
    log(`    AFTER  p10 ${q(dropA, 0.1).toFixed(3)} p50 ${q(dropA, 0.5).toFixed(3)} p90 ${q(dropA, 0.9).toFixed(3)}   frac<0.25 (CONFORMED) ${((dropA.filter((x) => x < 0.25).length / dropA.length) * 100).toFixed(2)}%`);
    log(`  normDeg > 90 deg (facet normal pointing INWARD of the analytic normal): ${inwardB} -> ${inwardA} of ${nF} flipped facets`);
    const arcs = R.acc.map((x) => x.arC); const arps = R.acc.map((x) => x.arP);
    log(`  AR parents p50 ${q(arps, 0.5).toFixed(2)} p90 ${q(arps, 0.9).toFixed(2)} MAX ${Math.max(...arps).toFixed(2)}  ->  children p50 ${q(arcs, 0.5).toFixed(2)} p90 ${q(arcs, 0.9).toFixed(2)} MAX ${Math.max(...arcs).toFixed(2)}`);
  }
  log('');
  const floor2 = cM1.area <= cM0.area;
  const primaryPass = primaryX >= KILL_X;
  const verdict = primaryPass && floor2 && floor3 ? 'CONFIRMED' : 'REFUTED';
  log(`══ VERDICT — ARM ${arm.name.slice(0, 1)} ══`);
  log(`  PRIMARY  target-set over-${HI_DEG}deg AREA ${cU0.area.toFixed(4)} -> ${cU1.area.toFixed(4)} mm2 = ${primaryX.toFixed(4)}x   ${primaryPass ? 'PASS' : 'FAIL'} (need >= ${KILL_X.toFixed(1)}x)`);
  log(`  FLOOR-1  triangles ${nTri} -> ${nTri}   PASS (a flip re-labels, never adds)`);
  log(`  FLOOR-2  whole-mesh over-${HI_DEG}deg AREA ${cM0.area.toFixed(4)} -> ${cM1.area.toFixed(4)} mm2   ${floor2 ? 'PASS' : 'FAIL'}`);
  log(`  FLOOR-3  ${floor3Detail}   ${floor3 ? 'PASS' : 'FAIL'}`);
  log(`  *** ARM ${arm.name.slice(0, 1)} => ${verdict} ***`);
  log('');
  summary.push({
    arm: arm.name, accepted: R.acc.length, rej: R.rej, strictShape: R.strictShape,
    meshArea1, targetBefore: cU0, targetAfter: cU1, meshBefore: cM0, meshAfter: cM1,
    primaryX, floor2, floor3, floor3Detail, verdict,
    pairsUnder45: R.acc.filter((x) => x.pairAfter <= HI_DEG).length,
    pairsWorse: R.acc.filter((x) => x.pairAfter > x.pairBefore).length,
  });
  writeFileSync(`${OUTDIR}/S113_OPFLIP_${TAG}_ARM${arm.name.slice(0, 1)}.accepted.ndjson`, `${R.acc.map((x) => JSON.stringify(x)).join('\n')}\n`);
}

log('══════════════════════════════════════════════════════════════════════════════════════════════');
log('OPERATOR 1 (EDGE FLIP) — FINAL');
for (const s of summary) log(`  ${String(s.arm).padEnd(58)} accepted ${String(s.accepted).padStart(5)}  PRIMARY ${(s.primaryX as number).toFixed(4)}x  => ${s.verdict}`);
log('══════════════════════════════════════════════════════════════════════════════════════════════');

writeFileSync(`${OUTDIR}/S113_OPFLIP_${TAG}.json`, `${JSON.stringify({
  stl: STL, set: SET, style: STYLE, dims: DIMS, k: K, insetLo: INSET_LO, insetHi: INSET_HI, hiDeg: HI_DEG, arCap: AR_CAP,
  killX: KILL_X, worseDeg: WORSE_DEG, nTri, meshArea0, pairs: rows.length, uniqueFacets: U.length,
  targetAreaMm2: areaU0, probeFacets: probe.length, arms: summary,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S113_OPFLIP_${TAG}.json`);
log(`done ${el()}`);
