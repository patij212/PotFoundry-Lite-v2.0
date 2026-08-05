#!/usr/bin/env node
/*
 * frontierFoldCheck.cjs — FALSIFY MY OWN "FOLDED" CLASS BEFORE QUOTING IT.
 *
 * The taxonomy calls a facet FOLDED when `normDeg > 90` under the campaign's `orient:'outward'`
 * convention, which is `if (fx*gx + fy*gy < 0) negate` — it decides the facet's sign from the XY part of
 * its normal alone. THAT TEST IS ILL-CONDITIONED FOR A NEARLY-HORIZONTAL FACET, where |fx*gx+fy*gy| ~ 0
 * and the sign is decided by noise. If the folded population is nearly-horizontal facets, "FOLDED" is my
 * instrument defect, not the mesh's defect.
 *
 * DISCRIMINATOR: for every facet with normDeg > 90, print |fz| (1 = horizontal, the ill-conditioned case)
 * and the normalised orientation margin |fx*gx+fy*gy| / (|f_xy| * |g_xy|) = |cos| between the facet
 * normal's XY part and the outward radial. KILL: if the folded population's margin p50 < 0.1 the class is
 * an artefact of the sign convention and must be withdrawn.
 *
 * usage: node research/tools/frontierFoldCheck.cjs <stl> <FR_TAX ndjson>
 */
const fs = require('node:fs');
const stl = process.argv[2]; const nd = process.argv[3];
const buf = fs.readFileSync(stl);
const nTri = buf.readUInt32LE(80);
const rows = fs.readFileSync(nd, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const tri = (t) => { const o = 84 + t * 50 + 12; const v = []; for (let k = 0; k < 9; k += 1) v.push(buf.readFloatLE(o + 4 * k)); return v; };
const stats = (label, sel) => {
  const fz = []; const marg = []; const areas = [];
  for (const r of sel) {
    const v = tri(r.i);
    let fx = (v[4] - v[1]) * (v[8] - v[2]) - (v[5] - v[2]) * (v[7] - v[1]);
    let fy = (v[5] - v[2]) * (v[6] - v[0]) - (v[3] - v[0]) * (v[8] - v[2]);
    let fzz = (v[3] - v[0]) * (v[7] - v[1]) - (v[4] - v[1]) * (v[6] - v[0]);
    const fl = Math.hypot(fx, fy, fzz); if (!(fl > 0)) continue;
    fx /= fl; fy /= fl; fzz /= fl;
    const gx = (v[0] + v[3] + v[6]) / 3; const gy = (v[1] + v[4] + v[7]) / 3;
    const gl = Math.hypot(gx, gy) || 1; const fxy = Math.hypot(fx, fy);
    fz.push(Math.abs(fzz));
    marg.push(fxy > 0 ? Math.abs(fx * gx + fy * gy) / (fxy * gl) : 0);
    areas.push(r.ar);
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  console.log(`  ${label.padEnd(34)} n=${String(fz.length).padStart(6)}  |fz| p05/50/95 ${q(fz, 0.05).toFixed(4)} ${q(fz, 0.5).toFixed(4)} ${q(fz, 0.95).toFixed(4)}   MARGIN p05/50/95 ${q(marg, 0.05).toFixed(4)} ${q(marg, 0.5).toFixed(4)} ${q(marg, 0.95).toFixed(4)}`);
};
console.log(`\n=== ${stl} (${nTri} facets) vs ${nd} ===`);
console.log('  MARGIN = |cos| between the facet normal XY part and the outward radial. Near 0 = the');
console.log('  outward-orientation test is deciding the sign on noise, and "FOLDED" would be MY artefact.');
stats('FOLDED  normDeg > 90', rows.filter((r) => r.nd > 90));
stats('over-bar, not folded', rows.filter((r) => r.tu > 10 && r.nd <= 90));
stats('ALL sampled facets', rows);
console.log('');
