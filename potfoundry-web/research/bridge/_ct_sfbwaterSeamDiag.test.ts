// Diagnose FIXB seam serration: is the θ=0 seam a locked mesh edge (zero serration) or a bridged sheet (9.5mm)?
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, buildInhouseMetricMesh, buildMeshUt } from './labkit';
import type { StyleId } from '../../src/geometry/types';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }; const H = 120, TAU = 2*Math.PI;
const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;
describe('seamDiag', () => {
  it.skipIf(process.env.PF_CT_SFBWATER !== '1')('FIXB seam edge check', () => {
    const rA = buildRadiusFn('SuperformulaBlossom' as StyleId, {}, DIMS);
    const nSeam = 200; const inj: number[] = []; for (let i=0;i<=nSeam;i++){ inj.push(1e-6, i/nSeam); }
    const cE: number[] = []; for(let i=0;i<nSeam;i++) cE.push(i,i+1);
    const km = buildInhouseMetricMesh(rA, H, { ...BASE, maxPoints: 900_000, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true, injectedPoints: inj, constraintEdges: cE, guardRecoveryManifold: true, recoveryRobust: true });
    const mu = buildMeshUt(Array.from(km.ut), Array.from(km.indices), rA, H);
    const ut = Array.from(km.ut); const nV = ut.length/2;
    // for each vertex with u<3e-3 or u>1-3e-3, radial residual vs its OWN (u,t) rA
    let mx = 0, cnt = 0; let mxAt = '';
    for (let i=0;i<nV;i++){ const u=((ut[2*i]%1)+1)%1; if(u<3e-3||u>1-3e-3){ const z=ut[2*i+1]*H; const th=u*TAU; const r=rA(th,z); const rx=Math.hypot(mu.xyz[3*i]-r*Math.cos(th), mu.xyz[3*i+1]-r*Math.sin(th), mu.xyz[3*i+2]-z); cnt++; if(rx>mx){mx=rx; mxAt=`u=${u.toFixed(5)} t=${ut[2*i+1].toFixed(3)} rx=${rx.toFixed(3)}`;} } }
    console.log(`SEAM: nSeamVtx=${cnt} maxRadialResidual=${mx.toFixed(4)} at ${mxAt} | constraint rec=${km.constraint?.recovered}/${km.constraint?.requested}`);
    expect(1).toBe(1);
  }, 900000);
});
