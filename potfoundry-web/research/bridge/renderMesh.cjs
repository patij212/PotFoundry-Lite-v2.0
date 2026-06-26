#!/usr/bin/env node
// renderMesh.cjs — draw the (u,t) triangulation of one or more mesh dumps, colored by TRUE 3D min-angle
// (red = sliver <20°, amber 20–30°, pale green ≥30°), as a side-by-side SVG crop. Reads the _oursvssota
// dump format { ut2, xyz, tris, config, style, triCount, pctUnder20deg }.
//   node renderMesh.cjs <u0> <u1> <t0> <t1> <out.svg> <file1> [file2 ...]
const fs = require('fs');
const [, , u0s, u1s, t0s, t1s, out, ...files] = process.argv;
const u0 = +u0s, u1 = +u1s, t0 = +t0s, t1 = +t1s;
const PANEL = 360, GAP = 14, PAD = 6, LABEL = 30;

function minAngle3D(A, B, C) {
  const e = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const ang = (o, p, q) => {
    const op = e(o, p), oq = e(o, q), pq = e(p, q);
    let c = (op * op + oq * oq - pq * pq) / (2 * op * oq);
    c = Math.max(-1, Math.min(1, c));
    return (Math.acos(c) * 180) / Math.PI;
  };
  return Math.min(ang(A, B, C), ang(B, A, C), ang(C, A, B));
}

function panel(file, ox) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { ut2, xyz, tris } = d;
  const sx = (u) => ox + PAD + ((u - u0) / (u1 - u0)) * (PANEL - 2 * PAD);
  const sy = (t) => PAD + (1 - (t - t0) / (t1 - t0)) * (PANEL - 2 * PAD);
  let polys = '', nIn = 0, nSliver = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i], ib = tris[i + 1], ic = tris[i + 2];
    const ua = ut2[2 * ia], ta = ut2[2 * ia + 1], ub = ut2[2 * ib], tb = ut2[2 * ib + 1], uc = ut2[2 * ic], tc = ut2[2 * ic + 1];
    const cu = (ua + ub + uc) / 3, ct = (ta + tb + tc) / 3;
    if (cu < u0 || cu > u1 || ct < t0 || ct > t1) continue;
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue; // seam wrap
    nIn++;
    const A = [xyz[3 * ia], xyz[3 * ia + 1], xyz[3 * ia + 2]];
    const B = [xyz[3 * ib], xyz[3 * ib + 1], xyz[3 * ib + 2]];
    const C = [xyz[3 * ic], xyz[3 * ic + 1], xyz[3 * ic + 2]];
    const ma = minAngle3D(A, B, C);
    const fill = ma < 20 ? '#e02424' : ma < 30 ? '#f5a623' : '#d7ecd9';
    if (ma < 20) nSliver++;
    polys += `<polygon points="${sx(ua).toFixed(1)},${sy(ta).toFixed(1)} ${sx(ub).toFixed(1)},${sy(tb).toFixed(1)} ${sx(uc).toFixed(1)},${sy(tc).toFixed(1)}" fill="${fill}" stroke="#1b1b1b" stroke-width="0.25"/>`;
  }
  const pct = nIn ? ((100 * nSliver) / nIn).toFixed(1) : '0';
  const label = `${d.config}  ·  ${d.triCount} tris  ·  ${nIn} in crop  ·  ${pct}% red`;
  return {
    svg: `<rect x="${ox}" y="0" width="${PANEL}" height="${PANEL}" fill="#ffffff" stroke="#bbb"/>${polys}` +
      `<text x="${ox + 6}" y="${PANEL + 20}" font-size="13" font-family="sans-serif" fill="#111">${label}</text>`,
    log: `${d.config}: ${nIn} tris in crop, ${nSliver} slivers (${pct}%)`,
  };
}

const W = files.length * PANEL + (files.length - 1) * GAP;
let body = '';
files.forEach((f, i) => { const p = panel(f, i * (PANEL + GAP)); body += p.svg; console.log(p.log); });
const SC = 2; // 2x raster scale for a crisp PNG
const svg = `<svg width="${W * SC}" height="${(PANEL + LABEL) * SC}" viewBox="0 0 ${W} ${PANEL + LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${PANEL + LABEL}" fill="#fafafa"/>${body}</svg>`;
fs.writeFileSync(out, svg);
console.log(`wrote ${out} (${W}x${PANEL + LABEL}, crop u[${u0},${u1}] t[${t0},${t1}])`);
