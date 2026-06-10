// STAGE 0 — faithful crest-fidelity instrument (visual + reference-free scalar).
// Renders the REAL conforming OUTER-wall sub-mesh with a per-triangle 3D MIN-ANGLE
// tint (neutral >= bar, RED below) and reports the sub-bar fraction over (a) the
// whole outer wall and (b) a zoomed crest crop. Min-angle is computed from 3D world
// positions, so it is REFERENCE-FREE (immune to the seam-unwrap UV artifact that
// fooled maxAspect). Control case SuperformulaBlossom@sf_strength=0 must read ~0 red;
// SpiralRidges + SuperformulaBlossom@1 are the diagonal/morphing-crest targets.
//
// Usage (dev server on :3001):  node e2e/_crest_stage0.cjs
// NO --enable-features=Vulkan (handoff: forces slow Dawn compile → shader timeouts).
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const OUT = process.env.PF_OUT || 'C:/Users/patij212/AppData/Local/Temp/pf_crest0';
const TARGET = Number(process.env.PF_TARGET || 400000);
const BAR = Number(process.env.PF_BAR || 15); // red < 15 deg (handoff crest bar)
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Cases: tag, style, optional style-param override. SFB@0 is the plain-pot control.
const CASES = [
  { tag: 'SpiralRidges', style: 'SpiralRidges', params: null },
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
  { tag: 'SFB_s0_control', style: 'SuperformulaBlossom', params: { sf_strength: 0 } },
];

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

