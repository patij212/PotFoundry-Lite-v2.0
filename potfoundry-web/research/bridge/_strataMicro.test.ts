/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * STRATA MICRO — THE FUNDAMENTAL-DOMAIN CAUSAL PROBE. `PF_MICRO=1`, INERT BY DEFAULT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * WHY A SMALL SECTION IS NOT A SAMPLE HERE, AND THIS IS THE WHOLE JUSTIFICATION FOR THE FILE.
 * GothicArches is 12-fold symmetric (`gaCounts` 12). The Phase D residual, folded into ONE 30-degree
 * sector, puts 27% of all 14,348 interior over-tolerance facets into 2 of 24 bins — the sector MIDLINE —
 * and every one of the 12 sectors carries the class. So one sector is a FUNDAMENTAL DOMAIN of the defect,
 * not a subset of it, and a statement proven inside it is a statement about the whole wall modulo the
 * symmetry group. That is what makes a 60-second probe admissible where a 54-minute certificate was not.
 *
 * WHAT IT PROVES, AND WHY THE CAMPAIGN HAS NEVER MEASURED IT. Every arm so far has measured the residual
 * (which facets are wrong) and the refusals (which splits were declined) as SEPARATE populations, on the
 * whole mesh, and Phase D showed they barely intersect — 5 of 14,569. Nobody has joined them AT A FACET,
 * because the join needs a per-facet counterfactual (split it and re-certify) that costs O(2^depth)
 * certifications and is unaffordable at 1.26 M facets. In one sector it is affordable, and it converts
 * every correlation this campaign holds into a per-facet causal verdict.
 *
 * THE TRICHOTOMY. For each over-tolerance facet, exactly one of these is true, and each is decidable:
 *   ACCEPTED-BLIND  the driver's OWN accept quantity (max `edgeSagRaw` over the three edges, the value
 *                   `triangleNeed` compares against `acceptTol`) is UNDER the bar while the certified H1
 *                   bound is over it. The driver, re-run on the mesh it shipped, ACCEPTS this facet again.
 *                   Nothing refused it; nothing ran out. It is accepted while wrong.
 *   WANTS-SPLIT     the accept quantity is over the bar, so the driver would try to refine. Whether it
 *                   MAY is then T3's question.
 *   (and T2 asks, of both) is the facet reachable by bisection at all, and at what depth.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED. This measures the driver's ruler ON THE SHIPPED MESH, in f32, not at
 * strand time in f64. S26 established those differ (keyUm 14.0815 vs sagNowUm 20.9242, x1.49) and S27
 * spent an arm on the difference. So no history is reconstructed and no trajectory claim is made. The
 * claim is about the FIXED POINT and it is strictly stronger for the purpose: a driver re-run on this mesh
 * would ship these facets again, whatever it did the first time.
 *
 * DISCIPLINE. NEW FILE ONLY. Every instrument is imported read-only — the rulers are the driver's own
 * extracted modules (`edgeSagRaw` from `_sweepPredicate`, `aspect3` from `_shapeGuard`), not
 * transcriptions, so there is no second copy to drift. No shared file is edited and nothing here can move
 * a gate. Inert unless `PF_MICRO=1`.
 */
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { certifyTriangle, detectThetaJumps, detectZJumps } from './_facetTruthLib';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { locateKinkRaw, canonTheta, dThRaw, type SweepPredConst } from './_sweepPredicate';
import { makeSagArgmax } from './_sagKernel';
import {
  TWO_PI, type Tri, type PlacePolicy, driverAcceptQuantity, edgeAcceptQuantity,
  cascade, probeSurface, bruteDist,
} from './_strataMicroLib';

const RUN = process.env.PF_MICRO === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envI = (n: string, d: number): number => Math.round(envF(n, d));
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
const um = (mm: number): string => (Number.isFinite(mm) ? (mm * 1000).toFixed(3) : 'inf');

/** A triangle carried in BOTH representations: lifted 3-D, and (theta,z) unwrapped relative to vertex A. */
interface ResidualRow {
  tri: number; witnessedUm: number; boundUm: number; owner: string;
  ar: number; longestUm: number; zMin: number; zMax: number; theta: number;
}

