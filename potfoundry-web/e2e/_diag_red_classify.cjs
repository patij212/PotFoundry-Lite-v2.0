// CPU pre-analysis + per-face red classification for the SFB@1 cusp defect.
// Reads the binary STL, filters the OUTER PETAL WALL, and classifies every outer-wall
// face under the THREE red schemes the render uses:
//   (i)   BACKFACE: dot(faceNormal, viewDir) > 0  (faces away from camera) — needs a camera.
//         We instead report ORIENTATION CONSISTENCY: faceNormal . radialOutward sign mix
//         per local theta-z bin (a fold flips the sign within a tiny neighbourhood).
//   (ii)  DEGENERATE: triangle area < 1e-6 mm^2 (zero-area slivers).
//   (iii) INVERTED: faceNormal . radialOutward < 0 (wrong winding / inward-facing).
// Also: locate a cusp (valley between petals) to aim the camera, and report the theta
// histogram of inverted+degenerate faces to show cusp clustering.
const fs = require('fs');
const path = require('path');
const STL = path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');
const buf = fs.readFileSync(STL);
const nTri = buf.readUInt32LE(80);
console.log(`[classify] tris=${nTri}`);

let off = 84;
const A = [0,0,0], B = [0,0,0], C = [0,0,0];
// bbox of all + outer wall
let xmin=1e9,xmax=-1e9,ymin=1e9,ymax=-1e9,zmin=1e9,zmax=-1e9;

// per-theta-bin (the petal lobes). 360 bins over theta. Track:
//   count, invertedCount, degenCount, min radius (valley), max radius (ridge)
const NB = 720;
const binCount = new Int32Array(NB);
const binInv = new Int32Array(NB);
const binDegen = new Int32Array(NB);
const binBackOut = new Int32Array(NB); // faces whose normal flipped vs neighbours (sign mix proxy)
const binRmin = new Float64Array(NB).fill(1e9);
const binRmax = new Float64Array(NB).fill(-1e9);
for (let i=0;i<NB;i++){ binRmin[i]=1e9; binRmax[i]=-1e9; }

let outerCount=0, degenAll=0, invAll=0;
let areaList = [];
let minAreaOuter = 1e9;

// also collect cusp candidate: bin with the LOWEST mean radius (deepest valley) at mid-height
const binRsum = new Float64Array(NB);
const binRn = new Int32Array(NB);

for (let t=0;t<nTri;t++){
  const base = off + 12;
  for (let v=0;v<3;v++){
    const o = base + v*12;
    const arr = v===0?A:v===1?B:C;
    arr[0]=buf.readFloatLE(o); arr[1]=buf.readFloatLE(o+4); arr[2]=buf.readFloatLE(o+8);
  }
  off += 50;
  // centroid
  const cx=(A[0]+B[0]+C[0])/3, cy=(A[1]+B[1]+C[1])/3, cz=(A[2]+B[2]+C[2])/3;
  const cr = Math.hypot(cx,cy);
  if (cx<xmin)xmin=cx; if(cx>xmax)xmax=cx; if(cy<ymin)ymin=cy; if(cy>ymax)ymax=cy; if(cz<zmin)zmin=cz; if(cz>zmax)zmax=cz;
  // outer wall filter (same as ref): cr>42, z in [8,112]
  if (!(cr>42 && cz>8 && cz<112)) continue;
  outerCount++;
  // face normal
  const ux=B[0]-A[0], uy=B[1]-A[1], uz=B[2]-A[2];
  const vx=C[0]-A[0], vy=C[1]-A[1], vz=C[2]-A[2];
  let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  const nl=Math.hypot(nx,ny,nz);
  const area = 0.5*nl;
  if (area<minAreaOuter) minAreaOuter=area;
  if ((t&15)===0) areaList.push(area);
  // radial outward at centroid (xy only)
  const rl = Math.hypot(cx,cy)||1;
  const rox=cx/rl, roy=cy/rl, roz=0;
  let dotRO = 0;
  if (nl>0){ dotRO = (nx*rox+ny*roy+nz*roz)/nl; }
  const theta = Math.atan2(cy,cx); // -pi..pi
  const bi = Math.floor((theta+Math.PI)/(2*Math.PI)*NB)%NB;
  binCount[bi]++;
  binRsum[bi]+=cr; binRn[bi]++;
  if (cr<binRmin[bi]) binRmin[bi]=cr; if(cr>binRmax[bi]) binRmax[bi]=cr;
  if (area < 1e-6){ binDegen[bi]++; degenAll++; }
  if (dotRO < 0){ binInv[bi]++; invAll++; }
}

