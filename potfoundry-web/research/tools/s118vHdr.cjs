// verifier: read binary STL header facet counts and check file size consistency
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const files = process.argv.slice(3);
for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(`${f}  MISSING`); continue; }
  const sz = fs.statSync(p).size;
  const fd = fs.openSync(p, 'r');
  const b = Buffer.alloc(4);
  fs.readSync(fd, b, 0, 4, 80);
  const hdr = Buffer.alloc(80);
  fs.readSync(fd, hdr, 0, 80, 0);
  fs.closeSync(fd);
  const n = b.readUInt32LE(0);
  const exp = 84 + n * 50;
  console.log(`${f}\n  size=${sz}  headerN=${n}  expected=${exp}  sizeMatch=${sz === exp ? 'YES' : 'NO (delta ' + (sz - exp) + ')'}`);
  console.log(`  hdr80="${hdr.toString('latin1').replace(/\0/g, ' ').trim()}"`);
}
