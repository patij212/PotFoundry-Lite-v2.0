// s120Prov.cjs — S120 provenance: facet count + 3-D area of a binary STL, against the published baselines.
// "CT guard-ON = 1,282,394 facets / 48,535.770 mm2   Gothic S39CTL = 1,142,166 / 38,453.259 mm2"
const fs = require('node:fs');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const tag = args[i]; const p = args[i + 1];
  if (!fs.existsSync(p)) { console.log(`${tag}: ABSENT ${p}`); continue; }
  const fd = fs.openSync(p, 'r');
  const h = Buffer.alloc(84); fs.readSync(fd, h, 0, 84, 0);
  const n = h.readUInt32LE(80);
  let area = 0; const B = 20000; const blk = Buffer.alloc(50 * B);
  for (let d = 0; d < n; d += B) {
    const m = Math.min(B, n - d);
    let got = 0; while (got < m * 50) { const r = fs.readSync(fd, blk, got, m * 50 - got, 84 + d * 50 + got); if (r <= 0) break; got += r; }
    for (let t = 0; t < m; t += 1) {
      const o = t * 50 + 12; const v = [];
      for (let k = 0; k < 9; k += 1) v.push(blk.readFloatLE(o + k * 4));
      const ux = v[3] - v[0]; const uy = v[4] - v[1]; const uz = v[5] - v[2];
      const wx = v[6] - v[0]; const wy = v[7] - v[1]; const wz = v[8] - v[2];
      area += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    }
  }
  fs.closeSync(fd);
  console.log(`${tag}: ${n.toLocaleString()} facets, ${area.toFixed(3)} mm2`);
}
