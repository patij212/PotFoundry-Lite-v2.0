import { readFileSync } from 'node:fs';
import { buildRadiusFn } from './labkit.ts';
const DIMS={H:120,Rb:40,Rt:50,expn:1}, H=120, TAU=2*Math.PI, R_MEAN=48;
const rA=buildRadiusFn('GothicArches',{},DIMS);
const c=JSON.parse(readFileSync('../exchange/_gd_gothic/extract.cache.json','utf8'));
const ut=c.crestUt;
function lift(u,t){const th=TAU*(u-Math.floor(u)),z=t*H,r=rA(th,z);return [r*Math.cos(th),r*Math.sin(th),z];}
function truePerp(p,thWin=0.06,zWin=3.0,nCoarse=48){const px=p[0],py=p[1],pz=p[2];const th0=Math.atan2(py,px);
 const d2=(th,z)=>{const r=rA(th<0?th+TAU:th>=TAU?th-TAU:th,z);const ex=px-r*Math.cos(th),ey=py-r*Math.sin(th),ez=pz-z;return ex*ex+ey*ey+ez*ez;};
 const nTh=nCoarse,nZ=nCoarse,zLo=Math.max(0,pz-zWin),zHi=Math.min(H,pz+zWin);let best=Infinity,bth=th0,bz=pz;
 for(let i=0;i<=nTh;i++){const th=th0-thWin+2*thWin*(i/nTh);for(let j=0;j<=nZ;j++){const z=zLo+(zHi-zLo)*(j/nZ);const f=d2(th,z);if(f<best){best=f;bth=th;bz=z;}}}
 let hTh=2*thWin/nTh,hZ=(zHi-zLo)/nZ;for(let it=0;it<90;it++){let imp=false;for(const dth of[-hTh,0,hTh])for(const dz of[-hZ,0,hZ]){const f=d2(bth+dth,bz+dz);if(f<best){best=f;bth+=dth;bz+=dz;imp=true;}}if(!imp){hTh*=0.5;hZ*=0.5;}if(hTh<1e-11&&hZ<1e-11)break;}
 return Math.sqrt(best);}
function apexU(uSeed,t){const z=t*H,W=(1/72)/4;let a=uSeed-W,b=uSeed+W;const GR=(Math.sqrt(5)-1)/2;
 const f=u=>rA(TAU*(u-Math.floor(u)),z);let cc=b-GR*(b-a),d=a+GR*(b-a),fc=f(cc),fd=f(d);
 for(let it=0;it<60;it++){if(fc>fd){b=d;d=cc;fd=fc;cc=b-GR*(b-a);fc=f(cc);}else{a=cc;cc=d;fc=fd;d=a+GR*(b-a);fd=f(d);}if(b-a<1e-9)break;}return (a+b)/2;}
const B36=[];for(let i=1;i<8;i++)for(let j=1;j+i<8;j++)B36.push([i/8,j/8,(8-i-j)/8]);B36.push([.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]);
const B10=[];for(let i=1;i<5;i++)for(let j=1;j+i<5;j++)B10.push([i/5,j/5,(5-i-j)/5]);B10.push([.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]);
function dint(p0,p1,p2,B){let mx=0;for(const[b0,b1,b2]of B){const pt=[b0*p0[0]+b1*p1[0]+b2*p2[0],b0*p0[1]+b1*p1[1]+b2*p2[1],b0*p0[2]+b1*p1[2]+b2*p2[2]];const d=truePerp(pt);if(d>mx)mx=d;}return mx;}
const du=1/8192;const cand=[];
for(let i=0;i+1<ut.length;i+=2){const u=ut[i],t=ut[i+1],z=t*H;const g=Math.abs(rA(TAU*((u+du)-Math.floor(u+du)),z)-rA(TAU*((u-du)-Math.floor(u-du)),z))/(2*du*TAU);cand.push({u,t,g});}
cand.sort((a,b)=>b.g-a.g);
const N=Number(process.argv[2]||60);
const cusps=cand.slice(0,N);
const FA=0.181,FZ=0.095;const duB=FA/(R_MEAN*TAU),dtA=FZ/H;
function flatten(u0,t0,u1,t1,u2,t2,lvl,out){const p0=lift(u0,t0),p1=lift(u1,t1),p2=lift(u2,t2);const self=dint(p0,p1,p2,B10);
 if(lvl<=0||self<=0.01){out.push({verts:[p0,p1,p2],capped:lvl<=0&&self>0.01,self});return;}
 const a=(u0+u1)/2,b=(t0+t1)/2,cc=(u1+u2)/2,d=(t1+t2)/2,e=(u2+u0)/2,f=(t2+t0)/2;
 flatten(u0,t0,a,b,e,f,lvl-1,out);flatten(a,b,u1,t1,cc,d,lvl-1,out);flatten(e,f,cc,d,u2,t2,lvl-1,out);flatten(a,b,cc,d,e,f,lvl-1,out);}
let out10=0,out36=0,capped=0,maxL36=0,leaksAccepted=0,maxLeaves=0;const w36s=[];
for(const s of cusps){const au=apexU(s.u,s.t);const ah=apexU(au,Math.min(0.999,s.t+dtA));
 const leaves=[];flatten(au-duB,s.t,au,s.t,ah,s.t+dtA,5,leaves);flatten(au,s.t,au+duB,s.t,ah,s.t+dtA,5,leaves);
 if(leaves.length>maxLeaves)maxLeaves=leaves.length;
 let w36=0,w10=0;for(const lf of leaves){if(lf.self>w10)w10=lf.self;const d36=dint(lf.verts[0],lf.verts[1],lf.verts[2],B36);if(d36>w36)w36=d36;if(lf.capped)capped++;
   if(lf.self<=0.01&&d36>0.01)leaksAccepted++;}
 if(w10>0.01)out10++;if(w36>0.01)out36++;if(w36>maxL36)maxL36=w36;w36s.push(w36);}
w36s.sort((a,b)=>a-b);const p99=w36s[Math.min(w36s.length-1,Math.floor(0.99*w36s.length))];
console.log('RESULT '+JSON.stringify({pop:'top'+N+'-worst',cuspsOutlier10:out10,cuspsOutlier36:out36,frac36:+(out36/N).toFixed(3),p99Leaf36:+p99.toFixed(4),maxLeaf36:+maxL36.toFixed(4),cappedLeaves:capped,acceptedLeavesLeakingUnder36:leaksAccepted,maxLeavesPerCusp:maxLeaves}));
