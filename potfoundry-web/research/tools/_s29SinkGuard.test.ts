// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// _s29SinkGuard.test.ts — THE SINK GUARD'S BLIND SPOT, AND THE RE-ARMING WINDOW THAT CLOSES IT.
// RESEARCH ONLY.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// ── WHAT THE ITERATE MEASURED, AND WHY IT IS A PROBLEM ──────────────────────────────────────────────────
// `_S29FPi1` refined the member region to 2.73x the facet count at 2.64x smaller mean area and left those
// facets STILL OVER 10 um — and the sink guard reported ***STRANDED SITES 0*** of 2,168. The guard is the
// ADJUDICATOR between S29's two registered outcomes. A guard that stays silent through exactly the
// outcome it was built to detect is not evidence of health; it is an untested guard, which is the S28 S5b
// defect this campaign keeps re-finding (and the G4 self-test bar in `s29Accept.ts` was a third instance).
//
// ── THE MECHANISM, AND IT IS ARITHMETIC, NOT A TUNING QUESTION ──────────────────────────────────────────
//     if (!s.stranded && s.splits > budgetN && s.bestUm > s.entryUm / fallRatio) strand()
// `bestUm` is the MINIMUM over-bar reading ever seen at the site, so it only ever falls, and the test is
// measured against the site's ENTRY reading FOREVER. A member site entering at 200 um needs to reach
// 133 um — 7.5% of the way to a 10 um bar — and after that ONE fall the condition is false at every future
// split, for any number of splits. The guard asks "did this site EVER improve by 1.5x?". It does not ask
// "is this site STILL improving?", and only the second question can detect a sink.
//
// ── THE FIX IS A RE-ARMING WINDOW, AND IT IS THE REGISTRATION'S OWN WORDING ─────────────────────────────
// "a site that consumes more than N splits WITHOUT ITS READING FALLING >= 1.5x re-strands." Read as a RATE
// over the last N splits — which is what "consumes N splits without falling" says — the guard re-arms:
// every N splits it compares the window's best against the window's own entry, strands if it did not fall,
// and otherwise re-baselines. A site that reaches the bar is exempt, because a site at the bar is finished
// rather than stalled.
//
// DEFAULT OFF (`PF_CB_SINK_WINDOW`). The registered rule is what ran on every arm in this campaign and it
// stays the default; the windowed rule has to earn its place by being MEASURED against it, not by being
// switched on in a commit that also changes a verdict.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadS29Override, type S29Override } from './s29Accept';
import type { RadiusFn } from './s29Perp';

const TWO_PI = 2 * Math.PI;
const R0 = 45; const H = 120;
const cylinder: RadiusFn = () => R0;
const KEY = 'SINK|x=1|H=120,Rb=40,Rt=50,expn=1|tol=0.01|stage=ring';
const CDT = 0.002; const CDZ = 0.1;
const nT = Math.round(TWO_PI / CDT); const nZ = Math.round(120 / CDZ);
const SDT = 0.02; const SDZ = 0.5;
const N = 128; const FALL = 1.5;

const build = (entryUm: number, opts: { fpVeto?: boolean; sinkWindow?: boolean } = {}): S29Override => {
  const th = 1.0; const z = 60;
  const cells: number[] = [];
  const i0 = Math.floor((th - 0.02) / CDT); const i1 = Math.floor((th + 0.02) / CDT);
  const j0 = Math.floor((z - 0.5) / CDZ); const j1 = Math.floor((z + 0.5) / CDZ);
  for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) cells.push((((i % nT) + nT) % nT) * nZ + j);
  const uniq = [...new Set(cells)].sort((a, b) => a - b);
  const doc = {
    schema: 'pf.strata.s29.members/1',
    run: { key: KEY, style: 'SINK', stage: 'ring', tolMm: 0.01 },
    tolUm: 10, complete: true, truncated: false,
    counts: { over: 1, rim: 0, interior: 1, cage: 0, members: 1 },
    cellGrid: { dTheta: CDT, dZ: CDZ, nTheta: nT, nZ, cells: uniq.length, surfaceFractionPct: 0 },
    sinkGuard: { dTheta: SDT, dZ: SDZ, budgetN: N, fallRatio: FALL, sites: 1 },
    cells: uniq,
    sites: [{ iTh: Math.round(th / SDT), iZ: Math.round(z / SDZ), n: 1, entryUm }],
    members: [{ tri: 0, boundUm: entryUm, theta: th, zMin: z, zMax: z, owner: 'mid-chord' }],
    source: { stl: 'sink-test', stlMd5: '0'.repeat(32) },
  };
  const p = join(mkdtempSync(join(tmpdir(), 's29sink-')), 'members.json');
  writeFileSync(p, JSON.stringify(doc));
  return loadS29Override(p, { key: KEY, style: 'SINK', stage: 'ring', tolMm: 0.01 }, opts);
};

