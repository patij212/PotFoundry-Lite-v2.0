// DELIVERABLES PROBE — real GPU conforming export for 3 styles at FL11 default density.
// Produces, per style: a 3MF (built in-page via export3MF.ts), a binary STL backup (built
// in node from the raw mesh), and confirmation numbers (perp-3D p99 + topology). Plus a
// best-effort flat-shaded before(FL7)/after(FL11) render reusing _render_export_mesh.cjs.
//
// GPU HYGIENE: headless:false + unsafe-webgpu/Vulkan; ALL page work in try/finally; ALWAYS
// browser.close() in finally; never hard-kill.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLES = (process.env.PF_STYLES || 'GyroidManifold,Voronoi,CelticKnot').split(',').map((s) => s.trim());
const TARGET = 3_000_000;
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const DIAG_TIMEOUT = 600_000;

fs.mkdirSync(OUT, { recursive: true });

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

// Build a binary STL in node directly from {vertices(Float32Array flat), indices(Uint32Array)}.
function buildBinarySTL(vertices, indices) {
  const nTri = indices.length / 3;
  const buf = Buffer.alloc(80 + 4 + nTri * 50);
  buf.write('PotFoundry conforming export FL11', 0, 'ascii');
  buf.writeUInt32LE(nTri, 80);
  let off = 84;
  for (let t = 0; t < nTri; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2];
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2];
    // face normal = (B-A) x (C-A), normalized
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

