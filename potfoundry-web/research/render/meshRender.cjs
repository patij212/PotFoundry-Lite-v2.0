// meshRender.cjs — DEV-ONLY reusable renderer for the meshing lab. ONE WebGLRenderer + per-cell viewports (bounded
// GPU memory → millions of tris/cell), binary fetch over a throwaway localhost server (JSON embedding dies >~600MB),
// FLAT shading (smooth vertex normals FADE sharp near-C0 relief → false "missing relief"; always flat-shade sharp
// styles). If a cell has a `<name>.col.bin` (f32 rgb/vertex, e.g. from labkit chord-sag colours) it renders as a
// HEATMAP (vertexColors + bright neutral light + legend); otherwise solid clay + directional light for form.
//
// Bins come from labkit.dumpRenderBins(dir, name, xyz, indices, {colors?}): <name>.xyz.bin (f32 xyz),
// <name>.idx.bin (u32), optional <name>.col.bin (f32 rgb), optional <name>.meta.json (label sub-text).
//
// Run (NOTE the NODE_PATH — a scratchpad/research script can't resolve the project node_modules otherwise):
//   NODE_PATH="<repo>/potfoundry-web/node_modules" node research/render/meshRender.cjs <out.png> <binDir> <cols> <name...>
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const out = process.argv[2];
const binDir = path.resolve(process.argv[3]);
const COLS = Math.max(1, parseInt(process.argv[4] || '2', 10));
const cells = process.argv.slice(5);
const ROWS = Math.ceil(cells.length / COLS);
const PW = 560, PH = 560, LEG = 44;
const hasHeat = cells.some((n) => fs.existsSync(path.join(binDir, `${n}.col.bin`)));
const metaOf = (n) => { try { return JSON.parse(fs.readFileSync(path.join(binDir, `${n}.meta.json`), 'utf8')); } catch { return {}; } };
const labels = cells.map((n, i) => {
  const col = i % COLS, row = (i / COLS) | 0; const m = metaOf(n);
  const bits = [];
  if (m.tris) bits.push(`${(m.tris / 1e6).toFixed(2)}M`);
  if (m.true3D_p99 != null) bits.push(`p99 ${(+m.true3D_p99).toFixed(3)}`);
  if (m.pctOver0_15 != null) bits.push(`${(+m.pctOver0_15).toFixed(2)}% red`);
  if (m.nonMan != null) bits.push(`nonMan ${m.nonMan}`);
  return `<div style="position:absolute;left:${col * PW}px;top:${row * PH + PH - 20}px;width:${PW}px;text-align:center;font:12px sans-serif;color:#111">${n}${bits.length ? ' — ' + bits.join(' · ') : ''}</div>`;
}).join('');
const legend = hasHeat ? `<div style="position:absolute;left:0;top:${ROWS * PH}px;width:${COLS * PW}px;height:${LEG}px;display:flex;align-items:center;justify-content:center;gap:10px;font:13px sans-serif;color:#111">
  <span>chord sag 0mm</span><span style="display:inline-block;width:300px;height:15px;background:linear-gradient(90deg,rgb(33,158,59),rgb(250,209,26),rgb(219,33,33));border:1px solid #999"></span><span>&ge;0.15mm</span></div>` : '';
const CANH = ROWS * PH + (hasHeat ? LEG : 0);
const BG = hasHeat ? 0xf7f6f3 : 0xf2f1ee;

const html = `<!doctype html><html><head><meta charset="utf8"><style>html,body{margin:0;background:#${BG.toString(16)}}</style></head><body>
<div style="position:relative;width:${COLS * PW}px;height:${CANH}px"><canvas id="c" width="${COLS * PW}" height="${ROWS * PH}"></canvas>${labels}${legend}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(async function(){
  const cells=${JSON.stringify(cells)}, COLS=${COLS}, ROWS=${ROWS}, PW=${PW}, PH=${PH}, HEAT=${hasHeat}, BG=${BG};
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
    const mat=colr
      ? new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95,metalness:0,flatShading:true,side:THREE.DoubleSide})
      : new THREE.MeshStandardMaterial({color:0xcf8a5a,roughness:0.85,flatShading:true,side:THREE.DoubleSide});
    const m=new THREE.Mesh(g,mat); m.position.sub(ctr);
    const sc=new THREE.Scene(); sc.add(m);
    sc.add(new THREE.HemisphereLight(0xffffff, colr?0xffffff:0x555544, colr?1.05:0.75));
    const dl=new THREE.DirectionalLight(0xffffff, colr?0.28:0.85); dl.position.set(0.3,-1,0.7); sc.add(dl);
    const R=Math.max(sz.x,sz.y,sz.z);
    const cam=new THREE.PerspectiveCamera(20,PW/PH,0.1,R*30);
    cam.up.set(0,0,1); cam.position.set(R*0.5,-R*1.1,-R*0.16); cam.lookAt(0,0,-R*0.26); // zoom lower-front relief
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
