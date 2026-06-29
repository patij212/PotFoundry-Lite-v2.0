// Flat-shaded A/B render of two STL files at the SAME camera — to SEE the per-cell
// sawtooth vs the corridor clean cusps. Standalone (about:blank, no dev server).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'export-deliverables');

function readStlPositions(file) {
  const buf = fs.readFileSync(file);
  const nTri = buf.readUInt32LE(80);
  const pos = new Float32Array(nTri * 9);
  let off = 84, o = 0;
  let xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9;
  for (let t = 0; t < nTri; t++) {
    for (let v = 0; v < 3; v++) {
      const b = off + 12 + v * 12;
      const x = buf.readFloatLE(b), y = buf.readFloatLE(b + 4), z = buf.readFloatLE(b + 8);
      pos[o++] = x; pos[o++] = y; pos[o++] = z;
      if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    off += 50;
  }
  return { pos, nTri, bbox: { xmin, xmax, ymin, ymax, zmin, zmax } };
}

(async () => {
  const a = readStlPositions(path.join(OUT, 'SuperformulaBlossom_sf1_retrofit.stl'));
  const c = readStlPositions(path.join(OUT, 'SuperformulaBlossom_sf1_sharp.stl'));
  const b = a.bbox;
  const R = Math.max(b.xmax, b.ymax, -b.xmin, -b.ymin);
  const Hh = b.zmax - b.zmin;
  // Pulled-back 3/4 view of the WHOLE pot — petal ridges show on the silhouette edges.
  const eye = [R * 4.5, R * 4.5, b.zmin + Hh * 0.62];
  const target = [0, 0, b.zmin + Hh * 0.5];
  const fov = 30;

  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-gl=angle'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  await page.goto('about:blank');
  const renderOne = async (data, tag) => {
    const b64 = Buffer.from(data.pos.buffer, data.pos.byteOffset, data.pos.byteLength).toString('base64');
    const ok = await page.evaluate((args) => {
      const { b64, eye, target, fov, nTri } = args;
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const pos = new Float32Array(u8.buffer);
      let cv = document.getElementById('c'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'c'; cv.width = 1200; cv.height = 1200; document.body.appendChild(cv); }
      const gl = cv.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true }); if (!gl) return 'no gl';
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }; const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const lookAt = (e, c, up) => { const f = norm(sub(c, e)); const s = norm(cross(f, up)); const u = cross(s, f); return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, e), -dot(u, e), dot(f, e), 1]; };
      const persp = (fy, asp, n, fr) => { const t = 1 / Math.tan(fy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]; };
      const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
      const MVP = mul(persp(fov * Math.PI / 180, 1, 1, 8000), lookAt(eye, target, [0, 0, 1]));
      const vs = `#version 300 es\nlayout(location=0) in vec3 p; uniform mat4 u; out vec3 w; void main(){w=p; gl_Position=u*vec4(p,1.);}`;
      const fs = `#version 300 es\nprecision highp float; in vec3 w; uniform vec3 eye; out vec4 o; void main(){ vec3 n=normalize(cross(dFdx(w),dFdy(w))); vec3 V=normalize(eye-w); if(dot(n,V)<0.) n=-n; vec3 L=normalize(vec3(.3,.4,.85)); float d=max(dot(n,L),0.); vec3 H=normalize(L+V); float sp=pow(max(dot(n,H),0.),32.); o=vec4(vec3(.83,.66,.22)*(.18+.82*d)+vec3(1.,.95,.8)*sp*.7,1.);}`;
      const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'u'), false, MVP); gl.uniform3fv(gl.getUniformLocation(pr, 'eye'), eye);
      gl.enable(gl.DEPTH_TEST); gl.viewport(0, 0, 1200, 1200); gl.clearColor(.1, .11, .13, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, nTri * 3); gl.finish(); return 'ok';
    }, { b64, eye, target, fov, nTri: data.nTri });
    if (ok !== 'ok') { console.log(`render ${tag}: ${ok}`); return; }
    await page.waitForTimeout(300);
    await page.locator('#c').screenshot({ path: path.join(OUT, `sfb_ab_${tag}.png`) });
    console.log(`wrote sfb_ab_${tag}.png`);
  };
  try { await renderOne(a, 'retrofit'); await renderOne(c, 'sharp'); }
  finally { await page.close(); await browser.close(); console.log('done'); }
})();
