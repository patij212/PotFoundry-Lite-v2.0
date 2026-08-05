// s91GeomMd5.cjs — GEOMETRY-ONLY md5 of a binary STL: the 36 vertex bytes of every facet, in slot order.
// Header (80 B + count) and the DERIVED per-facet normal are EXCLUDED on purpose, so the digest tests
// the MESH rather than two writers' formatting. This is K-L-GATE's instrument (S81 §4.1 used the same
// construction).  Usage: node research/tools/s91GeomMd5.cjs a.stl b.stl ...
const fs = require('node:fs'); const crypto = require('node:crypto');
for (const p of process.argv.slice(2)) {
  let buf; try { buf = fs.readFileSync(p); } catch (e) { console.log(`${p}  MISSING`); continue; }
  const n = buf.readUInt32LE(80);
  if (buf.length !== 84 + n * 50) { console.log(`${p}  SIZE MISMATCH ${buf.length} != 84+${n}*50`); continue; }
  const geo = Buffer.alloc(n * 36);
  for (let t = 0; t < n; t += 1) buf.copy(geo, t * 36, 84 + t * 50 + 12, 84 + t * 50 + 48);
  console.log(`${crypto.createHash('md5').update(geo).digest('hex')}  nTri ${n}  ${p}`);
}
