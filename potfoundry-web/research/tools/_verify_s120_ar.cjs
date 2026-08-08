// INDEPENDENT VERIFIER (refutation pass) — recompute aspect3 census straight off a binary STL.
// No dependence on s120dPole.cjs or s118ThinCensus.ts. aspect3 transcribed from _shapeGuard.ts:61-75.
const fs = require('fs');
const f = process.argv[2];
const buf = fs.readFileSync(f);
const n = buf.readUInt32LE(80);
let over = 0, overArea = 0, maxAr = 0, total = 0, area = 0;
let poles = 0, poleArea = 0, maxGR = 0;
const hyp = (a, b, c) => Math.sqrt(a * a + b * b + c * c);
for (let i = 0; i < n; i++) {
  const o = 84 + i * 50 + 12;
  const ax = buf.readFloatLE(o), ay = buf.readFloatLE(o + 4), az = buf.readFloatLE(o + 8);
  const bx = buf.readFloatLE(o + 12), by = buf.readFloatLE(o + 16), bz = buf.readFloatLE(o + 20);
  const cx = buf.readFloatLE(o + 24), cy = buf.readFloatLE(o + 28), cz = buf.readFloatLE(o + 32);
  const e0 = hyp(bx - ax, by - ay, bz - az);
  const e1 = hyp(cx - bx, cy - by, cz - bz);
  const e2 = hyp(ax - cx, ay - cy, az - cz);
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  const A = 0.5 * hyp(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  total++;
  area += A;
  const L = Math.max(e0, e1, e2);
  const ar = A > 0 ? (L * (e0 + e1 + e2)) / (4 * A) : Infinity;
  if (ar > 50) { over++; overArea += A; }
  if (ar > maxAr) maxAr = ar;
  // graphRatio = longest edge / shortest altitude-ish proxy: use L / (2A/L) = L^2/(2A)
  const gr = A > 0 ? (L * L) / (2 * A) : Infinity;
  if (gr >= 100) { poles++; poleArea += A; }
  if (gr > maxGR) maxGR = gr;
}
console.log(f.split(/[\\/]/).pop());
console.log('  facets', total, ' area mm2', area.toFixed(3));
console.log('  aspect3>50  count', over, ' area', overArea.toFixed(6), ' MAX aspect3', maxAr.toFixed(3));
console.log('  L^2/2A>=100 count', poles, ' area', poleArea.toFixed(6), ' MAX', maxGR.toFixed(1));
