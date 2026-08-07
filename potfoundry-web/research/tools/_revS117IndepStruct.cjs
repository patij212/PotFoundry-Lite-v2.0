// _revS117IndepStruct.cjs — INDEPENDENT (no campaign bridge code) structural census of a binary STL.
// Refutation-side instrument for S117 P0. Reads the raw file, computes per-facet:
//   * 3D min altitude (mm)        -> the needle/blade test, independent of any arc-space mapping
//   * signed area of the (theta_unwrapped, z) footprint -> the INVERTED-footprint test
//   * 3D area                     -> so every count is reported with its area share
// No imports from research/bridge or src. Deliberately re-derives everything.
const fs = require('node:fs');

const path = process.argv[2];
if (!path) { console.error('usage: node _revS117IndepStruct.cjs <stl>'); process.exit(2); }
const buf = fs.readFileSync(path);
const nF = buf.readUInt32LE(80);
console.log(`file    ${path}`);
console.log(`facets  ${nF.toLocaleString()}  (size check ${buf.length === 84 + 50 * nF})`);

let area3d = 0;
let negFoot = 0, posFoot = 0, zeroFoot = 0;
let negFootArea = 0;
let nAlt2um = 0, nAlt0 = 0;
let altArea2um = 0;
let minAltMin = Infinity;
let zeroArea3d = 0;
const TAU = Math.PI * 2;
// altitude histogram edges (mm)
const HB = [0, 1e-9, 1e-6, 2e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, Infinity];
const hist = new Array(HB.length).fill(0);

for (let f = 0; f < nF; f += 1) {
  const o = 84 + 50 * f + 12;
  const ax = buf.readFloatLE(o), ay = buf.readFloatLE(o + 4), az = buf.readFloatLE(o + 8);
  const bx = buf.readFloatLE(o + 12), by = buf.readFloatLE(o + 16), bz = buf.readFloatLE(o + 20);
  const cx = buf.readFloatLE(o + 24), cy = buf.readFloatLE(o + 28), cz = buf.readFloatLE(o + 32);
  // 3D area via cross product
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const twoA = Math.hypot(nx, ny, nz);
  const A = 0.5 * twoA;
  area3d += A;
  if (A === 0) zeroArea3d += 1;
  // min altitude = 2A / longest edge
  const eab = Math.hypot(bx - ax, by - ay, bz - az);
  const ebc = Math.hypot(cx - bx, cy - by, cz - bz);
  const eca = Math.hypot(ax - cx, ay - cy, az - cz);
  const emax = Math.max(eab, ebc, eca);
  const alt = emax > 0 ? twoA / emax : 0;
  if (alt < minAltMin) minAltMin = alt;
  if (alt < 2e-3) { nAlt2um += 1; altArea2um += A; } // 2 um expressed in mm (the campaign's blade bar)
  if (alt === 0) nAlt0 += 1;
  for (let i = 1; i < HB.length; i += 1) { if (alt < HB[i]) { hist[i] += 1; break; } }
  // (theta, z) footprint, theta unwrapped against corner a
  const ta = Math.atan2(ay, ax);
  let db = Math.atan2(by, bx) - ta; if (db > Math.PI) db -= TAU; if (db < -Math.PI) db += TAU;
  let dc = Math.atan2(cy, cx) - ta; if (dc > Math.PI) dc -= TAU; if (dc < -Math.PI) dc += TAU;
  // signed area in (dtheta, z) with a at the origin
  const s = 0.5 * (db * (cz - az) - dc * (bz - az));
  if (s > 0) posFoot += 1; else if (s < 0) { negFoot += 1; negFootArea += A; } else zeroFoot += 1;
}

console.log(`3D area              ${area3d.toFixed(3)} mm2`);
console.log(`zero-3D-area facets  ${zeroArea3d}`);
console.log('');
console.log('-- NEEDLE / BLADE (3D min altitude, independent of any arc-space map) --');
console.log(`   MIN altitude over the whole mesh   ${minAltMin.toExponential(4)} mm`);
console.log(`   altitude == 0                      ${nAlt0}`);
console.log(`   altitude < 2 um  COUNT ${nAlt2um}  AREA ${altArea2um.toFixed(4)} mm2 = ${(100 * altArea2um / area3d).toFixed(4)}% OF MESH`);
console.log('   altitude histogram (mm):');
for (let i = 1; i < HB.length; i += 1) console.log(`     [${HB[i - 1]}, ${HB[i]})  ${hist[i].toLocaleString()}`);
console.log('');
console.log('-- INVERTED (theta,z) FOOTPRINT (sign of the parametric signed area) --');
console.log(`   positive ${posFoot.toLocaleString()}   negative ${negFoot.toLocaleString()}   zero ${zeroFoot.toLocaleString()}`);
const minority = Math.min(posFoot, negFoot);
const minArea = posFoot <= negFoot ? NaN : negFootArea;
console.log(`   MINORITY-SIGN COUNT ${minority.toLocaleString()} = ${(100 * minority / nF).toFixed(6)}% of facets`);
if (negFoot < posFoot) console.log(`   minority (negative) AREA ${negFootArea.toFixed(4)} mm2 = ${(100 * negFootArea / area3d).toFixed(6)}% OF MESH`);