/** a facet `dMm` inward of the cylinder — its perpendicular reading is exactly `dMm`, whatever its size */
const inset = (t0: number, z0: number, dMm: number): number[] => {
  const r = R0 - dMm; const w = 0.002;
  return [
    r * Math.cos(t0), r * Math.sin(t0), z0,
    r * Math.cos(t0 + w), r * Math.sin(t0 + w), z0,
    r * Math.cos(t0 + w / 2), r * Math.sin(t0 + w / 2), z0 + 0.05,
  ];
};

/** `n` DISTINCT facets at one site, all reading exactly `dMm` — the memo is geometry-keyed, so they differ */
const feed = (ov: S29Override, n0: number, count: number, dMm: number): void => {
  for (let i = 0; i < count; i += 1) {
    const t = inset(1.0 + (n0 + i) * 1e-5, 60, dMm);
    ov.perpOk(n0 + i, cylinder, H, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
  }
};

afterEach(() => { delete process.env.PF_CB_SINK_WINDOW; });

describe('the S29 sink guard — the stall it cannot see', () => {
  // ── THE BLIND SPOT, CHARACTERISED. This is the `_S29FPi1` regime: a member site enters at 200 um,
  //    improves ONCE past 200/1.5 = 133 um, and then stalls at 120 um — TWELVE TIMES the 10 um bar —
  //    for two thousand splits. The registered rule records NOTHING.
  it('DEFAULT: a site that stalls 12x over the bar for 2,000 splits does NOT strand', () => {
    const ov = build(200, { fpVeto: true });
    feed(ov, 0, 2000, 0.120);
    expect(ov.strands().length).toBe(0);          // ← the defect, asserted so it cannot regress silently
    expect(ov.stats().perpRejects).toBe(2000);    // ← and every one of them WAS a reject: the ruler saw it
  });

  // ── THE RE-ARMING WINDOW SEES IT.
  it('PF_CB_SINK_WINDOW: the same stall RE-STRANDS', () => {
    const ov = build(200, { fpVeto: true, sinkWindow: true });
    feed(ov, 0, 2000, 0.120);
    const st = ov.strands();
    expect(st.length).toBe(1);
    expect(st[0].rule).toBe('window');
    // IT MUST FIRE ON THE FIRST WINDOW THAT FAILS, NOT EVENTUALLY. Window 1 falls 200 -> 120 (x1.67, PASS,
    // re-baseline to 120); window 2 reads 120 against its own 120 baseline (x1.00, FAIL). Each window
    // consumes N+1 charged splits, because the window reuses the REGISTERED rule's `> budgetN` trigger so
    // the two are directly comparable — hence 2*(N+1), and this constant is that arithmetic rather than a
    // round number: 2N+1 was the author's first guess and it is off by one window boundary.
    expect(st[0].splits).toBe(2 * (N + 1));
  });

  // ── AND IT STAYS QUIET ON A SITE THAT IS GENUINELY CONVERGING. A guard that fires on healthy refinement
  //    would strand the whole membership and hand back a blind-accept mesh — worse than no guard at all.
  it('PF_CB_SINK_WINDOW: a site that keeps falling 2x per window does NOT strand', () => {
    const ov = build(200, { fpVeto: true, sinkWindow: true });
    let d = 0.200; let seq = 0;
    for (let w = 0; w < 4; w += 1) { d /= 2; feed(ov, seq, N + 1, d); seq += N + 1; }
    expect(ov.strands().length).toBe(0);
  });

  // ── A SITE THAT REACHES THE BAR IS FINISHED, NOT STALLED. Readings at or under the bar are not charged
  //    at all (the guard only observes over-bar facets), so a converged site cannot be stranded by silence.
  it('PF_CB_SINK_WINDOW: a site that reaches the bar is never stranded', () => {
    const ov = build(200, { fpVeto: true, sinkWindow: true });
    feed(ov, 0, N + 1, 0.120);       // one healthy window: 200 -> 120
    feed(ov, 9000, 2000, 0.004);     // then everything closes under the 10 um bar
    expect(ov.strands().length).toBe(0);
  });

  // ── THE DEFAULT IS NOT MOVED. Same input, both rules, on a site the REGISTERED rule already catches:
  //    the windowed rule must not change what the registered one decides there.
  it('both rules agree on the sink the registered rule can already see', () => {
    const a = build(25, { fpVeto: true });
    const b = build(25, { fpVeto: true, sinkWindow: true });
    feed(a, 0, 200, 0.020);
    feed(b, 0, 200, 0.020);
    expect(a.strands().length).toBe(1);
    expect(b.strands().length).toBe(1);
    expect(a.strands()[0].splits).toBe(N + 1);
  });

  it('arms from the environment as well as from the option', () => {
    process.env.PF_CB_SINK_WINDOW = '1';
    const ov = build(200, { fpVeto: true });
    feed(ov, 0, 2000, 0.120);
    expect(ov.strands().length).toBe(1);
  });
});
