// SFB@1 BEST EXPORT — real GPU conforming export of SuperformulaBlossom at sf_strength=1,
// with the petal crests INSERTED (surfaceFidelityExact) so the ridges are exact mesh edges
// (no staircase serration), deep density, and the proven UBias=3 anisotropy fix. Writes a
// binary STL + 3MF and reports serration / crest-quality / surface-fidelity / topology.
//
// GPU HYGIENE: headless:false + unsafe-webgpu/Vulkan; ALL page work in try/finally; ALWAYS
// browser.close() in finally; never hard-kill.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = 'SuperformulaBlossom';
const TARGET = 3_000_000;
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const DIAG_TIMEOUT = 600_000;
fs.mkdirSync(OUT, { recursive: true });

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

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
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    buf.writeFloatLE(ax, off + 12); buf.writeFloatLE(ay, off + 16); buf.writeFloatLE(az, off + 20);
    buf.writeFloatLE(bx, off + 24); buf.writeFloatLE(by, off + 28); buf.writeFloatLE(bz, off + 32);
    buf.writeFloatLE(cx, off + 36); buf.writeFloatLE(cy, off + 40); buf.writeFloatLE(cz, off + 44);
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }
  return buf;
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const result = { style: STYLE, sf_strength: 1, surfaceFidelityExact: true };
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (/error|fidelity|conforming/i.test(t)) console.log('  [page]', t.slice(0, 160)); });
  try {
    // BEST SFB@1 conforming settings: insert petal crests (no serration), deep density,
    // the proven U-anisotropy UBias fix.
    await page.addInitScript(() => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
      window.__pfConformingUBias = 3;
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'setStyleParams');

    const meshB64 = await withTimeout(page.evaluate(async (target) => {
      const m = await window.__pfFidelity.getMeshForRender(target);
      if (!m) return null;
      const b64 = (u8) => { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); };
      const u8v = new Uint8Array(m.vertices.buffer, m.vertices.byteOffset, m.vertices.byteLength);
      const u8i = new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength);
      return { v: b64(u8v), i: b64(u8i), vertexCount: m.vertices.length / 3, triangleCount: m.indices.length / 3 };
    }, TARGET), DIAG_TIMEOUT, 'getMeshForRender');
    if (!meshB64) { result.error = 'getMeshForRender returned null'; throw new Error(result.error); }

    const vertices = new Float32Array(Buffer.from(meshB64.v, 'base64').buffer.slice(0));
    const idxBuf = Buffer.from(meshB64.i, 'base64');
    const indices = new Uint32Array(idxBuf.buffer.slice(idxBuf.byteOffset, idxBuf.byteOffset + idxBuf.byteLength));
    result.triangleCount = meshB64.triangleCount;
    result.vertexCount = meshB64.vertexCount;

    const stlPath = path.join(OUT, 'SuperformulaBlossom_sf1_best.stl');
    const stlBuf = buildBinarySTL(vertices, indices, 'PotFoundry SuperformulaBlossom sf_strength=1 conforming surfaceFidelityExact');
    fs.writeFileSync(stlPath, stlBuf);
    result.stlPath = stlPath;
    result.stlSizeMB = +(stlBuf.length / 1048576).toFixed(2);

    // 3MF (smaller, indexed).
    try {
      const tmf = await withTimeout(page.evaluate(async (target) => {
        const m = await window.__pfFidelity.getMeshForRender(target);
        if (!m) return null;
        const mod = await import('/src/geometry/exporters/export3MF.ts');
        const blob = await mod.exportTo3MF({ vertices: m.vertices, indices: m.indices, vertexCount: m.vertices.length / 3, triangleCount: m.indices.length / 3 }, { name: 'SFB_sf1', unit: 'millimeter' });
        const u8 = new Uint8Array(await blob.arrayBuffer());
        let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        return { b64: btoa(s), size: u8.length };
      }, TARGET), DIAG_TIMEOUT, '3mf');
      if (tmf && tmf.b64) { const p = path.join(OUT, 'SuperformulaBlossom_sf1_best.3mf'); fs.writeFileSync(p, Buffer.from(tmf.b64, 'base64')); result.tmfPath = p; result.tmfSizeMB = +(tmf.size / 1048576).toFixed(2); }
    } catch (e) { result.tmfErr = String(e.message).slice(0, 80); }

    // Quality confirmation: serration (crest staircase), crest triangle quality, surface fidelity, topology.
    const safe = (fn, label) => withTimeout(page.evaluate(fn, TARGET), DIAG_TIMEOUT, label).catch((e) => ({ err: String(e.message).slice(0, 70) }));
    result.serration = await safe((t) => window.__pfFidelity.diagnoseSerration({ targetTriangles: t }), 'serr');
    result.crestQuality = await safe((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t }), 'crestQ');
    result.surfaceFidelity = await safe((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, metric: 'perpendicular', denseN: 6 }), 'perp');
    result.topology = await safe((t) => window.__pfFidelity.diagnoseTopology({ targetTriangles: t }), 'topo');
  } catch (e) {
    result.error = (result.error ? result.error + '; ' : '') + String(e.message).slice(0, 160);
  } finally {
    await page.close();
    await browser.close();
    console.log('browser.close() ran');
  }
  console.log('\n===== SFB@1 BEST EXPORT =====');
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(OUT, '_sfb1_summary.json'), JSON.stringify(result, null, 2));
})();