function installInPage() {
  const minAngleDeg = (V, ia, ib, ic) => {
    const ax = V[ia], ay = V[ia + 1], az = V[ia + 2];
    const bx = V[ib], by = V[ib + 1], bz = V[ib + 2];
    const cx = V[ic], cy = V[ic + 1], cz = V[ic + 2];
    const a = Math.hypot(bx - cx, by - cy, bz - cz);
    const b = Math.hypot(ax - cx, ay - cy, az - cz);
    const c = Math.hypot(ax - bx, ay - by, az - bz);
    if (a < 1e-12 || b < 1e-12 || c < 1e-12) return 0;
    const cl = (x) => Math.max(-1, Math.min(1, x));
    const A = Math.acos(cl((b * b + c * c - a * a) / (2 * b * c)));
    const B = Math.acos(cl((a * a + c * c - b * b) / (2 * a * c)));
    const C = Math.PI - A - B;
    return Math.min(A, B, C) * 180 / Math.PI;
  };

  // Whole-submesh min-angle distribution (3D, reference-free).
  window.__pfWallStats = (V, I, bar) => {
    let nGood = 0, nDegen = 0, below = 0, worst = 180;
    const worstList = [];
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      const mAng = minAngleDeg(V, ia, ib, ic);
      if (mAng <= 0) { nDegen++; continue; }
      nGood++;
      if (mAng < bar) below++;
      if (mAng < worst) worst = mAng;
      if (worstList.length < 12 || mAng < worstList[worstList.length - 1].a) {
        const cx = (V[ia] + V[ib] + V[ic]) / 3, cy = (V[ia + 1] + V[ib + 1] + V[ic + 1]) / 3, cz = (V[ia + 2] + V[ib + 2] + V[ic + 2]) / 3;
        worstList.push({ a: Math.round(mAng * 100) / 100, z: Math.round(cz * 10) / 10, r: Math.round(Math.hypot(cx, cy) * 10) / 10 });
        worstList.sort((p, q) => p.a - q.a); if (worstList.length > 12) worstList.length = 12;
      }
    }
    return {
      tris: nGood, degen: nDegen,
      pctBelowBar: nGood ? Math.round(1000 * below / nGood) / 10 : 0,
      worstMinAngle: Math.round(worst * 100) / 100,
      worst: worstList,
    };
  };

  // Zoomed crop render with min-angle tint (red < bar). Returns PNG + crop stats.
  window.__pfCrestRender = (V, I, opt) => {
    const { W, H, hLo, hHi, wedgeDeg, pitch, wire, bar } = opt;
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
    const minA = (ia, ib, ic) => {
      const ax = V[ia], ay = V[ia + 1], az = V[ia + 2], bx = V[ib], by = V[ib + 1], bz = V[ib + 2], cx3 = V[ic], cy3 = V[ic + 1], cz3 = V[ic + 2];
      const a = Math.hypot(bx - cx3, by - cy3, bz - cz3), b = Math.hypot(ax - cx3, ay - cy3, az - cz3), c = Math.hypot(ax - bx, ay - by, az - bz);
      if (a < 1e-12 || b < 1e-12 || c < 1e-12) return 0;
      const cl = (x) => Math.max(-1, Math.min(1, x));
      const A = Math.acos(cl((b * b + c * c - a * a) / (2 * b * c))), B = Math.acos(cl((a * a + c * c - b * b) / (2 * a * c)));
      return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
    };
    const tri3 = [];
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      if (V[ia + 2] < zA || V[ia + 2] > zB || V[ib + 2] < zA || V[ib + 2] > zB || V[ic + 2] < zA || V[ic + 2] > zB) continue;
      const mx = (V[ia] + V[ib] + V[ic]) / 3, my = (V[ia + 1] + V[ib + 1] + V[ic + 1]) / 3;
      if (Math.abs(angDiff(ang(mx, my), thetaC)) > half) continue;
      tri3.push([ia, ib, ic, minA(ia, ib, ic)]);
    }
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const zMid = (zA + zB) / 2;
    const tx = (x, y, z) => { const X = x - cx, Y = y - cy, Z = z - zMid; return [X, Y * cp - Z * sp, Y * sp + Z * cp]; };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, W, H);
    const stats = { kept: tri3.length, pctBelowBar: 0, worstMinAngle: 180 };
    if (!tri3.length) return { url: cv.toDataURL('image/png'), stats };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, below = 0;
    const proj = [];
    for (const [ia, ib, ic, mAng] of tri3) {
      const a = tx(V[ia], V[ia + 1], V[ia + 2]), b = tx(V[ib], V[ib + 1], V[ib + 2]), c = tx(V[ic], V[ic + 1], V[ic + 2]);
      proj.push([a, b, c, mAng]);
      for (const p of [a, b, c]) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[2] < minY) minY = p[2]; if (p[2] > maxY) maxY = p[2]; }
      if (mAng < bar) below++;
      if (mAng < stats.worstMinAngle) stats.worstMinAngle = mAng;
    }
    stats.pctBelowBar = Math.round(1000 * below / tri3.length) / 10;
    stats.worstMinAngle = Math.round(stats.worstMinAngle * 100) / 100;
    const fit = Math.min(W / ((maxX - minX) || 1), H / ((maxY - minY) || 1)) * 0.92;
    const ox = W / 2 - ((minX + maxX) / 2) * fit, oy = H / 2 + ((minY + maxY) / 2) * fit;
    const SX = (x) => ox + x * fit, SY = (z) => oy - z * fit;
    proj.sort((p, q) => (p[0][1] + p[1][1] + p[2][1]) - (q[0][1] + q[1][1] + q[2][1]));
    for (const [a, b, c, mAng] of proj) {
      const k = Math.max(0, Math.min(1, (bar - mAng) / bar));
      const r = Math.round(150 * (1 - k) + 255 * k), g = Math.round(160 * (1 - k) + 30 * k), bl = Math.round(175 * (1 - k) + 30 * k);
      ctx.beginPath(); ctx.moveTo(SX(a[0]), SY(a[2])); ctx.lineTo(SX(b[0]), SY(b[2])); ctx.lineTo(SX(c[0]), SY(c[2])); ctx.closePath();
      ctx.fillStyle = `rgb(${r},${g},${bl})`; ctx.fill();
      if (wire) { ctx.lineWidth = wire; ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.stroke(); }
    }
    return { url: cv.toDataURL('image/png'), stats };
  };
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const summary = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { const tx = m.text(); if (/error|fail|exception/i.test(tx)) console.log('  [page]', tx.slice(0, 160)); });
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.addInitScript(installInPage);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const c of CASES) {
      try {
        await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), c.style), 60000, 'setStyle');
        if (c.params) await withTimeout(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), c.params), 30000, 'setStyleParams');
        const data = await withTimeout(page.evaluate(async (args) => {
          const m = await window.__pfFidelity._debugOuterMesh(args.target);
          if (!m) return null;
          const V = m.vertices, I = m.indices;
          const wall = window.__pfWallStats(V, I, args.bar);
          const crops = {};
          for (const crop of [
            { tag: 'wide', wedgeDeg: 60, hLo: 0.40, hHi: 0.96, wire: 0.5, pitch: -0.30 },
            { tag: 'tight', wedgeDeg: 22, hLo: 0.55, hHi: 0.92, wire: 1.0, pitch: -0.26 },
          ]) {
            const res = window.__pfCrestRender(V, I, { W: 1800, H: 1500, bar: args.bar, ...crop });
            crops[crop.tag] = res;
          }
          return { wall, crops, triCount: Math.floor(I.length / 3) };
        }, { target: TARGET, bar: BAR }), 200000, `mesh ${c.tag}`);
        if (!data) { console.log(`${c.tag}: NULL outer mesh`); continue; }
        for (const [tag, res] of Object.entries(data.crops)) {
          fs.writeFileSync(`${OUT}/${c.tag}_${tag}.png`, Buffer.from(res.url.split(',')[1], 'base64'));
        }
        const row = {
          tag: c.tag, style: c.style, params: c.params, outerTris: data.triCount,
          wallPctBelow15: data.wall.pctBelowBar, wallWorst: data.wall.worstMinAngle,
          cropWidePct: data.crops.wide.stats.pctBelowBar, cropTightPct: data.crops.tight.stats.pctBelowBar,
          worstSamples: data.wall.worst,
        };
        summary.push(row);
        console.log(JSON.stringify({ ...row, worstSamples: undefined }));
        console.log('   worst:', JSON.stringify(data.wall.worst));
      } catch (e) { console.log(`${c.tag}: ${String(e.message || e).slice(0, 140)}`); }
    }
    fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
    console.log('PNGs + summary →', OUT);
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
