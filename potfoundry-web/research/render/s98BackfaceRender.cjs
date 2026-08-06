// s98BackfaceRender.cjs — the ONE picture the lab renderer structurally cannot take.
//
// `research/render/meshRender.cjs` builds every material with `side: THREE.DoubleSide` (its lines 78-79),
// so a BACK-FACING triangle is lit exactly like a front-facing one and the defect is invisible in every
// render this campaign has produced. This variant takes a per-cell SIDE spec:
//     D = DoubleSide (what the lab always saw)
//     F = FrontSide  (backface CULLING ON — what a slicer, a WebGL viewer, and the app's own preview do)
// so the same bins can be shown twice and the reader can see the geometry DISAPPEAR.
//
// Everything else — one WebGLRenderer + per-cell viewports, binary fetch over a throwaway localhost
// server, FLAT shading — is meshRender.cjs's, deliberately unchanged.
//
//   NODE_PATH="<repo>/potfoundry-web/node_modules" node research/render/s98BackfaceRender.cjs \
//       <out.png> <binDir> <cols> <sideSpec e.g. DFDF> <name...>
/* eslint-env node */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const out = process.argv[2];
const binDir = path.resolve(process.argv[3]);
const COLS = Math.max(1, parseInt(process.argv[4] || '2', 10));
const SIDES = (process.argv[5] || '').split('');
const cells = process.argv.slice(6);
const ROWS = Math.ceil(cells.length / COLS);
const PW = Math.max(200, parseInt(process.env.PF_RENDER_CELL || '760', 10)), PH = PW;
const FS = Math.max(12, Math.round(PW / 46));
const CAPS = (process.env.PF_S98R_CAPS || '').split('|');
const metaOf = (n) => { try { return JSON.parse(fs.readFileSync(path.join(binDir, `${n}.meta.json`), 'utf8')); } catch { return {}; } };
const labels = cells.map((n, i) => {
  const col = i % COLS, row = (i / COLS) | 0; const m = metaOf(n);
  const side = SIDES[i] === 'F' ? 'BACKFACE CULLING ON (what a viewer shows)' : 'DoubleSide (what the lab renderer shows)';
  const cap = CAPS[i] || '';
  const bits = [];
  if (m.tris) bits.push(`${m.tris} tris`);
  if (m.nBad != null) bits.push(`${m.nBad} bucket-(a)`);
  return `<div style="position:absolute;left:${col * PW}px;top:${row * PH + PH - FS * 3.4}px;width:${PW}px;text-align:center;font:${FS}px sans-serif;color:#111;line-height:1.45">`
    + `<b>${cap || n}</b><br>${side}<br>${bits.join(' · ')}</div>`;
}).join('');
const CANH = ROWS * PH;
const BG = 0x2a2d33;   // DARK background so a culled (missing) triangle reads as a HOLE, not as paper

const html = `<!doctype html><html><head><meta charset="utf8"><style>html,body{margin:0;background:#${BG.toString(16)}}</style></head><body>
<div style="position:relative;width:${COLS * PW}px;height:${CANH}px"><canvas id="c" width="${COLS * PW}" height="${ROWS * PH}"></canvas>${labels}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(async function(){
  const cells=${JSON.stringify(cells)}, SIDES=${JSON.stringify(SIDES)}, COLS=${COLS}, ROWS=${ROWS}, PW=${PW}, PH=${PH}, BG=${BG};
  const r=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true,preserveDrawingBuffer:true});
  r.autoClear=false; r.setScissorTest(true);
  for(let i=0;i<cells.length;i++){
    const col=i%COLS,row=(i/COLS)|0,vx=col*PW,vy=(ROWS-1-row)*PH;
    r.setViewport(vx,vy,PW,PH); r.setScissor(vx,vy,PW,PH); r.setClearColor(BG,1); r.clear();
    let pos,idx,colr=null;
    try{ pos=new Float32Array(await(await fetch('/'+cells[i]+'.xyz.bin')).arrayBuffer());
         idx=new Uint32Array(await(await fetch('/'+cells[i]+'.idx.bin')).arrayBuffer()); }catch(e){continue;}
    try{ colr=new Float32Array(await(await fetch('/'+cells[i]+'.col.bin')).arrayBuffer()); }catch(e){colr=null;}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setIndex(new THREE.BufferAttribute(idx,1));
    if(colr) g.setAttribute('color',new THREE.BufferAttribute(colr,3));
    g.computeBoundingBox();
    const ctr=new THREE.Vector3(); g.boundingBox.getCenter(ctr);
    const sz=new THREE.Vector3(); g.boundingBox.getSize(sz);
    const side = SIDES[i]==='F' ? THREE.FrontSide : THREE.DoubleSide;
    const mat=new THREE.MeshStandardMaterial({vertexColors:!!colr,color:colr?0xffffff:0xcf8a5a,roughness:0.9,metalness:0,flatShading:true,side:side});
    const m=new THREE.Mesh(g,mat); m.position.sub(ctr);
    const sc=new THREE.Scene(); sc.add(m);
    sc.add(new THREE.HemisphereLight(0xffffff,0x40444c,0.95));
    const dl=new THREE.DirectionalLight(0xffffff,0.75); dl.position.set(0.35,-1,0.55); sc.add(dl);
    // FRAME THE WHOLE BOUNDING BOX. The first cut of this file copied meshRender.cjs's hand-tuned
    // "zoom lower-front relief" camera, which is calibrated for a full pot and cropped a 2.5 mm patch to a
    // featureless wall. d = (R/2)/tan(fov/2) * margin puts the bbox exactly in frame at any scale.
    const R=Math.max(sz.x,sz.y,sz.z), FOV=22;
    const d=(R/2)/Math.tan(FOV*Math.PI/360)*1.18;
    const dir=new THREE.Vector3(0.42,-1.0,0.30).normalize();
    const cam=new THREE.PerspectiveCamera(FOV,PW/PH,Math.max(1e-4,R*1e-3),d*8);
    cam.up.set(0,0,1); cam.position.copy(dir.multiplyScalar(d)); cam.lookAt(0,0,0);
    r.render(sc,cam); g.dispose(); mat.dispose(); window.__p=i+1;
  }
  window.__done=1;
})().catch(e=>{window.__err=String(e);});
</script></body></html>`;

(async () => {
  fs.writeFileSync(out.replace(/\.png$/, '.html'), html);
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
    if (name === '' || name === 'render.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
    const fp = path.join(binDir, name);
    if (!fp.startsWith(binDir) || !fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const p = await b.newPage({ viewport: { width: COLS * PW + 8, height: CANH + 8 } });
    const msgs = []; p.on('console', (m) => msgs.push(m.text())); p.on('pageerror', (e) => msgs.push('PE ' + e.message));
    await p.goto(`http://localhost:${port}/render.html`);
    await p.waitForFunction('window.__done === 1 || window.__err', { timeout: 1200000 }).catch(() => msgs.push('TIMEOUT'));
    const err = await p.evaluate('window.__err || null'); if (err) msgs.push('ERR ' + err);
    await p.waitForTimeout(500);
    await p.screenshot({ path: out, fullPage: true });
    console.log('wrote ' + out + (msgs.length ? '  [' + msgs.slice(0, 6).join(' | ') + ']' : ''));
  } finally { await b.close(); server.close(); }
})();
