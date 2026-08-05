// s90selSound.ts — S90 TASK 3. WHAT GUARANTEE IS LEFT, AND IS THERE A SOUND ONE-SIDED ORIENTATION TEST?
//
// Reads the `*.cost.ndjson` written by s90selCost.ts. NO new rA evaluations — pure re-analysis, so nothing
// here can be contaminated by a second measurement of a different thing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED (S90_SELECTOR_FINDINGS.md §0, H-S90-4). This file adds the kappa sweep the pre-registration
// named as the missing piece: `theta_witnessed` is a LOWER bound on the true max normal turn, so the sound
// form of the bound is
//        dist(facet, S)  <=  tan( theta_witnessed + kappa * cov_orient ) * covRadius
// where `cov_orient` is orientRuler's EXACT covering radius of the order-k lattice in the (rRef*theta, z)
// parameter metric (it already includes the corner strip the inset leaves uncovered) and `kappa` is the
// Lipschitz constant of the Gauss map in that same metric, 1/mm.
//
// TWO QUESTIONS, BOTH ANSWERABLE FROM THE RECORDED COLUMNS:
//   (Q1) What kappa would each facet REQUIRE for the bound to cover its own measured `witnessed`?
//        kappa_req = ( atan(w / covRadius) - theta_witnessed ) / cov_orient .
//        The distribution of kappa_req over the mesh is the honest price of soundness.
//   (Q2) At each candidate kappa: how many facets does the SOUND test clear, do any of them hold a
//        measured exceedance (an UNSOUND CLEAR — one is a refutation), and what does it cost end to end?
//
// ── AND A CAVEAT THAT IS LOAD-BEARING, STATED BEFORE ANY NUMBER ───────────────────────────────────────
// `certifyTriangle.witnessed` is NOT a clean lower bound on the facet's true max error. `_certComposeLib`'s
// own D2-A amendment: *"witCpu IS NOT A LOWER BOUND ON ANYTHING. It is certifyTriangle's per-point reading,
// produced by a LOCAL descent seeded at the radial foot, and it is an UPPER bound on dist(p,S)"* — and on
// the very mesh that arm certifies, four of the published top-8 collapse under a global confirm
// (78.350 -> 17.876, 69.010 -> 9.701, 59.630 -> 13.924, 53.110 -> 28.750). So a "violation" here may be the
// POSITION ruler over-reading rather than the orientation bound under-reading, and kappa_req computed from
// it is an UPPER estimate of the kappa actually required. Stated, not corrected — correcting it needs the
// global confirm, which is not run here.
//
// Usage:  bash research/tools/run-s90sel-sound.sh
//   env:  PF_S90S_SETS (comma list `tag=path`)   PF_S90S_BAR_UM(10)
import { readFileSync, existsSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const BAR = Number(process.env.PF_S90S_BAR_UM ?? 10);
const D = 'research/exchange/_strataConformBisect/s90sel';
const SETS = (process.env.PF_S90S_SETS ?? `C2S39CTL=${D}/C2S39CTL.cost.ndjson,s90VORc=${D}/s90VORc.cost.ndjson`).split(',');

interface Row {
  k: number; area: number; diam: number; covR: number;
  w: number; b: number; v: number; c: 0 | 1; cn: number; csamp: number; cEv: number; cMs: number;
  oRad: number[]; oUm: number[]; oCov: number[]; oEv: number[]; soundUB: number;
}
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);

log('===== S90 TASK 3 — THE SOUND ONE-SIDED ORIENTATION TEST: what kappa does it need, and what does it buy? =====');
log(`bar ${BAR} um`);

