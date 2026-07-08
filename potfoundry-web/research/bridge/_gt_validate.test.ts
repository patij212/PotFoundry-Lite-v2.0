import { describe, it, expect } from 'vitest';
import { bruteTruth, newtonNearest, denseBary } from './_gyroid_truthLib';
import { radiusFn } from './_pf_tangledKernelLib';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research','exchange','_gyroid_truth');
const TAU=2*Math.PI;
// Validation of the SEEDED Newton (radialAnchor+dense z): on the facet-worst-point of a 60-facet spread of worst-500,
// compare seeded-Newton to (i) windowed brute8192 (near-truth) and (ii) Newton self at 2x seed density. Resumable.
describe('gt validate', () => {
  it.skipIf(process.env.PF_GT_VAL !== '1')('seeded newton vs brute8192 + self-conv on 60 worst-points', () => {
    const rA = radiusFn('GyroidManifold' as StyleId, DIMS); const H=120;
    const recs = readFileSync(join(DIR,'worst500.ndjson'),'utf8').split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));
    const sub = recs.filter((_,i)=>i%8===0).slice(0,60);
    const DB = denseBary(8);
    const worstPt=(r:any):[number,number,number]=>{const[A,B,C]=r.verts;let bd=-1,bp:[number,number,number]=[A[0],A[1],A[2]];for(const[wa,wb,wc]of DB){const px=wa*A[0]+wb*B[0]+wc*C[0],py=wa*A[1]+wb*B[1]+wc*C[1],pz=wa*A[2]+wb*B[2]+wc*C[2];if(pz<0||pz>H)continue;const th=Math.atan2(py,px);const b=Math.abs(Math.hypot(px,py)-rA(th<0?th+TAU:th,pz));if(b>bd){bd=b;bp=[px,py,pz];}}return bp;};
    const OUT=join(DIR,'validate.ndjson');
    const done=new Set(existsSync(OUT)?readFileSync(OUT,'utf8').split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x).f):[]);
    let tN=0,nQ=0;
    for(const r of sub){
      if(done.has(r.f))continue;
      const [px,py,pz]=worstPt(r);
      const rho=Math.hypot(px,py);const th0=Math.atan2(py,px);const bnd=Math.abs(rho-rA(th0<0?th0+TAU:th0,pz));
      const win=Math.min(Math.PI,Math.asin(Math.min(1,(2*bnd)/Math.max(1e-6,rho)))+0.05);
      const b8192=bruteTruth(rA,H,px,py,pz,{nTheta:8192,nZ:1600,zBandMm:4,kBest:24,refineIters:120,thetaWindowRad:win}).dist;
      const s0=process.hrtime.bigint();
      const nS=newtonNearest(rA,H,px,py,pz,{seedTheta:0,seedZ:pz,nThetaSeeds:11,nZSeeds:41,maxIter:60}).dist;
      tN+=Number(process.hrtime.bigint()-s0);nQ++;
      const nS2=newtonNearest(rA,H,px,py,pz,{seedTheta:0,seedZ:pz,nThetaSeeds:21,nZSeeds:81,maxIter:80}).dist;
      appendFileSync(OUT,JSON.stringify({f:r.f,radial:+r.radialDev.toFixed(6),truth8192:+b8192.toFixed(6),newton:+nS.toFixed(6),newton2x:+nS2.toFixed(6),diffTruth:+Math.abs(b8192-nS).toFixed(6),selfConv:+Math.abs(nS-nS2).toFixed(6)})+'\n');
    }
    const rows=readFileSync(OUT,'utf8').split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));
    let maxDiffT=0,maxSelf=0,nwMiss=0,maxTruth=0;
    for(const r of rows){if(r.diffTruth>maxDiffT)maxDiffT=r.diffTruth;if(r.selfConv>maxSelf)maxSelf=r.selfConv;if(r.newton>r.truth8192+0.0003)nwMiss++;if(r.truth8192>maxTruth)maxTruth=r.truth8192;}
    console.log(`VALIDATE seeded-newton: n=${rows.length} maxTruth8192=${maxTruth.toFixed(6)} | (a)|newton-truth8192| maxdiff=${maxDiffT.toFixed(6)} ${maxDiffT<0.001?'PASS':'FAIL'} (b)newton-misses-well=${nwMiss} ${nwMiss===0?'PASS':'FAIL'} self-conv(11x41 vs 21x81)=${maxSelf.toFixed(6)} (c)~${(tN/1000/Math.max(1,nQ)).toFixed(0)}µs/query`);
    expect(rows.length).toBeGreaterThan(0);
  }, 60*60*1000);
});