describe('STRATA MICRO — fundamental-domain causal probe', () => {
  it.runIf(RUN)('decides, per facet, WHY each over-tolerance facet survived', () => {
    const stlPath = process.env.PF_MICRO_STL
      ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.stl';
    const residPath = process.env.PF_MICRO_RESID
      ?? 'research/exchange/_strataCertD/CERTD_S24i2.residual2.json';
    const STYLE = process.env.PF_MICRO_STYLE ?? 'GothicArches';
    const TOL = envF('PF_MICRO_TOL_UM', 10) / 1000;
    // _S24i2's OWN header value, not the code default (7). A probe that scores a mesh against a tolerance
    // that mesh was not built to is measuring nothing.
    const ACCEPT = envF('PF_MICRO_ACCEPT_UM', 3.5) / 1000;
    const REF_HS = envF('PF_MICRO_REF_HS_MM', 0.03);       // sagAdaptive absolute pitch, per the header
    const REF_NMIN = envI('PF_MICRO_REF_NMIN', 12);
    const REF_NMAX = envI('PF_MICRO_REF_NMAX', 64);
    const AR_CAP = envF('PF_MICRO_AR_CAP', 50);            // the driver's PF_CB_SHAPE_AR default
    const Z0 = envF('PF_MICRO_Z0', 79);
    const Z1 = envF('PF_MICRO_Z1', 83);
    const FOLD = envI('PF_MICRO_FOLD', 12);                // gaCounts — the symmetry order
    const SECTOR = envI('PF_MICRO_SECTOR', -1);            // -1 = pick the densest automatically
    const NCASC = envI('PF_MICRO_CASCADE', 16);
    const DEPTH = envI('PF_MICRO_DEPTH', 9);
    const AR_GUARD = envF('PF_MICRO_AR_GUARD', 8);         // the driver's PF_CB_AR edge-candidacy guard
    const SNAP_ALPHA = envF('PF_MICRO_SNAP_ALPHA', 0.12);  // PF_CB_SNAP_ALPHA :143
    const NMAX = envI('PF_MICRO_NMAX', 512);               // certifyTriangle lattice ceiling
    const OUT = process.env.PF_MICRO_OUT ?? join('research', 'exchange', '_strataMicro');
    const TAG = process.env.PF_MICRO_TAG ?? 'MICRO';

    // THE DRIVER'S PREDICATE CONSTANTS, at the defaults the shipped mesh was built with. These are read
    // from `_strataConformBisect.test.ts`'s own declared defaults (PF_CB_ESN 8, PF_CB_REF_HS 0.02 mm,
    // PF_CB_REF_NMAX 64, kink scan/halvings/ratios, PF_CB_SNAP on, PF_CB_CONF_UM 0.6) so the accept
    // quantity computed here is the same double the driver compares against acceptTol.
    // TRANSCRIBED FROM `_strataConformBisect.test.ts`'s OWN DECLARED DEFAULTS, line by line, not guessed:
    // ESN :526 = 8, REF_HS/NMIN/NMAX :517 = 0.03 / 12 / 64, KINK_RATIO :146 = 0.15, JUMP_RATIO :147 = 0.62,
    // KINK_SCAN :148 = 16, KINK_HALVINGS :149 = 24, SNAP_ALPHA :143 = 0.12, CONF_UM :144 = 0.6.
    const PRED: SweepPredConst = {
      esN: envI('PF_MICRO_ESN', 8),
      refHs: REF_HS,
      refNmax: REF_NMAX,
      kinkScan: envI('PF_MICRO_KINK_SCAN', 16),
      kinkHalvings: envI('PF_MICRO_KINK_HALVINGS', 24),
      kinkRatio: envF('PF_MICRO_KINK_RATIO', 0.15),
      jumpRatio: envF('PF_MICRO_JUMP_RATIO', 0.62),
      snap: process.env.PF_MICRO_SNAP !== '0',
      confMm: envF('PF_MICRO_CONF_UM', 0.6) / 1000,
    };

    mkdirSync(OUT, { recursive: true });
    const L: string[] = [];
    const say = (s: string): void => { L.push(s); /* eslint-disable-next-line no-console */ console.log(`[MICRO] ${s}`); };

    const t0 = Date.now();
    const styleParams = registryDefaults(STYLE);
    const auditR = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
    const rA = auditR.rA;
    const { xyz, nTri } = readMeshFloat64(stlPath, false);
    const zJumps = detectZJumps(rA, H);
    const thJumps = detectThetaJumps(rA, H);
    const resid = JSON.parse(readFileSync(residPath, 'utf8')) as { rows: ResidualRow[]; rowsAreComplete?: boolean; tolUm: number };
    const rows = resid.rows;

    say(`===== STRATA MICRO — ${STYLE} =====`);
    say(`stl ${stlPath}  (${nTri} facets)`);
    say(`residual ${residPath}  (${rows.length} rows, complete=${String(resid.rowsAreComplete ?? false)})`);
    say(`TOL ${um(TOL)} um   driver acceptTol ${um(ACCEPT)} um   AR cap ${AR_CAP}   fold ${FOLD}`);

    // ── SECTOR SELECTION. The window is one symmetry sector x one z band. Picked from the residual's own
    //    density when SECTOR is -1, so the choice is data-driven rather than an author's pick.
    const P = TWO_PI / FOLD;
    const inZ = (r: ResidualRow): boolean => r.zMin >= Z0 && r.zMax <= Z1 && r.owner !== 'rim-row';
    const secOf = (th: number): number => Math.floor((((th % TWO_PI) + TWO_PI) % TWO_PI) / P);
    let sector = SECTOR;
    if (sector < 0) {
      const cnt = new Array<number>(FOLD).fill(0);
      for (const r of rows) if (inZ(r)) cnt[secOf(r.theta)] += 1;
      sector = cnt.indexOf(Math.max(...cnt));
      say(`sector auto-selected: ${sector} of ${FOLD} (per-sector residual counts in z[${Z0},${Z1}]: ${cnt.join(' ')})`);
    }
    const thLo = sector * P; const thHi = thLo + P;
    say(`WINDOW  theta [${thLo.toFixed(5)}, ${thHi.toFixed(5)}]  z [${Z0}, ${Z1}]  = 1/${FOLD} sector x ${(Z1 - Z0).toFixed(1)} mm`);

    // ── Facets of the window, straight from the STL. Selection is by CENTROID so each facet lands in
    //    exactly one window and the counts are partitions rather than overlapping sets.
    const build = (t: number): Tri => {
      const o = t * 9;
      const th0 = canonTheta(Math.atan2(xyz[o + 1], xyz[o]));
      const th1raw = canonTheta(Math.atan2(xyz[o + 4], xyz[o + 3]));
      const th2raw = canonTheta(Math.atan2(xyz[o + 7], xyz[o + 6]));
      // theta UNWRAPPED against vertex A, exactly as the driver's `vth` + `dTh` pair behaves.
      return {
        x: [xyz[o], xyz[o + 3], xyz[o + 6]],
        y: [xyz[o + 1], xyz[o + 4], xyz[o + 7]],
        z: [xyz[o + 2], xyz[o + 5], xyz[o + 8]],
        th: [th0, th0 + dThRaw(th0, th1raw), th0 + dThRaw(th0, th2raw)],
      };
    };
    const inWindow: number[] = [];
    for (let t = 0; t < nTri; t += 1) {
      const o = t * 9;
      const zc = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
      if (zc < Z0 || zc > Z1) continue;
      const cx = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
      const cy = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
      const thc = canonTheta(Math.atan2(cy, cx));
      if (thc < thLo || thc >= thHi) continue;
      inWindow.push(t);
    }
    const overSet = new Map<number, ResidualRow>();
    for (const r of rows) overSet.set(r.tri, r);
    const overInWindow = inWindow.filter((t) => overSet.has(t));
    say(`window holds ${inWindow.length} facets, of which ${overInWindow.length} are in the certified residual `
      + `(${(100 * overInWindow.length / Math.max(1, inWindow.length)).toFixed(3)}% of the window)`);

    // ═══ T0 — THE VERTEX RADIAL CONTROL. RUNS FIRST AND CAN INVALIDATE EVERYTHING BELOW IT. ═══
    // Every vertex was placed by `liftAt` at exactly r = rA(theta, z), so `|hypot(x,y) - rA(theta,z)|`
    // must be zero up to the STL's f32 quantisation (~5 nm at r ~ 45 mm). If it is not, then THIS FILE'S
    // rA is not the surface the mesh was built on, and every distance measured against it — mine and the
    // certificate's alike — is measured to the wrong surface. Cheap, unconditional, and reported before
    // any conclusion depends on it.
    {
      let worstUm = 0; let sumUm = 0; let n = 0; let worstTri = -1;
      const step = Math.max(1, Math.floor(inWindow.length / 400));
      for (let s = 0; s < inWindow.length; s += step) {
        const t = inWindow[s]; const o = t * 9;
        for (let k = 0; k < 3; k += 1) {
          const x = xyz[o + k * 3]; const y = xyz[o + k * 3 + 1]; const z = xyz[o + k * 3 + 2];
          const dr = Math.abs(Math.hypot(x, y) - rA(canonTheta(Math.atan2(y, x)), z)) * 1000;
          sumUm += dr; n += 1;
          if (dr > worstUm) { worstUm = dr; worstTri = t; }
        }
      }
      say('');
      say('--- T0  VERTEX RADIAL CONTROL — is this file\'s rA the surface the mesh was built on? ---');
      say(`  |hypot(x,y) - rA(theta,z)| over ${n} window vertices: mean ${(sumUm / Math.max(1, n)).toFixed(4)} um, `
        + `worst ${worstUm.toFixed(4)} um (tri ${worstTri})`);
      if (worstUm > envF('PF_MICRO_T0_BAR_UM', 1)) {
        say('  *** T0 FAILS. The vertices are NOT on this rA. Every number below is measured to the wrong');
        say('  *** surface and none of them may be quoted. This is the first thing to fix.');
      } else {
        say('  T0 PASSES — the vertices lie on this rA, so distances measured against it are meaningful.');
      }
    }

    // ═══ T1 — THE DRIVER'S OWN VERDICT, RECOMPUTED ON THE SHIPPED MESH ═══
    say('');
    say('--- T1  THE ACCEPT TEST, RE-RUN ON THE MESH IT PRODUCED ---');
    say(`      ruler = sagAdaptive(pitch ${REF_HS} mm, n in [${REF_NMIN},${REF_NMAX}]), the HEAP driver's own accept quantity`);
    say(`      bar   = ${um(ACCEPT)} um (the run header's acceptTol; PF_CB_TIGHTEN can only lower it, so this is the loosest bar)`);
    const arg = makeSagArgmax();
    let accBlind = 0; let wants = 0;
    let worstRatio = 0; let worstRatioTri = -1;
    const blindRatios: number[] = [];
    const perFacet: {
      tri: number; boundUm: number; accUm: number; edgeUm: number;
      ar: number; longestUm: number; verdict: string;
    }[] = [];
    for (const t of overInWindow) {
      const row = overSet.get(t) as ResidualRow;
      const tri = build(t);
      const acc = driverAcceptQuantity(rA, tri, REF_HS, REF_NMIN, REF_NMAX, arg);
      const edge = edgeAcceptQuantity(rA, tri, PRED);
      const verdict = acc <= ACCEPT ? 'ACCEPTED-BLIND' : 'WANTS-SPLIT';
      if (verdict === 'ACCEPTED-BLIND') {
        accBlind += 1;
        const ratio = row.boundUm / Math.max(acc * 1000, 1e-9);
        blindRatios.push(ratio);
        if (ratio > worstRatio) { worstRatio = ratio; worstRatioTri = t; }
      } else wants += 1;
      perFacet.push({
        tri: t, boundUm: row.boundUm, accUm: acc * 1000, edgeUm: edge * 1000,
        ar: row.ar, longestUm: row.longestUm, verdict,
      });
    }
    const pct = (n: number): string => `${(100 * n / Math.max(1, overInWindow.length)).toFixed(2)}%`;
    say(`  ACCEPTED-BLIND : ${accBlind}  (${pct(accBlind)})  <- the driver would accept these again, today`);
    say(`  WANTS-SPLIT    : ${wants}  (${pct(wants)})`);
    if (blindRatios.length > 0) {
      blindRatios.sort((a, b) => a - b);
      const q = (p: number): number => blindRatios[Math.min(blindRatios.length - 1, Math.floor(p * blindRatios.length))];
      say(`  blindness ratio (certified bound / driver's own accept reading): `
        + `p50 ${q(0.5).toFixed(1)}x  p90 ${q(0.9).toFixed(1)}x  MAX ${worstRatio.toFixed(1)}x (tri ${worstRatioTri})`);
    }

    // ═══ T4 — THE SURFACE PROBE. Runs BEFORE the cascade because it does not depend on a refiner. ═══
    const worstForProbe = [...perFacet].sort((a, b) => b.boundUm - a.boundUm).slice(0, envI('PF_MICRO_PROBE', 24));
    say('');
    say('--- T4  WHAT IS THE SURFACE DOING INSIDE THESE FACETS?  (no mesher involved) ---');
    say(`      lattice n=${envI('PF_MICRO_PROBE_N', 192)}, second-difference base step ${envF('PF_MICRO_PROBE_H_UM', 40)} um`);
    say('');
    say('     tri    boundUm  probeUm  where              class    D2 at h, h/2, h/4, h/8 (um)          fall factors');
    const clsCount: Record<string, number> = { SMOOTH: 0, CREASE: 0, JUMP: 0, MIXED: 0 };
    const probeOut: Record<string, unknown>[] = [];
    for (const f of worstForProbe) {
      const p = probeSurface(rA, build(f.tri), envI('PF_MICRO_PROBE_N', 192), envF('PF_MICRO_PROBE_H_UM', 40) / 1000);
      clsCount[p.cls] += 1;
      const where = p.nearVertex ? 'VERTEX' : p.onEdge ? 'edge' : 'INTERIOR';
      say(`  ${String(f.tri).padStart(8)} ${f.boundUm.toFixed(2).padStart(9)} ${p.maxDevUm.toFixed(2).padStart(8)}  ${where.padEnd(9)} `
        + `${p.cls.padEnd(8)} ${p.d2.map((v) => v.toFixed(3).padStart(9)).join(' ')}   `
        + `${p.ratios.map((v) => v.toFixed(2).padStart(5)).join(' ')}`);
      probeOut.push({ tri: f.tri, boundUm: f.boundUm, ...p });
    }
    say('');
    say(`  CLASS CENSUS over the ${worstForProbe.length} worst facets of the window: `
      + Object.entries(clsCount).map(([k, v]) => `${k} ${v}`).join('   '));
    say('  SMOOTH => density closes it and only the accept test let it live.  CREASE => placement ON the locus closes it.');
    say('  JUMP   => no flat triangle chords it at any density.');

    // ═══ T5 — ADJUDICATE THE 55x DISAGREEMENT BY BRUTE FORCE ═══
    if (process.env.PF_MICRO_ADJ !== '0') {
      const nTh = envI('PF_MICRO_ADJ_NTH', 1440);
      const nZ = envI('PF_MICRO_ADJ_NZ', 960);
      const rounds = envI('PF_MICRO_ADJ_ROUNDS', 4);
      say('');
      say('--- T5  ADJUDICATION: certifyTriangle vs BRUTE-FORCE distance from its own witness point ---');
      say(`      global lattice ${nTh}x${nZ} then ${rounds} window refinements. No seed, no descent, no basin choice.`);
      say('');
      // ── NEGATIVE CONTROL, RUN BEFORE THE MEASUREMENT AND ALLOWED TO INVALIDATE IT ──
      // Every mesh vertex was LIFTED onto the surface by the mesher, so its true distance to the surface is
      // zero up to the STL's f32 quantisation (~5 nm at r≈45 mm). If this brute force cannot read ~0 on a
      // vertex it KNOWS is on the surface, then it cannot be trusted to read 22 um on an interior point
      // either, and the adjudication below means nothing. This control fires FIRST and says so.
      let ctlWorstUm = 0;
      for (const f of worstForProbe.slice(0, envI('PF_MICRO_ADJ_N', 12))) {
        const tri = build(f.tri);
        for (let k = 0; k < 3; k += 1) {
          const c = bruteDist(rA, tri.x[k], tri.y[k], tri.z[k], H, nTh, nZ, rounds);
          if (c.d * 1000 > ctlWorstUm) ctlWorstUm = c.d * 1000;
        }
      }
      const CTL_BAR = envF('PF_MICRO_ADJ_CTL_UM', 0.5);
      say(`  [CONTROL] brute-force distance from the facets' OWN VERTICES to the surface: worst ${ctlWorstUm.toFixed(4)} um`
        + `  (bar ${CTL_BAR} um — these points are ON the surface by construction)`);
      if (ctlWorstUm > CTL_BAR) {
        say('  *** CONTROL FAILS — the brute force cannot find the surface under a point known to be on it.');
        say('  *** THE ADJUDICATION BELOW IS VOID. Fix the probe before reading a single row.');
      } else {
        say('  [CONTROL] PASSES — the brute force finds the surface to sub-micron under known-on-surface points.');
      }
      say('');
      // THE POPULATION, not the tail: `PF_MICRO_ADJ_ALL=1` adjudicates every over-tolerance facet in the
      // window. The tail alone cannot answer "how much of the residual is real" — facets sitting just over
      // the bar are exactly the ones an over-stating witness would have INVENTED.
      const adjPool = process.env.PF_MICRO_ADJ_ALL === '1'
        ? [...perFacet].sort((a, b) => b.boundUm - a.boundUm)
        : worstForProbe;
      say(`     tri   certWitnessUm   bruteUm    ratio   pitchUm  verdict     (adjudicating ${Math.min(adjPool.length, envI('PF_MICRO_ADJ_N', 12))} facets)`);
      let nAgree = 0; let nOver = 0; let worstOver = 0;
      let trueOver = 0; let certOver = 0; const ratios: number[] = [];
      const adjOut: Record<string, unknown>[] = [];
      const SHOW = envI('PF_MICRO_ADJ_SHOW', 20);
      let shown = 0;
      for (const f of adjPool.slice(0, envI('PF_MICRO_ADJ_N', 12))) {
        const tri = build(f.tri);
        const v = certifyTriangle(rA, tri.x[0], tri.y[0], tri.z[0], tri.x[1], tri.y[1], tri.z[1],
          tri.x[2], tri.y[2], tri.z[2], { H, tol: TOL, nMax: NMAX, zJumps, thJumps });
        const b = bruteDist(rA, v.px, v.py, v.pz, H, nTh, nZ, rounds);
        const certUm = v.witnessed * 1000; const brUm = b.d * 1000;
        const ratio = certUm / Math.max(brUm, 1e-9);
        // "agrees" = within 10% or 1 um, whichever is looser; anything else is an OVER-STATEMENT by cert
        const agrees = Math.abs(certUm - brUm) <= Math.max(1, 0.1 * brUm);
        if (agrees) nAgree += 1; else { nOver += 1; if (ratio > worstOver) worstOver = ratio; }
        ratios.push(ratio);
        if (certUm > TOL * 1000) certOver += 1;
        if (brUm > TOL * 1000) trueOver += 1;
        if (shown < SHOW) {
          shown += 1;
          say(`  ${String(f.tri).padStart(8)} ${certUm.toFixed(3).padStart(13)} ${brUm.toFixed(3).padStart(9)} `
            + `${ratio.toFixed(2).padStart(8)}x ${b.pitchUm.toFixed(4).padStart(9)}  ${agrees ? 'AGREE' : '*** CERT OVER-STATES ***'}`);
        }
        adjOut.push({ tri: f.tri, certWitnessUm: certUm, bruteUm: brUm, ratio, pitchUm: b.pitchUm, agrees });
      }
      say('');
      say(`  AGREE ${nAgree}   CERT OVER-STATES ${nOver}   worst over-statement ${worstOver.toFixed(2)}x`);
      if (ratios.length > 0) {
        ratios.sort((a, b) => a - b);
        const q = (p: number): number => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))];
        say(`  over-statement ratio: p10 ${q(0.1).toFixed(2)}x  p50 ${q(0.5).toFixed(2)}x  p90 ${q(0.9).toFixed(2)}x`);
      }
      say('');
      say(`  *** THE RESIDUAL, RE-COUNTED HONESTLY ON THIS SAMPLE ***`);
      say(`      facets the CERTIFICATE calls over ${um(TOL)} um : ${certOver} / ${adjOut.length}`);
      say(`      facets that TRULY are, by brute force  : ${trueOver} / ${adjOut.length}`);
      say(`      => ${certOver - trueOver} of ${certOver} (${(100 * (certOver - trueOver) / Math.max(1, certOver)).toFixed(1)}%) `
        + `are counted by an over-stating witness and are NOT over tolerance.`);
      writeFileSync(join(OUT, `${TAG}.adjudicate.json`), JSON.stringify(adjOut, null, 1), 'utf8');

      // ═══ T6 — THE HONEST FACET MAX, AND WHY T5 ALONE COULD NOT GIVE IT ═══
      // T5 proves the value certifyTriangle reports AT ITS OWN WITNESS POINT is inflated. It does NOT
      // prove the facet is under tolerance, because the facet's true maximum may sit somewhere the witness
      // never looked. So: sweep a barycentric lattice over the facet and brute-force EVERY sample, taking
      // the max. Local-only search (projection seed, no global scan) is used per sample — validated below
      // against the global answer on the same facets — because a point on a facet whose three vertices lie
      // on the surface is never in a far basin, and 325 global scans per facet is not affordable.
      if (process.env.PF_MICRO_T6 !== '0') {
        const nBary = envI('PF_MICRO_T6_N', 24);
        const t6n = envI('PF_MICRO_T6_FACETS', 60);
        say('');
        say(`--- T6  HONEST FACET MAX: brute force at every point of a barycentric lattice (n=${nBary}) ---`);
        // validation: local-only must reproduce the global answer at the witness points measured above
        let vWorst = 0;
        for (const a of adjOut.slice(0, 6)) {
          const tri = build(a.tri as number);
          const v = certifyTriangle(rA, tri.x[0], tri.y[0], tri.z[0], tri.x[1], tri.y[1], tri.z[1],
            tri.x[2], tri.y[2], tri.z[2], { H, tol: TOL, nMax: NMAX, zJumps, thJumps });
          const loc = bruteDist(rA, v.px, v.py, v.pz, H, nTh, nZ, rounds, 32, 8, false);
          vWorst = Math.max(vWorst, Math.abs(loc.d * 1000 - (a.bruteUm as number)));
        }
        say(`  [VALIDATION] local-only vs global-scan brute force on the same 6 witness points: max diff ${vWorst.toFixed(4)} um`);
        if (vWorst > 0.5) say('  *** VALIDATION FAILS — local-only search is not equivalent here. T6 is VOID.');
        const pool = adjOut.slice(0, t6n);
        let certOver6 = 0; let trueOver6 = 0; let worstTrueUm = 0; let worstTri6 = -1;
        const t6rows: Record<string, unknown>[] = [];
        for (const a of pool) {
          const tri = build(a.tri as number);
          const dB = dThRaw(tri.th[0], tri.th[1]); const dC = dThRaw(tri.th[0], tri.th[2]);
          let mx = 0;
          for (let i = 0; i <= nBary; i += 1) {
            for (let j = 0; j <= nBary - i; j += 1) {
              const wa = i / nBary; const wb = j / nBary; const wc = 1 - wa - wb;
              // the point ON THE FLAT TRIANGLE (not on the surface) — H1 measures from the mesh outward
              const qx = wa * tri.x[0] + wb * tri.x[1] + wc * tri.x[2];
              const qy = wa * tri.y[0] + wb * tri.y[1] + wc * tri.y[2];
              const qz = wa * tri.z[0] + wb * tri.z[1] + wc * tri.z[2];
              void dB; void dC;
              const d = bruteDist(rA, qx, qy, qz, H, nTh, nZ, rounds, 32, 8, false).d * 1000;
              if (d > mx) mx = d;
            }
          }
          const certW = a.certWitnessUm as number;
          if (certW > TOL * 1000) certOver6 += 1;
          if (mx > TOL * 1000) trueOver6 += 1;
          if (mx > worstTrueUm) { worstTrueUm = mx; worstTri6 = a.tri as number; }
          t6rows.push({ tri: a.tri, certWitnessUm: certW, honestMaxUm: mx, ratio: certW / Math.max(mx, 1e-9) });
        }
        const rs = t6rows.map((r) => r.ratio as number).sort((x, y) => x - y);
        say(`  facets swept: ${pool.length}   worst HONEST max ${worstTrueUm.toFixed(3)} um (tri ${worstTri6})`);
        say(`  certifyTriangle witness / HONEST facet max: p10 ${rs[Math.floor(0.1 * rs.length)].toFixed(2)}x  `
          + `p50 ${rs[Math.floor(0.5 * rs.length)].toFixed(2)}x  p90 ${rs[Math.floor(0.9 * rs.length)].toFixed(2)}x`);
        say('');
        say('  *** THE RESIDUAL, RE-COUNTED AGAINST AN HONEST PER-FACET MAXIMUM ***');
        say(`      certificate says over ${um(TOL)} um : ${certOver6} / ${pool.length}`);
        say(`      honest maximum says over          : ${trueOver6} / ${pool.length}`);
        say(`      => ${certOver6 - trueOver6} of ${certOver6} (${(100 * (certOver6 - trueOver6) / Math.max(1, certOver6)).toFixed(1)}%) are NOT over tolerance`);
        writeFileSync(join(OUT, `${TAG}.honestmax.json`), JSON.stringify(t6rows, null, 1), 'utf8');
      }
    }

    // ═══ T7 — THE CONTINGENCY. Does crossing a crease PREDICT being over tolerance? ═══
    // T4 says the surface at the worst facets is a crease. T1 says the driver accepts them. Neither says
    // the two are connected. This does: over the SAME window, split every facet on one question — does any
    // of its three edges carry a located kink strictly inside it (`locateKinkRaw`, the driver's own
    // detector, non-jump, outside the SNAP band) — and cross-tabulate against over/under tolerance.
    // A control group in the same window at the same z, measured by the same instrument, is what turns
    // "the bad ones sit on creases" from an observation into an effect size.
    if (process.env.PF_MICRO_T7 !== '0') {
      const crossesCrease = (t: Tri): boolean => {
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
          const k = locateKinkRaw(rA, t.th[i], t.z[i], t.th[i] + dThRaw(t.th[i], t.th[j]), t.z[j], PRED);
          if (k !== null && !k.jump && k.t > 0.02 && k.t < 0.98) return true;
        }
        return false;
      };
      let a = 0; let b = 0; let c = 0; let d = 0; // over&cross, over&no, clean&cross, clean&no
      const capClean = envI('PF_MICRO_T7_CLEAN', 2000);
      let cleanSeen = 0;
      for (const t of inWindow) {
        const isOver = overSet.has(t);
        if (!isOver) { cleanSeen += 1; if (cleanSeen > capClean) continue; }
        const cr = crossesCrease(build(t));
        if (isOver) { if (cr) a += 1; else b += 1; } else if (cr) c += 1; else d += 1;
      }
      const pOver = a / Math.max(1, a + b); const pClean = c / Math.max(1, c + d);
      say('');
      say('--- T7  CONTINGENCY: does an edge crossing a crease predict being over tolerance? ---');
      say(`                        crosses a crease   does not     total    rate`);
      say(`  OVER tolerance   ${String(a).padStart(14)} ${String(b).padStart(12)} ${String(a + b).padStart(9)}   ${(100 * pOver).toFixed(1)}%`);
      say(`  under tolerance  ${String(c).padStart(14)} ${String(d).padStart(12)} ${String(c + d).padStart(9)}   ${(100 * pClean).toFixed(1)}%`);
      const rr = pOver / Math.max(pClean, 1e-9);
      say(`  RISK RATIO: a facet crossing a crease is ${rr.toFixed(2)}x as likely to be over tolerance`);
      const odds = (a * d) / Math.max(b * c, 1e-9);
      say(`  ODDS RATIO: ${odds.toFixed(2)}`);
    }

    // ═══ T2 + T3 — THE COUNTERFACTUAL, ON THE WORST FACETS OF THE WINDOW ═══
    say('');
    say('  *** CAVEAT ON T2/T3, STATED BEFORE ITS NUMBERS: this cascade is UNGUARDED — it COUNTS the splits');
    say('  *** the S1 cap would refuse (`gateBlocked`) but performs them anyway, and it sees only ONE side of');
    say('  *** each edge where `shapeAdmits` sees both. It is therefore an upper bound on what refinement can');
    say('  *** reach and a LOWER bound on what the gate refuses. It is NOT the production driver.');
    say(`--- T2/T3  COUNTERFACTUAL: bisect to closure, and ask whether the shape gate would have allowed it ---`);
    say(`      (depth cap ${DEPTH}, AR cap ${AR_CAP}; "leaves" is the triangle price of closing ONE facet)`);
    const worstFirst = [...perFacet].sort((a, b) => b.boundUm - a.boundUm).slice(0, NCASC);
    const arms: PlacePolicy[] = (process.env.PF_MICRO_PLACE ?? 'driver,param').split(',')
      .map((s) => s.trim()).filter((s) => s === 'param' || s === 'driver') as PlacePolicy[];
    const armStats: Record<string, { closed: number; blocked: number; worstAr: number }> = {};
    const cascadeOut: Record<string, unknown>[] = [];
    for (const policy of arms) {
      say('');
      say(`  ══ ARM '${policy}' ${policy === 'driver'
        ? '= DIRECTED + LONGFALL + MID3D + SNAP, the production placement rule'
        : '= longest edge, parametric midpoint (naive control)'} ══`);
      say('     tri    boundUm   accUm  ratio  edgeUm    AR  longestUm  verdict          depth leaves  closed  worstChildAR  gateBlocked  snaps');
      let closedCount = 0; let blockedAny = 0; let armWorstAr = 0;
      const depths: number[] = []; const leafPrices: number[] = [];
      for (const f of worstFirst) {
        const c = cascade(rA, build(f.tri), TOL, DEPTH, AR_CAP, zJumps, thJumps, policy, PRED, AR_GUARD, SNAP_ALPHA, NMAX);
        if (c.closed) { closedCount += 1; depths.push(c.depth); leafPrices.push(c.leaves); }
        if (c.gateBlocked > 0) blockedAny += 1;
        if (c.worstChildAr > armWorstAr) armWorstAr = c.worstChildAr;
        say(`  ${String(f.tri).padStart(8)} ${f.boundUm.toFixed(2).padStart(9)} ${f.accUm.toFixed(3).padStart(7)} `
          + `${(f.boundUm / Math.max(f.accUm, 1e-9)).toFixed(1).padStart(6)}x ${f.edgeUm.toFixed(2).padStart(7)} ${f.ar.toFixed(2).padStart(6)} `
          + `${f.longestUm.toFixed(1).padStart(9)}  ${f.verdict.padEnd(15)} ${String(c.depth).padStart(5)} `
          + `${String(c.leaves).padStart(6)}  ${(c.closed ? 'YES' : 'no').padStart(6)}  ${c.worstChildAr.toFixed(2).padStart(12)} `
          + `${String(c.gateBlocked).padStart(11)}  ${String(c.snaps).padStart(5)}`);
        say(`             worst certified bound by level (um): ${c.trace.map((v) => v.toFixed(1)).join(' -> ')}`);
        cascadeOut.push({ policy, tri: f.tri, ...c });
      }
      say('');
      say(`  ARM '${policy}': closed ${closedCount}/${worstFirst.length}   `
        + `AR-cap would refuse >=1 required split on ${blockedAny}/${worstFirst.length}   worst child AR ${armWorstAr.toFixed(1)}`);
      if (depths.length > 0) {
        const meanP = leafPrices.reduce((a, b) => a + b, 0) / leafPrices.length;
        say(`  ARM '${policy}': depth needed max ${Math.max(...depths)}, leaves per closed facet mean ${meanP.toFixed(1)} max ${Math.max(...leafPrices)}`);
      }
      armStats[policy] = { closed: closedCount, blocked: blockedAny, worstAr: armWorstAr };
    }
    const closedCount = armStats[arms[0]]?.closed ?? 0;
    const blockedAny = armStats[arms[0]]?.blocked ?? 0;

    const outJson = {
      schema: 'pf.strata.micro/1',
      stl: stlPath, residual: residPath, style: STYLE,
      tolUm: TOL * 1000, acceptTolUm: ACCEPT * 1000, arCap: AR_CAP,
      window: { fold: FOLD, sector, thetaLo: thLo, thetaHi: thHi, z0: Z0, z1: Z1 },
      counts: { windowFacets: inWindow.length, overTol: overInWindow.length, acceptedBlind: accBlind, wantsSplit: wants },
      cascade: { requested: NCASC, closed: closedCount, gateBlockedFacets: blockedAny, depthCap: DEPTH, arms: armStats },
      cascadeDetail: cascadeOut,
      surfaceProbe: { classCensus: clsCount, rows: probeOut },
      perFacet,
      wallSec: (Date.now() - t0) / 1000,
    };
    writeFileSync(join(OUT, `${TAG}.report.txt`), `${L.join('\n')}\n`, 'utf8');
    writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(outJson, null, 1), 'utf8');
    say('');
    say(`wall ${((Date.now() - t0) / 1000).toFixed(1)} s   rA evals ${auditR.evals()}`);
    writeFileSync(join(OUT, `${TAG}.report.txt`), `${L.join('\n')}\n`, 'utf8');
  }, 1_800_000);
});
