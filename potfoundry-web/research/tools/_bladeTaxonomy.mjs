// research/tools/_bladeTaxonomy.mjs — DIAGNOSTIC ONLY (2026-07-29 blade investigation).
// Classifies the degenerate facets of an STL into NEEDLE (one edge ~0) vs CAP (one angle ~180deg,
// all edges long) and localises them to sub-mm in (theta-phase, z). The two shapes have DIFFERENT
// causes in a bisection mesher, so lumping them under "aspect ratio" hides the mechanism:
//   NEEDLE = two vertices placed at almost the same point  -> a PLACEMENT collision
//   CAP    = a vertex placed almost ON an existing edge     -> a vertex inserted into a neighbouring
//            triangle's interior/boundary without that triangle being split (or a chord along a curved
//            locus that a later locus vertex lands on)
// usage: node research/tools/_bladeTaxonomy.mjs <file.stl> [arThreshold]
import { readFileSync } from 'node:fs';

const path = process.argv[2];
const AR_T = Number.parseFloat(process.argv[3] ?? '50');
const buf = readFileSync(path);
const nT = buf.readUInt32LE(80);
const TWO_PI = Math.PI * 2;
const N_ARCH = 12;

let nBlade = 0, nNeedle = 0, nCap = 0, nBoth = 0;
const needleShort = [], capOff = [], capLong = [];
// fine 2-D map of blade density: theta-phase x z
const MB = 200, MZ = 240;
const mapB = new Int32Array(MB * MZ), mapA = new Int32Array(MB * MZ);
const nz = [];
const samples = [];

for (let i = 0; i < nT; i += 1) {
  const o = 84 + i * 50 + 12;
  const ax = buf.readFloatLE(o), ay = buf.readFloatLE(o + 4), az = buf.readFloatLE(o + 8);
  const bx = buf.readFloatLE(o + 12), by = buf.readFloatLE(o + 16), bz = buf.readFloatLE(o + 20);
  const cx = buf.readFloatLE(o + 24), cy = buf.readFloatLE(o + 28), cz = buf.readFloatLE(o + 32);
  const e = [Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz)];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nzz = ux * wy - uy * wx;
  const area = 0.5 * Math.hypot(nx, ny, nzz);
  const per = e[0] + e[1] + e[2];
  const L = Math.max(e[0], e[1], e[2]), S = Math.min(e[0], e[1], e[2]);
  const ar = area > 0 ? (L * per) / (4 * area) : Infinity;

  const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3, gz = (az + bz + cz) / 3;
  let th = Math.atan2(gy, gx); if (th < 0) th += TWO_PI;
  const phase = ((th * N_ARCH) / TWO_PI) % 1;
  const bi = Math.min(MB - 1, Math.floor(phase * MB));
  const zi = Math.min(MZ - 1, Math.max(0, Math.floor((gz / 120) * MZ)));
  mapA[bi * MZ + zi] += 1;

  if (ar <= AR_T) continue;
  nBlade += 1;
  mapB[bi * MZ + zi] += 1;
  // taxonomy: NEEDLE if shortest edge is a tiny fraction of the longest; CAP if the min ALTITUDE
  // (2*area/longest) is tiny while ALL edges are comparable.
  const alt = (2 * area) / L;
  const needle = S < 0.02 * L;
  const cap = !needle && alt < 0.02 * L;
  if (needle) { nNeedle += 1; needleShort.push(S * 1000); }
  else if (cap) { nCap += 1; capOff.push(alt * 1000); capLong.push(L * 1000); }
  else nBoth += 1;
  nz.push(gz);
  if (samples.length < 40 && ar > 500) samples.push({ i, ar, e: e.map((q) => q * 1000), alt: alt * 1000, phase, z: gz, needle, cap });
}

const pct = (a, p) => { if (a.length === 0) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`tris ${nT}   AR>${AR_T}: ${nBlade} (${(100 * nBlade / nT).toFixed(3)}%)`);
console.log(`  NEEDLE (min edge < 2% of longest)      : ${nNeedle}  (${(100 * nNeedle / nBlade).toFixed(1)}% of blades)`);
console.log(`     shortest-edge um  p05 ${pct(needleShort, 0.05)?.toFixed(3)}  p50 ${pct(needleShort, 0.5)?.toFixed(3)}  p95 ${pct(needleShort, 0.95)?.toFixed(3)}`);
console.log(`  CAP    (min altitude < 2% of longest, all edges long): ${nCap}  (${(100 * nCap / nBlade).toFixed(1)}%)`);
console.log(`     altitude um       p05 ${pct(capOff, 0.05)?.toFixed(4)}  p50 ${pct(capOff, 0.5)?.toFixed(4)}  p95 ${pct(capOff, 0.95)?.toFixed(4)}`);
console.log(`     longest edge um   p05 ${pct(capLong, 0.05)?.toFixed(1)}  p50 ${pct(capLong, 0.5)?.toFixed(1)}  p95 ${pct(capLong, 0.95)?.toFixed(1)}`);
console.log(`  neither (moderate)                     : ${nBoth}`);
console.log(`  blade z:  p01 ${pct(nz, 0.01)?.toFixed(2)}  p25 ${pct(nz, 0.25)?.toFixed(2)}  p50 ${pct(nz, 0.5)?.toFixed(2)}  p75 ${pct(nz, 0.75)?.toFixed(2)}  p99 ${pct(nz, 0.99)?.toFixed(2)}`);

// hottest cells
const cells = [];
for (let b = 0; b < MB; b += 1) for (let z = 0; z < MZ; z += 1) if (mapB[b * MZ + z] > 0) cells.push([mapB[b * MZ + z], mapA[b * MZ + z], b, z]);
cells.sort((x, y) => y[0] - x[0]);
console.log(`\n=== HOTTEST (theta-phase, z) CELLS  [phase = position inside ONE of the ${N_ARCH} bays] ===`);
console.log('   blades / all      phase          z(mm)');
for (const [nb, na, b, z] of cells.slice(0, 25)) {
  console.log(`  ${String(nb).padStart(7)} /${String(na).padStart(7)}   ${(b / MB).toFixed(4)}-${((b + 1) / MB).toFixed(4)}   ${((z / MZ) * 120).toFixed(2)}-${(((z + 1) / MZ) * 120).toFixed(2)}   ${(100 * nb / na).toFixed(1)}%`);
}
console.log(`\ncells with >0 blades: ${cells.length} of ${MB * MZ}   => blades occupy ${(100 * cells.length / (MB * MZ)).toFixed(2)}% of the (phase,z) map`);

console.log(`\n=== SAMPLES (AR>500) ===`);
for (const s of samples) console.log(`  tri ${String(s.i).padStart(8)} AR ${s.ar.toFixed(0).padStart(7)} edges ${s.e.map((q) => q.toFixed(2)).join('/')} um  alt ${s.alt.toFixed(4)} um  phase ${s.phase.toFixed(4)} z ${s.z.toFixed(3)}  ${s.needle ? 'NEEDLE' : s.cap ? 'CAP' : '-'}`);
