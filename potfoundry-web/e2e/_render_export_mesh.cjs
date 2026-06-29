// Renders the EXPORT mesh of a tangled style (default GyroidManifold) so the surface
// quality can be judged by eye: COARSE (uniform L6) vs HIGH density (uniform L9), flat-
// shaded front view (every facet a flat patch -> serration shows as colour steps; a smooth
// dense mesh shows no steps). Plus a HIGH-density zoom with slivers (<20deg) tinted red so
// the "accept slivers if the surface is faithful" question can be answered visually.
//
// Robust by construction: no fragile patch box. Cull the back half (centroid x<0), painter's
// sort by depth, flip normals toward camera for shading. Uses the proven __pfConformingUniformLevel
// lever (Stage-1) instead of maxSag (which floored at the natural ~L8 density).
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GyroidManifold';
const W = 1100, H = 1100;

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript(() => { window.__pfConforming = true; window.__pfSurfaceFidelityExact = true; });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 });
  await page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE);

  // shots: {label, cfg (lever overrides), zoom (null=full pot, else half-extent mm), slivers, wire}
  // BASELINE (default export) vs CAD-GRADE (deep crease refinement) — full + crease zoom.
  const CAD = { cellSamples: 4, maxSag: 0.003, maxLevel: 16, nRing: 2048 };
  const shots = [
    { label: '1baseline_full', cfg: {}, zoom: null, slivers: false, wire: false },
    { label: '2cadgrade_full', cfg: CAD, zoom: null, slivers: false, wire: false },
    { label: '3baseline_zoom', cfg: {}, zoom: 11, slivers: false, wire: false },
    { label: '4cadgrade_zoom', cfg: CAD, zoom: 11, slivers: false, wire: false },
    { label: '5cadgrade_zoom_slivers', cfg: CAD, zoom: 11, slivers: true, wire: true },
  ];

  for (const shot of shots) {
    const info = await page.evaluate(async ({ cfg, zoom, slivers, wire, W, H }) => {
      const g = window;
      delete g.__pfConformingUniformLevel; delete g.__pfConformingMaxSag;
      delete g.__pfConformingMaxLevel; delete g.__pfConformingNRing; delete g.__pfConformingCellSamples;
      if (cfg.cellSamples) g.__pfConformingCellSamples = cfg.cellSamples;
      if (cfg.maxSag) g.__pfConformingMaxSag = cfg.maxSag;
      if (cfg.maxLevel) g.__pfConformingMaxLevel = cfg.maxLevel;
      if (cfg.nRing) g.__pfConformingNRing = cfg.nRing;
      const mesh = await g.__pfFidelity.getMeshForRender();
      if (!mesh) return { error: 'null mesh' };
      const V = mesh.vertices, I = mesh.indices, nTri = I.length / 3;

      // bbox
      let xmn = 1e9, xmx = -1e9, ymn = 1e9, ymx = -1e9, zmn = 1e9, zmx = -1e9;
      for (let i = 0; i < V.length; i += 3) {
        const x = V[i], y = V[i + 1], z = V[i + 2];
        if (x < xmn) xmn = x; if (x > xmx) xmx = x;
        if (y < ymn) ymn = y; if (y > ymx) ymx = y;
        if (z < zmn) zmn = z; if (z > zmx) zmx = z;
      }
      const zc = (zmn + zmx) / 2, yc = 0;

      // camera framing (front view: screenX<-worldY, screenY<-worldZ, depth=worldX)
      let halfY, halfZ;
      if (zoom) { halfY = zoom; halfZ = zoom; }
      else { halfY = Math.max(ymx, -ymn) * 1.04; halfZ = (zmx - zmn) / 2 * 1.04; }
      const scale = Math.min((W * 0.5) / halfY, (H * 0.5) / halfZ);
      const sx = (y) => W / 2 - y * scale;
      const sy = (z) => H / 2 - (z - zc) * scale;

      const minAng = (a, b, c) => {
        const d2 = (i, j) => (V[i] - V[j]) ** 2 + (V[i + 1] - V[j + 1]) ** 2 + (V[i + 2] - V[j + 2]) ** 2;
        const A = Math.sqrt(d2(b, c)), B = Math.sqrt(d2(c, a)), C = Math.sqrt(d2(a, b));
        if (A < 1e-9 || B < 1e-9 || C < 1e-9) return 0;
        const ang = (x, y, o) => Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - o * o) / (2 * x * y))));
        return Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C)) * 180 / Math.PI;
      };

      // collect visible front-half triangles (cull back half = winding-independent)
      const tris = [];
      let sliverCount = 0;
      for (let t = 0; t < nTri; t++) {
        const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
        const cx = (V[a] + V[b] + V[c]) / 3;
        if (cx <= 0) continue;                 // back half occluded -> skip
        const cy = (V[a + 1] + V[b + 1] + V[c + 1]) / 3;
        const cz = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
        if (zoom && (Math.abs(cy - yc) > halfY * 1.15 || Math.abs(cz - zc) > halfZ * 1.15)) continue;
        tris.push([a, b, c, cx]);
      }
      tris.sort((p, q) => p[3] - q[3]);        // painter's: far (small x) first

      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.id = 'pf-render-canvas';
      cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
      document.body.appendChild(cv);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0e1014'; ctx.fillRect(0, 0, W, H);
      const L = [0.60, 0.40, 0.69];            // light: toward camera (+x) + up/side -> relief slopes shade
      for (const [a, b, c] of tris) {
        const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
        const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (nx < 0) { nx = -nx; ny = -ny; nz = -nz; }        // face camera
        const lit = 0.15 + 0.85 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const base = Math.round(28 + lit * 200);
        let sliver = false;
        if (slivers) { const ang = minAng(a, b, c); sliver = ang < 20; if (sliver) sliverCount++; }
        ctx.beginPath();
        ctx.moveTo(sx(V[a + 1]), sy(V[a + 2]));
        ctx.lineTo(sx(V[b + 1]), sy(V[b + 2]));
        ctx.lineTo(sx(V[c + 1]), sy(V[c + 2]));
        ctx.closePath();
        ctx.fillStyle = sliver
          ? `rgb(${Math.min(255, base + 110)},${Math.round(base * 0.30)},${Math.round(base * 0.30)})`
          : `rgb(${base},${base},${Math.min(255, base + 14)})`;
        ctx.fill();
        if (wire) { ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.4; ctx.stroke(); }
      }
      return { nTri, drawn: tris.length, sliverCount, bbox: { xmn, xmx, ymn, ymx, zmn, zmx } };
    }, { cfg: shot.cfg, zoom: shot.zoom, slivers: shot.slivers, wire: shot.wire, W, H });

    if (info.error) { console.log(`${shot.label}: ${info.error}`); continue; }
    const bb = info.bbox;
    console.log(`${shot.label}: tris=${info.nTri} drawn=${info.drawn} slivers=${info.sliverCount} `
      + `bbox x[${bb.xmn.toFixed(1)},${bb.xmx.toFixed(1)}] y[${bb.ymn.toFixed(1)},${bb.ymx.toFixed(1)}] z[${bb.zmn.toFixed(1)},${bb.zmx.toFixed(1)}]`);
    await page.locator('#pf-render-canvas').screenshot({ path: `render_${STYLE}_${shot.label}.png` });
    await page.evaluate(() => { const c = document.getElementById('pf-render-canvas'); if (c) c.remove(); });
  }
  await browser.close(); console.log('done');
})();
