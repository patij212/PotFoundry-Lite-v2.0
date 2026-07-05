// _pf_direct_svg.test.ts — DEV-ONLY (PF_SVG=1). Dump a small (u,t) window of the direct-strip mesh as an SVG
// wireframe so the connectivity/needles are VISIBLE. Trust the picture over the metric.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// minimal RGB PNG writer (no deps). buf = Uint8Array of W*H*3.
function writePNG(path: string, W: number, H: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; rgb.subarray(y * W * 3, (y + 1) * W * 3).forEach((v, i) => { raw[y * (1 + W * 3) + 1 + i] = v; }); }
  const idat = deflateSync(raw);
  const crcTable: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer): Buffer => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}
import { makeGothicPatch } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path); const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const uv: number[] = new Array(nV * 2), tris: number[] = new Array(nT * 3);
  let o = 8; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

describe('direct-svg', () => {
  it.skipIf(process.env.PF_SVG !== '1')('svg window', () => {
    const style = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
    const patch = style === 'geostar' ? makeGeoStarPatch(2, 8) : makeGothicPatch(2, 8);
    const dir = join(process.cwd(), 'research', 'exchange', `_pf_creststrip_direct_${style}_smoke`);
    const bin = loadBin(join(dir, 'direct_mesh.bin'));
    if (!bin) { /* eslint-disable-next-line no-console */ console.log('no mesh'); expect(false).toBe(false); return; }
    const { uv, tris } = bin;
    // window: a small (u,t) box around the band center / a crest
    const u0 = Number(process.env.PF_U0 ?? 0.02), u1 = Number(process.env.PF_U1 ?? 0.06);
    const t0 = Number(process.env.PF_T0 ?? patch.tLo), t1 = Number(process.env.PF_T1 ?? (patch.tLo + (patch.tHi - patch.tLo) * 0.15));
    const W = 1400, Hh = 1400, pad = 20;
    const sx = (u: number): number => pad + (u - u0) / (u1 - u0) * (W - 2 * pad);
    const sy = (t: number): number => Hh - pad - (t - t0) / (t1 - t0) * (Hh - 2 * pad);
    const inBox = (i: number): boolean => uv[2 * i] >= u0 && uv[2 * i] <= u1 && uv[2 * i + 1] >= t0 && uv[2 * i + 1] <= t1;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="background:#fff">`;
    let nDraw = 0;
    for (let f = 0; f < tris.length / 3; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      if (!inBox(a) && !inBox(b) && !inBox(c)) continue;
      const pts = `${sx(uv[2 * a])},${sy(uv[2 * a + 1])} ${sx(uv[2 * b])},${sy(uv[2 * b + 1])} ${sx(uv[2 * c])},${sy(uv[2 * c + 1])}`;
      svg += `<polygon points="${pts}" fill="none" stroke="#333" stroke-width="0.6"/>`;
      nDraw++;
    }
    svg += '</svg>';
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'window.svg'), svg);
    // rasterize the wireframe to PNG (white bg, dark edges) via Bresenham lines
    const rgb = new Uint8Array(W * Hh * 3).fill(255);
    const setpx = (x: number, y: number): void => { x = Math.round(x); y = Math.round(y); if (x < 0 || x >= W || y < 0 || y >= Hh) return; const o = (y * W + x) * 3; rgb[o] = 30; rgb[o + 1] = 30; rgb[o + 2] = 40; };
    const line = (x0: number, y0: number, x1: number, y1: number): void => {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0); const sx2 = x0 < x1 ? 1 : -1, sy2 = y0 < y1 ? 1 : -1; let err = dx + dy;
      for (;;) { setpx(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx2; } if (e2 <= dx) { err += dx; y0 += sy2; } }
    };
    for (let f = 0; f < tris.length / 3; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      if (!inBox(a) && !inBox(b) && !inBox(c)) continue;
      const xa = sx(uv[2 * a]), ya = sy(uv[2 * a + 1]), xb = sx(uv[2 * b]), yb = sy(uv[2 * b + 1]), xc = sx(uv[2 * c]), yc = sy(uv[2 * c + 1]);
      line(xa, ya, xb, yb); line(xb, yb, xc, yc); line(xc, yc, xa, ya);
    }
    writePNG(join(dir, 'window.png'), W, Hh, rgb);
    /* eslint-disable-next-line no-console */
    console.log(`[svg ${style}] wrote window.svg with ${nDraw} tris in u[${u0},${u1}] t[${t0.toFixed(4)},${t1.toFixed(4)}]`);
    expect(nDraw).toBeGreaterThan(0);
  }, 120000);
});
