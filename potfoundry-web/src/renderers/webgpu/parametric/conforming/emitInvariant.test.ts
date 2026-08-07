/**
 * emitInvariant.test.ts — TWO-SIDED unit contract for the emit-time invariant (S117 P1).
 *
 * WRITTEN BEFORE THE IMPLEMENTATION. The load-bearing half is the NEGATIVE control: 24 REAL
 * GothicArches facets that are HIGH-DIHEDRAL (160.9–166.8 deg adjacent dihedral) but CORRECT GEOMETRY
 * (real orientRuler normDeg <= 1.59 deg with the inset PASSED EXPLICITLY and swept {0.02,0.05,0.1},
 * k swept {4,8,16}, fd step h swept {2e-6,2e-5,2e-4} — every one of those 27 ruler settings under the
 * bar). *** A PREDICATE THAT REJECTS THESE IS REFUTED. *** They are asserted as a FLOOR, not only a
 * ceiling: the suite fails if the predicate flags even one of them.
 *
 * Fixtures mined by research/tools/s117MineFixtures.ts from
 *   gothicarches_ring_DS-HT_S39CTL.stl        (1,142,166 facets, 38,453.259 mm2, CEIL 168.024 deg)
 *   celtictriquetra_ring_D--H_S102.stl        (1,282,394 facets, 48,535.770 mm2, CEIL 163.374 deg)
 * The CelticTriquetra mesh is the GUARD-ON one — the pre-guard `celtictriquetra_ring_D--.stl` is
 * research-driver output, not shipping output (S116).
 */
import { describe, it, expect } from 'vitest';
import {
  checkEmitInvariant, makeEmitVerdict, DEFENSIBLE_EMIT_INVARIANT,
  type EmitInvariantOptions, type EmitVerdict,
} from './emitInvariant';
import { STYLE_REGISTRY } from '../../../../styles/registry';
import { STYLE_FUNCTIONS } from '../../../../geometry/styles';
import { baseRadius } from '../../../../geometry/profile';
import { DEFAULT_STYLE_PARAMS, type StyleId, type StyleOptions } from '../../../../geometry/types';

// ── fixture shape ────────────────────────────────────────────────────────────────────────────────
interface Fixture {
  f: number;
  v: number[];       // 9 coords, mm
  th: number[];      // 3 UNWRAPPED theta (orientOfFacet's stated precondition)
  dihDeg: number;    // max adjacent dihedral, deg (analytic-free ground truth)
  areaMm2: number;
  normDeg: number;   // real orientRuler normDeg, worst over the swept ruler settings
  apS: number;
  qP: number;
  minAltMm: number;
}

/** Call the predicate on a fixture. */
function run(x: Fixture, opts: EmitInvariantOptions, out?: EmitVerdict): EmitVerdict {
  return checkEmitInvariant(
    x.v[0], x.v[1], x.v[2], x.v[3], x.v[4], x.v[5], x.v[6], x.v[7], x.v[8],
    x.th[0], x.th[1], x.th[2], opts, out,
  );
}

// ── the analytic surfaces ────────────────────────────────────────────────────────────────────────
const TWO_PI = Math.PI * 2;
const canon = (t: number): number => { const x = t % TWO_PI; return x < 0 ? x + TWO_PI : x; };
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** Registry defaults, exactly as the campaign's probes read them (feedback_verify_registry_defaults). */
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as unknown as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

const H = 120; const RB = 40; const RT = 50; const EXPN = 1;

/** rA(theta,z) for a registry style, built from src only (no research/ dependency). */
function buildRA(styleId: StyleId): (th: number, z: number) => number {
  const fn = STYLE_FUNCTIONS[styleId];
  const opts: StyleOptions = { ...DEFAULT_STYLE_PARAMS[styleId], ...registryDefaults(styleId) } as StyleOptions;
  return (th, z) => {
    const zc = z < 0 ? 0 : z > H ? H : z;
    const tc = canon(th);
    return fn(tc, zc, baseRadius(zc, H, RB, RT, EXPN, opts), H, opts);
  };
}

