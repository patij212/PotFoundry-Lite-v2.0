// s34ResolveSeedAB.ts — THE SEED-TIME CHAIN RE-SOLVE, WIRED AND A/B'd FOR REAL.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT CHANGED SINCE S33
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S33 (commit de030134) priced the re-solve by moving vertices in an ALREADY-TRIANGULATED seed. It
// could not re-triangulate, so it published its shape numbers as worst-case and said so.
//
// The pass now lives in the builder — `_strataAlignedSeed.ts`, stage 1a-bis, `resolveSpanMm`,
// DEFAULT OFF — between the chain resample and stage-2 planarization. So the points move BEFORE
// cdt2d and the triangulation adapts to them. THIS is the honest measurement S33 stood in for.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// REGISTERED BEFORE THE NUMBERS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// P1 INERTNESS. With the lever unset the control must reproduce S47CAV in EVERY field
//    (116,931 pts / 233,062 tris / 12,806 constraints / 21,686 decimated / 9,363 actionable). A new
//    parameter that perturbs the default path is a regression regardless of what the arm shows, and
//    this is the first thing to read.
// P2 EFFECT. S33 predicted actionable 9,363 -> ~1,399 (-85%) at span 0.050. With re-triangulation
//    the arm should be AT LEAST as good, because the CDT now adapts to the corrected points instead
//    of inheriting stretched stars.
// P3 SHAPE. S33's folds 5 / overCap 6 / worstAR 208 were artefacts of NOT re-triangulating. Here
//    overCap and worstAR come from the builder's own census after a real cdt2d + repair rounds, and
//    the prediction is that they return to the control's values. If they do NOT, the re-solve is
//    creating genuinely bad geometry and that is a blocker, not a rounding difference.
// P4 PLANARITY. 0 proper constraint crossings, as S33 measured exactly.
// P5 COST. Points/tris roughly unchanged — the pass MOVES vertices, it does not add any. A large
//    change either way means something other than the intended mechanism fired.
//
// ⚠ THE DEFERRED HALF IS NOT EXPECTED TO MOVE. S33 measured it at -3.3% at this span. The re-solve
//   and §4.3 fix DIFFERENT halves; a flat `deferred` here is the predicted result, not a failure.
//
// Usage:  bash research/tools/run-s34-resolve-seed-ab.sh          (from potfoundry-web/)
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { traceLoci, DEFAULT_TRACE_OPTS } from '../bridge/_strataLocusTrace';
import { locateKinkRaw, dThRaw, canonTheta, type SweepPredConst } from '../bridge/_sweepPredicate';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS, type AlignedSeed } from '../bridge/_strataAlignedSeed';
import { REGION_SCHEMA, type RegionArtifact } from '../bridge/_strataRegionExtract';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const rRef = 45;
const SNAP_ALPHA = 0.12;
const AL_PATCH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json';
const AL_PATCH_IDS = ('0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,'
  + '1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016').split(',');

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
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.6 / 1000,
};
const styleParams = { ...registryDefaults('GothicArches') };
const rA = buildRadiusFn('GothicArches' as StyleId, styleParams, DIMS);

log('===== S34 — SEED-TIME CHAIN RE-SOLVE, WIRED INTO THE BUILDER, A/B =====');
const t0 = Date.now();
const art = traceLoci(rA, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 400, nv: 280, hRefMm: 0.35 });
log(`trace ${((Date.now() - t0) / 1000).toFixed(0)}s — ${art.counts.loci} components, junctions ${art.counts.junctions}`);

const regArt = JSON.parse(readFileSync(AL_PATCH, 'utf8')) as RegionArtifact;
if (regArt.schema !== REGION_SCHEMA) throw new Error('patch schema mismatch');
const chosen = new Map<number, { id: number; theta: number; z: number; radiusMm: number }>();
for (const s of AL_PATCH_IDS) {
  const r = regArt.regions.find((x) => x.id === Number(s));
  if (r === undefined) throw new Error(`patch id ${s} absent`);
  chosen.set(r.id, r);
}
const patchRoute: PatchRegion[] = [...chosen.values()].sort((a, b) => a.id - b.id)
  .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));

