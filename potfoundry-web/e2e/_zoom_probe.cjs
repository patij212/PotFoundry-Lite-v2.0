// ZOOM probe (v2): crop to an upper-wall wedge, auto-fit, render with hard
// wireframe AND a per-triangle MIN-ANGLE tint (neutral = min-angle >= 20 deg, the
// "clean CAD mesh" bar; red = below it). Also reports the triangle-quality
// distribution per crop so we have numbers, not just pixels.
// Usage: node e2e/_zoom_probe.cjs   (run from potfoundry-web/, dev server up)
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/?fidelity=1';
const OUT = process.env.PF_OUT || 'C:/Users/patij212/AppData/Local/Temp/pf_zoom2';
const STYLES = (process.env.PF_STYLES || 'HexagonalHive,GyroidManifold,GothicArches,DragonScales,ArtDeco,Crystalline').split(',').map((s) => s.trim());
const TARGETS = (process.env.PF_TARGETS || '400000').split(',').map(Number);
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20); // clean-CAD min-angle bar
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

function renderInPage() {
  window.__pfZoomRender = (V, I, opt) => {
    const { W, H, hLo, hHi, wedgeDeg, pitch, wire, angleBar } = opt;
    let minZ = Infinity, maxZ = -Infinity, cx = 0, cy = 0;
    const n = V.length / 3;
    for (let k = 0; k < V.length; k += 3) { cx += V[k]; cy += V[k + 1]; if (V[k + 2] < minZ) minZ = V[k + 2]; if (V[k + 2] > maxZ) maxZ = V[k + 2]; }
    cx /= n; cy /= n;
    const zSpan = maxZ - minZ || 1;
    const zA = minZ + hLo * zSpan, zB = minZ + hHi * zSpan;
    const half = (wedgeDeg * Math.PI / 180) / 2;
    const thetaC = Math.PI / 2;
    const ang = (x, y) => Math.atan2(y - cy, x - cx);
    const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const minAngleDeg = (ax, ay, az, bx, by, bz, cx3, cy3, cz3) => {
      const a = Math.hypot(bx - cx3, by - cy3, bz - cz3); // opposite A
      const b = Math.hypot(ax - cx3, ay - cy3, az - cz3);
      const c = Math.hypot(ax - bx, ay - by, az - bz);
      if (a < 1e-12 || b < 1e-12 || c < 1e-12) return 0;
      const clamp = (x) => Math.max(-1, Math.min(1, x));
      const A = Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c)));
      const B = Math.acos(clamp((a * a + c * c - b * b) / (2 * a * c)));
      const C = Math.PI - A - B;
      return Math.min(A, B, C) * 180 / Math.PI;
    };
    const tri3 = [];
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      // require ALL THREE verts in the height band (kills crop-edge fringe)
      if (V[ia + 2] < zA || V[ia + 2] > zB || V[ib + 2] < zA || V[ib + 2] > zB || V[ic + 2] < zA || V[ic + 2] > zB) continue;
      const mx = (V[ia] + V[ib] + V[ic]) / 3, my = (V[ia + 1] + V[ib + 1] + V[ic + 1]) / 3;
      if (Math.abs(angDiff(ang(mx, my), thetaC)) > half) continue;
      const mAng = minAngleDeg(V[ia], V[ia + 1], V[ia + 2], V[ib], V[ib + 1], V[ib + 2], V[ic], V[ic + 1], V[ic + 2]);
      tri3.push([ia, ib, ic, mAng]);
    }
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const zMid = (zA + zB) / 2;
    const tx = (x, y, z) => { const X = x - cx, Y = y - cy, Z = z - zMid; const Y2 = Y * cp - Z * sp; const Z2 = Y * sp + Z * cp; return [X, Y2, Z2]; };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, W, H);
    const stats = { kept: tri3.length, pctBelowBar: 0, worstMinAngle: 180, medMinAngle: 0 };
    if (!tri3.length) return { url: cv.toDataURL('image/png'), stats };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, below = 0;
    const angles = [];
    const proj = [];
    for (const [ia, ib, ic, mAng] of tri3) {
      const a = tx(V[ia], V[ia + 1], V[ia + 2]), b = tx(V[ib], V[ib + 1], V[ib + 2]), c = tx(V[ic], V[ic + 1], V[ic + 2]);
      proj.push([a, b, c, mAng]);
      for (const p of [a, b, c]) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[2] < minY) minY = p[2]; if (p[2] > maxY) maxY = p[2]; }
      if (mAng < angleBar) below++;
      if (mAng < stats.worstMinAngle) stats.worstMinAngle = mAng;
      angles.push(mAng);
    }
    stats.pctBelowBar = Math.round(1000 * below / tri3.length) / 10;
    angles.sort((x, y) => x - y); stats.medMinAngle = Math.round(angles[Math.floor(angles.length / 2)] * 10) / 10;
    stats.worstMinAngle = Math.round(stats.worstMinAngle * 10) / 10;
    const fit = Math.min(W / ((maxX - minX) || 1), H / ((maxY - minY) || 1)) * 0.92;
    const ox = W / 2 - ((minX + maxX) / 2) * fit, oy = H / 2 + ((minY + maxY) / 2) * fit;
    const SX = (x) => ox + x * fit, SY = (z) => oy - z * fit;
    proj.sort((p, q) => (p[0][1] + p[1][1] + p[2][1]) - (q[0][1] + q[1][1] + q[2][1]));
    for (const [a, b, c, mAng] of proj) {
      const t = Math.max(0, Math.min(1, (angleBar - mAng) / angleBar)); // 0 good → 1 worst
      const r = Math.round(150 * (1 - t) + 255 * t), g = Math.round(160 * (1 - t) + 35 * t), bl = Math.round(175 * (1 - t) + 35 * t);
      ctx.beginPath(); ctx.moveTo(SX(a[0]), SY(a[2])); ctx.lineTo(SX(b[0]), SY(b[2])); ctx.lineTo(SX(c[0]), SY(c[2])); ctx.closePath();
      ctx.fillStyle = `rgb(${r},${g},${bl})`; ctx.fill();
      if (wire) { ctx.lineWidth = wire; ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.stroke(); }
    }
    return { url: cv.toDataURL('image/png'), stats };
  };
}

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
    for (const style of STYLES) {
      await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle').catch(() => {});
      for (const target of TARGETS) {
        for (const crop of [{ tag: 'wide', wedgeDeg: 55, hLo: 0.45, hHi: 0.95, wire: 0.5, pitch: -0.3 }, { tag: 'tight', wedgeDeg: 20, hLo: 0.55, hHi: 0.9, wire: 1.1, pitch: -0.26 }]) {
          try {
            const res = await withTimeout(page.evaluate(async (args) => {
              const m = await window.__pfFidelity._debugOuterMesh(args.target);
              if (!m) return null;
              return window.__pfZoomRender(m.vertices, m.indices, { W: 1800, H: 1500, angleBar: args.angleBar, ...args.crop });
            }, { target, crop, angleBar: ANGLE_BAR }), 180000, `zoom ${style} ${crop.tag}`);
            if (!res) { console.log(`${style} ${crop.tag}: NULL`); continue; }
            const path = `${OUT}/${style}_${crop.tag}.png`;
            fs.writeFileSync(path, Buffer.from(res.url.split(',')[1], 'base64'));
            const row = { style, crop: crop.tag, ...res.stats, path };
            summary.push(row); console.log(JSON.stringify(row));
          } catch (e) { console.log(`${style} ${crop.tag}: ${String(e.message || e).slice(0, 80)}`); }
        }
      }
    }
    fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
