// Max vertex degree (triangle incidence) of a binary STL, by exact f32 vertex weld.
// Same construction the S81/S82 census used, so the number is comparable to their 2,550.
const fs = require('fs');
function maxDeg(path) {
  const b = fs.readFileSync(path);
  const n = b.readUInt32LE(80);
  const map = new Map();
  const deg = [];
  let NV = 0;
  for (let t = 0; t < n; t += 1) {
    const o = 84 + t * 50 + 12;
    for (let e = 0; e < 3; e += 1) {
      const x = b.readFloatLE(o + e * 12);
      const y = b.readFloatLE(o + e * 12 + 4);
      const z = b.readFloatLE(o + e * 12 + 8);
      const k = `${x},${y},${z}`;
      let v = map.get(k);
      if (v === undefined) { v = NV; map.set(k, v); deg.push(0); NV += 1; }
      deg[v] += 1;
    }
  }
  deg.sort((p, q) => p - q);
  const q = (f) => deg[Math.min(deg.length - 1, Math.floor(f * deg.length))];
  const over = (m) => deg.reduce((s, d) => s + (d >= m ? 1 : 0), 0);
  return { n, NV, p50: q(0.5), p99: q(0.99), max: deg[deg.length - 1], ge64: over(64), ge100: over(100), ge1000: over(1000) };
}
for (const p of process.argv.slice(2)) {
  const r = maxDeg(p);
  console.log(`${p.split(/[\\/]/).pop()}`);
  console.log(`   tris ${r.n}  welded verts ${r.NV}   degree p50 ${r.p50}  p99 ${r.p99}  MAX ${r.max}   >=64: ${r.ge64}  >=100: ${r.ge100}  >=1000: ${r.ge1000}`);
}