async function runStyle(browser, style) {
  const result = { style };
  const page = await browser.newPage();
  try {
    // Pin the conforming path to DEFAULT depth + new default feature density. NO
    // __pfFidelityFeatureLevel (featureLevel defaults to 11 in code) for the "after".
    await page.addInitScript(() => {
      window.__pfConforming = true;
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(
      page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }),
      100000, 'ready',
    );
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');

    // (1) Build the export mesh ONCE and pull raw typed-array bytes to node as base64.
    const meshB64 = await withTimeout(page.evaluate(async (target) => {
      const m = await window.__pfFidelity.getMeshForRender(target);
      if (!m) return null;
      const u8v = new Uint8Array(m.vertices.buffer, m.vertices.byteOffset, m.vertices.byteLength);
      const u8i = new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength);
      // chunked base64 to avoid call-stack blowups on large buffers
      const b64 = (u8) => {
        let s = '';
        const CH = 0x8000;
        for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        return btoa(s);
      };
      return { v: b64(u8v), i: b64(u8i), vertexCount: m.vertices.length / 3, triangleCount: m.indices.length / 3 };
    }, TARGET), DIAG_TIMEOUT, 'getMeshForRender');

    if (!meshB64) { result.error = 'getMeshForRender returned null'; return result; }
    const vertices = new Float32Array(Buffer.from(meshB64.v, 'base64').buffer.slice(0));
    const idxBuf = Buffer.from(meshB64.i, 'base64');
    const indices = new Uint32Array(idxBuf.buffer.slice(idxBuf.byteOffset, idxBuf.byteOffset + idxBuf.byteLength));
    result.triangleCount = meshB64.triangleCount;
    result.vertexCount = meshB64.vertexCount;

    // (2) STL backup — write in node from the raw mesh.
    const stlPath = path.join(OUT, `${style}_after_FL11.stl`);
    const stlBuf = buildBinarySTL(vertices, indices);
    fs.writeFileSync(stlPath, stlBuf);
    result.stlPath = stlPath;
    result.stlSize = stlBuf.length;

    // (3) 3MF — built IN-PAGE via export3MF.ts, returned as base64 of the blob bytes.
    const tmfB64 = await withTimeout(page.evaluate(async (target) => {
      const m = await window.__pfFidelity.getMeshForRender(target);
      if (!m) return null;
      const mod = await import('/src/geometry/exporters/export3MF.ts');
      const meshData = {
        vertices: m.vertices,
        indices: m.indices,
        vertexCount: m.vertices.length / 3,
        triangleCount: m.indices.length / 3,
      };
      const blob = await mod.exportTo3MF(meshData, { name: 'PotFoundry_FL11', unit: 'millimeter' });
      const ab = await blob.arrayBuffer();
      const u8 = new Uint8Array(ab);
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return { b64: btoa(s), size: u8.length };
    }, TARGET), DIAG_TIMEOUT, '3mf');

    if (tmfB64 && tmfB64.b64) {
      const tmfPath = path.join(OUT, `${style}_after_FL11.3mf`);
      const tmfBuf = Buffer.from(tmfB64.b64, 'base64');
      fs.writeFileSync(tmfPath, tmfBuf);
      result.tmfPath = tmfPath;
      result.tmfSize = tmfBuf.length;
      // VERIFY: starts with PK + opens as a valid zip with the model entry.
      result.tmfMagicPK = tmfBuf[0] === 0x50 && tmfBuf[1] === 0x4b;
      try {
        const zip = await JSZip.loadAsync(tmfBuf);
        const entry = zip.file('3D/3dmodel.model');
        const xml = entry ? await entry.async('string') : '';
        result.tmfValidZip = !!entry && xml.includes('<triangle') && xml.includes('<vertex');
      } catch (e) {
        result.tmfValidZip = false;
        result.tmfZipErr = String(e.message).slice(0, 60);
      }
    } else {
      result.error = (result.error ? result.error + '; ' : '') + '3MF returned null';
    }

    // (4) Confirmation numbers.
    const perp = await withTimeout(
      page.evaluate((t) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: 6, metric: 'perpendicular' }), TARGET),
      DIAG_TIMEOUT, 'perp',
    ).catch((e) => ({ err: String(e.message).slice(0, 60) }));
    const topo = await withTimeout(
      page.evaluate((t) => window.__pfFidelity.diagnoseTopology({ targetTriangles: t }), TARGET),
      DIAG_TIMEOUT, 'topo',
    ).catch((e) => ({ err: String(e.message).slice(0, 60) }));
    result.perp = perp;
    result.topo = topo;
  } catch (e) {
    result.error = (result.error ? result.error + '; ' : '') + String(e.message).slice(0, 120);
  } finally {
    await page.close();
  }
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const results = [];
  try {
    for (const style of STYLES) {
      console.log(`\n=== ${style} ===`);
      const r = await runStyle(browser, style);
      results.push(r);
      console.log(JSON.stringify(r, (k, v) => (k === 'perp' || k === 'topo' ? v : v), 2).slice(0, 2000));
    }
  } finally {
    await browser.close();
    console.log('\nbrowser.close() ran');
  }

  console.log('\n========== SUMMARY ==========');
  for (const r of results) {
    if (r.error && !r.triangleCount) { console.log(`${r.style}: ERROR ${r.error}`); continue; }
    const p = r.perp || {};
    const t = r.topo || {};
    console.log(
      `${r.style}: tris=${r.triangleCount} | 3MF=${r.tmfSize ? (r.tmfSize / 1048576).toFixed(2) + 'MB' : 'NONE'} validZip=${r.tmfValidZip} PK=${r.tmfMagicPK} | ` +
      `STL=${r.stlSize ? (r.stlSize / 1048576).toFixed(2) + 'MB' : 'NONE'} | ` +
      `perp_p99=${p.p99DevMm != null ? p.p99DevMm.toFixed(4) : (p.err || '?')} vtxMax=${p.vertexMaxMm != null ? p.vertexMaxMm.toFixed(4) : '?'} refTrusted=${p.referenceTrusted} wallTris=${p.wallTriangles} | ` +
      `bnd=${t.boundaryEdges != null ? t.boundaryEdges : (t.err || '?')} nonMan=${t.nonManifoldEdges != null ? t.nonManifoldEdges : '?'} orient=${t.orientationMismatches}` +
      (r.error ? ` | partialErr=${r.error}` : ''),
    );
  }
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(results, null, 2));
  console.log('\ndone');
})();