console.log(`[bbox] x[${xmin.toFixed(2)},${xmax.toFixed(2)}] y[${ymin.toFixed(2)},${ymax.toFixed(2)}] z[${zmin.toFixed(2)},${zmax.toFixed(2)}]`);
console.log(`[outer] faces=${outerCount}  degenerate(<1e-6mm^2)=${degenAll} (${(100*degenAll/outerCount).toFixed(4)}%)  inverted(n.rOut<0)=${invAll} (${(100*invAll/outerCount).toFixed(3)}%)`);
console.log(`[area] minOuter=${minAreaOuter.toExponential(3)} mm^2`);
areaList.sort((a,b)=>a-b);
const pa=(p)=>areaList[Math.min(areaList.length-1,Math.floor(p*areaList.length))];
console.log(`[area outer sampled] p01=${pa(0.01).toExponential(3)} p10=${pa(0.10).toExponential(3)} p50=${pa(0.5).toExponential(3)} p99=${pa(0.99).toExponential(3)}`);

// Find petal structure: ridges (rmax peaks) and valleys (rmin troughs) over theta bins.
// Smooth mean radius and find local minima => valleys (cusps between petals).
const meanR = new Float64Array(NB);
for (let i=0;i<NB;i++) meanR[i] = binRn[i]>0 ? binRsum[i]/binRn[i] : NaN;
// count petals by counting local maxima of meanR (ignore NaN)
let petals=0; const valleys=[];
for (let i=0;i<NB;i++){
  const a=meanR[(i-3+NB)%NB], b=meanR[i], c=meanR[(i+3)%NB];
  if (isNaN(a)||isNaN(b)||isNaN(c)) continue;
  if (b>a && b>c) petals++;
  if (b<a && b<c) valleys.push({bin:i, theta:(i+0.5)/NB*2*Math.PI-Math.PI, r:b});
}
console.log(`[petals] local-max count ~= ${petals}, valleys found=${valleys.length}`);
// pick the deepest valley near mid-theta for a clean camera target
valleys.sort((p,q)=>p.r-q.r);
const cusp = valleys[0];
if (cusp){
  console.log(`[cusp pick] bin=${cusp.bin} theta=${cusp.theta.toFixed(4)}rad (${(cusp.theta*180/Math.PI).toFixed(2)}deg) meanR=${cusp.r.toFixed(3)}`);
  // ridge radius nearby
  let rmaxNear=-1e9; for(let d=-15;d<=15;d++){const v=meanR[(cusp.bin+d+NB)%NB]; if(!isNaN(v)&&v>rmaxNear)rmaxNear=v;}
  console.log(`[cusp pick] nearby ridge meanR=${rmaxNear.toFixed(3)}  valley->ridge depth=${(rmaxNear-cusp.r).toFixed(3)}mm`);
}

// Where do inverted faces cluster relative to valleys? Top-10 bins by inverted count.
const order = Array.from({length:NB},(_,i)=>i).sort((a,b)=>binInv[b]-binInv[a]);
console.log(`[inverted clustering] top-12 theta-bins by inverted-face count:`);
for (let k=0;k<12;k++){
  const i=order[k]; if(binInv[i]===0) break;
  const th=(i+0.5)/NB*360-180;
  // is this bin a valley?
  const isVal = valleys.slice(0,40).some(v=>Math.abs(((v.bin-i+NB)%NB))<=4 || Math.abs(((i-v.bin+NB)%NB))<=4);
  console.log(`  bin=${i} theta=${th.toFixed(2)}deg inverted=${binInv[i]} degen=${binDegen[i]} count=${binCount[i]} meanR=${meanR[i].toFixed(2)} ${isVal?'<-NEAR VALLEY':''}`);
}
const orderD = Array.from({length:NB},(_,i)=>i).sort((a,b)=>binDegen[b]-binDegen[a]);
console.log(`[degenerate clustering] top-8 theta-bins by degenerate-face count:`);
for (let k=0;k<8;k++){
  const i=orderD[k]; if(binDegen[i]===0) break;
  const th=(i+0.5)/NB*360-180;
  const isVal = valleys.slice(0,40).some(v=>Math.abs(((v.bin-i+NB)%NB))<=4 || Math.abs(((i-v.bin+NB)%NB))<=4);
  console.log(`  bin=${i} theta=${th.toFixed(2)}deg degen=${binDegen[i]} inverted=${binInv[i]} count=${binCount[i]} ${isVal?'<-NEAR VALLEY':''}`);
}
