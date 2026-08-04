// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// _s29AcceptFpVeto.test.ts — THE WIRING BARS FOR PF_CB_FPVETO. RESEARCH ONLY.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// The veto swaps the POINT RULER under S29's accept rule and NOTHING ELSE. So the bars are:
//   * DEFAULT OFF — with the lever unset, `perpOk` is the S29 path, byte-for-byte. A new lever that moves a
//     default is not a lever, it is a silent re-baseline, and this campaign has been burned by that before.
//   * THE DECISION IS THE SAME — on geometry of known error the veto must accept what S29 accepts and
//     reject what S29 rejects. A cheaper ruler that also changes the verdict is a different experiment.
//   * THE COST FALLS — the whole point. S29 measured ~2,844 rA evaluations per honest accept test.
//   * THE SINK GUARD STILL HAS TEETH — the tripwire is the ADJUDICATOR between S29's two registered
//     outcomes. A cheaper ruler that quietly disarms it would convert "not density-closable" into
//     "closable", which is the one failure this arm cannot be allowed to have.
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
const KEY = 'FPVETO|x=1|H=120,Rb=40,Rt=50,expn=1|tol=0.01|stage=ring';
const CDT = 0.002; const CDZ = 0.1;
const nT = Math.round(TWO_PI / CDT); const nZ = Math.round(120 / CDZ);
const SDT = 0.02; const SDZ = 0.5;

/** a members file covering one site at (theta 1.0, z 60), the selftest's fixture geometry */
const build = (entryUm: number, opts: { fpVeto?: boolean } = {}): S29Override => {
  const th = 1.0; const z = 60;
  const cells: number[] = [];
  const i0 = Math.floor((th - 0.02) / CDT); const i1 = Math.floor((th + 0.02) / CDT);
  const j0 = Math.floor((z - 0.5) / CDZ); const j1 = Math.floor((z + 0.5) / CDZ);
  for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) cells.push((((i % nT) + nT) % nT) * nZ + j);
  const uniq = [...new Set(cells)].sort((a, b) => a - b);
  const doc = {
    schema: 'pf.strata.s29.members/1',
    run: { key: KEY, style: 'FPVETO', stage: 'ring', tolMm: 0.01 },
    tolUm: 10, complete: true, truncated: false,
    counts: { over: 1, rim: 0, interior: 1, cage: 0, members: 1 },
    cellGrid: { dTheta: CDT, dZ: CDZ, nTheta: nT, nZ, cells: uniq.length, surfaceFractionPct: 0 },
    sinkGuard: { dTheta: SDT, dZ: SDZ, budgetN: 128, fallRatio: 1.5, sites: 1 },
    cells: uniq,
    sites: [{ iTh: Math.round(th / SDT), iZ: Math.round(z / SDZ), n: 1, entryUm }],
    members: [{ tri: 0, boundUm: entryUm, theta: th, zMin: z, zMax: z, owner: 'mid-chord' }],
    source: { stl: 'fpveto-test', stlMd5: '0'.repeat(32) },
  };
  const p = join(mkdtempSync(join(tmpdir(), 's29fp-')), 'members.json');
  writeFileSync(p, JSON.stringify(doc));
  return loadS29Override(p, { key: KEY, style: 'FPVETO', stage: 'ring', tolMm: 0.01 }, opts);
};

/** a facet `dMm` inward of the cylinder at the member site — its perpendicular reading is `dMm` exactly */
const inset = (t0: number, z0: number, dMm: number): number[] => {
  const r = R0 - dMm; const w = 0.002;
  return [
    r * Math.cos(t0), r * Math.sin(t0), z0,
    r * Math.cos(t0 + w), r * Math.sin(t0 + w), z0,
    r * Math.cos(t0 + w / 2), r * Math.sin(t0 + w / 2), z0 + 0.05,
  ];
};

const call = (ov: S29Override, tri: number, t: number[]): boolean =>
  ov.perpOk(tri, cylinder, H, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);

afterEach(() => { delete process.env.PF_CB_FPVETO; });

describe('PF_CB_FPVETO — the foot-point accept-side veto', () => {
  it('is DEFAULT OFF: with the lever unset the S29 ruler runs', () => {
    const ov = build(25);
    call(ov, 0, inset(1.0, 60, 0.020));
    expect(ov.stats().fpVeto).toBe(false);
    // the S29 ruler's price, which is the thing this arm exists to move
    expect(ov.stats().rAEvals).toBeGreaterThan(1000);
  });

  it('arms from the environment as well as from the option', () => {
    process.env.PF_CB_FPVETO = '1';
    expect(build(25).stats().fpVeto).toBe(true);
  });

  it('reaches the SAME accept decision as the S29 ruler, both ways', () => {
    for (const dMm of [0.004, 0.020]) {
      const t = inset(1.0, 60, dMm);
      const s29 = call(build(25), 0, t);
      const fp = call(build(25, { fpVeto: true }), 0, t);
      expect(fp).toBe(s29);
      expect(fp).toBe(dMm <= 0.010);
    }
  });

  it('COST: the honest accept test falls to <= 50 rA evaluations', () => {
    const ov = build(25, { fpVeto: true });
    call(ov, 0, inset(1.0, 60, 0.004));   // an ACCEPTED facet — the honest accept test
    expect(ov.stats().rAEvals).toBeLessThanOrEqual(50);
  });

  it('the SINK GUARD still fires under the veto', () => {
    const ov = build(25, { fpVeto: true });
    // 200 DISTINCT facets at one site, all reading 20.000 um against a 25 um entry: 20 > 25/1.5, so the
    // reading has NOT fallen and the site must re-strand at N+1.
    for (let i = 0; i < 200; i += 1) call(ov, i, inset(1.0 + i * 1e-5, 60, 0.020));
    const st = ov.strands();
    expect(st.length).toBe(1);
    expect(st[0].splits).toBe(129);
    expect(ov.listed(1.0, 1.0 + 1e-4, 1.0 + 5e-5, 60, 60, 60.02)).toBe(false);
  });

  it('the geometry-keyed cache is untouched by the veto', () => {
    const ov = build(25, { fpVeto: true });
    const t = inset(1.0, 60, 0.020);
    for (let i = 0; i < 500; i += 1) call(ov, i, t);
    expect(ov.stats().perpEvals).toBe(1);
    expect(ov.stats().memoHits).toBe(499);
  });
});
