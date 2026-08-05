// s90selAnalyze.ts — S90 TASK 1 READOUT. Does S88's CONTAINMENT survive off GothicArches?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05 (S90_SELECTOR_FINDINGS.md §0), WRITTEN BEFORE THE FIRST ROW WAS READ.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// H-S90-1 (CONTAINMENT).  On Voronoi (base rate 10.50% vs Gothic's 0.29-3.55%), every honest-position
//      PROVEN-FAIL facet is ALSO over the 10 um orientation bar (S88 measured `posFail & orientOK = 0`
//      over 3,950 Gothic failures on five arms).
//      KILL: > 2.0% of Voronoi's position PROVEN-FAIL facets are orientation-OK at inset 0.02 (`o2 <= 10`).
//      Reported ALSO at inset 0, and ALSO by AREA — count over-states area 13-184x in this campaign.
//
// H-S90-2 (RECALL).  f at recall 0.90 stays small off Gothic.
//      KILL: f > 67% at recall 0.90 (S88's own bar; flat model 5 + 375*f vs 375 breaks even at f = 0.987).
//      *** THE FLAT MODEL IS REPORTED ONLY FOR COMPARABILITY WITH S88. It is measured WRONG by
//          s90selCost.ts: `orientOfFacet(k=8)` is 45 lattice points x 5 rA evals = 225 evals, not 5. ***
//
// CONTROLS
//  C-S90-1  NESTED-SAMPLE CROSS-TOOL. s85PosRebase's `goldenStride()` and s87LedgerReexam's inline
//           `goldenIdx` are the SAME construction, so rows 0..7999 of the s90VOR ndjson are EXACTLY the
//           8,000 facets S85 published on this mesh. They must reproduce 840 PROVEN-FAIL (10.500%) and
//           areaFail 1.30676%. A tool that cannot reproduce the published number is not admissible.
//  C-S90-4  SELECTOR NON-VACUITY. recall(f=100%) must be 1.000 and recall(f=0) must be 0.
//
// Usage:  bash research/tools/run-s90sel-analyze.sh
//   env:  PF_S90_NDJSON (comma list of `tag=path`)   PF_S90_BAR_UM(10)   PF_S90_CTRLN(8000)
import { readFileSync, existsSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const BAR = Number(process.env.PF_S90_BAR_UM ?? 10);
const CTRLN = Number(process.env.PF_S90_CTRLN ?? 8000);
const DIR = 'research/exchange/_strataConformBisect/s87ledger';

interface Row { k: number; area: number; p: number; w: number; b: number; v: number; c: 0 | 1; o0: number; o2: number }

const DEFAULT_SETS = [
  `s90VOR=${DIR}/s90VOR.pos.ndjson`,
  `S24i2=${DIR}/S24i2.pos.ndjson`,
  `C2S39CTL=${DIR}/C2S39CTL.pos.ndjson`,
  `S9A=${DIR}/S9A.pos.ndjson`,
].join(',');
const SETS = (process.env.PF_S90_NDJSON ?? DEFAULT_SETS).split(',').filter((s) => s.length > 0);

function readRows(p: string): Row[] {
  if (!existsSync(p)) return [];
  const out: Row[] = [];
  for (const ln of readFileSync(p, 'utf8').split('\n')) {
    if (ln.length < 3) continue;
    try { out.push(JSON.parse(ln) as Row); } catch { /* truncated tail while the writer runs */ }
  }
  return out;
}

/** recall / fraction-tested curve for a selector key, under the FLAT S88 cost model (for comparability). */
function recallCurve(rows: Row[], key: (r: Row) => number): { f: number; recall: number; recallArea: number }[] {
  const fails = rows.filter((r) => r.v === 1);
  const failArea = fails.reduce((s, r) => s + r.area, 0);
  if (fails.length === 0) return [];
  const ord = rows.slice().sort((a, b) => key(b) - key(a));
  const out: { f: number; recall: number; recallArea: number }[] = [];
  let hit = 0; let hitArea = 0;
  for (let i = 0; i < ord.length; i += 1) {
    if (ord[i].v === 1) { hit += 1; hitArea += ord[i].area; }
    out.push({ f: (i + 1) / ord.length, recall: hit / fails.length, recallArea: hitArea / Math.max(1e-30, failArea) });
  }
  return out;
}
function fAtRecall(curve: { f: number; recall: number }[], target: number): number {
  for (const c of curve) if (c.recall >= target - 1e-12) return c.f;
  return 1;
}

log('===== S90 SELECTOR — TASK 1 READOUT: does S88 containment survive off GothicArches? =====');
log(`bar ${BAR} um   control N ${CTRLN}`);
log('');

for (const spec of SETS) {
  const [tag, path] = spec.split('=');
  const rows = readRows(path);
  if (rows.length === 0) { log(`-- ${tag}: NO ROWS at ${path} (not run yet)`); continue; }
  const n = rows.length;
  const fails = rows.filter((r) => r.v === 1);
  const areaAll = rows.reduce((s, r) => s + r.area, 0);
  const areaFail = fails.reduce((s, r) => s + r.area, 0);

  log(`══════ ${tag} — ${n} rows scored so far ══════`);
  log(`   honest position PROVEN-FAIL ${fails.length}/${n} = ${((100 * fails.length) / n).toFixed(4)}%   (+-${(100 * (fails.length > 0 ? Math.sqrt(fails.length) / fails.length : 1)).toFixed(1)}% 1sig)`);
  log(`   PROVEN-FAIL AREA fraction ${((100 * areaFail) / Math.max(1e-30, areaAll)).toFixed(5)}%`);

  // ── C-S90-1 — the nested cross-tool control, on the first CTRLN rows.
  if (n >= CTRLN) {
    const sub = rows.slice(0, CTRLN);
    const sf = sub.filter((r) => r.v === 1);
    const sa = sub.reduce((s, r) => s + r.area, 0);
    const saf = sf.reduce((s, r) => s + r.area, 0);
    log(`   C-S90-1 first ${CTRLN} rows: PROVEN-FAIL ${sf.length} (${((100 * sf.length) / CTRLN).toFixed(3)}%)   areaFail ${((100 * saf) / Math.max(1e-30, sa)).toFixed(5)}%   <= S85 published 840 (10.500%) / 1.30676% on VORONOI`);
  } else {
    log(`   C-S90-1 pending — ${n}/${CTRLN} rows`);
  }

  // ── H-S90-1 — THE 2x2 CONTAINMENT TABLE, count AND area, at both insets.
  for (const [lbl, ok] of [['o0 (inset 0   )', (r: Row): boolean => r.o0 <= BAR], ['o2 (inset 0.02)', (r: Row): boolean => r.o2 <= BAR]] as [string, (r: Row) => boolean][]) {
    const fo = fails.filter((r) => !ok(r));      // posFail & oriOver
    const fk = fails.filter((r) => ok(r));       // posFail & oriOK   <= THE KILL COLUMN
    const po = rows.filter((r) => r.v !== 1 && !ok(r));
    const pk = rows.filter((r) => r.v !== 1 && ok(r));
    const leakFrac = fails.length > 0 ? fk.length / fails.length : 0;
    const leakArea = fk.reduce((s, r) => s + r.area, 0);
    const leakAreaFrac = areaFail > 0 ? leakArea / areaFail : 0;
    const wMax = fk.length > 0 ? Math.max(...fk.map((r) => r.w)) : 0;
    log(`   ${lbl}   posFail&oriOver ${fo.length}   *** posFail&oriOK ${fk.length} (${(100 * leakFrac).toFixed(3)}% of failures, ${(100 * leakAreaFrac).toFixed(3)}% of failing AREA) ***   posOK&oriOver ${po.length}   posOK&oriOK ${pk.length}`);
    if (fk.length > 0) {
      const s = fk.slice().sort((a, b) => b.w - a.w);
      log(`        LEAKED failures: worst witnessed ${wMax.toFixed(2)} um   p50 ${s[Math.floor(s.length / 2)].w.toFixed(2)} um   worst-5 (w um / o2 um / area mm2): ${s.slice(0, 5).map((r) => `${r.w.toFixed(1)}/${r.o2.toFixed(2)}/${r.area.toExponential(2)}`).join('  ')}`);
    }
    log(`        VERDICT vs the pre-registered 2.0% kill: ${100 * leakFrac > 2.0 ? '*** KILLED — containment is Gothic-only ***' : 'containment HOLDS'}`);
  }

  // ── H-S90-2 — recall curves under the FLAT S88 model (comparability only; the real cost is s90selCost).
  const keys: [string, (r: Row) => number][] = [
    ['orient o2 -> pos', (r) => r.o2],
    ['orient o0 -> pos', (r) => r.o0],
    ['blind plane p -> pos', (r) => r.p],
  ];
  for (const [kn, kf] of keys) {
    const c = recallCurve(rows, kf);
    if (c.length === 0) continue;
    const f90 = fAtRecall(c, 0.90); const f95 = fAtRecall(c, 0.95); const f100 = fAtRecall(c, 1.0);
    const sp = (f: number): number => 375 / (5 + 375 * f);
    const at = (fr: number): number => c[Math.min(c.length - 1, Math.max(0, Math.round(fr * c.length) - 1))].recall;
    log(`   selector ${kn.padEnd(22)}  recall@1% ${(100 * at(0.01)).toFixed(1)}%  @5% ${(100 * at(0.05)).toFixed(1)}%   f@0.90 ${(100 * f90).toFixed(2)}% (flat-model ${sp(f90).toFixed(2)}x)   f@0.95 ${(100 * f95).toFixed(2)}%   f@1.00 ${(100 * f100).toFixed(2)}% (${sp(f100).toFixed(2)}x)`);
    log(`        C-S90-4 non-vacuity: recall(f=100%) ${c[c.length - 1].recall.toFixed(4)} (must be 1.0000)   recall@f=first-row ${c[0].recall.toFixed(4)}`);
  }

  // ── WHAT THE ARM-SCORING LOOP ACTUALLY REPORTS: failing COUNT, failing AREA, and the witnessed MAX.
  //    A selector is a drop-in for that loop iff it reproduces all three. Recall on a bar is not enough:
  //    the campaign's own rule 1 is "never report a bare MAX, and never report COUNT alone".
  {
    const failAll = rows.filter((r) => r.v === 1);
    const areaFailAll = failAll.reduce((s, r) => s + r.area, 0);
    const maxWAll = rows.reduce((m, r) => (r.w > m ? r.w : m), 0);
    for (const [kn, kf] of [['o2', (r: Row) => r.o2], ['o0', (r: Row) => r.o0]] as [string, (r: Row) => number][]) {
      const ord = rows.slice().sort((a, b) => kf(b) - kf(a));
      let cnt = 0; let ar = 0; let mx = 0;
      let fCnt = 1; let fAr = 1; let fMax = 1;
      for (let i = 0; i < ord.length; i += 1) {
        if (ord[i].v === 1) { cnt += 1; ar += ord[i].area; }
        if (ord[i].w > mx) mx = ord[i].w;
        const f = (i + 1) / ord.length;
        if (fMax === 1 && mx >= maxWAll - 1e-12) fMax = f;
        if (fCnt === 1 && cnt >= failAll.length) fCnt = f;
        if (fAr === 1 && ar >= areaFailAll - 1e-15) fAr = f;
      }
      log(`   DROP-IN TEST (${kn}): f to reproduce the EXACT failing COUNT ${(100 * fCnt).toFixed(2)}%   failing AREA ${(100 * fAr).toFixed(2)}%   witnessed MAX (${maxWAll.toFixed(2)} um) ${(100 * fMax).toFixed(2)}%`);
    }
  }

  // ── THE SOUNDNESS SCAN (Task 3 input): max witnessed position error among facets BELOW an o2 cut.
  //     A SOUND one-sided selector needs this to stay <= BAR for the cut it uses. This is EMPIRICAL, and a
  //     single counterexample refutes soundness at that cut.
  const cuts = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const line = cuts.map((cut) => {
    const below = rows.filter((r) => r.o2 <= cut);
    const mw = below.length > 0 ? Math.max(...below.map((r) => r.w)) : 0;
    return `o2<=${cut}: n=${below.length} maxW=${mw.toFixed(1)}`;
  }).join('   ');
  log(`   SOUNDNESS SCAN (max honest witnessed um among facets with o2 <= cut):`);
  log(`        ${line}`);
  log('');
}
log('done');