/** A featureless cylinder — the synthetic surface for the T4 fixtures. */
const CYL_R = 40;
const rCyl = (): number => CYL_R;

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE GOOD SET — REAL GothicArches GEOMETRY. THE PREDICATE MUST PASS EVERY ONE.
// sigma=1  CEIL=168.024deg  mesh 1142166 facets 38453.259 mm2
// ═════════════════════════════════════════════════════════════════════════════════════════════════
const GOTHIC_GOOD: Fixture[] = [
  { f: 151304, v: [36.086532592773438, 23.810897827148438, 26.755001068115234, 36.458042144775391, 24.121116638183594, 26.582189559936523, 36.439102172851563, 24.233243942260742, 27.136533737182617],
    th: [0.58325305569815700, 0.58449578413992276, 0.58687148331128758],
    dihDeg: 160.8833, areaMm2: 1.413751e-1, normDeg: 1.5893,
    apS: 2.395160e-2, qP: 5.218096e-1, minAltMm: 8.494601e-2 },
  { f: 3558, v: [-43.226100921630859, 16.465196609497070, 57.069538116455078, -42.832370758056641, 16.261114120483398, 57.063751220703125, -43.297637939453125, 16.411935806274414, 57.644966125488281],
    th: [2.7776518690190577, 2.7787555043482843, 2.7792767184005616],
    dihDeg: 166.6291, areaMm2: 1.287169e-1, normDeg: 0.8395,
    apS: 1.486296e-2, qP: 3.043057e-1, minAltMm: 5.110077e-2 },
  { f: 1118, v: [-16.466472625732422, -43.224384307861328, 57.055728912353516, -16.262382507324219, -42.830661773681641, 57.049892425537109, -16.413480758666992, -43.295562744140625, 57.628280639648438],
    th: [-1.9347761017013103, -1.9336725987905417, -1.9331593478292806],
    dihDeg: 166.6296, areaMm2: 1.280716e-1, normDeg: 0.8395,
    apS: 1.478838e-2, qP: 3.057563e-1, minAltMm: 5.109374e-2 },
  { f: 6017, v: [16.683750152587891, 42.930183410644531, 54.697135925292969, 16.425802230834961, 42.610885620117188, 55.264778137207031, 16.630956649780273, 43.001995086669922, 55.271614074707031],
    th: [1.2001341266322980, 1.2028662862507407, 1.2017656019065124],
    dihDeg: 166.7993, areaMm2: 1.279547e-1, normDeg: 0.8370,
    apS: 1.478176e-2, qP: 3.030141e-1, minAltMm: 5.085271e-2 },
  { f: 11992, v: [7.1880702972412109, -45.595569610595703, 55.904228210449219, 7.2499003410339355, -45.188392639160156, 56.469440460205078, 7.2693948745727539, -45.630947113037109, 56.476284027099609],
    th: [-1.4144347673918869, -1.4117147817701099, -1.4128154379215947],
    dihDeg: 166.8106, areaMm2: 1.277975e-1, normDeg: 0.8395,
    apS: 1.475055e-2, qP: 3.049231e-1, minAltMm: 5.095878e-2 },
  { f: 3559, v: [-43.226100921630859, 16.465196609497070, 57.069538116455078, -43.297637939453125, 16.411935806274414, 57.644966125488281, -42.870815277099609, 16.304286956787109, 57.650726318359375],
    th: [2.7776518690190577, 2.7792767184005616, 2.7781730102514275],
    dihDeg: 166.6291, areaMm2: 1.277205e-1, normDeg: 0.8726,
    apS: 1.486844e-2, qP: 3.044454e-1, minAltMm: 5.112191e-2 },
  { f: 1117, v: [-16.466472625732422, -43.224384307861328, 57.055728912353516, -16.413480758666992, -43.295562744140625, 57.628280639648438, -16.305809020996094, -42.868759155273438, 57.634090423583984],
    th: [-1.9347761017013103, -1.9331593478292806, -1.9342629240668228],
    dihDeg: 166.6296, areaMm2: 1.270798e-1, normDeg: 0.8726,
    apS: 1.479381e-2, qP: 3.058965e-1, minAltMm: 5.111483e-2 },
  { f: 8443, v: [16.465192794799805, -43.226108551025391, 57.069583892822266, 16.412742614746094, -43.296554565429688, 57.636257171630859, 16.261112213134766, -42.832370758056641, 57.063755035400391],
    th: [-1.2068556780038102, -1.2084558052801611, -1.2079592164742410],
    dihDeg: 166.6304, areaMm2: 1.267594e-1, normDeg: 0.8394,
    apS: 1.463704e-2, qP: 3.089050e-1, minAltMm: 5.109269e-2 },
  { f: 6019, v: [16.683750152587891, 42.930183410644531, 54.697135925292969, 16.630956649780273, 43.001995086669922, 55.271614074707031, 16.573200225830078, 42.507099151611328, 54.704002380371094],
    th: [1.2001341266322980, 1.2017656019065124, 1.1990335423664598],
    dihDeg: 166.7993, areaMm2: 1.267069e-1, normDeg: 0.8695,
    apS: 1.477692e-2, qP: 3.029559e-1, minAltMm: 5.083950e-2 },
  { f: 11990, v: [7.1880702972412109, -45.595569610595703, 55.904228210449219, 7.2693948745727539, -45.630947113037109, 56.476284027099609, 7.0705108642578125, -45.172996520996094, 55.911106109619141],
    th: [-1.4144347673918869, -1.4128154379215947, -1.4155353076770791],
    dihDeg: 166.8106, areaMm2: 1.265547e-1, normDeg: 0.8721,
    apS: 1.474569e-2, qP: 3.048679e-1, minAltMm: 5.094576e-2 },
  { f: 6094, v: [16.231853485107422, 43.493339538574219, 59.461959838867188, 16.163753509521484, 43.527370452880859, 60.041091918945313, 16.129337310791016, 43.073848724365234, 59.468769073486328],
    th: [1.2136018632318315, 1.2152322260683721, 1.2125011215414354],
    dihDeg: 166.3598, areaMm2: 1.261253e-1, normDeg: 0.9362,
    apS: 1.500912e-2, qP: 3.026979e-1, minAltMm: 5.121557e-2 },
  { f: 8407, v: [16.683397293090820, -42.930664062500000, 54.700988769531250, 16.631416320800781, -43.001369476318359, 55.266613006591797, 16.426256179809570, -42.610271453857422, 55.259803771972656],
    th: [-1.2001450476294728, -1.2017514086115662, -1.2028521737202533],
    dihDeg: 166.7980, areaMm2: 1.259811e-1, normDeg: 0.8370,
    apS: 1.455395e-2, qP: 3.076576e-1, minAltMm: 5.084450e-2 },
  { f: 2337, v: [-42.933578491210938, -16.681255340576172, 54.724292755126953, -43.004257202148438, -16.629289627075195, 55.289733886718750, -42.613117218017578, -16.424148559570313, 55.282878875732422],
    th: [-2.7710076389539129, -2.7726133469494139, -2.7737139757757534],
    dihDeg: 166.7980, areaMm2: 1.259474e-1, normDeg: 0.8370,
    apS: 1.454975e-2, qP: 3.078162e-1, minAltMm: 5.085026e-2 },
  { f: 8444, v: [16.465192794799805, -43.226108551025391, 57.069583892822266, 16.305080413818359, -42.869743347167969, 57.642059326171875, 16.412742614746094, -43.296554565429688, 57.636257171630859],
    th: [-1.2068556780038102, -1.2073522060519957, -1.2084558052801611],
    dihDeg: 166.6304, areaMm2: 1.257763e-1, normDeg: 0.8726,
    apS: 1.464219e-2, qP: 3.090424e-1, minAltMm: 5.111305e-2 },
  { f: 14423, v: [45.521194458007813, -7.0181155204772949, 54.708225250244141, 45.556362152099609, -7.0983133316040039, 55.272644042968750, 45.115074157714844, -7.0804295539855957, 55.265834808349609],
    th: [-0.15296809547230020, -0.15457098275074529, -0.15567173701265136],
    dihDeg: 166.7977, areaMm2: 1.257147e-1, normDeg: 0.8371,
    apS: 1.452296e-2, qP: 3.083055e-1, minAltMm: 5.084378e-2 },
  { f: 1082, v: [-16.683095932006836, -42.931072235107422, 54.704254150390625, -16.426076889038086, -42.610511779785156, 55.261753082275391, -16.631237030029297, -43.001613616943359, 55.268554687500000],
    th: [-1.9414382972826305, -1.9387349236569369, -1.9398357079829611],
    dihDeg: 166.7977, areaMm2: 1.256874e-1, normDeg: 0.8371,
    apS: 1.451992e-2, qP: 3.083607e-1, minAltMm: 5.084302e-2 },
  { f: 13603, v: [44.925872802734375, 5.6890864372253418, 45.415821075439453, 44.887020111083984, 5.6032481193542480, 44.824752807617188, 44.505008697509766, 5.6855087280273438, 45.408561706542969],
    th: [0.12596229256991337, 0.12418763711712869, 0.12706162851072703],
    dihDeg: 166.3772, areaMm2: 1.255372e-1, normDeg: 0.8079,
    apS: 1.495269e-2, qP: 2.896514e-1, minAltMm: 5.000542e-2 },
  { f: 8406, v: [16.683397293090820, -42.930664062500000, 54.700988769531250, 16.572851181030273, -42.507568359375000, 54.707824707031250, 16.631416320800781, -43.001369476318359, 55.266613006591797],
    th: [-1.2001450476294728, -1.1990444060401315, -1.2017514086115662],
    dihDeg: 166.7980, areaMm2: 1.247561e-1, normDeg: 0.8698,
    apS: 1.454882e-2, qP: 3.075874e-1, minAltMm: 5.082973e-2 },
  { f: 2338, v: [-42.933578491210938, -16.681255340576172, 54.724292755126953, -42.510459899902344, -16.570728302001953, 54.731178283691406, -43.004257202148438, -16.629289627075195, 55.289733886718750],
    th: [-2.7710076389539129, -2.7699071033233205, -2.7726133469494139],
    dihDeg: 166.7980, areaMm2: 1.247219e-1, normDeg: 0.8695,
    apS: 1.454515e-2, qP: 3.077610e-1, minAltMm: 5.083766e-2 },
  { f: 14422, v: [45.521194458007813, -7.0181155204772949, 54.708225250244141, 45.099506378173828, -6.9022917747497559, 54.715065002441406, 45.556362152099609, -7.0983133316040039, 55.272644042968750],
    th: [-0.15296809547230020, -0.15186742367500713, -0.15457098275074529],
    dihDeg: 166.7977, areaMm2: 1.244921e-1, normDeg: 0.8695,
    apS: 1.451852e-2, qP: 3.082532e-1, minAltMm: 5.083170e-2 },
  { f: 1081, v: [-16.683095932006836, -42.931072235107422, 54.704254150390625, -16.631237030029297, -43.001613616943359, 55.268554687500000, -16.572555541992188, -42.507972717285156, 54.711082458496094],
    th: [-1.9414382972826305, -1.9398357079829611, -1.9425389909280331],
    dihDeg: 166.7977, areaMm2: 1.244646e-1, normDeg: 0.8696,
    apS: 1.451524e-2, qP: 3.082993e-1, minAltMm: 5.082976e-2 },
  { f: 13604, v: [44.925872802734375, 5.6890864372253418, 45.415821075439453, 44.483318328857422, 5.5031957626342773, 44.832004547119141, 44.887020111083984, 5.6032481193542480, 44.824752807617188],
    th: [0.12596229256991337, 0.12308828090349824, 0.12418763711712869],
    dihDeg: 166.3772, areaMm2: 1.240863e-1, normDeg: 0.8433,
    apS: 1.494776e-2, qP: 2.895575e-1, minAltMm: 4.998909e-2 },
  { f: 6505, v: [36.138423919677734, 26.628049850463867, 40.670188903808594, 36.148559570312500, 26.528894424438477, 40.063278198242188, 35.786785125732422, 26.429645538330078, 40.662639617919922],
    th: [0.63502202743339708, 0.63310764134736541, 0.63612036627625179],
    dihDeg: 165.9020, areaMm2: 1.237514e-1, normDeg: 0.7881,
    apS: 1.523457e-2, qP: 2.796710e-1, minAltMm: 4.959734e-2 },
  { f: 6095, v: [16.231853485107422, 43.493339538574219, 59.461959838867188, 15.970087051391602, 43.151348114013672, 60.034309387207031, 16.163753509521484, 43.527370452880859, 60.041091918945313],
    th: [1.2136018632318315, 1.2163330765292362, 1.2152322260683721],
    dihDeg: 166.3598, areaMm2: 1.235333e-1, normDeg: 0.8900,
    apS: 1.501142e-2, qP: 3.027126e-1, minAltMm: 5.122074e-2 },
];

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE BAD SET — REAL CelticTriquetra facets (GUARD-ON mesh). sigma=1  CEIL=163.374deg
// First 6: minority parameter winding (FOLD). Next 6: >=175 deg with sub-2um arc altitude (BLADE).
// Last 6: over-ceiling but parameter-clean — these are the ones only T4 can see, and the test says so.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
const CT_FOLD: Fixture[] = [
  { f: 1277656, v: [-40.388629913330078, 21.067455291748047, 66.895515441894531, -41.615863800048828, 21.601696014404297, 66.961761474609375, -41.190055847167969, 22.093637466430664, 66.513908386230469],
    th: [2.6608002220881040, 2.6628028614983092, 2.6492641823116276],
    dihDeg: 179.2829, areaMm2: 5.090888e-1, normDeg: 83.0580,
    apS: -1.034696e-7, qP: -1.204596e-6, minAltMm: 2.682544e-7 },
  { f: 543123, v: [9.4031982421875000, 45.146129608154297, 77.879997253417969, 9.4159421920776367, 45.207317352294922, 77.879997253417969, 9.1934328079223633, 45.252166748046875, 77.869140625000000],
    th: [1.3654486060058408, 1.3654486156207379, 1.3703641046483135],
    dihDeg: 173.9739, areaMm2: 7.101312e-3, normDeg: 94.7580,
    apS: -2.409024e-9, qP: -3.234969e-7, minAltMm: 2.121170e-8 },
  { f: 518832, v: [-47.636837005615234, 14.663729667663574, 92.678222656250000, -46.976772308349609, 14.460545539855957, 92.678222656250000, -46.983150482177734, 14.445682525634766, 92.667404174804688],
    th: [2.8429740382574891, 2.8429740541336872, 2.8433012251873735],
    dihDeg: 91.6308, areaMm2: 6.692878e-3, normDeg: 91.6608,
    apS: -4.240908e-9, qP: -7.770891e-5, minAltMm: 4.361989e-7 },
  { f: 518831, v: [-46.976772308349609, 14.460545539855957, 92.678222656250000, -47.636837005615234, 14.663729667663574, 92.678222656250000, -46.971832275390625, 14.472702026367188, 92.683471679687500],
    th: [2.8429740541336872, 2.8429740382574891, 2.8427081008645319],
    dihDeg: 92.6705, areaMm2: 4.864227e-3, normDeg: 92.6882,
    apS: -2.057608e-9, qP: -7.126512e-5, minAltMm: 2.909642e-7 },
  { f: 557192, v: [28.458667755126953, -38.027843475341797, 93.720001220703125, 28.421220779418945, -37.977802276611328, 93.720001220703125, 28.534713745117188, -37.891876220703125, 93.713043212890625],
    th: [-0.92834310238771656, -0.92834306771556219, -0.92534209360028286],
    dihDeg: 179.6115, areaMm2: 4.453809e-3, normDeg: 85.2502,
    apS: -5.724316e-9, qP: -1.950736e-6, minAltMm: 8.029357e-8 },
  { f: 508614, v: [-48.489234924316406, 8.3816804885864258, 88.462097167968750, -48.740718841552734, 8.4251508712768555, 88.462097167968750, -48.493343353271484, 8.3515653610229492, 88.453796386718750],
    th: [2.9704275262687858, 2.9704275312990576, 2.9710448103155089],
    dihDeg: 168.7646, areaMm2: 4.018160e-3, normDeg: 102.1514,
    apS: -1.029120e-9, qP: -7.167552e-6, minAltMm: 6.525865e-8 },
];

