// Sliver census on a binary STL. Standalone + outside the repo ON PURPOSE: the dev server is serving
// potfoundry-web, and writing there while a browser job runs triggers an HMR reload that kills it.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
const buf = readFileSync(path);
const nTri = buf.readUInt32LE(80);

const bins = { a20: 0, a10: 0, a5: 0, a1: 0, a01: 0 };
let worstAngle = 180, worstIdx = -1, worstEdges = null, worstZ = 0;
const areas = [];
let degenerate = 0;
// aspect = longest edge / (2 * inradius); 1 = equilateral, large = sliver
let worstAspect = 0, worstAspectIdx = -1;
const aspectOver = { x10: 0, x100: 0, x1000: 0 };

const v = new Float32Array(9);
for (let t = 0; t < nTri; t += 1) {
  const o = 84 + t * 50 + 12;
  for (let k = 0; k < 9; k += 1) v[k] = buf.readFloatLE(o + k * 4);
  const ax = v[0], ay = v[1], az = v[2];
  const bx = v[3], by = v[4], bz = v[5];
  const cx = v[6], cy = v[7], cz = v[8];
  const la = Math.hypot(bx - cx, by - cy, bz - cz);
  const lb = Math.hypot(ax - cx, ay - cy, az - cz);
  const lc = Math.hypot(ax - bx, ay - by, az - bz);
  const s = (la + lb + lc) / 2;
  const cross = [
    (by - ay) * (cz - az) - (bz - az) * (cy - ay),
    (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
  ];
  const area = 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
  if (area <= 0 || !Number.isFinite(area)) { degenerate += 1; continue; }
  areas.push(area);
  // smallest angle is opposite the shortest edge
  const clamp = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
  const angA = Math.acos(clamp((lb * lb + lc * lc - la * la) / (2 * lb * lc)));
  const angB = Math.acos(clamp((la * la + lc * lc - lb * lb) / (2 * la * lc)));
  const angC = Math.PI - angA - angB;
  const mn = (Math.min(angA, angB, angC) * 180) / Math.PI;
  if (mn < 20) bins.a20 += 1;
  if (mn < 10) bins.a10 += 1;
  if (mn < 5) bins.a5 += 1;
  if (mn < 1) bins.a1 += 1;
  if (mn < 0.1) bins.a01 += 1;
  if (mn < worstAngle) {
    worstAngle = mn; worstIdx = t;
    worstEdges = [la * 1000, lb * 1000, lc * 1000].map((x) => +x.toFixed(1));
    worstZ = +((az + bz + cz) / 3).toFixed(3);
  }
  const inr = area / s;
  const asp = Math.max(la, lb, lc) / (2 * inr);
  if (asp > 10) aspectOver.x10 += 1;
  if (asp > 100) aspectOver.x100 += 1;
  if (asp > 1000) aspectOver.x1000 += 1;
  if (asp > worstAspect) { worstAspect = asp; worstAspectIdx = t; }
}

const pct = (x) => `${((100 * x) / nTri).toFixed(3)}%`;
areas.sort((x, y) => x - y);
console.log(`${path.split(/[\\/]/).pop()}  ${nTri} triangles`);
console.log(`  min angle < 20deg : ${bins.a20} (${pct(bins.a20)})`);
console.log(`  min angle < 10deg : ${bins.a10} (${pct(bins.a10)})`);
console.log(`  min angle <  5deg : ${bins.a5} (${pct(bins.a5)})`);
console.log(`  min angle <  1deg : ${bins.a1} (${pct(bins.a1)})`);
console.log(`  min angle < 0.1deg: ${bins.a01} (${pct(bins.a01)})`);
console.log(`  WORST angle       : ${worstAngle.toFixed(5)} deg  tri#${worstIdx}  edges(um)=${worstEdges}  z~${worstZ}`);
console.log(`  aspect >10 / >100 / >1000 : ${aspectOver.x10} (${pct(aspectOver.x10)}) / ${aspectOver.x100} (${pct(aspectOver.x100)}) / ${aspectOver.x1000} (${pct(aspectOver.x1000)})`);
console.log(`  WORST aspect      : ${worstAspect.toFixed(1)}  tri#${worstAspectIdx}`);
console.log(`  area min/median   : ${areas[0]?.toExponential(3)} / ${areas[areas.length >> 1]?.toExponential(3)} mm^2`);
console.log(`  zero-area tris    : ${degenerate}`);
