// Where do the thin faces (minAngle<5deg) and slivers sit relative to the local
// radial-gradient (cusp = ridge->valley boundary)? Uses a per-face local radial slope
// computed from the welded mesh's theta-r profile at fine resolution, robustly.
const fs = require('fs'), path = require('path');
const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');
const buf = fs.readFileSync(STL); const nTri = buf.readUInt32LE(80);
const TAU = Math.PI * 2;

// Pass 1: build fine theta->mean radius profile from ALL outer-wall faces.
const RB = 1440;
const rSum = new Float64Array(RB), rCnt = new Float64Array(RB);
let off = 84;
const N = nTri;
const minAngArr = new Float32Array(N), thArr = new Float32Array(N), zArr = new Float32Array(N), crArr = new Float32Array(N), outArr = new Uint8Array(N);
for (let t = 0; t < N; t++) {
  const b = off + 12;
  const ax = buf.readFloatLE(b), ay = buf.readFloatLE(b + 4), az = buf.readFloatLE(b + 8);
  const bx = buf.readFloatLE(b + 12), by = buf.readFloatLE(b + 16), bz = buf.readFloatLE(b + 20);
  const cx = buf.readFloatLE(b + 24), cy = buf.readFloatLE(b + 28), cz = buf.readFloatLE(b + 32);
  off += 50;
  const eAB = Math.hypot(bx - ax, by - ay, bz - az), eBC = Math.hypot(cx - bx, cy - by, cz - bz), eCA = Math.hypot(ax - cx, ay - cy, az - cz);
  let m = 0;
  if (eAB > 1e-9 && eBC > 1e-9 && eCA > 1e-9) {
    const ang = (o1, o2, opp) => Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - opp * opp) / (2 * o1 * o2)))) * 180 / Math.PI;
    m = Math.min(ang(eAB, eCA, eBC), ang(eAB, eBC, eCA), ang(eBC, eCA, eAB));
  }
  const ccx = (ax + bx + cx) / 3, ccy = (ay + by + cy) / 3, ccz = (az + bz + cz) / 3, cr = Math.hypot(ccx, ccy);
  const th = (Math.atan2(ccy, ccx) + TAU) % TAU;
  const isOuter = cr > 42 && ccz > 8 && ccz < 112;
  minAngArr[t] = m; thArr[t] = th; zArr[t] = ccz; crArr[t] = cr; outArr[t] = isOuter ? 1 : 0;
  if (isOuter) { const bi = Math.min(RB - 1, Math.floor(th / TAU * RB)); rSum[bi] += cr; rCnt[bi]++; }
}
const rProf = new Float64Array(RB);
for (let i = 0; i < RB; i++) rProf[i] = rCnt[i] > 0 ? rSum[i] / rCnt[i] : NaN;
for (let i = 0; i < RB; i++) if (Number.isNaN(rProf[i])) rProf[i] = rProf[(i + RB - 1) % RB] || 40;
// local |dr/dtheta| per bin (central diff, units mm per bin)
const slope = new Float64Array(RB);
for (let i = 0; i < RB; i++) slope[i] = Math.abs(rProf[(i + 1) % RB] - rProf[(i + RB - 1) % RB]);
const sSorted = Array.from(slope).sort((a, b) => a - b);
const sMedian = sSorted[Math.floor(0.5 * RB)], sP85 = sSorted[Math.floor(0.85 * RB)];

// For thin/sliver faces, report the distribution of local slope (mm/bin) at their theta,
// vs the all-faces baseline. If thin faces concentrate where slope is high => cusp-driven.
function slopeStats(pred, label) {
  const vals = [];
  let cnt = 0;
  for (let t = 0; t < N; t++) { if (!outArr[t]) continue; if (!pred(t)) continue; cnt++; const bi = Math.min(RB - 1, Math.floor(thArr[t] / TAU * RB)); vals.push(slope[bi]); }
  if (vals.length === 0) { console.log(`  [${label}] none`); return; }
  vals.sort((a, b) => a - b);
  const hi = vals.filter((v) => v >= sP85).length;
  console.log(`  [${label}] n=${cnt} localSlope p50=${vals[Math.floor(0.5 * vals.length)].toFixed(3)} p90=${vals[Math.floor(0.9 * vals.length)].toFixed(3)}  frac in top-15%-slope(cusp)=${(100 * hi / vals.length).toFixed(1)}% (baseline 15%)`);
}
console.log(`[radial slope baseline] median=${sMedian.toFixed(3)} p85=${sP85.toFixed(3)} mm/bin (bin=${(360 / RB).toFixed(2)}deg)`);
console.log(`[outer-wall faces, local radial-slope at their theta]`);
slopeStats(() => true, 'ALL outer');
slopeStats((t) => minAngArr[t] < 5, 'minAngle<5');
slopeStats((t) => minAngArr[t] < 1, 'sliver<1');

// z-distribution of thin faces: are they at the rim/base or spread over the wall?
function zBins(pred, label) {
  const zb = new Array(11).fill(0); let cnt = 0;
  for (let t = 0; t < N; t++) { if (!outArr[t] || !pred(t)) continue; cnt++; zb[Math.min(10, Math.floor((zArr[t] - 8) / (104 / 11)))]++; }
  console.log(`  [${label}] n=${cnt} z(8..112,11b): ${zb.join(',')}`);
}
console.log(`[z distribution]`);
zBins((t) => minAngArr[t] < 5, 'minAngle<5');
zBins((t) => minAngArr[t] < 1, 'sliver<1');
