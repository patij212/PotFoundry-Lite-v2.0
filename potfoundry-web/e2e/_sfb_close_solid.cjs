// _sfb_close_solid.cjs — close the clean structured-ridge OUTER WALL into a WATERTIGHT
// solid by fan-capping its two open rims (top z≈H, bottom z≈0). Reads the P3b STL,
// welds, finds the count-1 boundary loops, fans each to its centroid, verifies the
// result has ZERO boundary edges (closed), writes a printable solid STL.
// Pure CPU, no rebuild. Usage: node e2e/_sfb_close_solid.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const IN = path.join(OUT, 'SuperformulaBlossom_sf1_structured_p3b.stl');
const DST = path.join(OUT, 'SuperformulaBlossom_sf1_solid.stl');

function readStl(file) {
  const buf = fs.readFileSync(file);
  const nTri = buf.readUInt32LE(80);
  const tris = []; // [ [x,y,z]x3 ]
  let off = 84;
  for (let t = 0; t < nTri; t++) {
    const v = [];
    for (let k = 0; k < 3; k++) { const b = off + 12 + k * 12; v.push([buf.readFloatLE(b), buf.readFloatLE(b + 4), buf.readFloatLE(b + 8)]); }
    tris.push(v); off += 50;
  }
  return tris;
}

const Q = 1e4; // weld quantum (0.1µm)
const key = (p) => `${Math.round(p[0] * Q)},${Math.round(p[1] * Q)},${Math.round(p[2] * Q)}`;

(function main() {
  const rawTris = readStl(IN);
  // weld
  const idOf = new Map(); const verts = [];
  const vid = (p) => { const k = key(p); let i = idOf.get(k); if (i === undefined) { i = verts.length; idOf.set(k, i); verts.push(p); } return i; };
  const faces = rawTris.map((v) => [vid(v[0]), vid(v[1]), vid(v[2])]);

  // edge use count + the directed half-edge (for orientation of caps)
  const ek = (a, b) => (a < b ? a * 1e8 + b : b * 1e8 + a);
  const count = new Map();
  const dir = new Map(); // undirected key -> one [from,to] (the single boundary traversal)
  for (const [a, b, c] of faces) for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = ek(i, j); count.set(k, (count.get(k) || 0) + 1); if (!dir.has(k)) dir.set(k, [i, j]); else dir.set(k, [...(dir.get(k) || []), i, j]); }

  // boundary edges = count 1. Build adjacency (undirected) + remember the boundary half-edge direction.
  const adj = new Map(); const bedge = []; // [from,to] as the single triangle traverses it
  for (const [a, b, c] of faces) for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = ek(i, j); if (count.get(k) === 1) { bedge.push([i, j]); if (!adj.has(i)) adj.set(i, []); if (!adj.has(j)) adj.set(j, []); adj.get(i).push(j); adj.get(j).push(i); } }

  // trace boundary loops
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    let prev = -1, cur = start; const loop = [];
    for (let g = 0; g < adj.size + 2; g++) { loop.push(cur); seen.add(cur); const nb = adj.get(cur); const nx = nb[0] !== prev ? nb[0] : nb[1]; prev = cur; cur = nx; if (cur === start) break; }
    loops.push(loop);
  }

  // boundary half-edge orientation: map ordered pair "from>to" so caps wind OPPOSITE the wall (outward solid).
  const bset = new Set(bedge.map(([i, j]) => `${i}>${j}`));
  const newFaces = faces.slice();
  let capped = 0;
  for (const loop of loops) {
    // centroid
    const c = [0, 0, 0]; for (const v of loop) { c[0] += verts[v][0]; c[1] += verts[v][1]; c[2] += verts[v][2]; }
    c[0] /= loop.length; c[1] /= loop.length; c[2] /= loop.length;
    const ci = verts.length; verts.push(c);
    // fan: for each loop edge, the WALL traversed it from→to; the cap must traverse to→from (opposite) so the
    // shared edge is count-2 with opposite winding ⇒ consistent outward solid.
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      // pick the order that the WALL did NOT use (opposite) for the cap triangle (center, wallTo, wallFrom)
      if (bset.has(`${a}>${b}`)) newFaces.push([ci, b, a]);
      else newFaces.push([ci, a, b]);
      capped++;
    }
  }

  // verify watertight
  const c2 = new Map();
  for (const [a, b, cc] of newFaces) for (const [i, j] of [[a, b], [b, cc], [cc, a]]) { const k = ek(i, j); c2.set(k, (c2.get(k) || 0) + 1); }
  let bnd = 0, nonman = 0; for (const [, n] of c2) { if (n === 1) bnd++; else if (n > 2) nonman++; }

  // write solid STL (per-face normal)
  const nTri = newFaces.length;
  const out = Buffer.alloc(80 + 4 + nTri * 50); out.write('SFB sf1 structured-ridge SOLID', 0, 'ascii'); out.writeUInt32LE(nTri, 80);
  let off = 84;
  for (const [a, b, cc] of newFaces) {
    const A = verts[a], B = verts[b], C = verts[cc];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    out.writeFloatLE(nx, off); out.writeFloatLE(ny, off + 4); out.writeFloatLE(nz, off + 8);
    for (let k = 0; k < 3; k++) { const pp = [A, B, C][k]; out.writeFloatLE(pp[0], off + 12 + k * 12); out.writeFloatLE(pp[1], off + 16 + k * 12); out.writeFloatLE(pp[2], off + 20 + k * 12); }
    out.writeUInt16LE(0, off + 48); off += 50;
  }
  fs.writeFileSync(DST, out);
  console.log(`[CLOSE SOLID] welded verts=${verts.length} wallFaces=${faces.length} loops=${loops.length} (${loops.map((l) => l.length).join(',')}) capped=${capped}`);
  console.log(`  watertight: boundaryEdges=${bnd} nonManifold=${nonman} ${bnd === 0 && nonman === 0 ? '⇒ CLOSED SOLID ✓' : '⇒ NOT CLOSED'}`);
  console.log(`  wrote ${path.relative(path.resolve(__dirname, '..'), DST)} (${nTri} tris)`);
})();
