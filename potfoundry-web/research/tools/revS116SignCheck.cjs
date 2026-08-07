// revS116SignCheck.cjs — does the shipped mesh actually carry ONE parametric orientation sign?
// The S116 claim's whole "by construction" argument is: radial projection preserves (theta,z), so the
// parametric footprint sign CANNOT flip. That is a statement about the FILE, so measure it on the FILE.
// Analytic-free: parSigned needs only (theta, z), exactly as the operator's own guard computes it.
const fs = require('node:fs');
const TWO_PI = 2 * Math.PI;
const dThRaw = (a, b) => { let d = b - a; if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI; return d; };

function run(path, tag) {
  const buf = fs.readFileSync(path);
  const nTri = buf.readUInt32LE(80);
  if (buf.length !== 84 + nTri * 50) throw new Error('size mismatch');
  let o = 84;
  let nPos = 0, nNeg = 0, nZero = 0;
  let aPos = 0, aNeg = 0, aZero = 0;
  let areaTot = 0;
  const negAreas = [];
  const v = new Float64Array(9);
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { v[k] = buf.readFloatLE(o); o += 4; }
    o += 2;
    const ax = v[0], ay = v[1], az = v[2], bx = v[3], by = v[4], bz = v[5], cx = v[6], cy = v[7], cz = v[8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    areaTot += area;
    const tp = Math.atan2(ay, ax);
    const tq = tp + dThRaw(tp, Math.atan2(by, bx));
    const tr = tp + dThRaw(tp, Math.atan2(cy, cx));
    const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const s = 0.5 * ((tq - tp) * rm * (cz - az) - (tr - tp) * rm * (bz - az));
    if (s > 0) { nPos += 1; aPos += area; }
    else if (s < 0) { nNeg += 1; aNeg += area; negAreas.push(area); }
    else { nZero += 1; aZero += area; }
  }
  const p = (a, b) => ((a / b) * 100).toFixed(6);
  console.log(`── ${tag}  ${nTri} facets  ${areaTot.toFixed(4)} mm2`);
  console.log(`   parametric sign +  COUNT ${nPos} (${p(nPos, nTri)}%)  AREA ${aPos.toFixed(4)} (${p(aPos, areaTot)}%)`);
  console.log(`   parametric sign -  COUNT ${nNeg} (${p(nNeg, nTri)}%)  AREA ${aNeg.toFixed(6)} (${p(aNeg, areaTot)}%)`);
  console.log(`   parametric sign 0  COUNT ${nZero} (${p(nZero, nTri)}%)  AREA ${aZero.toFixed(6)} (${p(aZero, areaTot)}%)`);
  const minority = nPos >= nNeg ? { n: nNeg, a: aNeg, lbl: '-' } : { n: nPos, a: aPos, lbl: '+' };
  console.log(`   => MINORITY (inverted) sign '${minority.lbl}': COUNT ${minority.n} (${p(minority.n, nTri)}%)  AREA ${minority.a.toExponential(4)} mm2 (${p(minority.a, areaTot)}% of mesh)`);
  if (negAreas.length > 0) {
    negAreas.sort((x, y) => x - y);
    console.log(`   inverted-facet area mm2: p50 ${negAreas[Math.floor(negAreas.length * 0.5)].toExponential(3)}  MAX ${negAreas[negAreas.length - 1].toExponential(3)}`);
  }
  return { nTri, areaTot, nPos, nNeg, nZero, aPos, aNeg, aZero };
}

const BEST = process.env.PF_SC_BEST;
const BASE = process.env.PF_SC_BASE;
console.log('revS116SignCheck — parametric footprint orientation, straight off the written files');
const b = run(BEST, 'BEST (S116_BEST_GOTH_APCR.stl)');
console.log('');
const s = run(BASE, 'BASELINE (shipping mesh)');
console.log('');
const bm = Math.min(b.nPos, b.nNeg), sm = Math.min(s.nPos, s.nNeg);
const bma = b.nPos <= b.nNeg ? b.aPos : b.aNeg, sma = s.nPos <= s.nNeg ? s.aPos : s.aNeg;
console.log(`VERDICT  inverted COUNT  best ${bm}  base ${sm}`);
console.log(`VERDICT  inverted AREA   best ${bma.toExponential(4)}  base ${sma.toExponential(4)}`);
console.log(bm === 0 && sm === 0
  ? 'BOTH meshes carry exactly ONE parametric orientation — the "sign cannot flip" claim HOLDS on the file.'
  : 'AT LEAST ONE mesh contains parametric-orientation-inverted facets.');
