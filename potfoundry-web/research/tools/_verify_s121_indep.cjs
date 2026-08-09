#!/usr/bin/env node
// INDEPENDENT verification of S121 tread claims. Written from scratch by the verifier.
// node _verify_s121_indep.cjs <stl> <nWall>
'use strict';
const fs = require('fs');
const stl = process.argv[2];
const NW = Number(process.argv[3]);
const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
console.log(`file ${stl}`);
console.log(`facets ${n}   nWall arg ${NW}   nTread ${n - NW}`);

const aspect3 = (a, b, c) => {
  const e0 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e1 = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
  const e2 = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(A > 0)) return [Infinity, 0, 0];
  const L = Math.max(e0, e1, e2);
  const minAlt = 2 * A / L;           // altitude onto the LONGEST edge = the smallest altitude
  return [(L * (e0 + e1 + e2)) / (4 * A), A, minAlt];
};

const rd = (o) => [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
const tri = (f) => { const o = 84 + f * 50 + 12; return [rd(o), rd(o + 12), rd(o + 24)]; };

const CAPS = [10, 20, 50, 100, 200];
const cls = [ {name:'WALL', lo:0, hi:NW}, {name:'TREAD', lo:NW, hi:n} ];
const res = {};
for (const cl of cls) {
  const st = { n: cl.hi - cl.lo, area: 0, arMax: 0, minAlt: Infinity, over: {}, overArea: {}, arMaxIdx: -1 };
  for (const C of CAPS) { st.over[C] = 0; st.overArea[C] = 0; }
  for (let f = cl.lo; f < cl.hi; f++) {
    const [a, b, c] = tri(f);
    const [ar, A, alt] = aspect3(a, b, c);
    st.area += A;
    if (Number.isFinite(ar) && ar > st.arMax) { st.arMax = ar; st.arMaxIdx = f; }
    if (alt < st.minAlt) st.minAlt = alt;
    for (const C of CAPS) if (ar > C) { st.over[C]++; st.overArea[C] += A; }
  }
  res[cl.name] = st;
}
const totArea = res.WALL.area + res.TREAD.area;
console.log(`TOTAL 3-D area ${totArea.toFixed(3)} mm2   (wall ${res.WALL.area.toFixed(4)}  tread ${res.TREAD.area.toFixed(6)})`);
for (const k of ['WALL', 'TREAD']) {
  const s = res[k];
  console.log(`\n${k}: ${s.n} facets  area ${s.area.toFixed(6)} mm2  worst AR ${s.arMax.toFixed(2)} (facet ${s.arMaxIdx})  min 3-D altitude ${(s.minAlt * 1000).toFixed(4)} um`);
  for (const C of CAPS) {
    console.log(`   AR>${C}: ${s.over[C]} facets (${(100 * s.over[C] / s.n).toFixed(4)}% of class)  area ${s.overArea[C].toFixed(6)} mm2 (${(100 * s.overArea[C] / s.area).toFixed(4)}% of class area, ${(100*s.overArea[C]/totArea).toFixed(6)}% of mesh area)`);
  }
}
console.log(`\nMESH-WIDE AR>50: ${res.WALL.over[50] + res.TREAD.over[50]} facets`);

// ---- weld + boundary, exact float32 bit keys ----
function weld(lo, hi) {
  const map = new Map();
  const idx = [];
  for (let f = lo; f < hi; f++) {
    const o = 84 + f * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const k = buf.readUInt32LE(o + v * 12) + ':' + buf.readUInt32LE(o + v * 12 + 4) + ':' + buf.readUInt32LE(o + v * 12 + 8);
      let id = map.get(k);
      if (id === undefined) { id = map.size; map.set(k, id); }
      idx.push(id);
    }
  }
  const edges = new Map();
  const dir = new Map();
  const T = (hi - lo);
  for (let t = 0; t < T; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const pairs = [[i0, i1], [i1, i2], [i2, i0]];
    for (const [p, q] of pairs) {
      const key = (p < q ? p + '_' + q : q + '_' + p);
      edges.set(key, (edges.get(key) || 0) + 1);
      const dk = p + '>' + q;
      dir.set(dk, (dir.get(dk) || 0) + 1);
    }
  }
  let boundary = 0, nonman = 0;
  for (const c of edges.values()) { if (c === 1) boundary++; else if (c > 2) nonman++; }
  // inconsistent winding: an interior edge traversed in the SAME direction by both facets
  let badWind = 0;
  for (const [dk, c] of dir) { if (c > 1) badWind++; }
  return { verts: map.size, edges: edges.size, boundary, nonman, badWind };
}
const wWall = weld(0, NW);
const wAll = weld(0, n);
console.log(`\nWALL ALONE : verts ${wWall.verts}  unique edges ${wWall.edges}  BOUNDARY ${wWall.boundary}  nonmanifold(>2) ${wWall.nonman}  same-dir-dup-edges ${wWall.badWind}`);
console.log(`WHOLE MESH : verts ${wAll.verts}  unique edges ${wAll.edges}  BOUNDARY ${wAll.boundary}  nonmanifold(>2) ${wAll.nonman}  same-dir-dup-edges ${wAll.badWind}`);
console.log(`treads remove ${wWall.boundary - wAll.boundary} boundary edges of ${wWall.boundary} = ${(100*(wWall.boundary-wAll.boundary)/Math.max(1,wWall.boundary)).toFixed(4)}%`);

// ---- tread z-bands ----
if (n > NW) {
  const bands = new Map();
  let zmin = Infinity, zmax = -Infinity, spanMax = 0;
  const vz = [];
  for (let f = NW; f < n; f++) {
    const t = tri(f);
    const z0 = Math.min(t[0][2], t[1][2], t[2][2]);
    const z1 = Math.max(t[0][2], t[1][2], t[2][2]);
    zmin = Math.min(zmin, z0); zmax = Math.max(zmax, z1); spanMax = Math.max(spanMax, z1 - z0);
    const k = (Math.round(((z0 + z1) / 2) * 10) / 10).toFixed(1);
    bands.set(k, (bands.get(k) || 0) + 1);
    for (const p of t) vz.push(p[2]);
  }
  console.log(`\nTREAD z: min ${zmin.toFixed(5)} max ${zmax.toFixed(5)}  max facet z-span ${spanMax.toExponential(4)} mm`);
  console.log(`TREAD bands: ${[...bands.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`z=${k} n=${v}`).join('   ')}`);
  // distance of every tread vertex to the nearest 0.1-rounded plane centre
  const centres = [...bands.keys()].map(Number);
  let dmax = 0, dsum = 0;
  for (const z of vz) {
    let best = Infinity;
    for (const c of centres) best = Math.min(best, Math.abs(z - c));
    dmax = Math.max(dmax, best); dsum += best;
  }
  console.log(`TREAD vertices ${vz.length}: |z - nearest band centre| max ${(dmax*1000).toFixed(4)} um  mean ${(dsum/vz.length*1000).toFixed(4)} um`);
  // how many WALL facets fall inside a band (centre +/- 4.1 um)
  let wallIn = 0;
  for (let f = 0; f < NW; f++) {
    const t = tri(f);
    const z0 = Math.min(t[0][2], t[1][2], t[2][2]);
    const z1 = Math.max(t[0][2], t[1][2], t[2][2]);
    for (const c of centres) if (z0 >= c - 0.0041 && z1 <= c + 0.0041) { wallIn++; break; }
  }
  console.log(`WALL facets fully inside a tread band (+/-4.1 um): ${wallIn}`);
}
console.log('DONE');
