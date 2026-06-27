// SFB@1 CORRECTED export — production anisotropy (uBias = computeUBias, NOT the forced
// __pfConformingUBias=3 that the earlier STLs used and that doubled the sliver "spikes").
// Crests inserted (surfaceFidelityExact). Writes a binary STL the user can slice to
// compare against the spiky uBias=3 STL.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = 'SuperformulaBlossom';
const TARGET = 3_000_000;
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const T = 600_000;
fs.mkdirSync(OUT, { recursive: true });
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${l} timeout`)), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };

function buildBinarySTL(vertices, indices, header) {
  const nTri = indices.length / 3;
  const buf = Buffer.alloc(80 + 4 + nTri * 50);
  buf.write(header.slice(0, 79), 0, 'ascii');
  buf.writeUInt32LE(nTri, 80);
  let off = 84;
  for (let t = 0; t < nTri; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2];
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    buf.writeFloatLE(ax, off + 12); buf.writeFloatLE(ay, off + 16); buf.writeFloatLE(az, off + 20);
    buf.writeFloatLE(bx, off + 24); buf.writeFloatLE(by, off + 28); buf.writeFloatLE(bz, off + 32);
    buf.writeFloatLE(cx, off + 36); buf.writeFloatLE(cy, off + 40); buf.writeFloatLE(cz, off + 44);
    buf.writeUInt16LE(0, off + 48); off += 50;
  }
  return buf;
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const out = { style: STYLE, note: 'production uBias (computeUBias), crests inserted' };
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (/error/i.test(t)) console.log('  [page]', t.slice(0, 130)); });
  try {
    await page.addInitScript(() => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
      // NO __pfConformingUBias ⇒ production computeUBias (=2 here), not the forced 3.
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wt(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    await wt(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');

    const meshB64 = await wt(page.evaluate(async (target) => {
      const m = await window.__pfFidelity.getMeshForRender(target);
      if (!m) return null;
      const b64 = (u8) => { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); };
      return { v: b64(new Uint8Array(m.vertices.buffer, m.vertices.byteOffset, m.vertices.byteLength)), i: b64(new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength)), triangleCount: m.indices.length / 3 };
    }, TARGET), T, 'mesh');
    if (!meshB64) throw new Error('getMeshForRender null');
    const vertices = new Float32Array(Buffer.from(meshB64.v, 'base64').buffer.slice(0));
    const idxBuf = Buffer.from(meshB64.i, 'base64');
    const indices = new Uint32Array(idxBuf.buffer.slice(idxBuf.byteOffset, idxBuf.byteOffset + idxBuf.byteLength));
    const stlPath = path.join(OUT, 'SuperformulaBlossom_sf1_corrected_uBias2.stl');
    const stlBuf = buildBinarySTL(vertices, indices, 'PotFoundry SFB sf1 conforming production-uBias');
    fs.writeFileSync(stlPath, stlBuf);
    out.stlPath = stlPath; out.stlSizeMB = +(stlBuf.length / 1048576).toFixed(2); out.triangleCount = meshB64.triangleCount;
    out.crestQuality = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t }), TARGET), T, 'crestQ').catch((e) => ({ err: String(e.message).slice(0, 80) }));
  } catch (e) { out.error = String(e.message).slice(0, 160); }
  finally { await page.close(); await browser.close(); console.log('browser.close() ran'); }
  console.log('\n===== SFB@1 CORRECTED EXPORT =====');
  console.log(JSON.stringify(out, null, 2));
})();
