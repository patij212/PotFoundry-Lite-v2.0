// Crest-serration diagnosis: does raising the 256x256 surface sampler (DENSE_RES)
// reduce the stretched-triangle serration at feature crests? Sweep denseRes with a
// deep quadtree + high budget (so the mesh can refine to whatever the sampler
// resolves). Measures min-angle distribution (stretched tris = low min-angle) +
// renders the crest region (min-angle tint). Usage: node e2e/_crest_diag.cjs (dev :3003)
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:3003/?fidelity=1';
const OUT = 'C:/Users/patij212/AppData/Local/Temp/pf_crest';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const STYLES = (process.env.PF_STYLES || 'SpiralRidges,SuperformulaBlossom').split(',');
const DENSE = (process.env.PF_DENSE || '256,1024,2048').split(',').map(Number);
function wt(p, ms, l) { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); }
function renderInPage() {
  window.__pfCrest = (V, I, opt) => {
    const { W, H, yaw, pitch, hLo, hHi } = opt; const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    let cx = 0, cy = 0, minZ = 1e9, maxZ = -1e9, n = V.length / 3;
    for (let k = 0; k < V.length; k += 3) { cx += V[k]; cy += V[k + 1]; if (V[k + 2] < minZ) minZ = V[k + 2]; if (V[k + 2] > maxZ) maxZ = V[k + 2]; }
    cx /= n; cy /= n; const zSpan = maxZ - minZ || 1, zA = minZ + hLo * zSpan, zB = minZ + hHi * zSpan;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), zMid = (zA + zB) / 2;
    const tx = (x, y, z) => { const X = x - cx, Y = y - cy, Z = z - zMid; const X1 = X * cyaw - Y * syaw, Y1 = X * syaw + Y * cyaw; return [X1, Y1 * cp - Z * sp, Y1 * sp + Z * cp]; };
    const ang = (ax, ay, az, bx, by, bz, cx3, cy3, cz3) => { const a = Math.hypot(bx - cx3, by - cy3, bz - cz3), b = Math.hypot(ax - cx3, ay - cy3, az - cz3), c = Math.hypot(ax - bx, ay - by, az - bz); if (a < 1e-9 || b < 1e-9 || c < 1e-9) return 0; const cl = (x) => Math.max(-1, Math.min(1, x)); const A = Math.acos(cl((b * b + c * c - a * a) / (2 * b * c))), B = Math.acos(cl((a * a + c * c - b * b) / (2 * a * c))); return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI; };
    const tris = []; let below = 0, kept = 0;
    for (let t = 0; t < I.length; t += 3) { const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      if (V[ia + 2] < zA || V[ib + 2] < zA || V[ic + 2] < zA) continue;
      const a = tx(V[ia], V[ia + 1], V[ia + 2]), b = tx(V[ib], V[ib + 1], V[ib + 2]), c = tx(V[ic], V[ic + 1], V[ic + 2]);
      const mAng = ang(V[ia], V[ia + 1], V[ia + 2], V[ib], V[ib + 1], V[ib + 2], V[ic], V[ic + 1], V[ic + 2]);
      if (mAng < 20) below++; kept++;
      let nx = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); // 2D winding for shade proxy
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let ny = uz * vx - ux * vz; const nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1; ny /= nl;
      tris.push({ a, b, c, depth: a[1] + b[1] + c[1], shade: Math.max(0.15, Math.abs(ny)), bad: mAng < 20 }); }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const tr of tris) for (const p of [tr.a, tr.b, tr.c]) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[2] < minY) minY = p[2]; if (p[2] > maxY) maxY = p[2]; }
    const fit = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1)) * 0.92, ox = W / 2 - (minX + maxX) / 2 * fit, oy = H / 2 + (minY + maxY) / 2 * fit;
    const SX = (x) => ox + x * fit, SY = (z) => oy - z * fit; tris.sort((p, q) => p.depth - q.depth);
    for (const tr of tris) { const g = Math.round(tr.shade * 200) + 30; ctx.beginPath(); ctx.moveTo(SX(tr.a[0]), SY(tr.a[2])); ctx.lineTo(SX(tr.b[0]), SY(tr.b[2])); ctx.lineTo(SX(tr.c[0]), SY(tr.c[2])); ctx.closePath(); ctx.fillStyle = tr.bad ? 'rgb(230,70,70)' : `rgb(${g},${g},${g + 8})`; ctx.fill(); }
    return { url: cv.toDataURL('image/png'), kept, pctBad: Math.round(1000 * below / (kept || 1)) / 10 };
  };
}
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage(); const rows = [];
  try {
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.addInitScript(renderInPage);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of STYLES) {
      for (const dr of DENSE) {
        try {
          await page.evaluate((d) => { window.__pfConformingDenseRes = d; window.__pfConformingMaxLevel = 13; window.__pfConformingMaxSag = 0.02; window.__pfConformingMinEdge = 0.02; window.__pfConformingBudget = 40000000; }, dr);
          await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 90000, 'setStyle');
          const topo = await wt(page.evaluate(() => window.__pfFidelity.diagnoseTopoQuality()), 300000, 'topo');
          const q = await wt(page.evaluate(() => window.__pfFidelity.diagnoseTriangleQuality()), 300000, 'qual');
          const r = await wt(page.evaluate(async () => { const m = await window.__pfFidelity._debugOuterMesh(40000000); return m ? window.__pfCrest(m.vertices, m.indices, { W: 1500, H: 1100, yaw: 0.5, pitch: -0.35, hLo: 0.55, hHi: 1.0 }) : null; }), 300000, 'render');
          if (r) fs.writeFileSync(`${OUT}/${style}_dr${dr}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
          const row = { style, denseRes: dr, tris: topo.triangleCount, minAngle: topo.minAngleDeg, pctBelow20: q.pctBelow20, median: q.medianMinAngleDeg, crestBad: r ? r.pctBad : null };
          rows.push(row); console.log(JSON.stringify(row));
        } catch (e) { const row = { style, denseRes: dr, error: String(e.message || e).slice(0, 80) }; rows.push(row); console.log(JSON.stringify(row)); }
      }
    }
    fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(rows, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
