// SFB@1 FLAT-SHADED render — capture the production (strip-pave OFF) export mesh the
// way a slicer shows it (per-face normals via screen-space derivatives), so the VISIBLE
// serration is reproduced. Dependency-free WebGL2 (face normal = cross(dFdx,dFdy)).
// Renders an upper-wall view + a tight petal-rim zoom and screenshots both.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = 'SuperformulaBlossom';
const TARGET = Number(process.env.PF_TARGET || 1_500_000);
// PF_SFEXACT=0 ⇒ render the PRODUCTION DEFAULT export (surfaceFidelityExact OFF, crests
// NOT inserted). Default 1 ⇒ the dev-lever "best" export (crests inserted).
const SFEXACT = process.env.PF_SFEXACT !== '0';
const SFTAG = SFEXACT ? 'sf1' : 'sf0';
// PF_UBIAS: '3' (the forced dev-lever the STLs used), '2', or 'auto' (production
// computeUBias — do NOT force). Tags the output so views are comparable.
const UBIAS = process.env.PF_UBIAS || '3';
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const T = 300_000;
fs.mkdirSync(OUT, { recursive: true });
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(`${l} timeout`)), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const out = { style: STYLE, target: TARGET };
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  page.on('console', (m) => { const t = m.text(); if (/error|RENDER/i.test(t)) console.log('  [page]', t.slice(0, 160)); });
  try {
    await page.addInitScript((args) => {
      window.__pfConforming = true;
      if (args.sfexact) window.__pfSurfaceFidelityExact = true; // OFF ⇒ production default (no crest edges)
      window.__pfConformingMaxLevel = 12;
      window.__pfConformingMaxSag = 0.05;
      if (args.ubias !== 'auto') window.__pfConformingUBias = Number(args.ubias); // 'auto' ⇒ production computeUBias
    }, { sfexact: SFEXACT, ubias: UBIAS });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wt(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    await wt(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');

    // Build the mesh ONCE, stash positions+indices on window for the renderer.
    const meta = await wt(page.evaluate(async (target) => {
      const m = await window.__pfFidelity.getMeshForRender(target);
      if (!m) return null;
      window.__mesh = { v: m.vertices, i: m.indices };
      // bbox
      let xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9;
      const v = m.vertices;
      for (let k = 0; k < v.length; k += 3) {
        const x = v[k], y = v[k + 1], z = v[k + 2];
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        if (z < zmin) zmin = z; if (z > zmax) zmax = z;
      }
      return { tris: m.indices.length / 3, bbox: { xmin, xmax, ymin, ymax, zmin, zmax } };
    }, TARGET), T, 'getMesh');
    if (!meta) throw new Error('getMeshForRender null');
    out.meta = meta;

    // ── Dependency-free WebGL2 flat-shaded render of window.__mesh. ──
    const renderView = async (eye, target, fovDeg, tag, mode = 'flat') => {
      const ok = await page.evaluate((args) => {
        const { eye, target, fovDeg, mode } = args;
        const m = window.__mesh; if (!m) return 'no mesh';
        let cv = document.getElementById('__rcv');
        if (!cv) { cv = document.createElement('canvas'); cv.id = '__rcv'; cv.width = 1200; cv.height = 1200; cv.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1b1d22'; document.body.appendChild(cv); }
        const gl = cv.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
        if (!gl) return 'no webgl2';
        // matrices
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const lookAt = (e, c, up) => { const f = norm(sub(c, e)); const s = norm(cross(f, up)); const u = cross(s, f); return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, e), -dot(u, e), dot(f, e), 1]; };
        const persp = (fovy, asp, n, fr) => { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]; };
        const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
        const V = lookAt(eye, target, [0, 0, 1]);
        const P = persp((fovDeg * Math.PI) / 180, 1, 1, 5000);
        const MVP = mul(P, V);
        const vs = `#version 300 es
        layout(location=0) in vec3 p; uniform mat4 u; out vec3 w;
        void main(){ w=p; gl_Position=u*vec4(p,1.0); }`;
        // flat: soft lambert (smooth surface read). normal: per-face normal AS COLOR
        // (matcap-class) — adjacent slivers with differing normals jump colour, so the
        // crest-band sliver noise is vivid (a smooth, well-shaped band stays uniform).
        const fsFlat = `#version 300 es
        precision highp float; in vec3 w; out vec4 o;
        void main(){ vec3 n=normalize(cross(dFdx(w),dFdy(w)));
          vec3 L=normalize(vec3(0.5,0.6,0.9)); float d=abs(dot(n,L));
          float sh=0.25+0.75*d; vec3 c=vec3(0.78,0.80,0.85)*sh; o=vec4(c,1.0); }`;
        const fsNormal = `#version 300 es
        precision highp float; in vec3 w; out vec4 o;
        void main(){ vec3 n=normalize(cross(dFdx(w),dFdy(w))); o=vec4(n*0.5+0.5,1.0); }`;
        const fs = mode === 'normal' ? fsNormal : fsFlat;
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW);
        gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'u'), false, MVP);
        gl.enable(gl.DEPTH_TEST); gl.viewport(0, 0, 1200, 1200); gl.clearColor(0.105, 0.114, 0.133, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, m.i.length, gl.UNSIGNED_INT, 0);
        gl.finish();
        return 'ok';
      }, { eye, target, fovDeg, mode });
      if (ok !== 'ok') { out['render_' + tag] = ok; return; }
      await page.waitForTimeout(400);
      await page.locator('#__rcv').screenshot({ path: path.join(OUT, `sfb1_${SFTAG}_b${UBIAS}_${mode}_${tag}.png`) });
    };

    const b = meta.bbox;
    const R = Math.max(b.xmax, b.ymax, -b.xmin, -b.ymin);
    const H = b.zmax - b.zmin;
    // Orientation.
    await renderView([R * 3.4, 0, b.zmin + H * 0.5], [0, 0, b.zmin + H * 0.5], 32, 'full', 'flat');
    // GRAZING upper-rim zoom — matches the user's slicer view (silhouette at top, the
    // sliver "fur" texture across the surface). Tight fov to resolve individual slivers.
    const E_GRAZE = [R * 1.7, R * 0.7, b.zmin + H * 0.42], T_GRAZE = [R * 0.5, R * 0.18, b.zmin + H * 0.9];
    await renderView(E_GRAZE, T_GRAZE, 13, 'graze', 'flat');
    await renderView(E_GRAZE, T_GRAZE, 13, 'graze', 'normal');
    // Even tighter patch.
    const E_PATCH = [R * 1.25, R * 0.55, b.zmin + H * 0.6], T_PATCH = [R * 0.35, R * 0.12, b.zmin + H * 0.88];
    await renderView(E_PATCH, T_PATCH, 8, 'patch', 'flat');
    out.screenshots = [`sfb1_${SFTAG}_b${UBIAS}_flat_graze.png`, `sfb1_${SFTAG}_b${UBIAS}_normal_graze.png`, `sfb1_${SFTAG}_b${UBIAS}_flat_patch.png`];
  } catch (e) {
    out.error = String(e.message).slice(0, 180);
  } finally {
    await page.close();
    await browser.close();
    console.log('browser.close() ran');
  }
  console.log('\n===== SFB@1 FLAT RENDER =====');
  console.log(JSON.stringify(out, null, 2));
})();
