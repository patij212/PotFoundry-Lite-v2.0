const fs = require('fs'), path = require('path');
const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');
const buf = fs.readFileSync(STL); const nTri = buf.readUInt32LE(80);
let off = 84, agreeStored = 0, storedZero = 0, n = 0;
let outwardComputed = 0, inwardComputed = 0;
const TAU = Math.PI * 2;
const RB = 720; const rMax = new Float64Array(RB);
for (let t = 0; t < nTri; t++) {
  const sb = off; const snx = buf.readFloatLE(sb), sny = buf.readFloatLE(sb + 4), snz = buf.readFloatLE(sb + 8);
  const b = off + 12;
  const ax = buf.readFloatLE(b), ay = buf.readFloatLE(b + 4), az = buf.readFloatLE(b + 8);
  const bx = buf.readFloatLE(b + 12), by = buf.readFloatLE(b + 16), bz = buf.readFloatLE(b + 20);
  const cx = buf.readFloatLE(b + 24), cy = buf.readFloatLE(b + 28), cz = buf.readFloatLE(b + 32);
  off += 50;
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz);
  const sl = Math.hypot(snx, sny, snz);
  if (sl < 1e-6) { storedZero++; } else {
    const dot = (nx * snx + ny * sny + nz * snz) / (nl * sl); if (dot > 0.5) agreeStored++;
  }
  const ccx = (ax + bx + cx) / 3, ccy = (ay + by + cy) / 3, ccz = (az + bz + cz) / 3, cr = Math.hypot(ccx, ccy);
  if (cr > 42 && ccz > 8 && ccz < 112) {
    const dOut = (nx * ccx + ny * ccy) / (nl * cr); if (dOut > 0) outwardComputed++; else inwardComputed++;
    const th = ((Math.atan2(ccy, ccx) + TAU) % TAU); const bi = Math.min(RB - 1, Math.floor(th / TAU * RB));
    if (cr > rMax[bi]) rMax[bi] = cr;
  }
  n++;
}
console.log(`tris=${n} storedNormalZero=${storedZero} computedAgreesStored(dot>0.5)=${agreeStored} (${(100 * agreeStored / n).toFixed(2)}%)`);
console.log(`computed-normal vs radial-outward: outward=${outwardComputed} inward=${inwardComputed} (${(100 * inwardComputed / (outwardComputed + inwardComputed)).toFixed(3)}% inward)`);
const prof = new Float64Array(RB); for (let i = 0; i < RB; i++) prof[i] = rMax[i] > 0 ? rMax[i] : NaN;
for (let i = 0; i < RB; i++) if (Number.isNaN(prof[i])) prof[i] = prof[(i + RB - 1) % RB] || 40;
const sm = new Float64Array(RB); for (let i = 0; i < RB; i++) { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { s += prof[(i + k + RB) % RB]; c++; } sm[i] = s / c; }
const gmax = Math.max(...sm), gmin = Math.min(...sm); let peaks = 0;
for (let i = 0; i < RB; i++) { const p = sm[(i + RB - 1) % RB], c = sm[i], nn = sm[(i + 1) % RB]; if (c >= p && c > nn && c > gmin + 0.5 * (gmax - gmin)) peaks++; }
console.log(`outer maxR profile: min=${gmin.toFixed(1)} max=${gmax.toFixed(1)}; prominent maxima(petals)~=${peaks}`);
