// BONUS RENDER — flat-shaded front-view PNGs of the export mesh for the 3 deliverable styles.
// before = FL7 (window.__pfFidelityFeatureLevel = 7), after = FL11 (default, no FL override).
// Reuses the proven painter's-sorted, back-half-culled, camera-facing-normal approach from
// _render_export_mesh.cjs. Renders use a modest triangle target so they draw quickly.
const { chromium } = require('@playwright/test');
const path = require('path');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLES = (process.env.PF_STYLES || 'GyroidManifold,Voronoi,CelticKnot').split(',').map((s) => s.trim());
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const W = 1000, H = 1000;
const RENDER_TARGET = 800_000; // enough to show surface detail, fast to draw

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function renderOne(browser, style, phase /* 'before'|'after' */) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try {
    await page.addInitScript((ph) => {
      window.__pfConforming = true;
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
      if (ph === 'before') window.__pfFidelityFeatureLevel = 7;
    }, phase);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');

    const info = await withTimeout(page.evaluate(async ({ W, H, target }) => {
      const mesh = await window.__pfFidelity.getMeshForRender(target);
      if (!mesh) return { error: 'null mesh' };
      const V = mesh.vertices, I = mesh.indices, nTri = I.length / 3;
      let ymn = 1e9, ymx = -1e9, zmn = 1e9, zmx = -1e9;
      for (let i = 0; i < V.length; i += 3) {
        const y = V[i + 1], z = V[i + 2];
        if (y < ymn) ymn = y; if (y > ymx) ymx = y;
        if (z < zmn) zmn = z; if (z > zmx) zmx = z;
      }
      const zc = (zmn + zmx) / 2;
      const halfY = Math.max(ymx, -ymn) * 1.04, halfZ = (zmx - zmn) / 2 * 1.04;
      const scale = Math.min((W * 0.5) / halfY, (H * 0.5) / halfZ);
      const sx = (y) => W / 2 - y * scale;
      const sy = (z) => H / 2 - (z - zc) * scale;
      const tris = [];
      for (let t = 0; t < nTri; t++) {
        const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
        const cx = (V[a] + V[b] + V[c]) / 3;
        if (cx <= 0) continue;
        tris.push([a, b, c, cx]);
      }
      tris.sort((p, q) => p[3] - q[3]);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.id = 'pf-render-canvas';
      cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
      document.body.appendChild(cv);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0e1014'; ctx.fillRect(0, 0, W, H);
      const L = [0.60, 0.40, 0.69];
      for (const [a, b, c] of tris) {
        const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
        const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (nx < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const lit = 0.15 + 0.85 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const base = Math.round(28 + lit * 200);
        ctx.beginPath();
        ctx.moveTo(sx(V[a + 1]), sy(V[a + 2]));
        ctx.lineTo(sx(V[b + 1]), sy(V[b + 2]));
        ctx.lineTo(sx(V[c + 1]), sy(V[c + 2]));
        ctx.closePath();
        ctx.fillStyle = `rgb(${base},${base},${Math.min(255, base + 14)})`;
        ctx.fill();
      }
      return { nTri, drawn: tris.length };
    }, { W, H, target: RENDER_TARGET }), 600000, 'render');

    if (info.error) { console.log(`${style} ${phase}: ${info.error}`); return; }
    const fl = phase === 'before' ? 'FL7' : 'FL11';
    const out = path.join(OUT, `${style}_${phase}_${fl}.png`);
    await page.locator('#pf-render-canvas').screenshot({ path: out });
    console.log(`${style} ${phase} (${fl}): tris=${info.nTri} drawn=${info.drawn} -> ${out}`);
  } catch (e) {
    console.log(`${style} ${phase}: ERROR ${String(e.message).slice(0, 80)}`);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  try {
    for (const style of STYLES) {
      await renderOne(browser, style, 'before');
      await renderOne(browser, style, 'after');
    }
  } finally {
    await browser.close();
    console.log('browser.close() ran');
  }
  console.log('done');
})();
