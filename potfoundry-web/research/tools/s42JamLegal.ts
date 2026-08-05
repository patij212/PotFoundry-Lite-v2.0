// s42JamLegal.ts — IS THE `shape-ar` JAM A REAL GEOMETRIC OBSTRUCTION, OR A SEARCH THAT GAVE UP?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS RUNS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Every arm in this campaign ends with `unresolved by reason: shape-ar` at 100% — 774 facets in
// S39CTL — and the HEADLINE MAX *is* that population. The report calls them "live over-tol triangles
// the splitter could NOT subdivide", but `classifyStrand` does not prove that: it reads
// `bisectRefusal()`, the channel set by the LAST refused `bisectAt`, so the label names the last
// placement that failed, not the non-existence of a good one.
//
// A first pass at this question, done with the split point on the CHORD, said 77.5% of the jam had a
// legal split. THAT PASS WAS WRONG AND THIS FILE EXISTS BECAUSE OF IT. `bisectAt` scores
// `shapeAdmits(a, b, liftAt(a, b, tPar))` — the new vertex sits ON THE SURFACE, not on the chord, so
// on a facet with more relief than edge length the lifted child is nothing like the chord child.
// Reproducing the guard means reproducing the LIFT.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS REPRODUCED, AND FROM WHERE
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//   liftAt      th = vth[a] + dThRaw(vth[a],vth[b])*s ;  z = vz[a] + (vz[b]-vz[a])*s
//               theta = canonTheta(th) ; r = rA(theta,z) ; p = (r cos, r sin, z)     [driver :1538]
//   shapeAdmits for BOTH triangles incident to the edge, BOTH children each:
//               aspect3(child) <= PF_CB_SHAPE_AR, and the (theta,z) fold sign vs the parent, anchored
//               at the apex exactly as the driver anchors it.                        [driver :~1700]
//   aspect3     imported from _shapeGuard — the guard's own function, not a re-derivation.
//
// THE SWEEP IS STRICTLY WIDER THAN THE DRIVER'S. The driver tries 3 edges x the 11-position
// NUDGE_LADDER = 33 placements. This tries the same 11, and then a dense sweep of 97 placements per
// edge. So "no legal placement here" is a much stronger statement than "the driver failed", and
// "legal placement exists" localises the gap to the ladder rather than to the geometry.
//
// AND IT PRINTS THE QUANTITY THAT DECIDES WHICH IT IS: the RELIEF RATIO, |lift - chord|/edgeLen at
// the best placement. A facet whose local relief exceeds its own edge length cannot be conformed by
// ONE bisection at any placement — the lifted vertex leaves the parent's plane by more than the
// facet spans, so every child is a spike. That is a real obstruction and the answer to it is
// connectivity or a finer approach, never a better nudge. A facet with a small relief ratio and no
// legal placement is a different animal and would indict the cap instead.
//
// ⚠ (theta,z) IS RECOVERED FROM THE SHIPPED f32 STL — theta = canonTheta(atan2(y,x)) — so this
//   reproduces the guard to f32, not bit-exactly. The driver's own note applies: an f32 tie "moves
//   individuals, never the population". Population statistics here are sound; a single facet within
//   ~0.1% of the cap may tip either way.
// ⚠ MEASURED ON THE FINAL MESH. A facet's own edges cannot have changed since its refusal (splitting
//   one would have split it too), but a NEIGHBOUR's opposite edges can have, so the neighbourhood is
//   the one that shipped, not necessarily the one at refusal time. Read this as "can the shipped mesh
//   be refined here", which is the question a resume pass would face anyway.
//
// Read-only. Writes nothing but its report.
//
// Usage:  bash research/tools/run-s42-jam-legal.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleId, StyleDims } from '../../src/geometry/types';
import { readFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const SHAPE_AR = envF('PF_S42_AR', 50);
const TAG = process.env.PF_S42_TAG ?? 'S39CTL';
const BASE = `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_${TAG}`;
const NUDGE_LADDER = [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72, 0.21, 0.79, 0.15, 0.85];
const DENSE = Array.from({ length: 97 }, (_, i) => (i + 2) / 100);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const rAraw = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const H = DIMS.H;
const rA = (th: number, z: number): number => rAraw(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const signedAreaParam = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

log('===== S42 — IS THE shape-ar JAM REAL? The split guard, reproduced WITH THE SURFACE LIFT. =====');
log(`STL ${BASE}.stl    cap AR ${SHAPE_AR}`);
const t0 = Date.now();
const { xyz, nTri } = readMeshFloat64(`${BASE}.stl`, false);

// ── weld exactly as the driver's 3-D weld does: identical shipped coordinates are one vertex ──
const vx: number[] = []; const vy: number[] = []; const vz: number[] = [];
const vth: number[] = [];
const vkey = new Map<string, number>();
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
const vid = (x: number, y: number, z: number): number => {
  const k = `${x},${y},${z}`;
  const got = vkey.get(k);
  if (got !== undefined) return got;
  const i = vx.length;
  vkey.set(k, i); vx.push(x); vy.push(y); vz.push(z); vth.push(canonTheta(Math.atan2(y, x)));
  return i;
};
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  ta[t] = vid(xyz[o], xyz[o + 1], xyz[o + 2]);
  tb[t] = vid(xyz[o + 3], xyz[o + 4], xyz[o + 5]);
  tc[t] = vid(xyz[o + 6], xyz[o + 7], xyz[o + 8]);
}
log(`     ${nTri} triangles, ${vx.length} welded vertices   (V-E+F must be 0 for a ring: see the report)`);

const eKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
const edgeMap = new Map<string, number[]>();
for (let t = 0; t < nTri; t += 1) {
  for (const [a, b] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
    const k = eKey(a, b); const l = edgeMap.get(k);
    if (l === undefined) edgeMap.set(k, [t]); else l.push(t);
  }
}

// ── the driver's own primitives ──
const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
interface Lift { x: number; y: number; z: number; th: number }
const liftAt = (a: number, b: number, s: number): Lift => {
  const th = vth[a] + dThRaw(vth[a], vth[b]) * s;
  const z = vz[a] + (vz[b] - vz[a]) * s;
  const theta = canonTheta(th);
  const r = rA(theta, z);
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), z, th: theta };
};
/**
 * shapeAdmits, verbatim in structure: every child on BOTH sides, AR cap then fold sign.
 *
 * ⚠ ONE DELIBERATE DIFFERENCE FROM THE DRIVER, AND IT IS WHAT MAKES THE `at cap X` TABLE HONEST. The
 * driver returns on the FIRST child over the cap — it only needs a yes/no. This does not: it scores
 * EVERY child on both incident triangles and returns the true maximum, because an early return would
 * report a `worst` that omits the second triangle's children and the cap sweep would then be
 * optimistic. `ok` is still exactly the driver's verdict at SHAPE_AR; `worst` is the quantity the
 * sweep needs. A fold refusal is Infinity, so no cap can ever "fix" one.
 */
