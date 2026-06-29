// Before/after fidelity render: outer wall at the OLD hardcoded quality
// (sag 0.1 / minEdge 0.2 / L10) vs the NEW 'high' default (sag 0.05). Flat-shade
// + thin wireframe at a fixed zoom so the facet/triangle-size drop is visible.
// Usage: node e2e/_compare_render.cjs   (dev :3003)
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const OUT = 'C:/Users/patij212/AppData/Local/Temp/pf_compare';
const STYLES = (process.env.PF_STYLES || 'SuperformulaBlossom,GyroidManifold').split(',').map((s) => s.trim());
const CONFIGS = [
  { tag: 'before_sag0.1', sag: 0.1, minEdge: 0.2, level: 10 },
  { tag: 'after_high', sag: null, minEdge: null, level: null },
];
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
function withTimeout(p, ms, label) { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(label + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); }
function renderInPage() {
  window.__pfFlat = (V, I, opt) => {
    const { W, H, yaw, pitch, scaleMul, wire } = opt;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#0e0e12'; ctx.fillRect(0, 0, W, H);
    const n = V.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < V.length; k += 3) { cx += V[k]; cy += V[k + 1]; cz += V[k + 2]; } cx /= n; cy /= n; cz /= n;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tx = (x, y, z) => { const X = x - cx, Y = y - cy, Z = z - cz; const X1 = X * cyaw - Y * syaw, Y1 = X * syaw + Y * cyaw; const Y2 = Y1 * cp - Z * sp, Z2 = Y1 * sp + Z * cp; return [X1, Y2, Z2]; };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < V.length; k += 3) { const p = tx(V[k], V[k + 1], V[k + 2]); if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2]; }
    const fit = Math.min(W / (maxX - minX), H / (maxZ - minZ)) * 0.9 * scaleMul;
    const ox = W / 2 - ((minX + maxX) / 2) * fit, oy = H / 2 + ((minZ + maxZ) / 2) * fit;
    const SX = (x) => ox + x * fit, SY = (z) => oy - z * fit;
    const tris = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = tx(V[I[t] * 3], V[I[t] * 3 + 1], V[I[t] * 3 + 2]);
      const b = tx(V[I[t + 1] * 3], V[I[t + 1] * 3 + 1], V[I[t + 1] * 3 + 2]);
      const c = tx(V[I[t + 2] * 3], V[I[t + 2] * 3 + 1], V[I[t + 2] * 3 + 2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; ny /= nl;
      tris.push({ a, b, c, depth: (a[1] + b[1] + c[1]) / 3, shade: Math.max(0.12, Math.abs(ny)) });
    }
    tris.sort((p, q) => p.depth - q.depth);
    for (const tr of tris) { const g = Math.round(tr.shade * 225) + 14; ctx.beginPath(); ctx.moveTo(SX(tr.a[0]), SY(tr.a[2])); ctx.lineTo(SX(tr.b[0]), SY(tr.b[2])); ctx.lineTo(SX(tr.c[0]), SY(tr.c[2])); ctx.closePath(); ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 8)})`; ctx.fill(); if (wire) { ctx.lineWidth = wire; ctx.strokeStyle = 'rgba(40,120,190,0.45)'; ctx.stroke(); } }
    return cv.toDataURL('image/png');
  };
}
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.addInitScript(renderInPage);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of STYLES) {
      for (const c of CONFIGS) {
        await page.evaluate((cfg) => { const set = (k, v) => { if (v === null) delete window[k]; else window[k] = v; }; set('__pfConformingMaxSag', cfg.sag); set('__pfConformingMinEdge', cfg.minEdge); set('__pfConformingMaxLevel', cfg.level); }, c);
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 120000, 'setStyle');
        const dataUrl = await withTimeout(page.evaluate(async () => { const m = await window.__pfFidelity._debugOuterMesh(2000000); return m ? window.__pfFlat(m.vertices, m.indices, { W: 1400, H: 1400, yaw: 0.7, pitch: -0.35, scaleMul: 3.2, wire: 0.5 }) : null; }), 200000, 'render');
        if (dataUrl) { const p = `${OUT}/${style}_${c.tag}.png`; fs.writeFileSync(p, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log('wrote', p); }
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