for (const spec of SETS) {
  const [tag, path] = spec.split('=');
  if (!existsSync(path)) { log(`-- ${tag}: NOT PRESENT (${path})`); continue; }
  const rows: Row[] = [];
  for (const ln of readFileSync(path, 'utf8').split('\n')) {
    if (ln.length < 3) continue;
    try { rows.push(JSON.parse(ln) as Row); } catch { /* live writer tail */ }
  }
  if (rows.length === 0) { log(`-- ${tag}: 0 rows`); continue; }
  const n = rows.length;
  const blind = sum(rows.map((r) => r.cEv));
  const KS = rows[0].oEv.map((e) => Math.round((Math.sqrt(8 * (e / 5) + 1) - 3) / 2));
  log('');
  log(`══════ ${tag} — ${n} facets, blind certificate ${blind} rA evals (mean ${(blind / n).toFixed(0)}/facet) ══════`);
  log(`   PROVEN-FAIL (w > ${BAR} um) ${rows.filter((r) => r.v === 1).length}   selector orders k = [${KS.join(',')}] at [${rows[0].oEv.join(',')}] evals`);

  for (let i = 0; i < KS.length; i += 1) {
    // ── Q1 — the kappa each facet REQUIRES.
    const kreq: number[] = [];
    for (const r of rows) {
      const th = r.oRad[i]; const cv = r.oCov[i];
      if (!Number.isFinite(th) || !(cv > 0) || !(r.covR > 0)) continue;
      const need = Math.atan(Math.min(1e6, r.w / 1000 / r.covR));   // the turn that would explain w
      kreq.push(Math.max(0, (need - th) / cv));
    }
    const sk = S(kreq);
    log('');
    log(`   ── k=${KS[i]} (${rows[0].oEv[i]} evals/facet) ──`);
    log(`      Q1 kappa REQUIRED for soundness (1/mm):  p50 ${pq(sk, 0.5).toFixed(4)}  p90 ${pq(sk, 0.9).toFixed(3)}  p99 ${pq(sk, 0.99).toFixed(3)}  p99.9 ${pq(sk, 0.999).toFixed(3)}  MAX ${sk[sk.length - 1].toFixed(3)}   (0 required on ${((100 * kreq.filter((v) => v === 0).length) / kreq.length).toFixed(2)}% of facets)`);

    // ── Q2 — the kappa sweep.
    const KAPPAS = [0, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, sk[sk.length - 1]];
    log('      Q2 kappa sweep — SOUND test `tan(theta + kappa*cov) * covRadius <= bar` clears:');
    for (const kap of KAPPAS) {
      let cleared = 0; let clearedCost = 0; let unsound = 0; let unsoundWorst = 0;
      for (const r of rows) {
        const th = r.oRad[i]; if (!Number.isFinite(th)) continue;
        const ang = Math.min(1.5533, th + kap * r.oCov[i]);            // clamp below pi/2
        const ub = Math.tan(ang) * r.covR * 1000;
        if (ub <= BAR) {
          cleared += 1; clearedCost += r.cEv;
          if (r.w > BAR) { unsound += 1; if (r.w > unsoundWorst) unsoundWorst = r.w; }
        }
      }
      const tot = rows[0].oEv[i] * n + (blind - clearedCost);
      log(`         kappa ${kap.toFixed(3).padStart(8)}   clears ${String(cleared).padStart(6)}/${n} (${((100 * cleared) / n).toFixed(2)}%) holding ${((100 * clearedCost) / blind).toFixed(2)}% of cost   *** UNSOUND CLEARS ${unsound} (worst w ${unsoundWorst.toFixed(1)} um) ***   end-to-end ${(blind / Math.max(1, tot)).toFixed(2)}x`);
    }
  }

  // ── THE DEPLOYABLE RULE, as opposed to the FITTED one.
  //
  //    S88's f = 0.86% / 4.68% / 5.03% are the fraction-tested at a threshold CHOSEN AGAINST THE ANSWER —
  //    the smallest top-f that happens to capture 90% of the failures on that very mesh. In production the
  //    answer is not available, so the only deployable cut is a FIXED one, and the only fixed one with any
  //    justification is the containment rule S88/S90 actually measured: *** o2 <= bar => skip ***.
  //    Priced here at several fixed thresholds, with UNSOUND CLEARS (a skipped facet that in fact fails) as
  //    the correctness column. THIS is the number a stage-0 triage would deliver.
  log('');
  log(`   *** THE DEPLOYABLE FIXED-THRESHOLD RULE (skip if o2 <= T), vs S88's answer-fitted top-f ***`);
  for (let i = 0; i < KS.length; i += 1) {
    const line: string[] = [];
    for (const T of [BAR, 2 * BAR, 5 * BAR, 10 * BAR]) {
      let skip = 0; let skipCost = 0; let unsound = 0; let worst = 0;
      for (const r of rows) {
        if (r.oUm[i] <= T) {
          skip += 1; skipCost += r.cEv;
          if (r.w > BAR) { unsound += 1; if (r.w > worst) worst = r.w; }
        }
      }
      const tot = rows[0].oEv[i] * n + (blind - skipCost);
      line.push(`T=${T}um: skip ${((100 * skip) / n).toFixed(1)}% holding ${((100 * skipCost) / blind).toFixed(2)}% of cost, UNSOUND ${unsound} (worst ${worst.toFixed(1)}um) => ${(blind / Math.max(1, tot)).toFixed(2)}x`);
    }
    log(`      k=${KS[i]}   ${line.join('   ')}`);
  }

  // ── WHERE THE CERTIFICATE'S OWN MONEY GOES — free, from columns already recorded.
  //
  //    `csamp` counts LATTICE POINTS walked (1 rA each in pass 1, 1 in pass 2), so `cEv - csamp` is the
  //    TIGHTENING budget (descent 40 + Newton + closure walls). And `cn` is the FINAL lattice level against
  //    a SEED level of `ceil(covRadius/tol)`. The seed matters because `certifyTriangle` sets
  //    `thresh = tol - cov/n`, so AT THE SEED LEVEL thresh ~ 0 and EVERY lattice point is pushed into the
  //    tightening tier. Each doubling is the only thing that makes the threshold bite.
  {
    const tight = rows.map((r) => Math.max(0, r.cEv - r.csamp));
    const seedN = rows.map((r) => Math.min(512, Math.max(2, Math.ceil((r.covR / 0.010)))));
    const dbl = rows.map((r, q) => (seedN[q] > 0 ? Math.log2(Math.max(1, r.cn / seedN[q])) : 0));
    const sd = S(dbl);
    log('');
    log(`   CERTIFICATE INTERNALS (free, from the recorded columns):`);
    log(`      TIGHTENING is ${((100 * sum(tight)) / blind).toFixed(2)}% of all rA evals; the lattice walk is ${((100 * sum(rows.map((r) => r.csamp))) / blind).toFixed(2)}%   <= S50 measured tighten at 95.22%`);
    log(`      levels above the seed (log2(finalN/seedN)):  p50 ${pq(sd, 0.5).toFixed(2)}  p90 ${pq(sd, 0.9).toFixed(2)}  max ${sd[sd.length - 1].toFixed(2)}   seedN p50 ${S(seedN)[Math.floor(0.5 * seedN.length)]}  finalN p50 ${S(rows.map((r) => r.cn))[Math.floor(0.5 * n)]}  finalN max ${Math.max(...rows.map((r) => r.cn))}`);
    log(`      facets that hit nMax (n = 512): ${rows.filter((r) => r.cn >= 512).length}   witnessedComplete=false: ${rows.filter((r) => r.c === 0).length}`);
  }

  // ── WHERE THE COST ACTUALLY LIVES — the decile table that decides every triage question on this mesh.
  const byCost = rows.slice().sort((a, b) => b.cEv - a.cEv);
  let acc = 0; const marks = [0.001, 0.005, 0.01, 0.05, 0.10, 0.25, 0.50];
  const out: string[] = [];
  let mi = 0;
  for (let q = 0; q < byCost.length; q += 1) {
    acc += byCost[q].cEv;
    while (mi < marks.length && q + 1 >= marks[mi] * n) { out.push(`top ${(100 * marks[mi]).toFixed(1)}% of facets = ${((100 * acc) / blind).toFixed(1)}% of cost`); mi += 1; }
  }
  log('');
  log(`   COST CONCENTRATION (why a count-based triage is not a cost-based one):`);
  log(`      ${out.join('   ')}`);
  const bigCov = S(rows.map((r) => r.covR));
  log(`      covRadius  p50 ${pq(bigCov, 0.5).toFixed(4)} mm  p99 ${pq(bigCov, 0.99).toFixed(4)} mm  max ${bigCov[bigCov.length - 1].toFixed(4)} mm   (certificate lattice level n = ceil(covR/tol), cost ~ n^2)`);
}
log('');
log('done');