const CT_BLADE: Fixture[] = [
  { f: 1277655, v: [-40.079513549804688, 21.407306671142578, 66.572067260742188, -40.388629913330078, 21.067455291748047, 66.895515441894531, -41.190055847167969, 22.093637466430664, 66.513908386230469],
    th: [2.6510223544570124, 2.6608002220881040, 2.6492641823116276],
    dihDeg: 179.9704, areaMm2: 3.642665e-1, normDeg: 82.8189,
    apS: 1.791908e-7, qP: 2.913350e-6, minAltMm: 5.490020e-7 },
  { f: 348044, v: [-46.953948974609375, 14.513811111450195, 92.715461730957031, -47.621894836425781, 14.718442916870117, 92.715843200683594, -47.878986358642578, 13.910131454467773, 93.184280395507813],
    th: [2.8418015691636320, 2.8418367449986990, 2.8588493139157714],
    dihDeg: 178.4005, areaMm2: 3.384390e-1, normDeg: 92.2736,
    apS: 2.477815e-4, qP: 1.835533e-3, minAltMm: 5.124308e-4 },
  { f: 82623, v: [-45.836311340332031, 14.732624053955078, 72.512573242187500, -45.112400054931641, 14.469099998474121, 72.532638549804688, -46.067367553710938, 14.172807693481445, 72.940704345703125],
    th: [2.8306037857349402, 2.8312236394294601, 2.8431287606789306],
    dihDeg: 179.5258, areaMm2: 2.857289e-1, normDeg: 85.7954,
    apS: 3.368120e-4, qP: 4.294798e-3, minAltMm: 9.138709e-4 },
  { f: 348042, v: [-47.621894836425781, 14.718442916870117, 92.715843200683594, -46.953948974609375, 14.513811111450195, 92.715461730957031, -46.728515625000000, 15.183015823364258, 92.319252014160156],
    th: [2.8418367449986990, 2.8418015691636320, 2.8274333742732094],
    dihDeg: 178.1436, areaMm2: 2.827446e-1, normDeg: 84.6023,
    apS: 2.087551e-4, qP: 2.181334e-3, minAltMm: 5.127426e-4 },
  { f: 743242, v: [38.129230499267578, -28.615694046020508, 78.110343933105469, 36.902084350585938, -28.279954910278320, 77.849914550781250, 39.228694915771484, -28.658817291259766, 78.439689636230469],
    th: [-0.64381610888764973, -0.65388398048621621, -0.63094135049428646],
    dihDeg: 179.0108, areaMm2: 1.758856e-1, normDeg: 55.9137,
    apS: 8.839640e-4, qP: 3.977930e-3, minAltMm: 1.424838e-3 },
  { f: 834891, v: [-27.479804992675781, -40.435302734375000, 81.939048767089844, -27.875385284423828, -39.927612304687500, 81.596656799316406, -28.170183181762695, -38.772930145263672, 81.082092285156250],
    th: [-2.1676989585675992, -2.1802783003445114, -2.1991148658830362],
    dihDeg: 177.8714, areaMm2: 1.752349e-1, normDeg: 88.9938,
    apS: 5.673497e-4, qP: 1.286107e-3, minAltMm: 6.490581e-4 },
];