function build(resolveSpanMm: number | undefined): AlignedSeed {
  return buildAlignedSeedRepaired(rA, art, {
    ...DEFAULT_SEED_OPTS, H, gu: 200, gv: 140,
    alongMul: 1.0, acrossFrac: 0.35, useField: true,
    acrossAbs: true, acrossMinMm: 0.050, seedARmax: 24, bowFrac: 0,
    patchRoute, patchMaxMm: 1.5, patchSubMax: 16,
    acrossRings: 7, acrossGrade: 1.6, acrossStrideMax: 4,
    acrossStructured: false, acrossStructuredMode: 'full',
    acrossMaxMm: 0.650, turnMul: 9,
    mistraceUm: 0, shapeAR: 50, tolMm: 0.01,
    ...(resolveSpanMm === undefined ? {} : { resolveSpanMm, resolvePred: PRED }),
  }, 6).seed;
}

/** the conformance debt, split as S32/S33 established. `conformed` is the GOAL STATE, not debt. */
function debt(seed: AlignedSeed): { actionable: number; conformed: number; deferred: number; tested: number } {
  const th = seed.pts.map(([t]) => t); const z = seed.pts.map(([, zz]) => zz);
  const lift = (i: number): [number, number] => {
    const tc = canonTheta(th[i]); const r = rA(tc, z[i]);
    return [r * Math.cos(tc), r * Math.sin(tc)];
  };
  const seen = new Set<string>();
  let actionable = 0; let conformed = 0; let deferred = 0; let tested = 0;
  for (const [a, b, c] of seed.tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const lo = p < q ? p : q; const hi = p < q ? q : p;
      const k = `${lo},${hi}`;
      if (seen.has(k)) continue;
      seen.add(k); tested += 1;
      const dth = dThRaw(th[lo], th[hi]);
      const kk = locateKinkRaw(rA, th[lo], z[lo], th[lo] + dth, z[hi], PRED);
      if (kk === null || kk.jump) continue;
      if (kk.t > SNAP_ALPHA && kk.t < 1 - SNAP_ALPHA) { actionable += 1; continue; }
      const cth = th[lo] + dth * kk.t; const cz = z[lo] + (z[hi] - z[lo]) * kk.t;
      const cc = canonTheta(cth); const cr = rA(cc, cz);
      const px = cr * Math.cos(cc); const py = cr * Math.sin(cc);
      const [lx, ly] = lift(lo); const [hx, hy] = lift(hi);
      const dLo = Math.hypot(lx - px, ly - py, z[lo] - cz);
      const dHi = Math.hypot(hx - px, hy - py, z[hi] - cz);
      if (Math.min(dLo, dHi) <= PRED.confMm) conformed += 1; else deferred += 1;
    }
  }
  return { actionable, conformed, deferred, tested };
}

/** PROPER crossings among the constraint segments — the PSLG planarity test. */
function planarityBreaks(seed: AlignedSeed): number {
  const X = (i: number): number => rRef * canonTheta(seed.pts[i][0]);
  const Z = (i: number): number => seed.pts[i][1];
  const segs = seed.constraints;
  const BS = 2.0;
  const buckets = new Map<string, number[]>();
  for (let s = 0; s < segs.length; s += 1) {
    const [a, b] = segs[s];
    if (Math.abs(X(a) - X(b)) > rRef * Math.PI) continue;   // builder forbids constraints spanning the cut
    for (let ix = Math.floor(Math.min(X(a), X(b)) / BS); ix <= Math.floor(Math.max(X(a), X(b)) / BS); ix += 1) {
      for (let iy = Math.floor(Math.min(Z(a), Z(b)) / BS); iy <= Math.floor(Math.max(Z(a), Z(b)) / BS); iy += 1) {
        const k = `${ix},${iy}`; const l = buckets.get(k);
        if (l === undefined) buckets.set(k, [s]); else l.push(s);
      }
    }
  }
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  };
  const found = new Set<string>();
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const s = list[i]; const t = list[j];
        const [a, b] = segs[s]; const [c, d] = segs[t];
        if (a === c || a === d || b === c || b === d) continue;
        const o1 = o(X(a), Z(a), X(b), Z(b), X(c), Z(c));
        const o2 = o(X(a), Z(a), X(b), Z(b), X(d), Z(d));
        const o3 = o(X(c), Z(c), X(d), Z(d), X(a), Z(a));
        const o4 = o(X(c), Z(c), X(d), Z(d), X(b), Z(b));
        if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) {
          found.add(s < t ? `${s},${t}` : `${t},${s}`);
        }
      }
    }
  }
  return found.size;
}

