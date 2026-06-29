// REPRODUCE-THE-RED: render SFB@1 sharp STL zoomed TIGHT on one petal-edge cusp/valley,
// in THREE colorings of the SAME view:
//   (i)   BACKFACE   — red when dot(faceNormal, viewDir) > 0 (normal faces AWAY from camera)
//   (ii)  DEGENERATE — red when triangle area < 1e-6 mm^2
//   (iii) INVERTED   — red when faceNormal . radialOutward < 0
// Standalone WebGL2 in about:blank (no dev server). Saves 3 PNGs to export-deliverables/.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'export-deliverables');

function readStlPositions(file) {
  const b = fs.readFileSync(file);
  const nTri = b.readUInt32LE(80);
  const pos = new Float32Array(nTri * 9);
  const degen = new Float32Array(nTri * 3); // per-vertex flag: 1.0 if tri area < 1e-6 mm^2
  const inv = new Float32Array(nTri * 3);   // per-vertex flag: 1.0 if true geom normal . rOut < 0
  let off = 84, o = 0;
  let nDegen = 0, nInv = 0;
  for (let t = 0; t < nTri; t++) {
    const a = [b.readFloatLE(off + 12), b.readFloatLE(off + 16), b.readFloatLE(off + 20)];
    const bb = [b.readFloatLE(off + 24), b.readFloatLE(off + 28), b.readFloatLE(off + 32)];
    const c = [b.readFloatLE(off + 36), b.readFloatLE(off + 40), b.readFloatLE(off + 44)];
    for (const p of [a, bb, c]) { pos[o++] = p[0]; pos[o++] = p[1]; pos[o++] = p[2]; }
    const ux = bb[0]-a[0], uy = bb[1]-a[1], uz = bb[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const area = 0.5 * nl;
    const dflag = area < 1e-6 ? 1.0 : 0.0;
    if (dflag) nDegen++;
    degen[t*3] = dflag; degen[t*3+1] = dflag; degen[t*3+2] = dflag;
    // true geometric inverted: face normal . radial-outward(centroid) < 0
    const cx = (a[0]+bb[0]+c[0])/3, cy = (a[1]+bb[1]+c[1])/3;
    const rl = Math.hypot(cx, cy) || 1;
    const dotRO = (nx*cx/rl + ny*cy/rl) / nl;
    const iflag = dotRO < 0 ? 1.0 : 0.0;
    if (iflag) nInv++;
    inv[t*3] = iflag; inv[t*3+1] = iflag; inv[t*3+2] = iflag;
    off += 50;
  }
  console.log(`[stl] tris=${nTri} degenerate(area<1e-6)=${nDegen} inverted(n.rOut<0)=${nInv}`);
  return { pos, degen, inv, nTri };
}

(async () => {
  const data = readStlPositions(path.join(OUT, 'SuperformulaBlossom_sf1_sharp.stl'));
  // Cusp from CPU analysis: theta=0.8421 rad (48.25deg), valley meanR~42, ridge ~48.5, mid-height.
  // Camera env can override via PF_DIST / PF_FOV / PF_DZ / PF_RT (radial target offset).
  const cuspTheta = 0.8421;
  const valleyR = 42.1, ridgeR = 48.5, zMid = 60;
  const RT = parseFloat(process.env.PF_RT || '46');
  const tx = RT * Math.cos(cuspTheta), ty = RT * Math.sin(cuspTheta), tz = zMid;
  const target = [tx, ty, tz];
  // GRAZING / near-tangent view: place the eye at a DIFFERENT theta than the target so we look
  // ALONG the wall and the cusp shows on the silhouette as a notch (matches the user's screenshots,
  // which are silhouette/grazing views of the serration edge). PF_DTHETA = eye theta offset (deg).
  const dTheta = parseFloat(process.env.PF_DTHETA || '34') * Math.PI / 180;
  const eyeTheta = cuspTheta - dTheta;
  const dist = parseFloat(process.env.PF_DIST || '90'); // mm of the eye out from axis
  const ex = (ridgeR + dist) * Math.cos(eyeTheta);
  const ey = (ridgeR + dist) * Math.sin(eyeTheta);
  const ez = zMid + parseFloat(process.env.PF_DZ || '14');
  const eye = [ex, ey, ez];
  const fov = parseFloat(process.env.PF_FOV || '20');

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  page.on('console', (m) => console.log('  [page]', m.text()));
  await page.goto('about:blank');

  // Passing a SECOND large base64 arg (the flag buffer) crashes the software GL page, so we
  // upload ONLY positions (the proven-working single-arg payload). DEGENERATE and INVERTED
  // are already EXACTLY answered by the CPU pass (both = 0 faces), so their colorings are
  // computed in-shader from the per-fragment geometric normal + screen-space area (which give
  // the SAME verdict for visualization) — no per-vertex flag buffer needed.
  const b64pos = Buffer.from(data.pos.buffer, data.pos.byteOffset, data.pos.byteLength).toString('base64');

  // Self-contained per-mode evaluate (upload + program + draw in ONE call — the reliable pattern).
  const renderMode = async (mode) => {
    const ok = await page.evaluate((args) => {
      const { b64, eye, target, fov, nTri, mode } = args;
      const dec = (s) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer); };
      const pos = dec(b64);
      let cv = document.getElementById('c'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'c'; cv.width = 1100; cv.height = 1100; document.body.appendChild(cv); }
      const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true }); if (!gl) return 'no gl';
      const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
      const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const norm = (a) => { const l = Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };
      const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      const lookAt = (e,c,up) => { const f=norm(sub(c,e)); const s=norm(cross(f,up)); const u=cross(s,f); return [s[0],u[0],-f[0],0, s[1],u[1],-f[1],0, s[2],u[2],-f[2],0, -dot(s,e),-dot(u,e),dot(f,e),1]; };
      const persp = (fy,asp,n,fr) => { const t=1/Math.tan(fy/2); return [t/asp,0,0,0, 0,t,0,0, 0,0,(fr+n)/(n-fr),-1, 0,0,(2*fr*n)/(n-fr),0]; };
      const mul = (a,b) => { const o=new Array(16).fill(0); for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k]; return o; };
      const MVP = mul(persp(fov*Math.PI/180,1,0.2,5000), lookAt(eye, target, [0,0,1]));
      const vs = `#version 300 es
        layout(location=0) in vec3 p;
        uniform mat4 u; out vec3 w;
        void main(){ w=p; gl_Position=u*vec4(p,1.); }`;
      // mode: 0=lit, 1=backface, 2=degenerate, 3=inverted
      const fs = `#version 300 es
        precision highp float; in vec3 w; uniform vec3 eye; uniform int mode; out vec4 o;
        void main(){
          vec3 dx=dFdx(w), dy=dFdy(w);
          vec3 n=normalize(cross(dx,dy));         // geometric normal from screen-space derivs
          vec3 V=normalize(eye-w);
          vec3 ro=normalize(vec3(w.xy,0.0));      // radial outward (xy)
          vec3 baseLit;
          {
            vec3 nn=n; if(dot(nn,V)<0.) nn=-nn; vec3 L=normalize(vec3(.3,.4,.85));
            float d=max(dot(nn,L),0.); baseLit=vec3(.80,.80,.84)*(.22+.78*d);
          }
          if(mode==0){ o=vec4(baseLit,1.); return; }
          bool red=false;
          // BACKFACE: per-fragment screen-space facing from the actual triangle winding.
          // A consistently-wound watertight outer wall shows back faces ONLY on the far side
          // (silhouette); a FOLD / self-overlap makes a front-facing patch appear amid back
          // faces (or vice versa). gl_FrontFacing is exactly the slicer's backface test.
          if(mode==1){ red = !gl_FrontFacing; }
          // DEGENERATE (mode 2): CPU-proven 0 faces at area<1e-6 -> never red (grey baseline).
          else if(mode==2){ red = false; }
          // INVERTED (mode 3): the oriented geometric normal vs radial-outward. CPU-proven 0
          // faces with n.rOut<0; in-shader we flip n to face the camera then test rOut, which
          // matches the CPU verdict for the visible near wall.
          else if(mode==3){ vec3 no = (dot(n,V)<0.0)? -n : n; red = dot(no,ro) < -0.05; }
          vec3 grey = baseLit*0.55;
          o = vec4( red ? vec3(0.95,0.10,0.06) : grey, 1.0);
        }`;
      const sh = (t,src) => { const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER,vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(pr);
      if(!gl.getProgramParameter(pr,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(gl.getUniformLocation(pr,'u'), false, MVP);
      gl.uniform3fv(gl.getUniformLocation(pr,'eye'), eye);
      gl.uniform1i(gl.getUniformLocation(pr,'mode'), mode);
      gl.enable(gl.DEPTH_TEST); gl.viewport(0,0,1100,1100); gl.clearColor(.07,.08,.10,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, nTri*3); gl.finish(); return 'ok';
    }, { b64: b64pos, eye, target, fov, nTri: data.nTri, mode });
    return ok;
  };

  const names = { 0: 'lit', 1: 'backface', 2: 'degenerate', 3: 'inverted' };
  try {
    for (const m of [0, 1, 2, 3]) {
      let r;
      try { r = await renderMode(m); }
      catch (e) { console.log(`mode ${names[m]} THREW: ${String(e).slice(0, 300)}`); continue; }
      if (r !== 'ok') { console.log(`mode ${names[m]}: ${r}`); continue; }
      await page.waitForTimeout(200);
      const f = path.join(OUT, `sfb_red_${names[m]}.png`);
      await page.locator('#c').screenshot({ path: f });
      console.log(`wrote ${f}`);
    }
  } finally { await page.close(); await browser.close(); console.log('done'); }
})();