const shapeAdmits = (a: number, b: number, p: Lift): { ok: boolean; worst: number } => {
  const list = edgeMap.get(eKey(a, b));
  if (list === undefined) return { ok: true, worst: 0 };
  let worst = 0; let folded = false;
  for (const t of list) {
    const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
    // orientedEnds — the driver's own oa/ob rule
    const seq = [ta[t], tb[t], tc[t]];
    let oa = a; let ob = b;
    for (let i = 0; i < 3; i += 1) {
      if (seq[i] === a && seq[(i + 1) % 3] === b) { oa = a; ob = b; break; }
      if (seq[i] === b && seq[(i + 1) % 3] === a) { oa = b; ob = a; break; }
    }
    const ar1 = aspect3(vx[oa], vy[oa], vz[oa], p.x, p.y, p.z, vx[apex], vy[apex], vz[apex]);
    const ar2 = aspect3(p.x, p.y, p.z, vx[ob], vy[ob], vz[ob], vx[apex], vy[apex], vz[apex]);
    if (ar1 > worst) worst = ar1;
    if (ar2 > worst) worst = ar2;
    const sPar = signedAreaParam(vth[apex], vz[apex], vth[oa], vz[oa], vth[ob], vz[ob]);
    const s1 = signedAreaParam(vth[apex], vz[apex], vth[oa], vz[oa], p.th, p.z);
    const s2 = signedAreaParam(vth[apex], vz[apex], p.th, p.z, vth[ob], vz[ob]);
    if (Math.sign(s1) !== Math.sign(sPar) || Math.sign(s2) !== Math.sign(sPar)) folded = true;
  }
  if (folded) return { ok: false, worst: Infinity };
  return { ok: worst <= SHAPE_AR, worst };
};

// ── match the emitted jam list to STL triangles by (z-centroid, sorted edge lengths) ──
interface JamRow { z: number; shortUm: number; midUm: number; longUm: number; sagNowUm: number; keyUm: number; ar3: number }
const jam = (JSON.parse(readFileSync(`${BASE}.unresolved.json`, 'utf8')) as { facets: JamRow[] }).facets;
const byZ = new Map<number, number[]>();
for (let t = 0; t < nTri; t += 1) {
  const z = Math.round(((vz[ta[t]] + vz[tb[t]] + vz[tc[t]]) / 3) * 1000) / 1000;
  const l = byZ.get(z); if (l === undefined) byZ.set(z, [t]); else l.push(t);
}
const findTri = (r: JamRow): number => {
  const want = [r.shortUm, r.midUm, r.longUm].sort((x, y) => x - y);
  for (const dz of [0, 0.001, -0.001]) {
    for (const t of byZ.get(Math.round((r.z + dz) * 1000) / 1000) ?? []) {
      const es = [eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])]
        .map((v) => Math.round(v * 10000) / 10).sort((x, y) => x - y);
      if (es.every((v, k) => Math.abs(v - want[k]) < 0.35)) return t;
    }
  }
  return -1;
};

