/**
 * _junctionField.test.ts — DEV-ONLY: dump the raw radius field r(u,t) over the
 * multi-bay domain so we can SEE what geometry the dead-zone outliers bridge
 * (smooth curvature vs a diagonal/horizontal arch ridge the u-scanning detector
 * misses). Also overlays the worst-outlier sites. Emits an SVG heatmap.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';

const RUN = process.env.PF_TIERC_JUNCTION === '1';
const OUT = 'research/exchange/_tierc_junction';

describe('Tier-C junction radius-field dump', () => {
  it.skipIf(!RUN)('radius field over the multi-bay domain', () => {
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
    const rAt = (u: number, t: number): number => {
      const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
      return Math.hypot(x, y);
    };
    const uLo = 0,
      uHi = 0.125,
      tLo = 0.35,
      tHi = 0.65;
    const NU = 240;
    const NT = 300;
    const field = new Float64Array(NU * NT);
    let rMin = 1e9;
    let rMax = -1e9;
    for (let it2 = 0; it2 < NT; it2++) {
      const t = tLo + ((tHi - tLo) * it2) / (NT - 1);
      for (let iu = 0; iu < NU; iu++) {
        const u = uLo + ((uHi - uLo) * iu) / (NU - 1);
        const r = rAt(u, t);
        field[it2 * NU + iu] = r;
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
      }
    }
    const W = 720;
    const Hpx = 900;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hpx}">`;
    const cw = W / NU;
    const ch = Hpx / NT;
    for (let it2 = 0; it2 < NT; it2++) {
      for (let iu = 0; iu < NU; iu++) {
        const v = (field[it2 * NU + iu] - rMin) / (rMax - rMin || 1);
        // grayscale + red channel for high relief
        const g = Math.round(255 * v);
        const col = `rgb(${g},${Math.round(g * 0.7)},${Math.round((1 - v) * 120)})`;
        const y = Hpx - (it2 + 1) * ch; // t increases upward
        svg += `<rect x="${(iu * cw).toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" fill="${col}"/>`;
      }
    }
    // Domain box t[0.38,0.62].
    const tToY = (t: number): number => Hpx - ((t - tLo) / (tHi - tLo)) * Hpx;
    const uToX = (u: number): number => ((u - uLo) / (uHi - uLo)) * W;
    for (const t of [0.38, 0.48, 0.57, 0.62]) {
      svg += `<line x1="0" y1="${tToY(t).toFixed(1)}" x2="${W}" y2="${tToY(t).toFixed(1)}" stroke="#0ff" stroke-width="1" stroke-dasharray="4 3"/>`;
      svg += `<text x="4" y="${(tToY(t) - 2).toFixed(1)}" fill="#0ff" font-size="11">t=${t}</text>`;
    }
    // Worst outlier sites.
    const sites: Array<[number, number]> = [
      [0.0586, 0.4931],
      [0.0608, 0.4771],
      [0.0579, 0.4374],
      [0.0612, 0.4054],
      [0.0585, 0.4839],
      [0.0566, 0.5013],
    ];
    for (const [u, t] of sites) {
      svg += `<circle cx="${uToX(u).toFixed(1)}" cy="${tToY(t).toFixed(1)}" r="5" fill="none" stroke="#f0f" stroke-width="2"/>`;
    }
    svg += `<text x="4" y="16" fill="#fff" font-size="12">Gothic r(u,t) u[0,0.125] t[0.35,0.65]  rMin=${rMin.toFixed(2)} rMax=${rMax.toFixed(2)}  magenta=worst outliers</text>`;
    svg += `</svg>`;
    writeFileSync(`${OUT}/radius_field.svg`, svg);

    // Numeric profiles at the worst-outlier column + a dead-zone row.
    const prof: Record<string, unknown> = {};
    // r(t) at u=0.0586 (the worst-column) across t 0.35..0.62 — is there a
    // sharp t-direction feature (horizontal ridge) the u-detector misses?
    const rt: Array<[number, number]> = [];
    for (let i = 0; i <= 54; i++) {
      const t = 0.35 + (0.27 * i) / 54;
      rt.push([+t.toFixed(4), +rAt(0.0586, t).toFixed(3)]);
    }
    // Second-diff peaks along t → locate horizontal ridges.
    let maxD2t = 0;
    let maxD2tAt = 0;
    for (let i = 1; i < rt.length - 1; i++) {
      const d2 = Math.abs(rt[i + 1][1] - 2 * rt[i][1] + rt[i - 1][1]);
      if (d2 > maxD2t) {
        maxD2t = d2;
        maxD2tAt = rt[i][0];
      }
    }
    // r(u) at t=0.44 (dead-zone row) across u 0..0.125 — is there a u-ridge?
    const ru: Array<[number, number]> = [];
    for (let i = 0; i <= 60; i++) {
      const u = (0.125 * i) / 60;
      ru.push([+u.toFixed(4), +rAt(u, 0.44).toFixed(3)]);
    }
    let maxD2u = 0;
    for (let i = 1; i < ru.length - 1; i++) {
      const d2 = Math.abs(ru[i + 1][1] - 2 * ru[i][1] + ru[i - 1][1]);
      if (d2 > maxD2u) maxD2u = d2;
    }
    prof.rt_at_u0058 = rt;
    prof.ru_at_t044 = ru;
    prof.maxD2t_along_t = { val: +maxD2t.toFixed(4), at_t: maxD2tAt };
    prof.maxD2u_along_u_at_t044 = +maxD2u.toFixed(4);
    writeFileSync(`${OUT}/field_profiles.json`, JSON.stringify(prof, null, 2));
    // eslint-disable-next-line no-console
    console.log(
      `[field] rMin=${rMin.toFixed(3)} rMax=${rMax.toFixed(3)} ` +
        `maxD2t(along t @u0.058)=${maxD2t.toFixed(4)}@t${maxD2tAt} ` +
        `maxD2u(along u @t0.44)=${maxD2u.toFixed(4)}`,
    );
    expect(rMax).toBeGreaterThan(rMin);
  }, 5 * 60 * 1000);
});
