// Visual ground-truth: render the conforming OUTER-wall export mesh (flat-shaded
// + wireframe) to PNGs so we can SEE whether the high-strength "serration" is
// elongated-triangle anisotropy, an axis-aligned staircase, or sharp cusp tips.
// Usage: node e2e/_serration_render.cjs   (writes /tmp/serr_*.png)
const fs = require('fs');
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const style = process.env.PF_STYLE || 'SuperformulaBlossom';
const target = Number(process.env.PF_TARGET_TRIANGLES || 400000);
const outDir = process.env.PF_OUT || 'C:/Users/patij212/AppData/Local/Temp';

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

// In-page renderer: project the mesh to 2D (yaw+pitch), painter's sort, flat shade
// by view-facing normal, thin wireframe overlay. Returns a PNG dataURL.
function renderInPage() {
  window.__pfRenderMesh = (V, I, opt) => {
    const { W, H, yaw, pitch, scaleMul, panX, panY, wire } = opt;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
    const n = V.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < V.length; k += 3) { cx += V[k]; cy += V[k + 1]; cz += V[k + 2]; }
    cx /= n; cy /= n; cz /= n;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tx = (x, y, z) => {
      const X = x - cx, Y = y - cy, Z = z - cz;
      const X1 = X * cyaw - Y * syaw, Y1 = X * syaw + Y * cyaw;          // yaw about z
      const Y2 = Y1 * cp - Z * sp, Z2 = Y1 * sp + Z * cp;               // pitch about x
      return [X1, Y2, Z2]; // X1 right, Z2 up, Y2 depth (camera at +Y2)
    };
    // View bounds (for auto-fit).
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < V.length; k += 3) {
      const p = tx(V[k], V[k + 1], V[k + 2]);
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
    const fit = Math.min(W / (maxX - minX), H / (maxZ - minZ)) * 0.9 * scaleMul;
    const ox = W / 2 - ((minX + maxX) / 2) * fit + panX;
    const oy = H / 2 + ((minZ + maxZ) / 2) * fit + panY;
    const SX = (x) => ox + x * fit;
    const SY = (z) => oy - z * fit;
    const tris = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = tx(V[I[t] * 3], V[I[t] * 3 + 1], V[I[t] * 3 + 2]);
      const b = tx(V[I[t + 1] * 3], V[I[t + 1] * 3 + 1], V[I[t + 1] * 3 + 2]);
      const c = tx(V[I[t + 2] * 3], V[I[t + 2] * 3 + 1], V[I[t + 2] * 3 + 2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; ny /= nl;
      // No backface cull (it flickers thin edge-on blades → fake silhouette
      // jaggedness). Render ALL; painter's sort draws near triangles on top, so
      // the outside outline is the TRUE mesh silhouette. Shade by |facing|.
      tris.push({ a, b, c, depth: (a[1] + b[1] + c[1]) / 3, shade: Math.max(0.1, Math.abs(ny)) });
    }
    tris.sort((p, q) => p.depth - q.depth);
    for (const tr of tris) {
      const g = Math.round(tr.shade * 235) + 10;
      ctx.beginPath();
      ctx.moveTo(SX(tr.a[0]), SY(tr.a[2]));
      ctx.lineTo(SX(tr.b[0]), SY(tr.b[2]));
      ctx.lineTo(SX(tr.c[0]), SY(tr.c[2]));
      ctx.closePath();
      ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 6)})`;
      ctx.fill();
      if (wire) { ctx.lineWidth = wire; ctx.strokeStyle = 'rgba(20,90,160,0.55)'; ctx.stroke(); }
    }
    return cv.toDataURL('image/png');
  };
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    const UBIAS = process.env.PF_UBIAS ? Number(process.env.PF_UBIAS) : -1;
    await page.addInitScript((ub) => { window.__pfConforming = true; if (ub >= 0) window.__pfConformingUBias = ub; }, UBIAS);
    await page.addInitScript(renderInPage);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
    const STRENGTHS = (process.env.PF_VALUES || '0,1').split(',').map(Number);
    for (const strength of STRENGTHS) {
      await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyleParams({ sf_strength: s }), strength), 30000, 'setParams');
      const views = [
        { name: 'topdown', yaw: 0, pitch: -1.45, scaleMul: 1.05, panX: 0, panY: 0, wire: 0.35 },
        { name: 'tip', yaw: 0.95, pitch: -0.25, scaleMul: 5.5, panX: -260, panY: 120, wire: 0.8 },
      ];
      for (const v of views) {
        const dataUrl = await withTimeout(page.evaluate(async (args) => {
          const m = await window.__pfFidelity._debugOuterMesh(args.target);
          if (!m) return null;
          return window.__pfRenderMesh(m.vertices, m.indices, { W: 1500, H: 1500, ...args.v });
        }, { target, v }), 180000, `render s${strength} ${v.name}`);
        if (!dataUrl) { console.log(`s${strength} ${v.name}: NULL`); continue; }
        const b64 = dataUrl.split(',')[1];
        const path = `${outDir}/serr_s${strength}_${v.name}.png`;
        fs.writeFileSync(path, Buffer.from(b64, 'base64'));
        console.log(`wrote ${path}`);
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