/** Over-ceiling but PARAMETER-CLEAN: the zero-eval core cannot see these; T4 must. */
const CT_OVERCEIL_PARAM_CLEAN: Fixture[] = [
  { f: 506735, v: [-41.962268829345703, 23.068952560424805, 98.374420166015625, -42.170829772949219, 22.729759216308594, 98.626510620117188, -43.750976562500000, 23.129396438598633, 98.887069702148438],
    th: [2.6389378280102327, 2.6472397910892238, 2.6552807011532922],
    dihDeg: 178.3497, areaMm2: 3.666281e-1, normDeg: 85.9646,
    apS: 3.295810e-3, qP: 2.568003e-2, minAltMm: 6.990343e-3 },
  { f: 981389, v: [-42.160957336425781, 22.748023986816406, 98.626266479492188, -41.962268829345703, 23.068952560424805, 98.374420166015625, -43.750976562500000, 23.129396438598633, 98.887069702148438],
    th: [2.6468064010896319, 2.6389378280102327, 2.6552807011532922],
    dihDeg: 178.3497, areaMm2: 3.526006e-1, normDeg: 93.6174,
    apS: 1.987241e-3, qP: 1.548403e-2, minAltMm: 4.214897e-3 },
  { f: 281158, v: [-46.935329437255859, 14.556970596313477, 92.746055603027344, -47.610111236572266, 14.762374877929688, 92.752540588378906, -46.728515625000000, 15.183015823364258, 92.319252014160156],
    th: [2.8408505647936879, 2.8409248909017677, 2.8274333742732094],
    dihDeg: 178.5152, areaMm2: 2.769212e-1, normDeg: 95.2897,
    apS: 1.364872e-3, qP: 1.497501e-2, minAltMm: 3.435178e-3 },
  { f: 136700, v: [-42.243228912353516, 18.419298171997070, 69.198310852050781, -43.638294219970703, 18.883975982666016, 69.299003601074219, -43.468791961669922, 19.140878677368164, 69.084762573242188],
    th: [2.7304170505829797, 2.7331856126392813, 2.7268042219683388],
    dihDeg: 177.6559, areaMm2: 2.675153e-1, normDeg: 84.0900,
    apS: 1.162442e-3, qP: 5.920923e-2, minAltMm: 6.303767e-3 },
  { f: 90550, v: [-46.728515625000000, 15.183015823364258, 92.319252014160156, -46.935199737548828, 14.566525459289551, 92.702964782714844, -47.621170043945313, 14.725297927856445, 92.745460510253906],
    th: [2.8274333742732094, 2.8406640821976663, 2.8417010595558505],
    dihDeg: 178.3144, areaMm2: 2.645739e-1, normDeg: 94.6602,
    apS: 4.057258e-3, qP: 4.146481e-2, minAltMm: 9.855436e-3 },
  { f: 67280, v: [-47.621170043945313, 14.725297927856445, 92.745460510253906, -46.931327819824219, 14.574400901794434, 92.714408874511719, -46.728515625000000, 15.183015823364258, 92.319252014160156],
    th: [2.8417010595558505, 2.8404876720013172, 2.8274333742732094],
    dihDeg: 178.3144, areaMm2: 2.645696e-1, normDeg: 91.8293,
    apS: 1.829821e-3, qP: 1.870085e-2, minAltMm: 4.444825e-3 },
];