let matched = 0; let legalLadder = 0; let legalDense = 0; let jammed = 0;
const reliefRatios: number[] = [];
const rows: Array<{ sag: number; bestLad: number; bestDense: number; relief: number; le: number }> = [];
for (const r of jam) {
  const t = findTri(r);
  if (t < 0) continue;
  matched += 1;
  const edges: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
  let bestLad = Infinity; let bestDense = Infinity; let reliefAtBest = 0; let leAtBest = 0;
  for (const [a, b] of edges) {
    const le = eLen(a, b);
    for (const s of NUDGE_LADDER) {
      const v = shapeAdmits(a, b, liftAt(a, b, s));
      if (v.worst < bestLad) bestLad = v.worst;
    }
    for (const s of DENSE) {
      const p = liftAt(a, b, s);
      const v = shapeAdmits(a, b, p);
      if (v.worst < bestDense) {
        bestDense = v.worst;
        const cx = vx[a] + (vx[b] - vx[a]) * s; const cy = vy[a] + (vy[b] - vy[a]) * s; const cz = vz[a] + (vz[b] - vz[a]) * s;
        reliefAtBest = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
        leAtBest = le;
      }
    }
  }
  if (bestLad <= SHAPE_AR) legalLadder += 1;
  if (bestDense <= SHAPE_AR) legalDense += 1; else jammed += 1;
  const rr = leAtBest > 0 ? reliefAtBest / leAtBest : 0;
  reliefRatios.push(rr);
  rows.push({ sag: r.sagNowUm, bestLad, bestDense, relief: rr, le: leAtBest });
}
const pct = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
const q = (v: number[], p: number): number => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
log('');
log(`MATCHED ${matched} of ${jam.length} emitted jam facets in the STL.`);
log('');
log('IS A LEGAL SPLIT AVAILABLE — guard reproduced WITH the surface lift, all 3 edges?');
log(`  legal at a NUDGE_LADDER position (what the driver actually tries) : ${legalLadder}  (${pct(legalLadder, matched)})`);
log(`  legal at ANY of 97 dense placements per edge                      : ${legalDense}  (${pct(legalDense, matched)})`);
log(`  GENUINELY JAMMED — no legal placement on any edge                 : ${jammed}  (${pct(jammed, matched)})`);
log('');
log('RELIEF RATIO |lift - chord| / edgeLen at the best placement — the quantity that says WHY:');
log(`  p10 ${q(reliefRatios, 0.1).toFixed(3)}   p50 ${q(reliefRatios, 0.5).toFixed(3)}   p90 ${q(reliefRatios, 0.9).toFixed(3)}   max ${Math.max(...reliefRatios).toFixed(3)}`);
log(`  facets whose local relief EXCEEDS their own edge length (ratio > 1): ${reliefRatios.filter((v) => v > 1).length}  (${pct(reliefRatios.filter((v) => v > 1).length, matched)})`);
log('    ^ a ratio > 1 means ONE bisection cannot conform here at any placement: the lifted vertex leaves');
log('      the parent plane by more than the facet spans, so every child is a spike. Connectivity or a');
log('      finer approach — never a better nudge.');
log('');
rows.sort((a, b) => b.sag - a.sag);
log('TOP 12 BY TRUE EDGE SAG:');
log(`  ${'sagNow'.padStart(9)} ${'bestLadder'.padStart(11)} ${'bestDense'.padStart(10)} ${'relief/len'.padStart(10)} ${'edge um'.padStart(9)}  verdict`);
for (const r of rows.slice(0, 12)) {
  log(`  ${r.sag.toFixed(1).padStart(9)} ${(Number.isFinite(r.bestLad) ? r.bestLad.toFixed(2) : 'inf').padStart(11)} ${(Number.isFinite(r.bestDense) ? r.bestDense.toFixed(2) : 'inf').padStart(10)} ${r.relief.toFixed(3).padStart(10)} ${(r.le * 1000).toFixed(1).padStart(9)}  ${r.bestDense <= SHAPE_AR ? 'LEGAL SPLIT EXISTS' : 'jammed'}`);
}
log('');
for (const cap of [50, 52, 55, 58, 60, 65, 70, 75, 80, 90, 100, 150]) {
  const n = rows.filter((r) => r.bestDense <= cap).length;
  log(`  at cap ${String(cap).padEnd(4)} : ${n} of ${matched} (${pct(n, matched)}) would have a legal split`);
}
log('');
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