interface Row { name: string; s: AlignedSeed['stats']; d: ReturnType<typeof debt>; plan: number; secs: number }
const rows: Row[] = [];
for (const [name, span] of [['A0 CONTROL  lever OFF', undefined], ['A1 ARM      span 50 um', 0.050]] as Array<[string, number | undefined]>) {
  const t = Date.now();
  const seed = build(span);
  const row: Row = { name, s: seed.stats, d: debt(seed), plan: planarityBreaks(seed), secs: (Date.now() - t) / 1000 };
  rows.push(row);
  const s = row.s;
  log('');
  log(`### ${name}   (${row.secs.toFixed(0)} s)`);
  log(`    points ${s.points}  tris ${s.tris}  constraints ${s.constraints}/${s.constraintsRecovered}`
    + `  decimated ${s.decimated}  degenerate-dropped ${s.degenerateDropped}`);
  log(`    *** re-solved ${s.chainResolved}  refused ${s.chainResolveRefused} ***`);
  log(`    census: overCap ${s.overCap}  worstAR ${s.worstAR.toFixed(2)}  negArea ${s.negArea}`
    + `   PSLG planarity breaks ${row.plan}`);
  log(`    actionable ${row.d.actionable}   in-band conformed ${row.d.conformed}   in-band DEFERRED ${row.d.deferred}`);
  log(`    >>> REAL DEBT (actionable + deferred) ${row.d.actionable + row.d.deferred} / ${row.d.tested} edges <<<`);
}

const [c, a] = rows;
log('');
log('══════════════════════════════ VERDICT ══════════════════════════════');
const inert = c.s.points === 116931 && c.s.tris === 233062 && c.s.constraints === 12806
  && c.s.decimated === 21686 && c.s.overCap === 3 && c.d.actionable === 9363
  && c.s.chainResolved === 0;
log(`P1 INERTNESS — control vs S47CAV: points ${c.s.points}/116931  tris ${c.s.tris}/233062`
  + `  constraints ${c.s.constraints}/12806  decimated ${c.s.decimated}/21686  overCap ${c.s.overCap}/3`
  + `  actionable ${c.d.actionable}/9363  re-solved ${c.s.chainResolved}/0`);
log(`   ⇒ ${inert ? 'INERT — the default path is unchanged.' : '*** NOT INERT — the new parameter perturbs the default path. BLOCKER. ***'}`);
const sg = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
const dbtC = c.d.actionable + c.d.deferred; const dbtA = a.d.actionable + a.d.deferred;
log('');
log('metric                     control        arm         Δ');
const row = (n: string, x: number, y: number): void =>
  log(`${n.padEnd(24)} ${String(x).padStart(9)} ${String(y).padStart(10)}   ${sg(y - x)}`);
row('actionable crossings', c.d.actionable, a.d.actionable);
row('in-band conformed', c.d.conformed, a.d.conformed);
row('in-band DEFERRED', c.d.deferred, a.d.deferred);
row('REAL DEBT', dbtC, dbtA);
row('PSLG planarity breaks', c.plan, a.plan);
row('overCap facets', c.s.overCap, a.s.overCap);
row('points', c.s.points, a.s.points);
row('tris', c.s.tris, a.s.tris);
log(`worstAR                  ${c.s.worstAR.toFixed(2).padStart(9)} ${a.s.worstAR.toFixed(2).padStart(10)}`);
log('');
log(`P2 EFFECT   actionable ${((100 * (a.d.actionable - c.d.actionable)) / Math.max(1, c.d.actionable)).toFixed(1)}%`
  + `   (S33 predicted -85% from the un-retriangulated stand-in)`);
log(`P3 SHAPE    overCap ${c.s.overCap} -> ${a.s.overCap}, worstAR ${c.s.worstAR.toFixed(2)} -> ${a.s.worstAR.toFixed(2)}`
  + `   (S33's folds 5 / worstAR 208 were the no-retriangulation artefact)`);
log(`P4 PLANARITY ${a.plan}`);
log(`P5 COST     points ${sg(a.s.points - c.s.points)}, tris ${sg(a.s.tris - c.s.tris)}`);
log('');
log('READ IT LIKE THIS:');
log('  P1 fails                       ⇒ STOP. Nothing else in the table means anything.');
log('  P2 big, P3 flat, P4 zero       ⇒ SHIP-CANDIDATE. Next and ONLY next: one mesher arm, to see');
log('    whether -85% at the seed survives refinement and reaches the STL. Everything so far is');
log('    seed-stage; no mesh has been built and no fidelity number has been earned.');
log('  P3 degrades                    ⇒ BLOCKER, not a rounding difference. The re-solve is making');
log('    geometry the repair rounds cannot fix, and the span or the skip rules are wrong.');
log('  deferred flat                  ⇒ EXPECTED (S33: -3.3%). §4.3 owns that half.');