// ── synthetic fixtures, one per term, on the cylinder r = 40 ────────────────────────────────────
/** A well-shaped facet on the cylinder, CCW in (arc,z), outward-wound in 3D. */
function cylFacet(th0: number, z0: number, dth: number, dz: number, dr = 0): Fixture {
  const R = CYL_R + dr;
  const a = [R * Math.cos(th0), R * Math.sin(th0), z0];
  const b = [R * Math.cos(th0 + dth), R * Math.sin(th0 + dth), z0];
  const c = [R * Math.cos(th0 + dth / 2), R * Math.sin(th0 + dth / 2), z0 + dz];
  return {
    f: -1, v: [...a, ...b, ...c], th: [th0, th0 + dth, th0 + dth / 2],
    dihDeg: 0, areaMm2: 0, normDeg: 0, apS: 0, qP: 0, minAltMm: 0,
  };
}
/** The same facet with B and C swapped ⇒ parameter winding reversed AND 3D normal inverted. */
function reversed(x: Fixture): Fixture {
  return {
    ...x,
    v: [x.v[0], x.v[1], x.v[2], x.v[6], x.v[7], x.v[8], x.v[3], x.v[4], x.v[5]],
    th: [x.th[0], x.th[2], x.th[1]],
  };
}

const CORE: EmitInvariantOptions = { ...DEFENSIBLE_EMIT_INVARIANT };
const FULL = (): EmitInvariantOptions => ({
  ...DEFENSIBLE_EMIT_INVARIANT, rA: buildRA('GothicArches'), zMin: 0, zMax: H,
});
const CYLFULL = (rA: (th: number, z: number) => number = rCyl): EmitInvariantOptions => ({
  ...DEFENSIBLE_EMIT_INVARIANT, rA, zMin: 0, zMax: H,
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('emitInvariant — THE FLOOR: real GothicArches geometry must PASS', () => {
  it('passes all 24 high-dihedral CORRECT Gothic facets with the zero-eval core', () => {
    const rejected = GOTHIC_GOOD.filter((x) => !run(x, CORE).ok);
    expect(rejected.map((x) => x.f)).toEqual([]);
  });

  it('passes all 24 with T4 ON against the REAL GothicArches rA (orientation + position)', () => {
    const o = FULL();
    const bad = GOTHIC_GOOD.map((x) => ({ f: x.f, r: run(x, o) })).filter((e) => !e.r.ok);
    expect(bad.map((e) => `${e.f}:${e.r.reason}`)).toEqual([]);
  });

  it('reproduces the mined qP / apS / minAlt to 1e-6 relative (the scalars are the same quantity)', () => {
    for (const x of GOTHIC_GOOD) {
      const r = run(x, CORE);
      expect(Math.abs(r.qP / x.qP - 1)).toBeLessThan(1e-6);
      expect(Math.abs(r.apSMm2 / x.apS - 1)).toBeLessThan(1e-6);
      expect(Math.abs(r.minAltMm / x.minAltMm - 1)).toBeLessThan(1e-6);
    }
  });

  it('the FLOOR is LOAD-BEARING: move the blade bar into their population and every one is rejected', () => {
    // A pass-everything predicate would satisfy the two assertions above. This one cannot: at a 0.1 mm
    // arc-altitude bar the same 24 facets are all refused, so the passes above are a real result.
    const rejected = GOTHIC_GOOD.filter((x) => !run(x, { ...CORE, minAltMm: 0.1 }).ok);
    expect(rejected.length).toBe(GOTHIC_GOOD.length);
  });

  it('the GOOD and BLADE populations are separated by >30x in arc-space altitude', () => {
    const goodMin = Math.min(...GOTHIC_GOOD.map((x) => run(x, CORE).minAltMm));
    const bladeMax = Math.max(...CT_BLADE.map((x) => run(x, CORE).minAltMm));
    expect(goodMin / bladeMax).toBeGreaterThan(30);
    // and the 2e-3 mm bar sits strictly between them
    expect(bladeMax).toBeLessThan(2e-3);
    expect(goodMin).toBeGreaterThan(2e-3);
  });

  it('their real normDeg is under the T4 bar — the fixtures are GOOD by the independent ruler', () => {
    for (const x of GOTHIC_GOOD) expect(x.normDeg).toBeLessThanOrEqual(10);
    // and they really are the hard case: every one is above the 45 deg dihedral bar
    for (const x of GOTHIC_GOOD) expect(x.dihDeg).toBeGreaterThan(45);
  });
});

describe('emitInvariant — THE CEILING: real CelticTriquetra defects must be REJECTED', () => {
  it('rejects every mined FOLD facet', () => {
    const passed = CT_FOLD.filter((x) => run(x, CORE).ok);
    expect(passed.map((x) => x.f)).toEqual([]);
  });

  it('rejects every mined BLADE facet (sub-2um arc-space altitude)', () => {
    const passed = CT_BLADE.filter((x) => run(x, CORE).ok);
    expect(passed.map((x) => x.f)).toEqual([]);
  });

  it('is HONEST about its blind spot: parameter-clean over-ceiling facets need T4', () => {
    // The zero-eval core does NOT see these — asserted as a FLOOR so nobody can quote the core as total.
    for (const x of CT_OVERCEIL_PARAM_CLEAN) expect(run(x, CORE).ok).toBe(true);
    // T4 against the real CelticTriquetra rA does see them.
    const o: EmitInvariantOptions = {
      ...DEFENSIBLE_EMIT_INVARIANT, rA: buildRA('CelticTriquetra'), zMin: 0, zMax: H,
    };
    const missed = CT_OVERCEIL_PARAM_CLEAN.filter((x) => run(x, o).ok);
    expect(missed.map((x) => x.f)).toEqual([]);
  });
});

describe('emitInvariant — per-term synthetic contracts', () => {
  it('T1 DEGENERACY: a footprint collinear in (arc,z) is rejected as degenerate', () => {
    // three distinct 3D points whose (rbar*theta, z) images are collinear: same z, spread in theta,
    // and the RADIUS varies so the 3D area is real. The degeneracy pole S116 measured.
    const th = [0.5, 0.5001, 0.5002];
    const rr = [40, 41.5, 43];
    const v: number[] = [];
    for (let i = 0; i < 3; i += 1) v.push(rr[i] * Math.cos(th[i]), rr[i] * Math.sin(th[i]), 70);
    const r = checkEmitInvariant(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], th[0], th[1], th[2], CORE);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('degenerate');
  });

  it('T1 is SCALE-FREE: qP is invariant when the whole footprint is scaled 10x', () => {
    const small = cylFacet(0.4, 60, 2e-4, 8e-3);
    const big = cylFacet(0.4, 60, 2e-3, 8e-2);
    const rs = run(small, CORE); const rb = run(big, CORE);
    expect(Math.abs(rs.qP / rb.qP - 1)).toBeLessThan(2e-3);
    // …while the arc-space altitude, an absolute LENGTH, scales with it.
    expect(rb.minAltMm / rs.minAltMm).toBeGreaterThan(9.5);
    expect(rb.minAltMm / rs.minAltMm).toBeLessThan(10.5);
  });

  it('T2 FOLD: a well-shaped footprint with the minority winding is rejected as fold, not degenerate', () => {
    const f = reversed(cylFacet(0.4, 60, 0.02, 0.5));
    const r = run(f, CORE);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fold');
    expect(Math.abs(r.qP)).toBeGreaterThan(CORE.tauQ ?? 0);   // NOT a degeneracy — the shape is fine
  });

  it('T2 FOLD: sigma = -1 flips which winding is the fold', () => {
    const fwd = cylFacet(0.4, 60, 0.02, 0.5);
    const rev = reversed(fwd);
    expect(run(fwd, { ...CORE, sigma: -1 }).reason).toBe('fold');
    expect(run(rev, { ...CORE, sigma: -1 }).ok).toBe(true);
  });

  it('T3 BLADE: a WELL-SHAPED but sub-bar triangle is rejected as blade, not degenerate', () => {
    // arc span 2.5e-5 rad * 40 mm = 1.0e-3 mm; altitude ~ 8.7e-4 mm < 2e-3 mm bar. qP ~ 1 (equilateral).
    const f = cylFacet(0.4, 60, 2.5e-5, 8.66e-4);
    const r = run(f, CORE);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('blade');
    expect(Math.abs(r.qP)).toBeGreaterThan(0.5);     // the SHAPE is excellent — only the SCALE is illegal
    expect(r.minAltMm).toBeLessThan(2e-3);
  });

  it('T3 BLADE: the same shape one decade larger PASSES (the bar is absolute, not a shape bar)', () => {
    const f = cylFacet(0.4, 60, 2.5e-4, 8.66e-3);
    expect(run(f, CORE).ok).toBe(true);
  });

  it('T4 ORIENTATION: an inverted-normal facet on the cylinder is rejected as orientation', () => {
    // Reverse the 3D winding only, keeping the PARAMETER winding legal by relabelling with sigma=-1,
    // so T2 cannot claim it and the orientation term is the one under test.
    const f = reversed(cylFacet(0.4, 60, 0.02, 0.5));
    const r = run(f, { ...CYLFULL(), sigma: -1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('orientation');
    expect(r.normDeg).toBeGreaterThan(90);
  });

  it('T4 POSITION: a facet offset 0.05 mm off the cylinder is rejected as position', () => {
    const f = cylFacet(0.4, 60, 0.02, 0.5, 0.05);
    const r = run(f, CYLFULL());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('position');
    expect(r.posMm).toBeGreaterThan(0.04);
  });

  it('T4 POSITION: the same facet ON the cylinder passes, and its position residual is the sagitta', () => {
    const f = cylFacet(0.4, 60, 0.02, 0.5);
    const r = run(f, CYLFULL());
    expect(r.ok).toBe(true);
    expect(r.posMm).toBeLessThan(0.01);
    expect(r.posMm).toBeGreaterThan(0);
  });

  it('rejects a 3D-degenerate facet without emitting NaN', () => {
    const r = checkEmitInvariant(40, 0, 60, 40, 0, 61, 40, 0, 62, 0, 0, 0, CORE);
    expect(r.ok).toBe(false);
    expect(Number.isFinite(r.qP)).toBe(true);
    expect(Number.isFinite(r.minAltMm)).toBe(true);
  });
});

describe('emitInvariant — cost, purity and the hot-path contract', () => {
  it('the core terms cost ZERO analytic evaluations', () => {
    let calls = 0;
    const rA = (): number => { calls += 1; return rCyl(); };
    // a facet the core rejects: rA must never be touched
    run(reversed(cylFacet(0.4, 60, 0.02, 0.5)), { ...CYLFULL(rA) });
    expect(calls).toBe(0);
    // and with no rA supplied at all, a PASSING facet still costs nothing
    calls = 0;
    run(cylFacet(0.4, 60, 0.02, 0.5), CORE);
    expect(calls).toBe(0);
  });

  it('T4 costs a bounded, stated number of analytic evaluations per triangle', () => {
    let calls = 0;
    const rA = (): number => { calls += 1; return CYL_R; };
    run(cylFacet(0.4, 60, 0.02, 0.5), CYLFULL(rA));
    expect(calls).toBe(42);   // 7 inset stencil points x 5 evals + 7 un-inset points x 1 eval
  });

  it('is allocation-free when given a scratch verdict: the same object comes back', () => {
    const out = makeEmitVerdict();
    const r1 = run(GOTHIC_GOOD[0], CORE, out);
    expect(r1).toBe(out);
    const r2 = run(CT_FOLD[0], CORE, out);
    expect(r2).toBe(out);
    expect(r2.ok).toBe(false);   // the scratch is fully rewritten, never stale
  });

  it('is pure: identical inputs give identical outputs', () => {
    const a = run(GOTHIC_GOOD[3], FULL());
    const b = run(GOTHIC_GOOD[3], FULL());
    expect(a.ok).toBe(b.ok);
    expect(a.qP).toBe(b.qP);
    expect(a.normDeg).toBe(b.normDeg);
    expect(a.posMm).toBe(b.posMm);
  });

  it('handles a seam-spanning facet given UNWRAPPED theta (the stated precondition)', () => {
    // theta continues past 2*pi rather than wrapping to 0 — the emitter always knows the true branch.
    const th0 = TWO_PI - 0.01;
    const f = cylFacet(th0, 60, 0.02, 0.5);
    expect(f.th[1]).toBeGreaterThan(TWO_PI);
    const r = run(f, CYLFULL());
    expect(r.ok).toBe(true);
  });
});

describe('emitInvariant — the threshold knobs are real', () => {
  it('tauQ = 0 disables T1 (and only T1)', () => {
    const th = [0.5, 0.5001, 0.5002];
    const rr = [40, 41.5, 43];
    const v: number[] = [];
    for (let i = 0; i < 3; i += 1) v.push(rr[i] * Math.cos(th[i]), rr[i] * Math.sin(th[i]), 70);
    const r = checkEmitInvariant(
      v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], th[0], th[1], th[2],
      { ...CORE, tauQ: 0, minAltMm: 0 },
    );
    expect(r.reason).not.toBe('degenerate');
  });

  it('minAltMm = 0 disables T3', () => {
    const f = cylFacet(0.4, 60, 2.5e-5, 8.66e-4);
    expect(run(f, { ...CORE, minAltMm: 0 }).ok).toBe(true);
  });

  it('the defensible defaults are the S117 ones', () => {
    expect(DEFENSIBLE_EMIT_INVARIANT.tauQ).toBe(0.005);
    expect(DEFENSIBLE_EMIT_INVARIANT.minAltMm).toBe(2e-3);
    expect(DEFENSIBLE_EMIT_INVARIANT.inset).toBe(0.05);
    expect(DEFENSIBLE_EMIT_INVARIANT.fdStepMm).toBe(2e-6);
  });
});
