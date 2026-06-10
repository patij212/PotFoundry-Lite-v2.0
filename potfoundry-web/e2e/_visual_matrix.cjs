// Combined topology + VISUAL probe for the conforming export mesh.
// For each style (default dims): setStyle -> diagnoseTopoQuality -> render the
// outer-wall mesh (iso + topdown) to PNG so we can SEE the mesh, not just trust
// the numbers. Writes PNGs + a JSON summary to $OUT.
// Usage: node e2e/_visual_matrix.cjs   (run from potfoundry-web/, dev server up)
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const OUT = process.env.PF_OUT || 'C:/Users/patij212/AppData/Local/Temp/pf_visual';
const TARGET = Number(process.env.PF_TARGET || 400000);
const STYLES = (process.env.PF_STYLES ||
  'SuperformulaBlossom,GothicArches,DragonScales,Crystalline,Voronoi,HexagonalHive,CelticKnot,SpiralRidges')
  .split(',').map((s) => s.trim());
// Optional single dimension override, e.g. PF_DIMS='{"H":40,"Rt":150,"Rb":150}'
const DIMS = process.env.PF_DIMS ? JSON.parse(process.env.PF_DIMS) : null;

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

function renderInPage() {
  window.__pfRenderMesh = (V, I, opt) => {
    const { W, H, yaw, pitch, scaleMul, panX, panY, wire } = opt;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0e0e12'; ctx.fillRect(0, 0, W, H);
    const n = V.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < V.length; k += 3) { cx += V[k]; cy += V[k + 1]; cz += V[k + 2]; }
    cx /= n; cy /= n; cz /= n;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tx = (x, y, z) => {
      const X = x - cx, Y = y - cy, Z = z - cz;
      const X1 = X * cyaw - Y * syaw, Y1 = X * syaw + Y * cyaw;
      const Y2 = Y1 * cp - Z * sp, Z2 = Y1 * sp + Z * cp;
      return [X1, Y2, Z2];
    };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < V.length; k += 3) {
      const p = tx(V[k], V[k + 1], V[k + 2]);
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
    const fit = Math.min(W / (maxX - minX), H / (maxZ - minZ)) * 0.9 * scaleMul;
    const ox = W / 2 - ((minX + maxX) / 2) * fit + panX;
    const oy = H / 2 + ((minZ + maxZ) / 2) * fit + panY;
    const SX = (x) => ox + x * fit; const SY = (z) => oy - z * fit;
    const tris = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = tx(V[I[t] * 3], V[I[t] * 3 + 1], V[I[t] * 3 + 2]);
      const b = tx(V[I[t + 1] * 3], V[I[t + 1] * 3 + 1], V[I[t + 1] * 3 + 2]);
      const c = tx(V[I[t + 2] * 3], V[I[t + 2] * 3 + 1], V[I[t + 2] * 3 + 2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; ny /= nl;
      tris.push({ a, b, c, depth: (a[1] + b[1] + c[1]) / 3, shade: Math.max(0.12, Math.abs(ny)) });
    }
    tris.sort((p, q) => p.depth - q.depth);
    for (const tr of tris) {
      const g = Math.round(tr.shade * 230) + 12;
      ctx.beginPath();
      ctx.moveTo(SX(tr.a[0]), SY(tr.a[2]));
      ctx.lineTo(SX(tr.b[0]), SY(tr.b[2]));
      ctx.lineTo(SX(tr.c[0]), SY(tr.c[2]));
      ctx.closePath();
      ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 8)})`;
      ctx.fill();
      if (wire) { ctx.lineWidth = wire; ctx.strokeStyle = 'rgba(30,110,180,0.5)'; ctx.stroke(); }
    }
    return cv.toDataURL('image/png');
  };
}

const VIEWS = {
  iso: { name: 'iso', yaw: 0.6, pitch: -0.5, scaleMul: 1.0, panX: 0, panY: 0, wire: 0.3 },
  topdown: { name: 'topdown', yaw: 0, pitch: -1.45, scaleMul: 1.05, panX: 0, panY: 0, wire: 0.3 },
};

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  const summary = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.addInitScript(renderInPage);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    const api = await page.evaluate(() => Object.keys(window.__pfFidelity));
    console.log('API:', api.join(','));

    for (const style of STYLES) {
      const row = { style, dims: DIMS || 'default' };
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        if (DIMS && api.includes('setDimensions')) {
          await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS), 60000, 'setDimensions');
        }
        const topo = await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTopoQuality()), 180000, 'topo');
        const feat = api.includes('diagnoseFeatures')
          ? await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseFeatures()), 60000, 'feat').catch(() => null) : null;
        const qual = api.includes('diagnoseTriangleQuality')
          ? await withTimeout(page.evaluate(() => window.__pfFidelity.diagnoseTriangleQuality()), 180000, 'qual').catch(() => null) : null;
        row.topo = topo; row.feat = feat;
        if (qual) row.qual = { pctBelow20: qual.pctBelow20, median: qual.medianMinAngleDeg, min: qual.minAngleDeg, degenerate: qual.degenerateCount };
        for (const vk of ['iso', 'topdown']) {
          const dataUrl = await withTimeout(page.evaluate(async (args) => {
            const m = await window.__pfFidelity._debugOuterMesh(args.target);
            if (!m) return null;
            return window.__pfRenderMesh(m.vertices, m.indices, { W: 1400, H: 1400, ...args.v });
          }, { target: TARGET, v: VIEWS[vk] }), 180000, `render ${vk}`);
          if (dataUrl) {
            const tag = DIMS ? `${style}_${DIMS.H}x${DIMS.Rt}` : style;
            const path = `${OUT}/${tag}_${vk}.png`;
            fs.writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
            row[`png_${vk}`] = path;
          }
        }
        console.log(JSON.stringify(row));
      } catch (e) {
        row.error = String(e.message || e).slice(0, 200);
        console.log(JSON.stringify(row));
      }
      summary.push(row);
    }
    fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
